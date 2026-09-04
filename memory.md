# Memoria del proyecto Valdecerro

Archivo de contexto para retomar el trabajo en cualquier sesión. Recoge la intención del proyecto, cómo está construido, qué decisiones se tomaron y por qué, cómo se prueba y qué queda pendiente. Se actualiza al final de cada bloque de trabajo.

## 1. Intención del proyecto

- Propietario: Carlos (carlosfco.aguilar18@gmail.com). Trabaja en Windows 11, abre los archivos con doble clic en Edge o Chrome, y sigue la conversación en español.
- Objetivo declarado: "modelar la simulación de una sociedad a partir de reglas naturales y procesos estocásticos". No es un juego con jugador; es un pueblo que vive solo y se observa.
- Prioridades que ha expresado, por orden de aparición:
  1. Que se vea vivo: cada vez pasan cosas distintas.
  2. Economía, necesidades, interacción, crecimiento, construcción autónoma, paso del tiempo, guardado.
  3. Decesos.
  4. Que la partida persista entre refrescos y que "la vida siga fluyendo" aunque la pestaña esté cerrada.
  5. Progreso tecnológico, iluminación nocturna, edificios que no sean casas, descubrir recursos explorando, un gobernante con consecuencias.
  6. Montarlo en un servidor para que el pueblo "exista y coexista en su matrix": que progrese cada n horas aunque nadie lo abra. Hecho el 2026-09-04 con GitHub Pages + GitHub Actions (ver sección 10). Azure quedó como alternativa no elegida por coste y complejidad.
- Detalles que le importan: poder ocultar el panel, desplazarse por el terreno, que el pueblo se expanda hacia fuera y no solo en el centro, que las lápidas no se monten sobre la iglesia.

## 2. Qué hay en la carpeta

| Archivo | Papel |
|---|---|
| `valdecerro.html` | Versión 2 completa en un solo archivo. Es lo que abre el usuario con doble clic. Se genera, no se edita a mano. |
| `index.html` + `src/*.js` | Versión modular, fuente de verdad. Necesita servidor local por los módulos ES. Si se abre con `file://` muestra un aviso. |
| `construir.py` | Concatena `src/` en orden de dependencias, quita `import`/`export`, resuelve `import * as B` quitando el prefijo, y escribe `valdecerro.html`. Falla si hay identificadores de nivel superior duplicados entre módulos. Ejecutar tras cada cambio en `src/`. |
| `servir.bat` | Lanza `python -m http.server 8000` y abre `index.html`. |
| `pueblo-medieval.html` | Versión 1 original de un solo archivo, intacta como referencia. |
| `LEEME.md` | Guía de uso para el usuario. |
| `herramientas/probar.mjs` | Cliente CDP de Node para probar en Chrome sin cabeza. Ver sección 8. |
| `herramientas/comprobar.mjs` | Comprueba sintaxis de cada módulo y que cada import nombrado exista como export. Los avisos `UNIMPORTED?` son falsos positivos conocidos. |
| `servidor/tick.mjs` | Latido del servidor: Chrome sin pantalla por CDP, carga `estado/partida.json`, pone al día, guarda estado, crónica y mensaje de commit. Modos `--nueva` y `--ver`. |
| `.github/workflows/vida.yml` | Cron de GitHub Actions cada 2 h que ejecuta el latido y hace commit de `estado/`. |
| `estado/partida.json`, `estado/cronica.md`, `estado/ultimo-latido.txt` | Estado canónico del pueblo, crónica legible y mensaje del último commit. Los escribe el latido; no se editan a mano. |
| `.nojekyll`, `.gitignore` | Pages sin Jekyll; se ignoran perfiles de Chrome, `node_modules` y `estado/visor.png`. |
| `memory.md` | Este archivo. |

## 3. Arquitectura

Un módulo por sistema en `src/`. Los ciclos de importación existen (agents ↔ events ↔ growth ↔ tech ↔ hud ↔ world) y funcionan porque ningún módulo usa importaciones en tiempo de evaluación; todo se instancia en `boot()` de `main.js`.

