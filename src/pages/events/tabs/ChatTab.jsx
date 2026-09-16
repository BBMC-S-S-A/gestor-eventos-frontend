import { useEffect, useState, useRef, useCallback } from 'react';
import { chatApi } from '../../../api/chat.js';
import { rolesApi } from '../../../api/roles.js';
import { equipoApi } from '../../../api/equipo.js';
import { useSondeo } from '../../../hooks/useSondeo.js';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import Spinner from '../../../components/ui/Spinner.jsx';
import GLoader from '../../../components/ui/GLoader.jsx';
import { confirmDialog } from '../../../components/ui/Confirm.jsx';
import { uploadEventImage } from '../../../components/ui/CoverUploader.jsx';

/* Chat staff por evento — sidebar de canales + área de mensajes con sondeo. */

const TIPO_LABEL = {
  general: 'General',
  staff  : 'Staff',
  vip    : 'VIP',
  org    : 'Org',
};

export default function ChatTab({ evento }) {
  const { usuario } = useAuth();
  const { error: toastErr, success } = useToast();

  const [channels, setChannels] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [creating, setCreating] = useState(null); // null | 'root' | parentId
  const [verArchivados, setVerArchivados] = useState(false);
  const [puedeCrear, setPuedeCrear] = useState(false);
  const [roles, setRoles] = useState([]);
  const [miembros, setMiembros] = useState([]);
  const [dmPicker, setDmPicker] = useState(false);

  /* Cargar canales + roles + miembros al montar */
  useEffect(() => {
    Promise.all([
      chatApi.channels(evento.id),
      rolesApi.list(evento.id).catch(() => ({ roles: [] })),
      equipoApi.list(evento.id).catch(() => ({ miembros: [], owner: null })),
    ])
      .then(([d, r, eq]) => {
        const list = d.channels || [];
        setChannels(list);
        setPuedeCrear(Boolean(d.puedeCrear));
        setRoles(r.roles || []);
        const staff = [
          ...(eq.owner ? [{ id: eq.owner.id, nombre: eq.owner.nombre || 'Organizador', avatar: eq.owner.avatar_url }] : []),
          ...(eq.miembros || []).map(m => ({ id: m.profile?.id || m.user_id, nombre: m.profile?.nombre || m.nombre_invitado || m.email, avatar: m.profile?.avatar_url })),
        ].filter(s => s.id && s.id !== usuario?.id);
        setMiembros(staff);
        const primerNoDM = list.find(c => c.tipo !== 'dm');
        if (primerNoDM && !activeId) setActiveId(primerNoDM.id);
      })
      .catch(e => toastErr(e.message))
      .finally(() => setLoadingChannels(false));
    /* eslint-disable-next-line */
  }, [evento.id]);

  const abrirDM = async (userId) => {
    setDmPicker(false);
    try {
      const d = await chatApi.abrirDM(evento.id, userId);
      setChannels(c => c.some(x => x.id === d.channel.id) ? c.map(x => x.id === d.channel.id ? { ...x, ...d.channel } : x) : [...c, d.channel]);
      setActiveId(d.channel.id);
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
  };

  const onCrearCanal = async (nombre, parentId = null, rolIds = []) => {
    try {
      const d = await chatApi.crearChannel(evento.id, { nombre, parent_id: parentId, rol_ids: rolIds });
      setChannels(c => [...c, d.channel]);
      setActiveId(d.channel.id);
      setCreating(null);
      success(parentId ? 'Subgrupo creado.' : 'Canal creado.');
    } catch (e) { toastErr(e.message); }
  };

  /* Renombrar y borrar un canal. Las dos rutas existían desde siempre y no las
     llamaba nadie: un canal mal escrito se quedaba mal escrito para el resto
     del evento, y uno que sobraba seguía ahí ocupando la barra.

     El canal `general` no lleva ninguna de las dos: es donde cae el equipo por
     defecto y no hay forma de volver a crearlo desde el panel. El servidor
     también lo rechaza — esconder el botón no es la regla, es la cortesía. */
  const onRenombrar = async (canal, nombre) => {
    if (!nombre?.trim() || nombre.trim() === canal.nombre) return;
    try {
      const d = await chatApi.editarChannel(evento.id, canal.id, { nombre: nombre.trim() });
      setChannels(c => c.map(x => (x.id === canal.id ? { ...x, ...d.channel } : x)));
      success('Canal renombrado.');
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
  };

  const onBorrarCanal = async (canal) => {
    /* Se dice cuántos subgrupos se lleva por delante. Borrar un padre y
       descubrir después que desaparecieron cuatro hijos es la clase de sorpresa
       que no se puede deshacer. */
    const hijos = channels.filter(c => c.parent_id === canal.id).length;
    if (!(await confirmDialog({
      title: `Borrar «${canal.nombre}»`,
      message: hijos > 0
        ? `Se borra el canal y sus ${hijos} subgrupo${hijos === 1 ? '' : 's'}, con todos sus mensajes. No se puede deshacer.`
        : 'Se borra el canal con todos sus mensajes. No se puede deshacer.',
      confirmLabel: 'Borrar',
      danger: true,
    }))) return;
    try {
      await chatApi.borrarChannel(evento.id, canal.id);
      setChannels(c => c.filter(x => x.id !== canal.id && x.parent_id !== canal.id));
      setActiveId(id => (id === canal.id ? null : id));
      success('Canal borrado.');
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
  };

  const activeChannel = channels.find(c => c.id === activeId);

  /* Anclar y archivar, que estaban enteros en el servidor y no los miraba
     nadie: la lista de canales viene con `anclado` y `archivado` POR PERSONA
     desde la migración 0058, y esta pantalla los tiraba. En producción hay
     133 canales; sin poder anclar cuatro y esconder los que ya no van, la
     barra lateral es una lista por la que hay que buscar cada vez.

     Son de quien mira, no del canal: anclar no se lo ancla a nadie más. */
  const alternarPref = async (canal, campo) => {
    const valor = !canal[campo];
    /* Se pinta antes de que conteste el servidor. Anclar es un gesto de
       ordenar la barra: si tarda medio segundo en moverse, se vuelve a pulsar. */
    setChannels(c => c.map(x => (x.id === canal.id ? { ...x, [campo]: valor } : x)));
    try {
      await chatApi.prefs(evento.id, canal.id, { [campo]: valor });
    } catch (e) {
      setChannels(c => c.map(x => (x.id === canal.id ? { ...x, [campo]: !valor } : x)));
      toastErr(e.response?.data?.error || e.message);
    }
  };

  /* Construye el árbol: padres con sus hijos (los DM van aparte).
     Los anclados suben, y los archivados sólo salen si se piden. Un hijo
     archivado se esconde también: si no, el padre archivado desaparece y sus
     subgrupos se quedan colgando sin nada encima. */
  const visible = (c) => verArchivados || !c.archivado;
  const ordenar = (lista) => [...lista].sort((a, b) => (b.anclado === true) - (a.anclado === true));

  const padres = ordenar(channels.filter(c => !c.parent_id && c.tipo !== 'dm' && visible(c)));
  const hijosDe = (pid) => ordenar(channels.filter(c => c.parent_id === pid && visible(c)));
  const dms = ordenar(channels.filter(c => c.tipo === 'dm' && visible(c)));
  const archivados = channels.filter(c => c.archivado).length;

  if (loadingChannels) return (
    <GLoader message="Cargando canales..." />
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 min-h-[600px]">
      {/* Sidebar canales */}
      <aside className="rounded-3xl border border-border bg-surface/40 p-3 flex flex-col">
        <div className="flex items-center justify-between px-2 py-1.5 mb-2">
          <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">Canales</p>
          {archivados > 0 && (
            <button onClick={() => setVerArchivados(v => !v)}
              className="text-[10px] text-text-3 hover:text-text-1 ml-auto mr-2">
              {verArchivados ? 'Ocultar archivados' : `Archivados (${archivados})`}
            </button>
          )}
          {puedeCrear && (
            <button onClick={() => setCreating('root')} aria-label="Nuevo canal"
              className="w-6 h-6 rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-2 flex items-center justify-center">
              <PlusIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="space-y-0.5 flex-1 overflow-y-auto no-scrollbar">
          {padres.map(padre => (
            <div key={padre.id}>
              <ChannelButton
                channel={padre}
                active={activeId === padre.id}
                onClick={() => setActiveId(padre.id)}
                onAddSub={puedeCrear ? () => setCreating(padre.id) : null}
                onRenombrar={puedeCrear ? (n) => onRenombrar(padre, n) : null}
                onBorrar={puedeCrear ? () => onBorrarCanal(padre) : null}
                onAnclar={() => alternarPref(padre, 'anclado')}
                onArchivar={() => alternarPref(padre, 'archivado')}
              />
              {/* Subgrupos */}
              {hijosDe(padre.id).map(hijo => (
                <ChannelButton
                  key={hijo.id}
                  channel={hijo}
                  active={activeId === hijo.id}
                  onClick={() => setActiveId(hijo.id)}
                  onRenombrar={puedeCrear ? (n) => onRenombrar(hijo, n) : null}
                  onBorrar={puedeCrear ? () => onBorrarCanal(hijo) : null}
                  onAnclar={() => alternarPref(hijo, 'anclado')}
                  onArchivar={() => alternarPref(hijo, 'archivado')}
                  indent
                />
              ))}
              {creating === padre.id && (
                <div className="pl-5">
                  <CrearCanalForm
                    parentName={padre.nombre}
                    roles={roles}
                    onSubmit={(nombre, rolIds) => onCrearCanal(nombre, padre.id, rolIds)}
                    onCancel={() => setCreating(null)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {creating === 'root' && (
          <CrearCanalForm roles={roles} onSubmit={(n, rolIds) => onCrearCanal(n, null, rolIds)} onCancel={() => setCreating(null)} />
        )}

        {/* Mensajes directos 1:1 */}
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between px-2 py-1 mb-1 relative">
            <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">Directos</p>
            {miembros.length > 0 && (
              <button onClick={() => setDmPicker(v => !v)} aria-label="Nuevo mensaje directo"
                className="w-6 h-6 rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-2 flex items-center justify-center">
                <PlusIcon className="w-3.5 h-3.5" />
              </button>
            )}
            {dmPicker && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setDmPicker(false)} />
                <div className="absolute right-0 top-8 z-30 w-52 card-glass rounded-xl p-1 max-h-64 overflow-y-auto no-scrollbar">
                  {miembros.map(m => (
                    <button key={m.id} onClick={() => abrirDM(m.id)}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-sm text-text-2 hover:text-text-1 hover:bg-surface-2 transition-colors">
                      {m.avatar ? <img src={m.avatar} alt="" className="w-5 h-5 rounded-full object-cover" /> : <span className="w-5 h-5 rounded-full bg-surface-3 text-text-3 text-[10px] flex items-center justify-center">{(m.nombre || '?').charAt(0).toUpperCase()}</span>}
                      <span className="truncate">{m.nombre}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="space-y-0.5">
            {dms.length === 0 && <p className="px-2 text-[11px] text-text-3">Escribe en privado a un miembro con el +.</p>}
            {dms.map(dm => (
              <ChannelButton key={dm.id} channel={dm} active={activeId === dm.id} onClick={() => setActiveId(dm.id)}
                onAnclar={() => alternarPref(dm, 'anclado')}
                onArchivar={() => alternarPref(dm, 'archivado')} />
            ))}
          </div>
        </div>
      </aside>

      {/* Mensajes */}
      <section className="rounded-3xl border border-border bg-surface/40 flex flex-col overflow-hidden">
        {activeChannel
          ? <ChannelView key={activeChannel.id} evento={evento} channel={activeChannel} usuario={usuario} />
          : <EmptyState />
        }
      </section>
    </div>
  );
}

/* ─────────── Vista de un canal ─────────── */

function ChannelView({ evento, channel, usuario }) {
  const [messages, setMessages] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [input,    setInput]    = useState('');
  const [sending,  setSending]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef(null);
  const fileRef   = useRef(null);
  const { error: toastErr } = useToast();

  const esDM = channel.tipo === 'dm';
  const nombreCanal = esDM ? (channel.dm_nombre || 'Directo') : channel.nombre;

  /* Scroll al fondo */
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, []);

  /* Traer (o volver a traer) los últimos mensajes del canal. `toastErr` y
     `scrollToBottom` se dejan fuera de las deps a propósito, como la carga
     inicial de antes: sólo cambian id de evento y de canal. */
  const cargarMensajes = useCallback((conSpinner = false) => {
    if (conSpinner) setLoading(true);
    return chatApi.messages(evento.id, channel.id, { limit: 80 })
      .then(d => { setMessages(d.messages || []); setTimeout(scrollToBottom, 50); })
      .catch(e => { if (conSpinner) toastErr(e.message); })
      .finally(() => { if (conSpinner) setLoading(false); });
    /* Las dependencias son el evento y el canal a propósito: `scrollToBottom` y
       los avisos se rehacen en cada render y meterlos aquí recargaría el chat
       sin parar. */
  }, [evento.id, channel.id]);

  /* Carga inicial */
  useEffect(() => { cargarMensajes(true); }, [cargarMensajes]);

  /* Mensajes nuevos por sondeo, no por Supabase Realtime.
     ────────────────────────────────────────────────────
     Era el último canal que seguía abriendo un WebSocket permanente a
     Supabase (`supabase.channel('chat:…')`) — el mismo peso que ya se le
     quitó a asistencia en vivo y notificaciones (ver useAsistenciaEnVivo.js
     y MIGRACION-SUPABASE.md §6, etapa 5). Con varios paneles de staff abiertos
     durante el evento, cada uno con su socket y su latido, era la carga que
     terminaba por sentirse contra el proyecto entero de Supabase, no solo
     contra el chat.

     `useSondeo` ya trae lo que hacía falta: se para cuando la pestaña no se
     ve, no encadena peticiones si el servidor va lento, y al volver se
     refresca al instante. 4s de intervalo porque esto SÍ es una
     conversación —a diferencia del contador de aforo, aquí si tarda se
     nota—, pero sigue siendo una petición HTTP normal, no una conexión que
     se queda abierta. */
  useSondeo(() => cargarMensajes(), 4000, true);

  const onEnviar = async (e) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    setSending(true);
    try {
      const d = await chatApi.enviar(evento.id, channel.id, { contenido: text });
      setMessages(prev => prev.some(m => m.id === d.message.id) ? prev : [...prev, d.message]);
      scrollToBottom();
    } catch (e) {
      toastErr(e.message);
      setInput(text);
    } finally { setSending(false); }
  };

  const onSubirImagen = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toastErr('Solo imágenes.'); return; }
    setUploading(true);
    try {
      const url = await uploadEventImage(file, usuario.id, 'chat');
      const d = await chatApi.enviar(evento.id, channel.id, { contenido: '', file_url: url });
      setMessages(prev => prev.some(m => m.id === d.message.id) ? prev : [...prev, d.message]);
      scrollToBottom();
    } catch (e) {
      toastErr(`Error al subir: ${e.message}`);
    } finally { setUploading(false); }
  };

  const onSubirAudio = async (blob) => {
    if (!blob) return;
    setUploading(true);
    try {
      const file = new File([blob], `audio-${Date.now()}.webm`, { type: 'audio/webm' });
      const url = await uploadEventImage(file, usuario.id, 'audio');
      const d = await chatApi.enviar(evento.id, channel.id, { contenido: '', file_url: url });
      setMessages(prev => prev.some(m => m.id === d.message.id) ? prev : [...prev, d.message]);
      scrollToBottom();
    } catch (e) {
      toastErr(`Error al enviar audio: ${e.message}`);
    } finally { setUploading(false); }
  };

  return (
    <>
      {/* Header */}
      <div className="px-5 py-3 border-b border-border flex items-center gap-2">
        {esDM
          ? (channel.dm_avatar ? <img src={channel.dm_avatar} alt="" className="w-5 h-5 rounded-full object-cover" /> : <span className="w-5 h-5 rounded-full bg-surface-3 text-text-3 text-[10px] flex items-center justify-center">{(nombreCanal || '?').charAt(0).toUpperCase()}</span>)
          : <HashIcon className="w-4 h-4 text-text-3" />}
        <h3 className="text-base font-semibold text-text-1">{nombreCanal}</h3>
        {esDM
          ? <span className="text-[10px] uppercase tracking-widest text-text-3 px-2 py-0.5 rounded-full border border-border ml-1">directo</span>
          : channel.tipo !== 'general' && (
            <span className="text-[10px] uppercase tracking-widest text-text-3 px-2 py-0.5 rounded-full border border-border ml-1">
              {TIPO_LABEL[channel.tipo] || channel.tipo}
            </span>
          )}
      </div>

      {/* Mensajes */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-[400px] max-h-[60vh]">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Spinner /></div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm text-text-2 mb-1">Aún no hay mensajes</p>
            <p className="text-xs text-text-3">Sé el primero en escribir{esDM ? ` a ${nombreCanal}` : ` en #${channel.nombre}`}.</p>
          </div>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const sameAuthor = prev && prev.user_id === m.user_id && (new Date(m.created_at) - new Date(prev.created_at) < 5 * 60 * 1000);
            const isMine = m.user_id === usuario?.id;
            return (
              <MessageBubble
                key={m.id}
                message={m}
                showHeader={!sameAuthor}
                isMine={isMine}
              />
            );
          })
        )}
      </div>

      {/* Input */}
      <form onSubmit={onEnviar} className="border-t border-border p-3 flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || sending}
          aria-label="Adjuntar imagen"
          title="Adjuntar imagen"
          className="w-10 h-10 rounded-2xl text-text-3 hover:text-text-1 hover:bg-surface-2 flex items-center justify-center transition-colors flex-shrink-0 disabled:opacity-50"
        >
          {uploading
            ? <div className="w-4 h-4 rounded-full border-2 border-border border-t-primary animate-spin" />
            : <ClipIcon className="w-4 h-4" />}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => onSubirImagen(e.target.files?.[0])} />

        <AudioRecorderButton onComplete={onSubirAudio} disabled={uploading || sending} />

        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEnviar(e); }
          }}
          placeholder={esDM ? `Escribe a ${nombreCanal}...` : `Escribe en #${channel.nombre}...`}
          rows={1}
          className="input rounded-2xl py-2.5 text-sm resize-none flex-1 max-h-32"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="px-4 py-2.5 rounded-2xl bg-text-1 text-bg hover:bg-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          {sending ? '...' : 'Enviar'}
        </button>
      </form>
    </>
  );
}

function MessageBubble({ message, showHeader, isMine }) {
  const fecha = new Date(message.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  const initials = (message.autor?.nombre || 'U').split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();

  if (!showHeader) {
    return (
      <div className={`pl-12 group animate-[fadeUp_0.2s_ease_both]`}>
        {message.contenido && <p className="text-sm text-text-1 leading-relaxed break-words">{message.contenido}</p>}
        {message.file_url && <MessageImage url={message.file_url} />}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 animate-[fadeUp_0.25s_ease_both]">
      <div className="w-9 h-9 rounded-xl overflow-hidden bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
        {message.autor?.avatar_url
          ? <img src={message.autor.avatar_url} alt="" className="w-full h-full object-cover" />
          : initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-sm font-semibold text-text-1">
            {/* Sin el correo de reserva: enseñarlo era publicar la dirección de
                quien escribe a todo el que abra el chat. Las 29 cuentas tienen
                nombre, así que la reserva no se usaba nunca. */}
            {message.autor?.nombre || 'Usuario'}
            {isMine && <span className="ml-1.5 text-xs uppercase tracking-widest text-text-3 font-medium">tú</span>}
          </span>
          <span className="text-xs text-text-3 tabular-nums">{fecha}</span>
        </div>
        {message.contenido && <p className="text-sm text-text-1 leading-relaxed break-words">{message.contenido}</p>}
        {message.file_url && <MessageImage url={message.file_url} />}
      </div>
    </div>
  );
}

function MessageImage({ url }) {
  /* Detecta tipo por extensión */
  const isAudio = /\.(webm|mp3|ogg|wav|m4a|mp4)(\?|$)/i.test(url);
  if (isAudio) {
    return (
      <div className="mt-1.5 max-w-sm rounded-2xl border border-border bg-surface-2 px-3 py-2">
        <audio controls src={url} className="w-full" preload="metadata" />
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" className="block mt-1.5 max-w-xs">
      <img src={url} alt="Adjunto" loading="lazy"
        className="rounded-2xl border border-border max-h-72 w-auto hover:border-border-2 transition-all" />
    </a>
  );
}

/* ─────────── AudioRecorderButton — hold to record ─────────── */

function AudioRecorderButton({ onComplete, disabled }) {
  const [recording, setRecording] = useState(false);
  const [elapsed,   setElapsed]   = useState(0);
  const mediaRef    = useRef(null);
  const chunksRef   = useRef([]);
  const timerRef    = useRef(null);
  const { error: toastErr } = useToast();

  const start = async () => {
    if (disabled || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        if (blob.size > 1000) onComplete(blob);
      };
      mediaRef.current = mr;
      mr.start();
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } catch (e) {
      toastErr('No se pudo acceder al micrófono.');
    }
  };

  const stop = () => {
    if (!recording) return;
    setRecording(false);
    clearInterval(timerRef.current);
    if (mediaRef.current?.state !== 'inactive') mediaRef.current?.stop();
  };

  useEffect(() => () => {
    clearInterval(timerRef.current);
    if (mediaRef.current?.state === 'recording') mediaRef.current.stop();
  }, []);

  const fmt = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  return (
    <button
      type="button"
      onMouseDown={start} onMouseUp={stop} onMouseLeave={stop}
      onTouchStart={start} onTouchEnd={stop}
      disabled={disabled}
      aria-label="Mantén presionado para grabar audio"
      title="Mantén presionado para grabar"
      className={`min-w-[40px] h-10 px-2 rounded-2xl flex items-center justify-center transition-all flex-shrink-0 disabled:opacity-50
        ${recording
          ? 'bg-danger/15 text-danger animate-[pulseSoft_1s_ease-in-out_infinite] gap-2 px-3'
          : 'text-text-3 hover:text-text-1 hover:bg-surface-2'}
      `}
    >
      <MicIcon className="w-4 h-4" />
      {recording && <span className="text-xs font-mono tabular-nums">{fmt(elapsed)}</span>}
    </button>
  );
}

function MicIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-14 0m7 7v4m-4 0h8m-7-15a3 3 0 016 0v5a3 3 0 11-6 0V5z" /></svg>;
}

/* ─────────── Crear canal inline form ─────────── */

function ChannelButton({ channel, active, onClick, onAddSub, onRenombrar, onBorrar, onAnclar, onArchivar, indent }) {
  const esDM = channel.tipo === 'dm';
  /* Ni el general ni un directo se tocan: el general es el sitio por defecto
     del equipo, y un directo no es un canal que alguien haya montado. */
  const editable = !esDM && channel.tipo !== 'general';
  /* Renombrar es un campo en la propia fila y no un `window.prompt`: no hay ni
     uno en todo el proyecto, y dentro de una PWA un cuadro del navegador se ve
     como lo que es — algo que no es de esta aplicación. */
  const [renombrando, setRenombrando] = useState(null);

  if (renombrando !== null) {
    return (
      <form
        onSubmit={(e) => { e.preventDefault(); onRenombrar(renombrando); setRenombrando(null); }}
        className={`flex items-center gap-1 px-2.5 py-1 ${indent ? 'pl-5' : ''}`}>
        <input
          autoFocus
          value={renombrando}
          onChange={(e) => setRenombrando(e.target.value)}
          onBlur={() => setRenombrando(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setRenombrando(null); }}
          aria-label="Nuevo nombre del canal"
          className="input flex-1 text-sm py-1 px-2" />
      </form>
    );
  }

  const restringido = channel.rol_ids?.length > 0;
  const nombre = esDM ? (channel.dm_nombre || 'Directo') : channel.nombre;
  return (
    <div className={`group flex items-center ${indent ? 'pl-5' : ''}`}>
      <button
        onClick={onClick}
        className={`flex-1 flex items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-colors
          ${active ? 'bg-surface-2 text-text-1' : 'text-text-2 hover:text-text-1 hover:bg-surface-2/50'}
        `}
      >
        {esDM
          ? (channel.dm_avatar
              ? <img src={channel.dm_avatar} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
              : <span className="w-4 h-4 rounded-full bg-surface-3 text-text-3 text-[9px] flex items-center justify-center flex-shrink-0">{(nombre || '?').charAt(0).toUpperCase()}</span>)
          : indent
            ? <span className="w-3.5 h-3.5 flex items-center justify-center text-text-3 text-xs">↳</span>
            : restringido
              ? <LockIcon className="w-3.5 h-3.5 text-warning flex-shrink-0" />
              : <HashIcon className="w-3.5 h-3.5 text-text-3 flex-shrink-0" />}
        {/* La chincheta va DENTRO del botón y no entre los de la derecha:
            los de la derecha aparecen al pasar el ratón, y un canal anclado
            tiene que verse anclado sin pasar por encima. */}
        {channel.anclado && <span className="text-[10px] text-accent flex-shrink-0" title="Anclado">📌</span>}
        <span className="text-sm font-medium truncate">{nombre}</span>
        {!esDM && channel.tipo !== 'general' && !restringido && (
          <span className="ml-auto text-[10px] uppercase tracking-widest text-text-3">{TIPO_LABEL[channel.tipo] || channel.tipo}</span>
        )}
        {restringido && (
          <span className="ml-auto text-[10px] uppercase tracking-widest text-warning">privado</span>
        )}
      </button>
      {onAddSub && (
        <button
          onClick={onAddSub}
          aria-label="Crear subgrupo"
          title="Crear subgrupo"
          className="w-6 h-6 rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-2 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ml-1"
        >
          <PlusIcon className="w-3 h-3" />
        </button>
      )}
      {onAnclar && (
        <button
          onClick={onAnclar}
          aria-label={channel.anclado ? `Desanclar ${nombre}` : `Anclar ${nombre}`}
          title={channel.anclado ? 'Desanclar' : 'Anclar arriba'}
          className={`w-6 h-6 rounded-lg flex items-center justify-center transition-opacity ${
            channel.anclado
              ? 'text-accent opacity-100'
              : 'text-text-3 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-text-1 hover:bg-surface-2'}`}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z" />
          </svg>
        </button>
      )}
      {onArchivar && (
        <button
          onClick={onArchivar}
          aria-label={channel.archivado ? `Sacar ${nombre} del archivo` : `Archivar ${nombre}`}
          title={channel.archivado ? 'Sacar del archivo' : 'Archivar (sólo para ti)'}
          className="w-6 h-6 rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-2 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 7v12h16V7M4 7l1-3h14l1 3M10 12h4" />
          </svg>
        </button>
      )}
      {editable && onRenombrar && (
        <button
          onClick={() => setRenombrando(channel.nombre)}
          aria-label={`Renombrar ${nombre}`}
          title="Renombrar"
          className="w-6 h-6 rounded-lg text-text-3 hover:text-text-1 hover:bg-surface-2 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.86 3.86a2.6 2.6 0 113.68 3.68L8.5 19.6 3.5 21l1.4-5z" />
          </svg>
        </button>
      )}
      {editable && onBorrar && (
        <button
          onClick={onBorrar}
          aria-label={`Borrar ${nombre}`}
          title="Borrar canal"
          className="w-6 h-6 rounded-lg text-text-3 hover:text-danger hover:bg-danger/10 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

function CrearCanalForm({ onSubmit, onCancel, parentName, roles = [] }) {
  const [nombre, setNombre]     = useState('');
  const [visibilidad, setVisibilidad] = useState('todos'); // 'todos' | 'roles'
  const [rolIds, setRolIds]     = useState([]);

  const submit = (e) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    onSubmit(nombre, visibilidad === 'roles' ? rolIds : []);
  };
  const toggle = (id) => setRolIds(rs => rs.includes(id) ? rs.filter(r => r !== id) : [...rs, id]);

  return (
    <form onSubmit={submit} className="mt-2 px-1 animate-[fadeUp_0.2s_ease_both]">
      {parentName && (
        <p className="text-xs text-text-3 mb-2 px-1">Subgrupo de <span className="text-text-2">#{parentName}</span></p>
      )}
      <input
        value={nombre} onChange={e => setNombre(e.target.value)} autoFocus
        placeholder="nombre-del-canal"
        className="input rounded-xl py-2 text-sm"
      />

      <div className="mt-3">
        <p className="text-xs uppercase tracking-widest text-text-3 font-semibold mb-2">¿Quién puede ver este canal?</p>
        <div className="space-y-1.5">
          <label className={`flex items-start gap-2 p-2 rounded-xl cursor-pointer transition-colors ${visibilidad === 'todos' ? 'bg-surface-2' : 'hover:bg-surface-2/60'}`}>
            <input
              type="radio" checked={visibilidad === 'todos'}
              onChange={() => setVisibilidad('todos')}
              className="mt-0.5 w-3.5 h-3.5 accent-primary"
            />
            <span className="flex-1">
              <span className="text-sm text-text-1 font-medium block">Todo el equipo</span>
              <span className="text-xs text-text-3 block mt-0.5">Cualquier miembro activo del evento.</span>
            </span>
          </label>
          <label className={`flex items-start gap-2 p-2 rounded-xl cursor-pointer transition-colors ${visibilidad === 'roles' ? 'bg-surface-2' : 'hover:bg-surface-2/60'}`}>
            <input
              type="radio" checked={visibilidad === 'roles'}
              onChange={() => setVisibilidad('roles')}
              className="mt-0.5 w-3.5 h-3.5 accent-primary"
            />
            <span className="flex-1">
              <span className="text-sm text-text-1 font-medium block">Solo estos roles</span>
              <span className="text-xs text-text-3 block mt-0.5">Selecciona qué roles tienen acceso.</span>
            </span>
          </label>
        </div>

        {visibilidad === 'roles' && (
          <div className="mt-2 space-y-1 max-h-44 overflow-y-auto pl-2 pr-1">
            {roles.length === 0
              ? <p className="text-xs text-text-3">Sin roles definidos. Crea roles en la tab Equipo y roles.</p>
              : roles.map(r => (
                  <label key={r.id} className="flex items-center gap-2 text-sm text-text-1 cursor-pointer hover:text-primary-light py-1">
                    <input type="checkbox" checked={rolIds.includes(r.id)} onChange={() => toggle(r.id)}
                      className="w-3.5 h-3.5 rounded border-border bg-surface-2 accent-primary" />
                    {r.nombre}
                  </label>
                ))}
            {visibilidad === 'roles' && rolIds.length === 0 && roles.length > 0 && (
              <p className="text-xs text-warning mt-1">Selecciona al menos un rol.</p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-1 mt-3">
        <button type="button" onClick={onCancel} className="text-xs text-text-3 hover:text-text-2 px-2 py-1">Cancelar</button>
        <button type="submit" disabled={!nombre.trim() || (visibilidad === 'roles' && rolIds.length === 0)}
          className="text-xs text-bg bg-text-1 hover:bg-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50">
          Crear
        </button>
      </div>
    </form>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center py-16">
      <p className="text-sm text-text-2">Selecciona un canal de la izquierda para empezar.</p>
    </div>
  );
}

function PlusIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>;
}
function HashIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>;
}
function LockIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>;
}
function ClipIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>;
}
