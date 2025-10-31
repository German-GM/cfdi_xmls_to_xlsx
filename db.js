'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { DB_PATH } = require('./constants');

let db = null;

/**
 * Inicializa la conexión a la base de datos SQLite
 * @param {Boolean} limpiar - Si es true, elimina la BD existente
 */
function initDB(limpiar = false) {
  if (db) return db;

  // Si limpiar = true, eliminar el archivo de BD existente
  if (limpiar && fs.existsSync(DB_PATH)) {
    console.log('Eliminando base de datos existente...');
    fs.unlinkSync(DB_PATH);
    // También eliminar archivos WAL y SHM si existen
    if (fs.existsSync(DB_PATH + '-wal')) fs.unlinkSync(DB_PATH + '-wal');
    if (fs.existsSync(DB_PATH + '-shm')) fs.unlinkSync(DB_PATH + '-shm');
  }

  db = new Database(DB_PATH);

  // Optimizaciones para velocidad
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = 10000');
  db.pragma('temp_store = MEMORY');

  createTables();
  return db;
}

/**
 * Crea las tablas necesarias
 */
function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cfdis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE NOT NULL,
      ruta_archivo TEXT,
      tipo_comprobante TEXT,
      serie TEXT,
      folio TEXT,
      fecha INTEGER,
      lugar_expedicion TEXT,
      forma_pago TEXT,
      metodo_pago TEXT,
      moneda TEXT,
      tipo_cambio REAL,
      subtotal REAL,
      total REAL,
      rfc_emisor TEXT,
      nombre_emisor TEXT,
      regimen_fiscal_emisor TEXT,
      rfc_receptor TEXT,
      nombre_receptor TEXT,
      uso_cfdi TEXT,
      regimen_fiscal_receptor TEXT,
      cp_receptor TEXT,
      no_certificado TEXT,
      tipo_relacion TEXT,
      uuid_relacion TEXT,
      total_traslados_locales REAL,
      total_retenciones_locales REAL,
      neto_pagar REAL,
      status TEXT,
      fecha_importacion INTEGER,
      datos_json TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_uuid ON cfdis(uuid);
    CREATE INDEX IF NOT EXISTS idx_fecha ON cfdis(fecha);
    CREATE INDEX IF NOT EXISTS idx_tipo_comprobante ON cfdis(tipo_comprobante);
    CREATE INDEX IF NOT EXISTS idx_rfc_emisor ON cfdis(rfc_emisor);
    CREATE INDEX IF NOT EXISTS idx_rfc_receptor ON cfdis(rfc_receptor);
    CREATE INDEX IF NOT EXISTS idx_moneda ON cfdis(moneda);
    CREATE INDEX IF NOT EXISTS idx_metodo_pago ON cfdis(metodo_pago);

    CREATE TABLE IF NOT EXISTS proceso_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total_archivos INTEGER,
      archivos_procesados INTEGER,
      archivos_fallidos INTEGER,
      bloque_actual INTEGER,
      fecha_inicio INTEGER,
      fecha_fin INTEGER,
      status TEXT
    );
  `);
}

/**
 * Inserta un CFDI en la base de datos
 * @param {Object} cfdi - Objeto CFDI parseado
 * @param {String} rutaArchivo - Ruta del archivo XML original
 */
function insertCFDI(cfdi, rutaArchivo = null) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO cfdis (
      uuid, ruta_archivo, tipo_comprobante, serie, folio, fecha,
      lugar_expedicion, forma_pago, metodo_pago, moneda, tipo_cambio,
      subtotal, total, rfc_emisor, nombre_emisor, regimen_fiscal_emisor,
      rfc_receptor, nombre_receptor, uso_cfdi, regimen_fiscal_receptor,
      cp_receptor, no_certificado, tipo_relacion, uuid_relacion,
      total_traslados_locales, total_retenciones_locales, neto_pagar,
      status, fecha_importacion, datos_json
    ) VALUES (
      @uuid, @rutaArchivo, @tipoComprobante, @serie, @folio, @fecha,
      @lugarExpedicion, @formaPago, @metodoPago, @moneda, @tipoCambio,
      @subtotal, @total, @rfcEmisor, @nombreEmisor, @regimenFiscalEmisor,
      @rfcReceptor, @nombreReceptor, @usoCfdi, @regimenFiscalReceptor,
      @cpReceptor, @noCertificado, @tipoRelacion, @uuidRelacion,
      @totalTrasladosLocales, @totalRetencionesLocales, @netoPagar,
      @status, @fechaImportacion, @datosJson
    )
  `);

  return stmt.run({
    uuid: cfdi.UUID,
    rutaArchivo: rutaArchivo,
    tipoComprobante: cfdi.TipoDeComprobante,
    serie: cfdi.Serie || null,
    folio: cfdi.Folio || null,
    fecha: cfdi.Fecha,
    lugarExpedicion: cfdi.LugarExpedicion,
    formaPago: cfdi.FormaPago,
    metodoPago: cfdi.MetodoPago,
    moneda: cfdi.Moneda,
    tipoCambio: cfdi.TipoCambio || null,
    subtotal: cfdi.SubTotal,
    total: cfdi.Total,
    rfcEmisor: cfdi.Emisor.Rfc,
    nombreEmisor: cfdi.Emisor.Nombre,
    regimenFiscalEmisor: cfdi.Emisor.RegimenFiscal,
    rfcReceptor: cfdi.Receptor.Rfc,
    nombreReceptor: cfdi.Receptor.Nombre,
    usoCfdi: cfdi.Receptor.UsoCFDI,
    regimenFiscalReceptor: cfdi.Receptor.RegimenFiscal || null,
    cpReceptor: cfdi.Receptor.domicilio?.cp || null,
    noCertificado: cfdi.NoCertificado,
    tipoRelacion: cfdi.TipoRelacion || null,
    uuidRelacion: cfdi.UUIDRelacion || null,
    totalTrasladosLocales: cfdi.TotalTrasladosLocales || null,
    totalRetencionesLocales: cfdi.TotalRetencionesLocales || null,
    netoPagar: cfdi.netoPagar || null,
    status: cfdi.status,
    fechaImportacion: cfdi.fechaImportacion,
    datosJson: JSON.stringify(cfdi)
  });
}

