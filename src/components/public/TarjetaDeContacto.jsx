import { useState } from 'react';
import { eventosApi } from '../../api/eventos.js';
import { useToast } from '../../context/ToastContext.jsx';

/* «Déjame escanear tu QR» — el lado de quien lleva la escarapela.
 *
 * Aquí la persona decide si su QR, además de abrir la puerta, presenta sus
 * datos a quien lo escanee con el móvil. Tres decisiones que no son de estilo:
 *
 * · **Apagada de fábrica.** Registrarse no es aceptar que te encuentren.
 * · **Campos propios y vacíos.** No se rellenan con lo que puso en el
 *   formulario del evento: ese formulario pide documento, fecha de nacimiento
 *   o identidad de género según el evento, y nada de eso puede acabar a la
 *   vista de quien pase un móvil por una escarapela. Si quiere dar su correo,
 *   lo escribe.
 * · **Apagarla cuesta un toque**, igual que encenderla. Una autorización que
 *   cuesta más retirar que dar no es una autorización.
 */

const CAMPOS = [
  ['empresa',  'Empresa u organización', 'text',  'Dónde trabajas'],
  ['cargo',    'Cargo',                  'text',  'A qué te dedicas ahí'],
  ['whatsapp', 'WhatsApp',               'tel',   'Con indicativo: +57 300…'],
  ['telefono', 'Teléfono',               'tel',   'Si es distinto del WhatsApp'],
  ['email',    'Correo de contacto',     'email', 'El que quieras dar aquí'],
  ['linkedin', 'LinkedIn',               'text',  'linkedin.com/in/…'],
  ['web',      'Web',                    'text',  'tuempresa.com'],
];

export default function TarjetaDeContacto({ codigo, inicial = {}, publicoInicial = false }) {
  const { success, error: toastErr } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [campos, setCampos] = useState(() => ({ ...inicial }));
  const [nota, setNota] = useState(inicial.nota || '');
  const [publico, setPublico] = useState(Boolean(publicoInicial));
  const [guardando, setGuardando] = useState(false);

  const set = (k, v) => setCampos(c => ({ ...c, [k]: v }));

  const guardar = async (encender) => {
    setGuardando(true);
    try {
      const contacto = { ...campos, nota };
      const r = await eventosApi.guardarTarjetaContacto(codigo, contacto, encender);
      setPublico(r.publico);
      success(encender
        ? 'Listo: quien escanee tu QR verá tu tarjeta.'
        : 'Tu tarjeta ya no se ve al escanear tu QR.');
    } catch (e) {
      toastErr(e.response?.data?.error || e.message);
    } finally { setGuardando(false); }
  };

  return (
    <div className="mt-6 rounded-2xl border border-border bg-surface-2/30 px-4 py-3.5">
      <button onClick={() => setAbierto(a => !a)} className="w-full flex items-center justify-between gap-3 text-left">
        <span className="text-sm text-text-1">
          <strong>Tarjeta de contacto.</strong>{' '}
          <span className="text-text-2">
            {publico
              ? 'Quien escanee tu QR puede ver tus datos.'
              : 'Ahora mismo tu QR no muestra ningún dato tuyo.'}
          </span>
        </span>
        <span className="text-primary-light text-sm font-medium whitespace-nowrap">
          {abierto ? 'Cerrar' : publico ? 'Editar' : 'Configurar'}
        </span>
      </button>

      {abierto && (
        <div className="mt-4 space-y-3">
          <p className="text-[11px] text-text-3 leading-relaxed">
            Esto es lo único que verá quien escanee tu escarapela. No se muestra nada de lo que
            escribiste al registrarte, y puedes apagarlo cuando quieras.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CAMPOS.map(([k, label, tipo, pista]) => (
              <div key={k} className="field">
                <label className="label">{label}</label>
                <input type={tipo} value={campos[k] || ''} onChange={e => set(k, e.target.value)}
                  placeholder={pista} className="input-form" />
              </div>
            ))}
          </div>

          <div className="field">
            <label className="label">Una línea sobre ti <span className="lowercase tracking-normal font-normal text-text-3">(opcional)</span></label>
            <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2} maxLength={280}
              placeholder="En qué andas, qué buscas en el evento…" className="input-form" />
          </div>

          <div className="flex items-center gap-2 flex-wrap pt-1">
            <button onClick={() => guardar(true)} disabled={guardando} className="btn-gradient btn-sm">
              {guardando ? 'Guardando…' : publico ? 'Guardar cambios' : 'Compartir mi tarjeta'}
            </button>
            {publico && (
              <button onClick={() => guardar(false)} disabled={guardando} className="btn-ghost btn-sm">
                Dejar de compartir
              </button>
            )}
            {publico && (
              <a href={`/p/${codigo}`} target="_blank" rel="noreferrer" className="text-xs text-primary-light hover:underline ml-auto">
                Ver cómo la ven
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
