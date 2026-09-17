import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { I18nProvider } from './context/I18nContext.jsx';
import { intentarRecuperarDeAssetViejo } from './lib/assetsViejos.js';

/* Cuando un `import()` dinámico falla al traer su chunk —el mismo síntoma de
   fondo que documenta assetsViejos.js: un service worker viejo sirviendo
   archivos que ya no coinciden con la build actual— Vite dispara este evento
   en vez de dejar que el error rompa quién sabe qué a medio camino. Es el
   único de los dos casos (el otro es el `ReferenceError` que cachea
   ErrorBoundary) que nunca llega a React. */
window.addEventListener('vite:preloadError', (evento) => {
  if (intentarRecuperarDeAssetViejo(evento.payload)) evento.preventDefault();
});

/* El service worker de vite-plugin-pwa, con `registerType: 'autoUpdate'`.
 *
 * ── Por qué hay un temporizador aquí ────────────────────────────────
 *
 * `autoUpdate` recoge la versión nueva **cuando el navegador vuelve a pedir el
 * service worker**, y eso pasa al abrir la página otra vez. Una pestaña que se
 * queda abierta —el panel del organizador, que se deja puesto todo el día— se
 * puede quedar semanas con el paquete viejo: se despliega un arreglo, la
 * persona recarga con F5, el service worker le sirve lo que tenía guardado y
 * jura que el arreglo no llegó.
 *
 * Pasó hoy, y costó una hora de mirar el sitio equivocado.
 *
 * Con esto, la pestaña pregunta cada media hora si hay algo nuevo. No
 * interrumpe: `autoUpdate` cambia el paquete por debajo y la siguiente
 * navegación ya es la nueva. */
const MEDIA_HORA = 30 * 60 * 1000;

/* ── Y por qué además se AVISA ───────────────────────────────────────
 *
 * El temporizador de arriba arregla que la pestaña se entere. No arregla lo
 * otro: que quien la tiene abierta no sabe que hay algo nuevo, así que sigue
 * mirando la versión de antes y reportando fallos ya arreglados.
 *
 * Pasó cuatro veces en un solo día. Se despliega un arreglo, la persona
 * recarga con F5 —que no basta: el service worker sirve lo que tiene
 * guardado—, ve el fallo, y lo reporta. Y quien lo arregló se pone a buscar en
 * el sitio equivocado.
 *
 * `onNeedRefresh` se dispara cuando el service worker nuevo ya está instalado
 * y esperando. Un aviso discreto con un botón convierte media hora de
 * confusión en un clic. No se recarga solo a propósito: puede haber un
 * formulario a medias, o la cola de escaneos de la puerta abierta, y perder
 * eso por una versión nueva es peor que la versión vieja. */
/* Dónde NO se avisa: la parte pública, que es de marca blanca.
 *
 * El aviso es para quien OPERA —el equipo en la puerta, quien organiza—, que
 * es quien se beneficia de saber que hay algo nuevo. Quien llega a rellenar un
 * formulario no despliega nada: para esa persona el aviso no es útil, es una
 * caja que le tapa el formulario a mitad de escribir.
 *
 * Y sobre todo: esas páginas llevan la marca del organizador, no la nuestra.
 * Un cartel de la plataforma asomando en la web de otro rompe justo lo que se
 * vende. Por eso el texto tampoco nombra ya a nadie: si algún día se enseña
 * donde no toca, al menos no dirá de quién es. */
const RUTAS_PUBLICAS = [
  '/explorar', '/mi-ticket', '/acreditar', '/verificar', '/expositor', '/equipo',
];
const enParteBlanca = () => {
  const p = location.pathname;
  return RUTAS_PUBLICAS.some(r => p === r || p.startsWith(r + '/'));
};

function avisarDeVersionNueva(actualizar) {
  if (enParteBlanca()) return;
  if (document.getElementById('gestek-version-nueva')) return;

  const caja = document.createElement('div');
  caja.id = 'gestek-version-nueva';
  caja.setAttribute('role', 'status');
  /* Estilos en línea y no clases: esto tiene que poder salir aunque la hoja de
     estilos sea de la versión vieja, que es exactamente el caso. */
  caja.style.cssText = [
    'position:fixed', 'z-index:2147483647', 'left:50%', 'bottom:20px',
    'transform:translateX(-50%)', 'display:flex', 'align-items:center', 'gap:12px',
    'padding:10px 14px', 'border-radius:14px',
    'background:#1B1811', 'color:#F5F0E6', 'border:1px solid rgba(255,244,214,.18)',
    'box-shadow:0 10px 30px rgba(0,0,0,.35)',
    'font:500 13px/1.3 system-ui,sans-serif', 'max-width:calc(100vw - 32px)',
  ].join(';');

  const texto = document.createElement('span');
  texto.textContent = 'Hay una versión nueva.';
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.textContent = 'Actualizar';
  boton.style.cssText = [
    'cursor:pointer', 'border:0', 'border-radius:10px', 'padding:6px 12px',
    'background:#C9A227', 'color:#12100B', 'font:600 13px system-ui,sans-serif',
  ].join(';');
  boton.onclick = () => { boton.textContent = 'Actualizando…'; actualizar(true); };

  const cerrar = document.createElement('button');
  cerrar.type = 'button';
  cerrar.setAttribute('aria-label', 'Ahora no');
  cerrar.textContent = '×';
  cerrar.style.cssText = 'cursor:pointer;border:0;background:transparent;color:inherit;font-size:18px;line-height:1;opacity:.6';
  /* Se puede posponer: quien está en la puerta escaneando no quiere una
     recarga a mitad de la fila. Vuelve a salir en la siguiente comprobación. */
  cerrar.onclick = () => caja.remove();

  caja.append(texto, boton, cerrar);
  document.body.appendChild(caja);
}

if ('serviceWorker' in navigator) {
  const actualizar = registerSW({
    immediate: true,
    onNeedRefresh() { avisarDeVersionNueva(actualizar); },
    onRegisteredSW(_url, registro) {
      if (!registro) return;
      setInterval(() => {
        /* Sin conexión, `update()` rechaza; no es un fallo que merezca ruido en
           la consola de quien está trabajando. */
        registro.update().catch(() => {});
      }, MEDIA_HORA);
    },
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>
);
