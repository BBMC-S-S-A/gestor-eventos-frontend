import { normalizarEtiqueta, medidas } from './etiquetaTermica.js';

/* Las piezas que un evento imprime: escarapelas, manillas, tarjetas.
 *
 * ── Por qué es un catálogo y no una medida ────────────────────────────────
 *
 * Esto empezó siendo un número escrito en el código —100 × 50, porque ese era el
 * rollo que teníamos delante—. Luego pasó a ser configurable por evento, que ya
 * era mejor. Pero seguía dando por hecho que **un evento imprime una cosa**, y
 * no es verdad: el mismo evento saca escarapelas para el staff, manillas para
 * los tres días y tarjetas para los patrocinadores, y cada una es otro tamaño,
 * otro rollo y otro contenido.
 *
 * Así que el catálogo es de la plataforma —los tipos que existen y lo que se
 * sabe de cada uno— y las piezas son del evento: cada organizador arma las
 * suyas, partiendo de un tipo o desde cero.
 *
 * ── Lo que el catálogo aporta y una lista de medidas no ──────────────────
 *
 * Las medidas son la parte fácil. Lo que cambia de una pieza a otra es **qué
 * cabe dentro**, y eso es lo que hay que saber antes de comprar el rollo:
 *
 * · En una escarapela cabe el QR del token firmado y el nombre grande.
 * · En una manilla **no cabe ese QR**, y no es cuestión de diseño (ver abajo).
 * · En una tarjeta cabe todo, pero se lee de cerca: el nombre no necesita 6 mm.
 *
 * Por eso cada tipo trae su nota. Es lo que evita descubrirlo con mil manillas
 * ya impresas.
 */

/* ── El QR: qué lleva dentro ───────────────────────────────────────────────
 *
 * Dos opciones, y la diferencia importa:
 *
 * · **`token`** — la firma. Es lo que el control de ingreso valida sin dudar, y
 *   ocupa 27,4 mm de lado como mínimo absoluto. Es el que va en todo lo que
 *   tenga sitio.
 * · **`codigo`** — los 8 caracteres del código corto. Ocupa unos 9 mm, así que
 *   cabe donde el otro no. A cambio es **adivinable**: 8 caracteres sobre 32
 *   símbolos son ~1,1 billones de combinaciones, así que nadie lo acierta en una
 *   puerta, pero alguien que pruebe en bloque contra la API sí podría — eso se
 *   tapa con límite de intentos, no con el papel.
 *
 * El servidor acepta los dos, así que la elección no rompe nada: cambia lo que
 * hay que proteger por otro lado.
 */
export const CONTENIDOS_QR = [
  { id: 'token',  label: 'Firma completa', pista: 'Lo más seguro. Necesita al menos 28 mm de alto libre.' },
  { id: 'codigo', label: 'Código corto',   pista: 'Cabe en casi nada. Es adivinable en bloque: conviene sólo donde el otro no entra.' },
  /* El mismo papel, dos usos: el escáner del evento saca el código de la URL y
     abre la puerta (`lib/qrEscaneado.js`), y la cámara de otro asistente abre
     la tarjeta de contacto de esa persona. La tarjeta sólo enseña lo que ella
     escribió y encendió a propósito — nunca las respuestas del registro. */
  { id: 'contacto', label: 'Enlace de contacto', pista: 'Sirve en la puerta Y para presentarse: quien lo escanea con el móvil ve la tarjeta de contacto de esa persona, si ella la encendió.' },
];

/* ── Cómo se imprime ese dato ──────────────────────────────────────────────
 *
 * · **`qr`** — el cuadrado. Se escanea de lejos y en cualquier orientación, pero
 *   necesita alto: 28 mm con la firma, 9 con el código corto.
 * · **`serial`** — el código escrito, grande y monoespaciado. No se escanea: se
 *   lee y se teclea. Es lo único que cabe entero en una manilla, y tiene una
 *   ventaja que el QR no tiene —se lee aunque la manilla esté doblada, mojada o
 *   rayada, que es lo que le pasa a una manilla después de tres días—.
 *
 * Un código de barras (Code 128) sería lo ideal para una manilla —la forma
 * encaja: largo y bajo— y el escáner de la puerta **ya lo leería**, porque
 * `html5-qrcode` acepta ese formato y la cámara no está limitada a QR. No está
 * aquí todavía por una razón concreta: generar Code 128 exige una tabla de 107
 * patrones, y un patrón mal copiado produce un código que **parece bien y no
 * lee**. Eso hay que comprobarlo contra un lector de verdad antes de meterlo, no
 * después de imprimir dos mil manillas. */
