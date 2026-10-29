/*
 * APP_CONTEO2 - Control de actualización de PWA
 * Versión 2.8.2
 *
 * Comprueba la versión publicada desde version.json. Si hay una versión
 * nueva, muestra un aviso con el número de versión. El aviso permanece en
 * pantalla hasta que el usuario lo cierre o pulse "Actualizar ahora".
 */
(function () {
    'use strict';

    var APP_VERSION = '2.8.2';
    var checking = false;
    var updating = false;

    // Cada cuánto se revisa si hay versión nueva mientras la app está abierta y visible.
    // (consulta muy liviana: un archivo de pocos bytes)
    var INTERVALO_COMPROBACION_MS = 10 * 1000;
    // Además se revisa al instante cuando el usuario toca la pantalla, como
    // máximo una vez cada este tiempo.
    var MINIMO_ENTRE_TOQUES_MS = 4 * 1000;
    // Si la consulta no responde en este tiempo se cancela (antes podía quedarse
    // colgada con señal débil y la app ya no volvía a revisar nunca).
    var LIMITE_CONSULTA_MS = 8 * 1000;
    var ultimaComprobacion = 0;
    // Si el usuario pulsa "Más tarde", el aviso vuelve a aparecer pasado este tiempo.
    var POSPONER_MS = 10 * 60 * 1000;

    function avisoYaCerrado(versionNueva) {
        try {
            var guardado = JSON.parse(sessionStorage.getItem('app_conteo2_aviso_cerrado') || 'null');
            return !!guardado &&
                guardado.version === String(versionNueva) &&
                Date.now() < guardado.hasta;
        } catch (e) {
            return false;
        }
    }

    function recordarAvisoCerrado(versionNueva) {
        try {
            sessionStorage.setItem('app_conteo2_aviso_cerrado', JSON.stringify({
                version: String(versionNueva),
                hasta: Date.now() + POSPONER_MS
            }));
        } catch (e) { /* sin almacenamiento: el aviso podrá volver a mostrarse */ }
    }

    /**
     * No interrumpir al usuario a mitad de un conteo: si el formulario, el
     * envío, el escáner o algún aviso del conteo están abiertos, el aviso de
     * actualización espera a que se cierren (así no se pierden datos).
     */
    function usuarioOcupado() {
        var form = document.getElementById('conteo-modal-overlay');
        if (form && form.classList.contains('open')) return true;

        var ids = ['modal-sending', 'modal-success', 'modal-error', 'modal-confirm', 'scanner-modal'];
        for (var i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);
            if (el && el.style.display === 'flex') return true;
        }
        return false;
    }

    var esperaLibre = null;

    function mostrarCuandoEsteLibre(versionNueva) {
        if (!usuarioOcupado()) {
            crearAvisoActualizacion(versionNueva);
            return;
        }
        if (esperaLibre) return;
        esperaLibre = setInterval(function () {
            if (usuarioOcupado()) return;
            clearInterval(esperaLibre);
            esperaLibre = null;
            if (!avisoYaCerrado(versionNueva)) crearAvisoActualizacion(versionNueva);
        }, 1500);
    }

    function cerrarAviso(versionNueva) {
        if (updating) return;
        var overlay = document.getElementById('pwa-update-required');
        if (overlay) overlay.remove();
        document.removeEventListener('keydown', teclaCerrarAviso);
        recordarAvisoCerrado(versionNueva);
    }

    var versionAvisoActual = null;

    function teclaCerrarAviso(e) {
        if (e.key === 'Escape' && versionAvisoActual) cerrarAviso(versionAvisoActual);
    }

    function crearAvisoActualizacion(versionNueva) {
        if (document.getElementById('pwa-update-required')) return;
        versionAvisoActual = versionNueva;

        var overlay = document.createElement('div');
        overlay.id = 'pwa-update-required';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'pwa-update-title');
        overlay.innerHTML = `
            <div id="pwa-update-backdrop" style="
                position:fixed; inset:0; z-index:100000;
                background:rgba(15,23,42,.72);
                display:flex; align-items:center; justify-content:center;
                padding:24px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
            ">
                <div style="
                    position:relative;
                    width:min(420px,100%); background:#fff; border-radius:20px;
                    padding:30px 24px 24px; text-align:center;
                    box-shadow:0 25px 60px rgba(0,0,0,.25);
                ">
                    <button id="pwa-update-close" type="button" aria-label="Cerrar aviso" style="
                        position:absolute; top:10px; right:10px;
                        width:36px; height:36px; border:0; border-radius:50%;
                        background:#F3F4F6; color:#6B7280; font-size:18px;
                        line-height:1; cursor:pointer;
                    ">✕</button>
                    <div style="
                        width:64px;height:64px;margin:0 auto 18px;border-radius:50%;
                        display:flex;align-items:center;justify-content:center;
                        background:#E6FFFA;color:#0D7377;font-size:30px;
                    ">↻</div>
                    <h2 id="pwa-update-title" style="margin:0 0 10px;color:#1F2937;font-size:22px;">
                        Se detectó una nueva actualización
                    </h2>
                    <p style="margin:0 0 8px;color:#6B7280;line-height:1.5;">
                        Hay una nueva versión de APP CONTEO disponible.
                    </p>
                    <p style="margin:0 0 4px;color:#0D7377;font-weight:700;font-size:18px;">
                        Versión ${versionNueva}
                    </p>
                    <p style="margin:0 0 22px;color:#9CA3AF;font-size:13px;">
                        Tu versión actual: ${APP_VERSION}
                    </p>
                    <button id="pwa-update-button" type="button" style="
                        width:100%; border:0; border-radius:12px; padding:14px 18px;
                        background:linear-gradient(135deg,#0D7377,#0A5A67);
                        color:#fff;font-size:16px;font-weight:700;cursor:pointer;
                    ">
                        Actualizar ahora
                    </button>
                    <button id="pwa-update-later" type="button" style="
                        width:100%; margin-top:10px; border:0; border-radius:12px; padding:12px 18px;
                        background:transparent; color:#6B7280;
                        font-size:15px;font-weight:600;cursor:pointer;
                    ">
                        Más tarde
                    </button>
                    <p id="pwa-update-status" style="margin:12px 0 0;color:#9CA3AF;font-size:12px;"></p>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        document.getElementById('pwa-update-button').addEventListener('click', function () {
            actualizarAplicacion(versionNueva);
        });
        document.getElementById('pwa-update-close').addEventListener('click', function () {
            cerrarAviso(versionNueva);
        });
        document.getElementById('pwa-update-later').addEventListener('click', function () {
            cerrarAviso(versionNueva);
        });
        document.getElementById('pwa-update-backdrop').addEventListener('click', function (e) {
            if (e.target.id === 'pwa-update-backdrop') cerrarAviso(versionNueva);
        });
        document.addEventListener('keydown', teclaCerrarAviso);
    }

    async function actualizarAplicacion(versionNueva) {
        if (updating) return;
        updating = true;

        var button = document.getElementById('pwa-update-button');
        var status = document.getElementById('pwa-update-status');

        if (button) {
            button.disabled = true;
            button.textContent = 'Actualizando...';
            button.style.opacity = '0.7';
        }
        if (status) status.textContent = 'Preparando la nueva versión...';

        try {
            if ('serviceWorker' in navigator) {
                var registration = await navigator.serviceWorker.register(
                    './service-worker.js?v=' + encodeURIComponent(versionNueva),
                    { updateViaCache: 'none' }
                );

                await registration.update();

                if (registration.waiting) {
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                } else if (registration.installing) {
                    await esperarInstalacion(registration.installing);
                    if (registration.waiting) {
                        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                    }
                }
            }

            // Limpiar caches de la aplicación. No tocamos sessionStorage.
            if ('caches' in window) {
                var keys = await caches.keys();
                await Promise.all(
                    keys
                        .filter(function (key) { return key.indexOf('app-conteo2-') === 0; })
                        .map(function (key) { return caches.delete(key); })
                );
            }

            if (status) status.textContent = 'Actualización completada. Abriendo nueva versión...';

            // Query de versión para evitar una respuesta HTML antigua.
            // Se conservan los parámetros actuales (ej. ?tipo=bodega o
            // ?sucursal=farmacia) para que el usuario siga en la misma pantalla.
            var params = new URLSearchParams(window.location.search);
            params.set('app_version', versionNueva);
            params.set('t', String(Date.now()));
            var nuevaUrl = window.location.pathname + '?' + params.toString() + window.location.hash;

            window.location.replace(nuevaUrl);

        } catch (error) {
            console.error('Error al actualizar APP_CONTEO2:', error);

            if (status) {
                status.textContent =
                    'No se pudo completar automáticamente. Intentando nuevamente...';
            }

            setTimeout(function () {
                window.location.reload(true);
            }, 1500);
        }
    }

    function esperarInstalacion(worker) {
        return new Promise(function (resolve) {
            if (worker.state === 'installed' || worker.state === 'activated') {
                resolve();
                return;
            }

            worker.addEventListener('statechange', function () {
                if (worker.state === 'installed' || worker.state === 'activated') {
                    resolve();
                }
            });
        });
    }

    async function comprobarVersion() {
        if (checking || updating) return;
        if (document.getElementById('pwa-update-required')) return; // el aviso ya está en pantalla
        checking = true;
        ultimaComprobacion = Date.now();

        var control = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var limite = control ? setTimeout(function () { control.abort(); }, LIMITE_CONSULTA_MS) : null;

        try {
            var respuesta = await fetch(
                './version.json?check=' + Date.now(),
                {
                    cache: 'no-store',
                    headers: { 'Cache-Control': 'no-cache' },
                    signal: control ? control.signal : undefined
                }
            );

            if (!respuesta.ok) throw new Error('No se pudo consultar la versión');

            var datos = await respuesta.json();
            var versionNueva = String(datos.version || '').trim();

            if (versionNueva && versionNueva !== APP_VERSION) {
                // Hay versión nueva: pedir al navegador que descargue ya el
                // Service Worker nuevo (solo en este caso, para no gastar datos).
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.getRegistration().then(function (reg) {
                        if (reg) reg.update().catch(function () {});
                    }).catch(function () {});
                }
                if (!avisoYaCerrado(versionNueva)) mostrarCuandoEsteLibre(versionNueva);
            }
        } catch (error) {
            console.warn('No se pudo comprobar la versión de APP_CONTEO2:', error);
        } finally {
            if (limite) clearTimeout(limite);
            checking = false;
        }
    }

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register(
                './service-worker.js?v=' + APP_VERSION,
                { updateViaCache: 'none' }
            ).then(function (registration) {
                registration.update().catch(function () {});
            }).catch(function (error) {
                console.warn('No se pudo registrar el Service Worker:', error);
            });
        });

        // Si ya había un Service Worker controlando la página, el cambio es una
        // ACTUALIZACIÓN: no se recarga sola, para que el aviso no desaparezca
        // y el usuario decida cuándo actualizar. Solo la primera instalación
        // (sin controlador previo) conserva la recarga original.
        var teniaControlador = !!navigator.serviceWorker.controller;

        navigator.serviceWorker.addEventListener('controllerchange', function () {
            if (teniaControlador) {
                // Llegó un Service Worker nuevo con la app abierta: avisar ya.
                comprobarVersion();
                return;
            }
            if (!updating) {
                window.location.reload();
            }
        });
    }

    window.addEventListener('load', function () {
        comprobarVersion();
    });

    // ---- Comprobación con la app ABIERTA (sin cerrarla ni recargarla) ----

    // 1) Cada 10 s mientras la pantalla está visible.
    setInterval(function () {
        if (!document.hidden) comprobarVersion();
    }, INTERVALO_COMPROBACION_MS);

    // 1b) Al instante cuando el usuario toca la pantalla o escribe
    //     (como máximo una vez cada 4 s, para no gastar datos).
    function alInteractuar() {
        if (Date.now() - ultimaComprobacion >= MINIMO_ENTRE_TOQUES_MS) comprobarVersion();
    }
    document.addEventListener('pointerdown', alInteractuar, { passive: true, capture: true });
    document.addEventListener('keydown', alInteractuar, { passive: true, capture: true });

    // 2) Al volver a la app: cambio de pestaña, PWA que regresa del segundo
    //    plano, pantalla desbloqueada.
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) comprobarVersion();
    });
    window.addEventListener('focus', comprobarVersion);

    // 3) Al recuperar internet.
    window.addEventListener('online', comprobarVersion);

    // 4) Página restaurada desde la memoria del navegador (botón atrás).
    window.addEventListener('pageshow', function (e) {
        if (e.persisted) comprobarVersion();
    });
})();
