/* =====================================================================
   INMOBILIARIA RAMIREZ — conexión a Supabase
   La "publishable key" es pública por diseño (equivalente a la anon key
   de proyectos nuevos de Supabase): solo permite lo que las políticas
   de RLS habiliten para el rol "anon". No es un secreto.
   ===================================================================== */

const SUPABASE_URL = "https://cjgezgkbkchqrlueieau.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_4RIEijLMMkTcU5B3QlxJAA_7MEjh48X";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
