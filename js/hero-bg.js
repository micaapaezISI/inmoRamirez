/* =====================================================================
   INMOBILIARIA RAMIREZ — fondo del hero de Inicio
   ---------------------------------------------------------------------
   Ciclo de fotos de La Quiaca, Quebrada de Humahuaca, Tilcara, Humahuaca
   y Abra Pampa (licencia libre, créditos en el pie de página) con
   crossfade + zoom lento. Precarga la siguiente foto antes de mostrarla
   para que no haya destellos ni saltos.
   ===================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  const bg = document.querySelector(".hero-bg");
  if (!bg) return;

  const slides = bg.querySelectorAll(".hero-bg-slide");
  if (slides.length < 2) return;

  // Patrón pedido por la clienta: un cartel de bienvenida, una foto de
  // paisaje, cartel, paisaje... (las 3 fotos de carteles son propias,
  // sacadas por ella misma — no llevan crédito de Wikimedia).
  const IMAGES = [
    "img/hero/cartel-la-quiaca.png",
    "img/hero/quebrada-hornocal.jpg",
    "img/hero/cartel-humahuaca.png",
    "img/hero/puna-siete-colores.jpg",
    "img/hero/cartel-tilcara.png",
    "img/hero/quebrada-paleta-pintor.jpg",
    "img/hero/humahuaca-cabildo.jpg",
    "img/hero/quebrada-cerro.jpg",
    "img/hero/la-quiaca-mercado.jpg",
    "img/hero/quebrada-pucara-tilcara.jpg",
    "img/hero/humahuaca-capilla.jpg",
    "img/hero/humahuaca-amanecer.jpg",
    "img/hero/tilcara-adobe.jpg",
    "img/hero/puna-atardecer-abrapampa.jpg",
  ];

  let [front, back] = slides;
  let index = 0;

  front.style.backgroundImage = `url('${IMAGES[0]}')`;
  front.classList.add("is-active");

  if (IMAGES.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  function preload(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = resolve;
      img.src = src;
    });
  }

  async function showNext() {
    index = (index + 1) % IMAGES.length;
    await preload(IMAGES[index]);
    back.style.backgroundImage = `url('${IMAGES[index]}')`;
    back.classList.add("is-active");
    front.classList.remove("is-active");
    [front, back] = [back, front];
  }

  setInterval(showNext, 4500);
});
