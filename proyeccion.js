/*
 * PROYECCIÓN DEL SALDO DÍA POR DÍA (una sola cuenta para "¿Y si cobro...?" y "Mover este pago")
 *   dinero que tengo hoy (el número de arriba)
 *   + cheques esperados en su fecha de cobro (si ya registraste el real de esa semana, ya está en tu dinero)
 *   − todos los vencimientos y gastos semanales (comida y transporte) en su fecha,
 * en el orden del Bloque 11 dentro de cada día: cheque, renta, préstamo, transporte, comida, luego las facturas.
 */
const Proyeccion = {
  // opciones: { excluir: claveMov de un pago que no se cuenta,
  //             chequeEscenario: monto para el próximo cheque sin registrar (¿Y si cobro...?) }
  calcular(opciones = {}) {
    const { excluir = null, chequeEscenario = null } = opciones;
    const cfg = Mover.config();
    const hoyClave = hoy();
    const fin = Jornadas.sumarDias(hoyClave, cfg.horizonte - 1);
    const lineas = [];
    const cheques = [];

    // Cheques y gastos semanales del día en que llega el dinero
    const diaCheque = Math.max(0, Jornadas.DIAS.indexOf(cfg.chequeDia));
    const inicioBusqueda = Jornadas.sumarDias(hoyClave, -cfg.chequeRetraso);
    let cobro = Jornadas.sumarDias(inicioBusqueda, (diaCheque - Jornadas.aFecha(inicioBusqueda).getDay() + 7) % 7);
    const comida = Vencimientos.gasto("comida");
    const transporte = Vencimientos.gasto("transporte");
    const ingresos = Almacen.leerMovimientos().filter(m => m.tipo === "ingreso");
    let escenarioUsado = false;
    for (; Jornadas.sumarDias(cobro, cfg.chequeRetraso) <= fin; cobro = Jornadas.sumarDias(cobro, 7)) {
      const disponible = Jornadas.sumarDias(cobro, cfg.chequeRetraso);
      const lunes = Plan.claveSemana(Jornadas.aFecha(cobro));
      const domingo = Jornadas.sumarDias(lunes, 6);
      const real = ingresos.filter(m => m.fecha >= lunes && m.fecha <= domingo);
      if (real.length) {
        cheques.push({ fecha: disponible, monto: real.reduce((s, m) => s + m.monto, 0), origen: "real" });
      } else {
        let monto, origen;
        if (chequeEscenario != null && !escenarioUsado) { monto = chequeEscenario; origen = "escenario"; escenarioUsado = true; }
        else { monto = Alcanza.chequeEsperado(cobro).monto; origen = "esperado"; }
        cheques.push({ fecha: disponible, monto, origen });
        lineas.push({ fecha: disponible, orden: 0, tipo: "cheque", id: "cheque", nombre: "Cheque", monto, origen });
      }
      if (transporte) lineas.push({ fecha: disponible, orden: 3, tipo: "semanal", id: "transporte",
        nombre: `Transporte (${dinero(transporte.porDia)} × ${transporte.diasPorSemana || 4} días)`, monto: -transporte.monto });
      if (comida) lineas.push({ fecha: disponible, orden: 4, tipo: "semanal", id: "comida", nombre: "Comida", monto: -comida.monto });
    }

    // Vencimientos sin pagar (con las fechas movidas)
    Vencimientos.entre(hoyClave, fin).forEach(item => {
      if (item.alerta || item.claveMov === excluir) return;
      const pendiente = item.partes.filter(p => !p.pagado).reduce((s, p) => s + p.monto, 0);
      if (pendiente <= 0) return;
      const orden = item.id === "renta" ? 1 : item.id === "prestamo" ? 2 : item.inmediato ? 5 : 10;
      lineas.push({ fecha: item.fecha, orden, tipo: "pago", id: item.id, nombre: item.nombre, letra: item.letra,
        monto: -pendiente, movido: item.movido || null, claveMov: item.claveMov, inmediato: !!item.inmediato });
    });
    lineas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden);

    const inicial = Dinero.actual();
    let saldo = inicial;
    let chequesHasta = 0;
    const porDia = {};
    for (let f = hoyClave; f <= fin; f = Jornadas.sumarDias(f, 1)) {
      const delDia = lineas.filter(l => l.fecha === f);
      delDia.forEach(l => {
        saldo = redondear(saldo + l.monto);
        if (l.tipo === "cheque") chequesHasta += l.monto;
      });
      // saldoSinCheques: lo que quedaría sin ningún cheque (para saber si un pago depende de un cheque)
      porDia[f] = { saldoFin: saldo, saldoSinCheques: redondear(saldo - chequesHasta), lineas: delDia };
    }
    return {
      desde: hoyClave, hasta: fin, porDia, inicial,
      cheques: lineas.filter(l => l.tipo === "cheque").map(l => l.fecha),
      chequesInfo: cheques
    };
  },

  // Último cheque que llega en o antes de una fecha
  ultimoCheque(pr, fecha) {
    return pr.cheques.filter(c => c <= fecha).slice(-1)[0] || null;
  },

  // ¿Se paga en esa fecha? Mira el saldo al final del día con todo lo de ese día ya pagado.
  // Devuelve { alcanza, conCheque: fecha del cheque que lo hace posible (o null), falta }
  estadoEnFecha(pr, fecha) {
    const d = pr.porDia[fecha];
    if (!d) return null;
    const alcanza = d.saldoFin >= -0.005;
    const conCheque = alcanza && d.saldoSinCheques < -0.005 ? this.ultimoCheque(pr, fecha) : null;
    return { alcanza, conCheque, falta: alcanza ? 0 : redondear(-d.saldoFin) };
  },

  // Línea pequeña: con qué dinero y qué cheques se hizo la cuenta
  textoCuenta(pr, hasta = pr.hasta) {
    const origen = { escenario: "este escenario", esperado: "esperado", real: "ya registrado, ya está en tu dinero" };
    const cheques = pr.chequesInfo.filter(c => c.fecha <= hasta)
      .map(c => `${Jornadas.textoDia(c.fecha).toLowerCase()} ${dinero(c.monto)} (${origen[c.origen]})`);
    const tengo = pr.inicial < 0 ? `−${dinero(-pr.inicial)}` : dinero(pr.inicial);
    return `Cuenta hecha con: tienes ${tengo} hoy (el número de arriba)` +
      (cheques.length ? ` · cheques: ${cheques.join(", ")}` : " · sin cheques en estas fechas") +
      " · menos vencimientos, comida y transporte en su fecha.";
  }
};
