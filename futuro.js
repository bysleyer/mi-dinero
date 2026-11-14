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
  proyeccion(id, horizonte = null) {
    return Proyeccion.calcular({ chequeEscenario: Escenarios.config()[id], horizonte });
  },

  // El calendario y la semana se pueden ver hasta 3 meses adelante (la frase y las tarjetas: 30 días)
  DIAS_LARGO: 92,
  mesVista: 0,

  // ---------- Textos ----------
  dia(f) { return Jornadas.textoDia(f).toLowerCase(); },
  // Cifra corta para las casillas chicas: sin centavos (1,470) y con "k" desde 10 mil (12.5k). El valor exacto está en el detalle del día.
  cifraCorta(v) {
    if (v >= 100000) return `${Math.round(v / 1000)}k`;
    if (v >= 10000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
    return Math.round(v).toLocaleString("en-US");
  },

  diaCorto(f) {
    return Jornadas.aFecha(f).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" }).replace(/[.,]/g, "");
  },
  // "20 nov", "20 y 27 nov", "27 nov y 4 dic"
  listaDias(fechas) {
    const d = f => Jornadas.aFecha(f);
    const mes = f => d(f).toLocaleDateString("es", { month: "short" }).replace(".", "");
    const partes = fechas.map((f, i) => i < fechas.length - 1 && mes(f) === mes(fechas[i + 1]) ? `${d(f).getDate()}` : `${d(f).getDate()} ${mes(f)}`);
    return partes.length <= 1 ? (partes[0] || "") : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
  },
  plata(n) { return n < 0 ? `−${dineroCorto(-n)}` : dineroCorto(n); },
  fechas(pr) { return Object.keys(pr.porDia).sort(); },

  // ---------- Pantalla ----------
  abrir() {
    this.semana = 0;
    this.mesVista = 0;
    $("pantalla-inicio").hidden = true;
    $("pantalla-futuro").hidden = false;
    $("fu-detalle").open = false;
    window.scrollTo(0, 0);
    // Primero se ve la pantalla y un instante después se hacen las cuentas (así responde al toque enseguida)
    requestAnimationFrame(() => setTimeout(() => this.mostrar(), 0));
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
        ${e.titulo} <small>${dineroCorto(montos[e.id])}</small>
      </button>`).join("");

    // Frase de un vistazo
    const fechas = this.fechas(pr);
    let bajo = fechas[0];
    fechas.forEach(f => { if (pr.porDia[f].saldoFin < pr.porDia[bajo].saldoFin) bajo = f; });
    const saldoBajo = pr.porDia[bajo].saldoFin;
    // Con renta atrasada y el día 15 cerca, la tarjeta de arriba no puede decir "todo bien": lo dice primero
    const atrasada = Proyeccion.rentaAtrasada();
    const diaLegal = Calendario.diaDelMes("accionLegal", 15);
    const faltanLegal = Deudas.diasParaDia(diaLegal);
    const legal = atrasada > 0.005 && faltanLegal <= 7;
    const cheque = (pr.chequesInfo || []).find(c => c.fecha >= hoy());
    const renta = Proyeccion.estadoRenta(pr);
    const cuandoCheque = cheque ? (cheque.fecha === hoy() ? "Hoy" : cheque.fecha === Jornadas.sumarDias(hoy(), 1) ? "Mañana" : `El ${this.dia(cheque.fecha)}`) : "";
    const libre = legal ? Plan.semanaReal().libre : 0;
    const lineaLegal = legal ? `<span class="fu-frase-legal">${faltanLegal === 0 ? "Hoy" : this.dia(Jornadas.sumarDias(hoy(), faltanLegal)).replace(/^./, c => c.toUpperCase())}: puede haber acción legal.
        Debes <b>${dineroCorto(atrasada)}</b> de renta atrasada${libre < atrasada ? ` y con lo libre esta semana solo alcanzas <b>${dineroCorto(libre)}</b>` : ""}.</span>` : "";
    $("fu-frase").className = "fu-frase " + (saldoBajo < 0 ? "negativo" : legal ? "alerta" : "positivo");
    $("fu-frase").innerHTML = saldoBajo < 0
      ? `<strong>Te faltan ${dineroCorto(-saldoBajo)} el ${escapar(this.dia(bajo))}.</strong><span>Es tu día más apretado del mes.</span>${lineaLegal}`
      : legal
      ? `<strong>${cheque ? `${cuandoCheque} cobras ${dineroCorto(cheque.monto)}.` : "Este mes no te quedas sin dinero."} La renta atrasada sigue pendiente.</strong>` +
        (renta ? `<span>${renta.falta > 0.005 ? `A la ${escapar(renta.nombre.charAt(0).toLowerCase() + renta.nombre.slice(1))} le faltan ${dineroCorto(renta.falta)}.`
          : `La ${escapar(renta.nombre.charAt(0).toLowerCase() + renta.nombre.slice(1))} queda cubierta el ${escapar(this.diaCorto(renta.fecha).toLowerCase())}.`}</span>` : "") + lineaLegal
      : `<strong>No te quedas sin dinero este mes.</strong><span>Punto más bajo: <b>${dineroCorto(saldoBajo)}</b> el ${escapar(this.dia(bajo))}.</span>`;
    $("fu-cuenta").textContent = Proyeccion.textoCuenta(pr);
    // Bloque 16: colchón usable y arrastre
    $("fu-colchon").innerHTML = ColchonUI.html() + RentaUI.html(pr, { sinAtrasada: legal });
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
    // Calendario, semana y ventana del día: hasta 3 meses (los primeros 30 días son los mismos de arriba)
    const prLargo = this.proyeccion(est.escenario, this.DIAS_LARGO);
    this._prLargo = prLargo;
    // "¿Cómo lo cubro?" si en los próximos 3 meses hay un faltante (mismo escenario)
    if ($("fu-cubrir")) $("fu-cubrir").hidden = !document.body.classList.contains("con-nav") || !Proyeccion.faltante(prLargo);
    this.dibujarGrafica(prs, est.escenario); // la gráfica tiene su propia tarjeta (pestaña "Gráfica")
    if (est.vista === "mes") this.dibujarCalendario(prLargo);
    else this.dibujarSemana(prLargo);

    this.dibujarTarjetas(pr, est.escenario);
  },

  // ---------- Gráfica de líneas (30 días) ----------
  dibujarGrafica(prs, elegido) {
    const W = 340, H = 156, M = { izq: 6, der: 6, arr: 22, aba: 34 };
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
      ? `<text x="${x(i)}" y="${H - 8}" class="fu-eje" text-anchor="${i === n - 1 ? "end" : "middle"}">${Jornadas.aFecha(f).getDate()} ${Jornadas.aFecha(f).toLocaleDateString("es", { month: "short" }).replace(".", "")}</text>` : "").join("");

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
    // (con el teclado y el lector de pantalla: cada día se alcanza con Tab y dice su fecha y su saldo)
    const toques = fechas.map((f, i) =>
      `<rect x="${x(i) - ancho / 2}" y="${M.arr}" width="${ancho}" height="${H - M.arr - M.aba}" class="fu-toque" data-fu-dia="${f}"
        tabindex="0" role="button" aria-label="${this.diaCorto(f)}: te quedan ${this.plata(pr.porDia[f].saldoFin)}"><title>${this.diaCorto(f)}: ${this.plata(pr.porDia[f].saldoFin)}</title></rect>`).join("");
    // Fechas abajo (cada semana), un punto en cada cobro y la línea del día 15 si hay renta atrasada
    const fechasX = fechas.map((f, i) => (i % 7 === 0 && n - 1 - i >= 4) || i === n - 1
      ? `<text x="${x(i)}" y="${H - 6}" class="fu-eje-x" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${Jornadas.aFecha(f).getDate()} ${Jornadas.aFecha(f).toLocaleDateString("es", { month: "short" }).replace(".", "")}</text>` : "").join("");
    const cobros = fechas.map((f, i) => pr.porDia[f].lineas.some(z => z.tipo === "cheque")
      ? `<circle cx="${x(i)}" cy="${H - M.aba + 10}" r="3.5" class="fu-cobro-punto"/>` : "").join("");
    const diaLegal = Calendario.diaDelMes("accionLegal", 15);
    const i15 = Proyeccion.rentaAtrasada() > 0.005 ? fechas.findIndex(f => Jornadas.aFecha(f).getDate() === diaLegal) : -1;
    const linea15 = i15 >= 0 ? `<line x1="${x(i15)}" x2="${x(i15)}" y1="${M.arr - 6}" y2="${H - M.aba}" class="fu-linea-15"/>
      <text x="${x(i15) + (x(i15) > W - 110 ? -5 : 5)}" y="${M.arr - 9}" class="fu-txt-15" text-anchor="${x(i15) > W - 110 ? "end" : "start"}">${Jornadas.aFecha(fechas[i15]).toLocaleDateString("es", { weekday: "short" }).replace(".", "")} ${diaLegal} · renta</text>` : "";

    const bajoCero = Math.min(...fechas.map(f => pr.porDia[f].saldoFin)) < 0;
    // El punto más bajo, marcado como en el concepto
    let ib = 0; fechas.forEach((f, i) => { if (pr.porDia[f].saldoFin < pr.porDia[fechas[ib]].saldoFin) ib = i; });
    const vb = pr.porDia[fechas[ib]].saldoFin, xb = x(ib), yb = y(vb);
    const etq = `${vb < 0 ? "−" : ""}$${Math.abs(Math.round(vb)).toLocaleString("en-US")} · ${this.diaCorto(fechas[ib]).toLowerCase()}`;
    const punto = `<circle cx="${xb}" cy="${yb}" r="6" class="fu-punto${vb < 0.005 ? " rojo" : ""}"/>` +
      `<text x="${xb + (xb > W - 120 ? -10 : 10)}" y="${vb < 0 || yb < 40 ? Math.min(H - M.aba - 4, yb + 20) : yb - 10}" class="fu-punto-txt" text-anchor="${xb > W - 120 ? "end" : "start"}">${etq}</text>`;
    $("fu-grafica").innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Saldo proyectado de los próximos ${n} días: el más bajo es ${this.plata(vb)} el ${this.diaCorto(fechas[ib])}. Usa Tab para oír cada día.">
        <defs>
          <clipPath id="fu-arriba"><rect x="0" y="0" width="${W}" height="${Math.max(0, y0)}"/></clipPath>
          <clipPath id="fu-abajo"><rect x="0" y="${y0}" width="${W}" height="${Math.max(0, H - y0)}"/></clipPath>
        </defs>
        <line x1="${M.izq}" x2="${W - M.der}" y1="${y0}" y2="${y0}" class="fu-cero"/>${linea15}${principal}${punto}${fechasX}${cobros}${toques}
      </svg>`;
    $("fu-leyenda").innerHTML = `
      <span><i class="fu-muestra-punto"></i>cobro (cada viernes)</span>
      ${i15 >= 0 ? `<span><i class="fu-muestra-15"></i>día ${diaLegal}: renta atrasada</span>` : ""}
      ${bajoCero ? `<span><i class="fu-muestra roja"></i>bajo cero</span>` : ""}`;
  },

  // ---------- Calendario del mes (cada día pintado según su saldo) ----------
  dibujarCalendario(pr) {
    const fechas = this.fechas(pr);
    // Mes que se ve: el de hoy + mesVista (hasta el mes del último día calculado)
    const h = Jornadas.aFecha(fechas[0]), u = Jornadas.aFecha(fechas[fechas.length - 1]);
    const maxMes = (u.getFullYear() - h.getFullYear()) * 12 + u.getMonth() - h.getMonth();
    this.mesVista = Math.max(0, Math.min(this.mesVista, maxMes));
    const primero = new Date(h.getFullYear(), h.getMonth() + this.mesVista, 1);
    const ultimo = new Date(h.getFullYear(), h.getMonth() + this.mesVista + 1, 0);
    $("fu-mes-titulo").textContent = primero.toLocaleDateString("es", { month: "long", year: "numeric" });
    $("fu-mes-anterior").disabled = this.mesVista === 0;
    $("fu-mes-siguiente").disabled = this.mesVista >= maxMes;
    const inicio = Plan.claveSemana(primero);
    const fin = Jornadas.sumarDias(Plan.claveSemana(ultimo), 6);
    const celdas = [];
    for (let f = inicio; f <= fin; f = Jornadas.sumarDias(f, 1)) celdas.push(f);
    $("fu-calendario").innerHTML = celdas.map(f => {
      const d = pr.porDia[f];
      const num = Jornadas.aFecha(f).getDate();
      if (!d || Jornadas.aFecha(f).getMonth() !== primero.getMonth()) return `<span class="dia mv-fuera" aria-hidden="true"><span class="dia-num">${num}</span></span>`;
      const s = d.saldoFin;
      const color = s < -0.005 ? "fu-rojo" : s < this.CERCA_DE_CERO ? "fu-amarillo" : "fu-verde";
      const libre = Proyeccion.esLibre(f);
      const cobro = d.lineas.some(l => l.tipo === "cheque");
      const vence = [...new Set(d.lineas.filter(l => l.tipo === "pago" && l.letra).map(l => l.letra))].join("");
      return `<button class="dia ${color}${libre ? " libre" : ""}${f === hoy() ? " hoy" : ""}" data-fu-dia="${f}"
          aria-label="${this.diaCorto(f)}: te quedan ${this.plata(s)}${cobro ? ", cobras" : ""}${vence ? `, vence ${d.lineas.filter(l => l.tipo === "pago" && l.letra).map(l => l.nombre).join(", ")}` : ""}${libre ? ", día libre" : ""}">
        <span class="dia-num">${num}${libre ? "<small>◇</small>" : ""}</span>
        ${cobro ? `<span class="marca-cobro">$</span>` : ""}
        ${vence ? `<span class="marca-vence">${vence}</span>` : ""}
        <span class="fu-saldo">${s < 0 ? "−" : ""}${Futuro.cifraCorta(Math.abs(s))}</span>
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
      if (!d) return `<li class="fu-sem-dia fuera"><div class="fu-sem-fecha">${Jornadas.textoDia(f)}</div><div class="vacio">Fuera de los próximos 3 meses</div></li>`;
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
    const pr = this._prLargo || this._pr;
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
            ${l.id === "renta" && l.saldo < -0.005 ? `<div class="error">Faltan ${dineroCorto(Math.min(-l.monto, -l.saldo))}</div>` : ""}</div>
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
      ? { titulo: "¿Cuándo me quedo sin dinero?", grande: this.dia(sinDinero), texto: `Te faltan ${dineroCorto(-pr.porDia[sinDinero].saldoFin)} ese día.`, clase: "negativo" }
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
      tarjetas.push({ titulo: "¿Cuánto cobro al mes?", grande: dineroCorto(total),
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
    // Los días de la gráfica también se abren con Enter o la barra espaciadora
    $("fu-grafica").addEventListener("keydown", e => {
      const r = e.target.closest(".fu-toque[data-fu-dia]");
      if (r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); this.abrirDia(r.dataset.fuDia); }
    });
    $("fu-sem-anterior").addEventListener("click", () => { this.semana--; this.mostrar(); });
    $("fu-sem-siguiente").addEventListener("click", () => { this.semana++; this.mostrar(); });
    $("fu-mes-anterior").addEventListener("click", () => { this.mesVista--; this.mostrar(); });
    $("fu-mes-siguiente").addEventListener("click", () => { this.mesVista++; this.mostrar(); });
    $("fu-cuenta").addEventListener("click", () => { $("fu-detalle").open = true; $("fu-detalle").scrollIntoView({ block: "start" }); });
    $("fu-libre").addEventListener("click", () => Calendario.abrirLibre());
    $("fu-sin-fecha").addEventListener("click", () => Planeados.abrirLista());
    $("fu-abrir-escenarios").addEventListener("click", () => Escenarios.abrir("pantalla-futuro"));
    $("fu-gasto").addEventListener("click", () => Planeados.abrirTemporal(null, hoy(), "pantalla-futuro"));
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
