import { useState, useEffect } from 'react';
import { eventosApi } from '../../../../api/eventos.js';
import { ticketsApi } from '../../../../api/tickets.js';
import { emailsApi } from '../../../../api/emails.js';
import { useToast } from '../../../../context/ToastContext.jsx';
import ImagePicker from '../../../../components/ui/ImagePicker.jsx';
import BuzonPropio from './BuzonPropio.jsx';
import BoletasSinCorreo from './BoletasSinCorreo.jsx';
import EstadoCola from './EstadoCola.jsx';
import { confirmDialog } from '../../../../components/ui/Confirm.jsx';

/* Event Experience · Emails — editor de las plantillas de correo por tipo,
   con variables y segmentación de destinatarios. Se guarda en
   page_json.emails (sin migración). El ENVÍO usa el servicio de correo del
   backend (routes/emails.js): /emails/prueba y /emails/enviar.

   Los `id` de abajo deben coincidir EXACTO con IDS_TIPOS de
   lib/emailPlantillas.js en el backend — si no, /emails/prueba y
   /emails/enviar responden 400 "Tipo de correo desconocido." (bug real que
   hubo aquí: esta pantalla usaba 'confirmacion' y 'recordatorio', que no
   existen en el catálogo del backend; ahí son 'ticket' y
   'recordatorio_7d'/'1d'/'1h'). 'bienvenida' y 'cancelacion' no tienen
   ningún id equivalente en el backend todavía — no hay disparador para
   ellos — así que se dejan solo como borrador (sin botón de prueba/envío)
   hasta que el backend los soporte. */

const TIPOS = [
  { id: 'ticket',        label: 'Confirmación de compra', desc: 'Al comprar/reservar. Incluye QR y código.',            auto: true,  soportado: true },
  { id: 'bienvenida',    label: 'Bienvenida',              desc: 'Primer correo al inscribirse. Aún sin disparador en el backend — solo puedes guardar el borrador.', auto: true,  soportado: false },
  { id: 'recordatorio_1d', label: 'Recordatorio (1 día antes)', desc: 'Antes del evento. El backend también manda uno a 7 días y otro a 1 hora, con su propio texto por defecto.', auto: true, soportado: true },
  { id: 'cancelacion',   label: 'Cancelación',             desc: 'Si se cancela una boleta o el evento. Aún sin disparador en el backend — solo puedes guardar el borrador.', auto: true,  soportado: false },
  { id: 'personalizado',label: 'Campaña personalizada',   desc: 'Envío manual a un segmento que elijas.',  auto: false, soportado: true },
];

const VARIABLES = ['{{nombre}}', '{{evento}}', '{{fecha}}', '{{lugar}}', '{{tipo_boleta}}', '{{codigo}}'];

function plantillaDefecto(tipo) {
  const base = {
    asunto: '', encabezado: '', cuerpo: '',
    boton_texto: '', boton_url: '', mostrar_qr: false, imagen: '', footer: '',
    /* El diseño del organizador: cabecera arriba, pie abajo, y el color del
       centro. Viajan en page_json.emails, así que no hizo falta migración. */
    pie_imagen: '', fondo: '',
  };
  if (tipo === 'ticket')          return { ...base, asunto: 'Tu boleta para {{evento}}', encabezado: '¡Listo, {{nombre}}!', cuerpo: 'Tu inscripción a {{evento}} quedó confirmada. Muestra este QR en la entrada.', mostrar_qr: true };
  if (tipo === 'bienvenida')      return { ...base, asunto: 'Bienvenido a {{evento}}', encabezado: 'Hola {{nombre}}', cuerpo: 'Gracias por sumarte a {{evento}}. Pronto te enviaremos más detalles.' };
  if (tipo === 'recordatorio_1d') return { ...base, asunto: '{{evento}} es {{fecha}}', encabezado: '¡Ya casi, {{nombre}}!', cuerpo: 'Te recordamos que {{evento}} es {{fecha}} en {{lugar}}. ¡Te esperamos!' };
  if (tipo === 'cancelacion')     return { ...base, asunto: 'Cancelación · {{evento}}', encabezado: 'Hola {{nombre}}', cuerpo: 'Tu boleta de {{tipo_boleta}} para {{evento}} fue cancelada. Si tienes dudas, respóndenos.' };
  return { ...base, asunto: '', encabezado: 'Hola {{nombre}}', cuerpo: '' };
}

