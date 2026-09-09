/*
 * APP_CONTEO2 - Aviso de actualización de PWA
 * Versión 2.7.0
 *
 * Detecta una versión nueva y muestra un aviso al usuario.
 * La aplicación NO se recarga automáticamente: el usuario decide
 * cuándo actualizar mediante el botón "Actualizar".
 */
(function () {
    'use strict';

    var APP_VERSION = '2.7.0';
    var checking = false;
    var updating = false;

    // El login espera esta comprobación antes de redirigir al dashboard.
    // Si hay una actualización, la promesa queda pendiente hasta que el
    // usuario pulse "Actualizar" (la página se recarga durante el proceso).
    var resolverInicio;
    var inicioResuelto = false;
    window.PWAUpdateReady = new Promise(function (resolve) {
        resolverInicio = resolve;
    });

    function resolverInicioSiCorresponde() {
        if (!inicioResuelto) {
            inicioResuelto = true;
            resolverInicio();
        }
    }

    function crearAvisoActualizacion(versionNueva) {
        if (document.getElementById('pwa-update-notice')) return;

        var notice = document.createElement('div');
        notice.id = 'pwa-update-notice';
        notice.setAttribute('role', 'alertdialog');
        notice.setAttribute('aria-live', 'polite');
        notice.innerHTML = `
            <div class="pwa-update-box">
                <div class="pwa-update-icon" aria-hidden="true">↻</div>
                <div class="pwa-update-text">
                    <strong>Nueva actualización detectada</strong>
                    <span>Hay una nueva versión disponible: <b>v${versionNueva}</b></span>
                </div>
                <button id="pwa-update-button" type="button">Actualizar</button>
            </div>
        `;

        var style = document.createElement('style');
        style.id = 'pwa-update-styles';
        style.textContent = `
            #pwa-update-notice {
                position: fixed;
                left: 12px;
                right: 12px;
                top: max(12px, env(safe-area-inset-top));
                z-index: 100000;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            .pwa-update-box {
                width: min(560px, 100%);
                margin: 0 auto;
                box-sizing: border-box;
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px 14px;
                background: #fff;
                border: 1px solid rgba(13,115,119,.18);
                border-radius: 12px;
                box-shadow: 0 8px 24px rgba(0,0,0,.16);
            }
            .pwa-update-icon {
                width: 40px;
                height: 40px;
                min-width: 40px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #E6FFFA;
                color: #0D7377;
                font-size: 22px;
                font-weight: 700;
            }
            .pwa-update-text {
                min-width: 0;
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 3px;
            }
            .pwa-update-text strong {
                color: #1F2937;
                font-size: 14px;
            }
            .pwa-update-text span {
                color: #6B7280;
                font-size: 12px;
                line-height: 1.35;
            }
            .pwa-update-text b { color: #0D7377; }
            #pwa-update-button {
                border: 0;
                border-radius: 9px;
                padding: 10px 14px;
                background: #0D7377;
                color: #fff;
                font-size: 13px;
                font-weight: 700;
                cursor: pointer;
                white-space: nowrap;
            }
            #pwa-update-button:disabled { opacity: .65; cursor: default; }
            #pwa-update-status {
                position: fixed;
                left: 50%;
                transform: translateX(-50%);
                top: calc(max(12px, env(safe-area-inset-top)) + 76px);
                z-index: 100001;
                margin: 0;
                padding: 7px 10px;
                border-radius: 8px;
                background: rgba(31,41,55,.94);
                color: #fff;
                font-size: 12px;
                display: none;
            }
            @media (max-width: 480px) {
                .pwa-update-box { gap: 9px; padding: 10px; }
                .pwa-update-icon { width: 34px; height: 34px; min-width: 34px; font-size: 19px; }
                .pwa-update-text strong { font-size: 13px; }
                .pwa-update-text span { font-size: 11px; }
                #pwa-update-button { padding: 9px 11px; font-size: 12px; }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(notice);

        document.getElementById('pwa-update-button').addEventListener('click', function () {
            actualizarAplicacion(versionNueva);
        });
    }

    async function actualizarAplicacion(versionNueva) {
        if (updating) return;
        updating = true;

        var button = document.getElementById('pwa-update-button');
        var status = document.getElementById('pwa-update-status');

        if (button) {
            button.disabled = true;
            button.textContent = 'Actualizando...';
        }

        if (!status) {
            status = document.createElement('p');
            status.id = 'pwa-update-status';
            document.body.appendChild(status);
        }
        status.textContent = 'Actualizando aplicación...';
        status.style.display = 'block';

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

            // No tocamos sessionStorage: la sesión del usuario permanece.
            if ('caches' in window) {
                var keys = await caches.keys();
                await Promise.all(
                    keys
                        .filter(function (key) { return key.indexOf('app-conteo2-') === 0; })
                        .map(function (key) { return caches.delete(key); })
                );
            }

            window.location.replace(
                window.location.pathname +
                '?app_version=' + encodeURIComponent(versionNueva) +
                '&t=' + Date.now()
            );
        } catch (error) {
            console.error('Error al actualizar APP_CONTEO2:', error);
            updating = false;
            if (button) {
                button.disabled = false;
                button.textContent = 'Actualizar';
            }
            status.textContent = 'No se pudo actualizar. Intenta nuevamente.';
        }
    }

    function esperarInstalacion(worker) {
        return new Promise(function (resolve) {
            if (worker.state === 'installed' || worker.state === 'activated') {
                resolve();
                return;
            }
            worker.addEventListener('statechange', function () {
                if (worker.state === 'installed' || worker.state === 'activated') resolve();
            });
        });
    }

    async function comprobarVersion() {
        if (checking || document.hidden) return;
        checking = true;

        try {
            var respuesta = await fetch(
                './version.json?check=' + Date.now(),
                { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }
            );

            if (!respuesta.ok) throw new Error('No se pudo consultar la versión');

            var datos = await respuesta.json();
            var versionNueva = String(datos.version || '').trim();

            if (versionNueva && versionNueva !== APP_VERSION) {
                crearAvisoActualizacion(versionNueva);
                // No resolvemos aquí: el usuario debe elegir Actualizar.
                return;
            }

            resolverInicioSiCorresponde();
        } catch (error) {
            console.warn('No se pudo comprobar la versión de APP_CONTEO2:', error);
            // Si el servidor no responde, no bloqueamos el acceso.
            resolverInicioSiCorresponde();
        } finally {
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

        navigator.serviceWorker.addEventListener('controllerchange', function () {
            // Solo recargamos cuando el usuario ya eligió actualizar.
            if (updating) window.location.reload();
        });
    }

    window.addEventListener('load', comprobarVersion);

    // Vuelve a comprobar al regresar a la app después de dejarla en segundo plano.
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) comprobarVersion();
    });
})();
