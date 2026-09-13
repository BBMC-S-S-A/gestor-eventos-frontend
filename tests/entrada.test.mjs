/* Que las tres salidas de la entrada no se vuelvan a separar.
 *
 * ── El fallo que esto evita, y que ya ocurrió ────────────────────────────
 *
 * El diseñador de escarapelas metía en el QR la URL `…/mi-ticket/ABCD1234`
 * mientras la boleta digital metía el token firmado. Resultado: **la escarapela
 * impresa no pasaba el control de ingreso** — el servidor recibía una URL donde
 * esperaba una firma y contestaba «QR inválido». Un papel con un QR que no
 * abría ninguna puerta. Está contado entero en `src/lib/qrEscaneado.js`.
 *
 * La causa no fue un descuido de programación: fue que dos pantallas trataban
 * el mismo objeto como si fueran dos cosas, y cada una decidió por su cuenta
 * qué meter en el QR. Mientras eso dependa de que alguien se acuerde, vuelve.
 *
 * Correr: node --test tests/entrada.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(join(RAIZ, p), 'utf8');

const COMPONENTE = 'src/components/public/DescargarEntrada.jsx';

test('las tres salidas se piden desde un solo sitio', () => {
  /* Si mañana alguien vuelve a llamar a una de las tres desde una pantalla,
     esa pantalla decide su propio `qrValue` — y ahí es donde nace la escarapela
     que no abre la puerta. */
  const generadores = ['descargarBoletaPdf', 'descargarQrPng', 'descargarTarjetaPng'];
  const permitidos = new Set([
    COMPONENTE,
    'src/lib/boletaPdf.jsx',
    'src/lib/qrPng.jsx',
    'src/lib/tarjetaPng.jsx',
    /* No hay más excepciones, y se comprobó antes de escribir la lista: al
       mirarlo, el panel del organizador no llama a ninguna de las tres. Una
       excepción que no excusa nada sólo sirve para que la prueba deje pasar
       algo el día que ese archivo cambie. */
  ]);

  const culpables = [];
  const recorrer = (dir) => {
    for (const nombre of readdirSync(dir)) {
      const abs = join(dir, nombre);
      if (statSync(abs).isDirectory()) { recorrer(abs); continue; }
      if (!/\.jsx?$/.test(nombre)) continue;
      const rel = abs.slice(RAIZ.length + 1).replace(/\\/g, '/');
      if (permitidos.has(rel)) continue;
      const txt = readFileSync(abs, 'utf8');
      for (const g of generadores) {
        /* Sólo la llamada, no el import ni el nombre en un comentario. */
        if (new RegExp(`${g}\\s*\\(`).test(txt)) culpables.push(`${rel} → ${g}()`);
      }
    }
  };
  recorrer(join(RAIZ, 'src'));

  assert.deepEqual(culpables, [],
    'estas pantallas generan una salida de la entrada por su cuenta: usa <DescargarEntrada>');
});

test('el mismo qrValue va a las tres', () => {
  const src = leer(COMPONENTE);
  /* Una sola variable, calculada una vez, pasada a las tres. Si alguien mete
     un segundo valor, esto deja de casar. */
  for (const g of ['descargarBoletaPdf', 'descargarQrPng', 'descargarTarjetaPng']) {
    assert.ok(src.includes(g), `${g} ya no se llama desde el componente`);
  }
  assert.equal(
    (src.match(/qrValue/g) || []).length >= 3, true,
    'el componente ya no reparte el mismo qrValue a las tres salidas',
  );
  assert.ok(!/qr_token|ticket\.codigo\s*\|\|/.test(src.replace(/`qr-\$\{ticket\.codigo\}`/g, '')),
    'el componente calcula un valor de QR propio en vez de usar el que recibe');
});

/* La prueba de arriba mira el COMPONENTE: que reparta el mismo `qrValue` a las
 * tres. Pero que lo reparta no sirve de nada si el que lo recibe lo ignora, y
 * eso es exactamente lo que hacía la tarjeta: `tarjetaPng` no tenía parámetro
 * de QR y se lo sacaba del ticket por su cuenta (`ticket.qr_token || …`).
 *
 * No se veía porque hoy los dos valores coinciden en todas las pantallas. Se
 * habría visto el día que alguien pasara un `qrValue` distinto —una pieza
 * configurada para imprimir el código corto en vez del token, que es una
 * opción que ya existe en `lib/piezasBranding.js`—: tarjeta con un QR y PDF
 * con otro, para la misma boleta. La misma forma de fallo que la escarapela
 * que no abría la puerta, esperando a que alguien usara una opción legítima.
 */
