/* El informe de la puerta cuenta lo que pasó, no lo que es fácil de contar.
 *
 * ── Qué se está protegiendo ──────────────────────────────────────────────
 *
 * Tres reglas que son fáciles de romper sin que nada falle — el informe
 * seguiría pintándose, sólo que mintiendo:
 *
 *   1. Quien vuelve otro día cuenta en LOS DOS días. La boleta guarda dos
 *      horas (`primer_ingreso_at` y `checked_in_at`) y la tentación es contar
 *      sólo la segunda: entonces la persona se muda entera al día en que
 *      volvió y el primer día pierde gente que sí estuvo allí.
 *
 *   2. El porcentaje de «se registró en la puerta» va sobre los PRIMEROS
 *      ingresos del día, no sobre el total. Un reingreso no se inscribe en la
 *      fila —ya tenía boleta de ayer—, así que meterlo en el divisor hace que
 *      un día con muchos repetidores salga artificialmente bien, justo cuando
 *      más congestión hubo.
 *
 *   3. Sin `primer_ingreso_at` —un backend que todavía no lo manda en la
 *      lista— el informe dice CERO reingresos y no se inventa ninguno.
 *
 * Los datos del ejemplo son la forma real de FESTECH IBAGUÉ: entrada fuerte a
 * primera hora, gente que se inscribe en la puerta y un tercer día con
 * repetidores del segundo.
 *
 * Correr: node --test tests/ */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizarBoletas, resumenPorDia, MIN_EN_PUERTA_MS }
  from '../src/lib/ingresosPorHora.js';

/* Una boleta, escrita como la sirve el servidor. `minAntes` es cuánto antes de
   entrar se registró: es lo único que decide si contó como «en la puerta». */
const boleta = (ingreso, minAntes, primerIngreso = null) => ({
  created_at       : new Date(new Date(ingreso) - minAntes * 60000).toISOString(),
  checked_in_at    : new Date(ingreso).toISOString(),
  primer_ingreso_at: primerIngreso ? new Date(primerIngreso).toISOString() : null,
});

test('quien no llegó a entrar no aparece en el informe', () => {
  const filas = normalizarBoletas([
    { created_at: '2026-09-17T13:00:00Z', checked_in_at: null },
    { created_at: '2026-09-17T13:00:00Z' },
    boleta('2026-09-17T14:00:00Z', 120),
  ]);
  assert.equal(filas.length, 1);
});

test('una fecha corrupta no tumba el informe entero', () => {
  const filas = normalizarBoletas([
    { created_at: '2026-09-17T13:00:00Z', checked_in_at: 'ayer por la tarde' },
    boleta('2026-09-17T14:00:00Z', 120),
  ]);
  assert.equal(filas.length, 1);
});

test('registrarse en la puerta es registrarse justo antes de entrar', () => {
  const [enPuerta] = normalizarBoletas([boleta('2026-09-17T14:00:00Z', 3)]);
  const [previo]   = normalizarBoletas([boleta('2026-09-17T14:00:00Z', 60)]);
  assert.equal(enPuerta.enPuerta, true);
  assert.equal(previo.enPuerta, false);

  /* Justo en el filo: quince minutos clavados YA no es la puerta. */
  const justo = normalizarBoletas([boleta('2026-09-17T14:00:00Z', MIN_EN_PUERTA_MS / 60000)]);
  assert.equal(justo[0].enPuerta, false);
});

test('quien vuelve otro día cuenta en los dos días, no sólo en el último', () => {
  const dias = resumenPorDia(normalizarBoletas([
    /* Dos personas que sólo vinieron el jueves. */
    boleta('2026-09-17T14:00:00Z', 120),
    boleta('2026-09-17T14:30:00Z', 120),
    /* Una que vino el jueves y volvió el sábado. */
    boleta('2026-09-19T14:00:00Z', 120, '2026-09-17T15:00:00Z'),
  ]), 60);

  assert.equal(dias.length, 2);

  const [jueves, sabado] = dias;
  /* El jueves fueron TRES, aunque una de ellas tenga su última hora el sábado. */
  assert.equal(jueves.ingresos, 3);
  assert.equal(jueves.reingresos, 0);
  assert.equal(jueves.primeros, 3);

  /* El sábado fue UNA, y fue un reingreso: no es gente nueva. */
  assert.equal(sabado.ingresos, 1);
  assert.equal(sabado.reingresos, 1);
  assert.equal(sabado.primeros, 0);
});

