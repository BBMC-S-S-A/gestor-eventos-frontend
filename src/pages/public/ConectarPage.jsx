import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { eventosApi } from '../../api/eventos.js';
import QrScanner from '../../components/ui/QrScanner.jsx';
import TarjetaContactoVista, { vcardDe, descargarVcf } from '../../components/public/TarjetaContactoVista.jsx';

/* «Escanea para conectar» — el networking del evento con las escarapelas que
 * ya están impresas.
 *
 * ── Por qué existe esta página ───────────────────────────────────────────
 *
 * El QR de una escarapela sólo abre una página con la cámara normal del
 * celular si lleva un enlace. FESTECH las imprimió con la firma completa o con
 * el código corto: al escanearlas, el teléfono enseña un texto y nada más.
 * Reimprimir tres mil escarapelas a mitad del evento no es una opción.
 *
 * Así que la cámara la abre esta página: se entra una vez —por un QR en un
 * cartel, o desde la página del evento— y desde aquí se escanea a todas las
 * personas que se quiera. Sin cuenta y sin instalar nada. El servidor entiende
 * las tres formas del QR y, sólo si esa persona no se ocultó, devuelve los
 * datos de contacto que el evento eligió compartir.
 *
 * Las personas que se van conociendo quedan en una lista EN ESTE teléfono
 * (`localStorage`): al final del día se guardan todas en la agenda de una vez.
 * No viaja a ningún servidor quién escaneó a quién.
 */

const clave = (slug) => `gestek-conocidos:${slug}`;

function leerConocidos(slug) {
  try { return JSON.parse(localStorage.getItem(clave(slug)) || '[]'); } catch { return []; }
}
function guardarConocidos(slug, lista) {
  try { localStorage.setItem(clave(slug), JSON.stringify(lista)); } catch { /* sin almacenamiento, sólo se pierde la lista */ }
}

export default function ConectarPage() {
  const { slug } = useParams();
  const [titulo, setTitulo] = useState('');
  const [ultimo, setUltimo] = useState(null);   // { tarjeta } | { aviso } | { error }
  const [conocidos, setConocidos] = useState(() => leerConocidos(slug));
  const ocupado = useRef(false);

  useEffect(() => {
    eventosApi.publicoBySlug(slug)
      .then(d => setTitulo(d?.evento?.titulo || d?.titulo || ''))
      /* Sólo es el título de arriba. Si no llega, la página dice «Networking»
         y escanear funciona igual: no puede impedir conocer a nadie. */
      .catch(() => {});
  }, [slug]);

  const recordar = useCallback((tarjeta) => {
    setConocidos(prev => {
      /* La misma persona escaneada dos veces no se apunta dos veces: se
         reconoce por su nombre y su primer dato. */
      const huella = `${tarjeta.nombre}|${tarjeta.datos?.[1]?.valor || ''}`;
      if (prev.some(c => `${c.nombre}|${c.datos?.[1]?.valor || ''}` === huella)) return prev;
      const lista = [{ ...tarjeta, cuando: Date.now() }, ...prev].slice(0, 300);
      guardarConocidos(slug, lista);
      return lista;
    });
  }, [slug]);

  const alLeer = useCallback(async (texto) => {
    if (ocupado.current) return;
    ocupado.current = true;
    try {
      const r = await eventosApi.conectar(slug, texto);
      if (r.compartido) {
        setUltimo({ tarjeta: r });
        recordar(r);
      } else {
        setUltimo({
          aviso: r.motivo === 'persona'
            ? 'Esta persona prefiere no compartir sus datos. Pídele su contacto directamente.'
            : 'Este evento no comparte datos de contacto al escanear.',
        });
      }
    } catch (e) {
      setUltimo({ error: e.response?.data?.error || 'No pudimos leer ese QR. Intenta de nuevo.' });
    } finally {
      ocupado.current = false;
    }
  }, [slug, recordar]);

  const guardarTodos = () => {
    if (!conocidos.length) return;
    descargarVcf(conocidos.map(c => vcardDe(c, titulo)).join('\n'), `contactos-${slug}`);
  };

  const olvidar = (i) => setConocidos(prev => {
    const lista = prev.filter((_, j) => j !== i);
    guardarConocidos(slug, lista);
    return lista;
  });

  /* Lo que flota sobre la cámara después de cada lectura. */
  const tarjetaFlotante = ultimo && (
    <div className="rounded-3xl backdrop-blur-xl bg-surface/95 border border-border p-5">
      {ultimo.tarjeta && (
        <TarjetaContactoVista tarjeta={ultimo.tarjeta} eventoTitulo={titulo} compacta
          accion={<button onClick={() => setUltimo(null)} className="btn-ghost">Otro</button>} />
      )}
      {(ultimo.aviso || ultimo.error) && (
        <div className="flex items-start justify-between gap-3">
          <p className={`text-sm ${ultimo.error ? 'text-danger-light' : 'text-text-2'}`}>{ultimo.aviso || ultimo.error}</p>
          <button onClick={() => setUltimo(null)} className="btn-ghost btn-sm flex-shrink-0">Otro</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-md mx-auto space-y-5">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">{titulo || 'Networking'}</p>
          <h1 className="text-2xl font-bold font-display text-text-1 mt-1">Conecta con otros asistentes</h1>
          <p className="text-sm text-text-2 mt-2 leading-relaxed">
            Escanea el QR de la escarapela de alguien y guarda su contacto en tu agenda. Solo verás los datos
            que el evento comparte para el networking, y nada de quien prefirió no compartirlos.
          </p>
        </div>

        <QrScanner
          onScan={alLeer}
          overlay={tarjetaFlotante}
          containerId="qr-conectar"
          titulo="Apunta al QR de la escarapela"
          textoActivar="Escanear un QR"
          descripcion="Se abrirá la cámara. Tu navegador te pedirá permiso la primera vez."
        />

        <div className="rounded-3xl border border-border bg-surface/40 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-text-1">Personas que conociste · {conocidos.length}</h2>
            {conocidos.length > 0 && (
              <button onClick={guardarTodos} className="btn-primary btn-sm">Guardar todos</button>
            )}
          </div>
          {conocidos.length === 0 ? (
            <p className="text-xs text-text-3 mt-3">
              Aquí irán apareciendo las personas que escanees. Se quedan en este teléfono.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {conocidos.map((c, i) => (
                <li key={`${c.nombre}-${c.cuando}`} className="flex items-center gap-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-1 truncate">{c.nombre}</p>
                    <p className="text-xs text-text-3 truncate">
                      {(c.datos || []).filter(d => d.id !== 'nombre').map(d => d.valor).join(' · ')}
                    </p>
                  </div>
                  <button onClick={() => descargarVcf(vcardDe(c, titulo), c.nombre)} className="btn-ghost btn-sm">Guardar</button>
                  <button onClick={() => olvidar(i)} aria-label={`Quitar a ${c.nombre}`}
                    className="text-text-3 hover:text-text-1 text-lg leading-none px-1">×</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Link to={`/explorar/${slug}`} className="block text-center text-xs text-text-3 hover:text-text-1">
          Volver al evento
        </Link>
      </div>
    </div>
  );
}
