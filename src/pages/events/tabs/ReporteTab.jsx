import { useEffect, useState } from 'react';
import { analyticsApi } from '../../../api/analytics.js';
import { tareasApi } from '../../../api/tareas.js';
import { interaccionesApi } from '../../../api/interacciones.js';
import { vacantesApi } from '../../../api/vacantes.js';
import { useAsistenciaEnVivo } from '../../../hooks/useAsistenciaEnVivo.js';
import { clientesApi } from '../../../api/clientes.js';
import { normalizarBoletas, resumenPorDia } from '../../../lib/ingresosPorHora.js';
import GLoader from '../../../components/ui/GLoader.jsx';

/* Reporte post-evento — consolida en una sola hoja (imprimible / PDF) lo que
   quedó repartido por el workspace: ventas, asistencia, gamificación,
   expositores, tareas y contrataciones. */

const money = (n, cur = 'COP') => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}${cur && cur !== 'COP' ? ' ' + cur : ''}`;

/* El día, en la forma corta que cabe en una tabla impresa. */
const DIA_CORTO = (d) => d.toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short' });
const HORA      = (d) => (d ? d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—');

export default function ReporteTab({ evento }) {
  const [data, setData] = useState(null);
  /* Cómo entró la gente, por día. Va en su propia petición y en su propio
     estado —y no dentro del `Promise.all` de arriba— porque recorre TODAS las
     boletas del evento: son ~25 llamadas para un evento de 4.500. Metido en el
     bloque principal, el reporte entero se quedaría en «Reuniendo…» esperando
     a un bloque que es el último de la hoja. Así el resto se pinta enseguida y
     este aparece cuando está.

     Franja de 60 minutos: es un papel. El detalle de cinco minutos vive en
     «Ingresos por hora», que es donde se va a mirar de verdad. */
  const [puerta, setPuerta] = useState(null);
  /* `total` es el conteo que el servidor hace recorriendo TODAS las boletas del
     evento — el mismo que enseña la pestaña Clientes. Viene en esta misma
     petición, así que traerlo no cuesta nada. Ver `vendidas` más abajo. */
  const { ingresados, total: boletasReales } = useAsistenciaEnVivo(evento.id);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      analyticsApi.get(evento.id, 3650).catch(() => null),
      tareasApi.list(evento.id).catch(() => ({ tareas: [] })),
      interaccionesApi.rankingExpositores(evento.id).catch(() => ({ ranking: [] })),
      vacantesApi.listar(evento.id).catch(() => ({ vacantes: [] })),
    ]).then(([an, ta, rk, va]) => {
      if (!vivo) return;
      setData({ an, tareas: ta.tareas || [], ranking: rk.ranking || [], vacantes: va.vacantes || [] });
    });
    return () => { vivo = false; };
  }, [evento.id]);

  useEffect(() => {
    let vivo = true;
    clientesApi.listarTodos(evento.id)
      .then(d => { if (vivo) setPuerta(resumenPorDia(normalizarBoletas(d.clientes || []), 60)); })
      /* Si falla, el bloque no sale y el resto del reporte se entrega igual.
         Un reporte sin la tabla de la puerta sigue sirviendo; uno que no se
         pinta por culpa de esa tabla, no. */
      .catch(() => { if (vivo) setPuerta([]); });
    return () => { vivo = false; };
  }, [evento.id]);

  if (!data) return <GLoader message="Reuniendo el reporte…" />;

  const r = data.an?.resumen || {};
  /* `ventas_por_tipo`, que es como se llama en la respuesta. Aquí ponía
     `data.an?.ventas`, un nombre que el servidor no devuelve, así que la tabla
     de ventas por tipo salía siempre vacía y el bloque entero no se pintaba
     nunca. No fallaba nada: sencillamente no estaba, que es peor de encontrar. */
  const ventas = data.an?.ventas_por_tipo || data.an?.ventas || [];
  const part = data.an?.participacion || { sub_eventos: [], torneos: [] };
  /* Cuántas boletas se vendieron, de verdad.
   *
   * Aquí ponía `evento.aforo_vendido`, que es una columna denormalizada que el
   * backend lleva a mano —no hay disparador que la mantenga— y que se actualiza
   * en unos caminos de creación de boleta y en otros no. Se queda corta, y el
   * desfase CRECE con el evento: en FESTECH IBAGUÉ marcaba 4.273 cuando había
   * 4.485 boletas. Doscientas doce personas que el reporte no le contaba al
   * cliente.
   *
   * Y peor que estar mal: estaba mal SÓLO AQUÍ. La pestaña Clientes cuenta las
   * filas y decía 4.485; este reporte decía 4.273. El mismo evento con dos
   * números, y el que se imprime y se entrega era el bajo. Se reportó como
   * «había 4.150 y al actualizar había 4.090»: no faltaban boletas, sobraban
   * contadores.
   *
   * Se prefiere el conteo real y `aforo_vendido` queda de respaldo, para una
   * pantalla que cargue antes de que llegue la lista. */
  const vendidas = boletasReales ?? evento.aforo_vendido ?? 0;
  const pctAforo = evento.aforo_total > 0 ? Math.round(vendidas / evento.aforo_total * 100) : null;
  const tareasHechas = data.tareas.filter(t => t.estado === 'hecho').length;
  const puntosExpo = data.ranking.reduce((a, e) => a + (e.puntos || 0), 0);
  const contratados = data.vacantes.reduce((a, v) => a + (v.postulaciones?.aceptado || 0), 0);
  const postulaciones = data.vacantes.reduce((a, v) => a + (v.postulaciones?.total || 0), 0);
  const hoy = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });

  const KPIS = [
    { label: 'Boletas vendidas', v: vendidas.toLocaleString('es-CO') },
    { label: 'Aforo', v: pctAforo != null ? `${pctAforo}%` : '—', sub: evento.aforo_total ? `${vendidas}/${evento.aforo_total}` : null },
    { label: 'Ingresos', v: money(r.ingresos, evento.currency) },
    { label: 'Asistieron (check-in)', v: (ingresados ?? 0).toLocaleString('es-CO') },
    { label: 'Puntos en stands', v: puntosExpo.toLocaleString('es-CO') },
    { label: 'Contrataciones', v: contratados, sub: `${postulaciones} postulaciones` },
  ];

  return (
    <div className="space-y-5">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #reporte-print, #reporte-print * { visibility: visible !important; }
        #reporte-print { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; }
        .no-print { display: none !important; }
      }`}</style>

      <div className="flex items-center justify-between gap-3 flex-wrap no-print">
        <div>
          <h2 className="text-2xl font-bold font-display text-text-1 tracking-tight">Reporte del evento</h2>
          <p className="text-sm text-text-2 mt-1">Un resumen consolidado, listo para imprimir o guardar como PDF.</p>
        </div>
        <button onClick={() => window.print()} className="btn-primary btn-sm flex-shrink-0">Imprimir / Guardar PDF</button>
      </div>

      <div id="reporte-print" className="space-y-5">
        <div className="border-b border-border pb-3">
          <h1 className="text-xl font-bold font-display text-text-1">{evento.titulo}</h1>
          <p className="text-xs text-text-3">Reporte generado el {hoy}</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {KPIS.map(k => (
            <div key={k.label} className="rounded-2xl border border-border bg-surface/40 px-4 py-3">
              <p className="text-2xl font-bold font-display text-text-1 tabular-nums leading-none">{k.v}</p>
              {k.sub && <p className="text-[11px] text-text-3 mt-0.5">{k.sub}</p>}
              <p className="text-[11px] text-text-3 mt-1 uppercase tracking-wide">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Ventas por tipo */}
        {ventas.length > 0 && (
          <Bloque titulo="Por tipo de boleta">
            {/* En un movil de 375px, cuatro columnas con dinero y porcentajes no
                caben: o se parten los numeros o se corta la tabla. Se deja que
                ruede en horizontal, que es lo unico que no miente. */}
            <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-text-3">
                  <th className="text-left font-semibold pb-2">Boleta</th>
                  <th className="text-right font-semibold pb-2">Vendidas</th>
                  <th className="text-right font-semibold pb-2">Entraron</th>
                  <th className="text-right font-semibold pb-2">Ingresos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ventas.map((t, i) => (
                  <tr key={i}>
                    <td className="py-2 text-text-2">{t.nombre || t.tipo || 'Boleta'}</td>
                    <td className="py-2 text-right text-text-3 tabular-nums">{t.vendidos}</td>
                    {/* Vender y que la persona aparezca son cosas distintas, y
                        la diferencia es el dato que se reporta después. Con
                        «vendidas» a secas, una boleta que nadie usó se ve igual
                        de bien que una que llenó la sala. */}
                    <td className="py-2 text-right tabular-nums">
                      {t.ingresaron == null ? <span className="text-text-3">—</span> : (
                        <>
                          <span className="text-text-1 font-semibold">{t.ingresaron}</span>
                          {t.vendidos > 0 && (
                            <span className={`ml-1.5 text-[11px] ${t.asistencia >= 60 ? 'text-success' : t.asistencia >= 30 ? 'text-warning' : 'text-text-3'}`}>
                              {t.asistencia}%
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="py-2 text-right text-text-1 font-semibold tabular-nums">{money(t.ingresos, evento.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Bloque>
        )}

        {/* Cómo entró la gente.

            El resto del reporte cuenta CUÁNTOS; esto cuenta CUÁNDO, que es lo
            que sirve para montar el año que viene. «En la puerta» son los que
            se registraron a menos de quince minutos de entrar: es la columna
            que explica la cola, porque un QR se escanea en tres segundos y un
            formulario de pie se rellena en tres minutos. */}
        {puerta?.length > 0 && (
          <Bloque titulo="Cómo entró la gente">
            <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-sm min-w-[460px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-text-3">
                  <th className="text-left font-semibold pb-2">Día</th>
                  <th className="text-right font-semibold pb-2">Entradas</th>
                  <th className="text-right font-semibold pb-2">Horario</th>
                  <th className="text-right font-semibold pb-2">Hora pico</th>
                  <th className="text-right font-semibold pb-2">En la puerta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {puerta.map(d => (
                  <tr key={d.fecha.toDateString()}>
                    <td className="py-2 text-text-2 capitalize">{DIA_CORTO(d.fecha)}</td>
                    <td className="py-2 text-right text-text-1 font-semibold tabular-nums">
                      {d.ingresos.toLocaleString('es-CO')}
                      {d.reingresos > 0 && (
                        <span className="ml-1.5 text-[11px] text-text-3 font-normal">+{d.reingresos} volvieron</span>
                      )}
                    </td>
                    <td className="py-2 text-right text-text-3 tabular-nums">{HORA(d.primera)}–{HORA(d.ultima)}</td>
                    <td className="py-2 text-right text-text-2 tabular-nums">
                      {d.pico ? <>{HORA(d.pico.at)} <span className="text-text-3">({d.pico.n})</span></> : '—'}
                    </td>
                    {/* Por encima de un tercio de la fila inscribiéndose en la
                        fila, el número deja de ser un dato y pasa a ser el
                        hallazgo del reporte. Se marca. */}
                    <td className="py-2 text-right tabular-nums">
                      <span className={d.pctEnPuerta >= 35 ? 'text-warning font-semibold' : 'text-text-2'}>
                        {d.pctEnPuerta}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <p className="text-[11px] text-text-3 mt-2 leading-relaxed">
              «En la puerta» son quienes se registraron menos de 15 minutos antes de entrar: una estimación a
              partir de la hora de registro y la de ingreso, no una medición de la fila.
            </p>
          </Bloque>
        )}

        {/* Qué hicieron una vez dentro.

            El resumen dice cuánta gente entró al evento; esto dice a qué fue.
            Es lo que se pide para reportar después: cuántos pasaron por cada
            taller y cuántos compitieron en cada torneo. */}
        {(part.sub_eventos?.length > 0 || part.torneos?.length > 0) && (
          <Bloque titulo="Participación dentro del evento">
            {part.sub_eventos?.length > 0 && (
              <div className="overflow-x-auto -mx-1 px-1 mb-4">
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-text-3">
                    <th className="text-left font-semibold pb-2">Sub-evento</th>
                    <th className="text-right font-semibold pb-2">Inscritos</th>
                    <th className="text-right font-semibold pb-2">Asistieron</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {part.sub_eventos.map(s => (
                    <tr key={s.id}>
                      <td className="py-2 text-text-2">
                        {s.titulo}
                        {/* Cuántos venían ya con entrada. Los que no, llegaron
                            directos al taller: dice si atrae gente nueva o
                            sólo reparte a la que ya estaba. */}
                        {s.con_boleta < s.inscritos && (
                          <span className="text-[11px] text-text-3"> · {s.inscritos - s.con_boleta} sin boleta</span>
                        )}
                      </td>
                      <td className="py-2 text-right text-text-1 font-semibold tabular-nums">
                        {s.inscritos}
                        {s.ocupacion != null && (
                          <span className="ml-1.5 text-[11px] text-text-3">de {s.cupo}</span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums text-text-3">
                        {s.asistieron > 0 ? s.asistieron : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
            {part.torneos?.length > 0 && (
              <ul className="divide-y divide-border">
                {part.torneos.map(t => (
                  <li key={t.id} className="py-2 flex items-center justify-between gap-3">
                    <span className="text-sm text-text-2">{t.nombre}</span>
                    <span className="text-sm text-text-1 font-semibold tabular-nums">
                      {t.equipos} <span className="text-[11px] font-normal text-text-3">equipo{t.equipos !== 1 ? 's' : ''}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Bloque>
        )}

        {/* Expositores top */}
        {data.ranking.length > 0 && (
          <Bloque titulo="Expositores más activos">
            <ul className="divide-y divide-border">
              {data.ranking.slice(0, 8).map((e, i) => (
                <li key={e.expositor_id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-6 text-text-3">{i + 1}.</span>
                  <span className="flex-1 text-text-1 truncate">{e.nombre}{e.stand ? ` · ${e.stand}` : ''}</span>
                  <span className="text-text-3 text-xs">{e.interacciones} interacc.</span>
                  <span className="text-text-1 font-semibold tabular-nums w-16 text-right">{e.puntos}</span>
                </li>
              ))}
            </ul>
          </Bloque>
        )}

        {/* Operación */}
        <Bloque titulo="Operación">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Dato k="Tareas completadas" v={`${tareasHechas} / ${data.tareas.length}`} />
            <Dato k="Vacantes publicadas" v={data.vacantes.length} />
          </div>
        </Bloque>

        <p className="text-[11px] text-text-3 pt-2">GESTEK · reporte de {evento.titulo}</p>
      </div>
    </div>
  );
}

function Bloque({ titulo, children }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-4">
      <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold mb-2">{titulo}</p>
      {children}
    </div>
  );
}
function Dato({ k, v }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-text-3">{k}</span>
      <span className="text-text-1 font-semibold tabular-nums">{v}</span>
    </div>
  );
}
