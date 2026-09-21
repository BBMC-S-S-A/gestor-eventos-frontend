import { useEffect, useMemo, useState } from 'react';
import { clientesApi } from '../../../../api/clientes.js';
import { useToast } from '../../../../context/ToastContext.jsx';
import GLoader from '../../../../components/ui/GLoader.jsx';
import { exportar } from '../../../../lib/hojaEscribir.js';
import { normalizarBoletas, resumenPorDia, MIN_EN_PUERTA_MS } from '../../../../lib/ingresosPorHora.js';

/* Asistentes · Ingresos por hora — a qué hora llegó la gente, y por qué se hizo
 * la cola.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────
 *
 * «Aforo por zonas» ya contaba esto para las ZONAS de dentro: curva por
 * franjas, pico con su hora, estancia media. La puerta del evento —el sitio
 * donde de verdad se forma la fila— no tenía nada: un número acumulado, el de
 * «Asistieron», que a las once de la mañana dice lo mismo tanto si entraron
 * todos de golpe como si fueron goteando.
 *
 * Y el número acumulado no sirve para lo único que importa después: preparar
 * el año que viene. Saber que entraron 3.334 personas no dice cuánta gente
 * poner en la puerta; saber que el primer día a las 09:35 entraron 67 en cinco
 * minutos, sí.
 *
 * ── De dónde salen los datos ──────────────────────────────────────────────
 *
 * De la lista de boletas, que ya se sirve entera y ya trae las tres horas que
 * hacen falta. NO hace falta endpoint nuevo:
 *
 *   `created_at`        · cuándo se registró
 *   `checked_in_at`     · su ÚLTIMO paso por la puerta
 *   `primer_ingreso_at` · el primero, si volvió otro día
 *
 * Son ~25 peticiones para un evento de 4.500 boletas, las mismas que ya hace
 * «Exportar Excel». Se paga una vez al abrir y a cambio el informe entero se
 * recalcula al instante cuando se cambia la franja, sin volver a preguntar.
 *
 * ── La pregunta que contesta, y que no es «cuántos entraron» ──────────────
 *
 * Es «por qué se hizo la cola». Un escaneo de QR son tres segundos; rellenar
 * el formulario de pie en la entrada son dos o tres minutos. Así que lo que
 * atasca una puerta no es el ritmo de llegada: es qué PARTE de esa llegada
 * viene sin registrar. Por eso la columna «en la puerta» —los que se
 * registraron a menos de quince minutos de entrar— va al lado del pico y no
 * escondida en otra pantalla. En FESTECH IBAGUÉ fue el 52% del primer día: más
 * de la mitad de la fila se estaba inscribiendo EN la fila.
 *
 * ── Una sola puerta, a propósito ──────────────────────────────────────────
 *
 * No se desglosa por acceso. En el evento para el que se hizo esto el 95% de
 * los ingresos tienen la puerta en blanco —el operador nunca la elegía en el
 * escáner, porque es opcional—, así que un desglose por puerta habría sido una
 * tabla con una fila gigante de «(sin puerta)» y tres migajas. Cuando el
 * escáner obligue a elegir puerta, esto se parte por `acceso` y ya está: el
 * dato viaja en cada boleta desde antes.
 */

const FRANJAS = [5, 10, 15, 30, 60];

const HORA = (d) => d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
const DIA  = (d) => d.toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: 'short' });
const pct  = (a, b) => (b > 0 ? Math.round(1000 * a / b) / 10 : 0);

