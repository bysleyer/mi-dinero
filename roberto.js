/*
 * ROBERTO: la pantalla de tu asesor financiero (Más → Roberto).
 * Roberto es un agente de Claude que trabaja aparte, en tareas programadas (5:58 a. m. a 7:58 p. m., hora de Nueva York).
 * Él NO toca la app: deja sus archivos en el repositorio PRIVADO de datos y esta pantalla solo los lee.
 *   - roberto/estado.json        dónde está, qué hace, su fase y si quiere hablar contigo (pideHablar)
 *   - roberto/conversacion.json  sus mensajes para ti y hasta dónde leyó los tuyos (leidoHasta)
 *   - roberto/cuaderno.json      su fase y sus metas (las muestra la pizarra de la oficina 3D, roberto3d.js)
 * Lo que tú le escribes (o la opción que eliges en una reunión) va en la lista "mensajesRoberto", que viaja con la
 * sincronización como las notas del consejero. Él lo lee en su próxima corrida y te contesta. No es un chat en vivo.
 * Sin sincronización activa no hay forma de hablar con él: la pantalla lo dice.
 */
const Roberto = {
  ARCHIVOS: { estado: "roberto/estado.json", conversacion: "roberto/conversacion.json", cuaderno: "roberto/cuaderno.json" },
  // Corridas: cada hora a los :58, de 5:58 a. m. a 7:58 p. m. (hora de Nueva York)
  PRIMERA: 5, ULTIMA: 19, MINUTO: 58,
  LUGARES: {
    escritorio: ["🪑", "En su escritorio"], archivo: ["🗄️", "En el archivo"], pizarra: ["📊", "En la pizarra"],
    cafe: ["☕", "Tomando café"], sala: ["🤝", "En la sala de reuniones"], tuOficina: ["🚪", "En la puerta de tu oficina"],
    entrada: ["🚶", "En la entrada"], fuera: ["🏠", "Se fue a casa"]
  },

  leer() { return Almacen.leer("roberto") || {}; },
  mensajes() { return (Almacen.leer("mensajesRoberto") || []).filter(m => !m.borrado); },
  puedeEscribir() { return typeof Sync !== "undefined" && Sync.activo() && !Sync.soloVer(); },

  // ---------- Bajar sus archivos del repositorio de datos ----------
  async bajar() {
    if (typeof Sync === "undefined" || !Sync.activo()) return;
    const actual = this.leer(), nuevo = { ...actual };
    let cambio = false;
    for (const [clave, ruta] of Object.entries(this.ARCHIVOS)) {
      try {
        const r = await Sync.api(`/contents/${ruta}`);
        if (!r.ok) continue; // 404: Roberto todavía no escribió ese archivo
        const j = await r.json();
        if (actual["_sha_" + clave] === j.sha) continue;
        const d = JSON.parse(Sync.deBase64(j.content || ""));
        if (!d || !String(d.formato || "").startsWith("roberto-")) continue;
        nuevo[clave] = d; nuevo["_sha_" + clave] = j.sha; cambio = true;
      } catch (e) { /* sin internet: se usa lo último que bajó */ }
    }
    if (!cambio) return;
    const antes = this.suyos(actual).length, despues = this.suyos(nuevo).length;
    Almacen.guardar("roberto", nuevo);
    this.mostrarMosaico();
    if (!$("pantalla-roberto").hidden) this.mostrar();
    else if (actual.conversacion && despues > antes) Pantalla.aviso("🇩🇴 Roberto te contestó (Más → Roberto)", 4500);
  },

  suyos(d = this.leer()) { return ((d.conversacion && d.conversacion.mensajes) || []).filter(m => m && m.texto); },

  // ---------- Horas ----------
  // Partes de una fecha en Nueva York (la app puede abrirse en otro lugar, pero Roberto trabaja con la hora de NY)
  ny(fecha = new Date()) {
    const p = {};
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "numeric", hourCycle: "h23" })
      .formatToParts(fecha).forEach(x => { p[x.type] = x.value; });
    return { dia: `${p.year}-${p.month}-${p.day}`, h: Number(p.hour) % 24, m: Number(p.minute) };
  },
  hora12(h, m) { return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`; },
  horaDe(iso) { if (!iso) return ""; const t = this.ny(new Date(iso)); return this.hora12(t.h, t.m); },
  cuandoDe(iso) {
    if (!iso) return "";
    const t = this.ny(new Date(iso)), hoyNY = this.ny().dia;
    const ayer = this.ny(new Date(Date.now() - 86400000)).dia;
    const dia = t.dia === hoyNY ? "" : t.dia === ayer ? "ayer " : fechaCorta(t.dia) + " · ";
    return dia + this.hora12(t.h, t.m);
  },
  // Su próxima corrida después de `fecha`: "12:58 p. m." o "mañana a las 5:58 a. m."
  proxima(fecha = new Date()) {
    const t = this.ny(fecha), min = t.h * 60 + t.m;
    for (let h = this.PRIMERA; h <= this.ULTIMA; h++) if (h * 60 + this.MINUTO > min) return { texto: this.hora12(h, this.MINUTO), manana: false };
    return { texto: "mañana a las " + this.hora12(this.PRIMERA, this.MINUTO), manana: true };
  },

  // ---------- Mosaico de Más ----------
  resumenCorto() {
    const e = this.leer().estado;
    if (!e) return "Tu asesor financiero";
    if (e.pideHablar && !this.respondida(e.pideHablar)) return e.pideHablar.donde === "tuOficina" ? "Quiere decirte algo" : "Te espera en la sala";
    if (e.turno === "casa" || e.lugar === "fuera") return `Se fue a casa · vuelve a las ${this.hora12(this.PRIMERA, this.MINUTO)}`;
    const l = this.LUGARES[e.lugar]; return l ? l[1] : "Tu asesor financiero";
  },
  mostrarMosaico() { if ($("rb-mosaico")) $("rb-mosaico").textContent = this.resumenCorto(); },

  // ¿Ya contestaste a esta reunión? (por la opción o por un mensaje que la cita)
  respondida(p) { return !!(p && p.desde && this.mensajes().find(m => m.ref === p.desde)); },
  leido(m) { const c = this.leer().conversacion; return !!(c && c.leidoHasta && m.creado <= c.leidoHasta); },

  // ---------- Pantalla ----------
  abrir() {
    document.querySelectorAll("main.contenedor").forEach(x => { x.hidden = true; });
    $("pantalla-roberto").hidden = false;
    window.scrollTo(0, 0);
    this.mostrar();
    this.bajar();
  },
  cerrar() {
    if (typeof Roberto3D !== "undefined") Roberto3D.pausar();
    $("pantalla-roberto").hidden = true;
    $("pantalla-inicio").hidden = false;
    Pantalla.actualizar();
  },

  mostrar() {
    const d = this.leer(), e = d.estado, conectado = typeof Sync !== "undefined" && Sync.activo();
    this.mostrarMosaico();
    this.mostrar3D(d);
    // Encabezado y lugar
    const lugar = e ? (this.LUGARES[e.turno === "casa" ? "fuera" : e.lugar] || ["🧑‍💼", "En la oficina"]) : null;
    const espera = e && e.pideHablar && !this.respondida(e.pideHablar);
    $("rb-ceja").textContent = !e ? "Tu asesor financiero" : `${lugar[1]}${espera ? " · te espera" : ""}`;
    const prox = this.proxima();
    const viejo = e && e.turno !== "casa" && Date.now() - new Date(e.actualizado).getTime() > 3 * 3600000;
    $("rb-chips").innerHTML = e ? [
      e.fase ? `<span class="rb-chip rb-fase">Fase: ${escapar(e.fase)}</span>` : "",
      `<span class="rb-chip">Última corrida ${this.cuandoDe(e.actualizado)}</span>`,
      `<span class="rb-chip">Próxima ${prox.texto}</span>`,
      viejo ? `<span class="rb-chip rb-viejo">Sin noticias desde ${this.cuandoDe(e.actualizado)}</span>` : ""
    ].join("") : "";
    $("rb-lugar").innerHTML = e
      ? `<span class="rb-lugar-ico" aria-hidden="true">${lugar[0]}</span><span><b>${lugar[1]}</b>${e.haciendo && e.turno !== "casa" ? `<span class="rb-haciendo">“${escapar(e.haciendo)}”</span>` : e.turno === "casa" ? `<span class="rb-haciendo">Vuelve a las ${this.hora12(this.PRIMERA, this.MINUTO)}.</span>` : ""}</span>`
      : `<span class="rb-lugar-ico" aria-hidden="true">🧑‍💼</span><span><b>Todavía no hay noticias de Roberto</b><span class="rb-haciendo">${conectado ? "Aparece aquí después de su próxima corrida." : "Activa la sincronización para verlo."}</span></span>`;
    // Reunión
    this.mostrarReunion(e);
    // Conversación
    this.mostrarCharla(d);
    // Escribir
    const puede = this.puedeEscribir();
    $("rb-escribir").hidden = !puede;
    $("rb-sin-sync").hidden = puede;
    $("rb-sin-sync").textContent = !conectado ? "Para hablar con Roberto, activa la sincronización en Más → Respaldo y sincronizar: así le llegan tus mensajes."
      : "Este aparato está en \"Solo ver\": desde aquí puedes leer a Roberto, pero no escribirle.";
  },

  // La oficina en 3D arriba (roberto3d.js). Si el aparato no puede (sin WebGL), la caja queda escondida y la tarjeta de texto dice lo mismo.
  async mostrar3D(d) {
    const caja = $("rb-oficina");
    if (typeof Roberto3D === "undefined" || !d.estado || !Roberto3D.webgl()) { caja.hidden = true; return; }
    caja.hidden = false;
    if (Roberto3D.e && Roberto3D.activo) { Roberto3D.actualizar(d); return; }
    const ok = await Roberto3D.mostrar(caja, d);
    if (!ok) caja.hidden = true;
  },

  mostrarReunion(e) {
    const caja = $("rb-reunion"), p = e && e.pideHablar;
    if (!p || !p.mensaje) { caja.hidden = true; return; }
    caja.hidden = false;
    const mia = this.mensajes().filter(m => m.ref === p.desde).pop();
    $("rb-reunion-et").textContent = mia ? "Tu respuesta" : p.donde === "tuOficina" ? "Quiere decirte algo" : "Quiere hablar contigo";
    $("rb-reunion-hora").textContent = this.cuandoDe(p.desde);
    $("rb-reunion-texto").textContent = p.mensaje;
    const ops = Array.isArray(p.opciones) ? p.opciones : [];
    const puede = this.puedeEscribir();
    $("rb-opciones").innerHTML = ops.map(o => {
      const elegida = mia && mia.opcion === o.id;
      return `<button type="button" class="rb-op${elegida ? " elegida" : mia ? " atenuada" : ""}" data-rb-op="${escapar(o.id)}" aria-pressed="${elegida ? "true" : "false"}"${puede ? "" : " disabled"}><b>${escapar(o.id)}</b> ${escapar(o.texto)}</button>`;
    }).join("");
    $("rb-reunion-pie").textContent = mia ? (this.leido(mia) ? "Roberto ya leyó tu respuesta." : `Lo lee a las ${this.proxima(new Date(mia.creado)).texto}`)
      : ops.length ? (puede ? "Toca una opción o contéstale con tus palabras abajo." : "") : "";
  },

  mostrarCharla(d) {
    const suyos = this.suyos(d).map(m => ({ de: "rob", t: m.momento || "", texto: m.texto }));
    const mios = this.mensajes().map(m => ({ de: "yo", t: m.creado, texto: m.texto, m }));
    const todos = [...suyos, ...mios].sort((a, b) => a.t.localeCompare(b.t)).slice(-60);
    const lista = $("rb-charla");
    if (!todos.length) { lista.innerHTML = `<li class="rb-vacio">Aquí van a quedar sus mensajes y los tuyos.</li>`; return; }
    let dia = "";
    lista.innerHTML = todos.map(x => {
      const dx = x.t ? this.ny(new Date(x.t)).dia : "";
      const sep = dx && dx !== dia ? `<li class="rb-dia">${dx === this.ny().dia ? "Hoy" : fechaCorta(dx)}</li>` : "";
      dia = dx || dia;
      const pie = x.de === "rob" ? this.horaDe(x.t)
        : this.leido(x.m) ? `✓ Leído` : `✓ Enviado · lo lee a las ${this.proxima(new Date(x.t)).texto}`;
      return `${sep}<li class="rb-m ${x.de}">${x.de === "rob" ? `<span class="rb-quien">Roberto</span>` : ""}${escapar(x.texto)}<small>${pie}</small></li>`;
    }).join("");
  },

  // ---------- Escribirle ----------
  enviar(texto, extra = {}) {
    texto = (texto || "").trim();
    if (!texto || !this.puedeEscribir()) return false;
    const lista = Almacen.leer("mensajesRoberto") || [];
    const ahora = Almacen.ahora();
    lista.push({ id: Almacen.nuevoId(), texto: texto.slice(0, 600), creado: ahora, modificado: ahora, ...extra });
    Almacen.guardar("mensajesRoberto", lista); // se sube solo con la sincronización
    Pantalla.aviso(`Enviado: Roberto lo lee a las ${this.proxima().texto}`, 3500);
    this.mostrar();
    return true;
  },

  elegir(id) {
    const p = (this.leer().estado || {}).pideHablar;
    if (!p || !this.puedeEscribir()) return;
    const o = (p.opciones || []).find(x => x.id === id);
    if (!o) return;
    const lista = Almacen.leer("mensajesRoberto") || [];
    const i = lista.map(m => !m.borrado && m.ref === p.desde && m.opcion).lastIndexOf(true);
    const ahora = Almacen.ahora(), texto = `Opción ${o.id}: ${o.texto}`.slice(0, 600);
    // Cambiar de opción antes de que la lea: se cambia la misma respuesta (no se manda otra)
    if (i >= 0 && !this.leido(lista[i])) lista[i] = { ...lista[i], texto, opcion: o.id, modificado: ahora };
    else lista.push({ id: Almacen.nuevoId(), texto, opcion: o.id, ref: p.desde, creado: ahora, modificado: ahora });
    Almacen.guardar("mensajesRoberto", lista);
    Pantalla.aviso(`Elegiste la opción ${o.id}. Roberto lo lee a las ${this.proxima().texto}`, 3500);
    this.mostrar();
  },

  iniciar() {
    $("volver-roberto").addEventListener("click", () => this.cerrar());
    $("rb-escribir").addEventListener("submit", ev => {
      ev.preventDefault();
      const p = (this.leer().estado || {}).pideHablar;
      // Si hay una reunión sin contestar, lo que escribes también cuenta como respuesta a esa reunión
      const extra = p && p.desde && !this.respondida(p) ? { ref: p.desde } : {};
      if (this.enviar($("rb-texto").value, extra)) $("rb-texto").value = "";
    });
    $("rb-opciones").addEventListener("click", ev => { const b = ev.target.closest("[data-rb-op]"); if (b) this.elegir(b.dataset.rbOp); });
    this.mostrarMosaico();
  }
};

if (Datos.actual) Roberto.iniciar();
