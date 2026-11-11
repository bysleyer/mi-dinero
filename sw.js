/*
 * SERVICE WORKER - hace que la app funcione sin internet.
 * Guarda una copia de los archivos de la app en el teléfono.
 * Con internet: siempre trae la versión más nueva (y actualiza la copia).
 * Sin internet (o si la red tarda mucho): usa la copia guardada.
 * Solo guarda archivos de la app; nunca tus datos (esos están en el almacén del navegador).
 */
const CACHE = "mi-dinero-v36"; // mismo número que VERSION_APP en app.js
const ESPERA_RED_MS = 4000;     // si la red tarda más, se usa la copia guardada
const ARCHIVOS = [
  "./",
  "./index.html",
  "./estilos.css",
  "./datos-ejemplo.js",
  "./almacen.js",
  "./campos.js",
  "./app.js",
  "./plan.js",
  "./jornadas.js",
  "./deudas.js",
  "./resumen.js",
  "./calendario.js",
  "./planeados.js",
  "./pagos.js",
  "./alcanza.js",
  "./escenarios.js",
  "./proyeccion.js",
  "./mover.js",
  "./futuro.js",
  "./colchon.js",
  "./datosfijos.js",
  "./prestamo.js",
  "./acuerdo.js",
  "./sincronizar.js",
  "./nav.js",
  "./cubrir.js",
  "./avisos.js",
  "./respaldo.js",
  "./manifest.json",
  "./iconos/icono-180.png",
  "./iconos/icono-192.png",
  "./iconos/icono-512.png"
];

self.addEventListener("install", e => {
  // "reload": baja los archivos del servidor, no de la memoria del navegador
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ARCHIVOS.map(u => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
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
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const guardado = () => cache.match(req, { ignoreSearch: true });
    try {
      // Primero la red ("no-cache": pregunta al servidor si hay versión nueva)
      const red = fetch(req, { cache: "no-cache" }).then(resp => {
        if (resp && resp.ok) cache.put(req, resp.clone());
        return resp;
      });
      const tarde = new Promise(resolver => setTimeout(resolver, ESPERA_RED_MS, null));
      const resp = await Promise.race([red, tarde]);
      if (resp) return resp;
      return (await guardado()) || (await red); // la red tarda: copia guardada si existe
    } catch (err) {
      const copia = await guardado();
      if (copia) return copia;
      throw err;
    }
  })());
});
