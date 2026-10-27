/* Los subidores pasan por una costura, y la costura hace lo que dice.
 *
 * Seis archivos del frontend suben a Supabase Storage. El día que
 * `ARCHIVOS_PROPIOS` se encienda tienen que subir al cPanel sin que nadie los
 * toque, igual que las 1.152 consultas del backend.
 *
 * ── Las tres cosas que, si se hacen mal, NO dan error ────────────────────
 *
 * **1 · La ruta que se guarda.** Con Supabase la decide el navegador; con el
 * almacén propio, el servidor. Guardar la que se pidió en vez de la que se
 * usó deja una ficha apuntando a ningún sitio — y la pantalla se ve bien
 * hasta que alguien pulsa el enlace.
 *
 * **2 · El borrado.** Lo decide dónde VIVE el archivo, no la bandera. Durante
 * la transición los dos almacenes tienen cosas: guiarse por la bandera
 * borraría en el sitio equivocado, o sea no borraría nada y diría que sí.
 *
 * **3 · La URL de lo privado.** De un bucket privado no se pide URL pública:
 * devuelve un enlace que no abre nada, que es peor que no tenerlo porque
 * parece que sí.
 *
 * Correr: node --test tests/ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.join(import.meta.dirname, '..');
const leer = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

const {
  subirAlPropio, subirASupabase, dondeVive, borrarDelPropio, borrarDeSupabase,
} = await import('../src/lib/subirArchivoTransporte.js');

const archivo = (nombre = 'foto.jpg', tipo = 'image/jpeg') => ({ name: nombre, type: tipo });
const respuesta = (cuerpo, ok = true, status = 200) => ({
  ok, status, json: async () => cuerpo,
});

/* ── El almacén propio ─────────────────────────────────────────────────── */

test('la subida va por PUT, con el archivo como cuerpo', async () => {
  /* No es `multipart/form-data` a propósito: ni librería de más ni parseo
     antes de aplicar el límite de tamaño. */
  let visto = null;
  const file = archivo();
  await subirAlPropio({
    api: 'https://api.x', carpeta: 'avatars', file, token: 'tok',
    fetchImpl: async (url, opts) => { visto = { url, opts }; return respuesta({ ok: true, archivo: { ruta: 'r', url: 'u', id: 7, publico: true } }); },
  });

  assert.equal(visto.opts.method, 'PUT');
  assert.equal(visto.opts.body, file, 'el cuerpo tiene que ser el archivo tal cual');
  assert.match(visto.url, /^https:\/\/api\.x\/archivos\/avatars\?/);
  assert.match(visto.url, /nombre=foto\.jpg/);
});

test('NO se manda Content-Type: el tipo lo deduce el servidor', () => {
  /* La cabecera la escribe quien sube, así que no vale como prueba de nada.
     El servidor mira los primeros bytes. */
  const src = leer('src/lib/subirArchivoTransporte.js');
  assert.doesNotMatch(src, /'Content-Type'\s*:/,
    'volvió a mandarse el Content-Type, y es justo lo que el servidor ignora');
});

test('con sesión va el Authorization; sin sesión, no', async () => {
  /* Sin sesión también se sube: las fotos de un formulario público las manda
     quien se inscribe, que no tiene cuenta. Si esa carpeta exige sesión lo
     decide el servidor. */
  const pedir = async (token) => {
    let visto = null;
    await subirAlPropio({
      api: 'https://api.x', carpeta: 'form-uploads', file: archivo(), token,
      fetchImpl: async (_u, o) => { visto = o; return respuesta({ archivo: { ruta: 'r' } }); },
    });
    return visto.headers;
  };
  assert.equal((await pedir('tok')).Authorization, 'Bearer tok');
  assert.equal((await pedir(null)).Authorization, undefined);
});

test('el evento viaja en la query cuando lo hay', async () => {
  let url = null;
  await subirAlPropio({
    api: 'https://api.x', carpeta: 'event-media', file: archivo(), eventoId: 'ev-1',
    fetchImpl: async (u) => { url = u; return respuesta({ archivo: { ruta: 'r' } }); },
  });
  assert.match(url, /evento=ev-1/);
});

