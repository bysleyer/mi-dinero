/*
 * ¿DE DÓNDE SALE? Al tocar Tengo, Libre esta semana o Para después se abre una hoja con la cuenta completa,
 * hecha con tus movimientos y la misma proyección que usa la app (nada se calcula aparte).
 */
const Explica = {
  abrir(que) {
    const r = this[que]();
    $("hoja-explica").innerHTML = r.html;
    Nav.abrirHoja("explica", r.titulo);
  },

  signo(n) { return n < 0 ? `−${dinero(-n)}` : dinero(n); },
  dia(f) { return Futuro.diaCorto(f); },
  hora(iso) { const d = new Date(iso); return d.toLocaleTimeString("es-US", { hour: "numeric", minute: "2-digit", hour12: true }); },
  fila(nombre, monto, extra = "", clase = "") {
    return `<li class="${clase}"><span>${escapar(nombre)}${extra ? `<span class="detalle">${escapar(extra)}</span>` : ""}</span><span class="${monto < 0 ? "ex-sale" : "ex-entra"}">${monto < 0 ? "−" : "+"}${dinero(Math.abs(monto))}</span></li>`;
  },
  nombreMov(m) {
    if (m.tipo === "ingreso") return m.tipoIngreso === "cheque" ? "Cheque" : (m.nota || "Ingreso");
    if (m.tipo === "pagoDeuda") { const d = Datos.deudas().find(x => x.id === m.deudaId); return `Pago: ${d ? d.nombre : "deuda"}`; }
    return m.nota ? `${m.categoria} · ${m.nota}` : (m.categoria || "Gasto");
  },

  // ---------- Tengo ----------
  tengo() {
    const r = Dinero.pasoAPaso();
    const valor = m => m.tipo === "ingreso" ? m.monto : -m.monto;
    const entra = redondear(r.movs.filter(m => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0));
    const sale = redondear(r.movs.filter(m => m.tipo !== "ingreso").reduce((s, m) => s + m.monto, 0));
    const base = r.inicial ? Number(r.inicial.monto) || 0 : 0;
    const desde = r.inicial ? `Corregiste tu dinero el ${this.dia(r.inicial.fecha).toLowerCase()}` : "Desde tu primer registro";
    let saldo = base, html = "";
    const porDia = {};
    r.movs.forEach(m => { (porDia[m.fecha] = porDia[m.fecha] || []).push(m); });
    Object.keys(porDia).sort().forEach(f => {
      const filas = porDia[f].map(m => { saldo = redondear(saldo + valor(m)); return this.fila(this.nombreMov(m), valor(m), this.hora(m.creado)); }).join("");
      html += `<h3 class="ex-dia"><span>${escapar(this.dia(f))}</span><span>queda ${this.signo(saldo)}</span></h3><ul class="resumen ex-lista">${filas}</ul>`;
    });
    return {
      titulo: "¿De dónde sale Tengo?",
      html: `<div class="ex-formula">
          <div><span>${escapar(desde)}</span><b>${this.signo(base)}</b></div>
          <div><span>Lo que entró</span><b class="ex-entra">+${dinero(entra)}</b></div>
          <div><span>Lo que salió (${r.movs.filter(m => m.tipo !== "ingreso").length} gastos y pagos)</span><b class="ex-sale">−${dinero(sale)}</b></div>
          <div class="ex-total"><span>Tengo</span><b>${this.signo(r.total)}</b></div>
        </div>
        <p class="ex-ayuda">Solo cuentan los movimientos que registraste después de esa corrección. Si tu banco dice otra cosa, corrígelo y la cuenta empieza de nuevo desde ahí.</p>
        ${html || '<p class="vacio">Todavía no hay movimientos desde la corrección.</p>'}
        <button type="button" class="boton-grande ex-corregir" data-explica-accion="corregir">Mi banco dice otra cosa: corregir</button>`
    };
  },

  // Días con movimientos de la proyección entre dos fechas (con lo que queda al final de cada uno)
  camino(pr, hasta) {
    return Object.keys(pr.porDia).sort().filter(f => f <= hasta && pr.porDia[f].lineas.length).map(f => {
      const d = pr.porDia[f];
      const filas = d.lineas.map(l => this.fila(l.nombre, l.monto)).join("");
      return `<h3 class="ex-dia"><span>${escapar(this.dia(f))}</span><span>queda ${this.signo(redondear(d.saldoFin))}</span></h3><ul class="resumen ex-lista">${filas}</ul>`;
    }).join("");
  },

  // ---------- Libre esta semana ----------
  libre() {
    const sem = Plan.semanaReal(), pr = sem.pr, ap = sem.apretado;
    const pagosDelDia = ap ? pr.porDia[ap.fecha].lineas.filter(l => l.monto < 0) : [];
    return {
      titulo: "¿De dónde sale Libre?",
      html: `<p class="ex-ayuda">Libre es lo que puedes gastar <b>sin quedarte corto ningún día</b> de los próximos 3 meses, contando tus pagos y los cheques que esperas.</p>
        <div class="ex-formula">
          ${pr.protegido && pr.colchon > 0.005 ? `<div><span>Tienes hoy</span><b>${this.signo(redondear(sem.inicial + pr.colchon))}</b></div>
          <div><span>Menos tu colchón (está protegido: no se usa en la cuenta)</span><b class="ex-sale">−${dinero(pr.colchon)}</b></div>
          <div><span>Para la cuenta</span><b>${this.signo(sem.inicial)}</b></div>` : `<div><span>Tienes hoy</span><b>${this.signo(sem.inicial)}</b></div>`}
          ${ap ? `<div><span>Tu día más apretado: ${escapar(this.dia(ap.fecha).toLowerCase())}${pagosDelDia.length ? ` (${escapar(pagosDelDia.map(l => l.nombre).join(", "))})` : ""}</span><b>te quedan ${this.signo(redondear(ap.saldo))}</b></div>` : ""}
          <div class="ex-total"><span>Libre esta semana</span><b>${dinero(sem.libre)}</b></div>
          ${sem.llegaLibre > 0.005 ? `<div><span>Y cuando cobres el ${escapar(this.dia(sem.desde).toLowerCase())}</span><b class="ex-entra">+${dinero(sem.llegaLibre)}</b></div>` : ""}
        </div>
        <p class="ex-ayuda">${sem.libre > 0.005 ? `Si gastas más de ${dinero(sem.libre)}, ese día más apretado te quedarías corto.` : `Hoy no hay dinero libre: todo lo que tienes ya está comprometido para llegar a ese día.`} Los cheques que todavía no llegan son estimados.</p>
        <h3 class="ex-sub">Cómo llegas a ese día</h3>
        ${ap ? this.camino(pr, ap.fecha) : ""}`
    };
  },

  // ---------- Para después ----------
  despues() {
    const sem = Plan.semanaReal();
    const filas = sem.cobertura.map(x => `<li><span>${escapar(x.nombre)}<span class="detalle">${escapar(this.dia(x.fecha))}${x.completo ? "" : ` · de ${dinero(x.monto)}`}</span></span><span>${dinero(x.deGuardado)}</span></li>`).join("");
    return {
      titulo: "¿De dónde sale Para después?",
      html: `<div class="ex-formula">
          <div><span>Te queda al terminar el domingo</span><b>${this.signo(redondear(sem.finSemana))}</b></div>
          <div><span>Menos lo libre</span><b class="ex-sale">−${dinero(sem.libreCheque)}</b></div>
          <div class="ex-total"><span>Para después</span><b>${dinero(sem.guardar)}</b></div>
        </div>
        <p class="ex-ayuda">Es dinero que ya tienes o que llega esta semana, pero que vas a necesitar para pagos que tus próximos cheques no alcanzan a cubrir solos.</p>
        ${filas ? `<h3 class="ex-sub">Está guardado para</h3><ul class="resumen ex-lista">${filas}<li class="total"><span>Total</span><span>${dinero(sem.guardar)}</span></li></ul>`
          : '<p class="vacio">No hace falta para ningún pago: puedes dejarlo como colchón.</p>'}`
    };
  }
};
