'use strict';

/* =====================================================================
   Gestión — Configuración de la instalación (tabla `config`)
   Portado de src/routes/config.js
   ===================================================================== */

(function () {
  const G = window.Gestion;
  const { datos, esc, fmt, avisar, config, marcarErrores, ErrorValidacion } = G;
  const vista = document.getElementById('vista-configuracion');

  // tipo 'porcentaje' evita el bug de "0,5" guardándose mal: un
  // <input type="number"> nativo rechaza la coma decimal argentina y el
  // campo queda vacío en silencio. Acá se valida antes de guardar y se
  // guarda siempre con punto (config.numero() ya espera ese formato).
  const GRUPOS = [
    { titulo: 'Datos de la inmobiliaria', claves: [
      ['razon_social', 'Razón social'],
      ['cuit', 'CUIT'],
      ['matricula', 'Matrícula del martillero'],
      ['domicilio', 'Domicilio comercial'],
      ['telefono', 'Teléfono'],
      ['email', 'Email'],
    ] },
    { titulo: 'Valores por defecto', claves: [
      ['localidad_default', 'Localidad por defecto'],
      ['provincia_default', 'Provincia por defecto'],
      ['comision_admin_pct', 'Comisión de administración (%)', 'porcentaje', 'Se usa en cualquier inmueble o contrato que no tenga su propia comisión cargada.'],
    ] },
    { titulo: 'Mora', claves: [
      ['punitorio_diario_pct', 'Interés punitorio diario (%)', 'porcentaje'],
      ['dias_gracia_mora', 'Días de gracia antes de la mora', 'entero'],
    ] },
    { titulo: 'Contratos', claves: [
      ['dias_aviso_vencimiento_contrato', 'Días de aviso antes de que venza un contrato', 'entero'],
    ] },
  ];

  function inputPara(clave, tipo) {
    const valorGuardado = config.texto(clave);
    if (tipo === 'porcentaje') {
      const mostrado = valorGuardado === '' ? '' : fmt.porcentaje(Number(valorGuardado));
      return `<input type="text" inputmode="decimal" id="cf-${clave}" name="${clave}" data-porcentaje="1" value="${esc(mostrado)}" placeholder="Ej: 12,5">`;
    }
    if (tipo === 'entero') {
      return `<input type="text" inputmode="numeric" id="cf-${clave}" name="${clave}" data-entero="1" value="${esc(valorGuardado)}" placeholder="Ej: 5">`;
    }
    return `<input id="cf-${clave}" name="${clave}" value="${esc(valorGuardado)}">`;
  }

  async function cargar() {
    await config.cargar();
    vista.innerHTML = `<div class="importacion">
      <form id="config-form">
        ${GRUPOS.map((g) => `<fieldset><legend>${esc(g.titulo)}</legend><div class="rejilla">
          ${g.claves.map(([clave, etiqueta, tipo, ayuda]) => `<div class="campo campo--ancho-2" data-campo="${clave}">
            <label for="cf-${clave}">${esc(etiqueta)}</label>
            ${inputPara(clave, tipo)}
            ${ayuda ? `<span class="campo__ayuda">${esc(ayuda)}</span>` : ''}
            <span class="campo__error" style="display:none;"></span>
          </div>`).join('')}
        </div></fieldset>`).join('')}
        <button type="button" class="boton boton--principal" id="config-guardar">Guardar configuración</button>
      </form>
    </div>`;

    vista.querySelector('#config-guardar').addEventListener('click', guardar);
  }

  async function guardar() {
    const btn = vista.querySelector('#config-guardar');
    const form = vista.querySelector('#config-form');
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const errores = [];
      const filas = [...form.querySelectorAll('[name]')].map((el) => {
        let valor = el.value.trim();
        if (el.dataset.porcentaje === '1' && valor !== '') {
          const numero = fmt.aPorcentaje(valor);
          if (numero === null) errores.push({ campo: el.name, mensaje: 'Ese porcentaje no es válido, escribilo así: 12,5' });
          else valor = String(numero);
        } else if (el.dataset.entero === '1' && valor !== '') {
          if (!/^\d+$/.test(valor)) errores.push({ campo: el.name, mensaje: 'Escribí un número entero de días, ej: 5' });
          else valor = String(parseInt(valor, 10));
        }
        return { clave: el.name, valor };
      });
      if (errores.length) { marcarErrores(form, errores); throw new ErrorValidacion(errores); }
      const { error } = await G.sb.from('config').upsert(filas, { onConflict: 'clave' });
      if (error) throw error;
      await config.cargar();
      const rs = config.texto('razon_social');
      if (rs) document.getElementById('razon-social').textContent = rs;
      avisar('Configuración guardada.');
    } catch (e) {
      avisar(G.mensajeError(e), 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Guardar configuración';
    }
  }

  G.registrarModulo('configuracion', { titulo: 'Configuración', cargar });
})();
