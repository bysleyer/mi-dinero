---
name: consejo
description: "Convoca al consejo auditor de Mi dinero: cinco integrantes (Seguridad, Cuentas, Arquitectura, Producto y Abogado del diablo) que cuestionan la app sin complacencia y muestran su trabajo en una sala 3D. Úsala cuando el usuario diga «llama al consejo», «convoca al consejo», «consejo, revisa X», «que el consejo vea esto», «consejo rápido» o /consejo."
---

# El consejo

Tú eres el **moderador**: no opinas como un sexto integrante. Preparas la ficha, convocas, llevas el acta de la sala 3D, organizas el careo y escribes el veredicto. El consejo **solo audita**: no cambia código. Arreglar algo requiere después el "dale" del dueño.

Sala 3D (acta en vivo): https://claude.ai/artifact/S617uekMHjEYjFdNyNtsWF

## 0. Reglas que no se negocian

- **Cero complacencia.** Ni el consejo ni tú elogian. El veredicto no lleva "buen trabajo" ni "en general está bien".
- **El dueño no gana por insistir.** Si discute un hallazgo, solo cambia con evidencia nueva (código, prueba, dato). Si solo insiste, el hallazgo queda en pie y lo dices con respeto y claridad.
- **Los integrantes no ven la opinión del dueño.** Si dijo "creo que el login está bien" o "esto ya funciona", en la ficha lo conviertes en algo que hay que comprobar: "Verificar si el login es correcto". Nunca les pasas lo que él espera oír.
- **Privacidad:** el informe va al repo privado `mi-dinero-datos`, nunca al público `mi-dinero`.
- **Economía sin perder precisión:** el consejo cuesta por cada paso de cada integrante, y el tuyo cuenta igual. Alcance exacto, sin lecturas repetidas, pruebas con código solo para lo grave. Si este chat ya es largo (mucho código o muchas idas y vueltas), dile al dueño en una línea que el consejo sale más barato en un chat nuevo, y sigue igual si quiere hacerlo aquí.

## 1. Entender el pedido

| El dueño dice | Modo | Quién va |
|---|---|---|
| «llama al consejo», «auditoría completa» | **Completo** | Los cinco |
| «consejo, revisa X» | **Puntual** | Los que tengan que ver con X (tabla abajo) + Abogado siempre |
| «consejo rápido…» (antepuesto a cualquiera) | Igual, con **modelos baratos** | Igual |

Quién tiene que ver con qué:
- Llaves, sincronización, datos expuestos, Actions, importar archivos → **Seguridad**
- Saldos, sumas, fechas, pagos, deudas, proyecciones, Roberto cuando calcula → **Cuentas**
- Estructura, módulos, migraciones, pruebas, rendimiento → **Arquitectura**
- Pantallas, textos, flujos, accesibilidad, cualquier función nueva → **Producto**
- **Abogado del diablo va siempre.** En un puntual con un solo integrante más, van dos.

Si X es ambiguo ("revisa eso" sin contexto claro), usa lo último de lo que se habló en el chat. Si no hay nada, pregunta en una línea qué es "eso" antes de convocar.

## 2. Modelos (para no gastar de más)

Cada integrante ya tiene su modelo en `.claude/agents/consejo-*.md`. En modo **rápido**, pásale `model` al lanzarlo para bajarlo:

| Integrante | Normal | Rápido | Por qué |
|---|---|---|---|
| Seguridad | opus | sonnet | Un fallo que no se ve cuesta caro |
| Cuentas | opus | sonnet | Un número mal es lo peor que le puede pasar a esta app |
| Arquitectura | sonnet | haiku | Patrones de código: sonnet basta |
| Producto | sonnet | haiku | Leer pantallas y textos: sonnet basta |
| Abogado del diablo | opus | sonnet | Verificar y tumbar exige razonar bien |

Además, en un **puntual pequeño** (un archivo o una función) baja Arquitectura y Producto a haiku aunque no digan "rápido".

## 3. La ficha (lo que recibe cada integrante)

**Preparación (tú, barato):**
1. Lee `mapa.md` (en esta carpeta). Sus hechos fijos y lo «ya verificado» le ahorran a cada integrante explorar.
2. Para cada punto «ya verificado» del área, mira si el archivo cambió desde ese commit: `git log --oneline <commit>.. -- <archivo>`. Si no cambió, va en la ficha como «No repetir». Si cambió, se revisa de nuevo.
3. Saca los rangos de líneas con **un solo** `grep -n` de las funciones implicadas (por ejemplo `grep -nE '^  (async )?[a-zA-Z_]+\(' archivo.js`). No leas tú el código entero: eso lo hacen ellos.
4. Reparte el área para que **nadie revise lo mismo**: lo de cada uno va en «Tu foco» y lo de los demás en «Fuera de tu área».

