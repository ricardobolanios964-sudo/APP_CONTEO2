/**
 * APPS SCRIPT ACTUALIZADO - Farmacia Bolaños
 *
 * Maneja TRES cosas:
 *
 * 1) GUARDAR CONTEOS - todas las sucursales usan las mismas 14 columnas:
 *    ID_REGISTRO, FECHA, HORA INCIO, HORA FIN, CODIGO, NOMBRE, MARCA,
 *    EXISTENCIA_SISTEMA, CANTIDAD_FISICA, VENCE, PVP_PUBLICO, PRECIO_DNM,
 *    OBSERVACIONES, ESTATUS
 *    - SUCURSAL = "mercado"  → hoja INVENTARIO_MER
 *    - SUCURSAL = "farmacia" → hoja INVENTARIO_FAR
 *    - SUCURSAL = "bodega"   → hoja INVENTARIO_BC
 *    NUEVO (V2.8.1):
 *    - Candado: si llegan muchos envíos a la vez, entran a la hoja uno por uno.
 *    - Sin duplicados: si la app reintenta un envío con el mismo ID_REGISTRO
 *      (por ejemplo porque se cortó la señal), NO se escribe otra fila.
 *    - Responde éxito solo cuando la fila ya quedó escrita (flush).
 *
 * 2) CAMBIAR CONTRASEÑA - actualiza la hoja USUARIOS (sin cambios)
 *    - ACCION = "CAMBIAR_PASSWORD" con USUARIO y NUEVA_PASSWORD
 *
 * 3) NUEVO: "ESTE CÓDIGO ESTÁ SIENDO CONTADO POR..." (doGet ?accion=en_conteo)
 *    Se guarda en la memoria del script, NUNCA en las hojas.
 *
 * IMPORTANTE: la hoja USUARIOS debe tener columnas "USUARIO" y
 * "CONTRASEÑA" (con eñe) en la primera fila.
 */

