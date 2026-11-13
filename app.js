/*
 * MI DINERO - lógica de la app
 *  - Almacen (almacen.js): guarda/lee en el dispositivo.
 *  - Datos: cifras de datos.js + cálculos con los movimientos.
 *  - Formularios: "Me pagaron", "Gasté", "Pagué una deuda".
 *  - Pantalla: dibuja lo que se ve.
 */

// ---------- Utilidades ----------
const dinero = n =>
  "$" + Number(n).toLocaleString("es-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Igual que dinero(), pero sin ".00" cuando no hay centavos ($60 en vez de $60.00), como en el concepto
const dineroCorto = n => { const t = dinero(n); return t.endsWith(".00") ? t.slice(0, -3) : t; };

const redondear = n => Math.round(n * 100) / 100;

// Fecha de hoy en formato AAAA-MM-DD (hora local)
function hoy() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fechaCorta(iso) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const $ = id => document.getElementById(id);

// Versión de la app: se muestra al final de la pantalla principal para saber si ya se actualizó.
// Súbela en cada cambio, junto con CACHE en sw.js (mismo número).
const VERSION_APP = { numero: 51, fecha: "13 nov 2026" };

// Ingreso de tipo "cheque" (el pago del trabajo). Los "Otro ingreso" no cuentan como cheque.
// Los ingresos viejos sin tipo se toman como cheque.
const esCheque = m => m.tipo === "ingreso" && m.tipoIngreso !== "otro";

// Pregunta "¿Seguro?" dentro de la app (no usa la ventana del navegador,
// que no funciona en algunos lugares, como las páginas de claude.ai).
// Devuelve una promesa: true si toca "Sí", false si toca "No".
// texto: un texto, o { titulo, filas: [[nombre, monto]], nota } para preguntas con montos (ej.: Apartar)
function preguntar(texto, si = "Sí", no = "No") {
  return new Promise(resolver => {
    const caja = $("pregunta");
    if (texto && typeof texto === "object") {
      $("pregunta-texto").innerHTML = `<span class="pq-titulo">${escapar(texto.titulo || "")}</span>` +
        (texto.filas || []).map(([n, v]) => `<span class="pq-fila"><span>${escapar(n)}</span><b>${escapar(v)}</b></span>`).join("") +
        (texto.nota ? `<span class="pq-nota">${escapar(texto.nota)}</span>` : "");
      $("pregunta-texto").classList.add("pq-con-filas");
    } else {
      $("pregunta-texto").textContent = texto;
      $("pregunta-texto").classList.remove("pq-con-filas");
    }
    $("pregunta-si").textContent = si;
    $("pregunta-no").textContent = no;
    caja.hidden = false;
    $("pregunta-si").focus();
    const cerrar = valor => {
      caja.hidden = true;
      $("pregunta-si").onclick = $("pregunta-no").onclick = null;
      resolver(valor);
    };
    $("pregunta-si").onclick = () => cerrar(true);
    $("pregunta-no").onclick = () => cerrar(false);
  });
}

// ---------- Datos ----------
const Datos = {
  actual: null,

  origen: null, // "propios" (mis-datos.json) o "ejemplo"

  // Devuelve las cifras a usar, o null si es la primera vez en este dispositivo
  base: null,   // mis datos tal como se cargaron (mis-datos.json o los de ejemplo)
  _cache: {},

  cargar() {
    const propios = Almacen.leerDatos();
    if (propios) {
      this.base = propios;
      this.origen = "propios";
    } else if (Almacen.leerConfig().usarEjemplo) {
      if (!window.DATOS_EJEMPLO) throw new Error("No se encontró datos-ejemplo.js.");
      this.base = window.DATOS_EJEMPLO;
      this.origen = "ejemplo";
    }
    if (this.base) { this.recargar(); this.iniciarCargosRenta(); }
    return this.actual;
  },

  // Bloque 17: aplica los cambios de "Datos fijos" que valen en una fecha (desde ≤ fecha)
  enFecha(fecha) {
    const cambios = Almacen.leerCambiosDatos()
      .filter(c => !c.deshecho && c.desde <= fecha && CAMPOS_DATOS.some(x => x.id === c.campo && !x.destino))
      .sort((a, b) => a.creado.localeCompare(b.creado));
    const propios = Almacen.leerPagosPropios().filter(p => ReglasPago.activo(p, fecha)).map(p => ReglasPago.comoGasto(p, fecha));
    const clave = cambios.map(c => c.id).join(",") + "|" + Almacen.leerDeudasPropias().map(d => d.id).join(",") +
      "|" + propios.map(g => `${g.id}:${g.monto}:${g.venceDia}`).join(",");
    if (!this._cache[clave]) {
      const d = JSON.parse(JSON.stringify(this.base));
      cambios.forEach(c => CAMPOS_DATOS.find(x => x.id === c.campo).escribir(d, c.valor));
      this.calcularTransporte(d);
      // Deudas que agregué yo (ej.: un préstamo sin intereses)
      d.deudasAtrasadas = [...(d.deudasAtrasadas || []), ...Almacen.leerDeudasPropias()];
      // Pagos fijos que agregué yo (esenciales y suscripciones activos ese día)
      d.gastosFijos = [...(d.gastosFijos || []), ...propios];
      this._cache[clave] = d;
    }
    return this._cache[clave];
  },

  // Vuelve a armar las cifras de hoy (después de un cambio en "Datos fijos")
  recargar() {
    this._cache = {};
    this.actual = this.enFecha(hoy());
  },

  // Corre fn con las cifras que valen en esa fecha (ej.: la renta de diciembre)
  conFecha(fecha, fn) {
    const antes = this.actual;
    this.actual = this.enFecha(fecha);
    try { return fn(); } finally { this.actual = antes; }
  },

  // Transporte: por día = tren de ida + tren de vuelta + meta del taxi;
  // por semana = por día × días de trabajo. Se calcula de "detalleDia" en mis datos.
  calcularTransporte(datos = this.actual) {
    const t = datos.gastosFijos.find(g => g.id === "transporte");
    if (!t || !t.detalleDia) return;
    const d = t.detalleDia;
    t.porDia = redondear((d.trenIda || 0) + (d.trenVuelta || 0) + (d.taxi || 0));
    t.monto = redondear(t.porDia * (t.diasPorSemana || 4));
  },

  deudas() {
    return this.actual.deudasAtrasadas;
  },

  // ---------- Renta: el saldo de deudaRenta es TODO lo que debo en el portal ----------
  // Cada vencimiento (día 1) se suma la renta del mes a ese saldo, una sola vez por mes,
  // a partir del primer vencimiento después de instalar esta versión (los meses pasados no se tocan).
  claveDe(d) {
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },

  diaRenta(año, mes, datos = this.actual) {
    const g = datos.gastosFijos.find(x => x.id === "renta");
    const dia = (g && g.venceDia) || 1;
    return this.claveDe(new Date(año, mes, Math.min(dia, new Date(año, mes + 1, 0).getDate())));
  },

  iniciarCargosRenta() {
    if (Almacen.leer("rentaCargosDesde")) return;
    const h = new Date();
    let a = h.getFullYear(), m = h.getMonth();
    if (this.diaRenta(a, m) <= hoy()) m++;          // el de este mes ya pasó (o es hoy): ya está en el portal
    const d = new Date(a, m, 1);
    // Es un valor inicial, no un cambio del dueño: no se sella "ahora" (así no le gana al de otro aparato)
    const antes = Almacen.aplicandoSync;
    Almacen.aplicandoSync = true;
    try { Almacen.guardar("rentaCargosDesde", this.diaRenta(d.getFullYear(), d.getMonth())); } finally { Almacen.aplicandoSync = antes; }
  },

  // Cargos de renta [{ fecha, monto }] desde el primer vencimiento nuevo hasta "hasta"
  cargosRenta(hasta = hoy()) {
    const desde = Almacen.leer("rentaCargosDesde");
    if (!desde || desde > hasta || !this.base) return [];
    const lista = [];
    const [a0, m0] = desde.split("-").map(Number);
    for (let i = 0; ; i++) {
      const primero = new Date(a0, m0 - 1 + i, 1);
      if (this.claveDe(primero) > hasta) break;
      const datos = this.enFecha(this.claveDe(primero)); // el monto que vale ese mes (Datos fijos)
      const g = datos.gastosFijos.find(x => x.id === "renta");
      if (!g) continue;
      const fecha = this.diaRenta(primero.getFullYear(), primero.getMonth(), datos);
      if (fecha >= desde && fecha <= hasta) lista.push({ fecha, monto: g.monto });
    }
    return lista;
  },

  // Saldo de una deuda = monto en mis datos - pagos registrados ± ajustes a mano (+ cargos de renta)
  saldoDeuda(deudaId) {
    const deuda = this.deudas().find(d => d.id === deudaId);
    if (!deuda) return 0;
    const cambio = Almacen.leerMovimientos()
      .filter(m => m.deudaId === deudaId)
      .reduce((s, m) => {
        if (m.tipo === "pagoDeuda") return s - m.monto;
        if (m.tipo === "ajuste") return s + m.diferencia;
        return s;
      }, 0);
    const cargos = deudaId === "deudaRenta" ? this.cargosRenta().reduce((s, c) => s + c.monto, 0) : 0;
    return redondear(deuda.monto + cambio + cargos);
  },

  // Saldo que se reparte con lo que sobra: en la renta, solo lo ATRASADO (la renta del mes va en la cuenta)
  saldoReparto(deudaId) {
    return deudaId === "deudaRenta" ? Proyeccion.rentaAtrasada() : this.saldoDeuda(deudaId);
  },

  deudaTotal() {
    return redondear(this.deudas().reduce((s, d) => s + Math.max(0, this.saldoDeuda(d.id)), 0));
  }
};

// ---------- Formularios ----------
const CATEGORIAS = ["Comida", "Transporte", "Teléfono", "Luz", "Internet", "Hijos", "Otros"];

const campoMonto = () => `
  <div class="campo campo-monto">
    <label for="f-monto">Monto</label>
    <div class="monto-caja"><span class="monto-signo" aria-hidden="true">$</span><input id="f-monto" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00"></div>
  </div>`;

const campoFecha = () => `
  <div class="campo">
    <label for="f-fecha">Fecha</label>
    <input id="f-fecha" type="date" value="${hoy()}">
  </div>`;

const Formularios = {
  ingreso: {
    titulo: "Me pagaron",
    campos: () => `
      ` + campoMonto() + `
      <div class="campo">
        <label for="f-tipo-ingreso">Tipo</label>
        <select id="f-tipo-ingreso">
          <option value="cheque">Cheque</option>
          <option value="otro">Otro ingreso</option>
        </select>
      </div>` + campoFecha() + `
      <div class="campo" id="campo-horas">
        <label for="f-horas">Horas trabajadas <span class="opcional">(opcional)</span></label>
        <input id="f-horas" type="number" inputmode="decimal" step="0.5" min="0">
      </div>
      <div class="campo" id="campo-nota-ingreso" hidden>
        <label for="f-nota">Nota <span class="opcional">(opcional)</span></label>
        <input id="f-nota" type="text" maxlength="80">
      </div>`,
    leer(base) {
      // "Otro ingreso": sin horas, con nota. No cuenta como cheque.
      if ($("f-tipo-ingreso").value === "otro") {
        base.tipoIngreso = "otro";
        const nota = $("f-nota").value.trim();
        if (nota) base.nota = nota;
        return base;
      }
      base.tipoIngreso = "cheque";
      const horasTxt = $("f-horas").value.trim();
      if (horasTxt !== "") {
        const horas = Number(horasTxt);
        if (!(horas > 0)) return { error: "Las horas deben ser mayores que 0, o deja el campo vacío." };
        base.horas = horas;
        base.nota = `${horas} horas`;
        // Bloque 7: lo que la app estimaba para esas horas (solo informativo)
        base.estimado = redondear(Jornadas.netoDeHoras(horas));
      }
      return base;
    }
  },

  gasto: {
    titulo: "Gasté",
    campos: () => `
      <p class="ayuda">Las facturas de <strong>este mes</strong> (teléfono, luz, internet) van aquí.
        Lo que debes de meses anteriores va en "Pagué una deuda".</p>` + campoMonto() + `
      <div class="campo">
        <label for="f-categoria">Categoría</label>
        <select id="f-categoria">
          <option value="">Elige una…</option>
          ${CATEGORIAS.map(c => `<option>${c}</option>`).join("")}
        </select>
      </div>
      <div class="campo">
        <label for="f-nota">Nota <span class="opcional">(opcional)</span></label>
        <input id="f-nota" type="text" maxlength="80">
      </div>` + campoFecha() + `<div id="f-efecto" class="f-efecto" hidden></div>`,
    // Antes de guardar: cuánto le agrega este gasto a lo que falta (solo un gasto nuevo; no "Ya lo pagué" / "Ya lo compré")
    alCambiar() {
      clearTimeout(this._t);
      this._t = setTimeout(() => {
        const caja = $("f-efecto");
        if (!caja) return;
        const monto = Number($("f-monto").value), fecha = $("f-fecha").value;
        const factura = Plan.CATEGORIAS_SERVICIOS.includes($("f-categoria").value);
        if (formularioExtra || !(monto > 0) || !fecha || factura) { caja.hidden = true; return; }
        const e = Planeados.efectoRapido(monto, fecha);
        const vig = typeof Vigilante !== "undefined"
          ? Vigilante.previa({ tipo: "gasto", monto, fecha, categoria: $("f-categoria").value, nota: $("f-nota").value }) : "";
        caja.hidden = false;
        caja.className = "f-efecto " + (e.agrega > 0 || vig ? "negativo" : "positivo");
        caja.innerHTML = (vig ? vig + "<br>" : "") + (e.agrega > 0
          ? `Con este gasto, el ${Futuro.dia(e.diaAgrega)} te faltan <strong>${dinero(e.agrega)}</strong> más para tus pagos.
             <button type="button" class="enlace f-efecto-boton" data-ver-gasto>Ver qué hacer</button>`
          : `Con lo que ya tienes previsto, este gasto no deja ningún día sin dinero.
             <button type="button" class="enlace f-efecto-boton" data-ver-gasto>Ver detalle</button>`);
      }, 300);
    },
    leer(base) {
      const categoria = $("f-categoria").value;
      if (!categoria) return { error: "Elige una categoría." };
      base.categoria = categoria;
      const nota = $("f-nota").value.trim();
      if (nota) base.nota = nota;
      return base;
    }
  },

  pagoDeuda: {
    titulo: "Pagué una deuda",
    campos: () => `
      <p class="ayuda">Aquí va lo que debes de <strong>meses anteriores</strong>.
        Las facturas de este mes (teléfono, luz, internet) van en "Gasté".</p>
      ` + campoMonto() + `
      <div class="campo">
        <label for="f-deuda">¿A cuál deuda?</label>
        <select id="f-deuda">
          <option value="">Elige una…</option>
          ${Datos.deudas().map(d =>
            `<option value="${d.id}">${escapar(d.nombre)} (debes ${dinero(Datos.saldoDeuda(d.id))})</option>`
          ).join("")}
        </select>
      </div>
      <div class="campo" id="campo-renta-para" hidden>
        <label for="f-renta-para">¿Para qué es?</label>
        <select id="f-renta-para">
          <option value="">Elige…</option>
          ${Proyeccion.rentaMeses(hoy(), Jornadas.sumarDias(hoy(), 62)).filter(c => c.pendiente > 0.005).slice(0, 2).map(c => {
            const mes = Jornadas.aFecha(c.fecha).toLocaleDateString("es", { month: "long" });
            return `<option value="${c.fecha}">Renta de ${mes} (vence el ${fechaCorta(c.fecha)})</option>`;
          }).join("")}
          <option value="atrasada">Renta atrasada (lo que ya debías)</option>
        </select>
      </div>` + campoFecha(),
    // La renta: hay que saber si es la del mes que viene o lo atrasado (con "Ya lo pagué" ya se sabe)
    alCambiar() {
      $("campo-renta-para").hidden = $("f-deuda").value !== Plan.ID_DEUDA_RENTA || !!(formularioExtra && formularioExtra.vencimiento);
    },
    leer(base) {
      const deudaId = $("f-deuda").value;
      if (!deudaId) return { error: "Elige a cuál deuda le pagaste." };
      if (deudaId === Plan.ID_DEUDA_RENTA && !$("campo-renta-para").hidden) {
        if (!$("f-renta-para").value) return { error: "Elige para qué es: la renta del mes que viene o la renta atrasada." };
        base.rentaMes = $("f-renta-para").value;
      }
      const saldo = Datos.saldoDeuda(deudaId);
      if (base.monto > saldo) {
        return { error: `El monto es mayor que lo que debes en esa deuda (${dinero(saldo)}).` };
      }
      base.deudaId = deudaId;
      base.nota = Datos.deudas().find(d => d.id === deudaId).nombre;
      return base;
    }
  },

  // "Planear pagos" de una deuda: lo que decidas pagar (cada semana o una vez) entra en tus cuentas
  planDeuda: {
    titulo: "Planear pagos",
    campos: () => `
      <p class="ayuda">Solo planea: no registra ningún pago. Cuando pagues, usa "Ya lo pagué".</p>
      <div class="campo">
        <label for="f-deuda">Deuda</label>
        <select id="f-deuda">${Datos.deudas().map(d => `<option value="${d.id}">${escapar(d.nombre)} (debes ${dinero(Datos.saldoReparto(d.id))})</option>`).join("")}</select>
      </div>
      <div class="campo">
        <label for="f-frecuencia">¿Cómo?</label>
        <select id="f-frecuencia"><option value="semanal">Cada semana</option><option value="una">Una sola vez</option></select>
      </div>` + campoMonto() + `
      <div class="ps-dos">
        <div class="campo"><label for="f-desde">Desde</label><input id="f-desde" type="date" value="${Proyeccion.metaRenta(Jornadas.sumarDias(hoy(), 7))}"></div>
        <div class="campo" id="campo-hasta"><label for="f-hasta">Hasta</label><input id="f-hasta" type="date"></div>
      </div>`,
    alCambiar() { $("campo-hasta").hidden = $("f-frecuencia").value === "una"; },
    guardar(error) {
      const monto = redondear(Number($("f-monto").value));
      const frecuencia = $("f-frecuencia").value, desde = $("f-desde").value, hasta = frecuencia === "una" ? desde : $("f-hasta").value;
      if (!(monto > 0)) return error("El monto tiene que ser mayor que 0.");
      if (!desde) return error("Elige desde qué fecha.");
      if (frecuencia === "semanal" && !hasta) return error("Elige hasta qué fecha.");
      if (hasta < desde) return error("La fecha final tiene que ser después de la inicial.");
      Almacen.guardarPlanDeuda({ deudaId: $("f-deuda").value, monto, frecuencia, desde, hasta });
      cerrarFormulario();
      Pantalla.aviso("Plan de pagos guardado");
      window.dispatchEvent(new Event("movimientos-cambiaron"));
    }
  },

  // Botón rápido "Transporte": un gasto de Transporte con montos de un toque
  transporte: {
    titulo: "Transporte",
    campos: () => {
      const t = Transporte.resumen();
      return `
        <div class="ayuda transporte-info">
          <div>Hoy llevas: <strong>${dinero(t.hoy)}</strong></div>
          <div>Esta semana: <strong>${dinero(t.semana)}</strong> de ${dinero(t.semanal)}</div>
          ${t.hoy > t.porDia + 0.005 ? `<div class="transporte-alerta">⚠ Hoy ya pasaste de ${dinero(t.porDia)}</div>` : ""}
        </div>` + campoMonto() + `
        <div class="montos-rapidos">
          ${Transporte.montosRapidos().map(m =>
            `<button type="button" class="boton-chico" data-llenar-monto="${m.monto}" aria-pressed="false">${dinero(m.monto)}<small>${escapar(m.nombre)}</small></button>`
          ).join("")}
        </div>` + campoFecha() + (t.ultimoHoy
          ? `<button type="button" id="deshacer-transporte" class="boton-chico boton-borrar">Deshacer el último (${dinero(t.ultimoHoy.monto)})</button>` : "");
    },
    leer(base) {
      base.tipo = "gasto";
      base.categoria = "Transporte";
      return base;
    },
    avisoDespues(mov) {
      return `Guardado: ${dinero(mov.monto)}. Hoy llevas ${dinero(Transporte.resumen().hoy)} en transporte.`;
    }
  },

  // Bloque 4: corregir el saldo de una deuda a mano
  ajuste: {
    titulo: "Ajustar saldo",
    permiteCero: true,
    campos: () => `
      <div class="campo">
        <label for="f-deuda">Deuda</label>
        <select id="f-deuda">
          ${Datos.deudas().map(d =>
            `<option value="${d.id}">${escapar(d.nombre)} (ahora ${dinero(Datos.saldoDeuda(d.id))})</option>`
          ).join("")}
        </select>
      </div>
      <div class="campo">
        <label for="f-monto">Saldo real</label>
        <input id="f-monto" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00">
      </div>` + campoFecha(),
    leer(base) {
      const deudaId = $("f-deuda").value;
      const diferencia = redondear(base.monto - Datos.saldoDeuda(deudaId));
      if (diferencia === 0) return { error: "Ese ya es el saldo que tienes registrado." };
      base.deudaId = deudaId;
      base.saldoNuevo = base.monto;
      base.diferencia = diferencia;
      base.nota = Datos.deudas().find(d => d.id === deudaId).nombre;
      return base;
    }
  }
};

let formularioAbierto = null;
let formularioExtra = null; // datos extra para el movimiento (ej.: qué vencimiento se pagó)

// "valores" (opcional) rellena el formulario, ej.: { deudaId: "deudaLuz", monto: 100 }
function abrirFormulario(tipo, valores = {}) {
  formularioAbierto = tipo;
  formularioExtra = valores.extra || null;
  // Lo que un formulario puso debajo de Guardar (ej.: Pausar en Pagos fijos) no se queda para el siguiente
  document.querySelectorAll("#formulario .fuera-del-form").forEach(x => x.remove());
  $("cancelar").textContent = "Cancelar";
  $("aviso").hidden = true; // el aviso de lo anterior no tapa el formulario nuevo
  $("formulario").querySelector("button[type=submit]").textContent = "Guardar";
  const f = Formularios[tipo];
  $("form-titulo").textContent = f.titulo;
  $("formulario").dataset.tipo = tipo;
  $("form-titulo").dataset.ceja = { gasto: "Nuevo gasto", ingreso: "Nuevo ingreso", pagoDeuda: "Pago de deuda", transporte: "Nuevo gasto", jornada: "Tu jornada", corregirDinero: "Tu dinero", ajuste: "Mis deudas", planDeuda: "Mis deudas" }[tipo] || "Registrar";
  $("form-campos").innerHTML = f.campos();
  if (valores.deudaId && $("f-deuda")) $("f-deuda").value = valores.deudaId;
  if (valores.categoria && $("f-categoria")) {
    // Categoría que no está en la lista (ej.: "Navidad / Fiestas" de un gasto planeado)
    if (![...$("f-categoria").options].some(o => o.value === valores.categoria)) {
      $("f-categoria").insertAdjacentHTML("beforeend", `<option>${escapar(valores.categoria)}</option>`);
    }
    $("f-categoria").value = valores.categoria;
  }
  if (valores.nota && $("f-nota")) $("f-nota").value = valores.nota;
  if (valores.monto != null) $("f-monto").value = redondear(valores.monto).toFixed(2);
  if (valores.fecha && $("f-fecha")) $("f-fecha").value = valores.fecha;
  if (valores.horas != null && $("f-horas")) $("f-horas").value = valores.horas;
  if (valores.selector) ponerSelectorDeTipo(tipo);
  if (tipo === "gasto") ponerChipsDeCategoria();
  if (f.alCambiar) f.alCambiar();
  $("form-error").textContent = "";
  ponerTextoGuardar();
  $("ventana").hidden = false;
  document.body.style.overflow = "hidden";
}

function limpiarErrorForm() {
  $("form-error").textContent = "";
  document.querySelectorAll("#form-campos .con-error").forEach(x => x.classList.remove("con-error"));
  document.querySelectorAll("#form-campos .campo-error").forEach(x => x.remove());
}

// "Guardar $5.00" (y "Guardar $12.00 en Transporte"): el botón dice lo que va a guardar
function ponerTextoGuardar() {
  const b = $("formulario").querySelector("button[type=submit]");
  const m = $("f-monto") ? Number($("f-monto").value) : NaN;
  if (!["gasto", "transporte"].includes(formularioAbierto) || !(m > 0)) { b.textContent = "Guardar"; return; }
  const cat = formularioAbierto === "gasto" && $("f-categoria") ? $("f-categoria").value : "";
  b.textContent = `Guardar ${dinero(m)}${cat ? ` en ${cat}` : ""}`;
}

// Cambiar entre Gasté · Me pagaron · Pagué una deuda sin volver atrás (conserva el monto que ya escribiste)
const TIPOS_DINERO = [["gasto", "Gasté"], ["ingreso", "Me pagaron"], ["pagoDeuda", "Deuda"]];
function ponerSelectorDeTipo(tipo) {
  if (!TIPOS_DINERO.some(t => t[0] === tipo)) return;
  $("form-campos").insertAdjacentHTML("afterbegin",
    `<div class="chips chips-tipo" role="group" aria-label="Qué vas a registrar">${TIPOS_DINERO.map(([id, txt]) =>
      `<button type="button" class="chip" data-tipo-form="${id}" aria-pressed="${id === tipo}">${txt}</button>`).join("")}</div>`);
}

// Categorías de un gasto como chips (la lista de siempre queda escondida y es la que se guarda)
function ponerChipsDeCategoria() {
  const sel = $("f-categoria");
  if (!sel || (sel.value && !CATEGORIAS.includes(sel.value))) return; // categoría especial (ej.: Navidad): se queda la lista
  const campo = sel.closest(".campo");
  campo.hidden = true;
  campo.insertAdjacentHTML("afterend",
    `<div class="chips chips-categoria" role="group" aria-label="Categoría">${CATEGORIAS.map(c =>
      `<button type="button" class="chip" data-categoria="${c}" aria-pressed="${sel.value === c}">${c}</button>`).join("")}</div>`);
}

function cerrarFormulario() {
  $("ventana").hidden = true;
  formularioAbierto = null;
  document.body.style.overflow = "";
}

async function guardarFormulario(evento) {
  evento.preventDefault();
  const f = Formularios[formularioAbierto];
  // El error va junto al campo que hay que corregir (y se borra solo al corregirlo: limpiarErrorForm)
  const mostrarError = msg => {
    limpiarErrorForm();
    const junto = /categor/i.test(msg) ? document.querySelector("#form-campos .chips-categoria")
      : /monto/i.test(msg) && $("f-monto") ? $("f-monto").closest(".campo") : null;
    if (!junto) { $("form-error").textContent = msg; return; }
    junto.classList.add("con-error");
    junto.insertAdjacentHTML("afterend", `<p class="error campo-error" role="alert">${escapar(msg)}</p>`);
    const foco = junto.querySelector("input, button");
    if (foco) foco.focus({ preventScroll: false });
  };
  // Formularios que no son de dinero (ej.: jornadas) se guardan a su manera
  if (f.guardar) return f.guardar(mostrarError);

  const montoTxt = $("f-monto").value.trim();
  const monto = redondear(Number(montoTxt));
  if (montoTxt === "") return mostrarError("Escribe el monto.");
  if (f.permiteCero) {
    if (!(monto >= 0)) return mostrarError("El saldo no puede ser negativo.");
  } else if (!(monto > 0)) return mostrarError("El monto debe ser mayor que 0.");

  const fecha = $("f-fecha").value;
  if (!fecha) return mostrarError("Elige la fecha.");

  const mov = f.leer({ tipo: formularioAbierto, monto, fecha });
  if (mov.error) return mostrarError(mov.error);

  if (formularioExtra) Object.assign(mov, formularioExtra);
  // ¿Ya estaba dentro de lo que contaste al corregir tu dinero? Así no se cuenta dos veces.
  const inicial = ["ingreso", "gasto", "pagoDeuda"].includes(mov.tipo) && Dinero.podriaEstarIncluido(mov.fecha);
  const textoInicial = inicial ? (() => {
    const cuando = new Date(inicial.momento).toLocaleString("es", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
    return `Corregiste tu dinero el ${cuando} a ${dinero(inicial.monto)}.\n` +
      `Este ${{ ingreso: "ingreso", gasto: "gasto", pagoDeuda: "pago" }[mov.tipo]} es del ${fechaCorta(mov.fecha)}: ¿ya estaba incluido en ese número?\n` +
      "Si sí, se guarda en tu historial pero no se vuelve a contar en tu dinero.";
  })() : "";
  // Tu consejero: si el gasto se pasa de una regla, pide la razón (y la pregunta de arriba va en el mismo paso)
  const rotas = typeof Vigilante !== "undefined" && mov.tipo === "gasto" ? Vigilante.revisar(mov) : [];
  if (rotas.length) {
    const r = await Vigilante.preguntar(rotas, inicial ? { texto: textoInicial } : null);
    if (!r) return; // "Volver": el formulario sigue abierto
    mov.razonFueraPlan = r.razon;
    mov.reglasFueraPlan = rotas.map(x => x.regla.id || x.regla.nombre);
    if (r.incluido) mov.incluidoEnCorreccion = true;
  } else if (inicial) {
    const incluido = await preguntar(textoInicial, "Sí, ya estaba incluido", "No, fue después");
    if (incluido) mov.incluidoEnCorreccion = true;
  }
  if (!registrarMovimiento(mov)) {
    return mostrarError("No se pudo guardar en este dispositivo.");
  }
  cerrarFormulario();
  if (f.avisoDespues) Pantalla.aviso(f.avisoDespues(mov), 4000);
}

// Guarda un movimiento ya validado (lo usan el formulario y los registros rápidos)
function registrarMovimiento(mov) {
  // Pago a la renta: se descuenta del sobre de Renta (Bloque 3)
  const descuentoRenta = Plan.cuantoDescontarDeRenta(mov);
  if (descuentoRenta > 0) mov.descontadoSobreRenta = descuentoRenta;
  // Gasto en teléfono, luz o internet: se descuenta del sobre de Servicios (Bloque 5)
  const descuentoServicios = Plan.cuantoDescontarDeServicios(mov);
  if (descuentoServicios > 0) mov.descontadoSobreServicios = descuentoServicios;

  if (!Almacen.agregarMovimiento(mov)) return false;
  Plan.moverSobreRenta(-descuentoRenta);
  Plan.moverSobreServicios(-descuentoServicios);
  Pantalla.actualizar();
  if (mov.estimado != null) Pantalla.aviso(textoComparacion(mov), 6000);
  else Pantalla.aviso(textoGuardado(mov), 5000, { texto: "Deshacer", fn: () => deshacerMovimiento(mov.id) });
  avisarCambioMovimientos();
  return true;
}

// "Guardado: $12 en Transporte" — dice qué se guardó
function textoGuardado(mov) {
  const m = dineroCorto(mov.monto);
  if (mov.tipo === "gasto") return `Guardado: ${m} en ${mov.categoria || "gastos"}`;
  if (mov.tipo === "ingreso") return `Guardado: te pagaron ${m}`;
  if (mov.tipo === "pagoDeuda") {
    const d = Datos.deudas().find(x => x.id === mov.deudaId);
    return `Guardado: ${m} a ${d ? d.nombre : "la deuda"}`;
  }
  return "Guardado";
}

// "Deshacer" del aviso: borra el movimiento recién guardado sin preguntar (y devuelve lo que salió de los sobres)
function deshacerMovimiento(id) {
  const mov = Almacen.leerMovimientos().find(m => m.id === id);
  if (!mov) return;
  Almacen.borrarMovimiento(id);
  Plan.moverSobreRenta(mov.descontadoSobreRenta || 0);
  Plan.moverSobreServicios(mov.descontadoSobreServicios || 0);
  Pantalla.actualizar();
  Pantalla.aviso("Listo: no se guardó");
  avisarCambioMovimientos();
}

// "Estimé $X, te llegaron $Y, diferencia $Z" (Bloque 7)
function textoComparacion(mov) {
  const dif = redondear(mov.monto - mov.estimado);
  const signo = dif > 0 ? "+" : dif < 0 ? "−" : "";
  return `Estimé ${dinero(mov.estimado)}, te llegaron ${dinero(mov.monto)}, diferencia ${signo}${dinero(Math.abs(dif))}`;
}

// Avisa a otras pantallas (ej.: Mis deudas) que los movimientos cambiaron
function avisarCambioMovimientos() {
  window.dispatchEvent(new Event("movimientos-cambiaron"));
}

// ---------- Dinero que tengo (arriba a la derecha) ----------
// Dinero inicial + ingresos − gastos − pagos de deuda registrados desde ese momento.
// Los ajustes de saldo y las jornadas no cuentan.
const Dinero = {
  actual() {
    const inicial = Almacen.leerDineroInicial(); // { monto, fecha, momento } o null
    const desde = inicial ? inicial.momento : "";
    return redondear(Almacen.leerMovimientos()
      .filter(m => (!desde || m.creado > desde) && !m.incluidoEnCorreccion)
      .reduce((s, m) => {
        if (m.tipo === "ingreso") return s + m.monto;
        if (m.tipo === "gasto" || m.tipo === "pagoDeuda") return s - m.monto;
        return s;
      }, inicial ? Number(inicial.monto) || 0 : 0));
  },

  // La cuenta paso a paso: la última corrección y cada movimiento que cuenta desde entonces
  pasoAPaso() {
    const inicial = Almacen.leerDineroInicial();
    const desde = inicial ? inicial.momento : "";
    const movs = Almacen.leerMovimientos()
      .filter(m => (!desde || m.creado > desde) && !m.incluidoEnCorreccion && ["ingreso", "gasto", "pagoDeuda"].includes(m.tipo))
      .sort((a, b) => a.creado.localeCompare(b.creado));
    return { inicial, movs, total: this.actual() };
  },

  // ¿Un movimiento con esta fecha pudo estar ya incluido en la última corrección?
  // Sí si es de antes del día en que corregiste, o del mismo día pero lo registras un día después.
  podriaEstarIncluido(fecha) {
    const inicial = Almacen.leerDineroInicial();
    if (!inicial || !fecha) return null;
    if (fecha < inicial.fecha || (fecha === inicial.fecha && hoy() > inicial.fecha)) return inicial;
    return null;
  },

  // Valor escrito a mano en ¿Me alcanza?: vale solo hoy y hasta el siguiente movimiento
  manualVigente() {
    const l = Almacen.leerLineaTiempo();
    if (!l || l.dineroHoy == null || !l.momento) return null;
    const d = new Date(l.momento);
    const p = n => String(n).padStart(2, "0");
    const dia = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    if (dia !== hoy()) return null;
    if (Almacen.leerMovimientos().some(m => m.creado > l.momento)) return null;
    return l.dineroHoy;
  },

  mostrar() {
    const n = this.actual();
    const b = $("dinero-tengo");
    b.innerHTML = `<span class="dinero-etiqueta">Tengo</span><span class="dinero-cifra">${n < 0 ? "−" + dinero(-n) : dinero(n)}</span>`;
    b.classList.toggle("positivo", n > 0);
    b.classList.toggle("negativo", n < 0);
  }
};

// Formulario "Corregir mi dinero"
Formularios.corregirDinero = {
  titulo: "Corregir mi dinero",
  campos: () => `
    <p class="ayuda">Escribe cuánto tienes realmente hoy (efectivo + cuenta). Desde ahora se cuenta a partir de ese número.</p>
    <div class="campo">
      <label for="f-monto">Dinero que tengo hoy</label>
      <input id="f-monto" type="number" inputmode="decimal" step="0.01" placeholder="0.00">
    </div>`,
  async guardar(mostrarError) {
    const txt = $("f-monto").value.trim();
    const monto = redondear(Number(txt));
    if (txt === "" || !isFinite(monto)) return mostrarError("Escribe cuánto dinero tienes hoy.");
    const ok = await preguntar(
      `¿Guardar ${dinero(monto)} como tu dinero de hoy?\nLos movimientos anteriores ya no cuentan para este número (no se borran).`,
      "Sí, guardar");
    if (!ok) return;
    if (!Almacen.guardarDineroInicial({ monto, fecha: hoy(), momento: Almacen.ahora() })) {
      return mostrarError("No se pudo guardar en este dispositivo.");
    }
    cerrarFormulario();
    Pantalla.actualizar();
    Pantalla.aviso(`Guardado: tienes ${dinero(monto)}`);
    avisarCambioMovimientos();
  }
};

// ---------- Pantalla ----------
const NOMBRES_TIPO = { ingreso: "Ingreso", gasto: "Gasto", pagoDeuda: "Pago de deuda", ajuste: "Ajuste de saldo" };

const Pantalla = {
  actualizar() {
    $("deuda-total").textContent = dinero(Datos.deudaTotal());
    Dinero.mostrar();
    if (typeof Inicio !== "undefined") Inicio.mostrar(); // resumen de la semana (nav.js)

    // Lunes a viernes, si no hay movimientos con fecha de hoy
    const diaSemana = new Date().getDay();
    const nadaHoy = !Almacen.leerMovimientos().some(m => m.fecha === hoy());
    $("aviso-hoy").hidden = !(diaSemana >= 1 && diaSemana <= 5 && nadaHoy);

    const ultimos = Almacen.leerMovimientos()
      .slice()
      .sort((a, b) => (b.fecha + b.creado).localeCompare(a.fecha + a.creado))
      .slice(0, 10);

    $("movimientos").innerHTML = ultimos.length === 0
      ? `<p class="vacio">Todavía no hay movimientos.</p>`
      : ultimos.map(m => {
          const esIngreso = m.tipo === "ingreso";
          const esAjuste = m.tipo === "ajuste";
          const esOtro = esIngreso && !esCheque(m);
          const titulo = m.tipo === "gasto" ? `Gasto · ${m.categoria}` : esOtro ? "Otro ingreso" : NOMBRES_TIPO[m.tipo];
          const detalle = [fechaCorta(m.fecha), m.nota, m.estimado != null && !esOtro ? textoComparacion(m) : ""]
            .filter(Boolean).map(escapar).join(" · ");
          return `
            <li>
              <div class="mov-info">
                <div class="mov-tipo">${escapar(titulo)}</div>
                <div class="mov-detalle">${detalle}</div>
                ${esIngreso ? `<button class="enlace cambiar-tipo" data-cambiar-tipo="${m.id}">${esOtro ? "Cambiar a Cheque" : "Cambiar a Otro ingreso"}</button>` : ""}
              </div>
              <span class="mov-monto ${esAjuste ? "neutro" : esIngreso ? "positivo" : "negativo"}">
                ${esAjuste ? "Saldo: " : esIngreso ? "+" : "−"}${dinero(m.monto)}
              </span>
              <button class="borrar" data-borrar="${m.id}" aria-label="Borrar">✕</button>
            </li>`;
        }).join("");
  },

  // Aviso oscuro sobre la barra: dice qué pasó y, si se puede, trae "Deshacer" (accion = { texto, fn })
  aviso(texto, duracion = 2500, accion = null) {
    const el = $("aviso"), t = $("aviso-texto"), b = $("aviso-accion");
    // Primero se muestra y después se pone el texto: así VoiceOver lo anuncia
    el.hidden = false;
    t.textContent = "";
    requestAnimationFrame(() => { t.textContent = texto; });
    b.hidden = !accion;
    b.onclick = null;
    if (accion) {
      b.textContent = accion.texto || "Deshacer";
      b.onclick = () => { el.hidden = true; clearTimeout(this._t); accion.fn(); };
    }
    clearTimeout(this._t);
    this._t = setTimeout(() => { el.hidden = true; }, accion ? Math.max(duracion, 5000) : duracion);
  },

  mostrarError(mensaje) {
    $("estado-carga").innerHTML = `<span class="error">✗ No se pudieron cargar los datos.</span> ${escapar(mensaje)}`;
    document.querySelectorAll(".botones button").forEach(b => { b.disabled = true; });
  }
};

async function borrarMovimiento(id) {
  const mov = Almacen.leerMovimientos().find(m => m.id === id);
  if (!mov) return;
  const texto = `¿Borrar este movimiento?\n${NOMBRES_TIPO[mov.tipo]} de ${dinero(mov.monto)} (${fechaCorta(mov.fecha)})`;
  if (!(await preguntar(texto, "Sí, borrar"))) return;
  Almacen.borrarMovimiento(id);
  // Si ese pago había salido del sobre de Renta, vuelve al sobre
  Plan.moverSobreRenta(mov.descontadoSobreRenta || 0);
  Plan.moverSobreServicios(mov.descontadoSobreServicios || 0);
  Pantalla.actualizar();
  Pantalla.aviso("Borrado");
  avisarCambioMovimientos();
}

// Cambia un ingreso entre "Cheque" y "Otro ingreso" (no cambia el monto ni la fecha)
function cambiarTipoIngreso(id) {
  const mov = Almacen.leerMovimientos().find(m => m.id === id);
  if (!mov || mov.tipo !== "ingreso") return;
  const nuevo = esCheque(mov) ? "otro" : "cheque";
  Almacen.actualizarMovimiento(id, { tipoIngreso: nuevo });
  Pantalla.actualizar();
  Pantalla.aviso(nuevo === "otro" ? "Ahora es Otro ingreso" : "Ahora es Cheque");
  avisarCambioMovimientos();
}

// ---------- Registros rápidos (Bloque 5) ----------
function costoTransporteDia() {
  return Datos.actual.gastosFijos.find(g => g.id === "transporte").porDia;
}

// Botón "Transporte": cuánto llevas hoy y esta semana, montos rápidos y deshacer
const Transporte = {
  gasto() {
    return Datos.actual.gastosFijos.find(g => g.id === "transporte");
  },

  // Montos de un toque (de mis datos); si no están, tren, taxi y día completo
  montosRapidos() {
    const g = this.gasto();
    if (Array.isArray(g.montosRapidos) && g.montosRapidos.length) return g.montosRapidos;
    // Un solo botón rápido: el tren. El taxi varía y se escribe a mano.
    const d = g.detalleDia || {};
    return d.trenIda ? [{ nombre: "Tren", monto: d.trenIda }] : [];
  },

  resumen() {
    const g = this.gasto();
    const hoyClave = hoy();
    const lunes = Plan.claveSemana();
    const [a, m, d] = lunes.split("-").map(Number);
    const dom = new Date(a, m - 1, d + 6);
    const p = n => String(n).padStart(2, "0");
    const domingo = `${dom.getFullYear()}-${p(dom.getMonth() + 1)}-${p(dom.getDate())}`;
    const lista = Almacen.leerMovimientos().filter(x => x.tipo === "gasto" && x.categoria === "Transporte");
    const deHoy = lista.filter(x => x.fecha === hoyClave).sort((x, y) => x.creado.localeCompare(y.creado));
    return {
      hoy: redondear(deHoy.reduce((s, x) => s + x.monto, 0)),
      semana: redondear(lista.filter(x => x.fecha >= lunes && x.fecha <= domingo).reduce((s, x) => s + x.monto, 0)),
      semanal: g.monto,
      porDia: g.porDia,
      ultimoHoy: deHoy[deHoy.length - 1] || null
    };
  },

  // Borra el último gasto de transporte de hoy (con la misma función y pregunta que la ✕)
  async deshacerUltimo() {
    const ultimo = this.resumen().ultimoHoy;
    if (!ultimo) return;
    await borrarMovimiento(ultimo.id);
    if (!$("ventana").hidden && formularioAbierto === "transporte") abrirFormulario("transporte");
  }
};

// ---------- Instalar en el celular (solo cuando se abre desde una dirección web) ----------
function prepararInstalacion() {
  if (!/^https?:$/.test(location.protocol)) return; // abierto como archivo: no aplica
  if (window.MI_DINERO_SIN_INSTALAR) return;         // copia publicada en claude.ai: no se instala
  const enlace = document.createElement("link");
  enlace.rel = "manifest";
  enlace.href = "manifest.json";
  document.head.appendChild(enlace);
  if ("serviceWorker" in navigator) {
    // updateViaCache "none": siempre revisa si hay sw.js nuevo; update(): lo revisa en cada apertura
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })
      .then(reg => reg.update())
      .catch(() => {});
  }
}
prepararInstalacion();

