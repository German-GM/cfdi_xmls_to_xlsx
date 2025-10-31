'use strict';

const { initDB, getAllCFDIs, getCFDIsChunk, getCFDIsWithFilters, getTotalCFDIs, closeDB } = require('./db');
const CrearXLSX = require('./crear_xlsx');
const { procesarSustituciones } = require('./procesar_sustituciones');
const { DEBUG, TAMANO_BLOQUE_EXPORTACION } = require('./constants');

/**
 * Exporta los CFDIs desde la base de datos a XLSX
 * @param {Object} filtros - Filtros opcionales (fechaInicio, fechaFin, tipoComprobante, rfcReceptor, moneda)
 */
async function exportarDesdeDB(filtros = {}) {
  console.log('\n========================================');
  console.log('Exportando desde base de datos...');
  console.log('========================================\n');

  const inicio = Date.now();

  try {
    // Inicializar BD (sin limpiar)
    initDB(false);

    const totalCFDIs = getTotalCFDIs();

    if (totalCFDIs === 0) {
      console.log('No se encontraron CFDIs para exportar.');
      closeDB();
      return;
    }

    console.log(`Total de CFDIs en BD: ${totalCFDIs}`);

    // Si hay pocos CFDIs (menos de 50k), usar método tradicional
    if (totalCFDIs < 50000) {
      console.log('Usando exportación directa (pocos registros)...\n');
      await exportarDirecto(filtros, inicio);
    } else {
      // Si hay muchos CFDIs, procesar por bloques
      console.log(`Usando exportación por bloques (${TAMANO_BLOQUE_EXPORTACION} registros por bloque)...\n`);
      await exportarPorBloques(totalCFDIs, inicio);
    }

    closeDB();

  } catch (error) {
    console.error('\n❌ Error en la exportación:', error);
    closeDB();
    throw error;
  }
}

/**
 * Exportación directa (para pocos registros)
 */
async function exportarDirecto(filtros, inicio) {
  let cfdis;
  if (Object.keys(filtros).length > 0) {
    console.log('Aplicando filtros:', filtros);
    cfdis = getCFDIsWithFilters(filtros);
  } else {
    cfdis = getAllCFDIs('moneda ASC, folio ASC');
  }

  console.log(`Exportando ${cfdis.length} CFDIs...\n`);

  // Procesar sustituciones antes de exportar
  cfdis = procesarSustituciones(cfdis);

  await new Promise((resolve, reject) => {
    try {
      CrearXLSX(cfdis, {}, (filePath) => {
        const tiempo = ((Date.now() - inicio) / 1000).toFixed(2);

        console.log('\n========================================');
        console.log('EXPORTACIÓN COMPLETADA');
        console.log('========================================');
        console.log(`Archivo generado: ${filePath}`);
        console.log(`CFDIs exportados: ${cfdis.length}`);
        console.log(`Tiempo: ${tiempo}s`);
        console.log('========================================\n');

        resolve(filePath);
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Exportación por bloques (para muchos registros)
 */
async function exportarPorBloques(totalCFDIs, inicio) {
  const bloqueSize = TAMANO_BLOQUE_EXPORTACION;
  const totalBloques = Math.ceil(totalCFDIs / bloqueSize);

  console.log(`Procesando ${totalBloques} bloques...\n`);

  let todosCFDIs = [];

  for (let i = 0; i < totalBloques; i++) {
    const offset = i * bloqueSize;
    console.log(`[Bloque ${i + 1}/${totalBloques}] Cargando registros ${offset + 1} a ${Math.min(offset + bloqueSize, totalCFDIs)}...`);

    const bloque = getCFDIsChunk(bloqueSize, offset);
    todosCFDIs = todosCFDIs.concat(bloque);

    // Liberar memoria cada ciertos bloques
    if (i > 0 && i % 10 === 0 && global.gc) {
      global.gc();
    }
  }

  console.log(`\nGenerando archivo XLSX con ${todosCFDIs.length} registros...\n`);

  // Procesar sustituciones antes de exportar
  todosCFDIs = procesarSustituciones(todosCFDIs);

  await new Promise((resolve, reject) => {
    try {
      CrearXLSX(todosCFDIs, {}, (filePath) => {
        const tiempo = ((Date.now() - inicio) / 1000).toFixed(2);

        console.log('\n========================================');
        console.log('EXPORTACIÓN COMPLETADA');
        console.log('========================================');
        console.log(`Archivo generado: ${filePath}`);
        console.log(`CFDIs exportados: ${todosCFDIs.length}`);
        console.log(`Tiempo: ${tiempo}s`);
        console.log('========================================\n');

        resolve(filePath);
      });
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  exportarDesdeDB
};