// ===== AJUSTES NUEVOS (V2.8.1) =====
const VERSION_SCRIPT = '2.8.1'
const ESPERA_CANDADO_MS = 25000          // cuánto espera un envío su turno
const FILAS_REVISION_DUPLICADOS = 2000   // filas del final donde se busca un ID repetido
const EN_CONTEO_TTL_S = 300              // "siendo contado": se quita solo a los 5 min sin señal

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents)

    // ================================================
    // ACCIÓN: CAMBIAR CONTRASEÑA (hoja USUARIOS)  - SIN CAMBIOS
    // ================================================
    if (data.ACCION === "CAMBIAR_PASSWORD") {
      const sheetUsuarios = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("USUARIOS")

      if (!sheetUsuarios) {
        return ContentService.createTextOutput(
          JSON.stringify({ success: false, message: "No se encontró la hoja USUARIOS" })
        ).setMimeType(ContentService.MimeType.JSON)
      }

      const headers = sheetUsuarios.getRange(1, 1, 1, sheetUsuarios.getLastColumn()).getValues()[0]
      const colUsuario = headers.findIndex(h => h.toString().trim().toUpperCase() === "USUARIO")
      const colPassword = headers.findIndex(h => h.toString().trim().toUpperCase().indexOf("CONTRASE") === 0)

      if (colUsuario < 0 || colPassword < 0) {
        return ContentService.createTextOutput(
          JSON.stringify({ success: false, message: "No se encontraron las columnas USUARIO/CONTRASEÑA" })
        ).setMimeType(ContentService.MimeType.JSON)
      }

      const lastRow = sheetUsuarios.getLastRow()
      const usuarios = sheetUsuarios.getRange(2, colUsuario + 1, lastRow - 1, 1).getValues()

      for (let i = 0; i < usuarios.length; i++) {
        // Comparación EXACTA (respeta mayúsculas/minúsculas)
        if (usuarios[i][0].toString().trim() === (data.USUARIO || '').toString().trim()) {
          sheetUsuarios.getRange(i + 2, colPassword + 1).setValue(data.NUEVA_PASSWORD)
          return ContentService.createTextOutput(
            JSON.stringify({ success: true, message: "Contraseña actualizada correctamente" })
          ).setMimeType(ContentService.MimeType.JSON)
        }
      }

      return ContentService.createTextOutput(
        JSON.stringify({ success: false, message: "Usuario no encontrado en la hoja USUARIOS" })
      ).setMimeType(ContentService.MimeType.JSON)
    }

    // ================================================
    // NUEVO: "SIENDO CONTADO POR" también por POST (la app usa GET)
    // ================================================
    if (data.ACCION === "EN_CONTEO") {
      return respuestaJSON_(enConteo_(data))
    }

    // ================================================
    // GUARDAR CONTEO (INVENTARIO_MER, INVENTARIO_FAR o INVENTARIO_BC)
    // ================================================

    const sucursal = (data.SUCURSAL || '').toString().toLowerCase().trim()

    let sheetName
    if (sucursal === 'mercado') {
      sheetName = 'INVENTARIO_MER'
    } else if (sucursal === 'bodega') {
      sheetName = 'INVENTARIO_BC'
    } else {
      sheetName = 'INVENTARIO_FAR'
    }

    // NUEVO: si este mismo envío (mismo ID_REGISTRO) ya se guardó antes,
    // responder éxito SIN escribir otra fila (reintento de la app).
    const idRegistro = (data.ID_REGISTRO || '').toString().trim()
    const cache = CacheService.getScriptCache()
    if (idRegistro && data.ACCION !== "ACTUALIZAR" && cache.get('ID_' + idRegistro)) {
      return ContentService.createTextOutput(
        JSON.stringify({ success: true, message: "Conteo registrado exitosamente", id: data.ID_REGISTRO, duplicado: true })
      ).setMimeType(ContentService.MimeType.JSON)
    }

    // NUEVO: candado - los envíos simultáneos entran uno por uno
    const lock = LockService.getScriptLock()
    if (!lock.tryLock(ESPERA_CANDADO_MS)) {
      return ContentService.createTextOutput(
        JSON.stringify({ success: false, code: "OCUPADO", message: "Servidor ocupado, intenta de nuevo" })
      ).setMimeType(ContentService.MimeType.JSON)
    }

    try {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName)

      if (!sheet) {
        return ContentService.createTextOutput(
          JSON.stringify({ success: false, message: "No se encontró la hoja " + sheetName })
        ).setMimeType(ContentService.MimeType.JSON)
      }

      const lastCol = sheet.getLastColumn()
      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0]

      // Si se pide ACTUALIZAR (mismo código + misma fecha de vencimiento),
      // actualiza la cantidad en vez de crear una fila nueva
      if (data.ACCION === "ACTUALIZAR" && sheet.getLastRow() > 1) {
        const colCodigo   = headers.indexOf("CODIGO")
        const colVence    = headers.indexOf("VENCE")
        const colCantidad = headers.indexOf("CANTIDAD_FISICA")

        if (colCodigo >= 0 && colVence >= 0 && colCantidad >= 0) {
          const lastRow = sheet.getLastRow()
          const codigos = sheet.getRange(2, colCodigo + 1, lastRow - 1, 1).getValues()
          const vences  = sheet.getRange(2, colVence  + 1, lastRow - 1, 1).getValues()

          for (let i = 0; i < codigos.length; i++) {
            if (
              codigos[i][0].toString().trim() === (data.CODIGO || '').toString().trim() &&
              vences[i][0].toString().trim()  === (data.VENCE || '').toString().trim()
            ) {
              sheet.getRange(i + 2, colCantidad + 1).setValue(parseFloat(data.CANTIDAD_FISICA))
              SpreadsheetApp.flush() // NUEVO: asegurar que quedó escrito antes de responder
              return ContentService.createTextOutput(
                JSON.stringify({ success: true, message: "Cantidad actualizada", id: data.ID_REGISTRO })
              ).setMimeType(ContentService.MimeType.JSON)
            }
          }
        }
      }

      // NUEVO: segunda protección contra duplicados - buscar el ID en las últimas filas
      if (idRegistro && sheet.getLastRow() > 1) {
        const colId = headers.findIndex(h => h.toString().trim() === "ID_REGISTRO")
        if (colId >= 0) {
          const ultimaFila = sheet.getLastRow()
          const desde = Math.max(2, ultimaFila - FILAS_REVISION_DUPLICADOS + 1)
          const ids = sheet.getRange(desde, colId + 1, ultimaFila - desde + 1, 1).getValues()
          for (let i = ids.length - 1; i >= 0; i--) {
            if (ids[i][0].toString().trim() === idRegistro) {
              cache.put('ID_' + idRegistro, '1', 21600)
              return ContentService.createTextOutput(
                JSON.stringify({ success: true, message: "Conteo registrado exitosamente", id: data.ID_REGISTRO, duplicado: true })
              ).setMimeType(ContentService.MimeType.JSON)
            }
          }
        }
      }

      // Mismo mapeo de columnas para TODAS las sucursales
      const fieldMap = {
        "ID_REGISTRO":        data.ID_REGISTRO,
        "FECHA":              data.FECHA,
        "HORA INCIO":         data["HORA INCIO"],
        "HORA FIN":           data["HORA FIN"],
        "CODIGO":             data.CODIGO,
        "NOMBRE":             data.NOMBRE,
        "MARCA":              data.MARCA              || "",
        "EXISTENCIA_SISTEMA": data.EXISTENCIA_SISTEMA || "",
        "CANTIDAD_FISICA":    data.CANTIDAD_FISICA,
        "VENCE":              data.VENCE              || "",
        "PVP_PUBLICO":        data.PVP_PUBLICO        || "",
        "PRECIO_DNM":         data.PRECIO_DNM         || "",
        "OBSERVACIONES":      data.OBSERVACIONES      || "",
        "ESTATUS":            data.ESTATUS            || "Registrado",
      }

      const row = headers.map(h => {
        const key = h.toString().trim()
        return fieldMap.hasOwnProperty(key) ? fieldMap[key] : ""
      })

      sheet.appendRow(row)
      SpreadsheetApp.flush() // NUEVO: asegurar que quedó escrita antes de responder

      if (idRegistro) cache.put('ID_' + idRegistro, '1', 21600) // recordar 6 h para reintentos

      return ContentService.createTextOutput(
        JSON.stringify({ success: true, message: "Conteo registrado exitosamente", id: data.ID_REGISTRO })
      ).setMimeType(ContentService.MimeType.JSON)

    } finally {
      lock.releaseLock()
    }

  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, message: "Error: " + error.toString() })
    ).setMimeType(ContentService.MimeType.JSON)
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {}

  // NUEVO: "este código está siendo contado por..."
  if (p.accion === 'en_conteo') {
    return respuestaJSON_(enConteo_({
      MODO: p.modo, SUCURSAL: p.sucursal, CODIGO: p.codigo, USUARIO: p.usuario
    }))
  }

  // Igual que antes (+ success y version para comprobar qué script está publicado)
  return ContentService.createTextOutput(
    JSON.stringify({ status: "OK", message: "Servicio funcionando correctamente", success: true, version: VERSION_SCRIPT })
  ).setMimeType(ContentService.MimeType.JSON)
}

