import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { clientesApi } from '../../../../api/clientes.js';
import { eventosApi } from '../../../../api/eventos.js';
import { agendaApi } from '../../../../api/agenda.js';
import { networkingApi } from '../../../../api/networking.js';
import { useToast } from '../../../../context/ToastContext.jsx';
import { confirmDialog } from '../../../../components/ui/Confirm.jsx';
import GLoader from '../../../../components/ui/GLoader.jsx';
import { useSondeo } from '../../../../hooks/useSondeo.js';
import { zonasDelEvento, TIPOS_ZONA, TIPO_ZONA_DEFECTO } from '../../../../lib/zonas.js';
import BarraProgreso from '../../../../components/ui/BarraProgreso.jsx';
import { numeroDeStand } from '../../../../lib/expositoresUi.js';
import {
  nivelDeZona, estaEnLlamas, IconoLlama, DetalleMarcador,
} from '../../../../components/aforo/MapaAforo.jsx';

/* Espacio del evento · Zonas de interés — la zona, entera, en un sitio.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────
 *
 * Una zona era lo único del evento que salía en cuatro pantallas y no se podía
 * mirar en ninguna. Se creaba en «Accesos e ingresos», se colocaba en «Mapa
 * del evento», se operaba en «Aforo por zonas», y para saber qué ocurría
 * dentro había que ir al Calendario; para saber qué stands había, a Stands.
 *
 * Peor que estar repartido: **todas sus relaciones se establecían desde el
 * otro lado**. Un sub-evento elegía su zona; un stand elegía su zona. Se podía
 * decir «esta charla es en la Zona Gamer», pero estando en la Zona Gamer no se
 * podía preguntar qué pasa aquí.
 *
 * Esta pantalla contesta eso. Empieza siendo de sólo lectura a propósito: lo
 * primero que hacía falta no era otro formulario, era un sitio donde ver la
 * zona completa. La administración se muda aquí en la fase siguiente.
 *
 * ── Lo que NO hace, y por qué ─────────────────────────────────────────────
 *
 * No dibuja el plano y no repinta el histórico. Las dos cosas ya existen —el
 * mapa en «Mapa del evento», la curva y la estancia media en el Reporte de
 * «Aforo por zonas»— y copiarlas aquí habría sido exactamente el problema que
 * esta pantalla viene a resolver. Enlaza a las dos.
 *
 * Todo lo vivo sale de UNA petición, `mapa/vivo`, que ya devolvía zonas con
 * ocupación, agenda y stands en una sola llamada y hasta ahora sólo consumía
 * el tablero de aforo. La ficha de la derecha es literalmente el mismo
 * `DetalleMarcador` de ese tablero: si allí se ve bien, aquí también.
 *
 * ── Quién puede editar ────────────────────────────────────────────────────
 *
 * La pestaña se abre con permiso de `checkin`, porque mirar la zona es parte
 * de trabajar el evento. Pero las tres cosas que se pueden CAMBIAR desde aquí
 * viven en tres tablas distintas, y el backend pide un permiso distinto para
 * cada una:
 *
 *   la zona en sí → `page_json.zonas`         → `gestionar_zonas` | `editar_pagina_publica` | `editar_evento`
 *   la actividad  → `agenda_sessions.zona_id` → `gestionar_agenda` | `editar_evento`
 *   el stand      → `networking_expositores`  → `gestionar_expositores` | `editar_evento`
 *
 * (el owner puede las tres). Se comprueban por separado y no con una sola
 * bandera, por dos razones: enseñar un botón que devuelve 403 es peor que no
 * enseñarlo, y juntarlas obligaría a exigir el permiso más alto de los tres
 * para hacer lo más barato.
 */

const puedeCon = (soyOwner, permisos, lista) =>
  Boolean(soyOwner) || lista.some(p => (permisos || []).includes(p));

function uid() { return 'zona_' + Math.random().toString(36).slice(2, 9); }

/* Con una clave de React estable, para que editar el nombre de una fila no
   remonte el input en cada tecla. Las zonas nuevas todavía no tienen nada que
   las distinga salvo su id generado en cliente. */
const zonasConClave = (evento) => zonasDelEvento(evento).map(z => ({ ...z, _k: z.id }));

/* El mismo recorte que se manda al servidor. Sirve para comparar y saber si
   una fila tiene cambios sin guardar: sin esto, un espacio de más en el
   nombre marcaría «sin guardar» para siempre. */
