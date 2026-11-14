/*
 * GASTOS PLANEADOS (Bloque 15)
 * Lista, formulario y pantalla "¿Cuándo lo compro?".
 * Cada día se evalúa con la misma cuenta de proyeccion.js: el gasto planeado se resta ese día
 * y se mira si algún día queda bajo cero y si se corren las fechas de las deudas.
 * Elegir una fecha guarda el plan; el gasto entra en proyeccion.js (vía Próximos pagos) desde ese momento.
 * "Ya lo compré" registra un gasto con el formulario de "Gasté" y deja de contarse como planeado.
 */
const Planeados = {
  CATEGORIA_FIESTAS: "Navidad / Fiestas",
  actual: null,   // id del gasto planeado abierto en "¿Cuándo lo compro?"
  dia: null,      // día tocado
  partes: null,   // partes en edición [{ fecha, monto }]
  editando: null, // id en el formulario

  // ---------- Comprado (sale de los gastos registrados, para no duplicar) ----------
  parteComprada(g, i) {
    return Almacen.leerMovimientos().some(m => m.planeadoId === g.id && (m.planeadoParte === "todo" || m.planeadoParte === i));
  },

  comprado(g) {
    if (g.elegido && g.elegido.length) return g.elegido.every((_, i) => this.parteComprada(g, i));
    return Almacen.leerMovimientos().some(m => m.planeadoId === g.id);
  },

  pendiente(g) {
    if (g.elegido && g.elegido.length) return redondear(g.elegido.reduce((s, p, i) => s + (this.parteComprada(g, i) ? 0 : p.monto), 0));
    return g.monto;
  },

  estado(g) {
    if (this.comprado(g)) return { texto: "Comprado", clase: "comprado" };
    if (g.elegido && g.elegido.length) return { texto: "Con fecha elegida", clase: "elegido" };
    return { texto: "Falta elegir cuándo comprarlo", clase: "sin" };
  },

  sinFecha() {
    return Almacen.leerPlaneados().filter(g => !this.comprado(g) && !(g.elegido && g.elegido.length)).length;
  },

  // ---------- El motor: misma cuenta de proyeccion.js ----------
  // extra: { proteger, comidaExtrema, excluir } para medir el efecto de una opción sin aplicarla
  motor(g, extra = {}) {
    const escenario = Futuro.estado().escenario;
    const cheque = Escenarios.config()[escenario];
    // ¿Y si gasto…? (y la vista "¿Se puede comprar?"): mira 3 meses, igual que lo libre del Plan
    // Siempre 3 meses (o hasta la fecha límite y un mes más): antes un gasto con fecha límite se medía solo 30 días
    // y podía salir "No afecta nada" aunque dejara corta la renta del mes siguiente.
    const hastaLimite = g.fechaLimite ? Math.round((Jornadas.aFecha(g.fechaLimite) - Jornadas.aFecha(hoy())) / 86400000) + 35 : 0;
    const op = { chequeEscenario: cheque, excluirPlaneado: g.id, horizonte: Math.max(92, hastaLimite), ...extra };
    const pr = Proyeccion.calcular(op);
    const prLargo = Proyeccion.calcular({ ...op, horizonte: 730 });
    return { escenario, op, pr, prLargo, fechas: Object.keys(pr.porDia).sort(), _con: {} };
  },

  // ---------- Efecto del gasto: la cuenta SIN el gasto contra la cuenta CON el gasto ----------
  // Cambios de menos de $1 no cuentan (redondeo).
  TOLERANCIA: 1,
  NIVEL1: ["renta", "prestamo", "comida", "transporte"],

  // La proyección (proyeccion.js) con estos gastos puestos en sus días
  prCon(m, ajustes) {
    if (!ajustes.length) return m.pr;
    const clave = JSON.stringify(ajustes);
    if (!m._con[clave]) m._con[clave] = Proyeccion.calcular({ ...m.op,
      extras: ajustes.map(a => ({ fecha: a.fecha, monto: -a.monto, nombre: "Gasto planeado (prueba)" })) });
    return m._con[clave];
  },

  falta(pr, f) { return Math.max(0, -pr.porDia[f].saldoFin); },

  // Hueco que ya existe SIN el gasto: el día más bajo bajo cero y el pago que no se cubre
  hueco(m) {
    const pr = m.pr;
    let peor = null;
    m.fechas.forEach(f => { if (pr.porDia[f].saldoFin < -0.005 && (!peor || pr.porDia[f].saldoFin < pr.porDia[peor].saldoFin)) peor = f; });
    if (!peor) return null;
    // Lo que de verdad no alcanza ese día (y si la renta sí se cubre)
    const q = Proyeccion.quienFalta(pr, peor);
    const pago = { nombre: Proyeccion.lista(q.cortos) + (q.rentaCubierta ? " (la renta sí se cubre)" : "") };
    return { fecha: peor, falta: redondear(-pr.porDia[peor].saldoFin), pago: pago ? pago.nombre : "tus pagos" };
  },

  // Cuánto cabe ese día: lo más que se puede gastar sin dejar el saldo bajo cero ningún día después
  // (así tampoco queda sin cubrir ningún pago de Nivel 1)
  caben(m, dia, otros = []) {
    return Math.max(0, Math.floor(this.margen(m, dia, otros) * 100) / 100);
  },

  // Saldo más bajo de ese día en adelante: si es negativo, es lo que ya falta (ej.: la renta corta)
  margen(m, dia, otros = []) {
    if (!m.pr.porDia[dia]) return 0;
    let min = Infinity;
    m.fechas.filter(f => f >= dia).forEach(f => { min = Math.min(min, this.saldo(m, f, otros)); });
    return min;
  },

  textoCabe(m, dia) {
    const mg = this.margen(m, dia);
    return mg >= 0.005 ? `cabe ${Math.floor(mg)}` : mg < -0.005 ? `falta ${Math.ceil(-mg)}` : "cabe 0";
  },

  // Monto que se evalúa en el calendario: una parte si se está comprando en partes
  montoCalendario(g) {
    return this.partes && this.partes.length ? Math.max(...this.partes.map(p => p.monto)) : g.monto;
  },

  saldo(m, f, ajustes) {
    return m.pr.porDia[f].saldoFin - ajustes.reduce((s, a) => s + (a.fecha <= f ? a.monto : 0), 0);
  },

  minimo(pr) {
    let r = null;
    Object.keys(pr.porDia).sort().forEach(f => { const s = pr.porDia[f].saldoFin; if (!r || s < r.saldo) r = { fecha: f, saldo: redondear(s) }; });
    return r;
  },

  diasEntre(a, b) {
    if (a === "ya" && b === "ya") return 0;
    if (!a) return 0;                // ni sin el gasto se alcanza: no cambia
    if (a && !b) return Infinity;    // con el gasto ya no se alcanza en 2 años
    if (a === "ya" || b === "ya") return 0;
    return Math.round((Jornadas.aFecha(b) - Jornadas.aFecha(a)) / 86400000);
  },

  costo(l) {
    if (l.id === "renta") return Escenarios.costo("renta");
    if (l.id === "prestamo") return "Avisa antes a quien te prestó";
    if (["luz", "telefono", "internet", "deudaInternet"].includes(l.id)) return Escenarios.costo(l.id);
    if (l.inmediato) return Escenarios.costo("deudaInternet");
    return "";
  },

  // Efecto de gastar "monto" el día "dia" (con otras partes ya puestas en "otros").
  // Mide la DIFERENCIA entre la cuenta sin el gasto y con el gasto: el hueco que ya existía no se le culpa.
  evaluar(m, dia, monto, otros = []) {
    if (!m.pr.porDia[dia]) return { color: "gris", fuera: true };
    const con = [...otros, { fecha: dia, monto }];
    const prSin = this.prCon(m, otros), prCon = this.prCon(m, con);
    let agrega = 0, diaAgrega = null, nivel1Nuevo = false;
    const cambian = [];
    m.fechas.forEach(f => {
      const f0 = this.falta(prSin, f), f1 = this.falta(prCon, f);
      const d = redondear(f1 - f0);
      if (d > agrega + 0.005) { agrega = d; diaAgrega = f; }
      prCon.porDia[f].lineas.forEach(l => {
        if (l.monto >= 0 || l.planeado || l.tipo === "simulado") return;
        const l0 = prSin.porDia[f].lineas.find(x => x.id === l.id && x.nombre === l.nombre);
        const antes = l0 ? l0.saldo : 0;
        // Pago que pasa a no cubrirse, o que ya no se cubría y queda más corto
        if (l.saldo < -0.005 && antes - l.saldo >= this.TOLERANCIA) {
          const nivel1 = this.NIVEL1.includes(l.id) || !!l.inmediato;
          const empeora = antes < -0.005;
          if (nivel1 && !empeora) nivel1Nuevo = true;
          if (!cambian.some(c => c.nombre === l.nombre && c.fecha === f))
            cambian.push({ nombre: l.nombre, fecha: f, empeora, costo: this.costo(l), nivel1 });
        }
      });
    });
    if (agrega < this.TOLERANCIA) { agrega = 0; diaAgrega = null; }
    // Cuánto se corren las fechas de las deudas (misma regla del Bloque 11 y del colchón)
    const base = Proyeccion.planDeudas({ pr: m.prLargo, ajustes: otros });
    const despues = Proyeccion.planDeudas({ pr: m.prLargo, ajustes: con });
    const corre = {
      renta: this.diasEntre(base.rentaCero, despues.rentaCero),
      colchon: this.diasEntre(base.colchonLleno, despues.colchonLleno),
      amigo: this.diasEntre(base.amigoCero, despues.amigoCero)
    };
    const efecto = Object.values(corre).reduce((s, d) => s + (d === Infinity ? 10000 : Math.max(0, d)), 0);
    const color = agrega > 0 || nivel1Nuevo ? "rojo" : efecto > 0 ? "amarillo" : "verde";
    return { color, agrega, diaAgrega, nivel1Nuevo, cambian, corre, efecto,
             minSin: this.minimo(prSin), minCon: this.minimo(prCon), base, despues };
  },

  textoAgrega(e) { return `agrega ${dinero(e.agrega || 0)}`; },

  // Mejor fecha: el día con menor "agrega $X" hasta la fecha límite; si hay empate, el más tardío
  sugerencias(m, g) {
    const dias = m.fechas.filter(f => f <= g.fechaLimite);
    const ev = {};
    dias.forEach(f => { ev[f] = this.evaluar(m, f, g.monto); });
    const rango = { verde: 0, amarillo: 1, rojo: 2, gris: 3 };
    const orden = g.temporal
      ? dias.filter(f => f >= g.fecha).sort((a, b) => ev[a].agrega - ev[b].agrega || rango[ev[a].color] - rango[ev[b].color] || a.localeCompare(b))
      : dias.slice().sort((a, b) => ev[a].agrega - ev[b].agrega || b.localeCompare(a));
    const mejor = orden[0] || null, segunda = orden[1] || null;
    let problema = null;
    if (mejor && ev[mejor].color === "rojo" && g.temporal) {
      problema = { titulo: "En los próximos 30 días no te alcanza.",
        texto: `Lo mejor: el ${this.textoDia(mejor)}, y te quedas ${dinero(ev[mejor].agrega)} corto. También puedes hacerlo en partes, gastar menos o esperar más.` };
    } else if (mejor && ev[mejor].color === "rojo") {
      problema = { titulo: `Antes del ${this.textoDia(g.fechaLimite)} no te alcanza.`,
        texto: `Lo mejor: comprarlo el ${this.textoDia(mejor)} y quedarte ${dinero(ev[mejor].agrega)} corto. También puedes comprarlo en partes, comprar menos o mover la fecha.` };
    }
    return { ev, mejor, segunda, problema, hueco: this.hueco(m) };
  },

  // Partes: el monto repartido en los días de cobro con más sobrante (después del Nivel 1 de ese día)
  sugerirPartes(m, g) {
    const k = Math.max(2, Math.min(3, g.partes || 2));
    let dias = m.pr.cheques.filter(c => c <= g.fechaLimite);
    if (!dias.length) dias = [m.fechas[0]];
    const elegidos = [];
    const base = redondear(g.monto / Math.min(k, dias.length));
    for (let j = 0; j < Math.min(k, dias.length); j++) {
      const libres = dias.filter(d => !elegidos.some(e => e.fecha === d)).map(d => {
        let min = Infinity;
        m.fechas.filter(f => f >= d).forEach(f => { min = Math.min(min, this.saldo(m, f, elegidos)); });
        return { d, libre: min };
      }).sort((a, b) => b.libre - a.libre);
      elegidos.push({ fecha: libres[0].d, monto: base });
    }
    const suma = elegidos.reduce((s, p) => s + p.monto, 0);
    elegidos[elegidos.length - 1].monto = redondear(elegidos[elegidos.length - 1].monto + g.monto - suma);
    return elegidos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  },

  // ---------- Textos ----------
  textoDia(f) { return Jornadas.textoDia(f).toLowerCase(); },
  plata(n) { return n < 0 ? `−${dinero(-n)}` : dinero(n); },
  textoCorre(d, que) {
    if (d === Infinity) return `${que}: con este gasto ya no se alcanza en 2 años`;
    if (d > 0) return `${que}: ${d} ${d === 1 ? "día" : "días"} después`;
    return `${que}: igual`;
  },

  // ---------- Lista ----------
  abrirLista() {
    document.querySelectorAll("main.contenedor").forEach(x => { x.hidden = true; });
    $("pantalla-planeados").hidden = false;
    window.scrollTo(0, 0);
    this.mostrarLista();
  },

  mostrarLista() {
    if ($("pantalla-planeados").hidden) return;
    const lista = Almacen.leerPlaneados().slice().sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite));
    $("pl-lista").innerHTML = lista.length === 0
      ? `<p class="vacio">No tienes gastos planeados.</p>`
      : lista.map(g => {
          const e = this.estado(g);
          const fechas = g.elegido && g.elegido.length
            ? g.elegido.map(p => `${dinero(p.monto)} el ${this.textoDia(p.fecha)}`).join(" y ") : "";
          return `
            <li class="pl-item ${e.clase}" tabindex="0" role="button" aria-expanded="false">
              <div class="deuda-cabeza">
                <span class="deuda-nombre">${escapar(g.nombre)}</span>
                <span class="deuda-nombre pl-monto">${dineroCorto(g.monto)}</span>
              </div>
              <p class="deuda-sub">Necesito tenerlo para el ${this.textoDia(g.fechaLimite)} · ${g.tipo === "espera" ? "Puede esperar" : "Lo necesito"}</p>
              <p class="pl-estado ${e.clase}">${e.texto}${fechas && e.clase === "elegido" ? `: ${fechas}` : ""}</p>
              <div class="pl-botones">
                ${e.clase !== "comprado" ? `<button class="boton-chico lleno" data-pl-cuando="${g.id}">¿Cuándo lo compro?</button>
                  <button class="boton-chico" data-pl-compre="${g.id}">Ya lo compré</button>` : ""}
                <button class="boton-chico" data-pl-editar="${g.id}">Editar</button>
                <button class="borrar" data-pl-borrar="${g.id}" aria-label="Borrar">✕</button>
              </div>
            </li>`;
        }).join("");
  },

  abrirFormulario(g = null) {
    this.editando = g ? g.id : null;
    abrirFormulario("planeado");
    if (g) {
      $("form-titulo").textContent = "Editar gasto planeado";
      $("f-nombre").value = g.nombre;
      $("f-monto").value = g.monto;
      $("f-fecha").value = g.fechaLimite;
      $("f-categoria").value = g.categoria;
      $("f-nota").value = g.nota || "";
      $("f-tipo").value = g.tipo;
      $("f-en-partes").checked = !!g.enPartes;
      $("f-partes").value = String(g.partes || 2);
      $("campo-partes").hidden = !g.enPartes;
    }
  },

  async borrar(id) {
    const g = Almacen.leerPlaneados().find(x => x.id === id);
    if (!g || !(await preguntar(`¿Borrar "${g.nombre}"?\nSi ya registraste la compra, ese gasto se queda.`, "Sí, borrar"))) return;
    Almacen.borrarPlaneado(id);
    this.alCambiar("Borrado");
  },

  // "Ya lo compré": el formulario de "Gasté" con el monto que falta (se puede cambiar al real)
  comprar(id) {
    const g = Almacen.leerPlaneados().find(x => x.id === id);
    if (!g) return;
    abrirFormulario("gasto", { categoria: g.categoria, monto: this.pendiente(g), nota: g.nombre,
                               extra: { planeadoId: g.id, planeadoParte: "todo" } });
  },

  alCambiar(aviso) {
    if (aviso) Pantalla.aviso(aviso);
    window.dispatchEvent(new Event("movimientos-cambiaron"));
  },

  // Cuánto le agrega un gasto a lo que falta (los próximos 3 meses)
  efectoRapido(monto, fecha) {
    const g = { id: "temporal", monto, fechaLimite: fecha };
    const escenario = Futuro.estado().escenario;
    const op = { chequeEscenario: Escenarios.config()[escenario], horizonte: 92 }; // 3 meses, igual que "¿Y si gasto…?"
    const m = { op, pr: Proyeccion.calcular(op), _con: {} };
    m.fechas = Object.keys(m.pr.porDia).sort();
    const dia = fecha < hoy() ? hoy() : fecha;
    const prCon = this.prCon(m, [{ fecha: dia, monto }]);
    let agrega = 0, diaAgrega = null;
    m.fechas.forEach(f => { const d = redondear(this.falta(prCon, f) - this.falta(m.pr, f)); if (d > agrega + 0.005) { agrega = d; diaAgrega = f; } });
    return { agrega: agrega >= this.TOLERANCIA ? agrega : 0, diaAgrega: agrega >= this.TOLERANCIA ? diaAgrega : null, dia };
  },

  // ---------- ¿Y si gasto…? (un gasto de prueba: no se guarda nada) ----------
  // Usa la misma pantalla de "¿Cuándo lo compro?". Lo de "un poco más adelante" busca hasta 30 días.
  temporal: null,

  abrirTemporal(monto = null, fecha = hoy(), origen = "pantalla-futuro") {
    this.temporal = { id: "temporal", temporal: true, nombre: "¿Y si gasto…?", monto: monto > 0 ? redondear(monto) : 0,
                      fecha, fechaLimite: Jornadas.sumarDias(fecha, 30), categoria: "Otros", tipo: "espera" };
    this.origenTemporal = origen;
    this.abrirCuando("temporal");
    this.dia = fecha;
    this.mostrarCuando();
  },

  gastoActual() {
    return this.actual === "temporal" ? this.temporal : Almacen.leerPlaneados().find(x => x.id === this.actual);
  },

  // Con el gasto de prueba se guarda como gasto planeado de verdad (con esa fecha o en partes)
  guardarTemporal(partes) {
    const t = this.temporal;
    const g = Almacen.guardarPlaneado({ nombre: ($("pc-t-nombre").value || "").trim() || "Gasto", monto: t.monto,
      fechaLimite: t.fechaLimite, categoria: "Otros", tipo: "espera", enPartes: partes.length > 1, partes: partes.length > 1 ? partes.length : 2,
      elegido: partes.map(p => ({ fecha: p.fecha, monto: redondear(p.monto) })) });
    this.temporal = null;
    this.actual = g.id;
    this.partes = null;
    this.alCambiar("Guardado como gasto planeado");
    this.mostrarCuando();
  },

  cabezaTemporal(g, m = null) {
    return `
      <p class="estado">Solo para ver: no se guarda ni se registra nada.</p>
      <div class="ps-dos">
        <div class="campo"><label for="pc-t-monto">¿Cuánto?</label>
          <input id="pc-t-monto" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00" value="${g.monto > 0 ? g.monto : ""}"></div>
        <div class="campo"><label for="pc-t-fecha">¿Qué día?</label>
          <input id="pc-t-fecha" type="date" min="${hoy()}" value="${g.fecha}"></div>
      </div>
      ${g.monto > 0 ? `
        <div class="campo"><label for="pc-t-nombre">Nombre <span class="opcional">(si lo guardas como gasto planeado)</span></label>
          <input id="pc-t-nombre" type="text" maxlength="60" placeholder="Ej.: zapatos"></div>
        <div class="pl-botones">
          <button id="pc-t-gaste" class="boton-chico lleno">Lo gasté</button>
          <button id="pc-t-guardar" class="boton-chico">Guardarlo como gasto planeado</button>
        </div>
        ${m ? `<details class="pc-cuenta"><summary>Ver la cuenta</summary><p class="estado esc-cuenta">${escapar(Proyeccion.textoCuenta(m.pr))}</p></details>` : ""}` : `<p class="vacio">Escribe cuánto quieres gastar.</p>`}`;
  },

  // ---------- ¿Cuándo lo compro? ----------
  abrirCuando(id) {
    if (id !== "temporal") this.temporal = null;
    $("pc-h1").textContent = id === "temporal" ? "¿Y si gasto…?" : "¿Cuándo lo compro?";
    this.actual = id;
    this.dia = null;
    this.partes = null;
    document.querySelectorAll("main.contenedor").forEach(x => { x.hidden = true; });
    $("pantalla-cuando").hidden = false;
    window.scrollTo(0, 0);
    this.mostrarCuando();
  },

  cerrarCuando() {
    $("pantalla-cuando").hidden = true;
    if (this.actual === "temporal") {
      this.temporal = null;
      $(this.origenTemporal || "pantalla-futuro").hidden = false;
      window.dispatchEvent(new Event("movimientos-cambiaron"));
      return;
    }
    this.abrirLista();
  },

  mostrarCuando() {
    if ($("pantalla-cuando").hidden) return;
    const g = this.gastoActual();
    if (!g) return this.cerrarCuando();
    // Gasto de prueba: arriba se escribe el monto y la fecha; sin monto no hay nada que calcular
    const temporal = !!g.temporal;
    [...$("pantalla-cuando").children].forEach(el => {
      if (!["volver-cuando", "pc-h1", "pc-cabeza"].includes(el.id)) el.hidden = temporal && !(g.monto > 0) ? true : el.dataset.pcOculto === "1";
    });
    if (temporal && !(g.monto > 0)) { $("pc-cabeza").innerHTML = this.cabezaTemporal(g); return; }
    const m = this.motor(g);
    const s = this.sugerencias(m, g);
    this._m = m; this._s = s; this._g = g;
    const est = Futuro.estado();

    $("pc-cabeza").innerHTML = temporal ? this.cabezaTemporal(g, m) : `
      <h2 class="mv-nombre">${escapar(g.nombre)}</h2>
      <ul class="resumen">
        <li><span>Monto</span><span>${dinero(g.monto)}</span></li>
        <li><span>Necesito tenerlo para</span><span>${Jornadas.textoDia(g.fechaLimite)}</span></li>
      </ul>
      ${g.elegido && g.elegido.length ? `<div class="mv-guardado"><strong>Fecha elegida:</strong>
          ${g.elegido.map(p => `${dinero(p.monto)} el ${this.textoDia(p.fecha)}`).join(" y ")}
          <button id="pc-deshacer" class="boton-chico">Deshacer la fecha elegida</button>
          <button id="pc-compre" class="boton-chico lleno">Ya lo compré</button></div>` : ""}
      <details class="pc-cuenta"><summary>Ver la cuenta</summary><p class="estado esc-cuenta">${escapar(Proyeccion.textoCuenta(m.pr))}</p></details>`;

    $("pc-escenarios").innerHTML = Futuro.ESCENARIOS.map(e => `
      <button class="${e.id === est.escenario ? "activo" : ""}" data-pc-escenario="${e.id}" aria-pressed="${e.id === est.escenario}">
        ${e.titulo}<small>${dinero(Escenarios.config()[e.id])}</small></button>`).join("");

    const textoOp = e => e.color === "verde" ? "no afecta nada"
      : e.color === "amarillo" ? "no agrega a lo que falta, pero corre otras fechas" : `${this.textoAgrega(e)} a lo que falta`;
    $("pc-sugerencias").innerHTML =
      (s.hueco ? `<p class="pc-hueco">Aunque no lo compres, el ${this.textoDia(s.hueco.fecha)} te faltan ${dinero(s.hueco.falta)} para ${escapar(s.hueco.pago)}.</p>` : "") +
      (s.problema ? `<div class="pc-problema"><p class="pc-problema-titulo">${escapar(s.problema.titulo)}</p><p>${escapar(s.problema.texto)}</p></div>` : "") +
      (g.temporal
        ? [[s.mejor === g.fecha ? "Ese día está bien" : "Mejor un poco más adelante", s.mejor, "mejor"]]
        : [["Mejor fecha", s.mejor, "mejor"], ["Segunda opción", s.segunda, "segunda"]]).filter(([, f]) => f).map(([t, f, id]) => `
          <div class="mv-opcion">
            <span class="mv-etiqueta ${id}">${t}</span>
            <p>${Jornadas.textoDia(f)}: ${textoOp(s.ev[f])}</p>
            <button class="boton-chico lleno" data-pc-elegir="${f}">Elegir</button>
            <button class="boton-chico" data-pc-dia="${f}">Ver impacto</button>
          </div>`).join("");

    // Vista de mes / semana
    document.querySelectorAll("[data-pc-vista]").forEach(b => b.classList.toggle("activo", b.dataset.pcVista === est.vista));
    $("pc-mes").hidden = est.vista !== "mes";
    $("pc-semana").hidden = est.vista !== "semana";
    const etiqueta = f => f === s.mejor ? "Mejor" : f === s.segunda ? "2ª" : "";
    const montoCal = this.montoCalendario(g);
    const evCal = {};
    const evDia = f => evCal[f] || (evCal[f] = montoCal === g.monto && s.ev[f] ? s.ev[f] : this.evaluar(m, f, montoCal));
    const color = f => evDia(f).color;
    if (est.vista === "mes") {
      const inicio = Plan.claveSemana(Jornadas.aFecha(m.fechas[0]));
      const fin = Jornadas.sumarDias(Plan.claveSemana(Jornadas.aFecha(m.fechas[Math.min(m.fechas.length, 30) - 1])), 6);
      const celdas = [];
      for (let f = inicio; f <= fin; f = Jornadas.sumarDias(f, 1)) celdas.push(f);
      $("pc-calendario").innerHTML = celdas.map(f => {
        const num = Jornadas.aFecha(f).getDate();
        if (!m.pr.porDia[f]) return `<span class="dia mv-fuera" aria-hidden="true"><span class="dia-num">${num}</span></span>`;
        const c = color(f);
        return `<button class="dia mv-${c}${f === this.dia ? " mv-elegido" : ""}${Proyeccion.esLibre(f) ? " libre-borde" : ""}" data-pc-dia="${f}"
            aria-label="${Jornadas.textoDia(f)}: ${c}">
          <span class="dia-num">${num}</span>
          ${f === g.fechaLimite ? `<span class="mv-vence">límite</span>` : ""}
          ${etiqueta(f) ? `<span class="mv-sugerida">${etiqueta(f)}</span>` : ""}
          <span class="pc-cabe ${evDia(f).agrega > 0 ? "falta" : ""}">agrega<br>$${Math.round(evDia(f).agrega)}</span>
        </button>`;
      }).join("");
    } else {
      const lunes = Jornadas.sumarDias(Plan.claveSemana(Jornadas.aFecha(m.fechas[0])), (this.semana || 0) * 7);
      $("pc-sem-titulo").textContent = `${Futuro.diaCorto(lunes)} – ${Futuro.diaCorto(Jornadas.sumarDias(lunes, 6))}`;
      const dias = [];
      for (let i = 0; i < 7; i++) dias.push(Jornadas.sumarDias(lunes, i));
      $("pc-sem-lista").innerHTML = dias.map(f => {
        if (!m.pr.porDia[f]) return `<li class="fu-sem-dia fuera"><div class="fu-sem-fecha">${Jornadas.textoDia(f)}</div><div class="vacio">Fuera de los próximos 30 días</div></li>`;
        const e = evDia(f);
        const texto = { verde: "No afecta nada", amarillo: "Corre otras fechas", rojo: "Agrega a lo que falta" }[e.color];
        return `<li class="fu-sem-dia"><button class="fu-sem-boton" data-pc-dia="${f}">
            <div class="fu-sem-fecha">${Jornadas.textoDia(f)} ${f === g.fechaLimite ? '<span class="mv-vence">límite</span>' : ""}</div>
            <div><span class="pc-chip mv-${e.color}">${texto}</span>${etiqueta(f) ? ` <span class="mv-sugerida">${etiqueta(f)}</span>` : ""}</div>
            <div class="fu-sem-saldo">Este gasto ${this.textoAgrega(e)} a lo que falta${e.diaAgrega ? ` (el ${this.textoDia(e.diaAgrega)})` : ""}</div>
          </button></li>`;
      }).join("");
    }

    $("pc-colchon").innerHTML = ColchonUI.html();
    $("pc-arrastre").innerHTML = ArrastreUI.html(m.pr);
    $("pc-monto-cal").textContent = this.partes && this.partes.length
      ? `El calendario evalúa una parte de ${dinero(montoCal)}.` : "";
    this.mostrarImpacto();
    this.mostrarPartes();
  },

  mostrarImpacto() {
    const caja = $("pc-impacto");
    const g = this._g, m = this._m;
    if (!this.dia || !m.pr.porDia[this.dia]) { caja.hidden = true; return; }
    const e = this.evaluar(m, this.dia, g.monto);
    caja.hidden = false;
    if (e.color === "gris") {
      caja.innerHTML = `<h2>${Jornadas.textoDia(this.dia)}</h2><p class="vacio">Ese día todavía no tienes dinero para gastar.</p>
        <button id="pc-elegir-dia" class="boton-grande deuda">Elegir esta fecha de todos modos</button>`;
      this.mostrarOpciones(e);
      return;
    }
    const cambian = e.cambian.length
      ? `<ul class="pc-cambian">${e.cambian.map(c => `<li>${escapar(c.nombre)} (${this.textoDia(c.fecha)}) ${c.empeora ? "ya no alcanzaba y queda más corto" : "pasa a no alcanzar"}${c.costo ? ` · ${escapar(c.costo)}` : ""}</li>`).join("")}</ul>`
      : "<p>Ningún pago cambia.</p>";
    caja.innerHTML = `
      <h2>Si lo compras el ${this.textoDia(this.dia)}</h2>
      <p class="pc-semaforo"><span class="pc-chip mv-${e.color}">${{ verde: "No afecta nada", amarillo: "Corre otras fechas", rojo: "Agrega a lo que falta" }[e.color]}</span></p>
      <p class="pc-caben">Este gasto <strong>${this.textoAgrega(e)}</strong> a lo que falta${e.diaAgrega ? ` (el ${this.textoDia(e.diaAgrega)})` : ""}.
        ${e.nivel1Nuevo ? " Deja sin cubrir un pago de Nivel 1 que antes sí se cubría." : ""}</p>
      <ul class="resumen">
        <li><span>Saldo más bajo del mes, sin el gasto</span><span>${this.plata(e.minSin.saldo)} · ${this.textoDia(e.minSin.fecha)}</span></li>
        <li><span>Con el gasto</span><span class="${e.minCon.saldo < 0 ? "error" : ""}">${this.plata(e.minCon.saldo)} · ${this.textoDia(e.minCon.fecha)}</span></li>
      </ul>
      <h3 class="pc-sub">Pagos que cambian</h3>${cambian}
      <h3 class="pc-sub">Fechas que se corren</h3>
      <ul class="pc-cambian">
        <li>${this.textoCorre(e.corre.renta, "Renta atrasada en cero")}</li>
        <li>${this.textoCorre(e.corre.colchon, `Colchón en ${dinero(Plan.metaColchon())}`)}</li>
        <li>${this.textoCorre(e.corre.amigo, "Préstamo del amigo en cero")}</li>
      </ul>
      <p class="ayuda">Es una estimación, no una orden.</p>
      ${this.dia > g.fechaLimite ? `<p class="aviso-movido">Este día es después de la fecha límite.</p>` : ""}
      <button id="pc-elegir-dia" class="boton-grande deuda">Elegir esta fecha</button>`;
    this.mostrarOpciones(e);
  },

  // ---------- Bloque 16: opciones para que sí se pueda ----------
  // Para un día rojo o amarillo. Cada opción muestra su efecto en ese día y se puede aplicar.
  mostrarOpciones(e) {
    const caja = $("pc-opciones");
    const g = this._g, m = this._m, dia = this.dia;
    if (!dia || !e || e.color === "verde") { caja.hidden = true; caja.innerHTML = ""; return; }
    const monto = this.montoCalendario(g);
    const chip = c => `<span class="pc-chip mv-${c}">${{ verde: "No afecta nada", amarillo: "Corre otras fechas", rojo: "Deja algo sin cubrir", gris: "Sin dinero todavía" }[c]}</span>`;
    const ops = [];

    // a) Dividir o mover los pagos que se pueden mover (permite_mover: true, ej.: teléfono)
    // Sirve si el pago vence antes de que pase el problema: se paga una parte en su fecha y el resto
    // pasa al primer cheque después del día más apretado (o del día elegido).
    this._movimientos = {};
    const masBajo = m.fechas.filter(f => f >= dia).reduce((a, f) => this.saldo(m, f, []) < this.saldo(m, a, []) ? f : a, dia);
    const destino = m.pr.cheques.find(c => c > masBajo && c > dia) || null;
    ArrastreUI.movibles(m.pr, m.fechas[m.fechas.length - 1]).forEach(l => {
      if (!Vencimientos.MOVIBLES.includes(l.id) || !destino || l.fecha >= destino) return;
      const total = -l.monto;
      // Lo que falta para que quepa el gasto, contando lo que ya faltaba (ej.: la renta corta)
      let minDesde = Infinity;
      m.fechas.filter(f => f >= dia).forEach(f => { minDesde = Math.min(minDesde, this.saldo(m, f, [])); });
      const necesita = redondear(monto - minDesde);
      const pasar = redondear(Math.min(total, Math.max(0, necesita)));
      if (pasar <= 0) return;
      const partes = total - pasar > 0.005
        ? [{ fecha: l.fecha, monto: redondear(total - pasar) }, { fecha: destino, monto: pasar }]
        : [{ fecha: destino, monto: total }];
      const m2 = this.motor(g, { excluir: l.claveMov });
      const efecto = this.evaluar(m2, dia, monto, partes);
      this._movimientos[l.claveMov] = partes;
      ops.push({ titulo: `Dividir o mover ${l.nombre}`,
                 detalle: `Sugerido: ${partes.map(p => `${dinero(p.monto)} el ${this.textoDia(p.fecha)}`).join(" y ")}. Se abre "Mover este pago" con esta sugerencia. ${Escenarios.costo(l.id)}.`,
                 color: efecto.color, cabe: this.caben(m2, dia, partes), boton: `data-op-mover="${escapar(l.claveMov)}"` });
    });

    // b) Comprar en partes
    const sugeridas = this.sugerirPartes(m, { ...g, partes: g.partes && g.partes > 1 ? g.partes : 2 });
    if (sugeridas.length > 1) {
      const peor = sugeridas.map((p, i) => this.evaluar(m, p.fecha, p.monto, sugeridas.filter((_, j) => j !== i)).color)
        .sort((a, b) => ["verde", "amarillo", "gris", "rojo"].indexOf(b) - ["verde", "amarillo", "gris", "rojo"].indexOf(a))[0];
      ops.push({ titulo: "Comprar en partes", detalle: sugeridas.map(p => `${dinero(p.monto)} el ${this.textoDia(p.fecha)}`).join(" y "),
                 color: peor, boton: `data-op-partes` });
    }

    // c) Comprar menos
    const cabe = this.caben(m, dia);
    ops.push({ titulo: "Comprar menos", detalle: `Ese día caben hasta ${dinero(cabe)}.`,
               color: cabe > 0 ? this.evaluar(m, dia, cabe).color : "rojo",
               extra: `<label class="pc-menos">Monto <input id="pc-menos-monto" type="number" inputmode="decimal" step="0.01" min="0.01" value="${cabe > 0 ? cabe.toFixed(2) : ""}"></label>`,
               boton: `data-op-menos` });

    // d) Usar el colchón (solo si tiene saldo)
    const c = Proyeccion.colchon();
    if (c > 0) {
      if (m.pr.protegido) {
        const m2 = this.motor(g, { proteger: false });
        ops.push({ titulo: "Usar el colchón", detalle: `Tienes ${dinero(c)} en el colchón.`, color: this.evaluar(m2, dia, monto).color,
                   cabe: this.caben(m2, dia), boton: `data-usar-colchon` });
      } else {
        ops.push({ titulo: "Usar el colchón", detalle: `Tu colchón de ${dinero(c)} ya está contado en tu dinero (puedes usarlo).`, color: e.color });
      }
    }

    // e) Comida en modo extremo
    const min = Proyeccion.comidaMinima();
    const comida = Vencimientos.gasto("comida");
    if (min != null && comida) {
      if (!m.pr.comidaExtrema) {
        const m2 = this.motor(g, { comidaExtrema: true });
        ops.push({ titulo: "Comida en modo extremo", detalle: `${dinero(min)} en vez de ${dinero(comida.monto)}: libera ${dinero(comida.monto - min)} por semana. Solo en caso extremo.`,
                   color: this.evaluar(m2, dia, monto).color, cabe: this.caben(m2, dia), boton: `data-comida-extrema="1"` });
      } else {
        ops.push({ titulo: "Comida en modo extremo (aplicada)", detalle: "Solo en caso extremo.", color: e.color, boton: `data-comida-extrema="0"`, textoBoton: "Quitar" });
      }
    }

    // f) Otra fecha: la menos mala
    const s = this._s;
    const otra = [s.mejor, s.segunda].find(f => f && f !== dia) ||
      m.fechas.filter(f => f !== dia).map(f => ({ f, e: this.evaluar(m, f, monto) })).filter(x => x.e.color !== "gris")
        .sort((a, b) => (b.e.minCon ? b.e.minCon.saldo : -1e9) - (a.e.minCon ? a.e.minCon.saldo : -1e9))[0]?.f;
    if (otra) ops.push({ titulo: "Otra fecha", detalle: `${Jornadas.textoDia(otra)}.`, color: this.evaluar(m, otra, monto).color, boton: `data-pc-dia="${otra}"`, textoBoton: "Ver ese día" });

    caja.hidden = false;
    caja.innerHTML = `
      <h2>Opciones para que sí se pueda</h2>
      <p class="estado">Con lo aplicado ahora, el ${this.textoDia(dia)}: ${chip(e.color)} · caben hasta ${dinero(cabe)}.</p>
      <ol class="pc-opciones">${ops.map(o => `
        <li>
          <div class="pc-op-cabeza"><strong>${escapar(o.titulo)}</strong>${chip(o.color)}</div>
          <p>${escapar(o.detalle)}${o.cabe != null ? ` Con esto caben hasta ${dinero(o.cabe)} ese día.` : ""}</p>
          ${o.extra || ""}
          ${o.boton ? `<button class="boton-chico lleno" ${o.boton}>${o.textoBoton || "Aplicar"}</button>` : ""}
        </li>`).join("")}</ol>
      <p class="ayuda">Se pueden combinar. Es una estimación, no una orden.</p>`;
  },

  // ---------- Comprar en partes ----------
  mostrarPartes() {
    const g = this._g, m = this._m;
    const caja = $("pc-partes");
    caja.hidden = !g.enPartes;
    if (!g.enPartes) return;
    if (!this.partes) {
      caja.innerHTML = `<h2>Comprar en partes</h2>
        <p class="estado">Hasta ${g.partes || 2} partes, en los días de cobro con más sobrante.</p>
        <button id="pc-dividir" class="boton-mediano">Dividir en partes</button>`;
      return;
    }
    const filas = this.partes.map((p, i) => {
      const otros = this.partes.filter((_, j) => j !== i);
      const e = this.evaluar(m, p.fecha, p.monto, otros);
      const texto = { verde: "No afecta nada", amarillo: "Corre otras fechas", rojo: "Deja algo sin cubrir", gris: e.fuera ? "Fuera de 30 días" : "Todavía no hay dinero" }[e.color];
      return `<li class="pc-parte">
          <div class="pc-parte-cabeza"><strong>Parte ${i + 1}</strong><span class="pc-chip mv-${e.color}">${texto}</span></div>
          <div class="pc-parte-campos">
            <label>Fecha<input type="date" data-pc-parte-fecha="${i}" value="${p.fecha}"></label>
            <label>Monto<input type="number" inputmode="decimal" step="0.01" min="0.01" data-pc-parte-monto="${i}" value="${p.monto.toFixed(2)}"></label>
          </div>
        </li>`;
    }).join("");
    const todas = this.partes;
    const suma = redondear(todas.reduce((s, p) => s + p.monto, 0));
    const base = Proyeccion.planDeudas({ pr: m.prLargo });
    const con = Proyeccion.planDeudas({ pr: m.prLargo, ajustes: todas });
    const minCon = this.minimo(this.prCon(m, todas.filter(p => m.pr.porDia[p.fecha] || p.fecha < m.fechas[0])));
    const corre = { renta: this.diasEntre(base.rentaCero, con.rentaCero), colchon: this.diasEntre(base.colchonLleno, con.colchonLleno), amigo: this.diasEntre(base.amigoCero, con.amigoCero) };
    const despuesLimite = todas.some(p => p.fecha > g.fechaLimite);
    caja.innerHTML = `<h2>Comprar en partes</h2>
      <ul class="pc-partes">${filas}</ul>
      <p class="pc-suma ${Math.abs(suma - g.monto) > 0.005 ? "error" : ""}">Suma de las partes: <strong>${dinero(suma)}</strong> de ${dinero(g.monto)}</p>
      <h3 class="pc-sub">Efecto total</h3>
      <ul class="pc-cambian">
        <li>Saldo más bajo del mes: ${this.plata(minCon.saldo)} · ${this.textoDia(minCon.fecha)}</li>
        <li>${this.textoCorre(corre.renta, "Renta atrasada en cero")}</li>
        <li>${this.textoCorre(corre.colchon, `Colchón en ${dinero(Plan.metaColchon())}`)}</li>
        <li>${this.textoCorre(corre.amigo, "Préstamo del amigo en cero")}</li>
      </ul>
      ${despuesLimite ? `<p class="aviso-movido">Una parte queda después de la fecha límite.</p>` : ""}
      <p class="ayuda">Es una estimación, no una orden.</p>
      <button id="pc-elegir-partes" class="boton-grande deuda">Elegir estas fechas y montos</button>
      <button id="pc-sugerir" class="boton-chico">Volver a la sugerencia</button>`;
  },

  // Cambiar el monto de una parte: la última (o la anterior, si se cambia la última) se ajusta para que la suma siga igual
  cambiarMontoParte(i, valor) {
    const g = this._g;
    const v = redondear(Number(valor));
    if (!(v > 0) || v >= g.monto) { this.mostrarPartes(); return; }
    this.partes[i].monto = v;
    const j = i === this.partes.length - 1 ? i - 1 : this.partes.length - 1;
    const resto = redondear(g.monto - this.partes.reduce((s, p, k) => s + (k === j ? 0 : p.monto), 0));
    if (resto <= 0) { Pantalla.aviso("Ese monto no deja nada para la otra parte"); this.partes[i].monto = redondear(this.partes[i].monto - (0.01 - resto)); }
    this.partes[j].monto = Math.max(0.01, redondear(g.monto - this.partes.reduce((s, p, k) => s + (k === j ? 0 : p.monto), 0)));
    this.mostrarPartes();
  },

  elegir(partes) {
    if (this.actual === "temporal") return this.guardarTemporal(partes);
    const g = this._g;
    Almacen.guardarPlaneado({ id: g.id, elegido: partes.map(p => ({ fecha: p.fecha, monto: redondear(p.monto) })) });
    this.partes = null;
    this.alCambiar(partes.length > 1 ? "Guardado: comprar en partes" : `Guardado: ${this.textoDia(partes[0].fecha)}`);
    this.mostrarCuando();
  },

  async deshacer() {
    if (!(await preguntar("¿Quitar la fecha elegida?\nEl gasto vuelve a quedar sin fecha.", "Sí, quitar"))) return;
    Almacen.guardarPlaneado({ id: this.actual, elegido: null });
    this.alCambiar("Fecha quitada");
    this.mostrarCuando();
  },

  iniciar() {
    $("abrir-planeados").addEventListener("click", () => this.abrirLista());
    $("volver-planeados").addEventListener("click", () => {
      $("pantalla-planeados").hidden = true;
      $("pantalla-inicio").hidden = false;
      window.scrollTo(0, 0);
    });
    $("pl-agregar").addEventListener("click", () => this.abrirFormulario());
    $("pl-lista").addEventListener("click", e => {
      const c = e.target.closest("[data-pl-cuando]"); if (c) this.abrirCuando(c.dataset.plCuando);
      const k = e.target.closest("[data-pl-compre]"); if (k) this.comprar(k.dataset.plCompre);
      const ed = e.target.closest("[data-pl-editar]"); if (ed) this.abrirFormulario(Almacen.leerPlaneados().find(x => x.id === ed.dataset.plEditar));
      const b = e.target.closest("[data-pl-borrar]"); if (b) this.borrar(b.dataset.plBorrar);
    });
    $("volver-cuando").addEventListener("click", () => this.cerrarCuando());
    $("pantalla-cuando").addEventListener("click", e => {
      const esc = e.target.closest("[data-pc-escenario]");
      if (esc) { Almacen.guardarFuturo({ escenario: esc.dataset.pcEscenario }); this.mostrarCuando(); }
      const vis = e.target.closest("[data-pc-vista]");
      if (vis) { Almacen.guardarFuturo({ vista: vis.dataset.pcVista }); this.mostrarCuando(); }
      const d = e.target.closest("[data-pc-dia]");
      if (d) { this.dia = d.dataset.pcDia; this.mostrarCuando(); $("pc-impacto").scrollIntoView({ block: "nearest" }); }
      const el = e.target.closest("[data-pc-elegir]"); if (el) this.elegir([{ fecha: el.dataset.pcElegir, monto: this._g.monto }]);
      if (e.target.closest("#pc-elegir-dia")) this.elegir([{ fecha: this.dia, monto: this._g.monto }]);
      if (e.target.closest("#pc-dividir") || e.target.closest("#pc-sugerir")) { this.partes = this.sugerirPartes(this._m, this._g); this.mostrarPartes(); }
      if (e.target.closest("#pc-elegir-partes")) this.elegir(this.partes);
      if (e.target.closest("#pc-deshacer")) this.deshacer();
      const opMover = e.target.closest("[data-op-mover]");
      if (opMover) Mover.abrir(opMover.dataset.opMover, "pantalla-cuando", ArrastreUI.escenario(),
        { partes: (this._movimientos || {})[opMover.dataset.opMover], motivo: `Para "${this._g.nombre}"` });
      if (e.target.closest("[data-op-partes]")) {
        const g = this._g;
        if (g.temporal) Object.assign(this.temporal, { enPartes: true, partes: 2 });
        else if (!g.enPartes) Almacen.guardarPlaneado({ id: g.id, enPartes: true, partes: g.partes && g.partes > 1 ? g.partes : 2 });
        this._g = this.gastoActual();
        this.partes = this.sugerirPartes(this._m, this._g);
        Pantalla.aviso("Aplicado: comprar en partes");
        this.mostrarCuando();
      }
      if (e.target.closest("[data-op-menos]")) {
        const v = redondear(Number($("pc-menos-monto").value));
        if (v > 0) {
          if (this.actual === "temporal") this.temporal.monto = v;
          else Almacen.guardarPlaneado({ id: this.actual, monto: v, elegido: null });
          this.partes = null; Pantalla.aviso(`Aplicado: ${dinero(v)}`); this.mostrarCuando();
        }
      }
      if (e.target.closest("#pc-compre")) this.comprar(this.actual);
      // ¿Y si gasto…?
      if (e.target.closest("#pc-t-gaste")) {
        const t = this.temporal;
        this.cerrarCuando();
        abrirFormulario("gasto", { monto: t.monto, fecha: t.fecha });
      }
      if (e.target.closest("#pc-t-guardar")) {
        const t = this.temporal, nombre = ($("pc-t-nombre").value || "").trim();
        this.cerrarCuando();
        abrirFormulario("planeado");
        $("f-monto").value = t.monto.toFixed(2);
        $("f-fecha").value = t.fecha;
        if (nombre) $("f-nombre").value = nombre;
      }
    });
    $("pantalla-cuando").addEventListener("change", e => {
      if (this.actual !== "temporal") return;
      if (e.target.id === "pc-t-monto") { this.temporal.monto = Math.max(0, redondear(Number(e.target.value) || 0)); this.partes = null; this.mostrarCuando(); }
      if (e.target.id === "pc-t-fecha" && e.target.value) {
        this.temporal.fecha = e.target.value < hoy() ? hoy() : e.target.value;
        this.temporal.fechaLimite = Jornadas.sumarDias(this.temporal.fecha, 30);
        this.dia = this.temporal.fecha; this.mostrarCuando();
      }
    });
    $("pc-partes").addEventListener("change", e => {
      const f = e.target.closest("[data-pc-parte-fecha]");
      if (f && f.value) { this.partes[Number(f.dataset.pcParteFecha)].fecha = f.value; this.mostrarPartes(); }
      const mo = e.target.closest("[data-pc-parte-monto]");
      if (mo) this.cambiarMontoParte(Number(mo.dataset.pcParteMonto), mo.value);
    });
    $("pc-sem-anterior").addEventListener("click", () => { this.semana = Math.max(0, (this.semana || 0) - 1); this.mostrarCuando(); });
    $("pc-sem-siguiente").addEventListener("click", () => { this.semana = Math.min(4, (this.semana || 0) + 1); this.mostrarCuando(); });
    $("form-campos").addEventListener("change", e => {
      if (e.target.id === "f-en-partes") $("campo-partes").hidden = !e.target.checked;
    });
    window.addEventListener("movimientos-cambiaron", () => { this.mostrarLista(); this.mostrarCuando(); });
    window.addEventListener("jornadas-cambiaron", () => this.mostrarCuando());
  }
};

