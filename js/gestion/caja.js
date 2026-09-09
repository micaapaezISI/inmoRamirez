'use strict';

/* =====================================================================
   Gestión — Caja diaria
   Portado de src/routes/caja.js + public/js/caja.js (núcleo)
   Cada cobro / pago de liquidación deja su movimiento automático; acá
   se ven todos y se cargan los manuales (gastos operativos, aportes,
   retiros, ajustes).
   ===================================================================== */

(function () {
  const G = window.Gestion;
  const { datos, esc, fmt, avisar, ficha, dialogo, grilla, pastilla } = G;

  const vista = document.getElementById('vista-caja');
  const estado = { movs: [], filtros: { desde: '', hasta: '', tipo: '', verAnulados: false } };

  const CATEGORIAS_MANUALES = [
    ['gasto_operativo', 'Gasto operativo'], ['sueldo', 'Sueldo'], ['impuesto', 'Impuesto'],
    ['aporte', 'Aporte de capital'], ['retiro', 'Retiro'], ['ajuste', 'Ajuste'], ['otro', 'Otro'],
    ['comision_venta', 'Comisión de venta'], ['gasto_propiedad', 'Gasto de propiedad'],
  ];

  async function cargar() {
    vista.innerHTML = `
      <div class="filtros">
        <label>Desde <input type="date" id="cj-desde"></label>
        <label>Hasta <input type="date" id="cj-hasta"></label>
        <select id="cj-tipo"><option value="">Ingresos y egresos</option><option value="ingreso">Solo ingresos</option><option value="egreso">Solo egresos</option></select>
        <label class="casilla"><input type="checkbox" id="cj-anulados"> Ver anulados</label>
        <span class="filtros__separador"></span>
        <button class="boton" id="cj-hoy">Hoy</button>
        <button class="boton" id="cj-limpiar">Limpiar</button>
      </div>
      <div class="cartel-cajon" id="cj-cajon"></div>
      <div id="caja-grilla"></div>`;

    ['desde', 'hasta'].forEach((k) => {
      const el = vista.querySelector('#cj-' + k);
      el.value = estado.filtros[k];
      el.addEventListener('change', () => { estado.filtros[k] = el.value; traer(); });
    });
    vista.querySelector('#cj-tipo').addEventListener('change', (e) => { estado.filtros.tipo = e.target.value; render(); });
    vista.querySelector('#cj-anulados').addEventListener('change', (e) => { estado.filtros.verAnulados = e.target.checked; render(); });
    vista.querySelector('#cj-hoy').addEventListener('click', () => { estado.filtros.desde = G.hoyISO(); estado.filtros.hasta = G.hoyISO(); cargar(); });
    vista.querySelector('#cj-limpiar').addEventListener('click', () => { estado.filtros = { desde: '', hasta: '', tipo: '', verAnulados: false }; cargar(); });

    await traer();
  }

  async function traer() {
    let q = datos.tabla('movimiento_caja').select('*, persona(nombre)').order('fecha', { ascending: false }).order('id', { ascending: false }).limit(500);
    if (estado.filtros.desde) q = q.gte('fecha', estado.filtros.desde);
    if (estado.filtros.hasta) q = q.lte('fecha', estado.filtros.hasta);
    estado.movs = await datos.lista(q);
    render();
  }

  function render() {
    let filas = estado.movs;
    if (!estado.filtros.verAnulados) filas = filas.filter((m) => !m.anulado);
    if (estado.filtros.tipo) filas = filas.filter((m) => m.tipo === estado.filtros.tipo);

    const ingresos = filas.filter((m) => m.tipo === 'ingreso' && !m.anulado).reduce((t, m) => t + m.monto, 0);
    const egresos = filas.filter((m) => m.tipo === 'egreso' && !m.anulado).reduce((t, m) => t + m.monto, 0);
    const porMedio = {};
    filas.filter((m) => !m.anulado).forEach((m) => {
      porMedio[m.medio_pago] = (porMedio[m.medio_pago] || 0) + (m.tipo === 'ingreso' ? m.monto : -m.monto);
    });
    document.getElementById('cj-cajon').innerHTML = `
      <div class="cartel-cajon__aclaracion">Saldo del período filtrado, por medio de pago (ingresos − egresos):</div>
      <div class="cartel-cajon__items">
        ${Object.entries(porMedio).map(([medio, monto]) => `<div class="cartel-cajon__item">
          <span class="cartel-cajon__medio">${esc(fmt.titulo(medio))}</span>
          <span class="cartel-cajon__monto ${monto < 0 ? 'cartel-cajon__monto--negativo' : ''}">${esc(fmt.dinero(monto))}</span>
        </div>`).join('') || '<div class="tenue">Sin movimientos.</div>'}
        <div class="cartel-cajon__item" style="border-left-color:var(--ok);">
          <span class="cartel-cajon__medio">Ingresos</span><span class="cartel-cajon__monto">${esc(fmt.dinero(ingresos))}</span>
        </div>
        <div class="cartel-cajon__item" style="border-left-color:var(--error);">
          <span class="cartel-cajon__medio">Egresos</span><span class="cartel-cajon__monto">${esc(fmt.dinero(egresos))}</span>
        </div>
      </div>`;

    document.getElementById('barra-contador').textContent = `${filas.length} movimiento(s)`;
    document.getElementById('caja-grilla').innerHTML = grilla([
      { th: 'Fecha', clase: 'col-corto', render: (m) => fmt.fecha(m.fecha) },
      { th: 'Tipo', clase: 'col-corto', render: (m) => pastilla(m.tipo) },
      { th: 'Categoría', clase: 'col-corto', render: (m) => fmt.titulo(m.categoria) },
      { th: 'Concepto', render: (m) => `${esc(m.concepto)}${m.persona ? ` <span class="tenue">· ${esc(m.persona.nombre)}</span>` : ''}${m.pago_id || m.liquidacion_id ? ' <span class="pastilla pastilla--auto">auto</span>' : ''}` },
      { th: 'Medio', clase: 'col-corto', render: (m) => fmt.titulo(m.medio_pago) },
      { th: 'Monto', clase: 'num col-monto', render: (m) => `<span class="${m.anulado ? 'tenue' : ''}">${m.tipo === 'egreso' ? '−' : ''}${esc(fmt.dinero(m.monto, m.moneda))}</span>` },
    ], filas, { onAbrir: (id) => abrirDetalle(Number(id)) });
    const tb = document.querySelector('#caja-grilla tbody');
    if (tb) tb.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) abrirDetalle(Number(tr.dataset.id)); });
  }

  function abrirDetalle(id) {
    const m = estado.movs.find((x) => x.id === id);
    ficha.abrir({
      titulo: `Movimiento del ${fmt.fecha(m.fecha)}`,
      angosta: true,
      cuerpo: `<div class="lista-simple">
        <div class="lista-simple__item"><strong>${fmt.titulo(m.tipo)} · ${fmt.titulo(m.categoria)}</strong>${esc(m.concepto)}</div>
        <div class="lista-simple__item"><strong>Monto</strong>${esc(fmt.dinero(m.monto, m.moneda))} · ${fmt.titulo(m.medio_pago)}</div>
        ${m.observaciones ? `<div class="lista-simple__item"><strong>Observaciones</strong>${esc(m.observaciones)}</div>` : ''}
        ${(m.pago_id || m.liquidacion_id) ? `<div class="lista-simple__item tenue">Movimiento automático de un cobro o liquidación. Se revierte anulando esa operación, no desde acá.</div>` : ''}
        ${m.anulado ? `<div class="lista-simple__item"><strong>Anulado</strong></div>` : ''}
      </div>`,
      extra: (!m.anulado && !m.pago_id && !m.liquidacion_id) ? `<button class="boton boton--peligro" id="btn-anular-mov">Anular</button>` : '',
    });
    const btn = document.getElementById('btn-anular-mov');
    if (btn) btn.addEventListener('click', async () => {
      await datos.actualizar('movimiento_caja', id, { anulado: true });
      avisar('Movimiento anulado.');
      ficha.cerrar();
      await traer();
    });
  }

  function nuevo() {
    dialogo.abrir({
      titulo: 'Nuevo movimiento de caja',
      cuerpo: `<div class="campo"><label>Tipo</label><select id="mv-tipo"><option value="egreso">Egreso (sale plata)</option><option value="ingreso">Ingreso (entra plata)</option></select></div>
        <div class="campo"><label>Categoría</label><select id="mv-cat">${CATEGORIAS_MANUALES.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select></div>
        <div class="campo"><label>Fecha</label><input type="date" id="mv-fecha" value="${G.hoyISO()}"></div>
        <div class="campo"><label>Concepto</label><input type="text" id="mv-concepto"></div>
        <div class="campo"><label>Monto</label><input type="text" inputmode="decimal" id="mv-monto" data-dinero="1"></div>
        <div class="campo"><label>Medio de pago</label><select id="mv-medio"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="cheque">Cheque</option><option value="deposito">Depósito</option><option value="otro">Otro</option></select></div>
        <div class="campo"><label>Observaciones</label><textarea id="mv-obs"></textarea></div>`,
      textoConfirmar: 'Guardar movimiento',
      confirmar: async () => {
        const concepto = document.getElementById('mv-concepto').value.trim();
        const monto = fmt.aCentavos(document.getElementById('mv-monto').value);
        if (!concepto || !monto) throw new Error('Cargá el concepto y el monto.');
        await datos.crear('movimiento_caja', {
          fecha: document.getElementById('mv-fecha').value,
          tipo: document.getElementById('mv-tipo').value,
          categoria: document.getElementById('mv-cat').value,
          concepto, monto,
          medio_pago: document.getElementById('mv-medio').value,
          observaciones: document.getElementById('mv-obs').value.trim() || null,
        });
        avisar('Movimiento cargado.');
        dialogo.cerrar();
        await traer();
      },
    });
  }

  G.registrarModulo('caja', { titulo: 'Caja', textoNuevo: 'Nuevo movimiento', cargar, nuevo });
})();
