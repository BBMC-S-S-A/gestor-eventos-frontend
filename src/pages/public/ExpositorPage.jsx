import { useEffect, useState, useCallback, useRef } from 'react';
import { leerQr } from '../../lib/qrEscaneado.js';
import { useParams, Link } from 'react-router-dom';
import { eventosApi } from '../../api/eventos.js';
import { expositorApi } from '../../api/interacciones.js';
import ImagePicker from '../../components/ui/ImagePicker.jsx';
import QrScanner from '../../components/ui/QrScanner.jsx';
import GLoader from '../../components/ui/GLoader.jsx';
import Icono from '../../components/ui/Iconos.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Volver from '../../components/ui/Volver.jsx';
import { mensajePublico } from '../../lib/mensajeDeError.js';

/* Página pública /expositor/:codigo
   La empresa que compró una boleta-Stand edita su propia ficha con el código
   de su boleta (misma idea que /mi-ticket). La ficha aparece luego en el
   evento. Editar la ficha propia no emite valor, así que el código basta. */

const REDES = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook',  label: 'Facebook' },
  { key: 'linkedin',  label: 'LinkedIn' },
  { key: 'whatsapp',  label: 'WhatsApp' },
];

export default function ExpositorPage() {
  const { codigo } = useParams();
  const [estado, setEstado] = useState('cargando'); // cargando | ok | error
  const [fallo, setFallo] = useState(null);
  const [intento, setIntento] = useState(0);
  const [data, setData] = useState(null);
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState('ficha'); // ficha | puntos | premios
  /* Cuántas salieron de su inscripción, para poder decírselo. */
  const [heredadas, setHeredadas] = useState(0);

  useEffect(() => {
    eventosApi.fichaExpositor(codigo)
      .then(d => {
        setData(d);
        /* La ficha, y encima lo que la empresa ya contestó al comprar su stand.
           El servidor manda las sugerencias APARTE y sólo para las columnas que
           están vacías, así que esto rellena huecos y nunca pisa lo suyo.
           Sin esto le pedíamos el teléfono, la web y el sector otra vez media
           hora después de que los escribiera — y lo que no rellenara se quedaba
           en blanco en una ficha que es pública. */
        setF(normaliza({ ...(d.ficha || {}), ...(d.sugeridas || {}) }));
        setHeredadas(Object.keys(d.sugeridas || {}).length);
        setEstado('ok');
      })
      /* El error se MIRA. Se descartaba entero, y la pantalla de abajo
         afirmaba que el código no corresponde a un stand — una acusación
         concreta a partir de no saber nada. Un corte de red, un CORS o un 500
         se leían igual que un código inventado, y quien acaba de pagar su
         stand se queda mirando su código bueno con un cartel que dice que no
         vale. */
      .catch(e => { setFallo(mensajePublico(e, `El código ${codigo} no corresponde a un stand.`)); setEstado('error'); });
  }, [codigo, intento]);

  const set = (patch) => setF(x => ({ ...x, ...patch }));
  const setRed = (k, v) => setF(x => ({ ...x, redes: { ...x.redes, [k]: v } }));

  const guardar = async (marcarCompleta) => {
    if (!f.nombre.trim()) { setMsg('El nombre es obligatorio.'); return; }
    setSaving(true); setMsg('');
    try {
      const d = await eventosApi.guardarFichaExpositor(codigo, { ...f, marcar_completa: marcarCompleta });
      setF(normaliza(d.ficha));
      setMsg(marcarCompleta ? '¡Ficha publicada! Ya aparece en el evento.' : 'Guardado.');
    } catch (e) { setMsg(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  if (estado === 'cargando') return <section className="px-5 py-20 max-w-lg mx-auto"><GLoader message="Cargando tu ficha…" /></section>;

  if (estado === 'error') return (
    <section className="px-5 py-20 max-w-md mx-auto text-center animate-[fadeUp_0.4s_ease_both]">
      <p className="text-xs uppercase tracking-widest text-danger mb-3">
        {fallo?.reintentable ? 'No pudimos cargarla' : 'Ficha no encontrada'}
      </p>
      <h1 className="text-2xl font-bold font-display text-text-1 mb-3">{fallo?.texto}</h1>
      {/* La instrucción de revisar el código sólo cuando el código puede ser
          el problema. Con un fallo de comunicación, mandar a mirar el código
          es mandar a buscar donde no está. */}
      {fallo?.reintentable ? (
        <button onClick={() => setIntento(n => n + 1)}
          className="mb-6 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border
                     text-sm text-text-1 hover:bg-surface-2 transition-colors">
          Reintentar
        </button>
      ) : (
        <p className="text-sm text-text-2 mb-6">Usa el código de tu boleta de stand. Si acabas de pagar, espera unos segundos y recarga.</p>
      )}
      <div><Volver a="/explorar" tono="chip">Explorar eventos</Volver></div>
    </section>
  );

  if (!data.pagada) return (
    <section className="px-5 py-20 max-w-md mx-auto text-center animate-[fadeUp_0.4s_ease_both]">
      <h1 className="text-2xl font-bold font-display text-text-1 mb-3">Tu stand aún no está confirmado</h1>
      <p className="text-sm text-text-2">Cuando se confirme el pago de tu boleta de stand podrás editar tu ficha aquí.</p>
    </section>
  );

  const ev = data.evento || {};

  return (
    <section className="px-5 py-10 max-w-2xl mx-auto animate-[fadeUp_0.4s_ease_both]">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-widest text-text-3 font-semibold mb-1">Tu stand en {ev.titulo}</p>
        <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-text-1">{f.nombre || 'Tu expositor'}</h1>
        <p className="text-sm text-text-2 mt-1">Gestiona tu ficha, da puntos a los asistentes y entrega tus premios.</p>
      </div>

      <div className="flex items-center gap-1 bg-surface-2 border border-border rounded-xl p-1 mb-6 w-fit">
        {/* «Mis contactos» faltaba, y era la mitad que importa: el stand
            registraba gente todo el día y no tenía dónde verla. El servidor
            devolvía los últimos 100 desde siempre —`expositorApi.historial`—
            y no lo llamaba nadie. Un stand se monta para llevarse los
            contactos, no para repartir puntos. */}
        {[['ficha', 'Mi ficha'], ['cronograma', 'Cronograma'], ['puntos', 'Dar puntos'], ['contactos', 'Mis contactos'], ['premios', 'Mis premios']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === k ? 'bg-surface-3 text-text-1' : 'text-text-3 hover:text-text-2'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'cronograma' && <CronogramaTab codigo={codigo} />}
      {tab === 'puntos'  && <PuntosTab codigo={codigo} nombre={f.nombre} />}
      {tab === 'contactos' && <ContactosTab codigo={codigo} />}
      {tab === 'premios' && <PremiosTab codigo={codigo} />}

      {tab === 'ficha' && (<>
      {/* Se dice de dónde salen esos datos. Ver campos ya escritos sin
          explicación hace dudar de si la ficha ya se envió — y aquí «enviada»
          significa «publicada para todo el evento». */}
      {heredadas > 0 && (
        <div className="rounded-2xl border border-border bg-surface-2/40 px-4 py-3 mb-4 text-[13px] text-text-2 leading-relaxed">
          {heredadas === 1
            ? 'Rellenamos 1 dato con lo que pusiste al comprar tu stand.'
            : `Rellenamos ${heredadas} datos con lo que pusiste al comprar tu stand.`}
          {' '}Revísalos: todavía no están guardados.
        </div>
      )}
      {f.estado_ficha !== 'completa' && (
        <div className="rounded-2xl border border-warning/25 bg-warning/5 px-4 py-3 mb-5 text-sm text-text-2">
          Tu ficha está en <strong className="text-text-1">borrador</strong> y todavía no es visible. Complétala y pulsa “Publicar”.
        </div>
      )}

      <div className="space-y-5">
        {/* Persona / empresa */}
        <div className="card">
          <div className="card-body space-y-4">
            <div>
              <label className="label">¿Quién eres?</label>
              <div className="grid grid-cols-2 gap-2">
                {[['empresa', 'Empresa'], ['natural', 'Persona natural']].map(([v, l]) => (
                  <button key={v} onClick={() => set({ tipo_persona: v })}
                    className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors
                      ${f.tipo_persona === v ? 'border-accent bg-accent/10 text-text-1' : 'border-border text-text-3 hover:text-text-1'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="field">
                <label className="label">{f.tipo_persona === 'natural' ? 'Nombre *' : 'Nombre de la empresa *'}</label>
                <input className="input" value={f.nombre} onChange={e => set({ nombre: e.target.value })} />
              </div>
              <div className="field">
                <label className="label">Número de stand</label>
                <input className="input" value={f.stand} onChange={e => set({ stand: e.target.value })} placeholder="Ej. A-12" />
              </div>
            </div>
            <div className="field">
              <label className="label">Logo</label>
              <ImagePicker value={f.logo_url} onChange={v => set({ logo_url: v })} ownerId={codigo} placeholder="Logo de tu marca" />
            </div>
            <div className="field">
              <label className="label">Descripción</label>
              <textarea className="input resize-none" rows={3} value={f.descripcion}
                onChange={e => set({ descripcion: e.target.value })} placeholder="¿Qué ofreces? ¿Por qué visitar tu stand?" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label className="label">NIT <span className="lowercase tracking-normal font-normal text-text-3">(opcional)</span></label>
                {/* Texto, no número: lleva dígito de verificación y a veces se
                    escribe con guion. Se guarda tal como se escriba. */}
                <input className="input" value={f.nit} onChange={e => set({ nit: e.target.value })} placeholder="900123456-7" />
              </div>
              <div className="field">
                {/* Decía «Categoría» y la columna se llama `categoria_negocio`,
                    pero lo que se pide en una rueda de negocios es el SECTOR —y
                    es lo que ya significaba: `lib/heredarRespuestas.js` declara
                    «sector» como su primer sinónimo, con una prueba que lo
                    afirma. Cambia el rótulo, no el almacén. */}
                <label className="label">Sector <span className="lowercase tracking-normal font-normal text-text-3">(opcional)</span></label>
                <input className="input" value={f.categoria_negocio} onChange={e => set({ categoria_negocio: e.target.value })} placeholder="Ej. Agroindustria, Software, Turismo" />
              </div>
            </div>
          </div>
        </div>

        {/* Contacto y redes */}
        <div className="card">
          <div className="card-header"><h2 className="text-base font-semibold text-text-1">Contacto</h2></div>
          <div className="card-body space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="field"><label className="label">Persona de contacto</label>
                <input className="input" value={f.contacto_nombre} onChange={e => set({ contacto_nombre: e.target.value })} /></div>
              <div className="field"><label className="label">Email</label>
                <input className="input" value={f.contacto_email} onChange={e => set({ contacto_email: e.target.value })} /></div>
              <div className="field"><label className="label">Teléfono</label>
                <input className="input" value={f.contacto_telefono} onChange={e => set({ contacto_telefono: e.target.value })} /></div>
              <div className="field"><label className="label">Sitio web</label>
                <input className="input" value={f.sitio_web} onChange={e => set({ sitio_web: e.target.value })} placeholder="https://" /></div>
            </div>
            {/* Publicar el contacto es una decisión de quien lo da, no del
                formulario. Va con su explicación y no como una casilla suelta:
                lo que se enciende aquí lo ve cualquiera, sin cuenta, y un dato
                publicado no se recoge del todo. */}
            <label className="flex items-start gap-2.5 cursor-pointer rounded-2xl border border-border bg-surface-2/40 p-3">
              <input type="checkbox" checked={Boolean(f.contacto_publico)}
                onChange={e => set({ contacto_publico: e.target.checked })}
                className="accent-[#8B5CF6] w-4 h-4 mt-0.5 flex-shrink-0" />
              <span className="min-w-0">
                <span className="text-sm text-text-1 block">Que me puedan contactar desde la rueda pública</span>
                <span className="text-xs text-text-3 block leading-snug mt-0.5">
                  Tu correo y tu teléfono saldrán en la página de la rueda, que se abre sin
                  cuenta. Sirve para que te escriban quienes quieran reunirse contigo. Puedes
                  apagarlo cuando quieras, pero lo que ya se copió no vuelve.
                </span>
              </span>
            </label>

            <div className="grid sm:grid-cols-2 gap-3">
              {REDES.map(r => (
                <div className="field" key={r.key}>
                  <label className="label">{r.label}</label>
                  <input className="input" value={f.redes?.[r.key] || ''} onChange={e => setRed(r.key, e.target.value)} placeholder="usuario o enlace" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {msg && <p className="text-sm text-text-2 mt-4 text-center">{msg}</p>}

      <div className="flex items-center justify-end gap-2 mt-5">
        <button onClick={() => guardar(false)} disabled={saving} className="btn-secondary">
          {saving ? <Spinner size="sm" /> : 'Guardar borrador'}
        </button>
        <button onClick={() => guardar(true)} disabled={saving} className="btn-primary">
          {f.estado_ficha === 'completa' ? 'Guardar y mantener publicada' : 'Publicar ficha'}
        </button>
      </div>
      </>)}
    </section>
  );
}

/* ─────────── Dar puntos (escáner del expositor) ─────────── */
/* ─────────── Mis contactos ───────────

   La pestaña existía —el botón y la línea que la pinta— y el componente NO.
   Pulsar «Mis contactos» dejaba el portal del expositor en blanco con un
   `ReferenceError` en la consola: ni el build ni el linter lo veían, porque
   `no-undef` no mira dentro del JSX. Lo encontró la regla que se añadió hoy
   justo para eso.

   Y es la mitad que importa del stand: quien monta uno viene a llevarse
   contactos. La ruta ya existía y ya devolvía el nombre — sólo faltaba
   enseñarlo. */
function ContactosTab({ codigo }) {
  const [gente, setGente] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    expositorApi.historial(codigo)
      .then(d => setGente(d.interacciones || []))
      .catch(e => { setMsg(e.response?.data?.error || e.message); setGente([]); });
  }, [codigo]);

  if (gente === null) return <p className="text-sm text-text-3 py-6 text-center">Cargando tus contactos…</p>;

  if (!gente.length) {
    return (
      <div className="rounded-2xl border border-border bg-surface/40 px-5 py-8 text-center">
        <p className="text-sm text-text-1 font-medium mb-1">Todavía no has registrado a nadie.</p>
        <p className="text-xs text-text-3 max-w-xs mx-auto">
          Cada vez que escanees la escarapela de alguien en «Dar puntos», esa persona aparece aquí.
        </p>
        {msg && <p className="text-xs text-warning mt-3">{msg}</p>}
      </div>
    );
  }

  /* Una persona que pasó tres veces por el stand es UN contacto, no tres: lo
     que se lleva el expositor es una lista de gente, no un registro de
     escaneos. Se guarda la primera vez que pasó y cuántas veces. */
  const porPersona = new Map();
  for (const i of gente) {
    const clave = i.ticket?.codigo || i.ticket_id || i.id;
    const ya = porPersona.get(clave);
    if (ya) { ya.veces += 1; ya.ultima = ya.ultima || i.created_at; continue; }
    porPersona.set(clave, {
      nombre: i.ticket?.guest_nombre || 'Sin nombre',
      codigo: i.ticket?.codigo || null,
      veces: 1,
      ultima: i.created_at,
    });
  }
  const contactos = [...porPersona.values()];

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-3">
        {contactos.length} {contactos.length === 1 ? 'persona' : 'personas'} pasaron por tu stand.
      </p>
      <ul className="rounded-2xl border border-border bg-surface/40 divide-y divide-border overflow-hidden">
        {contactos.map((c, i) => (
          <li key={c.codigo || i} className="px-4 py-3 flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm text-text-1 truncate">{c.nombre}</span>
              {c.codigo && <span className="block text-[11px] font-mono text-text-3">{c.codigo}</span>}
            </span>
            {c.veces > 1 && (
              <span className="text-[11px] text-text-3 shrink-0">{c.veces} visitas</span>
            )}
          </li>
        ))}
      </ul>
      {/* Se dice lo que NO hay, porque es lo primero que se busca: el correo.
          Prometerlo entre líneas y no darlo es peor que decirlo. */}
      <p className="text-[11px] text-text-3">
        Aquí van quienes escaneaste. Los datos de contacto los reparte quien organiza el evento,
        según lo que cada persona haya autorizado.
      </p>
    </div>
  );
}

function PuntosTab({ codigo, nombre }) {
  const [cuota, setCuota] = useState(null);
  const [motivos, setMotivos] = useState(null);
  const [editando, setEditando] = useState(false);
  const [sel, setSel] = useState(null);
  const [ultimo, setUltimo] = useState(null);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState('');

  const cargar = useCallback(() => {
    /* La cuota venía en la respuesta desde siempre (`v_consumo_puntos_stand`)
       y se tiraba: el expositor no sabía cuántos puntos le quedaban hasta que
       un escaneo le decía que se había pasado. La consulta ya se pagaba. */
    expositorApi.panel(codigo)
      .then(d => { setMotivos(d.motivos || []); setCuota(d.cuota || null); })
      .catch(e => setMsg(e.response?.data?.error || e.message));
  }, [codigo]);
  useEffect(() => { cargar(); }, [cargar]);

  /* `working` es un valor capturado: dos lecturas del mismo QR en el mismo
     fotograma —que es justo lo que hace un lector de codigos apuntando a una
     pulsera— lo ven las dos en `false` y suman los puntos dos veces. La espera
     de 600 ms de abajo tapa el caso lento; esto tapa el rapido. */
  const registrando = useRef(false);
  const registrar = useCallback(async (payload) => {
    if (working || registrando.current || !sel) return;
    registrando.current = true;
    setWorking(true);
    try {
      const r = await expositorApi.registrar(codigo, { ...payload, motivo_id: sel.id });
      setUltimo({ ok: true, ...r });
    } catch (e) { setUltimo({ ok: false, error: e.response?.data?.error || e.message }); }
    finally { registrando.current = false; setTimeout(() => setWorking(false), 600); }
  }, [codigo, sel, working]);

  const onScan = useCallback((qr) => registrar(leerQr(qr)), [registrar]);

  if (motivos === null) return <GLoader message="Cargando…" />;
  if (editando) return <MotivosEditor codigo={codigo} motivos={motivos} onListo={(m) => { setMotivos(m); setEditando(false); }} />;

  const activos = motivos.filter(m => m.activo !== false);

  return (
    <div className="space-y-4">
      {activos.length === 0 ? (
        <div className="rounded-3xl border border-border bg-surface/40 px-6 py-12 text-center">
          <p className="text-sm text-text-2 mb-4">Crea los motivos por los que darás puntos en tu stand.</p>
          <button onClick={() => setEditando(true)} className="btn-primary btn-sm">Crear motivos</button>
        </div>
      ) : (<>
        <div className="rounded-3xl border border-border bg-surface/40 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">1 · Elige el motivo</p>
            <button onClick={() => setEditando(true)} className="btn-ghost btn-sm">Editar motivos</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {activos.map(m => (
              <button key={m.id} onClick={() => setSel(m)}
                className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors flex items-center gap-2
                  ${sel?.id === m.id ? 'border-success bg-success/10 text-text-1' : 'border-border text-text-3 hover:text-text-1'}`}>
                ★ {m.nombre} <span className="text-[10px] font-mono text-success">+{m.puntos}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-surface/40 p-5">
          <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold mb-3">2 · Escanea al asistente</p>
          {!sel ? <p className="text-sm text-text-3">Elige un motivo arriba para habilitar el escáner.</p> : (<>
            <QrScanner onScan={onScan} containerId="qr-expo-pts"
              titulo={`${sel.nombre} · apunta al QR`} textoActivar="Escanear en mi stand"
              descripcion={cuota?.cuota_puntos != null
                ? `Te quedan ${Math.max(0, cuota.disponibles ?? 0)} de ${cuota.cuota_puntos} puntos.`
                : 'Escanea la escarapela del asistente para darle tus puntos.'}
              overlay={ultimo ? <ResultadoExpo r={ultimo} /> : null} />
            <CodigoManual onSubmit={(c) => registrar({ codigo: c })} disabled={working} />
          </>)}
          {ultimo && <div className="mt-3"><ResultadoExpo r={ultimo} /></div>}
        </div>
      </>)}
      {msg && <p className="text-sm text-danger">{msg}</p>}
    </div>
  );
}

function ResultadoExpo({ r }) {
  const ok = r.ok;
  return (
    <div className={`rounded-2xl border-2 p-4 backdrop-blur-xl bg-surface/90 ${ok ? 'border-success/40' : 'border-danger/40'} animate-[fadeUp_0.3s_ease_both]`}>
      {ok ? (
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-success text-white flex items-center justify-center text-xl font-bold">✓</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-1 truncate">{r.ticket?.nombre}</p>
            <p className="text-xs text-text-3">+{r.interaccion?.puntos} pts · saldo contigo: <strong className="text-text-1">{r.total_puntos}</strong></p>
          </div>
        </div>
      ) : <p className="text-sm text-danger">{r.error}</p>}
    </div>
  );
}

function MotivosEditor({ codigo, motivos, onListo }) {
  const [lista, setLista] = useState(() => motivos.map(m => ({ ...m, _k: m.id })));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k, p) => setLista(l => l.map(m => m._k === k ? { ...m, ...p } : m));
  const guardar = async () => {
    for (const m of lista) if (!m.nombre?.trim()) { setMsg('Todos necesitan nombre.'); return; }
    setSaving(true);
    try {
      const r = await expositorApi.guardarMotivos(codigo, lista.map(({ id, nombre, puntos, activo }) => ({ id, nombre, puntos: Number(puntos) || 0, activo })));
      onListo(r.motivos || []);
    } catch (e) { setMsg(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };
  return (
    <div className="space-y-3 max-w-xl">
      <p className="text-sm text-text-3">Tus puntos solo suman. El organizador fija un tope por escaneo.</p>
      {lista.map(m => (
        <div key={m._k} className="flex items-center gap-2 rounded-2xl border border-border bg-surface/40 p-3">
          <input value={m.nombre} onChange={e => set(m._k, { nombre: e.target.value })} placeholder="Ej. Visitó mi stand" className="input flex-1" />
          <input type="number" min="0" value={Math.abs(Number(m.puntos) || 0)} onChange={e => set(m._k, { puntos: Number(e.target.value) || 0 })} className="input w-20 text-right" />
          <span className="text-xs text-text-3">pts</span>
          <button onClick={() => setLista(l => l.filter(x => x._k !== m._k))} className="w-8 h-8 rounded-lg text-danger-light hover:bg-danger/10 flex items-center justify-center">✕</button>
        </div>
      ))}
      {msg && <p className="text-sm text-danger">{msg}</p>}
      <div className="flex items-center justify-between">
        <button onClick={() => setLista(l => [...l, { _k: Math.random().toString(36).slice(2), id: null, nombre: '', puntos: 10, activo: true }])} className="btn-ghost btn-sm">+ Añadir motivo</button>
        <button onClick={guardar} disabled={saving} className="btn-primary btn-sm">{saving ? <Spinner size="sm" /> : 'Guardar'}</button>
      </div>
    </div>
  );
}

/* ─────────── Mis premios (escanear → entregar + catálogo) ─────────── */
function PremiosTab({ codigo }) {
  const [vista, setVista] = useState('entregar'); // entregar | catalogo
  const [datos, setDatos] = useState(null);
  const [entregando, setEntregando] = useState(null);
  const [msg, setMsg] = useState('');

  const buscar = useCallback(async (params) => {
    setMsg('');
    try { setDatos(await expositorApi.saldo(codigo, params)); }
    catch (e) { setDatos(null); setMsg(e.response?.data?.error || e.message); }
  }, [codigo]);
  const onScan = useCallback((qr) => buscar(leerQr(qr)), [buscar]);

  const entregar = async (r) => {
    setEntregando(r.id);
    try { await expositorApi.canjear(codigo, { codigo: datos.ticket.codigo, recompensa_id: r.id }); await buscar({ codigo: datos.ticket.codigo }); }
    catch (e) { setMsg(e.response?.data?.error || e.message); }
    finally { setEntregando(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 bg-surface-2 border border-border rounded-xl p-1 w-fit">
        {[['entregar', 'Entregar'], ['catalogo', 'Editar premios']].map(([k, l]) => (
          <button key={k} onClick={() => setVista(k)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${vista === k ? 'bg-surface-3 text-text-1' : 'text-text-3'}`}>{l}</button>
        ))}
      </div>

      {vista === 'catalogo' ? <PremiosEditor codigo={codigo} /> : (<>
        <div className="rounded-3xl border border-border bg-surface/40 p-5">
          <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold mb-3">Escanea al asistente</p>
          <QrScanner onScan={onScan} containerId="qr-expo-canje" titulo="Canje · apunta al QR" textoActivar="Escanear para entregar"
            descripcion="Verás su saldo contigo y qué premios tuyos alcanza." />
          <CodigoManual onSubmit={(c) => buscar({ codigo: c })} disabled={false} />
        </div>
        {msg && <p className="text-sm text-danger">{msg}</p>}
        {datos && (
          <div className="rounded-3xl border-2 border-primary/30 bg-primary/5 p-6">
            <div className="flex items-baseline justify-between">
              <div><p className="text-lg font-bold font-display text-text-1">{datos.ticket.nombre}</p>
                <p className="text-xs text-text-3 font-mono">{datos.ticket.codigo}</p></div>
              <div className="text-right"><p className="text-3xl font-bold font-display tabular-nums">{datos.saldo}</p><p className="text-[11px] text-text-3">pts contigo</p></div>
            </div>
            <div className="mt-4 space-y-2">
              {(datos.recompensas || []).length === 0 && <p className="text-sm text-text-3">No tienes premios activos.</p>}
              {(datos.recompensas || []).map(r => (
                <div key={r.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface/60 px-4 py-3">
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium text-text-1 truncate">{r.titulo}</p>
                    <p className="text-xs text-text-3">{r.costo_puntos} pts{r.stock != null && ` · quedan ${Math.max(0, r.stock - r.canjeados)}`}</p></div>
                  <button onClick={() => entregar(r)} disabled={!r.alcanzable || entregando === r.id} className="btn-primary btn-sm disabled:opacity-40">
                    {entregando === r.id ? <Spinner size="sm" /> : r.agotada ? 'Agotado' : r.alcanzable ? 'Entregar' : 'Sin saldo'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </>)}
    </div>
  );
}

function PremiosEditor({ codigo }) {
  const [lista, setLista] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { expositorApi.recompensas(codigo).then(d => setLista((d.recompensas || []).map(r => ({ ...r, _k: r.id })))).catch(() => setLista([])); }, [codigo]);
  if (lista === null) return <GLoader message="Cargando…" />;
  const set = (k, p) => setLista(l => l.map(r => r._k === k ? { ...r, ...p } : r));
  const guardar = async () => {
    for (const r of lista) if (!r.titulo?.trim()) { setMsg('Todos necesitan título.'); return; }
    setSaving(true);
    try {
      const d = await expositorApi.guardarRecompensas(codigo, lista.map(({ id, titulo, descripcion, costo_puntos, stock, activo }) => ({ id, titulo, descripcion, costo_puntos, stock, activo })));
      setLista((d.recompensas || []).map(r => ({ ...r, _k: r.id }))); setMsg('Guardado.');
    } catch (e) { setMsg(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };
  return (
    <div className="space-y-3 max-w-xl">
      {lista.map(r => (
        <div key={r._k} className="rounded-2xl border border-border bg-surface/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input value={r.titulo} onChange={e => set(r._k, { titulo: e.target.value })} placeholder="Ej. Sticker, Descuento 10%" className="input flex-1" />
            <input type="number" min="0" value={r.costo_puntos ?? 0} onChange={e => set(r._k, { costo_puntos: Number(e.target.value) || 0 })} className="input w-24 text-right" />
            <span className="text-xs text-text-3">pts</span>
            <button onClick={() => setLista(l => l.filter(x => x._k !== r._k))} className="w-8 h-8 rounded-lg text-danger-light hover:bg-danger/10 flex items-center justify-center">✕</button>
          </div>
          <div className="flex items-center gap-2">
            <input value={r.descripcion || ''} onChange={e => set(r._k, { descripcion: e.target.value })} placeholder="Descripción (opcional)" className="input flex-1 text-sm" />
            <input type="number" min="0" value={r.stock ?? ''} onChange={e => set(r._k, { stock: e.target.value })} placeholder="Stock" className="input w-24 text-sm" />
          </div>
        </div>
      ))}
      {msg && <p className="text-sm text-text-2">{msg}</p>}
      <div className="flex items-center justify-between">
        <button onClick={() => setLista(l => [...l, { _k: Math.random().toString(36).slice(2), id: null, titulo: '', costo_puntos: 50, stock: '', activo: true }])} className="btn-ghost btn-sm">+ Añadir premio</button>
        <button onClick={guardar} disabled={saving} className="btn-primary btn-sm">{saving ? <Spinner size="sm" /> : 'Guardar premios'}</button>
      </div>
    </div>
  );
}

/* ─────────── Cronograma: franjas del expositor ─────────── */
function CronogramaTab({ codigo }) {
  const [franjas, setFranjas] = useState(null);
  const [form, setForm] = useState({ titulo: '', descripcion: '', inicio: '', fin: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  /* Qué franja se está editando, y con qué valores. Antes sólo se podía crear
     y borrar: corregir una errata obligaba a borrar la franja y escribirla
     entera otra vez. */
  const [editando, setEditando] = useState(null);
  const [edicion, setEdicion] = useState({ titulo: '', descripcion: '', inicio: '', fin: '' });

  const cargar = useCallback(() => {
    expositorApi.franjas(codigo).then(d => setFranjas(d.franjas || [])).catch(e => setMsg(e.response?.data?.error || e.message));
  }, [codigo]);
  useEffect(() => { cargar(); }, [cargar]);

  const crear = async (e) => {
    e.preventDefault();
    if (!form.titulo.trim() || !form.inicio) { setMsg('Título y hora de inicio son obligatorios.'); return; }
    setSaving(true); setMsg('');
    try {
      await expositorApi.crearFranja(codigo, {
        titulo: form.titulo, descripcion: form.descripcion || null,
        inicio: new Date(form.inicio).toISOString(),
        fin: form.fin ? new Date(form.fin).toISOString() : null,
      });
      setForm({ titulo: '', descripcion: '', inicio: '', fin: '' });
      cargar();
    } catch (e) { setMsg(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  const borrar = async (id) => { try { await expositorApi.borrarFranja(codigo, id); cargar(); } catch (e) { setMsg(e.response?.data?.error || e.message); } };

  /* `datetime-local` quiere la hora LOCAL sin zona; `toISOString` da UTC y
     mostraría otra hora al abrir el formulario. */
  const paraInput = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  const abrirEdicion = (fr) => {
    setEditando(fr.id);
    setEdicion({
      titulo: fr.titulo || '', descripcion: fr.descripcion || '',
      inicio: paraInput(fr.inicio), fin: paraInput(fr.fin),
    });
    setMsg('');
  };

  const guardarEdicion = async (e) => {
    e.preventDefault();
    if (!edicion.titulo.trim() || !edicion.inicio) { setMsg('Título y hora de inicio son obligatorios.'); return; }
    setSaving(true); setMsg('');
    try {
      await expositorApi.editarFranja(codigo, editando, {
        titulo: edicion.titulo, descripcion: edicion.descripcion || null,
        inicio: new Date(edicion.inicio).toISOString(),
        fin: edicion.fin ? new Date(edicion.fin).toISOString() : null,
      });
      setEditando(null);
      cargar();
    } catch (e) { setMsg(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  if (franjas === null) return <GLoader message="Cargando…" />;

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-text-2">Agrega las actividades de tu stand (charlas, demos, sorteos). Aparecen en el cronograma público del evento.</p>

      {franjas.length > 0 && (
        <div className="rounded-3xl border border-border bg-surface/40 divide-y divide-border overflow-hidden">
          {franjas.map(fr => (editando === fr.id ? (
            <form key={fr.id} onSubmit={guardarEdicion} className="px-4 py-3 space-y-2 bg-surface-2/40">
              <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">Editando esta franja</p>
              <input value={edicion.titulo} onChange={e => setEdicion(f => ({ ...f, titulo: e.target.value }))} className="input" />
              <input value={edicion.descripcion} onChange={e => setEdicion(f => ({ ...f, descripcion: e.target.value }))} placeholder="Descripción (opcional)" className="input" />
              <div className="grid grid-cols-2 gap-2">
                <input type="datetime-local" value={edicion.inicio} onChange={e => setEdicion(f => ({ ...f, inicio: e.target.value }))} className="input" />
                <input type="datetime-local" value={edicion.fin} onChange={e => setEdicion(f => ({ ...f, fin: e.target.value }))} className="input" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditando(null)} className="btn-ghost btn-sm flex-1">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-gradient btn-sm flex-1">{saving ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </form>
          ) : (
            <div key={fr.id} className="flex items-center gap-3 px-4 py-3">
              <span className="text-text-1 font-display font-bold tabular-nums text-sm w-14 flex-shrink-0">
                {new Date(fr.inicio).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-1 truncate">{fr.titulo}</p>
                <p className="text-[11px] text-text-3">{new Date(fr.inicio).toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short' })}</p>
              </div>
              <button onClick={() => abrirEdicion(fr)} aria-label={`Editar ${fr.titulo}`}
                className="w-8 h-8 rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-2 flex items-center justify-center flex-shrink-0">
                <Icono nombre="documento" className="w-4 h-4" />
              </button>
              <button onClick={() => borrar(fr.id)} aria-label={`Borrar ${fr.titulo}`}
                className="w-8 h-8 rounded-lg text-text-3 hover:text-danger hover:bg-danger/10 flex items-center justify-center flex-shrink-0">✕</button>
            </div>
          )))}
        </div>
      )}

      <form onSubmit={crear} className="rounded-3xl border border-border bg-surface/40 p-4 space-y-3">
        <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">Nueva franja</p>
        <input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ej. Demo del producto" className="input" />
        <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Descripción (opcional)" className="input" />
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="field"><label className="label">Inicio</label>
            <input type="datetime-local" value={form.inicio} onChange={e => setForm(f => ({ ...f, inicio: e.target.value }))} className="input bg-surface-2" /></div>
          <div className="field"><label className="label">Fin (opcional)</label>
            <input type="datetime-local" value={form.fin} onChange={e => setForm(f => ({ ...f, fin: e.target.value }))} className="input bg-surface-2" /></div>
        </div>
        {msg && <p className="text-sm text-danger">{msg}</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="btn-primary btn-sm">{saving ? <Spinner size="sm" /> : 'Agregar franja'}</button>
        </div>
      </form>
    </div>
  );
}

function CodigoManual({ onSubmit, disabled }) {
  const [c, setC] = useState('');
  return (
    <form className="flex items-center gap-2 mt-4" onSubmit={e => { e.preventDefault(); if (c.trim()) { onSubmit(c.trim().toUpperCase()); setC(''); } }}>
      <input value={c} onChange={e => setC(e.target.value.toUpperCase())} placeholder="O escribe el código del asistente" maxLength={12} className="input flex-1 font-mono text-sm" />
      <button type="submit" disabled={disabled || c.trim().length < 4} className="btn-secondary btn-sm">Ir</button>
    </form>
  );
}

function normaliza(ficha) {
  return {
    nombre: ficha?.nombre || '',
    descripcion: ficha?.descripcion || '',
    logo_url: ficha?.logo_url || '',
    stand: ficha?.stand || '',
    tipo_persona: ficha?.tipo_persona || 'empresa',
    contacto_nombre: ficha?.contacto_nombre || '',
    contacto_email: ficha?.contacto_email || '',
    contacto_telefono: ficha?.contacto_telefono || '',
    sitio_web: ficha?.sitio_web || '',
    categoria_negocio: ficha?.categoria_negocio || '',
    nit: ficha?.nit || '',
    redes: ficha?.redes || {},
    /* Si su contacto sale en la rueda pública. Son SUS datos y por eso lo
       decide aquí, no sólo el organizador. Nace apagado. */
    contacto_publico: Boolean(ficha?.contacto_publico),
    estado_ficha: ficha?.estado_ficha || 'borrador',
  };
}
