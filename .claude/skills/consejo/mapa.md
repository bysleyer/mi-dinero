# Mapa de Mi dinero para el consejo

Léelo **antes** de abrir código: te ahorra explorar. Si algo aquí no coincide con el código, manda el código y dilo en tu informe.
Este archivo es público: no pongas aquí cifras, datos del dueño ni hallazgos abiertos (esos van en `mi-dinero-datos/consejo/informes/`).

## Hechos fijos (no los vuelvas a investigar)

- **Quién escribe `datos.json`:** solo la app, desde `sincronizar.js` (`subir`, PUT con `sha`). Roberto y el consejero **nunca** lo modifican (`mi-dinero-datos/roberto/ROBERTO.md:54`, `CONSEJERO.md:24`); solo lo leen y escriben sus propios archivos (`roberto/*.json`, `consejero.json`, `estado.json`, `historial/`).
- **Fechas `modificado`/`creado`:** la app las escribe siempre con `toISOString()` (UTC).
- **Ids:** la app pone `id` a todo lo que crea en las listas.
- **Borrar:** no se borra, se marca `borrado: true` (`papelera.js`); así lo entiende la sincronización.
- **localStorage:** solo lo toca `almacen.js`. Ningún otro archivo lo usa directamente.
- **Sin build ni librerías.** Excepción: three.js en `vendor/` solo para la oficina 3D de Roberto.
- **Un solo cálculo de saldo día a día:** `proyeccion.js`. Lo usan alcanza, escenarios, mover, plan, futuro y cubrir.
- **`SOLO SIMULA`:** `acuerdo.js` y `prestamo.js` no cambian saldos ni deudas.
- **Repo privado `mi-dinero-datos`:** una sola Action (`puente-home.yml`, cada 15 min y al cambiar `datos.json`), que usa los secretos `PUENTE_EMAIL` y `PUENTE_PASSWORD`. Las pruebas están en `pruebas/` (`bash pruebas/todo.sh`).
- **Versión:** `VERSION_APP` en `app.js`. El caché del service worker se sube a mano (`CACHE` en `sw.js`).

## Módulos (archivo · líneas aprox. · qué hace)

**Datos y sistema**
- `almacen.js` · 660 · el único que lee y guarda en el aparato; exportar e importar todo.
- `sincronizar.js` · 430 · sube y baja `datos.json` del repo privado con una llave de GitHub; combina local y remoto («gana el más reciente»); modo «solo ver». Desde ~359, la vista de solo ver (`VistaVer`).
- `respaldo.js` · 390 · descargar y cargar respaldo, primera vez.
- `candado.js` · 130 · Face ID / código del teléfono (WebAuthn); nada sale del aparato.
- `sw.js` · 100 · funciona sin internet; guarda en caché solo GET del mismo origen.
- `arranque.js`, `nav.js`, `app.js` (1030, lógica general y registro de gastos), `datos-ejemplo.js` (cifras inventadas).

**Dinero y cálculos**
- `proyeccion.js` · 600 · saldo día por día y cheques esperados (el cálculo central).
- `plan.js` · 630 · presupuesto semanal, colchón y sobres.
- `pagos.js` · 480 · vencimientos (renta, día 15, luz, internet, teléfono, préstamo semanal y pagos fijos).
- `pagosfijos.js` · 620 · pagos de cada mes.
- `deudas.js` · 450 · deudas, alerta del día 15 y su proyección.
- `planeados.js` · 1140 · gastos planeados y «¿Cuándo lo compro?».
- `jornadas.js` · 300 · días trabajados y próximo cheque. `calendario.js` (440) los muestra y edita.
- `colchon.js`, `alcanza.js`, `escenarios.js`, `mover.js`, `cubrir.js`, `futuro.js`, `liberado.js`, `explica.js`: pantallas que usan `proyeccion.js`.
- `resumen.js` · 430 · gastos por categoría y «¿Cuadra mi dinero?».
- `movimientos.js` · 150 · lista y búsqueda de movimientos. `papelera.js` · 90 · lo borrado en 30 días.
- `datosfijos.js` y `campos.js`: editar las cifras fijas con validación.
- `acuerdo.js`, `prestamo.js`, `acuerdos.js`: simuladores y bitácora de acuerdos por deuda.

**Consejeros y motivación**
- `consejero.js` · 420 · muestra el informe del consejero (Claude, tareas programadas). Lee de GitHub.
- `roberto.js` · 220 y `roberto3d.js` · 400 · pantalla y oficina 3D de Roberto. Solo leen.
- `patrones.js`, `mensajes.js`, `avisos.js`, `logros.js`, `xp.js`: cálculos en el teléfono, frases, campana, medallas y niveles.

## Ya verificado por el consejo (no lo repitas si el archivo no cambió desde ese commit)

Antes de dar algo por verificado, mira si cambió con `git log --oneline <commit>.. -- <archivo>`. Si no sale nada, no lo revises de nuevo.

- `sincronizar.js` @61d6610 (2026-11-20, Seguridad):
  - la llave no va en los respaldos (`almacen.js:69`, `:520`), ni en el caché del service worker, ni en la consola ni en la URL;
  - lo remoto se pinta con `textContent` o `escapar()`;
  - no hay llaves en el repo público.
- `sincronizar.js` @61d6610 (2026-11-20, Cuentas): con ids válidos y fechas ISO, `combinar()` no pierde ni duplica movimientos, y el borrado se propaga.
