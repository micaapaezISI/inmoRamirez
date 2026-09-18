-- =====================================================================
-- INMOGESTION dentro del panel de Inmobiliaria Ramirez
-- Fase de seguridad — blindar RLS para que sea específicamente la admin
--
-- Hasta ahora las políticas de TODAS las tablas (properties,
-- contact_messages, storage y las 22 de InmoGestión) eran
-- `to authenticated using (true)` — es decir, "cualquiera que esté
-- logueado", sin chequear QUIÉN. Combinado con el auto-registro público
-- de Supabase Auth (que se cierra aparte, desde el dashboard/API), eso
-- significaba que cualquier persona podía crearse una cuenta y tener
-- acceso total de lectura/escritura/borrado a toda la base: propiedades,
-- contactos, personas, contratos, pagos, caja.
--
-- Esta migración agrega una función is_admin() que compara el email de
-- la sesión contra la cuenta admin real, y la usa en vez de `true` en
-- cada política que antes solo pedía "estar logueado".
--
-- Correr después de 01, 02, 03 y 04. Es idempotente.
-- =====================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select auth.jwt() ->> 'email' = 'paezmicaelaagustina@gmail.com';
$$;

-- ---------------------------------------------------------------------
-- Las 22 tablas de InmoGestión (mismo patrón que 02_rls.sql, ahora con
-- is_admin() en vez de `true`).
-- ---------------------------------------------------------------------
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
    execute format('drop policy if exists %I on public.%I', 'panel_select_' || t, t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())',
                   'panel_select_' || t, t);

    execute format('drop policy if exists %I on public.%I', 'panel_insert_' || t, t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())',
                   'panel_insert_' || t, t);

    execute format('drop policy if exists %I on public.%I', 'panel_update_' || t, t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())',
                   'panel_update_' || t, t);

    execute format('drop policy if exists %I on public.%I', 'panel_delete_' || t, t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())',
                   'panel_delete_' || t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- properties (sitio público): la lectura sigue siendo pública a propósito
-- (así se ven los avisos en la web) — solo se blinda escritura/borrado.
-- ---------------------------------------------------------------------
drop policy if exists "Authenticated insert properties" on public.properties;
create policy "Authenticated insert properties"
  on public.properties for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Authenticated update properties" on public.properties;
create policy "Authenticated update properties"
  on public.properties for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Authenticated delete properties" on public.properties;
create policy "Authenticated delete properties"
  on public.properties for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- contact_messages: cualquier visitante puede seguir MANDANDO un mensaje
-- (insert queda público a propósito, es el formulario de contacto) —
-- solo se blinda la lectura de los mensajes ya recibidos.
-- ---------------------------------------------------------------------
drop policy if exists "Authenticated read contact_messages" on public.contact_messages;
create policy "Authenticated read contact_messages"
  on public.contact_messages for select
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- Storage: la lectura de fotos sigue pública (se ven en el sitio) —
-- solo se blinda subir/editar/borrar.
-- ---------------------------------------------------------------------
drop policy if exists "Authenticated upload property photos" on storage.objects;
create policy "Authenticated upload property photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'property-photos' and public.is_admin());

drop policy if exists "Authenticated update property photos" on storage.objects;
create policy "Authenticated update property photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'property-photos' and public.is_admin());

drop policy if exists "Authenticated delete property photos" on storage.objects;
create policy "Authenticated delete property photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'property-photos' and public.is_admin());
