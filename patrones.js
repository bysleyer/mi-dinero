/*
 * PATRONES: el "cerebro" que se calcula en el teléfono (gratis, sin internet).
 * Solo LEE los movimientos (Almacen.leerMovimientos) y devuelve resultados; no guarda nada ni tiene pantalla.
 * El resultado se guarda en memoria y se vacía cuando cambian los movimientos (evento "movimientos-cambiaron").
 * Lo usan la app (A dónde va, gastos frecuentes, avisos) y consejero/analizar.js (para que Claude vea la misma cuenta).
 */
const Patrones = {
  _memoria: {},

  vaciar() { this._memoria = {}; },

  // Guarda en memoria por día y cantidad de movimientos (por si algo cambia sin avisar con el evento)
  _con(clave, calcular) {
    const movs = Almacen.leerMovimientos();
    const sello = hoy() + "|" + movs.length;
    const m = this._memoria[clave];
    if (m && m.sello === sello) return m.valor;
    const valor = calcular(movs);
    this._memoria[clave] = { sello, valor };
    return valor;
  },

  /* Gasto por semana y categoría (últimas 8 semanas, lunes a domingo) con promedio y marcas.
     Promedio = semanas ANTERIORES que tienen gastos. Marca si lo de esta semana sube más de 20 % o más de $100
     (solo con 2 o más semanas anteriores). La semana en curso está incompleta: mira "diasTranscurridos". */
  porSemana() {
    return this._con("porSemana", movs => {
      try {
        const lunesActual = Plan.claveSemana();
        const lunes = Array.from({ length: 8 }, (_, i) => Jornadas.sumarDias(lunesActual, -7 * (7 - i)));
        const g = movs.filter(m => m.tipo === "gasto");
        const total = (cat, l) => redondear(g.filter(m => Plan.claveSemana(new Date(m.fecha + "T12:00:00")) === l && (cat == null || (m.categoria || "Otros") === cat))
          .reduce((s, m) => s + m.monto, 0));
        const cats = [...new Set(g.map(m => m.categoria || "Otros"))].sort();
        const conDatos = lunes.slice(0, -1).filter(l => total(null, l) > 0);
        const fila = cat => {
          const semanas = lunes.map(l => total(cat, l));
          const actual = semanas[semanas.length - 1];
          const previas = conDatos.map(l => total(cat, l));
          const promedio = previas.length ? redondear(previas.reduce((s, x) => s + x, 0) / previas.length) : null;
          const dif = promedio == null ? null : redondear(actual - promedio);
          const pct = promedio ? Math.round((actual / promedio - 1) * 100) : null;
          const marca = previas.length >= 2 && dif > 0 && (dif > 100 || (pct != null && pct > 20));
          return { categoria: cat ?? "TOTAL", semanas, actual, promedioAnteriores: promedio, diferencia: dif, porcentaje: pct, marca };
        };
        const dow = new Date(hoy() + "T12:00:00").getDay(); // 0 = domingo
        return { lunes, semanasAnterioresConDatos: conDatos.length, diasTranscurridos: dow === 0 ? 7 : dow,
                 total: fila(null), categorias: cats.map(fila).sort((x, y) => y.actual - x.actual) };
      } catch (e) { return { error: e.message }; }
    });
  }
};

window.addEventListener("movimientos-cambiaron", () => Patrones.vaciar());
