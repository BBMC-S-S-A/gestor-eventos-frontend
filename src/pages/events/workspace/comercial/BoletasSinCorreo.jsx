import { useCallback, useEffect, useState } from 'react';
import { emailsApi } from '../../../../api/emails.js';
import { useToast } from '../../../../context/ToastContext.jsx';
import { confirmDialog } from '../../../../components/ui/Confirm.jsx';

/* «N personas tienen boleta y nunca recibieron el correo».
 *
 * La cola sólo sabe de lo que pasó por ella. Cuando el correo sale por otro
 * camino —o no sale— la boleta existe y nadie se entera de que no llegó. Aquí
 * se cuentan esas boletas y se mandan de una vez, por la cola y a su ritmo.
 * Quien ya la tiene en la cola (enviada o por salir) no se vuelve a mandar. */
export default function BoletasSinCorreo({ evento }) {
  const { success, error } = useToast();
  const [d, setD] = useState(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(() => {
    emailsApi.sinBoleta(evento.id)
      .then(setD)
      /* Sin permiso de envío o sin la ruta en este servidor: la tarjeta no sale. */
      .catch(() => setD(null));
  }, [evento.id]);

  useEffect(() => { cargar(); }, [cargar]);

  if (!d || d.total === 0) return null;

  const horas = Math.ceil(d.total / (d.por_hora || 150));

  const enviar = async () => {
    const ok = await confirmDialog({
      title: `Mandar ${d.total.toLocaleString("es-CO")} boletas por correo`,
      message: `Salen por la cola, unas ${d.por_hora} por hora: tardará cerca de ${horas} h. Quien ya recibió su boleta por la cola no la recibe otra vez. Esto no se puede deshacer.`,
      confirmLabel: 'Mandar',
    });
    if (!ok) return;
    setTrabajando(true);
    try {
      const r = await emailsApi.enviarSinBoleta(evento.id);
      success(`${r.encolados} boletas en la cola. Saldrán en unas ${r.horas_estimadas} h.`);
      cargar();
    } catch (e) {
      error(e.response?.data?.error || e.message);
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="rounded-2xl border border-warning/40 bg-warning/5 p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text-1">
          {d.total.toLocaleString('es-CO')} boletas sin su correo
        </p>
        <p className="text-xs text-text-2 mt-0.5">
          Tienen boleta y correo, pero su correo no salió o no dejó rastro.
          {!d.activa && ' Para mandarlas hay que encender la cola de correo en el servidor.'}
        </p>
      </div>
      <button onClick={enviar} disabled={trabajando || !d.activa} className="btn-primary btn-sm flex-shrink-0">
        {trabajando ? 'Encolando…' : 'Mandar su boleta'}
      </button>
    </div>
  );
}
