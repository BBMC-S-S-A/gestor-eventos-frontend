import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { eventosApi } from '../../api/eventos.js';
import GLoader from '../../components/ui/GLoader.jsx';

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
 * Lo que se ve es lo que la persona escribió PARA ESTO y encendió a propósito.
 * Mientras no lo encienda, esta página dice que no comparte sus datos — y lo
 * dice en vez de callar, porque quien acaba de escanear necesita saber si se
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

  if (error) return (
    <Marco>
      <h1 className="text-xl font-bold font-display text-text-1 mb-2">No encontramos esta escarapela</h1>
      <p className="text-sm text-text-2">{error}</p>
    </Marco>
  );

  if (!datos?.compartido) return (
    <Marco>
      <h1 className="text-xl font-bold font-display text-text-1 mb-2">Esta persona no comparte sus datos</h1>
      <p className="text-sm text-text-2 leading-relaxed">
        Su escarapela es válida, pero todavía no encendió su tarjeta de contacto.
        Puede hacerlo desde su boleta, en <span className="font-mono">Mi boleta → Tarjeta de contacto</span>.
      </p>
      {datos?.evento?.slug && (
        <Link to={`/explorar/${datos.evento.slug}`} className="btn-ghost btn-sm mt-5 inline-flex">
          Ver {datos.evento.titulo || 'el evento'}
        </Link>
      )}
    </Marco>
  );

  const c = datos.contacto || {};
  /* Un archivo .vcf es lo que entienden la agenda de Android y la de iPhone:
     «guardar contacto» de verdad, no un nombre que hay que volver a teclear. */
  const guardarContacto = () => {
    const lineas = [
      'BEGIN:VCARD', 'VERSION:3.0',
      `FN:${datos.nombre}`,
      c.empresa ? `ORG:${c.empresa}` : null,
      c.cargo ? `TITLE:${c.cargo}` : null,
      c.email ? `EMAIL;TYPE=INTERNET:${c.email}` : null,
      c.telefono ? `TEL;TYPE=CELL:${c.telefono}` : null,
      c.whatsapp && c.whatsapp !== c.telefono ? `TEL;TYPE=CELL:${c.whatsapp}` : null,
      c.web ? `URL:${c.web}` : null,
      c.linkedin ? `URL:${c.linkedin}` : null,
      c.nota ? `NOTE:${c.nota.replace(/\n/g, ' ')}` : null,
      datos.evento?.titulo ? `NOTE:Nos conocimos en ${datos.evento.titulo}` : null,
      'END:VCARD',
    ].filter(Boolean).join('\n');
    const url = URL.createObjectURL(new Blob([lineas], { type: 'text/vcard' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${datos.nombre.replace(/[^\w.-]+/g, '-').slice(0, 40) || 'contacto'}.vcf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const soloDigitos = (t) => String(t || '').replace(/[^\d]/g, '');

  return (
    <Marco>
      <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">
        {datos.evento?.titulo || 'Tarjeta de contacto'}
      </p>
      <h1 className="text-2xl font-bold font-display text-text-1 mt-1">{datos.nombre}</h1>
      {(c.cargo || c.empresa) && (
        <p className="text-sm text-text-2 mt-1">
          {[c.cargo, c.empresa].filter(Boolean).join(' · ')}
        </p>
      )}
      {c.nota && <p className="text-sm text-text-2 mt-4 whitespace-pre-line leading-relaxed">{c.nota}</p>}

      <div className="mt-6 space-y-2">
        {c.whatsapp && (
          <Fila etiqueta="WhatsApp" valor={c.whatsapp} href={`https://wa.me/${soloDigitos(c.whatsapp)}`} />
        )}
        {c.telefono && <Fila etiqueta="Teléfono" valor={c.telefono} href={`tel:${soloDigitos(c.telefono)}`} />}
        {c.email && <Fila etiqueta="Correo" valor={c.email} href={`mailto:${c.email}`} />}
        {c.linkedin && <Fila etiqueta="LinkedIn" valor={c.linkedin} href={c.linkedin} />}
        {c.web && <Fila etiqueta="Web" valor={c.web} href={c.web} />}
      </div>

      <button onClick={guardarContacto} className="btn-gradient w-full mt-6">Guardar contacto</button>
      <p className="text-[11px] text-text-3 mt-3 leading-relaxed">
        Estos datos los publicó {datos.nombre.split(' ')[0]} para este evento. No incluyen nada
        de su registro.
      </p>
    </Marco>
  );
}

function Fila({ etiqueta, valor, href }) {
  return (
    <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer"
       className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-2/40 px-4 py-3 hover:border-primary/40 transition-colors">
      <span className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">{etiqueta}</span>
      <span className="text-sm text-text-1 truncate">{valor}</span>
    </a>
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
