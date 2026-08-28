/* =====================================================================
   INMOBILIARIA RAMIREZ — página de Turismo
   ---------------------------------------------------------------------
   Al pasar el mouse (o tocar, en celular) sobre una locación recomendada,
   aparece un popover compartido con una foto de referencia y un mapa de
   Google Maps embebido (sin API key, con el mismo esquema ?q=...&output=embed
   que ya se usa en Contacto), más un botón "Cómo llegar" que abre
   Google Maps con la ruta desde la ubicación del visitante.

   Las fotos son placeholders (todavía no hay fotos reales de estos
   lugares) — mismo estilo que los placeholders de propiedades.
   ===================================================================== */

const TOURISM_PH_PALETTES = [
  ["#ddc2a4", "#b98a68"],
  ["#dbb8b4", "#a67d79"],
  ["#d3c6a6", "#a3987a"],
  ["#c3c7ab", "#a9ad8f"],
  ["#cbbabd", "#a08e91"],
  ["#e0cba3", "#b89c73"],
];

function tourismPlaceholderSVG(seedText, label) {
  let hash = 0;
  for (let i = 0; i < seedText.length; i++) hash = (hash * 31 + seedText.charCodeAt(i)) >>> 0;
  const pal = TOURISM_PH_PALETTES[hash % TOURISM_PH_PALETTES.length];
  const gid = `tp${hash}`;
  return `
  <svg viewBox="0 0 320 160" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${pal[0]}"/>
        <stop offset="100%" stop-color="${pal[1]}"/>
      </linearGradient>
    </defs>
    <rect width="320" height="160" fill="url(#${gid})"/>
    <text x="160" y="82" text-anchor="middle" fill="#faf3ea" font-family="Poppins, sans-serif" font-size="13" font-weight="600" opacity="0.9">${label}</text>
    <text x="160" y="102" text-anchor="middle" fill="#faf3ea" font-family="Inter, sans-serif" font-size="10" opacity="0.65">Foto de referencia — agregar foto real</text>
  </svg>`;
}

function initTourismMaps() {
  const cards = document.querySelectorAll("[data-map-q]");
  if (cards.length === 0) return;

  const popover = document.createElement("div");
  popover.className = "map-popover";
  popover.innerHTML = `
    <div class="map-popover-photo" data-mp-photo></div>
    <div class="map-popover-map"><iframe data-mp-iframe loading="lazy" title="Mapa de la ubicación"></iframe></div>
    <a class="map-popover-directions" data-mp-directions target="_blank" rel="noopener">📍 Cómo llegar</a>
  `;
  document.body.appendChild(popover);

  const iframe = popover.querySelector("[data-mp-iframe]");
  const photoBox = popover.querySelector("[data-mp-photo]");
  const directionsLink = popover.querySelector("[data-mp-directions]");

  let currentCard = null;
  let hideTimer = null;

  function position(card) {
    const rect = card.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    popover.style.width = `${width}px`;

    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - width - 12));

    const estimatedHeight = photoBox.style.display === "none" ? 190 : 310;
    let top = rect.bottom + 10;
    if (top + estimatedHeight > window.innerHeight) {
      top = rect.top - estimatedHeight - 10;
      if (top < 12) top = 12;
    }

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function show(card) {
    clearTimeout(hideTimer);
    currentCard = card;

    const query = card.dataset.mapQ;
    const label = card.dataset.mapLabel || query;
    const skipPhoto = card.dataset.mapSkipPhoto === "true";
    const realPhoto = card.dataset.mapPhoto;
    const encoded = encodeURIComponent(query);

    photoBox.style.display = skipPhoto ? "none" : "block";
    if (!skipPhoto) {
      photoBox.innerHTML = realPhoto
        ? `<img src="${realPhoto}" alt="${label}" loading="lazy">`
        : tourismPlaceholderSVG(query, label);
    }

    const mapSrc = `https://www.google.com/maps?q=${encoded}&output=embed`;
    if (iframe.dataset.currentSrc !== mapSrc) {
      iframe.src = mapSrc;
      iframe.dataset.currentSrc = mapSrc;
    }
    directionsLink.href = `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;

    position(card);
    popover.classList.add("is-visible");
  }

  function hide() {
    hideTimer = setTimeout(() => {
      popover.classList.remove("is-visible");
      currentCard = null;
    }, 180);
  }

  const canHover = window.matchMedia("(hover: hover)").matches;

  cards.forEach((card) => {
    card.classList.add("has-map-trigger");
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Ver foto y mapa de ${card.dataset.mapLabel || card.dataset.mapQ}`);

    card.addEventListener("mouseenter", () => show(card));
    card.addEventListener("mouseleave", hide);
    card.addEventListener("focus", () => show(card));
    card.addEventListener("blur", hide);

    if (!canHover) {
      card.addEventListener("click", (e) => {
        e.preventDefault();
        if (currentCard === card && popover.classList.contains("is-visible")) {
          popover.classList.remove("is-visible");
          currentCard = null;
        } else {
          show(card);
        }
      });
    }
  });

  popover.addEventListener("mouseenter", () => clearTimeout(hideTimer));
  popover.addEventListener("mouseleave", hide);

  document.addEventListener("click", (e) => {
    if (!popover.contains(e.target) && !e.target.closest("[data-map-q]")) {
      popover.classList.remove("is-visible");
      currentCard = null;
    }
  });

  window.addEventListener("scroll", () => {
    if (currentCard) position(currentCard);
  });
}

document.addEventListener("DOMContentLoaded", initTourismMaps);
