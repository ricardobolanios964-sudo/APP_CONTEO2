/**
 * SCRIPT CONTEO - Gestión de búsqueda y conteo de inventario
 */

class ConteoManager {
    
    constructor() {
        // Exigir sesión activa (reemplaza require_login() de PHP)
        Auth.exigirLogin();
        
        // El tipo (mercado/farmacia) viene por parámetro en la URL,
        // ej: conteo.html?tipo=mercado
        const params = new URLSearchParams(window.location.search);
        this.tipo = (params.get('tipo') || 'mercado').toLowerCase();
        if (!['mercado', 'farmacia'].includes(this.tipo)) this.tipo = 'mercado';
        
        this.gidSucursal = this.tipo === 'mercado' ? CONFIG.GID_INVENTARIO_MER : CONFIG.GID_INVENTARIO_FAR;
        
        this._pintarTitulo();
        
        this.conteos = [];
        this.productoSeleccionado = null;
        this.horaInicioConteo = null; // Se marca al seleccionar producto, no al iniciar sesión
        this.modoBarcode = false; // Se activa al presionar el botón flotante de código de barras
        this.venceMes = null; // Mes seleccionado en la rueda (1-12)
        this.venceAnio = null; // Año seleccionado en la rueda
        this.init();
    }
    
    _pintarTitulo() {
        const tituloEl = document.getElementById('titulo-tipo');
        const tipoLabelEl = document.getElementById('tipo-label');
        const nombreEl = document.getElementById('dropdown-usuario-nombre');
        if (tituloEl) tituloEl.textContent = this.tipo.toUpperCase();
        if (tipoLabelEl) tipoLabelEl.textContent = this.tipo.charAt(0).toUpperCase() + this.tipo.slice(1);
        if (nombreEl) nombreEl.textContent = Auth.getUsuarioActual();
    }
    
    init() {
        this.setupEventListeners();
        this.initVenceWheel();
        this.ajustarOffsetBuscador();
        this.actualizarContador(); // Carga el número real al entrar a la pantalla
    }
    
    /**
     * Mide la altura real del header y la guarda como variable CSS
     * (--header-h). Así el buscador sticky sabe exactamente dónde
     * "aterrizar" debajo del header, sin importar el tamaño de pantalla
     * ni si el título ocupa 1 o 2 líneas. Se recalcula también si el
     * usuario gira el celular o cambia el tamaño de ventana.
     */
    ajustarOffsetBuscador() {
        const header = document.getElementById('conteo-topbar');
        if (!header) return;
        
        const aplicar = () => {
            const alto = header.offsetHeight;
            document.documentElement.style.setProperty('--header-h', alto + 'px');
        };
        
        aplicar();
        window.addEventListener('resize', aplicar);
        // Por si las fuentes tardan en cargar y cambian la altura del texto
        window.addEventListener('load', aplicar);
    }
    
    // ================================================
    // EVENT LISTENERS
    // ================================================
    
