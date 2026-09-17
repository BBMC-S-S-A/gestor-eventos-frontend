import { API } from './apiUrl.js';/* Cliente de la identidad propia, con la MISMA forma que `supabase.auth`.
 *
 * ── Por qué imita la interfaz de Supabase ─────────────────────────────────
 *
 * De los 23 usos de `supabase.auth` que hay en el frontend, 11 están en
 * AuthContext y los otros 12 repartidos por pantallas y por api/client.js.
 * Reescribirlos todos habría sido un cambio grande, difícil de revisar y sobre
 * todo difícil de deshacer si algo sale mal a mitad.
 *
 * Con un objeto que responde a los mismos métodos, cambiar de una a otra es una
 * línea (`src/lib/sesion.js`) y volver atrás también. Durante la migración las
 * dos conviven, y el día que Supabase se apague se borra este comentario y poco
 * más.
 *
 * ── Dónde vive el token ───────────────────────────────────────────────────
 *
 * En localStorage, igual que lo dejaba Supabase. Lo suyo sería una cookie
 * httpOnly, que un XSS no puede leer, y es a donde hay que ir — pero hoy el
 * frontend está en Vercel y la API en otro dominio, y ahí las cookies de
 * terceros las bloquean los navegadores. Cuando los dos vivan bajo
 * gestekeventost.dpdns.org, la cookie pasa a ser posible y es el momento de
 * cambiarlo: sólo se toca este archivo.
 *
 * Mientras tanto, lo que sí se gana: el access token vive 30 minutos en vez de
 * una hora larga, y el refresh se puede revocar desde el servidor — con
 * Supabase, cerrar sesión en un dispositivo perdido no era posible.
 */

const BASE = API;
const LLAVE = 'gestek.sesion';

/* ── Guardado ─────────────────────────────────────────────────────────── */

function leerSesion() {
  try {
    const crudo = localStorage.getItem(LLAVE);
    return crudo ? JSON.parse(crudo) : null;
  } catch {
    /* localStorage puede fallar en modo privado o con las cookies bloqueadas.
       Sin sesión guardada la app pide login otra vez, que es molesto pero
       correcto; reventar aquí dejaría la pantalla en blanco. */
    return null;
  }
}

function guardarSesion(sesion) {
  try {
    if (sesion) localStorage.setItem(LLAVE, JSON.stringify(sesion));
    else localStorage.removeItem(LLAVE);
  } catch { /* ver arriba */ }
  avisar(sesion);
}

/* ── Suscriptores (onAuthStateChange) ─────────────────────────────────── */

const suscriptores = new Set();

function avisar(sesion) {
  const evento = sesion ? 'SIGNED_IN' : 'SIGNED_OUT';
  suscriptores.forEach(fn => {
    try { fn(evento, sesion); } catch (e) { console.warn('[auth] un suscriptor falló:', e); }
  });
}

/* ── Llamadas ─────────────────────────────────────────────────────────── */

