/*
 * CALENDARIO DE DÍAS TRABAJADOS (Bloque 8)
 * Solo MUESTRA y EDITA las jornadas del Bloque 7, usando sus funciones
 * (Jornadas.abrirFormulario, Jornadas.borrar, Jornadas.netoDeHoras...).
 * No guarda nada propio.
 */
const Calendario = {
  año: null,
  _vencimientos: {},
  mes: null, // 0 = enero
  MESES: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
          "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  PISTA_15: "Si queda saldo de renta, la administradora inicia acción legal",

  // ---------- Fechas importantes (de mis datos) ----------
  diaDelMes(id, porDefecto) {
    const f = Datos.actual.fechasImportantes.find(x => x.id === id);
    return f ? f.diaDelMes : porDefecto;
  },

  diaDeCobro() {
    return Math.max(0, Jornadas.DIAS.indexOf(Jornadas.config().diaDeCobro));
  },

  // ---------- Armar el mes ----------
  // Semanas de lunes a domingo que tocan el mes elegido
  semanas() {
    const primero = new Date(this.año, this.mes, 1);
    const ultimo = new Date(this.año, this.mes + 1, 0);
    let lunes = Plan.claveSemana(primero);
    const fin = Resumen.aClave(ultimo);
    const lista = [];
    while (lunes <= fin) {
      lista.push(Array.from({ length: 7 }, (_, i) => Jornadas.sumarDias(lunes, i)));
      lunes = Jornadas.sumarDias(lunes, 7);
    }
    return lista;
  },

  jornadasPorFecha() {
    const mapa = {};
    Almacen.leerJornadas().forEach(j => { mapa[j.fecha] = j; });
    return mapa;
  },

  // ---------- Pantalla ----------
  abrir() {
    this.irAHoy(false);
    this.mostrarLibres();
    $("pantalla-inicio").hidden = true;
    $("pantalla-calendario").hidden = false;
    window.scrollTo(0, 0);
    this.mostrar();
  },

  cerrar() {
    $("pantalla-calendario").hidden = true;
    $("pantalla-inicio").hidden = false;
    window.scrollTo(0, 0);
  },

  irAHoy(redibujar = true) {
    const h = new Date();
    this.año = h.getFullYear();
    this.mes = h.getMonth();
    this.seleccion = null;
    if (redibujar) this.mostrar();
  },

  moverMes(delta) {
    const f = new Date(this.año, this.mes + delta, 1);
    this.año = f.getFullYear();
    this.mes = f.getMonth();
    this.seleccion = null;
    this.mostrar();
  },

  celda(fecha, jornadas, hoyClave) {
    const f = Jornadas.aFecha(fecha);
    const dia = f.getDate();
    const j = jornadas[fecha];
    const clases = ["dia"];
    let estado = "";
    if (f.getMonth() !== this.mes) clases.push("otro-mes");
    if (j && j.horas > 0) {
      clases.push("trabajado");
      estado = `<span class="dia-horas">✓ ${redondear(j.horas)} h</span>`;
    } else if (j) {
      clases.push("no-trabajo");
      estado = `<span class="dia-horas">✕ no</span>`;
    } else if (Proyeccion.esLibre(fecha)) {
      clases.push("libre");
      estado = `<span class="dia-horas">◇ libre</span>`;
    } else if (fecha < hoyClave) {
      clases.push("pendiente");
      estado = `<span class="dia-punto" aria-hidden="true">•</span>`;
    }
    if (fecha === hoyClave) clases.push("hoy");
    if (fecha === this.seleccion) clases.push("sel");

    // Marcas de fechas importantes
    const marcas = [];
    if (f.getDay() === this.diaDeCobro()) {
      marcas.push(`<span class="marca-cobro" title="Día de cobro (cheque de la semana de arriba)">$↑</span>`);
    }
    const esRenta = dia === this.diaDelMes("venceRenta", 1);
    if (esRenta) marcas.push(`<span class="marca-renta">Renta</span>`);
    // Bloque 9: iniciales de lo que vence ese día (R, L, I, T). En el día 1 ya dice "Renta".
    const letras = [...new Set((this._vencimientos[fecha] || []).map(v => v.letra).filter(Boolean))]
      .filter(l => !(esRenta && l === "R"));
    // Bloque 12: lo movido a este día lleva "↻"
    const movido = (this._vencimientos[fecha] || []).some(v => v.movido);
    if (letras.length) marcas.push(`<span class="marca-vence${movido ? " movido" : ""}">${letras.join(" ")}${movido ? "↻" : ""}</span>`);
    const es15 = dia === this.diaDelMes("accionLegal", 15);
    if (es15) clases.push("dia-15");

    const descripcion = [
      Jornadas.textoDia(fecha),
      j ? (j.horas > 0 ? `${redondear(j.horas)} horas` : "No trabajé") : Proyeccion.esLibre(fecha) ? "día libre planeado" : (fecha < hoyClave ? "sin registrar" : ""),
      f.getDay() === this.diaDeCobro() ? "día de cobro" : "",
      es15 ? this.PISTA_15 : "",
      ...(this._vencimientos[fecha] || []).map(v => `vence ${v.nombre}${v.movido ? " (movido)" : ""}`)
    ].filter(Boolean).join(", ");

    return `
      <button class="${clases.join(" ")}" data-fecha="${fecha}" aria-label="${escapar(descripcion)}" aria-pressed="${fecha === this.seleccion}">
        <span class="dia-num">${dia}${es15 ? "<small>!</small>" : ""}</span>
        ${marcas.join("")}
        ${estado}
      </button>`;
  },

  mostrar() {
    if ($("pantalla-calendario").hidden) return;
    const hoyClave = hoy();
    const jornadas = this.jornadasPorFecha();
    $("cal-titulo").textContent = `${this.MESES[this.mes]} ${this.año}`;

    const prefijoMes = `${this.año}-${String(this.mes + 1).padStart(2, "0")}`;
    // Vencimientos del Bloque 9 para las fechas visibles
    const semanas = this.semanas();
    this._vencimientos = {};
    Vencimientos.entre(semanas[0][0], semanas[semanas.length - 1][6]).forEach(v => {
      (this._vencimientos[v.fecha] = this._vencimientos[v.fecha] || []).push(v);
    });
    const mesTotales = { trabajados: 0, noTrabajados: 0, horas: 0, neto: 0 };

    $("cal-semanas").innerHTML = semanas.map(semana => {
      const delaSemana = semana.map(f => jornadas[f]).filter(Boolean);
      const horas = delaSemana.reduce((s, j) => s + j.horas, 0);
      // Neto del mes: por semana (las horas extra se cuentan por semana), solo días del mes
      const horasDelMes = delaSemana.filter(j => j.fecha.startsWith(prefijoMes)).reduce((s, j) => s + j.horas, 0);
      delaSemana.filter(j => j.fecha.startsWith(prefijoMes)).forEach(j => {
        if (j.horas > 0) mesTotales.trabajados++; else mesTotales.noTrabajados++;
      });
      mesTotales.horas += horasDelMes;
      mesTotales.neto += Jornadas.netoDeHoras(horasDelMes);

      // El cheque de esta semana se cobra el día de cobro de la semana siguiente
      const cobro = Jornadas.sumarDias(semana[0], 7 + ((this.diaDeCobro() + 6) % 7));
      const proy = Proyeccion.horasSemana(semana[0]);
      const libres = proy.diasLibres ? ` · ${proy.diasLibres} ${proy.diasLibres === 1 ? "día libre" : "días libres"}` : "";
      const proyectado = proy.diasFaltan || proy.diasLibres
        ? ` <span class="cal-cobro">· cheque proyectado ${redondear(proy.horas)} h · ${dinero(Jornadas.netoDeHoras(proy.horas))}${libres}</span>` : "";
      const resumen = delaSemana.length
        ? `${redondear(horas)} h · ${dinero(Jornadas.netoDeHoras(horas))}${proyectado} <span class="cal-cobro">→ se cobra el ${Jornadas.textoDia(cobro).toLowerCase()} ($↑)</span>`
        : `<span class="cal-cobro">Sin días registrados${proyectado} · se cobra el ${Jornadas.textoDia(cobro).toLowerCase()}</span>`;
      return `
        <div class="cal-semana">
          <div class="cal-dias">${semana.map(f => this.celda(f, jornadas, hoyClave)).join("")}</div>
          <p class="cal-resumen" data-semana="${semana[0]}">${resumen}</p>
        </div>`;
    }).join("");

    $("cal-mes").innerHTML = `
      <li><span>Días trabajados</span><span>${mesTotales.trabajados}</span></li>
      <li><span>Días no trabajados</span><span>${mesTotales.noTrabajados}</span></li>
      <li><span>Horas totales</span><span>${redondear(mesTotales.horas)} h</span></li>
      <li class="total"><span>Pago estimado por tus horas del mes</span><span>${dinero(mesTotales.neto)}</span></li>`;
  },

  // ---------- Tocar un día: su detalle en una hoja (2.2) ----------
  // Muestra lo de ese día (jornada, lo que entra y vence, lo registrado y el saldo al final) y trae "Anotar jornada",
  // que abre el formulario de siempre (tocarDia). Solo lee: el saldo sale de la misma cuenta de Libre (proyeccion.js).
  seleccion: null,

  verDia(fecha) {
    this.seleccion = fecha;
    document.querySelectorAll("#cal-semanas button.dia").forEach(b => { const on = b.dataset.fecha === fecha; b.classList.toggle("sel", on); b.setAttribute("aria-pressed", String(on)); });
    // La hoja tapa la parte de abajo: el día tocado se sube para que quede a la vista arriba de ella
    const c = document.querySelector(`#cal-semanas button.dia[data-fecha="${fecha}"]`);
    if (c) { const y = c.getBoundingClientRect().top; if (y > 150 || y < 60) window.scrollTo({ top: Math.max(0, window.scrollY + y - 110), behavior: "instant" }); }
    Nav.abrirHoja("dia");
    this.dibujarDia();
  },

  dibujarDia() {
    const f = this.seleccion;
    if (!f) return;
    const hoyC = hoy(), d = Jornadas.aFecha(f), dia = d.getDate();
    $("hoja-titulo-barra").textContent = Jornadas.textoDia(f);
    const dif = Math.round((d - Jornadas.aFecha(hoyC)) / 86400000);
    const cuando = dif === 0 ? "Hoy" : dif === 1 ? "Mañana" : dif === -1 ? "Ayer" : dif > 0 ? `Dentro de ${dif} días` : `Hace ${-dif} días`;
    const j = Almacen.leerJornadas().find(x => x.fecha === f);
    const libre = !j && Proyeccion.esLibre(f) ? this.libreDe(f) : null;
    const es15 = dia === this.diaDelMes("accionLegal", 15);
    const pastillas = [
      d.getDay() === this.diaDeCobro() ? `<span class="cd-pill">cobro</span>` : "",
      es15 ? `<span class="cd-pill r">día 15</span>` : "",
      libre ? `<span class="cd-pill a">día libre</span>` : ""
    ].join("");

    const jornada = j ? (j.horas > 0 ? `✓ Trabajé ${redondear(j.horas)} h` : "✕ No trabajé")
      : libre ? `◇ Día libre planeado (${escapar(libre.motivo)})`
      : f < hoyC ? `<span class="cd-neg">• Falta anotar</span>` : f === hoyC ? "Sin registrar todavía" : "Todavía no";

    // Lo que entra y el saldo: la cuenta de Libre (hoy y los próximos 3 meses)
    let entra = [], saldo = null, fuera = false;
    if (f >= hoyC) {
      const pr = Proyeccion.calcular({ horizonte: Plan.DIAS_ADELANTE });
      const x = pr.porDia[f];
      if (x) { entra = x.lineas.filter(l => l.monto > 0 && l.tipo !== "simulado"); saldo = x.saldoFin; } else fuera = true;
    }
    const vence = Vencimientos.delDia(f).filter(v => !v.alerta).flatMap(v => v.partes);
    const movs = Almacen.leerMovimientos().filter(m => m.fecha === f).sort((a, b) => (a.creado || "").localeCompare(b.creado || ""));

    const fila = (txt, monto, clase = "") => `<div class="cd-f"><span>${txt}</span><b class="${clase}">${monto}</b></div>`;
    const lineaMov = m => {
      const esIngreso = m.tipo === "ingreso", esAjuste = m.tipo === "ajuste";
      const titulo = m.tipo === "gasto" ? `${m.categoria}${m.nota ? ` · ${m.nota}` : ""}` : esIngreso ? (esCheque(m) ? "Cheque" : `Otro ingreso${m.nota ? ` · ${m.nota}` : ""}`)
        : `${NOMBRES_TIPO[m.tipo] || "Movimiento"}${m.nota ? ` · ${m.nota}` : ""}`;
      return fila(escapar(titulo), esAjuste ? `Saldo: ${dinero(m.monto)}` : `${esIngreso ? "+" : "−"}${dinero(m.monto)}`, esAjuste ? "" : esIngreso ? "cd-pos" : "cd-neg");
    };
    const seccion = (titulo, cuerpo) => cuerpo ? `<h4 class="cd-h">${titulo}</h4>${cuerpo}` : "";
    const atr = es15 ? Proyeccion.rentaAtrasada() : 0;

    $("cd-cuerpo").innerHTML = `
      <p class="cd-sub">${cuando}${pastillas}</p>
      ${es15 ? `<div class="pista-15" role="note"><strong>${f === hoyC ? "Hoy" : "Este día"} es el límite de la renta atrasada:</strong> ${escapar(this.PISTA_15.charAt(0).toLowerCase() + this.PISTA_15.slice(1))}.${atr > 0.005 ? ` <b>Debes ${dineroCorto(atr)}.</b>` : ""}</div>` : ""}
      ${seccion("Jornada", `<div class="cd-f"><span>${jornada}</span></div>`)}
      ${seccion("Entra", entra.map(l => fila(escapar(l.nombre), `+${dinero(l.monto)}`, "cd-pos")).join(""))}
      ${seccion("Vence este día", vence.map(p => fila(`${p.pagado ? "✓ " : ""}${escapar(p.nombre)}${p.pagado ? " (pagado)" : ""}`, dinero(p.monto))).join(""))}
      ${seccion("Registrado este día", movs.map(lineaMov).join(""))}
      ${saldo !== null ? `<div class="cd-tot"><span>Saldo al final del día</span><span class="${saldo < -0.005 ? "cd-neg" : "cd-pos"}">${dinero(saldo)}</span></div>
        <p class="cd-nota">${saldo < -0.005 ? `Ese día te faltan ${dineroCorto(-saldo)}. ` : ""}Según tu cuenta de los próximos 3 meses; es un estimado.</p>`
        : `<p class="cd-nota">${fuera ? "Ese día queda fuera de los próximos 3 meses, que es lo que calcula la cuenta." : "El saldo de los días que ya pasaron no se guarda."}</p>`}
      <button type="button" class="cd-bt${!j && f <= hoyC ? " lleno" : ""}" data-cd-anotar="${f}">${j ? "Editar jornada" : "Anotar jornada"}</button>`;
  },

  // ---------- Abrir el formulario de la jornada de un día (el mismo del Bloque 7) ----------
  tocarDia(fecha) {
    const j = Almacen.leerJornadas().find(x => x.fecha === fecha);
    if (j) {
      Jornadas.abrirFormulario(j);
    } else {
      Jornadas.abrirFormulario();
      $("f-fecha").value = fecha;
    }
    // El título dice el día que tocaste ("Trabajé hoy" solo si es hoy)
    if (!j && fecha !== hoy()) {
      const t = Jornadas.aFecha(fecha).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" }).replace(",", "");
      $("form-titulo").textContent = t.charAt(0).toUpperCase() + t.slice(1);
    }
    const extra = [];
    // Bloque 9: arriba del formulario, lo que vence ese día
    const vence = Vencimientos.delDia(fecha).filter(v => !v.alerta);
    if (vence.length) {
      const filas = vence.flatMap(v => v.partes).map(p =>
        `<li>${p.pagado ? "✓ " : ""}${escapar(p.nombre)}: <strong>${dinero(p.monto)}</strong>${p.pagado ? " (pagado)" : ""}</li>`).join("");
      $("form-campos").insertAdjacentHTML("afterbegin", `<div class="ayuda cal-vence"><strong>Vence este día:</strong><ul>${filas}</ul></div>`);
    }
    // Día 15: el aviso legal va arriba, en su recuadro, con lo que se debe (no entre los campos)
    if (Jornadas.aFecha(fecha).getDate() === this.diaDelMes("accionLegal", 15)) {
      const atr = Proyeccion.rentaAtrasada();
      $("form-campos").insertAdjacentHTML("afterbegin", `<div class="pista-15" role="note"><strong>${fecha === hoy() ? "Hoy" : "Este día"} es el límite de la renta atrasada:</strong>
        ${this.PISTA_15.charAt(0).toLowerCase() + this.PISTA_15.slice(1)}.${atr > 0.005 ? ` <b>Debes ${dineroCorto(atr)}.</b>` : ""}</div>`);
    }
    if (j) {
      extra.push(`<button type="button" id="cal-borrar" class="boton-chico boton-borrar">Borrar esta jornada</button>`);
    }
    if (!j && Proyeccion.esLibre(fecha)) {
      const libre = this.libreDe(fecha);
      $("form-campos").insertAdjacentHTML("afterbegin", `<p class="ayuda cal-libre-aviso">◇ Día libre planeado (${escapar(libre.motivo)}).</p>`);
      if (fecha <= hoy()) extra.push(`<button type="button" id="cal-convertir" class="boton-chico boton-borrar">Convertir en falta real (No trabajé)</button>`);
    }
    if (extra.length) $("form-campos").insertAdjacentHTML("beforeend", extra.join(""));
    const convertir = $("cal-convertir");
    if (convertir) {
      convertir.addEventListener("click", async () => {
        if (await Jornadas.guardarJornada(fecha, 0)) { Jornadas.editando = null; cerrarFormulario(); }
      });
    }
    const borrar = $("cal-borrar");
    if (borrar) {
      borrar.addEventListener("click", async () => {
        await Jornadas.borrar(j.id);
        if (!Almacen.leerJornadas().some(x => x.id === j.id)) {
          Jornadas.editando = null;
          cerrarFormulario();
        }
      });
    }
  },

  // ---------- Días que no voy a trabajar (Bloque 13) ----------
  MOTIVOS: ["Feriado", "Enfermedad", "Vacaciones", "Otro"],

  libreDe(fecha) {
    return Almacen.leerDiasLibres().find(d => fecha >= d.desde && fecha <= (d.hasta || d.desde));
  },

  textoRango(d) {
    const corto = f => Jornadas.aFecha(f).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" }).replace(/[.,]/g, "");
    return d.hasta && d.hasta !== d.desde ? `del ${corto(d.desde)} al ${corto(d.hasta)}` : corto(d.desde);
  },

  mostrarLibres() {
    const lista = Almacen.leerDiasLibres().slice().sort((a, b) => a.desde.localeCompare(b.desde));
    const hoyClave = hoy();
    $("cal-libres").innerHTML = lista.length === 0
      ? `<li class="vacio">No tienes días libres planeados.</li>`
      : lista.map(d => {
          // Días de este rango que ya llegaron y no tienen jornada: se pueden convertir en falta real
          const pendientes = [];
          for (let f = d.desde; f <= (d.hasta || d.desde) && f <= hoyClave; f = Jornadas.sumarDias(f, 1)) {
            if (!Almacen.leerJornadas().some(j => j.fecha === f)) pendientes.push(f);
          }
          return `
            <li>
              <div class="mov-info">
                <div class="mov-tipo">◇ ${escapar(this.textoRango(d))}</div>
                <div class="mov-detalle">${escapar(d.motivo)}</div>
                ${pendientes.length ? `<button class="enlace" data-convertir-libre="${d.id}">Convertir en falta real (${pendientes.length} ${pendientes.length === 1 ? "día" : "días"})</button>` : ""}
              </div>
              <button class="boton-chico" data-editar-libre="${d.id}">Editar</button>
              <button class="borrar" data-borrar-libre="${d.id}" aria-label="Borrar">✕</button>
            </li>`;
        }).join("");
  },

  abrirLibre(dia = null) {
    this.editandoLibre = dia ? dia.id : null;
    abrirFormulario("diaLibre");
    if (dia) {
      $("form-titulo").textContent = "Editar día libre";
      $("f-fecha").value = dia.desde;
      $("f-hasta").value = dia.hasta && dia.hasta !== dia.desde ? dia.hasta : "";
      $("f-motivo").value = dia.motivo;
    }
  },

  async borrarLibre(id) {
    const d = Almacen.leerDiasLibres().find(x => x.id === id);
    if (!d || !(await preguntar(`¿Borrar el día libre ${this.textoRango(d)}?`, "Sí, borrar"))) return;
    Almacen.borrarDiaLibre(id);
    this.alCambiarLibres("Borrado");
  },

  // Convierte en falta real (jornada de 0 horas, Bloque 7) los días del rango que ya llegaron
  async convertirLibre(id) {
    const d = Almacen.leerDiasLibres().find(x => x.id === id);
    if (!d) return;
    const hoyClave = hoy();
    for (let f = d.desde; f <= (d.hasta || d.desde) && f <= hoyClave; f = Jornadas.sumarDias(f, 1)) {
      if (!Almacen.leerJornadas().some(j => j.fecha === f)) await Jornadas.guardarJornada(f, 0);
    }
    this.mostrarLibres();
  },

  alCambiarLibres(aviso) {
    this.mostrar();
    this.mostrarLibres();
    Jornadas.mostrar();
    if (aviso) Pantalla.aviso(aviso);
    window.dispatchEvent(new Event("jornadas-cambiaron"));
    window.dispatchEvent(new Event("movimientos-cambiaron"));
  },

  iniciar() {
    $("abrir-libres").addEventListener("click", () => this.abrirLibre());
    $("cal-libres").addEventListener("click", e => {
      const ed = e.target.closest("[data-editar-libre]");
      if (ed) this.abrirLibre(Almacen.leerDiasLibres().find(x => x.id === ed.dataset.editarLibre));
      const bo = e.target.closest("[data-borrar-libre]");
      if (bo) this.borrarLibre(bo.dataset.borrarLibre);
      const co = e.target.closest("[data-convertir-libre]");
      if (co) this.convertirLibre(co.dataset.convertirLibre);
    });
    $("volver-calendario").addEventListener("click", () => this.cerrar());
    $("cal-anterior").addEventListener("click", () => this.moverMes(-1));
    $("cal-siguiente").addEventListener("click", () => this.moverMes(1));
    $("cal-hoy").addEventListener("click", () => this.irAHoy());
    $("cal-semanas").addEventListener("click", e => {
      const d = e.target.closest("[data-fecha]");
      if (d) this.verDia(d.dataset.fecha);
    });
    $("cd-cuerpo").addEventListener("click", e => {
      const b = e.target.closest("[data-cd-anotar]");
      if (!b) return;
      Nav.cerrarHoja();
      this.tocarDia(b.dataset.cdAnotar);
    });
    const alCambiarDatos = () => { if (!$("hoja").hidden && !$("hoja-dia").hidden) this.dibujarDia(); };
    window.addEventListener("jornadas-cambiaron", () => { this.mostrar(); if (!$("pantalla-calendario").hidden) this.mostrarLibres(); alCambiarDatos(); });
    window.addEventListener("movimientos-cambiaron", alCambiarDatos);
  }
};

