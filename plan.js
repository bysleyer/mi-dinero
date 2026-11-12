/*
 * PLAN DE LA SEMANA (Bloque 3)
 * Cálculos del presupuesto semanal, colchón y sobres.
 * Usa Datos (app.js) para las cifras y Almacen (almacen.js) para guardar.
 */
const Plan = {
  SEMANAS_POR_AÑO: 52,
  HORAS_NORMALES: 40,
  // El préstamo semanal (gasto fijo) se liga a su deuda en datos.js
  ID_GASTO_PRESTAMO: "prestamoSemanal",
  ID_DEUDA_PRESTAMO: "deudaPrestamo",
  ID_DEUDA_RENTA: "deudaRenta",

  // ---------- Cálculos ----------
  ingreso(horas) {
    const ing = Datos.actual.ingresos;
    const pagoExtra = ing.pagoPorHora * 1.5; // 26 × 1.5 = 39
    const normales = Math.min(horas, this.HORAS_NORMALES);
    const extra = Math.max(0, horas - this.HORAS_NORMALES);
    const bruto = normales * ing.pagoPorHora + extra * pagoExtra;
    const proporcion = ing.netoSemanal.monto / ing.brutoSemanal; // neto ÷ bruto de mis datos
    return { bruto, neto: bruto * proporcion };
  },

  semanal(mensual) {
    return mensual * 12 / this.SEMANAS_POR_AÑO;
  },

  gastosFijos() {
    const lineas = Datos.actual.gastosFijos.map(g => {
      // Si hay un "monto de después" (ej.: teléfono), usa ese
      let base = g.montoDespues ?? g.monto;
      // Bloque 9: si el monto cambia desde una fecha (ej.: internet), usa el vigente
      if (g.cambio && hoy() >= g.cambio.desde) base = g.cambio.monto;
      const monto = g.frecuencia === "mensual" ? this.semanal(base) : base;
      const detalle = g.frecuencia === "mensual" ? `${dinero(base)} al mes` : "";
      return { id: g.id, nombre: g.nombre, monto, detalle };
    }).filter(l =>
      // El préstamo desaparece cuando su saldo llega a 0
      l.id !== this.ID_GASTO_PRESTAMO || Datos.saldoDeuda(this.ID_DEUDA_PRESTAMO) > 0
    );
    const total = lineas.reduce((s, l) => s + l.monto, 0);
    return { lineas, total };
  },

  montoDe(lineas, id) {
    const l = lineas.find(x => x.id === id);
    return l ? l.monto : 0;
  },

  // Horas para el plan: las proyectadas del próximo cheque (Bloque 7),
  // salvo que las haya cambiado a mano para ese mismo periodo.
  horasEfectivas(plan) {
    const auto = Jornadas.horasParaPlan();
    if (auto && plan.horasManualPeriodo !== auto.periodo) {
      return { horas: auto.horas, auto: true, sugeridas: auto.horas, registrados: auto.registrados, libres: auto.libres };
    }
    return { horas: plan.horas, auto: false, sugeridas: auto ? auto.horas : null };
  },

  // Bloque 10: ingresos registrados con fecha en la semana actual (lunes a domingo)
  ingresoReal() {
    const lunes = this.claveSemana();
    const [a, m, d] = lunes.split("-").map(Number);
    const dom = new Date(a, m - 1, d + 6);
    const p = n => String(n).padStart(2, "0");
    const domingo = `${dom.getFullYear()}-${p(dom.getMonth() + 1)}-${p(dom.getDate())}`;
    const lista = Almacen.leerMovimientos()
      .filter(x => esCheque(x) && x.fecha >= lunes && x.fecha <= domingo) // "Otro ingreso" no cuenta
      .sort((x, y) => (x.fecha + x.creado).localeCompare(y.fecha + y.creado));
    return { lista, total: redondear(lista.reduce((s, x) => s + x.monto, 0)) };
  },

  // ---------- Colchón y reparto del extra (ajuste al Bloque 11) ----------
  DEUDAS_PRIMERO: ["deudaRenta", "deudaInternet"], // renta atrasada y luego internet atrasado

  metaColchon() {
    const c = Datos.actual.colchon;
    if (c && typeof c.meta === "number") return c.meta;
    // Sin meta en mis datos: lo que falta en una semana mala (gastos fijos − semana mala)
    return Math.max(0, redondear(this.gastosFijos().total - Datos.actual.ingresos.semanaMala.netoMinimo));
  },

  // Deudas con prioridad (Bloque 4), en su orden
  deudasEnOrden() {
    return Datos.deudas()
      .filter(d => !d.automatico && d.prioridad != null)
      .sort((a, b) => a.prioridad - b.prioridad);
  },

  // Reparte el dinero extra:
  //   1) renta atrasada, 2) internet atrasado,
  //   3) colchón: el % elegido hasta llegar a la meta (lleno = no recibe nada),
  //   4) lo demás a las deudas en su orden (préstamo del amigo, luego plan de luz).
  // "saldos" ({ id: saldo }) se va restando. Devuelve { deudas: { id: monto }, aColchon, resto }.
  repartirExtra(extra, { pct, colchon, meta, saldos, orden }) {
    let E = Math.max(0, extra);
    const deudas = {};
    const pagar = id => {
      const m = Math.min(E, Math.max(0, saldos[id] || 0));
      if (m > 0.005) { deudas[id] = (deudas[id] || 0) + m; saldos[id] -= m; E -= m; }
    };
    this.DEUDAS_PRIMERO.forEach(pagar);
    let aColchon = 0;
    if (colchon < meta && E > 0) {
      aColchon = Math.min(E * pct, meta - colchon);
      E -= aColchon;
    }
    orden.filter(d => !this.DEUDAS_PRIMERO.includes(d.id)).forEach(d => pagar(d.id));
    return { deudas, aColchon, resto: E };
  },

  // "Ya puedes pagarle a tu amigo": renta e internet atrasados en 0 y colchón lleno
  puedePagarAmigo(colchon) {
    return this.DEUDAS_PRIMERO.every(id => Datos.saldoReparto(id) <= 0.005)
      && colchon >= this.metaColchon() - 0.005
      && Datos.saldoDeuda("deudaAmigo") > 0.005;
  },

  // Bloque 11: ingreso de "¿Y si cobro...?" solo para ver (no se guarda ni registra nada)
  vistaPrevia: null,

  calcular(opciones = {}) {
    const plan = Almacen.leerPlan();
    // Estimación con el cálculo del Bloque 7 (el mismo de proyeccion.js)
    const horasPlan = this.horasEfectivas(plan).horas;
    const estimado = { bruto: Jornadas.bruto(horasPlan), neto: redondear(Jornadas.netoDeHoras(horasPlan)) };
    // Si hay cheque real esta semana (y no pediste usar la estimación), manda el cheque real
    const real = this.ingresoReal();
    const usaReal = real.lista.length > 0 && plan.ignorarRealSemana !== this.claveSemana();
    const vista = opciones.vista && this.vistaPrevia ? this.vistaPrevia : null;
    const bruto = vista || usaReal ? null : estimado.bruto;
    const neto = vista ? vista.monto : usaReal ? real.total : estimado.neto;
    const { lineas, total } = this.gastosFijos();
    // Bloque 15: gastos planeados con fecha elegida en esta semana (lunes a domingo), sin comprar
    const lunes = this.claveSemana();
    const domingo = Jornadas.sumarDias(lunes, 6);
    const planeados = Vencimientos.entre(lunes, domingo).filter(i => i.planeado)
      .map(i => ({ nombre: i.nombre, fecha: i.fecha, monto: i.partes[0].monto }));
    const totalPlaneados = planeados.reduce((s, p) => s + p.monto, 0);
    const sobrante = neto - total - totalPlaneados;
    // Colchón: meta fija (mis datos); recibe su % solo después de renta e internet atrasados
    const meta = this.metaColchon();
    const pct = plan.porcentajeColchon / 100;
    const saldos = {};
    this.deudasEnOrden().forEach(d => { saldos[d.id] = Math.max(0, Datos.saldoReparto(d.id)); });
    const reparto = this.repartirExtra(sobrante, { pct, colchon: plan.sobres.colchon, meta, saldos, orden: this.deudasEnOrden() });
    const aColchon = sobrante > 0 ? reparto.aColchon : 0;
    const aDeudas = sobrante > 0 ? sobrante - aColchon : 0;
    const puedePagarAmigo = this.puedePagarAmigo(plan.sobres.colchon);
    const semanalRenta = this.montoDe(lineas, "renta");
    // Servicios: las facturas de mis datos y los pagos fijos que agregué (lo mismo que va en el sobre de servicios)
    const semanalServicios = [...Vencimientos.facturasDeDatos().map(g => g.id), ...lineas.filter(l => l.id.startsWith("pf-")).map(l => l.id)]
      .reduce((s, id) => s + this.montoDe(lineas, id), 0);
    return { plan, bruto, neto, lineas, total, sobrante, meta, aColchon, aDeudas,
             semanalRenta, semanalServicios, usaReal, real, vista, puedePagarAmigo, planeados, totalPlaneados };
  },

  // Lunes de la semana actual (AAAA-MM-DD), para no apartar dos veces
  claveSemana(fecha = new Date()) {
    const d = new Date(fecha);
    const dia = (d.getDay() + 6) % 7; // lunes = 0
    d.setDate(d.getDate() - dia);
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },

  // ---------- Sobre de Renta y pagos de deuda ----------
  cuantoDescontarDeRenta(mov) {
    if (mov.tipo !== "pagoDeuda" || mov.deudaId !== this.ID_DEUDA_RENTA) return 0;
    // Lo atrasado (o un pago planeado a lo atrasado) no sale del sobre de la renta del mes que viene
    if (mov.rentaMes === "atrasada" || (mov.vencimiento || "").startsWith("plandeuda-")) return 0;
    return redondear(Math.min(mov.monto, Almacen.leerPlan().sobres.renta));
  },

  moverSobreRenta(cantidad) {
    if (!cantidad) return;
    const plan = Almacen.leerPlan();
    plan.sobres.renta = redondear(Math.max(0, plan.sobres.renta + cantidad));
    Almacen.guardarPlan(plan);
  },

  // ---------- Sobre de Servicios y gastos del mes (Bloque 5) ----------
  CATEGORIAS_SERVICIOS: ["Teléfono", "Luz", "Internet"],

  cuantoDescontarDeServicios(mov) {
    // También los pagos fijos que agregué yo, pagados con "Ya lo pagué" (su vencimiento empieza con "pf-")
    const propio = typeof mov.vencimiento === "string" && mov.vencimiento.startsWith("pf-");
    if (mov.tipo !== "gasto" || !(this.CATEGORIAS_SERVICIOS.includes(mov.categoria) || propio)) return 0;
    return redondear(Math.min(mov.monto, Almacen.leerPlan().sobres.servicios));
  },

  moverSobreServicios(cantidad) {
    if (!cantidad) return;
    const plan = Almacen.leerPlan();
    plan.sobres.servicios = redondear(Math.max(0, plan.sobres.servicios + cantidad));
    Almacen.guardarPlan(plan);
  },

  // ---------- Esta semana, con la cuenta día por día (proyeccion.js, 3 meses) ----------
  // Libre = lo que se puede gastar sin que ningún día (desde el cheque de esta semana) quede bajo cero.
  // Guárdalo = lo que queda al final de la semana y hace falta más adelante.
  DIAS_ADELANTE: 92,

  semanaReal() {
    const hoyClave = hoy();
    const lunes = this.claveSemana();
    const domingo = Jornadas.sumarDias(lunes, 6);
    const pr = Proyeccion.calcular({ horizonte: this.DIAS_ADELANTE });
    const fechas = Object.keys(pr.porDia).sort();
    const delaSemana = fechas.filter(f => f <= domingo).flatMap(f => pr.porDia[f].lineas.map(l => ({ ...l, fecha: f })));
    const entra = delaSemana.filter(l => l.monto > 0);
    const gastos = delaSemana.filter(l => l.monto < 0);
    const desde = (entra.find(l => l.tipo === "cheque") || {}).fecha || hoyClave;
    const minDe = arr => arr.reduce((m, f) => !m || pr.porDia[f].saldoFin < m.saldo ? { fecha: f, saldo: pr.porDia[f].saldoFin } : m, null);
    const antes = minDe(fechas.filter(f => f < desde));
    const despues = minDe(fechas.filter(f => f >= desde));
    const finSemana = pr.porDia[domingo] ? pr.porDia[domingo].saldoFin : pr.porDia[fechas[fechas.length - 1]].saldoFin;
    const libre = redondear(Math.max(0, despues ? despues.saldo : 0));
    const guardar = redondear(Math.max(0, finSemana - libre));
    // ¿Para qué se guarda? Lo grande que viene después de esta semana, hasta el día más apretado
    const finPara = despues && despues.fecha > domingo ? despues.fecha : domingo;
    const para = fechas.filter(f => f > domingo && f <= finPara).flatMap(f => pr.porDia[f].lineas.map(l => ({ ...l, fecha: f })))
      .filter(l => l.monto < 0 && (l.id === "renta" || l.tipo === "pago") && l.id !== "prestamo").slice(0, 4);
    let hueco = null;
    if (despues && despues.saldo < -0.005) {
      const q = Proyeccion.quienFalta(pr, despues.fecha);
      hueco = { fecha: despues.fecha, falta: redondear(-despues.saldo), pago: Proyeccion.lista(q.cortos) + (q.rentaCubierta ? "; la renta sí se cubre" : "") };
    }
    return { pr, lunes, domingo, desde, inicial: pr.inicial, entra, gastos,
             totalGastos: redondear(-gastos.reduce((s, l) => s + l.monto, 0)), finSemana, libre, guardar, para, hueco,
             huecoAntes: antes && antes.saldo < -0.005 ? { fecha: antes.fecha, falta: redondear(-antes.saldo) } : null };
  },

  // Sugerencia (no se asume) de a dónde podría ir lo libre: renta atrasada → internet → colchón → amigo → luz
  sugerenciaLibre(libre) {
    if (!(libre > 0.005)) return [];
    const plan = Almacen.leerPlan();
    const orden = this.deudasEnOrden();
    const saldos = {};
    orden.forEach(d => { saldos[d.id] = Math.max(0, Datos.saldoReparto(d.id)); });
    const r = this.repartirExtra(libre, { pct: plan.porcentajeColchon / 100, colchon: plan.sobres.colchon, meta: this.metaColchon(), saldos, orden });
    const lista = [];
    this.DEUDAS_PRIMERO.forEach(id => { if (r.deudas[id]) lista.push({ nombre: orden.find(d => d.id === id).nombre, monto: r.deudas[id] }); });
    if (r.aColchon > 0) lista.push({ nombre: "Colchón", monto: r.aColchon });
    orden.filter(d => !this.DEUDAS_PRIMERO.includes(d.id) && r.deudas[d.id]).forEach(d => lista.push({ nombre: d.nombre, monto: r.deudas[d.id] }));
    return lista.map(x => ({ ...x, monto: redondear(x.monto) }));
  },

  // Sobres: lo guardado y la meta de cada uno
  sobresMetas() {
    const sob = Almacen.leerPlan().sobres;
    const hoyClave = hoy();
    const sig = Proyeccion.rentaMeses(hoyClave, Jornadas.sumarDias(hoyClave, 62)).find(c => c.pendiente > 0.005);
    const mes = f => Jornadas.aFecha(f).toLocaleDateString("es", { month: "long" });
    const facturas = Vencimientos.entre(hoyClave, Jornadas.sumarDias(hoyClave, 29))
      .filter(i => Vencimientos.esFactura(i))
      .map(i => ({ nombre: i.nombre, fecha: i.fecha, monto: redondear(i.partes.filter(p => !p.pagado).reduce((s, p) => s + p.monto, 0)) }))
      .filter(f => f.monto > 0.005);
    return {
      renta: { guardado: sob.renta, meta: sig ? sig.pendiente : 0, cuando: sig ? (sig.meta < hoyClave ? hoyClave : sig.meta) : null,
               vence: sig ? sig.fecha : null, nombre: sig ? `Renta de ${mes(sig.fecha)}` : "" },
      servicios: { guardado: sob.servicios, meta: redondear(facturas.reduce((s, f) => s + f.monto, 0)), facturas },
      colchon: { guardado: sob.colchon, meta: this.metaColchon() }
    };
  },

  // Cuánto apartar: de lo que hay que guardar, lo que va para la renta y las facturas (en orden de fecha),
  // menos lo que ya está en cada sobre
  cuantoApartar(sem = this.semanaReal(), so = this.sobresMetas()) {
    let queda = sem.guardar;
    const obligaciones = [];
    if (so.renta.cuando && so.renta.meta > 0) obligaciones.push({ sobre: "renta", fecha: so.renta.cuando, monto: so.renta.meta });
    so.servicios.facturas.filter(f => f.fecha > sem.domingo).forEach(f => obligaciones.push({ sobre: "servicios", fecha: f.fecha, monto: f.monto }));
    const objetivo = { renta: 0, servicios: 0 };
    obligaciones.sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach(o => {
      const m = Math.min(o.monto, queda);
      objetivo[o.sobre] = redondear(objetivo[o.sobre] + m);
      queda = redondear(queda - m);
    });
    return { renta: redondear(Math.max(0, objetivo.renta - so.renta.guardado)),
             servicios: redondear(Math.max(0, objetivo.servicios - so.servicios.guardado)) };
  },

  // ---------- Acciones ----------
  async apartar() {
    const ap = this.cuantoApartar();
    if (ap.renta + ap.servicios <= 0.005) return;
    const ok = await preguntar(
      "¿Apartar lo de esta semana?\n" +
      `Renta: +${dinero(ap.renta)}\nServicios: +${dinero(ap.servicios)}\n(Es dinero que ya tienes: solo se marca como apartado.)`, "Sí, apartar"
    );
    if (!ok) return;
    const plan = Almacen.leerPlan();
    plan.sobres.renta = redondear(plan.sobres.renta + ap.renta);
    plan.sobres.servicios = redondear(plan.sobres.servicios + ap.servicios);
    plan.ultimaSemanaApartada = this.claveSemana();
    Almacen.guardarPlan(plan);
    this.mostrar();
    Pantalla.aviso("Apartado");
  },

  // ---------- Pantalla ----------
  abrir() {
    const plan = Almacen.leerPlan();
    $("p-horas").value = this.horasEfectivas(plan).horas;
    $("p-porcentaje").value = plan.porcentajeColchon;
    $("p-cobre").value = "";
    $("p-cobre-error").textContent = "";
    $("p-cobre-pregunta").hidden = true;
    $("pantalla-inicio").hidden = true;
    $("pantalla-plan").hidden = false;
    window.scrollTo(0, 0);
    this.mostrar();
  },

  cerrar() {
    this.vistaPrevia = null; // la vista previa es solo para ver
    $("pantalla-plan").hidden = true;
    $("pantalla-inicio").hidden = false;
    window.scrollTo(0, 0);
  },

  mostrar() {
    const c = this.calcular({ vista: true });

    // 1. Ingreso
    const origen = this.horasEfectivas(c.plan);
    $("p-horas-origen").innerHTML = origen.auto
      ? (origen.registrados ? "Basado en tus días registrados" : "Basado en tus días de trabajo") +
        (origen.libres ? ` (${origen.libres} ${origen.libres === 1 ? "día libre" : "días libres"})` : "")
      : origen.sugeridas != null
        ? `Lo cambiaste a mano. <button id="p-usar-dias" class="enlace">Usar mis días registrados (${origen.sugeridas} h)</button>`
        : "";
    $("p-ingreso-origen").innerHTML = c.usaReal
      ? `Basado en tu cheque real: <strong>${dinero(c.real.total)}</strong>
         <button id="p-usar-estimacion" class="enlace">Usar estimación otra vez</button>`
      : c.real.lista.length
        ? `Basado en tu estimación <button id="p-usar-real" class="enlace">Usar mi cheque real (${dinero(c.real.total)})</button>`
        : "Basado en tu estimación";
    $("p-ingreso-origen").className = "origen-ingreso" + (c.usaReal ? " real" : "");
    $("p-neto-nombre").textContent = c.usaReal ? "Ingreso real de la semana" : "Neto esperado";
    if (c.vista) {
      $("p-ingreso-origen").innerHTML = `Vista previa: ¿Y si cobro ${dinero(c.vista.monto)}? (${escapar(c.vista.nombre)}).
        No se registró nada. <button id="p-quitar-vista" class="enlace">Quitar vista previa</button>`;
      $("p-ingreso-origen").className = "origen-ingreso vista";
      $("p-neto-nombre").textContent = "Ingreso (vista previa)";
    }
    $("p-bruto").textContent = c.bruto == null ? "—" : dinero(c.bruto);
    $("p-cuenta").textContent = Proyeccion.textoCuenta(Proyeccion.calcular(), Jornadas.periodoProximoCheque().cobro);
    $("p-neto").textContent = dinero(c.neto);

    // Promedio semanal (solo referencia)
    $("p-gastos").innerHTML = c.lineas.map(l => `
      <li><span>${escapar(l.nombre)}${l.detalle ? `<span class="detalle">${l.detalle}</span>` : ""}</span>
          <span>${dinero(l.monto)}</span></li>`).join("") +
      `<li class="total"><span>Total</span><span>${dinero(c.total)}</span></li>`;
    $("p-sobrante").textContent = `Con el promedio: ingreso ${dinero(c.neto)} − gastos ${dinero(c.total)} = ${c.sobrante < 0 ? "−" : ""}${dinero(Math.abs(c.sobrante))}.`;

    // 2. Esta semana: con la misma cuenta de Mi futuro (día por día, 3 meses adelante)
    const sem = this.semanaReal();
    this._sem = sem;
    $("p-semana-rango").textContent = `Del ${Jornadas.textoDia(sem.lunes).toLowerCase()} al ${Jornadas.textoDia(sem.domingo).toLowerCase()}. Misma cuenta que Mi futuro.`;
    const fila = l => `<li><span>${escapar(l.nombre)}<span class="detalle">${Futuro.diaCorto(l.fecha)}</span></span><span>${dinero(Math.abs(l.monto))}</span></li>`;
    $("p-semana").innerHTML = `
      <ul class="resumen">
        <li><span>Dinero que tengo hoy</span><span>${Futuro.plata(sem.inicial)}</span></li>
        ${sem.entra.map(l => `<li><span>${escapar(l.nombre)}<span class="detalle">${Futuro.diaCorto(l.fecha)}</span></span><span class="ok">+${dinero(l.monto)}</span></li>`).join("")}
      </ul>
      <h3 class="pc-sub">Para tus gastos de esta semana</h3>
      <ul class="resumen">${sem.gastos.map(fila).join("") || '<li class="vacio">Nada más esta semana.</li>'}
        <li class="total"><span>Total</span><span>${dinero(sem.totalGastos)}</span></li></ul>
      ${sem.huecoAntes ? `<p class="pc-hueco">Antes del cheque del ${Futuro.dia(sem.desde)} te faltan ${dinero(sem.huecoAntes.falta)} (el ${Futuro.dia(sem.huecoAntes.fecha)}).</p>` : ""}
      <div class="p-reparto">
        <div class="p-guardar">
          <span>Guárdalo para más adelante</span><strong>${dinero(sem.guardar)}</strong>
          ${sem.guardar > 0.005 && sem.para.length ? `<p class="estado">Para: ${sem.para.map(x => `${escapar(x.nombre)} (${Futuro.diaCorto(x.fecha)})`).join(", ")}.</p>` : ""}
        </div>
        <div class="p-libre ${sem.libre > 0.005 ? "" : "cero"}">
          <span>Libre para lo que quieras</span><strong>${dinero(sem.libre)}</strong>
          <p class="estado">Lo puedes gastar sin que ningún día de los próximos 3 meses quede bajo cero.</p>
        </div>
      </div>
      ${sem.hueco ? `<p class="pc-hueco">Aunque guardes todo, el ${Futuro.dia(sem.hueco.fecha)} te faltan ${dinero(sem.hueco.falta)} para ${escapar(sem.hueco.pago)}.</p>` : ""}`;

    // 3. Colchón
    const ahorrado = c.plan.sobres.colchon;
    if (document.activeElement !== $("p-colchon")) $("p-colchon").value = ahorrado;
    $("p-meta").textContent = dinero(c.meta);
    const avance = c.meta > 0 ? Math.min(1, ahorrado / c.meta) : 1;
    $("p-barra").style.setProperty("--p", avance);
    $("p-barra-texto").textContent =
      `${Math.round(avance * 100)}% — llevas ${dinero(ahorrado)} de ${dinero(c.meta)}`;

    // 4. Sugerencia para lo libre (no se asume: tú decides)
    const sug = this.sugerenciaLibre(sem.libre);
    $("p-sugerencia").innerHTML = sem.libre > 0.005
      ? (sug.length ? `<p class="nota-sobre">Si quieres, de tus ${dinero(sem.libre)} libres podrías mandar:</p>
          <ul class="resumen">${sug.map(x => `<li><span>${escapar(x.nombre)}</span><span>${dinero(x.monto)}</span></li>`).join("")}</ul>
          <p class="estado">Solo es una sugerencia: no se aparta ni se paga nada. Si decides pagar una deuda varias semanas, usa "Planear pagos" en Mis deudas.</p>`
        : `<p class="nota-sobre">No tienes deudas pendientes para sugerir.</p>`)
      : `<p class="nota-sobre">Esta semana no hay dinero libre para deudas o colchón.</p>`;
    $("p-amigo").hidden = !c.puedePagarAmigo;

    // Sobres: lo guardado y la meta de cada uno
    const so = this.sobresMetas();
    const ap = this.cuantoApartar(sem, so);
    const corto = f => f ? Futuro.diaCorto(f).toLowerCase() : "";
    const tarjeta = (titulo, guardado, meta, derecha, nota) => {
      const av = meta > 0 ? Math.min(1, guardado / meta) : 1;
      return `<div class="p-sobre">
        <div class="sobre-cabeza"><span class="sobre-nombre">${titulo}</span><span class="sobre-meta">${derecha}</span></div>
        <div class="sobre-cifras"><strong>${guardado >= meta - 0.005 && meta > 0 ? "✓ " : ""}${dineroCorto(guardado)}</strong><span>de ${dineroCorto(meta)}</span></div>
        <div class="barra"><div class="barra-relleno" style="--p:${av}"></div></div>
        ${nota ? `<p class="estado">${nota}</p>` : ""}
      </div>`;
    };
    const quedan = (meta, guardado) => Math.max(0, meta - guardado);
    $("p-sobres").innerHTML =
      tarjeta("Renta", so.renta.guardado, so.renta.meta, so.renta.cuando ? `meta ${corto(so.renta.cuando)}` : "",
        so.renta.cuando ? `Quedan ${dineroCorto(quedan(so.renta.meta, so.renta.guardado))}${ap.renta > 0.005 ? ` · ${dineroCorto(ap.renta)} esta semana` : ""}` : "No hay renta pendiente.") +
      tarjeta("Servicios", so.servicios.guardado, so.servicios.meta, "próx. 30 días",
        so.servicios.facturas.length ? so.servicios.facturas.map(f => `${escapar(f.nombre)} ${dineroCorto(f.monto)}`).join(" · ") : "No hay facturas en los próximos 30 días.") +
      tarjeta("Colchón", so.colchon.guardado, so.colchon.meta, "", "");
    $("apartar").disabled = !!c.vista || ap.renta + ap.servicios <= 0.005;
    $("apartar").textContent = ap.renta + ap.servicios > 0.005 ? `Apartar lo de esta semana · ${dineroCorto(ap.renta + ap.servicios)}` : "Apartar lo de esta semana";
    $("apartar-texto").textContent = c.vista ? "Quita la vista previa para apartar."
      : ap.renta + ap.servicios > 0.005 ? `Esta semana apartarías: renta ${dinero(ap.renta)} y servicios ${dinero(ap.servicios)} (lo que la cuenta dice que hay que guardar).`
      : "Tus sobres ya tienen lo que hay que guardar esta semana.";
  },

  // Guarda un campo numérico del plan al escribir
  alCambiar(campo, entrada, min, max) {
    const valor = Number(entrada.value);
    if (entrada.value.trim() === "" || isNaN(valor)) return;
    const plan = Almacen.leerPlan();
    const limpio = Math.min(max, Math.max(min, valor));
    if (campo === "colchon") plan.sobres.colchon = redondear(limpio);
    else plan[campo] = limpio;
    if (campo === "horas") {
      // Cambio a mano: vale para el periodo actual del próximo cheque
      const auto = Jornadas.horasParaPlan();
      plan.horasManualPeriodo = auto ? auto.periodo : null;
    }
    Almacen.guardarPlan(plan);
    this.mostrar();
  },

  // ---------- "Cobré esta semana" (Bloque 10) ----------
  // Registra el ingreso con la misma función que "Me pagaron" (registrarMovimiento, Bloque 2)
  cobre() {
    const txt = $("p-cobre").value.trim();
    const monto = redondear(Number(txt));
    $("p-cobre-error").textContent = "";
    if (txt === "") return ($("p-cobre-error").textContent = "Escribe cuánto cobraste.");
    if (!(monto > 0)) return ($("p-cobre-error").textContent = "El monto debe ser mayor que 0.");

    const { lista, total } = this.ingresoReal();
    if (!lista.length) return this.registrarCobro(monto);

    const ultimo = lista[lista.length - 1];
    const caja = $("p-cobre-pregunta");
    caja.innerHTML = `
      <p>Ya registraste esta semana <strong>${dinero(total)}</strong>
        (${lista.map(x => `${dinero(x.monto)} el ${fechaCorta(x.fecha)}`).join(", ")}). ¿Qué quieres hacer?</p>
      <button class="boton-chico lleno" data-cobre="sumar">Sumar otro ingreso de ${dinero(monto)}</button>
      <button class="boton-chico" data-cobre="corregir">Corregir: cambiar ${dinero(ultimo.monto)} por ${dinero(monto)}</button>
      <button class="boton-chico" data-cobre="cancelar">Cancelar</button>`;
    caja.hidden = false;
    caja.onclick = e => {
      const opcion = e.target.closest("[data-cobre]");
      if (!opcion) return;
      caja.hidden = true;
      if (opcion.dataset.cobre === "sumar") this.registrarCobro(monto);
      if (opcion.dataset.cobre === "corregir") {
        // Corregir = borrar el anterior (queda marcado como borrado) y registrar el nuevo con su misma fecha
        Almacen.borrarMovimiento(ultimo.id);
        const mov = { tipo: "ingreso", tipoIngreso: "cheque", monto, fecha: ultimo.fecha };
        if (ultimo.horas != null) { mov.horas = ultimo.horas; mov.nota = ultimo.nota; mov.estimado = ultimo.estimado; }
        this.registrarCobro(monto, mov);
      }
    };
  },

  registrarCobro(monto, mov = { tipo: "ingreso", tipoIngreso: "cheque", monto, fecha: hoy() }) {
    if (!registrarMovimiento(mov)) {
      $("p-cobre-error").textContent = "No se pudo guardar en este dispositivo.";
      return;
    }
    // Un cobro nuevo vuelve a usar el cheque real
    const plan = Almacen.leerPlan();
    plan.ignorarRealSemana = null;
    Almacen.guardarPlan(plan);
    $("p-cobre").value = "";
    this.mostrar();
  },

  usarEstimacion(si) {
    const plan = Almacen.leerPlan();
    plan.ignorarRealSemana = si ? this.claveSemana() : null; // no borra ningún ingreso
    Almacen.guardarPlan(plan);
    this.mostrar();
  },

  iniciar() {
    $("abrir-plan").addEventListener("click", () => this.abrir());
    $("p-cobre-guardar").addEventListener("click", () => this.cobre());
    $("p-ingreso-origen").addEventListener("click", e => {
      if (e.target.closest("#p-usar-estimacion")) this.usarEstimacion(true);
      if (e.target.closest("#p-usar-real")) this.usarEstimacion(false);
      if (e.target.closest("#p-quitar-vista")) { this.vistaPrevia = null; this.mostrar(); }
    });
    window.addEventListener("movimientos-cambiaron", () => {
      if (!$("pantalla-plan").hidden) this.mostrar();
    });
    $("volver").addEventListener("click", () => this.cerrar());
    $("apartar").addEventListener("click", () => this.apartar());
    $("p-horas-origen").addEventListener("click", e => {
      if (!e.target.closest("#p-usar-dias")) return;
      const plan = Almacen.leerPlan();
      plan.horasManualPeriodo = null;
      Almacen.guardarPlan(plan);
      $("p-horas").value = this.horasEfectivas(plan).horas;
      this.mostrar();
    });
    $("p-horas").addEventListener("input", e => this.alCambiar("horas", e.target, 0, 168));
    $("p-porcentaje").addEventListener("input", e => this.alCambiar("porcentajeColchon", e.target, 0, 100));
    $("p-colchon").addEventListener("input", e => this.alCambiar("colchon", e.target, 0, Infinity));
  }
};

if (Datos.actual) Plan.iniciar();
