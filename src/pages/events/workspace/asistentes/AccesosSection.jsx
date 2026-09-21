import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { eventosApi } from '../../../../api/eventos.js';
import { ticketsApi } from '../../../../api/tickets.js';
import { clientesApi } from '../../../../api/clientes.js';
import { equipoApi } from '../../../../api/equipo.js';
import { useToast } from '../../../../context/ToastContext.jsx';
import GLoader from '../../../../components/ui/GLoader.jsx';
import RechazosPuerta from './RechazosPuerta.jsx';
import { useSondeo } from '../../../../hooks/useSondeo.js';
import { zonasDelEvento, etiquetaZona } from '../../../../lib/zonas.js';
import { miembrosDelEvento } from '../../../../lib/equipo.js';
import { rolesApi } from '../../../../api/roles.js';
import SelectorDePersonas from '../../../../components/ui/SelectorDePersonas.jsx';

/* Asistentes · Accesos — control de ingresos por puerta.
   El organizador define cuántas entradas hay, qué tipos de boleta admite cada
   una (VIP, general, o todas) y quién registra. En el check-in el staff elige
   su puerta; se valida el tipo y se registra por dónde entró cada persona.
   Config en page_json.accesos; el conteo sale de tickets.acceso. */

function uid() { return 'acc_' + Math.random().toString(36).slice(2, 9); }

/* Para comparar contra lo ya guardado y saber si una lista tiene cambios sin
   persistir. Mismo recorte que hace `guardar*` antes de mandar al servidor:
   sin esto, un espacio de más en el nombre marcaría "sin guardar" para
   siempre. */
/* `staff` son personas y `roles` son roles, y se guardan aparte a propósito.
   Guardar el rol ya resuelto —la gente que hoy lo tiene— haría que quien entre
   mañana a ese rol no quede asignado, que es justo lo que el rol viene a
   evitar: en la puerta no se asigna a Juan, se asigna «a quien esté en
   puerta». */
const limpiarAccesos = (l) => (l || []).map(({ id, nombre, tipos, staff, roles, zona_id }) =>
  ({ id, nombre: (nombre || '').trim(), tipos: tipos || [], staff: staff || [], roles: roles || [], zona_id: zona_id || null }));
