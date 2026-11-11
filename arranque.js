/*
 * ARRANQUE: se carga antes que todo lo demás.
 * Mientras se cargan los archivos de la app, la pantalla queda en blanco un instante
 * (si no, en un teléfono lento se ve el diseño sin menú y luego "salta" a su lugar).
 * Se muestra apenas el navegador terminó de correr todos los archivos (aunque alguno falle).
 */
(function () {
  var raiz = document.documentElement;
  raiz.classList.add("cargando");
  var mostrar = function () { raiz.classList.remove("cargando"); };
  document.addEventListener("DOMContentLoaded", mostrar);
  setTimeout(mostrar, 4000); // por si algo raro pasa: nunca se queda en blanco
})();
