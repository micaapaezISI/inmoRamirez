/* =====================================================================
   INMOBILIARIA RAMIREZ — asistente virtual (chatbot gratuito)
   ---------------------------------------------------------------------
   Las consultas rápidas y las preguntas frecuentes se responden al
   instante con datos reales del negocio (encuesta del cliente), sin
   costo ni servicios externos. Lo que no matchea ninguna palabra clave
   se manda a la Edge Function "chatbot" (Supabase + Gemini, capa
   gratuita) para una respuesta con IA; si esa función no responde,
   deriva a WhatsApp para no perder la consulta.
   ===================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  const WSP_NUMBER = "5493885875116";
  const wspLink = (text) => `https://wa.me/${WSP_NUMBER}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
  const CHATBOT_ENDPOINT = "https://cjgezgkbkchqrlueieau.supabase.co/functions/v1/chatbot";

  const TOPICS = [
    {
      id: "zonas",
      label: "¿Dónde trabajan?",
      keywords: ["zona", "donde", "ubicac", "cubr", "quiaca", "jujuy", "salvador"],
      answer:
        "Trabajamos en <strong>La Quiaca</strong> y <strong>San Salvador de Jujuy</strong>: casas, departamentos, terrenos, locales comerciales y fincas.",
    },
    {
      id: "servicios",
      label: "¿Qué servicios ofrecen?",
      keywords: ["servicio", "tasacion", "administra", "permuta", "que hacen"],
      answer:
        "Ofrecemos <strong>tasaciones</strong>, <strong>administración de alquileres</strong>, <strong>ventas</strong> y <strong>permutas</strong> de propiedades.",
    },
    {
      id: "propiedades",
      label: "Ver propiedades disponibles",
      keywords: ["propiedad", "casa", "departamento", "terreno", "local", "finca", "comprar", "vender"],
      answer:
        'Podés ver todo lo disponible en venta, alquiler y alquiler temporario en <a href="propiedades.html">Propiedades</a>.',
    },
    {
      id: "alquiler",
      label: "¿Cómo actualizo un alquiler?",
      keywords: ["alquiler", "actualiza", "icl", "ipc", "renov", "aumento"],
      answer:
        'Usá nuestra <a href="calculadora.html">calculadora de actualización de alquileres</a>, que trabaja con los índices oficiales (ICL, IPC, CER, UVA y UVI) del BCRA.',
    },
    {
      id: "turismo",
      label: "Turismo en La Quiaca",
      keywords: ["turismo", "turis", "conocer", "visitar", "lugares"],
      answer:
        'Si venís a la zona, mirá nuestra guía de <a href="turismo.html">Turismo</a> con los puntos más lindos de La Puna.',
    },
    {
      id: "quien",
      label: "¿Quién los atiende?",
      keywords: ["quien", "martiller", "matricula", "atiende", "titular", "duena", "dueña"],
      answer:
        "Te atiende siempre la misma persona: la única martillera matriculada de La Quiaca (Matrícula CMJ Nro. 348), sin intermediarios. Conocé más en <a href=\"nosotros.html\">Nosotros</a>.",
    },
    {
      id: "contacto",
      label: "Dirección y contacto",
      keywords: ["contacto", "direccion", "donde queda", "oficina", "telefono", "sarmiento"],
      answer:
        'Nuestra oficina está en <strong>Sarmiento 495, Centro, La Quiaca, Jujuy</strong>. Vas a encontrar el mapa y el formulario en <a href="contacto.html">Contacto</a>.',
    },
  ];

  function normalize(str) {
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  }

  function matchTopic(text) {
    const q = normalize(text);
    return TOPICS.find((t) => t.keywords.some((k) => q.includes(k)));
  }

  /* ---------------------------------------------------------------------
     Estructura del widget (se inyecta entera, no depende de marcado en
     cada página; así alcanza con un solo <script> por página).
     --------------------------------------------------------------------- */
  const root = document.createElement("div");
  root.className = "rc-chatbot";
  root.innerHTML = `
    <button type="button" class="rc-launcher" aria-label="Abrir el asistente virtual" aria-expanded="false">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/>
      </svg>
      <span class="rc-launcher-icon-close" aria-hidden="true">×</span>
    </button>
    <section class="rc-panel" role="dialog" aria-label="Asistente virtual de Inmobiliaria Ramirez" hidden>
      <header class="rc-panel-header">
        <div>
          <strong>Asistente Ramirez</strong>
          <span>Consultas al instante · sin costo</span>
        </div>
        <button type="button" class="rc-close" aria-label="Cerrar asistente">×</button>
      </header>
      <div class="rc-messages" role="log" aria-live="polite"></div>
      <div class="rc-quick-replies"></div>
      <form class="rc-input-row">
        <input type="text" class="rc-input" placeholder="Escribí tu consulta..." aria-label="Escribí tu consulta" autocomplete="off">
        <button type="submit" class="rc-send" aria-label="Enviar consulta">➤</button>
      </form>
    </section>
  `;
  document.body.appendChild(root);

  const launcher = root.querySelector(".rc-launcher");
  const panel = root.querySelector(".rc-panel");
  const closeBtn = root.querySelector(".rc-close");
  const messages = root.querySelector(".rc-messages");
  const quickReplies = root.querySelector(".rc-quick-replies");
  const form = root.querySelector(".rc-input-row");
  const input = root.querySelector(".rc-input");

  function addMessage(content, from, { html = false } = {}) {
    const msg = document.createElement("div");
    msg.className = `rc-msg rc-msg-${from}`;
    if (html) {
      msg.innerHTML = content;
    } else {
      msg.textContent = content;
    }
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
    return msg;
  }

  function showTyping() {
    const msg = document.createElement("div");
    msg.className = "rc-msg rc-msg-bot rc-typing";
    msg.innerHTML = "<span></span><span></span><span></span>";
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
    return msg;
  }

  async function askAI(text) {
    try {
      const res = await fetch(CHATBOT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) throw new Error(`la función del asistente respondió ${res.status}`);
      const data = await res.json();
      if (!data.reply) throw new Error("respuesta vacía del asistente");
      return data.reply;
    } catch (err) {
      console.error("Asistente IA no disponible, derivo a WhatsApp:", err);
      return null;
    }
  }

  function renderQuickReplies() {
    quickReplies.innerHTML = "";
    TOPICS.forEach((t) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rc-chip";
      btn.textContent = t.label;
      btn.addEventListener("click", () => handleQuery(t.label, t));
      quickReplies.appendChild(btn);
    });
    const wspBtn = document.createElement("a");
    wspBtn.className = "rc-chip rc-chip-wsp";
    wspBtn.href = wspLink("Hola, tengo una consulta sobre una propiedad.");
    wspBtn.target = "_blank";
    wspBtn.rel = "noopener";
    wspBtn.textContent = "Hablar con un asesor";
    quickReplies.appendChild(wspBtn);
  }

  async function handleQuery(text, knownTopic) {
    addMessage(text, "user");
    const topic = knownTopic || matchTopic(text);

    if (topic) {
      window.setTimeout(() => addMessage(topic.answer, "bot", { html: true }), 250);
      return;
    }

    const typing = showTyping();
    const reply = await askAI(text);
    typing.remove();

    if (reply) {
      addMessage(reply, "bot");
    } else {
      addMessage(
        `No pude generar una respuesta ahora mismo. Escribile directo a la inmobiliaria y te responde a la brevedad: <a href="${wspLink(
          text
        )}" target="_blank" rel="noopener">hablar por WhatsApp</a>.`,
        "bot",
        { html: true }
      );
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    handleQuery(text);
    input.value = "";
  });

  let started = false;
  function openPanel() {
    panel.hidden = false;
    root.classList.add("is-open");
    launcher.setAttribute("aria-expanded", "true");
    if (!started) {
      started = true;
      addMessage(
        "¡Hola! Soy el asistente virtual de Inmobiliaria Ramirez. Elegí una consulta rápida o escribime lo que necesitás saber.",
        "bot"
      );
      renderQuickReplies();
    }
    input.focus();
  }

  function closePanel() {
    panel.hidden = true;
    root.classList.remove("is-open");
    launcher.setAttribute("aria-expanded", "false");
  }

  launcher.addEventListener("click", () => (panel.hidden ? openPanel() : closePanel()));
  closeBtn.addEventListener("click", closePanel);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) closePanel();
  });
});
