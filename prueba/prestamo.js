/*
 * ¿ME CONVIENE UN PRÉSTAMO? (Bloque 18)
 * SOLO SIMULA: no registra dinero, no cambia saldos ni agrega deudas.
 * Compara "Sin préstamo" y "Con préstamo" con la misma cuenta de proyeccion.js,
 * en el escenario elegido y en "Menos".
 */
const Prestamo = {
  ultimoEditado: "semanas", // si se escriben semanas se calcula el total, y al revés

  abrir() {
    this.origen = null;
    document.querySelectorAll("main.contenedor").forEach(x => { x.hidden = true; });
    $("pantalla-prestamo").hidden = false;
    if (!$("ps-fecha").value) $("ps-fecha").value = hoy();
    this.llenarPlaneados();
    window.scrollTo(0, 0);
    this.mostrarGuardadas();
  },

  cerrar() {
    $("pantalla-prestamo").hidden = true;
    $(this.origen || "pantalla-futuro").hidden = false;
    this.origen = null;
    window.dispatchEvent(new Event("movimientos-cambiaron"));
    window.scrollTo(0, 0);
  },

  llenarPlaneados() {
    const lista = Almacen.leerPlaneados().filter(g => !Planeados.comprado(g));
    $("ps-planeado").innerHTML = lista.length
      ? lista.map(g => `<option value="${g.id}">${escapar(g.nombre)} (${dinero(g.monto)})</option>`).join("")
      : `<option value="">No tienes gastos planeados</option>`;
    $("ps-campo-planeado").hidden = $("ps-para").value !== "planeado";
  },

  // Semanas ↔ total a devolver: si se llena uno se calcula el otro
  completar() {
    const pago = Number($("ps-pago").value);
    if (!(pago > 0)) return;
    if (this.ultimoEditado === "semanas") {
      const n = Number($("ps-semanas").value);
      if (n > 0) $("ps-total").value = redondear(pago * n).toFixed(2);
    } else {
      const total = Number($("ps-total").value);
      if (total > 0) $("ps-semanas").value = Math.ceil(redondear(total / pago));
    }
  },

  tipo() { return $("ps-tipo").value; },

  cambiarTipo() {
    const libre = this.tipo() === "libre";
    document.querySelectorAll(".ps-solo-fijo").forEach(x => { x.hidden = libre; });
    document.querySelectorAll(".ps-solo-libre").forEach(x => { x.hidden = !libre; });
    $("ps-resultado").hidden = true;
    $("ps-error").textContent = "";
  },

  leer() {
    const n = x => Number($(x).value);
    if (this.tipo() === "libre") {
      const s = { libre: true, monto: n("ps-monto"), fecha: $("ps-fecha").value, para: $("ps-para").value, planeadoId: $("ps-planeado").value,
                  quien: $("ps-quien").value.trim(), dia: "viernes", pago: 0, semanas: 0, total: n("ps-monto") };
      if (!(s.monto > 0)) return { error: "Escribe cuánto recibirías." };
      if (!s.fecha) return { error: "Elige la fecha en que lo recibirías." };
      if (s.fecha < hoy()) return { error: "La fecha en que lo recibirías tiene que ser hoy o después." };
      if (s.para === "planeado" && !s.planeadoId) return { error: "No tienes gastos planeados para elegir." };
      return s;
    }
    const datos = { monto: n("ps-monto"), pago: n("ps-pago"), semanas: Math.round(n("ps-semanas")), total: redondear(n("ps-total")),
                    dia: $("ps-dia").value, fecha: $("ps-fecha").value, para: $("ps-para").value, planeadoId: $("ps-planeado").value };
    if (!(datos.monto > 0)) return { error: "Escribe cuánto recibirías." };
    if (!(datos.pago > 0)) return { error: "Escribe el pago por semana." };
    if (!(datos.semanas > 0) || !(datos.total > 0)) return { error: "Escribe el número de semanas o el total a devolver." };
    if (!datos.fecha) return { error: "Elige la fecha en que lo recibirías." };
    if (datos.fecha < hoy()) return { error: "La fecha en que lo recibirías tiene que ser hoy o después." };
    if (datos.para === "planeado" && !datos.planeadoId) return { error: "No tienes gastos planeados para elegir." };
    return datos;
  },

  // Líneas simuladas del préstamo (y, si es para renta o un gasto planeado, ese uso)
  extras(s) {
    const lineas = [{ fecha: s.fecha, monto: s.monto, nombre: "Préstamo: lo recibes" }];
    const ajustes = {};
    // Renta atrasada: el dinero sale ese día a la renta y el atraso baja
    if (s.para === "renta") {
      lineas.push({ fecha: s.fecha, monto: -s.monto, nombre: "Préstamo: pago a renta atrasada" });
      ajustes.deudaRenta = -s.monto;
    }
    if (s.para === "planeado") {
      const g = Almacen.leerPlaneados().find(x => x.id === s.planeadoId);
      // Si el gasto planeado ya tiene fecha, ya está en la cuenta: el préstamo solo trae el dinero
      if (g && !(g.elegido && g.elegido.length)) lineas.push({ fecha: s.fecha, monto: -Planeados.pendiente(g), nombre: `Préstamo: ${g.nombre}` });
    }
    // Sin intereses y "para otro": se cuenta que lo gastas ese día (si no, no haría falta pedirlo)
    if (s.libre && s.para === "otro") lineas.push({ fecha: s.fecha, monto: -s.monto, nombre: "Préstamo: lo gastas en lo que necesitas" });
    if (s.libre) return { lineas, ajustes, ultimo: s.fecha };
    // Pagos: el día de la semana elegido, empezando después de recibirlo; el último ajusta al total
    let diaN = Jornadas.DIAS.indexOf(s.dia);
    if (diaN < 0) diaN = 5; // día no válido: viernes (si no, el ciclo de abajo no terminaba)
    let f = Jornadas.sumarDias(s.fecha, 1);
    while (Jornadas.aFecha(f).getDay() !== diaN) f = Jornadas.sumarDias(f, 1);
    for (let i = 0; i < s.semanas; i++) {
      const monto = i === s.semanas - 1 ? redondear(s.total - s.pago * (s.semanas - 1)) : s.pago;
      if (monto > 0) lineas.push({ fecha: f, monto: -monto, nombre: `Préstamo: pago ${i + 1} de ${s.semanas}` });
      f = Jornadas.sumarDias(f, 7);
    }
    return { lineas, ajustes, ultimo: lineas[lineas.length - 1].fecha };
  },

  // Semanas (lunes a domingo) en que el saldo baja de cero
  semanasEnRojo(pr) {
    const rojas = new Set();
    Object.keys(pr.porDia).forEach(f => { if (pr.porDia[f].saldoFin < -0.005) rojas.add(Plan.claveSemana(Jornadas.aFecha(f))); });
    return rojas.size;
  },

  bajo(pr, dias = 30) {
    const fechas = Object.keys(pr.porDia).sort().slice(0, dias);
    return fechas.reduce((m, f) => !m || pr.porDia[f].saldoFin < m.saldo ? { fecha: f, saldo: pr.porDia[f].saldoFin } : m, null);
  },

  comparar(s, escenarioId) {
    const cheque = Escenarios.config()[escenarioId];
    const ex = this.extras(s);
    const horizonte = Math.max(30, Math.round((Jornadas.aFecha(ex.ultimo) - Jornadas.aFecha(hoy())) / 86400000) + 8);
    const sin = Proyeccion.calcular({ chequeEscenario: cheque, horizonte });
    const con = Proyeccion.calcular({ chequeEscenario: cheque, horizonte, extras: ex.lineas });
    const largoSin = Proyeccion.calcular({ chequeEscenario: cheque, horizonte: 730 });
    const largoCon = Proyeccion.calcular({ chequeEscenario: cheque, horizonte: 730, extras: ex.lineas });
    return {
      sin: { bajo: this.bajo(sin), rojo: this.semanasEnRojo(sin), deudas: Proyeccion.planDeudas({ pr: largoSin }) },
      con: { bajo: this.bajo(con), rojo: this.semanasEnRojo(con), deudas: Proyeccion.planDeudas({ pr: largoCon, deudaAjustes: ex.ajustes }) }
    };
  },

  dias(a, b) {
    if (!a || !b || a === "ya" || b === "ya") return null;
    return Math.round((Jornadas.aFecha(a) - Jornadas.aFecha(b)) / 86400000);
  },

  // ---------- Sin intereses: ¿cuándo lo podría pagar? ----------
  // Con la misma cuenta: un pago cabe si, desde ese día, ningún día queda peor que sin el préstamo
  // (sin dejar días nuevos bajo cero ni agregar a lo que ya faltaba).
  calcularLibre(s) {
    const cheque = Escenarios.config()[Futuro.estado().escenario];
    const H = 365;
    const sin = Proyeccion.calcular({ chequeEscenario: cheque, horizonte: H });
    const ex = this.extras(s);
    const con = Proyeccion.calcular({ chequeEscenario: cheque, horizonte: H, extras: ex.lineas });
    const fechas = Object.keys(con.porDia).sort();
    // Margen de cada día: cuánto se puede pagar hasta ese día sin quedar peor que sin el préstamo
    const margen = fechas.map(f => con.porDia[f].saldoFin - Math.min(0, sin.porDia[f].saldoFin));
    const sufMin = [];
    for (let i = fechas.length - 1, m = Infinity; i >= 0; i--) { m = Math.min(m, margen[i]); sufMin[i] = m; }
    const cheques = con.cheques.filter(c => c > s.fecha);
    const completo = cheques.find(c => sufMin[fechas.indexOf(c)] >= s.monto - 0.005) || null;
    // En partes: el pago por semana más alto (de $5 en $5) que cabe desde el primer cheque después de recibirlo
    const cabe = X => {
      const pagos = {};
      let resta = s.monto;
      for (const c of cheques) { if (resta <= 0.005) break; const m = Math.min(X, resta); pagos[c] = m; resta = redondear(resta - m); }
      if (resta > 0.005) return null;
      let acumulado = 0;
      for (let i = 0; i < fechas.length; i++) {
        acumulado += pagos[fechas[i]] || 0;
        if (fechas[i] >= cheques[0] && margen[i] - acumulado < -0.005) return null;
      }
      const lista = Object.keys(pagos);
      return { X, desde: lista[0], hasta: lista[lista.length - 1], pagos: lista.length };
    };
    let partes = null;
    for (let X = Math.floor((s.monto - 0.01) / 5) * 5; X >= 5 && !partes; X -= 5) partes = cabe(X);
    const deudas = { sin: Proyeccion.planDeudas({ pr: Proyeccion.calcular({ chequeEscenario: cheque, horizonte: 730 }) }),
                     con: Proyeccion.planDeudas({ pr: Proyeccion.calcular({ chequeEscenario: cheque, horizonte: 730, extras: ex.lineas }), deudaAjustes: ex.ajustes }) };
    return { completo, partes, deudas };
  },

  simularLibre(s) {
    const r = this.calcularLibre(s);
    this._libre = { s, r };
    const f = v => v === "ya" ? "ya está" : v ? Futuro.diaCorto(v) : "más de 2 años";
    $("ps-resultado").hidden = false;
    $("ps-resultado").innerHTML = `
      <p class="fu-frase positivo">Sin intereses: no te cuesta nada extra.</p>
      <ul class="resumen">
        <li><span>Lo podrías pagar completo</span><span><strong>${r.completo ? Jornadas.textoDia(r.completo) : "no en un año"}</strong></span></li>
        <li><span>O en partes</span><span><strong>${r.partes ? `${dinero(r.partes.X)} por semana, del ${Futuro.diaCorto(r.partes.desde)} al ${Futuro.diaCorto(r.partes.hasta)}` : "no alcanza en un año"}</strong></span></li>
        ${s.para === "renta" ? `<li><span>Renta atrasada en cero</span><span>${f(r.deudas.sin.rentaCero)} → <strong>${f(r.deudas.con.rentaCero)}</strong></span></li>` : ""}
      </ul>
      <p class="estado">Las fechas son las primeras en que puedes pagar sin quedarte más corto que si no lo pidieras (sin días nuevos bajo cero).
        Solo es una simulación: no se registró nada.</p>
      ${r.completo || r.partes ? `
        <div class="campo"><label for="ps-acepto-como">Si lo aceptas, ¿cómo lo pagarías?</label>
          <select id="ps-acepto-como">
            ${r.completo ? `<option value="completo">Completo el ${Futuro.diaCorto(r.completo)}</option>` : ""}
            ${r.partes ? `<option value="partes">${dinero(r.partes.X)} por semana (${r.partes.pagos} pagos)</option>` : ""}
          </select></div>
        <button id="ps-acepte" class="boton-chico lleno">Lo acepté: agregarlo a mis deudas</button>` : ""}
      <p class="ayuda">Es una estimación. Acuerda bien con quien te presta cuándo y cómo se lo devuelves.</p>`;
  },

  aceptarLibre() {
    const { s, r } = this._libre || {};
    if (!s) return;
    const como = $("ps-acepto-como").value;
    const d = Almacen.guardarDeudaPropia({ nombre: s.quien ? `Préstamo de ${s.quien}` : "Préstamo sin intereses", monto: s.monto,
                                           prioridad: 50, nota: "Sin intereses, lo pago cuando pueda" });
    Almacen.guardarPlanDeuda(como === "completo"
      ? { deudaId: d.id, monto: s.monto, frecuencia: "una", desde: r.completo, hasta: r.completo }
      : { deudaId: d.id, monto: r.partes.X, frecuencia: "semanal", desde: r.partes.desde, hasta: r.partes.hasta });
    Datos.recargar();
    window.dispatchEvent(new Event("movimientos-cambiaron"));
    $("ps-resultado").innerHTML += `<p class="mensaje-sobrante positivo">Agregado a Mis deudas con su plan de pagos.
      Cuando recibas el dinero, regístralo en "Me pagaron" → "Otro ingreso".</p>`;
    $("ps-acepte").disabled = true;
  },

  simular() {
    const s = this.leer();
    if (s.error) { $("ps-error").textContent = s.error; $("ps-resultado").hidden = true; return; }
    $("ps-error").textContent = "";
    if (s.libre) return this.simularLibre(s);
    const est = Futuro.estado();
    const elegido = this.comparar(s, est.escenario);
    const menos = est.escenario === "menos" ? elegido : this.comparar(s, "menos");
    const costo = redondear(s.total - s.monto);
    const pct = s.monto > 0 ? costo / s.monto * 100 : 0;
    const sobrante = Plan.calcular().sobrante;

    // Frase final
    const rSin = elegido.sin.deudas.rentaCero, rCon = elegido.con.deudas.rentaCero;
    const adelanta = (rCon === "ya" && rSin !== "ya") || (rCon && !rSin) || (this.dias(rSin, rCon) || 0) > 0;
    const diasAdelanta = rCon === "ya" ? "ya queda en cero" : this.dias(rSin, rCon);
    const rojoNuevo = menos.con.rojo > menos.sin.rojo;
    const f = v => v === "ya" ? "ya está" : v ? Futuro.diaCorto(v) : "más de 2 años";
    const efectoFechas = `Renta atrasada en cero: ${f(rSin)} → ${f(rCon)}.`;
    let frase, razon, clase;
    if (pct > 30) { frase = "No te ayuda"; clase = "negativo"; razon = `Cuesta ${dinero(costo)}, el ${pct.toFixed(0)}% de lo que recibes (más de 30%). ${efectoFechas}`; }
    else if (!adelanta) { frase = "No te ayuda"; clase = "negativo"; razon = `No adelanta la renta atrasada en cero. ${efectoFechas}`; }
    else if (rojoNuevo) { frase = "Depende"; clase = "aviso"; razon = `Adelanta la renta en cero${typeof diasAdelanta === "number" ? ` ${diasAdelanta} días` : ""}, pero si cobras menos deja ${menos.con.rojo - menos.sin.rojo} ${menos.con.rojo - menos.sin.rojo === 1 ? "semana" : "semanas"} más en rojo. ${efectoFechas}`; }
    else { frase = "Te ayuda"; clase = "positivo"; razon = `Adelanta la renta en cero${typeof diasAdelanta === "number" ? ` ${diasAdelanta} días` : ""} y no deja semanas nuevas en rojo. ${efectoFechas}`; }

    const fila = (t, a, b) => `<li><span>${t}</span><span>${a}</span><span><strong>${b}</strong></span></li>`;
    const titulo = Futuro.ESCENARIOS.find(e => e.id === est.escenario).titulo;
    this._ultimo = { entradas: s, costo, pct, frase, razon, rentaSin: rSin, rentaCon: rCon, rojoSin: menos.sin.rojo, rojoCon: menos.con.rojo };
    $("ps-resultado").hidden = false;
    $("ps-resultado").innerHTML = `
      <p class="fu-frase ${clase === "positivo" ? "positivo" : clase === "negativo" ? "negativo" : "ps-depende"}">${frase}</p>
      <p class="ps-razon">${escapar(razon)}</p>
      <ul class="resumen ps-tabla">
        <li class="ps-cabeza"><span></span><span>Sin préstamo</span><span>Con préstamo</span></li>
        ${fila("Costo del préstamo", "—", `${dinero(costo)} (${pct.toFixed(0)}%)`)}
        ${fila("Sobrante semanal", Futuro.plata(sobrante), `${Futuro.plata(sobrante - s.pago)}`)}
        ${fila(`Saldo más bajo del mes (${titulo})`, `${Futuro.plata(elegido.sin.bajo.saldo)} · ${Futuro.diaCorto(elegido.sin.bajo.fecha)}`, `${Futuro.plata(elegido.con.bajo.saldo)} · ${Futuro.diaCorto(elegido.con.bajo.fecha)}`)}
        ${fila("Renta atrasada en cero", f(rSin), f(rCon))}
        ${fila(`Colchón en ${dinero(Plan.metaColchon())}`, f(elegido.sin.deudas.colchonLleno), f(elegido.con.deudas.colchonLleno))}
        ${fila("Préstamo del amigo en cero", f(elegido.sin.deudas.amigoCero), f(elegido.con.deudas.amigoCero))}
        ${fila('Semanas en rojo si cobras "Menos"', menos.sin.rojo, menos.con.rojo)}
      </ul>
      <p class="estado">Escenario: ${titulo}. Total a devolver ${dinero(s.total)} en ${s.semanas} pagos (${s.dia}). Solo es una simulación: no se registró nada.</p>
      <p class="ayuda">Es una estimación. Revisa bien las condiciones y qué pasa si te atrasas antes de aceptar.</p>
      <button id="ps-guardar" class="boton-chico">Guardar simulación</button>`;
  },

  guardar() {
    if (!this._ultimo) return;
    const lista = Almacen.leer("simulaciones") || [];
    lista.push({ id: Almacen.nuevoId(), creado: Almacen.ahora(), ...this._ultimo });
    Almacen.guardar("simulaciones", lista);
    Pantalla.aviso("Simulación guardada");
    this.mostrarGuardadas();
  },

  async borrar(id) {
    if (!(await preguntar("¿Borrar esta simulación?", "Sí, borrar"))) return;
    Almacen.guardar("simulaciones", (Almacen.leer("simulaciones") || []).map(x => x.id === id ? { ...x, borrado: true, modificado: Almacen.ahora() } : x));
    this.mostrarGuardadas();
  },

  mostrarGuardadas() {
    const lista = (Almacen.leer("simulaciones") || []).filter(x => !x.borrado).slice().reverse();
    const f = v => v === "ya" ? "ya" : v ? Futuro.diaCorto(v) : "+2 años";
    $("ps-guardadas").innerHTML = lista.length === 0 ? `<p class="vacio">No has guardado simulaciones.</p>` : lista.map(x => `
      <li>
        <div class="mov-info">
          <div class="mov-tipo">${x.frase}: recibes ${dinero(x.entradas.monto)}, devuelves ${dinero(x.entradas.total)}</div>
          <div class="mov-detalle">Costo ${dinero(x.costo)} · renta en cero ${f(x.rentaSin)} → ${f(x.rentaCon)} · semanas en rojo ${x.rojoSin} → ${x.rojoCon}</div>
          <div class="mov-detalle">Guardada el ${fechaCorta(Resumen.aClave(new Date(x.creado)))}</div>
        </div>
        <button class="borrar" data-ps-borrar="${x.id}" aria-label="Borrar">✕</button>
      </li>`).join("");
  },

  iniciar() {
    $("abrir-prestamo").addEventListener("click", () => this.abrir());
    $("volver-prestamo").addEventListener("click", () => this.cerrar());
    $("ps-semanas").addEventListener("input", () => { this.ultimoEditado = "semanas"; this.completar(); });
    $("ps-total").addEventListener("input", () => { this.ultimoEditado = "total"; this.completar(); });
    $("ps-pago").addEventListener("input", () => this.completar());
    $("ps-para").addEventListener("change", () => this.llenarPlaneados());
    $("ps-simular").addEventListener("click", () => this.simular());
    $("ps-tipo").addEventListener("change", () => this.cambiarTipo());
    $("pantalla-prestamo").addEventListener("click", e => {
      if (e.target.closest("#ps-acepte")) this.aceptarLibre();
      if (e.target.closest("#ps-guardar")) this.guardar();
      const b = e.target.closest("[data-ps-borrar]"); if (b) this.borrar(b.dataset.psBorrar);
    });
  }
};

if (Datos.actual) Prestamo.iniciar();
