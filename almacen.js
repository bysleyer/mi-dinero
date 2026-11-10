/*
 * ALMACEN - único lugar donde se guardan y leen los datos del dispositivo.
 * Ninguna otra parte del código toca localStorage directamente.
 * Si más adelante se agrega sincronización en la nube, se hace aquí
 * (ver sincronizar() al final), sin tocar el resto de la app.
 *
 * Claves guardadas (todas con el prefijo "midinero:"):
 *   formato      número de versión del formato de datos
 *   datos        mis cifras (ingresos, gastos, deudas...) cargadas de mis-datos.json
 *   config       { usarEjemplo, primerUso, ultimoRespaldo }
 *   movimientos  ingresos, gastos, pagos de deuda y ajustes
 *   plan         horas, porcentaje del colchón, sobres
 *   revision     último "dinero que tengo hoy"
 *   jornadas     días trabajados (fecha y horas). No son dinero.
 *   lineaTiempo  "Dinero que tengo hoy" de la pantalla ¿Me alcanza?
 *   escenarios   montos de "¿Y si cobro...?" (menos, esperado, más, % colchón)
 *   dineroInicial  "Corregir mi dinero": { monto, fecha, momento }
 *   pagosMovidos   fechas nuevas elegidas en "Mover este pago" (no son pagos)
 *   diasLibres     días que NO voy a trabajar (planeados, futuros): { id, desde, hasta, motivo }
 *   futuro         "Mi futuro": escenario y vista elegidos { escenario, vista }
 *   cambiosDatos   "Datos fijos": { id, campo, valor, anterior, desde, creado, deshecho }
 *   planeados      gastos planeados: { id, nombre, monto, fechaLimite, categoria, nota, tipo,
 *                  enPartes, partes, elegido: [{ fecha, monto }] | null }
 */
