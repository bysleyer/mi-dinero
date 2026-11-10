/*
 * SI ACEPTAN EL ACUERDO DE RENTA (Bloque 19)
 * SOLO SIMULA: no registra pagos, no cambia saldos ni deudas.
 * Cheques y gastos salen de proyeccion.js (sin las líneas de renta: aquí la renta se paga con los tramos).
 * Los parámetros se guardan con almacen.js.
 */
const Acuerdo = {
  // Valores del correo
  defecto() {
    const g = Datos.actual.gastosFijos.find(x => x.id === "renta");
    return {
      saldoInicial: Math.max(0, Datos.saldoDeuda(Plan.ID_DEUDA_RENTA)),
      renta: g ? g.monto : 0,
      recargo: { activo: true, monto: 50, dia: 6 },
      tramos: [
        { inicio: "2026-11-13", fin: "2026-11-13", monto: 100 },
        { inicio: "2026-11-20", fin: "2026-12-04", monto: 250 },
        { inicio: "2026-12-11", fin: "2027-05-28", monto: 450 }
      ]
    };
  },

  parametros() {
    return Almacen.leerAcuerdoSimulado() || this.defecto();
  },

  // ---------- Pantalla ----------
  abrir() {
    document.querySelectorAll("main.contenedor").forEach(x => { x.hidden = true; });
    $("pantalla-acuerdo").hidden = false;
    window.scrollTo(0, 0);
    this.p = this.parametros();
    this.mostrarParametros();
    this.mostrarResultado();
  },

  cerrar() {
    $("pantalla-acuerdo").hidden = true;
    $("pantalla-futuro").hidden = false;
    window.scrollTo(0, 0);
  },

  mostrarParametros() {
    const p = this.p;
    $("ac-saldo").value = p.saldoInicial;
    $("ac-renta").value = p.renta;
    $("ac-recargo-activo").checked = !!p.recargo.activo;
    $("ac-recargo-monto").value = p.recargo.monto;
    $("ac-recargo-dia").value = p.recargo.dia;
    $("ac-tramos").innerHTML = p.tramos.map((t, i) => `
      <li class="ac-tramo">
        <label>Desde<input type="date" data-ac-campo="inicio" data-ac-i="${i}" value="${t.inicio}"></label>
        <label>Hasta<input type="date" data-ac-campo="fin" data-ac-i="${i}" value="${t.fin}"></label>
        <label>Por viernes<input type="number" inputmode="decimal" step="0.01" min="0" data-ac-campo="monto" data-ac-i="${i}" value="${t.monto}"></label>
        <button class="borrar" data-ac-borrar="${i}" aria-label="Borrar tramo">✕</button>
      </li>`).join("");
  },

  // Lee y valida lo escrito; si está bien, lo guarda
  leer() {
    const n = id => $(id).value.trim() === "" ? NaN : Number($(id).value);
    const p = {
      saldoInicial: n("ac-saldo"), renta: n("ac-renta"),
      recargo: { activo: $("ac-recargo-activo").checked, monto: n("ac-recargo-monto"), dia: n("ac-recargo-dia") },
      tramos: [...document.querySelectorAll(".ac-tramo")].map(li => ({
        inicio: li.querySelector('[data-ac-campo="inicio"]').value,
        fin: li.querySelector('[data-ac-campo="fin"]').value,
        monto: li.querySelector('[data-ac-campo="monto"]').value.trim() === "" ? NaN : Number(li.querySelector('[data-ac-campo="monto"]').value)
      }))
    };
    if (!(p.saldoInicial >= 0)) return { error: "El saldo de renta al empezar tiene que ser 0 o más." };
    if (!(p.renta >= 0)) return { error: "La renta mensual tiene que ser 0 o más." };
    if (!(p.recargo.monto >= 0)) return { error: "El recargo tiene que ser 0 o más." };
    if (!(Number.isInteger(p.recargo.dia) && p.recargo.dia >= 1 && p.recargo.dia <= 31)) return { error: "El día del recargo tiene que ser del 1 al 31." };
    if (!p.tramos.length) return { error: "Agrega al menos un tramo de pago." };
    for (const [i, t] of p.tramos.entries()) {
      if (!t.inicio || !t.fin) return { error: `Tramo ${i + 1}: pon la fecha de inicio y la de fin.` };
      if (t.inicio > t.fin) return { error: `Tramo ${i + 1}: la fecha de inicio tiene que ser antes de la de fin.` };
      if (!(t.monto >= 0)) return { error: `Tramo ${i + 1}: el monto por viernes tiene que ser 0 o más.` };
    }
    return p;
  },

  cambio() {
    const p = this.leer();
    if (p.error) { $("ac-error").textContent = p.error; return; }
    $("ac-error").textContent = "";
    this.p = p;
    Almacen.guardarAcuerdoSimulado(p);
    this.mostrarResultado();
  },

  // ---------- Cálculo ----------
  pagoDelViernes(p, f) {
    return redondear(p.tramos.filter(t => f >= t.inicio && f <= t.fin).reduce((s, t) => s + t.monto, 0));
  },

  esUltimoViernes(f) {
    return Jornadas.sumarDias(f, 7).slice(0, 7) !== f.slice(0, 7);
  },

  primeroDelMesSiguiente(f) {
    const d = Jornadas.aFecha(f);
    return Resumen.aClave(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  },

  calcular(p) {
    const hoyClave = hoy();
    const fin = p.tramos.map(t => t.fin).sort().slice(-1)[0];
    // Viernes desde hoy hasta el último tramo
    const viernes = [];
    let f = Jornadas.sumarDias(hoyClave, (5 - Jornadas.aFecha(hoyClave).getDay() + 7) % 7);
    for (; f <= fin; f = Jornadas.sumarDias(f, 7)) viernes.push(f);
    const pagos = viernes.map(v => ({ fecha: v, monto: this.pagoDelViernes(p, v) }));

    // Cheques y gastos: proyeccion.js, con los pagos del acuerdo y sin las líneas de renta
    const est = Futuro.estado();
    const horizonte = Math.round((Jornadas.aFecha(fin) - Jornadas.aFecha(hoyClave)) / 86400000) + 7;
    const pr = Proyeccion.calcular({ chequeEscenario: Escenarios.config()[est.escenario], horizonte, sinRenta: true,
      extras: pagos.filter(x => x.monto > 0).map(x => ({ fecha: x.fecha, monto: -x.monto, nombre: "Pago del acuerdo de renta" })) });

    // Saldo de la renta día por día: la renta se carga el día 1; el recargo, el día elegido si queda saldo
    let saldo = p.saldoInicial, pagado = 0, recargos = 0, rentas = 0;
    const saldoRenta = {};
    const pagoDe = {};
    pagos.forEach(x => { pagoDe[x.fecha] = x.monto; });
    for (let d = hoyClave; d <= fin; d = Jornadas.sumarDias(d, 1)) {
      const dia = Jornadas.aFecha(d).getDate();
      if (dia === 1 && d > hoyClave) { saldo = redondear(saldo + p.renta); rentas++; }
      if (pagoDe[d]) { saldo = redondear(saldo - pagoDe[d]); pagado = redondear(pagado + pagoDe[d]); }
      if (p.recargo.activo && dia === p.recargo.dia && d > hoyClave && saldo > 0.005) {
        saldo = redondear(saldo + p.recargo.monto); recargos = redondear(recargos + p.recargo.monto);
      }
      saldoRenta[d] = saldo;
    }
    // Primer último viernes del mes en que lo pagado cubre el saldo inicial, las rentas hasta el día 1 siguiente y los recargos
    const aTiempo = viernes.find(v => this.esUltimoViernes(v) && saldoRenta[v] + p.renta <= 0.005) || null;
    const faltan = aTiempo ? 0 : redondear(Math.max(0, saldoRenta[fin] + p.renta));

    // Tabla por viernes (la semana va del viernes al jueves)
    const fechas = Object.keys(pr.porDia).sort();
    const minDesde = {};
    let min = Infinity;
    for (let i = fechas.length - 1; i >= 0; i--) { min = Math.min(min, pr.porDia[fechas[i]].saldoFin); minDesde[fechas[i]] = min; }
    let yaLibre = 0;
    const filas = viernes.map((v, i) => {
      const desde = i === 0 ? hoyClave : v;
      const hasta = Jornadas.sumarDias(v, 6);
      const lineas = fechas.filter(x => x >= desde && x <= hasta).flatMap(x => pr.porDia[x].lineas);
      const suma = fn => redondear(lineas.filter(fn).reduce((s, l) => s + l.monto, 0));
      const esFactura = l => l.tipo === "pago" && l.id !== "prestamo" && !l.planeado;
      const cheque = suma(l => l.tipo === "cheque");
      const facturas = suma(l => l.monto < 0 && esFactura(l));
      const gastos = suma(l => l.monto < 0 && l.tipo !== "simulado" && !esFactura(l));
      const nombresFacturas = lineas.filter(l => l.monto < 0 && esFactura(l)).map(l => l.nombre);
      const libre = redondear(Math.max(0, (minDesde[v] ?? 0) - yaLibre));
      yaLibre = redondear(yaLibre + libre);
      const bajo = Math.min(...fechas.filter(x => x >= desde && x <= hasta).map(x => pr.porDia[x].saldoFin));
      return { viernes: v, desde, cheque, gastos, acuerdo: pagoDe[v] || 0, facturas, nombresFacturas, libre,
               faltan: bajo < -0.005 ? redondear(-bajo) : 0 };
    });

    let bajo = null;
    fechas.filter(x => x <= fin).forEach(x => { if (!bajo || pr.porDia[x].saldoFin < bajo.saldo) bajo = { fecha: x, saldo: pr.porDia[x].saldoFin }; });
    const porMes = {};
    filas.forEach(x => { const m = x.viernes.slice(0, 7); porMes[m] = redondear((porMes[m] || 0) + x.libre); });
    return { aTiempo, mesATiempo: aTiempo ? this.primeroDelMesSiguiente(aTiempo) : null, faltan, filas, pagado, recargos, rentas, bajo, porMes,
             escenario: Futuro.ESCENARIOS.find(e => e.id === est.escenario).titulo };
  },

  // ---------- Resultado ----------
  diaLargo(f) {
    const d = Jornadas.aFecha(f);
    return `${d.toLocaleDateString("es", { weekday: "long" })} ${d.getDate()} de ${d.toLocaleDateString("es", { month: "long" })} de ${d.getFullYear()}`;
  },

  mostrarResultado() {
    const r = this.calcular(this.p);
    this._r = r;
    const mes = f => Jornadas.aFecha(f).toLocaleDateString("es", { month: "long", year: "numeric" });
    $("ac-frase").className = "fu-frase " + (r.aTiempo ? "positivo" : "negativo");
    $("ac-frase").textContent = r.aTiempo
      ? `Con este acuerdo pagas a tiempo desde la renta de ${mes(r.mesATiempo)}: el ${this.diaLargo(r.aTiempo)} ya estaría pagada antes del día 1.`
      : `Con estos tramos no llegas a pagar a tiempo. Te faltarían ${dinero(r.faltan)}.`;
    $("ac-resumen").innerHTML = `
      <li><span>Total pagado a la administradora</span><span>${dinero(r.pagado)}</span></li>
      <li><span>Total de recargos</span><span>${dinero(r.recargos)}</span></li>
      <li><span>Saldo más bajo</span><span class="${r.bajo && r.bajo.saldo < 0 ? "error" : ""}">${r.bajo ? `${Futuro.plata(r.bajo.saldo)} · ${Futuro.diaCorto(r.bajo.fecha)}` : "—"}</span></li>
      ${Object.entries(r.porMes).map(([m, v]) => `<li><span>Libre en ${mes(m + "-01")}</span><span>${dinero(v)}</span></li>`).join("")}`;
    $("ac-semanas").innerHTML = r.filas.map(x => `
      <li class="ac-semana ${x.faltan > 0 ? "rojo" : ""}">
        <div class="ac-semana-fecha">${Jornadas.textoDia(x.viernes)}${x.desde < x.viernes ? ` <span class="opcional">(incluye desde hoy, ${Futuro.diaCorto(x.desde)})</span>` : ""}</div>
        <div class="ac-semana-datos">
          <span>Cheque esperado</span><span class="ok">+${dinero(x.cheque)}</span>
          <span>Gastos de la semana</span><span>−${dinero(Math.abs(x.gastos))}</span>
          <span>Pago del acuerdo</span><span>−${dinero(x.acuerdo)}</span>
          <span>Facturas${x.nombresFacturas.length ? ` (${escapar(x.nombresFacturas.join(", "))})` : ""}</span><span>−${dinero(Math.abs(x.facturas))}</span>
          <span><strong>Libre para lo que quieras</strong></span><span><strong>${dinero(x.libre)}</strong></span>
        </div>
        ${x.faltan > 0 ? `<p class="error ac-falta">Aquí no alcanza: faltan ${dinero(x.faltan)}</p>` : ""}
      </li>`).join("");
    $("ac-cuenta").textContent = `Escenario: ${r.escenario}. Cheques y gastos con la misma cuenta de Mi futuro; la renta se paga solo con los tramos. Solo es una simulación: no se registró nada.`;
  },

  iniciar() {
    $("abrir-acuerdo").addEventListener("click", () => this.abrir());
    $("volver-acuerdo").addEventListener("click", () => this.cerrar());
    $("ac-parametros").addEventListener("change", () => this.cambio());
    $("ac-parametros").addEventListener("click", e => {
      const b = e.target.closest("[data-ac-borrar]");
      if (b) {
        this.p.tramos.splice(Number(b.dataset.acBorrar), 1);
        this.mostrarParametros();
        this.cambio();
      }
      if (e.target.closest("#ac-agregar")) {
        const ultimo = this.p.tramos[this.p.tramos.length - 1];
        const inicio = ultimo && ultimo.fin ? Jornadas.sumarDias(ultimo.fin, 7) : hoy();
        this.p.tramos.push({ inicio, fin: inicio, monto: ultimo ? ultimo.monto : 0 });
        this.mostrarParametros();
        this.cambio();
      }
      if (e.target.closest("#ac-correo")) {
        this.p = this.defecto();
        Almacen.guardarAcuerdoSimulado(this.p);
        this.mostrarParametros();
        $("ac-error").textContent = "";
        this.mostrarResultado();
        Pantalla.aviso("Valores del correo");
      }
    });
  }
};

if (Datos.actual) Acuerdo.iniciar();