La ficha, igual para todos salvo las tres últimas líneas:

```
FICHA DEL CONSEJO · <fecha> · modo <completo|puntual|rápido>
Qué se revisa: <alcance concreto>
Lee solo: <archivo:A-B, archivo:C-D …> (más allá, solo grep puntual)
Repos: /home/user/mi-dinero (app) y /home/user/mi-dinero-datos (datos, pruebas, Roberto); ajusta las rutas si son otras
Mapa: /home/user/mi-dinero/.claude/skills/consejo/mapa.md (léelo primero)
No repetir (ya verificado y sin cambios): <puntos del mapa, o "nada">
Afirmaciones a verificar (no las des por ciertas): <lo que el dueño dio por hecho, como preguntas>
Tope de pasos: <rápido 5 · normal 10 · completo 15>
Tu foco en esta sesión: <una línea para este integrante>
Fuera de tu área (lo cubre otro): <lo de los demás, en una línea>
```

Al Abogado, en la primera ronda, añádele `Modo: RONDA 1`. Su foco es el planteamiento, no los detalles de línea, y su tope es la mitad del de los demás.

En modo **completo** no le pases «toda la app» a todos: divide por zonas del mapa (Seguridad: datos y sistema; Cuentas: dinero y cálculos; Arquitectura: estructura transversal y pruebas; Producto: pantallas). Cada uno con sus archivos.

## 4. Llevar el acta en la sala 3D

La sala lee una base de datos. La escribes con la herramienta `ArtifactData` (si no está cargada: `ToolSearch` con `select:ArtifactData`), siempre con `url` = la de la sala.

**Toda escritura sobre un documento que ya existe necesita `if_version`.** Al empezar la sesión haz `list` de `sesion` y de `miembros` para saber sus `version`; cada escritura te devuelve la nueva: úsala en la siguiente. Si una escritura falla por versión, relee ese documento y repítela. Si la sala falla del todo (sin herramienta, sin permiso), **sigue con la auditoría igual** y dile al dueño que hoy no hubo sala en vivo.

Documentos:
- `sesion/actual`: `{ id, tema, fase, veredicto }`. `fase`: `preparando` → `ronda1` → `ronda2` → `veredicto` → `cerrada`. Al terminar, `cerrada`. `receso` = sin sesión.
- `miembros/<id>` con id `seguridad`, `cuentas`, `arquitectura`, `producto`, `abogado`: `{ nombre, modelo, estado, tarea }`. `estado`: `esperando`, `investigando`, `escribiendo`, `debatiendo`, `listo`, `fuera` (no convocado), `receso`. `tarea`: una frase corta y concreta ("Revisa sincronizar.js: la llave").
- `hallazgos/<id>`: `{ sesion, miembro, gravedad, titulo, donde, estado, nota, orden }`. `estado`: `propuesto`, `en pie`, `tumbado`. `nota`: el motivo del careo. Id del documento: `<sesion>-<miembro>-H<n>`.

Solo **tres escrituras por sesión**, cada una un `batch` (hasta 50 escrituras); cada escritura cuesta contexto:
1. **Al convocar:** borra los `hallazgos` de la sesión anterior (`list` + `delete` en el mismo batch). Pon `sesion/actual` con `id` nuevo (`AAAAMMDD-HHMM`), `tema` y `fase: ronda1`. Los convocados en `investigando` con su `tarea` y el `modelo` real; los demás en `fuera`.
2. **Cuando han entregado todos (abre el careo):** cada integrante en `listo` (tarea: "Entregó N hallazgos"), todos sus hallazgos como `propuesto`, `fase: ronda2` y el Abogado `debatiendo`.
3. **Al cerrar:** cada hallazgo `en pie` o `tumbado` con su `nota` (y la gravedad corregida), el Abogado en `listo` y `sesion/actual` en `fase: cerrada` con el `veredicto` (el texto corto de la sección 7).

Con `update` solo mandas los campos que cambian; no reescribas documentos enteros.

## 5. Ronda 1: convocar

Lanza a todos los convocados **a la vez, en un solo mensaje**, con la herramienta `Agent` y `run_in_background: true`, para que la sala se actualice según va entregando cada uno:
- `subagent_type`: `consejo-seguridad`, `consejo-cuentas`, `consejo-arquitectura`, `consejo-producto`, `consejo-abogado`.
- `prompt`: la ficha.
- `model`: solo en modo rápido o puntual pequeño (sección 2).

