import { Component } from 'react';
import { tEstatico as t } from '../../context/I18nContext.jsx';
import { intentarRecuperarDeAssetViejo } from '../../lib/assetsViejos.js';

/* Red de seguridad: si un componente hijo lanza un error en render, en vez de
   dejar TODA la app en blanco, mostramos un mensaje y el resto sigue usable.
   - Úsala global (App) y alrededor del contenido de cada sección (workspace).
   - Pásale una `key` que cambie al navegar (ej. sección+tab) para que se
     resetee sola al ir a una parte que sí funciona. */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    /* Log para diagnóstico (y para Sentry si algún día se conecta). */
    console.error('[ErrorBoundary]', error, info?.componentStack);

    /* Si esto tiene pinta de ser un chunk viejo servido por un service
       worker desincronizado (ver src/lib/assetsViejos.js), se limpia y se
       recarga sola — quien estaba mirando esta pantalla no llega a ver el
       mensaje de error. Si ya se intentó hace poco y volvió a pasar, no es
       esto: se sigue de largo y se muestra la pantalla de abajo. */
    intentarRecuperarDeAssetViejo(error);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.compact) {
      return (
        <div className="rounded-3xl border border-danger/30 bg-danger/5 px-6 py-10 text-center">
          <p className="text-sm font-semibold text-text-1 mb-1">{t('Esta sección tuvo un problema')}</p>
          <p className="text-xs text-text-3 mb-4 max-w-md mx-auto">{t('Ya lo registramos. Puedes cambiar de sección y volver, o recargar.')}</p>
          <p className="text-[11px] font-mono text-danger/80 mb-4 break-words max-w-lg mx-auto">{String(error?.message || error)}</p>
          <div className="flex items-center justify-center gap-2">
            <button onClick={this.reset} className="btn-secondary btn-sm">{t('Reintentar')}</button>
            <button onClick={() => window.location.reload()} className="btn-ghost btn-sm">{t('Recargar')}</button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-6">
        <div className="max-w-md text-center">
          <div className="w-14 h-14 rounded-2xl bg-danger/15 text-danger flex items-center justify-center text-2xl font-bold mx-auto mb-4">!</div>
          <h1 className="text-xl font-bold font-display text-text-1 mb-2">{t('Algo se rompió')}</h1>
          <p className="text-sm text-text-2 mb-1">{t('La app tuvo un error inesperado. Ya quedó registrado.')}</p>
          <p className="text-[11px] font-mono text-danger/80 my-4 break-words">{String(error?.message || error)}</p>
          <div className="flex items-center justify-center gap-2">
            <button onClick={() => window.location.reload()} className="btn-primary btn-sm">{t('Recargar')}</button>
            <a href="/inicio" className="btn-secondary btn-sm">{t('Ir al inicio')}</a>
          </div>
        </div>
      </div>
    );
  }
}
