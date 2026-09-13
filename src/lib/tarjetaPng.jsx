import { qrPng } from './qrPng.jsx';
import { WALLET_DEFECTO } from './wallet.js';

/* La tarjeta de ingreso entera como PNG — no sólo el QR.
 *
 * ── Por qué se dibuja y no se fotografía el nodo ──────────────────────────
 *
 * Lo obvio sería coger la WalletCard que ya está en pantalla y pasarla por un
 * canvas (html2canvas y parecidos). Es la misma trampa que `qrPng.jsx` ya
 * documenta para el QR: rasterizar un nodo con CSS depende del navegador, y
 * Safari lo hace mal en cuanto hay degradados, `aspect-ratio` o fuentes de
 * sistema — sale movido, en blanco, o con el tamaño de la pantalla en vez del
 * que se pidió. Y aquí es peor que con el QR: esto es lo que el asistente
 * enseña en la puerta.
 *
 * Así que se dibuja a mano, a la resolución que se quiere. Lo que se descarga
 * es exactamente lo que se generó, en cualquier navegador.
 *
 * ── Qué NO lleva ──────────────────────────────────────────────────────────
 *
 * Los puntos. Una imagen guardada se queda congelada y los puntos cambian
 * durante el evento: alguien enseñaría en la puerta una tarjeta que dice 40
 * cuando lleva 300. Es la misma razón por la que la escarapela impresa
 * tampoco los lleva. El saldo vivo está en /mi-ticket, con este mismo QR.
 */

const RATIO = 16 / 10;

/* Carga una imagen para el canvas. Devuelve null si no se puede —un logo que
   no carga no puede dejar sin tarjeta a nadie— y va con `crossOrigin` porque
   si no, el canvas queda "manchado" y `toDataURL` lanza. */
function cargarImagen(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function rectRedondo(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y,     x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x,     y + h, rr);
  ctx.arcTo(x,     y + h, x,     y,     rr);
  ctx.arcTo(x,     y,     x + w, y,     rr);
  ctx.closePath();
}

/* El mismo reparto de colores que `fondo()` en WalletCard. Si allí cambia,
   aquí también: son la misma tarjeta en dos medios.

   Antes de la tarjeta se pinta un papel blanco opaco. Las esquinas redondeadas
   dejarían el canvas transparente ahí, y una imagen con transparencia que pasa
   por WhatsApp —que reconvierte a JPEG— sale con las esquinas NEGRAS. Medido:
   el píxel (0,0) daba alfa 0. Con el papel debajo, la tarjeta se lee igual en
   cualquier visor y sobrevive a la reconversión. */
function pintarFondo(ctx, d, W, H) {
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  if (d.estilo === 'oscuro') {
    ctx.fillStyle = '#0A0F1A';
  } else if (d.estilo === 'claro') {
    ctx.fillStyle = '#F4F6FB';
  } else if (d.estilo === 'neon') {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 1.2);
    g.addColorStop(0, d.color1);
    g.addColorStop(0.7, '#05070d');
    ctx.fillStyle = g;
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);   // 135deg
    g.addColorStop(0, d.color1);
    g.addColorStop(1, d.color2);
    ctx.fillStyle = g;
  }
  rectRedondo(ctx, 0, 0, W, H, W * 0.045);
  ctx.fill();
}

function recortar(ctx, texto, maxAncho) {
  if (ctx.measureText(texto).width <= maxAncho) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxAncho) t = t.slice(0, -1);
  return t + '…';
}

/* Dibuja la tarjeta y devuelve el data URL, o null si algo impidió generarla. */
/* `qrValue` manda sobre lo que traiga el ticket.
 *
 * Las tres salidas de una entrada —PDF, tarjeta y QR suelto— tienen que
 * imprimir EL MISMO código, y quien lo decide es `DescargarEntrada`, que las
 * pide las tres. El PDF y el QR suelto ya recibían ese valor; la tarjeta no, y
 * se lo sacaba del ticket por su cuenta. Hoy coinciden en todos los sitios que
 * la llaman, así que no se ve — pero el primero que pase un `qrValue` distinto
 * (una pieza configurada para imprimir el código corto en vez del token, por
 * ejemplo: `lib/piezasBranding.js`) se llevaría una tarjeta con un QR y un PDF
 * con otro, para la misma boleta. Que es justo lo que ese componente existe
 * para que no pase. */