| Módulo | Responsabilidad y exports clave |
|---|---|
| `config.js` | `CONFIG` con todos los parámetros. Etiquetas de roles, actividades, estados y decretos. Ninguna constante mágica fuera de aquí. |
| `utils.js` | `Rng` (mulberry32 con `seed`, `getState`, `setState`), `rand`, `pick`, `chance`, `weightedPick(weights, exclude, bias)`, `lerp`, `smoothstep`, temporales `_v1`, `_c1`, `_dummy`. Único `Math.random` del proyecto: elegir semilla si `CONFIG.seed` es null. |
| `state.js` | Contenedores compartidos: `Sim`, `agents`, `animals`, `World`, `Render`, `CameraState`, `Follow`, `Keys`. |
| `terrain.js` | Ruido de valor propio, rejilla de alturas, `terrainHeight(x,z)` bilineal, `RoadField` (buckets de puntos de camino), `buildTerrain`, `rebuildTerrain` (recalcula sobre los mismos búferes tras una obra), `addFootprint`. |
| `graph.js` | 17 nodos base y aristas curvas (CatmullRom con desplazamientos guardados en la arista para reproducirlas al cargar), Floyd-Warshall, `addNode`/`addEdge` en caliente, `nearestNode`. |
| `assets.js` | Geometrías y materiales compartidos, colores por rol y por recurso. |
| `agentmesh.js` | `AgentRenderer`: todos los habitantes en 10 InstancedMesh (cuerpo, cabeza, brazos, cuatro tocados, corona, fardo). Capacidad `render.agentCapacity` = 80. Ocultar = matriz a escala cero. |
| `buildings.js` | Fábricas: cabaña, iglesia (campana dinámica), castillo, taberna, puesto, mina, pozo, almacén, granero, botica, escuela, molino (aspas dinámicas), herrería, torre, yacimiento, pila de troncos, heno, carro, abrevadero, andamio, llamas con PointLight, lápida, carpas de feria. |
| `world.js` | Renderer y cámara, colocación base, fusión de mallas estáticas por material (`mergeGroup`), cultivos instanciados con estación, vegetación instanciada con ocultación de árboles bajo obras, `findSite` por tabla `SITE_RULES`, construcción genérica en dos fases (`prepareConstruction` → `rebuildTerrain` → `realizeConstruction`), `Lamps`, `Deposits`, cementerio y lápidas. |
| `economy.js` | Almacén único con capacidad, historial de grano, `tradeWithCaravan`, impuestos al `treasury`, `goldBonus`. Recursos: grano, madera, piedra, mineral, monedas, hierro, oro. |
| `calendar.js` | `DayCycle` (hora, día, estación, año, horas de luz por estación), `applyLighting` (sol, luna, cielo, niebla, exposición, ventanas, tintes estacionales, nieve, faroles). |
| `weather.js` | Máquina de clima con matriz de transición sesgada por estación, lluvia y nieve con un solo `Points` reciclado, relámpagos. |
| `agents.js` | `Mover` (rutas por grafo, reencaminado a mitad de arista), `Agent` (necesidades, salud, rutina por utilidad, oficios, transporte, sueño, refugio, social, muerte, sucesión de rol), `socialCheck` con rejilla espacial, `spawnPopulation`, `restorePopulation`, `spawnTraveler`, `Relations`. |
| `animals.js` | Gallinas, cerdos, lobos (`Wolf`), reposición de gallinas. |
| `events.js` | Feria, misa, caravana con comercio, turno de mina, mercado, lobos, incendio, expedición, revuelta. Viajeros espontáneos. |
| `growth.js` | Planificador de obras, inmigración, parejas, nacimientos, crecimiento de niños, vejez, muestras del historial, `neededRole`. |
| `tech.js` | `Tech` (árbol de saberes, tasa de conocimiento, multiplicadores) y `Ruler` (señor, decretos, popularidad, revuelta, deposición, sucesión). |
| `hud.js` | Panel principal, panel del habitante seguido, gráfica SVG, registro, botones. |
| `save.js` | Serialización completa a `localStorage`, autoguardado, carga. |
| `main.js` | Arranque con o sin partida, puesta al día del tiempo ausente (`catchUp`), bucle, `simulateStep`, cámara (seguimiento, WASD, límites), selección de habitante por proyección a pantalla. |

## 4. Reglas de la simulación

### Tiempo
- Día = `dayLengthSeconds` (240 s). Estaciones de `daysPerSeason` días (4). Las horas de luz, el rendimiento de los campos, el sesgo del clima y los tintes dependen de la estación. En invierno la lluvia es nieve.
- Las tasas de producción están definidas por segundo para un día de referencia de 240 s y se reescalan con `referenceDay / dayLengthSeconds`.

