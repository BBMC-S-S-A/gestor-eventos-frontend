import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { auth, authConfigurado, authRedirect, AUTH_PROPIA } from '../lib/sesion.js';
import { API } from '../lib/apiUrl.js';

const AuthContext = createContext(null);

/* ── Bypass de login para desarrollo local ─────────────────────────
   Activo ÚNICAMENTE cuando corre `npm run dev` (import.meta.env.DEV)
   y en .env.local está VITE_DEV_BYPASS_AUTH=1. Nunca aplica en builds
   de producción. Entra con un usuario ficticio admin; las llamadas al
   backend fallarán en silencio si exigen JWT real. */
export const DEV_BYPASS = import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === '1';

const DEV_USER = {
  id: '00000000-0000-4000-8000-000000000dev',
  email: 'dev@gestek.local',
  nombre: 'Dev Local',
  rol: 'admin_global',
  foto: null,
  perfilCompleto: true,
  permisos: ['*'],
  emailConfirmado: true,
  modoActivo: 'organizador',
  empresa: 'GESTEK Dev',
  raw: { user_metadata: {}, last_sign_in_at: new Date().toISOString() },
};

/* Antes tenía su propio plan B —el dominio de producción— mientras los otros
   cuatro sitios caían a localhost. Un build sin la variable dejaba el login
   hablando con produccion y el resto con una maquina que no existe. */
const API_URL = API;

/* Convierte un user de Supabase + metadata en el shape que usa el resto de la app.
   Incluye los nombres de campo que envía Google OAuth (full_name, name, picture, avatar_url). */
