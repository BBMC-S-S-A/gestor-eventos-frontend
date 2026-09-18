import { useEffect, useState, useRef } from 'react';
import TarjetaDeContacto from '../../components/public/TarjetaDeContacto.jsx';
import Icono from '../../components/ui/Iconos.jsx';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { eventosApi } from '../../api/eventos.js';
import { pagosApi } from '../../api/pagos.js';
import WalletCard, { walletConfig } from '../../components/public/WalletCard.jsx';
import EscarapelaImprimible, { ESTILOS_DE_IMPRESION } from '../../components/public/EscarapelaImprimible.jsx';
import Instrucciones from '../../components/public/Instrucciones.jsx';
import GLoader from '../../components/ui/GLoader.jsx';
import CampoFormulario, { primerFallo } from '../../components/ui/CampoFormulario.jsx';
import { googleCalendarUrl } from '../../lib/calendario.js';
import DescargarEntrada from '../../components/public/DescargarEntrada.jsx';
import Volver from '../../components/ui/Volver.jsx';
import { mensajePublico } from '../../lib/mensajeDeError.js';

/* Página pública /mi-ticket/:codigo
   Cualquiera con el código puede ver su QR. */

const ESTADO_INFO = {
  emitido    : { label: 'Apartada',     cls: 'bg-warning/10 text-warning border-warning/30' },
  pagado     : { label: 'Confirmada',   cls: 'bg-success/10 text-success border-success/30' },
  usado      : { label: 'Ya usada',     cls: 'bg-text-1/10 text-text-1 border-border-2' },
  reembolsado: { label: 'Reembolsada',  cls: 'bg-text-3/10 text-text-2 border-border' },
  invalido   : { label: 'Inválida',     cls: 'bg-danger/10 text-danger border-danger/30' },
};

