'use strict';

/* =====================================================================
   Gestión — Panel "Hoy"
   Portado de src/routes/inicio.js + public/js/inicio.js (resumen)
   ===================================================================== */

(function () {
  const G = window.Gestion;
  const { datos, esc, fmt, config } = G;
  const vista = document.getElementById('vista-inicio');

  /* ------------------------ Guía de primeros pasos --------------------- */
  // Se muestra sola la primera vez que alguien entra al panel logueado, y
  // se puede volver a abrir en cualquier momento con el botón "❓ ¿Cómo
  // empiezo?" del encabezado (ver admin.html/js/admin.js).
  const GUIA_KEY = 'admin_guia_vista';
  let forzarGuia = false;

  function guiaYaVista() {
    try { return localStorage.getItem(GUIA_KEY) === '1'; } catch (_e) { return false; }
  }
  function marcarGuiaVista() {
    try { localStorage.setItem(GUIA_KEY, '1'); } catch (_e) { /* nada que hacer */ }
  }

  function tarjetaGuia() {
    if (guiaYaVista() && !forzarGuia) return '';
    return `<div class="admin-card admin-card--guia" id="admin-guia-primeros-pasos" style="margin-bottom:22px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
        <h2 class="admin-section-title" style="margin:0;">👋 Para arrancar</h2>
        <button type="button" id="admin-guia-cerrar" class="btn btn-sm btn-dark" aria-label="Cerrar la guía">Entendido, cerrar ✕</button>
      </div>
      <p class="admin-section-help">Este panel reemplaza la planilla de Excel y los cuadernos: acá vas a cargar tus inmuebles, tus contratos y vas a ir registrando cada cobro. El orden que más conviene para no perderte es este:</p>
      <ol class="admin-guia-pasos">
        <li><strong>1. Cargá tus inmuebles.</strong> Andá a la pestaña <em>"Inmuebles"</em> del menú de la izquierda y completá los datos — tipo, dirección, precio y fotos. Podés cargar uno por uno, tranquila.</li>
        <li><strong>2. Cargá a las personas.</strong> En <em>"Personas"</em> cargá a los propietarios y a los inquilinos con los que ya estás trabajando (nombre, documento, teléfono). Después los vas a elegir de una lista, no hace falta volver a tipearlos.</li>
        <li><strong>3. Armá el contrato.</strong> En <em>"Alquileres"</em> elegís el inmueble y el inquilino que ya cargaste, la fecha, el monto y cada cuánto se ajusta. Las cuotas de todo el contrato se generan solas — no hay que cargarlas mes a mes.</li>
        <li><strong>4. Registrá los cobros.</strong> Cuando un inquilino te paga, andá a <em>"Cobranzas"</em>, elegilo de la lista, tildá la cuota y registrá el cobro. De ahí sale el recibo y se actualiza la <em>Caja</em> sola.</li>
        <li><strong>5. Liquidá a los propietarios.</strong> En <em>"Liquidaciones"</em> se arman solas a partir de los cobros ya registrados — solo tenés que generarlas y marcarlas como pagadas.</li>
        <li><strong>6. Configurá lo general una sola vez.</strong> En <em>"Configuración"</em> cargá tu comisión habitual y los días de gracia para las cuotas atrasadas — así no tenés que repetirlo en cada contrato o inmueble.</li>
      </ol>
      <p class="admin-card-desc" style="margin-top:12px;">Esta pantalla ("Hoy") siempre te va a avisar lo urgente: cobros atrasados, contratos por vencer y liquidaciones pendientes.</p>
      <p class="admin-card-desc">¿Cerraste esta guía sin querer? Tocá el botón <strong>"❓ ¿Cómo empiezo?"</strong> de arriba para volver a verla cuando quieras.</p>
    </div>`;
  }

  async function cargar() {
    vista.innerHTML = `<div style="padding:16px;">Cargando…</div>`;

    const hoy = G.hoyISO();
    const diasAviso = config.numero('dias_aviso_vencimiento_contrato', 60);
    const limiteAviso = G.sumarMeses(hoy, 0); // se compara por días abajo

    const [inmuebles, personas, contratos, morosos, liquidaciones] = await Promise.all([
      datos.lista(datos.tabla('propiedad').select('id', { count: 'exact', head: false }).eq('activo', true)),
      datos.lista(datos.tabla('persona').select('id').eq('activo', true)),
      datos.lista(datos.tabla('contrato').select('id, fecha_fin, estado').eq('estado', 'vigente')),
      datos.lista(datos.tabla('v_morosidad').select('persona_id, inquilino, saldo, dias_atraso')).catch(() => []),
      datos.lista(datos.tabla('liquidacion').select('id, persona_id, total_neto, estado').eq('estado', 'pendiente')),
    ]);

    const porVencer = contratos.filter((c) => {
      const d = G.diasEntre(hoy, c.fecha_fin);
      return d >= 0 && d <= diasAviso;
    });

    // Morosos: una fila por inquilino (la vista trae una por cuota).
    const morososAgrup = {};
    morosos.forEach((m) => {
      const k = m.persona_id;
      morososAgrup[k] = morososAgrup[k] || { nombre: m.inquilino, saldo: 0, dias: 0 };
      morososAgrup[k].saldo += Number(m.saldo || 0);
      morososAgrup[k].dias = Math.max(morososAgrup[k].dias, Number(m.dias_atraso || 0));
    });
    const listaMorosos = Object.values(morososAgrup).sort((a, b) => b.dias - a.dias);
    const totalMoroso = listaMorosos.reduce((t, m) => t + m.saldo, 0);
    const totalLiq = liquidaciones.reduce((t, l) => t + Number(l.total_neto || 0), 0);

    vista.innerHTML = `<div id="vista-inicio-cont" style="padding:16px; overflow:auto;">
      ${tarjetaGuia()}
      <p class="inicio-fecha">${new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>

      <div class="inicio-tarjetas">
        ${tarjeta('Inmuebles', inmuebles.length, 'inmuebles')}
        ${tarjeta('Personas', personas.length, 'personas')}
        ${tarjeta('Contratos vigentes', contratos.length, 'alquileres')}
        ${tarjeta('Deuda de inquilinos', fmt.dinero(totalMoroso), 'cobranzas', listaMorosos.length > 0)}
      </div>

      <div class="inicio-columnas">
        <div class="inicio-bloque">
          <h2>Inquilinos con deuda (${listaMorosos.length})</h2>
          <ul class="inicio-lista">
            ${listaMorosos.slice(0, 8).map((m) => `<li>
              <span>${esc(m.nombre)}</span>
              <span class="tenue">${m.dias} día${m.dias === 1 ? '' : 's'}</span>
              <strong>${esc(fmt.dinero(m.saldo))}</strong></li>`).join('') || '<li class="tenue">Nadie con deuda. 👌</li>'}
          </ul>
        </div>
        <div class="inicio-bloque">
          <h2>Contratos por vencer (${porVencer.length})</h2>
          <ul class="inicio-lista">
            ${porVencer.slice(0, 8).map((c) => `<li>
              <span>Contrato #${c.id}</span>
              <strong>${esc(fmt.fecha(c.fecha_fin))}</strong></li>`).join('') || '<li class="tenue">Ninguno en los próximos ' + diasAviso + ' días.</li>'}
          </ul>
        </div>
        <div class="inicio-bloque">
          <h2>Liquidaciones pendientes (${liquidaciones.length})</h2>
          <ul class="inicio-lista">
            <li><span>Total a pagar a propietarios</span><strong>${esc(fmt.dinero(totalLiq))}</strong></li>
          </ul>
          <p class="campo__ayuda" style="margin-top:8px;">Generá y pagá liquidaciones desde el módulo Liquidaciones.</p>
        </div>
      </div>
    </div>`;

    vista.querySelectorAll('[data-ir]').forEach((el) => {
      el.addEventListener('click', () => G.irAModulo(el.dataset.ir));
    });

    const guiaCerrarBtn = document.getElementById('admin-guia-cerrar');
    if (guiaCerrarBtn) {
      guiaCerrarBtn.addEventListener('click', () => {
        marcarGuiaVista();
        document.getElementById('admin-guia-primeros-pasos')?.remove();
      });
    }
    forzarGuia = false;
  }

  // Botón "❓ ¿Cómo empiezo?" del encabezado (admin.html/js/admin.js).
  G.mostrarGuiaPrimerosPasos = () => {
    forzarGuia = true;
    G.irAModulo('inicio');
    cargar();
    setTimeout(() => document.getElementById('admin-guia-primeros-pasos')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  function tarjeta(etiqueta, valor, ir, alerta = false) {
    return `<button class="inicio-tarjeta ${alerta ? 'inicio-tarjeta--alerta' : ''}" data-ir="${ir}">
      <div class="inicio-tarjeta__etiqueta">${esc(etiqueta)}</div>
      <div class="inicio-tarjeta__valor">${esc(valor)}</div>
    </button>`;
  }

  G.registrarModulo('inicio', { titulo: 'Hoy', cargar });
})();
