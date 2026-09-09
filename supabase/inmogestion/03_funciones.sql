-- =====================================================================
-- INMOGESTION dentro del panel de Inmobiliaria Ramirez
-- Fase 4-6 — Funciones (RPC) para las operaciones multi-tabla
--
-- Supabase no tiene transacciones del lado del cliente: toda operacion
-- que toca varias tablas (alta de contrato + cuotas, cobro + imputacion
-- + recibo + caja, liquidacion) vive en una funcion PL/pgSQL, que corre
-- entera o no corre.
--
-- Reglas de InmoGestion respetadas:
--   * Montos en centavos, enteros (bigint). round() sobre bigint.
--   * Bajas logicas: anular, nunca DELETE.
--   * Mensajes de error en español rioplatense, con voseo.
--
-- Todas son SECURITY INVOKER (corren con permisos de quien llama), asi
-- que la RLS de 02_rls.sql sigue aplicando: solo un usuario del panel
-- autenticado puede ejecutarlas.
--
-- Correr despues de 01_schema.sql y 02_rls.sql. Es idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

create or replace function ig_config_num(p_clave text, p_default numeric)
returns numeric language sql stable as $$
  select coalesce((select nullif(valor,'')::numeric from public.config where clave = p_clave), p_default);
$$;

-- Proximo numero de recibo: lee y avanza el contador de config.
create or replace function ig_proximo_recibo()
returns integer language plpgsql as $$
declare v_num integer;
begin
  update public.config
     set valor = ((coalesce(nullif(valor,''),'1')::int) + 1)::text
   where clave = 'proximo_recibo'
   returning (valor::int - 1) into v_num;
  if v_num is null then
    insert into public.config (clave, valor, descripcion)
      values ('proximo_recibo','2','Proximo numero de recibo a emitir');
    v_num := 1;
  end if;
  return v_num;
end $$;

-- ---------------------------------------------------------------------
-- Generacion de cuotas de un contrato
--   Reglas: reglas-negocio-alquileres.md secciones 3, 4, 4.4, 4.5
--   - Una cuota por periodo mensual entre inicio y fin.
--   - Primera cuota: vence en el primer dia_vencimiento posterior al
--     inicio; monto completo, sin prorratear.
--   - Sigue mes a mes hasta que una cuota tenga fecha_vencimiento >=
--     fecha_fin: esa es la ultima, completa.
--   - monto = monto_inicial (o monto_actual si el contrato ya venia en
--     curso) salvo ajuste vigente antes de su vencimiento.
--   - Ajuste 'porcentaje': compuesto sobre el monto vigente.
--   - Ajuste 'indice' coeficiente: monto_base * valor_fecha / valor_base.
--     Si falta el valor del indice para esa fecha -> se detiene (se
--     retoma cuando se cargue, llamando de nuevo a esta funcion).
--   - Ajuste 'indice' variacion (IPC): pendiente de formula -> se detiene.
--   - Reanudable: arranca desde la ultima cuota NO anulada existente.
-- ---------------------------------------------------------------------

create or replace function generar_cuotas_contrato(p_contrato_id bigint)
returns integer
language plpgsql
security invoker
as $$
declare
  c               public.contrato%rowtype;
  v_indice        public.indice%rowtype;
  v_base_monto    bigint;
  v_fecha_gen     date;
  v_monto_vig     bigint;
  v_periodo_venc  date;      -- vencimiento de la cuota que se esta por crear
  v_periodo_txt   text;
  v_ultima_venc   date;
  v_num_cuota     int := 0;
  v_creadas       int := 0;
  v_prox_ajuste   int;       -- cada cuantas cuotas toca ajustar
  v_valor_ajuste  numeric;
