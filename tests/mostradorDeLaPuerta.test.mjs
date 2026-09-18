/* El mostrador de acreditación, medido contra lo que pasó en FESTECH.
 *
 * Día 1: tres mil boletas, dos estaciones imprimiendo y una fila esperando. De
 * ahí salieron estas reglas, y cada una arregla algo que se vio:
 *
 *  · la lista no se puede recorrer entera cada vez que alguien quiere una
 *    escarapela, y quien acaba de registrarse tiene que aparecer solo;
 *  · «nada seleccionado» no puede significar «los tres mil»;
 *  · hay que poder separar a quien ya tiene su escarapela de quien no, y eso
 *    se guarda en la boleta y no en el navegador de cada mostrador.
 *
 * Correr: node --test tests/mostradorDeLaPuerta.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(join(RAIZ, p), 'utf8');
const PANTALLA = leer('src/pages/events/workspace/asistentes/EtiquetadoraSection.jsx');

test('la lista se refresca sola, y cada minuto', () => {
  /* Cada quince segundos eran cuatro veces más peticiones desde cada estación
     abierta todo el día, y en la puerta no se nota la diferencia. */
  assert.match(PANTALLA, /useSondeo\(mirarNuevos, 60000\)/,
    'el refresco automático cambió de ritmo o dejó de pararse con la pestaña oculta: debe ser useSondeo a un minuto');
  assert.match(PANTALLA, /stats: 0/,
    'el refresco pide también el resumen, que recorre todas las boletas del evento');
});

test('lo que se imprime es lo seleccionado, no «todo si no elegiste»', () => {
  assert.match(PANTALLA, /const aImprimir = sel\.size/,
    'volvió el «nada seleccionado = todos»: para una escarapela habría que seleccionar tres mil y quitar');
  assert.match(PANTALLA, /'Elige a quién imprimir'/,
    'sin nadie elegido el botón no dice qué falta');
  assert.match(PANTALLA, /checked=\{sel\.has\(f\.id\)\}/,
    'las casillas vuelven a salir marcadas sin que nadie haya elegido');
});

test('se puede separar quién ya tiene su escarapela y de cuándo es el registro', () => {
  for (const [k, que] of [['faltan', 'los que faltan'], ['impresas', 'las ya impresas'], ['todas', 'todas']]) {
    assert.ok(PANTALLA.includes(`'${k}'`), `falta el grupo «${que}»`);
  }
  assert.match(PANTALLA, /Registrados hoy/, 'no se puede ver quién se registró hoy');
  assert.match(PANTALLA, /Este mes/, 'no se puede ver quién se registró este mes');
  /* El corte del día va en la hora del evento: en la puerta, «hoy» no puede
     depender de la zona horaria del portátil de quien imprime. */
  assert.match(PANTALLA, /timeZone: zona/, 'el corte de «hoy» usa la hora del equipo, no la del evento');
});

test('lo impreso se anota en la boleta, después de imprimir', () => {
  assert.match(PANTALLA, /clientesApi\.marcarImpresas\(evento\.id, ids\)/,
    'no se anota qué se imprimió: con dos estaciones, cada una tendría su propia respuesta');
  /* Primero sale el papel y después se anota. Al revés, una impresión fallida
     dejaría a alguien fuera de «faltan» sin nada en la mano. */
  const i = PANTALLA.indexOf('const imprimirEnPapel');
  const cuerpo = PANTALLA.slice(i, i + 300);
  assert.ok(cuerpo.indexOf('window.print()') < cuerpo.indexOf('anotarImpresas'),
    'se anota como impresa antes de mandarla a la impresora');
});
