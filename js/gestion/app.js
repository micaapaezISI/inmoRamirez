'use strict';

/* =====================================================================
   Gestión — arranque, navegación y atajos de teclado
   ===================================================================== */

(function () {
  const { sb, config, avisar, mensajeError, modulos, ficha, dialogo } = window.Gestion;

  const acceso = document.getElementById('acceso');
  const app = document.getElementById('aplicacion');
  const accesoForm = document.getElementById('acceso-form');
  const accesoError = document.getElementById('acceso-error');

  let moduloActual = null;
  const cargados = new Set();

  /* ----------------------------- Sesión ----------------------------- */

  async function estadoSesion() {
    const { data } = await sb.auth.getSession();
    return data.session || null;
  }

  async function entrar() {
    acceso.style.display = 'none';
    app.style.display = '';
    const { data: { user } } = await sb.auth.getUser();
    document.getElementById('usuario-actual').textContent = user ? user.email : '';
    await config.cargar();
    if (config.texto('razon_social')) {
      document.getElementById('razon-social').textContent = config.texto('razon_social');
    }
    irAModulo(location.hash.replace('#', '') || 'inicio');
  }

  function salir() {
    acceso.style.display = '';
    app.style.display = 'none';
    cargados.clear();
    moduloActual = null;
  }

  accesoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    accesoError.style.display = 'none';
    const email = document.getElementById('acceso-email').value.trim();
    const password = document.getElementById('acceso-password').value;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      accesoError.textContent = 'No se pudo ingresar: ' + mensajeError(error);
      accesoError.style.display = 'block';
    }
  });

  document.getElementById('salir').addEventListener('click', async () => {
    await sb.auth.signOut();
  });

  sb.auth.onAuthStateChange((_evento, sesion) => {
    if (sesion && app.style.display === 'none') entrar();
    else if (!sesion && acceso.style.display === 'none') salir();
  });

  /* --------------------------- Navegación -------------------------- */

  function irAModulo(nombre) {
    if (!modulos[nombre]) nombre = 'inicio';
    if (nombre === moduloActual) return;
    moduloActual = nombre;
    location.hash = nombre;

    document.querySelectorAll('.lateral__item[data-modulo]').forEach((b) => {
      if (b.dataset.modulo === nombre) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    document.querySelectorAll('#vistas .vista').forEach((v) => {
      v.style.display = v.id === 'vista-' + nombre ? '' : 'none';
    });

    const m = modulos[nombre];
    document.getElementById('titulo-modulo').textContent = m.titulo;
    const btnNuevo = document.getElementById('btn-nuevo');
    if (m.nuevo && m.textoNuevo) {
      btnNuevo.style.display = '';
      btnNuevo.textContent = m.textoNuevo;
    } else {
      btnNuevo.style.display = 'none';
    }

    if (!cargados.has(nombre)) {
      cargados.add(nombre);
      Promise.resolve(m.cargar()).catch((e) => avisar(mensajeError(e), 'error'));
    }
  }

  function refrescar() {
    if (!moduloActual) return;
    Promise.resolve(modulos[moduloActual].cargar()).catch((e) => avisar(mensajeError(e), 'error'));
  }

  // Que otros módulos puedan forzar recarga de otro (ej. al crear un
  // contrato desde Inmuebles, invalidar Alquileres).
  window.Gestion.irAModulo = irAModulo;
  window.Gestion.invalidar = (nombre) => cargados.delete(nombre);
  window.Gestion.refrescar = refrescar;

  document.querySelectorAll('.lateral__item[data-modulo]').forEach((b) => {
    b.addEventListener('click', () => irAModulo(b.dataset.modulo));
  });
  document.getElementById('btn-refrescar').addEventListener('click', refrescar);
  document.getElementById('btn-nuevo').addEventListener('click', () => {
    const m = modulos[moduloActual];
    if (m && m.nuevo) m.nuevo();
  });

  /* --------------------------- Atajos ----------------------------- */

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.getElementById('dialogo').dataset.abierto === '1') dialogo.cerrar();
      else if (ficha.abierta()) ficha.cerrar();
      return;
    }
    if (e.target.matches('input, select, textarea')) return;
    if (e.key === 'F2') {
      e.preventDefault();
      const m = modulos[moduloActual];
      if (m && m.nuevo) m.nuevo();
    }
    if (e.key === 'F5') { e.preventDefault(); refrescar(); }
  });

  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#', '');
    if (h && modulos[h] && h !== moduloActual) irAModulo(h);
  });

  /* ---------------------------- Arranque -------------------------- */

  (async function iniciar() {
    const sesion = await estadoSesion();
    if (sesion) entrar();
    else acceso.style.display = '';
  })();
})();
