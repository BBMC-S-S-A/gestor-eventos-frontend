/* Qué acaba de leer la cámara.

   ── El problema que resuelve ──

   Todos los escáneres mandaban lo leído como `qr_token`, que el servidor
   verifica como token FIRMADO. Con la boleta digital eso funciona, porque
   ahí el QR es exactamente el token.

   Pero el diseñador de credenciales imprimía otra cosa: la URL
   `https://…/mi-ticket/ABCD1234`. Así que la escarapela impresa no pasaba el
   control de ingreso —el servidor recibía una URL donde esperaba una firma y
   contestaba "QR inválido"— ni servía para dar puntos en un stand ni para
   canjear. Un papel con un QR que no abre ninguna puerta.

   Ya está corregido de origen: la escarapela imprime el mismo token que la
   boleta digital. Pero las impresas antes siguen existiendo, y no se le puede
   pedir a nadie que reimprima cien escarapelas la mañana del evento.

   Y hay un tercer formato, a propósito y no por descuido: la etiquetadora
   (`lib/piezasBranding.js`, `qr_contenido: 'codigo'`) imprime en manillas y
   etiquetas pequeñas un QR con SÓLO el código corto —8 caracteres del
   alfabeto sin I/O/0/1 (`lib/codigos.js` en el backend)— porque la firma
   completa no cabe en esa pieza. Ese código tampoco lleva barras, así que sin
   distinguirlo caía en el mismo saco que el token firmado, se mandaba como
   `qr_token` y el servidor lo rechazaba como «QR inválido»: la manilla no
   abría la puerta pese a que el código era perfectamente válido.

   ── Cómo distingue ──

   Una URL lleva barras. Un token firmado (JWT) lleva dos puntos, separando
   cabecera, cuerpo y firma, y es mucho más largo que un código corto. Un
   código corto son exactamente 8 caracteres del alfabeto del generador, sin
   puntos ni barras. Con eso alcanza para las tres formas sin ambigüedad. Y el
   código corto que se extrae de la URL o que se reconoce suelto el servidor
   lo acepta igual de bien que el token: `resolverTicket` admite las dos
   formas desde siempre.

   Lo usan los cinco escáneres: control de ingreso, reingreso, puntos por
   stand, canje del panel y el portal del expositor. Vive aquí y no dentro de
   una pantalla porque cinco copias de esto acabarían separándose. */

/* Mismo alfabeto que `lib/codigos.js` en el backend: sin I, O, 0 ni 1. */
const CODIGO_CORTO = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/i;

export function leerQr(texto) {
  const s = String(texto || '').trim();
  /* Escarapelas impresas con el formato viejo. */
  const m = s.match(/\/mi-ticket\/([A-Za-z0-9]+)/);
  if (m) return { codigo: m[1].toUpperCase() };
  /* QR "simplificado" de una manilla o etiqueta pequeña: el código corto
     suelto, sin firma. Sin esto se manda como `qr_token` y el servidor lo
     rechaza por no ser un JWT válido. */
  if (CODIGO_CORTO.test(s)) return { codigo: s.toUpperCase() };
  return { qr_token: s };
}
