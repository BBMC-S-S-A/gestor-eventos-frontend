import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { eventosApi } from '../../../api/eventos.js';
import { networkingApi } from '../../../api/networking.js';
import { guardarBorrador, leerBorrador, olvidarBorrador, filtrarCitas, citasComoCSV } from '../../../lib/notasDeCita.js';
import { RESULTADOS, PLAZOS, sePuedeCerrar, informeCSV, agendasPorParticipante } from '../../../lib/cierreDeCita.js';
import { useToast } from '../../../context/ToastContext.jsx';
import { confirmDialog } from '../../../components/ui/Confirm.jsx';
import Spinner from '../../../components/ui/Spinner.jsx';
import GLoader from '../../../components/ui/GLoader.jsx';
import { numeroDeStand } from '../../../lib/expositoresUi.js';
import ParrillaRueda from './ParrillaRueda.jsx';

/* Tab Rueda de Negocios.
 *
 * ── Un expositor de aquí ES un stand ──────────────────────────────────
 *
 * Las dos pantallas escriben en `networking_expositores`. Se unificó en el
 * Frente J, cuando resultó que había dos altas para la misma tabla y la de la
 * rueda ni siquiera tenía `PATCH`. **Está bien que sean lo mismo** —quien monta
 * un stand es con quien se agenda una cita—, lo que estaba mal es que la
 * interfaz no lo dijera: se creaba un expositor aquí y aparecía en Stands sin
 * explicación, como si se hubiera duplicado solo.
 *
 * Por eso las dos cabeceras se apuntan la una a la otra. Lo que cambia entre
 * ellas no es la lista, son las columnas: aquí las citas y los horarios, allí
 * el número de stand y la cuota de puntos.
 *
 * Gestionado + autogestionado:
   el organizador crea expositores y sus horarios disponibles; los
   asistentes reservan citas libremente, confirmación automática.
   ExplorarView y MisCitasView se exportan también para poder reutilizarse
   desde la página pública (src/pages/public/NetworkingPublicPage.jsx). */

/* La rueda la lleva quien lleva los expositores.
 *
 * Las cuatro vistas de gestion —parrilla, informe, gestionar, por empresa—
 * salian solo para `soyOwner`, y el servidor nunca pidio eso: las rutas de la
 * rueda aceptan `gestionar_expositores` o `editar_evento`. Asi que el rol
 * «Coordinacion de expositores», que existe en la semilla con ese permiso
 * exacto, entraba a la pestaña y solo veia «Explorar» y «Mis citas»: podia
 * mirar la rueda como un asistente y no operarla. */
export default function NetworkingTab({ evento, soyOwner, puedeGestionar }) {
  /* Sin la bandera se cae a `soyOwner`: como estaba. */
  const gestiona = puedeGestionar === undefined ? soyOwner : puedeGestionar;
  /* Quien organiza entra por la parrilla, no por «Gestionar». El día del
     evento lo que se mira es el tablero —quién está sentado, qué hueco quedó
     libre—; crear mesas y generar franjas es trabajo de antes. */
  const [sub, setSub] = useState((puedeGestionar === undefined ? soyOwner : puedeGestionar) ? 'parrilla' : 'explorar');
  // parrilla | admin | explorar | mis-citas

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold font-display text-text-1 tracking-tight">Rueda de Negocios</h2>
          <p className="text-sm text-text-2 mt-1">
            Agenda citas cortas de networking con expositores del evento.
          </p>
          {/* Que un expositor y un stand son la misma ficha no se adivina: se
              dice, y con el enlace al lado. */}
          <p className="text-xs text-text-3 mt-1">
            Cada expositor de aquí es también un <b className="text-text-2">stand</b>: es la misma ficha
            vista por el otro lado. Su número de stand y su cuota de puntos se llevan en{' '}
            <a href={`/eventos/${evento.id}?s=zonas&t=stands`} className="text-primary-light hover:underline">
              Zonas → Stands
            </a>.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-surface-2 border border-border rounded-xl p-1">
          {gestiona && (
            <button onClick={() => setSub('parrilla')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${sub === 'parrilla' ? 'bg-surface-3 text-text-1' : 'text-text-3 hover:text-text-2'}`}>
              Parrilla
            </button>
          )}
          {gestiona && (
            <button onClick={() => setSub('informe')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${sub === 'informe' ? 'bg-surface-3 text-text-1' : 'text-text-3 hover:text-text-2'}`}>
              Informe
            </button>
          )}
          {gestiona && (
            <button onClick={() => setSub('admin')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${sub === 'admin' ? 'bg-surface-3 text-text-1' : 'text-text-3 hover:text-text-2'}`}>
              Gestionar
            </button>
          )}
          {/* La parrilla enseña todas las mesas a la vez: correcto para operar
              el salón, y lo peor para contestar «¿qué tiene mañana Café del
              Tolima?». Eso se preguntaba de una mesa concreta y no había dónde
              mirarlo. */}
          {gestiona && (
            <button onClick={() => setSub('mesas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${sub === 'mesas' ? 'bg-surface-3 text-text-1' : 'text-text-3 hover:text-text-2'}`}>
              Por empresa
            </button>
          )}
          <button onClick={() => setSub('explorar')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${sub === 'explorar' ? 'bg-surface-3 text-text-1' : 'text-text-3 hover:text-text-2'}`}>
            Explorar
          </button>
          <button onClick={() => setSub('mis-citas')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${sub === 'mis-citas' ? 'bg-surface-3 text-text-1' : 'text-text-3 hover:text-text-2'}`}>
            Mis citas
          </button>
        </div>
      </div>

      {sub === 'parrilla' && gestiona && <ParrillaRueda evento={evento} soyOwner={gestiona} />}
      {sub === 'informe'  && gestiona && <InformeRueda evento={evento} />}
      {sub === 'admin'    && gestiona && <AdminView evento={evento} />}
      {sub === 'mesas'    && gestiona && <AgendaPorEmpresa evento={evento} />}
      {sub === 'explorar' && <ExplorarView evento={evento} />}
      {sub === 'mis-citas' && <MisCitasView evento={evento} />}
    </div>
  );
}

