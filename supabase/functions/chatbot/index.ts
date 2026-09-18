// =====================================================================
// INMOBILIARIA RAMIREZ — asistente virtual con IA (Gemini)
// ---------------------------------------------------------------------
// Recibe { message: string }, arma un prompt con datos reales del
// negocio + el inventario activo de propiedades (para no inventar
// precios ni disponibilidad) y devuelve { reply: string }.
//
// Secreto requerido: GEMINI_API_KEY (Google AI Studio, capa gratuita).
// Desplegar con verify_jwt = false (ver supabase/config.toml): lo llama
// gente anónima desde el sitio público, sin login.
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_MODEL = "gemini-2.0-flash";
const WSP_LINK = "https://wa.me/5493885875116";

const OPERATION_LABEL: Record<string, string> = {
  venta: "venta",
  alquiler: "alquiler",
  temporal: "alquiler temporario",
};

const TYPE_LABEL: Record<string, string> = {
  casa: "casa",
  departamento: "departamento",
  terreno: "terreno",
  local: "local comercial",
  finca: "finca",
};

function buildSystemPrompt(propertiesSummary: string): string {
  return `Sos el asistente virtual de Inmobiliaria Ramirez, la única inmobiliaria de La Quiaca (Jujuy, Argentina). Atendida siempre por su titular, la única martillera matriculada de la ciudad (Matrícula CMJ Nro. 348) — no hay equipo de ventas, la misma persona acompaña toda la operación.

Datos reales del negocio (no inventes nada que no esté en este mensaje):
- Zona de trabajo: La Quiaca y San Salvador de Jujuy.
- Servicios: tasaciones, administración de alquileres, ventas y permutas.
- Tipos de propiedad: casas, departamentos, terrenos, locales comerciales y fincas.
- Oficina: Sarmiento 495, Centro, La Quiaca, Jujuy.
- Contacto: WhatsApp (${WSP_LINK}). No hay email público.

Propiedades activas publicadas ahora mismo:
${propertiesSummary || "(sin datos de inventario disponibles en este momento; no afirmes que hay o no hay stock)"}

Instrucciones:
- Respondé en español rioplatense, tono cercano y profesional, en 2 a 4 oraciones.
- No inventes precios, direcciones ni disponibilidad que no estén en este mensaje.
- Si preguntan algo sin relación con la inmobiliaria, respondé amablemente que no podés ayudar con eso.
- Si quieren coordinar una visita, avanzar con una propiedad puntual, o necesitan algo que no podés resolver con esta información, invitalos a escribir por WhatsApp.
- Nunca uses markdown ni HTML: solo texto plano.`;
}

function propertiesSummaryText(rows: any[]): string {
  return rows
    .map((p) => {
      const tipo = TYPE_LABEL[p.type] || p.type;
      const operacion = OPERATION_LABEL[p.operation] || p.operation;
      const zona = p.zone ? ` en ${p.zone}` : "";
      return `- ${p.title} · ${tipo} en ${operacion}${zona} · ${p.currency} ${p.price}`;
    })
    .join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { message } = await req.json();
    if (!message || typeof message !== "string" || message.trim().length === 0 || message.length > 500) {
      return new Response(JSON.stringify({ error: "Mensaje inválido" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) throw new Error("Falta configurar el secreto GEMINI_API_KEY");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);

    const { data: properties, error: propsError } = await supabase
      .from("properties")
      .select("title, operation, type, zone, price, currency")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(25);

    if (propsError) console.error("No se pudo leer el inventario de propiedades:", propsError);

    const summary = propertiesSummaryText(properties || []);

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildSystemPrompt(summary) }] },
          contents: [{ role: "user", parts: [{ text: message }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 300 },
        }),
      }
    );

    if (!geminiRes.ok) {
      console.error("Gemini respondió con error:", geminiRes.status, await geminiRes.text());
      throw new Error("Gemini request failed");
    }

    const geminiData = await geminiRes.json();
    const reply: string | undefined = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!reply) throw new Error("Respuesta vacía de Gemini");

    return new Response(JSON.stringify({ reply }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error en chatbot edge function:", err);
    return new Response(JSON.stringify({ error: "No se pudo generar una respuesta" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
