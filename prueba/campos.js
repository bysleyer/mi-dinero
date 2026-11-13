/*
 * CAMPOS DE "DATOS FIJOS" (Bloque 17)
 * Cada cifra editable: dónde se lee en mis datos, cómo se cambia y cómo se valida.
 * Los cambios no tocan mis-datos.json: se guardan en el dispositivo (almacen.js) con una
 * fecha "desde cuándo aplica", y Datos.enFecha(fecha) los aplica encima de mis datos.
 * Algunos campos del colchón no son de mis datos sino del plan (porcentaje, saldo, proteger).
 */
const CAMPOS_DATOS = (() => {
  const gasto = (d, id) => d.gastosFijos.find(g => g.id === id) || {};
  const deuda = (d, id) => d.deudasAtrasadas.find(x => x.id === id) || {};
  const pp = d => (d.periodoDePago = d.periodoDePago || {});
  const reglas = d => (d.reglasDePrioridad = d.reglasDePrioridad || {});
  const recargos = d => (reglas(d).recargos = reglas(d).recargos || {});
  const mover = (d, id) => {
    d.moverPagos = d.moverPagos || {};
    d.moverPagos.pagos = d.moverPagos.pagos || {};
    return (d.moverPagos.pagos[id] = d.moverPagos.pagos[id] || {});
  };
  // Lo ya pagado (o ajustado) de una deuda, según los movimientos: sirve para fijar el saldo de hoy
  const pagadoNeto = id => Almacen.leerMovimientos().filter(m => m.deudaId === id).reduce((s, m) =>
    m.tipo === "pagoDeuda" ? s + m.monto : m.tipo === "ajuste" ? s - m.diferencia : s, 0);
  const confirmarGasto = id => d => !!gasto(d, id).confirmar;

  const recargoServicio = id => ({
    leer: d => mover(d, id).recargo ?? (id === "internet" ? recargos(d).internetPorFactura : (recargos(d)[id] || {}).monto) ?? null,
    escribir: (d, v) => {
      mover(d, id).recargo = v;
      if (id === "internet") recargos(d).internetPorFactura = v;
      else recargos(d)[id] = { ...(recargos(d)[id] || {}), monto: v };
    }
  });

  return [
    // ----- Ingresos -----
    { id: "pagoPorHora", seccion: "ingresos", etiqueta: "Pago por hora", tipo: "dinero",
      leer: d => pp(d).pagoPorHora ?? d.ingresos.pagoPorHora,
      escribir: (d, v) => { pp(d).pagoPorHora = v; d.ingresos.pagoPorHora = v; }, confirmar: d => !!pp(d).confirmar },
    { id: "horasPorSemana", seccion: "ingresos", etiqueta: "Horas por semana", tipo: "numero",
      leer: d => d.ingresos.horasPorSemana,
      escribir: (d, v) => { d.ingresos.horasPorSemana = v; pp(d).horasNormales = v; } },
    { id: "pagoHoraExtra", seccion: "ingresos", etiqueta: "Pago de horas extra", tipo: "dinero",
      leer: d => pp(d).pagoHoraExtra ?? d.ingresos.pagoPorHora * 1.5, escribir: (d, v) => { pp(d).pagoHoraExtra = v; },
      confirmar: d => !!pp(d).confirmar },
    { id: "proporcionNeto", seccion: "ingresos", etiqueta: "Proporción neto / bruto", tipo: "proporcion",
      leer: d => pp(d).proporcionNeto ?? d.ingresos.netoSemanal.monto / d.ingresos.brutoSemanal,
      escribir: (d, v) => { pp(d).proporcionNeto = v; }, confirmar: d => !!pp(d).confirmar },
    { id: "diasDeTrabajo", seccion: "ingresos", etiqueta: "Días de trabajo", tipo: "dias",
      leer: d => pp(d).diasDeTrabajo || [], escribir: (d, v) => { pp(d).diasDeTrabajo = v; pp(d).diasDeTrabajoPorSemana = v.length; },
      confirmar: d => !!pp(d).confirmar },
    { id: "horasPorDia", seccion: "ingresos", etiqueta: "Horas por día", tipo: "numero",
      leer: d => pp(d).horasPorDia, escribir: (d, v) => { pp(d).horasPorDia = v; }, confirmar: d => !!pp(d).confirmar },

    // ----- Renta -----
    { id: "rentaMonto", seccion: "renta", etiqueta: "Monto mensual", tipo: "dinero",
      leer: d => gasto(d, "renta").monto, escribir: (d, v) => { gasto(d, "renta").monto = v; } },
    { id: "rentaDia", seccion: "renta", etiqueta: "Día de vencimiento", tipo: "dia",
      leer: d => gasto(d, "renta").venceDia, escribir: (d, v) => { gasto(d, "renta").venceDia = v; } },
    { id: "rentaRecargo", seccion: "renta", etiqueta: "Recargo", tipo: "dinero",
      leer: d => recargos(d).renta ?? null, escribir: (d, v) => { recargos(d).renta = v; } },

    // ----- Servicios -----
    { id: "luzMonto", seccion: "luz", etiqueta: "Monto mensual", tipo: "dinero", confirmar: confirmarGasto("luz"),
      leer: d => gasto(d, "luz").monto,
      escribir: (d, v) => { const g = gasto(d, "luz"); if (g.partes) g.partes.consumo = Math.max(0, redondear(v - (g.partes.cuotaPlan || 0))); g.monto = v; } },
    { id: "luzDia", seccion: "luz", etiqueta: "Día de vencimiento", tipo: "dia", confirmar: confirmarGasto("luz"),
      leer: d => gasto(d, "luz").venceDia, escribir: (d, v) => { gasto(d, "luz").venceDia = v; } },
    { id: "luzRecargo", seccion: "luz", etiqueta: "Recargo", tipo: "dinero", confirmar: () => true, ...recargoServicio("luz") },
    { id: "luzMover", seccion: "luz", etiqueta: "Permite mover", tipo: "sino",
      leer: d => !!gasto(d, "luz").permite_mover, escribir: (d, v) => { gasto(d, "luz").permite_mover = v; } },

    { id: "internetMonto", seccion: "internet", etiqueta: "Monto mensual", tipo: "dinero",
      leer: d => gasto(d, "internet").monto, escribir: (d, v) => { gasto(d, "internet").monto = v; } },
    { id: "internetDia", seccion: "internet", etiqueta: "Día de vencimiento", tipo: "dia",
      leer: d => gasto(d, "internet").venceDia, escribir: (d, v) => { gasto(d, "internet").venceDia = v; } },
    { id: "internetRecargo", seccion: "internet", etiqueta: "Recargo por factura vencida", tipo: "dinero", ...recargoServicio("internet") },
    { id: "internetCambioDesde", seccion: "internet", etiqueta: "Fecha en que cambia el precio", tipo: "fecha",
      confirmar: d => !!(gasto(d, "internet").cambio || {}).confirmar,
      leer: d => (gasto(d, "internet").cambio || {}).desde || "",
      escribir: (d, v) => { const g = gasto(d, "internet"); g.cambio = { ...(g.cambio || {}), desde: v }; } },
    { id: "internetCambioMonto", seccion: "internet", etiqueta: "Monto nuevo", tipo: "dinero",
      confirmar: d => !!(gasto(d, "internet").cambio || {}).confirmar,
      leer: d => (gasto(d, "internet").cambio || {}).monto ?? null,
      escribir: (d, v) => { const g = gasto(d, "internet"); g.cambio = { ...(g.cambio || {}), monto: v }; } },
    { id: "internetMover", seccion: "internet", etiqueta: "Permite mover", tipo: "sino",
      leer: d => !!gasto(d, "internet").permite_mover, escribir: (d, v) => { gasto(d, "internet").permite_mover = v; } },

    // Teléfono: el monto normal (si este mes es distinto, ese queda igual)
    { id: "telefonoMonto", seccion: "telefono", etiqueta: "Monto mensual", tipo: "dinero", confirmar: confirmarGasto("telefono"),
      leer: d => { const g = gasto(d, "telefono"); return g.mesDelMonto ? (g.montoDespues ?? g.monto) : g.monto; },
      escribir: (d, v) => { const g = gasto(d, "telefono"); if (g.mesDelMonto) g.montoDespues = v; else g.monto = v; } },
    { id: "telefonoDia", seccion: "telefono", etiqueta: "Día de vencimiento", tipo: "dia",
      leer: d => gasto(d, "telefono").venceDia, escribir: (d, v) => { gasto(d, "telefono").venceDia = v; } },
    { id: "telefonoRecargo", seccion: "telefono", etiqueta: "Recargo", tipo: "dinero", confirmar: () => true, ...recargoServicio("telefono") },
    { id: "telefonoMover", seccion: "telefono", etiqueta: "Permite mover", tipo: "sino",
      leer: d => !!gasto(d, "telefono").permite_mover, escribir: (d, v) => { gasto(d, "telefono").permite_mover = v; } },

    // ----- Préstamos -----
    { id: "prestamoPago", seccion: "prestamos", etiqueta: "Préstamo semanal: pago", tipo: "dinero", confirmar: confirmarGasto("prestamoSemanal"),
      leer: d => gasto(d, "prestamoSemanal").monto, escribir: (d, v) => { gasto(d, "prestamoSemanal").monto = v; } },
    { id: "prestamoSemanas", seccion: "prestamos", etiqueta: "Préstamo semanal: semanas que faltan", tipo: "numero", entero: true,
      confirmar: confirmarGasto("prestamoSemanal"),
      leer: d => { const pago = gasto(d, "prestamoSemanal").monto || 1; const saldo = deuda(d, "deudaPrestamo").monto - pagadoNeto("deudaPrestamo"); return Math.max(0, Math.ceil(redondear(saldo) / pago)); },
      escribir: (d, v) => { const pago = gasto(d, "prestamoSemanal").monto || 0; deuda(d, "deudaPrestamo").monto = redondear(pagadoNeto("deudaPrestamo") + v * pago); gasto(d, "prestamoSemanal").semanasRestantes = v; } },
    { id: "amigoSaldo", seccion: "prestamos", etiqueta: "Préstamo del amigo: saldo", tipo: "dinero",
      leer: d => redondear(deuda(d, "deudaAmigo").monto - pagadoNeto("deudaAmigo")),
      escribir: (d, v) => { deuda(d, "deudaAmigo").monto = redondear(pagadoNeto("deudaAmigo") + v); } },

    // ----- Colchón -----
    { id: "colchonMeta", seccion: "colchon", etiqueta: "Meta", tipo: "dinero",
      leer: d => (d.colchon || {}).meta ?? null, escribir: (d, v) => { d.colchon = { ...(d.colchon || {}), meta: v }; } },
    { id: "colchonPorcentaje", seccion: "colchon", etiqueta: "Porcentaje del sobrante al colchón", tipo: "porcentaje", destino: "plan",
      leer: () => Almacen.leerPlan().porcentajeColchon,
      escribir: v => { const p = Almacen.leerPlan(); p.porcentajeColchon = v; Almacen.guardarPlan(p); } },
    { id: "colchonSaldo", seccion: "colchon", etiqueta: "Saldo actual", tipo: "dinero", destino: "plan",
      leer: () => Almacen.leerPlan().sobres.colchon,
      escribir: v => { const p = Almacen.leerPlan(); p.sobres.colchon = v; Almacen.guardarPlan(p); } },
    { id: "colchonProteger", seccion: "colchon", etiqueta: "Proteger el colchón", tipo: "sino", destino: "plan",
      leer: () => Proyeccion.protegerColchon(),
      escribir: v => { Almacen.guardarFuturo({ protegerColchon: v }); } },

    // ----- Comida y transporte -----
    { id: "comidaNormal", seccion: "comida", etiqueta: "Comida normal (por semana)", tipo: "dinero",
      leer: d => gasto(d, "comida").monto, escribir: (d, v) => { gasto(d, "comida").monto = v; } },
    { id: "comidaExtrema", seccion: "comida", etiqueta: "Comida extrema (por semana)", tipo: "dinero",
      leer: d => (reglas(d).nivel1 || {}).comidaMinima ?? null,
      escribir: (d, v) => { reglas(d).nivel1 = { ...(reglas(d).nivel1 || {}), comidaMinima: v }; } },
    { id: "tren", seccion: "comida", etiqueta: "Tren (cada viaje)", tipo: "dinero",
      leer: d => (gasto(d, "transporte").detalleDia || {}).trenIda ?? null,
      escribir: (d, v) => {
        const t = gasto(d, "transporte");
        t.detalleDia = { ...(t.detalleDia || {}), trenIda: v, trenVuelta: v };
        if (Array.isArray(t.montosRapidos)) t.montosRapidos = t.montosRapidos.map(m => m.nombre === "Tren" ? { ...m, monto: v } : m);
      } },
    { id: "taxi", seccion: "comida", etiqueta: "Meta del taxi (por día)", tipo: "dinero",
      leer: d => (gasto(d, "transporte").detalleDia || {}).taxi ?? null,
      escribir: (d, v) => { const t = gasto(d, "transporte"); t.detalleDia = { ...(t.detalleDia || {}), taxi: v }; } },
    { id: "diasTransporte", seccion: "comida", etiqueta: "Días de trabajo (transporte)", tipo: "numero", entero: true,
      leer: d => gasto(d, "transporte").diasPorSemana, escribir: (d, v) => { gasto(d, "transporte").diasPorSemana = v; } }
  ];
})();

