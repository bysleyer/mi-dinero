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
    nivel1: { pagos: ["renta", "prestamoSemanal", "transporte", "comida"], comidaMinima: 150 },
    nivel2: { telefono: { sePuedeDividir: true, pagos: 2 }, deudaInternet: { riesgo: "alto" } },
    recargos: { renta: 50, internetPorFactura: 10, luz: { monto: null }, telefono: { monto: null } },
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

  // ---------- Montos de los escenarios (editables, guardados) ----------
  config() {
    const g = Almacen.leerEscenarios() || {};
    const cobro = Jornadas.periodoProximoCheque().cobro;
    return {
      menos: g.menos ?? Datos.actual.ingresos.semanaMala.netoMinimo ?? 450,
      esperado: g.esperado ?? redondear(Alcanza.chequeEsperado(cobro).monto),
      esperadoAuto: g.esperado == null,
      mas: g.mas ?? 1100,
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
    if (id === "renta") return `Recargo de ${dinero(rec.renta)} y acción legal el día ${Calendario.diaDelMes("accionLegal", 15)}`;
    if (id === "luz") return `Cargo por atraso (${this.textoRecargo(rec.luz)})`;
    if (id === "telefono") return `Cargo por atraso (${this.textoRecargo(rec.telefono)})`;
    if (id === "internet") return `Recargo de ${dinero(rec.internetPorFactura)} por factura vencida`;
    if (id === "deudaInternet") return `Recargo de ${dinero(rec.internetPorFactura)} por factura vencida · RIESGO ALTO: ya hubo suspensión`;
    return "";
  },

  // ---------- Lo que hay que pagar ----------
  pendientes() {
    const hoyClave = hoy();
    const hasta = Jornadas.sumarDias(hoyClave, this.DIAS - 1);
    const items = Vencimientos.entre(hoyClave, hasta);
    const r = this.reglas();

    // Nivel 1
    const n1 = [];
    const rentaSemana = Plan.calcular().semanalRenta;
    const prestamo = items.find(i => i.id === "prestamo" && !i.partes[0].pagado);
    const transporte = Vencimientos.gasto("transporte");
    const comida = Vencimientos.gasto("comida");
    const porId = {
      renta: rentaSemana > 0 && { id: "renta", nombre: "Renta (lo de esta semana)", monto: rentaSemana },
      prestamoSemanal: prestamo && { id: "prestamoSemanal", nombre: "Préstamo semanal", monto: prestamo.partes[0].monto, fecha: prestamo.fecha },
      transporte: transporte && {
        id: "transporte", monto: transporte.porDia * Jornadas.config().diasDeTrabajoPorSemana,
        nombre: `Transporte (${dinero(transporte.porDia)} × ${Jornadas.config().diasDeTrabajoPorSemana} días)`
      },
      comida: comida && { id: "comida", nombre: "Comida", monto: comida.monto, minimo: r.nivel1.comidaMinima }
    };
    r.nivel1.pagos.forEach(id => { if (porId[id]) n1.push(porId[id]); });

    // Nivel 2: facturas y atrasos de internet en la ventana, por fecha
    const n2 = items
      .filter(i => ["luz", "internet", "telefono"].includes(i.id) || i.inmediato)
      .map(i => {
        const monto = i.partes.filter(p => !p.pagado).reduce((s, p) => s + p.monto, 0);
        const reglas = r.nivel2[i.id] || {};
        return { id: i.id, nombre: i.nombre, monto, fecha: i.fecha, reglas, riesgo: reglas.riesgo };
      })
      .filter(i => i.monto > 0)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    return { n1, n2, desde: hoyClave, hasta };
  },

  // ---------- Repartir un escenario ----------
  repartir(ingreso, dineroHoy, porcentajeColchon) {
    const { n1, n2, desde, hasta } = this.pendientes();
    const siguienteCobro = Jornadas.sumarDias(Jornadas.periodoProximoCheque().cobro, 7);
    const disponible = redondear(dineroHoy + ingreso);
    let M = disponible;
    const filas = [];
    const noCubreN1 = [];

    // Nivel 1 en orden (la renta va antes que el préstamo: si falta para la renta, el préstamo se salta)
    let faltoParaRenta = false;
    n1.forEach(p => {
      let paga = 0, estado, costo = "";
      if (p.id === "comida") {
        if (M >= p.monto) { paga = p.monto; estado = "Se paga"; }
        else if (M >= p.minimo) { paga = p.minimo; estado = `Se paga, bajada a ${dinero(p.minimo)}`; }
        else { paga = M; estado = paga > 0 ? `Parcial (${dinero(paga)})` : "Se atrasa"; }
      } else {
        paga = Math.min(M, p.monto);
        estado = paga >= p.monto - 0.005 ? "Se paga" : paga > 0 ? `Parcial (${dinero(paga)})` : "Se atrasa";
        if (p.id === "renta" && paga < p.monto - 0.005) { faltoParaRenta = true; costo = this.costo("renta"); }
        if (p.id === "prestamoSemanal" && paga < p.monto - 0.005 && faltoParaRenta) {
          costo = "Se salta para completar la renta (única excepción). Avisa antes a quien te prestó.";
        }
      }
      M = redondear(M - paga);
      const completo = estado.startsWith("Se paga");
      if (!completo) noCubreN1.push(p.nombre);
      filas.push({ nivel: 1, ...p, paga, estado, costo, clase: completo ? (estado === "Se paga" ? "paga" : "baja") : "falta" });
    });

    // Nivel 2 por fecha más cercana
    n2.forEach(p => {
      let paga = 0, estado, costo = "", clase;
      const puedeEsperar = p.fecha >= siguienteCobro;
      const partes = p.reglas.sePuedeDividir ? (p.reglas.pagos || 2) : 1;
      if (M >= p.monto - 0.005) {
        paga = p.monto; estado = "Se paga"; clase = "paga";
      } else if (partes > 1 && M >= p.monto / partes) {
        paga = redondear(p.monto / partes);
        estado = "Se mueve o se divide";
        costo = `Paga ${dinero(paga)} ahora y ${dinero(p.monto - paga)} después. Pide la fecha nueva por escrito.`;
        clase = "mueve";
      } else if (puedeEsperar) {
        estado = "Se mueve o se divide";
        costo = `Vence después de tu siguiente cheque (${Jornadas.textoDia(siguienteCobro).toLowerCase()}): se puede pagar con ese, sin recargo.`;
        clase = "mueve";
        p.conSiguienteCheque = true;
      } else if (M > 0 && !p.reglas.sePuedeMover) {
        paga = M; estado = `Parcial (${dinero(paga)})`; costo = this.costo(p.id); clase = "falta";
      } else {
        estado = p.riesgo ? "Se atrasa" : "Se mueve o se divide";
        costo = this.costo(p.id);
        clase = p.riesgo ? "falta" : "mueve";
      }
      M = redondear(M - paga);
      filas.push({ nivel: 2, ...p, paga, estado, costo, clase });
    });

    // Lo que vence después del siguiente cheque no cuenta como faltante: se paga con ese cheque
    const necesario = redondear([...n1, ...n2].filter(p => !p.conSiguienteCheque).reduce((s, p) => s + p.monto, 0));
    const falta = redondear(Math.max(0, necesario - disponible));
    const seMueven = filas.filter(f => f.paga < f.monto - 0.005);
    // El extra (semana buena) solo se reparte cuando no falta nada
    const reparto = M > 0 && falta === 0 ? this.repartirExtra(M, porcentajeColchon, filas) : [];
    return { ingreso, disponible, filas, sobra: M, falta, seMueven, noCubreN1, reparto, desde, hasta };
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
  abrir() {
    $("pantalla-alcanza").hidden = true;
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
    $("pantalla-alcanza").hidden = false;
    window.scrollTo(0, 0);
    Alcanza.mostrar();
  },

  ESCENARIOS: [
    { id: "menos", titulo: "Menos" },
    { id: "esperado", titulo: "Lo esperado" },
    { id: "mas", titulo: "Más" }
  ],

  mostrar() {
    if ($("pantalla-escenarios").hidden) return;
    const c = this.config();
    const hoyDinero = this.dineroHoy();
    $("e-dinero-hoy").innerHTML = `Dinero que tengo hoy: <strong>${dinero(hoyDinero)}</strong>` +
      (Dinero.manualVigente() != null ? " (escrito a mano en ¿Me alcanza?)" : " (calculado de tus movimientos)");

    const resultados = this.ESCENARIOS.map(e => ({ ...e, monto: c[e.id], r: this.repartir(c[e.id], hoyDinero || 0, c.porcentajeColchon) }));
    const menos = resultados[0].r;
    $("e-aviso").hidden = menos.noCubreN1.length === 0;
    $("e-aviso").textContent = `En tu semana más baja no se cubre: ${menos.noCubreN1.join(", ")}`;
    $("e-rango").textContent = `Vencimientos del ${fechaCorta(menos.desde)} al ${fechaCorta(menos.hasta)}`;

    $("e-resultados").innerHTML = resultados.map(({ id, titulo, monto, r }) => `
      <section class="tarjeta escenario" data-escenario="${id}">
        <h2>${titulo}: ${dinero(monto)}${id === "esperado" && c.esperadoAuto ? ' <span class="opcional">(estimado)</span>' : ""}</h2>
        <p class="estado">Dinero disponible: ${dinero(r.disponible)}</p>
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
                <span class="esc-estado">${escapar(f.estado)}</span>
              </li>`).join("") || '<li class="vacio">Nada en estas fechas.</li>'}`).join("")}
        </ul>
        <div class="esc-resumen">
          ${r.falta > 0
            ? `<p class="mensaje-sobrante negativo">Falta ${dinero(r.falta)} para cubrir todo a tiempo</p>
               ${r.sobra > 0 ? `<p class="esc-mueven">Te quedan ${dinero(r.sobra)}: úsalos para lo que se movió.</p>` : ""}`
            : `<p class="mensaje-sobrante positivo">Sobran ${dinero(r.sobra)}</p>`}
          ${r.seMueven.length ? `<p class="esc-mueven"><strong>Se mueve o se atrasa:</strong>
            ${r.seMueven.map(f => `${escapar(f.nombre)} (${dinero(f.monto - f.paga)}${f.conSiguienteCheque ? ", con el siguiente cheque" : ""})`).join(", ")}</p>` : ""}
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
    });
    window.addEventListener("movimientos-cambiaron", () => this.mostrar());
  }
};

if (Datos.actual) Escenarios.iniciar();
