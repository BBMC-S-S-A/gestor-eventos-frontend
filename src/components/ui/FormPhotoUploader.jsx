import { useRef, useState } from 'react';
import { subirArchivo } from '../../lib/subirArchivo.js';

/* Subida de foto para un campo tipo "foto" del formulario de compra.
   A diferencia de AvatarUploader, NO requiere sesión iniciada (quien compra
   como invitado también debe poder subir su foto) — usa el bucket público
   "form-uploads" en vez de "avatars". */

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const ACCEPTED  = ['image/jpeg', 'image/png', 'image/webp'];

export default function FormPhotoUploader({ value, onChange, eventoId, campoId }) {
  const fileInput = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');

  const pick = () => fileInput.current?.click();

  const handleFile = async (file) => {
    if (!file) return;
    setErr('');
    if (!ACCEPTED.includes(file.type)) {
      setErr('Formato no soportado. Usa JPG, PNG o WEBP.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setErr('La imagen pesa más de 4 MB. Comprímela e intenta de nuevo.');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      const ruta = `${eventoId}/${campoId}-${Date.now()}.${ext}`;
      /* Sin upsert: el nombre del archivo ya lleva Date.now(), así que nunca
         hay un conflicto real. Con upsert:true, Postgres necesita poder LEER
         la fila para resolver el posible conflicto (aunque no lo haya) — y
         ese bucket no tiene política de SELECT a propósito (0048 la quitó
         para que nadie pudiera listar las fotos de otros invitados). Sin
         upsert, solo hace falta la política de INSERT, que sí existe. */
      const { url } = await subirArchivo('form-uploads', file, { ruta, eventoId });
      onChange(url);
    } catch (e) {
      setErr(`Error al subir: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div
        onClick={pick}
        role="button"
        tabIndex={0}
        className="relative w-full aspect-video rounded-2xl border-2 border-dashed border-border-2 bg-surface-2/40
                   hover:border-primary/40 hover:bg-surface-2 transition-all cursor-pointer overflow-hidden
                   flex items-center justify-center"
      >
        {value ? (
          <img src={value} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-text-3">
            <CameraIcon className="w-6 h-6" />
            <span className="text-xs font-medium">Toca para subir una foto</span>
          </div>
        )}

        {uploading && (
          <div className="absolute inset-0 bg-bg/80 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-border border-t-primary animate-spin" />
          </div>
        )}
      </div>

      {value && !uploading && (
        <button type="button" onClick={() => onChange('')}
          className="text-xs text-danger/80 hover:text-danger mt-2 transition-colors">
          Quitar foto
        </button>
      )}

      {err && <p className="text-xs text-danger-light mt-2">{err}</p>}

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
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