const DIAS_SEMANA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

// Valida un valor escrito. Devuelve { valor } o { error }.
function validarCampo(c, crudo) {
  if (c.tipo === "sino") return { valor: !!crudo };
  if (c.tipo === "dias") {
    if (!Array.isArray(crudo) || !crudo.length) return { error: `${c.etiqueta}: elige al menos un día.` };
    return { valor: DIAS_SEMANA.filter(x => crudo.includes(x)) };
  }
  if (c.tipo === "fecha") {
    if (!crudo) return { error: `${c.etiqueta}: elige una fecha.` };
    return { valor: crudo };
  }
  const txt = String(crudo ?? "").trim();
  if (txt === "") return { error: `${c.etiqueta}: escribe un número.` };
  const n = Number(txt);
  if (!isFinite(n)) return { error: `${c.etiqueta}: escribe solo números (usa punto para decimales).` };
  if (n < 0) return { error: `${c.etiqueta}: tiene que ser 0 o más.` };
  if (c.tipo === "proporcion" && (n <= 0 || n > 1)) return { error: `${c.etiqueta}: tiene que estar entre 0 y 1 (por ejemplo 0.898).` };
  if (c.tipo === "porcentaje" && n > 100) return { error: `${c.etiqueta}: tiene que estar entre 0 y 100.` };
  if (c.tipo === "dia" && (n < 1 || n > 31 || !Number.isInteger(n))) return { error: `${c.etiqueta}: tiene que ser un día del 1 al 31.` };
  if (c.entero && !Number.isInteger(n)) return { error: `${c.etiqueta}: tiene que ser un número entero.` };
  return { valor: c.tipo === "proporcion" ? n : redondear(n) };
}

