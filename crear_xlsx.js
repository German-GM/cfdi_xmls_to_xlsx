/**
 * Exporta la función CrearXLSX
 * @author Jonathan
 */
'use strict';

const Excel4node = require('excel4node');
const Moment     = require('moment');
const { tryGet } = require('./utils');
const { OUTPUT_FILE_PATH } = require('./constants');

const widths = { s: 6, m: 17, l: 44, $: 16 };
const Col = (title, type, style, getValue, center) => ({ title, type, style, getValue, center });

const summaryFields = [
  'SubTotal',
  'IEPS',
  'IVA',
  'ISH',
  'Trasl. locales',
  'ISR Ret.',
  'IVA Ret.',
  'Imp. Cedular',
  'Imp. RTP',
  'Imp. al Millar',
  'Ret. locales',
  'Deducciones',
  'Retenciones',
  'Neto pagado',
  'Total',
  'Saldo',
];

const [ 
  subtotal, 
  ieps, 
  iva, 
  ish, 
  trasLocales,
  isrRet, 
  ivaRet, 
  impCedular, 
  impRTP, 
  impAlMillar, 
  retLocales,
  deducciones, 
  retenciones, 
  netoPagado,
  total, 
  saldo, 
] = summaryFields;

// let additionalColsAdded = false;
let adminColsAdded      = false;
let estadoTitleIndex    = -1;

const columns = [
  Col('Tipo',            'string', 's', cfdi => cfdi.TipoDeComprobante, true),
  Col('Serie',           'string', 'm', cfdi => cfdi.Serie, true),
  Col('Folio',           'number', 's', cfdi => cfdi.Folio, true),
  Col('Folio fiscal',    'string', 'l', cfdi => cfdi.UUID),
  Col('Fecha',           'string', 'm', cfdi => Moment(cfdi.Fecha).format('DD/MM/YYYY'), true), // date
  Col('Lugar de exp.',   'number', 'm', cfdi => cfdi.Emisor.domicilio.cp, true),
  Col('RFC Receptor',    'string', 'm', cfdi => cfdi.Receptor.Rfc, true),
  Col('Nombre Receptor', 'string', 'l', cfdi => cfdi.Receptor.Nombre),
  Col('Forma de pago',   'string', 'm', cfdi => cfdi.FormaPago, true), // findInPayment('Forma'),
  Col('Método de pago',  'string', 'm', cfdi => cfdi.MetodoPago, true),
  Col('Moneda',          'string', 'm', cfdi => cfdi.Moneda, true),
  // Col('Tipo de cambio',  'number', '$', cfdi => cfdi.TipoCambio),
  Col(subtotal,          'number', '$', cfdi => cfdi.SubTotal),
  Col(ieps,              'number', '$', findTax('Traslados',   'IEPS')), // findInSummary('IEPS', true))
  Col(iva,               'number', '$', findTax('Traslados',   'IVA')), // findInSummary('IVA', true))
  Col(ish,               'number', '$', findTax('Traslados',   'ISH')), // findInSummary('ISH', true))
  Col(trasLocales,       'number', '$', cfdi => cfdi.TotalTrasladosLocales),
  Col(isrRet,            'number', '$', findTax('Retenciones', 'ISR')), // findInSummary('ISR Ret'))
  Col(ivaRet,            'number', '$', findTax('Retenciones', 'IVA')), // findInSummary('IVA Ret'))
  Col(impCedular,        'number', '$', findTax('Retenciones', 'IC' )), // findInSummary('Cedular'))
  Col(impRTP,            'number', '$', findTax('Retenciones', 'RTP')), // findInSummary(''))
  Col(impAlMillar,       'number', '$', findTax('Retenciones', 'IAM')), // findInSummary(''))
  Col(retLocales,        'number', '$', cfdi => cfdi.TotalRetencionesLocales),
  Col(deducciones,       'number', '$', cfdi => cfdi.totales.deducciones.TotalOtrasDeducciones),
  Col(retenciones,       'number', '$', cfdi => cfdi.totales.deducciones.TotalImpuestosRetenidos),
  // Col(netoPagado,        'number', '$', cfdi => cfdi.netoPagar),
  Col(total,             'number', '$', cfdi => cfdi.Total),
  // Col(saldo,             'number', '$', cfdi => {
  //   if (cfdi.MetodoPago != 'PPD' || !cfdi.credito)
  //     return null;
  //   if (cfdi.credito.pagado)
  //     return 0;
  //   return cfdi.credito.saldo;
  // }),
  // Col('Estado',          'string', 'm', cfdi => cfdi.status == 'CANCELADO' ? 'Cancelado' : 'Vigente', true),
  Col('Tipo de relación', 'string', 'm', cfdi => cfdi.TipoRelacion, true),
  Col('Folio fiscal rel.', 'string', 'l', cfdi => cfdi.UUIDRelacion, false),
];

