import client from './client.js';

export const networkingApi = {
  /* Vista del asistente */
  expositores : (eventoId) => client.get(`/eventos/${eventoId}/networking/expositores`).then(r => r.data),
  misCitas    : (eventoId) => client.get(`/eventos/${eventoId}/networking/mis-citas`).then(r => r.data),
  reservar    : (eventoId, horarioId) => client.post(`/eventos/${eventoId}/networking/horarios/${horarioId}/reservar`).then(r => r.data),
  /* Lo que anotó quien fue a la cita. Suyo: el servidor sólo deja escribir
     sobre la propia. */
  guardarNotas: (eventoId, citaId, notas) =>
    client.patch(`/eventos/${eventoId}/networking/citas/${citaId}/notas`, { notas }).then(r => r.data),
  /* El cierre de la reunion: si ocurrio y que negocio se espera. Va por la
     misma ruta que las notas —es la misma cita y el mismo dueño— y solo se
     mandan las claves que cambian, para que cerrar no borre la nota. */
  cerrarCita  : (eventoId, citaId, cambios) =>
    client.patch(`/eventos/${eventoId}/networking/citas/${citaId}/notas`, cambios).then(r => r.data),
  cancelar    : (eventoId, citaId) => client.delete(`/eventos/${eventoId}/networking/citas/${citaId}`).then(r => r.data),

  /* Que salio de la rueda: el informe que la camara le enseña a su junta. */
  informe     : (eventoId) => client.get(`/eventos/${eventoId}/networking/informe`).then(r => r.data),

  /* Vista del organizador
     `soloConMesa`: sólo los expositores con rol 'comprador' (los que de
     verdad tienen mesa/stand). Úsalo donde se enseña o edita el STAND —el
     mapa, la lista de stands—, no donde hace falta la rueda completa (el
     formulario de sub-eventos, por ejemplo, sigue viendo a todos). */
  expositoresAdmin: (eventoId, soloConMesa = false) =>
    client.get(`/eventos/${eventoId}/expositores`, { params: soloConMesa ? { rol: 'comprador' } : {} }).then(r => r.data),
  crearStand      : (eventoId, body) => client.post(`/eventos/${eventoId}/expositores`, body).then(r => r.data),
  editarStand     : (eventoId, id, body) => client.patch(`/eventos/${eventoId}/expositores/${id}`, body).then(r => r.data),
  borrarStand     : (eventoId, id) => client.delete(`/eventos/${eventoId}/expositores/${id}`).then(r => r.data),
  /* La bolsa de puntos y su reparto. Existian en el backend desde la 0057
     —con trigger que aplica el tope— y no los llamaba nadie: la tarjeta de
     cada stand ensenaba «% de la bolsa repartida» de un numero que no habia
     forma de fijar. */
  bolsa           : (eventoId) => client.get(`/eventos/${eventoId}/expositores/bolsa`).then(r => r.data),
  guardarBolsa    : (eventoId, body) => client.put(`/eventos/${eventoId}/expositores/bolsa`, body).then(r => r.data),
  guardarCuotas   : (eventoId, body) => client.put(`/eventos/${eventoId}/expositores/cuotas`, body).then(r => r.data),
  admin           : (eventoId) => client.get(`/eventos/${eventoId}/networking/admin`).then(r => r.data),
  crearExpositor  : (eventoId, body) => client.post(`/eventos/${eventoId}/networking/expositores`, body).then(r => r.data),
  /* Faltaba, y su ausencia se notaba: un expositor creado desde la Rueda de
     Negocios no se podía editar desde ninguna parte — sólo borrar y volver a
     crear. Detrás es el mismo manejador que `editarStand`. */
  editarExpositor : (eventoId, id, body) => client.patch(`/eventos/${eventoId}/networking/expositores/${id}`, body).then(r => r.data),
  borrarExpositor : (eventoId, expositorId) => client.delete(`/eventos/${eventoId}/networking/expositores/${expositorId}`).then(r => r.data),
  generarHorarios : (eventoId, expositorId, body) => client.post(`/eventos/${eventoId}/networking/expositores/${expositorId}/horarios`, body).then(r => r.data),
  borrarHorario   : (eventoId, horarioId) => client.delete(`/eventos/${eventoId}/networking/horarios/${horarioId}`).then(r => r.data),
  /* Bloquear una franja en vez de borrarla (0113): «esta empresa no está de 11
     a 12» se decia borrando esos horarios, y borrar pierde el porque. */
  bloquearHorario : (eventoId, horarioId, body) => client.patch(`/eventos/${eventoId}/networking/horarios/${horarioId}`, body).then(r => r.data),
  /* La agenda de UNA mesa. La rueda tiene dos lados y solo uno podia consultar
     su dia: quien visita ve «Mis citas», y la empresa sentada en la mesa no
     tenia ninguna pantalla — para saber a quien iba a recibir a las 10:15
     habia que pedirselo a quien organiza. La ve el equipo y tambien el
     contacto de esa misma empresa, por su `contacto_email`. */
  agendaDeMesa    : (eventoId, expositorId) => client.get(`/eventos/${eventoId}/networking/expositores/${expositorId}/citas`).then(r => r.data),

  /* La parrilla. Existía entera en el servidor —ver, aprobar, mover, sentar— y
     no la llamaba nadie: quien organiza tenía las rutas y ninguna pantalla.
     Un hueco que se abría porque una empresa no llegaba se quedaba muerto toda
     la jornada, porque una cita sólo la podía soltar quien la reservó. */
  citas       : (eventoId) => client.get(`/eventos/${eventoId}/networking/citas`).then(r => r.data),
  /* Aprobar, mover de casilla y anotar son la misma acción —tocar una casilla—
     y por eso van por la misma ruta. Contesta 409 si la casilla de destino ya
     está ocupada, que al reorganizar es lo normal, no un fallo. */
  tocarCita   : (eventoId, citaId, body) =>
    client.patch(`/eventos/${eventoId}/networking/citas/${citaId}`, body).then(r => r.data),
  /* Sentar a alguien a mano: nace confirmada, porque pedirle que apruebe una
     cita que le acaban de poner sería devolverle el trabajo. */
  sentar      : (eventoId, horarioId, quien) =>
    /* `quien` es `{ user_id }` O `{ email, nombre }`. Pedir siempre una cuenta
       —que es lo que hacia esta funcion— dejaba fuera a la mayoria: comprar una
       boleta es anonimo a proposito y de la compra solo queda un correo. El
       servidor acepta las dos formas desde la 0108; el panel seguia mandando
       solo la primera, asi que armar la agenda a mano era imposible para casi
       todos los asistentes. */
    client.post(`/eventos/${eventoId}/networking/citas`, { horario_id: horarioId, ...quien }).then(r => r.data),
};
