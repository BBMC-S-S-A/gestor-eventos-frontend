import { useRef, useState, useEffect } from 'react';
import { subirArchivo } from '../../lib/subirArchivo.js';
import { useToast } from '../../context/ToastContext.jsx';

/* Avatar grande con click-to-upload + hover overlay.

   Modos:
   - LIVE (default): pasa userId. Sube a Supabase Storage al instante
     y devuelve la URL pública via onChange(url).
   - DEFERRED: no pases userId. Guarda el File localmente; el padre lo
     sube cuando tenga el user_id (típicamente después de signUp).
     onChange(file) recibe el File. value puede ser File | string URL.

   Helper uploadAvatarFile() abajo: usar desde el padre en modo deferred. */

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ACCEPTED  = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function uploadAvatarFile(file, userId) {
  const ext  = file.name.split('.').pop().toLowerCase();
  /* La ruta la necesita el camino de Supabase —su política exige que la
     carpeta raíz sea el uid—. Con el almacén propio la decide el servidor,
     que ya sabe quién eres por el token, y ésta se ignora. */
  const ruta = `${userId}/avatar-${Date.now()}.${ext}`;
  const { url } = await subirArchivo('avatars', file, { ruta, upsert: true });
  return url;
}

export default function AvatarUploader({ value, onChange, userId, initials = '?', size = 96 }) {
  const deferred = !userId;
  const fileInput = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver,  setDragOver]  = useState(false);
  const [blobUrl,   setBlobUrl]   = useState(null);
  const { error: toastError } = useToast();

  /* Preview en modo deferred: si value es File, generamos un object URL */
  useEffect(() => {
    if (deferred && value instanceof File) {
      const url = URL.createObjectURL(value);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setBlobUrl(null);
  }, [value, deferred]);

  const previewSrc = deferred
    ? (blobUrl || (typeof value === 'string' ? value : null))
    : (typeof value === 'string' ? value : null);

  const pick = () => fileInput.current?.click();

  const handleFile = async (file) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      toastError('Formato no soportado. Usa JPG, PNG, WEBP o GIF.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toastError('La imagen pesa más de 2 MB. Comprímela e intenta de nuevo.');
      return;
    }

    /* Deferred: solo guarda el File en el padre, no sube. */
    if (deferred) {
      onChange(file);
      return;
    }

    /* Live: sube directo a Supabase. */
    setUploading(true);
    try {
      const url = await uploadAvatarFile(file, userId);
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
    <div className="flex items-center gap-5">
      <div
        onClick={pick}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        aria-label="Cambiar foto de perfil"
        className={`relative cursor-pointer group rounded-3xl overflow-hidden flex-shrink-0 transition-all duration-300
          ${dragOver ? 'ring-4 ring-primary/40 scale-[1.03]' : 'ring-1 ring-border-2 hover:ring-2 hover:ring-text-3'}
        `}
        style={{ width: size, height: size }}
      >
        {previewSrc
          ? <img src={previewSrc} alt="Avatar" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
          : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-accent">
              <span className="text-white font-bold font-display" style={{ fontSize: size * 0.36 }}>{initials}</span>
            </div>
          )
        }

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-bg/70 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
          <CameraIcon className="w-6 h-6 text-text-1" />
          <span className="text-[10px] uppercase tracking-widest text-text-1 font-semibold">Cambiar</span>
        </div>

        {/* Uploading overlay */}
        {uploading && (
          <div className="absolute inset-0 bg-bg/80 flex items-center justify-center">
            <div className="w-7 h-7 rounded-full border-2 border-border border-t-primary animate-spin" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={pick}
          disabled={uploading}
          className="text-sm font-semibold text-text-1 hover:text-primary-light transition-colors"
        >
          {previewSrc ? 'Cambiar foto' : 'Subir foto'}
        </button>
        <p className="text-xs text-text-3 mt-1 leading-relaxed">
          JPG, PNG, WEBP o GIF. Máx 2 MB.<br />
          O arrástrala sobre el círculo.
        </p>
        {previewSrc && (
          <button
            type="button"
            onClick={() => onChange(deferred ? null : '')}
            disabled={uploading}
            className="text-xs text-danger/80 hover:text-danger mt-1.5 transition-colors"
          >
            Quitar foto
          </button>
        )}
      </div>

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

function CameraIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
