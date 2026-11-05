/**
 * APPS SCRIPT ACTUALIZADO - Farmacia Bolaños
 *
 * Maneja CUATRO cosas:
 *
 * 1) GUARDAR CONTEOS - todas las sucursales usan las mismas 14 columnas:
 *    ID_REGISTRO, FECHA, HORA INCIO, HORA FIN, CODIGO, NOMBRE, MARCA,
 *    EXISTENCIA_SISTEMA, CANTIDAD_FISICA, VENCE, PVP_PUBLICO, PRECIO_DNM,
 *    OBSERVACIONES, ESTATUS
 *    - SUCURSAL = "mercado"  → hoja INVENTARIO_MER
 *    - SUCURSAL = "farmacia" → hoja INVENTARIO_FAR
 *    - SUCURSAL = "bodega"   → hoja INVENTARIO_BC
 *    - Candado: si llegan muchos envíos a la vez, no se pisan filas.
 *      (V2.9.0: ESCRITURA EN LOTE. Cada envío se anota en una lista de espera y
 *       al que le toca el turno escribe TODAS las filas en espera de una sola vez.
 *       Todo se prepara antes del turno. El turno espera hasta 45 s.)
 *    - Sin duplicados: si la app reintenta un envío con el mismo ID_REGISTRO,
 *      NO se escribe otra fila.
 *    - Responde éxito solo cuando la fila ya quedó escrita (flush).
 *
 * 2) CAMBIAR CONTRASEÑA - actualiza la hoja USUARIOS (sin cambios)
 *    - ACCION = "CAMBIAR_PASSWORD" con USUARIO y NUEVA_PASSWORD
 *
 * 3) "ESTE CÓDIGO ESTÁ SIENDO CONTADO POR..." (doGet ?accion=en_conteo)
 *    Se guarda en la memoria del script, NUNCA en las hojas.
 *
 * 4) NUEVO (V2.9.0) - LECTURA COMPLETA DE HOJAS (doGet ?accion=leer)
 *    La exportación pública de Google solo entrega las filas VISIBLES cuando
 *    alguien deja un filtro aplicado en la hoja. Esta lectura entrega TODAS
 *    las filas, haya o no filtro. También: ?accion=verificar (¿ya llegó este ID?).
 *
 * IMPORTANTE: la hoja USUARIOS debe tener columnas "USUARIO" y
 * "CONTRASEÑA" (con eñe) en la primera fila.
 */