// Formulario "Días que no voy a trabajar"
Formularios.diaLibre = {
  titulo: "Días que no voy a trabajar",
  campos: () => `
    <div class="campo">
      <label for="f-fecha">Fecha de inicio</label>
      <input id="f-fecha" type="date" value="${hoy()}">
    </div>
    <div class="campo">
      <label for="f-hasta">Fecha de fin <span class="opcional">(opcional, para varios días)</span></label>
      <input id="f-hasta" type="date">
    </div>
    <div class="campo">
      <label for="f-motivo">Motivo</label>
      <select id="f-motivo">${Calendario.MOTIVOS.map(m => `<option>${m}</option>`).join("")}</select>
    </div>`,
  guardar(mostrarError) {
    const desde = $("f-fecha").value;
    const hasta = $("f-hasta").value || desde;
    if (!desde) return mostrarError("Elige la fecha de inicio.");
    if (hasta < desde) return mostrarError("La fecha de fin no puede ser antes de la de inicio.");
    const ok = Almacen.guardarDiaLibre({ id: Calendario.editandoLibre || undefined, desde, hasta, motivo: $("f-motivo").value });
    if (!ok) return mostrarError("No se pudo guardar en este dispositivo.");
    Calendario.editandoLibre = null;
    cerrarFormulario();
    Calendario.alCambiarLibres("Guardado");
  }
};

if (Datos.actual) Calendario.iniciar();
