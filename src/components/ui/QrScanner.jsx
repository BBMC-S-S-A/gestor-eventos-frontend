import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

/* Escáner de QR con cámara, a pantalla completa.
   Extraído de CheckinTab para que lo usen también los stands: la misma
   escarapela se escanea en la puerta (check-in) y en cada stand (motivos).

   `overlay` es lo que se pinta flotando sobre la cámara tras cada lectura
   (cada pantalla muestra lo suyo). `containerId` debe ser único si llegara a
   haber dos escáneres montados a la vez. */
export default function QrScanner({
  onScan,
  overlay = null,
  titulo = 'Escaneando... apunta al QR',
  textoActivar = 'Activar cámara',
  descripcion = 'Se abrirá la cámara a pantalla completa para apuntar al QR del asistente. Tu navegador pedirá permisos la primera vez.',
  containerId = 'qr-reader',
}) {
  const scannerRef = useRef(null);
  const [active, setActive] = useState(false);
  const [err, setErr] = useState('');
  const lastScanRef = useRef({ value: '', at: 0 });

  /* onScan vive en un ref: así el efecto de la cámara no la lleva como
     dependencia y no se reinicia (ni se duplica el vídeo) en cada render
     del padre. */
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  /* Sin scroll de fondo mientras la cámara ocupa la pantalla. */
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let cancelado = false;
    /* Sólo QR, y con el detector nativo del navegador cuando lo hay: es mucho
       mejor que el de JavaScript con códigos pequeños. */
    const scanner = new Html5Qrcode(containerId, {
      verbose: false,
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    });
    scannerRef.current = scanner;

    const alLeer = (decoded) => {
      /* Dedupe: ignora el mismo código dentro de 3 segundos. */
      const now = Date.now();
      if (lastScanRef.current.value === decoded && now - lastScanRef.current.at < 3000) return;
      lastScanRef.current = { value: decoded, at: now };
      onScanRef.current?.(decoded);
    };

    /* ── Por qué se pide resolución y enfoque ─────────────────────────────
     *
     * Con `aspectRatio: 1` y sin restricciones el navegador abría la cámara a
     * su resolución más baja. Un QR de escarapela grande se leía igual, pero
     * el de una etiqueta pequeña —el del código corto, ~18 mm— ocupaba tan
     * pocos píxeles que la cámara «no reaccionaba»: la imagen de la etiqueta
     * se decodifica bien, lo que no llegaba era el detalle. */
    const configBuena = {
      fps: 15,
      qrbox: calcularQrBox(),
      videoConstraints: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        advanced: [{ focusMode: 'continuous' }],
      },
    };
    const configSencilla = { fps: 10, qrbox: calcularQrBox() };

    scanner.start({ facingMode: 'environment' }, configBuena, alLeer, () => {})
      /* Hay móviles que rechazan las restricciones: se abre como antes antes
         que dejar la puerta sin cámara. */
      .catch(() => cancelado ? null
        : scanner.start({ facingMode: 'environment' }, configSencilla, alLeer, () => {}))
      .catch(e => { if (!cancelado) setErr(e.message || 'No se pudo iniciar la cámara.'); });

    return () => {
      cancelado = true;
      try {
        scanner.stop().then(() => scanner.clear()).catch(() => {
          try { scanner.clear(); } catch { /* noop */ }
        });
      } catch { /* noop */ }
    };
  }, [active, containerId]);

  if (!active) return (
    <div className="rounded-3xl border border-border bg-surface/40 p-10 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-surface-2 border border-border mb-4">
        <CameraIcon />
      </div>
      <h3 className="text-lg font-bold font-display text-text-1 mb-2">{textoActivar}</h3>
      <p className="text-sm text-text-2 max-w-sm mx-auto mb-5">{descripcion}</p>
      <button onClick={() => { setErr(''); setActive(true); }} className="btn-gradient">{textoActivar}</button>
      {err && <p className="text-sm text-danger mt-4">{err}</p>}
    </div>
  );

  /* Pantalla completa por portal al body: escapa de ancestros con transform
     que romperían el position:fixed. */
  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col animate-[fadeIn_0.2s_ease_both]">
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] bg-gradient-to-b from-black/70 to-transparent">
        <span className="text-sm text-white/90 font-medium">{titulo}</span>
        <button onClick={() => setActive(false)} aria-label="Cerrar cámara"
          className="w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center backdrop-blur-md active:scale-95 transition-all">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div id={containerId} className="flex-1 w-full h-full [&>video]:!w-full [&>video]:!h-full [&>video]:!object-cover" />

      {err && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/90 px-6">
          <div className="text-center max-w-sm">
            <p className="text-base text-danger mb-4">{err}</p>
            <button onClick={() => { setErr(''); setActive(false); }} className="btn-secondary btn-sm">Volver</button>
          </div>
        </div>
      )}

      {overlay && (
        <div className="absolute bottom-0 left-0 right-0 z-20 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {overlay}
        </div>
      )}
    </div>,
    document.body
  );
}

function calcularQrBox() {
  if (typeof window === 'undefined') return { width: 280, height: 280 };
  const ladoCorto = Math.min(window.innerWidth, window.innerHeight);
  const tamano = Math.max(240, Math.min(Math.round(ladoCorto * 0.8), 420));
  return { width: tamano, height: tamano };
}

function CameraIcon() {
  return <svg className="w-7 h-7 text-text-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>;
}
