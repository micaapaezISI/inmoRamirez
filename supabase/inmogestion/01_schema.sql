-- =====================================================================
-- INMOGESTION dentro del panel de Inmobiliaria Ramirez
-- Fase 1 — Esquema del nucleo, portado de SQLite a Postgres (Supabase)
--
-- Origen: InmoGestion, migraciones 001..020 consolidadas (solo lo que
-- toca el nucleo: personas, inmuebles, contratos, cuotas, cobranzas,
-- liquidaciones, caja). Se dejan afuera por ahora: usuarios/roles/permisos
-- (el panel usa un unico login de Supabase Auth), auditoria, agenda,
-- busquedas, importacion, informes, licenciamiento.
--
-- Reglas que se respetan igual que en InmoGestion:
--   * Montos SIEMPRE en centavos, enteros (bigint). Nunca decimales.
--   * Bajas logicas, nunca DELETE (columna activo / estado / anulado).
--   * Fechas como date ISO; periodo como texto 'AAAA-MM'.
--
-- Correr una sola vez en: Supabase Dashboard -> SQL Editor -> New query.
-- Despues correr 02_rls.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Configuracion de la instalacion
-- ---------------------------------------------------------------------
create table if not exists public.config (
  clave        text primary key,
  valor        text,
  descripcion  text
);

insert into public.config (clave, valor, descripcion) values
  ('razon_social',        '', 'Nombre de la inmobiliaria'),
  ('cuit',                '', 'CUIT de la inmobiliaria'),
  ('matricula',           '', 'Matricula del martillero'),
  ('domicilio',           '', 'Domicilio comercial'),
  ('telefono',            '', 'Telefono de contacto'),
  ('email',               '', 'Email de contacto'),
  ('localidad_default',   'La Quiaca', 'Localidad por defecto en formularios'),
  ('provincia_default',   'Jujuy',     'Provincia por defecto en formularios'),
  ('comision_admin_pct',  '10',   'Comision de administracion por defecto (%)'),
  ('punitorio_diario_pct','0.1',  'Interes punitorio diario por mora (%)'),
  ('dias_gracia_mora',    '5',    'Dias de gracia antes de aplicar punitorios'),
  ('proximo_recibo',      '1',    'Proximo numero de recibo a emitir'),
  ('dias_aviso_vencimiento_contrato', '60',
     'Dias de anticipacion para avisar que un contrato esta por vencer')
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- Personas (propietarios, inquilinos, garantes, compradores)
-- ---------------------------------------------------------------------
create table if not exists public.persona (
  id               bigint generated always as identity primary key,
  tipo_persona     text not null default 'fisica'
                   check (tipo_persona in ('fisica','juridica')),
  nombre           text not null,
  documento_tipo   text default 'DNI'
                   check (documento_tipo in ('DNI','CUIT','CUIL','LE','LC','PAS')),
  documento        text,
  telefono         text,
  telefono_alt     text,
  email            text,
  domicilio        text,
  localidad        text,
  provincia        text,
  fecha_nacimiento date,
  ocupacion        text,
  cbu              text,
  banco            text,
  condicion_iva    text default 'consumidor_final'
                   check (condicion_iva in ('responsable_inscripto','monotributista',
                                            'exento','consumidor_final','no_categorizado')),
  notas            text,
  activo           boolean not null default true,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz
);

create index if not exists idx_persona_nombre    on public.persona(nombre);
create index if not exists idx_persona_documento on public.persona(documento);

