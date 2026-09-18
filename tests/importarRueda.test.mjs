import test from 'node:test';
import assert from 'node:assert/strict';
import { emparejar, prepararFilas, leerRol } from '../src/lib/importarRueda.js';

test('los encabezados de la cámara se reconocen y el contacto no se confunde con la empresa', () => {
  const m = emparejar(['Razón social', 'NIT', 'Sector', 'Rol', 'Nombre contacto', 'Correo electrónico']);
  assert.equal(m.nombre, 'Razón social');
  assert.equal(m.contacto_nombre, 'Nombre contacto');
  assert.equal(m.contacto_email, 'Correo electrónico');
});

test('cada fila que no entra dice por qué', () => {
  const m = emparejar(['Empresa', 'NIT', 'Rol', 'Correo']);
  const r = prepararFilas([
    { __fila: 2, Empresa: 'Acme', NIT: '900-1', Rol: 'Comprador', Correo: 'a@acme.co' },
    { __fila: 3, Empresa: '', NIT: '', Rol: 'vendedor', Correo: '' },
    { __fila: 4, Empresa: 'Beta', NIT: '', Rol: 'socio', Correo: '' },
    { __fila: 5, Empresa: 'Gamma', NIT: '900-1', Rol: 'vendedor', Correo: '' },
    { __fila: 6, Empresa: 'Delta', NIT: '', Rol: 'V', Correo: 'mal' },
    { __fila: 7, Empresa: 'Ya', NIT: '', Rol: 'V', Correo: '' },
  ], m, { existentes: [{ nombre: 'ya' }] });
  assert.deepEqual(r[0].cuerpo, { nombre: 'Acme', rol: 'comprador', tipo_persona: 'empresa', nit: '900-1', contacto_email: 'a@acme.co' });
  assert.match(r[1].motivo, /Sin nombre/);
  assert.match(r[2].motivo, /socio/);
  assert.match(r[3].motivo, /Ya está/);
  assert.match(r[4].motivo, /Correo/);
  assert.match(r[5].motivo, /Ya está/);
});

test('sin columna de rol se usa el que elige quien importa, y sin él no se adivina', () => {
  const m = emparejar(['Empresa']);
  assert.match(prepararFilas([{ __fila: 2, Empresa: 'X' }], m)[0].motivo, /Sin rol/);
  assert.equal(prepararFilas([{ __fila: 2, Empresa: 'X' }], m, { rolPorDefecto: 'vendedor' })[0].cuerpo.rol, 'vendedor');
  assert.equal(leerRol('Compradora'), 'comprador');
});