test('el % de «en la puerta» no se diluye con los reingresos', () => {
  const dias = resumenPorDia(normalizarBoletas([
    /* Cuatro primeras visitas: dos se inscribieron en la fila. */
    boleta('2026-09-19T14:00:00Z', 2),
    boleta('2026-09-19T14:05:00Z', 2),
    boleta('2026-09-19T14:10:00Z', 600),
    boleta('2026-09-19T14:15:00Z', 600),
    /* Y cuatro que ya habían venido: no se inscribieron hoy. */
    ...Array.from({ length: 4 }, (_, i) =>
      boleta(`2026-09-19T15:0${i}:00Z`, 600, '2026-09-18T14:00:00Z')),
  ]), 60);

  /* Son DOS días: los reingresos dejan también su primera visita en el 18.
     El que se está mirando es el 19. */
  assert.equal(dias.length, 2);
  const dia = dias[1];

  assert.equal(dia.ingresos, 8);
  assert.equal(dia.reingresos, 4);
  assert.equal(dia.enPuerta, 2);
  /* Dos de cuatro PRIMERAS visitas = 50%. Sobre las ocho entradas del día
     saldría 25%, que es la cifra que haría pensar que no hubo problema. */
  assert.equal(dia.pctEnPuerta, 50);
});

test('sin primer_ingreso_at el informe no inventa reingresos', () => {
  const dias = resumenPorDia(normalizarBoletas([
    { created_at: '2026-09-17T12:00:00Z', checked_in_at: '2026-09-17T14:00:00Z' },
    { created_at: '2026-09-19T12:00:00Z', checked_in_at: '2026-09-19T14:00:00Z' },
  ]), 60);
  assert.equal(dias.reduce((a, d) => a + d.reingresos, 0), 0);
  assert.equal(dias.reduce((a, d) => a + d.ingresos, 0), 2);
});

test('el pico es la franja más cargada, con su hora y su ritmo', () => {
  /* Once personas en la franja de las 14:00 y dos en la de las 15:00. */
  const filas = normalizarBoletas([
    ...Array.from({ length: 11 }, (_, i) => boleta(`2026-09-17T14:${String(i).padStart(2, '0')}:00Z`, 120)),
    boleta('2026-09-17T15:00:00Z', 120),
    boleta('2026-09-17T15:30:00Z', 120),
  ]);
  const [dia] = resumenPorDia(filas, 60);

  assert.equal(dia.ingresos, 13);
  assert.equal(dia.pico.n, 11);
  /* Once en una franja de sesenta minutos = 0,2 por minuto. */
  assert.equal(dia.porMin, 0.2);
  /* La curva va en orden y empieza donde entró el primero. */
  assert.deepEqual(dia.curva.map(p => p.n), [11, 2]);
  assert.ok(dia.primera <= dia.ultima);
});

test('los días salen en orden, no en el que llegaron las boletas', () => {
  const dias = resumenPorDia(normalizarBoletas([
    boleta('2026-09-19T14:00:00Z', 120),
    boleta('2026-09-17T14:00:00Z', 120),
    boleta('2026-09-18T14:00:00Z', 120),
  ]), 60);
  const fechas = dias.map(d => d.fecha.getTime());
  assert.deepEqual(fechas, [...fechas].sort((a, b) => a - b));
});

test('sin boletas no hay informe, y no revienta', () => {
  assert.deepEqual(resumenPorDia([], 60), []);
  assert.deepEqual(resumenPorDia(null, 60), []);
  assert.deepEqual(normalizarBoletas(), []);
});
