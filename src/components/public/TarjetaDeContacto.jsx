import { useState } from 'react';
import { eventosApi } from '../../api/eventos.js';
import { useToast } from '../../context/ToastContext.jsx';

/* «Déjame escanear tu QR» — el lado de quien lleva la escarapela.
 *
 * El organizador elige qué datos de contacto se comparten, y quedan abiertos
 * desde el registro: la autorización va en los términos del evento. Lo que se
 * le da aquí a la persona son dos cosas:
 *
 * · **La lista literal** de lo que verá quien la escanee —«tu nombre, tu
 *   teléfono y tu correo»—. No una promesa abstracta: las etiquetas del
 *   evento, las mismas que resuelve el servidor al publicar.
 * · **La salida**: marcar que no quiere que aparezcan sus datos. Su QR sigue
 *   sirviendo para entrar; sólo deja de presentarla.
 *
 * Si el evento no comparte contactos, esta sección no sale.
 */
export default function TarjetaDeContacto({ codigo, campos = [], ocultoInicial = false }) {
  const { success, error: toastErr } = useToast();
  const [oculto, setOculto] = useState(Boolean(ocultoInicial));
  const [guardando, setGuardando] = useState(false);

  if (!campos.length) return null;

  const cambiar = async (valor) => {
    setGuardando(true);
    try {
      const r = await eventosApi.ocultarTarjetaContacto(codigo, valor);
      setOculto(r.oculto);
      success(r.oculto
        ? 'Listo: tu QR ya no muestra tus datos. Sigue sirviendo para entrar.'
        : 'Listo: quien escanee tu QR verá tus datos de contacto.');
    } catch (e) {
      toastErr(e.response?.data?.error || e.message);
    } finally { setGuardando(false); }
  };

  const lista = campos.length === 1
    ? campos[0]
    : `${campos.slice(0, -1).join(', ')} y ${campos[campos.length - 1]}`;

  return (
    <div className="mt-6 rounded-2xl border border-border bg-surface-2/30 px-4 py-3.5">
      <p className="text-sm text-text-1">
        <strong>Tu QR también sirve para presentarte.</strong>
      </p>
      <p className="text-xs text-text-2 mt-1 leading-relaxed">
        {oculto
          ? <>Pediste que no aparezcan tus datos. Quien escanee tu QR no verá nada, y sigues entrando con él igual.</>
          : <>Quien escanee tu QR con su celular verá: <strong className="text-text-1">{lista}</strong>. Nada más de lo que escribiste al registrarte.</>}
      </p>

      <label className="mt-3 flex items-center gap-2 text-xs text-text-2 cursor-pointer select-none">
        <input type="checkbox" checked={oculto} disabled={guardando}
          onChange={e => cambiar(e.target.checked)} className="accent-[#8B5CF6]" />
        No quiero que aparezcan mis datos al escanear mi QR
      </label>

      {!oculto && (
        <a href={`/p/${codigo}`} target="_blank" rel="noreferrer"
          className="inline-block text-xs text-primary-light hover:underline mt-2">
          Ver cómo te ven
        </a>
      )}
    </div>
  );
}
