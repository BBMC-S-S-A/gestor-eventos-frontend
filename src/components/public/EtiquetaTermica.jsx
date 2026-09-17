import { QRCodeSVG } from 'qrcode.react';
import { ETIQUETA_DEFECTO, ALTURAS_MM, medidas, normalizarEtiqueta, correoDe, tamCodigoMm } from '../../lib/etiquetaTermica.js';

/* Una escarapela para la etiquetadora térmica, a tamaño real.
 *
 * Se dibuja en milímetros y no en píxeles: lo que importa es cuánto mide en la
 * mano, no cómo se ve en pantalla. El navegador la manda a la impresora con
 * `@page { size: 90mm 55mm }`, así que lo que se ve aquí es lo que sale.
 *
 * ── Por qué es blanco y negro ────────────────────────────────────────────
 *
 * La transferencia térmica es de un bit: cada punto se imprime o no. No hay
 * grises ni colores —sólo el de la cinta cargada—, así que el color por tipo de
 * asistente, que es lo único configurable de la escarapela normal, aquí no
 * existe. Se sustituye por el recuadro: con borde para todos, relleno para el
 * tipo que se quiera destacar. Ver `lib/etiquetaTermica.js`.
 *
 * ── Lo que NO se imprime, y por qué ──────────────────────────────────────
 *
 * · **La marca de agua.** Un fondo tenue es una trama a 203 dpi, se ve sucia y
 *   además come contraste justo alrededor del QR.
 * · **El logo, si es a color.** Sale como una mancha. Se deja opcional y se
 *   avisa: en térmica un logo sólo funciona si es una silueta de un solo tono.
 * · **Los campos extra del formulario.** Caben dos líneas de texto, y el nombre
 *   y el tipo son las dos que se miran en la puerta. */

export default function EtiquetaTermica({
  ticket = {},
  qrValue,
  logoUrl = '',
  mostrarCodigo = true,
  /* Las medidas del rollo que el organizador tenga. Sin esto, las de siempre. */
  etiqueta,
}) {
  const E = etiqueta ? normalizarEtiqueta(etiqueta) : ETIQUETA_DEFECTO;
  const valor = qrValue || ticket.qr_token || ticket.codigo || '';
  const m = medidas(valor, E);

  const nombre = (ticket.asistente?.nombre || ticket.guest_nombre || '').trim();
  const correo = correoDe(ticket);

  if (!m.cabe) {
    return (
      <div className="rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm text-text-2">
        No se puede imprimir esta escarapela: {m.motivo}
      </div>
    );
  }

  const anchoTexto = m.texto_mm;

  return (
    <div
      className="etiqueta-termica"
      style={{
        width: `${E.ancho}mm`,
        height: `${E.alto}mm`,
        padding: `${E.margen}mm`,
        boxSizing: 'border-box',
        display: 'flex',
        /* Al lado o debajo, según lo que quepa. Lo decide `medidas()` con las
           reglas de espacio, no este archivo: aquí sólo se dibuja. */
        flexDirection: m.disposicion === 'debajo' ? 'column' : 'row',
        alignItems: m.disposicion === 'debajo' ? 'center' : 'stretch',
        gap: `${E.separacion}mm`,
        background: '#fff',
        color: '#000',
        /* Sin sombras, sin bordes redondeados y sin opacidades: nada de eso
           existe en un bit, y en pantalla haría creer que sí. */
        fontFamily: 'Helvetica, Arial, sans-serif',
      }}
    >
      {/* Sin QR: el serial, grande, ocupando el sitio que tendría el código.

          Es lo que va en una manilla, donde el QR no cabe. Y tiene una ventaja
          que el cuadrado no tiene: se lee doblada, mojada y rayada, que es como
          está una manilla al tercer día. */}
      {E.formato_codigo === 'serial' ? (
        <div style={{
          flex: '1 1 auto', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '1mm', minWidth: 0,
        }}>
          {nombre && (
            <p style={{
              fontSize: `${Math.min(ALTURAS_MM.nombre, Math.max(2.5, (E.alto - E.margen * 2) / 3))}mm`,
              fontWeight: 700, lineHeight: 1, margin: 0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              maxWidth: '100%',
            }}>{nombre}</p>
          )}
          <p style={{
            fontFamily: 'Courier, monospace',
            /* El serial manda: es lo que alguien teclea en la puerta con gente
               detrás. Ocupa la mitad del alto útil, con tope para que en una
               pieza grande no salga absurdo. */
            fontSize: `${Math.min(12, Math.max(3, (E.alto - E.margen * 2) / 2))}mm`,
            fontWeight: 700, letterSpacing: '0.6mm', lineHeight: 1, margin: 0,
          }}>{ticket.codigo || '—'}</p>
        </div>
      ) : (
      <>
      {/* El QR, centrado dentro del cuadrado que se le reserva.

          Se pidió «4×4 cm centrado», y el código mide 36,5: el resto es blanco
          a su alrededor. No es un ajuste a la baja por pereza —ver `medidas()`—:
          40 mm exactos darían 4,38 puntos por módulo, y un módulo que no cae en
          punto entero lo redondea el cabezal a su manera, dejando el borde con
          diente. Reservar los 40 y centrar dentro deja el hueco pedido con el
          código impreso limpio. */}
      <div style={{
        flex: `0 0 ${m.caja_mm}mm`, width: `${m.caja_mm}mm`, height: `${m.caja_mm}mm`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <QRCodeSVG
          value={valor}
          level="M"
          includeMargin
          style={{ width: `${m.lado_mm}mm`, height: `${m.lado_mm}mm`, display: 'block' }}
        />
      </div>

      <div style={{
        flex: '1 1 auto', minWidth: 0, width: `${anchoTexto}mm`,
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1.5mm',
        /* Con el QR arriba, el texto se centra: si no, un nombre corto queda
           pegado al borde izquierdo y la etiqueta parece torcida. */
        textAlign: m.disposicion === 'debajo' ? 'center' : 'left',
        alignItems: m.disposicion === 'debajo' ? 'center' : 'stretch',
      }}>
        {logoUrl && (
          <img src={logoUrl} alt="" style={{ height: '5mm', objectFit: 'contain', objectPosition: 'left', filter: 'grayscale(1) contrast(3)' }} />
        )}

        <p style={{
          fontSize: `${ALTURAS_MM.nombre}mm`,
          fontWeight: 800,
          lineHeight: 1.05,
          margin: 0,
          /* Dos líneas y corta. Un nombre largo partido en cuatro líneas deja
             la escarapela ilegible desde lejos, que es justo para lo que sirve. */
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          wordBreak: 'break-word',
        }}>
          {nombre || 'Sin nombre'}
        </p>

        {mostrarCodigo && ticket.codigo && (
          <p style={{
            fontFamily: 'Courier, monospace',
            fontSize: `${tamCodigoMm(ticket.codigo, anchoTexto)}mm`,
            letterSpacing: '0.3mm',
            fontWeight: 700,
            lineHeight: 1,
            margin: 0,
            whiteSpace: 'nowrap',
          }}>
            {ticket.codigo}
          </p>
        )}

        {correo && (
          <p style={{
            fontSize: `${ALTURAS_MM.correo}mm`,
            margin: 0, lineHeight: 1.15, wordBreak: 'break-all',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {correo}
          </p>
        )}
      </div>
      </>
      )}
    </div>
  );
}
