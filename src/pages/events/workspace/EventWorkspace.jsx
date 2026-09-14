import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, Link, NavLink } from 'react-router-dom';
import { eventosApi } from '../../../api/eventos.js';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { confirmDialog } from '../../../components/ui/Confirm.jsx';
import { EstadoBadge } from '../../../components/ui/Badge.jsx';
import GLoader from '../../../components/ui/GLoader.jsx';
import ErrorBoundary from '../../../components/ui/ErrorBoundary.jsx';
import GestekMark from '../../../components/layout/GestekMark.jsx';
import TopBar from '../../../components/layout/TopBar.jsx';
import { useI18n } from '../../../context/I18nContext.jsx';

import ResumenSection    from './ResumenSection.jsx';
import WhiteLabelSection from './WhiteLabelSection.jsx';
import PublicacionSection from './PublicacionSection.jsx';
import AnunciosSection from './AnunciosSection.jsx';
import GestbotSidebar from '../../../components/agente/GestbotSidebar.jsx';
import PagosSection        from './comercial/PagosSection.jsx';
import DineroSection       from './comercial/DineroSection.jsx';
import CheckoutSection      from './comercial/CheckoutSection.jsx';
import SeoSection           from './comercial/SeoSection.jsx';
import EmailsSection        from './comercial/EmailsSection.jsx';
import FacturacionSection  from './comercial/FacturacionSection.jsx';
import PromocionesSection  from './comercial/PromocionesSection.jsx';
import AccesosSection     from './asistentes/AccesosSection.jsx';
import AforoSection       from './asistentes/AforoSection.jsx';
import AcreditacionSection from './asistentes/AcreditacionSection.jsx';
import PreviosSection      from './asistentes/PreviosSection.jsx';
import DocumentosSection    from './DocumentosSection.jsx';
import PaginaPublicaTab  from '../tabs/PaginaPublicaTab.jsx';
import FormularioTab     from '../tabs/FormularioTab.jsx';
import EquipoTab         from '../tabs/EquipoTab.jsx';
import TareasTab         from '../tabs/TareasTab.jsx';
import SolicitudesTab    from '../tabs/SolicitudesTab.jsx';
import AgendaTab         from '../tabs/AgendaTab.jsx';
import StandsTab         from '../tabs/StandsTab.jsx';
import VacantesTab       from '../tabs/VacantesTab.jsx';
import ReporteTab        from '../tabs/ReporteTab.jsx';
import AutomatizacionesSection from './AutomatizacionesSection.jsx';
import IntegracionesSection from './IntegracionesSection.jsx';
import RankingTab        from '../tabs/RankingTab.jsx';
import TicketsTab        from '../tabs/TicketsTab.jsx';
import DerechosTab       from '../tabs/DerechosTab.jsx';
import PlanoTab          from '../tabs/PlanoTab.jsx';
import AnalyticsTab      from '../tabs/AnalyticsTab.jsx';
import ClientesTab       from '../tabs/ClientesTab.jsx';
import CheckinTab        from '../tabs/CheckinTab.jsx';
import AcreditadosTab    from '../tabs/AcreditadosTab.jsx';
import NetworkingTab     from '../tabs/NetworkingTab.jsx';
import TorneoTab         from '../tabs/TorneoTab.jsx';
import MapaSection       from './MapaSection.jsx';
import ZonasSection      from './espacio/ZonasSection.jsx';
import ChatTab           from '../tabs/ChatTab.jsx';
import PlaceholderTab    from '../tabs/PlaceholderTab.jsx';
import BroadcastModal    from '../BroadcastModal.jsx';
import Volver from '../../../components/ui/Volver.jsx';
import { guardarEvento, leerEvento } from '../../../lib/eventoEnCache.js';
import { ruedaEncendida, topeValido, TOPE_MAX } from '../../../lib/ajustesRueda.js';

/* ──────────────────────────────────────────────────────────────────
   Workspace del evento — Rework Fase 3
   "Cada evento es un Workspace independiente dentro de GESTEK."
   Al entrar, todo el sistema cambia de contexto: sidebar propio con
   las 7 secciones del PDF (+ Dinámicas), badge de rol y salida clara.
   ────────────────────────────────────────────────────────────────── */


/* Secciones y sub-tabs. perm: permiso requerido para miembros (owner ve todo).
   null = todo el equipo. 'placeholder' marca módulos aún en construcción. */
/* ── Por qué el menú está agrupado así ─────────────────────────
 *
 * Antes había 8 secciones y 39 pestañas, agrupadas por TRES criterios a la vez:
 * por objeto (Espacio del evento, Asistentes), por momento (Event Experience
 * era *antes*, Comercial era *la venta*) y por departamento (Organización).
 * Con tres ejes, la respuesta a «¿dónde está X?» es «depende», y por eso la
 * misma cosa caía en dos sitios según con qué eje se mirara: el Reporte junto
 * a Vacantes y Documentos, y Analytics en Comercial, midiendo los dos lo mismo.
 *
 * La regla ahora es una sola: cada sección es UNA COSA del evento, no un
 * momento ni un departamento. Una actividad ocurre en el tiempo, una zona
 * existe en el espacio; un torneo es actividad aunque tenga sitio, un stand es
 * sitio aunque tenga horario.
 *
 * Lo que se juntó porque era lo mismo partido en dos:
 *   · Credenciales + Tarjeta → Escarapelas y carnés (qué lleva encima el
 *     asistente), con la impresión en etiquetadora como tercera vista
 *   · Lista de espera + Invitaciones → Invitaciones
 *   · Analytics + Reporte → dentro de Resumen, que era una sección de una sola
 *     pestaña
 *   · Emails + Anuncios + Chats → Mensajes, las tres formas de decir algo
 *
 * Las dos fusiones de Asistentes cambian permisos, así que no se hicieron a
 * secas: cada pantalla fusionada comprueba dentro el permiso de cada vista.
 * Ver `AcreditacionSection` y `PreviosSection`.
 *
 * `perm`: permiso requerido para miembros (el dueño ve todo). null = todo el
 * equipo. Un array = le basta cualquiera de ellos. */
