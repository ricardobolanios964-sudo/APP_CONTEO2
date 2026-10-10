/**
 * CONFIGURACIÓN - Farmacia Bolaños (versión GitHub Pages)
 * Equivalente a config/config.php de la versión PHP
 */

const CONFIG = {
    SHEET_ID: '1vMn6A3_Sm2KvdlV9UNQGFV1WTuIKmfl718tHMEy52bg',
    // Hojas FUENTE de existencia
    // Mercado: OLIMPO-MER
    GID_OLIMPO_MER: '1294560477',
    // Farmacia: OLIMPO-FAR
    GID_OLIMPO_FAR: '1328512039',
    GID_USUARIOS: '138385541',
    GID_INVENTARIO_MER: '1290916129',
    GID_INVENTARIO_FAR: '1929739320',
    // Bodega: fuente OLIMPO_BC y destino INVENTARIO_BC
    GID_OLIMPO_BC: '1023783261',
    GID_INVENTARIO_BC: '554330490',
    WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbwrwrXw3y8I6S5W0fubGr8SzPqTq5dXknnlWLDzyTIOJO0kJnaEQSRUh6Sryu3WtFX4/exec',
    
    // Rutas relativas (GitHub Pages sirve todo desde la raíz del repo)
    BASE_URL: '.',
    
    // Caché en localStorage, en segundos (igual que hacía PHP con archivos)
    CACHE_TTL_OLIMPO: 20,
    CACHE_TTL_USUARIOS: 30,
    CACHE_TTL_CONTEOS: 30,

    // Actualización en vivo (segundos). Google Sheets no "empuja" cambios, así que la app
    // consulta la hoja cada cierto tiempo mientras la pantalla está visible.
    LIVE_INTERVAL_CONTEOS: 15,   // marcas CONTADO, contador y Resumen
    LIVE_INTERVAL_OLIMPO: 60,    // lista de productos y existencia
};