export async function tarjetaPng({ design, evento = {}, ticket = {}, qrValue: qrPedido = null }, ancho = 1600) {
  const d = { ...WALLET_DEFECTO, ...(design || {}) };
  const W = ancho;
  const H = Math.round(ancho / RATIO);
  const P = Math.round(W * 0.055);            // el padding de p-6, a escala

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const claro = d.estilo === 'claro';
  const tinta = claro ? '#0A0F1A' : '#FFFFFF';
  const sub   = claro ? 'rgba(10,15,26,0.6)' : 'rgba(255,255,255,0.75)';
  const chip  = claro ? 'rgba(10,15,26,0.08)' : 'rgba(255,255,255,0.15)';

  const nombre = ticket.guest_nombre || ticket.nombre || 'Asistente';
  const tipo = ticket.tipo?.nombre || ticket.ticket_nombre
    || (typeof ticket.tipo === 'string' ? ticket.tipo : '') || 'General';
  const qrValue = qrPedido || ticket.qr_token || ticket.codigo || ticket.qr || '';
  const marca = evento.page_json?.branding?.plataforma || evento.organizador?.empresa
    || evento.titulo || 'GESTEK';

  pintarFondo(ctx, d, W, H);

  /* ── Cabecera ── */
  const logoLado = Math.round(W * 0.075);
  const logo = await cargarImagen(d.logo);
  if (logo) {
    ctx.save();
    rectRedondo(ctx, W - P - logoLado, P, logoLado, logoLado, logoLado * 0.28);
    ctx.clip();
    ctx.drawImage(logo, W - P - logoLado, P, logoLado, logoLado);
    ctx.restore();
  } else {
    ctx.fillStyle = chip;
    rectRedondo(ctx, W - P - logoLado, P, logoLado, logoLado, logoLado * 0.28);
    ctx.fill();
    ctx.fillStyle = tinta;
    ctx.font = `bold ${Math.round(logoLado * 0.45)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(marca.charAt(0).toUpperCase(), W - P - logoLado / 2, P + logoLado / 2);
  }

  const anchoCabecera = W - P * 2 - logoLado - P * 0.4;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = sub;
  ctx.font = `600 ${Math.round(W * 0.019)}px system-ui, sans-serif`;
  ctx.fillText(recortar(ctx, marca.toUpperCase(), anchoCabecera), P, P + Math.round(H * 0.01));

  ctx.fillStyle = tinta;
  ctx.font = `bold ${Math.round(W * 0.042)}px system-ui, sans-serif`;
  ctx.fillText(recortar(ctx, evento.titulo || 'Evento', anchoCabecera), P, P + Math.round(H * 0.055));

  /* ── QR abajo a la derecha ── */
  let qrLado = 0;
  if (d.mostrar_qr && qrValue) {
    const url = qrPng(qrValue, 512);
    if (url) {
      const img = await cargarImagen(url);
      if (img) {
        qrLado = Math.round(H * 0.36);
        const caja = qrLado + Math.round(W * 0.018) * 2;
        const cx = W - P - caja, cy = H - P - caja;
        ctx.fillStyle = '#FFFFFF';
        rectRedondo(ctx, cx, cy, caja, caja, caja * 0.14);
        ctx.fill();
        ctx.drawImage(img, cx + Math.round(W * 0.018), cy + Math.round(W * 0.018), qrLado, qrLado);
        qrLado = caja;
      }
    }
  }

  /* ── Titular y tipo, abajo a la izquierda ── */
  const anchoDatos = W - P * 2 - (qrLado ? qrLado + P * 0.5 : 0);
  const chipAlto = Math.round(H * 0.062);
  const baseChips = H - P - chipAlto;

  ctx.fillStyle = tinta;
  ctx.font = `600 ${Math.round(W * 0.032)}px system-ui, sans-serif`;
  ctx.textBaseline = 'bottom';
  ctx.fillText(recortar(ctx, nombre, anchoDatos), P, baseChips - Math.round(H * 0.028));

  ctx.fillStyle = sub;
  ctx.font = `600 ${Math.round(W * 0.019)}px system-ui, sans-serif`;
  ctx.fillText('TITULAR', P, baseChips - Math.round(H * 0.095));

  if (d.mostrar_tipo && tipo) {
    ctx.font = `bold ${Math.round(W * 0.019)}px system-ui, sans-serif`;
    const anchoTexto = ctx.measureText(tipo.toUpperCase()).width;
    const anchoChip = anchoTexto + Math.round(W * 0.028);
    ctx.fillStyle = chip;
    rectRedondo(ctx, P, baseChips, anchoChip, chipAlto, chipAlto * 0.32);
    ctx.fill();
    ctx.fillStyle = tinta;
    ctx.textBaseline = 'middle';
    ctx.fillText(tipo.toUpperCase(), P + Math.round(W * 0.014), baseChips + chipAlto / 2);
  }

  try { return canvas.toDataURL('image/png'); } catch { return null; }
}

/* Baja la tarjeta como archivo. Devuelve false si no se pudo generar, para que
   quien llama avise en vez de dejar un botón mudo — igual que descargarQrPng. */
export async function descargarTarjetaPng(datos, nombre = 'tarjeta', ancho = 1600) {
  const dataUrl = await tarjetaPng(datos, ancho);
  if (!dataUrl) return false;
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${String(nombre).replace(/[^\w.-]+/g, '-').slice(0, 60) || 'tarjeta'}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}
