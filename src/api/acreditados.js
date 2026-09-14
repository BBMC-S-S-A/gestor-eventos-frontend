import client from './client.js';

/* Quién entra con cada boleta, y quién responde por él.
 *
 * Nace del montaje —la cuadrilla que arma los stands dos días antes— pero la
 * forma es la de la 0118: una persona dentro de una boleta, con documento y QR
 * propio. Sirve igual para la mesa de cuatro. Backend: `routes/acreditados.js`,
 * migración 0127. */
export const acreditadosApi = {
  /* Panel. `pendientes` es la pregunta del día antes del montaje: a quién
     falta autorizar. */
  list      : (eventoId, params = {})      => client.get(`/eventos/${eventoId}/acreditados`, { params }).then(r => r.data),
  editar    : (eventoId, puestoId, body)   => client.patch(`/eventos/${eventoId}/acreditados/${puestoId}`, body).then(r => r.data),
  /* Autorizar es responder por esta persona, y es el momento en que se firma
     su credencial: antes de esto no hay QR que enseñar. */
  autorizar : (eventoId, puestoId)         => client.post(`/eventos/${eventoId}/acreditados/${puestoId}/autorizar`).then(r => r.data),
  revocar   : (eventoId, puestoId, motivo) => client.post(`/eventos/${eventoId}/acreditados/${puestoId}/revocar`, { motivo }).then(r => r.data),

  /* Enlace público: quien tiene el código de la boleta pone los nombres. Sin
     sesión a propósito — la cuadrilla de un stand no tiene cuenta. */
  mios      : (codigo)                     => client.get(`/acreditar/${codigo}`).then(r => r.data),
  poner     : (codigo, puestoId, body)     => client.patch(`/acreditar/${codigo}/puestos/${puestoId}`, body).then(r => r.data),
};
