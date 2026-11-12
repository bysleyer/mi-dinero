/*
 * TU CONSEJERO
 * - Claude revisa tus datos (cada hora de 6 a. m. a 8 p. m. y a fondo a las 2 a. m.) y deja
 *   consejero.json en tu repositorio PRIVADO de datos: informe, comentarios y las REGLAS de la semana.
 * - El VIGILANTE (aquí, en el teléfono) aplica esas reglas al instante en cada gasto que registras:
 *   si te pasas de un límite, te pide una razón antes de guardar (no te bloquea).
 * - Tus notas para el consejero viajan con la sincronización (lista "notasConsejero").
 * - "Pregúntale a tu consejero": arma un resumen y abre tu app de Claude con la pregunta escrita.
 * Nada de esto se ve en el modo "Solo ver".
 */
const Consejero = {
  ARCHIVO: "consejero.json",

  leer() { return Almacen.leer("consejero"); },

  // ---------- Bajar el consejero.json del repositorio de datos ----------
  async bajar() {
    if (typeof Sync === "undefined" || !Sync.activo() || Sync.soloVer()) return;
    try {
      const r = await Sync.api(`/contents/${this.ARCHIVO}`);
      if (!r.ok) return; // 404: todavía no hay revisión
      const j = await r.json();
      const actual = this.leer();
      if (actual && actual._sha === j.sha) return;
      const c = JSON.parse(Sync.deBase64(j.content || ""));
      if (!c || c.formato !== "mi-dinero-consejero") return;
      c._sha = j.sha;
      Almacen.guardar("consejero", c);
      this.mostrar();
      Inicio.mostrar();
      if (actual) Pantalla.aviso("🧑‍💼 Tu consejero dejó algo nuevo", 4000);
    } catch (e) { /* sin internet: se usa lo último que bajó */ }
  },

  // ---------- Fechas ----------
  periodo(regla, fecha) {
    const p = regla.periodo || "semana";
    if (p === "dia") return { desde: fecha, hasta: fecha, texto: "hoy" };
    if (p === "mes") { const m = fecha.slice(0, 7); return { desde: m + "-01", hasta: m + "-31", texto: "este mes" }; }
    const lunes = Plan.claveSemana(new Date(fecha + "T12:00:00"));
    return { desde: lunes, hasta: Jornadas.sumarDias(lunes, 6), texto: "esta semana" };
  }
};

