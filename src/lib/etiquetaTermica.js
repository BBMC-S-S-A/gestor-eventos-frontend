/* La escarapela impresa en la etiquetadora térmica (SAT TT460).
 *
 * Esto NO es el diseñador de escarapelas que ya existe. Aquél compone una HOJA
 * con varias escarapelas para cortar a mano, en una impresora normal. La TT460
 * saca **una etiqueta a la vez**, a tamaño exacto, desde un rollo. Son dos
 * medios distintos y el mismo diseño no vale para los dos.
 *
 * ── Lo que cambia el diseño, y no es una cuestión de gusto ────────────────
 *
 * **1 · No hay colores. No hay ni grises.** La transferencia térmica es de un
 * bit: cada punto se imprime o no se imprime, con la tinta de la cinta que esté
 * cargada. Un gris sólo se puede fingir con trama, y a 203 dpi una trama se ve
 * sucia. Así que el color por tipo de asistente —lo único configurable de la
 * escarapela original— **no se puede imprimir aquí**.
 *
 * Se sustituye por algo que sí sobrevive en un bit: el tipo en un recuadro con
 * borde, y para el tipo que se quiera destacar, el recuadro invertido (relleno
 * con el texto en blanco). Si de verdad hacen falta dos colores, la salida es
 * operativa y no de diseño: cargar una cinta dorada e imprimir los VIP en una
 * tanda aparte.
 *
 * **2 · Los rellenos grandes se evitan.** Una banda negra a lo ancho gasta
 * cinta, calienta el cabezal —que baja la velocidad real— y se corre si la
 * escarapela roza. Por eso el recuadro invertido es pequeño y el resto va en
 * línea fina.
 *
 * **3 · Todo cae en puntos enteros.** 203 dpi son exactamente 8 puntos por
 * milímetro. Una medida de 3,3 mm son 26,4 puntos: el cabezal la redondea y el
 * borde queda con un diente. Todas las medidas de aquí abajo son múltiplos de
 * 0,125 mm.
 *
 * ── El tamaño, y por qué éste ────────────────────────────────────────────
 *
 * **90 × 55 mm**, que es el `9x5` que el diseñador de escarapelas ya trae por
 * defecto. No es una medida inventada: si ya se compraron portagafetes para
 * ese tamaño, la etiqueta entra en ellos. Cambiarlo obligaría a comprar otros.
 *
 * A 203 dpi son 720 × 440 puntos.
 *
 * ── El QR, que es quien manda ────────────────────────────────────────────
 *
 * Lleva el token firmado, no el código corto: el código son 8 caracteres sobre
 * 32 símbolos —unos 40 bits— y se puede adivinar. El token va firmado.
 *
 * Ese token son ~253 caracteres, que en modo byte con corrección M no caben por
 * debajo de la **versión 12: 65 × 65 módulos**. Con el margen obligatorio de 4
 * módulos por lado son 73. A 3 puntos por módulo:
 *
 *     73 módulos × 3 puntos = 219 puntos ÷ 8 = 27,375 mm
 *
 * Tres puntos por módulo es el mínimo con el que un lector barato acierta a la
 * primera. Con dos se lee en el móvil bueno y falla en la puerta, que es donde
 * importa.
 *
 * **Si el token creciera**, la versión sube y el QR con ella. Por eso
 * `medidas()` lo calcula en vez de dejarlo fijo: el día que el token pase de
 * 287 caracteres, el cuadrado crece solo y se avisa si ya no cabe. */

/* 203 dpi exactos. */
export const PUNTOS_POR_MM = 8;

/* Capacidad en modo byte por versión, corrección M.
 *
 * Empezaba en la 8 «porque por debajo no cabe un token», y era cierto mientras
 * lo único que se imprimía fuera el token. En cuanto una pieza lleva el **código
 * corto** —8 caracteres, que es lo único que cabe en una manilla— la tabla
 * mandaba ese código a la versión 8: 81 módulos para 8 caracteres, un QR cuatro
 * veces más grande de lo necesario, y por eso «no cabía» en la manilla.
 *
 * Un límite puesto por una suposición que dejó de ser cierta. Ahora están las
 * dieciséis: las de la 8 en adelante se midieron contra `qrcode.react`, las de
 * abajo son las de la norma. */
