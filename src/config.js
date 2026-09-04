// Todos los parámetros ajustables de la simulación viven aquí. Ninguna constante mágica fuera de este archivo.
export const CONFIG = {
  seed: null,
  map: { size: 200, segments: 120, hillAmplitude: 3.0, noiseScale: 0.03 },
  dayLengthSeconds: 240,
  startHour: 6.5,
  calendar: {
    seasons: ['Primavera', 'Verano', 'Otoño', 'Invierno'],
    daysPerSeason: 4,
    startSeason: 0,
    startYear: 1,
    daylight: { Primavera: [6, 19.5], Verano: [5.5, 20.5], Otoño: [6.5, 18.5], Invierno: [7.5, 17] },
    weatherBias: {
      Primavera: { SOLEADO: 1, NUBLADO: 1.1, FRIO: 0.6, LLUVIA: 1.3, TORMENTA: 1 },
      Verano: { SOLEADO: 1.6, NUBLADO: 0.8, FRIO: 0.2, LLUVIA: 0.7, TORMENTA: 1.1 },
      Otoño: { SOLEADO: 0.8, NUBLADO: 1.3, FRIO: 1.2, LLUVIA: 1.3, TORMENTA: 0.9 },
      Invierno: { SOLEADO: 0.7, NUBLADO: 1.2, FRIO: 2.4, LLUVIA: 0.9, TORMENTA: 0.5 }
    },
    foodYield: { Primavera: 0.9, Verano: 1.25, Otoño: 1.0, Invierno: 0.15 },
    grassTint: { Primavera: 0x8FCF7A, Verano: 0xFFFFFF, Otoño: 0xF0C08A, Invierno: 0xC9D2DC },
    leafTint: { Primavera: 0xB8F0A8, Verano: 0xFFFFFF, Otoño: 0xF0A050, Invierno: 0xA8B4C4 }
  },
  agents: { agricultor: 4, comerciante: 2, minero: 3, lenador: 2, aldeano: 5, clerigo: 1, guardia: 2 },
  // Saberes: el pueblo acumula conocimiento y desbloquea avances en este orden de prioridad.
  tech: {
    pointsPerDayBase: 0.5, pointsPerClerigo: 0.5, pointsPerSabio: 1.6, schoolMul: 2.0, policyMul: 1.6,
    tree: [
      { id: 'arado', label: 'Arado de hierro', cost: 8, requires: [], desc: 'los campos rinden un 30 % más' },
      { id: 'cartografia', label: 'Cartografía', cost: 10, requires: [], desc: 'salen expediciones a explorar el valle' },
      { id: 'alumbrado', label: 'Alumbrado de aceite', cost: 12, requires: [], desc: 'se instalan faroles por los caminos' },
      { id: 'medicina', label: 'Medicina de hierbas', cost: 14, requires: [], desc: 'los enfermos sanan antes' },
      { id: 'escuela', label: 'Escuela', cost: 18, requires: [], desc: 'se puede levantar una escuela con su sabio' },
      { id: 'molino', label: 'Molino de viento', cost: 16, requires: ['arado'], desc: 'se puede levantar un molino' },
      { id: 'vigia', label: 'Torre de vigía', cost: 20, requires: [], desc: 'se puede levantar una torre para los guardias' },
      { id: 'herreria', label: 'Herrería', cost: 22, requires: ['cartografia'], needsResource: 'hierro', desc: 'herramientas de hierro para todos los oficios' },
      { id: 'orfebreria', label: 'Orfebrería', cost: 26, requires: ['herreria'], needsResource: 'oro', desc: 'el oro se vende al doble' }
    ]
  },
  lamps: { spacing: 15, perDay: 3, max: 40, pointLights: 6, costWood: 2, costCoins: 1 },
  deposits: { count: 3, kinds: ['hierro', 'hierro', 'oro'], minDist: 50, discoverRadius: 14, targetStock: { hierro: 25, oro: 12 } },
  expedition: { duration: 75, members: 2, weight: 2.5, nearDepositChance: 0.6 },
  ruler: {
    decreeIntervalDays: 3, fiestaCost: 20, revoltBelow: 0.25, deposeDays: 3, taxHolidayDays: 2,
    popularity: { start: 0.6, foodGain: 0.03, hungerLoss: 0.06, deathLoss: 0.05, taxLoss: 0.012, fiestaGain: 0.12, lampGain: 0.01, buildGain: 0.03, revoltGain: 0.1 },
    policies: ['cosecha', 'expansion', 'defensa', 'saber', 'fiesta', 'austeridad']
  },
  render: { agentCapacity: 80 },
  health: {
    coldLossPerDay: 0.12, rainLossPerDay: 0.12, hungerLossPerDay: 0.3, illnessChancePerDay: 0.03, illnessHit: 0.45,
    recoverPerDay: 0.3, sleepRecoverPerDay: 0.6, healerRecoverPerDay: 1.0, restUntil: 0.65,
    sickBelow: 0.4, sickSpeed: 0.6, deathBelow: 0.02
  },
  secondary: { rateMul: 0.7, lowStock: { grano: 60, madera: 40, piedra: 30 } },
  trade: {
    prices: { grano: 2, madera: 1.5, piedra: 1.5, mineral: 3, hierro: 4, oro: 12 },
    winterFoodMul: 1.6, buyMarkup: 1.3, lotSize: 10, maxLots: 4,
    surplus: { grano: 110, madera: 90, piedra: 70, mineral: 10, hierro: 40, oro: 5 },
    shortage: { grano: 40, madera: 25, piedra: 20 },
    taxPerResidentPerDay: 0.15
  },
  dangers: {
    lobos: { duration: 75, count: 2, speed: 2.8, huntTime: 2.5, scareRadius: 7, moodLoss: 0.08 },
    incendio: { duration: 90, workSeconds: 45, maxResponders: 4, responderRadius: 50, repairWood: 15, moodLoss: 0.15 }
  },
  history: { maxDays: 60 },
  followers: { parejas: 1, ninos: 1 },
  travelers: { max: 2, chancePerMinute: 0.7, stayMin: 35, stayMax: 80 },
  animals: { gallinas: 7, cerdos: 5, wanderRadius: 6, speed: 1.1, peckMin: 1.2, peckMax: 3.2, rainRadius: 2.2 },
  speed: { walk: 3.4, guard: 2.9, traveler: 3.0, cart: 2.8, wander: 1.5, turnRate: 7 },
  social: { distance: 3, checkEveryFrames: 3, durMin: 1.5, durMax: 3.5, cooldownMin: 20, cooldownMax: 40, personalCooldown: 8 },
  activity: { minStay: 10, maxStay: 26, wanderRadius: 3.2, idleMin: 2, idleMax: 5 },
  needs: {
    hungerPerDay: 1.5, hungerEatAt: 0.55, mealRelief: 0.9,
    energyPerDay: 0.75, energyWorkExtra: 0.35,
    sleepRecoverPerHour: 0.16, moodDecayPerDay: 0.45, moodSocial: 0.18, moodEvent: 0.25, moodHungry: 0.35,
    starveDays: 3.0, eventHungerLimit: 0.85, wakeHour: { min: 5.5, max: 7.5 }, sleepHour: { min: 20.5, max: 23 }
  },
  economy: {
    start: { grano: 80, madera: 60, piedra: 35, mineral: 8, monedas: 40, hierro: 0, oro: 0 },
    baseCapacity: { grano: 160, madera: 200, piedra: 200, mineral: 200, monedas: 9999, hierro: 120, oro: 60 },
    millCapacity: 80,
    granaryCapacity: 160,
    // Tasas por segundo referidas a un día de referenceDay segundos; se reescalan si cambia dayLengthSeconds.
    referenceDay: 240,
    production: { grano: 0.24, madera: 0.16, mineral: 0.10, piedra: 0.10, hierro: 0.07, oro: 0.035 },
    stoneTripChance: 0.45,
    fieldBonus: 0.25,
    eggsPerChickenPerDay: 0.5,
    carryAmount: 10,
    foodPerMeal: 1,
    tavernPrice: 1,
    sellRate: 0.06,
    sellPrice: 3,
    caravanTrade: { mineral: 10, monedas: 25 },
    historySeconds: 120
  },
  growth: {
    housingPerCottage: 5,
    immigrationInterval: 110,
    immigrationFoodPerCapita: 2.5,
    coupleAffinity: 3,
    birthChancePerDay: 0.35,
    birthFoodPerCapita: 2.0,
    childGrowDays: 4,
    adultAge: 16,
    yearsPerDay: 0.5,
    maxPopulation: 40
  },
  mortality: {
    oldAge: 58, maxAge: 82, oldAgeChanceScale: 0.6,
    starveDaysDeath: 5, winterStarveDays: 3.5,
    moodLoss: 0.3
  },
  construction: {
    planInterval: 25,
    maxBuilders: 3,
    types: {
      casa: { cost: { madera: 30, piedra: 15 }, workSeconds: 70, max: 8, label: 'una casa nueva' },
      campo: { cost: { madera: 10 }, workSeconds: 35, max: 5, label: 'un campo de cultivo' },
      granero: { cost: { madera: 25, piedra: 20 }, workSeconds: 55, max: 2, label: 'un granero' },
      botica: { cost: { madera: 20, piedra: 25 }, workSeconds: 60, max: 1, label: 'una botica' },
      escuela: { cost: { madera: 30, piedra: 20 }, workSeconds: 70, max: 1, label: 'una escuela', tech: 'escuela', minResidents: 14 },
      molino: { cost: { madera: 40, piedra: 20 }, workSeconds: 85, max: 1, label: 'un molino', tech: 'molino' },
      herreria: { cost: { piedra: 30, madera: 20, hierro: 10 }, workSeconds: 75, max: 1, label: 'una herrería', tech: 'herreria' },
      torre: { cost: { piedra: 45, madera: 15 }, workSeconds: 90, max: 1, label: 'una torre de vigía', tech: 'vigia', minResidents: 18 }
    },
    housingTrigger: 0.75,
    foodTrigger: 45,
    storageTrigger: 0.8,
    boticaPopulation: 24,
    boticaSickRatio: 0.15,
    // Las obras buscan terreno abierto: pesa más el espacio libre que la cercanía a la plaza.
    site: { minDist: 10, maxDist: 26, opennessWeight: 1.0, plazaWeight: 0.25, bounds: 84 }
  },
  weather: {
    minDuration: 45, maxDuration: 120, transitionSeconds: 4,
    transitions: {
      SOLEADO: { SOLEADO: 0.30, NUBLADO: 0.45, FRIO: 0.25, LLUVIA: 0.00, TORMENTA: 0.00 },
      NUBLADO: { SOLEADO: 0.35, NUBLADO: 0.05, FRIO: 0.15, LLUVIA: 0.30, TORMENTA: 0.15 },
      FRIO: { SOLEADO: 0.30, NUBLADO: 0.40, FRIO: 0.05, LLUVIA: 0.25, TORMENTA: 0.00 },
      LLUVIA: { SOLEADO: 0.20, NUBLADO: 0.40, FRIO: 0.10, LLUVIA: 0.05, TORMENTA: 0.25 },
      TORMENTA: { SOLEADO: 0.10, NUBLADO: 0.45, FRIO: 0.10, LLUVIA: 0.35, TORMENTA: 0.00 }
    },
    rainDrops: 2200, stormDrops: 4500, maxDrops: 4500,
    rainAreaHalf: 75, rainHeight: 45, rainSpeed: 28, snowSpeed: 7,
    lightningChancePerSecond: 0.22
  },
  events: {
    minInterval: 60, maxInterval: 150, firstDelay: 35,
    weights: { feria: 3, misa: 2, caravana: 2, mina: 2, mercado: 2, lobos: 1.5, incendio: 1, expedicion: 2.5 },
    feria: { min: 40, max: 80 },
    misa: { duration: 45 },
    caravana: { min: 2, max: 3, stayMin: 40, stayMax: 70 },
    mina: { duration: 50 },
    mercado: { duration: 60 }
  },
  road: { width: 3.2, blend: 2.4, sampleSpacing: 1.0, wobbleMin: 4, wobbleMax: 9 },
  vegetation: { trees: 170, rocks: 75, bushes: 80 },
  camera: { autoRotateSpeed: 0.4, resumeAfter: 5, minDistance: 12, maxDistance: 190, startDistance: 90, panSpeed: 45, bounds: 95, followLerp: 0.12 },
  shadow: { mapSize: 2048, extent: 78 },
  // Al abrir se carga la última partida y se simula el tiempo ausente (hasta catchUpMaxHours reales) a catchUpStep por paso.
  save: {
    key: 'valdecerro-partida', autosaveSeconds: 60, autoLoad: true, catchUpMaxHours: 4, catchUpStep: 0.1, catchUpMinSeconds: 20,
    // Estado canónico que escribe el servidor (servidor/tick.mjs). Si no existe o no se puede leer, se usa localStorage.
    // En modo servidor (?servidor=1) se admite una ausencia más larga porque no hay nadie esperando delante de la pantalla.
    remote: 'estado/partida.json', serverCatchUpMaxHours: 12
  },
  hudRefresh: 0.25,
  maxDelta: 0.05
};