export default function IngresosPorHoraSection({ evento }) {
  const { error } = useToast();
  const [filas, setFilas]   = useState(null);
  const [total, setTotal]   = useState(0);
  const [franja, setFranja] = useState(15);
  /* Lo que NO entró, en las mismas franjas. Se pide aparte y se vuelve a pedir
     al cambiar la franja: es una respuesta pequeña —un número por franja— y
     así los cubos los calcula el servidor con el mismo `floor(t/ms)*ms` que
     aquí, que es lo que hace que las dos curvas encajen exactamente. */
  const [rechazos, setRechazos] = useState(null);

  useEffect(() => {
    let vivo = true;
    clientesApi.listarTodos(evento.id)
      .then(d => {
        if (!vivo) return;
        setFilas(normalizarBoletas(d.clientes || []));
        setTotal(d.total ?? (d.clientes || []).length);
      })
      .catch(e => { if (vivo) { setFilas([]); error(e.response?.data?.error || e.message); } });
    return () => { vivo = false; };
    /* eslint-disable-next-line */
  }, [evento.id]);

  useEffect(() => {
    let vivo = true;
    clientesApi.rechazosPuerta(evento.id, { intervalo: franja })
      .then(d => { if (vivo) setRechazos(d); })
      /* Sin rechazos el informe sigue siendo el informe: esto se suma encima,
         no lo sostiene. Un backend sin la ruta todavía no puede dejar la
         pantalla en blanco. */
      .catch(() => { if (vivo) setRechazos(null); });
    return () => { vivo = false; };
  }, [evento.id, franja]);

  /* El informe entero, por día. Se recalcula sólo al cambiar la franja. El
     cálculo vive en `lib/ingresosPorHora.js` porque el reporte imprimible usa
     el mismo: dos copias serían dos informes que pueden discrepar. */
  const dias = useMemo(() => resumenPorDia(filas, franja), [filas, franja]);

  /* Los rechazos, agrupados por día y por franja, listos para que cada día
     encuentre los suyos sin recorrer la lista entera. */
  const rechPorDia = useMemo(() => {
    const m = new Map();
    for (const p of rechazos?.curva || []) {
      const at = new Date(p.at);
      if (Number.isNaN(at.getTime())) continue;
      const clave = at.toDateString();
      if (!m.has(clave)) m.set(clave, new Map());
      m.get(clave).set(at.getTime(), p.n);
    }
    return m;
  }, [rechazos]);

  const tot = useMemo(() => dias.reduce((a, d) => ({
    ingresos  : a.ingresos + d.ingresos,
    enPuerta  : a.enPuerta + d.enPuerta,
    reingresos: a.reingresos + d.reingresos,
  }), { ingresos: 0, enPuerta: 0, reingresos: 0 }), [dias]);

  const descargar = async () => {
    const f = [
      ['Ingresos por hora', evento.titulo || ''],
      ['Generado', new Date().toLocaleString('es-CO')],
      ['Franja', `${franja} min`],
      ['Puerta', 'Entrada Principal'],
      [],
      ['Día', 'Ingresos', 'Primera entrada', 'Última entrada', 'Pico', 'Hora del pico', 'Por minuto en el pico', 'Se registraron en la puerta', '% en la puerta', 'Reingresos'],
      ...dias.map(d => [
        DIA(d.fecha), d.ingresos, d.primera ? HORA(d.primera) : '', d.ultima ? HORA(d.ultima) : '',
        d.pico?.n ?? '', d.pico ? HORA(d.pico.at) : '', d.porMin,
        d.enPuerta, d.pctEnPuerta, d.reingresos,
      ]),
      [],
      [`Curva de ingresos (franjas de ${franja} min)`],
      ['Día', 'Franja', 'Ingresos'],
      ...dias.flatMap(d => d.curva.map(p => [DIA(d.fecha), HORA(p.at), p.n])),
    ];
    try {
      await exportar(f, { titulo: 'Ingresos por hora', base: `ingresos-hora-${evento.titulo || 'evento'}` });
    } catch (e) { error(e.message); }
  };

  if (!filas) return <GLoader message="Recorriendo las boletas…" />;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold font-display text-text-1 tracking-tight">Ingresos por hora</h2>
          <p className="text-sm text-text-2 mt-1">
            A qué hora llegó la gente por la Entrada Principal, y cuánta de esa fila venía sin registrar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-3">Franja</label>
          <select value={franja} onChange={e => setFranja(Number(e.target.value))} className="input !h-8 !py-1 text-sm w-auto">
            {FRANJAS.map(n => <option key={n} value={n}>{n} min</option>)}
          </select>
          <button onClick={descargar} disabled={dias.length === 0} className="btn-secondary btn-sm">Descargar</button>
        </div>
      </div>

      {dias.length === 0 ? (
        <p className="text-sm text-text-3">Todavía no ha entrado nadie: cuando la puerta empiece a escanear, el informe se arma solo.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Caja label="Entradas registradas" valor={tot.ingresos.toLocaleString('es-CO')}
              nota={`${total.toLocaleString('es-CO')} boletas emitidas`} />
            <Caja label="Personas distintas" valor={filas.length.toLocaleString('es-CO')}
              nota={`${pct(filas.length, total)}% de las boletas`} />
            <Caja label="Se registraron en la puerta" valor={`${pct(tot.enPuerta, filas.length)}%`}
              nota={`${tot.enPuerta.toLocaleString('es-CO')} personas`}
              tono={pct(tot.enPuerta, filas.length) >= 35 ? 'alerta' : null} />
            {rechazos?.total > 0 ? (
              /* Cuando hay rechazos ocupan la cuarta caja: son la parte de la
                 fila que este informe no contaba y la que explica por qué se
                 tardaba más de lo que dicen las entradas. Los reingresos
                 siguen a la vista en la línea de cada día. */
              <Caja label="No entraron al primer intento" valor={rechazos.total.toLocaleString('es-CO')}
                nota={`1 de cada ${Math.max(1, Math.round(tot.ingresos / rechazos.total))} escaneos`}
                tono="alerta" />
            ) : (
              <Caja label="Reingresos" valor={tot.reingresos.toLocaleString('es-CO')}
                nota="volvieron otro día" />
            )}
          </div>

          {dias.map(d => (
            <DiaBloque key={d.fecha.toDateString()} d={d} franja={franja}
              rechazos={rechPorDia.get(d.fecha.toDateString()) || null} />
          ))}

          {/* El aviso que evita leer de más. Sin esto, el 46% de «en la puerta»
              se lee como si fuera exacto, y no lo es: es lo que se puede
              deducir de dos horas guardadas. */}
          <p className="text-xs text-text-3 leading-relaxed">
            «En la puerta» son las personas que se registraron menos de {MIN_EN_PUERTA_MS / 60000} minutos antes de
            entrar. Es una estimación a partir de la hora de registro y la de ingreso, no una medición de la cola.
            Los reingresos sólo se ven si la persona volvió a pasar la escarapela: a quien el staff dejó entrar sin
            escanear, aquí no aparece.
          </p>
        </>
      )}
    </div>
  );
}

