/* La redacción de los permisos: etiqueta, descripción y grupo.
 *
 * ── Quién manda ─────────────────────────────────────────────────────────
 *
 * El servidor. `GET /eventos/:id/roles` devuelve su catálogo y ES la lista;
 * esto sólo pone las palabras —el `desc` largo, que no vale la pena mandar por
 * la red en cada carga— y sirve de respaldo mientras la respuesta no llega o si
 * el servidor es viejo.
 *
 * Antes esta lista se mantenía «a mano y a propósito idéntica» a la del
 * backend, y duró lo que duran esas cosas: se añadió `borrar_boletas` allí, se
 * protegió la ruta con él, se puso el botón, y aquí no apareció la casilla. El
 * permiso existía y no había forma de concederlo. `tests/elPanelPuedeConcederTodo`
 * cruza las dos listas para que eso falle en vez de descubrirse.
 *
 * ── `aplicado` ──────────────────────────────────────────────────────────
 *
 * Marca un permiso que se puede conceder y todavía no cambia nada, para que
 * quien arma un rol lo sepa. **Hoy no hay ninguno**: los 31 están comprobados
 * por alguna ruta, y el servidor tiene un test que lo sujeta —
 * `test/permisosQueNoConcedianNada.test.js`— en vez de dejarlo a la memoria.
 *
 * Ese test nació porque el párrafo de abajo se quedó corto: `publicar_anuncios`
 * llevaba desde la migración 0122 en el panel, con su etiqueta, sin que ninguna
 * ruta lo comprobara. 34 roles en producción lo tenían concedido y los 34
 * recibían un 403. Un permiso que FALTA se nota al chocar contra el 403; uno
 * que SOBRA no, porque quien armó el rol marcó la casilla y se quedó tranquilo.
 *
 * Se conserva porque la situación se ha dado tres veces y volverá a darse —un
 * permiso se reparte en la semilla antes de que exista la pantalla que lo usa—
 * y porque esconderlos entonces sería peor: un rol tendría poderes invisibles
 * en su propia pantalla de edición. La marca miente en la dirección peor
 * cuando se queda vieja, así que se comprueba buscando el id en las rutas antes
 * de tocarla, nunca de memoria.
 *
 * `vip_zone` fue el último en dejar de estar en `false`: pasó de «no existe la
 * función que promete» a decidir quién puede atender una puerta restringida.
 * Este comentario decía que seguía sin comprobarse mucho después de que se
 * comprobara — que es exactamente el fallo del que avisa el párrafo de arriba,
 * cometido en el texto que lo explica.
 */

