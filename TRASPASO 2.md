# GESTEK · Traspaso — 25 de agosto de 2026

Documento para retomar el trabajo en otra sesión sin releer nada más. Sustituye
a `CONTEXTO.md` (del 14 de agosto) en todo lo que se contradiga: al final hay
una lista de lo que ese documento dice y ya no es cierto.

Regla que se mantuvo toda la sesión: **lo que dice «medido» se comprobó contra
producción o contra el código.** Lo que es estimación va marcado como tal.

---

## 0 · El reloj

| | |
|---|---|
| Hoy | 25 de agosto de 2026 |
| El evento | Mediados de septiembre (~15). Quedan tres semanas |
| Asistentes esperados | ~7.000 |
| Estado de los repos | Los dos limpios y con todo subido a `main` |

**Decisión que gobierna todo lo demás: en septiembre no se migra nada.** Lo que
está en juego es la puerta.

---

## 1 · Lo que se construyó, y ya está en producción

Once commits en el frontend (`f05fd6e..a4748b7`) y cinco en el backend
(`8b1e588..8329532`). Todo desplegado y verificado en la web real.

**Aforo por zonas, operable de verdad.** Antes se podía mirar y nada más. Ahora
hay entradas y salidas a mano (con o sin boleta), un botón de limpiar que **no
borra** —escribe un corte y la cuenta arranca desde ahí, el histórico queda
entero—, y un reporte con pico simultáneo, curva del día y estancia media,
exportable. El aforo máximo **avisa pero no bloquea**: si la zona se pasa, la
gente sigue entrando y queda registrado el excedente. Fue una decisión
explícita del organizador y está escrita en el código.

**El plano dejó de ser un dibujo.** Se colocan zonas, puertas y sub-eventos
sobre el mapa; cada marcador lleva su número en vivo y un clic abre el detalle.
Una zona es un punto y contesta qué está pasando dentro de ella ahora mismo, con
su programación. Si se llena con algo en curso, arde: halo naranja y llama.
Encima del plano hay una línea con las zonas más calientes del momento.

**La boleta se descarga en PDF** —QR, código, evento, datos y respuestas del
formulario— tanto al terminar el registro como desde `/mi-ticket`.

**El segundo registro se hace sin salir de la confirmación**: al reservar, si
hay talleres con inscripción aparte, se listan ahí mismo y se puede apuntar con
la boleta recién emitida, sin cuenta en GESTEK.

**Entrar al evento ya no se confunde con asistir a un taller.** El escáner tiene
tres modos: check-in, reingreso y sub-evento. El tercero exige inscripción
previa y es lo único que suma a las métricas de esa actividad.

**Los enlaces pueden salir con el dominio del organizador** (`branding.dominio`),
tanto en la web como en los cuatro puntos donde el backend arma enlaces de
boleta.

**Track y Ubicación de un sub-evento sugieren** lo que el evento ya tiene
nombrado: zonas, puntos del plano y puertas.

### Migraciones aplicadas en producción

| | |
|---|---|
| **0079** | Aforo por zonas: `zona_id`, `cantidad`, `origen`, `ticket_id` opcional, tabla `zona_cortes` y cuatro funciones de agregación |
| **0080** | `agenda_sessions.zona_id`, para que un sub-evento pertenezca a una zona |

Las dos están aplicadas y verificadas con datos de prueba que después se
borraron. El relleno de la 0080 enganchó solo el «Torneo de Videojuegos FIFA» de
FESTECH a su Zona Gamer.

---

## 2 · Lo que se midió

Estos números son la base de todas las decisiones y son reproducibles.

