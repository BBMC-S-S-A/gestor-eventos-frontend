import { useMemo, useState } from 'react';
import Icono from '../../../../components/ui/Iconos.jsx';
import Spinner from '../../../../components/ui/Spinner.jsx';
import { TIPO_DEFECTO, tipoEspacio, tipoEstilo, esCompetitivo, tiposDelEvento } from '../../../../lib/espacio.js';
import { zonasDelEvento, etiquetaZona } from '../../../../lib/zonas.js';
import PreguntasSubEvento from '../PreguntasSubEvento.jsx';
import { torneosApi } from '../../../../api/torneos.js';
import { networkingApi } from '../../../../api/networking.js';
import { toLocalInput, withDefaultTime } from './agendaComun.jsx';

/* El formulario de un sub-evento. Es la pieza más grande de la agenda con
   diferencia —tipo, horario, sala, cupo, modo de inscripción y el editor de
   preguntas propias—, y la que más cambia, así que va sola. */

function sitiosDelEvento(evento, sessions, campo) {
  const vistos = new Map();
  const meter = (valor, origen) => {
    const v = String(valor || '').trim();
    if (!v) return;
    const k = v.toLocaleLowerCase('es');
    if (!vistos.has(k)) vistos.set(k, { valor: v, origen });
  };

  for (const s of sessions) meter(s?.[campo], 'ya en uso');

  const pj = evento?.page_json || {};
  for (const z of (Array.isArray(pj.zonas) ? pj.zonas : [])) {
    meter(z?.nombre, z?.aforo_max ? `zona · aforo ${z.aforo_max}` : 'zona de aforo');
  }
  for (const m of (Array.isArray(pj.mapa?.marcadores) ? pj.mapa.marcadores : [])) {
    if (m?.tipo === 'punto') meter(m.nombre, 'punto del plano');
  }
  /* Las puertas sólo tienen sentido como ubicación: un track es una sala. */
  if (campo === 'ubicacion') {
    for (const a of (Array.isArray(pj.accesos) ? pj.accesos : [])) meter(a?.nombre, 'puerta');
  }

  return [...vistos.values()].sort((a, b) => a.valor.localeCompare(b.valor, 'es'));
}