/**
 * Inserta múltiples CFDIs en una transacción (más rápido)
 */
function insertCFDIsBatch(cfdisConRutas) {
  const insertMany = db.transaction((items) => {
    for (const { cfdi, ruta } of items) {
      insertCFDI(cfdi, ruta);
    }
  });

  return insertMany(cfdisConRutas);
}

/**
 * Obtiene todos los CFDIs ordenados por fecha y moneda
 */
function getAllCFDIs(orderBy = 'fecha ASC') {
  const stmt = db.prepare(`
    SELECT datos_json FROM cfdis ORDER BY ${orderBy}
  `);

  return stmt.all().map(row => JSON.parse(row.datos_json));
}

/**
 * Obtiene CFDIs en bloques usando un iterador (para exportación sin saturar memoria)
 * @param {number} limit - Tamaño del bloque
 * @param {number} offset - Desde qué registro empezar
 * @param {string} orderBy - Orden de los resultados
 */
function getCFDIsChunk(limit, offset, orderBy = 'moneda ASC, folio ASC') {
  const stmt = db.prepare(`
    SELECT datos_json FROM cfdis ORDER BY ${orderBy} LIMIT @limit OFFSET @offset
  `);

  return stmt.all({ limit, offset }).map(row => JSON.parse(row.datos_json));
}

/**
 * Obtiene CFDIs con filtros personalizados
 */
function getCFDIsWithFilters(filters = {}) {
  let query = 'SELECT datos_json FROM cfdis WHERE 1=1';
  const params = {};

  if (filters.fechaInicio) {
    query += ' AND fecha >= @fechaInicio';
    params.fechaInicio = filters.fechaInicio;
  }

  if (filters.fechaFin) {
    query += ' AND fecha <= @fechaFin';
    params.fechaFin = filters.fechaFin;
  }

  if (filters.tipoComprobante) {
    query += ' AND tipo_comprobante = @tipoComprobante';
    params.tipoComprobante = filters.tipoComprobante;
  }

  if (filters.rfcReceptor) {
    query += ' AND rfc_receptor = @rfcReceptor';
    params.rfcReceptor = filters.rfcReceptor;
  }

  if (filters.moneda) {
    query += ' AND moneda = @moneda';
    params.moneda = filters.moneda;
  }

  query += ' ORDER BY moneda ASC, folio ASC';

  const stmt = db.prepare(query);
  return stmt.all(params).map(row => JSON.parse(row.datos_json));
}

/**
 * Obtiene estadísticas de los CFDIs
 */
