import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { acreditadosApi } from '../../api/acreditados.js';
import GLoader from '../../components/ui/GLoader.jsx';

/* «¿Quién entra con esta boleta?» — el enlace del anfitrión.
 *
 * ── Qué resuelve ─────────────────────────────────────────────────────────
 *
 * La 0118 lo dejó anunciado y nunca se construyó: quien compró una mesa de
 * cuatro no tenía forma de poner los nombres, y quien monta un stand no tenía
 * forma de inscribir a su cuadrilla.
 *
 * Es la misma pantalla para las dos cosas a propósito. La diferencia la pone la
 * boleta: si su tipo exige autorización —la credencial de montaje—, aquí se
 * dice desde el principio que los nombres no bastan y que alguien del evento
 * tiene que aprobarlos. Enterarse de eso en la puerta del galpón a las seis de
 * la mañana es lo que hay que evitar.
 *
 * Sin cuenta: se entra con el código de la boleta, igual que «mi boleta» y que
 * el panel del expositor. La cuadrilla de un stand no tiene usuario en la
 * plataforma y no se lo vamos a pedir.
 */

const fecha = (iso) => (iso
  ? new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })
  : null);

export default function AcreditarPage() {
  const { codigo } = useParams();
  const [data, setData]       = useState(null);
  const [error, setError]     = useState(null);
  const [loading, setLoading] = useState(true);

  const cargar = async () => {
    try { setData(await acreditadosApi.mios(codigo)); setError(null); }
    catch (e) { setError(e.response?.data?.error || e.message); }
    finally   { setLoading(false); }
  };

  useEffect(() => { cargar(); /* eslint-disable-line */ }, [codigo]);

  if (loading) return <GLoader />;
  if (error) return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-bold font-display text-text-1">No pudimos abrir esta boleta</h1>
      <p className="text-sm text-text-2 mt-2">{error}</p>
    </div>
  );

  const { boleta, puestos = [], requiere_autorizacion: requiereAut, puedo_autorizar: puedoAut, vigencia } = data;
  const faltan = puestos.filter(p => !p.nombre).length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <header>
        <h1 className="text-3xl font-bold font-display text-text-1 tracking-tight">¿Quién entra?</h1>
        <p className="text-sm text-text-2 mt-1">
          {boleta.tipo && <>{boleta.tipo} · </>}
          <span className="font-mono">{boleta.codigo}</span>
        </p>
      </header>

      {/* Las dos cosas que hay que saber ANTES de llenar el formulario, no
          después: hasta cuándo vale esta credencial, y que los nombres solos no
          abren nada. */}
      {(vigencia?.desde || vigencia?.hasta) && (
        <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3">
          <p className="text-sm text-text-2">
            Esta credencial abre
            {vigencia.desde && <> <b className="text-text-1">desde el {fecha(vigencia.desde)}</b></>}
            {vigencia.hasta && <> <b className="text-text-1">hasta el {fecha(vigencia.hasta)}</b></>}.
            Fuera de esas horas no sirve.
          </p>
        </div>
      )}

      {requiereAut && (
        <div className="rounded-2xl border border-warning/30 bg-warning/5 px-4 py-3">
          <p className="text-sm text-text-2">
            {puedoAut
              /* Que sepa desde el principio que puede resolver un cambio de
                 última hora sin llamar a nadie: si cree que no puede, a las
                 seis de la mañana no lo intenta y manda al primo con el QR del
                 que se enfermó. */
              ? <>Tú respondes por esta gente. Para acreditar a alguien hace falta
                  su <b className="text-text-1">documento</b>: escríbelo exacto, porque en la
                  puerta se compara con la cédula. Si a última hora viene otra persona,
                  puedes cambiarla tú mismo.</>
              : <>Cada persona tiene que ser <b className="text-text-1">autorizada por la organización</b> antes
                  de poder entrar, y para eso hace falta su <b className="text-text-1">documento</b>. Escríbelo
                  exacto: en la puerta se compara con la cédula.</>}
          </p>
        </div>
      )}

      {faltan > 0 && (
        <p className="text-sm text-text-3">
          Faltan {faltan} de {puestos.length} por llenar.
        </p>
      )}

      <div className="space-y-3">
        {puestos.map(p => (
          <Persona key={p.id} codigo={codigo} puesto={p} requiereAut={requiereAut}
            puedoAut={puedoAut} onGuardado={cargar} />
        ))}
      </div>
    </div>
  );
}

