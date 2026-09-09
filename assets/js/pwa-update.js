/*
 * APP_CONTEO2 - Control de actualización de PWA
 * Versión 2.3.1
 *
 * Comprueba la versión publicada desde version.json. Si hay una versión
 * nueva, bloquea la aplicación hasta completar la actualización.
 */
(function () {
    'use strict';

    var APP_VERSION = '2.3.1';
    var checking = false;
    var updating = false;

    function crearAvisoActualizacion(versionNueva) {
        if (document.getElementById('pwa-update-required')) return;

        var overlay = document.createElement('div');
        overlay.id = 'pwa-update-required';
        overlay.innerHTML = `
            <div style="
                position:fixed; inset:0; z-index:100000;
                background:rgba(15,23,42,.72);
                display:flex; align-items:center; justify-content:center;
                padding:24px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
            ">
                <div style="
                    width:min(420px,100%); background:#fff; border-radius:20px;
                    padding:30px 24px; text-align:center;
                    box-shadow:0 25px 60px rgba(0,0,0,.25);
                ">
                    <div style="
                        width:64px;height:64px;margin:0 auto 18px;border-radius:50%;
                        display:flex;align-items:center;justify-content:center;
                        background:#E6FFFA;color:#0D7377;font-size:30px;
                    ">↻</div>
                    <h2 style="margin:0 0 10px;color:#1F2937;font-size:22px;">
                        Nueva actualización disponible
                    </h2>
                    <p style="margin:0 0 8px;color:#6B7280;line-height:1.5;">
                        Hay una nueva versión de APP CONTEO disponible.
                    </p>
                    <p style="margin:0 0 22px;color:#0D7377;font-weight:700;">
                        Versión ${versionNueva}
                    </p>
                    <button id="pwa-update-button" type="button" style="
                        width:100%; border:0; border-radius:12px; padding:14px 18px;
                        background:linear-gradient(135deg,#0D7377,#0A5A67);
                        color:#fff;font-size:16px;font-weight:700;cursor:pointer;
                    ">
                        Actualizar aplicación
                    </button>
                    <p id="pwa-update-status" style="margin:14px 0 0;color:#9CA3AF;font-size:12px;"></p>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

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
            var nuevaUrl = window.location.pathname +
                '?app_version=' + encodeURIComponent(versionNueva) +
                '&t=' + Date.now();

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
        if (checking) return;
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
            }
        } catch (error) {
            console.warn('No se pudo comprobar la versión de APP_CONTEO2:', error);
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
            if (!updating) {
                window.location.reload();
            }
        });
    }

    window.addEventListener('load', function () {
        comprobarVersion();
    });
})();
