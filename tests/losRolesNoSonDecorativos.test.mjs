/* Un rol que se puede conceder tiene que servir para algo.
 *
 * ── El patrón ────────────────────────────────────────────────────────────
 *
 * El menú deja entrar por permiso —y bien: la lista de `perm` de cada pestaña
 * coincide con la que exige el servidor— y luego, dentro, la pantalla decidía
 * por `soyOwner`. Así que la pestaña se abría y decía «Solo el organizador
 * puede…». No es un 403 ni un error: es una pantalla que se abre para
 * enseñarte que no puedes.
 *
 * Encontrado en CINCO sitios, y siempre el mismo daño: un rol de la semilla
 * que se puede repartir y no sirve para nada.
 *
 *   Stands          «Coordinación de expositores» tiene `gestionar_expositores`
 *                   y encontraba tres muros
 *   Rueda           el mismo rol veía sólo «Explorar» y «Mis citas»: podía
 *                   mirar la rueda como un asistente y no operarla
 *   Aforo           quien lleva la logística veía el número y no podía ponerlo
 *                   a cero
 *   Tareas          la persona cuyo trabajo es repartir el trabajo no podía
 *                   crear ni una
 *   Vacantes        el más gratuito: la pestaña dejaba entrar con
 *                   `editar_evento` y el servidor pedía exactamente eso
 *
 * La única salida en los cinco casos era compartir la cuenta de quien creó el
 * evento — que es exactamente lo que los roles existen para evitar.
 *
 * Correr: npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const leer = (f) => fs.readFileSync(path.join(process.cwd(), 'src', f), 'utf8').replace(/\r/g, '');
const sinComentarios = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

/* Las pantallas que ya se arreglaron, con lo que el SERVIDOR pide en cada una.
 *
 * `soyOwner` puede seguir apareciendo —es el respaldo cuando una pantalla vieja
 * no pasa la bandera, y eso es correcto: lo que no puede hacer es abrirse
 * sola—. Lo que no puede volver es el muro. */
const ARREGLADAS = [
  {
    archivo: 'pages/events/tabs/StandsTab.jsx',
    banderas: ['puedeStands', 'puedeConfigurar'],
    /* Dos poderes y no uno: llevar el directorio es de cada día, cambiar
       cuánto vale un sello es una decisión del evento. */
  },
  { archivo: 'pages/events/tabs/NetworkingTab.jsx', banderas: ['puedeGestionar'] },
  { archivo: 'pages/events/workspace/asistentes/AforoSection.jsx', banderas: ['puedeLimpiar'] },
  { archivo: 'pages/events/tabs/TareasTab.jsx', banderas: ['puedeAsignar'] },
  /* El más gratuito de los cinco: la pestaña dejaba entrar con `editar_evento`
     y el servidor pedía exactamente eso, así que Editor y Coordinador la abrían
     para leer que no podían. */
  { archivo: 'pages/events/tabs/VacantesTab.jsx', banderas: ['puedeGestionar'] },
];

for (const p of ARREGLADAS) {
  test(`${p.archivo.split('/').pop()} decide por permiso, no por haber creado el evento`, () => {
    const src = leer(p.archivo);
    for (const b of p.banderas) {
      assert.ok(src.includes(b), `no recibe ${b}`);
    }
    /* El muro, en cualquiera de sus redacciones. */
    assert.doesNotMatch(sinComentarios(src), /Solo el organizador/,
      'volvió el muro de «Solo el organizador puede…»');
  });
}

