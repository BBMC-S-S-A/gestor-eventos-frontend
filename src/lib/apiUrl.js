/* De dónde sale la dirección de la API, en un solo sitio.
 *
 * ── El fallo que esto evita ──────────────────────────────────────────────
 *
 * `VITE_API_URL` se leía en CINCO archivos, y cada uno tenía su propio plan B
 * cuando la variable no estaba:
 *
 *     src/api/client.js            → http://localhost:3000
 *     src/lib/authPropia.js        → http://localhost:3000
 *     src/pages/settings/…         → http://localhost:3000
 *     src/context/AuthContext.jsx  → https://api.gestekeventost.dpdns.org
 *     src/pages/ajustes/Conectar…  → ''  (cadena vacía)
 *
 * Cuatro respuestas distintas a la misma pregunta. Hoy no se nota porque
 * `.env.production` está en el repo y el despliegue la pone siempre; el día que
 * un build no la tenga —un fork, un `npm run build` a mano, un CI que no copie
 * el archivo— la aplicación sale partida: el login hablando con producción y
 * todo lo demás con un servidor que no existe en esa máquina. Sin un error que
 * lo diga, porque cada archivo cree que hizo lo correcto.
 *
 * Y el quinto es el peor de los cinco: con `''`, la pantalla que te da la URL
 * para conectar Claude enseñaba «/mcp» a secas, sin host. Se copia, se pega en
 * el conector, y no conecta con nada.
 *
 * ── Por qué el plan B es localhost y no producción ───────────────────────
 *
 * Porque un build sin variable es casi siempre alguien trabajando en su
 * máquina. Apuntar a producción por defecto significa que un descuido escribe
 * en los datos de verdad — y eso no se deshace. Que no funcione en local se
 * arregla en un minuto; lo otro, no.
 */

const LOCAL = 'http://localhost:3000';

const limpiar = (u) => String(u || '').trim().replace(/\/+$/, '');

/* La dirección de la API. Siempre sin barra final, para que quien concatene
   `${API}/mcp` no acabe con `//mcp`. */
export const API = limpiar(import.meta.env.VITE_API_URL) || LOCAL;

/* ¿Se declaró de verdad, o estamos en el plan B?
 *
 * Lo necesita la pantalla de conectar Claude: una URL de localhost es correcta
 * mientras desarrollas y no sirve para nada dentro de un conector, así que ahí
 * hay que decirlo en vez de ofrecerla como si valiera. */
export const API_DECLARADA = Boolean(limpiar(import.meta.env.VITE_API_URL));

/* La URL del servidor MCP, que es la que se pega en el conector. Se arma aquí
   —y no en la pantalla— porque es la misma cuenta y ya se escribió mal una
   vez. */
export const URL_MCP = `${API}/mcp`;
