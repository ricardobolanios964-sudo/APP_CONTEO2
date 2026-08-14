/**
 * SHEETS-API.JS
 * Reemplaza app/sheetsmodel.php - todas las funciones para leer y
 * escribir en Google Sheets, ahora corriendo directo en el navegador.
 */

const SheetsAPI = {

    // ================================================
    // LECTURA - CSV público (igual método que usaba PHP)
    // ================================================

    /**
     * Descarga y parsea el CSV de una hoja (por GID). Usa caché en
     * localStorage con expiración, igual que hacía PHP con archivos.
     */
    async _fetchCSV(gid, ttlSeconds) {
        const cacheKey = `bolanos_csv_${gid}`;

        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.timestamp < ttlSeconds * 1000) {
                    return parsed.data;
                }
            }
        } catch (e) { /* si el caché está corrupto, seguimos y lo pisamos */ }

        const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/export?format=csv&gid=${gid}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`No se pudo leer la hoja (HTTP ${response.status}). Verifica que el documento esté compartido como "Cualquiera con el enlace puede ver".`);
        }

        const texto = await response.text();

        if (texto.trim().toLowerCase().startsWith('<!doctype') || texto.trim().toLowerCase().startsWith('<html')) {
            throw new Error('Google devolvió una página HTML en vez de datos. Verifica que el documento esté compartido públicamente.');
        }

        const data = this._parseCSV(texto);

        try {
            localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data }));
        } catch (e) { /* si se llena el localStorage, no pasa nada grave */ }

        return data;
    },

    /**
     * Parser de CSV manual (soporta comas y saltos de línea dentro de comillas)
     */
    _parseCSV(texto) {
        const filas = [];
        let fila = [];
        let campo = '';
        let entreComillas = false;

        for (let i = 0; i < texto.length; i++) {
            const c = texto[i];
            const siguiente = texto[i + 1];

            if (entreComillas) {
                if (c === '"' && siguiente === '"') { campo += '"'; i++; }
                else if (c === '"') { entreComillas = false; }
                else { campo += c; }
            } else {
                if (c === '"') { entreComillas = true; }
                else if (c === ',') { fila.push(campo); campo = ''; }
                else if (c === '\r') { /* ignorar */ }
                else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
                else { campo += c; }
            }
        }
        if (campo.length > 0 || fila.length > 0) { fila.push(campo); filas.push(fila); }

        return filas.filter(f => f.some(v => v !== ''));
    },

    _toNumber(valor) {
        if (!valor) return 0;
        const limpio = String(valor).replace(/[$,]/g, '').replace(/\s/g, '');
        const n = parseFloat(limpio);
        return isNaN(n) ? 0 : n;
    },

    _limpiarCache(gid) {
        localStorage.removeItem(`bolanos_csv_${gid}`);
    },

    // ================================================
    // USUARIOS
    // ================================================

    async getUsuarios() {
        const filas = await this._fetchCSV(CONFIG.GID_USUARIOS, CONFIG.CACHE_TTL_USUARIOS);
        const datos = filas.slice(1); // quitar encabezados

        return datos
            .filter(r => r[0] && r[0].trim())
            .map(r => ({
                usuario: (r[0] || '').trim(),
                contrasena: (r[1] || '').trim(),
                rol: (r[2] || 'usuario').trim()
            }));
    },

    // ================================================
    // OLIMPO (inventario)
    // ================================================

    async getInventario() {
        const filas = await this._fetchCSV(CONFIG.GID_OLIMPO, CONFIG.CACHE_TTL_OLIMPO);
        const datos = filas.slice(1);

        return datos
            .filter(r => r[0] && r[0].trim())
            .map(r => ({
                codigo: (r[0] || '').trim(),
                nombre: (r[1] || '').trim(),
                lote: (r[2] || '').trim(),
                ubicacion: (r[3] || '').trim(),
                saldo: this._toNumber(r[4]),
                categoria: (r[5] || '').trim(),
                marca: (r[6] || '').trim(),
                presentaciones: (r[7] || '').trim(),
                unidades: (r[8] || '').trim(),
                codigo_barra_1: (r[9] || '').trim(),
                codigo_barra_2: (r[10] || '').trim(),
                costo_promedio: this._toNumber(r[11]),
                precio_default: this._toNumber(r[12]),
                precio_lista: this._toNumber(r[13]),
                precio_factor_g: this._toNumber(r[14]),
            }));
    },

    /**
     * Búsqueda con relevancia - misma lógica que sheetsmodel.php
     */
    async buscarProducto(termino, tipoBusqueda = 'all') {
        const inventario = await this.getInventario();
        const t = termino.toLowerCase().trim();
        const resultados = [];

        for (const producto of inventario) {
            let match = false;
            let relevancia = 0;

            if (tipoBusqueda === 'codigo' || tipoBusqueda === 'all') {
                if (producto.codigo.toLowerCase().indexOf(t) === 0) {
                    match = true; relevancia = 5;
                }
            }
            if (tipoBusqueda === 'barcode' || (tipoBusqueda === 'all' && t.length >= 8)) {
                if (producto.codigo_barra_1 === t || producto.codigo_barra_2 === t) {
                    match = true; relevancia = 6;
                }
            }
            if (tipoBusqueda === 'nombre' || tipoBusqueda === 'all') {
                const idx = producto.nombre.toLowerCase().indexOf(t);
                if (idx !== -1) {
                    match = true;
                    relevancia = Math.max(relevancia, idx === 0 ? 4 : 3);
                }
            }
            if (tipoBusqueda === 'marca' || tipoBusqueda === 'all') {
                if (producto.marca.toLowerCase().indexOf(t) !== -1) {
                    match = true; relevancia = Math.max(relevancia, 2);
                }
            }
            if (tipoBusqueda === 'categoria' || tipoBusqueda === 'all') {
                if (producto.categoria.toLowerCase().indexOf(t) !== -1) {
                    match = true; relevancia = Math.max(relevancia, 1);
                }
            }

            if (match) resultados.push({ ...producto, _relevancia: relevancia });
        }

        resultados.sort((a, b) => b._relevancia - a._relevancia);
        resultados.forEach(r => delete r._relevancia);
        return resultados;
    },

    // ================================================
    // CONTEOS YA REGISTRADOS (Resumen + verificación de duplicados)
    // ================================================

    _extraerUsuarioDeId(idRegistro) {
        if (idRegistro.indexOf('-') !== -1) {
            const partes = idRegistro.split('-');
            return partes[partes.length - 1].toLowerCase();
        }
        const m = idRegistro.match(/^([a-zA-Z]+)(\d+)$/);
        return m ? m[1].toLowerCase() : null;
    },

    async getConteosPorUsuario(gid) {
        if (!gid) return { success: false, mensaje: 'Falta configurar el GID de esta hoja', conteos: {}, total: 0 };

        try {
            const filas = await this._fetchCSV(gid, CONFIG.CACHE_TTL_CONTEOS);
            const datos = filas.slice(1);
            const conteosPorUsuario = {};
            let total = 0;

            for (const row of datos) {
                const idRegistro = (row[0] || '').trim();
                if (!idRegistro) continue;
                const usuario = this._extraerUsuarioDeId(idRegistro);
                if (usuario) {
                    conteosPorUsuario[usuario] = (conteosPorUsuario[usuario] || 0) + 1;
                    total++;
                }
            }

            // Ordenar de mayor a menor
            const ordenado = Object.fromEntries(
                Object.entries(conteosPorUsuario).sort((a, b) => b[1] - a[1])
            );

            return { success: true, mensaje: 'OK', conteos: ordenado, total };
        } catch (e) {
            return { success: false, mensaje: e.message, conteos: {}, total: 0 };
        }
    },

    async verificarCodigoRegistrado(gid, codigo) {
        if (!gid || !codigo) return { configurado: false, ya_registrado: false, veces: 0 };

        try {
            const filas = await this._fetchCSV(gid, CONFIG.CACHE_TTL_CONTEOS);
            const datos = filas.slice(1);
            const headers = filas[0].map(h => h.trim());
            const colCodigo = headers.indexOf('CODIGO');
            if (colCodigo === -1) return { configurado: false, ya_registrado: false, veces: 0 };

            const codigoBuscado = codigo.toUpperCase().trim();
            let veces = 0;
            for (const row of datos) {
                if ((row[colCodigo] || '').toUpperCase().trim() === codigoBuscado) veces++;
            }

            return { configurado: true, ya_registrado: veces > 0, veces };
        } catch (e) {
            return { configurado: false, ya_registrado: false, veces: 0 };
        }
    },

    // ================================================
    // REPORTES
    // ================================================

    async getDatosReporte(gid) {
        if (!gid) return { success: false, mensaje: 'Falta configurar el GID de esta hoja', filas: [] };

        try {
            const filas = await this._fetchCSV(gid, 0); // sin caché, siempre fresco
            const headers = filas[0].map(h => h.trim());
            const datos = filas.slice(1);

            const col = (nombre) => {
                const idx = headers.indexOf(nombre);
                return idx !== -1 ? idx : null;
            };

            const colId = col('ID_REGISTRO');
            const colFecha = col('FECHA');
            const colHora = col('HORA INCIO');
            const colCodigo = col('CODIGO');
            const colCantidad = col('CANTIDAD_FISICA');
            const colObs = col('OBSERVACIONES');

            const resultado = [];

            for (const row of datos) {
                const idRegistro = (row[colId] || '').trim();
                if (!idRegistro) continue;

                const usuario = this._extraerUsuarioDeId(idRegistro);
                const fecha = colFecha !== null ? (row[colFecha] || '').trim() : '';
                const hora = colHora !== null ? (row[colHora] || '').trim() : '';

                resultado.push({
                    codigo_producto: colCodigo !== null ? (row[colCodigo] || '').trim() : '',
                    codigo_ubicacion: '',
                    posicion: '',
                    cantidad_contada: colCantidad !== null ? (row[colCantidad] || '').trim() : '',
                    codigo_empleado: usuario ? usuario.toUpperCase() : '',
                    fecha_hora_contado: (fecha + ' ' + hora).trim(),
                    lote: '',
                    serie: '',
                    observaciones: colObs !== null ? (row[colObs] || '').trim() : '',
                });
            }

            return { success: true, mensaje: 'OK', filas: resultado };
        } catch (e) {
            return { success: false, mensaje: e.message, filas: [] };
        }
    },

    // ================================================
    // ESCRITURA - vía Apps Script Web App (doPost)
    // ================================================

    _generarIdRegistro(usuario, tipo) {
        const prefijo = tipo === 'mercado' ? 'MERC' : 'FARM';
        const ahora = new Date();
        const yy = String(ahora.getFullYear()).slice(-2);
        const mm = String(ahora.getMonth() + 1).padStart(2, '0');
        const dd = String(ahora.getDate()).padStart(2, '0');
        const hh = String(ahora.getHours()).padStart(2, '0');
        const mi = String(ahora.getMinutes()).padStart(2, '0');
        const aleatorio = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
        const usuarioLimpio = usuario.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

        return `${prefijo}-${yy}${mm}${dd}-${hh}${mi}-${aleatorio}-${usuarioLimpio}`;
    },

    /**
     * Envía el conteo al Apps Script. Igual que en PHP: si Google no
     * responde a tiempo (o bloquea la lectura por CORS), lo tratamos
     * como éxito probable, porque el script YA ejecuta y guarda ANTES
     * de intentar responder - un problema leyendo la respuesta no
     * significa que no se guardó.
     */
    async guardarConteo(datos, usuario, tipo) {
        const idRegistro = this._generarIdRegistro(usuario, tipo);
        const ahora = new Date();
        const fecha = `${String(ahora.getDate()).padStart(2, '0')}/${String(ahora.getMonth() + 1).padStart(2, '0')}/${ahora.getFullYear()}`;
        const horaFin = ahora.toTimeString().slice(0, 8);
        const horaInicio = datos.hora_inicio || horaFin;

        const payload = {
            SUCURSAL: tipo,
            ID_REGISTRO: idRegistro,
            FECHA: fecha,
            'HORA INCIO': horaInicio,
            'HORA FIN': horaFin,
            CODIGO: datos.codigo || '',
            NOMBRE: datos.nombre || '',
            MARCA: datos.marca || '',
            EXISTENCIA_SISTEMA: datos.existencia_sistema ?? '',
            CANTIDAD_FISICA: datos.cantidad_fisica ?? '',
            VENCE: datos.vence || '',
            PVP_PUBLICO: datos.pvp_publico ?? '',
            PRECIO_DNM: datos.precio_dnm ?? '',
            OBSERVACIONES: datos.observaciones || '',
            ESTATUS: datos.estatus || 'Registrado',
        };

        const gidSucursal = tipo === 'mercado' ? CONFIG.GID_INVENTARIO_MER : CONFIG.GID_INVENTARIO_FAR;

        try {
            // text/plain evita el preflight CORS con Apps Script
            const response = await fetch(CONFIG.WEBAPP_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload),
            });

            const data = await response.json();
            this._limpiarCache(gidSucursal);

            return {
                success: data.success !== false,
                id: idRegistro,
                fecha, hora_inicio: horaInicio, hora_fin: horaFin,
                mensaje: data.message || 'Conteo registrado',
            };
        } catch (e) {
            console.warn('No se pudo leer la respuesta de Apps Script, asumiendo éxito:', e);
            this._limpiarCache(gidSucursal);

            return {
                success: true,
                id: idRegistro,
                fecha, hora_inicio: horaInicio, hora_fin: horaFin,
                mensaje: 'Conteo registrado',
            };
        }
    },

    /**
     * Cambia la contraseña temporal (000000) por una definitiva
     */
    async cambiarPassword(usuario, nuevaPassword) {
        const payload = {
            ACCION: 'CAMBIAR_PASSWORD',
            USUARIO: usuario,
            NUEVA_PASSWORD: nuevaPassword,
        };

        try {
            const response = await fetch(CONFIG.WEBAPP_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            this._limpiarCache(CONFIG.GID_USUARIOS);
            return { success: data.success !== false, mensaje: data.message || 'Contraseña actualizada' };
        } catch (e) {
            console.warn('No se pudo leer la respuesta al cambiar contraseña, asumiendo éxito:', e);
            this._limpiarCache(CONFIG.GID_USUARIOS);
            return { success: true, mensaje: 'Contraseña actualizada' };
        }
    },
};