async function pedir(ruta, { metodo = 'POST', cuerpo, token } = {}) {
  const cabeceras = { 'Content-Type': 'application/json' };
  if (token) cabeceras.Authorization = `Bearer ${token}`;

  let resp;
  try {
    resp = await fetch(`${BASE}/auth${ruta}`, {
      method : metodo,
      headers: cabeceras,
      body   : cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    /* Sin red o servidor caído. Se devuelve con la forma de error de siempre
       para que quien llama no tenga que distinguir. */
    return { data: null, error: { message: 'No se pudo conectar con el servidor.' } };
  }

  let datos = null;
  try { datos = await resp.json(); } catch { /* respuesta sin cuerpo */ }

  if (!resp.ok) {
    return { data: null, error: { message: datos?.error || 'Error inesperado.', codigo: datos?.codigo, status: resp.status } };
  }
  return { data: datos, error: null };
}

/* Convierte la respuesta del backend a la forma de sesión de Supabase, que es
   la que espera el resto de la app (`session.access_token`, `session.user`). */
function aSesion(datos) {
  if (!datos?.access_token) return null;
  return {
    access_token : datos.access_token,
    refresh_token: datos.refresh_token,
    user         : {
      id               : datos.usuario.id,
      email            : datos.usuario.email,
      user_metadata    : datos.usuario.metadata || {},
      email_confirmed_at: datos.usuario.emailConfirmado ? new Date().toISOString() : null,
    },
  };
}

/* ── Refresco ─────────────────────────────────────────────────────────── */

/* Una sola petición de refresco a la vez. Sin esto, cinco llamadas simultáneas
   con el token recién caducado lanzarían cinco refrescos, y como el servidor
   rota el refresh (el viejo muere al usarse), cuatro fallarían y cerrarían la
   sesión de un usuario que no hizo nada malo. */
let refrescoEnCurso = null;

async function refrescar() {
  const sesion = leerSesion();
  if (!sesion?.refresh_token) return null;

  if (!refrescoEnCurso) {
    refrescoEnCurso = pedir('/refresh', { cuerpo: { refresh_token: sesion.refresh_token } })
      .then(({ data, error }) => {
        if (error) { guardarSesion(null); return null; }
        const nueva = aSesion(data);
        guardarSesion(nueva);
        return nueva;
      })
      .finally(() => { refrescoEnCurso = null; });
  }
  return refrescoEnCurso;
}

/* Un JWT caducado se detecta leyendo su `exp` sin verificar la firma — de eso
   se encarga el servidor. Aquí sólo hace falta saber si conviene refrescar
   antes de mandar la petición, y así ahorrar el viaje que devolvería 401. */
function caducado(token, margenSegundos = 60) {
  try {
    const carga = JSON.parse(atob(token.split('.')[1]));
    return !carga.exp || carga.exp * 1000 - Date.now() < margenSegundos * 1000;
  } catch {
    return true;
  }
}

/* ── La superficie pública, con los nombres de supabase.auth ──────────── */

export const authPropia = {
  async getSession() {
    let sesion = leerSesion();
    if (sesion?.access_token && caducado(sesion.access_token)) {
      sesion = await refrescar();
    }
    return { data: { session: sesion }, error: null };
  },

  async signInWithPassword({ email, password }) {
    const { data, error } = await pedir('/login', { cuerpo: { email, password } });
    if (error) return { data: null, error };
    const sesion = aSesion(data);
    guardarSesion(sesion);
    return { data: { session: sesion, user: sesion.user }, error: null };
  },

  async signUp({ email, password, options }) {
    const { data, error } = await pedir('/registro', {
      cuerpo: { email, password, metadata: options?.data || {} },
    });
    if (error) return { data: null, error };
    /* Nunca hay sesión al registrarse: primero se confirma el correo. Es lo que
       AuthContext lee para decidir si enseña "revisá tu correo". */
    return { data: { session: null, user: null, ...data }, error: null };
  },

  /* `scope: 'global'` cierra la sesión en TODOS los dispositivos, no sólo en
     éste. Lo usa AjustesPage, y es lo que sirve cuando alguien pierde el móvil.
     Necesita el access token porque es una operación autenticada. */
  async signOut({ scope } = {}) {
    const sesion = leerSesion();

    if (scope === 'global' && sesion?.access_token) {
      await pedir('/sesiones/cerrar-todas', { token: sesion.access_token });
    } else if (sesion?.refresh_token) {
      await pedir('/logout', { cuerpo: { refresh_token: sesion.refresh_token } });
    }

    guardarSesion(null);
    return { error: null };
  },

  /* Devuelve la URL a la que hay que navegar; el que redirige es quien llama.
     Supabase navegaba solo, pero así la pantalla puede enseñar su estado de
     carga antes de irse. */
  async signInWithOAuth({ provider, options }) {
    if (provider !== 'google') {
      return { data: null, error: { message: `Proveedor no soportado: ${provider}` } };
    }
    const destino = options?.redirectTo || '/inicio';
    const ruta = destino.startsWith('http') ? new URL(destino).pathname : destino;

    const { data, error } = await pedir(`/google?destino=${encodeURIComponent(ruta)}`, { metodo: 'GET' });
    if (error) return { data: null, error };

    window.location.href = data.url;
    return { data: { url: data.url }, error: null };
  },

  async resetPasswordForEmail(email) {
    const { error } = await pedir('/recuperar', { cuerpo: { email } });
    return { data: {}, error };
  },

  /* Cubre los tres usos de updateUser que hay en la app: cambiar contraseña,
     cambiar metadatos, o las dos cosas. */
  async updateUser({ password, data: metadata, password_actual }) {
    const sesion = await this.getSession();
    const token = sesion.data.session?.access_token;
    if (!token) return { data: null, error: { message: 'No hay sesión activa.' } };

    if (password) {
      const { error } = await pedir('/password', {
        metodo: 'PATCH',
        token,
        cuerpo: { password_actual, password_nueva: password },
      });
      if (error) return { data: null, error };
    }

    if (metadata) {
      const { data, error } = await pedir('/perfil', { metodo: 'PATCH', token, cuerpo: { metadata } });
      if (error) return { data: null, error };

      /* La sesión guardada lleva una copia de los metadatos: si no se refresca
         aquí, la pantalla se queda enseñando el nombre viejo hasta recargar. */
      const actual = leerSesion();
      if (actual && data?.usuario) {
        actual.user = { ...actual.user, user_metadata: data.usuario.metadata || {} };
        guardarSesion(actual);
      }
      return { data: { user: actual?.user }, error: null };
    }

    return { data: { user: leerSesion()?.user }, error: null };
  },

  async resend({ email }) {
    const { error } = await pedir('/reenviar-confirmacion', { cuerpo: { email } });
    return { data: {}, error };
  },

  /* Confirmar el correo desde el enlace. No existe en supabase.auth con este
     nombre —allí se resolvía con el token en el fragmento— pero ConfirmarPage
     necesita algo a lo que llamar. */
  async confirmarEmail(token) {
    const { data, error } = await pedir('/confirmar', { cuerpo: { token } });
    return { data, error };
  },

  /* Poner contraseña nueva desde el enlace del correo.
   *
   * Supabase no tenía equivalente porque hacía otra cosa: el enlace abría una
   * sesión de recuperación y luego se llamaba a `updateUser`. Eso significaba
   * que abrir el correo te dejaba dentro de la cuenta antes de demostrar nada
   * más — si el enlace se quedaba en un historial compartido, quien lo abriera
   * entraba.
   *
   * Aquí el token sólo sirve para esto: no abre sesión. Al terminar hay que
   * entrar con la contraseña nueva, y el servidor además cierra todas las
   * sesiones que hubiera, que es lo que la persona cree que está haciendo
   * cuando cambia su contraseña. */
  async restablecerConToken(token, password) {
    const { data, error } = await pedir('/restablecer', { cuerpo: { token, password } });
    return { data, error };
  },

  /**
   * Recoge la sesión que el callback de Google deja en el fragmento (#) de la
   * URL. Equivale a `exchangeCodeForSession` de Supabase.
   *
   * Va en el fragmento y no en la query porque el fragmento no se manda al
   * servidor: no aparece en los logs de acceso ni en la cabecera Referer. Se
   * limpia de la barra de direcciones en cuanto se lee, para que no quede en el
   * historial ni al alcance de quien mire la pantalla.
   */
  async recogerSesionDeUrl() {
    if (typeof window === 'undefined' || !window.location.hash) return null;

    const frag = new URLSearchParams(window.location.hash.slice(1));
    const access = frag.get('access_token');
    const refresh = frag.get('refresh_token');
    if (!access || !refresh) return null;

    let user = null;
    try {
      const carga = JSON.parse(atob(access.split('.')[1]));
      user = { id: carga.sub, email: carga.email, user_metadata: {} };
    } catch {
      return null;
    }

    const sesion = { access_token: access, refresh_token: refresh, user };
    guardarSesion(sesion);

    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);

    /* El token sólo lleva id y correo. El perfil completo se pide aparte, para
       que la pantalla no arranque sin nombre ni foto. */
    const { data } = await pedir('/yo', { metodo: 'GET', token: access });
    if (data?.usuario) {
      sesion.user = {
        id: data.usuario.id,
        email: data.usuario.email,
        user_metadata: data.usuario.metadata || {},
        email_confirmed_at: data.usuario.emailConfirmado ? new Date().toISOString() : null,
      };
      guardarSesion(sesion);
    }
    return sesion;
  },

  onAuthStateChange(callback) {
    suscriptores.add(callback);
    return {
      data: { subscription: { unsubscribe: () => suscriptores.delete(callback) } },
    };
  },

  /* Para api/client.js: el token ya refrescado si hacía falta. */
  async tokenValido() {
    const { data } = await this.getSession();
    return data.session?.access_token || null;
  },
};

export default authPropia;
