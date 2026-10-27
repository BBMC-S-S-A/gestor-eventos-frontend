import { useRef, useState } from 'react';
import { subirArchivo } from '../../lib/subirArchivo.js';
import { eventosApi } from '../../api/eventos.js';

/* Adjuntar un archivo a un formulario: un PDF, un Word, una presentación.
 *
 * ── Por qué no elige el destino ──────────────────────────────────────────
 *
 * Este componente NO decide a qué bucket sube. Le pregunta al servidor y sube
 * a donde le digan.
 *
 * Si lo decidiera aquí —«el campo dice sensible, luego bucket privado»—
 * bastaría con no creérselo desde una consola: subir el documento al bucket
 * público y guardar su URL. Y no fallaría nada: la respuesta se guardaría
 * igual, la pantalla se vería igual, y el archivo quedaría con un enlace eterno
 * dentro del CSV de asistentes. Nadie lo notaría hasta que circulara.
 *
 * Del servidor vienen también los formatos y el tope, para poder decirlos ANTES
 * de que alguien elija un archivo de 40 MB y espere a que falle.
 *
 * ── Lo que se guarda ─────────────────────────────────────────────────────
 *
 * Público → la URL, como el campo «foto» de siempre.
 * Privado → una referencia (`privado:ruta`), que no se puede abrir sin pasar
 *           por el servidor. Eso es lo que impide que acabe en una hoja de
 *           cálculo siendo un enlace que funciona.
 */

const MB = 1024 * 1024;

export default function FormFileUploader({ value, onChange, slug, campo }) {
  const fileInput = useRef(null);
  const [subiendo, setSubiendo] = useState(false);
  const [err, setErr] = useState('');
  /* El nombre que eligió la persona, para poder enseñar algo legible: lo que se
     guarda es una ruta o una URL, y ninguna de las dos se lee bien. Se pierde
     al recargar y es correcto — entonces se dice «archivo adjunto», que es lo
     único cierto. */
  const [nombreLocal, setNombreLocal] = useState('');

  const elegir = () => fileInput.current?.click();

  const manejar = async (file) => {
    if (!file) return;
    setErr('');
    setSubiendo(true);
    try {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      const destino = await eventosApi.destinoDeArchivo(slug, campo.id, ext);

      const permitidos = (destino.formatos || []).map(f => f.mime);
      if (permitidos.length && !permitidos.includes(file.type)) {
        const nombres = [...new Set((destino.formatos || []).map(f => f.label))].join(', ');
        throw new Error(`Ese formato no se acepta aquí. Se puede subir: ${nombres}.`);
      }
      if (file.size > destino.max_bytes) {
        throw new Error(`El archivo pesa ${(file.size / MB).toFixed(1)} MB y el máximo son ${Math.round(destino.max_bytes / MB)} MB.`);
      }

      /* `destino.privado` lo decide el backend al dar el destino; la costura
         devuelve `url: null` para lo privado por su cuenta. Se le pasa igual,
         porque con Supabase es el navegador quien tiene que saber que de ese
         bucket NO hay que pedir URL pública: devolvería un enlace que no abre
         nada, que es peor que no tenerlo porque parece que sí. */
      const subido = await subirArchivo(destino.bucket, file, {
        ruta   : destino.ruta,
        publico: !destino.privado,
      });

      /* La ruta que vale es la que devuelve la costura, no la que se pidió:
         con el almacén propio la decide el servidor. */
      if (destino.privado || !subido.url) onChange(`privado:${subido.ruta}`);
      else onChange(subido.url);
      setNombreLocal(file.name);
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'No se pudo subir el archivo.');
    } finally {
      setSubiendo(false);
    }
  };

  const hay = Boolean(value);
  const esPrivado = typeof value === 'string' && value.startsWith('privado:');

  return (
    <div>
      <div
        onClick={elegir}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(); } }}
        className="w-full rounded-2xl border-2 border-dashed border-border-2 bg-surface-2/40
                   hover:border-primary/40 hover:bg-surface-2 transition-all cursor-pointer
                   px-4 py-5 flex items-center gap-3"
      >
        <ClipIcon className="w-5 h-5 text-text-3 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          {hay ? (
            <>
              <span className="text-sm text-text-1 block truncate">
                {nombreLocal || 'Archivo adjunto'}
              </span>
              <span className="text-[11px] text-text-3 block">
                {subiendo ? 'Subiendo…' : 'Listo. Toca para cambiarlo.'}
              </span>
            </>
          ) : (
            <>
              <span className="text-sm text-text-2 block">
                {subiendo ? 'Subiendo…' : 'Toca para adjuntar un archivo'}
              </span>
              {campo?.sensible && (
                /* Se dice, y se dice ANTES de subir. Quien manda su cédula tiene
                   derecho a saber que no va a quedar en un enlace público. */
                <span className="text-[11px] text-text-3 block">
                  Se guarda en privado: sólo lo abre el equipo del evento.
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {hay && !subiendo && (
        <div className="flex items-center gap-3 mt-2">
          {/* Un archivo privado no se puede abrir desde aquí, y decirlo es mejor
              que ofrecer un enlace roto: ese bucket no tiene lectura pública. */}
          {!esPrivado && (
            <a href={value} target="_blank" rel="noopener noreferrer"
              className="text-xs text-primary-light hover:underline">Ver el archivo</a>
          )}
          <button type="button" onClick={() => { onChange(''); setNombreLocal(''); }}
            className="text-xs text-danger/80 hover:text-danger transition-colors">
            Quitar
          </button>
        </div>
      )}

      {err && <p className="text-xs text-danger-light mt-2">{err}</p>}

      <input
        ref={fileInput}
        type="file"
        onChange={e => manejar(e.target.files?.[0])}
        className="hidden"
      />
    </div>
  );
}

function ClipIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
