/*
 * ¿ME ALCANZA? - línea de tiempo de 3 semanas (Bloque 9)
 * Junta: dinero de hoy + cheques esperados (Bloque 7) − vencimientos (pagos.js)
 * − comida y transporte semanales, con el saldo después de cada línea.
 * Solo muestra y sugiere: no registra ni paga nada.
 */
const Alcanza = {
  DIAS: 21,

  // Cheque esperado: el del cálculo único (proyeccion.js)
  chequeEsperado(fechaCobro) {
    const c = Proyeccion.chequeEsperado(fechaCobro);
    return { monto: c.monto, horas: c.horas, libres: c.libres, detalle: `${redondear(c.horas)} h` };
  },

  // Prioridad para la sugerencia: renta, luego deudas en su orden, luego lo demás por fecha
  prioridad(linea) {
    if (linea.id === "renta") return 1;
    if (linea.inmediato) return 1 + (linea.orden || 5);
    if (linea.id === "prestamo") return 30;
    return 20;
  },

  // Las líneas salen del cálculo único (proyeccion.js), con el dinero de hoy de esta pantalla
  lineas(dineroHoy) {
    const hoyClave = hoy();
    const hasta = Jornadas.sumarDias(hoyClave, this.DIAS - 1);
    const pr = Proyeccion.calcular({ inicial: dineroHoy });
    this._pr = pr;
    const lineas = pr.lineas.filter(l => l.fecha <= hasta).map(l => ({
      fecha: l.fecha, orden: l.orden, tipo: l.tipo, id: l.id, inmediato: l.inmediato, monto: l.monto, saldo: l.saldo,
      base: l.nombre, nombre: l.nombre + (l.detalle ? ` (${l.detalle})` : "")
    }));
    // Avisos (día 15): solo informan, no mueven dinero
    Vencimientos.entre(hoyClave, hasta).filter(i => i.alerta).forEach(i => {
      const antes = lineas.filter(l => l.fecha <= i.fecha).slice(-1)[0];
      lineas.push({ fecha: i.fecha, orden: 99, tipo: "alerta", nombre: i.partes[0].nombre, monto: 0,
                    saldo: antes ? antes.saldo : dineroHoy });
    });
    lineas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden);
    let saldo = dineroHoy;
    lineas.forEach(l => { saldo = redondear(saldo + l.monto); l.saldo = saldo; });
    return lineas;
  },

  // Sugerencia para la primera vez que falta dinero
  sugerencia(lineas, indice, dineroHoy) {
    const hastaAqui = lineas.slice(0, indice + 1);
    let disponible = dineroHoy + hastaAqui.filter(l => l.monto > 0).reduce((s, l) => s + l.monto, 0)
      + hastaAqui.filter(l => l.tipo === "semanal").reduce((s, l) => s + l.monto, 0);
    const pagos = hastaAqui.filter(l => l.tipo === "pago")
      .sort((a, b) => this.prioridad(a) - this.prioridad(b) || a.fecha.localeCompare(b.fecha));
    const primero = [], despues = [];
    pagos.forEach(p => {
      if (-p.monto <= disponible + 0.005) { primero.push(p); disponible += p.monto; }
      else despues.push(p);
    });
    const proximoCheque = lineas.slice(indice + 1).find(l => l.tipo === "cheque");
    const lista = arr => arr.map(p => `${p.base} (${dinero(-p.monto)})`).join(", ");
    let texto = "Sugerencia: ";
    texto += primero.length ? `paga primero ${lista(primero)}. ` : "no alcanza para ningún pago completo. ";
    if (despues.length) {
      texto += proximoCheque
        ? `Deja para después del cheque del ${Jornadas.textoDia(proximoCheque.fecha).toLowerCase()}: ${lista(despues)}.`
        : `No alcanza para: ${lista(despues)}. Pide una prórroga o un acuerdo de pago.`;
    }
    return texto;
  },

  // Saldo con signo: −$45.91
  saldoTexto(n) {
    return n < 0 ? `−${dinero(-n)}` : dinero(n);
  },

  // ---------- Pantalla ----------
  abrir(origen = "pantalla-inicio") {
    this.origen = origen;
    // El dinero calculado de arriba; si hoy lo cambiaste a mano (y no hubo movimientos después), ese
    const manual = Dinero.manualVigente();
    $("a-dinero").value = manual != null ? manual : Dinero.actual();
    $(origen).hidden = true;
    $("pantalla-alcanza").hidden = false;
    window.scrollTo(0, 0);
    this.mostrar();
  },

  cerrar() {
    $("pantalla-alcanza").hidden = true;
    $(this.origen || "pantalla-inicio").hidden = false;
    window.dispatchEvent(new Event("movimientos-cambiaron"));
    window.scrollTo(0, 0);
  },

  mostrar() {
    if ($("pantalla-alcanza").hidden) return;
    const txt = $("a-dinero").value.trim();
    const dineroHoy = Number(txt);
    if (txt === "" || !isFinite(dineroHoy)) {
      $("a-lista").innerHTML = `<p class="vacio">Escribe cuánto dinero tienes hoy para ver si te alcanza.</p>`;
      return;
    }
    const lineas = this.lineas(dineroHoy);
    const primeraFalta = lineas.findIndex(l => l.saldo < 0 && l.monto < 0);
    let html = `<li class="linea-tiempo inicio"><div class="mov-info"><div class="mov-tipo">Hoy tienes</div></div>
      <span class="lt-saldo">${dinero(dineroHoy)}</span></li>`;
    lineas.forEach((l, i) => {
      const falta = l.saldo < 0;
      const clase = l.tipo === "alerta" ? "alerta-linea" : falta ? "falta" : "";
      const monto = l.tipo === "alerta" ? "" : `${l.monto >= 0 ? "+" : "−"}${dinero(Math.abs(l.monto))}`;
      html += `
        <li class="linea-tiempo ${clase}">
          <div class="mov-info">
            <div class="mov-tipo">${escapar(l.nombre)}</div>
            <div class="mov-detalle">${Jornadas.textoDia(l.fecha)}${monto ? ` · <span class="${l.monto >= 0 ? "ok" : ""}">${monto}</span>` : ""}</div>
            ${falta && l.tipo !== "alerta" ? `<div class="lt-falta">⚠ Aquí falta ${dinero(-l.saldo)}</div>` : ""}
          </div>
          <span class="lt-saldo">${this.saldoTexto(l.saldo)}</span>
        </li>`;
      if (i === primeraFalta) {
        html += `<li class="lt-sugerencia">${escapar(this.sugerencia(lineas, i, dineroHoy))}</li>`;
      }
    });
    $("a-lista").innerHTML = html;
    $("a-cuenta").textContent = Proyeccion.textoCuenta(this._pr, Jornadas.sumarDias(hoy(), this.DIAS - 1));
  },

  iniciar() {
    $("abrir-alcanza").addEventListener("click", () => this.abrir("pantalla-futuro"));
    $("volver-alcanza").addEventListener("click", () => this.cerrar());
    $("a-dinero").addEventListener("input", e => {
      const v = Number(e.target.value);
      const vacio = e.target.value.trim() === "";
      if (vacio || isFinite(v)) Almacen.guardarLineaTiempo(vacio ? null : v);
      this.mostrar();
    });
    window.addEventListener("movimientos-cambiaron", () => {
      if (!$("pantalla-alcanza").hidden && Dinero.manualVigente() == null) $("a-dinero").value = Dinero.actual();
      this.mostrar();
    });
    window.addEventListener("jornadas-cambiaron", () => this.mostrar());
  }
};

if (Datos.actual) Alcanza.iniciar();
