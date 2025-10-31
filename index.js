'use strict';

const { procesarXMLsEnBloques } = require('./procesar_por_bloques');
const { exportarDesdeDB } = require('./exportar_desde_bd');

/**
 * Punto de entrada principal
 */
async function main() {
  const comando = process.argv[2] || 'completo';

  try {
    switch (comando) {
      case 'procesar':
        // Solo procesar XMLs y guardar en BD
        await procesarXMLsEnBloques();
        break;

      case 'exportar':
        // Solo exportar desde BD a XLSX
        await exportarDesdeDB();
        break;

      case 'completo':
      default:
        // Proceso completo: procesar y exportar
        console.log('Ejecutando proceso completo: procesar + exportar\n');
        await procesarXMLsEnBloques();
        await exportarDesdeDB();
        break;
    }

    console.log('✓ Proceso finalizado exitosamente\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error fatal:', error);
    process.exit(1);
  }
}

// Ejecutar
main();
