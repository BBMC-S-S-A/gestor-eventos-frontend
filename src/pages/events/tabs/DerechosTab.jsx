import { useEffect, useState } from 'react';
import { confirmDialog } from '../../../components/ui/Confirm.jsx';
import { derechosApi } from '../../../api/derechos.js';
import { ticketsApi } from '../../../api/tickets.js';
import { useToast } from '../../../context/ToastContext.jsx';
import GLoader from '../../../components/ui/GLoader.jsx';

/* Lo que incluye la boleta: configurarlo, y ver a quién se le entregó.
 *
 * ── Qué es esto ──────────────────────────────────────────────────────────
 *
 * Un «derecho» es cualquier cosa que la credencial incluye y que alguien
 * reparte: el refrigerio de la mañana, el almuerzo, el kit de bienvenida, el
 * parqueadero, la camiseta. Detrás hay una sola forma —«N usos de algo, en una
 * franja, con constancia de quién lo entregó»— y no una pantalla por
 * beneficio. Migración 0126.
 *
 * Repartirlos se hace en «Escanear», que es donde ya está el escáner y la
 * cola sin conexión. Aquí se configura y se lee el resultado, que son dos
 * trabajos de escritorio y no de pie.
 */

const TITULARES = [
  ['persona', 'Cada persona el suyo', 'Dos acreditados en un stand, dos almuerzos. El segundo no se lo puede comer el primero.'],
  ['grupo',   'Del grupo',            'Son N por boleta y los usa quien esté. Dos aguas en la caseta.'],
];

const CADENCIAS = [
  ['ventana', 'Por franja', 'Se renueva en cada franja: el almuerzo de cada día.'],
  ['total',   'Una vez',    'En todo el evento: la camiseta, el kit.'],
];

const hora = (iso) => (iso
  ? new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—');

/* Para los `datetime-local`, que no entienden ni la Z ni el offset. */
const paraInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
};