export default function MiTicketPage() {
  const { codigo } = useParams();
  /* De dónde viene quien abre esto. La pasarela devuelve aquí con `?pago=` y
     hasta ahora no lo leía nadie: se volvía de pagar y la página no decía si
     había funcionado — que es justo lo único que se quiere saber en ese
     momento. */
  const [params] = useSearchParams();
  const volviendoDePagar = ['pendiente', 'wompi'].includes(params.get('pago'));
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [intento, setIntento] = useState(0);
  const [formularioListo, setFormularioListo] = useState(false);

  const cargar = () => {
    eventosApi.ticketByCode(codigo)
      .then(d => setTicket(d.ticket))
      /* Es la pantalla que alguien abre EN LA PUERTA, con el móvil, para
         enseñar su entrada. Decirle «tu código no existe» porque parpadeó el
         wifi la manda a la fila de incidencias con una boleta que está bien.
         El 404 sigue diciendo lo de siempre; lo demás, que se reintenta. */
      .catch(e => setError(mensajePublico(e, `El código ${codigo} no existe.`)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { setLoading(true); setError(null); cargar(); /* eslint-disable-next-line */ }, [codigo, intento]);

  if (loading) return (
    <section className="px-5 py-20 max-w-md mx-auto"><GLoader message="Buscando tu entrada..." /></section>
  );

  if (error || !ticket) return (
    <section className="px-5 py-20 max-w-md mx-auto text-center animate-[fadeUp_0.4s_ease_both]">
      <p className="text-xs uppercase tracking-widest text-danger mb-3">
        {error?.reintentable ? 'No pudimos buscarla' : 'Boleta no encontrada'}
      </p>
      <h1 className="text-2xl font-bold font-display text-text-1 mb-3">
        {error?.texto || <>El código <span className="font-mono">{codigo}</span> no existe.</>}
      </h1>
      {/* Y la instrucción que toque. Mandar a revisar el código cuando lo que
          falló fue la red es mandar a buscar donde no está — y en una puerta,
          con gente detrás, eso son varios minutos de nada. */}
      {error?.reintentable ? (
        <button onClick={() => setIntento(n => n + 1)}
          className="mb-6 inline-flex items-center gap-2 px-5 py-3 rounded-full border border-border
                     text-sm text-text-1 hover:bg-surface-2 transition-colors">
          Reintentar
        </button>
      ) : (
        <p className="text-sm text-text-2 mb-6">Revisa el código o pídele al organizador que te lo reenvíe.</p>
      )}
      <div><Volver a="/explorar" tono="chip">Explorar eventos</Volver></div>
    </section>
  );

  const camposForm = ticket.evento?.campos_formulario || [];
  /* Si el evento tiene preguntas personalizadas y esta boleta todavía no
     tiene respuestas guardadas (por ejemplo, justo después de transferirla
     a otra persona), pedimos completar el formulario antes de mostrar el QR. */
  const faltaFormulario = camposForm.length > 0 && !ticket.respuestas && !formularioListo;

  if (faltaFormulario) {
    return (
      <FormularioPendiente
        ticket={ticket}
        campos={camposForm}
        onListo={() => { setFormularioListo(true); cargar(); }}
      />
    );
  }

  const fecha = ticket.evento?.fecha_inicio
    ? new Date(ticket.evento.fecha_inicio).toLocaleString('es-CO', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  const estado = ESTADO_INFO[ticket.estado] || ESTADO_INFO.emitido;
  const qrValue = ticket.qr_token || ticket.codigo;

  /* Un pago que no llegó a completarse.
   *
   * `emitido` cubre dos cosas que en pantalla se ven idénticas: una reserva
   * gratuita —legítimamente «apartada»— y una compra que se abandonó o cuya
   * tarjeta fue rechazada. Las dos enseñaban el QR grande y, debajo,
   * «Guárdala en el móvil: tu QR sirve para entrar».
   *
   * La segunda persona llega a la puerta creyendo que tiene entrada. El
   * escáner la deja pasar con un aviso al staff —«boleta emitida sin pago
   * confirmado»—, o sea que enterarse depende de que alguien lea una línea
   * pequeña con una fila detrás. El peor sitio y el peor momento.
   *
   * El distintivo «Apartada» ya estaba, pero es un chip de doce píxeles junto
   * a un QR de doscientos: no compite. Aquí se dice de frente, arriba, y con
   * lo que hay que hacer.
   *
   * Sólo cuando la boleta COSTABA dinero: una reserva gratis apartada está
   * perfectamente bien y no hay nada que avisar. */
  const costaba = Number(ticket.tipo?.precio) > 0;
  const sinPagar = ticket.estado === 'emitido' && costaba && !Number(ticket.precio_pagado);
  /* Acaba de volver de pagar y todavía no ha llegado la confirmación.
     NO es lo mismo que un pago abandonado, y decirle «tu pago no se completó»
     a quien acaba de pagar por PSE —que tarda minutos, a veces horas— sería
     asustarla por algo que va bien. Se distingue por de dónde viene. */
  const confirmando = sinPagar && volviendoDePagar;
  const pagoSinTerminar = sinPagar && !volviendoDePagar;

  return (
    <section className="px-5 py-12 max-w-md mx-auto animate-[fadeUp_0.4s_ease_both]">
      {confirmando && (
        <div className="mb-6 rounded-2xl border-2 border-primary/40 bg-primary/10 px-4 py-3.5">
          <p className="text-sm text-text-1 font-semibold">Estamos confirmando tu pago.</p>
          <p className="text-xs text-text-2 mt-1 leading-relaxed">
            Puede tardar unos minutos —con PSE o transferencia, a veces más—. No hace falta
            que pagues otra vez ni que hagas nada: en cuanto el banco confirme, tu entrada
            queda lista y te llega el correo.
          </p>
          <button onClick={() => { setError(null); setIntento(n => n + 1); }}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-border
                       text-sm text-text-1 hover:bg-surface-2 transition-colors">
            Comprobar de nuevo
          </button>
        </div>
      )}

      {pagoSinTerminar && (
        <div className="mb-6 rounded-2xl border-2 border-warning/50 bg-warning/10 px-4 py-3.5">
          <p className="text-sm text-text-1 font-semibold">Tu pago no se completó.</p>
          <p className="text-xs text-text-2 mt-1 leading-relaxed">
            Esta entrada está apartada, no confirmada. Puedes terminar el pago de{' '}
            <strong className="text-text-1">esta misma entrada</strong> — si ya pagaste,
            escribe a quien organiza con el código de abajo antes de volver a intentarlo.
          </p>
          <BotonReanudar codigo={ticket.codigo} slug={ticket.evento?.slug} />
        </div>
      )}

      {/* Header con cover del evento */}
      {ticket.evento?.cover_url && (
        <div className="aspect-video rounded-3xl overflow-hidden border border-border mb-6">
          <img src={ticket.evento.cover_url} alt={ticket.evento.titulo} className="w-full h-full object-cover" />
        </div>
      )}

      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-text-3 font-semibold mb-2">Tu entrada</p>
        <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-text-1 mb-2">{ticket.evento?.titulo}</h1>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${estado.cls}`}>
          {estado.label}
        </span>
      </div>

      {/* Si la boleta trae un equipo de torneo, el capitán lo completa por aquí.

          Sin este enlace, el equipo se queda con lo único que el trigger sabía
          al crearlo —el nombre de quien compró— y los datos que el torneo pide
          acaban llegando por WhatsApp a alguien del staff. */}
      {ticket.tipo?.crea === 'equipo' && (
        <Link to={`/equipo/${ticket.codigo}`}
          className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 hover:bg-accent/10 transition-colors">
          <span className="text-sm text-text-1">
            <Icono nombre="trofeo" className="w-4 h-4 inline-block align-[-3px]" />{' '}
            <strong>Tienes un equipo.</strong> Completa sus datos y mira cuándo juegas.
          </span>
          <span className="text-accent-light text-sm font-medium whitespace-nowrap">Abrir</span>
        </Link>
      )}

      {/* El otro uso del mismo QR: presentarse. Abierto desde el registro con
          los datos de contacto que eligió el organizador, y con la salida a un
          toque. La lista la resuelve el servidor (`tarjeta_contacto`). */}
      <TarjetaDeContacto
        codigo={ticket.codigo}
        campos={ticket.tarjeta_contacto?.campos || []}
        ocultoInicial={ticket.tarjeta_contacto?.oculto}
      />

      {/* Si es una boleta de stand, la empresa edita su ficha de expositor */}
      {ticket.tipo?.es_expositor && (
        <Link to={`/expositor/${ticket.codigo}`}
          className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 hover:bg-accent/10 transition-colors">
          <span className="text-sm text-text-1"><Icono nombre="empresa" className="w-4 h-4 inline-block align-[-3px]" /> <strong>Tienes un stand.</strong> Edita tu ficha de expositor.</span>
          <span className="text-accent-light text-sm font-medium whitespace-nowrap">Editar</span>
        </Link>
      )}

      {/* Lo que hay que hacer antes del evento, ENCIMA de la tarjeta.
       *
       * Ésta es la pantalla que alguien abre desde el correo tres semanas
       * después, y es cuando de verdad se lee «dónde tengo que presentarme».
       * Antes eso sólo salía en el momento de registrarse, así que lo veía una
       * vez y con prisa.
       *
       * Las del tipo de boleta primero: son las específicas. Debajo, el mensaje
       * general del evento — y sólo si el organizador escribió uno, para no
       * repetir dos veces lo mismo cuando puso el mismo texto en los dos. */}
      <Instrucciones texto={ticket.tipo?.instrucciones} className="mt-6" />
      {ticket.evento?.page_json?.checkout?.confirmacion_texto?.trim()
        && ticket.evento.page_json.checkout.confirmacion_texto.trim() !== String(ticket.tipo?.instrucciones || '').trim()
        && <Instrucciones texto={ticket.evento.page_json.checkout.confirmacion_texto} className="mt-3" />}

      {/* Tarjeta wallet (diseño del organizador · gamificación) = escarapela digital */}
      <div className="mt-6">
        <WalletCard
          design={walletConfig(ticket.evento?.page_json, { publico: 'asistentes', tipo: ticket.tipo?.nombre })}
          evento={ticket.evento || {}} ticket={ticket} puntos={ticket.puntos ?? null} />
        <div className="mt-3 flex items-center justify-center gap-4 flex-wrap">
          <button onClick={() => window.print()}
            className="inline-flex items-center gap-2 text-sm text-text-2 hover:text-text-1 transition-colors">
            <Icono nombre="imprimir" className="w-4 h-4" />Imprimir mi escarapela
          </button>
          {/* Eran tres acciones sueltas para el mismo objeto —«Descargar mi
              tarjeta» y «Descargar boleta (PDF)»—, que es justo lo que M6 quitó
              de la confirmación del registro y no llegó aquí. Y aquí es donde
              más se usa: quien vuelve por el enlace el día del evento. */}
          <DescargarEntrada
            evento={ticket.evento || {}} ticket={ticket} qrValue={qrValue}
            respuestas={ticket.respuestas} campos={ticket.evento?.campos_formulario}
            etiqueta="Descargar mi entrada"
            className="inline-flex items-center gap-2 text-sm text-text-2 hover:text-text-1 transition-colors disabled:opacity-60"
          />
        </div>
        <p className="text-[11px] text-text-3 text-center mt-1">
          {/* Sin prometer lo que no es: mientras no esté pagada, este QR
              todavía no da derecho a entrar. */}
          {sinPagar
            ? 'Este código es el de tu reserva. Todavía no da entrada.'
            : 'Guárdala en el móvil o imprímela: tu QR sirve para entrar y para los stands.'}
        </p>
      </div>

      {/* QR principal */}
      <div className="mt-8 flex flex-col items-center">
        <div className="bg-white rounded-3xl p-5 inline-block">
          <QRCodeSVG value={qrValue} size={220} level="M" includeMargin={false} />
        </div>
        <p className="font-mono text-2xl font-bold text-text-1 tabular-nums tracking-widest mt-4">{ticket.codigo}</p>
        {/* Aquí había un cuarto botón, «Descargar el QR como imagen». Con las
            otras tres arriba eran CUATRO acciones en la misma página para el
            mismo objeto. El QR suelto sigue estando —es lo que se reenvía por
            WhatsApp—, pero como un formato de «Descargar mi entrada», que es
            donde se busca. */}
      </div>

      {/* Pasaporte gamificado */}
      {ticket.pasaporte?.activo && <PasaporteCard p={ticket.pasaporte} />}

      {/* Movimientos de puntos — los stands Y todo lo demás, en una sola
          lista. Antes aquí sólo salían los escaneos de stand, así que quien
          entraba al evento o iba a un taller veía subir el número sin ninguna
          línea que lo explicara. */}
      <MovimientosPuntos ticket={ticket} />

      {/* Detalles */}
      <div className="mt-8 space-y-2.5">
        <Row label="Asistente" value={ticket.guest_nombre} />
        <Row label="Email" value={ticket.guest_email} />
        <Row label="Tipo de boleta" value={ticket.tipo?.nombre} />
        {fecha && <Row label="Fecha" value={fecha} />}
        {ticket.evento?.location_nombre && <Row label="Lugar" value={ticket.evento.location_nombre} />}
        {/* El enlace del evento en línea.
            `url_virtual` estaba en la base, la mandaba la página pública del
            evento, y no lo enseñaba nadie en toda la aplicación. Alguien
            compraba entrada a un evento en línea y no tenía por dónde entrar:
            la boleta le decía la fecha y el código, y nada más.
            Va aquí y no en la página pública porque el enlace es lo que se
            compra. Esta pantalla ya pide el código de la boleta, que es la
            misma credencial que el QR. */}
        {ticket.evento?.url_virtual && (
          <div className="flex items-start justify-between gap-4 py-1.5">
            <span className="text-xs uppercase tracking-wide text-text-3 flex-shrink-0">Se conecta en</span>
            <a href={ticket.evento.url_virtual} target="_blank" rel="noreferrer noopener"
               className="text-sm text-primary-light hover:underline text-right break-all min-w-0">
              {ticket.evento.url_virtual.replace(/^https?:\/\//, '')}
            </a>
          </div>
        )}
        {ticket.checked_in_at && (
          <Row label="Check-in" value={new Date(ticket.checked_in_at).toLocaleString('es-CO')} />
        )}
      </div>

      {ticket.evento?.fecha_inicio && (
        <div className="mt-6 no-print">
          <a href={googleCalendarUrl({ titulo: ticket.evento?.titulo, inicio: ticket.evento?.fecha_inicio, fin: ticket.evento?.fecha_fin, lugar: ticket.evento?.location_nombre })}
            target="_blank" rel="noreferrer noopener"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl border border-border bg-surface/60 text-sm font-medium text-text-1 hover:bg-surface-2 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            Añadir a Google Calendar
          </a>
        </div>
      )}

      {/* ── A qué está inscrito, en la misma boleta ─────────────────────────
       *
       * Dentro de un evento NO se emite una boleta por taller: sería un código
       * más por actividad, y quien llega a la puerta con tres QR no sabe cuál
       * enseñar — ni la persona de la puerta tampoco. La escarapela es una y
       * sirve para todo: el escáner del taller lee ESE mismo QR y encuentra la
       * inscripción.
       *
       * Lo que faltaba era decirlo. La inscripción existía en la base y no se
       * veía en ninguna parte, así que quien se apuntaba a dos talleres no
       * tenía forma de comprobar que había quedado, ni de saber a qué hora ni
       * dónde. Va aquí porque ésta es la pantalla que se mira antes de entrar.
       */}
      {(ticket.actividades || []).length > 0 && (
        <div className="mt-8">
          <p className="text-xs uppercase tracking-widest text-text-3 font-semibold mb-2">
            Tus actividades
          </p>
          <div className="rounded-2xl border border-border bg-surface/60 divide-y divide-border overflow-hidden">
            {ticket.actividades.map(a => (
              <div key={a.inscripcion_id} className="px-4 py-3 flex items-start gap-3">
                <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${a.asistio ? 'bg-success' : 'bg-primary'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-1">{a.titulo}</p>
                  <p className="text-[11px] text-text-3">
                    {a.inicio && new Date(a.inicio).toLocaleString('es-CO', {
                      weekday: 'short', day: 'numeric', month: 'short',
                      hour: '2-digit', minute: '2-digit',
                    })}
                    {a.ubicacion ? ` · ${a.ubicacion}` : ''}
                  </p>
                </div>
                {/* «Pedida» todavía puede caerse, y «ya entraste» cierra una
                    pregunta real en un evento de dos días. */}
                <span className="text-[10px] uppercase tracking-widest text-text-3 flex-shrink-0 mt-0.5">
                  {a.asistio ? 'Ya entraste' : a.estado === 'inscrito' ? 'Inscrito' : a.estado}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-text-3 mt-2 leading-relaxed">
            No hace falta otro código: en la puerta de cada actividad se escanea este mismo QR.
          </p>
        </div>
      )}

      {/* El momento natural para apuntarse a los talleres y torneos es éste:
          acaba de sacar la entrada y tiene la boleta delante. El código viaja
          en el enlace, así que al llegar a la agenda no hay que escribirlo —
          era el punto exacto donde se caía la inscripción a sub-eventos. */}
      <div className="mt-8 no-print">
        <Link to={`/explorar/${ticket.evento?.slug}/agenda?boleta=${encodeURIComponent(ticket.codigo)}`}
          className="flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 hover:bg-primary/10 transition-colors">
          <span className="text-sm text-text-1">
            <strong>Mira el programa</strong> y apúntate a los talleres y torneos.
          </span>
          <span className="text-primary-light text-sm font-medium whitespace-nowrap">Ver →</span>
        </Link>
      </div>

      <div className="mt-4 text-center no-print">
        <Link to={`/explorar/${ticket.evento?.slug}`} className="text-sm text-text-2 hover:text-text-1 transition-colors">
          Ver evento →
        </Link>
      </div>

      {/* Escarapela imprimible: oculta en pantalla, aparece SOLO al imprimir.
         Así el asistente imprime su propia credencial aunque el evento no las
         imprima centralizadamente. */}
      <EscarapelaImprimible ticket={ticket} qrValue={qrValue} />
      <style>{ESTILOS_DE_IMPRESION}</style>
    </section>
  );
}

/* Cómo se llama cada cosa que da puntos. La clave es `accion` de points_log;
   el texto es lo que se lee cuando no hay un detalle guardado —las filas
   anteriores a la migración 0082 no lo tienen—. */
const NOMBRE_ACCION = {
  asistencia          : 'Entrada al evento',
  participacion_sesion: 'Participación en un sub-evento',
  registro_operado    : 'Registraste a un asistente',
  checkin_operado     : 'Validaste una boleta',
  tarea_completada    : 'Tarea completada',
};

/* De qué es cada origen, para el icono. Los nombres son los de Iconos.jsx:
   `hecho` para una tarea cerrada y `entrada` para la boleta con la que entró. */
const ICONO_ORIGEN = { sesion: 'calendario', tarea: 'hecho', ticket: 'entrada' };

/* El historial de puntos, con las dos fuentes juntas.

   Los escaneos de stand viven en `ticket_interacciones` (cuelgan de la
   boleta) y el resto en `points_log` (cuelga de la cuenta). Son dos tablas
   por una razón real, pero para quien mira su saldo es una sola historia, y
   tenerla partida era justo lo que impedía responder de dónde salió cada
   punto. Se mezclan aquí y se ordenan por fecha. */
function MovimientosPuntos({ ticket }) {
  const stands = (Array.isArray(ticket.interacciones) ? ticket.interacciones : []).map(it => ({
    id: `i_${it.id}`,
    puntos: it.puntos || 0,
    negativo: it.tipo === 'negativo',
    titulo: it.motivo_texto || 'Registro en un stand',
    donde: it.lugar || null,
    icono: 'estrella',
    fecha: it.created_at,
  }));

  const actividad = (Array.isArray(ticket.actividad) ? ticket.actividad : []).map(a => ({
    id: `a_${a.id}`,
    puntos: a.puntos || 0,
    negativo: (a.puntos || 0) < 0,
    /* El detalle guardado manda sobre el nombre genérico: dice "Taller de
       robótica" en vez de "Participación en un sub-evento". */
    titulo: a.detalle || NOMBRE_ACCION[a.accion] || 'Actividad',
    donde: a.detalle && NOMBRE_ACCION[a.accion] ? NOMBRE_ACCION[a.accion] : null,
    icono: ICONO_ORIGEN[a.origen_tipo] || 'estrella',
    fecha: a.created_at,
  }));

  const todo = [...stands, ...actividad]
    .sort((x, y) => new Date(y.fecha) - new Date(x.fecha));

  if (!todo.length) return null;

  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-text-1">Tus puntos</h2>
        <span className="text-lg font-bold font-display tabular-nums text-text-1">{ticket.puntos ?? 0} pts</span>
      </div>
      <ul className="rounded-2xl border border-border bg-surface/40 divide-y divide-border overflow-hidden">
        {todo.map(m => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs flex-shrink-0 ${m.negativo ? 'bg-danger/15 text-danger' : 'bg-success/15 text-success'}`}>
              <Icono nombre={m.negativo ? 'aviso' : m.icono} className="w-3.5 h-3.5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-1 truncate">
                {m.titulo}
                {m.donde && <span className="text-text-3"> · {m.donde}</span>}
              </p>
              <p className="text-[11px] text-text-3">{new Date(m.fecha).toLocaleString('es-CO')}</p>
            </div>
            <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${m.negativo ? 'text-danger' : 'text-success'}`}>
              {m.puntos > 0 ? `+${m.puntos}` : m.puntos}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PasaporteCard({ p }) {
  const visitados = p.expositores_visitados || [];
  const meta = p.meta || Math.max(visitados.length, 1);
  const pct = Math.min(100, Math.round((p.visitados / meta) * 100));
  const vacios = Math.max(0, meta - visitados.length);

  return (
    <div className={`mt-8 rounded-3xl border p-5 ${p.completo ? 'border-success/40 bg-success/5' : 'border-border bg-surface/40'}`}>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold text-text-1">{p.titulo}</h2>
        <span className="text-sm font-bold font-display tabular-nums text-text-1">{p.visitados}/{meta}</span>
      </div>
      {p.descripcion && <p className="text-xs text-text-3 mb-3">{p.descripcion}</p>}

      <div className="h-2 rounded-full bg-surface-2 overflow-hidden mb-4">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: p.completo ? 'var(--success, #10B981)' : 'var(--brand-primary, #3B82F6)' }} />
      </div>

      <div className="flex flex-wrap gap-2">
        {visitados.map(e => (
          <div key={e.id} title={e.nombre} className="w-11 h-11 rounded-xl overflow-hidden border-2 border-success/50 flex-shrink-0">
            {e.logo_url
              ? <img src={e.logo_url} alt={e.nombre} className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-success/15 text-success flex items-center justify-center text-sm font-bold">{(e.nombre || '?').charAt(0).toUpperCase()}</div>}
          </div>
        ))}
        {Array.from({ length: vacios }).map((_, i) => (
          <div key={`v${i}`} className="w-11 h-11 rounded-xl border-2 border-dashed border-border flex items-center justify-center text-text-3 flex-shrink-0">?</div>
        ))}
      </div>

      {p.completo && (
        <div className="mt-4 rounded-2xl border border-success/30 bg-success/10 px-4 py-3">
          <p className="text-sm font-semibold text-text-1">¡Pasaporte completo!</p>
          {p.premio_texto && <p className="text-xs text-text-2 mt-0.5">{p.premio_texto}</p>}
        </div>
      )}
    </div>
  );
}


/* ─────────── Formulario pendiente (boleta transferida sin datos aún) ─────────── */
function FormularioPendiente({ ticket, campos, onListo }) {
  const [respuestas, setRespuestas] = useState({});
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState('');

  const setRespuesta = (id, value) => setRespuestas(r => ({ ...r, [id]: value }));

  const submit = async (e) => {
    e.preventDefault();
    /* Misma regla que el servidor. Aquí los campos ya vienen filtrados por el
       tipo de boleta de esta entrada, así que no hace falta pasarlo. */
    const fallo = primerFallo(campos, respuestas);
    if (fallo) { setErr(fallo); return; }
    setWorking(true); setErr('');
    try {
      await eventosApi.completarFormularioTicket(ticket.codigo, respuestas);
      onListo();
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="px-5 py-12 max-w-md mx-auto animate-[fadeUp_0.4s_ease_both]">
      {ticket.evento?.cover_url && (
        <div className="aspect-video rounded-3xl overflow-hidden border border-border mb-6">
          <img src={ticket.evento.cover_url} alt={ticket.evento.titulo} className="w-full h-full object-cover" />
        </div>
      )}

      <div className="text-center mb-6">
        <p className="text-xs uppercase tracking-widest text-primary-light font-semibold mb-2">¡Esta entrada es tuya ahora!</p>
        <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-text-1 mb-2">{ticket.evento?.titulo}</h1>
        <p className="text-sm text-text-2 leading-relaxed">
          Antes de mostrarte tu QR, completa estos datos que pide el organizador.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {err && <div className="px-4 py-3 rounded-2xl bg-danger/10 border border-danger/20 text-danger-light text-sm">{err}</div>}

        {campos.map(c => (
          <CampoFormulario key={c.id} campo={c} value={respuestas[c.id]} onChange={v => setRespuesta(c.id, v)} eventoId={ticket.evento?.id} />
        ))}

        <button type="submit" disabled={working}
          className="w-full py-3.5 rounded-2xl text-base font-semibold bg-text-1 text-bg hover:bg-white disabled:opacity-60 transition-all">
          {working ? 'Guardando...' : 'Ver mi entrada'}
        </button>
      </form>
    </section>
  );
}


function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className="rounded-2xl border border-border bg-surface/40 px-4 py-3 flex items-center justify-between gap-3">
      <span className="text-[10px] uppercase tracking-widest text-text-3 font-semibold">{label}</span>
      <span className="text-sm text-text-1 text-right truncate">{value}</span>
    </div>
  );
}

/* Terminar el pago de ESTA entrada.
 *
 * Antes este botón era un enlace a la página del evento, o sea a empezar otra
 * compra: salía una segunda boleta, la primera se quedaba sin pagar para
 * siempre, y quien organiza veía dos apuntes de la misma persona sin saber
 * cuál era cuál. Ahora el servidor retoma la misma boleta con la misma
 * referencia, así que el pago que llegue confirma la que ya existe.
 *
 * Si el servidor contesta que ya está pagada —porque la confirmación llegó
 * mientras la persona miraba esta pantalla— se recarga en vez de enseñar un
 * error: es la mejor noticia posible y no se puede dar como si fuera un fallo. */
function BotonReanudar({ codigo, slug }) {
  const [yendo, setYendo] = useState(false);
  const [err, setErr] = useState('');
  const enviando = useRef(false);

  const ir = async () => {
    if (enviando.current) return;
    enviando.current = true;
    setYendo(true); setErr('');
    try {
      const r = await pagosApi.reanudarPago(codigo);
      const url = r.checkout?.url || r.checkout?.init_point || r.checkout?.sandbox_init_point;
      if (!url) throw new Error('La pasarela no devolvió el enlace de pago.');
      window.location.assign(url);
    } catch (e) {
      if (e.response?.data?.ya_pagada) { window.location.reload(); return; }
      setErr(mensajePublico(e).texto);
    } finally { enviando.current = false; setYendo(false); }
  };

  return (
    <>
      <button onClick={ir} disabled={yendo}
        className="inline-block mt-3 px-4 py-2.5 rounded-full bg-text-1 text-bg text-sm font-semibold disabled:opacity-60">
        {yendo ? 'Abriendo el pago…' : 'Terminar el pago'}
      </button>
      {err && (
        <p className="text-xs text-danger mt-2 leading-relaxed">
          {err}
          {/* La salida de siempre, por si la pasarela del organizador cambió o
              se desconectó: desde la página del evento se puede comprar. */}
          {slug && <> <a href={`/explorar/${slug}`} className="underline">Ir a la página del evento</a>.</>}
        </p>
      )}
    </>
  );
}