/* ─────────── Vista Explorar (asistente) ─────────── */
export function ExplorarView({ evento }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const { success, error: toastErr } = useToast();

  const cargar = () => {
    setLoading(true);
    networkingApi.expositores(evento.id)
      .then(d => setData(d.expositores || []))
      .catch(e => toastErr(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [evento.id]);

  /* Con la rueda en modo «solicitud» la cita nace pendiente de que el equipo
     la apruebe. Decía «¡Cita confirmada!» igual, así que la persona se iba
     creyendo que tenía una hora que nadie le había dado. */
  const porSolicitud = evento?.networking_modo === 'solicitud';

  /* Cerrojo del doble toque: `busy` deshabilita el boton cuando React pinta, y
     dos toques en el mismo fotograma entran los dos. Aqui eso son dos citas
     pedidas por la misma persona, o un 409 gratuito sobre su propia reserva. */
  const reservando = useRef(false);

  const reservar = async (horarioId) => {
    if (reservando.current) return;
    reservando.current = true;
    setBusy(horarioId);
    try {
      /* El estado lo dice el SERVIDOR, no el modo que esta pantalla creía
         tener: el modo puede haber cambiado mientras estaba abierta. */
      const r = await networkingApi.reservar(evento.id, horarioId);
      if (r?.estado === 'solicitada') {
        success('Solicitud enviada. El equipo la revisa y te avisa.');
      } else {
        success('¡Cita confirmada!');
      }
      cargar();
    } catch (e) {
      toastErr(e.response?.data?.error || e.message);
      /* Si la casilla ya no esta libre, la lista que se esta mirando esta
         vieja: se recarga. Sin esto, el mismo boton sigue ahi invitando a
         volver a intentarlo y a recibir el mismo error. */
      if (e.response?.status === 409) cargar();
    } finally {
      reservando.current = false;
      setBusy(null);
    }
  };

  if (loading) return <GLoader message="Cargando expositores..." />;
  if (!data || data.length === 0) {
    return (
      <div className="rounded-3xl border border-border bg-surface/40 px-6 py-16 text-center">
        <p className="text-sm text-text-3">Aún no hay expositores disponibles para este evento.</p>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {data.map(exp => (
        <div key={exp.id} className="rounded-3xl border border-border bg-surface/40 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl overflow-hidden bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-semibold flex-shrink-0">
              {exp.logo_url ? <img src={exp.logo_url} alt="" className="w-full h-full object-cover" /> : exp.nombre?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-text-1 truncate">{exp.nombre}</p>
              {exp.stand && <p className="text-xs text-text-3">Stand {numeroDeStand(exp.stand)}</p>}
            </div>
          </div>
          {exp.descripcion && <p className="text-sm text-text-2 leading-relaxed">{exp.descripcion}</p>}

          <div>
            <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold mb-2">
              {porSolicitud ? 'Horarios que puedes pedir' : 'Horarios disponibles'}
            </p>
            {exp.horarios.length === 0 ? (
              <p className="text-xs text-text-3">Sin horarios publicados aún.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {exp.horarios.map(h => {
                  const hora = new Date(h.inicio).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
                  if (h.esMio) {
                    /* «Pedida» y «Reservada» no son lo mismo para quien está
                       mirando su agenda del día: una obliga a estar ahí, la
                       otra todavía no. */
                    const pedida = h.estado === 'solicitada';
                    return (
                      <span key={h.id}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                          pedida
                            ? 'bg-warning/15 text-warning border-warning/25'
                            : 'bg-success/15 text-success border-success/25'}`}>
                        {hora} · {pedida ? 'Pedida' : 'Reservada'}
                      </span>
                    );
                  }
                  if (!h.disponible) {
                    return (
                      <span key={h.id} className="px-3 py-1.5 rounded-full text-xs bg-surface-2 text-text-3 border border-border line-through">
                        {hora}
                      </span>
                    );
                  }
                  return (
                    <button key={h.id} onClick={() => reservar(h.id)} disabled={busy === h.id}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold border border-primary/30 bg-primary/10 text-primary-light hover:bg-primary/20 disabled:opacity-50 transition-all">
                      {busy === h.id ? <Spinner size="sm" /> : hora}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────── Vista Mis Citas (asistente) ─────────── */
export function MisCitasView({ evento }) {
  const [citas, setCitas] = useState(null);
  const [busy, setBusy] = useState(null);
  /* Buscar y filtrar. Con veinte reuniones, «¿cuál era la del proveedor de
     gafetes?» no se contesta bajando por la lista: se contesta escribiendo. */
  const [q, setQ] = useState('');
  const [soloConNotas, setSoloConNotas] = useState(false);
  const { success, error: toastErr } = useToast();

  const cargar = () => {
    networkingApi.misCitas(evento.id)
      .then(d => setCitas(d.citas || []))
      .catch(e => toastErr(e.response?.data?.error || e.message));
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [evento.id]);

  const visibles = useMemo(
    () => filtrarCitas(citas || [], { texto: q, soloConNotas }),
    [citas, q, soloConNotas]);
  const conNotas = (citas || []).filter(c => c.notas).length;

  const cancelar = async (citaId) => {
    if (!(await confirmDialog({ message: '¿Cancelar esta cita? El horario quedará libre para alguien más.', danger: true }))) return;
    setBusy(citaId);
    try {
      await networkingApi.cancelar(evento.id, citaId);
      success('Cita cancelada.');
      cargar();
    } catch (e) {
      toastErr(e.response?.data?.error || e.message);
      /* La cita ya no esta: la lista que se mira esta vieja y se recarga. */
      if (e.response?.status === 404) cargar();
    } finally {
      setBusy(null);
    }
  };

  /* Descargar lo anotado.
   *
   * Una nota que sólo se lee dentro de la aplicación no sirve para lo que se
   * tomó: el seguimiento se hace al día siguiente, en el correo o en la hoja de
   * cálculo de alguien. Se arma aquí con lo que ya está cargado — no hace falta
   * pedirle nada al servidor. */
  const descargar = () => {
    const csv = citasComoCSV(visibles, evento.titulo || '');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `mis-citas-${(evento.slug || 'evento')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    /* El objeto se libera después: revocarlo en el acto cancela la descarga en
       algunos navegadores. */
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  if (citas === null) return <GLoader message="Cargando tu agenda..." />;
  if (citas.length === 0) {
    return (
      <div className="rounded-3xl border border-border bg-surface/40 px-6 py-16 text-center">
        <p className="text-sm text-text-3">Todavía no tienes citas reservadas. Ve a "Explorar" para agendar una.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* La barra sólo aparece cuando hay suficientes citas como para que
          buscar tenga sentido. Con tres reuniones, un buscador es ruido. */}
      {citas.length > 4 && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar por empresa, stand o lo que anotaste…"
            className="input rounded-2xl py-2 text-sm flex-1 min-w-[14rem]" />
          <button
            onClick={() => setSoloConNotas(v => !v)}
            className={`btn-sm rounded-full border px-3 ${soloConNotas
              ? 'border-primary/50 bg-primary/10 text-text-1'
              : 'border-border text-text-2 hover:text-text-1'}`}>
            Con notas ({conNotas})
          </button>
          <button onClick={descargar} className="btn-secondary btn-sm rounded-full">
            Descargar CSV
          </button>
        </div>
      )}

      {visibles.length === 0 ? (
        <div className="rounded-3xl border border-border bg-surface/40 px-6 py-10 text-center">
          <p className="text-sm text-text-3">
            Ninguna cita coincide{soloConNotas ? ' y tiene notas' : ''}. Cambia la búsqueda.
          </p>
        </div>
      ) : (
      <div className="rounded-3xl border border-border bg-surface/40 overflow-hidden">
      {visibles.map((c, i) => {
        const inicio = new Date(c.horario?.inicio);
        const fin = new Date(c.horario?.fin);
        return (
          <div key={c.id} className={i > 0 ? 'border-t border-border' : ''}>
          <div className="flex items-center gap-3 px-5 py-3.5">
            <div className="w-11 h-11 rounded-xl overflow-hidden bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-semibold flex-shrink-0">
              {c.horario?.expositor?.logo_url
                ? <img src={c.horario.expositor.logo_url} alt="" className="w-full h-full object-cover" />
                : c.horario?.expositor?.nombre?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-1 truncate">{c.horario?.expositor?.nombre}</p>
              <p className="text-xs text-text-3">
                {inicio.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} – {fin.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                {c.horario?.expositor?.stand ? ` · Stand ${numeroDeStand(c.horario.expositor.stand)}` : ''}
              </p>
            </div>
            {/* Una cita pedida y todavia sin aprobar tiene que verse distinta de
                una confirmada: son dos situaciones y hasta ahora se pintaban
                igual. */}
            {c.estado === 'solicitada' && (
              <span className="text-[10px] uppercase tracking-wide text-warning border border-warning/40 bg-warning/10 px-2 py-0.5 rounded-full flex-shrink-0">
                Pedida
              </span>
            )}
            <button onClick={() => cancelar(c.id)} disabled={busy === c.id}
              className="btn-ghost btn-sm text-danger/80 hover:text-danger disabled:opacity-50">
              {busy === c.id ? <Spinner size="sm" /> : 'Cancelar'}
            </button>
          </div>

          {/* Las anotaciones de la cita.
              Una rueda son quince reuniones de veinte minutos, y al dia
              siguiente no hay forma de saber cual era cual. La libreta de
              papel que todo el mundo saca es exactamente esto — con la
              empresa, la hora y el stand al lado, que es lo que le da
              sentido. */}
          <NotasCita evento={evento} cita={c} />
          <CierreCita evento={evento} cita={c} />
          </div>
        );
      })}
      </div>
      )}
    </div>
  );
}

/* Lo que anotaste de una cita.
 *
 * ── Lo que cambió, y por qué ─────────────────────────────────────────────
 *
 * Guardaba al salir del campo. Es lo correcto para el escritorio y tiene un
 * agujero en el móvil: cambiar de aplicación no siempre dispara ese evento. La
 * persona escribe entre dos mesas, se va a la siguiente, y la nota no salió
 * nunca — y no se entera hasta el día siguiente, cuando ya no puede
 * reconstruirla.
 *
 * Ahora hay tres redes, de la más barata a la más segura:
 *
 *  1. Un BORRADOR local en cuanto se teclea. Una recarga, un cierre o la
 *     pestaña muerta por memoria ya no se llevan nada.
 *  2. Se manda solo a los dos segundos de dejar de escribir. Sin botón: quien
 *     escribe esto lo hace de pie y con prisa.
 *  3. Y también al salir del campo, al esconder la pestaña y al cerrarla.
 *
 * El estado se DICE. «Sin guardar» mientras hay algo pendiente es lo que
 * permite decidir si se puede cerrar el móvil; un «Guardado» que aparece y se
 * queda no distingue entre lo de hace un segundo y lo de hace media hora.
 */
function NotasCita({ evento, cita, abiertaPorDefecto = false }) {
  const inicial = leerBorrador(cita.id) ?? (cita.notas || '');
  const [texto, setTexto] = useState(inicial);
  /* 'guardado' | 'pendiente' | 'guardando' | 'error' */
  const [estado, setEstado] = useState(inicial === (cita.notas || '') ? 'guardado' : 'pendiente');
  const [abierta, setAbierta] = useState(abiertaPorDefecto || Boolean(inicial));
  const { error: toastErr } = useToast();

  const textoRef = useRef(texto);
  const guardando = useRef(false);
  textoRef.current = texto;

  const guardar = useCallback(async () => {
    const actual = textoRef.current;
    if (actual === (cita.notas || '')) return;
    /* Cerrojo: el temporizador, el `blur` y el cambio de pestaña pueden caer a
       la vez, y serían tres escrituras de lo mismo. */
    if (guardando.current) return;
    guardando.current = true;
    setEstado('guardando');
    try {
      await networkingApi.guardarNotas(evento.id, cita.id, actual);
      cita.notas = actual;
      olvidarBorrador(cita.id);
      /* Si siguió escribiendo mientras se guardaba, esto ya no está al día. */
      setEstado(textoRef.current === actual ? 'guardado' : 'pendiente');
    } catch (e) {
      setEstado('error');
      toastErr(e.response?.data?.error || e.message);
    } finally {
      guardando.current = false;
    }
  }, [evento.id, cita, toastErr]);

  const escribir = (v) => {
    setTexto(v);
    setEstado('pendiente');
    /* El borrador primero: si esto falla, lo demás sigue funcionando igual. */
    guardarBorrador(cita.id, v);
  };

  /* Solo, dos segundos después de la última tecla. */
  useEffect(() => {
    if (estado !== 'pendiente') return undefined;
    const t = setTimeout(guardar, 2000);
    return () => clearTimeout(t);
  }, [texto, estado, guardar]);

  /* Y al esconder o cerrar la pestaña, que en un móvil es lo que de verdad
     pasa: `visibilitychange` salta cuando se cambia de aplicación, y
     `pagehide` cuando el sistema mata la pestaña. */
  useEffect(() => {
    const alIrse = () => { if (textoRef.current !== (cita.notas || '')) guardar(); };
    const alEsconder = () => { if (document.visibilityState === 'hidden') alIrse(); };
    document.addEventListener('visibilitychange', alEsconder);
    window.addEventListener('pagehide', alIrse);
    return () => {
      document.removeEventListener('visibilitychange', alEsconder);
      window.removeEventListener('pagehide', alIrse);
    };
  }, [guardar, cita]);

  const AVISO = {
    pendiente: { texto: 'Sin guardar…', cls: 'text-text-3' },
    guardando: { texto: 'Guardando…',   cls: 'text-text-3' },
    guardado:  { texto: 'Guardado.',    cls: 'text-success' },
    error:     { texto: 'No se pudo guardar. Sigue aquí: no cierres sin reintentar.', cls: 'text-danger-light' },
  }[estado];

  /* Cerrada por defecto cuando no hay nada escrito. Con veinte citas, veinte
     cajas de texto abiertas son un muro por el que hay que bajar para
     encontrar la de las 10:45. */
  if (!abierta) {
    return (
      <div className="px-5 pb-3.5 -mt-1">
        <button onClick={() => setAbierta(true)}
          className="text-xs text-text-3 hover:text-text-1 underline underline-offset-2">
          + Anotar algo de esta reunión
        </button>
      </div>
    );
  }

  return (
    <div className="px-5 pb-3.5 -mt-1">
      <textarea
        value={texto}
        onChange={e => escribir(e.target.value)}
        onBlur={guardar}
        rows={texto ? 3 : 2}
        maxLength={4000}
        placeholder="Anota lo que hablaron, lo que quedó pendiente, con quién seguir…"
        className="input w-full text-sm resize-y" />
      <div className="flex items-center justify-between gap-2 mt-1">
        <p className={`text-[11px] ${AVISO.cls}`}>{estado === 'guardado' && !texto ? '' : AVISO.texto}</p>
        <p className="text-[11px] text-text-3 tabular-nums">{texto.length} / 4000</p>
      </div>
    </div>
  );
}


/* El cierre de la reunión: qué pasó, y qué negocio se espera.
 *
 * ── Por qué esto vale más que la nota ────────────────────────────────────
 *
 * La nota es de quien la escribe. Esto es lo que la rueda ENTREGA: cuántas
 * reuniones ocurrieron de verdad y cuánto negocio se espera de ellas. Para una
 * cámara de comercio ése es el informe que le presenta a su junta, y hasta hoy
 * la plataforma agendaba citas sin poder decir para qué sirvieron.
 *
 * ── Cuándo aparece ───────────────────────────────────────────────────────
 *
 * Cuando la reunión ya terminó. Preguntar «¿se realizó?» antes de que empiece
 * no tiene respuesta, y en una rueda con quince citas por delante ensucia la
 * única pantalla que la persona mira entre mesa y mesa.
 *
 * ── Un guardado por campo, y ninguno silencioso ─────────────────────────
 *
 * Cada campo se manda solo al cambiarlo, y sólo ese campo: cerrar la reunión no
 * puede borrar la nota que se escribió durante ella. Y si falla, se dice — un
 * cierre perdido es un dato que ya no se puede reconstruir: nadie se acuerda a
 * la semana siguiente de cuánto esperaba de la reunión de las 10:15.
 */
function CierreCita({ evento, cita }) {
  const [v, setV] = useState({
    resultado: cita.resultado || '',
    expectativa_monto: cita.expectativa_monto ?? '',
    expectativa_plazo: cita.expectativa_plazo || '',
    hubo_acuerdo: cita.hubo_acuerdo ?? null,
    resultado_nota: cita.resultado_nota || '',
  });
  const [estado, setEstado] = useState('');   // '' | 'guardando' | 'guardado' | 'error'
  const { error: toastErr } = useToast();

  if (!sePuedeCerrar(cita)) return null;

  const mandar = async (cambios) => {
    setEstado('guardando');
    try {
      await networkingApi.cerrarCita(evento.id, cita.id, cambios);
      Object.assign(cita, cambios);           // la lista de arriba ya lo sabe
      setEstado('guardado');
    } catch (e) {
      setEstado('error');
      toastErr(e.response?.data?.error || e.message);
    }
  };

  const poner = (patch, mandarlo = true) => {
    setV(x => ({ ...x, ...patch }));
    if (mandarlo) mandar(patch);
  };

  const realizada = v.resultado === 'realizada';

  return (
    <div className="px-5 pb-4 -mt-1">
      <div className="rounded-2xl border border-border bg-surface-2/40 p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs font-semibold text-text-1">¿Cómo salió la reunión?</p>
          {estado === 'guardando' && <span className="text-[11px] text-text-3">Guardando…</span>}
          {estado === 'guardado'  && <span className="text-[11px] text-success">Guardado.</span>}
          {estado === 'error'     && <span className="text-[11px] text-danger-light">No se pudo guardar. Vuelve a intentarlo.</span>}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {RESULTADOS.map(r => (
            <button key={r.id}
              onClick={() => poner({ resultado: v.resultado === r.id ? null : r.id })}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                v.resultado === r.id
                  ? 'border-primary-light bg-primary/10 text-text-1 font-medium'
                  : 'border-border text-text-2 hover:text-text-1'}`}>
              {r.label}
            </button>
          ))}
        </div>

        {/* La expectativa sólo tiene sentido si hubo reunión. Preguntarle a
            quien marcó «no asistió» cuánto negocio espera es pedirle que se
            invente un número. */}
        {realizada && (
          <div className="space-y-2.5">
            <div className="flex items-end gap-2 flex-wrap">
              <label className="text-[11px] text-text-3 flex flex-col gap-1">
                Negocio que esperas ({evento.currency || 'COP'})
                <input type="number" min="0" inputMode="numeric"
                  value={v.expectativa_monto}
                  onChange={e => poner({ expectativa_monto: e.target.value }, false)}
                  onBlur={() => mandar({ expectativa_monto: v.expectativa_monto === '' ? null : Number(v.expectativa_monto) })}
                  placeholder="Sin cifra"
                  className="input !h-9 text-sm w-40" />
              </label>
              <label className="text-[11px] text-text-3 flex flex-col gap-1">
                ¿Para cuándo?
                <select value={v.expectativa_plazo}
                  onChange={e => poner({ expectativa_plazo: e.target.value || null })}
                  className="input !h-9 text-sm w-40">
                  <option value="">Sin plazo</option>
                  {PLAZOS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs text-text-2 cursor-pointer h-9">
                <input type="checkbox" checked={Boolean(v.hubo_acuerdo)}
                  onChange={e => poner({ hubo_acuerdo: e.target.checked })}
                  className="w-4 h-4 rounded accent-primary" />
                Quedó un acuerdo
              </label>
            </div>

            <input value={v.resultado_nota}
              onChange={e => poner({ resultado_nota: e.target.value }, false)}
              onBlur={() => mandar({ resultado_nota: v.resultado_nota })}
              maxLength={1000}
              placeholder="Qué se acordó, en una línea"
              className="input w-full text-sm" />
          </div>
        )}

        {/* Se dice a dónde va esto. Un formulario que pide cifras sin explicar
            quién las mira se rellena mal o no se rellena. */}
        <p className="text-[11px] text-text-3 leading-relaxed">
          Lo ve el equipo del evento y entra en el informe de la rueda. Tus notas
          de arriba siguen siendo privadas.
        </p>
      </div>
    </div>
  );
}


/* Qué salió de la rueda.
 *
 * ── Para qué existe esta pantalla ────────────────────────────────────────
 *
 * Una cámara de comercio no organiza una rueda para tener una agenda bonita:
 * la organiza para poder decirle a su junta cuántas reuniones ocurrieron y
 * cuánto negocio se espera de ellas. Hasta hoy la plataforma agendaba citas y
 * no podía contestar ninguna de las dos cosas.
 *
 * ── Lo que esta pantalla NO hace ─────────────────────────────────────────
 *
 * Repartir lo que nadie registró. «Sin registrar» tiene su propia casilla y su
 * propio color: una rueda donde no se cerró ninguna reunión tiene que verse
 * como lo que es —sin datos— y no como una rueda con cero reuniones
 * realizadas. Y el porcentaje se calcula sobre lo registrado, DICIENDO sobre
 * cuántas: sobre el total convertiría «no lo sabemos» en «no ocurrió».
 */
function InformeRueda({ evento }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    networkingApi.informe(evento.id)
      .then(d => { if (vivo) setDatos(d); })
      .catch(e => { if (vivo) setError(e.response?.data?.error || e.message); });
    return () => { vivo = false; };
  }, [evento.id]);

  if (error) return (
    <div className="rounded-3xl border border-border bg-surface/40 px-6 py-10 text-center">
      <p className="text-sm text-text-2">{error}</p>
    </div>
  );
  if (!datos) return <GLoader message="Armando el informe…" />;

  const r = datos.resumen;
  const moneda = (n, m) => `${Number(n).toLocaleString('es-CO', { maximumFractionDigits: 0 })} ${m}`;

  const descargar = () => {
    const csv = informeCSV(datos.citas || [], evento.titulo || '');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `rueda-${evento.slug || 'evento'}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const Dato = ({ n, label, cls = 'text-text-1' }) => (
    <div className="rounded-2xl border border-border bg-surface/40 p-4">
      <p className={`text-2xl font-bold font-display tabular-nums ${cls}`}>{n}</p>
      <p className="text-[11px] text-text-3 mt-0.5 leading-snug">{label}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-text-2 max-w-xl leading-relaxed">
          Lo que salió de la rueda. Las reuniones sin cerrar se cuentan aparte:
          no se sabe si ocurrieron, y contarlas como que no habría sido inventar.
        </p>
        <div className="flex items-center gap-2 flex-shrink-0 no-print">
          <button onClick={() => window.print()} className="btn-secondary btn-sm rounded-full">
            Imprimir las agendas
          </button>
          <button onClick={descargar} className="btn-secondary btn-sm rounded-full">
            Descargar informe (CSV)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Dato n={r.agendadas} label="Citas agendadas (sin contar canceladas)" />
        <Dato n={r.realizadas} label="Se realizaron" cls="text-success" />
        <Dato n={r.no_asistio} label="No asistió alguna de las partes" cls="text-warning" />
        <Dato n={r.sin_registrar} label="Sin cerrar todavía" cls="text-text-3" />
      </div>

      <AgendasImprimibles evento={evento} citas={datos.citas || []} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-surface/40 p-4">
          <p className="text-[11px] uppercase tracking-widest text-text-3 mb-1">Efectividad</p>
          {r.efectividad == null ? (
            <p className="text-sm text-text-3">Todavía nadie ha cerrado una reunión.</p>
          ) : (
            <>
              <p className="text-2xl font-bold font-display tabular-nums text-text-1">{r.efectividad} %</p>
              {/* Sobre cuántas. Un porcentaje sin denominador con tres
                  reuniones cerradas de doscientas es un titular falso. */}
              <p className="text-[11px] text-text-3 mt-0.5">
                sobre {r.registradas} reunion{r.registradas === 1 ? '' : 'es'} cerrada{r.registradas === 1 ? '' : 's'}
                {r.sin_registrar > 0 && ` · faltan ${r.sin_registrar}`}
              </p>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-surface/40 p-4">
          <p className="text-[11px] uppercase tracking-widest text-text-3 mb-1">Negocio esperado</p>
          {Object.keys(r.expectativa_por_moneda || {}).length === 0 ? (
            <p className="text-sm text-text-3">Nadie ha registrado una cifra todavía.</p>
          ) : (
            <div className="space-y-0.5">
              {Object.entries(r.expectativa_por_moneda).map(([m, n]) => (
                <p key={m} className="text-xl font-bold font-display tabular-nums text-text-1">{moneda(n, m)}</p>
              ))}
              <p className="text-[11px] text-text-3">
                de {r.con_expectativa} reunion{r.con_expectativa === 1 ? '' : 'es'}
              </p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-surface/40 p-4">
          <p className="text-[11px] uppercase tracking-widest text-text-3 mb-1">Con acuerdo</p>
          <p className="text-2xl font-bold font-display tabular-nums text-text-1">{r.con_acuerdo}</p>
          <p className="text-[11px] text-text-3 mt-0.5">
            {r.canceladas > 0 && `${r.canceladas} cita${r.canceladas === 1 ? '' : 's'} cancelada${r.canceladas === 1 ? '' : 's'} aparte`}
          </p>
        </div>
      </div>
    </div>
  );
}


/* La agenda de cada participante, para entregarla.
 *
 * ── Por qué esto es papel y no una pantalla ──────────────────────────────
 *
 * Una rueda genera dos papeles: la parrilla de quien coordina y la agenda de
 * cada empresa. La segunda se imprime o se manda la víspera, y sin ella cada
 * participante se apunta sus horas a mano de una pantalla — y la mitad se
 * equivoca de mesa. El wifi de un recinto tampoco es algo con lo que se pueda
 * contar el día del evento.
 *
 * ── Se ve en pantalla plegada, y sale entera al imprimir ────────────────
 *
 * Con doscientas empresas, enseñarlas todas convertiría el informe en una
 * lista interminable por la que hay que bajar para llegar a los números. En
 * papel, en cambio, salen todas y **una por hoja**: cada una se recorta y se
 * entrega.
 */
function AgendasImprimibles({ evento, citas }) {
  const [abierto, setAbierto] = useState(false);
  const agendas = useMemo(() => agendasPorParticipante(citas), [citas]);

  if (agendas.length === 0) return null;

  const hora = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-CO', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-surface/40 overflow-hidden" id="agendas-print">
      {/* `visibility` y no `display`: esconder con `display:none` reflowea la
          página y parte las tablas entre hojas por sitios raros. */}
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #agendas-print, #agendas-print * { visibility: visible !important; }
        #agendas-print { position: absolute; left: 0; top: 0; width: 100%; border: 0; }
        #agendas-print .no-print { display: none !important; }
        #agendas-print .agenda { break-after: page; page-break-after: always; }
        #agendas-print .agenda:last-child { break-after: auto; page-break-after: auto; }
        @page { margin: 14mm; }
      }`}</style>

      <button onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2/60 transition-colors no-print">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-1">Agenda de cada participante</p>
          <p className="text-[11px] text-text-3">
            {agendas.length} persona{agendas.length === 1 ? '' : 's'} · al imprimir sale una por hoja
          </p>
        </div>
        <span className="text-xs text-text-3 flex-shrink-0">{abierto ? 'Ocultar' : 'Ver'}</span>
      </button>

      <div className={abierto ? 'border-t border-border' : 'hidden print:block'}>
        {agendas.map(a => (
          <div key={a.clave} className="agenda px-4 py-4 border-b border-border last:border-b-0">
            <p className="text-sm font-semibold text-text-1">{a.nombre}</p>
            <p className="text-[11px] text-text-3 mb-2">
              {a.email || 'sin correo'} · {evento.titulo}
            </p>
            <table className="w-full text-sm">
              <tbody>
                {a.citas.map(c => (
                  <tr key={c.id} className="border-t border-border/60">
                    <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap text-text-2">{hora(c.horario?.inicio)}</td>
                    <td className="py-1.5 pr-3 text-text-1">{c.horario?.expositor?.nombre}</td>
                    <td className="py-1.5 pr-3 text-text-3 whitespace-nowrap">
                      {c.horario?.expositor?.stand ? `Stand ${c.horario.expositor.stand}` : ''}
                    </td>
                    {/* Una cita PEDIDA todavía puede caerse: quien recibe la
                        agenda tiene que saberlo antes de organizar su día. */}
                    <td className="py-1.5 text-[11px] text-warning whitespace-nowrap">
                      {c.estado === 'solicitada' ? 'sin confirmar' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Cómo se agenda en esta rueda: la persona reserva y ya, o lo pide y el
 * equipo aprueba.
 *
 * Se puede cambiar a mitad del evento y es a propósito: hay ruedas que
 * empiezan abiertas y se cierran cuando la agenda se llena, y al revés. Lo que
 * ya está reservado no se toca — cambiar el modo decide lo que pase de aquí en
 * adelante, no reabre lo confirmado.
 */
function ModoRueda({ evento }) {
  const [modo, setModo] = useState(evento?.networking_modo || 'auto');
  const [guardando, setGuardando] = useState(false);
  const { success, error: toastErr } = useToast();

  const cambiar = async (nuevo) => {
    if (nuevo === modo) return;
    const antes = modo;
    setModo(nuevo);            // se pinta ya: es un interruptor, no un formulario
    setGuardando(true);
    try {
      await eventosApi.update(evento.id, { networking_modo: nuevo });
      success(nuevo === 'solicitud'
        ? 'Ahora las citas se piden y las apruebas tú.'
        : 'Ahora quien reserva queda confirmado en el acto.');
    } catch (e) {
      setModo(antes);
      toastErr(e.response?.data?.error || e.message);
    } finally { setGuardando(false); }
  };

  const OPCIONES = [
    { id: 'auto',      label: 'Reserva directa', pista: 'Quien reserva queda confirmado en el acto.' },
    { id: 'solicitud', label: 'Con aprobación',  pista: 'La cita queda pedida hasta que alguien del equipo la acepte.' },
  ];

  return (
    <div className="rounded-2xl border border-border bg-surface/40 px-4 py-3">
      <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">Cómo se agenda</p>
      <div className="flex flex-wrap gap-2 mt-2">
        {OPCIONES.map(o => (
          <button key={o.id} type="button" onClick={() => cambiar(o.id)} disabled={guardando}
            className={`text-left px-3 py-2 rounded-xl border transition-colors max-w-xs ${
              modo === o.id
                ? 'border-primary/40 bg-primary/10 text-text-1'
                : 'border-border text-text-2 hover:text-text-1 hover:bg-surface-2'}`}>
            <span className="text-sm font-medium block">{o.label}</span>
            <span className="text-[11px] text-text-3 block leading-snug">{o.pista}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-text-3 mt-2 leading-relaxed">
        Se puede cambiar en cualquier momento. Lo ya reservado no se toca.
      </p>
    </div>
  );
}

/* ─────────── La agenda de una empresa ───────────
 *
 * ── El hueco que tapa ────────────────────────────────────────────────────
 *
 * Una rueda tiene dos lados y hasta ahora sólo uno podía consultar su día.
 * Quien visita ve «Mis citas». La empresa SENTADA en la mesa no tenía ninguna
 * pantalla: para saber a quién iba a recibir a las 10:15 había que pedírselo a
 * quien organiza, que lo leía de la parrilla — y el día del evento eso es una
 * fila de gente preguntando lo mismo.
 *
 * Y quien organiza tampoco podía mirar una sola: la parrilla las enseña todas
 * a la vez, que es lo correcto para operar el salón y lo peor para contestar
 * «¿qué tiene mañana Café del Tolima?».
 *
 * ── Los huecos se enseñan ────────────────────────────────────────────────
 *
 * La agenda trae TODAS las franjas, con y sin cita. Los huecos son la mitad de
 * la información: dicen cuándo esa mesa está libre, que es lo que hace falta
 * para meter ahí a alguien que se quedó sin reuniones.
 *
 * La misma agenda la puede abrir la empresa por su cuenta, con el código de su
 * boleta-stand y sin cuenta (`/eventos/publicos/expositor/:codigo/citas`).
 */
function AgendaPorEmpresa({ evento }) {
  const [mesas, setMesas] = useState(null);
  const [elegida, setElegida] = useState('');
  const [datos, setDatos] = useState(null);
  const { error: toastErr } = useToast();

  useEffect(() => {
    networkingApi.admin(evento.id)
      .then(d => {
        const lista = (d.expositores || []).filter(e => (e.horarios || []).length > 0);
        setMesas(lista);
        /* Se abre en la primera en vez de en un desplegable vacío: con una sola
           mesa, elegirla es un clic que no decide nada. */
        if (lista.length) setElegida(lista[0].id);
      })
      .catch(e => toastErr(e.response?.data?.error || e.message));
  }, [evento.id, toastErr]);

  useEffect(() => {
    if (!elegida) return;
    setDatos(null);
    networkingApi.agendaDeMesa(evento.id, elegida)
      .then(setDatos)
      .catch(e => toastErr(e.response?.data?.error || e.message));
  }, [evento.id, elegida, toastErr]);

  if (mesas === null) return <GLoader message="Cargando las mesas…" />;
  if (mesas.length === 0) return (
    <div className="rounded-3xl border border-border bg-surface/40 px-6 py-16 text-center">
      <p className="text-sm text-text-2">Todavía no hay mesas con horario.</p>
      <p className="text-xs text-text-3 mt-1">En <b className="text-text-2">Gestionar</b> se crean y se les generan las franjas.</p>
    </div>
  );

  const hora = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-CO', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  };
  const r = datos?.resumen;

  return (
    <div className="space-y-4" id="agenda-empresa-print">
      {/* `visibility` y no `display`: esconder con `display:none` reflowea la
          página y parte la tabla entre hojas por sitios raros. */}
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #agenda-empresa-print, #agenda-empresa-print * { visibility: visible !important; }
        #agenda-empresa-print { position: absolute; left: 0; top: 0; width: 100%; }
        #agenda-empresa-print .no-print { display: none !important; }
        @page { margin: 14mm; }
      }`}</style>

      <div className="flex flex-wrap items-end gap-3 no-print">
        <label className="flex-1 min-w-[16rem]">
          <span className="text-[11px] uppercase tracking-widest text-text-3 font-semibold block mb-1">Empresa</span>
          <select value={elegida} onChange={e => setElegida(e.target.value)} className="input w-full text-sm">
            {mesas.map(m => (
              <option key={m.id} value={m.id}>
                {m.nombre}{m.stand ? ` · Mesa ${m.stand}` : ''}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => window.print()} className="btn-secondary btn-sm rounded-full">
          Imprimir esta agenda
        </button>
      </div>

      {!datos ? <GLoader message="Cargando la agenda…" /> : (
        <div className="rounded-2xl border border-border bg-surface/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-text-1">{datos.expositor?.nombre}</p>
            <p className="text-[11px] text-text-3">
              {datos.expositor?.stand ? `Mesa ${datos.expositor.stand}` : 'Mesa por asignar'}
              {datos.expositor?.categoria_negocio ? ` · ${datos.expositor.categoria_negocio}` : ''}
            </p>
            {r && (
              <p className="text-[11px] text-text-2 mt-1.5 tabular-nums">
                {r.ocupadas} de {r.franjas} franja{r.franjas === 1 ? '' : 's'} con cita
                {r.pedidas ? ` · ${r.pedidas} sin aprobar` : ''}
                {r.libres ? ` · ${r.libres} libre${r.libres === 1 ? '' : 's'}` : ''}
                {r.bloqueadas ? ` · ${r.bloqueadas} bloqueada${r.bloqueadas === 1 ? '' : 's'}` : ''}
              </p>
            )}
          </div>

          <table className="w-full text-sm">
            <tbody>
              {datos.agenda.map(f => (
                <tr key={f.horario_id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 text-text-2 whitespace-nowrap align-top w-40 tabular-nums">
                    {hora(f.inicio)}
                  </td>
                  <td className="px-4 py-2.5">
                    {f.cita ? (
                      <>
                        <span className="text-text-1 block">
                          {f.cita.persona?.nombre || f.cita.persona?.email || 'Sin identificar'}
                        </span>
                        <span className="text-[11px] text-text-3 block">
                          {f.cita.persona?.nombre && f.cita.persona?.email ? `${f.cita.persona.email} · ` : ''}
                          {/* «Pedida» y «Reservada» no son lo mismo para quien
                              mira su día: una todavía puede caerse. */}
                          {f.cita.estado === 'solicitada' ? 'Pedida, sin aprobar' : 'Confirmada'}
                        </span>
                      </>
                    ) : f.bloqueado ? (
                      <span className="text-text-3">
                        Bloqueada{f.bloqueo_motivo ? ` · ${f.bloqueo_motivo}` : ''}
                      </span>
                    ) : (
                      <span className="text-text-3">Libre</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────── Vista Admin (organizador) ─────────── */
function AdminView({ evento }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  /* `null` = cerrado, `'nuevo'` = alta, un expositor = edición. Un solo estado
     porque es un solo modal: dos banderas se desincronizan. */
  const [editando, setEditando] = useState(null);
  const [horariosPara, setHorariosPara] = useState(null); // expositor seleccionado
  const { success, error: toastErr } = useToast();

  /* Un fallo NO es una lista vacía.
   *
   * Esto sólo avisaba con un toast y dejaba `data` en null, y abajo `!data` y
   * `data.length === 0` pintan lo mismo: «Aún no agregaste expositores». O sea
   * que cuando la petición fallaba, la pantalla decía con total seguridad que
   * no había ninguno — y el toast, que era el único indicio, se desvanece a los
   * segundos. Medido: un evento con una empresa dada de alta, activa y con la
   * ficha completa, enseñando el cartel de «todavía no hay ninguna».
   *
   * El servidor se cuida de no tragarse estos errores —lo dice en sus propios
   * comentarios: «una agenda llena que se ve vacía es peor que un error»— y
   * aquí se tiraba ese cuidado en la última línea. */
  const [fallo, setFallo] = useState(null);

  const cargar = () => {
    setLoading(true);
    setFallo(null);
    networkingApi.admin(evento.id)
      .then(d => setData(d.expositores || []))
      .catch(e => {
        const msg = e.response?.data?.error || e.message;
        setFallo(msg);
        toastErr(msg);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [evento.id]);

  const borrarExpositor = async (exp) => {
    if (!(await confirmDialog({ message: `¿Borrar al expositor "${exp.nombre}"? Se eliminan también sus horarios.`, danger: true }))) return;
    try {
      await networkingApi.borrarExpositor(evento.id, exp.id);
      success('Expositor eliminado.');
      cargar();
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
  };

  const borrarHorario = async (horarioId) => {
    try {
      await networkingApi.borrarHorario(evento.id, horarioId);
      success('Horario eliminado.');
      cargar();
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
  };

  if (loading) return <GLoader message="Cargando..." />;

  return (
    <div className="space-y-4">
      {/* Cómo se agenda en esta rueda.
          La columna `networking_modo` existe en la base y el servidor la
          consulta en cada reserva — pero sin este selector era un ajuste sin
          pantalla, que es lo mismo que no existir: nadie podía cambiarlo salvo
          entrando a la base. */}
      <ModoRueda evento={evento} />

      <div className="flex justify-end">
        <button onClick={() => setEditando('nuevo')} className="btn-gradient btn-sm">+ Agregar expositor</button>
      </div>

      {fallo ? (
        /* Se dice que falló, y se ofrece reintentar. Lo que no se puede es
           enseñar el cartel de «no hay ninguno»: puede haberlos todos. */
        <div className="rounded-3xl border border-danger/40 bg-danger/5 px-6 py-12 text-center space-y-3">
          <p className="text-sm text-text-1">No se pudo cargar la lista de expositores.</p>
          <p className="text-xs text-text-3 break-words">{fallo}</p>
          <p className="text-xs text-text-3">Puede haber empresas dadas de alta que no se están viendo.</p>
          <button onClick={cargar} className="btn-secondary btn-sm">Reintentar</button>
        </div>
      ) : (!data || data.length === 0) ? (
        <div className="rounded-3xl border border-border bg-surface/40 px-6 py-16 text-center">
          <p className="text-sm text-text-3">Aún no agregaste expositores. Crea el primero para empezar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map(exp => (
            <div key={exp.id} className="rounded-2xl border border-border bg-surface/40 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-semibold flex-shrink-0">
                  {exp.logo_url ? <img src={exp.logo_url} alt="" className="w-full h-full object-cover" /> : exp.nombre?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-1 truncate">{exp.nombre}</p>
                  {exp.stand && <p className="text-xs text-text-3">Stand {numeroDeStand(exp.stand)}</p>}
                </div>
                <button onClick={() => setHorariosPara(exp)} className="btn-secondary btn-sm">+ Horarios</button>
                <button onClick={() => setEditando(exp)} aria-label={`Editar a ${exp.nombre}`}
                  className="w-8 h-8 rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-2 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button onClick={() => borrarExpositor(exp)} aria-label={`Borrar a ${exp.nombre}`}
                  className="w-8 h-8 rounded-lg text-text-3 hover:text-danger hover:bg-danger/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {exp.horarios.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {exp.horarios.map(h => {
                    const hora = new Date(h.inicio).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
                    return (
                      <span key={h.id}
                        className={`group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border
                          ${h.cita ? 'bg-success/10 text-success border-success/25' : 'bg-surface-2 text-text-2 border-border'}`}>
                        {hora}{h.cita ? ` · ${h.cita.usuario?.nombre || 'Reservada'}` : ''}
                        {!h.cita && (
                          <button onClick={() => borrarHorario(h.id)} className="opacity-50 hover:opacity-100">×</button>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editando && (
        <ExpositorModal
          /* La clave fuerza un montaje nuevo al cambiar de ficha: sin ella, el
             modal reusaría el estado del expositor anterior y aparecería con
             los datos de otro. */
          key={editando === 'nuevo' ? 'nuevo' : editando.id}
          eventoId={evento.id}
          expositor={editando === 'nuevo' ? null : editando}
          /* Los stands que ya tienen dueño: el modal los ofrece y avisa si se
             repite uno. */
          ocupados={(data || []).map(e => ({ id: e.id, stand: e.stand, nombre: e.nombre }))}
          onClose={() => setEditando(null)}
          onDone={() => { setEditando(null); cargar(); }}
        />
      )}

      {horariosPara && (
        <GenerarHorariosModal
          eventoId={evento.id}
          expositor={horariosPara}
          onClose={() => setHorariosPara(null)}
          onDone={() => { setHorariosPara(null); cargar(); }}
        />
      )}
    </div>
  );
}

/* Alta y edición en el mismo modal. Antes sólo había alta, y un expositor
   creado aquí no se podía tocar desde ninguna parte: para corregir una letra
   del nombre había que borrarlo —perdiendo sus horarios y las citas que
   alguien ya hubiera reservado— y volver a crearlo. */
function ExpositorModal({ eventoId, expositor, onClose, onDone, ocupados = [] }) {
  const editando = !!expositor;
  const [nombre, setNombre] = useState(expositor?.nombre || '');
  const [stand, setStand] = useState(numeroDeStand(expositor?.stand) || '');
  const [descripcion, setDescripcion] = useState(expositor?.descripcion || '');
  const [nit, setNit] = useState(expositor?.nit || '');
  /* El SECTOR. La columna se llama `categoria_negocio` por historia y ya
     significaba esto: `lib/heredarRespuestas.js` declara «sector» como su
     primer sinónimo. Lo que faltaba era rotularlo así donde se escribe. */
  const [sector, setSector] = useState(expositor?.categoria_negocio || '');
  /* Quién recibe y quién pasa. `comprador` por defecto porque es lo que se
     crea casi siempre: en una rueda se sientan pocos y pasan muchos. */
  const [rol, setRol] = useState(expositor?.rol || 'comprador');
  /* Si su contacto se enseña en la rueda pública. Nace apagado y se enciende a
     mano: son datos de una persona y publicarlos no se deshace. */
  const [contactoPublico, setContactoPublico] = useState(Boolean(expositor?.contacto_publico));
  const [working, setWorking] = useState(false);
  const { error: toastErr } = useToast();

  /* Los puestos ya ocupados, comparados por su número limpio: «C10» y
     «Stand C10» son el mismo sitio y hasta ahora contaban como dos. */
  const usados = [...new Set(ocupados
    .filter(o => o.id !== expositor?.id)
    .map(o => numeroDeStand(o.stand))
    .filter(Boolean))];
  const repetido = ocupados.find(o => o.id !== expositor?.id
    && numeroDeStand(o.stand)
    && numeroDeStand(o.stand).toLowerCase() === numeroDeStand(stand).toLowerCase());

  const submit = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) { toastErr('El nombre es requerido.'); return; }
    setWorking(true);
    const cuerpo = {
      nombre: nombre.trim(),
      /* Se guarda el número limpio y no lo tecleado: quien escribe «Stand C10»
         acaba con «Stand Stand C10» en la página pública, porque la etiqueta ya
         pone la palabra. Se normaliza AQUÍ, al entrar el dato, y no sólo al
         pintarlo, para que dos formas de escribir el mismo puesto —«C10» y
         «Stand C10»— se reconozcan como repetidas. */
      stand: numeroDeStand(stand) || null,
      descripcion: descripcion.trim() || null,
      nit: nit.trim() || null,
      categoria_negocio: sector.trim() || null,
      rol,
      contacto_publico: contactoPublico,
    };
    try {
      if (editando) await networkingApi.editarExpositor(eventoId, expositor.id, cuerpo);
      else await networkingApi.crearExpositor(eventoId, cuerpo);
      onDone();
    } catch (e) {
      toastErr(e.response?.data?.error || e.message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-bg/70 backdrop-blur-md animate-[fadeIn_0.2s_ease_both]" onClick={onClose}>
      <div
        className="relative w-full max-w-md rounded-t-3xl sm:rounded-3xl border-t sm:border border-border-2 bg-surface shadow-2xl max-h-[88vh] overflow-y-auto animate-[authCardIn_0.35s_cubic-bezier(0.16,1,0.3,1)_both]"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-surface px-6 py-5 border-b border-border flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold font-display tracking-tight text-text-1">{editando ? 'Editar expositor' : 'Nuevo expositor'}</h2>
          <button onClick={onClose} aria-label="Cerrar"
            className="w-9 h-9 rounded-xl text-text-3 hover:text-text-1 hover:bg-surface-2 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="field">
            <label className="label">Nombre</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} className="input rounded-2xl py-3" placeholder="Nombre de la empresa" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="field">
              <label className="label">NIT <span className="text-text-3 lowercase font-normal">(opcional)</span></label>
              {/* Texto y no número: un NIT no se suma, lleva dígito de
                  verificación que a veces se escribe pegado con guion, y una
                  empresa de fuera trae un documento con otra forma. Se guarda
                  como lo escribió quien lo escribió. */}
              <input value={nit} onChange={e => setNit(e.target.value)} className="input rounded-2xl py-3" placeholder="900123456-7" />
            </div>
            <div className="field">
              <label className="label">Sector <span className="text-text-3 lowercase font-normal">(opcional)</span></label>
              <input value={sector} onChange={e => setSector(e.target.value)} className="input rounded-2xl py-3" placeholder="Agroindustria, software…" />
            </div>
          </div>
          <div className="field">
            <label className="label">Stand <span className="text-text-3 lowercase font-normal">(opcional)</span></label>
            {/* No es un desplegable cerrado porque **los puestos no existen
                como catálogo**: no hay una tabla de stands del recinto, sólo un
                texto en cada expositor. Inventar la lista aquí sería dar por
                bueno un catálogo que no existe, y dejaría sin poder escribir el
                primer stand de cada evento. Lo que sí se puede hacer sin
                mentir: ofrecer los que ya están puestos y avisar de un
                repetido. */}
            <input value={stand} onChange={e => setStand(e.target.value)} list="stands-usados"
              className="input rounded-2xl py-3" placeholder="Ej. A-12" />
            <datalist id="stands-usados">
              {usados.map(u => <option key={u} value={u} />)}
            </datalist>
            {repetido
              ? <p className="text-xs text-warning-light mt-1.5">
                  <b className="text-text-1">{repetido.nombre}</b> ya está en este stand. Dos expositores en el
                  mismo puesto se puede hacer —a veces lo comparten— pero casi siempre es un error de dedo.
                </p>
              : <p className="text-xs text-text-3 mt-1.5">Número o código del puesto físico donde estará el día del evento. Sin la palabra «stand»: esa la pone la plataforma.</p>}
          </div>
          <div className="field">
            <label className="label">Su papel en la rueda</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'comprador', label: 'Recibe',  pista: 'Se sienta en una mesa y le llegan.' },
                { id: 'vendedor',  label: 'Visita',  pista: 'Pasa por las mesas de otros.' },
              ].map(o => (
                <button key={o.id} type="button" onClick={() => setRol(o.id)}
                  className={`text-left px-3 py-2 rounded-2xl border transition-colors ${
                    rol === o.id
                      ? 'border-accent bg-accent/10 text-text-1'
                      : 'border-border text-text-2 hover:text-text-1'}`}>
                  <span className="text-sm font-medium block">{o.label}</span>
                  <span className="text-[11px] text-text-3 block leading-snug">{o.pista}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-text-3 mt-1.5">
              En la rueda pública sólo salen los que reciben, con su mesa y sus horas.
            </p>
          </div>

          {/* El contacto público.
              Va con su aviso y no como una casilla más: encenderlo publica el
              correo y el teléfono de una persona en una página que ve
              cualquiera, y eso no se deshace del todo — una vez indexado, ya
              está fuera. Quien lo pulsa tiene que saber qué está haciendo. */}
          <div className="field">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={contactoPublico}
                onChange={e => setContactoPublico(e.target.checked)}
                className="accent-[#8B5CF6] w-4 h-4 mt-0.5 flex-shrink-0" />
              <span className="min-w-0">
                <span className="text-sm text-text-1 block">Enseñar su contacto en la rueda pública</span>
                <span className="text-xs text-text-3 block leading-snug mt-0.5">
                  Su correo y su teléfono los verá cualquiera que abra la página, sin cuenta.
                  Enciéndelo sólo si esa persona lo autorizó — publicar un dato no se deshace
                  del todo.
                </span>
              </span>
            </label>
          </div>

          <div className="field">
            {/* La misma columna, preguntada según el papel.
              *
              * En una rueda no se pide lo mismo a los dos lados: quien vende
              * describe su producto y quien compra describe el reto que quiere
              * resolver. Es UNA columna (`descripcion`) y dos preguntas, no dos
              * columnas — con dos habría que decidir qué se pierde cuando
              * alguien cambia de papel, y la respuesta sería perder lo escrito. */}
            <label className="label">
              {rol === 'vendedor' ? 'Descripción del producto' : 'Descripción del reto'}
              <span className="text-text-3 lowercase font-normal"> (opcional)</span>
            </label>
            <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={2} className="input rounded-2xl py-3 resize-none"
              placeholder={rol === 'vendedor' ? 'Qué ofrece y a quién le sirve…' : 'Qué necesita resolver o qué está buscando…'} />
            <p className="text-xs text-text-3 mt-1.5">Ayuda a los asistentes a decidir si les interesa agendar cita.</p>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-medium text-text-1 border border-border-2 hover:bg-surface-2">Cancelar</button>
            <button type="submit" disabled={working} className="flex-1 py-3 rounded-2xl text-sm font-semibold bg-text-1 text-bg hover:bg-white disabled:opacity-60 flex items-center justify-center gap-2">
              {working
                ? <><Spinner size="sm" /> {editando ? 'Guardando...' : 'Creando...'}</>
                : (editando ? 'Guardar' : 'Crear')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GenerarHorariosModal({ eventoId, expositor, onClose, onDone }) {
  const [fecha, setFecha] = useState('');
  const [horaInicio, setHoraInicio] = useState('09:00');
  const [horaFin, setHoraFin] = useState('12:00');
  const [duracion, setDuracion] = useState(15);
  const [working, setWorking] = useState(false);
  const { success, error: toastErr } = useToast();

  const submit = async (e) => {
    e.preventDefault();
    if (!fecha) { toastErr('Selecciona una fecha.'); return; }
    setWorking(true);
    try {
      const r = await networkingApi.generarHorarios(eventoId, expositor.id, {
        inicio: new Date(`${fecha}T${horaInicio}:00`).toISOString(),
        fin: new Date(`${fecha}T${horaFin}:00`).toISOString(),
        duracion_min: Number(duracion),
      });
      success(`${r.creados} horarios generados.`);
      onDone();
    } catch (e) {
      toastErr(e.response?.data?.error || e.message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-bg/70 backdrop-blur-md animate-[fadeIn_0.2s_ease_both]" onClick={onClose}>
      <div
        className="relative w-full max-w-md rounded-t-3xl sm:rounded-3xl border-t sm:border border-border-2 bg-surface shadow-2xl max-h-[88vh] overflow-y-auto animate-[authCardIn_0.35s_cubic-bezier(0.16,1,0.3,1)_both]"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-surface px-6 py-5 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold font-display tracking-tight text-text-1">Generar horarios</h2>
            <p className="text-sm text-text-2 mt-0.5">Para <strong className="text-text-1">{expositor.nombre}</strong></p>
          </div>
          <button onClick={onClose} aria-label="Cerrar"
            className="w-9 h-9 rounded-xl text-text-3 hover:text-text-1 hover:bg-surface-2 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <p className="text-sm text-text-2 -mt-1">Se crean bloques consecutivos automáticamente.</p>
          <div className="field">
            <label className="label">Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="input rounded-2xl py-3" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="field">
              <label className="label">Desde</label>
              <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} className="input rounded-2xl py-3" required />
            </div>
            <div className="field">
              <label className="label">Hasta</label>
              <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)} className="input rounded-2xl py-3" required />
            </div>
          </div>
          <div className="field">
            <label className="label">Duración de cada cita (minutos)</label>
            <select value={duracion} onChange={e => setDuracion(e.target.value)} className="input bg-surface-2 rounded-2xl py-3">
              <option value={10}>10 minutos</option>
              <option value={15}>15 minutos</option>
              <option value={20}>20 minutos</option>
              <option value={30}>30 minutos</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-medium text-text-1 border border-border-2 hover:bg-surface-2">Cancelar</button>
            <button type="submit" disabled={working} className="flex-1 py-3 rounded-2xl text-sm font-semibold bg-text-1 text-bg hover:bg-white disabled:opacity-60 flex items-center justify-center gap-2">
              {working ? <><Spinner size="sm" /> Generando...</> : 'Generar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
