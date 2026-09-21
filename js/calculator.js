/* =====================================================================
   INMOBILIARIA RAMIREZ — Calculadora de actualización de alquileres
   ---------------------------------------------------------------------
   Conectada a la API pública de estadísticas del BCRA (api.bcra.gob.ar,
   sin key, CORS abierto). A partir de una fecha de inicio de contrato y
   una frecuencia de actualización, arma una tabla con todos los períodos
   ya transcurridos usando datos reales, y un período extra "aproximado"
   cuando la fecha de corte todavía no tiene valor publicado.

   Índices reales del BCRA usados:
     - ICL  (id 40): Índice para Contratos de Locación (serie diaria).
     - IPC  (id 27): Inflación mensual (% mensual, replica el IPC INDEC).
     - CER  (id 30): Coeficiente de Estabilización de Referencia (diaria).
     - UVA  (id 31): Unidad de Valor Adquisitivo (diaria).
     - UVI  (id 32): Unidad de Vivienda (diaria, créditos tipo Procrear).
   "Porcentaje fijo" no usa ninguna API: es el que carga la usuaria.
   ===================================================================== */

const BCRA_API_BASE = "https://api.bcra.gob.ar/estadisticas/v4.0/monetarias";

const CALC_INDEXES = {
  icl: { id: 40, name: "ICL", full: "ICL — Índice para Contratos de Locación", kind: "level" },
  ipc: { id: 27, name: "IPC", full: "IPC — Inflación mensual (BCRA)", kind: "monthly" },
  cer: { id: 30, name: "CER", full: "CER — Coeficiente de Estabilización de Referencia", kind: "level" },
  uva: { id: 31, name: "UVA", full: "UVA — Unidad de Valor Adquisitivo", kind: "level" },
  uvi: { id: 32, name: "UVI", full: "UVI — Unidad de Vivienda", kind: "level" },
};

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function monthsBetween(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function formatDateAR(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

async function fetchBcraSeries(variableId, desde, hasta) {
  const url = `${BCRA_API_BASE}/${variableId}?desde=${desde}&hasta=${hasta}`;
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("No se pudo conectar con la API del BCRA. Probá de nuevo en un momento.");
  }
  if (!res.ok) throw new Error("La API del BCRA no respondió correctamente. Probá de nuevo en un momento.");
  const json = await res.json();
  const detalle = (json.results && json.results[0] && json.results[0].detalle) || [];
  // La API devuelve el detalle de más reciente a más antiguo; lo damos vuelta.
  return detalle.slice().reverse();
}

function closestPoint(series, targetDate) {
  let best = null;
  let bestDiff = Infinity;
  for (const point of series) {
    const diff = Math.abs(new Date(point.fecha) - targetDate);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = point;
    }
  }
  return best;
}

// Proyecta el valor de una serie diaria (ICL/CER/UVA/UVI) más allá del
// último dato publicado, usando la tasa de variación diaria promedio de
// los últimos ~90 días como estimación — la misma idea que usa arquiler.com
// para marcar un período futuro como "Aproximado".
function projectLevel(series, targetDate) {
  const last = series[series.length - 1];
  const windowStart = new Date(last.fecha);
  windowStart.setDate(windowStart.getDate() - 90);
  const refPoint = closestPoint(series, windowStart) || series[0];
  const daysSpan = (new Date(last.fecha) - new Date(refPoint.fecha)) / 86400000;
  if (daysSpan <= 0) return last.valor;
  const dailyRate = Math.pow(last.valor / refPoint.valor, 1 / daysSpan) - 1;
  const daysAhead = (targetDate - new Date(last.fecha)) / 86400000;
  return last.valor * Math.pow(1 + dailyRate, daysAhead);
}

