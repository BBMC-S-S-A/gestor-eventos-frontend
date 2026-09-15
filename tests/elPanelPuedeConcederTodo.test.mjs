/* El panel tiene que poder conceder todo lo que el servidor comprueba.
 *
 * La lista de permisos del panel (`src/lib/permisos.js`) se mantenía «a mano y
 * a propósito idéntica» a la del backend (`core/permisos/catalogo.js`). Duró lo
 * que duran esas cosas: se añadió `borrar_boletas`, se protegió la ruta con él,
 * se puso el botón — y la casilla no apareció nunca. O sea que quien organiza
 * NO podía concedérselo a nadie. El permiso existía, la ruta lo pedía, el botón
 * estaba, y no había forma de unir los tres.
 *
 * Y no daba ningún error. La casilla simplemente no estaba, y quien la buscaba
 * concluía que la plataforma no lo hacía.
 *
 * Ahora manda el catálogo que viaja en `GET /eventos/:id/roles`. Estas pruebas
 * sujetan que el panel lo USE y que el respaldo local no se quede corto.
 *
 * El literal de abajo está fijado aquí a propósito: leer el repo del backend
 * pasa en local y falla en CI, donde sólo está clonado este. Cada lado fija el
 * suyo, y si divergen falla ruidosamente — que es justo lo que no pasó.
 *
 * Correr: npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const leer = (f) => fs.readFileSync(path.join(process.cwd(), 'src', f), 'utf8').replace(/\r/g, '');

/* Los 32 de `core/permisos/catalogo.js` al 2026-09-13. `entregar` es el
   último: lo creó la 0126 para repartir lo que la boleta incluye —el almuerzo,
   el kit, el parqueadero— sin tener que dar el permiso de la puerta. */
const DEL_SERVIDOR = [
  'editar_evento', 'publicar_evento', 'editar_pagina_publica', 'gestionar_imagenes',
  'gestionar_agenda', 'gestionar_torneo', 'gestionar_expositores', 'gestionar_accesos',
  'invitar_staff', 'gestionar_roles', 'remover_miembros', 'gestionar_solicitudes',
  'gestionar_tareas', 'ver_documentos', 'gestionar_documentos', 'gestionar_vacantes',
  'gestionar_tickets', 'gestionar_descuentos',
  'ver_clientes', 'gestionar_clientes', 'checkin', 'entregar', 'vip_zone', 'borrar_boletas',
  'gestionar_acreditacion', 'gestionar_padron',
  'crear_canales', 'borrar_mensajes', 'publicar_anuncios',
  'ver_pagos', 'reembolsar', 'ver_analytics',
];

