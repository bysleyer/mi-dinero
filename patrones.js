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
  },

  /* A1 · Gastos que repites: "Nota · $monto" para registrar con un toque.
     Agrupa los gastos por nota (sin acentos ni mayúsculas) + categoría. Aparece con 3 o más repeticiones.
     Monto típico = la mediana de los últimos 5. Orden: más repetido primero, con ventaja a los que sueles hacer a esta hora.
     Devuelve hasta 4: [{ nota, categoria, monto, veces }]. */
  frecuentes(hora = new Date().getHours()) {
    const grupos = this._con("frecuentes", movs => {
      const m = {};
      movs.filter(x => x.tipo === "gasto" && (x.nota || "").trim()).sort((a, b) => (a.fecha + a.creado).localeCompare(b.fecha + b.creado)).forEach(x => {
        const cat = x.categoria || "Otros";
        const k = Vigilante.normal(x.nota).trim() + "|" + cat;
        (m[k] = m[k] || { nota: x.nota.trim(), categoria: cat, montos: [], horas: [] });
        const g = m[k];
        g.nota = x.nota.trim(); // el más reciente manda (cómo la escribiste la última vez)
        g.montos.push(x.monto);
        if (x.creado) { const h = new Date(x.creado).getHours(); if (!isNaN(h)) g.horas.push(h); }
      });
      return Object.values(m).filter(g => g.montos.length >= 3).map(g => {
        const ult = g.montos.slice(-5).sort((a, b) => a - b);
        const mitad = Math.floor(ult.length / 2);
        const mediana = ult.length % 2 ? ult[mitad] : (ult[mitad - 1] + ult[mitad]) / 2;
        const hs = g.horas.slice().sort((a, b) => a - b);
        return { nota: g.nota, categoria: g.categoria, monto: redondear(mediana), veces: g.montos.length, horaTipica: hs.length ? hs[Math.floor(hs.length / 2)] : null };
      });
    });
    const puntos = g => {
      if (g.horaTipica == null) return g.veces;
      const d = Math.abs(g.horaTipica - hora); // distancia en el reloj de 24 horas (0 a 12)
      return g.veces * (1 - 0.5 * Math.min(d, 24 - d) / 12);
    };
    return grupos.slice().sort((a, b) => puntos(b) - puntos(a) || b.veces - a.veces || a.nota.localeCompare(b.nota))
      .slice(0, 4).map(g => ({ nota: g.nota, categoria: g.categoria, monto: g.monto, veces: g.veces }));
  },

  /* Hora (0 a 23) en la que sueles registrar tu primer movimiento del día: la mediana de los últimos 28 días.
     Solo cuentan los movimientos anotados el mismo día de su fecha (no los que pasas después). Con menos de 5 días: null. */
  horaHabitual() {
    return this._con("hora", movs => {
      const p2 = n => String(n).padStart(2, "0");
      const local = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
      const desde = Jornadas.sumarDias(hoy(), -28);
      const primera = {};
      movs.filter(m => m.creado && m.fecha >= desde && m.fecha < hoy() && ["gasto", "ingreso", "pagoDeuda"].includes(m.tipo)).forEach(m => {
        const d = new Date(m.creado);
        if (isNaN(d) || local(d) !== m.fecha) return;
        const h = d.getHours() + d.getMinutes() / 60;
        if (primera[m.fecha] == null || h < primera[m.fecha]) primera[m.fecha] = h;
      });
      const hs = Object.values(primera).sort((a, b) => a - b);
      return hs.length >= 5 ? Math.floor(hs[Math.floor(hs.length / 2)]) : null;
    });
  },

  /* A2 · Categoría que más has usado con esa nota (o null). Igual de la nota completa; si estás escribiendo
     (4 letras o más), vale el comienzo de una nota conocida solo si todas esas notas usan la misma categoría. */
  categoriaDe(nota) {
    const q = Vigilante.normal(nota).trim();
    if (!q) return null;
    const lista = this._con("categorias", movs => {
      const m = {};
      movs.filter(x => x.tipo === "gasto" && (x.nota || "").trim()).sort((a, b) => (a.fecha + a.creado).localeCompare(b.fecha + b.creado)).forEach(x => {
        const n = Vigilante.normal(x.nota).trim();
        const c = x.categoria || "Otros";
        (m[n] = m[n] || {});
        m[n][c] = { veces: (m[n][c] ? m[n][c].veces : 0) + 1, ultimo: x.fecha + x.creado };
      });
      return m;
    });
    const elegir = cats => Object.entries(cats).sort((a, b) => b[1].veces - a[1].veces || b[1].ultimo.localeCompare(a[1].ultimo))[0][0];
    if (lista[q]) return elegir(lista[q]);
    if (q.length < 4) return null;
    const unidas = {};
    Object.keys(lista).filter(n => n.startsWith(q)).forEach(n => Object.entries(lista[n]).forEach(([c, v]) => {
      unidas[c] = { veces: (unidas[c] ? unidas[c].veces : 0) + v.veces, ultimo: unidas[c] && unidas[c].ultimo > v.ultimo ? unidas[c].ultimo : v.ultimo };
    }));
    const cs = Object.keys(unidas);
    return cs.length === 1 ? cs[0] : null;
  }
};

window.addEventListener("movimientos-cambiaron", () => Patrones.vaciar());