test('devuelve la ruta QUE USÓ EL SERVIDOR, no la que se pidió', async () => {
  /* La diferencia que no da error: guardar la pedida deja la ficha apuntando a
     ningún sitio, y eso no se ve hasta que alguien pulsa el enlace. */
  const r = await subirAlPropio({
    api: 'https://api.x', carpeta: 'avatars', file: archivo(),
    fetchImpl: async () => respuesta({
      archivo: { ruta: 'u-9/avatar-999.jpg', url: 'https://cdn/u-9/avatar-999.jpg', id: 42, publico: true },
    }),
  });
  assert.deepEqual(r, { url: 'https://cdn/u-9/avatar-999.jpg', ruta: 'u-9/avatar-999.jpg', id: 42, publico: true });
});

test('una respuesta sin ruta LANZA en vez de devolver algo a medias', async () => {
  /* Un objeto a medias dejaría una ficha sin archivo detrás, sin error. */
  await assert.rejects(
    () => subirAlPropio({ api: 'a', carpeta: 'c', file: archivo(), fetchImpl: async () => respuesta({ ok: true }) }),
    /no devolvió dónde quedó/);
});

test('un error del almacén llega con SU mensaje', async () => {
  await assert.rejects(
    () => subirAlPropio({ api: 'a', carpeta: 'c', file: archivo(),
      fetchImpl: async () => respuesta({ error: 'Esa carpeta no existe.' }, false, 404) }),
    /Esa carpeta no existe/);
});

test('un 500 sin JSON tampoco pasa por bueno', async () => {
  await assert.rejects(
    () => subirAlPropio({ api: 'a', carpeta: 'c', file: archivo(),
      fetchImpl: async () => ({ ok: false, status: 500, json: async () => { throw new Error('no es JSON'); } }) }),
    /respondió 500/);
});

/* ── Supabase ──────────────────────────────────────────────────────────── */

const storageFalso = (opts = {}) => ({
  from: () => ({
    upload: async (...a) => { opts.visto = a; return { error: opts.error || null }; },
    getPublicUrl: (ruta) => ({ data: { publicUrl: `https://sb/${ruta}` } }),
    remove: async (rutas) => { opts.borradas = rutas; return { error: opts.error || null }; },
  }),
});

test('a Supabase va la ruta que calculó el navegador', async () => {
  /* La política de Storage exige que la carpeta raíz sea el uid: esa ruta ES
     la autorización, no una preferencia. */
  const o = {};
  const r = await subirASupabase({ storage: storageFalso(o), carpeta: 'avatars', file: archivo(), ruta: 'u-1/a.jpg', upsert: true });
  assert.equal(o.visto[0], 'u-1/a.jpg');
  assert.equal(o.visto[2].upsert, true);
  assert.equal(o.visto[2].contentType, 'image/jpeg');
  assert.equal(r.url, 'https://sb/u-1/a.jpg');
  assert.equal(r.id, null, 'Supabase no da id: es lo que luego distingue dónde vive');
});

test('sin ruta, LANZA', async () => {
  await assert.rejects(
    () => subirASupabase({ storage: storageFalso(), carpeta: 'avatars', file: archivo() }),
    /Falta la ruta/);
});

test('de un bucket PRIVADO no se pide URL pública', async () => {
  const r = await subirASupabase({ storage: storageFalso(), carpeta: 'form-uploads', file: archivo(), ruta: 'r.pdf', publico: false });
  assert.equal(r.url, null, 'devolvería un enlace que no abre nada, y parece que sí');
  assert.equal(r.ruta, 'r.pdf');
});

/* ── El borrado: lo decide dónde VIVE, no la bandera ───────────────────── */

test('con id es del almacén propio; sin id, de Supabase', () => {
  assert.equal(dondeVive({ id: 7 }), 'propio');
  assert.equal(dondeVive({ id: null }), 'supabase');
  assert.equal(dondeVive({}), 'supabase');
  assert.equal(dondeVive(), 'supabase');
});

test('borrar del propio va por DELETE con el id', async () => {
  let visto = null;
  await borrarDelPropio({ api: 'https://api.x', id: 7, token: 'tok',
    fetchImpl: async (u, o) => { visto = { u, o }; return { ok: true }; } });
  assert.equal(visto.u, 'https://api.x/archivos/7');
  assert.equal(visto.o.method, 'DELETE');
  assert.equal(visto.o.headers.Authorization, 'Bearer tok');
});

