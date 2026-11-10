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
    const proporcion = ing.netoSemanal.monto / ing.brutoSemanal; // ≈ 0.898
    return { bruto, neto: bruto * proporcion };
  },

  semanal(mensual) {
    return mensual * 12 / this.SEMANAS_POR_AÑO;
  },

  gastosFijos() {
    const lineas = Datos.actual.gastosFijos.map(g => {
      // Teléfono: usa el monto de después (250) si existe
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
    if (auto && plan.horasManualPeriodo !== auto.periodo) return { horas: auto.horas, auto: true, sugeridas: auto.horas };
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
  META_COLCHON_DEFECTO: 300,
  DEUDAS_PRIMERO: ["deudaRenta", "deudaInternet"], // renta atrasada y luego internet atrasado

  metaColchon() {
    const c = Datos.actual.colchon;
    return c && typeof c.meta === "number" ? c.meta : this.META_COLCHON_DEFECTO;
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
    return this.DEUDAS_PRIMERO.every(id => Datos.saldoDeuda(id) <= 0.005)
      && colchon >= this.metaColchon() - 0.005
      && Datos.saldoDeuda("deudaAmigo") > 0.005;
  },

  // Bloque 11: ingreso de "¿Y si cobro...?" solo para ver (no se guarda ni registra nada)
  vistaPrevia: null,

  calcular(opciones = {}) {
    const plan = Almacen.leerPlan();
    const estimado = this.ingreso(this.horasEfectivas(plan).horas);
    // Si hay cheque real esta semana (y no pediste usar la estimación), manda el cheque real
    const real = this.ingresoReal();
    const usaReal = real.lista.length > 0 && plan.ignorarRealSemana !== this.claveSemana();
    const vista = opciones.vista && this.vistaPrevia ? this.vistaPrevia : null;
    const bruto = vista || usaReal ? null : estimado.bruto;
    const neto = vista ? vista.monto : usaReal ? real.total : estimado.neto;
    const { lineas, total } = this.gastosFijos();
    const sobrante = neto - total;
    // Colchón: meta fija (mis datos); recibe su % solo después de renta e internet atrasados
    const meta = this.metaColchon();
    const pct = plan.porcentajeColchon / 100;
    const saldos = {};
    this.deudasEnOrden().forEach(d => { saldos[d.id] = Math.max(0, Datos.saldoDeuda(d.id)); });
    const reparto = this.repartirExtra(sobrante, { pct, colchon: plan.sobres.colchon, meta, saldos, orden: this.deudasEnOrden() });
    const aColchon = sobrante > 0 ? reparto.aColchon : 0;
    const aDeudas = sobrante > 0 ? sobrante - aColchon : 0;
    const puedePagarAmigo = this.puedePagarAmigo(plan.sobres.colchon);
    const semanalRenta = this.montoDe(lineas, "renta");
    const semanalServicios = ["telefono", "luz", "internet"]
      .reduce((s, id) => s + this.montoDe(lineas, id), 0);
    return { plan, bruto, neto, lineas, total, sobrante, meta, aColchon, aDeudas,
             semanalRenta, semanalServicios, usaReal, real, vista, puedePagarAmigo };
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
    if (mov.tipo !== "gasto" || !this.CATEGORIAS_SERVICIOS.includes(mov.categoria)) return 0;
    return redondear(Math.min(mov.monto, Almacen.leerPlan().sobres.servicios));
  },

  moverSobreServicios(cantidad) {
    if (!cantidad) return;
    const plan = Almacen.leerPlan();
    plan.sobres.servicios = redondear(Math.max(0, plan.sobres.servicios + cantidad));
    Almacen.guardarPlan(plan);
  },

  // ---------- Acciones ----------
  async apartar() {
    const c = this.calcular();
    if (c.plan.ultimaSemanaApartada === this.claveSemana()) return;
    const renta = redondear(c.semanalRenta);
    const servicios = redondear(c.semanalServicios);
    const colchon = redondear(c.aColchon);
    const ok = await preguntar(
      "¿Apartar esta semana?\n" +
      `Renta: +${dinero(renta)}\nServicios: +${dinero(servicios)}\nColchón: +${dinero(colchon)}`, "Sí, apartar"
    );
    if (!ok) return;
    const plan = c.plan;
    plan.sobres.renta = redondear(plan.sobres.renta + renta);
    plan.sobres.servicios = redondear(plan.sobres.servicios + servicios);
    plan.sobres.colchon = redondear(plan.sobres.colchon + colchon);
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
      ? "Basado en tus días registrados"
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
    $("p-neto").textContent = dinero(c.neto);

    // 2. Gastos fijos
    $("p-gastos").innerHTML = c.lineas.map(l => `
      <li><span>${escapar(l.nombre)}${l.detalle ? `<span class="detalle">${l.detalle}</span>` : ""}</span>
          <span>${dinero(l.monto)}</span></li>`).join("") +
      `<li class="total"><span>Total</span><span>${dinero(c.total)}</span></li>`;

    // 3. Sobrante
    const s = $("p-sobrante");
    if (c.sobrante >= 0) {
      s.className = "mensaje-sobrante positivo";
      s.textContent = `Te sobran ${dinero(c.sobrante)} esta semana`;
    } else {
      s.className = "mensaje-sobrante negativo";
      s.textContent = `Esta semana no alcanza. Te faltan ${dinero(-c.sobrante)}`;
    }

    // 4. Colchón
    const ahorrado = c.plan.sobres.colchon;
    if (document.activeElement !== $("p-colchon")) $("p-colchon").value = ahorrado;
    $("p-meta").textContent = dinero(c.meta);
    const avance = c.meta > 0 ? Math.min(1, ahorrado / c.meta) : 1;
    $("p-barra").style.width = (avance * 100) + "%";
    $("p-barra-texto").textContent =
      `${Math.round(avance * 100)}% — llevas ${dinero(ahorrado)} de ${dinero(c.meta)}`;
    $("p-a-colchon").textContent = dinero(c.aColchon);
    $("p-a-deudas").textContent = dinero(c.aDeudas);
    $("p-amigo").hidden = !c.puedePagarAmigo;

    // 5. Sobres
    const sob = c.plan.sobres;
    $("s-renta").textContent = dinero(sob.renta);
    $("s-servicios").textContent = dinero(sob.servicios);
    $("s-colchon").textContent = dinero(sob.colchon);
    const rentaMes = Datos.actual.gastosFijos.find(g => g.id === "renta").monto;
    $("s-renta-texto").textContent =
      `Para el día 1 necesitas ${dinero(rentaMes)}, llevas apartado ${dinero(sob.renta)}`;

    const yaApartado = c.plan.ultimaSemanaApartada === this.claveSemana();
    $("apartar").disabled = yaApartado || !!c.vista;
    $("apartar-texto").textContent = yaApartado
      ? "Ya apartaste esta semana. Podrás volver a hacerlo el próximo lunes."
      : c.vista ? "Quita la vista previa para apartar." : "";
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
