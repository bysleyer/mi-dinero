/*
 * OFICINA 3D DE ROBERTO (pantalla Más → Roberto). Solo DIBUJA: lo que hace Roberto lo decide él en sus corridas
 * (roberto/estado.json) y aquí se le ve hacerlo. No guarda nada y no cambia ningún dato.
 *   - Dónde está: estado.lugar. Si pidió hablar contigo y no has contestado, se queda en la sala o en tu oficina.
 *   - Entre corridas sigue su agenda (estado.agenda: { hora, lugar, tarea }), y lo dice en su burbuja.
 *   - Se va a casa con turno "casa" (su cierre) o si ya pasaron las 8:30 p. m.; llega a las 5:58 a. m.
 *   - La pizarra muestra su fase y sus metas (roberto/cuaderno.json); la pantalla de la sala, su reunión.
 *   - Día y noche con la hora de Nueva York; de noche y sin él, la oficina queda a oscuras.
 * three.js va incluido en la app (vendor/three-roberto.js) y se carga solo la primera vez que abres la pantalla.
 * Sin WebGL (o si algo falla) no se muestra nada y la tarjeta de texto de abajo dice lo mismo.
 * Con "reducir movimiento" no camina: aparece en su lugar y la escena se dibuja una vez por segundo.
 */
