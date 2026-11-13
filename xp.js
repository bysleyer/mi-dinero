/*
 * XP - experiencia y niveles (propuesta final aprobada)
 *
 * Cada hábito suma XP. El XP ganado se guarda en el almacén (clave "progreso") como un registro
 * permanente: NUNCA baja, aunque después borres un gasto o deshagas un pago.
 *
 * Reglas (ver la propuesta):
 *   registrar gastos del día           +10  (una vez al día)
 *   revisar los avisos                  +5  (una vez al día)         -> máximo 15 al día
 *   respaldo                           +10  (una vez a la semana)
 *   recibo del mes (luz...)            +15  (una vez al mes)
 *   pago fijo pagado en su fecha       +20  (cada pago)
 *   aporte al colchón                  +10  (una vez a la semana; se nota cuando subes el número del colchón en Plan)
 *   logros (logros.js)                 de +10 a +200 XP, una sola vez cada uno
 * Subir del nivel n al n+1 cuesta 100 + 50·(n−1) XP.
 *
 * Solo se cuenta lo que pasa desde que se activó el XP ("desde"): nada se calcula hacia atrás.
 * Pendiente: los jefes de deudas.
 *
 * Datos guardados: { desde, ganados: { id: { xp, fecha, tipo, texto } }, avisos: { fecha: 1 },
 *                    respaldos: { lunesDeLaSemana: 1 }, nivelVisto, tema,
 *                    logros: { id: { fecha, visto } }, flags: { vuelta, madrugador, colchon500 },
 *                    colchonVisto, colchonAportes, ultimaVisita }
 */
