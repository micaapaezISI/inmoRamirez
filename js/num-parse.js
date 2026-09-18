/* =====================================================================
   INMOBILIARIA RAMIREZ — parseo de números en formato argentino
   ---------------------------------------------------------------------
   Un <input type="number"> nativo solo admite UN separador decimal: si
   alguien escribe un monto con puntos de miles ("1.500.000"), el navegador
   descarta el segundo punto en silencio y el valor queda mal (1.5 en vez
   de un millón y medio) — sin ningún error visible. Por eso los campos de
   dinero, porcentaje e índice del sitio usan <input type="text"
   inputmode="decimal"> y pasan por estas funciones en vez de type="number".

   Tres funciones porque NO es la misma lógica para los tres casos:
     - parseArMoney: los montos casi siempre superan los miles → el punto
       de miles se descarta siempre, la coma decimal se traduce a punto.
     - parseArPercent: los porcentajes casi siempre son menores a 100 →
       nunca llevan separador de miles. Si hay coma, es el decimal. Si NO
       hay coma pero SÍ un único punto, ese punto se toma como decimal
       (no se descarta a ciegas) — "10.5" tecleado así es un decimal real.
     - parseArIndex: valores de índice/tasa que sí pueden superar los
       miles y necesitar varios decimales a la vez (ej. "4.521,8734") —
       misma lógica que el dinero pero sin redondear a 2 decimales.

   Devuelven `null` si el texto no se puede convertir a un número válido
   (nunca NaN ni 0 en silencio), para que quien llama pueda avisar en vez
   de guardar un dato corrompido.
   ===================================================================== */

function parseArMoney(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const limpio = String(valor).trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : null;
}

function parseArPercent(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  let texto = String(valor).trim().replace(/\s/g, "");
  if (texto.includes(",")) {
    // Coma presente: es el separador decimal. Cualquier punto que además
    // aparezca sí se puede descartar (un porcentaje nunca lleva miles).
    texto = texto.replace(/\./g, "").replace(",", ".");
  }
  // Si no hay coma, un punto solo se deja tal cual (podría ser un decimal
  // real tipeado así, ej. "10.5") — nunca se lo descarta a ciegas acá.
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

function parseArIndex(valor) {
  // Mismo criterio que el dinero (puede superar los miles), pero sin
  // redondear a centavos — se conservan los decimales tal cual vengan.
  return parseArMoney(valor);
}