export default function SessionForm({ initial, speakers, prefillDate, torneos = [], evento, sessions = [], expositores = [], tiposBoleta = [], onSave, onCancel }) {
  /* Los grupos que este evento ya usa, para sugerirlos. Se ordenan para que la
     lista no baile entre aperturas, y se deduplica sin distinguir mayusculas
     —el servidor reutiliza la variante existente al guardar, asi que ofrecer
     las dos aqui solo confundiria. */
  const subcategoriasUsadas = useMemo(() => {
    const vistos = new Map();
    for (const s of sessions) {
      const v = (s?.subcategoria || '').trim();
      if (v && !vistos.has(v.toLocaleLowerCase('es'))) vistos.set(v.toLocaleLowerCase('es'), v);
    }
    return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'es'));
  }, [sessions]);

  const zonasEvento = useMemo(() => zonasDelEvento(evento), [evento]);

  /* Declarado antes de `enganchePorNombre`: ese useMemo lee `form.zona_id` /
     `form.ubicacion` / `form.track` en su arreglo de dependencias, y ese
     arreglo se evalúa de inmediato al llamar a `useMemo` — no dentro del
     callback, que sí es perezoso. Con el `useState` de `form` más abajo en
     el código (como estaba antes), esa lectura caía en la zona muerta
     temporal de `form` y tiraba el formulario entero con un
     `ReferenceError: Cannot access 'form' before initialization`, en TODOS
     los renders, no de forma intermitente. */
  const [form, setForm] = useState({
    titulo     : initial?.titulo || '',
    descripcion: initial?.descripcion || '',
    inicio     : initial?.inicio ? toLocalInput(initial.inicio) : (prefillDate ? toLocalInput(withDefaultTime(prefillDate, 9, 0)) : ''),
    fin        : initial?.fin    ? toLocalInput(initial.fin)    : '',
    track      : initial?.track || 'principal',
    ubicacion  : initial?.ubicacion || '',
    zona_id    : initial?.zona_id || '',
    speaker_id : initial?.speaker_id || '',
    expositor_id  : initial?.expositor_id || '',
    ticket_type_id: initial?.ticket_type_id || '',
    tipo       : initial?.tipo || TIPO_DEFECTO,
    subcategoria: initial?.subcategoria || '',
    torneo_id  : initial?.torneo_id || '',
    requiere_inscripcion: Boolean(initial?.requiere_inscripcion),
    cupo       : initial?.cupo ?? '',
    formulario_modo: initial?.formulario_modo || 'ninguno',
  });

  /* ¿Esta actividad se engancharía al mapa sólo por el nombre?
   *
   * Se repite aquí la comparación que hace `lib/aforoZonas.js` en el servidor
   * —recortar y comparar sin mayúsculas, con la configuración regional del
   * español— porque es lo que decide si la actividad sale o no. Si las dos
   * dejan de coincidir, este aviso mentiría: por eso la comparación se escribe
   * igual y `tests/elEngancheAlMapaSeDice` compara las dos fuentes. */
  const enganchePorNombre = useMemo(() => {
    if (form.zona_id) return null;
    const igual = (a, b) => String(a || '').trim().toLocaleLowerCase('es')
                         === String(b || '').trim().toLocaleLowerCase('es');
    for (const z of zonasEvento) {
      if (!z?.nombre) continue;
      if (igual(form.ubicacion, z.nombre)) return { nombre: z.nombre, campo: 'ubicacion' };
      if (igual(form.track, z.nombre))     return { nombre: z.nombre, campo: 'track' };
    }
    return null;
  }, [form.zona_id, form.ubicacion, form.track, zonasEvento]);
  const tracksUsados = useMemo(() => sitiosDelEvento(evento, sessions, 'track'), [evento, sessions]);
  const ubicaciones  = useMemo(() => sitiosDelEvento(evento, sessions, 'ubicacion'), [evento, sessions]);

  const [saving, setSaving] = useState(false);
  /* Las llaves creadas SIN salir de aquí. La lista que llega por props se
     recarga cuando el padre vuelve a pedir la agenda; hasta entonces el torneo
     recién creado tiene que poder elegirse, o el formulario diría que no
     existe algo que se acaba de crear en él. */
  const [torneosNuevos, setTorneosNuevos] = useState([]);
  const [creandoTorneo, setCreandoTorneo] = useState(false);
  const [falloTorneo, setFalloTorneo] = useState('');
  /* Lo mismo para el expositor: un stand creado sin salir de aquí. */
  const [expositoresNuevos, setExpositoresNuevos] = useState([]);
  const [creandoExpositor, setCreandoExpositor] = useState(false);
  const [falloExpositor, setFalloExpositor] = useState('');
  const [nombreExpositor, setNombreExpositor] = useState(null); // null = ni siquiera se está creando
  const [preguntasOpen, setPreguntasOpen] = useState(false);
  const competitivo = esCompetitivo(form.tipo);
  const torneosTodos = [...torneos, ...torneosNuevos];

  /* Crear las llaves desde aquí, y no mandar a otra pestaña.
     ──────────────────────────────────────────────────────
     Había dos puertas para crear un torneo y ninguna llevaba a la otra: por
     eso existían cuatro torneos sin hueco en el calendario. Con el sub-evento
     ya escrito —nombre, fecha y sitio— pedir que se vaya a otra pestaña a
     escribir el nombre otra vez es lo que produce esos huérfanos.

     Se crea con el formato más simple, `eliminacion`, y no se pregunta: los
     grupos, la disciplina y las categorías se ajustan en la pestaña de Torneo,
     que es donde se trabajan las llaves. Aquí sólo hace falta que EXISTAN para
     poder vincularlas. */
  const expositoresTodos = [...expositores, ...expositoresNuevos];

  /* Crear el expositor con el nombre que se pida en el momento. Se pregunta y
     no se copia el título del sub-evento, al revés que las llaves: unas llaves
     son de ESTA actividad y se llaman como ella, pero un expositor es una
     empresa que existe por su cuenta y da la charla. Llamarlo como la sesión
     dejaría un stand llamado «Charla de apertura» en el directorio público. */
  const crearExpositor = async () => {
    const nombre = (nombreExpositor || '').trim();
    if (!nombre) { setFalloExpositor('Escribe el nombre de la empresa.'); return; }
    setCreandoExpositor(true);
    setFalloExpositor('');
    try {
      const r = await networkingApi.crearExpositor(evento.id, { nombre });
      const exp = r?.expositor || r;
      setExpositoresNuevos(x => [...x, exp]);
      setForm(f => ({ ...f, expositor_id: exp.id }));
      setNombreExpositor(null);
    } catch (e) {
      setFalloExpositor(e.response?.data?.error || e.message);
    } finally {
      setCreandoExpositor(false);
    }
  };

  const crearLlaves = async () => {
    const nombre = form.titulo.trim();
    if (!nombre) { setFalloTorneo('Ponle título al sub-evento primero: las llaves se llaman igual.'); return; }
    setCreandoTorneo(true);
    setFalloTorneo('');
    try {
      const { torneo } = await torneosApi.crear(evento.id, {
        nombre,
        formato: 'eliminacion',
        disciplina: form.subcategoria.trim() || null,
      });
      setTorneosNuevos(t => [...t, torneo]);
      setForm(f => ({ ...f, torneo_id: torneo.id }));
    } catch (e) {
      setFalloTorneo(e.response?.data?.error || e.message);
    } finally {
      setCreandoTorneo(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.titulo.trim() || !form.inicio) return;
    setSaving(true);
    await onSave({
      titulo     : form.titulo,
      descripcion: form.descripcion || null,
      inicio     : new Date(form.inicio).toISOString(),
      fin        : form.fin ? new Date(form.fin).toISOString() : null,
      track      : form.track,
      ubicacion  : form.ubicacion || null,
      zona_id    : form.zona_id || null,
      speaker_id : form.speaker_id || null,
      expositor_id  : form.expositor_id || null,
      ticket_type_id: form.ticket_type_id || null,
      tipo       : form.tipo,
      subcategoria: form.subcategoria.trim() || null,
      torneo_id  : competitivo ? (form.torneo_id || null) : null,
      requiere_inscripcion: form.requiere_inscripcion,
      /* Vacío = sin límite. No se convierte a 0, que significaría "lleno
         desde el primer minuto". */
      cupo       : form.requiere_inscripcion && form.cupo !== '' ? Number(form.cupo) : null,
      formulario_modo: form.requiere_inscripcion ? form.formulario_modo : 'ninguno',
    });
    setSaving(false);
  };

  return (
    <form onSubmit={submit} className="rounded-3xl border border-primary/25 bg-surface/40 p-5 space-y-3 animate-[fadeUp_0.3s_ease_both]">
      <p className="text-xs uppercase tracking-widest text-text-3 font-semibold">{initial ? 'Editar sub-evento' : 'Nuevo sub-evento'}</p>

      {/* Tipo de sub-evento */}
      <div className="field">
        <label className="label">Tipo</label>
        <div className="flex flex-wrap gap-1.5">
          {tiposDelEvento(evento).map(t => (
            <button type="button" key={t.id} onClick={() => setForm(f => ({...f, tipo: t.id}))}
              style={form.tipo === t.id ? tipoEstilo(t.id, evento) : undefined}
              className={`px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors flex items-center gap-1
                ${form.tipo === t.id ? '' : 'border-border text-text-3 hover:text-text-1'}`}>
              <Icono nombre={t.icono} className="w-3.5 h-3.5" />{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* El nivel de abajo, y este SI lo escribe el organizador:
            competencia -> Deportes    -> Futbol, Padel
            competencia -> Gaming      -> FIFA, Fortnite
            competencia -> Habilidades -> Hackaton

          Se usa <datalist> y no un desplegable porque hacen falta las dos
          cosas a la vez: reutilizar lo que ya se escribio en este evento
          —para no acabar con «Gaming» y «gaming» como dos grupos— y poder
          inventar uno nuevo sin tener que crearlo antes en ningun sitio. */}
      <div className="field">
        <label className="label">
          Grupo <span className="lowercase tracking-normal font-normal text-text-3">(opcional, dentro de «{tipoEspacio(form.tipo, evento).label}»)</span>
        </label>
        <input list="gestek-subcategorias" value={form.subcategoria}
          onChange={e => setForm(f => ({ ...f, subcategoria: e.target.value }))}
          placeholder="Deportes, Gaming, Desarrollo de habilidades..."
          maxLength={60}
          className="input-form" />
        <datalist id="gestek-subcategorias">
          {subcategoriasUsadas.map(v => <option key={v} value={v} />)}
        </datalist>
        <p className="text-[11px] text-text-3 mt-1">
          Para agrupar varios sub-eventos del mismo tipo. El tipo lo pone la plataforma; el grupo, tu.
        </p>
      </div>

      {competitivo && (
        <div className="field">
          <label className="label">Llaves del torneo <span className="lowercase tracking-normal font-normal text-text-3">(opcional)</span></label>
          <div className="flex items-center gap-2">
            {torneosTodos.length > 0 && (
              <select value={form.torneo_id} onChange={e => setForm(f => ({...f, torneo_id: e.target.value}))}
                className="input bg-surface-2 rounded-2xl py-3 text-base flex-1 min-w-0">
                <option value="">Sin llaves vinculadas</option>
                {torneosTodos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            )}
            <button type="button" onClick={crearLlaves} disabled={creandoTorneo}
              className="btn-secondary btn-sm flex-shrink-0">
              {creandoTorneo ? 'Creando…' : '+ Crear llaves'}
            </button>
          </div>
          {falloTorneo
            ? <p className="text-[11px] text-warning-light mt-1">{falloTorneo}</p>
            : <p className="text-[11px] text-text-3 mt-1">
                Se crean con el nombre de este sub-evento y por eliminación directa. Los grupos, los
                equipos y los resultados se llevan en la pestaña «Torneo».
              </p>}
        </div>
      )}

      <input value={form.titulo} onChange={e => setForm(f => ({...f, titulo: e.target.value}))}
        placeholder="Título" required autoFocus
        className="input-form font-medium" />
      <textarea value={form.descripcion} onChange={e => setForm(f => ({...f, descripcion: e.target.value}))}
        placeholder="Descripción (opcional)" rows={2}
        className="input-form resize-none" />
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="field">
          <label className="label">Inicio *</label>
          <input type="datetime-local" value={form.inicio} onChange={e => setForm(f => ({...f, inicio: e.target.value}))}
            required className="input bg-surface-2 rounded-2xl py-3 text-base" />
        </div>
        <div className="field">
          <label className="label">Fin (opcional)</label>
          <input type="datetime-local" value={form.fin} onChange={e => setForm(f => ({...f, fin: e.target.value}))}
            className="input bg-surface-2 rounded-2xl py-3 text-base" />
        </div>
      </div>
      {zonasEvento.length > 0 && (
        <div className="field">
          <label className="label">Zona del plano <span className="lowercase tracking-normal font-normal text-text-3">(opcional)</span></label>
          <select value={form.zona_id}
            onChange={e => setForm(f => ({ ...f, zona_id: e.target.value }))}
            className="input bg-surface-2 rounded-2xl py-3 text-base">
            <option value="">Sin zona</option>
            {zonasEvento.map(z => (
              <option key={z.id} value={z.id}>{etiquetaZona(z)}</option>
            ))}
          </select>
          <p className="text-[11px] text-text-3 mt-1">
            Al tocar esa zona en el plano, este sub-evento aparece en su programación junto con el aforo del momento.
          </p>
          {/* Antes, elegir la zona copiaba su nombre al campo «Ubicación» de
              abajo si estaba vacío. La intención era buena —son la misma
              respuesta a «dónde es»— pero el efecto era el contrario: dejaba
              DOS verdades, y en cuanto alguien renombraba la zona el texto
              copiado se quedaba viejo sin que nada avisara. Medido en
              producción: 2 de 11 sesiones tenían zona y 4 tenían ubicación
              escrita a mano. Ahora la zona es la respuesta y la ubicación es el
              detalle. */}
          {/* ── Sin zona no siempre quiere decir «no sale» ──────────────────
           *
           * Aquí ponía, tal cual: «Sin zona, esta actividad no sale en el plano
           * ni en la ficha de ninguna zona». Es FALSO, y se vio con datos
           * reales: el Game JAM de FESTECH no tiene `zona_id`, sale en la ficha
           * de «Universidad Cooperativa», y sus 16 inscritos con él.
           *
           * Sale porque el servidor tiene un respaldo (`lib/aforoZonas.js`): sin
           * `zona_id`, engancha la actividad a la zona cuyo NOMBRE coincida con
           * su sala o su track. El respaldo es bueno —hace que el mapa funcione
           * sin tocar nada— pero es invisible, y el panel estaba negándolo.
           *
           * Negarlo tiene un coste concreto: quien lee eso y aun así ve la
           * actividad en el mapa deja de creerse los avisos de esta pantalla. Y
           * quien renombra la zona no tiene forma de saber que está
           * desenganchando una actividad con gente inscrita.
           *
           * Así que se dice lo que pasa de verdad, y se ofrece lo que hay que
           * hacer: fijar la zona, para que deje de depender de que dos textos
           * sigan escribiéndose igual. */}
          {!form.zona_id && (enganchePorNombre
            ? (
              <p className="text-[11px] text-warning mt-1 leading-relaxed">
                Sale en la ficha de «{enganchePorNombre.nombre}» porque el nombre coincide con
                {enganchePorNombre.campo === 'track' ? ' la sala' : ' la ubicación'} que escribiste.
                Funciona, pero si alguien renombra esa zona, esta actividad desaparece del plano
                sin avisar. Elígela arriba y deja de depender del texto.
              </p>
            )
            : (
              <p className="text-[11px] text-warning mt-1">
                Sin zona, esta actividad no sale en el plano ni en la ficha de ninguna zona.
              </p>
            )
          )}
        </div>
      )}

      {/* Quién la da y con qué boleta se entra.
          Las dos columnas viven en `agenda_sessions` desde hace tiempo y NINGUNA
          pantalla las escribía: medido en producción, 0 de 11 sesiones tenían
          una u otra. No faltaba modelo, faltaba el campo. */}
      <div className="grid sm:grid-cols-2 gap-3">
          {/* El expositor también se puede CREAR desde aquí. Antes el campo ni
              siquiera salía si el evento no tenía ninguno: para decir quién da
              una charla había que abandonar el formulario a medias, irse a la
              Rueda de negocios y volver a empezar. Y quien se crea aquí es la
              misma ficha que un stand —misma tabla—, así que la puerta de
              entrada da igual. */}
            <div className="field">
              <label className="label">La da <span className="lowercase tracking-normal font-normal text-text-3">(opcional)</span></label>
              <div className="flex items-center gap-2">
                {nombreExpositor === null ? (<>
                  {expositoresTodos.length > 0 && (
                    <select value={form.expositor_id} onChange={e => setForm(f => ({...f, expositor_id: e.target.value}))}
                      className="input bg-surface-2 rounded-2xl py-3 text-base flex-1 min-w-0">
                      <option value="">Nadie en concreto</option>
                      {expositoresTodos.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                    </select>
                  )}
                  <button type="button" onClick={() => { setFalloExpositor(''); setNombreExpositor(''); }}
                    className="btn-secondary btn-sm flex-shrink-0">+ Nuevo</button>
                </>) : (<>
                  {/* Un campo aquí dentro y no un `prompt` del navegador: el
                      formulario está a medio escribir y un diálogo del sistema
                      lo tapa entero. */}
                  <input value={nombreExpositor} autoFocus
                    onChange={e => setNombreExpositor(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); crearExpositor(); } }}
                    placeholder="Nombre de la empresa"
                    className="input bg-surface-2 rounded-2xl py-3 text-base flex-1 min-w-0" />
                  <button type="button" onClick={crearExpositor} disabled={creandoExpositor}
                    className="btn-secondary btn-sm flex-shrink-0">
                    {creandoExpositor ? 'Creando…' : 'Crear'}
                  </button>
                  <button type="button" onClick={() => { setNombreExpositor(null); setFalloExpositor(''); }}
                    className="btn-ghost btn-sm flex-shrink-0">Cancelar</button>
                </>)}
              </div>
              {falloExpositor
                ? <p className="text-[11px] text-warning-light mt-1">{falloExpositor}</p>
                : <p className="text-[11px] text-text-3 mt-1">
                    Un expositor del evento —que es también su stand—. Distinto del speaker: aquí va la
                    empresa, arriba la persona.
                  </p>}
            </div>
          {tiposBoleta.length > 0 && (
            <div className="field">
              {/* Se llamaba «Hace falta boleta» y la ayuda hablaba sólo de
                  restringir por categoría: «las actividades que sólo entran con
                  un tipo de boleta (VIP, por ejemplo)».
                  Medido: 1 de 15 actividades tenía boleta ligada. No porque el
                  control fallara —guarda bien y el servidor lo valida— sino
                  porque describía un caso que casi nadie tiene, y no el que sí:
                  «para esta actividad se creó su propia boleta». En FESTECH hay
                  tres boletas que son justo eso y ninguna estaba ligada.
                  Un control redactado para otro caso es un control que no se
                  usa, y no falla nada. */}
              <label className="label">Con qué boleta se entra <span className="lowercase tracking-normal font-normal text-text-3">(opcional)</span></label>
              <select value={form.ticket_type_id} onChange={e => setForm(f => ({...f, ticket_type_id: e.target.value}))}
                className="input bg-surface-2 rounded-2xl py-3 text-base">
                <option value="">Con cualquiera del evento</option>
                {tiposBoleta.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
              <p className="text-[11px] text-text-3 mt-1">
                Elige una si esta actividad tiene su propia boleta, o si sólo entra un tipo
                (VIP, por ejemplo). En «Entradas y dinero» esa boleta dejará de parecer una
                entrada al evento y dirá a qué actividad da acceso.
              </p>
            </div>
          )}
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="field">
          <label className="label">Track / sala</label>
          <input list="gestek-tracks" value={form.track} onChange={e => setForm(f => ({...f, track: e.target.value}))}
            placeholder="principal" className="input-form" />
          <datalist id="gestek-tracks">
            {tracksUsados.map(o => <option key={o.valor} value={o.valor}>{o.origen}</option>)}
          </datalist>
          <p className="text-[11px] text-text-3 mt-1">
            {tracksUsados.length > 0
              ? 'Escribe o elige uno de los que ya usa este evento. Sesiones con el mismo track aparecen juntas en la vista "Salas".'
              : 'Ej. "Auditorio A", "Sala 2". Sesiones con el mismo track aparecen juntas en la vista "Salas".'}
          </p>
        </div>
        <div className="field">
          <label className="label">
            {zonasEvento.length > 0 ? 'Detalle del sitio' : 'Ubicación'}
          </label>
          <input list="gestek-ubicaciones" value={form.ubicacion} onChange={e => setForm(f => ({...f, ubicacion: e.target.value}))}
            placeholder={zonasEvento.length > 0 ? 'Piso 2, al fondo…' : 'Piso 2'} className="input-form" />
          <datalist id="gestek-ubicaciones">
            {ubicaciones.map(o => <option key={o.valor} value={o.valor}>{o.origen}</option>)}
          </datalist>
          <p className="text-[11px] text-text-3 mt-1">
            {zonasEvento.length > 0
              ? 'Sólo si hace falta precisar algo dentro de la zona. El sitio lo dice la zona de arriba.'
              : ubicaciones.length > 0
                ? 'Salen las zonas, los puntos del plano y las puertas ya creadas.'
                : 'Ej. «Auditorio A», «Piso 2».'}
          </p>
        </div>
        <div className="field">
          <label className="label">Speaker</label>
          <select value={form.speaker_id} onChange={e => setForm(f => ({...f, speaker_id: e.target.value}))}
            className="input bg-surface-2 rounded-2xl py-3 text-base">
            <option value="">Sin speaker</option>
            {speakers.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
      </div>
      {/* ── Inscripción a este sub-evento ──
          La boleta del evento sigue siendo la llave; esto es apuntarse a esta
          actividad concreta, con su cupo aparte. Sirve para responder la
          pregunta que importa al reportar: cuánta gente vino al evento y
          cuánta participó en cada taller. */}
      <div className="rounded-2xl border border-border bg-surface-2/40 p-3.5 space-y-3">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" checked={form.requiere_inscripcion}
            onChange={e => setForm(f => ({ ...f, requiere_inscripcion: e.target.checked }))}
            className="w-4 h-4 mt-0.5 accent-[#8B5CF6]" />
          <span className="text-sm">
            <span className="font-medium text-text-1 block">Pide inscripción aparte</span>
            <span className="text-xs text-text-3">
              Con la entrada al evento no basta: hay que apuntarse a esta actividad.
            </span>
          </span>
        </label>

        {form.requiere_inscripcion && (
          <div className="space-y-3 pl-6.5">
            <div className="field">
              <label className="label">Cupo <span className="lowercase tracking-normal font-normal text-text-3">(vacío = sin límite)</span></label>
              <input type="number" min={1} value={form.cupo}
                onChange={e => setForm(f => ({ ...f, cupo: e.target.value }))}
                placeholder="Sin límite"
                className="input bg-surface-2 rounded-2xl py-2.5 text-base w-40" />
              {initial?.inscritos > 0 && (
                <p className="text-[11px] text-text-3 mt-1">Ya hay {initial.inscritos} inscritos.</p>
              )}
            </div>

            <div className="field">
              <label className="label">Qué se le pregunta al apuntarse</label>
              <div className="space-y-1.5">
                {[
                  ['ninguno', 'Nada, un botón y listo', 'Lo normal: la boleta ya sabe quién es. Volver a pedirle sus datos es hacerle escribir dos veces lo mismo.'],
                  ['propio',  'Preguntas propias de esta actividad', 'Cortas y sobre lo que pasa aquí: talla, si trae equipo, nivel.'],
                  ['evento',  'El formulario completo del evento', 'El mismo que se llena al comprar la boleta. Largo.'],
                ].map(([v, titulo, nota]) => (
                  <label key={v}
                    className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer border transition-colors
                                ${form.formulario_modo === v ? 'border-accent/60 bg-accent/5' : 'border-border hover:bg-surface-2'}`}>
                    <input type="radio" name="formulario_modo" checked={form.formulario_modo === v}
                      onChange={() => setForm(f => ({ ...f, formulario_modo: v }))}
                      className="mt-0.5 accent-[#8B5CF6]" />
                    <span className="text-xs">
                      <span className="font-medium text-text-1 block">{titulo}</span>
                      <span className="text-text-3">{nota}</span>
                    </span>
                  </label>
                ))}
              </div>

              {form.formulario_modo === 'propio' && (
                initial?.id ? (
                  <button type="button" onClick={() => setPreguntasOpen(true)}
                    className="btn-secondary btn-sm mt-2">
                    Escribir las preguntas
                  </button>
                ) : (
                  <p className="text-[11px] text-warning mt-2">
                    Crea el sub-evento primero y luego vuelve a editarlo para escribir sus preguntas.
                  </p>
                )
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-ghost btn-sm">Cancelar</button>
        <button type="submit" disabled={saving || !form.titulo.trim() || !form.inicio} className="btn-primary btn-sm">
          {saving ? <><Spinner size="sm" /> Guardando...</> : (initial ? 'Guardar' : 'Crear sesión')}
        </button>
      </div>

      {preguntasOpen && initial?.id && (
        <PreguntasSubEvento
          evento={evento}
          sesion={initial}
          onClose={() => setPreguntasOpen(false)}
          /* Si el editor deja el sub-evento sin ninguna pregunta, el servidor
             lo devuelve a 'ninguno' — y el selector tiene que enterarse, o
             enseñaría "propio" sobre una lista vacía. */
          onGuardado={d => { if (d?.formulario_modo) setForm(f => ({ ...f, formulario_modo: d.formulario_modo })); }}
        />
      )}
    </form>
  );
}

/* ─────────── Speakers ─────────── */

