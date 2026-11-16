/*
 * DINERO QUE SE LIBERA (Plan 2, 1.4)
 * Cuando al préstamo semanal le quedan 2 pagos o menos, la app avisa (campana + tarjeta en Mis deudas) y deja elegir
 * qué porcentaje de lo libre va al colchón DESPUÉS de la renta atrasada (que siempre va primero). Usa lo que ya existe:
 *   · la misma cuenta de "Cuándo termino" (Deudas.fechasReales → Proyeccion.planDeudas), y
 *   · el ajuste "% al colchón" del plan (plan.porcentajeColchon).
 * No crea ningún plan de pagos (un "Planear pagos" fijo contaría como el pago completo de esa deuda y la atrasaría) ni datos que sincronizar.
 * "Una sola vez": la respuesta se guarda en este teléfono (clave "liberado"), por préstamo (fecha del último pago + cuota).
 * El porcentaje solo cambia con tu toque. En modo "Solo ver" esta pantalla no existe.
 */
const Liberado = {
  OPCIONES: [0, 25, 50],
  MAX_PAGOS: 2,
  _sel: null,

  respondidos() { return Almacen.leer("liberado") || {}; },
  responder(clave, como) { const r = this.respondidos(); r[clave] = como; Almacen.guardar("liberado", r); },

  // Barato (lo usan los avisos en cada cambio): ¿al préstamo semanal le quedan 2 pagos o menos? pr = proyección ya calculada (opcional)
  base(pr) {
    if (!Datos.deudas().some(d => d.id === Plan.ID_DEUDA_PRESTAMO)) return null;
    if (!(Datos.saldoDeuda(Plan.ID_DEUDA_PRESTAMO) > Deudas.CERO)) return null;
    const g = Datos.actual.gastosFijos.find(x => x.id === Plan.ID_GASTO_PRESTAMO);
    if (!g || !(g.monto > 0)) return null;
    pr = pr || Proyeccion.calcular({ horizonte: 92 });
    const pagos = pr.lineas.filter(l => l.id === "prestamo" && l.monto < 0 && l.tipo !== "simulado").map(l => l.fecha).sort();
    if (!pagos.length || pagos.length > this.MAX_PAGOS) return null;
    const fin = pagos[pagos.length - 1];
    const desde = pr.cheques.filter(c => c > fin)[0] || Jornadas.sumarDias(fin, 7);
    return { fin, desde, cuota: g.monto, pagos: pagos.length, clave: `${fin}|${g.monto}` };
  },

  pendiente(b) { return !!b && !this.respondidos()[b.clave]; },

  corto(f) { return f instanceof Date ? f.toLocaleDateString("es", { day: "numeric", month: "short" }).replace(/[.,]/g, "") : ""; },

  // Pesado (solo al dibujar la tarjeta o la hoja): lo mismo que el comparador de "Cuándo termino"
  detalle(b) {
    const plan = Almacen.leerPlan(), extra = plan.extraProyeccion || 0;
    const pr = Proyeccion.calcular({ horizonte: 730 });
    const orden = Plan.deudasEnOrden().filter(d => Datos.saldoReparto(d.id) > Deudas.CERO);
    const lleno = plan.sobres.colchon >= Plan.metaColchon() - Deudas.CERO;
    const actual = plan.porcentajeColchon;
    const hoyR = Deudas.fechasReales(actual, extra, pr);
    const opciones = lleno || !orden.length ? [] : [...new Set([...this.OPCIONES, actual])].sort((x, y) => x - y).map(pct => {
      const r = Deudas.fechasReales(pct, extra, pr);
      const partes = [];
      partes.push(r.fechaColchon && r.fechaColchon !== "ya" ? `Colchón lleno ${this.corto(r.fechaColchon)}` : "el colchón no se llena");
      // Solo lo que cambia con la decisión: las deudas que terminan después de la primera (la renta atrasada, que siempre va primero)
      const f0 = orden.length ? r.fechas[orden[0].id] : null;
      orden.slice(1).forEach(d => {
        const f = r.fechas[d.id];
        if (f instanceof Date && f0 instanceof Date && f <= f0) return;
        partes.push(f instanceof Date ? `${d.nombre} ${this.corto(f)}` : `${d.nombre}: no alcanza en 2 años`);
      });
      return { pct, actual: pct === actual, titulo: pct === 0 ? `Todo a deudas (0 % al colchón${pct === actual ? " · como hoy" : ""})` : `${pct} % al colchón${pct === actual ? " (actual)" : ""}`,
               partes, libre: r.libre };
    });
    const flujo = orden.map(d => { const f = hoyR.fechas[d.id]; return { nombre: d.nombre, fecha: f instanceof Date ? this.corto(f) : f === "pagada" ? null : "no alcanza en 2 años" }; });
    if (!lleno && orden.length) flujo.push({ nombre: "Colchón", fecha: actual === 0 ? "0 % · no se llena" : hoyR.fechaColchon instanceof Date ? `${actual} % · lleno el ${this.corto(hoyR.fechaColchon)}` : `${actual} %` });
    const libres = [...new Set(opciones.map(o => o.libre instanceof Date ? this.corto(o.libre) : String(o.libre)))];
    return { plan, orden, lleno, actual, opciones, flujo, libreHoy: hoyR.libre instanceof Date ? this.corto(hoyR.libre) : null, igualLibre: libres.length <= 1 };
  },

  frase(b) {
    return `${b.pagos === 1 ? `Le queda un pago: el ${Futuro.diaCorto(b.fin)}.` : `Le quedan ${b.pagos} pagos; el último es el ${Futuro.diaCorto(b.fin)}.`} Desde el ${Futuro.diaCorto(b.desde)} dejan de salir ${dineroCorto(b.cuota)} por semana.`;
  },

  // ---------- Tarjeta en Mis deudas ----------
  mostrarTarjeta() {
    const caja = $("d-liberado");
    if (!caja) return;
    let b = null;
    try { b = this.base(); } catch (e) { /* nunca debe romper Mis deudas */ }
    if (!this.pendiente(b)) { caja.hidden = true; caja.innerHTML = ""; return; }
    const d = this.detalle(b);
    const filas = d.flujo.filter(f => f.fecha).map(f => `<span>${escapar(f.nombre)}</span><span>${f.nombre === "Colchón" ? "" : "hasta el "}${escapar(f.fecha)}</span>`).join("");
    caja.hidden = false;
    caja.innerHTML = `<h3 class="lb-t">Se acaba el préstamo semanal</h3>
      <p>${escapar(this.frase(b))}</p>
      ${filas ? `<p class="lb-n">Así los manda la cuenta hoy:</p><div class="lb-flujo">${filas}</div>` : `<p class="lb-n">Ya no tienes más deudas: ese dinero queda libre.</p>`}
      ${d.opciones.length ? `<button class="lb-bt lleno" data-lb-abrir>¿Qué hago con ese dinero?</button>` : ""}
      <button class="lb-bt" data-lb-asi>${d.opciones.length ? "Dejarlo así" : "Entendido"}</button>`;
  },

  // ---------- Hoja: elegir ----------
  abrir() {
    let b = null;
    try { b = this.base(); } catch (e) { return; }
    if (!this.pendiente(b)) return;
    const d = this.detalle(b);
    this._sel = d.actual;
    this._b = b;
    Nav.abrirHoja("liberado");
    $("hoja-titulo-barra").textContent = `¿A dónde van esos ${dineroCorto(b.cuota)}?`;
    this.dibujar(d);
  },

  dibujar(d) {
    const orden0 = d.orden[0], hasta = d.flujo.find(f => orden0 && f.nombre === orden0.nombre);
    const sel = this._sel;
    $("lb-cuerpo").innerHTML = `<p class="lb-intro">Hasta que se pague ${orden0 ? escapar(orden0.nombre.toLowerCase()) : "lo que debes"}${hasta && hasta.fecha ? ` (<b>${escapar(hasta.fecha)}</b>)` : ""}, todo lo libre va ahí. Lo que se decide es <b>lo que sigue</b>:</p>
      ${d.opciones.map(o => `<button type="button" class="lb-op" data-lb-pct="${o.pct}" aria-pressed="${o.pct === sel}">
        <b>${escapar(o.titulo)}</b><span>${[...o.partes, ...(d.igualLibre || !(o.libre instanceof Date) ? [] : [`libre de deudas ${this.corto(o.libre)}`])].map(escapar).join(" · ")}</span></button>`).join("")}
      <p class="lb-n">${d.igualLibre && d.libreHoy ? `Tu día de libertad (${escapar(d.libreHoy)}) no cambia con ninguna. ` : ""}Es un estimado.</p>
      ${sel !== d.actual ? `<button class="lb-bt lleno" data-lb-usar="${sel}">Usar ${sel} % al colchón</button>` : ""}
      <button class="lb-bt" data-lb-asi>Dejarlo así</button>`;
    this._d = d;
  },

  usar(pct) {
    const b = this._b, d = this._d;
    if (!b || !d) return;
    const plan = Almacen.leerPlan();
    plan.porcentajeColchon = pct;
    Almacen.guardarPlan(plan);
    this.responder(b.clave, `pct${pct}`);
    Nav.cerrarHoja();
    const libre = (d.opciones.find(o => o.pct === pct) || {}).libre;
    Pantalla.aviso(`Listo: ${pct} % al colchón.${libre instanceof Date ? ` Tu día de libertad: ${this.corto(libre)}.` : ""}`, 5000);
    this.despues();
  },

  dejarAsi() {
    const b = this._b || this.base();
    if (!b) return;
    this.responder(b.clave, "asi");
    Nav.cerrarHoja();
    this.despues();
  },

  despues() {
    if (!$("pantalla-deudas").hidden) Deudas.mostrar();
    if (typeof Avisos !== "undefined") Avisos.mostrar();
  },

  iniciar() {
    document.addEventListener("click", e => {
      if (e.target.closest("[data-lb-abrir]")) return this.abrir();
      const op = e.target.closest("[data-lb-pct]");
      if (op) { this._sel = Number(op.dataset.lbPct); return this.dibujar(this._d); }
      const us = e.target.closest("[data-lb-usar]");
      if (us) return this.usar(Number(us.dataset.lbUsar));
      if (e.target.closest("[data-lb-asi]")) {
        const b = this._b && !$("hoja-liberado").hidden ? this._b : this.base();
        if (b) { this._b = b; this.dejarAsi(); }
      }
    });
  }
};

if (Datos.actual) Liberado.iniciar();
