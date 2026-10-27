import { useState, useRef } from 'react';
import { subirArchivo, borrarArchivo } from '../../../lib/subirArchivo.js';
import { eventosApi } from '../../../api/eventos.js';
import { useToast } from '../../../context/ToastContext.jsx';
import { confirmDialog } from '../../../components/ui/Confirm.jsx';
import { auth } from '../../../lib/sesion.js';
import {
  validarArchivo, sanitizarNombre, TIPOS_DOCUMENTO, ACCEPT_DOCUMENTO, MAX_DOCUMENTO,
} from '../../../lib/archivos.js';

/* Asistentes/Organización · Documentos del evento — sube y guarda archivos
   (PDF, imágenes, ofimática) asociados al evento, dentro de la plataforma.
   Metadatos en page_json.documentos; archivo en Supabase Storage.

   SEGURIDAD (control de subida):
   - Whitelist de tipos + bloqueo explícito de extensiones ejecutables/peligrosas.
   - Límite de tamaño. Nombre saneado.
   - NOTA: la validación de tipo/tamaño es del lado cliente; el escaneo real
     de malware debe hacerse en el servidor (ClamAV / API de scanning) — queda
     como paso de backend/infra. Los archivos van a un bucket; para documentos
     sensibles conviene un bucket privado con URLs firmadas (infra pendiente). */

/* Las reglas viven en `lib/archivos.js` y no aquí.

   El módulo se extrajo **de este mismo archivo** para poder reutilizarlo, y
   luego nadie lo importó: quedaron dos listas, y con el tiempo se separaron. La
   de aquí se quedó atrás en lo que importa:

   · aceptaba **.doc, .xls y .ppt**, que SÍ admiten macros —el bloqueo de
     ejecutables de esta pantalla no servía de nada frente a un .doc con una
     macro dentro—;
   · no cruzaba el MIME con la extensión, así que un ejecutable renombrado a
     .pdf que declarara `application/pdf` entraba.

   Al unificar, esos tres formatos dejan de aceptarse. Es un cambio de
   comportamiento y es el que se quería: quien tenga un .doc lo guarda como
   .docx, que es lo que la propia lista larga ya recomendaba. */