export const FORMATOS_CODIGO = [
  { id: 'qr',     label: 'QR',     pista: 'Se escanea con la cámara. Necesita alto.' },
  { id: 'serial', label: 'Serial', pista: 'El código escrito, para leer y teclear. Cabe donde el QR no, y aguanta el roce.' },
];

/* Los tipos que conoce la plataforma. Un evento puede partir de uno y cambiarle
   lo que quiera; lo que no puede es inventarse el ancho de un rollo que no
   existe, y por eso cada uno trae medidas reales de material que se compra. */
export const TIPOS_PIEZA = [
  {
    id: 'escarapela',
    nombre: 'Escarapela',
    pista: 'La de colgar del cuello. Es la que se lee de lejos.',
    medidas: { ancho: 100, alto: 50, margen: 3, qr_objetivo: 40, disposicion: 'auto' },
    qr_contenido: 'token',
  },
  {
    id: 'tarjeta',
    nombre: 'Tarjeta',
    pista: 'Tamaño de tarjeta bancaria (ISO 7810). Entra en cualquier portatarjetas.',
    medidas: { ancho: 85.6, alto: 54, margen: 3, qr_objetivo: 38, disposicion: 'auto' },
    qr_contenido: 'token',
  },
  {
    id: 'manilla',
    nombre: 'Manilla',
    pista: 'Para los días completos. Ojo: el QR firmado NO cabe — ver el aviso al elegirla.',
    /* 210 y no 250, que es lo que decía antes.
       `LIMITES.ancho.max` son 210 mm, así que `normalizarEtiqueta` recortaba
       toda manilla a 210 en silencio: el catálogo prometía una medida que
       ninguna pieza llegaba a tener nunca. Se veía «Manilla 250×25» en la
       lista de tipos y salía una de 210.
       Si las manillas de verdad miden 250, lo que hay que subir es el LÍMITE
       —y comprobar antes que la impresora acepta ese ancho—, no volver a
       declarar aquí un número que se recorta al guardarse. */
    medidas: { ancho: 210, alto: 25, margen: 2, qr_objetivo: 20, disposicion: 'lado' },
    /* Aquí no es una preferencia: con 25 mm de alto y márgenes, el QR firmado no
       entra ni a tres puntos por módulo. La manilla se imprime con el serial. */
    qr_contenido: 'codigo',
    formato_codigo: 'serial',
  },
  {
    id: 'mini',
    nombre: 'Etiqueta pequeña',
    pista: 'Para marcar cosas: equipaje, sillas, cajas.',
    medidas: { ancho: 70, alto: 40, margen: 2, qr_objetivo: 30, disposicion: 'auto' },
    qr_contenido: 'token',
  },
  {
    id: 'colgante',
    nombre: 'Colgante grande',
    pista: 'Vertical, para prensa y staff. El nombre se lee a varios metros.',
    medidas: { ancho: 100, alto: 150, margen: 5, qr_objetivo: 60, disposicion: 'debajo' },
    qr_contenido: 'token',
  },
];

export const tipoPieza = (id) => TIPOS_PIEZA.find(t => t.id === id) || TIPOS_PIEZA[0];

let contador = 0;
const nuevoId = () => `pz_${Date.now().toString(36)}_${++contador}`;

/* Una pieza, puesta en forma. Las medidas pasan por el mismo acotado que ya
   existía —topes y punto entero de 203 dpi—, así que una pieza no puede tener
   medidas que la impresora no sepa imprimir. */
export function normalizarPieza(p) {
  const base = p && typeof p === 'object' ? p : {};
  const tipo = tipoPieza(base.tipo);
  return {
    id: base.id || nuevoId(),
    tipo: tipo.id,
    nombre: String(base.nombre || tipo.nombre).slice(0, 60),
    qr_contenido: CONTENIDOS_QR.some(c => c.id === base.qr_contenido) ? base.qr_contenido : tipo.qr_contenido,
    formato_codigo: FORMATOS_CODIGO.some(f => f.id === base.formato_codigo)
      ? base.formato_codigo
      : (tipo.formato_codigo || 'qr'),
    ...normalizarEtiqueta({ ...tipo.medidas, ...base }),
  };
}