| Qué | Cuánto |
|---|---|
| Base de datos | **22 MB** · 74 tablas · 104 políticas de seguridad sobre 68 tablas · 20 disparadores · 37 funciones · 5.646 líneas de migraciones |
| Capa de acceso | **655 consultas** y 7 procedimientos, en 39 ficheros de rutas · 41 módulos montados |
| Rasgos de PostgreSQL | 206 usos de `jsonb`, 86 operadores JSON, 269 usos del tipo `uuid`, 70 `gen_random_uuid()` |
| ORM | **Ninguno** |
| Archivos | 62 MB en 103 ficheros · `event-media` 48 MB, `form-uploads` 14 MB, `avatars` 0,8 MB · **los tres públicos** |
| Identidad | 29 cuentas · 10 flujos · `supabase.auth` en 11 ficheros del frontend, 23 llamadas (11 en `AuthContext.jsx`) |
| Tiempo real | 3 canales: notificaciones, aforo, chat |
| Correo | 20.000-30.000 envíos por evento (estimación) |
| Extensiones activas | pgcrypto, uuid-ossp, pg_cron, pg_net, vault |

---

## 3 · Lo que se encontró roto

Ordenado por gravedad. **Ninguno está arreglado todavía.**

### 3.1 · El middleware pregunta a Supabase en cada petición

`middleware/auth.js` hace `await supabase.auth.getUser(token)` en lugar de
verificar la firma localmente. Ese middleware está en **34 ficheros de rutas con
100 puntos de uso**, así que **cada petición autenticada del panel cuesta una
llamada HTTP extra a Supabase**.

Tres consecuencias: multiplica el consumo contra los límites del proveedor, mete
a Supabase en el camino crítico de todo —incluida la puerta— y añade un viaje de
red a cada petición.

**Arreglo:** verificar el token con `jsonwebtoken` y el secreto del proyecto.
Son unas quince líneas en un solo fichero, `jsonwebtoken` ya está instalado, y
además es el primer paso de la migración del auth.

### 3.2 · El canal en vivo se multiplica solo

`src/hooks/useAsistenciaEnVivo.js`. El canal no se reconecta en bucle; el
problema es que **cada aviso dispara una recarga completa**: llama a
`GET /clientes`, y ese endpoint **lee todos los tickets del evento** para
calcular estadísticas en JavaScript.

El hook está montado en **tres sitios**: `CheckinTab`, `ReporteTab` y
`ResumenSection` —que es la pantalla de entrada del evento—. O sea, cualquiera
del equipo con el evento abierto está suscrito.

Cuenta del día del evento: 10 pantallas × 7.000 escaneos = **70.000 peticiones**,
cada una leyendo hasta 1.000 filas. **Esto es lo que los bloqueó en la
presentación.**

**Arreglo:** usar la fila que ya trae el aviso en vez de recargar, y limitar
cualquier recarga a una cada diez segundos como mucho.

### 3.3 · Las estadísticas de ingreso mienten por encima de 1.000 boletas

El mismo endpoint calcula las estadísticas trayendo las filas y sumándolas en
JavaScript. PostgREST devuelve 1.000 filas por defecto, así que **a partir de la
boleta 1.001 el número mostrado es falso y nada lo advierte**. Es la misma
familia de fallo que ya se corrigió en el aforo con la 0079.

**Arreglo:** contar con un agregado en la base.

### 3.4 · Los documentos de asistentes están en un bucket público

`form-uploads` (16 ficheros, 14 MB) es público. Si alguien sube una cédula en un
formulario, queda en una dirección adivinable. **Es un problema de datos
personales que ya existe**, no una mejora pendiente.

### 3.5 · La página pública no se puede cachear

`publicoBySlug` hace seis consultas **e inserta una fila de visita en cada
petición**. Como escribe, la respuesta no admite caché y la API interviene en el
100% de las visitas. Separando el registro de visita a un aviso aparte, se
serviría desde el CDN y la API dejaría de intervenir en casi todas.

Es la mejora con más efecto sobre la capacidad del día del evento.

### 3.6 · El frontend se sirve en un plan que prohíbe el uso comercial

Vercel Hobby. Si GESTEK factura eventos, la exposición es contractual, no
técnica.

### 3.7 · El escáner de sub-eventos no tiene cola offline

El check-in general sí guarda los escaneos sin señal y los sincroniza al
reconectar. El de sub-eventos no: si no hay cobertura en la puerta del taller,
el escaneo se pierde.

