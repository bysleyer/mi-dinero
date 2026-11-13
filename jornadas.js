/*
 * JORNADAS Y PRÓXIMO CHEQUE (Bloque 7)
 * - "Trabajé hoy" / "No trabajé hoy": registran días trabajados (jornadas).
 *   Las jornadas NO son dinero: no tocan saldos, sobres ni deudas.
 * - Tarjeta "Próximo cheque": cuánto llega según los días registrados.
 * Usa Datos (app.js), Plan (plan.js) y Almacen (almacen.js).
 */
const Jornadas = {
  editando: null, // id de la jornada que se está editando

  DIAS: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],

  // Si mis datos no traen "periodoDePago", se calcula de "ingresos" (no hay cifras escritas en el código)
  defecto() {
    const ing = Datos.actual.ingresos;
    const t = Datos.actual.gastosFijos.find(g => g.id === "transporte") || {};
    const dias = t.diasPorSemana || 5;
    return {
      diaDeCobro: ing.diaDeCobro || "viernes",
      pagoPorHora: ing.pagoPorHora,
      horasNormales: ing.horasPorSemana,
      pagoHoraExtra: ing.pagoPorHora * 1.5,
      proporcionNeto: ing.netoSemanal.monto / ing.brutoSemanal,
      diasDeTrabajoPorSemana: dias,
      horasPorDia: ing.horasPorSemana / dias,
      diasDeTrabajo: this.DIAS.slice(1, 1 + dias) // de lunes en adelante
    };
  },

  config() {
    return { ...this.defecto(), ...(Datos.actual.periodoDePago || {}) };
  },

  // ---------- Cálculos de pago ----------
  // Horas extra solo sobre horas TRABAJADAS (total − enfermedad) que pasan de horasNormales.
  // Las horas de enfermedad se pagan como regulares.
  bruto(horas, enfermedad = 0) {
    const c = this.config();
    const trabajadas = Math.max(0, horas - enfermedad);
    const regulares = Math.min(trabajadas, c.horasNormales) + enfermedad;
    const extra = Math.max(0, trabajadas - c.horasNormales);
    return regulares * c.pagoPorHora + extra * c.pagoHoraExtra;
  },

  // Proporción neto/bruto: promedio de los últimos 4 cheques reales (mis datos, ingresos.cheques).
  // Si hay menos de 2, usa la proporción de mis datos.
  proporcionNeto() {
    const hist = (Datos.actual?.ingresos?.cheques || [])
      .filter(c => c.bruto > 0 && c.neto > 0)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 4);
    if (hist.length >= 2) return hist.reduce((s, c) => s + c.neto / c.bruto, 0) / hist.length;
    return this.config().proporcionNeto;
  },

  netoDeHoras(horas, enfermedad = 0) {
    return this.bruto(horas, enfermedad) * this.proporcionNeto();
  },

  // ---------- Fechas ----------
  aFecha(clave) {
    const [a, m, d] = clave.split("-").map(Number);
    return new Date(a, m - 1, d);
  },

  sumarDias(clave, dias) {
    const f = this.aFecha(clave);
    f.setDate(f.getDate() + dias);
    const d2 = n => String(n).padStart(2, "0");
    return `${f.getFullYear()}-${d2(f.getMonth() + 1)}-${d2(f.getDate())}`;
  },

  // Próximo día de cobro (hoy cuenta si hoy es día de cobro) y los días que cubre:
  // de lunes a domingo de la semana anterior a la del cobro.
  periodoProximoCheque(hoyClave = hoy()) {
    const diaCobro = Math.max(0, this.DIAS.indexOf(this.config().diaDeCobro));
    const h = this.aFecha(hoyClave);
    const faltan = (diaCobro - h.getDay() + 7) % 7;
    const cobro = this.sumarDias(hoyClave, faltan);
    const inicio = this.sumarDias(Plan.claveSemana(this.aFecha(cobro)), -7);
    return { cobro, inicio, fin: this.sumarDias(inicio, 6) };
  },

  // Próximo cheque con el cálculo único (proyeccion.js): jornadas registradas,
  // y para los días sin registrar, días de trabajo que no son libres × horas por día.
  prediccion(hoyClave = hoy()) {
    const periodo = this.periodoProximoCheque(hoyClave);
    const s = Proyeccion.horasSemana(periodo.inicio);
    return {
      ...periodo,
      hayJornadas: s.diasRegistrados > 0,
      dias: s.diasRegistrados,
      diasTrabajados: s.diasTrabajados,
      horas: s.horasRegistradas,
      bruto: this.bruto(s.horasRegistradas),
      neto: this.netoDeHoras(s.horasRegistradas),
      diasFaltan: s.diasFaltan,
      diasLibres: s.diasLibres,
      horasProyectadas: s.horas,
      netoProyectado: this.netoDeHoras(s.horas)
    };
  },

  // Para el Plan de la semana: horas proyectadas del próximo cheque (siempre, con días libres)
  horasParaPlan() {
    if (!Datos.actual) return null;
    const p = this.prediccion();
    return { horas: p.horasProyectadas, periodo: p.inicio, registrados: p.hayJornadas, libres: p.diasLibres };
  },

  // ---------- Textos ----------
  textoDia(clave, conAño) {
    const t = this.aFecha(clave).toLocaleDateString("es", {
      weekday: "long", day: "numeric", month: "long", ...(conAño ? { year: "numeric" } : {})
    });
    const limpio = t.replace(",", ""); // "lunes, 2 de..." → "lunes 2 de..."
    return limpio.charAt(0).toUpperCase() + limpio.slice(1);
  },

  textoHoras(h) {
    return `${redondear(h)} ${h === 1 ? "hora" : "horas"}`;
  },

  // ---------- Guardar ----------
  // Guarda una jornada. Si ya hay otra en esa fecha, pregunta si se reemplaza.
  // Devuelve (promesa) true si se guardó.
  async guardarJornada(fecha, horas, idEditando = null) {
    const existente = Almacen.leerJornadas().find(j => j.fecha === fecha && j.id !== idEditando);
    if (existente) {
      const ok = await preguntar(
        `Ya registraste el ${fechaCorta(fecha)} con ${existente.horas === 0 ? "0 horas (no trabajé)" : this.textoHoras(existente.horas)}.\n` +
        "¿Quieres reemplazarla?", "Sí, reemplazar"
      );
      if (!ok) return false;
      Almacen.borrarJornada(existente.id);
    }
    const ok = idEditando
      ? Almacen.actualizarJornada(idEditando, { fecha, horas })
      : Almacen.agregarJornada({ fecha, horas });
    if (!ok) return false;
    this.alCambiar();
    Pantalla.aviso("Guardado");
    return true;
  },

  noTrabajeHoy() {
    this.guardarJornada(hoy(), 0);
  },

  abrirFormulario(jornada = null) {
    this.editando = jornada ? jornada.id : null;
    abrirFormulario("jornada", jornada
      ? { fecha: jornada.fecha, horas: jornada.horas }
      : { horas: this.config().horasPorDia });
    if (jornada) $("form-titulo").textContent = "Editar jornada";
  },

  async borrar(id) {
    const j = Almacen.leerJornadas().find(x => x.id === id);
    if (!j) return;
    if (!(await preguntar(`¿Borrar la jornada del ${fechaCorta(j.fecha)} (${this.textoHoras(j.horas)})?`, "Sí, borrar"))) return;
    Almacen.borrarJornada(id);
    this.alCambiar();
    Pantalla.aviso("Borrado");
  },

  alCambiar() {
    this.mostrar();
    window.dispatchEvent(new Event("jornadas-cambiaron"));
  },

  // ---------- Pantalla principal ----------
  mostrar() {
    this.mostrarCheque();
    this.mostrarLista();
  },

  mostrarCheque() {
    const p = this.prediccion();
    let html = `
      <p class="cheque-fecha">${this.textoDia(p.cobro)}</p>
      <p class="cheque-cubre">Cubre del ${this.textoDia(p.inicio).toLowerCase()} al ${this.textoDia(p.fin).toLowerCase()}</p>`;
    if (!p.hayJornadas) {
      html += `<p class="vacio">Registra tus días trabajados para ver cuánto te llega</p>`;
    } else {
      html += `
        <ul class="resumen">
          <li><span>Horas registradas</span><span>${this.textoHoras(p.horas)} (${p.diasTrabajados} ${p.diasTrabajados === 1 ? "día" : "días"})</span></li>
          <li><span>Bruto</span><span>${dinero(p.bruto)}</span></li>
          <li class="total"><span>Neto estimado</span><span>${dinero(p.neto)}</span></li>
        </ul>`;
      if (p.diasFaltan > 0) {
        const c = this.config();
        html += `
          <div class="cheque-proyeccion">
            Si trabajas los días que faltan (${p.diasFaltan} ${p.diasFaltan === 1 ? "día" : "días"} × ${c.horasPorDia} h):
            ${this.textoHoras(p.horasProyectadas)} → <strong>${dinero(p.netoProyectado)}</strong>
          </div>`;
      }
    }
    $("cheque").innerHTML = html;
  },

  mostrarLista() {
    const ultimas = Almacen.leerJornadas()
      .slice()
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 14);
    $("jornadas-lista").innerHTML = ultimas.length === 0
      ? `<p class="vacio">Todavía no hay jornadas.</p>`
      : ultimas.map(j => `
          <li>
            <div class="mov-info">
              <div class="mov-tipo">${this.textoDia(j.fecha)}</div>
              <div class="mov-detalle">${j.horas === 0 ? "No trabajé" : this.textoHoras(j.horas)}</div>
            </div>
            <button class="boton-chico" data-editar-jornada="${j.id}">Editar</button>
            <button class="borrar" data-borrar-jornada="${j.id}" aria-label="Borrar">✕</button>
          </li>`).join("");
  },

  iniciar() {
    $("trabaje-hoy").addEventListener("click", () => this.abrirFormulario());
    $("no-trabaje-hoy").addEventListener("click", () => this.noTrabajeHoy());
    $("jornadas-lista").addEventListener("click", e => {
      const editar = e.target.closest("[data-editar-jornada]");
      if (editar) {
        const j = Almacen.leerJornadas().find(x => x.id === editar.dataset.editarJornada);
        if (j) this.abrirFormulario(j);
      }
      const borrar = e.target.closest("[data-borrar-jornada]");
      if (borrar) this.borrar(borrar.dataset.borrarJornada);
    });
    this.mostrar();
  }
};

// Formulario "Trabajé hoy" (usa la misma ventana que los demás formularios)
Formularios.jornada = {
  titulo: "Trabajé hoy",
  campos: () => campoFecha() + `
    <div class="campo">
      <label for="f-horas">Horas</label>
      <input id="f-horas" type="number" inputmode="decimal" step="0.5" min="0" max="24">
    </div>`,
  guardar(mostrarError) {
    const fecha = $("f-fecha").value;
    if (!fecha) return mostrarError("Elige la fecha.");
    const txt = $("f-horas").value.trim();
    const horas = Number(txt);
    if (txt === "") return mostrarError("Escribe las horas.");
    if (!(horas >= 0 && horas <= 24)) return mostrarError("Las horas deben estar entre 0 y 24.");
    Jornadas.guardarJornada(fecha, horas, Jornadas.editando).then(ok => {
      if (ok) {
        Jornadas.editando = null;
        cerrarFormulario();
      }
    });
  }
};

if (Datos.actual) Jornadas.iniciar();
