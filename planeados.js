/*
 * GASTOS PLANEADOS (Bloque 15)
 * Lista, formulario y pantalla "¿Cuándo lo compro?".
 * Cada día se evalúa con la misma cuenta de proyeccion.js: el gasto planeado se resta ese día
 * y se mira si algún día queda bajo cero y si se corren las fechas de las deudas.
 * Elegir una fecha guarda el plan; el gasto entra en proyeccion.js (vía Próximos pagos) desde ese momento.
 * "Ya lo compré" registra un gasto con el formulario de "Gasté" y deja de contarse como planeado.
 */
const Planeados = {
  CATEGORIA_FIESTAS: "Navidad / Fiestas",
  actual: null,   // id del gasto planeado abierto en "¿Cuándo lo compro?"
  dia: null,      // día tocado
  partes: null,   // partes en edición [{ fecha, monto }]
  editando: null, // id en el formulario

  // ---------- Comprado (sale de los gastos registrados, para no duplicar) ----------
  parteComprada(g, i) {
    return Almacen.leerMovimientos().some(m => m.planeadoId === g.id && (m.planeadoParte === "todo" || m.planeadoParte === i));
  },

  comprado(g) {
    if (g.elegido && g.elegido.length) return g.elegido.every((_, i) => this.parteComprada(g, i));
    return Almacen.leerMovimientos().some(m => m.planeadoId === g.id);
  },

  pendiente(g) {
    if (g.elegido && g.elegido.length) return redondear(g.elegido.reduce((s, p, i) => s + (this.parteComprada(g, i) ? 0 : p.monto), 0));
    return g.monto;
  },

  estado(g) {
    if (this.comprado(g)) return { texto: "Comprado", clase: "comprado" };
    if (g.elegido && g.elegido.length) return { texto: "Con fecha elegida", clase: "elegido" };
    return { texto: "Sin fecha", clase: "sin" };
  },

  sinFecha() {
    return Almacen.leerPlaneados().filter(g => !this.comprado(g) && !(g.elegido && g.elegido.length)).length;
  },

  // ---------- El motor: misma cuenta de proyeccion.js ----------
  motor(g) {
    const escenario = Futuro.estado().escenario;
    const cheque = Escenarios.config()[escenario];
    const pr = Proyeccion.calcular({ chequeEscenario: cheque, excluirPlaneado: g.id });
    const prLargo = Proyeccion.calcular({ chequeEscenario: cheque, excluirPlaneado: g.id, horizonte: 730 });
    return { escenario, pr, prLargo, fechas: Object.keys(pr.porDia).sort() };
  },

  saldo(m, f, ajustes) {
    return m.pr.porDia[f].saldoFin - ajustes.reduce((s, a) => s + (a.fecha <= f ? a.monto : 0), 0);
  },

  minimo(m, ajustes) {
    let r = null;
    m.fechas.forEach(f => { const s = this.saldo(m, f, ajustes); if (!r || s < r.saldo) r = { fecha: f, saldo: redondear(s) }; });
    return r;
  },

  diasEntre(a, b) {
    if (a === "ya" && b === "ya") return 0;
    if (!a) return 0;                // ni sin el gasto se alcanza: no cambia
    if (a && !b) return Infinity;    // con el gasto ya no se alcanza en 2 años
    if (a === "ya" || b === "ya") return 0;
    return Math.round((Jornadas.aFecha(b) - Jornadas.aFecha(a)) / 86400000);
  },

  costo(l) {
    if (l.id === "renta") return Escenarios.costo("renta");
    if (l.id === "prestamo") return "Avisa antes a quien te prestó";
    if (["luz", "telefono", "internet", "deudaInternet"].includes(l.id)) return Escenarios.costo(l.id);
    if (l.inmediato) return Escenarios.costo("deudaInternet");
    return "";
  },

  // Efecto de gastar "monto" el día "dia" (con otras partes ya puestas en "otros")
  evaluar(m, dia, monto, otros = []) {
    if (!m.pr.porDia[dia]) return { color: "gris", fuera: true };
    const primero = m.fechas.find(f => this.saldo(m, f, otros) > 0.005);
    if (!primero || dia < primero) return { color: "gris", sinDinero: true };
    const con = [...otros, { fecha: dia, monto }];
    // Pagos que dejan de alcanzar desde ese día
    const cambian = [];
    let rojo = false;
    m.fechas.filter(f => f >= dia).forEach(f => {
      const s0 = this.saldo(m, f, otros), s1 = this.saldo(m, f, con);
      if (s1 < -0.005) {
        rojo = true;
        // Pagos de ese día que dejan de alcanzar (o que ya faltaban y quedan más cortos)
        const empeora = s0 < -0.005;
        m.pr.porDia[f].lineas.filter(l => l.monto < 0 && !l.planeado).forEach(l => {
          if (cambian.some(c => c.nombre === l.nombre && c.fecha === f)) return;
          cambian.push({ nombre: l.nombre, fecha: f, empeora, costo: this.costo(l),
                         nivel1: ["renta", "prestamo", "comida", "transporte"].includes(l.id) || !!l.inmediato });
        });
      }
    });
    // Cuánto se corren las fechas de las deudas (misma regla del Bloque 11 y del colchón)
    const base = Proyeccion.planDeudas({ pr: m.prLargo, ajustes: otros });
    const despues = Proyeccion.planDeudas({ pr: m.prLargo, ajustes: con });
    const corre = {
      renta: this.diasEntre(base.rentaCero, despues.rentaCero),
      colchon: this.diasEntre(base.colchonLleno, despues.colchonLleno),
      amigo: this.diasEntre(base.amigoCero, despues.amigoCero)
    };
    const efecto = Object.values(corre).reduce((s, d) => s + (d === Infinity ? 10000 : Math.max(0, d)), 0);
    const color = rojo ? "rojo" : efecto > 0 ? "amarillo" : "verde";
    return { color, cambian, corre, efecto, minSin: this.minimo(m, otros), minCon: this.minimo(m, con), base, despues };
  },

  // Mejor fecha y segunda opción (siempre hasta la fecha límite)
  sugerencias(m, g) {
    const dias = m.fechas.filter(f => f <= g.fechaLimite);
    const ev = {};
    dias.forEach(f => { ev[f] = this.evaluar(m, f, g.monto); });
    const verdes = dias.filter(f => ev[f].color === "verde");
    const amarillos = dias.filter(f => ev[f].color === "amarillo").sort((a, b) => ev[a].efecto - ev[b].efecto || a.localeCompare(b));
    const lista = [...verdes, ...amarillos].slice(0, 2);
    let problema = null;
    if (!lista.length) {
      const rojos = dias.filter(f => ev[f].color === "rojo");
      const menosMalo = rojos.sort((a, b) => ev[b].minCon.saldo - ev[a].minCon.saldo)[0];
      // La renta va primero: se nombra primero un pago de Nivel 1 (renta, préstamo, comida, transporte)
      const afectados = menosMalo ? ev[menosMalo].cambian : [];
      const primero = afectados.find(c => c.nivel1) || afectados[0];
      const pago = primero ? primero.nombre : "tu saldo (queda bajo cero)";
      problema = `Antes del ${this.textoDia(g.fechaLimite)} no hay un día sin afectar ${pago}. ` +
        "Opciones: comprarlo en partes, comprar menos o mover la fecha límite.";
    }
    return { ev, mejor: lista[0] || null, segunda: lista[1] || null, problema };
  },

  // Partes: el monto repartido en los días de cobro con más sobrante (después del Nivel 1 de ese día)
  sugerirPartes(m, g) {
    const k = Math.max(2, Math.min(3, g.partes || 2));
    let dias = m.pr.cheques.filter(c => c <= g.fechaLimite);
    if (!dias.length) dias = [m.fechas[0]];
    const elegidos = [];
    const base = redondear(g.monto / Math.min(k, dias.length));
    for (let j = 0; j < Math.min(k, dias.length); j++) {
      const libres = dias.filter(d => !elegidos.some(e => e.fecha === d)).map(d => {
        let min = Infinity;
        m.fechas.filter(f => f >= d).forEach(f => { min = Math.min(min, this.saldo(m, f, elegidos)); });
        return { d, libre: min };
      }).sort((a, b) => b.libre - a.libre);
      elegidos.push({ fecha: libres[0].d, monto: base });
    }
    const suma = elegidos.reduce((s, p) => s + p.monto, 0);
    elegidos[elegidos.length - 1].monto = redondear(elegidos[elegidos.length - 1].monto + g.monto - suma);
    return elegidos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  },

  // ---------- Textos ----------
  textoDia(f) { return Jornadas.textoDia(f).toLowerCase(); },
  plata(n) { return n < 0 ? `−${dinero(-n)}` : dinero(n); },
  textoCorre(d, que) {
    if (d === Infinity) return `${que}: con este gasto ya no se alcanza en 2 años`;
    if (d > 0) return `${que}: ${d} ${d === 1 ? "día" : "días"} después`;
    return `${que}: igual`;
  },

  // ---------- Lista ----------
  abrirLista() {
    document.querySelectorAll("main.contenedor").forEach(x => { x.hidden = true; });
    $("pantalla-planeados").hidden = false;
    window.scrollTo(0, 0);
    this.mostrarLista();
  },

  mostrarLista() {
    if ($("pantalla-planeados").hidden) return;
    const lista = Almacen.leerPlaneados().slice().sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite));
    $("pl-lista").innerHTML = lista.length === 0
      ? `<p class="vacio">No tienes gastos planeados.</p>`
      : lista.map(g => {
          const e = this.estado(g);
          const fechas = g.elegido && g.elegido.length
            ? g.elegido.map(p => `${dinero(p.monto)} el ${this.textoDia(p.fecha)}`).join(" y ") : "";
          return `
            <li class="pl-item">
              <div class="deuda-cabeza">
                <span class="deuda-nombre">${escapar(g.nombre)}</span>
                <span class="deuda-nombre">${dinero(g.monto)}</span>
              </div>
              <p class="deuda-sub">Necesito tenerlo para el ${this.textoDia(g.fechaLimite)} · ${g.tipo === "espera" ? "Puede esperar" : "Lo necesito"}</p>
              <p class="pl-estado ${e.clase}">${e.texto}${fechas && e.clase === "elegido" ? `: ${fechas}` : ""}</p>
              <div class="pl-botones">
                ${e.clase !== "comprado" ? `<button class="boton-chico lleno" data-pl-cuando="${g.id}">¿Cuándo lo compro?</button>
                  <button class="boton-chico" data-pl-compre="${g.id}">Ya lo compré</button>` : ""}
                <button class="boton-chico" data-pl-editar="${g.id}">Editar</button>
                <button class="borrar" data-pl-borrar="${g.id}" aria-label="Borrar">✕</button>
              </div>
            </li>`;
        }).join("");
  },

  abrirFormulario(g = null) {
    this.editando = g ? g.id : null;
    abrirFormulario("planeado");
    if (g) {
      $("form-titulo").textContent = "Editar gasto planeado";
      $("f-nombre").value = g.nombre;
      $("f-monto").value = g.monto;
      $("f-fecha").value = g.fechaLimite;
      $("f-categoria").value = g.categoria;
      $("f-nota").value = g.nota || "";
      $("f-tipo").value = g.tipo;
      $("f-en-partes").checked = !!g.enPartes;
      $("f-partes").value = String(g.partes || 2);
      $("campo-partes").hidden = !g.enPartes;
    }
  },

  async borrar(id) {
    const g = Almacen.leerPlaneados().find(x => x.id === id);
    if (!g || !(await preguntar(`¿Borrar "${g.nombre}"?\nSi ya registraste la compra, ese gasto se queda.`, "Sí, borrar"))) return;
    Almacen.borrarPlaneado(id);
    this.alCambiar("Borrado");
  },

  // "Ya lo compré": el formulario de "Gasté" con el monto que falta (se puede cambiar al real)
  comprar(id) {
    const g = Almacen.leerPlaneados().find(x => x.id === id);
    if (!g) return;
    abrirFormulario("gasto", { categoria: g.categoria, monto: this.pendiente(g), nota: g.nombre,
                               extra: { planeadoId: g.id, planeadoParte: "todo" } });
  },

  alCambiar(aviso) {
    if (aviso) Pantalla.aviso(aviso);
    window.dispatchEvent(new Event("movimientos-cambiaron"));
  },

  // ---------- ¿Cuándo lo compro? ----------
  abrirCuando(id) {
    this.actual = id;
    this.dia = null;
    this.partes = null;
    document.querySelectorAll("main.contenedor").forEach(x => { x.hidden = true; });
    $("pantalla-cuando").hidden = false;
    window.scrollTo(0, 0);
    this.mostrarCuando();
  },

  cerrarCuando() {
    $("pantalla-cuando").hidden = true;
    this.abrirLista();
  },

  mostrarCuando() {
    if ($("pantalla-cuando").hidden) return;
    const g = Almacen.leerPlaneados().find(x => x.id === this.actual);
    if (!g) return this.cerrarCuando();
    const m = this.motor(g);
    const s = this.sugerencias(m, g);
    this._m = m; this._s = s; this._g = g;
    const est = Futuro.estado();

    $("pc-cabeza").innerHTML = `
      <h2 class="mv-nombre">${escapar(g.nombre)}</h2>
      <ul class="resumen">
        <li><span>Monto</span><span>${dinero(g.monto)}</span></li>
        <li><span>Necesito tenerlo para</span><span>${Jornadas.textoDia(g.fechaLimite)}</span></li>
      </ul>
      ${g.elegido && g.elegido.length ? `<div class="mv-guardado"><strong>Fecha elegida:</strong>
          ${g.elegido.map(p => `${dinero(p.monto)} el ${this.textoDia(p.fecha)}`).join(" y ")}
          <button id="pc-deshacer" class="boton-chico">Deshacer la fecha elegida</button>
          <button id="pc-compre" class="boton-chico lleno">Ya lo compré</button></div>` : ""}
      <p class="estado esc-cuenta">${escapar(Proyeccion.textoCuenta(m.pr))}</p>`;

    $("pc-escenarios").innerHTML = Futuro.ESCENARIOS.map(e => `
      <button class="${e.id === est.escenario ? "activo" : ""}" data-pc-escenario="${e.id}" aria-pressed="${e.id === est.escenario}">
        ${e.titulo}<small>${dinero(Escenarios.config()[e.id])}</small></button>`).join("");

    $("pc-sugerencias").innerHTML = s.problema
      ? `<p class="mensaje-sobrante negativo pc-problema">${escapar(s.problema)}</p>`
      : [["Mejor fecha", s.mejor, "mejor"], ["Segunda opción", s.segunda, "segunda"]].filter(([, f]) => f).map(([t, f, id]) => `
          <div class="mv-opcion">
            <span class="mv-etiqueta ${id}">${t}</span>
            <p>${Jornadas.textoDia(f)}: ${s.ev[f].color === "verde" ? "no afecta nada" : "alcanza, pero corre otras fechas"}</p>
            <button class="boton-chico lleno" data-pc-elegir="${f}">Elegir</button>
            <button class="boton-chico" data-pc-dia="${f}">Ver impacto</button>
          </div>`).join("");

    // Vista de mes / semana
    document.querySelectorAll("[data-pc-vista]").forEach(b => b.classList.toggle("activo", b.dataset.pcVista === est.vista));
    $("pc-mes").hidden = est.vista !== "mes";
    $("pc-semana").hidden = est.vista !== "semana";
    const etiqueta = f => f === s.mejor ? "Mejor" : f === s.segunda ? "2ª" : "";
    const color = f => (s.ev[f] || this.evaluar(m, f, g.monto)).color;
    if (est.vista === "mes") {
      const inicio = Plan.claveSemana(Jornadas.aFecha(m.fechas[0]));
      const fin = Jornadas.sumarDias(Plan.claveSemana(Jornadas.aFecha(m.fechas[m.fechas.length - 1])), 6);
      const celdas = [];
      for (let f = inicio; f <= fin; f = Jornadas.sumarDias(f, 1)) celdas.push(f);
      $("pc-calendario").innerHTML = celdas.map(f => {
        const num = Jornadas.aFecha(f).getDate();
        if (!m.pr.porDia[f]) return `<span class="dia mv-fuera" aria-hidden="true"><span class="dia-num">${num}</span></span>`;
        const c = color(f);
        return `<button class="dia mv-${c}${f === this.dia ? " mv-elegido" : ""}${Proyeccion.esLibre(f) ? " libre-borde" : ""}" data-pc-dia="${f}"
            aria-label="${Jornadas.textoDia(f)}: ${c}">
          <span class="dia-num">${num}</span>
          ${f === g.fechaLimite ? `<span class="mv-vence">límite</span>` : ""}
          ${etiqueta(f) ? `<span class="mv-sugerida">${etiqueta(f)}</span>` : ""}
        </button>`;
      }).join("");
    } else {
      const lunes = Jornadas.sumarDias(Plan.claveSemana(Jornadas.aFecha(m.fechas[0])), (this.semana || 0) * 7);
      $("pc-sem-titulo").textContent = `${Futuro.diaCorto(lunes)} – ${Futuro.diaCorto(Jornadas.sumarDias(lunes, 6))}`;
      const dias = [];
      for (let i = 0; i < 7; i++) dias.push(Jornadas.sumarDias(lunes, i));
      $("pc-sem-lista").innerHTML = dias.map(f => {
        if (!m.pr.porDia[f]) return `<li class="fu-sem-dia fuera"><div class="fu-sem-fecha">${Jornadas.textoDia(f)}</div><div class="vacio">Fuera de los próximos 30 días</div></li>`;
        const e = s.ev[f] || this.evaluar(m, f, g.monto);
        const texto = { verde: "No afecta nada", amarillo: "Alcanza, pero corre otras fechas", rojo: "Deja algo sin cubrir", gris: "Todavía no hay dinero" }[e.color];
        return `<li class="fu-sem-dia"><button class="fu-sem-boton" data-pc-dia="${f}">
            <div class="fu-sem-fecha">${Jornadas.textoDia(f)} ${f === g.fechaLimite ? '<span class="mv-vence">límite</span>' : ""}</div>
            <div><span class="pc-chip mv-${e.color}">${texto}</span>${etiqueta(f) ? ` <span class="mv-sugerida">${etiqueta(f)}</span>` : ""}</div>
          </button></li>`;
      }).join("");
    }

    this.mostrarImpacto();
    this.mostrarPartes();
  },

  mostrarImpacto() {
    const caja = $("pc-impacto");
    const g = this._g, m = this._m;
    if (!this.dia || !m.pr.porDia[this.dia]) { caja.hidden = true; return; }
    const e = this.evaluar(m, this.dia, g.monto);
    caja.hidden = false;
    if (e.color === "gris") {
      caja.innerHTML = `<h2>${Jornadas.textoDia(this.dia)}</h2><p class="vacio">Ese día todavía no tienes dinero para gastar.</p>`;
      return;
    }
    const cambian = e.cambian.length
      ? `<ul class="pc-cambian">${e.cambian.map(c => `<li>${escapar(c.nombre)} (${this.textoDia(c.fecha)}) ${c.empeora ? "ya no alcanzaba y queda más corto" : "pasa a no alcanzar"}${c.costo ? ` · ${escapar(c.costo)}` : ""}</li>`).join("")}</ul>`
      : "<p>Ningún pago cambia.</p>";
    caja.innerHTML = `
      <h2>Si lo compras el ${this.textoDia(this.dia)}</h2>
      <p class="pc-semaforo"><span class="pc-chip mv-${e.color}">${{ verde: "No afecta nada", amarillo: "Alcanza, pero corre otras fechas", rojo: "Deja algo sin cubrir" }[e.color]}</span></p>
      <ul class="resumen">
        <li><span>Saldo más bajo del mes, sin el gasto</span><span>${this.plata(e.minSin.saldo)} · ${this.textoDia(e.minSin.fecha)}</span></li>
        <li><span>Con el gasto</span><span class="${e.minCon.saldo < 0 ? "error" : ""}">${this.plata(e.minCon.saldo)} · ${this.textoDia(e.minCon.fecha)}</span></li>
      </ul>
      <h3 class="pc-sub">Pagos que cambian</h3>${cambian}
      <h3 class="pc-sub">Fechas que se corren</h3>
      <ul class="pc-cambian">
        <li>${this.textoCorre(e.corre.renta, "Renta atrasada en cero")}</li>
        <li>${this.textoCorre(e.corre.colchon, `Colchón en ${dinero(Plan.metaColchon())}`)}</li>
        <li>${this.textoCorre(e.corre.amigo, "Préstamo del amigo en cero")}</li>
      </ul>
      <p class="ayuda">Es una estimación, no una orden.</p>
      ${this.dia <= g.fechaLimite ? `<button id="pc-elegir-dia" class="boton-grande deuda">Elegir esta fecha</button>`
        : `<p class="aviso-movido">Este día es después de la fecha límite.</p>`}`;
  },

  // ---------- Comprar en partes ----------
  mostrarPartes() {
    const g = this._g, m = this._m;
    const caja = $("pc-partes");
    caja.hidden = !g.enPartes;
    if (!g.enPartes) return;
    if (!this.partes) {
      caja.innerHTML = `<h2>Comprar en partes</h2>
        <p class="estado">Hasta ${g.partes || 2} partes, en los días de cobro con más sobrante.</p>
        <button id="pc-dividir" class="boton-mediano">Dividir en partes</button>`;
      return;
    }
    const filas = this.partes.map((p, i) => {
      const otros = this.partes.filter((_, j) => j !== i);
      const e = this.evaluar(m, p.fecha, p.monto, otros);
      const texto = { verde: "No afecta nada", amarillo: "Corre otras fechas", rojo: "Deja algo sin cubrir", gris: e.fuera ? "Fuera de 30 días" : "Todavía no hay dinero" }[e.color];
      return `<li class="pc-parte">
          <div class="pc-parte-cabeza"><strong>Parte ${i + 1}</strong><span class="pc-chip mv-${e.color}">${texto}</span></div>
          <div class="pc-parte-campos">
            <label>Fecha<input type="date" data-pc-parte-fecha="${i}" value="${p.fecha}"></label>
            <label>Monto<input type="number" inputmode="decimal" step="0.01" min="0.01" data-pc-parte-monto="${i}" value="${p.monto.toFixed(2)}"></label>
          </div>
        </li>`;
    }).join("");
    const todas = this.partes;
    const suma = redondear(todas.reduce((s, p) => s + p.monto, 0));
    const base = Proyeccion.planDeudas({ pr: m.prLargo });
    const con = Proyeccion.planDeudas({ pr: m.prLargo, ajustes: todas });
    const minCon = this.minimo(m, todas.filter(p => m.pr.porDia[p.fecha] || p.fecha < m.fechas[0]));
    const corre = { renta: this.diasEntre(base.rentaCero, con.rentaCero), colchon: this.diasEntre(base.colchonLleno, con.colchonLleno), amigo: this.diasEntre(base.amigoCero, con.amigoCero) };
    const despuesLimite = todas.some(p => p.fecha > g.fechaLimite);
    caja.innerHTML = `<h2>Comprar en partes</h2>
      <ul class="pc-partes">${filas}</ul>
      <p class="pc-suma ${Math.abs(suma - g.monto) > 0.005 ? "error" : ""}">Suma de las partes: <strong>${dinero(suma)}</strong> de ${dinero(g.monto)}</p>
      <h3 class="pc-sub">Efecto total</h3>
      <ul class="pc-cambian">
        <li>Saldo más bajo del mes: ${this.plata(minCon.saldo)} · ${this.textoDia(minCon.fecha)}</li>
        <li>${this.textoCorre(corre.renta, "Renta atrasada en cero")}</li>
        <li>${this.textoCorre(corre.colchon, `Colchón en ${dinero(Plan.metaColchon())}`)}</li>
        <li>${this.textoCorre(corre.amigo, "Préstamo del amigo en cero")}</li>
      </ul>
      ${despuesLimite ? `<p class="aviso-movido">Una parte queda después de la fecha límite.</p>` : ""}
      <p class="ayuda">Es una estimación, no una orden.</p>
      <button id="pc-elegir-partes" class="boton-grande deuda">Elegir estas fechas y montos</button>
      <button id="pc-sugerir" class="boton-chico">Volver a la sugerencia</button>`;
  },

  // Cambiar el monto de una parte: la última (o la anterior, si se cambia la última) se ajusta para que la suma siga igual
  cambiarMontoParte(i, valor) {
    const g = this._g;
    const v = redondear(Number(valor));
    if (!(v > 0) || v >= g.monto) { this.mostrarPartes(); return; }
    this.partes[i].monto = v;
    const j = i === this.partes.length - 1 ? i - 1 : this.partes.length - 1;
    const resto = redondear(g.monto - this.partes.reduce((s, p, k) => s + (k === j ? 0 : p.monto), 0));
    if (resto <= 0) { Pantalla.aviso("Ese monto no deja nada para la otra parte"); this.partes[i].monto = redondear(this.partes[i].monto - (0.01 - resto)); }
    this.partes[j].monto = Math.max(0.01, redondear(g.monto - this.partes.reduce((s, p, k) => s + (k === j ? 0 : p.monto), 0)));
    this.mostrarPartes();
  },

  elegir(partes) {
    const g = this._g;
    Almacen.guardarPlaneado({ id: g.id, elegido: partes.map(p => ({ fecha: p.fecha, monto: redondear(p.monto) })) });
    this.partes = null;
    this.alCambiar(partes.length > 1 ? "Guardado: comprar en partes" : `Guardado: ${this.textoDia(partes[0].fecha)}`);
    this.mostrarCuando();
  },

  async deshacer() {
    if (!(await preguntar("¿Quitar la fecha elegida?\nEl gasto vuelve a quedar sin fecha.", "Sí, quitar"))) return;
    Almacen.guardarPlaneado({ id: this.actual, elegido: null });
    this.alCambiar("Fecha quitada");
    this.mostrarCuando();
  },

  iniciar() {
    $("abrir-planeados").addEventListener("click", () => this.abrirLista());
    $("volver-planeados").addEventListener("click", () => {
      $("pantalla-planeados").hidden = true;
      $("pantalla-inicio").hidden = false;
      window.scrollTo(0, 0);
    });
    $("pl-agregar").addEventListener("click", () => this.abrirFormulario());
    $("pl-lista").addEventListener("click", e => {
      const c = e.target.closest("[data-pl-cuando]"); if (c) this.abrirCuando(c.dataset.plCuando);
      const k = e.target.closest("[data-pl-compre]"); if (k) this.comprar(k.dataset.plCompre);
      const ed = e.target.closest("[data-pl-editar]"); if (ed) this.abrirFormulario(Almacen.leerPlaneados().find(x => x.id === ed.dataset.plEditar));
      const b = e.target.closest("[data-pl-borrar]"); if (b) this.borrar(b.dataset.plBorrar);
    });
    $("volver-cuando").addEventListener("click", () => this.cerrarCuando());
    $("pantalla-cuando").addEventListener("click", e => {
      const esc = e.target.closest("[data-pc-escenario]");
      if (esc) { Almacen.guardarFuturo({ escenario: esc.dataset.pcEscenario }); this.mostrarCuando(); }
      const vis = e.target.closest("[data-pc-vista]");
      if (vis) { Almacen.guardarFuturo({ vista: vis.dataset.pcVista }); this.mostrarCuando(); }
      const d = e.target.closest("[data-pc-dia]");
      if (d) { this.dia = d.dataset.pcDia; this.mostrarCuando(); $("pc-impacto").scrollIntoView({ block: "nearest" }); }
      const el = e.target.closest("[data-pc-elegir]"); if (el) this.elegir([{ fecha: el.dataset.pcElegir, monto: this._g.monto }]);
      if (e.target.closest("#pc-elegir-dia")) this.elegir([{ fecha: this.dia, monto: this._g.monto }]);
      if (e.target.closest("#pc-dividir") || e.target.closest("#pc-sugerir")) { this.partes = this.sugerirPartes(this._m, this._g); this.mostrarPartes(); }
      if (e.target.closest("#pc-elegir-partes")) this.elegir(this.partes);
      if (e.target.closest("#pc-deshacer")) this.deshacer();
      if (e.target.closest("#pc-compre")) this.comprar(this.actual);
    });
    $("pc-partes").addEventListener("change", e => {
      const f = e.target.closest("[data-pc-parte-fecha]");
      if (f && f.value) { this.partes[Number(f.dataset.pcParteFecha)].fecha = f.value; this.mostrarPartes(); }
      const mo = e.target.closest("[data-pc-parte-monto]");
      if (mo) this.cambiarMontoParte(Number(mo.dataset.pcParteMonto), mo.value);
    });
    $("pc-sem-anterior").addEventListener("click", () => { this.semana = Math.max(0, (this.semana || 0) - 1); this.mostrarCuando(); });
    $("pc-sem-siguiente").addEventListener("click", () => { this.semana = Math.min(4, (this.semana || 0) + 1); this.mostrarCuando(); });
    $("form-campos").addEventListener("change", e => {
      if (e.target.id === "f-en-partes") $("campo-partes").hidden = !e.target.checked;
    });
    window.addEventListener("movimientos-cambiaron", () => { this.mostrarLista(); this.mostrarCuando(); });
    window.addEventListener("jornadas-cambiaron", () => this.mostrarCuando());
  }
};

