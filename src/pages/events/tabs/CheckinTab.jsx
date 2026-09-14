import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import QrScanner from '../../../components/ui/QrScanner.jsx';
import { clientesApi } from '../../../api/clientes.js';
import { agendaApi } from '../../../api/agenda.js';
import { interaccionesApi } from '../../../api/interacciones.js';
import { derechosApi } from '../../../api/derechos.js';
import { useToast } from '../../../context/ToastContext.jsx';
import { useAsistenciaEnVivo } from '../../../hooks/useAsistenciaEnVivo.js';
import AsistenciaContador from '../../../components/ui/AsistenciaContador.jsx';
import { zonasDelEvento, etiquetaZona } from '../../../lib/zonas.js';
import { encolar, leerCola, quitar, cantidadCola, TIPO_INGRESO, TIPO_SESION, TIPO_ENTREGA } from '../../../lib/checkinOffline.js';
import { leerQr } from '../../../lib/qrEscaneado.js';

/* Tab Escanear — el ÚNICO sitio donde se pasa una escarapela por un móvil.

   Cinco modos, y la diferencia entre ellos es la que sostiene todo el reporte:

   · Check-in   → la persona ENTRA AL EVENTO. Suma al ingreso del recinto y a
                  nada más. Invalida la boleta para una segunda entrada.
   · Reingreso  → sale y vuelve a entrar, o cruza una zona. Mueve el aforo, no
                  la asistencia.
   · Sub-evento → la persona entra a UN taller, charla o competencia concreta.
                  Es lo único que suma a las métricas de ese sub-evento, y pide
                  que esté inscrita en él: haber entrado al evento no significa
                  haber asistido a la charla, y contarlo así convertiría
                  "asistentes al taller" en "gente que estaba en el edificio".
   · Puntos     → se le marca un motivo en un stand y suma (o resta) puntos.
   · Canjear    → cambia sus puntos por un premio.
   · Entregar   → se le da lo que su boleta INCLUYE: el refrigerio, el almuerzo,
                  el kit, el parqueadero. No cuesta puntos y no es un premio:
                  ya era suyo, y lo que se registra es que se lo dieron y quién
                  se lo dio. Vive aquí por la misma razón que los dos de
                  arriba: la acción física es una —pasar una escarapela por un
                  móvil— y mandar a otra pantalla con la misma persona delante
                  es trabajo de más.

   Los dos últimos vivían en «Stands y puntos», que era otra pantalla con otro
   escáner. La acción física es UNA —pasar una escarapela por un móvil— y lo
   único que cambia es qué se hace con el resultado; obligar a cambiar de
   pantalla con la misma persona delante y la misma escarapela en la mano era
   trabajo de más. En Stands se queda lo que es configuración: crear el stand,
   su cuota y el catálogo de motivos.

   Quien no esté inscrito no se marca a la fuerza: se registra primero y se
   vuelve a escanear. */

