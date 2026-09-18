import { useEffect, useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { eventosApi } from '../../api/eventos.js';
import GLoader from '../../components/ui/GLoader.jsx';
import TarjetaContactoVista from '../../components/public/TarjetaContactoVista.jsx';

/* «Déjame escanear tu QR» — la otra cara de la escarapela.
 *
 * ── Qué resuelve ─────────────────────────────────────────────────────────
 *
 * En un evento de networking, dos personas que acaban de conocerse se dictan
 * el WhatsApp letra por letra, o se hacen una foto de la escarapela para
 * apuntarlo después —y no lo apuntan—. El mismo QR que abre la puerta abre
 * esto cuando lo lee la cámara de cualquier móvil.
 *
 * ── Lo que NO se enseña, y por qué ───────────────────────────────────────
 *
 * Nada del formulario de registro. Ese formulario, según el evento, pide
 * documento de identidad, fecha de nacimiento, identidad de género,
 * autorreconocimiento étnico o discapacidad. Enseñar eso aquí convertiría cada
 * escarapela colgada del cuello en una ficha pública, y son datos que la ley
 * trata aparte: hacen falta autorización específica y una forma de retirarla.
 *
 * Lo que se ve son los datos de contacto que eligió el organizador —nombre,
 * teléfono, correo, cargo—, resueltos en el servidor. Cuando no hay nada que
 * enseñar se dice por qué, porque quien acaba de escanear necesita saber si se
 * equivocó de código o si simplemente no hay nada que ver.
 */

export default function TarjetaContactoPage() {
  const { codigo } = useParams();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    eventosApi.tarjetaContacto(codigo)
      .then(d => { if (vivo) setDatos(d); })
      .catch(e => { if (vivo) setError(e.response?.data?.error || 'No pudimos abrir esta tarjeta.'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [codigo]);

  if (cargando) return <div className="min-h-screen flex items-center justify-center"><GLoader /></div>;

  /* Quien escanea con la cámara normal aterriza en la página de «conectar» del
     evento: ve a esta persona, se la queda en su lista, y desde ahí puede
     escanear a la siguiente sin volver a buscar ningún enlace. Sin evento
     conocido (código que no existe) se queda aquí, diciendo qué pasó. */
  if (datos?.evento?.slug) {
    return <Navigate replace to={`/explorar/${datos.evento.slug}/conectar?c=${encodeURIComponent(codigo)}`} />;
  }

  if (error) return (
    <Marco>
      <h1 className="text-xl font-bold font-display text-text-1 mb-2">No encontramos esta escarapela</h1>
      <p className="text-sm text-text-2">{error}</p>
    </Marco>
  );

  if (!datos?.compartido) return (
    <Marco>
      <h1 className="text-xl font-bold font-display text-text-1 mb-2">
        {datos?.motivo === 'persona' ? 'Esta persona prefiere no compartir sus datos' : 'Aquí no hay datos de contacto'}
      </h1>
      <p className="text-sm text-text-2 leading-relaxed">
        {datos?.motivo === 'persona'
          ? 'Su escarapela es válida. Si quieres seguir en contacto, pídele sus datos directamente.'
          : 'Este evento no comparte datos de contacto al escanear las escarapelas.'}
      </p>
      {datos?.evento?.slug && (
        <Link to={`/explorar/${datos.evento.slug}`} className="btn-ghost btn-sm mt-5 inline-flex">
          Ver {datos.evento.titulo || 'el evento'}
        </Link>
      )}
    </Marco>
  );

  return (
    <Marco>
      <TarjetaContactoVista tarjeta={datos} eventoTitulo={datos.evento?.titulo} />
      <p className="text-[11px] text-text-3 mt-3 leading-relaxed">
        Son los datos de contacto que este evento comparte para el networking. No incluyen
        nada más de su registro.
      </p>
    </Marco>
  );
}

function Marco({ children }) {
  return (
    <div className="min-h-screen flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-border bg-surface/60 p-6">
        {children}
      </div>
    </div>
  );
}