test('borrar de Supabase necesita carpeta y ruta', async () => {
  const o = {};
  await borrarDeSupabase({ storage: storageFalso(o), carpeta: 'event-media', ruta: 'u/d.pdf' });
  assert.deepEqual(o.borradas, ['u/d.pdf']);
  await assert.rejects(() => borrarDeSupabase({ storage: storageFalso(), carpeta: 'event-media' }), /hace falta la carpeta y la ruta/);
});

/* ── Que los seis pasen por la costura ─────────────────────────────────── */

test('NINGÚN componente sube a Supabase por su cuenta', () => {
  /* Si uno se queda fuera, el día del corte seguiría subiendo a Supabase
     mientras el resto sube al cPanel — sin error, y con los archivos nuevos
     repartidos entre dos sitios. */
  const fuentes = [];
  const anda = (dir) => {
    for (const e of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) anda(p);
      else if (/\.jsx?$/.test(e.name)) fuentes.push(p);
    }
  };
  anda('src');

  /* Los dos de la costura. El transporte sale aquí porque dice `storage.from(`,
     pero el `storage` se lo PASAN: no importa `lib/supabase.js` —hay una prueba
     abajo que lo vigila— y por eso se puede probar fuera del navegador. */
  const PERMITIDOS = ['src/lib/subirArchivo.js', 'src/lib/subirArchivoTransporte.js'];
  const sueltos = fuentes
    .filter(p => /supabase\.storage|storage\.from\(/.test(leer(p)))
    .filter(p => !PERMITIDOS.includes(p.replace(/\\/g, '/')));

  assert.deepEqual(sueltos, [],
    'Estos hablan con Supabase Storage sin pasar por `lib/subirArchivo.js`.\n' +
    sueltos.map(s => `  · ${s}`).join('\n'));
});

test('los seis subidores piden la costura', () => {
  const SUBIDORES = [
    'src/components/ui/AvatarUploader.jsx',
    'src/components/ui/CoverUploader.jsx',
    'src/components/ui/FormPhotoUploader.jsx',
    'src/components/ui/FormFileUploader.jsx',
    'src/pages/vacantes/PerfilTalentoEditor.jsx',
    'src/pages/events/workspace/DocumentosSection.jsx',
  ];
  for (const f of SUBIDORES) {
    assert.match(leer(f), /from '.*subirArchivo\.js'/, `${f} ya no pide la costura`);
  }
});

test('DocumentosSection guarda el archivoId, que es lo que luego dice dónde vive', () => {
  /* Sin guardarlo, el borrado de un documento subido al cPanel se iría a
     Supabase a buscar algo que no está. No daría error: no borraría nada. */
  const src = leer('src/pages/events/workspace/DocumentosSection.jsx');
  assert.match(src, /archivoId: subido\.id/, 'ya no se guarda el id del almacén propio');
  assert.match(src, /borrarArchivo\(\{[^}]*id: doc\.archivoId/, 'el borrado ya no mira el id');
});

test('los que GUARDAN una ruta guardan la que devolvió la costura', () => {
  /* El hueco que destapó una mutación: cambiar `subido.ruta` por la `ruta`
     local no rompía nada. Con Supabase son la misma, así que la prueba de
     integración no lo nota; con el almacén propio la decide el servidor, y
     guardar la pedida deja la ficha apuntando a ningún sitio — sin error,
     hasta que alguien pulsa el enlace o intenta borrarlo.

     Se mira el texto porque son componentes de React: montarlos para esto
     costaría más de lo que protege, y lo que se vigila es de dónde sale el
     valor, no qué pinta. */
  const casos = [
    ['src/pages/events/workspace/DocumentosSection.jsx', /path: subido\.ruta/],
    ['src/components/ui/FormFileUploader.jsx',           /privado:\$\{subido\.ruta\}/],
  ];
  for (const [f, debe] of casos) {
    assert.match(leer(f), debe, `${f} guarda una ruta que no es la que se usó`);
  }
});

test('el transporte NO importa nada, y por eso se puede probar', () => {
  /* El día que alguien le añada un `import` de `supabase.js` o de `apiUrl.js`,
     este archivo deja de poder cargarse en Node y estas pruebas se vuelven
     imposibles de escribir. Mejor que lo diga ahora. */
  const src = leer('src/lib/subirArchivoTransporte.js');
  assert.doesNotMatch(src, /^\s*import\s/m,
    'el transporte importó algo: deja de poder probarse fuera del navegador');
});
