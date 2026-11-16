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
process.env.TZ = "America/New_York"; // FECHA=AAAA-MM-DDTHH:MM se lee como hora de Nueva York aunque la máquina esté en UTC
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

  // Las reglas del consejero (consejero.json, junto a datos.json o en CONSEJERO=ruta) para medir si se cumplen
  const archivoConsejero = process.env.CONSEJERO || path.join(path.dirname(path.resolve(archivo)), "consejero.json");
  if (fs.existsSync(archivoConsejero)) {
    try { claves.consejero = JSON.parse(fs.readFileSync(archivoConsejero, "utf8")); } catch (e) { /* sin reglas: se omite */ }
  }

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
    // 1) Gasto por semana y categoría (últimas 8 semanas) con promedio y marcas: la cuenta vive en la app (Patrones.porSemana)
    const gastosPorSemana = Patrones.porSemana();
    // 2) Cómo van las reglas del consejero (veces y monto vs. su límite, periodo anterior, razones dadas)
    const reglasEstado = (() => {
      try {
        return Vigilante.reglas().map(r => {
          const l = Vigilante.estado(r);
          const per = r.periodo || "semana";
          const fAnt = per === "dia" ? Jornadas.sumarDias(hoyClave, -1)
            : per === "mes" ? (() => { const d = new Date(hoyClave.slice(0, 7) + "-01T12:00:00"); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); })()
            : Jornadas.sumarDias(hoyClave, -7);
          const ant = Vigilante.llevas(r, fAnt);
          const razones = Almacen.leerMovimientos()
            .filter(m => m.fecha >= l.per.desde && m.fecha <= l.per.hasta && Vigilante.entra(r, m) && m.razonFueraPlan)
            .map(m => ({ fecha: m.fecha, monto: m.monto, nota: m.nota, razon: m.razonFueraPlan }));
          return { id: r.id, nombre: r.nombre, periodo: per, desde: l.per.desde, hasta: l.per.hasta,
                   veces: l.veces, maxVeces: r.maxVeces ?? null, monto: l.monto, maxMonto: r.maxMonto ?? null,
                   rota: l.pasado,
                   periodoAnterior: { veces: ant.veces, monto: ant.monto }, razones };
        });
      } catch (e) { return { error: e.message }; }
    })();
    // 3) Ingreso: lo que la app espera de esta semana (estimación o cheque real) y el historial de cheques
    const ingreso = (() => {
      try {
        const c = Plan.calcular();
        const lista = Jornadas.chequesReales().slice(0, 12)
          .map(x => ({ fecha: x.fecha, bruto: x.bruto, neto: x.neto, horas: x.horas ?? null, enfermedad: x.enfermedad ?? 0, origen: x.origen, proporcion: Math.round(x.neto / x.bruto * 10000) / 10000 }));
        return {
          semana: { lunes: Plan.claveSemana(), origen: c.usaReal ? "cheque real" : "estimación", netoQueUsaLaApp: red(c.neto),
                    estimadoNeto: red(c.estimado.neto), estimadoBruto: red(c.estimado.bruto), horasPlan: c.horasPlan,
                    horasEnfermedad: Plan.enfermedadEfectiva(c.plan), chequeRealRegistrado: red(c.real.total) },
          proporcionNeto: Math.round(Jornadas.proporcionNeto() * 10000) / 10000,
          proporcionDe: lista.length >= 2 ? "últimos cheques reales" : "mis datos (aún no hay 2 cheques reales con horas)",
          ultimosCheques: lista,
          // Para no comparar semanas distintas: el cheque de un viernes paga las horas de la SEMANA ANTERIOR
          nota: "chequeRealRegistrado es lo que cobraste este viernes (paga las horas de la semana pasada). estimadoNeto es lo que se espera por las horas de ESTA semana y se cobra el viernes que sigue. No los compares entre sí; compara cada cheque real con lo estimado para sus mismas horas (ultimosCheques → proporcion)."
        };
      } catch (e) { return { error: e.message }; }
    })();
    // 4) Cifras que antes estaban escritas en las instrucciones: ahora salen de los datos de hoy
    const hechos = (() => {
      try {
        const plan = Almacen.leerPlan();
        const linea = Plan.gastosFijos().lineas.find(l => l.id === Plan.ID_GASTO_PRESTAMO);
        const saldo = red(Datos.saldoDeuda(Plan.ID_DEUDA_PRESTAMO));
        const semanas = linea && linea.monto > 0 ? Math.ceil(saldo / linea.monto - 0.005) : 0;
        const cobro = Jornadas.periodoProximoCheque().cobro;
        return {
          colchon: { meta: red(Plan.metaColchon()), actual: red(plan.sobres.colchon) },
          prestamoSemanal: { activo: !!linea && saldo > 0, montoSemanal: linea ? red(linea.monto) : 0, saldo, semanasRestantes: semanas,
                             ultimoPagoAprox: semanas > 0 ? Jornadas.sumarDias(cobro, 7 * (semanas - 1)) : null,
                             quedaLibreDesdeAprox: semanas > 0 ? Jornadas.sumarDias(cobro, 7 * semanas) : null },
          gastosFijosSemanales: red(Plan.gastosFijos().total)
        };
      } catch (e) { return { error: e.message }; }
    })();
    return {
      hoy: hoyClave,
      versionApp: VERSION_APP.numero,
      dineroHoy: red(Dinero.actual()),
      semana: { lunes: sem.lunes, domingo: sem.domingo, libre: sem.libre, guardar: sem.guardar,
        // Lo que ya salió esta semana (la misma cuenta que "A dónde va"): gastos aparte de pagos a deudas
        gastado: (() => { const r = Resumen.calcular("semana"); return { gastos: red(r.totalGastado), pagosDeuda: red(r.pagosDeudas), total: red(r.totalGastado + r.pagosDeudas), ingresos: red(r.ingresos) }; })(),
        // Lo que FALTA pagar de hoy al domingo según la proyección (NO es lo gastado). Antes se llamaba "totalGastos".
        porPagarHastaDomingo: sem.totalGastos,
                hueco: sem.hueco, huecoAntes: sem.huecoAntes },
      faltante: f ? { ...f, texto: Proyeccion.textoFaltante(f) } : null,
      renta: { atrasada: red(Proyeccion.rentaAtrasada()), estado: (() => { try { return Proyeccion.estadoRenta(pr); } catch (e) { return null; } })() },
      // Día de libertad = la última de las dos fechas (renta atrasada y préstamo del amigo) que calcula la app.
      // Cambia a saltos (unos pocos dólares pueden moverlo semanas): se calcula SIEMPRE con los datos de hoy.
      diaLibertad: (() => {
        if (!deudas || deudas.error) return null;
        const nunca = (deudas.hayRenta && !deudas.rentaCero) || (deudas.hayAmigo && !deudas.amigoCero);
        const fs = [deudas.hayRenta && deudas.rentaCero, deudas.hayAmigo && deudas.amigoCero].filter(x => x && x !== "ya").sort();
        // sensibilidad: cuánto se mueve la fecha con $50 más o menos hoy (para que el consejero lo diga)
        const sens = monto => { try { const d = Proyeccion.planDeudas({ ajustes: [{ fecha: hoyClave, monto }] }); return { rentaCero: d.rentaCero, amigoCero: d.amigoCero }; } catch (e) { return null; } };
        return { fecha: nunca ? null : (fs.slice(-1)[0] || "ya"), masDeDias: nunca ? deudas.dias : null,
                 rentaCero: deudas.rentaCero, amigoCero: deudas.amigoCero, calculadoEl: hoyClave, dineroHoy: red(Dinero.actual()),
                 sensibilidad: { con50Menos: sens(50), con50Mas: sens(-50) } };
      })(),
      gastosPorSemana, reglasEstado, ingreso, hechos,
      cubrir, deudas, avisos,
      diasConPagos: dias,
      deudasDatos: Datos.deudas().map(d => ({ id: d.id, nombre: d.nombre, monto: d.monto, saldo: red(Datos.saldoReparto(d.id)), prioridad: d.prioridad, nota: d.nota })),
      planeados: (() => { try { return Planeados.paraConsejero(); } catch (e) { return Almacen.leerPlaneados(); } })(),
      planesDeuda: Almacen.leerPlanesDeuda(),
      movimientos: movs.map(m => ({ id: m.id, tipo: m.tipo, fecha: m.fecha, monto: m.monto, categoria: m.categoria, nota: m.nota,
                                   tipoIngreso: m.tipoIngreso, deudaId: m.deudaId, razonFueraPlan: m.razonFueraPlan, creado: m.creado })),
      jornadas: Almacen.leerJornadas(),
      notasConsejero: Almacen.leer("notasConsejero") || [],
      acuerdos: (() => { try { return Acuerdos.paraConsejero(); } catch (e) { return { error: e.message }; } })(),
      // Más → Pagos fijos: esenciales y suscripciones (el consejero puede SUGERIR pausar una; nunca la pausa él)
      pagosFijos: (() => {
        try {
          const fila = x => ({ id: x.id, nombre: x.nombre, monto: x.monto, venceDia: x.venceDia, variable: !!x.variable, estado: x.estado, grupo: x.grupo });
          const es = PagosFijos.lista("esencial").map(fila), su = PagosFijos.lista("suscripcion").map(fila);
          return { recibos: Almacen.leerRecibos().map(x => ({ pagoId: x.pagoId, mes: x.mes, monto: x.monto })), esenciales: es, suscripciones: su, totalEsenciales: PagosFijos.total(es), totalSuscripciones: PagosFijos.total(su),
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