// Períodos para un índice "de nivel" (ICL/CER/UVA/UVI): se compara el
// valor de la serie en cada fecha de corte contra la anterior.
async function buildLevelPeriods(variableId, startDate, freq, today) {
  const elapsed = Math.max(0, Math.floor(monthsBetween(startDate, today) / freq));
  const desdeBuffer = new Date(startDate);
  desdeBuffer.setDate(desdeBuffer.getDate() - 8);

  const series = await fetchBcraSeries(variableId, toISODate(desdeBuffer), toISODate(today));
  if (series.length < 2) throw new Error("El BCRA todavía no publicó suficientes datos para ese período.");

  const periods = [];
  for (let k = 0; k <= elapsed; k++) {
    const cutoff = addMonths(startDate, k * freq);
    const point = closestPoint(series, cutoff);
    periods.push({
      k,
      fecha: point.fecha,
      valor: point.valor,
      pctVsPrev: k === 0 ? 0 : (point.valor / periods[k - 1].valor - 1) * 100,
      approx: false,
    });
  }

  const nextCutoff = addMonths(startDate, (elapsed + 1) * freq);
  const estValor = projectLevel(series, nextCutoff);
  periods.push({
    k: elapsed + 1,
    fecha: toISODate(nextCutoff),
    valor: estValor,
    pctVsPrev: (estValor / periods[elapsed].valor - 1) * 100,
    approx: true,
  });

  return periods;
}

// Períodos para IPC (serie mensual de % de inflación, no un nivel): se
// compone mes a mes dentro de cada período sobre un índice sintético que
// arranca en 100 en la fecha de inicio del contrato.
async function buildMonthlyPeriods(variableId, startDate, freq, today) {
  const elapsed = Math.max(0, Math.floor(monthsBetween(startDate, today) / freq));
  const desde = addMonths(startDate, -1);

  const series = await fetchBcraSeries(variableId, toISODate(desde), toISODate(today));
  if (series.length === 0) throw new Error("El BCRA todavía no publicó datos de inflación mensual para ese período.");

  const byMonth = new Map(series.map((p) => [p.fecha.slice(0, 7), p.valor]));
  const avgRecent = series.slice(-3).reduce((acc, p) => acc + p.valor, 0) / Math.min(3, series.length);

  const periods = [{ k: 0, fecha: toISODate(startDate), valor: 100, pctVsPrev: 0, approx: false }];
  let cursor = new Date(startDate);

  for (let k = 1; k <= elapsed; k++) {
    let factor = 1;
    for (let i = 0; i < freq; i++) {
      const monthly = byMonth.get(toISODate(cursor).slice(0, 7));
      factor *= 1 + (monthly != null ? monthly : avgRecent) / 100;
      cursor = addMonths(cursor, 1);
    }
    const valor = periods[k - 1].valor * factor;
    periods.push({ k, fecha: toISODate(addMonths(startDate, k * freq)), valor, pctVsPrev: (factor - 1) * 100, approx: false });
  }

  // Período siguiente: aproximado, completando con el promedio de los
  // últimos 3 meses publicados los meses que todavía no salieron.
  let factorNext = 1;
  let anyApprox = false;
  for (let i = 0; i < freq; i++) {
    const monthly = byMonth.get(toISODate(cursor).slice(0, 7));
    if (monthly == null) anyApprox = true;
    factorNext *= 1 + (monthly != null ? monthly : avgRecent) / 100;
    cursor = addMonths(cursor, 1);
  }
  const valorNext = periods[elapsed].valor * factorNext;
  periods.push({
    k: elapsed + 1,
    fecha: toISODate(addMonths(startDate, (elapsed + 1) * freq)),
    valor: valorNext,
    pctVsPrev: (factorNext - 1) * 100,
    approx: anyApprox || elapsed + 1 > 0,
  });

  return periods;
}

// Porcentaje fijo pactado: no depende de ninguna API, todos los períodos
// son exactos (nunca "aproximados").
function buildFixedPeriods(fixedAnnualPct, startDate, freq, today) {
  const elapsed = Math.max(0, Math.floor(monthsBetween(startDate, today) / freq));
  const periodFactor = Math.pow(1 + (fixedAnnualPct || 0) / 100, freq / 12);
  const periods = [{ k: 0, fecha: toISODate(startDate), valor: null, pctVsPrev: 0, approx: false }];
  for (let k = 1; k <= elapsed + 1; k++) {
    periods.push({
      k,
      fecha: toISODate(addMonths(startDate, k * freq)),
      valor: null,
      pctVsPrev: (periodFactor - 1) * 100,
      approx: false,
    });
  }
  return periods;
}

