-- =====================================================================
-- INMOGESTION dentro del panel de Inmobiliaria Ramirez
-- Fase 8 — Sincronización de `propiedad` (gestión) -> `properties` (web)
--
-- El sitio público sigue leyendo la tabla `properties` (schema.sql). Un
-- inmueble cargado en el módulo de gestión con "Mostrar en la web pública"
-- tildado aparece automáticamente en el sitio; si se destilda o se da de
-- baja, desaparece.
--
-- Las filas de `properties` cargadas a mano desde el panel web viejo NO se
-- tocan: la sincronización solo maneja las filas que tienen `propiedad_id`.
--
-- Correr después de 01, 02 y 03. Idempotente.
-- =====================================================================

alter table public.properties add column if not exists propiedad_id bigint unique references public.propiedad(id) on delete set null;

create or replace function ig_sync_propiedad_web()
returns trigger
language plpgsql
security definer          -- escribe en `properties`, cuyas policies de insert/update
set search_path = public  -- exigen `authenticated`; el trigger corre por cuenta del sistema
as $$
declare
  v_prop      public.propiedad%rowtype;
  v_operation text;
  v_type      text;
  v_price     bigint;
  v_currency  text;
  v_address   text;
  v_images    text[];
begin
  -- Determinar sobre qué propiedad estamos (viene de propiedad o de propiedad_foto)
  if tg_table_name = 'propiedad' then
    v_prop := new;
  else
    select * into v_prop from public.propiedad where id = coalesce(new.propiedad_id, old.propiedad_id);
    if not found then return coalesce(new, old); end if;
  end if;

  -- Si no se publica (o está de baja): sacar de la web si estaba.
  if v_prop.publicar_web is not true or v_prop.activo is not true then
    delete from public.properties where propiedad_id = v_prop.id;
    return coalesce(new, old);
  end if;

  -- Mapeo de operación (properties no tiene 'ambas')
  v_operation := case
    when v_prop.operacion = 'venta' then 'venta'
    when v_prop.operacion = 'alquiler' then 'alquiler'
    else case when v_prop.precio_alquiler is not null and v_prop.precio_alquiler > 0 then 'alquiler' else 'venta' end
  end;

  v_type := case v_prop.tipo
    when 'casa' then 'casa' when 'departamento' then 'departamento'
    when 'terreno' then 'terreno' when 'campo' then 'finca'
    when 'local' then 'local' when 'oficina' then 'local'
    when 'galpon' then 'local' when 'cochera' then 'local'
    else 'casa' end;

  if v_operation = 'venta' then
    v_price := coalesce(v_prop.precio_venta, 0); v_currency := coalesce(v_prop.moneda_venta, 'USD');
  else
    v_price := coalesce(v_prop.precio_alquiler, 0); v_currency := coalesce(v_prop.moneda_alquiler, 'ARS');
  end if;

  v_address := case when v_prop.ocultar_direccion then coalesce(v_prop.barrio, v_prop.localidad, '')
                    else trim(coalesce(v_prop.calle,'') || ' ' || coalesce(v_prop.numero,'')) end;

  select coalesce(array_agg(archivo order by orden, id), '{}')
    into v_images from public.propiedad_foto where propiedad_id = v_prop.id;

  insert into public.properties
    (propiedad_id, title, operation, type, zone, address, price, currency,
     bedrooms, bathrooms, area, description, amenities, images, active)
  values (
    v_prop.id,
    coalesce(nullif(v_prop.titulo_publico,''), nullif(v_address,''), 'Propiedad'),
    v_operation, v_type, v_prop.barrio, v_address,
    (v_price / 100.0), v_currency,
    coalesce(v_prop.dormitorios, 0), coalesce(v_prop.banos, 0),
    coalesce(v_prop.superficie_total, 0),
    coalesce(nullif(v_prop.descripcion_publica,''), v_prop.descripcion),
    '{}', v_images, true
  )
  on conflict (propiedad_id) do update set
    title = excluded.title, operation = excluded.operation, type = excluded.type,
    zone = excluded.zone, address = excluded.address, price = excluded.price,
    currency = excluded.currency, bedrooms = excluded.bedrooms, bathrooms = excluded.bathrooms,
    area = excluded.area, description = excluded.description, images = excluded.images,
    active = true;

  return coalesce(new, old);
end $$;

drop trigger if exists trg_sync_propiedad_web on public.propiedad;
create trigger trg_sync_propiedad_web
  after insert or update on public.propiedad
  for each row execute function ig_sync_propiedad_web();

drop trigger if exists trg_sync_propiedad_foto_web on public.propiedad_foto;
create trigger trg_sync_propiedad_foto_web
  after insert or update or delete on public.propiedad_foto
  for each row execute function ig_sync_propiedad_web();