-- ---------------------------------------------------------------------
-- Inmuebles
-- ---------------------------------------------------------------------
create table if not exists public.propiedad (
  id              bigint generated always as identity primary key,
  codigo          text unique,
  tipo            text not null default 'casa'
                  check (tipo in ('casa','departamento','local','oficina',
                                  'terreno','galpon','cochera','campo','otro')),
  operacion       text not null default 'alquiler'
                  check (operacion in ('alquiler','venta','ambas')),
  estado          text not null default 'disponible'
                  check (estado in ('disponible','reservada','alquilada',
                                    'vendida','suspendida')),

  calle           text,
  numero          text,
  piso            text,
  departamento    text,
  barrio          text,
  localidad       text,
  provincia       text,
  latitud         double precision,
  longitud        double precision,

  superficie_total    double precision,
  superficie_cubierta double precision,
  ambientes       integer,
  dormitorios     integer,
  banos           integer,
  cocheras        integer,
  antiguedad      integer,
  descripcion     text,

  nomenclatura_catastral text,
  partida_inmobiliaria   text,
  matricula_registral    text,

  precio_alquiler     bigint,
  moneda_alquiler     text default 'ARS' check (moneda_alquiler in ('ARS','USD')),
  precio_venta        bigint,
  moneda_venta        text default 'USD' check (moneda_venta in ('ARS','USD')),
  expensas            bigint,
  comision_admin_pct  numeric,

  publicar_web        boolean not null default false,
  titulo_publico      text,
  descripcion_publica text,
  ocultar_direccion   boolean not null default false,

  notas           text,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz
);

create index if not exists idx_propiedad_estado    on public.propiedad(estado);
create index if not exists idx_propiedad_operacion on public.propiedad(operacion);
create index if not exists idx_propiedad_barrio    on public.propiedad(barrio);
create index if not exists idx_propiedad_activo    on public.propiedad(activo);

-- Una propiedad puede tener varios duenos con distinto porcentaje
-- (habitual en herencias): la liquidacion reparte segun estos porcentajes.
create table if not exists public.propiedad_propietario (
  id            bigint generated always as identity primary key,
  propiedad_id  bigint not null references public.propiedad(id) on delete cascade,
  persona_id    bigint not null references public.persona(id),
  porcentaje    numeric not null default 100,
  es_contacto_principal boolean not null default false,
  unique (propiedad_id, persona_id)
);

-- Fotos: el archivo vive en el bucket 'property-photos' que ya existe.
-- Aca se guarda la ruta/URL y el orden.
create table if not exists public.propiedad_foto (
  id            bigint generated always as identity primary key,
  propiedad_id  bigint not null references public.propiedad(id) on delete cascade,
  archivo       text not null,
  orden         integer not null default 0,
  es_portada    boolean not null default false
);

create index if not exists idx_foto_propiedad on public.propiedad_foto(propiedad_id, orden);

-- ---------------------------------------------------------------------
-- Indices de ajuste (BCRA / INDEC)
-- ---------------------------------------------------------------------
create table if not exists public.indice (
  codigo        text primary key,
  nombre        text not null,
  descripcion   text,
  tipo_calculo  text not null default 'coeficiente'
                check (tipo_calculo in ('coeficiente','variacion')),
  activo        boolean not null default true
);

insert into public.indice (codigo, nombre, tipo_calculo, descripcion) values
  ('ICL',         'Indice para Contratos de Locacion', 'coeficiente',
   'BCRA. Combina 50% salarios (RIPTE) y 50% inflacion (IPC).'),
  ('IPC',         'Indice de Precios al Consumidor',   'variacion', 'INDEC.'),
  ('UVA',         'Unidad de Valor Adquisitivo',       'coeficiente', 'BCRA.'),
  ('CER',         'Coeficiente de Estabilizacion de Referencia', 'coeficiente', 'BCRA.'),
  ('CASA_PROPIA', 'Indice Casa Propia',                'coeficiente',
   'Menor entre variacion salarial y de inflacion.')
on conflict (codigo) do nothing;

create table if not exists public.indice_valor (
  id             bigint generated always as identity primary key,
  indice_codigo  text not null references public.indice(codigo),
  fecha          date not null,
  valor          numeric not null,
  origen         text not null default 'manual'
                 check (origen in ('manual','api_bcra','importado')),
  creado_en      timestamptz not null default now(),
  unique (indice_codigo, fecha)
);

