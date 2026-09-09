-- =====================================================================
-- INMOGESTION dentro del panel de Inmobiliaria Ramirez
-- Fase 1 — Row Level Security
--
-- El panel de gestion es de uso interno: TODO (leer, crear, editar,
-- marcar de baja) queda restringido a un usuario logueado con Supabase
-- Auth. Nada de esto es visible para el publico anonimo del sitio.
--
-- El sitio publico sigue leyendo de la tabla `properties` (esquema en
-- ingles, schema.sql) — esa no se toca. La unificacion de `propiedad`
-- (InmoGestion) con `properties` (web) queda para una fase posterior.
--
-- Correr despues de 01_schema.sql. Es idempotente: se puede volver a correr.
-- =====================================================================

do $$
declare
  t text;
  tablas text[] := array[
    'config','persona','propiedad','propiedad_propietario','propiedad_foto',
    'indice','indice_valor','contrato','contrato_garante','contrato_ajuste',
    'contrato_clausula','contrato_excepcion_cobro','cuota','recibo','pago',
    'pago_cheque','pago_imputacion','liquidacion','liquidacion_detalle',
    'gasto','operacion_venta','movimiento_caja','medio_pago_detalle'
  ];
begin
  foreach t in array tablas loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', 'panel_select_' || t, t);
    execute format('create policy %I on public.%I for select to authenticated using (true)',
                   'panel_select_' || t, t);

    execute format('drop policy if exists %I on public.%I', 'panel_insert_' || t, t);
    execute format('create policy %I on public.%I for insert to authenticated with check (true)',
                   'panel_insert_' || t, t);

    execute format('drop policy if exists %I on public.%I', 'panel_update_' || t, t);
    execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)',
                   'panel_update_' || t, t);

    -- La app usa bajas logicas (activo / estado / anulado), nunca DELETE;
    -- el policy existe solo para correcciones administrativas puntuales.
    execute format('drop policy if exists %I on public.%I', 'panel_delete_' || t, t);
    execute format('create policy %I on public.%I for delete to authenticated using (true)',
                   'panel_delete_' || t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Vistas: que corran con los permisos de quien consulta (no del owner),
-- para que la RLS de las tablas base se aplique de verdad.
-- ---------------------------------------------------------------------
alter view public.v_cuota_saldo       set (security_invoker = on);
alter view public.v_morosidad         set (security_invoker = on);
alter view public.v_propiedad_listado set (security_invoker = on);

grant select on public.v_cuota_saldo       to authenticated;
grant select on public.v_morosidad         to authenticated;
grant select on public.v_propiedad_listado to authenticated;
