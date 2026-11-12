/*
 * ANALIZAR (para el consejero): abre la app en un navegador sin pantalla con los datos
 * de datos.json (el archivo de sincronización) y devuelve en JSON los números que la app calcula:
 * dinero de hoy, la semana, el faltante más cercano, la renta, las deudas, avisos y gastos.
 * Así el consejero usa exactamente la misma cuenta que la app (nada de cálculos aparte).
 *
 * Uso:  node consejero/analizar.js /ruta/a/datos.json [/ruta/de/salida.json]
 *       (FECHA=AAAA-MM-DDTHH:MM para fijar el día; por defecto, ahora mismo en Nueva York)
 * No contiene datos: solo lee el archivo que se le pasa.
 */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

(async () => {
  const archivo = process.argv[2];
  if (!archivo) { console.error("Falta la ruta de datos.json"); process.exit(1); }
  const sync = JSON.parse(fs.readFileSync(archivo, "utf8"));
  const claves = {};
  Object.entries(sync.listas || {}).forEach(([k, v]) => { claves[k] = v; });
  Object.entries(sync.valores || {}).forEach(([k, v]) => { claves[k] = v && "valor" in v ? v.valor : v; });
  Object.entries(sync.mapas || {}).forEach(([k, v]) => { claves[k] = v; });

  const b = await chromium.launch();
  const ctx = await b.newContext({ timezoneId: "America/New_York", locale: "es-US" });
  if (process.env.FECHA) await ctx.clock.setFixedTime(new Date(process.env.FECHA));
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", e => errores.push(e.message));
  // Los datos se ponen ANTES de que cargue la app (y sin conexión a GitHub: nada se sube)
  await p.addInitScript(({ claves }) => {
    if (sessionStorage.getItem("listo")) return;
    sessionStorage.setItem("listo", "1");
    localStorage.clear();
    Object.entries(claves).forEach(([k, v]) => localStorage.setItem("midinero:" + k, JSON.stringify(v)));
    localStorage.setItem("midinero:formato", JSON.stringify(4));
    localStorage.setItem("midinero:config", JSON.stringify({ primerUso: false, ultimoRespaldo: new Date().toISOString() }));
  }, { claves });
  await p.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await p.waitForTimeout(500);

  const r = await p.evaluate(() => {
    const red = n => Math.round(n * 100) / 100;
    const hoyClave = hoy();
    const sem = Plan.semanaReal();
    const pr = Proyeccion.calcular({ horizonte: 92 });
    const f = Proyeccion.faltante(pr);
    // Saldo al final de cada día (los próximos 92) y los días con pagos
    const dias = Object.keys(pr.porDia).sort().map(fecha => ({
      fecha, saldoFin: red(pr.porDia[fecha].saldoFin),
      lineas: pr.porDia[fecha].lineas.map(l => ({ nombre: l.nombre, monto: red(l.monto), tipo: l.tipo, id: l.id }))
    })).filter(d => d.lineas.length);
    let cubrir = null;
    try {
      const c = Cubrir.planear();
      if (c.f) cubrir = { falta: c.f.falta, fecha: c.f.fecha, elegidas: c.elegidas.map(o => ({ nombre: o.nombre || o.id, detalle: o.detalle, aporta: o.aporta })),
                          prestamo: c.prestamo && c.prestamo.monto, horasExtra: c.horas, quedaFinal: c.quedaFinal };
    } catch (e) { cubrir = { error: e.message }; }
    let deudas = null;
    try {
      const pd = Proyeccion.planDeudas();
      deudas = JSON.parse(JSON.stringify(pd, (k, v) => (k === "pr" ? undefined : v)));
    } catch (e) { deudas = { error: e.message }; }
    let avisos = null;
    try {
      const a = Avisos.calcular();
      const t = x => ({ id: x.id, texto: (x.texto || "").replace(/<[^>]+>/g, "") });
      avisos = { afuera: a.afuera.map(t), campana: a.campana.map(t) };
    } catch (e) { avisos = { error: e.message }; }
    const movs = Almacen.leerMovimientos();
    return {
      hoy: hoyClave,
      versionApp: VERSION_APP.numero,
      dineroHoy: red(Dinero.actual()),
      semana: { lunes: sem.lunes, domingo: sem.domingo, libre: sem.libre, guardar: sem.guardar, totalGastos: sem.totalGastos,
                hueco: sem.hueco, huecoAntes: sem.huecoAntes },
      faltante: f ? { ...f, texto: Proyeccion.textoFaltante(f) } : null,
      renta: { atrasada: red(Proyeccion.rentaAtrasada()), estado: (() => { try { return Proyeccion.estadoRenta(pr); } catch (e) { return null; } })() },
      cubrir, deudas, avisos,
      diasConPagos: dias,
      deudasDatos: Datos.deudas().map(d => ({ id: d.id, nombre: d.nombre, monto: d.monto, saldo: red(Datos.saldoReparto(d.id)), prioridad: d.prioridad, nota: d.nota })),
      planeados: Almacen.leerPlaneados(),
      planesDeuda: Almacen.leerPlanesDeuda(),
      movimientos: movs.map(m => ({ id: m.id, tipo: m.tipo, fecha: m.fecha, monto: m.monto, categoria: m.categoria, nota: m.nota,
                                   tipoIngreso: m.tipoIngreso, deudaId: m.deudaId, razonFueraPlan: m.razonFueraPlan, creado: m.creado })),
      jornadas: Almacen.leerJornadas(),
      notasConsejero: Almacen.leer("notasConsejero") || [],
      // Más → Pagos fijos: esenciales y suscripciones (el consejero puede SUGERIR pausar una; nunca la pausa él)
      pagosFijos: (() => {
        try {
          const fila = x => ({ id: x.id, nombre: x.nombre, monto: x.monto, venceDia: x.venceDia, variable: !!x.variable, estado: x.estado, grupo: x.grupo });
          const es = PagosFijos.lista("esencial").map(fila), su = PagosFijos.lista("suscripcion").map(fila);
          return { esenciales: es, suscripciones: su, totalEsenciales: PagosFijos.total(es), totalSuscripciones: PagosFijos.total(su),
                   suscripcionesActivas: su.filter(x => x.estado === "activo").length };
        } catch (e) { return { error: e.message }; }
      })(),
      prioridad: (() => { try { return { ...Prioridad.niveles(), cambiada: Prioridad.cambiado() }; } catch (e) { return { error: e.message }; } })()
    };
  });
  r.errores = errores;
  const salida = JSON.stringify(r, null, 1);
  if (process.argv[3]) fs.writeFileSync(process.argv[3], salida); else console.log(salida);
  await b.close();
})();
