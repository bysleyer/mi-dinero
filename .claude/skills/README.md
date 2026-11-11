# Skills de diseño (de Emil Kowalski)

Copiadas de https://github.com/emilkowalski/skills (licencia MIT, ver LICENSE-emilkowalski.txt).
Solo las que sirven para Mi dinero (app web para iPhone, sin frameworks):

- mobile-native: que la app web se sienta nativa en el iPhone.
- emil-design-eng: detalles de pulido de interfaz.
- apple-design: principios de diseño de Apple para la web.
- break-ui: probar la interfaz con datos extremos.
- review-animations, find-animation-opportunities, remove-animations: revisar animaciones.

Nota para Mi dinero: varias skills traen ejemplos con React/Tailwind. Aquí se aplican los
principios con HTML, CSS y JavaScript simple, sin agregar librerías ni frameworks.

# Skill de PWA (de popey/claude-code-skills)

Copiada de https://github.com/popey/claude-code-skills (licencia MIT, ver LICENSE-popey-claude-code-skills.txt):

- progressive-web-app: instalación, service worker, caché y funcionamiento sin internet.
  Nota: Mi dinero no usa Workbox ni herramientas de build; la versión del caché se sube a mano (CACHE en sw.js).

# Calidad web (de Addy Osmani)

Copiadas de https://github.com/addyosmani/web-quality-skills (licencia MIT, ver LICENSE-addyosmani-web-quality-skills.txt):

- performance: que la app cargue y responda rápido.
- core-web-vitals: LCP, INP y CLS (velocidad de carga, respuesta al tocar y saltos de pantalla).
- best-practices: seguridad y buenas prácticas web.
- accessibility: accesibilidad WCAG (reemplaza a a11y-enforcer).
Nota: traen ejemplos con Lighthouse y axe (npx); para Mi dinero se usa Playwright, que ya está instalado.
