import { useRef, useState } from 'react';
import { subirArchivo } from '../../lib/subirArchivo.js';
import { useToast } from '../../context/ToastContext.jsx';
import { auth } from '../../lib/sesion.js';

/* Uploader de portada (cover) del evento.
   Aspect 16:9 grande. Sube directo a Supabase Storage en /<owner_id>/...
   value: URL string | null
   onChange(url) */

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ACCEPTED  = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/* La política de Storage exige que la carpeta raíz sea el uid del usuario
   (auth.uid() = foldername[1]). Por eso el folder SIEMPRE es el uid de la
   sesión, sin importar el ownerId que pase el componente. Si no hay sesión
   (ej. un expositor editando su ficha por código, sin login), se usa el bucket
   público form-uploads, que sí admite subidas anónimas. */
export async function uploadEventImage(file, ownerId, prefix = 'cover') {
  const ext = file.name.split('.').pop().toLowerCase();
  const rand = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { data: { session } } = await auth.getSession();
  const uid = session?.user?.id;

  if (uid) {
    const ruta = `${uid}/${prefix}-${rand}.${ext}`;
    const { url } = await subirArchivo('event-media', file, { ruta, upsert: false });
    return url;
  }

  const safe = String(ownerId || 'anon').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'anon';
  const ruta = `expositor/${safe}/${prefix}-${rand}.${ext}`;
  const { url } = await subirArchivo('form-uploads', file, { ruta, upsert: false });
  return url;
}

export default function CoverUploader({ value, onChange, ownerId, label = 'Portada del evento' }) {
  const fileInput = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver,  setDragOver]  = useState(false);
  const { error: toastError } = useToast();

  const pick = () => fileInput.current?.click();

  const handleFile = async (file) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      toastError('Formato no soportado. Usa JPG, PNG, WEBP o GIF.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toastError('La imagen pesa más de 5 MB.');
      return;
    }

    setUploading(true);
    try {
      const url = await uploadEventImage(file, ownerId, 'cover');
      onChange(url);
    } catch (e) {
      toastError(`Error al subir: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="field">
      <label className="label">{label}</label>
      <div
        onClick={pick}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        className={`relative aspect-video w-full rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 group
          ${dragOver
            ? 'border-2 border-primary bg-primary/10 scale-[1.01]'
            : value
              ? 'border border-border-2 hover:border-primary/40'
              : 'border-2 border-dashed border-border hover:border-border-2 bg-surface/40 hover:bg-surface/60'
          }`}
      >
        {value
          ? (
            <>
              <img src={value} alt="Portada" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-bg/0 group-hover:bg-bg/60 backdrop-blur-0 group-hover:backdrop-blur-sm transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-bg/80 border border-border-2 text-sm font-medium text-text-1">
                  <CameraIcon className="w-4 h-4" />
                  Cambiar portada
                </div>
              </div>
            </>
          )
          : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
              <div className="w-12 h-12 rounded-2xl bg-surface-2 border border-border-2 flex items-center justify-center">
                <UploadIcon className="w-5 h-5 text-text-2" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-text-1">Sube la portada</p>
                <p className="text-xs text-text-3 mt-0.5">Click o arrastra · JPG/PNG/WEBP · Máx 5 MB · 16:9 recomendado</p>
              </div>
            </div>
          )
        }

        {uploading && (
          <div className="absolute inset-0 bg-bg/80 flex items-center justify-center">
            <div className="flex items-center gap-3 text-text-1">
              <div className="w-5 h-5 rounded-full border-2 border-border border-t-primary animate-spin" />
              <span className="text-sm font-medium">Subiendo...</span>
            </div>
          </div>
        )}
      </div>

      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="text-xs text-danger/80 hover:text-danger mt-2 transition-colors"
        >
          Quitar portada
        </button>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={e => handleFile(e.target.files?.[0])}
        className="hidden"
      />
    </div>
  );
}

function UploadIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}
function CameraIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
