import { qrPng } from './qrPng.jsx';
import {
  ETIQUETA_DEFECTO, ALTURAS_MM, PUNTOS_POR_MM, medidas, normalizarEtiqueta, correoDe, tamCodigoMm,
} from './etiquetaTermica.js';

/* La escarapela térmica, dibujada a mano en un <canvas> — igual que
 * `tarjetaPng.jsx` con la tarjeta de wallet, y por la misma razón.
 *
 * ── Por qué esto, y no `window.print()` en un caso más ────────────────────
 *
 * `ImprimirEtiquetas.jsx` ya imprime bien EN TEORÍA: declara un `@page` del
 * tamaño exacto de la etiqueta y pinta la escarapela con CSS. El problema no
 * es el diseño, es lo que hay entre el diseño y el papel: el driver de la
 * SAT TT460 (Seagull/BarTender) tiene su propio tamaño de página por
 * defecto, y si no coincide EXACTO con el `@page` del navegador, Chrome
 * reescala para encajar uno dentro del otro — a veces recortando, a veces
 * dejando aire, y siempre rompiendo la relación puntos↔módulo del QR que
 * `etiquetaTermica.js` calculó al milímetro. Medido en campo: la misma
 * escarapela que en pantalla se ve perfecta sale irreconocible de la
 * impresora, sin que el navegador avise de nada raro.
 *
 * Una imagen PNG generada a la resolución exacta de la impresora (203 dpi =
 * 8 px/mm, la misma constante `PUNTOS_POR_MM` de `etiquetaTermica.js`) le
 * quita al driver la posibilidad de reescalar: cada píxel del PNG es un
 * punto del cabezal. Lo que se ve en el PNG es, punto por punto, lo que sale
 * impreso — igual que un visor de fotos imprimiendo a tamaño real ya
 * demostró que funciona en esta misma impresora.
 *
 * ── Por qué no se rasteriza el nodo de `EtiquetaTermica.jsx` ───────────────
 *
 * Sería menos código: coger el `<div>` que ya está en pantalla y pasarlo por
 * html2canvas. Es la misma trampa que `qrPng.jsx` y `tarjetaPng.jsx` ya
 * evitan — rasterizar CSS depende del navegador y sale distinto según cuál
 * se use—, y aquí el fallo sería el mismo que estamos arreglando: una
 * rasterización que no coincide con lo que se pidió. Por eso se dibuja a
 * mano, con las mismas reglas de reparto de `medidas()`.
 */

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

/* Reparte `texto` en como mucho `maxLineas` líneas de `maxAnchoPx`, con el
 * `ctx.font` ya puesto. Si no cabe entero, la última línea se corta con
 * puntos suspensivos — el mismo efecto que el `-webkit-line-clamp` de
 * `EtiquetaTermica.jsx`, que el canvas no tiene de fábrica. */
function envolverTexto(ctx, texto, maxAnchoPx, maxLineas) {
  const original = String(texto || '').trim();
  if (!original) return [];

  const palabras = original.split(/\s+/);
  const lineas = [];
  let actual = '';
  let i = 0;

  while (i < palabras.length && lineas.length < maxLineas) {
    const palabra = palabras[i];
    const intento = actual ? `${actual} ${palabra}` : palabra;
    if (ctx.measureText(intento).width <= maxAnchoPx) {
      actual = intento;
      i += 1;
      continue;
    }
    if (actual) {
      lineas.push(actual);
      actual = '';
      continue;
    }
    /* Ni la palabra sola cabe: se corta por caracteres, y el resto de la
       palabra se procesa en la siguiente vuelta como si fuera nueva. */
    let parte = '';
    for (const c of palabra) {
      if (ctx.measureText(parte + c).width <= maxAnchoPx) parte += c;
      else break;
    }
    lineas.push(parte || palabra[0]);
    palabras[i] = palabra.slice((parte || palabra[0]).length);
    if (!palabras[i]) i += 1;
  }
  if (actual && lineas.length < maxLineas) {
    lineas.push(actual);
    i = palabras.length;
  }

  const quedaAlgo = i < palabras.length || Boolean(actual && lineas[lineas.length - 1] !== actual);
  if (lineas.length >= maxLineas && quedaAlgo) {
    let ultima = lineas[maxLineas - 1] || '';
    while (ultima.length > 1 && ctx.measureText(`${ultima}…`).width > maxAnchoPx) {
      ultima = ultima.slice(0, -1);
    }
    lineas[maxLineas - 1] = `${ultima}…`;
  }
  return lineas.slice(0, maxLineas);
}

/* Dibuja la escarapela y devuelve el data URL del PNG, a la resolución nativa
 * de la impresora (o más, con `escala`, para revisarla en pantalla sin que
 * se vea borrosa — nunca menos, porque por debajo de 1 se pierden puntos que
 * el cabezal sí puede imprimir).
 *
 * Devuelve `null` si el QR no cabe con estas medidas — la misma condición que
 * ya impide imprimir desde `EtiquetaTermica.jsx` — para que quien llama avise
 * en vez de descargar una etiqueta a medias. */