### Necesidades y salud
- Hambre, energía, ánimo y salud en 0..1. Comer cuando hambre > `hungerEatAt` (0.55); una comida quita `mealRelief` (0.9). Dormir en casa vuelve invisible al agente y recupera energía y salud.
- Salud baja con frío, lluvia y hambre; sube durmiendo, en casa o con curandero cerca (× `Tech.healMul`). Enfermo por debajo de 0.4: camina despacio, no trabaja, va a la botica o guarda cama en casa hasta `restUntil` (0.65).
- Muerte: por vejez desde `mortality.oldAge` (58) con probabilidad diaria creciente, por hambre tras 5 días (3.5 en invierno), por enfermedad si salud ≤ 0.02. Emigración si 3 días de hambre y el almacén está vacío.

### Rutina por utilidad
`decideRoutine` puntúa opciones: dormir, comer, curarse, entregar carga, trabajar, construir, pasear, rezar, casa. Gana la más alta. Guardias tienen circuito fijo y comen en la taberna. El señor "gobierna" en el castillo y sale a la plaza a mediodía. Sabio estudia en la escuela. Aldeanos ociosos hacen oficio secundario con el recurso más escaso.

### Economía
- Agricultores producen grano en los campos y lo llevan a la granja; mineros al almacén (mina del pueblo o yacimientos descubiertos, eligiendo la veta más escasa); leñadores al depósito más cercano. La carga se ve como fardo a la espalda. `carryAmount` = 10.
- Consumo: cada residente come unas dos veces al día del almacén común. Las gallinas ponen huevos. Los comerciantes venden mineral por monedas. La caravana compra excedentes por lotes y vende con recargo lo que falta.
- Impuestos diarios al tesoro del castillo (× decreto). El tesoro paga fiestas y faroles.

### Crecimiento y obras
- Vivienda = casas × 5. Inmigración cada 110 s si sobra comida y hay sitio y ranuras de render. Parejas por afinidad ≥ 3 conversaciones; nacimientos con comida de sobra; niños crecen en 4 días y toman el rol de `neededRole`.
- Planificador cada `planInterval` s (× 0.5 con decreto de expansión): campo si falta grano, casa si vivienda ≥ 75 %, botica con 24 habitantes o muchos enfermos, luego escuela, molino, herrería, torre si su saber está descubierto, granero si el grano roza la capacidad. Reserva materiales, busca sitio (`findSite`, premia terreno abierto sobre cercanía a la plaza), levanta andamio; hasta 3 obreros (5 con expansión).
- Los edificios con nodo (casa, botica, escuela, molino, herrería, torre, yacimiento) añaden nodo y camino al grafo; el terreno se repinta.

### Saberes
Árbol en `tech.tree`, orden de prioridad fijo. Conocimiento diario = base + clérigos trabajando × 0.5 + sabios × 1.6, × 2 con escuela, × 1.6 con decreto de saber. Efectos: arado y molino en `foodMul`, herrería en `toolMul`, medicina en `healMul`, alumbrado habilita faroles, cartografía habilita expediciones, orfebrería duplica el oro en la caravana. Herrería y orfebrería requieren tener descubierto hierro u oro.

### Exploración
`Deposits.init` genera 3 yacimientos (2 hierro, 1 oro) a más de 50 unidades de la plaza, con la semilla, después de la vegetación. La expedición (evento, solo de día, con cartografía) manda dos vecinos a un punto lejano, el 60 % de las veces cerca de un yacimiento; al terminar, si alguien está a menos de 22 del objetivo y hay veta a menos de 14, se descubre como construcción `yacimiento`.

### Señorío
`Ruler.agent` es un habitante con rol `senor` y corona. Cada 3 días decreta según estado: cosecha si comida por cabeza < 2.2, expansión si vivienda > 85 %, defensa tras peligros, fiesta si popularidad baja y hay tesoro, austeridad si tesoro bajo y popularidad alta, y si no saber o fiesta. Popularidad sube con comida, obras, faroles y fiestas; baja con hambre, muertes e impuestos. Por debajo de 0.25: revuelta (evento) y a los 3 días deposición por el vecino de mejor ánimo. Al morir hereda pareja, hijo o el de mejor ánimo.

### Peligros
Lobos de noche desde el bosque a por gallinas; guardias los ahuyentan (radio × 1.6 con torre). Incendio en una casa con hasta 4 respondedores (+2 con torre); si no se apaga cuesta madera.

