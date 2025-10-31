'use strict';

const fs = require('fs').promises;
const path = require('path');
const xml2json = require('xml2json');
const { tryGet, parseCfdiJSON } = require('./utils');
const { initDB, insertCFDIsBatch, registrarInicioProceso, actualizarProgreso, finalizarProceso, closeDB, getTotalCFDIs, getEstadisticas } = require('./db');
const { DEBUG, CARPETA_RAIZ, TAMANO_BLOQUE } = require('./constants');

/**
 * Procesa todos los XMLs en bloques
 */
async function procesarXMLsEnBloques() {
  console.log('\n========================================');
  console.log('Iniciando procesamiento de XMLs...');
  console.log('========================================\n');

  const inicioTotal = Date.now();

  try {
    // Inicializar BD (limpiar si es necesario)
    const limpiarBD = process.env.NODE_ENV === 'production';
    initDB(limpiarBD);
    console.log(`Base de datos inicializada${limpiarBD ? ' (limpia)' : ''}\n`);

    // Obtener lista de todos los archivos XML recursivamente
    console.log('Escaneando archivos XML...');
    const archivosXML = await obtenerArchivosXMLRecursivo(CARPETA_RAIZ);

    if (archivosXML.length === 0) {
      console.log('No se encontraron archivos XML para procesar.');
      closeDB();
      return;
    }

    console.log(`Total de archivos XML encontrados: ${archivosXML.length}`);
    console.log(`Tamaño de bloque: ${TAMANO_BLOQUE} archivos\n`);

    // Registrar inicio del proceso
    const procesoId = registrarInicioProceso(archivosXML.length);

    // Contadores para clasificación de documentos
    const contadores = {
      comprobantes: 0,
      retenciones: 0,
      noIdentificados: 0,
      fallidos: 0
    };

    // Procesar en bloques
    const totalBloques = Math.ceil(archivosXML.length / TAMANO_BLOQUE);
    let archivosProcesados = 0;
    let archivosFallidos = 0;

    for (let i = 0; i < totalBloques; i++) {
      const bloqueInicio = i * TAMANO_BLOQUE;
      const bloqueFin = Math.min(bloqueInicio + TAMANO_BLOQUE, archivosXML.length);
      const bloqueArchivos = archivosXML.slice(bloqueInicio, bloqueFin);

      console.log(`[Bloque ${i + 1}/${totalBloques}] Procesando archivos ${bloqueInicio + 1} a ${bloqueFin}...`);

      const inicioBloque = Date.now();
      const resultado = await procesarBloque(bloqueArchivos);
      const tiempoBloque = ((Date.now() - inicioBloque) / 1000).toFixed(2);

      archivosProcesados += resultado.exitosos;
      archivosFallidos += resultado.fallidos;

      // Acumular contadores
      contadores.comprobantes += resultado.contadores.comprobantes;
      contadores.retenciones += resultado.contadores.retenciones;
      contadores.noIdentificados += resultado.contadores.noIdentificados;
      contadores.fallidos += resultado.fallidos;

      // Actualizar progreso en BD
      actualizarProgreso(procesoId, i + 1, archivosProcesados, archivosFallidos);
    }

    // Finalizar proceso
    finalizarProceso(procesoId, 'COMPLETADO');

    const tiempoTotal = ((Date.now() - inicioTotal) / 1000).toFixed(2);

    console.log('\n========================================');
    console.log('PROCESO COMPLETADO');
    console.log('========================================');

    // Mostrar recuento de tipos de documentos
    console.log('\nClasificación de documentos:');
    console.log(`  Se leyeron ${archivosXML.length} XMLs`);
    console.log(`  ${contadores.comprobantes} comprobantes.`);
    console.log(`  ${contadores.retenciones} retenciones.`);
    console.log(`  ${contadores.noIdentificados} XMLs no identificados.`);
    console.log(`  ${contadores.comprobantes + contadores.retenciones} comprobantes + retenciones.`);

    console.log('\nResultados del procesamiento:');
    console.log(`  Total procesados: ${archivosProcesados}`);
    console.log(`  Total fallidos: ${archivosFallidos}`);
    console.log(`  Tiempo total: ${tiempoTotal}s`);
    console.log(`  Velocidad: ${(archivosXML.length / tiempoTotal).toFixed(2)} archivos/segundo`);

    // Mostrar estadísticas
    const stats = getEstadisticas();
    console.log('\n========================================');
    console.log('ESTADÍSTICAS');
    console.log('========================================');
    console.log(`CFDIs en BD: ${stats.total}`);
    console.log(`Emisores únicos: ${stats.total_emisores}`);
    console.log(`Receptores únicos: ${stats.total_receptores}`);
    console.log(`Ingresos: ${stats.total_ingresos}`);
    console.log(`Egresos: ${stats.total_egresos}`);
    console.log(`Pagos: ${stats.total_pagos}`);
    console.log(`Nómina: ${stats.total_nomina}`);
    console.log(`Total MXN: $${stats.total_mxn?.toLocaleString('es-MX', { minimumFractionDigits: 2 }) || '0.00'}`);
    console.log(`Total USD: $${stats.total_usd?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}`);

    if (stats.fecha_minima && stats.fecha_maxima) {
      console.log(`Rango de fechas: ${new Date(stats.fecha_minima).toLocaleDateString()} - ${new Date(stats.fecha_maxima).toLocaleDateString()}`);
    }

    console.log('========================================\n');

    closeDB();
    return {
      total: archivosXML.length,
      exitosos: archivosProcesados,
      fallidos: archivosFallidos,
      tiempo: tiempoTotal
    };

  } catch (error) {
    console.error('\n❌ Error fatal en el procesamiento:', error);
    closeDB();
    throw error;
  }
}