const Xp = {
  CLAVE: "progreso",
  PUNTOS: { registro: 10, avisos: 5, respaldo: 10, recibo: 15, pago: 20, colchon: 10 },
  TOPE_DIARIO: 15,

  // Iconos de nivel (uno por título) y temas de color que se desbloquean
  ICONOS: [
    { id: "brote", nombre: "Brote", titulo: "Principiante", desde: 1,
      svg: '<path d="M12 20v-7"/><path d="M12 13c0-3.2-2.2-5.4-5.5-5.4 0 3.2 2.2 5.4 5.5 5.4z"/><path d="M12 15.5c0-2.6 2-4.6 5.2-4.6 0 2.6-2 4.6-5.2 4.6z"/><path d="M7.5 20h9"/>' },
    { id: "alcancia", nombre: "Alcancía", titulo: "Ahorrador", desde: 4,
      svg: '<path d="M5.5 12.5c0-3.3 2.9-5.7 6.6-5.7 3 0 5.2 1.6 5.9 3.9h1.5v3.2h-1.6c-.8 2.2-2.9 3.6-5.6 3.6H10.5"/><path d="M5.5 12.5c-.9 0-1.5.4-1.5 1 0 .5.5.8 1.2.9"/><path d="M9.5 18.5v1.3M15.5 18.5v1.3"/><path d="M10.5 6.8c0-1.2 1-2 2.3-2s2.3.8 2.3 2"/><circle cx="16.4" cy="10.9" r=".7"/>' },
    { id: "brujula", nombre: "Brújula", titulo: "Estratega", desde: 7,
      svg: '<circle cx="12" cy="12" r="8.5"/><path d="M15.2 8.8 13.4 13.4 8.8 15.2 10.6 10.6z"/>' },
    { id: "gema", nombre: "Gema", titulo: "Maestro", desde: 10,
      svg: '<path d="M7.5 5h9l3 4.5L12 20 4.5 9.5z"/><path d="M4.5 9.5h15M10 5l2 4.5L14 5M10 9.5 12 20l2-10.5"/>' }
  ],
  TEMAS: [
    { id: "menta", nombre: "Menta", color: "#4fd1b5", desde: 1 },
    { id: "ambar", nombre: "Ámbar", color: "#f5b84b", desde: 3 },
    { id: "hielo", nombre: "Azul hielo", color: "#7fb8e6", desde: 5 },
    { id: "lavanda", nombre: "Lavanda", color: "#b9a4f0", desde: 8 }
  ],

  // ---------- Niveles ----------
  costoNivel(n) { return 100 + 50 * (n - 1); },

  nivelDe(total) {
    let nivel = 1, resto = Math.max(0, total);
    while (resto >= this.costoNivel(nivel)) { resto -= this.costoNivel(nivel); nivel++; }
    return { nivel, enNivel: resto, costo: this.costoNivel(nivel), faltan: this.costoNivel(nivel) - resto };
  },

  titulo(n) { return n >= 10 ? "Maestro" : n >= 7 ? "Estratega" : n >= 4 ? "Ahorrador" : "Principiante"; },
  icono(n) { return [...this.ICONOS].reverse().find(i => n >= i.desde) || this.ICONOS[0]; },
  svgIcono(i) { return `<svg viewBox="0 0 24 24" aria-hidden="true">${i.svg}</svg>`; },

  // ---------- Fechas ----------
  fechaLocal(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return null;
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },
  lunesDe(fecha) {                       // "2026-11-13" -> lunes de esa semana
    const [a, m, d] = fecha.split("-").map(Number);
    const f = new Date(a, m - 1, d);
    f.setDate(f.getDate() - ((f.getDay() + 6) % 7));
    const p = n => String(n).padStart(2, "0");
    return `${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())}`;
  },
  textoFecha(fecha) {
    const [a, m, d] = fecha.split("-").map(Number);
    return new Date(a, m - 1, d).toLocaleDateString("es", { day: "numeric", month: "short" }).replace(/\./g, "");
  },

  // ---------- Almacenamiento ----------
  _memoria: null,                        // si el almacenamiento está bloqueado, el XP vive solo en esta sesión

  leer() {
    let p = Almacen.leer(this.CLAVE);
    if (!p || typeof p !== "object") p = this._memoria;
    if (!p) {                                  // primera vez: queda anotado desde cuándo se cuenta el XP
      p = { desde: hoy(), ganados: {}, avisos: {}, respaldos: {}, nivelVisto: 1, tema: "menta", logros: {}, flags: {}, colchonVisto: null, colchonAportes: 0, ultimaVisita: null };
      this.guardar(p);
    }
    p.ganados = p.ganados || {}; p.avisos = p.avisos || {}; p.respaldos = p.respaldos || {};
    p.nivelVisto = p.nivelVisto || 1; p.tema = p.tema || "menta"; p.desde = p.desde || hoy();
    p.logros = p.logros || {}; p.flags = p.flags || {}; p.colchonAportes = p.colchonAportes || 0;
    if (p.colchonVisto === undefined) p.colchonVisto = null;
    return p;
  },
  guardar(p) {
    this._memoria = p;
    return Almacen.guardar(this.CLAVE, p);
  },

  // Suma un evento (una sola vez por id). Devuelve el XP ganado ahora (0 si ya estaba).
  ganar(p, id, xp, fecha, tipo, texto) {
    if (p.ganados[id]) return 0;
    p.ganados[id] = { xp, fecha, tipo, texto };
    return xp;
  },

  // ---------- Qué se gana ----------
  // Los pagos fijos con vencimiento (a tiempo o con retraso), uno por vencimiento, de lo registrado desde que se activó el XP
  pagosDeMovimientos(p) {
    const por = {};
    Almacen.leerMovimientos().forEach(m => {
      const dia = this.fechaLocal(m.creado);
      if (!dia || dia < p.desde) return;
      const v = typeof m.vencimiento === "string" && m.vencimiento.match(/@(\d{4}-\d{2}-\d{2})/);
      if (!v || !m.fecha || !(m.tipo === "gasto" || m.tipo === "pagoDeuda")) return;
      if (!por[m.vencimiento] || m.fecha < por[m.vencimiento].fecha) por[m.vencimiento] = { venc: v[1], fecha: m.fecha, aTiempo: m.fecha <= v[1] };
    });
    return Object.values(por);
  },

  // Revisa los datos de la app y anota lo nuevo. Devuelve { p, nuevo: [{xp, texto}] }.
  recalcular() {
    const p = this.leer();
    const antes = JSON.stringify(p);
    const nuevo = [];
    const sumar = (id, xp, fecha, tipo, texto) => { if (this.ganar(p, id, xp, fecha, tipo, texto)) nuevo.push({ xp, texto }); };
    const desde = p.desde;

    Almacen.leerMovimientos().forEach(m => {
      const dia = this.fechaLocal(m.creado);
      if (!dia || dia < desde) return;                       // solo lo registrado desde que se activó el XP
      if (m.tipo === "gasto") {
        sumar(`registro:${dia}`, this.PUNTOS.registro, dia, "registro", "Registraste tus gastos");
        if (new Date(m.creado).getHours() < 6) p.flags.madrugador = true;   // logro secreto: antes de las 6 a. m.
      }
      const v = typeof m.vencimiento === "string" && m.vencimiento.match(/@(\d{4}-\d{2}-\d{2})/);
      if (v && m.fecha && m.fecha <= v[1] && (m.tipo === "gasto" || m.tipo === "pagoDeuda"))
        sumar(`pago:${m.vencimiento}`, this.PUNTOS.pago, m.fecha, "pago", "Pagaste a tiempo");
    });
    Almacen.leerRecibos().forEach(r => {
      const dia = this.fechaLocal(r.creado);
      if (dia && dia >= desde && r.mes) sumar(`recibo:${r.mes}`, this.PUNTOS.recibo, dia, "recibo", "Anotaste el recibo del mes");
    });
    Object.keys(p.avisos).forEach(dia => { if (dia >= desde) sumar(`avisos:${dia}`, this.PUNTOS.avisos, dia, "avisos", "Revisaste tus avisos"); });
    Object.keys(p.respaldos).forEach(sem => { if (sem >= this.lunesDe(desde)) sumar(`respaldo:${sem}`, this.PUNTOS.respaldo, sem, "respaldo", "Hiciste un respaldo"); });

    // Colchón: un aporte es cuando el número sube respecto a lo último que vio la app (lo de antes de activar el XP no cuenta)
    let col = 0;
    try { col = Number((Almacen.leerPlan().sobres || {}).colchon) || 0; } catch (e) { /* sin plan */ }
    if (p.colchonVisto == null) p.colchonVisto = col;
    else if (col > p.colchonVisto + 0.004) {
      p.colchonAportes = (p.colchonAportes || 0) + 1;
      sumar(`colchon:${this.lunesDe(hoy())}`, this.PUNTOS.colchon, hoy(), "colchon", "Aportaste a tu colchón");
      if (col >= 500) p.flags.colchon500 = true;
      p.colchonVisto = col;
    } else if (col < p.colchonVisto - 0.004) p.colchonVisto = col;

    if (typeof Logros !== "undefined") Logros.evaluar(p, this.pagosDeMovimientos(p), sumar);

    if (JSON.stringify(p) !== antes) this.guardar(p);
    return { p, nuevo };
  },

  total(p) { return Object.values(p.ganados).reduce((s, e) => s + e.xp, 0); },

  // Estado listo para mostrar
  estado() {
    const { p } = this.recalcular();
    const t = this.total(p), n = this.nivelDe(t), dia = hoy();
    const deHoy = Object.values(p.ganados).filter(e => e.fecha === dia && (e.tipo === "registro" || e.tipo === "avisos"));
    return {
      p, total: t, ...n, titulo: this.titulo(n.nivel), icono: this.icono(n.nivel),
      pct: Math.round((n.enNivel / n.costo) * 100),
      hoy: { registro: deHoy.some(e => e.tipo === "registro"), avisos: deHoy.some(e => e.tipo === "avisos"), xp: deHoy.reduce((s, e) => s + e.xp, 0) },
      recientes: Object.values(p.ganados).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 8)
    };
  },

  // ---------- Hábitos que no salen de los movimientos ----------
  revisoAvisos() {
    const p = this.leer(); const dia = hoy();
    if (p.avisos[dia]) return;
    p.avisos[dia] = 1; this.guardar(p);
    this.actualizar();
  },
  hizoRespaldo() {
    const p = this.leer(); const sem = this.lunesDe(hoy());
    if (p.respaldos[sem]) return;
    p.respaldos[sem] = 1; this.guardar(p);
    this.actualizar();
  },

  // ---------- Pantallas ----------
  _ultimo: null,                         // { texto, hasta } para decir "+10 XP" un momento

  actualizar() {
    let e;
    try { e = this.estado(); } catch (err) { return; }       // el XP nunca debe romper la app
    this.aplicarTema(e.p.tema, e.nivel);
    const antes = this._totalAnterior;
    this._totalAnterior = e.total;
    if (antes != null && e.total > antes) this._ultimo = { xp: e.total - antes, hasta: Date.now() + 6000 };
    this.pintarFranja(e);
    if (!$("pantalla-progreso").hidden) this.pintarProgreso(e);
    const hayLogros = typeof Logros !== "undefined";
    if (hayLogros) { Logros.pintar(); Logros.mostrarPendientes(e.p); }
    // primero se muestran los logros nuevos y después la hoja de subida de nivel
    if (e.nivel > e.p.nivelVisto && !(hayLogros && (Logros.ocupado() || Logros.pendientes(e.p).length))) this.mostrarSubida(e);
  },

  pintarFranja(e) {
    const f = $("xp-franja"); if (!f) return;
    $("xp-ico").innerHTML = this.svgIcono(e.icono);
    $("xp-nivel-n").textContent = `Nivel ${e.nivel}`;
    $("xp-titulo").textContent = e.titulo;
    $("xp-cifra").textContent = `${e.enNivel} / ${e.costo} XP`;
    $("xp-barra-i").style.width = `${e.pct}%`;
    $("xp-barra").setAttribute("aria-valuemax", e.costo);
    $("xp-barra").setAttribute("aria-valuenow", e.enNivel);
    const reciente = this._ultimo && this._ultimo.hasta > Date.now();
    $("xp-pie").textContent = reciente ? `+${this._ultimo.xp} XP` : `${e.faltan} XP para el nivel ${e.nivel + 1}`;
    $("xp-pie").classList.toggle("xp-ganaste", !!reciente);
    f.setAttribute("aria-label", `Mi progreso: nivel ${e.nivel}, ${e.titulo}, ${e.enNivel} de ${e.costo} XP. Toca para ver el detalle.`);
    if (reciente) setTimeout(() => this.actualizar(), 6100);
  },

  pintarProgreso(e) {
    const circ = 301.6;
    $("xp-pg-anillo").style.strokeDashoffset = String(circ * (1 - e.pct / 100));
    $("xp-pg-nivel").textContent = e.nivel;
    $("xp-pg-titulo").textContent = e.titulo;
    $("xp-pg-cifra").textContent = `${e.enNivel} / ${e.costo} XP`;
    $("xp-pg-faltan").textContent = `Te faltan ${e.faltan} XP para el nivel ${e.nivel + 1}. Llevas ${e.total} XP en total.`;
    const mision = (hecho, texto, pts) => `<li class="xp-mision${hecho ? " hecha" : ""}"><span class="xp-check" aria-hidden="true">${hecho ? "✓" : ""}</span><span>${texto}</span><b>+${pts}</b></li>`;
    $("xp-pg-misiones").innerHTML =
      mision(e.hoy.registro, "Registra tus gastos de hoy", this.PUNTOS.registro) +
      mision(e.hoy.avisos, "Revisa tus avisos", this.PUNTOS.avisos);
    $("xp-pg-hoy").textContent = `Hoy: ${e.hoy.xp} de ${this.TOPE_DIARIO} XP posibles. Se reinicia a medianoche.`;
    if (typeof Logros !== "undefined") $("xp-pg-logros").textContent = `Ver los logros (${Logros.LISTA.filter(l => e.p.logros[l.id]).length} de ${Logros.LISTA.length})`;
    $("xp-pg-iconos").innerHTML = this.ICONOS.map(i => {
      const abierto = e.nivel >= i.desde;
      return `<li class="xp-premio${abierto ? "" : " bloqueado"}"><span class="xp-medalla">${abierto ? this.svgIcono(i) : '<span class="xp-candado" aria-hidden="true">🔒</span>'}</span><b>${i.nombre}</b><small>${abierto ? i.titulo : "Nivel " + i.desde}</small></li>`;
    }).join("");
    $("xp-pg-temas").innerHTML = this.TEMAS.map(t => {
      const abierto = e.nivel >= t.desde, activo = e.p.tema === t.id;
      return `<li><button type="button" class="xp-tema${activo ? " activo" : ""}" data-tema="${t.id}" ${abierto ? "" : "disabled"} aria-pressed="${activo}">
        <i style="background:${t.color}" aria-hidden="true"></i><b>${t.nombre}</b><small>${abierto ? (activo ? "En uso" : "Usar") : "Nivel " + t.desde}</small></button></li>`;
    }).join("");
    $("xp-pg-recientes").innerHTML = e.recientes.length
      ? e.recientes.map(r => `<li><span>${r.texto}<small>${this.textoFecha(r.fecha)}</small></span><b>+${r.xp}</b></li>`).join("")
      : `<li class="xp-vacio">Todavía no hay XP. Registra un gasto hoy y empieza.</li>`;
  },

  aplicarTema(id, nivel) {
    const t = this.TEMAS.find(x => x.id === id);
    const valido = t && nivel >= t.desde ? t.id : "menta";
    document.documentElement.dataset.tema = valido;
  },

  elegirTema(id) {
    const e = this.estado(); const t = this.TEMAS.find(x => x.id === id);
    if (!t || e.nivel < t.desde) return;
    e.p.tema = id; this.guardar(e.p);
    this.actualizar();
  },

  // ---------- Hoja al subir de nivel ----------
  mostrarSubida(e) {
    if (!$("xp-subida").hidden) return;
    const nuevoTitulo = this.titulo(e.nivel) !== this.titulo(e.p.nivelVisto);
    $("xp-su-nivel").textContent = e.nivel;
    $("xp-su-h").textContent = `Subiste al nivel ${e.nivel}`;
    $("xp-su-p").innerHTML = `Ahora eres <b>${e.titulo}</b> · ${e.total} XP`;
    const premios = [];
    this.ICONOS.filter(i => i.desde > e.p.nivelVisto && i.desde <= e.nivel).forEach(i => premios.push(`Ícono ${i.nombre}`));
    this.TEMAS.filter(t => t.desde > e.p.nivelVisto && t.desde <= e.nivel).forEach(t => premios.push(`Tema ${t.nombre}`));
    $("xp-su-premios").hidden = !premios.length;
    $("xp-su-chips").innerHTML = premios.map(x => `<span>${x}</span>`).join("");
    $("xp-su-texto").textContent = nuevoTitulo ? `Nuevo título: ${e.titulo}.${premios.length ? " Y nuevas recompensas para tu app." : ""}` : "Nuevas recompensas para tu app.";
    $("xp-su-premios").hidden = !premios.length && !nuevoTitulo;
    $("xp-subida").hidden = false;
    $("xp-hoja").focus({ preventScroll: true });   // el foco entra a la hoja (lectores de pantalla); "Seguir" se alcanza con Tab
  },

  cerrarSubida() {
    const p = this.leer(); p.nivelVisto = this.nivelDe(this.total(p)).nivel; this.guardar(p);
    $("xp-subida").hidden = true;
    this.actualizar();
  },

  abrir() {
    $("pantalla-inicio").hidden = true;
    $("pantalla-progreso").hidden = false;
    window.scrollTo(0, 0);
    this.actualizar();
  },
  cerrar() {
    $("pantalla-progreso").hidden = true;
    $("pantalla-inicio").hidden = false;
    window.scrollTo(0, 0);
  },

  iniciar() {
    $("abrir-progreso").addEventListener("click", () => this.abrir());
    $("volver-progreso").addEventListener("click", () => this.cerrar());
    $("xp-franja").addEventListener("click", () => { if (typeof Nav !== "undefined") Nav.ir("progreso"); else this.abrir(); });
    $("xp-su-seguir").addEventListener("click", () => this.cerrarSubida());
    $("xp-subida").addEventListener("keydown", ev => { if (ev.key === "Escape") this.cerrarSubida(); });
    $("xp-pg-temas").addEventListener("click", ev => { const b = ev.target.closest("[data-tema]"); if (b) this.elegirTema(b.dataset.tema); });
    // Logro secreto "Vuelta sin reproches": volver después de 7 días sin entrar
    const p = this.leer(), h = hoy();
    if (typeof Logros !== "undefined" && p.ultimaVisita && Logros.diasEntre(p.ultimaVisita, h) >= 7) p.flags.vuelta = true;
    p.ultimaVisita = h; this.guardar(p);
    this.actualizar();
  }
};

if (Datos.actual) Xp.iniciar();
