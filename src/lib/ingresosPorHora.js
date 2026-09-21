/* Cómo entró la gente por la puerta, por día y por franja.
 *
 * ── Por qué vive aquí y no en la pantalla ────────────────────────────────
 *
 * Lo piden dos sitios que no se parecen en nada: la pantalla «Ingresos por
 * hora», que es para mirar y juguetear con la franja, y el «Reporte del
 * evento», que es una hoja que se imprime y se entrega. Si el cálculo vive en
 * la pantalla, el reporte acaba con su propia copia — y entonces son dos
 * informes que pueden decir cosas distintas del mismo evento, que es
 * exactamente el problema que tenía `aforo_vendido`.
 *
 * ── De dónde sale, y por qué no hace falta endpoint ──────────────────────
 *
 * De la lista de boletas, que ya se sirve entera y ya trae las tres horas que
 * importan:
 *
 *   `created_at`        · cuándo se registró
 *   `checked_in_at`     · su ÚLTIMO paso por la puerta
 *   `primer_ingreso_at` · el primero, si volvió otro día
 *
 * Ese último sólo se rellena cuando la boleta vuelve a pasar: la primera vez
 * se queda en blanco y el primer ingreso ES `checked_in_at`. Si el servidor
 * todavía no lo manda en la lista, todo sigue funcionando y los reingresos
 * salen a cero — que es lo honesto: o no los hubo o no se registraron, y
 * ninguna de las dos cosas se inventa.
 */

/* Quince minutos entre registrarse y entrar. Por debajo de eso la persona no
   venía inscrita: se inscribió ahí mismo, en la puerta, y ocupó sitio en la
   fila haciéndolo. No es una medida exacta de nada —alguien pudo registrarse
   en el parqueadero— y no hace falta que lo sea: lo que se mira es el orden de
   magnitud, y a esta escala no hay duda de lo que significa.

   Es LA cifra del informe: un QR se escanea en tres segundos y un formulario
   de pie se rellena en tres minutos, así que lo que atasca una puerta no es el
   ritmo de llegada, es qué parte de esa llegada viene sin registrar. */
export const MIN_EN_PUERTA_MS = 15 * 60 * 1000;

/* Una boleta, en lo que estos informes necesitan de ella.
 *
 * Se normaliza UNA vez al cargar y no en cada render: cambiar la franja
 * recorre miles de filas, y hacerlo con `new Date()` dentro es la diferencia
 * entre instantáneo y medio segundo de tirón cada vez que se toca el
 * selector. */
export function normalizarBoletas(clientes = []) {
  const out = [];
  for (const c of clientes) {
    if (!c?.checked_in_at) continue;
    const ultimo = new Date(c.checked_in_at);
    if (Number.isNaN(ultimo.getTime())) continue;
    const creado = c.created_at ? new Date(c.created_at) : null;
    const primero = c.primer_ingreso_at ? new Date(c.primer_ingreso_at) : ultimo;
    out.push({
      primero, ultimo, creado,
      /* Se mide contra el PRIMER ingreso: es el que hizo la cola. */
      enPuerta: Boolean(creado) && (primero - creado) < MIN_EN_PUERTA_MS,
      volvio  : primero.toDateString() !== ultimo.toDateString(),
    });
  }
  return out;
}

/* El informe, por día. `franjaMin` sólo afecta a la curva y al pico. */
export function resumenPorDia(filas, franjaMin = 15) {
  if (!filas?.length) return [];
  const porDia = new Map();
  const ms = franjaMin * 60 * 1000;

  for (const f of filas) {
    /* Cada paso por la puerta cuenta en SU día: el primero en el suyo y, si
       volvió, el último en el otro. Contar sólo `checked_in_at` movía a la
       persona entera al día en que volvió, y entonces el primer día perdía
       gente que sí estuvo allí. */
    const pasos = f.volvio ? [[f.primero, false], [f.ultimo, true]] : [[f.primero, false]];
    for (const [cuando, esReingreso] of pasos) {
      const clave = cuando.toDateString();
      if (!porDia.has(clave)) {
        porDia.set(clave, { fecha: cuando, ingresos: 0, enPuerta: 0, reingresos: 0, cubos: new Map() });
      }
      const d = porDia.get(clave);
      d.ingresos++;
      if (esReingreso) d.reingresos++;
      else if (f.enPuerta) d.enPuerta++;
      const cubo = Math.floor(cuando.getTime() / ms) * ms;
      d.cubos.set(cubo, (d.cubos.get(cubo) || 0) + 1);
    }
  }

  return [...porDia.values()]
    .sort((a, b) => a.fecha - b.fecha)
    .map(d => {
      const curva = [...d.cubos.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([at, n]) => ({ at: new Date(at), n }));
      const pico = curva.reduce((mx, p) => (p.n > (mx?.n || 0) ? p : mx), null);
      /* Los primeros ingresos del día son los que hicieron la fila; el
         reingreso de quien ya estuvo ayer no se inscribe en la puerta. El
         porcentaje va sobre los primeros y no sobre el total, o un día con
         muchos reingresos sale artificialmente «bien». */
      const primeros = d.ingresos - d.reingresos;
      return {
        ...d, curva, pico, primeros,
        primera: curva.length ? curva[0].at : null,
        ultima : curva.length ? curva[curva.length - 1].at : null,
        porMin : pico ? Math.round(10 * pico.n / franjaMin) / 10 : 0,
        pctEnPuerta: primeros > 0 ? Math.round(1000 * d.enPuerta / primeros) / 10 : 0,
      };
    });
}
