import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { eventosApi } from '../../api/eventos.js';
import { BLOCKS } from '../events/editor/blocks.jsx';
import { BrandingProvider } from '../../components/public/Branding.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import CanvasPublico from '../events/editor/canvas/CanvasPublico.jsx';
import TorneoPublicoPage from './TorneoPublicoPage.jsx';
import AgendaPublicaPage from './AgendaPublicaPage.jsx';
import { TarjetaTorneo } from './TorneosResumenPage.jsx';
import { TablaRanking } from './RankingPublicoPage.jsx';
import { EMBED_ALIAS, EMBED_SIN_CONFIG, avisarAlAnfitrion, estaIncrustado } from '../../lib/embed.js';
import { ReservaModal, ConfirmacionModal } from './EventoPublicoPage.jsx';
import RuedaInscripcionPage from './RuedaInscripcionPage.jsx';

/* Secciones que no son bloques de la landing sino páginas propias del evento
   (llaves del torneo, agenda). También se pueden incrustar: leen el :slug de
   la misma ruta, así que funcionan tal cual.

   Las dos últimas usan una versión sin cabecera ni enlace de vuelta: dentro
   de la web de otro, un "← Volver a explorar" saca al visitante del sitio que
   estaba mirando. */
/* La tipografía que manda la web anfitriona para que la sección incrustada no
   cante como "software de fuera". Sólo se acepta una lista de font-family de
   verdad: letras, dígitos, espacios, comas, comillas, guiones y puntos.
   Cualquier otro carácter podría cerrar la regla CSS e inyectar estilos, así
   que se descarta la cadena entera. */