export default function EmailsSection({ evento, reload }) {
  const { success, error } = useToast();
  const [tipo, setTipo] = useState('ticket');
  const [data, setData] = useState({});
  const [tipos, setTipos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [segmento, setSegmento] = useState('todos');
  const [enviando, setEnviando] = useState(false);

  /* `null` mientras no se sepa; `false` avisa de que la 0052 no está aplicada
     y de que lo que se guarde se queda en el sitio viejo. */
  const [almacenListo, setAlmacenListo] = useState(null);
  /* El diagnóstico del proveedor viaja en la MISMA respuesta y nadie lo
     pintaba. Sin proveedor configurado no se envía nada —y no falla: se
     descarta—, así que el organizador escribe plantillas, le da a enviar y no
     pasa nada, sin un solo aviso. */
  const [diagnostico, setDiagnostico] = useState(null);
  /* La prueba de conexión de verdad: null = no se ha probado. */
  const [conexion, setConexion] = useState(null);
  const [probando, setProbando] = useState(false);

  useEffect(() => {
    /* De la TABLA, no de `page_json`. El GET hereda lo que quedara en el sitio
       viejo, así que lo ya escrito sigue apareciendo. */
    emailsApi.plantillas(evento.id)
      .then((d) => {
        setData(d.plantillas || {});
        setAlmacenListo(d.almacenamiento_listo !== false);
        setDiagnostico(d.diagnostico || null);
      })
      .catch(() => {
        /* Si la petición falla del todo, se vuelve a lo que trae el evento:
           mejor enseñar lo que hay que una pantalla vacía. */
        setData(evento.page_json?.emails || {});
        setAlmacenListo(false);
      });
    /* Sólo para el «Enviar de prueba»: acota a qué tipo de boleta se simula el
       correo. Sin lista, la prueba sale con el tipo genérico; las plantillas,
       que es a lo que se viene, se editan igual. */
    ticketsApi.list(evento.id).then(d => setTipos((d.tickets || d.tipos || []).filter(t => (t.descripcion || '') !== 'GESTEK_INVITACION'))).catch(() => {});
  }, [evento.id, evento.page_json]);

  const plantilla = { ...plantillaDefecto(tipo), ...(data[tipo] || {}) };
  const setP = (patch) => setData(d => ({ ...d, [tipo]: { ...plantilla, ...patch } }));

  const persistir = async () => {
    if (almacenListo) {
      /* Sólo el tipo que se está editando: la tabla guarda una fila por tipo, y
         mandar las diez pisaría plantillas que nadie tocó. */
      const { tipo: _t, updated_at: _u, origen: _o, ...limpia } = plantilla;
      await emailsApi.guardarPlantilla(evento.id, tipo, limpia);
      return;
    }
    /* Sin la 0052 aplicada, el sitio viejo sigue siendo el único que hay. */
    await eventosApi.update(evento.id, { page_json: { emails: data } });
    /* Sin esto, el `evento` que tiene el padre (EventWorkspace) se queda con
       el page_json de ANTES de guardar. Si el usuario cambia de pestaña y
       vuelve, este componente se vuelve a montar y relee
       `evento.page_json.emails` desde esa copia vieja — "borrando" en
       pantalla lo que sí quedó guardado en el servidor. */
    await reload?.();
  };

  const guardar = async () => {
    setSaving(true);
    try { await persistir(); success('Plantillas de correo guardadas.'); }
    catch (e) { error(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  /* Volver a la de fábrica.
     Se podía escribir y guardar, no deshacer: quien dejaba una plantilla hecha
     un lío tenía que reconstruir el texto original a mano. Borrar la fila es
     justo eso — el servidor cae a la plantilla de fábrica, que es la que
     manda cuando no hay ninguna escrita. Por eso el botón no dice «borrar». */
  const volverAFabrica = async () => {
    if (!(await confirmDialog({
      title: 'Volver a la plantilla de fábrica',
      message: 'Se pierde lo que escribiste en este correo y vuelve el texto original. Los demás tipos no se tocan.',
      confirmLabel: 'Volver a la de fábrica',
      danger: true,
    }))) return;
    setSaving(true);
    try {
      await emailsApi.borrarPlantilla(evento.id, tipo);
      const d = await emailsApi.plantillas(evento.id);
      setData(d.plantillas || {});
      success('Vuelve la plantilla de fábrica.');
    } catch (e) { error(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  /* Prueba: guarda primero (el backend lee la plantilla del evento) y envía. */
  const enviarPrueba = async () => {
    setEnviando(true);
    try {
      await persistir();
      const r = await emailsApi.prueba(evento.id, tipo);
      success(`Correo de prueba enviado a ${r.enviado_a}.`);
    } catch (e) { error(e.response?.data?.error || e.message); }
    finally { setEnviando(false); }
  };

  const insertarVar = (v) => setP({ cuerpo: (plantilla.cuerpo || '') + ' ' + v });

  const enviarCampana = async () => {
    setEnviando(true);
    try {
      await persistir();
      const r = await emailsApi.enviar(evento.id, { tipo, audiencia: segmento });
      if (r.modo === 'cola') {
        success(`Se encolaron ${r.encolados} de ${r.total} destinatarios — se van a enviar de a poco (hasta ${r.por_hora}/hora).`);
      } else if (r.fallidos > 0) {
        error(`Enviados ${r.enviados} de ${r.total}. Fallaron ${r.fallidos}.`);
      } else {
        success(`Campaña enviada a ${r.enviados} destinatario${r.enviados !== 1 ? 's' : ''}.`);
      }
    } catch (e) { error(e.response?.data?.error || e.message); }
    finally { setEnviando(false); }
  };

  const meta = TIPOS.find(t => t.id === tipo);

  /* La previa se pide al servidor con un respiro: escribir en el cuerpo
     dispararía una petición por tecla. 400 ms es lo que tarda una pausa al
     escribir, y el `setTimeout` se cancela en cada cambio. */
  const [previa, setPrevia] = useState({ cargando: true });
  useEffect(() => {
    let vivo = true;
    setPrevia(p => ({ ...p, cargando: true }));
    const id = setTimeout(() => {
      emailsApi.previsualizar(evento.id, tipo, plantilla)
        .then(d => { if (vivo) setPrevia({ asunto: d.asunto, html: d.html }); })
        .catch(e => { if (vivo) setPrevia({ error: e.response?.data?.error || e.message }); });
    }, 400);
    return () => { vivo = false; clearTimeout(id); };
  }, [evento.id, tipo, plantilla]);

  return (
    <div className="space-y-5">
    {/* Desde que correo salen: va arriba porque decide si los correos de este
        evento llevan la direccion del organizador o la de la plataforma. */}
    {/* Antes que nada: si no hay por dónde salir, el resto de esta pantalla es
        decoración. */}
    {diagnostico && !diagnostico.configurado && (
      <div className="rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3">
        <p className="text-sm text-text-1 font-medium">Ahora mismo no sale ningún correo.</p>
        <p className="text-xs text-text-2 mt-1 leading-relaxed">
          No hay servidor de correo configurado en la plataforma. Las plantillas se guardan, pero
          los envíos se descartan —sin error—, así que nadie recibe su boleta. Configura el buzón
          del evento aquí abajo, o pídele al administrador que conecte el de la plataforma.
        </p>
      </div>
    )}

    {/* ── «Configurado» no es «funciona» ──────────────────────────────────
     *
     * El diagnóstico que llega con las plantillas dice si las VARIABLES están
     * puestas. Una contraseña equivocada da `configurado: true` y los envíos se
     * descartan en silencio: nadie recibe su boleta y en el panel todo se ve
     * bien. La ruta que lo comprueba de verdad existe desde el primer día —
     * abre la conexión y hace login— y no la llamaba nadie: su propio
     * comentario daba por hecho un botón «Probar conexión» que nunca se
     * construyó.
     *
     * Se prueba al PULSAR y no al entrar: tarda un segundo, y esta pantalla se
     * abre para editar plantillas, no para diagnosticar. */}
    {diagnostico?.configurado && (
      <div className="rounded-2xl border border-border bg-surface/40 px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-text-2 leading-relaxed flex-1 min-w-[14rem]">
            Las credenciales están puestas. Eso no garantiza que el correo salga:
            una contraseña equivocada se ve igual desde aquí.
          </p>
          <button type="button" disabled={probando}
            onClick={async () => {
              setProbando(true); setConexion(null);
              try {
                const d = await emailsApi.probarConexion(evento.id);
                setConexion(d.conexion || { ok: false, mensaje: 'No pudimos comprobarlo.' });
              } catch (e) {
                setConexion({ ok: false, mensaje: e.response?.data?.error || e.message });
              } finally { setProbando(false); }
            }}
            className="btn-secondary btn-sm flex-shrink-0">
            {probando ? 'Probando…' : 'Probar conexión'}
          </button>
        </div>

        {conexion && (
          <div className={`mt-2 rounded-xl px-3 py-2 border ${conexion.ok
            ? 'border-success/30 bg-success/5'
            : 'border-danger/30 bg-danger/5'}`}>
            <p className="text-xs text-text-1">
              {conexion.ok
                ? 'El servidor de correo respondió y aceptó las credenciales.'
                : conexion.mensaje || 'El servidor de correo no aceptó las credenciales.'}
            </p>
            {/* La sugerencia del servidor dice DÓNDE mirar. Sin ella, «no se
                pudo conectar» manda a revisar todo. */}
            {!conexion.ok && conexion.sugerencia && (
              <p className="text-[11px] text-text-3 mt-1 leading-relaxed">{conexion.sugerencia}</p>
            )}
          </div>
        )}
      </div>
    )}

    {diagnostico?.configurado && !diagnostico.frontend_url && (
      /* El fallo más difícil de ver: el correo sale bien y sus enlaces llevan a
         otro sitio. Nadie se entera hasta que un asistente hace clic. */
      <div className="rounded-2xl border border-warning/30 bg-warning/5 px-4 py-3">
        <p className="text-xs text-text-2 leading-relaxed">
          Los correos salen, pero la plataforma no sabe cuál es su propia dirección
          (<code>FRONTEND_URL</code>), así que los enlaces del correo —ver la boleta, el QR—
          pueden apuntar a un dominio que no es el tuyo.
        </p>
      </div>
    )}

    <BuzonPropio evento={evento} />

    {/* Justo debajo del buzón: quien viene aquí porque «a fulano no le llegó»
        encuentra la respuesta antes de ponerse a revisar plantillas. */}
    <BoletasSinCorreo evento={evento} />
    <EstadoCola evento={evento} />

    <div className="grid lg:grid-cols-[240px_1fr_340px] gap-5 items-start">
      {/* Tipos de correo */}
      <aside className="rounded-2xl border border-border bg-surface/60 overflow-hidden">
        <p className="px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-text-3 border-b border-border">Tipos de correo</p>
        <ul className="p-2 space-y-0.5">
          {TIPOS.map(t => (
            <li key={t.id}>
              <button onClick={() => setTipo(t.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${tipo === t.id ? 'bg-accent/10 border border-accent/40' : 'hover:bg-surface-2 border border-transparent'}`}>
                <p className={`text-sm font-medium ${tipo === t.id ? 'text-text-1' : 'text-text-2'}`}>{t.label}</p>
                <p className="text-[11px] text-text-3 leading-snug mt-0.5">{t.desc}</p>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Editor de la plantilla */}
      <div className="space-y-4">
        <div className="card">
          <div className="card-header">
            <h3 className="text-base font-semibold text-text-1">{meta?.label}</h3>
            {meta?.auto ? <span className="badge badge-green text-[10px]">Automático</span> : <span className="badge badge-purple text-[10px]">Manual</span>}
          </div>
          <div className="card-body space-y-4">
            {!meta?.soportado && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-200">
                Este tipo de correo todavía no tiene disparador automático en el backend. Puedes escribir y guardar el borrador, pero "Enviarme una prueba" y "Enviar campaña" no están disponibles para él.
              </div>
            )}
            <div>
              <label className="label">Asunto</label>
              <input className="input" value={plantilla.asunto} onChange={e => setP({ asunto: e.target.value })} placeholder="Asunto del correo" />
            </div>
            <div>
              <label className="label">Encabezado</label>
              <input className="input" value={plantilla.encabezado} onChange={e => setP({ encabezado: e.target.value })} placeholder="Título grande dentro del correo" />
            </div>
            <div>
              <label className="label">Cuerpo</label>
              <textarea rows={4} className="input !h-auto resize-none" value={plantilla.cuerpo} onChange={e => setP({ cuerpo: e.target.value })} placeholder="Contenido del correo…" />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {VARIABLES.map(v => (
                  <button key={v} onClick={() => insertarVar(v)} className="px-2 py-1 rounded-md bg-surface-2 text-[11px] font-mono text-text-2 hover:text-text-1 transition-colors">{v}</button>
                ))}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Texto del botón <span className="lowercase tracking-normal font-normal text-text-3">(opcional)</span></label>
                <input className="input" value={plantilla.boton_texto} onChange={e => setP({ boton_texto: e.target.value })} placeholder="Ver mi boleta" />
              </div>
              <div>
                <label className="label">Enlace del botón</label>
                <input className="input font-mono text-xs" value={plantilla.boton_url} onChange={e => setP({ boton_url: e.target.value })} placeholder="https://…" />
              </div>
            </div>
            {/* Tu diseño, partido en dos.

                Lo que se pide siempre es subir la plantilla entera y escribir
                el texto encima. No se puede: una imagen de fondo bajo el
                texto se cae en Outlook de escritorio y Gmail la recorta en el
                móvil, y un QR sobre una foto pierde lectura el día del
                evento, que es justo cuando no puede fallar.

                Partida en cabecera y pie sí funciona en todos los clientes, y
                el centro sigue siendo texto de verdad: se selecciona, se
                traduce y lo lee un lector de pantalla. */}
            <div className="rounded-2xl border border-border bg-surface/40 p-4 space-y-3">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">Tu plantilla</p>
                <p className="text-[11px] text-text-3 mt-1 leading-relaxed">
                  Sube tu diseño partido en dos: lo de arriba y lo de abajo. El texto y el QR van en medio,
                  sobre el color que elijas. Ancho recomendado: 560&nbsp;px.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Cabecera <span className="lowercase tracking-normal font-normal text-text-3">(arriba)</span></label>
                  <ImagePicker value={plantilla.imagen} onChange={v => setP({ imagen: v })} ownerId={evento.id} placeholder="Cabecera del correo" />
                </div>
                <div>
                  <label className="label">Pie <span className="lowercase tracking-normal font-normal text-text-3">(abajo)</span></label>
                  <ImagePicker value={plantilla.pie_imagen} onChange={v => setP({ pie_imagen: v })} ownerId={evento.id} placeholder="Pie del correo" />
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="label !mb-0">Color del centro</label>
                <input type="color" value={plantilla.fondo || '#12100B'} onChange={e => setP({ fondo: e.target.value })}
                  className="h-9 w-14 rounded-lg border border-border bg-transparent cursor-pointer" />
                <input className="input !h-9 w-32 font-mono text-xs" value={plantilla.fondo || ''}
                  onChange={e => setP({ fondo: e.target.value })} placeholder="#12100B" />
                {plantilla.fondo && (
                  <button type="button" onClick={() => setP({ fondo: '' })}
                    className="text-[11px] text-text-3 hover:text-text-1">Usar el de la marca</button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-text-2 cursor-pointer">
                <input type="checkbox" checked={plantilla.mostrar_qr} onChange={e => setP({ mostrar_qr: e.target.checked })} className="accent-[#8B5CF6]" /> Incluir QR de la boleta
              </label>
              <input className="input !h-9 flex-1 min-w-[180px]" value={plantilla.footer} onChange={e => setP({ footer: e.target.value })} placeholder="Pie de página (opcional)" />
            </div>
          </div>
        </div>

        {/* Segmentación (solo campaña personalizada) */}
        {tipo === 'personalizado' && (
          <div className="card">
            <div className="card-header"><h3 className="text-base font-semibold text-text-1">Destinatarios</h3></div>
            <div className="card-body space-y-3">
              <select className="input" value={segmento} onChange={e => setSegmento(e.target.value)}>
                <option value="todos">Todos los asistentes</option>
                <option value="equipo">Colaboradores (equipo del evento)</option>
                {tipos.map(t => <option key={t.id} value={`tipo:${t.id}`}>Asistentes con boleta: {t.nombre}</option>)}
              </select>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={enviarCampana} disabled={enviando} className="btn-primary btn-sm">{enviando ? 'Enviando…' : 'Enviar campaña'}</button>
                <button onClick={enviarPrueba} disabled={enviando} className="btn-secondary btn-sm">Enviarme una prueba</button>
              </div>
              <p className="text-xs text-text-3">Segmenta por tipo de boleta (VIP, stand, general…) o al equipo. El envío se habilita al desplegar el servicio de correo.</p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          {/* Sólo si hay algo escrito que deshacer: en una plantilla que nunca
              se tocó, «volver a la de fábrica» no hace nada y ocupa sitio. */}
          {almacenListo && data[tipo] && (
            <button onClick={volverAFabrica} disabled={saving}
              className="btn-ghost text-danger/80 hover:text-danger mr-auto">
              Volver a la de fábrica
            </button>
          )}
          {meta?.soportado && (
            <button onClick={enviarPrueba} disabled={enviando || saving} className="btn-secondary">{enviando ? 'Enviando…' : 'Enviarme una prueba'}</button>
          )}
          <button onClick={guardar} disabled={saving} className="btn-primary">{saving ? 'Guardando…' : 'Guardar plantillas'}</button>
        </div>
      </div>

      {/* Vista previa del correo — la del SERVIDOR.

          Aquí había una imitación en JSX del correo: su propio maquetado, su
          propia sustitución de variables y su propia copia de `esClaro`. Es
          decir, **dos renderizadores del mismo correo**, y el que el
          organizador aprobaba no era el que salía. Se aprobaba una maqueta.

          Ahora se pide al mismo `renderEmail` que arma el envio de verdad y se
          pinta su HTML en un `iframe` aislado: lo que se ve es, literalmente,
          lo que se manda. El `sandbox` va vacío —sin scripts— porque esto es
          contenido para pintar, no una aplicación. */}
      <div className="lg:sticky lg:top-4 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-text-3">Vista previa</p>
          {previa?.cargando && <span className="text-[11px] text-text-3">actualizando…</span>}
        </div>

        {previa?.error ? (
          <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4 text-sm text-text-2">
            No se pudo generar la previa: {previa.error}
            <p className="text-[11px] text-text-3 mt-1.5">
              El correo se sigue pudiendo guardar y enviar; lo que falta es la imagen de cómo queda.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border overflow-hidden bg-white">
            <div className="px-5 py-3 text-xs text-slate-500 border-b border-slate-200 truncate bg-slate-50">
              {previa?.asunto || '(sin asunto)'}
            </div>
            <iframe
              title="Vista previa del correo"
              srcDoc={previa?.html || ''}
              sandbox=""
              className="w-full block"
              style={{ height: 520, border: 0 }}
            />
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
