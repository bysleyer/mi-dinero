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
    const avisoFaltante = f ? { id: "faltante", clase: "rojo", texto: Proyeccion.textoFaltante(f), porque: "faltante", acciones: [["¿Cómo lo cubro?", "cubrir"]] } : null;
    if (avisoFaltante) afuera.push(avisoFaltante);

    // 2) La renta del mes
    const r = Proyeccion.estadoRenta(pr);
    if (r && r.falta > 0.005) {
      if (!f || f.fecha !== r.fecha) afuera.push({ id: "renta", clase: "rojo",
        texto: `${r.nombre}: faltan ${dinero(r.falta)} para el ${dia(r.fecha)}${r.vence ? ` (vence el ${Futuro.diaCorto(r.vence)})` : ""}.`,
        porque: "renta", acciones: [["¿Cómo lo cubro?", "cubrir"], ["Mover", "renta"]], clave: r.claveMov });
    } else if (r) campana.push({ id: "renta-ok", firma: `${r.fecha}|${r.monto}|${r.faltaDia}`,
      texto: `${r.nombre}: ${dinero(r.monto)} para el ${dia(r.fecha)} — queda cubierta` +
        (r.faltaDia > 0.005 ? `, pero ese día faltan ${dinero(r.faltaDia)} para ${Proyeccion.lista(r.cortosDia)}.` : "."), acciones: [["Ver en Mi futuro", "futuro"]] });
    const atr = Proyeccion.rentaAtrasada();
    const diaLegal = Calendario.diaDelMes("accionLegal", 15);
    const faltan = Deudas.diasParaDia(diaLegal);
    if (atr > 0.005 && faltan > 7) campana.push({ id: "renta-atrasada", firma: String(atr), texto: `Renta atrasada (aparte de la del mes): ${dinero(atr)}. Se paga con lo que sobra o con un plan de pagos.`, acciones: [["Mis deudas", "deudas"]] });

    // Acuerdos que "quedaron en responder" y pasó su fecha (bitácora de acuerdos)
    Acuerdos.vencidos().forEach(a => campana.push({ id: `acuerdo-${a.id}`, firma: a.hasta, clave: a.deudaId,
      texto: `${a.con} quedó en responder el ${Acuerdos.dia(a.hasta)} y todavía no anotaste respuesta.` +
        (a.deudaId === Plan.ID_DEUDA_RENTA && atr > 0.005 ? " Lo del día 15 sigue en pie: insiste por escrito." : ""),
      acciones: [["Ver acuerdos", "acuerdos"]] }));

    // Del 1 al 5: ya está el cierre del mes anterior (una vez por mes; 2.5)
    try {
      const cm = Cierre.avisoPendiente();
      if (cm) campana.push({ id: `cierre-${cm}`, firma: cm, clave: cm, acciones: [["Ver el cierre", "cierre"]],
        texto: `Ya está tu cierre de ${Cierre.nombreMes(cm).toLowerCase()}: lo que entró, lo que salió y cómo cambió cada categoría.` });
    } catch (e) { /* un aviso nunca debe romper los demás */ }

    // Se acaba el préstamo semanal: ¿a dónde va ese dinero? (una sola vez; 1.4)
    try {
      const lb = Liberado.base(pr);
      if (Liberado.pendiente(lb)) campana.push({ id: `liberado-${lb.clave}`, firma: lb.clave,
        texto: `El préstamo semanal termina el ${Futuro.diaCorto(lb.fin)}. Desde el ${Futuro.diaCorto(lb.desde)} quedan ${dineroCorto(lb.cuota)} por semana: ¿a dónde van?`,
        acciones: [["Decidir", "liberado"]] });
    } catch (e) { /* un aviso nunca debe romper los demás */ }

    // 3) Pagos que vencen hoy o mañana sin pagar
    const vencen = Vencimientos.entre(hoyClave, manana).filter(i => !i.alerta && !(i.inmediato && !i.movido))
      .map(i => ({ fecha: i.fecha, nombre: i.nombre, monto: redondear(i.partes.filter(p => !p.pagado).reduce((x, p) => x + p.monto, 0)) }))
      .filter(v => v.monto > 0.005);
    // Si el faltante es de hoy o mañana, lo que vence ese día va en el mismo aviso (no dos veces)
    if (avisoFaltante && (f.fecha === hoyClave || f.fecha === manana)) {
      const delDia = vencen.filter(v => v.fecha === f.fecha);
      if (delDia.length) {
        avisoFaltante.texto = `${f.fecha === hoyClave ? "Hoy" : "Mañana"} vence ${delDia.map(v => `${v.nombre} ${dinero(v.monto)}`).join(", ")}` +
          ` y te faltan ${dinero(f.falta)} para ` +
          (f.cortos.every(c => delDia.some(v => v.nombre.replace(/\s*\(.*\)\s*$/, "").trim() === c))
            ? (delDia.length > 1 ? "pagarlas." : "pagarla.") : `${Proyeccion.lista(f.cortos)}.`) +
          (f.rentaCubierta ? ` (La ${f.rentaNombre.charAt(0).toLowerCase() + f.rentaNombre.slice(1)} sí se cubre.)` : "");
        avisoFaltante.acciones.push(["Ver próximos pagos", "pagos"]);
        delDia.forEach(v => vencen.splice(vencen.indexOf(v), 1));
      }
    }
    if (vencen.length) afuera.push({ id: "vencen", clase: "rojo",
      texto: "Vence " + ["hoy", "mañana"].map((cuando, k) => {
        const l = vencen.filter(v => v.fecha === (k ? manana : hoyClave));
        return l.length ? `${cuando}: ${l.map(v => `${v.nombre} ${dinero(v.monto)}`).join(", ")}` : "";
      }).filter(Boolean).join("; ") + ".", acciones: [["Ver próximos pagos", "pagos"]] });

    // 3a) Lo que venció hace poco y sigue sin pagarse: la cuenta lo cuenta como pago de hoy (Proyeccion)
    const vencidos = Vencimientos.entre(Vencimientos.desdeVencidos(hoyClave), Jornadas.sumarDias(hoyClave, -1))
      .filter(i => !i.alerta && !i.inmediato && !i.planeado && !["renta", "recargo", "plandeuda"].includes(i.id))
      .map(i => ({ nombre: i.nombre.replace(/\s*\(.*\)\s*$/, "").trim(), dias: -Vencimientos.diasHasta(i.fecha),
                   monto: redondear(i.partes.filter(p => !p.pagado).reduce((x, p) => x + p.monto, 0)), clave: i.claveMov, id: i.id }))
      .filter(v => v.monto > 0.005);
    if (vencidos.length) afuera.push({ id: "vencidos", clase: "rojo", firma: vencidos.map(v => `${v.clave}|${v.monto}`).join(","),
      texto: "Venció y no está pagado: " + vencidos.map(v => `${v.nombre} ${dinero(v.monto)} (hace ${v.dias} ${v.dias === 1 ? "día" : "días"})`).join(", ") +
        ". La cuenta ya lo cuenta como pago de hoy. Págalo, o muévelo si ya acordaste otra fecha.",
      clave: vencidos.length === 1 ? vencidos[0].clave : null,
      acciones: [["Ver próximos pagos", "pagos"], ...(vencidos.length === 1 && Vencimientos.MOVIBLES.includes(vencidos[0].id) ? [["Mover", "mover"]] : [])] });

    // 3b) Pagos fijos que agregué (esenciales y suscripciones): si en su fecha no alcanza, qué hacer a tiempo
    const ids = Almacen.leerPagosPropios().map(p => p.id);
    if (ids.length) {
      Vencimientos.entre(hoyClave, Jornadas.sumarDias(hoyClave, 30)).filter(i => ids.includes(i.id) && i.partes.some(p => !p.pagado)).forEach(i => {
        if (i.movido || !Mover.noAlcanza(i)) return; // los movidos ya tienen su propio aviso
        const pend = redondear(i.partes.filter(p => !p.pagado).reduce((x, p) => x + p.monto, 0));
        const dias = Vencimientos.diasHasta(i.fecha);
        const sub = Almacen.leerPagosPropios().find(p => p.id === i.id).grupo === "suscripcion";
        const cheques = pr.cheques.filter(c => c >= hoyClave && c <= i.fecha).length;
        const guarda = cheques > 1 ? ` Aparta ${dinero(redondear(pend / cheques))} de cada uno de tus próximos ${cheques} cheques,` : "";
        const a = { id: `pf-falta-${i.claveMov}`, firma: `${pend}|${i.fecha}`, clase: dias <= 3 ? "rojo" : "amarillo",
          texto: `${i.nombre} (${dinero(pend)}) vence el ${dia(i.fecha)} y ese día no alcanza.${guarda}${guarda ? " o" : ""} muévelo o divídelo${sub ? ", o pausa la suscripción" : ""}.`
            .replace("alcanza. muévelo", "alcanza. Muévelo"),
          acciones: [["Mover o dividir", "mover"], ...(sub ? [["Pausar", "pausar"]] : [])], clave: i.claveMov };
        (dias <= 3 ? afuera : campana).push(a);
      });
    }

    // 4) Acción legal del día 15 (ya dice cuánto es la renta atrasada)
    if (atr > 0.005 && faltan <= 7) {
      const cuando = faltan === 0 ? "hoy" : faltan === 1 ? "mañana" : `en ${faltan} días`;
      const a = { id: "dia15", firma: `${faltan}|${atr}`, clase: faltan <= 3 ? "rojo" : "amarillo", gravedad: 0,
        negrita: `Día ${diaLegal}, ${cuando}:`,
        texto: `Día ${diaLegal}, ${cuando}: puede haber acción legal. Debes ${dineroCorto(atr)} de renta atrasada. Pide un acuerdo de pago por escrito y guarda tus comprobantes.`,
        acciones: [["Mis deudas", "deudas"]] };
      (faltan <= 3 ? afuera : campana).push(a);
    }

    // 5) Sincronización
    const sc = typeof Sync !== "undefined" && Sync.activo() ? Sync.config() : null;
    if (sc && sc.error) {
      const leve = /^Sin internet|No se pudo conectar con GitHub|otro aparato estaba guardando/.test(sc.estado || "");
      (leve ? campana : afuera).push({ id: "sync", firma: sc.estado, clase: "amarillo", texto: `Sincronizar: ${sc.estado}`, acciones: [["Ir a Respaldo", "respaldo"]] });
    }

    // ---------- Solo en la campana ----------
    const d = new Date().getDay();
    if (d >= 1 && d <= 5 && !Almacen.leerMovimientos().some(m => m.fecha === hoyClave))
      campana.push({ id: "hoy", firma: hoyClave, texto: "Hoy no has registrado nada.", acciones: [["Registrar", "registrar"]] });
    // Cargos que parecen repetirse cada mes y no están en Pagos fijos (máximo 2 a la vez; "Entendido" lo quita hasta que cambie)
    try {
      Patrones.repetidos().slice(0, 2).forEach(x => campana.push({ id: `repetido-${x.clave}`, firma: `${x.monto}|${x.dia}`, clave: x.clave,
        texto: `Parece que pagas ${x.nota} cada mes (unos ${dinero(x.monto)}, hacia el día ${x.dia}). ¿Lo agrego a Pagos fijos?`,
        acciones: [["Agregar como esencial", "pf-esencial"], ["Agregar como suscripción", "pf-suscripcion"]] }));
    } catch (e) { /* sin esta sugerencia */ }
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
    // Lo más grave primero: el día 15 (acción legal), la renta que no se cubre, el faltante, lo que vence hoy o mañana…
    const peso = a => a.gravedad ?? { renta: 1, faltante: 2, vencen: 3, sync: 6 }[a.id] ?? (a.id.startsWith("pf-falta") ? 4 : 5);
    afuera.sort((x, y) => peso(x) - peso(y));
    afuera.forEach(a => this.partir(a));
    return { afuera, campana };
  },

  // B7 · Un aviso urgente cabe en 3 líneas: la frase principal se ve; el resto va plegado en "Ver más".
  // Nunca se pierde texto: principal + detalle = el texto de antes. No cambia cuándo sale cada aviso.
  MAX_PRINCIPAL: 95,
  partir(a) {
    const t = a.texto || "";
    if (t.length <= this.MAX_PRINCIPAL) return a;
    // Fin de frase = signo + espacio (así "$1,655.09" no se corta)
    const trozos = t.split(/([.!?])\s+/), frases = [];
    for (let k = 0; k < trozos.length; k += 2) frases.push(trozos[k] + (trozos[k + 1] || ""));
    let principal = frases[0], i = 1;
    while (i < frases.length && (principal + " " + frases[i]).length <= this.MAX_PRINCIPAL) principal += " " + frases[i++];
    let detalle = frases.slice(i).join(" ");
    if (!detalle) { // una sola frase larga: se corta en el paréntesis, si lo hay ("… (la renta de diciembre sí se cubre).")
      const k = t.indexOf(" (", 30);
      if (k < 0) return a;
      principal = t.slice(0, k).replace(/[,;]$/, "") + ".";
      detalle = t.slice(k + 2).replace(/\)\.?$/, "").replace(/^./, c => c.toUpperCase()) + ".";
    }
    a.texto = principal; a.detalle = detalle;
    return a;
  },

  // Botón corto de los avisos de afuera (cabe al lado del texto)
  CORTO: { cubrir: "Cubrir", deudas: "Deudas", pagos: "Ver", futuro: "Ver", mover: "Mover", renta: "Mover", respaldo: "Respaldo", pausar: "Pausar", planeados: "Ver", registrar: "Registrar" },

  html(a, enCampana, corto = false) {
    const botones = (a.acciones || []).slice(0, corto ? 1 : 9).map(([txt, acc]) =>
      `<button class="boton-chico ${acc === "cubrir" ? "lleno" : ""}" data-av-accion="${acc}" ${a.clave ? `data-av-clave="${escapar(a.clave)}"` : ""} ${corto ? `aria-label="${escapar(txt)}"` : ""}>${corto ? (this.CORTO[acc] || "Ver") : txt}</button>`).join("");
    const porque = a.porque ? `<button type="button" class="enlace aviso-porque" data-av-accion="porque-${a.porque}">¿Por qué?</button>` : "";
    const detalle = a.detalle ? `<details class="aviso-detalle"><summary>Ver más</summary><span class="aviso-detalle-texto">${escapar(a.detalle)}</span></details>` : "";
    return `<div class="aviso-item ${a.clase || ""}">
      <div class="aviso-cuerpo"><p>${a.negrita && a.texto.startsWith(a.negrita) ? `<strong>${escapar(a.negrita)}</strong>${escapar(a.texto.slice(a.negrita.length))}` : escapar(a.texto)}</p>${detalle}${porque}</div>
      <div class="pl-botones">${botones}${enCampana ? `<button class="boton-chico" data-av-entendido="${escapar(a.id)}" data-av-firma="${escapar(a.firma || "")}">Entendido</button>` : ""}</div>
    </div>`;
  },

  // Fila compacta para la campana: el texto, su acción principal y un botón de visto bueno ("Entendido")
  fila(a, conEntendido = true) {
    const [txt, acc] = (a.acciones || [])[0] || [];
    const ok = `<button class="aviso-ok" data-av-entendido="${escapar(a.id)}" data-av-firma="${escapar(a.firma || "")}" aria-label="Entendido" title="Entendido"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>`;
    return `<div class="aviso-fila ${a.clase || ""}"><p>${escapar(a.texto)}</p><div class="aviso-fila-botones">` +
      (acc ? `<button class="boton-chico" data-av-accion="${acc}" ${a.clave ? `data-av-clave="${escapar(a.clave)}"` : ""} aria-label="${escapar(txt)}">${/^Ver\b/.test(txt) ? "Ver" : escapar(txt.replace(/^Ir a /, ""))}</button>` : "") +
      (conEntendido ? ok : "") + `</div></div>`;
  },

  mostrar() {
    if (!document.body.classList.contains("con-nav") || !$("avisos-afuera")) return;
    const { afuera, campana } = this.calcular();
    const v = this.vistos();
    const nuevos = campana.filter(a => v[a.id] !== (a.firma || ""));
    this._campana = campana;
    this._afuera = afuera;
    // Se ven los 2 más graves; el resto, con un botón
    const primeros = afuera.slice(0, 2), resto = afuera.slice(2);
    if (!resto.length) this._masAbierto = false;
    $("avisos-afuera").innerHTML = primeros.map(a => this.html(a, false, true)).join("") + (resto.length
      ? (this._masAbierto ? resto.map(a => this.html(a, false, true)).join("") : "") +
        `<button class="avisos-mas" data-av-mas aria-expanded="${!!this._masAbierto}">${this._masAbierto ? "Ocultar" : `+${resto.length} ${resto.length === 1 ? "aviso urgente" : "avisos urgentes"}`}</button>` : "");
    $("avisos-afuera").hidden = !afuera.length;
    const n = nuevos.length;
    $("campana-num").textContent = n;
    $("campana-num").hidden = !n;
    $("campana").setAttribute("aria-label", n ? `Avisos: ${n} nuevos` : "Avisos");
    $("nav-avisos-num").textContent = n; $("nav-avisos-num").hidden = !n;
    // Puntito en "Inicio" de la barra: lo urgente de afuera y lo nuevo de la campana
    const total = afuera.length + n;
    $("nav-inicio-num").textContent = total; $("nav-inicio-num").hidden = !total;
    // B6 · Número en el ícono de la app (los avisos urgentes). En el iPhone solo se actualiza cuando abres la app.
    try {
      if ("setAppBadge" in navigator) {
        const r = afuera.length ? navigator.setAppBadge(afuera.length) : navigator.clearAppBadge();
        if (r && r.catch) r.catch(() => {});
      }
    } catch (e) { /* un navegador sin esta función no debe fallar */ }
    this._nuevos = nuevos;
    if (!$("hoja").hidden && !$("hoja-avisos").hidden) this.mostrarCampana();
  },

  mostrarCampana() {
    const v = this.vistos();
    const lista = this._campana || [];
    const nuevos = lista.filter(a => v[a.id] !== (a.firma || ""));
    const vistos = lista.filter(a => v[a.id] === (a.firma || ""));
    const urgentes = this._afuera || [];
    $("avisos-lista").innerHTML = (urgentes.length ? `<p class="avisos-titulo">Urgente · ${urgentes.length}</p>` + urgentes.map(a => this.html(a, false)).join("") : "") + (nuevos.length ? `<p class="avisos-titulo">Nuevos · ${nuevos.length}</p><div class="avisos-grupo">` + nuevos.map(a => this.fila(a, true)).join("") + `</div>` : `<p class="vacio">No hay avisos nuevos.</p>`) +
      (vistos.length ? `<details class="avisos-vistos"><summary>Ya los viste (${vistos.length})</summary><div class="avisos-grupo">${vistos.map(a => this.fila(a, false)).join("")}</div></details>` : "");
  },

  abrirCampana() {
    this.mostrar();
    Nav.abrirHoja("avisos");
    this.mostrarCampana();
  },

  accion(acc, clave) {
    Nav.cerrarHoja();
    if (acc === "porque-faltante" || acc === "porque-renta") return Explica.abrir(acc.slice(7));
    if (acc === "pf-esencial" || acc === "pf-suscripcion") {
      const x = Patrones.repetidos().find(r => r.clave === clave);
      Nav.ir("pagosfijos");
      return PagosFijos.abrirEditor(null, acc.slice(3), x ? { nombre: x.nota, monto: x.monto, dia: x.dia } : undefined);
    }
    if (acc === "acuerdos" && clave) { Nav.ir("deudas"); return Acuerdos.abrir(clave); }
    if (acc === "cierre") { Cierre._pedido = clave || null; return Nav.ir("cierre"); }
    if (acc === "liberado") { Nav.ir("deudas"); return Liberado.abrir(); }
    if (acc === "cubrir") return Cubrir.abrir();
    if (acc === "futuro") return Nav.ir("futuro");
    if (acc === "deudas") return Nav.ir("deudas");
    if (acc === "planeados") return Nav.ir("planeados");
    if (acc === "pausar" && clave) { Nav.ir("pagosfijos"); return PagosFijos.abrirEditor(clave.split("@")[0]); }
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
      if (e.target.closest("[data-av-mas]")) { this._masAbierto = !this._masAbierto; this.mostrar(); return; }
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