function Persona({ codigo, puesto, requiereAut, puedoAut, onGuardado }) {
  const [form, setForm]     = useState({
    nombre: puesto.nombre || '', documento: puesto.documento || '',
    email: puesto.email || '', telefono: puesto.telefono || '',
  });
  const [guardando, setGuardando] = useState(false);
  const [sustituyendo, setSustituyendo] = useState(false);
  const [err, setErr]       = useState(null);

  /* Quien ya entró no se puede cambiar: sería reescribir a quién se dejó pasar
     después de dejarlo pasar. */
  const cerrado = puesto.estado === 'usado';

  const guardar = async () => {
    setGuardando(true); setErr(null);
    try { await acreditadosApi.poner(codigo, puesto.id, form); onGuardado(); }
    catch (e) { setErr(e.response?.data?.error || e.message); }
    finally   { setGuardando(false); }
  };

  const cambio = ['nombre', 'documento', 'email', 'telefono']
    .some(k => (form[k] || '') !== (puesto[k] || ''));

  return (
    <div className="rounded-2xl border border-border bg-surface-2 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-widest text-text-3 font-semibold">
          Persona {puesto.orden}
        </span>
        <Estado puesto={puesto} requiereAut={requiereAut} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {[
          ['nombre', 'Nombre completo', 'text'],
          ['documento', 'Documento', 'text'],
          ['telefono', 'Teléfono', 'tel'],
          ['email', 'Correo (opcional)', 'email'],
        ].map(([k, label, type]) => (
          <label key={k} className="text-xs text-text-3">
            {label}
            <input type={type} value={form[k]} disabled={cerrado}
              onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
              className="input text-sm" />
          </label>
        ))}
      </div>

      {!cerrado && <Foto codigo={codigo} puesto={puesto} onGuardado={onGuardado} />}

      {err && <p className="text-xs text-danger">{err}</p>}

      {!cerrado && (
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn btn-primary btn-sm" disabled={!form.nombre.trim() || !cambio || guardando}
            onClick={guardar}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>

          {/* Viene otra persona. Es un botón aparte de «Guardar» a propósito:
              corregir un nombre mal escrito y cambiar de persona parecen lo
              mismo en un formulario y no lo son — lo segundo anula la
              credencial del anterior, y eso no puede pasar por descuido al
              arreglar una tilde. */}
          {puesto.nombre && (
            <button className="btn btn-ghost btn-sm" onClick={() => setSustituyendo(v => !v)}>
              {sustituyendo ? 'Cancelar' : 'Viene otra persona'}
            </button>
          )}
        </div>
      )}

      {sustituyendo && (
        <Sustituir codigo={codigo} puesto={puesto} puedoAut={puedoAut} requiereAut={requiereAut}
          onHecho={() => { setSustituyendo(false); onGuardado(); }} />
      )}

      {/* Cambiar de persona después de estar aprobado vuelve a dejarla
          pendiente, y decirlo aquí evita el viaje en balde: se cambia el
          nombre la noche antes y se llega al montaje sin credencial. */}
      {requiereAut && puesto.autorizado_at && cambio && (
        <p className="text-xs text-warning">
          Si cambias el nombre o el documento, esta persona vuelve a quedar pendiente de autorización.
        </p>
      )}
    </div>
  );
}

/* ─────────── La foto ─────────── */

/* Va aparte del formulario y se guarda sola al elegirla.
 *
 * Es lo que se hace con el teléfono en la mano y la persona delante: se toma la
 * foto y se sigue. Meterla dentro del «Guardar» de abajo obligaría a subir el
 * archivo y ADEMÁS acordarse de pulsar, y lo que pasa entonces es que la foto
 * se queda sin subir sin que nadie lo note. */
