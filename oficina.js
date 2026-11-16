/*
 * OFICINA: dos agentes que revisan tus números sin tocar nada de la app.
 *   · El Contador revisa que las cuentas cuadren (recuento, duplicados, fechas, montos raros, respaldo).
 *   · El Asesor revisa hacia dónde va tu dinero (Libre, faltantes, reglas, tendencias, deudas, informe del consejero).
 * Esta parte NO tiene 3D ni guarda nada: solo LEE lo que ya calcula la app (Dinero, Plan, Proyeccion, Patrones,
 * Vigilante, Resumen, Consejero) y devuelve una lista de revisiones. Nunca llama a nada que escriba datos.
 * La escena 3D (oficina3d.js) usa esta lista para saber qué está haciendo cada uno.
 * Reglas del consejero que se respetan aquí: el tren y el taxi al trabajo (Transporte) no se comentan; no se dan
 * por hecho pagos ni horas extra; voz corta, con números y fechas.
 *
 * Cada revisión: { id, titulo, haciendo, estado: "ok" | "aviso" | "alerta", texto, lugar: "escritorio" | "archivero" | "pizarra" }
 *   titulo   = lo que revisa (lista)    haciendo = lo que dice mientras lo hace (burbuja)    texto = lo que encontró
 */
const Oficina = {
  AGENTES: {
    contador: { nombre: "El Contador", rol: "Revisa que los números cuadren", icono: "🧮" },
    asesor: { nombre: "El Asesor", rol: "Revisa hacia dónde va tu dinero", icono: "📈" }
  },
  SEGUNDOS_POR_REVISION: 16, // cuánto se queda cada agente en una revisión antes de pasar a la siguiente

  // ---------- Las revisiones del Contador ----------
  _contador() {
    const r = [];
    const nueva = (id, titulo, haciendo, lugar, f) => {
      try { const x = f(); r.push({ id, titulo, haciendo, lugar, estado: x.estado, texto: x.texto }); }
      catch (e) { r.push({ id, titulo, haciendo, lugar, estado: "aviso", texto: "No pude hacer esta revisión (" + e.message + ")." }); }
    };
    const movs = Almacen.leerMovimientos();

    // 1) Recuento de la semana: suma los movimientos a mano y compara con lo que muestra "A dónde va"
    nueva("recuento", "Recuento de la semana", "Recontando los movimientos de la semana…", "archivero", () => {
      const lunes = Plan.claveSemana(), domingo = Jornadas.sumarDias(lunes, 6);
      const semana = movs.filter(m => m.fecha >= lunes && m.fecha <= domingo);
      const gastos = redondear(semana.filter(m => m.tipo === "gasto").reduce((s, m) => s + m.monto, 0));
      const ingresos = redondear(semana.filter(m => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0));
      const c = Resumen.calcular("semana");
      const dif = Math.abs(gastos - c.totalGastado) + Math.abs(ingresos - c.ingresos);
      if (dif < 0.01) return { estado: "ok", texto: `Sumé ${semana.length} ${semana.length === 1 ? "movimiento" : "movimientos"} de esta semana: ${dinero(gastos)} de gastos y ${dinero(ingresos)} de ingresos. Coincide con "A dónde va".` };
      return { estado: "alerta", texto: `Mi suma de la semana (${dinero(gastos)} de gastos, ${dinero(ingresos)} de ingresos) no coincide con "A dónde va" (${dinero(c.totalGastado)} y ${dinero(c.ingresos)}). Hay que revisarlo.` };
    });

    // 2) Duplicados: mismo día, mismo monto, misma nota y categoría (con nota; dos viajes iguales no cuentan)
    nueva("duplicados", "Cobros repetidos", "Buscando movimientos repetidos…", "escritorio", () => {
      const vistos = {}, dup = [];
      movs.filter(m => m.tipo === "gasto" && (m.nota || "").trim()).forEach(m => {
        const k = [m.fecha, m.monto, Vigilante.normal(m.nota).trim(), m.categoria || ""].join("|");
        if (vistos[k]) dup.push(m); else vistos[k] = m;
      });
      if (!dup.length) return { estado: "ok", texto: "No encontré gastos repetidos (mismo día, monto y nota)." };
      const m = dup[dup.length - 1];
      return { estado: "aviso", texto: `Parece repetido: "${m.nota}" por ${dinero(m.monto)} el ${fechaCorta(m.fecha)} está dos veces${dup.length > 1 ? ` (y ${dup.length - 1} más)` : ""}. Si fue un error, bórralo en Movimientos.` };
    });

    // 3) Fechas: nada debería estar en el futuro
    nueva("fechas", "Fechas de los movimientos", "Revisando las fechas…", "escritorio", () => {
      const f = movs.filter(m => m.fecha > hoy() && ["gasto", "ingreso", "pagoDeuda"].includes(m.tipo));
      if (!f.length) return { estado: "ok", texto: "Ningún movimiento tiene fecha de mañana en adelante." };
      return { estado: "aviso", texto: `${f.length === 1 ? "Un movimiento tiene" : f.length + " movimientos tienen"} fecha futura (el ${fechaCorta(f[0].fecha)}). Cuenta ya en tu dinero de hoy; confirma que la fecha esté bien.` };
    });

    // 4) Montos raros: un gasto mucho más grande que lo normal de su categoría (Transporte no se comenta)
    nueva("raros", "Montos fuera de lo normal", "Comparando cada gasto con lo normal de su categoría…", "archivero", () => {
      const desde = Jornadas.sumarDias(hoy(), -90);
      const g = movs.filter(m => m.tipo === "gasto" && m.fecha >= desde && Vigilante.normal(m.categoria) !== "transporte");
      const raros = [];
      [...new Set(g.map(m => m.categoria || "Otros"))].forEach(cat => {
        const lista = g.filter(m => (m.categoria || "Otros") === cat);
        if (lista.length < 6) return;
        const orden = lista.map(m => m.monto).sort((a, b) => a - b), med = orden[Math.floor(orden.length / 2)];
        lista.filter(m => m.monto > Math.max(40, med * 4) && !m.razonFueraPlan).forEach(m => raros.push({ m, med, cat }));
      });
      if (!raros.length) return { estado: "ok", texto: "Ningún gasto de los últimos 90 días se sale de lo normal de su categoría." };
      const x = raros.sort((a, b) => b.m.monto - a.m.monto)[0];
      return { estado: "aviso", texto: `${dinero(x.m.monto)} en ${x.cat}${x.m.nota ? ` ("${x.m.nota}")` : ""} el ${fechaCorta(x.m.fecha)} es mucho más de lo normal (lo típico es ${dinero(x.med)}). Si estaba planeado, todo bien.` };
    });

    // 5) Respaldo: los datos solo viven en el aparato hasta que haces un respaldo
    nueva("respaldo", "Respaldo de tus datos", "Mirando cuándo fue el último respaldo…", "escritorio", () => {
      const u = Almacen.leerConfig().ultimoRespaldo;
      if (!u) return { estado: "aviso", texto: "Todavía no hay ningún respaldo. Hazlo en Más → Respaldo y sincronizar." };
      const dias = Math.floor((Date.now() - new Date(u).getTime()) / 86400000);
      if (dias > 7) return { estado: "aviso", texto: `El último respaldo fue hace ${dias} días. Hazlo hoy en Más → Respaldo y sincronizar.` };
      return { estado: "ok", texto: dias < 1 ? "Hiciste un respaldo hoy." : `El último respaldo fue hace ${dias} ${dias === 1 ? "día" : "días"}.` };
    });
    return r;
  },

  // ---------- Las revisiones del Asesor ----------
  _asesor() {
    const r = [];
    const nueva = (id, titulo, haciendo, lugar, f) => {
      try { const x = f(); if (x) r.push({ id, titulo, haciendo, lugar, estado: x.estado, texto: x.texto }); }
      catch (e) { r.push({ id, titulo, haciendo, lugar, estado: "aviso", texto: "No pude hacer esta revisión (" + e.message + ")." }); }
    };
    let pr = null;
    try { pr = Proyeccion.calcular({ horizonte: 92 }); } catch (e) { /* cada revisión lo dice si lo necesita */ }

    // 1) Libre de la semana
    nueva("libre", "Lo libre de la semana", "Calculando cuánto queda libre esta semana…", "pizarra", () => {
      const s = Plan.semanaReal();
      if (s.libre > 0.005) return { estado: "ok", texto: `Esta semana tienes ${dinero(s.libre)} libres después de apartar ${dinero(s.guardar)}. Menos de ${dinero(s.libre / 7)} por día si quieres llegar al domingo.` };
      if (s.hueco) return { estado: "alerta", texto: `Libre es $0 y el ${fechaCorta(s.hueco.fecha)} faltan ${dinero(s.hueco.falta)}. Un gasto fuera del plan abre ese hueco.` };
      return { estado: "aviso", texto: "Libre es $0: todo lo que hay ya está reservado para tus pagos. Cualquier gasto extra se nota." };
    });

    // 2) El faltante más cercano de los próximos 92 días
    nueva("faltante", "Faltantes de los próximos 92 días", "Mirando los próximos 92 días de pagos…", "pizarra", () => {
      const f = pr && Proyeccion.faltante(pr);
      if (!f) return { estado: "ok", texto: "En los próximos 92 días no veo ningún día en el que te falte dinero." };
      return { estado: "alerta", texto: Proyeccion.textoFaltante(f) };
    });

    // 3) Reglas del consejero (Transporte no entra: se usan solo las comentables)
    nueva("reglas", "Reglas del consejero", "Comprobando las reglas de gasto…", "escritorio", () => {
      const reglas = Vigilante.comentables();
      if (!reglas.length) return { estado: "ok", texto: "El consejero todavía no puso reglas esta semana." };
      const est = reglas.map(x => ({ x, e: Vigilante.estado(x) }));
      const rotas = est.filter(a => a.e.pasado), cerca = est.filter(a => a.e.cerca);
      if (rotas.length) return { estado: "aviso", texto: `Se pasó: ${rotas.map(a => a.x.nombre).join(", ")}. ${rotas.length === 1 ? "Va" : "Van"} ${rotas.map(a => a.e.veces + " " + (a.e.veces === 1 ? "vez" : "veces") + " / " + dinero(a.e.monto)).join("; ")}.` };
      if (cerca.length) return { estado: "aviso", texto: `Cerca del límite: ${cerca.map(a => a.x.nombre).join(", ")}.` };
      return { estado: "ok", texto: `Las ${reglas.length} reglas de esta semana van dentro de su límite.` };
    });

    // 4) Tendencia: categorías que suben contra su promedio (la semana en curso está incompleta; Transporte no se comenta)
    nueva("tendencia", "Gasto contra tu promedio", "Comparando esta semana con las anteriores…", "pizarra", () => {
      const p = Patrones.porSemana();
      if (!p || p.error) return { estado: "ok", texto: "Todavía no hay semanas suficientes para comparar." };
      if (p.diasTranscurridos < 3) return { estado: "ok", texto: `Es el día ${p.diasTranscurridos} de la semana: espero a tener más días para compararla con las anteriores.` };
      const suben = p.categorias.filter(c => c.marca && Vigilante.normal(c.categoria) !== "transporte");
      if (!suben.length) return { estado: "ok", texto: "Ninguna categoría sube más de lo normal contra tu promedio de semanas anteriores." };
      const c = suben[0];
      return { estado: "aviso", texto: `${c.categoria} va en ${dinero(c.actual)} esta semana; tu promedio es ${dinero(c.promedioAnteriores)} (${c.porcentaje > 0 ? "+" : ""}${c.porcentaje} %).` };
    });

    // 5) Deudas: la renta atrasada y el día de libertad (las mismas fechas que calcula Mis deudas)
    nueva("deudas", "Deudas y día de libertad", "Repasando tus deudas…", "pizarra", () => {
      const renta = Proyeccion.rentaAtrasada();
      const d = Proyeccion.planDeudas();
      if (!d || (!d.hayRenta && !d.hayAmigo)) return { estado: "ok", texto: "No hay deudas por repasar." };
      const fs = [d.hayRenta && d.rentaCero, d.hayAmigo && d.amigoCero].filter(x => x && x !== "ya").sort();
      const nunca = (d.hayRenta && !d.rentaCero) || (d.hayAmigo && !d.amigoCero);
      const atras = renta > 0.005 ? `Renta atrasada: ${dinero(renta)}. ` : "";
      if (nunca) return { estado: "aviso", texto: `${atras}Con el plan de hoy todavía no llegas a cero en ${d.dias} días. Mira Más → Mis deudas.` };
      if (!fs.length) return { estado: "ok", texto: "Tus deudas ya están en cero." };
      return { estado: renta > 0.005 ? "aviso" : "ok", texto: `${atras}Según el plan de hoy, quedas libre de deudas el ${fechaCorta(fs[fs.length - 1])}.` };
    });

    // 6) El informe del consejero (Claude): lo último que dejó escrito
    nueva("consejero", "Informe del consejero", "Leyendo el último informe del consejero…", "archivero", () => {
      const c = Consejero.leer();
      if (!c || !c.informe || !c.informe.titulo) return { estado: "ok", texto: "El consejero todavía no ha dejado un informe en este aparato." };
      const horas = c.actualizadoInforme || c.actualizado ? Math.max(0, Math.round((Date.now() - new Date(c.actualizadoInforme || c.actualizado).getTime()) / 3600000)) : null;
      const cuando = horas == null ? "" : horas < 1 ? "hace menos de una hora" : horas < 48 ? `hace ${horas} h` : `hace ${Math.round(horas / 24)} días`;
      return { estado: "ok", texto: `Último informe${cuando ? " (" + cuando + ")" : ""}: ${c.informe.titulo}` };
    });
    return r;
  },

  // Todo junto. Se vuelve a calcular solo cada minuto o cuando cambian los movimientos.
  _memoria: null,
  revisar(forzar = false) {
    const sello = hoy() + "|" + Almacen.leerMovimientos().length + "|" + Math.floor(Date.now() / 60000);
    if (!forzar && this._memoria && this._memoria.sello === sello) return this._memoria.valor;
    const valor = { contador: this._contador(), asesor: this._asesor(), calculado: Date.now() };
    this._memoria = { sello, valor };
    return valor;
  },

  // Cuántas alertas/avisos tiene cada agente
  pendientes(lista) { return lista.filter(x => x.estado !== "ok").length; },

  // Qué revisión está haciendo un agente en este momento (da vueltas sin parar: 24 h al día)
  // `desfase` = segundos de ventaja, para que los dos no cambien de tarea a la vez
  actual(lista, ahoraMs = Date.now(), desfase = 0) {
    if (!lista.length) return { i: 0, progreso: 0 };
    const t = ahoraMs / 1000 + desfase, S = this.SEGUNDOS_POR_REVISION;
    const n = Math.floor(t / S);
    return { i: n % lista.length, progreso: (t - n * S) / S };
  },

  // Hora en Nueva York (la oficina trabaja con tu hora, no con la del servidor): { hora, minuto, segundo, texto, turno }
  hora(ahora = new Date()) {
    const p = {};
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" })
      .formatToParts(ahora).forEach(x => { p[x.type] = Number(x.value); });
    const h = p.hour % 24, m = p.minute, s = p.second;
    const tt = `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
    const turno = h >= 6 && h < 18 ? "dia" : h >= 18 && h < 21 ? "tarde" : "noche";
    return { hora: h, minuto: m, segundo: s, texto: tt, turno };
  }
};
