'use strict';

/* =====================================================================
   Gestión — Personas (propietarios, inquilinos, garantes, compradores)
   Portado de src/routes/personas.js + public/js/personas.js
   ===================================================================== */

(function () {
  const G = window.Gestion;
  const { datos, esc, fmt, avisar, ficha, dialogo, grilla, campo, leerFormulario, marcarErrores, V, ErrorValidacion, config } = G;

  const vista = document.getElementById('vista-personas');
  const estado = { filas: [], filtro: '', filtroRol: '' };

  const IVA = [
    ['consumidor_final', 'Consumidor final'],
    ['responsable_inscripto', 'Responsable inscripto'],
    ['monotributista', 'Monotributista'],
    ['exento', 'Exento'],
    ['no_categorizado', 'No categorizado'],
  ];
  const DOCS = ['DNI', 'CUIT', 'CUIL', 'LE', 'LC', 'PAS'];
  const CAMPOS = ['tipo_persona', 'nombre', 'documento_tipo', 'documento', 'telefono',
    'telefono_alt', 'email', 'domicilio', 'localidad', 'provincia', 'fecha_nacimiento',
    'ocupacion', 'cbu', 'banco', 'condicion_iva', 'notas'];

  function roles(p) {
    const r = [];
    if (p.es_propietario) r.push('propietario');
    if (p.es_inquilino) r.push('inquilino');
    if (p.es_garante) r.push('garante');
    return r;
  }

  async function cargar() {
    vista.innerHTML = `
      <div class="filtros">
        <input type="search" id="fp-busqueda" placeholder="Buscar por nombre o documento" value="${esc(estado.filtro)}">
        <span class="filtros__separador"></span>
        <select id="fp-rol">
          <option value="">Todo rol</option>
          <option value="propietario">Propietario</option>
          <option value="inquilino">Inquilino</option>
          <option value="garante">Garante</option>
        </select>
        <span class="filtros__separador"></span>
        <button class="boton" id="fp-limpiar">Limpiar</button>
      </div>
      <div id="personas-grilla"></div>`;

    const fp = vista.querySelector('#fp-busqueda');
    let t;
    fp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { estado.filtro = fp.value.trim(); dibujar(); }, 250); });
    vista.querySelector('#fp-rol').value = estado.filtroRol;
    vista.querySelector('#fp-rol').addEventListener('change', (e) => { estado.filtroRol = e.target.value; dibujar(); });
    vista.querySelector('#fp-limpiar').addEventListener('click', () => {
      estado.filtro = ''; estado.filtroRol = '';
      fp.value = ''; vista.querySelector('#fp-rol').value = '';
      dibujar();
    });

    await traer();
  }

  async function traer() {
    // Rol = en qué rincones del sistema aparece la persona. No hay columna
    // "rol": se calcula cruzando propietarios, inquilinos y garantes.
    const [personas, propietarios, inquilinos, garantes] = await Promise.all([
      datos.lista(datos.tabla('persona').select('id, nombre, documento_tipo, documento, telefono, email, localidad, tipo_persona').eq('activo', true).order('nombre')),
      datos.lista(datos.tabla('propiedad_propietario').select('persona_id')),
      datos.lista(datos.tabla('contrato').select('inquilino_id')),
      datos.lista(datos.tabla('contrato_garante').select('persona_id')),
    ]);
    const setProp = new Set(propietarios.map((r) => r.persona_id));
    const setInq = new Set(inquilinos.map((r) => r.inquilino_id));
    const setGar = new Set(garantes.map((r) => r.persona_id));
    estado.filas = personas.map((p) => ({
      ...p,
      es_propietario: setProp.has(p.id),
      es_inquilino: setInq.has(p.id),
      es_garante: setGar.has(p.id),
    }));
    dibujar();
  }

  function dibujar() {
    const q = estado.filtro.toLowerCase();
    let filas = estado.filas.filter((p) =>
      !q || (p.nombre || '').toLowerCase().includes(q) || (p.documento || '').toLowerCase().includes(q));
    if (estado.filtroRol) filas = filas.filter((p) => roles(p).includes(estado.filtroRol));

    document.getElementById('barra-contador').textContent = `${filas.length} persona${filas.length === 1 ? '' : 's'}`;

    const cont = document.getElementById('personas-grilla');
    cont.innerHTML = grilla([
      { th: 'Nombre', campo: 'nombre', render: (p) => `<strong>${esc(p.nombre)}</strong>` },
      { th: 'Documento', clase: 'col-corto', render: (p) => p.documento ? `${esc(p.documento_tipo)} ${esc(p.documento)}` : '<span class="tenue">—</span>' },
      { th: 'Teléfono', clase: 'col-corto', render: (p) => esc(p.telefono) || '<span class="tenue">—</span>' },
      { th: 'Localidad', clase: 'col-corto', render: (p) => esc(p.localidad) || '<span class="tenue">—</span>' },
      { th: 'Roles', render: (p) => `<span class="pastillas">${roles(p).map((r) => `<span class="pastilla pastilla--${r}">${fmt.titulo(r)}</span>`).join('') || '<span class="tenue">—</span>'}</span>` },
    ], filas, { onAbrir: (id) => abrir(Number(id)) });

    const tb = cont.querySelector('tbody');
    if (tb) tb.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      cont.querySelectorAll('tr[aria-selected="true"]').forEach((x) => x.setAttribute('aria-selected', 'false'));
      tr.setAttribute('aria-selected', 'true');
    });
  }

  function formulario(p) {
    p = p || {};
    return `<form id="persona-form">
      <fieldset><legend>Identificación</legend>
        <div class="rejilla">
          ${campo('tipo_persona', 'Tipo', { tipo: 'select', opts: [['fisica', 'Persona física'], ['juridica', 'Persona jurídica']], valor: p.tipo_persona || 'fisica' })}
          ${campo('nombre', 'Nombre o razón social', { valor: p.nombre, requerido: true, ancho: 2 })}
          ${campo('documento_tipo', 'Tipo doc.', { tipo: 'select', opts: DOCS, valor: p.documento_tipo || 'DNI' })}
          ${campo('documento', 'Número', { valor: p.documento })}
          ${campo('fecha_nacimiento', 'Nacimiento', { tipo: 'date', valor: p.fecha_nacimiento })}
          ${campo('ocupacion', 'Ocupación', { valor: p.ocupacion })}
          ${campo('condicion_iva', 'Condición IVA', { tipo: 'select', opts: IVA, valor: p.condicion_iva || 'consumidor_final', ancho: 2 })}
        </div>
      </fieldset>
      <fieldset><legend>Contacto</legend>
        <div class="rejilla">
          ${campo('telefono', 'Teléfono', { valor: p.telefono })}
          ${campo('telefono_alt', 'Teléfono alternativo', { valor: p.telefono_alt })}
          ${campo('email', 'Email', { tipo: 'email', valor: p.email, ancho: 2 })}
          ${campo('domicilio', 'Domicilio', { valor: p.domicilio, ancho: 2 })}
          ${campo('localidad', 'Localidad', { valor: p.localidad || config.texto('localidad_default') })}
          ${campo('provincia', 'Provincia', { valor: p.provincia || config.texto('provincia_default') })}
        </div>
      </fieldset>
      <fieldset><legend>Datos bancarios (para liquidar)</legend>
        <div class="rejilla">
          ${campo('cbu', 'CBU / CVU', { valor: p.cbu, ancho: 2 })}
          ${campo('banco', 'Banco', { valor: p.banco, ancho: 2 })}
        </div>
      </fieldset>
      <fieldset><legend>Notas</legend>
        <div class="rejilla">${campo('notas', 'Notas internas', { tipo: 'textarea', valor: p.notas, ancho: 4 })}</div>
      </fieldset>
    </form>`;
  }

  function normalizar(form) {
    const b = leerFormulario(form);
    const errores = [];
    if (!b.nombre) errores.push({ campo: 'nombre', mensaje: 'Escribí el nombre o razón social.' });
    if (b.documento && !V.documentoValido(b.documento, b.documento_tipo)) {
      errores.push({ campo: 'documento', mensaje: `Ese ${b.documento_tipo} no parece válido.` });
    }
    if (b.telefono && !V.telefonoValido(b.telefono)) errores.push({ campo: 'telefono', mensaje: 'Ese teléfono no parece válido (entre 6 y 15 números).' });
    if (b.telefono_alt && !V.telefonoValido(b.telefono_alt)) errores.push({ campo: 'telefono_alt', mensaje: 'Ese teléfono no parece válido.' });
    if (b.email && !V.emailValido(b.email)) errores.push({ campo: 'email', mensaje: 'Ese email no parece válido — revisá la arroba y el dominio.' });
    if (errores.length) throw new ErrorValidacion(errores);
    const out = {};
    CAMPOS.forEach((c) => { out[c] = b[c] === undefined ? null : b[c]; });
    return out;
  }

  async function abrir(id) {
    let p = null;
    if (id) p = await datos.uno(datos.tabla('persona').select('*').eq('id', id));
    ficha.abrir({
      titulo: id ? esc(p.nombre) : 'Nueva persona',
      cuerpo: formulario(p),
      textoGuardar: id ? 'Guardar cambios' : 'Crear persona',
      extra: id ? `<button class="boton boton--peligro" id="persona-baja">Dar de baja</button>` : '',
      guardar: async () => {
        const form = document.getElementById('persona-form');
        let datosPersona;
        try { datosPersona = normalizar(form); }
        catch (e) { if (e.errores) { marcarErrores(form, e.errores); return; } throw e; }
        if (id) {
          await datos.actualizar('persona', id, { ...datosPersona, actualizado_en: new Date().toISOString() });
          avisar('Persona actualizada.');
        } else {
          await datos.crear('persona', datosPersona);
          avisar('Persona creada.');
        }
        ficha.cerrar();
        await traer();
      },
    });
    if (id) {
      document.getElementById('persona-baja').addEventListener('click', () => baja(id, p.nombre));
    }
  }

  function baja(id, nombre) {
    dialogo.abrir({
      titulo: 'Dar de baja',
      cuerpo: `<p>Se va a dar de baja a <strong>${esc(nombre)}</strong>. No se borra: queda fuera de los listados pero sus contratos y recibos siguen intactos.</p>
        <p class="campo__ayuda">No se puede si tiene un contrato vigente (como inquilina, garante o propietaria).</p>`,
      textoConfirmar: 'Dar de baja', peligro: true,
      confirmar: async () => {
        // Chequeo de contrato vigente (mismo criterio que src/routes/personas.js)
        const vig = await datos.lista(datos.tabla('contrato').select('id, inquilino_id, propiedad_id').eq('estado', 'vigente'));
        const propsConVig = new Set(vig.map((c) => c.propiedad_id));
        const esInquilino = vig.some((c) => c.inquilino_id === id);
        const garante = await datos.lista(datos.tabla('contrato_garante').select('contrato_id').eq('persona_id', id));
        const esGaranteVig = garante.some((g) => vig.some((c) => c.id === g.contrato_id));
        const props = await datos.lista(datos.tabla('propiedad_propietario').select('propiedad_id').eq('persona_id', id));
        const esPropVig = props.some((pp) => propsConVig.has(pp.propiedad_id));
        if (esInquilino || esGaranteVig || esPropVig) {
          throw new Error('Esta persona tiene un contrato vigente. Rescindilo antes de darla de baja.');
        }
        await datos.actualizar('persona', id, { activo: false });
        avisar('Persona dada de baja.');
        dialogo.cerrar();
        ficha.cerrar();
        await traer();
      },
    });
  }

  G.registrarModulo('personas', {
    titulo: 'Personas',
    textoNuevo: 'Nueva persona',
    cargar,
    nuevo: () => abrir(null),
    abrir,
  });
})();
