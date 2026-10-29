/**
 * APP_CONTEO2 - Apps Script (servidor) - V2.8.1
 * Farmacia Bolaños
 *
 * QUÉ HACE
 *  1) Guarda los conteos en INVENTARIO_MER / INVENTARIO_FAR / INVENTARIO_BC.
 *     - Candado (LockService): aunque lleguen 10, 20 o más envíos a la vez,
 *       entran a la hoja uno por uno. Nunca se pisan filas.
 *     - Sin duplicados: si la app reintenta un envío (por ejemplo porque se cortó
 *       la señal), el ID_REGISTRO ya existe y NO se escribe otra fila.
 *     - Responde "success: true" SOLO cuando la fila ya quedó escrita en la hoja.
 *     - Escribe cada dato en la columna cuyo ENCABEZADO coincide (no depende del
 *       orden de las columnas).
 *  2) Cambia la contraseña temporal 000000 por la nueva (hoja USUARIOS).
 *  3) "Este código está siendo contado por...": registra quién tiene abierto cada
 *     código (en memoria del script, se borra solo a los 5 minutos sin señal).
 *
 * CÓMO PUBLICARLO (la URL de la app NO cambia)
 *  - Pega este archivo completo en lugar de tu Code.gs y guarda.
 *  - Implementar > Gestionar implementaciones > (lápiz) Editar >
 *    Versión: "Nueva versión" > Implementar.
 *  - "Ejecutar como: Yo" y "Quién tiene acceso: Cualquier usuario".
 *  - Si algo saliera mal, en esa misma pantalla puedes volver a la versión anterior.
 */

// ===================== CONFIGURACIÓN =====================

const SHEET_ID = '1vMn6A3_Sm2KvdlV9UNQGFV1WTuIKmfl718tHMEy52bg';

// Hojas de conteo: se buscan por NOMBRE y, si no existe, por GID.
const HOJAS_CONTEO = {
  mercado:  { nombre: 'INVENTARIO_MER', gid: 1290916129 },
  farmacia: { nombre: 'INVENTARIO_FAR', gid: 1929739320 },
  bodega:   { nombre: 'INVENTARIO_BC',  gid: 554330490 }
};

const HOJA_USUARIOS = { nombre: 'USUARIOS', gid: 138385541 };

// Cuánto espera un envío su turno si hay muchos a la vez (ms).
const ESPERA_CANDADO_MS = 25000;

// Cuántas filas del final se revisan para detectar un ID repetido.
const FILAS_REVISION_DUPLICADOS = 2000;

// "Siendo contado por": segundos sin señal para quitar el aviso.
const EN_CONTEO_TTL_S = 300;

// Columnas que se guardan como TEXTO exacto (evita que Sheets convierta
// "00123" en 123 o "10/2026" en una fecha).
const COLUMNAS_TEXTO = ['ID_REGISTRO', 'CODIGO', 'VENCE'];

// Columnas numéricas (se guardan como número si el valor es numérico).
const COLUMNAS_NUMERO = ['EXISTENCIA_SISTEMA', 'CANTIDAD_FISICA', 'PVP_PUBLICO', 'PRECIO_DNM'];

// ===================== ENTRADAS WEB =====================

function doPost(e) {
  try {
    const datos = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    if (datos.ACCION === 'CAMBIAR_PASSWORD') {
      return json_(cambiarPassword_(datos));
    }
    if (datos.ACCION === 'EN_CONTEO') {
      return json_(enConteo_(datos));
    }
    // Sin ACCION = guardar conteo (formato que ya usa la app)
    return json_(guardarConteo_(datos));
  } catch (err) {
    return json_({ success: false, code: 'ERROR', message: 'Error en el servidor: ' + err.message });
  }
}

/**
 * GET: se usa para el aviso "siendo contado por" (nunca escribe en las hojas).
 *  ?accion=en_conteo&modo=marcar|liberar|consultar&sucursal=..&codigo=..&usuario=..
 *  ?accion=ping  -> comprobar que el script responde y su versión
 */
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.accion === 'en_conteo') {
      return json_(enConteo_({
        MODO: p.modo, SUCURSAL: p.sucursal, CODIGO: p.codigo, USUARIO: p.usuario
      }));
    }
    return json_({ success: true, servicio: 'APP_CONTEO2', version: '2.8.1' });
  } catch (err) {
    return json_({ success: false, code: 'ERROR', message: err.message });
  }
}

// ===================== GUARDAR CONTEO =====================

