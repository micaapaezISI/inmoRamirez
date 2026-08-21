/* =====================================================================
   INMOBILIARIA RAMIREZ — datos de propiedades DE EJEMPLO
   ---------------------------------------------------------------------
   Estos datos son ficticios (placeholder), pensados solo para mostrar
   cómo se va a ver el sitio. Cuando tengan las propiedades reales,
   hay que reemplazar este array por los datos/fotos verdaderas
   (o conectarlo a un panel administrable / base de datos).
   ===================================================================== */

const PROPERTIES = [
  {
    id: 1,
    title: "Casa 3 dormitorios con patio",
    operation: "venta",
    type: "casa",
    zone: "Barrio Cruce",
    address: "Barrio Cruce, La Quiaca",
    price: 68000,
    currency: "USD",
    bedrooms: 3,
    bathrooms: 2,
    area: 180,
    featured: true,
    seed: 1,
    description:
      "Casa amplia de una planta a pocas cuadras del cruce internacional, con patio con parrilla, garage para dos autos y ambientes luminosos. Ideal para familia. Construcción sólida, apta crédito.",
    amenities: ["Garage doble", "Patio con parrilla", "Calefacción a leña", "Tanque de agua propio", "Portón automático", "Cocina comedor"],
  },
  {
    id: 2,
    title: "Departamento a estrenar con balcón",
    operation: "venta",
    type: "departamento",
    zone: "Centro",
    address: "a metros de Av. España, Centro",
    price: 42000,
    currency: "USD",
    bedrooms: 2,
    bathrooms: 1,
    area: 62,
    featured: true,
    seed: 2,
    description:
      "Departamento a estrenar en pleno centro, a pasos de comercios y del cruce fronterizo. Living comedor integrado, balcón y excelente iluminación natural.",
    amenities: ["A estrenar", "Balcón", "Cocina integrada", "Portero eléctrico", "Cerca de comercios", "Apto crédito"],
  },
  {
    id: 3,
    title: "Terreno amplio zona residencial",
    operation: "venta",
    type: "terreno",
    zone: "Barrio Belgrano",
    address: "Barrio Belgrano, La Quiaca",
    price: 15000,
    currency: "USD",
    bedrooms: 0,
    bathrooms: 0,
    area: 300,
    featured: false,
    seed: 3,
    description:
      "Lote de 300 m² en zona residencial en crecimiento, apto para construcción. Todos los servicios en la esquina. Documentación al día.",
    amenities: ["Servicios en esquina", "Documentación al día", "Zona en crecimiento", "Apto construcción"],
  },
  {
    id: 4,
    title: "Casa céntrica 2 dormitorios en alquiler",
    operation: "alquiler",
    type: "casa",
    zone: "Centro",
    address: "Centro, La Quiaca",
    price: 180000,
    currency: "ARS",
    bedrooms: 2,
    bathrooms: 1,
    area: 90,
    featured: true,
    seed: 4,
    description:
      "Casa céntrica lista para habitar, ideal para familia o profesionales. Cocina comedor, patio chico y muy buena ubicación a pocas cuadras de la terminal.",
    amenities: ["Lista para habitar", "Cerca de la terminal", "Patio", "Cocina comedor"],
  },
  {
    id: 5,
    title: "Departamento 1 dormitorio amoblado",
    operation: "alquiler",
    type: "departamento",
    zone: "Barrio Ferroviario",
    address: "Barrio Ferroviario, La Quiaca",
    price: 130000,
    currency: "ARS",
    bedrooms: 1,
    bathrooms: 1,
    area: 45,
    featured: false,
    seed: 5,
    description:
      "Monoambiente amplio totalmente amoblado, ideal para una persona o pareja. Cocina equipada y muy buena orientación.",
    amenities: ["Amoblado", "Cocina equipada", "Agua caliente central", "Buena orientación"],
  },
  {
    id: 6,
    title: "Cabaña para alquiler temporario",
    operation: "temporal",
    type: "casa",
    zone: "Zona Puna / Yavi",
    address: "camino a Yavi, cercanías de La Quiaca",
    price: 45000,
    currency: "ARS",
    bedrooms: 2,
    bathrooms: 1,
    area: 70,
    featured: true,
    seed: 6,
    description:
      "Cabaña de estilo puneño para estadías cortas, ideal para visitar Yavi y la Quebrada. Precio por noche, apta para hasta 4 personas.",
    amenities: ["Ropa de cama incluida", "Wifi", "Estufa a gas", "Cochera", "Apta 4 personas"],
  },
  {
    id: 7,
    title: "Local comercial sobre avenida",
    operation: "venta",
    type: "local",
    zone: "Centro",
    address: "sobre Av. Costanera, Centro",
    price: 55000,
    currency: "USD",
    bedrooms: 0,
    bathrooms: 1,
    area: 110,
    featured: false,
    seed: 7,
    description:
      "Local comercial en esquina de alto tránsito peatonal y vehicular, cerca del paso fronterizo. Excelente para comercio o depósito.",
    amenities: ["Esquina", "Alto tránsito", "Baño instalado", "Persiana de seguridad", "Cerca de frontera"],
  },
  {
    id: 8,
    title: "Finca con vivienda en zona rural",
    operation: "venta",
    type: "finca",
    zone: "Zona rural / Puna",
    address: "zona rural, alrededores de La Quiaca",
    price: 38000,
    currency: "USD",
    bedrooms: 2,
    bathrooms: 1,
    area: 5000,
    featured: false,
    seed: 8,
    description:
      "Finca de aproximadamente media hectárea con vivienda básica, pozo de agua y espacio para huerta o animales. Tranquilidad de la Puna a minutos de la ciudad.",
    amenities: ["Pozo de agua", "Espacio para huerta", "Vivienda básica incluida", "Acceso vehicular"],
  },
  {
    id: 9,
    title: "Departamento 2 dormitorios alquiler temporario",
    operation: "temporal",
    type: "departamento",
    zone: "Centro",
    address: "Centro, a 5 cuadras del cruce",
    price: 38000,
    currency: "ARS",
    bedrooms: 2,
    bathrooms: 1,
    area: 58,
    featured: false,
    seed: 9,
    description:
      "Departamento equipado ideal para turismo o viajes de trabajo, a pocas cuadras del cruce internacional. Precio por noche, cocina completa.",
    amenities: ["Cocina completa", "Wifi", "Ropa de cama incluida", "Cerca del cruce internacional"],
  },
];