begin
  select * into c from public.contrato where id = p_contrato_id;
  if not found then raise exception 'No existe ese contrato.'; end if;
  if c.estado <> 'vigente' then
    raise exception 'Solo se generan cuotas de un contrato vigente.';
  end if;

  -- Contrato que ya venia en curso (migracion 014): arranca desde
  -- fecha_inicio_generacion con monto_actual.
  if c.fecha_inicio_generacion is not null and c.monto_actual is not null then
    v_fecha_gen := c.fecha_inicio_generacion;
    v_base_monto := c.monto_actual;
  else
    v_fecha_gen := c.fecha_inicio;
    v_base_monto := c.monto_inicial;
  end if;

  if c.ajuste_tipo = 'indice' then
    select * into v_indice from public.indice where codigo = c.indice_codigo;
    if not found then raise exception 'El indice % del contrato no existe.', c.indice_codigo; end if;
    if v_indice.tipo_calculo = 'variacion' then
      -- IPC: la formula de composicion de variaciones mensuales todavia
      -- no esta definida (ver reglas-negocio-alquileres.md 4.2 / 9).
      raise exception 'El ajuste por IPC todavia no esta implementado. Usa ICL, UVA o un porcentaje fijo.';
    end if;
  end if;

  v_prox_ajuste := coalesce(c.ajuste_meses, 6);

  -- Reanudar: contar cuotas NO anuladas ya existentes y arrancar despues.
  select count(*), max(fecha_vencimiento)
    into v_num_cuota, v_ultima_venc
  from public.cuota
  where contrato_id = p_contrato_id and estado <> 'anulada';

  -- Primer vencimiento a generar
  if v_ultima_venc is null then
    -- primer dia_vencimiento posterior (o igual) a la fecha de arranque
    v_periodo_venc := make_date(
      extract(year from v_fecha_gen)::int,
      extract(month from v_fecha_gen)::int,
      least(c.dia_vencimiento, extract(day from (date_trunc('month', v_fecha_gen) + interval '1 month - 1 day'))::int)
    );
    if v_periodo_venc < v_fecha_gen then
      v_periodo_venc := (v_periodo_venc + interval '1 month')::date;
      v_periodo_venc := make_date(
        extract(year from v_periodo_venc)::int, extract(month from v_periodo_venc)::int,
        least(c.dia_vencimiento, extract(day from (date_trunc('month', v_periodo_venc) + interval '1 month - 1 day'))::int));
    end if;
  else
    v_periodo_venc := (v_ultima_venc + interval '1 month')::date;
    v_periodo_venc := make_date(
      extract(year from v_periodo_venc)::int, extract(month from v_periodo_venc)::int,
      least(c.dia_vencimiento, extract(day from (date_trunc('month', v_periodo_venc) + interval '1 month - 1 day'))::int));
  end if;

  loop
    -- Condicion de corte: la ultima cuota es la primera cuyo vencimiento
    -- llega a fecha_fin. Si ya generamos una asi, salimos.
    exit when v_num_cuota > 0 and v_ultima_venc is not null and v_ultima_venc >= c.fecha_fin;
    exit when v_num_cuota >= 600;  -- tope de seguridad (50 años)

    v_num_cuota := v_num_cuota + 1;
    v_periodo_txt := to_char(v_periodo_venc, 'YYYY-MM');

    -- Monto vigente para esta cuota
    v_monto_vig := v_base_monto;
    if c.ajuste_tipo = 'porcentaje' and c.ajuste_valor is not null then
      -- cuantos ajustes ya corresponden antes de este vencimiento
      declare n_aj int := floor((v_num_cuota - 1) / v_prox_ajuste)::int;
      begin
        if n_aj > 0 then
          v_monto_vig := round(v_base_monto * power(1 + c.ajuste_valor/100.0, n_aj))::bigint;
        end if;
      end;
    elsif c.ajuste_tipo = 'indice' then
      declare
        n_aj int := floor((v_num_cuota - 1) / v_prox_ajuste)::int;
        v_fecha_aj date;
        v_val numeric;
      begin
        if n_aj > 0 then
          v_fecha_aj := (date_trunc('month', v_fecha_gen) + (n_aj * v_prox_ajuste || ' months')::interval)::date;
          select valor into v_val from public.indice_valor
            where indice_codigo = c.indice_codigo and fecha <= v_fecha_aj
            order by fecha desc limit 1;
          if v_val is null or c.indice_valor_base is null or c.indice_valor_base = 0 then
            -- falta el dato: no se genera esta cuota (se retoma despues)
            v_num_cuota := v_num_cuota - 1;
            exit;
          end if;
          v_monto_vig := round(v_base_monto * v_val / c.indice_valor_base)::bigint;
        end if;
      end;
    end if;

    insert into public.cuota (contrato_id, periodo, fecha_vencimiento, monto_alquiler, monto_expensas)
    values (p_contrato_id, v_periodo_txt, v_periodo_venc, v_monto_vig,
            coalesce((select expensas from public.propiedad where id = c.propiedad_id), 0))
    on conflict (contrato_id, periodo) where (estado <> 'anulada') do nothing;

    v_creadas := v_creadas + 1;
    v_ultima_venc := v_periodo_venc;

    -- proximo vencimiento
    v_periodo_venc := (date_trunc('month', v_periodo_venc) + interval '1 month')::date;
    v_periodo_venc := make_date(
      extract(year from v_periodo_venc)::int, extract(month from v_periodo_venc)::int,
      least(c.dia_vencimiento, extract(day from (date_trunc('month', v_periodo_venc) + interval '1 month - 1 day'))::int));
  end loop;

  return v_creadas;
