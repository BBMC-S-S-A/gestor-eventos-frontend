/* La dirección de la API se decide en un solo sitio.
 *
 * ── El fallo ─────────────────────────────────────────────────────────────
 *
 * `VITE_API_URL` se leía en CINCO archivos, y cada uno tenía su propio plan B
 * cuando la variable no estaba:
 *
 *     src/api/client.js            → http://localhost:3000
 *     src/lib/authPropia.js        → http://localhost:3000
 *     src/pages/settings/…         → http://localhost:3000
 *     src/context/AuthContext.jsx  → el dominio de producción
 *     src/pages/ajustes/Conectar…  → ''  (cadena vacía)
 *
 * Cuatro respuestas distintas a la misma pregunta. No se notaba porque
 * `.env.production` está en el repo y el despliegue la pone siempre; un build
 * sin ella deja la aplicación partida —el login hablando con producción y todo
 * lo demás con una máquina que no existe— sin un error que lo diga, porque cada
 * archivo cree que hizo lo correcto.
 *
 * El quinto era el peor: con `''`, la pantalla que da la URL para conectar
 * Claude enseñaba «/mcp» a secas, sin host. Se copia igual y no conecta con
 * nada. Y es exactamente la pantalla de la que sale la dirección que alguien
 * pega en el conector.
 *
 * Correr: npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const raiz = process.cwd();
const FUENTE = path.join('src', 'lib', 'apiUrl.js');

const fuentes = (() => {
  const out = [];
  const anda = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) anda(p);
      else if (/\.jsx?$/.test(e.name)) out.push(p);
    }
  };
  anda(path.join(raiz, 'src'));
  return out;
})();

test('sólo `lib/apiUrl.js` lee la variable', () => {
  const otros = fuentes
    .filter(p => !p.endsWith(FUENTE))
    .filter(p => /import\.meta\.env\.VITE_API_URL/.test(fs.readFileSync(p, 'utf8')))
    .map(p => path.relative(raiz, p));

  assert.deepEqual(otros, [],
    'vuelven a leer VITE_API_URL por su cuenta, y cada uno traerá su propio plan B');
});

test('la dirección viene sin barra final', () => {
  /* Quien concatena `${API}/mcp` no puede acabar con `//mcp`: el conector lo
     acepta y el servidor contesta otra cosa. */
  const src = fs.readFileSync(path.join(raiz, FUENTE), 'utf8');
  assert.ok(src.includes(String.raw`replace(/\/+$/, '')`),
    'ya no se le quita la barra final a la dirección');
  assert.match(src, /export const URL_MCP = `\$\{API\}\/mcp`/,
    'la URL del MCP se arma fuera, y ya se escribió mal una vez');
});

test('el plan B es local, no producción', () => {
  /* Un build sin variable es casi siempre alguien en su máquina. Apuntar a
     producción por defecto significa que un descuido escribe en los datos de
     verdad, y eso no se deshace. */
  const src = fs.readFileSync(path.join(raiz, FUENTE), 'utf8');
  assert.match(src, /const LOCAL = 'http:\/\/localhost:3000'/);
  assert.ok(!/dpdns\.org/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')),
    'el plan B volvió a ser un dominio de producción');
});

test('la pantalla del conector no ofrece una dirección que no sirve', () => {
  const src = fs.readFileSync(
    path.join(raiz, 'src', 'pages', 'ajustes', 'ConectarClaude.jsx'), 'utf8');

  /* Sin la variable: se dice, y no se deja copiar. */
  assert.match(src, /!API_DECLARADA \?/,
    'sin VITE_API_URL vuelve a ofrecerse una URL incompleta');
  assert.match(src, /disabled=\{!API_DECLARADA\}/,
    'el botón de copiar sigue activo sobre una dirección que no sirve');

  /* Con localhost: también se dice. Parece una dirección buena, y el conector
     de Claude corre en otra máquina y no la alcanza nunca. */
  assert.ok(src.includes('localhost|127'),
    'no se avisa de que una dirección local no la puede alcanzar el conector');
});

test('nada apunta ya a Render ni a Vercel', () => {
  /* Los dos proveedores se retiraron. El host viejo contesta 503, así que
     cualquier resto es una dirección que no lleva a ninguna parte — y de ahí
     salió la URL que alguien tenía guardada en su conector. */
  const malos = [];
  for (const p of [...fuentes, path.join(raiz, 'index.html')]) {
    const src = fs.readFileSync(p, 'utf8');
    if (/onrender\.com|gestor-eventos-frontend\.vercel\.app/.test(src)) {
      malos.push(path.relative(raiz, p));
    }
  }
  assert.deepEqual(malos, [], 'vuelven a apuntar a un proveedor que ya no usamos');
});
