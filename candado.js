/*
 * CANDADO (Plan 2, 3.3): pide Face ID / Touch ID (o el código del teléfono) para abrir la app.
 * Usa la llave del propio aparato (WebAuthn): nada sale del teléfono ni se sincroniza.
 * Es un candado de privacidad: tapa la pantalla; no cifra los datos guardados.
 * Se activa por aparato (no viaja en el respaldo ni en la sincronización). En "Solo ver" no se usa.
 */
const Candado = {
  CLAVE: "candado",
  SEGUNDOS_AFUERA: 60,   // si sales de la app más de esto, al volver pide Face ID otra vez
  ESPERA_SALIDA: 20,     // segundos antes de poder quitar el candado si Face ID no funciona

  config() { return Almacen.leer(this.CLAVE); },
  activo() { const c = this.config(); return !!(c && c.id) && !(typeof Sync !== "undefined" && Sync.soloVer()); },

  aBase64(bytes) { let t = ""; new Uint8Array(bytes).forEach(b => { t += String.fromCharCode(b); }); return btoa(t).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); },
  deBase64(texto) { const t = atob(texto.replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(t, c => c.charCodeAt(0)); },
  azar(n) { return crypto.getRandomValues(new Uint8Array(n)); },

  async disponible() {
    try {
      return !!(window.PublicKeyCredential && navigator.credentials && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch (e) { return false; }
  },

  // Pide Face ID con la llave guardada. true si el teléfono confirmó que eres tú.
  async verificar() {
    const c = this.config();
    if (!c || !c.id) return false;
    try {
      const r = await navigator.credentials.get({ publicKey: {
        challenge: this.azar(32),
        allowCredentials: [{ type: "public-key", id: this.deBase64(c.id), transports: ["internal"] }],
        userVerification: "required", timeout: 60000 } });
      return !!r;
    } catch (e) { return false; }
  },

  async activar() {
    if (!(await this.disponible())) return { ok: false, mensaje: "Este aparato no tiene Face ID, Touch ID ni código para usar aquí." };
    try {
      const r = await navigator.credentials.create({ publicKey: {
        challenge: this.azar(32), rp: { name: "Mi dinero" },
        user: { id: this.azar(16), name: "mi-dinero", displayName: "Mi dinero" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
        timeout: 60000 } });
      if (!r) return { ok: false, mensaje: "No se pudo activar el candado." };
      Almacen.guardar(this.CLAVE, { id: this.aBase64(r.rawId), activado: new Date().toISOString() });
      return { ok: true };
    } catch (e) { return { ok: false, mensaje: "No se activó el candado: no se confirmó Face ID." }; }
  },

  // Para quitarlo hay que pasar Face ID primero
  async desactivar() {
    if (!(await this.verificar())) return { ok: false, mensaje: "No se quitó: hay que confirmar Face ID primero." };
    Almacen.borrar(this.CLAVE);
    return { ok: true };
  },

  bloquear() {
    if (!this.activo()) return;
    document.documentElement.classList.add("bloqueado");
    this.dibujarSalida(false);
    const b = $("candado-abrir");
    if (b) b.focus();
  },

  desbloquear() {
    document.documentElement.classList.remove("bloqueado");
    clearInterval(this._reloj);
    if ($("candado-error")) $("candado-error").textContent = "";
  },

  async intentar() {
    const e = $("candado-error");
    if (e) e.textContent = "";
    if (await this.verificar()) { this.desbloquear(); return true; }
    if (e) e.textContent = "No se pudo confirmar que eres tú. Intenta otra vez.";
    return false;
  },

  // "No me deja entrar": se puede quitar el candado de este aparato, pero tras una espera (tus datos siguen en GitHub)
  dibujarSalida(abierta) {
    const caja = $("candado-salida");
    if (!caja) return;
    clearInterval(this._reloj);
    if (!abierta) { caja.innerHTML = `<button id="candado-no-entra" class="enlace-chico">No me deja entrar</button>`; return; }
    let falta = this.ESPERA_SALIDA;
    const pintar = () => {
      caja.innerHTML = falta > 0
        ? `<p class="nota-sobre">Para quitar el candado de este aparato espera ${falta} segundos…</p>`
        : `<button id="candado-quitar" class="boton-chico">Quitar el candado de este aparato</button>`;
      if (falta <= 0) clearInterval(this._reloj);
      falta--;
    };
    pintar();
    this._reloj = setInterval(pintar, 1000);
  },

  // Respaldo → tarjeta "Candado"
  async dibujar() {
    const t = $("candado-estado");
    if (!t) return;
    const hay = await this.disponible();
    const solo = typeof Sync !== "undefined" && Sync.soloVer();
    $("candado-tarjeta").hidden = solo;
    if (solo) return;
    const activo = this.activo();
    t.textContent = activo ? "Activado en este aparato: pide Face ID al abrir la app y al volver tras 1 minuto fuera." : hay ? "Apagado. Si lo activas, la app pide Face ID para abrirse." : "No disponible: este aparato no tiene Face ID, Touch ID ni código, o la app no se abrió desde su dirección web.";
    $("candado-activar").hidden = activo || !hay;
    $("candado-quitar-ajuste").hidden = !activo;
  },

  iniciar() {
    document.addEventListener("click", e => {
      if (e.target.closest("#candado-abrir")) this.intentar();
      else if (e.target.closest("#candado-no-entra")) this.dibujarSalida(true);
      else if (e.target.closest("#candado-quitar")) { Almacen.borrar(this.CLAVE); this.desbloquear(); this.dibujar(); }
      else if (e.target.closest("#candado-activar")) this.activar().then(r => { $("candado-mensaje").textContent = r.ok ? "Listo: el candado está activado." : r.mensaje; this.dibujar(); });
      else if (e.target.closest("#candado-quitar-ajuste")) this.desactivar().then(r => { $("candado-mensaje").textContent = r.ok ? "Candado quitado." : r.mensaje; this.dibujar(); });
    });
    document.addEventListener("visibilitychange", () => this.alCambiarVisibilidad(Date.now()));
    if (this.activo()) { this.bloquear(); this.intentar(); }
    else document.documentElement.classList.remove("bloqueado"); // arranque.js lo tapó por si acaso: sin candado (o en Solo ver) se destapa
  },

  alCambiarVisibilidad(ahora) {
    if (document.visibilityState === "hidden") { this._salio = ahora; return; }
    if (this.activo() && this._salio && ahora - this._salio >= this.SEGUNDOS_AFUERA * 1000) { this.bloquear(); this.intentar(); }
    this._salio = null;
  }
};
// Después de cargar todo (Sync ya existe: en "Solo ver" no se usa el candado)
window.addEventListener("load", () => Candado.iniciar());
