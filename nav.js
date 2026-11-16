/*
 * MENÚ (barra abajo en el teléfono, menú a la izquierda en el computador) y PESTAÑAS
 * Es la misma app: se acomoda sola al tamaño de la pantalla (ver estilos.css).
 * Cada opción del menú llama directo a la función que abre su pantalla.
 */
const Nav = {
  // Sección del menú → función que abre esa pantalla
  SECCIONES: {
    futuro: () => Futuro.abrir(), plan: () => Plan.abrir(), deudas: () => Deudas.abrir(), planeados: () => Planeados.abrirLista(),
    calendario: () => Calendario.abrir(), resumen: () => Resumen.abrir(), movimientos: () => Movimientos.abrir(), datosfijos: () => DatosFijos.abrir(), pagosfijos: () => PagosFijos.abrir(),
    respaldo: () => Respaldo.abrir(), consejero: () => Consejero.abrir(), progreso: () => Xp.abrir(), logros: () => Logros.abrir()
  },
  // Si los datos no cargaron (error), estas no abren nada; Datos fijos, Respaldo, Progreso y Logros sí (Respaldo permite recuperarse)
  NECESITAN_DATOS: ["futuro", "plan", "deudas", "planeados", "calendario", "resumen", "movimientos", "pagosfijos", "consejero"],
  // Pantalla visible → sección marcada en el menú
  MARCA: {
    "pantalla-inicio": "inicio", "pantalla-futuro": "futuro", "pantalla-alcanza": "futuro", "pantalla-escenarios": "futuro",
    "pantalla-prestamo": "futuro", "pantalla-acuerdo": "futuro", "pantalla-mover": "futuro", "pantalla-plan": "plan",
    "pantalla-deudas": "deudas", "pantalla-planeados": "planeados", "pantalla-cuando": "planeados",
    "pantalla-calendario": "calendario", "pantalla-resumen": "resumen", "pantalla-movimientos": "movimientos", "pantalla-datosfijos": "datosfijos", "pantalla-pagosfijos": "pagosfijos", "pantalla-respaldo": "respaldo",
    "pantalla-cubrir": "inicio", "pantalla-consejero": "consejero", "pantalla-progreso": "progreso", "pantalla-logros": "logros"
  },
  EN_MAS: ["consejero", "deudas", "pagosfijos", "planeados", "calendario", "resumen", "movimientos", "datosfijos", "respaldo", "progreso", "logros"],

  visible() {
    const m = [...document.querySelectorAll("main.contenedor")].find(x => !x.hidden);
    return m ? m.id : "pantalla-inicio";
  },

  ir(seccion) {
    this.cerrarHoja();
    if ($("fu-dia")) $("fu-dia").hidden = true;
    document.querySelectorAll("main.contenedor").forEach(x => { x.hidden = true; });
    $("pantalla-inicio").hidden = false;
    window.scrollTo(0, 0);
    if (seccion === "inicio") { Pantalla.actualizar(); this.marcar(); return; } // también arma el resumen
    if (!(Pantalla.sinDatos && this.NECESITAN_DATOS.includes(seccion))) this.SECCIONES[seccion](); // la pantalla se abre (y oculta el inicio)
    this.marcar();
  },

  // Líneas pequeñas sobre los títulos (fecha, semana, mes) — van con lo que se está viendo
  cejas() {
    const f = hoy(), d = Jornadas.aFecha(f);
    const corto = x => x.toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "").replace(",", "");
    if ($("ceja-inicio")) $("ceja-inicio").textContent = corto(d);
    const lunes = Jornadas.aFecha(Plan.claveSemana()), domingo = Jornadas.aFecha(Jornadas.sumarDias(Plan.claveSemana(), 6));
    const dm = x => x.toLocaleDateString("es", { day: "numeric", month: "short" }).replace(/\./g, "");
    if ($("ceja-plan")) $("ceja-plan").textContent = `Semana del ${dm(lunes)}`;
    if ($("ceja-resumen")) $("ceja-resumen").textContent = `Del ${lunes.getDate()} al ${dm(domingo)}`;
    if ($("ceja-calendario")) $("ceja-calendario").textContent = ($("cal-titulo") && $("cal-titulo").textContent) || d.toLocaleDateString("es", { month: "long", year: "numeric" });
    if ($("ceja-planeados") && typeof Almacen !== "undefined" && Almacen.leerPlaneados) {
      const n = Almacen.leerPlaneados().filter(g => !g.borrado && !(typeof Planeados !== "undefined" && Planeados.comprado(g))).length;
      $("ceja-planeados").textContent = n ? `${n} ${n === 1 ? "pendiente" : "pendientes"}` : "Nada pendiente";
    }
  },

  marcar() {
    try { this.cejas(); } catch (e) { /* las cejas son solo texto: nunca deben romper la navegación */ }
    let s = this.MARCA[this.visible()] || "inicio";
    // "¿Cómo lo cubro?" se queda en la sección de donde vino (ej.: Mi futuro)
    if (this.visible() === "pantalla-cubrir" && typeof Cubrir !== "undefined" && Cubrir.origen && Cubrir.origen !== "pantalla-cubrir") s = this.MARCA[Cubrir.origen] || "inicio";
    document.querySelectorAll("[data-nav]").forEach(b => b.classList.toggle("activo", b.dataset.nav === s));
    $("nav-mas").classList.toggle("activo", this.EN_MAS.includes(s));
  },

  // ---------- Menú del +: Gasté, Me pagaron, Deuda, Colchón y los atajos ----------
  menuAbierto() { return $("menu-reg").classList.contains("abierto"); },
  abrirMenuReg() {
    $("menu-reg").classList.add("abierto");
    $("menu-reg").setAttribute("aria-hidden", "false");
    $("nav-registrar").setAttribute("aria-expanded", "true");
    document.querySelectorAll(".menu-reg-op, .menu-reg-atajo").forEach(b => { b.tabIndex = 0; });
  },
  cerrarMenuReg() {
    if (!$("menu-reg")) return;
    $("menu-reg").classList.remove("abierto");
    $("menu-reg").setAttribute("aria-hidden", "true");
    $("nav-registrar").setAttribute("aria-expanded", "false");
    document.querySelectorAll(".menu-reg-op, .menu-reg-atajo").forEach(b => { b.tabIndex = -1; });
  },

  // ---------- Hojas: registrar (una por tipo), "Más" y "Avisos" ----------
  abrirHoja(cual, tipo) {
    this.cerrarMenuReg();
    if (cual === "registrar") { // cada vez empieza limpia
      this.tipoActual = tipo || "gasto";
      $("hoja-monto").value = "";
      $("hoja-nota").value = "";
      $("hoja-horas").value = "";
      this.categoriaHoja = "";
      this.categoriaAuto = false;
      this.deudaHoja = "";
      this.ingresoHoja = "cheque";
      this.ponerCategoriasHoja();
    }
    $("hoja").hidden = false;
    document.querySelector(".hoja-caja").scrollTop = 0; // cada hoja empieza arriba
    this.bloquearFondo();
    $("aviso").hidden = true;
    $("hoja-registrar").hidden = cual !== "registrar";
    $("hoja-mas").hidden = cual !== "mas";
    $("hoja-avisos").hidden = cual !== "avisos";
    $("hoja-acuerdos").hidden = cual !== "acuerdos";
    $("hoja-liberado").hidden = cual !== "liberado";
    $("hoja-dia").hidden = cual !== "dia";
    $("hoja").classList.toggle("con-dia", cual === "dia"); // la hoja del día deja libre arriba la cuadrícula del calendario
    $("hoja-explica").hidden = cual !== "explica";
    if (cual === "avisos") { try { if (typeof Xp !== "undefined") Xp.revisoAvisos(); } catch (e) { /* el XP nunca debe romper los avisos */ } }
    $("hoja-titulo-barra").textContent = cual === "registrar" ? this.tituloHoja() : cual === "explica" ? tipo : { mas: "Más", avisos: "Avisos", acuerdos: "Acuerdos", liberado: "Dinero que se libera", dia: "Detalle del día" }[cual] || "";
    // No se enfoca el monto solo: el teclado se abre cuando tocas el campo
  },

  tipoActual: "gasto",
  categoriaHoja: "",
  categoriaAuto: false, // true = la categoría la puso la app según la nota (se puede cambiar); false = la elegiste tú
  deudaHoja: "",
  ingresoHoja: "cheque",
  tipoHoja() { return this.tipoActual || "gasto"; },
  tituloHoja() { return { gasto: "Gasté", ingreso: "Me pagaron", pagoDeuda: "Deuda", colchon: "Colchón" }[this.tipoHoja()] || "Registrar"; },

  // Íconos de las categorías (mismo trazo que los atajos)
  ICONOS_CAT: {
    "Comida": '<path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 1-3 3-3 6v3h3v9"/>',
    "Transporte": '<rect x="6" y="3.5" width="12" height="13" rx="3"/><path d="M6 10h12"/><path d="M9 16.5 7 20.5M15 16.5l2 4"/>',
    "Teléfono": '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    "Luz": '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    "Internet": '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.2" r=".8"/>',
    "Hijos": '<circle cx="9" cy="7" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9.5" r="2.2"/><path d="M14.5 15.5a4 4 0 0 1 6.5 3.5"/>',
    "Otros": '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>'
  },

  // Cada tipo muestra solo lo suyo
  ponerCategoriasHoja() {
    const t = this.tipoHoja();
    $("hoja-titulo-barra").textContent = this.tituloHoja();
    $("hoja-nota").placeholder = t === "ingreso" ? "Ej.: propina, venta, regalo" : "Ej.: Uber Eats, súper, taxi";
    $("hoja-ingreso").hidden = t !== "ingreso";
    $("hoja-deuda-campo").hidden = t !== "pagoDeuda";
    $("hoja-renta-campo").hidden = true;
    if (t === "ingreso") this.ponerIngresoHoja();
    else $("hoja-nota").closest(".campo").hidden = t !== "gasto";
    if (t === "pagoDeuda") this.llenarDeudasHoja();
    const caja = $("hoja-categorias");
    caja.hidden = t !== "gasto";
    caja.classList.remove("con-error");
    $("hoja-error").textContent = "";
    caja.innerHTML = CATEGORIAS.map(c => `<button type="button" class="chip cat-tile" data-hoja-cat="${c}" aria-pressed="${c === this.categoriaHoja}">` +
      `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${this.ICONOS_CAT[c] || this.ICONOS_CAT.Otros}</svg><span>${c}</span></button>`).join("");
    this.ponerFrecuentesHoja();
    this.textoBotonHoja();
  },

  // Hasta 4 gastos que repites ("Uber Eats · $24.86"): un toque llena monto, categoría y nota (no guarda solo)
  ponerFrecuentesHoja() {
    const caja = $("hoja-frecuentes");
    let lista = [];
    try { if (this.tipoHoja() === "gasto" && typeof Patrones !== "undefined") lista = Patrones.frecuentes(); } catch (e) { /* los atajos nunca deben romper la hoja */ }
    caja.hidden = !lista.length;
    caja.innerHTML = lista.map(f => `<button type="button" class="chip" data-frec-nota="${escapar(f.nota)}" data-frec-cat="${escapar(f.categoria)}" data-frec-monto="${f.monto.toFixed(2)}">${escapar(f.nota)} · ${dinero(f.monto)}</button>`).join("");
  },

  elegirCategoriaHoja(cat, auto) {
    this.categoriaHoja = cat;
    this.categoriaAuto = !!auto;
    document.querySelectorAll("[data-hoja-cat]").forEach(x => x.setAttribute("aria-pressed", x.dataset.hojaCat === cat));
    $("hoja-categorias").classList.remove("con-error"); $("hoja-error").textContent = "";
  },

  // Al escribir la nota, se marca la categoría que más usaste con ella (solo si no elegiste otra tú)
  sugerirCategoriaHoja() {
    if (this.tipoHoja() !== "gasto" || (this.categoriaHoja && !this.categoriaAuto)) return;
    let cat = null;
    try { cat = typeof Patrones !== "undefined" ? Patrones.categoriaDe($("hoja-nota").value) : null; } catch (e) { /* sin sugerencia */ }
    if (cat && CATEGORIAS.includes(cat)) this.elegirCategoriaHoja(cat, true);
    else if (this.categoriaAuto) this.elegirCategoriaHoja("", false);
    this.textoBotonHoja();
  },

  // Me pagaron: Cheque (con horas) u Otro ingreso (con nota)
  ponerIngresoHoja() {
    const otro = this.ingresoHoja === "otro";
    document.querySelectorAll("[data-ing]").forEach(b => b.setAttribute("aria-pressed", b.dataset.ing === this.ingresoHoja));
    $("hoja-horas-campo").hidden = otro;
    $("hoja-nota").closest(".campo").hidden = !otro;
  },

  // Deuda: todas a la vista, con lo que debes; se elige con un toque
  llenarDeudasHoja() {
    const deudas = Datos.deudas().map(d => ({ ...d, saldo: Datos.saldoDeuda(d.id) })).filter(d => d.saldo > 0.005);
    $("hoja-deudas").classList.remove("con-error");
    $("hoja-deudas").innerHTML = deudas.length ? deudas.map(d =>
      `<button type="button" class="deu-fila" role="radio" data-deuda="${d.id}" aria-checked="${d.id === this.deudaHoja}">` +
      `<span class="deu-radio" aria-hidden="true"></span><b>${escapar(d.nombre)}</b><small>debes ${dinero(d.saldo)}</small></button>`).join("")
      : `<p class="vacio">No tienes deudas pendientes.</p>`;
    this.ponerRapidosHoja();
  },

  // "Pagar todo" y "La mitad" de la deuda elegida
  ponerRapidosHoja() {
    const caja = $("hoja-rapidos");
    if (!this.deudaHoja) { caja.hidden = true; caja.innerHTML = ""; return; }
    const saldo = redondear(Datos.saldoDeuda(this.deudaHoja));
    const mitad = redondear(saldo / 2);
    caja.hidden = false;
    caja.innerHTML = `<button type="button" class="chip" data-rapido="${saldo.toFixed(2)}">Pagar todo · ${dinero(saldo)}</button>` +
      (mitad >= 1 ? `<button type="button" class="chip" data-rapido="${mitad.toFixed(2)}">La mitad · ${dinero(mitad)}</button>` : "");
  },

  elegirDeudaHoja(id) {
    this.deudaHoja = id;
    document.querySelectorAll("[data-deuda]").forEach(b => b.setAttribute("aria-checked", b.dataset.deuda === id));
    $("hoja-deudas").classList.remove("con-error");
    if (/deuda/.test($("hoja-error").textContent)) $("hoja-error").textContent = "";
    // La renta: hay que saber si es la del mes que viene o lo atrasado
    const renta = id === Plan.ID_DEUDA_RENTA;
    if (renta) {
      $("hoja-renta-para").innerHTML = '<option value="">Elige…</option>' +
        Proyeccion.rentaMeses(hoy(), Jornadas.sumarDias(hoy(), 62)).filter(c => c.pendiente > 0.005).slice(0, 2).map(c => {
          const mes = Jornadas.aFecha(c.fecha).toLocaleDateString("es", { month: "long" });
          return `<option value="${c.fecha}">Renta de ${mes} (vence el ${fechaCorta(c.fecha)})</option>`;
        }).join("") + '<option value="atrasada">Renta atrasada (lo que ya debías)</option>';
    }
    $("hoja-renta-campo").hidden = !renta;
    this.ponerRapidosHoja();
    this.textoBotonHoja();
  },

  // Lo que falta para poder guardar (null = está todo)
  faltaHoja() {
    const t = this.tipoHoja();
    if (!(Number($("hoja-monto").value) > 0)) return "Escribe el monto";
    if (t === "gasto" && !this.categoriaHoja) return "Elige una categoría";
    if (t === "pagoDeuda" && !this.deudaHoja) return "Elige a cuál deuda";
    if (t === "pagoDeuda" && !$("hoja-renta-campo").hidden && !$("hoja-renta-para").value) return "Elige para qué es la renta";
    return null;
  },

  // El botón dice lo que va a guardar, o lo que falta (y se ve apagado)
  textoBotonHoja() {
    const m = Number($("hoja-monto").value);
    const b = $("hoja-continuar");
    const falta = this.faltaHoja();
    b.classList.toggle("falta", !!falta);
    if (falta) { b.textContent = falta; return; }
    const t = this.tipoHoja();
    if (t === "colchon") b.textContent = `Poner ${dinero(m)} en el colchón`;
    else if (t === "pagoDeuda") {
      const d = Datos.deudas().find(x => x.id === this.deudaHoja);
      b.textContent = `Pagar ${dinero(m)}${d ? ` · ${d.nombre}` : ""}`;
    } else if (t === "ingreso") b.textContent = `Guardar ${dinero(m)}`;
    else b.textContent = `Guardar ${dinero(m)} en ${this.categoriaHoja}`;
  },

  errorHoja(texto, donde) {
    $("hoja-error").textContent = texto;
    $("hoja-categorias").classList.toggle("con-error", donde === "categoria");
    $("hoja-monto").closest(".campo").classList.toggle("con-error", donde === "monto");
    $("hoja-deudas").classList.toggle("con-error", donde === "deuda");
    $("hoja-renta-para").closest(".campo").classList.toggle("con-error", donde === "renta");
    $("hoja-horas-campo").classList.toggle("con-error", donde === "horas");
    const foco = { monto: $("hoja-monto"), renta: $("hoja-renta-para"), horas: $("hoja-horas"),
      deuda: $("hoja-deudas").querySelector("button"), categoria: $("hoja-categorias").querySelector("button") }[donde];
    if (foco) foco.focus({ preventScroll: true });
  },

  // Guardar desde la hoja: todos usan el mismo guardado de siempre (consejero, "¿ya estaba incluido?"), sin otra pantalla
  guardarHoja() {
    const t = this.tipoHoja();
    const monto = Number($("hoja-monto").value);
    if (!(monto > 0)) return this.errorHoja("Escribe el monto.", "monto");
    const nota = $("hoja-nota").value.trim();
    if (t === "colchon") {
      const error = Plan.aColchon(monto);
      if (error) return this.errorHoja(error, "monto");
      return this.cerrarHoja();
    }
    if (t === "gasto") {
      if (!this.categoriaHoja) return this.errorHoja("Elige una categoría.", "categoria");
      this.cerrarHoja();
      abrirFormulario("gasto", { selector: true, monto, categoria: this.categoriaHoja, nota: nota || undefined });
      return $("formulario").requestSubmit();
    }
    if (t === "ingreso") {
      const otro = this.ingresoHoja === "otro";
      const horasTxt = $("hoja-horas").value.trim().replace(",", ".");
      if (!otro && horasTxt !== "" && !(Number(horasTxt) > 0)) return this.errorHoja("Las horas deben ser mayores que 0, o deja el campo vacío.", "horas");
      this.cerrarHoja();
      abrirFormulario("ingreso", { selector: true, monto, horas: !otro && horasTxt !== "" ? Number(horasTxt) : undefined, nota: otro && nota ? nota : undefined });
      const sel = $("f-tipo-ingreso");
      if (sel) { sel.value = otro ? "otro" : "cheque"; sel.dispatchEvent(new Event("change", { bubbles: true })); }
      if (otro && nota && $("f-nota")) $("f-nota").value = nota;
      return $("formulario").requestSubmit();
    }
    // Deuda
    const deudaId = this.deudaHoja;
    if (!deudaId) return this.errorHoja("Elige a cuál deuda le pagaste.", "deuda");
    const renta = !$("hoja-renta-campo").hidden ? $("hoja-renta-para").value : "";
    if (!$("hoja-renta-campo").hidden && !renta) return this.errorHoja("Elige para qué es: la renta del mes que viene o la renta atrasada.", "renta");
    const saldo = Datos.saldoDeuda(deudaId);
    if (monto > saldo + 0.005) return this.errorHoja(`El monto es mayor que lo que debes en esa deuda (${dinero(saldo)}).`, "monto");
    this.cerrarHoja();
    abrirFormulario("pagoDeuda", { selector: true, monto, deudaId });
    if (renta && $("f-renta-para")) $("f-renta-para").value = renta;
    $("formulario").requestSubmit();
  },

  // Atajos: Transporte, Trabajé hoy, No trabajé hoy y ¿Y si gasto…? (desde el menú del +)
  atajo(que) {
    if (que === "trabaje") Jornadas.abrirFormulario();
    else if (que === "no-trabaje") Jornadas.noTrabajeHoy();
    else if (que === "ysigasto") Planeados.abrirTemporal(null, hoy(), this.visible());
    else abrirFormulario(que, ["gasto", "ingreso", "pagoDeuda"].includes(que) ? { selector: true } : {});
  },

  // volver = true (Cerrar, tocar afuera o arrastrar): desde una hoja de registrar se vuelve al menú del + abierto
  cerrarHoja(volver) {
    if (!$("hoja")) return;
    const deRegistro = !$("hoja").hidden && !$("hoja-registrar").hidden;
    $("hoja").hidden = true;
    this.liberarFondo();
    if (volver && deRegistro) this.abrirMenuReg();
  },

  // Mientras hay una hoja abierta, la página de atrás queda quieta (no se puede mover).
  // Así el iPhone no la desplaza al abrir el teclado (eso empujaba la hoja de Colchón debajo del teclado).
  bloquearFondo() {
    if (this._fondoY != null) return;
    const y = window.scrollY;
    this._fondoY = y;
    document.documentElement.style.setProperty("--hoja-origen", `${y + 40}px`);
    Object.assign(document.body.style, { position: "fixed", top: `-${y}px`, left: "0", right: "0", width: "100%" });
    document.body.classList.add("hoja-abierta");
  },
  liberarFondo() {
    if (this._fondoY == null) return;
    const y = this._fondoY;
    this._fondoY = null;
    Object.assign(document.body.style, { position: "", top: "", left: "", right: "", width: "" });
    document.body.classList.remove("hoja-abierta");
    window.scrollTo(0, y);
  },

  // Como en el iPhone: se arrastra desde la barra de arriba; un tirón rápido o pasar un tercio la cierra
  arrastreHoja() {
    const caja = document.querySelector(".hoja-caja"), barra = document.querySelector(".hoja-barra");
    let inicio = null;
    const fin = e => {
      if (!inicio) return;
      const dy = e.clientY - inicio.y, vel = dy / Math.max(1, performance.now() - inicio.t);
      inicio = null;
      caja.style.transition = "";
      caja.style.transform = "";
      if (dy > 8 && (dy > caja.offsetHeight / 3 || vel > 0.11)) this.cerrarHoja(true);
    };
    barra.addEventListener("pointerdown", e => {
      if (e.target.closest("button") || window.innerWidth >= 900 || e.button > 0) return;
      inicio = { y: e.clientY, t: performance.now() };
      barra.setPointerCapture(e.pointerId);
      caja.style.transition = "none";
    });
    barra.addEventListener("pointermove", e => {
      if (!inicio) return;
      const dy = e.clientY - inicio.y;
      // hacia abajo sigue al dedo; hacia arriba casi no se mueve (como al topar con algo)
      caja.style.transform = `translateY(${dy > 0 ? dy : -Math.sqrt(-dy) * 2}px)`;
    });
    barra.addEventListener("pointerup", fin);
    barra.addEventListener("pointercancel", fin);
  },

  iniciar() {
    document.body.classList.add("con-nav");
    $("nav").hidden = false;
    $("campana").hidden = false;
    $("nav").addEventListener("click", e => {
      const b = e.target.closest("[data-nav]");
      if (e.target.closest("#nav-registrar")) { this.menuAbierto() ? this.cerrarMenuReg() : this.abrirMenuReg(); return; }
      this.cerrarMenuReg();
      if (b) this.ir(b.dataset.nav);
      if (e.target.closest("#nav-mas")) this.abrirHoja("mas");
    });
    $("menu-reg").addEventListener("click", e => {
      const op = e.target.closest("[data-reg-tipo]");
      if (op) return this.abrirHoja("registrar", op.dataset.regTipo);
      const at = e.target.closest("[data-registrar]");
      if (at) { this.cerrarMenuReg(); return this.atajo(at.dataset.registrar); }
      this.cerrarMenuReg(); // toque en el fondo
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && this.menuAbierto()) { this.cerrarMenuReg(); $("nav-registrar").focus(); } });
    $("hoja-renta-para").addEventListener("change", () => { $("hoja-renta-para").closest(".campo").classList.remove("con-error"); this.textoBotonHoja(); });
    $("hoja-horas").addEventListener("input", () => { $("hoja-horas-campo").classList.remove("con-error"); if (/horas/.test($("hoja-error").textContent)) $("hoja-error").textContent = ""; });
    $("hoja-nota").addEventListener("input", () => this.sugerirCategoriaHoja());
    $("hoja-monto").addEventListener("input", () => {
      // El punto se corre solo, como en una calculadora de caja: 1 → 0.01 · 12 → 0.12 · 123 → 1.23
      const digitos = $("hoja-monto").value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 9);
      $("hoja-monto").value = digitos === "" ? "" : digitos.padStart(3, "0").replace(/(\d{2})$/, ".$1");
      $("hoja-monto").closest(".campo").classList.remove("con-error");
      if (/monto/.test($("hoja-error").textContent)) $("hoja-error").textContent = "";
      this.textoBotonHoja();
    });
    // El fondo se encoge mientras hay una hoja abierta (como en el iPhone), desde donde estás mirando
    this.arrastreHoja();
    // Teclado abierto: la hoja queda pegada al teclado.
    // - Instalada, el iPhone achica la pantalla solo: basta con quitar el margen de la rayita de abajo (lo tapa el teclado).
    // - En Safari, la pantalla no se achica: se sube la hoja lo que mide el teclado.
    const tactil = window.matchMedia("(pointer: coarse)");
    const ajustar = () => {
      const enfocado = document.activeElement && document.activeElement.closest && document.activeElement.closest(".hoja-caja") &&
        document.activeElement.matches("input, textarea, select");
      const vv = window.visualViewport;
      const teclado = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      const conTeclado = !!enfocado && (tactil.matches || teclado > 120);
      // La hoja ocupa justo la parte visible de la pantalla (encima del teclado): lo que no cabe se desplaza por dentro
      const h = $("hoja");
      if (vv && conTeclado) { h.style.top = `${vv.offsetTop}px`; h.style.height = `${vv.height}px`; h.style.bottom = "auto"; }
      else { h.style.top = ""; h.style.height = ""; h.style.bottom = ""; }
      $("hoja").classList.toggle("con-teclado", conTeclado);
      // (ya no se esconde la nota mientras escribes: al quitar el foco todo saltaba y el toque caía en otro lado)
    };
    if (window.visualViewport) { window.visualViewport.addEventListener("resize", ajustar); window.visualViewport.addEventListener("scroll", ajustar); }
    $("hoja").addEventListener("focusin", ajustar);
    $("hoja").addEventListener("focusout", () => setTimeout(ajustar, 60));
    $("hoja").addEventListener("click", e => {
      if (e.target.id === "hoja" || e.target.closest("#hoja-cerrar")) return this.cerrarHoja(true);
      const b = e.target.closest("[data-nav]");
      if (b) return this.ir(b.dataset.nav);
      const c = e.target.closest("[data-hoja-cat]");
      if (c) {
        this.elegirCategoriaHoja(c.dataset.hojaCat, false);
        return this.textoBotonHoja();
      }
      const fr = e.target.closest("[data-frec-nota]");
      if (fr) {
        $("hoja-monto").value = fr.dataset.frecMonto; $("hoja-monto").dispatchEvent(new Event("input"));
        $("hoja-nota").value = fr.dataset.frecNota;
        this.elegirCategoriaHoja(fr.dataset.frecCat, false);
        return this.textoBotonHoja();
      }
      const ing = e.target.closest("[data-ing]");
      if (ing) { this.ingresoHoja = ing.dataset.ing; return this.ponerIngresoHoja(); }
      const deu = e.target.closest("[data-deuda]");
      if (deu) return this.elegirDeudaHoja(deu.dataset.deuda);
      const rap = e.target.closest("[data-rapido]");
      if (rap) { $("hoja-monto").value = rap.dataset.rapido; $("hoja-monto").dispatchEvent(new Event("input")); return; }
      if (e.target.closest("#hoja-continuar")) return this.guardarHoja();
      const r = e.target.closest("[data-registrar]");
      if (!r) return;
      this.cerrarHoja();
      this.atajo(r.dataset.registrar);
    });
    // Se marca la sección cada vez que cambia la pantalla visible
    const obs = new MutationObserver(() => this.marcar());
    document.querySelectorAll("main.contenedor").forEach(m => obs.observe(m, { attributes: true, attributeFilter: ["hidden"] }));
    this.marcar();
  }
};

