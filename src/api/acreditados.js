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

  /* Quién no ha salido. A las ocho de la noche, con el galpón lleno de
     herramienta, es la pregunta útil — más que a quién se dejó entrar. */
  dentro    : (eventoId)                   => client.get(`/eventos/${eventoId}/acreditados/dentro`).then(r => r.data),
  /* Y cerrarla, porque la gente no escanea al salir: entrar abre una puerta y
     salir no tiene premio. Sin esto la lista miente, y una lista que miente se
     deja de mirar. */
  cerrarJornada: (eventoId, nota)          => client.post(`/eventos/${eventoId}/acreditados/cerrar-jornada`, { nota }).then(r => r.data),

  /* Enlace público: quien tiene el código de la boleta pone los nombres. Sin
     sesión a propósito — la cuadrilla de un stand no tiene cuenta. */
  mios      : (codigo)                     => client.get(`/acreditar/${codigo}`).then(r => r.data),
  poner     : (codigo, puestoId, body)     => client.patch(`/acreditar/${codigo}/puestos/${puestoId}`, body).then(r => r.data),
  /* «El que iba se enfermó, va el primo». Cambia de persona, no corrige un
     nombre: la credencial del anterior deja de abrir en el acto. */
  sustituir : (codigo, puestoId, body)     => client.post(`/acreditar/${codigo}/puestos/${puestoId}/sustituir`, body).then(r => r.data),

  /* La foto de quien viene al montaje.
   *
   * El cuerpo ES el archivo y el nombre va en la query: así lo espera
   * `/archivos` y así no hace falta `multipart`. Lo que se guarda en el puesto
   * es la RUTA y no una URL: la carpeta es privada —es la cara de un
   * trabajador junto a su documento— y el servidor firma un enlace de quince
   * minutos cada vez que alguien con derecho la pide.
   *
   * Timeout aparte: una foto de móvil por la red del recinto no cabe en los
   * quince segundos que valen para un JSON. */
  subirFoto : (file) => client.put('/archivos/acreditacion', file, {
    params : { nombre: file.name },
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    timeout: 120000,
  }).then(r => r.data),
};
