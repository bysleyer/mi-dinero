# Mi dinero

App sencilla para manejar mi dinero. Funciona sin internet y **no envía nada a ningún servidor**: tus datos se quedan en el dispositivo.

## Archivos importantes

- **La app:** `index.html`, `estilos.css`, los `.js`, `manifest.json`, `sw.js` y la carpeta `iconos/`.
- **`mis-datos.json`:** tus cifras reales. **Nunca lo publiques ni lo subas a internet.** Guárdalo en una carpeta aparte.
- **`datos-ejemplo.js`:** cifras inventadas. La app las usa si no cargas tus datos.

## 1. Abrirla en la computadora

1. Pon los archivos de la app en una carpeta.
2. Dale doble clic a `index.html`. Se abre en tu navegador.
3. La primera vez te pide tu archivo: toca **"Elegir mis-datos.json"** y elígelo.

## 2. Publicarla gratis para usarla en el celular

Para instalarla en el celular necesitas que esté en una dirección web (https).
Antes de subir, revisa que en la carpeta **no estén `mis-datos.json` ni ningún respaldo** (`mi-dinero-AAAA-MM-DD.json`).

**Opción A — GitHub Pages (la recomiendo).** Es gratis, la dirección nunca cambia y queda guardada cada versión.

1. Crea una cuenta gratis en github.com.
2. Crea un repositorio nuevo llamado `mi-dinero`, de tipo público.
3. Toca **"uploading an existing file"** y arrastra los archivos de la app.
4. Toca **"Commit changes"**.
5. Ve a **Settings → Pages**. En "Branch" elige `main` y la carpeta `/ (root)`, y luego **Save**.
6. Espera uno o dos minutos. Tu app queda en `https://TU-USUARIO.github.io/mi-dinero/`.

**Opción B — Netlify Drop (la más rápida).**

1. Entra a app.netlify.com/drop.
2. Arrastra la carpeta de la app.
3. Crea una cuenta gratis para que el sitio no se borre.
4. Te da una dirección tipo `https://algo.netlify.app`.

Recomiendo la **A**, porque la dirección es fija y fácil de recordar. Si cambias de dirección, pierdes acceso a tus datos (ver la sección 5).

## 3. Instalarla en el celular

**iPhone (Safari):**

1. Abre la dirección de tu app en **Safari**.
2. Toca el botón **Compartir** (el cuadro con flecha hacia arriba).
3. Toca **"Agregar a pantalla de inicio"** y luego **Agregar**.
4. Abre la app **desde el ícono nuevo** y ahí carga tus datos (paso 4).
   En iPhone, la app instalada guarda sus datos aparte de Safari: lo que cargues en Safari no aparece en el ícono.

**Android (Chrome):**

1. Abre la dirección en Chrome.
2. Toca el menú **⋮**.
3. Toca **"Instalar app"** o **"Agregar a pantalla principal"**.

Después de abrirla una vez con internet, funciona sin internet.

## 4. Pasar mis datos al celular

**Si ya usas la app en la computadora (con movimientos):**

1. En la computadora, toca **Respaldo → Descargar respaldo**. Se baja `mi-dinero-AAAA-MM-DD.json`.
2. Pasa ese archivo al celular: por correo a ti mismo, WhatsApp a ti mismo, AirDrop o cable.
   Guárdalo en "Archivos" (iPhone) o "Descargas" (Android).
3. En el celular, abre la app instalada. En la pantalla **"Primera vez"**, toca **"Elegir mis-datos.json"** y elige el respaldo.
   Si la app ya tenía datos, entra a **Respaldo → Elegir archivo**.
4. Revisa el resumen (fecha y número de movimientos) y toca **"Sí, cargar este archivo"**.

**Si empiezas de cero en el celular:** haz lo mismo pero con `mis-datos.json`.

## 5. Muy importante: dónde quedan los datos

- Los datos quedan guardados **por dispositivo y por dirección web**. La computadora y el celular no se comparten nada entre sí.
- Si abres la app desde **otra dirección**, la app empieza vacía:
  - con doble clic en vez de la página web, o al revés;
  - de github.io a netlify.app;
  - o en iPhone, en Safari en vez del ícono instalado.
- **Antes de cambiar de dirección o de teléfono:** descarga un respaldo y cárgalo en el nuevo lugar.
- Si borras los datos del navegador, también se borran los de la app. Por eso la app te avisa cuando pasan más de 7 días sin respaldo.
- **Guarda tus respaldos en un lugar seguro y privado:** tienen todas tus cifras.

## 6. Cambiar mis cifras

1. Edita `mis-datos.json` con cualquier editor de texto. Usa punto para decimales y no borres comas, comillas ni llaves.
2. En la app, entra a **Respaldo → Elegir archivo**, elige `mis-datos.json` y confirma.
   Se cambian tus cifras y **se conservan tus movimientos**.
