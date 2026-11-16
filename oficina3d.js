/*
 * OFICINA 3D: la escena donde se ve trabajar al Contador y al Asesor (oficina.js decide QUÉ hacen; aquí solo se dibujan).
 * Usa three.js, que va incluido en la app (vendor/three-oficina.js, sin internet ni CDN) y solo se carga la primera vez
 * que abres la oficina, para que la app arranque igual de rápido que antes.
 * No guarda nada y no cambia ningún dato: solo lee lo que le da Oficina.
 * La oficina está abierta las 24 horas: la ventana muestra el día o la noche de Nueva York y de noche prenden las lámparas.
 * Con "reducir movimiento" activado en el aparato, los dos se quedan sentados y la escena casi no se mueve.
 */
const Oficina3D = {
  FUENTE: "vendor/three-oficina.js",
  // Lugares donde se paran (x, z). El piso es y = 0; la pared del fondo está en z = -3.2
  SILLAS: { contador: { x: -2, z: -2.5 }, asesor: { x: 2, z: -2.5 } },
  LUGARES: {
    contador: { archivero: { x: -0.45, z: -2.3 } },
    asesor: { archivero: { x: 0.45, z: -2.3 }, pizarra: { x: 3.4, z: -2.45 } }
  },
  _cargando: null,
  e: null,           // la escena armada (null hasta que se abre por primera vez)
  activo: false,     // ¿se está dibujando?

  // Carga three.js una sola vez. Devuelve una promesa; falla si no hay WebGL o no se pudo cargar el archivo.
  cargar() {
    if (window.THREE) return Promise.resolve();
    if (this._cargando) return this._cargando;
    this._cargando = new Promise((ok, mal) => {
      const s = document.createElement("script");
      s.src = this.FUENTE;
      s.onload = () => (window.THREE ? ok() : mal(new Error("three.js no cargó")));
      s.onerror = () => { this._cargando = null; mal(new Error("no se pudo cargar " + this.FUENTE)); };
      document.head.appendChild(s);
    });
    return this._cargando;
  },

  webgl() {
    try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; }
  },

  calma() { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); },

  // ---------- Armado de la escena ----------
  async iniciar(caja, { alElegir } = {}) {
    await this.cargar();
    if (this.e) { this.e.alElegir = alElegir; this._poner(caja); return; }
    const T = THREE;
    const e = this.e = { alElegir, T, caja, t0: performance.now(), reloj: 0, ultimaHora: -1, ultimoMin: -1, indice: {}, arrastre: null, foco: null };
    const r = e.render = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = T.SRGBColorSpace;
    r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
    r.domElement.className = "of-lienzo";
    r.domElement.setAttribute("role", "img");
    r.domElement.setAttribute("aria-label", "Oficina en 3D: el Contador y el Asesor trabajando con tus números. La lista de abajo dice lo mismo con palabras.");
    e.escena = new T.Scene();
    e.cam = new T.PerspectiveCamera(34, 1, 0.1, 60);
    e.mira = new T.Vector3(0, 1.1, -0.5); e.miraMeta = e.mira.clone();
    e.az = 0.5; e.azMeta = 0.5; e.alt = 0.42; e.dist = 12; e.distMeta = 12; e.distBase = 12;
    this._luces(e); this._cuarto(e); this._muebles(e);
    e.agentes = {
      contador: this._agente(e, "contador", { piel: 0xe0b08a, camisa: 0xf1f4f6, pantalon: 0x394957, pelo: 0x2b2118, chaleco: 0x2f9e87, corbata: 0x1d3b34, gafas: true, visera: true }),
      asesor: this._agente(e, "asesor", { piel: 0xc58f68, camisa: 0x1f2f4a, pantalon: 0x1b2638, pelo: 0x111111, corbata: 0xe0a93b, camisaInterior: 0xf1f4f6 })
    };
    this._poner(caja);
    this._eventos(e);
    this._cielo(e, true);
  },

  // Mete el lienzo y las burbujas dentro de la caja de la pantalla
  _poner(caja) {
    const e = this.e;
    e.caja = caja;
    if (e.render.domElement.parentNode !== caja) caja.prepend(e.render.domElement);
    ["contador", "asesor"].forEach(k => {
      const a = e.agentes[k];
      if (!a.burbuja) { a.burbuja = document.createElement("div"); a.burbuja.className = "of-burbuja"; a.burbuja.dataset.agente = k; a.burbuja.setAttribute("aria-hidden", "true"); }
      if (a.burbuja.parentNode !== caja) caja.appendChild(a.burbuja);
    });
    if (!e.hud) { e.hud = document.createElement("div"); e.hud.className = "of-hud"; e.hud.setAttribute("aria-hidden", "true"); }
    if (e.hud.parentNode !== caja) caja.appendChild(e.hud);
    this.medir();
  },

  medir() {
    const e = this.e; if (!e) return;
    const w = Math.max(280, e.caja.clientWidth), h = Math.max(260, e.caja.clientHeight);
    e.render.setSize(w, h, false);
    e.cam.aspect = w / h; e.cam.updateProjectionMatrix();
    // La oficina mide unos 9 m de ancho: se aleja la cámara lo justo para que quepa en pantallas angostas
    const fovH = 2 * Math.atan(Math.tan(e.cam.fov * Math.PI / 360) * e.cam.aspect);
    e.distBase = Math.max(11.5, 5.6 / Math.tan(fovH / 2));
    if (!e.foco) { e.dist = e.distMeta = e.distBase; }
    e.pintarYa = true;
  },

  _luces(e) {
    const T = e.T;
    e.hemi = new T.HemisphereLight(0xcfe3ff, 0x5a4636, 0.9);
    e.sol = new T.DirectionalLight(0xfff1d6, 1.5);
    e.sol.position.set(-7, 8, 4);
    e.sol.castShadow = true;
    e.sol.shadow.mapSize.set(1024, 1024);
    Object.assign(e.sol.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6, near: 1, far: 24 });
    e.sol.shadow.bias = -0.0006;
    e.escena.add(e.hemi, e.sol);
    e.lamparas = [-2, 2].map(x => { const l = new T.PointLight(0xffc77a, 0, 5, 1.6); l.position.set(x - 0.75, 1.35, -1.7); e.escena.add(l); return l; });
    e.luna = new T.DirectionalLight(0x8fb0ff, 0, 0); e.luna.position.set(-6, 6, 2); e.escena.add(e.luna);
  },

  // ---------- Piezas pequeñas ----------
  _mat(e, color, o = {}) { return new e.T.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.02, ...o }); },
  _caja(e, w, h, d, color, x, y, z, padre, o = {}) {
    const m = new e.T.Mesh(new e.T.BoxGeometry(w, h, d), o.mat || this._mat(e, color, o));
    m.position.set(x, y, z); m.castShadow = o.sombra !== false; m.receiveShadow = true;
    (padre || e.escena).add(m); return m;
  },
  _cil(e, rs, ri, h, color, x, y, z, padre, o = {}) {
    const m = new e.T.Mesh(new e.T.CylinderGeometry(rs, ri, h, o.seg || 20), this._mat(e, color, o));
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; (padre || e.escena).add(m); return m;
  },
  // Un cartel/pizarra: un plano con un lienzo 2D que se vuelve a dibujar cuando cambian los datos
  _cartel(e, w, h, px, py, x, y, z, rotY = 0) {
    const T = e.T, c = document.createElement("canvas"); c.width = px; c.height = py;
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: tex, toneMapped: false }));
    m.position.set(x, y, z); m.rotation.y = rotY; e.escena.add(m);
    return { m, c, ctx: c.getContext("2d"), tex };
  },

  _cuarto(e) {
    const T = e.T;
    // Piso de madera (rayas) y alfombra
    const piso = document.createElement("canvas"); piso.width = 512; piso.height = 512;
    const g = piso.getContext("2d");
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#5d4635" : "#664d3a"; g.fillRect(0, i * 64, 512, 64); g.fillStyle = "rgba(0,0,0,.28)"; g.fillRect(0, i * 64, 512, 2);
      for (let j = 0; j < 3; j++) g.fillRect(((i * 97 + j * 173) % 480) + 10, i * 64, 2, 64); }
    const tp = new T.CanvasTexture(piso); tp.colorSpace = T.SRGBColorSpace; tp.wrapS = tp.wrapT = T.RepeatWrapping; tp.repeat.set(2, 1.6);
    const suelo = this._caja(e, 8.4, 0.2, 6.8, 0, 0, -0.1, -0.2, null, { mat: new T.MeshStandardMaterial({ map: tp, roughness: 0.85 }), sombra: false });
    suelo.castShadow = false;
    this._caja(e, 3.4, 0.02, 2.2, 0x2a6f66, 0.3, 0.012, 0.5, null, { sombra: false });
    this._caja(e, 3.1, 0.022, 1.9, 0x205a53, 0.3, 0.014, 0.5, null, { sombra: false });
    // Paredes: fondo e izquierda (la derecha y el frente quedan abiertos para ver adentro)
    const pared = 0x3b5163;
    this._caja(e, 8.4, 3.3, 0.16, pared, 0, 1.55, -3.3);
    this._caja(e, 0.16, 3.3, 6.8, 0x34495a, -4.1, 1.55, -0.2);
    this._caja(e, 8.4, 0.16, 0.2, 0x26343f, 0, 0.08, -3.2, null, { sombra: false });
    this._caja(e, 0.2, 0.16, 6.8, 0x26343f, -4.0, 0.08, -0.2, null, { sombra: false });
    // Ventana grande en la pared izquierda: el cielo cambia con la hora de Nueva York
    e.ventana = this._cartel(e, 2.6, 1.7, 512, 336, -3.99, 1.75, 0.3, Math.PI / 2);
    const marco = 0xe9eef2;
    [[0.08, 1.86, 0.1, -3.97, 1.75, -1.0], [0.08, 1.86, 0.1, -3.97, 1.75, 1.6], [0.08, 0.1, 2.7, -3.97, 2.65, 0.3], [0.08, 0.1, 2.7, -3.97, 0.88, 0.3], [0.07, 1.7, 0.05, -3.96, 1.75, 0.3]]
      .forEach(([w, h, d, x, y, z]) => this._caja(e, w, h, d, marco, x, y, z, null, { sombra: false }));
    // Letrero "24 H" y reloj en la pared del fondo
    e.letrero = this._cartel(e, 1.9, 0.5, 512, 136, 0, 2.0, -3.2);
    e.relojCara = this._cartel(e, 0.62, 0.62, 256, 256, 0, 2.75, -3.2);
    // Tableros de datos detrás de cada escritorio
    this._caja(e, 2.06, 1.28, 0.05, 0x1a232b, -2, 1.98, -3.2, null, { sombra: false });
    this._caja(e, 2.06, 1.28, 0.05, 0x1a232b, 2, 1.98, -3.2, null, { sombra: false });
    e.tableros = { contador: this._cartel(e, 1.96, 1.18, 784, 472, -2, 1.98, -3.165), asesor: this._cartel(e, 1.96, 1.18, 784, 472, 2, 1.98, -3.165) };
  },

  _muebles(e) {
    const T = e.T;
    const madera = 0x9a6b43, metal = 0x8a98a3;
    // Escritorios (con silla detrás, de cara al cuarto)
    [-2, 2].forEach((x, i) => {
      this._caja(e, 2.1, 0.07, 0.95, madera, x, 0.76, -1.7);
      this._caja(e, 2.0, 0.55, 0.05, 0x7b5434, x, 0.46, -1.27);
      [[-0.98, -2.1], [0.98, -2.1], [-0.98, -1.3], [0.98, -1.3]].forEach(([dx, z]) => this._caja(e, 0.06, 0.74, 0.06, 0x5f4029, x + dx, 0.37, z));
      // silla
      const sx = x, sz = -2.55;
      this._caja(e, 0.55, 0.07, 0.52, 0x2c3b46, sx, 0.46, sz);
      this._caja(e, 0.55, 0.62, 0.07, 0x2c3b46, sx, 0.83, sz - 0.28);
      this._cil(e, 0.04, 0.04, 0.4, 0x56626b, sx, 0.25, sz);
      this._cil(e, 0.3, 0.3, 0.04, 0x56626b, sx, 0.03, sz, null, { seg: 5 });
      // monitor un poco girado hacia la cámara
      const mon = new T.Group(); mon.position.set(x + (i ? -0.35 : 0.35), 0.8, -1.65); mon.rotation.y = i ? 0.55 : 0.55; e.escena.add(mon);
      this._caja(e, 0.7, 0.44, 0.04, 0x1b2127, 0, 0.38, 0, mon);
      this._caja(e, 0.62, 0.36, 0.01, i ? 0x1f6f9e : 0x1d7a5d, 0, 0.38, 0.026, mon, { emissive: i ? 0x0f4a70 : 0x0e5a40, emissiveIntensity: 0.9 });
      this._caja(e, 0.06, 0.2, 0.06, 0x1b2127, 0, 0.1, -0.02, mon);
      this._caja(e, 0.24, 0.02, 0.16, 0x1b2127, 0, 0.01, 0, mon);
      this._caja(e, 0.5, 0.02, 0.16, 0x2b3239, x + (i ? 0.05 : -0.05), 0.81, -1.45);
      // lámpara de escritorio
      this._cil(e, 0.1, 0.12, 0.03, 0x20262b, x - 0.75, 0.82, -1.7);
      this._cil(e, 0.015, 0.015, 0.45, 0x20262b, x - 0.75, 1.05, -1.7);
      e.lampara = e.lampara || [];
      e.lampara.push(this._cil(e, 0.08, 0.14, 0.12, 0xffd58a, x - 0.75, 1.3, -1.7, null, { emissive: 0xffb44a, emissiveIntensity: 0.1 }));
    });
    // Contador: calculadora, libro mayor y pila de papeles
    this._caja(e, 0.2, 0.03, 0.28, 0x3a3f45, -1.35, 0.82, -1.5);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) this._caja(e, 0.04, 0.012, 0.04, 0xe0e5e8, -1.41 + i * 0.06, 0.845, -1.6 + j * 0.06, null, { sombra: false });
    this._caja(e, 0.4, 0.05, 0.3, 0x8b2e2e, -2.6, 0.83, -1.55); this._caja(e, 0.38, 0.03, 0.28, 0xf1ede2, -2.6, 0.87, -1.55);
    for (let i = 0; i < 5; i++) this._caja(e, 0.3, 0.012, 0.22, 0xf5f6f2, -2.7, 0.806 + i * 0.012, -1.95, null, { sombra: false });
    // Asesor: taza de café y carpeta
    this._cil(e, 0.05, 0.045, 0.1, 0xf1f4f6, 2.65, 0.85, -1.5); this._cil(e, 0.04, 0.04, 0.02, 0x4a2c1a, 2.65, 0.895, -1.5);
    this._caja(e, 0.32, 0.03, 0.42, 0x3563a6, 1.55, 0.82, -1.9);
    // Archivero con cajones (el del medio se abre cuando alguien lo consulta)
    this._caja(e, 1.0, 1.35, 0.62, metal, 0, 0.68, -2.88);
    e.cajones = [0.22, 0.68, 1.14].map(y => {
      const c = this._caja(e, 0.9, 0.38, 0.05, 0xa7b3bb, 0, y, -2.55); c.userData.z0 = -2.55;
      this._caja(e, 0.22, 0.04, 0.05, 0x39434a, 0, y + 0.1, -2.5, null, { sombra: false }).userData.sigue = c;
      return c;
    });
    for (let i = 0; i < 3; i++) this._caja(e, 0.34, 0.2 + i * 0.03, 0.26, [0xc8553d, 0x4a86c5, 0xd9b44a][i], -0.3 + i * 0.3, 1.45 + i * 0.015, -2.9);
    // Planta, cajas de archivo y bote de basura
    this._cil(e, 0.22, 0.17, 0.34, 0xb7664a, 3.5, 0.17, -2.5);
    for (let i = 0; i < 7; i++) {
      const hoja = new T.Mesh(new T.ConeGeometry(0.09, 0.8, 6), this._mat(e, i % 2 ? 0x2f8f56 : 0x3aa564));
      const a = i / 7 * Math.PI * 2; hoja.position.set(3.5 + Math.cos(a) * 0.14, 0.75, -2.5 + Math.sin(a) * 0.14);
      hoja.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); hoja.castShadow = true; e.escena.add(hoja);
    }
    this._caja(e, 0.55, 0.38, 0.4, 0xc7a46b, -3.5, 0.19, 1.2); this._caja(e, 0.5, 0.34, 0.38, 0xb89358, -3.45, 0.55, 1.22);
    this._cil(e, 0.17, 0.14, 0.38, 0x3d4a54, -3.4, 0.19, -2.7);
    // Foco del escritorio de cada agente (se prende de noche)
    e.faroles = e.lampara;
  },

  // ---------- Personas ----------
  _persona(e, c) {
    const T = e.T, mat = col => this._mat(e, col, { roughness: 0.7 });
    const raiz = new T.Group();
    const cad = new T.Group(); raiz.add(cad);
    const parte = (geo, col, x, y, z, padre) => { const m = new T.Mesh(geo, mat(col)); m.position.set(x, y, z); m.castShadow = true; (padre || cad).add(m); return m; };
    // torso, camisa y chaleco / saco
    parte(new T.BoxGeometry(0.42, 0.56, 0.24), c.camisa, 0, 0.32, 0);
    if (c.chaleco) { parte(new T.BoxGeometry(0.43, 0.5, 0.05), c.chaleco, 0, 0.32, 0.105); parte(new T.BoxGeometry(0.1, 0.3, 0.02), c.corbata, 0, 0.4, 0.14); }
    else { parte(new T.BoxGeometry(0.14, 0.4, 0.02), c.camisaInterior, 0, 0.36, 0.125); parte(new T.BoxGeometry(0.06, 0.32, 0.02), c.corbata, 0, 0.36, 0.14); }
    parte(new T.CapsuleGeometry(0.2, 0.06, 4, 10), c.pantalon, 0, 0.02, 0).scale.set(1, 0.7, 0.8);
    // cabeza, pelo, ojos
    const cabeza = new T.Group(); cabeza.position.set(0, 0.84, 0); cad.add(cabeza);
    parte(new T.SphereGeometry(0.15, 20, 16), c.piel, 0, 0, 0, cabeza);
    parte(new T.CylinderGeometry(0.05, 0.06, 0.08, 10), c.piel, 0, -0.16, 0, cabeza);
    const pelo = parte(new T.SphereGeometry(0.162, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), c.pelo, 0, 0.012, -0.012, cabeza);
    [-0.055, 0.055].forEach(x => parte(new T.SphereGeometry(0.02, 8, 8), 0x1b1b1b, x, 0.015, 0.14, cabeza));
    parte(new T.BoxGeometry(0.06, 0.012, 0.01), 0x7a3b30, 0, -0.06, 0.148, cabeza);
    if (c.gafas) [-0.055, 0.055].forEach(x => { const a = new T.Mesh(new T.TorusGeometry(0.04, 0.007, 8, 16), mat(0x20262b)); a.position.set(x, 0.015, 0.15); cabeza.add(a); });
    if (c.visera) { parte(new T.CylinderGeometry(0.17, 0.17, 0.015, 20, 1, false, -Math.PI / 2, Math.PI), 0x2f9e87, 0, 0.08, 0.1, cabeza).rotation.x = 0.1; }
    // brazos: hombro → antebrazo → mano
    const brazo = lado => {
      const h = new T.Group(); h.position.set(0.27 * lado, 0.54, 0); cad.add(h);
      parte(new T.CapsuleGeometry(0.055, 0.22, 4, 8), c.camisa, 0, -0.17, 0, h);
      const co = new T.Group(); co.position.set(0, -0.34, 0); h.add(co);
      parte(new T.CapsuleGeometry(0.05, 0.2, 4, 8), c.camisa, 0, -0.14, 0, co);
      parte(new T.SphereGeometry(0.055, 10, 8), c.piel, 0, -0.3, 0, co);
      return { h, co };
    };
    const bd = brazo(1), bi = brazo(-1);
    // hoja de papel que lleva en la mano izquierda (solo se ve al ir a consultar algo)
    const papel = new T.Mesh(new T.BoxGeometry(0.2, 0.01, 0.27), mat(0xf7f7f2)); papel.position.set(0, -0.32, 0.08); papel.visible = false; bi.co.add(papel);
    // piernas
    const pierna = lado => {
      const m = new T.Group(); m.position.set(0.1 * lado, 0, 0); cad.add(m);
      parte(new T.CapsuleGeometry(0.07, 0.3, 4, 8), c.pantalon, 0, -0.2, 0, m);
      const ro = new T.Group(); ro.position.set(0, -0.42, 0); m.add(ro);
      parte(new T.CapsuleGeometry(0.06, 0.3, 4, 8), c.pantalon, 0, -0.2, 0, ro);
      parte(new T.BoxGeometry(0.12, 0.07, 0.24), 0x1b1b1f, 0, -0.45, 0.05, ro);
      return { m, ro };
    };
    return { raiz, cad, cabeza, bd, bi, pd: pierna(1), pi: pierna(-1), papel };
  },

  _agente(e, clave, c) {
    const p = this._persona(e, c), s = this.SILLAS[clave];
    e.escena.add(p.raiz);
    p.raiz.traverse(o => { if (o.isMesh) o.userData.agente = clave; });
    const a = { clave, p, x: s.x, z: s.z, rot: 0, sentado: 1, fase: "quieto", lugar: "escritorio", ruta: [], fase0: clave === "asesor" ? 1.7 : 0, desfase: clave === "asesor" ? 8 : 0,
                paso: 0, trabajo: 0, texto: "", ultimoIndice: -1, burbuja: null };
    return a;
  },

  // ---------- Dibujo de los carteles ----------
  _texto(ctx, t, x, y, px, color, peso = "600", alinea = "left", max) {
    ctx.font = `${peso} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`; ctx.fillStyle = color; ctx.textAlign = alinea; ctx.textBaseline = "middle";
    ctx.fillText(t, x, y, max);
  },
  _redondo(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); },

  _dibujarTableros(datos, actual) {
    const e = this.e; if (!e) return;
    const COL = { ok: "#4fd1b5", aviso: "#f5b84b", alerta: "#ff7a6b" };
    const ICO = { ok: "✓", aviso: "!", alerta: "✕" };
    // Contador: libro del día
    {
      const { ctx, c, tex } = e.tableros.contador, lista = datos.contador, i = actual.contador;
      ctx.fillStyle = "#12201d"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = "#1c3a33"; ctx.fillRect(0, 0, c.width, 84);
      this._texto(ctx, "LIBRO DEL DÍA", 28, 44, 36, "#9be9d4", "800");
      let tengo = ""; try { tengo = dinero(Dinero.actual()); } catch (x) { /* sin cifra */ }
      this._texto(ctx, tengo, c.width - 28, 44, 42, "#ffffff", "800", "right");
      lista.slice(0, 5).forEach((x, n) => {
        const y = 128 + n * 66;
        if (n === i) { ctx.fillStyle = "rgba(79,209,181,.22)"; this._redondo(ctx, 14, y - 29, c.width - 28, 58, 12); ctx.fill(); }
        ctx.fillStyle = COL[x.estado]; ctx.beginPath(); ctx.arc(54, y, 20, 0, 7); ctx.fill();
        this._texto(ctx, ICO[x.estado], 54, y + 1, 26, "#0e1316", "900", "center");
        this._texto(ctx, x.titulo, 92, y, 31, n === i ? "#ffffff" : "#c9d6dc", n === i ? "800" : "600", "left", c.width - 120);
      });
      tex.needsUpdate = true;
    }
    // Asesor: rumbo (gasto por semana + lo más importante)
    {
      const { ctx, c, tex } = e.tableros.asesor, lista = datos.asesor, i = actual.asesor;
      ctx.fillStyle = "#101a26"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = "#1b3350"; ctx.fillRect(0, 0, c.width, 84);
      this._texto(ctx, "RUMBO", 28, 44, 36, "#a9cdf5", "800");
      this._texto(ctx, "gasto por semana", c.width - 28, 44, 28, "#a9cdf5", "600", "right");
      let sem = []; try { const p = Patrones.porSemana(); sem = (p && p.total && p.total.semanas) || []; } catch (x) { /* sin barras */ }
      const max = Math.max(1, ...sem), bw = 52, gap = 14, x0 = 28, base = 292, alto = 150;
      sem.forEach((v, n) => {
        const h = Math.max(4, v / max * alto), ult = n === sem.length - 1;
        ctx.fillStyle = ult ? "#4fd1b5" : "#3d6ea8"; this._redondo(ctx, x0 + n * (bw + gap), base - h, bw, h, 8); ctx.fill();
      });
      ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.beginPath(); ctx.moveTo(18, base + 6); ctx.lineTo(c.width - 18, base + 6); ctx.stroke();
      lista.slice(0, 6).forEach((x, n) => {
        const cx = 40 + n * 116, y = 350;
        ctx.fillStyle = COL[x.estado]; ctx.globalAlpha = n === i ? 1 : 0.55; ctx.beginPath(); ctx.arc(cx, y, 18, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
        this._texto(ctx, ICO[x.estado], cx, y + 1, 24, "#0e1316", "900", "center");
      });
      const act = lista[i];
      if (act) this._texto(ctx, act.titulo, 28, 418, 31, "#ffffff", "800", "left", c.width - 56);
      tex.needsUpdate = true;
    }
  },

  _dibujarLetrero() {
    const { ctx, c, tex } = this.e.letrero;
    ctx.fillStyle = "#10161b"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.shadowColor = "#4fd1b5"; ctx.shadowBlur = 22;
    this._texto(ctx, "OFICINA  24 H", c.width / 2, c.height / 2 + 4, 76, "#a8fff0", "900", "center");
    ctx.shadowBlur = 0; ctx.strokeStyle = "#4fd1b5"; ctx.lineWidth = 6; this._redondo(ctx, 8, 8, c.width - 16, c.height - 16, 22); ctx.stroke();
    tex.needsUpdate = true;
  },

  _dibujarReloj(h, m, s) {
    const { ctx, c, tex } = this.e.relojCara, R = c.width / 2;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#f4f1e8"; ctx.beginPath(); ctx.arc(R, R, R - 6, 0, 7); ctx.fill();
    ctx.strokeStyle = "#20262b"; ctx.lineWidth = 12; ctx.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.lineWidth = i % 3 ? 4 : 8; ctx.beginPath(); ctx.moveTo(R + Math.sin(a) * (R - 30), R - Math.cos(a) * (R - 30)); ctx.lineTo(R + Math.sin(a) * (R - 46), R - Math.cos(a) * (R - 46)); ctx.stroke(); }
    const mano = (ang, largo, ancho, col) => { ctx.strokeStyle = col; ctx.lineWidth = ancho; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(R, R); ctx.lineTo(R + Math.sin(ang) * largo, R - Math.cos(ang) * largo); ctx.stroke(); };
    mano(((h % 12) + m / 60) / 12 * Math.PI * 2, R * 0.5, 12, "#20262b");
    mano((m + s / 60) / 60 * Math.PI * 2, R * 0.75, 8, "#20262b");
    mano(s / 60 * Math.PI * 2, R * 0.78, 4, "#d94a3a");
    tex.needsUpdate = true;
  },

  // Cielo de la ventana: día, atardecer o noche con estrellas y luna, según la hora de Nueva York
  _cielo(e, forzar) {
    const hh = Oficina.hora(), hora = hh.hora + hh.minuto / 60;
    const d = 0.5 + 0.5 * Math.cos((hora - 13) / 24 * Math.PI * 2);  // 1 a la 1 p. m., 0 a la 1 a. m.
    const dia = Math.min(1, Math.max(0, (d - 0.25) / 0.5)); e.dia = dia;
    const T = e.T;
    e.escena.background = new T.Color().setRGB(0.05, 0.08, 0.1).lerp(new T.Color(0x8fb7d9), dia);
    e.hemi.intensity = 0.42 + 0.55 * dia; e.hemi.color.setHex(dia > 0.5 ? 0xcfe3ff : 0x7f95c9);
    e.sol.intensity = 1.55 * dia; e.luna.intensity = 0.4 * (1 - dia);
    e.lamparas.forEach(l => { l.intensity = 0.2 + 2.2 * (1 - dia); });
    (e.lampara || []).forEach(l => { l.material.emissiveIntensity = 0.15 + 1.6 * (1 - dia); });
    const n = Math.round(dia * 20); if (!forzar && n === e.cieloN && hh.minuto === e.cieloMin) return;
    e.cieloN = n; e.cieloMin = hh.minuto;
    const { ctx, c, tex } = e.ventana;
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    const mezcla = (a, b) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * dia)).join(",")})`;
    const atardecer = Math.max(0, 1 - Math.abs(dia - 0.45) * 4);
    g.addColorStop(0, mezcla([8, 14, 40], [96, 160, 224])); g.addColorStop(1, mezcla([26, 38, 74], [190, 222, 248]));
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    if (atardecer > 0) { ctx.fillStyle = `rgba(255,150,80,${0.45 * atardecer})`; ctx.fillRect(0, c.height * 0.5, c.width, c.height * 0.5); }
    if (dia < 0.6) { ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - dia / 0.6)})`; for (let i = 0; i < 40; i++) { const x = (i * 97) % c.width, y = (i * 53) % (c.height * 0.6); ctx.fillRect(x, y, i % 5 ? 2 : 3, i % 5 ? 2 : 3); } }
    // sol y luna: suben y bajan con la hora
    const ang = ((hora - 6) / 12) * Math.PI;  // 6 a. m. a 6 p. m.: el sol cruza el cielo
    if (hora >= 6 && hora <= 18) { ctx.fillStyle = "#ffe9a8"; ctx.beginPath(); ctx.arc(c.width * (0.15 + 0.7 * (ang / Math.PI)), c.height * (0.62 - 0.45 * Math.sin(ang)), 26, 0, 7); ctx.fill(); }
    else { const t = ((hora + 6) % 24) / 12, an = t * Math.PI; ctx.fillStyle = "#f2f4ff"; ctx.beginPath(); ctx.arc(c.width * (0.15 + 0.7 * t), c.height * (0.62 - 0.45 * Math.sin(an)), 22, 0, 7); ctx.fill(); ctx.fillStyle = "#0d1630"; ctx.beginPath(); ctx.arc(c.width * (0.15 + 0.7 * t) + 9, c.height * (0.62 - 0.45 * Math.sin(an)) - 4, 20, 0, 7); ctx.fill(); }
    // edificios con ventanitas prendidas de noche
    for (let i = 0; i < 9; i++) {
      const w = 48 + (i * 23) % 38, h = 90 + (i * 61) % 120, x = i * 60 - 10, y = c.height - h;
      ctx.fillStyle = mezcla([14, 20, 36], [88, 108, 132]); ctx.fillRect(x, y, w, h);
      ctx.fillStyle = `rgba(255,214,120,${0.9 * (1 - dia)})`;
      for (let a = 0; a < Math.floor(w / 16); a++) for (let b = 0; b < Math.floor(h / 22); b++) if ((a * 7 + b * 3 + i) % 3) ctx.fillRect(x + 7 + a * 16, y + 8 + b * 22, 7, 9);
    }
    tex.needsUpdate = true;
  },

  // ---------- Movimiento de cada persona ----------
  _poner_pose(a, t) {
    const p = a.p, s = a.sentado, w = a.paso, andando = a.fase === "andando" ? 1 : 0;
    const sw = Math.sin(w) * andando, calma = this.calma();
    p.raiz.position.set(a.x, 0, a.z); p.raiz.rotation.y = a.rot;
    p.cad.position.y = 0.9 - 0.38 * s;                     // la cadera baja al sentarse
    p.cad.position.z = 0.0 + 0.03 * s;
    p.cad.rotation.x = 0.07 * s * a.trabajo + (andando ? 0.04 : 0);
    // piernas: sentado el muslo va horizontal; caminando se balancean
    p.pd.m.rotation.x = -Math.PI / 2 * s + sw * 0.7; p.pi.m.rotation.x = -Math.PI / 2 * s - sw * 0.7;
    p.pd.ro.rotation.x = Math.PI / 2 * s + Math.max(0, -sw) * 0.8; p.pi.ro.rotation.x = Math.PI / 2 * s + Math.max(0, sw) * 0.8;
    // brazos
    const teclea = s > 0.5 && a.trabajo > 0.5 && !calma ? 1 : 0;
    const ruido = i => Math.sin(t * 13 + i * 2) * 0.07 * teclea;
    let ud = -sw * 0.55, ui = sw * 0.55, fd = -0.2, fi = -0.2;
    if (s > 0.5) { ud = -1.05 + ruido(0); ui = -1.05 + ruido(1); fd = -0.75 + ruido(2); fi = -0.75 + ruido(3); }
    // en el archivero/pizarra: el brazo derecho se levanta y señala; el izquierdo sostiene el papel
    const consulta = a.fase === "quieto" && a.sentado < 0.2 && a.lugar !== "escritorio" ? 1 : 0;
    if (consulta) { ud = -2.2 + Math.sin(t * 1.6) * 0.12; fd = -0.5; ui = -0.8; fi = -1.1; }
    p.bd.h.rotation.x += (ud - p.bd.h.rotation.x) * 0.25; p.bd.co.rotation.x += (fd - p.bd.co.rotation.x) * 0.25;
    p.bi.h.rotation.x += (ui - p.bi.h.rotation.x) * 0.25; p.bi.co.rotation.x += (fi - p.bi.co.rotation.x) * 0.25;
    p.papel.visible = a.lugar !== "escritorio" || andando > 0 && a.lugar !== "escritorio";
    // la cabeza mira la pantalla o se mueve un poco
    p.cabeza.rotation.y = calma ? 0 : (a.sentado > 0.5 ? Math.sin(t * 0.7 + a.fase0) * 0.22 : Math.sin(t * 1.2 + a.fase0) * 0.1);
    p.cabeza.rotation.x = a.sentado > 0.5 && !calma ? 0.12 + Math.sin(t * 0.9 + a.fase0) * 0.05 : 0;
  },

  _mover(a, dt, t, objetivo) {
    const ir = (x, z) => ({ x, z });
    const hacia = (px, pz, v) => {
      const dx = px - a.x, dz = pz - a.z, d = Math.hypot(dx, dz);
      if (d < 0.04) return true;
      const paso = Math.min(d, v * dt); a.x += dx / d * paso; a.z += dz / d * paso;
      const ang = Math.atan2(dx, dz); let dif = ang - a.rot; dif = Math.atan2(Math.sin(dif), Math.cos(dif)); a.rot += dif * Math.min(1, dt * 9);
      a.paso += dt * 8.5; return false;
    };
    const girar = (ang) => { let dif = ang - a.rot; dif = Math.atan2(Math.sin(dif), Math.cos(dif)); a.rot += dif * Math.min(1, dt * 8); };
    const silla = this.SILLAS[a.clave];
    if (this.calma()) { a.sentado = 1; a.x = silla.x; a.z = silla.z; a.rot = 0; a.fase = "quieto"; a.lugar = "escritorio"; a.trabajo = 1; return; }
    a.trabajo += ((a.fase === "quieto" ? 1 : 0) - a.trabajo) * Math.min(1, dt * 4);
    if (a.fase === "quieto") {
      if (objetivo !== a.lugar) { a.destino = objetivo; a.fase = a.sentado > 0.01 ? "levantando" : "andando"; }
      else if (a.lugar === "escritorio") { girar(0); a.sentado += (1 - a.sentado) * Math.min(1, dt * 6); }
      else { const l = this.LUGARES[a.clave][a.lugar]; girar(Math.PI); a.x += (l.x - a.x) * Math.min(1, dt * 4); }
    }
    if (a.fase === "levantando") {
      a.sentado = Math.max(0, a.sentado - dt * 2.2);
      if (a.sentado <= 0) a.fase = "andando";
    }
    if (a.fase === "andando") {
      const meta = a.destino === "escritorio" ? silla : this.LUGARES[a.clave][a.destino];
      if (!meta) { a.fase = "quieto"; a.lugar = a.destino = "escritorio"; return; }
      if (hacia(meta.x, meta.z, 1.25)) { a.lugar = a.destino; a.fase = a.lugar === "escritorio" ? "sentando" : "quieto"; a.paso = 0; }
    }
    if (a.fase === "sentando") {
      girar(0); a.sentado = Math.min(1, a.sentado + dt * 2.2);
      if (a.sentado >= 1 && Math.abs(a.rot) < 0.05) { a.fase = "quieto"; }
    }
  },

  // ---------- Bucle ----------
  empezar() {
    const e = this.e; if (!e || this.activo) return;
    this.activo = true; e.previo = performance.now();
    const bucle = ahora => {
      if (!this.activo) return;
      e.raf = requestAnimationFrame(bucle);
      const dt = Math.min(0.1, (ahora - e.previo) / 1000); e.previo = ahora;
      // en "reducir movimiento" se dibuja solo una vez por segundo
      if (this.calma() && !e.pintarYa && ahora - (e.ultimoCuadro || 0) < 1000) return;
      e.ultimoCuadro = ahora; this._cuadro(dt, ahora / 1000);
    };
    e.raf = requestAnimationFrame(bucle);
  },
  pausar() { this.activo = false; if (this.e && this.e.raf) cancelAnimationFrame(this.e.raf); },

  // `datos` = Oficina.revisar(); se guarda para pintar los tableros y las burbujas
  datos(d) { if (this.e) { this.e.d = d; this.e.indice = {}; this.e.tablerosSucios = true; } },

  _cuadro(dt, t) {
    const e = this.e, d = e.d; if (!d) { e.render.render(e.escena, e.cam); return; }
    const ahora = Date.now(), hh = Oficina.hora();
    // reloj y cielo: una vez por segundo / por minuto
    if (hh.segundo !== e.ultimoSeg) { e.ultimoSeg = hh.segundo; this._dibujarReloj(hh.hora, hh.minuto, hh.segundo); this._cielo(e, false); this._hud(hh); }
    if (!e.letreroListo) { this._dibujarLetrero(); e.letreroListo = true; }
    // cada agente: qué revisión toca, a dónde ir y qué decir
    ["contador", "asesor"].forEach(k => {
      const a = e.agentes[k], lista = d[k], cur = Oficina.actual(lista, ahora, a.desfase), tarea = lista[cur.i];
      if (cur.i !== e.indice[k]) { e.indice[k] = cur.i; e.tablerosSucios = true; }
      this._mover(a, dt, t, tarea ? tarea.lugar : "escritorio");
      this._poner_pose(a, t);
      a.tarea = tarea; a.progreso = cur.progreso;
      // cajón del archivero: se abre mientras alguien lo consulta
    });
    if (e.tablerosSucios) { e.tablerosSucios = false; this._dibujarTableros(d, { contador: e.indice.contador || 0, asesor: e.indice.asesor || 0 }); }
    const abre = ["contador", "asesor"].some(k => e.agentes[k].lugar === "archivero" && e.agentes[k].fase === "quieto");
    e.cajones[1].position.z += ((abre ? -2.2 : -2.55) - e.cajones[1].position.z) * Math.min(1, dt * 5);
    e.cajones.forEach(c => { }); this._asas(e);
    // cámara
    e.az += (e.azMeta - e.az) * Math.min(1, dt * 5); e.dist += (e.distMeta - e.dist) * Math.min(1, dt * 4); e.mira.lerp(e.miraMeta, Math.min(1, dt * 4));
    const cx = e.mira.x + Math.sin(e.az) * Math.cos(e.alt) * e.dist, cy = e.mira.y + Math.sin(e.alt) * e.dist, cz = e.mira.z + Math.cos(e.az) * Math.cos(e.alt) * e.dist;
    e.cam.position.set(cx, cy, cz); e.cam.lookAt(e.mira);
    e.render.render(e.escena, e.cam);
    e.pintarYa = false;
    this._burbujas(e);
  },

  _asas(e) { e.cajones.forEach(c => { e.escena.children.forEach(o => { if (o.userData && o.userData.sigue === c) o.position.z = c.position.z + 0.05; }); }); },

  _hud(hh) {
    const e = this.e, noche = e.dia < 0.35;
    e.hud.innerHTML = `<span>${noche ? "🌙" : e.dia < 0.7 ? "🌆" : "☀️"}</span><b>${hh.texto}</b><small>${noche ? "Turno de noche" : e.dia < 0.7 ? "Turno de tarde" : "Turno de día"} · Nueva York</small>`;
  },

  _burbujas(e) {
    const T = e.T, v = new T.Vector3(), w = e.render.domElement.clientWidth, h = e.render.domElement.clientHeight;
    const ICO = { ok: "✓", aviso: "!", alerta: "⚠" }, ETQ = { ok: "todo bien", aviso: "mirar", alerta: "atención" };
    ["contador", "asesor"].forEach(k => {
      const a = e.agentes[k], b = a.burbuja; if (!b) return;
      const t = a.tarea, listo = a.progreso > 0.6 && a.fase === "quieto" || (a.progreso > 0.6 && a.lugar === "escritorio");
      const caminando = a.fase !== "quieto";
      const texto = !t ? "" : caminando ? (a.destino === "escritorio" ? "Vuelvo a mi escritorio" : "Voy a consultar…") : listo ? `${ICO[t.estado]} ${t.titulo}: ${ETQ[t.estado]}` : t.haciendo;
      const clave = texto + "|" + (t ? t.estado : "") + (listo ? 1 : 0);
      if (b.dataset.clave !== clave) { b.dataset.clave = clave; b.textContent = texto; b.className = "of-burbuja" + (listo && t ? " " + t.estado : "") + (e.foco === k ? " foco" : ""); }
      a.p.cabeza.getWorldPosition(v); v.y += 0.34; v.project(e.cam);
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      const ancho = b.offsetWidth || 160, minx = ancho / 2 + 6, maxx = w - ancho / 2 - 6;
      b.style.transform = `translate(${Math.min(maxx, Math.max(minx, x))}px, ${Math.max(b.offsetHeight + 6, y)}px) translate(-50%, -100%)`;
    });
  },

  // ---------- Toques y arrastre ----------
  _eventos(e) {
    const el = e.render.domElement, T = e.T, ray = new T.Raycaster(), p = new T.Vector2();
    el.style.touchAction = "pan-y";
    el.addEventListener("pointerdown", ev => { e.arrastre = { x: ev.clientX, y: ev.clientY, az: e.azMeta, movido: false }; el.setPointerCapture && el.setPointerCapture(ev.pointerId); });
    el.addEventListener("pointermove", ev => {
      const a = e.arrastre; if (!a) return;
      const dx = ev.clientX - a.x;
      if (Math.abs(dx) > 6) a.movido = true;
      if (a.movido) { e.azMeta = Math.max(-0.15, Math.min(1.0, a.az - dx / 260)); e.pintarYa = true; }
    });
    const fin = ev => {
      const a = e.arrastre; e.arrastre = null; if (!a || a.movido || ev.type === "pointercancel") return;
      const r = el.getBoundingClientRect(); p.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(p, e.cam);
      const golpes = ray.intersectObjects(["contador", "asesor"].map(k => e.agentes[k].p.raiz), true);
      const k = golpes.length ? golpes[0].object.userData.agente : null;
      if (k && e.alElegir) e.alElegir(k);
    };
    el.addEventListener("pointerup", fin); el.addEventListener("pointercancel", fin);
    if (window.ResizeObserver) new ResizeObserver(() => this.medir()).observe(e.caja);
    window.addEventListener("resize", () => this.medir());
  },

  // Acerca la cámara a un agente (o vuelve a ver todo con null)
  enfocar(k) {
    const e = this.e; if (!e) return;
    e.foco = k; e.pintarYa = true;
    if (!k) { e.miraMeta.set(0, 1.1, -0.5); e.distMeta = e.distBase; e.azMeta = 0.5; return; }
    const s = this.SILLAS[k];
    e.miraMeta.set(s.x, 1.0, -1.9); e.distMeta = Math.max(6.5, e.distBase * 0.55); e.azMeta = 0.35;
    ["contador", "asesor"].forEach(x => { const b = e.agentes[x].burbuja; if (b) b.classList.toggle("foco", x === k); });
  }
};