const CAPACIDAD_M = [
  [1, 14], [2, 26], [3, 42], [4, 62], [5, 84], [6, 106], [7, 122],
  [8, 152], [9, 182], [10, 213], [11, 251], [12, 287],
  [13, 331], [14, 362], [15, 412], [16, 450],
];

const MODULOS = (version) => version * 4 + 17;
const QUIET = 4;                 // margen obligatorio, en módulos

/* El mínimo con el que un lector barato acierta a la primera. Con dos puntos
   por módulo se lee en un móvil bueno y falla en la puerta, que es donde
   importa. Es un SUELO, no el valor: si cabe más, se usa más. */
const PUNTOS_POR_MODULO_MIN = 3;

/* La etiqueta, en milímetros. Todo múltiplo de 0,125 para caer en punto entero.
 *
 * ── De dónde salen estas medidas ─────────────────────────────────────────
 *
 * Del rollo real, dicho por quien lo tiene delante el 2026-09-03:
 * «10 cm × 5 cm, la idea es que el QR salga de 4×4 centrado». Antes esto decía
 * 90 × 55 porque era el tamaño por defecto del diseñador de escarapelas — una
 * medida razonable inventada, que es exactamente lo que había que sustituir por
 * una medida real. */
export const ETIQUETA_DEFECTO = {
  ancho: 100,
  alto: 50,
  margen: 3,
  /* El hueco entre el QR y el texto. Menos de 2 mm y el lector se come parte
     del nombre como si fuera código. */
  separacion: 3,
  /* Lo pedido: un cuadrado de 4 cm. Es un OBJETIVO y no una imposición —ver
     `medidas()`—, porque forzar el milímetro exacto rompe algo peor. */
  qr_objetivo: 40,
  /* 'lado' | 'debajo' | 'auto'. Ver `disposicionQueCabe()`. */
  disposicion: 'auto',
};

/* Compatibilidad: había código leyendo `ETIQUETA` directamente. Sigue siendo el
   valor por defecto, que es lo que esos sitios querían decir. */
export const ETIQUETA = ETIQUETA_DEFECTO;

/* ── Los topes, y por qué son éstos ────────────────────────────────────────
 *
 * No son gustos: salen del aparato y del ojo.
 *
 * · **Mínimo 25 mm de ancho o alto.** Por debajo no cabe ni el QR más pequeño
 *   que este token puede tener, y la etiqueta sería un adorno.
 * · **Máximo 210 mm.** Es el ancho de un A4: por encima ya no es una etiquetadora.
 * · **El margen entre 0 y 10.** A cero se imprime hasta el borde y el corte del
 *   rollo se come parte del QR; más de 10 en una etiqueta de 50 no deja nada.
 */
export const LIMITES = {
  ancho:  { min: 25, max: 210 },
  alto:   { min: 25, max: 210 },
  margen: { min: 0,  max: 10 },
  qr:     { min: 15, max: 200 },
};

const acotar = (v, { min, max }, porDefecto) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(max, Math.max(min, n));
};

/* Lo que el organizador guardó, puesto en forma y dentro de los topes.
 *
 * Todo se redondea a 0,125 mm —un punto a 203 dpi— porque una medida que no cae
 * en punto entero la redondea el cabezal por su cuenta, y entonces lo impreso no
 * es lo que se midió. */
