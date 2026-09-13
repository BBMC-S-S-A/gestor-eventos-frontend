import { useEffect, useRef, useState } from 'react';
import { descargarQrPng } from '../../lib/qrPng.jsx';
import { descargarTarjetaPng } from '../../lib/tarjetaPng.jsx';
import { walletConfig } from './WalletCard.jsx';
import { baseEnlaces } from '../../lib/enlacesPublicos.js';
import { Flotante, usePosicionFlotante } from '../ui/Flotante.jsx';

/* GESTEK — Llevarse la entrada.
 *
 * ── Una entrada, tres salidas ─────────────────────────────────────────────
 *
 * Lo que la persona tiene es UNA cosa: su entrada. Lo que cambia es cómo se la
 * lleva — en el móvil, en papel o en un archivo. No son tres productos, y
 * tratarlos como si lo fueran ya costó caro: el diseñador de escarapelas metía
 * en el QR la URL mientras la boleta digital metía el token firmado, así que
 * **la escarapela impresa no pasaba el control de ingreso**. Un papel con un QR
 * que no abría ninguna puerta (ver `lib/qrEscaneado.js`).
 *
 * Por eso las tres salidas se piden aquí, en un sitio: el `qrValue` que se
 * imprime es el mismo para las tres porque **sólo hay un sitio donde se
 * decide**.
 *
 * ── Por qué es un componente y no estaba escrito dos veces ────────────────
 *
 * Esto vivía dentro de la confirmación del registro (M6). `/mi-ticket` —la
 * página a la que vuelve el asistente el día del evento, que es donde más se
 * usa— se quedó con los tres botones sueltos de antes. Un mismo gesto escrito
 * dos veces con dos formas distintas: el arreglo de M6 no había llegado al
 * sitio donde más falta hacía. */

export const FORMATOS_ENTRADA = [
  { id: 'pdf',     titulo: 'Boleta en PDF',       pista: 'Para imprimir o guardar. Lleva el QR dentro.' },
  { id: 'tarjeta', titulo: 'Tarjeta (imagen)',    pista: 'Para la galería del móvil y enseñarla en la puerta.' },
  { id: 'qr',      titulo: 'Sólo el QR (imagen)', pista: 'Para reenviarlo por WhatsApp.' },
];

export default function DescargarEntrada({
  evento = {}, ticket = {}, qrValue,
  /* La confirmación del registro lo lleva relleno y `/mi-ticket` lo trae desde
     la boleta; se acepta suelto para no obligar a que las dos armen el mismo
     objeto de la misma forma. */
  respuestas = null, campos = null,
  className = '', etiqueta = 'Descargar',
}) {
  const [bajando, setBajando] = useState(false);
  const [bajandoTarjeta, setBajandoTarjeta] = useState(false);
  const [abierto, setAbierto] = useState(false);

  const ocupado = bajando || bajandoTarjeta;
  const ancla = useRef(null);
  const caja = useRef(null);
  const menu = useRef(null);

  /* El mismo diseño que la tarjeta en pantalla: la variante del organizador
     resuelta por público y por tipo de boleta. */
  const design = walletConfig(evento.page_json, {
    publico: 'asistentes',
    tipo: ticket.tipo?.nombre,
  });

  /* El PDF se pide aquí y no en un correo: el correo puede tardar, caer en spam
     o ni siquiera existir si el organizador no configuró remitente. Esto está
     en la mano de quien tiene la boleta, ahora.
     ── Y el generador se trae al pulsar, no al abrir la página ──────────────
     `jspdf` pesa. Importándolo arriba, entraba en el paquete que se descarga
     TODO el que abre la página de un evento —también quien sólo está mirando
     si va, y también el formulario metido en la web de un cliente— para una
     función que sólo se usa después de comprar y sólo si se pulsa. Con 7.000
     asistentes mirando desde el móvil, eso es tráfico regalado.
     El coste de traerlo ahora es una espera corta, y ya se está enseñando
     «Generando…» porque generar el PDF tampoco era instantáneo. */
  const descargarPdf = async () => {
    setBajando(true);
    try {
      const { descargarBoletaPdf } = await import('../../lib/boletaPdf.jsx');
      descargarBoletaPdf({
        evento, ticket, tipo: ticket.tipo, design,
        asistente: ticket.asistente,
        respuestas: respuestas ?? ticket.respuestas,
        campos: campos ?? evento.campos_formulario,
        qrValue, origen: baseEnlaces(evento),
      });
    } finally { setBajando(false); }
  };

  const descargarQr = () => {
    if (!descargarQrPng(qrValue, `qr-${ticket.codigo}`)) {
      /* Si el navegador no pudo dibujarlo, el PDF sigue estando: es mejor
         decirlo que dejar un botón que no responde. */
      alert('No se pudo generar la imagen del QR. Descargá la boleta en PDF, que lo lleva dentro.');
    }
  };

  /* La tarjeta entera como imagen, que es lo que se guarda en el móvil y se
     enseña en la puerta. Va aparte del QR suelto a propósito: el QR pelado es
     para reenviar por WhatsApp, la tarjeta es la entrada. */
  const descargarTarjeta = async () => {
    setBajandoTarjeta(true);
    try {
      /* El mismo `qrValue` que el PDF y el QR suelto: las tres salidas son la
         misma entrada, y aquí es donde se decide una sola vez. */
      const ok = await descargarTarjetaPng({ design, evento, ticket, qrValue }, `tarjeta-${ticket.codigo}`);
      if (!ok) alert('No se pudo generar la imagen de la tarjeta. Descargá la boleta en PDF, que lleva el QR dentro.');
    } finally { setBajandoTarjeta(false); }
  };

  const porFormato = { pdf: descargarPdf, tarjeta: descargarTarjeta, qr: descargarQr };

  /* El contenedor del modal recorta a sus hijos, así que el menú sale por
     portal en coordenadas de pantalla. Se descubrió con este mismo menú: la
     tercera opción quedaba fuera del recorte y no se podía pulsar. */
  const pos = usePosicionFlotante(abierto && !ocupado, ancla, { altoMax: 300 });

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e) => {
      if (menu.current?.contains(e.target) || caja.current?.contains(e.target)) return;
      setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  return (
    <div className="relative" ref={caja}>
      <button ref={ancla} type="button" onClick={() => setAbierto(v => !v)} disabled={ocupado}
        aria-expanded={abierto} aria-haspopup="menu"
        className={className || 'px-6 py-3 rounded-full border border-border-2 text-text-1 hover:bg-surface-2 text-sm font-semibold transition-all disabled:opacity-60 inline-flex items-center gap-2'}>
        {ocupado ? 'Generando…' : etiqueta}
        <span aria-hidden className="text-xs">▾</span>
      </button>
      {abierto && !ocupado && (
        <Flotante pos={pos} ancho="propio" role="menu" ref={menu}
          style={{ width: 260 }}
          className="rounded-2xl border border-border-2 bg-surface shadow-xl text-left">
          {FORMATOS_ENTRADA.map(f => (
            <button key={f.id} role="menuitem" type="button"
              onClick={() => { setAbierto(false); porFormato[f.id](); }}
              className="w-full px-4 py-3 hover:bg-surface-2 transition-colors block">
              <span className="block text-sm font-semibold text-text-1">{f.titulo}</span>
              <span className="block text-[11px] text-text-3 mt-0.5">{f.pista}</span>
            </button>
          ))}
        </Flotante>
      )}
    </div>
  );
}
