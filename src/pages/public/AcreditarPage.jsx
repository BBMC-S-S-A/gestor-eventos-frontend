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

  const { boleta, puestos = [], requiere_autorizacion: requiereAut, vigencia } = data;
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
            Cada persona tiene que ser <b className="text-text-1">autorizada por la organización</b> antes
            de poder entrar, y para eso hace falta su <b className="text-text-1">documento</b>. Escríbelo
            exacto: en la puerta se compara con la cédula.
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
          <Persona key={p.id} codigo={codigo} puesto={p} requiereAut={requiereAut} onGuardado={cargar} />
        ))}
      </div>
    </div>
  );
}

function Persona({ codigo, puesto, requiereAut, onGuardado }) {
  const [form, setForm]     = useState({
    nombre: puesto.nombre || '', documento: puesto.documento || '',
    email: puesto.email || '', telefono: puesto.telefono || '',
  });
  const [guardando, setGuardando] = useState(false);
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

      {err && <p className="text-xs text-danger">{err}</p>}

      {!cerrado && (
        <button className="btn btn-primary btn-sm" disabled={!form.nombre.trim() || !cambio || guardando}
          onClick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
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
