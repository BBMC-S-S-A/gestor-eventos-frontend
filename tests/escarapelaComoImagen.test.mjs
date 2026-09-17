/* Que la escarapela térmica se pueda imprimir como imagen, y no sólo como HTML.
 *
 * ── Por qué esto existe ──────────────────────────────────────────────────
 *
 * `ImprimirEtiquetas.jsx` imprime bien en el navegador, pero el driver de la
 * etiquetadora (Seagull/BarTender sobre una SAT TT460) reescala si su tamaño
 * de página no coincide EXACTO con el `@page` que manda Chrome — medido en
 * campo: la misma escarapela sale irreconocible de la impresora aunque en
 * pantalla se vea perfecta. Un PNG generado a 8 px/mm (203 dpi exactos, sin
 * nada que reescalar) le quita esa decisión al driver.
 *
 * `lib/etiquetaPng.js` dibuja con `<canvas>`, que no existe en `node:test`
 * sin un DOM — por eso esto comprueba que el camino está TENDIDO (el archivo
 * exporta lo que hace falta y la pantalla lo usa), no el resultado píxel a
 * píxel del dibujo. Esa parte se prueba a mano, imprimiendo el PNG.
 *
 * Correr: node --test tests/escarapelaComoImagen.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (ruta) => readFileSync(join(RAIZ, ruta), 'utf8');

test('lib/etiquetaPng.js expone lo que la pantalla necesita', () => {
  const src = leer('src/lib/etiquetaPng.js');
  assert.match(src, /export\s+async\s+function\s+etiquetaPng/, 'falta el dibujo de la escarapela en canvas');
  assert.match(src, /export\s+async\s+function\s+descargarEtiquetaPng/, 'falta la descarga del PNG suelto');
  assert.match(src, /export\s+async\s+function\s+imprimirComoPng/, 'falta la impresión de la tanda como imágenes');

  /* La resolución tiene que salir de `PUNTOS_POR_MM` (8 px/mm = 203 dpi) y no
     de un número suelto: si la impresora cambia de dpi, esto tiene que
     moverse con ella y no quedarse desincronizado del resto del archivo. */
  assert.match(src, /PUNTOS_POR_MM/, 'la resolución del PNG no está atada a la de la impresora');

  /* El QR se dibuja con `qrPng` (el mismo canvas propio que ya usan
     `tarjetaPng.jsx` y las descargas de QR suelto) y no con un SVG
     serializado a mano — la razón está documentada en `qrPng.jsx`. */
  assert.match(src, /qrPng\(/, 'el QR ya no sale del mismo generador de canvas que el resto de la plataforma');
});

test('la escarapela no cabe: `etiquetaPng` avisa en vez de generar algo a medias', () => {
  const src = leer('src/lib/etiquetaPng.js');
  assert.match(src, /if\s*\(\s*!m\.cabe\s*\)\s*return\s*null/, 'genera un PNG aunque el QR no quepa con estas medidas');
});

test('la pantalla de la etiquetadora ofrece las dos salidas', () => {
  const seccion = leer('src/pages/events/workspace/asistentes/EtiquetadoraSection.jsx');
  assert.match(seccion, /from\s+['"].*lib\/etiquetaPng\.js['"]/, 'la pantalla ya no importa el generador de PNG');
  assert.match(seccion, /Descargar PNG/, 'falta el botón para bajar la vista previa como imagen');
  assert.match(seccion, /Imprimir por imagen/, 'falta el botón para imprimir la tanda como imágenes');

  /* Los dos botones tienen que poder desactivarse cuando el QR no cabe — lo
     mismo que ya vale para «Imprimir N etiquetas»; si no, alguien genera cien
     PNG ilegibles antes de enterarse de que hay que ajustar las medidas. */
  /* Dos descargas: la escarapela sencilla (nombre y correo) y la completa. */
  for (const variante of ['true', 'false']) {
    assert.match(seccion,
      new RegExp(`onClick=\\{\\(\\) => descargarVistaPrevia\\(${variante}\\)\\}\\s+disabled=\\{generandoPng \\|\\| !!problema\\}`),
      `el botón de descargar PNG (${variante === 'true' ? 'sencilla' : 'completa'}) no se desactiva cuando la escarapela no cabe`);
  }
  assert.match(seccion, /onClick=\{imprimirPorPng\}\s+disabled=\{!!problema \|\| imprimiendoPng\}/,
    'el botón de imprimir por imagen no se desactiva cuando la escarapela no cabe');
});