/* ---------------------------------------------------------------------
   Helper: genera una "foto" placeholder en SVG (gradiente + ícono) para
   no depender de imágenes externas mientras no haya fotos reales.
   seed determina el color; label es el texto que se muestra.
   --------------------------------------------------------------------- */
const PH_PALETTES = [
  ["#ddc2a4", "#b98a68"], // arcilla / adobe al sol
  ["#dbb8b4", "#a67d79"], // rosa polvoroso (flamencos de Pozuelos)
  ["#d3c6a6", "#a3987a"], // piedra / arena del altiplano
  ["#c3c7ab", "#a9ad8f"], // salvia pálida (yareta y tola)
  ["#cbbabd", "#a08e91"], // malva pálido (cielo puneño al atardecer)
  ["#e0cba3", "#b89c73"], // arena tostada clara
];

function placeholderPhotoSVG(seed, label) {
  const pal = PH_PALETTES[seed % PH_PALETTES.length];
  const gid = `g${seed}-${Math.random().toString(36).slice(2, 7)}`;
  return `
  <svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${pal[0]}"/>
        <stop offset="100%" stop-color="${pal[1]}"/>
      </linearGradient>
    </defs>
    <rect width="400" height="300" fill="url(#${gid})"/>
    <g opacity="0.85" transform="translate(200,128)">
      <path d="M-38 8 L0 -28 L38 8 L38 42 L-38 42 Z" fill="none" stroke="#faf3ea" stroke-width="4" stroke-linejoin="round"/>
      <rect x="-10" y="16" width="20" height="26" fill="#faf3ea" opacity="0.9"/>
    </g>
    <text x="200" y="200" text-anchor="middle" fill="#faf3ea" font-family="Poppins, sans-serif" font-size="15" opacity="0.9">${label}</text>
    <text x="200" y="222" text-anchor="middle" fill="#faf3ea" font-family="Inter, sans-serif" font-size="11" opacity="0.6">Foto de referencia — reemplazar por foto real</text>
  </svg>`;
}

function operationLabel(op) {
  return { venta: "Venta", alquiler: "Alquiler", temporal: "Temporario" }[op] || op;
}

function typeLabel(t) {
  return (
    { casa: "Casa", departamento: "Departamento", terreno: "Terreno", local: "Local comercial", finca: "Finca" }[t] || t
  );
}

function formatPrice(p) {
  const amount = p.currency === "USD" ? p.price.toLocaleString("es-AR") : p.price.toLocaleString("es-AR");
  const suffix = p.operation === "temporal" ? " / noche" : p.operation === "alquiler" ? " / mes" : "";
  return `${p.currency === "USD" ? "USD" : "$"} ${amount}${suffix}`;
}
