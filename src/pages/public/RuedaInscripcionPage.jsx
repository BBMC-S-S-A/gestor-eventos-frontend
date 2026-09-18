import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { eventosApi } from '../../api/eventos.js';

/* «Inscríbete en la rueda de negocios» — y, después, «mi agenda».
 *
 * Una sola pantalla con el código de la boleta como llave, para que funcione
 * igual suelta (/explorar/:slug/rueda/inscribirse) que incrustada en la web
 * del organizador (/embed/:slug/rueda-inscripcion), donde hereda su branding.
 *
 * 1. Escribe su código. Si ya está inscrita, se le enseña su agenda.
 * 2. Si no, elige comprador o vendedor y rellena lo que la rueda necesita:
 *    empresa, NIT, sector y la descripción que toca a su papel.
 * 3. Queda dentro, y con el mismo código vuelve cuando quiera a ver sus citas.
 *
 * El código se recuerda en este navegador para no tener que volver a
 * escribirlo; no viaja en la dirección de la página (quedaría en el historial
 * y en los registros de la web anfitriona). */

const clave = (slug) => `gestek-rueda:${slug}`;
const leer = (slug) => { try { return localStorage.getItem(clave(slug)) || ''; } catch { return ''; } };
const guardar = (slug, c) => { try { localStorage.setItem(clave(slug), c); } catch { /* sin almacenamiento, sólo toca reescribirlo */ } };

