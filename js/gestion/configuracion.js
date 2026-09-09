'use strict';

/* =====================================================================
   Gestión — Configuración de la instalación (tabla `config`)
   Portado de src/routes/config.js
   ===================================================================== */

(function () {
  const G = window.Gestion;
  const { datos, esc, avisar, config } = G;
  const vista = document.getElementById('vista-configuracion');

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
      ['comision_admin_pct', 'Comisión de administración (%)'],
    ] },
    { titulo: 'Mora', claves: [
      ['punitorio_diario_pct', 'Interés punitorio diario (%)'],
      ['dias_gracia_mora', 'Días de gracia antes de la mora'],
    ] },
    { titulo: 'Contratos', claves: [
      ['dias_aviso_vencimiento_contrato', 'Días de aviso antes de que venza un contrato'],
    ] },
  ];

  async function cargar() {
    await config.cargar();
    vista.innerHTML = `<div class="importacion">
      <form id="config-form">
        ${GRUPOS.map((g) => `<fieldset><legend>${esc(g.titulo)}</legend><div class="rejilla">
          ${g.claves.map(([clave, etiqueta]) => `<div class="campo campo--ancho-2" data-campo="${clave}">
            <label for="cf-${clave}">${esc(etiqueta)}</label>
            <input id="cf-${clave}" name="${clave}" value="${esc(config.texto(clave))}">
          </div>`).join('')}
        </div></fieldset>`).join('')}
        <button type="button" class="boton boton--principal" id="config-guardar">Guardar configuración</button>
      </form>
    </div>`;

    vista.querySelector('#config-guardar').addEventListener('click', guardar);
  }

  async function guardar() {
    const btn = vista.querySelector('#config-guardar');
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const filas = [...vista.querySelectorAll('#config-form [name]')].map((el) => ({
        clave: el.name, valor: el.value.trim(),
      }));
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
