/*
 * MENSAJES: la frase corta de la tarjeta "Hoy" del inicio. Se calcula en el teléfono, sin internet.
 * Elige UNA frase: la primera de estas que aplique.
 *   1) Vence hoy algo sin pagar (si el aviso urgente de arriba no lo está diciendo ya)
 *   2) Una regla del consejero está cerca de su límite
 *   3) Hoy no has registrado y ya pasó tu hora de siempre
 *   4) Lo libre de la semana, repartido por día hasta el domingo
 *   5) Algo bueno de verdad (días seguidos registrando, semana sin romper reglas)
 * Voz: tutea, frases cortas, número + fecha + una acción, sin regaños.
 * Nunca habla del tren ni del taxi al trabajo, ni da por hecho pagos u horas extra.
 */
const Mensajes = {
  // { caso, texto } o null. `ahora` solo se cambia en las pruebas.
  elegir(ahora = new Date()) {
    const pasos = [["vence", this._vence], ["regla", this._regla], ["sin-registro", this._sinRegistro], ["libre", this._libre], ["bueno", this._bueno]];
    for (const [caso, f] of pasos) {
      try { const texto = f.call(this, ahora); if (texto) return { caso, texto }; } catch (e) { /* un cálculo roto no debe tumbar el inicio */ }
    }
    return null;
  },

  delMomento(ahora) { const r = this.elegir(ahora); return r ? r.texto : ""; },

  _hora(h) { return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "a. m." : "p. m."}`; },
  _sinParentesis(t) { return String(t).replace(/\s*\(.*\)\s*$/, "").trim(); },
  _movsDeHoy() { return Almacen.leerMovimientos().filter(m => m.fecha === hoy()); }, // igual que la tarjeta "Hoy"

  _vence() {
    const h = hoy();
    const items = Vencimientos.entre(h, h).filter(i => !i.alerta && !(i.inmediato && !i.movido))
      .map(i => ({ nombre: this._sinParentesis(i.nombre), monto: redondear(i.partes.filter(p => !p.pagado).reduce((x, p) => x + p.monto, 0)) }))
      .filter(v => v.monto > 0.005);
    if (!items.length) return null;
    // Lo que ya dice un aviso urgente visible arriba no se repite
    const visibles = ((typeof Avisos !== "undefined" && Avisos._afuera) || []).slice(0, 2).map(a => a.texto || "");
    const nuevos = items.filter(v => !visibles.some(t => t.includes(v.nombre)));
    if (!nuevos.length) return null;
    const total = redondear(nuevos.reduce((s, v) => s + v.monto, 0));
    return nuevos.length === 1
      ? `Hoy vence ${nuevos[0].nombre}: ${dinero(nuevos[0].monto)}. Págalo hoy, o muévelo si ya acordaste otra fecha.`
      : `Hoy vencen ${Proyeccion.lista(nuevos.map(v => v.nombre))}: ${dinero(total)} en total. Págalos hoy, o muévelos si ya acordaste otra fecha.`;
  },

  _reglas() { return Vigilante.comentables(); },

  _regla() {
    const cerca = this._reglas()
      .map(r => ({ r, e: Vigilante.estado(r) })).filter(x => x.e.cerca)
      .sort((a, b) => b.e.pct - a.e.pct)[0];
    if (!cerca) return null;
    const { r, e } = cerca, nombre = this._sinParentesis(r.nombre);
    if (r.maxVeces > 0) {
      return e.quedanVeces === 0
        ? `${nombre}: ya usaste tus ${r.maxVeces} ${r.maxVeces === 1 ? "vez" : "veces"} ${e.per.texto}. Si hay otro, te pedirá una razón.`
        : `${nombre}: te ${e.quedanVeces === 1 ? "queda 1 vez" : `quedan ${e.quedanVeces} veces`} ${e.per.texto}. Elige cuándo usarla.`;
    }
    return `${nombre}: te quedan ${dinero(e.quedaMonto)} ${e.per.texto}. Elige en qué los usas.`;
  },

  _sinRegistro(ahora) {
    if (this._movsDeHoy().length) return null;
    const h = Patrones.horaHabitual();
    if (h == null || ahora.getHours() < h + 1 || ahora.getHours() >= 22) return null; // pasó su hora (y no es de madrugada ya tarde)
    return `Hoy todavía no registras nada. Sueles hacerlo hacia las ${this._hora(h)} Anota lo que llevas.`;
  },

  _libre(ahora) {
    const libre = Plan.semanaReal().libre;
    if (!(libre > 0.005)) return null;
    const dow = ahora.getDay(), dias = dow === 0 ? 1 : 8 - dow; // contando hoy, hasta el domingo
    const porDia = Math.floor(libre / dias * 100) / 100;
    return dias === 1
      ? `Te quedan ${dinero(libre)} libres para hoy, el último día de la semana.`
      : `Libre esta semana: ${dinero(libre)}. Son unos ${dinero(porDia)} por día hasta el domingo.`;
  },

  _bueno(ahora) {
    const dow = ahora.getDay(); // miércoles en adelante (o domingo): ya hay semana que contar
    const reglas = this._reglas();
    if (reglas.length && (dow >= 3 || dow === 0) && reglas.every(r => !Vigilante.estado(r).pasado)) return "Vas la semana sin romper ninguna regla. Así se hace.";
    const dias = new Set(Almacen.leerMovimientos().filter(m => ["gasto", "ingreso", "pagoDeuda"].includes(m.tipo)).map(m => m.fecha));
    let n = 0, f = dias.has(hoy()) ? hoy() : Jornadas.sumarDias(hoy(), -1);
    while (dias.has(f) && n < 365) { n++; f = Jornadas.sumarDias(f, -1); }
    return n >= 3 ? `Llevas ${n} días seguidos registrando. Sigue así.` : null;
  }
};