function attachAmounts(periods, initialAmount) {
  let monto = initialAmount;
  periods[0].monto = monto;
  for (let i = 1; i < periods.length; i++) {
    monto = monto * (1 + periods[i].pctVsPrev / 100);
    periods[i].monto = monto;
  }
  return periods;
}

async function computePeriods(indexKey, startDate, freq, today, fixedAnnualPct) {
  if (indexKey === "fijo") return buildFixedPeriods(fixedAnnualPct, startDate, freq, today);
  const cfg = CALC_INDEXES[indexKey];
  if (cfg.kind === "monthly") return buildMonthlyPeriods(cfg.id, startDate, freq, today);
  return buildLevelPeriods(cfg.id, startDate, freq, today);
}

function fmtCurrency(n) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

function fmtIndexValue(n) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n) {
  return `${n.toFixed(2)}%`;
}

function buildShareUrl(params) {
  const usp = new URLSearchParams();
  usp.set("amount", params.amount);
  usp.set("date", params.date);
  usp.set("months", params.months);
  usp.set("rate", params.rate);
  if (params.rate === "fijo") usp.set("fixedPct", params.fixedPct);
  const newPath = `${location.pathname}?${usp.toString()}`;
  history.replaceState(null, "", newPath);
  return `${location.origin}${newPath}`;
}

