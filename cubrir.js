/*
 * ¿CÓMO LO CUBRO?
 * Busca qué puedes hacer para cubrir el faltante más cercano, con la misma cuenta de proyeccion.js.
 * Prueba cada opción, la ordena de menos a más costosa y arma la combinación más barata.
 * Solo SUGIERE: nada cambia hasta que tocas un botón.
 * Reglas acordadas: las sugerencias solo mueven el TELÉFONO (permite_mover); el tren y el taxi no se tocan;
 * las horas extra se sugieren aparte, "solo si hay horas disponibles".
 */
const Cubrir = {
  HORIZONTE: 92,
  origen: "pantalla-inicio",

  escenario() {
    const id = Futuro.estado().escenario;
    return { id, monto: Escenarios.config()[id], titulo: Futuro.ESCENARIOS.find(e => e.id === id).titulo };
  },

  calcular(mod = {}) {
    return Proyeccion.calcular({ chequeEscenario: this.escenario().monto, horizonte: this.HORIZONTE, ...mod });
  },

  // Juntar varias opciones en una sola cuenta
  juntar(mods) {
    const r = { excluir: [], excluirPlaneado: [], extras: [] };
    mods.forEach(m => {
      if (m.proteger === false) r.proteger = false;
      if (m.comidaExtrema) r.comidaExtrema = true;
      r.excluir.push(...(m.excluir || []));
      r.excluirPlaneado.push(...(m.excluirPlaneado || []));
      r.extras.push(...(m.extras || []));
    });
    return r;
  },

  // Lo que todavía falta hasta el último día del faltante (0 = cubierto)
  queda(pr, f) {
    let min = 0;
    Object.keys(pr.porDia).forEach(d => { if (d <= f.fin) min = Math.min(min, pr.porDia[d].saldoFin); });
    return redondear(Math.max(0, -min));
  },

  // El primer cheque después del faltante (a donde se puede pasar un pago)
  despues(pr, f) { return pr.cheques.find(c => c > f.fin) || null; },

  // Valor neto de una hora extra
  valorHora() { return redondear(Jornadas.netoDeHoras(41) - Jornadas.netoDeHoras(40)); },

  // ---------- Las opciones ----------
  opciones(pr, f) {
    const ops = [];
    const dest = this.despues(pr, f);
    // 1) Usar el colchón (si está protegido y tiene algo)
    if (Proyeccion.protegerColchon() && Proyeccion.colchon() > 0) ops.push({ id: "colchon", costo: 0, titulo: "Usar el colchón",
      detalle: `Tienes ${dinero(Proyeccion.colchon())} protegidos.`, costoTxt: "Sin costo (es tu ahorro)", mod: { proteger: false }, accion: "colchon" });
    // 2) Pasar un gasto planeado para después del faltante
    if (dest) Almacen.leerPlaneados().filter(g => !Planeados.comprado(g) && g.elegido && g.elegido.some(p => p.fecha <= f.fin)).forEach(g => {
      const pendiente = redondear(g.elegido.reduce((s, p, i) => s + (Planeados.parteComprada(g, i) ? 0 : p.monto), 0));
      ops.push({ id: `planeado-${g.id}`, costo: 0, titulo: `Comprar "${g.nombre}" después`, detalle: `Pasarlo al ${Futuro.diaCorto(dest)} o más adelante.`,
        costoTxt: "Sin costo (solo esperar)", accion: "planeado", planeadoId: g.id,
        mod: { excluirPlaneado: [g.id], extras: [{ fecha: dest, monto: -pendiente, nombre: `${g.nombre} (después)` }] } });
    });
    // 3) Comida en modo extremo
    const min = Proyeccion.comidaMinima(), comida = Vencimientos.gasto("comida");
    if (min != null && comida && !Proyeccion.comidaExtrema()) ops.push({ id: "comida", costo: 1, titulo: "Comida en modo extremo",
      detalle: `${dinero(min)} en vez de ${dinero(comida.monto)} por semana, mientras haga falta.`, costoTxt: "Comer más ajustado (solo en caso extremo)",
      mod: { comidaExtrema: true }, accion: "comida" });
    // 4) Mover o dividir el teléfono (solo lo que permite moverse)
    const permitidos = Datos.actual.gastosFijos.filter(g => g.permite_mover === true).map(g => g.id);
    if (dest) pr.lineas.filter(l => l.tipo === "pago" && permitidos.includes(l.id) && l.claveMov && !l.movido && l.fecha <= f.fin).forEach(l => {
      const reglas = Mover.config().pagos[l.id] || {};
      ops.push({ id: `mover-${l.claveMov}`, costo: 2, titulo: `Mover ${l.nombre}`, detalle: `De ${Futuro.diaCorto(l.fecha)} al ${Futuro.diaCorto(dest)} (o dividirlo).`,
        costoTxt: reglas.recargo == null ? "Recargo por confirmar" : `Recargo de ${dinero(reglas.recargo)}`, accion: "mover", clave: l.claveMov, dest, monto: -l.monto, fecha: l.fecha, nombre: l.nombre,
        mod: { excluir: [l.claveMov], extras: [{ fecha: dest, monto: l.monto, nombre: `${l.nombre} (movido)` }] } });
    });
    // Lo que cubre cada una sola
    const base = this.queda(pr, f);
    ops.forEach(o => { o.cubre = redondear(Math.max(0, base - this.queda(this.calcular(this.juntar([o.mod])), f))); });
    return ops.filter(o => o.cubre > 0.005).sort((a, b) => a.costo - b.costo || b.cubre - a.cubre);
  },

  // Horas extra: semanas que todavía no terminan y se cobran antes o el día del faltante
  horasExtra(pr, f, falta) {
    const valor = this.valorHora();
    if (!(valor > 0)) return null;
    const hoyClave = hoy();
    const cheque = pr.cheques.find(c => c <= f.fecha && Jornadas.sumarDias(Plan.claveSemana(Jornadas.aFecha(c)), -1) >= hoyClave);
    if (!cheque) return null;
    const lunes = Jornadas.sumarDias(Plan.claveSemana(Jornadas.aFecha(cheque)), -7);
    const horas = Math.ceil(falta / valor);
    return { horas, valor, cheque, lunes, domingo: Jornadas.sumarDias(lunes, 6),
             mod: { extras: [{ fecha: cheque, monto: redondear(horas * valor), nombre: `Horas extra (${horas} h)` }] } };
  },

  // La combinación más barata: primero sin horas extra ni préstamo; si no alcanza, con préstamo; y aparte, con horas extra
  planear() {
    const pr = this.calcular();
    const f = Proyeccion.faltante(pr);
    if (!f) return { f: null };
    const ops = this.opciones(pr, f);
    const elegidas = [];
    let queda = this.queda(pr, f);
    for (let o of ops) {
      if (queda <= 0.005) break;
      const prueba = this.queda(this.calcular(this.juntar([...elegidas, o].map(x => x.mod))), f);
      if (prueba < queda - 0.005) {
        const aporta = redondear(queda - prueba);
        // Si basta con mover una parte del teléfono: el resto se paga en su fecha
        if (o.accion === "mover" && aporta < o.monto - 0.005) {
          const mover = redondear(Math.min(o.monto, Math.ceil(queda * 100) / 100));
          o = { ...o, partes: [{ fecha: o.fecha, monto: redondear(o.monto - mover) }, { fecha: o.dest, monto: mover }],
                detalle: `Dividirlo: ${dinero(o.monto - mover)} en su fecha (${Futuro.diaCorto(o.fecha)}) y ${dinero(mover)} el ${Futuro.diaCorto(o.dest)}.`,
                mod: { excluir: [o.clave], extras: [{ fecha: o.fecha, monto: -redondear(o.monto - mover), nombre: `${o.nombre} (parte 1)` },
                                                    { fecha: o.dest, monto: -mover, nombre: `${o.nombre} (parte 2)` }] } };
        }
        o.aporta = aporta;
        elegidas.push(o); queda = prueba;
      }
    }
    const conTodo = this.juntar(elegidas.map(x => x.mod));
    let prestamo = null, horas = null;
    if (queda > 0.005) {
      const monto = Math.ceil(queda / 10) * 10;
      prestamo = { monto, mod: { extras: [{ fecha: hoy(), monto, nombre: "Préstamo sin intereses" }] } };
      const h = this.horasExtra(pr, f, queda);
      if (h) horas = h;
    }
    const final = this.calcular(this.juntar([conTodo, ...(prestamo ? [prestamo.mod] : [])]));
    return { f, pr, ops, elegidas, quedaSin: queda, prestamo, horas, despues: Proyeccion.faltante(final), quedaFinal: this.queda(final, f) };
  },

  // ---------- Pantalla ----------
  abrir(origen = null) {
    this.origen = origen || Nav.visible();
    document.querySelectorAll("main.contenedor").forEach(x => { x.hidden = true; });
    $("pantalla-cubrir").hidden = false;
    window.scrollTo(0, 0);
    this.mostrar();
  },

  cerrar() {
    $("pantalla-cubrir").hidden = true;
    $(this.origen === "pantalla-cubrir" ? "pantalla-inicio" : this.origen).hidden = false;
    window.dispatchEvent(new Event("movimientos-cambiaron"));
  },

  mostrar() {
    if ($("pantalla-cubrir").hidden) return;
    const p = this.planear();
    this._p = p;
    const esc = this.escenario();
    if (!p.f) {
      $("cb-objetivo").innerHTML = `<p class="mensaje-sobrante positivo">✓ En los próximos 3 meses no te falta dinero (escenario ${escapar(esc.titulo)}).</p>`;
      $("cb-plan").innerHTML = ""; $("cb-otra").hidden = true; $("cb-todas").innerHTML = "";
      return;
    }
    const f = p.f;
    $("cb-objetivo").innerHTML = `<p class="cb-faltante">${escapar(Proyeccion.textoFaltante(f))}</p>
      <p class="estado">Escenario: ${escapar(esc.titulo)}. Para cubrirlo, el dinero tiene que estar antes de esa fecha.</p>`;
    // En "Te recomiendo" el botón usa la opción tal como quedó en el plan (ej.: el teléfono dividido)
    const boton = (o, i, delPlan = null) => o.accion ? `<button class="boton-chico lleno" data-cb-op="${i}" ${delPlan ? "data-cb-plan" : ""}>${{ colchon: "Usar", planeado: "Elegir otra fecha", comida: "Aplicar", mover: "Mover" }[o.accion]}</button>` : "";
    const filas = p.elegidas.map(o => `<li><div class="mov-info"><div class="mov-tipo">${escapar(o.titulo)}</div>
        <div class="mov-detalle">${escapar(o.detalle)} · ${escapar(o.costoTxt)}</div></div>
        <div class="pago-lado"><span class="mov-monto ok">cubre ${dinero(o.aporta)}</span>${boton(o, p.ops.findIndex(x => x.id === o.id), o)}</div></li>`);
    if (p.prestamo) filas.push(`<li><div class="mov-info"><div class="mov-tipo">Préstamo sin intereses de ${dinero(p.prestamo.monto)}</div>
        <div class="mov-detalle">Lo que falta${p.elegidas.length ? " después de lo de arriba" : ""}. Devolverlo cuando puedas (te dice cuándo).</div></div>
        <div class="pago-lado"><button class="boton-chico lleno" data-cb-prestamo>Ver cuándo lo pago</button></div></li>`);
    const cubierto = p.quedaFinal <= 0.005;
    $("cb-plan").innerHTML = `
      <ul class="movimientos cb-lista">${filas.join("")}</ul>
      <p class="mensaje-sobrante ${cubierto ? "positivo" : "negativo"}">${cubierto ? "✓ Con esto queda cubierto." : `Con esto todavía faltan ${dinero(p.quedaFinal)}.`}</p>
      ${p.despues && p.despues.fecha > f.fin ? `<p class="pc-hueco">Después queda otro: ${escapar(Proyeccion.textoFaltante(p.despues))}</p>` : ""}`;
    // Otra forma: horas extra en vez del préstamo (solo si hay)
    $("cb-otra").hidden = !p.horas;
    if (p.horas) $("cb-otra").innerHTML = `<h2>Otra forma: horas extra (solo si hay horas disponibles)</h2>
      <p>En vez del préstamo: unas <strong>${p.horas.horas} horas extra</strong> la semana del ${Futuro.diaCorto(p.horas.lunes)} al ${Futuro.diaCorto(p.horas.domingo)}
      (se cobran el ${Futuro.diaCorto(p.horas.cheque)}). Cada hora extra deja unos ${dinero(p.horas.valor)} netos.</p>
      <p class="estado">Depende de que en tu trabajo haya horas extra. Si no hay, usa la opción de arriba.</p>`;
    $("cb-todas").innerHTML = p.ops.length ? p.ops.map((o, i) => `<li><div class="mov-info"><div class="mov-tipo">${escapar(o.titulo)}</div>
        <div class="mov-detalle">${escapar(o.detalle)} · ${escapar(o.costoTxt)}</div></div>
        <div class="pago-lado"><span class="mov-monto">cubre ${dinero(Math.min(o.cubre, f.falta))}</span>${boton(o, i)}</div></li>`).join("")
      : `<li class="vacio">No hay opciones sin préstamo para estas fechas.</li>`;
  },

  aplicar(o) {
    const esc = this.escenario();
    if (o.accion === "colchon") { ColchonUI.cambiar(false); this.mostrar(); }
    if (o.accion === "comida") {
      Almacen.guardarFuturo({ comidaExtrema: true });
      Pantalla.aviso("Comida en modo extremo (solo en caso extremo)");
      window.dispatchEvent(new Event("movimientos-cambiaron"));
      this.mostrar();
    }
    if (o.accion === "planeado") { $("pantalla-cubrir").hidden = true; Planeados.abrirCuando(o.planeadoId); }
    if (o.accion === "mover") Mover.abrir(o.clave, "pantalla-cubrir", { monto: esc.monto, titulo: esc.titulo },
      { partes: o.partes || [{ fecha: o.dest, monto: o.monto }], motivo: "Para cubrir el faltante" });
  },

  prestamo() {
    const p = this._p;
    $("pantalla-cubrir").hidden = true;
    Prestamo.abrir();
    Prestamo.origen = "pantalla-cubrir";
    $("ps-tipo").value = "libre";
    Prestamo.cambiarTipo();
    $("ps-monto").value = p.prestamo.monto;
    $("ps-fecha").value = hoy();
    $("ps-para").value = "cubrir";
    Prestamo.llenarPlaneados();
  },

  iniciar() {
    $("volver-cubrir").addEventListener("click", () => this.cerrar());
    $("pantalla-cubrir").addEventListener("click", e => {
      const b = e.target.closest("[data-cb-op]");
      if (b) {
        const o = this._p.ops[Number(b.dataset.cbOp)];
        this.aplicar(b.hasAttribute("data-cb-plan") ? (this._p.elegidas.find(x => x.id === o.id) || o) : o);
      }
      if (e.target.closest("[data-cb-prestamo]")) this.prestamo();
    });
    document.addEventListener("click", e => { if (e.target.closest("[data-cubrir]")) this.abrir(); });
    window.addEventListener("movimientos-cambiaron", () => this.mostrar());
  }
};

if (Datos.actual) Cubrir.iniciar();
