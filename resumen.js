/*
 * A DÓNDE SE VA MI DINERO (Bloque 5)
 * Resumen de gastos por categoría y revisión "¿Cuadra mi dinero?".
 * Usa Datos (app.js), Plan (plan.js) y Almacen (almacen.js).
 */
const Resumen = {
  periodo: "semana",
  CUADRA: 1, // diferencia menor a $1 = cuadra bien

  // ---------- Fechas ----------
  aClave(d) {
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },

  // Devuelve { inicio, fin, factor } (factor = cuántas semanas de presupuesto caben)
  rango(periodo) {
    const ahora = new Date();
    if (periodo === "mes") {
      const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      const fin = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0);
      return { inicio: this.aClave(inicio), fin: this.aClave(fin), factor: fin.getDate() / 7 };
    }
    if (periodo === "cuatro") {
      const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 27);
      return { inicio: this.aClave(inicio), fin: hoy(), factor: 4 };
    }
    // Esta semana: lunes a domingo
    const lunes = Plan.claveSemana(ahora);
    const [a, m, d] = lunes.split("-").map(Number);
    return { inicio: lunes, fin: this.aClave(new Date(a, m - 1, d + 6)), factor: 1 };
  },

  // ---------- Cálculos ----------
  calcular(periodo) {
    const r = this.rango(periodo);
    const movs = Almacen.leerMovimientos().filter(m => m.fecha >= r.inicio && m.fecha <= r.fin);
    const suma = lista => lista.reduce((s, m) => s + m.monto, 0);

    const gastos = movs.filter(m => m.tipo === "gasto");
    const extras = [...new Set(gastos.map(m => m.categoria))].filter(c => c && !CATEGORIAS.includes(c));
    const porCategoria = [...CATEGORIAS, ...extras].map(c => ({
      nombre: c,
      total: suma(gastos.filter(m => m.categoria === c))
    }));
    return {
      rango: r,
      porCategoria,
      totalGastado: suma(gastos),
      pagosDeudas: suma(movs.filter(m => m.tipo === "pagoDeuda")),
      ingresos: suma(movs.filter(m => m.tipo === "ingreso"))
    };
  },

  // Presupuesto semanal desde datos.js (solo Comida y Transporte)
  presupuestoSemanal(categoria) {
    const id = { Comida: "comida", Transporte: "transporte" }[categoria];
    if (!id) return null;
    return Datos.actual.gastosFijos.find(g => g.id === id).monto;
  },

  // Dinero esperado = último escrito + ingresos − gastos − pagos registrados desde entonces
  esperado(revision) {
    return Almacen.leerMovimientos()
      .filter(m => m.creado > revision.momento)
      .reduce((s, m) => {
        if (m.incluidoEnCorreccion) return s;
        if (m.tipo === "ingreso") return s + m.monto;
        if (m.tipo === "gasto" || m.tipo === "pagoDeuda") return s - m.monto;
        return s; // los ajustes de saldo no mueven dinero
      }, revision.monto);
  },

  // ---------- Pantalla ----------
  abrir() {
    this.periodo = "semana";
    $("r-dinero").value = ""; // lo que cuentas tú (no el número de la app)
    $("r-resultado").textContent = "";
    $("r-acciones").innerHTML = "";
    $("r-detalle").hidden = true;
    $("pantalla-inicio").hidden = true;
    $("pantalla-resumen").hidden = false;
    window.scrollTo(0, 0);
    this.mostrar();
  },

  cerrar() {
    $("pantalla-resumen").hidden = true;
    $("pantalla-inicio").hidden = false;
    window.scrollTo(0, 0);
  },

  lineaPresupuesto(categoria, gastado, factor) {
    const semanal = this.presupuestoSemanal(categoria);
    if (semanal == null) return "";
    const tope = redondear(semanal * factor);
    const resta = tope - gastado;
    const color = gastado > tope ? "rojo" : gastado > tope * 0.8 ? "amarillo" : "verde";
    const texto = resta >= 0
      ? `Llevas ${dinero(gastado)} de ${dinero(tope)}. Te quedan ${dinero(resta)}`
      : `Llevas ${dinero(gastado)} de ${dinero(tope)}. Te pasaste por ${dinero(-resta)}`;
    return `<p class="presupuesto ${color}">${texto}</p>`;
  },

  mostrar() {
    if ($("pantalla-resumen").hidden) return;
    document.querySelectorAll("[data-periodo]").forEach(b =>
      b.classList.toggle("activo", b.dataset.periodo === this.periodo));

    const c = this.calcular(this.periodo);
    $("r-rango").textContent = `Del ${fechaCorta(c.rango.inicio)} al ${fechaCorta(c.rango.fin)}`;

    $("r-categorias").innerHTML = c.porCategoria.map(cat => {
      const parte = c.totalGastado > 0 ? cat.total / c.totalGastado : 0;
      return `
        <li>
          <div class="deuda-cabeza">
            <span class="deuda-nombre">${cat.nombre}</span>
            <span class="deuda-saldo neutro">${dinero(cat.total)}</span>
          </div>
          <div class="barra fina"><div class="barra-relleno" style="--p:${parte}"></div></div>
          ${this.lineaPresupuesto(cat.nombre, cat.total, c.rango.factor)}
        </li>`;
    }).join("");

    $("r-totales").innerHTML = `
      <li><span>Pagos de deudas atrasadas</span><span>${dinero(c.pagosDeudas)}</span></li>
      <li class="total"><span>Total gastado</span><span>${dinero(c.totalGastado)}</span></li>
      <li><span>Ingreso del período</span><span class="ok">${dinero(c.ingresos)}</span></li>`;

    this.mostrarUltimaRevision();
  },

  // Lo que cuentas tú (efectivo + cuenta) contra el número de arriba ("Tengo")
  mostrarUltimaRevision() {
    const p = Dinero.pasoAPaso();
    const desde = p.inicial
      ? ` (desde que corregiste tu dinero a ${dinero(p.inicial.monto)} el ${this.momentoTexto(p.inicial.momento)})` : "";
    $("r-ultimo").innerHTML = `La app calcula que tienes <strong>${Futuro.plata(p.total)}</strong>${desde}.
      Cuenta tu efectivo y tu cuenta, escríbelo y toca "Revisar".`;
    if (!$("r-detalle").hidden) this.mostrarDetalle();
  },

  momentoTexto(iso) {
    return new Date(iso).toLocaleString("es", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  },

  // "Ver de dónde sale": la cuenta paso a paso
  mostrarDetalle() {
    const p = Dinero.pasoAPaso();
    const fila = (t, sub, monto, clase = "") => `<li><span>${t}${sub ? `<span class="detalle">${sub}</span>` : ""}</span><span class="${clase}">${monto}</span></li>`;
    const nombre = m => escapar(m.nota || m.categoria || (m.tipo === "ingreso" ? "Ingreso" : "Pago de deuda"));
    $("r-detalle").innerHTML = `<ul class="resumen">
      ${p.inicial ? fila("Corregiste tu dinero", this.momentoTexto(p.inicial.momento), dinero(p.inicial.monto)) : fila("Empieza en", "", dinero(0))}
      ${p.movs.map(m => fila(nombre(m), `${fechaCorta(m.fecha)} · registrado ${this.momentoTexto(m.creado)}`,
        m.tipo === "ingreso" ? `+${dinero(m.monto)}` : `−${dinero(m.monto)}`, m.tipo === "ingreso" ? "ok" : "")).join("")}
      <li class="total"><span>La app calcula</span><span>${Futuro.plata(p.total)}</span></li></ul>
      <p class="estado">Solo cuenta lo registrado después de tu última corrección. Lo marcado como "ya estaba incluido" no se cuenta otra vez.</p>`;
  },

  revisar() {
    const txt = $("r-dinero").value.trim();
    const monto = redondear(Number(txt));
    const res = $("r-resultado");
    $("r-acciones").innerHTML = "";
    if (txt === "" || !(monto >= 0)) {
      res.className = "mensaje-sobrante negativo";
      res.textContent = "Cuenta tu dinero (efectivo + cuenta) y escríbelo.";
      return;
    }
    const app = Dinero.actual();
    const diferencia = redondear(monto - app);
    if (Math.abs(diferencia) < this.CUADRA) {
      res.className = "mensaje-sobrante cuadra";
      res.textContent = `✓ Cuadra: tienes ${dinero(monto)} y la app calcula ${Futuro.plata(app)}.`;
    } else if (diferencia < 0) {
      res.className = "mensaje-sobrante negativo";
      res.textContent = `Faltan ${dinero(-diferencia)} por registrar: la app calcula ${Futuro.plata(app)} y tú tienes ${dinero(monto)}.`;
      $("r-acciones").innerHTML = `
        <button class="boton-chico lleno" data-r-gasto="${-diferencia}">Registrar el gasto que falta (${dinero(-diferencia)})</button>
        <button class="boton-chico" data-r-corregir="${monto}">Corregir mi dinero a ${dinero(monto)}</button>`;
    } else {
      res.className = "mensaje-sobrante aviso";
      res.textContent = `Tienes ${dinero(diferencia)} más de lo que calcula la app (${Futuro.plata(app)}). ¿Falta registrar un ingreso?`;
      $("r-acciones").innerHTML = `
        <button class="boton-chico lleno" data-r-ingreso="${diferencia}">Registrar el ingreso que falta (${dinero(diferencia)})</button>
        <button class="boton-chico" data-r-corregir="${monto}">Corregir mi dinero a ${dinero(monto)}</button>`;
    }
    // Se guarda lo que contaste (historial)
    Almacen.guardarRevision({ monto, momento: new Date().toISOString() });
  },

  iniciar() {
    $("abrir-resumen").addEventListener("click", () => this.abrir());
    $("volver-resumen").addEventListener("click", () => this.cerrar());
    document.querySelectorAll("[data-periodo]").forEach(b =>
      b.addEventListener("click", () => { this.periodo = b.dataset.periodo; this.mostrar(); }));
    $("r-revisar").addEventListener("click", () => this.revisar());
    $("r-ver").addEventListener("click", () => {
      $("r-detalle").hidden = !$("r-detalle").hidden;
      $("r-ver").textContent = $("r-detalle").hidden ? "Ver de dónde sale" : "Ocultar";
      if (!$("r-detalle").hidden) this.mostrarDetalle();
    });
    $("r-acciones").addEventListener("click", e => {
      const g = e.target.closest("[data-r-gasto]");
      if (g) abrirFormulario("gasto", { monto: Number(g.dataset.rGasto) });
      const i = e.target.closest("[data-r-ingreso]");
      if (i) { abrirFormulario("ingreso", { monto: Number(i.dataset.rIngreso) }); $("f-tipo-ingreso").value = "otro"; $("f-tipo-ingreso").dispatchEvent(new Event("change", { bubbles: true })); }
      const c = e.target.closest("[data-r-corregir]");
      if (c) abrirFormulario("corregirDinero", { monto: Number(c.dataset.rCorregir) });
    });
    window.addEventListener("movimientos-cambiaron", () => this.mostrar());
  }
};

if (Datos.actual) Resumen.iniciar();
