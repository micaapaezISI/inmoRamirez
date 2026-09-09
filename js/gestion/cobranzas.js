'use strict';

/* =====================================================================
   Gestión — Cobranzas
   Portado de src/routes/cobranzas.js + public/js/cobranzas.js (núcleo)
   Cobro -> RPC registrar_cobro. Anulación -> RPC anular_cobro.
   Bonificación puntual -> RPC bonificar_cuota.
   Pendiente: circuito de cheque, comprobantes adjuntos.
   ===================================================================== */

(function () {
  const G = window.Gestion;
  const { datos, esc, fmt, avisar, ficha, dialogo, grilla, pastilla, config } = G;

  const vista = document.getElementById('vista-cobranzas');
  const estado = {
    tab: 'pendientes',
    cuotas: [],          // cuotas pendientes con datos de contrato/persona
    seleccion: new Set(),
    inquilino: null,
    historial: [],
    filtroPend: '',
  };

  async function cargar() {
    vista.innerHTML = `
      <div class="filtros">
        <button class="boton" data-tab="pendientes">Por cobrar</button>
        <button class="boton" data-tab="historial">Historial de cobros</button>
        <span class="filtros__separador"></span>
        <input type="search" id="cb-q" placeholder="Buscar inquilino o inmueble">
      </div>
      <div id="cobranzas-cont"></div>`;
    vista.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { estado.tab = b.dataset.tab; render(); }));
    const q = vista.querySelector('#cb-q');
    let t;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { estado.filtroPend = q.value.trim().toLowerCase(); render(); }, 250); });
    await traer();
  }

  async function traer() {
    const [cuotas, contratos, props, personas, pagos] = await Promise.all([
      datos.lista(datos.tabla('cuota').select('*').eq('estado', 'pendiente').order('fecha_vencimiento')),
      datos.lista(datos.tabla('contrato').select('id, propiedad_id, inquilino_id, moneda, punitorio_diario_pct, dias_gracia_mora')),
      datos.lista(datos.tabla('propiedad').select('id, calle, numero')),
      datos.lista(datos.tabla('persona').select('id, nombre, telefono')),
      datos.lista(datos.tabla('pago').select('*').order('fecha_pago', { ascending: false }).limit(300)),
    ]);
    const cById = Object.fromEntries(contratos.map((c) => [c.id, c]));
    const pById = Object.fromEntries(props.map((p) => [p.id, [p.calle, p.numero].filter(Boolean).join(' ') || '(sin dirección)']));
    const perById = Object.fromEntries(personas.map((p) => [p.id, p]));

    estado.cuotas = cuotas.map((cu) => {
      const c = cById[cu.contrato_id] || {};
      return {
        ...cu,
        moneda: c.moneda || 'ARS',
        contrato: c,
        inquilino_id: c.inquilino_id,
        inquilino: perById[c.inquilino_id]?.nombre || '?',
        telefono: perById[c.inquilino_id]?.telefono || '',
        direccion: pById[c.propiedad_id] || '?',
        total: totalACobrar(cu, c),
      };
    });
    estado.historial = pagos.map((p) => ({ ...p, inquilino: perById[p.persona_id]?.nombre || '?' }));
    render();
  }

  function totalACobrar(cu, c, fechaPago) {
    const base = cu.monto_alquiler + cu.monto_expensas + cu.monto_otros - cu.bonificacion;
    const pct = (c.punitorio_diario_pct ?? config.numero('punitorio_diario_pct', 0.1));
    const gracia = (c.dias_gracia_mora ?? config.numero('dias_gracia_mora', 5));
    const dias = G.diasEntre(cu.fecha_vencimiento, fechaPago || G.hoyISO()) - gracia;
    const mora = (dias > 0 && pct > 0) ? Math.round(base * pct / 100 * dias) : 0;
    return base + mora;
  }

  function render() {
    vista.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('boton--principal', b.dataset.tab === estado.tab));
    if (estado.tab === 'pendientes') renderPendientes();
    else renderHistorial();
  }

  function renderPendientes() {
    const porInq = {};
    estado.cuotas.forEach((cu) => {
      const k = cu.inquilino_id;
      porInq[k] = porInq[k] || { id: k, nombre: cu.inquilino, telefono: cu.telefono, cuotas: [], total: 0, vencidas: 0 };
      porInq[k].cuotas.push(cu);
      porInq[k].total += cu.total;
      if (cu.fecha_vencimiento < G.hoyISO()) porInq[k].vencidas++;
    });
    let filas = Object.values(porInq);
    if (estado.filtroPend) filas = filas.filter((f) => (f.nombre + ' ' + f.cuotas.map((c) => c.direccion).join(' ')).toLowerCase().includes(estado.filtroPend));
    filas.sort((a, b) => b.vencidas - a.vencidas || b.total - a.total);

    document.getElementById('barra-contador').textContent = `${filas.length} inquilino(s) con cuotas por cobrar`;
    document.getElementById('cobranzas-cont').innerHTML = grilla([
      { th: 'Inquilino', render: (f) => `<strong>${esc(f.nombre)}</strong>` },
      { th: 'Cuotas', clase: 'col-corto', render: (f) => `${f.cuotas.length}${f.vencidas ? ` <span class="texto-alerta">(${f.vencidas} vencida${f.vencidas === 1 ? '' : 's'})</span>` : ''}` },
      { th: 'Total a cobrar', clase: 'num col-monto', render: (f) => esc(fmt.dinero(f.total, f.cuotas[0].moneda)) },
    ], filas, { idCampo: 'id', filaAttrs: (f) => `data-mora="${f.vencidas ? 1 : 0}"` });

    const tb = document.querySelector('#cobranzas-cont tbody');
    if (tb) tb.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (tr) abrirCuotasInquilino(Number(tr.dataset.id));
    });
  }

  function abrirCuotasInquilino(inquilinoId) {
    const cuotas = estado.cuotas.filter((c) => c.inquilino_id === inquilinoId);
    if (!cuotas.length) return;
    estado.inquilino = { id: inquilinoId, nombre: cuotas[0].inquilino, moneda: cuotas[0].moneda };
    estado.seleccion = new Set();

    ficha.abrir({
      titulo: `Cobrar — ${esc(cuotas[0].inquilino)}`,
      cuerpo: `<div id="cuotas-inq"></div>`,
      textoGuardar: 'Registrar cobro de lo seleccionado',
      guardar: () => abrirCobro(),
    });
    dibujarCuotasInquilino(cuotas);
  }

  function dibujarCuotasInquilino(cuotas) {
    const cont = document.getElementById('cuotas-inq');
    cont.innerHTML = `<div class="grilla-envoltorio"><table class="grilla">
      <thead><tr><th class="col-check"><input type="checkbox" id="cb-todas"></th><th>Período</th><th>Vence</th><th class="num col-monto">Base</th><th class="num">Bonif.</th><th class="num col-monto">A cobrar</th><th class="col-accion"></th></tr></thead>
      <tbody>${cuotas.map((cu) => {
        const base = cu.monto_alquiler + cu.monto_expensas + cu.monto_otros - cu.bonificacion;
        const venc = cu.fecha_vencimiento < G.hoyISO();
        return `<tr data-id="${cu.id}" data-mora="${venc ? 1 : 0}">
          <td class="col-check"><input type="checkbox" data-cuota="${cu.id}"></td>
          <td>${fmt.periodo(cu.periodo)}</td>
          <td>${fmt.fecha(cu.fecha_vencimiento)}</td>
          <td class="num col-monto">${esc(fmt.dinero(base, cu.moneda))}</td>
          <td class="num">${cu.bonificacion ? esc(fmt.dinero(cu.bonificacion, cu.moneda)) : '—'}</td>
          <td class="num col-monto"><strong>${esc(fmt.dinero(cu.total, cu.moneda))}</strong></td>
          <td class="col-accion"><button class="boton" data-bonificar="${cu.id}">Bonificar</button></td>
        </tr>`;
      }).join('')}</tbody></table></div>
      <p class="propietario__suma" id="cobro-total">Seleccioná cuotas para cobrar.</p>`;

    cont.querySelector('#cb-todas').addEventListener('change', (e) => {
      cont.querySelectorAll('[data-cuota]').forEach((chk) => { chk.checked = e.target.checked; toggle(Number(chk.dataset.cuota), e.target.checked); });
      totalSel();
    });
    cont.querySelectorAll('[data-cuota]').forEach((chk) => chk.addEventListener('change', () => { toggle(Number(chk.dataset.cuota), chk.checked); totalSel(); }));
    cont.querySelectorAll('[data-bonificar]').forEach((b) => b.addEventListener('click', () => abrirBonificar(Number(b.dataset.bonificar))));
  }

  function toggle(id, on) { on ? estado.seleccion.add(id) : estado.seleccion.delete(id); }
  function totalSel() {
    const sel = estado.cuotas.filter((c) => estado.seleccion.has(c.id));
    const total = sel.reduce((t, c) => t + c.total, 0);
    document.getElementById('cobro-total').textContent = sel.length
      ? `${sel.length} cuota(s) · Total ${fmt.dinero(total, sel[0].moneda)}`
      : 'Seleccioná cuotas para cobrar.';
  }

  function abrirBonificar(cuotaId) {
    const cu = estado.cuotas.find((c) => c.id === cuotaId);
    dialogo.abrir({
      titulo: `Bonificar cuota ${fmt.periodo(cu.periodo)}`,
      cuerpo: `<p>Se descuenta del monto de la cuota antes de cobrarla (no es un pago parcial).</p>
        <div class="campo"><label>Monto a bonificar</label><input type="text" inputmode="decimal" id="bn-monto" data-dinero="1"></div>
        <div class="campo"><label>Motivo</label><textarea id="bn-motivo" placeholder="Por qué se bonifica"></textarea></div>`,
      textoConfirmar: 'Bonificar',
      confirmar: async () => {
        await datos.rpc('bonificar_cuota', {
          p_cuota_id: cuotaId,
          p_monto: fmt.aCentavos(document.getElementById('bn-monto').value) || 0,
          p_motivo: document.getElementById('bn-motivo').value.trim(),
        });
        avisar('Cuota bonificada.');
        dialogo.cerrar();
        await traer();
        abrirCuotasInquilino(cu.inquilino_id);
      },
    });
  }

  function abrirCobro() {
    const sel = estado.cuotas.filter((c) => estado.seleccion.has(c.id));
    if (!sel.length) return avisar('Elegí al menos una cuota.', 'error');
    const total = sel.reduce((t, c) => t + c.total, 0);
    const moneda = sel[0].moneda;

    dialogo.abrir({
      titulo: 'Registrar cobro',
      cuerpo: `<p><strong>${sel.length}</strong> cuota(s) · Total <strong>${fmt.dinero(total, moneda)}</strong></p>
        <div class="campo"><label>Fecha de pago (real)</label><input type="date" id="co-fecha" value="${G.hoyISO()}"></div>
        <div class="campo"><label>Medio de pago</label>
          <select id="co-medio">
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="deposito">Depósito</option>
            <option value="mercadopago">Mercado Pago</option>
            <option value="cheque">Cheque</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div class="campo"><label>Referencia (opcional)</label><input type="text" id="co-ref" placeholder="Nº de operación, banco…"></div>
        <div class="campo"><label>Observaciones</label><textarea id="co-obs"></textarea></div>
        <p class="campo__ayuda">La mora se calcula con la fecha de pago real. Si es una fecha anterior a hoy (cobro tardío que se carga después), se calcula igual con esa fecha.</p>`,
      textoConfirmar: 'Confirmar cobro',
      confirmar: async () => {
        const fecha = document.getElementById('co-fecha').value;
        const medio = document.getElementById('co-medio').value;
        const ref = document.getElementById('co-ref').value.trim();
        // Recalcular total con la fecha elegida (mora)
        const totalReal = sel.reduce((t, c) => t + totalACobrar(c, c.contrato, fecha), 0);
        const res = await datos.rpc('registrar_cobro', {
          p_persona_id: estado.inquilino.id,
          p_fecha_pago: fecha,
          p_moneda: moneda,
          p_cuota_ids: sel.map((c) => c.id),
          p_medios: [{ medio_pago: medio, monto: totalReal, referencia: ref || null, comision_monto: 0 }],
          p_observaciones: document.getElementById('co-obs').value.trim() || null,
        });
        avisar(`Cobro registrado. Recibo Nº ${res.numero} por ${fmt.dinero(res.total, moneda)}.`);
        dialogo.cerrar(); ficha.cerrar();
        G.invalidar('liquidaciones'); G.invalidar('caja'); G.invalidar('inicio');
        await traer();
      },
    });
  }

  /* --------------------------- Historial -------------------------- */

  function renderHistorial() {
    const filas = estado.historial;
    document.getElementById('barra-contador').textContent = `${filas.length} cobro(s)`;
    document.getElementById('cobranzas-cont').innerHTML = grilla([
      { th: 'Fecha', clase: 'col-corto', render: (p) => fmt.fecha(p.fecha_pago) },
      { th: 'Inquilino', render: (p) => `<strong>${esc(p.inquilino)}</strong>` },
      { th: 'Monto', clase: 'num col-monto', render: (p) => esc(fmt.dinero(p.monto, p.moneda)) },
      { th: 'Medio', clase: 'col-corto', render: (p) => fmt.titulo(p.medio_pago) },
      { th: 'Estado', clase: 'col-corto', render: (p) => p.anulado ? pastilla('anulado') : pastilla('pagada') },
    ], filas, { onAbrir: (id) => abrirDetalleCobro(Number(id)) });
    const tb = document.querySelector('#cobranzas-cont tbody');
    if (tb) tb.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (tr) abrirDetalleCobro(Number(tr.dataset.id));
    });
  }

  async function abrirDetalleCobro(id) {
    const p = estado.historial.find((x) => x.id === id);
    const [imp, recibo] = await Promise.all([
      datos.lista(datos.tabla('pago_imputacion').select('*, cuota(periodo)').eq('pago_id', id)),
      p.recibo_id ? datos.uno(datos.tabla('recibo').select('*').eq('id', p.recibo_id)) : Promise.resolve(null),
    ]);
    ficha.abrir({
      titulo: `Cobro del ${fmt.fecha(p.fecha_pago)}`,
      angosta: true,
      cuerpo: `<div class="lista-simple">
        <div class="lista-simple__item"><strong>Inquilino</strong>${esc(p.inquilino)}</div>
        <div class="lista-simple__item"><strong>Monto</strong>${esc(fmt.dinero(p.monto, p.moneda))} · ${fmt.titulo(p.medio_pago)}</div>
        ${recibo ? `<div class="lista-simple__item"><strong>Recibo</strong>Nº ${recibo.numero}${recibo.anulado ? ' (ANULADO)' : ''}</div>` : ''}
        <div class="lista-simple__item"><strong>Imputación</strong>${imp.map((i) => `${fmt.titulo(i.concepto)} ${fmt.periodo(i.cuota?.periodo)}: ${fmt.dinero(i.monto, p.moneda)}`).join('<br>')}</div>
        ${p.anulado ? `<div class="lista-simple__item"><strong>Anulado</strong>${esc(p.motivo_anulacion || '')}</div>` : ''}
      </div>`,
      extra: p.anulado ? '' : `<button class="boton boton--peligro" id="btn-anular-cobro">Anular cobro</button>`,
    });
    if (!p.anulado) document.getElementById('btn-anular-cobro').addEventListener('click', () => {
      dialogo.abrir({
        titulo: 'Anular cobro', peligro: true, textoConfirmar: 'Anular',
        cuerpo: `<p>La cuota vuelve a pendiente y se revierte el movimiento de caja. No se borra nada.</p>
          <div class="campo"><label>Motivo</label><textarea id="an-motivo"></textarea></div>`,
        confirmar: async () => {
          await datos.rpc('anular_cobro', { p_pago_id: id, p_motivo: document.getElementById('an-motivo').value.trim() });
          avisar('Cobro anulado.');
          dialogo.cerrar(); ficha.cerrar();
          G.invalidar('liquidaciones'); G.invalidar('caja');
          await traer();
        },
      });
    });
  }

  G.registrarModulo('cobranzas', { titulo: 'Cobranzas', cargar, abrirCuotasInquilino: (id) => { G.irAModulo('cobranzas'); abrirCuotasInquilino(id); } });
})();