// ================================================
// NUEVO: "SIENDO CONTADO POR"
// Cada código guarda { usuario: { nombre, ts, desde } } en la memoria del
// script. Si un celular deja de mandar señal por EN_CONTEO_TTL_S segundos,
// su nombre desaparece solo. No escribe nada en las hojas.
// ================================================
function enConteo_(d) {
  try {
    const modo = (d.MODO || 'consultar').toString().toLowerCase()
    const sucursal = (d.SUCURSAL || '').toString().toLowerCase().trim()
    const codigo = (d.CODIGO || '').toString().trim().toUpperCase()
    const usuario = (d.USUARIO || '').toString().trim()
    if (['mercado', 'farmacia', 'bodega'].indexOf(sucursal) < 0 || !codigo) {
      return { success: false, message: 'Datos incompletos', otros: [] }
    }

    const cache = CacheService.getScriptCache()
    const clave = 'EC_' + sucursal + '_' + Utilities.base64EncodeWebSafe(codigo).slice(0, 200)
    const ahora = Date.now()
    const yo = usuario.toLowerCase()

    let mapa = {}
    try { mapa = JSON.parse(cache.get(clave) || '{}') } catch (err) { mapa = {} }

    // Quitar a quienes ya no mandan señal
    Object.keys(mapa).forEach(u => {
      if (!mapa[u] || ahora - mapa[u].ts > EN_CONTEO_TTL_S * 1000) delete mapa[u]
    })

    let cambio = false
    if (modo === 'marcar' && yo) {
      mapa[yo] = { nombre: usuario, ts: ahora, desde: (mapa[yo] && mapa[yo].desde) || ahora }
      cambio = true
    } else if (modo === 'liberar' && yo) {
      if (mapa[yo]) { delete mapa[yo]; cambio = true }
    }

    if (cambio) {
      if (Object.keys(mapa).length === 0) cache.remove(clave)
      else cache.put(clave, JSON.stringify(mapa), EN_CONTEO_TTL_S)
    }

    const otros = Object.keys(mapa)
      .filter(u => u !== yo)
      .map(u => ({ usuario: mapa[u].nombre || u, desde: mapa[u].desde }))

    return { success: true, otros: otros }
  } catch (error) {
    return { success: false, message: "Error: " + error.toString(), otros: [] }
  }
}

function respuestaJSON_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}