### Guardado
- Todo el estado es serializable: semilla, estado del RNG, calendario, clima, economía, eventos (el en curso no), crecimiento e historial, construcciones (con desplazamientos de las aristas), lápidas, saberes, señor, faroles, relaciones, agentes, animales.
- Autoguardado cada 60 s, al ocultar la pestaña, al cerrar. Al abrir se carga siempre la última partida (`save.autoLoad`). "Recargar" vuelve al último guardado; "Nueva" borra y pide confirmación.
- Puesta al día: al cargar se simula el tiempo real ausente con `simulateStep(0.1)` en trozos de 40 ms por frame, hasta `catchUpMaxHours` (4 h reales ≈ 60 días), con el registro silenciado y un resumen al final.
- Orden de arranque importante para la determinismo: `initNoise` → `Graph.build` → huellas → terreno → edificios → fusión → vegetación → `Deposits.init` → `Lamps.init`, y solo después las construcciones guardadas y la población. Todas las llamadas al RNG anteriores a `Rng.setState` deben mantener el mismo orden entre versiones o la vegetación cambiará de sitio al cargar.

## 5. Decisiones tomadas y por qué

- Un solo archivo para el usuario, módulos para el desarrollo, y `construir.py` como puente. Razón: el usuario abre con doble clic y `file://` bloquea módulos.
- Fusión de mallas estáticas por material e instanciado de habitantes: los draw calls pasaron de ~400 a ~90.
- Depósitos cercanos por recurso (grano a la granja): antes los agricultores caminaban 110 unidades por entrega y el pueblo pasaba hambre.
- Iglesia y castillo son refugios: guardias y clérigo no comían ni dormían porque su "casa" no tenía puerta.
- Los eventos sueltan a los hambrientos (`eventHungerLimit`) y al salir del refugio se olvida el evento atendido para poder volver.
- Emigrar solo si el almacén está vacío; morir de hambre solo tras 5 días.
- Las lápidas crecen alejándose de la iglesia; antes se montaban sobre la nave.
- El desgaste de salud por frío se rebajó porque en invierno enfermaba medio pueblo.
- `Wolf`, incendio y expedición reutilizan el sistema de eventos y `ATTEND_EVENT` en lugar de estados nuevos.
- El vector lateral del desplazamiento por teclado es `(-fz, 0, fx)`; el signo contrario invertía izquierda y derecha.
- El panel tiene `pointer-events: auto` para que su barra de desplazamiento funcione; la cámara solo se bloquea con el puntero encima del panel.

## 6. Parámetros que el usuario puede querer tocar

`seed`, `dayLengthSeconds`, `calendar.daysPerSeason`, `economy.production`, `needs.hungerPerDay`, `health.*`, `construction.types`, `growth.immigrationInterval`, `growth.birthChancePerDay`, `mortality.*`, `tech.tree` y tasas, `lamps.*`, `deposits.*`, `ruler.*`, `save.catchUpMaxHours`, `render.agentCapacity`.

## 7. Estado conocido y pendientes

- Verificado sin excepciones: partidas de 10 a 16 días acelerados, tormenta, feria, caravana, mina, lobos, incendio, expedición con descubrimiento, cuatro edificios de saber, decretos, revuelta, deposición, sucesión, puesta al día de 40 minutos ausentes en 4 s, guardar y recargar con todo.
- Balance observado: el decreto de expansión gasta la madera en casas y deja campos sin madera; los faroles consumen madera y tesoro. Es emergente, no fallo. Se puede suavizar subiendo leñadores.
- Los eventos en curso no se guardan. Lobos e incendios desaparecen al recargar.
- Las lápidas antiguas de partidas previas conservan su posición vieja.
- Tope de 80 habitantes por las ranuras de render; inmigración y nacimientos lo respetan.
- Despliegue en servidor: implementado (sección 10). Queda que el usuario cree el repositorio en GitHub, suba la carpeta, active Pages y lance el workflow una vez. Verificado en local: primer latido crea el pueblo en 1 s; latido con 3 h de retraso simula 45 días en 20 s; `--ver` confirma que el visor lee `estado/partida.json` (fuente `servidor`, `SaveSystem.remote = true`).
- Nombres con número ("Pedro 94") aparecen cuando se agota la lista de nombres en partidas largas; cosmético, no corregido.

## 8. Cómo probar