// Formulario "Agregar gasto planeado"
Formularios.planeado = {
  titulo: "Agregar gasto planeado",
  campos: () => `
    <div class="campo">
      <label for="f-nombre">Nombre</label>
      <input id="f-nombre" type="text" maxlength="80" placeholder="Ej.: Arbolito de Navidad y decoraciones">
    </div>` + campoMonto() + `
    <div class="campo">
      <label for="f-fecha">Necesito tenerlo para</label>
      <input id="f-fecha" type="date" value="${hoy()}">
    </div>
    <div class="campo">
      <label for="f-categoria">Categoría</label>
      <select id="f-categoria">${[...CATEGORIAS, Planeados.CATEGORIA_FIESTAS].map(c => `<option>${c}</option>`).join("")}</select>
    </div>
    <div class="campo">
      <label for="f-tipo">Tipo</label>
      <select id="f-tipo"><option value="necesito">Lo necesito</option><option value="espera">Puede esperar</option></select>
    </div>
    <label class="mv-check"><input id="f-en-partes" type="checkbox"> Se puede comprar en partes</label>
    <div class="campo" id="campo-partes" hidden>
      <label for="f-partes">Cantidad de partes</label>
      <select id="f-partes"><option value="2">2</option><option value="3">3</option></select>
    </div>
    <div class="campo">
      <label for="f-nota">Nota <span class="opcional">(opcional)</span></label>
      <input id="f-nota" type="text" maxlength="120">
    </div>`,
  guardar(mostrarError) {
    const nombre = $("f-nombre").value.trim();
    const montoTxt = $("f-monto").value.trim();
    const monto = redondear(Number(montoTxt));
    const fechaLimite = $("f-fecha").value;
    if (!nombre) return mostrarError("Escribe el nombre.");
    if (montoTxt === "" || !(monto > 0)) return mostrarError("El monto debe ser mayor que 0.");
    if (!fechaLimite) return mostrarError("Elige para qué fecha lo necesitas.");
    const anterior = Planeados.editando ? Almacen.leerPlaneados().find(x => x.id === Planeados.editando) : null;
    const enPartes = $("f-en-partes").checked;
    const datos = {
      id: Planeados.editando || undefined, nombre, monto, fechaLimite,
      categoria: $("f-categoria").value, nota: $("f-nota").value.trim(), tipo: $("f-tipo").value,
      enPartes, partes: enPartes ? Number($("f-partes").value) : 1
    };
    // Si cambió el monto, la fecha elegida ya no corresponde
    if (anterior && anterior.elegido && Math.abs(anterior.monto - monto) > 0.005) datos.elegido = null;
    if (!Almacen.guardarPlaneado(datos)) return mostrarError("No se pudo guardar en este dispositivo.");
    Planeados.editando = null;
    cerrarFormulario();
    Planeados.alCambiar("Guardado");
  }
};

if (Datos.actual) Planeados.iniciar();
