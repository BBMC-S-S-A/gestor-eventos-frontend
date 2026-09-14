import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { ConfirmHost } from './components/ui/Confirm.jsx';
import GLoader from './components/ui/GLoader.jsx';
import { pantallaInicial } from './lib/prefs.js';
import PublicLayout from './components/layout/PublicLayout.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import CommandPalette from './components/layout/CommandPalette.jsx';
import ErrorBoundary from './components/ui/ErrorBoundary.jsx';
import LandingHomePage from './pages/public/LandingHomePage.jsx';
import AuthPage from './pages/AuthPage.jsx';

const ComoFuncionaPage   = lazy(() => import('./pages/public/ComoFuncionaPage.jsx'));
const ProductoPage       = lazy(() => import('./pages/public/ProductoPage.jsx'));
const ExplorarPage       = lazy(() => import('./pages/public/ExplorarPage.jsx'));
const EventoPublicoPage  = lazy(() => import('./pages/public/EventoPublicoPage.jsx'));
const NetworkingPublicPage = lazy(() => import('./pages/public/NetworkingPublicPage.jsx'));
const RuedaPublicaPage    = lazy(() => import('./pages/public/RuedaPublicaPage.jsx'));
const TorneoPublicoPage  = lazy(() => import('./pages/public/TorneoPublicoPage.jsx'));
const TorneosResumenPage = lazy(() => import('./pages/public/TorneosResumenPage.jsx'));
const RankingPublicoPage = lazy(() => import('./pages/public/RankingPublicoPage.jsx'));
const MapaPublicoPage    = lazy(() => import('./pages/public/MapaPublicoPage.jsx'));
const AgendaPublicaPage  = lazy(() => import('./pages/public/AgendaPublicaPage.jsx'));
const LegalEventoPage    = lazy(() => import('./pages/public/LegalEventoPage.jsx'));
const MiTicketPage       = lazy(() => import('./pages/public/MiTicketPage.jsx'));
const AcreditarPage      = lazy(() => import('./pages/public/AcreditarPage.jsx'));
const VerificarBoletaPage = lazy(() => import('./pages/public/VerificarBoletaPage.jsx'));
const AutorizarPage = lazy(() => import('./pages/conectar/AutorizarPage.jsx'));
const EmbedPage          = lazy(() => import('./pages/public/EmbedPage.jsx'));
const ExpositorPage      = lazy(() => import('./pages/public/ExpositorPage.jsx'));
const EquipoTorneoPage   = lazy(() => import('./pages/public/EquipoTorneoPage.jsx'));
const FAQPage            = lazy(() => import('./pages/public/FAQPage.jsx'));
const PrivacidadPage     = lazy(() => import('./pages/public/PrivacidadPage.jsx'));
const TerminosPage       = lazy(() => import('./pages/public/TerminosPage.jsx'));
const RecuperarPage      = lazy(() => import('./pages/RecuperarPage.jsx'));
const ResetPasswordPage  = lazy(() => import('./pages/ResetPasswordPage.jsx'));
const ConfirmarPage      = lazy(() => import('./pages/ConfirmarPage.jsx'));
const CompletarPerfilPage= lazy(() => import('./pages/CompletarPerfilPage.jsx'));
const InicioPage         = lazy(() => import('./pages/inicio/InicioPage.jsx'));
const EventsListPage     = lazy(() => import('./pages/events/EventsListPage.jsx'));
const EventCreatePage    = lazy(() => import('./pages/events/EventCreatePage.jsx'));
const EventWorkspace     = lazy(() => import('./pages/events/workspace/EventWorkspace.jsx'));
const EventEditPage      = lazy(() => import('./pages/events/EventEditPage.jsx'));
const SettingsPage       = lazy(() => import('./pages/settings/SettingsPage.jsx'));
const AjustesPage        = lazy(() => import('./pages/ajustes/AjustesPage.jsx'));
const GestbotPage        = lazy(() => import('./pages/agente/GestbotPage.jsx'));
const ChatHubPage        = lazy(() => import('./pages/chat/ChatHubPage.jsx'));
const NotificacionesPage = lazy(() => import('./pages/settings/NotificacionesPage.jsx'));
const RecompensasPage    = lazy(() => import('./pages/settings/RecompensasPage.jsx'));
const MiEspacioPage      = lazy(() => import('./pages/espacio/MiEspacioPage.jsx'));
const MisBoletasPage     = lazy(() => import('./pages/settings/MisBoletasPage.jsx'));

function AuthLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <GLoader size="lg" />
    </div>
  );
}

function PrivateRoute({ children, allowIncomplete = false }) {
  const { token, loading, usuario } = useAuth();
  const location = useLocation();
  const { pathname } = location;
  if (loading) return <AuthLoader />;
  if (!token) {
    return <Navigate to="/login" replace state={{ from: pathname }} />;
  }
  if (!allowIncomplete && usuario && !usuario.perfilCompleto && pathname !== '/completar-perfil') {
    return <Navigate to="/completar-perfil" replace state={{ from: pathname }} />;
  }
  return children;
}

function PublicOnlyRoute({ children }) {
  const { token, loading, usuario } = useAuth();
  if (loading) return <AuthLoader />;
  if (!token) return children;
  if (usuario && !usuario.perfilCompleto) return <Navigate to="/completar-perfil" replace />;
  return <Navigate to={pantallaInicial(usuario?.id)} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <ErrorBoundary>
          <Suspense fallback={<AuthLoader />}>
            <Routes>
              <Route element={<PublicLayout />}>
                {/* La raíz manda al panel si ya hay sesión.
                    Sin esto, quien vuelve a la pestaña o abre el dominio a
                    secas aterrizaba en la página de marketing —«qué es
                    GESTEK»— estando dentro de su propia cuenta, y sólo
                    entraba al panel si pulsaba «Iniciar sesión», que es lo
                    único que tenía este guard. Se veía como si la sesión no
                    contara. */}
                <Route path="/"                  element={<PublicOnlyRoute><LandingHomePage /></PublicOnlyRoute>} />
                <Route path="/como-funciona"     element={<ComoFuncionaPage />} />
                <Route path="/producto"          element={<ProductoPage />} />
                <Route path="/explorar"          element={<ExplorarPage />} />
                <Route path="/explorar/:slug"    element={<EventoPublicoPage />} />
                {/* La rueda SIN sesión: quién recibe, en qué mesa y qué horas
                    quedan. `/networking` sigue siendo la de dentro, donde quien
                    tiene boleta reserva. Son dos públicos distintos y por eso
                    son dos rutas. */}
                <Route path="/explorar/:slug/rueda" element={<RuedaPublicaPage />} />
                <Route path="/explorar/:slug/networking" element={<NetworkingPublicPage />} />
                <Route path="/explorar/:slug/torneo" element={<TorneoPublicoPage />} />
                <Route path="/explorar/:slug/torneos" element={<TorneosResumenPage />} />
                <Route path="/explorar/:slug/ranking" element={<RankingPublicoPage />} />
                <Route path="/explorar/:slug/agenda" element={<AgendaPublicaPage />} />
                <Route path="/explorar/:slug/mapa"   element={<MapaPublicoPage />} />
                {/* Faltaba, y sin ella el bloque de consentimiento del checkout
                    enlazaba a una ruta inexistente: quien pulsaba «léelos»
                    acababa en la portada. Aceptar unas condiciones que no se
                    pueden leer no es aceptar nada. */}
                <Route path="/explorar/:slug/legal"  element={<LegalEventoPage />} />
                <Route path="/mi-ticket/:codigo" element={<MiTicketPage />} />
                {/* Quién entra con esta boleta: los nombres de una mesa, o la
                    cuadrilla que monta un stand (0118/0127). Sin cuenta — esa
                    gente no tiene usuario en la plataforma. */}
                <Route path="/acreditar/:codigo" element={<AcreditarPage />} />
                {/* «¿Esta boleta es real?», para quien la está COMPRANDO a otra
                    persona. Ruta aparte de /mi-ticket a propósito: aquélla
                    enseña el QR, y enseñárselo a quien no ha pagado sería
                    regalarle la entrada. Con y sin código: quien llega desde
                    un chat trae el código; quien llega desde el pie de página,
                    no. */}
                <Route path="/verificar" element={<VerificarBoletaPage />} />
                <Route path="/verificar/:codigo" element={<VerificarBoletaPage />} />
                {/* Consentimiento del conector OAuth. Publica a proposito: se
                    llega desde Claude sin sesion, y la propia pantalla manda a
                    entrar guardando a donde volver. */}
                <Route path="/conectar/autorizar" element={<AutorizarPage />} />
                <Route path="/expositor/:codigo"  element={<ExpositorPage />} />
                {/* El capitán de un equipo, con el código de su boleta de
                    inscripción. Mismo patrón que el expositor. */}
                <Route path="/equipo/:codigo"     element={<EquipoTorneoPage />} />
                  <Route path="/faq"               element={<FAQPage />} />
                <Route path="/privacidad"        element={<PrivacidadPage />} />
                <Route path="/terminos"          element={<TerminosPage />} />
              </Route>

              {/* iFrame: una sección suelta para incrustar en otra web.
                  Fuera de PublicLayout a propósito — sin navbar ni footer. */}
              <Route path="/embed/:slug/:seccion" element={<EmbedPage />} />

              <Route path="/login"    element={<PublicOnlyRoute><AuthPage /></PublicOnlyRoute>} />
              <Route path="/register" element={<PublicOnlyRoute><AuthPage /></PublicOnlyRoute>} />
              <Route path="/acceder"  element={<Navigate to="/login" replace />} />
              <Route path="/recuperar"        element={<RecuperarPage />} />
              <Route path="/restablecer"      element={<ResetPasswordPage />} />
              <Route path="/confirmar"        element={<ConfirmarPage />} />
              <Route path="/completar-perfil" element={<PrivateRoute allowIncomplete><CompletarPerfilPage /></PrivateRoute>} />

              {/* Workspace del evento: contexto completo con sidebar propio */}
              <Route path="/eventos/:id" element={<PrivateRoute><EventWorkspace /></PrivateRoute>} />

              <Route element={<PrivateRoute><AppLayout /></PrivateRoute>}>
                <Route path="/inicio"             element={<InicioPage />} />
                <Route path="/eventos"            element={<EventsListPage />} />
                <Route path="/eventos/nuevo"      element={<EventCreatePage />} />
                <Route path="/eventos/:id/editar" element={<EventEditPage />} />
                <Route path="/mi-espacio"         element={<MiEspacioPage />} />
                <Route path="/vacantes"           element={<Navigate to="/app/explorar?ver=vacantes" replace />} />
                <Route path="/mis-postulaciones"  element={<Navigate to="/mi-espacio?tab=postulaciones" replace />} />
                <Route path="/ajustes"            element={<AjustesPage />} />
                <Route path="/app/explorar"       element={<ExplorarPage />} />
                <Route path="/app/explorar/:slug" element={<EventoPublicoPage />} />
                <Route path="/mis-boletas"        element={<MisBoletasPage />} />
                <Route path="/gestbot"            element={<GestbotPage />} />
                <Route path="/chat"               element={<ChatHubPage />} />
                <Route path="/notificaciones"     element={<NotificacionesPage />} />
                <Route path="/recompensas"        element={<RecompensasPage />} />
                {/* Rutas legadas → nueva estructura del rework */}
                <Route path="/dashboard"          element={<Navigate to="/inicio" replace />} />
                <Route path="/mi-trabajo"         element={<Navigate to="/mi-espacio" replace />} />
                <Route path="/configuracion"      element={<Navigate to="/ajustes" replace />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          </ErrorBoundary>
          <CommandPalette />
          <ConfirmHost />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
