import { useState, useEffect } from 'react';
import { confirmDialog } from '../../components/ui/Confirm.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import AvatarUploader from '../../components/ui/AvatarUploader.jsx';
import { supabase } from '../../lib/supabase.js';
import { pagosApi } from '../../api/pagos.js';
import { usePush } from '../../hooks/usePush.js';
import { guardarBrandingLocal } from '../../hooks/useBranding.js';
import { auth } from '../../lib/sesion.js';
import { PAISES, bandera } from '../../lib/paises.js';
import { API } from '../../lib/apiUrl.js';

/* Pagos, Notificaciones y Recompensas viven ahora como secciones
   propias en el sidebar (páginas dedicadas). */
const TABS = [
  { key: 'perfil',        label: 'Perfil',        icon: UserIcon  },
  { key: 'logros',        label: 'Logros',        icon: TrophyIcon },
  { key: 'integraciones', label: 'Integraciones', icon: CodeIcon  },
];

export default function SettingsPage() {
  const { usuario, updateProfile, updatePassword } = useAuth();
  const { success, error, warning } = useToast();
  const [tab,     setTab]     = useState('perfil');
  const [loading, setLoading] = useState(false);

  const [perfil, setPerfil] = useState({
    nombre  : usuario?.nombre   || '',
    telefono: usuario?.telefono || '',
    ciudad  : usuario?.ciudad   || '',
    password: '',
    confirm : '',
  });

  const handlePerfilSave = async (e) => {
    e.preventDefault();
    if (perfil.password && perfil.password !== perfil.confirm) {
      error('Las contraseñas no coinciden.');
      return;
    }
    const hayNombre   = perfil.nombre && perfil.nombre !== usuario?.nombre;
    const hayTelefono = perfil.telefono !== (usuario?.telefono || '');
    const hayCiudad   = perfil.ciudad   !== (usuario?.ciudad   || '');
    const hayPassword = Boolean(perfil.password);
    if (!hayNombre && !hayTelefono && !hayCiudad && !hayPassword) { warning('Sin cambios que guardar.'); return; }

    setLoading(true);
    try {
      /* Nombre, teléfono y ciudad son de la persona, no de una faceta:
         se guardan aquí y sólo aquí (ver CONTINUAR.md §3.7). Igual que el
         avatar más abajo, van a los metadatos Y a `profiles` — es la misma
         forma dual que ya usa el registro (CompletarPerfilPage). */
      if (hayNombre || hayTelefono || hayCiudad) {
        const r = await updateProfile({ nombre: perfil.nombre, telefono: perfil.telefono, ciudad: perfil.ciudad });
        if (!r.ok) throw new Error(r.error);
        const { error: e2 } = await supabase.from('profiles')
          .update({ nombre: perfil.nombre, telefono: perfil.telefono || null, ciudad: perfil.ciudad || null })
          .eq('id', usuario.id);
        if (e2) throw new Error(e2.message);
      }
      if (hayPassword) {
        const r = await updatePassword(perfil.password);
        if (!r.ok) throw new Error(r.error);
      }
      success('Perfil actualizado correctamente.');
      setPerfil(p => ({ ...p, password: '', confirm: '' }));
    } catch (e) {
      error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const initials = usuario?.nombre?.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'U';

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-[fadeUp_0.4s_ease_both]">
      <div>
        <h1 className="text-2xl font-bold font-display text-text-1">Configuración</h1>
        <p className="text-sm text-text-2 mt-0.5">Administra tu cuenta y opciones de la plataforma.</p>
      </div>

      <div className="grid lg:grid-cols-[230px_1fr] gap-6 items-start">
        {/* Nav lateral de secciones */}
        <nav className="flex lg:flex-col gap-1 overflow-x-auto no-scrollbar
                        lg:bg-surface/60 lg:border lg:border-border-2 lg:rounded-2xl lg:p-2 lg:sticky lg:top-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium
                  whitespace-nowrap transition-all flex-shrink-0
                  ${tab === t.key
                    ? 'bg-gradient-primary text-white shadow-glow-sm'
                    : 'text-text-2 hover:text-text-1 hover:bg-surface-2'}`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Contenido de la sección activa */}
        <div className="min-w-0 space-y-6">

      {/* Perfil */}
      {tab === 'perfil' && (
        <div className="space-y-5">
          {/* Avatar + datos */}
          <div className="card p-5">
            <div className="flex items-center gap-5 flex-wrap">
              <AvatarUploader
                value={usuario?.foto}
                onChange={async (url) => {
                  try {
                    await auth.updateUser({ data: { foto: url } });
                    await supabase.from('profiles').update({ avatar_url: url || null }).eq('id', usuario.id);
                    success(url ? 'Avatar actualizado.' : 'Avatar quitado.');
                  } catch (e) { error(e.message); }
                }}
                userId={usuario?.id}
                initials={initials}
                size={88}
              />
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold text-text-1">{usuario?.nombre}</p>
                <p className="text-sm text-text-2">{usuario?.email}</p>
                <span className={`badge mt-2 ${usuario?.rol === 'admin_global' ? 'badge-purple' : usuario?.rol === 'organizador' ? 'badge-blue' : 'badge-gray'}`}>
                  {usuario?.rol === 'admin_global' ? 'Admin Global' : usuario?.rol === 'organizador' ? 'Organizador' : 'Asistente'}
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="text-sm font-semibold text-text-1">Información personal</h3>
            </div>
            <form onSubmit={handlePerfilSave} className="card-body space-y-4">
              <div className="field">
                <label className="label">Email</label>
                <input type="email" value={usuario?.email || ''} disabled
                  className="input opacity-50 cursor-not-allowed" />
                <p className="text-xs text-text-3 mt-1">El email no se puede cambiar.</p>
              </div>
              <div className="field">
                <label className="label">Nombre completo</label>
                <input type="text" className="input" value={perfil.nombre}
                  onChange={e => setPerfil(p => ({ ...p, nombre: e.target.value }))} required />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="field">
                  <label className="label">Teléfono</label>
                  <input type="tel" className="input" value={perfil.telefono}
                    onChange={e => setPerfil(p => ({ ...p, telefono: e.target.value }))} />
                </div>
                {/* Se llama `ciudad` en la base, pero lo que guarda —aquí y en
                    las dos pantallas de registro— es el PAÍS, de la misma
                    lista. Un campo de texto libre habría metido ciudades en
                    una columna que en todas las demás filas tiene países. */}
                <div className="field">
                  <label className="label">País</label>
                  <select className="input pr-10" value={perfil.ciudad}
                    onChange={e => setPerfil(p => ({ ...p, ciudad: e.target.value }))}>
                    <option value="">Seleccionar...</option>
                    {PAISES.map(p => (
                      <option key={p.code} value={p.nombre}>{bandera(p.code)} {p.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-border space-y-3">
                <p className="text-sm font-medium text-text-1">Cambiar contraseña</p>
                <div className="field">
                  <label className="label">Nueva contraseña</label>
                  <input type="password" className="input" placeholder="Dejar vacío para no cambiar"
                    value={perfil.password} onChange={e => setPerfil(p => ({ ...p, password: e.target.value }))}
                    minLength={perfil.password ? 8 : undefined} />
                </div>
                {perfil.password && (
                  <div className="field">
                    <label className="label">Confirmar contraseña</label>
                    <input type="password" className="input" placeholder="Repite la nueva contraseña"
                      value={perfil.confirm} onChange={e => setPerfil(p => ({ ...p, confirm: e.target.value }))} />
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button type="submit" disabled={loading} className="btn-primary">
                  {loading ? <><Spinner size="sm" /> Guardando...</> : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>

        </div>
      )}

      {/* Logros */}
      {tab === 'logros' && <LogrosTab />}

      {/* Integraciones (API + Webhooks) */}
      {tab === 'integraciones' && <IntegracionesTab />}
        </div>
      </div>
    </div>
  );
}

/* ──────────── Apariencia (modo oscuro/claro) ──────────── */
export function AparienciaCard() {
  const { theme, setLight, setDark } = useTheme();

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="text-sm font-semibold text-text-1">Apariencia</h3>
      </div>
      <div className="card-body">
        <p className="text-sm text-text-2 mb-4">Elige cómo quieres ver GESTEK en este dispositivo.</p>
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <button
            type="button"
            onClick={setDark}
            className={`flex flex-col items-center gap-2.5 p-4 rounded-2xl border-2 transition-all
              ${theme === 'dark' ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-border-2'}`}
          >
            <div className="w-full h-14 rounded-lg bg-[#0D1525] border border-white/10 flex items-center justify-center">
              <MoonIcon className="w-5 h-5 text-text-2" />
            </div>
            <span className={`text-sm font-medium ${theme === 'dark' ? 'text-text-1' : 'text-text-2'}`}>Oscuro</span>
          </button>

          <button
            type="button"
            onClick={setLight}
            className={`flex flex-col items-center gap-2.5 p-4 rounded-2xl border-2 transition-all
              ${theme === 'light' ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-border-2'}`}
          >
            <div className="w-full h-14 rounded-lg bg-[#F8FAFC] border border-black/10 flex items-center justify-center">
              <SunIcon className="w-5 h-5 text-slate-500" />
            </div>
            <span className={`text-sm font-medium ${theme === 'light' ? 'text-text-1' : 'text-text-2'}`}>Claro</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function MoonIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>;
}
function SunIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;
}

/* ──────────── White-label Tab ──────────── */
export function WhiteLabelTab() {
  const { usuario } = useAuth();
  const { success, error } = useToast();
  const branding = usuario?.raw?.user_metadata?.branding || {};
  const [logo,     setLogo]    = useState(usuario?.raw?.user_metadata?.empresa_logo_url || '');
  const [primary,  setPrimary] = useState(branding.primary || '#C9A227');
  const [accent,   setAccent]  = useState(branding.accent || '#E0B12B');
  const [bg,       setBg]      = useState(branding.bg || '#070C18');
  const [font,     setFont]    = useState(branding.font || 'sans');
  const [plataforma, setPlataforma] = useState(branding.plataforma || '');
  const [tagline,  setTagline] = useState(branding.tagline || '');
  const [web,      setWeb]     = useState(branding.web || '');
  const [instagram, setInstagram] = useState(branding.instagram || '');
  const [whatsapp, setWhatsapp] = useState(branding.whatsapp || '');
  const [footer,   setFooter]  = useState(branding.footer || '');
  const [radius,   setRadius]  = useState(branding.radius || 'lg');
  const [saving, setSaving] = useState(false);

  const FONT_CSS = {
    sans   : "'Inter', system-ui, sans-serif",
    display: "'Space Grotesk', 'Inter', sans-serif",
    serif  : "Georgia, 'Times New Roman', serif",
    mono   : "'JetBrains Mono', monospace",
  };

  const onGuardar = async () => {
    setSaving(true);
    try {
      const newBranding = {
        primary, accent, bg, font, radius, plataforma, tagline,
        web: web.trim() || null, instagram: instagram.trim() || null,
        whatsapp: whatsapp.trim() || null, footer: footer.trim() || null,
      };
      await auth.updateUser({
        data: { branding: newBranding, empresa_logo_url: logo || null },
      });
      await supabase.from('profiles').update({
        empresa_logo_url: logo || null,
        branding: newBranding,
      }).eq('id', usuario.id);
      guardarBrandingLocal(newBranding);
      success('Branding guardado. Aplicado en tu panel y páginas públicas.');
    } catch (e) { error(e.message); }
    finally    { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="card">
        <div className="card-header">
          <h3 className="text-base font-semibold text-text-1">Marca de tu empresa</h3>
        </div>
        <div className="card-body grid lg:grid-cols-[1fr_320px] gap-6">
          {/* Form */}
          <div className="space-y-5">
            <div className="field">
              <label className="label">Logo de tu empresa</label>
              <AvatarUploader
                value={logo}
                onChange={setLogo}
                userId={usuario?.id}
                initials={(usuario?.empresa || usuario?.nombre || 'U').charAt(0).toUpperCase()}
                size={96}
              />
            </div>

            <div className="field">
              <label className="label">Nombre de tu plataforma</label>
              <input
                value={plataforma} onChange={e => setPlataforma(e.target.value)}
                placeholder="Eventos de mi empresa"
                className="input rounded-2xl py-3"
              />
              <p className="text-xs text-text-3 mt-1.5">Lo que verán tus asistentes en lugar de &quot;GESTEK&quot;.</p>
            </div>

            <div className="field">
              <label className="label">Frase / tagline</label>
              <input
                value={tagline} onChange={e => setTagline(e.target.value)}
                placeholder="Experiencias inolvidables"
                className="input rounded-2xl py-3"
              />
              <p className="text-xs text-text-3 mt-1.5">Aparece bajo el nombre en el header público.</p>
            </div>

            {/* Tres selectores de color en 375px salen a 105px cada uno: la
                etiqueta se parte y el cuadradito deja de poderse tocar bien.
                Se apilan en movil y vuelven a la fila en cuanto hay sitio. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <ColorField label="Color primario"  value={primary} onChange={setPrimary} />
              <ColorField label="Color accent"    value={accent}  onChange={setAccent} />
              <ColorField label="Fondo público"   value={bg}      onChange={setBg} />
            </div>

            <div className="field">
              <label className="label">Tipografía</label>
              <select value={font} onChange={e => setFont(e.target.value)}
                className="input rounded-2xl py-3" style={{ fontFamily: FONT_CSS[font] }}>
                <option value="sans">Inter (moderna)</option>
                <option value="display">Space Grotesk (display)</option>
                <option value="serif">Serif (elegante)</option>
                <option value="mono">Mono (técnica)</option>
              </select>
            </div>

            <div className="field">
              <label className="label">Radio de bordes</label>
              <select value={radius} onChange={e => setRadius(e.target.value)}
                className="input rounded-2xl py-3">
                <option value="none">Cuadrado</option>
                <option value="sm">Sutil</option>
                <option value="md">Medio</option>
                <option value="lg">Redondeado</option>
                <option value="xl">Muy redondeado</option>
              </select>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div className="field">
                <label className="label">Sitio web</label>
                <input value={web} onChange={e => setWeb(e.target.value)}
                  placeholder="https://tuempresa.com" className="input rounded-2xl py-3" />
              </div>
              <div className="field">
                <label className="label">Instagram</label>
                <input value={instagram} onChange={e => setInstagram(e.target.value)}
                  placeholder="https://instagram.com/tu" className="input rounded-2xl py-3" />
              </div>
              <div className="field">
                <label className="label">WhatsApp</label>
                <input value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
                  placeholder="+57 300 000 0000" className="input rounded-2xl py-3" />
              </div>
            </div>

            <div className="field">
              <label className="label">Texto del footer (Pro)</label>
              <input value={footer} onChange={e => setFooter(e.target.value)}
                placeholder="© 2026 Tu Empresa · Todos los derechos reservados"
                className="input rounded-2xl py-3" />
              <p className="text-xs text-text-3 mt-1.5">
                En Pro reemplaza el &quot;gestionado con GESTEK&quot;. Vacío = sin footer.
              </p>
            </div>

            <div className="flex justify-end">
              <button onClick={onGuardar} disabled={saving} className="btn-gradient">
                {saving ? <><Spinner size="sm" /> Guardando...</> : 'Guardar branding'}
              </button>
            </div>
          </div>

          {/* Preview — refleja en vivo lo que elegís */}
          <aside>
            <p className="label">Vista previa</p>
            {(() => {
              const RAD = { none: '0px', sm: '6px', md: '12px', lg: '18px', xl: '26px' };
              const r = RAD[radius] ?? '18px';
              const efBg = bg || '#0D1525';
              return (
                <div className="border border-border-2 overflow-hidden"
                     style={{ background: efBg, fontFamily: FONT_CSS[font], borderRadius: r }}>
                  <div className="px-4 py-3 flex items-center gap-2.5"
                       style={{ borderBottom: '1px solid rgba(255,255,255,.1)' }}>
                    {logo
                      ? <img src={logo} alt="" className="w-8 h-8 object-cover" style={{ borderRadius: r }} />
                      : <div className="w-8 h-8" style={{ borderRadius: r, background: `linear-gradient(135deg, ${primary}, ${accent})` }} />}
                    <div>
                      <span className="block text-sm font-bold text-white">{plataforma || 'Tu plataforma'}</span>
                      {tagline && <span className="block text-[11px] text-white/60">{tagline}</span>}
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="aspect-video" style={{ borderRadius: r, background: `linear-gradient(135deg, ${primary}40, ${accent}25)` }} />
                    <p className="text-base font-semibold text-white">Tu evento aquí</p>
                    <p className="text-sm leading-relaxed text-white/60">Así se ven tus páginas públicas con tu marca.</p>
                    <div className="flex gap-2">
                      <span className="h-7 px-3 flex items-center text-xs font-semibold text-white"
                            style={{ background: primary, borderRadius: radius === 'none' ? '0px' : '9999px' }}>
                        Botón
                      </span>
                      <span className="h-7 px-3 flex items-center text-xs"
                            style={{ background: `${accent}30`, color: '#fff', borderRadius: r }}>
                        Acento
                      </span>
                    </div>
                    {footer && <p className="text-[10px] pt-2 text-white/40">{footer}</p>}
                  </div>
                </div>
              );
            })()}
            <p className="text-xs text-text-3 mt-3 leading-relaxed">
              Cambiá colores, fondo, tipografía y bordes arriba: la vista previa
              se actualiza al instante. Se aplica en tus páginas públicas y como
              fondo de tu panel.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color" value={value}
          onChange={e => onChange(e.target.value)}
          className="h-12 w-14 rounded-xl cursor-pointer border border-border bg-transparent"
        />
        <input
          type="text" value={value}
          onChange={e => onChange(e.target.value)}
          className="input rounded-xl py-2.5 text-base font-mono tabular-nums"
        />
      </div>
    </div>
  );
}

/* ──────────── Integraciones (API + Webhooks) ──────────── */

/* Los nombres bonitos, y SÓLO los nombres.
 *
 * La lista de tipos la manda el servidor —`tipos_webhook`, en la respuesta de
 * los tokens— y aquí estaba escrita a mano y entera. Hoy coinciden; el día que
 * alguien añada un cuarto tipo en el backend, el panel no lo ofrecería y nadie
 * se enteraría: el servidor filtra en silencio lo que no conoce
 * (`filter(e => TIPOS_WEBHOOK.includes(e))`), así que tampoco habría error.
 *
 * Un tipo nuevo sin traducción sale con su id crudo. Es feo y es correcto:
 * poder suscribirse a algo con nombre feo es mejor que no poder. */
const WH_ETIQUETA = {
  'ticket.pagado'    : 'Boleta pagada',
  'checkin.realizado': 'Check-in realizado',
  'evento.publicado' : 'Evento publicado',
};

function IntegracionesTab() {
  const { success, error: toastErr } = useToast();
  const [tokens, setTokens]     = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  /* Arranca con los tres que se conocen, no vacía.
     Vacía era «más puro» y rompía: la API desplegada todavía no manda
     `tipos_webhook` —lo añade el backend de este mismo cambio— y sin lista no
     hay ni un tipo que marcar, así que no se podría crear un webhook hasta que
     el servidor se actualice. Un despliegue no puede quitar una función que ya
     estaba. En cuanto el servidor conteste, mandan los suyos. */
  const [whTipos, setWhTipos]   = useState(Object.keys(WH_ETIQUETA));
  const [pro, setPro]           = useState(false);
  const [loading, setLoading]   = useState(true);
  const [nuevoToken, setNuevoToken] = useState(null); // {valor} mostrado una vez
  const [tokNombre, setTokNombre]   = useState('');
  const [whUrl, setWhUrl]           = useState('');
  const [whEventos, setWhEventos]   = useState([]);
  const [busy, setBusy]             = useState(false);
  /* Qué webhook tiene abierto su registro de envíos, y qué trajo.
     La ruta contesta los últimos 30 desde siempre y no la llamaba nadie: sin
     esto, un webhook que no llega no se puede diagnosticar desde aquí — no hay
     forma de saber si salió, si el otro lado contestó 500 o si nunca se
     intentó. */
  const [envios, setEnvios]         = useState({});

  const apiBase = API;

  const cargar = async () => {
    setLoading(true);
    try {
      const { integracionesApi } = await import('../../api/integraciones.js');
      const [t, w] = await Promise.all([integracionesApi.listTokens(), integracionesApi.listWebhooks()]);
      setTokens(t.tokens || []); setPro(Boolean(t.pro));
      /* Sólo si de verdad viene una lista con algo: `|| []` habría dejado los
         botones en blanco contra la API vieja. */
      if (Array.isArray(t.tipos_webhook) && t.tipos_webhook.length) setWhTipos(t.tipos_webhook);
      setWebhooks(w.webhooks || []);
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
    finally     { setLoading(false); }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  const crearToken = async () => {
    if (!tokNombre.trim()) return;
    setBusy(true);
    try {
      const { integracionesApi } = await import('../../api/integraciones.js');
      const r = await integracionesApi.crearToken(tokNombre.trim());
      setNuevoToken(r.token);
      setTokNombre('');
      cargar();
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
    finally     { setBusy(false); }
  };
  const revocar = async (id) => {
    if (!(await confirmDialog({ message:('¿Revocar este token? Las integraciones que lo usen dejarán de funcionar.'), danger:true }))) return;
    try {
      const { integracionesApi } = await import('../../api/integraciones.js');
      await integracionesApi.revocarToken(id); success('Token revocado.'); cargar();
    } catch (e) { toastErr(e.message); }
  };
  const crearWebhook = async () => {
    if (!/^https?:\/\//.test(whUrl) || whEventos.length === 0) { toastErr('URL https + al menos un evento.'); return; }
    setBusy(true);
    try {
      const { integracionesApi } = await import('../../api/integraciones.js');
      await integracionesApi.crearWebhook(whUrl, whEventos);
      success('Webhook creado.'); setWhUrl(''); setWhEventos([]); cargar();
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
    finally     { setBusy(false); }
  };
  /* Apagar un webhook sin borrarlo. La pantalla YA pintaba los inactivos en
     gris (`w.activo ? '' : 'opacity-50'`), o sea que dibujaba un estado al que
     no se podía llegar ni del que se podía volver. Apagar es lo que se quiere
     cuando el otro lado está caído: borrarlo pierde la URL y el secreto. */
  const alternarWebhook = async (w) => {
    try {
      const { integracionesApi } = await import('../../api/integraciones.js');
      await integracionesApi.editarWebhook(w.id, { activo: !w.activo });
      success(w.activo ? 'Webhook apagado.' : 'Webhook encendido.');
      cargar();
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
  };

  const verEnvios = async (id) => {
    if (envios[id]) { setEnvios(e => ({ ...e, [id]: null })); return; }
    try {
      const { integracionesApi } = await import('../../api/integraciones.js');
      const r = await integracionesApi.deliveries(id);
      /* Lista vacía y «todavía no cargó» no se pueden ver igual, que es
         justamente el fallo que se viene a diagnosticar aquí. */
      setEnvios(e => ({ ...e, [id]: r.deliveries || [] }));
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
  };

  const borrarWebhook = async (id) => {
    if (!(await confirmDialog({ message:('¿Borrar webhook?'), danger:true }))) return;
    try {
      const { integracionesApi } = await import('../../api/integraciones.js');
      await integracionesApi.borrarWebhook(id); success('Borrado.'); cargar();
    } catch (e) { toastErr(e.message); }
  };

  if (loading) return <div className="card p-6"><Spinner size="md" /></div>;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-accent/5 border border-accent/20 px-4 py-3 text-sm text-text-2 leading-relaxed flex items-center justify-between gap-3">
        <span>API REST + Webhooks para conectar GESTEK con tus sistemas (CRM, automatizaciones, facturación).</span>
        <span className="badge badge-purple text-[10px] flex-shrink-0">Pro</span>
      </div>

      {!pro && (
        <div className="rounded-2xl bg-warning/10 border border-warning/25 px-4 py-3 text-sm text-text-2">
          Configura tu integración para crear tokens y webhooks.
        </div>
      )}

      {/* API Tokens */}
      <div className="card">
        <div className="card-header"><h3 className="text-base font-semibold text-text-1">API Tokens</h3></div>
        <div className="card-body space-y-4">
          {nuevoToken && (
            <div className="rounded-2xl border border-success/30 bg-success/10 p-4">
              <p className="text-sm font-semibold text-success-light mb-1">Token creado — copialo ahora, no se vuelve a mostrar</p>
              <code className="block text-xs font-mono text-text-1 bg-bg/50 rounded-lg px-3 py-2 break-all">{nuevoToken.valor}</code>
              <button onClick={() => { navigator.clipboard?.writeText(nuevoToken.valor); success('Copiado.'); }}
                className="btn-secondary btn-sm mt-2">Copiar</button>
            </div>
          )}
          {pro && (
            <div className="flex items-end gap-2">
              <div className="field flex-1">
                <label className="label">Nombre del token</label>
                <input className="input rounded-2xl py-2.5" value={tokNombre}
                  onChange={e => setTokNombre(e.target.value)} placeholder="ej. Integración CRM" />
              </div>
              <button onClick={crearToken} disabled={busy || !tokNombre.trim()} className="btn-gradient">Generar</button>
            </div>
          )}
          {tokens.length === 0 ? (
            <p className="text-sm text-text-3 text-center py-3">Sin tokens.</p>
          ) : (
            <div className="space-y-2">
              {tokens.map(t => (
                <div key={t.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-2/40 border border-border ${t.revoked ? 'opacity-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-1">{t.nombre}</p>
                    <p className="text-xs text-text-3 font-mono">{t.prefix} · {t.last_used_at ? `usado ${new Date(t.last_used_at).toLocaleDateString('es-CO')}` : 'sin uso'}</p>
                  </div>
                  {t.revoked
                    ? <span className="text-[10px] uppercase tracking-widest text-text-3">revocado</span>
                    : <button onClick={() => revocar(t.id)} className="btn-ghost btn-sm text-danger/80 hover:text-danger">Revocar</button>}
                </div>
              ))}
            </div>
          )}
          <div className="rounded-xl bg-surface-2/40 border border-border p-3 text-xs text-text-3 font-mono leading-relaxed">
            curl -H "Authorization: Bearer gtk_live_..." {apiBase}/api/v1/eventos
          </div>
        </div>
      </div>

      {/* Webhooks */}
      <div className="card">
        <div className="card-header"><h3 className="text-base font-semibold text-text-1">Webhooks</h3></div>
        <div className="card-body space-y-4">
          {pro && (
            <div className="space-y-3">
              <div className="field">
                <label className="label">URL de destino</label>
                <input className="input rounded-2xl py-2.5 font-mono" value={whUrl}
                  onChange={e => setWhUrl(e.target.value)} placeholder="https://tu-sistema.com/webhook" />
              </div>
              <div>
                <label className="label">Eventos</label>
                <div className="flex flex-wrap gap-2">
                  {whTipos.map(id => {
                    const on = whEventos.includes(id);
                    return (
                      <button key={id} type="button"
                        onClick={() => setWhEventos(s => on ? s.filter(x => x !== id) : [...s, id])}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${on ? 'border-primary/40 bg-primary/15 text-primary-light' : 'border-border text-text-3 hover:text-text-2'}`}>
                        {WH_ETIQUETA[id] || id}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end">
                <button onClick={crearWebhook} disabled={busy} className="btn-gradient">Crear webhook</button>
              </div>
            </div>
          )}
          {webhooks.length === 0 ? (
            <p className="text-sm text-text-3 text-center py-3">Sin webhooks.</p>
          ) : (
            <div className="space-y-2">
              {webhooks.map(w => (
                <div key={w.id} className={`px-3 py-3 rounded-xl bg-surface-2/40 border border-border ${w.activo ? '' : 'opacity-50'}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono text-text-1 truncate">{w.url}</p>
                      <p className="text-xs text-text-3">{w.eventos.join(' · ')}</p>
                    </div>
                    <button onClick={() => alternarWebhook(w)}
                      className="btn-ghost btn-sm shrink-0">
                      {w.activo ? 'Apagar' : 'Encender'}
                    </button>
                    <button onClick={() => borrarWebhook(w.id)} aria-label="Borrar"
                      className="w-8 h-8 rounded-lg text-text-3 hover:text-danger hover:bg-danger/10 flex items-center justify-center">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <p className="text-[11px] text-text-3 mt-2">Secret HMAC: <code className="font-mono">{w.secret}</code> — verificá el header <code className="font-mono">x-gestek-signature</code>.</p>

                  {/* Los últimos envíos. Es la única forma de contestar «¿por
                      qué no me llega?» sin abrir el servidor: dice si salió,
                      qué contestó el otro lado y cuántas veces se reintentó. */}
                  <button onClick={() => verEnvios(w.id)}
                    className="text-[11px] text-primary-light hover:underline mt-2">
                    {envios[w.id] ? 'Ocultar los últimos envíos' : 'Ver los últimos envíos'}
                  </button>
                  {envios[w.id] && (
                    envios[w.id].length === 0 ? (
                      <p className="text-[11px] text-text-3 mt-2">
                        Todavía no se ha intentado ningún envío a esta dirección.
                      </p>
                    ) : (
                      <div className="mt-2 space-y-1">
                        {envios[w.id].map(d => (
                          <div key={d.id} className="flex items-center gap-2 text-[11px]">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              d.status === 'ok' ? 'bg-success' : 'bg-danger'}`} aria-hidden="true" />
                            <span className="font-mono text-text-2 truncate flex-1">{d.evento_tipo}</span>
                            <span className="text-text-3">{d.response_code ?? 'sin respuesta'}</span>
                            {d.intentos > 1 && <span className="text-text-3">· {d.intentos} intentos</span>}
                            <span className="text-text-3 shrink-0">
                              {new Date(d.created_at).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────────── Pagos Tab (Mercado Pago) ──────────── */
export function PagosTab() {
  const { usuario } = useAuth();
  const { success, error } = useToast();

  /* mp_* viven en la fila de profiles. AuthContext suele exponer raw user metadata,
     no necesariamente las columnas SQL. Hacemos un fetch directo a Supabase. */
  const [loading, setLoading] = useState(true);
  const [estado,  setEstado]  = useState({ conectado: false, mp_user_id: null, mp_public_key: '', mp_connected_at: null });
  const [accessToken, setAccessToken] = useState('');
  const [publicKey,   setPublicKey]   = useState('');
  const [working, setWorking] = useState(false);
  const [testInfo, setTestInfo] = useState(null);

  const cargar = async () => {
    setLoading(true);
    try {
      const { data, error: e } = await supabase
        .from('profiles')
        .select('mp_user_id, mp_public_key, mp_connected_at')
        .eq('id', usuario.id).single();
      if (e) throw e;
      setEstado({
        conectado: !!data?.mp_user_id,
        mp_user_id: data?.mp_user_id,
        mp_public_key: data?.mp_public_key || '',
        mp_connected_at: data?.mp_connected_at,
      });
      setPublicKey(data?.mp_public_key || '');
    } catch (e) { error(e.message); }
    finally    { setLoading(false); }
  };

  useEffect(() => { cargar(); }, []);

  const onConectar = async () => {
    if (!accessToken.trim()) { error('Pega tu access token.'); return; }
    setWorking(true);
    try {
      const r = await pagosApi.conectar(accessToken.trim(), publicKey.trim() || null);
      success(`Conectado a Mercado Pago como ${r.mp_user?.nickname || r.profile?.mp_user_id}.`);
      setAccessToken('');
      await cargar();
    } catch (e) { error(e.response?.data?.error || e.message); }
    finally    { setWorking(false); }
  };

  const onTest = async () => {
    setWorking(true);
    setTestInfo(null);
    try {
      const r = await pagosApi.test();
      setTestInfo(r.mp_user);
      success('Conexión OK con Mercado Pago.');
    } catch (e) { error(e.response?.data?.error || e.message); }
    finally    { setWorking(false); }
  };

  const onDesconectar = async () => {
    if (!(await confirmDialog({ message:('¿Desconectar tu cuenta de Mercado Pago? Los pagos quedarán deshabilitados.'), danger:true }))) return;
    setWorking(true);
    try {
      await pagosApi.desconectar();
      success('Cuenta desconectada.');
      setTestInfo(null);
      await cargar();
    } catch (e) { error(e.response?.data?.error || e.message); }
    finally    { setWorking(false); }
  };

  if (loading) return <div className="card p-6"><Spinner size="md" /></div>;

  return (
    <div className="space-y-5">

      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="text-base font-semibold text-text-1">Mercado Pago</h3>
            <p className="text-xs text-text-3 mt-0.5">Procesa pagos de tus boletas usando tu propia cuenta MP.</p>
          </div>
          {estado.conectado ? (
            <span className="badge badge-green">Conectado</span>
          ) : (
            <span className="badge badge-gray">Sin conectar</span>
          )}
        </div>

        <div className="card-body space-y-5">
          {estado.conectado ? (
            <div className="bg-surface-2 rounded-2xl p-4 border border-border space-y-2">
              <Row label="MP User ID"   value={estado.mp_user_id} />
              <Row label="Public Key"   value={estado.mp_public_key || '—'} mono />
              <Row label="Conectado el" value={estado.mp_connected_at ? new Date(estado.mp_connected_at).toLocaleString() : '—'} />
              {testInfo && (
                <>
                  <div className="border-t border-border my-2" />
                  <Row label="Nickname" value={testInfo.nickname} />
                  <Row label="Email"    value={testInfo.email} />
                  <Row label="País"     value={testInfo.country_id} />
                </>
              )}
              <div className="flex gap-2 pt-3">
                <button onClick={onTest} disabled={working} className="btn-secondary btn-sm">
                  {working ? <Spinner size="sm" /> : null} Probar conexión
                </button>
                <button onClick={onDesconectar} disabled={working} className="btn-ghost btn-sm text-danger/80 hover:text-danger">
                  Desconectar
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-text-2 leading-relaxed bg-primary/5 border border-primary/20 rounded-2xl p-4">
                <p className="font-medium text-text-1 mb-1">¿Dónde obtengo mis credenciales?</p>
                <p>Entrá a <a className="text-primary underline" href="https://www.mercadopago.com.co/developers/panel/app" target="_blank" rel="noreferrer">developers.mercadopago.com</a> → tu aplicación → <em>Credenciales de producción</em>. Copiá el <code className="font-mono text-xs">Access Token</code> y la <code className="font-mono text-xs">Public Key</code>.</p>
              </div>

              <div className="field">
                <label className="label">Access Token</label>
                <input
                  type="password" value={accessToken}
                  onChange={e => setAccessToken(e.target.value)}
                  placeholder="APP_USR-..."
                  className="input font-mono"
                />
                <p className="text-xs text-text-3 mt-1">Se guarda cifrado del lado servidor. Nunca se expone al frontend.</p>
              </div>

              <div className="field">
                <label className="label">Public Key (opcional)</label>
                <input
                  type="text" value={publicKey}
                  onChange={e => setPublicKey(e.target.value)}
                  placeholder="APP_USR-xxxxxxxx-..."
                  className="input font-mono"
                />
              </div>

              <div className="flex justify-end">
                <button onClick={onConectar} disabled={working || !accessToken.trim()} className="btn-gradient">
                  {working ? <><Spinner size="sm" /> Conectando...</> : 'Conectar cuenta'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="text-sm font-semibold text-text-1">Cómo funciona</h3>
        </div>
        <ul className="card-body text-sm text-text-2 space-y-2 leading-relaxed list-disc pl-5">
          <li>Cada comprador paga directo a TU cuenta de Mercado Pago. GESTEK no toca el dinero.</li>
          <li>Cuando MP confirma el pago, recibimos un webhook y marcamos la boleta como <strong>pagada</strong> automáticamente.</li>
          <li>El comprador queda redirigido a su página <code className="font-mono">/mi-ticket/&lt;código&gt;</code> con el QR listo para el check-in.</li>
          <li>Si configuras la URL pública del backend en <code className="font-mono">API_PUBLIC_URL</code>, los webhooks llegarán incluso desde producción.</li>
        </ul>
      </div>
    </div>
  );
}

function TrophyIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8m-4-4v4m7-13a3 3 0 003-3V3H6v2a3 3 0 003 3m6 0a6 6 0 11-6 0m9-3h2a2 2 0 01-2 2m-13-2H3a2 2 0 002 2" /></svg>;
}

/* ──────────── Logros Tab (fidelidad: cliente / empleado / insignias) ──────────── */
function LogrosTab() {
  const { error: toastErr, success } = useToast();
  const [sub, setSub] = useState('cliente'); // cliente | empleado | insignias
  const [cli, setCli] = useState(null);
  const [emp, setEmp] = useState(null);
  const [badges, setBadges] = useState(null);
  const [loading, setLoading] = useState(true);
  const [canjeando, setCanjeando] = useState(null);

  const cargar = async () => {
    setLoading(true);
    try {
      const { loyaltyApi } = await import('../../api/loyalty.js');
      const [c, e, b] = await Promise.all([
        loyaltyApi.cliente(), loyaltyApi.empleado(), loyaltyApi.badges(),
      ]);
      setCli(c); setEmp(e); setBadges(b.badges || []);
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
    finally    { setLoading(false); }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  const canjear = async (rec) => {
    setCanjeando(rec.id);
    try {
      const { loyaltyApi } = await import('../../api/loyalty.js');
      const r = await loyaltyApi.canjear(rec.id);
      success(`¡Canjeado! Tu código: ${r.codigo}`);
      await cargar();
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
    finally     { setCanjeando(null); }
  };

  if (loading) return <div className="card p-6"><Spinner size="md" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1 bg-surface-2 border border-border rounded-xl p-1 w-fit">
        {[['cliente', 'Como cliente'], ['empleado', 'Como empleado'], ['insignias', 'Insignias']].map(([k, l]) => (
          <button key={k} onClick={() => setSub(k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${sub === k ? 'bg-surface-3 text-text-1' : 'text-text-3 hover:text-text-2'}`}>
            {l}
          </button>
        ))}
      </div>

      {sub === 'cliente' && <ComunidadesCliente data={cli} onCanjear={canjear} canjeando={canjeando} />}
      {sub === 'empleado' && <ComunidadesEmpleado data={emp} onCanjear={canjear} canjeando={canjeando} />}
      {sub === 'insignias' && <InsigniasGrid badges={badges} />}
    </div>
  );
}

function ComunidadesCliente({ data, onCanjear, canjeando }) {
  const comunidades = data?.comunidades || [];
  const canjes = data?.canjes || [];
  if (comunidades.length === 0) {
    return <EmptyMini titulo="Sin puntos todavía" desc="Asistí a eventos (con tu cuenta) y vas a acumular puntos con cada organizador. Después los canjeás por recompensas." />;
  }
  return (
    <div className="space-y-5">
      {comunidades.map(c => (
        <div key={c.organizador.id} className="card">
          <div className="card-header">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg overflow-hidden bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-sm font-bold">
                {c.organizador.avatar_url ? <img src={c.organizador.avatar_url} alt="" className="w-full h-full object-cover" /> : (c.organizador.nombre?.[0] || 'O').toUpperCase()}
              </div>
              <div>
                <h3 className="text-base font-semibold text-text-1">{c.organizador.empresa || c.organizador.nombre}</h3>
                <p className="text-xs text-text-3">Tus puntos con este organizador</p>
              </div>
            </div>
            <span className="text-2xl font-bold font-display text-primary-light tabular-nums">{c.puntos.toLocaleString('es-CO')}</span>
          </div>
          <div className="card-body">
            {c.recompensas.length === 0 ? (
              <p className="text-sm text-text-3 text-center py-4">Este organizador todavía no publicó recompensas.</p>
            ) : (
              <div className="space-y-2">
                {c.recompensas.map(r => (
                  <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-2/40 border border-border">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-1">{r.titulo}</p>
                      {r.descripcion && <p className="text-xs text-text-3 truncate">{r.descripcion}</p>}
                    </div>
                    <span className="text-sm font-bold text-text-1 tabular-nums whitespace-nowrap">{r.costo_puntos.toLocaleString('es-CO')} pts</span>
                    <button
                      onClick={() => onCanjear(r)}
                      disabled={r.agotada || !r.alcanzable || canjeando === r.id}
                      className="btn-primary btn-sm whitespace-nowrap disabled:opacity-50">
                      {canjeando === r.id ? <Spinner size="sm" /> : r.agotada ? 'Agotada' : r.alcanzable ? 'Canjear' : 'Faltan pts'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {canjes.length > 0 && (
        <div className="card">
          <div className="card-header"><h3 className="text-sm font-semibold text-text-1">Mis canjes</h3></div>
          <div className="card-body space-y-2">
            {canjes.map(k => (
              <div key={k.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-surface-2/40">
                <span className="text-sm text-text-1">{k.titulo}</span>
                <code className="text-xs font-mono text-primary-light bg-primary/10 px-2 py-0.5 rounded">{k.codigo}</code>
                <span className="text-[11px] text-text-3">{new Date(k.created_at).toLocaleDateString('es-CO')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ComunidadesEmpleado({ data, onCanjear, canjeando }) {
  const comunidades = data?.comunidades || [];
  if (comunidades.length === 0) {
    return <EmptyMini titulo="Sin actividad de equipo" desc="Cuando completes tareas o ayudes en check-ins de un organizador, vas a acumular puntos y entrar en su ranking de equipo." />;
  }
  return (
    <div className="space-y-5">
      {comunidades.map(c => (
        <div key={c.organizador.id} className="card">
          <div className="card-header">
            <div>
              <h3 className="text-base font-semibold text-text-1">{c.organizador.empresa || c.organizador.nombre}</h3>
              <p className="text-xs text-text-3">Puesto #{c.mi_posicion} · {c.puntos.toLocaleString('es-CO')} pts</p>
            </div>
          </div>
          <div className="card-body space-y-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-text-3 font-semibold mb-2">Ranking del equipo</p>
              <div className="space-y-1">
                {c.ranking.map(r => (
                  <div key={r.posicion}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg ${r.es_yo ? 'bg-primary/10 border border-primary/20' : 'hover:bg-surface-2/40'}`}>
                    <span className={`w-6 text-center text-sm font-bold tabular-nums ${r.posicion <= 3 ? 'text-warning' : 'text-text-3'}`}>{r.posicion}</span>
                    <div className="w-7 h-7 rounded-lg overflow-hidden bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0">
                      {r.avatar_url ? <img src={r.avatar_url} alt="" className="w-full h-full object-cover" /> : (r.nombre?.[0] || 'U').toUpperCase()}
                    </div>
                    <span className="flex-1 text-sm text-text-1 truncate">{r.nombre}{r.es_yo && <span className="text-xs text-primary-light ml-1.5">(vos)</span>}</span>
                    <span className="text-sm font-bold text-text-1 tabular-nums">{r.puntos.toLocaleString('es-CO')}</span>
                  </div>
                ))}
              </div>
            </div>

            {c.recompensas.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-widest text-text-3 font-semibold mb-2">Recompensas del equipo</p>
                <div className="space-y-2">
                  {c.recompensas.map(r => (
                    <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-2/40 border border-border">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-1">{r.titulo}</p>
                        {r.descripcion && <p className="text-xs text-text-3 truncate">{r.descripcion}</p>}
                      </div>
                      <span className="text-sm font-bold text-text-1 tabular-nums whitespace-nowrap">{r.costo_puntos.toLocaleString('es-CO')} pts</span>
                      <button onClick={() => onCanjear(r)}
                        disabled={r.agotada || !r.alcanzable || canjeando === r.id}
                        className="btn-primary btn-sm whitespace-nowrap disabled:opacity-50">
                        {canjeando === r.id ? <Spinner size="sm" /> : r.agotada ? 'Agotada' : r.alcanzable ? 'Canjear' : 'Faltan pts'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function InsigniasGrid({ badges }) {
  if (!badges?.length) return <EmptyMini titulo="Sin insignias" desc="Las insignias se desbloquean usando la plataforma." />;
  return (
    <div className="card">
      <div className="card-header"><h3 className="text-base font-semibold text-text-1">Insignias de plataforma</h3></div>
      <div className="card-body grid grid-cols-2 sm:grid-cols-4 gap-3">
        {badges.map(b => (
          <div key={b.slug}
            className={`rounded-2xl border p-4 text-center transition-all ${b.obtenida ? 'border-primary/30 bg-primary/5' : 'border-border bg-surface/40 opacity-50 grayscale'}`}>
            <div className="text-3xl mb-2">{b.icon}</div>
            <p className="text-sm font-semibold text-text-1 leading-tight">{b.nombre}</p>
            <p className="text-[11px] text-text-3 mt-1 leading-snug">{b.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyMini({ titulo, desc }) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-surface/40 px-6 py-14 text-center">
      <h3 className="text-lg font-bold font-display text-text-1 mb-1">{titulo}</h3>
      <p className="text-sm text-text-2 max-w-sm mx-auto leading-relaxed">{desc}</p>
    </div>
  );
}

/* ──────────── Recompensas Tab (organizador define cliente + empleado) ──────────── */
export function RecompensasTab() {
  const { success, error: toastErr } = useToast();
  const [aud, setAud] = useState('cliente'); // cliente | empleado
  const [items, setItems] = useState([]);
  const [canjes, setCanjes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ titulo: '', descripcion: '', costo_puntos: '', stock: '' });
  const [saving, setSaving] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const { recompensasApi } = await import('../../api/loyalty.js');
      const [r, c] = await Promise.all([recompensasApi.list(aud), recompensasApi.canjes()]);
      setItems(r.recompensas || []);
      setCanjes(c.canjes || []);
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
    finally     { setLoading(false); }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [aud]);

  /* Marcar un premio como entregado. La lista se actualiza aquí en vez de
     recargar: la respuesta trae el canje ya cambiado y recargar traería la
     misma lista con un viaje de más. */
  const marcarCanje = async (k, estado) => {
    if (!estado) return;
    try {
      const { recompensasApi } = await import('../../api/loyalty.js');
      await recompensasApi.marcarCanje(k.id, estado);
      setCanjes(l => l.map(x => (x.id === k.id ? { ...x, estado } : x)));
      success(estado === 'entregado' ? 'Premio entregado.' : `Canje marcado como ${estado}.`);
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
  };

  const crear = async (e) => {
    e.preventDefault();
    if (!form.titulo.trim() || !form.costo_puntos) return;
    setSaving(true);
    try {
      const { recompensasApi } = await import('../../api/loyalty.js');
      await recompensasApi.crear({ ...form, audiencia: aud });
      success('Recompensa creada.');
      setForm({ titulo: '', descripcion: '', costo_puntos: '', stock: '' });
      cargar();
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
    finally     { setSaving(false); }
  };

  const toggle = async (r) => {
    try {
      const { recompensasApi } = await import('../../api/loyalty.js');
      await recompensasApi.editar(r.id, { activo: !r.activo });
      cargar();
    } catch (e) { toastErr(e.message); }
  };
  const borrar = async (r) => {
    if (!(await confirmDialog({ message:(`¿Borrar "${r.titulo}"?`), danger:true }))) return;
    try {
      const { recompensasApi } = await import('../../api/loyalty.js');
      await recompensasApi.borrar(r.id);
      success('Borrada.'); cargar();
    } catch (e) { toastErr(e.message); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1 bg-surface-2 border border-border rounded-xl p-1 w-fit">
        {[['cliente', 'Para clientes'], ['empleado', 'Para el equipo']].map(([k, l]) => (
          <button key={k} onClick={() => setAud(k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${aud === k ? 'bg-surface-3 text-text-1' : 'text-text-3 hover:text-text-2'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-header"><h3 className="text-base font-semibold text-text-1">Nueva recompensa {aud === 'cliente' ? 'para clientes' : 'para el equipo'}</h3></div>
        <form onSubmit={crear} className="card-body grid sm:grid-cols-2 gap-3">
          <div className="field sm:col-span-2">
            <label className="label">Título</label>
            <input className="input rounded-2xl py-3" value={form.titulo}
              onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
              placeholder={aud === 'cliente' ? 'Ej. Entrada gratis al próximo evento' : 'Ej. Día libre'} required />
          </div>
          <div className="field sm:col-span-2">
            <label className="label">Descripción (opcional)</label>
            <input className="input rounded-2xl py-3" value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
          </div>
          <div className="field">
            <label className="label">Costo en puntos</label>
            <input type="number" min="1" className="input rounded-2xl py-3" value={form.costo_puntos}
              onChange={e => setForm(f => ({ ...f, costo_puntos: e.target.value }))} required />
          </div>
          <div className="field">
            <label className="label">Stock (vacío = ilimitado)</label>
            <input type="number" min="0" className="input rounded-2xl py-3" value={form.stock}
              onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" disabled={saving} className="btn-gradient">
              {saving ? <><Spinner size="sm" /> Creando...</> : 'Crear recompensa'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-header"><h3 className="text-sm font-semibold text-text-1">Recompensas {aud === 'cliente' ? 'de clientes' : 'del equipo'}</h3></div>
        <div className="card-body">
          {loading ? <Spinner size="md" /> : items.length === 0 ? (
            <p className="text-sm text-text-3 text-center py-4">Todavía no definiste recompensas.</p>
          ) : (
            <div className="space-y-2">
              {items.map(r => (
                <div key={r.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${r.activo ? 'border-border bg-surface-2/40' : 'border-border bg-surface/40 opacity-50'}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-1">{r.titulo}</p>
                    <p className="text-xs text-text-3">{r.costo_puntos} pts · {r.stock == null ? 'ilimitado' : `${r.canjeados}/${r.stock}`} · {r.canjeados} canjeados</p>
                  </div>
                  <button onClick={() => toggle(r)} className="btn-ghost btn-sm">{r.activo ? 'Pausar' : 'Activar'}</button>
                  <button onClick={() => borrar(r)} aria-label="Borrar"
                    className="w-8 h-8 rounded-lg text-text-3 hover:text-danger hover:bg-danger/10 flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {canjes.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="text-sm font-semibold text-text-1">Canjes recibidos</h3>
              {/* El estado se pintaba y no se podía cambiar: alguien llega con
                  su código, se lo entregas y la lista sigue diciendo
                  «pendiente» para siempre. Era el último paso del ciclo de
                  fidelidad y no tenía dónde darse. */}
              <p className="text-xs text-text-3 mt-0.5">Cuando entregues un premio, márcalo aquí.</p>
            </div>
          </div>
          <div className="card-body space-y-2">
            {canjes.map(k => (
              <div key={k.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-2/40 ${k.estado === 'cancelado' ? 'opacity-60' : ''}`}>
                <span className="text-sm text-text-1 flex-1 truncate">{k.usuario?.nombre || k.usuario?.email || 'Usuario'} · {k.titulo}</span>
                <code className="text-xs font-mono text-primary-light bg-primary/10 px-2 py-0.5 rounded">{k.codigo}</code>
                <select
                  value={['entregado', 'usado', 'cancelado'].includes(k.estado) ? k.estado : ''}
                  onChange={e => marcarCanje(k, e.target.value)}
                  aria-label={`Estado del canje ${k.codigo}`}
                  className="input text-xs py-1 px-2 w-32">
                  {/* El estado inicial lo pone el servidor al canjear y no es
                      ninguno de los tres que acepta el PATCH: se enseña como
                      está y no se puede volver a él, que es lo correcto. */}
                  <option value="" disabled>{k.estado}</option>
                  <option value="entregado">Entregado</option>
                  <option value="usado">Usado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────── Notificaciones Tab ──────────── */
export function NotificacionesTab() {
  const { success, error: toastErr } = useToast();
  const { supported, permission, subscribed, working, subscribe, unsubscribe, test } = usePush();

  const onActivar = async () => {
    try { await subscribe(); success('Notificaciones activadas en este dispositivo.'); }
    catch (e) { toastErr(e.response?.data?.error || e.message); }
  };
  const onDesactivar = async () => {
    try { await unsubscribe(); success('Notificaciones desactivadas.'); }
    catch (e) { toastErr(e.message); }
  };
  const onTest = async () => {
    try {
      const r = await test();
      if (r.enviadas > 0) success(`Push enviado a ${r.enviadas} dispositivo${r.enviadas === 1 ? '' : 's'}.`);
      else toastErr('No se pudo enviar (¿permitiste notificaciones?)');
    } catch (e) { toastErr(e.response?.data?.error || e.message); }
  };

  return (
    <div className="space-y-5">
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="text-base font-semibold text-text-1">Notificaciones push</h3>
            <p className="text-xs text-text-3 mt-0.5">Recibí avisos del navegador sin tener GESTEK abierto.</p>
          </div>
          {subscribed
            ? <span className="badge badge-green">Activas</span>
            : <span className="badge badge-gray">Inactivas</span>}
        </div>

        <div className="card-body space-y-4">
          {!supported && (
            <div className="rounded-2xl bg-warning/10 border border-warning/20 px-4 py-3 text-sm text-text-2">
              Tu navegador no soporta notificaciones push. Probá con Chrome, Edge, Firefox o Safari 16+.
            </div>
          )}

          {supported && permission === 'denied' && (
            <div className="rounded-2xl bg-danger/10 border border-danger/20 px-4 py-3 text-sm text-text-2">
              Bloqueaste las notificaciones para este sitio. Habilitalas desde la configuración del navegador (candado en la barra de URL) y volvé a intentar.
            </div>
          )}

          {supported && permission !== 'denied' && (
            <>
              <p className="text-sm text-text-2 leading-relaxed">
                {subscribed
                  ? 'Este dispositivo recibirá notificaciones. Podés activar otros (móvil, laptop) repitiendo el paso desde cada uno.'
                  : 'Activá notificaciones en este dispositivo. Si tenés otros, repetí el proceso desde cada uno.'}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                {!subscribed ? (
                  <button onClick={onActivar} disabled={working} className="btn-gradient">
                    {working ? <><Spinner size="sm" /> Activando...</> : 'Activar notificaciones'}
                  </button>
                ) : (
                  <>
                    <button onClick={onTest} disabled={working} className="btn-secondary btn-sm">
                      {working ? <Spinner size="sm" /> : null} Enviar push de prueba
                    </button>
                    <button onClick={onDesactivar} disabled={working} className="btn-ghost btn-sm text-danger/80 hover:text-danger">
                      Desactivar
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="text-sm font-semibold text-text-1">Cómo funciona</h3>
        </div>
        <ul className="card-body text-sm text-text-2 space-y-2 leading-relaxed list-disc pl-5">
          <li>Cada dispositivo (laptop, móvil, tablet) se suscribe por separado. Activalas en cada uno donde uses GESTEK.</li>
          <li>Si cerrás el navegador o reiniciás el dispositivo, las notificaciones siguen llegando.</li>
                  </ul>
      </div>
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-text-3 uppercase tracking-wider">{label}</span>
      <span className={`text-sm text-text-1 truncate ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

function UserIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
}
function PaintIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>;
}
function BellIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>;
}
function WalletIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2zm12 6h.01" /></svg>;
}
function CodeIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>;
}