create index if not exists idx_indice_valor_fecha on public.indice_valor(indice_codigo, fecha);

-- ---------------------------------------------------------------------
-- Contratos de alquiler
-- ---------------------------------------------------------------------
create table if not exists public.contrato (
  id              bigint generated always as identity primary key,
  propiedad_id    bigint not null references public.propiedad(id),
  inquilino_id    bigint not null references public.persona(id),

  tipo_contrato   text not null default 'vivienda'
                  check (tipo_contrato in ('vivienda','comercial','cochera','temporal','otro')),
  fecha_inicio    date not null,
  fecha_fin       date not null,
  dia_vencimiento integer not null default 10,

  monto_inicial   bigint not null,
  moneda          text not null default 'ARS' check (moneda in ('ARS','USD')),
  deposito        bigint default 0,

  ajuste_tipo     text not null default 'porcentaje'
                  check (ajuste_tipo in ('sin_ajuste','porcentaje','indice')),
  ajuste_meses    integer default 6,
  ajuste_valor    numeric,
  indice_codigo   text references public.indice(codigo),
  indice_valor_base numeric,

  comision_admin_pct numeric,
  liquidacion_garantizada boolean not null default false,

  -- Mora configurable por contrato (NULL cae al default de config).
  punitorio_diario_pct numeric,
  dias_gracia_mora     integer,

  -- Contrato que ya estaba en curso al cargarlo (migracion 014).
  monto_actual            bigint,
  fecha_inicio_generacion date,

  -- Trazabilidad de renovacion (migracion 004).
  contrato_origen_id bigint references public.contrato(id),

  estado          text not null default 'vigente'
                  check (estado in ('vigente','vencido','rescindido','renovado')),
  fecha_rescision date,
  motivo_rescision text,
  notas           text,
  creado_en       timestamptz not null default now()
);

create index if not exists idx_contrato_estado    on public.contrato(estado);
create index if not exists idx_contrato_fecha_fin on public.contrato(fecha_fin);
create index if not exists idx_contrato_propiedad on public.contrato(propiedad_id);
create index if not exists idx_contrato_origen    on public.contrato(contrato_origen_id);

create table if not exists public.contrato_garante (
  id            bigint generated always as identity primary key,
  contrato_id   bigint not null references public.contrato(id) on delete cascade,
  persona_id    bigint not null references public.persona(id),
  tipo_garantia text default 'personal'
                check (tipo_garantia in ('personal','propietaria','seguro_caucion','recibo_sueldo')),
  detalle       text,
  unique (contrato_id, persona_id)
);

create table if not exists public.contrato_ajuste (
  id             bigint generated always as identity primary key,
  contrato_id    bigint not null references public.contrato(id) on delete cascade,
  fecha_vigencia date not null,
  monto_anterior bigint not null,
  monto_nuevo    bigint not null,
  indice_tipo    text,
  indice_valor   numeric,
  observaciones  text,
  creado_en      timestamptz not null default now()
);

-- Clausulas adicionales con titulo propio (migracion 017).
create table if not exists public.contrato_clausula (
  id          bigint generated always as identity primary key,
  contrato_id bigint not null references public.contrato(id) on delete cascade,
  orden       integer not null default 0,
  titulo      text not null,
  texto       text not null
);

create index if not exists idx_contrato_clausula_contrato on public.contrato_clausula(contrato_id);

-- Excepcion de cobro por acuerdo informal: no toca el contrato, solo
-- lo que Cobranzas efectivamente cobra (migracion 007).
create table if not exists public.contrato_excepcion_cobro (
  id               bigint generated always as identity primary key,
  contrato_id      bigint not null references public.contrato(id) on delete cascade,
  tipo             text not null default 'pausar_ajuste'
                   check (tipo in ('pausar_ajuste')),
  fecha_desde      date not null,
  fecha_hasta      date not null,
  monto_congelado  bigint not null,
  motivo           text not null,
  anulada          boolean not null default false,
  motivo_anulacion text,
  creado_en        timestamptz not null default now()
);

