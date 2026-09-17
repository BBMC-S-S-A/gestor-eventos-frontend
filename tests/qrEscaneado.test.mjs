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

test('un código viejo con 0, 1, O o I también se manda como codigo', () => {
  assert.deepEqual(leerQr('AB10OI99'), { codigo: 'AB10OI99' });
});

test('lo que lleva puntos o espacios cae a qr_token', () => {
  assert.deepEqual(leerQr('abc.def.ghi'), { qr_token: 'abc.def.ghi' });
  assert.deepEqual(leerQr('hola mundo'), { qr_token: 'hola mundo' });
});