test('las tres salidas HACEN CASO al qrValue que reciben', () => {
  const salidas = [
    ['src/lib/boletaPdf.jsx', 'descargarBoletaPdf'],
    ['src/lib/tarjetaPng.jsx', 'tarjetaPng'],
  ];
  for (const [archivo, fn] of salidas) {
    const src = leer(archivo);
    assert.match(src, /qrValue/,
      `${fn} no recibe el valor del QR: se lo calcula por su cuenta`);
    /* Y que lo use ANTES de caer al ticket, no después ni en su lugar. */
    assert.match(src, /qr(Value|Pedido)\s*\|\|\s*ticket\./,
      `${fn} recibe un qrValue pero no lo antepone a lo que traiga el ticket`);
  }

  /* `descargarQrPng` recibe el valor como primer argumento, así que no tiene
     de dónde sacar otro: no hay nada que comprobarle. */
  const comp = leer(COMPONENTE);
  assert.match(comp, /descargarTarjetaPng\(\{[^}]*qrValue/s,
    'el componente no le pasa el qrValue a la tarjeta');
});

test('el PDF acepta el diseño del organizador', () => {
  /* Era la única de las tres salidas que ignoraba la marca: un evento con
     White Label entregaba un PDF gris. Y es el archivo que más se reenvía. */
  const pdf = leer('src/lib/boletaPdf.jsx');
  assert.match(pdf, /design\s*=\s*null/, 'descargarBoletaPdf ya no recibe `design`');
  assert.match(pdf, /design\?\.color1/, 'el PDF no usa el color de la marca');
  assert.match(pdf, /design\?\.logo/, 'el PDF no usa el logo de la marca');

  const comp = leer(COMPONENTE);
  assert.match(comp, /walletConfig\(/, 'el componente no resuelve la variante del organizador');
  assert.match(comp, /design,/, 'el componente no le pasa el diseño al PDF');
});

test('el panel manda la MISMA entrada que se lleva el asistente', () => {
  /* En el detalle del asistente sólo se podía bajar el QR: una imagen suelta,
     sin nombre, sin evento y sin instrucciones — escrita a mano por cuarta vez,
     mientras el asistente tiene desde hace tiempo su tarjeta, su PDF y su QR en
     `/mi-ticket`. El panel se había quedado con la mitad más pobre de lo que ya
     existía.

     Que use los mismos componentes no es aseo: es lo que garantiza que el QR
     que manda el organizador sea el mismo que valida el escáner. Cuando eso se
     escribió dos veces, una de las dos metió la URL en vez del token firmado y
     el papel no abría ninguna puerta. */
  const panel = readFileSync(join(RAIZ, 'src/pages/events/tabs/ClientesTab.jsx'), 'utf8');
  assert.match(panel, /<DescargarEntrada/, 'el panel volvió a escribir su propia descarga');
  assert.match(panel, /<EnviarEntrada/, 'el panel no puede enviar la entrada');
  assert.ok(!/download = `qr-/.test(panel), 'volvió la descarga de QR escrita a mano');
});

test('enviar por correo no acepta destinatario, y WhatsApp manda el enlace', () => {
  /* Dos decisiones que hay que sostener:

     · El destinatario NO viaja en la petición. Un endpoint del panel que acepta
       correo libre es un formulario de envío masivo con la marca del evento.
     · Por WhatsApp va el ENLACE y no una captura: un PNG suelto no se puede
       revalidar si cambia el token ni corrige la fecha si el evento se mueve, y
       lo reenvía cualquiera. */
  const api = readFileSync(join(RAIZ, 'src/api/clientes.js'), 'utf8');
  assert.match(api, /clientes\/\$\{ticketId\}\/reenviar`\)/,
    'reenviar dejó de ser una llamada sin cuerpo: ¿se le está pasando un correo?');

  const env = readFileSync(join(RAIZ, 'src/components/public/EnviarEntrada.jsx'), 'utf8');
  assert.match(env, /wa\.me\//, 'ya no se ofrece compartir por WhatsApp');
  assert.match(env, /enlaceBoleta\(evento, ticket\.codigo\)/,
    'el mensaje de WhatsApp ya no lleva el enlace a la entrada viva');
});
