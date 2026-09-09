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

  async function generarContrato(contratoId) {
    const jsPDFctor = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDFctor) { avisar('No se pudo cargar el generador de PDF.', 'error'); return; }

    const c = await datos.uno(datos.tabla('contrato').select('*').eq('id', contratoId));
    if (!c) { avisar('No existe ese contrato.', 'error'); return; }
    const [prop, inq, garantes, clausulas, props] = await Promise.all([
      datos.uno(datos.tabla('propiedad').select('*').eq('id', c.propiedad_id)),
      datos.uno(datos.tabla('persona').select('*').eq('id', c.inquilino_id)),
      datos.lista(datos.tabla('contrato_garante').select('*, persona(nombre, documento_tipo, documento)').eq('contrato_id', contratoId)),
      datos.lista(datos.tabla('contrato_clausula').select('*').eq('contrato_id', contratoId).order('orden')),
      datos.lista(datos.tabla('propiedad_propietario').select('*, persona(nombre, documento_tipo, documento)').eq('propiedad_id', c.propiedad_id)),
    ]);

    const doc = new jsPDFctor({ unit: 'mm', format: 'a4' });
    const M = 20, ANCHO = 170;
    let y = 22;
    const p = (txt, opts = {}) => {
      doc.setFont(undefined, opts.bold ? 'bold' : 'normal');
      doc.setFontSize(opts.size || 10);
      const lineas = doc.splitTextToSize(txt, ANCHO);
      for (const l of lineas) {
        if (y > 275) { doc.addPage(); y = 22; }
        doc.text(l, M, y); y += (opts.size || 10) * 0.5;
      }
      y += opts.gap ?? 2;
    };

    const dir = [prop.calle, prop.numero, prop.piso && `piso ${prop.piso}`, prop.departamento && `depto ${prop.departamento}`].filter(Boolean).join(' ');
    const dueños = props.map((x) => `${x.persona.nombre} (${x.persona.documento_tipo} ${x.persona.documento || 's/d'})`).join(', ');

    p('CONTRATO DE LOCACIÓN', { bold: true, size: 14, gap: 4 });
    p(`En ${prop.localidad || config.texto('localidad_default')}, a los ${fmt.fecha(c.fecha_inicio)}, entre ${dueños || 'EL LOCADOR'}, en adelante EL LOCADOR, y ${inq.nombre} (${inq.documento_tipo} ${inq.documento || 's/d'})${inq.domicilio ? `, domiciliado en ${inq.domicilio}` : ''}, en adelante EL LOCATARIO, se conviene:`, { gap: 4 });

    p('PRIMERA — Objeto.', { bold: true });
    p(`EL LOCADOR da en locación a EL LOCATARIO el inmueble sito en ${dir}${prop.barrio ? `, barrio ${prop.barrio}` : ''}, ${prop.localidad || ''}, con destino ${c.tipo_contrato === 'comercial' ? 'comercial' : 'de vivienda'}.`, { gap: 4 });

    p('SEGUNDA — Plazo.', { bold: true });
    p(`La locación se pacta por el período comprendido entre el ${fmt.fecha(c.fecha_inicio)} y el ${fmt.fecha(c.fecha_fin)}.`, { gap: 4 });

    p('TERCERA — Precio.', { bold: true });
    p(`El precio mensual es de ${fmt.dinero(c.monto_inicial, c.moneda)}, pagadero por adelantado del 1 al ${c.dia_vencimiento} de cada mes.`, { gap: 2 });
    if (c.ajuste_tipo === 'porcentaje') p(`El precio se ajustará cada ${c.ajuste_meses} meses en un ${c.ajuste_valor}% sobre el valor vigente.`, { gap: 4 });
    else if (c.ajuste_tipo === 'indice') p(`El precio se ajustará cada ${c.ajuste_meses} meses según el índice ${c.indice_codigo} publicado por el organismo correspondiente, tomando como base el valor a la fecha de inicio.`, { gap: 4 });
    else p('El precio se mantendrá sin ajuste durante toda la vigencia.', { gap: 4 });

    if (c.deposito) { p('CUARTA — Depósito en garantía.', { bold: true }); p(`EL LOCATARIO entrega en este acto la suma de ${fmt.dinero(c.deposito, c.moneda)} en concepto de depósito en garantía, que le será reintegrada al finalizar la locación, previa verificación del estado del inmueble y cancelación de deudas.`, { gap: 4 }); }

    if (garantes.length) {
      p('QUINTA — Garantía.', { bold: true });
      p(`Garantizan el cumplimiento de las obligaciones de EL LOCATARIO: ${garantes.map((g) => `${g.persona.nombre} (${g.persona.documento_tipo} ${g.persona.documento || 's/d'}) — garantía ${g.tipo_garantia.replace('_', ' ')}`).join('; ')}.`, { gap: 4 });
    }

    clausulas.forEach((cl, i) => { p(`${['SEXTA', 'SÉPTIMA', 'OCTAVA', 'NOVENA', 'DÉCIMA'][i] || `CLÁUSULA ${i + 6}`} — ${cl.titulo}.`, { bold: true }); p(cl.texto, { gap: 4 }); });

    if (c.notas) { p('OBSERVACIONES.', { bold: true }); p(c.notas, { gap: 4 }); }

    y += 20;
    if (y > 250) { doc.addPage(); y = 40; }
    doc.setFontSize(10);
    doc.text('______________________', M, y); doc.text('______________________', 120, y);
    doc.text('EL LOCADOR', M, y + 5); doc.text('EL LOCATARIO', 120, y + 5);

    doc.setFontSize(8); doc.setTextColor(120);
    doc.text('Documento generado desde InmoGestion como borrador. Revisar con un profesional antes de firmar.', 105, 288, { align: 'center' });

    const url = URL.createObjectURL(doc.output('blob'));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  G.pdf = { generarRecibo, generarContrato };
})();