export default function RuedaInscripcionPage({ slug: slugProp }) {
  const params = useParams();
  const slug = slugProp || params.slug;
  const [search] = useSearchParams();
  const [codigo, setCodigo] = useState(() => (search.get('c') || leer(slug)).toUpperCase());
  const [paso, setPaso] = useState('codigo'); // codigo | form | agenda
  const [agenda, setAgenda] = useState(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [f, setF] = useState({ rol: '', nombre: '', nit: '', categoria_negocio: '', descripcion: '', contacto_telefono: '' });
  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }));

  const verAgenda = async (cod) => {
    const a = await eventosApi.agendaRueda(cod);
    guardar(slug, cod);
    setAgenda(a);
    setPaso('agenda');
  };

  const entrar = async (e) => {
    e?.preventDefault();
    const cod = codigo.trim().toUpperCase();
    if (cod.length < 4) { setError('Escribe el código que aparece en tu boleta o escarapela.'); return; }
    setError(''); setOcupado(true);
    try {
      await verAgenda(cod);
    } catch (err) {
      /* 404 «no es de expositor» = boleta válida sin inscripción todavía → al
         formulario. «No encontrada» sí es un error de quien escribe. */
      const msg = err.response?.data?.error || '';
      if (/no es de expositor/i.test(msg)) setPaso('form');
      else setError(msg || 'No pudimos comprobar ese código. Intenta de nuevo.');
    } finally { setOcupado(false); }
  };

  /* Quien vuelve con su código ya guardado entra directo a su agenda. */
  useEffect(() => {
    if (codigo && paso === 'codigo') entrar();
    /* Sólo al abrir: `entrar` lee el código del estado inicial. */
  }, []);

  const inscribir = async (e) => {
    e.preventDefault();
    if (!f.rol) { setError('Elige si vienes a comprar o a vender.'); return; }
    if (!f.nombre.trim()) { setError('Escribe el nombre de tu empresa.'); return; }
    setError(''); setOcupado(true);
    const cod = codigo.trim().toUpperCase();
    try {
      await eventosApi.inscribirRueda(slug, { ...f, codigo: cod });
      await verAgenda(cod);
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos inscribirte. Intenta de nuevo.');
    } finally { setOcupado(false); }
  };

  const salir = () => { guardar(slug, ''); setCodigo(''); setAgenda(null); setPaso('codigo'); };

  const hora = (iso) => iso ? new Date(iso).toLocaleString('es-CO', {
    weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: agenda?.evento?.timezone || undefined,
  }) : '';

  return (
    <div className="px-4 py-8">
      <div className="max-w-lg mx-auto rounded-3xl border border-border bg-surface/60 p-6 space-y-5">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-text-3 font-semibold">Rueda de negocios</p>
          <h1 className="text-2xl font-bold font-display text-text-1 mt-1">
            {paso === 'agenda' ? (agenda?.expositor?.nombre || 'Tu agenda') : 'Inscríbete en la rueda'}
          </h1>
        </div>

        {paso === 'codigo' && (
          <form onSubmit={entrar} className="space-y-3">
            <p className="text-sm text-text-2">
              Usa el código de tu boleta: está en tu escarapela, debajo del QR, y en el correo de confirmación.
              Si ya te inscribiste, con el mismo código ves tus citas.
            </p>
            <input value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())}
              className="input text-center tracking-widest font-mono" placeholder="CÓDIGO" autoCapitalize="characters" />
            <button disabled={ocupado} className="btn-primary w-full">{ocupado ? 'Comprobando…' : 'Continuar'}</button>
          </form>
        )}

        {paso === 'form' && (
          <form onSubmit={inscribir} className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'comprador', label: 'Vengo a comprar', pista: 'Tengo una necesidad o un reto.' },
                { id: 'vendedor',  label: 'Vengo a vender',  pista: 'Tengo un producto o servicio.' },
              ].map(o => (
                <button key={o.id} type="button" onClick={() => setF(p => ({ ...p, rol: o.id }))}
                  className={`text-left px-3 py-2 rounded-2xl border transition-colors ${
                    f.rol === o.id ? 'border-accent bg-accent/10 text-text-1' : 'border-border text-text-2 hover:text-text-1'}`}>
                  <span className="text-sm font-medium block">{o.label}</span>
                  <span className="text-[11px] text-text-3 block leading-snug">{o.pista}</span>
                </button>
              ))}
            </div>
            <Campo label="Empresa *"><input value={f.nombre} onChange={set('nombre')} className="input" /></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="NIT"><input value={f.nit} onChange={set('nit')} className="input" placeholder="900123456-7" /></Campo>
              <Campo label="Sector"><input value={f.categoria_negocio} onChange={set('categoria_negocio')} className="input" /></Campo>
            </div>
            {f.rol && (
              <Campo label={f.rol === 'vendedor' ? 'Descripción del producto' : 'Descripción del reto'}>
                <textarea value={f.descripcion} onChange={set('descripcion')} rows={3} className="input"
                  placeholder={f.rol === 'vendedor' ? 'Qué ofreces y a quién le sirve…' : 'Qué necesitas resolver o qué estás buscando…'} />
              </Campo>
            )}
            <Campo label="Teléfono de contacto"><input value={f.contacto_telefono} onChange={set('contacto_telefono')} className="input" inputMode="tel" /></Campo>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPaso('codigo')} className="btn-ghost">Atrás</button>
              <button disabled={ocupado} className="btn-primary flex-1">{ocupado ? 'Inscribiendo…' : 'Inscribirme'}</button>
            </div>
          </form>
        )}

        {paso === 'agenda' && agenda && (
          <div className="space-y-3">
            <p className="text-sm text-text-2">
              Estás inscrito como <b className="text-text-1">{agenda.expositor?.rol === 'vendedor' ? 'vendedor' : 'comprador'}</b>
              {agenda.expositor?.stand ? ` · mesa ${agenda.expositor.stand}` : ''}.
            </p>
            {agenda.expositor?.rol === 'vendedor' ? (
              (agenda.reservadas || []).length === 0
                ? <p className="text-sm text-text-3">Aún no tienes citas. Reserva con los compradores en la rueda del evento.</p>
                : <ul className="divide-y divide-border">
                    {agenda.reservadas.map(c => (
                      <li key={c.id} className="py-2 text-sm">
                        <span className="text-text-1">{hora(c.inicio)}</span>
                        <span className="text-text-2"> · {c.mesa}{c.stand ? ` (mesa ${c.stand})` : ''}</span>
                        {c.estado !== 'confirmada' && <span className="text-text-3"> · {c.estado}</span>}
                      </li>
                    ))}
                  </ul>
            ) : (
              (agenda.agenda || []).length === 0
                ? <p className="text-sm text-text-3">Quien organiza la rueda todavía no ha abierto horarios en tu mesa.</p>
                : <ul className="divide-y divide-border">
                    {agenda.agenda.map(h => (
                      <li key={h.horario_id} className="py-2 text-sm flex justify-between gap-3">
                        <span className="text-text-1">{hora(h.inicio)}</span>
                        <span className="text-text-2 text-right truncate">
                          {h.bloqueado ? 'Bloqueado' : h.cita ? (h.cita.persona?.nombre || 'Reservada') : 'Libre'}
                        </span>
                      </li>
                    ))}
                  </ul>
            )}
            <button onClick={salir} className="btn-ghost btn-sm">Usar otro código</button>
          </div>
        )}

        {error && <p className="text-sm text-danger-light">{error}</p>}
      </div>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