function fuenteSegura(v) {
  if (!v || typeof v !== 'string') return '';
  const limpia = v.trim().slice(0, 240);
  return /^[\w\s,."'-]+$/.test(limpia) ? limpia : '';
}

const ESPECIALES = {
  /* `registro` no es una sección de la landing: es el destino del botón que se
     incrusta en la web de otro. Sale por aquí para heredar de EmbedPage el
     tema, el branding, el fondo transparente y el aviso de alto. */
  registro:  RegistroEmbed,
  torneo:    TorneoPublicoPage,
  llaves:    TorneoPublicoPage,
  bracket:   TorneoPublicoPage,
  agenda:    AgendaPublicaPage,
  programa:  AgendaPublicaPage,
  espacio:   AgendaPublicaPage,
  torneos:   TorneosEmbed,
  campeones: TorneosEmbed,
  ranking:   RankingEmbed,
  /* Inscripción a la rueda con el código de la boleta, y la agenda propia. */
  'rueda-inscripcion': ({ evento }) => <RuedaInscripcionPage slug={evento.slug} />,
};

/* ──────────────────────────────────────────────────────────────────
   iFrame · /embed/:slug/:seccion
   Renderiza UNA sección de la landing, sin chrome de la app, para que
   una empresa la incruste en su propia web. Mismo componente Preview
   que usan el editor y la página pública: si allí se ve bien, aquí
   también. La compra no se resuelve dentro del iframe ajeno — abre la
   página pública en una pestaña nueva.
   ────────────────────────────────────────────────────────────────── */

export default function EmbedPage() {
  const { slug, seccion } = useParams();
  const [params] = useSearchParams();
  const { setDark, setLight } = useTheme();
  const [evento, setEvento] = useState(null);
  /* cargando · ok · no_existe · sin_conexion
   *
   * Los dos últimos eran uno solo —`error`— y por eso el iframe de una web en
   * producción decía «No se encontró el evento» cuando el evento existía
   * perfectamente y lo que había fallado era la petición. Quien lo lee da por
   * hecho que borraron el evento y llama al organizador. */
  const [estado, setEstado] = useState('cargando');
  /* Sube en cada reintento y vuelve a disparar la carga. Un `location.reload()`
     recargaría el iframe entero —y dentro de la web de otro eso es recargar un
     documento ajeno con su propio coste—; esto sólo repite la petición. */
  const [intento, setIntento] = useState(0);
  const rootRef = useRef(null);

  /* El registro ocurre AQUÍ dentro, no en una pestaña de GESTEK. Es lo que
     pidió el cliente y es lo correcto: quien está mirando la web del
     organizador no tiene por qué salir de ella para reservar. */
  const [reservaTipo, setReservaTipo] = useState(null);
  const [reservaOk,   setReservaOk]   = useState(null);

  const soloUnaBoleta = ((evento?.ticket_types || evento?.tipos_ticket || [])
    .filter(t => t.activo).length === 1);

  const tema  = params.get('tema')  || 'auto';
  const fondo = params.get('fondo') || 'transparente';
  const fid   = params.get('fid')   || '';
  /* A qué boleta lleva el botón que abrió esto, y de dónde vino.
     `boleta` acepta el id o el nombre: quien pega el botón a mano en su web
     escribe «vip» antes que un UUID, y rechazárselo sería exigirle que copie
     un identificador para algo que en su cabeza tiene nombre. */
  const boletaParam = (params.get('boleta') || '').trim();
  const origen      = (params.get('origen') || '').trim();

  /* La fuente de la web anfitriona. Puede venir en la URL (para Notion, Wix y
     demás bloques de "insertar web" que no ejecutan el script) o por
     postMessage (widget.js y el snippet de sección la mandan solos). */
  const fuenteParam = fuenteSegura(params.get('fuente') || '');
  const [fuenteHost, setFuenteHost] = useState('');
  const fuente = fuenteParam || fuenteHost;

  /* El tema de la web anfitriona, si nos lo cuenta (widget.js y el snippet de
     sección lo mandan con la tipografía). Ver el porqué justo abajo. */
  const [esquemaHost, setEsquemaHost] = useState(null);

  /* ── Tema: quién manda ───────────────────────────────────────────────────
   *
   * Se decide una vez, cooperando con ThemeProvider (no tocamos la clase del
   * <html> a mano, que la sobreescribiría al montar).
   *
   * El orden importa y estaba mal. Antes, con `tema=auto` —el valor por
   * omisión— mandaba `prefers-color-scheme`, o sea el sistema operativo de
   * QUIEN MIRA. Pero con `fondo=transparente` —también el valor por omisión, y
   * lo que pidió el cliente: «que se vea como parte de su página»— el fondo lo
   * pone la web anfitriona. Dos mitades decidiendo por separado el mismo
   * dibujo.
   *
   * Cuando no coinciden, el formulario queda ilegible. Llegó en una foto de
   * FESTECH: su web es azul noche, el visitante tenía el portátil en modo
   * claro, y el registro salió con la paleta clara encima del azul — el título
   * en #15171C sobre casi negro, invisible, y los campos en #E4DFD1, unos
   * recuadros color crema flotando. Nada falló: cada mitad hizo lo suyo.
   *
   * La regla ahora: **si el fondo lo pone la web anfitriona, el tema también.**
   *
   * ── Y cuando la web anfitriona no nos lo cuenta ──────────────────────────
   *
   * Pasa más de lo que parece. Lo cuenta el script del snippet, que se COPIA a
   * la página del cliente: quien pegó el suyo hace meses tiene la versión de
   * entonces, y arreglar el snippet no le llega. Comprobado en la página de
   * FESTECH, cuya copia además está retocada a mano — volver a pegarla les
   * costaría perder sus cambios. Y Notion, Wix y demás bloques de «insertar
   * web» no ejecutan script ninguno.
   *
   * Con el fondo transparente y sin nadie que nos diga nada, `prefers-color-
   * scheme` no es un valor por omisión: es un sorteo. El mismo formulario, en
   * la misma web, se ve distinto según el portátil de quien entra — y la mitad
   * de las veces ilegible. Lo que sí se sabe es de qué evento es esta sección,
   * y **la página pública de un evento es oscura siempre** (`PublicLayout` la
   * fuerza). Esta sección es un trozo de esa página: se ve como ella, que es
   * además como el organizador la previsualizó al generar el código.
   *
   * Quien la incruste en una web clara tiene la salida a un clic: «Tema →
   * Claro» en el mismo panel donde generó el código. Un ajuste que se elige
   * una vez es mejor que un sorteo por visitante. */
  useEffect(() => {
    /* Lo que eligió el organizador manda sobre todo lo demás. */
    if (tema === 'oscuro') { setDark(); return; }
    if (tema === 'claro')  { setLight(); return; }

    /* Si la web anfitriona nos contó su color, ese es el dato bueno — venga el
       fondo como venga.
     *
     * Aquí faltaba media regla, y se notaba justo en el sitio más usado. El
     * botón de registro abre su formulario con `fondo=solido`, así que caía al
     * `matchMedia` de abajo: el tema salía del SISTEMA OPERATIVO de quien
     * entra. El mismo formulario, en la misma web, claro en un portátil y
     * oscuro en el de al lado.
     *
     * Y lo peor no es que cambie: es que el dato correcto YA ESTABA AQUÍ.
     * `widget.js` mide el fondo real de la página anfitriona —subiendo por los
     * padres, con la luminancia de la WCAG— y lo manda en el mensaje `estilo`.
     * Llegaba, se guardaba en `esquemaHost`, y esta condición sólo lo miraba
     * con el fondo transparente. Se recibía y se tiraba.
     *
     * Que el fondo sea sólido no lo hace irrelevante: el recuadro sigue
     * estando DENTRO de su página, y verse como ella es justo el objetivo. */
    if (esquemaHost === 'claro') { setLight(); return; }
    if (esquemaHost === 'oscuro') { setDark(); return; }

    /* Sin nadie que nos lo cuente. Pasa más de lo que parece: el script se
       COPIA a la página del cliente, así que quien pegó el suyo hace meses
       tiene el de entonces —y Notion, Wix y demás bloques de «insertar web»
       no ejecutan script ninguno—.

       Dentro de un iframe, `prefers-color-scheme` no es un valor por omisión:
       es un sorteo por visitante. Lo que sí se sabe es de qué evento es esto,
       y la página pública de un evento es oscura siempre. Fuera del iframe
       —alguien abre la URL del embed a pelo— no hay anfitriona a la que
       parecerse, y ahí el sistema operativo sí es la mejor pista. */
    if (estaIncrustado()) { setDark(); return; }
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (mq?.matches) setDark(); else setLight();
  }, [tema, fondo, esquemaHost, setDark, setLight]);

  /* Fondo transparente: el color lo pone la web anfitriona. */
  useEffect(() => {
    if (fondo !== 'transparente') return;
    const html = document.documentElement, body = document.body;
    const prev = [html.style.background, body.style.background];
    html.style.background = 'transparent';
    body.style.background = 'transparent';
    return () => { html.style.background = prev[0]; body.style.background = prev[1]; };
  }, [fondo]);

  /* La web anfitriona puede pasar su tipografía: widget.js lo hace siempre, y
     el snippet de sección si se deja marcada la casilla. Se pide al montar por
     si el anfitrión ya estaba escuchando, y se escucha por si llega después. */
  useEffect(() => {
    const alMensaje = (e) => {
      const d = e.data;
      if (!d || typeof d !== 'object' || d.gestek !== 'estilo') return;
      if (d.fid && fid && d.fid !== fid) return;
      const f = fuenteSegura(d.fuente);
      if (f) setFuenteHost(f);
      /* Sólo los dos valores que existen: cualquier otra cosa deja el tema
         como estaba, que es mejor que darle la vuelta por un mensaje raro. */
      if (d.esquema === 'oscuro' || d.esquema === 'claro') setEsquemaHost(d.esquema);
    };
    window.addEventListener('message', alMensaje);
    try { window.parent?.postMessage({ gestek: 'pide-estilo', fid }, '*'); } catch { /* cross-origin */ }
    return () => window.removeEventListener('message', alMensaje);
  }, [fid]);

  /* Cualquier enlace de la sección (CTA, redes, "GESTEK" del footer) debe
     salir a una pestaña nueva: si navega dentro del iframe, el visitante
     se queda atrapado en un recuadro de la web ajena. */
  useEffect(() => {
    const base = document.createElement('base');
    base.target = '_blank';
    document.head.appendChild(base);
    return () => base.remove();
  }, []);

  useEffect(() => {
    let vivo = true;
    setEstado('cargando');
    /* Se pide la sección: el servidor recorta la landing y manda sólo este
       bloque. Antes llegaba entera y el filtro de abajo la reducía aquí — o
       sea que el resto de la página viajaba igual, dentro de la web de otro.
       El `useMemo` de abajo se queda: sigue haciendo falta para resolver el
       alias y para las secciones que se pintan con sus valores por defecto. */
    eventosApi.publicoBySlug(slug, seccion)
      .then(d => { if (vivo) { setEvento(d.evento); setEstado('ok'); } })
      .catch(e => {
        if (!vivo) return;
        /* Un 404 es el servidor diciendo que ese evento no está. Cualquier otra
           cosa —sin respuesta, un 500, un CORS rechazado, la red del móvil que
           se cayó— es que no pudimos preguntar, y eso se arregla reintentando.
           Tratarlas igual convierte un problema de dos segundos en una llamada
           al organizador. */
        /* `client.js` deja el status colgado del error; `response` puede no
           existir cuando ni siquiera hubo respuesta, que es justo el caso
           «no pudimos preguntar». */
        const status = e?.status ?? e?.response?.status;
        setEstado(status === 404 ? 'no_existe' : 'sin_conexion');
      });
    return () => { vivo = false; };
  }, [slug, seccion, intento]);

  /* Alto automático: el anfitrión escucha este postMessage y redimensiona
     el iframe. Sin esto quedaría cortado o con un hueco enorme debajo.

     El formulario de registro (`ReservaModal`/`ConfirmacionModal`) se monta
     aquí con `embebido`: sin fondo oscuro ni `position: fixed`, en el flujo
     normal del documento. Antes ModalShell era `fixed` -fuera del flujo, medía
     casi cero- y hacía falta pedir un alto fijo de 20000px mientras hubiera
     un modal abierto, para que el anfitrión no encogiera el iframe a nada. En
     flujo normal, el mismo ResizeObserver de siempre ya mide el modal como
     cualquier otro contenido: el truco del 20000 deja de hacer falta. */
  useEffect(() => {
    /* Nada mientras carga: si no, el anfitrión encoge el iframe a la altura
       del "Cargando…" y el contenido entra dando un salto feo. */
    if (estado === 'cargando') return;

    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let ultimo = 0;
    const avisar = () => {
      const alto = Math.ceil(el.getBoundingClientRect().height);
      if (!alto || Math.abs(alto - ultimo) < 2) return;
      ultimo = alto;
      try { window.parent?.postMessage({ gestek: 'alto', fid, alto }, '*'); } catch { /* cross-origin */ }
    };
    const ro = new ResizeObserver(avisar);
    ro.observe(el);
    avisar();
    return () => ro.disconnect();
  }, [fid, evento, estado]);

  /* Antes esto abría GESTEK en otra pestaña, y era justo lo que había que
     evitar: quien está en la web del organizador se encontraba de golpe en
     otra web para reservar. Ahora el formulario se abre aquí mismo.

     Lo que SÍ sigue saliendo es el pago, y sólo el pago: un checkout dentro de
     un iframe ajeno se rompe por las cookies de terceros, por el 3-D Secure
     —que se niega a cargarse enmarcado— y por la redirección de vuelta de la
     pasarela. De eso se encarga `irAPagar`, y para cuando ocurre la boleta ya
     está creada: no se pierde nada de lo escrito. */
  const abrirPaginaCompleta = useCallback(() => {
    window.open(`${window.location.origin}/explorar/${slug}?standalone=1`, '_blank', 'noopener,noreferrer');
  }, [slug]);

  const abrirCompra = useCallback((tipo) => {
    if (tipo?.id) { setReservaTipo(tipo); return; }
    /* Sin tipo de boleta no hay nada que rellenar: es un CTA suelto o una
       sección sin boletas, y ahí sí toca la página completa. */
    abrirPaginaCompleta();
  }, [abrirPaginaCompleta]);

  /* Ir directo a una boleta.
   *
   * Sin esto, un botón «Comprar VIP» en la web del organizador abría la lista
   * entera y la persona tenía que volver a elegir dentro de una ventana
   * pequeña — y con varias boletas no había forma de poner un botón por
   * boleta, que es justo para lo que se pegan en páginas distintas.
   *
   * Si la boleta ya no existe o se desactivó, NO se falla: se cae a la lista y
   * la persona sigue pudiendo registrarse. Un botón viejo en una web ajena no
   * puede convertirse en una puerta cerrada. */
  useEffect(() => {
    if (!boletaParam || !evento || reservaTipo) return;
    const tipos = (evento.ticket_types || evento.tipos_ticket || []).filter(t => t.activo);
    const buscada = String(boletaParam).toLowerCase();
    const t = tipos.find(x => String(x.id) === boletaParam)
      || tipos.find(x => String(x.nombre || '').trim().toLowerCase() === buscada);
    if (t) setReservaTipo(t);
    /* eslint-disable-next-line */
  }, [boletaParam, evento]);

  const Especial = ESPECIALES[seccion] || null;

  const bloque = useMemo(() => {
    if (!evento) return null;
    const pj = evento.page_json;
    const pages = pj?.pages?.length ? pj.pages
      : Array.isArray(pj?.blocks) ? [{ blocks: pj.blocks }]
      : [];
    const todos = pages.flatMap(p => p?.blocks || []).filter(Boolean);

    const porId = todos.find(b => b.id === seccion);
    if (porId) return porId;

    const tipo = EMBED_ALIAS[seccion] || seccion;
    const porTipo = todos.find(b => b.type === tipo && !b.data?.oculto);
    if (porTipo) return porTipo;

    /* La sección no está en la landing pero se alimenta del evento: la
       servimos igual, así el embed no depende de cómo esté armada.
       Con sus `defaults`, no con data vacía: si no, "Directorio de
       expositores" o "Mapa del evento" llegarían sin encabezado y quien la
       incrustó pensaría que está rota. */
    if (BLOCKS[tipo] && EMBED_SIN_CONFIG.includes(tipo)) {
      return { id: tipo, type: tipo, data: structuredClone(BLOCKS[tipo].defaults || {}) };
    }
    return null;
  }, [evento, seccion]);

  if (estado === 'cargando') {
    return <div ref={rootRef} className="p-6 text-center text-sm text-text-3">Cargando…</div>;
  }
  if (estado === 'sin_conexion') {
    return (
      <div ref={rootRef} className="p-8 text-center">
        <p className="text-sm text-text-1 font-medium">Tuvimos un problema de comunicación.</p>
        <p className="text-xs text-text-3 mt-1 leading-relaxed max-w-sm mx-auto">
          No pudimos cargar el formulario. Suele ser cosa de un momento.
        </p>
        <button
          onClick={() => setIntento(n => n + 1)}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border
                     text-sm text-text-1 hover:bg-surface-2 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
               aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round"
                  d="M4 4v5h5M20 20v-5h-5M20 9A8 8 0 006.3 6.3M4 15a8 8 0 0013.7 2.7" />
          </svg>
          Reintentar
        </button>
      </div>
    );
  }
  /* Y esto se queda para lo que de verdad significa: el servidor contestó que
     ese evento no está. */
  if (estado === 'no_existe' || !evento) {
    return <div ref={rootRef} className="p-6 text-center text-sm text-text-3">No se encontró el evento.</div>;
  }
  if (!Especial && (!bloque || (bloque.type !== 'lienzo' && !BLOCKS[bloque.type]))) {
    return <div ref={rootRef} className="p-6 text-center text-sm text-text-3">Esta sección ya no está disponible.</div>;
  }

  /* Mismo White Label que la página pública (page_json.branding pisa al organizador). */
  const brandingEvento = evento.page_json?.branding || {};
  const organizador = {
    ...(evento.organizador || {}),
    branding: { ...((evento.organizador || {}).branding || {}), ...brandingEvento },
    ...(brandingEvento.logo_url ? { empresa_logo_url: brandingEvento.logo_url } : {}),
  };

  const Preview = (Especial || bloque.type === 'lienzo') ? null : BLOCKS[bloque.type].Preview;

  /* Mientras se está registrando —formulario o confirmación—, lo de debajo
     sobra: ya eligió. */
  const registroAbierto = !!(reservaTipo || reservaOk);

  return (
    <BrandingProvider organizador={organizador}>
      <div ref={rootRef} data-gestek-embed className="p-4">
        {fuente && (
          /* Se pisan sólo el contenedor y las dos utilidades de fuente de
             Tailwind (`font-sans` en el cuerpo, `font-display` en los títulos).
             `font-mono` se deja intacta: el código de la boleta tiene que
             seguir siendo monoespaciado. */
          <style>{`
            [data-gestek-embed] { font-family: ${fuente} !important; }
            [data-gestek-embed] .font-sans,
            [data-gestek-embed] .font-display { font-family: ${fuente} !important; }
          `}</style>
        )}
        {/* M4 · «BOLETAS DISPONIBLES · Reservar» se quedaba debajo del
            formulario y seguía ahí después de confirmar, delante de alguien que
            ya tenía su boleta. Embebido no hay fondo oscuro que lo tape —el
            modal va en el flujo del documento—, así que hay que apartarlo.

            `hidden` y no desmontar: `RegistroEmbed` lleva un pestillo en un
            `useRef` para abrir el formulario una sola vez cuando hay una única
            boleta. Desmontarlo reiniciaría ese pestillo y cerrar el formulario
            volvería a abrirlo, para siempre. */}
        <div hidden={registroAbierto}>
        {Especial ? (
          <Especial evento={evento} onReservar={abrirCompra} onWaitlist={abrirPaginaCompleta} />
        ) : bloque.type === 'lienzo' ? (
          <CanvasPublico
            canvas={bloque.data?.canvas}
            evento={evento}
            boletasRender={<BloqueBoletas evento={evento} onReservar={abrirCompra} onWaitlist={abrirPaginaCompleta} />}
          />
        ) : (
          <Preview
            data={bloque.data || {}}
            evento={evento}
            onReservar={abrirCompra}
            onWaitlist={abrirPaginaCompleta}
          />
        )}
        </div>
        {/* Sin "Eventos gestionados con GESTEK".

            Esto se incrusta en la web de otro. Ahí nuestra marca no pinta
            nada: el visitante está en la página del organizador y lo que ve
            tiene que ser suya. El footer propio del organizador sí se
            respeta, porque ése lo puso él. */}
        {organizador?.branding?.footer && (
          <p className="text-xs text-text-3 mt-4 text-center">{organizador.branding.footer}</p>
        )}

        {reservaTipo && (
          <ReservaModal
            tipo={reservaTipo}
            slug={slug}
            currency={evento.currency}
            evento={evento}
            /* Viaja con la compra: es lo que después contesta «este botón
               trajo 34 inscripciones». */
            origen={origen}
            onClose={() => {
              setReservaTipo(null);
              /* Con una sola boleta no hay a dónde volver: detrás del
                 formulario no queda nada que elegir, así que cerrar el
                 formulario es cerrar la ventana. Con varias, se vuelve a la
                 lista, que es lo que espera quien iba a comparar precios. */
              if (soloUnaBoleta) avisarAlAnfitrion('cerrar', {}, fid);
            }}
            onSuccess={(t) => { setReservaTipo(null); setReservaOk(t); }}
            embebido
          />
        )}
        {reservaOk && (
          <ConfirmacionModal
            ticket={reservaOk}
            evento={evento}
            slug={slug}
            checkout={evento.page_json?.checkout || {}}
            embebido
            onClose={() => {
              setReservaOk(null);
              /* Terminado el registro, la ventana del anfitrión se cierra sola:
                 dejarla abierta con la confirmación vacía detrás es raro. */
              avisarAlAnfitrion('listo', { codigo: reservaOk?.codigo }, fid);
            }}
          />
        )}
      </div>
    </BrandingProvider>
  );
}

/* ── Secciones propias del embed ──────────────────────────────────────
   Reutilizan el cuerpo de las páginas públicas (TarjetaTorneo, TablaRanking)
   sin la cabecera, el ancho máximo ni el enlace de vuelta, que dentro de un
   recuadro ajeno estorban o sacan al visitante del sitio. */

function TorneosEmbed() {
  const { slug } = useParams();
  const [torneos, setTorneos] = useState(undefined);

  useEffect(() => {
    let vivo = true;
    eventosApi.torneosResumen(slug)
      .then(d => { if (vivo) setTorneos(d.torneos || []); })
      .catch(() => { if (vivo) setTorneos([]); });
    return () => { vivo = false; };
  }, [slug]);

  if (torneos === undefined) return <p className="text-sm text-text-3 py-6 text-center">Cargando torneos…</p>;
  if (!torneos.length) return <p className="text-sm text-text-3 py-6 text-center">Este evento todavía no tiene torneos.</p>;
  return (
    <div className="space-y-4">
      {torneos.map(t => <TarjetaTorneo key={t.id} torneo={t} />)}
    </div>
  );
}

function RankingEmbed() {
  const { slug } = useParams();
  const [ranking, setRanking] = useState(undefined);

  useEffect(() => {
    let vivo = true;
    eventosApi.rankingPublico(slug)
      .then(d => { if (vivo) setRanking(d.ranking || []); })
      .catch(() => { if (vivo) setRanking([]); });
    return () => { vivo = false; };
  }, [slug]);

  if (ranking === undefined) return <p className="text-sm text-text-3 py-6 text-center">Cargando ranking…</p>;
  return <TablaRanking ranking={ranking} />;
}

/* El lienzo puede contener una pieza "boletas": se le pasa el mismo bloque
   de tickets que usa la página pública.
 *
 * `onWaitlist` NO puede ser `onReservar`, y lo era: quien veía un tipo agotado
 * y pulsaba «Anotarme en lista» abría el formulario de compra normal de ese
 * tipo agotado. Rellenaba todo para que el servidor lo rechazara al final —o
 * peor, para competir por un cupo que no existe.
 *
 * La lista de espera de verdad vive en la página completa (`WaitlistModal`),
 * así que aquí se hace lo que ya hacía el otro camino de este mismo archivo:
 * abrirla en una pestaña. Es lo honesto — dentro de un iframe ajeno no hay
 * sitio para un segundo modal, y la inscripción a la lista pide su propio
 * formulario. */
function BloqueBoletas({ evento, onReservar, onWaitlist }) {
  const B = BLOCKS.tickets;
  if (!B) return null;
  const P = B.Preview;
  return <P data={{}} evento={evento} onReservar={onReservar} onWaitlist={onWaitlist || onReservar} />;
}

/* ── El registro, que es a donde lleva el botón incrustado ─────────────────
 *
 * Una boleta: al formulario directo, que es lo que espera quien pulsó un botón
 * que dice "Registrarme". Varias: primero elige, porque el precio y lo que
 * incluye cada una es justo lo que decide.
 *
 * A partir de ahí no hay nada nuevo: son el mismo `ReservaModal` y el mismo
 * `ConfirmacionModal` de la página pública —con el formulario del evento, sus
 * términos, el captcha y los sub-eventos al final—, montados por EmbedPage.
 * Reescribirlos aquí habría sido tener dos registros que se separan al mes.
 */
function RegistroEmbed({ evento, onReservar, onWaitlist }) {
  const tipos = (evento?.ticket_types || evento?.tipos_ticket || []).filter(t => t.activo);

  /* Con una sola, se abre sola. El `useEffect` y no una llamada directa porque
     abrir un modal mientras se está pintando el padre es un aviso de React y,
     peor, se dispararía en cada render. */
  const abierto = useRef(false);
  useEffect(() => {
    /* Una sola vez. Sin el pestillo, cerrar el modal volvería a abrirlo y la
       ventana no se podría cerrar nunca. */
    if (abierto.current || tipos.length !== 1) return;
    abierto.current = true;
    onReservar?.(tipos[0]);
  }, [tipos, onReservar]);

  if (!tipos.length) {
    return <p className="text-sm text-text-3 py-8 text-center">Este evento todavía no tiene entradas a la venta.</p>;
  }
  if (tipos.length === 1) {
    return <p className="text-sm text-text-3 py-8 text-center">Abriendo el formulario…</p>;
  }
  return <BloqueBoletas evento={evento} onReservar={onReservar} onWaitlist={onWaitlist} />;
}
