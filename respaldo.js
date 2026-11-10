/*
 * RESPALDO Y PRIMERA VEZ (Bloque 6)
 * - Descargar / cargar respaldo (archivo JSON con todo).
 * - Primera vez en un dispositivo: cargar mis-datos.json o usar datos de ejemplo.
 * - Avisos en la pantalla principal (respaldo viejo, datos de ejemplo).
 * Todo pasa por Almacen (almacen.js). Nada se envía a ningún servidor.
 */
const Respaldo = {
  DIAS_AVISO: 7,
  TIPOS_MOVIMIENTO: ["ingreso", "gasto", "pagoDeuda", "ajuste"],
  pendiente: null, // archivo ya revisado, esperando confirmación

  // ---------- Validación ----------
  // Revisa que unas cifras tengan lo que la app necesita. Devuelve lista de errores.
  validarDatos(d) {
    const errores = [];
    const esNum = v => typeof v === "number" && isFinite(v);
    if (!d || typeof d !== "object") return ["No trae cifras."];
    const ing = d.ingresos || {};
    if (!esNum(ing.pagoPorHora)) errores.push("Falta ingresos.pagoPorHora");
    if (!esNum(ing.horasPorSemana)) errores.push("Falta ingresos.horasPorSemana");
    if (!esNum(ing.brutoSemanal)) errores.push("Falta ingresos.brutoSemanal");
    if (!ing.netoSemanal || !esNum(ing.netoSemanal.monto)) errores.push("Falta ingresos.netoSemanal.monto");
    if (!ing.semanaMala || !esNum(ing.semanaMala.netoMinimo)) errores.push("Falta ingresos.semanaMala.netoMinimo");

    const gastos = Array.isArray(d.gastosFijos) ? d.gastosFijos : [];
    if (!gastos.length) errores.push("Falta la lista gastosFijos");
    ["renta", "telefono", "luz", "internet", "comida", "prestamoSemanal"].forEach(id => {
      const g = gastos.find(x => x.id === id);
      if (!g || !esNum(g.monto)) errores.push(`Falta el gasto fijo "${id}" con su monto`);
    });
    // Transporte: trae su detalle por día (tren y taxi; el monto se calcula solo)
    // o, en archivos viejos, monto y porDia
    const transporte = gastos.find(x => x.id === "transporte");
    const detalle = transporte && transporte.detalleDia;
    if (!transporte) errores.push('Falta el gasto fijo "transporte"');
    else if (!(detalle && esNum(detalle.trenIda)) && !(esNum(transporte.monto) && esNum(transporte.porDia))) {
      errores.push("Falta transporte.detalleDia (trenIda, trenVuelta, taxi)");
    }

    const deudas = Array.isArray(d.deudasAtrasadas) ? d.deudasAtrasadas : [];
    if (!deudas.length) errores.push("Falta la lista deudasAtrasadas");
    deudas.forEach((x, i) => {
      if (!x.id || !x.nombre || !esNum(x.monto)) errores.push(`La deuda #${i + 1} necesita id, nombre y monto`);
    });
    ["deudaRenta", "deudaPrestamo"].forEach(id => {
      if (!deudas.some(x => x.id === id)) errores.push(`Falta la deuda "${id}"`);
    });

    const fechas = Array.isArray(d.fechasImportantes) ? d.fechasImportantes : [];
    if (!fechas.some(f => f.id === "accionLegal" && esNum(f.diaDelMes))) errores.push('Falta la fecha "accionLegal"');
    const adm = d.contactos && d.contactos.administradora;
    if (!adm || !adm.correo || !adm.telefono) errores.push("Falta contactos.administradora (correo y teléfono)");
    return errores;
  },

  validarMovimiento(m) {
    return m && typeof m.id === "string" && this.TIPOS_MOVIMIENTO.includes(m.tipo)
      && typeof m.monto === "number" && isFinite(m.monto) && m.monto >= 0
      && /^\d{4}-\d{2}-\d{2}$/.test(m.fecha || "");
  },

  // Lee el texto de un archivo y dice qué es. Devuelve { tipo, contenido, resumen } o { error }.
  analizar(texto) {
    let obj;
    try {
      obj = JSON.parse(texto);
    } catch (e) {
      return { error: "El archivo no se puede leer: no es un JSON válido." };
    }
    if (!obj || typeof obj !== "object") return { error: "El archivo está vacío o no es válido." };

    // Respaldo completo
    if (obj.formato === "mi-dinero-respaldo") {
      if (!Array.isArray(obj.movimientos)) return { error: "El respaldo no trae la lista de movimientos." };
      const malos = obj.movimientos.filter(m => !this.validarMovimiento(m)).length;
      if (malos) return { error: `El respaldo tiene ${malos} movimiento(s) dañado(s). No se cargó nada.` };
      const jornadas = obj.jornadas || [];
      const jornadaBuena = j => j && typeof j.id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.fecha || "")
        && typeof j.horas === "number" && j.horas >= 0;
      if (!Array.isArray(jornadas) || jornadas.some(j => !jornadaBuena(j))) {
        return { error: "El respaldo tiene jornadas dañadas. No se cargó nada." };
      }
      if (obj.versionFormato > Almacen.VERSION_FORMATO) {
        return { error: "Este respaldo es de una versión más nueva de la app. Actualiza la app primero." };
      }
      if (obj.datos) {
        const errores = this.validarDatos(obj.datos);
        if (errores.length) return { error: "Las cifras del respaldo están incompletas: " + errores.join("; ") };
      }
      const activos = obj.movimientos.filter(m => !m.borrado).length;
      const fecha = obj.creado ? fechaCorta(Resumen.aClave(new Date(obj.creado))) : "sin fecha";
      return {
        tipo: "respaldo",
        contenido: obj,
        resumen: [
          `Respaldo del <strong>${fecha}</strong>`,
          `<strong>${activos}</strong> movimiento(s) · <strong>${jornadas.filter(j => !j.borrado).length}</strong> jornada(s)`,
          obj.datos ? "Trae tus cifras (ingresos, gastos y deudas)" : "Usa los datos de ejemplo"
        ],
        aviso: "Esto REEMPLAZA todo lo que hay en este dispositivo: movimientos, sobres, colchón y cifras."
      };
    }

    // Archivo de cifras (mis-datos.json)
    if (obj.ingresos && obj.gastosFijos && obj.deudasAtrasadas) {
      const errores = this.validarDatos(obj);
      if (errores.length) return { error: "A este archivo le falta: " + errores.join("; ") };
      const total = obj.deudasAtrasadas.reduce((s, d) => s + d.monto, 0);
      return {
        tipo: "datos",
        contenido: obj,
        resumen: [
          "Archivo de cifras (mis-datos.json)",
          `${obj.gastosFijos.length} gastos fijos · ${obj.deudasAtrasadas.length} deudas`,
          `Deuda original total: <strong>${dinero(total)}</strong>`
        ],
        aviso: "Esto reemplaza tus cifras (ingresos, gastos y deudas). Tus movimientos se conservan."
      };
    }

    return { error: "Este archivo no es un respaldo de Mi dinero ni un mis-datos.json." };
  },

  aplicar(revisado) {
    const ok = revisado.tipo === "respaldo"
      ? Almacen.reemplazarTodo(revisado.contenido)
      : Almacen.guardarDatos(revisado.contenido);
    if (!ok) return false;
    location.reload();
    return true;
  },

  // ---------- Descargar ----------
  descargar() {
    const contenido = Almacen.exportarTodo();
    // Saldos de cada deuda en este momento (solo informativo; al cargar se recalculan)
    contenido.saldos = Datos.deudas().map(d => ({ id: d.id, nombre: d.nombre, saldo: Datos.saldoDeuda(d.id) }));
    contenido.origenDatos = Datos.origen;
    if (!contenido.datos) contenido.datos = null; // con datos de ejemplo no se guardan cifras

    const blob = new Blob([JSON.stringify(contenido, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mi-dinero-${hoy()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    Almacen.marcarRespaldoDescargado();
    this.mostrar();
    this.mostrarAvisos();
    Pantalla.aviso("Respaldo descargado");
  },

  // ---------- Copiar y pegar (para iPhone y páginas donde no se puede descargar) ----------
  textoRespaldo() {
    const contenido = Almacen.exportarTodo();
    contenido.saldos = Datos.deudas().map(d => ({ id: d.id, nombre: d.nombre, saldo: Datos.saldoDeuda(d.id) }));
    contenido.origenDatos = Datos.origen;
    if (!contenido.datos) contenido.datos = null;
    return JSON.stringify(contenido);
  },

  async copiar() {
    const texto = this.textoRespaldo();
    const caja = $("respaldo-copia");
    try {
      await navigator.clipboard.writeText(texto);
      caja.hidden = true;
      $("respaldo-copia-estado").textContent = "Copiado. Pégalo en Notas o mándatelo por correo y guárdalo.";
    } catch (e) {
      // Si el teléfono no deja copiar solo, se muestra el texto ya seleccionado
      caja.hidden = false;
      caja.value = texto;
      caja.focus();
      caja.select();
      $("respaldo-copia-estado").textContent = "Mantén el dedo sobre el texto, toca \"Copiar\" y pégalo en Notas.";
    }
    Almacen.marcarRespaldoDescargado();
    this.mostrar();
    this.mostrarAvisos();
  },

  conectarPegado(textoId, botonId, cajaId) {
    $(botonId).addEventListener("click", () => {
      const texto = $(textoId).value.trim();
      if (!texto) return this.mostrarRevision(cajaId, { error: "Pega primero el texto del respaldo." });
      this.mostrarRevision(cajaId, this.analizar(texto));
    });
  },

  // ---------- Selector de archivo (lo usan Respaldo y Primera vez) ----------
  conectarSelector(inputId, cajaId) {
    $(inputId).addEventListener("change", async e => {
      const archivo = e.target.files[0];
      e.target.value = ""; // permite elegir el mismo archivo otra vez
      if (!archivo) return;
      let texto = "";
      try {
        texto = await archivo.text();
      } catch (err) {
        return this.mostrarRevision(cajaId, { error: "No se pudo leer el archivo." });
      }
      this.mostrarRevision(cajaId, this.analizar(texto));
    });
  },

  mostrarRevision(cajaId, revisado) {
    const caja = $(cajaId);
    caja.hidden = false;
    if (revisado.error) {
      this.pendiente = null;
      caja.innerHTML = `<p class="error">✗ ${escapar(revisado.error)}</p>`;
      return;
    }
    this.pendiente = revisado;
    caja.innerHTML = `
      <ul class="revision-lista">${revisado.resumen.map(r => `<li>${r}</li>`).join("")}</ul>
      <p class="revision-aviso">${revisado.aviso}</p>
      <button class="boton-grande deuda" data-confirmar-carga>Sí, cargar este archivo</button>
      <button class="boton-grande cancelar" data-cancelar-carga>Cancelar</button>`;
    caja.querySelector("[data-confirmar-carga]").addEventListener("click", () => {
      if (!this.pendiente || !this.aplicar(this.pendiente)) {
        caja.innerHTML = `<p class="error">✗ No se pudo guardar en este dispositivo.</p>`;
      }
    });
    caja.querySelector("[data-cancelar-carga]").addEventListener("click", () => {
      this.pendiente = null;
      caja.hidden = true;
      caja.innerHTML = "";
    });
  },

  // ---------- Pantalla Respaldo ----------
  diasDesde(iso) {
    if (!iso) return null;
    const inicio = new Date(iso);
    const a = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
    const h = new Date();
    const b = new Date(h.getFullYear(), h.getMonth(), h.getDate());
    return Math.round((b - a) / 86400000);
  },

  abrir() {
    $("pantalla-inicio").hidden = true;
    $("pantalla-respaldo").hidden = false;
    $("respaldo-revision").hidden = true;
    window.scrollTo(0, 0);
    this.mostrar();
  },

  cerrar() {
    $("pantalla-respaldo").hidden = true;
    $("pantalla-inicio").hidden = false;
    window.scrollTo(0, 0);
  },

  mostrar() {
    const config = Almacen.leerConfig();
    const dias = this.diasDesde(config.ultimoRespaldo);
    $("respaldo-ultimo").textContent = config.ultimoRespaldo
      ? `Último respaldo: ${fechaCorta(Resumen.aClave(new Date(config.ultimoRespaldo)))}` +
        (dias === 0 ? " (hoy)" : ` (hace ${dias} ${dias === 1 ? "día" : "días"})`)
      : "Todavía no has descargado ningún respaldo en este dispositivo.";
    $("respaldo-origen").textContent = Datos.origen === "ejemplo"
      ? "Estás usando datos de EJEMPLO. Carga tu mis-datos.json abajo."
      : "Estás usando tus propias cifras.";
  },

  // ---------- Avisos en la pantalla principal ----------
  mostrarAvisos() {
    const config = Almacen.leerConfig();
    const dias = this.diasDesde(config.ultimoRespaldo || config.primerUso);
    const avisoRespaldo = $("aviso-respaldo");
    if (dias != null && dias > this.DIAS_AVISO) {
      avisoRespaldo.textContent = `Hace ${dias} días que no haces respaldo.`;
      avisoRespaldo.hidden = false;
    } else {
      avisoRespaldo.hidden = true;
    }
    $("aviso-ejemplo").hidden = Datos.origen !== "ejemplo";
    // Mis datos de una versión anterior: la app usa valores genéricos para lo que falta
    const faltan = ["periodoDePago", "reglasDePrioridad", "colchon", "moverPagos"].filter(k => !Datos.actual[k]);
    $("aviso-datos-viejos").hidden = !(Datos.origen === "propios" && faltan.length);
  },

  iniciar() {
    $("abrir-respaldo").addEventListener("click", () => this.abrir());
    $("volver-respaldo").addEventListener("click", () => this.cerrar());
    $("descargar-respaldo").addEventListener("click", () => this.descargar());
    $("copiar-respaldo").addEventListener("click", () => this.copiar());
    this.conectarPegado("pegar-respaldo", "revisar-pegado", "respaldo-revision");
    $("aviso-ejemplo").addEventListener("click", () => this.abrir());
    $("aviso-respaldo").addEventListener("click", () => this.abrir());
    $("aviso-datos-viejos").addEventListener("click", () => this.abrir());
    this.conectarSelector("cargar-respaldo", "respaldo-revision");
    this.mostrarAvisos();
  },

  // ---------- Primera vez en este dispositivo ----------
  mostrarPrimeraVez() {
    $("pantalla-inicio").hidden = true;
    $("pantalla-primera").hidden = false;
    this.conectarSelector("cargar-primera", "primera-revision");
    this.conectarPegado("pegar-primera", "revisar-primera", "primera-revision");
    $("usar-ejemplo").addEventListener("click", () => {
      Almacen.usarDatosEjemplo();
      location.reload();
    });
  }
};

if (Datos.actual) Respaldo.iniciar();
else if (!$("estado-carga").textContent) Respaldo.mostrarPrimeraVez();
