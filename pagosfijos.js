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

  // ---------- Reglas de un pago propio en una fecha ----------
  version(p, fecha) {
    const vs = (p.versiones || []).filter(v => v.desde <= fecha).sort((a, b) => a.desde.localeCompare(b.desde));
    return vs.length ? vs[vs.length - 1] : null;
  },
  pausado(p, fecha) {
    return (p.pausas || []).some(x => fecha >= x.desde && (!x.hasta || fecha < x.hasta));
  },
  cancelado(p, fecha) {
    return !!p.canceladoDesde && fecha >= p.canceladoDesde;
  },
  activo(p, fecha) {
    return !!this.version(p, fecha) && !this.pausado(p, fecha) && !this.cancelado(p, fecha);
  },
  estado(p, fecha = hoy()) {
    if (this.cancelado(p, fecha)) return "cancelado";
    if (this.pausado(p, fecha)) return "pausado";
    if (!this.version(p, fecha)) return "empieza";
    return "activo";
  },

  // El pago propio como un gasto fijo más (la forma que usan Plan y Vencimientos)
  comoGasto(p, fecha) {
    const v = this.version(p, fecha);
    return { id: p.id, nombre: p.nombre, monto: v.monto, frecuencia: "mensual", venceDia: v.venceDia,
             grupo: p.grupo, variable: !!p.variable, categoria: p.categoria || "Otros", propio: true, permite_mover: true };
  },

  // Vencimiento de un pago propio en un mes (el día y el monto que valen ese día), o null
  vencimientoEnMes(p, año, mes) {
    const ultimo = Resumen.aClave(new Date(año, mes + 1, 0));
    const v0 = this.version(p, ultimo);
    if (!v0) return null;
    let fecha = Vencimientos.fechaDelMes(año, mes, v0.venceDia);
    const v = this.version(p, fecha);
    if (!v) return null;
    if (v.venceDia !== v0.venceDia) fecha = Vencimientos.fechaDelMes(año, mes, v.venceDia);
    if (!this.activo(p, fecha)) return null;
    return { fecha, monto: v.monto };
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
          <span class="pf-monto">${p.variable && !apagado ? "≈ " : ""}${dineroCorto(p.monto)}</span>
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
    if (e.deDatos) {
      const def = this.PROPIOS_DE_DATOS.find(x => x.id === e.id);
      return `<p class="ayuda">Viene de tus datos. Lo que cambies aquí aplica desde la fecha que elijas; lo que ya pasó no se recalcula.</p>
        ${this.camposDatos(def.seccion)}${this.campoDesde()}`;
    }
    const p = e.id ? this.propios().find(x => x.id === e.id) : null;
    const grupo = p ? p.grupo : e.grupo;
    const variable = p ? !!p.variable : false;
    const chip = (attr, val, txt, on) => `<button type="button" class="chip" data-${attr}="${val}" aria-pressed="${on}">${txt}</button>`;
    return `
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
    });
    $("form-campos").addEventListener("click", e => {
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
    });
    $("form-campos").addEventListener("change", e => {
      if (e.target.id === "f-pf-aplica") $("campo-pf-fecha").hidden = e.target.value !== "fecha";
    });
    window.addEventListener("movimientos-cambiaron", () => this.mostrar());
  }
};

Formularios.pagoFijo = {
  titulo: "Pago fijo",
  campos: () => PagosFijos.htmlFormulario(),
  guardar: error => PagosFijos.guardar(error)
};

if (Datos.actual) PagosFijos.iniciar();