function guardarConteo_(datos) {
  const sucursal = String(datos.SUCURSAL || '').toLowerCase().trim();
  const def = HOJAS_CONTEO[sucursal];
  if (!def) return { success: false, code: 'SUCURSAL', message: 'Sucursal no válida: ' + sucursal };

  const id = String(datos.ID_REGISTRO || '').trim();
  if (!id) return { success: false, code: 'SIN_ID', message: 'Falta ID_REGISTRO' };
  if (!String(datos.CODIGO || '').trim()) return { success: false, code: 'SIN_CODIGO', message: 'Falta el código del producto' };

  const cache = CacheService.getScriptCache();
  const claveId = 'ID_' + id;

  // Reintento de un envío que YA se guardó: responder éxito sin escribir otra vez.
  const yaGuardado = cache.get(claveId);
  if (yaGuardado) return { success: true, id: id, duplicado: true, fila: Number(yaGuardado), message: 'Conteo registrado' };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(ESPERA_CANDADO_MS)) {
    return { success: false, code: 'OCUPADO', message: 'Servidor ocupado, reintentando...' };
  }

  try {
    // Revisar otra vez dentro del candado (otro envío igual pudo terminar mientras esperábamos)
    const otraVez = cache.get(claveId);
    if (otraVez) return { success: true, id: id, duplicado: true, fila: Number(otraVez), message: 'Conteo registrado' };

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const hoja = buscarHoja_(ss, def);
    if (!hoja) return { success: false, code: 'HOJA', message: 'No existe la hoja ' + def.nombre };

    const ultimaCol = Math.max(hoja.getLastColumn(), 1);
    const encabezados = hoja.getRange(1, 1, 1, ultimaCol).getValues()[0].map(normalizar_);
    const colId = encabezados.indexOf('ID_REGISTRO');

    // Segunda protección contra duplicados: buscar el ID en las últimas filas de la hoja.
    const ultimaFila = hoja.getLastRow();
    if (colId !== -1 && ultimaFila > 1) {
      const desde = Math.max(2, ultimaFila - FILAS_REVISION_DUPLICADOS + 1);
      const ids = hoja.getRange(desde, colId + 1, ultimaFila - desde + 1, 1).getValues();
      for (let i = ids.length - 1; i >= 0; i--) {
        if (String(ids[i][0]).trim() === id) {
          const fila = desde + i;
          cache.put(claveId, String(fila), 21600);
          return { success: true, id: id, duplicado: true, fila: fila, message: 'Conteo registrado' };
        }
      }
    }

    // Construir la fila según los encabezados reales de la hoja
    const valores = {};
    Object.keys(datos).forEach(function (k) { valores[normalizar_(k)] = datos[k]; });
    // Alias por si la columna se llama "HORA INICIO" en vez de "HORA INCIO"
    if (valores['HORA INCIO'] !== undefined && valores['HORA INICIO'] === undefined) valores['HORA INICIO'] = valores['HORA INCIO'];
    // Columna calculada, solo si existe en la hoja
    if (encabezados.indexOf('DIFERENCIA') !== -1 && valores['DIFERENCIA'] === undefined) {
      const c = Number(valores['CANTIDAD_FISICA']), s = Number(valores['EXISTENCIA_SISTEMA']);
      if (!isNaN(c) && !isNaN(s) && String(valores['CANTIDAD_FISICA']) !== '') valores['DIFERENCIA'] = Math.round((c - s) * 100000) / 100000;
    }

    let columnasUsadas = 0;
    const fila = encabezados.map(function (h) {
      if (!h || valores[h] === undefined || valores[h] === null) return '';
      columnasUsadas++;
      return formatear_(h, valores[h]);
    });
    if (columnasUsadas === 0) return { success: false, code: 'ENCABEZADOS', message: 'La hoja ' + def.nombre + ' no tiene los encabezados esperados' };

    hoja.appendRow(fila);
    SpreadsheetApp.flush(); // asegurar que quedó escrita ANTES de responder

    const filaEscrita = hoja.getLastRow();
    cache.put(claveId, String(filaEscrita), 21600); // 6 horas

    return { success: true, id: id, duplicado: false, fila: filaEscrita, message: 'Conteo registrado' };
  } finally {
    lock.releaseLock();
  }
}

// ===================== CAMBIAR CONTRASEÑA =====================

function cambiarPassword_(datos) {
  const usuario = String(datos.USUARIO || '').trim();
  const nueva = String(datos.NUEVA_PASSWORD || '');
  if (!usuario || nueva.length < 4) return { success: false, message: 'Datos incompletos' };
  if (nueva === '000000') return { success: false, message: 'Elige una contraseña distinta a la temporal' };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(ESPERA_CANDADO_MS)) return { success: false, code: 'OCUPADO', message: 'Servidor ocupado, intenta de nuevo' };

  try {
    const hoja = buscarHoja_(SpreadsheetApp.openById(SHEET_ID), HOJA_USUARIOS);
    if (!hoja) return { success: false, message: 'No existe la hoja USUARIOS' };

    const n = hoja.getLastRow();
    if (n < 2) return { success: false, message: 'Usuario no encontrado' };

    // Columna A = usuario, columna B = contraseña (igual que lee la app)
    const filas = hoja.getRange(2, 1, n - 1, 2).getValues();
    for (let i = 0; i < filas.length; i++) {
      if (String(filas[i][0]).trim() === usuario) {
        // Solo se permite cambiar desde la contraseña temporal
        if (String(filas[i][1]).trim() !== '000000') {
          return { success: false, message: 'Este usuario ya tiene contraseña. Pide al administrador que la restablezca a 000000.' };
        }
        hoja.getRange(i + 2, 2).setValue("'" + nueva); // como texto: "0123" no se vuelve 123
        SpreadsheetApp.flush();
        return { success: true, message: 'Contraseña actualizada' };
      }
    }
    return { success: false, message: 'Usuario no encontrado' };
  } finally {
    lock.releaseLock();
  }
}

