/*
 * PAPELERA (Plan 2, 3.1): lo que borraste en los últimos 30 días se puede recuperar.
 * No guarda nada aparte: los borrados ya se marcan con "borrado: true" (así los entiende la sincronización).
 * Recuperar = quitar esa marca. Lo que se borró a los 60 segundos de crearlo se considera un error de dedo y no sale.
 */
const Papelera = {
  DIAS: 30,
  SEGUNDOS_ERROR: 60,

  TIPOS: [
    { clave: "movimientos", todos: () => Almacen.leerTodosLosMovimientos(), nombre: "Movimiento" },
    { clave: "jornadas", todos: () => Almacen.leerTodasLasJornadas(), nombre: "Jornada" },
    { clave: "planeados", todos: () => Almacen.leerTodosLosPlaneados(), nombre: "Gasto planeado" },
    { clave: "acuerdos", todos: () => Almacen.leerTodosLosAcuerdos(), nombre: "Conversación" }
  ],

  etiqueta(clave, x) {
    if (clave === "movimientos") {
      const nota = x.nota ? ` · ${x.nota}` : "";
      return `${NOMBRES_TIPO[x.tipo] || "Movimiento"} de ${dinero(x.monto)} (${fechaCorta(x.fecha)})${nota}`;
    }
    if (clave === "jornadas") return `Jornada del ${fechaCorta(x.fecha)}${x.horas ? ` · ${x.horas} h` : ""}`;
    if (clave === "planeados") return `${x.nombre || "Gasto planeado"}${x.monto ? ` · ${dinero(x.monto)}` : ""}`;
    return `Conversación con ${x.con || "alguien"}${x.fecha ? ` (${fechaCorta(x.fecha)})` : ""}`;
  },

  // [{ clave, id, texto, cuando, tipo }] lo más reciente primero
  lista() {
    const ahora = Date.now();
    const limite = ahora - this.DIAS * 86400000;
    const salida = [];
    this.TIPOS.forEach(t => {
      t.todos().forEach(x => {
        if (!x.borrado || !x.modificado) return;
        const cuando = new Date(x.modificado).getTime();
        if (!(cuando >= limite)) return;
        const creado = x.creado ? new Date(x.creado).getTime() : null;
        if (creado != null && cuando - creado < this.SEGUNDOS_ERROR * 1000) return;
        salida.push({ clave: t.clave, id: x.id, texto: this.etiqueta(t.clave, x), tipo: t.nombre, cuando: x.modificado });
      });
    });
    return salida.sort((a, b) => (a.cuando < b.cuando ? 1 : -1));
  },

  recuperar(clave, id) {
    if (typeof Sync !== "undefined" && Sync.soloVer()) return false;
    const t = this.TIPOS.find(x => x.clave === clave);
    if (!t) return false;
    const x = t.todos().find(y => y.id === id);
    if (!x || !x.borrado) return false;
    const lista = t.todos().map(y => y.id === id ? { ...y, borrado: false, modificado: Almacen.ahora() } : y);
    if (!Almacen.guardar(clave, lista)) return false;
    // Un pago que había salido de un sobre vuelve a salir de él
    if (clave === "movimientos") {
      Plan.moverSobreRenta(-(x.descontadoSobreRenta || 0));
      Plan.moverSobreServicios(-(x.descontadoSobreServicios || 0));
    }
    return true;
  },

  dibujar() {
    const caja = $("papelera-lista");
    if (!caja) return;
    const items = this.lista();
    $("papelera-cuenta").textContent = items.length ? `(${items.length})` : "";
    caja.innerHTML = items.length
      ? items.map(i => `<div class="fila-papelera"><span><b>${escapar(i.tipo)}</b> · ${escapar(i.texto)}<small>Borrado ${escapar(fechaCorta(String(i.cuando).slice(0, 10)))}</small></span><button class="boton-chico" data-recuperar="${escapar(i.clave)}:${escapar(i.id)}">Recuperar</button></div>`).join("")
      : `<p class="nota-sobre">No hay nada borrado en los últimos ${this.DIAS} días.</p>`;
  },

  iniciar() {
    const caja = $("papelera-lista");
    if (!caja) return;
    caja.addEventListener("click", e => {
      const b = e.target.closest("[data-recuperar]");
      if (!b) return;
      const [clave, ...resto] = b.dataset.recuperar.split(":");
      if (this.recuperar(clave, resto.join(":"))) {
        Pantalla.actualizar();
        window.dispatchEvent(new Event("movimientos-cambiaron"));
        this.dibujar();
        Pantalla.aviso("Recuperado");
      }
    });
  }
};