function getEstadisticas() {
  const stmt = db.prepare(`
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT rfc_emisor) as total_emisores,
      COUNT(DISTINCT rfc_receptor) as total_receptores,
      MIN(fecha) as fecha_minima,
      MAX(fecha) as fecha_maxima,
      SUM(CASE WHEN moneda = 'MXN' THEN total ELSE 0 END) as total_mxn,
      SUM(CASE WHEN moneda = 'USD' THEN total ELSE 0 END) as total_usd,
      COUNT(CASE WHEN tipo_comprobante = 'I' THEN 1 END) as total_ingresos,
      COUNT(CASE WHEN tipo_comprobante = 'E' THEN 1 END) as total_egresos,
      COUNT(CASE WHEN tipo_comprobante = 'P' THEN 1 END) as total_pagos,
      COUNT(CASE WHEN tipo_comprobante = 'N' THEN 1 END) as total_nomina
    FROM cfdis
  `);

  return stmt.get();
}

/**
 * Verifica si un UUID ya existe
 */
function existeUUID(uuid) {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM cfdis WHERE uuid = ?');
  const result = stmt.get(uuid);
  return result.count > 0;
}

/**
 * Obtiene el conteo total de CFDIs
 */
function getTotalCFDIs() {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM cfdis');
  return stmt.get().count;
}

/**
 * Obtiene CFDIs que tienen UUIDRelacion (sustituciones)
 */
function getCFDIsConSustitucion() {
  const stmt = db.prepare(`
    SELECT datos_json FROM cfdis
    WHERE uuid_relacion IS NOT NULL AND uuid_relacion != ''
    ORDER BY moneda ASC, folio ASC
  `);

  return stmt.all().map(row => JSON.parse(row.datos_json));
}

/**
 * Obtiene CFDIs por sus UUIDs (para buscar originales)
 * @param {Array<string>} uuids - Array de UUIDs a buscar
 */
function getCFDIsByUUIDs(uuids) {
  if (!uuids || uuids.length === 0) return [];

  // Crear placeholders para la query (?, ?, ?)
  const placeholders = uuids.map(() => '?').join(',');
  const stmt = db.prepare(`
    SELECT datos_json FROM cfdis
    WHERE uuid IN (${placeholders})
  `);

  return stmt.all(...uuids).map(row => JSON.parse(row.datos_json));
}

/**
 * Registra el inicio del proceso
 */
function registrarInicioProceso(totalArchivos) {
  const stmt = db.prepare(`
    INSERT INTO proceso_log (total_archivos, archivos_procesados, archivos_fallidos, bloque_actual, fecha_inicio, status)
    VALUES (@totalArchivos, 0, 0, 0, @fechaInicio, 'EN_PROCESO')
  `);

  const info = stmt.run({
    totalArchivos,
    fechaInicio: Date.now()
  });

  return info.lastInsertRowid;
}

/**
 * Actualiza el progreso del proceso
 */
function actualizarProgreso(procesoId, bloqueActual, archivosProcesados, archivosFallidos) {
  const stmt = db.prepare(`
    UPDATE proceso_log
    SET bloque_actual = @bloqueActual,
        archivos_procesados = @archivosProcesados,
        archivos_fallidos = @archivosFallidos
    WHERE id = @procesoId
  `);

  stmt.run({
    procesoId,
    bloqueActual,
    archivosProcesados,
    archivosFallidos
  });
}

/**
 * Finaliza el proceso
 */
function finalizarProceso(procesoId, status = 'COMPLETADO') {
  const stmt = db.prepare(`
    UPDATE proceso_log
    SET fecha_fin = @fechaFin,
        status = @status
    WHERE id = @procesoId
  `);

  stmt.run({
    procesoId,
    fechaFin: Date.now(),
    status
  });
}

/**
 * Limpia la base de datos (útil para reiniciar el proceso)
 */
function limpiarDB() {
  db.exec(`
    DELETE FROM cfdis;
    DELETE FROM proceso_log;
    VACUUM;
  `);
}

/**
 * Cierra la conexión a la base de datos
 */
function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  initDB,
  insertCFDI,
  insertCFDIsBatch,
  getAllCFDIs,
  getCFDIsChunk,
  getCFDIsWithFilters,
  getCFDIsConSustitucion,
  getCFDIsByUUIDs,
  getEstadisticas,
  existeUUID,
  getTotalCFDIs,
  registrarInicioProceso,
  actualizarProgreso,
  finalizarProceso,
  limpiarDB,
  closeDB
};
