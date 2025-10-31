'use strict';

const { getCFDIsConSustitucion, getCFDIsByUUIDs } = require('./db');
const { DEBUG } = require('./constants');

/**
 * Procesa las sustituciones de CFDIs
 * Agrega propiedades a los CFDIs sustituidos y a los que los sustituyen
 *
 * @param {Array} todosCFDIs - Array de todos los CFDIs a exportar
 * @returns {Array} Array de CFDIs con propiedades de sustitución agregadas
 */
function procesarSustituciones(todosCFDIs) {
  console.log('\nProcesando sustituciones de CFDIs...');

  // 1. Obtener CFDIs que tienen UUIDRelacion (los que sustituyen a otros)
  const cfdisConSustitucion = getCFDIsConSustitucion();

  if (cfdisConSustitucion.length === 0) {
    console.log('  No se encontraron CFDIs con sustitución.');
    return todosCFDIs;
  }

  console.log(`  Encontrados ${cfdisConSustitucion.length} CFDIs con UUIDRelacion`);

  // 2. Extraer todos los UUIDs únicos de las relaciones
  const uuidsRelacionados = new Set();

  cfdisConSustitucion.forEach(cfdi => {
    if (cfdi.UUIDRelacion) {
      // UUIDRelacion puede tener múltiples UUIDs separados por coma
      const uuids = cfdi.UUIDRelacion.split(',').map(u => u.trim());
      uuids.forEach(uuid => uuidsRelacionados.add(uuid));
    }
  });

  console.log(`  Buscando ${uuidsRelacionados.size} CFDIs originales...`);

  // 3. Obtener los CFDIs originales desde la BD
  const cfdisOriginales = getCFDIsByUUIDs([...uuidsRelacionados]);
  console.log(`  Encontrados ${cfdisOriginales.length} CFDIs originales`);

  // 4. Crear un mapa de UUID -> CFDI original para búsqueda rápida
  const mapaOriginales = new Map();
  cfdisOriginales.forEach(cfdi => {
    mapaOriginales.set(cfdi.UUID, cfdi);
  });

  // 5. Crear un mapa de UUID -> CFDI del dataset completo para actualización
  const mapaTodosCFDIs = new Map();
  todosCFDIs.forEach(cfdi => {
    mapaTodosCFDIs.set(cfdi.UUID, cfdi);
  });

  // 6. Procesar las sustituciones
  let sustitucionesEncontradas = 0;

  cfdisConSustitucion.forEach(cfdiSustituto => {
    if (!cfdiSustituto.UUIDRelacion) return;

    // Obtener los UUIDs relacionados
    const uuidsRelacionados = cfdiSustituto.UUIDRelacion.split(',').map(u => u.trim());

    uuidsRelacionados.forEach(uuidOriginal => {
      const cfdiOriginal = mapaOriginales.get(uuidOriginal);

      if (cfdiOriginal) {
        sustitucionesEncontradas++;

        // Agregar propiedades al CFDI original (si está en el dataset)
        const cfdiOriginalEnDataset = mapaTodosCFDIs.get(uuidOriginal);
        if (cfdiOriginalEnDataset) {
          cfdiOriginalEnDataset.Sustituido = true;
          cfdiOriginalEnDataset.SustituidoPorUUID = cfdiSustituto.UUID;
          cfdiOriginalEnDataset.SustituidoPorFolio = cfdiSustituto.Folio
            ? `${cfdiSustituto.Serie || ''} ${cfdiSustituto.Folio}`.trim()
            : '';
          cfdiOriginalEnDataset.SustituidoPorFecha = cfdiSustituto.Fecha;
        }

        // Agregar propiedades al CFDI sustituto (si está en el dataset)
        const cfdiSustitutoEnDataset = mapaTodosCFDIs.get(cfdiSustituto.UUID);
        if (cfdiSustitutoEnDataset) {
          cfdiSustitutoEnDataset.EsSustitucion = true;
          cfdiSustitutoEnDataset.TotalSustituido = cfdiOriginal.Total;
          cfdiSustitutoEnDataset.FolioSustituido = cfdiOriginal.Folio
            ? `${cfdiOriginal.Serie || ''} ${cfdiOriginal.Folio}`.trim()
            : '';
          cfdiSustitutoEnDataset.FechaSustituida = cfdiOriginal.Fecha;
        }

        // DEBUG && console.log(`    ✓ Match: ${cfdiOriginal.UUID} sustituido por ${cfdiSustituto.UUID}`);
      }
    });
  });

  console.log(`  ✓ Procesadas ${sustitucionesEncontradas} sustituciones\n`);
  console.log('Continuando con la exportación...');

  // 7. Retornar el array actualizado (las modificaciones ya están en los objetos del map)
  return todosCFDIs;
}

module.exports = {
  procesarSustituciones
};