// ===== AJUSTES =====
const VERSION_SCRIPT = '2.9.0'
const ESPERA_CANDADO_MS = 45000          // cuánto espera un envío su turno (antes 25 s)
const FILAS_REVISION_DUPLICADOS = 2000   // filas del final donde se busca un ID repetido
const EN_CONTEO_TTL_S = 300              // "siendo contado": se quita solo a los 5 min sin señal
const LECTURA_TTL_CONTEOS_S = 3          // copia rápida de las hojas de conteo (se renueva al guardar)
const LECTURA_TTL_OTRAS_S = 60           // copia rápida de OLIMPO, USUARIOS, UNIDADES...
const TROZO_CACHE = 40000                // tamaño de cada trozo guardado en memoria

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
          invalidarLectura_(sheetUsuarios) // NUEVO: que el login lea ya la contraseña nueva
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
    // "SIENDO CONTADO POR" también por POST (la app usa GET)
    // ================================================
    if (data.ACCION === "EN_CONTEO") {
      return respuestaJSON_(enConteo_(data))
    }

    // ================================================
    // GUARDAR CONTEO (INVENTARIO_MER, INVENTARIO_FAR o INVENTARIO_BC)
    // ================================================
    const t0 = Date.now()
    const sheetName = nombreHojaSucursal_(data.SUCURSAL)

    // Si este mismo envío (mismo ID_REGISTRO) ya se guardó antes,
    // responder éxito SIN escribir otra fila (reintento de la app).
    const idRegistro = (data.ID_REGISTRO || '').toString().trim()
    // La app 2.9+ manda INTENTO (1 = primer envío). Si no viene (app anterior),
    // se trata como posible reintento y se revisa la hoja, como siempre.
    const intento = data.INTENTO === undefined ? 0 : (Number(data.INTENTO) || 0)
    const cache = CacheService.getScriptCache()
    if (idRegistro && data.ACCION !== "ACTUALIZAR" && cache.get('ID_' + idRegistro)) {
      return ContentService.createTextOutput(
        JSON.stringify({ success: true, message: "Conteo registrado exitosamente", id: data.ID_REGISTRO, duplicado: true })
      ).setMimeType(ContentService.MimeType.JSON)
    }

    // ---- Todo lo que se puede preparar FUERA del candado ----
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName)

    if (!sheet) {
      return ContentService.createTextOutput(
        JSON.stringify({ success: false, message: "No se encontró la hoja " + sheetName })
      ).setMimeType(ContentService.MimeType.JSON)
    }

    const lastCol = sheet.getLastColumn()
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0]

    // Posible reintento: ¿ya está en la hoja? (solo lectura, no ocupa el candado)
    // En el PRIMER envío de la app nueva no hace falta y se ahorra tiempo.
    if (idRegistro && intento !== 1 && data.ACCION !== "ACTUALIZAR" && idEnHoja_(sheet, headers, idRegistro)) {
      cache.put('ID_' + idRegistro, '1', 21600)
      return ContentService.createTextOutput(
        JSON.stringify({ success: true, message: "Conteo registrado exitosamente", id: data.ID_REGISTRO, duplicado: true })
      ).setMimeType(ContentService.MimeType.JSON)
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

    // ---- Escritura EN LOTE ----
    // 1) Mi fila se anota en una lista de espera (toma milisegundos).
    // 2) Al que le toca el turno escribe TODAS las filas en espera de una sola vez.
    //    Así 10 conteos simultáneos tardan casi lo mismo que 1.
    // Cada envío conserva su propia fila: si la lista se perdiera, la escribe él mismo.
    const claveCola = 'COLA_' + sheet.getSheetId()
    if (data.ACCION !== "ACTUALIZAR" && idRegistro) encolar_(claveCola, { id: idRegistro, row: row })

    const lock = LockService.getScriptLock()
    const tEspera = Date.now()
    if (!lock.tryLock(ESPERA_CANDADO_MS)) {
      // Mientras esperaba, otro envío pudo escribir mi fila dentro de su lote
      if (idRegistro && cache.get('ID_' + idRegistro)) {
        return ContentService.createTextOutput(
          JSON.stringify({ success: true, message: "Conteo registrado exitosamente", id: data.ID_REGISTRO, lote: true })
        ).setMimeType(ContentService.MimeType.JSON)
      }
      // Me rindo: saco mi fila de la lista para que no se escriba después sin avisar
      // (la app reintentará y la volverá a anotar)
      if (idRegistro) quitarDeCola_(claveCola, idRegistro)
      if (idRegistro && cache.get('ID_' + idRegistro)) {
        return ContentService.createTextOutput(
          JSON.stringify({ success: true, message: "Conteo registrado exitosamente", id: data.ID_REGISTRO, lote: true })
        ).setMimeType(ContentService.MimeType.JSON)
      }
      console.warn(JSON.stringify({ evento: 'OCUPADO', id: idRegistro, intento: intento, esperaMs: Date.now() - tEspera }))
      return ContentService.createTextOutput(
        JSON.stringify({ success: false, code: "OCUPADO", message: "Servidor ocupado, intenta de nuevo" })
      ).setMimeType(ContentService.MimeType.JSON)
    }
    const esperaMs = Date.now() - tEspera
    let escrituraMs = 0
    let filasEnLote = 0

    try {
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
              SpreadsheetApp.flush() // asegurar que quedó escrito antes de responder
              invalidarLectura_(sheet)
              return ContentService.createTextOutput(
                JSON.stringify({ success: true, message: "Cantidad actualizada", id: data.ID_REGISTRO })
              ).setMimeType(ContentService.MimeType.JSON)
            }
          }
        }
      }

      // Ya con el turno: ¿otro envío escribió mi fila en su lote mientras esperaba?
      if (idRegistro && data.ACCION !== "ACTUALIZAR" && cache.get('ID_' + idRegistro)) {
        return ContentService.createTextOutput(
          JSON.stringify({ success: true, message: "Conteo registrado exitosamente", id: data.ID_REGISTRO, lote: true })
        ).setMimeType(ContentService.MimeType.JSON)
      }

      // Tomar TODAS las filas en espera (incluida la mía)
      let lote = (data.ACCION !== "ACTUALIZAR" && idRegistro) ? tomarCola_(claveCola) : []
      if (!lote.some(x => x.id === idRegistro)) {
        // Mi fila no está en la lista (se perdió o ya la tomó otro lote):
        // si ya está en la hoja, listo; si no, la escribo yo.
        if (idRegistro && data.ACCION !== "ACTUALIZAR" && idEnHoja_(sheet, headers, idRegistro)) {
          cache.put('ID_' + idRegistro, '1', 21600)
          return ContentService.createTextOutput(
            JSON.stringify({ success: true, message: "Conteo registrado exitosamente", id: data.ID_REGISTRO, duplicado: true })
          ).setMimeType(ContentService.MimeType.JSON)
        }
        lote.push({ id: idRegistro, row: row })
      }

      // Quitar repetidos y los que ya se escribieron antes
      const yaEscritos = cache.getAll(lote.filter(x => x.id).map(x => 'ID_' + x.id))
      const vistos = {}
      lote = lote.filter(x => {
        if (!x.id) return true
        if (vistos[x.id] || yaEscritos['ID_' + x.id]) return false
        vistos[x.id] = true
        return true
      })

      const tEscritura = Date.now()
      if (lote.length) {
        const ancho = Math.max.apply(null, lote.map(x => x.row.length))
        const filas = lote.map(x => { const f = x.row.slice(); while (f.length < ancho) f.push(''); return f })
        const desde = sheet.getLastRow() + 1
        // Si la hoja no tiene filas vacías suficientes al final, agregarlas
        // (appendRow lo hacía solo; escribir en bloque no)
        const faltan = desde + filas.length - 1 - sheet.getMaxRows()
        if (faltan > 0) sheet.insertRowsAfter(sheet.getMaxRows(), faltan)
        sheet.getRange(desde, 1, filas.length, ancho).setValues(filas) // todas de una vez
        SpreadsheetApp.flush() // asegurar que quedaron escritas antes de responder
        const marcas = {}
        lote.forEach(x => { if (x.id) marcas['ID_' + x.id] = '1' })
        cache.putAll(marcas, 21600) // recordar 6 h para reintentos
      }
      escrituraMs = Date.now() - tEscritura
      filasEnLote = lote.length

    } finally {
      lock.releaseLock()
    }

    invalidarLectura_(sheet) // la app verá las filas nuevas en la siguiente lectura

    const tiempos = { esperaTurnoMs: esperaMs, escrituraMs: escrituraMs, filasEnLote: filasEnLote, totalMs: Date.now() - t0 }
    console.log(JSON.stringify({ evento: 'GUARDADO', id: idRegistro, hoja: sheetName, intento: intento, tiempos: tiempos }))

    return ContentService.createTextOutput(
      JSON.stringify({ success: true, message: "Conteo registrado exitosamente", id: data.ID_REGISTRO, tiempos: tiempos })
    ).setMimeType(ContentService.MimeType.JSON)

  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, message: "Error: " + error.toString() })
    ).setMimeType(ContentService.MimeType.JSON)
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {}

  // "este código está siendo contado por..."
  if (p.accion === 'en_conteo') {
    return respuestaJSON_(enConteo_({
      MODO: p.modo, SUCURSAL: p.sucursal, CODIGO: p.codigo, USUARIO: p.usuario
    }))
  }

  // NUEVO: leer una hoja COMPLETA (aunque tenga filtros aplicados)
  if (p.accion === 'leer') {
    return respuestaJSON_(leerHoja_(p))
  }

  // NUEVO: ¿ya llegó este conteo? (para no reenviarlo a ciegas)
  if (p.accion === 'verificar') {
    return respuestaJSON_(verificarId_(p))
  }

  // Igual que antes (+ success y version para comprobar qué script está publicado)
  return ContentService.createTextOutput(
    JSON.stringify({ status: "OK", message: "Servicio funcionando correctamente", success: true, version: VERSION_SCRIPT })
  ).setMimeType(ContentService.MimeType.JSON)
}