const SECCIONES = [
  { id: 'resumen', label: 'Resumen', icon: HomeIcon, tabs: [
    { id: 'general',   label: 'Resumen',   perm: null },
    { id: 'analytics', label: 'Analytics', perm: 'ver_analytics' },
    { id: 'reporte',   label: 'Reporte',   perm: 'ver_analytics' },
  ]},
  { id: 'pagina', label: 'Tu página', icon: SparkIcon, tabs: [
    { id: 'landing',     label: 'Landing',            perm: 'editar_pagina_publica' },
    { id: 'publicacion', label: 'Publicación',        perm: 'editar_pagina_publica' },
    /* Se cayó de esta lista en el reagrupe de las 9 secciones (fd43248): esa
       misma migración de menú movió «Proceso de compra» y «Emails» a otras
       secciones y, sin querer, no reubicó «Marca» a ningún lado — se quedó
       sin entrada aquí. El componente (`WhiteLabelSection`) y su ruta
       (`case 'pagina/whitelabel'`, más abajo) nunca se tocaron: sólo faltaba
       el enlace del menú para llegar a ellos. */
    /* «Formularios» existe (`case 'pagina/formularios'`, más abajo) y volvió a
       quedarse fuera del menú: la pantalla se pinta perfecta y no hay forma de
       llegar a ella salvo escribiendo la dirección. Ya costó que un organizador
       buscara media hora dónde se agrupan los campos y concluyera que no se
       podía. `menu.test.mjs` comprueba los dos sentidos desde entonces. */
    { id: 'formularios', label: 'Formularios',        perm: 'editar_evento' },
    { id: 'whitelabel',  label: 'Marca',              perm: 'editar_pagina_publica' },
    { id: 'seo',         label: 'SEO',                perm: 'editar_pagina_publica' },
    /* «Proceso de compra» se fue a «Entradas y dinero». Estaba aquí porque se
       edita como se edita la landing —con un formulario y una previa—, pero lo
       que decide no es cómo se ve: es qué datos se piden para cobrar y qué pasa
       al pagar. Su propio permiso lo decía: pedía `gestionar_tickets`, que es
       de Entradas, viviendo en la sección de la página. */
  ]},
  /* Actividades del evento: QUÉ pasa.
     `agenda_sessions` ya tiene un `tipo` competitivo y un `torneo_id`, así que
     un torneo SIEMPRE fue un sub-evento más. El calendario es «cuándo», las
     llaves son «cómo va», los speakers son «quién». */
  { id: 'actividades', label: 'Actividades del evento', icon: TrophyIcon, tabs: [
    /* Los permisos de estas cinco decían `null` —«la ve todo el equipo»— y el
       servidor pide otra cosa en cada una. La consecuencia la escribió este
       mismo archivo hace dos semanas: «una pestaña que se abre y devuelve 403
       es peor que una pestaña que no se ve». Aquí eran cuatro.

       Ahora cada una pide lo que comprueba su ruta:
       · Calendario y Speakers → `PERMS_AGENDA_LEER` / `PERMS_AGENDA`.
       · Torneos               → `PERMS_TORNEO` (faltaba `editar_evento`, así
                                 que un Editor no veía la pestaña y su rol sí
                                 podía tocarla).
       · Rueda de negocios     → `PERMS_EXPOSITORES`. Ésta era la peor: la abría
                                 cualquiera del equipo y contestaba 403. */
    { id: 'calendario', label: 'Calendario',        perm: ['gestionar_agenda', 'editar_evento', 'checkin'] },
    { id: 'torneos',    label: 'Torneos',           perm: ['gestionar_torneo', 'editar_evento'] },
    { id: 'networking', label: 'Rueda de negocios', perm: ['gestionar_expositores', 'editar_evento'] },
    { id: 'speakers',   label: 'Speakers',          perm: ['gestionar_agenda', 'editar_evento'] },
    /* El ranking es la tabla de puntos que ya se enseña en la página pública:
       no esconde nada que no vea cualquiera con el enlace. */
    { id: 'ranking',    label: 'Ranking',           perm: null },
  ]},
  /* Zonas del evento: DÓNDE pasa.
     Una zona con su cupo, un stand con su sitio y una puerta por la que se
     entra son sitios, no personas: estaban en Asistentes y por eso había que
     salir del mapa para tocar la zona que se estaba mirando.
     «Zonas de interés» va primero porque contesta «qué es esta zona»; el aforo
     contesta «cómo va ahora mismo» y es donde se opera, de pie y con cola
     delante — por eso lleva el permiso de check-in y no el del dueño. */
  { id: 'zonas', label: 'Zonas del evento', icon: PinIcon, tabs: [
    { id: 'zonas',   label: 'Zonas de interés',   perm: 'checkin' },
    { id: 'mapa',    label: 'Mapa del evento',    perm: 'editar_evento' },
    { id: 'aforo',   label: 'Aforo por zonas',    perm: 'checkin' },
    /* `gestionar_expositores` primero: es LA pantalla del rol «Coordinación de
       expositores», y pidiendo sólo `checkin` ese rol no podía abrir su propia
       herramienta — tenía el permiso del servidor y el menú se lo escondía.
       `checkin` se queda porque en el evento los stands se operan de pie. */
    { id: 'stands',  label: 'Stands',             perm: ['gestionar_expositores', 'checkin'] },
    /* Era del dueño y de nadie más, y configurar puertas es trabajo de
       logística. Con la 0122 se puede conceder. */
    { id: 'accesos', label: 'Accesos e ingresos', perm: 'gestionar_accesos' },
  ]},
  /* Los permisos de aquí dicen lo que el SERVIDOR comprueba, no lo que suena
     bien. Antes no coincidían y el menú prometía de más:

     · «Promociones» se abría con `gestionar_tickets` y `routes/promociones.js`
       es **sólo del dueño** — y lo es a propósito, según dice su propio
       comentario. Resultado: quien gestiona boletas veía la pestaña, entraba y
       recibía 403 sin saber por qué.
     · «Pagos» y «Facturación» pedían `ver_pagos`, que **no lo comprueba
       ninguna ruta**. Lo que de verdad guarda esas pantallas es
       `editar_evento` (Pagos escribe en el evento) y `ver_clientes`
       (Facturación sólo lee clientes y boletas).

     Esconder una pestaña no es control de acceso, y enseñarla cuando el
     servidor va a decir que no es peor que esconderla. */
  /* Y el orden de aquí dentro es el del dinero, de principio a fin: qué vendes,
     cómo se compra, qué descuentos hay, con qué se cobra, cuánto entró y qué se
     factura. Antes «Proceso de compra» estaba en otra sección y «Dinero» salía
     antes que «Pagos» — el resultado se lee, no se explica. */
  { id: 'comercial', label: 'Entradas y dinero', icon: WalletIcon, tabs: [
    { id: 'boletas',      label: 'Boletas',           perm: 'gestionar_tickets' },
    /* Lo que la boleta INCLUYE y alguien reparte: refrigerios, almuerzos,
       kits, parqueadero (0126). Va junto a las boletas y no en Asistentes
       porque es configuración de lo que se vende, y lo decide quien pone los
       precios. Repartirlo se hace en «Escanear». */
    { id: 'derechos',     label: 'Lo que incluye',    perm: 'gestionar_tickets' },
    /* Para eventos donde se compra un sitio concreto —silla, mesa, palco—. Va
       junto a Boletas porque el plano y el precio son la misma decisión: una
       localidad ES un tipo de boleta sobre un conjunto de espacios. */
    { id: 'plano',        label: 'Plano de venta',    perm: 'gestionar_tickets' },
    { id: 'checkout',     label: 'Proceso de compra', perm: 'gestionar_tickets' },
    { id: 'promociones',  label: 'Promociones',       perm: 'gestionar_descuentos' },
    { id: 'pagos',        label: 'Pagos',             perm: 'editar_evento' },
    /* `ver_pagos` prometía un «dashboard financiero» que no existía; ésta es esa
       pantalla, y por eso la pestaña pide justo ese permiso. */
    { id: 'dinero',       label: 'Dinero',            perm: 'ver_pagos' },
    /* Facturación pedía `ver_clientes`, que tienen Puerta, Atención y VIP host:
       quien está escaneando en la entrada veía la facturación del evento. Es
       dinero, y va con los permisos de dinero. */
    { id: 'facturacion',  label: 'Facturación',       perm: ['ver_pagos', 'editar_evento'] },
  ]},
  { id: 'asistentes', label: 'Asistentes', icon: TicketIcon, tabs: [
    { id: 'clientes',     label: 'Clientes',  perm: 'ver_clientes' },
    /* «Escanear» y no «Control de ingreso»: ya no sólo controla el ingreso.
       Es el único sitio donde se pasa una escarapela por un móvil —entrada,
       reingreso, sub-evento, puntos y canje—, y llamarlo por la primera de
       las cinco cosas mandaba a buscar las otras cuatro a otra pantalla. */
    /* Los dos permisos: `checkin` abre los cinco modos de ingreso y puntos, y
       `entregar` (0126) el sexto —repartir el almuerzo, el kit, el
       parqueadero—. Van separados porque quien sirve la comida no tiene por
       qué poder abrir la puerta del evento, y a menudo es otra empresa; la
       pantalla comprueba dentro qué modos puede usar cada quien. */
    { id: 'checkin',      label: 'Escanear',  perm: ['checkin', 'entregar'] },
    /* Los dos permisos, no uno: la escarapela la imprime quien está en la
       puerta y el carné lo diseña quien lleva los clientes. La pantalla
       comprueba dentro cuál de las dos vistas puede ver cada quien. */
    /* «Escarapelas y carnés» nombraba dos de las cosas que hay dentro y dejaba
       fuera la tercera —imprimir en la etiquetadora—, así que quien buscaba
       dónde imprimir no miraba aquí. «Acreditación» es lo que se viene a
       hacer, y es la palabra que ya se usa en un evento; las tres piezas se
       nombran en la línea de debajo, que es donde se buscan. */
    /* Los dos permisos que dan ALGO dentro: `checkin` abre la etiquetadora y
       `editar_evento` los dos disenadores. Con `ver_clientes` a secas la
       pestana se abria y no habia ninguna vista que ensenar — en blanco. */
    /* Los tres permisos que dan ALGO dentro: `checkin` abre la etiquetadora,
       y `editar_evento` o `gestionar_acreditacion` los dos diseñadores.
       Faltaba el tercero, que es justo el que la 0124 creó para no tener que
       entregar el evento entero por diseñar una escarapela: se podía conceder,
       se veía marcado, y la pestaña no aparecía. */
    { id: 'acreditacion', label: 'Acreditación', perm: ['checkin', 'editar_evento', 'gestionar_acreditacion'] },
    /* Quién entra con cada boleta y quién responde por él (0127). Aparte de
       «Acreditación», que es diseñar e imprimir la escarapela: esto es decidir
       a quién se le da. Las dos cosas se hacen en momentos distintos y a
       menudo las hace gente distinta. */
    { id: 'acreditados',  label: 'Quién entra',  perm: ['checkin', 'editar_evento', 'gestionar_acreditacion'] },
    /* Dos cosas dentro, con dueños distintos, y la pestaña se abre para
       cualquiera de las dos:
         · Invitaciones (el padrón) pide `gestionar_padron` o `editar_evento`
           — `PERMS_PADRON`, en todas sus rutas, incluida la de leer su estado.
           El primero faltaba aquí: es el permiso fino de la 0124 y no abría
           nada. Con `ver_clientes` a
           secas la pestaña se abría y TODO lo de dentro devolvía 403: Puerta,
           Atención y Finanzas la veían para no poder usarla.
         · La lista de espera pide `gestionar_clientes` desde que dejó de ser
           del dueño. Atender la fila es trabajo de logística.
       Pidiendo sólo el primero, quien lleva los clientes no llegaba nunca a la
       lista de espera aunque el servidor ya se la aceptara. `PreviosSection`
       decide dentro cuál de las dos vistas enseña. */
    { id: 'previos',      label: 'Invitaciones',        perm: ['editar_evento', 'gestionar_clientes', 'gestionar_padron'] },
  ]},
  { id: 'equipo', label: 'Equipo y tareas', icon: UsersIcon, tabs: [
    { id: 'equipo',      label: 'Equipo y roles', perm: ['gestionar_roles', 'invitar_staff', 'remover_miembros'] },
    { id: 'tareas',      label: 'Tareas',      perm: null },
    /* `PERMS_VACANTES` en el servidor es ['gestionar_vacantes','editar_evento']
       y aquí se pedía sólo el segundo: el permiso fino que creó la 0124 —para
       no tener que entregar el evento entero por publicar una vacante— se
       podía conceder y no abría su pestaña. */
    { id: 'vacantes',    label: 'Vacantes',    perm: ['editar_evento', 'gestionar_vacantes'] },
    { id: 'solicitudes', label: 'Sugerencias', perm: null },
    /* Contratos y riders. Estaba en `null` —cualquier miembro— y eso no era
       una decisión. La 0122 se lo concede a todos los roles que ya existían,
       así que hoy nadie pierde nada; lo que cambia es que se puede quitar. */
    { id: 'documentos',  label: 'Documentos',  perm: 'ver_documentos' },
  ]},
  /* Las tres formas de decirle algo a alguien. «Emails» estaba en Event
     Experience por ser plantillas y «Anuncios» en Comunicación por ser un
     envío: quien quería avisar algo tenía que saber de antemano cuál era. */
  { id: 'mensajes', label: 'Mensajes', icon: ChatIcon, tabs: [
    { id: 'chat',     label: 'Chats',    perm: null },
    /* Lo mismo: quien lleva la comunicación no suele ser quien creó el
       evento en la plataforma. */
    { id: 'anuncios', label: 'Anuncios', perm: 'publicar_anuncios' },
    /* El servidor acepta las plantillas con cualquiera de los dos
       (`PERMS_EDITAR` en routes/emails.js). Pidiendo solo el primero, quien
       tenia `editar_evento` PODIA editarlas y no veia la pestana: una funcion
       escondida a quien puede usarla, que no da error y no se descubre. */
    { id: 'emails',   label: 'Emails',   perm: ['editar_pagina_publica', 'editar_evento'] },
  ]},
  /* Fuera «API» y «Seguridad»: eran dos placeholders que no hacían nada y
     ocupaban sitio en el menú. Vuelven cuando existan. */
  { id: 'configuracion', label: 'Configuración', icon: CogIcon, tabs: [
    { id: 'general',          label: 'General',          perm: '__solo_owner__' },
    { id: 'integraciones',    label: 'Integraciones',    perm: '__solo_owner__' },
    { id: 'automatizaciones', label: 'Automatizaciones', perm: '__solo_owner__' },
  ]},
];