/*
 * PAGOS PROPIOS (Más → Pagos fijos): reglas de un pago que agregué yo en una fecha.
 * Están aquí (y no en pagosfijos.js) porque Datos.enFecha las usa al arrancar la app.
 */
const ReglasPago = {
  version(p, fecha) {
    const vs = (p.versiones || []).filter(v => v.desde <= fecha).sort((a, b) => a.desde.localeCompare(b.desde));
    return vs.length ? vs[vs.length - 1] : null;
  },
  pausado(p, fecha) { return (p.pausas || []).some(x => fecha >= x.desde && (!x.hasta || fecha < x.hasta)); },
  cancelado(p, fecha) { return !!p.canceladoDesde && fecha >= p.canceladoDesde; },
  activo(p, fecha) { return !!this.version(p, fecha) && !this.pausado(p, fecha) && !this.cancelado(p, fecha); },

  // Como un gasto fijo más (la forma que usan Plan, Cubrir y Vencimientos)
  comoGasto(p, fecha) {
    const v = this.version(p, fecha);
    return { id: p.id, nombre: p.nombre, monto: v.monto, frecuencia: "mensual", venceDia: v.venceDia,
             grupo: p.grupo, variable: !!p.variable, categoria: p.categoria || "Otros", propio: true, permite_mover: true };
  },

  // Vencimiento en un mes (el día y el monto que valen ese día), o null si ese día no cuenta
  vencimientoEnMes(p, año, mes) {
    const clave = d => { const n = x => String(x).padStart(2, "0"); return `${d.getFullYear()}-${n(d.getMonth() + 1)}-${n(d.getDate())}`; };
    const delMes = dia => clave(new Date(año, mes, Math.min(dia, new Date(año, mes + 1, 0).getDate())));
    const v0 = this.version(p, clave(new Date(año, mes + 1, 0)));
    if (!v0) return null;
    let fecha = delMes(v0.venceDia);
    const v = this.version(p, fecha);
    if (!v) return null;
    if (v.venceDia !== v0.venceDia) fecha = delMes(v.venceDia);
    if (!this.activo(p, fecha)) return null;
    return { fecha, monto: v.monto };
  }
};

