import { useState, useEffect, useMemo, useCallback } from 'react';
import { clientesApi } from '../../../../api/clientes.js';
import ImprimirEtiquetas from '../../../../components/public/ImprimirEtiquetas.jsx';
import EtiquetaTermica from '../../../../components/public/EtiquetaTermica.jsx';
import { LIMITES } from '../../../../lib/etiquetaTermica.js';
import {
  TIPOS_PIEZA, CONTENIDOS_QR, FORMATOS_CODIGO, tipoPieza, piezaDesdeTipo,
  piezasDelEvento, normalizarPieza, revisarPieza, valorQr,
} from '../../../../lib/piezasBranding.js';
import { eventosApi } from '../../../../api/eventos.js';
import { useToast } from '../../../../context/ToastContext.jsx';
import MedirConFoto from './MedirConFoto.jsx';
import { impresionConfig } from '../../../../lib/wallet.js';
import { descargarEtiquetaPng, imprimirComoPng } from '../../../../lib/etiquetaPng.js';
import { qrPng } from '../../../../lib/qrPng.jsx';

/* Asistentes · Imprimir en etiquetadora.
 *
 * La escarapela térmica estaba construida entera —medidas, QR comprobado
 * contra el token real, CSS de impresión, pruebas— y **no colgaba de ninguna
 * pantalla**. Existía en el repositorio y no en la plataforma, que para quien
 * la usa es lo mismo que no existir. Esto es su puerta.
 *
 * ── Por qué es una vista aparte del diseñador ────────────────────────────
 *
 * No es la misma escarapela con otro botón. El diseñador compone una HOJA con
 * varias, a color, para cortar a mano; la etiquetadora saca UNA por etiqueta,
 * a tamaño exacto, en un solo bit —sin grises ni colores—. Mezclarlas obligaría
 * a que el diseñador enseñara opciones que en térmica no hacen nada: el color
 * por tipo, la marca de agua, el logo a color. Una opción que no hace nada es
 * peor que no tenerla.
 *
 * Lo único que se hereda del diseño es lo que sí sobrevive a un bit: el logo
 * (si es silueta) y si se imprime el código en texto. */

