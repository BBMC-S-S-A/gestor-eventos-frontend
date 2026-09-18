/* La tarjeta de contacto que se ve al escanear una escarapela, y su «Guardar
 * contacto».
 *
 * Vive aparte porque la pintan dos pantallas: `/p/:codigo` (el enlace impreso
 * dentro del QR) y la página de «conectar» del evento, que lee las escarapelas
 * ya impresas. Si cada una armara su tarjeta, un día una enseñaría un dato que
 * la otra no — y el .vcf de una pondría el teléfono donde la otra pone el
 * correo.
 *
 * Los datos llegan ya resueltos por el servidor (`lib/tarjetaContacto.js`):
 * aquí sólo se pintan. Nada de esto decide qué se puede ver.
 */

const soloDigitos = (t) => String(t || '').replace(/[^\d+]/g, '');

/* Cómo se enlaza cada dato: un correo se escribe, un teléfono se abre en
   WhatsApp. El tipo lo pone la pregunta del evento. */
export function enlaceDe(d) {
  if (d.tipo === 'email' || /@/.test(d.valor)) return `mailto:${d.valor}`;
  if (d.tipo === 'telefono') return `https://wa.me/${soloDigitos(d.valor).replace(/^\+/, '')}`;
  if (/^https?:\/\//i.test(d.valor)) return d.valor;
  return null;
}

const datosSinNombre = (tarjeta) => (tarjeta?.datos || []).filter(d => d.id !== 'nombre');

/* Una tarjeta en formato vCard 3.0, que es lo que entienden la agenda de
   Android y la de iPhone. Cada dato va donde toca —teléfono, correo, cargo,
   empresa— y lo que no encaja en ninguno viaja como nota con su etiqueta. */
export function vcardDe(tarjeta, eventoTitulo) {
  const lineas = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${tarjeta.nombre}`];
  for (const d of datosSinNombre(tarjeta)) {
    if (d.tipo === 'email' || /@/.test(d.valor)) lineas.push(`EMAIL;TYPE=INTERNET:${d.valor}`);
    else if (d.tipo === 'telefono') lineas.push(`TEL;TYPE=CELL:${d.valor}`);
    else if (/cargo|rol|puesto/i.test(d.etiqueta)) lineas.push(`TITLE:${d.valor}`);
    else if (/empresa|organizaci|instituci|entidad|startup/i.test(d.etiqueta)) lineas.push(`ORG:${d.valor}`);
    else lineas.push(`NOTE:${d.etiqueta}: ${d.valor}`);
  }
  if (eventoTitulo) lineas.push(`NOTE:Nos conocimos en ${eventoTitulo}`);
  lineas.push('END:VCARD');
  return lineas.join('\n');
}

/* Baja un .vcf. Con varias tarjetas va un solo archivo con todas dentro: la
   agenda del móvil las importa de una vez. */
export function descargarVcf(texto, nombre) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/vcard' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${String(nombre || 'contacto').replace(/[^\w.-]+/g, '-').slice(0, 40) || 'contacto'}.vcf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function TarjetaContactoVista({ tarjeta, eventoTitulo, compacta = false, accion = null }) {
  const lista = datosSinNombre(tarjeta);
  return (
    <div>
      {!compacta && (
        <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">
          {eventoTitulo || 'Tarjeta de contacto'}
        </p>
      )}
      <h2 className={`${compacta ? 'text-lg' : 'text-2xl mt-1'} font-bold font-display text-text-1`}>{tarjeta.nombre}</h2>

      <div className={`${compacta ? 'mt-3' : 'mt-6'} space-y-2`}>
        {lista.map(d => <Fila key={d.id} etiqueta={d.etiqueta} valor={d.valor} href={enlaceDe(d)} />)}
      </div>

      <div className={`${compacta ? 'mt-3' : 'mt-6'} flex gap-2`}>
        <button onClick={() => descargarVcf(vcardDe(tarjeta, eventoTitulo), tarjeta.nombre)}
          className="btn-gradient flex-1">
          Guardar contacto
        </button>
        {accion}
      </div>
    </div>
  );
}

function Fila({ etiqueta, valor, href }) {
  const clases = 'flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-2/40 px-4 py-2.5';
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