end $$;

-- ---------------------------------------------------------------------
-- Alta de contrato + garantes + cuotas + estado del inmueble
-- ---------------------------------------------------------------------

create or replace function crear_contrato(p_contrato jsonb, p_garantes jsonb default '[]'::jsonb)
returns bigint
language plpgsql
security invoker
as $$
declare
  v_id          bigint;
  v_prop_id     bigint := (p_contrato->>'propiedad_id')::bigint;
  v_prop        public.propiedad%rowtype;
  v_inq_id      bigint := (p_contrato->>'inquilino_id')::bigint;
  v_garante     jsonb;
begin
  select * into v_prop from public.propiedad where id = v_prop_id and activo = true;
  if not found then raise exception 'Elegi un inmueble valido.'; end if;
  if v_prop.estado not in ('disponible','alquilada') then
    raise exception 'El inmueble esta % — no se puede armar un contrato encima.', v_prop.estado;
  end if;
  if exists (select 1 from public.contrato where propiedad_id = v_prop_id and estado = 'vigente') then
    raise exception 'Ese inmueble ya tiene un contrato vigente.';
  end if;
  if not exists (select 1 from public.persona where id = v_inq_id and activo = true) then
    raise exception 'Elegi un inquilino valido.';
  end if;

  insert into public.contrato (
    propiedad_id, inquilino_id, tipo_contrato, fecha_inicio, fecha_fin, dia_vencimiento,
    monto_inicial, moneda, deposito, ajuste_tipo, ajuste_meses, ajuste_valor,
    indice_codigo, indice_valor_base, comision_admin_pct, liquidacion_garantizada,
    punitorio_diario_pct, dias_gracia_mora, monto_actual, fecha_inicio_generacion, notas
  ) values (
    v_prop_id, v_inq_id,
    coalesce(p_contrato->>'tipo_contrato','vivienda'),
    (p_contrato->>'fecha_inicio')::date, (p_contrato->>'fecha_fin')::date,
    coalesce((p_contrato->>'dia_vencimiento')::int, 10),
    (p_contrato->>'monto_inicial')::bigint,
    coalesce(p_contrato->>'moneda','ARS'),
    coalesce((p_contrato->>'deposito')::bigint, 0),
    coalesce(p_contrato->>'ajuste_tipo','sin_ajuste'),
    coalesce((p_contrato->>'ajuste_meses')::int, 6),
    nullif(p_contrato->>'ajuste_valor','')::numeric,
    nullif(p_contrato->>'indice_codigo',''),
    nullif(p_contrato->>'indice_valor_base','')::numeric,
    nullif(p_contrato->>'comision_admin_pct','')::numeric,
    coalesce((p_contrato->>'liquidacion_garantizada')::boolean, false),
    nullif(p_contrato->>'punitorio_diario_pct','')::numeric,
    nullif(p_contrato->>'dias_gracia_mora','')::int,
    nullif(p_contrato->>'monto_actual','')::bigint,
    nullif(p_contrato->>'fecha_inicio_generacion','')::date,
    nullif(p_contrato->>'notas','')
  ) returning id into v_id;

  for v_garante in select * from jsonb_array_elements(coalesce(p_garantes,'[]'::jsonb)) loop
    insert into public.contrato_garante (contrato_id, persona_id, tipo_garantia, detalle)
    values (v_id, (v_garante->>'persona_id')::bigint,
            coalesce(v_garante->>'tipo_garantia','personal'), nullif(v_garante->>'detalle',''));
  end loop;

  update public.propiedad set estado = 'alquilada', actualizado_en = now() where id = v_prop_id;

  perform generar_cuotas_contrato(v_id);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Rescision anticipada
-- ---------------------------------------------------------------------

