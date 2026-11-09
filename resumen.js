/*
 * A DÓNDE SE VA MI DINERO (Bloque 5)
 * Resumen de gastos por categoría y revisión "¿Cuadra mi dinero?".
 * Usa Datos (app.js), Plan (plan.js) y Almacen (almacen.js).
 */
const Resumen = {
  periodo: "semana",
  CUADRA: 5, // diferencia menor a $5 = cuadra bien

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
    const porCategoria = CATEGORIAS.map(c => ({
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
        if (m.tipo === "ingreso") return s + m.monto;
        if (m.tipo === "gasto" || m.tipo === "pagoDeuda") return s - m.monto;
        return s; // los ajustes de saldo no mueven dinero
      }, revision.monto);
  },

  // ---------- Pantalla ----------
  abrir() {
    this.periodo = "semana";
    $("r-dinero").value = "";
    $("r-resultado").textContent = "";
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
          <div class="barra fina"><div class="barra-relleno" style="width:${parte * 100}%"></div></div>
          ${this.lineaPresupuesto(cat.nombre, cat.total, c.rango.factor)}
        </li>`;
    }).join("");

    $("r-totales").innerHTML = `
      <li><span>Pagos de deudas atrasadas</span><span>${dinero(c.pagosDeudas)}</span></li>
      <li class="total"><span>Total gastado</span><span>${dinero(c.totalGastado)}</span></li>
      <li><span>Ingreso del período</span><span class="ok">${dinero(c.ingresos)}</span></li>`;

    this.mostrarUltimaRevision();
  },

  mostrarUltimaRevision() {
    const rev = Almacen.leerRevision();
    if (!rev) {
      $("r-ultimo").textContent = "Escríbelo cuando quieras (por ejemplo, el domingo). La próxima vez te diré si cuadra.";
      return;
    }
    const fecha = fechaCorta(this.aClave(new Date(rev.momento)));
    $("r-ultimo").textContent =
      `La última vez escribiste ${dinero(rev.monto)} el ${fecha}. ` +
      `Según tus movimientos, hoy deberías tener ${dinero(this.esperado(rev))}.`;
  },

  revisar() {
    const txt = $("r-dinero").value.trim();
    const monto = redondear(Number(txt));
    const res = $("r-resultado");
    if (txt === "" || !(monto >= 0)) {
      res.className = "mensaje-sobrante negativo";
      res.textContent = "Escribe cuánto dinero tienes hoy.";
      return;
    }
    const anterior = Almacen.leerRevision();
    if (!anterior) {
      res.className = "mensaje-sobrante cuadra";
      res.textContent = "Guardado. La próxima vez te diré si cuadra.";
    } else {
      const diferencia = redondear(monto - this.esperado(anterior));
      if (Math.abs(diferencia) < this.CUADRA) {
        res.className = "mensaje-sobrante cuadra";
        res.textContent = "Cuadra bien";
      } else if (diferencia < 0) {
        res.className = "mensaje-sobrante negativo";
        res.textContent = `Hay ${dinero(-diferencia)} que se fueron sin registrar`;
      } else {
        res.className = "mensaje-sobrante aviso";
        res.textContent = `Tienes ${dinero(diferencia)} más de lo esperado. Revisa si falta registrar un ingreso`;
      }
    }
    // Lo escrito hoy pasa a ser el nuevo punto de partida
    Almacen.guardarRevision({ monto, momento: new Date().toISOString() });
    $("r-dinero").value = "";
    this.mostrarUltimaRevision();
  },

  iniciar() {
    $("abrir-resumen").addEventListener("click", () => this.abrir());
    $("volver-resumen").addEventListener("click", () => this.cerrar());
    document.querySelectorAll("[data-periodo]").forEach(b =>
      b.addEventListener("click", () => { this.periodo = b.dataset.periodo; this.mostrar(); }));
    $("r-revisar").addEventListener("click", () => this.revisar());
    window.addEventListener("movimientos-cambiaron", () => this.mostrar());
  }
};

if (Datos.actual) Resumen.iniciar();
