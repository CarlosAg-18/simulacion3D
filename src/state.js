// Contenedores mutables compartidos por todos los módulos. Se rellenan en el arranque, nunca en la importación.
export const Sim = { time: 0, paused: false, timeScale: 1, frame: 0 };
export const agents = [];
export const animals = [];
export const World = {
  buildings: {}, shelters: [], stalls: [], obstacles: [], anchors: {},
  church: null, feria: null, cart: null, sunMesh: null, moonMesh: null,
  fields: [], homes: [], stallSpots: [], granaries: 0,
  trees: null, treeList: [], constructions: [], siteGroup: null,
  cemetery: null, graves: [], botica: null, escuela: null, flame: null,
  hospital: null, universidad: null, ayuntamiento: null, fabrica: null, bridges: [],
  deposits: [], dynamics: []
};
export const Render = {
  scene: null, renderer: null, camera: null, controls: null,
  sunLight: null, moonLight: null, hemiLight: null, ambientLight: null
};
export const CameraState = { autoEnabled: true, interacting: false, idle: 0 };
// Habitante al que sigue la cámara y teclas de desplazamiento pulsadas.
export const Follow = { agent: null };
export const Keys = { forward: 0, right: 0 };