- `node herramientas/comprobar.mjs <carpeta temporal>` comprueba sintaxis e imports.
- `node herramientas/probar.mjs <carpeta temporal> "<url>?debug=1" <modo> [rondas]` lanza Chrome sin cabeza (`C:\Program Files\Google\Chrome\Application\chrome.exe`) con `--remote-debugging-port=9333` y lo dirige por CDP. La página expone `window.__dbg` con todos los sistemas cuando la URL lleva `debug`. Modos: `full` (partida acelerada, guardado y recarga), `quick` (fps), `muerte`, `peligros`, `botica`, `catchup`, `progreso`. La URL puede ser `file:///.../valdecerro.html?debug=1` (el archivo único carga por `file://`) o `http://localhost:8000/index.html?debug=1` con `servir.bat`.
- `node servidor/tick.mjs` es la prueba más rápida de todo el arranque sin pantalla; `--ver` deja `estado/visor.png`. Para probar la puesta al día, retrasar `savedAt` en `estado/partida.json` y volver a lanzar el latido.
- Lecciones del harness: `--virtual-time-budget` no avanza `requestAnimationFrame`; el render por software es demasiado lento, usar la GPU; para balance usar días de 120 s, no de 60, porque con días muy cortos el tiempo de caminar y comer se come la jornada; en `Runtime.evaluate` envolver en IIFE para no redeclarar `const D`; al guardar con `savedAt` en el pasado hay que anular `SaveSystem.save` antes de navegar porque `pagehide` vuelve a guardar; los heredocs del Bash tool fallan en este Windows, escribir archivos con la herramienta Write.

## 9. Convenciones

- Interfaz y registro en español, voz activa y presente. Nombres de agentes con género para los artículos (`FEMALE` en `agents.js`).
- Paleta fija y `flatShading`; sin texturas; sin emojis en el panel, glifos SVG.
- Sin `dispose()` sobre geometrías compartidas; sin creación de objetos en el bucle de render; temporales preasignados.
- Comentarios solo donde explican una decisión no obvia.

## 10. Vida en la nube (2026-09-04)

Diseño elegido: el estado canónico es un archivo en el repositorio y el servidor es un cron de GitHub Actions.

- `index.html?servidor=1` es el modo sin pantalla: `initRenderer(true)` usa un renderer falso (sin WebGL), `catchUpMaxHours` sube a `save.serverCatchUpMaxHours` (12) y `HUD.journal` recoge todos los mensajes aunque el panel esté silenciado. Al terminar `start()` la página pone `window.__listo = true`; si `boot()` falla, `window.__error`.
- `loadState()` en `main.js` decide la fuente: `fetch('estado/partida.json?t=...')` salvo con `?local=1` o `file://`; si responde y la versión coincide, fuente `servidor` (`SaveSystem.remote = true`, `HUD.setRemote(savedAt)`: oculta Guardar y Nueva, "Recargar" pasa a "Sincronizar", el pie muestra "El pueblo vive en el servidor · estado de hace X"). Si no, localStorage como antes. `?nueva=1` fuerza pueblo nuevo.
- Regla: el servidor siempre manda. El navegador del visitante simula el hueco desde `savedAt` (proyección) y no guarda nada; al siguiente latido la verdad vuelve a ser la del servidor. Así no hay ramas divergentes entre visitantes.
- `servidor/tick.mjs`: sin dependencias, Node 22+ (usa `WebSocket` y `fetch` globales). Levanta un servidor estático propio sobre la carpeta en un puerto libre, lanza Chrome (`CHROME_PATH` o rutas habituales por plataforma; en `ubuntu-latest` está `/usr/bin/google-chrome`) con perfil temporal, navega, espera `__listo`, pausa y extrae `SaveSystem.build()` + `resumen()`. Escribe `estado/partida.json` compacto, añade a `estado/cronica.md` una entrada con cifras, señor, saberes, la línea "Desde el último latido pasaron N días" y hasta 16 sucesos notables filtrados por la expresión `NOTABLE`, y deja el mensaje de commit en `estado/ultimo-latido.txt`. Falla con código 1 si la página lanza excepción o no está lista en 15 min.
- Workflow `vida.yml`: `cron '0 */2 * * *'` + `workflow_dispatch` con casilla `nueva`; `permissions: contents: write`; `concurrency` sin cancelar; commit como "Valdecerro" y `git pull --rebase` antes de `push`. Cada latido tarda 1 a 3 min. GitHub pausa los cron tras 60 días sin actividad humana.
- Pages sirve la raíz de `main`; `.nojekyll` evita el procesado Jekyll. Los commits del cron disparan el redespliegue de Pages automáticamente.
- Por qué no Azure: Static Web Apps + Function con temporizador y Puppeteer exige empaquetar Chrome y una cuenta de almacenamiento; GitHub da hosting, cron, Chrome preinstalado e historial gratis en un repositorio público. Si algún día hace falta más frecuencia o vida continua, el mismo `tick.mjs` corre en cualquier máquina con Node y Chrome (un cron de Linux o un contenedor), y el visor solo necesita que `estado/partida.json` esté junto a `index.html`.