create or replace function rescindir_contrato(p_contrato_id bigint, p_fecha date, p_motivo text)
returns void
language plpgsql
security invoker
as $$
declare c public.contrato%rowtype;
begin
  select * into c from public.contrato where id = p_contrato_id;
  if not found then raise exception 'No existe ese contrato.'; end if;
  if c.estado <> 'vigente' then raise exception 'Solo se rescinde un contrato vigente.'; end if;
  if p_fecha <= c.fecha_inicio or p_fecha >= c.fecha_fin then
    raise exception 'La fecha de rescision tiene que estar entre el inicio y el fin del contrato.';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then raise exception 'Escribi el motivo de la rescision.'; end if;

  update public.contrato
     set estado = 'rescindido', fecha_rescision = p_fecha, motivo_rescision = p_motivo
   where id = p_contrato_id;

  -- Cuotas con vencimiento posterior a la rescision: se anulan (nunca se
  -- borran). Los pagos/recibos de cuotas ya cobradas quedan intactos.
  update public.cuota set estado = 'anulada'
   where contrato_id = p_contrato_id and fecha_vencimiento > p_fecha and estado <> 'pagada';

  -- El inmueble vuelve a disponible salvo que tenga otro contrato vigente.
  if not exists (select 1 from public.contrato
                 where propiedad_id = c.propiedad_id and estado = 'vigente' and id <> p_contrato_id) then
    update public.propiedad set estado = 'disponible', actualizado_en = now()
     where id = c.propiedad_id and estado = 'alquilada';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Renovacion: nace un contrato nuevo, el original queda 'renovado'
-- ---------------------------------------------------------------------

create or replace function renovar_contrato(p_origen_id bigint, p_cambios jsonb, p_garantes jsonb default '[]'::jsonb)
returns bigint
language plpgsql
security invoker
as $$
declare
  o public.contrato%rowtype;
  v_nuevo jsonb;
  v_id bigint;
begin
  select * into o from public.contrato where id = p_origen_id;
  if not found then raise exception 'No existe ese contrato.'; end if;
  if o.estado <> 'vigente' then raise exception 'Solo se renueva un contrato vigente.'; end if;

  -- El nuevo hereda todo del origen salvo lo que venga en p_cambios;
  -- monto_inicial e indice_valor_base son siempre explicitos.
  v_nuevo := jsonb_build_object(
    'propiedad_id', o.propiedad_id,
    'inquilino_id', o.inquilino_id,
    'tipo_contrato', o.tipo_contrato,
    'dia_vencimiento', o.dia_vencimiento,
    'moneda', o.moneda,
    'deposito', o.deposito,
    'ajuste_tipo', o.ajuste_tipo,
    'ajuste_meses', o.ajuste_meses,
    'ajuste_valor', o.ajuste_valor,
    'indice_codigo', o.indice_codigo,
    'comision_admin_pct', o.comision_admin_pct,
    'liquidacion_garantizada', o.liquidacion_garantizada,
    'punitorio_diario_pct', o.punitorio_diario_pct,
    'dias_gracia_mora', o.dias_gracia_mora
  ) || coalesce(p_cambios, '{}'::jsonb);

  if not (v_nuevo ? 'fecha_inicio') or not (v_nuevo ? 'fecha_fin') or not (v_nuevo ? 'monto_inicial') then
    raise exception 'Para renovar hace falta la fecha de inicio, la de fin y el monto nuevo.';
  end if;

  v_id := crear_contrato(v_nuevo, p_garantes);
  update public.contrato set contrato_origen_id = p_origen_id where id = v_id;
  update public.contrato set estado = 'renovado' where id = p_origen_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Bonificacion puntual de una cuota (antes de cobrarla)
-- ---------------------------------------------------------------------

create or replace function bonificar_cuota(p_cuota_id bigint, p_monto bigint, p_motivo text)
returns void
language plpgsql
security invoker
as $$
declare cu public.cuota%rowtype;
begin
  select * into cu from public.cuota where id = p_cuota_id;
  if not found then raise exception 'No existe esa cuota.'; end if;
  if cu.estado not in ('pendiente') then raise exception 'Solo se bonifica una cuota pendiente.'; end if;
  if p_monto < 0 then raise exception 'La bonificacion no puede ser negativa.'; end if;
  if p_monto > (cu.monto_alquiler + cu.monto_expensas + cu.monto_otros) then
    raise exception 'La bonificacion no puede ser mayor que la cuota.';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then raise exception 'Escribi el motivo de la bonificacion.'; end if;
  update public.cuota set bonificacion = p_monto, motivo_bonificacion = p_motivo where id = p_cuota_id;
end $$;

-- ---------------------------------------------------------------------
-- Registrar cobro de una o varias cuotas (un solo recibo)
--   p_medios: [{medio_pago, monto, referencia, comision_monto}]
--   Reglas: reglas-negocio-cobranzas.md 3, 4, 5, 8, 9
-- ---------------------------------------------------------------------

