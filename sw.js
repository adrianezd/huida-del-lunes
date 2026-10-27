'use strict';
/* Service worker: copia guardada para jugar sin conexión (responde con la copia y la actualiza por detrás). */
const CACHE = 'huida-del-lunes-v2';
const CORE = ["./","index.html","style.css","script.js","favicon.svg","manifest.json","icon-512.png","assets/ana-ok.svg","assets/ana.svg","assets/cafe.svg","assets/candado.svg","assets/carta-cafe.svg","assets/carta-inspeccion.svg","assets/carta-llama.svg","assets/carta-prisa.svg","assets/carta-reunion.svg","assets/carta-ronda.svg","assets/despacho.svg","assets/esperar.svg","assets/excusa.svg","assets/impresora-azul.svg","assets/impresora-naranja.svg","assets/impresora-verde.svg","assets/impresora.svg","assets/informe.svg","assets/jefe-enfadado.svg","assets/jefe-telefono.svg","assets/jefe.svg","assets/llamada.svg","assets/luis-ok.svg","assets/luis.svg","assets/marta-ok.svg","assets/marta.svg","assets/obj-carpeta.svg","assets/obj-papeles.svg","assets/obj-pc.svg","assets/obj-planta.svg","assets/obj-taza.svg","assets/puerta-abierta.svg","assets/puerta.svg","assets/reloj.svg","assets/ruido.svg","assets/yo-huye.svg","assets/yo.svg"];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin && !/fonts.(googleapis|gstatic).com$/.test(url.hostname)) return;
  e.respondWith(caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: url.origin === self.location.origin }).then((hit) => {
    const net = fetch(req).then((r) => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  })));
});