function puedeVer(perm, soyOwner, permisos) {
  if (soyOwner) return true;
  if (perm == null) return true;
  /* `*` es el co-dueño: manda igual que quien creó el evento, incluidas las
     pantallas que aquí se reservaban a la propiedad literal —ajustes,
     integraciones, anuncios—. Sin esto, el rol más alto del catálogo enumera
     22 permisos y aun así no llega a cinco pantallas, y la única salida es
     compartir la cuenta del dueño; que es lo que hacen hoy los eventos con
     varias organizaciones detrás.
     El servidor concede lo mismo (`lib/acceso.js`), así que la pestaña se
     abre y funciona: enseñar una que devuelve 403 sería peor que esconderla. */
  const mandaTodo = (permisos || []).includes('*');
  if (perm === '__solo_owner__') return mandaTodo;
  if (mandaTodo) return true;
  const arr = Array.isArray(perm) ? perm : [perm];
  return arr.some(p => (permisos || []).includes(p));
}

export default function EventWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const { t } = useI18n();
  const { success, error: toastErr } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [evento, setEvento]     = useState(null);
  /* `false` o `{ guardadoAt }`. Cuando lleva fecha, lo que se está enseñando
     salió de la copia local y no del servidor. */
  const [sinConexion, setSinConexion] = useState(false);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState('');
  const [soyOwner, setSoyOwner] = useState(true);
  const [permisos, setPermisos] = useState(['*']);
  /* «Manda en este evento»: quien lo creó, o un co-dueño (`*`). Se calcula una
     vez aquí y baja a todo lo demás, para no repetir la comparación en las
     veintitrés pantallas que hoy preguntan por `soyOwner` — que es como se
     separan. */
  const mandaTodo = soyOwner || permisos.includes('*');
  /* El rol con el que entro a ESTE evento. Lo usa el escáner para saber qué
     puertas son mías cuando se asignaron a un rol entero. */
  const [miRolId, setMiRolId] = useState(null);
  const [working, setWorking]   = useState(false);
  const [drawer, setDrawer]     = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [anunciosVersion, setAnunciosVersion] = useState(0);

  /* Direcciones de antes.
     Un enlace guardado, un correo, un botón de otra pantalla o un atajo del
     buscador siguen apuntando a la casa vieja; sin esto caerían en el Resumen
     sin explicación. La lista crece cada vez que algo se muda — no se
     reemplaza, se añade: la primera mudanza (Dinámicas → Espacio) sigue aquí
     y ahora apunta dos saltos más allá, a su destino de hoy. */
  const REUBICADAS = {
    /* Dinámicas y Organización → Espacio del evento → Actividades / Zonas */
    'dinamicas/torneo'       : ['actividades', 'torneos'],
    'dinamicas/networking'   : ['actividades', 'networking'],
    'dinamicas/mapa'         : ['zonas', 'mapa'],
    'organizacion/agenda'    : ['actividades', 'calendario'],
    'organizacion/ranking'   : ['actividades', 'ranking'],
    'asistentes/aforo'       : ['zonas', 'aforo'],
    'asistentes/stands'      : ['zonas', 'stands'],
    'asistentes/accesos'     : ['zonas', 'accesos'],
    /* Espacio del evento, partido en QUÉ pasa y DÓNDE pasa */
    'espacio/calendario'     : ['actividades', 'calendario'],
    'espacio/torneos'        : ['actividades', 'torneos'],
    'espacio/networking'     : ['actividades', 'networking'],
    'espacio/ranking'        : ['actividades', 'ranking'],
    'espacio/zonas'          : ['zonas', 'zonas'],
    'espacio/mapa'           : ['zonas', 'mapa'],
    'espacio/aforo'          : ['zonas', 'aforo'],
    'espacio/stands'         : ['zonas', 'stands'],
    'espacio/accesos'        : ['zonas', 'accesos'],
    /* Event Experience → Tu página (y los correos, a Mensajes) */
    'experience/landing'     : ['pagina', 'landing'],
    'experience/publicacion' : ['pagina', 'publicacion'],
    'experience/seo'         : ['pagina', 'seo'],
    /* Y la de antes de HOY, que llevaba a «Tu página»: un enlace guardado o
       pegado en un correo tiene que seguir abriendo la pantalla, no un 404. */
    'experience/checkout'    : ['comercial', 'checkout'],
    'pagina/checkout'        : ['comercial', 'checkout'],
    'experience/formularios' : ['pagina', 'formularios'],
    'experience/whitelabel'  : ['pagina', 'whitelabel'],
    'experience/emails'      : ['mensajes', 'emails'],
    /* Organización → Equipo y tareas (y el Reporte, con la otra medición) */
    'organizacion/equipo'      : ['equipo', 'equipo'],
    'organizacion/tareas'      : ['equipo', 'tareas'],
    'organizacion/vacantes'    : ['equipo', 'vacantes'],
    'organizacion/solicitudes' : ['equipo', 'solicitudes'],
    'organizacion/documentos'  : ['equipo', 'documentos'],
    'organizacion/reporte'     : ['resumen', 'reporte'],
    'comercial/analytics'      : ['resumen', 'analytics'],
    /* Las dos fusiones de Asistentes */
    'asistentes/credenciales'  : ['asistentes', 'acreditacion'],
    'asistentes/tarjeta'       : ['asistentes', 'acreditacion'],
    'asistentes/waitlist'      : ['asistentes', 'previos'],
    'asistentes/invitaciones'  : ['asistentes', 'previos'],
    /* Comunicación → Mensajes */
    'comunicacion/chat'        : ['mensajes', 'chat'],
    'comunicacion/anuncios'    : ['mensajes', 'anuncios'],
  };
  const sBruto = searchParams.get('s') || 'resumen';
  const tBruto = searchParams.get('t') || '';
  const [seccionId, tabId] = REUBICADAS[`${sBruto}/${tBruto}`] || [sBruto, tBruto];

  useEffect(() => {
    setLoading(true);
    eventosApi.get(id)
      .then(d => {
        setEvento(d.evento);
        setSoyOwner(d.soyOwner !== false);
        setPermisos(d.permisos || ['*']);
        setMiRolId(d.mi_rol_id || null);
        setSinConexion(false);
        /* Se guarda lo mínimo para la puerta cada vez que se carga bien. */
        guardarEvento(id, { evento: d.evento, permisos: d.permisos || ['*'], soyOwner: d.soyOwner !== false, miRolId: d.mi_rol_id || null });
      })
      .catch(e => {
        /* Sin respuesta del servidor: se tira de lo guardado en vez de dejar la
           puerta sin escáner. Un 403 o un 404 SÍ paran aquí — eso no es falta
           de red, es que este evento no es tuyo o no existe, y servir una copia
           en ese caso sería enseñar algo que ya no se puede ver. */
        const cache = !e.response ? leerEvento(id) : null;
        if (cache) {
          setEvento(cache.evento);
          setSoyOwner(cache.soyOwner);
          setPermisos(cache.permisos || []);
          setMiRolId(cache.miRolId || null);
          setSinConexion({ guardadoAt: cache.guardado_at });
        } else {
          setErr(e.response?.data?.error || (e.response ? e.message : 'No pudimos cargar el evento y no hay una copia guardada en este dispositivo.'));
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const reload = useCallback(async () => {
    try { const d = await eventosApi.get(id); setEvento(d.evento); } catch { /* noop */ }
  }, [id]);

  /* Secciones visibles según permisos y categoría */
  const secciones = useMemo(() => {
    if (!evento) return [];
    /* La rueda la decide quien organiza (0113), no la categoría del evento.
       Esta lista estaba escrita aquí Y en `routes/networking.js`, y una cámara
       de comercio que monta una rueda de agroindustria —categoría que ni
       existe en el catálogo— no podía. */
    const permiteNetworking = ruedaEncendida(evento);
    /* Torneos disponibles para CUALQUIER evento: una convención de videojuegos
       o una feria también organiza torneos (parte del "Espacio del evento"). */
    return SECCIONES
      .map(s => ({
        ...s,
        /* `tab` y no `t`: `t` es la funcion de traduccion en este archivo, y
           usarla como nombre de la pestaña la tapaba. */
        tabs: s.tabs
          .filter(tab => puedeVer(tab.perm, soyOwner, permisos))
          .filter(tab => tab.id !== 'networking' || permiteNetworking),
      }))
      .filter(s => s.tabs.length > 0)
      /* Sin conexión, SÓLO el control de ingreso.
       *
       * Es lo único que sabe trabajar sin servidor: guarda los escaneos y los
       * manda al volver la red. Todo lo demás vive de peticiones, y ofrecerlo
       * desde una copia guardada enseñaría listas vacías —clientes, tareas,
       * agenda— que se leen como «no hay nadie» y «no hay nada». Eso es peor
       * que no ofrecerlo: es contestar mal a la pregunta.
       *
       * Se hace aquí, sobre el menú ya filtrado por permisos, para que sin red
       * nadie vea de pronto una pestaña que con red no le tocaba. */
      .map(s => (sinConexion
        ? { ...s, tabs: s.tabs.filter(tab => tab.id === 'checkin') }
        : s))
      .filter(s => s.tabs.length > 0);
  }, [evento, soyOwner, permisos, sinConexion]);

  const seccion   = secciones.find(s => s.id === seccionId) || secciones[0];
  const tabActivo = seccion?.tabs.find(t => t.id === tabId) || seccion?.tabs[0];

  const irA = (sId, tId) => {
    const next = { s: sId };
    if (tId) next.t = tId;
    setSearchParams(next, { replace: false });
    setDrawer(false);
  };

  /* Acciones de cabecera */
  const publicar = async () => {
    setWorking(true);
    try { await eventosApi.publicar(id); await reload(); success('Evento publicado.'); }
    catch (e) { toastErr(e.response?.data?.error || e.message); }
    finally { setWorking(false); }
  };
  const eliminar = async () => {
    if (!(await confirmDialog({ title: 'Eliminar evento', message: '¿Eliminar este evento? Esta acción no se puede deshacer.', confirmLabel: 'Eliminar', danger: true }))) return;
    setWorking(true);
    try { await eventosApi.delete(id); success('Evento eliminado.'); navigate('/eventos'); }
    catch (e) { toastErr(e.response?.data?.error || e.message); setWorking(false); }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-bg"><GLoader size="lg" message="Cargando evento…" /></div>;
  if (!evento) return (
    <div className="h-screen flex flex-col items-center justify-center bg-bg gap-4">
      <p className="text-text-2">{err || 'Evento no encontrado.'}</p>
      <Volver a="/eventos" tono="chip">Volver a mis eventos</Volver>
    </div>
  );

  const rolLabel = soyOwner ? t('Administrando') : t('Trabajando en');

  /* `min-w` en vez de ancho clavado: 264px es el ancho de diseño, pero una
     etiqueta más larga —«Rueda de negocios» pasa a «Business matchmaking» al
     traducir— ensancha la columna en vez de desbordarla. Con `w-[264px]` y el
     `whitespace-nowrap` de las pestañas, el texto se salía del panel. */
  const sidebar = (
    <aside className="w-[264px] min-w-[264px] max-w-[320px] h-full flex-shrink-0 bg-sidebar text-slate-300 flex flex-col">
      {/* Logo → volver a la app */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-3">
        <NavLink to="/inicio" className="flex items-center gap-2.5 group">
          <GestekMark size={30} />
          <span className="font-display font-bold text-white text-sm tracking-tight">GESTEK</span>
        </NavLink>
      </div>

      {/* Contexto del evento */}
      <div className="mx-3 mb-2 rounded-2xl bg-sidebar-2 border border-white/5 p-3.5">
        <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">Evento activo</p>
        <p className="text-sm font-semibold text-white leading-snug line-clamp-2">{evento.titulo}</p>
        <div className="flex flex-col items-start gap-1.5 mt-2.5">
          <EstadoBadge estado={evento.estado} />
          <span className={`text-[9px] font-semibold uppercase tracking-widest px-2 py-1 rounded-md
                            ${soyOwner ? 'bg-accent/20 text-accent-light' : 'bg-primary/20 text-primary-light'}`}>
            {rolLabel}
          </span>
        </div>
      </div>

      {/* Secciones */}
      <nav className="flex-1 overflow-y-auto no-scrollbar px-3 py-1 space-y-0.5">
        {secciones.map(s => {
          const act = s.id === seccion?.id;
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => irA(s.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-colors text-left
                          ${act ? 'bg-accent text-white shadow-glow-sm' : 'text-slate-300 hover:text-white hover:bg-sidebar-2'}`}
            >
              <Icon className="w-[17px] h-[17px] flex-shrink-0" />
              {t(s.label)}
            </button>
          );
        })}
      </nav>

      {/* Gestbot + salir */}
      <div className="p-3 space-y-2">
        <GestbotSidebar evento={evento} />
        {/* «Salir del evento» decía lo que dejas y no a dónde vas, que es lo
            que hace falta saber para decidir si pulsarlo. Y era la tercera
            salida al mismo sitio, junto con la flecha de la cabecera —que ya no
            está— y el selector de eventos del menú. */}
        <Link to="/eventos" className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-[13px] text-slate-400 hover:text-white hover:bg-sidebar-2 transition-colors">
          {/* Sin flecha. La salida ya dice a dónde va, y una flecha delante de
              un destino con nombre no añade nada: sugiere «atrás», que es
              justamente lo que esto NO hace. */}
          Mis eventos
        </Link>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-bg overflow-hidden">
      {/* Sidebar desktop */}
      <div className="hidden lg:flex">{sidebar}</div>

      {/* Drawer mobile */}
      <div className={`lg:hidden fixed inset-0 z-40 transition-opacity ${drawer ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-bg/70 backdrop-blur-md" onClick={() => setDrawer(false)} />
        <div className={`absolute top-0 left-0 h-full w-[280px] max-w-[85vw] transform transition-transform duration-300 ${drawer ? 'translate-x-0' : '-translate-x-full'}`}>
          {sidebar}
        </div>
      </div>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar onMenu={() => setDrawer(true)} />
        <main className="relative flex-1 overflow-y-auto overflow-x-hidden">
          <div className="relative z-10 p-4 sm:p-6 w-full space-y-5">

            {/* Lo que se está viendo salió de una copia guardada.
                Se dice arriba del todo y con la hora: quien está en la puerta
                tiene que saber que lo que ve puede no ser lo de ahora, y que
                por eso no están las demás pestañas. */}
            {sinConexion && (
              <div className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3">
                <p className="text-sm text-text-1 font-medium">Sin conexión — trabajando con una copia guardada.</p>
                <p className="text-xs text-text-3 mt-1 leading-relaxed">
                  Puedes seguir escaneando: los ingresos se guardan aquí y se registran solos al volver
                  el internet. El resto del panel necesita conexión, por eso no aparece.
                  {sinConexion.guardadoAt && (
                    <> Copia del {new Date(sinConexion.guardadoAt).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}.</>
                  )}
                </p>
              </div>
            )}

            {/* Header de sección */}
            <header className="flex items-center justify-between gap-3 flex-wrap">
              {/* Dónde estás, y la salida dentro de eso.

                  Aquí había un cuadrado con una flecha y nada más —el destino
                  sólo en el `title`, que en un móvil no existe—, y justo al lado
                  el nombre del evento pintado en gris muerto. Dos elementos: uno
                  que lleva a algún sitio sin decir a cuál y otro que dice dónde
                  estás sin llevar a ninguna parte.

                  Es una sola cosa: la línea dice dónde estás y su primer tramo
                  es la salida. La misma idea que `Volver` —el texto es el
                  destino—, con la ventaja de que aquí además sitúa. */}
              <div className="min-w-0">
                <nav aria-label="Dónde estás"
                  className="text-xs mb-0.5 flex items-center gap-1.5 min-w-0">
                  <Link to="/eventos"
                    className="text-text-3 hover:text-text-1 transition-colors flex-shrink-0">
                    Mis eventos
                  </Link>
                  <span className="text-text-3 flex-shrink-0" aria-hidden="true">›</span>
                  <span className="text-text-2 truncate">{evento.titulo}</span>
                </nav>
                <h1 className="text-xl sm:text-2xl font-bold font-display text-text-1 tracking-tight">{seccion?.label ? t(seccion.label) : ''}</h1>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <a href={`/explorar/${evento.slug}`} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                  <EyeIcon className="w-4 h-4" /> Ver sitio público
                </a>
                {/* Publicar va con `publicar_evento`, no con ser el dueño.
                    El servidor ya lo comprueba así —`POST /:id/estado` exige ese
                    permiso y nada más—, y aquí se pedía la propiedad: medido,
                    34 roles lo tenían concedido y ninguno veía el botón. Es la
                    casilla que se marca, se ve marcada, y no aparece por
                    ninguna parte lo que abre. */}
                {puedeVer('publicar_evento', mandaTodo, permisos) && ['borrador', 'configuracion'].includes(evento.estado) && (
                  <button onClick={publicar} disabled={working} className="btn-gradient btn-sm">Publicar evento</button>
                )}
              </div>
            </header>

            {/* Sub-tabs de la sección */}
            {seccion && seccion.tabs.length > 1 && (
              <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-border -mx-4 px-4 sm:mx-0 sm:px-0">
                {seccion.tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => irA(seccion.id, tab.id)}
                    className={`relative px-4 py-2.5 text-[14px] font-medium transition-colors
                                ${tabActivo?.id === tab.id ? 'text-text-1' : 'text-text-3 hover:text-text-2'}`}
                  >
                    {t(tab.label)}
                    {tabActivo?.id === tab.id && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />}
                  </button>
                ))}
              </div>
            )}

            {/* Contenido — con red de seguridad: si una sección falla, se ve
                un error acotado y el sidebar sigue usable (no se cae toda la app). */}
            <div key={`${seccion?.id}-${tabActivo?.id}`} className="animate-[fadeUp_0.3s_cubic-bezier(0.16,1,0.3,1)_both]">
              <ErrorBoundary key={`eb-${seccion?.id}-${tabActivo?.id}`} compact>
                {/* Un co-dueño manda igual: las pantallas de dentro reciben
                    `soyOwner` en true. Lo que NO recibe es `onEliminar` —ver
                    abajo—, porque borrar el evento se queda en quien lo creó y
                    el servidor lo rechazaría igual. Enseñar un botón que
                    devuelve 403 es peor que no enseñarlo. */}
                <Contenido seccion={seccion} tab={tabActivo} evento={evento} soyOwner={mandaTodo} reload={reload}
                  miRolId={miRolId} miUserId={usuario?.id || null}
                  permisos={permisos}
                  /* Ya vienen decididos: un atajo que abre un 403 es peor que
                     no ofrecerlo. `onEliminar` lo hacía así desde siempre;
                     estos dos iban sueltos y los tapaba un `soyOwner` dentro
                     del Resumen, que escondía «Redactar anuncio» a quien tiene
                     `publicar_anuncios`. */
                  onAnuncio={puedeVer('publicar_anuncios', mandaTodo, permisos) ? () => setBroadcastOpen(true) : null}
                  onEditar={puedeVer('editar_evento', mandaTodo, permisos) ? () => navigate(`/eventos/${evento.id}/editar`) : null}
                  onEliminar={soyOwner ? eliminar : null}
                  anunciosVersion={anunciosVersion} />
              </ErrorBoundary>
            </div>
          </div>
        </main>
      </div>

      {broadcastOpen && (
        <BroadcastModal
          evento={evento}
          onClose={() => setBroadcastOpen(false)}
          onEnviado={() => setAnunciosVersion(v => v + 1)}
        />
      )}
    </div>
  );
}

/* `anunciosVersion` viaja como prop y no como variable suelta: es estado del
   componente de arriba, y aquí dentro no existía. Al abrir Comunicación →
   Anuncios se lanzaba un ReferenceError y la pestaña no se pintaba. */
function Contenido({ seccion, tab, evento, soyOwner, reload, permisos, onAnuncio, onEditar, onEliminar, anunciosVersion, miRolId, miUserId }) {
  const { t } = useI18n();
  if (!seccion || !tab) return null;
  if (tab.placeholder) return <PlaceholderTab title={t(tab.placeholder[0])} desc={t(tab.placeholder[1])} icon="spark" />;

  const k = `${seccion.id}/${tab.id}`;
  switch (k) {
    case 'resumen/general'          : return <ResumenSection evento={evento} soyOwner={soyOwner} reload={reload} onEditar={onEditar} onAnuncio={onAnuncio} onEliminar={onEliminar} />;
    case 'pagina/landing'       : return <PaginaPublicaTab evento={evento} />;
    case 'pagina/publicacion'   : return <PublicacionSection evento={evento} reload={reload} />;
    case 'pagina/formularios'   : return <FormularioTab evento={evento} />;
    case 'comercial/checkout'   : return <CheckoutSection evento={evento} />;
    case 'pagina/seo'           : return <SeoSection evento={evento} />;
    case 'mensajes/emails'        : return <EmailsSection evento={evento} reload={reload} />;
    case 'pagina/whitelabel'    : return <WhiteLabelSection evento={evento} reload={reload} />;
    case 'equipo/equipo'      : return <EquipoTab evento={evento} />;
    /* La pestaña ya dejaba entrar con `editar_evento` y el servidor pide
       exactamente eso: el muro de dentro no lo pedia nadie. */
    case 'equipo/vacantes'    : return <VacantesTab evento={evento} soyOwner={soyOwner}
                                  puedeGestionar={puedeVer('editar_evento', soyOwner, permisos)} />;
    /* Repartir el trabajo se concede: 'gestionar_tareas' desde la 0123, y
       'editar_evento' porque los roles que ya existen lo tienen y hacian esto
       antes de que fuera un permiso. */
    case 'equipo/tareas'      : return <TareasTab evento={evento}
                                  puedeAsignar={puedeVer('gestionar_tareas', soyOwner, permisos)
                                             || puedeVer('editar_evento', soyOwner, permisos)} />;
    /* Todo el equipo entra —cualquiera puede mandar una sugerencia— pero
       gestionarlas pide permiso: aquí se edita la ficha de otra persona. La
       pantalla se lo pasa para no ofrecer botones que el servidor va a
       rechazar, que es peor que no ofrecerlos. */
    case 'equipo/solicitudes' : return <SolicitudesTab evento={evento}
                                         puedeAtender={puedeVer('gestionar_solicitudes', soyOwner, permisos)} />;
    /* La pestana se abre con `ver_documentos` —que la 0122 dio a TODOS los
       roles, porque antes no pedia nada— pero subir o quitar un documento
       guarda `page_json`, y eso pide `editar_evento`. Sin separarlo, cualquiera
       del equipo veia el boton de subir y el servidor le devolvia 403 despues
       de elegir el archivo. */
    case 'equipo/documentos'  : return <DocumentosSection evento={evento}
                                  /* `gestionar_documentos` también: el servidor
                                     se lo acepta —`LLAVES_ESTRECHAS` le abre la
                                     clave `documentos`— y pidiendo sólo
                                     `editar_evento` el permiso fino de la 0124
                                     dejaba la zona de subir escondida. */
                                  puedeEditar={puedeVer('editar_evento', soyOwner, permisos)
                                    || puedeVer('gestionar_documentos', soyOwner, permisos)} />;
    case 'resumen/reporte'     : return <ReporteTab evento={evento} />;

    /* Espacio del evento: las cuatro vistas de lo mismo. */
    case 'actividades/calendario'   : return <AgendaTab evento={evento} recargarEvento={reload} />;
    case 'actividades/speakers'     : return <AgendaTab evento={evento} vistaFija="speakers" recargarEvento={reload} />;
    case 'actividades/torneos'          : return <TorneoTab evento={evento} soyOwner={soyOwner} />;
    /* La rueda la operan los mismos permisos que la aceptan en el servidor
       (`PERMS_EXPOSITORES`), no la propiedad del evento. */
    case 'actividades/networking'       : return <NetworkingTab evento={evento} soyOwner={soyOwner}
                                            puedeGestionar={puedeVer('gestionar_expositores', soyOwner, permisos)
                                                         || puedeVer('editar_evento', soyOwner, permisos)} />;
    case 'zonas/mapa'             : return <MapaSection evento={evento} />;
    case 'zonas/accesos'          : return <AccesosSection evento={evento} />;
    case 'actividades/ranking'          : return <RankingTab evento={evento} />;
    case 'comercial/boletas'        : return <TicketsTab evento={evento} />;
    case 'comercial/derechos'       : return <DerechosTab evento={evento} />;
    case 'comercial/plano'          : return <PlanoTab evento={evento} recargarEvento={reload} />;
    case 'comercial/pagos'          : return <PagosSection evento={evento} reload={reload} />;
    case 'comercial/dinero'         : return <DineroSection evento={evento} />;
    case 'resumen/analytics'      : return <AnalyticsTab evento={evento} />;
    case 'comercial/promociones'    : return <PromocionesSection evento={evento} />;
    case 'comercial/facturacion'    : return <FacturacionSection evento={evento} />;
    /* Borrar boletas va aparte de atender: la pantalla lo recibe para no
       ofrecer un botón que el servidor va a rechazar, que es peor que no
       ofrecerlo. Quien manda sigue siendo la ruta. */
    case 'asistentes/clientes'      : return <ClientesTab evento={evento}
                                        puedeBorrar={puedeVer('borrar_boletas', soyOwner, permisos)} />;
    case 'asistentes/checkin'       : return <CheckinTab evento={evento} miRolId={miRolId} miUserId={miUserId} permisos={permisos} soyOwner={soyOwner} />;
    case 'asistentes/acreditados'   : return <AcreditadosTab evento={evento} />;
    /* Esta pantalla toca tres cosas con tres permisos distintos (la zona, la
       agenda y los stands), así que recibe la lista y decide ella: la regla de
       cada acción vive junto a la acción. */
    case 'zonas/zonas'            : return <ZonasSection evento={evento} soyOwner={soyOwner} permisos={permisos} reload={reload} />;
    /* Limpiar un aforo iba contra `soyOwner`, o sea que quien lleva la
       logistica veia el numero y no podia ponerlo a cero al terminar una
       charla: tenia que llamar a quien creo el evento. Ahora va por permiso
       —el de las puertas y las zonas, o el de atender—, igual que el servidor.
       Se pasan las dos cosas: la pantalla se ve, y el boton depende. */
    case 'zonas/aforo'            : return <AforoSection evento={evento} soyOwner={soyOwner}
                                      puedeLimpiar={puedeVer('gestionar_accesos', soyOwner, permisos)
                                                 || puedeVer('gestionar_clientes', soyOwner, permisos)} />;
    /* Dos poderes: llevar el directorio de stands es trabajo de cada dia
       (`gestionar_expositores`); cambiar cuanto vale un sello o que puntua es
       una decision del evento (`editar_evento`). El servidor los separa asi. */
    case 'zonas/stands'           : return <StandsTab evento={evento} soyOwner={soyOwner}
                                     puedeStands={puedeVer('gestionar_expositores', soyOwner, permisos)
                                               || puedeVer('editar_evento', soyOwner, permisos)}
                                     puedeConfigurar={puedeVer('editar_evento', soyOwner, permisos)} />;
    /* Las dos fusiones. Cada una comprueba dentro el permiso de cada vista:
       juntarlas sin eso habría dado a quien escanea el diseñador del carné,
       y a quien lleva clientes la lista de espera del dueño. */
    case 'asistentes/acreditacion'  : return <AcreditacionSection evento={evento} soyOwner={soyOwner} permisos={permisos} />;
    case 'asistentes/previos'       : return <PreviosSection evento={evento} soyOwner={soyOwner} permisos={permisos} />;
    case 'mensajes/chat'        : return <ChatTab evento={evento} />;
    case 'mensajes/anuncios'    : return <AnunciosSection evento={evento} onAnuncio={onAnuncio} recargar={anunciosVersion} />;
    case 'configuracion/general'    : return <ConfigGeneral evento={evento} reload={reload} />;
    case 'configuracion/automatizaciones': return <AutomatizacionesSection evento={evento} />;
    case 'configuracion/integraciones': return <IntegracionesSection />;
    default: return <PlaceholderTab title={t(tab.label)} desc={t('Módulo en construcción dentro del rework.')} icon="spark" />;
  }
}

function ConfigGeneral({ evento, reload }) {
  const { success, error: toastErr } = useToast();
  const [esPlantilla, setEsPlantilla] = useState(Boolean(evento.page_json?.plantilla));
  const [guardando, setGuardando] = useState(false);

  const togglePlantilla = async () => {
    const nuevo = !esPlantilla;
    setGuardando(true);
    try {
      await eventosApi.update(evento.id, { page_json: { plantilla: nuevo } });
      setEsPlantilla(nuevo);
      success(nuevo ? 'Marcado como plantilla. Aparecerá al crear un evento nuevo.' : 'Quitado de plantillas.');
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
    finally { setGuardando(false); }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="card">
        <div className="card-header"><h3 className="text-base font-semibold text-text-1">Información del evento</h3></div>
        <div className="card-body space-y-3 text-sm">
          <Fila k="Nombre"    v={evento.titulo} />
          <Fila k="Slug"      v={`/explorar/${evento.slug}`} mono />
          <Fila k="Estado"    v={<EstadoBadge estado={evento.estado} />} />
          <Fila k="Zona horaria" v={evento.timezone || 'America/Bogota'} />
        </div>
        <div className="card-body border-t border-border flex flex-wrap gap-2">
          <Link to={`/eventos/${evento.id}/editar`} className="btn-secondary btn-sm">Editar información completa</Link>
          <button onClick={togglePlantilla} disabled={guardando} className={`btn-sm ${esPlantilla ? 'btn-secondary' : 'btn-ghost'}`}>
            {guardando ? 'Guardando…' : esPlantilla ? '✓ Es plantilla — quitar' : 'Usar como plantilla'}
          </button>
        </div>
      </div>
      <p className="text-xs text-text-3">Al marcarlo como plantilla, este evento aparece al crear uno nuevo para reutilizar su configuración (landing, marca, checkout, SEO y boletas) — sin copiar asistentes ni ventas.</p>
      <RuedaDelEvento evento={evento} reload={reload} />
    </div>
  );
}
function Fila({ k, v, mono }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-text-3">{k}</span>
      <span className={`text-text-1 text-right ${mono ? 'font-mono text-xs' : ''}`}>{v}</span>
    </div>
  );
}

/* ── Icons ── */
function HomeIcon({ className }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>; }
function SparkIcon({ className }) { return <svg className={className} fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l1.9 5.7L19.6 9.6l-5.7 1.9L12 17.2l-1.9-5.7L4.4 9.6l5.7-1.9L12 2zm7 12l.95 2.85L22.8 17.8l-2.85.95L19 21.6l-.95-2.85-2.85-.95 2.85-.95L19 14z"/></svg>; }
function PinIcon({ className }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>; }
function UsersIcon({ className }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>; }
function WalletIcon({ className }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>; }
function TicketIcon({ className }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>; }
function TrophyIcon({ className }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8m-4-4v4m7-13a3 3 0 003-3V3H6v2a3 3 0 003 3m6 0a6 6 0 11-6 0m9-3h2a2 2 0 01-2 2m-13-2H3a2 2 0 002 2" /></svg>; }
function ChatIcon({ className }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>; }
function CogIcon({ className }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>; }
function EyeIcon({ className }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>; }

/* El interruptor de la rueda de negocios.
 *
 * Vive AQUÍ y no dentro de la pestaña de la rueda por una razón tonta y
 * decisiva: con la rueda apagada esa pestaña no existe, así que un interruptor
 * dentro de ella sólo sabría apagarla.
 *
 * Hasta la 0113 esto lo decidía la categoría del evento, y la lista estaba
 * escrita dos veces —servidor y panel—. Una cámara de comercio que organiza una
 * rueda de agroindustria o de turismo no tenía forma de montarla: esas
 * categorías ni siquiera existen en el catálogo, y su evento caía en «Otros».
 */
function RuedaDelEvento({ evento, reload }) {
  const { success, error: toastErr } = useToast();
  const [activa, setActiva] = useState(ruedaEncendida(evento));
  const [tope, setTope] = useState(
    evento.networking_tope_por_empresa == null ? '' : String(evento.networking_tope_por_empresa),
  );
  const [guardando, setGuardando] = useState(false);

  /* Devuelve si se guardó. No lanza: quien llama necesita saberlo para
     deshacer lo que ya pintó, y una excepción obligaba a un `catch` vacío en
     cada sitio —que es justo la forma de tragarse un error sin decir nada. */
  const guardar = async (cambios, aviso) => {
    setGuardando(true);
    try {
      await eventosApi.update(evento.id, cambios);
      success(aviso);
      /* Se recarga el evento: de esto depende que la pestaña aparezca o
         desaparezca del menú, y sin recargar habría que salir y volver a
         entrar para verlo — que es justo cuando uno cree que no se guardó. */
      reload?.();
      return true;
    } catch (e) {
      toastErr(e.response?.data?.error || e.message);
      return false;
    } finally { setGuardando(false); }
  };

  const cambiarInterruptor = async () => {
    const nuevo = !activa;
    /* Se pinta ya —es un interruptor, no un formulario— y se devuelve a su
       sitio si el guardado no cuajó: dejarlo puesto diría que hay rueda donde
       el servidor dice que no. */
    setActiva(nuevo);
    const ok = await guardar({ networking_activo: nuevo },
      nuevo ? 'Rueda de negocios activada. Ya aparece en Actividades.' : 'Rueda de negocios desactivada.');
    if (!ok) setActiva(!nuevo);
  };

  const guardarTope = async () => {
    const n = topeValido(tope);
    if (n === undefined) {
      toastErr(`El tope tiene que ser un número entre 1 y ${TOPE_MAX}. Déjalo vacío para no poner tope.`);
      return;
    }
    await guardar({ networking_tope_por_empresa: n },
      n ? `Máximo ${n} cita${n === 1 ? '' : 's'} por participante.` : 'Sin tope de citas.');
  };

  return (
    <div className="card">
      <div className="card-header"><h3 className="text-base font-semibold text-text-1">Rueda de negocios</h3></div>
      <div className="card-body space-y-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={activa} onChange={cambiarInterruptor} disabled={guardando}
            className="mt-0.5 w-4 h-4 accent-current text-primary" />
          <span>
            <span className="text-sm text-text-1 block">Este evento tiene rueda de negocios</span>
            <span className="text-xs text-text-3 block leading-relaxed">
              Añade «Rueda» en Actividades: mesas, franjas de reunión y agenda de citas.
              Sirve para cualquier tipo de evento — agroindustria, turismo, salud— no sólo para los de negocios.
            </span>
          </span>
        </label>

        {activa && (
          <div className="pt-3 border-t border-border">
            <label className="text-sm text-text-1 block">Máximo de citas por participante</label>
            <p className="text-xs text-text-3 leading-relaxed mt-0.5">
              Sin esto, una empresa puede llevarse quince citas y dejar a otras sin ninguna.
              Déjalo vacío para no poner tope. Las canceladas no cuentan.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="number" min="1" max={TOPE_MAX} value={tope} placeholder="Sin tope"
                onChange={(e) => setTope(e.target.value)}
                className="input w-32" disabled={guardando}
              />
              <button onClick={guardarTope} disabled={guardando} className="btn-secondary btn-sm">
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
