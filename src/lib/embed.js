/* Exportación de secciones como iframe (iFrame).
   Una sección de la landing puede vivir dentro de la web de otra empresa:
   /embed/<slug>/<seccion>. Este módulo es la única fuente de verdad del
   formato de la URL y del snippet, para que el editor y la página pública
   nunca se desincronicen. */

/* Alias amigables → tipo de bloque real. El organizador pega
   /embed/mi-evento/boletas y no necesita saber que internamente es "tickets". */
export const EMBED_ALIAS = {
  boletas: 'tickets',
  entradas: 'tickets',
  tickets: 'tickets',
  'como-llegar': 'mapa',
  ubicacion: 'mapa',
  mapa: 'mapa',
  'mapa-evento': 'mapa_evento',
  'plano': 'mapa_evento',
  mapa_evento: 'mapa_evento',
  ponentes: 'speakers',
  speakers: 'speakers',
  patrocinadores: 'sponsors',
  sponsors: 'sponsors',
  expositores: 'expositores',
  directorio: 'expositores',
  premios: 'recompensas',
  recompensas: 'recompensas',
  preguntas: 'faq',
  faq: 'faq',
  'cuenta-regresiva': 'countdown',
  countdown: 'countdown',
  informacion: 'info',
  info: 'info',
};

/* Tipo de bloque → slug bonito para la URL pública del embed. */
export const EMBED_SLUG_AMIGABLE = {
  tickets: 'boletas',
  mapa: 'como-llegar',
  mapa_evento: 'mapa-evento',
  speakers: 'ponentes',
  sponsors: 'patrocinadores',
  expositores: 'directorio',
  recompensas: 'premios',
  faq: 'preguntas',
  countdown: 'cuenta-regresiva',
  info: 'informacion',
};

/* Bloques que se pueden servir aunque el organizador los haya quitado de la
   landing: se alimentan de los datos del evento, no de configuración propia.
   Se sirven con sus `defaults` (títulos incluidos), no con data vacía: si no,
   una sección incrustada llegaría sin encabezado y parecería rota. */
export const EMBED_SIN_CONFIG = [
  'tickets', 'info', 'direccion', 'titulo', 'descripcion', 'galeria_evento', 'links',
  'mapa', 'mapa_evento', 'expositores', 'recompensas',
];

/* Secciones del evento que no viven en la landing pero también se incrustan.
   Este es el catálogo que ve el organizador en el modal de exportar. */
export const EMBED_ESPECIALES = [
  { seccion: 'espacio',     label: 'Espacio del evento',    nota: 'El calendario de charlas, stands, competencias y shows.' },
  { seccion: 'torneo',      label: 'Llaves del torneo',     nota: 'El bracket o la tabla de la liga, en vivo.' },
  { seccion: 'torneos',     label: 'Torneos y campeones',   nota: 'Cada torneo con su ganador y los equipos que jugaron.' },
  { seccion: 'ranking',     label: 'Ranking de expositores',nota: 'Quién dio más puntos en su stand. Sólo empresas, nunca asistentes.' },
  { seccion: 'directorio',  label: 'Directorio de expositores', nota: 'Las marcas del evento con su stand y su cronograma.' },
  { seccion: 'mapa-evento', label: 'Mapa del evento',       nota: 'El plano con los stands y las actividades ubicadas.' },
  { seccion: 'como-llegar', label: 'Cómo llegar',           nota: 'La dirección del evento sobre Google Maps.' },
  { seccion: 'rueda-inscripcion', label: 'Inscripción a la rueda', nota: 'Con el código de su boleta, cada persona se inscribe como comprador o vendedor y ve sus citas.' },
  { seccion: 'boletas',     label: 'Boletas',               nota: 'Los tipos de entrada con su precio. Comprar abre GESTEK aparte.' },
];

/* ── Los tres modos de publicación (columna eventos.modo_publico) ──
   A dónde lleva el enlace público del evento. Lo define la migración 0060 y
   lo respeta EventoPublicoPage. */
