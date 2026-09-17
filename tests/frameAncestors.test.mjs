/* Tres archivos dicen la misma política de embebido, para tres formas de
 * desplegar (Vercel via `vercel.json`, Netlify/Cloudflare via
 * `public/_headers`, cPanel/Apache via `public/.htaccess`). Nadie los genera
 * desde un solo sitio, así que nada impide que se separen.
 *
 * Y se separaron: `public/.htaccess` sólo traía la excepción de
 * `frame-ancestors *` para `/embed/*`. `/explorar/*` —la página pública
 * completa, que es la que de verdad se incrusta en la web del organizador—
 * se quedó con `frame-ancestors 'self'` del bloque general, y quien sirviera
 * desde cPanel en vez de Vercel veía el iframe en blanco con la consola
 * gritando «Framing … violates … frame-ancestors 'self'». Las otras dos
 * configuraciones ya la tenían bien: por eso no se veía en local con
 * `vite preview` ni en el despliegue de Vercel, sólo en producción cPanel.
 *
 * Esta prueba no puede evaluar Apache ni el `<If>` de mod_headers —eso hace
 * falta comprobarlo contra un servidor de verdad—, pero sí puede comprobar
 * que las tres rutas que se declaran embebibles en un archivo se declaran
 * embebibles en los otros dos. Eso es lo que se rompió, y es justo lo que
 * hace falta para que no se rompa otra vez en silencio.
 *
 * Correr: node --test tests/frameAncestors.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(join(RAIZ, p), 'utf8');

/* Qué rutas dice cada archivo que se pueden incrustar en cualquier web
   (`frame-ancestors *`), sacado con una lectura de lo más simple posible:
   no hace falta un parser de Apache ni de JSON para esto. */
function rutasEmbebiblesDeHtaccess(src) {
  const rutas = [];
  const bloque = /<If\s+"%\{REQUEST_URI\}\s*=~\s*m#\^\/([a-z|()]+)\/#">([\s\S]*?)<\/If>/gi;
  let m;
  while ((m = bloque.exec(src))) {
    if (!/frame-ancestors \*/.test(m[2])) continue;
    for (const seg of m[1].replace(/[()]/g, '').split('|')) rutas.push(seg);
  }
  return rutas.sort();
}

function rutasEmbebiblesDeHeadersPlano(src) {
  /* public/_headers: bloques "/ruta/*\n  Content-Security-Policy: ...". */
  const rutas = [];
  const bloques = src.split(/\n(?=\/)/);
  for (const b of bloques) {
    const cab = b.match(/^\/([a-z]+)\/\*/);
    if (cab && /frame-ancestors \*/.test(b)) rutas.push(cab[1]);
  }
  return rutas.sort();
}

function rutasEmbebiblesDeVercelJson(src) {
  const cfg = JSON.parse(src);
  const rutas = [];
  for (const regla of cfg.headers || []) {
    const cab = regla.source.match(/^\/([a-z]+)\//);
    if (!cab) continue;
    const csp = (regla.headers || []).find(h => h.key === 'Content-Security-Policy');
    if (csp && /frame-ancestors \*/.test(csp.value)) rutas.push(cab[1]);
  }
  return rutas.sort();
}

test('.htaccess, _headers y vercel.json declaran embebibles las mismas rutas', () => {
  const deHtaccess = rutasEmbebiblesDeHtaccess(leer('public/.htaccess'));
  const deHeaders  = rutasEmbebiblesDeHeadersPlano(leer('public/_headers'));
  const deVercel   = rutasEmbebiblesDeVercelJson(leer('vercel.json'));

  assert.ok(deHtaccess.length > 0, 'public/.htaccess no declara ninguna ruta embebible');
  assert.deepEqual(deHtaccess, deHeaders,
    `.htaccess (${deHtaccess.join(', ')}) y _headers (${deHeaders.join(', ')}) no coinciden`);
  assert.deepEqual(deHtaccess, deVercel,
    `.htaccess (${deHtaccess.join(', ')}) y vercel.json (${deVercel.join(', ')}) no coinciden`);
});

test('/explorar (la página pública, la que se incrusta de verdad) está entre las embebibles', () => {
  /* El caso concreto que falló: la página pública completa, no sólo /embed. */
  assert.ok(rutasEmbebiblesDeHtaccess(leer('public/.htaccess')).includes('explorar'),
    '/explorar/* no tiene frame-ancestors * en public/.htaccess');
});
