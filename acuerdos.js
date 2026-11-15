/*
 * ACUERDOS Y CONVERSACIONES POR DEUDA (Plan 2, 1.1)
 * Una bitácora: con quién hablaste, qué día, qué dijo, en qué quedó, hasta cuándo y si lo tienes por escrito.
 * Solo anota: no cambia saldos, pagos ni cuentas (eso lo hace "Planear pagos" y la proyección).
 * La lista "acuerdos" se guarda con almacen.js, viaja con la sincronización y con el respaldo, y la lee el consejero.
 * El aviso de la campana sale cuando algo "quedó en responder" y pasó su fecha sin marcar "Ya respondió".
 * Modo "Solo ver": esa vista no tiene "Mis deudas", así que nada de esto aparece ahí.
 */
const Acuerdos = {
  MAX: 400,        // letras por texto
  MAX_CON: 60,
  ESTADOS: { espera: "Quedó en responder", acordado: "Acordamos algo", no: "Dijo que no" },
  _deudaId: null,
  _editando: null,
  _estado: "espera",

  // ---------- Datos ----------
  de(deudaId) {
    return Almacen.leerAcuerdos().filter(a => a.deudaId === deudaId)
      .sort((x, y) => (y.fecha || "").localeCompare(x.fecha || "") || (y.creado || "").localeCompare(x.creado || ""));
  },

  deuda(id) { return Datos.deudas().find(d => d.id === id) || null; },

  // La deuda sigue existiendo y todavía se debe algo (si no, el aviso ya no tiene sentido)
  activa(id) { return !!this.deuda(id) && Datos.saldoDeuda(id) > Deudas.CERO; },

  sinRespuesta(a) {
    return a.estado === "espera" && !!a.hasta && !a.respondido && a.hasta < hoy() && this.activa(a.deudaId);
  },

  vencidos() { return Almacen.leerAcuerdos().filter(a => this.sinRespuesta(a)); },

  dia(f) {
    return f ? Jornadas.aFecha(f).toLocaleDateString("es", { day: "numeric", month: "short" }).replace(/[.,]/g, "") : "";
  },

  // Lo que lee el consejero (analizar.js)
  paraConsejero() {
    return Almacen.leerAcuerdos().map(a => {
      const d = this.deuda(a.deudaId);
      return { id: a.id, deudaId: a.deudaId, deuda: d ? d.nombre : null, con: a.con, fecha: a.fecha, dijo: a.dijo || "", detalle: a.detalle || "",
               estado: a.estado, hasta: a.hasta || null, porEscrito: !!a.porEscrito, respondido: !!a.respondido, sinRespuesta: this.sinRespuesta(a) };
    });
  },

  // ---------- Botón en la tarjeta de la deuda (deudas.js) ----------
  botonTarjeta(d) {
    if (Sync.soloVer()) return "";
    const n = this.de(d.id).length;
    return `<button class="boton-chico" data-acuerdos="${d.id}">Acuerdos y conversaciones (${n})</button>`;
  },

  ultimoTarjeta(d) {
    const a = this.de(d.id)[0];
    if (!a) return "";
    const sin = this.sinRespuesta(a);
    return `<p class="deuda-sub ac-ultimo">Último: ${this.dia(a.fecha)} · ${escapar(a.con)} · <span class="${sin ? "ac-rojo" : a.estado === "espera" && !a.respondido ? "ac-ambar" : ""}">${
      sin ? "sin respuesta" : a.estado === "espera" ? (a.respondido ? "ya respondió" : "quedó en responder") : a.estado === "no" ? "dijo que no" : "acordado"}</span></p>`;
  },

  // ---------- Hoja: lista ----------
  abrir(deudaId) {
    const d = this.deuda(deudaId);
    if (!d) return;
    this._deudaId = deudaId;
    this._editando = null;
    Nav.abrirHoja("acuerdos");
    $("hoja-titulo-barra").textContent = `${d.nombre} · acuerdos`;
    this.mostrarLista();
  },

  mostrarLista() {
    $("ac-form").hidden = true;
    $("ac-lista").hidden = false;
    const d = this.deuda(this._deudaId);
    const lista = this.de(this._deudaId);
    $("hoja-titulo-barra").textContent = `${d ? d.nombre : "Deuda"} · acuerdos`;
    $("ac-lista").innerHTML = `
      <button type="button" class="boton-grande guardar" data-ac-nuevo>+ Anotar una conversación</button>
      ${lista.length ? lista.map(a => this.fila(a)).join("") : `<p class="ayuda">Todavía no hay nada anotado. Anota aquí con quién hablaste y en qué quedaron: sirve para tener todo en un solo lugar.</p>`}`;
  },

  fila(a) {
    const sin = this.sinRespuesta(a);
    const pills = [];
    pills.push(`<span class="ac-pill ${a.estado === "acordado" ? "ac-ok" : a.estado === "no" ? "ac-no" : "ac-esp"}">${this.ESTADOS[a.estado] || "Anotado"}</span>`);
    if (sin) pills.push(`<span class="ac-pill ac-no">Sin respuesta</span>`);
    else if (a.estado === "espera" && a.respondido) pills.push(`<span class="ac-pill ac-ok">Ya respondió</span>`);
    if (a.hasta && !(a.estado === "espera" && a.respondido)) pills.push(`<span class="ac-pill ac-neutro">Hasta el ${this.dia(a.hasta)}</span>`);
    if (a.porEscrito) pills.push(`<span class="ac-pill ac-ok">✓ Por escrito</span>`);
    return `<div class="ac-item" data-ac-id="${a.id}">
      <div class="deuda-cabeza"><span class="ac-con">${escapar(a.con)}</span><span class="ac-fecha">${this.dia(a.fecha)}</span></div>
      ${a.dijo ? `<p>Dijo: ${escapar(a.dijo)}</p>` : ""}
      ${a.detalle ? `<p>Quedó: <strong>${escapar(a.detalle)}</strong></p>` : ""}
      <div class="ac-pills">${pills.join("")}</div>
      ${a.estado === "acordado" && !a.porEscrito ? `<p class="ayuda ac-aviso">Sin constancia por escrito: pídela (mensaje, correo o carta).</p>` : ""}
      <div class="pl-botones">
        ${a.estado === "espera" && !a.respondido ? `<button type="button" class="boton-chico" data-ac-respondio="${a.id}">Ya respondió</button>` : ""}
        <button type="button" class="boton-chico" data-ac-editar="${a.id}">Editar</button>
        <button type="button" class="boton-chico boton-borrar" data-ac-borrar="${a.id}">Borrar</button>
      </div></div>`;
  },

  // ---------- Hoja: formulario ----------
  mostrarForm(id) {
    const a = id ? Almacen.leerAcuerdos().find(x => x.id === id) : null;
    this._editando = a ? a.id : null;
    const previo = this.de(this._deudaId)[0];
    this._estado = a ? a.estado : "espera";
    const v = {
      con: a ? a.con : (previo ? previo.con : ""), fecha: a ? a.fecha : hoy(), dijo: a ? a.dijo || "" : "", detalle: a ? a.detalle || "" : "",
      hasta: a ? a.hasta || "" : "", porEscrito: a ? !!a.porEscrito : false
    };
    const d = this.deuda(this._deudaId);
    $("hoja-titulo-barra").textContent = `${a ? "Editar" : "Nueva"} conversación`;
    $("ac-lista").hidden = true;
    $("ac-form").hidden = false;
    $("ac-form").innerHTML = `
      <p class="ayuda">${escapar(d ? d.nombre : "")}. Solo anota: no registra ningún pago.</p>
      <div class="campo"><label for="ac-con">¿Con quién hablaste?</label>
        <input id="ac-con" type="text" maxlength="${this.MAX_CON}" autocomplete="off" placeholder="Ej.: casero, administración, PSE&amp;G" value="${escapar(v.con)}"></div>
      <div class="campo"><label for="ac-fecha">¿Qué día?</label><input id="ac-fecha" type="date" value="${v.fecha}"></div>
      <div class="campo"><label for="ac-dijo">¿Qué dijo?</label>
        <textarea id="ac-dijo" rows="3" maxlength="${this.MAX}">${escapar(v.dijo)}</textarea></div>
      <div class="campo"><label id="ac-estado-etq">¿En qué quedó?</label>
        <div class="chips" role="group" aria-labelledby="ac-estado-etq">${Object.entries(this.ESTADOS).map(([k, t]) =>
          `<button type="button" class="chip" data-ac-estado="${k}" aria-pressed="${k === this._estado}">${t}</button>`).join("")}</div></div>
      <div class="campo"><label for="ac-detalle">Con tus palabras (opcional)</label>
        <input id="ac-detalle" type="text" maxlength="${this.MAX}" autocomplete="off" placeholder="Ej.: $250 cada viernes" value="${escapar(v.detalle)}"></div>
      <div class="campo"><label for="ac-hasta">¿Hasta cuándo? (opcional)</label>
        <input id="ac-hasta" type="date" value="${v.hasta}">
        <p class="ayuda" id="ac-hasta-ayuda"></p></div>
      <label class="ac-chk"><input id="ac-escrito" type="checkbox"${v.porEscrito ? " checked" : ""}> Lo tengo por escrito (mensaje, correo o carta)</label>
      <p id="ac-error" class="error" role="alert"></p>
      <div class="pl-botones"><button type="submit" class="boton-grande guardar">Guardar</button>
        <button type="button" class="boton-chico" data-ac-cancelar>Cancelar</button></div>`;
    this.ayudaHasta();
  },

  ayudaHasta() {
    const e = $("ac-hasta-ayuda");
    if (e) e.textContent = this._estado === "espera" ? "Si pasa esa fecha y no marcas \"Ya respondió\", te aviso en la campana." : "";
  },

  guardar() {
    const err = (msg, campo) => { $("ac-error").textContent = msg; if (campo && $(campo)) $(campo).focus(); };
    const con = $("ac-con").value.trim().slice(0, this.MAX_CON), fecha = $("ac-fecha").value;
    const dijo = $("ac-dijo").value.trim().slice(0, this.MAX), detalle = $("ac-detalle").value.trim().slice(0, this.MAX);
    const hasta = $("ac-hasta").value || null;
    if (!con) return err("Escribe con quién hablaste.", "ac-con");
    if (!fecha) return err("Elige qué día fue.", "ac-fecha");
    if (fecha > hoy()) return err("El día no puede ser en el futuro.", "ac-fecha");
    if (!dijo && !detalle) return err("Escribe qué dijo o en qué quedaron.", "ac-dijo");
    if (hasta && hasta < fecha) return err("La fecha límite no puede ser antes del día que hablaron.", "ac-hasta");
    const a = { deudaId: this._deudaId, con, fecha, dijo, detalle, estado: this._estado, hasta, porEscrito: $("ac-escrito").checked };
    // Si cambia a otro estado o a otra fecha límite, lo de "Ya respondió" se vuelve a empezar
    const previo = this._editando ? Almacen.leerAcuerdos().find(x => x.id === this._editando) : null;
    a.respondido = previo && previo.estado === a.estado && previo.hasta === a.hasta ? !!previo.respondido : false;
    if (this._editando) a.id = this._editando;
    if (!Almacen.guardarAcuerdo(a)) return err("No se pudo guardar (el teléfono no tiene espacio).");
    Pantalla.aviso("Anotado");
    this.despuesDeCambiar();
    this.mostrarLista();
  },

  despuesDeCambiar() {
    if (!$("pantalla-deudas").hidden) Deudas.mostrar();
    if (typeof Avisos !== "undefined") Avisos.mostrar();
  },

  respondio(id) {
    const a = Almacen.leerAcuerdos().find(x => x.id === id);
    if (!a) return;
    Almacen.guardarAcuerdo({ id, respondido: true });
    this.despuesDeCambiar();
    this.mostrarLista();
  },

  borrar(id) {
    if (!confirm("¿Borrar esta conversación?")) return;
    Almacen.borrarAcuerdo(id);
    this.despuesDeCambiar();
    this.mostrarLista();
  },

  // ---------- Eventos ----------
  iniciar() {
    document.addEventListener("click", e => {
      const t = e.target.closest("[data-acuerdos],[data-ac-nuevo],[data-ac-editar],[data-ac-borrar],[data-ac-respondio],[data-ac-estado],[data-ac-cancelar]");
      if (!t) return;
      if (t.dataset.acuerdos) return this.abrir(t.dataset.acuerdos);
      if (Sync.soloVer()) return; // sin botones de escritura
      if ("acNuevo" in t.dataset) return this.mostrarForm(null);
      if (t.dataset.acEditar) return this.mostrarForm(t.dataset.acEditar);
      if (t.dataset.acBorrar) return this.borrar(t.dataset.acBorrar);
      if (t.dataset.acRespondio) return this.respondio(t.dataset.acRespondio);
      if ("acCancelar" in t.dataset) return this.mostrarLista();
      if (t.dataset.acEstado) {
        this._estado = t.dataset.acEstado;
        document.querySelectorAll("[data-ac-estado]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.acEstado === this._estado)));
        this.ayudaHasta();
      }
    });
    $("ac-form").addEventListener("submit", e => { e.preventDefault(); if (!Sync.soloVer()) this.guardar(); });
    window.addEventListener("movimientos-cambiaron", () => { if (!$("hoja-acuerdos").hidden && !$("hoja").hidden) this.mostrarLista(); });
  }
};

if (Datos.actual) Acuerdos.iniciar();