create index if not exists idx_excepcion_contrato on public.contrato_excepcion_cobro(contrato_id);

-- ---------------------------------------------------------------------
-- Cuotas (se generan todas por adelantado al crear el contrato)
-- ---------------------------------------------------------------------
create table if not exists public.cuota (
  id                  bigint generated always as identity primary key,
  contrato_id         bigint not null references public.contrato(id) on delete cascade,
  periodo             text not null,                 -- 'AAAA-MM'
  fecha_vencimiento   date not null,
  monto_alquiler      bigint not null,
  monto_expensas      bigint not null default 0,
  monto_otros         bigint not null default 0,
  monto_punitorio     bigint not null default 0,
  detalle_otros       text,
  bonificacion        bigint not null default 0,
  motivo_bonificacion text,
  estado              text not null default 'pendiente'
                      check (estado in ('pendiente','parcial','pagada','anulada')),
  creado_en           timestamptz not null default now()
);

-- La unicidad de periodo vale solo entre cuotas NO anuladas (migracion 020):
-- dos anuladas del mismo periodo, o una anulada y una activa, son historia normal.
create unique index if not exists idx_cuota_periodo_activa
  on public.cuota(contrato_id, periodo) where estado <> 'anulada';
create index if not exists idx_cuota_vencimiento on public.cuota(fecha_vencimiento);
create index if not exists idx_cuota_estado      on public.cuota(estado);

-- ---------------------------------------------------------------------
-- Recibos (numeracion interna correlativa, no fiscal)
-- ---------------------------------------------------------------------
create table if not exists public.recibo (
  id            bigint generated always as identity primary key,
  numero        integer not null,
  serie         text not null default 'A',
  tipo          text not null default 'inquilino'
                check (tipo in ('inquilino','propietario','vario')),
  fecha_emision date not null default current_date,
  persona_id    bigint not null references public.persona(id),
  total         bigint not null,
  concepto      text,
  detalle_json  jsonb,
  formato       text default 'a4_doble'
                check (formato in ('a4_doble','a4_simple','medio_a4','mini')),
  anulado       boolean not null default false,
  creado_en     timestamptz not null default now(),
  unique (serie, numero, tipo)
);

-- ---------------------------------------------------------------------
-- Pagos / cobros a inquilinos
-- ---------------------------------------------------------------------
create table if not exists public.pago (
  id              bigint generated always as identity primary key,
  persona_id      bigint not null references public.persona(id),
  contrato_id     bigint references public.contrato(id),
  fecha_pago      date not null,
  monto           bigint not null,
  moneda          text not null default 'ARS' check (moneda in ('ARS','USD')),
  cotizacion      numeric default 1,
  medio_pago      text not null default 'efectivo'
                  check (medio_pago in ('efectivo','transferencia','cheque','deposito',
                                        'mercadopago','tarjeta','digital','otro')),
  comision_monto  bigint not null default 0,
  referencia      text,
  recibo_id       bigint references public.recibo(id),
  observaciones   text,
  anulado         boolean not null default false,
  motivo_anulacion text,
  creado_en       timestamptz not null default now()
);

create index if not exists idx_pago_fecha   on public.pago(fecha_pago);
create index if not exists idx_pago_persona on public.pago(persona_id);

-- Circuito del cheque: detalle 1 a 1 de un pago con medio_pago = 'cheque'.
create table if not exists public.pago_cheque (
  id                 bigint generated always as identity primary key,
  pago_id            bigint not null unique references public.pago(id) on delete cascade,
  banco              text,
  numero             text,
  fecha_cheque       date,
  estado             text not null default 'en_cartera'
                     check (estado in ('en_cartera','depositado','acreditado','rechazado')),
  fecha_deposito     date,
  fecha_acreditacion date,
  motivo_rechazo     text,
  creado_en          timestamptz not null default now()
);

