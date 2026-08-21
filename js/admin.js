/* =====================================================================
   INMOBILIARIA RAMIREZ — Panel admin / Cargar propiedad (demo front-end)
   ===================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  const pmRoot = document.querySelector("[data-pm-root]");
  if (!pmRoot) return;

  const photoManager = createPhotoManager(pmRoot);

  const form = document.getElementById("admin-property-form");
  const resultBox = document.getElementById("admin-result");

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const data = new FormData(form);
    const images = photoManager.getImages();

    const title = data.get("title") || "(sin título)";
    const currency = data.get("currency") === "ARS" ? "$" : "USD";
    const price = parseFloat(data.get("price")) || 0;
    const operation = { venta: "Venta", alquiler: "Alquiler", temporal: "Alquiler temporario" }[data.get("operation")] || data.get("operation");

    let thumbsHtml = "";
    if (images.length > 0) {
      thumbsHtml = `
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:14px;">
          ${images
            .slice(0, 8)
            .map(
              (img, i) => `
            <div style="width:72px; height:72px; border-radius:8px; overflow:hidden; border:2px solid ${i === 0 ? "var(--color-secondary)" : "var(--color-border)"}; position:relative;">
              <img src="${img.url}" alt="${img.name}" style="width:100%; height:100%; object-fit:cover;">
              ${i === 0 ? `<span style="position:absolute; bottom:0; left:0; right:0; background:rgba(46,35,24,0.75); color:#fff; font-size:0.6rem; text-align:center; padding:1px 0;">Portada</span>` : ""}
            </div>`
            )
            .join("")}
          ${images.length > 8 ? `<div style="display:flex; align-items:center; justify-content:center; width:72px; height:72px; border-radius:8px; background:var(--color-bg-alt); color:var(--color-text-light); font-size:0.8rem; font-weight:700;">+${images.length - 8}</div>` : ""}
        </div>`;
    }

    resultBox.style.display = "block";
    resultBox.innerHTML = `
      <div class="admin-card" style="border-color: var(--color-secondary); background: var(--color-bg-alt);">
        <h2>✅ Propiedad lista (vista previa)</h2>
        <p class="admin-card-desc">Así quedaría cargada. Recordá: todavía no se publicó de verdad — falta conectar esto a un backend.</p>
        <p><strong>${title}</strong> — ${operation} — ${currency} ${price.toLocaleString("es-AR")}</p>
        <p style="color:var(--color-text-light); font-size:0.9rem;">${images.length} foto${images.length === 1 ? "" : "s"} cargada${images.length === 1 ? "" : "s"}${images.length ? `, portada: "${images[0].name}"` : ""}.</p>
        ${thumbsHtml}
      </div>`;

    resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});
