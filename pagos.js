/*
 * PAGOS PROGRAMADOS (Bloque 9)
 * Calcula los vencimientos (renta, día 15, luz, internet, teléfono, préstamo semanal)
 * a partir de mis datos, y muestra la tarjeta "Próximos pagos".
 * "Ya lo pagué" usa el mismo formulario del Bloque 2; el movimiento guarda
 * qué vencimiento pagó (campo "vencimiento"), así la app sabe que ya está pagado.
 */
const Vencimientos = {
  DIAS_ADELANTE: 14, // tarjeta: lo que vence en los siguientes 14 días
  DIAS_ATRAS: 5,     // y lo que venció hace poco y sigue sin pagar

  gasto(id) {
    return Datos.actual.gastosFijos.find(g => g.id === id);
  },

  // Monto mensual vigente en una fecha (internet cambia desde cierta fecha;
  // teléfono tiene un monto distinto el mes indicado en "mesDelMonto")
  montoEn(g, fecha) {
    if (g.cambio && fecha >= g.cambio.desde) return g.cambio.monto;
    if (g.mesDelMonto) return fecha.slice(0, 7) <= g.mesDelMonto ? g.monto : (g.montoDespues ?? g.monto);
    return g.monto;
  },

  fechaDelMes(año, mes, dia) {
    const ultimo = new Date(año, mes + 1, 0).getDate();
    const f = new Date(año, mes, Math.min(dia, ultimo));
    return Resumen.aClave(f);
  },

  // Movimientos que ya pagaron cada vencimiento
  pagados() {
    const set = new Set();
    Almacen.leerMovimientos().forEach(m => { if (m.vencimiento) set.add(m.vencimiento); });
    return set;
  },

  // Definiciones mensuales: qué vence, qué día y cómo se registra el pago
  mensuales() {
    const lista = [];
    const renta = this.gasto("renta");
    if (renta) lista.push({
      id: "renta", letra: "R", nombre: "Renta", dia: renta.venceDia || 1, orden: 1,
      partes: () => [{ nombre: "Renta", monto: renta.monto, accion: { tipo: "pagoDeuda", deudaId: Plan.ID_DEUDA_RENTA } }]
    });
    const luz = this.gasto("luz");
    if (luz && luz.venceDia) lista.push({
      id: "luz", letra: "L", nombre: luz.nombre, dia: luz.venceDia, orden: 10,
      partes: () => {
        if (!luz.partes) return [{ nombre: luz.nombre, monto: luz.monto, accion: { tipo: "gasto", categoria: "Luz" } }];
        const saldoPlan = luz.deudaPlan ? Datos.saldoDeuda(luz.deudaPlan) : 0;
        const p = [{ nombre: `${luz.nombre} – consumo`, monto: luz.partes.consumo, accion: { tipo: "gasto", categoria: "Luz" } }];
        const cuota = Math.min(luz.partes.cuotaPlan, Math.max(0, saldoPlan));
        if (cuota > 0) p.push({ nombre: `${luz.nombre} – cuota del plan`, monto: cuota, accion: { tipo: "pagoDeuda", deudaId: luz.deudaPlan } });
        return p;
      }
    });
    const internet = this.gasto("internet");
    if (internet && internet.venceDia) lista.push({
      id: "internet", letra: "I", nombre: internet.nombre, dia: internet.venceDia, orden: 10,
      partes: fecha => [{ nombre: internet.nombre, monto: this.montoEn(internet, fecha), accion: { tipo: "gasto", categoria: "Internet" } }]
    });
    const tel = this.gasto("telefono");
    if (tel && tel.venceDia) lista.push({
      id: "telefono", letra: "T", nombre: tel.nombre, dia: tel.venceDia, orden: 10,
      partes: fecha => [{ nombre: tel.nombre, monto: this.montoEn(tel, fecha), accion: { tipo: "gasto", categoria: "Teléfono" } }]
    });
    return lista;
  },

  MOVIBLES: ["luz", "telefono", "internet"], // Bloque 12: lo que se puede mover

  // Todos los vencimientos entre dos fechas, con los pagos movidos (Bloque 12) ya en su fecha nueva.
  // Cada uno trae "claveMov" (id@fecha original) y, si se movió, "movido".
  entre(desde, hasta) {
    const movidos = Almacen.leerPagosMovidos();
    const originales = Object.values(movidos).map(m => m.fechaOriginal);
    const desdeAmplio = [desde, ...originales].sort()[0];
    const hastaAmplio = [hasta, ...originales].sort().slice(-1)[0];
    const pagados = this.pagados();
    const items = [];
    this.entreBase(desdeAmplio, hastaAmplio).forEach(item => {
      item.claveMov = `${item.id}@${item.fecha}`;
      const m = this.MOVIBLES.includes(item.id) && movidos[item.claveMov];
      if (!m) { items.push(item); return; }
      const info = { fechaOriginal: m.fechaOriginal, acordado: !!m.acordado, nota: m.nota || "", dividido: m.partes.length > 1 };
      if (m.partes.length === 1) {
        items.push({ ...item, fecha: m.partes[0].fecha, movido: info });
      } else {
        const accion = item.partes[0].accion;
        m.partes.forEach((pt, i) => {
          const clave = `${item.claveMov}#${i + 1}`;
          items.push({ ...item, fecha: pt.fecha, movido: { ...info, parte: i + 1 },
            partes: [{ nombre: `${item.nombre} (parte ${i + 1} de ${m.partes.length})`, monto: pt.monto, accion, clave, pagado: pagados.has(clave) }] });
        });
      }
    });
    // Bloque 15: gastos planeados con fecha elegida (cada parte en su fecha), menos lo ya comprado
    Almacen.leerPlaneados().filter(g => g.elegido && g.elegido.length).forEach(g => {
      g.elegido.forEach((pt, i) => {
        if (Planeados.parteComprada(g, i)) return;
        const varias = g.elegido.length > 1;
        const nombre = `${g.nombre}${varias ? ` (parte ${i + 1} de ${g.elegido.length})` : ""}`;
        items.push({ id: "planeado", planeadoId: g.id, parte: i, planeado: true, letra: "P", orden: 15, fecha: pt.fecha, nombre,
          claveMov: `planeado-${g.id}#${i}@${pt.fecha}`,
          partes: [{ nombre: `${nombre} (planeado)`, monto: pt.monto, clave: `planeado-${g.id}#${i}`, sinClave: true,
                     accion: { tipo: "gasto", categoria: g.categoria, planeadoId: g.id, parte: i } }] });
      });
    });
    return items.filter(i => i.fecha >= desde && i.fecha <= hasta)
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden);
  },

  // Vencimientos según las fechas normales (sin mover)
  entreBase(desde, hasta) {
    const hoyClave = hoy();
    const pagados = this.pagados();
    const items = [];
    const agregar = (item, fecha) => {
      item.fecha = fecha;
      item.partes = item.partes.map((p, i) => {
        const clave = p.clave || `${item.id}-${i}@${fecha}`;
        return { ...p, clave, pagado: !p.sinClave && pagados.has(clave) };
      });
      items.push(item);
    };

    // Mensuales (renta, luz, internet, teléfono)
    const inicio = Jornadas.aFecha(desde);
    for (let a = inicio.getFullYear(), m = inicio.getMonth(); ; m++) {
      const primero = new Date(a, m, 1);
      const clavePrimero = Resumen.aClave(primero);
      if (clavePrimero > hasta) break;
      // Bloque 17: el día y el monto salen de las cifras que valen ese mes / ese día
      Datos.conFecha(clavePrimero, () => this.mensuales()).forEach(def => {
        const fecha = this.fechaDelMes(primero.getFullYear(), primero.getMonth(), def.dia);
        if (fecha >= desde && fecha <= hasta) {
          const delDia = Datos.conFecha(fecha, () => {
            const d2 = this.mensuales().find(x => x.id === def.id) || def;
            return { nombre: d2.nombre, partes: d2.partes(fecha) };
          });
          agregar({ id: def.id, letra: def.letra, nombre: delDia.nombre, orden: def.orden, partes: delDia.partes }, fecha);
        }
      });

      // Día 15: alerta (solo si queda saldo de renta)
      const diaLegal = Calendario.diaDelMes("accionLegal", 15);
      const fecha15 = this.fechaDelMes(primero.getFullYear(), primero.getMonth(), diaLegal);
      const saldoRenta = Datos.saldoDeuda(Plan.ID_DEUDA_RENTA);
      if (fecha15 >= desde && fecha15 <= hasta && fecha15 >= hoyClave && saldoRenta > 0) {
        agregar({
          id: "accionLegal", letra: "", nombre: `Día ${diaLegal}: acción legal si queda saldo de renta`, orden: 0, alerta: true,
          partes: [{ nombre: `Día ${diaLegal}: acción legal si queda saldo de renta (saldo ${dinero(saldoRenta)})`,
                     monto: saldoRenta, alerta: true, sinClave: true,
                     accion: { tipo: "pagoDeuda", deudaId: Plan.ID_DEUDA_RENTA } }]
        }, fecha15);
      }
    }

    // Deudas de pago inmediato (ej.: internet atrasado): vencen hoy mientras tengan saldo
    if (hoyClave >= desde && hoyClave <= hasta) {
      Datos.deudas().filter(d => d.venceInmediato).forEach(d => {
        const saldo = Datos.saldoDeuda(d.id);
        if (saldo > 0) agregar({
          id: d.id, letra: d.id === "deudaInternet" ? "I" : "", nombre: d.nombre, orden: d.prioridad || 5, inmediato: true,
          partes: [{ nombre: `${d.nombre} (pago inmediato)`, monto: saldo, sinClave: true, accion: { tipo: "pagoDeuda", deudaId: d.id } }]
        }, hoyClave);
      });
    }

    // Préstamo semanal: cada día de cobro, desde hoy, mientras tenga saldo
    const gp = this.gasto(Plan.ID_GASTO_PRESTAMO);
    if (gp) {
      let resta = Math.max(0, Datos.saldoDeuda(Plan.ID_DEUDA_PRESTAMO));
      const diaCobro = Calendario.diaDeCobro();
      let f = Jornadas.sumarDias(hoyClave, (diaCobro - Jornadas.aFecha(hoyClave).getDay() + 7) % 7);
      for (; f <= hasta; f = Jornadas.sumarDias(f, 7)) {
        const clave = `prestamo-0@${f}`;
        if (pagados.has(clave)) {
          if (f >= desde) agregar({ id: "prestamo", letra: "", nombre: gp.nombre, orden: 20,
            partes: [{ nombre: gp.nombre, monto: gp.monto, clave, accion: { tipo: "pagoDeuda", deudaId: Plan.ID_DEUDA_PRESTAMO } }] }, f);
          continue;
        }
        if (resta <= 0) break;
        const monto = Math.min(gp.monto, resta);
        resta -= monto;
        if (f >= desde) agregar({ id: "prestamo", letra: "", nombre: gp.nombre, orden: 20,
          partes: [{ nombre: gp.nombre, monto, clave, accion: { tipo: "pagoDeuda", deudaId: Plan.ID_DEUDA_PRESTAMO } }] }, f);
      }
    }

    return items.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden);
  },

  delDia(fecha) {
    return this.entre(fecha, fecha);
  },

  diasHasta(fecha) {
    return Math.round((Jornadas.aFecha(fecha) - Jornadas.aFecha(hoy())) / 86400000);
  },

  textoCuando(dias) {
    if (dias === 0) return "vence hoy";
    if (dias === 1) return "vence mañana";
    if (dias > 1) return `en ${dias} días`;
    return dias === -1 ? "venció ayer" : `venció hace ${-dias} días`;
  },

  // ---------- Tarjeta "Próximos pagos" ----------
  mostrar() {
    const hoyClave = hoy();
    const desde = Jornadas.sumarDias(hoyClave, -this.DIAS_ATRAS);
    const hasta = Jornadas.sumarDias(hoyClave, this.DIAS_ADELANTE);
    const filas = [];
    this.entre(desde, hasta).forEach(item => item.partes.forEach(p => {
      const dias = this.diasHasta(item.fecha);
      if (dias < 0 && p.pagado) return; // lo pagado que ya pasó no hace falta verlo
      filas.push({ item, p, dias });
    }));

    $("proximos-pagos").innerHTML = filas.length === 0
      ? `<p class="vacio">No hay pagos en los próximos ${this.DIAS_ADELANTE} días.</p>`
      : filas.map(({ item, p, dias }) => {
          const sinAcuerdo = item.movido && !item.movido.acordado && !p.pagado;
          const color = p.pagado ? "pagado" : dias <= 3 ? "rojo" : dias <= 7 || sinAcuerdo ? "amarillo" : "";
          const simbolo = p.pagado ? "✓" : dias <= 3 ? "⚠" : dias <= 7 ? "!" : "";
          // Bloque 12: "Mover" en luz, teléfono e internet que no alcanzan (o ya movidos)
          const puedeMover = !p.pagado && this.MOVIBLES.includes(item.id) && typeof Mover !== "undefined"
            && (item.movido || Mover.noAlcanza(item));
          if (item.planeado) {
            return `
            <li class="pago-fila ${dias <= 3 ? "amarillo" : ""}">
              <div class="mov-info">
                <div class="mov-tipo">${escapar(item.nombre)} <span class="marca-planeado">planeado</span></div>
                <div class="mov-detalle">${Jornadas.textoDia(item.fecha)} · ${this.textoCuando(dias).replace("vence", "toca")}</div>
              </div>
              <div class="pago-lado">
                <span class="mov-monto">${dinero(p.monto)}</span>
                <button class="boton-chico lleno" data-pagar-venc="${escapar(p.clave)}">Ya lo compré</button>
              </div>
            </li>`;
          }
          const boton = p.pagado
            ? `<span class="pago-hecho">✓ Pagado</span>`
            : `<button class="boton-chico lleno" data-pagar-venc="${escapar(p.clave)}">Ya lo pagué</button>` +
              (puedeMover ? `<button class="boton-chico" data-mover="${escapar(item.claveMov)}">Mover</button>` : "");
          const movido = item.movido
            ? `<div class="mov-detalle"><span class="marca-movido">movido</span> del ${Jornadas.textoDia(item.movido.fechaOriginal).toLowerCase()}</div>` +
              (sinAcuerdo ? `<div class="aviso-movido">⚠ Falta acordarlo con la empresa</div>` : "")
            : "";
          return `
            <li class="pago-fila ${color}">
              <div class="mov-info">
                <div class="mov-tipo">${simbolo ? `<span aria-hidden="true">${simbolo}</span> ` : ""}${escapar(p.nombre)}</div>
                <div class="mov-detalle">${Jornadas.textoDia(item.fecha)} · ${this.textoCuando(dias)}</div>
                ${movido}
              </div>
              <div class="pago-lado">
                <span class="mov-monto">${dinero(p.monto)}</span>
                ${boton}
              </div>
            </li>`;
        }).join("");
    this._filas = filas;
  },

  // "Ya lo pagué": abre el formulario del Bloque 2 con el monto (editable)
  pagar(clave) {
    const fila = (this._filas || []).find(f => f.p.clave === clave);
    if (!fila) return;
    const { accion, monto, sinClave } = fila.p;
    const extra = accion.planeadoId ? { planeadoId: accion.planeadoId, planeadoParte: accion.parte }
      : sinClave ? null : { vencimiento: clave };
    if (accion.tipo === "gasto") {
      abrirFormulario("gasto", { categoria: accion.categoria, monto, extra });
    } else {
      const saldo = Datos.saldoDeuda(accion.deudaId);
      abrirFormulario("pagoDeuda", { deudaId: accion.deudaId, monto: Math.min(monto, saldo), extra });
    }
  },

  iniciar() {
    $("proximos-pagos").addEventListener("click", e => {
      const b = e.target.closest("[data-pagar-venc]");
      if (b) this.pagar(b.dataset.pagarVenc);
      const m = e.target.closest("[data-mover]");
      if (m) Mover.abrir(m.dataset.mover, "pantalla-inicio");
    });
    window.addEventListener("movimientos-cambiaron", () => this.mostrar());
    this.mostrar();
  }
};

if (Datos.actual) Vencimientos.iniciar();