function mapUser(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  return {
    id     : user.id,
    email  : user.email,
    nombre : meta.nombre || meta.full_name || meta.name || user.email,
    rol    : meta.rol    || 'organizador',
    foto   : meta.foto   || meta.avatar_url || meta.picture || null,
    ocupacion: meta.ocupacion || null,
    empresa  : meta.empresa   || null,
    ciudad   : meta.ciudad    || null,
    telefono : meta.telefono  || null,
    contexto : meta.contexto  || null,
    participantes: meta.participantes || null,
    perfilCompleto: meta.perfil_completo === true,
    permisos : meta.permisos  || [],
    emailConfirmado: Boolean(user.email_confirmed_at),
    /* Modo activo del dashboard: 'organizador' (crea/gestiona eventos) o
       'asistente' (solo explora y compra boletas) — como Airbnb Huésped/Anfitrión.
       No afecta permisos de seguridad, solo qué vista se muestra. */
    modoActivo: meta.modo_activo || 'organizador',
    raw    : user,
  };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(DEV_BYPASS ? { access_token: 'dev-bypass' } : null);
  const [usuario, setUsuario] = useState(DEV_BYPASS ? DEV_USER : null);
  const [loading, setLoading] = useState(!DEV_BYPASS);
  /* Info de la invitación recién vinculada (si aplica): { eventoId, rol, eventoTitulo }.
     Se llena UNA vez, justo después de confirmar sesión, y se consume (limpia)
     cuando alguna pantalla la usa para redirigir/mostrar el mensaje. */
  const [invitacionInfo, setInvitacionInfo] = useState(null);
  const [invitacionLoading, setInvitacionLoading] = useState(false);
  const vinculacionHecha = useRef(false);

  /* Reclama invitaciones pendientes del email actual. Se llama automáticamente
     una sola vez por sesión iniciada (login, registro o Google). */
  const vincularInvitacionesPendientes = useCallback(async (accessToken) => {
    if (!accessToken) return;
    setInvitacionLoading(true);
    try {
      const resp = await fetch(`${API_URL}/eventos/vincular-invitaciones`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (data?.invitaciones?.length) {
        setInvitacionInfo(data.invitaciones[0]);
        /* La lista de "Mis eventos" ya pidió sus datos al montar, en paralelo
           con esta vinculación — puede haber terminado ANTES de que la
           invitación pasara a 'active', y entonces se queda mostrando "0
           eventos" hasta que alguien recargue a mano. Este aviso es lo que le
           dice que vuelva a pedirlos ahora que sí hay algo nuevo que ver. */
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gestek:refrescar-eventos'));
        }
      }
    } catch (e) {
      console.warn('[auth] vincularInvitacionesPendientes falló:', e.message);
    } finally {
      setInvitacionLoading(false);
    }
  }, []);

  /* Consulta pública (sin sesión) si un email tiene una invitación pendiente.
     Se usa SOLO desde el formulario de registro (antes de tener cuenta/sesión),
     donde no hay riesgo de condición de carrera con la vinculación automática.

     Por POST y no por GET: el correo iba en la query string y quedaba escrito
     en los logs de acceso del servidor y en el historial del navegador. El
     servidor además limita este endpoint, porque contesta sobre datos de otros;
     si responde 429 se trata como "no invitado", que es lo que ya se hacía con
     cualquier fallo — el registro sigue adelante igual. */
  const checkInvitacionPendiente = useCallback(async (email) => {
    if (!email || !email.includes('@')) return { invitado: false };
    try {
      const resp = await fetch(`${API_URL}/eventos/publicos/invitacion-pendiente`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ email: email.toLowerCase().trim() }),
      });
      if (!resp.ok) return { invitado: false };
      return await resp.json();
    } catch {
      return { invitado: false };
    }
  }, []);

  /* Consume (limpia) la info de invitación guardada, para no repetirla
     en navegaciones futuras dentro de la misma sesión. */
  const consumirInvitacionInfo = useCallback(() => {
    setInvitacionInfo(prev => {
      if (prev) setTimeout(() => setInvitacionInfo(null), 0);
      return prev;
    });
    return invitacionInfo;
  }, [invitacionInfo]);

  /* Inicializar: recoger la sesión que deja el proveedor al volver de OAuth, y
     luego leer la que hubiera guardada y suscribirse a los cambios.

     Cada backend la entrega de una forma y por eso hay dos ramas:
     · Supabase vuelve con ?code= en la query y hay que canjearlo.
     · El nuestro vuelve con los tokens en el fragmento (#), que no llega al
       servidor ni a sus logs; sólo hay que recogerlos y limpiar la barra. */
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        if (typeof window !== 'undefined') {
          if (AUTH_PROPIA) {
            await auth.recogerSesionDeUrl();
          } else {
            const url = new URL(window.location.href);
            const code = url.searchParams.get('code');
            if (code) {
              await auth.exchangeCodeForSession(window.location.href);
              /* Limpia ?code y ?state del URL sin recargar */
              url.searchParams.delete('code');
              url.searchParams.delete('state');
              window.history.replaceState({}, document.title, url.pathname + (url.search || '') + url.hash);
            }
          }
        }
      } catch (e) {
        console.warn('[auth] no se pudo recoger la sesión del proveedor:', e?.message || e);
      }

      if (DEV_BYPASS) { setLoading(false); return; }
      const { data } = await auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);
      setUsuario(mapUser(data.session?.user));
      setLoading(false);

      if (data.session?.access_token && !vinculacionHecha.current) {
        vinculacionHecha.current = true;
        await vincularInvitacionesPendientes(data.session.access_token);
      }
    })();

    const { data: sub } = auth.onAuthStateChange(async (_event, sess) => {
      if (DEV_BYPASS) return;
      setSession(sess ?? null);
      setUsuario(mapUser(sess?.user));
      if (sess?.access_token && !vinculacionHecha.current) {
        vinculacionHecha.current = true;
        await vincularInvitacionesPendientes(sess.access_token);
      }
      if (!sess) vinculacionHecha.current = false;
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [vincularInvitacionesPendientes]);

  const login = useCallback(async (email, password) => {
    if (!authConfigurado) return { ok: false, error: 'El servicio de identidad no está configurado.' };
    const { data, error } = await auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: traducirError(error.message) };
    return { ok: true, data };
  }, []);

  const register = useCallback(async (fields) => {
    if (!authConfigurado) return { ok: false, error: 'El servicio de identidad no está configurado.' };
    const { nombre, email, password, ...metadata } = fields;
    const { data, error } = await auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: authRedirect('/confirmar'),
        data: {
          nombre,
          rol: 'organizador',
          perfil_completo: true,
          ...metadata,
        },
      },
    });
    if (error) return { ok: false, error: traducirError(error.message) };
    return { ok: true, data, requiresConfirmation: !data.session };
  }, []);

  const logout = useCallback(async () => {
    await auth.signOut();
    setSession(null);
    setUsuario(null);
    setInvitacionInfo(null);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!authConfigurado) return { ok: false, error: 'El servicio de identidad no está configurado.' };
    const { error } = await auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authRedirect('/inicio') },
    });
    if (error) return { ok: false, error: traducirError(error.message) };
    return { ok: true };
  }, []);

  const resetPassword = useCallback(async (email) => {
    if (!authConfigurado) return { ok: false, error: 'El servicio de identidad no está configurado.' };
    const { error } = await auth.resetPasswordForEmail(email, {
      redirectTo: authRedirect('/restablecer'),
    });
    if (error) return { ok: false, error: traducirError(error.message) };
    return { ok: true };
  }, []);

  const updatePassword = useCallback(async (newPassword) => {
    const { error } = await auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: traducirError(error.message) };
    return { ok: true };
  }, []);

  const updateProfile = useCallback(async (metadata) => {
    const { data, error } = await auth.updateUser({ data: metadata });
    if (error) return { ok: false, error: traducirError(error.message) };
    setUsuario(mapUser(data.user));
    return { ok: true };
  }, []);

  /* Cambia el modo activo del dashboard (organizador/asistente) y lo persiste
     en los metadatos del usuario, para que se recuerde entre sesiones. */
  const cambiarModo = useCallback(async (modo) => {
    if (modo !== 'organizador' && modo !== 'asistente') return { ok: false, error: 'Modo inválido.' };
    return updateProfile({ modo_activo: modo });
  }, [updateProfile]);

  const resendConfirmation = useCallback(async (email) => {
    const { error } = await auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: authRedirect('/confirmar') },
    });
    if (error) return { ok: false, error: traducirError(error.message) };
    return { ok: true };
  }, []);

  const hasPermiso = useCallback((permiso) => {
    if (!usuario) return false;
    if (usuario.rol === 'admin_global') return true;
    const permisosRol = {
      admin_global: ['eventos:crear','eventos:editar','eventos:eliminar','eventos:publicar','usuarios:ver','usuarios:editar','usuarios:eliminar','usuarios:asignar_rol','notificaciones:ver'],
      organizador : ['eventos:crear','eventos:editar','eventos:eliminar','eventos:publicar'],
      asistente   : [],
    };
    const base = permisosRol[usuario.rol] || [];
    const extra = usuario.permisos || [];
    return [...base, ...extra].includes(permiso);
  }, [usuario]);

  const hasRol = useCallback((rol) => usuario?.rol === rol, [usuario]);

  const token = session?.access_token || null;

  return (
    <AuthContext.Provider value={{
      token, session, usuario, loading,
      login, register, logout, signInWithGoogle,
      resetPassword, updatePassword, updateProfile, resendConfirmation,
      hasPermiso, hasRol, cambiarModo,
      invitacionInfo, invitacionLoading, consumirInvitacionInfo, checkInvitacionPendiente,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};

/* Traduce errores comunes de Supabase a español */
function traducirError(msg) {
  if (!msg) return 'Error desconocido';
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials'))     return 'Email o contraseña incorrectos.';
  if (m.includes('email not confirmed'))            return 'Confirma tu correo antes de iniciar sesión.';
  if (m.includes('user already registered'))        return 'Ya existe una cuenta con ese email.';
  if (m.includes('password should be at least'))    return 'La contraseña debe tener al menos 8 caracteres.';
  if (m.includes('email rate limit exceeded'))      return 'Demasiados intentos. Espera unos minutos.';
  if (m.includes('over email send rate limit'))     return 'Demasiados correos enviados. Espera unos minutos.';
  if (m.includes('invalid email'))                  return 'Email inválido.';
  if (m.includes('signup is disabled'))              return 'El registro está deshabilitado temporalmente.';
  if (m.includes('token has expired'))               return 'El enlace expiró. Solicita uno nuevo.';
  return msg;
}