-- Imputacion de un pago a una cuota concreta y concepto.
create table if not exists public.pago_imputacion (
  id        bigint generated always as identity primary key,
  pago_id   bigint not null references public.pago(id) on delete cascade,
  cuota_id  bigint not null references public.cuota(id),
  concepto  text not null default 'alquiler'
            check (concepto in ('alquiler','expensas','punitorio','otros')),
  monto     bigint not null
);

create index if not exists idx_imputacion_cuota on public.pago_imputacion(cuota_id);
create index if not exists idx_imputacion_pago  on public.pago_imputacion(pago_id);

-- ---------------------------------------------------------------------
-- Liquidaciones a propietarios y gastos
-- ---------------------------------------------------------------------
create table if not exists public.liquidacion (
  id             bigint generated always as identity primary key,
  persona_id     bigint not null references public.persona(id),
  periodo        text not null,
  fecha_emision  date not null default current_date,
  total_cobrado  bigint not null default 0,
  total_comision bigint not null default 0,
  total_gastos   bigint not null default 0,
  total_neto     bigint not null default 0,
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente','pagada','anulada')),
  fecha_pago     date,
  medio_pago     text,
  recibo_id      bigint references public.recibo(id),
  observaciones  text,
  creado_en      timestamptz not null default now()
);

create table if not exists public.liquidacion_detalle (
  id             bigint generated always as identity primary key,
  liquidacion_id bigint not null references public.liquidacion(id) on delete cascade,
  propiedad_id   bigint references public.propiedad(id),
  cuota_id       bigint references public.cuota(id),
  concepto       text not null,
  tipo           text not null default 'cobro'
                 check (tipo in ('cobro','comision','gasto')),
  monto          bigint not null,
  porcentaje_prop numeric default 100
);