const limpiar = (l) => (l || []).map(({ id, nombre, aforo_max, tipo }) =>
  ({ id, nombre: (nombre || '').trim(), aforo_max: Number(aforo_max) || null,
     tipo: TIPOS_ZONA.some(t => t.id === tipo) ? tipo : TIPO_ZONA_DEFECTO }));

/* Una zona configurada de la que el endpoint en vivo todavía no sabe nada
   —recién creada, o sin un solo movimiento— sale en ceros en vez de
   desaparecer de la lista. */
const VACIA = { dentro: 0, entradas: 0, salidas: 0, excedido: 0, agenda: [], ahora: [], siguiente: null, stands: [] };

export default function ZonasSection({ evento, soyOwner = false, permisos, reload }) {
  const puedeEditar = puedeCon(soyOwner, permisos, ['gestionar_zonas', 'editar_pagina_publica', 'editar_evento']);
  const puedeAgenda = puedeCon(soyOwner, permisos, ['gestionar_agenda', 'editar_evento']);
  const puedeStands = puedeCon(soyOwner, permisos, ['gestionar_expositores', 'editar_evento']);

  const { success, error } = useToast();
  const [zonas, setZonas] = useState(null);
  const [puertas, setPuertas] = useState([]);
  const [sel, setSel] = useState(null);
  const [ultimo, setUltimo] = useState(null);
  const [fallo, setFallo] = useState('');
  const vivoRef = useRef(true);

  useEffect(() => () => { vivoRef.current = false; }, []);

  /* Las zonas CONFIGURADAS, que es la lista de verdad: `mapa/vivo` sólo trae
     las que tienen movimiento, así que una zona recién creada no aparecería y
     parecería que no existe.
     Es estado y no un `useMemo` porque aquí se editan: la lista local es la
     que manda desde el primer cambio hasta que el evento se recargue. */
  const [configuradas, setConfiguradas] = useState(() => zonasConClave(evento));
  const [guardadas, setGuardadas] = useState(() => limpiar(zonasConClave(evento)));
  const [guardando, setGuardando] = useState(false);

  /* Qué zonas están puestas en el plano. Es un dato del `page_json`, no del
     endpoint: se lee aquí para poder avisar de las que faltan por colocar. */
  const enElPlano = useMemo(() => new Set(
    (evento.page_json?.mapa?.marcadores || [])
      .filter(m => m?.tipo === 'zona' && m.zona_id)
      .map(m => m.zona_id),
  ), [evento.page_json]);

  const cargar = useCallback(async () => {
    try {
      const d = await clientesApi.mapaVivo(evento.id);
      if (!vivoRef.current) return;
      setZonas(d.zonas || []);
      setPuertas(d.accesos || []);
      setUltimo(d.at || new Date().toISOString());
      setFallo('');
    } catch (e) {
      if (!vivoRef.current) return;
      /* Un fallo de red no vacía la pantalla: si ya había datos se quedan y se
         avisa. Volver a «Cargando…» en cada hipo de la conexión hace que el
         tablero parezca roto cuando sólo está viejo. */
      setFallo(e.response?.data?.error || e.message);
      setZonas(z => z ?? []);
    }
  }, [evento.id]);

  useEffect(() => { cargar(); }, [cargar]);
  useSondeo(cargar, 15000);

  /* ── Editar ────────────────────────────────────────────────────────────
     El PATCH mezcla `page_json` por clave desde la 0064, así que mandar sólo
     `zonas` no toca las puertas ni el mapa. `lista` opcional es para poder
     guardar de inmediato la lista recién recortada al borrar una fila, antes
     de que el estado de React se haya actualizado. */
  const editar = (k, patch) => setConfiguradas(l => l.map(z => z._k === k ? { ...z, ...patch } : z));

  const guardar = useCallback(async (lista) => {
    const l = lista || configuradas;
    for (const z of l) if (!String(z.nombre || '').trim()) { error('Cada zona necesita un nombre.'); return false; }
    setGuardando(true);
    try {
      const limpio = limpiar(l);
      await eventosApi.update(evento.id, { page_json: { zonas: limpio } });
      setGuardadas(limpio);
      success('Zonas guardadas.');
      /* Que el resto del workspace vea las zonas nuevas: el selector de zona
         del Calendario y el de Stands leen `evento.page_json`, no esta lista. */
      reload?.();
      return true;
    } catch (e) {
      error(e.response?.data?.error || e.message);
      return false;
    } finally { setGuardando(false); }
  }, [configuradas, evento.id, error, success, reload]);

  const agregar = () => setConfiguradas(l => [...l, { _k: uid(), id: uid(), nombre: '', aforo_max: '', tipo: TIPO_ZONA_DEFECTO }]);

  const borrar = async (z) => {
    /* Se pregunta, y no por costumbre: una zona borrada se lleva por delante
       la referencia de los sub-eventos y los stands que apuntaban a ella. */
    const enPlano = enElPlano.has(z.id);
    const vivo = (zonas || []).find(x => x.id === z.id);
    const avisos = [
      vivo?.dentro > 0 ? `Ahora mismo hay ${vivo.dentro} personas dentro.` : null,
      (vivo?.agenda || []).length ? `${vivo.agenda.length} actividad(es) quedan sin zona.` : null,
      (vivo?.stands || []).length ? `${vivo.stands.length} stand(s) quedan sin ubicar.` : null,
      enPlano ? 'Su marcador quedará huérfano en el plano.' : null,
    ].filter(Boolean);

    const ok = await confirmDialog({
      title: `¿Borrar «${String(z.nombre || '').trim() || 'esta zona'}»?`,
      message: avisos.length
        ? `${avisos.join(' ')} El histórico de aforo no se borra.`
        : 'El histórico de aforo no se borra.',
      confirmLabel: 'Borrar zona',
      danger: true,
    });
    if (!ok) return;

    const lista = configuradas.filter(x => x._k !== z._k);
    setConfiguradas(lista);
    if (sel === z.id) setSel(null);
    await guardar(lista);   // borrar persiste al momento, no espera al botón
  };

  const sucio = JSON.stringify(limpiar(configuradas)) !== JSON.stringify(guardadas);

  /* ── Colgar cosas de la zona (fase 3) ──────────────────────────────────
     Las listas completas de actividades y de stands, que `mapa/vivo` no trae:
     de la agenda sólo devuelve lo que está puesto en el plano, y de los stands
     sólo los que YA tienen zona. Para poder asignar hace falta ver también lo
     que todavía no está en ninguna parte.

     Se piden una sola vez y sólo si se puede asignar algo: a quien no tiene el
     permiso no se le gasta la petición. */
  const [agendaTodo, setAgendaTodo] = useState(null);
  const [standsTodo, setStandsTodo] = useState(null);
  const [asignando, setAsignando] = useState(false);

  const cargarAsignables = useCallback(async () => {
    const [ag, st] = await Promise.all([
      puedeAgenda ? agendaApi.sessions(evento.id).catch(() => null) : Promise.resolve(null),
      /* Sólo los que de verdad tienen mesa/stand (rol 'comprador'): un
         'vendedor' no tiene stand propio que colgar de una zona. */
      puedeStands ? networkingApi.expositoresAdmin(evento.id, true).catch(() => null) : Promise.resolve(null),
    ]);
    if (!vivoRef.current) return;
    if (ag) setAgendaTodo(ag.sessions || []);
    if (st) setStandsTodo(st.expositores || []);
  }, [evento.id, puedeAgenda, puedeStands]);

  useEffect(() => { cargarAsignables(); }, [cargarAsignables]);

  /* Asignar y desasignar son la MISMA operación con distinto valor, así que es
     una sola función: `zonaId` a null desasigna. Van de a una petición por
     ítem —los endpoints de agenda y de stands ya aceptan `zona_id` en su
     PATCH— y no hay endpoint en lote porque para un puñado de ítems no hace
     falta uno; si algún día se asignan cincuenta de golpe, ahí sí. */
  const mover = async (que, id, zonaId) => {
    setAsignando(true);
    try {
      if (que === 'agenda') await agendaApi.editarSession(evento.id, id, { zona_id: zonaId });
      else await networkingApi.editarStand(evento.id, id, { zona_id: zonaId });
      success(zonaId ? 'Movido a la zona.' : 'Quitado de la zona.');
      /* Dos refrescos y los dos hacen falta: `cargar` trae la zona con su
         contenido nuevo, `cargarAsignables` actualiza qué queda por asignar. */
      await Promise.all([cargar(), cargarAsignables()]);
    } catch (e) {
      error(e.response?.data?.error || e.message);
    } finally { setAsignando(false); }
  };

  /* Cada zona configurada con lo que se sepa de ella en vivo. La configurada
     manda: si el endpoint no la trae todavía, sale en ceros en vez de
     desaparecer. */
  const filas = useMemo(() => {
    const vivo = new Map((zonas || []).map(z => [z.id, z]));
    return configuradas.map(c => ({
      ...VACIA,
      ...(vivo.get(c.id) || {}),
      /* La configuración manda sobre lo que devolvió el endpoint: si alguien
         acaba de renombrar la zona, el nombre nuevo se ve sin esperar al
         siguiente sondeo. */
      id: c.id,
      _k: c._k,
      nombre: c.nombre,
      tipo: c.tipo || TIPO_ZONA_DEFECTO,
      aforo_max: c.aforo_max === '' || c.aforo_max == null ? null : Number(c.aforo_max),
      _enPlano: enElPlano.has(c.id),
    }));
  }, [configuradas, zonas, enElPlano]);

  /* Las puertas que dan a cada zona (`page_json.accesos[].zona_id`).
     Se leen de la configuración y no de `mapa/vivo`, porque ese endpoint sólo
     devuelve las puertas COLOCADAS en el plano —para dibujarlas— y una puerta
     sin marcador sigue siendo la puerta por la que se entra. El conteo de
     ingresos, cuando lo hay, se pega desde lo vivo. */
  const puertasPorZona = useMemo(() => {
    const vivas = new Map((puertas || []).map(p => [p.id, p]));
    const m = {};
    for (const a of (evento.page_json?.accesos || [])) {
      if (!a?.id || !a.zona_id) continue;
      (m[a.zona_id] ||= []).push({ ...a, ingresos: vivas.get(a.id)?.ingresos ?? null });
    }
    return m;
  }, [evento.page_json, puertas]);

  const seleccionada = filas.find(z => z.id === sel) || null;
  /* `DetalleMarcador` lee de `datos.zonas`, así que se le pasa la fila ya
     mezclada — es la que tiene el nombre y el aforo al día. */
  const datosDetalle = useMemo(() => ({ zonas: filas }), [filas]);

  const sinColocar = filas.filter(z => !z._enPlano).length;

  /* El aforo del recinto contra lo repartido entre las zonas.

     Nadie comparába los dos: se podían declarar zonas que sumaran 3.000 en un
     recinto de 1.500 y nada avisaba. Es el mismo patrón que la bolsa de puntos
     —un total, un reparto, y lo que queda sin repartir— y se copia la forma a
     propósito para que las dos pantallas se lean igual.

     Diferencia con la bolsa: aquí **no se bloquea**. Una zona sin `aforo_max`
     es «sin límite» y no cero, así que la suma nunca es una cuenta cerrada; y
     el aforo del evento avisa, no impide entrar. Lo que hacía falta era verlo.
     Sin `aforo_total` no hay nada que comparar y no se enseña la barra: un
     porcentaje sobre un total desconocido es peor que ningún dato. */
  const aforoRecinto = Number(evento.aforo_total) || 0;
  /* Una salida de emergencia no aporta aforo: no se llena, se vacía por ella.
     Sumarla diría que caben más personas por tener más salidas. */
  const conTope = filas.filter(z => z.aforo_max > 0 && z.tipo !== 'evacuacion');
  const repartido = conTope.reduce((a, z) => a + z.aforo_max, 0);
  const sinTope = filas.length - conTope.length;
  const pasado = aforoRecinto > 0 && repartido > aforoRecinto;

  if (zonas === null) return <GLoader message="Cargando zonas…" />;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold font-display text-text-1 tracking-tight">Zonas de interés</h2>
          <p className="text-sm text-text-2 mt-1">
            {puedeEditar
              ? 'Aquí se crean las zonas del recinto, y aquí se ve cada una con su aforo en vivo, lo que ocurre dentro y los stands montados.'
              : 'Cada zona con su aforo en vivo, lo que ocurre dentro y los stands que hay montados.'}
          </p>
          {puedeEditar && (
            <p className="text-xs text-text-3 mt-1">
              El aforo máximo avisa, no bloquea: si una zona se pasa, la gente sigue entrando y queda
              registrado el excedente.
            </p>
          )}
        </div>
        {ultimo && (
          <p className="text-[11px] text-text-3">
            Al día de {new Date(ultimo).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            {fallo ? ' · sin conexión, mostrando lo último' : ''}
          </p>
        )}
      </div>

      {aforoRecinto > 0 && configuradas.length > 0 && (
        <div className="card"><div className="card-body space-y-2">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <p className="text-sm text-text-1">
              Aforo del recinto: <b className="tabular-nums">{aforoRecinto.toLocaleString('es-CO')}</b>
            </p>
            <p className="text-xs text-text-3 tabular-nums">
              {repartido.toLocaleString('es-CO')} repartidos entre {conTope.length} zona{conTope.length !== 1 ? 's' : ''}
              {aforoRecinto > repartido && ` · ${(aforoRecinto - repartido).toLocaleString('es-CO')} sin repartir`}
            </p>
          </div>
          <BarraProgreso pct={Math.round((repartido / aforoRecinto) * 100)} color={pasado ? 'bg-warning' : 'bg-text-1'} />
          {pasado && (
            <p className="text-xs text-warning-light">
              Las zonas suman {(repartido - aforoRecinto).toLocaleString('es-CO')} más de lo que cabe en el recinto.
              No bloquea nada —el aforo avisa, no cierra la puerta— pero es una de las dos cifras que está mal.
            </p>
          )}
          {sinTope > 0 && (
            <p className="text-[11px] text-text-3">
              {sinTope === 1 ? 'Una zona no tiene' : `${sinTope} zonas no tienen`} aforo máximo: cuentan como
              sin límite y no suman aquí.
            </p>
          )}
        </div></div>
      )}

      {configuradas.length === 0 ? (
        <div className="card"><div className="card-body text-center py-10">
          <p className="text-sm text-text-2">Todavía no hay zonas.</p>
          <p className="text-xs text-text-3 mt-1.5 max-w-md mx-auto">
            Una zona es un espacio del recinto —una tarima, la zona VIP, el patio de comidas— con
            su aforo. Después se le cuelgan las actividades y los stands que ocurren ahí.
          </p>
          {puedeEditar
            ? <button onClick={agregar} className="btn-primary btn-sm mt-4">+ Crear la primera zona</button>
            : <p className="text-[11px] text-text-3 mt-3">Las crea quien administra el evento.</p>}
        </div></div>
      ) : (
        /* Una sola columna, y la ficha DEBAJO de su zona.

           Antes esto era una rejilla con la lista a la izquierda y una columna
           de 380 px a la derecha. Dos problemas a la vez: la lista —que es
           donde se escribe el nombre y el aforo— trabajaba en dos tercios de
           pantalla, y la ficha metía cinco bloques en una tira estrecha donde
           todo salía a una línea por renglón.

           Ahora la lista ocupa el ancho entero SIEMPRE, y al abrir una zona su
           ficha aparece justo debajo, también al ancho entero y repartida en
           columnas. Es la misma información con sitio para respirar, y además
           queda pegada a la zona de la que habla —que en una lista de diez es
           la diferencia entre saber de cuál estabas mirando y no saberlo. */
        <div className="space-y-4">
          <div className="space-y-2">
            {filas.map(z => (
              <div key={z._k} className="space-y-2">
                <FilaZona z={z} activa={z.id === sel}
                  editable={puedeEditar}
                  onSelect={() => setSel(z.id === sel ? null : z.id)}
                  onEditar={(patch) => editar(z._k, patch)}
                  onBorrar={() => borrar(z)} />

                {z.id === sel && seleccionada && (
                  <div className="rounded-2xl border border-primary-light/40 bg-surface-2/30 p-3
                                  grid gap-3 md:grid-cols-2 xl:grid-cols-3 items-start">
                    <DetalleMarcador sel={`zona:${seleccionada.id}`} datos={datosDetalle} />
                    <Puertas evento={evento} lista={puertasPorZona[seleccionada.id] || []} />
                    {puedeAgenda && (
                      <Colgar titulo="Actividades aquí" vacio="Ninguna actividad programada en esta zona."
                        ocupando={asignando}
                        dentro={(agendaTodo || []).filter(x => x.zona_id === seleccionada.id)}
                        fuera={(agendaTodo || []).filter(x => x.zona_id !== seleccionada.id)}
                        etiqueta={x => x.titulo || 'Sin título'}
                        nota={x => x.zona_id ? 'en otra zona' : null}
                        onMeter={id => mover('agenda', id, seleccionada.id)}
                        onSacar={id => mover('agenda', id, null)} />
                    )}
                    {puedeStands && (
                      <Colgar titulo="Stands aquí" vacio="Ningún stand montado en esta zona."
                        ocupando={asignando}
                        dentro={(standsTodo || []).filter(x => x.zona_id === seleccionada.id)}
                        fuera={(standsTodo || []).filter(x => x.zona_id !== seleccionada.id)}
                        etiqueta={x => `${x.nombre}${x.stand ? ` · ${numeroDeStand(x.stand)}` : ''}`}
                        nota={x => x.zona_id ? 'en otra zona' : null}
                        onMeter={id => mover('stands', id, seleccionada.id)}
                        onSacar={id => mover('stands', id, null)} />
                    )}
                    <Acciones evento={evento} z={seleccionada} puedeAgenda={puedeAgenda} puedeStands={puedeStands} />
                  </div>
                )}
              </div>
            ))}

            {puedeEditar && (
              <div className="flex items-center gap-2 pt-1">
                <button onClick={agregar} className="btn-ghost btn-sm">+ Añadir zona</button>
                {sucio && (
                  <button onClick={() => guardar()} disabled={guardando} className="btn-primary btn-sm">
                    {guardando ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                )}
              </div>
            )}

            {sinColocar > 0 && (
              <p className="text-[11px] text-text-3 px-1 pt-1">
                {sinColocar === 1 ? 'Una zona no está' : `${sinColocar} zonas no están`} en el plano: sin colocarlas
                no salen en el mapa ni en el tablero en vivo.{' '}
                <Link to={`/eventos/${evento.id}?s=zonas&t=mapa`} className="text-primary-light hover:underline">
                  Colocarlas →
                </Link>
              </p>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

/* Una fila de la lista. Lo que tiene que contestar de un golpe es «cuáles de
   mis zonas están vacías de contenido», que es lo que hoy no se puede ver sin
   recorrer tres pantallas: por eso los conteos de actividades y stands van
   aquí y no sólo en la ficha. */
function FilaZona({ z, activa, editable, onSelect, onEditar, onBorrar }) {
  const nivel = nivelDeZona(z);
  const enLlamas = estaEnLlamas(z);
  const pct = z.aforo_max ? Math.min(100, Math.round((z.dentro / z.aforo_max) * 100)) : null;
  const actividades = (z.agenda || []).length;
  const stands = (z.stands || []).length;
  const nueva = !String(z.nombre || '').trim();

  return (
    <div className={`rounded-2xl border p-3.5 transition-colors ${
      activa ? 'border-primary-light bg-surface-2/60' : 'border-border bg-surface/40'
    }`}>
      {/* Envuelve.
          Era una sola fila que no envolvía, con tres anchos fijos dentro
          —tipo 128 px, aforo 80, borrar 32, más los huecos: unos 260—. Las
          fichas van en una rejilla de hasta tres columnas, así que la ficha
          puede medir bastante menos que eso: el nombre se quedaba sin sitio y
          el resto se salía de la tarjeta. En la captura se veía el recuadro del
          aforo cortado por el borde, con «Aforc».

          Con `flex-wrap` y un mínimo para el nombre, en una ficha ancha se
          sigue viendo todo en una línea —como hasta ahora— y en una estrecha el
          tipo, el aforo y el borrar bajan a la segunda. Nada se sale nunca. */}
      <div className="flex flex-wrap items-center gap-2.5">
        {enLlamas
          ? <span className="text-orange-500 flex-shrink-0"><IconoLlama className="w-4 h-4" /></span>
          : <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: nivel.color }} />}

        {editable ? (
          <>
            <input value={z.nombre} onChange={e => onEditar({ nombre: e.target.value })}
              placeholder="Nombre de la zona" autoFocus={nueva}
              className="input !h-9 text-sm flex-1 min-w-[9rem]" />
            {/* El tipo va junto al nombre y no escondido en la ficha: es lo
                que decide si esto es una tarima o una salida de emergencia, y
                se elige al crearla o nunca. */}
            <select value={z.tipo || TIPO_ZONA_DEFECTO} onChange={e => onEditar({ tipo: e.target.value })}
              title={TIPOS_ZONA.find(t => t.id === (z.tipo || TIPO_ZONA_DEFECTO))?.ayuda}
              className="input !h-9 text-sm w-32 flex-shrink-0">
              {TIPOS_ZONA.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <input type="number" min="0" value={z.aforo_max ?? ''}
              onChange={e => onEditar({ aforo_max: e.target.value })}
              placeholder="Aforo" title="Aforo máximo (opcional)"
              aria-label="Aforo máximo de la zona"
              className="input !h-9 text-sm w-24 flex-shrink-0" />
            <button onClick={onBorrar} title="Borrar zona"
              className="w-8 h-8 rounded-lg text-danger-light hover:bg-danger/10 flex items-center justify-center flex-shrink-0">✕</button>
          </>
        ) : (
          <>
            <p className="font-medium text-text-1 flex-1 min-w-0 truncate">{z.nombre}</p>
            {/* El tipo se enseña también a quien no puede editar: saber cuál es
                la salida de emergencia no es una tarea de administración. El
                tipo por defecto no se marca —casi todas son del evento y
                etiquetarlas todas no distingue nada. */}
            {z.tipo && z.tipo !== TIPO_ZONA_DEFECTO && (
              <span className="text-[10px] uppercase tracking-widest text-text-3 flex-shrink-0">
                {TIPOS_ZONA.find(t => t.id === z.tipo)?.label}
              </span>
            )}
            <p className="text-sm font-bold font-display tabular-nums text-text-1 flex-shrink-0">
              {z.dentro}
              {z.aforo_max ? <span className="text-text-3 text-xs font-normal"> / {z.aforo_max}</span> : null}
            </p>
          </>
        )}
      </div>

      {/* Una zona recién añadida no tiene nada que enseñar todavía: ni aforo,
          ni actividades, ni sitio en el plano. Enseñarle «Sin actividades · no
          está en el plano» antes de que tenga nombre es regañar a alguien por
          no haber terminado de escribir. */}
      {!nueva && (
        <>
          {pct != null && (
            <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mt-2.5">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: enLlamas ? '#F97316' : nivel.color }} />
            </div>
          )}

          {/* El resumen a la izquierda, el enlace a la derecha, y cada uno en
              su caja.
              Antes eran todos hermanos de una misma fila que envuelve, con el
              enlace empujado por `ml-auto`. En cuanto el resumen no cabía en
              una línea —una zona con actividades, stands y aviso de plano, o
              sencillamente una pantalla estrecha— el enlace se iba solo a un
              renglón pegado a la derecha, y quedaba un hueco a media tarjeta.
              Así el enlace se queda arriba a la derecha y lo que envuelve es lo
              que tiene sentido que envuelva. */}
          <button onClick={onSelect}
            className="w-full text-left flex items-start justify-between gap-3 mt-2.5
                       text-[11px] text-text-3 hover:text-text-2 transition-colors">
            <span className="flex items-center gap-2 flex-wrap min-w-0">
              {editable && <span className="tabular-nums text-text-2">{z.dentro}{z.aforo_max ? ` / ${z.aforo_max}` : ''} dentro</span>}
              {editable && <span>·</span>}
              <span>{actividades === 0 ? 'Sin actividades' : `${actividades} ${actividades === 1 ? 'actividad' : 'actividades'}`}</span>
              <span>·</span>
              <span>{stands === 0 ? 'Sin stands' : `${stands} ${stands === 1 ? 'stand' : 'stands'}`}</span>
              {!z._enPlano && (<><span>·</span><span className="text-warning">No está en el plano</span></>)}
              {z.excedido > 0 && (<><span>·</span><span className="text-danger font-semibold">+{z.excedido} por encima</span></>)}
            </span>
            <span className="text-primary-light flex-shrink-0 whitespace-nowrap">{activa ? 'Ocultar' : 'Ver zona'} →</span>
          </button>
        </>
      )}
    </div>
  );
}

/* A dónde se va desde aquí.
 *
 * Son enlaces y no formularios a propósito: mientras la administración siga
 * viviendo en Accesos e ingresos, duplicarla aquí sería volver a tener dos
 * dueños del mismo dato — que es justo lo que se acaba de quitar del mapa. */
function Acciones({ evento, z, puedeAgenda, puedeStands }) {
  /* Dos bases y no una: al partir «Espacio del evento» en «Actividades»
     (qué pasa) y «Zonas» (dónde pasa), estos enlaces dejaron de vivir todos
     bajo la misma sección. */
  const enZonas = `/eventos/${evento.id}?s=zonas`;
  const enActividades = `/eventos/${evento.id}?s=actividades`;
  return (
    /* Plegado, y no por gusto: son hasta seis enlaces —media ficha— para lo
       que menos se hace desde aquí. Lo que se usa a diario es colgar una
       actividad o un stand, y eso está justo encima. */
    <details className="rounded-2xl border border-border bg-surface/40 px-3.5 py-2.5 group">
      <summary className="text-[11px] uppercase tracking-widest text-text-3 font-semibold cursor-pointer list-none flex items-center justify-between">
        Ir a
        <span className="text-text-3 group-open:rotate-180 transition-transform">⌄</span>
      </summary>
      <div className="space-y-2 pt-2">
      <Enlace to={`${enZonas}&t=mapa`} texto={z._enPlano ? 'Mover en el plano' : 'Colocar en el plano'} nota="Mapa del evento" />
      <Enlace to={`${enZonas}&t=aforo`} texto="Operar y tomar reporte" nota="Aforo por zonas" />
      {/* Asignar ya se hace arriba, desde la zona. Estos dos enlaces se quedan
          para lo que aquí NO se puede hacer: crear la actividad o el stand que
          todavía no existe. Sólo se ofrecen a quien no puede asignar desde
          aquí; a quien sí, serían dos caminos al mismo sitio. */}
      {!puedeAgenda && <Enlace to={`${enActividades}&t=calendario`} texto="Programar una actividad" nota="Calendario · campo «Zona del plano»" />}
      {!puedeStands && <Enlace to={`${enZonas}&t=stands`} texto="Montar un stand" nota="Stands · campo «Zona del plano»" />}
      <Enlace to={`${enActividades}&t=calendario`} texto="Crear una actividad nueva" nota="Calendario" />
      <Enlace to={`${enZonas}&t=accesos`} texto="Puertas del recinto" nota="Accesos e ingresos" />
      </div>
    </details>
  );
}

/* Por dónde se entra a esta zona.
 *
 * La relación puerta → zona no existía: `page_json.accesos` y
 * `page_json.zonas` eran dos listas sin un solo campo que las cruzara, así que
 * la pregunta de quien está delante del plano —«¿por dónde se entra a la
 * tarima?»— no tenía respuesta en ninguna pantalla.
 *
 * Se asigna desde la puerta (en «Accesos e ingresos») y no desde aquí, y esta
 * vez a propósito: una puerta da a UNA zona, así que su dueño natural es la
 * puerta. Lo que faltaba no era otro formulario, era poder leerlo desde este
 * lado. */
function Puertas({ evento, lista }) {
  if (lista.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface/40 p-3.5">
        <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold mb-1.5">Por dónde se entra</p>
        <p className="text-xs text-text-3">
          Ninguna puerta apunta a esta zona.{' '}
          <Link to={`/eventos/${evento.id}?s=zonas&t=accesos`} className="text-primary-light hover:underline">
            Asignarla en Accesos e ingresos →
          </Link>
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-3.5">
      <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold mb-1.5">Por dónde se entra</p>
      <ul className="space-y-1">
        {lista.map(p => (
          <li key={p.id} className="flex items-center gap-2 text-sm text-text-1">
            <span className="flex-1 min-w-0 truncate">{p.nombre}</span>
            {/* `null` no es 0: significa que esa puerta no está colocada en el
                plano, así que `mapa/vivo` no trae su conteo. Enseñar «0
                ingresos» ahí sería mentir. */}
            {p.ingresos != null && (
              <span className="text-[11px] text-text-3 tabular-nums flex-shrink-0">{p.ingresos} ingresos</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Colgar cosas de una zona, y descolgarlas.
 *
 * Es la mitad que faltaba: hasta ahora una actividad elegía su zona y un stand
 * elegía la suya, y desde la zona no se podía conectar nada. Los dos casos son
 * el mismo problema —una lista de lo que ya está y un desplegable con lo que
 * se puede añadir— así que es un solo componente y no dos parecidos.
 *
 * El desplegable dice «en otra zona» cuando corresponde, en vez de esconder
 * esos ítems: mover una charla de la Sala A a la Sala B es una cosa
 * perfectamente normal, y ocultarla obligaría a ir a buscarla al Calendario.
 */
function Colgar({ titulo, vacio, dentro, fuera, etiqueta, nota, onMeter, onSacar, ocupando }) {
  const [abierto, setAbierto] = useState('');

  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-3.5 space-y-2">
      <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">{titulo}</p>

      {dentro.length === 0
        ? <p className="text-xs text-text-3">{vacio}</p>
        : (
          <ul className="space-y-1">
            {dentro.map(it => (
              <li key={it.id} className="flex items-center gap-2 text-sm text-text-1">
                <span className="flex-1 min-w-0 truncate">{etiqueta(it)}</span>
                <button onClick={() => onSacar(it.id)} disabled={ocupando}
                  title="Quitar de esta zona"
                  className="text-[11px] text-text-3 hover:text-danger transition-colors flex-shrink-0 disabled:opacity-40">
                  quitar
                </button>
              </li>
            ))}
          </ul>
        )}

      {fuera.length > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <select value={abierto} onChange={e => setAbierto(e.target.value)}
            disabled={ocupando} className="input !h-9 text-sm flex-1 min-w-0">
            <option value="">Añadir…</option>
            {fuera.map(it => (
              <option key={it.id} value={it.id}>
                {etiqueta(it)}{nota(it) ? ` — ${nota(it)}` : ''}
              </option>
            ))}
          </select>
          <button
            onClick={async () => { const id = abierto; setAbierto(''); await onMeter(id); }}
            disabled={ocupando || !abierto}
            className="btn-secondary btn-sm flex-shrink-0">
            Añadir
          </button>
        </div>
      )}
    </div>
  );
}

function Enlace({ to, texto, nota }) {
  return (
    <Link to={to} className="block rounded-xl px-2.5 py-2 hover:bg-surface-2/60 transition-colors">
      <p className="text-sm text-text-1">{texto} <span className="text-text-3">→</span></p>
      <p className="text-[11px] text-text-3">{nota}</p>
    </Link>
  );
}
