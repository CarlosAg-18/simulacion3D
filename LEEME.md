# Valdecerro, pueblo medieval low-poly

Simulación 3D autónoma de un pueblo medieval con Three.js. Corre sola: economía, necesidades, clima, estaciones, eventos, crecimiento y construcción.

## Cómo ejecutarla

Hay dos formas:

- **Doble clic en `valdecerro.html`.** Es la versión 2 empaquetada en un solo archivo y funciona directamente en el navegador.
- **`index.html` con servidor local.** Es la versión modular con el código en `src/`. Doble clic en `servir.bat` arranca el servidor y abre `http://localhost:8000/index.html`. Abierta con doble clic no funciona porque el navegador bloquea los módulos desde `file://`.

Cuando cambies algo en `src/`, ejecuta `python construir.py` para regenerar `valdecerro.html`.

`pueblo-medieval.html` es la versión 1 original; se conserva como referencia.

## Controles

- Arrastrar para orbitar, rueda para acercar, botón derecho para arrastrar el mapa. La cámara gira sola y se reanuda cinco segundos después de soltarla.
- WASD o flechas desplazan la vista por el valle. La cámara nunca sale del mapa.
- Clic sobre un habitante para seguirlo: aparece un panel a la derecha con su oficio, actividad, necesidades, salud, casa y familia. Clic en el suelo, Escape o "Dejar de seguir" lo suelta.
- El botón "Ocultar panel" o la tecla H esconden el panel principal. Espacio pausa.
- Botones: Pausar, velocidad 1x/2x/4x, Giro, Guardar, Cargar y Nueva.
- La partida se guarda sola cada minuto, al ocultar la pestaña y al cerrarla, en `localStorage` del navegador. Al abrir o refrescar se carga siempre la última partida. "Recargar" vuelve al último guardado; "Nueva" borra la partida y arranca un pueblo distinto, previa confirmación.
- El pueblo sigue viviendo mientras no estás: al volver se simula el tiempo real transcurrido, hasta un máximo de `save.catchUpMaxHours` horas, en pasos rápidos sin dibujar, y el registro resume lo ocurrido. Para que viva sin límite está el modo servidor, descrito más abajo.
- Añadir `?debug=1` a la URL expone `window.__dbg` con todos los sistemas para inspeccionar desde la consola.

## Vivir en la nube

El pueblo puede existir en un servidor y seguir su vida aunque nadie lo mire. La idea es simple: el estado canónico es un archivo, `estado/partida.json`, y hay dos piezas que lo usan.

- **El latido**, `servidor/tick.mjs`. Abre la simulación en un Chrome sin pantalla (`index.html?servidor=1`), carga `estado/partida.json`, simula el tiempo real transcurrido desde el último guardado (hasta `save.serverCatchUpMaxHours` horas) y escribe el nuevo estado. Además añade una entrada a `estado/cronica.md` con la fecha real, el momento del pueblo y los sucesos notables, y deja el mensaje de commit en `estado/ultimo-latido.txt`.
- **El visor**. `index.html` intenta leer `estado/partida.json` al arrancar. Si existe, ese estado manda: se carga, se simula lo que falte desde su marca de tiempo y el panel muestra "El pueblo vive en el servidor". En ese modo el navegador no guarda nada; el botón "Sincronizar" recarga el último estado del servidor. Si el archivo no existe o no se puede leer, se usa el guardado local como siempre.

`.github/workflows/vida.yml` ejecuta el latido en GitHub Actions cada dos horas y hace commit del resultado. Con GitHub Pages sirviendo el repositorio, la dirección pública muestra siempre el pueblo tal como vive en el servidor, y el historial de commits es la biografía del pueblo.

Para ponerlo en marcha:

1. Crea un repositorio en GitHub (público, para que Pages y Actions sean gratuitos) y sube esta carpeta.
2. En Settings, Pages, elige "Deploy from a branch", rama `main`, carpeta `/ (root)`.
3. En la pestaña Actions, abre "Vida de Valdecerro" y pulsa "Run workflow" para el primer latido. A partir de ahí corre solo.
4. La dirección será `https://TU_USUARIO.github.io/NOMBRE_DEL_REPO/`.

Notas:

- El ritmo se cambia en la línea `cron` del workflow. Cada latido tarda entre uno y tres minutos de runner.
- Para empezar un pueblo nuevo en el servidor, lanza el workflow a mano con la casilla "nueva" marcada.
- GitHub pausa los workflows programados tras 60 días sin actividad humana en el repositorio; basta un commit o lanzar el workflow a mano para reactivarlo.
- Un visitante que llegue dos horas después del último latido espera unos segundos mientras su navegador simula ese hueco; lo que ve es una proyección, y el siguiente latido del servidor vuelve a ser la verdad.
- En local, `node servidor/tick.mjs` hace un latido con tu Chrome, `--nueva` empieza de cero y `--ver` abre el visor contra el estado guardado y deja una captura en `estado/visor.png`. Si quieres jugar en local con tu propia partida sin que mande el archivo del servidor, abre `index.html?local=1`.

## Estructura

Todo el código vive en `src/`, un archivo por sistema:

| Archivo | Qué contiene |
|---|---|
| `config.js` | Todos los parámetros ajustables y la paleta |
| `utils.js` | RNG sembrado con estado exportable, interpolaciones, temporales |
| `state.js` | Contenedores compartidos: escena, agentes, animales, mundo |
| `terrain.js` | Ruido, rejilla de alturas, pintado de caminos, recálculo tras obras |
| `graph.js` | Nodos, aristas curvas, Floyd-Warshall, nodos añadidos en caliente |
| `assets.js` | Geometrías y materiales compartidos |
| `buildings.js` | Fábricas de edificios, andamio de obra, carpas, carro |
| `world.js` | Renderer, cámara, colocación, fusión de mallas, vegetación, cultivos, emplazamientos y construcción en tiempo real |
| `economy.js` | Almacén global: grano, madera, piedra, mineral, monedas |
| `calendar.js` | Hora, día, estación, año, luz solar y paleta estacional |
| `weather.js` | Máquina de clima con sesgo estacional, lluvia y nieve recicladas, relámpagos |
| `agents.js` | Movimiento por grafo, necesidades, rutina por utilidad, transporte, sueño, social, afinidad |
| `animals.js` | Gallinas y cerdos |
| `events.js` | Feria, misa, caravana con comercio, turno de mina, mercado |
| `growth.js` | Planificador de obras, inmigración, parejas, nacimientos, niños que crecen |
| `save.js` | Serialización y autoguardado |
| `hud.js` | Panel de información y controles |
| `main.js` | Arranque, carga de partida (servidor o local), puesta al día, bucle principal |
| `../servidor/tick.mjs` | Latido del servidor: simula el tiempo ausente sin pantalla y guarda `estado/partida.json` |

## Cómo funciona la economía

- Agricultores, leñadores y mineros producen mientras trabajan y llevan la carga al depósito más cercano: grano a la granja, mineral y piedra al almacén.
- Cada habitante come dos veces al día del almacén común. Sin grano el ánimo cae y, tras tres días de hambre sin comida en el pueblo, emigra.
- Los comerciantes venden mineral por monedas y la caravana compra lotes de mineral.
- Las gallinas ponen huevos que suman un poco de grano cada día.
- El rendimiento de los campos depende de la estación: casi nulo en invierno, máximo en verano.

## Crecimiento y construcción

- El planificador revisa cada 25 s si falta comida (campo), vivienda (casa) o almacenamiento (granero), reserva los materiales y elige un emplazamiento libre.
- Aldeanos, agricultores, leñadores y mineros libres acuden como obreros; una casa nueva añade su propio nodo y camino al grafo y el terreno se repinta.
- Llegan colonos cuando sobra comida y hay vivienda. Las conversaciones crean afinidad, las parejas comparten casa y pueden tener hijos que crecen y toman el oficio que más falta.
- Hay decesos: por vejez a partir de los 58 años simulados, con probabilidad diaria creciente, por hambre tras cinco días sin comer, o tres y medio en invierno, y por enfermedad. Cada difunto recibe una lápida en el cementerio detrás de la iglesia; pareja e hijos pierden ánimo y los hijos pasan a seguir a otro adulto de la casa. Los parámetros están en `mortality`.
- Salud: el frío, la lluvia y el hambre la desgastan; dormir la recupera. Por debajo del 40 % el habitante enferma, camina despacio y deja de trabajar. Cuando el pueblo pasa de 24 habitantes o hay muchos enfermos se construye una botica y llega un curandero que acelera la recuperación.
- Oficios secundarios: los aldeanos ociosos ayudan con el recurso que más escasea, en los campos, el bosque o la mina.
- Comercio: la caravana compra los excedentes por lotes y vende lo que falta con recargo; el grano vale más en invierno. El castillo cobra un pequeño impuesto diario en monedas.
- Peligros: de noche pueden salir lobos del bosque a por las gallinas, y los guardias corren a ahuyentarlos. De vez en cuando arde una casa y vecinos y guardias acuden a apagarla; si no llegan a tiempo, reparar cuesta madera.
- Historial: el panel dibuja población, grano y enfermos día a día.
- Saberes: clérigos, sabios y la escuela generan conocimiento que desbloquea avances en orden: arado, cartografía, alumbrado, medicina, escuela, molino, torre de vigía, herrería y orfebrería. Cada uno cambia algo concreto: más cosecha, expediciones, faroles, curación, edificios nuevos, herramientas, oro al doble. El árbol está en `tech.tree`.
- Exploración: con cartografía salen expediciones de dos vecinos hacia zonas lejanas. Hay tres yacimientos ocultos de hierro y oro generados con la semilla; al descubrirlos aparece la bocamina con su camino y los mineros reparten sus viajes entre la mina del pueblo y las vetas nuevas.
- Edificios con función: escuela (sabio, saber al doble), molino (aspas que giran, más capacidad y rendimiento de grano), herrería (herramientas para todos los oficios), torre de vigía (guardias más eficaces contra lobos e incendios), además de casas, campos, botica y granero. Los faroles se instalan solos por los caminos, tres por día, pagados con madera y monedas del tesoro.
- Señorío: hay un señor del castillo con corona. Cobra impuestos al tesoro, proclama un decreto cada tres días (cosecha, expansión, defensa, saber, fiesta pagada o austeridad) según lo que necesita el pueblo, y su popularidad sube con comida, obras y fiestas y baja con hambre, muertes e impuestos. Si cae mucho hay revuelta ante el castillo; si persiste, lo deponen y el vecino de mejor ánimo ocupa el castillo. Al morir, hereda su pareja o su hijo.
- Rendimiento: todos los habitantes se dibujan con nueve mallas instanciadas y la interacción social usa una rejilla espacial, así que el pueblo aguanta hasta 80 habitantes sin bajar de 60 fps.

## Parámetros que conviene tocar primero

- `dayLengthSeconds`: duración del día; las tasas de producción se reescalan solas.
- `calendar.daysPerSeason`: ritmo de las estaciones.
- `economy.production` y `needs.hungerPerDay`: equilibrio entre cosecha y consumo.
- `construction.types`: costes, duración y máximos de cada obra.
- `growth.immigrationInterval` y `growth.birthChancePerDay`: velocidad de crecimiento.
- `seed`: un número fijo reproduce el mismo pueblo inicial.