test('el workspace calcula esas banderas con los permisos, no con soyOwner a secas', () => {
  const ws = sinComentarios(leer('pages/events/workspace/EventWorkspace.jsx'));
  for (const b of ['puedeStands', 'puedeConfigurar', 'puedeGestionar', 'puedeLimpiar', 'puedeAsignar']) {
    const i = ws.indexOf(`${b}=`);
    assert.ok(i > 0, `el workspace no pasa ${b}`);
    /* Cada una tiene que salir de `puedeVer(...)`, que es quien mira los
       permisos del miembro. Pasar `soyOwner` a secas sería el mismo muro
       escrito una capa más arriba. */
    assert.match(ws.slice(i, i + 120), /puedeVer\('/,
      `${b} no sale de un permiso`);
  }
});

test('y las pestañas siguen dejando entrar a los mismos que el servidor', () => {
  /* Si el menú se cerrara más que el servidor, el arreglo de dentro no lo vería
     nadie: la pestaña no aparecería. Los `perm` de estas tres se corresponden
     con `PERMS_EXPOSITORES` (rueda), `gestionar_expositores`/`checkin` (stands)
     y `checkin` (aforo). */
  const ws = leer('pages/events/workspace/EventWorkspace.jsx');
  assert.match(ws, /id: 'networking'.*perm: \['gestionar_expositores', 'editar_evento'\]/);
  assert.match(ws, /id: 'stands'.*perm: \['gestionar_expositores', 'checkin'\]/);
  assert.match(ws, /id: 'aforo'.*perm: 'checkin'/);
});

test('las pantallas que GUARDAN no se ofrecen a quien sólo puede mirar', () => {
  /* Dos casos del barrido del 11-sep, y los dos costaban trabajo, no un clic:
     alguien pasaba un rato ajustando algo que nunca se iba a guardar.

     · «Diseñar escarapela» y «Diseñar carné» se ofrecían con `ver_clientes` y
       guardan en `page_json` con `eventosApi.update`, que pide `editar_evento`.
     · Documentos: la pestaña se abre con `ver_documentos` —que la 0122 dio a
       TODOS los roles— y subir o quitar guarda `page_json` igual. Se elegía el
       archivo, se esperaba la subida, y 403 al final. */
  const acred = leer('pages/events/workspace/asistentes/AcreditacionSection.jsx');
  /* Se comprueba QUÉ decide enseñar los diseñadores, no la línea literal: al
     añadir `gestionar_acreditacion` —el permiso que la 0124 creó justo para
     esto— la condición dejó de ser un `puede('editar_evento')` suelto, y la
     versión anterior de este test fallaba aunque la garantía siguiera en pie.
     Lo que importa es que los dos diseñadores vayan con un permiso que PUEDA
     GUARDAR, y que `ver_clientes` no esté entre ellos. */
  const cond = acred.match(/const disena = ([^;]+);/);
  assert.ok(cond, 'ya no hay una condición única que decida si se puede diseñar');
  assert.match(cond[1], /editar_evento/);
  assert.ok(!/ver_clientes/.test(cond[1]),
    'diseñar vuelve a ofrecerse a quien sólo puede mirar la lista');
  assert.match(acred, /disena\s+\? \[\['escarapela'/);
  assert.match(acred, /disena\s+\? \[\['carne'/);
  /* Imprimir sigue siendo de quien está en la puerta: no guarda nada. */
  assert.match(acred, /puede\('checkin'\)\s*\? \[\['etiquetas'/);

  const docs = leer('pages/events/workspace/DocumentosSection.jsx');
  assert.match(docs, /puedeEditar = true/);
  assert.match(docs, /\{puedeEditar && \(<>/, 'la zona de subir sigue saliendo para quien sólo lee');
  const ws = leer('pages/events/workspace/EventWorkspace.jsx');
  assert.match(ws, /puedeEditar=\{puedeVer\('editar_evento'/);
});

test('las seis pantallas que imprimen o facturan traen la lista entera', () => {
  /* Pedían `limit: 1000` y el servidor sirve 200: se quedaban con las primeras
     200 sin decirlo. Un juego de escarapelas incompleto, y en facturación unas
     cuentas hechas sobre 200 boletas de 386. Lo rompí yo al poner el tope. */
  const PANTALLAS = [
    'pages/events/workspace/asistentes/AccesosSection.jsx',
    'pages/events/workspace/asistentes/CredencialesSection.jsx',
    'pages/events/workspace/asistentes/EtiquetadoraSection.jsx',
    'pages/events/workspace/asistentes/InvitacionesSection.jsx',
    'pages/events/workspace/asistentes/TarjetaSection.jsx',
    'pages/events/workspace/comercial/FacturacionSection.jsx',
  ];
  for (const f of PANTALLAS) {
    const src = leer(f);
    assert.match(src, /clientesApi\.listarTodos\(evento\.id\)/, `${f} no trae la lista entera`);
    assert.doesNotMatch(src, /limit: 1000/, `${f} vuelve a pedir un límite que el servidor no da`);
  }
  /* Y el recorrido vive en un solo sitio, no seis veces. */
  const api = leer('api/clientes.js');
  assert.match(api, /listarTodos\s*:/);
  assert.match(api, /\w+\.length < \(d\.por_pagina \?\? POR_TANDA\)/,
    'el bucle se fía de lo que pidió en vez de lo que le dieron');
  /* Y va por cursor, no por número de página: el día del evento entran boletas
     mientras se recorren las tandas, y con páginas numeradas las filas se
     desplazan — el mismo nombre sale dos veces y otro no sale. Visto en
     FESTECH con tres mil boletas. */
  assert.match(api, /proximo_cursor/, 'listarTodos volvió a paginar por número de página');
  assert.match(api, /vistos\.has\(c\.id\)/, 'listarTodos ya no deduplica por id');
});

test('la agenda no se cae por lo que no se puede leer', () => {
  /* Leer las sesiones acepta `checkin` —para eso existe `PERMS_AGENDA_LEER`—
     pero leer los speakers no. `speakers` era la única del `Promise.all` sin
     `.catch`, así que el 403 tumbaba la petición entera: quien está en la
     puerta abría la pestaña, veía un toast rojo y la pantalla vacía, sin la
     agenda que sí podía leer.

     Las sesiones ya traen su speaker dentro, así que esa lista es sólo para
     gestionarlos. */
  const src = leer('pages/events/tabs/AgendaTab.jsx');
  assert.match(src, /agendaApi\.speakers\(evento\.id\)\.catch/,
    'el 403 de speakers vuelve a tumbar la pestaña entera');
  /* `null` = no se pudieron leer; `[]` = no hay. Son cosas distintas y la
     sub-vista sólo tiene sentido en la segunda. */
  assert.match(src, /const puedeSpeakers = speakers !== null;/);
  assert.match(src, /puedeSpeakers \? \[\['speakers', 'Speakers'\]\] : \[\]/,
    'se sigue ofreciendo una sub-vista que abre vacía por falta de permiso');
});

test('borrar una boleta pide teclear el correo, no un botón', () => {
  /* La tarjeta del tablero pedía «una verificación… digitando algo específico
     como el email», y sólo había un `confirmDialog` con botón. Un «¿seguro?» se
     contesta que sí sin leer: se aprende a despacharlo, y entonces no protege
     el día que sí importa. Teclear el correo obliga a mirar a QUIÉN se borra. */
  const confirm = leer('components/ui/Confirm.jsx');
  assert.match(confirm, /escribir: opts\.escribir \|\| null/, 'confirmDialog no acepta `escribir`');
  assert.match(confirm, /disabled=\{falta\}/, 'el botón no espera a que se teclee');
  /* Enter tiene que respetarlo: si no, la verificación se salta con una tecla
     y no protege de nada. */
  assert.match(confirm, /e\.key === 'Enter' && !falta/);
  /* Y el campo se fija al abrir, siempre desde las opciones de ESTA apertura:
     sin eso el segundo borrado hereda lo tecleado en el primero y el botón
     sale habilitado de entrada.

     Se comprueba que salga de `s` y no que la línea diga `setTecleado('')`,
     que es lo que decía antes: al añadir `pedirTexto` —que abre el campo con
     un valor inicial— el literal dejó de valer aunque la garantía siguiera
     intacta. Un test que fija la línea en vez de lo que la línea promete falla
     el día que el código mejora. */
  assert.match(confirm, /_open = \(s\) => \{ setTecleado\(s\?\.valor \|\| ''\);/,
    'el campo no se fija desde las opciones de la apertura: hereda lo del diálogo anterior');
  /* Sin host montado se dice que no, en vez de caer a un window.confirm: se
     pidió teclear justamente porque un botón no bastaba. */
  assert.match(confirm, /if \(opts\.escribir\) \{ resolve\(false\); return; \}/);

  const clientes = leer('pages/events/tabs/ClientesTab.jsx');
  assert.match(clientes, /escribir: aEscribir/);
  /* El código como respaldo: hay boletas sin correo, y sin respaldo esas no se
     podrían borrar nunca. */
  assert.match(clientes, /const aEscribir = c\.guest_email \|\| c\.codigo;/);
});

test('el Excel respeta el tipo de boleta que esté filtrado', () => {
  /* En estos eventos los tipos SON las actividades, así que «quién va al
     DemoDay» es una hoja distinta de «la lista del evento». Antes había que
     exportar las 440 filas y filtrar a mano en Excel. */
  const clientes = leer('pages/events/tabs/ClientesTab.jsx');
  assert.match(clientes, /clientesApi\.exportar\(evento\.id, tipoFilter \|\| undefined\)/);
  /* El nombre del archivo lleva el tipo: dos descargas del mismo evento no
     pueden llamarse igual en la carpeta. */
  assert.match(clientes, /sufijo: r\.tipo \? `inscritos-\$\{r\.tipo\}`/);

  const api = leer('api/clientes.js');
  assert.match(api, /ticket_type_id: ticketTypeId/);
});
