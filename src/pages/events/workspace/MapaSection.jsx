import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { eventosApi } from '../../../api/eventos.js';
import { networkingApi } from '../../../api/networking.js';
import { agendaApi } from '../../../api/agenda.js';
import { clientesApi } from '../../../api/clientes.js';
import { useToast } from '../../../context/ToastContext.jsx';
import ImagePicker from '../../../components/ui/ImagePicker.jsx';
import GLoader from '../../../components/ui/GLoader.jsx';
import MarcadorMapa from '../../../components/mapa/MarcadorMapa.jsx';
import { useSondeo } from '../../../hooks/useSondeo.js';

/* Mapa del evento — plano del recinto con las UBICACIONES de todo.
   Marcadores en círculo (SIN emojis, look de mapa profesional):
   · Expositor  → círculo con su logo. Clic → card del expositor.
   · Sub-evento → círculo con la inicial del título (color de su tipo).
   · Punto      → círculo con un código corto que define el organizador
                  (ej. "S1", "S2" para plazoletas de comida) + un nombre
                  debajo. El organizador crea sus propias categorías.
   · Zona       → una zona de aforo puesta en el plano. El círculo muestra la
                  gente que hay dentro AHORA, no un código.
   · Puerta     → una de las entradas configuradas en Accesos e ingresos. El
                  círculo lleva los ingresos registrados por ella.

   Los tres últimos (sub-evento, zona y puerta) son los que cambian solos: en
   el tablero en vivo el plano deja de ser un dibujo y pasa a ser el panel de
   control del recinto.

   Las zonas ya existían (hoy en Espacio del evento → Zonas de interés), pero
   vivían en una lista sin sitio: se sabía que la tarima llevaba 400 personas y
   no dónde quedaba la tarima. Colocarlas aquí es lo que convierte el aforo en
   algo que se puede leer de un vistazo y operar desde el plano.

   Config en page_json.mapa; posiciones en % (0-100). El plano se muestra
   con la MISMA proporción (alto acotado) en el editor y en el landing. */

const COLORES_PUNTO = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#0EA5E9', '#64748B'];

function uid() { return 'm_' + Math.random().toString(36).slice(2, 9); }

/* Migra marcadores viejos (emoji/sin tipo) al modelo nuevo. */
function normMarcadores(arr) {
  return (arr || []).filter(Boolean).map(m => {
    const tipo = m.tipo || (m.expositor_id ? 'expositor' : m.sesion_id ? 'sesion' : m.zona_id ? 'zona' : m.acceso_id ? 'acceso' : 'punto');
    const base = { ...m, tipo, _k: m._k || uid() };
    if (tipo === 'punto') {
      base.codigo = m.codigo || (m.icono ? '' : '') || (m.label ? m.label.slice(0, 3).toUpperCase() : 'P');
      base.nombre = m.nombre || m.label || '';
      base.color = m.color || COLORES_PUNTO[0];
      delete base.icono; delete base.label;
    }
    if (tipo === 'zona') base.color = m.color || '#0EA5E9';
    if (tipo === 'acceso') base.color = m.color || '#3B82F6';
    return base;
  });
}

