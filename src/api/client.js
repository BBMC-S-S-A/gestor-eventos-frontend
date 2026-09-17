import axios from 'axios';
import { auth } from '../lib/sesion.js';
import { API } from '../lib/apiUrl.js';

/* Una sola respuesta a «¿dónde está la API?». Ver `lib/apiUrl.js`: esto se
   leía en cinco archivos con cuatro planes B distintos. */
const BASE_URL = API;

const client = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

/* Adjunta el JWT de Supabase Auth en cada request. Se anota en la config
   si de verdad se mandó token, porque de eso depende cómo interpretar un
   401 más abajo. */
client.interceptors.request.use(async (config) => {
  /* getSession() refresca solo si el token está por caducar, así que aquí no
     hay que preocuparse de eso: siempre devuelve uno utilizable o ninguno. */
  const { data } = await auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    config.__conSesion = true;
  }
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Error desconocido';
    const status = err.response?.status;

    /* Un 401 solo significa "tu sesión murió" si la petición LLEVABA sesión.
       Sin token es simplemente una ruta que exige cuenta, y quien la llamó
       sabrá qué hacer — típicamente ofrecer registrarse. Antes se echaba a
       /login a cualquiera, incluido un visitante anónimo mirando una página
       pública, que es justo lo contrario de lo que uno quiere ahí. */
    if (status === 401 && err.config?.__conSesion) {
      auth.signOut().finally(() => {
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      });
    }

    /* Se conserva el status en el error. Envolverlo en un Error pelado
       obligaba a adivinar la causa a partir del texto del mensaje. */
    const error = new Error(msg);
    error.status = status;
    error.response = err.response;
    return Promise.reject(error);
  }
);

export default client;