---

## 4 · El correo, que es la prioridad declarada

**Son dos sistemas distintos y conviene no confundirlos.**

| Qué correo | Quién lo manda | Por qué falla |
|---|---|---|
| Recuperar contraseña, confirmar cuenta | **Supabase Auth** | Su plan gratuito limita esos envíos a unos pocos por hora. **Si no llega, el arreglo no está en el código**: es poner SMTP propio en el panel de Supabase (Authentication → Emails → SMTP Settings) |
| Boleta, recordatorios, invitaciones | El backend, por cPanel o Resend | Depende de las variables de entorno en Render |

**Capacidad ya construida y poco conocida:** la migración 0078 añadió **varios
buzones por evento**, cada uno con `max_por_hora` y `max_por_dia`, con **relevo
automático** al alcanzar el umbral y registro de por cuál buzón salió cada
mensaje. La cola (`email_cola`, `lib/colaCorreo.js`) tiene tope horario global y
reintentos, y está pensada para un worker que corre **cada minuto**.

Sumando dos buzones de cPanel (~5.000/día cada uno) más Brevo (300/día gratis
permanente), salen **10.000-12.000 envíos diarios sin pagar nada**. Los 30.000 de
un evento se cubren en dos o tres días. Amazon SES (~3 USD por evento) sólo hace
falta si se quiere emitir en horas en vez de en días.

**Pendiente de comprobar en Render:** `CPANEL_SMTP_USER/PASS/HOST/PORT`,
`EMAIL_FROM` y **`FRONTEND_URL`**, que según `POR-HACER.md` estaba sin poner —
y sin ella los enlaces de los correos apuntan al dominio por defecto de Vercel.

---

## 5 · Infraestructura: dónde quedó la discusión

Se pidió alojar todo en cPanel. Revisando el panel de la cuenta (buscador de
herramientas), **no aparecen PostgreSQL ni el gestor de aplicaciones Node**,
mientras que «cron» y «terminal» sí salen de primeras — o sea, el buscador
funciona y esas dos herramientas no están en ese plan.

**Pero el administrador informó después que tiene root.** Eso cambia el
diagnóstico: con root se instala lo que haga falta y el servidor sirve. Lo que
queda por definir es qué se instala y quién lo mantiene, no si se puede.

También se planteó pasar de PostgreSQL a MySQL «porque es casi 100% migrable».
Con este código no lo es, y por razones medidas: no hay ORM, hay 206 usos de
`jsonb` con 86 operadores propios de Postgres, 104 políticas de seguridad por
fila —que MySQL no tiene—, 37 funciones y 20 disparadores. Y sobre todo: **el
código no habla SQL, habla PostgREST**. No hay consultas que traducir de un
dialecto a otro; habría que reemplazar el cliente entero. Con root disponible,
además, no hace falta.

**Criterio acordado para elegir proveedor:** que se pueda abandonar. Se
descartaron las capas gratuitas permanentes de los grandes operadores no por
precio sino por coste de salida. Sólo software estándar, ninguna interfaz
propietaria.

Hay dos documentos en la raíz del repo con el análisis completo:
`GESTEK-RFC-001-infraestructura-propia.pdf` (el corto, en prosa) y
`GESTEK-arquitectura-y-migracion.pdf` (el largo, con la comparativa de ~30
plataformas).

---

## 6 · El plan del auth, que es lo siguiente

Prioridad declarada por el equipo: **sacar el auth de Supabase**, con
implementación propia, no otra plataforma.

**Fase 0 — hoy, sin migrar nada.** Verificar el token localmente (ver 3.1).
Quita el multiplicador de peticiones y deja el terreno listo.

**Fase 1 — tabla de usuarios propia.** Supabase guarda las contraseñas como
hashes **bcrypt**, que son portables: se copian tal cual y **las 29 personas
siguen entrando con su contraseña de siempre**, sin forzar restablecimientos.

**Fase 2 — emitir tokens propios**, con refresco. Durante la transición el
backend acepta los dos tipos a la vez: no hay corte.

