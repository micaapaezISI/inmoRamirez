'use strict';

/* =====================================================================
   Gestión — capa compartida
   InmoGestion portado al panel de Inmobiliaria Ramirez, sobre Supabase.
   Reglas que se respetan igual que en InmoGestion:
     * Montos SIEMPRE en centavos, enteros.
     * Español rioplatense, voseo. Los errores dicen qué corregir.
   ===================================================================== */

const sb = window.supabaseClient;

/* ------------------------------ Formato ------------------------------ */

const fmt = {
  dinero(centavos, moneda = 'ARS') {
    if (centavos === null || centavos === undefined || centavos === '') return '';
    const simbolo = moneda === 'USD' ? 'US$' : '$';
    return simbolo + ' ' + (centavos / 100).toLocaleString('es-AR', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  },
  pesos(centavos) {
    if (centavos === null || centavos === undefined || centavos === '') return '';
    return (centavos / 100).toLocaleString('es-AR', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  },
  // Delega en js/num-parse.js (mismo parseo que usa el sitio público, para
  // no tener dos lugares con la misma lógica y el riesgo de que se
  // desincronicen). Acepta formato argentino ("1.234.567,89").
  aCentavos(valor) {
    const numero = parseArMoney(valor);
    return numero === null ? null : Math.round(numero * 100);
  },
  // Porcentajes: nunca llevan separador de miles (ver js/num-parse.js).
  aPorcentaje(valor) {
    return parseArPercent(valor);
  },
  // Índices/tasas: pueden superar los miles y llevar varios decimales,
  // pero no se redondean a centavos como el dinero.
  aIndice(valor) {
    return parseArIndex(valor);
  },
  porcentaje(valor) {
    if (valor === null || valor === undefined || valor === '') return '';
    return Number(valor).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  },
  indice(valor) {
    if (valor === null || valor === undefined || valor === '') return '';
    return Number(valor).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  },
  titulo(texto) {
    if (!texto) return '';
    return texto.charAt(0).toUpperCase() + texto.slice(1).replace(/_/g, ' ');
  },
  // El servidor guarda fechas ISO 'AAAA-MM-DD'. Para mostrar se pasa a
  // día-mes-año; los <input type="date"> siguen recibiendo el ISO.
  fecha(iso) {
    if (!iso) return '';
    const [anio, mes, dia] = String(iso).slice(0, 10).split('-');
    if (!anio || !mes || !dia) return iso;
    return `${dia}-${mes}-${anio}`;
  },
  periodo(p) {
    if (!p) return '';
    const [anio, mes] = String(p).split('-');
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${meses[Number(mes) - 1] || mes}/${anio}`;
  },
};

function esc(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function periodoActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Suma meses a una fecha ISO y devuelve ISO. Ajusta el día si el mes
// destino tiene menos días (31 ene + 1 mes -> 28/29 feb).
function sumarMeses(iso, meses) {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  const base = new Date(a, m - 1 + meses, 1);
  const ultimoDia = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  base.setDate(Math.min(d, ultimoDia));
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
}

function diasEntre(isoA, isoB) {
  const a = new Date(isoA.slice(0, 10) + 'T00:00:00');
  const b = new Date(isoB.slice(0, 10) + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

/* ---------------------------- Avisos --------------------------------- */

let temporizadorAviso;
function avisar(mensaje, tipo = 'ok') {
  clearTimeout(temporizadorAviso);
  document.querySelectorAll('.notificacion').forEach((n) => n.remove());
  const nodo = document.createElement('div');
  nodo.className = 'notificacion' + (tipo === 'error' ? ' notificacion--error' : '');
  nodo.setAttribute('role', 'status');
  nodo.textContent = mensaje;
  document.body.appendChild(nodo);
  temporizadorAviso = setTimeout(() => nodo.remove(), tipo === 'error' ? 8000 : 3500);
}

// Traduce el error de Supabase/Postgres a algo legible. Los RAISE de las
// funciones RPC ya vienen en español rioplatense desde 03_funciones.sql.
function mensajeError(error) {
  if (!error) return 'Algo salió mal.';
  if (typeof error === 'string') return error;
  if (error instanceof ErrorValidacion) {
    // Si es un solo campo, decir cuál en vez del genérico "revisá los datos".
    return error.errores && error.errores.length === 1 ? error.errores[0].mensaje : error.message;
  }
  const m = error.message || error.error_description || error.hint || '';
  if (!m) return 'Algo salió mal. Probá de nuevo.';
  if (m.includes('duplicate key') || m.includes('llave duplicada')) return 'Ya existe un registro con esos datos.';
  if (m.includes('violates foreign key')) return 'No se puede: hay datos que dependen de este registro.';
  if (m.includes('JWT') || m.includes('not authenticated')) return 'Se cerró la sesión. Volvé a entrar.';
  // Los mensajes de RAISE de plpgsql llegan como "... - <mensaje real>"
  const partes = m.split(/ - |: /);
  return partes[partes.length - 1] || m;
}

/* ---------------------------- Datos ---------------------------------- */

const datos = {
  // Lectura simple de una tabla/vista con filtros encadenables.
  tabla(nombre) { return sb.from(nombre); },

  async lista(query) {
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async uno(query) {
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data;
  },

  async crear(tabla, fila) {
    const { data, error } = await sb.from(tabla).insert(fila).select().single();
    if (error) throw error;
    return data;
  },

  async actualizar(tabla, id, cambios) {
    const { data, error } = await sb.from(tabla).update(cambios).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // Toda operación multi-tabla vive en una función Postgres (RPC):
  // Supabase no tiene transacciones del lado del cliente.
  async rpc(nombre, args) {
    const { data, error } = await sb.rpc(nombre, args || {});
    if (error) throw error;
    return data;
  },
};

/* -------------------------- Config global --------------------------- */

const config = {
  valores: {},
  async cargar() {
    try {
      const filas = await datos.lista(datos.tabla('config').select('clave, valor'));
      this.valores = Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
    } catch (_e) { this.valores = {}; }
  },
  numero(clave, porDefecto) {
    const v = Number(this.valores[clave]);
    return Number.isFinite(v) ? v : porDefecto;
  },
  texto(clave, porDefecto = '') {
    return this.valores[clave] || porDefecto;
  },
};

/* --------------------------- Ficha lateral -------------------------- */

const ficha = {
  _onGuardar: null,
  abrir({ titulo, cuerpo, pestanias, guardar, textoGuardar = 'Guardar', extra = '', angosta = false }) {
    document.getElementById('ficha').classList.toggle('ficha--angosta', !!angosta);
    document.getElementById('ficha-titulo').textContent = titulo;
    document.getElementById('ficha-cuerpo').innerHTML = cuerpo;

    const tabsEl = document.getElementById('ficha-pestanias');
    if (pestanias && pestanias.length) {
      tabsEl.style.display = '';
      tabsEl.innerHTML = pestanias.map((p, i) =>
        `<button class="ficha__pestania" data-panel="${p.id}" aria-selected="${i === 0}">${esc(p.titulo)}</button>`).join('');
      tabsEl.querySelectorAll('.ficha__pestania').forEach((b) => {
        b.addEventListener('click', () => this.irAPanel(b.dataset.panel));
      });
    } else {
      tabsEl.style.display = 'none';
      tabsEl.innerHTML = '';
    }

    const pie = document.getElementById('ficha-pie');
    pie.innerHTML = `${extra}<span class="separador"></span>
      <button class="boton" id="ficha-cancelar">Cerrar</button>
      ${guardar ? `<button class="boton boton--principal" id="ficha-guardar">${esc(textoGuardar)}</button>` : ''}`;
    pie.querySelector('#ficha-cancelar').addEventListener('click', () => this.cerrar());
    this._onGuardar = guardar || null;
    if (guardar) pie.querySelector('#ficha-guardar').addEventListener('click', () => this._guardar());

    document.getElementById('velo').dataset.abierto = '1';
    document.getElementById('ficha').dataset.abierto = '1';
    const primero = document.querySelector('#ficha-cuerpo input, #ficha-cuerpo select, #ficha-cuerpo textarea');
    if (primero) setTimeout(() => primero.focus(), 30);
  },
  async _guardar() {
    const btn = document.getElementById('ficha-guardar');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
    try {
      await this._onGuardar();
    } catch (e) {
      avisar(mensajeError(e), 'error');
    } finally {
      if (btn) { btn.disabled = false; }
    }
  },
  irAPanel(id) {
    document.querySelectorAll('#ficha-pestanias .ficha__pestania').forEach((b) => {
      b.setAttribute('aria-selected', b.dataset.panel === id);
    });
    document.querySelectorAll('#ficha-cuerpo .panel').forEach((p) => {
      p.dataset.activo = p.dataset.panel === id ? '1' : '0';
    });
  },
  cerrar() {
    document.getElementById('velo').dataset.abierto = '0';
    document.getElementById('ficha').dataset.abierto = '0';
    document.getElementById('ficha-cuerpo').innerHTML = '';
    this._onGuardar = null;
  },
  abierta() { return document.getElementById('ficha').dataset.abierto === '1'; },
};

/* ------------------------ Diálogo chico ----------------------------- */

const dialogo = {
  _onConfirmar: null,
  abrir({ titulo, cuerpo, confirmar, textoConfirmar = 'Confirmar', peligro = false }) {
    document.getElementById('dialogo-titulo').textContent = titulo;
    document.getElementById('dialogo-cuerpo').innerHTML = cuerpo;
    const pie = document.getElementById('dialogo-pie');
    pie.innerHTML = `<span class="separador"></span>
      <button class="boton" id="dialogo-cancelar">Cancelar</button>
      <button class="boton ${peligro ? 'boton--peligro' : 'boton--principal'}" id="dialogo-confirmar">${esc(textoConfirmar)}</button>`;
    pie.querySelector('#dialogo-cancelar').addEventListener('click', () => this.cerrar());
    this._onConfirmar = confirmar;
    pie.querySelector('#dialogo-confirmar').addEventListener('click', () => this._confirmar());
    document.getElementById('velo-dialogo').dataset.abierto = '1';
    document.getElementById('dialogo').dataset.abierto = '1';
    const primero = document.querySelector('#dialogo-cuerpo input, #dialogo-cuerpo select, #dialogo-cuerpo textarea');
    if (primero) setTimeout(() => primero.focus(), 30);
  },
  async _confirmar() {
    const btn = document.getElementById('dialogo-confirmar');
    btn.disabled = true; btn.textContent = 'Un momento…';
    try {
      await this._onConfirmar();
    } catch (e) {
      avisar(mensajeError(e), 'error');
      btn.disabled = false; btn.textContent = 'Confirmar';
    }
  },
  cerrar() {
    document.getElementById('velo-dialogo').dataset.abierto = '0';
    document.getElementById('dialogo').dataset.abierto = '0';
    document.getElementById('dialogo-cuerpo').innerHTML = '';
    this._onConfirmar = null;
  },
};

/* --------------------------- Componentes ---------------------------- */

// Arma una grilla densa (mismo look que InmoGestion). `cols` es una
// lista de { th, campo|render, clase }. `filas` los datos. `onAbrir(id)`
// se llama con doble clic / Enter.
function grilla(cols, filas, { onAbrir, idCampo = 'id', filaAttrs } = {}) {
  if (!filas.length) {
    return `<div class="vacio"><strong>No hay nada para mostrar todavía.</strong>
      Cargá el primero con el botón de arriba.</div>`;
  }
  const thead = cols.map((c) => `<th class="${c.clase || ''}">${esc(c.th)}</th>`).join('');
  const tbody = filas.map((f) => {
    const celdas = cols.map((c) => {
      const val = c.render ? c.render(f) : esc(f[c.campo]);
      return `<td class="${c.clase || ''}">${val}</td>`;
    }).join('');
    const extra = filaAttrs ? filaAttrs(f) : '';
    return `<tr data-id="${esc(f[idCampo])}" tabindex="0" ${extra}>${celdas}</tr>`;
  }).join('');
  const html = `<div class="grilla-envoltorio"><table class="grilla">
    <thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`;
  // El binding de eventos lo hace quien llama, sobre el contenedor.
  setTimeout(() => {
    const cont = document.querySelector('#vistas .vista:not([style*="none"]) tbody')
      || document.querySelector('#ficha-cuerpo tbody');
    if (!cont || !onAbrir) return;
    cont.addEventListener('dblclick', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (tr) onAbrir(tr.dataset.id);
    });
    cont.addEventListener('keydown', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      if (e.key === 'Enter') onAbrir(tr.dataset.id);
      if (e.key === 'ArrowDown' && tr.nextElementSibling) { e.preventDefault(); tr.nextElementSibling.focus(); }
      if (e.key === 'ArrowUp' && tr.previousElementSibling) { e.preventDefault(); tr.previousElementSibling.focus(); }
    });
  }, 0);
  return html;
}

function pastilla(valor) {
  return `<span class="pastilla pastilla--${esc(valor)}">${esc(fmt.titulo(valor))}</span>`;
}

// Campo de formulario. tipo: text|number|date|select|textarea|dinero|porcentaje|indice|checkbox
// dinero/porcentaje/indice son <input type="text" inputmode="decimal"> a
// propósito: un <input type="number"> nativo solo admite un separador
// decimal y descarta el punto de miles en silencio si alguien escribe
// "1.500.000" — ver js/num-parse.js.
function campo(nombre, etiqueta, opciones = {}) {
  const {
    tipo = 'text', valor = '', requerido = false, ancho = 1, ayuda = '',
    opts = [], min, step, placeholder = '',
  } = opciones;
  const id = 'f-' + nombre;
  const req = requerido ? 'required' : '';
  const anchoClase = ancho === 4 ? ' campo--ancho-4' : ancho === 2 ? ' campo--ancho-2' : '';
  let control;
  if (tipo === 'select') {
    control = `<select id="${id}" name="${nombre}" ${req}>${opts.map((o) => {
      const [v, t] = Array.isArray(o) ? o : [o, fmt.titulo(o)];
      return `<option value="${esc(v)}" ${String(v) === String(valor) ? 'selected' : ''}>${esc(t)}</option>`;
    }).join('')}</select>`;
  } else if (tipo === 'textarea') {
    control = `<textarea id="${id}" name="${nombre}" ${req} placeholder="${esc(placeholder)}">${esc(valor)}</textarea>`;
  } else if (tipo === 'checkbox') {
    return `<label class="campo casilla${anchoClase}"><input type="checkbox" id="${id}" name="${nombre}" ${valor ? 'checked' : ''}> ${esc(etiqueta)}</label>`;
  } else if (tipo === 'dinero') {
    const mostrado = (valor === '' || valor === null || valor === undefined) ? '' : fmt.pesos(valor);
    control = `<input type="text" inputmode="decimal" id="${id}" name="${nombre}" data-dinero="1" value="${esc(mostrado)}" ${req} placeholder="${esc(placeholder || '0,00')}">`;
  } else if (tipo === 'porcentaje') {
    const mostrado = (valor === '' || valor === null || valor === undefined) ? '' : fmt.porcentaje(valor);
    control = `<input type="text" inputmode="decimal" id="${id}" name="${nombre}" data-porcentaje="1" value="${esc(mostrado)}" ${req} placeholder="${esc(placeholder || 'Ej: 12,5')}">`;
  } else if (tipo === 'indice') {
    const mostrado = (valor === '' || valor === null || valor === undefined) ? '' : fmt.indice(valor);
    control = `<input type="text" inputmode="decimal" id="${id}" name="${nombre}" data-indice="1" value="${esc(mostrado)}" ${req} placeholder="${esc(placeholder || 'Ej: 4.521,8734')}">`;
  } else {
    const attrs = [
      tipo === 'number' && min !== undefined ? `min="${min}"` : '',
      tipo === 'number' && step !== undefined ? `step="${step}"` : '',
      placeholder ? `placeholder="${esc(placeholder)}"` : '',
    ].join(' ');
    control = `<input type="${tipo}" id="${id}" name="${nombre}" value="${esc(valor)}" ${req} ${attrs}>`;
  }
  return `<div class="campo${anchoClase}" data-campo="${nombre}">
    <label for="${id}">${esc(etiqueta)}${requerido ? ' *' : ''}</label>
    ${control}
    ${ayuda ? `<span class="campo__ayuda">${esc(ayuda)}</span>` : ''}
    <span class="campo__error" style="display:none;"></span>
  </div>`;
}

// Lee un <form> (o contenedor con inputs con name). Los campos
// data-dinero/data-porcentaje/data-indice="1" se parsean en formato
// argentino (js/num-parse.js). Si alguno tiene texto que no se puede
// convertir a un número válido, NO se guarda en silencio: se marca el
// campo en rojo y se corta el guardado con ErrorValidacion (lo atrapa el
// try/catch que ya envuelve a ficha._guardar()/dialogo._confirmar()).
function leerFormulario(contenedor) {
  const out = {};
  const errores = [];
  const EJEMPLOS = { dinero: '150.000', porcentaje: '12,5', indice: '4.521,8734' };
  contenedor.querySelectorAll('[name]').forEach((el) => {
    const n = el.name;
    const bruto = el.value;
    let tipoNumerico = null;
    if (el.dataset.dinero === '1') tipoNumerico = 'dinero';
    else if (el.dataset.porcentaje === '1') tipoNumerico = 'porcentaje';
    else if (el.dataset.indice === '1') tipoNumerico = 'indice';

    if (el.type === 'checkbox') {
      out[n] = el.checked;
    } else if (tipoNumerico) {
      const parseado = tipoNumerico === 'dinero' ? fmt.aCentavos(bruto)
        : tipoNumerico === 'porcentaje' ? fmt.aPorcentaje(bruto)
        : fmt.aIndice(bruto);
      if (parseado === null && bruto.trim() !== '') {
        errores.push({ campo: n, mensaje: `Ese valor no es válido, escribilo así: ${EJEMPLOS[tipoNumerico]}` });
      }
      out[n] = parseado;
    } else if (el.type === 'number') {
      out[n] = el.value === '' ? null : Number(el.value);
    } else {
      out[n] = el.value.trim() === '' ? null : el.value.trim();
    }
  });
  if (errores.length) {
    marcarErrores(contenedor, errores);
    throw new ErrorValidacion(errores);
  }
  return out;
}

function marcarErrores(contenedor, errores) {
  contenedor.querySelectorAll('.campo').forEach((c) => {
    c.classList.remove('campo--error');
    const e = c.querySelector('.campo__error');
    if (e) { e.style.display = 'none'; e.textContent = ''; }
  });
  (errores || []).forEach(({ campo: nombre, mensaje }) => {
    const c = contenedor.querySelector(`.campo[data-campo="${nombre}"]`);
    if (!c) { avisar(mensaje, 'error'); return; }
    c.classList.add('campo--error');
    const e = c.querySelector('.campo__error');
    if (e) { e.textContent = mensaje; e.style.display = 'block'; }
  });
}

/* --------------------- Validaciones (de utils/validar.js) ----------- */

const V = {
  telefonoValido(t) { const n = String(t).replace(/\D/g, ''); return n.length >= 6 && n.length <= 15; },
  emailValido(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e)); },
  documentoValido(doc, tipo) {
    const n = String(doc).replace(/\D/g, '');
    if (tipo === 'CUIT' || tipo === 'CUIL') return n.length === 11;
    if (tipo === 'PAS') return String(doc).trim().length >= 5 && String(doc).trim().length <= 15;
    return n.length >= 6 && n.length <= 9;
  },
};

class ErrorValidacion extends Error {
  constructor(errores) { super('Revisá los datos marcados.'); this.errores = errores; }
}

/* ------------------------ Registro de módulos ---------------------- */

const modulos = {};
function registrarModulo(nombre, obj) { modulos[nombre] = obj; }

// listo para que app.js lo use
window.Gestion = {
  sb, fmt, esc, avisar, mensajeError, hoyISO, periodoActual,
  sumarMeses, diasEntre, datos, config, ficha, dialogo, grilla, pastilla,
  campo, leerFormulario, marcarErrores, V, ErrorValidacion, modulos, registrarModulo,
};