// ===================== "SIENDO CONTADO POR" =====================
// Se guarda en la memoria del script (CacheService), NO en las hojas.
// Cada código guarda { usuario: {ts, desde} }. Si un celular deja de mandar
// señal por EN_CONTEO_TTL_S segundos, su nombre desaparece solo.

function enConteo_(d) {
  const modo = String(d.MODO || 'consultar').toLowerCase();
  const sucursal = String(d.SUCURSAL || '').toLowerCase().trim();
  const codigo = String(d.CODIGO || '').trim().toUpperCase();
  const usuario = String(d.USUARIO || '').trim();
  if (!HOJAS_CONTEO[sucursal] || !codigo) return { success: false, message: 'Datos incompletos', otros: [] };

  const cache = CacheService.getScriptCache();
  const clave = 'EC_' + sucursal + '_' + Utilities.base64EncodeWebSafe(codigo).slice(0, 200);
  const ahora = Date.now();
  const yo = usuario.toLowerCase();

  let mapa = {};
  try { mapa = JSON.parse(cache.get(clave) || '{}'); } catch (e) { mapa = {}; }

  // Quitar a quienes ya no mandan señal
  Object.keys(mapa).forEach(function (u) {
    if (!mapa[u] || ahora - mapa[u].ts > EN_CONTEO_TTL_S * 1000) delete mapa[u];
  });

  let cambio = false;
  if (modo === 'marcar' && yo) {
    mapa[yo] = { nombre: usuario, ts: ahora, desde: (mapa[yo] && mapa[yo].desde) || ahora };
    cambio = true;
  } else if (modo === 'liberar' && yo) {
    if (mapa[yo]) { delete mapa[yo]; cambio = true; }
  }

  if (cambio) {
    if (Object.keys(mapa).length === 0) cache.remove(clave);
    else cache.put(clave, JSON.stringify(mapa), EN_CONTEO_TTL_S);
  }

  const otros = Object.keys(mapa)
    .filter(function (u) { return u !== yo; })
    .map(function (u) { return { usuario: mapa[u].nombre || u, desde: mapa[u].desde }; });

  return { success: true, otros: otros };
}

// ===================== UTILIDADES =====================

function buscarHoja_(ss, def) {
  const porNombre = ss.getSheetByName(def.nombre);
  if (porNombre) return porNombre;
  const hojas = ss.getSheets();
  for (let i = 0; i < hojas.length; i++) {
    if (hojas[i].getSheetId() === def.gid) return hojas[i];
  }
  return null;
}

function normalizar_(texto) {
  let t = String(texto === undefined || texto === null ? '' : texto)
    .replace(/^\uFEFF/, '')
    .replace(/\u00A0/g, ' ');
  // Quitar tildes (compatible también con el motor antiguo de Apps Script)
  if (typeof t.normalize === 'function') {
    t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } else {
    t = t.replace(/[\u00C1\u00C0\u00C4\u00C2\u00E1\u00E0\u00E4\u00E2]/g, 'A')
         .replace(/[\u00C9\u00C8\u00CB\u00CA\u00E9\u00E8\u00EB\u00EA]/g, 'E')
         .replace(/[\u00CD\u00CC\u00CF\u00CE\u00ED\u00EC\u00EF\u00EE]/g, 'I')
         .replace(/[\u00D3\u00D2\u00D6\u00D4\u00F3\u00F2\u00F6\u00F4]/g, 'O')
         .replace(/[\u00DA\u00D9\u00DC\u00DB\u00FA\u00F9\u00FC\u00FB]/g, 'U');
  }
  return t.replace(/\s+/g, ' ').trim().toUpperCase();
}

function formatear_(columna, valor) {
  const texto = String(valor);
  if (COLUMNAS_TEXTO.indexOf(columna) !== -1) {
    return texto === '' ? '' : "'" + texto;
  }
  if (COLUMNAS_NUMERO.indexOf(columna) !== -1) {
    if (texto.trim() === '') return '';
    const n = Number(texto);
    return isNaN(n) ? texto : n;
  }
  return valor;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