export default function MapaSection({ evento }) {
  const { success, error } = useToast();
  const [expositores, setExpositores] = useState(null);
  const [sesiones, setSesiones] = useState([]);
  const [imagen, setImagen] = useState(evento.page_json?.mapa?.imagen_url || '');
  const [marcadores, setMarcadores] = useState(() => normMarcadores(evento.page_json?.mapa?.marcadores));
  const [pestana, setPestana] = useState('expositor'); // expositor | sesion | punto | zona
  const [selK, setSelK] = useState(null);              // marcador seleccionado (para editar)
  const [saving, setSaving] = useState(false);
  /* Las zonas se administran en «Zonas de interés» y las puertas en «Accesos e
     ingresos»; aquí SÓLO se colocan en el plano. Las dos igual, y por la misma
     razón.

     Antes esta pantalla también editaba el nombre y el aforo de una zona, y
     los guardaba por su propio camino: dos formularios para lo mismo y dos
     escrituras sobre `page_json.zonas`. Se sostenía con un flag —`zonasTocadas`—
     que evitaba pisar lo que la otra pantalla hubiera guardado mientras ésta
     estaba abierta. Un candado así es la señal de que había dos dueños de un
     mismo dato; el arreglo es tener uno. */
  const zonas = useMemo(() => (evento.page_json?.zonas || []).filter(z => z?.id), [evento.page_json]);
  const accesos = useMemo(() => (evento.page_json?.accesos || []).filter(a => a?.id), [evento.page_json]);
  const [aforo, setAforo] = useState([]);              // ocupación viva, para verla sobre el plano
  /* Si la cifra que se enseña es la de ahora o la última que llegó. Se dice en
     pantalla: un número viejo sin avisar es peor que no tenerlo. */
  const [aforoFresco, setAforoFresco] = useState(true);
  const [mostrarAforo, setMostrarAforo] = useState(Boolean(evento.page_json?.mapa?.mostrar_aforo));
  const mapRef = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    Promise.all([
      /* Sólo los que de verdad tienen mesa/stand (rol 'comprador'): un
         'vendedor' de la rueda de negocios no tiene ubicación fija que
         colocar en el plano. */
      networkingApi.expositoresAdmin(evento.id, true).catch(() => ({ expositores: [] })),
      agendaApi.sessions(evento.id).catch(() => ({ sessions: [] })),
    ]).then(([ex, ag]) => { setExpositores(ex.expositores || []); setSesiones(ag.sessions || []); });
  }, [evento.id]);

  /* El aforo se refresca en vivo (sondeo que se para con la pestaña oculta): es
     lo que hace que el «en fuego» de una zona signifique algo mientras se opera
     el evento, no sólo al abrir la pantalla. */
  const refrescarAforo = useCallback(
    () => clientesApi.aforoZonas(evento.id)
      .then(d => { setAforo(d.zonas || []); setAforoFresco(true); })
      /* Un sondeo que falla se queda con la última cifra buena.
         Aquí es peor que en una lista: el aforo es un NÚMERO, y «0 dentro»
         no se lee como «no lo sé», se lee como «no hay nadie». Con eso se
         abre una zona que está llena. Se conserva lo último que llegó y se
         marca como no fresco. */
      .catch(() => setAforoFresco(false)),
    [evento.id],
  );
  useEffect(() => { refrescarAforo(); }, [refrescarAforo]);
  useSondeo(refrescarAforo, 15000);

  const expoPorId = useMemo(() => new Map((expositores || []).map(e => [e.id, e])), [expositores]);
  const sesPorId  = useMemo(() => new Map(sesiones.map(s => [s.id, s])), [sesiones]);
  const zonaPorId = useMemo(() => new Map(zonas.map(z => [z.id, z])), [zonas]);
  const aforoPorId = useMemo(() => new Map(aforo.map(a => [a.id, a])), [aforo]);
  const colocExpo = useMemo(() => new Set(marcadores.filter(m => m.tipo === 'expositor').map(m => m.expositor_id)), [marcadores]);
  const colocSes  = useMemo(() => new Set(marcadores.filter(m => m.tipo === 'sesion').map(m => m.sesion_id)), [marcadores]);
  const colocZona = useMemo(() => new Set(marcadores.filter(m => m.tipo === 'zona').map(m => m.zona_id)), [marcadores]);
  const colocAcc  = useMemo(() => new Set(marcadores.filter(m => m.tipo === 'acceso').map(m => m.acceso_id)), [marcadores]);
  const accesoPorId = useMemo(() => new Map(accesos.map(a => [a.id, a])), [accesos]);
  const sinExpo = (expositores || []).filter(e => !colocExpo.has(e.id));
  const sinSes  = sesiones.filter(s => !colocSes.has(s.id));
  const sinZona = zonas.filter(z => !colocZona.has(z.id));
  const sinAcceso = accesos.filter(a => !colocAcc.has(a.id));
  const sel = marcadores.find(m => m._k === selK) || null;

  const agregar = (m) => { const _k = uid(); setMarcadores(l => [...l, { ...m, x: 50, y: 50, _k }]); setSelK(_k); };
  const setMarc = (k, patch) => setMarcadores(l => l.map(m => m._k === k ? { ...m, ...patch } : m));
  const quitar = (k) => { setMarcadores(l => l.filter(m => m._k !== k)); if (selK === k) setSelK(null); };

  /* Drag con distinción de clic: si casi no se mueve, se trata como selección. */
  const onPointerDown = (k) => (e) => {
    e.preventDefault();
    drag.current = { k, sx: e.clientX, sy: e.clientY, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || !mapRef.current) return;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) d.moved = true;
    if (!d.moved) return;
    const r = mapRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
    setMarc(d.k, { x, y });
  };
  const onPointerUp = () => {
    const d = drag.current;
    if (d && !d.moved) setSelK(d.k); // fue un clic → seleccionar para editar
    drag.current = null;
  };

  const guardar = async () => {
    setSaving(true);
    try {
      const limpios = marcadores.map(({ _k, ...m }) => m);
      /* Sólo `mapa`. Esta pantalla no es dueña de `zonas` ni de `accesos`: los
         coloca. Y el PATCH mezcla `page_json` por clave de primer nivel desde
         la 0064, así que mandar sólo la nuestra no toca las de nadie. */
      const parche = { mapa: { imagen_url: imagen || '', marcadores: limpios, mostrar_aforo: mostrarAforo } };
      await eventosApi.update(evento.id, { page_json: parche });
      success('Mapa guardado. Agrégalo a la landing con el bloque “Mapa del evento”.');
    } catch (e) { error(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  if (expositores === null) return <GLoader message="Cargando mapa…" />;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold font-display text-text-1 tracking-tight">Mapa del evento</h2>
          <p className="text-sm text-text-2 mt-1">Sube el plano y ubica expositores, sub-eventos, puntos de interés y las zonas de aforo.</p>
        </div>
        <button onClick={guardar} disabled={saving} className="btn-primary">{saving ? 'Guardando…' : 'Guardar mapa'}</button>
      </div>

      {/* El aforo que se ve sobre el plano es un NÚMERO, y un número viejo no
          se distingue de uno bueno. «0 dentro» no se lee como «no lo sé», se
          lee como «no hay nadie» — y con eso se abre una zona que está llena.
          Así que cuando el pulso deja de llegar se dice, en vez de seguir
          pintando la última cifra como si fuera de ahora. */}
      {!aforoFresco && (
        <div className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-2.5">
          <p className="text-sm text-text-1">El aforo en vivo no se está actualizando.</p>
          <p className="text-xs text-text-3 mt-0.5">
            Las cifras del plano son las últimas que llegaron, no las de ahora mismo. Se reintenta solo.
          </p>
        </div>
      )}

      <div className="card">
        <div className="card-body space-y-4">
          <div>
            <label className="label">Plano del recinto</label>
            <ImagePicker value={imagen} onChange={setImagen} ownerId={evento.id} placeholder="Sube una imagen del plano/mapa" />
          </div>

          {/* En el panel el aforo se ve siempre; esto decide si además lo ve el
              público. Apagado por defecto: es un dato de operación, y en la
              página pública lo pide cada visitante que la abre. */}
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input type="checkbox" checked={mostrarAforo} onChange={e => setMostrarAforo(e.target.checked)}
              className="w-4 h-4 mt-0.5 accent-[#8B5CF6]" />
            <span className="text-sm">
              <span className="text-text-1 block">Enseñar el aforo de las zonas en el mapa público</span>
              <span className="text-xs text-text-3">
                El visitante ve cuánta gente hay en cada zona y cuál está llena. Útil para repartir gente; súbele algo de trabajo al servidor en el pico del evento.
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_280px] gap-5 items-start">
        {/* Lienzo del mapa (alto acotado a 65vh; el contenedor = la imagen) */}
        <div>
          {!imagen ? (
            <div className="rounded-3xl border border-dashed border-border bg-surface/40 px-6 py-20 text-center">
              <p className="text-sm text-text-3">Sube el plano arriba para empezar a ubicar cosas.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-surface-2 overflow-auto flex justify-center">
              <div ref={mapRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
                className="relative select-none" style={{ touchAction: 'none' }}>
                <img src={imagen} alt="Plano" className="block max-h-[65vh] w-auto max-w-full pointer-events-none" draggable={false} />
                {marcadores.map(m => (
                  <Marcador key={m._k} m={m} expo={expoPorId.get(m.expositor_id)} ses={sesPorId.get(m.sesion_id)}
                    zona={zonaPorId.get(m.zona_id)} aforo={aforoPorId.get(m.zona_id)} acceso={accesoPorId.get(m.acceso_id)}
                    seleccionado={selK === m._k}
                    onPointerDown={onPointerDown(m._k)} onQuitar={() => quitar(m._k)} />
                ))}
              </div>
            </div>
          )}
          <p className="text-[11px] text-text-3 mt-2">Arrastra para mover · un clic selecciona para editar o quitar.</p>
        </div>

        {/* Panel derecho: editor del seleccionado, o la paleta */}
        <div className="rounded-2xl border border-border bg-surface/40 p-3">
          {sel ? (
            <EditorMarcador sel={sel} expo={expoPorId.get(sel.expositor_id)} ses={sesPorId.get(sel.sesion_id)}
              zona={zonaPorId.get(sel.zona_id)} aforo={aforoPorId.get(sel.zona_id)} acceso={accesoPorId.get(sel.acceso_id)}
              onChange={(p) => setMarc(sel._k, p)}
              onQuitar={() => quitar(sel._k)} onCerrar={() => setSelK(null)} />
          ) : (
            <Paleta pestana={pestana} setPestana={setPestana}
              expositores={expositores} sinExpo={sinExpo} sinSes={sinSes} sinZona={sinZona} sinAcceso={sinAcceso}
              onAgregar={agregar} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Un marcador en el lienzo ── */
function Marcador({ m, expo, ses, zona, aforo, acceso, seleccionado, onPointerDown, onQuitar }) {
  const ring = seleccionado ? 'ring-4 ring-accent' : 'ring-2 ring-white/70';
  const etiqueta = m.tipo === 'punto' ? m.nombre
    : m.tipo === 'sesion' ? ses?.titulo
    : m.tipo === 'zona' ? (zona?.nombre || 'Zona borrada') + (zona?.aforo_max ? ` · ${zona.aforo_max}` : '')
    : m.tipo === 'acceso' ? (acceso?.nombre || 'Puerta borrada')
    : expo?.nombre;
  return (
    <div onPointerDown={onPointerDown}
      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing group flex flex-col items-center"
      style={{ left: `${m.x}%`, top: `${m.y}%` }}>
      <CirculoMarcador m={m} expo={expo} ses={ses} zona={zona} aforo={aforo} acceso={acceso} ring={ring} />
      {etiqueta && (
        <span className="mt-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] whitespace-nowrap max-w-[120px] truncate">
          {etiqueta}
        </span>
      )}
      <button onPointerDown={e => e.stopPropagation()} onClick={onQuitar}
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-danger text-white text-[11px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">×</button>
    </div>
  );
}

/* El círculo, ahora en `components/mapa/MarcadorMapa.jsx`.
 *
 * Esta función pintaba las cinco ramas por tipo a mano, y el mapa PÚBLICO
 * (`editor/blocks.jsx`) tenía las mismas cinco copiadas. Cada corrección había
 * que hacerla dos veces, y la segunda copia se enteraba cuando alguien notaba
 * que los dos mapas se veían distintos.
 *
 * Este envoltorio se queda porque traduce: el editor tiene un marcador y unos
 * mapas de ids, y el componente compartido recibe cómo pintarse. Ese reparto
 * es lo que permite que el mapa público —que recibe los datos ya resueltos por
 * el servidor, en otra forma— use el mismo círculo sin adaptarse a esta. */
export function CirculoMarcador({ m, expo, ses, zona, aforo, acceso, ring = 'ring-2 ring-white/70', size = 44 }) {
  const inicial = m.tipo === 'expositor' ? (expo?.nombre || '?')
    : m.tipo === 'sesion' ? (ses?.titulo || '?')
    : m.tipo === 'zona' ? (zona?.nombre || 'Z')
    : (acceso?.nombre || '?');

  return (
    <MarcadorMapa
      tipo={m.tipo}
      color={m.color}
      size={size}
      ring={ring}
      logoUrl={expo?.logo_url || ''}
      inicial={inicial}
      valor={m.tipo === 'zona' ? (aforo?.dentro ?? null) : null}
      nivel={m.tipo === 'zona' ? (aforo?.nivel || null) : null}
      codigo={m.codigo}
    />
  );
}

/* ── Editor del marcador seleccionado ── */
function EditorMarcador({ sel, expo, ses, zona, aforo, acceso, onChange, onQuitar, onCerrar }) {
  const titulo = sel.tipo === 'expositor' ? (expo?.nombre || 'Expositor')
    : sel.tipo === 'sesion' ? (ses?.titulo || 'Sub-evento')
    : sel.tipo === 'zona' ? (zona?.nombre || 'Zona')
    : sel.tipo === 'acceso' ? (acceso?.nombre || 'Puerta') : 'Punto de interés';
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">Editar</p>
        <button onClick={onCerrar} className="text-text-3 hover:text-text-1 text-sm">✕</button>
      </div>

      {sel.tipo === 'punto' ? (
        <div className="space-y-3">
          <div>
            <label className="label text-xs">Código (va dentro del círculo)</label>
            <input value={sel.codigo || ''} maxLength={4} onChange={e => onChange({ codigo: e.target.value.toUpperCase() })}
              placeholder="Ej. S1" className="input" />
          </div>
          <div>
            <label className="label text-xs">Nombre (aparece debajo y en la card)</label>
            <input value={sel.nombre || ''} onChange={e => onChange({ nombre: e.target.value })}
              placeholder="Ej. Plazoleta de comida" className="input" />
          </div>
          <div>
            <label className="label text-xs">Color</label>
            <div className="flex flex-wrap gap-1.5">
              {COLORES_PUNTO.map(c => (
                <button key={c} onClick={() => onChange({ color: c })}
                  className={`w-6 h-6 rounded-full border-2 ${sel.color === c ? 'border-text-1' : 'border-transparent'}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
          <div>
            <label className="label text-xs">Descripción (opcional)</label>
            <textarea value={sel.descripcion || ''} onChange={e => onChange({ descripcion: e.target.value })}
              rows={3} placeholder="Lo que verá quien haga clic en este punto en la página pública"
              className="input resize-none" />
          </div>
        </div>
      ) : sel.tipo === 'acceso' ? (
        <div className="space-y-3">
          {!acceso ? (
            <p className="text-xs text-danger">Esta puerta ya no existe (la borraron en Accesos e ingresos). Quítala del mapa.</p>
          ) : (<>
            <p className="text-sm font-medium text-text-1">{acceso.nombre}</p>
            <p className="text-xs text-text-3">
              El nombre, las boletas que admite y quién registra se editan en <b>Asistentes → Accesos e ingresos</b>. Aquí sólo se decide dónde queda en el plano.
            </p>
            <div>
              <label className="label text-xs">Color en el plano</label>
              <div className="flex flex-wrap gap-1.5">
                {COLORES_PUNTO.map(c => (
                  <button key={c} onClick={() => onChange({ color: c })}
                    className={`w-6 h-6 rounded-full border-2 ${sel.color === c ? 'border-text-1' : 'border-transparent'}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
            <p className="text-[11px] text-text-3">En el tablero en vivo el círculo lleva los ingresos registrados por esta puerta.</p>
          </>)}
        </div>
      ) : sel.tipo === 'zona' ? (
        <div className="space-y-3">
          {!zona ? (
            <p className="text-xs text-danger">Esta zona ya no existe (la borraron en Zonas de interés). Quítala del mapa.</p>
          ) : (<>
            <p className="text-sm font-medium text-text-1">
              {zona.nombre}
              {zona.aforo_max ? <span className="text-text-3 font-normal"> · aforo {zona.aforo_max}</span> : null}
            </p>
            <p className="text-xs text-text-3">
              El nombre y el aforo máximo se editan en <b>Espacio del evento → Zonas de interés</b>, que es
              donde viven las zonas. Aquí sólo se decide dónde queda en el plano.
            </p>
            <div>
              <label className="label text-xs">Color en el plano</label>
              <div className="flex flex-wrap gap-1.5">
                {COLORES_PUNTO.map(c => (
                  <button key={c} onClick={() => onChange({ color: c })}
                    className={`w-6 h-6 rounded-full border-2 ${sel.color === c ? 'border-text-1' : 'border-transparent'}`}
                    style={{ background: c }} />
                ))}
              </div>
              <p className="text-[11px] text-text-3 mt-1">En el tablero en vivo manda la ocupación: verde, ámbar o rojo según cómo vaya.</p>
            </div>
            <div className="rounded-lg bg-surface-2 border border-border px-3 py-2">
              <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">Ahora dentro</p>
              <p className="text-xl font-bold font-display tabular-nums text-text-1">
                {aforo ? aforo.dentro : '—'}{zona.aforo_max ? <span className="text-text-3 text-sm font-normal"> / {zona.aforo_max}</span> : ''}
                {aforo?.nivel === 'en_fuego' && <span className="ml-1.5 text-base align-middle">🔥</span>}
              </p>
              {aforo?.ocupacion_pct != null && (
                <p className={`text-[11px] font-semibold ${aforo.nivel === 'en_fuego' ? 'text-danger' : aforo.nivel === 'caliente' ? 'text-orange-500' : 'text-text-3'}`}>
                  {aforo.ocupacion_pct}%{aforo.nivel === 'en_fuego' ? ' · en fuego en el mapa' : aforo.nivel === 'caliente' ? ' · casi llena' : ''}
                </p>
              )}
              <p className="text-[11px] text-text-3">Se opera en Asistentes → Aforo por zonas.</p>
            </div>
          </>)}
        </div>
      ) : (
        <div className="text-sm text-text-2">
          <p className="font-medium text-text-1">{titulo}</p>
          <p className="text-xs text-text-3 mt-1">
            {sel.tipo === 'expositor' ? 'La info y los premios los edita la propia empresa desde su ficha.' : 'La info sale del sub-evento en el Espacio del evento.'}
          </p>
        </div>
      )}

      <button onClick={onQuitar} className="w-full mt-4 py-2 rounded-lg text-sm text-danger border border-danger/30 hover:bg-danger/10 transition-colors">
        Quitar del mapa
      </button>
    </div>
  );
}

/* ── Paleta para agregar marcadores ── */
function Paleta({ pestana, setPestana, expositores, sinExpo, sinSes, sinZona, sinAcceso = [], onAgregar }) {
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState(COLORES_PUNTO[0]);

  const crearPunto = () => {
    onAgregar({ tipo: 'punto', codigo: (codigo || 'P').toUpperCase().slice(0, 4), nombre: nombre.trim(), color });
    setCodigo(''); setNombre('');
  };

  return (
    <>
      <div className="flex items-center gap-1 bg-surface-2 border border-border rounded-lg p-1 mb-3">
        {[['expositor', 'Expos'], ['sesion', 'Sub-ev.'], ['punto', 'Puntos'], ['zona', 'Zonas'], ['acceso', 'Puertas']].map(([k, l]) => (
          <button key={k} onClick={() => setPestana(k)}
            className={`flex-1 py-1.5 rounded-md text-[11px] font-medium transition-colors ${pestana === k ? 'bg-surface-3 text-text-1' : 'text-text-3 hover:text-text-2'}`}>{l}</button>
        ))}
      </div>

      <div className="max-h-[55vh] overflow-y-auto space-y-1.5">
        {pestana === 'expositor' && (
          (expositores || []).length === 0
            ? <p className="text-xs text-text-3 px-1">No hay expositores todavía.</p>
            : sinExpo.length === 0
              ? <p className="text-xs text-text-3 px-1">Todos están en el mapa.</p>
              : sinExpo.map(e => (
                <PaletaItem key={e.id} onClick={() => onAgregar({ tipo: 'expositor', expositor_id: e.id })} logo={e.logo_url} nombre={e.nombre} />
              ))
        )}

        {pestana === 'sesion' && (
          sinSes.length === 0
            ? <p className="text-xs text-text-3 px-1">No hay sub-eventos por ubicar.</p>
            : sinSes.map(s => (
              <PaletaItem key={s.id} onClick={() => onAgregar({ tipo: 'sesion', sesion_id: s.id })} inicial={(s.titulo || '?')[0]} nombre={s.titulo} />
            ))
        )}

        {pestana === 'punto' && (
          <div className="space-y-3">
            <p className="text-[11px] text-text-3">Crea tus propias categorías: un código corto (S1, S2, C1…) + su nombre.</p>
            <div className="flex gap-2">
              <input value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} maxLength={4} placeholder="S1" className="input w-16 text-center font-bold" />
              <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Plazoleta de comida" className="input flex-1" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COLORES_PUNTO.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-text-1' : 'border-transparent'}`} style={{ background: c }} />
              ))}
            </div>
            <button onClick={crearPunto} className="btn-primary btn-sm w-full">+ Agregar punto al mapa</button>
          </div>
        )}

        {pestana === 'zona' && (
          <div className="space-y-3">
            <p className="text-[11px] text-text-3">
              Zonas de aforo: el marcador muestra cuánta gente hay dentro, en vivo. Las mismas de Zonas de interés.
            </p>
            {/* Las zonas se crean en Espacio del evento → Zonas de interés, y
               sólo ahí: tener el alta también aquí eran dos formularios para la
               misma cosa, y uno de los dos siempre quedaba desactualizado. Este
               mapa sólo coloca zonas que ya existen — mismo trato que Puertas. */}
            {sinZona.length === 0 ? (
              <p className="text-xs text-text-3 px-1">
                No hay zonas por colocar. Se crean en <b>Espacio del evento → Zonas de interés</b>.
              </p>
            ) : (
              <div className="space-y-1.5">
                {sinZona.map(z => (
                  <PaletaItem key={z.id} onClick={() => onAgregar({ tipo: 'zona', zona_id: z.id, color: '#0EA5E9' })}
                    inicial={(z.nombre || '?')[0]} nombre={`${z.nombre}${z.aforo_max ? ` · ${z.aforo_max}` : ''}`} />
                ))}
              </div>
            )}
          </div>
        )}
        {pestana === 'acceso' && (
          <div className="space-y-3">
            <p className="text-[11px] text-text-3">
              Las entradas del evento. En el tablero en vivo cada una enseña cuánta gente ha registrado.
            </p>
            {sinAcceso.length === 0 ? (
              <p className="text-xs text-text-3 px-1">
                No hay puertas por colocar. Se crean en <b>Asistentes → Accesos e ingresos</b>.
              </p>
            ) : sinAcceso.map(a => (
              <PaletaItem key={a.id} onClick={() => onAgregar({ tipo: 'acceso', acceso_id: a.id, color: '#3B82F6' })}
                inicial={(a.nombre || '?')[0]} nombre={a.nombre} />
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-text-3 mt-3">Clic en un ítem para ponerlo en el centro; luego arrástralo.</p>
    </>
  );
}

function PaletaItem({ onClick, logo, inicial, nombre }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border hover:border-primary/40 hover:bg-surface-2 transition-colors text-left">
      {logo
        ? <img src={logo} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
        : <span className="w-7 h-7 rounded-full bg-surface-2 flex items-center justify-center text-xs font-bold text-text-3 flex-shrink-0">{inicial || (nombre || '?')[0]}</span>}
      <span className="text-sm text-text-1 truncate flex-1">{nombre}</span>
      <span className="text-[10px] text-text-3">＋</span>
    </button>
  );
}