/* INICIO COMO RESUMEN: la renta del mes y lo libre de esta semana (misma cuenta que Mi futuro y el Plan) */
const Inicio = {
  mostrar() {
    const caja = $("inicio-semana");
    if (!caja || !document.body.classList.contains("con-nav") || $("pantalla-inicio").hidden) return;
    const sem = Plan.semanaReal();
    caja.hidden = false;
    // "Tengo" es el primero de los tres cuadros (es el mismo botón de siempre: se mueve aquí, conserva su id y su toque)
    const kpis = caja.querySelector(".kpis"), tengo = $("dinero-tengo");
    if (tengo && tengo.parentElement !== kpis) kpis.prepend(tengo);
    $("kpi-semana").innerHTML = `
      <button class="kpi kpi-libre" data-explica="libre" aria-label="Libre para lo que quieras: ${dinero(sem.libre)}${sem.llegaLibre > 0.005 ? `, y ${dinero(sem.llegaLibre)} más cuando cobres el ${Futuro.dia(sem.desde)}` : ""}. Ver de dónde sale">
        <span class="kpi-etq">Libre esta semana</span><strong>${dinero(sem.libre)}</strong>${sem.llegaLibre > 0.005
          ? `<span class="kpi-nota">+${dineroCorto(sem.llegaLibre)} el ${Futuro.diaCorto(sem.desde).split(" ")[0]}</span>` : ""}</button>
      <button class="kpi kpi-guardar" data-explica="despues" aria-label="Para después: ${dinero(sem.guardar)}. Ver de dónde sale">
        <span class="kpi-etq">Para después</span><strong>${dinero(sem.guardar)}</strong></button>`;
    this.ajustarCifras();
    if (typeof Avisos !== "undefined") Avisos.mostrar(); // primero: el mensaje de "Hoy" no repite lo que ya dice un aviso urgente
    this.mostrarCierre();
    this.mostrarHoy();
    if (typeof Consejero !== "undefined") Consejero.tarjetaInicio();
  },

  // Cierre de la semana (B4): los lunes, martes y miércoles, una vez por semana, con "Listo" para quitarla
  mostrarCierre(ahora = new Date()) {
    const caja = $("inicio-cierre");
    if (!caja) return;
    caja.hidden = true;
    try {
      const dow = ahora.getDay();
      if (!(dow >= 1 && dow <= 3)) return; // lunes a miércoles
      const c = Patrones.cierreSemana();
      if (!c || Avisos.vistos()["cierre-semana"] === c.desde) return;
      const lineas = [];
      if (c.promedio != null) {
        const dif = redondear(c.gastado - c.promedio);
        lineas.push(`Gastaste ${dineroCorto(c.gastado)} (tu promedio: ${dineroCorto(c.promedio)}). ${dif < -0.005 ? `Bajaste ${dineroCorto(-dif)}: bien.` : dif > 0.005 ? `Subiste ${dineroCorto(dif)}.` : "Igual que siempre."}`);
      } else lineas.push(`Gastaste ${dineroCorto(c.gastado)}.`);
      const total = c.reglas.cumplidas + c.reglas.rotas;
      if (total) lineas.push(`Reglas: ${c.reglas.cumplidas} ${c.reglas.cumplidas === 1 ? "cumplida" : "cumplidas"}${c.reglas.rotas ? `, ${c.reglas.rotas} ${c.reglas.rotas === 1 ? "rota" : "rotas"}` : ""}.`);
      if (c.pagoDeudas > 0.005) lineas.push(`Pagaste ${dineroCorto(c.pagoDeudas)} a tus deudas: tu deuda bajó eso.`);
      caja.dataset.semana = c.desde;
      caja.innerHTML = `<h2>Cierre de la semana · ${Futuro.diaCorto(c.desde).split(" ").slice(1).join(" ")} al ${Futuro.diaCorto(c.hasta).split(" ").slice(1).join(" ")}</h2>
        ${lineas.map(l => `<p class="cierre-linea">${escapar(l)}</p>`).join("")}
        <div class="cierre-botones"><button type="button" class="boton-chico lleno" data-cierre="detalle">Ver detalle</button><button type="button" class="boton-chico" data-cierre="listo">Listo</button></div>`;
      caja.hidden = false;
    } catch (e) { /* el cierre nunca debe romper el inicio */ }
  },

  // Tarjeta "Hoy": lo que registraste hoy, o la invitación a registrar
  mostrarHoy() {
    const caja = $("inicio-hoy");
    if (!caja) return;
    const delDia = Almacen.leerMovimientos().filter(m => m.fecha === hoy());
    const gastado = delDia.filter(m => m.tipo === "gasto" || m.tipo === "pagoDeuda").reduce((t, m) => t + m.monto, 0);
    const entro = delDia.filter(m => m.tipo === "ingreso").reduce((t, m) => t + m.monto, 0);
    const texto = !delDia.length ? "Todavía no registras nada hoy."
      : `${delDia.length} ${delDia.length === 1 ? "movimiento" : "movimientos"} hoy` +
        `${gastado > 0 ? ` · gastaste ${dinero(gastado)}` : ""}${entro > 0 ? ` · entró ${dinero(entro)}` : ""}.`;
    // Una frase del momento (Mensajes). Si es la invitación a registrar, reemplaza al "Todavía no registras nada hoy."
    let msg = null;
    try { msg = typeof Mensajes !== "undefined" ? Mensajes.elegir() : null; } catch (e) { /* sin mensaje */ }
    const aparte = msg && !(msg.caso === "sin-registro" && !delDia.length);
    caja.hidden = false;
    caja.innerHTML = `<h2>Hoy</h2><p class="hoy-texto">${msg && !aparte ? escapar(msg.texto) : texto}</p>${aparte ? `<p class="hoy-mensaje">${escapar(msg.texto)}</p>` : ""}
      <button id="inicio-hoy-registrar" class="boton-grande guardar">${delDia.length ? "Registrar otro" : "Registrar un gasto"}</button>`;
  },

  // "Ver todos": con más de 3 pagos próximos se ven 3 y el resto se abre con el botón
  ajustarPagos() {
    const ul = $("proximos-pagos"), btn = $("pagos-ver-todos");
    if (!ul || !btn) return;
    const n = ul.querySelectorAll(":scope > li").length;
    btn.hidden = n <= 3;
    if (n <= 3) { ul.classList.remove("resumido"); return; }
    ul.classList.toggle("resumido", !this._pagosTodos);
    btn.textContent = this._pagosTodos ? "Ver menos" : `Ver todos (${n}) ›`;
  },

  // Cifras grandes (ej.: $1,135,797.46) se achican hasta caber en su cuadro, en vez de cortarse o pisar al vecino
  ajustarCifras() {
    document.querySelectorAll(".kpis .dinero-cifra, .kpis .kpi strong").forEach(el => {
      el.style.fontSize = "";
      const caja = el.closest(".kpi, .dinero-tengo");
      if (!caja) return;
      let px = parseFloat(getComputedStyle(el).fontSize);
      const libre = () => caja.clientWidth - 20; // 10px de relleno por lado
      while (el.scrollWidth > libre() && px > 11) { px -= 0.5; el.style.fontSize = px + "px"; }
    });
  },

  iniciar() {
    // "Tengo" cambia desde app.js: cuando cambie su texto, se vuelve a ajustar
    new MutationObserver(() => this.ajustarCifras()).observe($("inicio-semana"), { childList: true, subtree: true, characterData: true });
    new MutationObserver(() => this.ajustarPagos()).observe($("proximos-pagos"), { childList: true });
    $("pagos-ver-todos").addEventListener("click", () => { this._pagosTodos = !this._pagosTodos; this.ajustarPagos(); });
    $("inicio-cierre").addEventListener("click", e => {
      const b = e.target.closest("[data-cierre]");
      if (!b) return;
      const desde = $("inicio-cierre").dataset.semana;
      const v = Avisos.vistos(); v["cierre-semana"] = desde; Almacen.guardar("avisosVistos", v);
      $("inicio-cierre").hidden = true;
      if (b.dataset.cierre === "detalle") { Nav.ir("resumen"); Resumen.periodo = "cuatro"; Resumen.mostrar(); }
    });
    $("inicio-hoy").addEventListener("click", e => { if (e.target.closest("#inicio-hoy-registrar")) Nav.abrirHoja("registrar"); });
    // Cada pago es una fila limpia: al tocarla aparecen "Ya lo pagué" y "Mover"
    const abrirFila = e => {
      if (e.target.closest("button")) return;
      const li = e.target.closest("li.pago-fila");
      if (!li || !li.querySelector(".pago-lado button")) return;
      li.classList.toggle("abierta");
      li.setAttribute("aria-expanded", li.classList.contains("abierta"));
    };
    $("proximos-pagos").addEventListener("click", abrirFila);
    $("proximos-pagos").addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("li.pago-fila")) { e.preventDefault(); abrirFila(e); } });
    new MutationObserver(() => $("proximos-pagos").querySelectorAll("li.pago-fila").forEach(li => {
      if (li.querySelector(".pago-lado button") && !li.hasAttribute("tabindex")) { li.tabIndex = 0; li.setAttribute("role", "button"); li.setAttribute("aria-expanded", "false"); }
    })).observe($("proximos-pagos"), { childList: true });
    this.ajustarPagos();
    $("pl-ysigasto").addEventListener("click", () => Planeados.abrirTemporal(null, hoy(), Nav.visible()));
    // Gastos planeados: fila limpia; al tocarla aparecen sus acciones (como los pagos)
    const abrirPlaneado = e => {
      if (e.target.closest("button")) return;
      const li = e.target.closest("li.pl-item");
      if (!li) return;
      li.classList.toggle("abierta");
      li.setAttribute("aria-expanded", li.classList.contains("abierta"));
    };
    $("pl-lista").addEventListener("click", abrirPlaneado);
    $("pl-lista").addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("li.pl-item")) { e.preventDefault(); abrirPlaneado(e); } });
    $("inicio-semana").addEventListener("click", e => {
      if (e.target.closest("[data-nav-ir]")) Nav.ir(e.target.closest("[data-nav-ir]").dataset.navIr);
      if (e.target.closest("[data-explica]")) Explica.abrir(e.target.closest("[data-explica]").dataset.explica);
    });
    window.addEventListener("movimientos-cambiaron", () => this.mostrar());
    window.addEventListener("jornadas-cambiaron", () => this.mostrar());
    this.mostrar();
  }
};

/* Pestañas dentro de las pantallas largas (solo en el teléfono; en el computador se ve todo en columnas) */
const Pestanas = {
  iniciar() {
    document.querySelectorAll("[data-pestanas]").forEach(barra => {
      const main = barra.closest("main");
      const poner = id => {
        main.dataset.tab = id;
        barra.querySelectorAll("[data-pestana]").forEach(b => {
          b.classList.toggle("activo", b.dataset.pestana === id);
          b.setAttribute("aria-pressed", b.dataset.pestana === id);
        });
      };
      poner(barra.querySelector("[data-pestana]").dataset.pestana);
      barra.addEventListener("click", e => {
        const b = e.target.closest("[data-pestana]");
        if (b) { poner(b.dataset.pestana); window.scrollTo(0, 0); }
      });
    });
  }
};

if (Datos.actual && !(typeof Sync !== "undefined" && Sync.soloVer())) {
  if ($("cal-titulo")) new MutationObserver(() => { try { Nav.cejas(); } catch (e) {} }).observe($("cal-titulo"), { childList: true, characterData: true, subtree: true });
  Nav.iniciar();
  Pestanas.iniciar();
  Inicio.iniciar();
}
