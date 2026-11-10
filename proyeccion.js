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
 * en el orden del Bloque 11 dentro de cada día: cheque, renta, préstamo, transporte, comida, facturas.
 */
const Proyeccion = {
  // ---------- Días libres planeados ----------
  _cache: null, // mientras se calcula, días libres y jornadas se leen una sola vez

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
    const lunesTrabajo = Jornadas.sumarDias(Plan.claveSemana(Jornadas.aFecha(cobro)), -7);
    const s = this.horasSemana(lunesTrabajo);
    return { monto: redondear(Jornadas.netoDeHoras(s.horas)), horas: s.horas, libres: s.diasLibres, semana: lunesTrabajo };
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
    const { excluir = null, chequeEscenario = null, inicial: inicialManual = null, horizonte = null } = opciones;
    const cfg = Mover.config();
    const hoyClave = hoy();
    const fin = Jornadas.sumarDias(hoyClave, (horizonte || cfg.horizonte) - 1);
    const lineas = [];
    const cheques = [];

    const diaCheque = Math.max(0, Jornadas.DIAS.indexOf(cfg.chequeDia));
    const inicioBusqueda = Jornadas.sumarDias(hoyClave, -cfg.chequeRetraso);
    let cobro = Jornadas.sumarDias(inicioBusqueda, (diaCheque - Jornadas.aFecha(inicioBusqueda).getDay() + 7) % 7);
    const comida = Vencimientos.gasto("comida");
    const transporte = Vencimientos.gasto("transporte");
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
      const diasTransporte = this.horasSemana(lunes).diasConTrabajo;
      if (transporte && diasTransporte > 0) lineas.push({ fecha: disponible, orden: 3, tipo: "semanal", id: "transporte",
        nombre: `Transporte (${dinero(transporte.porDia)} × ${diasTransporte} ${diasTransporte === 1 ? "día" : "días"})`,
        monto: -redondear(transporte.porDia * diasTransporte) });
      if (comida) lineas.push({ fecha: disponible, orden: 4, tipo: "semanal", id: "comida", nombre: "Comida", monto: -comida.monto });
    }

    // Vencimientos sin pagar (con las fechas movidas)
    Vencimientos.entre(hoyClave, fin).forEach(item => {
      if (item.alerta || item.claveMov === excluir) return;
      const pendientes = item.partes.filter(p => !p.pagado);
      const pendiente = pendientes.reduce((s, p) => s + p.monto, 0);
      if (pendiente <= 0) return;
      const orden = item.id === "renta" ? 1 : item.id === "prestamo" ? 2 : item.inmediato ? 5 : 10;
      lineas.push({ fecha: item.fecha, orden, tipo: "pago", id: item.id, nombre: item.nombre, letra: item.letra,
        detalle: pendientes.length > 1 ? pendientes.map(p => dinero(p.monto)).join(" + ") : "",
        monto: -pendiente, movido: item.movido || null, claveMov: item.claveMov, inmediato: !!item.inmediato });
    });
    lineas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden);

    const inicial = inicialManual != null ? inicialManual : Dinero.actual();
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
      desde: hoyClave, hasta: fin, porDia, inicial, lineas,
      cheques: lineas.filter(l => l.tipo === "cheque").map(l => l.fecha),
      chequesInfo: cheques
    };
  },

  // ---------- Largo plazo: ¿cuándo se pagan las deudas? ----------
  // Con la misma cuenta y un horizonte largo: en cada cheque, el dinero que nunca hace falta
  // más adelante (el saldo más bajo de ahí en adelante) se reparte con las reglas del Bloque 11
  // y del colchón (Plan.repartirExtra): renta atrasada → internet atrasado → colchón → amigo → plan de luz.
  planDeudas(opciones = {}) {
    const dias = opciones.dias || 730;
    const pr = this.calcular({ chequeEscenario: opciones.chequeEscenario ?? null, horizonte: dias });
    const orden = Plan.deudasEnOrden();
    const saldos = {};
    orden.forEach(d => { saldos[d.id] = Math.max(0, Datos.saldoDeuda(d.id)); });
    const plan = Almacen.leerPlan();
    let colchon = plan.sobres.colchon;
    const meta = Plan.metaColchon();
    const pct = plan.porcentajeColchon / 100;

    // Saldo más bajo de cada día hasta el final
    const fechas = Object.keys(pr.porDia).sort();
    const minDesde = {};
    let minimo = Infinity;
    for (let i = fechas.length - 1; i >= 0; i--) {
      minimo = Math.min(minimo, pr.porDia[fechas[i]].saldoFin);
      minDesde[fechas[i]] = minimo;
    }

    const r = {
      dias,
      rentaCero: saldos.deudaRenta != null && saldos.deudaRenta <= 0.005 ? "ya" : null,
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
      }
      if (!r.rentaCero && r.hayRenta && saldos.deudaRenta <= 0.005) r.rentaCero = fecha;
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
      `días libres: ${this.diasLibresEntre(pr.desde, hasta)}.`;
  }
};
