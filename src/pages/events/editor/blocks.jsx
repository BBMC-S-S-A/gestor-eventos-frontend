/* Catálogo de bloques.
   - SYSTEM blocks: contenido viene del evento (data solo guarda ajustes como oculto)
   - CUSTOM blocks: contenido vive en data del bloque
   Cada uno expone: label, icon, defaults, Editor, Preview, category. */

import { useState, useEffect, lazy, Suspense } from 'react';
import { textoDuracion } from '../../../lib/vigenciaDuracion.js';
import { numeroDeStand } from '../../../lib/expositoresUi.js';
import { agruparBoletas } from '../../../lib/rolDeBoleta.js';
import { Seccion, ControlesPresentacion, Grupo, Opciones, Interruptor } from './presentacion.jsx';
import ImagePicker from '../../../components/ui/ImagePicker.jsx';
import { COVER_ASPECTOS, coverLayout } from '../../../components/public/EventChrome.jsx';
import { tipoEspacio } from '../../../lib/espacio.js';
import LlamaZona from '../../../components/aforo/LlamaZona.jsx';
import MarcadorMapa from '../../../components/mapa/MarcadorMapa.jsx';

/* Reordenar arrastrando en la vista previa: sólo cuando el editor lo pide.
 *
 * `@dnd-kit` son 16 kB comprimidos, y este archivo lo importan CUATRO páginas
 * públicas — así que el formulario de registro metido en la web de un cliente
 * se descargaba una librería de arrastrar y soltar para no arrastrar nada.
 * Medido en el paquete construido: el trozo del embebido la traía.
 *
 * Con el `import()` perezoso, el módulo sólo se pide cuando `reorder` viene —
 * y `reorder` sólo lo manda el editor.
 *
 * El `fallback` de cada `Suspense` no es un giro de carga: es la MISMA lista
 * sin poder arrastrarla todavía. Así no hay salto ni hueco mientras llega, y
 * es exactamente lo que ve el público. */
const PreviewReorder = lazy(() => import('./PreviewReorder.jsx'));

/* `arrayMove` venía de dnd-kit y era lo único que quedaba atándonos a la
   librería desde aquí. Son tres líneas y no depender de ella es lo que hace
   que el público no la descargue. */
function moverEn(lista, de, a) {
  const copia = [...lista];
  copia.splice(a, 0, copia.splice(de, 1)[0]);
  return copia;
}

/* ─────────── helpers ─────────── */

/* La cabecera de una sección pública, una sola vez.
 *
 * ── Lo que había ─────────────────────────────────────────────────
 *
 * Doce bloques escribían su propio título, con **cuatro tamaños distintos**
 * (`text-2xl`, `text-2xl sm:text-3xl`, uno centrado, uno enorme) y **tres
 * separaciones distintas** debajo (`mb-2`, `mb-4`, `mb-5`). Nadie decidió eso:
 * se fue acumulando, un bloque cada vez, copiando el de al lado y ajustando a
 * ojo. El resultado es una página donde cada sección empieza con un ritmo
 * distinto —y eso es la mitad de lo que hace que una página «se vea mal» sin
 * que se pueda señalar qué está mal.
 *
 * Aquí hay un tamaño y un ritmo. Lo único que varía es lo que tenía motivo:
 * centrar —una llamada a la acción se centra, un directorio no—.
 *
 * El subtítulo va con el título y no suelto: separarlos era lo que producía
 * `mb-2` en unos sitios y `mb-5` en otros según si había subtítulo o no. */
/* Y el hueco ENTRE secciones lo pone la página, no el bloque.
 *
 * Cuatro de los doce se envolvían en `<section className="py-4">`, encima del
 * `space-y-8` que ya pone la página pública. Así que esos cuatro —premios,
 * expositores, mapa y torneos— quedaban separados 2 rem más que los demás. Son
 * los huecos grandes que se venían en el evento real, y no eran de diseño:
 * eran dos capas sumando margen sin saber la una de la otra.
 *
 * El elemento `<section>` se queda, que eso sí dice algo; lo que se va es el
 * relleno. */
/* El hueco que sólo ve quien monta la página.
 *
 * ── Por qué hacía falta ──────────────────────────────────────────────────
 *
 * Doce bloques devolvían `null` cuando no tenían nada que enseñar, y lo
 * devolvían para TODOS — también para el editor. El efecto: añades «Speakers»,
 * el bloque se pinta con alto cero y queda una franja invisible que no se puede
 * pulsar. El bloque está ahí, guardado en la página, y no hay forma de
 * seleccionarlo para llenarlo. La única salida era borrarlo y empezar de nuevo.
 *
 * Así que el vacío se enseña a quien monta y se esconde a quien visita. Es la
 * regla que ya seguían la portada, la descripción, la dirección, los enlaces,
 * la galería y las boletas; estos doce se habían quedado fuera.
 *
 * ── Por qué uno solo y no doce huecos ────────────────────────────────────
 *
 * Porque doce huecos escritos por separado acaban con doce bordes, doce
 * radios y doce maneras de decir lo mismo — que es exactamente cómo esta
 * página llegó a tener secciones que no se parecen entre sí.
 */
function VacioEditor({ titulo, pista }) {
  return (
    <div className="rounded-2xl border border-dashed border-border-2 bg-surface/20 px-5 py-8 text-center">
      <p className="text-sm text-text-2 font-medium">{titulo}</p>
      {pista && <p className="text-xs text-text-3 mt-1.5 max-w-sm mx-auto leading-relaxed">{pista}</p>}
      <p className="text-[10px] uppercase tracking-widest text-text-3 mt-3">Sólo lo ves tú, aquí</p>
    </div>
  );
}

function CabeceraSeccion({ titulo, subtitulo, centrado = false }) {
  if (!titulo && !subtitulo) return null;
  return (
    <div className={`${subtitulo ? 'mb-5' : 'mb-4'} ${centrado ? 'text-center' : ''}`}>
      {titulo && (
        <h2 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-text-1">{titulo}</h2>
      )}
      {subtitulo && (
        <p className={`text-sm text-text-2 leading-relaxed mt-2 ${centrado ? 'mx-auto' : ''} max-w-2xl`}>
          {subtitulo}
        </p>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return <div className="text-text-3 text-xs italic">[{title}]</div>;
}

function HiddenNotice({ label }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/20 px-4 py-3 text-xs text-text-3 text-center">
      Bloque oculto: <strong>{label}</strong> · activa &quot;Mostrar&quot; para que aparezca en la página pública.
    </div>
  );
}

function VisibilityToggle({ data, onChange }) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-text-2 cursor-pointer select-none">
      <input
        type="checkbox" checked={!data.oculto}
        onChange={e => onChange({ ...data, oculto: !e.target.checked })}
        className="w-3.5 h-3.5 rounded border-border bg-surface-2 accent-primary"
      />
      Mostrar en página pública
    </label>
  );
}

/* Las fechas, en la hora DEL EVENTO y no en la de quien mira.
 *
 * `toLocaleString` sin zona usa la del navegador. Para quien está en Ibagué
 * mirando un evento en Ibagué da igual; para quien lo mira desde Madrid, la
 * página decía una hora y la puerta abría a otra — siete horas después.
 *
 * `timezone` llegaba del servidor en cada evento desde siempre y no lo leía
 * nadie. Se cae al comportamiento de antes si el evento no la trae, que es lo
 * único que se puede hacer sin inventarse una zona.
 */
function conZona(evento, opts) {
  const tz = evento?.timezone;
  return tz ? { ...opts, timeZone: tz } : opts;
}
function fmtFecha(d, opts, evento) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('es-CO',
    conZona(evento, opts || { day: '2-digit', month: 'long', year: 'numeric' }));
}
function fmtHora(d, evento) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('es-CO',
    conZona(evento, { hour: '2-digit', minute: '2-digit' }));
}

/* ============================================================
   SYSTEM BLOCKS — content from evento
   ============================================================ */

