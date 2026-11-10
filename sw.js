/*
 * SERVICE WORKER - hace que la app funcione sin internet.
 * Guarda una copia de los archivos de la app en el teléfono.
 * Al abrir: muestra la copia guardada y, si hay internet, la actualiza
 * en segundo plano (los cambios se ven la siguiente vez que abras la app).
 * Solo guarda archivos de la app; nunca tus datos (esos están en el almacén del navegador).
 */
const CACHE = "mi-dinero-v13";
const ARCHIVOS = [
  "./",
  "./index.html",
  "./estilos.css",
  "./datos-ejemplo.js",
  "./almacen.js",
  "./app.js",
  "./plan.js",
  "./jornadas.js",
  "./deudas.js",
  "./resumen.js",
  "./calendario.js",
  "./pagos.js",
  "./alcanza.js",
  "./escenarios.js",
  "./proyeccion.js",
  "./mover.js",
  "./respaldo.js",
  "./manifest.json",
  "./iconos/icono-180.png",
  "./iconos/icono-192.png",
  "./iconos/icono-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  // Solo archivos de la propia app; nada de otros sitios.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(req, { ignoreSearch: true }).then(guardado => {
        const deRed = fetch(req)
          .then(resp => {
            if (resp && resp.ok) cache.put(req, resp.clone());
            return resp;
          })
          .catch(() => guardado);
        return guardado || deRed;
      })
    )
  );
});
