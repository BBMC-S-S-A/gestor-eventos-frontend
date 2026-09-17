# Sondeo de movimiento y estados de carga

Dónde a GESTEK le falta animación **y dónde no**. Escrito el 15 de agosto de
2026 para llevarlo a un pase de diseño aparte y traer las piezas de vuelta.

La segunda mitad —lo rechazado— es tan importante como la primera. Una lista
que propone movimiento en todas partes produce justo la interfaz lenta que
queremos evitar.

---

## Lo que ya hay (para proponer sobre ello, no en paralelo)

| | |
|---|---|
| Curva de la casa | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Entradas | `fadeUp` (83 usos), `fadeIn` (19), `authCardIn` (15), `scaleIn` (8) |
| Cargador de marca | `GLoader` — el nudo con halo `gkHalo 2.4s` y luz `gkFlujo 1.9s` |
| Avisos | `toastIn 0.35s cubic-bezier(0.34,1.56,0.64,1)` / `toastOut 0.25s` |
| Pulsación | `active:scale-95`, `active:scale-[0.98]`, `active:scale-[0.99]` — 21 usos |
| Esqueletos de carga | 21 sitios |

**Conclusión del recon: esta interfaz ya está bastante animada.** Lo que falta
son huecos concretos, no una capa de movimiento.

---

## Parte 1 · Oportunidades

**Estado al 15 de agosto por la noche: 1, 2, 3 y 4 implementadas y desplegadas.**
La 5 queda pendiente y a propósito — ver la nota al final de la tabla.

| # | Dónde | Hoy | Propósito | Frecuencia | Movimiento propuesto |
|---|---|---|---|---|---|
| 1 | `src/pages/public/EventoPublicoPage.jsx:810` — cambio de módulo del registro | Los campos se sustituyen de golpe. Catorce veces por persona, sin un solo puente entre pasos | Evitar un cambio brusco | ~7.000 personas × 14 pasos, una vez cada una | Entrada direccional: al avanzar `opacity: 0; transform: translateX(12px)` → asentado; al retroceder desde `-12px`. `transition: opacity 180ms, transform 180ms cubic-bezier(0.16,1,0.3,1)`. Sólo el bloque de campos, **nunca la barra de progreso ni los botones** — si se mueven, el formulario parece rebotar |
| 2 | ~~Global — `prefers-reduced-motion`~~ | **Corregido: era falso.** Ya estaba resuelto en `index.css:166` para todo el documento. El sondeo original dijo lo contrario porque el `grep` se cortó con `head -5` y sólo asomaron los archivos del bot. Lo único que faltaba de verdad era `transition-duration`, que `animation-*` no cubre — **ya aplicado** | Accesibilidad | Todos | Hecho: se añadieron `transition-duration` y `transition-delay` al bloque que ya existía |
| 3 | `src/pages/inicio/InicioPage.jsx:114-117` — los cuatro KPI | `'—'` se sustituye por la cifra sin transición. Cuatro números aparecen de golpe | Evitar un cambio brusco | Una vez por visita | `transition: opacity 200ms cubic-bezier(0.16,1,0.3,1)` sobre el valor, con `key` en el número para que React lo remonte. Escalonar los cuatro a 60ms |
| 4 | Panel — pantalla de carga inicial | Recuadros vacíos y «Cargando tu actividad…». Es lo primero que se ve al entrar | Deleite (nivel raro/primera vez) | Una vez por sesión | El bot de GESTEK trabajando, con `GLoader` de fondo y un mensaje del tipo «Poniéndote en línea con tus eventos». Presupuesto largo permitido aquí (600–900ms de ciclo), es el único sitio de la lista donde lo está |
| 5 | `src/pages/events/tabs/FormularioTab.jsx:319` — agregar la ficha de caracterización | Veintidós preguntas aparecen de una vez en la lista | Indicación de estado — que se note que pasó algo grande | Rara: una o dos veces por evento | Escalonado de entrada 40ms por fila, **con tope en las 8 primeras** (22 × 40ms = casi un segundo de espera). `fadeUp` acortado a 240ms. Decorativo: no debe bloquear el scroll ni la interacción |

---

## Parte 2 · Rechazadas

- **Resultado del escaneo en el check-in** (`CheckinTab.jsx:279-348`) — **Rechazada por frecuencia.** El operador escanea cientos de veces el día del evento; es su bucle principal. Además ya entra con `fadeUp 0.3s`. Cualquier cosa más lenta se paga en cola en la puerta. Lo que hace falta ahí no es movimiento, es contraste de color entre aceptado y rechazado.
- **Buscador ⌘K de la cabecera** — **Rechazada: se abre con teclado, decenas de veces al día.** Animar la apertura la hace sentir lenta y desconectada. Que aparezca instantánea es el comportamiento óptimo.
- **Barra de progreso de la importación** (`ImportarAsistentes.jsx:367`) — **Rechazada por función.** Ya muestra progreso real («X de Y», por lotes). Es un dato que la persona está leyendo mientras espera; suavizarlo con una transición lo volvería menos fiable, no más bonito.
- **Avisos (toasts)** (`ToastContext.jsx:84`) — **Rechazada: ya resuelto.** Entra y sale por el mismo borde con curvas propias. No tocar.
- **Llaves del torneo, tabla de ranking, lista de asistentes** — **Rechazada por función.** Son datos densos que se leen y sobre los que se decide. El movimiento decorativo sobre información estorba.
- **Spinners de crear evento desde PDF / IA** (`EventCreatePage.jsx:273,412`) — **Rechazada: ya resuelto.** Botón con `Spinner` y texto de estado («Leyendo…», «Generando…»). Suficiente para una espera con causa visible.

---

## Parte 3 · Veredicto

GESTEK **no necesita más movimiento en general**; necesita tres huecos tapados.
Dos son teletransportes —los campos del registro y los KPI del panel— y el
tercero es un defecto de accesibilidad: ochenta y tres entradas animadas que
ignoran `prefers-reduced-motion` mientras el bot sí lo respeta.

**La de mayor rendimiento con diferencia es la nº 1.** Es la única que van a
ver siete mil personas, catorce veces cada una, y es código nuevo de hoy: los
módulos del registro se estrenan la semana que viene y ahora mismo los campos
saltan sin puente. Las demás son mejoras; ésa es la que se nota.

La nº 4 —la pantalla de carga con el bot— es la única donde cabe gastar
presupuesto de deleite: es rara, es la primera impresión, y hoy son recuadros
grises.

Para convertir cualquier fila en un plan de implementación autocontenido:
`improve-animations plan <fila>`.

---

## Nota sobre la nº 5, que se decidió NO hacer por ahora

El escalonado al agregar la ficha se propuso cuando el botón sólo agregaba.
Desde que es un interruptor —el mismo clic pone y quita las veintidós— el caso
cambió: ahora esa lista se llena y se vacía, y escalonar veintidós filas cada
vez que alguien prueba y se arrepiente convierte una corrección rápida en una
espera. El propio documento ya avisaba de que 22 × 40 ms es casi un segundo.

Queda anotado por si vuelve a hacer falta, pero hoy la decisión es no.
