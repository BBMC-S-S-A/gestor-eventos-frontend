import client from './client.js';

/* Servicio de correos del evento (backend: routes/emails.js).
 *
 * ── Dónde vive una plantilla, que tuvo dos casas ──────────────────────────
 *
 * `evento_email_plantillas` (migración 0052). Antes vivían en
 * `page_json.emails`, y el editor del panel siguió escribiendo AHÍ mucho
 * después de que la tabla existiera. Eso dejaba una trampa: quien envía
 * (`lib/emailPlantillas.js`) lee **la tabla primero**, así que en cuanto
 * alguien escribiera una fila —por MCP, por ejemplo— el editor pasaba a ser
 * mentira: el organizador guardaba y el correo salía igual que antes, sin un
 * solo error. Medido antes de arreglarlo: la tabla tenía 0 filas, así que la
 * trampa no había saltado todavía.
 *
 * El GET devuelve la tabla y **hereda** lo que quedara en `page_json`, así que
 * nada de lo ya escrito se pierde al cambiar de casa. */
export const emailsApi = {
  /* Tipos, variables, plantillas y `almacenamiento_listo` (false si la 0052 no
     está aplicada: entonces el editor avisa en vez de fingir que guarda). */
  plantillas: (eventoId) =>
    client.get(`/eventos/${eventoId}/emails`).then(r => r.data),

  /* ¿Sale de verdad un correo?
   *
   * El diagnostico que viaja con las plantillas dice si las VARIABLES estan
   * puestas. Eso no es lo mismo que si el correo funciona: una contraseña
   * equivocada da `configurado: true` y los envios se descartan en silencio.
   * `?verificar=1` abre la conexion y hace login de verdad. Tarda un segundo,
   * asi que se pide al pulsar y no al entrar. */
  probarConexion: (eventoId) =>
    client.get(`/eventos/${eventoId}/emails/diagnostico`, { params: { verificar: 1 } }).then(r => r.data),
  guardarPlantilla: (eventoId, tipo, body) =>
    client.put(`/eventos/${eventoId}/emails/${tipo}`, body).then(r => r.data),
  borrarPlantilla: (eventoId, tipo) =>
    client.delete(`/eventos/${eventoId}/emails/${tipo}`).then(r => r.data),

  /* La previa la RENDERIZA EL SERVIDOR, con el mismo `renderEmail` que arma el
     correo que sale. El panel tenía su propia imitación en JSX —con su propia
     sustitución de variables y su propia copia de `esClaro`—, así que lo que el
     organizador aprobaba no era lo que se enviaba. */
  previsualizar: (eventoId, tipo, plantilla) =>
    client.post(`/eventos/${eventoId}/emails/previsualizar`, { tipo, plantilla }).then(r => r.data),

  prueba: (eventoId, tipo) =>
    client.post(`/eventos/${eventoId}/emails/prueba`, { tipo }).then(r => r.data),
  enviar: (eventoId, { tipo, audiencia }) =>
    client.post(`/eventos/${eventoId}/emails/enviar`, { tipo, audiencia }).then(r => r.data),

  /* La cola: cuántos esperan, cuántos no salieron, y el botón de volver a
     intentarlo. Lo que la cola marca como fallido —tres intentos, o un envío
     que se quedó a medias porque el proceso murió— no se reenvía solo a
     propósito: insistir con una dirección que rebota quema la reputación del
     dominio, y reenviar lo interrumpido duplicaría la boleta. */
  /* Quién recibió qué. La cola dice CUÁNTOS no salieron; esto dice A QUIÉN, que
     es la pregunta de verdad cuando alguien avisa de que no le llegó. */
  /* `params` lleva page, limit, q (por destinatario) y solo=fallidos. Se
     servían los últimos 100 y no se decía cuántos había: a este registro se
     viene con una pregunta concreta —«¿le llegó a ésta?»— y si la respuesta
     depende de si su correo cayó dentro de los últimos cien, la pantalla
     contesta que no cuando era que sí. */
  envios: (eventoId, params = { limit: 50 }) =>
    client.get(`/eventos/${eventoId}/emails/envios`, { params }).then(r => r.data),

  cola: (eventoId) =>
    client.get(`/eventos/${eventoId}/emails/cola`).then(r => r.data),
  reintentarCola: (eventoId) =>
    client.post(`/eventos/${eventoId}/emails/cola/reintentar`).then(r => r.data),
  /* Boletas que nunca recibieron su correo, y encolarlas todas. */
  sinBoleta: (eventoId) =>
    client.get(`/eventos/${eventoId}/emails/sin-boleta`).then(r => r.data),
  enviarSinBoleta: (eventoId) =>
    client.post(`/eventos/${eventoId}/emails/sin-boleta/enviar`).then(r => r.data),
};
