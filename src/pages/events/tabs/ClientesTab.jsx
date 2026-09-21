import { confirmDialog } from '../../../components/ui/Confirm.jsx';
import { useEffect, useState, useRef } from 'react';
import { useCierreSeguro, alPulsarElFondo } from '../../../components/ui/cierreSeguro.js';
import { createPortal } from 'react-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { QRCodeCanvas } from 'qrcode.react';
import { clientesApi } from '../../../api/clientes.js';
import { useToast } from '../../../context/ToastContext.jsx';
import ImportarAsistentes from '../workspace/asistentes/ImportarAsistentes.jsx';
import RepartoSinCorreo from '../workspace/asistentes/RepartoSinCorreo.jsx';
import Spinner from '../../../components/ui/Spinner.jsx';
import GLoader from '../../../components/ui/GLoader.jsx';
import { exportar } from '../../../lib/hojaEscribir.js';
import { ymdLocal } from '../../../lib/fechaLocal.js';
import DescargarEntrada from '../../../components/public/DescargarEntrada.jsx';
import Icono from '../../../components/ui/Iconos.jsx';
import EnviarEntrada from '../../../components/public/EnviarEntrada.jsx';
import EscarapelaImprimible, { ESTILOS_DE_IMPRESION } from '../../../components/public/EscarapelaImprimible.jsx';

/* Cuántas filas por página.
 *
 * Cincuenta porque es lo que se pidió y porque cabe en una pantalla de
 * portátil sin que la barra de desplazamiento se vuelva un hilo. El servidor
 * acepta hasta 200 por petición; por encima de eso lo que se quiere es la
 * exportación, que va por otro camino. */
const POR_PAGINA = 50;

const ESTADO_LABEL = {
  emitido    : 'Emitido',
  pagado     : 'Pagado',
  usado      : 'Asistió',
  reembolsado: 'Reembolsado',
  invalido   : 'Inválido',
};

/* «Emitido» dice como se creo la boleta, no si hay dinero pendiente. Cubre
   dos cosas que en la lista se ven identicas: una reserva gratuita —apartada
   y perfectamente bien— y una compra que se abandono o cuya tarjeta fue
   rechazada. En un evento con entradas gratis y de pago, quien quiere
   perseguir lo segundo tiene que abrir una por una.
   Se distingue con lo que ya viaja en la fila: que el tipo COSTARA dinero y
   que no se haya pagado. */
export function sinPagar(c) {
  return c?.estado === 'emitido' && Number(c?.tipo?.precio) > 0 && !Number(c?.precio_pagado);
}

const ESTADO_CLS = {
  emitido    : 'bg-warning/10 text-warning border-warning/20',
  pagado     : 'bg-success/10 text-success border-success/20',
  usado      : 'bg-text-1/10 text-text-1 border-border-2',
  reembolsado: 'bg-text-3/10 text-text-2 border-border',
  invalido   : 'bg-danger/10 text-danger border-danger/20',
};

