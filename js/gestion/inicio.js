'use strict';

/* =====================================================================
   Gestión — Panel "Hoy"
   Portado de src/routes/inicio.js + public/js/inicio.js (resumen)
   ===================================================================== */

(function () {
  const G = window.Gestion;
  const { datos, esc, fmt, config } = G;
  const vista = document.getElementById('vista-inicio');

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
  }

  function tarjeta(etiqueta, valor, ir, alerta = false) {
    return `<button class="inicio-tarjeta ${alerta ? 'inicio-tarjeta--alerta' : ''}" data-ir="${ir}">
      <div class="inicio-tarjeta__etiqueta">${esc(etiqueta)}</div>
      <div class="inicio-tarjeta__valor">${esc(valor)}</div>
    </button>`;
  }

  G.registrarModulo('inicio', { titulo: 'Hoy', cargar });
})();
