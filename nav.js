/*
 * MENÚ (barra abajo en el teléfono, menú a la izquierda en el computador) y PESTAÑAS
 * Es la misma app: se acomoda sola al tamaño de la pantalla (ver estilos.css).
 * El menú usa los mismos botones que ya abren cada pantalla, así cada una funciona igual que antes.
 */
const Nav = {
  // Sección del menú → botón que abre esa pantalla
  SECCIONES: {
    futuro: "abrir-futuro", plan: "abrir-plan", deudas: "abrir-deudas", planeados: "abrir-planeados",
    calendario: "abrir-calendario", resumen: "abrir-resumen", datosfijos: "abrir-datosfijos", respaldo: "abrir-respaldo",
    consejero: "abrir-consejero"
  },
  // Pantalla visible → sección marcada en el menú
  MARCA: {
    "pantalla-inicio": "inicio", "pantalla-futuro": "futuro", "pantalla-alcanza": "futuro", "pantalla-escenarios": "futuro",
    "pantalla-prestamo": "futuro", "pantalla-acuerdo": "futuro", "pantalla-mover": "futuro", "pantalla-plan": "plan",
    "pantalla-deudas": "deudas", "pantalla-planeados": "planeados", "pantalla-cuando": "planeados",
    "pantalla-calendario": "calendario", "pantalla-resumen": "resumen", "pantalla-datosfijos": "datosfijos", "pantalla-respaldo": "respaldo",
    "pantalla-cubrir": "inicio", "pantalla-consejero": "consejero"
  },
  EN_MAS: ["consejero", "deudas", "planeados", "calendario", "resumen", "datosfijos", "respaldo"],

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

  marcar() {
    const s = this.MARCA[this.visible()] || "inicio";
    document.querySelectorAll("[data-nav]").forEach(b => b.classList.toggle("activo", b.dataset.nav === s));
    $("nav-mas").classList.toggle("activo", this.EN_MAS.includes(s));
  },

  // ---------- Hojas: "＋ Registrar" y "Más" ----------
  abrirHoja(cual) {
    if (cual === "registrar") { // cada vez empieza limpia: sin monto y con "Gasté" elegido
      $("hoja-monto").value = "";
      document.querySelectorAll("[data-tipo-hoja]").forEach(b => b.setAttribute("aria-pressed", b.dataset.tipoHoja === "gasto"));
    }
    $("hoja").hidden = false;
    $("hoja-registrar").hidden = cual !== "registrar";
    $("hoja-mas").hidden = cual !== "mas";
    $("hoja-avisos").hidden = cual !== "avisos";
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
    $("hoja").addEventListener("click", e => {
      if (e.target.id === "hoja" || e.target.closest("#hoja-cerrar")) return this.cerrarHoja();
      const b = e.target.closest("[data-nav]");
      if (b) return this.ir(b.dataset.nav);
      const t = e.target.closest("[data-tipo-hoja]");
      if (t) { document.querySelectorAll("[data-tipo-hoja]").forEach(b => b.setAttribute("aria-pressed", b === t)); return; }
      if (e.target.closest("#hoja-continuar")) { // abre el formulario del tipo elegido con el monto ya escrito
        const tipo = document.querySelector("[data-tipo-hoja][aria-pressed='true']").dataset.tipoHoja;
        const txt = $("hoja-monto").value.trim();
        this.cerrarHoja();
        return abrirFormulario(tipo, { selector: true, monto: txt !== "" && Number(txt) >= 0 ? Number(txt) : undefined });
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
      <button id="inicio-hoy-registrar" class="boton-chico lleno">${delDia.length ? "Registrar otro" : "Registrar"}</button>`;
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
    this.ajustarPagos();
    $("pl-ysigasto").addEventListener("click", () => Planeados.abrirTemporal(null, hoy(), Nav.visible()));
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
  Nav.iniciar();
  Pestanas.iniciar();
  Inicio.iniciar();
}
