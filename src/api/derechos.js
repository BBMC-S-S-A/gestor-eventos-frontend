import client from './client.js';

/* Lo que incluye la credencial: el almuerzo, la camiseta, el parqueadero.
 *
 * Detrás hay una sola forma —«N usos de algo, en una ventana, con constancia de
 * quién lo entregó»— y no una tabla por beneficio. Backend: `routes/derechos.js`,
 * migración 0126, diseño en `docs/DERECHOS.md` del repo del servidor. */
export const derechosApi = {
  /* El catálogo con sus franjas dentro. Lo pide quien configura y también quien
     entrega, que necesita elegir «Almuerzo · día 1» antes de escanear. */
  list        : (eventoId)                  => client.get(`/eventos/${eventoId}/derechos`).then(r => r.data),
  crear       : (eventoId, body)            => client.post(`/eventos/${eventoId}/derechos`, body).then(r => r.data),
  editar      : (eventoId, id, body)        => client.patch(`/eventos/${eventoId}/derechos/${id}`, body).then(r => r.data),
  eliminar    : (eventoId, id)              => client.delete(`/eventos/${eventoId}/derechos/${id}`).then(r => r.data),

  crearVentana: (eventoId, derechoId, body) => client.post(`/eventos/${eventoId}/derechos/${derechoId}/ventanas`, body).then(r => r.data),
  editarVentana:(eventoId, ventanaId, body) => client.patch(`/eventos/${eventoId}/ventanas/${ventanaId}`, body).then(r => r.data),
  borrarVentana:(eventoId, ventanaId)       => client.delete(`/eventos/${eventoId}/ventanas/${ventanaId}`).then(r => r.data),

  /* Entregar. `at` viaja cuando el escaneo salió de la cola sin conexión: sin
     él, todo lo que se repartió sin señal aparecería a la hora en que volvió
     el wifi. */
  entregar    : (eventoId, body)            => client.post(`/eventos/${eventoId}/consumo`, body).then(r => r.data),
  /* Deshacer una entrega: se escaneó a quien no era, y sin esto esa persona se
     queda sin almorzar con el sistema diciendo que ya comió. */
  deshacer    : (eventoId, consumoId, body = {}) => client.delete(`/eventos/${eventoId}/consumos/${consumoId}`, { data: body }).then(r => r.data),

  consumos    : (eventoId, derechoId, params = {}) => client.get(`/eventos/${eventoId}/derechos/${derechoId}/consumos`, { params }).then(r => r.data),
  recuento    : (eventoId, derechoId, params = {}) => client.get(`/eventos/${eventoId}/derechos/${derechoId}/recuento`, { params }).then(r => r.data),
  pendientes  : (eventoId, derechoId, params = {}) => client.get(`/eventos/${eventoId}/derechos/${derechoId}/pendientes`, { params }).then(r => r.data),
};
