/*
 * MOVER ESTE PAGO (Bloque 12; ampliado: renta del mes y préstamo semanal también)
 * Para renta, préstamo, luz, teléfono e internet: pinta los próximos días según si alcanza,
 * sugiere la mejor fecha (o dividir en 2 pagos) y guarda la fecha elegida.
 * Solo SUGIERE y GUARDA fechas: no registra pagos ni cambia saldos.
 */
const Mover = {
  clave: null,     // id@fecha original del pago que se está moviendo
  origen: null,    // pantalla a la que se vuelve
  seleccion: null, // día tocado
  TEXTO_FIJO: "Solo la empresa decide si acepta la fecha. Llama antes del vencimiento y pide la confirmación por escrito.",

  // ---------- Datos (mis datos → moverPagos) ----------
  config() {
    const m = Datos.actual.moverPagos || {};
    const rec = (Datos.actual.reglasDePrioridad || {}).recargos || {};
    // Si mis datos no traen "moverPagos": sin gracia y recargo por confirmar (nada escrito en el código)
    const defecto = {
      internet: { gracia_dias: 0, recargo: rec.internetPorFactura ?? null, riesgoAlto: false, riesgo: "" },
      luz: { gracia_dias: 0, recargo: null, riesgo: "" },
      telefono: { gracia_dias: 0, recargo: null, riesgo: "" },
      renta: { gracia_dias: 0, recargo: rec.renta && typeof rec.renta === "object" ? rec.renta.monto ?? null : rec.renta ?? null, riesgoAlto: true,
               riesgo: "Después del día 1 cobran late fee; el 15 puede haber acción legal. Pide el acuerdo por escrito." },
      prestamo: { gracia_dias: 0, recargo: null, riesgo: "Sin recargo, salvo que lo acuerden. Avisa antes a quien te prestó." },
      deudaInternet: { gracia_dias: 0, recargo: rec.internetPorFactura ?? null, riesgoAlto: false,
                       riesgo: (((Datos.actual.reglasDePrioridad || {}).nivel2 || {}).deudaInternet || {}).nota || "Pago atrasado: acuerda la fecha con la empresa." }
    };
    const pagos = {};
    Object.keys(defecto).forEach(id => { pagos[id] = { ...defecto[id], ...((m.pagos || {})[id] || {}) }; });
    return {
      horizonte: m.horizonteDias || 30,
      chequeDia: (m.chequeDisponible && m.chequeDisponible.dia) || Jornadas.config().diaDeCobro,
      chequeRetraso: (m.chequeDisponible && m.chequeDisponible.retrasoDias) || 0,
      pagos
    };
  },

  dias(desde, hasta) {
    const lista = [];
    for (let f = desde; f <= hasta; f = Jornadas.sumarDias(f, 1)) lista.push(f);
    return lista;
  },

  diferencia(a, b) {
    return Math.round((Jornadas.aFecha(a) - Jornadas.aFecha(b)) / 86400000);
  },

  // ---------- Proyección día por día ----------
  // La misma cuenta que "¿Y si cobro...?" (proyeccion.js). Si se abrió desde un escenario, usa su cheque.
  escenario: null,

  // Días a mirar: los de mis datos (30), o más si el pago vence después (ej.: la renta del 15)
  horizonte: null,

  proyeccion(excluir) {
    return Proyeccion.calcular({ excluir, chequeEscenario: this.escenario ? this.escenario.monto : null, horizonte: this.horizonte });
  },

  // El pago original (sin mover), con lo que falta pagar
  pagoOriginal(clave) {
    const [id, fecha] = clave.split("@");
    if (fecha === "inmediato") {
      // Deuda de pago inmediato (internet atrasado): vence hoy con lo que se debe hoy
      const item = Vencimientos.entreBase(hoy(), hoy()).find(i => i.id === id);
      if (!item) return null;
      return { id, fecha: hoy(), nombre: item.nombre, monto: redondear(item.partes[0].monto), item };
    }
    if (id === "renta") {
      // La renta del mes: vence el día 1 (fecha de la clave); su meta es el último viernes antes
      const l = Proyeccion.rentaLineas(hoy(), fecha, { sinMover: true }).find(x => x.claveMov === clave);
      if (!l) return null;
      return { id, fecha, meta: l.fecha, nombre: l.nombre, monto: redondear(-l.monto), item: { id, nombre: l.nombre } };
    }
    const item = Vencimientos.entreBase(fecha, fecha).find(i => i.id === id);
    if (!item) return null;
    const monto = redondear(item.partes.filter(p => !p.pagado).reduce((s, p) => s + p.monto, 0));
    return { id, fecha, nombre: item.nombre, monto, item };
  },

  // ¿No alcanza para pagarlo en su fecha? (para mostrar "Mover" en Próximos pagos; sin escenario)
  noAlcanza(item) {
    const pago = this.pagoOriginal(item.claveMov);
    if (!pago || pago.monto <= 0) return false;
    const pr = Proyeccion.calcular({ excluir: item.claveMov });
    const dia = pr.porDia[pago.fecha < pr.desde ? pr.desde : pago.fecha];
    return !dia || dia.saldoFin - pago.monto < -0.005;
  },

  esDeuda(pago) { return !!(pago && pago.item && pago.item.inmediato); },

  // Préstamo de una persona: recargo acordado (opcional) y si los pagos que siguen se corren
  opcionesPrestamo() {
    if (!this._ev || this._ev.pago.id !== "prestamo") return {};
    return { recargo: redondear(Math.max(0, Number($("mv-recargo").value) || 0)), correr: $("mv-correr").value === "si" };
  },

  // Cómo quedaría guardado con estas fechas (para probarlo sin guardarlo)
  movidoCon(partes) {
    const pago = this._ev.pago;
    return { id: pago.id, nombre: pago.nombre, fechaOriginal: pago.fecha, monto: pago.monto, partes, ...this.opcionesPrestamo() };
  },

  // ---------- ¿Qué pasa en tu mes? (misma cuenta de proyeccion.js) ----------
  metricas(pr, largo) {
    const fechas = Object.keys(pr.porDia).sort();
    let bajo = null, rojos = 0;
    fechas.forEach(f => {
      const s = pr.porDia[f].saldoFin;
      if (!bajo || s < bajo.saldo) bajo = { fecha: f, saldo: s };
      if (s < -0.005) rojos++;
    });
    const d = Proyeccion.planDeudas({ pr: largo });
    return { bajo, rojos, renta: Proyeccion.estadoRenta(pr), rentaCero: d.rentaCero, colchon: d.colchonLleno, amigo: d.amigoCero };
  },

  // Ahora (como está guardado) contra pagarlo en estas fechas
  efecto(partes) {
    const op = { chequeEscenario: this.escenario ? this.escenario.monto : null, horizonte: this.horizonte };
    if (!this._antes) this._antes = this.metricas(Proyeccion.calcular(op), Proyeccion.calcular({ ...op, horizonte: 730 }));
    // Se prueba como si ya estuviera guardado (mismas reglas: partes, recargo, pagos corridos), sin guardarlo
    Vencimientos._simular = { [this.clave]: this.movidoCon(partes) };
    try {
      return { antes: this._antes, despues: this.metricas(Proyeccion.calcular(op), Proyeccion.calcular({ ...op, horizonte: 730 })) };
    } finally {
      Vencimientos._simular = null;
    }
  },

  htmlEfecto(e, titulo) {
    const f = v => v === "ya" ? "ya está" : v ? Futuro.diaCorto(v) : "más de 2 años";
    const bajo = b => `${Futuro.plata(b.saldo)} · ${Futuro.diaCorto(b.fecha)}`;
    const fila = (t, a, b, peor) => `<li><span>${t}</span><span>${a}</span><span class="${peor ? "error" : ""}"><strong>${b}</strong></span></li>`;
    const tarde = (a, b) => a && a !== "ya" && (!b || (b !== "ya" && b > a));
    const { antes: A, despues: D } = e;
    return `
      <h3 class="pc-sub">${titulo}</h3>
      <ul class="resumen ps-tabla mv-efecto">
        <li class="ps-cabeza"><span></span><span>Ahora</span><span>Con este cambio</span></li>
        ${fila("Saldo más bajo (30 días)", bajo(A.bajo), bajo(D.bajo), D.bajo.saldo < A.bajo.saldo - 0.005)}
        ${fila("Días bajo cero (30 días)", A.rojos, D.rojos, D.rojos > A.rojos)}
        ${fila("Renta atrasada en cero", f(A.rentaCero), f(D.rentaCero), tarde(A.rentaCero, D.rentaCero))}
        ${fila(`Colchón en ${dinero(Plan.metaColchon())}`, f(A.colchon), f(D.colchon), tarde(A.colchon, D.colchon))}
        ${fila("Préstamo del amigo en cero", f(A.amigo), f(D.amigo), tarde(A.amigo, D.amigo))}
      </ul>`;
  },

  // ---------- Ajustar a mi manera: fechas y montos propios ----------
  mostrarAjuste() {
    const pago = this._ev.pago;
    $("mv-partes").innerHTML = this.ajuste.map((p, i) => `
      <div class="df-acuerdo-fila">
        <input type="date" data-mv-parte-fecha="${i}" value="${p.fecha}" min="${hoy()}" aria-label="Fecha ${i + 1}">
        <input type="number" inputmode="decimal" step="0.01" min="0" data-mv-parte-monto="${i}" value="${p.monto}" aria-label="Monto ${i + 1}">
        ${this.ajuste.length > 1 ? `<button class="borrar" data-mv-quitar-parte="${i}" aria-label="Quitar">✕</button>` : "<span></span>"}
      </div>`).join("");
    this.mostrarEfectoAjuste(pago);
  },

  validarAjuste(pago) {
    if (this.ajuste.some(p => !p.fecha)) return "Cada parte necesita su fecha.";
    if (this.ajuste.some(p => p.fecha < hoy())) return "Las fechas tienen que ser hoy o después.";
    if (this.ajuste.some(p => !(p.monto > 0))) return "Cada monto tiene que ser mayor que 0.";
    const suma = redondear(this.ajuste.reduce((s, p) => s + p.monto, 0));
    if (Math.abs(suma - pago.monto) > 0.005) return `Las partes suman ${dinero(suma)}; tienen que sumar ${dinero(pago.monto)}.`;
    return null;
  },

  mostrarEfectoAjuste(pago = this._ev.pago) {
    const suma = redondear(this.ajuste.reduce((s, p) => s + (p.monto || 0), 0));
    $("mv-suma").innerHTML = `Suma: <strong>${dinero(suma)}</strong> de ${dinero(pago.monto)}`;
    $("mv-suma").className = Math.abs(suma - pago.monto) > 0.005 ? "estado error" : "estado";
    const error = this.validarAjuste(pago);
    $("mv-error-ajuste").textContent = error && this._intentoGuardar ? error : "";
    $("mv-efecto-ajuste").innerHTML = error ? "" : this.htmlEfecto(this.efecto(this.ajuste), "¿Qué pasa en tu mes con estas fechas?");
  },

  guardarAjuste() {
    this._intentoGuardar = true;
    const error = this.validarAjuste(this._ev.pago);
    if (error) { $("mv-error-ajuste").textContent = error; return; }
    this.elegir(this.ajuste.map(p => ({ fecha: p.fecha, monto: redondear(p.monto) })).sort((a, b) => a.fecha.localeCompare(b.fecha)));
  },

  // ---------- Evaluar cada día ----------
  evaluar(clave) {
    const pago = this.pagoOriginal(clave);
    const cfg = this.config();
    const reglas = cfg.pagos[pago.id];
    const pr = this.proyeccion(clave);
    const dias = this.dias(pr.desde, pr.hasta);
    const primerDisponible = dias.find(f => pr.porDia[f].saldoFin > 0.005) || null;
    const evaluacion = {};
    dias.forEach(f => {
      const antes = pr.porDia[f].saldoFin;
      const despues = redondear(antes - pago.monto);
      const atraso = this.diferencia(f, pago.fecha);
      // Deuda atrasada (internet atrasado): se puede aplazar; no hay "atraso" ni recargo nuevo
      const fueraDeGracia = !this.esDeuda(pago) && atraso > reglas.gracia_dias;
      let color;
      if (!primerDisponible || f < primerDisponible) color = "gris";
      else if (despues < -0.005) color = "rojo";
      else if (fueraDeGracia && reglas.riesgoAlto) color = "rojo";
      else if (fueraDeGracia) color = "amarillo";
      else color = "verde";
      evaluacion[f] = { fecha: f, antes, despues, atraso, fueraDeGracia, color };
    });

    // Sugerencias
    const verdes = dias.filter(f => evaluacion[f].color === "verde");
    const amarillos = dias.filter(f => evaluacion[f].color === "amarillo");
    const candidatos = verdes.length ? verdes : amarillos;
    const divide = this.planDividir(pago, pr, primerDisponible);
    let mejor = null, segunda = null;
    if (candidatos.length) {
      mejor = { tipo: "fecha", fecha: candidatos[0] };
      const dueRojo = !evaluacion[pago.fecha] || evaluacion[pago.fecha].color !== "verde";
      if (dueRojo && divide) segunda = { tipo: "dividir", ...divide };
      else if (candidatos[1]) segunda = { tipo: "fecha", fecha: candidatos[1] };
      else if (verdes.length && amarillos.length) segunda = { tipo: "fecha", fecha: amarillos[0] };
    } else if (divide) {
      mejor = { tipo: "dividir", ...divide };
    }
    return { pago, reglas, pr, dias, evaluacion, mejor, segunda, primerDisponible };
  },

  // Dividir en 2: lo que haya el primer día con dinero (desde el vencimiento) y el resto en el siguiente cheque que alcance
  planDividir(pago, pr, primerDisponible) {
    if (!primerDisponible) return null;
    const desdeVenc = pago.fecha < pr.desde ? pr.desde : pago.fecha;
    const dias = this.dias(pr.desde, pr.hasta);
    const d1 = dias.find(f => f >= desdeVenc && pr.porDia[f].saldoFin > 0.005) || primerDisponible;
    const monto1 = redondear(Math.min(pago.monto, pr.porDia[d1].saldoFin));
    const resto = redondear(pago.monto - monto1);
    if (resto <= 0) return null; // alcanza completo: no hace falta dividir
    const cheques = pr.cheques.filter(c => c > d1);
    const d2 = cheques.find(c => pr.porDia[c].saldoFin - monto1 - resto >= -0.005) || cheques[cheques.length - 1];
    if (!d2) return null;
    return { partes: [{ fecha: d1, monto: monto1 }, { fecha: d2, monto: resto }] };
  },

  // ---------- Pantalla ----------
  // sugerida (Bloque 16): { partes: [{ fecha, monto }], motivo } desde "¿Cuándo lo compro?"
  abrir(clave, origen, escenario = null, sugerida = null) {
    if (!this.pagoOriginal(clave)) return;
    this.clave = clave;
    this.origen = origen;
    this.sugerida = sugerida && sugerida.partes ? sugerida : null;
    this.escenario = escenario; // { monto, titulo } si viene de "¿Y si cobro...?"
    this.seleccion = null;
    this._intentoGuardar = false;
    const guardado = Almacen.leerPagosMovidos()[clave];
    const original = this.pagoOriginal(clave);
    this.horizonte = Math.max(this.config().horizonte, this.diferencia(original.fecha, hoy()) + 15);
    this.ajuste = guardado ? guardado.partes.map(p => ({ ...p })) : [{ fecha: (original.meta || original.fecha) < hoy() ? hoy() : (original.meta || original.fecha), monto: original.monto }];
    $("mv-prestamo-opciones").hidden = !clave.startsWith("prestamo@");
    $("mv-recargo").value = guardado && guardado.recargo ? guardado.recargo : "";
    $("mv-correr").value = guardado && guardado.correr ? "si" : "no";
    $("mv-acordado").checked = !!(guardado && guardado.acordado);
    $("mv-nota").value = guardado ? guardado.nota || "" : "";
    document.querySelectorAll("main.contenedor").forEach(m => { m.hidden = true; });
    $("pantalla-mover").hidden = false;
    window.scrollTo(0, 0);
    this.mostrar();
  },

  cerrar() {
    $("pantalla-mover").hidden = true;
    $(this.origen || "pantalla-inicio").hidden = false;
    window.scrollTo(0, 0);
    window.dispatchEvent(new Event("movimientos-cambiaron")); // refresca listas con las fechas nuevas
  },

  textoOpcion(op) {
    if (op.tipo === "dividir") {
      return `Dividir en 2 pagos: ${dinero(op.partes[0].monto)} el ${Jornadas.textoDia(op.partes[0].fecha).toLowerCase()} ` +
        `y ${dinero(op.partes[1].monto)} el ${Jornadas.textoDia(op.partes[1].fecha).toLowerCase()}`;
    }
    const e = this._ev.evaluacion[op.fecha];
    return `${Jornadas.textoDia(op.fecha)}: ` + (e.color === "verde" ? "alcanza y sin recargo" : "alcanza, con recargo");
  },

  mostrar() {
    const ev = this.evaluar(this.clave);
    this._ev = ev;
    this._antes = null; // "Ahora" se vuelve a calcular (pudo cambiar al guardar)
    const { pago, pr, evaluacion } = ev;
    const guardado = Almacen.leerPagosMovidos()[this.clave];
    const faltaHoy = redondear(Math.max(0, pago.monto - Math.max(0, pr.inicial)));
    // En su fecha: con todo lo de ese día pagado, incluido este pago (misma regla que ¿Y si cobro...?)
    const enSuFecha = evaluacion[pago.fecha];
    let estadoFecha = "";
    if (enSuFecha) {
      const sinCheques = pr.porDia[pago.fecha].saldoSinCheques - pago.monto;
      if (enSuFecha.despues >= -0.005) {
        const ch = sinCheques < -0.005 ? Proyeccion.ultimoCheque(pr, pago.fecha) : null;
        estadoFecha = ch ? `Se paga con el cheque del ${Jornadas.textoDia(ch).toLowerCase()}` : "Se paga en su fecha";
      } else {
        estadoFecha = `No alcanza en su fecha: falta ${dinero(-enSuFecha.despues)}`;
      }
    }

    $("mv-cabeza").innerHTML = `
      <h2 class="mv-nombre">${escapar(pago.nombre)}</h2>
      <ul class="resumen">
        <li><span>Monto</span><span>${dinero(pago.monto)}</span></li>
        ${this.esDeuda(pago)
          ? `<li><span>Fecha</span><span>Sin fecha (deuda atrasada)</span></li>`
          : `<li><span>Vencimiento original</span><span>${Jornadas.textoDia(pago.fecha)}</span></li>`}
        ${pago.meta ? `<li><span>Tu meta</span><span>${Jornadas.textoDia(pago.meta)} (último viernes)</span></li>` : ""}
        <li><span>Para cubrirlo hoy te falta</span><span class="${faltaHoy > 0 ? "error" : "ok"}">${dinero(faltaHoy)}</span></li>
        ${estadoFecha && !this.esDeuda(pago) ? `<li><span>En su fecha</span><span class="${estadoFecha.startsWith("No") ? "error" : "ok"}">${estadoFecha}</span></li>` : ""}
      </ul>
      ${this.escenario ? `<p class="estado">Escenario: ${escapar(this.escenario.titulo)} (${dinero(this.escenario.monto)})</p>` : ""}
      <p class="estado esc-cuenta">${escapar(Proyeccion.textoCuenta(pr))}</p>
      ${guardado ? `<div class="mv-guardado">
          <strong>Movido:</strong> ${guardado.partes.map(p => `${dinero(p.monto)} el ${Jornadas.textoDia(p.fecha).toLowerCase()}`).join(" y ")}
          ${guardado.acordado ? " · ✓ acordado con la empresa" : '<div class="aviso-movido">⚠ Falta acordarlo con la empresa</div>'}
          <button id="mv-deshacer" class="boton-chico">Volver a la fecha original</button>
        </div>` : ""}`;

    $("mv-colchon").innerHTML = ColchonUI.html() + (pago.id === "renta" ? "" : RentaUI.html(pr));
    const sugerida = this.sugerida
      ? [[this.sugerida.motivo || "Sugerida", { tipo: this.sugerida.partes.length > 1 ? "dividir" : "fecha",
          partes: this.sugerida.partes, fecha: this.sugerida.partes[0].fecha }, "plan"]] : [];
    $("mv-sugerencias").innerHTML = [...sugerida, ["Mejor fecha", ev.mejor, "mejor"], ["Segunda opción", ev.segunda, "segunda"]]
      .filter(([, op]) => op)
      .map(([etiqueta, op, id]) => `
        <div class="mv-opcion">
          <span class="mv-etiqueta ${id}">${etiqueta}</span>
          <p>${escapar(this.textoOpcion(op))}</p>
          <button class="boton-chico lleno" data-elegir-opcion="${id}">Elegir</button>
          ${op.tipo === "fecha" ? `<button class="boton-chico" data-ver-dia="${op.fecha}">Ver impacto</button>` : ""}
        </div>`).join("") || `<p class="mensaje-sobrante negativo">En los próximos ${pr.dias ? "" : ""}${this.config().horizonte} días no se ve ninguna fecha en que alcance. Habla con la empresa para pedir un acuerdo.</p>`;

    // Calendario de los próximos días (como el del Bloque 8)
    const primerLunes = Plan.claveSemana(Jornadas.aFecha(pr.desde));
    const ultimoDomingo = Jornadas.sumarDias(Plan.claveSemana(Jornadas.aFecha(pr.hasta)), 6);
    const todos = this.dias(primerLunes, ultimoDomingo);
    const etiquetas = {};
    if (ev.mejor) (ev.mejor.tipo === "fecha" ? [ev.mejor.fecha] : ev.mejor.partes.map(p => p.fecha)).forEach(f => { etiquetas[f] = "Mejor"; });
    if (ev.segunda) (ev.segunda.tipo === "fecha" ? [ev.segunda.fecha] : ev.segunda.partes.map(p => p.fecha)).forEach(f => { etiquetas[f] = etiquetas[f] || "2ª"; });
    const semanas = [];
    for (let i = 0; i < todos.length; i += 7) semanas.push(todos.slice(i, i + 7));
    $("mv-calendario").innerHTML = semanas.map(sem => `<div class="cal-dias">${sem.map(f => {
      const e = evaluacion[f];
      const d = Jornadas.aFecha(f).getDate();
      if (!e) return `<span class="dia mv-fuera" aria-hidden="true"><span class="dia-num">${d}</span></span>`;
      const dia = pr.porDia[f];
      const marcas = [];
      if (dia.lineas.some(l => l.tipo === "cheque")) marcas.push(`<span class="marca-cobro">$</span>`);
      const letras = [...new Set(dia.lineas.filter(l => l.letra).map(l => l.letra + (l.movido ? "↻" : "")))];
      if (letras.length) marcas.push(`<span class="marca-vence">${letras.join(" ")}</span>`);
      if (f === pago.fecha && !this.esDeuda(pago)) marcas.push(`<span class="mv-vence">vence</span>`);
      if (etiquetas[f]) marcas.push(`<span class="mv-sugerida">${etiquetas[f]}</span>`);
      const nombreColor = { verde: "alcanza sin recargo", amarillo: "alcanza con recargo", rojo: "no alcanza o riesgo alto", gris: "todavía sin dinero" }[e.color];
      return `<button class="dia mv-${e.color}${f === this.seleccion ? " mv-elegido" : ""}${f === hoy() ? " hoy" : ""}" data-mv-dia="${f}"
        aria-label="${Jornadas.textoDia(f)}: ${nombreColor}"><span class="dia-num">${d}</span>${marcas.join("")}</button>`;
    }).join("")}</div>`).join("");

    this.mostrarDetalle();
    this.mostrarAjuste();
  },

  mostrarDetalle() {
    const caja = $("mv-detalle");
    if (!this.seleccion || !this._ev.evaluacion[this.seleccion]) { caja.hidden = true; return; }
    const { pago, reglas, pr } = this._ev;
    const e = this._ev.evaluacion[this.seleccion];
    const atraso = e.atraso > 0 ? `${e.atraso} ${e.atraso === 1 ? "día" : "días"} de atraso`
      : e.atraso === 0 ? "El mismo día del vencimiento (a tiempo)" : `${-e.atraso} ${e.atraso === -1 ? "día" : "días"} antes del vencimiento (a tiempo)`;
    const op = this.opcionesPrestamo();
    const recargo = pago.id === "prestamo"
      ? (op.recargo > 0 ? `Recargo acordado: ${dinero(op.recargo)}` : "Sin recargo (si acuerdan uno, ponlo arriba)")
      : !e.fueraDeGracia
      ? (e.atraso > 0 ? `Dentro de la gracia (${reglas.gracia_dias} días): sin recargo` : "Sin recargo")
      : reglas.recargo == null ? "Recargo por confirmar" : `Recargo estimado: ${dinero(reglas.recargo)}`;
    const choques = pr.porDia[this.seleccion].lineas.filter(l => l.tipo !== "cheque").map(l => `${l.nombre} (${dinero(-l.monto)})`);
    // El siguiente cheque a partir del vencimiento original
    const siguiente = pr.cheques.find(c => c >= pago.fecha) || pr.cheques[pr.cheques.length - 1];
    const cheque = !siguiente ? "No hay cheque en estas fechas"
      : this.seleccion < siguiente ? `Antes de tu siguiente cheque (${Jornadas.textoDia(siguiente).toLowerCase()})`
      : this.seleccion === siguiente ? "El mismo día de tu siguiente cheque"
      : `Después de tu siguiente cheque (${Jornadas.textoDia(siguiente).toLowerCase()})`;
    caja.hidden = false;
    caja.innerHTML = `
      <h2>${Jornadas.textoDia(this.seleccion)}</h2>
      <ul class="resumen">
        ${this.esDeuda(pago)
          ? `<li><span>Deuda atrasada</span><span>Puedes elegir la fecha; no genera recargo nuevo</span></li>`
          : `<li><span>Atraso</span><span>${atraso}</span></li><li><span>Recargo</span><span>${recargo}</span></li>`}
        <li><span>Saldo después de pagar</span><span class="${e.despues < 0 ? "error" : "ok"}">${e.despues < 0 ? `−${dinero(-e.despues)} · Falta ${dinero(-e.despues)}` : dinero(e.despues)}</span></li>
        <li><span>Ese día también</span><span>${choques.length ? escapar(choques.join(", ")) : "Nada más"}</span></li>
        <li><span>Cheque</span><span>${cheque}</span></li>
      </ul>
      ${this.htmlEfecto(this.efecto([{ fecha: this.seleccion, monto: pago.monto }]), "¿Qué pasa en tu mes si lo pagas este día?")}
      ${reglas.riesgo ? `<p class="mv-riesgo">⚠ ${escapar(reglas.riesgo)}</p>` : ""}
      <p class="ayuda">${this.TEXTO_FIJO}</p>
      <button id="mv-elegir-dia" class="boton-grande deuda">Elegir esta fecha</button>`;
  },

  elegir(partes) {
    Almacen.guardarPagoMovido(this.clave, {
      ...this.movidoCon(partes), acordado: $("mv-acordado").checked, nota: $("mv-nota").value.trim()
    });
    Pantalla.aviso(partes.length > 1 ? `Guardado: pago dividido en ${partes.length} fechas` : `Guardado: ${Jornadas.textoDia(partes[0].fecha).toLowerCase()}`);
    this.ajuste = partes.map(p => ({ ...p }));
    this._intentoGuardar = false;
    this.mostrar();
  },

  async deshacer() {
    if (!(await preguntar("¿Volver este pago a su fecha original?", "Sí, volver"))) return;
    Almacen.quitarPagoMovido(this.clave);
    const original = this.pagoOriginal(this.clave);
    this.ajuste = [{ fecha: (original.meta || original.fecha) < hoy() ? hoy() : (original.meta || original.fecha), monto: original.monto }];
    $("mv-acordado").checked = false;
    $("mv-nota").value = "";
    $("mv-recargo").value = "";
    $("mv-correr").value = "no";
    Pantalla.aviso("Vuelve a su fecha original");
    this.mostrar();
  },

  // La casilla y la nota se guardan solas si el pago ya está movido
  guardarAcuerdo() {
    if (!Almacen.leerPagosMovidos()[this.clave]) return;
    Almacen.guardarPagoMovido(this.clave, { acordado: $("mv-acordado").checked, nota: $("mv-nota").value.trim(), ...this.opcionesPrestamo() });
    this.mostrar();
  },

  iniciar() {
    $("volver-mover").addEventListener("click", () => this.cerrar());
    $("pantalla-mover").addEventListener("click", e => {
      const dia = e.target.closest("[data-mv-dia]");
      if (dia) { this.seleccion = dia.dataset.mvDia; this.mostrar(); $("mv-detalle").scrollIntoView({ block: "nearest" }); }
      const ver = e.target.closest("[data-ver-dia]");
      if (ver) { this.seleccion = ver.dataset.verDia; this.mostrar(); $("mv-detalle").scrollIntoView({ block: "nearest" }); }
      if (e.target.closest("#mv-elegir-dia")) this.elegir([{ fecha: this.seleccion, monto: this._ev.pago.monto }]);
      const op = e.target.closest("[data-elegir-opcion]");
      if (op) {
        if (op.dataset.elegirOpcion === "plan" && this.sugerida) { this.elegir(this.sugerida.partes); return; }
        const o = this._ev[op.dataset.elegirOpcion === "mejor" ? "mejor" : "segunda"];
        this.elegir(o.tipo === "dividir" ? o.partes : [{ fecha: o.fecha, monto: this._ev.pago.monto }]);
      }
      if (e.target.closest("#mv-deshacer")) this.deshacer();
    });
    // Ajustar a mi manera
    $("mv-ajuste").addEventListener("input", e => {
      const f = e.target.closest("[data-mv-parte-fecha]"), m = e.target.closest("[data-mv-parte-monto]");
      if (f) this.ajuste[+f.dataset.mvParteFecha].fecha = f.value;
      if (m) this.ajuste[+m.dataset.mvParteMonto].monto = Number(m.value);
      if (f || m) this.mostrarEfectoAjuste();
    });
    $("mv-ajuste").addEventListener("click", e => {
      if (e.target.closest("#mv-agregar-parte")) {
        const ultima = this.ajuste[this.ajuste.length - 1];
        this.ajuste.push({ fecha: Jornadas.sumarDias(ultima.fecha || hoy(), 7), monto: 0 });
        this.mostrarAjuste();
      }
      const q = e.target.closest("[data-mv-quitar-parte]");
      if (q) { this.ajuste.splice(+q.dataset.mvQuitarParte, 1); this.mostrarAjuste(); }
      if (e.target.closest("#mv-guardar-ajuste")) this.guardarAjuste();
    });
    // Préstamo: recargo y pagos corridos (si ya está movido se guarda; si no, solo cambia lo que ves)
    $("mv-recargo").addEventListener("change", () => {
      const v = $("mv-recargo").value;
      $("mv-error-prestamo").textContent = v !== "" && !(Number(v) >= 0) ? "El recargo tiene que ser 0 o más." : "";
      if (Almacen.leerPagosMovidos()[this.clave]) this.guardarAcuerdo(); else this.mostrar();
    });
    $("mv-correr").addEventListener("change", () => {
      if (Almacen.leerPagosMovidos()[this.clave]) this.guardarAcuerdo(); else this.mostrar();
    });
    $("mv-acordado").addEventListener("change", () => this.guardarAcuerdo());
    $("mv-nota").addEventListener("change", () => this.guardarAcuerdo());
    Vencimientos.mostrar(); // ahora ya se puede mostrar "Mover" en Próximos pagos
  }
};

if (Datos.actual) Mover.iniciar();