export const MODOS_PUBLICACION = [
  {
    value: 'gestek',
    label: 'La página de GESTEK',
    resumen: 'El evento vive aquí.',
    detalle: 'La página que armas en este editor es la del evento. No necesitas web propia ni tocar nada más.',
    pideUrl: false,
  },
  {
    value: 'externa',
    label: 'Mi propia web',
    resumen: 'El enlace lleva a tu sitio.',
    detalle: 'Ya tienes la página del evento hecha en otro sitio. GESTEK se queda con la gestión —boletas, asistentes, check-in— y quien llegue por aquí sale a tu web.',
    pideUrl: true,
  },
  {
    value: 'iframe',
    label: 'Mi web, con GESTEK dentro',
    resumen: 'Tu sitio, nuestras secciones.',
    detalle: 'Tu página, pero las boletas, la agenda, el mapa o el torneo se sirven desde GESTEK incrustados y se actualizan solos. Copia el código de cada sección abajo y pégalo en tu web.',
    pideUrl: true,
  },
];

export function modoPublicacion(valor) {
  return MODOS_PUBLICACION.find(m => m.value === valor) || MODOS_PUBLICACION[0];
}

/* «Auto» sigue al sitio que lo incrusta cuando ese sitio nos lo puede contar
   —lo hace el script que va con este código—, y si no, se ve como la página
   del evento, que es oscura. Antes seguía al SISTEMA OPERATIVO de quien
   miraba, que no tiene nada que ver ni con el evento ni con la web donde está:
   el mismo formulario se veía distinto según el portátil de quien entraba, y
   sobre una web oscura salía ilegible. */
export const EMBED_TEMAS = [
  { value: 'auto',   label: 'Seguir al sitio que lo incrusta' },
  { value: 'claro',  label: 'Siempre claro' },
  { value: 'oscuro', label: 'Siempre oscuro' },
];

/* La pista que va debajo del selector. Vive aquí, junto a las opciones, para
   que no derive: una ayuda que describe otro comportamiento es peor que
   ninguna. */
export const EMBED_TEMA_PISTA =
  'Si tu web es clara, elige «Siempre claro»: sin eso la sección se ve como la página del evento, que es oscura.';

/* ── Cómo se usa esto bien ──────────────────────────────────────────────────
 *
 * No es un texto de relleno: cada línea sale de algo que ya pasó en una web de
 * verdad, y va arriba del modal porque son decisiones que se toman ANTES de
 * copiar — después ya está pegado en la web del cliente y nadie vuelve.
 *
 * La lista vive aquí, junto al generador del código, para que no derive: una
 * recomendación que describe otro comportamiento es peor que ninguna.
 *
 * `clave` es para las pruebas y para poder enlazar una desde otro sitio.
 * `cuando` acota a qué configuración aplica; sin él, sale siempre.
 */
