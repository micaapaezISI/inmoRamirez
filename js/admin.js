/* =====================================================================
   INMOBILIARIA RAMIREZ — Panel admin (conectado a Supabase)
   ---------------------------------------------------------------------
   - Login con email/password (Supabase Auth). Solo un usuario logueado
     puede administrar el panel (ver políticas RLS en supabase/schema.sql
     y supabase/inmogestion/02_rls.sql). El usuario admin se crea a mano
     desde el dashboard de Supabase (Authentication → Users → Add user).
   - Sidebar único: Hoy / Inmuebles / Destacadas / Personas / Alquileres /
     Cobranzas / Liquidaciones / Caja / Mensajes / Configuración. Las 8
     pestañas de gestión viven todas dentro de #tab-panel-gestion y se
     enrutan con la lógica que antes vivía en js/gestion/app.js (ahora
     integrada acá para que todo comparta una sola URL, sin redirigir a
     gestion.html).
   ===================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  const loginWrap = document.getElementById("admin-login-wrap");
  const loginForm = document.getElementById("admin-login-form");
  const loginError = document.getElementById("admin-login-error");
  const loginLockout = document.getElementById("admin-login-lockout");
  const forgotLink = document.getElementById("admin-forgot-link");
  const recoverForm = document.getElementById("admin-recover-form");
  const recoverMsg = document.getElementById("admin-recover-msg");
  const recoverCancel = document.getElementById("admin-recover-cancel");
  const resetWrap = document.getElementById("admin-reset-wrap");
  const resetForm = document.getElementById("admin-reset-form");
  const resetError = document.getElementById("admin-reset-error");
  const panel = document.getElementById("admin-panel");
  const logoutBtn = document.getElementById("admin-logout");

  const tabButtons = document.querySelectorAll(".admin-sidebar-link");
  const tabPanels = document.querySelectorAll(".admin-tab-panel");
  const featuredBox = document.getElementById("admin-featured-list");
  const messagesBox = document.getElementById("admin-messages-list");

  const GESTION_TABS = new Set([
    "inicio", "inmuebles", "personas", "alquileres",
    "cobranzas", "liquidaciones", "caja", "configuracion",
  ]);

  /* ---------------------------- Pestañas ---------------------------- */
  function switchTab(tabName) {
    tabButtons.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.tab === tabName));
    const targetPanelId = GESTION_TABS.has(tabName) ? "tab-panel-gestion" : `tab-panel-${tabName}`;
    tabPanels.forEach((panelEl) => {
      panelEl.style.display = panelEl.id === targetPanelId ? "block" : "none";
    });
    if (GESTION_TABS.has(tabName)) gestionIrAModulo(tabName);
    window.scrollTo({ top: panel.offsetTop - 20, behavior: "smooth" });
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  /* ------------------------------ Sesión ----------------------------- */
  function showLoggedIn() {
    loginWrap.style.display = "none";
    resetWrap.style.display = "none";
    panel.style.display = "block";
    loadFeaturedList();
    loadMessages();
    gestionIrAModulo("inicio");
  }

  function showLoggedOut() {
    loginWrap.style.display = "block";
    resetWrap.style.display = "none";
    panel.style.display = "none";
    loginForm.style.display = "block";
    forgotLink.style.display = "inline-block";
    recoverForm.style.display = "none";
    recoverCancel.style.display = "none";
  }

  function showResetPassword() {
    loginWrap.style.display = "none";
    panel.style.display = "none";
    resetWrap.style.display = "block";
  }

  supabaseClient.auth.getSession().then(({ data }) => {
    if (data.session) showLoggedIn();
    else showLoggedOut();
  });

  supabaseClient.auth.onAuthStateChange((event, session) => {
    // Supabase manda este evento cuando la persona entra desde el link del
    // mail de "olvidé mi contraseña" — la sesión temporal solo sirve para
    // elegir la contraseña nueva, no para entrar directo al panel.
    if (event === "PASSWORD_RECOVERY") {
      showResetPassword();
      return;
    }
    if (session) showLoggedIn();
    else showLoggedOut();
  });

  /* --------------------- Límite de intentos de login ------------------- */
  // Freno del lado del cliente (además de la protección real, que es RLS +
  // auto-registro cerrado): 5 intentos fallidos seguidos bloquean el botón
  // 5 minutos. Se guarda en localStorage para que sobreviva a un F5.
  const LOGIN_LOCK_KEY = "admin_login_lock";
  const LOGIN_MAX_ATTEMPTS = 5;
  const LOGIN_LOCK_MINUTES = 5;
  let lockoutInterval;

  function leerEstadoBloqueo() {
    try {
      const st = JSON.parse(localStorage.getItem(LOGIN_LOCK_KEY));
      if (st && typeof st.attempts === "number" && typeof st.lockedUntil === "number") return st;
    } catch (_e) { /* localStorage no disponible o corrupto: seguir sin bloqueo */ }
    return { attempts: 0, lockedUntil: 0 };
  }
  function guardarEstadoBloqueo(st) {
    try { localStorage.setItem(LOGIN_LOCK_KEY, JSON.stringify(st)); } catch (_e) { /* nada que hacer */ }
  }
  function actualizarBloqueoUI() {
    clearInterval(lockoutInterval);
    const submitBtn = loginForm.querySelector("button[type=submit]");
    const mostrarRestante = () => {
      const ms = leerEstadoBloqueo().lockedUntil - Date.now();
      if (ms <= 0) {
        loginLockout.style.display = "none";
        submitBtn.disabled = false;
        clearInterval(lockoutInterval);
        return;
      }
      const min = Math.floor(ms / 60000);
      const seg = Math.ceil((ms % 60000) / 1000);
      loginLockout.textContent = `Demasiados intentos fallidos. Probá de nuevo en ${min > 0 ? `${min} min ` : ""}${seg}s.`;
      loginLockout.style.display = "block";
      submitBtn.disabled = true;
    };
    mostrarRestante();
    if (leerEstadoBloqueo().lockedUntil > Date.now()) {
      lockoutInterval = setInterval(mostrarRestante, 1000);
    }
  }
  function registrarIntentoFallido() {
    const st = leerEstadoBloqueo();
    const attempts = st.attempts + 1;
    if (attempts >= LOGIN_MAX_ATTEMPTS) {
      guardarEstadoBloqueo({ attempts: 0, lockedUntil: Date.now() + LOGIN_LOCK_MINUTES * 60000 });
    } else {
      guardarEstadoBloqueo({ attempts, lockedUntil: st.lockedUntil });
    }
    actualizarBloqueoUI();
  }
  function limpiarBloqueo() {
    guardarEstadoBloqueo({ attempts: 0, lockedUntil: 0 });
    actualizarBloqueoUI();
  }
  actualizarBloqueoUI(); // restaura el bloqueo si se recargó la página a mitad de la espera

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.style.display = "none";
    const data = new FormData(loginForm);

    // Trampa para bots: una persona nunca completa este campo (está oculto
    // con CSS). Si viene con algo, se descarta en silencio.
    if (data.get("website")) return;

    if (leerEstadoBloqueo().lockedUntil > Date.now()) {
      actualizarBloqueoUI();
      return;
    }

    const { error } = await supabaseClient.auth.signInWithPassword({
      email: data.get("email"),
      password: data.get("password"),
    });
    if (error) {
      registrarIntentoFallido();
      loginError.textContent = "No se pudo ingresar: " + error.message;
      loginError.style.display = "block";
    } else {
      limpiarBloqueo();
      loginForm.reset();
    }
  });

  /* ------------------------ Olvidé mi contraseña ------------------------ */
  forgotLink.addEventListener("click", () => {
    loginForm.style.display = "none";
    forgotLink.style.display = "none";
    loginError.style.display = "none";
    recoverMsg.style.display = "none";
    recoverForm.style.display = "block";
    recoverCancel.style.display = "inline-block";
  });
  recoverCancel.addEventListener("click", () => {
    recoverForm.style.display = "none";
    recoverCancel.style.display = "none";
    loginForm.style.display = "block";
    forgotLink.style.display = "inline-block";
  });
  recoverForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(recoverForm);
    const submitBtn = recoverForm.querySelector("button[type=submit]");
    submitBtn.disabled = true;

    const { error } = await supabaseClient.auth.resetPasswordForEmail(data.get("email"), {
      redirectTo: window.location.origin + window.location.pathname,
    });
    if (error) console.error("resetPasswordForEmail:", error);

    submitBtn.disabled = false;
    // Mismo mensaje haya o no error: no revelar si ese mail tiene cuenta o no.
    recoverMsg.textContent = "Si ese email tiene una cuenta, te llega un link para elegir una contraseña nueva.";
    recoverMsg.style.display = "block";
    recoverForm.reset();
  });

  resetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    resetError.style.display = "none";
    const data = new FormData(resetForm);
    const password = data.get("password");
    const passwordConfirm = data.get("passwordConfirm");

    if (password !== passwordConfirm) {
      resetError.textContent = "Las dos contraseñas no coinciden.";
      resetError.style.display = "block";
      return;
    }

    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) {
      resetError.textContent = "No se pudo guardar la contraseña: " + error.message;
      resetError.style.display = "block";
      return;
    }

    resetForm.reset();
    showLoggedIn();
  });

  logoutBtn.addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
  });

  document.getElementById("admin-ver-guia")?.addEventListener("click", () => {
    window.Gestion?.mostrarGuiaPrimerosPasos?.();
  });

  /* ------------------------------ Destacadas -------------------------- */
  async function loadFeaturedList() {
    featuredBox.innerHTML = `<p style="color:var(--color-text-light);">Cargando…</p>`;
    const { data, error } = await supabaseClient
      .from("properties")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false });
    if (error) {
      featuredBox.innerHTML = `<p style="color:var(--color-danger);">No se pudo cargar la lista: ${error.message}</p>`;
      return;
    }
    if (!data || data.length === 0) {
      featuredBox.innerHTML = `<p style="color:var(--color-text-light);">No hay propiedades activas para destacar. Cargalas desde "Inmuebles".</p>`;
      return;
    }
    featuredBox.innerHTML = data
      .map(
        (p) => `
      <div class="admin-list-row">
        <div class="admin-list-thumb">
          ${p.images && p.images[0] ? `<img src="${p.images[0]}" alt="">` : ""}
        </div>
        <div class="admin-list-info">
          <span class="admin-list-title">${p.title}</span>
          <span class="admin-list-meta">${operationLabel(p.operation)} · ${typeLabel(p.type)}</span>
        </div>
        <label class="admin-featured-toggle">
          <input type="checkbox" data-featured-id="${p.id}" ${p.featured ? "checked" : ""}>
          Destacada
        </label>
      </div>`
      )
      .join("");

    featuredBox.querySelectorAll("[data-featured-id]").forEach((checkbox) => {
      checkbox.addEventListener("change", async () => {
        const id = parseInt(checkbox.dataset.featuredId, 10);
        checkbox.disabled = true;
        const { error: updateError } = await supabaseClient.from("properties").update({ featured: checkbox.checked }).eq("id", id);
        checkbox.disabled = false;
        if (updateError) {
          alert("No se pudo guardar: " + updateError.message);
          checkbox.checked = !checkbox.checked;
        }
      });
    });
  }

  /* --------------------------- Mensajes de contacto -------------------- */
  async function loadMessages() {
    messagesBox.innerHTML = `<p style="color:var(--color-text-light);">Cargando…</p>`;
    const { data, error } = await supabaseClient.from("contact_messages").select("*").order("created_at", { ascending: false });
    if (error) {
      messagesBox.innerHTML = `<p style="color:var(--color-danger);">No se pudo cargar los mensajes: ${error.message}</p>`;
      return;
    }
    if (!data || data.length === 0) {
      messagesBox.innerHTML = `<p style="color:var(--color-text-light);">Todavía no llegó ninguna consulta por el formulario.</p>`;
      return;
    }
    messagesBox.innerHTML = data
      .map((m) => {
        const date = new Date(m.created_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
        const contactParts = [m.phone, m.email].filter(Boolean).join(" · ");
        return `
      <div class="admin-message-card">
        <div class="admin-message-header">
          <div>
            <span class="admin-message-who">${m.name}</span>
            ${contactParts ? `<span class="admin-message-contact"> · ${contactParts}</span>` : ""}
            ${m.reason ? `<span class="admin-message-contact"> · Motivo: ${m.reason}</span>` : ""}
          </div>
          <span class="admin-message-date">${date}</span>
        </div>
        <p>${m.message || ""}</p>
      </div>`;
      })
      .join("");
  }

  /* ============ Gestión (InmoGestion) — enrutamiento interno =========== */
  /* Mismo mecanismo que tenía js/gestion/app.js (irAModulo/refrescar/F2-F5-
     Esc), adaptado para vivir acá en vez de en gestion.html: el login ya
     lo resuelve este mismo panel, así que no hace falta un #acceso propio. */

  let gestionModuloActual = null;
  const gestionCargados = new Set();

  function gestionIrAModulo(nombre) {
    const G = window.Gestion;
    if (!G) return;
    if (!G.modulos[nombre]) nombre = "inicio";
    if (nombre === gestionModuloActual) return;
    gestionModuloActual = nombre;

    document.querySelectorAll("#vistas .vista").forEach((v) => {
      v.style.display = v.id === "vista-" + nombre ? "" : "none";
    });

    const m = G.modulos[nombre];
    document.getElementById("titulo-modulo").textContent = m.titulo;
    document.getElementById("barra-contador").textContent = "";
    const btnNuevo = document.getElementById("btn-nuevo");
    if (m.nuevo && m.textoNuevo) {
      btnNuevo.style.display = "";
      btnNuevo.textContent = m.textoNuevo;
    } else {
      btnNuevo.style.display = "none";
    }

    if (!gestionCargados.has(nombre)) {
      gestionCargados.add(nombre);
      Promise.resolve(m.cargar()).catch((e) => G.avisar(G.mensajeError(e), "error"));
    }
  }

  function gestionRefrescar() {
    const G = window.Gestion;
    if (!G || !gestionModuloActual) return;
    Promise.resolve(G.modulos[gestionModuloActual].cargar()).catch((e) => G.avisar(G.mensajeError(e), "error"));
  }

  // Para que un módulo pueda saltar a otro (ej. desde "Hoy", o al crear un
  // contrato desde Inmuebles) o forzar su recarga la próxima vez que se abra.
  function exponerGestion() {
    if (!window.Gestion) return;
    window.Gestion.irAModulo = (nombre) => {
      if (GESTION_TABS.has(nombre)) switchTab(nombre);
    };
    window.Gestion.invalidar = (nombre) => gestionCargados.delete(nombre);
    window.Gestion.refrescar = gestionRefrescar;
  }
  exponerGestion();

  document.getElementById("btn-refrescar")?.addEventListener("click", gestionRefrescar);
  document.getElementById("btn-nuevo")?.addEventListener("click", () => {
    const G = window.Gestion;
    const m = G && G.modulos[gestionModuloActual];
    if (m && m.nuevo) m.nuevo();
  });

  document.addEventListener("keydown", (e) => {
    const G = window.Gestion;
    if (!G) return;
    if (e.key === "Escape") {
      if (document.getElementById("dialogo")?.dataset.abierto === "1") G.dialogo.cerrar();
      else if (G.ficha.abierta()) G.ficha.cerrar();
      return;
    }
    if (e.target.matches("input, select, textarea")) return;
    if (e.key === "F2") {
      e.preventDefault();
      const m = G.modulos[gestionModuloActual];
      if (m && m.nuevo) m.nuevo();
    }
    if (e.key === "F5" && gestionModuloActual) { e.preventDefault(); gestionRefrescar(); }
  });
});