create or replace function registrar_cobro(
  p_persona_id   bigint,
  p_fecha_pago   date,
  p_moneda       text,
  p_cuota_ids    bigint[],
  p_medios       jsonb,
  p_observaciones text default null
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_recibo_id     bigint;
  v_num           integer;
  v_total         bigint := 0;
  v_total_medios  bigint := 0;
  v_cuota_id      bigint;
  cu              public.cuota%rowtype;
  c               public.contrato%rowtype;
  v_pct_mora      numeric;
  v_gracia        int;
  v_dias          int;
  v_mora          bigint;
  v_base          bigint;      -- monto de la cuota sin punitorio
  v_a_cobrar      bigint;
  v_pago_id       bigint;
  v_medio         jsonb;
  v_medio_ppal    text;
  v_medio_ppal_monto bigint := -1;
  v_pagos         bigint[] := '{}';
  v_excep         public.contrato_excepcion_cobro%rowtype;
begin
  if array_length(p_cuota_ids, 1) is null then raise exception 'Elegi al menos una cuota para cobrar.'; end if;

  v_num := ig_proximo_recibo();
  insert into public.recibo (numero, serie, tipo, fecha_emision, persona_id, total, concepto)
  values (v_num, 'A', 'inquilino', p_fecha_pago, p_persona_id, 0,
          'Cobro de alquiler')
  returning id into v_recibo_id;

  foreach v_cuota_id in array p_cuota_ids loop
    select * into cu from public.cuota where id = v_cuota_id;
    if not found then raise exception 'Una de las cuotas no existe.'; end if;
    if cu.estado = 'pagada' then raise exception 'La cuota % ya esta pagada.', cu.periodo; end if;
    if cu.estado = 'anulada' then raise exception 'La cuota % esta anulada.', cu.periodo; end if;

    select * into c from public.contrato where id = cu.contrato_id;
    if c.moneda <> p_moneda then
      raise exception 'La cuota % es en % y el cobro en %. No coinciden.', cu.periodo, c.moneda, p_moneda;
    end if;

    -- Excepcion de cobro activa para el periodo de la cuota (acuerdo informal)
    select * into v_excep from public.contrato_excepcion_cobro
      where contrato_id = c.id and anulada = false
        and (cu.periodo || '-01')::date >= fecha_desde
        and (cu.periodo || '-01')::date <  fecha_hasta
      order by creado_en desc limit 1;
    if found and v_excep.monto_congelado < cu.monto_alquiler then
      update public.cuota
         set bonificacion = (cu.monto_alquiler - v_excep.monto_congelado),
             motivo_bonificacion = 'Excepcion de cobro: ' || v_excep.motivo
       where id = cu.id;
      cu.bonificacion := cu.monto_alquiler - v_excep.monto_congelado;
    end if;

    v_base := cu.monto_alquiler + cu.monto_expensas + cu.monto_otros - cu.bonificacion;

    -- Mora: dias de atraso sobre el vencimiento, menos gracia.
    v_pct_mora := coalesce(c.punitorio_diario_pct, ig_config_num('punitorio_diario_pct', 0.1));
    v_gracia   := coalesce(c.dias_gracia_mora,   ig_config_num('dias_gracia_mora', 5)::int);
    v_dias := (p_fecha_pago - cu.fecha_vencimiento) - v_gracia;
    if v_dias > 0 and v_pct_mora > 0 then
      v_mora := round(v_base * v_pct_mora/100.0 * v_dias)::bigint;
    else
      v_mora := 0;
    end if;

    v_a_cobrar := v_base + v_mora;
    v_total := v_total + v_a_cobrar;

    insert into public.pago (persona_id, contrato_id, fecha_pago, monto, moneda, medio_pago, referencia, recibo_id, observaciones)
    values (p_persona_id, c.id, p_fecha_pago, v_a_cobrar, p_moneda, 'efectivo', null, v_recibo_id, p_observaciones)
    returning id into v_pago_id;
    v_pagos := v_pagos || v_pago_id;

    insert into public.pago_imputacion (pago_id, cuota_id, concepto, monto)
      values (v_pago_id, cu.id, 'alquiler', cu.monto_alquiler - cu.bonificacion);
    if cu.monto_expensas > 0 then
      insert into public.pago_imputacion (pago_id, cuota_id, concepto, monto) values (v_pago_id, cu.id, 'expensas', cu.monto_expensas);
    end if;
    if cu.monto_otros > 0 then
      insert into public.pago_imputacion (pago_id, cuota_id, concepto, monto) values (v_pago_id, cu.id, 'otros', cu.monto_otros);
    end if;
    if v_mora > 0 then
      update public.cuota set monto_punitorio = v_mora where id = cu.id;
      insert into public.pago_imputacion (pago_id, cuota_id, concepto, monto) values (v_pago_id, cu.id, 'punitorio', v_mora);
    end if;

    update public.cuota set estado = 'pagada' where id = cu.id;

    -- Movimiento de caja (ingreso) por cada cobro.
    insert into public.movimiento_caja (fecha, tipo, categoria, concepto, monto, moneda, medio_pago, pago_id, persona_id, propiedad_id)
    values (p_fecha_pago, 'ingreso', 'cobro_alquiler',
            'Cobro alquiler ' || cu.periodo, v_a_cobrar, p_moneda, 'efectivo', v_pago_id, p_persona_id, c.propiedad_id);
  end loop;

  -- Desglose de medios de pago (la suma tiene que dar el total).
  for v_medio in select * from jsonb_array_elements(coalesce(p_medios, '[]'::jsonb)) loop
    v_total_medios := v_total_medios + (v_medio->>'monto')::bigint;
    if (v_medio->>'monto')::bigint > v_medio_ppal_monto then
      v_medio_ppal := v_medio->>'medio_pago';
      v_medio_ppal_monto := (v_medio->>'monto')::bigint;
    end if;
    insert into public.medio_pago_detalle (pago_id, medio_pago, monto, referencia, comision_monto)
    values (v_pagos[1], coalesce(v_medio->>'medio_pago','efectivo'), (v_medio->>'monto')::bigint,
            nullif(v_medio->>'referencia',''), coalesce((v_medio->>'comision_monto')::bigint, 0));
  end loop;

  if jsonb_array_length(coalesce(p_medios,'[]'::jsonb)) > 0 and v_total_medios <> v_total then
    raise exception 'El desglose de medios de pago (%) no coincide con el total a cobrar (%).',
      (v_total_medios/100.0), (v_total/100.0);
  end if;

  if v_medio_ppal is not null then
    update public.pago set medio_pago = v_medio_ppal where id = any(v_pagos);
    update public.movimiento_caja set medio_pago = v_medio_ppal where pago_id = any(v_pagos);
  end if;

  update public.recibo set total = v_total where id = v_recibo_id;

  return jsonb_build_object('recibo_id', v_recibo_id, 'numero', v_num, 'total', v_total, 'pagos', to_jsonb(v_pagos));
end $$;

-- ---------------------------------------------------------------------
-- Anular un cobro (nunca DELETE)
-- ---------------------------------------------------------------------

create or replace function anular_cobro(p_pago_id bigint, p_motivo text)
returns void
language plpgsql
security invoker
as $$
declare
  p public.pago%rowtype;
  v_cuota_id bigint;
begin
  select * into p from public.pago where id = p_pago_id;
  if not found then raise exception 'No existe ese cobro.'; end if;
  if p.anulado then raise exception 'Ese cobro ya estaba anulado.'; end if;
  if p_motivo is null or btrim(p_motivo) = '' then raise exception 'Escribi el motivo de la anulacion.'; end if;

  update public.pago set anulado = true, motivo_anulacion = p_motivo where id = p_pago_id;
  update public.movimiento_caja set anulado = true where pago_id = p_pago_id;

  -- Las cuotas que pagaba este cobro vuelven a pendiente y se les saca el punitorio.
  for v_cuota_id in select distinct cuota_id from public.pago_imputacion where pago_id = p_pago_id loop
    update public.cuota set estado = 'pendiente', monto_punitorio = 0 where id = v_cuota_id;
  end loop;

  -- Si el recibo no cubre ningun cobro vigente mas, queda anulado.
  if p.recibo_id is not null and not exists (
    select 1 from public.pago where recibo_id = p.recibo_id and anulado = false and id <> p_pago_id
  ) then
    update public.recibo set anulado = true where id = p.recibo_id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Generar liquidacion a propietarios de un inmueble por un periodo
--   Reglas: reglas-negocio-liquidacion.md
--   - Base: lo efectivamente cobrado a inquilinos de ese inmueble en el
--     periodo (alquiler + expensas + otros, sin punitorios).
--   - Comision de administracion: sobre lo cobrado.
--   - Gastos del inmueble no liquidados: se restan.
--   - Se reparte por porcentaje de cada propietario -> una liquidacion
--     por propietario.
--   - Liquidacion garantizada: pendiente (se avisa).
-- ---------------------------------------------------------------------

create or replace function generar_liquidacion(p_propiedad_id bigint, p_periodo text)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_prop        public.propiedad%rowtype;
  v_comision_pct numeric;
  v_cobrado     bigint := 0;
  v_gastos      bigint := 0;
  v_comision    bigint;
  v_neto_total  bigint;
  v_prop_row    record;
  v_liq_id      bigint;
  v_parte_cobrado bigint;
  v_parte_comision bigint;
  v_parte_gastos bigint;
  v_parte_neto  bigint;
  v_ids         bigint[] := '{}';
  v_g           record;
begin
  select * into v_prop from public.propiedad where id = p_propiedad_id;
  if not found then raise exception 'No existe ese inmueble.'; end if;

  if not exists (select 1 from public.propiedad_propietario where propiedad_id = p_propiedad_id) then
    raise exception 'El inmueble no tiene propietarios cargados. Cargalos en la ficha del inmueble.';
  end if;
  if abs(coalesce((select sum(porcentaje) from public.propiedad_propietario where propiedad_id = p_propiedad_id),0) - 100) > 0.01 then
    raise exception 'Los porcentajes de los propietarios no suman 100.';
  end if;

  if exists (select 1 from public.liquidacion l join public.liquidacion_detalle d on d.liquidacion_id = l.id
             where d.propiedad_id = p_propiedad_id and l.periodo = p_periodo and l.estado <> 'anulada') then
    raise exception 'Ya hay una liquidacion de ese inmueble para %.', p_periodo;
  end if;

  v_comision_pct := coalesce(v_prop.comision_admin_pct, ig_config_num('comision_admin_pct', 10));

  -- Cobrado: imputaciones (sin punitorio) de cuotas de contratos de este
  -- inmueble, cuyo periodo es el pedido, con pago no anulado.
  select coalesce(sum(pi.monto), 0) into v_cobrado
  from public.pago_imputacion pi
  join public.pago pg on pg.id = pi.pago_id and pg.anulado = false
  join public.cuota cu on cu.id = pi.cuota_id and cu.periodo = p_periodo
  join public.contrato c on c.id = cu.contrato_id and c.propiedad_id = p_propiedad_id
  where pi.concepto <> 'punitorio';

  if v_cobrado = 0 then
    raise exception 'No hay nada cobrado de ese inmueble en % — todavia no se puede liquidar.', p_periodo;
  end if;

  select coalesce(sum(monto), 0) into v_gastos
  from public.gasto
  where propiedad_id = p_propiedad_id and liquidado = false and anulado = false;

  v_comision := round(v_cobrado * v_comision_pct / 100.0)::bigint;
  v_neto_total := v_cobrado - v_comision - v_gastos;

  for v_prop_row in
    select pp.persona_id, pp.porcentaje from public.propiedad_propietario pp where pp.propiedad_id = p_propiedad_id
  loop
    v_parte_cobrado  := round(v_cobrado  * v_prop_row.porcentaje / 100.0)::bigint;
    v_parte_comision := round(v_comision * v_prop_row.porcentaje / 100.0)::bigint;
    v_parte_gastos   := round(v_gastos   * v_prop_row.porcentaje / 100.0)::bigint;
    v_parte_neto     := v_parte_cobrado - v_parte_comision - v_parte_gastos;

    insert into public.liquidacion (persona_id, periodo, total_cobrado, total_comision, total_gastos, total_neto)
    values (v_prop_row.persona_id, p_periodo, v_parte_cobrado, v_parte_comision, v_parte_gastos, v_parte_neto)
    returning id into v_liq_id;
    v_ids := v_ids || v_liq_id;

    insert into public.liquidacion_detalle (liquidacion_id, propiedad_id, concepto, tipo, monto, porcentaje_prop)
    values (v_liq_id, p_propiedad_id, 'Alquiler cobrado ' || p_periodo, 'cobro', v_parte_cobrado, v_prop_row.porcentaje);
    insert into public.liquidacion_detalle (liquidacion_id, propiedad_id, concepto, tipo, monto, porcentaje_prop)
    values (v_liq_id, p_propiedad_id, 'Comision administracion ' || v_comision_pct || '%', 'comision', -v_parte_comision, v_prop_row.porcentaje);

    for v_g in select id, concepto, monto from public.gasto
              where propiedad_id = p_propiedad_id and liquidado = false and anulado = false loop
      insert into public.liquidacion_detalle (liquidacion_id, propiedad_id, concepto, tipo, monto, porcentaje_prop)
      values (v_liq_id, p_propiedad_id, v_g.concepto, 'gasto',
              -round(v_g.monto * v_prop_row.porcentaje / 100.0)::bigint, v_prop_row.porcentaje);
    end loop;
  end loop;

  update public.gasto set liquidado = true, liquidacion_id = v_ids[1]
   where propiedad_id = p_propiedad_id and liquidado = false and anulado = false;

  return jsonb_build_object('liquidaciones', to_jsonb(v_ids), 'cobrado', v_cobrado, 'neto', v_neto_total);
end $$;

-- ---------------------------------------------------------------------
-- Pagar una liquidacion al propietario
--   p_medios: [{medio_pago, monto, referencia}]
-- ---------------------------------------------------------------------

create or replace function pagar_liquidacion(p_liquidacion_id bigint, p_fecha date, p_medios jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  l public.liquidacion%rowtype;
  v_num integer;
  v_recibo_id bigint;
  v_medio jsonb;
  v_suma bigint := 0;
  v_medio_ppal text;
  v_medio_ppal_monto bigint := -1;
begin
  select * into l from public.liquidacion where id = p_liquidacion_id;
  if not found then raise exception 'No existe esa liquidacion.'; end if;
  if l.estado <> 'pendiente' then raise exception 'Esa liquidacion ya esta %.', l.estado; end if;

  for v_medio in select * from jsonb_array_elements(coalesce(p_medios,'[]'::jsonb)) loop
    v_suma := v_suma + (v_medio->>'monto')::bigint;
    if (v_medio->>'monto')::bigint > v_medio_ppal_monto then
      v_medio_ppal := v_medio->>'medio_pago'; v_medio_ppal_monto := (v_medio->>'monto')::bigint;
    end if;
  end loop;
  if v_suma <> l.total_neto then
    raise exception 'El pago (%) no coincide con el neto de la liquidacion (%).', (v_suma/100.0), (l.total_neto/100.0);
  end if;

  v_num := ig_proximo_recibo();
  insert into public.recibo (numero, serie, tipo, fecha_emision, persona_id, total, concepto)
  values (v_num, 'A', 'propietario', p_fecha, l.persona_id, l.total_neto, 'Liquidacion ' || l.periodo)
  returning id into v_recibo_id;

  for v_medio in select * from jsonb_array_elements(coalesce(p_medios,'[]'::jsonb)) loop
    insert into public.medio_pago_detalle (liquidacion_id, medio_pago, monto, referencia)
    values (p_liquidacion_id, coalesce(v_medio->>'medio_pago','efectivo'), (v_medio->>'monto')::bigint, nullif(v_medio->>'referencia',''));
  end loop;

  update public.liquidacion
     set estado = 'pagada', fecha_pago = p_fecha, medio_pago = v_medio_ppal, recibo_id = v_recibo_id
   where id = p_liquidacion_id;

  insert into public.movimiento_caja (fecha, tipo, categoria, concepto, monto, moneda, medio_pago, liquidacion_id, persona_id)
  values (p_fecha, 'egreso', 'liquidacion_propietario', 'Liquidacion ' || l.periodo, l.total_neto, 'ARS',
          coalesce(v_medio_ppal,'efectivo'), p_liquidacion_id, l.persona_id);

  return jsonb_build_object('recibo_id', v_recibo_id, 'numero', v_num);
end $$;

-- ---------------------------------------------------------------------
-- Anular una liquidacion
-- ---------------------------------------------------------------------

create or replace function anular_liquidacion(p_liquidacion_id bigint, p_motivo text)
returns void
language plpgsql
security invoker
as $$
declare l public.liquidacion%rowtype;
begin
  select * into l from public.liquidacion where id = p_liquidacion_id;
  if not found then raise exception 'No existe esa liquidacion.'; end if;
  if l.estado = 'pagada' then raise exception 'Esa liquidacion ya se pago. No se puede anular.'; end if;
  if p_motivo is null or btrim(p_motivo) = '' then raise exception 'Escribi el motivo.'; end if;

  update public.liquidacion set estado = 'anulada', observaciones = p_motivo where id = p_liquidacion_id;
  update public.gasto set liquidado = false, liquidacion_id = null where liquidacion_id = p_liquidacion_id;
end $$;