/* PORTADA — cover + galería en visor */
function PortadaPreview({ data, evento, isEditor }) {
  const urls = [];
  if (evento.cover_url) urls.push(evento.cover_url);
  for (const u of (evento.gallery || [])) if (!urls.includes(u)) urls.push(u);

  const [active, setActive] = useState(0);

  if (urls.length === 0) {
    if (!isEditor) return null;
    return (
      <div className="aspect-video rounded-3xl border border-dashed border-border bg-surface/20 flex items-center justify-center">
        {/* «Editar info administrativa» no existe en ninguna parte del panel:
            es un nombre de una versión anterior. Quien lea esto va a buscarlo y
            no lo va a encontrar. El sitio real es Configuración → General →
            «Editar información completa». */}
        <span className="text-xs text-text-3 text-center px-6 leading-relaxed">
          Sin portada. Se sube en <strong className="text-text-2">Configuración → General → Editar información completa</strong>.
        </span>
      </div>
    );
  }

  return (
    <div>
      <div className="aspect-video rounded-3xl border border-border bg-gradient-to-br from-primary/20 via-accent/10 to-bg overflow-hidden">
        <img src={urls[active]} alt={evento.titulo} className="w-full h-full object-cover" />
      </div>
      {urls.length > 1 && (
        <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar pb-1">
          {urls.map((u, i) => (
            <button key={u + i} onClick={() => setActive(i)}
              className={`flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 transition-all
                ${i === active ? 'border-primary scale-100 ring-2 ring-primary/30' : 'border-border opacity-70 hover:opacity-100 scale-95 hover:scale-100'}
              `}>
              <img src={u} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* TITULO — categoria + titulo grande */
const TAMANOS_TITULO = {
  m:  'text-2xl sm:text-3xl',
  l:  'text-3xl sm:text-4xl',
  xl: 'text-4xl sm:text-6xl',
};

function TituloPreview({ data = {}, evento }) {
  const tamano = TAMANOS_TITULO[data.tamano] || TAMANOS_TITULO.l;
  const verCategoria = data.mostrar_categoria !== false;
  return (
    <Seccion data={data}>
      {verCategoria && (
        <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">
          {data.antetitulo || evento.categoria?.nombre || 'Evento'}
        </p>
      )}
      <h1 className={`${tamano} font-bold font-display tracking-tight text-text-1 leading-[1.05]`}>
        {evento.titulo}
      </h1>
      {data.subtitulo && (
        <p className="mt-3 text-lg text-text-2 leading-relaxed">{data.subtitulo}</p>
      )}
    </Seccion>
  );
}

function TituloEditor({ data = {}, onChange, evento }) {
  return (
    <EditorSistema data={data} onChange={onChange} evento={evento} Preview={TituloPreview} label="Título">
      <Grupo label="Tamaño">
        <Opciones valor={data.tamano || 'l'} onChange={(v) => onChange({ ...data, tamano: v })}
          opciones={[['m', 'Mediano'], ['l', 'Grande'], ['xl', 'Enorme']]} />
      </Grupo>
      <Grupo label="Antetítulo">
        <input value={data.antetitulo || ''} onChange={(e) => onChange({ ...data, antetitulo: e.target.value })}
          placeholder={evento.categoria?.nombre || 'Evento'} className="input rounded-xl py-2 text-sm" />
      </Grupo>
      <Grupo label="Subtítulo">
        <input value={data.subtitulo || ''} onChange={(e) => onChange({ ...data, subtitulo: e.target.value })}
          placeholder="Opcional — una línea que acompañe al título" className="input rounded-xl py-2 text-sm" />
      </Grupo>
      <Interruptor label="Mostrar el antetítulo" valor={data.mostrar_categoria !== false}
        onChange={(v) => onChange({ ...data, mostrar_categoria: v })} />
    </EditorSistema>
  );
}

/* DESCRIPCION */
function DescripcionPreview({ data = {}, evento, isEditor }) {
  if (!evento.descripcion) {
    if (!isEditor) return null;
    return <p className="text-sm text-text-3 italic">Sin descripción. Se agrega en Configuración → General → «Editar información completa».</p>;
  }
  const tamano = { s: 'text-sm', m: 'text-base', l: 'text-lg' }[data.tamano] || 'text-base';
  const dosColumnas = data.columnas === 2;
  return (
    <Seccion data={data}>
      <p className={`${tamano} text-text-2 leading-relaxed whitespace-pre-line ${dosColumnas ? 'sm:columns-2 sm:gap-10' : ''}`}>
        {evento.descripcion}
      </p>
    </Seccion>
  );
}

function DescripcionEditor({ data = {}, onChange, evento }) {
  return (
    <EditorSistema data={data} onChange={onChange} evento={evento} Preview={DescripcionPreview} label="Descripción">
      <Grupo label="Tamaño del texto">
        <Opciones valor={data.tamano || 'm'} onChange={(v) => onChange({ ...data, tamano: v })}
          opciones={[['s', 'Pequeño'], ['m', 'Normal'], ['l', 'Grande']]} />
      </Grupo>
      <Grupo label="Columnas">
        <Opciones valor={data.columnas || 1} onChange={(v) => onChange({ ...data, columnas: v })}
          opciones={[[1, 'Una'], [2, 'Dos']]} />
      </Grupo>
    </EditorSistema>
  );
}

function GaleriaEventoEditor({ data = {}, onChange, evento }) {
  return (
    <EditorSistema data={data} onChange={onChange} evento={evento} Preview={GaleriaEventoPreview} label="Galería del evento">
      <Grupo label="Encabezado">
        <input value={data.encabezado || ''} onChange={(e) => onChange({ ...data, encabezado: e.target.value })}
          placeholder="Galería del evento" className="input rounded-xl py-2 text-sm" />
      </Grupo>
      <Grupo label="Columnas">
        <Opciones valor={data.columnas || 3} onChange={(v) => onChange({ ...data, columnas: v })}
          opciones={[[2, 'Dos'], [3, 'Tres'], [4, 'Cuatro']]} />
      </Grupo>
    </EditorSistema>
  );
}

function LinksEditor({ data = {}, onChange, evento }) {
  return (
    <EditorSistema data={data} onChange={onChange} evento={evento} Preview={LinksPreview} label="Links">
      <Grupo label="Encabezado">
        <input value={data.encabezado || ''} onChange={(e) => onChange({ ...data, encabezado: e.target.value })}
          placeholder="Links del evento" className="input rounded-xl py-2 text-sm" />
      </Grupo>
    </EditorSistema>
  );
}

/* INFO — grid */
const CAMPOS_INFO = [
  ['fecha',      'Fecha'],
  ['lugar',      'Lugar'],
  ['modalidad',  'Modalidad'],
  ['organiza',   'Organiza'],
  ['aforo',      'Cupos disponibles'],
  /* Se puede apagar, pero nace encendida: una condición para entrar que sólo
     aparece al final del formulario de pago no es una condición, es una
     sorpresa. */
  ['edad',       'Edad mínima'],
];

function InfoPreview({ data = {}, evento, isEditor }) {
  const fecha = evento.fecha_fin
    ? `${fmtFecha(evento.fecha_inicio, null, evento)} — ${fmtFecha(evento.fecha_fin, null, evento)}`
    : `${fmtFecha(evento.fecha_inicio, null, evento)} · ${fmtHora(evento.fecha_inicio, evento)}`;
  const modalidad = { fisico: 'Físico', virtual: 'Virtual', hibrido: 'Híbrido' }[evento.modalidad] || evento.modalidad;
  /* Por defecto se muestran los cuatro de siempre; aforo entra solo si se pide. */
  /* `edad` entra por defecto —es una condición para entrar, no un extra— y
     desaparece sola si el evento no la tiene. `aforo` sigue siendo opcional. */
  const activos = data.campos || ['fecha', 'lugar', 'modalidad', 'organiza', 'edad'];
  const libres = Math.max(0, (evento.aforo_total || 0) - (evento.aforo_vendido || 0));

  const celdas = [
    ['fecha',     'Fecha',     evento.fecha_inicio ? fecha : null],
    ['lugar',     'Lugar',     evento.location_nombre],
    ['modalidad', 'Modalidad', modalidad],
    ['organiza',  'Organiza',  evento.organizador?.empresa || evento.organizador?.nombre],
    ['aforo',     'Cupos',     evento.aforo_total ? `${libres} de ${evento.aforo_total}` : null],
    /* La edad mínima estaba SÓLO en el paso de pago, como una casilla que
       confirmar. O sea que alguien miraba el evento, decidía ir, rellenaba
       veinte preguntas y se enteraba al final de que no podía entrar. Es una
       condición para venir, y las condiciones para venir van con la fecha y el
       lugar, no al final del formulario. */
    ['edad',      'Edad mínima', evento.edad_minima > 0 ? `${evento.edad_minima} años` : null],
  ].filter(([id, , valor]) => activos.includes(id) && valor);

  /* Un evento sin fecha, sin lugar y sin organizador pintaba la rejilla vacía:
     el hueco de cuatro casillas sin una sola casilla. Es el mismo caso que los
     demás bloques —el vacío se enseña a quien monta y se esconde a quien
     visita—, sólo que aquí los datos no se escriben en el bloque sino en la
     ficha del evento, y por eso la pista manda allí. */
  if (celdas.length === 0) {
    if (!isEditor) return null;
    return <VacioEditor titulo="Sin datos que enseñar"
      pista="La fecha, el lugar y quién organiza salen de la ficha del evento, no de aquí. Se rellenan en Configuración → General → «Editar información completa»." />;
  }

  const disposicion = data.disposicion || 'rejilla';
  const clase = disposicion === 'lista' ? 'flex flex-col gap-2'
    : disposicion === 'fila' ? 'flex flex-wrap gap-3'
    : 'grid sm:grid-cols-2 gap-3';

  return (
    <Seccion data={data}>
      <div className={clase}>
        {celdas.map(([id, label, valor]) => (
          <InfoCell key={id} label={label} value={valor} plano={data.sin_caja} />
        ))}
      </div>
    </Seccion>
  );
}

function InfoEditor({ data = {}, onChange, evento }) {
  const activos = data.campos || ['fecha', 'lugar', 'modalidad', 'organiza'];
  const alternar = (id) => {
    const siguiente = activos.includes(id) ? activos.filter(x => x !== id) : [...activos, id];
    onChange({ ...data, campos: siguiente });
  };
  return (
    <EditorSistema data={data} onChange={onChange} evento={evento} Preview={InfoPreview} label="Información">
      <Grupo label="Qué se muestra">
        <div className="grid grid-cols-2 gap-1.5">
          {CAMPOS_INFO.map(([id, label]) => (
            <button key={id} onClick={() => alternar(id)} aria-pressed={activos.includes(id)}
              className={`px-2.5 py-2 rounded-xl text-[12px] font-medium border transition-colors ${
                activos.includes(id) ? 'border-accent bg-accent/12 text-text-1'
                                     : 'border-border text-text-3 hover:text-text-1 hover:bg-surface-2'}`}>
              {label}
            </button>
          ))}
        </div>
      </Grupo>
      <Grupo label="Disposición">
        <Opciones valor={data.disposicion || 'rejilla'} onChange={(v) => onChange({ ...data, disposicion: v })}
          opciones={[['rejilla', 'Rejilla'], ['lista', 'Lista'], ['fila', 'En fila']]} />
      </Grupo>
      <Interruptor label="Sin recuadro" nota="Los datos se ven sueltos, sin tarjeta detrás."
        valor={!!data.sin_caja} onChange={(v) => onChange({ ...data, sin_caja: v })} />
    </EditorSistema>
  );
}
function InfoCell({ label, value, plano = false }) {
  if (plano) {
    return (
      <div>
        <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">{label}</p>
        <p className="text-sm text-text-1 mt-0.5">{value}</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-surface/40 px-4 py-3">
      <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">{label}</p>
      <p className="text-sm text-text-1 mt-0.5">{value}</p>
    </div>
  );
}

/* DIRECCION */
function DireccionPreview({ data = {}, evento, isEditor }) {
  if (!evento.location_direccion) {
    if (!isEditor) return null;
    return <p className="text-sm text-text-3 italic">Sin dirección configurada.</p>;
  }
  const consulta = encodeURIComponent(
    [evento.location_nombre, evento.location_direccion].filter(Boolean).join(', ')
  );
  return (
    <Seccion data={data}>
      {evento.location_nombre && (
        <p className="text-base font-semibold text-text-1 mb-1">{evento.location_nombre}</p>
      )}
      <p className="text-sm text-text-2">{evento.location_direccion}</p>
      {data.boton_como_llegar !== false && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${consulta}`}
          target="_blank" rel="noreferrer noopener"
          /* `py-2.5` en móvil: medía 21 px de alto y esto se pulsa yendo de
             camino al sitio, andando y con una mano. Con el ratón 21 va bien,
             así que el aire sólo se añade donde se toca con el dedo. */
          className="inline-flex items-center gap-1.5 mt-3 py-2.5 sm:py-0 text-sm font-medium text-primary hover:underline"
        >
          {data.texto_boton || 'Cómo llegar'} →
        </a>
      )}
    </Seccion>
  );
}

function DireccionEditor({ data = {}, onChange, evento }) {
  return (
    <EditorSistema data={data} onChange={onChange} evento={evento} Preview={DireccionPreview} label="Dirección">
      <Interruptor label='Botón "Cómo llegar"' nota="Abre la dirección en Google Maps."
        valor={data.boton_como_llegar !== false}
        onChange={(v) => onChange({ ...data, boton_como_llegar: v })} />
      {data.boton_como_llegar !== false && (
        <Grupo label="Texto del botón">
          <input value={data.texto_boton || ''} onChange={(e) => onChange({ ...data, texto_boton: e.target.value })}
            placeholder="Cómo llegar" className="input rounded-xl py-2 text-sm" />
        </Grupo>
      )}
    </EditorSistema>
  );
}

function TicketsEditor({ data = {}, onChange, evento }) {
  return (
    <EditorSistema data={data} onChange={onChange} evento={evento} Preview={TicketsPreview} label="Boletas">
      <Grupo label="Encabezado">
        <input value={data.encabezado || ''} onChange={(e) => onChange({ ...data, encabezado: e.target.value })}
          placeholder="Boletas disponibles" className="input rounded-xl py-2 text-sm" />
      </Grupo>
      <Grupo label="Disposicion">
        <Opciones valor={data.columnas || 1} onChange={(v) => onChange({ ...data, columnas: v })}
          opciones={[[1, 'Una columna'], [2, 'Dos columnas']]} />
      </Grupo>
      <Grupo label="Texto del boton">
        <input value={data.texto_boton || ''} onChange={(e) => onChange({ ...data, texto_boton: e.target.value })}
          placeholder="Regístrate" className="input rounded-xl py-2 text-sm" />
      </Grupo>
    </EditorSistema>
  );
}

/* LINKS */
function LinksPreview({ data, evento, isEditor }) {
  const links = evento.links || [];
  if (links.length === 0) {
    if (!isEditor) return null;
    return <p className="text-sm text-text-3 italic">Sin links configurados.</p>;
  }
  return (
    <Seccion data={data}>
      <p className="text-xs uppercase tracking-widest text-text-3 font-semibold mb-3">
        {data?.encabezado || 'Links del evento'}
      </p>
      <div className={`flex flex-wrap gap-2 ${data?.alineacion === 'centro' ? 'justify-center' : ''}`}>
        {links.map((l, i) => (
          <a key={i} href={l.url} target="_blank" rel="noreferrer noopener"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border border-border bg-surface/40 hover:bg-surface hover:border-border-2 text-sm text-text-1 transition-all">
            <span className="text-xs uppercase tracking-wider text-text-3">{l.tipo}</span>
            <span className="truncate max-w-[200px]">{l.label || l.url.replace(/^https?:\/\//, '')}</span>
          </a>
        ))}
      </div>
    </Seccion>
  );
}

/* GALERIA DEL EVENTO — solo el gallery (sin cover) en grid */
function GaleriaEventoPreview({ data, evento, isEditor }) {
  const urls = evento.gallery || [];
  if (urls.length === 0) {
    if (!isEditor) return null;
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface/20 px-4 py-6 text-center">
        <p className="text-sm text-text-2 font-medium">Sin galería configurada</p>
        <p className="text-xs text-text-3 mt-1">Las imágenes se suben en Configuración → General → «Editar información completa».</p>
      </div>
    );
  }
  const columnas = { 2: 'grid-cols-2', 3: 'grid-cols-2 sm:grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-4' }[data?.columnas] || 'grid-cols-2 sm:grid-cols-3';
  return (
    <Seccion data={data}>
      <p className="text-xs uppercase tracking-widest text-text-3 font-semibold mb-3">
        {data?.encabezado || 'Galería del evento'}
      </p>
      <div className={`grid ${columnas} gap-3`}>
        {urls.map((u, i) => (
          <a key={i} href={u} target="_blank" rel="noreferrer noopener"
            className="aspect-square rounded-2xl overflow-hidden border border-border hover:border-border-2 transition-all hover:scale-[1.02]">
            <img src={u} alt="" loading="lazy" className="w-full h-full object-cover" />
          </a>
        ))}
      </div>
    </Seccion>
  );
}

/* TICKETS */
function TicketsPreview({ data, evento, onReservar, onWaitlist, isEditor }) {
  const tickets = (evento.ticket_types || evento.tipos_ticket || []).filter(t => t.activo);

  /* Un evento cancelado no vende. El servidor ya rechaza las cuatro rutas de
     compra, así que esto no es el candado: es no hacerle rellenar veinte
     preguntas y un captcha a alguien para decirle al final que no. El aviso de
     por qué está arriba del todo de la página. */
  if (evento.cancelado && !isEditor) return null;
  if (tickets.length === 0) {
    /* Aquí NO se esconde, y es la excepción a la regla del resto de bloques.
     *
     * Esconder un bloque vacío está bien cuando es un adorno —una galería sin
     * fotos, unos patrocinadores sin logos—: quien visita no pierde nada. Pero
     * éste es la única puerta de entrada, y sin él la página queda entera
     * —descripción, galería, «cómo llegar»— y sin un solo sitio donde
     * inscribirse. Quien lee todo y se decide no encuentra qué pulsar, y lo que
     * concluye es que la página está rota.
     *
     * Está pasando ahora mismo: FESTECH ESPINAL, publicado, con la página
     * completa y cero tipos de boleta activos. Los únicos botones son
     * «Compartir» y «¿Ya te registraste?» — que además da a entender que el
     * registro existe en alguna parte.
     *
     * Así que se dice. «Todavía no» es la verdad tanto si aún no se crearon
     * como si se desactivaron, y a diferencia del silencio invita a volver. */
    if (!isEditor) {
      return (
        <section className="rounded-3xl border border-dashed border-border bg-surface/30 px-6 py-8 text-center">
          <p className="text-sm text-text-1 font-medium">Las inscripciones todavía no están abiertas.</p>
          <p className="text-xs text-text-3 mt-1 max-w-sm mx-auto leading-relaxed">
            Vuelve a mirar más cerca de la fecha, o escribe a quien organiza si necesitas tu lugar antes.
          </p>
        </section>
      );
    }
    return (
      <div className="rounded-3xl border border-dashed border-border bg-surface/20 p-5">
        <p className="text-xs uppercase tracking-widest text-text-3 mb-2">Boletas</p>
        <p className="text-base font-medium text-text-2">Sin tipos de ticket configurados</p>
        <p className="text-xs text-text-3 mt-1">Crea tipos de boleta desde la tab Tickets.</p>
      </div>
    );
  }
  const dosColumnas = data?.columnas === 2;

  /* Un evento tiene DOS puertas, y hasta ahora aquí sólo se miraba una.
   *
   * El backend las mira las dos (`hayCupoLibre`, en `lib/waitlistOferta.js`):
   * el cupo del tipo de boleta y el aforo general del evento. Aquí sólo se
   * miraba `t.cupo`, así que con el aforo general lleno el botón seguía
   * diciendo «Comprar»: la persona rellenaba el formulario entero —que puede
   * tener veinte preguntas—, pasaba el captcha, y el servidor la rechazaba en
   * el último paso. El peor sitio posible para enterarse.
   *
   * Con esto, además, se enciende sola la lista de espera: el botón
   * «Anotarme en lista» de abajo ya existía y sólo aparece cuando `agotado`,
   * que hasta ahora nunca era cierto por esta vía.
   *
   * Ojo con lo que este cálculo NO puede saber: `hayCupoLibre` descuenta
   * también las ofertas de lista de espera vivas, y ésas no viajan al público.
   * Así que esto puede decir «hay sitio» cuando la última plaza está
   * reservada. Da igual: el servidor sigue siendo el que manda, y lo que se
   * arregla aquí es no dejar que alguien rellene todo cuando está lleno de
   * forma evidente. */
  const aforoLleno = Boolean(evento?.aforo_total)
    && (evento.aforo_vendido || 0) >= evento.aforo_total;

  /* `null` cuando no hay que agrupar, que es el caso normal. */
  const grupos = agruparBoletas(tickets);

  return (
    <Seccion data={data}>
      <div className="rounded-3xl border border-border-2 bg-surface/60 p-5 space-y-3">
      <p className="text-xs uppercase tracking-widest text-text-3 font-semibold">
        {data?.encabezado || 'Boletas disponibles'}
      </p>
      {/* Agrupadas cuando hay de qué: la entrada al evento arriba, las
          actividades debajo y con su aviso. Si todas son entradas —el caso
          normal— se pinta la lista de siempre, sin encabezados.

          La tarjeta es UNA y se usa en los dos caminos. Escribirla dos veces
          —una para la lista agrupada y otra para la plana— es cómo se acaban
          comportando distinto sin que nadie lo note. */}
      {grupos ? (
        <div className="space-y-5">
          {grupos.map(g => (
            <div key={g.rol}>
              <p className="text-[11px] uppercase tracking-widest text-text-2 font-semibold">{g.titulo}</p>
              {g.ayuda && <p className="text-[11px] text-warning mt-0.5 mb-2">{g.ayuda}</p>}
              <div className={dosColumnas ? 'grid sm:grid-cols-2 gap-3 mt-2' : 'space-y-3 mt-2'}>
                {g.tipos.map(t => (
                  <TarjetaBoleta key={t.id} t={t} evento={evento} aforoLleno={aforoLleno}
                    data={data} onReservar={onReservar} onWaitlist={onWaitlist} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={dosColumnas ? 'grid sm:grid-cols-2 gap-3' : 'space-y-3'}>
          {tickets.map(t => (
            <TarjetaBoleta key={t.id} t={t} evento={evento} aforoLleno={aforoLleno}
              data={data} onReservar={onReservar} onWaitlist={onWaitlist} />
          ))}
        </div>
      )}
      </div>
    </Seccion>
  );
}

/* Una boleta en la lista de compra.
 *
 * Sale del cuerpo del `map` que había dentro del bloque: en cuanto la lista se
 * agrupa hay dos sitios que la pintan, y dos copias de una tarjeta es cómo
 * acaban teniendo distinto el precio tachado o el botón de agotado. */
function TarjetaBoleta({ t, evento, aforoLleno, data, onReservar, onWaitlist }) {
  const hasEarly = t.early_bird_precio != null && t.early_bird_hasta && new Date(t.early_bird_hasta) > new Date();
  const precio = hasEarly ? Number(t.early_bird_precio) : Number(t.precio);
  const isFree = precio === 0;
  const ventaCerr = t.venta_hasta && new Date(t.venta_hasta) < new Date();
  const agotado  = aforoLleno || (t.cupo != null && t.vendidos >= t.cupo);
  /* Las tres cosas que ya se sabían y no se decían.
     `early_bird_hasta`, `venta_hasta` y el cupo se usaban para DECIDIR
     —tachar el precio, apagar el botón, poner «Agotado»— y no se
     enseñaban. Así que la tarjeta ponía «Early» con el precio tachado y
     no decía hasta cuándo, y quien volvía al día siguiente se encontraba
     otro precio sin que nadie se lo hubiera advertido.
     Una fecha límite que no se ve no es una fecha límite. */
  const dia = (f) => fmtFecha(f, { day: 'numeric', month: 'short' }, evento);
  const quedan = t.cupo != null ? Math.max(0, t.cupo - (t.vendidos || 0)) : null;
  const avisos = [];
  if (hasEarly && !ventaCerr) avisos.push(`Este precio hasta el ${dia(t.early_bird_hasta)}`);
  if (!ventaCerr && t.venta_hasta) avisos.push(`La venta cierra el ${dia(t.venta_hasta)}`);
  /* El cupo sólo cuando aprieta: «quedan 87» de 100 no cambia lo que hace
     nadie, y un número por decir algo entrena a no leer los avisos. */
  if (!agotado && quedan != null && quedan <= 10) avisos.push(`Quedan ${quedan}`);
  return (
    <div className="rounded-2xl border border-border bg-surface/50 p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-text-1">{t.nombre}</p>
            {hasEarly && !ventaCerr && <span className="text-[9px] uppercase tracking-widest text-warning font-semibold">Early</span>}
          </div>
          {t.descripcion && <p className="text-[11px] text-text-3 mt-0.5">{t.descripcion}</p>}
          {/* Pase con duración (0136): quien compra tiene que saberlo antes. */}
          {textoDuracion(t.vigencia_cantidad, t.vigencia_unidad) && (
            <p className="text-[11px] text-text-2 mt-0.5">Válida {textoDuracion(t.vigencia_cantidad, t.vigencia_unidad)} desde tu primer ingreso</p>
          )}
          {avisos.length > 0 && (
            <p className="text-[11px] text-warning mt-1 leading-snug">{avisos.join(' · ')}</p>
          )}
        </div>
      </div>
      <div className="flex items-end justify-between gap-3 mt-2">
        <div>
          {isFree
            ? <p className="text-xl font-bold font-display text-text-1">Gratis</p>
            : (
              <div>
                <p className="text-xl font-bold font-display text-text-1 tabular-nums leading-none">${precio.toLocaleString('es-CO', { maximumFractionDigits: 0 })}</p>
                {hasEarly && <p className="text-[10px] text-text-3 line-through mt-0.5">${Number(t.precio).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</p>}
                <p className="text-[10px] text-text-3 mt-0.5">{t.currency}</p>
              </div>
            )}
        </div>
        {agotado && !ventaCerr && onWaitlist ? (
          <button
            onClick={() => onWaitlist(t)}
            className="px-4 py-2 rounded-full text-xs font-semibold border border-warning/40 bg-warning/10 text-warning hover:bg-warning/20 transition-all"
          >
            Anotarme en lista
          </button>
        ) : (
          <button
            disabled={agotado || ventaCerr}
            onClick={onReservar ? () => onReservar(t) : undefined}
            className="px-4 py-2 rounded-full text-xs font-semibold bg-text-1 text-bg hover:bg-white transition-all disabled:bg-surface-3 disabled:text-text-3 disabled:cursor-not-allowed"
          >
            {/* Agotado y Cerrado son ESTADO, no etiqueta: el texto
                personalizado no debe taparlos.

                «Regístrate» y no «Reservar» cuando es gratis. Reservar es
                lo que se hace con una mesa: sugiere que se aparta algo y
                que hay que confirmarlo después. Lo que ocurre al pulsar
                es un registro —se dan los datos y se acabó—, y llamarlo
                por su nombre es lo que hace que alguien lo termine. Se
                puede cambiar por bloque en «Texto del botón». */}
            {agotado ? 'Agotado'
              : ventaCerr ? 'Cerrado'
              : (data?.texto_boton || (isFree ? 'Regístrate' : 'Comprar'))}
          </button>
        )}
      </div>
    </div>
  );
}

/* Editor genérico para bloques sistema: solo toggle de visibilidad + preview WYSIWYG */
/* Editor base de las secciones que se alimentan de los datos del evento.

   Antes esto era todo lo que tenian: una vista previa y un interruptor de
   visibilidad. Nada configurable. Ahora trae ademas la presentacion
   compartida, y cada bloque le cuelga sus propias opciones por children. */
function EditorSistema({ data = {}, onChange, evento, Preview, label, children }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">Vista previa</p>
        <VisibilityToggle data={data} onChange={onChange} />
      </div>

      {data.oculto ? <HiddenNotice label={label} /> : (
        <>
          <div className="rounded-2xl border border-border bg-surface/20 p-5 pointer-events-none select-none opacity-90">
            <Preview data={data} evento={evento} isEditor />
          </div>

          {children && (
            <div className="rounded-2xl border border-border bg-surface/30 p-4 space-y-3.5">
              <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">Esta seccion</p>
              {children}
            </div>
          )}

          <div className="rounded-2xl border border-border bg-surface/30 p-4">
            <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold mb-3">Presentacion</p>
            <ControlesPresentacion data={data} onChange={onChange} />
          </div>
        </>
      )}
    </div>
  );
}

/* Nombre anterior, por si algo externo lo importaba. */
const SystemEditor = EditorSistema;

/* Editor de Portada — además de la visibilidad, controla el TAMAÑO de la
   imagen de portada (pantalla completa vs contenida, y su proporción/altura).
   Lo leen igual el público y el editor vía coverLayout(). */
function PortadaEditor({ data, onChange, evento }) {
  const modo = data.cover_modo || 'full';
  const { ratio } = coverLayout(data);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">Portada</p>
        <VisibilityToggle data={data} onChange={onChange} />
      </div>
      {data.oculto ? <HiddenNotice label="Portada" /> : (<>
        {!evento.cover_url && (
          <p className="text-xs text-text-3">La imagen de portada se sube en <strong className="text-text-2">Configuración → General → Editar información completa</strong>.</p>
        )}
        <div className="space-y-2">
          <label className="text-xs text-text-2 block">Ancho de la imagen</label>
          <div className="grid grid-cols-2 gap-2">
            {[['full', 'Pantalla completa'], ['contenido', 'Contenida']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => onChange({ ...data, cover_modo: v })}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors
                  ${modo === v ? 'border-accent bg-accent/10 text-text-1' : 'border-border text-text-3 hover:text-text-1'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-text-2 block mb-1">Proporción (altura)</label>
          <select className="input" value={data.cover_aspecto || ''} onChange={e => onChange({ ...data, cover_aspecto: e.target.value })}>
            {COVER_ASPECTOS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          <p className="text-[11px] text-text-3 mt-1">Proporciones más compactas hacen la portada más baja (ocupa menos pantalla).</p>
        </div>
        {evento.cover_url && (
          <div>
            <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold mb-1.5">Vista previa</p>
            <div className="overflow-hidden border border-border bg-surface-2 rounded-2xl" style={{ aspectRatio: ratio }}>
              <img src={evento.cover_url} alt="" className="w-full h-full object-cover" />
            </div>
          </div>
        )}
      </>)}
    </div>
  );
}

/* ============================================================
   CUSTOM BLOCKS
   ============================================================ */

function TextoEditor({ data, onChange }) {
  return (
    <div>
      <input
        value={data.titulo || ''} onChange={e => onChange({ ...data, titulo: e.target.value })}
        placeholder="Título (opcional)"
        className="w-full bg-transparent text-2xl font-bold font-display text-text-1 placeholder:text-text-3 outline-none mb-3"
      />
      <textarea
        value={data.texto || ''} onChange={e => onChange({ ...data, texto: e.target.value })}
        placeholder="Escribe tu contenido aquí. Párrafos separados por línea en blanco."
        rows={4}
        className="w-full bg-transparent text-base text-text-1 placeholder:text-text-3 outline-none resize-none leading-relaxed"
      />
    </div>
  );
}
function TextoPreview({ data, isEditor }) {
  if (!data.titulo && !data.texto) {
    if (!isEditor) return null;
    return <VacioEditor titulo="Bloque de texto vacío" pista="Puede llevar sólo título, sólo texto, o los dos." />;
  }
  const ps = (data.texto || '').split(/\n\s*\n/).filter(Boolean);
  return (
    <div>
      <CabeceraSeccion titulo={data.titulo} />
      {ps.map((p, i) => <p key={i} className="text-base text-text-2 leading-relaxed mb-3">{p}</p>)}
    </div>
  );
}

function GaleriaEditor({ data, onChange, evento }) {
  const urls = Array.isArray(data.urls) ? data.urls : [];
  return (
    <div className="space-y-3">
      <input value={data.titulo || ''} onChange={e => onChange({ ...data, titulo: e.target.value })}
        placeholder="Título (opcional)"
        className="w-full bg-transparent text-xl font-bold font-display text-text-1 placeholder:text-text-3 outline-none" />
      {urls.map((u, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex-1">
            <ImagePicker
              value={u}
              onChange={v => onChange({ ...data, urls: urls.map((x, idx) => idx === i ? v : x) })}
              ownerId={evento?.owner_id}
              placeholder="URL o subir"
            />
          </div>
          <button onClick={() => onChange({ ...data, urls: urls.filter((_, idx) => idx !== i) })}
            className="w-9 h-9 rounded-xl text-text-3 hover:text-danger hover:bg-danger/10 flex items-center justify-center">×</button>
        </div>
      ))}
      <button onClick={() => onChange({ ...data, urls: [...urls, ''] })}
        className="text-xs text-text-2 hover:text-text-1">+ Agregar imagen</button>
    </div>
  );
}
function GaleriaPreview({ data, reorder, isEditor }) {
  const all = data.urls || [];
  const visibleIndices = all.map((_, i) => i).filter(i => Boolean(all[i]));
  if (visibleIndices.length === 0) {
    if (!isEditor) return null;
    return <VacioEditor titulo="Galería vacía" pista="Añade imágenes desde el panel. Se colocan en rejilla y se pueden reordenar arrastrándolas aquí." />;
  }
  const grid = 'grid grid-cols-2 sm:grid-cols-3 gap-3';
  const cell = (i) => (
    <a key={i} href={all[i]} target="_blank" rel="noreferrer noopener"
      className="block aspect-square rounded-2xl overflow-hidden border border-border hover:border-border-2 transition-all hover:scale-[1.02]">
      <img src={all[i]} alt="" className="w-full h-full object-cover" loading="lazy" />
    </a>
  );
  return (
    <div>
      <CabeceraSeccion titulo={data.titulo} />
      {reorder ? (
        <Suspense fallback={<div className={grid}>{visibleIndices.map(cell)}</div>}>
          <PreviewReorder visibleIndices={visibleIndices} estrategia="rejilla" className={grid}
            onMove={(from, to) => reorder.onChange({ ...data, urls: moverEn(all, from, to) })}
            renderItem={cell} />
        </Suspense>
      ) : (
        <div className={grid}>{visibleIndices.map(cell)}</div>
      )}
    </div>
  );
}

function VideoEditor({ data, onChange }) {
  const embed = getEmbed(data.url);
  return (
    <div className="space-y-3">
      <input value={data.titulo || ''} onChange={e => onChange({ ...data, titulo: e.target.value })}
        placeholder="Título (opcional)"
        className="w-full bg-transparent text-xl font-bold font-display text-text-1 placeholder:text-text-3 outline-none" />
      <input value={data.url || ''} onChange={e => onChange({ ...data, url: e.target.value })}
        placeholder="URL de YouTube o Vimeo" className="input rounded-xl py-2.5 text-sm" />
      {embed && <div className="aspect-video rounded-2xl overflow-hidden border border-border"><iframe src={embed} className="w-full h-full" allowFullScreen /></div>}
    </div>
  );
}
function VideoPreview({ data, isEditor }) {
  const embed = getEmbed(data.url);
  if (!embed) {
    if (!isEditor) return null;
    return <VacioEditor titulo="Sin vídeo" pista="Pega un enlace de YouTube o Vimeo. Otros enlaces no se pueden incrustar." />;
  }
  return (
    <div>
      <CabeceraSeccion titulo={data.titulo} />
      <div className="aspect-video rounded-3xl overflow-hidden border border-border"><iframe src={embed} className="w-full h-full" allowFullScreen /></div>
    </div>
  );
}
function getEmbed(url) {
  if (!url) return null;
  let m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;
  m = url.match(/vimeo\.com\/(\d+)/);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return null;
}

function FAQEditor({ data, onChange }) {
  const items = Array.isArray(data.items) ? data.items : [];
  return (
    <div className="space-y-3">
      <input value={data.titulo || ''} onChange={e => onChange({ ...data, titulo: e.target.value })}
        placeholder="Preguntas frecuentes"
        className="w-full bg-transparent text-xl font-bold font-display text-text-1 placeholder:text-text-3 outline-none" />
      {items.map((it, i) => (
        <div key={i} className="rounded-2xl border border-border bg-surface/40 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <input value={it.q || ''} onChange={e => onChange({ ...data, items: items.map((x, idx) => idx === i ? { ...x, q: e.target.value } : x) })}
              placeholder="Pregunta" className="input rounded-xl py-2 text-sm font-medium flex-1" />
            <button onClick={() => onChange({ ...data, items: items.filter((_, idx) => idx !== i) })}
              className="w-9 h-9 rounded-xl text-text-3 hover:text-danger hover:bg-danger/10 flex items-center justify-center">×</button>
          </div>
          <textarea value={it.a || ''} onChange={e => onChange({ ...data, items: items.map((x, idx) => idx === i ? { ...x, a: e.target.value } : x) })}
            placeholder="Respuesta" rows={2} className="input rounded-xl py-2 text-sm resize-none" />
        </div>
      ))}
      <button onClick={() => onChange({ ...data, items: [...items, { q: '', a: '' }] })}
        className="text-xs text-text-2 hover:text-text-1">+ Agregar pregunta</button>
    </div>
  );
}
function FAQPreview({ data, reorder, isEditor }) {
  const all = data.items || [];
  const visibleIndices = all.map((_, i) => i).filter(i => all[i]?.q?.trim());
  if (visibleIndices.length === 0) {
    if (!isEditor) return null;
    return <VacioEditor titulo="Sin preguntas todavía" pista="Las que más te escriben por WhatsApp suelen ser las que van aquí." />;
  }
  const item = (i) => <FAQItem key={i} q={all[i].q} a={all[i].a} />;
  return (
    <div>
      <CabeceraSeccion titulo={data.titulo} />
      {reorder ? (
        <Suspense fallback={<div className="space-y-2">{visibleIndices.map(item)}</div>}>
          <PreviewReorder visibleIndices={visibleIndices} estrategia="lista" className="space-y-2"
            onMove={(from, to) => reorder.onChange({ ...data, items: moverEn(all, from, to) })}
            renderItem={item} />
        </Suspense>
      ) : (
        <div className="space-y-2">{visibleIndices.map(item)}</div>
      )}
    </div>
  );
}
function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-surface/40 overflow-hidden">
      <button onClick={() => setOpen(v => !v)} className="w-full px-5 py-4 flex items-center justify-between text-left">
        <span className="text-sm font-medium text-text-1">{q}</span>
        <span className={`text-text-3 transition-transform ${open ? 'rotate-180' : ''}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
        </span>
      </button>
      {open && a && <div className="px-5 pb-4 text-sm text-text-2 leading-relaxed animate-[fadeUp_0.2s_ease_both]">{a}</div>}
    </div>
  );
}

/* ============================================================
   ICONS
   ============================================================ */

const Ico = (path) => () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={path} /></svg>;

const IconCover    = Ico('M4 16l4-4a3 3 0 014 0l4 4m0 0l2-2a3 3 0 014 0l2 2M14 7h.01M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z');
const IconTitulo   = Ico('M7 8h10M7 12h6M7 16h10');
const IconDesc     = Ico('M4 6h16M4 12h16M4 18h10');
const IconInfo     = Ico('M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z');
const IconDir      = Ico('M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z');
const IconLinks    = Ico('M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1');
const IconTickets  = Ico('M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z');
const IconTexto    = Ico('M4 6h16M4 12h16M4 18h10');
const IconGaleria  = Ico('M4 16l4-4a3 3 0 014 0l4 4m-2-2l1-1a3 3 0 014 0l2 2M14 7h.01M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z');
const IconVideo    = Ico('M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z');
const IconFAQ      = Ico('M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093V14m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z');
const IconHero     = Ico('M4 5a2 2 0 012-2h12a2 2 0 012 2v5H4V5zM4 13h16v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6z');
const IconSpeakers = Ico('M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z');
const IconSponsors = Ico('M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L23 12l-6.857 2.143L14 21l-2.143-6.857L5 12l6.857-2.143L14 3z');
const IconMapa     = Ico('M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7');
const IconCount    = Ico('M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z');
const IconRedes    = Ico('M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z');
const IconCTA      = Ico('M9 5l7 7-7 7');
const IconSep      = Ico('M5 12h14');
const IconCita     = Ico('M7 8h10M7 12h10M7 16h6');

/* ============================================================
   CUSTOM BLOCKS — extra
   ============================================================ */

/* ─── HERO ─── */
function HeroEditor({ data, onChange, evento }) {
  return (
    <div className="space-y-3">
      <input value={data.titulo || ''} onChange={e => onChange({ ...data, titulo: e.target.value })}
        placeholder="Título grande del hero"
        className="w-full bg-transparent text-3xl font-bold font-display text-text-1 placeholder:text-text-3 outline-none" />
      <input value={data.subtitulo || ''} onChange={e => onChange({ ...data, subtitulo: e.target.value })}
        placeholder="Subtítulo o claim"
        className="w-full bg-transparent text-base text-text-2 placeholder:text-text-3 outline-none" />
      <ImagePicker
        value={data.imagen}
        onChange={v => onChange({ ...data, imagen: v })}
        ownerId={evento?.owner_id}
        placeholder="URL imagen de fondo o sube una"
      />
      <div>
        <label className="text-xs text-text-2 flex items-center justify-between mb-1">
          <span>Alto del banner</span>
          <span className="text-text-3 tabular-nums">{data.alto ?? 320}px</span>
        </label>
        <input type="range" min={140} max={640} step={20} value={data.alto ?? 320}
          onChange={e => onChange({ ...data, alto: Number(e.target.value) })}
          className="w-full accent-[#8B5CF6]" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input value={data.cta_texto || ''} onChange={e => onChange({ ...data, cta_texto: e.target.value })}
          placeholder="Texto del botón (opcional)"
          className="input rounded-xl py-2 text-sm" />
        <input value={data.cta_url || ''} onChange={e => onChange({ ...data, cta_url: e.target.value })}
          placeholder="URL del botón"
          className="input rounded-xl py-2 text-sm" />
      </div>
    </div>
  );
}
function HeroPreview({ data, isEditor }) {
  if (!data.titulo) {
    if (!isEditor) return null;
    return <VacioEditor titulo="Banner sin titular" pista="El titular es lo único imprescindible; la imagen y el botón son opcionales." />;
  }
  return (
    <div className="relative rounded-3xl overflow-hidden border border-border flex items-center px-8 py-12"
      style={{ minHeight: data.alto ?? 320 }}>
      {data.imagen && (
        <>
          <img src={data.imagen} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-bg/95 via-bg/70 to-transparent" />
        </>
      )}
      {!data.imagen && <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-accent/10 to-bg" />}
      <div className="relative max-w-2xl">
        <h2 className="text-4xl sm:text-5xl font-bold font-display tracking-tight text-text-1 leading-[1.05] mb-3">{data.titulo}</h2>
        {data.subtitulo && <p className="text-base sm:text-lg text-text-2 leading-relaxed mb-5">{data.subtitulo}</p>}
        {data.cta_texto && data.cta_url && (
          <a href={data.cta_url} target="_blank" rel="noreferrer noopener"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-text-1 text-bg hover:bg-white text-sm font-semibold transition-all hover:scale-[1.02]">
            {data.cta_texto} →
          </a>
        )}
      </div>
    </div>
  );
}

/* ─── SPEAKERS ─── */
function SpeakersEditor({ data, onChange, evento }) {
  const items = Array.isArray(data.items) ? data.items : [];
  const update = (i, key, val) => onChange({ ...data, items: items.map((x, idx) => idx === i ? { ...x, [key]: val } : x) });
  return (
    <div className="space-y-3">
      <input value={data.titulo || ''} onChange={e => onChange({ ...data, titulo: e.target.value })}
        placeholder="Speakers"
        className="w-full bg-transparent text-xl font-bold font-display text-text-1 placeholder:text-text-3 outline-none" />
      {items.map((it, i) => (
        <div key={i} className="rounded-2xl border border-border bg-surface/40 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <ImagePicker value={it.foto} onChange={v => update(i, 'foto', v)} ownerId={evento?.owner_id} placeholder="Foto del speaker" />
            </div>
            <button onClick={() => onChange({ ...data, items: items.filter((_, idx) => idx !== i) })}
              className="w-9 h-9 rounded-xl text-text-3 hover:text-danger hover:bg-danger/10 flex items-center justify-center">×</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={it.nombre || ''} onChange={e => update(i, 'nombre', e.target.value)} placeholder="Nombre" className="input rounded-xl py-2 text-sm" />
            <input value={it.cargo || ''}  onChange={e => update(i, 'cargo', e.target.value)}  placeholder="Cargo / título" className="input rounded-xl py-2 text-sm" />
          </div>
          <input value={it.empresa || ''} onChange={e => update(i, 'empresa', e.target.value)} placeholder="Empresa (opcional)" className="input rounded-xl py-2 text-sm" />
          <textarea value={it.bio || ''} onChange={e => update(i, 'bio', e.target.value)} placeholder="Bio breve" rows={2} className="input rounded-xl py-2 text-sm resize-none" />
        </div>
      ))}
      <button onClick={() => onChange({ ...data, items: [...items, { nombre: '', cargo: '', empresa: '', foto: '', bio: '' }] })}
        className="text-xs text-text-2 hover:text-text-1">+ Agregar speaker</button>
    </div>
  );
}
function SpeakersPreview({ data, reorder, isEditor }) {
  const all = data.items || [];
  const visibleIndices = all.map((_, i) => i).filter(i => all[i]?.nombre?.trim());
  if (visibleIndices.length === 0) {
    if (!isEditor) return null;
    return <VacioEditor titulo="Sin ponentes todavía" pista="Añádelos desde el panel de la derecha: nombre, cargo y foto." />;
  }
  const card = (i) => {
    const s = all[i];
    return (
      <div key={i} className="rounded-3xl border border-border bg-surface/40 p-5 flex items-start gap-4 hover:border-border-2 transition-all">
        <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
          {s.foto
            ? <img src={s.foto} alt={s.nombre} className="w-full h-full object-cover" />
            : <span className="text-white font-bold text-lg">{s.nombre?.charAt(0)?.toUpperCase()}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-text-1 truncate">{s.nombre}</p>
          {(s.cargo || s.empresa) && (
            <p className="text-xs text-text-3 mt-0.5 truncate">
              {s.cargo}{s.cargo && s.empresa ? ' · ' : ''}{s.empresa}
            </p>
          )}
          {s.bio && <p className="text-xs text-text-2 mt-2 leading-relaxed line-clamp-3">{s.bio}</p>}
        </div>
      </div>
    );
  };
  const grid = 'grid sm:grid-cols-2 gap-3';
  return (
    <div>
      <CabeceraSeccion titulo={data.titulo} />
      {reorder ? (
        <Suspense fallback={<div className={grid}>{visibleIndices.map(card)}</div>}>
          <PreviewReorder visibleIndices={visibleIndices} estrategia="rejilla" className={grid}
            onMove={(from, to) => reorder.onChange({ ...data, items: moverEn(all, from, to) })}
            renderItem={card} />
        </Suspense>
      ) : (
        <div className={grid}>{visibleIndices.map(card)}</div>
      )}
    </div>
  );
}

/* ─── PATROCINADORES ─── */
const TIERS = [
  { id: 'gold',   label: 'Gold',   className: 'h-20' },
  { id: 'silver', label: 'Silver', className: 'h-14' },
  { id: 'bronze', label: 'Bronze', className: 'h-10' },
];
function SponsorsEditor({ data, onChange, evento }) {
  const items = Array.isArray(data.items) ? data.items : [];
  const update = (i, key, val) => onChange({ ...data, items: items.map((x, idx) => idx === i ? { ...x, [key]: val } : x) });
  return (
    <div className="space-y-3">
      <input value={data.titulo || ''} onChange={e => onChange({ ...data, titulo: e.target.value })}
        placeholder="Patrocinadores"
        className="w-full bg-transparent text-xl font-bold font-display text-text-1 placeholder:text-text-3 outline-none" />
      {items.map((it, i) => (
        <div key={i} className="rounded-2xl border border-border bg-surface/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <ImagePicker value={it.logo} onChange={v => update(i, 'logo', v)} ownerId={evento?.owner_id} placeholder="Logo del patrocinador" />
            </div>
            <button onClick={() => onChange({ ...data, items: items.filter((_, idx) => idx !== i) })}
              className="w-9 h-9 rounded-xl text-text-3 hover:text-danger hover:bg-danger/10 flex items-center justify-center">×</button>
          </div>
          <div className="grid grid-cols-[1fr_120px_1fr] gap-2">
            <input value={it.nombre || ''} onChange={e => update(i, 'nombre', e.target.value)} placeholder="Nombre" className="input rounded-xl py-2 text-sm" />
            <select value={it.tier || 'silver'} onChange={e => update(i, 'tier', e.target.value)} className="input bg-surface-2 rounded-xl py-2 text-sm">
              {TIERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <input value={it.url || ''} onChange={e => update(i, 'url', e.target.value)} placeholder="URL (opcional)" className="input rounded-xl py-2 text-sm" />
          </div>
        </div>
      ))}
      <button onClick={() => onChange({ ...data, items: [...items, { nombre: '', logo: '', tier: 'silver', url: '' }] })}
        className="text-xs text-text-2 hover:text-text-1">+ Agregar patrocinador</button>
    </div>
  );
}
function SponsorsPreview({ data, isEditor }) {
  const items = (data.items || []).filter(it => it.logo || it.nombre);
  if (items.length === 0) {
    if (!isEditor) return null;
    return <VacioEditor titulo="Sin patrocinadores todavía" pista="Cada uno lleva su logo, su nivel y el enlace a su web." />;
  }
  const grouped = TIERS.map(t => ({ ...t, items: items.filter(it => (it.tier || 'silver') === t.id) })).filter(g => g.items.length > 0);
  return (
    <div>
      <CabeceraSeccion titulo={data.titulo} centrado />
      <div className="space-y-6">
        {grouped.map(g => (
          <div key={g.id}>
            <p className="text-[10px] uppercase tracking-widest text-text-3 font-semibold text-center mb-3">{g.label}</p>
            <div className="flex flex-wrap items-center justify-center gap-6">
              {g.items.map((s, i) => {
                const inner = s.logo
                  ? <img src={s.logo} alt={s.nombre} className={`${g.className} max-w-[160px] object-contain opacity-80 hover:opacity-100 transition-opacity`} />
                  : <span className="text-sm text-text-2">{s.nombre}</span>;
                return s.url
                  ? <a key={i} href={s.url} target="_blank" rel="noreferrer noopener">{inner}</a>
                  : <div key={i}>{inner}</div>;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── MAPA ─── */
function MapaEditor({ data, onChange, evento }) {
  const direccion = data.direccion || evento?.location_direccion || evento?.location_nombre || '';
  const embedSrc = direccion ? `https://www.google.com/maps?q=${encodeURIComponent(direccion)}&output=embed` : null;
  return (
    <div className="space-y-3">
      <input value={data.titulo || ''} onChange={e => onChange({ ...data, titulo: e.target.value })}
        placeholder="Cómo llegar"
        className="w-full bg-transparent text-xl font-bold font-display text-text-1 placeholder:text-text-3 outline-none" />
      <input value={data.direccion || ''} onChange={e => onChange({ ...data, direccion: e.target.value })}
        placeholder={`Dirección o lugar (default: ${evento?.location_direccion || evento?.location_nombre || 'sin dirección'})`}
        className="input rounded-xl py-2 text-sm" />
      {embedSrc && (
        <div className="aspect-video rounded-2xl overflow-hidden border border-border">
          <iframe src={embedSrc} className="w-full h-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        </div>
      )}
    </div>
  );
}
/* Una actividad de la zona, en la ficha del mapa.
 *
 * ── Por qué existe como pieza ────────────────────────────────────────────
 *
 * La ficha tenía dos listas —«Ahora mismo» y «Después, aquí mismo»— con la
 * línea escrita dos veces, y sólo una de las dos enseñaba el cupo. Dos copias
 * de lo mismo que ya se habían separado un poco.
 *
 * ── Lo que faltaba, y era lo importante ──────────────────────────────────
 *
 * De cada actividad se decía la hora y el título. «Torneo gamer» a secas no
 * dice si hay que llevar equipo, si se juega por parejas ni a quién va
 * dirigido — y esa respuesta estaba guardada: 14 de las 18 actividades de
 * producción tienen descripción escrita. El dato estaba y no llegaba.
 *
 * Se recorta a tres líneas con CSS y no con `slice`: cortar por caracteres
 * parte palabras y miente sobre lo que hay. Quien quiera el resto, entra.
 *
 * ── Entrar a la actividad ────────────────────────────────────────────────
 *
 * Lleva a `/explorar/:slug/agenda?sesion=<id>`, que YA sabe enseñar una sola
 * actividad con su descripción entera y su inscripción. No se escribe una
 * pantalla nueva a propósito: el comentario de `AgendaPublicaPage` cuenta que
 * ya se intentó una vez y la copia se llevó su propio modal de inscripción,
 * sin la salida para quien llega sin boleta.
 *
 * En el editor no navega: quien está montando la landing no puede acabar en la
 * página pública por tocar la vista previa. */
/* Agrupa por día lo que queda por pasar en una zona.
 *
 * ── El fallo que arregla ─────────────────────────────────────────────────
 *
 * «Después, aquí mismo» sólo escribía la HORA. En un evento de un día eso está
 * bien; en uno de varios —FESTECH son el 17 y el 18— dos actividades de días
 * distintos se leen como si fueran seguidas:
 *
 *     08:02 a. m. · Torneo de Videojuegos FIFA     (día 17)
 *     12:00 p. m. · PijaoHub · DemoDay             (día 18)
 *
 * Nadie se entera de que hay una noche en medio. No da ningún error: da a
 * alguien plantado en la zona equivocada.
 *
 * Sólo se agrupa cuando de verdad hay más de un día. Con uno solo, poner
 * «Jueves 17» encima de una lista que ya está bajo «Después, aquí mismo» es
 * repetir lo que ya se sabe. */
const DIA_MS = 24 * 60 * 60 * 1000;

function claveDeDia(iso) {
  const d = new Date(iso);
  /* Por fecha local y no en UTC: a las 8 p. m. en Colombia, `toISOString()` ya
     dice mañana, y la actividad saldría bajo el día siguiente. */
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/* «Hoy» y «Mañana» se calculan contra el día de quien mira, no contra el
   evento: es quien está delante del mapa. */
function nombreDelDia(iso) {
  const d = new Date(iso);
  const hoy = new Date();
  const aMedianoche = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((aMedianoche(d) - aMedianoche(hoy)) / DIA_MS);
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Mañana';
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: 'short' });
}

function porDia(items) {
  const grupos = [];
  for (const s of items) {
    if (!s.inicio) { continue; }
    const clave = claveDeDia(s.inicio);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.clave === clave) ultimo.items.push(s);
    else grupos.push({ clave, nombre: nombreDelDia(s.inicio), items: [s] });
  }
  /* Las que no tienen hora van al final, juntas: existen —el organizador las
     creó— y esconderlas sería decir que no hay nada. */
  const sinHora = items.filter(s => !s.inicio);
  if (sinHora.length) grupos.push({ clave: 'sin-hora', nombre: 'Sin hora todavía', items: sinHora });
  return grupos;
}

function ActividadDeLaZona({ s, evento, isEditor }) {
  const hora = s.inicio
    ? new Date(s.inicio).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    : null;
  const puedeEntrar = Boolean(evento?.slug && !isEditor);

  const dentro = (
    <>
      <p className="text-sm text-text-1">
        {hora && <span className="font-mono text-text-3">{hora}</span>}
        {hora && ' · '}{s.titulo}
        {s.requiere_inscripcion && (
          <span className={s.libres === 0 ? 'text-danger text-xs' : 'text-text-3 text-xs'}>
            {s.libres === 0 ? ' · sin cupo' : s.libres != null ? ` · quedan ${s.libres}` : ' · pide inscripción'}
          </span>
        )}
      </p>
      {s.descripcion && (
        <p className="text-xs text-text-3 mt-0.5 leading-relaxed line-clamp-3">{s.descripcion}</p>
      )}
    </>
  );

  if (!puedeEntrar) return <li className="py-1">{dentro}</li>;

  return (
    <li>
      <a href={`/explorar/${evento.slug}/agenda?sesion=${encodeURIComponent(s.id)}`}
         className="block -mx-2 px-2 py-1.5 rounded-lg hover:bg-surface-2/70 transition-colors">
        {dentro}
        <span className="text-[11px] text-primary-light">Ver la actividad →</span>
      </a>
    </li>
  );
}

function MapaPreview({ data, evento, isEditor }) {
  const direccion = data.direccion || evento?.location_direccion || evento?.location_nombre;
  if (!direccion) {
    if (!isEditor) return null;
    return <VacioEditor titulo="Sin dirección" pista="Coge la del evento o escribe otra. Sin dirección no hay mapa que enseñar." />;
  }
  const embedSrc = `https://www.google.com/maps?q=${encodeURIComponent(direccion)}&output=embed`;
  const linkSrc  = `https://www.google.com/maps?q=${encodeURIComponent(direccion)}`;
  return (
    <div>
      <CabeceraSeccion titulo={data.titulo} />
      <div className="rounded-3xl overflow-hidden border border-border mb-3 aspect-video">
        <iframe src={embedSrc} className="w-full h-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="Mapa" />
      </div>
      <a href={linkSrc} target="_blank" rel="noreferrer noopener"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-surface/40 hover:bg-surface text-sm text-text-1 transition-all">
        Cómo llegar →
      </a>
    </div>
  );
}

/* ─── COUNTDOWN ─── */
function CountdownEditor({ data, onChange, evento }) {
  const target = data.fecha || evento?.fecha_inicio || '';
  return (
    <div className="space-y-3">
      <input value={data.titulo || ''} onChange={e => onChange({ ...data, titulo: e.target.value })}
        placeholder="Faltan..."
        className="w-full bg-transparent text-xl font-bold font-display text-text-1 placeholder:text-text-3 outline-none" />
      <div className="text-xs text-text-3">
        {data.fecha
          ? <>Fecha personalizada: <span className="font-mono">{new Date(data.fecha).toLocaleString('es-CO')}</span></>
          : <>Cuenta atrás hacia la fecha del evento: <span className="font-mono">{evento?.fecha_inicio ? new Date(evento.fecha_inicio).toLocaleString('es-CO') : 'sin fecha'}</span></>}
      </div>
      <input
        type="datetime-local"
        value={data.fecha ? toLocalInput(data.fecha) : ''}
        onChange={e => onChange({ ...data, fecha: e.target.value ? new Date(e.target.value).toISOString() : null })}
        placeholder="Sobrescribir fecha (opcional)"
        className="input bg-surface-2 rounded-xl py-2 text-sm"
      />
      {data.fecha && (
        <button type="button" onClick={() => onChange({ ...data, fecha: null })} className="text-xs text-text-3 hover:text-text-1">Volver a usar la fecha del evento</button>
      )}
      {target && <CountdownDisplay target={target} />}
    </div>
  );
}
function CountdownPreview({ data, evento, isEditor }) {
  const target = data.fecha || evento?.fecha_inicio;
  if (!target) {
    if (!isEditor) return null;
    return <VacioEditor titulo="Sin fecha a la que contar" pista="Usa la fecha del evento o pon una propia en el panel." />;
  }
  return (
    <div className="text-center py-4">
      {data.titulo && <p className="text-xs uppercase tracking-widest text-text-3 font-semibold mb-3">{data.titulo}</p>}
      <CountdownDisplay target={target} large />
    </div>
  );
}
function CountdownDisplay({ target, large }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const diff = Math.max(0, new Date(target).getTime() - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const cells = [
    { label: 'días', value: d },
    { label: 'h', value: h },
    { label: 'min', value: m },
    { label: 'seg', value: s },
  ];
  if (diff === 0) return <p className="text-2xl font-bold font-display text-text-1">¡Ahora!</p>;
  return (
    <div className={`inline-flex items-center gap-2 ${large ? 'sm:gap-4' : ''}`}>
      {cells.map(c => (
        <div key={c.label} className={`rounded-2xl border border-border bg-surface/40 ${large ? 'min-w-[80px] sm:min-w-[110px] py-4' : 'min-w-[60px] py-3'}`}>
          <p className={`font-bold font-display text-text-1 tabular-nums leading-none ${large ? 'text-4xl sm:text-5xl' : 'text-2xl'}`}>{String(c.value).padStart(2, '0')}</p>
          <p className="text-[10px] uppercase tracking-widest text-text-3 mt-1">{c.label}</p>
        </div>
      ))}
    </div>
  );
}
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ─── REDES (custom) ─── */
const RED_PRESETS = [
  ['instagram','Instagram'], ['tiktok','TikTok'], ['x','X / Twitter'],
  ['facebook','Facebook'], ['youtube','YouTube'], ['linkedin','LinkedIn'],
  ['web','Web'], ['whatsapp','WhatsApp'], ['custom','Otro'],
];
function RedesEditor({ data, onChange }) {
  const items = Array.isArray(data.items) ? data.items : [];
  const update = (i, key, val) => onChange({ ...data, items: items.map((x, idx) => idx === i ? { ...x, [key]: val } : x) });
  return (
    <div className="space-y-3">
      <input value={data.titulo || ''} onChange={e => onChange({ ...data, titulo: e.target.value })}
        placeholder="Síguenos en redes"
        className="w-full bg-transparent text-xl font-bold font-display text-text-1 placeholder:text-text-3 outline-none" />
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-[120px_1fr_auto] gap-2 items-center">
          <select value={it.tipo || 'instagram'} onChange={e => update(i, 'tipo', e.target.value)}
            className="input bg-surface-2 rounded-xl py-2 text-sm">
            {RED_PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input value={it.url || ''} onChange={e => update(i, 'url', e.target.value)}
            placeholder="https://..." className="input rounded-xl py-2 text-sm" />
          <button onClick={() => onChange({ ...data, items: items.filter((_, idx) => idx !== i) })}
            className="w-9 h-9 rounded-xl text-text-3 hover:text-danger hover:bg-danger/10 flex items-center justify-center">×</button>
        </div>
      ))}
      <button onClick={() => onChange({ ...data, items: [...items, { tipo: 'instagram', url: '' }] })}
        className="text-xs text-text-2 hover:text-text-1">+ Agregar red social</button>
    </div>
  );
}
function RedesPreview({ data, reorder, isEditor }) {
  const all = data.items || [];
  const visibleIndices = all.map((_, i) => i).filter(i => all[i]?.url?.trim());
  if (visibleIndices.length === 0) {
    if (!isEditor) return null;
    return <VacioEditor titulo="Sin redes todavía" pista="Pega la dirección de cada perfil en el panel de la derecha." />;
  }
  const chip = (i) => {
    const l = all[i];
    return (
      <a key={i} href={l.url} target="_blank" rel="noreferrer noopener"
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-border bg-surface/40 hover:bg-surface hover:border-border-2 text-sm text-text-1 transition-all hover:scale-[1.02]">
        <span className="text-xs uppercase tracking-wider text-text-3">{l.tipo}</span>
        <span className="truncate max-w-[200px]">{l.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
      </a>
    );
  };
  const wrap = 'flex flex-wrap justify-center gap-2';
  return (
    <div className="text-center">
      <CabeceraSeccion titulo={data.titulo} />
      {reorder ? (
        <Suspense fallback={<div className={wrap}>{visibleIndices.map(chip)}</div>}>
          <PreviewReorder visibleIndices={visibleIndices} estrategia="rejilla" className={wrap}
            onMove={(from, to) => reorder.onChange({ ...data, items: moverEn(all, from, to) })}
            renderItem={chip} />
        </Suspense>
      ) : (
        <div className={wrap}>{visibleIndices.map(chip)}</div>
      )}
    </div>
  );
}

/* ─── CTA ─── */
function CTAEditor({ data, onChange }) {
  return (
    <div className="space-y-3">
      <input value={data.texto || ''} onChange={e => onChange({ ...data, texto: e.target.value })}
        placeholder="Texto del botón"
        className="w-full bg-transparent text-xl font-bold font-display text-text-1 placeholder:text-text-3 outline-none" />
      <input value={data.url || ''} onChange={e => onChange({ ...data, url: e.target.value })}
        placeholder="URL destino"
        className="input rounded-xl py-2 text-sm" />
      <select value={data.estilo || 'primary'} onChange={e => onChange({ ...data, estilo: e.target.value })}
        className="input bg-surface-2 rounded-xl py-2 text-sm w-auto">
        <option value="primary">Principal (sólido)</option>
        <option value="secondary">Secundario (borde)</option>
        <option value="ghost">Discreto (texto)</option>
      </select>
    </div>
  );
}
/* ── Premios y recompensas ──
   Muestra el catálogo real del evento (evento.recompensas). El saldo NO se
   muestra aquí: es por boleta y vive en /mi-ticket. */
function RecompensasEditor({ data, onChange }) {
  return (
    <div className="space-y-3">
      <input value={data.titulo || ''} onChange={e => onChange({ ...data, titulo: e.target.value })}
        placeholder="Título" className="input" />
      <textarea value={data.subtitulo || ''} onChange={e => onChange({ ...data, subtitulo: e.target.value })}
        placeholder="Explica cómo se ganan los puntos" rows={3} className="input resize-none" />
      <p className="text-[11px] text-text-3">
        Los premios se administran en Ajustes → Recompensas (o por evento). Aquí solo se muestran.
      </p>
    </div>
  );
}

function RecompensasPreview({ data, evento, isEditor }) {
  const items = evento?.recompensas || [];
  /* Un apartado vacío no se pinta en la página pública.

     «Aún no hay premios publicados» es útil para quien está montando la página
     —dice que el bloque está puesto y esperando— y no le dice nada a quien la
     visita: para él es un título, un recuadro y una frase que ocupan pantalla
     para contar que no hay nada. Es la misma regla que ya siguen la portada, la
     descripción, la dirección, los enlaces, la galería y las boletas; estos dos
     bloques se quedaron fuera y por eso el evento real tenía huecos grandes
     entre secciones. */
  if (items.length === 0 && !isEditor) return null;
  return (
    <section>
      <CabeceraSeccion titulo={data.titulo} subtitulo={data.subtitulo} />
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center">
          <p className="text-sm text-text-3">Aún no hay premios publicados.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map(r => (
            <div key={r.id} className={`rounded-2xl border border-border bg-surface/40 p-4 ${r.agotada ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-text-1">{r.titulo}</p>
                <span className="text-xs font-bold tabular-nums text-primary-light flex-shrink-0">{r.costo_puntos} pts</span>
              </div>
              {r.descripcion && <p className="text-xs text-text-3 mt-1.5 leading-relaxed">{r.descripcion}</p>}
              {r.agotada && <p className="text-[11px] text-danger mt-2">Agotado</p>}
              {!r.agotada && r.stock != null && (
                <p className="text-[11px] text-text-3 mt-2">Quedan {Math.max(0, r.stock - r.canjeados)}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function IconRecompensas({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zM5 12h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
  </svg>;
}
function IconExpositores({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3m6-14h6m-6 4h6m-6 4h6" />
  </svg>;
}

/* ── Mapa del evento ── (page_json.mapa: {imagen_url, marcadores:[{expositor_id,x,y}]}
   cruzado con evento.expositores para la card al hacer clic) */
function MapaEventoEditor({ data, onChange }) {
  return (
    <div className="space-y-3">
      <input value={data.titulo || ''} onChange={e => onChange({ ...data, titulo: e.target.value })} placeholder="Título" className="input" />
      <textarea value={data.subtitulo || ''} onChange={e => onChange({ ...data, subtitulo: e.target.value })} placeholder="Subtítulo" rows={2} className="input resize-none" />
      <p className="text-[11px] text-text-3">El plano y las posiciones se arman en Dinámicas → Mapa del evento. Aquí solo se muestra.</p>
    </div>
  );
}

function MapaEventoPreview({ data, evento, isEditor }) {
  const [sel, setSel] = useState(null);
  const mapa = evento?.page_json?.mapa || {};
  const marcadores = Array.isArray(mapa.marcadores) ? mapa.marcadores : [];
  const expoPorId = new Map((evento?.expositores || []).map(e => [e.id, e]));
  const sesPorId  = new Map((evento?.mapa_sesiones || []).map(s => [s.id, s]));
  /* Las zonas de aforo también se pueden colocar en el plano. En público se
     enseñan como sitio —"aquí está la zona VIP"—, nunca con el conteo de
     gente: eso es información de operación del evento, no del visitante. */
  const zonaPorId = new Map((evento?.page_json?.zonas || []).map(z => [z.id, z]));
  const accesoPorId = new Map((evento?.page_json?.accesos || []).map(a => [a.id, a]));
  /* `mapa_zonas` trae la programación de cada zona —lo que hay dentro, y a qué
     hora— y, sólo si el organizador lo publicó, cuánta gente hay. La agenda va
     siempre: es lo que hace que valga la pena tocar el circulito. */
  const zonaVivaPorId = new Map((evento?.mapa_zonas || []).map(z => [z.id, z]));
  const aforoPorId = new Map((evento?.mapa_aforo || []).map(z => [z.id, z]));

  if (!mapa.imagen_url) {
    /* Sin plano no hay mapa que enseñar. Al visitante no se le cuenta que el
       organizador no lo ha subido: eso es un recado interno. */
    if (!isEditor) return null;
    return (
      <section>
        <CabeceraSeccion titulo={data.titulo} />
        <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center">
          <p className="text-sm text-text-3">El mapa aún no está configurado.</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <CabeceraSeccion titulo={data.titulo} subtitulo={data.subtitulo} />
      <div className="rounded-2xl overflow-auto border border-border bg-surface-2 flex justify-center">
        <div className="relative">
          <img src={mapa.imagen_url} alt="Mapa del evento" className="block max-h-[75vh] w-auto max-w-full" />
          {marcadores.map((m, i) => {
            const tipo = m.tipo || (m.expositor_id ? 'expositor' : m.sesion_id ? 'sesion' : m.zona_id ? 'zona' : m.acceso_id ? 'acceso' : 'punto');
            const pos = { left: `${m.x}%`, top: `${m.y}%` };
            const label = tipo === 'punto' ? m.nombre
              : tipo === 'sesion' ? sesPorId.get(m.sesion_id)?.titulo
              : tipo === 'zona' ? zonaPorId.get(m.zona_id)?.nombre
              : tipo === 'acceso' ? accesoPorId.get(m.acceso_id)?.nombre
              : expoPorId.get(m.expositor_id)?.nombre;

            let circulo = null, onClick = null;
            if (tipo === 'expositor') {
              const e = expoPorId.get(m.expositor_id);
              if (!e) return null;
              onClick = () => setSel({ kind: 'expositor', data: e });
              circulo = <MarcadorMapa tipo="expositor" logoUrl={e.logo_url} inicial={e.nombre} />;
            } else if (tipo === 'sesion') {
              const s = sesPorId.get(m.sesion_id);
              if (!s) return null;
              onClick = () => setSel({ kind: 'sesion', data: s });
              circulo = <MarcadorMapa tipo="sesion" inicial={s.titulo} />;
            } else if (tipo === 'zona') {
              const z = zonaPorId.get(m.zona_id);
              if (!z) return null;
              /* Con el aforo publicado, el círculo lleva la gente que hay
                 dentro y se pone en rojo al llenarse: es lo que le sirve a
                 quien está decidiendo a qué zona ir. Sin publicar, sólo el
                 sitio, como antes. */
              const zv = zonaVivaPorId.get(z.id);
              const viva = aforoPorId.get(z.id);
              const enCurso = zv?.ahora || [];
              /* El nivel lo calcula el backend (lib/aforoZonas.js): 'caliente'
                 desde el 85%, 'en_fuego' al 100%. Sólo hay dato si el
                 organizador publicó el aforo; si no, el círculo es el sitio. */
              const nivel = zv?.nivel || null;
              onClick = () => setSel({ kind: 'zona', data: { ...z, ...(zv || {}), dentro: viva?.dentro ?? zv?.dentro ?? null, lleno: viva?.lleno ?? zv?.lleno ?? null, nivel, ocupacion_pct: zv?.ocupacion_pct ?? null, descripcion: m.descripcion || '' } });
              circulo = (
                <MarcadorMapa
                  tipo="zona" color={m.color} nivel={nivel}
                  valor={viva ? viva.dentro : (zv?.dentro ?? null)}
                  inicial={z.nombre}
                  puntoVivo={enCurso.length > 0}
                />
              );
            } else if (tipo === 'acceso') {
              const a = accesoPorId.get(m.acceso_id);
              if (!a) return null;
              onClick = () => setSel({ kind: 'punto', data: { nombre: a.nombre, descripcion: 'Entrada al evento.' } });
              circulo = <MarcadorMapa tipo="acceso" color={m.color} />;
            } else {
              onClick = () => setSel({ kind: 'punto', data: m });
              circulo = <MarcadorMapa tipo="punto" color={m.color} codigo={m.codigo} />;
            }

            return (
              <button key={i} onClick={onClick} title={label || ''}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center transition-transform hover:scale-110" style={pos}>
                {circulo}
                {label && <span className="mt-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] whitespace-nowrap max-w-[130px] truncate">{label}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {sel && (
        <div className="fixed inset-0 z-[9990] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setSel(null)}>
          <div className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            {sel.kind === 'expositor' ? (<>
              <div className="flex items-start gap-3">
                {sel.data.logo_url
                  ? <img src={sel.data.logo_url} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                  : <div className="w-14 h-14 rounded-xl bg-surface-2 flex items-center justify-center text-xl font-bold text-text-3 flex-shrink-0">{(sel.data.nombre || '?')[0]}</div>}
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-text-1">{sel.data.nombre}</p>
                  {sel.data.categoria_negocio && <p className="text-xs text-text-3">{sel.data.categoria_negocio}</p>}
                  {sel.data.stand && <span className="inline-block mt-1 text-[10px] uppercase tracking-wide bg-surface-2 text-text-2 px-1.5 py-0.5 rounded">Stand {numeroDeStand(sel.data.stand)}</span>}
                </div>
                <button onClick={() => setSel(null)} className="text-text-3 hover:text-text-1">✕</button>
              </div>
              {sel.data.descripcion && <p className="text-sm text-text-2 mt-3 leading-relaxed">{sel.data.descripcion}</p>}
              {Array.isArray(sel.data.galeria) && sel.data.galeria.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {sel.data.galeria.slice(0, 3).map((url, i) => (
                    <img key={i} src={url} alt="" className="w-full aspect-square rounded-lg object-cover min-w-0" />
                  ))}
                </div>
              )}
              {Array.isArray(sel.data.franjas) && sel.data.franjas.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border space-y-1">
                  <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">En el cronograma</p>
                  {sel.data.franjas.slice(0, 5).map(fr => (
                    <p key={fr.id} className="text-xs text-text-2"><span className="font-mono text-text-3">{new Date(fr.inicio).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span> · {fr.titulo}</p>
                  ))}
                </div>
              )}
              {sel.data.sitio_web && <a href={sel.data.sitio_web} target="_blank" rel="noreferrer noopener" className="text-xs text-primary-light hover:underline mt-3 inline-block">Ver sitio →</a>}
            </>) : sel.kind === 'zona' ? (<>
              <div className="flex items-start gap-3">
                <LlamaZona nivel={sel.data.nivel} size={44}>
                  <span className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                    style={{ background: sel.data.nivel === 'en_fuego' ? '#EF4444' : sel.data.nivel === 'caliente' ? '#F97316' : '#0EA5E9' }}>
                    {sel.data.dentro != null ? sel.data.dentro : (sel.data.nombre || 'Z')[0].toUpperCase()}
                  </span>
                </LlamaZona>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-text-1">
                    {sel.data.nombre}
                    {sel.data.nivel === 'en_fuego' && <span className="ml-1.5 text-sm">🔥</span>}
                  </p>
                  <p className="text-xs text-text-3">
                    {sel.data.dentro != null
                      ? `${sel.data.dentro}${sel.data.aforo_max ? ` de ${sel.data.aforo_max}` : ''} personas dentro`
                        + (sel.data.nivel === 'en_fuego' ? ' · llena, esto está que arde'
                          : sel.data.nivel === 'caliente' ? ' · casi llena'
                          : sel.data.ocupacion_pct != null ? ` · ${sel.data.ocupacion_pct}%` : '')
                      : 'Zona del recinto'}
                  </p>
                </div>
                <button onClick={() => setSel(null)} className="text-text-3 hover:text-text-1">✕</button>
              </div>
              {sel.data.descripcion && <p className="text-sm text-text-2 mt-3 leading-relaxed">{sel.data.descripcion}</p>}

              {/* Lo que pasa dentro. Es la razón de tocar el circulito: la
                  pregunta del visitante no es cuánta gente hay, sino qué hay. */}
              {(sel.data.ahora || []).length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold mb-1">Ahora mismo</p>
                  <ul>
                    {sel.data.ahora.map(s => (
                      <ActividadDeLaZona key={s.id} s={s} evento={evento} isEditor={isEditor} />
                    ))}
                  </ul>
                </div>
              )}
              {(sel.data.agenda || []).filter(s => s.estado === 'proximo').length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold mb-1">Después, aquí mismo</p>
                  {(() => {
                    const proximas = sel.data.agenda.filter(s => s.estado === 'proximo').slice(0, 6);
                    const grupos = porDia(proximas);
                    /* Un solo día: la lista tal cual. El encabezado sobraría. */
                    if (grupos.length <= 1) {
                      return (
                        <ul className="space-y-1">
                          {proximas.map(s => (
                            <ActividadDeLaZona key={s.id} s={s} evento={evento} isEditor={isEditor} />
                          ))}
                        </ul>
                      );
                    }
                    return grupos.map(g => (
                      <div key={g.clave} className="mt-2 first:mt-0">
                        <p className="text-[11px] font-semibold text-text-2 capitalize">{g.nombre}</p>
                        <ul className="space-y-1">
                          {g.items.map(s => (
                            <ActividadDeLaZona key={s.id} s={s} evento={evento} isEditor={isEditor} />
                          ))}
                        </ul>
                      </div>
                    ));
                  })()}
                </div>
              )}
              {(() => {
                /* Qué stands hay aquí. Tocar la zona debería contestar "qué
                   hay" entero, no sólo la agenda — y evento.expositores ya
                   trae zona_id, así que esto es sólo agrupar, sin pedir nada
                   nuevo al servidor. */
                const aqui = (evento?.expositores || []).filter(e => e.zona_id === sel.data.id);
                if (aqui.length === 0) return null;
                return (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold mb-1.5">Stands aquí</p>
                    <div className="flex flex-wrap gap-1.5">
                      {aqui.slice(0, 8).map(e => (
                        <button key={e.id} onClick={() => setSel({ kind: 'expositor', data: e })}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-border hover:border-border-2 bg-surface-2/60 text-xs text-text-1 transition-colors">
                          {e.logo_url
                            ? <img src={e.logo_url} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
                            : <span className="w-4 h-4 rounded-full bg-surface-3 flex items-center justify-center text-[9px] font-bold text-text-3 flex-shrink-0">{(e.nombre || '?')[0]}</span>}
                          {e.nombre}
                        </button>
                      ))}
                      {aqui.length > 8 && <span className="text-[11px] text-text-3 self-center">+{aqui.length - 8} más</span>}
                    </div>
                  </div>
                );
              })()}
            </>) : sel.kind === 'sesion' ? (<>
              <div className="flex items-start gap-3">
                <span className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0" style={{ background: tipoEspacio(sel.data.tipo).color }}>{(sel.data.titulo || '?')[0].toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-text-1">{sel.data.titulo}</p>
                  <p className="text-xs text-text-3">{tipoEspacio(sel.data.tipo).label}</p>
                </div>
                <button onClick={() => setSel(null)} className="text-text-3 hover:text-text-1">✕</button>
              </div>
              <div className="mt-3 space-y-1 text-sm text-text-2">
                {sel.data.inicio && <p><span className="text-text-3">Hora:</span> {new Date(sel.data.inicio).toLocaleString('es-CO', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}
                {(sel.data.ubicacion || sel.data.track) && <p><span className="text-text-3">Lugar:</span> {[sel.data.track, sel.data.ubicacion].filter(Boolean).join(' · ')}</p>}
                {/* Lo que de verdad decide si merece la pena acercarse: si hay
                    que apuntarse y si queda sitio. Antes había que ir a la
                    agenda a averiguarlo, y por el camino se perdía la gente. */}
                {sel.data.requiere_inscripcion && (
                  sel.data.lleno
                    ? <p className="text-danger">Sin cupo: ya no admite más inscripciones.</p>
                    : <p><span className="text-text-3">Inscripción:</span> hay que apuntarse aparte{sel.data.libres != null ? ` · quedan ${sel.data.libres}` : ''}</p>
                )}
              </div>
            </>) : (<>
              <div className="flex items-start gap-3">
                <span className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0" style={{ background: sel.data.color || '#64748B' }}>{sel.data.codigo || 'P'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-text-1">{sel.data.nombre || 'Punto de interés'}</p>
                  {sel.data.codigo && <p className="text-xs text-text-3">Referencia {sel.data.codigo}</p>}
                </div>
                <button onClick={() => setSel(null)} className="text-text-3 hover:text-text-1">✕</button>
              </div>
              {sel.data.descripcion && <p className="text-sm text-text-2 mt-3 leading-relaxed">{sel.data.descripcion}</p>}
            </>)}
          </div>
        </div>
      )}
    </section>
  );
}

/* ── Directorio de expositores ── (evento.expositores, con sus franjas) */
function ExpositoresEditor({ data, onChange }) {
  return (
    <div className="space-y-3">
      <input value={data.titulo || ''} onChange={e => onChange({ ...data, titulo: e.target.value })} placeholder="Título" className="input" />
      <textarea value={data.subtitulo || ''} onChange={e => onChange({ ...data, subtitulo: e.target.value })} placeholder="Subtítulo" rows={2} className="input resize-none" />
      <p className="text-[11px] text-text-3">Las fichas las llenan las propias empresas con su boleta de stand. Aquí solo se muestran las publicadas.</p>
    </div>
  );
}

function ExpositoresPreview({ data, evento, isEditor }) {
  const items = evento?.expositores || [];
  /* Igual que en Recompensas: el vacío se enseña a quien monta, no a quien
     visita. */
  if (items.length === 0 && !isEditor) return null;
  const hora = (s) => new Date(s).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  return (
    <section>
      <CabeceraSeccion titulo={data.titulo} subtitulo={data.subtitulo} />
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center">
          <p className="text-sm text-text-3">Aún no hay expositores publicados.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map(x => (
            /* `overflow-hidden` como cinturón además de los tirantes: un nombre
               larguisimo o una foto futura no pueden volver a pintar fuera. */
            <div key={x.id} className="rounded-2xl border border-border bg-surface/40 p-4 overflow-hidden min-w-0">
              <div className="flex items-start gap-3">
                {x.logo_url
                  ? <img src={x.logo_url} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
                  : <div className="w-16 h-16 rounded-xl bg-surface-2 flex items-center justify-center text-xl font-bold text-text-3 flex-shrink-0">{(x.nombre || '?')[0]}</div>}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-1 truncate">{x.nombre}</p>
                  {x.categoria_negocio && <p className="text-[11px] text-text-3">{x.categoria_negocio}</p>}
                  {/* El stand y la ZONA, juntos.
                      `zona_nombre` llegaba del servidor —que lo resuelve a
                      propósito para que aquí se lea «Zona Gamer» y no un
                      identificador— y la tarjeta no lo enseñaba. En un recinto
                      con siete mil personas, «C10» sin zona no sirve para
                      encontrar a nadie: dice el número de la casa sin la calle. */}
                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    {x.stand && (
                      <span className="text-[10px] uppercase tracking-wide bg-surface-2 text-text-2 px-1.5 py-0.5 rounded">
                        Stand {numeroDeStand(x.stand)}
                      </span>
                    )}
                    {x.zona_nombre && (
                      <span className="text-[10px] uppercase tracking-wide bg-surface-2 text-text-2 px-1.5 py-0.5 rounded">
                        {x.zona_nombre}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {x.descripcion && <p className="text-xs text-text-2 mt-2 leading-relaxed line-clamp-3">{x.descripcion}</p>}
              {/* Rejilla de tres y no `flex` con `w-full`.

                  Cada foto pedía el 100 % del ancho de la tarjeta y había hasta
                  tres: 300 % más los huecos. Como la tarjeta no recorta, la
                  galería se salía por la derecha y se pintaba ENCIMA de las
                  tarjetas vecinas —se ve en el directorio del evento real, donde
                  un expositor tapa al de al lado—. Con `grid-cols-3` cada foto
                  ocupa un tercio, que es lo que se quería desde el principio. */}
              {Array.isArray(x.galeria) && x.galeria.length > 0 && (
                <div className="grid grid-cols-3 gap-1.5 mt-2">
                  {x.galeria.slice(0, 3).map((url, i) => (
                    <img key={i} src={url} alt="" className="w-full aspect-square rounded-md object-cover min-w-0" />
                  ))}
                </div>
              )}
              {Array.isArray(x.franjas) && x.franjas.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border space-y-1">
                  {x.franjas.slice(0, 4).map(fr => (
                    <p key={fr.id} className="text-[11px] text-text-3 flex items-center gap-1.5">
                      <span className="font-mono text-text-2">{hora(fr.inicio)}</span> {fr.titulo}
                    </p>
                  ))}
                </div>
              )}
              {x.sitio_web && <a href={x.sitio_web} target="_blank" rel="noreferrer noopener" className="text-[11px] text-primary-light hover:underline mt-2 inline-block">Ver sitio →</a>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}


/* ─────────── Agenda del evento ───────────
 *
 * El catálogo tenía veinticinco bloques y ninguno para el PROGRAMA. Se podían
 * poner patrocinadores, galería y testimonios; lo que el evento hace, no. La
 * información existía y vivía sólo en una página hermana a la que hay que
 * saber ir.
 *
 * Enseña lo que viene y enlaza al resto: una landing no es un listado, es una
 * portada. Por eso el tope, y por eso el enlace. */
function AgendaEditor({ data = {}, onChange }) {
  return (
    <div className="space-y-3">
      <input value={data.titulo || ''} onChange={e => onChange({ ...data, titulo: e.target.value })}
        placeholder="Título" className="input" />
      <textarea value={data.subtitulo || ''} onChange={e => onChange({ ...data, subtitulo: e.target.value })}
        placeholder="Subtítulo" rows={2} className="input resize-none" />
      <div className="field">
        <label className="label">Cuántas actividades se enseñan</label>
        <input type="number" min={1} max={24} value={data.limite ?? 6}
          onChange={e => onChange({ ...data, limite: Math.max(1, Math.min(24, Number(e.target.value) || 6)) })}
          className="input" />
        <p className="text-[11px] text-text-3 mt-1">
          Las siguientes por hora. El resto se ve en la página del programa, que se enlaza abajo.
        </p>
      </div>
      <p className="text-[11px] text-text-3">
        Las actividades se crean en «Actividades del evento → Calendario». Aquí sólo se muestran.
      </p>
    </div>
  );
}

function AgendaPreview({ data = {}, evento, isEditor }) {
  const limite = data.limite || 6;
  /* Ordenadas por hora antes de agrupar: `porDia` junta las CONSECUTIVAS del
     mismo día, así que con la lista desordenada saldría el mismo día dos veces
     y en medio otro. Llegan ordenadas del servidor; ordenarlas aquí cuesta nada
     y deja de depender de eso. */
  const todas = [...(evento?.agenda || [])].sort((a, b) => {
    if (!a.inicio) return 1;
    if (!b.inicio) return -1;
    return new Date(a.inicio) - new Date(b.inicio);
  });
  const items = todas.slice(0, limite);
  const fuera = todas.length - items.length;
  if (items.length === 0 && !isEditor) return null;

  const grupos = porDia(items);

  /* Cuántos días quedan fuera del recorte. Se compara contra los días que SÍ
     se enseñan, no contra el total: una actividad más del mismo día no es «un
     día más». */
  const diasEnseñados = new Set(porDia(items).map(g => g.clave));
  const diasFuera = porDia(todas.slice(items.length))
    .map(g => g.clave)
    .filter(c => !diasEnseñados.has(c)).length;
  /* Con un solo día no se pone encabezado: repetiría lo que ya dice la fecha
     del evento justo encima. */
  const porDias = grupos.length > 1;

  /* Agrupando por día, la fecha entera en cada línea sobra: el día ya está
     escrito arriba del grupo, y repetirlo convierte la línea en un párrafo.
     Sin agrupar, se dice entera — si no, no hay forma de saber de qué día es. */
  const cuando = (s) => (s
    ? new Date(s).toLocaleString('es-CO', conZona(evento, porDias
        ? { hour: '2-digit', minute: '2-digit' }
        : { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))
    : null);
  /* La hora de FIN, que llegaba del servidor y no se enseñaba.
     Saber que algo empieza a las 10 sin saber cuándo acaba no deja planear el
     día: quien mira la agenda está decidiendo si le da tiempo a lo siguiente. */
  const hasta = (f) => (f ? fmtHora(f, evento) : null);

  const Fila = ({ s }) => {
    const dentro = (
      <>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-1">{s.titulo}</p>
          <p className="text-[11px] text-text-3 mt-0.5">
            {cuando(s.inicio) || 'Sin fecha'}
            {hasta(s.fin) ? ` – ${hasta(s.fin)}` : ''}
            {s.ubicacion ? ` · ${s.ubicacion}` : ''}
            {/* La sala. Con varias en paralelo —y FESTECH las tiene— sin esto
                no hay forma de saber qué choca con qué. */}
            {s.track ? ` · ${s.track}` : ''}
          </p>
          {/* Qué es. Estaba guardada y no se enseñaba, igual que en el mapa:
              «Torneo gamer» no dice si hay que llevar equipo ni a quién va
              dirigido. Recortada con CSS, que no parte palabras. */}
          {s.descripcion && (
            <p className="text-xs text-text-2 mt-1 leading-relaxed line-clamp-2">{s.descripcion}</p>
          )}
        </div>
        {/* Sólo se marca lo que cambia lo que la persona tiene que hacer: si hay
            que apuntarse, el resto es ruido. Y por eso el aforo va AQUÍ y no
            como un número suelto: «quedan 3» y «completo» son decisiones
            distintas, y «cupo 40» no es ninguna de las dos. */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {s.lleno ? (
            <span className="text-[10px] uppercase tracking-wide bg-surface-2 text-text-3 px-2 py-0.5 rounded">
              Completo
            </span>
          ) : s.requiere_inscripcion && (
            <span className="text-[10px] uppercase tracking-wide bg-surface-2 text-text-2 px-2 py-0.5 rounded">
              {s.libres != null && s.libres <= 10 ? `Quedan ${s.libres}` : 'Con inscripción'}
            </span>
          )}
        </div>
      </>
    );

    /* Entrar a la actividad, igual que desde el mapa: a la agenda pública
       enfocando ésta. En el editor no navega. */
    if (!evento?.slug || isEditor) {
      return <li className="rounded-2xl border border-border bg-surface/40 p-4 flex items-start gap-3">{dentro}</li>;
    }
    return (
      <li>
        <a href={`/explorar/${evento.slug}/agenda?sesion=${encodeURIComponent(s.id)}`}
           className="rounded-2xl border border-border bg-surface/40 p-4 flex items-start gap-3
                      hover:border-border-2 hover:bg-surface-2/50 transition-colors">
          {dentro}
        </a>
      </li>
    );
  };

  return (
    <section>
      <CabeceraSeccion titulo={data.titulo} subtitulo={data.subtitulo} />
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center">
          <p className="text-sm text-text-3">Todavía no hay actividades programadas.</p>
        </div>
      ) : (<>
        {porDias ? grupos.map(g => (
          <div key={g.clave} className="mt-4 first:mt-0">
            <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold mb-2 capitalize">{g.nombre}</p>
            <ul className="space-y-2">
              {g.items.map(s => <Fila key={s.id} s={s} />)}
            </ul>
          </div>
        )) : (
          <ul className="space-y-2">
            {items.map(s => <Fila key={s.id} s={s} />)}
          </ul>
        )}

        {/* Cuántas quedan fuera, y sobre todo si falta un DÍA ENTERO.
            La lista se cortaba en `limite` sin decirlo: con seis de dieciocho,
            lo que se lee es que el evento tiene seis actividades. Y el enlace a
            «el programa completo» no lo desmiente — suena a «lo mismo, en otra
            página».
            Lo de los días no es un adorno: medido con FESTECH y un tope de
            cuatro, el bloque enseña el jueves entero y el viernes DESAPARECE.
            «Hay 1 actividad más» es cierto y no dice lo que hace falta saber,
            que es que hay otro día de evento. */}
        {fuera > 0 && (
          <p className="text-[11px] text-text-3 mt-3">
            {fuera === 1 ? 'Hay 1 actividad más' : `Hay ${fuera} actividades más`}
            {diasFuera > 0 && (diasFuera === 1 ? ', de otro día' : `, de otros ${diasFuera} días`)}.
          </p>
        )}
        {evento?.slug && (
          <a href={`/explorar/${evento.slug}/agenda`} className="inline-block mt-2 text-sm text-primary-light hover:underline">
            Ver el programa completo
          </a>
        )}
      </>)}
    </section>
  );
}

/* ─────────── Torneos ─────────── */
function TorneosEditor({ data = {}, onChange }) {
  return (
    <div className="space-y-3">
      <input value={data.titulo || ''} onChange={e => onChange({ ...data, titulo: e.target.value })}
        placeholder="Título" className="input" />
      <textarea value={data.subtitulo || ''} onChange={e => onChange({ ...data, subtitulo: e.target.value })}
        placeholder="Subtítulo" rows={2} className="input resize-none" />
      <p className="text-[11px] text-text-3">
        Los torneos se crean en «Actividades del evento». Aquí se muestran con su disciplina y
        cuántos equipos llevan inscritos.
      </p>
    </div>
  );
}

function TorneosPreview({ data = {}, evento, isEditor }) {
  const items = evento?.torneos || [];
  if (items.length === 0 && !isEditor) return null;

  const ESTADO = { armando: 'Inscripciones abiertas', en_curso: 'En juego', finalizado: 'Terminado' };

  return (
    <section>
      <CabeceraSeccion titulo={data.titulo} subtitulo={data.subtitulo} />
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center">
          <p className="text-sm text-text-3">Todavía no hay torneos.</p>
        </div>
      ) : (<>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map(t => (
            <div key={t.id} className="rounded-2xl border border-border bg-surface/40 p-4 min-w-0">
              <p className="text-sm font-semibold text-text-1 truncate">{t.nombre}</p>
              {t.disciplina && <p className="text-[11px] text-text-3 mt-0.5">{t.disciplina}</p>}
              <p className="text-[11px] text-text-2 mt-2">
                {/* El número de equipos es lo que dice si el torneo está vivo o
                    es un nombre puesto hace un mes. */}
                {t.equipos || 0} equipo{t.equipos === 1 ? '' : 's'}
                {ESTADO[t.estado] ? ` · ${ESTADO[t.estado]}` : ''}
              </p>
            </div>
          ))}
        </div>
        {evento?.slug && (
          <a href={`/explorar/${evento.slug}/torneo`} className="inline-block mt-3 text-sm text-primary-light hover:underline">
            Ver llaves y resultados
          </a>
        )}
      </>)}
    </section>
  );
}


/* ─────────── Código propio ───────────
 *
 * ── El único bloque que acepta HTML libre, y por qué se puede ────────────
 *
 * Todo el catálogo es un contrato en JSON justamente para que no haya HTML
 * suelto: un `<script>` en la landing correría con el origen del evento y lo ve
 * todo el público. Este bloque es la excepción, y sólo lo es por dónde se
 * pinta.
 *
 * Va dentro de un `iframe` con `sandbox` y **sin `allow-same-origin`**. Eso lo
 * mete en un origen opaco: ahí dentro el código no puede leer las cookies del
 * visitante, ni el token de sesión del organizador que lo está editando, ni
 * tocar la página de alrededor, ni llamar a la API en nombre de nadie. Lo peor
 * que puede hacer es estropear su propio recuadro.
 *
 * `allow-scripts` sí, porque sin eso el bloque no sirve para nada. Las dos
 * juntas —`allow-scripts allow-same-origin`— serían exactamente lo que hay que
 * evitar: el sandbox dejaría de aislar y volveríamos al `<script>` con el origen
 * del evento.
 *
 * ── Y por qué no se sanea el HTML ────────────────────────────────────────
 *
 * Porque sanear invita a creer que el contenido es seguro, y el día que alguien
 * quite el sandbox «total, ya está saneado», la puerta queda abierta. Lo que se
 * guarda es texto; lo que lo hace inofensivo es el iframe.
 */
function CodigoEditor({ data = {}, onChange }) {
  return (
    <div className="space-y-3">
      <input value={data.titulo || ''} onChange={e => onChange({ ...data, titulo: e.target.value })}
        placeholder="Título (opcional)" className="input" />
      <div className="field">
        <label className="label">Tu HTML</label>
        <textarea
          value={data.html || ''}
          onChange={e => onChange({ ...data, html: e.target.value })}
          spellCheck={false} rows={14}
          placeholder={'<div style="font-family: sans-serif"><h2>Hola</h2></div>'}
          className="input w-full font-mono text-[11px] leading-relaxed resize-y" />
        <p className="text-[11px] text-text-3 mt-1.5 leading-relaxed">
          Se pinta dentro de un marco aislado: tu código no puede leer la sesión de nadie ni tocar el
          resto de la página, y el resto de la página tampoco lo toca a él. Los estilos de GESTEK no
          llegan ahí dentro — lo que escribas se ve tal cual.
        </p>
      </div>
      <div className="field">
        <label className="label">Alto (píxeles)</label>
        <input type="number" min={80} max={2000} value={data.alto ?? 320}
          onChange={e => onChange({ ...data, alto: Math.max(80, Math.min(2000, Number(e.target.value) || 320)) })}
          className="input" />
        <p className="text-[11px] text-text-3 mt-1">
          Un marco aislado no puede crecer solo con su contenido: el alto lo pones tú.
        </p>
      </div>
    </div>
  );
}

function CodigoPreview({ data = {}, isEditor }) {
  const html = String(data.html || '').trim();
  if (!html) {
    if (!isEditor) return null;
    return (
      <section>
        <CabeceraSeccion titulo={data.titulo} />
        <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center">
          <p className="text-sm text-text-3">Bloque de código vacío. Escribe tu HTML en el panel de la derecha.</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <CabeceraSeccion titulo={data.titulo} />
      <iframe
        title={data.titulo || 'Código propio'}
        srcDoc={html}
        /* Sin `allow-same-origin`: es lo único que hace que esto sea seguro. */
        sandbox="allow-scripts allow-popups allow-forms"
        loading="lazy"
        className="w-full rounded-2xl border border-border bg-white"
        style={{ height: `${Math.max(80, Math.min(2000, Number(data.alto) || 320))}px` }}
      />
    </section>
  );
}

function CTAPreview({ data, isEditor }) {
  if (!data.texto || !data.url) {
    if (!isEditor) return null;
    return <VacioEditor titulo="Botón sin texto o sin destino" pista="Hacen falta los dos: un botón sin destino no lleva a ninguna parte." />;
  }
  const cls = data.estilo === 'secondary'
    ? 'border border-border-2 text-text-1 hover:bg-surface-2'
    : data.estilo === 'ghost'
      ? 'text-text-1 hover:text-primary-light'
      : 'bg-text-1 text-bg hover:bg-white shadow-[0_0_30px_rgba(241,245,249,0.2)]';
  return (
    <div className="text-center py-2">
      <a href={data.url} target="_blank" rel="noreferrer noopener"
        className={`inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-base font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] ${cls}`}>
        {data.texto} →
      </a>
    </div>
  );
}

/* ─── SÉ EXPOSITOR (registro público de stands) ───
   Invitación para que una empresa registre su stand. El botón apunta a donde
   viva el registro (la sección de Boletas con la boleta-Stand, o un formulario
   de contacto). Al pagar la boleta-Stand se crea su ficha, que edita en
   /expositor/<código> y alimenta el mapa y el directorio. */
function RegistrarStandEditor({ data, onChange }) {
  const beneficios = Array.isArray(data.beneficios) ? data.beneficios : [];
  return (
    <div className="space-y-3">
      <input value={data.titulo || ''} onChange={e => onChange({ ...data, titulo: e.target.value })}
        placeholder="Título" className="w-full bg-transparent text-xl font-bold font-display text-text-1 placeholder:text-text-3 outline-none" />
      <textarea value={data.subtitulo || ''} onChange={e => onChange({ ...data, subtitulo: e.target.value })}
        placeholder="Descripción" rows={2} className="input rounded-xl py-2 text-sm resize-none" />
      <div>
        <label className="label text-xs">Beneficios (uno por línea)</label>
        <textarea value={beneficios.join('\n')} onChange={e => onChange({ ...data, beneficios: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })}
          rows={3} className="input rounded-xl py-2 text-sm resize-none" placeholder="Apareces en el mapa&#10;Das puntos desde tu stand" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input value={data.texto_boton || ''} onChange={e => onChange({ ...data, texto_boton: e.target.value })}
          placeholder="Texto del botón" className="input rounded-xl py-2 text-sm" />
        <input value={data.url || ''} onChange={e => onChange({ ...data, url: e.target.value })}
          placeholder="URL (boletas o contacto)" className="input rounded-xl py-2 text-sm" />
      </div>
      <p className="text-[11px] text-text-3">Apunta el botón a tu sección de Boletas (donde esté la boleta de Stand) o a un formulario de contacto. Al comprarla, la empresa recibe su ficha para llenar, que aparece en el mapa y el directorio.</p>
    </div>
  );
}

function RegistrarStandPreview({ data }) {
  const beneficios = Array.isArray(data.beneficios) ? data.beneficios : [];
  return (
    <div className="rounded-3xl border border-border-2 bg-surface/40 p-8 text-center max-w-2xl mx-auto">
      {data.titulo && <h3 className="text-2xl font-bold font-display text-text-1 tracking-tight">{data.titulo}</h3>}
      {data.subtitulo && <p className="text-sm text-text-2 mt-2 max-w-lg mx-auto">{data.subtitulo}</p>}
      {beneficios.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 mt-5">
          {beneficios.map((b, i) => (
            <li key={i} className="flex items-center gap-1.5 text-sm text-text-2">
              <span className="text-success">✓</span> {b}
            </li>
          ))}
        </ul>
      )}
      {data.texto_boton && data.url && (
        <a href={data.url} target="_blank" rel="noreferrer noopener"
          className="inline-flex items-center gap-2 px-7 py-3.5 mt-6 rounded-full text-base font-semibold bg-text-1 text-bg hover:bg-white transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_30px_rgba(241,245,249,0.2)]">
          {data.texto_boton} →
        </a>
      )}
    </div>
  );
}

/* ─── SEPARADOR ─── */
function SeparadorEditor({ data, onChange }) {
  return (
    <div className="space-y-2">
      <select value={data.estilo || 'linea'} onChange={e => onChange({ ...data, estilo: e.target.value })}
        className="input bg-surface-2 rounded-xl py-2 text-sm w-auto">
        <option value="linea">Línea fina</option>
        <option value="puntos">Puntos centrados</option>
        <option value="espacio">Espacio en blanco</option>
      </select>
      <div className="py-6"><SeparadorPreview data={data} /></div>
    </div>
  );
}
function SeparadorPreview({ data }) {
  const e = data.estilo || 'linea';
  if (e === 'puntos') return <div className="text-center text-text-3 tracking-widest text-2xl">· · ·</div>;
  if (e === 'espacio') return <div className="h-12" />;
  return <div className="h-px bg-border max-w-md mx-auto" />;
}

/* ─── CITA ─── */
function CitaEditor({ data, onChange }) {
  return (
    <div className="space-y-3">
      <textarea value={data.texto || ''} onChange={e => onChange({ ...data, texto: e.target.value })}
        placeholder="Una cita inspiradora, testimonio, o destacado..."
        rows={3}
        className="w-full bg-transparent text-xl font-display text-text-1 placeholder:text-text-3 outline-none resize-none italic leading-snug" />
      <input value={data.autor || ''} onChange={e => onChange({ ...data, autor: e.target.value })}
        placeholder="— Autor"
        className="w-full bg-transparent text-sm text-text-2 placeholder:text-text-3 outline-none" />
    </div>
  );
}
function CitaPreview({ data, isEditor }) {
  if (!data.texto?.trim()) {
    if (!isEditor) return null;
    return <VacioEditor titulo="Sin cita" pista="Escribe el testimonio y, si quieres, de quién es." />;
  }
  return (
    <blockquote className="border-l-2 border-text-1 pl-6 py-2 max-w-2xl mx-auto">
      <p className="text-xl sm:text-2xl font-display text-text-1 italic leading-snug mb-3">"{data.texto}"</p>
      {data.autor && <footer className="text-sm text-text-3">— {data.autor}</footer>}
    </blockquote>
  );
}

/* ============================================================
   REGISTRY
   ============================================================ */

/* ⚠️ Este catálogo tiene un gemelo en el servidor —`lib/bloquesLanding.js` del
   backend—, que es quien VALIDA lo que se guarda.

   No se puede unificar del todo: aquí cada bloque trae sus componentes React
   de edición y vista previa, y eso no viaja por HTTP. Lo que se comparte es el
   contrato: los tipos y qué campos admite cada uno.

   Lo que impide que se separen en silencio —que es lo que pasó dos veces en
   este proyecto, con los tipos de campo del formulario y con las plantillas de
   correo— es que el servidor RECHAZA lo que no conoce. Si añades un bloque
   aquí y no allá, guardar la landing falla con un mensaje que enumera los
   tipos válidos. Molesta en el momento y evita enterarse con la página pública
   ya rota delante del público. */
export const BLOCKS = {
  /* SYSTEM */
  portada: {
    label: 'Portada', category: 'sistema', icon: IconCover,
    defaults: {},
    Preview: PortadaPreview,
    Editor: PortadaEditor,
  },
  galeria_evento: {
    label: 'Galería del evento', category: 'sistema', icon: IconGaleria,
    defaults: {},
    Preview: GaleriaEventoPreview,
    Editor: GaleriaEventoEditor,
  },
  titulo: {
    label: 'Título del evento', category: 'sistema', icon: IconTitulo,
    defaults: {},
    Preview: TituloPreview,
    Editor: TituloEditor,
  },
  descripcion: {
    label: 'Descripción', category: 'sistema', icon: IconDesc,
    defaults: {},
    Preview: DescripcionPreview,
    Editor: DescripcionEditor,
  },
  info: {
    label: 'Información (fecha, lugar...)', category: 'sistema', icon: IconInfo,
    defaults: {},
    Preview: InfoPreview,
    Editor: InfoEditor,
  },
  direccion: {
    label: 'Dirección', category: 'sistema', icon: IconDir,
    defaults: {},
    Preview: DireccionPreview,
    Editor: DireccionEditor,
  },
  links: {
    label: 'Links / redes sociales', category: 'sistema', icon: IconLinks,
    defaults: {},
    Preview: LinksPreview,
    Editor: LinksEditor,
  },
  tickets: {
    label: 'Boletas / tickets', category: 'sistema', icon: IconTickets,
    defaults: {},
    Preview: TicketsPreview,
    Editor: TicketsEditor,
  },

  /* CUSTOM */
  hero: {
    label: 'Hero / banner', category: 'custom', icon: IconHero,
    defaults: { titulo: 'Bienvenido al evento', subtitulo: '', imagen: '', cta_texto: '', cta_url: '', alto: 320 },
    Editor: HeroEditor, Preview: HeroPreview,
  },
  texto: {
    label: 'Texto', category: 'custom', icon: IconTexto,
    defaults: { titulo: '', texto: '' },
    Editor: TextoEditor, Preview: TextoPreview,
  },
  speakers: {
    label: 'Speakers / ponentes', category: 'custom', icon: IconSpeakers,
    defaults: { titulo: 'Speakers', items: [{ nombre: '', cargo: '', empresa: '', foto: '', bio: '' }] },
    Editor: SpeakersEditor, Preview: SpeakersPreview,
  },
  sponsors: {
    label: 'Patrocinadores', category: 'custom', icon: IconSponsors,
    defaults: { titulo: 'Patrocinadores', items: [] },
    Editor: SponsorsEditor, Preview: SponsorsPreview,
  },
  mapa: {
    label: 'Mapa', category: 'custom', icon: IconMapa,
    defaults: { titulo: 'Cómo llegar', direccion: '' },
    Editor: MapaEditor, Preview: MapaPreview,
  },
  countdown: {
    label: 'Countdown', category: 'custom', icon: IconCount,
    defaults: { titulo: 'Faltan', fecha: null },
    Editor: CountdownEditor, Preview: CountdownPreview,
  },
  galeria: {
    label: 'Galería custom', category: 'custom', icon: IconGaleria,
    defaults: { titulo: '', urls: [] },
    Editor: GaleriaEditor, Preview: GaleriaPreview,
  },
  video: {
    label: 'Video', category: 'custom', icon: IconVideo,
    defaults: { titulo: '', url: '' },
    Editor: VideoEditor, Preview: VideoPreview,
  },
  redes: {
    label: 'Redes sociales', category: 'custom', icon: IconRedes,
    defaults: { titulo: 'Síguenos', items: [{ tipo: 'instagram', url: '' }] },
    Editor: RedesEditor, Preview: RedesPreview,
  },
  faq: {
    label: 'FAQ', category: 'custom', icon: IconFAQ,
    defaults: { titulo: 'Preguntas frecuentes', items: [{ q: '', a: '' }] },
    Editor: FAQEditor, Preview: FAQPreview,
  },
  recompensas: {
    label: 'Premios y recompensas', category: 'custom', icon: IconRecompensas,
    defaults: { titulo: 'Gana puntos y canjéalos', subtitulo: 'Participa en los stands y actividades del evento: acumulas puntos en tu escarapela y los cambias por premios.' },
    Editor: RecompensasEditor, Preview: RecompensasPreview,
  },
  expositores: {
    label: 'Directorio de expositores', category: 'custom', icon: IconExpositores,
    defaults: { titulo: 'Expositores', subtitulo: 'Las empresas y marcas que estarán en el evento.' },
    Editor: ExpositoresEditor, Preview: ExpositoresPreview,
  },
  registrar_stand: {
    label: 'Sé expositor (registro)', category: 'custom', icon: IconExpositores,
    defaults: {
      titulo: '¿Quieres un stand en el evento?',
      subtitulo: 'Registra tu empresa como expositor: aparece en el mapa y el directorio, da puntos y premios a los asistentes desde tu stand y arma tu propio cronograma.',
      beneficios: ['Apareces en el mapa y el directorio', 'Das puntos y premios desde tu stand', 'Tu propio cronograma de actividades'],
      texto_boton: 'Registrar mi stand', url: '',
    },
    Editor: RegistrarStandEditor, Preview: RegistrarStandPreview,
  },
  agenda: {
    label: 'Programa / agenda', category: 'custom', icon: IconInfo,
    defaults: { titulo: 'Qué pasa en el evento', subtitulo: 'Las próximas actividades del programa.', limite: 6 },
    Editor: AgendaEditor, Preview: AgendaPreview,
  },
  torneos: {
    label: 'Torneos', category: 'custom', icon: IconRecompensas,
    defaults: { titulo: 'Torneos', subtitulo: 'Compite o ven a mirar.' },
    Editor: TorneosEditor, Preview: TorneosPreview,
  },
  codigo: {
    label: 'Código propio', category: 'custom', icon: IconTexto,
    defaults: { titulo: '', html: '', alto: 320 },
    Editor: CodigoEditor, Preview: CodigoPreview,
  },
  mapa_evento: {
    label: 'Mapa del evento', category: 'custom', icon: IconMapa,
    defaults: { titulo: 'Mapa del evento', subtitulo: 'Toca un expositor para ver su información.' },
    Editor: MapaEventoEditor, Preview: MapaEventoPreview,
  },
  cta: {
    label: 'Botón CTA', category: 'custom', icon: IconCTA,
    defaults: { texto: 'Inscríbete', url: '', estilo: 'primary' },
    Editor: CTAEditor, Preview: CTAPreview,
  },
  cita: {
    label: 'Cita / testimonio', category: 'custom', icon: IconCita,
    defaults: { texto: '', autor: '' },
    Editor: CitaEditor, Preview: CitaPreview,
  },
  separador: {
    label: 'Separador', category: 'custom', icon: IconSep,
    defaults: { estilo: 'linea' },
    Editor: SeparadorEditor, Preview: SeparadorPreview,
  },
};

export const BLOCK_TYPES_SISTEMA = Object.keys(BLOCKS).filter(k => BLOCKS[k].category === 'sistema');
export const BLOCK_TYPES_CUSTOM  = Object.keys(BLOCKS).filter(k => BLOCKS[k].category === 'custom');
