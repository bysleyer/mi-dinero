/*
 * MENÚ (barra abajo en el teléfono, menú a la izquierda en el computador) y PESTAÑAS
 * Es la misma app: se acomoda sola al tamaño de la pantalla (ver estilos.css).
 * El menú usa los mismos botones que ya abren cada pantalla, así cada una funciona igual que antes.
 */
const Nav = {
  // Sección del menú → botón que abre esa pantalla
  SECCIONES: {
    futuro: "abrir-futuro", plan: "abrir-plan", deudas: "abrir-deudas", planeados: "abrir-planeados",
    calendario: "abrir-calendario", resumen: "abrir-resumen", datosfijos: "abrir-datosfijos", respaldo: "abrir-respaldo"
  },
  // Pantalla visible → sección marcada en el menú
  MARCA: {
    "pantalla-inicio": "inicio", "pantalla-futuro": "futuro", "pantalla-alcanza": "futuro", "pantalla-escenarios": "futuro",
    "pantalla-prestamo": "futuro", "pantalla-acuerdo": "futuro", "pantalla-mover": "futuro", "pantalla-plan": "plan",
    "pantalla-deudas": "deudas", "pantalla-planeados": "planeados", "pantalla-cuando": "planeados",
    "pantalla-calendario": "calendario", "pantalla-resumen": "resumen", "pantalla-datosfijos": "datosfijos", "pantalla-respaldo": "respaldo",
    "pantalla-cubrir": "inicio"
  },
  EN_MAS: ["deudas", "planeados", "calendario", "resumen", "datosfijos", "respaldo"],

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
      const r = e.target.closest("[data-registrar]");
      if (!r) return;
      this.cerrarHoja();
      const que = r.dataset.registrar;
      if (que === "trabaje") $("trabaje-hoy").click();
      else if (que === "no-trabaje") $("no-trabaje-hoy").click();
      else if (que === "ysigasto") Planeados.abrirTemporal(null, hoy(), this.visible());
      else abrirFormulario(que);
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
    caja.innerHTML = `
      <h2>Esta semana</h2>
      <button class="inicio-libre" data-nav-ir="plan">
        <span><span class="inicio-etq">Libre para lo que quieras</span><strong>${dinero(sem.libre)}</strong></span>
        <span><span class="inicio-etq">Guárdalo para más adelante</span><strong>${dinero(sem.guardar)}</strong></span>
        <span class="inicio-ver">Ver el plan ›</span>
      </button>`;
    if (typeof Avisos !== "undefined") Avisos.mostrar();
  },

  iniciar() {
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