// Formulario "Agregar gasto planeado"
Formularios.planeado = {
  titulo: "Agregar gasto planeado",
  campos: () => `
    <div class="campo">
      <label for="f-nombre">Nombre</label>
      <input id="f-nombre" type="text" maxlength="80" placeholder="Ej.: Arbolito de Navidad y decoraciones">
    </div>` + campoMonto() + `
    <div class="campo">
      <label for="f-fecha">Necesito tenerlo para</label>
      <input id="f-fecha" type="date" value="${hoy()}">
    </div>
    <div class="campo">
      <label for="f-categoria">Categoría</label>
      <select id="f-categoria">${[...CATEGORIAS, Planeados.CATEGORIA_FIESTAS].map(c => `<option>${c}</option>`).join("")}</select>
    </div>
    <div class="campo">
      <label for="f-tipo">Tipo</label>
      <select id="f-tipo"><option value="necesito">Lo necesito</option><option value="espera">Puede esperar</option></select>
    </div>
    <label class="mv-check"><input id="f-en-partes" type="checkbox"> Se puede comprar en partes</label>
    <div class="campo" id="campo-partes" hidden>
      <label for="f-partes">Cantidad de partes</label>
      <select id="f-partes"><option value="2">2</option><option value="3">3</option></select>
    </div>
    <div class="campo">
      <label for="f-nota">Nota <span class="opcional">(opcional)</span></label>
      <input id="f-nota" type="text" maxlength="120">
    </div>`,
  guardar(mostrarError) {
    const nombre = $("f-nombre").value.trim();
    const montoTxt = $("f-monto").value.trim();
    const monto = redondear(Number(montoTxt));
    const fechaLimite = $("f-fecha").value;
    if (!nombre) return mostrarError("Escribe el nombre.");
    if (montoTxt === "" || !(monto > 0)) return mostrarError("El monto debe ser mayor que 0.");
    if (!fechaLimite) return mostrarError("Elige para qué fecha lo necesitas.");
    const anterior = Planeados.editando ? Almacen.leerPlaneados().find(x => x.id === Planeados.editando) : null;
    const enPartes = $("f-en-partes").checked;
    const datos = {
      id: Planeados.editando || undefined, nombre, monto, fechaLimite,
      categoria: $("f-categoria").value, nota: $("f-nota").value.trim(), tipo: $("f-tipo").value,
      enPartes, partes: enPartes ? Number($("f-partes").value) : 1
    };
    // Si cambió el monto, la fecha elegida ya no corresponde
    if (anterior && anterior.elegido && Math.abs(anterior.monto - monto) > 0.005) datos.elegido = null;
    if (!Almacen.guardarPlaneado(datos)) return mostrarError("No se pudo guardar en este dispositivo.");
    Planeados.editando = null;
    cerrarFormulario();
    Planeados.alCambiar("Guardado");
  }
};

if (Datos.actual) Planeados.iniciar();
