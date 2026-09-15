import { useEffect, useState } from 'react';
import { confirmDialog } from '../../../components/ui/Confirm.jsx';
import { acreditadosApi } from '../../../api/acreditados.js';
import { ticketsApi } from '../../../api/tickets.js';
import { useToast } from '../../../context/ToastContext.jsx';
import GLoader from '../../../components/ui/GLoader.jsx';

/* Quién entra, y quién responde por él.
 *
 * ── Para qué es esta pantalla ────────────────────────────────────────────
 *
 * Los dos días antes del evento llegan cuadrillas a montar los stands y el
 * recinto se llena de herramienta suelta. Esto es lo que separa a quien viene a
 * trabajar de quien pasaba por ahí: cada persona con nombre, documento y foto,
 * y alguien del evento respondiendo por ella.
 *
 * No son «staff». El equipo del evento es gente con cuenta y permisos del
 * panel; esto son personas acreditadas dentro de una boleta (los puestos de la
 * 0118), y por eso no hace falta pedirle correo y contraseña a sesenta
 * montajistas.
 *
 * La misma pantalla sirve para los nombres de una mesa de cuatro. La diferencia
 * es que ahí no hay nada que autorizar, y se nota: esas filas salen sin el
 * botón.
 */

const hora = (iso) => (iso
  ? new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : null);