export async function etiquetaPng({
  etiqueta, ticket = {}, qrValue: qrPedido = null,
  logoUrl = '', mostrarCodigo = true,
}, escala = 1) {
  const E = etiqueta ? normalizarEtiqueta(etiqueta) : ETIQUETA_DEFECTO;
  const valor = qrPedido || ticket.qr_token || ticket.codigo || '';
  const m = medidas(valor, E);
  if (!m.cabe) return null;

  const pxPorMm = PUNTOS_POR_MM * Math.max(1, escala);
  const mm = (v) => Math.round(v * pxPorMm);

  const W = mm(E.ancho);
  const H = mm(E.alto);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  /* Papel blanco opaco, no transparente: es lo que hay debajo en la
     etiqueta real, y una imagen con transparencia se ve distinto según
     dónde se abra. */
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000';

  const margen = mm(E.margen);
  const gap = mm(1.5);
  const nombre = (ticket.asistente?.nombre || ticket.guest_nombre || '').trim();
  const correo = correoDe(ticket);

  if (E.formato_codigo === 'serial') {
    /* Nombre arriba, serial grande debajo, centrados — igual que el modo
       «serial» de `EtiquetaTermica.jsx`, para lo que no lleva QR (manillas). */
    const anchoUtil = W - margen * 2;
    const cx = W / 2;
    ctx.textAlign = 'center';

    let y = H * 0.38;
    if (nombre) {
      const tamNombre = mm(Math.min(ALTURAS_MM.nombre, Math.max(2.5, (E.alto - E.margen * 2) / 3)));
      ctx.font = `700 ${tamNombre}px Helvetica, Arial, sans-serif`;
      const [linea] = envolverTexto(ctx, nombre, anchoUtil, 1);
      ctx.fillText(linea || nombre, cx, y);
      y += tamNombre * 1.1;
    }
    const tamSerial = mm(Math.min(12, Math.max(3, (E.alto - E.margen * 2) / 2)));
    ctx.font = `700 ${tamSerial}px Courier, monospace`;
    ctx.fillText(ticket.codigo || '—', cx, y + tamSerial * 0.8);
  } else {
    const cajaPx = mm(m.caja_mm);
    const separacion = mm(E.separacion);
    const alLado = m.disposicion === 'lado';

    let qrX; let qrY; let textoX; let textoAnchoPx; let textoAltoPx; let textoY;
    if (alLado) {
      qrX = margen;
      qrY = margen + (H - margen * 2 - cajaPx) / 2;
      textoX = qrX + cajaPx + separacion;
      textoAnchoPx = W - margen - textoX;
      textoY = margen;
      textoAltoPx = H - margen * 2;
    } else {
      qrX = margen + (W - margen * 2 - cajaPx) / 2;
      qrY = margen;
      textoX = margen;
      textoAnchoPx = W - margen * 2;
      textoY = qrY + cajaPx + separacion;
      textoAltoPx = H - margen - textoY;
    }
    const textoAlineado = alLado ? 'left' : 'center';
    const tx = alLado ? textoX : textoX + textoAnchoPx / 2;

    /* El QR, centrado dentro de la caja que le reserva `medidas()` — puede
       ser más chica que la caja si el código no necesita todo el hueco
       pedido (ver el porqué en `etiquetaTermica.js`). */
    if (valor) {
      const ladoPx = mm(m.lado_mm);
      const qrDataUrl = qrPng(valor, Math.max(64, ladoPx));
      const qrImg = await cargarImagen(qrDataUrl);
      if (qrImg) {
        const offset = (cajaPx - ladoPx) / 2;
        ctx.drawImage(qrImg, qrX + offset, qrY + offset, ladoPx, ladoPx);
      }
    }

    /* El bloque de texto (logo + nombre + código + correo), centrado dentro
       del alto/ancho que le queda — el mismo `justify-content:center` que
       en pantalla. Se mide primero para saber cuánto ocupa entero. */
    const tamNombre = mm(ALTURAS_MM.nombre);
    ctx.font = `800 ${tamNombre}px Helvetica, Arial, sans-serif`;
    const lineasNombre = envolverTexto(ctx, nombre || 'Sin nombre', textoAnchoPx, 2);

    const codigo = mostrarCodigo ? (ticket.codigo || '') : '';
    const tamCodigo = codigo ? mm(tamCodigoMm(codigo, textoAnchoPx / pxPorMm)) : 0;

    const tamCorreo = mm(ALTURAS_MM.correo);
    ctx.font = `400 ${tamCorreo}px Helvetica, Arial, sans-serif`;
    const lineasCorreo = correo ? envolverTexto(ctx, correo, textoAnchoPx, 2) : [];

    const logo = logoUrl ? await cargarImagen(logoUrl) : null;
    const ladoLogo = logo ? mm(5) : 0;

    const altoBloque = (ladoLogo ? ladoLogo + gap : 0)
      + lineasNombre.length * tamNombre * 1.05 + gap
      + (codigo ? tamCodigo + gap : 0)
      + lineasCorreo.length * tamCorreo * 1.15;

    let y = textoY + Math.max(0, (textoAltoPx - altoBloque) / 2);

    if (logo) {
      const anchoLogo = ladoLogo * ((logo.width / logo.height) || 1);
      const lx = alLado ? textoX : tx - anchoLogo / 2;
      ctx.save();
      /* `grayscale(1) contrast(3)`: lo mismo que en pantalla — un logo a
         color se convierte en silueta, que es lo único que sobrevive a un
         bit. `ctx.filter` no existe en navegadores muy viejos; si falla,
         se dibuja el logo tal cual en vez de romper la etiqueta entera. */
      try { ctx.filter = 'grayscale(1) contrast(3)'; } catch { /* noop */ }
      ctx.drawImage(logo, lx, y, anchoLogo, ladoLogo);
      ctx.restore();
      y += ladoLogo + gap;
    }

    ctx.textAlign = textoAlineado;
    ctx.font = `800 ${tamNombre}px Helvetica, Arial, sans-serif`;
    for (const linea of lineasNombre) {
      y += tamNombre * 0.85;
      ctx.fillText(linea, tx, y);
      y += tamNombre * 0.2;
    }
    y += gap;

    if (codigo) {
      ctx.font = `700 ${tamCodigo}px Courier, monospace`;
      y += tamCodigo * 0.85;
      ctx.fillText(codigo, tx, y);
      y += tamCodigo * 0.15 + gap;
    }

    if (lineasCorreo.length) {
      ctx.font = `400 ${tamCorreo}px Helvetica, Arial, sans-serif`;
      for (const linea of lineasCorreo) {
        y += tamCorreo * 0.9;
        ctx.fillText(linea, tx, y);
        y += tamCorreo * 0.25;
      }
    }
  }

  try { return canvas.toDataURL('image/png'); } catch { return null; }
}

