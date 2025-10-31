'use strict';

const fs         = require('fs');
const xml2json   = require('xml2json');
const CrearXLSX  = require('./crear_xlsx');
const { tryGet, leerXMLs, parseCfdiJSON } = require('./utils');
const { DEBUG, CARPETA_RAIZ } = require('./constants');

fs.mkdirSync('./test_output', { recursive: true });
fs.mkdirSync(CARPETA_RAIZ, { recursive: true });

function parseXMLsToXLSX(body = {}) {
  DEBUG && console.log('Iniciando proceso...');

  return Promise.resolve(body)
    .then(readXMLs)
    .then(xmlsToJson)
    .then(exportToExcel)
    .then(() => { 
      return { allOk: true };
    })
    .catch((error) => {
      console.warn(error);
      return { allOk: false };
    });
}

async function readXMLs(body) {
  DEBUG && console.log('Leyendo XMLs...');
  body.xmls = await leerXMLs(CARPETA_RAIZ);

  if (body.xmls.length == 0) {
    return Promise.reject('No se encontraron XMLs');
  }

  return body;
}

function xmlsToJson(body) {
  DEBUG && console.log('Convirtiendo XMLs a JSON...');
  let comprobantes = body.xmls
    .map(xml => {
      const cfdi = tryGet(() => xml2json.toJson(xml.contenido, { object: true })['cfdi:Comprobante']);
      return cfdi;
    })
    .filter(cfdi => {
      return cfdi;
    });
  
  const retenciones = body.xmls
    .map(xml => {
      const retencion = tryGet(() => xml2json.toJson(xml.contenido, { object: true })['retenciones:Retenciones']);
      return retencion;
    })
    .filter(retencion => {
      return retencion;
    });

  const otros = body.xmls
    .map(xml => {
      const cfdi = tryGet(() => xml2json.toJson(xml.contenido, { object: true })['cfdi:Comprobante']);
      const retencion = tryGet(() => xml2json.toJson(xml.contenido, { object: true })['retenciones:Retenciones']);

      if (cfdi || retencion) {
        return null;
      }

      return xml.ruta;
    })
    .filter(otro => {
      return otro;
    });

  otros.forEach((otro, i) => {
    console.log(otro);
  });

  DEBUG && console.log(`Se leyeron ${body.xmls.length} XMLs`);
  DEBUG && console.log(`${comprobantes.length} comprobantes.`);
  DEBUG && console.log(`${retenciones.length} retenciones.`);
  DEBUG && console.log(`${otros.length} XMLs no identificados.`);
  DEBUG && console.log(`${comprobantes.length + retenciones.length} comprobantes + retenciones.`);
  DEBUG && fs.writeFileSync(`./test_output/cfdis_json.json`, JSON.stringify(comprobantes.slice(0, 100), null, 2));
  
  comprobantes = comprobantes
    .map(cfdi => parseCfdiJSON(cfdi));
  
  DEBUG && fs.writeFileSync(`./test_output/cfdis_json_parsed.json`, JSON.stringify(comprobantes.slice(0, 100), null, 2));
  body.comprobantes = comprobantes;
  return body;
}

function exportToExcel(body, req, res) {
  DEBUG && console.log('Exportando a XLSX...');
  const cfdisData = body.comprobantes;
  const additionalData = {};
  
  CrearXLSX(cfdisData, additionalData, file => {
    DEBUG && console.log('Archivo generado:', file);
  });
}

// Solo para pruebas al requerir ciertos datos de otras fuentes
function parseJSONData() {
  const Moment = require('moment');
  const jsonData = require('./data.json');

  const jason = jsonData.map(json => {
    return {
      ...json,
      Fecha: Moment(json.Fecha).format('DD-MMM-YYYY hh:mm:ss a'),
    }
  })
  .sort((a, b) => Moment(a.Fecha).diff(Moment(b.Fecha)));

  fs.writeFileSync(`./parsed_json_data.json`, JSON.stringify(jason, null, 2));
}

parseXMLsToXLSX();