const PERMISOS_JS = leer('lib/permisos.js');
const idsLocales = [...PERMISOS_JS.matchAll(/\{\s*id:\s*'([^']+)'/g)].map(m => m[1]);

test('el respaldo local no se queda corto', () => {
  const faltan = DEL_SERVIDOR.filter(p => !idsLocales.includes(p));
  assert.deepEqual(faltan, [],
    'el servidor comprueba permisos que el panel no sabe pintar: no se pueden conceder');
});

test('y no ofrece permisos que el servidor no conoce', () => {
  /* El error al revés: una casilla que se marca, se guarda y no hace nada.
     `*` es la excepción legítima — no es un permiso del catálogo, es el
     co-dueño, y `assertPermiso` lo trata aparte. */
  const sobran = idsLocales.filter(p => p !== '*' && !DEL_SERVIDOR.includes(p));
  assert.deepEqual(sobran, [], 'el panel ofrece permisos que ninguna ruta comprueba');
});

test('cuando el servidor manda su catálogo, manda él', () => {
  /* Lo importante de la corrección: si el servidor conoce un permiso que esta
     lista no tiene, el panel lo pinta igual con la etiqueta que le manden.
     Saldrá sin explicación larga —eso se arregla escribiéndola— pero se PUEDE
     conceder, que es lo que faltaba. */
  assert.match(PERMISOS_JS, /export function permisosPorGrupo\(catalogo\)/,
    'permisosPorGrupo sigue ignorando lo que diga el servidor');
  assert.match(PERMISOS_JS, /Array\.isArray\(catalogo\)/);

  const equipo = leer('pages/events/tabs/EquipoTab.jsx');
  assert.match(equipo, /rs\?\.catalogo/, 'la pantalla no lee el catálogo de la respuesta');
  /* Los dos sitios donde se arma un rol: crear y editar. Si sólo uno lo
     recibe, se puede conceder un permiso al crear el rol y no al corregirlo. */
  assert.equal((equipo.match(/catalogo=\{catalogo\}/g) || []).length, 4,
    'falta pasar el catálogo en alguno de los sitios que arman un rol');
});

test('el co-dueño sobrevive aunque el servidor no lo mande', () => {
  /* `*` no está en el catálogo del servidor: es una cadena que `assertPermiso`
     trata aparte. Si al usar el catálogo remoto se perdiera, dejaría de poder
     nombrarse a un co-dueño — y en FESTECH el evento lo llevan varias
     organizaciones. */
  assert.match(PERMISOS_JS, /p\.id === '\*'/);
});

test('limpiar un aforo depende del permiso, no de haber creado el evento', () => {
  /* El botón iba contra `soyOwner`: quien lleva la logística veía el número y
     para ponerlo a cero al terminar una charla tenía que llamar a quien creó el
     evento, en mitad del día. El servidor ya lo concede por permiso; era la
     pantalla la que no. */
  const aforo = leer('pages/events/workspace/asistentes/AforoSection.jsx');
  assert.match(aforo, /puedeLimpiar/, 'la pantalla no recibe quién puede limpiar');
  assert.doesNotMatch(aforo, /soyOwner \? \(\) => limpiar/, 'todavía queda un botón atado al dueño');
  assert.doesNotMatch(aforo, /\{soyOwner && <button onClick=\{\(\) => limpiar/, 'el "Limpiar todo" sigue siendo del dueño');
  /* Y si una pantalla vieja no lo pasa, se cae a `soyOwner` — nunca se abre
     sola. */
  assert.match(aforo, /puedeLimpiar === undefined \? soyOwner/);

  const ws = leer('pages/events/workspace/EventWorkspace.jsx');
  assert.match(ws, /puedeLimpiar=\{puedeVer\('gestionar_accesos'/,
    'el workspace no calcula el permiso de limpiar');
});

test('el botón de crear tareas depende del permiso', () => {
  /* La pestaña se abre para todo el equipo: cada persona viene a ver lo suyo.
     Lo que dependía del permiso era crear y repartir, y el botón salía igual —
     así que quien no podía se enteraba al darle, con un error rojo. */
  const tareas = leer('pages/events/tabs/TareasTab.jsx');
  assert.match(tareas, /puedeAsignar/, 'la pestaña no sabe quién puede repartir');
  assert.match(tareas, /\{puedeAsignar && \(/, 'el botón sigue saliendo para todo el mundo');

  const ws = leer('pages/events/workspace/EventWorkspace.jsx');
  assert.match(ws, /puedeAsignar=\{puedeVer\('gestionar_tareas'/);
  /* `editar_evento` también: los roles que ya existen lo tienen y repartían
     tareas antes de que esto fuera un permiso. Si se cayera, Administrador y
     Coordinador perderían algo que ya hacían. */
  assert.match(ws, /puedeVer\('editar_evento', soyOwner, permisos\)/);
});

test('la pestaña de equipo no se cae porque no se puedan leer los roles', () => {
  /* Se entra con `gestionar_roles`, `invitar_staff` o `remover_miembros`, y
     LEER los roles pide el primero. Las dos peticiones iban en el mismo
     `Promise.all`, así que a quien tenía uno de los otros dos se le quedaba la
     pestaña entera en blanco con un error: sin poder hacer lo único que sí
     podía hacer. */
  const eq = leer('pages/events/tabs/EquipoTab.jsx');
  assert.doesNotMatch(eq, /Promise\.all\(\[equipoApi\.list/,
    'las dos peticiones vuelven a ir juntas: un 403 en los roles tumba el equipo');
  assert.match(eq, /rolesApi\.list\(evento\.id\)\.catch\(\(\) => null\)/);
  assert.match(eq, /\{hayRoles && \(/, 'la sección de roles se enseña aunque no se pueda usar');
});

test('en tu propia fila no se ofrece cambiarte el rol', () => {
  /* El servidor lo rechaza —un clic de «Logística» a «Administrador» no lo
     aprueba nadie— y ofrecer el control para luego negarlo es peor. */
  const eq = leer('pages/events/tabs/EquipoTab.jsx');
  assert.match(eq, /soyYo=\{Boolean\(usuario\?\.id\)/);
  assert.match(eq, /\{isOwner \|\| soyYo \?/, 'la fila propia sigue con el selector');
  /* `m.user_id` con respaldo en `m.profile?.id`: quien está invitado y no ha
     aceptado no tiene perfil, y sin el respaldo la comparación sería contra
     `undefined` — una guardia que no salta nunca y nadie nota. */
  assert.match(eq, /m\.user_id \|\| m\.profile\?\.id/);
});

test('la cabecera no afirma cosas que la lista contradice', () => {
  /* Decía que `vip_zone` era «el único sin comprobar» mucho después de que se
     comprobara — un comentario que contradice al dato de veinte líneas abajo.
     Es el fallo del que el propio comentario avisa, cometido en el texto que
     lo explica. */
  const cabecera = PERMISOS_JS.slice(0, PERMISOS_JS.indexOf('export const PERMISOS'));
  const sinAplicar = (PERMISOS_JS.match(/aplicado: false/g) || []).length;
  if (sinAplicar === 0) {
    assert.doesNotMatch(cabecera, /queda \*\*uno solo\*\* sin comprobar/,
      'la cabecera dice que queda uno sin comprobar y no queda ninguno');
    assert.match(cabecera, /Hoy no hay ninguno/);
  }
  /* Y no vuelve a decir que esta lista se mantiene «a mano e idéntica» a la
     del backend, que es lo que dejó de ser cierto al servirla el servidor. */
  assert.doesNotMatch(cabecera, /a mano y a propósito idéntica»?\s*$/m);
});
