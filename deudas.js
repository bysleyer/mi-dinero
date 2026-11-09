/*
 * MIS DEUDAS (Bloque 4)
 * Lista de deudas, qué pagar esta semana, alerta del día 15 y proyección.
 * Usa Datos (app.js), Plan (plan.js) y Almacen (almacen.js).
 * Los pagos y ajustes se registran con el mismo formulario del Bloque 2.
 */
const Deudas = {
  CERO: 0.005, // menos de medio centavo cuenta como pagado
  MAX_SEMANAS: 200,

  // ---------- Datos de apoyo ----------
  prioritarias() {
    return Datos.deudas()
      .filter(d => !d.automatico && d.prioridad != null)
      .sort((a, b) => a.prioridad - b.prioridad);
  },

  automaticas() {
    return Datos.deudas().filter(d => d.automatico);
  },

  // Reparte "dinero" en orden de prioridad. saldos: { id: saldo }
  repartir(dinero, saldos, orden) {
    const reparto = {};
    let resta = dinero;
    for (const d of orden) {
      if (resta <= this.CERO) break;
      const paga = Math.min(resta, saldos[d.id]);
      if (paga > this.CERO) {
        reparto[d.id] = paga;
        saldos[d.id] -= paga;
        resta -= paga;
      }
    }
    return reparto;
  },

  // ---------- Alerta del día 15 ----------
  diasParaDia(dia, hoyFecha = new Date()) {
    const hoy = new Date(hoyFecha.getFullYear(), hoyFecha.getMonth(), hoyFecha.getDate());
    let objetivo = new Date(hoy.getFullYear(), hoy.getMonth(), dia);
    if (hoy.getDate() > dia) objetivo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, dia);
    return Math.round((objetivo - hoy) / 86400000);
  },

  // ---------- Proyección semana a semana ----------
  proximoViernes(desde = new Date()) {
    const d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
    d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7)); // si hoy es viernes, hoy
    return d;
  },

  proyectar(porcentajeColchon, extraSemanal) {
    const ing = Datos.actual.ingresos;
    const neto = Plan.ingreso(ing.horasPorSemana).neto;

    // Gastos fijos sin el préstamo; el préstamo se cobra aparte mientras tenga saldo
    const { lineas, total } = Plan.gastosFijos();
    const lineaPrestamo = lineas.find(l => l.id === Plan.ID_GASTO_PRESTAMO);
    const gastosBase = total - (lineaPrestamo ? lineaPrestamo.monto : 0);
    const cuotaPrestamo = Datos.actual.gastosFijos.find(g => g.id === Plan.ID_GASTO_PRESTAMO).monto;

    const orden = this.prioritarias();
    const saldos = {};
    orden.forEach(d => { saldos[d.id] = Math.max(0, Datos.saldoDeuda(d.id)); });
    let prestamo = Math.max(0, Datos.saldoDeuda(Plan.ID_DEUDA_PRESTAMO));
    let colchon = Almacen.leerPlan().sobres.colchon;
    const pct = porcentajeColchon / 100;
    const meta = Plan.metaColchon();

    const fechas = {};
    orden.forEach(d => { if (saldos[d.id] <= this.CERO) fechas[d.id] = "pagada"; });
    if (prestamo <= this.CERO) fechas[Plan.ID_DEUDA_PRESTAMO] = "pagada";

    const resultado = { fechas, libre: null, ritmoConPrestamo: null, ritmoSinPrestamo: null,
                        fechaColchon: colchon >= meta - this.CERO ? "ya" : null };
    const todoPagado = () => prestamo <= this.CERO && orden.every(d => saldos[d.id] <= this.CERO);
    if (todoPagado()) { resultado.libre = "ya"; return resultado; }

    const fecha = this.proximoViernes();
    for (let semana = 1; semana <= this.MAX_SEMANAS; semana++) {
      // Préstamo semanal: se cobra solo mientras tenga saldo
      const cuota = Math.min(cuotaPrestamo, prestamo);
      prestamo -= cuota;
      if (cuota > 0 && prestamo <= this.CERO) fechas[Plan.ID_DEUDA_PRESTAMO] = new Date(fecha);

      const gastos = gastosBase + cuota;
      const sobrante = neto - gastos;
      // Extra de la semana: renta e internet atrasados → colchón (% hasta la meta fija) → demás deudas
      const extra = Math.max(0, sobrante) + extraSemanal;
      const r = Plan.repartirExtra(extra, { pct, colchon, meta, saldos, orden });
      colchon += r.aColchon;
      if (!resultado.fechaColchon && colchon >= meta - this.CERO) resultado.fechaColchon = new Date(fecha);
      const paraDeudas = extra - r.aColchon;

      if (cuota > 0 && resultado.ritmoConPrestamo == null) resultado.ritmoConPrestamo = paraDeudas;
      if (cuota === 0 && resultado.ritmoSinPrestamo == null) resultado.ritmoSinPrestamo = paraDeudas;
      orden.forEach(d => {
        if (!fechas[d.id] && saldos[d.id] <= this.CERO) fechas[d.id] = new Date(fecha);
      });

      if (todoPagado()) {
        resultado.libre = new Date(fecha);
        resultado.semanas = semana;
        return resultado;
      }
      fecha.setDate(fecha.getDate() + 7);
    }
    return resultado; // libre = null: no se alcanza en 200 semanas
  },

  // ---------- Pantalla ----------
  abrir() {
    $("d-extra").value = Almacen.leerPlan().extraProyeccion || "";
    $("pantalla-inicio").hidden = true;
    $("pantalla-deudas").hidden = false;
    window.scrollTo(0, 0);
    this.mostrar();
  },

  cerrar() {
    $("pantalla-deudas").hidden = true;
    $("pantalla-inicio").hidden = false;
    window.scrollTo(0, 0);
  },

  tarjetaDeuda(d, etiqueta) {
    const saldo = Datos.saldoDeuda(d.id);
    const avance = d.monto > 0 ? Math.min(1, Math.max(0, (d.monto - saldo) / d.monto)) : 1;
    const pagada = saldo <= this.CERO;
    return `
      <li>
        <div class="deuda-cabeza">
          <span class="deuda-nombre">${escapar(d.nombre)}</span>
          <span class="deuda-saldo ${pagada ? "pagada" : ""}">${pagada ? "Pagada" : dinero(saldo)}</span>
        </div>
        <p class="deuda-sub"><span class="etiqueta">${etiqueta}</span>
          Original ${dinero(d.monto)} · pagado ${Math.round(avance * 100)}%</p>
        <div class="barra"><div class="barra-relleno" style="width:${avance * 100}%"></div></div>
        <button class="boton-chico" data-ajustar="${d.id}">Ajustar saldo</button>
      </li>`;
  },

  mostrarAlerta() {
    const caja = $("alerta-15");
    const dia = Datos.actual.fechasImportantes.find(f => f.id === "accionLegal").diaDelMes;
    const dias = this.diasParaDia(dia);
    const saldoRenta = Datos.saldoDeuda(Plan.ID_DEUDA_RENTA);
    if (!(saldoRenta > this.CERO && dias <= 7)) { caja.hidden = true; return; }
    const cuando = dias === 0 ? "es hoy" : `es en ${dias} ${dias === 1 ? "día" : "días"}`;
    const c = Datos.actual.contactos.administradora;
    const tel = c.telefono.replace(/\D/g, "");
    caja.innerHTML = `
      <strong>⚠ Atención: renta pendiente</strong>
      El día ${dia} ${cuando} y la renta tiene saldo de ${dinero(saldoRenta)}.
      Manda tus comprobantes de pago a la administradora y pide un acuerdo de pago por escrito.
      <p class="contacto">${escapar(c.nombre)}<br>
        <a href="mailto:${escapar(c.correo)}">${escapar(c.correo)}</a><br>
        <a href="tel:${tel},${escapar(c.extension)}">${escapar(c.telefono)} ext. ${escapar(c.extension)}</a></p>`;
    caja.hidden = false;
  },

  mostrarPagos() {
    const c = Plan.calcular();
    const orden = this.prioritarias();
    const saldos = {};
    orden.forEach(d => { saldos[d.id] = Math.max(0, Datos.saldoDeuda(d.id)); });
    const hayExtra = c.sobrante > 0;
    const reparto = hayExtra ? this.repartir(c.aDeudas, saldos, orden) : {};
    const boton = (id, monto) =>
      `<button class="boton-chico lleno" data-pagar="${id}" data-monto="${redondear(monto)}">Ya lo pagué</button>`;

    // Renta: pago normal + extra
    const extraRenta = reparto[Plan.ID_DEUDA_RENTA] || 0;
    const totalRenta = c.semanalRenta + extraRenta;
    let html = `
      <div class="pago-bloque">
        <div class="deuda-nombre">Renta</div>
        <ul class="resumen">
          <li><span>Renta normal de la semana</span><span>${dinero(c.semanalRenta)}</span></li>
          <li><span>Extra a deudas</span><span>${dinero(extraRenta)}</span></li>
          <li class="total"><span>Total a la renta</span><span>${dinero(totalRenta)}</span></li>
        </ul>
        ${boton(Plan.ID_DEUDA_RENTA, totalRenta)}
      </div>`;

    if (!hayExtra) {
      html += `<p class="mensaje-sobrante negativo">Esta semana no hay extra para deudas. Cubre lo fijo primero.</p>`;
    } else {
      html = `<p class="nota-sobre">Dinero para deudas esta semana: <strong>${dinero(c.aDeudas)}</strong>` +
        (c.aColchon > 0 ? ` (y ${dinero(c.aColchon)} al colchón)` : "") + `</p>` +
        (c.puedePagarAmigo ? `<p class="mensaje-sobrante positivo">Ya puedes pagarle a tu amigo</p>` : "") + html;
      orden.filter(d => d.id !== Plan.ID_DEUDA_RENTA && reparto[d.id]).forEach(d => {
        html += `
          <div class="pago-bloque">
            <div class="deuda-cabeza">
              <span class="deuda-nombre">${escapar(d.nombre)}</span>
              <span class="deuda-nombre">${dinero(reparto[d.id])}</span>
            </div>
            ${boton(d.id, reparto[d.id])}
          </div>`;
      });
    }
    $("d-pagar").innerHTML = html;
  },

  textoLibre(p) {
    if (p.libre === "ya") return "Ya no tienes deudas";
    if (!p.libre) return `No se alcanza a pagar en ${this.MAX_SEMANAS} semanas`;
    return `${mesAño(p.libre)} (${p.semanas} sem.)`;
  },

  mostrarProyeccion() {
    const plan = Almacen.leerPlan();
    const extra = plan.extraProyeccion || 0;
    const p = this.proyectar(plan.porcentajeColchon, extra);

    const libre = $("d-libre");
    libre.className = "mensaje-sobrante " + (p.libre ? "positivo" : "negativo");
    libre.textContent = p.libre === "ya" ? "Ya no tienes deudas"
      : p.libre ? `Libre de deudas aproximadamente en ${mesAño(p.libre)} (${p.semanas} semanas)`
      : `Con estos números no se alcanza a pagar en ${this.MAX_SEMANAS} semanas`;

    const ritmo = [];
    if (p.ritmoConPrestamo != null) ritmo.push(`${dinero(p.ritmoConPrestamo)} por semana mientras dure el préstamo semanal`);
    if (p.ritmoSinPrestamo != null) ritmo.push(`${dinero(p.ritmoSinPrestamo)} después`);
    $("d-ritmo").textContent = ritmo.length
      ? `Con ${Datos.actual.ingresos.horasPorSemana} horas, a deudas van ${ritmo.join(" y ")}.` : "";

    const filas = [...this.prioritarias(), ...this.automaticas()].map(d => {
      const f = p.fechas[d.id];
      const texto = f === "pagada" ? "Pagada" : f ? fechaLarga(f) : "—";
      return `<li${d.id === "deudaAmigo" ? ' class="destacada"' : ""}><span>${escapar(d.nombre)}${d.id === "deudaAmigo" ? " queda en $0" : ""}</span><span>${texto}</span></li>`;
    });
    const fc = p.fechaColchon;
    filas.unshift(`<li class="destacada"><span>Colchón llega a ${dinero(Plan.metaColchon())}</span>
      <span>${fc === "ya" ? "Ya está lleno" : fc ? fechaLarga(fc) : "—"}</span></li>`);
    $("d-fechas").innerHTML = filas.join("");

    const actual = plan.porcentajeColchon;
    let comp = [50, 25, 0].map(pct => `
      <li class="${pct === actual ? "actual" : ""}">
        <span>${pct}% al colchón${pct === actual ? " (actual)" : ""}</span>
        <span>${this.textoLibre(this.proyectar(pct, extra))}</span>
      </li>`).join("");
    if (![50, 25, 0].includes(actual)) {
      comp += `<li class="actual"><span>${actual}% al colchón (actual)</span>
        <span>${this.textoLibre(p)}</span></li>`;
    }
    $("d-comparador").innerHTML = comp;
  },

  mostrar() {
    if ($("pantalla-deudas").hidden) return;
    this.mostrarAlerta();
    $("d-lista").innerHTML = this.prioritarias()
      .map(d => this.tarjetaDeuda(d, `Prioridad ${d.prioridad}`)).join("");
    const cuota = Datos.actual.gastosFijos.find(g => g.id === Plan.ID_GASTO_PRESTAMO).monto;
    $("d-automaticas").innerHTML = this.automaticas()
      .map(d => this.tarjetaDeuda(d, "Automático").replace(
        '<div class="barra">',
        `<p class="deuda-sub">Se paga con el gasto fijo de ${dinero(cuota)} por semana.</p><div class="barra">`
      )).join("");
    this.mostrarPagos();
    this.mostrarProyeccion();
  },

  iniciar() {
    $("abrir-deudas").addEventListener("click", () => this.abrir());
    $("volver-deudas").addEventListener("click", () => this.cerrar());
    $("pantalla-deudas").addEventListener("click", e => {
      const ajustar = e.target.closest("[data-ajustar]");
      if (ajustar) abrirFormulario("ajuste", { deudaId: ajustar.dataset.ajustar });
      const pagar = e.target.closest("[data-pagar]");
      if (pagar) abrirFormulario("pagoDeuda", { deudaId: pagar.dataset.pagar, monto: Number(pagar.dataset.monto) });
    });
    $("d-extra").addEventListener("input", e => {
      const v = Number(e.target.value);
      const plan = Almacen.leerPlan();
      plan.extraProyeccion = e.target.value.trim() === "" || !(v > 0) ? 0 : v;
      Almacen.guardarPlan(plan);
      this.mostrarProyeccion();
    });
    window.addEventListener("movimientos-cambiaron", () => this.mostrar());
  }
};

const mesAño = f => f.toLocaleDateString("es", { month: "long", year: "numeric" });
const fechaLarga = f => f.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });

if (Datos.actual) Deudas.iniciar();