const Almacen = {
  prefijo: "midinero:",

  // Versión del formato de datos. Súbela si cambia la forma de guardar algo
  // y agrega el cambio en migrar().
  VERSION_FORMATO: 4,

  // ---------- Funciones básicas ----------
  leer(clave) {
    try {
      const texto = localStorage.getItem(this.prefijo + clave);
      return texto ? JSON.parse(texto) : null;
    } catch (e) {
      return null; // modo privado o almacenamiento bloqueado
    }
  },

  guardar(clave, valor) {
    try {
      localStorage.setItem(this.prefijo + clave, JSON.stringify(valor));
      return true;
    } catch (e) {
      return false;
    }
  },

  borrar(clave) {
    try {
      localStorage.removeItem(this.prefijo + clave);
      return true;
    } catch (e) {
      return false;
    }
  },

  nuevoId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  ahora() {
    return new Date().toISOString();
  },

  // ---------- Versión y migración ----------
  // Pone al día datos guardados con versiones anteriores de la app.
  migrar() {
    const version = this.leer("formato") || 1;
    if (version < 2) {
      // v2: cada movimiento lleva "modificado"
      const lista = (this.leer("movimientos") || []).map(m => ({
        ...m,
        id: m.id || this.nuevoId(),
        creado: m.creado || this.ahora(),
        modificado: m.modificado || m.creado || this.ahora()
      }));
      this.guardar("movimientos", lista);
    }
    // v3: se agregan las jornadas (clave nueva, no hay que convertir nada)
    if (version < 4) {
      // v4: los ingresos tienen tipo; los que ya existían quedan como "cheque"
      const lista = (this.leer("movimientos") || []).map(m =>
        m.tipo === "ingreso" && !m.tipoIngreso ? { ...m, tipoIngreso: "cheque" } : m);
      this.guardar("movimientos", lista);
    }
    this.guardar("formato", this.VERSION_FORMATO);
  },

  // ---------- Configuración ----------
  leerConfig() {
    return { usarEjemplo: false, primerUso: null, ultimoRespaldo: null, ...(this.leer("config") || {}) };
  },

  guardarConfig(cambios) {
    return this.guardar("config", { ...this.leerConfig(), ...cambios });
  },

  // ---------- Mis datos (cifras) ----------
  leerDatos() {
    return this.leer("datos");
  },

  // Guarda mis cifras. Cada deuda recibe id, creado y modificado si no los tiene.
  guardarDatos(datos) {
    const momento = this.ahora();
    const copia = JSON.parse(JSON.stringify(datos));
    copia.deudasAtrasadas = (copia.deudasAtrasadas || []).map(d => ({
      ...d,
      id: d.id || this.nuevoId(),
      creado: d.creado || momento,
      modificado: momento
    }));
    const ok = this.guardar("datos", copia);
    if (ok) {
      const config = this.leerConfig();
      this.guardarConfig({ usarEjemplo: false, primerUso: config.primerUso || momento });
    }
    return ok;
  },

  usarDatosEjemplo() {
    const config = this.leerConfig();
    return this.guardarConfig({ usarEjemplo: true, primerUso: config.primerUso || this.ahora() });
  },

  // ---------- Movimientos ----------
  // Los borrados se marcan con "borrado: true" en vez de eliminarse,
  // para que una futura sincronización sepa qué se borró en otro dispositivo.
  leerTodosLosMovimientos() {
    return this.leer("movimientos") || [];
  },

  leerMovimientos() {
    return this.leerTodosLosMovimientos().filter(m => !m.borrado);
  },

  agregarMovimiento(mov) {
    const lista = this.leerTodosLosMovimientos();
    const momento = this.ahora();
    mov.id = this.nuevoId();
    mov.creado = momento;
    mov.modificado = momento;
    lista.push(mov);
    return this.guardar("movimientos", lista) ? mov : null;
  },

  // Cambia algunos campos de un movimiento (ej.: el tipo de ingreso)
  actualizarMovimiento(id, cambios) {
    const lista = this.leerTodosLosMovimientos().map(m =>
      m.id === id ? { ...m, ...cambios, modificado: this.ahora() } : m);
    return this.guardar("movimientos", lista);
  },

  borrarMovimiento(id) {
    const lista = this.leerTodosLosMovimientos().map(m =>
      m.id === id ? { ...m, borrado: true, modificado: this.ahora() } : m);
    return this.guardar("movimientos", lista);
  },

  // ---------- Plan semanal (horas, porcentaje, sobres) ----------
  leerPlan() {
    const base = {
      horas: 40,
      porcentajeColchon: 50,
      sobres: { renta: 0, servicios: 0, colchon: 0 },
      ultimaSemanaApartada: null,
      extraProyeccion: 0
    };
    const guardado = this.leer("plan") || {};
    return { ...base, ...guardado, sobres: { ...base.sobres, ...(guardado.sobres || {}) } };
  },

  guardarPlan(plan) {
    return this.guardar("plan", { ...plan, modificado: this.ahora() });
  },

  // ---------- Revisión del domingo: último "dinero que tengo hoy" ----------
  leerRevision() {
    return this.leer("revision"); // { monto, momento } o null
  },

  guardarRevision(revision) {
    return this.guardar("revision", revision);
  },

  // ---------- ¿Me alcanza? (Bloque 9) ----------
  leerLineaTiempo() {
    return this.leer("lineaTiempo"); // { dineroHoy, momento } o null
  },

  guardarLineaTiempo(dineroHoy) {
    return this.guardar("lineaTiempo", { dineroHoy, momento: this.ahora() });
  },

  // ---------- Datos fijos (Bloque 17): cambios a mis cifras con fecha ----------
  leerCambiosDatos() {
    return this.leer("cambiosDatos") || [];
  },

  agregarCambioDatos(cambio) {
    const lista = this.leerCambiosDatos();
    const nuevo = { ...cambio, id: this.nuevoId(), creado: this.ahora() };
    lista.push(nuevo);
    return this.guardar("cambiosDatos", lista) ? nuevo : null;
  },

  marcarCambioDeshecho(id) {
    const lista = this.leerCambiosDatos().map(c => c.id === id ? { ...c, deshecho: true, modificado: this.ahora() } : c);
    return this.guardar("cambiosDatos", lista);
  },

  // ---------- Gastos planeados (Bloque 15) ----------
  // Comprado = hay un gasto registrado con su planeadoId (no se guarda aparte: así no se duplica).
  leerTodosLosPlaneados() {
    return this.leer("planeados") || [];
  },

  leerPlaneados() {
    return this.leerTodosLosPlaneados().filter(g => !g.borrado);
  },

  guardarPlaneado(gasto) {
    const lista = this.leerTodosLosPlaneados();
    const momento = this.ahora();
    const i = gasto.id ? lista.findIndex(g => g.id === gasto.id) : -1;
    if (i >= 0) { lista[i] = { ...lista[i], ...gasto, modificado: momento }; }
    else { gasto = { ...gasto, id: this.nuevoId(), creado: momento, modificado: momento }; lista.push(gasto); }
    return this.guardar("planeados", lista) ? (i >= 0 ? lista[i] : gasto) : null;
  },

  borrarPlaneado(id) {
    const lista = this.leerTodosLosPlaneados().map(g =>
      g.id === id ? { ...g, borrado: true, modificado: this.ahora() } : g);
    return this.guardar("planeados", lista);
  },

  // ---------- Mi futuro (Bloque 14) ----------
  leerFuturo() {
    return this.leer("futuro") || {};
  },

  guardarFuturo(cambios) {
    return this.guardar("futuro", { ...this.leerFuturo(), ...cambios });
  },

  // ---------- Días libres planeados (Bloque 13) ----------
  // Separados de las faltas reales (jornadas de 0 horas). Los borrados se marcan.
  leerTodosLosDiasLibres() {
    return this.leer("diasLibres") || [];
  },

  leerDiasLibres() {
    return this.leerTodosLosDiasLibres().filter(d => !d.borrado);
  },

  guardarDiaLibre(dia) {
    const lista = this.leerTodosLosDiasLibres();
    const momento = this.ahora();
    const i = dia.id ? lista.findIndex(d => d.id === dia.id) : -1;
    if (i >= 0) lista[i] = { ...lista[i], ...dia, modificado: momento };
    else lista.push({ ...dia, id: this.nuevoId(), creado: momento, modificado: momento });
    return this.guardar("diasLibres", lista);
  },

  borrarDiaLibre(id) {
    const lista = this.leerTodosLosDiasLibres().map(d =>
      d.id === id ? { ...d, borrado: true, modificado: this.ahora() } : d);
    return this.guardar("diasLibres", lista);
  },

  // ---------- Pagos movidos (Bloque 12): solo fechas, no dinero ----------
  leerPagosMovidos() {
    return this.leer("pagosMovidos") || {};
  },

  guardarPagoMovido(clave, datos) {
    const todos = this.leerPagosMovidos();
    const momento = this.ahora();
    todos[clave] = { ...(todos[clave] || { creado: momento }), ...datos, clave, modificado: momento };
    return this.guardar("pagosMovidos", todos);
  },

  quitarPagoMovido(clave) {
    const todos = this.leerPagosMovidos();
    delete todos[clave];
    return this.guardar("pagosMovidos", todos);
  },

  // ---------- Dinero que tengo ----------
  leerDineroInicial() {
    return this.leer("dineroInicial");
  },

  guardarDineroInicial(valor) {
    return this.guardar("dineroInicial", valor);
  },

  // ---------- ¿Y si cobro...? (Bloque 11) ----------
  leerEscenarios() {
    return this.leer("escenarios"); // { menos, esperado, mas, porcentajeColchon } (null = valor por defecto)
  },

  guardarEscenarios(valores) {
    return this.guardar("escenarios", valores);
  },

  // ---------- Jornadas (días trabajados; no son dinero) ----------
  // Igual que los movimientos: los borrados se marcan, no se eliminan.
  leerTodasLasJornadas() {
    return this.leer("jornadas") || [];
  },

  leerJornadas() {
    return this.leerTodasLasJornadas().filter(j => !j.borrado);
  },

  agregarJornada(jornada) {
    const lista = this.leerTodasLasJornadas();
    const momento = this.ahora();
    const nueva = { id: this.nuevoId(), fecha: jornada.fecha, horas: jornada.horas, creado: momento, modificado: momento };
    lista.push(nueva);
    return this.guardar("jornadas", lista) ? nueva : null;
  },

  actualizarJornada(id, cambios) {
    const lista = this.leerTodasLasJornadas().map(j =>
      j.id === id ? { ...j, ...cambios, modificado: this.ahora() } : j);
    return this.guardar("jornadas", lista);
  },

  borrarJornada(id) {
    return this.actualizarJornada(id, { borrado: true });
  },

  // ---------- Respaldo ----------
  // Todo lo guardado en este dispositivo, listo para descargar.
  exportarTodo() {
    return {
      formato: "mi-dinero-respaldo",
      versionFormato: this.VERSION_FORMATO,
      creado: this.ahora(),
      config: this.leerConfig(),
      datos: this.leerDatos(),
      movimientos: this.leerTodosLosMovimientos(),
      plan: this.leerPlan(),
      revision: this.leerRevision(),
      jornadas: this.leerTodasLasJornadas(),
      lineaTiempo: this.leerLineaTiempo(),
      escenarios: this.leerEscenarios(),
      dineroInicial: this.leerDineroInicial(),
      pagosMovidos: this.leerPagosMovidos(),
      diasLibres: this.leerTodosLosDiasLibres(),
      futuro: this.leerFuturo(),
      planeados: this.leerTodosLosPlaneados(),
      cambiosDatos: this.leerCambiosDatos(),
      simulaciones: this.leer("simulaciones") || []
    };
  },

  // Reemplaza TODO lo guardado por el contenido de un respaldo ya validado.
  reemplazarTodo(respaldo) {
    const config = this.leerConfig();
    this.guardar("movimientos", respaldo.movimientos || []);
    this.guardar("plan", respaldo.plan || {});
    this.guardar("jornadas", respaldo.jornadas || []);
    if (respaldo.lineaTiempo) this.guardar("lineaTiempo", respaldo.lineaTiempo);
    else this.borrar("lineaTiempo");
    if (respaldo.escenarios) this.guardar("escenarios", respaldo.escenarios);
    else this.borrar("escenarios");
    if (respaldo.dineroInicial) this.guardar("dineroInicial", respaldo.dineroInicial);
    else this.borrar("dineroInicial");
    this.guardar("pagosMovidos", respaldo.pagosMovidos || {});
    this.guardar("diasLibres", respaldo.diasLibres || []);
    this.guardar("futuro", respaldo.futuro || {});
    this.guardar("planeados", respaldo.planeados || []);
    this.guardar("cambiosDatos", respaldo.cambiosDatos || []);
    this.guardar("simulaciones", respaldo.simulaciones || []);
    if (respaldo.revision) this.guardar("revision", respaldo.revision);
    else this.borrar("revision");
    if (respaldo.datos) {
      this.guardar("datos", respaldo.datos);
    } else {
      this.borrar("datos");
    }
    this.guardarConfig({
      usarEjemplo: !respaldo.datos,
      primerUso: (respaldo.config && respaldo.config.primerUso) || config.primerUso || this.ahora(),
      ultimoRespaldo: config.ultimoRespaldo
    });
    this.guardar("formato", respaldo.versionFormato || 1);
    this.migrar();
    return true;
  },

  marcarRespaldoDescargado() {
    return this.guardarConfig({ ultimoRespaldo: this.ahora() });
  },

  // ---------- Sincronización en la nube (todavía NO activa) ----------
  /*
   * sincronizar() es el único lugar donde se conectaría un servicio en la nube.
   * Idea para más adelante:
   *   1. Enviar exportarTodo() al servicio elegido.
   *   2. Recibir los cambios de otros dispositivos.
   *   3. Unir por "id": gana el registro con "modificado" más reciente;
   *      los movimientos con "borrado: true" se borran en todos lados.
   *   4. Guardar el resultado con guardar(...).
   * Hoy no hace nada: la app no envía datos a ningún servidor.
   */
  sincronizar() {
    return Promise.resolve({ activo: false });
  }
};

Almacen.migrar();
