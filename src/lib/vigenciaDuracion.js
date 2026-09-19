/* Vigencia por duración de una boleta, del lado de la pantalla.
 * La regla de cuándo vence vive en el backend (`lib/vigenciaDuracion.js`);
 * aquí sólo se dice en palabras. */

export const UNIDADES_VIGENCIA = [
  { id: 'horas',   uno: 'hora',   varios: 'horas' },
  { id: 'dias',    uno: 'día',    varios: 'días' },
  { id: 'semanas', uno: 'semana', varios: 'semanas' },
];

/* «4 horas», «1 día»… o '' si el tipo no tiene duración. */
export function textoDuracion(cantidad, unidad) {
  const n = Math.floor(Number(cantidad));
  const u = UNIDADES_VIGENCIA.find(x => x.id === unidad);
  if (!(n > 0) || !u) return '';
  return `${n} ${n === 1 ? u.uno : u.varios}`;
}

/* «vence el vie 19 sep, 12:00 a. m.» en la hora del evento. */
export function textoVence(venceAt, timezone) {
  if (!venceAt) return '';
  return new Date(venceAt).toLocaleString('es-CO', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: timezone || undefined,
  });
}

/* «quedan 3 h», «quedan 2 días», o '' si ya venció. */
export function textoQueda(venceAt, ahora = Date.now()) {
  if (!venceAt) return '';
  const ms = new Date(venceAt).getTime() - ahora;
  if (ms <= 0) return '';
  const h = ms / 3600000;
  if (h < 1) return `quedan ${Math.max(1, Math.round(ms / 60000))} min`;
  if (h < 48) return `quedan ${Math.floor(h)} h`;
  return `quedan ${Math.floor(h / 24)} días`;
}