export default function AccesosSection({ evento }) {
  const { success, error } = useToast();
  const [accesos, setAccesos] = useState(() => (evento.page_json?.accesos || []).map(a => ({ ...a, _k: a.id })));
  /* Última versión que sí quedó en el servidor: es lo que decide si el botón
     de guardar de cada fila tiene algo que hacer. El PATCH mezcla `page_json`
     por clave (migración 0064), así que mandar sólo `accesos` no toca las
     zonas ni el mapa. */
  const [accesosGuardados, setAccesosGuardados] = useState(() => limpiarAccesos(evento.page_json?.accesos));

  /* Las zonas, para poder decir a cuál da cada puerta. Sólo se leen: se
     administran en «Zonas de interés». */
  const zonasEvento = useMemo(() => zonasDelEvento(evento), [evento]);

  const [alertas, setAlertas] = useState([]);
  const [nuevaAlerta, setNuevaAlerta] = useState('');
  const [tipos, setTipos] = useState([]);
  const [miembros, setMiembros] = useState([]);
  const [roles, setRoles] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardandoAccesos, setGuardandoAccesos] = useState(false);

  useEffect(() => {
    Promise.all([
      ticketsApi.list(evento.id).catch(() => ({ tickets: [] })),
      equipoApi.list(evento.id).catch(() => ({ miembros: [], owner: null })),
      clientesApi.listarTodos(evento.id).catch(() => ({ clientes: [] })),
      /* El catálogo de roles, para poder decir «todo el rol». Si falla, el
         selector sigue sirviendo para elegir personas. */
      rolesApi.list(evento.id).catch(() => ({ roles: [] })),
    ]).then(([tt, eq, cl, rs]) => {
      setTipos(tt.tickets || tt.ticket_types || []);
      /* Antes esto desenredaba a mano las tres formas en que puede venir el
         nombre de un miembro, y se dejaba el rol por el camino. Vive en
         `lib/equipo.js`, con las otras seis pantallas que piden lo mismo. */
      setMiembros(miembrosDelEvento(eq));
      setRoles(rs.roles || []);
      setClientes(cl.clientes || cl.tickets || []);
    }).finally(() => setLoading(false));
  }, [evento.id]);

  /* Si lo que se enseña es lo último que llegó o lo de ahora mismo. */
  const [alertasFrescas, setAlertasFrescas] = useState(true);

  useEffect(() => {
    let vivo = true;
    /* Callado a propósito en la primera carga: si falla, la lista se queda
       como estaba —vacía— y se reintenta sola con el pulso de abajo. Lo que no
       puede pasar es lo de después: que un fallo BORRE alertas que ya se
       habían visto. */
    clientesApi.alertas(evento.id).then(d => { if (vivo) setAlertas(d.alertas || []); }).catch(() => {});
    return () => { vivo = false; };
  }, [evento.id]);

  /* El pulso de alertas, callado mientras la pestaña no se ve. Esta pantalla es
     de configuración: se deja abierta en una pestaña y se vuelve a ella de vez
     en cuando, así que sondearla de fondo cada 8 segundos era gasto puro. */
  const refrescarAlertas = useCallback(
    () => clientesApi.alertas(evento.id)
      .then(d => { setAlertas(d.alertas || []); setAlertasFrescas(true); })
      /* Un sondeo que falla NO vacía la lista.
         Escribía `setAlertas([])` implícitamente al no tocar nada, pero peor:
         cualquier fallo dejaba la pantalla igual y sin decirlo, así que quien
         está en la puerta veía «sin alertas» —que se lee como «todo en
         orden»— cuando en realidad llevaba minutos sin poder preguntar.
         Se conserva lo último que sí llegó y se marca como no fresco: una
         alerta vieja sirve, una lista vacía mentirosa no. */
      .catch(() => setAlertasFrescas(false)),
    [evento.id]
  );
  useSondeo(refrescarAlertas, 8000);

  const reportar = async () => {
    if (!nuevaAlerta.trim()) return;
    try {
      await clientesApi.reportarAlerta(evento.id, { mensaje: nuevaAlerta.trim(), tipo: 'incidente', nivel: 'warning' });
      setNuevaAlerta('');
      const d = await clientesApi.alertas(evento.id); setAlertas(d.alertas || []);
    } catch (e) { error(e.response?.data?.error || e.message); }
  };
  const resolver = async (id) => {
    try { await clientesApi.resolverAlerta(evento.id, id); setAlertas(a => a.map(x => x.id === id ? { ...x, resuelta: true } : x)); }
    catch (e) { error(e.response?.data?.error || e.message); }
  };

  /* Conteo de ingresos por puerta (tickets ya usados con su acceso). */
  const conteo = useMemo(() => {
    const m = {};
    for (const c of clientes) if (c.estado === 'usado' && c.acceso) m[c.acceso] = (m[c.acceso] || 0) + 1;
    return m;
  }, [clientes]);
  const sinPuerta = useMemo(() => clientes.filter(c => c.estado === 'usado' && !c.acceso).length, [clientes]);

  const set = (k, patch) => setAccesos(l => l.map(a => a._k === k ? { ...a, ...patch } : a));
  const agregar = () => setAccesos(l => [...l, { _k: uid(), id: uid(), nombre: '', tipos: [], staff: [], roles: [] }]);
  const quitar = (k) => {
    const lista = accesos.filter(a => a._k !== k);
    setAccesos(lista);
    guardarAccesos(lista); // borrar persiste al momento, no espera al botón de guardar
  };
  const toggleTipo = (k, tid) => set(k, { tipos: (accesos.find(a => a._k === k)?.tipos || []).includes(tid)
    ? accesos.find(a => a._k === k).tipos.filter(x => x !== tid)
    : [...(accesos.find(a => a._k === k)?.tipos || []), tid] });
  const asignar = (k, { personas, roles: rolesElegidos }) =>
    set(k, { staff: personas, roles: rolesElegidos });

  /* Guardar puertas y guardar zonas van cada una por su lado: antes un botón
     único mandaba las dos listas juntas, así que una puerta a medio llenar
     bloqueaba guardar un cambio de zona que no tenía nada que ver. Las zonas
     se fueron ya a su propia pantalla, pero el guardado por fila se queda: el
     PATCH mezcla `page_json` por clave (migración 0064), así que mandar sólo
     `accesos` no toca nada más. `lista` opcional es para poder guardar de
     inmediato la lista recién recortada al borrar una fila, antes de que el
     estado de React se actualice. */
  const guardarAccesos = async (lista = accesos) => {
    for (const a of lista) if (!a.nombre.trim()) { error('Cada puerta necesita un nombre.'); return; }
    setGuardandoAccesos(true);
    try {
      const limpio = limpiarAccesos(lista);
      await eventosApi.update(evento.id, { page_json: { accesos: limpio } });
      setAccesosGuardados(limpio);
      success('Puertas guardadas.');
    } catch (e) { error(e.response?.data?.error || e.message); }
    finally { setGuardandoAccesos(false); }
  };

  const accesosSucio = JSON.stringify(limpiarAccesos(accesos)) !== JSON.stringify(accesosGuardados);

  if (loading) return <GLoader message="Cargando accesos…" />;

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold font-display text-text-1 tracking-tight">Accesos e ingresos</h2>
        <p className="text-sm text-text-2 mt-1">Define las entradas del evento, qué boletas admite cada una y quién registra.</p>
      </div>

      {/* ── Alertas en vivo ── */}
      <div className="rounded-2xl border border-border bg-surface/40 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">Alertas en vivo</p>
          {alertas.filter(a => !a.resuelta).length > 0 && (
            <span className="text-[11px] font-mono bg-danger/15 text-danger px-2 py-0.5 rounded-full">{alertas.filter(a => !a.resuelta).length} activas</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input value={nuevaAlerta} onChange={e => setNuevaAlerta(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') reportar(); }}
            placeholder="Reportar algo: cola en la puerta, incidente…" className="input flex-1 text-sm" />
          <button onClick={reportar} disabled={!nuevaAlerta.trim()} className="btn-secondary btn-sm flex-shrink-0">Reportar</button>
        </div>
        {/* «Sin alertas» se lee como «todo en orden», así que sólo se dice
            cuando de verdad lo sabemos. Si el pulso está fallando, lo que hay
            que decir es que no lo sabemos — no tranquilizar a quien está en la
            puerta. */}
        {!alertasFrescas && (
          <p className="text-xs text-warning-light mb-2">
            No estamos recibiendo el estado de las alertas. Lo que ves abajo puede no estar al día.
          </p>
        )}
        {alertas.length === 0 ? (
          <p className="text-xs text-text-3">
            {alertasFrescas
              ? 'Sin alertas. Las de aforo lleno aparecen solas; el staff puede reportar aquí.'
              : 'No hemos podido consultar las alertas.'}
          </p>
        ) : (
          <ul className="space-y-1.5 max-h-64 overflow-y-auto">
            {alertas.map(a => {
              const c = a.nivel === 'critico' ? 'border-danger/40 bg-danger/5' : a.nivel === 'warning' ? 'border-warning/40 bg-warning/5' : 'border-border bg-surface-2/40';
              return (
                <li key={a.id} className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${a.resuelta ? 'opacity-50' : ''} ${c}`}>
                  <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${a.nivel === 'critico' ? 'bg-danger/15 text-danger' : a.nivel === 'warning' ? 'bg-warning/15 text-warning' : 'bg-surface-2 text-text-3'}`}>{a.tipo}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-1">{a.mensaje}</p>
                    <p className="text-[11px] text-text-3">{a.autor?.nombre ? `${a.autor.nombre} · ` : ''}{new Date(a.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  {!a.resuelta && <button onClick={() => resolver(a.id)} className="btn-ghost btn-sm text-xs flex-shrink-0">Resolver</button>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Rechazos de la puerta (0135) ── */}
      <RechazosPuerta eventoId={evento.id} />

      {/* Tablero de ingresos por puerta */}
      {Object.keys(conteo).length > 0 && (
        <div className="rounded-2xl border border-border bg-surface/40 p-4">
          <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold mb-3">Ingresos registrados</p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(conteo).map(([nombre, n]) => (
              <div key={nombre} className="px-3 py-2 rounded-xl bg-surface-2 border border-border">
                <p className="text-lg font-bold font-display tabular-nums text-text-1">{n}</p>
                <p className="text-[11px] text-text-3">{nombre}</p>
              </div>
            ))}
            {sinPuerta > 0 && (
              <div className="px-3 py-2 rounded-xl bg-surface-2 border border-dashed border-border">
                <p className="text-lg font-bold font-display tabular-nums text-text-2">{sinPuerta}</p>
                <p className="text-[11px] text-text-3">Sin puerta</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {accesos.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border bg-surface/40 px-6 py-12 text-center">
            <p className="text-sm text-text-3 mb-4">Si tu evento tiene una sola entrada no necesitas configurar nada. Agrega puertas si tienes varias o quieres separar VIP de general.</p>
          </div>
        )}
        {accesos.map((a, i) => (
          <div key={a._k} className="rounded-2xl border border-border bg-surface/40 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-3 w-5">{i + 1}.</span>
              <input value={a.nombre} onChange={e => set(a._k, { nombre: e.target.value })}
                placeholder="Ej. Entrada principal, Entrada VIP, Puerta Norte" className="input flex-1" />
              {accesosSucio && (
                <button onClick={() => guardarAccesos()} disabled={guardandoAccesos}
                  className="btn-secondary btn-sm flex-shrink-0">{guardandoAccesos ? 'Guardando…' : 'Guardar'}</button>
              )}
              <button onClick={() => quitar(a._k)} className="w-8 h-8 rounded-lg text-danger-light hover:bg-danger/10 flex items-center justify-center flex-shrink-0">✕</button>
            </div>

            {tipos.length > 0 && (
              <div>
                <label className="label text-xs">Boletas que admite <span className="lowercase tracking-normal font-normal text-text-3">(vacío = todas)</span></label>
                <div className="flex flex-wrap gap-1.5">
                  {tipos.map(t => (
                    <button key={t.id} onClick={() => toggleTipo(a._k, t.id)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
                        ${(a.tipos || []).includes(t.id) ? 'border-accent bg-accent/10 text-text-1' : 'border-border text-text-3 hover:text-text-1'}`}>
                      {t.nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* A qué zona da esta puerta.
                Antes las puertas y las zonas eran dos listas sin un solo campo
                que las cruzara, así que la pregunta de quien está delante del
                plano —«¿por dónde se entra a la tarima?»— no tenía respuesta en
                ninguna pantalla. Es opcional a propósito: la mayoría de las
                puertas dan al recinto entero y no a una zona concreta. */}
            {zonasEvento.length > 0 && (
              <div>
                <label className="label text-xs">
                  A qué zona da <span className="lowercase tracking-normal font-normal text-text-3">(opcional)</span>
                </label>
                <select value={a.zona_id || ''} onChange={e => set(a._k, { zona_id: e.target.value || null })}
                  className="input">
                  <option value="">Al recinto en general</option>
                  {zonasEvento.map(z => (
                    <option key={z.id} value={z.id}>{etiquetaZona(z)}</option>
                  ))}
                </select>
                <p className="text-[11px] text-text-3 mt-1">
                  Se ve en <b>Zonas de interés</b>: la zona enseña por dónde se entra a ella.
                </p>
              </div>
            )}

            {miembros.length > 0 && (
              <div>
                <label className="label text-xs">Quién registra aquí <span className="lowercase tracking-normal font-normal text-text-3">(opcional)</span></label>
                {/* Era una ficha por miembro con el nombre y nada más: en un
                    evento con cuarenta personas, cuarenta fichas seguidas, sin
                    buscador y sin saber cuál de los cuatro «Juan» es el de
                    puerta. */}
                <SelectorDePersonas
                  miembros={miembros}
                  roles={roles}
                  personas={a.staff || []}
                  rolesSel={a.roles || []}
                  onChange={(v) => asignar(a._k, v)}
                />
                <p className="text-[11px] text-text-3 mt-1.5">
                  Elegir un rol entero es lo que aguanta un cambio de turno: quien entre
                  después a ese rol queda asignado sin volver aquí.
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <button onClick={agregar} className="btn-ghost btn-sm">+ Añadir puerta</button>

      {/* ── Las zonas se fueron a su propia pantalla ──
          Estaban aquí porque una zona y una puerta se configuraban juntas, y
          durante un tiempo tuvo sentido. Dejó de tenerlo cuando la zona pasó a
          tener aforo en vivo, agenda y stands: eso no cabe en un apartado al
          final de la pantalla de puertas. Se queda el enlace, y sólo el
          enlace — repetir aquí el alta sería volver a tener dos dueños del
          mismo dato, que es justo lo que se acaba de quitar del mapa. */}
      <div className="border-t border-border pt-5">
        <Link to={`/eventos/${evento.id}?s=zonas&t=zonas`}
          className="block rounded-2xl border border-border bg-surface/40 p-4 hover:bg-surface-2/40 transition-colors">
          <p className="text-base font-semibold text-text-1">Zonas de interés <span className="text-text-3 font-normal">→</span></p>
          <p className="text-sm text-text-2 mt-1">
            Las zonas del recinto —tarima, zona VIP, patio de comidas— se crean y se miran ahí:
            cada una con su aforo en vivo, lo que ocurre dentro y los stands montados.
          </p>
        </Link>
      </div>
    </div>
  );
}
