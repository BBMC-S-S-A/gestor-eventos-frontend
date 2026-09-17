/* GESTEK — Linter mínimo, con una sola regla que importa: `no-undef`.

   No está aquí para opinar de estilo. Está por una clase de fallo que ya ha
   mordido tres veces, y siempre igual: una función que se llama y que nadie
   escribió, o una variable de otro componente usada como si fuera global.

   · `verificar()` frente a `verificarCorreo()` — la pista cruzada no salía.
   · `clave()` en FormularioTab — las fichas prearmadas no hacían NADA al
     pulsarlas, porque un ReferenceError dentro de un manejador de clic no lo
     atrapa el error boundary de React: el botón se queda mudo y no hay ni
     pantalla de error que seguir.
   · `anunciosVersion` en EventWorkspace — la pestaña de Anuncios ni se pintaba.

   Las tres son invisibles al compilar: Vite empaqueta sin quejarse porque son
   errores de ejecución. Dos de las tres salieron en treinta segundos la
   primera vez que se le pasó esta regla al proyecto entero.

   Deliberadamente NO se añaden reglas de estilo ni de React: un linter que
   grita por comillas se acaba desactivando, y con él se va el que sí servía. */

/* A mano en vez del paquete `globals`, para no añadir una dependencia por una
   lista. Si falta alguno, el síntoma es un falso positivo evidente. */
const NAVEGADOR = [
  'window', 'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
  'fetch', 'Headers', 'Request', 'Response', 'FormData', 'URL', 'URLSearchParams', 'Blob', 'File',
  'FileReader', 'Image', 'Audio', 'console', 'alert', 'confirm', 'prompt', 'crypto', 'atob', 'btoa',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame',
  'cancelAnimationFrame', 'ResizeObserver', 'IntersectionObserver', 'MutationObserver',
  'DOMParser', 'XMLHttpRequest', 'WebSocket', 'Worker', 'CustomEvent', 'Event', 'AbortController',
  'getComputedStyle', 'matchMedia', 'structuredClone', 'TextEncoder', 'TextDecoder',
  'DecompressionStream', 'CompressionStream', 'HTMLElement', 'Node', 'CanvasRenderingContext2D',
  'performance', 'queueMicrotask', 'reportError', 'Notification', 'createImageBitmap',
  'MediaRecorder', 'MediaSource', 'Intl', 'BroadcastChannel', 'IDBKeyRange', 'indexedDB',
];

/* El service worker corre fuera de la ventana: su global es `self`. */
const SERVICE_WORKER = ['self', 'caches', 'clients', 'registration', 'skipWaiting', 'importScripts'];

const comoGlobales = (lista) => Object.fromEntries(lista.map(g => [g, 'readonly']));

export default [
  {
    files: ['src/**/*.js', 'src/**/*.jsx'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: comoGlobales(NAVEGADOR),
    },
    linterOptions: { reportUnusedDisableDirectives: false },
    rules: { 'no-undef': 'error' },
  },
  {
    files: ['src/sw.js', 'src/**/*.worker.js'],
    languageOptions: { globals: comoGlobales([...NAVEGADOR, ...SERVICE_WORKER]) },
  },
];
