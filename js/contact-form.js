/* =====================================================================
   INMOBILIARIA RAMIREZ — formulario de contacto
   ---------------------------------------------------------------------
   Como todavía no hay backend, el formulario arma un mensaje y lo abre
   directamente en WhatsApp con los datos cargados. El día que quieran
   recibir los mensajes también por email, se puede sumar un servicio
   de envío de formularios (Formspree, EmailJS, un backend propio, etc.)
   sin tener que tocar el diseño.
   ===================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contact-form");
  if (!form) return;

  const feedback = document.getElementById("contact-feedback");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const name = data.get("name") || "";
    const phone = data.get("phone") || "";
    const email = data.get("email") || "";
    const reason = data.get("reason") || "";
    const message = data.get("message") || "";

    const text = encodeURIComponent(
      `Hola, soy ${name}.\n` +
        (reason ? `Motivo: ${reason}\n` : "") +
        `Teléfono: ${phone}\n` +
        (email ? `Email: ${email}\n` : "") +
        `Mensaje: ${message}`
    );

    const whatsappNumber = "5493885123456"; // [WHATSAPP] — número de ejemplo, actualizar por el real
    window.open(`https://wa.me/${whatsappNumber}?text=${text}`, "_blank");

    if (feedback) {
      feedback.style.display = "block";
      feedback.textContent = "¡Gracias! Te estamos redirigiendo a WhatsApp para enviar tu consulta.";
    }
    form.reset();
  });
});
