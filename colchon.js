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
    const meta = Plan.metaColchon();
    return `
      <div class="colchon-linea">
        <p class="mini-titulo">Colchón</p>
        <div class="mini-fila"><strong>${dineroCorto(c)} de ${dineroCorto(meta)}</strong>
          <label class="colchon-interruptor"><input type="checkbox" data-proteger-colchon ${protegido ? "checked" : ""}> Proteger</label></div>
        <div class="barra mini-barra"><div class="barra-relleno" style="--p:${meta > 0 ? Math.min(1, c / meta) : 0}"></div></div>
        ${protegido ? `<p class="mini-nota">Protegido: no se cuenta en Mi futuro.</p>` : ""}
      </div>`;
  },

  cambiar(proteger) {
    Almacen.guardarFuturo({ protegerColchon: proteger });
    Pantalla.aviso(proteger ? "Colchón protegido" : "El colchón se puede usar");
    window.dispatchEvent(new Event("movimientos-cambiaron"));
  }
};

// Renta: la del mes, ¿queda cubierta antes de su fecha límite (el 15 o a donde la moviste)? Si no, cuánto falta.
// La renta atrasada se muestra aparte (no es lo que toca pagar este mes).
const RentaUI = {
  html(pr) {
    let r = Proyeccion.estadoRenta(pr);
    if (!r && pr.opciones) {
      // La próxima renta vence después de estos días: se mira con la misma cuenta un poco más lejos
      const sig = Proyeccion.rentaMeses(pr.desde, Jornadas.sumarDias(pr.desde, 62)).find(c => c.pendiente > 0.005);
      if (sig) {
        const dias = Math.round((Jornadas.aFecha(sig.meta) - Jornadas.aFecha(pr.desde)) / 86400000) + 1;
        r = Proyeccion.estadoRenta(Proyeccion.calcular({ ...pr.opciones, horizonte: Math.max(dias, 31) }));
      }
    }
    const atrasada = Proyeccion.rentaAtrasada();
    const cuando = r ? `para el ${Futuro.dia(r.fecha)}${r.vence ? ` (vence el ${Futuro.diaCorto(r.vence)})` : ""}` : "";
    const tarjeta = (clase, estado) => `<div class="renta-linea ${clase}"><p class="mini-titulo">${escapar(r.nombre)}</p>
      <div class="mini-fila"><span><strong>${dineroCorto(r.monto)}</strong><small>${estado}</small></span>${this.boton(r)}</div></div>`;
    const dia = r ? Futuro.diaCorto(r.fecha).toLowerCase() : "";
    const linea = !r ? "" : r.falta > 0.005
      ? tarjeta("falta", `Faltan ${dinero(r.falta)} · ${dia}`)
      : r.faltaDia > 0.005
      ? tarjeta("parcial", `✓ Queda cubierta, pero ese día faltan ${dinero(r.faltaDia)} para ${escapar(Proyeccion.lista(r.cortosDia))} · ${dia}`)
      : tarjeta("cubierta", `✓ Queda cubierta · ${dia}`);
    const atr = atrasada > 0.005
      ? `<p class="renta-atrasada">Renta atrasada (aparte, no es la de este mes): <strong>${dinero(atrasada)}</strong>. Se paga con lo que sobra.</p>` : "";
    return linea + atr;
  },

  boton(r) {
    return r.claveMov && $("pantalla-mover").hidden
      ? `<button class="boton-chico" data-renta-mover="${escapar(r.claveMov)}">Mover</button>` : "";
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
  const rm = e.target.closest("[data-renta-mover]");
  if (rm) Mover.abrir(rm.dataset.rentaMover, ArrastreUI.pantallaActual(), ArrastreUI.escenario());
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
