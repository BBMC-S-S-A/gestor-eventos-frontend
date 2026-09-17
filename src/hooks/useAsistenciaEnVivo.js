import { useState, useEffect, useCallback } from 'react';
import { clientesApi } from '../api/clientes.js';
import { useSondeo } from './useSondeo.js';

/**
 * Cuenta en vivo de asistentes que ya ingresaron (check-in hecho) para un
 * evento.
 *
 * ── Antes iba por Supabase Realtime ──────────────────────────────────────
 *
 * Abría un WebSocket permanente a Supabase (`supabase.channel('asistencia:…')`)
 * que manda un latido cada pocos segundos aunque nadie mire la pantalla: con
 * cinco portátiles de la organización abiertos, ~100 peticiones cada 10 minutos
 * sin que pase nada. Y para un contador de aforo el tiempo real no aporta —que
 * el número llegue con 10 segundos de retraso no lo nota nadie.
 *
 * Ahora es sondeo (`useSondeo`), que ya trae lo que hacía falta: se PARA cuando
 * la pestaña no se ve y se refresca al volver, y no encadena peticiones si el
 * servidor va lento. Una pestaña de fondo pasa a coste cero.
 *
 * Es el paso que MIGRACION-SUPABASE.md §6 (etapa 5) daba por bueno: asistencia y
 * notificaciones se hacen con sondeo; el único que se queda en tiempo real es el
 * chat.
 *
 * `bumpOptimista` sigue existiendo: lo usa CheckinTab para que el operador vea su
 * propio escaneo al instante, sin esperar al siguiente pulso.
 */
export function useAsistenciaEnVivo(eventoId, { cadaMs = 12000 } = {}) {
  const [ingresados, setIngresados] = useState(null); // null = cargando
  const [total, setTotal] = useState(null);
  /* Si el servidor ya dijo que no, se deja de preguntar. Ver abajo. */
  const [permitido, setPermitido] = useState(true);

  const refrescar = useCallback(async () => {
    if (!eventoId) return;
    try {
      const d = await clientesApi.list(eventoId, { limit: 1 });
      setIngresados(d.stats?.usado || 0);
      setTotal(d.stats?.total || 0);
    } catch (e) {
      /* Un 403 no es un fallo pasajero: es la respuesta correcta para quien no
         tiene `ver_clientes` en este evento —la lista de asistentes son datos
         personales— y va a seguir siéndolo. Reintentarlo cada doce segundos no
         lo va a cambiar; sólo llena la consola de rojo cada doce segundos y
         hace pensar que la API está fallando. Pasó de verdad: se reportó como
         "llamadas que terminan en error contra la API cada cierto tiempo".

         Con el resto de errores —red, 500, timeout— sí se sigue sondeando,
         porque esos sí se arreglan solos. */
      if (e?.response?.status === 403) setPermitido(false);
      /* Silencioso igual: el contador se queda sin número, pero la pantalla
         entera no se cae por un recuadro. */
    }
  }, [eventoId]);

  /* Primer tiro inmediato + sondeo mientras la pestaña esté visible. Al cambiar
     de evento se vuelve a permitir: el permiso es por evento, no por persona. */
  useEffect(() => { setPermitido(true); refrescar(); }, [refrescar]);
  useSondeo(refrescar, cadaMs, Boolean(eventoId) && permitido);

  /* Bump optimista: refleja el propio escaneo al instante. El sondeo luego
     confirma/corrige el número real. */
  const bumpOptimista = useCallback(() => {
    setIngresados(prev => (prev == null ? prev : prev + 1));
  }, []);

  return { ingresados, total, bumpOptimista, refrescar };
}