/* VIGILANTE: cuenta lo que llevas en cada regla y avisa si un gasto se pasa */
const Vigilante = {
  normal(t) { return (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); },

  reglas() { const c = Consejero.leer(); return (c && Array.isArray(c.reglas)) ? c.reglas : []; },

  // ¿Este gasto entra en la regla? (por categoría y/o por palabras de la nota)
  entra(regla, m) {
    if (m.tipo !== "gasto") return false;
    if (regla.categorias && regla.categorias.length && !regla.categorias.includes(m.categoria)) return false;
    if (regla.palabras && regla.palabras.length) {
      const n = this.normal(m.nota), sin = n.replace(/\s+/g, "");
      return regla.palabras.some(p => { const q = this.normal(p); return n.includes(q) || sin.includes(q.replace(/\s+/g, "")); });
    }
    return true;
  },

  // Lo que llevas en la regla en su periodo (con un gasto nuevo, si se pasa)
  llevas(regla, fecha = hoy(), nuevo = null) {
    const per = Consejero.periodo(regla, fecha);
    const movs = Almacen.leerMovimientos().filter(m => m.fecha >= per.desde && m.fecha <= per.hasta && this.entra(regla, m));
    if (nuevo && this.entra(regla, nuevo)) movs.push(nuevo);
    return { veces: movs.length, monto: redondear(movs.reduce((s, m) => s + m.monto, 0)), per };
  },

  // Las reglas que este gasto rompe
  revisar(mov) {
    return this.reglas().map(regla => {
      if (!this.entra(regla, mov)) return null;
      const l = this.llevas(regla, mov.fecha, mov);
      const porVeces = regla.maxVeces != null && l.veces > regla.maxVeces;
      const porMonto = regla.maxMonto != null && l.monto > regla.maxMonto + 0.005;
      if (!porVeces && !porMonto) return null;
      const partes = [];
      if (regla.maxVeces != null) partes.push(`${l.veces} de ${regla.maxVeces} ${regla.maxVeces === 1 ? "vez" : "veces"}`);
      if (regla.maxMonto != null) partes.push(`${dinero(l.monto)} de ${dinero(regla.maxMonto)}`);
      return { regla, l, texto: `${regla.nombre}: con este llevas ${partes.join(" · ")} ${l.per.texto}.` };
    }).filter(Boolean);
  },

  // Ventana: avisa, pide la razón y (si aplica) la pregunta de "¿ya estaba incluido?" en el mismo paso.
  // Devuelve { razon, incluido } o null si toca "Volver".
  preguntar(rotas, inicial) {
    return new Promise(resolver => {
      const caja = $("vigilante");
      $("vg-texto").innerHTML = rotas.map(r => `<p>⚠ ${escapar(r.texto)}${r.regla.porque ? `<br><span class="opcional">${escapar(r.regla.porque)}</span>` : ""}</p>`).join("");
      $("vg-incluido").hidden = !inicial;
      if (inicial) {
        $("vg-incluido-texto").textContent = inicial.texto;
        caja.querySelectorAll("[name=vg-inc]").forEach(x => { x.checked = false; });
      }
      $("vg-razon").value = "";
      $("vg-error").textContent = "";
      caja.hidden = false;
      $("vg-razon").focus();
      const cerrar = valor => { caja.hidden = true; $("vg-guardar").onclick = $("vg-volver").onclick = null; resolver(valor); };
      $("vg-guardar").onclick = () => {
        const razon = $("vg-razon").value.trim();
        if (razon.length < 3) { $("vg-error").textContent = "Escribe por qué (con pocas palabras basta)."; return; }
        let incluido = false;
        if (inicial) {
          const marcado = caja.querySelector("[name=vg-inc]:checked");
          if (!marcado) { $("vg-error").textContent = "Contesta si ya estaba incluido."; return; }
          incluido = marcado.value === "si";
        }
        cerrar({ razon, incluido });
      };
      $("vg-volver").onclick = () => cerrar(null);
    });
  },

  // Línea para la cajita de "Gasté" mientras escribes
  previa(mov) {
    const rotas = this.revisar(mov);
    return rotas.length ? rotas.map(r => `👀 ${escapar(r.texto)}`).join("<br>") : "";
  }
};

