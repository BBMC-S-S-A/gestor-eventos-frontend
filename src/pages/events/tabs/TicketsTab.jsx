import { useEffect, useState } from 'react';
import { ROLES, ORDEN_ROLES, rolValido } from '../../../lib/rolDeBoleta.js';
import { confirmDialog } from '../../../components/ui/Confirm.jsx';
import { ticketsApi } from '../../../api/tickets.js';
import { useToast } from '../../../context/ToastContext.jsx';
import Spinner from '../../../components/ui/Spinner.jsx';
import GLoader from '../../../components/ui/GLoader.jsx';
import BarraProgreso from '../../../components/ui/BarraProgreso.jsx';
import { torneosApi } from '../../../api/torneos.js';
import CrearTorneo from './torneo/TorneoCrear.jsx';

/* Tab Tickets — tipos de boleta del evento. Minimalista Apple. */

export default function TicketsTab({ evento }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing,  setEditing]  = useState(null);
  const { success, error: toastErr } = useToast();

  const reload = async () => {
    setLoading(true);
    try {
      const d = await ticketsApi.list(evento.id);
      setTickets(d.tickets || []);
    } catch (e) { toastErr(e.message); }
    finally    { setLoading(false); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [evento.id]);

  const onCrear = async (payload) => {
    try {
      await ticketsApi.crear(evento.id, payload);
      success('Ticket creado.');
      setCreating(false);
      reload();
    } catch (e) { toastErr(e.message); }
  };

  const onEditar = async (id, payload) => {
    try {
      await ticketsApi.editar(evento.id, id, payload);
      success('Ticket actualizado.');
      setEditing(null);
      reload();
    } catch (e) { toastErr(e.message); }
  };

  const onBorrar = async (t) => {
    if (!(await confirmDialog({ message:(`¿Borrar "${t.nombre}"?${t.vendidos > 0 ? ' (Tiene ventas — se archivará en vez de borrar)' : ''}`), danger:true }))) return;
    try {
      await ticketsApi.borrar(evento.id, t.id);
      success('Ticket eliminado.');
      reload();
    } catch (e) { toastErr(e.message); }
  };

  const toggleActivo = async (t) => {
    try {
      await ticketsApi.editar(evento.id, t.id, { activo: !t.activo });
      reload();
    } catch (e) { toastErr(e.message); }
  };

  if (loading) return (
    <GLoader message="Cargando tickets..." />
  );

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold font-display text-text-1 tracking-tight">Tipos de ticket</h2>
          <p className="text-sm text-text-2 mt-1">
            Define las boletas que vendes. Precios, cupos, Early Bird, zonas de acceso.
          </p>
        </div>
        <button onClick={() => setCreating(v => !v)} className="btn-gradient btn-sm">
          <PlusIcon className="w-3.5 h-3.5" />
          Nuevo ticket
        </button>
      </div>

      {creating && (
        <TicketForm
          eventoId={evento.id}
          currency={evento.currency || 'COP'}
          onSubmit={onCrear}
          onCancel={() => setCreating(false)}
        />
      )}

      {tickets.length === 0 && !creating ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {tickets.map(t => (
            <TicketCard
              key={t.id}
              ticket={t}
              isEditing={editing === t.id}
              onStartEdit={() => setEditing(t.id)}
              onCancelEdit={() => setEditing(null)}
              onSave={(p) => onEditar(t.id, p)}
              onDelete={() => onBorrar(t)}
              onToggleActivo={() => toggleActivo(t)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────── Card individual ─────────── */

function TicketCard({ ticket, isEditing, onStartEdit, onCancelEdit, onSave, onDelete, onToggleActivo }) {
  if (isEditing) {
    return (
      <div className="sm:col-span-2">
        <TicketForm
          initial={ticket}
          eventoId={ticket.evento_id}
          currency={ticket.currency}
          onSubmit={onSave}
          onCancel={onCancelEdit}
        />
      </div>
    );
  }

  const isFree     = Number(ticket.precio) === 0;
  const hasEarly   = ticket.early_bird_precio && ticket.early_bird_hasta && new Date(ticket.early_bird_hasta) > new Date();
  const ventaCerr  = ticket.venta_hasta && new Date(ticket.venta_hasta) < new Date();
  const cupoPct    = ticket.cupo ? Math.min(100, Math.round((ticket.vendidos || 0) / ticket.cupo * 100)) : 0;

  /* Para qué es esta boleta.
   *
   * En una lista como la de FESTECH —el registro general, el encuentro de
   * mujeres, el DemoDay y la batalla de pitch— las cuatro se ven igual, y sólo
   * quien montó el evento sabe cuál es la puerta de entrada. Eso importa: la
   * principal es la que se agota contra el aforo del recinto y la que hay que
   * tener antes de apuntarse a nada.
   *
   * Sale del vínculo que ya existe (`agenda_sessions.ticket_type_id`) y no de
   * un campo aparte: una etiqueta guardada a mano se queda vieja en cuanto
   * alguien crea o borra la actividad. */
  const deActividades = ticket.sesiones || [];

  return (
    <div className={`rounded-3xl border bg-surface/40 p-5 group transition-all hover:border-border-2
      ${ticket.activo ? 'border-border' : 'border-border/40 opacity-60'}
    `}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-text-1 truncate">{ticket.nombre}</h3>
            {hasEarly  && <span className="text-[10px] uppercase tracking-widest font-semibold text-warning bg-warning/10 border border-warning/20 px-2 py-0.5 rounded-full">Early</span>}
            {!ticket.activo && <span className="text-[10px] uppercase tracking-widest text-text-3 font-semibold">Pausado</span>}
            {ventaCerr && <span className="text-[10px] uppercase tracking-widest text-danger font-semibold">Cerrado</span>}
          </div>
          {deActividades.length > 0 ? (
            <p className="text-[11px] text-accent mt-1 truncate"
              title={deActividades.map(x => x.titulo).join(' · ')}>
              Da acceso a {deActividades.length === 1
                ? `«${deActividades[0].titulo}»`
                : `${deActividades.length} actividades`}
            </p>
          ) : (
            <p className="text-[11px] text-text-3 mt-1">Entrada al evento</p>
          )}
          {ticket.descripcion && <p className="text-xs text-text-3 mt-1 line-clamp-2">{ticket.descripcion}</p>}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onToggleActivo} aria-label={ticket.activo ? 'Pausar' : 'Activar'} title={ticket.activo ? 'Pausar' : 'Activar'}
            className="w-8 h-8 rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-2 flex items-center justify-center">
            {ticket.activo ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
          </button>
          <button onClick={onStartEdit} aria-label="Editar"
            className="w-8 h-8 rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-2 flex items-center justify-center">
            <EditIcon className="w-4 h-4" />
          </button>
          <button onClick={onDelete} aria-label="Borrar"
            className="w-8 h-8 rounded-lg text-text-3 hover:text-danger hover:bg-danger/10 flex items-center justify-center">
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Precio */}
      <div className="mb-4">
        {isFree ? (
          <p className="text-3xl font-bold font-display text-text-1 tracking-tight">Gratis</p>
        ) : hasEarly ? (
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold font-display text-text-1 tracking-tight tabular-nums">
                {formatPrice(ticket.early_bird_precio)}
              </p>
              <span className="text-xs text-text-3">{ticket.currency}</span>
            </div>
            <p className="text-xs text-text-3 mt-1 line-through tabular-nums">
              {formatPrice(ticket.precio)} {ticket.currency} · normal
            </p>
            <p className="text-[11px] text-warning mt-0.5">
              Early Bird hasta {new Date(ticket.early_bird_hasta).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
            </p>
          </div>
        ) : (
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold font-display text-text-1 tracking-tight tabular-nums">{formatPrice(ticket.precio)}</p>
            <span className="text-xs text-text-3">{ticket.currency}</span>
          </div>
        )}
      </div>

      {/* Cupo */}
      {ticket.cupo ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-2">{ticket.vendidos || 0} / {ticket.cupo} vendidos</span>
            <span className="text-text-3 tabular-nums">{cupoPct}%</span>
          </div>
          <BarraProgreso pct={cupoPct} alto="h-1" etiqueta={`${cupoPct}% del cupo vendido`} />
        </div>
      ) : (
        <p className="text-xs text-text-3">{ticket.vendidos || 0} vendidos · cupo ilimitado</p>
      )}

      {ticket.venta_hasta && !ventaCerr && (
        <p className="text-[11px] text-text-3 mt-3">
          Venta cierra {new Date(ticket.venta_hasta).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
        </p>
      )}
    </div>
  );
}

/* ─────────── Form crear/editar ─────────── */

function TicketForm({ initial, eventoId, currency, onSubmit, onCancel }) {
  const toast = useToast();
  const [form, setForm] = useState({
    nombre           : initial?.nombre || '',
    descripcion      : initial?.descripcion || '',
    precio           : initial?.precio ?? 0,
    currency         : initial?.currency || currency || 'COP',
    cupo             : initial?.cupo ?? '',
    early_bird_precio: initial?.early_bird_precio ?? '',
    early_bird_hasta : toLocalInput(initial?.early_bird_hasta),
    venta_hasta      : toLocalInput(initial?.venta_hasta),
    /* 0093 · `crea` sustituye a la casilla «es de stand». Se cae a
       `es_expositor` para los eventos cuya base todavía no tiene la columna:
       así la pantalla enseña lo que hay, en vez de decir «nada» sobre un tipo
       que sí crea stands. */
    crea             : initial?.crea || (initial?.es_expositor ? 'stand' : 'nada'),
    crea_torneo_id   : initial?.crea_torneo_id || '',
    /* 0121 · Qué papel juega en la lista de compra. Si la columna todavía no
       está en esta base, `initial.rol` llega `undefined` y se cae a «entrada»,
       que es lo que la lista hacía con todas hasta ahora. */
    rol              : rolValido(initial?.rol),
    instrucciones    : initial?.instrucciones || '',
    /* 0127/0128 · La credencial. Todo esto nace apagado, así que un tipo de
       boleta que nadie toque se comporta exactamente como antes: no caduca, no
       pide autorización y sale a la venta. */
    vigencia_desde       : toLocalInput(initial?.vigencia_desde),
    vigencia_hasta       : toLocalInput(initial?.vigencia_hasta),
    requiere_autorizacion: Boolean(initial?.requiere_autorizacion),
    autoriza             : initial?.autoriza || 'evento',
    visible_publico      : initial?.visible_publico !== false,
  });
  const [torneos, setTorneos] = useState([]);
  const [falloTorneos, setFalloTorneos] = useState(false);
  /* Crear el torneo sin salir de aquí, con el formulario DE VERDAD.
   *
   * Antes esto era una casilla de nombre que creaba el torneo como
   * «eliminación» sin preguntar. Fue un error, y de los caros: el FORMATO de un
   * torneo NO se puede cambiar después —la ruta sólo deja editar nombre,
   * disciplina, orden y categoría—, así que una Batalla de Pitch creada por el
   * atajo nacía como una llave de eliminación y sin forma de volver atrás. Su
   * rúbrica de calificación no aparecía por ninguna parte, porque ese torneo
   * ya no era de jurado.
   *
   * Abrir el formulario completo encima cuesta lo mismo —esta pantalla sigue
   * montada debajo, así que no se pierde nada de lo escrito— y hace la
   * pregunta que hay que hacer una sola vez en la vida del torneo. */
  const [creandoTorneo, setCreandoTorneo] = useState(false);
  /* Boletas de este tipo vendidas antes de que dijera «crea un equipo». Sólo
     tiene sentido preguntarlo sobre un tipo que YA existe. */
  const [sueltas, setSueltas] = useState(null);
  const [metiendo, setMetiendo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(initial?.early_bird_precio || initial?.early_bird_hasta || initial?.venta_hasta
      /* Si esta boleta ya es una credencial configurada, el bloque se abre: un
         ajuste que decide quién entra no puede quedar escondido detrás de
         «Avanzado» cuando ya está puesto. */
      || initial?.vigencia_desde || initial?.vigencia_hasta
      || initial?.requiere_autorizacion || initial?.visible_publico === false)
  );

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  /* Los torneos hacen falta sólo para «crea un equipo», pero se piden al abrir
     el formulario y no al elegir esa opción: si se pidieran después, el
     desplegable saldría vacío el primer instante y parecería que no hay
     ninguno. */
  useEffect(() => {
    if (!eventoId) return;
    /* El fallo se MIRA. Sin esto, no poder preguntar y no haber ninguno se
       veían igual — y el mensaje de abajo afirma que el evento no tiene
       torneos, que es una cosa muy concreta que no sabemos. */
    torneosApi.list(eventoId)
      .then(d => { setTorneos(d.torneos || []); setFalloTorneos(false); })
      .catch(() => setFalloTorneos(true));
  }, [eventoId]);

  /* ¿Cuántas boletas se quedarían fuera del torneo?
   *
   * Quien mete al equipo es un disparador de la base que corre
   * `AFTER INSERT OR UPDATE OF estado` sobre la boleta: sólo cuando nace o
   * cambia de estado. Las que ya están pagadas no van a cambiar, así que al
   * pasar un tipo a «Un equipo» se quedan fuera **sin un solo error** — y se
   * descubre el día de la competencia, contando sillas.
   *
   * Se pregunta al elegir «Un equipo» y no al guardar: avisar antes es lo que
   * deja decidir; avisar después es contar un problema ya hecho. */
  useEffect(() => {
    if (!initial?.id || form.crea !== 'equipo') { setSueltas(null); return; }
    let vivo = true;
    ticketsApi.boletasSinEquipo(eventoId, initial.id)
      .then(d => { if (vivo) setSueltas(d); })
      /* Si no se puede preguntar, no se inventa un número: se calla. Decir
         «0 boletas sueltas» cuando no se sabe es peor que no decir nada. */
      .catch(() => { if (vivo) setSueltas(null); });
    return () => { vivo = false; };
  }, [eventoId, initial?.id, form.crea]);

  /* El torneo recién creado queda elegido: crearlo y dejar el desplegable en
     «¿a qué torneo entra?» sería hacer el trabajo y no cerrarlo. */
  const torneoCreado = (t) => {
    const nuevo = t?.torneo || t;
    if (!nuevo?.id) return;
    setTorneos(ts => [...ts, nuevo]);
    update('crea_torneo_id', nuevo.id);
    setCreandoTorneo(false);
    toast?.success?.(`Torneo «${nuevo.nombre}» creado y elegido.`);
  };

  const meterLasVendidas = async () => {
    setMetiendo(true);
    try {
      const d = await ticketsApi.crearEquipos(eventoId, initial.id);
      toast?.success?.(d.creados === 1
        ? '1 equipo creado desde las boletas ya vendidas.'
        : `${d.creados} equipos creados desde las boletas ya vendidas.`);
      setSueltas({ cuantas: 0, aviso: null });
    } catch (err) {
      toast?.error?.(err.response?.data?.error || err.message);
    } finally { setMetiendo(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setSaving(true);
    const payload = {
      nombre           : form.nombre,
      descripcion      : form.descripcion || null,
      precio           : Number(form.precio) || 0,
      currency         : form.currency,
      cupo             : form.cupo === '' ? null : Number(form.cupo),
      early_bird_precio: form.early_bird_precio === '' ? null : Number(form.early_bird_precio),
      early_bird_hasta : form.early_bird_hasta ? new Date(form.early_bird_hasta).toISOString() : null,
      venta_hasta      : form.venta_hasta      ? new Date(form.venta_hasta).toISOString()      : null,
      crea             : form.crea,
      rol              : form.rol,
      instrucciones    : form.instrucciones,
      crea_torneo_id   : form.crea === 'equipo' ? (form.crea_torneo_id || null) : null,
      /* Se manda también la vieja: si esta base aún no tiene la 0093, el
         backend guarda al menos lo que ya sabía guardar y un stand sigue
         siendo un stand. */
      es_expositor     : form.crea === 'stand',
      /* 0127/0128 · La credencial. Se manda siempre: un servidor sin las
         migraciones descarta las claves que no conoce, y mandarlas sólo «si
         cambiaron» dejaría un tipo a medio configurar sin que se notara. */
      vigencia_desde       : form.vigencia_desde ? new Date(form.vigencia_desde).toISOString() : null,
      vigencia_hasta       : form.vigencia_hasta ? new Date(form.vigencia_hasta).toISOString() : null,
      requiere_autorizacion: form.requiere_autorizacion,
      autoriza             : form.autoriza,
      visible_publico      : form.visible_publico,
    };
    await onSubmit(payload);
    setSaving(false);
  };

  return (
    <form onSubmit={submit}
      className="rounded-3xl border border-primary/25 bg-surface/40 p-5 animate-[fadeUp_0.3s_ease_both] space-y-4"
    >
      <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">
        {initial ? 'Editar ticket' : 'Nuevo tipo de ticket'}
      </p>

      <div className="grid sm:grid-cols-[1.4fr_1fr] gap-3">
        <div className="field">
          <label className="label">Nombre *</label>
          <input
            value={form.nombre} onChange={e => update('nombre', e.target.value)}
            placeholder={form.crea === 'stand' ? 'Ej: Stand comercial, Stand VIP' : form.crea === 'equipo' ? 'Ej: Inscripción por equipo' : 'Ej: General, VIP, Early Bird'}
            className="input-form" required autoFocus
          />
        </div>
        <div className="field">
          <label className="label">Precio</label>
          <div className="grid grid-cols-[1fr_82px] gap-2">
            <input
              type="number" min="0" step="0.01"
              value={form.precio} onChange={e => update('precio', e.target.value)}
              className="input-form tabular-nums" placeholder="0"
            />
            <select
              value={form.currency} onChange={e => update('currency', e.target.value)}
              className="input bg-surface-2 rounded-2xl py-3 text-sm"
            >
              <option value="COP">COP</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="MXN">MXN</option>
            </select>
          </div>
          <p className="text-[11px] text-text-3 mt-1.5">Pon 0 para boleta gratis.</p>
        </div>
      </div>

      <div className="field">
        <label className="label">Descripción</label>
        <input
          value={form.descripcion} onChange={e => update('descripcion', e.target.value)}
          placeholder="Acceso general · 1 bebida incluida · etc."
          className="input-form"
        />
      </div>

      <div className="field">
        <label className="label">{form.crea === 'stand' ? 'Número de stands' : form.crea === 'equipo' ? 'Equipos que caben' : 'Cupo'}</label>
        <input
          type="number" min="0"
          value={form.cupo} onChange={e => update('cupo', e.target.value)}
          placeholder="Vacío = ilimitado"
          className="input-form tabular-nums"
        />
      </div>

      {/* Qué ES esta boleta en la lista de compra.
       *
       * Va ANTES de «qué se crea al pagarse» porque es la pregunta más
       * general: primero qué es, luego qué desencadena.
       *
       * Salió de un evento con cuatro boletas —la entrada general y tres
       * actividades— que se enseñaban en una lista plana. Quien llegaba veía
       * cuatro cosas iguales y elegía una: se inscribía al DemoDay sin
       * entrada, o pedía las cuatro por si acaso. */}
      <div className="field">
        <label className="label">Qué es esta boleta</label>
        <div className="grid sm:grid-cols-3 gap-2">
          {ORDEN_ROLES.map(v => (
            <button type="button" key={v} onClick={() => update('rol', v)}
              className={`text-left rounded-2xl border p-3 transition-colors
                ${form.rol === v ? 'border-accent/50 bg-accent/5' : 'border-border hover:bg-surface-2'}`}>
              <span className="text-sm font-medium text-text-1 block">{ROLES[v].corto}</span>
              <span className="text-text-3 text-[11px] leading-snug block mt-0.5">{ROLES[v].panel}</span>
            </button>
          ))}
        </div>
        <p className="hint">
          Sólo cambia cómo se agrupa la lista de compra: no cambia lo que se emite ni el precio.
          {form.rol !== 'entrada' && ' Quien la elija verá que necesita además la entrada al evento.'}
        </p>
      </div>

      {/* Lo que tiene que hacer quien compre ESTA boleta.
       *
       * El evento ya tenía un mensaje al confirmar, pero es uno para todo. En
       * cuanto hay actividades cada una necesita el suyo: la entrada general
       * dice «trae tu QR» y la postulación de startup dice «te escribiremos
       * para la sesión de pitch». */}
      <div className="field">
        <label className="label" htmlFor="tt-instr">
          Qué tiene que hacer quien la compre <span className="text-text-3 font-normal lowercase tracking-normal">(opcional)</span>
        </label>
        <textarea id="tt-instr" rows={3} maxLength={1000}
          value={form.instrucciones}
          onChange={e => update('instrucciones', e.target.value)}
          placeholder={'Ej: Preséntate en el laboratorio 2 a las 8:00 con tu documento.\nTe escribiremos por correo con la hora de tu pitch.'}
          className="input" />
        <p className="hint">
          Se enseña al terminar el registro <b>y también en su boleta</b>, que es donde
          se vuelve a mirar antes del evento. Los saltos de línea se respetan.
        </p>
      </div>

      {/* Qué crea al venderse.

          Era una casilla —«es una boleta de stand»— y por tanto sólo sabía
          hablar de stands. Un torneo tiene el mismo caso: comprar la
          inscripción debería crear el equipo, y el capitán completa sus datos
          por su enlace. Con una casilla por cada cosa que se pueda crear
          acabarían siendo tres que se contradicen en cuanto alguien marque dos;
          con un solo valor, no. */}
      <div className="field">
        <label className="label">Qué se crea al pagarse</label>
        <div className="grid sm:grid-cols-3 gap-2">
          {[
            ['nada',   'Nada más',        'Una boleta normal: da acceso y ya.'],
            ['stand',  'Un stand',         'La empresa recibe su ficha —logo, contacto, cronograma— y la edita ella.'],
            ['equipo', 'Un equipo',        'Entra al torneo que elijas; el capitán completa los datos por su enlace.'],
          ].map(([v, titulo, ayuda]) => (
            <button type="button" key={v} onClick={() => update('crea', v)}
              className={`text-left rounded-2xl border p-3 transition-colors
                ${form.crea === v ? 'border-accent/50 bg-accent/5' : 'border-border hover:bg-surface-2'}`}>
              <span className="text-sm font-medium text-text-1 block">{titulo}</span>
              <span className="text-text-3 text-[11px] leading-snug block mt-0.5">{ayuda}</span>
            </button>
          ))}
        </div>

        {form.crea === 'equipo' && (
          <div className="mt-2">
            {torneos.length > 0 ? (
              <select value={form.crea_torneo_id} onChange={e => update('crea_torneo_id', e.target.value)}
                className="input bg-surface-2 rounded-2xl py-3 text-sm w-full" required>
                <option value="">¿A qué torneo entra?</option>
                {torneos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            ) : falloTorneos ? (
              <p className="text-[11px] text-warning-light">
                No pudimos cargar los torneos del evento. Vuelve a abrir esta pestaña en un momento
                — puede que sí haya y no hayamos podido preguntarlo.
              </p>
            ) : (
              /* Se crea AQUÍ. Antes esto mandaba a otra pestaña, y volver
                 significaba perder el nombre, el precio y la descripción ya
                 escritos: la salida real era cancelar y empezar de cero. */
              <div className="rounded-2xl border border-warning/40 bg-warning/5 p-3 space-y-2">
                <p className="text-[11px] text-text-2 leading-relaxed">
                  Este evento todavía no tiene ningún torneo, y una boleta que crea equipos tiene que
                  decir a cuál. Créalo aquí mismo sin perder lo que ya escribiste.
                </p>
                <button type="button" onClick={() => setCreandoTorneo(true)} className="btn btn-sm">
                  Crear un torneo
                </button>
                <p className="text-[11px] text-text-3 leading-relaxed">
                  Se abre el formulario completo: el <b className="text-text-2">formato</b> hay que
                  elegirlo bien ahora, porque no se puede cambiar después. Para una batalla de pitch
                  es «puntaje por jurado», que es el que trae la rúbrica de calificación.
                </p>
              </div>
            )}

            {/* Las boletas que se vendieron antes de que este tipo dijera «crea
                un equipo». Sin este aviso se quedan fuera sin que nadie lo vea:
                el disparador de la base sólo corre cuando la boleta cambia de
                estado, y las pagadas ya no cambian. */}
            {sueltas?.cuantas > 0 && (
              <div className="mt-2 rounded-2xl border border-warning/40 bg-warning/5 p-3 space-y-2">
                <p className="text-[11px] text-text-2 leading-relaxed">
                  {sueltas.aviso} Se vendieron antes de que este tipo entrara al torneo, así que
                  nadie las va a meter por su cuenta.
                </p>
                <button type="button" onClick={meterLasVendidas} disabled={metiendo}
                  className="btn-secondary btn-sm">
                  {metiendo ? 'Metiéndolas…' : `Meterlas al torneo (${sueltas.cuantas})`}
                </button>
                <p className="text-[11px] text-text-3 leading-relaxed">
                  Cada una entra como un equipo a nombre de quien compró. El capitán completa el
                  resto por su enlace, igual que las que se vendan de aquí en adelante.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* El formulario de verdad, encima. Esta pantalla sigue montada debajo, así
          que nada de lo escrito se pierde — que era todo el problema que el
          atajo intentaba resolver, y lo resolvía rompiendo otra cosa. */}
      {creandoTorneo && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-bg/70 backdrop-blur-md p-4"
          onClick={() => setCreandoTorneo(false)}>
          <div className="min-h-full flex items-start sm:items-center justify-center">
            <div onClick={e => e.stopPropagation()}
              className="w-full max-w-2xl rounded-3xl border border-border-2 bg-surface shadow-2xl p-5 my-4">
              <CrearTorneo
                eventoId={eventoId}
                onCreado={torneoCreado}
                onCancelar={() => setCreandoTorneo(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Avanzado */}
      <button
        type="button"
        onClick={() => setShowAdvanced(v => !v)}
        className="text-xs text-text-2 hover:text-text-1 transition-colors flex items-center gap-1.5"
      >
        <span className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>›</span>
        Opciones avanzadas (Early Bird, fecha límite de venta)
      </button>

      {showAdvanced && (
        <div className="space-y-3 pt-1 animate-[fadeUp_0.2s_ease_both]">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="field">
              <label className="label">Precio Early Bird</label>
              <input
                type="number" min="0" step="0.01"
                value={form.early_bird_precio} onChange={e => update('early_bird_precio', e.target.value)}
                placeholder="Precio descuento"
                className="input-form tabular-nums"
              />
            </div>
            <div className="field">
              <label className="label">Early Bird hasta</label>
              <input
                type="datetime-local"
                value={form.early_bird_hasta} onChange={e => update('early_bird_hasta', e.target.value)}
                className="input-form bg-surface-2"
              />
            </div>
          </div>
          <div className="field">
            <label className="label">Fecha límite de venta</label>
            <input
              type="datetime-local"
              value={form.venta_hasta} onChange={e => update('venta_hasta', e.target.value)}
              className="input-form bg-surface-2"
            />
            <p className="text-[11px] text-text-3 mt-1.5">Después de esta fecha no se podrán comprar más boletas de este tipo.</p>
          </div>

          {/* ── La credencial (0127/0128) ──────────────────────────────────
              Hasta cuándo ABRE, que no es lo mismo que hasta cuándo se VENDE:
              una boleta se vende en septiembre para diciembre, y una credencial
              de montaje se emite en septiembre y sólo abre dos días de
              noviembre. Estaban mezclados en el mismo campo y no lo son. */}
          <div className="pt-4 mt-2 border-t border-border space-y-4">
            <div>
              <p className="text-sm font-medium text-text-1">La credencial</p>
              <p className="text-[11px] text-text-3 mt-0.5">
                Para credenciales de montaje, prensa o proveedores. Una boleta normal no necesita nada de esto.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="field">
                <label className="label">Abre desde</label>
                <input type="datetime-local" value={form.vigencia_desde}
                  onChange={e => update('vigencia_desde', e.target.value)}
                  className="input-form bg-surface-2" />
              </div>
              <div className="field">
                <label className="label">Deja de abrir</label>
                <input type="datetime-local" value={form.vigencia_hasta}
                  onChange={e => update('vigencia_hasta', e.target.value)}
                  className="input-form bg-surface-2" />
              </div>
            </div>
            <p className="text-[11px] text-text-3 -mt-2">
              Fuera de esas horas el QR no abre, aunque sea legítimo. Vacío = sin límite.
            </p>

            <label className="flex items-start gap-2 text-sm text-text-2 cursor-pointer">
              <input type="checkbox" checked={form.requiere_autorizacion}
                onChange={e => update('requiere_autorizacion', e.target.checked)} className="mt-1" />
              <span>
                <b className="text-text-1">Cada persona tiene que ser autorizada</b>
                <br />
                <span className="text-[11px] text-text-3">
                  Se inscriben con nombre y documento desde el enlace de la boleta, y no reciben
                  credencial hasta que alguien responde por ellas. Es lo que impide que quien quiere
                  colarse se registre solo.
                </span>
              </span>
            </label>

            {form.requiere_autorizacion && (
              <div className="field pl-6">
                <label className="label">¿Quién autoriza?</label>
                <select value={form.autoriza} onChange={e => update('autoriza', e.target.value)}
                  className="input-form bg-surface-2">
                  <option value="evento">Sólo la organización</option>
                  <option value="responsable">También quien tiene el código de la boleta</option>
                </select>
                {/* El caso de las seis de la mañana: si sólo autoriza la
                    organización, un cambio de última hora no tiene salida y el
                    guardia acaba dejando pasar de palabra. */}
                <p className="text-[11px] text-text-3 mt-1.5">
                  {form.autoriza === 'responsable'
                    ? 'El stand puede acreditar a un sustituto él mismo, y queda registrado que respondió por él. Es lo que resuelve «el que iba se enfermó» a las seis de la mañana.'
                    : 'Un cambio de última hora tendrá que esperar a alguien de la organización.'}
                </p>
              </div>
            )}

            <label className="flex items-start gap-2 text-sm text-text-2 cursor-pointer">
              <input type="checkbox" checked={!form.visible_publico}
                onChange={e => update('visible_publico', !e.target.checked)} className="mt-1" />
              <span>
                <b className="text-text-1">No mostrar en la página pública</b>
                <br />
                <span className="text-[11px] text-text-3">
                  Se sigue pudiendo emitir desde el panel, pero no sale a la venta.
                </span>
              </span>
            </label>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="btn-ghost btn-sm">Cancelar</button>
        <button type="submit" disabled={saving || !form.nombre.trim()} className="btn-primary btn-sm">
          {saving ? <><Spinner size="sm" /> Guardando...</> : (initial ? 'Guardar cambios' : 'Crear ticket')}
        </button>
      </div>
    </form>
  );
}

/* ─────────── Vacío ─────────── */

function EmptyState({ onCreate }) {
  return (
    <div className="rounded-3xl border border-border bg-surface/40 px-6 py-16 text-center max-w-xl mx-auto">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-surface border border-border mb-5">
        <TicketIcon className="w-6 h-6 text-text-2" />
      </div>
      <h2 className="text-xl font-bold font-display text-text-1 tracking-tight mb-2">Sin tickets aún</h2>
      <p className="text-sm text-text-2 leading-relaxed max-w-sm mx-auto mb-5">
        Crea tu primer tipo de boleta. Puedes hacer varios con precios, cupos y zonas distintas.
      </p>
      <button onClick={onCreate} className="btn-gradient">
        <PlusIcon className="w-4 h-4" /> Crear primer ticket
      </button>
    </div>
  );
}

/* ─────────── Helpers ─────────── */

function formatPrice(n) {
  return Number(n).toLocaleString('es-CO', { maximumFractionDigits: 0 });
}
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ─────────── Icons ─────────── */

function PlusIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>;
}
function EditIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>;
}
function TrashIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
}
function PauseIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}
function PlayIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}
function TicketIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>;
}
