/*
 * AVISOS Y CAMPANA 🔔
 * Afuera (en el inicio) solo lo que tienes que saber sí o sí:
 *   el faltante más cercano · la renta si NO se cubre · pagos que vencen hoy o mañana ·
 *   acción legal del día 15 (3 días o menos) · sincronización rota.
 * Todo lo demás va a la campana. "Entendido" lo quita hasta que la situación cambie.
 * Los avisos de afuera no se pueden quitar mientras sigan pasando.
 */
const Avisos = {
  vistos() { return Almacen.leer("avisosVistos") || {}; },

  entendido(id, firma) {
    const v = this.vistos();
    v[id] = firma;
    Almacen.guardar("avisosVistos", v);
    this.mostrar();
  },

  calcular() {
    const afuera = [], campana = [];
    const esc = Futuro.estado().escenario;
    const pr = Proyeccion.calcular({ chequeEscenario: Escenarios.config()[esc], horizonte: 92 });
    const hoyClave = hoy(), manana = Jornadas.sumarDias(hoyClave, 1);
    const dia = f => Jornadas.textoDia(f).toLowerCase();

    // 1) El faltante más cercano
    const f = Proyeccion.faltante(pr);
    if (f) afuera.push({ id: "faltante", clase: "rojo", texto: Proyeccion.textoFaltante(f), acciones: [["¿Cómo lo cubro?", "cubrir"]] });

    // 2) La renta del mes
    const r = Proyeccion.estadoRenta(pr);
    if (r && r.falta > 0.005) {
      if (!f || f.fecha !== r.fecha) afuera.push({ id: "renta", clase: "rojo",
        texto: `${r.nombre}: faltan ${dinero(r.falta)} para el ${dia(r.fecha)}${r.vence ? ` (vence el ${Futuro.diaCorto(r.vence)})` : ""}.`,
        acciones: [["¿Cómo lo cubro?", "cubrir"], ["Mover", "renta"]], clave: r.claveMov });
    } else if (r) campana.push({ id: "renta-ok", firma: `${r.fecha}|${r.monto}|${r.faltaDia}`,
      texto: `${r.nombre}: ${dinero(r.monto)} para el ${dia(r.fecha)} — queda cubierta` +
        (r.faltaDia > 0.005 ? `, pero ese día faltan ${dinero(r.faltaDia)} para ${Proyeccion.lista(r.cortosDia)}.` : "."), acciones: [["Ver en Mi futuro", "futuro"]] });
    const atr = Proyeccion.rentaAtrasada();
    if (atr > 0.005) campana.push({ id: "renta-atrasada", firma: String(atr), texto: `Renta atrasada (aparte de la del mes): ${dinero(atr)}. Se paga con lo que sobra o con un plan de pagos.`, acciones: [["Mis deudas", "deudas"]] });

    // 3) Pagos que vencen hoy o mañana sin pagar
    const vencen = Vencimientos.entre(hoyClave, manana).filter(i => !i.alerta && !(i.inmediato && !i.movido))
      .map(i => ({ fecha: i.fecha, nombre: i.nombre, monto: redondear(i.partes.filter(p => !p.pagado).reduce((x, p) => x + p.monto, 0)) }))
      .filter(v => v.monto > 0.005);
    if (vencen.length) afuera.push({ id: "vencen", clase: "rojo",
      texto: "Vence " + ["hoy", "mañana"].map((cuando, k) => {
        const l = vencen.filter(v => v.fecha === (k ? manana : hoyClave));
        return l.length ? `${cuando}: ${l.map(v => `${v.nombre} ${dinero(v.monto)}`).join(", ")}` : "";
      }).filter(Boolean).join("; ") + ".", acciones: [["Ver próximos pagos", "pagos"]] });

    // 4) Acción legal del día 15
    const diaLegal = Calendario.diaDelMes("accionLegal", 15);
    const faltan = Deudas.diasParaDia(diaLegal);
    if (atr > 0.005 && faltan <= 7) {
      const a = { id: "dia15", firma: `${faltan}|${atr}`, clase: "amarillo",
        texto: `El día ${diaLegal} (${faltan === 0 ? "hoy" : `en ${faltan} ${faltan === 1 ? "día" : "días"}`}) puede haber acción legal si queda renta atrasada (${dinero(atr)}). Manda tus comprobantes y pide un acuerdo de pago por escrito.`,
        acciones: [["Mis deudas", "deudas"]] };
      (faltan <= 3 ? afuera : campana).push(a);
    }

    // 5) Sincronización
    const sc = typeof Sync !== "undefined" && Sync.activo() ? Sync.config() : null;
    if (sc && sc.error) {
      const leve = /^Sin internet|otro aparato estaba guardando/.test(sc.estado || "");
      (leve ? campana : afuera).push({ id: "sync", firma: sc.estado, clase: "amarillo", texto: `Sincronizar: ${sc.estado}`, acciones: [["Ir a Respaldo", "respaldo"]] });
    }

    // ---------- Solo en la campana ----------
    const d = new Date().getDay();
    if (d >= 1 && d <= 5 && !Almacen.leerMovimientos().some(m => m.fecha === hoyClave))
      campana.push({ id: "hoy", firma: hoyClave, texto: "Hoy no has registrado nada.", acciones: [["Registrar", "registrar"]] });
    const pr30 = Futuro.proyeccion(esc);
    const ar = Proyeccion.arrastre(pr30);
    if (ar) campana.push({ id: "arrastre", firma: `${ar.fecha}|${ar.falta}`, texto: `Antes del ${dia(ar.fecha)}: a ${ar.nombre.toLowerCase()} le faltan ${dinero(ar.falta)}.`, acciones: [["Ver en Mi futuro", "futuro"]] });
    const sinFecha = Planeados.sinFecha();
    if (sinFecha) campana.push({ id: "sin-fecha", firma: String(sinFecha), texto: `Tienes ${sinFecha} ${sinFecha === 1 ? "gasto planeado" : "gastos planeados"} sin fecha.`, acciones: [["Ver", "planeados"]] });
    Datos.deudas().filter(x => x.venceInmediato && Datos.saldoDeuda(x.id) > 0.005 && !Almacen.leerPagosMovidos()[`${x.id}@inmediato`]).forEach(x =>
      campana.push({ id: `inm-${x.id}`, firma: String(Datos.saldoDeuda(x.id)),
        texto: `${x.nombre}: ${dinero(Datos.saldoDeuda(x.id))} pendientes. ${x.id === "deudaInternet" ? "Ya hubo suspensión; " : ""}págalo cuando puedas.`, acciones: [["Ver próximos pagos", "pagos"]] }));
    Object.entries(Almacen.leerPagosMovidos()).filter(([, m]) => !m.acordado && (m.partes || []).some(p => p.fecha >= hoyClave)).forEach(([clave, m]) =>
      campana.push({ id: `acordar-${clave}`, firma: JSON.stringify(m.partes), texto: `Falta acordar con la empresa: ${m.nombre || clave.split("@")[0]} (movido al ${m.partes.map(p => Futuro.diaCorto(p.fecha)).join(" y ")}).`,
        acciones: [["Abrir", "mover"]], clave }));
    const t = Transporte.resumen();
    if (t.porDia && t.hoy > t.porDia + 0.005) campana.push({ id: "transporte", firma: `${hoyClave}|${t.hoy}`, texto: `Transporte: hoy llevas ${dinero(t.hoy)} (la meta del día es ${dinero(t.porDia)}).` });
    ["aviso-respaldo", "aviso-ejemplo", "aviso-datos-viejos"].forEach(id => {
      const b = $(id);
      if (b && !b.hidden) campana.push({ id, firma: b.textContent, texto: b.textContent, acciones: [["Ir a Respaldo", "respaldo"]] });
    });
    return { afuera, campana };
  },

  html(a, enCampana) {
    const botones = (a.acciones || []).map(([txt, acc]) =>
      `<button class="boton-chico ${acc === "cubrir" ? "lleno" : ""}" data-av-accion="${acc}" ${a.clave ? `data-av-clave="${escapar(a.clave)}"` : ""}>${txt}</button>`).join("");
    return `<div class="aviso-item ${a.clase || ""}">
      <p>${escapar(a.texto)}</p>
      <div class="pl-botones">${botones}${enCampana ? `<button class="boton-chico" data-av-entendido="${escapar(a.id)}" data-av-firma="${escapar(a.firma || "")}">Entendido</button>` : ""}</div>
    </div>`;
  },

  mostrar() {
    if (!document.body.classList.contains("con-nav") || !$("avisos-afuera")) return;
    const { afuera, campana } = this.calcular();
    const v = this.vistos();
    const nuevos = campana.filter(a => v[a.id] !== (a.firma || ""));
    this._campana = campana;
    $("avisos-afuera").innerHTML = afuera.map(a => this.html(a, false)).join("");
    $("avisos-afuera").hidden = !afuera.length;
    const n = nuevos.length;
    $("campana-num").textContent = n;
    $("campana-num").hidden = !n;
    $("campana").setAttribute("aria-label", n ? `Avisos: ${n} nuevos` : "Avisos");
    $("nav-avisos-num").textContent = n; $("nav-avisos-num").hidden = !n;
    // Puntito en "Inicio" de la barra: lo urgente de afuera y lo nuevo de la campana
    const total = afuera.length + n;
    $("nav-inicio-num").textContent = total; $("nav-inicio-num").hidden = !total;
    this._nuevos = nuevos;
    if (!$("hoja").hidden && !$("hoja-avisos").hidden) this.mostrarCampana();
  },

  mostrarCampana() {
    const v = this.vistos();
    const lista = this._campana || [];
    const nuevos = lista.filter(a => v[a.id] !== (a.firma || ""));
    const vistos = lista.filter(a => v[a.id] === (a.firma || ""));
    $("avisos-lista").innerHTML = (nuevos.length ? nuevos.map(a => this.html(a, true)).join("") : `<p class="vacio">No hay avisos nuevos.</p>`) +
      (vistos.length ? `<details class="avisos-vistos"><summary>Ya los viste (${vistos.length})</summary>${vistos.map(a => this.html(a, false)).join("")}</details>` : "");
  },

  abrirCampana() {
    this.mostrar();
    Nav.abrirHoja("avisos");
    this.mostrarCampana();
  },

  accion(acc, clave) {
    Nav.cerrarHoja();
    if (acc === "cubrir") return Cubrir.abrir();
    if (acc === "futuro") return Nav.ir("futuro");
    if (acc === "deudas") return Nav.ir("deudas");
    if (acc === "planeados") return Nav.ir("planeados");
    if (acc === "respaldo") return Nav.ir("respaldo");
    if (acc === "registrar") return Nav.abrirHoja("registrar");
    if (acc === "pagos") { Nav.ir("inicio"); $("proximos-pagos").scrollIntoView({ block: "start" }); return; }
    if ((acc === "renta" || acc === "mover") && clave) {
      const id = Futuro.estado().escenario;
      Mover.abrir(clave, Nav.visible(), { monto: Escenarios.config()[id], titulo: Futuro.ESCENARIOS.find(e => e.id === id).titulo });
    }
  },

  iniciar() {
    $("campana").addEventListener("click", () => this.abrirCampana());
    $("nav-avisos").addEventListener("click", () => this.abrirCampana());
    document.addEventListener("click", e => {
      const a = e.target.closest("[data-av-accion]");
      if (a) this.accion(a.dataset.avAccion, a.dataset.avClave);
      const en = e.target.closest("[data-av-entendido]");
      if (en) { this.entendido(en.dataset.avEntendido, en.dataset.avFirma); this.mostrarCampana(); }
    });
    window.addEventListener("movimientos-cambiaron", () => this.mostrar());
    window.addEventListener("jornadas-cambiaron", () => this.mostrar());
    this.mostrar();
  }
};

if (Datos.actual && document.body.classList.contains("con-nav")) Avisos.iniciar();
