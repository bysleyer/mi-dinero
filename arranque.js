/*
 * ARRANQUE: se carga antes que todo lo demás.
 * Mientras se cargan los archivos de la app, la pantalla queda en blanco un instante
 * (si no, en un teléfono lento se ve el diseño sin menú y luego "salta" a su lugar).
 * Se muestra apenas el navegador terminó de correr todos los archivos (aunque alguno falle).
 */
(function () {
  var raiz = document.documentElement;
  raiz.classList.add("cargando");
  // Candado (candado.js): si este aparato lo tiene, la pantalla arranca tapada para que no se vea nada antes de Face ID
  try {
    var c = JSON.parse(localStorage.getItem("midinero:candado") || "null");
    var sy = JSON.parse(localStorage.getItem("midinero:sync") || "null");
    if (c && c.id && !(sy && sy.modo === "ver")) raiz.classList.add("bloqueado");
  } catch (e) { /* sin almacenamiento: sin candado */ }
  var mostrar = function () { raiz.classList.remove("cargando"); };
  document.addEventListener("DOMContentLoaded", mostrar);
  setTimeout(mostrar, 4000); // por si algo raro pasa: nunca se queda en blanco
})();