// ================================================
// Hoja de conteo según la sucursal (misma regla de siempre)
// ================================================
function nombreHojaSucursal_(valor) {
  const sucursal = (valor || '').toString().toLowerCase().trim()
  if (sucursal === 'mercado') return 'INVENTARIO_MER'
  if (sucursal === 'bodega') return 'INVENTARIO_BC'
  return 'INVENTARIO_FAR'
}

// ================================================
// LISTA DE ESPERA PARA ESCRIBIR EN LOTE
// Usa un candado distinto y muy corto (solo para anotar/tomar de la lista),
// así anotarse nunca espera a que termine una escritura.
// ================================================
function candadoCola_() {
  return LockService.getDocumentLock() || LockService.getUserLock()
}

function encolar_(clave, item) {
  const l = candadoCola_()
  try {
    if (!l.tryLock(10000)) return false
    const cache = CacheService.getScriptCache()
    let cola = []
    try { cola = JSON.parse(cache.get(clave) || '[]') } catch (err) { cola = [] }
    cola.push(item)
    cache.put(clave, JSON.stringify(cola), 600)
    return true
  } catch (err) {
    return false // si no se pudo anotar, el envío escribirá su fila él mismo
  } finally {
    try { l.releaseLock() } catch (err) {}
  }
}

function quitarDeCola_(clave, id) {
  const l = candadoCola_()
  try {
    if (!l.tryLock(10000)) return
    const cache = CacheService.getScriptCache()
    let cola = []
    try { cola = JSON.parse(cache.get(clave) || '[]') } catch (err) { cola = [] }
    const resto = cola.filter(x => x.id !== id)
    if (resto.length) cache.put(clave, JSON.stringify(resto), 600)
    else cache.remove(clave)
  } catch (err) {
  } finally {
    try { l.releaseLock() } catch (err) {}
  }
}

