exports.DEBUG = true;
exports.OUTPUT_FILE_PATH = `./EXPORTED_XLSX.xlsx`;

// NORMAL
exports.CARPETA_RAIZ = './cfdis_to_export';

// DEBUT/TEST
// exports.CARPETA_RAIZ = './test_to_export';

// Base de datos SQLite
exports.DB_PATH = './cfdis_database.db';

// Tamaño de bloque para procesamiento (número de archivos por bloque)
exports.TAMANO_BLOQUE = 2000;

// Tamaño de bloque para exportación (número de registros a cargar de BD por vez)
exports.TAMANO_BLOQUE_EXPORTACION = 10000;