/* PANTALLA "Tu consejero" y la tarjeta del inicio */
Object.assign(Consejero, {
  cuando(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleString("es", { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  },

  ICONOS: { bien: "✅", corregir: "✏️", alerta: "⚠️", paso: "👉" },

  tarjetaInicio() {
    const caja = $("inicio-consejero");
    if (!caja) return;
    if (Sync.soloVer()) { caja.hidden = true; return; }
    const c = this.leer();
    caja.hidden = false;
    if (!c) {
      caja.innerHTML = `<h2>🧑‍💼 Tu consejero</h2>
        <p class="ayuda">${Sync.activo() ? "Todavía no hay revisión. La primera llega en la próxima hora." : "Conecta la sincronización (Respaldo y sincronizar) para que tu consejero vea tus datos."}</p>
        <button class="enlace" data-abrir-consejero>Abrir ›</button>`;
      return;
    }
    const com = (c.comentarios || [])[0];
    const reciente = com && com.momento > (c.actualizadoInforme || "") ? com : null;
    caja.innerHTML = `<h2>🧑‍💼 Tu consejero</h2>
      ${reciente ? `<p class="cj-comentario">${escapar(reciente.texto)}</p>` : ""}
      ${c.proximoPaso ? `<p><strong>👉 ${escapar(c.proximoPaso)}</strong></p>` : ""}
      ${c.informe && c.informe.titulo ? `<p class="ayuda">${escapar(c.informe.titulo)}</p>` : ""}
      <button class="enlace" data-abrir-consejero>Ver todo ›</button>`;
  },

  abrir() {
    this.origen = Nav.visible ? Nav.visible() : "pantalla-inicio";
    document.querySelectorAll("main.contenedor").forEach(x => { x.hidden = true; });
    $("pantalla-consejero").hidden = false;
    window.scrollTo(0, 0);
    this.mostrar();
    this.bajar();
  },

  cerrar() {
    $("pantalla-consejero").hidden = true;
    $("pantalla-inicio").hidden = false;
    Pantalla.actualizar();
  },

  mostrar() {
    this.tarjetaInicio();
    if (!$("pantalla-consejero") || $("pantalla-consejero").hidden) return;
    const c = this.leer();
    $("cj-estado").textContent = c
      ? `Revisión · ${this.cuando(c.actualizado)}${c.tipo === "noche" ? " (a fondo)" : ""}`
      : "Todavía no hay revisión.";
    // Informe
    const inf = c && c.informe;
    $("cj-informe").innerHTML = inf
      ? `${inf.titulo ? `<h3>${escapar(inf.titulo)}</h3>` : ""}${inf.resumen ? this.lineasResumen(inf.resumen) : ""}
         ${(inf.puntos || []).length ? `<details class="cj-mas"><summary>Ver todo el informe (${inf.puntos.length})</summary><ul class="cj-puntos">${inf.puntos.map(p => `<li><span aria-hidden="true">${this.ICONOS[p.tipo] || "•"}</span> ${escapar(p.texto)}</li>`).join("")}</ul></details>` : ""}
         ${c.actualizadoInforme ? `<p class="opcional">Informe del ${this.cuando(c.actualizadoInforme)}</p>` : ""}`
      : `<p class="ayuda">Aquí aparece el informe de cada noche.</p>`;
    // Próximo paso, día de libertad y prioridades
    const pasos = [];
    // El paso de hoy solo se muestra si no hay lista de prioridades (la lista ya lo trae, como en el concepto)
    if (c && c.proximoPaso && !(c.prioridades && c.prioridades.length)) pasos.push(`<p class="cj-paso-hoy"><strong>${escapar(c.proximoPaso)}</strong></p>`);
    /* día de libertad: va al final */
    if (c && c.prioridades && c.prioridades.length) pasos.push(`<ol class="cj-prioridades">${c.prioridades.map((p, i) => `<li><span class="cj-num" aria-hidden="true">${i + 1}</span><span>${escapar(p)}</span></li>`).join("")}</ol>`);
    if (c && c.diaLibertad && c.diaLibertad.fecha) pasos.push(`<details class="cj-mas cj-libertad"><summary>Tu día de libertad: ${escapar(Futuro.diaCorto ? Futuro.diaCorto(c.diaLibertad.fecha) : c.diaLibertad.fecha)}</summary><p>${escapar(c.diaLibertad.texto || "")}</p></details>`);
    $("cj-pasos").innerHTML = pasos.join("") || `<p class="ayuda">Todavía no hay plan.</p>`;
    $("cj-pasos-caja").hidden = !pasos.length;
    // Reglas de la semana (lo que llevas)
    const reglas = Vigilante.reglas();
    $("cj-reglas").innerHTML = reglas.length ? reglas.map(r => {
      const l = Vigilante.llevas(r);
      const pasado = (r.maxVeces != null && l.veces > r.maxVeces) || (r.maxMonto != null && l.monto > r.maxMonto + 0.005);
      const cerca = !pasado && ((r.maxVeces != null && l.veces >= r.maxVeces) || (r.maxMonto != null && l.monto >= r.maxMonto * 0.8));
      const partes = [];
      if (r.maxVeces != null) partes.push(`${l.veces} de ${r.maxVeces} ${r.maxVeces === 1 ? "vez" : "veces"}`);
      if (r.maxMonto != null) partes.push(`${dinero(l.monto)} de ${dinero(r.maxMonto)}`);
      const pct = r.maxMonto ? l.monto / r.maxMonto : r.maxVeces ? l.veces / r.maxVeces : 0;
      return `<li class="${pasado ? "negativo" : cerca ? "cerca" : ""}">
        <div class="cj-regla"><span>${escapar(r.nombre)}</span><span>${partes.join(" · ")} <span class="opcional">${l.per.texto}</span></span></div>
        <div class="cj-barra"><span style="transform:scaleX(${Math.min(1, pct)})"></span></div>
        ${r.porque ? `<p class="opcional">${escapar(r.porque)}</p>` : ""}</li>`;
    }).join("") : `<li class="ayuda">Todavía no hay reglas. Las pone tu consejero en su primera revisión.</li>`;
    // Metas de la semana (en "Hoy"): lo mismo que las reglas, en corto
    $("cj-metas").innerHTML = reglas.length ? reglas.map(r => {
      const l = Vigilante.llevas(r);
      const pasado = (r.maxVeces != null && l.veces > r.maxVeces) || (r.maxMonto != null && l.monto > r.maxMonto + 0.005);
      const cerca = !pasado && ((r.maxVeces != null && l.veces >= r.maxVeces) || (r.maxMonto != null && l.monto >= r.maxMonto * 0.8));
      const valor = r.maxVeces != null && r.maxVeces > 0 ? `${l.veces} de ${r.maxVeces}` : r.maxMonto != null ? `${dinero(l.monto)} de ${dinero(r.maxMonto)}` : `${l.veces} de ${r.maxVeces}`;
      const pct = r.maxMonto ? l.monto / r.maxMonto : r.maxVeces ? l.veces / r.maxVeces : (l.veces > 0 ? 1 : 0);
      return `<li class="${pasado ? "negativo" : cerca ? "cerca" : ""}"><div class="cj-regla"><span>${escapar(r.nombre.replace(/\s*\(.*\)\s*$/, ""))}</span><strong>${valor}</strong></div>
        <div class="cj-barra"><span style="transform:scaleX(${Math.min(1, pct)})"></span></div></li>`;
    }).join("") : `<li class="ayuda">Todavía no hay metas.</li>`;
    // Fuera del plan esta semana
    const lunes = Plan.claveSemana();
    const fuera = Almacen.leerMovimientos().filter(m => m.razonFueraPlan && m.fecha >= lunes);
    $("cj-fuera").innerHTML = fuera.length ? fuera.map(m => `<li><div class="cj-regla"><span>${escapar(m.nota || m.categoria)}</span><span>${dinero(m.monto)}</span></div>
      <p class="opcional">${fechaCorta(m.fecha)} · “${escapar(m.razonFueraPlan)}”</p></li>`).join("") : `<li class="ayuda">Nada fuera del plan esta semana.</li>`;
    // Comentarios
    const coms = (c && c.comentarios) || [];
    $("cj-comentarios").innerHTML = coms.length ? coms.slice(0, 10).map(x => `<li><p>${escapar(x.texto)}</p><p class="opcional">${this.cuando(x.momento)}</p></li>`).join("")
      : `<li class="ayuda">Cuando registres gastos, aquí aparecen sus comentarios (en menos de una hora).</li>`;
    // Mis notas (y sus respuestas)
    const resp = {};
    ((c && c.respuestas) || []).forEach(x => { resp[x.nota] = x.texto; });
    const notas = this.notas().slice().reverse().slice(0, 10);
    $("cj-notas").innerHTML = notas.map(n => `<li><p>🗨️ ${escapar(n.texto)}</p><p class="opcional">${this.cuando(n.creado)}</p>
      ${resp[n.id] ? `<p class="cj-respuesta">🧑‍💼 ${escapar(resp[n.id])}</p>` : `<p class="opcional">Lo lee en la próxima revisión.</p>`}</li>`).join("");
  },

  // ---------- Notas para el consejero (se sincronizan) ----------
  notas() { return (Almacen.leer("notasConsejero") || []).filter(n => !n.borrado); },

  guardarNota() {
    const texto = $("cj-nota").value.trim();
    if (!texto) return;
    const lista = Almacen.leer("notasConsejero") || [];
    const ahora = Almacen.ahora();
    lista.push({ id: Almacen.nuevoId(), texto, creado: ahora, modificado: ahora });
    Almacen.guardar("notasConsejero", lista);
    $("cj-nota").value = "";
    Pantalla.aviso("Enviado: lo lee en la próxima revisión", 3500);
    this.mostrar();
  },

  // ---------- "Pregúntale a tu consejero" (abre la app de Claude) ----------
  // "Lo más importante" en líneas cortas (no un párrafo con seis cifras): una por renglón del consejero, o una por frase;
  // el día al principio ("Hoy:", "Mañana:", "El 18:") va destacado
  lineasResumen(texto) {
    const lineas = (texto.includes("\n") ? texto.split(/\n+/) : texto.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/)).map(x => x.trim()).filter(Boolean);
    if (lineas.length < 2) return `<p>${escapar(texto)}</p>`;
    return `<ul class="cj-lineas">${lineas.map(l => {
      const m = l.match(/^((?:Hoy|Mañana|Ayer|Pasado mañana|El \d{1,2}(?: de [a-z]+)?|(?:Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo)(?: \d{1,2})?))([:,])\s*/);
      return m ? `<li><b class="cj-dia">${escapar(m[1])}:</b> ${escapar(l.slice(m[0].length))}</li>` : `<li>${escapar(l)}</li>`;
    }).join("")}</ul>`;
  },

  resumen(pregunta) {
    const L = [];
    const sem = Plan.semanaReal();
    const f = Proyeccion.faltante(sem.pr);
    L.push("Eres mi consejero de crédito y deudas. Respóndeme en español, claro y directo, con números.");
    L.push("Reglas mías: el tren y el taxi para ir a trabajar no se tocan; horas extra solo si hay; no asumas pagos que no he planeado.");
    L.push("");
    L.push(`Hoy es ${fechaCorta(hoy())}. Tengo ${dinero(Dinero.actual())}.`);
    L.push(`Esta semana: libre ${dinero(sem.libre)}, guardar para más adelante ${dinero(sem.guardar)}.`);
    if (f) L.push(`Lo más cercano que no alcanza: ${Proyeccion.textoFaltante(f)}`);
    try {
      const er = Proyeccion.estadoRenta(sem.pr);
      if (er) L.push(`${er.nombre}: ${dinero(er.monto)} para el ${fechaCorta(er.fecha)}${er.falta > 0.005 ? `, faltan ${dinero(er.falta)}` : ", cubierta"}.`);
    } catch (e) { /* sin renta */ }
    L.push("Deudas:");
    Datos.deudas().forEach(d => { const s = Datos.saldoReparto(d.id); if (s > 0.005) L.push(`- ${d.nombre}: ${dinero(s)}${d.nota ? ` (${d.nota})` : ""}`); });
    const prox = Object.keys(sem.pr.porDia).sort().slice(0, 14)
      .flatMap(fe => sem.pr.porDia[fe].lineas.filter(l => l.monto < 0 && l.tipo !== "simulado").map(l => `${fechaCorta(fe)} ${l.nombre} ${dinero(-l.monto)}`));
    if (prox.length) L.push("Próximos 14 días: " + prox.slice(0, 20).join("; ") + ".");
    const lunes = Plan.claveSemana();
    const porCat = {};
    Almacen.leerMovimientos().filter(m => m.tipo === "gasto" && m.fecha >= lunes).forEach(m => { porCat[m.categoria] = (porCat[m.categoria] || 0) + m.monto; });
    if (Object.keys(porCat).length) L.push("Gastado esta semana: " + Object.entries(porCat).map(([k, v]) => `${k} ${dinero(v)}`).join(", ") + ".");
    const reglas = Vigilante.reglas();
    if (reglas.length) L.push("Mis reglas de la semana: " + reglas.map(r => { const l = Vigilante.llevas(r); return `${r.nombre} (llevo ${l.veces} veces, ${dinero(l.monto)}${r.maxVeces != null ? `; máx. ${r.maxVeces}` : ""}${r.maxMonto != null ? `; máx. ${dinero(r.maxMonto)}` : ""})`; }).join("; ") + ".");
    const c = this.leer();
    if (c && c.proximoPaso) L.push(`Lo último que me recomendaste: ${c.proximoPaso}`);
    L.push("");
    L.push("Mi pregunta: " + pregunta);
    return L.join("\n");
  },

  async preguntarAClaude() {
    const pregunta = $("cj-pregunta").value.trim();
    if (!pregunta) { $("cj-pregunta").focus(); return; }
    const texto = this.resumen(pregunta);
    try { await navigator.clipboard.writeText(texto); } catch (e) { /* sin permiso: va igual en el enlace */ }
    window.open("https://claude.ai/new?q=" + encodeURIComponent(texto), "_blank", "noopener");
    $("cj-pregunta-ayuda").hidden = false;
  },

  iniciar() {
    $("volver-consejero").addEventListener("click", () => this.cerrar());
    $("cj-enviar").addEventListener("click", () => this.guardarNota());
    $("cj-preguntar").addEventListener("click", () => this.preguntarAClaude());
    document.addEventListener("click", e => { if (e.target.closest("[data-abrir-consejero]")) { if (typeof Nav !== "undefined" && Nav.cerrarHoja) Nav.cerrarHoja(); this.abrir(); } });
    $("abrir-consejero").addEventListener("click", () => this.abrir());
    window.addEventListener("movimientos-cambiaron", () => this.mostrar());
    // Con la app abierta: revisa cada 10 minutos si el consejero dejó algo nuevo
    setInterval(() => { if (document.visibilityState === "visible") this.bajar(); }, 10 * 60 * 1000);
    this.mostrar();
    this.bajar();
  }
});

if (Datos.actual && !(typeof Sync !== "undefined" && Sync.soloVer())) Consejero.iniciar();