/*
 * ORDEN DE PRIORIDAD (Más → Pagos fijos → Orden): qué se cubre primero cuando el dinero no alcanza.
 *   Nivel 1  no se atrasa: la RENTA siempre primero (fija), y lo que pongas aquí.
 *   Nivel 2  se puede mover o dividir: luz, internet, teléfono y los esenciales que agregues.
 *   Nivel 3  suscripciones: siempre al final (solo se cambia el orden entre ellas).
 * Se guarda en "prioridad" { n1, n2, n3 } (sin la renta). Sin nada guardado, es el orden de siempre.
 * La cuenta día por día usa este orden dentro de cada día; ¿Y si cobro...? usa los niveles.
 */
const Prioridad = {
  FIJO: "renta",
  DEFECTO_N1: ["prestamo", "transporte", "comida"],
  // Nivel 2 por defecto: las facturas de mis datos (luz, internet, teléfono...)
  get DEFECTO_N2() {
    return typeof Vencimientos !== "undefined" && Datos.actual ? Vencimientos.facturasDeDatos().map(g => g.id) : ["luz", "internet", "telefono"];
  },
  NOMBRES: { renta: "Renta", prestamo: "Préstamo semanal", transporte: "Transporte", comida: "Comida",
             luz: "Luz", internet: "Internet", telefono: "Teléfono" },
  // Lo que pasa si bajas algo importante al nivel 2 (se muestra como aviso, no se prohíbe)
  AVISOS: {
    transporte: "El transporte te lleva al trabajo: si no lo pagas, no cobras.",
    comida: "La comida de la semana no debería quedar sin cubrir.",
    prestamo: "Si lo vas a mover, avísale antes a quien te prestó."
  },

  guardado() { return Almacen.leer("prioridad") || {}; },

  // La cuenta pregunta el orden de cada línea: se guarda el resultado mientras no cambie lo guardado
  _cache: null,
  niveles() {
    let crudo = "";
    try { crudo = (localStorage.getItem(Almacen.prefijo + "prioridad") || "") + "|" + (localStorage.getItem(Almacen.prefijo + "pagosPropios") || ""); } catch (e) { /* sin almacenamiento */ }
    crudo += "|" + this.DEFECTO_N2.join(","); // también cambia si mis datos traen otra factura
    if (this._cache && this._cache.crudo === crudo) return this._cache.n;
    const n = this.calcularNiveles();
    this._cache = { crudo, n };
    return n;
  },

  calcularNiveles() {
    const g = this.guardado();
    const propios = Almacen.leerPagosPropios();
    const es = propios.filter(p => p.grupo !== "suscripcion").map(p => p.id);
    const su = propios.filter(p => p.grupo === "suscripcion").map(p => p.id);
    const validos = new Set([...this.DEFECTO_N1, ...this.DEFECTO_N2, ...es]);
    const n1 = (g.n1 || this.DEFECTO_N1).filter(id => validos.has(id));
    const n2 = (g.n2 || this.DEFECTO_N2).filter(id => validos.has(id) && !n1.includes(id));
    // Lo que no está en ningún lado (ej.: un esencial nuevo) va al final de su nivel normal
    [...this.DEFECTO_N1, ...this.DEFECTO_N2, ...es].forEach(id => {
      if (!n1.includes(id) && !n2.includes(id)) (this.DEFECTO_N1.includes(id) ? n1 : n2).push(id);
    });
    const n3 = [...(g.n3 || []).filter(id => su.includes(id)), ...su.filter(id => !(g.n3 || []).includes(id))];
    return { n1: [this.FIJO, ...n1], n2, n3 };
  },

  guardar({ n1, n2, n3 }) {
    return Almacen.guardar("prioridad", { n1: n1.filter(id => id !== this.FIJO), n2, n3 });
  },

  // Volver al orden de siempre: se guarda vacío (y no se borra) para que la sincronización lo lleve a los otros aparatos
  porDefecto() { Almacen.guardar("prioridad", {}); },
  cambiado() { return Object.keys(this.guardado()).length > 0; },

  nivel(id) {
    const n = this.niveles();
    return n.n1.includes(id) ? 1 : n.n2.includes(id) ? 2 : n.n3.includes(id) ? 3 : 0;
  },

  // Orden dentro de un día en la cuenta (cheque 0 · nivel 1: 1 a 4.9 · deudas inmediatas 5 · nivel 2: 10 · nivel 3: 11 · planeados 15).
  // Con el orden de siempre da lo mismo que antes (renta, préstamo, transporte, comida, luz, internet, teléfono).
  orden(id) {
    const n = this.niveles();
    let i = n.n1.indexOf(id);
    if (i >= 0) return Math.min(4.9, 1 + i * 0.3);
    i = n.n2.indexOf(id);
    if (i >= 0) return 10 + i * 0.01;
    i = n.n3.indexOf(id);
    if (i >= 0) return 11 + i * 0.01;
    return null;
  }
};
