const fs = require('fs').promises;
const path = require('path');

const tryGet = (any, def) => {
  const isFn = typeof any == 'function'; 
  try {
    if (isFn) {
      const val = any();
      return val != undefined ? val : def;
    }
    
    let val = arguments[0];
    
    for (let i = 1; i < arguments.length; i++)
      val = val[arguments[i]];
    
    return val;
    
  } catch (e) {
    return isFn ? def : undefined;
  }
}
exports.tryGet = tryGet;

const tryGetArray = (fn) => {
  const result = tryGet(fn, []);
  return result instanceof Array ? result : [result];
};

const forceNumber = (any) => {
  return Number(any) || 0;
}

exports.leerXMLs = async (carpetaRaiz) => {
  const archivos = await fs.readdir(carpetaRaiz, {
    recursive: true,
    encoding: 'utf8'
  });

  const archivosXML = archivos
    .filter(archivo => archivo.endsWith('.xml'))
    .map(archivo => ({
      rutaCompleta: path.join(carpetaRaiz, archivo),
      rutaRelativa: archivo
    }));

  const xmlsEnMemoria = await Promise.all(
    archivosXML.map(async xml => ({
      ruta: xml.rutaRelativa,
      contenido: await fs.readFile(xml.rutaCompleta, 'utf8')
    }))
  );

  return xmlsEnMemoria;
}

