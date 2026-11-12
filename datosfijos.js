/*
 * DATOS FIJOS (Bloque 17)
 * Pantalla para editar mis cifras sin tocar mis-datos.json.
 * Cada cambio se guarda en el dispositivo con "desde cuándo aplica"; lo anterior no se recalcula.
 * Las pantallas leen las cifras a través de Datos.enFecha / proyeccion.js.
 */
const DatosFijos = {
  SECCIONES: [
    { id: "ingresos", titulo: "Ingresos" },
    { id: "prestamos", titulo: "Préstamos" },
    { id: "colchon", titulo: "Colchón" },
    { id: "comida", titulo: "Comida y transporte" }
  ],

  // Renta, luz, internet y teléfono se cambian en Más → Pagos fijos (con las mismas cifras de aquí)
  EN_PAGOS_FIJOS: { renta: "Renta", luz: "Luz", internet: "Internet", telefono: "Teléfono" },
  tituloSeccion(id) { return (this.SECCIONES.find(s => s.id === id) || {}).titulo || this.EN_PAGOS_FIJOS[id] || id; },

  campo(id) { return CAMPOS_DATOS.find(c => c.id === id); },

  // Valor de un campo hoy, en mis datos originales y en una fecha
  valorHoy(c) { return c.destino ? c.leer() : c.leer(Datos.actual); },
  valorOriginal(c) {
    if (c.id === "colchonPorcentaje") return 50;
    if (c.id === "colchonProteger") return Datos.base.proteger_colchon === true;
    if (c.destino) return null; // el saldo del colchón no tiene "original"
    return c.leer(Datos.base);
  },

  texto(c, v) {
    if (v == null || v === "") return "sin dato";
    if (c.tipo === "sino") return v ? "Sí" : "No";
    if (c.tipo === "dias") return v.length ? v.map(x => x.slice(0, 3)).join(", ") : "ninguno";
    if (c.tipo === "dinero") return dinero(v);
    if (c.tipo === "porcentaje") return `${v}%`;
    if (c.tipo === "fecha") return fechaCorta(v);
    return String(redondear(Number(v)) === Number(v) ? v : Number(v).toFixed(4));
  },

  iguales(a, b) { return JSON.stringify(a) === JSON.stringify(b); },

  // ---------- Pantalla ----------
  abrir() {
    document.querySelectorAll("main.contenedor").forEach(x => { x.hidden = true; });
    $("pantalla-datosfijos").hidden = false;
    $("df-efecto").hidden = true;
    window.scrollTo(0, 0);
    this.mostrar();
  },

  cerrar() {
    $("pantalla-datosfijos").hidden = true;
    $("pantalla-inicio").hidden = false;
    window.scrollTo(0, 0);
  },

  inputDe(c, v) {
    const id = `df-${c.id}`;
    if (c.tipo === "sino") return `<label class="mv-check df-sino"><input id="${id}" type="checkbox" ${v ? "checked" : ""}> ${c.etiqueta}</label>`;
    if (c.tipo === "dias") return `<div class="df-dias" id="${id}" role="group" aria-label="${c.etiqueta}">${DIAS_SEMANA.map(dia =>
      `<label><input type="checkbox" value="${dia}" ${(v || []).includes(dia) ? "checked" : ""}> ${dia.slice(0, 3)}</label>`).join("")}</div>`;
    if (c.tipo === "fecha") return `<input id="${id}" type="date" value="${v || ""}">`;
    return `<input id="${id}" type="number" inputmode="decimal" step="${c.tipo === "proporcion" ? "0.001" : "0.01"}" min="0" value="${v ?? ""}">`;
  },

  leerInput(c) {
    const el = $(`df-${c.id}`);
    if (c.tipo === "sino") return el.checked;
    if (c.tipo === "dias") return [...el.querySelectorAll("input:checked")].map(x => x.value);
    return el.value;
  },

  mostrar() {
    if ($("pantalla-datosfijos").hidden) return;
    const programados = Almacen.leerCambiosDatos().filter(x => !x.deshecho && x.desde > hoy());
    // Cada sección se abre y se cierra (la primera empieza abierta); al volver a dibujar se respeta lo que estaba abierto
    const abiertas = new Set([...document.querySelectorAll("#df-secciones details[open]")].map(e => e.dataset.dfSeccion));
    const primeraVez = !document.querySelector("#df-secciones details");
    $("df-secciones").innerHTML = this.SECCIONES.map((s, i) => {
      const campos = CAMPOS_DATOS.filter(c => c.seccion === s.id);
      return `
        <details class="tarjeta df-seccion" data-df-seccion="${s.id}" ${(primeraVez ? i === 0 : abiertas.has(s.id)) ? "open" : ""}>
          <summary><h2>${s.titulo}</h2></summary>
          ${campos.map(c => {
            const v = this.valorHoy(c);
            const o = this.valorOriginal(c);
            const porConfirmar = c.confirmar && c.confirmar(Datos.actual);
            const prog = programados.filter(x => x.campo === c.id).map(x => `${this.texto(c, x.valor)} desde el ${fechaCorta(x.desde)}`);
            return `
              <div class="campo df-campo">
                ${c.tipo !== "sino" ? `<label for="df-${c.id}">${c.etiqueta}${porConfirmar ? ' <span class="df-confirmar">por confirmar</span>' : ""}</label>` : ""}
                ${this.inputDe(c, v)}
                ${c.tipo === "sino" && porConfirmar ? '<span class="df-confirmar">por confirmar</span>' : ""}
                <div class="df-original">
                  ${o !== null ? `Original: ${this.texto(c, o)}` : ""}
                  ${o !== null && !this.iguales(o, v) ? `<button class="enlace" data-df-original="${c.id}">Volver al valor original</button>` : ""}
                  ${prog.length ? `<div class="df-programado">Programado: ${prog.join(", ")}</div>` : ""}
                </div>
              </div>`;
          }).join("")}
          ${s.id === "renta" ? `<p class="df-original">El acuerdo de pago de la renta atrasada ahora está en Mis deudas → Renta → "Planear pagos".</p>` : ""}
          <div class="df-aplica">
            <label for="df-aplica-${s.id}">¿Desde cuándo aplica?</label>
            <select id="df-aplica-${s.id}" data-df-aplica="${s.id}">
              <option value="hoy">Desde hoy</option>
              <option value="mes">Desde el próximo mes</option>
              <option value="fecha">Desde una fecha</option>
            </select>
            <input id="df-fecha-${s.id}" type="date" hidden>
          </div>
          <p id="df-error-${s.id}" class="error df-error"></p>
          <button class="boton-chico lleno df-guardar" data-df-guardar="${s.id}">Guardar</button>
        </details>`;
    }).join("");
    this.mostrarHistorial();
  },

  // ---------- Acuerdo de pago de la renta (opcional) ----------
  // Montos y fechas acordados con la administradora: la cuenta los usa en lugar del día 15.
  filaAcuerdo(p = {}) {
    return `<div class="df-acuerdo-fila">
        <input type="date" data-ac-fecha value="${p.fecha || ""}" aria-label="Fecha del pago">
        <input type="number" inputmode="decimal" step="0.01" min="0" data-ac-monto value="${p.monto ?? ""}" placeholder="0.00" aria-label="Monto">
        <button class="borrar" data-ac-quitar aria-label="Quitar">✕</button>
      </div>`;
  },

  htmlAcuerdo() {
    const lista = Almacen.leer("acuerdoRenta") || [];
    return `
      <div class="df-acuerdo">
        <h3 class="pc-sub">Acuerdo de pago (opcional)</h3>
        <p class="df-original">Si la administradora te dio fechas y montos, ponlos aquí: se usan en lugar del día 15.</p>
        <div id="df-acuerdo-filas">${(lista.length ? lista : [{}]).map(p => this.filaAcuerdo(p)).join("")}</div>
        <button class="enlace" data-ac-agregar>+ Agregar pago</button>
        <p id="df-error-acuerdo" class="error df-error"></p>
        <button class="boton-chico df-guardar" data-ac-guardar>Guardar acuerdo</button>
      </div>`;
  },

  guardarAcuerdo() {
    const error = $("df-error-acuerdo");
    error.textContent = "";
    const lista = [];
    for (const fila of document.querySelectorAll(".df-acuerdo-fila")) {
      const fecha = fila.querySelector("[data-ac-fecha]").value;
      const txt = fila.querySelector("[data-ac-monto]").value.trim();
      if (!fecha && txt === "") continue;
      const monto = Number(txt);
      if (!fecha) return (error.textContent = "Cada pago del acuerdo necesita su fecha.");
      if (txt === "" || !(monto > 0)) return (error.textContent = "Cada pago del acuerdo tiene que ser mayor que 0.");
      lista.push({ fecha, monto: redondear(monto) });
    }
    lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const antes = this.foto();
    Almacen.guardar("acuerdoRenta", lista);
    this.listo(antes);
  },

  mostrarHistorial() {
    const lista = Almacen.leerCambiosDatos().slice().reverse();
    $("df-historial").innerHTML = lista.length === 0
      ? `<p class="vacio">Todavía no has cambiado ninguna cifra.</p>`
      : lista.map(x => {
          const c = this.campo(x.campo);
          if (!c) return "";
          const seccion = this.tituloSeccion(c.seccion);
          return `
            <li class="${x.deshecho ? "df-deshecho" : ""}">
              <div class="mov-info">
                <div class="mov-tipo">${seccion}: ${c.etiqueta}${x.original ? " (valor original)" : ""}</div>
                <div class="mov-detalle">${this.texto(c, x.anterior)} → <strong>${this.texto(c, x.valor)}</strong> · desde el ${fechaCorta(x.desde)}</div>
                <div class="mov-detalle">Cambiado el ${fechaCorta(Resumen.aClave(new Date(x.creado)))}${x.deshecho ? " · deshecho" : ""}</div>
              </div>
              ${x.deshecho ? "" : `<button class="boton-chico" data-df-deshacer="${x.id}">Deshacer</button>`}
            </li>`;
        }).join("");
  },

  // ---------- Guardar ----------
  fechaDesde(seccion) {
    const op = $(`df-aplica-${seccion}`).value;
    if (op === "mes") {
      const h = Jornadas.aFecha(hoy());
      return Resumen.aClave(new Date(h.getFullYear(), h.getMonth() + 1, 1));
    }
    if (op === "fecha") return $(`df-fecha-${seccion}`).value || null;
    return hoy();
  },

  // Cómo está el mes (con las mismas cuentas de proyeccion.js)
  foto() {
    const pr = Proyeccion.calcular();
    let bajo = null;
    Object.keys(pr.porDia).forEach(f => { if (!bajo || pr.porDia[f].saldoFin < bajo.saldo) bajo = { fecha: f, saldo: pr.porDia[f].saldoFin }; });
    const d = Proyeccion.planDeudas();
    return { bajo, renta: d.rentaCero, colchon: d.colchonLleno, amigo: d.amigoCero };
  },

  async guardar(seccion) {
    const error = $(`df-error-${seccion}`);
    error.textContent = "";
    const desde = this.fechaDesde(seccion);
    if (!desde) return (error.textContent = "Elige desde qué fecha aplica.");
    const cambios = [];
    for (const c of CAMPOS_DATOS.filter(x => x.seccion === seccion)) {
      const r = validarCampo(c, this.leerInput(c));
      if (r.error) return (error.textContent = r.error);
      if (!this.iguales(r.valor, this.valorHoy(c))) cambios.push({ c, valor: r.valor });
    }
    if (!cambios.length) return (error.textContent = "No cambiaste ninguna cifra en esta sección.");
    const antes = this.foto();
    cambios.forEach(({ c, valor }) => this.aplicar(c, valor, desde));
    this.listo(antes);
  },

  aplicar(c, valor, desde, original = false) {
    if (c.destino) {
      // Colchón del plan: aplica ya (no tiene fecha)
      const anterior = c.leer();
      c.escribir(valor);
      Almacen.agregarCambioDatos({ campo: c.id, valor, anterior, desde: hoy(), destino: c.destino, original });
    } else {
      const anterior = c.leer(Datos.enFecha(desde));
      Almacen.agregarCambioDatos({ campo: c.id, valor, anterior, desde, original });
    }
  },

  volverOriginal(id) {
    const c = this.campo(id);
    const antes = this.foto();
    this.aplicar(c, this.valorOriginal(c), hoy(), true);
    this.listo(antes);
  },

  async deshacer(id) {
    const x = Almacen.leerCambiosDatos().find(y => y.id === id);
    const c = x && this.campo(x.campo);
    if (!c || !(await preguntar(`¿Deshacer el cambio de "${c.etiqueta}"?\n${this.texto(c, x.valor)} vuelve a ${this.texto(c, x.anterior)}.`, "Sí, deshacer"))) return;
    const antes = this.foto();
    if (c.destino) c.escribir(x.anterior);
    Almacen.marcarCambioDeshecho(id);
    this.listo(antes);
  },

  // Recalcula todo y muestra "Guardado. Así cambia tu mes:"
  listo(antes) {
    Datos.recargar();
    window.dispatchEvent(new Event("movimientos-cambiaron"));
    window.dispatchEvent(new Event("jornadas-cambiaron"));
    Pantalla.actualizar();
    const despues = this.foto();
    const f = v => v === "ya" ? "ya está" : v ? Futuro.diaCorto(v) : "más de 2 años";
    const fila = (t, a, b) => `<li><span>${t}</span><span>${a} → <strong>${b}</strong></span></li>`;
    $("df-efecto").hidden = false;
    $("df-efecto").innerHTML = `
      <h2>Guardado. Así cambia tu mes:</h2>
      <ul class="resumen">
        ${fila("Saldo más bajo del mes", `${Futuro.plata(antes.bajo.saldo)} (${Futuro.diaCorto(antes.bajo.fecha)})`, `${Futuro.plata(despues.bajo.saldo)} (${Futuro.diaCorto(despues.bajo.fecha)})`)}
        ${fila("Renta atrasada en cero", f(antes.renta), f(despues.renta))}
        ${fila(`Colchón en ${dinero(Plan.metaColchon())}`, f(antes.colchon), f(despues.colchon))}
        ${fila("Préstamo del amigo en cero", f(antes.amigo), f(despues.amigo))}
      </ul>`;
    this.mostrar();
    Pantalla.aviso("Guardado");
    $("df-efecto").scrollIntoView({ block: "start" });
  },

  iniciar() {
    $("abrir-datosfijos").addEventListener("click", () => this.abrir());
    $("volver-datosfijos").addEventListener("click", () => this.cerrar());
    $("pantalla-datosfijos").addEventListener("click", e => {
      if (e.target.closest("[data-nav]") && typeof Nav !== "undefined") return Nav.ir(e.target.closest("[data-nav]").dataset.nav);
      const g = e.target.closest("[data-df-guardar]"); if (g) this.guardar(g.dataset.dfGuardar);
      const o = e.target.closest("[data-df-original]"); if (o) this.volverOriginal(o.dataset.dfOriginal);
      const d = e.target.closest("[data-df-deshacer]"); if (d) this.deshacer(d.dataset.dfDeshacer);
      if (e.target.closest("[data-ac-agregar]")) $("df-acuerdo-filas").insertAdjacentHTML("beforeend", this.filaAcuerdo());
      const q = e.target.closest("[data-ac-quitar]"); if (q) q.closest(".df-acuerdo-fila").remove();
      if (e.target.closest("[data-ac-guardar]")) this.guardarAcuerdo();
    });
    $("pantalla-datosfijos").addEventListener("change", e => {
      const a = e.target.closest("[data-df-aplica]");
      if (a) $(`df-fecha-${a.dataset.dfAplica}`).hidden = a.value !== "fecha";
    });
  }
};

if (Datos.actual) DatosFijos.iniciar();
