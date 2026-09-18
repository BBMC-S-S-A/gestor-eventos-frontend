import { useEffect, useState } from 'react';
import { eventosApi } from '../../../../api/eventos.js';
import { useToast } from '../../../../context/ToastContext.jsx';
import { qrPng } from '../../../../lib/qrPng.jsx';

/* Carné · qué se ve al escanear el QR de alguien con el celular.
 *
 * Es el ajuste que convierte el carné en una tarjeta de presentación para el
 * networking. Queda abierto para todos desde el registro —la autorización va
 * en los términos del evento— y cada asistente puede ocultarse desde su boleta.
 *
 * Las opciones las da el SERVIDOR (`GET /eventos/:id/tarjeta-contacto`), con la
 * misma regla con la que después publica: sólo datos para contactar a alguien.
 * Las preguntas que no lo son —documento, fecha de nacimiento, identidad de
 * género, discapacidad…— salen abajo, desactivadas y diciendo por qué, para
 * que nadie se pregunte si se le olvidó una.
 *
 * Sin nada marcado, no se comparte nada de nadie: así se puede dejar listo
 * antes de que los términos del evento lo digan y encenderlo ese día.
 */
export default function CompartirAlEscanear({ evento }) {
  const { success, error: toastErr } = useToast();
  const [opciones, setOpciones] = useState(null);
  const [elegidos, setElegidos] = useState([]);
  const [guardado, setGuardado] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [falla, setFalla] = useState('');

  useEffect(() => {
    let vivo = true;
    eventosApi.opcionesTarjetaContacto(evento.id)
      .then(d => {
        if (!vivo) return;
        setOpciones(d);
        setElegidos(d.elegidos || []);
        setGuardado(d.elegidos || []);
      })
      .catch(e => { if (vivo) setFalla(e.response?.data?.error || e.message); });
    return () => { vivo = false; };
  }, [evento.id]);

  const alternar = (id) => setElegidos(l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]));

  const guardar = async () => {
    setGuardando(true);
    try {
      await eventosApi.update(evento.id, { page_json: { tarjeta_contacto: { campos: elegidos } } });
      setGuardado(elegidos);
      success(elegidos.length
        ? 'Listo: al escanear un QR se verán esos datos, salvo de quien pidió ocultarlos.'
        : 'Listo: al escanear un QR no se comparte ningún dato.');
    } catch (e) {
      toastErr(e.response?.data?.error || e.message);
    } finally { setGuardando(false); }
  };

  const sinGuardar = JSON.stringify([...elegidos].sort()) !== JSON.stringify([...guardado].sort());

  /* La página donde la gente escanea para conectar. Es lo que hace servir las
     escarapelas YA impresas: su QR no lleva un enlace, así que la cámara normal
     no abre nada, pero esta página sí lo entiende. Para que la gente llegue,
     un QR grande en un cartel o en la pantalla del evento. */
  const urlConectar = `${window.location.origin}/explorar/${evento.slug}/conectar`;
  const bajarCartel = () => {
    const dataUrl = qrPng(urlConectar, 1200);
    if (!dataUrl) { toastErr('No se pudo generar el QR.'); return; }
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `conectar-${evento.slug}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="text-base font-semibold text-text-1">Al escanear el QR con un celular</h3>
        <p className="text-xs text-text-3 mt-1 leading-relaxed">
          El carné también sirve para presentarse: quien escanee el QR de otra persona ve sus datos de
          contacto y los guarda en su agenda. Queda abierto desde el registro; cada asistente puede
          ocultarse desde su boleta, y su QR le sigue sirviendo para entrar.
        </p>
      </div>
      <div className="card-body space-y-4">
        {falla && <p className="text-sm text-danger-light">No se pudieron cargar las opciones: {falla}</p>}
        {!opciones && !falla && <p className="text-xs text-text-3">Cargando…</p>}

        {opciones && (
          <>
            <div>
              <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold mb-2">Qué se comparte</p>
              <div className="flex flex-wrap gap-2">
                {opciones.permitidas.map(o => {
                  const on = elegidos.includes(o.id);
                  return (
                    <button key={o.id} onClick={() => alternar(o.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors
                        ${on ? 'border-accent bg-accent/10 text-text-1' : 'border-border text-text-3 hover:text-text-1'}`}>
                      {on ? '✓ ' : ''}{o.etiqueta}
                    </button>
                  );
                })}
              </div>
              {!elegidos.length && (
                <p className="text-[11px] text-warning mt-2">
                  Sin nada marcado no se comparte ningún dato. Marca lo que quieras mostrar cuando los
                  términos del evento lo digan.
                </p>
              )}
            </div>

            {opciones.bloqueadas.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold mb-2">No se pueden compartir</p>
                <div className="flex flex-wrap gap-2">
                  {opciones.bloqueadas.map(o => (
                    <span key={o.id} title="No es un dato de contacto"
                      className="px-3 py-1.5 rounded-xl text-xs border border-border/60 text-text-3/60 line-through decoration-text-3/40 cursor-not-allowed">
                      {o.etiqueta}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-text-3 mt-2 leading-relaxed">
                  Sólo se pueden compartir datos para contactar a alguien. Documento, fechas, respuestas de
                  selección y todo lo que hable de identidad, salud o dirección quedaría a la vista de
                  cualquiera que le haga una foto a una escarapela.
                </p>
              </div>
            )}

            {guardado.length > 0 && (
              <div className="rounded-2xl border border-border bg-surface-2/40 px-4 py-3 space-y-2">
                <p className="text-xs text-text-2 leading-relaxed">
                  <strong className="text-text-1">Para las escarapelas ya impresas:</strong> la cámara normal del
                  celular no abre sus QR. Que la gente entre a esta página y escanee desde ahí — funciona con
                  cualquier escarapela del evento.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <a href={urlConectar} target="_blank" rel="noreferrer" className="text-xs text-primary-light hover:underline break-all">
                    {urlConectar}
                  </a>
                  <button onClick={bajarCartel} className="btn-ghost btn-sm">Descargar QR para cartel</button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button onClick={guardar} disabled={guardando || !sinGuardar} className="btn-primary btn-sm">
                {guardando ? 'Guardando…' : sinGuardar ? 'Guardar' : 'Guardado'}
              </button>
              {sinGuardar && <span className="text-[11px] text-warning">Cambios sin guardar.</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
