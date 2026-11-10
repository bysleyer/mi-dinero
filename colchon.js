/*
 * COLCHÓN USABLE Y ARRASTRE (Bloque 16)
 * Piezas que usan Mi futuro, Mover este pago y ¿Cuándo lo compro?:
 *  - ColchonUI: "Colchón: $X (puedes usarlo)" y el interruptor "Proteger el colchón".
 *  - ArrastreUI: tarjeta "Antes del [fecha]" cuando un pago de Nivel 1 no se cubre completo.
 * Todo sale de proyeccion.js. Los cambios se guardan con almacen.js.
 */
const ColchonUI = {
  html() {
    const c = Proyeccion.colchon();
    const protegido = Proyeccion.protegerColchon();
    return `
      <div class="colchon-linea">
        <span>Colchón: <strong>${dinero(c)}</strong> de ${dinero(Plan.metaColchon())} ${protegido ? "(protegido: no se cuenta)" : "(puedes usarlo)"}</span>
        <label class="colchon-interruptor"><input type="checkbox" data-proteger-colchon ${protegido ? "checked" : ""}> Proteger el colchón</label>
      </div>`;
  },

  cambiar(proteger) {
    Almacen.guardarFuturo({ protegerColchon: proteger });
    Pantalla.aviso(proteger ? "Colchón protegido" : "El colchón se puede usar");
    window.dispatchEvent(new Event("movimientos-cambiaron"));
  }
};

// Renta: ¿queda cubierta antes de su fecha límite (el 15 o la del acuerdo)? Si no, cuánto falta.
const RentaUI = {
  html(pr) {
    const r = Proyeccion.estadoRenta(pr);
    if (!r) return "";
    const cuando = `antes del ${Futuro.dia(r.fecha)}`;
    return r.falta > 0.005
      ? `<p class="renta-linea falta"><span>Renta ${dinero(r.monto)} ${cuando}</span><strong>Faltan ${dinero(r.falta)}</strong></p>`
      : `<p class="renta-linea cubierta"><span>Renta ${dinero(r.monto)} ${cuando}</span><strong>✓ Queda cubierta</strong></p>`;
  }
};

const ArrastreUI = {
  TEXTO_FIJO: "Si no alcanza, pide a la administradora un acuerdo de pago por escrito antes del día 15 y manda tus comprobantes.",

  // Pagos que se pueden mover (permite_mover: true en mis datos) y vencen antes de esa fecha
  movibles(pr, hastaFecha) {
    const permitidos = Datos.actual.gastosFijos.filter(g => g.permite_mover === true).map(g => g.id);
    return pr.lineas.filter(l => l.tipo === "pago" && permitidos.includes(l.id) && l.fecha <= hastaFecha && l.claveMov);
  },

  html(pr) {
    const a = Proyeccion.arrastre(pr);
    if (!a) return "";
    const opciones = [];
    this.movibles(pr, a.fecha).forEach(l => opciones.push(
      `<li><span>Dividir o mover ${escapar(l.nombre)} (${dinero(-l.monto)}, ${Futuro.diaCorto(l.fecha)})</span>
        <button class="boton-chico" data-ar-mover="${escapar(l.claveMov)}">Mover</button></li>`));
    if (pr.protegido && pr.colchon > 0) opciones.push(
      `<li><span>Usar el colchón (${dinero(pr.colchon)})</span><button class="boton-chico" data-usar-colchon>Usar</button></li>`);
    const min = Proyeccion.comidaMinima();
    const comida = Vencimientos.gasto("comida");
    if (min != null && comida && !pr.comidaExtrema) opciones.push(
      `<li><span>Comida en modo extremo (${dinero(min)} en vez de ${dinero(comida.monto)}): libera ${dinero(comida.monto - min)} por semana. <em>Solo en caso extremo.</em></span>
        <button class="boton-chico" data-comida-extrema="1">Aplicar</button></li>`);
    if (pr.comidaExtrema) opciones.push(
      `<li><span>La comida está en modo extremo.</span><button class="boton-chico" data-comida-extrema="0">Quitar</button></li>`);
    return `
      <section class="tarjeta arrastre">
        <h2>Antes del ${Futuro.dia(a.fecha)}</h2>
        <p class="arrastre-frase">${escapar(a.nombre)}: llegan <strong>${dinero(a.queda)}</strong> de ${dinero(a.monto)}. Faltan <strong>${dinero(a.falta)}</strong>.</p>
        <ul class="resumen">
          <li><span>Dinero hoy</span><span>${Futuro.plata(a.inicial)}</span></li>
          <li><span>Entra por cheques</span><span class="ok">+${dinero(a.entra)}</span></li>
          <li><span>Sale antes de ese pago</span><span>−${dinero(a.sale)}</span></li>
          <li class="total"><span>Queda para ${escapar(a.nombre)}</span><span>${dinero(a.queda)}</span></li>
          <li><span>Falta</span><span class="error">${dinero(a.falta)}</span></li>
        </ul>
        <p class="arrastre-linea"><strong>Arrastre:</strong> ${a.hasta
          ? `faltan ${dinero(a.falta)}; se cubre con el cheque del ${Futuro.dia(a.hasta)}.`
          : `faltan ${dinero(a.falta)}; no se alcanza a cubrir en estos 30 días.`}</p>
        <p class="estado">Para llegar completo necesitarías apartar <strong>${dinero(a.porSemana)} por semana</strong> (${a.semanas} ${a.semanas === 1 ? "semana" : "semanas"}).</p>
        ${opciones.length ? `<h3 class="pc-sub">Opciones</h3><ul class="arrastre-opciones">${opciones.join("")}</ul>` : ""}
        <p class="ayuda">${this.TEXTO_FIJO}</p>
      </section>`;
  },

  pantallaActual() {
    const m = [...document.querySelectorAll("main.contenedor")].find(x => !x.hidden);
    return m ? m.id : "pantalla-inicio";
  },

  escenario() {
    const est = Futuro.estado();
    const e = Futuro.ESCENARIOS.find(x => x.id === est.escenario);
    return { monto: Escenarios.config()[est.escenario], titulo: e.titulo };
  }
};

// Botones e interruptores (en cualquier pantalla)
document.addEventListener("change", e => {
  const t = e.target.closest("[data-proteger-colchon]");
  if (t) ColchonUI.cambiar(t.checked);
});
document.addEventListener("click", e => {
  const mov = e.target.closest("[data-ar-mover]");
  if (mov) Mover.abrir(mov.dataset.arMover, ArrastreUI.pantallaActual(), ArrastreUI.escenario());
  if (e.target.closest("[data-usar-colchon]")) ColchonUI.cambiar(false);
  const com = e.target.closest("[data-comida-extrema]");
  if (com) {
    const on = com.dataset.comidaExtrema === "1";
    Almacen.guardarFuturo({ comidaExtrema: on });
    Pantalla.aviso(on ? "Comida en modo extremo (solo en caso extremo)" : "Comida normal otra vez");
    window.dispatchEvent(new Event("movimientos-cambiaron"));
  }
});
