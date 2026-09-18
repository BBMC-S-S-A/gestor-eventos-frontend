import { useState, useEffect } from 'react';
import { eventosApi } from '../../../../api/eventos.js';
import { clientesApi } from '../../../../api/clientes.js';
import { useToast } from '../../../../context/ToastContext.jsx';
import ImagePicker from '../../../../components/ui/ImagePicker.jsx';
import WalletCard from '../../../../components/public/WalletCard.jsx';
import CompartirAlEscanear from './CompartirAlEscanear.jsx';
import {
  walletVariantes, nuevaVariante, PUBLICOS,
  reglasPuntos, REGLAS_PUNTOS, ALCANCES,
} from '../../../../lib/wallet.js';

/* Asistentes · Tarjeta — carné digital / wallet del asistente.
   Ahora con VARIANTES por público: la tarjeta del staff no es la del
   asistente, y un VIP puede tener la suya. Debajo, las reglas de cuántos
   puntos otorga cada acción. Todo en page_json.wallet (variantes) y
   page_json.puntos (reglas). Sin migración de tablas. */

const ESTILOS = [
  { value: 'gradiente', label: 'Degradado' },
  { value: 'oscuro',    label: 'Oscuro' },
  { value: 'claro',     label: 'Claro' },
  { value: 'neon',      label: 'Neón' },
];

