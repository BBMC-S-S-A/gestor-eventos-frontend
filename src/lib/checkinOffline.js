/* Cola de escaneos sin conexión.
 *
 * Cuando no hay internet, los escaneos se guardan en `localStorage` y se
 * sincronizan al reconectar. El check-in sin conexión es OPTIMISTA: no se
 * valida contra el servidor hasta la sincronización, y allí se resuelven las
 * boletas ya usadas o inválidas.
 *
 * ── Guardar puede fallar, y hay que decirlo ──────────────────────────────
 *
 * `localStorage.setItem` lanza cuando el almacenamiento está lleno, en modo
 * privado de algunos navegadores, o si el navegador tiene bloqueado el
 * almacenamiento del sitio. Antes eso se tragaba con un `catch` vacío que
 * decía «no romper el escaneo» — pero el escaneo YA estaba roto: la persona
 * había entrado, no quedaba constancia, y a quien está en la puerta se le
 * enseñaba «guardado».
 *
 * En una pantalla se puede callar un fallo y reintentar luego. En una puerta
 * no: quien escanea tiene a alguien delante y necesita saber AHORA si tiene
 * que apuntar el código a mano. Por eso `encolar` dice si guardó.
 *
 * ── Dos clases de escaneo, una sola cola ─────────────────────────────────
 *
 * Aquí caben el ingreso al evento y la entrada a un sub-evento. Van juntos
 * porque quien está en la puerta sólo quiere saber una cosa —«¿me queda algo
 * sin mandar?»— y dos contadores separados harían pensar que uno de los dos
 * ya está resuelto.
 *
 * Cada uno lleva su `tipo`. Lo que se guardó ANTES de que existiera el campo
 * no lo lleva, y eso es exactamente lo que significa `TIPO_INGRESO` por
 * defecto: una cola a medio sincronizar no se puede perder porque se
 * desplegara una versión nueva a mitad del evento.
 *
 * El reingreso NO entra: es un interruptor —entra, sale, entra— y el orden
 * decide el aforo. Ver `CheckinTab`, donde se explica.
 */

export const TIPO_INGRESO = 'ingreso';
export const TIPO_SESION  = 'sesion';
/* Entregar lo que la boleta incluye (0126). Entra en la cola por la misma
   razón que el ingreso, y con más motivo: el salón de comidas suele ser el
   peor punto de wifi de todo el recinto. */
export const TIPO_ENTREGA = 'entrega';

const KEY = (eventoId) => `gestek-offline-checkin:${eventoId}`;

export function leerCola(eventoId) {
  try { return JSON.parse(localStorage.getItem(KEY(eventoId)) || '[]'); } catch { return []; }
}

/* Devuelve `true` sólo si de verdad quedó escrito. */
function guardar(eventoId, cola) {
  try {
    localStorage.setItem(KEY(eventoId), JSON.stringify(cola));
    return true;
  } catch {
    return false;
  }
}

/* `{ guardado, cantidad }`.
 *
 * `cantidad` sale de volver a LEER, no de la lista que teníamos en memoria: si
 * la escritura falló, la que hay guardada es la de antes, y contar la de
 * memoria sería enseñar en pantalla una cola que no existe. */
/* Qué hace que dos escaneos guardados sean EL MISMO. Lo que identifica a la
   persona —el QR firmado o el código escrito— más para qué se escaneó: la
   misma pulsera en dos charlas distintas son dos apuntes legítimos. */
function huella(x) {
  /* El derecho y la franja entran en la huella por lo mismo que el sub-evento:
     la misma persona recogiendo el almuerzo y luego el refrigerio son dos
     entregas legítimas, y el almuerzo del día 1 y el del día 2, también. Sin
     ellos, la cola se comería la segunda creyendo que es un duplicado. */
  return [
    x.tipo, x.qr_token || '', (x.codigo || '').toUpperCase(), x.sesion_id || '',
    x.derecho_id || '', x.ventana_id || '',
  ].join('|');
}

export function encolar(eventoId, payload, tipo = TIPO_INGRESO) {
  const cola = leerCola(eventoId);

  /* Sin conexión no hay servidor que diga «esa boleta ya entró», así que un
     escaneo repetido se guarda dos veces y el aviso llega HORAS después, al
     sincronizar, convertido en un 409 que quien lo lee no puede relacionar con
     nada. Y como el cerrojo de pantalla no sobrevive a una recarga —ni al
     móvil que mata la pestaña por memoria—, la cola tiene que saberlo ella.

     Se contesta `guardado: true` a propósito: para quien está en la puerta el
     escaneo SÍ está a salvo. Que ya estuviera no es un fallo suyo. */
  const nuevo = { ...payload, tipo };
  if (cola.some(x => huella(x) === huella(nuevo))) {
    return { guardado: true, cantidad: cola.length, yaEstaba: true };
  }

  cola.push({
    ...payload,
    tipo,
    offline_id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
  });
  const guardado = guardar(eventoId, cola);
  return { guardado, cantidad: leerCola(eventoId).length };
}

/* Igual: dice si se pudo quitar. Si no, el escaneo se queda en la cola y se
   reintentará — y el servidor contestará 409 porque esa boleta ya se usó. Es
   ruidoso pero no pierde a nadie, que es el orden de prioridades correcto en
   una puerta. */
export function quitar(eventoId, offlineId) {
  return guardar(eventoId, leerCola(eventoId).filter(x => x.offline_id !== offlineId));
}

export function cantidadCola(eventoId) {
  return leerCola(eventoId).length;
}

/* Cuántos escaneos hay guardados, de TODOS los eventos.
 *
 * Hace falta desde fuera del evento —en la pantalla de inicio de sesión—, y
 * ahí no se sabe de cuál se venía. Si la sesión caducó en mitad de un turno,
 * lo que ve quien está en la puerta es un formulario de acceso; sin esto no
 * hay forma de saber que sus escaneos siguen aquí, y lo razonable es pensar
 * que se perdieron al «cerrarse la sesión».
 *
 * Se cuentan recorriendo las claves porque los escaneos se guardan por evento
 * y una puerta puede haber atendido dos. Nada de esto sale del dispositivo. */
export function escaneosGuardados() {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('gestek-offline-checkin:')) continue;
      /* El `try` va DENTRO del bucle, y esa es toda la diferencia.
         Envolviendo el bucle entero, una sola entrada corrupta abortaba la
         cuenta y devolvía 0 — o sea que la pantalla diría «no hay nada
         guardado» habiendo doscientos escaneos en las otras claves. Es
         justamente el fallo que este aviso viene a evitar. */
      try {
        const lista = JSON.parse(localStorage.getItem(k) || '[]');
        if (Array.isArray(lista)) total += lista.length;
      } catch { /* esa clave no se puede leer; las demás sí */ }
    }
  } catch { /* sin almacenamiento no hay nada que contar */ }
  return total;
}
