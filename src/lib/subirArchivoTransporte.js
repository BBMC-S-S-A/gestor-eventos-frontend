/* El transporte de los archivos, sin depender de nada.
 *
 * Este archivo NO importa nada: ni Supabase, ni la sesión, ni la dirección de
 * la API. Todo lo que necesita se lo pasan. Y eso no es ceremonia — es lo que
 * permite probarlo con `node --test`.
 *
 * El motivo es concreto: `lib/supabase.js`, `lib/sesion.js` y `lib/apiUrl.js`
 * leen `import.meta.env`, que Vite sustituye al compilar y en Node no existe.
 * Un archivo que los importe no se puede importar desde una prueba, y lo único
 * que queda entonces es buscar texto en el código —que comprueba que algo está
 * escrito, no que haga lo que dice—.
 *
 * Así que aquí vive lo que puede fallar en silencio, y en `subirArchivo.js`,
 * el cableado. Es la misma separación que en el backend entre `compilar()` y
 * `ejecutar()`, y por la misma razón.
 */

/* ── Subir al almacén propio ─────────────────────────────────────────────
 *
 * El cuerpo ES el archivo. No es `multipart/form-data` a propósito: así no
 * hace falta una librería de más ni en el navegador ni en el servidor, y el
 * límite de tamaño se aplica antes de leer nada.
 *
 * El `Content-Type` NO se manda: el servidor deduce el tipo de los primeros
 * bytes, porque la cabecera la escribe quien sube.
 */
export async function subirAlPropio({ api, carpeta, file, eventoId, token, fetchImpl }) {
  const p = new URLSearchParams({ nombre: file.name });
  if (eventoId) p.set('evento', eventoId);

  const cabeceras = {};
  /* Sin sesión también se sube: las fotos de un formulario público las manda
     quien se inscribe, que no tiene cuenta. Si esa carpeta exige sesión lo
     decide el servidor, no el navegador. */
  if (token) cabeceras.Authorization = `Bearer ${token}`;

  const r = await fetchImpl(`${api}/archivos/${encodeURIComponent(carpeta)}?${p}`, {
    method : 'PUT',
    headers: cabeceras,
    body   : file,
  });

  let cuerpo = null;
  try { cuerpo = await r.json(); } catch { /* respuesta sin JSON */ }

  if (!r.ok || cuerpo?.error) {
    throw new Error(cuerpo?.error || `El almacén respondió ${r.status}.`);
  }

  const a = cuerpo?.archivo;
  /* Sin ruta no hay nada que guardar, y devolver un objeto a medias dejaría
     una ficha apuntando a ningún sitio — sin error. */
  if (!a?.ruta) throw new Error('El almacén no devolvió dónde quedó el archivo.');

  return { url: a.url ?? null, ruta: a.ruta, id: a.id ?? null, publico: Boolean(a.publico) };
}

/* ── Subir a Supabase Storage ────────────────────────────────────────────
 *
 * Aquí la ruta la decide el navegador, y no es un capricho: las políticas de
 * Storage exigen que la carpeta raíz sea el uid de quien sube
 * (`auth.uid() = foldername[1]`), así que esa ruta ES la autorización.
 */
export async function subirASupabase({ storage, carpeta, file, ruta, upsert, cacheControl, publico }) {
  if (!ruta) throw new Error('Falta la ruta: con Supabase la decide el navegador.');

  const opciones = { contentType: file.type };
  if (upsert !== undefined) opciones.upsert = upsert;
  if (cacheControl) opciones.cacheControl = cacheControl;

  const { error } = await storage.from(carpeta).upload(ruta, file, opciones);
  if (error) throw new Error(error.message);

  /* De un bucket privado no se pide la URL pública: devolvería un enlace que
     no abre nada, que es peor que no tenerlo porque parece que sí. */
  const url = publico === false ? null : storage.from(carpeta).getPublicUrl(ruta).data.publicUrl;

  return { url, ruta, id: null, publico: publico !== false };
}

/* ── Dónde vive un archivo ───────────────────────────────────────────────
 *
 * Lo decide el `id`, NO la bandera. Durante la transición los dos almacenes
 * tienen cosas: lo subido antes del corte está en Supabase y lo de después,
 * en el cPanel. Un borrado guiado por la bandera borraría en el sitio
 * equivocado — o sea, no borraría nada y diría que sí.
 *
 * El almacén propio devuelve un `id`; Supabase no. Esa es la señal.
 */
export function dondeVive({ id } = {}) {
  return id ? 'propio' : 'supabase';
}

export async function borrarDelPropio({ api, id, token, fetchImpl }) {
  const r = await fetchImpl(`${api}/archivos/${id}`, {
    method : 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) {
    let cuerpo = null;
    try { cuerpo = await r.json(); } catch { /* sin JSON */ }
    throw new Error(cuerpo?.error || `El almacén respondió ${r.status}.`);
  }
}

export async function borrarDeSupabase({ storage, carpeta, ruta }) {
  if (!carpeta || !ruta) throw new Error('Sin `id` hace falta la carpeta y la ruta para borrar.');
  const { error } = await storage.from(carpeta).remove([ruta]);
  if (error) throw new Error(error.message);
}
