/*
 * PROYECCIÓN (Bloque 13): EL ÚNICO CÁLCULO del saldo día por día y de los cheques esperados.
 * Lo usan "¿Me alcanza?", "¿Y si cobro...?", "Mover este pago", el Plan de la semana,
 * la tarjeta "Próximo cheque" y el calendario.
 *
 *   dinero que tengo hoy (el número de arriba)
 *   + cheques esperados: cada semana (lunes a domingo) se cobra el viernes siguiente.
 *       Horas = jornadas registradas; los días sin registrar: días de trabajo que no son libres × horas por día.
 *       Neto con el cálculo del Bloque 7. Si ya registré el cheque real de esa semana, cuenta el real.
 *   − todos los vencimientos y gastos semanales (comida; transporte solo los días que se trabaja),
 *   − la renta: el saldo del portal (deudaRenta) con fecha límite el próximo día 15 (o las fechas del
 *     acuerdo de pago), y cada renta nueva del día 1 con fecha límite el 15 de ese mes,
 * en el orden del Bloque 11 dentro de cada día: cheque, renta, préstamo, transporte, comida, facturas.
 */
const Proyeccion = {
  // ---------- Días libres planeados ----------
  _cache: null, // mientras se calcula, días libres y jornadas se leen una sola vez

  // ---------- Bloque 16: colchón y comida en modo extremo ----------
  // El colchón es parte de "Dinero que tengo": la cuenta lo incluye, salvo que se pida protegerlo.
  protegerColchon() {
    const f = Almacen.leerFuturo();
    return f.protegerColchon != null ? !!f.protegerColchon : Datos.actual.proteger_colchon === true;
  },

  colchon() {
    return Math.max(0, Almacen.leerPlan().sobres.colchon || 0);
  },

  comidaExtrema() {
    return Almacen.leerFuturo().comidaExtrema === true;
  },

  comidaMinima() {
    const r = (Datos.actual.reglasDePrioridad || {}).nivel1 || {};
    return r.comidaMinima ?? null;
  },

  libres() {
    return this._cache ? this._cache.libres : Almacen.leerDiasLibres();
  },

  esLibre(fecha) {
    return this.libres().some(d => fecha >= d.desde && fecha <= (d.hasta || d.desde));
  },

  diasLibresEntre(desde, hasta) {
    let n = 0;
    for (let f = desde; f <= hasta; f = Jornadas.sumarDias(f, 1)) if (this.esLibre(f)) n++;
    return n;
  },

  esDiaDeTrabajo(fecha) {
    const dias = Jornadas.config().diasDeTrabajo || [];
    return dias.includes(Jornadas.DIAS[Jornadas.aFecha(fecha).getDay()]);
  },

  // ---------- Horas de una semana (lunes a domingo) ----------
  horasSemana(lunes) {
    const c = Jornadas.config();
    const jornadas = {};
    (this._cache ? this._cache.jornadas : Almacen.leerJornadas()).forEach(j => { jornadas[j.fecha] = j; });
    const r = { horas: 0, horasRegistradas: 0, diasRegistrados: 0, diasTrabajados: 0,
                diasFaltan: 0, diasLibres: 0, diasConTrabajo: 0 };
    for (let i = 0; i < 7; i++) {
      const f = Jornadas.sumarDias(lunes, i);
      const j = jornadas[f];
      let h = 0;
      if (j) {                                   // registrado (también "No trabajé" = 0)
        h = j.horas;
        r.horasRegistradas += j.horas;
        r.diasRegistrados++;
        if (j.horas > 0) r.diasTrabajados++;
      } else if (this.esLibre(f)) {              // día libre planeado: 0 horas
        if (this.esDiaDeTrabajo(f)) r.diasLibres++;
      } else if (this.esDiaDeTrabajo(f)) {       // día de trabajo sin registrar
        h = c.horasPorDia;
        r.diasFaltan++;
      }
      r.horas += h;
      if (h > 0) r.diasConTrabajo++;
    }
    return r;
  },

  // Cheque esperado de un día de cobro: paga la semana (lunes a domingo) anterior
  chequeEsperado(cobro) {
    // Bloque 17: pago por hora, días de trabajo, etc. como valen en la semana trabajada
    const lunesTrabajo = Jornadas.sumarDias(Plan.claveSemana(Jornadas.aFecha(cobro)), -7);
    return Datos.conFecha(lunesTrabajo, () => {
      const s = this.horasSemana(lunesTrabajo);
      return { monto: redondear(Jornadas.netoDeHoras(s.horas)), horas: s.horas, libres: s.diasLibres, semana: lunesTrabajo };
    });
  },

  // ---------- Saldo día por día ----------
  // opciones: { excluir: claveMov de un pago que no se cuenta,
  //             chequeEscenario: monto para el próximo cheque sin registrar (¿Y si cobro...?),
  //             inicial: dinero de hoy escrito a mano (¿Me alcanza?); si no, el número de arriba,
  //             horizonte: días a calcular (por defecto el de mis datos, 30) }
  calcular(opciones = {}) {
    const propio = !this._cache;
    if (propio) this._cache = { libres: Almacen.leerDiasLibres(), jornadas: Almacen.leerJornadas() };
    try {
      return this._calcular(opciones);
    } finally {
      if (propio) this._cache = null;
    }
  },

  _calcular(opciones) {
    const { excluir = null, chequeEscenario = null, inicial: inicialManual = null, horizonte = null, excluirPlaneado = null } = opciones;
    const proteger = opciones.proteger ?? this.protegerColchon();
    const extrema = (opciones.comidaExtrema ?? this.comidaExtrema()) && this.comidaMinima() != null;
    const cfg = Mover.config();
    const hoyClave = hoy();
    const fin = Jornadas.sumarDias(hoyClave, (horizonte || cfg.horizonte) - 1);
    const lineas = [];
    const cheques = [];

    const diaCheque = Math.max(0, Jornadas.DIAS.indexOf(cfg.chequeDia));
    const inicioBusqueda = Jornadas.sumarDias(hoyClave, -cfg.chequeRetraso);
    let cobro = Jornadas.sumarDias(inicioBusqueda, (diaCheque - Jornadas.aFecha(inicioBusqueda).getDay() + 7) % 7);
    const ingresos = Almacen.leerMovimientos().filter(esCheque); // "Otro ingreso" no reemplaza al cheque
    let escenarioUsado = false;
    for (; Jornadas.sumarDias(cobro, cfg.chequeRetraso) <= fin; cobro = Jornadas.sumarDias(cobro, 7)) {
      const disponible = Jornadas.sumarDias(cobro, cfg.chequeRetraso);
      const lunes = Plan.claveSemana(Jornadas.aFecha(cobro));
      const domingo = Jornadas.sumarDias(lunes, 6);
      const real = ingresos.filter(m => m.fecha >= lunes && m.fecha <= domingo);
      const esperado = this.chequeEsperado(cobro);
      if (real.length) {
        cheques.push({ fecha: disponible, monto: real.reduce((s, m) => s + m.monto, 0), origen: "real" });
      } else {
        let monto = esperado.monto, origen = "esperado";
        if (chequeEscenario != null && !escenarioUsado) { monto = chequeEscenario; origen = "escenario"; escenarioUsado = true; }
        cheques.push({ fecha: disponible, monto, origen, horas: esperado.horas, libres: esperado.libres });
        lineas.push({ fecha: disponible, orden: 0, tipo: "cheque", id: "cheque", monto, origen,
          nombre: origen === "escenario" ? "Cheque (este escenario)"
            : `Cheque (${redondear(esperado.horas)} h${esperado.libres ? `, ${esperado.libres} ${esperado.libres === 1 ? "día libre" : "días libres"}` : ""})` });
      }
      // Transporte: solo los días que se trabaja en la semana del cobro; comida igual
      // (Bloque 17: con las cifras que valen ese día)
      const { comida, transporte, diasTransporte, minima } = Datos.conFecha(disponible, () => ({
        comida: Vencimientos.gasto("comida"), transporte: Vencimientos.gasto("transporte"),
        diasTransporte: this.horasSemana(lunes).diasConTrabajo, minima: this.comidaMinima() }));
      if (transporte && diasTransporte > 0) lineas.push({ fecha: disponible, orden: 3, tipo: "semanal", id: "transporte",
        nombre: `Transporte (${dinero(transporte.porDia)} × ${diasTransporte} ${diasTransporte === 1 ? "día" : "días"})`,
        monto: -redondear(transporte.porDia * diasTransporte) });
      if (comida) lineas.push({ fecha: disponible, orden: 4, tipo: "semanal", id: "comida",
        nombre: extrema && minima != null ? "Comida (modo extremo)" : "Comida", monto: -(extrema && minima != null ? minima : comida.monto) });
    }

    // Vencimientos sin pagar (con las fechas movidas)
    Vencimientos.entre(hoyClave, fin).forEach(item => {
      if (item.alerta || item.claveMov === excluir) return;
      if (item.id === "renta") return; // la renta se cuenta aparte (rentaLineas)
      if (excluirPlaneado && item.planeadoId === excluirPlaneado) return;
      const pendientes = item.partes.filter(p => !p.pagado);
      const pendiente = pendientes.reduce((s, p) => s + p.monto, 0);
      if (pendiente <= 0) return;
      const orden = item.id === "renta" ? 1 : item.id === "prestamo" ? 2 : item.inmediato ? 5 : item.planeado ? 15 : 10;
      lineas.push({ fecha: item.fecha, orden, tipo: "pago", id: item.id, letra: item.letra,
        nombre: item.planeado ? `${item.nombre} (planeado)` : item.nombre,
        detalle: pendientes.length > 1 ? pendientes.map(p => dinero(p.monto)).join(" + ") : "",
        monto: -pendiente, movido: item.movido || null, claveMov: item.claveMov, inmediato: !!item.inmediato,
        planeado: !!item.planeado });
    });
    lineas.push(...this.rentaLineas(hoyClave, fin));
    // Bloque 18: líneas que solo se simulan (ej.: un préstamo); no se guardan en ningún lado
    (opciones.extras || []).forEach(x => {
      if (x.fecha >= hoyClave && x.fecha <= fin) lineas.push({ fecha: x.fecha, orden: x.monto >= 0 ? 0.5 : 16, tipo: "simulado",
        id: "simulado", nombre: x.nombre, monto: x.monto });
    });
    lineas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden);

    // Colchón protegido: esa parte del dinero no se cuenta como disponible
    const colchon = this.colchon();
    const inicial = (inicialManual != null ? inicialManual : Dinero.actual()) - (proteger ? colchon : 0);
    let saldo = inicial;
    let chequesHasta = 0;
    const porDia = {};
    for (let f = hoyClave; f <= fin; f = Jornadas.sumarDias(f, 1)) {
      const delDia = lineas.filter(l => l.fecha === f);
      delDia.forEach(l => {
        saldo = redondear(saldo + l.monto);
        l.saldo = saldo;
        if (l.tipo === "cheque") chequesHasta += l.monto;
      });
      // saldoSinCheques: lo que quedaría sin ningún cheque (para saber si un pago depende de un cheque)
      porDia[f] = { saldoFin: saldo, saldoSinCheques: redondear(saldo - chequesHasta), lineas: delDia };
    }
    return {
      desde: hoyClave, hasta: fin, porDia, inicial, lineas, colchon, protegido: proteger, comidaExtrema: extrema,
      cheques: lineas.filter(l => l.tipo === "cheque").map(l => l.fecha),
      chequesInfo: cheques
    };
  },

  // ---------- Renta (Nivel 1) ----------
  // Día límite (15) del mes de una fecha
  limiteRenta(fecha) {
    const d = Jornadas.aFecha(fecha);
    return Vencimientos.fechaDelMes(d.getFullYear(), d.getMonth(), Calendario.diaDelMes("accionLegal", 15));
  },

  // Acuerdo de pago registrado en Datos fijos: [{ fecha, monto }]
  acuerdoRenta() {
    return (Almacen.leer("acuerdoRenta") || []).filter(p => p.fecha && p.monto > 0)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  },

  rentaLineas(hoyClave, fin) {
    const lineas = [];
    const mes = f => Jornadas.aFecha(f).toLocaleDateString("es", { month: "long" });
    // 1) Lo que debo hoy en el portal: con fecha límite el próximo 15, o en las fechas del acuerdo
    let resta = Math.max(0, Datos.saldoDeuda(Plan.ID_DEUDA_RENTA));
    let limite = this.limiteRenta(hoyClave);
    if (limite < hoyClave) { const d = Jornadas.aFecha(hoyClave); limite = this.limiteRenta(Resumen.aClave(new Date(d.getFullYear(), d.getMonth() + 1, 1))); }
    const acuerdo = this.acuerdoRenta().filter(p => p.fecha >= hoyClave);
    acuerdo.forEach(p => {
      if (resta <= 0.005) return;
      const monto = redondear(Math.min(p.monto, resta));
      resta = redondear(resta - monto);
      lineas.push({ fecha: p.fecha, monto: -monto, nombre: "Renta (acuerdo de pago)", atrasada: true });
    });
    if (resta > 0.005) lineas.push({ fecha: limite, monto: -resta, atrasada: true,
      nombre: acuerdo.length ? "Renta (resto del saldo)" : "Renta (saldo del portal)" });
    // 2) Cada renta nueva: se suma el día 1 y vence el 15 de ese mes
    Datos.cargosRenta(fin).filter(c => c.fecha > hoyClave).forEach(c => {
      const f = [this.limiteRenta(c.fecha), c.fecha].sort().slice(-1)[0];
      lineas.push({ fecha: f, monto: -c.monto, nombre: `Renta de ${mes(c.fecha)}`, cargo: c.fecha });
    });
    return lineas.filter(l => l.fecha <= fin).map(l => ({ ...l, orden: 1, tipo: "pago", id: "renta", letra: "R" }));
  },

  // ¿La renta queda cubierta antes de su fecha límite? (la primera que viene en la cuenta)
  estadoRenta(pr) {
    const rentas = pr.lineas.filter(l => l.id === "renta");
    if (!rentas.length) return null;
    const fecha = rentas[0].fecha;
    const delDia = rentas.filter(l => l.fecha === fecha);
    const monto = redondear(delDia.reduce((s, l) => s - l.monto, 0));
    const saldo = delDia[delDia.length - 1].saldo;
    return { fecha, monto, falta: redondear(Math.min(monto, Math.max(0, -saldo))), nombre: delDia.map(l => l.nombre).join(" + ") };
  },

  // ---------- Largo plazo: ¿cuándo se pagan las deudas? ----------
  // Con la misma cuenta y un horizonte largo: en cada cheque, el dinero que nunca hace falta
  // más adelante (el saldo más bajo de ahí en adelante) se reparte con las reglas del Bloque 11
  // y del colchón (Plan.repartirExtra): renta atrasada → internet atrasado → colchón → amigo → plan de luz.
  // opciones: { chequeEscenario, dias, pr: proyección larga ya calculada, ajustes: [{ fecha, monto }] gastos extra }
  planDeudas(opciones = {}) {
    const dias = opciones.dias || 730;
    const pr = opciones.pr || this.calcular({ chequeEscenario: opciones.chequeEscenario ?? null, horizonte: dias,
                                             excluirPlaneado: opciones.excluirPlaneado || null });
    const ajustes = opciones.ajustes || [];
    const orden = Plan.deudasEnOrden();
    const saldos = {};
    orden.forEach(d => { saldos[d.id] = Math.max(0, Datos.saldoDeuda(d.id)); });
    // Bloque 18: simular que una deuda baja (ej.: pagar renta atrasada con un préstamo)
    Object.entries(opciones.deudaAjustes || {}).forEach(([id, cambio]) => {
      if (saldos[id] != null) saldos[id] = Math.max(0, saldos[id] + cambio);
    });
    // La renta ya está en la cuenta día por día: no se reparte otra vez.
    // "Renta atrasada en cero" = primer día, desde su fecha límite, en que el saldo queda en 0 o más.
    const saldoRenta = saldos.deudaRenta;
    let rentaCero = null;
    if (saldoRenta != null) {
      if (saldoRenta <= 0.005) rentaCero = "ya";
      else {
        const atr = pr.lineas.filter(l => l.id === "renta" && l.atrasada);
        const ultima = atr.length ? atr[atr.length - 1].fecha : null;
        if (ultima) rentaCero = Object.keys(pr.porDia).sort().find(f => f >= ultima && pr.porDia[f].saldoFin >= -0.005) || null;
      }
      saldos.deudaRenta = 0;
    }
    const plan = Almacen.leerPlan();
    let colchon = plan.sobres.colchon;
    const meta = Plan.metaColchon();
    const pct = plan.porcentajeColchon / 100;

    // Saldo más bajo de cada día hasta el final
    const fechas = Object.keys(pr.porDia).sort();
    const minDesde = {};
    let minimo = Infinity;
    const restar = f => ajustes.reduce((s, a) => s + (a.fecha <= f ? a.monto : 0), 0);
    for (let i = fechas.length - 1; i >= 0; i--) {
      minimo = Math.min(minimo, pr.porDia[fechas[i]].saldoFin - restar(fechas[i]));
      minDesde[fechas[i]] = minimo;
    }

    const r = {
      dias,
      colchonLleno: colchon >= meta - 0.005 ? "ya" : null,
      rentaCero,
      amigoInicio: null,
      amigoCero: saldos.deudaAmigo != null && saldos.deudaAmigo <= 0.005 ? "ya" : null,
      hayRenta: saldos.deudaRenta != null,
      hayAmigo: saldos.deudaAmigo != null
    };
    let apartado = 0; // lo que ya se usó para deudas o colchón (no está disponible después)
    pr.cheques.forEach(fecha => {
      const libre = redondear(minDesde[fecha] - apartado);
      if (libre > 0.005) {
        const rep = Plan.repartirExtra(libre, { pct, colchon, meta, saldos, orden });
        const usado = Object.values(rep.deudas).reduce((s, m) => s + m, 0) + rep.aColchon;
        apartado += usado;
        colchon += rep.aColchon;
        if (rep.deudas.deudaAmigo && !r.amigoInicio) r.amigoInicio = fecha;
        if (!r.colchonLleno && colchon >= meta - 0.005) r.colchonLleno = fecha;
      }
      if (!r.amigoCero && r.hayAmigo && saldos.deudaAmigo <= 0.005) r.amigoCero = fecha;
    });
    return r;
  },

  // Último cheque que llega en o antes de una fecha
  ultimoCheque(pr, fecha) {
    return pr.cheques.filter(c => c <= fecha).slice(-1)[0] || null;
  },

  // ¿Se paga en esa fecha? Mira el saldo al final del día con todo lo de ese día ya pagado.
  estadoEnFecha(pr, fecha) {
    const d = pr.porDia[fecha];
    if (!d) return null;
    const alcanza = d.saldoFin >= -0.005;
    const conCheque = alcanza && d.saldoSinCheques < -0.005 ? this.ultimoCheque(pr, fecha) : null;
    return { alcanza, conCheque, falta: alcanza ? 0 : redondear(-d.saldoFin) };
  },

  // Línea pequeña: "Cuenta hecha con: dinero hoy $X, cheques [fechas y montos], días libres: N."
  textoCuenta(pr, hasta = pr.hasta) {
    const fecha = f => Jornadas.aFecha(f).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" }).replace(/[.,]/g, "");
    const cheques = pr.chequesInfo.filter(c => c.fecha <= hasta).map(c =>
      `${fecha(c.fecha)} ${dinero(c.monto)}` +
      (c.origen === "real" ? " (real, ya en tu dinero)" : c.origen === "escenario" ? " (este escenario)" : ` (${redondear(c.horas)} h)`));
    const tengo = pr.inicial < 0 ? `−${dinero(-pr.inicial)}` : dinero(pr.inicial);
    return `Cuenta hecha con: dinero hoy ${tengo}, cheques ${cheques.length ? cheques.join(", ") : "ninguno"}, ` +
      `días libres: ${this.diasLibresEntre(pr.desde, hasta)}` +
      (pr.protegido && pr.colchon > 0 ? `, colchón protegido ${dinero(pr.colchon)} (no se cuenta)` : "") +
      (pr.comidaExtrema ? ", comida en modo extremo" : "") + ".";
  },

  // ---------- Bloque 16: arrastre ----------
  // Primer pago de Nivel 1 que no se cubre completo: cuánto falta y hasta qué cheque se arrastra.
  arrastre(pr) {
    const N1 = ["renta", "prestamo", "comida", "transporte"];
    const l = pr.lineas.find(x => N1.includes(x.id) && x.monto < 0 && x.saldo < -0.005 && pr.porDia[x.fecha]);
    if (!l) return null;
    const monto = -l.monto;
    const queda = redondear(l.saldo + monto);           // lo que había justo antes de ese pago
    const falta = redondear(Math.min(monto, -l.saldo)); // lo que no alcanza de ese pago
    const antes = pr.lineas.filter(x => x.fecha < l.fecha || (x.fecha === l.fecha && x.orden < l.orden));
    const entra = redondear(antes.filter(x => x.tipo === "cheque").reduce((s, x) => s + x.monto, 0));
    const sale = redondear(-antes.filter(x => x.monto < 0).reduce((s, x) => s + x.monto, 0));
    // Se arrastra hasta el primer cheque después del cual el saldo vuelve a 0 o más
    const hasta = pr.cheques.find(c => c > l.fecha && pr.porDia[c].saldoFin >= -0.005) || null;
    const dias = Math.max(1, Math.round((Jornadas.aFecha(l.fecha) - Jornadas.aFecha(pr.desde)) / 86400000));
    const semanas = Math.max(1, Math.ceil(dias / 7));
    return { id: l.id, nombre: l.nombre, fecha: l.fecha, monto, inicial: pr.inicial, entra, sale,
             queda: Math.max(0, queda), falta, hasta, semanas, porSemana: redondear(falta / semanas) };
  }
};
