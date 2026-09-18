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

  const soloDigitos = (t) => String(t || '').replace(/[^\d+]/g, '');
  /* Cómo se enlaza cada dato: un correo se escribe, un teléfono se llama o se
     abre en WhatsApp. El tipo lo pone la pregunta del evento. */
  const enlaceDe = (d) => {
    if (d.tipo === 'email' || /@/.test(d.valor)) return `mailto:${d.valor}`;
    if (d.tipo === 'telefono') return `https://wa.me/${soloDigitos(d.valor).replace(/^\+/, '')}`;
    if (/^https?:\/\//i.test(d.valor)) return d.valor;
    return null;
  };
  const lista = (datos.datos || []).filter(d => d.id !== 'nombre');

  /* Un archivo .vcf es lo que entienden la agenda de Android y la de iPhone:
     «guardar contacto» de verdad, no un nombre que hay que volver a teclear. */
  const guardarContacto = () => {
    const lineas = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${datos.nombre}`];
    for (const d of lista) {
      if (d.tipo === 'email' || /@/.test(d.valor)) lineas.push(`EMAIL;TYPE=INTERNET:${d.valor}`);
      else if (d.tipo === 'telefono') lineas.push(`TEL;TYPE=CELL:${d.valor}`);
      else if (/cargo|rol|puesto/i.test(d.etiqueta)) lineas.push(`TITLE:${d.valor}`);
      else if (/empresa|organizaci|instituci|entidad|startup/i.test(d.etiqueta)) lineas.push(`ORG:${d.valor}`);
      else lineas.push(`NOTE:${d.etiqueta}: ${d.valor}`);
    }
    if (datos.evento?.titulo) lineas.push(`NOTE:Nos conocimos en ${datos.evento.titulo}`);
    lineas.push('END:VCARD');
    const url = URL.createObjectURL(new Blob([lineas.join('\n')], { type: 'text/vcard' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${datos.nombre.replace(/[^\w.-]+/g, '-').slice(0, 40) || 'contacto'}.vcf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Marco>
      <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">
        {datos.evento?.titulo || 'Tarjeta de contacto'}
      </p>
      <h1 className="text-2xl font-bold font-display text-text-1 mt-1">{datos.nombre}</h1>
      <div className="mt-6 space-y-2">
        {lista.map(d => (
          <Fila key={d.id} etiqueta={d.etiqueta} valor={d.valor} href={enlaceDe(d)} />
        ))}
      </div>

      <button onClick={guardarContacto} className="btn-gradient w-full mt-6">Guardar contacto</button>
      <p className="text-[11px] text-text-3 mt-3 leading-relaxed">
        Son los datos de contacto que este evento comparte para el networking. No incluyen
        nada más de su registro.
      </p>
    </Marco>
  );
}

function Fila({ etiqueta, valor, href }) {
  const clases = 'flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-2/40 px-4 py-3';
  const dentro = (
    <>
      <span className="text-[11px] uppercase tracking-widest text-text-3 font-semibold truncate">{etiqueta}</span>
      <span className="text-sm text-text-1 truncate">{valor}</span>
    </>
  );
  if (!href) return <div className={clases}>{dentro}</div>;
  return (
    <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer"
       className={`${clases} hover:border-primary/40 transition-colors`}>
      {dentro}
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
