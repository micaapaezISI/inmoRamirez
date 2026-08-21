-- =====================================================================
-- INMOBILIARIA RAMIREZ — agrega estado activo/inactivo a propiedades
-- Correr esto en: Supabase Dashboard → SQL Editor → New query
-- (Sumate esto porque ya corriste supabase/schema.sql antes; este
-- archivo solo agrega lo nuevo, no vuelve a crear nada que ya existe.)
-- =====================================================================

alter table public.properties
  add column if not exists active boolean not null default true;
