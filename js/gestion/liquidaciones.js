'use strict';

/* =====================================================================
   Gestión — Liquidaciones a propietarios + Gastos
   Portado de src/routes/liquidaciones.js + src/liquidacion/*.js + src/routes/gastos.js
   Generar -> RPC generar_liquidacion. Pagar -> RPC pagar_liquidacion.
   Anular -> RPC anular_liquidacion.
   Pendiente: liquidación garantizada, comprobantes adjuntos.
   ===================================================================== */

(function () {
  const G = window.Gestion;
  const { datos, esc, fmt, avisar, ficha, dialogo, grilla, pastilla } = G;

  const vista = document.getElementById('vista-liquidaciones');
  const estado = { tab: 'liquidaciones', liquidaciones: [], gastos: [], props: [], personas: [] };

  async function cargar() {
    vista.innerHTML = `
      <div class="filtros">
        <button class="boton" data-tab="liquidaciones">Liquidaciones</button>
        <button class="boton" data-tab="gastos">Gastos de inmuebles</button>
      </div>
      <div id="liq-cont"></div>`;
    vista.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { estado.tab = b.dataset.tab; render(); }));
    await traer();
  }

  async function traer() {
    const [liqs, gastos, props, personas] = await Promise.all([
      datos.lista(datos.tabla('liquidacion').select('*').order('creado_en', { ascending: false })),
      datos.lista(datos.tabla('gasto').select('*').eq('anulado', false).order('fecha', { ascending: false })),
      datos.lista(datos.tabla('propiedad').select('id, calle, numero').eq('activo', true).order('calle')),
      datos.lista(datos.tabla('persona').select('id, nombre')),
    ]);
    const per = Object.fromEntries(personas.map((p) => [p.id, p.nombre]));
    const dir = Object.fromEntries(props.map((p) => [p.id, [p.calle, p.numero].filter(Boolean).join(' ') || '(sin dirección)']));
    estado.liquidaciones = liqs.map((l) => ({ ...l, propietario: per[l.persona_id] || '?' }));
    estado.gastos = gastos.map((g) => ({ ...g, direccion: dir[g.propiedad_id] || '?' }));
    estado.props = props.map((p) => ({ id: p.id, dir: dir[p.id] }));
    estado.personas = personas;
    render();
  }

  function render() {
    vista.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('boton--principal', b.dataset.tab === estado.tab));
    document.getElementById('btn-nuevo').textContent = estado.tab === 'gastos' ? 'Nuevo gasto' : 'Nueva liquidación';
    if (estado.tab === 'gastos') renderGastos();
    else renderLiquidaciones();
  }

  function renderLiquidaciones() {
    const filas = estado.liquidaciones;
    document.getElementById('barra-contador').textContent = `${filas.length} liquidación(es)`;
    document.getElementById('liq-cont').innerHTML = grilla([
      { th: 'Período', clase: 'col-corto', render: (l) => fmt.periodo(l.periodo) },
      { th: 'Propietario', render: (l) => `<strong>${esc(l.propietario)}</strong>` },
      { th: 'Cobrado', clase: 'num col-monto', render: (l) => esc(fmt.dinero(l.total_cobrado)) },
      { th: 'Comisión', clase: 'num', render: (l) => esc(fmt.dinero(l.total_comision)) },
      { th: 'Gastos', clase: 'num', render: (l) => esc(fmt.dinero(l.total_gastos)) },
      { th: 'Neto', clase: 'num col-monto', render: (l) => `<strong>${esc(fmt.dinero(l.total_neto))}</strong>` },
      { th: 'Estado', clase: 'col-corto', render: (l) => pastilla(l.estado) },
    ], filas, { onAbrir: (id) => abrirDetalle(Number(id)) });
    const tb = document.querySelector('#liq-cont tbody');
    if (tb) tb.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) abrirDetalle(Number(tr.dataset.id)); });
  }

  function renderGastos() {
    const filas = estado.gastos;
    document.getElementById('barra-contador').textContent = `${filas.length} gasto(s)`;
    document.getElementById('liq-cont').innerHTML = grilla([
      { th: 'Fecha', clase: 'col-corto', render: (g) => fmt.fecha(g.fecha) },
      { th: 'Inmueble', render: (g) => esc(g.direccion) },
      { th: 'Concepto', render: (g) => `<strong>${esc(g.concepto)}</strong>` },
      { th: 'Monto', clase: 'num col-monto', render: (g) => esc(fmt.dinero(g.monto)) },
      { th: 'Estado', clase: 'col-corto', render: (g) => g.liquidado ? pastilla('pagada') : pastilla('pendiente') },
    ], filas);
  }

  /* ------------------------- Nueva liquidación --------------------- */

  function nuevo() {
    if (estado.tab === 'gastos') return nuevoGasto();
    dialogo.abrir({
      titulo: 'Nueva liquidación',
      cuerpo: `<p>Se toma lo efectivamente cobrado a los inquilinos de ese inmueble en el período, se descuenta la comisión y los gastos, y se reparte entre los propietarios según su porcentaje.</p>
        <div class="campo"><label>Inmueble</label><select id="lq-prop"><option value="">Elegí…</option>${estado.props.map((p) => `<option value="${p.id}">${esc(p.dir)}</option>`).join('')}</select></div>
        <div class="campo"><label>Período (AAAA-MM)</label><input type="month" id="lq-periodo" value="${G.periodoActual()}"></div>`,
      textoConfirmar: 'Generar',
      confirmar: async () => {
        const propId = Number(document.getElementById('lq-prop').value);
        const periodo = document.getElementById('lq-periodo').value;
        if (!propId || !periodo) throw new Error('Elegí el inmueble y el período.');
        const res = await datos.rpc('generar_liquidacion', { p_propiedad_id: propId, p_periodo: periodo });
        avisar(`Liquidación generada. Neto total ${fmt.dinero(res.neto)}.`);
        dialogo.cerrar();
        G.invalidar('inicio');
        await traer();
      },
    });
  }

  function nuevoGasto() {
    dialogo.abrir({
      titulo: 'Nuevo gasto de inmueble',
      cuerpo: `<div class="campo"><label>Inmueble</label><select id="g-prop"><option value="">Elegí…</option>${estado.props.map((p) => `<option value="${p.id}">${esc(p.dir)}</option>`).join('')}</select></div>
        <div class="campo"><label>Fecha</label><input type="date" id="g-fecha" value="${G.hoyISO()}"></div>
        <div class="campo"><label>Concepto</label><input type="text" id="g-concepto" placeholder="Plomería, ABL, expensas extraordinarias…"></div>
        <div class="campo"><label>Monto</label><input type="text" inputmode="decimal" id="g-monto" data-dinero="1"></div>`,
      textoConfirmar: 'Guardar gasto',
      confirmar: async () => {
        const propId = Number(document.getElementById('g-prop').value);
        const concepto = document.getElementById('g-concepto').value.trim();
        const monto = fmt.aCentavos(document.getElementById('g-monto').value);
        if (!propId || !concepto || !monto) throw new Error('Completá inmueble, concepto y monto.');
        await datos.crear('gasto', { propiedad_id: propId, fecha: document.getElementById('g-fecha').value, concepto, monto });
        avisar('Gasto cargado. Se descuenta en la próxima liquidación de ese inmueble.');
        dialogo.cerrar();
        await traer();
      },
    });
  }

  /* --------------------------- Detalle ---------------------------- */

  async function abrirDetalle(id) {
    const l = estado.liquidaciones.find((x) => x.id === id);
    const detalle = await datos.lista(datos.tabla('liquidacion_detalle').select('*').eq('liquidacion_id', id));
    ficha.abrir({
      titulo: `Liquidación ${fmt.periodo(l.periodo)} — ${esc(l.propietario)}`,
      angosta: true,
      cuerpo: `<div class="lista-simple">
        ${detalle.map((d) => `<div class="lista-simple__item">${esc(d.concepto)} <strong style="float:right;">${esc(fmt.dinero(d.monto))}</strong></div>`).join('')}
        <div class="lista-simple__item"><strong>NETO A PAGAR</strong><strong style="float:right;">${esc(fmt.dinero(l.total_neto))}</strong></div>
        <div class="lista-simple__item"><strong>Estado</strong>${pastilla(l.estado)}${l.fecha_pago ? ` · pagada el ${fmt.fecha(l.fecha_pago)}` : ''}</div>
      </div>`,
      extra: l.estado === 'pendiente'
        ? `<button class="boton boton--peligro" id="btn-anular-liq">Anular</button><button class="boton boton--principal" id="btn-pagar-liq">Pagar al propietario</button>`
        : (l.recibo_id ? `<button class="boton" id="btn-liq-pdf">Imprimir recibo</button>` : ''),
    });
    if (l.recibo_id) {
      const b = document.getElementById('btn-liq-pdf');
      if (b) b.addEventListener('click', () => G.pdf.generarRecibo(l.recibo_id));
    }
    if (l.estado === 'pendiente') {
      document.getElementById('btn-pagar-liq').addEventListener('click', () => abrirPagar(l));
      document.getElementById('btn-anular-liq').addEventListener('click', () => {
        dialogo.abrir({
          titulo: 'Anular liquidación', peligro: true, textoConfirmar: 'Anular',
          cuerpo: `<p>Los gastos incluidos vuelven a quedar disponibles para la próxima.</p><div class="campo"><label>Motivo</label><textarea id="al-motivo"></textarea></div>`,
          confirmar: async () => {
            await datos.rpc('anular_liquidacion', { p_liquidacion_id: id, p_motivo: document.getElementById('al-motivo').value.trim() });
            avisar('Liquidación anulada.'); dialogo.cerrar(); ficha.cerrar(); await traer();
          },
        });
      });
    }
  }

  function abrirPagar(l) {
    dialogo.abrir({
      titulo: `Pagar liquidación — ${esc(l.propietario)}`,
      cuerpo: `<p>Neto a pagar: <strong>${fmt.dinero(l.total_neto)}</strong></p>
        <div class="campo"><label>Fecha de pago</label><input type="date" id="pl-fecha" value="${G.hoyISO()}"></div>
        <div class="campo"><label>Medio de pago</label><select id="pl-medio"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="cheque">Cheque</option><option value="deposito">Depósito</option></select></div>
        <div class="campo"><label>Referencia</label><input type="text" id="pl-ref"></div>`,
      textoConfirmar: 'Confirmar pago',
      confirmar: async () => {
        const res = await datos.rpc('pagar_liquidacion', {
          p_liquidacion_id: l.id,
          p_fecha: document.getElementById('pl-fecha').value,
          p_medios: [{ medio_pago: document.getElementById('pl-medio').value, monto: l.total_neto, referencia: document.getElementById('pl-ref').value.trim() || null }],
        });
        avisar(`Liquidación pagada. Recibo Nº ${res.numero}.`);
        dialogo.cerrar(); ficha.cerrar();
        G.invalidar('caja'); G.invalidar('inicio');
        await traer();
      },
    });
  }

  G.registrarModulo('liquidaciones', {
    titulo: 'Liquidaciones',
    textoNuevo: 'Nueva liquidación',
    cargar,
    nuevo,
    abrirDetalle: (id) => { G.irAModulo('liquidaciones'); abrirDetalle(id); },
  });
})();