export default function CheckinTab({ evento, miRolId = null, miUserId = null, permisos = [], soyOwner = false }) {
  /* Los dos trabajos de esta pantalla tienen dueños distintos.
   *
   * Quien reparte el almuerzo puede no poder abrir la puerta —`entregar` sin
   * `checkin`, que es justo para lo que se separaron— y quien está en la
   * puerta puede no repartir nada. Con la pestaña abierta por cualquiera de
   * los dos permisos, hay que decidir DENTRO qué modos enseñar: si no, quien
   * sólo entrega abre la pantalla en «Check-in» y el primer escaneo le marca
   * la entrada a alguien en vez de darle su comida. */
  const mandaTodo  = soyOwner || permisos.includes('*');
  const puedeEntrar   = mandaTodo || permisos.includes('checkin');
  const puedeEntregar = mandaTodo || permisos.includes('entregar');

  const [mode, setMode]       = useState('manual'); // manual | camara
  /* Se abre en lo único que esta persona puede hacer. */
  const [accion, setAccion]   = useState(puedeEntrar ? 'checkin' : 'entregar'); // checkin | reingreso | subevento | puntos | canjear | entregar
  const [working, setWorking] = useState(false);
  const [last, setLast]       = useState(null); // { ok, ticket, error, sound }
  const [historial, setHistorial] = useState([]); // últimos check-ins de esta sesión
  const { error: toastErr } = useToast();

  /* Puertas configuradas (page_json.accesos). El escáner recuerda la suya en
     localStorage; se envía en cada check-in para validar y registrar. */
  const accesos = Array.isArray(evento.page_json?.accesos) ? evento.page_json.accesos : [];
  const [puertaId, setPuertaId] = useState(() => {
    try { return localStorage.getItem(`gestek-puerta:${evento.id}`) || ''; } catch { return ''; }
  });
  /* Cuáles son TUS puertas.
     «Quién registra aquí» se configura en Accesos e ingresos y hasta ahora no
     lo leía nadie: se guardaba la intención y el escáner seguía enseñando las
     ocho puertas iguales. Una asignación que no cambia nada en ninguna pantalla
     es decoración.
     Se mira por persona y por rol: asignar «quien esté en puerta» es lo que
     aguanta un cambio de turno. */
  const misPuertas = useMemo(() => {
    const ids = new Set();
    for (const a of accesos) {
      const porPersona = miUserId && (a.staff || []).includes(miUserId);
      const porRol     = miRolId && (a.roles || []).includes(miRolId);
      if (porPersona || porRol) ids.add(a.id);
    }
    return ids;
  }, [accesos, miUserId, miRolId]);

  /* Si sólo tienes una y todavía no elegiste ninguna, se elige sola. Quien está
     en la puerta abre esto con cola delante; un desplegable menos que tocar. */
  useEffect(() => {
    if (puertaId || misPuertas.size !== 1) return;
    elegirPuerta([...misPuertas][0]);
  }, [misPuertas, puertaId]);

  const puertaRef = useRef(puertaId);
  const elegirPuerta = (id) => {
    setPuertaId(id); puertaRef.current = id;
    try { localStorage.setItem(`gestek-puerta:${evento.id}`, id); } catch { /* noop */ }
  };

  /* Zonas (page_json.zonas) — solo aplican en modo Reingreso, para el aforo por
     zona. Filtradas como en todas partes: esto leía la lista cruda, así que una
     zona recién creada y todavía sin nombre salía como una opción en blanco. */
  const zonas = zonasDelEvento(evento);
  const [zonaId, setZonaId] = useState('');
  const zonaRef = useRef('');
  const elegirZona = (id) => { setZonaId(id); zonaRef.current = id; };

  /* Sub-eventos: se piden sólo cuando hace falta (el escáner de la puerta
     principal no los necesita) y se recuerda cuál opera este dispositivo, que
     en un taller es siempre el mismo durante horas. */
  const [sesiones, setSesiones] = useState(null);
  const [sesionId, setSesionId] = useState(() => {
    try { return localStorage.getItem(`gestek-subevento:${evento.id}`) || ''; } catch { return ''; }
  });
  const sesionRef = useRef(sesionId);
  const elegirSesion = (id) => {
    setSesionId(id); sesionRef.current = id; setLast(null);
    try { localStorage.setItem(`gestek-subevento:${evento.id}`, id); } catch { /* noop */ }
  };
  useEffect(() => {
    if (accion !== 'subevento' || sesiones !== null) return;
    agendaApi.sessions(evento.id)
      .then(d => {
        const lista = (d.sessions || d.sesiones || []).filter(x => x.requiere_inscripcion);
        setSesiones(lista);
        /* Si la guardada ya no existe (la borraron), no dejar el escáner
           apuntando a un sub-evento fantasma. */
        if (sesionRef.current && !lista.some(x => x.id === sesionRef.current)) elegirSesion('');
        else if (!sesionRef.current && lista.length === 1) elegirSesion(lista[0].id);
      })
      .catch(() => setSesiones([]));
    /* eslint-disable-next-line */
  }, [accion, evento.id, sesiones]);

  /* Motivos del catálogo — sólo hacen falta en modo Puntos, y se piden una vez.
     Igual que los sub-eventos: el escáner de la puerta principal no los
     necesita y pedirlos siempre sería una consulta por cada apertura. */
  const [motivos, setMotivos] = useState(null);
  const [motivoSel, setMotivoSel] = useState(null);
  const [lugar, setLugar] = useState('');
  const motivoRef = useRef(null);
  const elegirMotivo = (m) => { setMotivoSel(m); motivoRef.current = m; setLast(null); };
  useEffect(() => {
    if (accion !== 'puntos' || motivos !== null) return;
    interaccionesApi.motivos(evento.id)
      .then(d => setMotivos((d.motivos || []).filter(m => m.activo)))
      .catch(() => setMotivos([]));
  }, [accion, evento.id, motivos]);

  /* Premios: en modo Canjear hay que saber qué puede llevarse quien escanea,
     y eso depende de su saldo, así que se pide con la boleta ya leída. */
  const [premios, setPremios] = useState([]);

  const { ingresados, total: totalAsistentes, bumpOptimista } = useAsistenciaEnVivo(evento.id);

  /* Estado de conexión + cola offline. */
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [cola, setCola] = useState(() => cantidadCola(evento.id));
  const [sincronizando, setSincronizando] = useState(false);
  /* Ver el cerrojo en `despachar`, más abajo: `working` pinta, esto impide. */
  const ocupado = useRef(false);

  const handleCheckin = useCallback(async (payload) => {
    if (working) return;
    /* Sin conexión → guardar en la cola offline (optimista). */
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const { guardado, cantidad, yaEstaba } = encolar(evento.id, { ...payload, acceso_id: puertaRef.current || undefined });
      setCola(cantidad);
      /* Si no se pudo guardar hay que decirlo AHORA, con la persona delante.
         Antes se enseñaba «guardado» pasara lo que pasara. */
      setLast(guardado
        ? { ok: true, offlineGuardado: true, yaEstaba }
        /* El código va dentro: la tarjeta le dice a quien escanea que lo apunte
           a mano, y sin enseñárselo ese consejo no se puede seguir. Del QR
           firmado se enseña el final, que es lo que distingue una boleta de
           otra y cabe en un papel. */
        : { ok: false, noSeGuardo: true, codigo: payload.codigo || (payload.qr_token || '').slice(-12) });
      return;
    }
    setWorking(true);
    setLast(null);
    try {
      const r = await clientesApi.checkin(evento.id, { ...payload, acceso_id: puertaRef.current || undefined });
      setLast({ ok: true, ...r });
      setHistorial(h => [{ ...r.ticket, at: new Date(), ok: true }, ...h].slice(0, 10));
      bumpOptimista();
    } catch (e) {
      /* Error de RED (sin respuesta del servidor) → encolar, no perder el escaneo. */
      if (!e.response) {
        const { guardado, cantidad, yaEstaba } = encolar(evento.id, { ...payload, acceso_id: puertaRef.current || undefined });
        setCola(cantidad);
        setLast(guardado
        ? { ok: true, offlineGuardado: true, yaEstaba }
        /* El código va dentro: la tarjeta le dice a quien escanea que lo apunte
           a mano, y sin enseñárselo ese consejo no se puede seguir. Del QR
           firmado se enseña el final, que es lo que distingue una boleta de
           otra y cabe en un papel. */
        : { ok: false, noSeGuardo: true, codigo: payload.codigo || (payload.qr_token || '').slice(-12) });
      } else {
        const detail = e.response?.data || {};
        setLast({ ok: false, error: e.message, ...detail });
        if (detail.ticket) {
          setHistorial(h => [{ ...detail.ticket, at: new Date(), ok: false, error: e.message }, ...h].slice(0, 10));
        }
      }
    } finally {
      setTimeout(() => setWorking(false), 600);
    }
  }, [evento.id, working, bumpOptimista]);

  /* Sincroniza la cola offline contra el servidor. */
  const sincronizar = useCallback(async (automatica = false) => {
    if (sincronizando) return;
    const pend = leerCola(evento.id);
    if (!pend.length) return;
    setSincronizando(true);
    let ok = 0, fallidas = 0, enEspera = 0, yaEstaban = 0;
    const motivos = [];
    /* Lo rechazado, con nombre. Antes sólo se contaba: «3 rechazados» y nadie
       sabía de quién. Con los sub-eventos en la cola eso pasa de incómodo a
       grave — en la puerta de un taller es normal que alguien no esté inscrito,
       y si se descarta en silencio, entró y nadie va a saberlo nunca. */
    const rechazados = [];
    for (const item of pend) {
      try {
        const { offline_id, tipo, sesion_id: sesionId, ...payload } = item;
        /* Lo guardado ANTES de que existiera `tipo` no lo lleva, y es un
           ingreso: una cola a medio sincronizar no se puede perder porque se
           desplegara una versión nueva a mitad del evento. */
        if ((tipo || TIPO_INGRESO) === TIPO_SESION) {
          await agendaApi.marcarAsistencia(evento.id, sesionId, payload);  // payload lleva `at`
        } else if ((tipo || TIPO_INGRESO) === TIPO_ENTREGA) {
          /* `origen: 'cola'` para que una auditoría pueda separar lo que se
             entregó con red de lo que llegó horas después. Y el `at` que va
             dentro es la hora REAL: sin él, los cuatrocientos almuerzos de una
             tableta sin señal aparecerían todos en el minuto en que volvió el
             wifi.

             El duplicado que pueda traer la cola no hace falta esquivarlo
             aquí: lo para el índice único de la base y vuelve como 409, que es
             de los definitivos y se descarta abajo. */
          await derechosApi.entregar(evento.id, { ...payload, origen: 'cola' });
        } else {
          await clientesApi.checkin(evento.id, payload);  // payload incluye `at` (hora real) y acceso_id
        }
        quitar(evento.id, offline_id);
        ok++;
      } catch (e) {
        if (!e.response) continue;   // sigue sin red: se queda para el próximo intento

        /* No todo rechazo es definitivo, y antes se trataban todos igual: se
           tiraba el escaneo y el resumen decía «N fallidas» sin más.
           En un evento eso puede ser doscientas entradas perdidas sin saber ni
           de quién eran.

           Definitivo (400, 404, 409): la boleta ya se usó, no existe o es de
           otro evento. Reintentar no cambia nada, así que se descarta.

           Arreglable (401, 403, 5xx): la sesión caducó, quien escanea no está
           asignado a esta puerta —lo comprueba `puedeAtenderPuerta` desde hoy—
           o el servidor se cayó un momento. Las tres se arreglan y luego la
           cola se vacía sola. Tirarlas sería perder entradas por un permiso. */
        const st = e.response.status;
        const data = e.response.data || {};
        if (st === 401 || st === 403 || st >= 500) {
          enEspera++;
          const m = data.error;
          if (m && !motivos.includes(m)) motivos.push(m);
          continue;
        }
        quitar(evento.id, item.offline_id);

        /* «Esta boleta ya fue usada» NO es un rechazo que haya que perseguir:
           significa que esa persona entró. Pasa constantemente y sin que nadie
           haga nada mal — otra puerta la registró con red mientras ésta estaba
           sin cobertura, o el escaneo se mandó y la respuesta no llegó.

           Contarlo entre los rechazados manda a quien está en la puerta a
           buscar en la lista a alguien que ya está dentro. Se cuenta aparte y
           se dice en una línea: informativo, no un problema.

           Sólo vale para ingresos: en un sub-evento el 409 es «está lleno», y
           eso sí es alguien que entró y no quedó registrado. */
        if (data.ya_usada && (item.tipo || TIPO_INGRESO) !== TIPO_SESION) {
          yaEstaban++;
          continue;
        }

        fallidas++;
        if (rechazados.length < 20) {
          rechazados.push({
            codigo: item.codigo || (item.qr_token || '').slice(-12),
            motivo: data.error || `Error ${st}`,
          });
        }
      }
    }
    setCola(cantidadCola(evento.id));
    setSincronizando(false);
    /* Un reintento automatico que no consiguio nada no pinta nada.
       Si pintara, cada treinta segundos taparia la tarjeta del escaneo que
       quien esta en la puerta tiene delante —con la persona delante— para
       repetirle que la cola sigue sin poder vaciarse. La cuenta ya se ve en el
       boton «Sincronizar N», que es donde tiene que estar. */
    const algoCambio = ok || fallidas || yaEstaban;
    if (algoCambio || (!automatica && enEspera)) {
      setLast({ ok: true, syncResumen: { ok, fallidas, enEspera, yaEstaban, motivos, rechazados } });
      bumpOptimista();
    }
  }, [evento.id, sincronizando, bumpOptimista]);

  /* Detecta cambios de conexión; al volver, sincroniza solo. */
  useEffect(() => {
    const irOnline = () => { setOnline(true); sincronizar(); };
    const irOffline = () => setOnline(false);
    window.addEventListener('online', irOnline);
    window.addEventListener('offline', irOffline);
    return () => { window.removeEventListener('online', irOnline); window.removeEventListener('offline', irOffline); };
  }, [sincronizar]);

  /* ── Que la cola no dependa de que alguien se acuerde ──────────────────
   *
   * El evento `online` era el ÚNICO disparador automático, y sólo salta si la
   * pestaña está viva en el instante exacto en que vuelve la red. En una
   * puerta eso falla de las dos maneras:
   *
   *   · el móvil mata la pestaña por memoria —lo que hace un móvil con la
   *     pantalla apagada un rato— y al reabrirla ya hay red: el evento saltó
   *     mientras no había nadie escuchando;
   *   · cambio de turno: el escáner se abre en otro dispositivo, o el mismo se
   *     reinicia. Se abre ya con conexión y con escaneos guardados dentro.
   *
   * En los dos casos quedaba un botón «Sincronizar 14» esperando a que alguien
   * lo viera. Los escaneos no se pierden, pero pueden pasarse el evento entero
   * sin registrarse, y entonces el aforo que se mira en el panel es mentira.
   *
   * Se intenta al abrir y se reintenta mientras QUEDE cola: `navigator.onLine`
   * dice que hay una interfaz de red, no que se llegue al servidor —un wifi de
   * recinto con portal cautivo da `true` y no deja pasar—, así que el reintento
   * es lo que de verdad la vacía. Se para solo cuando la cola llega a cero. */
  const sincronizarRef = useRef(sincronizar);
  useEffect(() => { sincronizarRef.current = sincronizar; }, [sincronizar]);

  const hayCola = cola > 0;
  useEffect(() => {
    /* Por el `ref` y no por `sincronizar`: la función cambia de identidad en
       cada sincronización (depende de `sincronizando`), y con ella en las
       dependencias el efecto se rearmaría en cada vuelta y dispararía otra
       sincronización en el acto. Un bucle, no un reintento. */
    if (!online || !hayCola) return;
    sincronizarRef.current(true);
    const t = setInterval(() => sincronizarRef.current(true), 30000);
    return () => clearInterval(t);
  }, [online, hayCola]);

  const handleReingreso = useCallback(async (payload) => {
    if (working) return;
    setWorking(true);
    setLast(null);
    try {
      const r = await clientesApi.reingreso(evento.id, { ...payload, acceso_id: puertaRef.current || undefined, zona_id: zonaRef.current || undefined });
      /* `aforo` viene con la zona ya recalculada: quien está en la puerta ve el
         número después de ESTE escaneo sin cambiar de pantalla. */
      setLast({ reingresoMode: true, ok: true, dentro: r.dentro, ticket: r.ticket, aforo: r.aforo });
      setHistorial(h => [{ guest_nombre: r.ticket?.nombre, codigo: r.ticket?.codigo, at: new Date(), ok: true, reingreso: r.dentro ? 'entró' : 'salió' }, ...h].slice(0, 10));
    } catch (e) {
      /* Sin conexión esto NO se encola, y es a propósito: el reingreso es un
         interruptor —entra, sale, entra— y el orden decide el aforo. Si unos
         escaneos se guardan y otros salen en el momento, al reconectar se
         aplican mezclados y el número de gente dentro deja de ser el de la
         realidad para el resto del evento. Un aforo mal contado es peor que un
         movimiento no registrado.
         Así que se dice, con el código, para apuntarlo a mano. Antes salía
         «Network Error» y el movimiento se perdía igual, sólo que sin avisar. */
      setLast(e.response
        ? { reingresoMode: true, ok: false, error: e.response.data?.error || e.message }
        : { ok: false, noSeGuardo: true, sinCola: true,
            codigo: payload.codigo || (payload.qr_token || '').slice(-12) });
    } finally {
      setTimeout(() => setWorking(false), 600);
    }
  }, [evento.id, working]);

  const handleSubevento = useCallback(async (payload) => {
    if (working) return;
    const sid = sesionRef.current;
    if (!sid) { setLast({ subeventoMode: true, ok: false, error: 'Elige primero a qué sub-evento estás marcando.' }); return; }

    /* Sin conexión, a la cola. Marcar asistencia es idempotente y el orden da
       igual —a diferencia del reingreso, que es un interruptor—, así que
       guardarla y mandarla luego no puede descuadrar nada. La sesión viaja
       dentro: al sincronizar puede haber otra elegida en la pantalla. */
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const { guardado, cantidad, yaEstaba } = encolar(evento.id, { ...payload, sesion_id: sid }, TIPO_SESION);
      setCola(cantidad);
      setLast(guardado
        ? { subeventoMode: true, ok: true, offlineGuardado: true, yaEstaba }
        : { ok: false, noSeGuardo: true, codigo: payload.codigo || (payload.qr_token || '').slice(-12) });
      return;
    }

    setWorking(true);
    setLast(null);
    try {
      const r = await agendaApi.marcarAsistencia(evento.id, sid, payload);
      const nombre = r.inscripcion?.nombre || null;
      setLast({ subeventoMode: true, ok: true, yaMarcada: r.ya_marcada, nombre, conteo: r.conteo });
      setHistorial(h => [{
        guest_nombre: nombre, codigo: r.ticket?.codigo, at: new Date(), ok: true,
        subevento: r.ya_marcada ? 'ya estaba' : 'asistió',
      }, ...h].slice(0, 10));
    } catch (e) {
      /* Igual que el reingreso: sin respuesta del servidor no hay constancia de
         que esta persona entró al taller, y quien está en la puerta tiene que
         enterarse ahora. Aquí sí se podría encolar —marcar asistencia es
         idempotente y el orden da igual—, pero eso es una función que decidir,
         no un arreglo: queda dicho en vez de perdido. */
      if (!e.response) {
        const { guardado, cantidad, yaEstaba } = encolar(evento.id, { ...payload, sesion_id: sid }, TIPO_SESION);
        setCola(cantidad);
        setLast(guardado
          ? { subeventoMode: true, ok: true, offlineGuardado: true, yaEstaba }
          : { ok: false, noSeGuardo: true, codigo: payload.codigo || (payload.qr_token || '').slice(-12) });
        setTimeout(() => setWorking(false), 600);
        return;
      }
      const d = e.response?.data || {};
      setLast({
        subeventoMode: true, ok: false,
        error: d.error || e.message,
        noInscrito: Boolean(d.no_inscrito),
        ticket: d.ticket || null,
      });
    } finally {
      setTimeout(() => setWorking(false), 600);
    }
  }, [evento.id, working]);

  /* ── Entregar lo que la boleta incluye (0126) ─────────────────────────
   *
   * El derecho y la franja se eligen ANTES de escanear y se quedan fijos, como
   * el motivo de los puntos: en la fila del almuerzo se entrega lo mismo
   * cuatrocientas veces seguidas, y preguntarlo por persona sería un toque de
   * más multiplicado por cuatrocientos. */
  const [derechos, setDerechos]   = useState([]);
  const [derechoId, setDerechoId] = useState('');
  const [ventanaId, setVentanaId] = useState('');
  const [recuento, setRecuento]   = useState(null);

  const derecho = useMemo(() => derechos.find(d => d.id === derechoId) || null, [derechos, derechoId]);

  useEffect(() => {
    if (!puedeEntregar) return;
    let vivo = true;
    derechosApi.list(evento.id)
      .then(d => { if (vivo) setDerechos((d.derechos || []).filter(x => x.activo)); })
      /* En silencio: quien viene a hacer check-in no tiene por qué ver un
         error de una pestaña que no va a abrir. Si de verdad hay derechos y no
         cargaron, el selector sale vacío y lo dice. */
      .catch(() => {});
    return () => { vivo = false; };
  }, [evento.id, puedeEntregar]);

  /* La franja que está abierta AHORA, elegida sola. Es lo que quiere quien
     entrega: llega a las 12:05, abre la pantalla y ya está en «Almuerzo día
     1». Se puede cambiar a mano —hay quien reparte a destiempo y hay que poder
     anotarlo donde toca—, y por eso sólo se rellena cuando está vacía. */
  useEffect(() => {
    if (!derecho || ventanaId) return;
    const ahora = Date.now();
    const abierta = (derecho.ventanas || []).find(v => {
      const i = v.inicio ? new Date(v.inicio).getTime() : -Infinity;
      const f = v.fin ? new Date(v.fin).getTime() : Infinity;
      return ahora >= i && ahora <= f;
    });
    if (abierta) setVentanaId(abierta.id);
  }, [derecho, ventanaId]);

  /* Cuántos van y cuántos faltan: es lo que la cocina pregunta cada media
     hora. Se refresca al entregar y no en un intervalo — un contador que se
     mueve solo en una pantalla que nadie mira gasta batería y datos en el
     peor sitio del recinto para las dos cosas. */
  const refrescarRecuento = useCallback(async (dId, vId) => {
    if (!dId) return;
    try {
      setRecuento(await derechosApi.recuento(evento.id, dId, vId ? { ventana_id: vId } : {}));
    } catch { setRecuento(null); }
  }, [evento.id]);

  useEffect(() => { refrescarRecuento(derechoId, ventanaId); }, [derechoId, ventanaId, refrescarRecuento]);

  /* Lo elegido, a mano para el handler: `despachar` se vuelve a crear con cada
     cambio y el escaneo tiene que llevar SIEMPRE lo que hay en pantalla ahora,
     no lo que había cuando se montó la cámara. */
  const entregaRef = useRef({ derechoId: '', ventanaId: '' });
  useEffect(() => { entregaRef.current = { derechoId, ventanaId }; }, [derechoId, ventanaId]);

  const handleEntrega = useCallback(async (payload) => {
    if (working) return;
    const { derechoId: dId, ventanaId: vId } = entregaRef.current;
    if (!dId) { setLast({ entregaMode: true, ok: false, error: 'Elige primero qué vas a entregar.' }); return; }
    const queEs = derechos.find(x => x.id === dId);

    /* Sin conexión, a la cola. El salón de comidas suele ser el peor punto de
       wifi del recinto: si esto exigiera red, la salida del staff sería
       apuntar en papel y no pasarlo nunca. */
    if (!navigator.onLine) {
      const { guardado, cantidad, yaEstaba } = encolar(
        evento.id, { ...payload, derecho_id: dId, ventana_id: vId || null }, TIPO_ENTREGA);
      setCola(cantidad);
      setLast(guardado
        ? { entregaMode: true, ok: true, offlineGuardado: true, yaEstaba, titulo: queEs?.nombre }
        : { entregaMode: true, ok: false, noSeGuardo: true, error: 'No se pudo guardar el escaneo.' });
      setTimeout(() => setWorking(false), 600);
      return;
    }

    setWorking(true);
    setLast(null);
    try {
      const r = await derechosApi.entregar(evento.id, {
        ...payload, derecho_id: dId, ventana_id: vId || null,
      });
      setLast({ entregaMode: true, ...r });
      setHistorial(h => [{
        guest_nombre: r.persona, codigo: r.boleta?.codigo,
        at: new Date(), ok: true, entrega: r.titulo,
      }, ...h].slice(0, 10));
      refrescarRecuento(dId, vId);
    } catch (e) {
      const d = e.response?.data || {};
      setLast({ entregaMode: true, ok: false, ...d, error: d.error || e.message, titulo: queEs?.nombre });
    } finally {
      setTimeout(() => setWorking(false), 600);
    }
  }, [evento.id, working, derechos, refrescarRecuento]);

  /* Dar puntos: el motivo lo elige el operador ANTES de escanear y se queda
     fijo, porque en un stand se marca lo mismo cien veces seguidas. */
  const handlePuntos = useCallback(async (payload) => {
    if (working) return;
    const m = motivoRef.current;
    if (!m) { setLast({ puntosMode: true, ok: false, error: 'Elige primero qué le vas a marcar.' }); return; }
    setWorking(true);
    setLast(null);
    try {
      const r = await interaccionesApi.registrar(evento.id, {
        ...payload, motivo_id: m.id, lugar: lugar.trim() || null,
      });
      setLast({ puntosMode: true, ok: true, motivo: m, ...r });
      setHistorial(h => [{
        guest_nombre: r.ticket?.nombre || r.ticket?.guest_nombre, codigo: r.ticket?.codigo,
        at: new Date(), ok: true, puntos: `${m.tipo === 'negativo' ? '' : '+'}${r.puntos ?? m.puntos ?? ''}`,
      }, ...h].slice(0, 10));
    } catch (e) {
      setLast({ puntosMode: true, ok: false, error: e.response?.data?.error || e.message });
    } finally {
      setTimeout(() => setWorking(false), 600);
    }
  }, [evento.id, lugar, working]);

  /* Canjear va en dos pasos y no en uno: primero se lee la escarapela para ver
     el saldo y qué le alcanza, y sólo después se elige el premio. Hacerlo de
     una sola pasada obligaría a saber el premio antes de saber si puede
     pagarlo. */
  const handleSaldo = useCallback(async (payload) => {
    if (working) return;
    setWorking(true);
    setLast(null);
    try {
      const r = await interaccionesApi.saldo(evento.id, payload);
      setPremios(r.recompensas || []);
      setLast({ canjearMode: true, ok: true, saldoInfo: r, escaneado: payload });
    } catch (e) {
      setLast({ canjearMode: true, ok: false, error: e.response?.data?.error || e.message });
    } finally {
      setTimeout(() => setWorking(false), 600);
    }
  }, [evento.id, working]);

  const confirmarCanje = useCallback(async (recompensa) => {
    const escaneado = last?.escaneado;
    if (!escaneado || working) return;
    setWorking(true);
    try {
      const r = await interaccionesApi.canjear(evento.id, { ...escaneado, recompensa_id: recompensa.id });
      setLast({ canjearMode: true, ok: true, canjeHecho: { ...r, titulo: recompensa.titulo } });
      setHistorial(h => [{
        guest_nombre: r.ticket?.nombre, codigo: r.ticket?.codigo,
        at: new Date(), ok: true, canje: recompensa.titulo,
      }, ...h].slice(0, 10));
    } catch (e) {
      setLast({ canjearMode: true, ok: false, error: e.response?.data?.error || e.message });
    } finally {
      setTimeout(() => setWorking(false), 600);
    }
  }, [evento.id, last, working]);

  /* onScan estable (misma identidad siempre): QrScanner la guarda en un ref
     internamente, así que no importa si esta función cambia — no reinicia la cámara. */
  const despachar = useCallback(async (leido) => {
    /* Un solo escaneo a la vez, de verdad.
     *
     * Cada handler empieza con `if (working) return`, y `working` es un valor
     * capturado: dos llegadas en el mismo fotograma lo ven las dos en `false`.
     * La cámara ya no deja pasar el mismo código dos veces en tres segundos,
     * así que por ahí no entra — pero el formulario del código a mano sí, con
     * dos Enter seguidos, y sobre todo el camino SIN CONEXIÓN, que sale antes
     * de tocar `working` y encola los dos escaneos. Al sincronizar, el segundo
     * vuelve como «esta boleta ya fue usada»: un error inventado por nosotros,
     * en la puerta, con la fila esperando.
     *
     * El `ref` cambia en el acto. Se suelta enseguida —los 600 ms que la
     * persona ve siguen viniendo de `working`—: esto sólo cierra el hueco
     * entre dos llamadas que aún no han pintado nada. */
    if (ocupado.current) return;
    ocupado.current = true;
    try {
      if (accion === 'subevento') return await handleSubevento(leido);
      if (accion === 'reingreso') return await handleReingreso(leido);
      if (accion === 'puntos')    return await handlePuntos(leido);
      if (accion === 'canjear')   return await handleSaldo(leido);
      if (accion === 'entregar')  return await handleEntrega(leido);
      return await handleCheckin(leido);
    } finally { ocupado.current = false; }
  }, [accion, handleCheckin, handleReingreso, handleSubevento, handlePuntos, handleSaldo, handleEntrega]);
  const onScanQr = useCallback((qr) => despachar(leerQr(qr)), [despachar]);
  const onSubmitCodigo = (codigo) => despachar({ codigo });

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold font-display text-text-1 tracking-tight">Check-in</h2>
          <p className="text-sm text-text-2 mt-1">Escanea el QR de cada asistente o ingresa el código manualmente.</p>
          {accesos.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-text-3">Tu puerta:</span>
              <select value={puertaId} onChange={e => elegirPuerta(e.target.value)}
                className="input !h-8 !py-1 text-sm w-auto">
                <option value="">Sin especificar</option>
                {misPuertas.size > 0 && (
                  <optgroup label="Asignadas a ti">
                    {accesos.filter(a => misPuertas.has(a.id))
                      .map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </optgroup>
                )}
                <optgroup label={misPuertas.size > 0 ? 'Las demás' : 'Puertas'}>
                  {accesos.filter(a => !misPuertas.has(a.id))
                    .map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </optgroup>
              </select>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <AsistenciaContador ingresados={ingresados} total={totalAsistentes} compact />
          {/* Dos grupos, y no cinco botones seguidos: entrar y premiar son dos
              trabajos distintos, los hace gente distinta y en momentos
              distintos. Mezclados en una sola barra parecían lo mismo, y de ahí
              salía la idea de que un expositor necesita esta pantalla — no la
              necesita: da sus puntos por su propio enlace, donde se le
              identifica. Lo de aquí son los puntos DEL EVENTO. */}
          {[
            ...(puedeEntrar ? [
              ['Ingreso', [['checkin', 'Check-in'], ['reingreso', 'Reingreso'], ['subevento', 'Sub-evento']]],
              ['Puntos del evento', [['puntos', 'Puntos'], ['canjear', 'Canjear']]],
            ] : []),
            /* El tercer grupo aparece sólo si hay algo que entregar. Un botón
               «Entregar» en un evento sin derechos configurados manda a una
               pantalla que sólo sabe decir «elige primero qué vas a entregar»,
               y no hay nada que elegir. */
            ...(puedeEntregar && derechos.length
              ? [['Lo que incluye', [['entregar', 'Entregar']]]]
              : []),
          ].map(([grupo, opciones]) => (
            <div key={grupo} className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-text-3 font-semibold px-1">{grupo}</span>
              <div className="flex items-center gap-1 bg-surface-2 border border-border rounded-xl p-1">
                {opciones.map(([k, l]) => (
                  <button key={k} onClick={() => { setAccion(k); setLast(null); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${accion === k ? 'bg-surface-3 text-text-1' : 'text-text-3 hover:text-text-2'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-1 bg-surface-2 border border-border rounded-xl p-1">
            {[['manual', 'Código'], ['camara', 'Cámara']].map(([k, l]) => (
              <button key={k} onClick={() => setMode(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${mode === k ? 'bg-surface-3 text-text-1' : 'text-text-3 hover:text-text-2'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {(!online || cola > 0) && (
        <div className={`rounded-2xl border px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 ${online ? 'border-warning/40 bg-warning/10' : 'border-danger/40 bg-danger/10'}`}>
          <p className="text-xs text-text-2">
            {!online
              ? <><b className="text-text-1">Sin conexión.</b> Los check-ins se guardan y se sincronizan solos al reconectar.</>
              : <><b className="text-text-1">{cola}</b> escaneo{cola !== 1 ? 's' : ''} sin sincronizar.</>}
          </p>
          {/* `() =>` y no `sincronizar` a secas: onClick pasa el evento del
              clic como primer argumento, y ahí ahora va `automatica`. Un
              MouseEvent es un valor verdadero, así que pulsar el botón se
              habría contado como un reintento automático y se habría quedado
              sin contestar nada en pantalla. */}
          {cola > 0 && online && (
            <button onClick={() => sincronizar()} disabled={sincronizando} className="btn-secondary btn-sm flex-shrink-0">
              {sincronizando ? 'Sincronizando…' : `Sincronizar ${cola}`}
            </button>
          )}
        </div>
      )}

      {accion === 'reingreso' && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-text-2">Modo <b className="text-text-1">reingreso</b>: al escanear se alterna entre <b>salida</b> y <b>entrada</b> sin invalidar la boleta.{zonas.length > 0 ? ' Elige una zona para el aforo por zona.' : ''}</p>
          {zonas.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-3">Zona:</span>
              <select value={zonaId} onChange={e => elegirZona(e.target.value)} className="input !h-8 !py-1 text-sm w-auto">
                <option value="">Recinto (general)</option>
                {zonas.map(z => <option key={z.id} value={z.id}>{etiquetaZona(z)}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {accion === 'subevento' && (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 px-4 py-2.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-text-2">
              Modo <b className="text-text-1">sub-evento</b>: esto suma a las métricas del taller o charla que elijas, no al ingreso del evento.
            </p>
            {sesiones && sesiones.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-3">Sub-evento:</span>
                <select value={sesionId} onChange={e => elegirSesion(e.target.value)} className="input !h-8 !py-1 text-sm w-auto max-w-[260px]">
                  <option value="">Elige uno…</option>
                  {sesiones.map(x => (
                    <option key={x.id} value={x.id}>
                      {x.titulo}{x.inicio ? ` · ${new Date(x.inicio).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {sesiones === null
            ? <p className="text-[11px] text-text-3">Cargando sub-eventos…</p>
            : sesiones.length === 0
              ? <p className="text-[11px] text-warning">
                  Ningún sub-evento pide inscripción todavía. Actívala en <b>Espacio del evento → Calendario</b>: sin inscripción no hay a quién marcarle asistencia.
                </p>
              : <p className="text-[11px] text-text-3">
                  La persona tiene que estar inscrita en este sub-evento. Si no lo está, se registra primero y se vuelve a escanear.
                </p>}
        </div>
      )}

      {accion === 'puntos' && (
        <div className="rounded-2xl border border-success/30 bg-success/5 px-4 py-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-text-2">
              Modo <b className="text-text-1">puntos</b>: elige qué le vas a marcar y queda fijo — se marca lo mismo muchas veces seguidas.
              Estos son los motivos <b className="text-text-1">del evento</b>; un stand da los suyos desde su propio enlace, con su cuota.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-3">Lugar:</span>
              <input value={lugar} onChange={e => setLugar(e.target.value)}
                placeholder="Stand 12 (opcional)"
                className="input !h-8 !py-1 text-sm w-auto max-w-[180px]" />
            </div>
          </div>
          {motivos === null ? (
            <p className="text-[11px] text-text-3">Cargando motivos…</p>
          ) : motivos.length === 0 ? (
            <p className="text-[11px] text-warning">
              No hay motivos definidos. Créalos en <b>Espacio del evento → Stands</b>: sin motivo no se sabe por qué se dieron los puntos, y el historial queda sin explicación.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {motivos.map(m => {
                const sel = motivoSel?.id === m.id;
                const neg = m.tipo === 'negativo';
                return (
                  <button key={m.id} onClick={() => elegirMotivo(m)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all
                      ${sel ? (neg ? 'border-danger bg-danger/15 text-danger' : 'border-success bg-success/15 text-success')
                            : 'border-border text-text-2 hover:text-text-1 hover:bg-surface-2'}`}>
                    {m.nombre} <span className="tabular-nums opacity-80">{neg ? '' : '+'}{m.puntos}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {accion === 'canjear' && (
        <div className="rounded-2xl border border-warning/30 bg-warning/5 px-4 py-2.5">
          <p className="text-xs text-text-2">
            Modo <b className="text-text-1">canjear</b>: al escanear se ve el saldo y qué le alcanza; el premio se elige después.
            Primero leer y luego elegir, porque el premio no se puede escoger antes de saber si puede pagarlo.
          </p>
        </div>
      )}

      {/* Entregar: qué y de qué franja, elegidos una vez y fijos para toda la
          fila. Y el contador al lado, que es lo que se pregunta cada media
          hora sin tener que salir de aquí. */}
      {accion === 'entregar' && (
        <div className="rounded-2xl border border-success/30 bg-success/5 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-text-3">Entregando:</span>
            <select value={derechoId}
              onChange={e => { setDerechoId(e.target.value); setVentanaId(''); setLast(null); }}
              className="input !h-8 !py-1 text-sm w-auto">
              <option value="">Elige qué</option>
              {derechos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>

            {derecho?.cadencia === 'ventana' && (
              <select value={ventanaId} onChange={e => { setVentanaId(e.target.value); setLast(null); }}
                className="input !h-8 !py-1 text-sm w-auto">
                <option value="">Elige la franja</option>
                {(derecho.ventanas || []).map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            )}

            {recuento && (
              <span className="text-xs text-text-2 ml-auto">
                <b className="text-text-1">{recuento.entregados}</b> entregados
                {recuento.con_derecho > 0 && <> · faltan {recuento.faltan} de {recuento.con_derecho}</>}
                {recuento.cupo != null && <span className={recuento.sobre_cupo ? 'text-warning' : 'text-text-3'}> · cupo {recuento.cupo}</span>}
              </span>
            )}
          </div>

          <p className="text-xs text-text-2">
            {derecho
              ? <>Se registra <b className="text-text-1">a quién</b> se le entregó y <b className="text-text-1">quién</b> se lo entregó.
                  {derecho.titular === 'grupo'
                    ? ' Este va por boleta: lo puede recoger cualquiera del grupo.'
                    : ' Este va por persona: cada acreditado tiene el suyo.'}</>
              : 'Elige qué vas a entregar antes de escanear.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        {/* Scanner / input */}
        <div className="space-y-4">
          {mode === 'camara'
            ? <QrScanner onScan={onScanQr} overlay={last ? <TarjetaResultado result={last} compact onCanjear={confirmarCanje} /> : null} />
            : <ManualInput onSubmit={onSubmitCodigo} disabled={working} />
          }

          {/* Resultado del último scan (solo se muestra aquí fuera de pantalla completa,
              ya que en modo cámara el resultado aparece flotando sobre el video) */}
          {mode !== 'camara' && last && <TarjetaResultado result={last} onCanjear={confirmarCanje} />}
        </div>

        {/* Historial */}
        <aside className="rounded-3xl border border-border bg-surface/40 overflow-hidden h-fit">
          <div className="px-5 py-4 border-b border-border">
            <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">Recientes</p>
            <h3 className="text-base font-semibold text-text-1 mt-0.5">Esta sesión · {historial.length}</h3>
          </div>
          {historial.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-xs text-text-3">Aún no hay check-ins. Empieza escaneando una boleta.</p>
            </div>
          ) : (
            <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
              {historial.map((t, i) => (
                <HistorialRow key={i} item={t} />
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ─────────── Manual ─────────── */

function ManualInput({ onSubmit, disabled }) {
  const [codigo, setCodigo] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!codigo.trim()) return;
    onSubmit(codigo.trim().toUpperCase());
    setCodigo('');
  };
  return (
    <form onSubmit={submit} className="rounded-3xl border border-border bg-surface/40 p-6">
      <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold mb-3">Ingresa el código de la boleta</p>
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={codigo}
          onChange={e => setCodigo(e.target.value.toUpperCase())}
          placeholder="ABCD1234"
          className="input rounded-2xl py-4 text-2xl font-mono tracking-widest tabular-nums text-center flex-1"
          maxLength={12}
        />
        <button type="submit" disabled={disabled || codigo.length < 4}
          className="px-6 py-4 rounded-2xl bg-text-1 text-bg hover:bg-white text-sm font-semibold disabled:opacity-50 transition-all">
          Validar
        </button>
      </div>
    </form>
  );
}

/* ─────────── Resultado del último scan ─────────── */

function ResultadoCard({ result, compact }) {
  /* No se pudo ni guardar en la cola.
   *
   * Pasa cuando el navegador tiene el almacenamiento lleno o bloqueado. Es el
   * único caso en el que la puerta se queda SIN constancia de que esa persona
   * entró, así que no se puede contar como un aviso más: se dice qué hacer, y
   * se enseña el código para poder apuntarlo. En rojo y grande a propósito —
   * quien escanea está mirando la pantalla medio segundo. */
  if (result.noSeGuardo) return (
    <div className={`rounded-3xl border-2 border-danger ${compact ? 'backdrop-blur-xl bg-surface/90 p-5' : 'bg-danger/10 p-6'} animate-[fadeUp_0.3s_cubic-bezier(0.16,1,0.3,1)_both]`}>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-danger text-white flex items-center justify-center text-2xl font-bold flex-shrink-0">!</div>
        <div className="min-w-0">
          <h3 className="text-xl font-bold font-display text-text-1">NO se guardó</h3>
          <p className="text-sm text-text-2 leading-relaxed">
            {result.sinCola
              ? <>Sin conexión, y esto no se puede guardar para después. </>
              : <>Este teléfono no puede guardar más escaneos sin conexión. </>}
            <b className="text-text-1">Apunta el código a mano</b> y déjala pasar; luego se
            registra desde el panel.
          </p>
          {result.codigo && (
            <p className="mt-2 font-mono text-lg text-text-1 tracking-wider">{result.codigo}</p>
          )}
        </div>
      </div>
    </div>
  );
  if (result.offlineGuardado) return (
    <div className={`rounded-3xl border-2 border-primary/40 ${compact ? 'backdrop-blur-xl bg-surface/90 p-5' : 'bg-primary/10 p-6'} animate-[fadeUp_0.3s_cubic-bezier(0.16,1,0.3,1)_both]`}>
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center text-2xl font-bold flex-shrink-0">⤓</div>
        <div>
          <h3 className="text-xl font-bold font-display text-text-1">
            {result.yaEstaba ? 'Ya estaba guardado' : 'Guardado sin conexión'}
          </h3>
          {/* Decir «guardado» otra vez haría pensar que el primero no entró, y
              lo siguiente es apuntar el código a mano por si acaso. */}
          <p className="text-sm text-text-2">
            {result.yaEstaba
              ? 'Este escaneo ya estaba en la cola. No hace falta repetirlo.'
              : 'Se registrará al volver el internet.'}
          </p>
        </div>
      </div>
    </div>
  );
  if (result.syncResumen) {
    const r = result.syncResumen;
    /* En espera NO es éxito: son entradas que siguen sin registrar y que
       dependen de que alguien arregle algo. Pintarlo en verde con un ✓ sería
       decirle a quien está en la puerta que ya puede olvidarse. */
    const pendiente = r.enEspera > 0;
    return (
      <div className={`rounded-3xl border-2 ${pendiente ? 'border-warning/50' : 'border-success/40'} ${compact ? 'backdrop-blur-xl bg-surface/90 p-5' : (pendiente ? 'bg-warning/10 p-6' : 'bg-success/10 p-6')} animate-[fadeUp_0.3s_cubic-bezier(0.16,1,0.3,1)_both]`}>
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-2xl ${pendiente ? 'bg-warning' : 'bg-success'} text-white flex items-center justify-center text-2xl font-bold flex-shrink-0`}>
            {pendiente ? '!' : '✓'}
          </div>
          <div className="min-w-0">
            <h3 className="text-xl font-bold font-display text-text-1">
              {pendiente ? 'Falta parte de la cola' : 'Sincronizado'}
            </h3>
            <p className="text-sm text-text-2">
              {r.ok} registrados
              {r.yaEstaban ? ` · ${r.yaEstaban} ya estaban dentro` : ''}
              {r.fallidas ? ` · ${r.fallidas} rechazados` : ''}
              {r.enEspera ? ` · ${r.enEspera} sin registrar todavía` : ''}.
            </p>
            {/* Cuáles y por qué. Un número no se puede seguir; un código sí:
                con él se busca a la persona en la lista y se arregla a mano. */}
            {r.rechazados?.length > 0 && (
              <ul className="mt-2 space-y-0.5 max-h-40 overflow-y-auto">
                {r.rechazados.map((x, i) => (
                  <li key={i} className="text-xs text-text-2">
                    <span className="font-mono text-text-1">{x.codigo || '—'}</span>
                    <span className="text-text-3"> · {x.motivo}</span>
                  </li>
                ))}
              </ul>
            )}
            {pendiente && (
              <>
                {/* El motivo, que es lo único accionable: se arregla y la cola
                    se vacía sola en el siguiente intento. */}
                {r.motivos?.length > 0 && (
                  <p className="text-sm text-text-1 mt-1 leading-relaxed">{r.motivos.join(' · ')}</p>
                )}
                <p className="text-xs text-text-3 mt-1 leading-relaxed">
                  Esos escaneos siguen guardados. No se pierden: en cuanto se arregle, se registran solos.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
  const ok = result.ok && !result.ya_usada;
  const yaUsada = result.ya_usada;
  const cls = ok
    ? 'border-success/40 bg-success/10'
    : yaUsada
      ? 'border-warning/40 bg-warning/10'
      : 'border-danger/40 bg-danger/10';
  const icon = ok ? '✓' : yaUsada ? '!' : '✕';
  const iconCls = ok ? 'bg-success text-white' : yaUsada ? 'bg-warning text-white' : 'bg-danger text-white';
  const title = ok
    ? '¡Bienvenido!'
    : yaUsada
      ? 'Boleta ya usada'
      : 'Boleta no válida';

  const ticket = result.ticket;

  return (
    <div className={`rounded-3xl border-2 ${cls} ${compact ? 'backdrop-blur-xl bg-surface/90 p-5' : 'p-6'} animate-[fadeUp_0.3s_cubic-bezier(0.16,1,0.3,1)_both]`}>
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0 ${iconCls}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold font-display text-text-1 mb-1">{title}</h3>
          {result.error && <p className="text-sm text-text-2">{result.error}</p>}
          {result.advertencia && <p className="text-sm text-warning mt-1">{result.advertencia}</p>}

          {ticket && (
            <div className="mt-3 space-y-1">
              <p className="text-base font-medium text-text-1">{ticket.guest_nombre || ticket.guest_email || 'Asistente'}</p>
              <p className="text-xs text-text-3">{ticket.tipo?.nombre || ticket.rol} · <span className="font-mono">{ticket.codigo}</span></p>
              {yaUsada && result.checked_in_at && (
                <p className="text-xs text-text-3 mt-2">Entrada registrada el {new Date(result.checked_in_at).toLocaleString('es-CO')}</p>
              )}
            </div>
          )}

          {/* Con qué comparar la cédula (0127). Sólo aparece cuando la
              credencial va a nombre de una persona concreta: en una entrada
              general el servidor manda la ficha vacía y aquí no se pinta nada.

              Va también en el rechazo, y a propósito: quien está en la puerta
              tiene que poder decirle a la persona qué credencial es la suya y a
              quién preguntar, no sólo que no pasa. */}
          <FichaDeLaPuerta ficha={result.ficha} />
        </div>
      </div>
    </div>
  );
}

/* ─────────── Con qué comparar la cédula ─────────── */

/* La comprobación de verdad en un montaje no la hace el software: la hace
   quien está en la puerta mirando el documento y la cara. Si el escáner sólo
   enseña un nombre, no hay nada que comparar y un QR reenviado por WhatsApp
   abre igual.

   En una boleta normal esto no pinta nada —la ficha viene vacía—, así que la
   pantalla de siempre no cambia. */
function FichaDeLaPuerta({ ficha }) {
  if (!ficha || (!ficha.documento && !ficha.foto_url && !ficha.autorizado_por)) return null;
  return (
    <div className="mt-3 flex items-start gap-3 rounded-2xl border border-border bg-surface-2/60 p-3">
      {ficha.foto_url && (
        <img src={ficha.foto_url} alt=""
          className="w-16 h-16 rounded-xl object-cover flex-shrink-0 border border-border" />
      )}
      <div className="min-w-0 text-sm">
        {ficha.nombre && <p className="font-medium text-text-1 truncate">{ficha.nombre}</p>}
        {/* Grande y en monoespaciada: es el número que se está leyendo de la
            cédula, carácter a carácter, con la persona delante. */}
        {ficha.documento && (
          <p className="font-mono text-lg text-text-1 tracking-wide">{ficha.documento}</p>
        )}
        {ficha.telefono && <p className="text-xs text-text-3">{ficha.telefono}</p>}
        {ficha.autorizado_por && (
          <p className="text-xs text-text-3 mt-1">Autorizado por {ficha.autorizado_por}</p>
        )}
      </div>
    </div>
  );
}

/* Una sola puerta para pintar el resultado: antes cada sitio decidía por su
   cuenta qué tarjeta tocaba, y añadir un tercer modo significaba acordarse de
   los dos. */
function TarjetaResultado({ result, compact, onCanjear }) {
  if (result.subeventoMode) return <SubeventoCard result={result} compact={compact} />;
  if (result.reingresoMode) return <ReingresoCard result={result} compact={compact} />;
  if (result.puntosMode)    return <PuntosCard result={result} compact={compact} />;
  if (result.canjearMode)   return <CanjearCard result={result} compact={compact} onCanjear={onCanjear} />;
  if (result.entregaMode)   return <EntregaCard result={result} compact={compact} />;
  return <ResultadoCard result={result} compact={compact} />;
}

/* ─────────── Resultado de entregar lo que la boleta incluye ─────────── */

/* Con cien personas en la fila esto es un sí o un no, y el detalle va debajo.
 *
 * El caso que más se ve después del verde es «ya lo recibió», y ahí la hora y
 * el nombre de quien lo entregó no son adorno: son lo que resuelve la
 * conversación con la persona delante, en vez de dejar al operador diciendo
 * «pues aquí me sale que ya». */
function EntregaCard({ result, compact }) {
  const { ok, error, titulo, persona, ventana, avisos = [], ya_entregado, entregado_por, entregado_at, offlineGuardado, yaEstaba } = result;
  const hora = entregado_at
    ? new Date(entregado_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    : null;
  const cls = ok ? 'border-success/40 bg-success/10'
    : ya_entregado ? 'border-warning/40 bg-warning/10' : 'border-danger/40 bg-danger/10';

  return (
    <div className={`rounded-3xl border-2 ${cls} ${compact ? 'backdrop-blur-xl bg-surface/90 p-5' : 'p-6'} animate-[fadeUp_0.3s_cubic-bezier(0.16,1,0.3,1)_both]`}>
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0 text-white ${ok ? 'bg-success' : ya_entregado ? 'bg-warning' : 'bg-danger'}`}>
          {ok ? '✓' : ya_entregado ? '!' : '✕'}
        </div>
        <div className="min-w-0">
          {ok ? (
            <>
              <h3 className="text-xl font-bold font-display text-text-1 truncate">
                {offlineGuardado ? (titulo || 'Guardado') : titulo}
              </h3>
              <p className="text-sm text-text-2 truncate">
                {offlineGuardado
                  ? (yaEstaba ? 'Ya estaba guardado, se manda al volver la red.' : 'Sin conexión: se manda al volver la red.')
                  : <>{persona}{ventana && <span className="text-text-3"> · {ventana}</span>}</>}
              </p>
            </>
          ) : (
            <>
              <h3 className="text-xl font-bold font-display text-text-1">
                {ya_entregado ? 'Ya lo recibió' : 'No se pudo entregar'}
              </h3>
              <p className="text-sm text-text-2">{error}</p>
              {/* Quién y cuándo: sin esto, «ya lo recibió» es una discusión. */}
              {ya_entregado && (entregado_por || hora) && (
                <p className="text-xs text-text-3 mt-0.5">
                  {hora && <>a las {hora}</>}{entregado_por && <> · se lo entregó {entregado_por}</>}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Fuera de franja y por encima del cupo se entrega igual: son avisos, y
          por eso van debajo del verde y no en lugar de él. */}
      {avisos.length > 0 && (
        <ul className="mt-3 space-y-1">
          {avisos.map((a, i) => (
            <li key={i} className="text-xs text-warning">· {a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─────────── Resultado de dar puntos ─────────── */

function PuntosCard({ result, compact }) {
  const { ok, error, motivo, ticket, saldo } = result;
  const neg = motivo?.tipo === 'negativo';
  const cls = !ok ? 'border-danger/40 bg-danger/10'
    : neg ? 'border-warning/40 bg-warning/10' : 'border-success/40 bg-success/10';
  return (
    <div className={`rounded-3xl border-2 ${cls} ${compact ? 'backdrop-blur-xl bg-surface/90 p-5' : 'p-6'} animate-[fadeUp_0.3s_cubic-bezier(0.16,1,0.3,1)_both]`}>
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0 text-white ${!ok ? 'bg-danger' : neg ? 'bg-warning' : 'bg-success'}`}>
          {ok ? (neg ? '−' : '+') : '✕'}
        </div>
        <div className="min-w-0">
          {!ok ? (
            <><h3 className="text-xl font-bold font-display text-text-1">No se pudo marcar</h3>
              <p className="text-sm text-text-2">{error}</p></>
          ) : (
            <>
              <h3 className="text-xl font-bold font-display text-text-1 truncate">
                {ticket?.nombre || ticket?.guest_nombre || 'Asistente'}
              </h3>
              <p className="text-sm text-text-2">
                {motivo?.nombre}
                {saldo != null && <span className="text-text-3"> · saldo {saldo} pts</span>}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────── Canjear: primero el saldo, después el premio ─────────── */

function CanjearCard({ result, compact, onCanjear }) {
  const { ok, error, saldoInfo, canjeHecho } = result;
  if (!ok) return (
    <div className={`rounded-3xl border-2 border-danger/40 ${compact ? 'backdrop-blur-xl bg-surface/90 p-5' : 'bg-danger/10 p-6'}`}>
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-danger text-white flex items-center justify-center text-2xl font-bold flex-shrink-0">✕</div>
        <div><h3 className="text-xl font-bold font-display text-text-1">No se pudo leer</h3><p className="text-sm text-text-2">{error}</p></div>
      </div>
    </div>
  );
  if (canjeHecho) return (
    <div className={`rounded-3xl border-2 border-success/40 ${compact ? 'backdrop-blur-xl bg-surface/90 p-5' : 'bg-success/10 p-6'}`}>
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-success text-white flex items-center justify-center text-2xl font-bold flex-shrink-0">✓</div>
        <div className="min-w-0">
          <h3 className="text-xl font-bold font-display text-text-1 truncate">{canjeHecho.titulo}</h3>
          <p className="text-sm text-text-2">
            Canjeado{canjeHecho.codigo ? <> · código <b className="font-mono text-text-1">{canjeHecho.codigo}</b></> : null}
          </p>
        </div>
      </div>
    </div>
  );

  const t = saldoInfo?.ticket;
  const premios = saldoInfo?.recompensas || [];
  return (
    <div className={`rounded-3xl border-2 border-primary/40 ${compact ? 'backdrop-blur-xl bg-surface/90 p-5' : 'bg-primary/5 p-6'} space-y-3`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-bold font-display text-text-1 truncate">{t?.nombre || 'Asistente'}</h3>
        <span className="text-lg font-bold tabular-nums text-text-1 flex-shrink-0">{saldoInfo?.saldo ?? 0} pts</span>
      </div>
      {premios.length === 0 ? (
        <p className="text-sm text-text-3">Este evento no tiene premios definidos todavía.</p>
      ) : (
        <ul className="space-y-1.5">
          {premios.map(r => (
            <li key={r.id} className="flex items-center gap-2 rounded-xl border border-border bg-surface/60 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-1 truncate">{r.titulo}</p>
                <p className="text-[11px] text-text-3">{r.costo_puntos} pts{r.agotada ? ' · agotado' : ''}</p>
              </div>
              <button onClick={() => onCanjear?.(r)} disabled={!r.alcanzable}
                className="btn-primary btn-sm flex-shrink-0 disabled:opacity-40">
                {r.agotada ? 'Agotado' : r.alcanzable ? 'Canjear' : 'No alcanza'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─────────── Resultado de asistencia a un sub-evento ─────────── */

function SubeventoCard({ result, compact }) {
  const { ok, yaMarcada, nombre, conteo, noInscrito, ticket, error } = result;
  const cls = !ok ? (noInscrito ? 'border-warning/40 bg-warning/10' : 'border-danger/40 bg-danger/10')
    : yaMarcada ? 'border-warning/40 bg-warning/10' : 'border-success/40 bg-success/10';
  const icon = !ok ? (noInscrito ? '!' : '✕') : yaMarcada ? '=' : '✓';
  const iconCls = !ok ? (noInscrito ? 'bg-warning text-white' : 'bg-danger text-white')
    : yaMarcada ? 'bg-warning text-white' : 'bg-success text-white';
  const titulo = !ok ? (noInscrito ? 'No está inscrito' : 'No se pudo marcar')
    : yaMarcada ? 'Ya estaba marcada' : 'Asistencia marcada';

  return (
    <div className={`rounded-3xl border-2 ${cls} ${compact ? 'backdrop-blur-xl bg-surface/90 p-5' : 'p-6'} animate-[fadeUp_0.3s_cubic-bezier(0.16,1,0.3,1)_both]`}>
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0 ${iconCls}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold font-display text-text-1 mb-1">{titulo}</h3>
          {nombre && <p className="text-base font-medium text-text-1">{nombre}</p>}
          {ticket && (
            <p className="text-sm text-text-1">
              {ticket.nombre || 'Asistente'}
              {ticket.codigo && <span className="text-xs text-text-3"> · <span className="font-mono">{ticket.codigo}</span></span>}
            </p>
          )}
          {error && <p className="text-sm text-text-2 mt-1">{error}</p>}
          {noInscrito && (
            <p className="text-xs text-text-3 mt-2">
              Entrar al evento no cuenta como asistir a este sub-evento. Regístrala en él y vuelve a escanear.
            </p>
          )}
          {conteo && (
            <p className="text-sm font-semibold text-success mt-2 tabular-nums">
              {conteo.asistieron} de {conteo.inscritos} inscritos ya entraron
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────── Resultado de reingreso ─────────── */

function ReingresoCard({ result, compact }) {
  const ok = result.ok;
  const dentro = result.dentro;
  const cls = !ok ? 'border-danger/40 bg-danger/10' : dentro ? 'border-success/40 bg-success/10' : 'border-warning/40 bg-warning/10';
  const icon = !ok ? '✕' : dentro ? '↳' : '↰';
  const iconCls = !ok ? 'bg-danger text-white' : dentro ? 'bg-success text-white' : 'bg-warning text-white';
  const title = !ok ? 'No se pudo registrar' : dentro ? 'Reingreso registrado' : 'Salida registrada';
  const ticket = result.ticket;
  return (
    <div className={`rounded-3xl border-2 ${cls} ${compact ? 'backdrop-blur-xl bg-surface/90 p-5' : 'p-6'} animate-[fadeUp_0.3s_cubic-bezier(0.16,1,0.3,1)_both]`}>
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0 ${iconCls}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold font-display text-text-1 mb-1">{title}</h3>
          {result.error && <p className="text-sm text-text-2">{result.error}</p>}
          {ticket && (
            <div className="mt-2">
              <p className="text-base font-medium text-text-1">{ticket.nombre || 'Asistente'}</p>
              <p className="text-xs text-text-3">{ticket.tipo} · <span className="font-mono">{ticket.codigo}</span></p>
              {ok && <p className={`text-sm font-semibold mt-2 ${dentro ? 'text-success' : 'text-warning'}`}>{dentro ? 'Ahora está DENTRO' : 'Ahora está FUERA'}</p>}
              {ok && result.aforo && (
                <p className="text-xs text-text-2 mt-1">
                  {result.aforo.nombre}: <b className="tabular-nums text-text-1">{result.aforo.dentro}</b>
                  {result.aforo.aforo_max ? ` / ${result.aforo.aforo_max}` : ''}
                  {result.aforo.excedido > 0 && <span className="text-danger"> · {result.aforo.excedido} por encima del aforo</span>}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────── Historial ─────────── */

function HistorialRow({ item }) {
  const hora = item.at ? new Date(item.at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
  return (
    <div className={`flex items-center gap-3 px-5 py-3 ${!item.ok ? 'opacity-70' : ''}`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${item.ok ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
        {item.ok ? '✓' : '✕'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-1 truncate">{item.guest_nombre || item.guest_email || 'Sin nombre'}</p>
        <p className="text-[11px] text-text-3 truncate font-mono">{item.codigo}{item.reingreso ? ` · ${item.reingreso}` : ''}{item.subevento ? ` · ${item.subevento}` : ''}{item.error ? ` · ${item.error}` : ''}</p>
      </div>
      <span className="text-[11px] text-text-3 tabular-nums flex-shrink-0">{hora}</span>
    </div>
  );
}