export const PALETTE = {
  grass: 0x6F9E5B, grassDark: 0x5E8A4C, grassLight: 0x7FAE68,
  dirt: 0xB08A5E, dirtDark: 0x9A7549,
  stone: 0x8E8B84, stoneDark: 0x6E6B66,
  thatch: 0xC9A45B, tile: 0x8C4A3B, wood: 0x6B4A32,
  water: 0x3E6F8E,
  leaf1: 0x3F7A4A, leaf2: 0x4F8C55, leaf3: 0x356B44,
  window: 0xFFC978,
  skyDay: 0x9CC4E4, skyDawn: 0xF0B27A, skyDusk: 0xE2705A, skyNight: 0x141B33
};

export const ROLE_LABELS = {
  agricultor: 'Agricultores', comerciante: 'Comerciantes', minero: 'Mineros', lenador: 'Leñadores',
  aldeano: 'Aldeanos', nino: 'Niños', clerigo: 'Clérigos', guardia: 'Guardias', curandero: 'Curanderos',
  sabio: 'Sabios', senor: 'Señorío', viajero: 'Viajeros'
};
export const ROLE_SINGULAR = {
  agricultor: 'agricultor', comerciante: 'comerciante', minero: 'minero', lenador: 'leñador',
  aldeano: 'aldeano', nino: 'niño', clerigo: 'clérigo', guardia: 'guardia', curandero: 'curandero',
  sabio: 'sabio', senor: 'señor de Valdecerro', viajero: 'viajero'
};
export const ROLE_FEMININE = {
  agricultor: 'agricultora', comerciante: 'comerciante', minero: 'minera', lenador: 'leñadora',
  aldeano: 'aldeana', nino: 'niña', clerigo: 'clériga', guardia: 'guardia', curandero: 'curandera',
  sabio: 'sabia', senor: 'señora de Valdecerro', viajero: 'viajera'
};
export const ACTIVITY_LABELS = {
  trabajar: 'Trabajando', comer: 'Comiendo', dormir: 'Durmiendo', entregar: 'Llevando la carga al depósito',
  construir: 'En la obra', pasear: 'Paseando', rezar: 'Rezando', casa: 'En casa', patrullar: 'De patrulla',
  visitar: 'De visita', evento: 'En un evento', curarse: 'Recuperándose', gobernar: 'Gobernando desde el castillo',
  estudiar: 'Estudiando', idle: 'Decidiendo qué hacer'
};
export const POLICY_LABELS = {
  cosecha: 'Decreto de cosecha: todos al campo', expansion: 'Decreto de expansión: se levantan obras sin pausa',
  defensa: 'Decreto de defensa: rondas dobles de guardia', saber: 'Decreto de saber: se protege a los estudiosos',
  fiesta: 'Decreto de fiesta: feria pagada por el castillo', austeridad: 'Decreto de austeridad: impuestos dobles'
};
export const STATE_LABELS = {
  IDLE: 'parado', TRAVEL: 'de camino', WORK: 'en el sitio', SOCIALIZE: 'charlando', SEEK_SHELTER: 'buscando refugio',
  SHELTERED: 'a cubierto', ATTEND_EVENT: 'acudiendo a un evento', LEAVE_MAP: 'saliendo del valle'
};