/* Baja la escarapela como archivo PNG. Devuelve `false` si no se pudo
   generar (QR que no cabe, o el navegador no dio el canvas), para que quien
   llama avise en vez de dejar un botón que no hace nada. */
export async function descargarEtiquetaPng(datos, nombre = 'etiqueta', escala = 1) {
  const dataUrl = await etiquetaPng(datos, escala);
  if (!dataUrl) return false;
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${String(nombre).replace(/[^\w.-]+/g, '-').slice(0, 60) || 'etiqueta'}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

/* Manda una tanda de escarapelas a imprimir como imágenes en vez de como
 * HTML — ver el porqué arriba. Genera un PNG por boleta y abre una ventana
 * con un `<img>` por página, cada una a su `@page` del tamaño exacto de la
 * etiqueta: lo único que el driver tiene que hacer es poner cada punto del
 * PNG en el papel, sin decidir ninguna escala por su cuenta.
 *
 * Devuelve cuántas boletas SÍ se pudieron generar, para que quien llama avise
 * si alguna se quedó fuera (el QR no cabía). */
export async function imprimirComoPng({
  etiqueta, tickets = [], qrDe, logoUrl = '', mostrarCodigo = true,
}) {
  const pngs = [];
  for (const t of tickets) {
    // eslint-disable-next-line no-await-in-loop -- cada canvas se libera antes del siguiente; en paralelo se dispara media impresión de tarjetas a la vez.
    const png = await etiquetaPng({
      etiqueta, ticket: t, logoUrl, mostrarCodigo,
      qrValue: qrDe ? qrDe(t) : (t.qr_token || t.codigo),
    });
    if (png) pngs.push(png);
  }
  if (pngs.length === 0) return 0;

  const E = etiqueta ? normalizarEtiqueta(etiqueta) : ETIQUETA_DEFECTO;
  const ventana = window.open('', '_blank', 'width=400,height=600');
  if (!ventana) return 0; // El navegador bloqueó el popup: nada que hacer sin permiso del usuario.

  const paginas = pngs.map((src) => `<img src="${src}" />`).join('\n');
  ventana.document.write(`<!doctype html><html><head><title>Imprimir escarapelas</title><style>
    @page { size: ${E.ancho}mm ${E.alto}mm; margin: 0; }
    html, body { margin: 0; padding: 0; }
    img {
      display: block;
      width: ${E.ancho}mm;
      height: ${E.alto}mm;
      page-break-after: always;
      break-after: page;
    }
    img:last-child { page-break-after: auto; break-after: auto; }
  </style></head><body>${paginas}</body></html>`);
  ventana.document.close();

  await new Promise((resolve) => {
    ventana.onload = resolve;
    setTimeout(resolve, 800); // Si `onload` no llega (algún navegador con `document.write`), no se queda colgado.
  });
  ventana.focus();
  ventana.print();
  return pngs.length;
}
