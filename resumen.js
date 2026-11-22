/*
 * A DÓNDE SE VA MI DINERO (Bloque 5)
 * Resumen de gastos por categoría y revisión "¿Cuadra mi dinero?".
 * Usa Datos (app.js), Plan (plan.js) y Almacen (almacen.js).
 */
const Resumen = {
  periodo: "semana",
  CUADRA: 1, // diferencia menor a $1 = cuadra bien

  // ---------- Fechas ----------
  aClave(d) {
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },

  // Devuelve { inicio, fin, factor } (factor = cuántas semanas de presupuesto caben)
  rango(periodo) {
    const ahora = new Date();
    if (periodo === "mes") {
      const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      const fin = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0);
      return { inicio: this.aClave(inicio), fin: this.aClave(fin), factor: fin.getDate() / 7 };
    }
    if (periodo === "cuatro") {
      const inicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 27);
      return { inicio: this.aClave(inicio), fin: hoy(), factor: 4 };
    }
    // Esta semana: lunes a domingo
    const lunes = Plan.claveSemana(ahora);
    const [a, m, d] = lunes.split("-").map(Number);
    return { inicio: lunes, fin: this.aClave(new Date(a, m - 1, d + 6)), factor: 1 };
  },

  // ---------- Cálculos ----------
  calcular(periodo) {
    const r = this.rango(periodo);
    return { rango: r, ...this.calcularRango(r.inicio, r.fin) };
  },

  // Las sumas de cualquier rango de fechas (las usa también el Cierre del mes: así sus totales son los de esta pantalla)
  calcularRango(inicio, fin) {
    const movs = Almacen.leerMovimientos().filter(m => m.fecha >= inicio && m.fecha <= fin);
    const suma = lista => lista.reduce((s, m) => s + m.monto, 0);

    const gastos = movs.filter(m => m.tipo === "gasto");
    const extras = [...new Set(gastos.map(m => m.categoria))].filter(c => c && !CATEGORIAS.includes(c));
    const porCategoria = [...CATEGORIAS, ...extras].map(c => ({
      nombre: c,
      total: suma(gastos.filter(m => m.categoria === c))
    }));
    const ingresos = movs.filter(m => m.tipo === "ingreso"), pagos = movs.filter(m => m.tipo === "pagoDeuda");
    const porDeuda = {};
    pagos.forEach(m => { porDeuda[m.deudaId || "?"] = redondear((porDeuda[m.deudaId || "?"] || 0) + m.monto); });
    return {
      porCategoria,
      totalSuper: suma(gastos.filter(m => m.categoria === "Súper")),
      totalGastado: suma(gastos),
      pagosDeudas: suma(pagos),
      ingresos: suma(ingresos),
      cheques: suma(ingresos.filter(esCheque)),
      porDeuda,
      movimientos: gastos.length + ingresos.length + pagos.length   // cuántos movimientos de dinero hay (sin ajustes de saldo)
    };
  },

  // Presupuesto semanal desde datos.js (solo Comida y Transporte)
  presupuestoSemanal(categoria) {
    const id = { Comida: "comida", Transporte: "transporte" }[categoria];
    if (!id) return null;
    return Datos.actual.gastosFijos.find(g => g.id === id).monto;
  },

  // Dinero esperado = último escrito + ingresos − gastos − pagos registrados desde entonces
  esperado(revision) {
    return Almacen.leerMovimientos()
      .filter(m => m.creado > revision.momento)
      .reduce((s, m) => {
        if (m.incluidoEnCorreccion) return s;
        if (m.tipo === "ingreso") return s + m.monto;
        if (m.tipo === "gasto" || m.tipo === "pagoDeuda") return s - m.monto;
        return s; // los ajustes de saldo no mueven dinero
      }, revision.monto);
  },

  // ---------- Pantalla ----------
  abrir() {
    this.periodo = "semana";
    $("r-dinero").value = ""; // lo que cuentas tú (no el número de la app)
    $("r-resultado").textContent = "";
    $("r-acciones").innerHTML = "";
    $("r-detalle").hidden = true;
    $("pantalla-inicio").hidden = true;
    $("pantalla-resumen").hidden = false;
    window.scrollTo(0, 0);
    this.mostrar();
  },

  cerrar() {
    $("pantalla-resumen").hidden = true;
    $("pantalla-inicio").hidden = false;
    window.scrollTo(0, 0);
  },

  lineaPresupuesto(categoria, gastado, factor) {
    const semanal = this.presupuestoSemanal(categoria);
    if (semanal == null) return "";
    const tope = redondear(semanal * factor);
    const resta = tope - gastado;
    const color = gastado > tope ? "rojo" : gastado > tope * 0.8 ? "amarillo" : "verde";
    const texto = resta >= 0
      ? `Llevas ${dinero(gastado)} de ${dinero(tope)}. Te quedan ${dinero(resta)}`
      : `Llevas ${dinero(gastado)} de ${dinero(tope)}. Te pasaste por ${dinero(-resta)}`;
    return `<p class="presupuesto ${color}">${texto}</p>`;
  },

  // A4 · Bajo cada categoría (solo en "Esta semana"): tu promedio por semana contra lo de esta semana.
  // Se marca en ámbar solo cuando de verdad sube (más de 20 % o $100, con 2 o más semanas anteriores). Nunca en Transporte.
  lineaTendencia(nombre) {
    if (this.periodo !== "semana" || nombre === "Transporte") return "";
    const s = Patrones.porSemana();
    const f = s && !s.error && s.categorias.find(x => x.categoria === nombre);
    if (!f || f.promedioAnteriores == null) return "";
    this._hayTendencia = true;
    return `<p class="tendencia ${f.marca ? "marca" : ""}">Promedio ${dineroCorto(f.promedioAnteriores)} por semana · esta semana ${dineroCorto(f.actual)}${f.marca ? ` · va ${f.porcentaje} % más alto` : ""}</p>`;
  },

  mostrar() {
    if ($("pantalla-resumen").hidden) return;
    document.querySelectorAll("[data-periodo]").forEach(b =>
      b.classList.toggle("activo", b.dataset.periodo === this.periodo));

    const c = this.calcular(this.periodo);
    $("r-rango").textContent = `Del ${fechaCorta(c.rango.inicio)} al ${fechaCorta(c.rango.fin)}`;

    this._hayTendencia = false;
    // Con 13 categorías, las que están en $0 no se listan (menos Comida y Transporte, que tienen lo apartado)
    $("r-categorias").innerHTML = c.porCategoria.filter(cat => cat.total > 0.005 || this.presupuestoSemanal(cat.nombre) != null).map(cat => {
      const parte = c.totalGastado > 0 ? cat.total / c.totalGastado : 0;
      const semanal = this.presupuestoSemanal(cat.nombre);
      const tope = semanal == null ? null : redondear(semanal * c.rango.factor);
      // Comida y Súper salen de lo mismo apartado: la barra de Comida cuenta los dos (v102)
      const conSuper = cat.nombre === "Comida" && c.totalSuper > 0.005;
      const usado = cat.nombre === "Comida" ? redondear(cat.total + c.totalSuper) : cat.total;
      const estado = tope == null ? "" : usado > tope + 0.005 ? "rojo" : usado > tope * 0.8 ? "amarillo" : "verde";
      return `
        <li class="cat ${estado}">
          <div class="deuda-cabeza">
            <span class="deuda-nombre">${cat.nombre}</span>
            <span class="deuda-saldo neutro">${dineroCorto(cat.total)}${tope != null ? ` <small>de ${dineroCorto(tope)}</small>` : ""}</span>
          </div>
          <div class="barra fina ${estado}"><div class="barra-relleno" style="--p:${tope ? Math.min(1, usado / tope) : parte}"></div></div>
          ${conSuper ? `<p class="nota-cat">Con el súper (${dineroCorto(c.totalSuper)}) llevas ${dineroCorto(usado)} de lo apartado para comida</p>` : ""}
          ${cat.nombre === "Súper" ? `<p class="nota-cat">Sale de lo apartado para comida</p>` : ""}
          ${this.lineaTendencia(cat.nombre)}
          ${tope != null && usado > tope + 0.005 ? `<p class="presupuesto rojo">Te pasaste por ${dinero(usado - tope)}</p>` : ""}
        </li>`;
    }).join("");

    const dow = new Date().getDay(), dias = dow === 0 ? 7 : dow;
    $("r-tendencia-nota").hidden = !this._hayTendencia;
    $("r-tendencia-nota").textContent = dias < 7 ? `La semana va por el día ${dias} de 7: lo de esta semana todavía crece.` : "";
    $("r-totales").innerHTML = `
      <li class="total"><span>Total en gastos</span><span>${dinero(c.totalGastado)}</span></li>
      <li><span>Pagos a deudas (renta, préstamo, planes de pago)</span><span>${dinero(c.pagosDeudas)}</span></li>
      <li class="total"><span>Total que salió</span><span>${dinero(redondear(c.totalGastado + c.pagosDeudas))}</span></li>
      <li><span>Ingreso del período</span><span class="ok">${dinero(c.ingresos)}</span></li>`;

    this.mostrarUltimaRevision();
  },

  // Lo que cuentas tú (efectivo + cuenta) contra el número de arriba ("Tengo")
  mostrarUltimaRevision() {
    const p = Dinero.pasoAPaso();
    const desde = p.inicial
      ? ` (desde que corregiste tu dinero a ${dinero(p.inicial.monto)} el ${this.momentoTexto(p.inicial.momento)})` : "";
    $("r-ultimo").innerHTML = `La app calcula que tienes <strong>${Futuro.plata(p.total)}</strong>${desde}.
      Cuenta tu efectivo y tu cuenta, escríbelo y toca "Revisar".`;
    if (!$("r-detalle").hidden) this.mostrarDetalle();
  },

  momentoTexto(iso) {
    return new Date(iso).toLocaleString("es", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  },

  // "Ver de dónde sale": la cuenta paso a paso
  mostrarDetalle() {
    const p = Dinero.pasoAPaso();
    const fila = (t, sub, monto, clase = "") => `<li><span>${t}${sub ? `<span class="detalle">${sub}</span>` : ""}</span><span class="${clase}">${monto}</span></li>`;
    const nombre = m => escapar(m.nota || m.categoria || (m.tipo === "ingreso" ? "Ingreso" : "Pago de deuda"));
    $("r-detalle").innerHTML = `<ul class="resumen">
      ${p.inicial ? fila("Corregiste tu dinero", this.momentoTexto(p.inicial.momento), dinero(p.inicial.monto)) : fila("Empieza en", "", dinero(0))}
      ${p.movs.map(m => fila(nombre(m), `${fechaCorta(m.fecha)} · registrado ${this.momentoTexto(m.creado)}`,
        m.tipo === "ingreso" ? `+${dinero(m.monto)}` : `−${dinero(m.monto)}`, m.tipo === "ingreso" ? "ok" : "")).join("")}
      <li class="total"><span>La app calcula</span><span>${Futuro.plata(p.total)}</span></li></ul>
      <p class="estado">Solo cuenta lo registrado después de tu última corrección. Lo marcado como "ya estaba incluido" no se cuenta otra vez.</p>`;
  },

  revisar() {
    const txt = $("r-dinero").value.trim();
    const monto = redondear(Number(txt));
    const res = $("r-resultado");
    $("r-acciones").innerHTML = "";
    if (txt === "" || !(monto >= 0)) {
      res.className = "mensaje-sobrante negativo";
      res.textContent = "Cuenta tu dinero (efectivo + cuenta) y escríbelo.";
      return;
    }
    const app = Dinero.actual();
    const diferencia = redondear(monto - app);
    if (Math.abs(diferencia) < this.CUADRA) {
      res.className = "mensaje-sobrante cuadra";
      res.textContent = `✓ Cuadra: tienes ${dinero(monto)} y la app calcula ${Futuro.plata(app)}.`;
    } else if (diferencia < 0) {
      res.className = "mensaje-sobrante negativo";
      res.textContent = `Faltan ${dinero(-diferencia)} por registrar: la app calcula ${Futuro.plata(app)} y tú tienes ${dinero(monto)}.`;
      $("r-acciones").innerHTML = `
        <button class="boton-chico lleno" data-r-gasto="${-diferencia}">Registrar el gasto que falta (${dinero(-diferencia)})</button>
        <button class="boton-chico" data-r-corregir="${monto}">Corregir mi dinero a ${dinero(monto)}</button>`;
    } else {
      res.className = "mensaje-sobrante aviso";
      res.textContent = `Tienes ${dinero(diferencia)} más de lo que calcula la app (${Futuro.plata(app)}). ¿Falta registrar un ingreso?`;
      $("r-acciones").innerHTML = `
        <button class="boton-chico lleno" data-r-ingreso="${diferencia}">Registrar el ingreso que falta (${dinero(diferencia)})</button>
        <button class="boton-chico" data-r-corregir="${monto}">Corregir mi dinero a ${dinero(monto)}</button>`;
    }
    // Se guarda lo que contaste (historial)
    Almacen.guardarRevision({ monto, momento: new Date().toISOString() });
  },

  iniciar() {
    $("volver-resumen").addEventListener("click", () => this.cerrar());
    document.querySelectorAll("[data-periodo]").forEach(b =>
      b.addEventListener("click", () => { this.periodo = b.dataset.periodo; this.mostrar(); }));
    $("r-revisar").addEventListener("click", () => this.revisar());
    $("r-ver").addEventListener("click", () => {
      $("r-detalle").hidden = !$("r-detalle").hidden;
      $("r-ver").textContent = $("r-detalle").hidden ? "Ver de dónde sale" : "Ocultar";
      if (!$("r-detalle").hidden) this.mostrarDetalle();
    });
    $("r-acciones").addEventListener("click", e => {
      const g = e.target.closest("[data-r-gasto]");
      if (g) abrirFormulario("gasto", { monto: Number(g.dataset.rGasto) });
      const i = e.target.closest("[data-r-ingreso]");
      if (i) { abrirFormulario("ingreso", { monto: Number(i.dataset.rIngreso) }); $("f-tipo-ingreso").value = "otro"; $("f-tipo-ingreso").dispatchEvent(new Event("change", { bubbles: true })); }
      const c = e.target.closest("[data-r-corregir]");
      if (c) abrirFormulario("corregirDinero", { monto: Number(c.dataset.rCorregir) });
    });
    window.addEventListener("movimientos-cambiaron", () => this.mostrar());
  }
};

