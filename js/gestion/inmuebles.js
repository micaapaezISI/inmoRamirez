'use strict';

/* =====================================================================
   Gestión — Inmuebles
   Portado de src/routes/propiedades.js + public/js/propiedades.js (núcleo)
   Pendiente: fotos (bucket property-photos), sincronización con la tabla
   `properties` del sitio público.
   ===================================================================== */

(function () {
  const G = window.Gestion;
  const { datos, esc, fmt, avisar, ficha, dialogo, grilla, pastilla, campo, leerFormulario, config } = G;

  const vista = document.getElementById('vista-inmuebles');
  const estado = { filas: [], filtros: { q: '', operacion: '', estado: '', tipo: '' } };

  const TIPOS = ['casa', 'departamento', 'local', 'oficina', 'terreno', 'galpon', 'cochera', 'campo', 'otro'];
  const OPERACIONES = ['alquiler', 'venta', 'ambas'];
  const ESTADOS = ['disponible', 'reservada', 'alquilada', 'vendida', 'suspendida'];
  const CAMPOS = ['codigo', 'tipo', 'operacion', 'estado', 'calle', 'numero', 'piso', 'departamento',
    'barrio', 'localidad', 'provincia', 'superficie_total', 'superficie_cubierta', 'ambientes',
    'dormitorios', 'banos', 'cocheras', 'antiguedad', 'descripcion', 'nomenclatura_catastral',
    'partida_inmobiliaria', 'matricula_registral', 'precio_alquiler', 'moneda_alquiler',
    'precio_venta', 'moneda_venta', 'expensas', 'comision_admin_pct', 'publicar_web',
    'titulo_publico', 'descripcion_publica', 'ocultar_direccion', 'notas'];
  const DINERO = new Set(['precio_alquiler', 'precio_venta', 'expensas']);

  function direccion(p) {
    return [p.calle, p.numero].filter(Boolean).join(' ') || '(sin dirección)';
  }

  async function cargar() {
    vista.innerHTML = `
      <div class="filtros">
        <input type="search" id="fi-q" placeholder="Buscar por código, dirección, barrio o propietario" value="${esc(estado.filtros.q)}">
        <span class="filtros__separador"></span>
        <select id="fi-operacion"><option value="">Toda operación</option>${OPERACIONES.map((o) => `<option value="${o}">${fmt.titulo(o)}</option>`).join('')}</select>
        <select id="fi-estado"><option value="">Todo estado</option>${ESTADOS.map((o) => `<option value="${o}">${fmt.titulo(o)}</option>`).join('')}</select>
        <select id="fi-tipo"><option value="">Todo tipo</option>${TIPOS.map((o) => `<option value="${o}">${fmt.titulo(o)}</option>`).join('')}</select>
        <span class="filtros__separador"></span>
        <button class="boton" id="fi-limpiar">Limpiar</button>
      </div>
      <div id="inmuebles-grilla"></div>`;

    const q = vista.querySelector('#fi-q');
    let t;
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { estado.filtros.q = q.value.trim(); dibujar(); }, 250); });
    [['fi-operacion', 'operacion'], ['fi-estado', 'estado'], ['fi-tipo', 'tipo']].forEach(([id, k]) => {
      const el = vista.querySelector('#' + id);
      el.value = estado.filtros[k];
      el.addEventListener('change', () => { estado.filtros[k] = el.value; dibujar(); });
    });
    vista.querySelector('#fi-limpiar').addEventListener('click', () => {
      estado.filtros = { q: '', operacion: '', estado: '', tipo: '' };
      cargar();
    });

    await traer();
  }

  async function traer() {
    const [props, vinculos, personas] = await Promise.all([
      datos.lista(datos.tabla('propiedad').select('*').eq('activo', true).order('creado_en', { ascending: false })),
      datos.lista(datos.tabla('propiedad_propietario').select('propiedad_id, persona_id, porcentaje')),
      datos.lista(datos.tabla('persona').select('id, nombre')),
    ]);
    const nombre = Object.fromEntries(personas.map((p) => [p.id, p.nombre]));
    const porProp = {};
    vinculos.forEach((v) => {
      (porProp[v.propiedad_id] = porProp[v.propiedad_id] || []).push({ ...v, nombre: nombre[v.persona_id] });
    });
    estado.filas = props.map((p) => ({ ...p, propietarios: porProp[p.id] || [] }));
    dibujar();
  }

  function dibujar() {
    const f = estado.filtros;
    const q = f.q.toLowerCase();
    const filas = estado.filas.filter((p) => {
      if (f.operacion && p.operacion !== f.operacion) return false;
      if (f.estado && p.estado !== f.estado) return false;
      if (f.tipo && p.tipo !== f.tipo) return false;
      if (q) {
        const texto = [p.codigo, direccion(p), p.barrio, ...(p.propietarios.map((x) => x.nombre))].join(' ').toLowerCase();
        if (!texto.includes(q)) return false;
      }
      return true;
    });
    document.getElementById('barra-contador').textContent = `${filas.length} inmueble${filas.length === 1 ? '' : 's'}`;

    const cont = document.getElementById('inmuebles-grilla');
    cont.innerHTML = grilla([
      { th: 'Código', clase: 'col-corto mono', render: (p) => esc(p.codigo) || '<span class="tenue">—</span>' },
      { th: 'Dirección', render: (p) => `<strong>${esc(direccion(p))}</strong>${p.barrio ? ` <span class="tenue">· ${esc(p.barrio)}</span>` : ''}` },
      { th: 'Tipo', clase: 'col-corto', render: (p) => fmt.titulo(p.tipo) },
      { th: 'Estado', clase: 'col-corto', render: (p) => pastilla(p.estado) },
      { th: 'Alquiler', clase: 'num col-monto', render: (p) => p.precio_alquiler ? esc(fmt.dinero(p.precio_alquiler, p.moneda_alquiler)) : '<span class="tenue">—</span>' },
      { th: 'Venta', clase: 'num col-monto', render: (p) => p.precio_venta ? esc(fmt.dinero(p.precio_venta, p.moneda_venta)) : '<span class="tenue">—</span>' },
      { th: 'Propietario', render: (p) => esc(p.propietarios.map((x) => x.nombre).join(', ')) || '<span class="tenue">—</span>' },
      { th: 'Web', clase: 'col-check', render: (p) => p.publicar_web ? '✓' : '' },
    ], filas, { onAbrir: (id) => abrir(Number(id)) });

    const tb = cont.querySelector('tbody');
    if (tb) tb.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      cont.querySelectorAll('tr[aria-selected="true"]').forEach((x) => x.setAttribute('aria-selected', 'false'));
      tr.setAttribute('aria-selected', 'true');
    });
  }

  /* ------------------------------ Ficha ---------------------------- */

  let borrador = { propietarios: [] };
  let listaPersonas = [];
  let fotos = [];
  const BUCKET = 'property-photos';

  async function abrir(id) {
    let p = null;
    fotos = [];
    listaPersonas = await datos.lista(datos.tabla('persona').select('id, nombre').eq('activo', true).order('nombre'));
    if (id) {
      p = await datos.uno(datos.tabla('propiedad').select('*').eq('id', id));
      const vinc = await datos.lista(datos.tabla('propiedad_propietario').select('*').eq('propiedad_id', id));
      const nombre = Object.fromEntries(listaPersonas.map((x) => [x.id, x.nombre]));
      borrador = { propietarios: vinc.map((v) => ({ persona_id: v.persona_id, porcentaje: v.porcentaje, nombre: nombre[v.persona_id] || '?' })) };
      fotos = await datos.lista(datos.tabla('propiedad_foto').select('*').eq('propiedad_id', id).order('orden'));
    } else {
      borrador = { propietarios: [] };
    }

    const pestanias = [
      { id: 'datos', titulo: 'Datos' },
      { id: 'precios', titulo: 'Precios y web' },
      { id: 'propietarios', titulo: 'Propietarios' },
    ];
    if (id) pestanias.push({ id: 'fotos', titulo: `Fotos (${fotos.length})` });

    ficha.abrir({
      titulo: id ? esc(direccion(p)) : 'Nuevo inmueble',
      cuerpo: cuerpoFicha(p, !!id),
      pestanias,
      textoGuardar: id ? 'Guardar cambios' : 'Crear inmueble',
      extra: id ? `<button class="boton boton--peligro" id="inmueble-baja">Dar de baja</button>` : '',
      guardar: () => guardar(id),
    });
    ficha.irAPanel('datos');
    montarPropietarios();
    if (id) {
      document.getElementById('inmueble-baja').addEventListener('click', () => baja(id, direccion(p)));
      montarFotos(id);
    }
  }

  function cuerpoFicha(p, editando) {
    p = p || {};
    return `<form id="inmueble-form">
      <div class="panel" data-panel="datos" data-activo="1">
        <fieldset><legend>Identificación</legend><div class="rejilla">
          ${campo('codigo', 'Código interno', { valor: p.codigo, ayuda: 'Opcional, único' })}
          ${campo('tipo', 'Tipo', { tipo: 'select', opts: TIPOS, valor: p.tipo || 'casa' })}
          ${campo('operacion', 'Operación', { tipo: 'select', opts: OPERACIONES, valor: p.operacion || 'alquiler' })}
          ${campo('estado', 'Estado', { tipo: 'select', opts: ESTADOS, valor: p.estado || 'disponible', ayuda: 'Se sincroniza solo con el contrato' })}
        </div></fieldset>
        <fieldset><legend>Ubicación</legend><div class="rejilla">
          ${campo('calle', 'Calle', { valor: p.calle, ancho: 2 })}
          ${campo('numero', 'Número', { valor: p.numero })}
          ${campo('piso', 'Piso', { valor: p.piso })}
          ${campo('departamento', 'Depto', { valor: p.departamento })}
          ${campo('barrio', 'Barrio', { valor: p.barrio })}
          ${campo('localidad', 'Localidad', { valor: p.localidad || config.texto('localidad_default') })}
          ${campo('provincia', 'Provincia', { valor: p.provincia || config.texto('provincia_default') })}
        </div></fieldset>
        <fieldset><legend>Características</legend><div class="rejilla">
          ${campo('superficie_total', 'Sup. total (m²)', { tipo: 'number', step: '0.01', valor: p.superficie_total })}
          ${campo('superficie_cubierta', 'Sup. cubierta (m²)', { tipo: 'number', step: '0.01', valor: p.superficie_cubierta })}
          ${campo('ambientes', 'Ambientes', { tipo: 'number', min: 0, valor: p.ambientes })}
          ${campo('dormitorios', 'Dormitorios', { tipo: 'number', min: 0, valor: p.dormitorios })}
          ${campo('banos', 'Baños', { tipo: 'number', min: 0, valor: p.banos })}
          ${campo('cocheras', 'Cocheras', { tipo: 'number', min: 0, valor: p.cocheras })}
          ${campo('antiguedad', 'Antigüedad (años)', { tipo: 'number', min: 0, valor: p.antiguedad })}
          ${campo('descripcion', 'Descripción interna', { tipo: 'textarea', valor: p.descripcion, ancho: 4 })}
        </div></fieldset>
        <fieldset><legend>Datos registrales</legend><div class="rejilla">
          ${campo('nomenclatura_catastral', 'Nomenclatura catastral', { valor: p.nomenclatura_catastral, ancho: 2 })}
          ${campo('partida_inmobiliaria', 'Partida inmobiliaria', { valor: p.partida_inmobiliaria })}
          ${campo('matricula_registral', 'Matrícula registral', { valor: p.matricula_registral })}
        </div></fieldset>
        <fieldset><legend>Notas</legend><div class="rejilla">${campo('notas', 'Notas internas', { tipo: 'textarea', valor: p.notas, ancho: 4 })}</div></fieldset>
      </div>

      <div class="panel" data-panel="precios" data-activo="0">
        <fieldset><legend>Precios</legend><div class="rejilla">
          ${campo('precio_alquiler', 'Precio alquiler', { tipo: 'dinero', valor: p.precio_alquiler })}
          ${campo('moneda_alquiler', 'Moneda', { tipo: 'select', opts: ['ARS', 'USD'], valor: p.moneda_alquiler || 'ARS' })}
          ${campo('precio_venta', 'Precio venta', { tipo: 'dinero', valor: p.precio_venta })}
          ${campo('moneda_venta', 'Moneda', { tipo: 'select', opts: ['ARS', 'USD'], valor: p.moneda_venta || 'USD' })}
          ${campo('expensas', 'Expensas', { tipo: 'dinero', valor: p.expensas })}
          ${campo('comision_admin_pct', 'Comisión admin. (%)', { tipo: 'porcentaje', valor: p.comision_admin_pct ?? config.numero('comision_admin_pct', 10), ayuda: 'Si no cargás nada acá, se usa la comisión general de Configuración.' })}
        </div></fieldset>
        <fieldset><legend>Publicación en el sitio</legend><div class="rejilla">
          ${campo('publicar_web', 'Mostrar en la web pública', { tipo: 'checkbox', valor: p.publicar_web })}
          ${campo('ocultar_direccion', 'Ocultar la dirección exacta', { tipo: 'checkbox', valor: p.ocultar_direccion })}
          ${campo('titulo_publico', 'Título público', { valor: p.titulo_publico, ancho: 4 })}
          ${campo('descripcion_publica', 'Descripción pública', { tipo: 'textarea', valor: p.descripcion_publica, ancho: 4 })}
        </div>
        <p class="campo__ayuda">Tildando "Mostrar en la web pública" este inmueble aparece solo en el sitio (pestaña "Propiedades"). Para que además salga entre las destacadas de Inicio, andá a la pestaña "Destacadas" del panel y tildalo ahí.</p>
        </fieldset>
      </div>

      <div class="panel" data-panel="propietarios" data-activo="0">
        <fieldset><legend>Propietarios</legend>
          <p class="campo__ayuda">Un inmueble puede tener varios dueños. Los porcentajes tienen que sumar 100 para poder liquidar.</p>
          <div class="propietarios" id="prop-lista"></div>
          <div class="importacion__busqueda-persona" style="margin-top:10px;">
            <select id="prop-persona"><option value="">Elegí una persona…</option></select>
            <input type="text" inputmode="decimal" id="prop-pct" placeholder="%" style="width:70px;">
            <button type="button" class="boton" id="prop-agregar">Agregar</button>
          </div>
          <p class="propietario__suma" id="prop-suma"></p>
        </fieldset>
      </div>

      ${editando ? `<div class="panel" data-panel="fotos" data-activo="0">
        <fieldset><legend>Fotos</legend>
          <p class="campo__ayuda">La primera foto es la portada. Se publican en el sitio si el inmueble tiene "Mostrar en la web pública" tildado.</p>
          <input type="file" id="foto-input" accept="image/*" multiple style="margin-bottom:10px;">
          <div class="fotos" id="fotos-grilla"></div>
          <p id="fotos-estado" class="campo__ayuda"></p>
        </fieldset>
      </div>` : ''}
    </form>`;
  }

  function montarFotos(propId) {
    const input = document.getElementById('foto-input');
    if (!input) return;
    input.addEventListener('change', async () => {
      const files = [...input.files];
      input.value = '';
      const estadoEl = document.getElementById('fotos-estado');
      for (let i = 0; i < files.length; i++) {
        estadoEl.textContent = `Subiendo ${i + 1}/${files.length}…`;
        const file = files[i];
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const path = `gestion/${propId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await G.sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg' });
        if (upErr) { avisar(G.mensajeError(upErr), 'error'); break; }
        const { data: pub } = G.sb.storage.from(BUCKET).getPublicUrl(path);
        const nueva = await datos.crear('propiedad_foto', {
          propiedad_id: propId, archivo: pub.publicUrl,
          orden: fotos.length, es_portada: fotos.length === 0,
        });
        fotos.push(nueva);
      }
      estadoEl.textContent = '';
      dibujarFotos(propId);
    });
    dibujarFotos(propId);
  }

  function dibujarFotos(propId) {
    const cont = document.getElementById('fotos-grilla');
    if (!cont) return;
    cont.innerHTML = fotos.map((f, i) => `
      <div class="foto" data-portada="${f.es_portada ? 1 : 0}">
        ${f.es_portada ? '<span class="foto__marca">Portada</span>' : ''}
        <img src="${esc(f.archivo)}" alt="">
        <div class="foto__acciones">
          <button type="button" data-mover="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>◀</button>
          <button type="button" data-portada-id="${f.id}">⭐</button>
          <button type="button" data-mover="${i}" data-dir="1" ${i === fotos.length - 1 ? 'disabled' : ''}>▶</button>
          <button type="button" data-borrar="${f.id}" style="color:var(--error);">✕</button>
        </div>
      </div>`).join('') || '<p class="campo__ayuda">Sin fotos todavía.</p>';

    cont.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
      await G.sb.from('propiedad_foto').delete().eq('id', Number(b.dataset.borrar));
      fotos = fotos.filter((x) => x.id !== Number(b.dataset.borrar));
      if (fotos.length && !fotos.some((x) => x.es_portada)) { fotos[0].es_portada = true; await guardarOrdenFotos(propId); }
      dibujarFotos(propId);
    }));
    cont.querySelectorAll('[data-portada-id]').forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.dataset.portadaId);
      fotos.forEach((x) => { x.es_portada = x.id === id; });
      await guardarOrdenFotos(propId);
      dibujarFotos(propId);
    }));
    cont.querySelectorAll('[data-mover]').forEach((b) => b.addEventListener('click', async () => {
      const i = Number(b.dataset.mover); const j = i + Number(b.dataset.dir);
      if (j < 0 || j >= fotos.length) return;
      [fotos[i], fotos[j]] = [fotos[j], fotos[i]];
      await guardarOrdenFotos(propId);
      dibujarFotos(propId);
    }));
  }

  async function guardarOrdenFotos(propId) {
    for (let i = 0; i < fotos.length; i++) {
      await G.sb.from('propiedad_foto').update({ orden: i, es_portada: fotos[i].es_portada }).eq('id', fotos[i].id);
    }
  }

  function montarPropietarios() {
    const sel = document.getElementById('prop-persona');
    sel.innerHTML = '<option value="">Elegí una persona…</option>' +
      listaPersonas.map((x) => `<option value="${x.id}">${esc(x.nombre)}</option>`).join('');
    document.getElementById('prop-agregar').addEventListener('click', () => {
      const pid = Number(sel.value);
      const pctBruto = document.getElementById('prop-pct').value;
      if (pctBruto.trim() !== '' && fmt.aPorcentaje(pctBruto) === null) return avisar('Ese porcentaje no es válido, escribilo así: 33,33', 'error');
      const pct = fmt.aPorcentaje(pctBruto) ?? 0;
      if (!pid) return avisar('Elegí una persona.', 'error');
      if (borrador.propietarios.some((x) => x.persona_id === pid)) return avisar('Esa persona ya está.', 'error');
      borrador.propietarios.push({ persona_id: pid, porcentaje: pct, nombre: sel.selectedOptions[0].textContent });
      sel.value = ''; document.getElementById('prop-pct').value = '';
      dibujarPropietarios();
    });
    dibujarPropietarios();
  }

  function dibujarPropietarios() {
    const cont = document.getElementById('prop-lista');
    cont.innerHTML = borrador.propietarios.map((x, i) => `
      <div class="propietario">
        <span class="propietario__nombre">${esc(x.nombre)}</span>
        <input type="text" inputmode="decimal" value="${fmt.porcentaje(x.porcentaje)}" data-pct="${i}">
        <button type="button" class="boton boton--peligro" data-quitar="${i}">Quitar</button>
      </div>`).join('') || '<p class="campo__ayuda">Todavía sin propietarios.</p>';
    cont.querySelectorAll('[data-pct]').forEach((el) => el.addEventListener('input', () => {
      borrador.propietarios[Number(el.dataset.pct)].porcentaje = fmt.aPorcentaje(el.value) ?? 0;
      sumaPropietarios();
    }));
    cont.querySelectorAll('[data-quitar]').forEach((el) => el.addEventListener('click', () => {
      borrador.propietarios.splice(Number(el.dataset.quitar), 1);
      dibujarPropietarios();
    }));
    sumaPropietarios();
  }

  function sumaPropietarios() {
    const suma = borrador.propietarios.reduce((t, x) => t + Number(x.porcentaje || 0), 0);
    const el = document.getElementById('prop-suma');
    el.textContent = `Suman ${suma}%`;
    el.dataset.error = (borrador.propietarios.length && Math.abs(suma - 100) > 0.01) ? '1' : '0';
  }

  async function guardar(id) {
    const form = document.getElementById('inmueble-form');
    const b = leerFormulario(form);
    const fila = {};
    CAMPOS.forEach((c) => { fila[c] = b[c] === undefined ? null : b[c]; });
    if (!fila.calle && !fila.codigo) { avisar('Cargá al menos la calle o un código.', 'error'); return; }

    if (borrador.propietarios.length) {
      const suma = borrador.propietarios.reduce((t, x) => t + Number(x.porcentaje || 0), 0);
      if (Math.abs(suma - 100) > 0.01) { avisar('Los porcentajes de los propietarios tienen que sumar 100.', 'error'); return; }
    }

    let propId = id;
    if (id) {
      await datos.actualizar('propiedad', id, { ...fila, actualizado_en: new Date().toISOString() });
    } else {
      const creada = await datos.crear('propiedad', fila);
      propId = creada.id;
    }

    // Propietarios: se reemplaza el set completo (simple y suficiente acá).
    await G.sb.from('propiedad_propietario').delete().eq('propiedad_id', propId);
    if (borrador.propietarios.length) {
      const { error } = await G.sb.from('propiedad_propietario').insert(
        borrador.propietarios.map((x, i) => ({
          propiedad_id: propId, persona_id: x.persona_id,
          porcentaje: x.porcentaje, es_contacto_principal: i === 0,
        }))
      );
      if (error) throw error;
    }

    avisar(id ? 'Inmueble actualizado.' : 'Inmueble creado.');
    ficha.cerrar();
    G.invalidar('alquileres');
    await traer();
  }

  function baja(id, dir) {
    dialogo.abrir({
      titulo: 'Dar de baja',
      cuerpo: `<p>Se da de baja <strong>${esc(dir)}</strong>. Queda fuera de los listados; sus contratos y su historial siguen intactos.</p>
        <p class="campo__ayuda">No se puede si tiene un contrato vigente encima.</p>`,
      textoConfirmar: 'Dar de baja', peligro: true,
      confirmar: async () => {
        const vig = await datos.lista(datos.tabla('contrato').select('id').eq('propiedad_id', id).eq('estado', 'vigente'));
        if (vig.length) throw new Error('Este inmueble tiene un contrato vigente. Rescindilo primero.');
        await datos.actualizar('propiedad', id, { activo: false });
        avisar('Inmueble dado de baja.');
        dialogo.cerrar(); ficha.cerrar();
        await traer();
      },
    });
  }

  G.registrarModulo('inmuebles', {
    titulo: 'Inmuebles',
    textoNuevo: 'Nuevo inmueble',
    cargar,
    nuevo: () => abrir(null),
    abrir,
  });
})();