export default function ClientesTab({ evento, puedeBorrar = false }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ]             = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  /* Filtrar por tipo de boleta. Los tipos los manda el servidor con la lista:
     el desplegable tiene que ofrecer exactamente los que esa consulta
     reconoce, y pedirlos aparte es la forma de que un día ofrezca uno borrado
     o se deje fuera el que sí está. */
  const [tipoFilter, setTipoFilter] = useState('');
  /* Qué página se está mirando.
     Antes no había ninguna: el servidor servía las primeras cien y el panel
     las pintaba sin decir que había más. En un evento de 386 boletas la lista
     se acababa en la 100 y no lo decía — quien buscaba a alguien de la mitad
     concluía que no estaba inscrito. */
  const [pagina, setPagina] = useState(1);
  const [importOpen, setImportOpen] = useState(false);

  const [repartoOpen, setRepartoOpen] = useState(false);
  const [detalleCliente, setDetalleCliente] = useState(null);
  const [reembolsando, setReembolsando] = useState(null);
  const [exportando, setExportando] = useState(false);
  const { success, error: toastErr } = useToast();

  /* Exportar de verdad: TODO el evento y CON las respuestas del formulario.

     Lo que había antes exportaba `clientes`, que es sólo la página cargada, con
     ocho columnas fijas y ninguna respuesta. Alguien montaba la ficha de
     caracterización de 22 preguntas, la gente la respondía, y el archivo salía
     sin una sola: los datos por los que se pide el formulario se quedaban
     dentro de la plataforma. Y en un evento de 7.000 personas exportaba las 50
     de la primera página sin decir que faltaban las demás.

     El servidor arma las columnas —una por pregunta, en su orden— porque es
     quien conoce la definición del formulario. */
  /* Respeta el tipo de boleta que esté filtrado en la pantalla.
   *
   * Es lo que espera quien lo pulsa: si estás mirando «PijaoTech», el Excel es
   * de PijaoTech. Exportar el evento entero desde una lista filtrada es la
   * clase de sorpresa que se descubre abriendo el archivo — y para entonces ya
   * se mandó por correo.
   *
   * El estado NO se pasa: filtrar por «sin pagar» en pantalla es para
   * perseguir a alguien, y una hoja que sólo trae a los morosos se confunde
   * con la lista de inscritos. Si hiciera falta, se añade explícitamente. */
  const exportarTodo = async () => {
    setExportando(true);
    try {
      const r = await clientesApi.exportar(evento.id, tipoFilter || undefined);
      if (!r.total) {
        toastErr(r.tipo ? `No hay inscritos en «${r.tipo}».` : 'No hay inscritos todavía.');
        return;
      }
      const { formato } = await exportar([r.columnas, ...r.filas], {
        titulo: r.tipo ? `${r.evento} · ${r.tipo}` : r.evento,
        base: r.slug || r.evento,
        /* El nombre del archivo lleva el tipo: dos descargas del mismo evento
           no pueden llamarse igual en la carpeta de descargas. */
        sufijo: r.tipo ? `inscritos-${r.tipo}` : 'inscritos',
      });
      const deQue = r.tipo ? ` de «${r.tipo}»` : '';
      success(
        formato === 'xlsx'
          ? `${r.total} inscritos${deQue} exportados${r.preguntas ? `, con las ${r.preguntas} preguntas del formulario` : ''}.`
          : `${r.total} inscritos${deQue} en CSV (tu navegador no permite generar Excel).`,
      );
    } catch (e) {
      toastErr(e.response?.data?.error || e.message);
    } finally { setExportando(false); }
  };

  /* La lista COMPLETA, para lo que no puede salir a medias.
   *
   * El PDF de asistentes se armaba con lo que la pantalla tenía cargado. Con
   * paginación eso sería un PDF de 50 filas titulado «Lista de asistentes» —
   * exactamente el tipo de error que no se nota hasta que alguien pasa lista
   * en la puerta con él. Así que se piden todas las páginas antes de
   * generarlo, respetando los filtros que estén puestos: si estás mirando
   * «Sin pagar», el PDF es de los sin pagar.
   *
   * El tope de 200 por petición es del servidor; el `while` recorre las que
   * hagan falta y para en cuanto una vuelve corta. */
  const traerTodos = async () => {
    const POR_TANDA = 200;
    const filtros = {
      ...(q ? { q } : {}),
      ...(estadoFilter ? { estado: estadoFilter } : {}),
      ...(tipoFilter ? { ticket_type_id: tipoFilter } : {}),
    };
    const todos = [];
    for (let p = 1; ; p++) {
      const d = await clientesApi.list(evento.id, { ...filtros, page: p, limit: POR_TANDA });
      const tanda = d.clientes || [];
      todos.push(...tanda);
      /* Se para por lo que llegó, no por el total: si el total cambiara entre
         peticiones —alguien registrándose mientras exportas— un bucle que
         confía en él no termina.
         Y se compara contra lo que el servidor DICE que cabe en una página, no
         contra lo que se pidió: un bucle que pide 500 y compara contra 500 para
         en la primera tanda el día que el tope baja a 200. Eso pasó en
         «Reparto sin correo». */
      if (tanda.length < (d.por_pagina ?? POR_TANDA)) break;
      /* Cinturón: 20 tandas son 4.000 boletas. Más que eso es un caso que
         merece la exportación de verdad, no un PDF. */
      if (p >= 20) break;
    }
    return todos;
  };

  const [armandoPdf, setArmandoPdf] = useState(false);
  const pdfDeTodos = async () => {
    setArmandoPdf(true);
    try {
      const todos = await traerTodos();
      if (!todos.length) { toastErr('No hay nadie que listar con estos filtros.'); return; }
      exportarPDF(todos, evento);
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
    finally { setArmandoPdf(false); }
  };

  const reload = async () => {
    setLoading(true);

    try {
      const d = await clientesApi.list(evento.id, {
        page: pagina,
        limit: POR_PAGINA,
        ...(q ? { q } : {}),
        ...(estadoFilter ? { estado: estadoFilter } : {}),
        ...(tipoFilter ? { ticket_type_id: tipoFilter } : {}),
      });
      setData(d);
    } catch (e) { toastErr(e.message); }
    finally    { setLoading(false); }
  };

  /* Borrar es irreversible y se lleva las respuestas del formulario, así que
     se pide teclear el correo de la persona —o el código, si no tiene correo—.

     No es una traba: un «¿seguro?» se contesta que sí sin leer, se aprende a
     despacharlo, y entonces no protege el día que sí importa. Teclear el correo
     obliga a mirar a QUIÉN se está borrando, que es la única pregunta que hay
     que contestar antes de esto. */
  const borrar = async (c) => {
    const aEscribir = c.guest_email || c.codigo;
    const ok = await confirmDialog({
      title: 'Borrar la boleta',
      message: `Vas a borrar la boleta de ${c.guest_nombre || c.guest_email || 'esta persona'} (${c.codigo}).` + '\n\n'
        + 'Se va con sus respuestas del formulario y no se puede deshacer. '
        + 'Si sólo quieres que no sirva para entrar, márcala como inválida.',
      danger: true,
      confirmLabel: 'Borrar la boleta',
      escribir: aEscribir,
      escribirEtiqueta: c.guest_email
        ? 'Escribe el correo de esta persona para confirmar: {que}'
        : 'Escribe el código de la boleta para confirmar: {que}',
    });
    if (!ok) return;
    try {
      await clientesApi.borrar(evento.id, c.id);
      success(`Boleta ${c.codigo} borrada.`);
      setDetalleCliente(null);
      reload();
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
  };

  useEffect(() => {
    const t = setTimeout(reload, q ? 300 : 0);
    return () => clearTimeout(t);
    /* eslint-disable-next-line */
  }, [evento.id, q, estadoFilter, tipoFilter, pagina]);

  /* Cambiar un filtro vuelve a la página 1, y en el MISMO manejador.
   *
   * Si no, la trampa clásica: estás en la página 5, filtras por «Sin pagar»
   * —que tiene doce— y te queda una página vacía con un «no hay resultados»
   * que es mentira. Y hacerlo en un `useEffect` aparte pediría la lista dos
   * veces, una con la página vieja. Aquí los dos cambios entran en el mismo
   * render. */
  const filtrar = (fn) => { fn(); setPagina(1); };

  const cambiarEstado = async (ticketId, estado) => {
    try {
      await clientesApi.cambiarEstado(evento.id, ticketId, estado);
      success('Estado actualizado.');
      reload();
    } catch (e) { toastErr(e.message); }
  };

  const clientes = data?.clientes || [];
  /* El resumen se calcula recorriendo TODAS las boletas del evento, así que el
     servidor sólo lo manda con la primera página (`stats: null` en las demás).
     Se recuerda el último que llegó: si no, pasar a la página 2 dejaba las
     cuatro tarjetas en cero, que es peor que un número de hace un momento. */
  const statsVistas = useRef(null);
  if (data?.stats) statsVistas.current = data.stats;
  const stats    = data?.stats || statsVistas.current || { total: 0, ingresos: 0 };
  /* Los tipos de boleta llegan con la lista. Si el servidor es viejo y no los
     manda, el filtro no sale — y la lista funciona igual. */
  const tipos    = data?.tipos    || [];
  /* Cuántas hay con los filtros puestos, y en qué tramo vamos.
     `total` es el de la CONSULTA, no el del evento: filtrando por «Sin pagar»
     dice cuántos sin pagar hay, que es lo que se está mirando. `stats.total`
     sigue siendo el del evento entero, y por eso son dos números distintos. */
  const total    = data?.total ?? clientes.length;
  const paginas  = data?.paginas ?? 1;
  const primeraDeLaPagina = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1;
  const ultimaDeLaPagina  = (pagina - 1) * POR_PAGINA + clientes.length;
  const hayFiltro = Boolean(q || estadoFilter || tipoFilter);
  /* Mapa id de campo → etiqueta, para traducir las claves de `respuestas`
     (que se guardan por UUID del campo) a su texto real ("Cédula", "Edad"). */
  const camposFormulario = data?.campos_formulario || [];

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold font-display text-text-1 tracking-tight">Clientes</h2>
          <p className="text-sm text-text-2 mt-1">Personas que han reservado o comprado boletas para este evento.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={pdfDeTodos}
            disabled={clientes.length === 0 || armandoPdf}
            className="btn-secondary btn-sm"
            title="Descarga un PDF con TODA la lista que coincide con los filtros, no sólo esta página">
            {armandoPdf
              ? <><Spinner size="sm" /> Armando…</>
              : <><PdfIcon className="w-3.5 h-3.5" /> Exportar PDF</>}
          </button>
          <button
            onClick={exportarTodo}
            disabled={exportando}
            className="btn-secondary btn-sm"
            title={tipoFilter
              ? 'Los inscritos de la boleta que tienes filtrada, con sus respuestas, en Excel'
              : 'Todos los inscritos del evento, con las respuestas del formulario, en Excel'}>
            {exportando
              ? <><Spinner size="sm" /> Exportando…</>
              : <><DownloadIcon className="w-3.5 h-3.5" /> Exportar Excel</>}
          </button>
          <button onClick={() => setImportOpen(true)} className="btn-secondary btn-sm"
            title="Excel o CSV, con mapeo de columnas a las preguntas del formulario">
            <UploadIcon className="w-3.5 h-3.5" /> Importar Excel
          </button>
          {/* La salida si el correo no llega a tiempo: imprimir y repartir a mano. */}
          <button onClick={() => setRepartoOpen(true)} className="btn-secondary btn-sm"
            disabled={clientes.length === 0}
            title="Imprimir invitaciones con QR o mandarlas por WhatsApp, sin depender del correo">
            Reparto sin correo
          </button>
        </div>
      </div>

      {/* Stats compactos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox label="Total"        value={stats.total} />
        <StatBox label="Pagados"      value={stats.pagado || 0} />
        <StatBox label="Asistieron"   value={stats.usado || 0} />
        <StatBox label="Ingresos"     value={`$${Math.round(stats.ingresos).toLocaleString('es-CO')}`} hint={evento.currency} />
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none" />
          <input
            value={q} onChange={e => filtrar(() => setQ(e.target.value))}
            placeholder="Nombre, cédula, correo o código…"
            className="input rounded-2xl py-2.5 pl-10 text-sm"
          />
        </div>
        {/* Por tipo de boleta.
            Los tipos SON las actividades en la mayoría de los eventos —
            «Registro», «PijaoTech», «DemoDay»— así que sin este filtro, para
            saber quién va a una hay que leer 386 filas mirando la columna de
            la derecha. El servidor ya lo aceptaba (`ticket_type_id`); lo que
            no había era dónde elegirlo.
            Sólo si hay más de uno: con uno solo, filtrar por él es no
            filtrar. */}
        {tipos.length > 1 && (
          <select
            value={tipoFilter} onChange={e => filtrar(() => setTipoFilter(e.target.value))}
            className="input bg-surface-2 rounded-2xl py-2.5 text-sm w-auto"
          >
            <option value="">Todas las boletas</option>
            {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        )}
        <select
          value={estadoFilter} onChange={e => filtrar(() => setEstadoFilter(e.target.value))}
          className="input bg-surface-2 rounded-2xl py-2.5 text-sm w-auto"
        >
          <option value="">Todos los estados</option>
          {/* No es un estado de la boleta, es la pregunta que se hace de
              verdad: quien empezo una compra y no la termino. Va arriba
              porque es lo unico de esta lista sobre lo que se puede actuar. */}
          <option value="sin_pagar">Sin pagar</option>
          {Object.entries(ESTADO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Lista */}
      {loading ? (
        <GLoader message="Cargando clientes..." />
      ) : clientes.length === 0 ? (
        <EmptyState hasFilter={hayFiltro} filtroSinPagar={estadoFilter === 'sin_pagar' && !q && !tipoFilter} />
      ) : (
        <div className="rounded-3xl border border-border bg-surface/40 overflow-hidden">
          {clientes.map((c, i) => (
            <ClienteRow
              key={c.id}
              cliente={c}
              currency={evento.currency}
              onCambiarEstado={(e) => cambiarEstado(c.id, e)}
              onReembolsar={() => setReembolsando(c)}
              onVerDetalle={() => setDetalleCliente(c)}
              onBorrar={puedeBorrar ? () => borrar(c) : null}
              style={{ animationDelay: `${i * 25}ms` }}
            />
          ))}
        </div>
      )}

      {/* El paginador.
          Va después de la lista y no antes: al llegar al final es cuando hace
          falta. Y dice el tramo —«51-100 de 386»— porque el número que
          importa no es en qué página estás, es cuánta lista queda: antes se
          servían las primeras cien y la lista simplemente se acababa, sin
          decir que faltaban 286. */}
      {!loading && paginas > 1 && (
        <div className="flex items-center justify-between gap-3 flex-wrap px-1">
          <p className="text-xs text-text-3 tabular-nums">
            {primeraDeLaPagina}–{ultimaDeLaPagina} de {total}
            {hayFiltro && <span className="text-text-2"> · filtrado</span>}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPagina(p => Math.max(1, p - 1))}
              disabled={pagina <= 1}
              className="btn-secondary btn-sm">
              Anterior
            </button>
            <span className="text-xs text-text-3 tabular-nums px-1">
              {pagina} / {paginas}
            </span>
            <button
              onClick={() => setPagina(p => Math.min(paginas, p + 1))}
              disabled={pagina >= paginas}
              className="btn-secondary btn-sm">
              Siguiente
            </button>
          </div>
        </div>
      )}

      {importOpen && (
        <ImportarAsistentes
          evento={evento}
          onClose={() => setImportOpen(false)}
          onDone={() => { reload(); }}
        />
      )}

      {repartoOpen && (
        <RepartoSinCorreo evento={evento} onClose={() => setRepartoOpen(false)} />
      )}

      {reembolsando && (
        <ReembolsoModal
          evento={evento}
          cliente={reembolsando}
          onClose={() => setReembolsando(null)}
          onHecho={() => { setReembolsando(null); reload(); }}
        />
      )}

      {detalleCliente && (
        <DetalleModal
          cliente={detalleCliente}
          evento={evento}
          currency={evento.currency}
          camposFormulario={camposFormulario}
          onClose={() => setDetalleCliente(null)}
        />
      )}
    </div>
  );
}

function StatBox({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/40 px-4 py-3.5">
      <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">{label}</p>
      <p className="text-2xl font-bold font-display text-text-1 tabular-nums mt-1 leading-none">{value}</p>
      {hint && <p className="text-[10px] text-text-3 mt-1 lowercase">{hint}</p>}
    </div>
  );
}

function ClienteRow({ cliente, currency, onCambiarEstado, onReembolsar, onVerDetalle, onBorrar, style }) {
  const [openMenu, setOpenMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const nombre = cliente.usuario?.nombre || cliente.guest_nombre || cliente.guest_email;
  const email  = cliente.usuario?.email || cliente.guest_email;
  const initials = (nombre || 'U').split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
  const fecha = new Date(cliente.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

  const toggleMenu = () => {
    if (!openMenu && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const menuWidth = 176; // w-44
      setMenuPos({
        top : r.bottom + 6,
        left: Math.min(r.right - menuWidth, window.innerWidth - menuWidth - 8),
      });
    }
    setOpenMenu(v => !v);
  };

  return (
    <div
      className="flex items-center gap-3 px-5 py-3.5 border-b border-border last:border-0 hover:bg-surface-2/30 transition-colors animate-[fadeUp_0.3s_ease_both] group"
      style={style}
    >
      <button
        onClick={onVerDetalle}
        className="w-10 h-10 rounded-xl overflow-hidden bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-semibold text-xs flex-shrink-0 hover:opacity-80 transition-opacity"
        title="Ver información completa"
      >
        {cliente.usuario?.avatar_url
          ? <img src={cliente.usuario.avatar_url} alt="" className="w-full h-full object-cover" />
          : initials}
      </button>

      <button onClick={onVerDetalle} className="flex-1 min-w-0 text-left">
        <p className="text-sm font-medium text-text-1 truncate hover:text-primary-light transition-colors">{nombre}</p>
        <p className="text-xs text-text-3 truncate">{email}</p>
      </button>

      <div className="hidden md:block text-right">
        <p className="text-xs font-medium text-text-1">{cliente.tipo?.nombre || '—'}</p>
        <p className="text-[11px] text-text-3 tabular-nums">
          {cliente.precio_pagado != null
            ? (Number(cliente.precio_pagado) === 0 ? 'Gratis' : `$${Number(cliente.precio_pagado).toLocaleString('es-CO')} ${currency}`)
            : 'Pendiente'}
        </p>
      </div>

      <div className="hidden lg:block">
        <p className="text-[10px] uppercase tracking-wider text-text-3">Código</p>
        <p className="font-mono text-xs text-text-2 tabular-nums">{cliente.codigo}</p>
      </div>

      <div className="hidden sm:block text-right text-[11px] text-text-3 tabular-nums w-20">{fecha}</div>

      <span className={`text-[10px] uppercase tracking-widest font-semibold px-2.5 py-1 rounded-full border ${
        sinPagar(cliente) ? 'bg-warning/10 text-warning border-warning/30' : (ESTADO_CLS[cliente.estado] || ESTADO_CLS.emitido)}`}>
        {sinPagar(cliente) ? 'Sin pagar' : (ESTADO_LABEL[cliente.estado] || cliente.estado)}
      </span>

      <button
        onClick={onVerDetalle}
        aria-label="Ver detalle"
        title="Ver información completa"
        className="w-8 h-8 rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-2 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <EyeIcon className="w-4 h-4" />
      </button>

      <div className="relative">
        <button
          ref={btnRef}
          onClick={toggleMenu}
          aria-label="Acciones"
          className="w-8 h-8 rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-2 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <DotsIcon className="w-4 h-4" />
        </button>
        {openMenu && createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(false)} />
            <div
              className="fixed z-50 w-44 rounded-2xl border border-border-2 bg-surface shadow-2xl py-1 animate-[scaleIn_0.15s_ease_both] origin-top-right"
              style={{ top: menuPos.top, left: menuPos.left }}
            >
              {/* Reembolsar sale del menú de estados y se pone aparte.

                  Estaba ahí dentro, como una opción más entre «marcar como
                  emitido» y «marcar como inválido»: el mismo gesto para cambiar
                  una etiqueta que para devolver un pago. Ahora pide motivo, deja
                  rastro y avisa de lo único que la gente da por hecho —que la
                  plataforma NO mueve el dinero—. */}
              {Object.entries(ESTADO_LABEL)
                .filter(([k]) => k !== 'reembolsado')
                .map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => { onCambiarEstado(k); setOpenMenu(false); }}
                    disabled={cliente.estado === k}
                    className="w-full px-3 py-2 text-left text-sm text-text-2 hover:text-text-1 hover:bg-surface-2 disabled:text-text-3 disabled:bg-surface-2/50 transition-colors"
                  >
                    Marcar como {label.toLowerCase()}
                  </button>
                ))}

              {['pagado', 'usado'].includes(cliente.estado) && (
                <button
                  onClick={() => { setOpenMenu(false); onReembolsar?.(); }}
                  className="w-full px-3 py-2 text-left text-sm text-warning-light hover:bg-surface-2 transition-colors border-t border-border mt-1 pt-2"
                >
                  Reembolsar…
                </button>
              )}

              {/* Borrar va la última y con línea propia: es lo único de este
                  menú que no se puede deshacer, y ponerla entre los «marcar
                  como…» la haría un clic vecino de cambiar una etiqueta. */}
              {onBorrar && (
                <button
                  onClick={() => { setOpenMenu(false); onBorrar(); }}
                  className="w-full px-3 py-2 text-left text-sm text-danger-light hover:bg-danger/10 transition-colors border-t border-border mt-1 pt-2"
                >
                  Borrar boleta…
                </button>
              )}
            </div>
          </>,
          document.body
        )}
      </div>
    </div>
  );
}