    setupEventListeners() {
        // Búsqueda con debounce (espera 300ms de pausa antes de buscar,
        // así no se dispara una petición por cada tecla presionada)
        let debounceTimer = null;
        document.getElementById('search-input').addEventListener('input', (e) => {
            const valor = e.target.value;
            
            // Feedback visual inmediato de "escribiendo..."
            if (valor.trim().length > 0) {
                this.mostrarCargando();
            }
            
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                this.buscar(valor);
            }, 300);
        });
        
        document.getElementById('btn-clear-search').addEventListener('click', () => {
            document.getElementById('search-input').value = '';
            document.getElementById('search-input').focus();
            this.limpiarResultados();
        });
        
        // Botón flotante de código de barras - abre la cámara del celular
        const fabBarcode = document.getElementById('fab-barcode');
        if (fabBarcode) {
            fabBarcode.addEventListener('click', () => {
                this.abrirEscanerCamara();
            });
        }
        
        const btnCloseScanner = document.getElementById('btn-close-scanner');
        if (btnCloseScanner) {
            btnCloseScanner.addEventListener('click', () => {
                this.cerrarEscanerCamara();
            });
        }
        
        // Formulario
        document.getElementById('btn-back').addEventListener('click', () => {
            window.location.href = 'dashboard.html';
        });
        
        // Menú hamburguesa
        const hamburgerBtn = document.getElementById('hamburger-btn');
        const dropdownMenu = document.getElementById('dropdown-menu');
        
        if (hamburgerBtn && dropdownMenu) {
            hamburgerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdownMenu.classList.toggle('open');
                hamburgerBtn.classList.toggle('active');
            });
            
            document.addEventListener('click', (e) => {
                if (!dropdownMenu.contains(e.target) && !hamburgerBtn.contains(e.target)) {
                    dropdownMenu.classList.remove('open');
                    hamburgerBtn.classList.remove('active');
                }
            });
        }
        
        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', (e) => {
                e.preventDefault();
                if (confirm('¿Desea cerrar sesión?')) {
                    Auth.cerrarSesion();
                }
            });
        }
        
        document.getElementById('btn-close-form').addEventListener('click', () => {
            this.intentarCerrarFormulario();
        });
        
        document.getElementById('btn-form-cancel').addEventListener('click', () => {
            this.intentarCerrarFormulario();
        });
        
        // Checkbox "No aplica fecha de vencimiento"
        const checkNoVence = document.getElementById('check-no-vence');
        if (checkNoVence) {
            checkNoVence.addEventListener('change', () => {
                const picker = document.getElementById('vence-wheel-picker');
                picker.classList.toggle('disabled', checkNoVence.checked);
            });
        }
        
        document.getElementById('conteo-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.guardarConteo();
        });
        
        // Cantidad
        document.getElementById('form-cantidad').addEventListener('input', () => {
            this.calcularDiferencia();
        });
        
        document.getElementById('btn-qty-plus').addEventListener('click', (e) => {
            e.preventDefault();
            const input = document.getElementById('form-cantidad');
            const nuevoValor = (parseFloat(input.value) || 0) + 1;
            input.value = this.redondear(nuevoValor);
            input.dispatchEvent(new Event('input'));
        });
        
        document.getElementById('btn-qty-minus').addEventListener('click', (e) => {
            e.preventDefault();
            const input = document.getElementById('form-cantidad');
            const nuevoValor = Math.max(0, (parseFloat(input.value) || 0) - 1);
            input.value = this.redondear(nuevoValor);
            input.dispatchEvent(new Event('input'));
        });
    }
    
    /**
     * Redondea a 5 decimales y limpia errores de precisión de punto
     * flotante de JS (ej: 0.1 + 0.2 = 0.30000000000000004)
     */
    redondear(numero) {
        return parseFloat(numero.toFixed(5));
    }
    
    // ================================================
    // BÚSQUEDA
    // ================================================
    
    async buscar(termino) {
        termino = termino.trim();
        const btnClear = document.getElementById('btn-clear-search');
        const productsList = document.getElementById('products-list');
        
        if (termino.length === 0) {
            btnClear.style.display = 'none';
            this.limpiarResultados();
            return;
        }
        
        btnClear.style.display = 'flex';
        
        try {
            // Búsqueda inteligente: "all" detecta automáticamente código, nombre, marca o categoría.
            // Si el usuario activó el botón de código de barras, forzamos ese tipo.
            let tipo = this.modoBarcode ? 'barcode' : 'all';
            
            // También detecta automáticamente si escribe un número largo (código de barras)
            if (!this.modoBarcode && /^\d{8,}$/.test(termino)) {
                tipo = 'barcode';
            }
            
            const productos = await SheetsAPI.buscarProducto(termino, tipo);
            
            // Si hay exactamente 1 producto y venía de código de barras, seleccionar automáticamente
            if (productos.length === 1 && tipo === 'barcode') {
                this.modoBarcode = false;
                this.seleccionarProducto(productos[0]);
                return;
            }
            
            this.mostrarResultados(productos);
            
        } catch (error) {
            console.error('Error en búsqueda:', error);
            productsList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⚠️</div>
                    <p>${error.message || 'Error al buscar productos'}</p>
                </div>
            `;
        }
    }
    
    mostrarResultados(productos) {
        const productsList = document.getElementById('products-list');
        productsList.innerHTML = '';
        
        if (productos.length === 0) {
            productsList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📦</div>
                    <p>No se encontraron productos</p>
                </div>
            `;
            return;
        }
        
        productos.forEach(producto => {
            const card = this.crearTarjetaProducto(producto);
            productsList.appendChild(card);
        });
    }
    
    crearTarjetaProducto(producto) {
        const card = document.createElement('div');
        card.className = 'product-card';
        
        const seleccionado = this.productoSeleccionado && 
                            this.productoSeleccionado.codigo === producto.codigo ? 'selected' : '';
        
        if (seleccionado) {
            card.classList.add('selected');
        }
        
        card.innerHTML = `
            <div class="product-info">
                <div class="product-marca-small">${this.escapeHtml(producto.marca || 'Sin marca')}</div>
                <div class="product-codigo">${this.escapeHtml(producto.codigo)}</div>
                <div class="product-nombre">${this.escapeHtml(producto.nombre)}</div>
            </div>
            <div class="product-action">→</div>
        `;
        
        card.addEventListener('click', () => {
            this.seleccionarProducto(producto, card);
        });
        
        return card;
    }
    
    limpiarResultados() {
        const productsList = document.getElementById('products-list');
        
        productsList.innerHTML = `
            <div class="empty-state" id="empty-state">
                <div class="empty-icon">📦</div>
                <p>Empieza a escribir para ver los productos</p>
            </div>
        `;
    }
    
    mostrarCargando() {
        const productsList = document.getElementById('products-list');
        // Solo mostrar el spinner si no hay resultados ya mostrados (evita parpadeo)
        if (productsList.querySelector('.empty-state')) {
            productsList.innerHTML = `
                <div class="empty-state">
                    <div class="mini-spinner"></div>
                </div>
            `;
        }
    }
    
    // ================================================
    // SELECCIÓN DE PRODUCTO
    // ================================================
    
    seleccionarProducto(producto, cardElement = null) {
        this.productoSeleccionado = producto;
        
        // ⭐ AQUÍ se marca la HORA INICIO del conteo: justo cuando el usuario
        // hace click en el producto, NO cuando inició sesión.
        this.horaInicioConteo = new Date();
        
        // Actualizar tarjetas (si viene de un click real, resaltar la tarjeta)
        document.querySelectorAll('.product-card').forEach(card => {
            card.classList.remove('selected');
        });
        if (cardElement) {
            cardElement.classList.add('selected');
        }
        
        // Llenar formulario
        this.llenarFormulario(producto);
        
        // Mostrar formulario
        this.mostrarFormulario();
    }
    
    // ================================================
    // SELECTOR TIPO RUEDA - VENCIMIENTO (Mes / Año)
    // ================================================
    
    initVenceWheel() {
        const ITEM_H = 44;
        
        // Generar años dinámicamente: año actual hasta +10
        const wheelAnio = document.getElementById('wheel-anio');
        const anioActual = new Date().getFullYear();
        let anioHtml = '<div class="vence-wheel-pad"></div>';
        for (let a = anioActual; a <= anioActual + 10; a++) {
            anioHtml += `<div class="vence-wheel-item" data-value="${a}">${a}</div>`;
        }
        anioHtml += '<div class="vence-wheel-pad"></div>';
        wheelAnio.innerHTML = anioHtml;
        
        const wheelMes = document.getElementById('wheel-mes');
        
        // Función que detecta y marca el item centrado tras dejar de hacer scroll
        const conectarRueda = (col, propiedad) => {
            let timer = null;
            
            const actualizarSeleccion = () => {
                const domIndex = Math.round(col.scrollTop / ITEM_H);
                const item = col.children[domIndex];
                if (!item || !item.classList.contains('vence-wheel-item')) return;
                
                col.querySelectorAll('.vence-wheel-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                this[propiedad] = item.dataset.value;
            };
            
            col.addEventListener('scroll', () => {
                clearTimeout(timer);
                timer = setTimeout(actualizarSeleccion, 120);
            });
            
            col.addEventListener('scrollend', actualizarSeleccion);
            
            // Click directo en un item = saltar ahí
            col.querySelectorAll('.vence-wheel-item').forEach((item, idx) => {
                item.addEventListener('click', () => {
                    const domIndex = Array.from(col.children).indexOf(item);
                    col.scrollTo({ top: domIndex * ITEM_H, behavior: 'smooth' });
                });
            });
        };
        
        conectarRueda(wheelMes, 'venceMes');
        conectarRueda(wheelAnio, 'venceAnio');
        
        this.resetVenceWheel();
    }
    
    resetVenceWheel() {
        const ITEM_H = 44;
        const ahora = new Date();
        const mesActual = ahora.getMonth() + 1; // 1-12
        const anioActual = ahora.getFullYear();
        
        const wheelMes = document.getElementById('wheel-mes');
        const wheelAnio = document.getElementById('wheel-anio');
        
        // Posicionar (sin animación) en el mes/año actual
        wheelMes.scrollTop = mesActual * ITEM_H;
        wheelAnio.scrollTop = 0 * ITEM_H + ITEM_H; // primer año de la lista (año actual)
        
        wheelMes.querySelectorAll('.vence-wheel-item').forEach(el => {
            el.classList.toggle('selected', parseInt(el.dataset.value) === mesActual);
        });
        wheelAnio.querySelectorAll('.vence-wheel-item').forEach(el => {
            el.classList.toggle('selected', parseInt(el.dataset.value) === anioActual);
        });
        
        this.venceMes = String(mesActual);
        this.venceAnio = String(anioActual);
        
        // Resetear checkbox "No aplica"
        const checkNoVence = document.getElementById('check-no-vence');
        if (checkNoVence) {
            checkNoVence.checked = false;
            document.getElementById('vence-wheel-picker').classList.remove('disabled');
        }
    }
    
    // ================================================
    // CONFIRMACIÓN AL CERRAR (evitar perder datos sin querer)
    // ================================================
    
    hayDatosSinGuardar() {
        const cantidad = document.getElementById('form-cantidad').value.trim();
        const observaciones = document.getElementById('form-observaciones').value.trim();
        const pvp = document.getElementById('form-pvp').value.trim();
        const precioDnm = document.getElementById('form-precio-dnm').value.trim();
        const noVence = document.getElementById('check-no-vence').checked;
        
        return !!(cantidad || observaciones || pvp || precioDnm || noVence);
    }
    
    intentarCerrarFormulario() {
        // Siempre se pregunta antes de cerrar, sin importar si hay datos o no
        const modal = document.getElementById('modal-confirm');
        modal.querySelector('h3').textContent = '¿Salir sin guardar?';
        document.getElementById('confirm-message').textContent = 
            'Los datos de este conteo aún no se han guardado. Si sales ahora, se perderán.';
        
        const btnCancelar = document.getElementById('btn-confirm-cancel');
        const btnConfirmar = document.getElementById('btn-confirm-save');
        btnCancelar.textContent = 'Seguir editando';
        btnConfirmar.textContent = 'Sí, salir';
        
        modal.style.display = 'flex';
        
        // onclick sobrescribe cualquier handler anterior, evita duplicados
        btnCancelar.onclick = () => {
            modal.style.display = 'none';
        };
        btnConfirmar.onclick = () => {
            modal.style.display = 'none';
            this.cerrarFormulario();
        };
    }
    
    llenarFormulario(producto) {
        // Información del producto (solo lectura, texto no inputs)
        document.getElementById('form-codigo').textContent = producto.codigo || '—';
        document.getElementById('form-nombre').textContent = producto.nombre || '—';
        document.getElementById('form-marca').textContent = producto.marca || 'Sin marca';
        document.getElementById('form-categoria').textContent = producto.categoria || '—';
        document.getElementById('form-existencia').textContent = producto.saldo || 0;
        
        // Guardar existencia en un data-attribute para el cálculo de diferencia
        document.getElementById('form-existencia').dataset.valor = producto.saldo || 0;
        
        // Inicializar campos editables
        document.getElementById('form-cantidad').value = '';
        document.getElementById('form-pvp').value = '';
        document.getElementById('form-precio-dnm').value = '';
        document.getElementById('form-observaciones').value = '';
        document.getElementById('diferencia-box').style.display = 'none';
        // NOTA: el reset de la rueda de vencimiento se hace en mostrarFormulario(),
        // porque hacerlo aquí (con el modal aún oculto) no funciona: el navegador
        // no aplica correctamente scrollTop en elementos con display:none.
    }
    
    mostrarFormulario() {
        const overlay = document.getElementById('conteo-modal-overlay');
        overlay.style.display = 'flex';
        // Pequeño delay para permitir la animación de entrada
        requestAnimationFrame(() => {
            overlay.classList.add('open');
            // ⭐ Reset de la rueda AQUÍ, una vez el modal ya es visible,
            // para que el navegador pueda aplicar el scroll correctamente.
            this.resetVenceWheel();
        });
        setTimeout(() => {
            document.getElementById('form-cantidad').focus();
        }, 300);
        
        // Verificar en segundo plano si este producto ya fue contado antes
        // (no bloquea nada, solo informa - puede haber el mismo producto
        // en distintas ubicaciones y es válido contarlo de nuevo)
        this.verificarProductoYaContado();
    }
    
    async verificarProductoYaContado() {
        const banner = document.getElementById('ya-contado-banner');
        banner.style.display = 'none';
        
        const codigo = document.getElementById('form-codigo').textContent;
        if (!codigo || codigo === '—') return;
        
        try {
            const resultado = await SheetsAPI.verificarCodigoRegistrado(this.gidSucursal, codigo);
            
            if (resultado.configurado && resultado.ya_registrado) {
                const veces = resultado.veces;
                document.getElementById('ya-contado-texto').textContent = 
                    `Este producto ya fue contado ${veces} ${veces === 1 ? 'vez' : 'veces'}. Puedes registrar otro conteo si está en otra ubicación.`;
                banner.style.display = 'flex';
            }
        } catch (error) {
            // Si falla la verificación, simplemente no mostramos el aviso
            // (no bloqueamos ni interrumpimos el flujo del usuario)
            console.error('No se pudo verificar si el producto ya fue contado:', error);
        }
    }
    
    cerrarFormulario() {
        const overlay = document.getElementById('conteo-modal-overlay');
        overlay.classList.remove('open');
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 250);
        document.getElementById('search-input').focus();
        this.horaInicioConteo = null; // Se reinicia para el próximo producto
        this.productoSeleccionado = null;
    }
    
    // ================================================
    // CÁLCULO DE DIFERENCIA
    // ================================================
    
    calcularDiferencia() {
        const cantidad = parseFloat(document.getElementById('form-cantidad').value) || 0;
        const existencia = parseFloat(document.getElementById('form-existencia').dataset.valor) || 0;
        const diferencia = this.redondear(cantidad - existencia);
        const diferenciaBox = document.getElementById('diferencia-box');
        const diferenciaTexto = document.getElementById('diferencia-texto');
        
        if (cantidad === 0) {
            diferenciaBox.style.display = 'none';
            return;
        }
        
        diferenciaBox.style.display = 'block';
        
        if (diferencia === 0) {
            diferenciaBox.className = 'diferencia-box ok';
            diferenciaTexto.textContent = '✓ Cantidad coincide perfectamente con el sistema';
        } else if (diferencia > 0) {
            diferenciaBox.className = 'diferencia-box warning';
            diferenciaTexto.textContent = `⚠️ ${diferencia} unidad${diferencia !== 1 ? 'es' : ''} de más`;
        } else {
            diferenciaBox.className = 'diferencia-box error';
            diferenciaTexto.textContent = `❌ ${Math.abs(diferencia)} unidad${Math.abs(diferencia) !== 1 ? 'es' : ''} de menos`;
        }
    }
    
    // ================================================
    // GUARDAR CONTEO
    // ================================================
    
    async guardarConteo() {
        const cantidad = document.getElementById('form-cantidad').value;
        
        if (!cantidad || cantidad === '0') {
            this.mostrarError('Debe ingresar la cantidad contada');
            return;
        }
        
        // Formatear HORA INICIO capturada al momento de seleccionar el producto
        const horaInicioTexto = this.horaInicioConteo 
            ? this.formatearHora(this.horaInicioConteo) 
            : this.formatearHora(new Date());
        
        // VENCE: viene del checkbox "No aplica" o de la rueda mes/año seleccionada
        const noAplicaVence = document.getElementById('check-no-vence').checked;
        let venceFormateado = 'N/A';
        if (!noAplicaVence && this.venceMes && this.venceAnio) {
            const mesPad = String(this.venceMes).padStart(2, '0');
            venceFormateado = `${mesPad}/${this.venceAnio}`;
        }
        
        const datos = {
            codigo: document.getElementById('form-codigo').textContent,
            nombre: document.getElementById('form-nombre').textContent,
            marca: document.getElementById('form-marca').textContent,
            existencia_sistema: document.getElementById('form-existencia').dataset.valor || 0,
            cantidad_fisica: cantidad,
            vence: venceFormateado,
            pvp_publico: document.getElementById('form-pvp').value || '',
            precio_dnm: document.getElementById('form-precio-dnm').value || '',
            observaciones: document.getElementById('form-observaciones').value,
            estatus: 'Registrado', // Automático, según lo solicitado
            hora_inicio: horaInicioTexto // ⭐ Hora de cuando seleccionó el producto, no del login
        };
        
        // Estado de carga: deshabilitar botón, mostrar spinner y el modal "Enviando..."
        const btnGuardar = document.querySelector('.conteo-modal-footer .btn-primary');
        const textoOriginalBtn = btnGuardar ? btnGuardar.innerHTML : '';
        if (btnGuardar) {
            btnGuardar.disabled = true;
            btnGuardar.innerHTML = '<span class="mini-spinner-btn"></span> Guardando...';
        }
        
        const modalSending = document.getElementById('modal-sending');
        modalSending.style.display = 'flex';
        
        try {
            const existenciaSistema = parseFloat(document.getElementById('form-existencia').dataset.valor) || 0;
            const cantidadFisica = parseFloat(cantidad) || 0;
            
            const resultado = await SheetsAPI.guardarConteo(datos, Auth.getUsuarioActual(), this.tipo);
            
            modalSending.style.display = 'none';
            
            if (resultado.success) {
                this.conteos.push(datos);
                this.actualizarContador();
                
                // Calcular diferencia aquí (antes lo hacía PHP)
                const diferencia = this.redondear(cantidadFisica - existenciaSistema);
                let estado = 'OK';
                if (diferencia > 0) estado = `EXCESO (+${diferencia})`;
                else if (diferencia < 0) estado = `FALTANTE (${diferencia})`;
                
                this.mostrarExito(
                    resultado.mensaje || 'Conteo guardado exitosamente',
                    {
                        id: resultado.id,
                        producto: datos.nombre,
                        cantidad_contada: cantidadFisica,
                        diferencia: diferencia,
                        estado: estado
                    }
                );
            } else {
                this.mostrarError(resultado.mensaje || 'No se pudo guardar el conteo');
            }
            
        } catch (error) {
            console.error('Error:', error);
            modalSending.style.display = 'none';
            this.mostrarError('Error al guardar el conteo');
        } finally {
            // Restaurar el botón, pase lo que pase (éxito o error)
            if (btnGuardar) {
                btnGuardar.disabled = false;
                btnGuardar.innerHTML = textoOriginalBtn;
            }
        }
    }
    
    // ================================================
    // MODALES Y MENSAJES
    // ================================================
    
    mostrarError(mensaje) {
        const modal = document.getElementById('modal-error');
        document.getElementById('error-message').textContent = mensaje;
        modal.style.display = 'flex';
        document.getElementById('btn-error-close').addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }
    
    mostrarExito(mensaje, detalles = {}) {
        const modal = document.getElementById('modal-success');
        const contenedorMensaje = document.getElementById('success-message');
        
        // Mensaje corto y limpio: solo lo esencial
        let html = '';
        if (detalles.producto) {
            html += `<strong class="success-producto">${this.escapeHtml(detalles.producto)}</strong>`;
        }
        if (detalles.cantidad_contada !== undefined) {
            html += `<span class="success-cantidad">Cantidad registrada: ${detalles.cantidad_contada}</span>`;
        }
        
        contenedorMensaje.innerHTML = html || mensaje;
        modal.style.display = 'flex';
        
        document.getElementById('btn-success-continue').addEventListener('click', () => {
            modal.style.display = 'none';
            this.cerrarFormulario();
            this.actualizarContador();
            document.getElementById('search-input').value = '';
            this.limpiarResultados();
            document.getElementById('search-input').focus();
        });
    }
    
    // ================================================
    // ESCÁNER DE CÓDIGO DE BARRAS CON CÁMARA (móvil)
    // ================================================
    
    abrirEscanerCamara() {
        const modal = document.getElementById('scanner-modal');
        const errorBox = document.getElementById('scanner-error');
        errorBox.style.display = 'none';
        modal.style.display = 'flex';
        
        if (typeof Quagga === 'undefined') {
            errorBox.textContent = 'No se pudo cargar el escáner. Verifica tu conexión a internet.';
            errorBox.style.display = 'block';
            return;
        }
        
        Quagga.init({
            inputStream: {
                type: 'LiveStream',
                target: document.getElementById('scanner-viewport'),
                constraints: {
                    facingMode: 'environment', // cámara trasera del celular
                    width: { ideal: 480 },   // ⚡ resolución reducida = más velocidad
                    height: { ideal: 320 }
                }
            },
            locator: {
                patchSize: 'medium',
                halfSample: true // ⚡ procesa la mitad de píxeles = mucho más rápido
            },
            numOfWorkers: (navigator.hardwareConcurrency 
                ? Math.min(navigator.hardwareConcurrency, 4) 
                : 2), // ⚡ usa varios hilos del celular en paralelo
            frequency: 10, // ⚡ intenta detectar 10 veces por segundo (antes sin límite = gastaba batería/CPU)
            decoder: {
                // ⚡ Menos formatos activos = detección más rápida.
                // Dejamos solo los más comunes en productos (EAN-13/8 y Code128)
                readers: [
                    'ean_reader',
                    'ean_8_reader',
                    'code_128_reader'
                ]
            },
            locate: true
        }, (err) => {
            if (err) {
                console.error('Error al iniciar cámara:', err);
                errorBox.textContent = 'No se pudo acceder a la cámara. Verifica los permisos del navegador.';
                errorBox.style.display = 'block';
                return;
            }
            Quagga.start();
        });
        
        // Evitar detecciones duplicadas muy seguidas
        this._ultimaDeteccion = 0;
        
        Quagga.onDetected(this._onBarcodeDetected = (data) => {
            const ahora = Date.now();
            if (ahora - this._ultimaDeteccion < 1500) return; // debounce
            this._ultimaDeteccion = ahora;
            
            const codigo = data.codeResult.code;
            if (!codigo) return;
            
            // Vibración de confirmación si el dispositivo lo soporta
            if (navigator.vibrate) navigator.vibrate(150);
            
            this.cerrarEscanerCamara();
            
            const input = document.getElementById('search-input');
            input.value = codigo;
            this.modoBarcode = true;
            this.buscar(codigo);
        });
    }
    
    cerrarEscanerCamara() {
        const modal = document.getElementById('scanner-modal');
        modal.style.display = 'none';
        
        if (typeof Quagga !== 'undefined') {
            if (this._onBarcodeDetected) {
                Quagga.offDetected(this._onBarcodeDetected);
            }
            try {
                Quagga.stop();
            } catch (e) {
                // Ya estaba detenido, no pasa nada
            }
        }
    }
    
    // ================================================
    // UTILIDADES
    // ================================================
    
    escapeHtml(texto) {
        const div = document.createElement('div');
        div.textContent = texto;
        return div.innerHTML;
    }
    
    formatearHora(fecha) {
        const h = String(fecha.getHours()).padStart(2, '0');
        const m = String(fecha.getMinutes()).padStart(2, '0');
        const s = String(fecha.getSeconds()).padStart(2, '0');
        return `${h}:${m}:${s}`;
    }
    
    /**
     * Trae el número REAL de conteos que este usuario ha hecho en esta
     * sucursal, desde el mismo dato que usa "Resumen de Conteos" (para
     * que ambos siempre coincidan). Ya no depende de un contador local
     * que se perdía al recargar la página.
     */
    async actualizarContador() {
        try {
            const resultado = await SheetsAPI.getConteosPorUsuario(this.gidSucursal);
            
            if (resultado.success) {
                const usuarioActual = Auth.getUsuarioActual().toLowerCase();
                const cantidad = resultado.conteos[usuarioActual] || 0;
                document.getElementById('count-total').textContent = cantidad;
            }
            // Si no está configurado, se deja el "0" inicial tal cual está
        } catch (error) {
            console.error('No se pudo cargar el contador de conteos:', error);
        }
    }
    
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new ConteoManager();
});