function Caja({ label, valor, nota, tono }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/40 px-4 py-3">
      <p className={`text-2xl font-bold font-display tabular-nums leading-none ${tono === 'alerta' ? 'text-warning' : 'text-text-1'}`}>{valor}</p>
      {nota && <p className="text-[11px] text-text-3 mt-0.5">{nota}</p>}
      <p className="text-[11px] text-text-3 mt-1 uppercase tracking-wide">{label}</p>
    </div>
  );
}

function DiaBloque({ d, franja, rechazos }) {
  const max = d.curva.reduce((m, p) => Math.max(m, p.n), 0) || 1;
  /* El total del día y su máximo por franja, de una pasada. Estaban los dos
     dentro del bucle de las barras, que es recorrer el mapa entero cien
     veces para pintar cien columnas. */
  const [rechDelDia, maxRech] = rechazos
    ? [...rechazos.values()].reduce(([suma, mx], n) => [suma + n, Math.max(mx, n)], [0, 0])
    : [0, 0];
  return (
    <div className="card">
      <div className="card-header flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base font-semibold text-text-1 capitalize">{DIA(d.fecha)}</h3>
          <p className="text-xs text-text-3">
            {d.ingresos.toLocaleString('es-CO')} entradas · de {HORA(d.primera)} a {HORA(d.ultima)}
            {d.reingresos > 0 && ` · ${d.reingresos} reingresos`}
            {rechDelDia > 0 && <> · <span className="text-warning">{rechDelDia} rechazos</span></>}
          </p>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <p className="text-lg font-bold font-display text-text-1 tabular-nums leading-none">{d.pico?.n ?? 0}</p>
            <p className="text-[11px] text-text-3">pico a las {d.pico ? HORA(d.pico.at) : '—'} · {d.porMin}/min</p>
          </div>
          <div>
            <p className={`text-lg font-bold font-display tabular-nums leading-none ${d.pctEnPuerta >= 35 ? 'text-warning' : 'text-text-1'}`}>
              {d.pctEnPuerta}%
            </p>
            <p className="text-[11px] text-text-3">se registró en la puerta</p>
          </div>
        </div>
      </div>
      <div className="card-body">
        {/* Barras en HTML y no en SVG: son cien cajas con una altura, el
            navegador ya sabe ponerlas en fila, y así heredan el tema sin tener
            que repetir los colores en dos sitios. */}
        <div className="flex items-end gap-px h-40 overflow-x-auto pb-1">
          {d.curva.map(p => (
            <div key={p.at.getTime()}
              className="flex-1 min-w-[3px] rounded-t bg-primary/70 hover:bg-primary transition-colors"
              style={{ height: `${Math.max(2, 100 * p.n / max)}%` }}
              title={`${HORA(p.at)} — ${p.n} ${p.n === 1 ? 'entrada' : 'entradas'} (${Math.round(10 * p.n / franja) / 10}/min)`}
            />
          ))}
        </div>
        {/* Los rechazos, pegados debajo y en las mismas columnas.
            Debajo y no mezclados con las entradas a propósito: son otra cosa
            —gente que NO pasó— y apilarlos encima haría leer una barra alta
            como si hubiera entrado más gente, que es justo al revés.
            La escala es la suya, no la de las entradas: lo que se quiere ver
            es DÓNDE se concentraron, y contra un pico de 400 entradas nueve
            rechazos serían un píxel. */}
        {rechDelDia > 0 && (
          <div className="flex items-start gap-px h-8 overflow-x-auto mt-0.5"
            role="img" aria-label={`${rechDelDia} rechazos de la puerta, por franja`}>
            {d.curva.map(p => {
              const n = rechazos.get(p.at.getTime()) || 0;
              return (
                <div key={p.at.getTime()}
                  className={`flex-1 min-w-[3px] rounded-b ${n ? 'bg-warning/70' : ''}`}
                  style={{ height: n ? `${Math.max(12, 100 * n / (maxRech || 1))}%` : '0' }}
                  title={n ? `${HORA(p.at)} — ${n} ${n === 1 ? 'rechazo' : 'rechazos'}` : undefined}
                />
              );
            })}
          </div>
        )}
        <div className="flex justify-between text-[11px] text-text-3 mt-1.5">
          <span>{HORA(d.primera)}</span>
          <span>{HORA(d.ultima)}</span>
        </div>
      </div>
    </div>
  );
}
