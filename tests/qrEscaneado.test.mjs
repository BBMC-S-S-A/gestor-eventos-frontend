/* El QR "simplificado" —código corto suelto, sin firma— no abría la puerta.
 *
 * `leerQr` sólo sabía distinguir el token firmado de la URL vieja
 * `/mi-ticket/CODIGO`. Un código corto suelto —lo que imprime una manilla o
 * una etiqueta pequeña, `qr_contenido: 'codigo'` en `lib/piezasBranding.js`—
 * tampoco lleva barras, así que caía en el mismo saco que el token: se
 * mandaba como `qr_token` y el servidor lo rechazaba por no ser un JWT
 * válido. El check-in fallaba con un código perfectamente bueno.
 *
 * Correr: node --test tests/qrEscaneado.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerQr } from '../src/lib/qrEscaneado.js';

test('un código corto suelto se manda como codigo, no como qr_token', () => {
  assert.deepEqual(leerQr('ABCDEFGH'), { codigo: 'ABCDEFGH' });
  /* En minúscula también: la cámara no normaliza. */
  assert.deepEqual(leerQr('abcdefgh'), { codigo: 'ABCDEFGH' });
});

test('la URL vieja /mi-ticket/CODIGO se sigue leyendo igual', () => {
  assert.deepEqual(leerQr('https://app.gestek.co/mi-ticket/abcd1234'), { codigo: 'ABCD1234' });
});

test('un token firmado (JWT) se sigue mandando como qr_token', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOiIxIn0.abc123firma';
  assert.deepEqual(leerQr(jwt), { qr_token: jwt });
});

test('algo que no es ni URL ni un código de 8 caracteres cae a qr_token', () => {
  /* Nueve caracteres no es un código corto válido: mejor dejarlo caer al
     camino de siempre que adivinar un cuarto formato. */
  assert.deepEqual(leerQr('ABCDEFGHJ'), { qr_token: 'ABCDEFGHJ' });
});