export default function AcreditadosTab({ evento }) {
  const [lista, setLista]     = useState([]);
  const [tipos, setTipos]     = useState([]);
  const [tipo, setTipo]       = useState('');
  const [soloPend, setSoloPend] = useState(true);
  const [q, setQ]             = useState('');
  const [loading, setLoading] = useState(true);
  const { success, error: toastErr } = useToast();

  const reload = async () => {
    setLoading(true);
    try {
      const d = await acreditadosApi.list(evento.id, {
        ...(soloPend ? { pendientes: 1 } : {}),
        ...(tipo ? { tipo } : {}),
      });
      setLista(d.acreditados || []);
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
    finally     { setLoading(false); }
  };

  useEffect(() => { reload(); /* eslint-disable-line */ }, [evento.id, soloPend, tipo]);

  useEffect(() => {
    ticketsApi.list(evento.id)
      .then(d => setTipos(d.tipos || d.ticket_types || []))
      /* En silencio y a propósito: los tipos sólo llenan el desplegable del
         filtro. Si no cargan, el filtro sale vacío y la lista de personas
         —que es a lo que se viene— funciona igual. Un error rojo aquí taparía
         la pantalla por un desplegable. */
      .catch(() => {});
  }, [evento.id]);

  const autorizar = async (p) => {
    try {
      await acreditadosApi.autorizar(evento.id, p.id);
      success(`${p.nombre} ya puede entrar.`);
      reload();
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
  };

  const revocar = async (p) => {
    const ok = await confirmDialog({
      title: `Quitarle la entrada a ${p.nombre || 'esta persona'}`,
      message: 'Su credencial deja de abrir. El registro de que estuvo se conserva.',
      confirmText: 'Quitar', danger: true,
    });
    if (!ok) return;
    try { await acreditadosApi.revocar(evento.id, p.id); reload(); }
    catch (e) { toastErr(e.response?.data?.error || e.message); }
  };

  const corregir = async (p, campo, valor) => {
    if ((p[campo] || '') === valor) return;
    try {
      await acreditadosApi.editar(evento.id, p.id, { [campo]: valor });
      reload();
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
  };

  /* El filtro por texto se hace aquí: la lista viene acotada a 500 y quien la
     usa está buscando UN nombre que le acaban de decir en voz alta. */
  const visibles = lista.filter(p => {
    if (!q.trim()) return true;
    const t = q.trim().toLowerCase();
    return [p.nombre, p.documento, p.boleta, p.email].some(x => String(x || '').toLowerCase().includes(t));
  });

  const pendientes = lista.filter(p => p.necesita_autorizacion && !p.autorizado_at).length;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold font-display text-text-1 tracking-tight">Quién entra</h2>
          <p className="text-sm text-text-2 mt-1">
            Las personas acreditadas dentro de cada boleta: la cuadrilla que monta un stand,
            los nombres de una mesa. Autorizar es <b className="text-text-1">responder por alguien</b>,
            y hasta que pasa no tiene credencial.
          </p>
        </div>
        {pendientes > 0 && (
          <span className="px-3 py-1.5 rounded-xl bg-warning/10 text-warning border border-warning/20 text-sm">
            {pendientes} sin autorizar
          </span>
        )}
      </div>

      <Dentro evento={evento} />

      <div className="flex items-center gap-3 flex-wrap">
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Nombre, documento o boleta" className="input !h-9 text-sm w-64" />
        <select value={tipo} onChange={e => setTipo(e.target.value)} className="input !h-9 text-sm w-auto">
          <option value="">Todas las boletas</option>
          {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-text-2">
          <input type="checkbox" checked={soloPend} onChange={e => setSoloPend(e.target.checked)} />
          Sólo los que faltan
        </label>
      </div>

      {loading ? <GLoader /> : !visibles.length ? (
        <div className="rounded-2xl border border-border bg-surface-2 p-6 text-center">
          <p className="text-sm text-text-2">
            {soloPend ? 'No falta nadie por autorizar.' : 'Todavía no hay nadie acreditado.'}
          </p>
          <p className="text-xs text-text-3 mt-2">
            Los nombres los pone quien tiene el código de la boleta, desde su enlace.
            Aquí se corrigen y se autorizan.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibles.map(p => (
            <Fila key={p.id} p={p} onAutorizar={() => autorizar(p)} onRevocar={() => revocar(p)} onCorregir={corregir} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────── Quién no ha salido ─────────── */

/* A las ocho de la noche esto vale más que la lista de a quién se dejó entrar.
 *
 * Se pinta arriba y sólo cuando hay alguien dentro: el resto del día es una
 * caja vacía que estorba, y el día del montaje es lo primero que se mira. */
function Dentro({ evento }) {
  const [dentro, setDentro] = useState([]);
  const [cerrando, setCerrando] = useState(false);
  const { success, error: toastErr } = useToast();

  const cargar = () => {
    acreditadosApi.dentro(evento.id)
      .then(d => setDentro(d.dentro || []))
      /* En silencio: es un panel de apoyo. Si falla, la lista de abajo —que es
         a lo que se viene— sigue funcionando, y un error rojo aquí taparía la
         pantalla entera por un contador. */
      .catch(() => {});
  };

  useEffect(cargar, /* eslint-disable-line */ [evento.id]);

  const cerrar = async () => {
    const ok = await confirmDialog({
      title: `Cerrar la jornada con ${dentro.length} dentro`,
      message: 'Se marca la salida de todos los que siguen dentro. Queda anotado que fue un cierre '
             + 'a mano y no un escaneo, con tu nombre.',
      confirmText: 'Cerrar jornada',
    });
    if (!ok) return;
    setCerrando(true);
    try {
      const r = await acreditadosApi.cerrarJornada(evento.id);
      success(`${r.cerrados} salidas registradas.`);
      cargar();
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
    finally     { setCerrando(false); }
  };

  if (!dentro.length) return null;

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="font-medium text-text-1">{dentro.length} dentro ahora</p>
          <p className="text-xs text-text-3">
            Personas acreditadas que entraron y todavía no han marcado salida.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" disabled={cerrando} onClick={cerrar}>
          {cerrando ? 'Cerrando…' : 'Cerrar jornada'}
        </button>
      </div>

      <ul className="flex flex-wrap gap-2">
        {dentro.map(p => (
          <li key={p.id} className="text-xs px-2 py-1 rounded-lg bg-surface-2 border border-border">
            <span className="text-text-1">{p.nombre}</span>
            {p.desde && <span className="text-text-3"> · desde {hora(p.desde)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Fila({ p, onAutorizar, onRevocar, onCorregir }) {
  const pendiente = p.necesita_autorizacion && !p.autorizado_at;

  return (
    <div className={`rounded-2xl border p-3 flex items-start gap-3 flex-wrap ${pendiente ? 'border-warning/30 bg-warning/5' : 'border-border bg-surface-2'}`}>
      {p.foto_url
        ? <img src={p.foto_url} alt="" className="w-12 h-12 rounded-xl object-cover border border-border flex-shrink-0" />
        : <div className="w-12 h-12 rounded-xl bg-surface-3 border border-border flex-shrink-0" />}

      <div className="min-w-0 flex-1">
        <p className="font-medium text-text-1 truncate">{p.nombre || <span className="text-text-3">Sin nombre</span>}</p>
        <p className="text-xs text-text-3">
          {/* El documento es editable en línea porque la corrección se hace en
              el mostrador, con la cédula en la mano: mandar a la cuadrilla a
              buscar a quien tiene el código del stand por un dígito mal escrito
              es lo que hace que nadie corrija nada. */}
          <input defaultValue={p.documento || ''} placeholder="Documento"
            onBlur={e => onCorregir(p, 'documento', e.target.value.trim())}
            className="input !h-6 !py-0 !px-1 text-xs font-mono w-32 inline-block" />
          {p.boleta && <> · <span className="font-mono">{p.boleta}</span></>}
          {p.tipo && <> · {p.tipo}</>}
        </p>
        {p.autorizado_at && (
          <p className="text-xs text-success mt-1">
            Autorizado {hora(p.autorizado_at)}{p.autorizado_por && <> por {p.autorizado_por}</>}
          </p>
        )}
        {p.entro_at && <p className="text-xs text-text-3">Entró {hora(p.entro_at)}</p>}
      </div>

      <div className="flex items-center gap-2">
        {/* Sin credencial y autorizado no debería pasar, pero si pasa hay que
            verlo aquí y no en la puerta. */}
        {p.autorizado_at && !p.tiene_credencial && (
          <span className="text-xs text-danger">sin credencial</span>
        )}
        {pendiente ? (
          <button className="btn btn-primary btn-sm" disabled={!p.nombre || !p.documento} onClick={onAutorizar}>
            Autorizar
          </button>
        ) : p.autorizado_at ? (
          <button className="btn btn-ghost btn-sm text-danger" onClick={onRevocar}>Quitar</button>
        ) : (
          /* Una mesa de cuatro: no hay nada que autorizar y decirlo evita que
             alguien busque el botón que no existe. */
          <span className="text-xs text-text-3">no requiere</span>
        )}
      </div>

      {pendiente && !p.documento && (
        <p className="w-full text-xs text-warning">
          Falta el documento: sin él la puerta no puede comprobar que es quien dice ser.
        </p>
      )}
    </div>
  );
}
