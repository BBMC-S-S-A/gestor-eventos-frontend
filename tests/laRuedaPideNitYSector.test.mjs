/* La rueda pide NIT y sector, y los pide por su nombre.
 *
 * ── Qué se pidió ─────────────────────────────────────────────────────────
 *
 * Que una empresa se dé de alta en la rueda como comprador o vendedor, con
 * nombre, NIT y sector, y una descripción que cambia según el papel: el
 * producto si vende, el reto si compra.
 *
 * ── Qué hacía falta de verdad ───────────────────────────────────────────
 *
 * Menos de lo que parecía. Comprobado contra la base real, no contra el
 * volcado de `db/esquema/`, que puede ir por detrás:
 *
 *   · `rol`          ya existía (0105), naciendo en `comprador`.
 *   · el sector      ya existía: es `categoria_negocio`. No es una lectura
 *                    libre — `lib/heredarRespuestas.js` declara «sector» como
 *                    su PRIMER sinónimo y hay una prueba que lo afirma. Estaba
 *                    rotulado «Categoría», que es lo único que estaba mal.
 *   · la descripción ya existía: una columna y dos preguntas, no dos columnas.
 *                    Con dos habría que decidir qué se pierde cuando alguien
 *                    cambia de papel, y la respuesta sería perder lo escrito.
 *
 * Sólo el NIT era nuevo (migración 0129).
 *
 * ── Por qué esta prueba ─────────────────────────────────────────────────
 *
 * Porque el modo de fallo de este proyecto es que falte un eslabón y nadie
 * avise. Una columna que existe en la base y que ningún formulario escribe se
 * queda vacía para siempre sin un solo error — que es exactamente lo que le
 * pasó a `categoria_negocio`: existía, tenía su campo, y las seis fichas de
 * producción la tenían en blanco.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = (...p) => fs.readFileSync(path.join(raiz, ...p), 'utf8');

test('el panel manda el NIT y el sector al guardar', () => {
  const src = leer('src', 'pages', 'events', 'tabs', 'NetworkingTab.jsx');

  /* El campo puede existir en pantalla y no viajar en el cuerpo: es la forma
     más silenciosa de perder un dato — se escribe, se guarda, y no está. */
  assert.match(src, /nit: nit\.trim\(\) \|\| null/,
    'el NIT se teclea pero no se manda al guardar');
  assert.match(src, /categoria_negocio: sector\.trim\(\) \|\| null/,
    'el sector se teclea pero no se manda al guardar');
});

test('la descripción se pregunta según el papel', () => {
  const src = leer('src', 'pages', 'events', 'tabs', 'NetworkingTab.jsx');
  assert.match(src, /Descripción del producto/,
    'al vendedor ya no se le pregunta por su producto');
  assert.match(src, /Descripción del reto/,
    'al comprador ya no se le pregunta por su reto');
  assert.match(src, /rol === 'vendedor' \?/,
    'la pregunta dejó de depender del papel');
});

test('la ficha pública también pide NIT, y llama sector al sector', () => {
  const src = leer('src', 'pages', 'public', 'ExpositorPage.jsx');
  assert.match(src, /set\(\{ nit:/, 'la empresa no puede escribir su propio NIT');
  assert.match(src, /label">Sector/, 'el sector vuelve a rotularse «Categoría»');
  assert.ok(!/label">Categoría/.test(src),
    'queda el rótulo viejo: en una rueda lo que se pide es el sector');
});