export default function TarjetaSection({ evento }) {
  const { success, error } = useToast();
  const [variantes, setVariantes] = useState(() => walletVariantes(evento.page_json));
  const [puntos, setPuntos]       = useState(() => reglasPuntos(evento.page_json));
  const [activa, setActiva]       = useState(0);
  const [tiposBoleta, setTiposBoleta] = useState([]);
  const [saving, setSaving] = useState(false);

  const v = variantes[activa] || variantes[0];
  const setV = (patch) => setVariantes(list => list.map((x, i) => i === activa ? { ...x, ...patch } : x));

  /* Tipos de boleta reales del evento, para poder asignar una variante a
     "VIP" o "Prensa" con un clic en vez de escribir el nombre a mano. */
  useEffect(() => {
    const tt = evento.ticket_types || evento.ticketTypes;
    if (Array.isArray(tt) && tt.length) { setTiposBoleta(tt.map(t => t.nombre).filter(Boolean)); return; }
    clientesApi.listarTodos(evento.id)
      .then(d => {
        const nombres = [...new Set((d.clientes || d.tickets || [])
          .map(c => c.tipo?.nombre || c.ticket_nombre).filter(Boolean))];
        setTiposBoleta(nombres);
      })
      /* Es el camino de RESPALDO: los tipos salen del evento y sólo si no
         vienen se deducen de las boletas vendidas. Sin ellos el diseñador
         pierde el atajo de «una variante por tipo», no la pantalla. */
      .catch(() => {});
  }, [evento.id]);

  const agregar = () => {
    setVariantes(list => {
      const nueva = nuevaVariante({ nombre: `Tarjeta ${list.length + 1}`, publico: 'staff' });
      setActiva(list.length);
      return [...list, nueva];
    });
  };

  const duplicar = () => {
    setVariantes(list => {
      const copia = nuevaVariante({ ...v, nombre: `${v.nombre} (copia)` });
      setActiva(list.length);
      return [...list, copia];
    });
  };

  const quitar = () => {
    if (variantes.length <= 1) { error('Debe quedar al menos una tarjeta.'); return; }
    setVariantes(list => list.filter((_, i) => i !== activa));
    setActiva(a => Math.max(0, a - 1));
  };

  const toggleTipo = (t) => setV({
    tipos: v.tipos?.includes(t) ? v.tipos.filter(x => x !== t) : [...(v.tipos || []), t],
  });

  const guardar = async () => {
    setSaving(true);
    try {
      await eventosApi.update(evento.id, {
        page_json: { wallet: { variantes }, puntos },
      });
      success('Tarjetas y puntos guardados.');
    } catch (e) { error(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  const ticketDemo = { guest_nombre: 'María Restrepo', tipo: { nombre: v.tipos?.[0] || 'VIP' }, codigo: 'DEMO-QR-123' };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Qué ve quien escanea el QR de alguien con su celular. Es del evento,
          no de cada variante de diseño, y se guarda aparte. */}
      <CompartirAlEscanear evento={evento} />

      {/* ── Selector de variantes ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {variantes.map((x, i) => (
          <button key={x.id} onClick={() => setActiva(i)}
            className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors flex items-center gap-2
              ${i === activa ? 'border-accent bg-accent/10 text-text-1' : 'border-border text-text-3 hover:text-text-1'}`}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: x.estilo === 'gradiente' ? `linear-gradient(135deg, ${x.color1}, ${x.color2})` : x.color1 }} />
            {x.nombre}
            <span className="text-[10px] uppercase tracking-wider opacity-60">{PUBLICOS.find(p => p.value === x.publico)?.label || x.publico}</span>
          </button>
        ))}
        <button onClick={agregar} className="px-3 py-2 rounded-xl text-xs font-medium border border-dashed border-border text-text-3 hover:text-text-1 hover:border-accent transition-colors">
          + Añadir tarjeta
        </button>
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        {/* ── Configuración de la variante activa ── */}
        <div className="space-y-5">
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <h3 className="text-base font-semibold text-text-1">Esta tarjeta</h3>
              <div className="flex items-center gap-1">
                <button onClick={duplicar} className="btn-ghost btn-sm">Duplicar</button>
                {variantes.length > 1 && <button onClick={quitar} className="btn-ghost btn-sm text-danger">Quitar</button>}
              </div>
            </div>
            <div className="card-body space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Nombre</label>
                  <input className="input" value={v.nombre} onChange={e => setV({ nombre: e.target.value })} placeholder="Ej. Staff, VIP…" />
                </div>
                <div>
                  <label className="label">Para</label>
                  <select className="input" value={v.publico} onChange={e => setV({ publico: e.target.value })}>
                    {PUBLICOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-text-3 -mt-2">{PUBLICOS.find(p => p.value === v.publico)?.nota}</p>

              {v.publico === 'asistentes' && tiposBoleta.length > 0 && (
                <div>
                  <label className="label">Solo para estos tipos de boleta <span className="lowercase tracking-normal font-normal text-text-3">(opcional)</span></label>
                  <div className="flex flex-wrap gap-2">
                    {tiposBoleta.map(t => (
                      <button key={t} onClick={() => toggleTipo(t)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
                          ${v.tipos?.includes(t) ? 'border-accent bg-accent/10 text-text-1' : 'border-border text-text-3 hover:text-text-1'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-text-3 mt-1">Si no marcas ninguno, aplica a todos los asistentes que no tengan tarjeta propia.</p>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3 className="text-base font-semibold text-text-1">Estilo</h3></div>
            <div className="card-body space-y-4">
              <div>
                <label className="label">Plantilla</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ESTILOS.map(e => (
                    <button key={e.value} onClick={() => setV({ estilo: e.value })}
                      className={`px-2 py-2 rounded-xl text-xs font-medium border transition-colors ${v.estilo === e.value ? 'border-accent bg-accent/10 text-text-1' : 'border-border text-text-3 hover:text-text-1'}`}>{e.label}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Color principal</label>
                  <input type="color" value={v.color1} onChange={e => setV({ color1: e.target.value })} className="w-full h-10 rounded-lg border border-border bg-surface cursor-pointer p-1" />
                </div>
                <div>
                  <label className="label">Color secundario</label>
                  <input type="color" value={v.color2} onChange={e => setV({ color2: e.target.value })} className="w-full h-10 rounded-lg border border-border bg-surface cursor-pointer p-1" />
                </div>
              </div>
              <div>
                <label className="label">Logo de la tarjeta <span className="lowercase tracking-normal font-normal text-text-3">(opcional)</span></label>
                <ImagePicker value={v.logo} onChange={val => setV({ logo: val })} ownerId={evento.id} placeholder="Por defecto usa la inicial de la marca" />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3 className="text-base font-semibold text-text-1">Contenido</h3></div>
            <div className="card-body space-y-3">
              <Toggle label="Mostrar QR de acceso" checked={v.mostrar_qr} onChange={val => setV({ mostrar_qr: val })} />
              <Toggle label="Mostrar tipo de boleta" checked={v.mostrar_tipo} onChange={val => setV({ mostrar_tipo: val })} />
              <Toggle label="Mostrar puntos" checked={v.mostrar_puntos} onChange={val => setV({ mostrar_puntos: val })} />
              {v.mostrar_puntos && (
                <div>
                  <label className="label">Etiqueta de puntos</label>
                  <input className="input" value={v.titulo_puntos} onChange={e => setV({ titulo_puntos: e.target.value })} placeholder="Puntos de asistencia" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Vista previa */}
        <div className="lg:sticky lg:top-4 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-text-3">Vista previa</p>
          <WalletCard design={v} evento={evento} ticket={ticketDemo} puntos={120} />
          <p className="text-xs text-text-3">Así verá su carné quien reciba «{v.nombre}» en <span className="font-mono">/mi-ticket</span>.</p>
        </div>
      </div>

      {/* ── Reglas de puntos ── */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h3 className="text-base font-semibold text-text-1">Puntos por acción</h3>
          <Toggle label="Activar puntos" checked={puntos.activo} onChange={val => setPuntos(p => ({ ...p, activo: val }))} />
        </div>
        <div className={`card-body space-y-3 ${puntos.activo ? '' : 'opacity-50 pointer-events-none'}`}>
          <p className="text-xs text-text-3">Cuánto suma cada acción. El staff acumula por operar; el asistente, por asistir y por lo que le marquen en los stands.</p>

          {/* Alcance: sin esto, alguien redimiría en un evento los puntos de otro. */}
          <div className="pb-2 border-b border-border">
            <label className="label">¿Hasta dónde valen los puntos?</label>
            <select value={puntos.alcance} onChange={e => setPuntos(p => ({ ...p, alcance: e.target.value }))}
              className="input">
              {ALCANCES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
            <p className="text-[11px] text-text-3 mt-1">{ALCANCES.find(a => a.value === puntos.alcance)?.nota}</p>
          </div>
          {REGLAS_PUNTOS.map(r => (
            <div key={r.key} className="flex items-center gap-3 py-1">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-1">{r.label} <span className="text-[10px] uppercase tracking-wider text-text-3 ml-1">{r.quien}</span></p>
                <p className="text-[11px] text-text-3">{r.nota}</p>
              </div>
              <input type="number" min={0} max={100000} value={puntos[r.key]}
                onChange={e => setPuntos(p => ({ ...p, [r.key]: Math.max(0, Number(e.target.value) || 0) }))}
                className="input !h-9 w-24 text-right" />
              <span className="text-xs text-text-3 w-8">pts</span>
            </div>
          ))}

          {/* Tope anti-fraude para lo que cada expositor da por escaneo */}
          <div className="flex items-center gap-3 py-1 pt-3 border-t border-border">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-1">Tope por escaneo de expositor <span className="text-[10px] uppercase tracking-wider text-text-3 ml-1">Anti-fraude</span></p>
              <p className="text-[11px] text-text-3">Máximo que una empresa puede dar en un solo escaneo, aunque su motivo diga más.</p>
            </div>
            <input type="number" min={1} max={100000} value={puntos.tope_expositor ?? 500}
              onChange={e => setPuntos(p => ({ ...p, tope_expositor: Math.max(1, Number(e.target.value) || 1) }))}
              className="input !h-9 w-24 text-right" />
            <span className="text-xs text-text-3 w-8">pts</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={guardar} disabled={saving} className="btn-primary">{saving ? 'Guardando…' : 'Guardar tarjetas y puntos'}</button>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm text-text-2 cursor-pointer">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full flex-shrink-0 transition-colors ${checked ? 'bg-accent' : 'bg-surface-3'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </label>
  );
}
