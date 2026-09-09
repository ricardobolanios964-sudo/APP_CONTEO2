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
    WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbxON4h2jvukhMPsYuZjNId-r5FzYYvGgYrmRlOjPzHFBqP3LqGG17Nc2POvRTgy11U/exec',
    
    // Rutas relativas (GitHub Pages sirve todo desde la raíz del repo)
    BASE_URL: '.',
    
    // Caché en localStorage, en segundos (igual que hacía PHP con archivos)
    CACHE_TTL_OLIMPO: 20,
    CACHE_TTL_USUARIOS: 30,
    CACHE_TTL_CONTEOS: 30,
};
