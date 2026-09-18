import { emparejarColumna, clave } from './hojaCalculo.js';

/* Importar compradores y vendedores de la rueda desde una hoja.
 *
 * La lista suele llegar de la cámara de comercio o de quien convoca, con los
 * encabezados que cada uno ponga. Se emparejan por sinónimos, igual que la
 * importación de asistentes, y cada fila sale con lo que se va a crear o con
 * el motivo exacto por el que no: una importación que salta filas en silencio
 * se lee como «entraron todas». */

export const COLUMNAS_RUEDA = [
  { id: 'nombre',            etiqueta: 'Empresa',     sinonimos: ['empresa', 'nombre empresa', 'razon social', 'nombre'] },
  { id: 'rol',               etiqueta: 'Rol',         sinonimos: ['rol', 'papel', 'tipo', 'comprador vendedor', 'perfil'] },
  { id: 'nit',               etiqueta: 'NIT',         sinonimos: ['nit', 'nit empresa', 'identificacion tributaria'] },
  { id: 'categoria_negocio', etiqueta: 'Sector',      sinonimos: ['sector', 'categoria', 'actividad economica', 'industria'] },
  { id: 'descripcion',       etiqueta: 'Descripción', sinonimos: ['descripcion', 'descripcion del producto', 'descripcion del reto', 'producto', 'reto', 'necesidad'] },
  { id: 'contacto_nombre',   etiqueta: 'Contacto',    sinonimos: ['contacto', 'nombre contacto', 'representante', 'asistente'] },
  { id: 'contacto_email',    etiqueta: 'Correo',      sinonimos: ['correo', 'email', 'e mail', 'correo electronico'] },
  { id: 'contacto_telefono', etiqueta: 'Teléfono',    sinonimos: ['telefono', 'celular', 'whatsapp', 'movil'] },
  { id: 'stand',             etiqueta: 'Mesa/Stand',  sinonimos: ['mesa', 'stand', 'puesto'] },
];

/* Qué se entiende por cada papel. Lo que no encaja no se adivina. */
export function leerRol(v) {
  const k = clave(v);
  if (!k) return null;
  if (/^(c|compra|comprador|compradora|compradores|ancla|demanda)$/.test(k)) return 'comprador';
  if (/^(v|vende|vendedor|vendedora|vendedores|proveedor|oferta)$/.test(k)) return 'vendedor';
  return undefined;
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emparejar(columnas) {
  const mapa = {};
  for (const c of COLUMNAS_RUEDA) mapa[c.id] = emparejarColumna(columnas, c.sinonimos);
  /* «nombre» por contenido le ganaría a «nombre contacto»: si la columna de
     empresa y la de contacto salen iguales, la de contacto se suelta. */
  if (mapa.contacto_nombre && mapa.contacto_nombre === mapa.nombre) mapa.contacto_nombre = '';
  return mapa;
}

/* Cada fila → { fila, cuerpo } si se puede crear, o { fila, motivo } si no.
   `existentes` son los nombres/NIT ya dados de alta, para no duplicar. */
export function prepararFilas(filas, mapa, { rolPorDefecto = null, existentes = [] } = {}) {
  const vistos = new Set(existentes.flatMap(e => [e.nit && `nit:${clave(e.nit)}`, `n:${clave(e.nombre)}`]).filter(Boolean));
  return filas.map(f => {
    const val = (id) => (mapa[id] ? String(f[mapa[id]] ?? '').trim() : '');
    const nombre = val('nombre');
    if (!nombre) return { fila: f.__fila, motivo: 'Sin nombre de empresa.' };

    const rolLeido = mapa.rol ? leerRol(val('rol')) : null;
    if (rolLeido === undefined) return { fila: f.__fila, nombre, motivo: `Rol «${val('rol')}» no es comprador ni vendedor.` };
    const rol = rolLeido || rolPorDefecto;
    if (!rol) return { fila: f.__fila, nombre, motivo: 'Sin rol (comprador o vendedor).' };

    const email = val('contacto_email').toLowerCase();
    if (email && !CORREO.test(email)) return { fila: f.__fila, nombre, motivo: `Correo «${email}» no es válido.` };

    const nit = val('nit');
    const claveNit = nit && `nit:${clave(nit)}`;
    const claveNombre = `n:${clave(nombre)}`;
    if ((claveNit && vistos.has(claveNit)) || vistos.has(claveNombre)) {
      return { fila: f.__fila, nombre, motivo: 'Ya está dada de alta (mismo nombre o NIT).' };
    }
    if (claveNit) vistos.add(claveNit);
    vistos.add(claveNombre);

    const cuerpo = { nombre, rol, tipo_persona: 'empresa' };
    for (const c of COLUMNAS_RUEDA) {
      if (['nombre', 'rol'].includes(c.id)) continue;
      const v = c.id === 'contacto_email' ? email : val(c.id);
      if (v) cuerpo[c.id] = v;
    }
    return { fila: f.__fila, nombre, cuerpo };
  });
}
