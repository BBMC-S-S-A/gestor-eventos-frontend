/* El formulario público es del evento, no de la plataforma.
 *
 * ── Los dos fallos ───────────────────────────────────────────────────────
 *
 * 1 · La barra de pasos era invisible. `.paso-marca` pintaba `--brand-primary`
 *     tal cual, y FESTECH tiene la marca en `#00003A` —azul marino casi negro—
 *     sobre un fondo `#1A1A1A`. Eso es 1,14:1 de contraste: no se veía nada.
 *     El formulario decía «Paso 1 de 3» y la barra no decía cuánto faltaba,
 *     que es lo único que esa barra hace.
 *
 *     No es un color mal elegido: un azul marino es perfecto en un logo sobre
 *     blanco. Deja de serlo como marca de progreso sobre negro.
 *
 * 2 · El resto del formulario seguía saliendo en el ámbar de la plataforma:
 *     las píldoras de «¿ya te registraste antes?», los avisos, los enlaces.
 *     Un formulario mitad del organizador y mitad nuestro, en una página que
 *     se vende como suya.
 *
 * ── Por qué el umbral es 3 y no 4,5 ─────────────────────────────────────
 *
 * Porque una barra no es texto. La WCAG pide 3:1 para lo que no lo es
 * (1.4.11). Exigirle 4,5 la empujaría a un pastel que ya no se parecería a la
 * marca — y el objetivo es que se vea, no que deje de ser suya.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paletaDeMarca, marcaVisibleSobre, aRGB, luminancia } from '../src/lib/esquemaAnfitrion.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contraste = (a, b) => {
  const L = x => luminancia(aRGB(x)) + 0.05;
  return Math.max(L(a), L(b)) / Math.min(L(a), L(b));
};
const hex = t => '#' + t.split(' ').map(n => (+n).toString(16).padStart(2, '0')).join('');

/* Los colores REALES de FESTECH, no unos inventados: el caso que lo destapó. */
const MARCA = '#00003A';
const FONDO = '#1A1A1A';

test('una marca oscura sobre fondo oscuro se despega lo justo para verse', () => {
  assert.ok(contraste(MARCA, FONDO) < 1.5,
    'el caso de partida ya no es el que era; revisar la prueba');

  const vis = marcaVisibleSobre(MARCA, FONDO);
  assert.ok(contraste(vis, FONDO) >= 3,
    `la barra de pasos vuelve a ser invisible (${contraste(vis, FONDO).toFixed(2)}:1)`);

  /* Y sigue siendo azul: el canal azul manda sobre los otros dos. No se le
     cambia el color a nadie, se le sube el brillo. */
  const [r, g, b] = aRGB(vis);
  assert.ok(b > r && b > g, 'la marca dejó de ser azul al hacerse visible');
});

test('una marca que ya se ve no se toca', () => {
  const vivo = '#C9A227';
  assert.equal(marcaVisibleSobre(vivo, FONDO).toLowerCase(), vivo.toLowerCase(),
    'se está retocando un color que no hacía falta retocar');
});

test('el acento no puede chocar con un texto blanco fijo', () => {
  /* En el formulario hay un `bg-accent text-white`. Si el acento saliera del
     acento de la marca —el de FESTECH es BLANCO— eso sería blanco sobre
     blanco. Por eso se deriva del primario. */
  const p = paletaDeMarca(MARCA, FONDO);
  for (const k of ['--color-accent', '--color-accent-light', '--color-accent-dark']) {
    assert.ok(contraste(hex(p[k]), '#FFFFFF') >= 3,
      `${k} deja ilegible el texto blanco que va encima`);
  }
});

test('el aviso de versión no sale en la parte de marca blanca, ni nombra la marca', () => {
  const src = fs.readFileSync(path.join(raiz, 'src', 'main.jsx'), 'utf8');
  assert.match(src, /if \(enParteBlanca\(\)\) return;/,
    'el aviso vuelve a poder salir sobre la web del organizador');
  assert.ok(!/versión nueva de GESTEK/.test(src),
    'el aviso vuelve a nombrar a la plataforma en una página de marca blanca');
});