create table if not exists public.gasto (
  id             bigint generated always as identity primary key,
  propiedad_id   bigint not null references public.propiedad(id),
  fecha          date not null,
  concepto       text not null,
  monto          bigint not null,
  comprobante    text,
  liquidado      boolean not null default false,
  liquidacion_id bigint references public.liquidacion(id),
  anulado        boolean not null default false,
  creado_en      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Ventas (fuera del nucleo, pero movimiento_caja la referencia)
-- ---------------------------------------------------------------------
create table if not exists public.operacion_venta (
  id              bigint generated always as identity primary key,
  propiedad_id    bigint not null references public.propiedad(id),
  comprador_id    bigint references public.persona(id),
  fecha_reserva   date,
  monto_reserva   bigint,
  fecha_boleto    date,
  fecha_escritura date,
  monto_operacion bigint not null,
  moneda          text not null default 'USD' check (moneda in ('ARS','USD')),
  comision_pct    numeric,
  comision_monto  bigint,
  comision_cobrada boolean not null default false,
  estado          text not null default 'reserva'
                  check (estado in ('reserva','boleto','escriturada','caida')),
  notas           text,
  creado_en       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Caja diaria
-- ---------------------------------------------------------------------
create table if not exists public.movimiento_caja (
  id             bigint generated always as identity primary key,
  fecha          date not null,
  tipo           text not null check (tipo in ('ingreso','egreso')),
  categoria      text not null
                 check (categoria in ('cobro_alquiler','cobro_expensas',
                                      'comision_alquiler','comision_venta',
                                      'liquidacion_propietario','gasto_propiedad',
                                      'gasto_operativo','sueldo','impuesto',
                                      'aporte','retiro','ajuste','otro')),
  concepto       text not null,
  monto          bigint not null,
  moneda         text not null default 'ARS' check (moneda in ('ARS','USD')),
  medio_pago     text not null default 'efectivo',
  pago_id        bigint references public.pago(id),
  liquidacion_id bigint references public.liquidacion(id),
  operacion_id   bigint references public.operacion_venta(id),
  gasto_id       bigint references public.gasto(id),
  persona_id     bigint references public.persona(id),
  propiedad_id   bigint references public.propiedad(id),
  es_resultado   boolean not null default false,
  observaciones  text,
  anulado        boolean not null default false,
  creado_en      timestamptz not null default now()
);

create index if not exists idx_caja_fecha on public.movimiento_caja(fecha);

-- Desglose de un cobro o del pago de una liquidacion entre varios medios
-- de pago (migracion 013). La suma tiene que dar el total exacto.
create table if not exists public.medio_pago_detalle (
  id             bigint generated always as identity primary key,
  pago_id        bigint references public.pago(id) on delete cascade,
  liquidacion_id bigint references public.liquidacion(id) on delete cascade,
  medio_pago     text not null check (medio_pago in
                 ('efectivo','transferencia','cheque','deposito',
                  'mercadopago','tarjeta','digital','otro')),
  monto          bigint not null,
  referencia     text,
  comision_monto bigint not null default 0,
  check ((pago_id is not null)::int + (liquidacion_id is not null)::int = 1)
);

create index if not exists idx_mpd_pago        on public.medio_pago_detalle(pago_id);
create index if not exists idx_mpd_liquidacion on public.medio_pago_detalle(liquidacion_id);

-- =====================================================================
-- Vistas (portadas de InmoGestion: 001 -> 003 -> 007 -> 016 -> 020)
-- =====================================================================

create or replace view public.v_cuota_saldo as
select
  c.id as cuota_id,
  c.contrato_id,
  c.periodo,
  c.fecha_vencimiento,
  c.estado,
  (c.monto_alquiler + c.monto_expensas + c.monto_otros + c.monto_punitorio - c.bonificacion) as total_cuota,
  coalesce((select sum(pi.monto) from public.pago_imputacion pi
            join public.pago p on p.id = pi.pago_id
            where pi.cuota_id = c.id and p.anulado = false), 0) as total_pagado,
  (c.monto_alquiler + c.monto_expensas + c.monto_otros + c.monto_punitorio - c.bonificacion)
    - coalesce((select sum(pi.monto) from public.pago_imputacion pi
                join public.pago p on p.id = pi.pago_id
                where pi.cuota_id = c.id and p.anulado = false), 0) as saldo
from public.cuota c
where c.estado <> 'anulada';

create or replace view public.v_morosidad as
select
  vs.cuota_id,
  ct.id as contrato_id,
  pe.id as persona_id,
  pe.nombre as inquilino,
  pe.telefono,
  trim(coalesce(pr.calle,'') || ' ' || coalesce(pr.numero,'')) as direccion,
  vs.periodo,
  vs.fecha_vencimiento,
  vs.saldo,
  (current_date - vs.fecha_vencimiento) as dias_atraso
from public.v_cuota_saldo vs
join public.contrato  ct on ct.id = vs.contrato_id
join public.persona   pe on pe.id = ct.inquilino_id
join public.propiedad pr on pr.id = ct.propiedad_id
where vs.saldo > 0 and vs.fecha_vencimiento < current_date;

create or replace view public.v_propiedad_listado as
select
  p.id,
  p.codigo,
  p.tipo,
  p.operacion,
  p.estado,
  trim(coalesce(p.calle,'') || ' ' || coalesce(p.numero,'')) as direccion,
  p.barrio,
  p.localidad,
  p.dormitorios,
  p.superficie_total,
  p.precio_alquiler,
  p.moneda_alquiler,
  p.precio_venta,
  p.moneda_venta,
  p.publicar_web,
  p.activo,
  (select string_agg(pe.nombre, ', ')
   from public.propiedad_propietario pp
   join public.persona pe on pe.id = pp.persona_id
   where pp.propiedad_id = p.id) as propietarios,
  (select count(*) from public.propiedad_foto f where f.propiedad_id = p.id) as fotos
from public.propiedad p;
