---
name: mi-contexto
description: Carga (o guarda) el contexto completo del dueño de Mi dinero al empezar un chat nuevo. Solo cuando el usuario escribe /mi-contexto o /mi-contexto guardar. Nunca en revisiones automáticas del consejero.
disable-model-invocation: true
---

# Mi contexto

Esta skill existe para que cada chat nuevo sepa todo lo que sabía el anterior, sin pegar textos largos.
Tiene dos partes: **esta** (pública, sin datos personales) y **`CONTEXTO.md`** en el repositorio
privado `bysleyer/mi-dinero-datos` (quién es el usuario, su situación, decisiones y pendientes).

> Si eres una revisión automática del consejero (tarea programada), **no uses esta skill**:
> sigue solo tus instrucciones y `CONSEJERO.md`.

## Modo 1: `/mi-contexto` (cargar)

1. Ubica los dos repositorios (normalmente `/home/user/mi-dinero` y `/home/user/mi-dinero-datos`;
   si no, búscalos con `find / -maxdepth 4 -name CONSEJERO.md` y `-name sw.js`). Haz `git pull` en los dos.
   Si `mi-dinero-datos` no está conectado, dile al usuario que abra el chat con los dos repositorios.
2. Lee completos:
   - `mi-dinero-datos/CONTEXTO.md` (quién es, cómo trabajamos, decisiones, pendientes)
   - `mi-dinero-datos/consejero.json` (situación de hoy: informe, reglas, comentarios, respuestas)
   - el archivo más reciente de `mi-dinero-datos/historial/`
   - `mi-dinero-datos/CONSEJERO.md` solo si el tema es el consejero.
3. Mira en `mi-dinero/app.js` el número de `VERSION_APP` y los últimos 10 commits de los dos repos (`git log --oneline -10`).
4. Respóndele al usuario **en español**, en 3 a 5 líneas: qué entendiste (versión, situación de hoy, pendientes)
   y pregunta en qué seguimos. No cambies nada todavía.
5. Según el tema, usa las skills de la carpeta `.claude/skills` (ver su README.md): diseño y teléfono (mobile-native,
   emil-design-eng, apple-design, break-ui), animaciones (review-animations...), calidad web (performance,
   core-web-vitals, best-practices, accessibility) y PWA (progressive-web-app).

## Modo 2: `/mi-contexto guardar` (actualizar para el próximo chat)

(Idea tomada de la skill `handoff` de Matt Pocock, MIT: no repetir lo que ya está en commits o archivos; referenciarlos.
A diferencia de esa skill, aquí se guarda en el repo privado, porque la carpeta temporal se borra al terminar la sesión.)

Úsalo cuando el usuario lo pida, y **ofrécelo tú** al terminar algo importante (una decisión, una versión nueva,
un pendiente resuelto) o cuando el chat ya esté muy largo.

1. Actualiza `mi-dinero-datos/CONTEXTO.md`:
   - **Decisiones**: agrega lo que se decidió en este chat (fecha + una línea + por qué). No borres decisiones viejas
     salvo que el usuario las haya cambiado (entonces márcala como reemplazada).
   - **Pendientes**: quita lo resuelto, agrega lo nuevo, con lo que falta para decidir.
   - **La app**: versión actual y cambios grandes (una línea cada uno).
   - **Skills sugeridas**: si en este chat se usó o instaló alguna skill útil para lo que sigue, anótala.
   - Lo que el usuario contó de su vida que importe (trabajo, metas, trámites pendientes...). Sin copiar montos que cambian
     solos: para la situación al día se lee `consejero.json`.
2. Si cambió algo de cómo trabajamos o de cómo está hecha la app, actualiza también **esta** skill
   (es pública: **nunca** pongas aquí datos personales ni cifras).
3. Commit y push de los dos repos a `main` (en `mi-dinero-datos`: `git pull --rebase origin main` antes, porque
   la app y el consejero también suben ahí). Mensaje: "Contexto: actualizado".
4. Dile al usuario en una línea qué guardaste.

## Cómo trabajamos (resumen; el detalle está en CONTEXTO.md)
- Siempre en **español**, simple, con opciones y tu recomendación.
- **Antes de cambiar algo**: revisa con qué choca, explica las situaciones y espera "dale".
- Un "dale" después de hablar de varias cosas significa hacer **todo** lo hablado. Si algo no se puede o cambia cómo
  funciona la app, dilo claro (sí/no y por qué) antes de hacerlo.
- En diseño: mostrar imágenes de concepto y, al aplicar, **comparar lado a lado maqueta y app real** hasta que coincidan.
  Sé honesto con qué skills usaste; con impeccable, lee `reference/craft-floor.md` antes de cada cambio de interfaz.
- Después de cada cambio en la app: probar (Playwright en Node ya instalado; nunca reinstalarlo; las pruebas de toda la app
  están en `mi-dinero-datos/pruebas/`, y también hay que correr `consejero/analizar.js`), subir la versión
  (`VERSION_APP` en `app.js` y `CACHE` en `sw.js`, mismo número), commit, push a `main`, verificar GitHub Pages
  (`https://api.github.com/repos/bysleyer/mi-dinero/actions/runs?per_page=1`) y contar qué se probó.
  Si Pages da `startup_failure`, es GitHub: reintentar con un commit vacío.
- Nunca borrar historial ni `push --force` sin explicar y esperar confirmación.
- **Privacidad**: datos reales solo en `mis-datos.json` (excluido de git) y en el repo privado. Nunca pegar llaves en
  el chat. Nunca mandar datos personales a servicios externos ni a otras IAs.

## Cómo está hecha la app (resumen)
- HTML, CSS y JavaScript sin frameworks; PWA (`sw.js`). Publicada en GitHub Pages desde `main`.
- Diseño "Tablero" (modo oscuro, letra base 16 px, barra flotante abajo). Los estilos nuevos van en capas al final de
  `estilos.css`; los conceptos y la herramienta de comparación están en `mi-dinero-datos/propuestas/`.
  Antes de un cambio grande de diseño, deja una rama `respaldo/...` con la versión publicada.
- Una sola cuenta día por día: `Proyeccion.calcular` (`proyeccion.js`, 92 días). Lo guardado: `almacen.js` (prefijo `midinero:`).
- Módulos: `app.js`, `plan.js`, `futuro.js`, `planeados.js`, `pagos.js`, `mover.js`, `cubrir.js`, `avisos.js`,
  `sincronizar.js` (sync con el repo privado), `nav.js` (barra abajo en teléfono, menú lateral en computador),
  `consejero.js` (vigilante y pantalla del consejero), `arranque.js` (evita el salto al abrir).
- `consejero/analizar.js`: corre la app sin pantalla con `datos.json` y devuelve los números en JSON (lo usa el consejero).
- Reglas fijas del usuario que la app respeta: el tren y el taxi para ir a trabajar no se tocan; horas extra solo
  "si hay"; la app no asume pagos; las deudas atrasadas no llevan recargos inventados; las sugerencias de mover solo
  mueven el teléfono.