export default function DerechosTab({ evento }) {
  const [derechos, setDerechos] = useState([]);
  const [tipos, setTipos]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [abierto, setAbierto]   = useState(null);   // id del derecho desplegado
  const [nuevo, setNuevo]       = useState(false);
  const { success, error: toastErr } = useToast();

  const reload = async () => {
    setLoading(true);
    try {
      const d = await derechosApi.list(evento.id);
      setDerechos(d.derechos || []);
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
    finally     { setLoading(false); }
  };

  useEffect(() => {
    reload();
    /* Los tipos de boleta, para poder decir a cuáles aplica cada derecho. Sin
       ellos la lista blanca sería un campo de texto con ids. */
    ticketsApi.list(evento.id)
      .then(d => setTipos(d.tipos || d.ticket_types || []))
      .catch(() => {});
    /* eslint-disable-next-line */
  }, [evento.id]);

  const crear = async (body) => {
    try {
      await derechosApi.crear(evento.id, body);
      success('Creado.');
      setNuevo(false);
      reload();
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
  };

  const editar = async (id, cambios) => {
    try {
      await derechosApi.editar(evento.id, id, cambios);
      reload();
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
  };

  /* Desactivar y eliminar no son lo mismo, y la diferencia importa el día
     después del evento: eliminar se lleva por delante el registro de quién
     comió. Se pregunta con el número delante. */
  const eliminar = async (d) => {
    const ok = await confirmDialog({
      title: `Eliminar «${d.nombre}»`,
      message: 'Se borra también el registro de todo lo que se entregó con él. '
             + 'Si sólo quieres que deje de aparecer en el escáner, desactívalo.',
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await derechosApi.eliminar(evento.id, d.id);
      success(r.consumos_borrados ? `Eliminado con ${r.consumos_borrados} entregas.` : 'Eliminado.');
      reload();
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
  };

  if (loading) return <GLoader />;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold font-display text-text-1 tracking-tight">Lo que incluye</h2>
          <p className="text-sm text-text-2 mt-1">
            Refrigerios, almuerzos, kits, parqueadero: lo que la boleta trae y alguien reparte.
            Se entrega desde <b className="text-text-1">Escanear</b>, y queda registrado quién lo dio.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setNuevo(v => !v)}>
          {nuevo ? 'Cancelar' : 'Añadir'}
        </button>
      </div>

      {nuevo && <FormDerecho tipos={tipos} onGuardar={crear} onCancelar={() => setNuevo(false)} />}

      {!derechos.length && !nuevo && (
        <div className="rounded-2xl border border-border bg-surface-2 p-6 text-center">
          <p className="text-sm text-text-2">
            Todavía no hay nada configurado. Un ejemplo típico de feria: «Almuerzo», por persona,
            por franja, con una franja por día y sólo para las boletas de expositor.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {derechos.map(d => (
          <Tarjeta
            key={d.id} evento={evento} derecho={d} tipos={tipos}
            abierto={abierto === d.id}
            onAbrir={() => setAbierto(abierto === d.id ? null : d.id)}
            onEditar={(c) => editar(d.id, c)}
            onEliminar={() => eliminar(d)}
            onCambio={reload}
          />
        ))}
      </div>
    </div>
  );
}

/* ─────────── Un derecho, con sus franjas y su reporte ─────────── */

function Tarjeta({ evento, derecho, tipos, abierto, onAbrir, onEditar, onEliminar, onCambio }) {
  const [vista, setVista] = useState('franjas');  // franjas | entregas | faltan
  const nTipos = (derecho.aplica_tipos || []).length;

  return (
    <div className="rounded-2xl border border-border bg-surface-2 overflow-hidden">
      <div className="flex items-center gap-3 p-4 flex-wrap">
        <button onClick={onAbrir} className="text-left min-w-0 flex-1">
          <h3 className="font-semibold text-text-1 truncate">
            {derecho.nombre}
            {!derecho.activo && <span className="ml-2 text-xs text-text-3">(desactivado)</span>}
          </h3>
          <p className="text-xs text-text-3 mt-0.5">
            {derecho.titular === 'grupo' ? 'Del grupo' : 'Por persona'}
            {' · '}
            {derecho.cadencia === 'ventana'
              ? `${derecho.ventanas?.length || 0} franja${derecho.ventanas?.length === 1 ? '' : 's'}`
              : 'una vez en todo el evento'}
            {derecho.usos > 1 && ` · ${derecho.usos} usos`}
            {/* A cuántas boletas aplica: es la trampa de la lista vacía, y por
                eso se dice en la tarjeta y no escondido en el formulario. */}
            {' · '}
            {nTipos ? `${nTipos} tipo${nTipos === 1 ? '' : 's'} de boleta` : 'todas las boletas'}
          </p>
        </button>

        <label className="flex items-center gap-2 text-xs text-text-2">
          <input type="checkbox" checked={derecho.activo}
            onChange={e => onEditar({ activo: e.target.checked })} />
          Activo
        </label>
        <button className="btn btn-ghost btn-sm text-danger" onClick={onEliminar}>Eliminar</button>
      </div>

      {abierto && (
        <div className="border-t border-border p-4 space-y-4">
          <div className="flex items-center gap-1 bg-surface-3 border border-border rounded-xl p-1 w-fit">
            {[['franjas', 'Franjas'], ['entregas', 'Entregado'], ['faltan', 'Faltan']].map(([k, l]) => (
              <button key={k} onClick={() => setVista(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${vista === k ? 'bg-surface-2 text-text-1' : 'text-text-3'}`}>
                {l}
              </button>
            ))}
          </div>

          {vista === 'franjas'  && <Franjas evento={evento} derecho={derecho} onCambio={onCambio} />}
          {vista === 'entregas' && <Entregas evento={evento} derecho={derecho} />}
          {vista === 'faltan'   && <Faltan evento={evento} derecho={derecho} />}

          <FormDerecho tipos={tipos} inicial={derecho} onGuardar={onEditar} compacto />
        </div>
      )}
    </div>
  );
}

/* ─────────── Las franjas ─────────── */

function Franjas({ evento, derecho, onCambio }) {
  const [nombre, setNombre] = useState('');
  const [inicio, setInicio] = useState('');
  const [fin, setFin]       = useState('');
  const [cupo, setCupo]     = useState('');
  const { error: toastErr } = useToast();

  if (derecho.cadencia !== 'ventana') {
    return <p className="text-sm text-text-3">Este se entrega una sola vez en todo el evento, así que no tiene franjas.</p>;
  }

  const anadir = async () => {
    try {
      await derechosApi.crearVentana(evento.id, derecho.id, {
        nombre,
        inicio: inicio ? new Date(inicio).toISOString() : null,
        fin   : fin ? new Date(fin).toISOString() : null,
        cupo  : cupo === '' ? null : Number(cupo),
      });
      setNombre(''); setInicio(''); setFin(''); setCupo('');
      onCambio();
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
  };

  const borrar = async (v) => {
    const ok = await confirmDialog({
      title: `Borrar «${v.nombre}»`,
      message: 'Se borra también lo que se entregó en esa franja.',
      confirmText: 'Borrar', danger: true,
    });
    if (!ok) return;
    try { await derechosApi.borrarVentana(evento.id, v.id); onCambio(); }
    catch (e) { toastErr(e.response?.data?.error || e.message); }
  };

  const cambiarCupo = async (v, valor) => {
    try {
      await derechosApi.editarVentana(evento.id, v.id, { cupo: valor === '' ? null : Number(valor) });
      onCambio();
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
  };

  return (
    <div className="space-y-2">
      {(derecho.ventanas || []).map(v => (
        <div key={v.id} className="flex items-center gap-3 flex-wrap text-sm border border-border rounded-xl px-3 py-2">
          <span className="font-medium text-text-1">{v.nombre}</span>
          <span className="text-text-3 text-xs">{hora(v.inicio)} → {hora(v.fin)}</span>
          <label className="text-xs text-text-3 ml-auto flex items-center gap-1">
            Cupo
            <input type="number" min="0" defaultValue={v.cupo ?? ''} placeholder="sin tope"
              onBlur={e => e.target.value !== String(v.cupo ?? '') && cambiarCupo(v, e.target.value)}
              className="input !h-7 !py-0 w-24 text-xs" />
          </label>
          <button className="btn btn-ghost btn-sm text-danger" onClick={() => borrar(v)}>Borrar</button>
        </div>
      ))}

      <div className="flex items-end gap-2 flex-wrap border-t border-border pt-3">
        <label className="text-xs text-text-3">
          Nombre
          <input value={nombre} onChange={e => setNombre(e.target.value)}
            placeholder="Almuerzo día 1" className="input !h-8 text-sm" />
        </label>
        <label className="text-xs text-text-3">
          Desde
          <input type="datetime-local" value={inicio} onChange={e => setInicio(e.target.value)} className="input !h-8 text-sm" />
        </label>
        <label className="text-xs text-text-3">
          Hasta
          <input type="datetime-local" value={fin} onChange={e => setFin(e.target.value)} className="input !h-8 text-sm" />
        </label>
        <label className="text-xs text-text-3">
          Cupo
          <input type="number" min="0" value={cupo} onChange={e => setCupo(e.target.value)}
            placeholder="sin tope" className="input !h-8 text-sm w-24" />
        </label>
        <button className="btn btn-secondary btn-sm" disabled={!nombre.trim()} onClick={anadir}>Añadir franja</button>
      </div>
      <p className="text-xs text-text-3">
        Una franja sin horas está siempre abierta. El cupo avisa, no bloquea: quedarse con la comida
        en la mano y alguien delante es peor que servir 201 de 200.
      </p>
    </div>
  );
}

/* ─────────── Quién recibió qué, y de manos de quién ─────────── */

function Entregas({ evento, derecho }) {
  const [ventanaId, setVentanaId] = useState('');
  const [data, setData] = useState(null);
  const { success, error: toastErr } = useToast();

  const cargar = () => {
    derechosApi.consumos(evento.id, derecho.id, ventanaId ? { ventana_id: ventanaId } : {})
      .then(setData)
      .catch(e => toastErr(e.response?.data?.error || e.message));
  };

  useEffect(cargar, /* eslint-disable-line */ [evento.id, derecho.id, ventanaId]);

  /* Deshacer existe porque se escanea a quien no era, y sin esto esa persona
     se queda sin comer con el sistema diciendo que ya comió. */
  const deshacer = async (c) => {
    const ok = await confirmDialog({
      title: 'Deshacer la entrega',
      message: `${c.recibio || 'Esta persona'} vuelve a poder recibirlo. Queda registrado en la auditoría.`,
      confirmText: 'Deshacer',
    });
    if (!ok) return;
    try { await derechosApi.deshacer(evento.id, c.id); success('Deshecho.'); cargar(); }
    catch (e) { toastErr(e.response?.data?.error || e.message); }
  };

  return (
    <div className="space-y-3">
      {derecho.cadencia === 'ventana' && (
        <select value={ventanaId} onChange={e => setVentanaId(e.target.value)} className="input !h-8 text-sm w-auto">
          <option value="">Todas las franjas</option>
          {(derecho.ventanas || []).map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
        </select>
      )}

      {!data ? <GLoader /> : !data.consumos.length ? (
        <p className="text-sm text-text-3">Todavía no se ha entregado nada.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-3 border-b border-border">
                <th className="py-2 pr-3">Recibió</th>
                <th className="py-2 pr-3">Boleta</th>
                <th className="py-2 pr-3">Hora</th>
                <th className="py-2 pr-3">Lo entregó</th>
                <th className="py-2 pr-3">Cómo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.consumos.map(c => (
                <tr key={c.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 text-text-1">{c.recibio || '—'}</td>
                  <td className="py-2 pr-3 text-text-3 text-xs">{c.boleta || '—'}</td>
                  <td className="py-2 pr-3 text-text-2 text-xs">{hora(c.entregado_at)}</td>
                  <td className="py-2 pr-3 text-text-2 text-xs">{c.entrego || '—'}</td>
                  {/* `manual` se enseña porque es donde se cuela el error: son
                      las entregas hechas sin leer un QR. */}
                  <td className="py-2 pr-3 text-xs">
                    {c.origen === 'qr' ? <span className="text-text-3">QR</span>
                      : <span className="text-warning">{c.origen === 'cola' ? 'sin conexión' : 'a mano'}</span>}
                  </td>
                  <td className="py-2 text-right">
                    <button className="btn btn-ghost btn-sm" onClick={() => deshacer(c)}>Deshacer</button>
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

/* ─────────── A quién le falta ─────────── */

function Faltan({ evento, derecho }) {
  const [ventanaId, setVentanaId] = useState('');
  const [data, setData] = useState(null);
  const { error: toastErr } = useToast();

  useEffect(() => {
    derechosApi.pendientes(evento.id, derecho.id, ventanaId ? { ventana_id: ventanaId } : {})
      .then(setData)
      .catch(e => toastErr(e.response?.data?.error || e.message));
    /* eslint-disable-next-line */
  }, [evento.id, derecho.id, ventanaId]);

  return (
    <div className="space-y-3">
      {derecho.cadencia === 'ventana' && (
        <select value={ventanaId} onChange={e => setVentanaId(e.target.value)} className="input !h-8 text-sm w-auto">
          <option value="">La franja abierta ahora</option>
          {(derecho.ventanas || []).map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
        </select>
      )}

      {!data ? <GLoader /> : !data.pendientes.length ? (
        <p className="text-sm text-success">No falta nadie.</p>
      ) : (
        <>
          <p className="text-sm text-text-2">
            Faltan <b className="text-text-1">{data.pendientes.length}</b>
            {data.ventana && <> en {data.ventana.nombre}</>}.
          </p>
          <ul className="space-y-1 max-h-80 overflow-y-auto">
            {data.pendientes.map(p => (
              <li key={p.clave} className="text-sm text-text-2 flex gap-3">
                <span className="text-text-1">{p.nombre || 'Sin nombre'}</span>
                {p.boleta && <span className="text-xs text-text-3">{p.boleta}</span>}
                {p.email && <span className="text-xs text-text-3 truncate">{p.email}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* ─────────── El formulario ─────────── */

function FormDerecho({ tipos, inicial = null, onGuardar, onCancelar, compacto = false }) {
  const [nombre, setNombre]     = useState(inicial?.nombre || '');
  const [titular, setTitular]   = useState(inicial?.titular || 'persona');
  const [cadencia, setCadencia] = useState(inicial?.cadencia || 'ventana');
  const [usos, setUsos]         = useState(inicial?.usos || 1);
  const [aplica, setAplica]     = useState(inicial?.aplica_tipos || []);

  const alternar = (id) => setAplica(l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]));

  const guardar = () => onGuardar({
    nombre, titular, cadencia, usos: Number(usos) || 1, aplica_tipos: aplica,
  });

  return (
    <div className={`rounded-2xl border border-border bg-surface-2 p-4 space-y-4 ${compacto ? 'border-dashed' : ''}`}>
      {compacto && <h4 className="text-xs uppercase tracking-widest text-text-3 font-semibold">Configuración</h4>}

      <label className="block text-xs text-text-3">
        Nombre
        <input value={nombre} onChange={e => setNombre(e.target.value)}
          placeholder="Almuerzo" className="input text-sm" />
      </label>

      <div className="grid sm:grid-cols-2 gap-4">
        <fieldset>
          <legend className="text-xs text-text-3 mb-1">¿De quién es?</legend>
          {TITULARES.map(([k, l, d]) => (
            <label key={k} className="flex gap-2 items-start text-sm py-1 cursor-pointer">
              <input type="radio" name={`t-${inicial?.id || 'nuevo'}`} checked={titular === k}
                onChange={() => setTitular(k)} className="mt-1" />
              <span><b className="text-text-1">{l}</b><br /><span className="text-xs text-text-3">{d}</span></span>
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend className="text-xs text-text-3 mb-1">¿Cada cuánto?</legend>
          {CADENCIAS.map(([k, l, d]) => (
            <label key={k} className="flex gap-2 items-start text-sm py-1 cursor-pointer">
              <input type="radio" name={`c-${inicial?.id || 'nuevo'}`} checked={cadencia === k}
                onChange={() => setCadencia(k)} className="mt-1" />
              <span><b className="text-text-1">{l}</b><br /><span className="text-xs text-text-3">{d}</span></span>
            </label>
          ))}
        </fieldset>
      </div>

      <label className="block text-xs text-text-3">
        Cuántos por {titular === 'grupo' ? 'boleta' : 'persona'}
        {cadencia === 'ventana' && ' y franja'}
        <input type="number" min="1" max="100" value={usos} onChange={e => setUsos(e.target.value)}
          className="input text-sm w-24" />
      </label>

      <div>
        <p className="text-xs text-text-3 mb-1">¿A qué boletas?</p>
        <div className="flex flex-wrap gap-2">
          {tipos.map(t => (
            <label key={t.id} className={`px-3 py-1.5 rounded-lg border text-xs cursor-pointer ${aplica.includes(t.id) ? 'border-primary bg-primary/10 text-text-1' : 'border-border text-text-3'}`}>
              <input type="checkbox" className="hidden" checked={aplica.includes(t.id)} onChange={() => alternar(t.id)} />
              {t.nombre}
            </label>
          ))}
        </div>
        {/* La trampa de la lista vacía, dicha antes de guardar y no después:
            un derecho sin tipos reparte almuerzo a los 2.000 asistentes en vez
            de a los 40 expositores, y eso se descubre con la comida servida. */}
        <p className={`text-xs mt-2 ${aplica.length ? 'text-text-3' : 'text-warning'}`}>
          {aplica.length
            ? `Sólo esas ${aplica.length === 1 ? 'boletas' : `${aplica.length} clases de boleta`}.`
            : 'Sin marcar ninguna, aplica a TODAS las boletas del evento.'}
        </p>
      </div>

      <div className="flex gap-2">
        <button className="btn btn-primary btn-sm" disabled={!nombre.trim()} onClick={guardar}>
          {inicial ? 'Guardar' : 'Crear'}
        </button>
        {onCancelar && <button className="btn btn-ghost btn-sm" onClick={onCancelar}>Cancelar</button>}
      </div>
    </div>
  );
}
