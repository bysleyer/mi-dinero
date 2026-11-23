/*
 * MOVIMIENTOS (Plan 2, 2.1)
 * Todos los movimientos registrados, agrupados por día, con búsqueda (nota, categoría o monto)
 * y filtros por tipo y por mes. Solo lee: borrar y "Cambiar a Cheque" usan las mismas funciones del inicio
 * (borrarMovimiento, cambiarTipoIngreso en app.js; Editar abre la hoja del +: Nav.editarMovimiento) y la fila es la misma (filaMovimiento).
 * La línea "Suma de lo que ves" suma los registros de la lista; no es un saldo (el saldo sale de Dinero y Proyeccion).
 * Los filtros empiezan limpios cada vez que se abre la pantalla. En modo "Solo ver" esta pantalla no existe.
 */
const Movimientos = {
  PAGINA: 50,
  _q: "", _tipo: "todos", _mes: "todos", _max: 50,

  normal(t) { return String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); },

  todos() {
    return Almacen.leerMovimientos().slice().sort((a, b) => (b.fecha + b.creado).localeCompare(a.fecha + a.creado));
  },

  esDeuda(m) { return m.tipo === "pagoDeuda" || m.tipo === "ajuste"; },

  // ¿El movimiento coincide con lo escrito? Cada palabra debe aparecer en el texto o ser el monto
  coincide(m, q) {
    const palabras = this.normal(q).split(/\s+/).filter(Boolean);
    if (!palabras.length) return true;
    const esOtro = m.tipo === "ingreso" && !esCheque(m);
    const texto = this.normal([m.nota, m.categoria, NOMBRES_TIPO[m.tipo], m.tipo === "ingreso" ? (esOtro ? "otro ingreso" : "cheque") : ""].join(" "));
    const monto = String(redondear(m.monto));
    return palabras.every(w => {
      if (texto.includes(w)) return true;
      const n = w.replace(/^\$/, "").replace(/,/g, "");
      if (!/^\d+(\.\d*)?$/.test(n)) return false;
      return monto === n || monto.startsWith(n.includes(".") ? n : n + ".");
    });
  },

  filtrados() {
    return this.todos().filter(m =>
      (this._tipo === "todos" || (this._tipo === "deuda" ? this.esDeuda(m) : m.tipo === this._tipo)) &&
      (this._mes === "todos" || m.fecha.startsWith(this._mes)) &&
      this.coincide(m, this._q));
  },

  meses() {
    return [...new Set(this.todos().map(m => m.fecha.slice(0, 7)))].sort().reverse();
  },

  nombreMes(ym) {
    const t = Jornadas.aFecha(ym + "-01").toLocaleDateString("es", { month: "long", year: "numeric" });
    return t;
  },

  // "Hoy · dom 15 nov", "Ayer · sáb 14 nov", "Jue 12 nov"
  titulo(f) {
    const d = Futuro.diaCorto(f), c = d.charAt(0).toUpperCase() + d.slice(1);
    const h = hoy();
    return f === h ? `Hoy · ${d}` : f === Jornadas.sumarDias(h, -1) ? `Ayer · ${d}` : c;
  },

  // ---------- Pantalla ----------
  abrir() {
    this._q = ""; this._tipo = "todos"; this._mes = "todos"; this._max = this.PAGINA;
    $("mv-q").value = "";
    $("pantalla-inicio").hidden = true;
    $("pantalla-movimientos").hidden = false;
    window.scrollTo(0, 0);
    this.mostrar();
  },

  cerrar() {
    $("pantalla-movimientos").hidden = true;
    $("pantalla-inicio").hidden = false;
    window.scrollTo(0, 0);
  },

  quitarFiltros() {
    this._q = ""; this._tipo = "todos"; this._mes = "todos"; this._max = this.PAGINA;
    $("mv-q").value = "";
    this.mostrar();
  },

  mostrar() {
    if ($("pantalla-movimientos").hidden) return;
    // Mes elegido que ya no tiene movimientos (por ejemplo, se borraron): vuelve a "Todos los meses"
    const meses = this.meses();
    if (this._mes !== "todos" && !meses.includes(this._mes)) this._mes = "todos";
    $("mv-mes").innerHTML = `<option value="todos">Todos los meses</option>` +
      meses.map(ym => `<option value="${ym}"${ym === this._mes ? " selected" : ""}>${escapar(this.nombreMes(ym))}</option>`).join("");
    $("mv-mes").value = this._mes;
    document.querySelectorAll("#mv-tipos [data-mv-tipo]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mvTipo === this._tipo)));
    $("mv-limpiar").hidden = !this._q;

    const lista = this.filtrados();
    const hayAlgo = this.todos().length > 0;
    if (!hayAlgo) {
      $("mv-resumen").innerHTML = "";
      $("mv-lista").innerHTML = `<p class="vacio">Todavía no hay movimientos.</p>`;
      return;
    }
    if (!lista.length) {
      $("mv-resumen").innerHTML = "";
      $("mv-lista").innerHTML = `<p class="vacio mv-vacio">${this._q ? `Nada coincide con «${escapar(this._q)}».` : "No hay movimientos con estos filtros."}</p>
        <button type="button" class="boton-chico mv-quitar" data-mv-quitar>Quitar filtros</button>`;
      return;
    }
    // Suma de lo que se ve (los ajustes de saldo no son dinero que entra o sale: no suman)
    const suma = t => redondear(lista.filter(m => m.tipo === t).reduce((s, m) => s + m.monto, 0));
    const g = suma("gasto"), i = suma("ingreso"), p = suma("pagoDeuda");
    const partes = [g > 0 ? `gastos <b>${dinero(g)}</b>` : "", i > 0 ? `ingresos <b>${dinero(i)}</b>` : "", p > 0 ? `pagos a deudas <b>${dinero(p)}</b>` : ""].filter(Boolean);
    $("mv-resumen").innerHTML = `<p>${lista.length} ${lista.length === 1 ? "movimiento" : "movimientos"}</p>` +
      (partes.length ? `<p class="mv-suma">Suma de lo que ves: ${partes.join(" · ")}</p>` : "");

    const visibles = lista.slice(0, this._max);
    let html = "", dia = null;
    visibles.forEach(m => {
      if (m.fecha !== dia) {
        if (dia !== null) html += `</ul>`;
        dia = m.fecha;
        html += `<p class="mv-dia">${escapar(this.titulo(m.fecha))}</p><ul class="movimientos">`;
      }
      html += filaMovimiento(m);
    });
    html += `</ul>`;
    const resto = lista.length - visibles.length;
    if (resto > 0) html += `<button type="button" class="mv-mas" data-mv-mas>Ver ${Math.min(this.PAGINA, resto)} más <small>(${resto} sin mostrar)</small></button>`;
    $("mv-lista").innerHTML = html;
  },

  iniciar() {
    $("volver-movimientos").addEventListener("click", () => this.cerrar());
    $("ver-todos-mov").addEventListener("click", () => Nav.ir("movimientos"));
    $("mv-q").addEventListener("input", e => { this._q = e.target.value.trim(); this._max = this.PAGINA; this.mostrar(); });
    $("mv-limpiar").addEventListener("click", () => { this._q = ""; $("mv-q").value = ""; this._max = this.PAGINA; this.mostrar(); $("mv-q").focus(); });
    $("mv-mes").addEventListener("change", e => { this._mes = e.target.value; this._max = this.PAGINA; this.mostrar(); });
    $("pantalla-movimientos").addEventListener("click", e => {
      const t = e.target.closest("[data-mv-tipo]");
      if (t) { this._tipo = t.dataset.mvTipo; this._max = this.PAGINA; return this.mostrar(); }
      if (e.target.closest("[data-mv-mas]")) { this._max += this.PAGINA; return this.mostrar(); }
      if (e.target.closest("[data-mv-quitar]")) return this.quitarFiltros();
      const b = e.target.closest("[data-borrar]");
      if (b) return borrarMovimiento(b.dataset.borrar);
      const c = e.target.closest("[data-cambiar-tipo]");
      if (c) return cambiarTipoIngreso(c.dataset.cambiarTipo);
      const ed = e.target.closest("[data-editar]");
      if (ed) Nav.editarMovimiento(ed.dataset.editar);
    });
    window.addEventListener("movimientos-cambiaron", () => this.mostrar());
  }
};

if (Datos.actual) Movimientos.iniciar();