export const PERMISOS = [
  /* Co-dueño.
   *
   * Va primero y aparte porque no es un permiso más: es «manda igual que
   * quien lo creó». Existe porque en FESTECH el evento lo llevan varias
   * organizaciones y todas mandan igual — y el rol más alto, «Administrador»,
   * enumera 22 permisos y aun así no llega a cinco pantallas que el panel
   * reserva a quien figura como dueño. La salida hasta hoy era compartir la
   * cuenta.
   *
   * El servidor ya conocía esta cadena en `core/permisos/puede()`; lo que no
   * la conocía era `lib/acceso.js`, que es quien vigila las 58 rutas. Un
   * miembro con `*` pasaba un guardia y lo paraba el otro. */
  { id: '*', grupo: 'Co-dueño', label: 'Manda igual que quien creó el evento',
    desc: 'Todos los permisos, incluidas las pantallas de ajustes, integraciones y anuncios. No incluye borrar el evento ni transferirlo: eso se queda en quien lo creó.',
    aplicado: true },

  /* Evento */
  { id: 'editar_evento',         grupo: 'Evento',    label: 'Editar evento',           desc: 'Cambiar título, descripción, fechas, ubicación y modalidad.', aplicado: true },
  { id: 'publicar_evento',       grupo: 'Evento',    label: 'Publicar / cancelar',     desc: 'Cambiar el estado del evento.', aplicado: true },
  { id: 'editar_pagina_publica', grupo: 'Evento',    label: 'Editar página pública',   desc: 'Usar el editor visual, la marca y la publicación.', aplicado: true },
  { id: 'gestionar_imagenes',    grupo: 'Evento',    label: 'Imágenes y galería',      desc: 'Subir y borrar portada y galería.', aplicado: true },

  /* Espacio del evento */
  { id: 'gestionar_agenda',      grupo: 'Espacio',   label: 'Gestionar el espacio',    desc: 'Crear y editar sub-eventos: charlas, talleres, shows, competencias.', aplicado: true },
  { id: 'gestionar_torneo',      grupo: 'Espacio',   label: 'Gestionar torneos',       desc: 'Equipos, llaves, resultados y categorías.', aplicado: true },
  { id: 'gestionar_expositores', grupo: 'Espacio',   label: 'Gestionar expositores',   desc: 'Stands, fichas y puntos de los expositores.', aplicado: true },
  { id: 'gestionar_accesos',     grupo: 'Espacio',   label: 'Accesos e ingresos',      desc: 'Definir las puertas del evento y qué boletas admite cada una.', aplicado: true },

  /* Equipo */
  { id: 'invitar_staff',         grupo: 'Equipo',    label: 'Invitar al equipo',       desc: 'Agregar nuevas personas como staff.', aplicado: true },
  { id: 'gestionar_roles',       grupo: 'Equipo',    label: 'Gestionar roles',         desc: 'Crear, editar y borrar roles del evento.', aplicado: true },
  { id: 'remover_miembros',      grupo: 'Equipo',    label: 'Quitar miembros',         desc: 'Sacar gente del equipo del evento.', aplicado: true },
  { id: 'gestionar_solicitudes', grupo: 'Equipo',    label: 'Atender solicitudes',     desc: 'Responder sugerencias e incidencias del equipo, y aprobar las correcciones de ficha.', aplicado: true },
  /* Repartir el trabajo del evento. No era un permiso: era `owner_id`, y quien
     lleva la logistica abria el tablero de tareas y no podia poner nada en el
     —ni ver mas que las suyas, que para quien asigna es no ver nada—. */
  { id: 'gestionar_tareas',      grupo: 'Equipo',    label: 'Asignar tareas',          desc: 'Crear tareas, repartirlas, cambiarles la fecha y ver el tablero completo del evento.', aplicado: true },
  /* Subir un contrato guarda en `page_json`, y eso pedia `editar_evento`: para
     dejar que alguien colgara un PDF habia que darle el evento entero. */
  { id: 'gestionar_documentos',  grupo: 'Equipo',    label: 'Subir y quitar documentos', desc: 'Colgar contratos, riders y planos, y quitarlos. Ver los documentos es otro permiso.', aplicado: true },
  { id: 'gestionar_vacantes',    grupo: 'Equipo',    label: 'Publicar vacantes',         desc: 'Crear vacantes del evento y mover a quien se postula por las etapas.', aplicado: true },
  { id: 'ver_documentos',        grupo: 'Equipo',    label: 'Ver documentos',          desc: 'Contratos, riders y listas del evento. Sin esto la sección no aparece y los archivos ni siquiera viajan.', aplicado: true },

  /* Tickets */
  { id: 'gestionar_tickets',     grupo: 'Tickets',   label: 'Gestionar tipos de boleta', desc: 'Crear, editar y borrar tipos de ticket.', aplicado: true },
  { id: 'gestionar_descuentos',  grupo: 'Tickets',   label: 'Códigos de descuento',    desc: 'Crear y administrar cupones.', aplicado: true },

  /* Clientes */
  { id: 'ver_clientes',          grupo: 'Clientes',  label: 'Ver lista de clientes',   desc: 'Acceso a la lista de inscritos.', aplicado: true },
  { id: 'gestionar_clientes',    grupo: 'Clientes',  label: 'Editar clientes',         desc: 'Cambiar el estado de una boleta, invalidarla, importar y exportar.', aplicado: true },
  { id: 'checkin',               grupo: 'Clientes',  label: 'Hacer check-in',          desc: 'Escanear QR y marcar asistencia.', aplicado: true },
  /* Repartir lo que la boleta incluye: el almuerzo, el kit, el parqueadero
     (0126). Aparte de `checkin` porque quien sirve la comida no tiene por que
     poder abrir la puerta, y al reves. */
  { id: 'entregar',              grupo: 'Clientes',  label: 'Entregar lo que incluye la boleta', desc: 'Escanear para dar refrigerios, almuerzos, kits o cualquier cosa incluida, dejando constancia de quien la entrego.', aplicado: true },
  /* Faltaba, y no en el sentido inofensivo: el servidor lo comprueba desde la
     0122 y aqui no estaba, asi que la casilla no existia y quien organiza NO
     podia concederselo a nadie. El permiso, el boton y la ruta estaban los
     tres; lo que faltaba era la forma de unirlos. Sin ningun error — la
     casilla simplemente no aparecia. */
  { id: 'borrar_boletas',        grupo: 'Clientes',  label: 'Borrar boletas',          desc: 'Quitar una boleta y sus respuestas para siempre. Es para los duplicados que deja un fallo; para lo demas, invalidar.', aplicado: true },
  /* Los dos que obligaban a dar `editar_evento` para tareas del dia del
     evento: el diseno de la escarapela y la lista previa de invitados. */
  { id: 'gestionar_acreditacion', grupo: 'Clientes', label: 'Diseñar escarapelas y carnés', desc: 'El diseño con el que se imprime la escarapela y el carné digital. No incluye editar el resto del evento.', aplicado: true },
  { id: 'gestionar_padron',      grupo: 'Clientes',  label: 'Cargar el padrón de invitados', desc: 'La lista previa con la que se prellena el registro de quien ya estaba invitado.', aplicado: true },
  { id: 'vip_zone',              grupo: 'Clientes',  label: 'Atender cualquier puerta', desc: 'Llave maestra: marca entradas por puertas restringidas sin estar en la lista de staff de cada una. Sin esto, sólo atiende las puertas donde esté apuntado.', aplicado: true },

  /* Chat */
  { id: 'crear_canales',         grupo: 'Chat',      label: 'Crear canales',           desc: 'Crear chats principales y subgrupos.', aplicado: true },
  { id: 'borrar_mensajes',       grupo: 'Chat',      label: 'Moderar mensajes',        desc: 'Borrar mensajes de otros miembros.', aplicado: true },
  { id: 'publicar_anuncios',     grupo: 'Chat',      label: 'Publicar anuncios',       desc: 'Escribirle a todo el evento. Antes era sólo del dueño.', aplicado: true },

  /* Pagos */
  { id: 'ver_pagos',             grupo: 'Pagos',     label: 'Ver pagos e ingresos',    desc: 'La pestaña Dinero: cuánto entró, de qué, qué falta por cobrar y qué se devolvió.', aplicado: true },
  { id: 'reembolsar',            grupo: 'Pagos',     label: 'Registrar reembolsos',    desc: 'Marcar una boleta como reembolsada y liberar su cupo. El dinero se devuelve en la pasarela.', aplicado: true },

  /* Analytics */
  { id: 'ver_analytics',         grupo: 'Analytics', label: 'Ver analytics',           desc: 'Métricas, conversión y reportes.', aplicado: true },
];

