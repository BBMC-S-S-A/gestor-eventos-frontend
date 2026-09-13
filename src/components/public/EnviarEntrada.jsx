import { useEffect, useRef, useState } from 'react';
import { clientesApi } from '../../api/clientes.js';
import { useToast } from '../../context/ToastContext.jsx';
import { tarjetaPng } from '../../lib/tarjetaPng.jsx';
import { walletConfig } from './WalletCard.jsx';
import { enlaceBoleta } from '../../lib/enlacesPublicos.js';
import { Flotante, usePosicionFlotante } from '../ui/Flotante.jsx';

/* GESTEK — Hacerle llegar la entrada a quien ya la tiene.
 *
 * ── Dos caminos, y el segundo lo eligió mal la primera versión ──────────
 *
 * · **Al correo** lo manda el servidor, y manda el correo de siempre —el mismo
 *   que sale al pagar, con la plantilla del evento y el QR dentro—. Reenviar
 *   algo distinto a lo que se envió el primer día es como se acaba con dos
 *   entradas que no se parecen.
 *
 * · **Compartir** abre el menú del sistema: WhatsApp, Instagram, Telegram,
 *   correo, lo que la persona tenga instalado. La primera versión de esto
 *   ponía un campo para escribir un número y abría `wa.me`, y eso es contestar
 *   otra pregunta: nadie quiere teclear un teléfono, quiere el menú de siempre.
 *
 * `navigator.share` es ese menú. Existe en todos los móviles y en Windows; en
 * los escritorios donde no existe se cae a `wa.me` con el mensaje escrito, que
 * es lo único que queda —y ahí sí conviene poder poner el número—.
 *
 * ── Se comparte el ENLACE; la imagen va sólo si el sistema la admite ─────
 *
 * Un PNG suelto no se revalida si cambia el token, no corrige la fecha si el
 * evento se mueve y lo reenvía cualquiera con el QR dentro. El enlace lleva a la
 * entrada viva y desde ahí se baja en los tres formatos.
 *
 * Cuando el sistema sabe compartir archivos se manda **la tarjeta Y el enlace**
 * juntos: la imagen es lo que se ve en el chat, el enlace es lo que sirve.
 */

const soloDigitos = (t) => String(t || '').replace(/\D+/g, '');

