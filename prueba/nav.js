/*
 * MENÚ (barra abajo en el teléfono, menú a la izquierda en el computador) y PESTAÑAS
 * Es la misma app: se acomoda sola al tamaño de la pantalla (ver estilos.css).
 * El menú usa los mismos botones que ya abren cada pantalla, así cada una funciona igual que antes.
 */
const Nav = {
  // Sección del menú → botón que abre esa pantalla
  SECCIONES: {
    futuro: "abrir-futuro", plan: "abrir-plan", deudas: "abrir-deudas", planeados: "abrir-planeados",
    calendario: "abrir-calendario", resumen: "abrir-resumen", datosfijos: "abrir-datosfijos", pagosfijos: "abrir-pagosfijos", respaldo: "abrir-respaldo",
    consejero: "abrir-consejero", progreso: "abrir-progreso", logros: "abrir-logros"
  },
  // Pantalla visible → sección marcada en el menú
  MARCA: {
    "pantalla-inicio": "inicio", "pantalla-futuro": "futuro", "pantalla-alcanza": "futuro", "pantalla-escenarios": "futuro",
    "pantalla-prestamo": "futuro", "pantalla-acuerdo": "futuro", "pantalla-mover": "futuro", "pantalla-plan": "plan",
    "pantalla-deudas": "deudas", "pantalla-planeados": "planeados", "pantalla-cuando": "planeados",
    "pantalla-calendario": "calendario", "pantalla-resumen": "resumen", "pantalla-datosfijos": "datosfijos", "pantalla-pagosfijos": "pagosfijos", "pantalla-respaldo": "respaldo",
    "pantalla-cubrir": "inicio", "pantalla-consejero": "consejero", "pantalla-progreso": "progreso", "pantalla-logros": "logros"
  },
  EN_MAS: ["consejero", "deudas", "pagosfijos", "planeados", "calendario", "resumen", "datosfijos", "respaldo", "progreso", "logros"],

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
    $(this.SECCIONES[seccion]).click(); // la pantalla se abre como siempre (y oculta el inicio)
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

  // ---------- Hojas: "＋ Registrar" y "Más" ----------
  abrirHoja(cual) {
    if (cual === "registrar") { // cada vez empieza limpia: sin monto, sin categoría y con "Gasté" elegido
      $("hoja-monto").value = "";
      this.categoriaHoja = "";
      document.querySelectorAll("[data-tipo-hoja]").forEach(b => b.setAttribute("aria-pressed", b.dataset.tipoHoja === "gasto"));
      this.ponerCategoriasHoja();
    }
    $("hoja").hidden = false;
    $("aviso").hidden = true;
    $("hoja-registrar").hidden = cual !== "registrar";
    $("hoja-mas").hidden = cual !== "mas";
    $("hoja-avisos").hidden = cual !== "avisos";
    if (cual === "avisos") { try { if (typeof Xp !== "undefined") Xp.revisoAvisos(); } catch (e) { /* el XP nunca debe romper los avisos */ } }
    $("hoja-titulo-barra").textContent = { registrar: "Registrar", mas: "Más", avisos: "Avisos" }[cual] || "";
    // El monto listo para escribir (en el iPhone abre el teclado porque viene de un toque)
    if (cual === "registrar") $("hoja-monto").focus({ preventScroll: true });
  },

  // ---------- Hoja del +: con "Gasté" se elige la categoría aquí mismo y se guarda de una vez ----------
  categoriaHoja: "",
  tipoHoja() { return (document.querySelector("[data-tipo-hoja][aria-pressed='true']") || {}).dataset?.tipoHoja || "gasto"; },

  ponerCategoriasHoja() {
    const gasto = this.tipoHoja() === "gasto";
    const caja = $("hoja-categorias");
    caja.hidden = !gasto;
    caja.classList.remove("con-error");
    $("hoja-error").textContent = "";
    caja.innerHTML = CATEGORIAS.map(c => `<button type="button" class="chip" data-hoja-cat="${c}" aria-pressed="${c === this.categoriaHoja}">${c}</button>`).join("");
    this.textoBotonHoja();
  },

  textoBotonHoja() {
    const m = Number($("hoja-monto").value);
    const b = $("hoja-continuar");
    if (this.tipoHoja() !== "gasto") { b.textContent = "Continuar"; return; }
    b.textContent = m > 0 && this.categoriaHoja ? `Guardar ${dinero(m)} en ${this.categoriaHoja}` : m > 0 ? `Guardar ${dinero(m)}` : "Guardar";
  },

  errorHoja(texto, donde) {
    $("hoja-error").textContent = texto;
    $("hoja-categorias").classList.toggle("con-error", donde === "categoria");
    $("hoja-monto").closest(".campo").classList.toggle("con-error", donde === "monto");
    (donde === "monto" ? $("hoja-monto") : $("hoja-categorias").querySelector("button")).focus({ preventScroll: true });
  },

  // Guardar desde la hoja: el mismo camino que el formulario Gasté (consejero, "¿ya estaba incluido?"), sin otra pantalla
  guardarDesdeHoja() {
    const txt = $("hoja-monto").value.trim();
    const monto = Number(txt);
    if (txt === "" || !(monto > 0)) return this.errorHoja("Escribe el monto.", "monto");
    if (!this.categoriaHoja) return this.errorHoja("Elige una categoría.", "categoria");
    const nota = $("hoja-nota").value.trim();
    this.cerrarHoja();
    $("hoja-nota").value = "";
    abrirFormulario("gasto", { selector: true, monto, categoria: this.categoriaHoja, nota: nota || undefined });
    $("formulario").requestSubmit();
  },

  cerrarHoja() { if ($("hoja")) $("hoja").hidden = true; },

  iniciar() {
    document.body.classList.add("con-nav");
    $("nav").hidden = false;
    $("campana").hidden = false;
    $("nav").addEventListener("click", e => {
      const b = e.target.closest("[data-nav]");
      if (b) this.ir(b.dataset.nav);
      if (e.target.closest("#nav-registrar")) this.abrirHoja("registrar");
      if (e.target.closest("#nav-mas")) this.abrirHoja("mas");
    });
    $("hoja-monto").addEventListener("input", () => {
      $("hoja-monto").closest(".campo").classList.remove("con-error");
      if (/monto/.test($("hoja-error").textContent)) $("hoja-error").textContent = "";
      this.textoBotonHoja();
    });
    // Con el teclado abierto (iPhone), la hoja sube encima del teclado y esconde Nota y Atajos mientras escribes el monto
    if (window.visualViewport) {
      const ajustar = () => {
        const vv = window.visualViewport;
        const teclado = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        const caja = document.querySelector(".hoja-caja");
        const escribiendo = teclado > 120 && document.activeElement === $("hoja-monto");
        caja.style.marginBottom = teclado > 120 ? `${teclado}px` : "";
        $("hoja").classList.toggle("escribiendo", escribiendo);
      };
      window.visualViewport.addEventListener("resize", ajustar);
      $("hoja-monto").addEventListener("focus", ajustar);
      $("hoja-monto").addEventListener("blur", () => setTimeout(ajustar, 50));
    }
    $("hoja").addEventListener("click", e => {
      if (e.target.id === "hoja" || e.target.closest("#hoja-cerrar")) return this.cerrarHoja();
      const b = e.target.closest("[data-nav]");
      if (b) return this.ir(b.dataset.nav);
      const t = e.target.closest("[data-tipo-hoja]");
      if (t) { document.querySelectorAll("[data-tipo-hoja]").forEach(b => b.setAttribute("aria-pressed", b === t)); this.ponerCategoriasHoja(); return; }
      const c = e.target.closest("[data-hoja-cat]");
      if (c) {
        this.categoriaHoja = c.dataset.hojaCat;
        document.querySelectorAll("[data-hoja-cat]").forEach(b => b.setAttribute("aria-pressed", b === c));
        $("hoja-categorias").classList.remove("con-error"); $("hoja-error").textContent = "";
        this.textoBotonHoja();
        return;
      }
      if (e.target.closest("#hoja-continuar") && this.tipoHoja() === "gasto") return this.guardarDesdeHoja();
      if (e.target.closest("#hoja-continuar")) { // Me pagaron / Deuda: abre el formulario con el monto ya escrito
        const tipo = document.querySelector("[data-tipo-hoja][aria-pressed='true']").dataset.tipoHoja;
        const txt = $("hoja-monto").value.trim();
        const nota = $("hoja-nota").value.trim();
        this.cerrarHoja();
        $("hoja-nota").value = "";
        return abrirFormulario(tipo, { selector: true, nota: nota || undefined, monto: txt !== "" && Number(txt) >= 0 ? Number(txt) : undefined });
      }
      const r = e.target.closest("[data-registrar]");
      if (!r) return;
      this.cerrarHoja();
      const que = r.dataset.registrar;
      if (que === "trabaje") $("trabaje-hoy").click();
      else if (que === "no-trabaje") $("no-trabaje-hoy").click();
      else if (que === "ysigasto") Planeados.abrirTemporal(null, hoy(), this.visible());
      else abrirFormulario(que, ["gasto", "ingreso", "pagoDeuda"].includes(que) ? { selector: true } : {});
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
      <button class="kpi kpi-libre" data-nav-ir="plan" aria-label="Libre para lo que quieras: ${dinero(sem.libre)}. Ver el plan">
        <span class="kpi-etq">Libre esta semana</span><strong>${dinero(sem.libre)}</strong></button>
      <button class="kpi kpi-guardar" data-nav-ir="plan" aria-label="Guárdalo para más adelante: ${dinero(sem.guardar)}. Ver el plan">
        <span class="kpi-etq">Para después</span><strong>${dinero(sem.guardar)}</strong></button>`;
    this.ajustarCifras();
    this.mostrarHoy();
    if (typeof Avisos !== "undefined") Avisos.mostrar();
    if (typeof Consejero !== "undefined") Consejero.tarjetaInicio();
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
    caja.hidden = false;
    caja.innerHTML = `<h2>Hoy</h2><p class="hoy-texto">${texto}</p>
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
