/*
 * LOGROS - 20 medallas por hábitos (propuesta aprobada)
 *
 * Cada logro se gana una sola vez, se guarda con su fecha (en "progreso", ver xp.js) y da XP.
 * Las condiciones son de hábito, no de cuánto ganas, gastas o ahorras. Los logros nunca se pierden.
 * Cada uno lleva el nombre de una mecánica de videojuego ("Inspirado en") y un ícono de píxeles.
 *
 * Lo que mira cada uno:
 *   registro  → los días con gastos registrados (xp.js los anota: "registro:AAAA-MM-DD")
 *   pagos     → los pagos fijos con vencimiento: a tiempo (pagado en su fecha o antes) o con retraso
 *   colchón   → cuando subes el número del colchón en Plan (se compara con lo último que vio la app)
 *   respaldos → las semanas y los meses en que hiciste un respaldo
 *   secretos  → volver después de 7 días, registrar antes de las 6 a. m., registrar el 31 de diciembre, llegar al nivel 10
 */
const Logros = {
  // Íconos de 8×8 píxeles: "#" = píxel encendido
  ICONOS: {
    inicio: ["##......", "####....", "######..", "########", "######..", "####....", "##......", "........"],
    bandera: ["..####..", "..####..", "..###...", "..#.....", "..#.....", "..#.....", "..#.....", "..#....."],
    combo: ["....###.", "...###..", "..###...", "..######", "....###.", "...###..", "..###...", ".##....."],
    mapa: ["...##...", "..####..", ".######.", "########", "########", "########", "########", "........"],
    corona: ["#......#", "#.#..#.#", "########", "########", "########", "........", "........", "........"],
    corazon: [".##..##.", "########", "########", ".######.", "..####..", "...##...", "........", "........"],
    moneda: ["..####..", ".#....#.", "#..##..#", "#..##..#", "#..##..#", "#..##..#", ".#....#.", "..####.."],
    estrella: ["...##...", "...##...", "########", ".######.", "..####..", ".##..##.", ".#....#.", "........"],
    barra: ["........", "########", "#.##.##.", "#.##.##.", "########", "........", "........", "........"],
    trofeo: [".######.", "########", "########", ".######.", "..####..", "...##...", "..####..", ".######."],
    setas: ["..####..", ".######.", "##.##.##", "########", "..####..", "..####..", "..#..#..", "........"],
    cofre: ["........", "########", "#......#", "########", "########", "#..##..#", "#......#", "########"],
    pila: ["........", "...##...", "..####..", ".######.", "########", "########", "########", "........"],
    guardar: ["########", "#......#", "#.####.#", "#......#", "#.####.#", "#.####.#", "########", "........"],
    checkpoint: ["........", "#.#.#.#.", ".#.#.#.#", "#.#.#.#.", ".#.#.#.#", "........", "...#....", "...#...."],
    partidas: ["........", "########", "........", "########", "........", "########", "........", "........"],
    continuar: ["..####..", ".##..#..", "#..#...#", "#....#.#", "#.#....#", "#...#..#", ".#....#.", "..####.."],
    huevo: ["..####..", ".######.", "########", "#.#..#.#", "########", "########", ".######.", "..####.."],
    fuegos: ["...##...", "..#..#..", "##.##.##", "...##...", "...##...", "##.##.##", "..#..#..", "...##..."],
    espada: ["......##", ".....##.", "....##..", "...##...", "##.##...", "###.....", ".##.....", "........"]
  },

  // v = animación propia al desbloquear ("giro" la moneda, "estrella", "temblar" el cofre)
  LISTA: [
    { id: "primer-registro", g: "Registro", n: "Primer registro", r: "Pulsa Start", c: "Registraste tu primer gasto.", xp: 25, i: "inicio" },
    { id: "mes-completo", g: "Registro", n: "Un mes completo", r: "Final de nivel", c: "Un mes con gastos registrados en 20 días.", xp: 50, i: "bandera" },
    { id: "combo-30", g: "Registro", n: "Combo de 30", r: "Combo", c: "30 días con gastos registrados, no necesariamente seguidos.", xp: 100, i: "combo" },
    { id: "campana-90", g: "Registro", n: "Campaña de 90", r: "Mapa del mundo", c: "90 días con gastos registrados.", xp: 150, i: "mapa" },
    { id: "un-ano", g: "Registro", n: "Un año de registros", r: "Corona final", c: "365 días con gastos registrados.", xp: 300, i: "corona" },
    { id: "semana-perfecta", g: "Registro", n: "Semana perfecta", r: "Sin game over", c: "7 días seguidos registrando gastos.", xp: 40, i: "corazon" },
    { id: "primer-pago", g: "Pagos", n: "Primer pago a tiempo", r: "Moneda", c: "Un pago fijo pagado en su fecha.", xp: 20, i: "moneda", v: "giro" },
    { id: "cinco-a-tiempo", g: "Pagos", n: "Cinco a tiempo", r: "Estrella de combo", c: "5 pagos fijos seguidos en su fecha.", xp: 40, i: "estrella", v: "estrella" },
    { id: "mes-sin-retrasos", g: "Pagos", n: "Un mes sin retrasos", r: "Barra de vida llena", c: "Un mes con 3 o más pagos y todos a tiempo.", xp: 60, i: "barra" },
    { id: "pagos-al-dia", g: "Pagos", n: "Pagos al día", r: "Partida perfecta", c: "3 meses seguidos sin retrasos.", xp: 120, i: "trofeo" },
    { id: "recuperacion", g: "Pagos", n: "Recuperación", r: "1-UP", c: "Volver a pagar a tiempo después de un retraso.", xp: 30, i: "setas" },
    { id: "primer-aporte", g: "Colchón y respaldos", n: "Primer aporte al colchón", r: "Cofre del tesoro", c: "Subir el número del colchón en Plan.", xp: 25, i: "cofre", v: "temblar" },
    { id: "colchon-500", g: "Colchón y respaldos", n: "Colchón de $500", r: "Pila de oro", c: "Llegar a $500 en el colchón.", xp: 80, i: "pila" },
    { id: "primer-respaldo", g: "Colchón y respaldos", n: "Primer respaldo", r: "Punto de guardado", c: "Hacer tu primer respaldo.", xp: 10, i: "guardar" },
    { id: "respaldo-constante", g: "Colchón y respaldos", n: "Respaldo constante", r: "Punto de control", c: "Un respaldo cada semana, 4 semanas seguidas.", xp: 60, i: "checkpoint" },
    { id: "un-ano-partidas", g: "Colchón y respaldos", n: "Un año de partidas", r: "Tarjeta de memoria", c: "Respaldos en 12 meses distintos.", xp: 150, i: "partidas" },
    { id: "vuelta", g: "Secretos", n: "Vuelta sin reproches", r: "Continuar", c: "Volver a la app después de 7 días sin entrar. Sin castigos por faltar.", xp: 20, i: "continuar", s: true },
    { id: "madrugador", g: "Secretos", n: "Madrugador", r: "Huevo de Pascua", c: "Registrar un gasto antes de las 6 a. m.", xp: 15, i: "huevo", s: true },
    { id: "fin-de-ano", g: "Secretos", n: "Fin de año", r: "Fuegos artificiales", c: "Registrar gastos el 31 de diciembre.", xp: 30, i: "fuegos", s: true },
    { id: "jefe-derrotado", g: "Secretos", n: "Jefe derrotado", r: "Espada legendaria", c: "Llegar al nivel 10.", xp: 200, i: "espada", s: true }
  ],
  GRUPOS: ["Registro", "Pagos", "Colchón y respaldos", "Secretos"],
  DURACION_AVISO: 3400,

  svgPixel(nombre) {
    let r = "";
    (this.ICONOS[nombre] || []).forEach((fila, y) => [...fila].forEach((c, x) => { if (c === "#") r += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));
    return `<svg viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
  },

  // ---------- Fechas ----------
  _dia(f) { const [a, m, d] = f.split("-").map(Number); return Date.UTC(a, m - 1, d) / 86400000; },
  diasEntre(a, b) { return Math.round(this._dia(b) - this._dia(a)); },
  mesSiguiente(mes) { const [a, m] = mes.split("-").map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`; },
  // Cuántos seguidos hay en una lista ordenada, donde "sigue(a, b)" dice si b va justo después de a
  rachaMayor(lista, sigue) {
    let mejor = lista.length ? 1 : 0, actual = mejor;
    for (let i = 1; i < lista.length; i++) { actual = sigue(lista[i - 1], lista[i]) ? actual + 1 : 1; if (actual > mejor) mejor = actual; }
    return mejor;
  },

  // ---------- Lo que mira cada logro ----------
  // pagos: [{ venc, fecha, aTiempo }] de los pagos fijos con vencimiento (ver xp.js)
  contexto(p, pagos) {
    const dias = Object.keys(p.ganados).filter(k => k.startsWith("registro:")).map(k => k.slice(9)).sort();
    const porMes = {};
    dias.forEach(d => { porMes[d.slice(0, 7)] = (porMes[d.slice(0, 7)] || 0) + 1; });
    const lista = pagos.slice().sort((a, b) => a.venc.localeCompare(b.venc) || a.fecha.localeCompare(b.fecha));
    const mesActual = hoy().slice(0, 7);
    const pagosPorMes = {};
    lista.forEach(x => { (pagosPorMes[x.venc.slice(0, 7)] = pagosPorMes[x.venc.slice(0, 7)] || []).push(x); });
    const mesesLimpios = Object.keys(pagosPorMes).filter(m => m < mesActual && pagosPorMes[m].length >= 3 && pagosPorMes[m].every(x => x.aTiempo)).sort();
    const semanas = Object.keys(p.respaldos).sort();
    const mesesRespaldo = new Set(semanas.map(s => s.slice(0, 7)));
    const iTarde = lista.findIndex(x => !x.aTiempo);
    return {
      dias, porMes, mesActual,
      rachaDias: this.rachaMayor(dias, (a, b) => this.diasEntre(a, b) === 1),
      mejorMes: Math.max(0, ...Object.values(porMes)),
      mesCompleto: Object.keys(porMes).some(m => m < mesActual && porMes[m] >= 20),
      pagosATiempo: lista.filter(x => x.aTiempo).length,
      rachaPagos: this._rachaATiempo(lista),
      mesesLimpios,
      mesesLimpiosSeguidos: this.rachaMayor(mesesLimpios, (a, b) => this.mesSiguiente(a) === b),
      recupero: iTarde >= 0 && lista.slice(iTarde + 1).some(x => x.aTiempo),
      semanas, rachaSemanas: this.rachaMayor(semanas, (a, b) => this.diasEntre(a, b) === 7),
      mesesRespaldo: mesesRespaldo.size
    };
  },
  _rachaATiempo(lista) {          // la racha más larga de pagos a tiempo, sin ningún retraso en medio
    let mejor = 0, actual = 0;
    lista.forEach(x => { actual = x.aTiempo ? actual + 1 : 0; if (actual > mejor) mejor = actual; });
    return mejor;
  },

  // [actual, meta] para la barra de avance; null si el logro es de sí o no
  avance(id, c, p) {
    const x = {
      "combo-30": [c.dias.length, 30], "campana-90": [c.dias.length, 90], "un-ano": [c.dias.length, 365],
      "semana-perfecta": [c.rachaDias, 7], "mes-completo": [c.mejorMes, 20], "cinco-a-tiempo": [c.rachaPagos, 5],
      "pagos-al-dia": [c.mesesLimpiosSeguidos, 3], "respaldo-constante": [c.rachaSemanas, 4], "un-ano-partidas": [c.mesesRespaldo, 12],
      "colchon-500": [Math.min(500, Math.round(p.colchonVisto || 0)), 500]
    }[id];
    return x ? [Math.min(x[0], x[1]), x[1]] : null;
  },

  cumple(id, c, p, nivel) {
    return {
      "primer-registro": () => c.dias.length >= 1,
      "mes-completo": () => c.mesCompleto,
      "combo-30": () => c.dias.length >= 30,
      "campana-90": () => c.dias.length >= 90,
      "un-ano": () => c.dias.length >= 365,
      "semana-perfecta": () => c.rachaDias >= 7,
      "primer-pago": () => c.pagosATiempo >= 1,
      "cinco-a-tiempo": () => c.rachaPagos >= 5,
      "mes-sin-retrasos": () => c.mesesLimpios.length >= 1,
      "pagos-al-dia": () => c.mesesLimpiosSeguidos >= 3,
      "recuperacion": () => c.recupero,
      "primer-aporte": () => (p.colchonAportes || 0) >= 1,
      "colchon-500": () => !!p.flags.colchon500,
      "primer-respaldo": () => c.semanas.length >= 1,
      "respaldo-constante": () => c.rachaSemanas >= 4,
      "un-ano-partidas": () => c.mesesRespaldo >= 12,
      "vuelta": () => !!p.flags.vuelta,
      "madrugador": () => !!p.flags.madrugador,
      "fin-de-ano": () => c.dias.some(d => d.endsWith("-12-31")),
      "jefe-derrotado": () => nivel >= 10
    }[id]();
  },

  // Anota los logros nuevos (con su XP). "sumar" es la función de xp.js que escribe en el registro de XP.
  evaluar(p, pagos, sumar) {
    let hubo = true, vueltas = 0;
    while (hubo && vueltas++ < 4) {                      // el XP de un logro puede subir de nivel y abrir otro (Jefe derrotado)
      hubo = false;
      const c = this.contexto(p, pagos);
      const nivel = Xp.nivelDe(Xp.total(p)).nivel;
      this.LISTA.forEach(l => {
        if (p.logros[l.id] || !this.cumple(l.id, c, p, nivel)) return;
        p.logros[l.id] = { fecha: hoy(), visto: false };
        sumar(`logro:${l.id}`, l.xp, hoy(), "logro", `Logro: ${l.n}`);
        hubo = true;
      });
    }
  },

  // ---------- Aviso al ganar un logro (centro de la pantalla, con animación) ----------
  _abierto: false, _timer: null, _espera: null,

  pendientes(p) { return this.LISTA.filter(l => p.logros[l.id] && !p.logros[l.id].visto); },
  ocupado() { return this._abierto || !!this._espera; },

  // Muestra el siguiente logro que todavía no se ha mostrado
  mostrarPendientes(p) {
    if (this._abierto || this._espera || !$("lg-aviso")) return;
    const l = this.pendientes(p)[0];
    if (!l) return;
    // un momento después, para que se vea primero el "Guardado" de lo que acabas de hacer
    this._espera = setTimeout(() => { this._espera = null; this.abrirAviso(l); }, 900);
  },

  abrirAviso(l) {
    const aviso = $("lg-aviso");
    $("lg-aviso-nombre").textContent = l.n;
    $("lg-aviso-xp").textContent = `+${l.xp} XP`;
    $("lg-aviso-ref").textContent = `Inspirado en: ${l.r}`;
    let particulas = "";
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; particulas += `<span class="lg-part" style="--dx:${Math.round(Math.cos(a) * 78)}px;--dy:${Math.round(Math.sin(a) * 78)}px"></span>`; }
    $("lg-aviso-ico").innerHTML = `<span class="lg-anillo"></span>${particulas}${this.svgPixel(l.i)}`;
    aviso.className = "lg-aviso" + (l.v ? ` lg-${l.v}` : "");
    aviso.hidden = false;
    void aviso.offsetWidth;
    aviso.classList.add("lg-mostrar");
    this._abierto = true;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.cerrarAviso(), this.DURACION_AVISO);
    // queda anotado que ya se mostró (aunque lo cierres antes)
    const p = Xp.leer(); if (p.logros[l.id]) { p.logros[l.id].visto = true; Xp.guardar(p); }
  },

  cerrarAviso() {
    clearTimeout(this._timer);
    const aviso = $("lg-aviso"); if (!aviso || aviso.hidden) { this._abierto = false; return; }
    aviso.hidden = true; aviso.classList.remove("lg-mostrar");
    this._abierto = false;
    Xp.actualizar();                                     // sigue con el próximo logro o con la hoja de nivel
  },

  // ---------- Pantalla "Logros" ----------
  abrir() {
    $("pantalla-inicio").hidden = true;
    $("pantalla-logros").hidden = false;
    window.scrollTo(0, 0);
    this.pintar();
  },
  cerrar() {
    $("pantalla-logros").hidden = true;
    $("pantalla-inicio").hidden = false;
    window.scrollTo(0, 0);
  },

  pintar() {
    if ($("pantalla-logros").hidden) return;
    const p = Xp.leer(), pagos = Xp.pagosDeMovimientos(p);
    const c = this.contexto(p, pagos);
    const ganados = this.LISTA.filter(l => p.logros[l.id]);
    $("lg-resumen").textContent = `${ganados.length} de ${this.LISTA.length} logros`;
    $("lg-resumen-xp").textContent = `${ganados.reduce((s, l) => s + l.xp, 0)} XP ganados con logros`;
    const fecha = f => { const [a, m, d] = f.split("-").map(Number); return new Date(a, m - 1, d).toLocaleDateString("es", { day: "numeric", month: "short" }).replace(/\./g, ""); };
    $("lg-lista").innerHTML = this.GRUPOS.map(g => {
      const tarjetas = this.LISTA.filter(l => l.g === g).map(l => {
        const ok = p.logros[l.id], av = !ok && this.avance(l.id, c, p);
        const estado = ok ? `Ganado · ${fecha(ok.fecha)}` : av ? `${av[0]} de ${av[1]}` : l.s ? "Secreto" : "Pendiente";
        const clase = ok ? "ganado" : av && av[0] > 0 ? "curso" : l.s ? "secreto" : "";
        const barra = av ? `<span class="lg-barra" aria-hidden="true"><i style="width:${Math.round(av[0] / av[1] * 100)}%"></i></span>` : "";
        return `<li class="lg-tarjeta ${clase}">
          <span class="lg-ico" aria-hidden="true">${this.svgPixel(l.i)}</span>
          <span class="lg-texto"><b class="lg-nombre">${l.n}</b>
            <span class="lg-ref">${ok || !l.s ? `Inspirado en: ${l.r}` : "Inspirado en: ???"}</span>
            <span class="lg-cond">${l.c}</span>${barra}
            <span class="lg-meta"><span class="lg-xp">+${l.xp} XP</span><span class="lg-estado">${estado}</span></span></span></li>`;
      }).join("");
      return `<h2 class="lg-grupo">${g}</h2><ul class="lg-grid">${tarjetas}</ul>`;
    }).join("");
  },

  iniciar() {
    $("abrir-logros").addEventListener("click", () => this.abrir());
    $("volver-logros").addEventListener("click", () => this.cerrar());
    $("xp-pg-logros").addEventListener("click", () => { if (typeof Nav !== "undefined") Nav.ir("logros"); else this.abrir(); });
    $("lg-aviso").addEventListener("click", () => this.cerrarAviso());
    $("lg-aviso").addEventListener("keydown", ev => { if (ev.key === "Escape" || ev.key === "Enter") this.cerrarAviso(); });
  }
};

if (Datos.actual) Logros.iniciar();