export default function EtiquetadoraSection({ evento }) {
  const { success, error: toastErr } = useToast();
  const [clientes, setClientes] = useState([]);
  /* Las piezas del evento. Antes esto era UNA etiqueta, y antes de eso un número
     escrito en el código. Son varias porque el mismo evento saca escarapelas
     para el staff, manillas para los tres días y tarjetas para los
     patrocinadores: otro tamaño, otro rollo y otro contenido cada una. */
  const [piezas, setPiezas] = useState(() => piezasDelEvento(evento));
  const [piezaId, setPiezaId] = useState(() => piezasDelEvento(evento)[0]?.id);
  /* Lo último que confirmó el servidor. Sin esto no hay forma de saber si lo
     que se está viendo ya está guardado: añadir una pieza, ajustar los
     milímetros y cambiar de pestaña se llevaba el trabajo sin decir nada — y
     al volver, la pantalla se veía igual que antes de empezar. */
  const [guardado, setGuardado] = useState(() => JSON.stringify(piezasDelEvento(evento)));
  const sinGuardar = JSON.stringify(piezas) !== guardado;
  const [guardando, setGuardando] = useState(false);
  const [midiendo, setMidiendo] = useState(false);
  const [generandoPng, setGenerandoPng] = useState(false);
  const [imprimiendoPng, setImprimiendoPng] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [sel, setSel] = useState(new Set());
  /* Las dos preguntas del mostrador: «¿a quién le falta la escarapela?» y
     «¿quién se registró hoy?». Se responden sobre la lista que ya está en
     pantalla, así que cambiar de filtro es instantáneo. */
  const [verImpresas, setVerImpresas] = useState('faltan'); // faltan | impresas | todas
  const [cuando, setCuando] = useState('todas');            // hoy | mes | todas

  const cfg = useMemo(
    () => impresionConfig(evento.page_json, { publico: 'asistentes' }) || {},
    [evento.page_json],
  );

  /* ── Que quien acaba de registrarse aparezca ──────────────────────────
   *
   * La lista se pedía UNA vez al abrir la pantalla. En la puerta de FESTECH
   * eso significaba que quien se registraba en el momento no salía hasta
   * recargar la pestaña entera —tres mil boletas, dieciséis peticiones— y
   * mientras tanto se formaba la fila.
   *
   * Ahora hay dos caminos: la carga completa al abrir, y cada minuto una
   * consulta pequeña de las 200 últimas que se mezcla con lo que ya hay.
   * Lo nuevo entra arriba; lo que ya estaba no se vuelve a pedir. */
  const traerTodo = useCallback(() => {
    setLoading(true);
    return clientesApi.listarTodos(evento.id)
      .then(d => setClientes(d.clientes || d.tickets || []))
      .finally(() => setLoading(false));
  }, [evento.id]);

  useEffect(() => { traerTodo(); }, [traerTodo]);

  useEffect(() => {
    let vivo = true;
    const mirarNuevos = () => {
      clientesApi.list(evento.id, { limit: 200, page: 1, stats: 0 })
        .then(d => {
          if (!vivo) return;
          const ultimos = d.clientes || [];
          setClientes(previos => {
            const conocidos = new Set(previos.map(c => c.id));
            const nuevos = ultimos.filter(c => c?.id && !conocidos.has(c.id));
            return nuevos.length ? [...nuevos, ...previos] : previos;
          });
        })
        /* Un fallo aquí no puede vaciar la lista ni molestar: es un extra
           sobre lo que ya está en pantalla. */
        .catch(() => {});
    };
    /* Cada minuto, y no cada quince segundos: son varias estaciones abiertas
       todo el día contra el mismo servidor, y en la puerta lo que se nota es
       que la persona aparezca «enseguida», no que aparezca en quince
       segundos. El botón «Actualizar» está para quien no quiere esperar. */
    const t = setInterval(mirarNuevos, 60000);
    return () => { vivo = false; clearInterval(t); };
  }, [evento.id]);

  /* Busca por nombre, correo, código y tipo: en la puerta se busca por lo que
     la persona dice o por lo que trae escrito, y quien está imprimiendo no
     tiene por qué saber por cuál de los cuatro va a encontrarla. */
  /* El corte de «hoy» y «este mes» se calcula en la hora del EVENTO: en la
     puerta, a las siete de la mañana en Ibagué, «hoy» no puede empezar a
     depender de la zona horaria del portátil de quien imprime. */
  const zona = evento.timezone || 'America/Bogota';
  const diaDe = useCallback((fecha) => {
    if (!fecha) return '';
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date(fecha));
    } catch { return String(fecha).slice(0, 10); }
  }, [zona]);

  const filas = useMemo(() => {
    const busca = filtro.trim().toLowerCase();
    const palabras = busca ? busca.split(/\s+/).filter(Boolean) : [];
    const hoy = diaDe(Date.now());
    const mes = hoy.slice(0, 7);
    return clientes.filter(c => {
      if (verImpresas === 'faltan'   && c.escarapela_impresa_at) return false;
      if (verImpresas === 'impresas' && !c.escarapela_impresa_at) return false;
      if (cuando !== 'todas') {
        const dia = diaDe(c.created_at);
        if (cuando === 'hoy' && dia !== hoy) return false;
        if (cuando === 'mes' && !dia.startsWith(mes)) return false;
      }
      if (!palabras.length) return true;
      const t = [c.guest_nombre, c.usuario?.nombre, c.guest_email, c.usuario?.email, c.codigo, c.tipo?.nombre]
        .filter(Boolean).join(' ').toLowerCase();
      return palabras.every(w => t.includes(w));
    });
  }, [clientes, filtro, verImpresas, cuando, diaDe]);

  /* Cuántas van y cuántas faltan, que es lo que se pregunta cada media hora en
     el mostrador. Sale de la lista completa, no de lo filtrado. */
  const cuenta = useMemo(() => {
    const impresas = clientes.filter(c => c.escarapela_impresa_at).length;
    return { impresas, faltan: clientes.length - impresas, total: clientes.length };
  }, [clientes]);

  const etq = piezas.find(x => x.id === piezaId) || piezas[0];

  const cambiar = (patch) => setPiezas(ps =>
    ps.map(x => (x.id === etq.id ? normalizarPieza({ ...x, ...patch }) : x)));

  const agregar = (tipo) => {
    /* Con las que ya hay: la segunda escarapela se llama «Escarapela 2» en vez
       de quedar como un gemelo indistinguible de la primera. */
    const nueva = piezaDesdeTipo(tipo, piezas);
    setPiezas(ps => [...ps, nueva]);
    setPiezaId(nueva.id);
  };

  const quitar = (id) => {
    /* La última no se borra: sin ninguna pieza esta pantalla no tiene nada que
       enseñar, y «añade una para empezar» es una pregunta que ya contestamos al
       entrar. */
    if (piezas.length <= 1) return;
    setPiezas(ps => ps.filter(x => x.id !== id));
    /* `ps` es el id seleccionado, no la lista: si la que se borra era la
       elegida, se pasa a otra. Nombrarlo `ps` como el otro `setPiezas` de arriba
       era pedir confundirlos. */
    setPiezaId(actual => (actual === id ? piezas.find(x => x.id !== id)?.id : actual));
  };

  const guardarMedidas = async () => {
    setGuardando(true);
    try {
      /* El PATCH mezcla por claves de primer nivel, así que mandar sólo
         `piezas` no pisa el resto de `page_json`. */
      await eventosApi.update(evento.id, { page_json: { piezas } });
      setGuardado(JSON.stringify(piezas));
      success('Guardado. Las próximas impresiones salen así.');
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
    finally { setGuardando(false); }
  };

  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const todos = () => setSel(s => s.size === filas.length ? new Set() : new Set(filas.map(f => f.id)));
  /* ── Qué se imprime ───────────────────────────────────────────────────
   *
   * Antes: «nada seleccionado» significaba TODOS. En la puerta eso se vivía al
   * revés de como se piensa —para imprimir una sola escarapela había que
   * seleccionar todas y luego ir quitando— y con tres mil boletas delante es
   * la diferencia entre una etiqueta y tres mil.
   *
   * Ahora manda lo seleccionado. Sin selección y con una búsqueda escrita, se
   * imprime lo que la búsqueda dejó a la vista, que es lo que se está mirando;
   * sin selección y sin búsqueda no se imprime nada, y el botón lo dice. */
  const aImprimir = sel.size
    ? filas.filter(f => sel.has(f.id))
    : (filtro.trim() ? filas : []);

  /* Baja la vista previa como PNG, a la resolución exacta de la impresora.
   *
   * Para esto existe: cuando el driver de la etiquetadora reescala lo que
   * manda `window.print()` (pasa con el Seagull/BarTender de la SAT TT460
   * si su tamaño de página no coincide con el del navegador), la forma de
   * saber si el DISEÑO está bien —separado del problema del driver— es
   * imprimir esta imagen desde el Visor de fotos de Windows, a tamaño real.
   * Si ahí sale limpia, el diseño no tiene nada que arreglar. */
  const descargarVistaPrevia = async () => {
    setGenerandoPng(true);
    try {
      const ticket = aImprimir[0] || { guest_nombre: 'María Restrepo', guest_email: 'maria@correo.com', codigo: 'ABC123' };
      const ok = await descargarEtiquetaPng({
        etiqueta: etq,
        ticket,
        qrValue: valorQr(etq, ticket),
        logoUrl: cfg.logo_url || '',
        mostrarCodigo: cfg.mostrar?.codigo !== false,
      }, `escarapela-${String(ticket.codigo || 'muestra').replace(/[^\w.-]+/g, '-').slice(0, 60)}`);
      if (!ok) toastErr('No se pudo generar el PNG con estas medidas.');
    } catch (e) { toastErr(e.message); }
    finally { setGenerandoPng(false); }
  };

  /* Solo el QR, sin el resto de la escarapela: para mandarlo suelto —por
   * WhatsApp, por ejemplo— o para probar si el lector lo lee bien aparte del
   * diseño. Usa el mismo generador de canvas que ya usan la boleta del
   * asistente y la tarjeta descargable (`lib/qrPng.jsx`), no uno nuevo.
   *
   * Se dispara la descarga aquí mismo, igual que `descargarEtiquetaPng` más
   * abajo, en vez de llamar a `descargarQrPng`: esa función es sólo para la
   * entrada (boleta/tarjeta), y `tests/entrada.test.mjs` impide llamarla desde
   * fuera de `DescargarEntrada.jsx` a propósito —es la prueba que evita que
   * una pantalla calcule su propio valor de QR para la puerta—. Esta pantalla
   * no es la entrada: es la pieza física de la etiquetadora, con su propio
   * `valorQr` de `piezasBranding.js`, así que sólo toma prestado el trazador
   * de canvas (`qrPng`), no el flujo de la entrada. */
  const descargarQrSuelto = () => {
    const ticket = aImprimir[0] || { guest_nombre: 'María Restrepo', codigo: 'ABC123' };
    const dataUrl = qrPng(valorQr(etq, ticket), 720);
    if (!dataUrl) { toastErr('No se pudo generar el QR.'); return; }
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `qr-${String(ticket.codigo || 'muestra').replace(/[^\w.-]+/g, '-').slice(0, 60)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  /* La alternativa a `window.print()` de más abajo: en vez de mandar el HTML
   * de la escarapela y confiar en que el driver la ponga en el papel tal
   * cual, se genera un PNG por boleta —a 8 px/mm, que a 203 dpi es un punto
   * del cabezal por píxel— y se manda a imprimir esa imagen. Ver
   * `lib/etiquetaPng.js` para el porqué completo. */
  /* Dejar anotado lo que acaba de salir por la impresora.
   *
   * Se hace DESPUÉS de mandar a imprimir y nunca antes: si esto fallara, la
   * escarapela ya salió y lo único que se pierde es la marca. Al revés —marcar
   * y que la impresión falle— dejaría a alguien fuera de la lista de «faltan»
   * sin tener nada en la mano.
   *
   * La respuesta actualiza la lista en memoria para que la fila cambie de
   * grupo en el acto, sin esperar al refresco del minuto. */
  const anotarImpresas = async (tickets) => {
    const ids = tickets.map(t => t.id).filter(Boolean);
    if (!ids.length) return;
    try {
      await clientesApi.marcarImpresas(evento.id, ids);
      const ahora = new Date().toISOString();
      const marcados = new Set(ids);
      setClientes(previos => previos.map(c => (
        marcados.has(c.id) && !c.escarapela_impresa_at ? { ...c, escarapela_impresa_at: ahora } : c
      )));
      setSel(new Set());
    } catch (e) {
      toastErr(`Se imprimieron, pero no se pudo anotar cuáles: ${e.response?.data?.error || e.message}`);
    }
  };

  /* ── Reimprimir la de una persona ─────────────────────────────────────
   *
   * El caso es de la puerta del día 2: alguien vino ayer, hoy llega sin su
   * escarapela y hay fila detrás. Antes había que dejarla seleccionada a ella
   * sola, imprimir, y acordarse de deshacer la selección.
   *
   * `reimprimir: true` es a propósito: la hora y el nombre de quien la imprimió
   * la PRIMERA vez no se pisan, así que después se puede ver quién pasó dos
   * veces por el mostrador — que es justo lo que se mira cuando las escarapelas
   * no cuadran con la gente que entró. */
  const [reimprimiendo, setReimprimiendo] = useState(null);
  const reimprimirUna = async (ticket) => {
    setReimprimiendo(ticket.id);
    try {
      const generadas = await imprimirComoPng({
        etiqueta: etq,
        tickets: [ticket],
        qrDe: (t) => valorQr(etq, t),
        logoUrl: cfg.logo_url || '',
        mostrarCodigo: cfg.mostrar?.codigo !== false,
      });
      if (!generadas) {
        toastErr('No se pudo generar la escarapela — revisa que el navegador no haya bloqueado la ventana emergente.');
        return;
      }
      await clientesApi.marcarImpresas(evento.id, [ticket.id], true);
      success(`Reimpresa la de ${ticket.guest_nombre || ticket.usuario?.nombre || 'la persona'}.`);
    } catch (e) {
      toastErr(e.response?.data?.error || e.message);
    } finally { setReimprimiendo(null); }
  };

  const imprimirEnPapel = () => {
    const tanda = aImprimir;
    window.print();
    anotarImpresas(tanda);
  };

  const imprimirPorPng = async () => {
    setImprimiendoPng(true);
    try {
      const generadas = await imprimirComoPng({
        etiqueta: etq,
        tickets: aImprimir,
        qrDe: (t) => valorQr(etq, t),
        logoUrl: cfg.logo_url || '',
        mostrarCodigo: cfg.mostrar?.codigo !== false,
      });
      if (generadas > 0) await anotarImpresas(aImprimir);
      if (generadas === 0) {
        toastErr('No se pudo generar ninguna escarapela — revisa que el navegador no haya bloqueado la ventana emergente.');
      } else if (generadas < aImprimir.length) {
        toastErr(`Se imprimieron ${generadas} de ${aImprimir.length}: las demás no cabían con estas medidas.`);
      }
    } catch (e) { toastErr(e.message); }
    finally { setImprimiendoPng(false); }
  };

  /* El QR es quien decide si esto se puede imprimir: su tamaño sale del largo
     del token firmado, no del gusto de nadie. Si un token creciera hasta no
     caber, hay que decirlo AQUÍ y no dejar salir del rollo escarapelas
     ilegibles, que además ya cuestan etiqueta y cinta. */
  /* Lo que sale con las medidas de ahora, y si hay algo que arreglar. Se
     comprueba contra un token de muestra cuando todavía no hay boletas, para
     poder armar las piezas antes de vender la primera. */
  const muestra = revisarPieza(etq);
  const problema = muestra.cabe ? null : muestra;

  if (loading) return <p className="text-sm text-text-3 py-8">Cargando asistentes…</p>;

  return (
    <div className="space-y-5">
      <div className="card no-print">
        <div className="card-body space-y-3">
          {/* Las piezas del evento. Cada una es un rollo distinto: se elige
              cuál se está armando y se imprime esa. */}
          <div className="flex items-center gap-2 flex-wrap">
            {piezas.map(pz => (
              <button key={pz.id} onClick={() => setPiezaId(pz.id)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors
                  ${pz.id === etq.id ? 'border-accent bg-accent/10 text-text-1' : 'border-border text-text-3 hover:text-text-1'}`}>
                {pz.nombre}
                <span className="text-text-3 tabular-nums">{pz.ancho}×{pz.alto}</span>
              </button>
            ))}
            {/* Un botón por tipo, y no un desplegable.
                El `<select>` de antes se pintaba como un campo de texto ancho
                al lado de unas fichas pequeñas —desentonaba— y escondía la
                única información que importa aquí: que hay tres piezas
                distintas y en qué se diferencian. Son tres: caben. */}
            <span className="text-text-3 text-xs px-1">Añadir:</span>
            {TIPOS_PIEZA.map(t => (
              <button key={t.id} onClick={() => agregar(t.id)} title={t.pista}
                className="px-2.5 py-1.5 rounded-xl text-xs border border-dashed border-border
                           text-text-3 hover:text-text-1 hover:border-text-3 transition-colors">
                + {t.nombre}
              </button>
            ))}
          </div>

          <p className="text-[11px] text-text-3 leading-relaxed">
            {tipoPieza(etq.tipo).pista}
          </p>

          <p className="text-sm text-text-2">
            Sale <strong>una por etiqueta</strong> del rollo, de {etq.ancho}×{etq.alto} mm,
            en blanco y negro. No es el diseño a color: la impresora térmica sólo
            marca el punto o lo deja en blanco.
          </p>
          <p className="text-xs text-text-3">
            Al imprimir, deja la escala en <strong>100 %</strong> y desmarca «ajustar al área
            imprimible». Si el navegador reescala, el QR pierde definición y el lector de la
            puerta empieza a fallar de vez en cuando, que cuesta más de encontrar que fallar
            siempre.
          </p>

          {/* ── Las medidas del rollo ─────────────────────────────────────
              Esto estaba en el código: 100×50 porque nos lo dijeron por
              WhatsApp. Servía para un rollo y para ninguno más. */}
          <div className="rounded-2xl border border-border bg-surface/40 p-4 space-y-3">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <input value={etq.nombre} onChange={e => cambiar({ nombre: e.target.value })}
                className="input !h-9 text-sm font-semibold w-56" aria-label="Nombre de la pieza" />
              <div className="flex items-center gap-2">
                <button onClick={() => setMidiendo(true)} className="btn-ghost btn-sm">
                  Medir con una foto
                </button>
                {piezas.length > 1 && (
                  <button onClick={() => quitar(etq.id)}
                    className="btn-ghost btn-sm text-danger-light">Quitar</button>
                )}
              </div>
            </div>

            <div className="grid sm:grid-cols-4 gap-3">
              <Campo label="Ancho (mm)" valor={etq.ancho} limites={LIMITES.ancho}
                     onChange={v => cambiar({ ancho: v })} />
              <Campo label="Alto (mm)" valor={etq.alto} limites={LIMITES.alto}
                     onChange={v => cambiar({ alto: v })} />
              <Campo label="QR (mm)" valor={etq.qr_objetivo} limites={LIMITES.qr}
                     onChange={v => cambiar({ qr_objetivo: v })} />
              <Campo label="Margen (mm)" valor={etq.margen} limites={LIMITES.margen}
                     onChange={v => cambiar({ margen: v })} />
            </div>

            {/* Cómo se imprime el código. En una manilla el QR no cabe, así que
                va el serial —y de paso aguanta el roce de tres días—. */}
            <div className="field">
              <label className="label">Cómo se imprime el código</label>
              <div className="flex items-center gap-1 bg-surface-2 border border-border rounded-xl p-1 w-fit">
                {FORMATOS_CODIGO.map(f => (
                  <button key={f.id} onClick={() => cambiar({ formato_codigo: f.id })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                      ${etq.formato_codigo === f.id ? 'bg-surface-3 text-text-1' : 'text-text-3 hover:text-text-2'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-text-3 mt-1.5 leading-relaxed">
                {FORMATOS_CODIGO.find(f => f.id === etq.formato_codigo)?.pista}
              </p>
            </div>

            {/* Qué lleva el QR dentro. Sólo tiene sentido si hay QR. */}
            {etq.formato_codigo === 'qr' && (
            <div className="field">
              <label className="label">Qué lleva el QR</label>
              <div className="flex items-center gap-1 bg-surface-2 border border-border rounded-xl p-1 w-fit">
                {CONTENIDOS_QR.map(c => (
                  <button key={c.id} onClick={() => cambiar({ qr_contenido: c.id })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                      ${etq.qr_contenido === c.id ? 'bg-surface-3 text-text-1' : 'text-text-3 hover:text-text-2'}`}>
                    {c.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-text-3 mt-1.5 leading-relaxed">
                {CONTENIDOS_QR.find(c => c.id === etq.qr_contenido)?.pista}
              </p>
            </div>
            )}

            {etq.formato_codigo === 'qr' && (
            <div className="field">
              <label className="label">Dónde va el QR</label>
              <div className="flex items-center gap-1 bg-surface-2 border border-border rounded-xl p-1 w-fit">
                {[['auto', 'Automático'], ['lado', 'Al lado'], ['debajo', 'Arriba']].map(([k, l]) => (
                  <button key={k} onClick={() => cambiar({ disposicion: k })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                      ${etq.disposicion === k ? 'bg-surface-3 text-text-1' : 'text-text-3 hover:text-text-2'}`}>
                    {l}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-text-3 mt-1.5 leading-relaxed">
                «Automático» pone el QR al lado mientras al nombre le queden 35 mm de ancho —lo que
                necesita un nombre de dos apellidos en dos líneas— y lo sube arriba cuando no. En
                una etiqueta estrecha y alta, al lado no cabría nada.
              </p>
            </div>
            )}

            {/* Lo que queda para el nombre, con las medidas de ahora. Es el
                número que decide si la escarapela se lee de lejos, y hasta
                ahora no se veía en ninguna parte. */}
            <div className="text-xs text-text-2 leading-relaxed">
              Con esto: QR de <b className="text-text-1">{muestra.caja_mm} mm</b>
              {' '}({muestra.puntos_por_modulo} puntos por módulo){' · '}
              al nombre le quedan{' '}
              <b className="text-text-1">{muestra.texto_mm.toFixed(0)} × {muestra.texto_alto_mm.toFixed(0)} mm</b>
              {muestra.disposicion === 'debajo' ? ', con el QR arriba.' : ', con el QR al lado.'}
            </div>

            {muestra.aviso && (
              <p className="text-xs text-warning-light leading-relaxed">{muestra.aviso}</p>
            )}
            {!muestra.cabe && (
              <div className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2">
                <p className="text-xs text-danger-light leading-relaxed">{muestra.motivo}</p>
                {/* Decir «no cabe» sin decir que hay salida deja a alguien
                    creyendo que las manillas no se pueden usar. */}
                {muestra.arreglo && (
                  <p className="text-xs text-text-2 mt-1 leading-relaxed">{muestra.arreglo}</p>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={guardarMedidas} disabled={guardando || !sinGuardar} className="btn-primary btn-sm">
                {guardando ? 'Guardando…' : sinGuardar ? 'Guardar medidas' : 'Guardado'}
              </button>
              {/* Se dice ANTES de salir, no después de haber perdido. Las
                  piezas viven en `page_json` y sólo llegan ahí al guardar. */}
              {sinGuardar && (
                <span className="text-[11px] text-warning">
                  Cambios sin guardar. Si sales ahora, se pierden.
                </span>
              )}
              <button onClick={() => cambiar(piezaDesdeTipo(etq.tipo))} className="btn-ghost btn-sm">
                Volver a las medidas de {tipoPieza(etq.tipo).nombre.toLowerCase()}
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Vista previa a tamaño real: lo que se mira aquí es si el nombre cabe. */}
      <div className="no-print">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <p className="text-xs text-text-3">Así sale, a tamaño real:</p>
          <div className="flex items-center gap-2">
            <button onClick={descargarQrSuelto} disabled={!!problema} className="btn-ghost btn-sm">
              Descargar QR
            </button>
            <button onClick={descargarVistaPrevia} disabled={generandoPng || !!problema} className="btn-ghost btn-sm"
              title="La escarapela como imagen —QR, nombre, código y correo— para imprimirla desde cualquier programa.">
              {generandoPng ? 'Generando…' : 'Descargar escarapela (imagen)'}
            </button>
          </div>
        </div>
        <div className="inline-block bg-white rounded-xl p-2 ring-1 ring-black/10">
          <EtiquetaTermica
            etiqueta={etq}
            ticket={aImprimir[0] || { guest_nombre: 'María Restrepo', guest_email: 'maria@correo.com', codigo: 'ABC123' }}
            qrValue={valorQr(etq, aImprimir[0] || { codigo: 'ABC123' })}
            logoUrl={cfg.logo_url || ''}
            mostrarCodigo={cfg.mostrar?.codigo !== false}
          />
        </div>
        <p className="text-[11px] text-text-3 mt-1.5 leading-relaxed">
          Si al imprimir desde GESTEK sale mal (recortado, chico o corrido), bájate este PNG e
          imprímelo directo desde el visor de fotos: si ahí sale bien, el problema es del driver
          de la impresora ajustando la página, no del diseño.
        </p>
      </div>

      {clientes.length === 0 ? (
        <div className="card p-10 text-center no-print">
          <p className="text-sm text-text-2">Cuando tengas asistentes inscritos podrás imprimir sus escarapelas aquí.</p>
        </div>
      ) : (<>
        {/* Cómo se reparte la lista. Es lo que convierte «tres mil nombres» en
            «los que faltan de hoy», que es con lo que se trabaja en la puerta. */}
        <div className="flex items-center gap-2 flex-wrap no-print">
          {[['faltan', `Faltan ${cuenta.faltan}`], ['impresas', `Impresas ${cuenta.impresas}`], ['todas', `Todas ${cuenta.total}`]].map(([k, l]) => (
            <button key={k} onClick={() => { setVerImpresas(k); setSel(new Set()); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors
                ${verImpresas === k ? 'border-accent bg-accent/10 text-text-1' : 'border-border text-text-3 hover:text-text-1'}`}>
              {l}
            </button>
          ))}
          <span className="text-text-3 px-1">·</span>
          {[['hoy', 'Registrados hoy'], ['mes', 'Este mes'], ['todas', 'Desde siempre']].map(([k, l]) => (
            <button key={k} onClick={() => { setCuando(k); setSel(new Set()); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors
                ${cuando === k ? 'border-accent bg-accent/10 text-text-1' : 'border-border text-text-3 hover:text-text-1'}`}>
              {l}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap no-print">
          <div className="flex items-center gap-2">
            <input className="input !h-9 w-64" placeholder="Buscar por nombre, correo o código…"
              value={filtro} onChange={e => setFiltro(e.target.value)} />
            <button onClick={todos} className="btn-ghost btn-sm">
              {sel.size === filas.length && filas.length ? 'Quitar selección' : `Seleccionar ${filas.length}`}
            </button>
            {/* La lista se refresca sola cada quince segundos; esto es para
                quien tiene a la persona delante y no quiere esperar. */}
            <button onClick={traerTodo} disabled={loading} className="btn-ghost btn-sm">
              {loading ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={imprimirPorPng} disabled={!!problema || imprimiendoPng} className="btn-ghost btn-sm"
              title="Genera un PNG por escarapela y lo manda a imprimir, en vez de mandar el HTML. Úsalo si el driver de la impresora reescala o corta la impresión normal.">
              {imprimiendoPng ? 'Generando…' : 'Imprimir por imagen (PNG)'}
            </button>
            <button onClick={imprimirEnPapel} disabled={!!problema || !aImprimir.length} className="btn-primary btn-sm">
              {aImprimir.length
                ? `Imprimir ${aImprimir.length} etiqueta${aImprimir.length !== 1 ? 's' : ''}`
                : 'Elige a quién imprimir'}
            </button>
          </div>
        </div>

        {problema && (
          <p className="no-print text-sm text-danger-light">No se puede imprimir: {problema.motivo}</p>
        )}

        <div className="no-print rounded-2xl border border-border overflow-hidden max-h-56 overflow-y-auto">
          <ul className="divide-y divide-border">
            {filas.map(f => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2/40 cursor-pointer" onClick={() => toggle(f.id)}>
                <input type="checkbox" readOnly checked={sel.has(f.id)} className="accent-[#8B5CF6]" />
                <span className="text-sm text-text-1 flex-1 truncate">{f.guest_nombre || f.usuario?.nombre || 'Asistente'}</span>
                <span className="text-xs text-text-3 font-mono">{f.codigo || ''}</span>
                {f.escarapela_impresa_at && (
                  <span className="text-[10px] uppercase tracking-wide text-success border border-success/40 rounded-lg px-1.5 py-0.5">impresa</span>
                )}
                <span className="text-xs text-text-3">{f.tipo?.nombre || 'General'}</span>
                {/* Reimprimir sin tocar la selección: quien llega sin su
                    escarapela tiene a alguien detrás en la fila. */}
                <button
                  onClick={(e) => { e.stopPropagation(); reimprimirUna(f); }}
                  disabled={!!problema || reimprimiendo === f.id}
                  title="Volver a imprimir sólo esta escarapela"
                  className="btn-ghost btn-sm !py-0.5 !px-2 text-[11px] flex-shrink-0">
                  {reimprimiendo === f.id ? 'Generando…' : 'Reimprimir'}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <ImprimirEtiquetas
          etiqueta={etq}
          qrDe={(t) => valorQr(etq, t)}
          tickets={aImprimir}
          logoUrl={cfg.logo_url || ''}
          mostrarCodigo={cfg.mostrar?.codigo !== false}
        />
      </>)}

      {/* La tanda entera se monta para que exista al imprimir, pero en pantalla
          no pinta nada: son cien etiquetas a tamaño real una debajo de otra.
          Se oculta con `@media screen` y NO con `no-print`, porque un
          `display:none` de los de siempre tampoco llegaría al papel. */}
      {midiendo && (
        <MedirConFoto
          onCerrar={() => setMidiendo(false)}
          onListo={({ ancho, alto }) => { cambiar({ ancho, alto }); setMidiendo(false); }}
        />
      )}

      <style>{`@media screen { .etiquetas-print { display: none; } }`}</style>
    </div>
  );
}

/* Un número en milímetros, acotado.

   El valor se guarda como texto mientras se escribe: forzar el número en cada
   tecla impide borrar el último dígito —queda `NaN` y salta al mínimo— y hace
   imposible teclear «100» pasando por «1». Se convierte al salir del campo. */
function Campo({ label, valor, limites, onChange }) {
  const [texto, setTexto] = useState(String(valor));

  useEffect(() => { setTexto(String(valor)); }, [valor]);

  return (
    <div className="field">
      <label className="label">{label}</label>
      <input
        type="number" inputMode="decimal" step="0.5"
        min={limites.min} max={limites.max}
        value={texto}
        onChange={e => setTexto(e.target.value)}
        onBlur={() => onChange(texto)}
        className="input !h-9 text-sm tabular-nums" />
    </div>
  );
}