export const EMBED_RECOMENDACIONES = [
  {
    clave: 'no-tocar-el-script',
    ambito: ['seccion', 'boton'],
    titulo: 'Pégalo entero, sin quitarle el script',
    detalle: 'Esas líneas hacen tres cosas: ajustan el alto, copian la tipografía y el tema de tu web, y sacan el pago a una pestaña. Sin ellas la sección sale cortada y quien intente pagar se queda mirando.',
  },
  {
    clave: 'volver-a-pegar',
    ambito: ['seccion', 'boton'],
    titulo: 'Si rediseñas tu web, vuelve a copiar el código',
    detalle: 'El código lleva dentro una copia de nuestro script: el que pegaste hace meses es el de entonces, y las mejoras posteriores no le llegan solas.',
  },
  {
    clave: 'tema-claro',
    ambito: ['seccion'],
    titulo: '¿Tu web es clara? Elige «Tema → Siempre claro»',
    detalle: 'Con «Seguir al sitio» la sección se ve como la página del evento, que es oscura, salvo que tu web nos diga su color — cosa que sólo hace si pegaste el código completo y reciente.',
    cuando: (o) => o.tema === 'auto',
  },
  {
    clave: 'sin-alto-fijo',
    ambito: ['seccion'],
    titulo: 'No lo encierres en una caja de alto fijo',
    detalle: 'El recuadro crece solo cuando alguien abre el formulario. Si el contenedor de tu web tiene un alto fijo o `overflow: hidden`, el formulario queda cortado justo cuando se está usando.',
    cuando: (o) => o.autoAlto,
  },
  {
    clave: 'una-por-pagina',
    ambito: ['seccion'],
    titulo: 'Una misma sección, una sola vez por página',
    detalle: 'El código identifica el recuadro por un nombre que sale del evento y de la sección. Dos copias de la misma sección en la misma página comparten ese nombre, y el ajuste de alto se lo lleva sólo la primera.',
  },
  {
    clave: 'sin-script',
    ambito: ['seccion'],
    titulo: 'Si tu gestor de páginas no deja pegar <script>',
    detalle: 'Algunos bloques de «insertar web» (Notion, ciertos Wix) sólo aceptan el recuadro. Entonces: pon un alto inicial generoso y fija el tema a mano — sin script no podemos saber ni cuánto ocupa ni de qué color es tu página.',
  },
  {
    clave: 'pago-en-pestana',
    ambito: ['seccion', 'boton'],
    titulo: 'El pago abre una pestaña, y tiene que ser así',
    detalle: 'El formulario y la reserva gratuita ocurren dentro de tu web. El cobro no: las pasarelas se niegan a cargarse dentro de un recuadro ajeno (3-D Secure, cookies de terceros). Para entonces la boleta ya está creada y no se pierde nada de lo escrito.',
  },

  /* ── Sólo del botón ────────────────────────────────────────────────────
   *
   * Las de arriba se escribieron para exportar una SECCIÓN y se enseñaban sólo
   * ahí. Al botón —que es el código que más se pega— no le salía ninguna, y no
   * todas le valen: «una sola vez por página» es justo lo contrario, porque el
   * botón está pensado para repetirse (por eso existe «quiero colocarlo yo»).
   * De ahí el `ambito`: una lista, y cada consejo dice dónde tiene sentido. */
  {
    clave: 'boton-sin-script',
    ambito: ['boton'],
    titulo: 'Si tu gestor de páginas no deja pegar <script>, no hay botón',
    detalle: 'Aquí el script no es un extra: es lo que dibuja el botón y abre la ventana. En Notion o en bloques de «insertar web» que sólo aceptan un recuadro, usa la exportación de la sección «Boletas» en vez del botón.',
  },
  {
    clave: 'boton-color-de-tu-web',
    ambito: ['boton'],
    titulo: 'El formulario se pone del color de tu página',
    detalle: 'El script mide el fondo real de tu web y el formulario se ve claro u oscuro como ella. Si pegaste el código hace meses, el tuyo no hace eso todavía: vuelve a copiarlo. Sin ese aviso el formulario se ve como la página del evento, que es oscura.',
  },
  {
    clave: 'boton-guardalo',
    ambito: ['boton'],
    titulo: 'Guárdalo antes de copiarlo',
    detalle: 'Un botón guardado se puede volver a copiar tal cual meses después —para otra página, o si rehaces tu web— y además te dice cuánta gente entró por él. Sin guardarlo, el código se copia y se olvida, y reconstruirlo de memoria sale distinto cada vez.',
  },
];

/* Las que aplican a esta configuración.
   `ambito` por defecto es 'seccion', que es de donde salió la lista: así,
   llamar como antes sigue devolviendo lo de antes. */
export function recomendacionesPara(opciones = {}, ambito = 'seccion') {
  return EMBED_RECOMENDACIONES.filter(r =>
    (r.ambito || ['seccion']).includes(ambito)
    && (!r.cuando || r.cuando(opciones)));
}

/* Slug corto y estable para identificar el iframe en el DOM del anfitrión. */
export function embedFrameId(slug, seccion) {
  return `gestek-${String(slug || 'evento')}-${String(seccion || 'seccion')}`
    .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').slice(0, 60);
}

