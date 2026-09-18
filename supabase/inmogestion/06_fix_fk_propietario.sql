-- =====================================================================
-- INMOGESTION dentro del panel de Inmobiliaria Ramirez
-- Fix — la FK de propiedad_propietario.persona_id apuntaba mal
--
-- Encontrado probando el módulo "Inmuebles" de punta a punta: al asignar
-- un propietario a un inmueble, el guardado fallaba con "hay datos que
-- dependen de este registro" (violación de foreign key). La causa: la
-- restricción `propiedad_propietario_persona_id_fkey` referenciaba una
-- tabla `personas` (plural) — un resto vacío (0 filas) de un borrador
-- de esquema anterior — en vez de `persona` (singular, la tabla real
-- que usa todo el resto del sistema). El archivo `01_schema.sql` SIEMPRE
-- tuvo bien la referencia a `persona`; esta única restricción quedó mal
-- en algún momento por fuera de los archivos versionados.
--
-- Este fix solo toca esa restricción puntual — se confirmó por consulta
-- directa a information_schema que ninguna otra tabla tiene el mismo
-- problema. La tabla `personas` (plural) queda sin usar (vacía); no se
-- borra acá por las dudas, es una limpieza aparte si se quiere.
--
-- Correr después de 01 a 05. Es idempotente.
-- =====================================================================

alter table public.propiedad_propietario
  drop constraint if exists propiedad_propietario_persona_id_fkey;

alter table public.propiedad_propietario
  add constraint propiedad_propietario_persona_id_fkey
  foreign key (persona_id) references public.persona(id);