function initCalculator() {
  const form = document.getElementById("calc-form");
  if (!form) return;

  const freqGrid = document.getElementById("calc-freq-grid");
  const freqInput = document.getElementById("calc-frequency");
  const indexGrid = document.getElementById("calc-index-grid");
  const indexInput = document.getElementById("calc-index");
  const fixedField = document.getElementById("calc-fixed-wrap");
  const startInput = document.getElementById("calc-start");
  const amountInput = document.getElementById("calc-amount");
  const submitBtn = form.querySelector("button[type=submit]");

  const emptyBox = document.getElementById("calc-result-empty");
  const filledBox = document.getElementById("calc-result-filled");
  const errorBox = document.getElementById("calc-result-error");
  const sourceLine = document.getElementById("calc-out-source");
  const approxNote = document.getElementById("calc-approx-note");
  const tbody = document.getElementById("calc-period-tbody");
  const shareRow = document.getElementById("calc-share-row");
  const shareInput = document.getElementById("calc-share-url");
  const shareCopyBtn = document.getElementById("calc-share-copy");

  function selectChoice(grid, hiddenInput, value) {
    hiddenInput.value = value;
    grid.querySelectorAll(".calc-choice-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.value === String(value));
    });
  }

  freqGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".calc-choice-btn");
    if (!btn) return;
    selectChoice(freqGrid, freqInput, btn.dataset.value);
  });

  indexGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".calc-choice-btn");
    if (!btn) return;
    selectChoice(indexGrid, indexInput, btn.dataset.value);
    fixedField.style.display = btn.dataset.value === "fijo" ? "flex" : "none";
  });

  function showError(msg) {
    errorBox.textContent = `⚠️ ${msg}`;
    errorBox.style.display = "block";
    filledBox.style.display = "none";
    emptyBox.style.display = "none";
  }

  function renderPeriods(periods, indexKey) {
    tbody.innerHTML = "";
    periods.forEach((p) => {
      const tr = document.createElement("tr");
      const nombrePeriodo = p.k === 0 ? "Inicio" : `Período ${p.k}`;
      const valorTxt = p.valor == null ? "—" : fmtIndexValue(p.valor);
      const pctTxt = p.k === 0 ? "—" : fmtPct(p.pctVsPrev);
      const approxBadge = p.approx ? '<span class="calc-approx-badge">Aproximado</span>' : "";
      tr.innerHTML = `
        <td>${nombrePeriodo}${approxBadge}</td>
        <td>${formatDateAR(p.fecha)}</td>
        <td>${valorTxt}</td>
        <td>${pctTxt}</td>
        <td><strong>${fmtCurrency(p.monto)}</strong></td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function runCalculation({ amount, indexKey, freq, startDate, fixedAnnualPct }) {
    errorBox.style.display = "none";
    submitBtn.disabled = true;
    const originalBtnText = submitBtn.textContent;
    submitBtn.textContent = indexKey === "fijo" ? "Calculando…" : "Consultando al BCRA…";

    try {
      const today = new Date();
      const periods = attachAmounts(await computePeriods(indexKey, startDate, freq, today, fixedAnnualPct), amount);
      const last = periods[periods.length - 1];
      const lastKnown = periods[periods.length - (last.approx ? 2 : 1)];

      renderPeriods(periods, indexKey);

      if (last.approx) {
        approxNote.style.display = "block";
        approxNote.textContent = `⚠️ El valor del período "${formatDateAR(last.fecha)}" es aproximado: el BCRA todavía no publicó el dato correspondiente a esa fecha. Se estimó con la tendencia reciente — el valor final se sabrá cuando se publique.`;
      } else {
        approxNote.style.display = "none";
      }

      const cfg = CALC_INDEXES[indexKey];
      sourceLine.textContent = indexKey === "fijo"
        ? "Fuente: porcentaje fijo pactado (sin consulta a ninguna API)"
        : `Fuente: ${cfg.full} — BCRA · actualizado a ${formatDateAR(lastKnown.fecha)}`;

      const shareUrl = buildShareUrl({
        amount,
        date: toISODate(startDate).slice(0, 7),
        months: freq,
        rate: indexKey,
        fixedPct: fixedAnnualPct,
      });
      shareInput.value = shareUrl;
      shareRow.style.display = "flex";

      emptyBox.style.display = "none";
      filledBox.style.display = "block";
    } catch (err) {
      console.error(err);
      showError(err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const amount = parseArMoney(amountInput.value);
    if (amount === null) {
      showError("Ese monto no es válido, escribilo así: 150.000");
      return;
    }

    if (!startInput.value) {
      showError("Elegí la fecha de inicio del contrato.");
      return;
    }
    const startDate = new Date(`${startInput.value}-01T00:00:00`);
    if (startDate > new Date()) {
      showError("La fecha de inicio no puede ser futura.");
      return;
    }

    const indexKey = indexInput.value || "icl";
    const freq = parseInt(freqInput.value, 10) || 12;

    let fixedAnnualPct = 0;
    if (indexKey === "fijo") {
      fixedAnnualPct = parseArPercent(document.getElementById("calc-fixed").value);
      if (fixedAnnualPct === null) {
        showError("Ese porcentaje no es válido, escribilo así: 40 (o 40,5)");
        return;
      }
    }

    runCalculation({ amount, indexKey, freq, startDate, fixedAnnualPct });
  });

  if (shareCopyBtn) {
    shareCopyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(shareInput.value);
        const original = shareCopyBtn.textContent;
        shareCopyBtn.textContent = "¡Copiado!";
        setTimeout(() => (shareCopyBtn.textContent = original), 1600);
      } catch {
        shareInput.select();
      }
    });
  }

  // Precarga por defecto: frecuencia anual, índice ICL.
  selectChoice(freqGrid, freqInput, 12);
  selectChoice(indexGrid, indexInput, "icl");

  // Si la URL trae parámetros (link compartido), precargo y calculo solo.
  const qp = new URLSearchParams(location.search);
  if (qp.get("amount") && qp.get("date") && qp.get("months") && qp.get("rate")) {
    amountInput.value = qp.get("amount");
    startInput.value = qp.get("date");
    selectChoice(freqGrid, freqInput, qp.get("months"));
    selectChoice(indexGrid, indexInput, qp.get("rate"));
    if (qp.get("rate") === "fijo") {
      fixedField.style.display = "flex";
      const fixedInput = document.getElementById("calc-fixed");
      if (fixedInput && qp.get("fixedPct")) fixedInput.value = qp.get("fixedPct");
    }
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true }));
  }
}

document.addEventListener("DOMContentLoaded", initCalculator);