export function embedUrl({ origin, slug, seccion, tema = 'auto', fondo = 'transparente', fid }) {
  const base = `${origin || (typeof window !== 'undefined' ? window.location.origin : '')}/embed/${encodeURIComponent(slug)}/${encodeURIComponent(seccion)}`;
  const q = new URLSearchParams();
  if (tema && tema !== 'auto') q.set('tema', tema);
  if (fondo && fondo !== 'transparente') q.set('fondo', fondo);
  if (fid) q.set('fid', fid);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/* Snippet listo para pegar. El script es opcional (autoAlto): sin él el
   iframe queda a la altura fija indicada; con él se ajusta solo mediante
   postMessage, que es lo que la mayoría va a querer. */
export function embedSnippet({ origin, slug, seccion, titulo, tema = 'auto', fondo = 'transparente', alto = 600, autoAlto = true, heredarEstilo = true }) {
  const fid = embedFrameId(slug, seccion);
  const url = embedUrl({ origin, slug, seccion, tema, fondo, fid });
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
  const destino = base ? `'${base}'` : "'*'";
  const title = String(titulo || 'Sección del evento').replace(/"/g, "'");
  const iframe =
`<iframe id="${fid}"
        src="${url}"
        title="${title}"
        height="${alto}"
        loading="lazy"
        style="width:100%;border:0;display:block;overflow:hidden"
        scrolling="no"></iframe>`;
  /* El snippet siempre lleva script, aunque no se pida alto ni estilo: hace
     falta para el salto a la pasarela. Sin él, quien compra desde una sección
     incrustada se queda mirando: el iframe pide `abrir` por postMessage,
     nadie lo escucha, y el pago no ocurre nunca. Y no se cae solo — el
     `irAPagar` del iframe considera que avisar salió bien mientras el
     postMessage no lance, y un mensaje que el anfitrión ignora no lanza. */
  return `${iframe}
<script>
(function () {
  var f = document.getElementById('${fid}');
  if (!f) return;
${heredarEstilo ? `  /* El fondo de VERDAD detrás del recuadro: se sube por los padres hasta el
     primero que pinte algo, porque un div sin fondo dentro de una seccion
     azul es azul y preguntarle a el solo devuelve rgba(0,0,0,0).
     Con esto el formulario se pinta con el tema de ESTA pagina y no con el
     del sistema operativo de quien mira: son dos cosas que no tienen por que
     coincidir, y cuando no coinciden el formulario sale ilegible. */
  function partes(c) {
    /* Sin expresion regular a proposito: este trozo viaja pegado dentro de una
       plantilla, y una barra invertida de mas o de menos por el camino lo
       deja como un patron que no casa con nada y que falla en silencio.
       getComputedStyle siempre devuelve "rgb(r, g, b)" o "rgba(r, g, b, a)",
       asi que partir por lo que no es numero basta y no se puede romper. */
    var i = c.indexOf('(');
    if (i < 0) return null;
    var v = c.slice(i + 1, c.indexOf(')')).split(/[^0-9.]+/).filter(Boolean).map(Number);
    return v.length >= 3 ? v : null;
  }
  function fondoDeAqui() {
    var n = f, i = 0;
    while (n && i++ < 30) {
      var v = partes(getComputedStyle(n).backgroundColor || '');
      /* Casi transparente es transparente: un velo al 5% no manda sobre lo que
         hay debajo, y tomarlo por el fondo da el color equivocado. */
      if (v && (v.length < 4 || v[3] > 0.5)) return v;
      n = n.parentElement;
    }
    return null;
  }
  function esquemaDeAqui() {
    var v = fondoDeAqui();
    if (!v) return null;
    function l(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    return (0.2126 * l(v[0]) + 0.7152 * l(v[1]) + 0.0722 * l(v[2])) < 0.18 ? 'oscuro' : 'claro';
  }
  function estilo() {
    try {
      f.contentWindow.postMessage({
        gestek: 'estilo', fid: '${fid}',
        fuente: getComputedStyle(document.body).fontFamily,
        esquema: esquemaDeAqui()
      }, ${destino});
    } catch (e) {}
  }
  f.addEventListener('load', estilo);
` : ''}  window.addEventListener('message', function (e) {
${base ? `    /* Sólo se escucha a nuestro iframe. Sin esto, cualquier otro script de
       esta página -una etiqueta de publicidad, un chat de soporte- podría
       mandar un mensaje con este mismo id y hacer que se abra la URL que
       quisiera, a nombre de quien puso el snippet. */
    if (e.origin !== '${base}') return;
` : ''}    var d = e.data;
    if (!d || d.fid !== '${fid}') return;
${autoAlto ? `    if (d.gestek === 'alto') { f.style.height = d.alto + 'px'; }
` : ''}${heredarEstilo ? `    if (d.gestek === 'pide-estilo') { estilo(); }
` : ''}    /* El pago sale a una pestaña de verdad. Un checkout dentro de un iframe
       de otro dominio se rompe por las cookies de terceros, por el 3-D Secure
       -que se niega a cargarse enmarcado- y por la redirección de vuelta de la
       pasarela, que aterrizaría dentro del recuadro. */
    if (d.gestek === 'abrir' && d.url) {
      window.open(d.url, '_blank', 'noopener,noreferrer');
    }
  });
})();
<\/script>`;
}

/* ── El botón de registro ───────────────────────────────────────────────────
 *
 * Lo de arriba incrusta una SECCIÓN de la landing dentro de la web de otro.
 * Esto es lo otro que pide el cliente: sólo un botón en su web que, al
 * pulsarlo, abre el registro encima de su página, sin sacar al visitante del
 * sitio donde estaba.
 *
 * Quien pinta el botón y abre la ventana es `public/widget.js`, que se sirve
 * tal cual —sin empaquetar, porque lo carga una web ajena— y dentro sólo hay
 * un iframe a `/embed/<slug>/registro`.
 *
 * ── Por qué el pago sale de la ventana y el formulario no ──────────────────
 *
 * El formulario, la reserva gratuita y la confirmación con sus sub-eventos
 * ocurren dentro: son peticiones a nuestra propia API y funcionan igual estén
 * donde estén.
 *
 * El salto a Mercado Pago o a Wompi, no. Un checkout dentro de un iframe de
 * otro dominio se rompe por tres sitios a la vez: las cookies de terceros que
 * los navegadores ya bloquean por defecto, el 3-D Secure del banco —que se
 * niega a cargarse enmarcado— y las redirecciones de vuelta de la pasarela,
 * que aterrizan dentro del recuadro. Así que cuando toca pagar, el iframe le
 * pide al anfitrión que abra la pasarela en una pestaña de verdad. Lo que se
 * escribió no se pierde: la boleta ya está creada cuando eso pasa.
 */

/* Los tres tamaños del botón. Van aquí y no en el widget porque el panel los
   enseña al organizador y el widget los aplica: una sola lista para los dos. */
export const WIDGET_TAMANOS = {
  sm: { padding: '8px 16px',  fuente: '14px' },
  md: { padding: '12px 22px', fuente: '15px' },
  lg: { padding: '16px 30px', fuente: '17px' },
};

/* ── Cómo responde el botón al pasar por encima ──────────────────────────
 *
 * El botón hacía una sola cosa: aclararse. Se eligió así a propósito —moverse
 * dentro de la web de otro choca con las animaciones que esa web ya tenga— y
 * como decisión por defecto sigue siendo la buena. Como única opción, no: un
 * botón pegado en una página llena de cosas necesita a veces llamar la
 * atención, y quien lo pega es quien sabe si su web lo aguanta.
 *
 * Así que se elige, y `no` sigue estando: hay webs donde lo correcto es que el
 * botón no haga nada.
 *
 * Cinco y no quince. Un menú de animaciones largo se recorre entero, se elige
 * la más llamativa, y el botón acaba dando saltos en la web de un cliente.
 *
 * `hover` son estilos en línea, no clases: este archivo lo comparte el panel
 * con `public/widget.js`, que se sirve tal cual a webs ajenas y no puede
 * inyectar CSS en la página de nadie. `pulso` es el único que se mueve solo,
 * y va con la API de animaciones del navegador por lo mismo.
 *
 * La lista está copiada en `public/widget.js` porque allí no se puede
 * importar. `tests/animacionDelBoton.test.mjs` compara las dos. */
export const WIDGET_ANIMACIONES = [
  { clave: 'brillo', label: 'Se aclara',  desc: 'Lo de siempre. No mueve nada de la página.',
    hover: { filter: 'brightness(1.08)' } },
  { clave: 'elevar', label: 'Se levanta', desc: 'Sube un poco y la sombra crece.',
    hover: { transform: 'translateY(-2px)', filter: 'brightness(1.04)' } },
  { clave: 'crecer', label: 'Crece',      desc: 'Se agranda un 4 %.',
    hover: { transform: 'scale(1.04)' } },
  { clave: 'latir',  label: 'Late',       desc: 'Pulsa solo, sin que nadie pase por encima. Llama la atención — y cansa si hay más cosas moviéndose.',
    hover: { filter: 'brightness(1.08)' }, pulso: true },
  { clave: 'no',     label: 'Nada',       desc: 'Ni se aclara. Para webs con su propio estilo de botones.',
    hover: {} },
];

export const animacionDe = (clave) =>
  WIDGET_ANIMACIONES.find(a => a.clave === clave) || WIDGET_ANIMACIONES[0];

/* ── Qué se puede cambiar de un botón, en un solo sitio ──────────────────
 *
 * Esta tabla existe porque la lista de opciones estaba escrita CUATRO veces —
 * en `WIDGET_DEFECTOS`, en el snippet, en `nuevoBoton` y en `configDe` de
 * `public/widget.js`— y las cuatro se habían separado sin que fallara nada:
 *
 *   · El panel dejaba elegir degradado, borde, sombra y ancho, la vista previa
 *     los pintaba bien, y el código que se copiaba NO los llevaba. Salía un
 *     botón plano en la web del organizador y el panel seguía enseñando el
 *     bonito. «El gradiente no funciona, pero los colores individuales sí»:
 *     `color` se escribía y `color-2` no.
 *   · Al guardar el botón para volver a usarlo, se copiaban ocho campos de
 *     dieciséis. Los otros ocho —bordes y degradados entre ellos— se perdían
 *     al guardar, no al copiar.
 *
 * Es el fallo de siempre en esta base: un valor deja de estar donde alguien lo
 * busca, y no hay error — hay un botón amarillo liso.
 *
 * `attr` es el `data-` que lee el widget; `def` es su valor por defecto, y
 * tiene que ser EL MISMO que el de `configDe`. `tests/embed.test.mjs` compara
 * las dos listas contra el fuente del widget, porque `public/widget.js` lo
 * carga una web ajena y no puede importar nada de aquí. */
export const WIDGET_OPCIONES = [
  /* A qué boleta lleva. Vacío = a la lista, como hasta ahora.
     Con varias boletas, un botón que abre la lista obliga a elegir dentro de
     una ventana pequeña, y no se puede poner «Comprar VIP» en una página y
     «Stand comercial» en otra — que es justo lo que se quiere hacer al pegar
     el botón en sitios distintos. */
  { clave: 'boleta',     attr: 'boleta',      def: '' },
  /* De dónde viene esta inscripción. Lo pone la plataforma al crear el botón,
     no la persona: así no hay dos botones con el mismo nombre ni espacios
     raros en una URL. */
  { clave: 'origen',     attr: 'origen',      def: '' },
  /* A qué SUB-EVENTO lleva. Vacío = al registro del evento, que es lo de
     siempre.
     Un botón sólo sabía abrir `/embed/:slug/registro`, así que la única puerta
     que se podía pegar en otra web era la entrada principal. Un taller con su
     propio formulario, una rueda de negocios, una batalla de pitch: existen,
     tienen inscripción y preguntas propias, y no había forma de enlazarlos
     desde fuera — la agenda entera sí, un sub-evento concreto no.
     Y `boleta` y `sesion` se excluyen: son dos destinos. */
  { clave: 'sesion',     attr: 'sesion',      def: '' },
  { clave: 'texto',      attr: 'texto',       def: 'Registrarme', siempre: true },
  { clave: 'color',      attr: 'color',       def: '#E0B12B',     siempre: true },
  { clave: 'color2',     attr: 'color-2',     def: '' },
  { clave: 'gradiente',  attr: 'gradiente',   def: '135deg' },
  { clave: 'colorTexto', attr: 'color-texto', def: '#12100B',     siempre: true },
  { clave: 'radio',      attr: 'radio',       def: '12',          siempre: true },
  { clave: 'borde',      attr: 'borde',       def: '0' },
  { clave: 'colorBorde', attr: 'color-borde', def: 'transparent' },
  { clave: 'sombra',     attr: 'sombra',      def: 'md' },
  { clave: 'tamano',     attr: 'tamano',      def: 'md',          siempre: true },
  { clave: 'ancho',      attr: 'ancho',       def: 'auto' },
  /* Cómo responde al pasar por encima. `brillo` es lo que hacía antes, así que
     un botón ya pegado en una web no cambia de comportamiento. */
  { clave: 'animacion',  attr: 'animacion',   def: 'brillo' },
  { clave: 'titulo',     attr: 'titulo',      def: 'Registro' },
];

export const WIDGET_DEFECTOS = Object.fromEntries(
  WIDGET_OPCIONES.map(o => [o.clave, o.def]),
);

/* Los atributos que se escriben en el código que se pega.
 *
 * `siempre` son los cinco que estaban antes: se escriben aunque valgan lo de
 * por defecto, porque son los que alguien va a querer retocar a mano en el
 * HTML sin volver al panel. El resto sale sólo si se cambió — un
 * `data-boleta=""` en la web de alguien es ruido que invita a rellenarlo.
 *
 * Lo que NO se hace es la lista blanca de dos que había aquí: cada opción
 * nueva del panel entra sola. */
export function atributosDe(opciones = {}) {
  const o = { ...WIDGET_DEFECTOS, ...opciones };

  /* Un destino, no dos. El panel ya no deja elegir los dos —son excluyentes—,
     pero eso es una pantalla: un botón guardado antes de que existiera
     `sesion`, o un código retocado a mano, puede traer los dos. Y entonces el
     widget elige `sesion` en silencio y el botón abre algo distinto de lo que
     dice el panel.
     Gana `sesion` porque es lo más concreto: quien lo puso apuntaba a UNA
     actividad, no a la lista de boletas. */
  if (o.sesion) o.boleta = '';

  return WIDGET_OPCIONES
    .filter(x => x.siempre || (o[x.clave] !== '' && o[x.clave] != null && String(o[x.clave]) !== String(x.def)))
    .map(x => ({ attr: x.attr, valor: String(o[x.clave] ?? x.def) }));
}

/* ¿Estamos dentro del iframe de otra web? Se pregunta dentro de un try porque
   en un iframe de otro dominio, leer `window.parent` puede lanzar. */
export function estaIncrustado() {
  if (typeof window === 'undefined') return false;
  try { return window.parent && window.parent !== window; } catch { return true; }
}

/* Le dice algo al anfitrión. Los tipos que entiende `widget.js`:
     alto   { alto }        redimensiona la ventana
     abrir  { url }         abre una pestaña de verdad (la pasarela de pago)
     listo  { codigo }      el registro terminó
     cerrar {}              cerrar la ventana */
export function avisarAlAnfitrion(tipo, datos = {}, fid = '') {
  if (!estaIncrustado()) return false;
  try {
    window.parent.postMessage({ gestek: tipo, fid, ...datos }, '*');
    return true;
  } catch {
    /* Cross-origin con el anfitrión bloqueado: no hay nada que hacer y no es
       motivo para romper la pantalla de quien está registrándose. */
    return false;
  }
}

/* A dónde mandar a alguien que va a pagar. Devuelve true si se delegó en el
   anfitrión, para que quien llama no navegue además por su cuenta. */
export function irAPagar(url, fid = '') {
  if (!url) return false;
  if (estaIncrustado() && avisarAlAnfitrion('abrir', { url }, fid)) return true;
  window.location.href = url;
  return true;
}

/* El snippet que copia el organizador. Una línea, sin iframe a la vista: el
   botón y la ventana los pone el script. */
export function widgetSnippet({ origin, slug, ...opciones }) {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
  const attr = (k, v) => `\n        data-${k}="${String(v).replace(/"/g, '&quot;')}"`;

  const cuerpo = [{ attr: 'gestek-evento', valor: slug }, ...atributosDe(opciones)]
    .map(a => attr(a.attr, a.valor))
    .join('');

  return `<script src="${base}/widget.js"${cuerpo}></script>`;
}

/* La otra forma: el botón donde el organizador quiera, y el script una sola
   vez al final. Es lo que hace falta cuando el botón va dentro de un menú o
   repetido en varias secciones de la misma página. */
export function widgetSnippetEnSitio({ origin, slug, ...opciones }) {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
  /* El primero va pegado al `<div ` y los demás sangrados debajo. Se hace con
     `join` y no recortando después, para no tener que escribir un salto de
     línea dentro de una expresión regular. */
  const cuerpo = [{ attr: 'gestek-registro', valor: slug }, ...atributosDe(opciones)]
    .map(a => `data-${a.attr}="${String(a.valor).replace(/"/g, '&quot;')}"`)
    .join('\n     ');

  return `<!-- donde quieras que salga el botón -->
<div ${cuerpo}></div>

<!-- una sola vez, al final de la página -->
<script src="${base}/widget.js"></script>`;
}

/* El estilo del botón, calculado igual que lo calcula `public/widget.js`.
 *
 * Existe para la vista previa del panel: el organizador tiene que ver
 * exactamente el botón que va a salir en su web. Las dos tablas de arriba
 * —`WIDGET_TAMANOS` y las sombras— son la fuente; `widget.js` lleva su copia
 * porque lo carga una web ajena y no puede importar nada de aquí.
 *
 * Que las dos copias no se separen no se deja a la buena fe: `tests/widget/`
 * compara lo que pinta el widget de verdad contra estos valores. */
export const WIDGET_SOMBRAS = {
  no: 'none',
  sm: '0 1px 2px rgba(0,0,0,.16)',
  md: '0 6px 16px rgba(0,0,0,.20)',
  lg: '0 14px 34px rgba(0,0,0,.28)',
};

export function estiloBotonWidget(opciones = {}) {
  const o = { ...WIDGET_DEFECTOS, ...opciones };
  const t = WIDGET_TAMANOS[o.tamano] || WIDGET_TAMANOS.md;
  return {
    display      : o.ancho === 'completo' ? 'block' : 'inline-block',
    width        : o.ancho === 'completo' ? '100%' : 'auto',
    padding      : t.padding,
    fontSize     : t.fuente,
    fontWeight   : 600,
    lineHeight   : 1.2,
    color        : o.colorTexto,
    background   : o.color2
      ? `linear-gradient(${o.gradiente || '135deg'}, ${o.color}, ${o.color2})`
      : o.color,
    border       : `${parseInt(o.borde, 10) || 0}px solid ${o.colorBorde || 'transparent'}`,
    borderRadius : `${parseInt(o.radio, 10) || 0}px`,
    boxShadow    : Object.prototype.hasOwnProperty.call(WIDGET_SOMBRAS, o.sombra)
      ? WIDGET_SOMBRAS[o.sombra]
      : o.sombra,
    cursor       : 'pointer',
  };
}
