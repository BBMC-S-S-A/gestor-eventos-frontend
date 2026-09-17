/* Un fallo no es una lista vacía.
 *
 * ── El fallo ─────────────────────────────────────────────────────────────
 *
 * La pestaña Gestionar de la Rueda de Negocios cargaba así:
 *
 *     networkingApi.admin(evento.id)
 *       .then(d => setData(d.expositores || []))
 *       .catch(e => toastErr(...))        // y nada más
 *
 * `data` nace en `null`, y abajo `!data` y `data.length === 0` pintan lo mismo:
 * «Aún no agregaste expositores. Crea el primero para empezar.»
 *
 * Así que cuando la petición fallaba —un permiso, un 500, la red— la pantalla
 * afirmaba con total tranquilidad que no había ninguno. El toast era el único
 * indicio y se desvanece a los segundos; lo que se queda es la frase falsa.
 *
 * Medido contra producción el 17-sep: un evento publicado con una empresa dada
 * de alta, activa y con la ficha completa, enseñando el cartel de que todavía
 * no había ninguna.
 *
 * Lo que lo hace peor es que el servidor ya se cuidaba de esto. En
 * `routes/networking.js` está escrito, sobre esa misma consulta: «el error se
 * mira […] una agenda llena que se ve vacía es peor que un error». El backend
 * devuelve 500 con el motivo, y el frontend lo convertía en «no hay nada».
 *
 * ── Por qué una prueba sobre el texto del archivo ────────────────────────
 *
 * Porque lo que hay que impedir es que vuelva la FORMA: un `catch` que sólo
 * avisa y deja que el estado vacío hable por él. Eso se ve leyendo el archivo
 * y no montando el componente.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tab = path.join(raiz, 'src', 'pages', 'events', 'tabs', 'NetworkingTab.jsx');

test('un fallo al cargar la rueda no se pinta como «no hay expositores»', () => {
  const src = fs.readFileSync(tab, 'utf8');

  assert.match(src, /setFallo\(/,
    'el fallo de carga vuelve a no guardarse en ningún estado');

  /* El cartel de vacío no puede ser lo primero que se evalúa: el fallo va
     antes, o un error acaba enseñándolo otra vez. */
  const iFallo = src.indexOf('{fallo ?');
  /* Se busca «Crea el primero para empezar» y no el cartel entero: el cartel
     también aparece citado en el comentario que explica el fallo, más arriba
     en el archivo, y entonces la comparación de posiciones medía el comentario
     en vez del JSX. */
  const iVacio = src.indexOf('Crea el primero para empezar');
  assert.ok(iFallo !== -1, 'ya no se distingue el fallo del vacío al pintar');
  assert.ok(iFallo < iVacio,
    'el estado vacío se evalúa antes que el fallo: un error volverá a decir que no hay ninguno');

  assert.match(src, /Reintentar/,
    'se dice que falló pero no se ofrece volver a intentarlo');
});

test('la rueda pública no manda escribir a un contacto que no está', () => {
  /* `contacto_publico` nace apagado desde la 0105 —son datos personales y
     publicarlos no se deshace—, y el contacto sólo se pinta si está encendido.
     El texto, en cambio, decía SIEMPRE «escribe al contacto de la mesa». Con
     cero fichas encendidas en producción, la única instrucción de la página
     era imposible de seguir en todas las tarjetas. */
  const src = fs.readFileSync(
    path.join(raiz, 'src', 'pages', 'public', 'RuedaPublicaPage.jsx'), 'utf8');

  assert.match(src, /datos\.rueda\.some\(m => m\.contacto\)/,
    'el texto vuelve a prometer un contacto sin mirar si alguna mesa lo publica');
});

test('libre y ocupado no se dicen sólo con un tachado', () => {
  /* `line-through` y el color no existen para un lector de pantalla: las doce
     horas sonaban iguales y la lista de huecos libres salía inventada. */
  const src = fs.readFileSync(
    path.join(raiz, 'src', 'pages', 'public', 'RuedaPublicaPage.jsx'), 'utf8');

  assert.match(src, /sr-only[^]{0,120}ocupado/,
    'el estado de la franja vuelve a existir sólo en la pantalla');
});