/* Agrupado para UI.
 *
 * ── Manda el servidor, si lo dice ───────────────────────────────────────
 *
 * `GET /eventos/:id/roles` devuelve su propio catalogo. Cuando llega, ES la
 * lista: la de arriba solo aporta la redaccion —el `desc` largo que explica que
 * hace cada permiso, que no vale la pena mandar por la red en cada carga— y
 * sirve de respaldo mientras la respuesta no llega o si el servidor es viejo.
 *
 * Por que asi y no como estaba: la lista de aqui se mantenia «a mano y a
 * proposito identica» a la del backend, y duro lo que duran esas cosas. Se
 * anadio `borrar_boletas` al servidor, se protegio la ruta con el, y la casilla
 * no aparecio nunca en el panel. El permiso existia y no habia forma de
 * concederlo.
 *
 * Ahora, si el servidor conoce un permiso que aqui no esta, sale igual con la
 * etiqueta que el mande. Se vera sin explicacion larga —y eso se arregla
 * escribiendola aqui— pero se PUEDE conceder, que es lo que importa. */
export function permisosPorGrupo(catalogo) {
  const local = new Map(PERMISOS.map(p => [p.id, p]));
  const lista = Array.isArray(catalogo) && catalogo.length
    ? catalogo.map(c => {
        const mio = local.get(c.id);
        return {
          ...c,
          label: mio?.label || c.label || c.id,
          grupo: mio?.grupo || c.grupo || 'Otros',
          desc : mio?.desc  || '',
          /* Sin marca local, se asume que si aplica: viene del servidor, que es
             quien lo comprueba. Decir «no cambia nada» de un permiso que si
             cambia algo es el error caro de los dos. */
          aplicado: mio ? mio.aplicado : true,
        };
      })
    : PERMISOS;

  /* El co-dueño no es un permiso del catalogo del servidor —es la cadena `*`
     que `assertPermiso` trata aparte—, asi que se conserva siempre. */
  const conCodueno = lista.some(p => p.id === '*') ? lista : [local.get('*'), ...lista].filter(Boolean);

  const map = new Map();
  for (const p of conCodueno) {
    if (!map.has(p.grupo)) map.set(p.grupo, []);
    map.get(p.grupo).push(p);
  }
  return Array.from(map.entries()); // [['Evento', [...]], ['Equipo', [...]], ...]
}

export function labelFor(id) {
  return PERMISOS.find(p => p.id === id)?.label || id;
}
