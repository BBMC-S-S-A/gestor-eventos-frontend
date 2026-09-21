import { useEffect, useState } from 'react';
import { clientesApi } from '../../../../api/clientes.js';

/* Accesos · Lo que no entró.
 *
 * ── Por qué un informe de rechazos ───────────────────────────────────────
 *
 * La curva de ingresos cuenta a quien pasó. Pero una fila no se frena con la
 * gente que pasa: se frena con la que NO pasa y hay que atender igual — la
 * boleta que ya entró hoy, el pase vencido, el código mal tecleado. Cada uno
 * es una parada, una conversación y una persona que sigue ahí.
 *
 * Sin esto, el informe del evento enseña una fila fluida en el rato en que la
 * gente estuvo veinte minutos discutiendo con el staff.
 *
 * En FESTECH IBAGUÉ, el único día que tuvo la anotación desplegada dejó 159
 * rechazos contra 518 ingresos: casi uno de cada cuatro escaneos no abrió la
 * puerta. Estaban guardados desde el primer momento y no había dónde verlos —
 * que es exactamente igual de útil que no guardarlos.
 *
 * ── Por qué los «insistentes» van arriba del todo ────────────────────────
 *
 * Diez rechazos de la misma boleta no son diez problemas: son uno. Casi
 * siempre es alguien a quien nadie supo explicarle qué pasaba, volviendo a la
 * fila una y otra vez. Verlo agrupado convierte un número feo en una persona
 * concreta a la que ir a buscar.
 */

const MOTIVOS = {
  ya_usada_hoy      : { texto: 'Ya había entrado hoy',      pista: 'Reingreso sin escanear la salida, o una boleta compartida' },
  vencida           : { texto: 'Pase vencido',              pista: 'Se le acabó la vigencia por duración' },
  qr_invalido       : { texto: 'QR ilegible',               pista: 'Pantalla rota, captura borrosa o código de otro sistema' },
  no_encontrada     : { texto: 'Boleta no encontrada',      pista: 'Suele ser un código corto tecleado a mano que no cuadra' },
  otro_evento       : { texto: 'De otro evento',            pista: 'El QR es bueno, pero no de aquí' },
  invalido          : { texto: 'Boleta anulada',            pista: null },
  reembolsado       : { texto: 'Boleta reembolsada',        pista: null },
  puerta_no_asignada: { texto: 'Operador sin esa puerta',   pista: 'No es culpa de quien venía: es la asignación de puertas' },
};

const nombreMotivo = (m) => MOTIVOS[m]?.texto || m;
const hora  = (iso) => new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
const fecha = (d) => {
  /* `por_dia` llega como AAAA-MM-DD ya calculado en la zona del recinto. Se
     parte a mano en vez de pasarlo por `new Date`, que lo leería como UTC y
     lo correría un día hacia atrás en Colombia. */
  const [a, m, dd] = String(d).split('-').map(Number);
  if (!a || !m || !dd) return d;
  return new Date(a, m - 1, dd).toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short' });
};

export default function RechazosDeLaPuerta({ evento }) {
  const [datos, setDatos] = useState(null);
  const [fallo, setFallo] = useState(null);
  const [verTodos, setVerTodos] = useState(false);

  useEffect(() => {
    let vivo = true;
    clientesApi.rechazosPuerta(evento.id, { intervalo: 15 })
      .then(d => { if (vivo) setDatos(d); })
      /* Un backend sin la ruta todavía —despliegue a medias— no puede dejar la
         pantalla de puertas a medio pintar: el bloque no sale y ya. */
      .catch(e => { if (vivo) setFallo(e.response?.data?.error || e.message); });
    return () => { vivo = false; };
  }, [evento.id]);

  if (fallo || !datos || datos.total === 0) return null;

  const pico = datos.curva.reduce((mx, p) => (p.n > (mx?.n || 0) ? p : mx), null);

  return (
    <div className="border-t border-border pt-5 space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">Lo que no entró</p>
        <p className="text-[11px] text-text-3">
          {datos.total.toLocaleString('es-CO')} rechazos
          {pico && <> · más apretado a las <b className="text-text-2">{hora(pico.at)}</b> ({pico.n} en 15 min)</>}
        </p>
      </div>

      {/* Por qué. Es lo primero: sin el motivo no se sabe qué arreglar. */}
      <div className="rounded-2xl border border-border bg-surface/40 divide-y divide-border">
        {datos.por_motivo.map(m => (
          <div key={m.motivo} className="px-4 py-2.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-text-1">{nombreMotivo(m.motivo)}</p>
              {MOTIVOS[m.motivo]?.pista && (
                <p className="text-[11px] text-text-3 mt-0.5">{MOTIVOS[m.motivo].pista}</p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <span className="text-sm font-semibold text-text-1 tabular-nums">{m.n}</span>
              <span className="text-[11px] text-text-3 ml-1.5 tabular-nums">
                {Math.round(1000 * m.n / datos.total) / 10}%
              </span>
            </div>
          </div>
        ))}
      </div>

      {datos.por_dia.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {datos.por_dia.map(d => (
            <span key={d.dia} className="text-[11px] text-text-2 bg-surface-2 border border-border rounded-lg px-2 py-1 tabular-nums">
              {fecha(d.dia)} · {d.n}
            </span>
          ))}
        </div>
      )}

      {datos.insistentes.length > 0 && (
        <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4">
          <p className="text-sm font-semibold text-text-1">Boletas que lo intentaron varias veces</p>
          <p className="text-xs text-text-2 mt-0.5 mb-2">
            Cada una es una sola persona volviendo a la fila. Suelen ser a quien nadie alcanzó a
            explicarle qué pasaba.
          </p>
          <div className="space-y-1">
            {(verTodos ? datos.insistentes : datos.insistentes.slice(0, 5)).map(x => (
              <div key={x.ticket_id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-text-1 truncate">
                  {x.nombre || 'Sin nombre'}
                  {x.codigo && <span className="text-text-3 font-mono text-xs ml-2">{x.codigo}</span>}
                </span>
                <span className="text-text-2 tabular-nums flex-shrink-0">{x.n} intentos</span>
              </div>
            ))}
          </div>
          {datos.insistentes.length > 5 && (
            <button onClick={() => setVerTodos(v => !v)} className="btn-ghost btn-sm mt-2">
              {verTodos ? 'Ver menos' : `Ver los ${datos.insistentes.length}`}
            </button>
          )}
        </div>
      )}

      <p className="text-[11px] text-text-3 leading-relaxed">
        Un rechazo no es alguien haciendo trampa: casi siempre es una boleta buena en el momento
        equivocado. Lo que mide esta lista es cuánto tiempo costó la puerta, no cuánta gente lo
        intentó.
      </p>
    </div>
  );
}
