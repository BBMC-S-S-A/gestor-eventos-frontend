import { useCallback, useEffect, useState } from 'react';
import client from '../../../../api/client.js';
import { useSondeo } from '../../../../hooks/useSondeo.js';

/* Los rechazos de la puerta de hoy: «ya fue usada» y boletas vencidas.
 *
 * Hasta el 18-sep no se guardaban y nadie sabía si en la puerta había gente
 * intentando entrar dos veces. Se distingue lo que no preocupa —el mismo QR
 * escaneado dos veces en el mismo minuto: la persona ya pasó— de lo que sí:
 * una boleta que vuelve horas después, que es como se ve una prestada. */

const MOTIVOS = { ya_usada_hoy: 'Ya usada hoy', vencida: 'Vencida' };

const hora = (iso) => new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

export default function RechazosPuerta({ eventoId }) {
  const [d, setD] = useState(null);
  const [fallo, setFallo] = useState('');

  const cargar = useCallback(() =>
    client.get(`/eventos/${eventoId}/puerta/rechazos`)
      .then(r => { setD(r.data); setFallo(''); })
      .catch(e => setFallo(e.response?.data?.error || 'No se pudieron consultar los rechazos.')),
  [eventoId]);

  /* Cada minuto, y sólo con la pestaña a la vista: es un resumen, no la puerta. */
  useSondeo(cargar, 60000);
  useEffect(() => { cargar(); }, [cargar]);

  const max = Math.max(1, ...(d?.por_hora || []).map(h => h.n));

  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">Rechazos de la puerta · hoy</p>
        {d && <span className="text-[11px] font-mono text-text-2">{d.total}</span>}
      </div>

      {fallo && <p className="text-xs text-warning-light">{fallo}</p>}
      {!d && !fallo && <p className="text-xs text-text-3">Cargando…</p>}

      {d && d.total === 0 && (
        <p className="text-xs text-text-3">Hoy la puerta no ha rechazado ninguna boleta.</p>
      )}

      {d && d.total > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Cifra n={d.dobles} texto="Escaneo doble" pista="menos de 2 min después de entrar" />
            <Cifra n={d.tardios} texto="Volvió más tarde" pista="posible boleta prestada" aviso={d.tardios > 0} />
            <Cifra n={d.por_motivo?.vencida || 0} texto="Vencidas" pista="pase con duración" />
          </div>

          {d.por_hora.length > 0 && (
            <div className="flex items-end gap-1 h-16" aria-label="Rechazos por hora">
              {d.por_hora.map(h => (
                <div key={h.hora} className="flex-1 flex flex-col items-center gap-0.5" title={`${h.hora}:00 · ${h.n}`}>
                  <div className="w-full rounded-t bg-warning/60" style={{ height: `${(h.n / max) * 48}px` }} />
                  <span className="text-[9px] text-text-3">{h.hora}</span>
                </div>
              ))}
            </div>
          )}

          {d.insistentes.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-2 mb-1">Insisten ({d.insistentes.length})</p>
              <ul className="text-xs text-text-3 space-y-0.5">
                {d.insistentes.map(b => (
                  <li key={b.ticket_id} className="flex justify-between gap-2">
                    <span className="truncate text-text-1">{b.nombre || 'Sin nombre'} <span className="font-mono text-text-3">{b.codigo}</span></span>
                    <span className="flex-shrink-0">{b.veces} veces · última {hora(b.ultimo)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <details>
            <summary className="text-xs text-text-2 cursor-pointer">Últimos {d.ultimos.length}</summary>
            <ul className="text-xs text-text-3 mt-1 space-y-0.5">
              {d.ultimos.map(u => (
                <li key={u.id} className="flex justify-between gap-2">
                  <span className="truncate">{hora(u.created_at)} · <span className="text-text-1">{u.nombre || 'Sin nombre'}</span> <span className="font-mono">{u.codigo}</span></span>
                  <span className="flex-shrink-0">{MOTIVOS[u.motivo] || u.motivo}{u.entro_at ? ` · entró ${hora(u.entro_at)}` : ''}</span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}

function Cifra({ n, texto, pista, aviso }) {
  return (
    <div className={`rounded-xl border p-2 ${aviso ? 'border-warning/40 bg-warning/5' : 'border-border'}`}>
      <p className="text-lg font-bold font-display text-text-1 tabular-nums">{n}</p>
      <p className="text-[11px] text-text-2">{texto}</p>
      <p className="text-[10px] text-text-3">{pista}</p>
    </div>
  );
}