export function normalizarEtiqueta(cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const aPunto = (mm) => Math.round(mm * PUNTOS_POR_MM) / PUNTOS_POR_MM;

  const ancho = aPunto(acotar(c.ancho, LIMITES.ancho, ETIQUETA_DEFECTO.ancho));
  const alto  = aPunto(acotar(c.alto,  LIMITES.alto,  ETIQUETA_DEFECTO.alto));
  /* El margen no puede comerse la etiqueta: se acota también contra el lado
     corto, o una etiqueta de 25 mm con margen 10 se quedaría sin nada dentro. */
  const margenMax = Math.max(0, Math.min(LIMITES.margen.max, Math.min(ancho, alto) / 4));
  const margen = aPunto(acotar(c.margen, { min: LIMITES.margen.min, max: margenMax }, Math.min(ETIQUETA_DEFECTO.margen, margenMax)));

  return {
    ancho,
    alto,
    margen,
    separacion: aPunto(acotar(c.separacion, { min: 1, max: 10 }, ETIQUETA_DEFECTO.separacion)),
    qr_objetivo: aPunto(acotar(c.qr_objetivo, LIMITES.qr, ETIQUETA_DEFECTO.qr_objetivo)),
    disposicion: ['lado', 'debajo', 'auto'].includes(c.disposicion) ? c.disposicion : 'auto',
  };
}

export function versionParaToken(largo) {
  const fila = CAPACIDAD_M.find(([, cap]) => largo <= cap);
  return fila ? fila[0] : null;
}

/* Cuánto ocupa el QR de un token concreto, y si la etiqueta le da. */
export function medidas(token = '', etiqueta) {
  const E = etiqueta ? normalizarEtiqueta(etiqueta) : ETIQUETA_DEFECTO;
  const largo = String(token || '').length;
  const version = versionParaToken(largo);

  if (!version) {
    return {
      cabe: false,
      motivo: `El token tiene ${largo} caracteres y no cabe en un QR que quepa en la etiqueta.`,
    };
  }

  const modulos = MODULOS(version) + QUIET * 2;
  const alturaUtil = E.alto - E.margen * 2;
  const anchoUtil  = E.ancho - E.margen * 2;

  /* ── Por qué el QR no mide 40,0 mm exactos ─────────────────────────────
   *
   * Se pidió 4×4 cm. 40 mm son 320 puntos, y este token ocupa 73 módulos: eso
   * da 4,38 puntos por módulo. Un módulo que no cae en punto entero lo redondea
   * el cabezal por su cuenta, unos sí y otros no, y el borde del código sale
   * con diente — que es justo lo que hace que un lector barato dude.
   *
   * Así que se toma el mayor entero que quepa en los 40 mm: **4 puntos por
   * módulo**, 36,5 mm de lado. Y el QR se centra dentro de un cuadrado blanco
   * de 40 mm, así que **el hueco que ocupa en la etiqueta sí es el pedido** y
   * lo que cambia es que el código de dentro está impreso limpio.
   *
   * De paso mejora: veníamos de 3 puntos por módulo. Cada punto más es un
   * lector menos que duda con la escarapela doblada.
   */
  const objetivo = Math.min(E.qr_objetivo || alturaUtil, alturaUtil, anchoUtil);
  const cabenEnObjetivo = Math.floor((objetivo * PUNTOS_POR_MM) / modulos);
  const porModulo = Math.max(PUNTOS_POR_MODULO_MIN, cabenEnObjetivo);

  const puntos = modulos * porModulo;
  const mm = puntos / PUNTOS_POR_MM;

  /* El cuadrado que el QR ocupa: lo pedido, salvo que el código no quepa dentro
     y haya que dejarle más, o que la etiqueta no dé para tanto. */
  const caja = Math.min(alturaUtil, anchoUtil, Math.max(mm, objetivo));

  /* ── Cómo se reparte el espacio, que es la decisión de verdad ──────────
   *
   * Con el QR al LADO, al texto le queda el ancho que sobra. Con el QR ARRIBA,
   * le queda el alto que sobra. Y son dos cosas muy distintas:
   *
   * · Un nombre de dos apellidos necesita **unos 35 mm de ancho** para caber en
   *   dos líneas a 6 mm de altura. Con menos, se corta.
   * · Y necesita **al menos 7 mm de alto** para una línea de 6 mm con su
   *   interlineado. Con menos, no cabe ni una.
   *
   * Por eso «auto» no elige por gusto: pone el QR al lado mientras al texto le
   * queden esos 35 mm, y lo sube arriba cuando no. En una etiqueta estrecha y
   * alta —60 × 90, por ejemplo— al lado no cabría nada y debajo sí. */
  const anchoSiLado   = anchoUtil - caja - E.separacion;
  const altoSiDebajo  = alturaUtil - caja - E.separacion;

  const ANCHO_MINIMO_TEXTO = 35;
  const ALTO_MINIMO_TEXTO  = 7;

  const disposicion = E.disposicion !== 'auto'
    ? E.disposicion
    : (anchoSiLado >= ANCHO_MINIMO_TEXTO ? 'lado' : 'debajo');

  const textoAncho = disposicion === 'lado' ? anchoSiLado : anchoUtil;
  const textoAlto  = disposicion === 'lado' ? alturaUtil  : altoSiDebajo;

  /* Que el QR quepa es una cosa; que el nombre se lea es otra, y la segunda se
     rompe mucho antes. Un aviso vale más que una etiqueta impresa a ciegas. */
  const nombreCabe = textoAncho >= 20 && textoAlto >= ALTO_MINIMO_TEXTO;

  return {
    cabe: mm <= alturaUtil && mm <= anchoUtil,
    version,
    modulos: MODULOS(version),
    lado_mm: mm,
    lado_puntos: puntos,
    puntos_por_modulo: porModulo,
    /* Lo que la caja del QR ocupa, que es lo que hay que reservar al maquetar. */
    caja_mm: caja,
    disposicion,
    /* Lo que queda para el nombre y lo demás. */
    texto_mm: textoAncho,
    texto_alto_mm: textoAlto,
    nombre_cabe: nombreCabe,
    aviso: !nombreCabe && mm <= alturaUtil
      ? `Con esta medida al nombre le quedan ${textoAncho.toFixed(0)} × ${textoAlto.toFixed(0)} mm: no se va a leer de lejos. Haz el QR más pequeño o la etiqueta más grande.`
      : null,
    motivo: (mm <= alturaUtil && mm <= anchoUtil)
      ? null
      : `El QR necesita ${mm.toFixed(1)} mm de lado y en la etiqueta caben ${Math.min(alturaUtil, anchoUtil)} mm.`,
  };
}