function tomarCola_(clave) {
  const l = candadoCola_()
  try {
    if (!l.tryLock(10000)) return []
    const cache = CacheService.getScriptCache()
    let cola = []
    try { cola = JSON.parse(cache.get(clave) || '[]') } catch (err) { cola = [] }
    cache.remove(clave)
    return Array.isArray(cola) ? cola : []
  } catch (err) {
    return []
  } finally {
    try { l.releaseLock() } catch (err) {}
  }
}

// ¿Este ID_REGISTRO ya está en las últimas filas de la hoja?
function idEnHoja_(sheet, headers, idRegistro) {
  const colId = headers.findIndex(h => h.toString().trim() === "ID_REGISTRO")
  const ultimaFila = sheet.getLastRow()
  if (colId < 0 || ultimaFila < 2) return false
  const desde = Math.max(2, ultimaFila - FILAS_REVISION_DUPLICADOS + 1)
  const ids = sheet.getRange(desde, colId + 1, ultimaFila - desde + 1, 1).getValues()
  for (let i = ids.length - 1; i >= 0; i--) {
    if (ids[i][0].toString().trim() === idRegistro) return true
  }
  return false
}

// ================================================
// NUEVO: ¿ya llegó este conteo?  ?accion=verificar&id=...&sucursal=...
// ================================================
function verificarId_(p) {
  try {
    const id = (p.id || '').toString().trim()
    if (!id) return { success: false, message: 'Falta id' }
    const cache = CacheService.getScriptCache()
    if (cache.get('ID_' + id)) return { success: true, encontrado: true }
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombreHojaSucursal_(p.sucursal))
    if (!sheet) return { success: false, message: 'Hoja no encontrada' }
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    const encontrado = idEnHoja_(sheet, headers, id)
    if (encontrado) cache.put('ID_' + id, '1', 21600)
    return { success: true, encontrado: encontrado }
  } catch (error) {
    return { success: false, message: "Error: " + error.toString() }
  }
}

