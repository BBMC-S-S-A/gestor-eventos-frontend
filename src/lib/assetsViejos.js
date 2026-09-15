/* Recuperación de assets viejos servidos por un service worker desincronizado.
 *
 * ── De dónde sale ─────────────────────────────────────────────────────────
 *
 * `vite.config.js` usa `registerType: 'prompt'` sin `skipWaiting()` a
 * propósito: no se le puede cambiar el paquete por debajo a alguien que tiene
 * una cola de escaneos a medio hacer en la puerta. Pero eso tiene un costo —
 * una pestaña que se queda abierta puede seguir sirviendo una build vieja
 * mientras hay una nueva desplegada, y si eso pasa a mitad de sesión, esa
 * pestaña termina ejecutando una MEZCLA de chunks de dos builds distintas.
 *
 * Un chunk viejo importando uno nuevo (o al revés) no da un 404 limpio: da
 * basura. El síntoma típico es un `ReferenceError` — "Cannot access 'x'
 * before initialization" — en CUALQUIER pantalla, sin relación con lo que esa
 * pantalla hace. Visto en producción en dos módulos que no se tocan entre sí
 * (Calendario y Torneos): esa fue la pista de que no era un bug de esas
 * pantallas, sino de la build entera.
 *
 * ── Por qué sólo se intenta una vez por episodio ─────────────────────────
 *
 * No todo "before initialization" es esto — también lo produce un bug de
 * verdad. Por eso la recuperación se intenta, y si el mismo error vuelve a
 * los pocos segundos de haberla intentado, se deja de intentar: en ese punto
 * ya no es una build vieja (se acaba de limpiar todo y recargar) y el error
 * es del código. Ahí es cuando `ErrorBoundary` muestra su pantalla normal en
 * vez de recargar otra vez.
 */

const MENSAJES_STALE = [
  /before initialization/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
];

export function pareceAssetViejo(error) {
  const msg = String(error?.message || error || '');
  return MENSAJES_STALE.some((re) => re.test(msg));
}

/* Borra el service worker y sus cachés, y recarga. Es lo mismo que hacer a
   mano Application → Unregister + Clear storage + F5 — la única forma de
   estar seguro de que lo que se ejecuta después es la build de verdad, y no
   sólo un F5 que el propio service worker puede seguir interceptando. */
async function limpiarYRecargar() {
  try {
    if ('serviceWorker' in navigator) {
      const registros = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registros.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const nombres = await window.caches.keys();
      await Promise.all(nombres.map((n) => window.caches.delete(n)));
    }
  } catch {
    /* Si esto falla, igual se recarga: quedarse en la versión rota es peor
       que un F5 que no alcanzó a limpiar todo. */
  } finally {
    window.location.reload();
  }
}

const CLAVE_ULTIMO_INTENTO = 'gestek_recuperacion_stale_at';
const VENTANA_MS = 15000;

/* Devuelve `true` si el error parecía un asset viejo Y se disparó la
   recuperación (recarga en curso). `false` si no aplicaba o si ya se había
   intentado hace poco y el error volvió — ahí quien llama debe seguir con su
   manejo normal (mostrar el error, no recargar de nuevo). */
export function intentarRecuperarDeAssetViejo(error) {
  if (!pareceAssetViejo(error)) return false;

  const ultimo = Number(sessionStorage.getItem(CLAVE_ULTIMO_INTENTO) || 0);
  if (Date.now() - ultimo < VENTANA_MS) return false;

  sessionStorage.setItem(CLAVE_ULTIMO_INTENTO, String(Date.now()));
  limpiarYRecargar();
  return true;
}
