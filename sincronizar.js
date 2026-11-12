/*
 * SINCRONIZAR ENTRE APARATOS (con un repositorio PRIVADO de GitHub)
 * - Los datos viajan en un solo archivo (datos.json) del repositorio de datos.
 * - Cada aparato baja el archivo, lo COMBINA con lo suyo y lo vuelve a subir:
 *     listas (movimientos, jornadas, ...): por "id", gana el registro con "modificado" más reciente;
 *     lo borrado queda marcado ("borrado") y se borra en todos lados;
 *     lo demás (mis cifras, plan, sobres...): gana lo que se cambió más recientemente.
 * - La llave (token) se guarda SOLO en este aparato: nunca va en el archivo ni en los respaldos.
 * - Modo "Solo ver": baja los datos tal cual, nunca sube nada y muestra la vista "¿Se puede comprar?".
 * Todo se guarda con almacen.js.
 */
const Sync = {
  ARCHIVO: "datos.json",
  LISTAS: ["movimientos", "jornadas", "planeados", "diasLibres", "cambiosDatos", "planesDeuda", "deudasPropias", "pagosPropios", "recibos", "simulaciones", "notasConsejero"],
  VALORES: ["datos", "plan", "revision", "lineaTiempo", "escenarios", "dineroInicial", "futuro", "rentaCargosDesde", "acuerdoSimulado", "prioridad"],
  MAPAS: ["pagosMovidos"], // { clave: { ..., modificado, borrado? } }

  config() { return Almacen.leerSync(); },
  activo() { const c = this.config(); return !!(c && c.repo && c.token); },
  soloVer() { const c = this.config(); return !!(c && c.modo === "ver"); },

  // ---------- GitHub ----------
  async api(ruta, opciones = {}) {
    const c = this.config();
    const r = await fetch(`https://api.github.com/repos/${c.repo}${ruta}`, {
      ...opciones, cache: "no-store",
      headers: { Authorization: `Bearer ${c.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
                 ...(opciones.body ? { "Content-Type": "application/json" } : {}) }
    });
    return r;
  },

  aBase64(texto) {
    const bytes = new TextEncoder().encode(texto);
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  },

  deBase64(b64) {
    const s = atob(b64.replace(/\s/g, ""));
    return new TextDecoder().decode(Uint8Array.from(s, ch => ch.charCodeAt(0)));
  },

  error(r) {
    if (r.status === 401) return "La llave no sirve o ya venció. Crea otra en GitHub y pégala aquí.";
    if (r.status === 403) return "La llave no tiene permiso para esto (¿es una llave de solo leer?).";
    if (r.status === 404) return "No encuentro el repositorio. Revisa que el nombre sea usuario/repositorio y que la llave sea de ese repositorio.";
    return `GitHub respondió con un error (${r.status}). Prueba de nuevo en un rato.`;
  },

  // Baja el archivo: { datos, sha } o { datos: null } si todavía no existe
  async bajar() {
    const r = await this.api(`/contents/${this.ARCHIVO}`);
    if (r.status === 404) {
      const repo = await this.api("");
      if (!repo.ok) throw new Error(this.error(repo));
      return { datos: null, sha: null };
    }
    if (!r.ok) throw new Error(this.error(r));
    const j = await r.json();
    let texto;
    if (j.content && j.encoding === "base64") texto = this.deBase64(j.content);
    else {
      // Archivo grande (más de 1 MB): GitHub no manda el contenido aquí; se pide aparte, tal cual
      const raw = await fetch(`https://api.github.com/repos/${this.config().repo}/contents/${this.ARCHIVO}`, {
        cache: "no-store", headers: { Authorization: `Bearer ${this.config().token}`, Accept: "application/vnd.github.raw+json" } });
      if (!raw.ok) throw new Error(this.error(raw));
      texto = await raw.text();
    }
    return { datos: JSON.parse(texto), sha: j.sha };
  },

  async subir(datos, sha) {
    const body = { message: `Mi dinero: ${this.config().aparato || "un aparato"}`, content: this.aBase64(JSON.stringify(datos)) };
    if (sha) body.sha = sha;
    const r = await this.api(`/contents/${this.ARCHIVO}`, { method: "PUT", body: JSON.stringify(body) });
    if (r.status === 409 || r.status === 422) return { conflicto: true };
    if (!r.ok) throw new Error(this.error(r));
    return { ok: true };
  },

  // ---------- Combinar ----------
  t(x) { return (x && (x.modificado || x.creado)) || ""; },

  local() {
    const meta = Almacen.leerMetaSync();
    const listas = {}, valores = {}, mapas = {};
    this.LISTAS.forEach(k => { listas[k] = Almacen.leer(k) || []; });
    this.VALORES.forEach(k => { const v = Almacen.leer(k); if (v !== null) valores[k] = { valor: v, modificado: meta[k] || "" }; });
    this.MAPAS.forEach(k => { mapas[k] = Almacen.leer(k) || {}; });
    return { listas, valores, mapas };
  },

  combinar(loc, rem) {
    let delOtro = 0;
    const out = { listas: {}, valores: {}, mapas: {} };
    this.LISTAS.forEach(k => {
      const porId = new Map();
      (loc.listas[k] || []).forEach(x => porId.set(x.id, x));
      ((rem.listas || {})[k] || []).forEach(x => {
        const l = porId.get(x.id);
        if (!l || this.t(x) > this.t(l)) { porId.set(x.id, x); if (!l || JSON.stringify(l) !== JSON.stringify(x)) delOtro++; }
      });
      out.listas[k] = [...porId.values()];
    });
    this.VALORES.forEach(k => {
      const l = loc.valores[k], r = (rem.valores || {})[k];
      if (r && (!l || r.modificado > l.modificado)) { out.valores[k] = r; if (!l || JSON.stringify(l.valor) !== JSON.stringify(r.valor)) delOtro++; }
      else if (l) out.valores[k] = l;
    });
    this.MAPAS.forEach(k => {
      const m = { ...(loc.mapas[k] || {}) };
      Object.entries((rem.mapas || {})[k] || {}).forEach(([clave, x]) => {
        if (!m[clave] || this.t(x) > this.t(m[clave])) { if (!m[clave] || JSON.stringify(m[clave]) !== JSON.stringify(x)) delOtro++; m[clave] = x; }
      });
      out.mapas[k] = m;
    });
    return { combinado: out, delOtro };
  },

  // Guarda en este aparato lo que cambió
  aplicar(c) {
    Almacen.aplicandoSync = true;
    try {
      const meta = Almacen.leerMetaSync();
      this.LISTAS.forEach(k => { if (JSON.stringify(Almacen.leer(k) || []) !== JSON.stringify(c.listas[k])) Almacen.guardar(k, c.listas[k]); });
      this.VALORES.forEach(k => {
        const v = c.valores[k];
        if (!v) return;
        if (JSON.stringify(Almacen.leer(k)) !== JSON.stringify(v.valor)) Almacen.guardar(k, v.valor);
        meta[k] = v.modificado;
      });
      this.MAPAS.forEach(k => { if (JSON.stringify(Almacen.leer(k) || {}) !== JSON.stringify(c.mapas[k])) Almacen.guardar(k, c.mapas[k]); });
      Almacen.guardarMetaSync(meta);
    } finally {
      Almacen.aplicandoSync = false;
    }
  },

  // ---------- Sincronizar ----------
  async sincronizar({ aviso = true } = {}) {
    if (!this.activo()) return null;
    if (this._enCurso) { this._otraVez = true; return this._enCurso; }
    this._enCurso = this._sincronizar(aviso).finally(() => {
      this._enCurso = null;
      if (this._otraVez) { this._otraVez = false; this.programar(); }
    });
    return this._enCurso;
  },

  async _sincronizar(aviso) {
    const estado = (texto, error = false) => Almacen.guardarSync({ estado: texto, error, ultimo: error ? this.config().ultimo : new Date().toISOString() });
    try {
      for (let intento = 0; intento < 3; intento++) {
        const { datos: remoto, sha } = await this.bajar();
        if (this.soloVer()) {
          if (!remoto) { estado("Todavía no hay datos: primero conecta el aparato principal.", true); this.mostrarEstado(); return { delOtro: 0 }; }
          // Solo ver: lo de GitHub tal cual
          const antes = JSON.stringify(this.local());
          this.aplicar({ listas: remoto.listas || {}, valores: remoto.valores || {}, mapas: remoto.mapas || {} });
          Almacen.guardarSync({ remotoActualizado: remoto.actualizado, remotoAparato: remoto.aparato });
          const cambio = antes !== JSON.stringify(this.local());
          estado("Al día");
          this.despues(cambio ? 1 : 0, false);
          return { delOtro: cambio ? 1 : 0 };
        }
        if (!remoto && !Almacen.leerDatos()) {
          estado("Todavía no hay datos en GitHub. Conecta primero el aparato donde ya tienes tus datos.", true);
          this.mostrarEstado();
          return { delOtro: 0 };
        }
        const loc = this.local();
        const { combinado, delOtro } = remoto ? this.combinar(loc, remoto) : { combinado: loc, delOtro: 0 };
        if (delOtro) this.aplicar(combinado);
        const iguales = remoto && ["listas", "valores", "mapas"].every(k => JSON.stringify(combinado[k]) === JSON.stringify(remoto[k] || {}));
        if (!iguales) {
          const archivo = { formato: "mi-dinero-sync", version: 1, actualizado: new Date().toISOString(),
                            aparato: this.config().aparato || "", ...combinado };
          const r = await this.subir(archivo, sha);
          if (r.conflicto) continue; // otro aparato subió justo ahora: se vuelve a combinar
        }
        estado("Al día");
        this._reintentos = 0;
        if (typeof Consejero !== "undefined") Consejero.bajar();
        this.despues(delOtro, aviso);
        return { delOtro };
      }
      estado("No se pudo sincronizar: otro aparato estaba guardando. Se intenta otra vez.", true);
    } catch (e) {
      const deRed = e instanceof TypeError || !navigator.onLine;
      // Al abrir la app (o al volver a ella) la conexión puede tardar unos segundos: se reintenta solo
      if (deRed) {
        this._reintentos = (this._reintentos || 0) + 1;
        if (this._reintentos <= 4) { clearTimeout(this._tr); this._tr = setTimeout(() => this.sincronizar({ aviso: true }), 10000 * this._reintentos); }
      }
      estado(!deRed ? e.message : navigator.onLine ? "No se pudo conectar con GitHub. Se vuelve a intentar solo." : "Sin internet: se sincroniza cuando vuelva.", true);
    }
    this.mostrarEstado();
    return null;
  },

  // Después de combinar: la app vuelve a hacer sus cuentas con lo nuevo
  despues(delOtro, aviso) {
    this.mostrarEstado();
    if (!delOtro) return;
    if (!Datos.actual) { if (!this._conectando) location.reload(); return; } // al conectar, recarga conectar()
    Datos.cargar();
    window.dispatchEvent(new Event("movimientos-cambiaron"));
    window.dispatchEvent(new Event("jornadas-cambiaron"));
    Pantalla.actualizar();
    if (this.soloVer()) VistaVer.mostrar();
    if (aviso) Pantalla.aviso(`Se combinaron ${delOtro} ${delOtro === 1 ? "cambio" : "cambios"} del otro aparato`, 4000);
  },

  // Después de guardar algo: se sube a los pocos segundos
  programar() {
    if (!this.activo() || this.soloVer()) return;
    clearTimeout(this._t);
    this._t = setTimeout(() => this.sincronizar(), 4000);
  },

  // ---------- Pantallas ----------
  textoEstado() {
    const c = this.config();
    if (!this.activo()) return "";
    const cuando = c.ultimo ? new Date(c.ultimo).toLocaleString("es", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
    return c.error ? `☁ ${c.estado}` : `☁ Sincronizado${cuando ? ` · ${cuando}` : ""}${c.modo === "ver" ? " · solo ver" : ""}`;
  },

  mostrarEstado() {
    const t = this.textoEstado();
    if ($("sync-estado")) { $("sync-estado").textContent = t; $("sync-estado").hidden = !t; }
    if ($("sy-estado")) $("sy-estado").textContent = t || "Este aparato no está conectado.";
    // El estado va primero y con color: ámbar si falta conectar, verde si está sincronizado, rojo si falló
    if ($("sy-estado")) $("sy-estado").className = "estado sy-estado " + (!this.activo() ? "pendiente" : this.config().error ? "con-error" : "al-dia");
    if ($("sy-desconectar")) $("sy-desconectar").hidden = !this.activo();
    if ($("pantalla-respaldo")) $("pantalla-respaldo").classList.toggle("sin-sync", !this.activo());
  },

  async conectar(prefijo) {
    const v = id => $(`${prefijo}-${id}`).value.trim();
    const repo = v("repo").replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
    const token = v("token") || (this.config() || {}).token || "";
    const error = $(`${prefijo}-error`);
    error.textContent = "";
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return (error.textContent = "Escribe el repositorio así: usuario/mi-dinero-datos");
    if (!token) return (error.textContent = "Pega tu llave (token) de GitHub.");
    Almacen.guardarSync({ repo, token, aparato: v("aparato") || "Un aparato", modo: $(`${prefijo}-modo`).value, ultimo: null, estado: "", error: false });
    error.textContent = "Conectando…";
    this._conectando = true;
    const r = await this.sincronizar({ aviso: true });
    this._conectando = false;
    const c = this.config();
    error.textContent = c.error ? c.estado : "";
    if (!c.error) {
      $(`${prefijo}-token`).value = "";
      Pantalla.aviso("Conectado");
      if ((!Datos.actual && Almacen.leerDatos()) || c.modo === "ver") location.reload();
    }
    return r;
  },

  async desconectar() {
    if (!(await preguntar("¿Desconectar este aparato?\nTus datos se quedan aquí; solo se borra la llave de este aparato.", "Sí, desconectar"))) return;
    Almacen.borrarSync();
    this.mostrarEstado();
    Pantalla.aviso("Desconectado");
    if (document.body.classList.contains("modo-ver")) location.reload();
  },

  llenarFormulario(prefijo) {
    const c = this.config() || {};
    if (!$(`${prefijo}-repo`)) return;
    $(`${prefijo}-repo`).value = c.repo || "";
    $(`${prefijo}-aparato`).value = c.aparato || "";
    $(`${prefijo}-modo`).value = c.modo || "completo";
    $(`${prefijo}-token`).placeholder = c.token ? "•••••••• (ya guardada; deja vacío para no cambiarla)" : "github_pat_…";
  },

  iniciar() {
    ["sy", "sp"].forEach(p => {
      if (!$(`${p}-conectar`)) return;
      this.llenarFormulario(p);
      $(`${p}-conectar`).addEventListener("click", () => this.conectar(p));
    });
    if ($("sy-ahora")) $("sy-ahora").addEventListener("click", () => this.sincronizar());
    if ($("sy-desconectar")) $("sy-desconectar").addEventListener("click", () => this.desconectar());
    this.mostrarEstado();
    if (!this.activo()) return;
    window.addEventListener("online", () => this.sincronizar({ aviso: true }));
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") this.sincronizar(); });
    setTimeout(() => this.sincronizar(), 800);
  }
};

/*
 * VISTA SENCILLA "¿SE PUEDE COMPRAR?" (modo Solo ver)
 * Misma cuenta que "¿Cuándo lo compro?" (planeados.js + proyeccion.js). No guarda nada.
 * No muestra montos de deudas ni el saldo: solo la respuesta y el motivo en palabras.
 */
const VistaVer = {
  activar() {
    document.body.classList.add("modo-ver");
    document.querySelectorAll("main.contenedor").forEach(x => { x.hidden = true; });
    $("pantalla-ver").hidden = false;
    if (!$("ver-fecha").value) $("ver-fecha").value = hoy();
    this.mostrar();
  },

  limpio(nombre) { return nombre.replace(/\s*\(.*\)\s*$/, "").trim(); },

  lista(nombres) {
    const u = [...new Set(nombres)];
    return u.length <= 1 ? (u[0] || "") : `${u.slice(0, -1).join(", ")} y ${u[u.length - 1]}`;
  },

  // "Lo primero esta semana": nombres de lo que se paga en los próximos 7 días (sin montos)
  semana() {
    const pr = Proyeccion.calcular();
    const fin = Jornadas.sumarDias(hoy(), 6);
    const lineas = pr.lineas.filter(l => l.fecha <= fin && l.monto < 0 && l.tipo !== "simulado");
    const renta = lineas.filter(l => l.id === "renta").map(l => this.limpio(l.nombre).toLowerCase());
    const otros = lineas.filter(l => l.id !== "renta").map(l => this.limpio(l.nombre).toLowerCase());
    return this.lista([...renta, ...otros]);
  },

  mostrar() {
    const c = Sync.config() || {};
    const cuando = c.remotoActualizado ? new Date(c.remotoActualizado).toLocaleString("es", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }) : "";
    $("ver-estado").textContent = c.error ? c.estado : cuando ? `Datos al día del ${cuando}.` : "";
    const s = this.semana();
    $("ver-semana").textContent = s ? s.charAt(0).toUpperCase() + s.slice(1) + "." : "Nada grande esta semana.";
  },

  calcular() {
    const monto = Number($("ver-monto").value), fecha = $("ver-fecha").value < hoy() ? hoy() : $("ver-fecha").value;
    const caja = $("ver-resultado");
    if (!(monto > 0)) { caja.hidden = false; caja.innerHTML = `<p class="error">Escribe cuánto cuesta.</p>`; return; }
    const g = { id: "temporal", temporal: true, nombre: "Prueba", monto: redondear(monto), fecha, fechaLimite: Jornadas.sumarDias(fecha, 30), categoria: "Otros", tipo: "espera" };
    const m = Planeados.motor(g);
    const e = Planeados.evaluar(m, fecha, g.monto);
    const dia = f => Futuro.dia(f);
    const cuandoTxt = fecha === hoy() ? "hoy" : `el ${dia(fecha)}`;
    let html;
    if (e.color === "verde") html = `<p class="ver-si">🟢 <strong>Sí se puede.</strong></p><p>No deja ningún pago sin cubrir.</p>`;
    else if (e.color === "amarillo") html = `<p class="ver-si">🟢 <strong>Sí se puede.</strong></p><p>No deja ningún pago sin cubrir, aunque retrasa un poco el ahorro o el pago de deudas.</p>`;
    else {
      const c = e.cambian.find(x => x.nivel1 && !x.empeora) || e.cambian.find(x => !x.empeora) || e.cambian[0];
      const nombre = c ? this.limpio(c.nombre).toLowerCase() : "los pagos";
      const porque = c && /renta/i.test(c.nombre) ? " (es lo primero que hay que cubrir para no pagar recargo)" : "";
      const h = !c ? Planeados.hueco(m) : null;
      const motivo = !c ? (h ? `El ${dia(h.fecha)} ya no alcanza completo para ${this.limpio(h.pago).toLowerCase()}; si se compra ${cuandoTxt}, faltaría más.`
                             : `Si se compra ${cuandoTxt}, algún día no alcanzaría para los pagos.`)
        : c.empeora ? `El ${dia(c.fecha)} ya no alcanza completo para ${nombre}${porque}; si se compra ${cuandoTxt}, faltaría más.`
        : `Si se compra ${cuandoTxt}, el ${dia(c.fecha)} no alcanza para pagar ${nombre}${porque}.`;
      html = `<p class="ver-no">🔴 <strong>Ahora no.</strong></p><p>${escapar(motivo)}</p>`;
      // Un poco más adelante
      const s = Planeados.sugerencias(m, g);
      const mejor = s.mejor && s.mejor !== fecha && s.ev[s.mejor].color !== "rojo" ? s.mejor : null;
      html += mejor
        ? `<p class="ver-si">🟢 <strong>Se puede el ${dia(mejor)}</strong>, sin dejar ningún pago sin cubrir.</p>`
        : `<p>En el próximo mes no hay un día en que se pueda sin dejar un pago sin cubrir.</p>`;
      // En partes
      const partes = Planeados.sugerirPartes(m, { ...g, partes: 2 });
      const sirve = partes.length > 1 && partes.every((p, i) => Planeados.evaluar(m, p.fecha, p.monto, partes.filter((_, j) => j !== i)).color !== "rojo");
      if (sirve) html += `<p>También se podría en partes: ${partes.map(p => `${dinero(p.monto)} el ${dia(p.fecha)}`).join(" y ")}.</p>`;
    }
    caja.hidden = false;
    caja.innerHTML = html + `<p class="estado">Solo para ver: no se guarda nada.</p>`;
  },

  iniciar() {
    $("ver-calcular").addEventListener("click", () => this.calcular());
    $("ver-actualizar").addEventListener("click", () => Sync.sincronizar());
    $("ver-desconectar").addEventListener("click", () => Sync.desconectar());
  }
};

Sync.iniciar();
if (Datos.actual) {
  VistaVer.iniciar();
  if (Sync.soloVer()) VistaVer.activar();
}
