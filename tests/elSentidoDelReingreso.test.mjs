/* El reingreso deja fijar el sentido.
 *
 * ── El fallo, tal como se reportó ────────────────────────────────────────
 *
 * «El botón de Reingreso marca salida en vez de entrada».
 *
 * Y el servidor estaba haciendo lo correcto. En `routes/clientes.js:1280`:
 *
 *     const dentroAhora = ult?.tipo ? ult.tipo === 'entrada'
 *                                   : (zona ? false : ticket.estado === 'usado');
 *
 * Sin movimientos previos y sin zona, el estado sale de la boleta — y para
 * cualquiera que ya pasó por Check-in, `estado` es SIEMPRE 'usado'. O sea:
 * está dentro, luego el siguiente escaneo es su salida. Impecable como
 * interruptor.
 *
 * El problema es que el modo se llama «Reingreso», que quiere decir volver a
 * entrar, y quien está en la puerta pulsa esperando una ENTRADA. La palabra
 * prometía una cosa y el interruptor hacía otra.
 *
 * ── Por qué este arreglo y no cambiar la alternancia ────────────────────
 *
 * Porque alternar es lo correcto para una puerta única —entra, sale, entra— y
 * cambiarlo rompería el aforo de quien ya lo usa así. Lo que faltaba no era
 * otra regla: era que quien mira la puerta pudiera decir hacia dónde va la
 * gente. En una puerta de sólo entrada, o al pasar de una sala a otra, el
 * sentido no se adivina: se sabe.
 *
 * La ruta acepta `tipo: 'entrada'|'salida'` desde siempre. El panel nunca lo
 * mandaba.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(
  path.join(raiz, 'src', 'pages', 'events', 'tabs', 'CheckinTab.jsx'), 'utf8');

test('el sentido del reingreso se puede fijar, y viaja al servidor', () => {
  assert.match(src, /elegirSentido/,
    'ya no se puede fijar el sentido: vuelve a decidirlo siempre el servidor');

  /* Lo que importa es que llegue. Un selector que no viaja en el cuerpo es un
     botón que no hace nada, y en una puerta eso se descubre tarde. */
  assert.match(src, /tipo: sentidoRef\.current === 'auto' \? undefined : sentidoRef\.current/,
    'el sentido elegido no se manda en la petición de reingreso');
});

test('«auto» se manda como ausencia de tipo, no como la palabra «auto»', () => {
  /* El servidor alterna cuando NO hay `tipo`. Mandar 'auto' sería un valor que
     no existe en la ruta y caería en el lado equivocado del ternario. */
  assert.ok(!/tipo: 'auto'/.test(src) && !/tipo: "auto"/.test(src),
    'se está mandando «auto» como si fuera un tipo de movimiento');
});

test('se explica por qué el automático puede marcar salida a la primera', () => {
  /* Sin esto parecía un fallo del lector: se escanea a alguien que acaba de
     entrar y la pantalla dice «salió». */
  assert.match(src, /el primer escaneo le marca/,
    'vuelve a no explicarse por qué el primer escaneo marca salida');
});
