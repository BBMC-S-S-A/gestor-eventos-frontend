/* Adjuntar archivos, y que los sensibles no anden sueltos.
 *
 * El bucket público sirve por URL que no caduca, y esa URL viaja dentro de las
 * respuestas: sale en el Excel de asistentes y en cualquier pantalla que las
 * enseñe. Para un pitch deck está bien; para una cédula escaneada es una
 * filtración esperando a que alguien reenvíe la hoja.
 *
 * Correr: node --test tests/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (f) => readFileSync(f, 'utf8').replace(/\r/g, '');
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const UP = leer('src/components/ui/FormFileUploader.jsx');
const UP_LIMPIO = sinComentarios(UP);

test('el navegador no elige el bucket: lo pregunta', () => {
  /* Si lo eligiera aquí, bastaría con no creérselo desde una consola: subir el
     documento al bucket público y guardar su URL. No fallaría nada y el
     archivo quedaría con un enlace eterno dentro del Excel.

     La subida pasa ahora por `lib/subirArchivo.js` —la costura que decide
     entre Supabase y el almacén propio—, así que el destino viaja como primer
     argumento en vez de como `.from(...)`. Lo que se vigila es lo mismo: que
     salga de `destino.bucket` y no de aquí. */
  assert.match(UP_LIMPIO, /eventosApi\.destinoDeArchivo\(slug, campo\.id, ext\)/);
  assert.match(UP_LIMPIO, /subirArchivo\(destino\.bucket,/);
  /* Y no hay ningún nombre de bucket escrito a mano. */
  assert.doesNotMatch(UP_LIMPIO, /'form-uploads/);
});

test('de un archivo privado no se pide la URL pública', () => {
  /* Ese bucket no la tiene: devolvería un enlace que no abre nada, que es peor
     que no tenerlo porque parece que sí.

     Ahora quien no la pide es la costura —`subirASupabase` con
     `publico: false` devuelve `url: null`, y hay una prueba suya que lo fija—,
     así que aquí se comprueba que el componente se lo DICE y que guarda la
     ruta que de verdad se usó. Esto último importa con el almacén propio: la
     ruta la decide el servidor, y guardar la que se pidió dejaría la ficha
     apuntando a ningún sitio. */
  assert.match(UP_LIMPIO, /publico\s*:\s*!destino\.privado/,
    'ya no se le dice a la costura que ese destino es privado');
  assert.match(UP_LIMPIO, /onChange\(`privado:\$\{subido\.ruta\}`\)/,
    'ya no se guarda la ruta que devolvió la subida');
  assert.doesNotMatch(UP_LIMPIO, /getPublicUrl/,
    'el componente volvió a pedir la URL pública por su cuenta');
});

test('el tope y los formatos los dice el servidor, y se avisan antes', () => {
  /* Elegir un archivo de 40 MB y esperar a que falle la subida es medio
     formulario perdido. */
  assert.match(UP_LIMPIO, /destino\.max_bytes/);
  assert.match(UP_LIMPIO, /permitidos\.includes\(file\.type\)/);
});

test('a quien manda su cédula se le dice antes de subir', () => {
  /* Tiene derecho a saber que no va a quedar en un enlace público — y decirlo
     después de subir no sirve de nada. */
  assert.match(UP, /campo\?\.sensible &&/);
  assert.match(UP, /Se guarda en privado/);
});

test('un archivo privado no ofrece un enlace que no abre', () => {
  assert.match(UP_LIMPIO, /\{!esPrivado && \(/);
});

/* ── El editor del formulario ─────────────────────────────────────────── */

test('la casilla de sensible sólo sale en un archivo', () => {
  /* En cualquier otro tipo es una promesa que nadie cumple: quien la marque
     creerá que ese dato queda protegido, y no cambia nada. */
  const c = leer('src/components/CampoSensible.jsx');
  assert.match(c, /campo\?\.tipo !== 'archivo'\) return null/);
  assert.match(c, /Son datos sensibles/);
  /* Y dice qué pasa si NO se marca, que es la mitad que se olvida. */
  assert.match(c, /sale en el Excel/);
});

test('y sale en los tres formularios, no sólo en el del evento', () => {
  /* El editor de sub-eventos y torneos dejaba pedir un archivo pero no decir
     que era una cédula: el adjunto se iba siempre al bucket público, con un
     enlace que no caduca dentro de `respuestas` — o sea, en el CSV. */
  for (const f of ['src/pages/events/tabs/FormularioTab.jsx', 'src/pages/events/tabs/PreguntasSubEvento.jsx']) {
    const s = leer(f);
    assert.match(s, /<CampoSensible campo=/, `${f} no ofrece marcar el archivo como sensible`);
    assert.match(sinComentarios(s), /sensible: Boolean\(c\.sensible\)/, `${f} no guarda «sensible»`);
    assert.doesNotMatch(s, /Son datos sensibles/, `${f} tiene su propia copia del texto`);
  }
});

/* ── Verlo desde el panel ─────────────────────────────────────────────── */

test('la referencia no se pinta cruda', () => {
  /* «privado:evt/campo-123.pdf» parece un dato roto, y alguien lo borraría. */
  const c = sinComentarios(leer('src/pages/events/tabs/ClientesTab.jsx'));
  assert.match(c, /f\.valor\.startsWith\('privado:'\)/);
  assert.match(c, /<AbrirArchivoPrivado/);
});

test('el enlace firmado se pide al pulsar, no al abrir la ficha', () => {
  /* Cargar la ficha de alguien no es querer ver su documento, y firmar por
     adelantado dejaría un enlace vivo cada vez que se mira una boleta. */
  const c = leer('src/pages/events/tabs/ClientesTab.jsx');
  assert.match(c, /const abrir = async \(\) => \{/);
  assert.match(c, /clientesApi\.archivoPrivado\(eventoId, ticketId, campoId\)/);
  /* Y se dice que queda registrado: quien lo abre tiene que saberlo. */
  assert.match(c, /queda registrado quién lo abrió/);
});

test('sin `slug` el campo avisa en vez de subir a ciegas', () => {
  /* Pedir un documento y perderlo es peor que decir que ahora mismo no se
     puede. */
  const cf = leer('src/components/ui/CampoFormulario.jsx');
  assert.match(cf, /\{slug \? \(/);
  assert.match(cf, /Este archivo se adjunta desde la página del evento/);
});