/* Tamaños de letra, en milímetros de altura de mayúscula.
 *
 * No se usan puntos tipográficos a propósito: lo que decide si un nombre se lee
 * desde el otro lado de la mesa es su altura física, y a 203 dpi por debajo de
 * 2 mm las letras empiezan a rellenarse y una «e» se convierte en un borrón. */
export const ALTURAS_MM = {
  nombre: 6,      // se lee de pie, a metro y medio
  /* El código se teclea en la puerta cuando el QR no lee, y se pidió de 6 mm
     como mínimo. A ese tamaño ya no cabe bajo el QR: va en la columna de texto,
     debajo del nombre. Sólo baja de 6 si la columna es más estrecha que el
     código, para que no se corte. */
  codigo: 6,
  correo: 2.5,
};

/* La etiqueta lleva nombre, código y correo. El tipo de boleta y el nombre del
   evento se quitaron a pedido: en la puerta no se miran, y el correo sí sirve
   para confirmar a quién se le entrega. */
export const correoDe = (ticket = {}) =>
  (ticket.guest_email || ticket.usuario?.email || ticket.asistente?.email || '').trim();

/* Alto de letra del código que cabe en `anchoMm`. Courier mide 0,6 de ancho
   por carácter, más el espaciado. */
export function tamCodigoMm(codigo, anchoMm) {
  const n = String(codigo || '').length || 1;
  const cabe = anchoMm / (n * 0.6 + n * 0.05);
  return Math.max(2.5, Math.min(ALTURAS_MM.codigo, cabe));
}

/* De milímetros a puntos, redondeando al punto entero: si no, el cabezal
   redondea por su cuenta y el resultado no es el que se midió. */
export const aPuntos = (mm) => Math.round(mm * PUNTOS_POR_MM);