function Foto({ codigo, puesto, onGuardado }) {
  const [subiendo, setSubiendo] = useState(false);
  const [err, setErr] = useState(null);

  const elegir = async (file) => {
    if (!file) return;
    setSubiendo(true); setErr(null);
    try {
      const ficha = await acreditadosApi.subirFoto(file);
      /* Se guarda la RUTA, no una URL: la carpeta es privada y el enlace para
         verla lo firma el servidor cada vez, con quince minutos de vida. */
      await acreditadosApi.poner(codigo, puesto.id, { foto_url: ficha.ruta });
      onGuardado();
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally { setSubiendo(false); }
  };

  return (
    <div className="flex items-center gap-3">
      {puesto.foto_url
        ? <img src={puesto.foto_url} alt="" className="w-16 h-16 rounded-xl object-cover border border-border" />
        : <div className="w-16 h-16 rounded-xl bg-surface-3 border border-border" />}
      <div>
        <label className="btn btn-secondary btn-sm cursor-pointer">
          {subiendo ? 'Subiendo…' : puesto.foto_url ? 'Cambiar foto' : 'Añadir foto'}
          {/* `capture` para que en el móvil abra la cámara directamente: la
              foto se toma ahí mismo, no se busca en la galería. */}
          <input type="file" accept="image/*" capture="user" className="hidden" disabled={subiendo}
            onChange={e => elegir(e.target.files?.[0])} />
        </label>
        <p className="text-xs text-text-3 mt-1">
          En la puerta se compara con la cara. Sólo la ve quien controla el acceso.
        </p>
        {err && <p className="text-xs text-danger mt-1">{err}</p>}
      </div>
    </div>
  );
}

/* ─────────── Viene otra persona ─────────── */

/* «El que iba se enfermó. Vino el primo.»
 *
 * El caso que decide si toda la acreditación sirve o se rodea: sin una
 * respuesta para él, a las seis de la mañana el primo entra con el QR del otro
 * o el guardia lo deja pasar de palabra, y no queda registro de nadie.
 *
 * Se dice en voz alta lo que va a pasar con la credencial anterior, porque es
 * irreversible y porque es justo lo que da tranquilidad: la del que no vino
 * deja de abrir. */
function Sustituir({ codigo, puesto, puedoAut, requiereAut, onHecho }) {
  const [form, setForm] = useState({ nombre: '', documento: '', telefono: '' });
  const [yendo, setYendo] = useState(false);
  const [err, setErr] = useState(null);

  const faltaDoc = requiereAut && puedoAut && !form.documento.trim();

  const cambiar = async () => {
    setYendo(true); setErr(null);
    try { await acreditadosApi.sustituir(codigo, puesto.id, form); onHecho(); }
    catch (e) { setErr(e.response?.data?.error || e.message); setYendo(false); }
  };

  return (
    <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 space-y-3">
      <p className="text-sm text-text-2">
        Va a entrar otra persona en lugar de <b className="text-text-1">{puesto.nombre}</b>.
        {' '}Su credencial <b className="text-text-1">deja de abrir</b> en cuanto guardes esto.
      </p>

      <div className="grid sm:grid-cols-3 gap-3">
        {[['nombre', 'Nombre completo'], ['documento', 'Documento'], ['telefono', 'Teléfono']].map(([k, label]) => (
          <label key={k} className="text-xs text-text-3">
            {label}
            <input value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
              className="input text-sm" />
          </label>
        ))}
      </div>

      {/* Lo que va a pasar DESPUÉS de guardar, dicho antes: si hay que esperar
          a la organización, quien está en la puerta necesita saberlo ahora, no
          cuando el primo esté delante del escáner. */}
      {requiereAut && (
        <p className="text-xs text-text-2">
          {puedoAut
            ? 'Queda acreditada de inmediato, bajo tu responsabilidad.'
            : 'Queda registrada, pero no entra hasta que la organización la autorice.'}
        </p>
      )}

      {err && <p className="text-xs text-danger">{err}</p>}

      <button className="btn btn-primary btn-sm" disabled={!form.nombre.trim() || faltaDoc || yendo}
        onClick={cambiar}>
        {yendo ? 'Cambiando…' : 'Cambiar de persona'}
      </button>
      {faltaDoc && (
        <p className="text-xs text-warning">
          Hace falta el documento: es con lo que la puerta comprueba que es quien dice ser.
        </p>
      )}
    </div>
  );
}

function Estado({ puesto, requiereAut }) {
  if (puesto.estado === 'usado') return <span className="text-xs text-text-3">Ya entró</span>;
  if (!puesto.nombre) return <span className="text-xs text-text-3">Sin llenar</span>;
  if (!requiereAut) {
    return puesto.tiene_credencial
      ? <span className="text-xs text-success">Con credencial</span>
      : <span className="text-xs text-text-3">Listo</span>;
  }
  return puesto.autorizado_at
    ? <span className="text-xs text-success">Autorizado</span>
    : <span className="text-xs text-warning">Esperando autorización</span>;
}