const Roberto3D = {
  FUENTE: "vendor/three-roberto.js",
  _cargando: null,
  e: null,          // la escena (se arma una vez)
  activo: false,
  d: null,          // { estado, cuaderno } de Roberto

  webgl() { try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); } catch (x) { return false; } },
  calma() { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); },

  cargar() {
    if (window.THREE && window.THREE.WebGLRenderer) return Promise.resolve();
    if (this._cargando) return this._cargando;
    this._cargando = new Promise((ok, mal) => {
      const s = document.createElement("script");
      s.src = this.FUENTE;
      s.onload = () => (window.THREE && window.THREE.WebGLRenderer ? ok() : mal(new Error("sin three")));
      s.onerror = () => { this._cargando = null; mal(new Error("no cargó " + this.FUENTE)); };
      document.head.appendChild(s);
    });
    return this._cargando;
  },

  // Muestra la oficina dentro de `caja`. Devuelve true si se pudo.
  async mostrar(caja, datos) {
    this.d = datos;
    if (!this.webgl()) return false;
    try {
      await this.cargar();
      if (!this.e) this._armar(caja); else this._poner(caja);
      this._datosCambiaron();
      this.empezar();
      return true;
    } catch (x) { this.pausar(); return false; }
  },

  actualizar(datos) { this.d = datos; if (this.e) this._datosCambiaron(); },

  // ---------- Hora de Nueva York ----------
  ny(fecha = new Date()) {
    const p = {};
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" })
      .formatToParts(fecha).forEach(x => { p[x.type] = x.value; });
    const h = Number(p.hour) % 24, m = Number(p.minute);
    return { dia: `${p.year}-${p.month}-${p.day}`, h, m, s: Number(p.second), min: h * 60 + m };
  },

  // ---------- Dónde debe estar ahora y qué dice ----------
  objetivo() {
    const e = this.d && this.d.estado, ahora = this.ny();
    if (!e) return { lugar: "fuera", dice: "" };
    const p = e.pideHablar;
    const respondida = p && typeof Roberto !== "undefined" && Roberto.respondida(p);
    if (e.turno === "casa" || e.lugar === "fuera" || ahora.min >= 20 * 60 + 30 || ahora.min < 5 * 60 + 50) return { lugar: "fuera", dice: "" };
    if (p && !respondida && (p.donde === "sala" || p.donde === "tuOficina")) return { lugar: p.donde, dice: e.haciendo || "" };
    // Agenda: lo último que tocaba después de su corrida (mismo día)
    const corrida = e.actualizado ? this.ny(new Date(e.actualizado)) : null;
    let lugar = this.LUGAR_OK(e.lugar) ? e.lugar : "escritorio", dice = e.haciendo || "";
    if (corrida && corrida.dia === ahora.dia && Array.isArray(e.agenda)) {
      e.agenda.forEach(a => {
        const [hh, mm] = String(a.hora || "").split(":").map(Number);
        const min = hh * 60 + (mm || 0);
        if (!isNaN(min) && min > corrida.min && min <= ahora.min && this.LUGAR_OK(a.lugar)) { lugar = a.lugar; dice = a.tarea || dice; }
      });
    }
    return { lugar, dice };
  },
  LUGAR_OK(l) { return ["escritorio", "archivo", "pizarra", "cafe", "sala", "tuOficina", "entrada", "fuera"].includes(l); },

  // ---------- Armado de la escena ----------
  _armar(caja) {
    const T = THREE;
    const e = this.e = { T, ag: null, previo: performance.now(), ultMin: -1, saltar: true };
    const r = e.render = new T.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = T.SRGBColorSpace;
    r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
    r.domElement.className = "rb3d-lienzo";
    r.domElement.setAttribute("role", "img");
    r.domElement.setAttribute("aria-label", "La oficina de Roberto en 3D. La tarjeta de abajo dice con palabras dónde está y qué hace.");
    const escena = e.escena = new T.Scene();
    e.cam = new T.PerspectiveCamera(36, 1, 0.1, 80);
    const mat = (c, o = {}) => new T.MeshStandardMaterial({ color: c, roughness: .78, metalness: .02, ...o });
    const caja3 = (w, h, d, c, x, y, z, o = {}) => { const k = new T.Mesh(new T.BoxGeometry(w, h, d), o.mat || mat(c, o)); k.position.set(x, y, z); k.castShadow = o.sombra !== false; k.receiveShadow = true; (o.padre || escena).add(k); return k; };
    const cil = (rs, ri, h, c, x, y, z, o = {}) => { const k = new T.Mesh(new T.CylinderGeometry(rs, ri, h, o.seg || 20), mat(c, o)); k.position.set(x, y, z); k.castShadow = true; k.receiveShadow = true; (o.padre || escena).add(k); return k; };
    const lienzo = (w, h, px, py, x, y, z, rx = 0, ry = 0) => {
      const c = document.createElement("canvas"); c.width = px; c.height = py;
      const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
      const k = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
      k.position.set(x, y, z); k.rotation.set(rx, ry, 0); escena.add(k); return { k, c, g: c.getContext("2d"), tex };
    };
    e.lienzo = lienzo;

    // Luces
    e.hemi = new T.HemisphereLight(0xdbe8ff, 0x5a4636, .9); escena.add(e.hemi);
    e.sol = new T.DirectionalLight(0xfff1d6, 1.4); e.sol.position.set(-9, 12, 7); e.sol.castShadow = true;
    e.sol.shadow.mapSize.set(1024, 1024); Object.assign(e.sol.shadow.camera, { left: -10, right: 10, top: 8, bottom: -8, near: 1, far: 40 }); e.sol.shadow.bias = -.0006; escena.add(e.sol);
    e.foco = new T.PointLight(0xffc77a, 0, 7, 1.5); e.foco.position.set(-4.6, 1.6, -2.2); escena.add(e.foco);
    e.techo = new T.PointLight(0xfff2dc, 0, 16, 1.2); e.techo.position.set(-4, 2.6, 0); escena.add(e.techo);

    // Piso
    const pc = document.createElement("canvas"); pc.width = pc.height = 512; const pg = pc.getContext("2d");
    for (let i = 0; i < 8; i++) { pg.fillStyle = i % 2 ? "#5d4635" : "#674e3b"; pg.fillRect(0, i * 64, 512, 64); pg.fillStyle = "rgba(0,0,0,.25)"; pg.fillRect(0, i * 64, 512, 2); for (let j = 0; j < 3; j++) pg.fillRect(((i * 97 + j * 173) % 480) + 10, i * 64, 2, 64); }
    const pt = new T.CanvasTexture(pc); pt.colorSpace = T.SRGBColorSpace; pt.wrapS = pt.wrapT = T.RepeatWrapping; pt.repeat.set(1.5, 2);
    caja3(6, .2, 9, 0, -4, -.1, 0, { mat: new T.MeshStandardMaterial({ map: pt, roughness: .85 }), sombra: false });
    caja3(2, .2, 9, 0x4a5157, 0, -.1, 0, { sombra: false });
    caja3(6, .2, 4.5, 0x56606a, 4, -.1, -2.25, { sombra: false });
    caja3(6, .2, 4.5, 0x5f5850, 4, -.1, 2.25, { sombra: false });
    caja3(3.2, .02, 2.2, 0x2a6f66, -4, .012, 1.1, { sombra: false });
    // Paredes: las del fondo altas; las de adentro bajas para ver por encima
    caja3(14.2, 3, .16, 0x3b5163, 0, 1.5, -4.58);
    caja3(.16, 3, 9.2, 0x34495a, -7.08, 1.5, 0);
    const baja = (w, d, x, z) => caja3(w, 1.05, d, 0x4a6274, x, .52, z);
    baja(.12, 3.9, -1, -2.55); baja(.12, 3.9, -1, 2.55); baja(.12, 1.7, 1, -3.7); baja(.12, 1.7, 1, -.85); baja(.12, 1.7, 1, .85); baja(.12, 1.7, 1, 3.7); baja(6, .12, 4, 0);
    caja3(.12, 2.2, .12, 0xe9eef2, -.75, 1.1, 4.5); caja3(.12, 2.2, .12, 0xe9eef2, .75, 1.1, 4.5); caja3(1.62, .12, .12, 0xe9eef2, 0, 2.2, 4.5);
    caja3(1.2, .02, .7, 0x8a3b30, 0, .012, 3.9, { sombra: false });
    // Ventana
    e.ventana = lienzo(2.6, 1.6, 512, 316, -6.99, 1.8, -.2, 0, Math.PI / 2);
    [[1.8, .1, -1.55], [1.8, .1, 1.15]].forEach(([h, d, z]) => caja3(.08, h, d, 0xe9eef2, -6.97, 1.8, z, { sombra: false }));
    [[2.7, 2.65], [2.7, .95]].forEach(([d, y]) => caja3(.08, .1, d, 0xe9eef2, -6.97, y, -.2, { sombra: false }));
    // Escritorio, silla, monitor, lámpara
    caja3(2.2, .07, 1, 0x9a6b43, -4, .76, -2); caja3(2.1, .55, .05, 0x7b5434, -4, .46, -1.52);
    [[-1.03, -2.45], [1.03, -2.45], [-1.03, -1.55], [1.03, -1.55]].forEach(([dx, z]) => caja3(.06, .74, .06, 0x5f4029, -4 + dx, .37, z));
    const silla = (x, z, ry) => { const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = ry; escena.add(g);
      caja3(.55, .07, .52, 0x2c3b46, 0, .46, 0, { padre: g }); caja3(.55, .62, .07, 0x2c3b46, 0, .83, -.28, { padre: g });
      cil(.04, .04, .4, 0x56626b, 0, .25, 0, { padre: g }); cil(.3, .3, .04, 0x56626b, 0, .03, 0, { padre: g, seg: 5 }); };
    silla(-4, -3.05, 0);
    const mon = new T.Group(); mon.position.set(-3.6, .8, -1.95); mon.rotation.y = .5; escena.add(mon);
    caja3(.72, .45, .04, 0x1b2127, 0, .38, 0, { padre: mon }); e.pantalla = caja3(.64, .37, .01, 0x1f6f9e, 0, .38, .026, { padre: mon, emissive: 0x0f4a70, emissiveIntensity: .9 });
    caja3(.06, .2, .06, 0x1b2127, 0, .1, -.02, { padre: mon }); caja3(.5, .02, .16, 0x2b3239, -4, .81, -1.75);
    cil(.1, .12, .03, 0x20262b, -4.8, .82, -2.1); cil(.015, .015, .45, 0x20262b, -4.8, 1.05, -2.1);
    e.lampara = cil(.08, .14, .12, 0xffd58a, -4.8, 1.3, -2.1, { emissive: 0xffb44a, emissiveIntensity: .1 });
    cil(.05, .045, .1, 0xf1f4f6, -3.2, .85, -1.75);
    // Archivo, pizarra, cafetera, planta
    caja3(1, 1.35, .62, 0x8a98a3, -6.2, .68, -4.15);
    e.cajon = caja3(.9, .38, .05, 0xa7b3bb, -6.2, .68, -3.82); [.22, 1.14].forEach(y => caja3(.9, .38, .05, 0xa7b3bb, -6.2, y, -3.82));
    for (let i = 0; i < 3; i++) caja3(.3, .2 + i * .03, .24, [0xc8553d, 0x4a86c5, 0xd9b44a][i], -6.5 + i * .3, 1.46 + i * .015, -4.2);
    caja3(.06, 1.25, 2.1, 0xe9eef2, -7, 1.6, 2.4, { sombra: false });
    e.pizarra = lienzo(2, 1.15, 640, 368, -6.95, 1.6, 2.4, 0, Math.PI / 2);
    caja3(.5, .95, .45, 0x2b3239, -6.7, .48, 3.9); caja3(.36, .3, .3, 0x9aa4ab, -6.72, 1.1, 3.9); cil(.05, .045, .1, 0xf1f4f6, -6.6, 1.0, 3.75);
    cil(.22, .17, .34, 0xb7664a, -1.6, .17, -4.1);
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, h = new T.Mesh(new T.ConeGeometry(.09, .8, 6), mat(i % 2 ? 0x2f8f56 : 0x3aa564)); h.position.set(-1.6 + Math.cos(a) * .14, .75, -4.1 + Math.sin(a) * .14); h.rotation.set(Math.sin(a) * .5, 0, -Math.cos(a) * .5); h.castShadow = true; escena.add(h); }
    e.reloj = lienzo(.6, .6, 256, 256, -4, 2.45, -4.49);
    const letrero = lienzo(2.2, .5, 560, 128, -2.3, 2.4, -4.49);
    // Sala y tu oficina
    caja3(2.6, .07, 1.3, 0xd9d4ca, 4.2, .76, -2.2); cil(.12, .12, .7, 0x56626b, 3.4, .38, -2.2); cil(.12, .12, .7, 0x56626b, 5, .38, -2.2);
    silla(2.55, -2.2, Math.PI / 2); silla(5.85, -2.2, -Math.PI / 2); silla(4.2, -3.25, 0);
    const placa = lienzo(.5, .16, 200, 64, 5.4, .82, -2.2, -Math.PI / 2, 0);
    e.pantallaSala = lienzo(2.4, 1.3, 640, 346, 4.2, 1.65, -4.49);
    caja3(1.8, .07, .9, 0x9a6b43, 4.6, .76, 2.9); [[-.85, 2.5], [.85, 2.5], [-.85, 3.3], [.85, 3.3]].forEach(([dx, z]) => caja3(.06, .74, .06, 0x5f4029, 4.6 + dx, .37, z));
    silla(4.6, 3.75, Math.PI); caja3(.6, .4, .03, 0x1b2127, 4.6, 1.0, 2.7);
    cil(.18, .14, .3, 0xb7664a, 6.5, .15, 4.0); const bola = new T.Mesh(new T.SphereGeometry(.35, 12, 10), mat(0x3aa564)); bola.position.set(6.5, .6, 4.0); bola.castShadow = true; escena.add(bola);
    const texto = this._texto;
    const rotulo = (t, x, z, w = 2.6) => { const r2 = lienzo(w, .42, Math.round(w * 200), 84, x, .02, z, -Math.PI / 2, 0); texto(r2.g, t, r2.c.width / 2, 42, 40, "rgba(255,255,255,.82)", 700, "center"); r2.tex.needsUpdate = true; };
    rotulo("OFICINA DE ROBERTO", -4, 3.6, 3.2); rotulo("SALA DE REUNIONES", 4.2, -.6); rotulo("TU OFICINA", 3.2, 4.0, 2); rotulo("ENTRADA", 0, 3.0, 1.6);
    placa.g.fillStyle = "#f4f1e8"; placa.g.fillRect(0, 0, 200, 64); texto(placa.g, "TÚ", 100, 33, 40, "#14211f", 800, "center"); placa.tex.needsUpdate = true;
    { const { g, c, tex } = letrero; g.fillStyle = "#10161b"; g.fillRect(0, 0, c.width, c.height); g.shadowColor = "#4fd1b5"; g.shadowBlur = 20; texto(g, "ROBERTO · ASESOR", c.width / 2, 66, 54, "#a8fff0", 800, "center"); g.shadowBlur = 0; g.strokeStyle = "#4fd1b5"; g.lineWidth = 5; g.strokeRect(6, 6, c.width - 12, c.height - 12); tex.needsUpdate = true; }

    // Roberto
    e.yo = this._persona(e, mat);
    e.ag = { x: 0, z: 6.2, rot: 0, sentado: 0, nodo: "fuera", meta: "fuera", camino: [], fase: "quieto", paso: 0 };
    // Cámara
    e.mira = new T.Vector3(0, .6, 0); e.miraMeta = e.mira.clone(); e.v3 = new T.Vector3();
    e.az = .62; e.azMeta = .62; e.alt = .78; e.dist = 18; e.distMeta = 18; e.distBase = 18; e.seguir = false;
    this._poner(caja);
    // Arrastrar para girar; el botón cambia entre "ver todo" y "seguirlo"
    const el = r.domElement; let arr = null;
    el.addEventListener("pointerdown", ev => { arr = { x: ev.clientX, y: ev.clientY, az: e.azMeta, alt: e.alt, movio: false }; });
    el.addEventListener("pointermove", ev => { if (!arr) return; const dx = ev.clientX - arr.x, dy = ev.clientY - arr.y; if (Math.abs(dx) + Math.abs(dy) > 6) arr.movio = true; if (!arr.movio) return; e.azMeta = Math.max(-.9, Math.min(1.3, arr.az - dx / 240)); e.alt = Math.max(.35, Math.min(1.25, arr.alt + dy / 400)); e.pintarYa = true; });
    const soltar = () => { arr = null; }; el.addEventListener("pointerup", soltar); el.addEventListener("pointercancel", soltar); el.addEventListener("pointerleave", soltar);
    el.style.touchAction = "pan-y";
    if (window.ResizeObserver) new ResizeObserver(() => this.medir()).observe(caja);
  },

  _poner(caja) {
    const e = this.e; e.caja = caja;
    if (e.render.domElement.parentNode !== caja) caja.prepend(e.render.domElement);
    if (!e.burbuja) { e.burbuja = document.createElement("div"); e.burbuja.className = "rb3d-burbuja"; e.burbuja.setAttribute("aria-hidden", "true"); e.burbuja.hidden = true; }
    if (e.burbuja.parentNode !== caja) caja.appendChild(e.burbuja);
    if (!e.boton) {
      e.boton = document.createElement("button"); e.boton.type = "button"; e.boton.className = "rb3d-boton";
      e.boton.addEventListener("click", () => { e.seguir = !e.seguir; this._textoBoton(); if (!e.seguir) { e.miraMeta.set(0, .6, 0); e.distMeta = e.distBase; } e.pintarYa = true; });
      this._textoBoton();
    }
    if (e.boton.parentNode !== caja) caja.appendChild(e.boton);
    this.medir();
  },
  _textoBoton() { const e = this.e; e.boton.textContent = e.seguir ? "Ver toda la oficina" : "Seguir a Roberto"; e.boton.setAttribute("aria-pressed", String(e.seguir)); },

  medir() {
    const e = this.e; if (!e || !e.caja) return;
    const w = e.caja.clientWidth, h = e.caja.clientHeight; if (!w || !h) return;
    e.render.setSize(w, h, false); e.cam.aspect = w / h; e.cam.updateProjectionMatrix();
    const fovH = 2 * Math.atan(Math.tan(e.cam.fov * Math.PI / 360) * e.cam.aspect);
    e.distBase = Math.max(10.5, 6.2 / Math.tan(fovH / 2));
    if (!e.seguir) e.distMeta = e.distBase;
    e.pintarYa = true;
  },

  _persona(e, mat) {
    const T = e.T, raiz = new T.Group(), cad = new T.Group(); raiz.add(cad); e.escena.add(raiz);
    const p = (geo, col, x, y, z, padre = cad) => { const k = new T.Mesh(geo, mat(col, { roughness: .7 })); k.position.set(x, y, z); k.castShadow = true; padre.add(k); return k; };
    const saco = 0x1f2f4a, piel = 0xc58f68;
    p(new T.BoxGeometry(.42, .56, .24), saco, 0, .32, 0);
    p(new T.BoxGeometry(.14, .4, .02), 0xf1f4f6, 0, .36, .125); p(new T.BoxGeometry(.06, .32, .02), 0xe0a93b, 0, .36, .14);
    p(new T.CapsuleGeometry(.2, .06, 4, 10), 0x1b2638, 0, .02, 0).scale.set(1, .7, .8);
    const cabeza = new T.Group(); cabeza.position.set(0, .84, 0); cad.add(cabeza);
    p(new T.SphereGeometry(.15, 20, 16), piel, 0, 0, 0, cabeza); p(new T.CylinderGeometry(.05, .06, .08, 10), piel, 0, -.16, 0, cabeza);
    p(new T.SphereGeometry(.162, 20, 12, 0, Math.PI * 2, 0, Math.PI * .55), 0x161210, 0, .012, -.012, cabeza);
    [-.055, .055].forEach(x => p(new T.SphereGeometry(.02, 8, 8), 0x1b1b1b, x, .015, .14, cabeza));
    p(new T.BoxGeometry(.06, .012, .01), 0x7a3b30, 0, -.06, .148, cabeza);
    const brazo = l => { const h = new T.Group(); h.position.set(.27 * l, .54, 0); cad.add(h); p(new T.CapsuleGeometry(.055, .22, 4, 8), saco, 0, -.17, 0, h);
      const co = new T.Group(); co.position.set(0, -.34, 0); h.add(co); p(new T.CapsuleGeometry(.05, .2, 4, 8), saco, 0, -.14, 0, co); p(new T.SphereGeometry(.055, 10, 8), piel, 0, -.3, 0, co); return { h, co }; };
    const bd = brazo(1), bi = brazo(-1);
    const papel = new T.Mesh(new T.BoxGeometry(.2, .01, .27), mat(0xf7f7f2)); papel.position.set(0, -.32, .08); bi.co.add(papel);
    const taza = new T.Mesh(new T.CylinderGeometry(.045, .04, .09, 12), mat(0xf1f4f6)); taza.position.set(0, -.34, .04); bd.co.add(taza);
    const pierna = l => { const g = new T.Group(); g.position.set(.1 * l, 0, 0); cad.add(g); p(new T.CapsuleGeometry(.07, .3, 4, 8), 0x1b2638, 0, -.2, 0, g);
      const ro = new T.Group(); ro.position.set(0, -.42, 0); g.add(ro); p(new T.CapsuleGeometry(.06, .3, 4, 8), 0x1b2638, 0, -.2, 0, ro); p(new T.BoxGeometry(.12, .07, .24), 0x1b1b1f, 0, -.45, .05, ro); return { g, ro }; };
    return { raiz, cad, cabeza, bd, bi, pd: pierna(1), pi: pierna(-1), papel, taza };
  },

  // ---------- Caminos (x, z) y cómo se conectan: rodea el escritorio y usa las puertas ----------
  N: {
    fuera: [0, 6.2], entrada: [0, 3.7], pasT: [0, 2.2], pasA: [0, 0], pasS: [0, -2.2],
    aIn: [-1.8, 0], escE: [-2.5, -3.05], escW: [-5.6, -3.05], escritorio: [-4, -3.05], archivo: [-6.2, -3.3],
    pizarra: [-6.25, 2.4], cafe: [-6.15, 3.9], sIn: [1.7, -2.2], sala: [2.55, -2.2], tuOficina: [1.35, 2.2]
  },
  ARISTAS: [["fuera", "entrada"], ["entrada", "pasT"], ["pasT", "pasA"], ["pasA", "pasS"], ["pasA", "aIn"], ["aIn", "escE"], ["escE", "escritorio"], ["escritorio", "escW"], ["escW", "archivo"],
    ["archivo", "pizarra"], ["escW", "pizarra"], ["pizarra", "cafe"], ["aIn", "pizarra"], ["aIn", "cafe"], ["pasS", "sIn"], ["sIn", "sala"], ["pasT", "tuOficina"]],
  POSE: { escritorio: { rot: 0, sienta: true }, sala: { rot: Math.PI / 2, sienta: true }, archivo: { rot: Math.PI }, pizarra: { rot: -Math.PI / 2 }, cafe: { rot: -Math.PI / 2 }, tuOficina: { rot: Math.PI / 2 }, entrada: { rot: Math.PI }, fuera: { rot: 0 } },

  ruta(de, a) {
    const N = this.N, vec = {};
    this.ARISTAS.forEach(([x, y]) => { (vec[x] = vec[x] || []).push(y); (vec[y] = vec[y] || []).push(x); });
    const largo = (x, y) => Math.hypot(N[x][0] - N[y][0], N[x][1] - N[y][1]);
    const d = { [de]: 0 }, prev = {}, abiertos = new Set([de]), hechos = new Set();
    while (abiertos.size) {
      let u = null; abiertos.forEach(x => { if (u === null || d[x] < d[u]) u = x; }); abiertos.delete(u); hechos.add(u); if (u === a) break;
      (vec[u] || []).forEach(v => { if (hechos.has(v)) return; const nd = d[u] + largo(u, v); if (d[v] == null || nd < d[v]) { d[v] = nd; prev[v] = u; abiertos.add(v); } });
    }
    const r = []; let x = a; while (x && x !== de) { r.unshift(x); x = prev[x]; } return r;
  },

  _mover(dt) {
    const e = this.e, ag = e.ag, obj = e.obj, lugar = obj.lugar;
    const ponerEn = l => { ag.nodo = ag.meta = l; ag.camino = []; [ag.x, ag.z] = this.N[l]; ag.rot = (this.POSE[l] || {}).rot || 0; ag.sentado = (this.POSE[l] || {}).sienta ? 1 : 0; ag.fase = "quieto"; };
    if (e.saltar || this.calma()) { if (e.saltar || ag.nodo !== lugar) ponerEn(lugar); e.saltar = false; return; }
    if (lugar !== ag.meta) { ag.meta = lugar; ag.camino = this.ruta(ag.nodo, lugar); if (!ag.camino.length && ag.nodo !== lugar) ag.camino = [lugar]; }
    const girar = a => { let d = a - ag.rot; d = Math.atan2(Math.sin(d), Math.cos(d)); ag.rot += d * Math.min(1, dt * 8); };
    if (ag.camino.length) {
      if (ag.sentado > 0) { ag.sentado = Math.max(0, ag.sentado - dt * 2.4); ag.fase = "levanta"; return; }
      ag.fase = "anda";
      const [px, pz] = this.N[ag.camino[0]], dx = px - ag.x, dz = pz - ag.z, d = Math.hypot(dx, dz);
      if (d < .05) { ag.nodo = ag.camino.shift(); return; }
      const paso = Math.min(d, 1.4 * dt); ag.x += dx / d * paso; ag.z += dz / d * paso; girar(Math.atan2(dx, dz)); ag.paso += dt * 8.5;
    } else {
      ag.fase = "quieto"; const p = this.POSE[ag.nodo] || {}; girar(p.rot || 0);
      if (p.sienta) ag.sentado = Math.min(1, ag.sentado + dt * 2.4);
    }
  },

  _posar(t) {
    const e = this.e, ag = e.ag, p = e.yo, s = ag.sentado, anda = ag.fase === "anda" ? 1 : 0, sw = Math.sin(ag.paso) * anda, mov = this.calma() ? 0 : 1;
    p.raiz.visible = ag.nodo !== "fuera" || ag.camino.length > 0;
    p.raiz.position.set(ag.x, 0, ag.z); p.raiz.rotation.y = ag.rot;
    p.cad.position.y = .9 - .38 * s + (anda ? Math.abs(Math.cos(ag.paso)) * .025 : 0);
    p.pd.g.rotation.x = -Math.PI / 2 * s + sw * .7; p.pi.g.rotation.x = -Math.PI / 2 * s - sw * .7;
    p.pd.ro.rotation.x = Math.PI / 2 * s + Math.max(0, -sw) * .8; p.pi.ro.rotation.x = Math.PI / 2 * s + Math.max(0, sw) * .8;
    const quieto = ag.fase === "quieto", lugar = ag.nodo;
    let ud = -sw * .55, ui = sw * .55, fd = -.2, fi = -.2;
    if (s > .5 && lugar === "escritorio") { const r = i => Math.sin(t * 13 + i * 2) * .07 * mov; ud = -1.05 + r(0); ui = -1.05 + r(1); fd = -.75 + r(2); fi = -.75 + r(3); }
    if (s > .5 && lugar === "sala") { ud = -.9; ui = -.9; fd = -.9; fi = -.9; }
    if (quieto && lugar === "pizarra") { ud = -2.3 + Math.sin(t * 1.6) * .15 * mov; fd = -.4; ui = -.6; fi = -1.1; }
    if (quieto && lugar === "archivo") { ud = -1.1; fd = -.9 + Math.sin(t * 2) * .1 * mov; ui = -.8; fi = -1.1; }
    if (quieto && lugar === "cafe") { ud = -.6; fd = -1.6 + Math.max(0, Math.sin(t * 1.2)) * .5 * mov; }
    if (quieto && lugar === "tuOficina") { ud = -1.5; fd = -1.3 + Math.abs(Math.sin(t * 7)) * .5 * mov; }
    if (quieto && lugar === "entrada") { ud = -2.6 + Math.sin(t * 6) * .25 * mov; fd = -.2; }
    const suave = (o, v) => { o.rotation.x += (v - o.rotation.x) * .25; };
    suave(p.bd.h, ud); suave(p.bd.co, fd); suave(p.bi.h, ui); suave(p.bi.co, fi);
    p.papel.visible = ["archivo", "pizarra", "sala"].includes(lugar) || (anda && ["archivo", "sala"].includes(ag.meta));
    p.taza.visible = lugar === "cafe" && quieto;
    p.cabeza.rotation.y = mov * (s > .5 ? Math.sin(t * .7) * .22 : Math.sin(t * 1.2) * .08);
    p.cabeza.rotation.x = s > .5 && lugar === "escritorio" ? .12 : 0;
    e.cajon.position.z += ((quieto && lugar === "archivo" ? -3.45 : -3.82) - e.cajon.position.z) * .1;
  },

  // ---------- Dibujos ----------
  _texto(g, t, x, y, px, col, peso = 600, al = "left", max) { g.font = `${peso} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`; g.fillStyle = col; g.textAlign = al; g.textBaseline = "middle"; g.fillText(t, x, y, max); },

  _reloj(h, m) {
    const { g, c, tex } = this.e.reloj, R = c.width / 2;
    g.clearRect(0, 0, c.width, c.height); g.fillStyle = "#f4f1e8"; g.beginPath(); g.arc(R, R, R - 6, 0, 7); g.fill(); g.strokeStyle = "#20262b"; g.lineWidth = 12; g.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.lineWidth = i % 3 ? 4 : 8; g.beginPath(); g.moveTo(R + Math.sin(a) * (R - 30), R - Math.cos(a) * (R - 30)); g.lineTo(R + Math.sin(a) * (R - 46), R - Math.cos(a) * (R - 46)); g.stroke(); }
    const mano = (a, l, w) => { g.strokeStyle = "#20262b"; g.lineWidth = w; g.lineCap = "round"; g.beginPath(); g.moveTo(R, R); g.lineTo(R + Math.sin(a) * l, R - Math.cos(a) * l); g.stroke(); };
    mano(((h % 12) + m / 60) / 12 * Math.PI * 2, R * .5, 12); mano(m / 60 * Math.PI * 2, R * .75, 8); tex.needsUpdate = true;
  },

  _cielo(min) {
    const e = this.e, hr = min / 60, d = .5 + .5 * Math.cos((hr - 13) / 24 * Math.PI * 2), dia = Math.min(1, Math.max(0, (d - .25) / .5)); e.dia = dia;
    const { g, c, tex } = e.ventana, mez = (a, b) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * dia)).join(",")})`;
    const gr = g.createLinearGradient(0, 0, 0, c.height); gr.addColorStop(0, mez([8, 14, 40], [96, 160, 224])); gr.addColorStop(1, mez([26, 38, 74], [190, 222, 248])); g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
    const tarde = Math.max(0, 1 - Math.abs(dia - .45) * 4); if (tarde) { g.fillStyle = `rgba(255,150,80,${.45 * tarde})`; g.fillRect(0, c.height * .5, c.width, c.height * .5); }
    if (dia < .6) { g.fillStyle = `rgba(255,255,255,${.9 * (1 - dia / .6)})`; for (let i = 0; i < 40; i++) g.fillRect((i * 97) % c.width, (i * 53) % (c.height * .6), 2, 2); }
    if (hr >= 6 && hr <= 18) { const a = (hr - 6) / 12 * Math.PI; g.fillStyle = "#ffe9a8"; g.beginPath(); g.arc(c.width * (.15 + .7 * (a / Math.PI)), c.height * (.62 - .45 * Math.sin(a)), 24, 0, 7); g.fill(); }
    else { const t = ((hr + 6) % 24) / 12, a = t * Math.PI, x = c.width * (.15 + .7 * t), y = c.height * (.62 - .45 * Math.sin(a)); g.fillStyle = "#f2f4ff"; g.beginPath(); g.arc(x, y, 20, 0, 7); g.fill(); g.fillStyle = mez([8, 14, 40], [96, 160, 224]); g.beginPath(); g.arc(x + 8, y - 4, 18, 0, 7); g.fill(); }
    for (let i = 0; i < 9; i++) { const w = 48 + (i * 23) % 38, h = 90 + (i * 61) % 110, x = i * 60 - 10, y = c.height - h; g.fillStyle = mez([14, 20, 36], [88, 108, 132]); g.fillRect(x, y, w, h);
      g.fillStyle = `rgba(255,214,120,${.9 * (1 - dia)})`; for (let a = 0; a < Math.floor(w / 16); a++) for (let b = 0; b < Math.floor(h / 22); b++) if ((a * 7 + b * 3 + i) % 3) g.fillRect(x + 7 + a * 16, y + 8 + b * 22, 7, 9); }
    e.escena.background = new e.T.Color().setRGB(.05, .08, .1).lerp(new e.T.Color(0x8fb7d9), dia);
    tex.needsUpdate = true;
  },

  // Pizarra: su fase y sus metas activas (cuaderno.json). Sala: su reunión (pideHablar).
  _datosCambiaron() {
    const e = this.e, est = this.d && this.d.estado, cu = this.d && this.d.cuaderno, texto = this._texto;
    e.obj = null; // dónde debe estar se vuelve a calcular con lo nuevo
    { const { g, c, tex } = e.pizarra;
      g.fillStyle = "#f7f8f5"; g.fillRect(0, 0, c.width, c.height); g.strokeStyle = "#c9d0cc"; g.lineWidth = 8; g.strokeRect(4, 4, c.width - 8, c.height - 8);
      const fase = (cu && cu.fase && cu.fase.nombre) || (est && est.fase) || "";
      texto(g, "METAS", 28, 40, 32, "#1f6f5d", 800);
      if (fase) texto(g, "FASE: " + fase.toUpperCase(), c.width - 28, 40, 24, "#b7432f", 800, "right");
      const metas = ((cu && cu.metas) || []).filter(m => m && m.estado !== "lograda" && m.estado !== "cambiada").slice(0, 5);
      if (!metas.length) texto(g, "Todavía sin metas", 28, 110, 26, "#5b6b68", 600);
      metas.forEach((m, i) => {
        const num = typeof m.numero === "number" ? " · $" + m.numero.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "";
        const t = String(m.texto || "");
        texto(g, "○ " + (t.length > 34 ? t.slice(0, 33) + "…" : t) + num, 28, 100 + i * 52, 25, "#1d2a2a", 600, "left", c.width - 50);
      });
      tex.needsUpdate = true; }
    { const { g, c, tex } = e.pantallaSala, p = est && est.pideHablar;
      g.fillStyle = "#0f1a24"; g.fillRect(0, 0, c.width, c.height);
      if (p && p.donde === "sala") {
        texto(g, "REUNIÓN: " + String(p.tema || "").toUpperCase(), 30, 46, 30, "#a9cdf5", 800, "left", c.width - 60);
        (p.opciones || []).slice(0, 3).forEach((o, i) => { const t = `${o.id} · ${o.texto}`; g.fillStyle = "#1b3350"; g.fillRect(30, 96 + i * 72, c.width - 60, 56); texto(g, t.length > 40 ? t.slice(0, 39) + "…" : t, 50, 124 + i * 72, 26, "#eef3f6", 700, "left", c.width - 100); });
      } else texto(g, "Sala libre", c.width / 2, c.height / 2, 34, "#5f7a92", 700, "center");
      tex.needsUpdate = true; }
    e.pintarYa = true;
  },

  _burbuja() {
    const e = this.e, b = e.burbuja, ag = e.ag, yo = e.yo;
    const LUG = { escritorio: "mi escritorio", archivo: "el archivo", pizarra: "la pizarra", cafe: "la cafetera", sala: "la sala de reuniones", tuOficina: "tu oficina", entrada: "la entrada", fuera: "casa" };
    const t = ag.camino.length ? (ag.meta === "fuera" ? "Me voy a casa…" : `Voy a ${LUG[ag.meta]}…`) : e.obj.dice;
    if (!t || !yo.raiz.visible) { b.hidden = true; return; }
    b.hidden = false; if (b.textContent !== t) b.textContent = t;
    yo.cabeza.getWorldPosition(e.v3); e.v3.y += .38; e.v3.project(e.cam);
    const w = e.caja.clientWidth, h = e.caja.clientHeight, bw = b.offsetWidth, bh = b.offsetHeight;
    const x = Math.min(w - bw / 2 - 8, Math.max(bw / 2 + 8, (e.v3.x * .5 + .5) * w)), y = Math.max(bh + 8, (-e.v3.y * .5 + .5) * h);
    b.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) translateY(-8px)`;
  },

  // ---------- Bucle ----------
  empezar() {
    const e = this.e; if (!e || this.activo) return;
    this.activo = true; e.previo = performance.now(); e.saltar = true;
    const bucle = ahora => {
      if (!this.activo) return;
      e.raf = requestAnimationFrame(bucle);
      if (document.hidden) return;
      if (!e.caja || !e.caja.isConnected || e.caja.offsetParent === null) { this.pausar(); return; } // la pantalla se cerró
      const dt = Math.min(.1, (ahora - e.previo) / 1000); e.previo = ahora;
      if (this.calma() && !e.pintarYa && ahora - (e.ultimo || 0) < 1000) return;
      e.ultimo = ahora;
      try { this._cuadro(dt, ahora / 1000); } catch (x) { this.pausar(); }
    };
    e.raf = requestAnimationFrame(bucle);
  },
  pausar() { this.activo = false; if (this.e && this.e.raf) cancelAnimationFrame(this.e.raf); },

  _cuadro(dt, t) {
    const e = this.e, ny = this.ny();
    if (ny.min !== e.ultMin) { e.ultMin = ny.min; e.obj = this.objetivo(); this._reloj(ny.h, ny.m); this._cielo(ny.min + ny.s / 60); }
    if (!e.obj) e.obj = this.objetivo();
    this._mover(dt); this._posar(t);
    const dentro = e.obj.lugar !== "fuera" || e.ag.camino.length > 0, dia = e.dia == null ? 1 : e.dia;
    e.hemi.intensity = .25 + .7 * dia + (dentro ? .12 : 0); e.sol.intensity = 1.4 * dia;
    e.foco.intensity += ((dentro ? .4 + 2.2 * (1 - dia) : 0) - e.foco.intensity) * .1;
    e.techo.intensity += ((dentro ? 1.2 * (1 - dia) : 0) - e.techo.intensity) * .1;
    e.lampara.material.emissiveIntensity = dentro ? .2 + 1.5 * (1 - dia) : .02;
    e.pantalla.material.emissiveIntensity = dentro ? .9 : .05;
    if (e.seguir) { e.miraMeta.set(e.ag.x, .9, e.ag.z); e.distMeta = Math.max(7, e.distBase * .5); }
    e.az += (e.azMeta - e.az) * Math.min(1, dt * 5); e.dist += (e.distMeta - e.dist) * Math.min(1, dt * 3); e.mira.lerp(e.miraMeta, Math.min(1, dt * 3));
    e.cam.position.set(e.mira.x + Math.sin(e.az) * Math.cos(e.alt) * e.dist, e.mira.y + Math.sin(e.alt) * e.dist, e.mira.z + Math.cos(e.az) * Math.cos(e.alt) * e.dist);
    e.cam.lookAt(e.mira);
    e.render.render(e.escena, e.cam);
    e.pintarYa = false;
    this._burbuja();
  }
};
