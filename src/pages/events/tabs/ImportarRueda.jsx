import { useMemo, useState } from 'react';
import { leerHoja, FORMATOS_ACEPTADOS } from '../../../lib/hojaCalculo.js';
import { COLUMNAS_RUEDA, emparejar, prepararFilas } from '../../../lib/importarRueda.js';
import { networkingApi } from '../../../api/networking.js';

/* Subir compradores y vendedores con un Excel.
 *
 * Tres pasos a la vista: elegir el archivo, revisar qué va a entrar y qué no
 * (con el motivo de cada fila), y crear. Al terminar se dice cuántas entraron
 * y cuáles fallaron en el servidor, fila por fila.
 *
 * Se crean de una en una con el mismo endpoint del alta a mano: así una
 * empresa sale con exactamente las mismas reglas (zona, estado de la ficha)
 * que si la hubiera escrito alguien, y un fallo en la fila 40 no se lleva por
 * delante las otras 39. */
export default function ImportarRueda({ eventoId, existentes, onCerrar, onHecho }) {
  const [hoja, setHoja] = useState(null);
  const [error, setError] = useState('');
  const [rolPorDefecto, setRolPorDefecto] = useState('');
  const [creando, setCreando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [resultado, setResultado] = useState(null); // { creadas, fallos: [{fila,nombre,motivo}] }

  const mapa = useMemo(() => (hoja ? emparejar(hoja.columnas) : null), [hoja]);
  const filas = useMemo(
    () => (hoja ? prepararFilas(hoja.filas, mapa, { rolPorDefecto: rolPorDefecto || null, existentes }) : []),
    [hoja, mapa, rolPorDefecto, existentes],
  );
  const validas = filas.filter(f => f.cuerpo);
  const omitidas = filas.filter(f => f.motivo);

  const elegir = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(''); setResultado(null);
    try { setHoja(await leerHoja(file)); } catch (err) { setError(err.message || 'No se pudo leer el archivo.'); }
  };

  const crear = async () => {
    setCreando(true); setProgreso(0);
    const fallos = [];
    let creadas = 0;
    for (const f of validas) {
      try {
        await networkingApi.crearStand(eventoId, f.cuerpo);
        creadas++;
      } catch (err) {
        fallos.push({ fila: f.fila, nombre: f.nombre, motivo: err.response?.data?.error || err.message || 'Error del servidor.' });
      }
      setProgreso(p => p + 1);
    }
    setCreando(false);
    setResultado({ creadas, fallos });
    if (creadas) onHecho?.();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={creando ? undefined : onCerrar}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-surface border border-border p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text-1">Subir compradores y vendedores</h2>
            <p className="text-xs text-text-3 mt-1">
              Un .xlsx o .csv con una fila por empresa. Columnas que se reconocen: {COLUMNAS_RUEDA.map(c => c.etiqueta).join(', ')}.
              El correo del contacto es el de la persona que asiste: con él se asocia la empresa a su boleta.
            </p>
          </div>
          {!creando && <button onClick={onCerrar} className="text-text-3 hover:text-text-1 text-xl leading-none">×</button>}
        </div>

        {resultado ? (
          <div className="space-y-3">
            <p className="text-sm text-text-1">
              Entraron <b>{resultado.creadas}</b> de {validas.length}.
              {omitidas.length > 0 && ` ${omitidas.length} filas no se intentaron (motivos abajo).`}
            </p>
            <ListaMotivos titulo="No entraron por un error del servidor" filas={resultado.fallos} />
            <ListaMotivos titulo="No se intentaron" filas={omitidas} />
            <button onClick={onCerrar} className="btn-primary btn-sm">Listo</button>
          </div>
        ) : (
          <>
            <label className="btn-secondary btn-sm inline-flex cursor-pointer">
              {hoja ? 'Elegir otro archivo' : 'Elegir archivo'}
              <input type="file" accept={FORMATOS_ACEPTADOS} onChange={elegir} className="hidden" />
            </label>
            {error && <p className="text-sm text-danger-light">{error}</p>}

            {hoja && (
              <>
                <div className="text-xs text-text-3 space-y-1">
                  <p>Hoja «{hoja.hoja}» · {hoja.filas.length} filas{hoja.recortado ? ` (se leyeron sólo las primeras ${hoja.recortado})` : ''}.</p>
                  <p>
                    {COLUMNAS_RUEDA.map(c => (
                      <span key={c.id} className="mr-3">{c.etiqueta}: <span className={mapa[c.id] ? 'text-text-1' : 'text-warning-light'}>{mapa[c.id] || 'no está'}</span></span>
                    ))}
                  </p>
                </div>

                {!mapa.rol && (
                  <div className="field">
                    <label className="label">La hoja no dice el rol. Todas estas empresas son…</label>
                    <select value={rolPorDefecto} onChange={e => setRolPorDefecto(e.target.value)} className="input w-auto">
                      <option value="">Elegir</option>
                      <option value="comprador">Compradores</option>
                      <option value="vendedor">Vendedores</option>
                    </select>
                  </div>
                )}

                <p className="text-sm text-text-1">
                  Se van a crear <b>{validas.length}</b>
                  {' '}({validas.filter(f => f.cuerpo.rol === 'comprador').length} compradores, {validas.filter(f => f.cuerpo.rol === 'vendedor').length} vendedores).
                  {omitidas.length > 0 && <> <b>{omitidas.length}</b> filas no entran.</>}
                </p>
                <ListaMotivos titulo="No entran" filas={omitidas} />

                <button onClick={crear} disabled={!validas.length || creando} className="btn-gradient btn-sm">
                  {creando ? `Creando ${progreso} de ${validas.length}…` : `Crear ${validas.length}`}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ListaMotivos({ titulo, filas }) {
  if (!filas.length) return null;
  return (
    <div className="rounded-2xl border border-border bg-surface-2/40 p-3">
      <p className="text-xs font-semibold text-text-2 mb-2">{titulo} · {filas.length}</p>
      <ul className="text-xs text-text-3 space-y-1 max-h-48 overflow-y-auto">
        {filas.map(f => (
          <li key={`${f.fila}-${f.motivo}`}>Fila {f.fila}{f.nombre ? ` · ${f.nombre}` : ''}: {f.motivo}</li>
        ))}
      </ul>
    </div>
  );
}