exports.parseCfdiJSON = (cfdi) => {
  const complemento = cfdi['cfdi:Complemento'];
  const timbreFiscalDigital = complemento['tfd:TimbreFiscalDigital'];

  const comprobante = {
    CfdiVersion:       cfdi.Version,
    status:            'TIMBRADO',
    fechaImportacion:  Date.now(),
    UUID:              timbreFiscalDigital.UUID,
    NoCertificado:     cfdi.NoCertificado,
    Certificado:       cfdi.Certificado,
    TipoDeComprobante: cfdi.TipoDeComprobante,
    Fecha:             new Date(cfdi.Fecha).valueOf(),
    Serie:             cfdi.Serie || '',
    Folio:             cfdi.Folio || '',
    LugarExpedicion:   cfdi.LugarExpedicion,
    CondicionesDePago: cfdi.CondicionesDePago || '',
    FormaPago:         cfdi.FormaPago,
    MetodoPago:        cfdi.MetodoPago,
    Moneda:            cfdi.Moneda,
    TipoCambio:        forceNumber(cfdi.TipoCambio),
    SubTotal:          forceNumber(cfdi.SubTotal),
    Total:             forceNumber(cfdi.Total),
  }
  
  const emisor = cfdi['cfdi:Emisor'];
  comprobante.Emisor = {
    Nombre:        emisor.Nombre,
    Rfc:           emisor.Rfc,
    RegimenFiscal: emisor.RegimenFiscal,
    domicilio:     { cp: cfdi.LugarExpedicion }
  };
    
  const receptor = cfdi['cfdi:Receptor'];
  comprobante.Receptor = {
    // id:   '3adb421d-663b-463f-ac4d-3eb4706664a0',
    Nombre:  receptor.Nombre,
    Rfc:     receptor.Rfc,
    UsoCFDI: receptor.UsoCFDI,
    ...(receptor.RegimenFiscalReceptor && { RegimenFiscal: receptor.RegimenFiscalReceptor }),
    ...(receptor.DomicilioFiscalReceptor && { domicilio: { cp: receptor.DomicilioFiscalReceptor } })
  };

  const conceptos = tryGetArray(() => cfdi['cfdi:Conceptos']['cfdi:Concepto']);
  comprobante.Conceptos = conceptos.map(concepto => {
    const _concepto = {
      Cantidad:      forceNumber(concepto.Cantidad),
      ValorUnitario: forceNumber(concepto.ValorUnitario),
      ClaveProdServ: concepto.ClaveProdServ,
      Descripcion:   concepto.Descripcion,
      ClaveUnidad:   concepto.ClaveUnidad,
      Unidad:        concepto.Unidad || '',
      Importe:       forceNumber(concepto.Importe),
    };

    const impuestos = concepto['cfdi:Impuestos'];
    if (!impuestos)
      return conceptos;

    const traslados = tryGetArray(() => impuestos['cfdi:Traslados']['cfdi:Traslado']);
    const retenciones = tryGetArray(() => impuestos['cfdi:Retenciones']['cfdi:Retencion']);

    _concepto.Impuestos = {};
    if (traslados) _concepto.Impuestos.Traslados = {};
    if (retenciones) _concepto.Impuestos.Retenciones = {};

    traslados.forEach(traslado => {
      const tipoImpuesto = traslado.Impuesto == '002' ? 'IVA' : 'IEPS';
      
      _concepto.Impuestos.Traslados[tipoImpuesto] = {
        Importe: forceNumber(traslado.Importe),
        tasa:    forceNumber(traslado.TasaOCuota * 100),
      };
    });

    retenciones.forEach(retencion => {
      const tipoImpuesto = retencion.Impuesto == '002' ? 'IVA' : 'ISR';
      
      _concepto.Impuestos.Retenciones[tipoImpuesto] = {
        Importe: forceNumber(retencion.Importe),
        tasa:    forceNumber(retencion.TasaOCuota * 100),
      };
    });

    return _concepto;
  });

  if (comprobante.MetodoPago == 'PPD')
    comprobante.credito = {
      pagado: false,
      pagos:  [],
      saldo:  comprobante.Total,
    };

  const nomina = complemento['nomina12:Nomina'];
  if (nomina) {
    let enEspecie = 0;
    const perceptions = tryGetArray(() => nomina['nomina12:Percepciones']['nomina12:Percepcion']);
    const deductions = tryGetArray(() => nomina['nomina12:Deducciones']['nomina12:Deduccion']);
    const otherPayments = tryGetArray(() => nomina['nomina12:OtrosPagos']['nomina12:OtroPago']);

    const percepciones = {
      TotalSueldos: 0,
      TotalSeparacionIndemnizacion: 0,
      TotalJubilacionPensionRetiro: 0,
      TotalGravado: 0,
      TotalExento: 0,
    };
    
    const deducciones = {
      TotalOtrasDeducciones: 0,
      TotalImpuestosRetenidos: 0,
    };
    
    const otrosPagos = {
      TotalOtrosPagos: otherPayments.reduce((total, op) => total + forceNumber(op.Importe), 0),
    };
    
    perceptions.forEach(p => {
      percepciones.TotalExento += forceNumber(p.ImporteExento);
      percepciones.TotalGravado += forceNumber(p.ImporteGravado);
      
      if (['022', '023', '025'].includes(p.TipoPercepcion))
        percepciones.TotalSeparacionIndemnizacion += forceNumber(p.ImporteGravado) + forceNumber(p.ImporteExento);
      else if (['039', '044'].includes(p.TipoPercepcion))
        percepciones.TotalJubilacionPensionRetiro += forceNumber(p.ImporteGravado) + forceNumber(p.ImporteExento);
      else
        percepciones.TotalSueldos += forceNumber(p.ImporteGravado) + forceNumber(p.ImporteExento);
        
      if (p.especie)
        enEspecie += forceNumber(p.ImporteExento) + forceNumber(p.ImporteGravado);
    });
    
    deductions.forEach(d => {
      if (d.TipoDeduccion == '002')
        deducciones.TotalImpuestosRetenidos += forceNumber(d.Importe);
      else
        deducciones.TotalOtrasDeducciones += forceNumber(d.Importe);
    });
    
    const SubTotal  = percepciones.TotalExento + percepciones.TotalGravado + otrosPagos.TotalOtrosPagos;
    const Total     = SubTotal - deducciones.TotalImpuestosRetenidos - deducciones.TotalOtrasDeducciones;
    const netoPagar = Total - enEspecie;

    comprobante.Total = Total;
    comprobante.SubTotal = SubTotal;
    comprobante.netoPagar = netoPagar;
    comprobante.totales = {
      percepciones, 
      deducciones, 
      otrosPagos 
    }
  }

  const impLocal = complemento['implocal:ImpuestosLocales'];
  if (impLocal) {
    comprobante.TotalTrasladosLocales = impLocal.TotaldeTraslados;
    comprobante.TotalRetencionesLocales = impLocal.TotaldeRetenciones;
  }

  const pago10 = tryGet(() => complemento["pago10:Pagos"]["pago10:Pago"], null);
  const pago20 = tryGet(() => complemento["pago20:Pagos"]["pago20:Pago"], null);
  const esRecepcionDePago = pago10 || pago20;
  if (esRecepcionDePago) {
    if (pago10) {
      const pago10DoctoRel = tryGetArray(() => pago10["pago10:DoctoRelacionado"]);
      comprobante.Moneda = pago10DoctoRel[0].MonedaDR;
      comprobante.Total = pago10["Monto"];
    }

    if (pago20) {
      const pago20DoctoRel = tryGetArray(() => pago20["pago20:DoctoRelacionado"]);
      comprobante.Moneda = pago20DoctoRel[0].MonedaDR;
      comprobante.Total = pago20["Monto"];
    }
  }

  return comprobante;
}