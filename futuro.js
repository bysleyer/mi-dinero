/*
 * MI FUTURO (Bloque 14)
 * Una sola pantalla para ver lo que viene: frase de un vistazo, escenarios,
 * gráfica + calendario del mes (o vista de semana), y cuatro preguntas.
 * SOLO MUESTRA: no registra pagos ni cambia saldos.
 * Todos los números salen de proyeccion.js (la misma cuenta que las demás pantallas).
 */
const Futuro = {
  ESCENARIOS: [
    { id: "menos", titulo: "Menos" },
    { id: "esperado", titulo: "Lo esperado" },
    { id: "mas", titulo: "Más" }
  ],
  CERCA_DE_CERO: 100, // amarillo en el calendario si el saldo queda por debajo de esto
  semana: 0,          // vista de semana: 0 = esta semana, 1 = la siguiente...
  _pr: null,

  estado() {
    const g = Almacen.leerFuturo();
    return { escenario: g.escenario || "esperado", vista: g.vista || "mes" };
  },

  // La misma llamada que "¿Y si cobro...?": el próximo cheque con el monto del escenario
  proyeccion(id) {
    return Proyeccion.calcular({ chequeEscenario: Escenarios.config()[id] });
  },

  // ---------- Textos ----------
  dia(f) { return Jornadas.textoDia(f).toLowerCase(); },
  diaCorto(f) {
    return Jornadas.aFecha(f).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" }).replace(/[.,]/g, "");
  },
  plata(n) { return n < 0 ? `−${dinero(-n)}` : dinero(n); },
  fechas(pr) { return Object.keys(pr.porDia).sort(); },

  // ---------- Pantalla ----------
  abrir() {
    this.semana = 0;
    $("pantalla-inicio").hidden = true;
    $("pantalla-futuro").hidden = false;
    $("fu-detalle").open = false;
    window.scrollTo(0, 0);
    this.mostrar();
  },

  cerrar() {
    $("pantalla-futuro").hidden = true;
    $("pantalla-inicio").hidden = false;
    window.scrollTo(0, 0);
  },

  mostrar() {
    if ($("pantalla-futuro").hidden) return;
    const est = this.estado();
    const prs = {};
    this.ESCENARIOS.forEach(e => { prs[e.id] = this.proyeccion(e.id); });
    const pr = prs[est.escenario];
    this._pr = pr;
    this._prs = prs;
    const montos = Escenarios.config();

    // Escenarios
    $("fu-escenarios").innerHTML = this.ESCENARIOS.map(e => `
      <button class="${e.id === est.escenario ? "activo" : ""}" data-fu-escenario="${e.id}" aria-pressed="${e.id === est.escenario}">
        ${e.titulo}<small>${dinero(montos[e.id])}</small>
      </button>`).join("");

    // Frase de un vistazo
    const fechas = this.fechas(pr);
    let bajo = fechas[0];
    fechas.forEach(f => { if (pr.porDia[f].saldoFin < pr.porDia[bajo].saldoFin) bajo = f; });
    const saldoBajo = pr.porDia[bajo].saldoFin;
    $("fu-frase").className = "fu-frase " + (saldoBajo < 0 ? "negativo" : "positivo");
    $("fu-frase").textContent = saldoBajo < 0
      ? `Tu día más apretado es el ${this.dia(bajo)}: te faltan ${dinero(-saldoBajo)}.`
      : `En el próximo mes no te quedas sin dinero. Tu punto más bajo es ${dinero(saldoBajo)} el ${this.dia(bajo)}.`;
    $("fu-cuenta").textContent = Proyeccion.textoCuenta(pr);
    // Bloque 16: colchón usable y arrastre
    $("fu-colchon").innerHTML = ColchonUI.html() + RentaUI.html(pr);
    $("fu-arrastre").innerHTML = ArrastreUI.html(pr);
    // Bloque 15: gastos planeados que todavía no tienen fecha
    const sinFecha = Planeados.sinFecha();
    $("fu-sin-fecha").hidden = sinFecha === 0;
    $("fu-sin-fecha").textContent = `Tienes ${sinFecha} ${sinFecha === 1 ? "gasto planeado" : "gastos planeados"} sin fecha.`;

    // Vista
    document.querySelectorAll("[data-fu-vista]").forEach(b => {
      const activo = b.dataset.fuVista === est.vista;
      b.classList.toggle("activo", activo);
      b.setAttribute("aria-pressed", activo);
    });
    $("fu-mes").hidden = est.vista !== "mes";
    $("fu-semana").hidden = est.vista !== "semana";
    if (est.vista === "mes") { this.dibujarGrafica(prs, est.escenario); this.dibujarCalendario(pr); }
    else this.dibujarSemana(pr);

    this.dibujarTarjetas(pr, est.escenario);
  },

  // ---------- Gráfica de líneas (30 días) ----------
  dibujarGrafica(prs, elegido) {
    const W = 340, H = 210, M = { izq: 44, der: 76, arr: 12, aba: 34 };
    const fechas = this.fechas(prs[elegido]);
    const n = fechas.length;
    const todos = this.ESCENARIOS.flatMap(e => fechas.map(f => prs[e.id].porDia[f].saldoFin));
    let min = Math.min(0, ...todos), max = Math.max(0, ...todos);
    const pad = (max - min) * 0.08 || 50; min -= pad; max += pad;
    const x = i => M.izq + (i * (W - M.izq - M.der)) / (n - 1);
    const y = v => M.arr + ((max - v) * (H - M.arr - M.aba)) / (max - min);
    const y0 = y(0);

    // Marcas de eje Y: 0 y dos más, redondeadas
    const paso = Math.pow(10, Math.floor(Math.log10(Math.max(1, (max - min) / 3))));
    const marcas = [...new Set([min + (max - min) * 0.85, 0, min + (max - min) * 0.15].map(v => v === 0 ? 0 : Math.round(v / paso) * paso))];
    const ejeY = marcas.map(v => `
      <line x1="${M.izq}" x2="${W - M.der}" y1="${y(v)}" y2="${y(v)}" class="${v === 0 ? "fu-cero" : "fu-rejilla"}"/>
      <text x="${M.izq - 6}" y="${y(v) + 4}" class="fu-eje" text-anchor="end">${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}</text>`).join("");

    // Eje X: cada 7 días
    const ejeX = fechas.map((f, i) => i % 7 === 0 || (i === n - 1 && (n - 1) % 7 > 3)
      ? `<text x="${x(i)}" y="${H - 8}" class="fu-eje" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${Jornadas.aFecha(f).getDate()} ${Jornadas.aFecha(f).toLocaleDateString("es", { month: "short" }).replace(".", "")}</text>` : "").join("");

    // Días de cobro ($) y vencimientos (letra) sobre el eje X
    const pr = prs[elegido];
    const marcasDia = fechas.map((f, i) => {
      const l = pr.porDia[f].lineas;
      const cobro = l.some(z => z.tipo === "cheque") || pr.chequesInfo.some(c => c.fecha === f && c.origen === "real");
      const letras = [...new Set(l.filter(z => z.tipo === "pago" && z.letra).map(z => z.letra))].join("");
      return (cobro ? `<text x="${x(i)}" y="${H - M.aba + 12}" class="fu-cobro" text-anchor="middle">$</text>` : "") +
        (letras ? `<text x="${x(i)}" y="${M.arr + 8}" class="fu-vence" text-anchor="middle">${letras}</text>` : "");
    }).join("");

    // Líneas: el escenario elegido gruesa (azul arriba de 0, rojo abajo); los otros finos en gris
    const camino = id => fechas.map((f, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(prs[id].porDia[f].saldoFin).toFixed(1)}`).join(" ");
    const otros = this.ESCENARIOS.filter(e => e.id !== elegido)
      .map(e => `<path d="${camino(e.id)}" class="fu-linea-otra"/>`).join("");
    const principal = `
      <path d="${camino(elegido)}" class="fu-linea" clip-path="url(#fu-arriba)"/>
      <path d="${camino(elegido)}" class="fu-linea fu-linea-roja" clip-path="url(#fu-abajo)"/>`;

    // Nombre al final de cada línea (sin encimarse)
    const finales = this.ESCENARIOS.map(e => ({ e, yy: y(prs[e.id].porDia[fechas[n - 1]].saldoFin) })).sort((a, b) => a.yy - b.yy);
    for (let i = 1; i < finales.length; i++) if (finales[i].yy - finales[i - 1].yy < 13) finales[i].yy = finales[i - 1].yy + 13;
    const etiquetas = finales.map(({ e, yy }) =>
      `<text x="${W - M.der + 6}" y="${yy + 4}" class="fu-etiqueta${e.id === elegido ? " elegido" : ""}">${e.titulo}</text>`).join("");

    // Zonas para tocar cada día
    const ancho = (W - M.izq - M.der) / (n - 1);
    const toques = fechas.map((f, i) =>
      `<rect x="${x(i) - ancho / 2}" y="${M.arr}" width="${ancho}" height="${H - M.arr - M.aba}" class="fu-toque" data-fu-dia="${f}"><title>${this.diaCorto(f)}: ${this.plata(pr.porDia[f].saldoFin)}</title></rect>`).join("");

    const bajoCero = Math.min(...fechas.map(f => pr.porDia[f].saldoFin)) < 0;
    $("fu-grafica").innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Saldo proyectado de los próximos ${n} días">
        <defs>
          <clipPath id="fu-arriba"><rect x="0" y="0" width="${W}" height="${Math.max(0, y0)}"/></clipPath>
          <clipPath id="fu-abajo"><rect x="0" y="${y0}" width="${W}" height="${Math.max(0, H - y0)}"/></clipPath>
        </defs>
        ${ejeY}${otros}${principal}${marcasDia}${ejeX}${etiquetas}${toques}
      </svg>`;
    $("fu-leyenda").innerHTML = `
      <span><i class="fu-muestra elegido"></i>${this.ESCENARIOS.find(e => e.id === elegido).titulo}</span>
      <span><i class="fu-muestra otra"></i>Los otros escenarios</span>
      ${bajoCero ? `<span><i class="fu-muestra roja"></i>Bajo cero</span>` : ""}
      <span><b class="fu-cobro">$</b> cobro · <b class="fu-vence">R L I T</b> vence</span>`;
  },

  // ---------- Calendario del mes (cada día pintado según su saldo) ----------
  dibujarCalendario(pr) {
    const fechas = this.fechas(pr);
    const inicio = Plan.claveSemana(Jornadas.aFecha(fechas[0]));
    const fin = Jornadas.sumarDias(Plan.claveSemana(Jornadas.aFecha(fechas[fechas.length - 1])), 6);
    const celdas = [];
    for (let f = inicio; f <= fin; f = Jornadas.sumarDias(f, 1)) celdas.push(f);
    $("fu-calendario").innerHTML = celdas.map(f => {
      const d = pr.porDia[f];
      const num = Jornadas.aFecha(f).getDate();
      if (!d) return `<span class="dia mv-fuera" aria-hidden="true"><span class="dia-num">${num}</span></span>`;
      const s = d.saldoFin;
      const color = s < -0.005 ? "fu-rojo" : s < this.CERCA_DE_CERO ? "fu-amarillo" : "fu-verde";
      const libre = Proyeccion.esLibre(f);
      const cobro = d.lineas.some(l => l.tipo === "cheque");
      const vence = [...new Set(d.lineas.filter(l => l.tipo === "pago" && l.letra).map(l => l.letra))].join("");
      return `<button class="dia ${color}${libre ? " libre" : ""}${f === hoy() ? " hoy" : ""}" data-fu-dia="${f}"
          aria-label="${this.diaCorto(f)}: ${this.plata(s)}${libre ? ", día libre" : ""}">
        <span class="dia-num">${num}${libre ? "<small>◇</small>" : ""}</span>
        ${cobro ? `<span class="marca-cobro">$</span>` : ""}
        ${vence ? `<span class="marca-vence">${vence}</span>` : ""}
        <span class="fu-saldo">${s < 0 ? "−" : ""}${Math.abs(s).toFixed(2)}</span>
      </button>`;
    }).join("");
  },

  // ---------- Vista de semana ----------
  dibujarSemana(pr) {
    const fechas = this.fechas(pr);
    const maxSemana = Math.floor(this.diferenciaDias(Plan.claveSemana(Jornadas.aFecha(fechas[0])), fechas[fechas.length - 1]) / 7);
    this.semana = Math.max(0, Math.min(this.semana, maxSemana));
    const lunes = Jornadas.sumarDias(Plan.claveSemana(Jornadas.aFecha(fechas[0])), this.semana * 7);
    $("fu-sem-anterior").disabled = this.semana === 0;
    $("fu-sem-siguiente").disabled = this.semana >= maxSemana;
    $("fu-sem-titulo").textContent = `${this.diaCorto(lunes)} – ${this.diaCorto(Jornadas.sumarDias(lunes, 6))}`;
    const dias = [];
    for (let i = 0; i < 7; i++) dias.push(Jornadas.sumarDias(lunes, i));
    $("fu-sem-lista").innerHTML = dias.map(f => {
      const d = pr.porDia[f];
      if (!d) return `<li class="fu-sem-dia fuera"><div class="fu-sem-fecha">${Jornadas.textoDia(f)}</div><div class="vacio">Fuera de los próximos 30 días</div></li>`;
      const libre = Proyeccion.esLibre(f);
      const filas = d.lineas.map(l => `<li class="${l.monto >= 0 ? "entra" : "sale"}"><span>${escapar(l.nombre)}</span><span>${l.monto >= 0 ? "+" : "−"}${dinero(Math.abs(l.monto))}</span></li>`).join("");
      return `
        <li class="fu-sem-dia${libre ? " libre" : ""}">
          <button class="fu-sem-boton" data-fu-dia="${f}">
            <div class="fu-sem-fecha">${Jornadas.textoDia(f)}${libre ? ' <span class="fu-libre">◇ libre</span>' : ""}</div>
            ${filas ? `<ul class="fu-sem-lineas">${filas}</ul>` : '<div class="fu-sem-nada">Nada este día</div>'}
            <div class="fu-sem-saldo ${d.saldoFin < 0 ? "negativo" : ""}">Saldo al final del día: <strong>${this.plata(d.saldoFin)}</strong></div>
          </button>
        </li>`;
    }).join("");
  },

  diferenciaDias(a, b) {
    return Math.round((Jornadas.aFecha(b) - Jornadas.aFecha(a)) / 86400000);
  },

  // ---------- Ventana de un día ----------
  abrirDia(f) {
    const pr = this._pr;
    const d = pr.porDia[f];
    if (!d) return;
    const fechas = this.fechas(pr);
    const i = fechas.indexOf(f);
    const antes = i > 0 ? pr.porDia[fechas[i - 1]].saldoFin : pr.inicial;
    const est = this.estado();
    const filas = d.lineas.map(l => {
      // Vencimiento de Nivel 2 que no alcanza → botón Mover
      const movible = l.tipo === "pago" && Vencimientos.MOVIBLES.includes(l.id) && l.claveMov;
      const noAlcanza = movible && !Proyeccion.estadoEnFecha(pr, f).alcanza;
      return `<li>
          <div class="mov-info"><div class="mov-tipo">${escapar(l.nombre)}</div>
            ${noAlcanza ? `<div class="aviso-movido">No alcanza este día</div>` : ""}
            ${l.id === "renta" && l.saldo < -0.005 ? `<div class="error">Faltan ${dinero(Math.min(-l.monto, -l.saldo))}</div>` : ""}</div>
          <div class="pago-lado">
            <span class="mov-monto ${l.monto >= 0 ? "positivo" : "negativo"}">${l.monto >= 0 ? "+" : "−"}${dinero(Math.abs(l.monto))}</span>
            ${movible ? `<button class="boton-chico" data-fu-mover="${escapar(l.claveMov)}">Mover</button>` : ""}
          </div>
        </li>`;
    }).join("");
    $("fu-dia-contenido").innerHTML = `
      <h2>${Jornadas.textoDia(f)}${Proyeccion.esLibre(f) ? ' <span class="fu-libre">◇ día libre</span>' : ""}</h2>
      <ul class="resumen"><li><span>Saldo antes</span><span>${this.plata(antes)}</span></li></ul>
      ${filas ? `<ul class="movimientos fu-dia-lista">${filas}</ul>` : '<p class="vacio">Nada este día.</p>'}
      <ul class="resumen"><li class="total"><span>Saldo después</span><span class="${d.saldoFin < 0 ? "error" : "ok"}">${this.plata(d.saldoFin)}</span></li></ul>
      <p class="estado">Escenario: ${this.ESCENARIOS.find(e => e.id === est.escenario).titulo}. Solo muestra: no registra nada.</p>`;
    $("fu-dia").hidden = false;
    $("fu-dia-cerrar").focus();
  },

  // ---------- Las cuatro preguntas ----------
  dibujarTarjetas(pr, escenario) {
    const fechas = this.fechas(pr);
    const tarjetas = [];

    // 1. ¿Cuándo me quedo sin dinero?
    const sinDinero = fechas.find(f => pr.porDia[f].saldoFin < -0.005);
    tarjetas.push(sinDinero
      ? { titulo: "¿Cuándo me quedo sin dinero?", grande: this.dia(sinDinero), texto: `Te faltan ${dinero(-pr.porDia[sinDinero].saldoFin)} ese día.`, clase: "negativo" }
      : { titulo: "¿Cuándo me quedo sin dinero?", grande: "No en el próximo mes", texto: "El saldo no baja de cero en 30 días.", clase: "positivo" });

    // 2 y 3: largo plazo, con las reglas de prioridad y del colchón
    const largo = Proyeccion.planDeudas({ chequeEscenario: Escenarios.config()[escenario] });
    const fechaTexto = f => f === "ya" ? "Ya está en cero" : f ? this.dia(f) : null;
    const nunca = `No se alcanza en ${Math.round(largo.dias / 365)} años con estos números`;
    tarjetas.push(!largo.hayRenta
      ? { titulo: "¿Cuándo queda la renta atrasada en cero?", grande: "Falta un dato", texto: "En tus datos no está la renta atrasada.", clase: "" }
      : { titulo: "¿Cuándo queda la renta atrasada en cero?", grande: fechaTexto(largo.rentaCero) || nunca,
          texto: largo.rentaCero && largo.rentaCero !== "ya" ? "Con el dinero que sobra cada semana, en el orden de prioridad." : "", clase: largo.rentaCero ? "positivo" : "negativo" });
    tarjetas.push(!largo.hayAmigo
      ? { titulo: "¿Cuándo le pago a mi amigo?", grande: "Falta un dato", texto: "En tus datos no está el préstamo de tu amigo.", clase: "" }
      : largo.amigoCero === "ya"
        ? { titulo: "¿Cuándo le pago a mi amigo?", grande: "Ya está pagado", texto: "", clase: "positivo" }
        : { titulo: "¿Cuándo le pago a mi amigo?",
            grande: largo.amigoInicio ? `Desde el ${this.dia(largo.amigoInicio)}` : nunca,
            texto: largo.amigoInicio ? (largo.amigoCero ? `Queda en cero el ${this.dia(largo.amigoCero)}.` : "No queda en cero en 2 años.") : "",
            clase: largo.amigoInicio ? "positivo" : "negativo" });

    // 4. ¿Cuánto cobro al mes?
    const dias = Jornadas.config().diasDeTrabajo || [];
    if (!dias.length) {
      tarjetas.push({ titulo: "¿Cuánto cobro al mes?", grande: "Falta un dato", texto: "En tus datos no están tus días de trabajo.", clase: "" });
    } else {
      const cheques = pr.chequesInfo.filter(c => c.fecha <= pr.hasta);
      const total = cheques.reduce((s, c) => s + c.monto, 0);
      const libres = Proyeccion.diasLibresEntre(pr.desde, pr.hasta);
      tarjetas.push({ titulo: "¿Cuánto cobro al mes?", grande: dinero(total),
        texto: `En ${cheques.length} ${cheques.length === 1 ? "cheque" : "cheques"} (próximos 30 días)${libres ? `, con ${libres} ${libres === 1 ? "día libre descontado" : "días libres descontados"}` : ""}.`, clase: "" });
    }

    $("fu-tarjetas").innerHTML = tarjetas.map(t => `
      <section class="tarjeta fu-pregunta">
        <h2>${t.titulo}</h2>
        <p class="fu-grande ${t.clase}">${escapar(t.grande)}</p>
        ${t.texto ? `<p class="estado">${escapar(t.texto)}</p>` : ""}
      </section>`).join("");
  },

  iniciar() {
    $("abrir-futuro").addEventListener("click", () => this.abrir());
    $("volver-futuro").addEventListener("click", () => this.cerrar());
    $("pantalla-futuro").addEventListener("click", e => {
      const esc = e.target.closest("[data-fu-escenario]");
      if (esc) { Almacen.guardarFuturo({ escenario: esc.dataset.fuEscenario }); this.mostrar(); }
      const vis = e.target.closest("[data-fu-vista]");
      if (vis) { Almacen.guardarFuturo({ vista: vis.dataset.fuVista }); this.mostrar(); }
      const dia = e.target.closest("[data-fu-dia]");
      if (dia) this.abrirDia(dia.dataset.fuDia);
    });
    $("fu-sem-anterior").addEventListener("click", () => { this.semana--; this.mostrar(); });
    $("fu-sem-siguiente").addEventListener("click", () => { this.semana++; this.mostrar(); });
    $("fu-cuenta").addEventListener("click", () => { $("fu-detalle").open = true; $("fu-detalle").scrollIntoView({ block: "start" }); });
    $("fu-libre").addEventListener("click", () => Calendario.abrirLibre());
    $("fu-sin-fecha").addEventListener("click", () => Planeados.abrirLista());
    $("fu-abrir-escenarios").addEventListener("click", () => Escenarios.abrir("pantalla-futuro"));
    $("fu-dia-cerrar").addEventListener("click", () => { $("fu-dia").hidden = true; });
    $("fu-dia").addEventListener("click", e => {
      if (e.target.id === "fu-dia") $("fu-dia").hidden = true;
      const m = e.target.closest("[data-fu-mover]");
      if (m) {
        $("fu-dia").hidden = true;
        const est = this.estado();
        const e2 = this.ESCENARIOS.find(x => x.id === est.escenario);
        Mover.abrir(m.dataset.fuMover, "pantalla-futuro", { monto: Escenarios.config()[est.escenario], titulo: e2.titulo });
      }
    });
    // Al guardar un día libre, un pago o una jornada, todo se actualiza al instante
    window.addEventListener("movimientos-cambiaron", () => this.mostrar());
    window.addEventListener("jornadas-cambiaron", () => this.mostrar());
  }
};

if (Datos.actual) Futuro.iniciar();