/**
 * Obtiene recursivamente todos los archivos XML de una carpeta
 */
async function obtenerArchivosXMLRecursivo(carpetaRaiz) {
  const archivos = await fs.readdir(carpetaRaiz, {
    recursive: true,
    encoding: 'utf8'
  });

  const archivosXML = archivos
    .filter(archivo => archivo.toLowerCase().endsWith('.xml'))
    .map(archivo => ({
      rutaCompleta: path.join(carpetaRaiz, archivo),
      rutaRelativa: archivo
    }));

  return archivosXML;
}

/**
 * Procesa un bloque de archivos XML
 */
async function procesarBloque(bloqueArchivos) {
  let exitosos = 0;
  let fallidos = 0;

  const contadores = {
    comprobantes: 0,
    retenciones: 0,
    noIdentificados: 0
  };

  try {
    // Leer todos los XMLs del bloque en paralelo
    const xmlsLeidos = await Promise.all(
      bloqueArchivos.map(async archivo => {
        try {
          const contenido = await fs.readFile(archivo.rutaCompleta, 'utf8');
          return {
            ruta: archivo.rutaRelativa,
            contenido,
            exito: true
          };
        } catch (error) {
          DEBUG && console.warn(`  ⚠ Error leyendo ${archivo.rutaRelativa}:`, error.message);
          return {
            ruta: archivo.rutaRelativa,
            contenido: null,
            exito: false
          };
        }
      })
    );

    // Filtrar XMLs leídos exitosamente
    const xmlsValidos = xmlsLeidos.filter(xml => xml.exito);
    fallidos += xmlsLeidos.length - xmlsValidos.length;

    // Clasificar y parsear XMLs
    const cfdisParseados = [];

    for (const xml of xmlsValidos) {
      try {
        const jsonParsed = xml2json.toJson(xml.contenido, { object: true });

        // Verificar si es un comprobante
        const cfdiJSON = tryGet(() => jsonParsed['cfdi:Comprobante']);
        if (cfdiJSON) {
          contadores.comprobantes++;
          const cfdiParsed = parseCfdiJSON(cfdiJSON);
          cfdisParseados.push({
            cfdi: cfdiParsed,
            ruta: xml.ruta
          });
          continue;
        }

        // Verificar si es una retención
        const retencionJSON = tryGet(() => jsonParsed['retenciones:Retenciones']);
        if (retencionJSON) {
          contadores.retenciones++;
          // TODO: Implementar parseo de retenciones si es necesario
          // Por ahora solo las contamos
          DEBUG && console.warn(`  ℹ Retención encontrada en ${xml.ruta} (no procesada)`);
          continue;
        }

        // Si no es ni comprobante ni retención
        contadores.noIdentificados++;
        DEBUG && console.warn(`  ⚠ XML no identificado: ${xml.ruta}`);

      } catch (error) {
        DEBUG && console.warn(`  ⚠ Error parseando ${xml.ruta}:`, error.message);
        fallidos++;
      }
    }

    // Insertar en BD en una sola transacción (súper rápido)
    if (cfdisParseados.length > 0) {
      insertCFDIsBatch(cfdisParseados);
      exitosos = cfdisParseados.length;
    }

    return { exitosos, fallidos, contadores };

  } catch (error) {
    console.error('  ❌ Error procesando bloque:', error);
    return { exitosos, fallidos: bloqueArchivos.length - exitosos, contadores };
  }
}

module.exports = {
  procesarXMLsEnBloques,
  obtenerArchivosXMLRecursivo
};
