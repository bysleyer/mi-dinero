/*
 * ¿Y SI COBRO...? (Bloque 11)
 * Reparte un cheque posible (Menos / Lo esperado / Más) según las reglas de
 * prioridad de mis datos ("reglasDePrioridad"):
 *   Nivel 1 (no se atrasa): renta → préstamo semanal → transporte → comida.
 *   Nivel 2 (se divide o se mueve con costo): por fecha de vencimiento más cercana.
 *   Nivel 3 / semana buena: renta atrasada → internet atrasado → colchón → deudas (Bloque 4).
 * Solo muestra: no registra dinero ni toca saldos.
 */
const Escenarios = {
  DIAS: 14, // vencimientos de hoy a 13 días después (ej.: del 9 al 22)

  DEFECTO: {
    nivel1: { pagos: ["renta", "prestamoSemanal", "transporte", "comida"], comidaMinima: null },
    nivel2: {},
    recargos: { renta: null, internetPorFactura: null, luz: { monto: null }, telefono: { monto: null } },
    semanaBuena: { porcentajeColchon: 50 }
  },

  reglas() {
    const r = Datos.actual.reglasDePrioridad || {};
    return {
      nivel1: { ...this.DEFECTO.nivel1, ...(r.nivel1 || {}) },
      nivel2: { ...this.DEFECTO.nivel2, ...(r.nivel2 || {}) },
      recargos: { ...this.DEFECTO.recargos, ...(r.recargos || {}) },
      semanaBuena: { ...this.DEFECTO.semanaBuena, ...(r.semanaBuena || {}) }
    };
  },

  // Montos iniciales de "Menos" y "Más": de mis datos (reglasDePrioridad.escenarios);
  // si no están, la semana mala de mis datos y 20% más que el cheque esperado
  porDefecto() {
    const e = (Datos.actual.reglasDePrioridad || {}).escenarios || {};
    const esperado = Proyeccion.chequeEsperado(Jornadas.periodoProximoCheque().cobro).monto;
    return {
      menos: e.menos ?? Datos.actual.ingresos.semanaMala.netoMinimo,
      mas: e.mas ?? redondear(esperado * 1.2)
    };
  },

  // ---------- Montos de los escenarios (editables, guardados) ----------
  config() {
    const g = Almacen.leerEscenarios() || {};
    const cobro = Jornadas.periodoProximoCheque().cobro;
    return {
      menos: g.menos ?? this.porDefecto().menos,
      esperado: g.esperado ?? redondear(Proyeccion.chequeEsperado(cobro).monto),
      esperadoAuto: g.esperado == null,
      mas: g.mas ?? this.porDefecto().mas,
      porcentajeColchon: g.porcentajeColchon ?? this.reglas().semanaBuena.porcentajeColchon
    };
  },

  // El dinero de ¿Me alcanza?: el calculado, o el escrito a mano hoy
  dineroHoy() {
    const manual = Dinero.manualVigente();
    return manual != null ? manual : Dinero.actual();
  },

  // ---------- Costos de atrasar ----------
  textoRecargo(r) {
    if (r && typeof r === "object") r = r.monto;
    return r == null ? "recargo por confirmar" : `recargo de ${dinero(r)}`;
  },

  costo(id) {
    const rec = this.reglas().recargos;
    if (id === "renta") return `${this.textoRecargo(rec.renta).replace(/^r/, "R")} y acción legal el día ${Calendario.diaDelMes("accionLegal", 15)}`;
    if (id === "luz") return `Cargo por atraso (${this.textoRecargo(rec.luz)})`;
    if (id === "telefono") return `Cargo por atraso (${this.textoRecargo(rec.telefono)})`;
    if (id === "internet") return `${this.textoRecargo(rec.internetPorFactura).replace(/^r/, "R")} por factura vencida`;
    if (id === "deudaInternet") return `${this.textoRecargo(rec.internetPorFactura).replace(/^r/, "R")} por factura vencida · RIESGO ALTO: ${(this.reglas().nivel2.deudaInternet || {}).nota || "pago inmediato"}`;
    return "";
  },

  // ---------- Repartir un escenario ----------
  // Usa la MISMA cuenta día por día que "Mover este pago" (proyeccion.js):
  // dinero de arriba + cheques en su fecha (el próximo con el monto del escenario) − vencimientos y gastos semanales.
  N1: ["renta", "prestamo", "transporte", "comida"],
  N2: ["luz", "telefono", "internet"],

  repartir(ingreso, _dineroHoy, porcentajeColchon) {
    const r = this.reglas();
    const pr = Proyeccion.calcular({ chequeEscenario: ingreso });
    const desde = pr.desde;
    const hasta = Jornadas.sumarDias(desde, this.DIAS - 1);
    const filas = [];
    const noCubreN1 = [];
    const textoCheque = f => `Se paga con el cheque del ${Jornadas.textoDia(f).toLowerCase()}`;

    let saldo = pr.inicial;
    let chequesHasta = 0;
    let faltoParaRenta = false;
    for (let f = desde; f <= hasta; f = Jornadas.sumarDias(f, 1)) {
      pr.porDia[f].lineas.forEach(l => {
        if (l.tipo === "cheque") { saldo = redondear(saldo + l.monto); chequesHasta += l.monto; return; }
        const monto = -l.monto;
        const nivel = this.N1.includes(l.id) ? 1 : (this.N2.includes(l.id) || l.inmediato) ? 2 : 0;
        if (!nivel) { saldo = redondear(saldo + l.monto); return; }
        let paga = 0, estado, costo = "", clase, conCheque = null;

        if (nivel === 1) {
          // Nivel 1, en orden dentro del día (la renta antes que el préstamo)
          const antes = saldo;
          const minimo = l.id === "comida" ? (r.nivel1.comidaMinima ?? monto) : monto;
          if (antes >= monto - 0.005) { paga = monto; estado = "Se paga"; clase = "paga"; }
          else if (l.id === "comida" && antes >= minimo) { paga = minimo; estado = `Se paga, bajada a ${dinero(minimo)}`; clase = "baja"; }
          else { paga = Math.max(0, antes); estado = paga > 0 ? `Parcial (${dinero(paga)})` : "Se atrasa"; clase = "falta"; }
          if (paga > 0 && antes - chequesHasta < paga - 0.005 && chequesHasta > 0) conCheque = Proyeccion.ultimoCheque(pr, f);
          if (l.id === "renta" && clase === "falta") { faltoParaRenta = true; costo = this.costo("renta"); }
          if (l.id === "prestamo" && clase === "falta" && faltoParaRenta) {
            costo = "Se salta para completar la renta (única excepción). Avisa antes a quien te prestó.";
          }
          if (clase === "falta") noCubreN1.push(l.nombre);
        } else {
          // Nivel 2: igual que "Mover este pago": ¿el saldo al final de su día queda en 0 o más?
          const e = Proyeccion.estadoEnFecha(pr, f);
          const reglas = r.nivel2[l.id] || {};
          const disponible = Math.max(0, redondear(pr.porDia[f].saldoFin + monto));
          const partes = reglas.sePuedeDividir ? (reglas.pagos || 2) : 1;
          if (e.alcanza) {
            paga = monto; clase = "paga"; conCheque = e.conCheque; estado = "Se paga";
          } else if (partes > 1 && disponible >= monto / partes) {
            paga = redondear(monto / partes); estado = "Se mueve o se divide"; clase = "mueve";
            costo = `Paga ${dinero(paga)} ahora y ${dinero(monto - paga)} después. Pide la fecha nueva por escrito.`;
          } else if (disponible > 0 && !reglas.sePuedeMover) {
            paga = disponible; estado = `Parcial (${dinero(paga)})`; costo = this.costo(l.id); clase = "falta";
          } else {
            estado = reglas.riesgo ? "Se atrasa" : "Se mueve o se divide";
            costo = this.costo(l.id); clase = reglas.riesgo ? "falta" : "mueve";
          }
          l.riesgo = reglas.riesgo;
        }
        if (conCheque && clase === "paga") estado = textoCheque(conCheque);
        saldo = redondear(saldo + l.monto);
        filas.push({ nivel, id: l.id, nombre: l.nombre, monto, fecha: f, paga, estado, costo, clase,
                     conCheque, claveMov: l.claveMov, movido: l.movido, riesgo: l.riesgo });
      });
    }

    // Resumen: el saldo más bajo de estos días dice si falta o cuánto sobra sin poner nada en riesgo
    let minimo = Infinity;
    for (let f = desde; f <= hasta; f = Jornadas.sumarDias(f, 1)) minimo = Math.min(minimo, pr.porDia[f].saldoFin);
    const falta = redondear(Math.max(0, -minimo));
    const sobra = falta > 0 ? 0 : redondear(minimo);
    const seMueven = filas.filter(f => f.paga < f.monto - 0.005);
    const reparto = sobra > 0 ? this.repartirExtra(sobra, porcentajeColchon, filas) : [];
    const disponible = redondear(pr.inicial + pr.chequesInfo.filter(c => c.fecha <= hasta && c.origen !== "real").reduce((s, c) => s + c.monto, 0));
    return { ingreso, disponible, filas, sobra, falta, seMueven, noCubreN1, reparto, desde, hasta,
             cuenta: Proyeccion.textoCuenta(pr, hasta), pr };
  },

  // Semana buena: renta (del mes y atrasada) → internet atrasado → colchón (hasta su meta) → deudas del Bloque 4
  repartirExtra(extra, porcentajeColchon, filas) {
    let E = extra;
    const lista = [];
    const pagadoYa = id => filas.filter(f => f.id === id).reduce((s, f) => s + f.paga, 0);
    const dar = (nombre, cuanto) => {
      const monto = redondear(Math.min(E, Math.max(0, cuanto)));
      if (monto > 0) { lista.push({ nombre, monto }); E = redondear(E - monto); }
    };
    // Mismo reparto que el Plan y Mis deudas (Plan.repartirExtra)
    const orden = Plan.deudasEnOrden();
    const saldos = {};
    orden.forEach(d => { saldos[d.id] = Math.max(0, Datos.saldoDeuda(d.id) - pagadoYa(d.id)); });
    const meta = Plan.metaColchon();
    const r = Plan.repartirExtra(extra, { pct: porcentajeColchon / 100, colchon: Almacen.leerPlan().sobres.colchon, meta, saldos, orden });
    const nombre = id => orden.find(d => d.id === id).nombre;
    Plan.DEUDAS_PRIMERO.forEach(id => { if (r.deudas[id]) dar(nombre(id), r.deudas[id]); });
    if (r.aColchon > 0) dar(`Colchón (${porcentajeColchon}% hasta llegar a ${dinero(meta)})`, r.aColchon);
    orden.filter(d => !Plan.DEUDAS_PRIMERO.includes(d.id) && r.deudas[d.id]).forEach(d => dar(d.nombre, r.deudas[d.id]));
    if (E > 0) lista.push({ nombre: "Sobra sin asignar", monto: E });
    return lista;
  },

  // ---------- Pantalla ----------
  abrir(origen = "pantalla-alcanza") {
    this.origen = origen;
    $(origen).hidden = true;
    $("pantalla-escenarios").hidden = false;
    window.scrollTo(0, 0);
    const c = this.config();
    $("e-menos").value = c.menos;
    $("e-esperado").value = c.esperadoAuto ? "" : c.esperado;
    $("e-esperado").placeholder = String(c.esperado);
    $("e-mas").value = c.mas;
    $("e-colchon").value = c.porcentajeColchon;
    this.mostrar();
  },

  cerrar() {
    $("pantalla-escenarios").hidden = true;
    $(this.origen || "pantalla-alcanza").hidden = false;
    window.scrollTo(0, 0);
    Alcanza.mostrar();
    window.dispatchEvent(new Event("movimientos-cambiaron"));
  },

  ESCENARIOS: [
    { id: "menos", titulo: "Menos" },
    { id: "esperado", titulo: "Lo esperado" },
    { id: "mas", titulo: "Más" }
  ],

  mostrar() {
    if ($("pantalla-escenarios").hidden) return;
    const c = this.config();
    // La cuenta usa el número de arriba (igual que "Mover este pago")
    const hoyDinero = Dinero.actual();
    $("e-dinero-hoy").innerHTML = `Dinero que tengo hoy: <strong>${hoyDinero < 0 ? "−" + dinero(-hoyDinero) : dinero(hoyDinero)}</strong> (el número de arriba)`;

    const resultados = this.ESCENARIOS.map(e => ({ ...e, monto: c[e.id], r: this.repartir(c[e.id], hoyDinero || 0, c.porcentajeColchon) }));
    const menos = resultados[0].r;
    $("e-aviso").hidden = menos.noCubreN1.length === 0;
    $("e-aviso").textContent = `En tu semana más baja no se cubre: ${menos.noCubreN1.join(", ")}`;
    $("e-rango").textContent = `Vencimientos del ${fechaCorta(menos.desde)} al ${fechaCorta(menos.hasta)}`;

    $("e-resultados").innerHTML = resultados.map(({ id, titulo, monto, r }) => `
      <section class="tarjeta escenario" data-escenario="${id}">
        <h2>${titulo}: ${dinero(monto)}${id === "esperado" && c.esperadoAuto ? ' <span class="opcional">(estimado)</span>' : ""}</h2>
        <p class="estado esc-cuenta">${escapar(r.cuenta)}</p>
        ${RentaUI.html(r.pr)}
        <ul class="escenario-lista">
          ${[1, 2].map(n => `
            <li class="nivel-titulo">Nivel ${n}${n === 1 ? " · no se atrasa" : " · se divide o se mueve"}</li>
            ${r.filas.filter(f => f.nivel === n).map(f => `
              <li class="esc-fila ${f.clase}">
                <div class="mov-info">
                  <div class="mov-tipo">${escapar(f.nombre)}${f.riesgo ? ' <span class="riesgo">riesgo alto</span>' : ""}</div>
                  <div class="mov-detalle">${f.fecha ? Jornadas.textoDia(f.fecha) + " · " : ""}${dinero(f.monto)}</div>
                  ${f.costo ? `<div class="esc-costo">${escapar(f.costo)}</div>` : ""}
                </div>
                <div class="esc-lado">
                  <span class="esc-estado">${escapar(f.estado)}</span>
                  ${f.nivel === 2 && Vencimientos.MOVIBLES.includes(f.id)
                    ? f.clase !== "paga"
                      ? `<button class="boton-chico" data-mover="${escapar(f.claveMov)}" data-escenario="${id}">Mover</button>`
                      : f.conCheque ? `<button class="enlace mover-igual" data-mover="${escapar(f.claveMov)}" data-escenario="${id}">Mover igual</button>` : ""
                    : ""}
                </div>
              </li>`).join("") || '<li class="vacio">Nada en estas fechas.</li>'}`).join("")}
        </ul>
        <div class="esc-resumen">
          ${r.falta > 0
            ? `<p class="mensaje-sobrante negativo">Falta ${dinero(r.falta)} para cubrir todo a tiempo</p>`
            : `<p class="mensaje-sobrante positivo">Sobran ${dinero(r.sobra)} (lo que queda libre en estos días)</p>`}
          ${r.seMueven.length ? `<p class="esc-mueven"><strong>Se mueve o se atrasa:</strong>
            ${r.seMueven.map(f => `${escapar(f.nombre)} (${dinero(f.monto - f.paga)})`).join(", ")}</p>` : ""}
          ${r.reparto.length ? `<p class="esc-extra-titulo"><strong>El extra va a:</strong></p>
            <ul class="resumen">${r.reparto.map(x => `<li><span>${escapar(x.nombre)}</span><span>${dinero(x.monto)}</span></li>`).join("")}</ul>` : ""}
        </div>
        <button class="boton-chico ver-plan" data-ver-plan="${id}">Ver cómo quedaría en el Plan de la semana</button>
      </section>`).join("");
    this._resultados = resultados;
  },

  guardarCampo(campo, entrada, min, max) {
    const g = Almacen.leerEscenarios() || {};
    const txt = entrada.value.trim();
    const v = Number(txt);
    if (txt === "") g[campo] = null; // vacío = valor por defecto
    else if (v >= min && v <= max) g[campo] = v;
    else return;
    Almacen.guardarEscenarios(g);
    this.mostrar();
  },

  verEnPlan(id) {
    const e = (this._resultados || []).find(x => x.id === id);
    if (!e) return;
    Plan.vistaPrevia = { monto: e.monto, nombre: e.titulo };
    $("pantalla-escenarios").hidden = true;
    Plan.abrir();
  },

  iniciar() {
    $("abrir-escenarios").addEventListener("click", () => this.abrir());
    $("volver-escenarios").addEventListener("click", () => this.cerrar());
    $("e-menos").addEventListener("input", e => this.guardarCampo("menos", e.target, 0, 100000));
    $("e-esperado").addEventListener("input", e => this.guardarCampo("esperado", e.target, 0, 100000));
    $("e-mas").addEventListener("input", e => this.guardarCampo("mas", e.target, 0, 100000));
    $("e-colchon").addEventListener("input", e => this.guardarCampo("porcentajeColchon", e.target, 0, 100));
    $("e-resultados").addEventListener("click", e => {
      const b = e.target.closest("[data-ver-plan]");
      if (b) this.verEnPlan(b.dataset.verPlan);
      const m = e.target.closest("[data-mover]");
      if (m) {
        // Mover abre con el cheque de este escenario, para que las dos pantallas hagan la misma cuenta
        const esc = (this._resultados || []).find(x => x.id === m.dataset.escenario);
        Mover.abrir(m.dataset.mover, "pantalla-escenarios", esc ? { monto: esc.monto, titulo: esc.titulo } : null);
      }
    });
    window.addEventListener("movimientos-cambiaron", () => this.mostrar());
  }
};

if (Datos.actual) Escenarios.iniciar();
