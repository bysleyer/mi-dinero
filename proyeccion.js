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

  // Gastos de Comida ya registrados que cuentan en "Dinero que tengo hoy" (los mismos que usa Dinero.actual)
  gastosDeComida() {
    const di = Almacen.leerDineroInicial();
    const desde = di ? di.momento : "";
    return Almacen.leerMovimientos().filter(m => m.tipo === "gasto" && m.categoria === "Comida" && (!desde || m.creado > desde) && !m.incluidoEnCorreccion);
  },

  // ---------- Transporte: días que se reservan ----------
  // Los días de transporte de una semana vienen de "Días de trabajo (transporte)" en Datos fijos (diasPorSemana):
  // cuenta de lunes en adelante, quita días libres y feriados, quita un día registrado como "No trabajé",
  // y suma un día fuera de ese rango que sí trabajaste (jornada registrada). Sin ese número, usa los días de trabajo de siempre.
  diaConTransporte(fecha, i, n, jornadas) {
    const j = jornadas[fecha];
    if (j) return j.horas > 0;
    if (n == null) return this.esDiaDeTrabajo(fecha) && !this.esLibre(fecha);
    return i < n && !this.esLibre(fecha);
  },

  diasTransporte(lunes, n, desde = null) {
    const jornadas = {};
    (this._cache ? this._cache.jornadas : Almacen.leerJornadas()).forEach(j => { jornadas[j.fecha] = j; });
    let dias = 0;
    for (let i = 0; i < 7; i++) {
      const f = Jornadas.sumarDias(lunes, i);
      if (desde && f < desde) continue;
      if (this.diaConTransporte(f, i, n, jornadas)) dias++;
    }
    return dias;
  },

  // Lo que todavía hay que reservar de transporte en ESTA semana: lo que falta de hoy + los días que quedan hasta el domingo.
  // "Eso fue todo el transporte de hoy" (plan.transporteCerradoEl) deja de reservar lo que falta de hoy.
  transporteDeEstaSemana() {
    const hoyClave = hoy();
    const t = Datos.conFecha(hoyClave, () => Vencimientos.gasto("transporte"));
    if (!t || !(t.porDia > 0)) return null;
    const lunes = Plan.claveSemana();
    const n = t.diasPorSemana;
    const jornadas = {};
    (this._cache ? this._cache.jornadas : Almacen.leerJornadas()).forEach(j => { jornadas[j.fecha] = j; });
    const i = Math.round((Jornadas.aFecha(hoyClave) - Jornadas.aFecha(lunes)) / 86400000);
    const hoyCuenta = this.diaConTransporte(hoyClave, i, n, jornadas);
    const cerrado = Almacen.leerPlan().transporteCerradoEl === hoyClave;
    const di = Almacen.leerDineroInicial(), desdeMov = di ? di.momento : "";
    const gastadoHoy = redondear(Almacen.leerMovimientos()
      .filter(m => m.tipo === "gasto" && m.categoria === "Transporte" && m.fecha === hoyClave && (!desdeMov || m.creado > desdeMov) && !m.incluidoEnCorreccion)
      .reduce((x, m) => x + m.monto, 0));
    const restoHoy = hoyCuenta && !cerrado ? redondear(Math.max(0, t.porDia - gastadoHoy)) : 0;
    const diasFuturos = this.diasTransporte(lunes, n, Jornadas.sumarDias(hoyClave, 1));
    return { porDia: t.porDia, hoyCuenta, cerrado, gastadoHoy, restoHoy, diasFuturos,
             total: redondear(restoHoy + diasFuturos * t.porDia) };
  },

  // Lo que ya gastaste en Comida del día de cobro al domingo siguiente (viernes a domingo): esa compra es la comida de la semana que sigue
  comidaYaGastada(gastos, cobro) {
    const hasta = Jornadas.sumarDias(cobro, 2);
    return redondear(gastos.filter(m => m.fecha >= cobro && m.fecha <= hasta).reduce((s, m) => s + m.monto, 0));
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
    const gastosComida = this.gastosDeComida();

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
      // Cada cheque aparta (1) el TRANSPORTE de la semana que sigue (los días de trabajo de lunes a domingo de la semana
      // siguiente al cobro) y (2) la COMIDA de esa semana, que se compra el mismo día de cobro: si ya la gastaste
      // (viernes a domingo), eso se descuenta para no restarla dos veces.
      const lunesSig = Jornadas.sumarDias(lunes, 7);
      const { comida, transporte, minima } = Datos.conFecha(disponible, () => ({
        comida: Vencimientos.gasto("comida"), transporte: Vencimientos.gasto("transporte"), minima: this.comidaMinima() }));
      const diasTransporte = transporte ? this.diasTransporte(lunesSig, transporte.diasPorSemana) : 0;
      if (transporte && diasTransporte > 0) lineas.push({ fecha: disponible, orden: Prioridad.orden("transporte") ?? 3, tipo: "semanal", id: "transporte",
        nombre: `Transporte (semana que sigue: ${dinero(transporte.porDia)} × ${diasTransporte} ${diasTransporte === 1 ? "día" : "días"})`,
        monto: -redondear(transporte.porDia * diasTransporte) });
      if (comida) {
        const base = extrema && minima != null ? minima : comida.monto;
        const ya = this.comidaYaGastada(gastosComida, disponible);
        const falta = redondear(Math.max(0, base - ya));
        if (falta > 0.005) lineas.push({ fecha: disponible, orden: Prioridad.orden("comida") ?? 4, tipo: "semanal", id: "comida",
          nombre: (extrema && minima != null ? "Comida (modo extremo" : "Comida (semana que sigue") + (ya > 0.005 ? `, ya gastaste ${dinero(ya)})` : ")"),
          monto: -falta });
      }
    }

    // Transporte que todavía falta de ESTA semana (lo que falta de hoy y los días que quedan).
    // (El dinero que se apartó el viernes pasado sigue en "Dinero que tengo hoy" hasta que lo gastas: se aparta aquí para que no cuente como libre.)
    {
      const t = this.transporteDeEstaSemana();
      if (t && t.total > 0.005) {
        const partes = [];
        if (t.diasFuturos > 0) partes.push(`${t.diasFuturos} ${t.diasFuturos === 1 ? "día" : "días"} × ${dinero(t.porDia)}`);
        if (t.restoHoy > 0.005) partes.push(`hoy faltan ${dinero(t.restoHoy)} de ${dinero(t.porDia)}`);
        lineas.push({ fecha: hoyClave, orden: Prioridad.orden("transporte") ?? 3, tipo: "semanal", id: "transporte",
          nombre: `Transporte que falta de esta semana (${partes.join(" + ")})`, monto: -t.total });
      }
    }

    // Vencimientos sin pagar (con las fechas movidas)
    // Lo que venció hace poco (hasta DIAS_ATRAS días) y sigue sin pagarse NO desaparece: se cuenta como pago de hoy,
    // marcado "vencido" (antes se olvidaba al día siguiente y la cuenta quedaba con ese dinero de más).
    const atras = Jornadas.sumarDias(hoyClave, -Vencimientos.DIAS_ATRAS);
    Vencimientos.entre(atras, fin).forEach(item => {
      const vencido = item.fecha < hoyClave;
      if (vencido && (item.planeado || item.inmediato)) return; // lo planeado y lo atrasado sin fecha no se arrastran
      if (item.alerta || [].concat(excluir || []).includes(item.claveMov)) return; // excluir: una clave o varias
      if (item.id === "renta") return; // la renta se cuenta aparte (rentaLineas)
      if (item.inmediato && !item.movido) return; // deuda atrasada sin fecha (internet atrasado): no se asume que la pagas
      if (excluirPlaneado && [].concat(excluirPlaneado).includes(item.planeadoId)) return;
      const pendientes = item.partes.filter(p => !p.pagado);
      const pendiente = pendientes.reduce((s, p) => s + p.monto, 0);
      if (pendiente <= 0) return;
      // Orden dentro del día: el de Más → Pagos fijos → Orden (renta, nivel 1, nivel 2, suscripciones)
      const orden = (!item.inmediato && !item.planeado && Prioridad.orden(item.id)) || (item.inmediato ? 5 : item.planeado ? 15 : 10);
      lineas.push({ fecha: vencido ? hoyClave : item.fecha, orden, tipo: "pago", id: item.id, letra: item.letra,
        vencidoDesde: vencido ? item.fecha : null,
        nombre: item.planeado ? `${item.nombre} (planeado)` : vencido ? `${item.nombre} (vencido)` : item.nombre,
        detalle: pendientes.length > 1 ? pendientes.map(p => dinero(p.monto)).join(" + ") : "",
        monto: -pendiente, movido: item.movido || null, claveMov: item.claveMov, inmediato: !!item.inmediato, deudaId: item.deudaId || null,
        planeado: !!item.planeado });
    });
    if (!opciones.sinRenta) lineas.push(...this.rentaLineas(hoyClave, fin, { excluir }));
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
      desde: hoyClave, hasta: fin, porDia, inicial, lineas, colchon, protegido: proteger, comidaExtrema: extrema, opciones,
      cheques: lineas.filter(l => l.tipo === "cheque").map(l => l.fecha),
      chequesInfo: cheques
    };
  },

  // ---------- Renta ----------
  // La renta se paga por ADELANTADO: la de diciembre es la de vivir en diciembre, vence el día 1
  // (después del 1 cobran late fee) y la meta es pagarla el último viernes antes del día 1.
  // En la cuenta va la renta del mes en su META (el último viernes); si el día 1 no está pagada, pasa a atrasada.
  // Lo que ya se debía (el atraso) va APARTE: se paga con lo que sobra (renta atrasada → internet → colchón → amigo),
  // salvo que haya un acuerdo de pago con fechas (Datos fijos): esos pagos sí van en la cuenta.

  // Meta de la renta que vence en "fecha" (día 1): el último día de cobro (viernes) antes de esa fecha
  metaRenta(fecha) {
    const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    let cobro = dias.indexOf((Jornadas.config() || {}).diaDeCobro);
    if (cobro < 0) cobro = 5;
    let d = Jornadas.aFecha(fecha);
    d.setDate(d.getDate() - 1);
    while (d.getDay() !== cobro) d.setDate(d.getDate() - 1);
    return Datos.claveDe(d);
  },

  // Acuerdo de pago registrado en Datos fijos: [{ fecha, monto }]
  acuerdoRenta() {
    return (Almacen.leer("acuerdoRenta") || []).filter(p => p.fecha && p.monto > 0)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  },

  // Rentas que todavía no vencen (vencen el día 1: hoy o después), con lo que ya se pagó de cada una.
  // Cuenta para ese mes: "Ya lo pagué" de ese mes, o "Pagué una deuda" diciendo que es la renta de ese mes.
  rentaMeses(hoyClave = hoy(), hasta = hoyClave) {
    const pagos = Almacen.leerMovimientos().filter(m => m.tipo === "pagoDeuda" && m.deudaId === Plan.ID_DEUDA_RENTA);
    return Datos.cargosRenta(hasta).map(c => ({ ...c, limite: c.fecha, meta: this.metaRenta(c.fecha) }))
      .filter(c => c.limite >= hoyClave)
      .map(c => {
        const pagado = pagos.filter(m => m.vencimiento === `renta-0@${c.fecha}` || m.rentaMes === c.fecha ||
          (!m.vencimiento && !m.rentaMes && m.fecha === c.fecha)).reduce((s, m) => s + m.monto, 0);
        const usado = Math.min(c.monto, pagado);
        return { ...c, pagado: redondear(usado), pendiente: redondear(c.monto - usado), cargada: c.fecha <= hoyClave };
      });
  },

  // Renta atrasada = lo que debo en el portal menos la renta de este mes que aún no vence
  // (y más lo que ya adelanté de un mes que todavía no se carga)
  rentaAtrasada(hoyClave = hoy()) {
    const total = Datos.saldoDeuda(Plan.ID_DEUDA_RENTA);
    const meses = this.rentaMeses(hoyClave, Datos.claveDe(new Date(Jornadas.aFecha(hoyClave).getFullYear() + 1, 0, 1)));
    const delMes = meses.filter(c => c.cargada).reduce((s, c) => s + c.pendiente, 0);
    const adelantado = meses.filter(c => !c.cargada).reduce((s, c) => s + c.pagado, 0);
    return Math.max(0, redondear(total - delMes + adelantado));
  },

  // Líneas de renta para la cuenta. opciones: { excluir: clave de un pago que no se cuenta, sinMover: fechas originales }
  rentaLineas(hoyClave, fin, opciones = {}) {
    const lineas = [];
    const mes = f => Jornadas.aFecha(f).toLocaleDateString("es", { month: "long" });
    // 1) Lo atrasado no va aquí: si planeaste pagarlo ("Planear pagos" en Mis deudas), son pagos planeados
    // 2) La renta de cada mes: en su meta, el último viernes antes del día 1 (o en las fechas a las que la moviste)
    const movidos = opciones.sinMover ? {} : typeof Vencimientos !== "undefined" ? Vencimientos.movidos() : Almacen.leerPagosMovidos();
    this.rentaMeses(hoyClave, Jornadas.sumarDias(fin, 8)).forEach(c => {
      if (c.pendiente <= 0.005) return;
      const clave = `renta@${c.fecha}`;
      if ([].concat(opciones.excluir || []).includes(clave)) return;
      const nombre = `Renta de ${mes(c.fecha)}`;
      const mv = movidos[clave];
      const meta = c.meta < hoyClave ? hoyClave : c.meta; // la meta ya pasó pero aún no vence: hoy
      if (!mv) { lineas.push({ fecha: meta, monto: -c.pendiente, nombre, claveMov: clave, cargo: c.fecha }); return; }
      const info = { fechaOriginal: meta, acordado: !!mv.acordado, nota: mv.nota || "", dividido: mv.partes.length > 1 };
      // Lo ya pagado se aplica a las primeras partes: lo que falta se reparte de la ÚLTIMA parte hacia atrás.
      // Una parte cuya fecha ya pasó sin pagarse vuelve a hoy (antes desaparecía y la cuenta quedaba con ese dinero de más).
      let queda = c.pendiente;
      const partes = mv.partes.map(pt => ({ ...pt })).reverse().map(pt => {
        const monto = redondear(Math.min(pt.monto, queda));
        queda = redondear(queda - monto);
        return { ...pt, monto, vencidoDesde: pt.fecha < hoyClave ? pt.fecha : null, fecha: pt.fecha < hoyClave ? hoyClave : pt.fecha };
      }).reverse();
      if (queda > 0.005) partes[partes.length - 1].monto = redondear(partes[partes.length - 1].monto + queda);
      partes.forEach((pt, i) => {
        if (pt.monto > 0.005) lineas.push({ fecha: pt.fecha, monto: -pt.monto, claveMov: clave, cargo: c.fecha, vencidoDesde: pt.vencidoDesde,
          nombre: (mv.partes.length > 1 ? `${nombre} (parte ${i + 1} de ${mv.partes.length})` : nombre) + (pt.vencidoDesde ? " (vencido)" : ""),
          movido: { ...info, parte: mv.partes.length > 1 ? i + 1 : null } });
      });
    });
    return lineas.filter(l => l.fecha >= hoyClave && l.fecha <= fin)
      .map(l => ({ ...l, orden: 1, tipo: "pago", id: "renta", letra: "R" }));
  },

  // ---------- El faltante más cercano ----------
  // Primer tramo de días bajo cero: desde qué día, hasta cuándo y cuánto falta en el peor día del tramo.
  faltante(pr) {
    const fechas = Object.keys(pr.porDia).sort();
    const i0 = fechas.findIndex(f => pr.porDia[f].saldoFin < -0.005);
    if (i0 < 0) return null;
    let peor = fechas[i0], fin = fechas[i0];
    for (let i = i0; i < fechas.length && pr.porDia[fechas[i]].saldoFin < -0.005; i++) {
      fin = fechas[i];
      if (pr.porDia[fechas[i]].saldoFin < pr.porDia[peor].saldoFin) peor = fechas[i];
    }
    const quien = this.quienFalta(pr, fechas[i0]);
    return { fecha: fechas[i0], peor, fin, falta: redondear(-pr.porDia[peor].saldoFin), ...quien };
  },

  // Qué pagos de ese día no alcanzan (los que dejan el saldo bajo cero) y si la renta sí se cubre
  quienFalta(pr, fecha) {
    const limpio = n => n.replace(/\s*\(.*\)\s*$/, "").trim();
    const lineas = pr.porDia[fecha].lineas.filter(l => l.monto < 0 && l.tipo !== "simulado");
    const cortos = [...new Set(lineas.filter(l => l.saldo < -0.005).map(l => limpio(l.nombre)))];
    const renta = lineas.filter(l => l.id === "renta");
    const rentaCubierta = renta.length > 0 && renta.every(l => l.saldo >= -0.005);
    return { cortos, rentaCubierta, rentaNombre: renta.length ? limpio(renta[0].nombre) : null };
  },

  // "préstamo semanal, transporte y comida"
  lista(nombres) {
    const n = nombres.map(x => /^Renta/.test(x) ? x.charAt(0).toLowerCase() + x.slice(1) : x.toLowerCase());
    return n.length <= 1 ? (n[0] || "tus pagos") : `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`;
  },

  // El texto del faltante, igual en todas las pantallas
  textoFaltante(f) {
    const hoyC = hoy(), cuando = f.fecha === hoyC ? "Hoy" : f.fecha === Jornadas.sumarDias(hoyC, 1) ? "Mañana"
      : `El ${Jornadas.textoDia(f.fecha).toLowerCase()}`;
    return `${cuando} te faltan ${dinero(f.falta)} para ${this.lista(f.cortos)}` +
      (f.rentaCubierta ? ` (la ${f.rentaNombre.charAt(0).toLowerCase() + f.rentaNombre.slice(1)} sí se cubre).` : ".");
  },

  // ¿La renta queda cubierta antes de su fecha límite? (la primera que viene en la cuenta)
  estadoRenta(pr) {
    const rentas = pr.lineas.filter(l => l.id === "renta");
    if (!rentas.length) return null;
    const fecha = rentas[0].fecha;
    const delDia = rentas.filter(l => l.fecha === fecha);
    const monto = redondear(delDia.reduce((s, l) => s - l.monto, 0));
    const saldo = delDia[delDia.length - 1].saldo;
    const finDia = pr.porDia[fecha] ? pr.porDia[fecha].saldoFin : saldo;
    const q = pr.porDia[fecha] ? this.quienFalta(pr, fecha) : { cortos: [] };
    return { fecha, monto, falta: redondear(Math.min(monto, Math.max(0, -saldo))), nombre: delDia.map(l => l.nombre).join(" + "),
             claveMov: delDia[0].claveMov || null, vence: delDia[0].cargo || null,
             faltaDia: redondear(Math.max(0, -finDia)), cortosDia: q.cortos };
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
    // La renta del mes ya está en la cuenta; aquí solo se reparte la renta ATRASADA
    orden.forEach(d => { saldos[d.id] = Math.max(0, Datos.saldoReparto(d.id)); });
    // Deudas atrasadas sin fecha (internet atrasado): las fechas estimadas no suponen que las pagas
    // (si las programas con "Mover", ya están en la cuenta día por día)
    Datos.deudas().filter(d => d.venceInmediato).forEach(d => { if (saldos[d.id] != null) saldos[d.id] = 0; });
    // Pagos planeados a deudas ("Planear pagos"): ya están en la cuenta día por día, no se reparten otra vez.
    // Si cubren toda la deuda, queda en cero cuando la cuenta alcanza a cubrir el último pago planeado.
    const planHasta = {};
    Object.keys(saldos).forEach(id => {
      const pl = pr.lineas.filter(l => l.id === "plandeuda" && l.deudaId === id);
      if (!pl.length) return;
      saldos[id] = Math.max(0, redondear(saldos[id] + pl.reduce((s, l) => s + l.monto, 0)));
      planHasta[id] = Object.keys(pr.porDia).sort().find(f => f >= pl[pl.length - 1].fecha && pr.porDia[f].saldoFin >= -0.005) || "nunca";
    });
    const acuerdoHasta = planHasta.deudaRenta || null;
    // Bloque 18: simular que una deuda baja (ej.: pagar renta atrasada con un préstamo)
    Object.entries(opciones.deudaAjustes || {}).forEach(([id, cambio]) => {
      if (saldos[id] != null) saldos[id] = Math.max(0, saldos[id] + cambio);
    });
    let rentaCero = null;
    if (saldos.deudaRenta != null && saldos.deudaRenta <= 0.005)
      rentaCero = !acuerdoHasta ? "ya" : acuerdoHasta === "nunca" ? null : acuerdoHasta;
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
      amigoCero: saldos.deudaAmigo != null && saldos.deudaAmigo <= 0.005
        ? (!planHasta.deudaAmigo ? "ya" : planHasta.deudaAmigo === "nunca" ? null : planHasta.deudaAmigo) : null,
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
      if (!r.rentaCero && r.hayRenta && saldos.deudaRenta <= 0.005 && acuerdoHasta !== "nunca")
        r.rentaCero = acuerdoHasta && acuerdoHasta > fecha ? acuerdoHasta : fecha;
      if (!r.amigoCero && r.hayAmigo && saldos.deudaAmigo <= 0.005 && planHasta.deudaAmigo !== "nunca")
        r.amigoCero = planHasta.deudaAmigo && planHasta.deudaAmigo > fecha ? planHasta.deudaAmigo : fecha;
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
    const N1 = Prioridad.niveles().n1; // renta y lo que está en el nivel 1
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