export default function EnviarEntrada({ evento = {}, ticket = {}, qrValue, className = '' }) {
  const { success, error: toastErr } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [numero, setNumero] = useState('');
  const caja = useRef(null);
  const ancla = useRef(null);
  const menu = useRef(null);
  /* Mismo patrón que `DescargarEntrada`, y por el mismo motivo que se descubrió
     ahí: el modal del asistente recorta a sus hijos, así que el desplegable sale
     por portal en coordenadas de pantalla o su última opción queda fuera del
     recorte y no se puede pulsar. */
  const pos = usePosicionFlotante(abierto, ancla, { altoMax: 360 });

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e) => {
      if (menu.current?.contains(e.target) || caja.current?.contains(e.target)) return;
      setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  const correo = ticket.guest_email || ticket.usuario?.email || '';
  const enlace = enlaceBoleta(evento, ticket.codigo);

  const enviarCorreo = async () => {
    setEnviando(true);
    try {
      const r = await clientesApi.reenviar(evento.id, ticket.id);
      success(`Entrada enviada a ${r.enviado_a}.`);
      setAbierto(false);
    } catch (e) {
      toastErr(e.response?.data?.error || e.message);
    } finally {
      setEnviando(false);
    }
  };

  const texto = `Tu entrada para ${evento.titulo || 'el evento'}: ${enlace}`;

  /* El menú del sistema: WhatsApp, Instagram, Telegram, correo… lo que la
     persona tenga. Existe en todos los móviles y en Windows. */
  const hayMenuSistema = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  /* Compartir de verdad. Intenta con la tarjeta adjunta y, si el sistema no
     admite archivos —o falla al generarla—, comparte sólo el enlace: quedarse
     sin compartir por no poder adjuntar una imagen sería cambiar lo importante
     por el adorno. */
  const compartir = async () => {
    setEnviando(true);
    try {
      const base = { title: evento.titulo || 'Entrada', text: texto, url: enlace };
      let archivos = null;

      if (typeof navigator.canShare === 'function') {
        try {
          const design = walletConfig(evento.page_json, { publico: 'asistentes', tipo: ticket.tipo?.nombre });
          /* `qrValue` va como tal y no disfrazado de `qr_token` dentro de una
             copia del ticket: era la única forma de decirle a la tarjeta qué
             imprimir antes de que aceptara el valor de frente. */
          const dataUrl = await tarjetaPng({ design, evento, ticket, qrValue });
          if (dataUrl) {
            const blob = await (await fetch(dataUrl)).blob();
            const f = new File([blob], `entrada-${ticket.codigo}.png`, { type: 'image/png' });
            if (navigator.canShare({ files: [f] })) archivos = [f];
          }
        } catch { /* sin imagen, pero con enlace */ }
      }

      await navigator.share(archivos ? { ...base, files: archivos } : base);
      setAbierto(false);
    } catch (e) {
      /* Cancelar el diálogo del sistema lanza `AbortError`, y eso no es un
         fallo: es alguien que cambió de idea. Avisarlo sería regañarle. */
      if (e?.name !== 'AbortError') toastErr(e.message || 'No se pudo compartir.');
    } finally {
      setEnviando(false);
    }
  };

  /* Sin menú del sistema —escritorios viejos— queda WhatsApp web, y ahí sí
     hace falta el número. El teléfono va SIN validar el país: se escribe
     «312…», «+57 312…» y «57312…» para el mismo móvil, y rechazar cualquiera
     de las tres es discutir con quien lo tiene delante. */
  const abrirWhatsapp = () => {
    const tel = soloDigitos(numero);
    const url = tel
      ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`
      : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank', 'noopener');
    setAbierto(false);
  };

  return (
    <div className="relative" ref={caja}>
      <button ref={ancla} type="button" onClick={() => setAbierto(v => !v)}
        aria-expanded={abierto} aria-haspopup="menu"
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border-2 text-sm text-text-2 hover:text-text-1 hover:bg-surface-2 transition-colors ${className}`}>
        <IconoEnviar className="w-3.5 h-3.5" /> Enviar
      </button>

      {abierto && (
        <Flotante pos={pos} ancho="propio" ref={menu} style={{ width: 320 }}
          className="rounded-2xl border border-border-2 bg-surface shadow-xl text-left">
          <div className="p-3 space-y-3">
            <div>
              <p className="text-sm font-semibold text-text-1">Al correo registrado</p>
              {correo ? (
                <>
                  <p className="text-[11px] text-text-3 mt-0.5 truncate">{correo}</p>
                  <button onClick={enviarCorreo} disabled={enviando}
                    className="btn-primary btn-sm w-full justify-center mt-2">
                    {enviando ? 'Enviando…' : 'Enviar la entrada'}
                  </button>
                  <p className="text-[11px] text-text-3 mt-1.5 leading-relaxed">
                    Es el mismo correo que sale al pagar, con el QR dentro. Si la dirección está mal,
                    corrígela en la boleta y vuelve a enviarlo.
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-warning-light mt-1 leading-relaxed">
                  Esta boleta no tiene correo. Escríbelo en la boleta y podrás enviársela.
                </p>
              )}
            </div>

            <div className="border-t border-border pt-3">
              {hayMenuSistema ? (<>
                {/* El menú de siempre: WhatsApp, Instagram, Telegram, correo…
                    lo que la persona tenga instalado. Es lo que se pidió y lo
                    que ya sabe usar; escribir un número a mano no lo es. */}
                <button onClick={compartir} disabled={enviando}
                  className="btn-secondary btn-sm w-full justify-center">
                  {enviando ? 'Preparando…' : 'Compartir…'}
                </button>
                <p className="text-[11px] text-text-3 mt-1.5 leading-relaxed">
                  Se abre el menú de tu teléfono o de Windows. Va el{' '}
                  <b className="text-text-2">enlace</b> a su entrada —y la tarjeta como imagen, si el
                  sistema deja adjuntarla—.
                </p>
              </>) : (<>
                {/* Sin menú del sistema no queda más que WhatsApp web, y ahí sí
                    hace falta el número. */}
                <p className="text-sm font-semibold text-text-1">Por WhatsApp</p>
                <p className="text-[11px] text-text-3 mt-0.5 leading-relaxed">
                  Este navegador no tiene menú de compartir, así que se abre WhatsApp web con el
                  mensaje escrito. Lo mandas tú, no la plataforma.
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <input value={numero} onChange={e => setNumero(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); abrirWhatsapp(); } }}
                    inputMode="tel" placeholder="Número (opcional)"
                    className="input !h-9 text-sm flex-1 min-w-0" />
                  <button onClick={abrirWhatsapp} className="btn-secondary btn-sm flex-shrink-0">Abrir</button>
                </div>
              </>)}
            </div>

          </div>
        </Flotante>
      )}
    </div>
  );
}

function IconoEnviar({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 12l16-8-6 16-2.5-6.5L4 12z" />
    </svg>
  );
}