Si esos tipos de agente no aparecen en esta sesión, usa `general-purpose` con `model` según la tabla, y empieza el `prompt` con el contenido completo del archivo `.claude/agents/consejo-<id>.md` (sin el encabezado `---`), seguido de la ficha.

Mientras esperas no hagas el trabajo de ellos ni escribas en la sala: espera a que entreguen todos (sección 4, escritura 2). Cuando llega cada uno, comprueba que respetó el formato. Si trae elogios, hallazgos sin `archivo:línea` o sin evidencia, **descarta esos hallazgos** (no les pidas que lo repitan: cuesta otra ronda) y apúntalo en el veredicto como "descartados por falta de evidencia".

## 6. Ronda 2: careo

Antes de mandar nada, **filtra tú** (sin abrir código, solo con el mapa y los informes):
- **Duplicados:** el mismo fallo contado por dos integrantes. Júntalos en uno y di de quién era cada parte.
- **Premisas que el mapa desmiente** (por ejemplo, «Roberto escribe datos.json»). Tumba el hallazgo citando el mapa, o baja su gravedad si solo se apoyaba en eso.

Manda al Abogado del diablo, con `Modo: CAREO`, lo que quede: ID, autor, gravedad, dónde, evidencia y escenario. Recuérdale que solo compruebe con código los `alto` y `critico`. Para ahorrar, si ya hizo su ronda 1, continúalo con `SendMessage` (conserva lo que ya leyó) en lugar de lanzar uno nuevo.

Después del careo:
- Si el Abogado tumba un hallazgo `critico` o `alto`, **míralo tú** (lee las líneas citadas). Si sigues dudando, manda **una sola** réplica al autor con `SendMessage`: "El Abogado dice <motivo>. Defiende con evidencia nueva o retíralo." Lo que conteste, decide tú y anota por qué. No hay más rondas.
- Los `PUNTO CIEGO` del Abogado entran como hallazgos suyos solo si traen evidencia.

## 7. Veredicto (lo que ve el dueño en el chat)

En español, directo, sin elogios. Esta estructura:

```
VEREDICTO: <No apto | Apto con cambios | Apto> — <una frase con el motivo>

| # | Gravedad | Hallazgo | Dónde | Quién | Careo |
|---|----------|----------|-------|-------|-------|
(solo los que quedaron en pie, de más a menos grave)

Tumbados en el careo: <lista corta con el motivo de cada uno>
Desacuerdos que siguen abiertos: <si los hay, con las dos posturas>
Lo que el dueño dio por hecho y no era cierto: <si aplica>
Lo que NO se revisó: <alcance que quedó fuera>
Qué haría primero: <1-3 acciones, en orden>
```

Criterio: cualquier `critico` en pie → **No apto**. `alto` en pie → **Apto con cambios** como mucho. "Apto" solo si no queda nada `alto` ni `critico`, y aun así lista los `medio`.

Añade una línea de consumo con los tokens de cada integrante (salen en el aviso de que terminó cada uno) y el total, para que el dueño pueda comparar entre sesiones.

Termina con: "¿Arreglo algo de esto? Dime cuáles y te explico con qué choca antes de tocar nada." Y nada más.

## 8. Guardar y avisar

1. Guarda el veredicto completo, con la evidencia de cada hallazgo, en `mi-dinero-datos/consejo/informes/AAAA-MM-DD-<tema-corto>.md` (crea la carpeta si no existe). Haz commit y súbelo **a la rama de trabajo de esta sesión** de `mi-dinero-datos`, nunca a `main`.
2. Si la sesión fue larga (completa, o más de unos minutos), manda un aviso al teléfono con `PushNotification` (cárgala con `ToolSearch` si hace falta): "Consejo terminó: <veredicto>. <n> críticos, <n> altos en pie." Revisa los números antes de enviarlo.

## 9. Mantener el mapa

Al cerrar, actualiza `mapa.md` en el repo `mi-dinero`, solo con lo que sea público:
- En «Ya verificado», añade lo que un integrante comprobó **sin hallazgo**, con el commit actual del archivo (`git log -1 --format=%h -- <archivo>`) y la fecha. Si había una entrada vieja del mismo punto, sustitúyela.
- Si un «hecho fijo» resultó falso, corrígelo.
- Nunca pongas hallazgos abiertos, cifras ni datos del dueño: eso va en el informe privado.
Haz commit en la rama de trabajo de la sesión y dile al dueño que el mapa se actualizó. Pasarlo a `main` necesita su permiso.