/* `existentes` sirve para NO repetir el nombre.
 *
 * Añadir dos escarapelas dejaba dos fichas llamadas «Escarapela», con las
 * mismas medidas al lado: en pantalla eran indistinguibles, y elegir la
 * equivocada sólo se descubre al imprimir el rollo. La segunda pasa a llamarse
 * «Escarapela 2». Es un nombre editable, así que esto sólo tiene que ser
 * distinto — no tiene que ser bonito. */
export function piezaDesdeTipo(id, existentes = []) {
  const t = tipoPieza(id);
  const usados = new Set((existentes || []).map(x => String(x?.nombre || '').trim()));
  let nombre = t.nombre;
  for (let n = 2; usados.has(nombre); n++) nombre = `${t.nombre} ${n}`;
  return normalizarPieza({
    tipo: t.id, nombre,
    qr_contenido: t.qr_contenido, formato_codigo: t.formato_codigo,
    ...t.medidas,
  });
}

/* Las piezas de un evento. Si no ha armado ninguna, se le da la escarapela: es
   lo que imprime todo el mundo, y arrancar con una lista vacía obliga a decidir
   antes de ver nada. */
export function piezasDelEvento(evento) {
  const guardadas = evento?.page_json?.piezas;
  if (Array.isArray(guardadas) && guardadas.length) return guardadas.map(normalizarPieza);
  return [piezaDesdeTipo('escarapela')];
}

/* El QR de una boleta para una pieza concreta.
 *
 * Se cae al código corto si no hay token, que es lo que ya hacía antes: un
 * papel sin QR no sirve para nada, y el servidor acepta los dos. */
export function valorQr(pieza, ticket = {}, origen = null) {
  if (pieza?.qr_contenido === 'codigo') return ticket.codigo || ticket.qr_token || '';
  if (pieza?.qr_contenido === 'contacto' && ticket.codigo) {
    const base = origen || (typeof window !== 'undefined' ? window.location.origin : '');
    return `${base}/p/${ticket.codigo}`;
  }
  return ticket.qr_token || ticket.codigo || '';
}

/* Si esta pieza puede imprimirse tal como está, y si no, qué hay que cambiar.
 *
 * Se comprueba contra un token REAL de 253 caracteres —no contra el código
 * corto— cuando la pieza lleva firma, porque es el caso que decide. */
export function revisarPieza(pieza, muestra = 'x'.repeat(253)) {
  const p = normalizarPieza(pieza);

  /* Sin QR no hay nada que medir: el serial es texto y cabe siempre. Se
     devuelve una medida «todo el ancho para el texto» en vez de un cálculo de
     módulos que no significaría nada. */
  if (p.formato_codigo === 'serial') {
    const anchoUtil = p.ancho - p.margen * 2;
    const altoUtil = p.alto - p.margen * 2;
    return {
      cabe: true, pieza: p, arreglo: null, disposicion: 'debajo',
      caja_mm: 0, lado_mm: 0, texto_mm: anchoUtil, texto_alto_mm: altoUtil,
      nombre_cabe: altoUtil >= 7,
      aviso: altoUtil >= 7 ? null
        : `Con ${altoUtil.toFixed(0)} mm de alto no cabe el nombre encima del serial.`,
    };
  }

  /* Con qué se mide si cabe. El enlace de contacto es una URL de verdad —el
     dominio del panel más el código—, y medirlo con el código corto diría que
     cabe en piezas donde no entra. */
  const valor = p.qr_contenido === 'codigo'
    ? 'ABCD2345'
    : p.qr_contenido === 'contacto'
      ? `${typeof window !== 'undefined' ? window.location.origin : 'https://gestekeventost.dpdns.org'}/p/ABCD2345`
      : muestra;
  const m = medidas(valor, p);

  /* El caso que hay que explicar y no sólo marcar en rojo: la manilla. Decir
     «no cabe» sin decir que hay salida deja a alguien creyendo que las manillas
     no se pueden usar. */
  const arreglo = (!m.cabe && p.qr_contenido === 'token')
    ? 'Con la firma completa no entra. Cambia el QR a «código corto» —cabe en 9 mm— o usa una pieza más alta.'
    : null;

  return { ...m, pieza: p, arreglo };
}