export default function DocumentosSection({ evento, puedeEditar = true }) {
  const { success, error } = useToast();
  const [docs, setDocs] = useState(() => Array.isArray(evento.page_json?.documentos) ? evento.page_json.documentos : []);
  const [subiendo, setSubiendo] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const persistir = async (lista) => {
    setDocs(lista);
    try { await eventosApi.update(evento.id, { page_json: { documentos: lista } }); }
    catch (e) { error('No se pudo guardar la lista: ' + (e.response?.data?.error || e.message)); }
  };

  const subir = async (file) => {
    if (!file) return;
    const err = validarArchivo(file, { queEs: 'los documentos del evento' });
    if (err) { error(err); return; }
    setSubiendo(true);
    try {
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
      /* La carpeta raíz debe ser el uid del usuario (política de Storage). */
      const { data: { session } } = await auth.getSession();
      const uid = session?.user?.id;
      if (!uid) throw new Error('Inicia sesión para subir documentos.');
      const ruta = `${uid}/docs/${evento.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const subido = await subirArchivo('event-media', file, {
        ruta, upsert: false, eventoId: evento.id,
      });
      /* `path` y `archivoId` se guardan los DOS, y los dos son necesarios: el
         `archivoId` sólo existe si lo subió el almacén propio, y es lo que
         luego dice dónde vive el archivo a la hora de borrarlo. Los documentos
         de antes del corte no lo tienen, y ésos se borran de Supabase. */
      const doc = {
        nombre: sanitizarNombre(file.name), url: subido.url, path: subido.ruta,
        archivoId: subido.id || undefined,
        tipo: TIPOS_DOCUMENTO[file.type], size: file.size, subido_at: new Date().toISOString(),
      };
      await persistir([doc, ...docs]);
      success('Documento subido.');
    } catch (e) { error('Error al subir: ' + e.message); }
    finally { setSubiendo(false); }
  };

  const eliminar = async (doc) => {
    if (!(await confirmDialog({ title: 'Eliminar documento', message: `¿Eliminar "${doc.nombre}"?`, confirmLabel: 'Eliminar', danger: true }))) return;
    /* El borrado va por donde VIVE el archivo, no por la bandera: durante la
       transición los dos almacenes tienen documentos, y guiarse por la bandera
       borraría en el sitio equivocado — o sea, no borraría nada y diría que
       sí. Lo decide `archivoId`: si está, es del almacén propio.
       Sigue siendo best-effort: si el archivo no se va, la ficha sí, y un
       huérfano se barre después; dejar la ficha sería peor. */
    if (doc.archivoId || doc.path) {
      try { await borrarArchivo({ carpeta: 'event-media', ruta: doc.path, id: doc.archivoId }); }
      catch { /* noop */ }
    }
    persistir(docs.filter(d => d !== doc));
  };

  const onDrop = (e) => { e.preventDefault(); setDragOver(false); subir(e.dataTransfer.files?.[0]); };

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Subir y quitar guardan `page_json`, y eso pide `editar_evento`. La
          pestana se abre con `ver_documentos` —que la 0122 dio a TODOS los
          roles, porque antes no pedia nada—, asi que sin esto cualquiera del
          equipo elegia un archivo, esperaba la subida y recibia un 403 al
          final. La nota de seguridad va dentro: a quien solo puede leer no le
          dice nada que pueda usar. */}
      {puedeEditar && (<>
      {/* Zona de subida */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        role="button" tabIndex={0}
        className={`rounded-3xl border-2 border-dashed p-8 text-center cursor-pointer transition-all
          ${dragOver ? 'border-primary bg-primary/10' : 'border-border hover:border-border-2 bg-surface/40'}`}
      >
        <div className="w-12 h-12 rounded-2xl bg-surface-2 border border-border-2 flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-text-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
        </div>
        <p className="text-sm font-medium text-text-1">{subiendo ? 'Subiendo…' : 'Sube o arrastra un documento'}</p>
        {/* El límite se lee del módulo: un texto con el número escrito a mano
            miente el día que el límite cambie, y es justo el texto que la gente
            usa para decidir si su archivo cabe. */}
        <p className="text-xs text-text-3 mt-1">
          PDF · imágenes · Word (.docx) · Excel (.xlsx) · PPT (.pptx) · TXT/CSV ·
          máx {Math.round(MAX_DOCUMENTO / 1024 / 1024)} MB
        </p>
        <input ref={inputRef} type="file" accept={ACCEPT_DOCUMENTO} className="hidden" onChange={e => subir(e.target.files?.[0])} />
      </div>

      {/* Nota de seguridad */}
      <div className="rounded-2xl border border-warning/25 bg-warning/5 px-4 py-3 text-xs text-text-2 leading-relaxed">
        <strong className="text-warning-light">Seguridad:</strong> se bloquean ejecutables y scripts (.exe, .js, .html, .svg…) y se limita el tamaño. El escaneo antivirus del contenido se hará del lado servidor (pendiente de backend); evita subir archivos de origen desconocido.
      </div>
      </>)}

      {/* Lista */}
      {docs.length === 0 ? (
          <div className="card p-10 text-center"><p className="text-sm text-text-2">
            {puedeEditar
              ? 'Aún no hay documentos. Sube contratos, riders, planos, listas… todo lo del evento en un solo lugar.'
              : 'Aún no hay documentos. Quien edita el evento puede subir aquí contratos, riders y planos.'}
          </p></div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden divide-y divide-border">
          {docs.map((d, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/40">
              <span className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center text-[10px] font-bold text-text-2 flex-shrink-0">{d.tipo}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text-1 truncate">{d.nombre}</p>
                <p className="text-[11px] text-text-3">{(d.size / 1024 / 1024).toFixed(2)} MB · {d.subido_at ? new Date(d.subido_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</p>
              </div>
              <a href={d.url} target="_blank" rel="noreferrer noopener" className="btn-ghost btn-sm flex-shrink-0">Ver</a>
              {puedeEditar && (
                <button onClick={() => eliminar(d)} className="btn-ghost btn-sm text-danger/80 hover:text-danger flex-shrink-0">Eliminar</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
