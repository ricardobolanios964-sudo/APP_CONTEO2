/*
 * APP_CONTEO2 - Actualización automática de la PWA
 * Versión: 2.2.0
 *
 * Si GitHub Pages publica una versión nueva, el navegador instala el nuevo
 * Service Worker, elimina la caché anterior y recarga la aplicación.
 * El usuario no necesita desinstalar/reinstalar la PWA.
 */
(function () {
    'use strict';

    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', function () {
        navigator.serviceWorker.register('./service-worker.js?v=2.2.0', {
            updateViaCache: 'none'
        })
        .then(function (registration) {
            // Fuerza una comprobación al abrir la aplicación.
            registration.update().catch(function () {});

            // Si ya había una actualización esperando, activarla inmediatamente.
            if (registration.waiting) {
                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }

            registration.addEventListener('updatefound', function () {
                var newWorker = registration.installing;
                if (!newWorker) return;

                newWorker.addEventListener('statechange', function () {
                    if (newWorker.state === 'installed') {
                        if (navigator.serviceWorker.controller) {
                            // Actualización obligatoria: activamos la nueva versión.
                            newWorker.postMessage({ type: 'SKIP_WAITING' });
                        }
                    }
                });
            });
        })
        .catch(function (error) {
            // Si el Service Worker falla, la aplicación continúa funcionando normalmente.
            console.warn('No se pudo registrar el actualizador de APP_CONTEO2:', error);
        });
    });

    var recargando = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (recargando) return;
        recargando = true;
        window.location.reload();
    });
})();
