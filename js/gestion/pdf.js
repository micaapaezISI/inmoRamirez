'use strict';

/* =====================================================================
   Gestión — Recibos en PDF (client-side, jsPDF)
   Reemplaza src/recibos/pdf.js (pdfkit) de InmoGestion. Numeración
   interna correlativa, no fiscal. Reimprimible sin límite.
   ===================================================================== */

(function () {
  const G = window.Gestion;
  const { datos, fmt, avisar, config } = G;

  function linea(doc, y) { doc.setDrawColor(180); doc.line(18, y, 192, y); }

  async function generarRecibo(reciboId) {
    const jsPDFctor = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDFctor) { avisar('No se pudo cargar el generador de PDF.', 'error'); return; }

    const recibo = await datos.uno(datos.tabla('recibo').select('*').eq('id', reciboId));
    if (!recibo) { avisar('No existe ese recibo.', 'error'); return; }
    const persona = await datos.uno(datos.tabla('persona').select('nombre, documento_tipo, documento, domicilio').eq('id', recibo.persona_id));

    let detalle = [];
    if (recibo.tipo === 'inquilino') {
      const pagos = await datos.lista(datos.tabla('pago').select('id, monto, medio_pago, fecha_pago').eq('recibo_id', reciboId).eq('anulado', false));
      const imps = pagos.length
        ? await datos.lista(datos.tabla('pago_imputacion').select('concepto, monto, cuota(periodo)').in('pago_id', pagos.map((p) => p.id)))
        : [];
      detalle = imps.map((i) => ({ txt: `${fmt.titulo(i.concepto)} — período ${fmt.periodo(i.cuota?.periodo)}`, monto: i.monto }));
    } else {
      const ld = await datos.lista(datos.tabla('liquidacion_detalle').select('concepto, monto').eq('liquidacion_id',
        (await datos.uno(datos.tabla('liquidacion').select('id').eq('recibo_id', reciboId)))?.id || -1));
      detalle = ld.map((d) => ({ txt: d.concepto, monto: d.monto }));
    }

    const doc = new jsPDFctor({ unit: 'mm', format: 'a4' });
    const razon = config.texto('razon_social', 'Inmobiliaria Ramirez');
    let y = 20;

    doc.setFontSize(15); doc.setFont(undefined, 'bold');
    doc.text(razon, 18, y);
    doc.setFontSize(10); doc.setFont(undefined, 'normal');
    y += 6;
    const domic = config.texto('domicilio'); if (domic) { doc.text(domic, 18, y); y += 5; }
    const tel = config.texto('telefono'); if (tel) { doc.text('Tel: ' + tel, 18, y); y += 5; }
    const mat = config.texto('matricula'); if (mat) { doc.text('Matrícula: ' + mat, 18, y); y += 5; }

    doc.setFontSize(13); doc.setFont(undefined, 'bold');
    doc.text(`RECIBO Nº ${String(recibo.numero).padStart(6, '0')}  (${recibo.serie})`, 192, 20, { align: 'right' });
    doc.setFontSize(10); doc.setFont(undefined, 'normal');
    doc.text(`Fecha: ${fmt.fecha(recibo.fecha_emision)}`, 192, 26, { align: 'right' });
    doc.text(recibo.tipo === 'propietario' ? 'Pago a propietario' : 'Cobro a inquilino', 192, 31, { align: 'right' });
    if (recibo.anulado) { doc.setTextColor(200, 0, 0); doc.setFontSize(20); doc.text('ANULADO', 105, 60, { align: 'center', angle: 10 }); doc.setTextColor(0); doc.setFontSize(10); }

    y = Math.max(y, 45) + 6;
    linea(doc, y); y += 7;
    doc.setFont(undefined, 'bold');
    doc.text(recibo.tipo === 'propietario' ? 'Pagamos a:' : 'Recibimos de:', 18, y);
    doc.setFont(undefined, 'normal'); y += 6;
    doc.text(persona.nombre, 18, y); y += 5;
    if (persona.documento) { doc.text(`${persona.documento_tipo} ${persona.documento}`, 18, y); y += 5; }
    if (persona.domicilio) { doc.text(persona.domicilio, 18, y); y += 5; }

    y += 4; linea(doc, y); y += 8;
    doc.setFont(undefined, 'bold');
    doc.text('Concepto', 18, y); doc.text('Importe', 192, y, { align: 'right' });
    doc.setFont(undefined, 'normal'); y += 3; linea(doc, y); y += 6;
    detalle.forEach((d) => {
      doc.text(d.txt, 18, y);
      doc.text(fmt.dinero(Math.abs(d.monto)), 192, y, { align: 'right' });
      y += 6;
    });

    y += 2; linea(doc, y); y += 8;
    doc.setFontSize(12); doc.setFont(undefined, 'bold');
    doc.text('TOTAL', 18, y);
    doc.text(fmt.dinero(recibo.total), 192, y, { align: 'right' });

    y += 24;
    doc.setFontSize(10); doc.setFont(undefined, 'normal');
    doc.text('__________________________', 130, y);
    doc.text('Firma y aclaración', 145, y + 5);

    doc.setFontSize(8); doc.setTextColor(120);
    doc.text('Documento no válido como factura. Numeración interna correlativa.', 105, 285, { align: 'center' });

    const url = URL.createObjectURL(doc.output('blob'));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  G.pdf = { generarRecibo };
})();