/* ─────────── Detalle de un asistente (incluye QR + formulario que diligenció) ─────────── */
function DetalleModal({ cliente, evento = {}, currency, camposFormulario, onClose }) {
  const nombre = cliente.usuario?.nombre || cliente.guest_nombre || cliente.guest_email;
  const email  = cliente.usuario?.email || cliente.guest_email;
  const initials = (nombre || 'U').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const qrCanvasRef = useRef(null);
  /* El QR codifica lo mismo que usa el escáner de Check-in: el qr_token
     firmado si existe, o el código de la boleta como respaldo. */
  const qrValue = cliente.qr_token || cliente.codigo;


  /* respuestas se guarda como { "<id_del_campo>": valor }. Usamos el id
     para buscar la etiqueta real en camposFormulario (ej. "Cédula", "Edad")
     en vez de mostrar el UUID crudo. Si algún id ya no existe en la
     definición actual del formulario, mostramos "Pregunta eliminada" como
     respaldo en vez de ocultar la respuesta. */
  const respuestas = cliente.respuestas;
  const mapaCampos = new Map((camposFormulario || []).map(c => [c.id, c]));

  let filas = [];
  if (Array.isArray(respuestas)) {
    filas = respuestas.map(r => ({ etiqueta: r.pregunta || r.label || 'Pregunta', valor: r.respuesta ?? r.value }));
  } else if (respuestas && typeof respuestas === 'object') {
    filas = Object.entries(respuestas)
      .map(([campoId, valor]) => {
        const campo = mapaCampos.get(campoId);
        return { etiqueta: campo?.etiqueta || 'Pregunta eliminada', valor, campoId, orden: campo?.orden ?? 999 };
      })
      .sort((a, b) => a.orden - b.orden);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-bg/70 backdrop-blur-md animate-[fadeIn_0.2s_ease_both]"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border-t sm:border border-border-2 bg-surface shadow-2xl max-h-[88vh] overflow-y-auto animate-[authCardIn_0.35s_cubic-bezier(0.16,1,0.3,1)_both]"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-surface px-5 py-4 border-b border-border flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl overflow-hidden bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
            {cliente.usuario?.avatar_url
              ? <img src={cliente.usuario.avatar_url} alt="" className="w-full h-full object-cover" />
              : initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-widest text-text-3 font-semibold">Detalle del asistente</p>
            <h2 className="text-lg font-bold font-display tracking-tight text-text-1 truncate">{nombre}</h2>
          </div>
          <button onClick={onClose} aria-label="Cerrar"
            className="w-9 h-9 rounded-xl text-text-3 hover:text-text-1 hover:bg-surface-2 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* QR de la boleta + descarga */}
          <div className="flex flex-col items-center gap-3 py-2">
            <div ref={qrCanvasRef} className="bg-white rounded-2xl p-4 inline-block">
              <QRCodeCanvas value={qrValue} size={160} level="M" includeMargin={false} />
            </div>
            <p className="font-mono text-sm font-bold text-text-1 tabular-nums tracking-widest">{cliente.codigo}</p>

            {/* Aquí sólo se podía bajar el QR —una imagen suelta, sin nombre, sin
                evento y sin instrucciones—, mientras el asistente tiene desde
                hace tiempo su tarjeta, su PDF y su QR en `/mi-ticket`. El panel
                se había quedado con la mitad más pobre de lo que ya existía, y
                escrita a mano por cuarta vez.

                Son los mismos componentes que usa el público, así que lo que el
                organizador manda es exactamente lo que la persona recibiría por
                su cuenta —mismo QR incluido, que es lo que evita el papel que no
                abre ninguna puerta—. */}
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <DescargarEntrada
                evento={evento}
                ticket={cliente}
                qrValue={qrValue}
                respuestas={cliente.respuestas}
                campos={camposFormulario}
                etiqueta="Descargar"
              />
              <EnviarEntrada evento={evento} ticket={cliente} qrValue={qrValue} />
              {/* Imprimir, que faltaba. El día del evento, con alguien delante
                  que llegó sin teléfono, lo que hace falta es papel — y aquí
                  sólo se podía descargar o mandar un correo que esa persona no
                  va a abrir en la fila.

                  Es la MISMA escarapela que se imprime desde `/mi-ticket`: una
                  segunda se separaría, y la que se separa es la que acaba en la
                  mano de alguien en la puerta. */}
              <button type="button" onClick={() => window.print()}
                className="btn-ghost btn-sm inline-flex items-center gap-1.5"
                title="Imprime la escarapela con su QR">
                <Icono nombre="imprimir" className="w-4 h-4" />Imprimir
              </button>
            </div>
            <EscarapelaImprimible ticket={{ ...cliente, evento }} qrValue={qrValue} />
            <style>{ESTILOS_DE_IMPRESION}</style>
          </div>

          <div className="rounded-2xl border border-border bg-surface/40 p-4 space-y-2.5">
            <DetalleRow label="Email" value={email} />
            <DetalleRow label="Código" value={cliente.codigo} mono />
            <DetalleRow label="Tipo de boleta" value={cliente.tipo?.nombre || '—'} />
            <DetalleRow label="Estado" value={ESTADO_LABEL[cliente.estado] || cliente.estado} />
            <DetalleRow
              label="Precio pagado"
              value={cliente.precio_pagado != null
                ? (Number(cliente.precio_pagado) === 0 ? 'Gratis' : `$${Number(cliente.precio_pagado).toLocaleString('es-CO')} ${currency || ''}`)
                : 'Pendiente'}
            />
            <DetalleRow label="Reservado el" value={new Date(cliente.created_at).toLocaleString('es-CO')} />
            {cliente.checked_in_at && (
              <DetalleRow label="Ingresó el" value={new Date(cliente.checked_in_at).toLocaleString('es-CO')} />
            )}
            {/* POR DÓNDE entró, no sólo cuándo.
                El servidor manda `acceso` (la puerta) y `zona_usada` desde
                siempre y no los leía nadie. Es lo primero que se pregunta
                cuando alguien reclama —«dice que no la dejaron pasar»— y hasta
                ahora había que ir al reporte de zonas y cruzarlo a mano. */}
            {cliente.acceso && <DetalleRow label="Entró por" value={cliente.acceso} />}
            {cliente.zona_usada && <DetalleRow label="Zona" value={cliente.zona_usada} />}
          </div>

          <div>
            <p className="text-xs uppercase tracking-widest text-text-3 font-semibold mb-2">Formulario que diligenció</p>
            {filas.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-surface/40 px-4 py-6 text-center">
                <p className="text-sm text-text-3">Este evento no tiene preguntas personalizadas, o la persona no respondió ninguna.</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-surface/40 divide-y divide-border overflow-hidden">
                {filas.map((f, i) => (
                  <div key={i} className="px-4 py-3">
                    <p className="text-xs text-text-3 mb-0.5">{f.etiqueta}</p>
                    {/* Un archivo sensible NO tiene enlace: en la respuesta hay
                        una referencia, no una URL. Se abre pidiendo al servidor
                        un enlace firmado que caduca — y ahí queda registrado
                        quién lo vio, que es la otra mitad de tratarlo como
                        sensible. Pintar la referencia cruda enseñaría
                        «privado:evt/campo-123.pdf», que parece un dato roto. */}
                    {typeof f.valor === 'string' && f.valor.startsWith('privado:') ? (
                      <AbrirArchivoPrivado eventoId={evento.id} ticketId={cliente.id} campoId={f.campoId} />
                    ) : typeof f.valor === 'string' && /^https?:\/\/.*\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(f.valor) ? (
                      <div className="mt-1">
                        <img src={f.valor} alt={f.etiqueta} className="w-full max-w-xs rounded-xl border border-border object-cover" />
                        <a href={f.valor} download target="_blank" rel="noreferrer"
                          className="inline-block text-xs text-primary-light hover:underline mt-1.5">
                          Descargar imagen
                        </a>
                      </div>
                    ) : (
                      <p className="text-sm text-text-1 leading-relaxed">
                        {Array.isArray(f.valor) ? f.valor.join(', ') : (f.valor || f.valor === 0 ? String(f.valor) : '—')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function DetalleRow({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-text-3">{label}</span>
      <span className={`text-sm text-text-1 text-right truncate ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function EmptyState({ hasFilter, filtroSinPagar = false }) {
  return (
    <div className="rounded-3xl border border-border bg-surface/40 px-6 py-16 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-surface border border-border mb-4">
        <UsersIcon className="w-6 h-6 text-text-2" />
      </div>
      <h2 className="text-lg font-bold font-display text-text-1 tracking-tight mb-1">
        {/* Buscar «sin pagar» y no encontrar a nadie no es «sin resultados»:
            es la respuesta que se queria. Decirlo como un vacio hace dudar de
            si el filtro funciono. */}
        {filtroSinPagar ? 'Nadie dejó un pago a medias' : hasFilter ? 'Sin resultados' : 'Aún no hay clientes'}
      </h2>
      <p className="text-sm text-text-2 leading-relaxed max-w-sm mx-auto">
        {filtroSinPagar
          ? 'Todas las boletas de pago de este evento están cobradas.'
          : hasFilter
          ? 'Ningún cliente coincide con los filtros. Cambia la búsqueda o el estado.'
          : 'Cuando alguien reserve o compre una boleta, aparecerá aquí. Comparte el link de tu evento para empezar.'}
      </p>
    </div>
  );
}

function exportarPDF(clientes, evento) {
  if (!clientes?.length) return;

  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFontSize(15);
  doc.text(evento?.titulo || 'Lista de asistentes', 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generado el ${new Date().toLocaleDateString('es-CO')} · ${clientes.length} registro${clientes.length === 1 ? '' : 's'}`, 14, 22);
  doc.setTextColor(0);

  const rows = clientes.map(c => [
    c.usuario?.nombre || c.guest_nombre || '—',
    c.usuario?.email || c.guest_email || '—',
    c.tipo?.nombre || '—',
    c.codigo,
    ESTADO_LABEL[c.estado] || c.estado,
  ]);

  autoTable(doc, {
    startY: 28,
    head: [['Nombre', 'Email', 'Tipo de boleta', 'Código', 'Estado']],
    body: rows,
    styles: { fontSize: 8.5, cellPadding: 3 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  const slug = (evento?.slug || 'evento').replace(/[^a-z0-9-]/gi, '-');
  /* Local, no UTC: exportar a las 8 de la noche nombraba el archivo con la
     fecha de mañana, y ese nombre es lo que luego se usa para saber de qué día
     es el corte. */
  const fecha = ymdLocal(new Date());
  doc.save(`asistentes-${slug}-${fecha}.pdf`);
}

function DownloadIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 11l5 5m0 0l5-5m-5 5V4" /></svg>;
}

function UploadIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12" /></svg>;
}

function PdfIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
}

function EyeIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
}

function SearchIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
}
function UsersIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-3a4 4 0 11-8 0 4 4 0 018 0zm5-1a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
}
function DotsIcon({ className }) {
  return <svg className={className} fill="currentColor" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>;
}

/* Reembolsar, con el aviso que la gente da por hecho al revés.
 *
 * ── Lo que hay que decir, y decirlo antes ────────────────────────────────
 *
 * Quien pulsa «reembolsar» en un panel supone que el panel devuelve el dinero.
 * No lo hace, y no puede: el dinero está en Mercado Pago o en Wompi, con sus
 * credenciales y sus plazos. Lo que hace la plataforma es dejar constancia —la
 * boleta deja de servir, el cupo se libera y se le ofrece a quien espera, y
 * queda escrito quién y por qué—.
 *
 * Ese aviso va ARRIBA y no en letra pequeña al final: si se lee después de
 * pulsar, ya no sirve de nada.
 *
 * ── Y por qué pide motivo ────────────────────────────────────────────────
 *
 * Porque un reembolso se pregunta un mes después —«¿por qué se le devolvió a
 * éste?»— y el estado solo no lo contesta. Es opcional a propósito: obligar a
 * escribir con alguien esperando produce «asd», que es peor que el vacío.
 */

/* Abrir un archivo marcado como sensible.
 *
 * No hay enlace que pintar: en la respuesta vive una referencia, no una URL.
 * Se pide al servidor uno firmado —que comprueba el permiso, dura diez minutos
 * y deja anotado quién lo abrió— y se abre en otra pestaña.
 *
 * Se pide al PULSAR y no al abrir la ficha: cargarla no es querer ver el
 * documento de nadie, y firmar por adelantado dejaría un enlace vivo en la
 * memoria del navegador cada vez que alguien mira una boleta.
 */
function AbrirArchivoPrivado({ eventoId, ticketId, campoId }) {
  const [abriendo, setAbriendo] = useState(false);
  const [err, setErr] = useState('');

  const abrir = async () => {
    setAbriendo(true); setErr('');
    try {
      const d = await clientesApi.archivoPrivado(eventoId, ticketId, campoId);
      window.open(d.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally { setAbriendo(false); }
  };

  return (
    <div className="mt-1">
      <button type="button" onClick={abrir} disabled={abriendo} className="btn-secondary btn-sm">
        {abriendo ? 'Abriendo…' : 'Abrir archivo'}
      </button>
      <p className="text-[11px] text-text-3 mt-1">
        Guardado en privado. El enlace dura unos minutos y queda registrado quién lo abrió.
      </p>
      {err && <p className="text-[11px] text-danger-light mt-1">{err}</p>}
    </div>
  );
}

function ReembolsoModal({ evento, cliente, onClose, onHecho }) {
  const [motivo, setMotivo] = useState('');
  const [working, setWorking] = useState(false);
  const { success, error: toastErr } = useToast();
  /* El motivo del reembolso se escribe a mano y es lo unico que queda dicho de
     por que se devolvio el dinero. Rozar el fondo lo borraba. */
  const cerrar = useCierreSeguro(Boolean(motivo.trim()), onClose);

  const nombre = cliente.usuario?.nombre || cliente.guest_nombre || cliente.guest_email || 'esta persona';
  const monto = Number(cliente.precio_pagado) || 0;

  const confirmar = async () => {
    setWorking(true);
    try {
      const r = await clientesApi.reembolsar(evento.id, cliente.id, motivo);
      success(r.aviso || 'Reembolso registrado.');
      onHecho();
    } catch (e) {
      toastErr(e.response?.data?.error || e.message);
    } finally { setWorking(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={alPulsarElFondo(cerrar)}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden"
           onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-text-1">Reembolsar la boleta de {nombre}</h3>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-2xl border border-warning/30 bg-warning/5 px-4 py-3">
            <p className="text-sm text-text-1 font-medium">Esto no devuelve el dinero.</p>
            <p className="text-xs text-text-2 mt-1 leading-relaxed">
              El dinero se devuelve desde Mercado Pago o Wompi, con sus plazos. Aquí queda
              registrado: la boleta deja de servir en la puerta y su cupo se libera para quien
              esté en lista de espera.
            </p>
          </div>

          {monto > 0 && (
            <p className="text-sm text-text-2">
              Se cobraron <b className="text-text-1 tabular-nums">${monto.toLocaleString('es-CO')}</b>.
            </p>
          )}

          <div className="field">
            <label className="label">Motivo <span className="lowercase tracking-normal font-normal text-text-3">(opcional)</span></label>
            <input value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder="Pidió cancelar, cobro duplicado…" className="input" />
            <p className="text-[11px] text-text-3 mt-1.5">
              Dentro de un mes, «¿por qué se le devolvió a éste?» no lo contesta el estado.
            </p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost btn-sm">Cancelar</button>
          <button onClick={confirmar} disabled={working} className="btn-primary btn-sm">
            {working ? 'Registrando…' : 'Registrar el reembolso'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