// ---------- Arranque ----------
try {
  // Primera vez en este dispositivo: respaldo.js muestra "Primera vez: cargar mis datos"
  if (!Datos.cargar()) throw "primera-vez";
  document.querySelectorAll("[data-form]").forEach(b =>
    b.addEventListener("click", () => abrirFormulario(b.dataset.form)));
  $("formulario").addEventListener("submit", guardarFormulario);
  // Tecla Esc (en el computador): cierra la ventana que esté encima
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    const abierto = id => $(id) && !$(id).hidden;
    if (abierto("vigilante")) $("vg-volver").click();
    else if (abierto("pregunta")) $("pregunta-no").click();
    else if (abierto("ventana")) cerrarFormulario();
    else if (abierto("hoja") && typeof Nav !== "undefined") Nav.cerrarHoja();
    else if (abierto("fu-dia")) $("fu-dia").hidden = true;
    else return;
    e.preventDefault();
  });
  $("cancelar").addEventListener("click", cerrarFormulario);
  $("movimientos").addEventListener("click", e => {
    const b = e.target.closest("[data-borrar]");
    if (b) borrarMovimiento(b.dataset.borrar);
    const c = e.target.closest("[data-cambiar-tipo]");
    if (c) cambiarTipoIngreso(c.dataset.cambiarTipo);
  });
  // "Me pagaron": con "Otro ingreso" se ocultan las horas y se muestra la nota
  $("form-campos").addEventListener("input", () => { limpiarErrorForm(); ponerTextoGuardar(); });
  $("form-campos").addEventListener("click", e => { if (e.target.closest("[data-categoria]")) limpiarErrorForm(); });
  $("form-campos").addEventListener("change", () => ponerTextoGuardar());
  $("form-campos").addEventListener("input", e => {
    const f = Formularios[formularioAbierto];
    if (f && f.alCambiar && (e.target.id === "f-monto" || (formularioAbierto === "gasto" && e.target.id === "f-nota"))) f.alCambiar(e);
  });
  $("form-campos").addEventListener("change", e => {
    const f = Formularios[formularioAbierto];
    if (f && f.alCambiar) f.alCambiar(e);
    if (e.target.id !== "f-tipo-ingreso") return;
    const otro = e.target.value === "otro";
    $("campo-horas").hidden = otro;
    $("campo-nota-ingreso").hidden = !otro;
  });
  $("version-app").textContent = `Versión ${VERSION_APP.numero} · ${VERSION_APP.fecha}`;
  $("rapido-transporte").addEventListener("click", () => abrirFormulario("transporte"));
  $("dinero-tengo").addEventListener("click", () => abrirFormulario("corregirDinero", { monto: Dinero.actual() }));
  $("form-campos").addEventListener("click", e => {
    const t = e.target.closest("[data-tipo-form]");
    if (t && t.dataset.tipoForm !== formularioAbierto) {
      const m = $("f-monto") ? $("f-monto").value.trim() : "";
      return abrirFormulario(t.dataset.tipoForm, { selector: true, monto: m !== "" && Number(m) >= 0 ? Number(m) : undefined });
    }
    const c = e.target.closest("[data-categoria]");
    if (c) {
      $("f-categoria").value = c.dataset.categoria;
      $("f-categoria").dispatchEvent(new Event("change", { bubbles: true }));
      ponerTextoGuardar();
      document.querySelectorAll("[data-categoria]").forEach(x => x.setAttribute("aria-pressed", x === c));
    }
    const b = e.target.closest("[data-llenar-monto]");
    // Monto de un toque: se llena y se marca elegido, SIN abrir el teclado (así Guardar queda a la vista)
    if (b) {
      $("f-monto").value = Number(b.dataset.llenarMonto).toFixed(2);
      document.querySelectorAll("[data-llenar-monto]").forEach(x => x.setAttribute("aria-pressed", x === b));
      ponerTextoGuardar();
    }
    if (e.target.closest("#deshacer-transporte")) Transporte.deshacerUltimo();
    if (e.target.closest("[data-ver-gasto]")) {
      const monto = Number($("f-monto").value), fecha = $("f-fecha").value;
      const pantalla = [...document.querySelectorAll("main.contenedor")].find(x => !x.hidden);
      cerrarFormulario();
      document.querySelectorAll("main.contenedor").forEach(x => { x.hidden = true; });
      Planeados.abrirTemporal(monto, fecha < hoy() ? hoy() : fecha, pantalla ? pantalla.id : "pantalla-inicio");
    }
  });
  $("rapido-transporte").textContent = "Transporte";
  Pantalla.actualizar();
} catch (e) {
  if (e !== "primera-vez") Pantalla.mostrarError(e.message);
}
