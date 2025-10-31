# CFDI XMLs to XLSX - Procesamiento por Bloques

Procesador de archivos XML de CFDIs (Comprobantes Fiscales Digitales por Internet) con persistencia en SQLite y exportación a XLSX.

## Instalación

```bash
npm install
```

## Estructura del Proyecto

```
.
├── cfdis_to_export/          # Carpeta donde colocar los XMLs (recursivo)
├── constants.js              # Configuración (carpeta raíz, tamaño de bloque, etc.)
├── db.js                     # Manejo de SQLite (esquema, CRUD)
├── procesar_por_bloques.js   # Lectura recursiva y procesamiento en bloques
├── exportar_desde_bd.js      # Exportación desde BD a XLSX
├── index.js                  # Punto de entrada principal
├── crear_xlsx.js             # Generador de archivos Excel
├── utils.js                  # Utilidades (parseo de CFDI, etc.)
└── cfdis_database.db         # Base de datos SQLite (generada automáticamente)
```

## Uso

### 1. Proceso Completo

Procesa todos los XMLs y genera el archivo XLSX. **La BD comienza desde cero:**

```bash
npm start
```

### 2. Solo Procesar XMLs

Procesa XMLs y los guarda en la BD (sin exportar):

```bash
npm run procesar
```

### 3. Solo Exportar a XLSX

Exporta los CFDIs ya procesados desde la BD a XLSX:

```bash
npm run exportar
```

## Configuración

Edita `constants.js` para personalizar:

```javascript
// Carpeta donde están los XMLs
exports.CARPETA_RAIZ = './cfdis_to_export';

// Tamaño de bloque (archivos procesados a la vez)
exports.TAMANO_BLOQUE = 2000;

// Ruta del archivo de base de datos
exports.DB_PATH = './cfdis_database.db';

// Ruta del archivo Excel generado
exports.OUTPUT_FILE_PATH = './EXPORTED_XLSX.xlsx';

// Modo debug (muestra logs adicionales)
exports.DEBUG = true;

// Tamaño de bloque para exportación (número de registros a cargar de BD por vez)
exports.TAMANO_BLOQUE_EXPORTACION = 10000;
```

## Flujo de Trabajo

1. **Colocar XMLs**: Pon todos tus archivos XML en la carpeta `cfdis_to_export/` (puede tener subcarpetas, ej: `202001/`, `202002/`, etc.)

2. **Ejecutar proceso**:

```bash
npm start
```

1. **Resultado**: Se genera `EXPORTED_XLSX.xlsx` con todos los CFDIs procesados

## Base de Datos SQLite

### Tablas Principales

#### `cfdis`
Almacena la información principal de cada CFDI:
- UUID (único)
- Datos del emisor y receptor
- Montos (subtotal, total, impuestos)
- Fechas, formas de pago, etc.
- JSON completo del CFDI

#### `proceso_log`
Registra el progreso de cada ejecución:
- Total de archivos procesados
- Bloques completados
- Archivos fallidos
- Tiempos de ejecución

## Estadísticas

Al finalizar el procesamiento se muestran:
- Total de CFDIs procesados
- Emisores y receptores únicos
- Totales por moneda (MXN, USD, etc.)
- Distribución por tipo de comprobante (Ingreso, Egreso, Pago, Nómina)
- Rango de fechas
- Velocidad de procesamiento

## Manejo de Errores

- XMLs con formato incorrecto se saltan y se reportan
- Se registra el progreso para reiniciar si falla

## Notas Importantes

1. **La BD comienza limpia con `npm start`**: Si ejecutas `npm start`, la base de datos se elimina y comienza desde cero
2. **Usa `npm run exportar` para regenerar XLSX**: Si ya procesaste los XMLs y solo quieres regenerar el Excel con otros filtros
3. **Tamaño de bloque**: Ajusta `TAMANO_BLOQUE` según tu hardware

## Dependencias

- `better-sqlite3`: SQLite rápido y síncrono
- `excel4node`: Generación de archivos Excel
- `xml2json`: Parseo de XML a JSON
- `moment`: Manejo de fechas

