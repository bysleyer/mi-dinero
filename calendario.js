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
    if (redibujar) this.mostrar();
  },

  moverMes(delta) {
    const f = new Date(this.año, this.mes + delta, 1);
    this.año = f.getFullYear();
    this.mes = f.getMonth();
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
    } else if (fecha < hoyClave) {
      clases.push("pendiente");
      estado = `<span class="dia-punto" aria-hidden="true">•</span>`;
    }
    if (fecha === hoyClave) clases.push("hoy");

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
    if (letras.length) marcas.push(`<span class="marca-vence">${letras.join(" ")}</span>`);
    const es15 = dia === this.diaDelMes("accionLegal", 15);
    if (es15) clases.push("dia-15");

    const descripcion = [
      Jornadas.textoDia(fecha),
      j ? (j.horas > 0 ? `${redondear(j.horas)} horas` : "No trabajé") : (fecha < hoyClave ? "sin registrar" : ""),
      f.getDay() === this.diaDeCobro() ? "día de cobro" : "",
      es15 ? this.PISTA_15 : "",
      ...(this._vencimientos[fecha] || []).map(v => `vence ${v.nombre}`)
    ].filter(Boolean).join(", ");

    return `
      <button class="${clases.join(" ")}" data-fecha="${fecha}" aria-label="${escapar(descripcion)}">
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
      const resumen = delaSemana.length
        ? `${redondear(horas)} h · ${dinero(Jornadas.netoDeHoras(horas))} <span class="cal-cobro">→ se cobra el ${Jornadas.textoDia(cobro).toLowerCase()} ($↑)</span>`
        : `<span class="cal-cobro">Sin días registrados · se cobra el ${Jornadas.textoDia(cobro).toLowerCase()}</span>`;
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
      <li class="total"><span>Neto estimado del mes</span><span>${dinero(mesTotales.neto)}</span></li>`;
  },

  // ---------- Tocar un día: el mismo formulario del Bloque 7 ----------
  tocarDia(fecha) {
    const j = Almacen.leerJornadas().find(x => x.fecha === fecha);
    if (j) {
      Jornadas.abrirFormulario(j);
    } else {
      Jornadas.abrirFormulario();
      $("f-fecha").value = fecha;
    }
    const extra = [];
    // Bloque 9: arriba del formulario, lo que vence ese día
    const vence = Vencimientos.delDia(fecha).filter(v => !v.alerta);
    if (vence.length) {
      const filas = vence.flatMap(v => v.partes).map(p =>
        `<li>${p.pagado ? "✓ " : ""}${escapar(p.nombre)}: <strong>${dinero(p.monto)}</strong>${p.pagado ? " (pagado)" : ""}</li>`).join("");
      $("form-campos").insertAdjacentHTML("afterbegin", `<div class="ayuda cal-vence"><strong>Vence este día:</strong><ul>${filas}</ul></div>`);
    }
    if (Jornadas.aFecha(fecha).getDate() === this.diaDelMes("accionLegal", 15)) {
      extra.push(`<p class="ayuda pista-15">⚠ Día 15: ${this.PISTA_15}.</p>`);
    }
    if (j) {
      extra.push(`<button type="button" id="cal-borrar" class="boton-chico boton-borrar">Borrar esta jornada</button>`);
    }
    if (extra.length) $("form-campos").insertAdjacentHTML("beforeend", extra.join(""));
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

  iniciar() {
    $("abrir-calendario").addEventListener("click", () => this.abrir());
    $("volver-calendario").addEventListener("click", () => this.cerrar());
    $("cal-anterior").addEventListener("click", () => this.moverMes(-1));
    $("cal-siguiente").addEventListener("click", () => this.moverMes(1));
    $("cal-hoy").addEventListener("click", () => this.irAHoy());
    $("cal-semanas").addEventListener("click", e => {
      const d = e.target.closest("[data-fecha]");
      if (d) this.tocarDia(d.dataset.fecha);
    });
    window.addEventListener("jornadas-cambiaron", () => this.mostrar());
  }
};

if (Datos.actual) Calendario.iniciar();
