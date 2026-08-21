/* =====================================================================
   INMOBILIARIA RAMIREZ — Calculadora de actualización de alquileres
   ---------------------------------------------------------------------
   VERSIÓN DEMO / SIMPLIFICADA.
   Los porcentajes anuales de referencia de abajo son valores de EJEMPLO
   para que la herramienta funcione y se pueda mostrar en el sitio.
   Para un cálculo real hay que conectar esto a una fuente de datos
   oficial (por ejemplo la API de series del BCRA para ICL, o el IPC
   que publica el INDEC) y traer el índice acumulado del período real
   en vez de este valor fijo estimado.
   ===================================================================== */

const INDEX_REFERENCE = {
  icl: { label: "ICL (Índice para Contratos de Locación)", annualRate: 1.05 }, // 105% anual, valor de ejemplo
  ipc: { label: "IPC (Índice de Precios al Consumidor)", annualRate: 1.15 }, // 115% anual, valor de ejemplo
  fijo: { label: "Porcentaje fijo definido por contrato", annualRate: null },
};

function calcAdjustedRent({ amount, indexKey, months, fixedAnnualPct }) {
  let annualRate;
  if (indexKey === "fijo") {
    annualRate = (fixedAnnualPct || 0) / 100;
  } else {
    annualRate = INDEX_REFERENCE[indexKey].annualRate;
  }

  const periodFactor = Math.pow(1 + annualRate, months / 12) - 1;
  const increase = amount * periodFactor;
  const newAmount = amount + increase;

  return {
    percent: periodFactor * 100,
    increase,
    newAmount,
  };
}

function initCalculator() {
  const form = document.getElementById("calc-form");
  if (!form) return;

  const fixedField = document.getElementById("calc-fixed-wrap");
  const indexSelect = document.getElementById("calc-index");

  function toggleFixedField() {
    if (!fixedField) return;
    fixedField.style.display = indexSelect.value === "fijo" ? "flex" : "none";
  }

  indexSelect.addEventListener("change", toggleFixedField);
  toggleFixedField();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const amount = parseFloat(data.get("amount")) || 0;
    const indexKey = data.get("index");
    const months = parseInt(data.get("frequency"), 10) || 12;
    const fixedAnnualPct = parseFloat(data.get("fixedPct")) || 0;

    const result = calcAdjustedRent({ amount, indexKey, months, fixedAnnualPct });

    document.getElementById("calc-out-percent").textContent = `${result.percent.toFixed(2)}%`;
    document.getElementById("calc-out-increase").textContent = result.increase.toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    });
    document.getElementById("calc-out-new").textContent = result.newAmount.toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    });

    document.getElementById("calc-result-empty").style.display = "none";
    document.getElementById("calc-result-filled").style.display = "block";
  });
}

document.addEventListener("DOMContentLoaded", initCalculator);
