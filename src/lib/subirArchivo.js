/* La costura de los archivos: Supabase Storage o el almacén propio.
 *
 * Hermana de `src/lib/sesion.js` (que hace lo mismo con el login) y de
 * `lib/supabase.js` en el backend (que lo hace con los datos). Las tres
 * banderas se mueven por separado, a propósito.
 *
 *   VITE_ARCHIVOS_PROPIOS apagada (hoy) → el navegador sube directo a Supabase
 *   VITE_ARCHIVOS_PROPIOS encendida     → PUT /archivos/<carpeta> al backend
 *
 * ── Lo que NO es simétrico entre los dos caminos ─────────────────────────
 *
 * Con Supabase **la ruta la decide el navegador** (`<uid>/cover-123.jpg`), y
 * es lo que la autoriza: la política de Storage exige que la carpeta raíz sea
 * el uid de quien sube. Con el almacén propio **la decide el servidor**, que
 * para eso sabe quién eres por el token.
 *
 * Por eso la `ruta` que calculan los componentes se sigue pasando —la necesita
 * el camino de Supabase— y se ignora en el otro, y por eso esto devuelve la
 * ruta que de verdad se usó y no la que se pidió: quien la guarde tiene que
 * guardar la buena.
 *
 * ── Dónde está lo que puede fallar en silencio ───────────────────────────
 *
 * En `subirArchivoTransporte.js`, que no importa nada y por eso se puede
 * probar con `node --test`. Aquí sólo está el cableado: qué camino se toma y
 * de dónde salen la dirección de la API, la sesión y el cliente de Supabase.
 *
 * ── Lo que devuelve ──────────────────────────────────────────────────────
 *
 *   { url, ruta, id, publico }
 *
 * `url` es null cuando el archivo es privado.
 */

import { API } from './apiUrl.js';
import { supabase } from './supabase.js';
import { auth } from './sesion.js';
import {
  subirAlPropio, subirASupabase, dondeVive, borrarDelPropio, borrarDeSupabase,
} from './subirArchivoTransporte.js';

export const ARCHIVOS_PROPIOS = import.meta.env.VITE_ARCHIVOS_PROPIOS === 'true';

async function token() {
  const { data } = await auth.getSession();
  return data?.session?.access_token || null;
}

export async function subirArchivo(carpeta, file, opciones = {}) {
  if (!file) throw new Error('No se recibió ningún archivo.');

  if (ARCHIVOS_PROPIOS) {
    return subirAlPropio({
      api: API, carpeta, file,
      eventoId : opciones.eventoId,
      token    : await token(),
      fetchImpl: fetch,
    });
  }

  return subirASupabase({
    storage: supabase.storage, carpeta, file,
    ruta        : opciones.ruta,
    upsert      : opciones.upsert,
    cacheControl: opciones.cacheControl,
    publico     : opciones.publico,
  });
}

/* Borra un archivo subido antes. Mira el `id`, no la bandera: ver
   `dondeVive()` en el transporte. */
export async function borrarArchivo({ carpeta, ruta, id } = {}) {
  if (dondeVive({ id }) === 'propio') {
    return borrarDelPropio({ api: API, id, token: await token(), fetchImpl: fetch });
  }
  return borrarDeSupabase({ storage: supabase.storage, carpeta, ruta });
}
