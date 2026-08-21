-- =====================================================================
-- INMOBILIARIA RAMIREZ — esquema de Supabase
-- Correr esto una sola vez en: Supabase Dashboard → SQL Editor → New query
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabla de propiedades
-- ---------------------------------------------------------------------
create table if not exists public.properties (
  id bigint generated always as identity primary key,
  title text not null,
  operation text not null check (operation in ('venta', 'alquiler', 'temporal')),
  type text not null check (type in ('casa', 'departamento', 'terreno', 'local', 'finca')),
  zone text,
  address text,
  price numeric not null default 0,
  currency text not null default 'USD' check (currency in ('USD', 'ARS')),
  bedrooms int not null default 0,
  bathrooms int not null default 0,
  area numeric not null default 0,
  featured boolean not null default false,
  description text,
  amenities text[] not null default '{}',
  images text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.properties enable row level security;

-- Cualquiera puede leer las propiedades (para que se vean en el sitio público)
create policy "Public read properties"
  on public.properties for select
  using (true);

-- Solo un usuario logueado (el/la admin) puede crear, editar o borrar
create policy "Authenticated insert properties"
  on public.properties for insert
  to authenticated
  with check (true);

create policy "Authenticated update properties"
  on public.properties for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated delete properties"
  on public.properties for delete
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- Tabla de mensajes de contacto (leads)
-- ---------------------------------------------------------------------
create table if not exists public.contact_messages (
  id bigint generated always as identity primary key,
  name text not null,
  phone text,
  email text,
  reason text,
  message text,
  created_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;

-- Cualquier visitante puede enviar un mensaje (insert), pero no leer los demás
create policy "Public insert contact_messages"
  on public.contact_messages for insert
  to anon, authenticated
  with check (true);

-- Solo el/la admin logueado puede ver los mensajes recibidos
create policy "Authenticated read contact_messages"
  on public.contact_messages for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- Storage: bucket público para las fotos de propiedades
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('property-photos', 'property-photos', true)
on conflict (id) do nothing;

create policy "Public read property photos"
  on storage.objects for select
  using (bucket_id = 'property-photos');

create policy "Authenticated upload property photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'property-photos');

create policy "Authenticated update property photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'property-photos');

create policy "Authenticated delete property photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'property-photos');

-- ---------------------------------------------------------------------
-- Datos de ejemplo (los mismos que estaban hardcodeados en el sitio),
-- para que no quede vacío mientras cargan las propiedades reales.
-- Se pueden borrar después desde el panel admin.
-- ---------------------------------------------------------------------
insert into public.properties
  (title, operation, type, zone, address, price, currency, bedrooms, bathrooms, area, featured, description, amenities)
values
  ('Casa 3 dormitorios con patio', 'venta', 'casa', 'Barrio Cruce', 'Barrio Cruce, La Quiaca', 68000, 'USD', 3, 2, 180, true,
   'Casa amplia de una planta a pocas cuadras del cruce internacional, con patio con parrilla, garage para dos autos y ambientes luminosos. Ideal para familia. Construcción sólida, apta crédito.',
   array['Garage doble','Patio con parrilla','Calefacción a leña','Tanque de agua propio','Portón automático','Cocina comedor']),
  ('Departamento a estrenar con balcón', 'venta', 'departamento', 'Centro', 'a metros de Av. España, Centro', 42000, 'USD', 2, 1, 62, true,
   'Departamento a estrenar en pleno centro, a pasos de comercios y del cruce fronterizo. Living comedor integrado, balcón y excelente iluminación natural.',
   array['A estrenar','Balcón','Cocina integrada','Portero eléctrico','Cerca de comercios','Apto crédito']),
  ('Terreno amplio zona residencial', 'venta', 'terreno', 'Barrio Belgrano', 'Barrio Belgrano, La Quiaca', 15000, 'USD', 0, 0, 300, false,
   'Terreno en zona residencial en pleno crecimiento, apto para construir, con todos los servicios cerca.',
   array['Todos los servicios cerca','Apto para construir','Zona en crecimiento']);
