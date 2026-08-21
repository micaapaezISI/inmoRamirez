/* =====================================================================
   INMOBILIARIA RAMIREZ — render de la página de detalle de propiedad
   Lee el parámetro ?id= de la URL y busca la propiedad en PROPERTIES
   (properties-data.js). Reemplazar por una consulta a datos reales
   cuando existan.
   ===================================================================== */

const WHATSAPP_NUMBER = "5493885123456"; // [WHATSAPP] — número de ejemplo, actualizar por el real

function initPropertyDetail() {
  const root = document.getElementById("property-detail-root");
  if (!root) return;

  const id = parseInt(new URLSearchParams(window.location.search).get("id"), 10);
  const property = PROPERTIES.find((p) => p.id === id) || PROPERTIES[0];

  document.title = `${property.title} · Inmobiliaria Ramirez`;

  document.getElementById("breadcrumb-title").textContent = property.title;

  document.getElementById("detail-gallery").innerHTML = `
    <div class="detail-gallery-main">${placeholderPhotoSVG(property.seed, typeLabel(property.type))}</div>
    <div class="detail-gallery-side">
      <div>${placeholderPhotoSVG(property.seed + 1, "Interior")}</div>
      <div>${placeholderPhotoSVG(property.seed + 2, "Exterior")}</div>
    </div>
  `;

  const badgeClass =
    property.operation === "venta" ? "badge-venta" : property.operation === "alquiler" ? "badge-alquiler" : "badge-temporal";

  document.getElementById("detail-body").innerHTML = `
    <div class="detail-header">
      <div class="detail-title">
        <span class="property-badge ${badgeClass}" style="position:static; display:inline-block; margin-bottom:10px;">${operationLabel(property.operation)}</span>
        <h1>${property.title}</h1>
        <div class="property-location">📍 ${property.address} · ${property.zone}</div>
      </div>
      <div class="detail-price">
        ${formatPrice(property)}
        <small>${typeLabel(property.type)}</small>
      </div>
    </div>

    <div class="detail-features">
      ${property.bedrooms ? `<div><strong>${property.bedrooms}</strong><span>Dormitorios</span></div>` : ""}
      ${property.bathrooms ? `<div><strong>${property.bathrooms}</strong><span>Baños</span></div>` : ""}
      <div><strong>${property.area}</strong><span>m²</span></div>
      <div><strong>${typeLabel(property.type)}</strong><span>Tipo</span></div>
    </div>

    <div class="detail-desc">
      <h2>Descripción</h2>
      <p>${property.description}</p>
    </div>

    <div class="detail-amenities">
      <h2>Características</h2>
      <ul class="amenities-grid">
        ${property.amenities.map((a) => `<li><span class="check-ico" style="width:20px;height:20px;font-size:0.7rem;">✓</span> ${a}</li>`).join("")}
      </ul>
    </div>
  `;

  const message = encodeURIComponent(
    `Hola, vi la propiedad "${property.title}" (código ${property.id}) en la web y quiero más información.`
  );

  document.getElementById("detail-sidebar").innerHTML = `
    <div class="sidebar-agent">
      <div class="avatar-ph">IR</div>
      <div>
        <strong>Inmobiliaria Ramirez</strong>
        <span>Atención personalizada</span>
      </div>
    </div>
    <div class="sidebar-actions">
      <a class="btn btn-whatsapp btn-block" href="https://wa.me/${WHATSAPP_NUMBER}?text=${message}" target="_blank" rel="noopener">💬 Consultar por WhatsApp</a>
      <a class="btn btn-dark btn-block" href="tel:+5493885123456">📞 Llamar ahora</a>
      <a class="btn btn-outline btn-block" style="color:var(--color-primary); border-color:var(--color-border);" href="contacto.html">✉️ Enviar consulta por formulario</a>
    </div>
  `;

  // Propiedades relacionadas
  const related = PROPERTIES.filter((p) => p.id !== property.id && p.type === property.type).slice(0, 3);
  const relatedList = related.length ? related : PROPERTIES.filter((p) => p.id !== property.id).slice(0, 3);
  const relatedGrid = document.getElementById("related-grid");
  if (relatedGrid) relatedGrid.innerHTML = relatedList.map(renderPropertyCard).join("");
}

document.addEventListener("DOMContentLoaded", initPropertyDetail);
