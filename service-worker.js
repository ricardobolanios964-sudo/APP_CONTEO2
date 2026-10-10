const APP_VERSION = "2.7.0";
const CACHE_NAME = `app-conteo2-${APP_VERSION}`;

const APP_SHELL = [
    `./index.html?v=${APP_VERSION}`,
    `./dashboard.html?v=${APP_VERSION}`,
    `./conteo.html?v=${APP_VERSION}`,
    `./resumen.html?v=${APP_VERSION}`,
    `./reportes.html?v=${APP_VERSION}`,
    `./manifest.json?v=${APP_VERSION}`,
    `./assets/css/main.css?v=${APP_VERSION}`,
    `./assets/css/menu.css?v=${APP_VERSION}`,
    `./assets/css/login.css?v=${APP_VERSION}`,
    `./assets/css/conteo.css?v=${APP_VERSION}`,
    `./assets/css/resumen.css?v=${APP_VERSION}`,
    `./assets/css/reportes.css?v=${APP_VERSION}`,
    `./assets/js/config.js?v=${APP_VERSION}`,
    `./assets/js/sheets-api.js?v=${APP_VERSION}`,
    `./assets/js/auth.js?v=${APP_VERSION}`,
    `./assets/js/login.js?v=${APP_VERSION}`,
    `./assets/js/conteo.js?v=${APP_VERSION}`,
    `./assets/js/dashboard.js?v=${APP_VERSION}`,
    `./assets/js/resumen.js?v=${APP_VERSION}`,
    `./assets/js/reportes.js?v=${APP_VERSION}`,
    `./assets/js/vendor/quagga.min.js?v=${APP_VERSION}`,
    `./assets/js/pwa-update.js?v=${APP_VERSION}`,
    `./assets/js/logout.js?v=${APP_VERSION}`,
    `./assets/img/logo.png`,
    `./assets/img/BOLANIOS.png`,
    `./assets/img/icons/icon-192.png`,
    `./assets/img/icons/icon-512.png`,
    `./assets/img/icons/favicon-32.png`,
    `./assets/img/icons/favicon-16.png`,
    `./assets/img/icons/apple-touch-icon.png`
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key.startsWith('app-conteo2-') && key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);

    // El archivo de versión SIEMPRE debe venir de red. El parámetro
    // aleatorio usado por pwa-update evita que cualquier SW antiguo
    // pueda entregar una copia guardada.
    if (url.pathname.endsWith('/version.json')) {
        event.respondWith(fetch(request, { cache: 'no-store' }));
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request, { cache: 'no-store' })
                .then(response => {
                    if (response && response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() =>
                    caches.match(request).then(cached =>
                        cached || caches.match('./index.html?v=' + APP_VERSION)
                    )
                )
        );
        return;
    }

    if (url.origin !== self.location.origin) return;

    event.respondWith(
        caches.match(request).then(cached => {
            if (cached) return cached;

            return fetch(request).then(response => {
                if (response && response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                }
                return response;
            });
        })
    );
});