// ================================================
// NUEVO: LEER UNA HOJA COMPLETA  ?accion=leer&hoja=NOMBRE  o  &gid=NUMERO
// Entrega TODAS las filas tal como se ven (texto), aunque haya filtros.
// Guarda una copia rápida en memoria para no leer la hoja en cada consulta.
// ================================================
function leerHoja_(p) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet()
    let sheet = p.hoja ? ss.getSheetByName(p.hoja.toString()) : null
    if (!sheet && p.gid !== undefined && p.gid !== '') {
      const gid = Number(p.gid)
      sheet = ss.getSheets().find(s => s.getSheetId() === gid) || null
    }
    if (!sheet) return { success: false, message: 'Hoja no encontrada' }

    const gid = sheet.getSheetId()
    const clave = 'LEER_' + gid
    const enMemoria = leerCacheGrande_(clave)
    if (enMemoria) return { success: true, gid: gid, hoja: sheet.getName(), filas: enMemoria, copia: true }

    const filas = sheet.getDataRange().getDisplayValues()
    const esConteo = /^INVENTARIO_(MER|FAR|BC)$/.test(sheet.getName())
    guardarCacheGrande_(clave, filas, esConteo ? LECTURA_TTL_CONTEOS_S : LECTURA_TTL_OTRAS_S)

    return { success: true, gid: gid, hoja: sheet.getName(), filas: filas }
  } catch (error) {
    return { success: false, message: "Error: " + error.toString() }
  }
}

function invalidarLectura_(sheet) {
  try { CacheService.getScriptCache().remove('LEER_' + sheet.getSheetId()) } catch (err) {}
}

// Guarda un valor grande en la memoria del script, partido en trozos
function guardarCacheGrande_(clave, valor, ttl) {
  try {
    const texto = JSON.stringify(valor)
    if (texto.length > TROZO_CACHE * 60) return // demasiado grande: no se guarda copia
    const marca = Utilities.getUuid().slice(0, 8)
    const n = Math.max(1, Math.ceil(texto.length / TROZO_CACHE))
    const partes = {}
    for (let i = 0; i < n; i++) partes[clave + '_' + marca + '_' + i] = texto.substr(i * TROZO_CACHE, TROZO_CACHE)
    const cache = CacheService.getScriptCache()
    cache.putAll(partes, ttl)
    cache.put(clave, marca + ':' + n, ttl)
  } catch (err) {}
}

function leerCacheGrande_(clave) {
  try {
    const cache = CacheService.getScriptCache()
    const meta = cache.get(clave)
    if (!meta) return null
    const marca = meta.split(':')[0]
    const n = Number(meta.split(':')[1])
    if (!n) return null
    const claves = []
    for (let i = 0; i < n; i++) claves.push(clave + '_' + marca + '_' + i)
    const trozos = cache.getAll(claves)
    let texto = ''
    for (let i = 0; i < claves.length; i++) {
      if (trozos[claves[i]] === undefined || trozos[claves[i]] === null) return null
      texto += trozos[claves[i]]
    }
    return JSON.parse(texto)
  } catch (err) {
    return null
  }
}

// ================================================
// "SIENDO CONTADO POR"
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