/**
 * Crea un archivo para Excel con los datos de los CFDIs
 * @param {Object[]} dataList - CFDIs
 * @param {Object} additionalData - isAdmin, cfdiNames, fileName
 * @param {Function(string)} callback - Recibe cómo parámetro el nombre del archivo
 */
function CrearXLSX(dataList, additionalData, callback) {
  // const { isAdmin, cfdiNames, fileName } = additionalData;

  // Agregar las columnas Timbres y Plan hasta el final para los administradores
  // if (isAdmin && !adminColsAdded) {
  //   const timbresData = (cfdi) => {
  //     return cfdi.status == 'CANCELADO' && cfdi.compraInfo
  //       ? 0 : tryGet(() => cfdi.compraInfo.cantidadTimbres);
  //   }

  //   const planData = (cfdi) => {
  //     const paqueteTipo  = tryGet(() => cfdi.compraInfo.paqueteTipo);
  //     const accion       = tryGet(() => cfdi.compraInfo.accion);
  //     const accionSuffix = accion ? `(${accion})` : '';

  //     return paqueteTipo ? `${paqueteTipo} ${accionSuffix}` : null;
  //   }

  //   columns.push(Col('Timbres', 'number', 'm', timbresData, true));
  //   columns.push(Col('Plan', 'string', 'm', planData));
  //   adminColsAdded = true;
  // }

  // Agregar el Tipo de Comprobante como 2da columna desde aqui, ya que se necesita la variable "cfdiNames"
  // if (!additionalColsAdded) {
  //   columns.splice(1, 0, Col('Comprobante', 'string', 'l', cfdi => tryGet(() => cfdiNames[cfdi.tipo], ''), false) );

  //   // const folioSustituido = cfdi => 
  //   //   tryGet(() => `
  //   //     Folio: ${cfdi.sustitucionCFDI.serie ? `${cfdi.sustitucionCFDI.serie} ` : ''}${cfdi.sustitucionCFDI.folio} (${Moment(cfdi.sustitucionCFDI.fechaOriginal).format('DD/MM/YYYY, HH:mm a')})
  //   //   `, '').trim();

  //   const folioSustituido = cfdi => tryGet(() => `${cfdi.sustitucionCFDI.serie ? `${cfdi.sustitucionCFDI.serie} ` : ''}${cfdi.sustitucionCFDI.folio}` );
  //   const fechaSustituida = cfdi => tryGet(() => `${Moment(cfdi.sustitucionCFDI.fechaOriginal).format('DD/MM/YYYY, HH:mm a')}` );

  //   columns.push(Col('Folio sustituido', 'string', 'm', folioSustituido, true));
  //   columns.push(Col('Fecha sustituida', 'string', 'l', fechaSustituida, true));

  //   additionalColsAdded = true;
  // }

  if (estadoTitleIndex == -1)
    estadoTitleIndex = columns.findIndex(col => col.title == 'Estado');

  const file        = OUTPUT_FILE_PATH;
  const book        = new Excel4node.Workbook();
  const sheet       = book.addWorksheet('Hoja 1');
  const styles      = createStyles(book);
  const visibleCols = [];
  const rows        = getRows(dataList, visibleCols);
  
  fillSheet(sheet, styles, visibleCols, rows);
  sheet.row(1).freeze();
  
  book.write(file, () => callback(file));
}

