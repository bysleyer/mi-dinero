/*
 * PAGOS FIJOS (Más → Pagos fijos)
 * Lo que se paga cada mes, en dos grupos:
 *   Esenciales     lo necesario para vivir: renta, luz, internet, teléfono y los que agregues.
 *   Suscripciones  lo que se puede cancelar: Netflix, Spotify, apps...
 *
 * Renta, luz, internet y teléfono vienen de mis datos y se cambian con las mismas cifras de
 * "Datos fijos" (con "desde cuándo aplica"). Los pagos que agrego yo se guardan en el dispositivo
 * ("pagosPropios", se sincroniza) y cada cambio también lleva su fecha:
 *   { id, grupo: "esencial" | "suscripcion", nombre, categoria, nota, variable,
 *     versiones: [{ desde, monto, venceDia }],   el monto y el día que valen desde cada fecha
 *     pausas: [{ desde, hasta|null }],           semanas en que no se cobra
 *     canceladoDesde: fecha | null, creado, modificado, borrado }
 * Un pago pausado o cancelado no cuenta en ninguna cuenta (Libre, Mi futuro, avisos).
 */
const PagosFijos = {
  // Los que vienen de mis datos (siempre son esenciales)
  PROPIOS_DE_DATOS: [
    { id: "renta", seccion: "renta", categoria: "Otros" },
    { id: "luz", seccion: "luz", categoria: "Luz" },
    { id: "internet", seccion: "internet", categoria: "Internet" },
    { id: "telefono", seccion: "telefono", categoria: "Teléfono" }
  ],
  GRUPOS: { esencial: "Esenciales", suscripcion: "Suscripciones" },
  editando: null, // { id, propio: bool }

  // ---------- Reglas (campos.js: ReglasPago) ----------
  version: (p, f) => ReglasPago.version(p, f),
  pausado: (p, f) => ReglasPago.pausado(p, f),
  cancelado: (p, f) => ReglasPago.cancelado(p, f),
  activo: (p, f) => ReglasPago.activo(p, f),
  estado(p, fecha = hoy()) {
    if (this.cancelado(p, fecha)) return "cancelado";
    if (this.pausado(p, fecha)) return "pausado";
    if (!this.version(p, fecha)) return "empieza";
    return "activo";
  },

  // ---------- Lo que se muestra ----------
  deDatos() {
    return this.PROPIOS_DE_DATOS.map(def => {
      const g = Datos.actual.gastosFijos.find(x => x.id === def.id);
      if (!g) return null;
      return { ...def, nombre: g.id === "renta" ? "Renta" : g.nombre, monto: Vencimientos.montoEn(g, hoy()), venceDia: g.venceDia,
               variable: g.id === "luz" ? g.variable !== false : !!g.variable, grupo: "esencial", deDatos: true, estado: "activo" };
    }).filter(Boolean);
  },

  propios() {
    const f = hoy();
    return Almacen.leerPagosPropios().map(p => {
      const v = this.version(p, f) || (p.versiones || [])[0] || { monto: 0, venceDia: 1 };
      return { ...p, monto: v.monto, venceDia: v.venceDia, estado: this.estado(p, f), desde: (p.versiones || [])[0]?.desde };
    });
  },

  lista(grupo) {
    const orden = { activo: 0, empieza: 1, pausado: 2, cancelado: 3 };
    const propios = this.propios().filter(p => p.grupo === grupo)
      .sort((a, b) => orden[a.estado] - orden[b.estado] || a.venceDia - b.venceDia || a.nombre.localeCompare(b.nombre));
    return grupo === "esencial" ? [...this.deDatos(), ...propios] : propios;
  },

  total(lista) {
    return redondear(lista.filter(p => p.estado === "activo").reduce((s, p) => s + p.monto, 0));
  },

  textoEstado(p) {
    if (p.estado === "pausado") return "No cuenta en tus números mientras esté pausada";
    if (p.estado === "cancelado") return `Ya no cuenta desde el ${fechaCorta(p.canceladoDesde)}`;
    if (p.estado === "empieza") return `Empieza el ${fechaCorta(p.desde)}`;
    if (p.variable) {
      const d = this.delMes(p);
      if (d) return `Vence el día ${p.venceDia} · ${d.recibo ? `recibo de ${this.nombreMes(d.mes).split(" ")[0]}` : d.promedio ? `estimado (promedio de ${d.promedio} ${d.promedio === 1 ? "recibo" : "recibos"})` : "varía cada mes · estimado"}`;
    }
    return `Vence el día ${p.venceDia} · ${p.variable ? "Varía cada mes" : "Fijo"}`;
  },

  abrir() {
    document.querySelectorAll("main.contenedor").forEach(x => { x.hidden = true; });
    $("pantalla-pagosfijos").hidden = false;
    window.scrollTo(0, 0);
    this.mostrar();
  },

  cerrar() {
    $("pantalla-pagosfijos").hidden = true;
    $("pantalla-inicio").hidden = false;
    window.scrollTo(0, 0);
  },

  fila(p) {
    const apagado = p.estado === "pausado" || p.estado === "cancelado";
    const marca = p.estado === "pausado" ? `<span class="pf-marca">Pausada</span>`
      : p.estado === "cancelado" ? `<span class="pf-marca">Cancelada</span>` : "";
    return `
      <li>
        <button class="pf-fila ${apagado ? "apagado" : ""}" data-pf-abrir="${escapar(p.id)}"
          aria-label="${escapar(p.nombre)}, ${dinero(p.monto)} al mes. ${escapar(this.textoEstado(p))}. Editar">
          <span class="pf-info">
            <span class="pf-nombre">${escapar(p.nombre)} ${marca}</span>
            <span class="pf-sub">${escapar(this.textoEstado(p))}</span>
          </span>
          <span class="pf-monto">${(() => { const d = !apagado && this.delMes(p); return d ? `${d.estimado ? "≈ " : ""}${dineroCorto(d.monto)}` : dineroCorto(p.monto); })()}</span>
          <svg class="pf-flecha" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
        </button>
      </li>`;
  },

  mostrar() {
    if ($("pantalla-pagosfijos").hidden) return;
    const es = this.lista("esencial"), su = this.lista("suscripcion");
    const tEs = this.total(es), tSu = this.total(su);
    $("ceja-pagosfijos").textContent = `${dineroCorto(redondear(tEs + tSu))} al mes`;
    const ahorro = redondear(su.filter(p => p.estado === "pausado" || p.estado === "cancelado").reduce((s, p) => s + p.monto, 0));
    $("pf-esenciales").innerHTML = `
      <div class="pf-cabeza"><h2>Esenciales</h2><span class="pf-total">${dineroCorto(tEs)} <small>al mes</small></span></div>
      <p class="pf-ayuda">Lo que necesitas para vivir. Va primero cuando el dinero no alcanza.</p>
      <ul class="pf-lista">${es.map(p => this.fila(p)).join("")}</ul>
      <button class="boton-chico pf-agregar" data-pf-agregar="esencial">+ Agregar esencial</button>`;
    $("pf-suscripciones").innerHTML = `
      <div class="pf-cabeza"><h2>Suscripciones</h2><span class="pf-total">${dineroCorto(tSu)} <small>al mes</small></span></div>
      <p class="pf-ayuda">Lo que podrías pausar o cancelar. Se paga después de lo esencial.</p>
      ${su.length ? `<ul class="pf-lista">${su.map(p => this.fila(p)).join("")}</ul>`
        : `<p class="vacio pf-vacio">Todavía no tienes suscripciones. Agrega Netflix, Spotify o lo que pagues cada mes para que cuente en tus números.</p>`}
      ${ahorro > 0 ? `<p class="pf-ahorro">Pausadas o canceladas: <strong>ahorras ${dineroCorto(ahorro)} al mes</strong>.</p>` : ""}
      <button class="boton-chico pf-agregar" data-pf-agregar="suscripcion">+ Agregar suscripción</button>`;
    this.mostrarOrden();
  },

  // ---------- Recibos (pagos que varían: pagos.js → Recibos) ----------
  // Mes del próximo vencimiento sin pagar de ese pago (o este mes)
  mesProximo(pagoId) {
    const it = Vencimientos.entre(Jornadas.sumarDias(hoy(), -Vencimientos.DIAS_ATRAS), Jornadas.sumarDias(hoy(), 45))
      .find(i => i.id === pagoId && i.partes.some(p => !p.pagado));
    return it ? it.fecha.slice(0, 7) : hoy().slice(0, 7);
  },

  nombreMes(mes) {
    const [a, m] = mes.split("-").map(Number);
    return new Date(a, m - 1, 1).toLocaleDateString("es", { month: "long", year: "numeric" });
  },

  // Lo de este mes en la lista: el recibo si llegó; si no, el estimado
  delMes(p) {
    if (!p.variable || p.estado !== "activo") return null;
    const mes = this.mesProximo(p.id);
    const r = Recibos.monto(p.id, p.monto, mes);
    return { mes, ...r };
  },

  abrirRecibo(pagoId, mes) {
    this.recibo = { pagoId, mes: mes || this.mesProximo(pagoId) };
    abrirFormulario("recibo");
    const r = Recibos.delMes(pagoId, this.recibo.mes);
    if (r) $("f-monto").value = redondear(r.monto).toFixed(2);
    $("form-titulo").textContent = "Llegó el recibo";
    $("form-titulo").dataset.ceja = this.nombreDe(pagoId);
  },

  htmlRecibo() {
    const { pagoId, mes } = this.recibo;
    const luz = pagoId === "luz" ? Datos.actual.gastosFijos.find(g => g.id === "luz") : null;
    const cuota = luz && luz.partes && luz.deudaPlan && Datos.saldoDeuda(luz.deudaPlan) > 0 ? luz.partes.cuotaPlan : 0;
    const [a, m] = mes.split("-").map(Number);
    const meses = [-1, 0, 1].map(k => Resumen.aClave(new Date(a, m - 1 + k, 1)).slice(0, 7));
    const ya = Recibos.delMes(pagoId, mes);
    return `
      <p class="ayuda">Escribe lo que dice el recibo${cuota ? `, <strong>con la cuota del plan (${dinero(cuota)}) incluida</strong>` : ""}.
        Ese mes se usa este número; los meses que todavía no llegan se estiman con el promedio de tus últimos recibos.</p>` +
      campoMonto() + `
      <div class="campo">
        <label for="f-rc-mes">¿De qué mes?</label>
        <select id="f-rc-mes">${meses.map(x => `<option value="${x}" ${x === mes ? "selected" : ""}>${this.nombreMes(x)}</option>`).join("")}</select>
      </div>
      ${ya ? `<div class="pf-acciones"><button type="button" class="boton-chico boton-borrar" data-rc-borrar="${escapar(ya.id)}">Borrar este recibo</button></div>` : ""}`;
  },

  guardarRecibo(error) {
    const { pagoId } = this.recibo;
    const txt = $("f-monto").value.trim();
    const monto = redondear(Number(txt));
    if (txt === "" || !(monto > 0)) return error("Escribe el monto del recibo (mayor que 0).");
    const luz = pagoId === "luz" ? Datos.actual.gastosFijos.find(g => g.id === "luz") : null;
    const cuota = luz && luz.partes && luz.deudaPlan && Datos.saldoDeuda(luz.deudaPlan) > 0 ? luz.partes.cuotaPlan : 0;
    if (cuota && monto < cuota) return error(`El recibo incluye la cuota del plan (${dinero(cuota)}): tiene que ser al menos eso.`);
    const mes = $("f-rc-mes").value;
    Almacen.guardarRecibo({ pagoId, mes, monto });
    this.recibo = null;
    this.listo(`Recibo de ${this.nombreMes(mes).split(" ")[0]}: ${dineroCorto(monto)}`);
  },

  // ---------- Orden de prioridad (campos.js: Prioridad) ----------
  nombreDe(id) {
    if (Prioridad.NOMBRES[id]) {
      const g = Datos.actual.gastosFijos.find(x => x.id === (id === "prestamo" ? Plan.ID_GASTO_PRESTAMO : id));
      return id === "renta" || !g ? Prioridad.NOMBRES[id] : g.nombre;
    }
    const p = Almacen.leerPagosPropios().find(x => x.id === id);
    return p ? p.nombre : id;
  },

  filaOrden(id, nivel, i, total, n) {
    const fija = id === Prioridad.FIJO;
    const p = Almacen.leerPagosPropios().find(x => x.id === id);
    const apagado = p && this.estado(p) !== "activo";
    // Subir/bajar: entre el nivel 1 y el 2 se puede cruzar; la renta no se mueve; las suscripciones solo entre ellas
    const puedeSubir = !fija && !(nivel === 1 && i === 1) && !(nivel === 3 && i === 0);
    const puedeBajar = !fija && !(nivel >= 2 && i === total - 1); // el último del nivel 1 baja al nivel 2
    const aviso = nivel === 2 && Prioridad.AVISOS[id] ? `<span class="pf-orden-aviso">${escapar(Prioridad.AVISOS[id])}</span>` : "";
    const flecha = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d === "arriba" ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"}"/></svg>`;
    return `
      <li class="pf-orden-fila ${apagado ? "apagado" : ""}">
        <span class="pf-orden-num" aria-hidden="true">${n}</span>
        <span class="pf-info">
          <span class="pf-nombre">${escapar(this.nombreDe(id))}${apagado ? ' <span class="pf-marca">Pausada</span>' : ""}</span>
          ${fija ? `<span class="pf-sub">Siempre primero</span>` : aviso}
        </span>
        ${fija ? `<svg class="pf-candado" viewBox="0 0 24 24" aria-label="No se mueve" role="img"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>` : `
        <span class="pf-orden-botones">
          <button class="pf-orden-boton" data-pf-subir="${escapar(id)}" ${puedeSubir ? "" : "disabled"} aria-label="Subir ${escapar(this.nombreDe(id))}">${flecha("arriba")}</button>
          <button class="pf-orden-boton" data-pf-bajar="${escapar(id)}" ${puedeBajar ? "" : "disabled"} aria-label="Bajar ${escapar(this.nombreDe(id))}">${flecha("abajo")}</button>
        </span>`}
      </li>`;
  },

  mostrarOrden() {
    const n = Prioridad.niveles();
    let k = 0;
    const grupo = (titulo, ayuda, lista, nivel) => `
      <h3 class="pf-orden-titulo">${titulo}</h3>
      <p class="pf-ayuda">${ayuda}</p>
      ${lista.length ? `<ol class="pf-lista pf-orden">${lista.map((id, i) => this.filaOrden(id, nivel, i, lista.length, ++k)).join("")}</ol>`
        : `<p class="vacio pf-vacio">Nada en este nivel.</p>`}`;
    $("pf-orden").innerHTML = `
      <div class="pf-cabeza"><h2>Qué se paga primero</h2></div>
      <p class="pf-ayuda">Cuando el dinero no alcanza, la app cubre en este orden. Sube o baja cada pago; entre el nivel 1 y el 2 puedes pasar de uno a otro.</p>
      ${grupo("Nivel 1 · No se atrasa", "Se cubre antes que todo lo demás.", n.n1, 1)}
      ${grupo("Nivel 2 · Se puede mover o dividir", "Si no alcanza, la app te propone moverlo o pagarlo en partes.", n.n2, 2)}
      ${grupo("Nivel 3 · Suscripciones", "Siempre al final. Si no alcanza, lo primero es pausarlas.", n.n3, 3)}
      ${Prioridad.cambiado() ? `<button class="boton-chico pf-agregar" data-pf-orden-normal>Volver al orden de siempre</button>` : ""}`;
  },

  moverOrden(id, dir) {
    const n = Prioridad.niveles();
    const l1 = n.n1.slice(1), l2 = n.n2.slice(), l3 = n.n3.slice();
    const cambiar = (l, i, j) => { [l[i], l[j]] = [l[j], l[i]]; };
    let i;
    if ((i = l3.indexOf(id)) >= 0) {
      const j = i + dir; if (j < 0 || j >= l3.length) return; cambiar(l3, i, j);
    } else if ((i = l1.indexOf(id)) >= 0) {
      if (dir > 0 && i === l1.length - 1) { l1.splice(i, 1); l2.unshift(id); } // pasa al nivel 2
      else { const j = i + dir; if (j < 0) return; cambiar(l1, i, j); }
    } else if ((i = l2.indexOf(id)) >= 0) {
      if (dir < 0 && i === 0) { l2.splice(i, 1); l1.push(id); } // pasa al nivel 1 (debajo de lo que ya está, nunca sobre la renta)
      else { const j = i + dir; if (j >= l2.length) return; cambiar(l2, i, j); }
    } else return;
    Prioridad.guardar({ n1: l1, n2: l2, n3: l3 });
    this.despuesDeOrden(id, dir);
  },

  despuesDeOrden(id, dir) {
    Datos.recargar();
    window.dispatchEvent(new Event("movimientos-cambiaron"));
    Pantalla.actualizar();
    this.mostrar();
    // El foco se queda en el mismo botón para seguir moviendo con el teclado o el lector de pantalla
    const b = document.querySelector(`[data-pf-${dir < 0 ? "subir" : "bajar"}="${CSS.escape(id)}"]`);
    if (b && !b.disabled) b.focus();
    Pantalla.aviso(`${this.nombreDe(id)}: nivel ${Prioridad.nivel(id)}`);
  },

  // ---------- Formulario ----------
  abrirEditor(id, grupoNuevo) {
    const deDatos = this.PROPIOS_DE_DATOS.find(x => x.id === id);
    const propio = id ? Almacen.leerPagosPropios().find(x => x.id === id) : null;
    this.editando = id ? { id, deDatos: !!deDatos } : { nuevo: true, grupo: grupoNuevo };
    abrirFormulario("pagoFijo", propio ? { monto: (this.version(propio, hoy()) || propio.versiones[0]).monto } : {});
    const etq = document.querySelector('label[for="f-monto"]');
    if (etq && !deDatos) etq.textContent = "Cuánto pagas al mes";
    const titulo = deDatos ? this.deDatos().find(x => x.id === id).nombre
      : propio ? propio.nombre : grupoNuevo === "suscripcion" ? "Nueva suscripción" : "Nuevo esencial";
    $("form-titulo").textContent = titulo;
    $("form-titulo").dataset.ceja = deDatos || (propio && propio.grupo === "esencial") || grupoNuevo === "esencial" ? "Esencial" : "Suscripción";
  },

  camposDatos(seccion) {
    return CAMPOS_DATOS.filter(c => c.seccion === seccion).map(c => {
      const v = DatosFijos.valorHoy(c);
      const porConfirmar = c.confirmar && c.confirmar(Datos.actual);
      return `<div class="campo ${c.tipo === "sino" ? "pf-sino" : ""}">
          ${c.tipo !== "sino" ? `<label for="df-${c.id}">${c.etiqueta}${porConfirmar ? ' <span class="df-confirmar">por confirmar</span>' : ""}</label>` : ""}
          ${DatosFijos.inputDe(c, v)}
        </div>`;
    }).join("");
  },

  campoDesde(texto = "¿Desde cuándo aplica?") {
    return `<div class="campo">
        <label for="f-pf-aplica">${texto}</label>
        <select id="f-pf-aplica">
          <option value="hoy">Desde hoy</option>
          <option value="mes">Desde el próximo mes</option>
          <option value="fecha">Desde una fecha</option>
        </select>
      </div>
      <div class="campo" id="campo-pf-fecha" hidden>
        <label for="f-pf-fecha">Fecha</label>
        <input id="f-pf-fecha" type="date" value="${hoy()}">
      </div>`;
  },

  fechaDesde() {
    const op = $("f-pf-aplica").value;
    if (op === "mes") { const h = Jornadas.aFecha(hoy()); return Resumen.aClave(new Date(h.getFullYear(), h.getMonth() + 1, 1)); }
    if (op === "fecha") return $("f-pf-fecha").value || null;
    return hoy();
  },

  htmlFormulario() {
    const e = this.editando || {};
    const botonRecibo = id => `<button type="button" class="boton-mediano pf-recibo" data-rc-abrir="${escapar(id)}">Llegó el recibo</button>`;
    if (e.deDatos) {
      const def = this.PROPIOS_DE_DATOS.find(x => x.id === e.id);
      const g = Datos.actual.gastosFijos.find(x => x.id === e.id);
      return (Recibos.varia(g) ? botonRecibo(e.id) : "") + `<p class="ayuda">Viene de tus datos. Lo que cambies aquí aplica desde la fecha que elijas; lo que ya pasó no se recalcula.</p>
        ${this.camposDatos(def.seccion)}${this.campoDesde()}`;
    }
    const p = e.id ? this.propios().find(x => x.id === e.id) : null;
    const grupo = p ? p.grupo : e.grupo;
    const variable = p ? !!p.variable : false;
    const reciboArriba = p && p.variable && p.estado === "activo" ? botonRecibo(p.id) : "";
    const chip = (attr, val, txt, on) => `<button type="button" class="chip" data-${attr}="${val}" aria-pressed="${on}">${txt}</button>`;
    return reciboArriba + `
      <div class="campo">
        <label for="f-pf-nombre">Nombre</label>
        <input id="f-pf-nombre" type="text" maxlength="60" autocomplete="off" value="${p ? escapar(p.nombre) : ""}"
          placeholder="${grupo === "suscripcion" ? "Ej.: Netflix" : "Ej.: Seguro del carro"}">
      </div>` + campoMonto() + `
      <p class="hoja-etiqueta pf-etq" id="pf-etq-monto">El monto</p>
      <div class="chips pf-chips" role="group" aria-labelledby="pf-etq-monto">
        ${chip("pf-variable", "no", "Fijo", !variable)}${chip("pf-variable", "si", "Varía cada mes", variable)}
      </div>
      <div class="campo">
        <label for="f-pf-dia">Día del mes en que vence</label>
        <input id="f-pf-dia" type="number" inputmode="numeric" min="1" max="31" step="1" value="${p ? p.venceDia : ""}" placeholder="Ej.: 20">
      </div>
      <p class="hoja-etiqueta pf-etq" id="pf-etq-grupo">Grupo</p>
      <div class="chips pf-chips" role="group" aria-labelledby="pf-etq-grupo">
        ${chip("pf-grupo", "esencial", "Esencial", grupo === "esencial")}${chip("pf-grupo", "suscripcion", "Suscripción", grupo === "suscripcion")}
      </div>
      <div class="campo">
        <label for="f-pf-categoria">Categoría</label>
        <select id="f-pf-categoria">${CATEGORIAS.map(c => `<option ${(p ? p.categoria : grupo === "suscripcion" ? "Otros" : "Otros") === c ? "selected" : ""}>${c}</option>`).join("")}</select>
      </div>
      <div class="campo">
        <label for="f-pf-nota">Nota <span class="opcional">(opcional)</span></label>
        <input id="f-pf-nota" type="text" maxlength="120" autocomplete="off" value="${p && p.nota ? escapar(p.nota) : ""}">
      </div>
      ${this.campoDesde(p ? "¿Desde cuándo aplica el cambio?" : "¿Desde cuándo lo pagas?")}
      ${p ? `<div class="pf-acciones">
          ${p.estado === "pausado" ? `<button type="button" class="boton-chico" data-pf-reanudar>Reanudar</button>`
            : p.estado !== "cancelado" ? `<button type="button" class="boton-chico" data-pf-pausar>Pausar</button>` : ""}
          ${p.estado !== "cancelado" ? `<button type="button" class="boton-chico boton-borrar" data-pf-cancelar>${p.grupo === "suscripcion" ? "Cancelar suscripción" : "Ya no lo pago"}</button>`
            : `<button type="button" class="boton-chico" data-pf-reanudar>Volver a pagarlo</button>`}
        </div>` : ""}`;
  },

  async guardar(error) {
    const e = this.editando || {};
    const desde = this.fechaDesde();
    if (!desde) return error("Elige desde qué fecha.");
    if (e.deDatos) {
      const def = this.PROPIOS_DE_DATOS.find(x => x.id === e.id);
      const cambios = [];
      for (const c of CAMPOS_DATOS.filter(x => x.seccion === def.seccion)) {
        const r = validarCampo(c, DatosFijos.leerInput(c));
        if (r.error) return error(r.error);
        if (!DatosFijos.iguales(r.valor, DatosFijos.valorHoy(c))) cambios.push({ c, valor: r.valor });
      }
      if (!cambios.length) return error("No cambiaste nada.");
      cambios.forEach(({ c, valor }) => DatosFijos.aplicar(c, valor, desde));
      return this.listo("Guardado");
    }
    const nombre = $("f-pf-nombre").value.trim();
    const montoTxt = $("f-monto").value.trim();
    const monto = redondear(Number(montoTxt));
    const diaTxt = $("f-pf-dia").value.trim();
    const venceDia = Number(diaTxt);
    if (!nombre) return error("Escribe el nombre.");
    if (montoTxt === "" || !(monto > 0)) return error("El monto tiene que ser mayor que 0.");
    if (diaTxt === "" || !Number.isInteger(venceDia) || venceDia < 1 || venceDia > 31) return error("El día tiene que ser un número del 1 al 31.");
    const pulsado = attr => (document.querySelector(`[data-${attr}][aria-pressed="true"]`) || {}).dataset || {};
    const variable = pulsado("pf-variable").pfVariable === "si";
    const grupo = pulsado("pf-grupo").pfGrupo || e.grupo || "esencial";
    const datos = { nombre, grupo, variable, categoria: $("f-pf-categoria").value, nota: $("f-pf-nota").value.trim() };
    if (e.nuevo) {
      Almacen.guardarPagoPropio({ ...datos, versiones: [{ desde, monto, venceDia }], pausas: [], canceladoDesde: null });
      return this.listo(`${nombre} agregado`);
    }
    const p = Almacen.leerPagosPropios().find(x => x.id === e.id);
    const actual = this.version(p, desde) || p.versiones[0];
    let versiones = p.versiones;
    if (actual.monto !== monto || actual.venceDia !== venceDia) {
      // Si empieza después de la fecha elegida, se cambia la primera versión (todavía no se cobró nada)
      if (!this.version(p, desde)) versiones = [{ desde, monto, venceDia }, ...p.versiones.slice(1)];
      else versiones = [...p.versiones.filter(v => v.desde !== desde), { desde, monto, venceDia }].sort((a, b) => a.desde.localeCompare(b.desde));
    }
    Almacen.guardarPagoPropio({ ...p, ...datos, versiones });
    this.listo("Guardado");
  },

  async pausar() {
    const p = Almacen.leerPagosPropios().find(x => x.id === this.editando.id);
    const desde = this.fechaDesde() || hoy();
    Almacen.guardarPagoPropio({ ...p, pausas: [...(p.pausas || []).filter(x => x.hasta), { desde, hasta: null }] });
    this.listo(`${p.nombre} pausado`);
  },

  async reanudar() {
    const p = Almacen.leerPagosPropios().find(x => x.id === this.editando.id);
    const f = hoy();
    Almacen.guardarPagoPropio({ ...p, canceladoDesde: null,
      pausas: (p.pausas || []).map(x => x.hasta ? x : { ...x, hasta: f }).filter(x => x.hasta > x.desde) });
    this.listo(`${p.nombre} activo otra vez`);
  },

  async cancelar() {
    const p = Almacen.leerPagosPropios().find(x => x.id === this.editando.id);
    const monto = (this.version(p, hoy()) || p.versiones[0]).monto;
    const ok = await preguntar(`¿Ya no pagas ${p.nombre}?\nDeja de contar desde hoy y ahorras ${dinero(monto)} al mes. Lo que ya pagaste se queda en tu historial.`,
      p.grupo === "suscripcion" ? "Sí, cancelar" : "Sí, ya no lo pago", "Volver");
    if (!ok) return;
    // Si todavía no había empezado, se borra (no hay nada que guardar)
    if (!this.version(p, hoy())) Almacen.borrarPagoPropio(p.id);
    else Almacen.guardarPagoPropio({ ...p, canceladoDesde: hoy() });
    this.listo(`Ahorras ${dineroCorto(monto)} al mes`);
  },

  listo(texto) {
    this.editando = null;
    cerrarFormulario();
    Datos.recargar();
    window.dispatchEvent(new Event("movimientos-cambiaron"));
    Pantalla.actualizar();
    this.mostrar();
    Pantalla.aviso(texto);
  },

  iniciar() {
    $("abrir-pagosfijos").addEventListener("click", () => this.abrir());
    $("volver-pagosfijos").addEventListener("click", () => this.cerrar());
    $("pantalla-pagosfijos").addEventListener("click", e => {
      const a = e.target.closest("[data-pf-abrir]"); if (a) return this.abrirEditor(a.dataset.pfAbrir);
      const n = e.target.closest("[data-pf-agregar]"); if (n) return this.abrirEditor(null, n.dataset.pfAgregar);
      const s = e.target.closest("[data-pf-subir]"); if (s) return this.moverOrden(s.dataset.pfSubir, -1);
      const bj = e.target.closest("[data-pf-bajar]"); if (bj) return this.moverOrden(bj.dataset.pfBajar, 1);
      if (e.target.closest("[data-pf-orden-normal]")) {
        Prioridad.porDefecto(); Datos.recargar(); window.dispatchEvent(new Event("movimientos-cambiaron")); Pantalla.actualizar(); this.mostrar();
        Pantalla.aviso("Orden de siempre");
      }
    });
    $("form-campos").addEventListener("click", async e => {
      const rb = e.target.closest("[data-rc-borrar]");
      if (rb && formularioAbierto === "recibo") {
        if (!(await preguntar("¿Borrar este recibo? Ese mes vuelve a usar el estimado.", "Sí, borrar", "Volver"))) return;
        Almacen.borrarRecibo(rb.dataset.rcBorrar); this.recibo = null; return this.listo("Recibo borrado");
      }
      if (formularioAbierto !== "pagoFijo") return;
      const ch = e.target.closest("[data-pf-variable], [data-pf-grupo]");
      if (ch) {
        const attr = ch.hasAttribute("data-pf-variable") ? "data-pf-variable" : "data-pf-grupo";
        document.querySelectorAll(`[${attr}]`).forEach(b => b.setAttribute("aria-pressed", b === ch));
        if (attr === "data-pf-grupo") $("form-titulo").dataset.ceja = ch.dataset.pfGrupo === "esencial" ? "Esencial" : "Suscripción";
      }
      if (e.target.closest("[data-pf-pausar]")) this.pausar();
      if (e.target.closest("[data-pf-reanudar]")) this.reanudar();
      if (e.target.closest("[data-pf-cancelar]")) this.cancelar();
      const ra = e.target.closest("[data-rc-abrir]"); if (ra) this.abrirRecibo(ra.dataset.rcAbrir);
    });
    $("form-campos").addEventListener("change", e => {
      if (e.target.id === "f-pf-aplica") $("campo-pf-fecha").hidden = e.target.value !== "fecha";
    });
    window.addEventListener("movimientos-cambiaron", () => this.mostrar());
  }
};

Formularios.recibo = {
  titulo: "Llegó el recibo",
  campos: () => PagosFijos.htmlRecibo(),
  guardar: error => PagosFijos.guardarRecibo(error)
};

Formularios.pagoFijo = {
  titulo: "Pago fijo",
  campos: () => PagosFijos.htmlFormulario(),
  guardar: error => PagosFijos.guardar(error)
};

if (Datos.actual) PagosFijos.iniciar();
