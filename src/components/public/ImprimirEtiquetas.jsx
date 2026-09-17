import EtiquetaTermica from './EtiquetaTermica.jsx';
import { ETIQUETA_DEFECTO, normalizarEtiqueta } from '../../lib/etiquetaTermica.js';

/* Mandar escarapelas a la etiquetadora.
 *
 * ── Una etiqueta por página, y por qué ───────────────────────────────────
 *
 * El diseñador de escarapelas normal compone una HOJA con varias y se cortan a
 * mano. Una etiquetadora no tiene hoja: tiene un rollo y avanza una etiqueta
 * cada vez. Si el navegador manda una A4 con seis escarapelas, la TT460
 * imprime la primera y tira el resto, o parte la primera por la mitad.
 *
 * Por eso `@page` declara **el tamaño exacto de la etiqueta** y cada una lleva
 * un salto de página detrás. Así «6 escarapelas» son 6 páginas de 90×55 mm, que
 * es lo que la impresora entiende como 6 etiquetas.
 *
 * ── `margin: 0`, que no es un detalle ────────────────────────────────────
 *
 * El navegador mete un margen por defecto. Sobre una etiqueta de 55 mm de alto,
 * un margen de 10 mm deja el diseño a escala y descentrado, y el QR fuera de la
 * zona imprimible. El margen de verdad va dentro del diseño (`etiqueta.margen`),
 * donde se puede medir.
 *
 * ── Lo que el navegador NO puede garantizar ──────────────────────────────
 *
 * Que el driver no reescale. Casi todos ofrecen «ajustar al área imprimible», y
 * eso rompe la relación puntos↔módulos del QR: 3 puntos por módulo pasan a 2,7
 * y el lector empieza a fallar de vez en cuando, que es peor que fallar
 * siempre. Al imprimir hay que dejar la escala en 100 % y desmarcar el ajuste.
 *
 * Si el driver acaba dando problemas, la salida no es pelearse con él: es
 * generar el lenguaje de la impresora (TSPL o ZPL, según lo que hable la
 * TT460) y mandárselo por USB o por red. Eso ya no es diseño, es fontanería, y
 * hasta no probar en el aparato no se sabe si hace falta. */

export default function ImprimirEtiquetas({
  tickets = [], logoUrl = '', mostrarCodigo = true,
  /* Las medidas del rollo. El `@page` de abajo TIENE que coincidir con ellas:
     si el papel declarado y el dibujo no miden lo mismo, la impresora escala y
     el QR pierde la relación puntos↔módulos que lo hace legible. */
  etiqueta,
  /* Qué va dentro del QR de cada boleta. Lo decide la pieza —firma o código
     corto— y no este componente, que sólo maqueta. */
  qrDe,
}) {
  const E = etiqueta ? normalizarEtiqueta(etiqueta) : ETIQUETA_DEFECTO;
  return (
    <>
      <div className="etiquetas-print">
        {tickets.map(t => (
          <div key={t.id || t.codigo} className="etiqueta-hoja">
            <EtiquetaTermica
              etiqueta={E}
              ticket={t}
              qrValue={qrDe ? qrDe(t) : (t.qr_token || t.codigo)}
              logoUrl={logoUrl}
              mostrarCodigo={mostrarCodigo}
            />
          </div>
        ))}
      </div>

      <style>{`
        @media print {
          @page {
            size: ${E.ancho}mm ${E.alto}mm;
            margin: 0;
          }
          body * { visibility: hidden; }
          .etiquetas-print, .etiquetas-print * { visibility: visible; }
          .etiquetas-print { position: absolute; inset: 0; }
          .etiqueta-hoja {
            width: ${E.ancho}mm;
            height: ${E.alto}mm;
            /* Una por página: sin esto la impresora parte la segunda. */
            page-break-after: always;
            break-after: page;
            overflow: hidden;
          }
          .etiqueta-hoja:last-child { page-break-after: auto; break-after: auto; }
          /* El negro tiene que salir negro: sin esto Chrome «ahorra tinta» y
             baja el contraste del QR, que es justo lo que no se puede tocar. */
          .etiqueta-termica { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
      `}</style>
    </>
  );
}