if (Datos.actual) Resumen.iniciar();

/*
 * CIERRE DEL MES (Plan 2, 2.5) · pantalla "Mi mes"
 * La versión de lectura única de "A dónde va": lo que entró y salió de un mes, cada categoría contra el mes anterior,
 * los pagos fijos a tiempo y con retraso, y lo que pagaste a cada deuda. Solo lee lo registrado; no guarda datos de dinero.
 *   · Las sumas salen de Resumen.calcularRango (la misma cuenta de "A dónde va").
 *   · El mes en curso se compara con el mismo tramo del mes anterior (del 1 al día de hoy), no con el mes entero.
 *   · La app no guarda el saldo de cada día: "cuánto bajaron las deudas" son los pagos del mes por deuda y lo que debes hoy.
 *   · Transporte se muestra, pero nunca se marca (regla del consejero). Las demás se marcan en ámbar si suben más de 20 % y más de $100.
 *   · Del 1 al 5 de cada mes, la campana avisa que está el cierre del mes anterior (una vez; se recuerda en este teléfono: clave "cierres").
 */
const Cierre = {
  MAX_MESES: 12,
  _meses: [], _i: 0, _pedido: null,

  // ---------- Meses ----------
  dos(n) { return String(n).padStart(2, "0"); },
  nombreMes(ym) { const n = Calendario.MESES[Number(ym.slice(5, 7)) - 1]; return n.charAt(0).toUpperCase() + n.slice(1); },
  titulo(ym) { return `${this.nombreMes(ym)} ${ym.slice(0, 4)}`; },
  mesAnterior(ym) { const a = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)); return m === 1 ? `${a - 1}-12` : `${a}-${this.dos(m - 1)}`; },
  ultimoDia(ym) { return new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate(); },
  primerMes() {
    const f = Almacen.leerMovimientos().filter(m => m.tipo !== "ajuste" && m.fecha).map(m => m.fecha).sort()[0];
    return f ? f.slice(0, 7) : null;
  },

  // Desde el primer mes con movimientos (o hasta 12 meses atrás) hasta el mes en curso, sin saltarse ninguno
  meses() {
    const hoyM = hoy().slice(0, 7), prim = this.primerMes() || hoyM;
    const lista = [];
    for (let ym = hoyM; ym >= prim && lista.length < this.MAX_MESES; ym = this.mesAnterior(ym)) lista.unshift(ym);
    return lista;
  },

  // ---------- Los números de un mes ----------
  datos(ym) {
    const hoyC = hoy(), enCurso = ym === hoyC.slice(0, 7);
    const corte = enCurso ? Number(hoyC.slice(8)) : this.ultimoDia(ym);
    const prev = this.mesAnterior(ym), prevCorte = enCurso ? Math.min(corte, this.ultimoDia(prev)) : this.ultimoDia(prev);
    const actual = Resumen.calcularRango(`${ym}-01`, `${ym}-${this.dos(corte)}`);
    const previo = Resumen.calcularRango(`${prev}-01`, `${prev}-${this.dos(prevCorte)}`);
    const conPrevio = previo.movimientos > 0;
    const nombres = [...new Set([...actual.porCategoria.map(c => c.nombre), ...previo.porCategoria.map(c => c.nombre)])];
    const categorias = nombres.map(nombre => {
      const total = (actual.porCategoria.find(c => c.nombre === nombre) || { total: 0 }).total, antes = (previo.porCategoria.find(c => c.nombre === nombre) || { total: 0 }).total;
      const dif = redondear(total - antes), pct = antes > 0 ? Math.round(dif / antes * 100) : null;
      return { nombre, total, antes, dif, pct, nuevo: conPrevio && antes === 0 && total > 0, yaNo: conPrevio && total === 0 && antes > 0,
               marca: conPrevio && nombre !== "Transporte" && dif > 100 && pct != null && pct > 20 };
    }).filter(c => c.total > 0 || c.antes > 0);
    const salio = redondear(actual.totalGastado + actual.pagosDeudas);
    return { ym, enCurso, corte, ultimo: this.ultimoDia(ym), prev, prevCorte, actual, previo, conPrevio, categorias,
             entro: actual.ingresos, cheques: actual.cheques, otros: redondear(actual.ingresos - actual.cheques), salio, quedo: redondear(actual.ingresos - salio),
             pagos: this.pagosFijos(ym, corte), deudas: this.deudasDelMes(actual) };
  },

  // Pagos fijos del mes: a tiempo (pagado en su fecha o antes), con retraso o sin pagar. Solo en meses desde que hay registro.
  pagosFijos(ym, corte) {
    const prim = this.primerMes();
    if (!prim || ym < prim) return null;
    const hoyC = hoy(), inicio = `${ym}-01`, fin = `${ym}-${this.dos(corte)}`;
    const fechaDePago = {};
    Almacen.leerMovimientos().forEach(m => {
      if (m.vencimiento && m.fecha && (m.tipo === "gasto" || m.tipo === "pagoDeuda") && (!fechaDePago[m.vencimiento] || m.fecha < fechaDePago[m.vencimiento])) fechaDePago[m.vencimiento] = m.fecha;
    });
    const r = { aTiempo: 0, tarde: [], sinPagar: [] };
    Vencimientos.entre(inicio, fin).filter(i => !i.alerta && !i.planeado && !i.inmediato && !["plandeuda", "recargo"].includes(i.id) && i.fecha >= inicio && i.fecha <= fin).forEach(i => {
      i.partes.forEach(p => {
        const pago = fechaDePago[p.clave] || (p.pagado ? i.fecha : null);
        if (pago) {
          if (pago <= i.fecha) r.aTiempo++;
          else r.tarde.push({ nombre: p.nombre, monto: p.monto, dias: Math.round((Jornadas.aFecha(pago) - Jornadas.aFecha(i.fecha)) / 86400000) });
        } else if (i.fecha < hoyC) r.sinPagar.push({ nombre: p.nombre, monto: p.monto });
      });
    });
    r.total = r.aTiempo + r.tarde.length + r.sinPagar.length;
    return r;
  },

  deudasDelMes(actual) {
    const nombre = id => { const d = Datos.deudas().find(x => x.id === id); return d ? d.nombre : "Una deuda que ya no está"; };
    const lista = Object.entries(actual.porDeuda).map(([id, monto]) => ({ nombre: nombre(id), monto })).sort((a, b) => b.monto - a.monto);
    const hoyDebes = redondear(Datos.deudas().reduce((s, d) => s + Math.max(0, Datos.saldoReparto(d.id)), 0));
    return { lista, total: actual.pagosDeudas, hoyDebes };
  },

  // ---------- Pantalla ----------
  vistos() { return Almacen.leer("cierres") || {}; },
  marcarVisto(ym) { const v = this.vistos(); if (v[ym]) return; v[ym] = 1; Almacen.guardar("cierres", v); },

  // Del 1 al 5: el mes anterior, si tuvo movimientos y todavía no lo viste
  avisoPendiente() {
    const h = hoy();
    if (Number(h.slice(8)) > 5) return null;
    const prev = this.mesAnterior(h.slice(0, 7)), prim = this.primerMes();
    if (!prim || prev < prim || this.vistos()[prev]) return null;
    return Almacen.leerMovimientos().some(m => m.tipo !== "ajuste" && m.fecha && m.fecha.startsWith(prev)) ? prev : null;
  },

  abrir() {
    this._meses = this.meses();
    const pedido = this._pedido && this._meses.includes(this._pedido) ? this._pedido : hoy().slice(0, 7);
    this._pedido = null;
    this._i = Math.max(0, this._meses.indexOf(pedido));
    document.querySelectorAll("main.contenedor").forEach(x => { x.hidden = true; });
    $("pantalla-inicio").hidden = true;
    $("pantalla-mes").hidden = false;
    window.scrollTo(0, 0);
    this.mostrar();
  },

  cerrar() { Nav.ir("resumen"); },

  mover(delta) {
    const i = this._i + delta;
    if (i < 0 || i >= this._meses.length) return;
    this._i = i;
    this.mostrar();
    window.scrollTo(0, 0);
  },

  mostrar() {
    if ($("pantalla-mes").hidden) return;
    const ym = this._meses[this._i], d = this.datos(ym);
    $("cm-titulo").textContent = this.titulo(ym);
    $("cm-mes").textContent = this.nombreMes(ym);
    $("cm-ant").disabled = this._i === 0;
    $("cm-sig").disabled = this._i === this._meses.length - 1;
    $("cm-sub").textContent = d.enCurso ? `En curso: va por el día ${d.corte} de ${d.ultimo}` : "";
    if (!d.enCurso) this.marcarVisto(ym);
    $("cm-contenido").innerHTML = d.actual.movimientos === 0
      ? `<section class="tarjeta"><p class="vacio">No anotaste nada en ${escapar(this.nombreMes(ym).toLowerCase())}.</p></section>` : this.html(d);
    if (typeof Avisos !== "undefined") Avisos.mostrar();
  },

  html(d) {
    const $$ = dineroCorto, mp = this.nombreMes(d.prev).toLowerCase();
    const tramo = d.enCurso ? ` <span class="opcional">(del 1 al ${d.corte})</span>` : "";
    const contra = d.enCurso ? `el 1 al ${d.prevCorte} de ${mp}` : mp;
    const entroSalio = `<section class="tarjeta"><h2>Entró y salió${tramo}</h2>
      <div class="cm-dos"><div><small>Entró</small><b class="cm-pos">${$$(d.entro)}</b><small>${d.entro > 0 ? `Cheques ${$$(d.cheques)} · otros ${$$(d.otros)}` : "Nada anotado"}</small></div>
        <div><small>Salió</small><b>${$$(d.salio)}</b><small>Gastos ${$$(d.actual.totalGastado)} · deudas ${$$(d.actual.pagosDeudas)}</small></div></div>
      <div class="cm-f"><span>${d.quedo >= 0 ? "Quedó" : "Faltó"} (lo registrado)</span><b class="${d.quedo >= 0 ? "cm-pos" : "cm-neg"}">${d.quedo >= 0 ? "+" : "−"}${$$(Math.abs(d.quedo))}</b></div>
      <p class="cm-nota">Solo cuenta lo que anotaste en la app.${d.enCurso && d.conPrevio ? ` Se compara con ${escapar(contra)}, no con el mes entero: así la comparación es justa.` : ""}</p></section>`;

    const linea = c => {
      if (!d.conPrevio) return "";
      if (c.nuevo) return `<small><span class="cm-pill">nuevo</span> no había en ${mp}</small>`;
      if (c.yaNo) return `<small>En ${mp} gastaste ${$$(c.antes)}; este mes nada</small>`;
      if (c.dif === 0) return `<small>Igual que en ${mp}</small>`;
      return `<small class="${c.marca ? "cm-amb" : ""}">${$$(Math.abs(c.dif))} ${c.dif > 0 ? "más" : "menos"} que ${d.enCurso ? `del 1 al ${d.prevCorte} de ${mp}` : `en ${mp}`}${c.pct != null ? ` (${c.dif > 0 ? "+" : "−"}${Math.abs(c.pct)} %)` : ""}</small>`;
    };
    const cats = d.categorias.length ? d.categorias.map(c => `<div class="cm-cat"><div class="cm-fila"><b>${escapar(c.nombre)}</b><span>${$$(c.total)}</span></div>${linea(c)}</div>`).join("")
      : `<p class="vacio">Sin gastos este mes.</p>`;
    const categorias = `<section class="tarjeta"><h2>Por categoría${d.conPrevio ? ` <span class="opcional">(contra ${escapar(contra)})</span>` : ""}</h2>${cats}
      ${d.conPrevio ? "" : `<p class="cm-nota">No hay un mes anterior con movimientos para comparar.</p>`}</section>`;

    let pagos = "";
    if (d.pagos) {
      const p = d.pagos;
      pagos = `<section class="tarjeta"><h2>Pagos fijos</h2>
        ${p.total ? `<p class="cm-grande"><b>${p.aTiempo} de ${p.total}</b> a tiempo</p>` : `<p class="vacio">Ningún pago fijo venció${d.enCurso ? " todavía" : " este mes"}.</p>`}
        ${p.tarde.map(x => `<div class="cm-f"><span>${escapar(x.nombre)} <span class="cm-pill cm-a">${x.dias} ${x.dias === 1 ? "día" : "días"} tarde</span></span><b>${dinero(x.monto)}</b></div>`).join("")}
        ${p.sinPagar.map(x => `<div class="cm-f"><span>${escapar(x.nombre)} <span class="cm-pill cm-r">sin pagar</span></span><b>${dinero(x.monto)}</b></div>`).join("")}
        ${p.total ? `<p class="cm-nota">${p.sinPagar.length ? `Sin pagar ${d.enCurso ? "hasta hoy" : "al cierre"}: ${p.sinPagar.length}.` : `Sin pagar ${d.enCurso ? "hasta hoy" : "al cierre"}: ninguno.`}</p>` : ""}</section>`;
    }

    const de = d.deudas;
    const deudas = `<section class="tarjeta"><h2>Deudas</h2>
      ${de.total > 0 ? `<p class="cm-grande"><b class="cm-pos">${$$(de.total)}</b> en pagos a tus deudas</p>${de.lista.map(x => `<div class="cm-f"><span>${escapar(x.nombre)}</span><b>${$$(x.monto)}</b></div>`).join("")}`
        : `<p class="vacio">No registraste pagos a deudas este mes.</p>`}
      <div class="cm-f"><span>Hoy debes (lo atrasado)</span><b>${$$(de.hoyDebes)}</b></div>
      <p class="cm-nota">Los pagos son lo registrado en el mes; "Hoy debes" es la cuenta de hoy.</p></section>`;
    return entroSalio + categorias + pagos + deudas;
  },

  iniciar() {
    $("abrir-cierre").addEventListener("click", () => Nav.ir("cierre"));
    $("volver-mes").addEventListener("click", () => this.cerrar());
    $("cm-ant").addEventListener("click", () => this.mover(-1));
    $("cm-sig").addEventListener("click", () => this.mover(1));
    window.addEventListener("movimientos-cambiaron", () => { if (!$("pantalla-mes").hidden) this.mostrar(); });
  }
};

if (Datos.actual) Cierre.iniciar();
