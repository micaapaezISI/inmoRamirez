'use strict';

/* =====================================================================
   Gestión — Alquileres y contratos
   Portado de src/routes/contratos.js + src/contratos/*.js + public/js/contratos.js
   Alta -> RPC crear_contrato (contrato + garantes + generación de cuotas).
   Rescisión / renovación -> RPC rescindir_contrato / renovar_contrato.
   Pendiente: cláusulas, documentos adjuntos, contrato en PDF, ajuste IPC.
   ===================================================================== */

(function () {
  const G = window.Gestion;
  const { datos, esc, fmt, avisar, ficha, dialogo, grilla, pastilla, campo, leerFormulario, config } = G;

  const vista = document.getElementById('vista-alquileres');
  const estado = { filas: [], filtros: { q: '', estado: '' }, indices: [], garantes: [] };

  async function cargarIndices() {
    estado.indices = await datos.lista(datos.tabla('indice').select('*').eq('activo', true));
  }

  async function cargar() {
    if (!estado.indices.length) await cargarIndices();
    vista.innerHTML = `
      <div class="filtros">
        <input type="search" id="fc-q" placeholder="Buscar por inquilino, inmueble o #" value="${esc(estado.filtros.q)}">
        <span class="filtros__separador"></span>
        <select id="fc-estado">
          <option value="">Todo estado</option>
          <option value="vigente">Vigente</option>
          <option value="vencido">Vencido</option>
          <option value="rescindido">Rescindido</option>
          <option value="renovado">Renovado</option>
        </select>
        <span class="filtros__separador"></span>
        <button class="boton" id="fc-limpiar">Limpiar</button>
      </div>
      <div id="alquileres-grilla"></div>`;

    const q = vista.querySelector('#fc-q');
    let t;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { estado.filtros.q = q.value.trim(); dibujar(); }, 250); });
    const fe = vista.querySelector('#fc-estado');
    fe.value = estado.filtros.estado;
    fe.addEventListener('change', () => { estado.filtros.estado = fe.value; dibujar(); });
    vista.querySelector('#fc-limpiar').addEventListener('click', () => { estado.filtros = { q: '', estado: '' }; cargar(); });

    await traer();
  }

  async function traer() {
    const [contratos, props, personas, saldos] = await Promise.all([
      datos.lista(datos.tabla('contrato').select('*').order('creado_en', { ascending: false })),
      datos.lista(datos.tabla('propiedad').select('id, calle, numero, barrio')),
      datos.lista(datos.tabla('persona').select('id, nombre')),
      datos.lista(datos.tabla('v_cuota_saldo').select('contrato_id, saldo')).catch(() => []),
    ]);
    const dirDe = Object.fromEntries(props.map((p) => [p.id, [p.calle, p.numero].filter(Boolean).join(' ') || '(sin dirección)']));
    const nombreDe = Object.fromEntries(personas.map((p) => [p.id, p.nombre]));
    const deuda = {};
    saldos.forEach((s) => { deuda[s.contrato_id] = (deuda[s.contrato_id] || 0) + Number(s.saldo || 0); });
    estado.filas = contratos.map((c) => ({
      ...c,
      direccion: dirDe[c.propiedad_id] || '?',
      inquilino: nombreDe[c.inquilino_id] || '?',
      deuda: deuda[c.id] || 0,
    }));
    dibujar();
  }

  function dibujar() {
    const f = estado.filtros;
    const q = f.q.toLowerCase();
    const filas = estado.filas.filter((c) => {
      if (f.estado && c.estado !== f.estado) return false;
      if (q && !`${c.id} ${c.inquilino} ${c.direccion}`.toLowerCase().includes(q)) return false;
      return true;
    });
    document.getElementById('barra-contador').textContent = `${filas.length} contrato${filas.length === 1 ? '' : 's'}`;
    const cont = document.getElementById('alquileres-grilla');
    cont.innerHTML = grilla([
      { th: '#', clase: 'col-corto mono', render: (c) => c.id },
      { th: 'Inmueble', render: (c) => `<strong>${esc(c.direccion)}</strong>` },
      { th: 'Inquilino', render: (c) => esc(c.inquilino) },
      { th: 'Desde', clase: 'col-corto', render: (c) => fmt.fecha(c.fecha_inicio) },
      { th: 'Hasta', clase: 'col-corto', render: (c) => fmt.fecha(c.fecha_fin) },
      { th: 'Monto', clase: 'num col-monto', render: (c) => esc(fmt.dinero(c.monto_inicial, c.moneda)) },
      { th: 'Estado', clase: 'col-corto', render: (c) => pastilla(c.estado) },
      { th: 'Deuda', clase: 'num col-monto', render: (c) => c.deuda > 0 ? `<span class="texto-alerta">${esc(fmt.dinero(c.deuda, c.moneda))}</span>` : '<span class="tenue">—</span>' },
    ], filas, { onAbrir: (id) => abrir(Number(id)) });
  }

  /* ---------------------------- Alta ------------------------------ */

  async function nuevo(propiedadId) {
    estado.garantes = [];
    const [props, personas] = await Promise.all([
      datos.lista(datos.tabla('propiedad').select('id, calle, numero, estado').eq('activo', true).in('estado', ['disponible', 'alquilada']).order('calle')),
      datos.lista(datos.tabla('persona').select('id, nombre').eq('activo', true).order('nombre')),
    ]);
    const optProps = props.map((p) => [p.id, `${[p.calle, p.numero].filter(Boolean).join(' ') || '(sin dirección)'}`]);
    const optPers = personas.map((p) => [p.id, p.nombre]);

    ficha.abrir({
      titulo: 'Nuevo contrato',
      cuerpo: `<form id="contrato-form">
        <fieldset><legend>Partes</legend><div class="rejilla">
          ${campo('propiedad_id', 'Inmueble', { tipo: 'select', opts: [['', 'Elegí…'], ...optProps], valor: propiedadId || '', requerido: true, ancho: 2 })}
          ${campo('inquilino_id', 'Inquilino', { tipo: 'select', opts: [['', 'Elegí…'], ...optPers], requerido: true, ancho: 2 })}
        </div></fieldset>
        <fieldset><legend>Términos</legend><div class="rejilla">
          ${campo('tipo_contrato', 'Tipo', { tipo: 'select', opts: ['vivienda', 'comercial', 'cochera', 'temporal', 'otro'] })}
          ${campo('fecha_inicio', 'Inicio', { tipo: 'date', requerido: true })}
          ${campo('fecha_fin', 'Fin', { tipo: 'date', requerido: true })}
          ${campo('dia_vencimiento', 'Día de vencimiento', { tipo: 'number', min: 1, valor: 10 })}
          ${campo('monto_inicial', 'Monto mensual', { tipo: 'dinero', requerido: true })}
          ${campo('moneda', 'Moneda', { tipo: 'select', opts: ['ARS', 'USD'] })}
          ${campo('deposito', 'Depósito', { tipo: 'dinero' })}
          ${campo('comision_admin_pct', 'Comisión admin. (%)', { tipo: 'number', step: '0.01', valor: config.numero('comision_admin_pct', 10) })}
        </div></fieldset>
        <fieldset><legend>Ajuste</legend><div class="rejilla">
          ${campo('ajuste_tipo', 'Tipo de ajuste', { tipo: 'select', opts: [['sin_ajuste', 'Sin ajuste'], ['porcentaje', 'Porcentaje fijo'], ['indice', 'Índice']] })}
          ${campo('ajuste_meses', 'Cada cuántos meses', { tipo: 'number', min: 1, valor: 6 })}
          ${campo('ajuste_valor', 'Porcentaje (%)', { tipo: 'number', step: '0.01', ayuda: 'Solo si el ajuste es por porcentaje' })}
          ${campo('indice_codigo', 'Índice', { tipo: 'select', opts: [['', '—'], ...estado.indices.map((i) => [i.codigo, i.codigo])], ayuda: 'ICL / UVA / CER' })}
          ${campo('indice_valor_base', 'Valor base del índice', { tipo: 'number', step: '0.0001', ayuda: 'El valor del índice a la fecha de inicio' })}
        </div></fieldset>
        <fieldset><legend>Contrato ya en curso (opcional)</legend>
          <p class="campo__ayuda">Si el contrato se firmó hace tiempo y venís cobrando por fuera del sistema, cargá desde cuándo generar cuotas y a qué monto — así no genera cuotas viejas ya cobradas.</p>
          <div class="rejilla">
            ${campo('fecha_inicio_generacion', 'Generar cuotas desde', { tipo: 'date' })}
            ${campo('monto_actual', 'Monto que se cobra hoy', { tipo: 'dinero' })}
          </div>
        </fieldset>
        <fieldset><legend>Garantes</legend>
          <div class="propietarios" id="garantes-lista"></div>
          <div class="importacion__busqueda-persona" style="margin-top:8px;">
            <select id="garante-persona"><option value="">Elegí…</option>${optPers.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select>
            <select id="garante-tipo"><option value="personal">Personal</option><option value="propietaria">Propietaria</option><option value="seguro_caucion">Seguro de caución</option><option value="recibo_sueldo">Recibo de sueldo</option></select>
            <button type="button" class="boton" id="garante-agregar">Agregar garante</button>
          </div>
        </fieldset>
        <fieldset><legend>Notas</legend><div class="rejilla">${campo('notas', 'Notas', { tipo: 'textarea', ancho: 4 })}</div></fieldset>
      </form>`,
      textoGuardar: 'Crear contrato y generar cuotas',
      guardar: guardarNuevo,
    });

    document.getElementById('garante-agregar').addEventListener('click', () => {
      const sel = document.getElementById('garante-persona');
      const pid = Number(sel.value);
      if (!pid) return;
      if (estado.garantes.some((g) => g.persona_id === pid)) return avisar('Ese garante ya está.', 'error');
      estado.garantes.push({ persona_id: pid, tipo_garantia: document.getElementById('garante-tipo').value, nombre: sel.selectedOptions[0].textContent });
      dibujarGarantes();
    });
    dibujarGarantes();
  }

  function dibujarGarantes() {
    const cont = document.getElementById('garantes-lista');
    if (!cont) return;
    cont.innerHTML = estado.garantes.map((g, i) => `<div class="propietario">
      <span class="propietario__nombre">${esc(g.nombre)}</span>
      <span class="tenue">${fmt.titulo(g.tipo_garantia)}</span>
      <button type="button" class="boton boton--peligro" data-quitar-garante="${i}">Quitar</button>
    </div>`).join('') || '<p class="campo__ayuda">Sin garantes.</p>';
    cont.querySelectorAll('[data-quitar-garante]').forEach((b) => b.addEventListener('click', () => {
      estado.garantes.splice(Number(b.dataset.quitarGarante), 1); dibujarGarantes();
    }));
  }

  async function guardarNuevo() {
    const form = document.getElementById('contrato-form');
    const b = leerFormulario(form);
    if (!b.propiedad_id || !b.inquilino_id) return avisar('Elegí el inmueble y el inquilino.', 'error');
    if (!b.fecha_inicio || !b.fecha_fin) return avisar('Cargá las fechas de inicio y fin.', 'error');
    if (!b.monto_inicial) return avisar('Cargá el monto mensual.', 'error');
    if (b.fecha_fin <= b.fecha_inicio) return avisar('La fecha de fin tiene que ser posterior al inicio.', 'error');
    if (b.ajuste_tipo === 'porcentaje' && !b.ajuste_valor) return avisar('Cargá el porcentaje de ajuste.', 'error');
    if (b.ajuste_tipo === 'indice' && (!b.indice_codigo || !b.indice_valor_base)) return avisar('Elegí el índice y cargá su valor base.', 'error');
    if ((b.fecha_inicio_generacion && !b.monto_actual) || (!b.fecha_inicio_generacion && b.monto_actual)) {
      return avisar('Para un contrato en curso cargá las dos cosas: desde cuándo y a qué monto.', 'error');
    }

    const id = await datos.rpc('crear_contrato', {
      p_contrato: b,
      p_garantes: estado.garantes.map((g) => ({ persona_id: g.persona_id, tipo_garantia: g.tipo_garantia })),
    });
    avisar('Contrato creado y cuotas generadas.');
    ficha.cerrar();
    G.invalidar('inmuebles');
    G.invalidar('cobranzas');
    await traer();
    abrir(Number(id));
  }

  /* ---------------------------- Ficha ----------------------------- */

  async function abrir(id) {
    const c = await datos.uno(datos.tabla('contrato').select('*').eq('id', id));
    if (!c) return avisar('No existe ese contrato.', 'error');
    const [prop, inq, cuotas, garantes, ajustes] = await Promise.all([
      datos.uno(datos.tabla('propiedad').select('calle, numero, barrio').eq('id', c.propiedad_id)),
      datos.uno(datos.tabla('persona').select('nombre, telefono').eq('id', c.inquilino_id)),
      datos.lista(datos.tabla('cuota').select('*').eq('contrato_id', id).order('fecha_vencimiento')),
      datos.lista(datos.tabla('contrato_garante').select('*, persona(nombre)').eq('contrato_id', id)),
      datos.lista(datos.tabla('contrato_ajuste').select('*').eq('contrato_id', id).order('fecha_vigencia')),
    ]);
    const dir = [prop.calle, prop.numero].filter(Boolean).join(' ') || '(sin dirección)';

    ficha.abrir({
      titulo: `Contrato #${id} — ${esc(dir)}`,
      pestanias: [{ id: 'datos', titulo: 'Términos' }, { id: 'cuotas', titulo: `Cuotas (${cuotas.length})` }, { id: 'garantes', titulo: 'Garantes' }],
      cuerpo: `
        <div class="panel" data-panel="datos" data-activo="1">
          <div class="lista-simple">
            <div class="lista-simple__item"><strong>Inquilino</strong>${esc(inq.nombre)} ${inq.telefono ? `· ${esc(inq.telefono)}` : ''}</div>
            <div class="lista-simple__item"><strong>Vigencia</strong>${fmt.fecha(c.fecha_inicio)} → ${fmt.fecha(c.fecha_fin)} · vence día ${c.dia_vencimiento}</div>
            <div class="lista-simple__item"><strong>Monto inicial</strong>${esc(fmt.dinero(c.monto_inicial, c.moneda))}${c.monto_actual ? ` · monto actual cargado: ${esc(fmt.dinero(c.monto_actual, c.moneda))}` : ''}</div>
            <div class="lista-simple__item"><strong>Ajuste</strong>${ajusteTexto(c)}</div>
            <div class="lista-simple__item"><strong>Depósito</strong>${esc(fmt.dinero(c.deposito, c.moneda)) || '—'}</div>
            <div class="lista-simple__item"><strong>Comisión administración</strong>${c.comision_admin_pct ?? config.numero('comision_admin_pct', 10)}%</div>
            <div class="lista-simple__item"><strong>Estado</strong>${pastilla(c.estado)}${c.fecha_rescision ? ` · rescindido el ${fmt.fecha(c.fecha_rescision)} (${esc(c.motivo_rescision || '')})` : ''}</div>
            ${c.notas ? `<div class="lista-simple__item"><strong>Notas</strong>${esc(c.notas)}</div>` : ''}
          </div>
          ${ajustes.length ? `<fieldset style="margin-top:12px;"><legend>Historial de ajustes</legend>
            <div class="lista-simple">${ajustes.map((a) => `<div class="lista-simple__item">${fmt.fecha(a.fecha_vigencia)}: ${esc(fmt.dinero(a.monto_anterior))} → <strong>${esc(fmt.dinero(a.monto_nuevo))}</strong></div>`).join('')}</div></fieldset>` : ''}
        </div>
        <div class="panel" data-panel="cuotas" data-activo="0">
          ${grilla([
            { th: 'Período', clase: 'col-corto', render: (q) => fmt.periodo(q.periodo) },
            { th: 'Vence', clase: 'col-corto', render: (q) => fmt.fecha(q.fecha_vencimiento) },
            { th: 'Alquiler', clase: 'num col-monto', render: (q) => esc(fmt.dinero(q.monto_alquiler, c.moneda)) },
            { th: 'Expensas', clase: 'num', render: (q) => q.monto_expensas ? esc(fmt.dinero(q.monto_expensas, c.moneda)) : '—' },
            { th: 'Bonif.', clase: 'num', render: (q) => q.bonificacion ? esc(fmt.dinero(q.bonificacion, c.moneda)) : '—' },
            { th: 'Mora', clase: 'num', render: (q) => q.monto_punitorio ? esc(fmt.dinero(q.monto_punitorio, c.moneda)) : '—' },
            { th: 'Estado', clase: 'col-corto', render: (q) => pastilla(q.estado) },
          ], cuotas)}
          ${c.ajuste_tipo === 'indice' ? `<p class="campo__ayuda" style="margin-top:8px;">Si faltan cuotas al final, cargá el valor del índice en Configuración y volvé a generar.</p>
            <button class="boton" id="btn-regenerar-cuotas" style="margin-top:6px;">Generar cuotas que falten</button>` : ''}
        </div>
        <div class="panel" data-panel="garantes" data-activo="0">
          <div class="lista-simple">${garantes.map((g) => `<div class="lista-simple__item"><strong>${esc(g.persona?.nombre || '?')}</strong>${fmt.titulo(g.tipo_garantia)}${g.detalle ? ` · ${esc(g.detalle)}` : ''}</div>`).join('') || '<p class="campo__ayuda">Sin garantes.</p>'}</div>
        </div>`,
      extra: c.estado === 'vigente'
        ? `<button class="boton" id="btn-renovar">Renovar</button><button class="boton boton--peligro" id="btn-rescindir">Rescindir</button>`
        : '',
    });
    ficha.irAPanel('datos');

    if (c.estado === 'vigente') {
      document.getElementById('btn-rescindir').addEventListener('click', () => abrirRescision(c));
      document.getElementById('btn-renovar').addEventListener('click', () => abrirRenovacion(c));
    }
    const btnReg = document.getElementById('btn-regenerar-cuotas');
    if (btnReg) btnReg.addEventListener('click', async () => {
      try {
        const n = await datos.rpc('generar_cuotas_contrato', { p_contrato_id: id });
        avisar(n > 0 ? `${n} cuota(s) generada(s).` : 'No había cuotas nuevas para generar (¿falta el valor del índice?).');
        abrir(id);
      } catch (e) { avisar(G.mensajeError(e), 'error'); }
    });
  }

  function ajusteTexto(c) {
    if (c.ajuste_tipo === 'sin_ajuste') return 'Sin ajuste';
    if (c.ajuste_tipo === 'porcentaje') return `${c.ajuste_valor}% cada ${c.ajuste_meses} meses`;
    return `Índice ${esc(c.indice_codigo)} cada ${c.ajuste_meses} meses (base ${c.indice_valor_base})`;
  }

  function abrirRescision(c) {
    dialogo.abrir({
      titulo: `Rescindir contrato #${c.id}`,
      cuerpo: `<p>Las cuotas pendientes con vencimiento posterior a la fecha se anulan. El inmueble vuelve a disponible.</p>
        <div class="campo" data-campo="fecha"><label>Fecha de rescisión</label><input type="date" id="rc-fecha" value="${G.hoyISO()}"></div>
        <div class="campo" data-campo="motivo"><label>Motivo</label><textarea id="rc-motivo" placeholder="Por qué se rescinde"></textarea></div>`,
      textoConfirmar: 'Rescindir', peligro: true,
      confirmar: async () => {
        await datos.rpc('rescindir_contrato', {
          p_contrato_id: c.id,
          p_fecha: document.getElementById('rc-fecha').value,
          p_motivo: document.getElementById('rc-motivo').value.trim(),
        });
        avisar('Contrato rescindido.');
        dialogo.cerrar(); ficha.cerrar();
        G.invalidar('inmuebles'); G.invalidar('cobranzas');
        await traer();
      },
    });
  }

  function abrirRenovacion(c) {
    dialogo.abrir({
      titulo: `Renovar contrato #${c.id}`,
      cuerpo: `<p>Se crea un contrato nuevo (con sus cuotas) y este queda como "renovado". El monto se renegocia.</p>
        <div class="campo" data-campo="fecha_inicio"><label>Nuevo inicio</label><input type="date" id="rn-inicio" value="${G.sumarMeses(c.fecha_fin, 0)}"></div>
        <div class="campo" data-campo="fecha_fin"><label>Nuevo fin</label><input type="date" id="rn-fin"></div>
        <div class="campo" data-campo="monto_inicial"><label>Nuevo monto mensual</label><input type="text" inputmode="decimal" id="rn-monto" data-dinero="1"></div>
        ${c.ajuste_tipo === 'indice' ? `<div class="campo" data-campo="indice_valor_base"><label>Nuevo valor base del índice ${esc(c.indice_codigo)}</label><input type="number" step="0.0001" id="rn-base"></div>` : ''}`,
      textoConfirmar: 'Renovar',
      confirmar: async () => {
        const cambios = {
          fecha_inicio: document.getElementById('rn-inicio').value,
          fecha_fin: document.getElementById('rn-fin').value,
          monto_inicial: fmt.aCentavos(document.getElementById('rn-monto').value),
        };
        if (!cambios.fecha_fin || !cambios.monto_inicial) throw new Error('Cargá la fecha de fin y el monto nuevo.');
        if (c.ajuste_tipo === 'indice') {
          cambios.indice_valor_base = Number(document.getElementById('rn-base').value);
          if (!cambios.indice_valor_base) throw new Error('Cargá el nuevo valor base del índice.');
        }
        const id = await datos.rpc('renovar_contrato', { p_origen_id: c.id, p_cambios: cambios, p_garantes: [] });
        avisar('Contrato renovado.');
        dialogo.cerrar(); ficha.cerrar();
        G.invalidar('cobranzas');
        await traer();
        abrir(Number(id));
      },
    });
  }

  G.registrarModulo('alquileres', {
    titulo: 'Alquileres',
    textoNuevo: 'Nuevo contrato',
    cargar,
    nuevo: () => nuevo(null),
    abrir,
    abrirNuevoParaInmueble: (pid) => { G.irAModulo('alquileres'); nuevo(pid); },
  });
})();