**Fase 3 — Google.** Ya existen `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y
`GOOGLE_REDIRECT_URI` para el calendario; el mismo par sirve para el inicio de
sesión.

**Fase 4 — correos de verificación y recuperación** por los buzones propios.

**Fase 5 — apagar Supabase Auth.**

Tamaño del trabajo en el frontend: 11 ficheros, 23 llamadas, **11 de ellas en
`src/context/AuthContext.jsx`**. Está concentrado, no disperso.

---

## 7 · Lo pendiente, en orden

1. **Verificación local del token** (3.1). Código, pequeño, alto impacto.
2. **SMTP propio en Supabase Auth.** Panel de Supabase, cinco minutos, sin
   desplegar. Arregla recuperar contraseña.
3. **Variables de correo en Render** (sección 4). Arregla la entrega de boletas.
4. **Amplificación del canal en vivo** (3.2). Es lo que los bloqueó.
5. **Estadísticas de ingreso** (3.3).
6. **`form-uploads` a privado** (3.4).
7. **Registro de visita asíncrono y caché de la página pública** (3.5).
8. **Cola offline en el escáner de sub-eventos** (3.7).
9. Auth propio, fases 1 a 5. **Después del evento.**
10. Base de datos y frontend a servidor propio. **Después del evento.**

---

## 8 · Qué está verificado y qué no

**Verificado de verdad:**
- El PDF de la boleta: generado en el navegador contra una boleta real de
  producción, con el QR embebido. 26 KB.
- La aritmética del aforo: se insertaron movimientos de prueba en producción con
  horas conocidas y las cuatro funciones devolvieron exactamente lo esperado,
  incluido el comportamiento del corte. Los datos se borraron después.
- El agregado de zona: se montó una zona de prueba en TechNova con un sub-evento
  encima de la hora actual y la API pública devolvió la programación y el aforo
  correctos. **TechNova quedó exactamente como estaba**, comprobado campo por
  campo.
- Responsive: se midió el desborde real a 375px en todas las páginas públicas y
  en el chasis del panel. `scrollX = 0` en todas.
- Los despliegues: confirmados por contenido servido, no por el panel del
  proveedor.

**Sin verificar:**
- **El workspace completo a 375px y en escritorio.** Nunca se pudo iniciar
  sesión en el entorno local durante la sesión. Queda pendiente el recorrido de
  escáner, tablero de aforo, editor del mapa, calendario y reporte.
- Los endpoints nuevos con datos reales a través de la interfaz.

---

## 9 · Lo que `CONTEXTO.md` dice y ya no es cierto

- Dice que faltan cosas de correo que ya están: la cola con relevo entre buzones
  existe desde la 0078.
- No contempla las migraciones 0079 y 0080, ya aplicadas.
- El apartado de riesgos no incluye los seis hallazgos de la sección 3, que son
  hoy lo más urgente.

Y de `POR-HACER.md` en el backend: sigue vigente el aviso sobre `FRONTEND_URL`,
pero conviene confirmarlo contra Render antes de darlo por bueno.

---

## 10 · Cómo levantar el entorno local

```bash
# frontend
cd gestor-eventos-frontend
# .env.local necesita VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY y VITE_API_URL
npm run dev            # http://localhost:5173
```

El backend nunca se ha ejecutado en local: no hay `.env` en la máquina y las
credenciales viven sólo en Render. Para probar contra el backend de producción
basta con apuntar `VITE_API_URL` a Render.

Existe `VITE_DEV_BYPASS_AUTH=1`, que entra al panel sin cuenta —sirve para
auditar maquetación—, pero **sus peticiones al backend van sin token**, así que
las pantallas con datos salen vacías. **Hay que quitarlo antes de iniciar sesión
de verdad**, o la app seguirá usando el usuario ficticio.

Ficheros de despliegue que ya existen en el backend y conviene mirar antes de
montar nada: `deploy/docker-compose.yml`, `deploy/Caddyfile` y
`deploy/MIGRACION.md`.