function fillSheet(sheet, styles, visibleCols, rows) {
  let indexCol = 1;

  // Variables para control de totales de los diferentes tipos de monedas
  const monedaColIndex = columns.findIndex(col => col.title == 'Moneda');
  let TotalesRowStart = 3;
  let subtotalColIndex = 0;
  let monedas = {
    EUR: { total: 0, existe: false },
    MXN: { total: 0, existe: false },
    USD: { total: 0, existe: false },
    COP: { total: 0, existe: false },
  };
  
  columns.forEach((column, i) => {
    if (!visibleCols[i]) 
      return;

    // Iniciar los totales de las monedas en 0 para cada columna
    Object.keys(monedas).forEach((key) => {
      monedas[key].total = 0;
    });
    
    let style = 'text';
    if (column.style == '$')
      style = 'currency';
    else if (column.center)
      style = 'textCenter'
      
    sheet
      .cell(1, indexCol)
      .string(column.title)
      .style(styles[style])
      .style(styles.bgBlack);
    
    sheet
      .column(indexCol)
      .setWidth(widths[column.style]);
      
    rows.forEach((row, j) => {
      let style = 'text';
      let value = row[i];
      let tipoMoneda = row[monedaColIndex];

      sheet
        .cell(j + 2, indexCol)
        .style(j % 2 ? styles.bgWhite : styles.bgGray)
        .style(styles.border);
      
      if (value == null)
        return;
      
      if (column.type == 'number')
        value = Number(String(value).replace(/\$|,|USD|€/g, ''));
        
      if (column.style == '$')
        style = 'currency';
      // else if (column.title == 'Fecha') {
      //   style = 'date';
      //   value = new Date(value);
      // }
      else if (column.center)
        style = 'textCenter'

      // Si el titulo de la columna corresponde a alguno en el arreglo "summaryFields"
      if (summaryFields.includes(column.title)) {
        const cfdiVigente = row[estadoTitleIndex] == 'Vigente';
        if (!subtotalColIndex) {
          /* Grabar el indice de la primera columna de la que se saca el total - 1, 
          para posicionar el texto de la fila que va antes de los totales */
          subtotalColIndex = indexCol - 1;
        }

        // Si el cfdi está cancelado, poner el valor en 0
        // if (!cfdiVigente) {
        //   value = 0;
        // }

        const printTotal = (rowOffset) => {
          monedas[tipoMoneda].total += value;
          sheet
            .cell(rows.length + rowOffset, indexCol)[column.type](monedas[tipoMoneda].total)
            .style(styles[style])
            .style(styles.border);

          if (!monedas[tipoMoneda].existe) {
            monedas[tipoMoneda].existe = true;
            sheet
              .cell(rows.length + rowOffset, subtotalColIndex)['string'](`Total ${tipoMoneda}`)
              .style(styles[style])
              .style(styles.border);
          }
        }

        // Sumar sus valores de fila en esa columna
        switch(tipoMoneda) {
          case 'EUR':
            printTotal(TotalesRowStart);
            break;
          case 'MXN':
            printTotal(TotalesRowStart + 1);
            break;
          case 'USD':
            printTotal(TotalesRowStart + 2);
            break;
          case 'COP':
            printTotal(TotalesRowStart + 3);
            break;
        }
      }

      // Dato de la fila con respecto a la columna actual
      sheet
        .cell(j + 2, indexCol)[column.type](value)
        .style(styles[style]);
    });
      
    indexCol++;
  });
}

function getRows(dataList, visibleCols) {
  return dataList
    .sort((a, b) => {
      if (a.Moneda > b.Moneda)  return 1;
      if (a.Moneda < b.Moneda)  return -1;
      if (a.Moneda == b.Moneda) return a.Folio - b.Folio;
    })
    .map(data => {
      const values = [];
      
      columns.forEach((column, i) => {
        values[i] = tryGet(() => column.getValue(data));

        if (!visibleCols[i] && values[i] != null)
          visibleCols[i] = true;
      });
      
      return values;
    });
}

function createStyles(book) {
  return {
    text: book.createStyle({
      alignment: { horizontal: 'left' },
      font:      { size:       14 },
    }),
    textCenter: book.createStyle({
      alignment: { horizontal: 'center' },
      font:      { size:       14 },
    }),
    currency: book.createStyle({
      alignment:    { horizontal: 'right' },
      font:         { size: 14 },
      numberFormat: '$ #,##0.00####'
    }),
    date: book.createStyle({
      alignment:    { horizontal: 'center' },
      font:         { size: 14 },
      numberFormat: 'dd/mm/yyyy'
    }),
    bgBlack: book.createStyle({
      fill: { fgColor: '#43525A', type: 'pattern', patternType: 'solid' },
      font: { color: '#FFFFFF', size: 14 }
    }),
    bgGray: book.createStyle({
      fill: { fgColor: '#F9F9F9', type: 'pattern', patternType: 'solid' },
    }),
    bgWhite: book.createStyle({
      fill: { fgColor: '#FFFFFF', type: 'pattern', patternType: 'solid' },
    }),
    border: book.createStyle({
      border: { 
        left:   { style: 'thin', color: '#CECECE' },
        right:  { style: 'thin', color: '#CECECE' },
        top:    { style: 'thin', color: '#CECECE' },
        bottom: { style: 'thin', color: '#CECECE' },
      }
    })
  };
}

function findTax(taxType, taxName) {
  return (cfdi) => {
    const conceptSum = cfdi.Conceptos.reduce((acc, concept) => {
      const impuesto = tryGet(() => concept.Impuestos[taxType][taxName].Importe, 0);
      return acc + impuesto;
    }, 0);
    
    return conceptSum || null;
  }
}

// function findInPDF(key, include, exactly) {
//   return (cfdi, pdfData) => {
//     const data = pdfData[key].find(data => (
//       exactly ? 
//         data[0] == include :
//         data[0].includes(include)
//     ));
//     return data ? data[1] : null;
//   }
// }

// function findInPayment(include) {
//   return findInPDF('payment', include);
// }

// function findInSummary(include, exactly) {
//   return findInPDF('summary', include, exactly);
// }

module.exports = CrearXLSX;