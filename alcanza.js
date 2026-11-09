/*
 * ¿ME ALCANZA? - línea de tiempo de 3 semanas (Bloque 9)
 * Junta: dinero de hoy + cheques esperados (Bloque 7) − vencimientos (pagos.js)
 * − comida y transporte semanales, con el saldo después de cada línea.
 * Solo muestra y sugiere: no registra ni paga nada.
 */
const Alcanza = {
  DIAS: 21,

  // Cheque esperado de un día de cobro: con los días registrados (Bloque 7);
  // si ese periodo no tiene días registrados, el neto semanal de mis datos.
  chequeEsperado(fechaCobro) {
    const p = Jornadas.prediccion(fechaCobro);
    return p.hayJornadas
      ? { monto: p.netoProyectado, detalle: "según tus días registrados" }
      : { monto: Datos.actual.ingresos.netoSemanal.monto, detalle: "neto semanal de tus datos" };
  },

  // Prioridad para la sugerencia: renta, luego deudas en su orden, luego lo demás por fecha
  prioridad(linea) {
    if (linea.id === "renta") return 1;
    if (linea.inmediato) return 1 + (linea.orden || 5);
    if (linea.id === "prestamo") return 30;
    return 20;
  },

  lineas(dineroHoy) {
    const hoyClave = hoy();
    const hasta = Jornadas.sumarDias(hoyClave, this.DIAS - 1);
    const lineas = [];

    // Cheques esperados (día de cobro) + comida y transporte de la semana que empieza
    const diaCobro = Calendario.diaDeCobro();
    const comida = Vencimientos.gasto("comida");
    const transporte = Vencimientos.gasto("transporte");
    let f = Jornadas.sumarDias(hoyClave, (diaCobro - Jornadas.aFecha(hoyClave).getDay() + 7) % 7);
    for (; f <= hasta; f = Jornadas.sumarDias(f, 7)) {
      const ch = this.chequeEsperado(f);
      lineas.push({ fecha: f, orden: -1, tipo: "cheque", nombre: `Cheque (${ch.detalle})`, monto: ch.monto });
      if (comida) lineas.push({ fecha: f, orden: 40, tipo: "semanal", nombre: "Comida de la semana", monto: -comida.monto });
      if (transporte) lineas.push({ fecha: f, orden: 41, tipo: "semanal", nombre: "Transporte de la semana", monto: -transporte.monto });
    }

    // Vencimientos sin pagar (lo ya pagado no se cuenta: ya salió de tu dinero de hoy)
    Vencimientos.entre(hoyClave, hasta).forEach(item => {
      if (item.alerta) {
        lineas.push({ fecha: item.fecha, orden: 0, tipo: "alerta", nombre: item.partes[0].nombre, monto: 0 });
        return;
      }
      const pendiente = item.partes.filter(p => !p.pagado).reduce((s, p) => s + p.monto, 0);
      if (pendiente > 0) {
        const detalle = item.partes.length > 1 ? item.partes.filter(p => !p.pagado).map(p => dinero(p.monto)).join(" + ") : "";
        lineas.push({ fecha: item.fecha, orden: item.orden, tipo: "pago", id: item.id, inmediato: item.inmediato,
                      base: item.nombre, nombre: item.nombre + (detalle ? ` (${detalle})` : ""), monto: -pendiente });
      }
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
  abrir() {
    const guardado = Almacen.leerLineaTiempo();
    $("a-dinero").value = guardado && guardado.dineroHoy != null ? guardado.dineroHoy : "";
    $("pantalla-inicio").hidden = true;
    $("pantalla-alcanza").hidden = false;
    window.scrollTo(0, 0);
    this.mostrar();
  },

  cerrar() {
    $("pantalla-alcanza").hidden = true;
    $("pantalla-inicio").hidden = false;
    window.scrollTo(0, 0);
  },

  mostrar() {
    if ($("pantalla-alcanza").hidden) return;
    const txt = $("a-dinero").value.trim();
    const dineroHoy = Number(txt);
    if (txt === "" || !(dineroHoy >= 0)) {
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
  },

  iniciar() {
    $("abrir-alcanza").addEventListener("click", () => this.abrir());
    $("volver-alcanza").addEventListener("click", () => this.cerrar());
    $("a-dinero").addEventListener("input", e => {
      const v = Number(e.target.value);
      const vacio = e.target.value.trim() === "";
      if (vacio || v >= 0) Almacen.guardarLineaTiempo(vacio ? null : v);
      this.mostrar();
    });
    window.addEventListener("movimientos-cambiaron", () => this.mostrar());
    window.addEventListener("jornadas-cambiaron", () => this.mostrar());
  }
};

if (Datos.actual) Alcanza.iniciar();
