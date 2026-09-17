# GESTEK · Salir de Supabase a infraestructura propia

Objetivo pedido: **que la base de datos y los servicios sean nuestros**, alojados
en nuestro panel (cPanel), porque al evento entran ~7.000 personas y el plan
gratis se va a caer.

Escrito el 13 de agosto de 2026. Todo lo que dice «medido» se consultó contra el
proyecto de producción `GestorEventosMarcaBlanca` (`yopontbwgdybfsniqawz`) y
contra el código de los dos repos, no contra la documentación. Lo que no se
puede comprobar desde aquí va marcado como tal, con la forma de mirarlo.

---

## 0 · Dos correcciones antes de planear nada

**El plan gratis: confirmado.** La organización está en `plan: free`. La
preocupación es real.

**Pero no se va a caer por el tamaño de los datos.** Medido:

| Qué | Hoy | Límite del plan gratis |
|---|---|---|
| Base de datos | **20 MB** | 500 MB |
| Archivos (Storage) | **24 MB**, 73 archivos | 1 GB |
| Usuarios | **28** | 50.000 MAU |

Nada de eso se acerca al techo, y 7.000 asistentes no lo mueven: son filas de
texto. **Los datos no son el problema.** Lo que sí puede tumbar el evento es
otra cosa, y conviene apuntar a eso y no al bulto:

1. **Tráfico de salida (egress).** El plan gratis da ~5 GB/mes. Las portadas y
   logos salen hoy de Supabase Storage, y los tres buckets son **públicos**: cada
   visita a una página pública descarga esas imágenes desde Supabase. 7.000
   personas × unos cientos de KB de imágenes = varios GB en días. **Este es el
   techo que se toca primero**, y es el más fácil de quitar.
2. **Cómputo compartido.** El plan gratis corre en una instancia mínima y
   compartida. No es cuestión de peticiones por segundo en abstracto: es que en
   el pico de la puerta no hay CPU reservada para nadie.
3. **Realtime.** El plan gratis limita las conexiones simultáneas (~200). Hoy hay
   tres canales abiertos y cada usuario del panel puede tener los tres a la vez.
   Con el equipo trabajando no se toca; si el chat se abre a asistentes, sí.
4. **La pausa por inactividad.** Un proyecto gratis se suspende tras días sin
   uso. Para una plataforma con semanas tranquilas y un pico el día del evento,
   esto es un riesgo por sí solo.

> Los cuatro límites de arriba son los publicados por Supabase y **no se
> verificaron contra el panel** (Supabase los cambia). Los tres números de la
> tabla sí están medidos. Antes de decidir, conviene releer los límites en
> Organization → Usage.

**Y la segunda corrección, la que toca el plan de raíz: «en cPanel» no se
sostiene para la base de datos si el cPanel es de hosting compartido.** Es la
única parte del pedido que no se puede cumplir tal cual, y vale más decirlo
ahora que a mitad de camino. Está desarrollado en la sección 3, con la
comprobación de diez minutos que resuelve la duda.

---

## 1 · Inventario: de qué depende Supabase hoy

Cinco servicios distintos, no uno. Cada uno se sale por su lado y cuesta
distinto. Todo medido.

| Servicio | Dónde se usa | Volumen medido | Dificultad de sacarlo |
|---|---|---|---|
| **Postgres vía PostgREST** | Backend: **773** llamadas `.from(` y 3 `.rpc(`. Frontend: **6** sitios, todos contra `profiles` | 63 tablas, 3 vistas, 14 funciones, 21 triggers, **74 políticas RLS** | Alta si se reescribe. **Baja si no** — ver sección 4 |
| **Auth (GoTrue)** | Frontend: 11 métodos (`signUp`, `signInWithPassword`, `signInWithOAuth`, `resetPasswordForEmail`, `exchangeCodeForSession`, PKCE…). Backend: `auth.getUser()` **en cada petición** | 28 usuarios. `auth.uid()` aparece en **115** sitios de las migraciones; `auth.users` referenciada **12** veces | Media. Es la pieza con más aristas |
| **Storage** | Frontend: 5 archivos suben/leen. Backend: **0** | 3 buckets **públicos** (`avatars` 3 MB, `event-media` 15 MB, `form-uploads` 8 MB), 73 archivos, 24 MB. 60 referencias a `storage.*` en políticas | **Baja.** Son archivos públicos: se copian y se reescriben las URLs |
| **Realtime** | Frontend: 3 canales — notificaciones (`TopBar`), asistencia en vivo, chat | Publicación `supabase_realtime`: `chat_messages`, `notificaciones`, `tickets` | Media. O se autoaloja, o se cambia por sondeo/SSE |
| **Edge Function + pg_cron + pg_net** | 1 función (`send-reminders`), 1 job horario | — | **Ninguna. Está muerto** — ver sección 2 |

Extensiones instaladas que hay que reproducir: `pgcrypto`, `uuid-ossp`,
`pg_cron`, `pg_net`, `pg_stat_statements`, `supabase_vault`. Postgres **17.6**.

---

## 2 · El hallazgo que cambia el orden: el recordatorio nunca ha funcionado

El job `send-reminders-hourly` está **activo** y corre cada hora. Medido en
`cron.job_run_details`:

```
ejecuciones: 1949    fallidas: 1949    última: 2026-08-13 15:05
```

**1.949 de 1.949 fallidas.** El comando sigue con los marcadores de posición sin
rellenar:

```sql
url := 'https://<TU_PROJECT_REF>.supabase.co/functions/v1/send-reminders',
headers := jsonb_build_object('Authorization', 'Bearer <TU_ANON_KEY>', ...)
```

Nunca ha enviado un recordatorio. Ni uno. Y como el correo tampoco está
configurado, el fallo quedó tapado por otro fallo: aunque el job hubiera
apuntado bien, no habría salido nada.

Dos consecuencias prácticas:

- **La pata de Edge Functions + `pg_net` + `pg_cron` se borra gratis.** No hay
  nada funcionando que se pueda romper. Son tres dependencias de Supabase menos
  en la primera media hora del trabajo.
- **El reemplazo ya está escrito.** `lib/recordatorios.js:10` usa `node-cron` en
  el propio backend. La ruta buena era esa desde el principio; el job de la base
  de datos era un camino paralelo que nadie terminó de conectar.

Esto también corrige el documento anterior: los recordatorios no estaban «a la
espera del SMTP». Estaban además apuntando a un host inexistente.

---

## 3 · Qué cabe en cPanel y qué no

Aquí está el nudo del pedido. Depende **por completo** de qué cPanel es, y eso
no se puede ver desde aquí.

### Si es hosting compartido (el caso habitual)

| Pieza | ¿Cabe? | Por qué |
|---|---|---|
| Frontend estático (el `dist/` de Vite) | ✅ **Ya cabe** | Es lo que hace `.cpanel.yml` hoy |
| SMTP del correo | ✅ | Es justo la credencial que ya se está pidiendo |
| API Node (Express) | ⚠️ Quizá | Con «Setup Node.js App» (Passenger). Ojo a los límites de procesos y memoria |
| **PostgreSQL** | ❌ **Normalmente no** | Muchos compartidos sólo ofrecen MySQL. Y aun con la sección de PostgreSQL, **no se pueden instalar `pg_cron` ni `pg_net`**: piden superusuario y tocar `shared_preload_libraries` con reinicio del servidor |
| **GoTrue / PostgREST / Realtime** | ❌ | Son demonios de larga vida (Go, Haskell, Elixir). Un compartido no deja correr binarios propios como servicios |
| WebSockets | ❌ / frágil | Detrás de Apache + Passenger no son de fiar |

Traducido: en compartido se puede alojar **la cara** de GESTEK, no **el motor**.
Y para 7.000 personas, un compartido es peor que el plan gratis de Supabase, no
mejor: se cambia una instancia pequeña compartida por otra instancia pequeña
compartida, y además se pierden las copias de seguridad y el panel.

### Si es un VPS o dedicado con root (o WHM)

Entonces sí, entero. Postgres propio, y las cuatro piezas de Supabase que hagan
falta en contenedores al lado. El panel puede seguir siendo cPanel para dominios
y correo; el motor va en la máquina.

### La comprobación de diez minutos (hace falta antes de seguir)

1. En cPanel, buscar la sección **PostgreSQL Databases**. Si no está, no hay
   Postgres.
2. ¿Aparece **WHM** o un enlace de root? Eso indica VPS/dedicado.
3. En **Setup Node.js App**, mirar la versión de Node y si deja crear la app.
4. En la barra lateral, apuntar los límites: **Entry Processes**, **Physical
   Memory Usage**, **CPU**, y el número de conexiones permitidas.
5. Preguntar al proveedor, textual: *«¿puedo correr un servicio propio de larga
   vida y Docker? ¿tengo acceso root?»*

Con esas cinco respuestas el plan de abajo se decide solo.

---

## 4 · La palanca que ahorra el 90% del trabajo

Hay 773 llamadas a `.from(` en el backend. La reacción natural —cambiar
`supabase-js` por el driver `pg` y escribir SQL— significa **reescribir y volver
a probar 773 sitios**, más reimplementar en código las **74 políticas RLS** que
hoy protegen las tablas. Es de largo la parte más cara y la más fácil de
equivocar, y toca los caminos de pago y de boletas.

**No hace falta.** Supabase no es un producto cerrado: son piezas de código
abierto sobre Postgres. Si se levantan las mismas piezas en la máquina propia:

```
Postgres 17  +  PostgREST  +  GoTrue  +  Storage API  +  Realtime
```

…entonces `supabase-js` sigue funcionando **sin tocar una sola de las 773
llamadas**. Lo único que cambia son dos variables de entorno: la URL y las
llaves. Eso convierte una reescritura de meses en un cambio de configuración más
trabajo de infraestructura.

La regla que conviene fijar: **la migración mueve el servidor, no reescribe la
aplicación.** Cualquier etapa que empiece a reescribir consultas se ha desviado.

Lo que sí hay que decidir aparte es Realtime (sección 6, etapa 5): es la pieza
más pesada de operar y la que menos se usa.

---

## 5 · El arreglo que hay que hacer igual, migremos o no

`middleware/auth.js:11` y `:23` validan el token así:

```js
const { data, error } = await supabase.auth.getUser(token);
```

Eso es **una llamada de red a Supabase en cada petición autenticada** de todo el
panel. Cuesta tres cosas: latencia añadida en cada clic, una superficie de
límite de peticiones que no controlamos, y una dependencia dura de GoTrue.

El reemplazo es verificación local de la firma del JWT. `jsonwebtoken` **ya está
en las dependencias** del backend, así que no entra nada nuevo. Es de las pocas
cosas de esta lista que mejora hoy, con Supabase puesto, y además es requisito
para autoalojar.

Con un cuidado que hay que escribir en el código, no en la cabeza: la
verificación local **no ve las revocaciones**. Un token robado vale hasta que
caduca. Se compensa con vida corta del token de acceso y comprobación contra la
base sólo en las rutas que cambian dinero o permisos.

---

## 6 · El plan, por etapas

Ordenado para que **cada etapa valga por sí sola** y ninguna se pierda si la
decisión de la 0 cambia. Las etapas 1 a 3 sirven igual en Supabase y en casa.

### Etapa 0 · Decidir la máquina — *bloqueante*

La comprobación de la sección 3. Sin esa respuesta, todo lo que viene después es
adivinar. Es lo único que hay que hacer antes de tocar código.

### Etapa 1 · Quitar el peso muerto — *media hora, riesgo cero*

Borrar el job `send-reminders-hourly` (1.949 fallos, nunca funcionó) y la Edge
Function `send-reminders`. Dejar los recordatorios en el `node-cron` que ya
existe. Con eso desaparecen `pg_cron`, `pg_net` y Edge Functions del inventario,
y de paso se cierra el aviso del linter sobre `pg_net` en el esquema `public`.

### Etapa 2 · Verificación local del JWT — *sección 5*

Mejora la latencia hoy y quita la dependencia por petición de GoTrue.

### Etapa 3 · Las imágenes fuera de Supabase Storage — *el ahorro grande*

Es la etapa con mejor relación esfuerzo/resultado, porque ataca el techo que se
toca primero (egress) y es **fácil**: los tres buckets son públicos, así que no
hay URLs firmadas ni permisos que reproducir. Son 73 archivos y 24 MB.

1. Copiar los tres buckets a una carpeta pública del dominio.
2. Cambiar los 5 sitios del frontend que suben (`AvatarUploader`,
   `CoverUploader`, `FormPhotoUploader`, `DocumentosSection`,
   `PerfilTalentoEditor`) por un endpoint propio de subida.
3. **Migración de datos, y no olvidarla:** las URLs de Supabase están
   **guardadas dentro de las filas** (`avatar_url`, portadas, respuestas de
   formulario, documentos). Hay que reescribirlas. Conviene hacerlo con las dos
   copias sirviendo en paralelo, para poder volver atrás.

Después de esta etapa el evento aguanta mucho mejor **aunque no se migre nada
más**, porque el tráfico de imágenes es lo que se dispara con 7.000 personas.

### Etapa 4 · Levantar el motor propio

En la máquina de la etapa 0: Postgres 17 con las seis extensiones, y al lado
PostgREST + GoTrue + Storage. Restaurar el volcado —son 20 MB, cuestión de
segundos— y apuntar un entorno de pruebas ahí cambiando sólo la URL y las
llaves. Nada de producción todavía.

Aquí se comprueban las tres cosas que de verdad pueden fallar: que las 74
políticas RLS sigan aplicando, que los 28 usuarios entren con su contraseña de
siempre, y que los QR ya emitidos sigan validando.

### Etapa 5 · Decidir Realtime

Tres canales lo usan. Dos opciones honestas:

- **Autoalojar Realtime.** Se conserva el código tal cual, se suma un servicio
  de Elixir que hay que operar.
- **Cambiar los tres canales.** Notificaciones y asistencia en vivo funcionan
  perfectamente con sondeo cada pocos segundos. El chat es el único que se nota
  sin tiempo real, y para el chat basta SSE contra el backend Express que ya
  existe.

Recomendación: la segunda. Es menos código nuevo que operar y quita el servicio
más pesado del conjunto. Pero **no antes del evento**: toca el chat, que hoy
funciona.

### Etapa 6 · Cambio de producción

Con ensayo previo y vuelta atrás escrita antes de empezar: base en sólo lectura,
volcado final, restaurar, cambiar variables, verificar, y dejar el proyecto de
Supabase **vivo y sin borrar** dos semanas.

---

## 7 · Capacidad para 7.000: los números

Conviene no confundir 7.000 asistentes con 7.000 simultáneos.

| Momento | Carga realista | Comentario |
|---|---|---|
| Venta / inscripción | Repartida en semanas | No es el problema |
| Apertura de puertas | El pico. Si 20% entra en 30 min → ~1.400 personas | ~1 escaneo/s de media, picos de 5–10/s |
| Durante el evento | Páginas públicas, agenda, torneos | Sobre todo **lectura y caché** |

Para Postgres, 5–10 escrituras por segundo es poco: un VPS modesto lo hace sin
sudar. **El cuello no es la base de datos, son las imágenes y el cómputo
compartido** — de ahí que la etapa 3 vaya antes que la 4.

**La puerta ya está protegida, a medias.** `src/lib/checkinOffline.js` guarda los
escaneos en `localStorage` y los sincroniza al reconectar, así que si el servidor
cae la puerta **no se detiene**. El detalle que hay que saber: la cola es
**optimista** —lo dice el propio archivo— y no valida hasta sincronizar. Con la
red caída, **un QR repetido entra igual** y el duplicado sólo se descubre
después. Para 7.000 personas conviene decidir a propósito qué se prefiere: que
pase gente sin validar, o que la fila se pare.

Lo que hay que probar con carga antes del evento, y hoy no se ha probado:
el escaneo en el pico, la página pública de un evento con sus imágenes, y la
compra simultánea del mismo tipo de boleta con cupo casi agotado.

---

## 8 · Riesgos, en orden de lo que más duele

1. **`QR_JWT_SECRET`.** Si cambia, **todas las boletas ya emitidas dejan de
   validar**. Tiene que viajar idéntico. Ya estaba avisado; en una migración es
   justo el tipo de variable que se regenera «por limpieza».
2. **Los UUID de los usuarios.** `auth.users` está referenciada 12 veces por
   claves ajenas. Si los usuarios se recrean con ids nuevos, se rompen las 12.
   Hay que preservar el UUID, pase lo que pase.
3. **`auth.uid()` en 115 sitios.** Las 74 políticas dependen de que el JWT
   traiga los mismos campos (`sub`, `role`) que pone GoTrue. Con un JWT propio
   mal formado, las políticas **no dan error: deniegan todo, o dejan pasar
   todo**. Es el fallo más silencioso de la lista, y por eso la etapa 4 se
   verifica con un usuario real y no con la service key.
4. **Las contraseñas.** Los hashes de GoTrue se migran tal cual **si se conserva
   GoTrue**. Con autenticación propia hay que obligar a restablecer contraseña a
   los 28 usuarios.
5. **Las 14 tablas con RLS y ninguna política.** Deuda ya anotada. Hoy no filtra
   nada porque el backend entra con la service key, pero en cuanto el navegador
   hable con nuestro PostgREST, cualquiera de esas tablas falla sin explicación.
6. **Copias de seguridad.** Lo que Supabase hacía solo pasa a ser nuestro. Un
   `pg_dump` en cron y una restauración **probada** —restaurar sin haber
   ensayado no es una copia de seguridad—.
7. **Migrar la semana del evento.** El riesgo que no aparece en ninguna tabla
   técnica. Ver la recomendación de abajo.

---

## 9 · Coste, honestamente

| Opción | Dinero | Nuestro tiempo |
|---|---|---|
| Supabase Pro | ~25 USD/mes | Casi nada |
| VPS propio (etapas 0–6) | ~12–40 USD/mes | **Semanas**, más operación permanente |
| cPanel compartido de hoy | Ya pagado | No sirve para el motor (sección 3) |

«Propio» no sale gratis: se paga en horas y en guardias. Sale a cuenta por
control, por datos, y porque a partir de cierto volumen el precio por asistente
deja de crecer. Pero el ahorro frente al plan Pro no es el argumento: 25 USD al
mes son menos que una tarde de trabajo.

---

## 10 · Por dónde empezar

| # | Qué | Por qué ahí |
|---|---|---|
| 1 | **Los cinco puntos de la sección 3** | Diez minutos, y sin eso el resto es adivinar |
| 2 | **Etapa 1: borrar el cron y la Edge Function** | Media hora, riesgo cero, tres dependencias menos |
| 3 | **Etapa 3: imágenes fuera de Storage** | Ataca el techo que se toca primero, y sirve igual si no se migra |
| 4 | **Etapa 2: JWT local** | Mejora hoy y es requisito para autoalojar |
| 5 | **Etapa 4 en pruebas, nunca en producción** | Ahí se ve si RLS y los usuarios sobreviven |
| 6 | **Prueba de carga del escaneo** | Es la única función que no puede fallar el día del evento |

### La recomendación, que no es la que se pidió

La migración es el movimiento correcto y este plan la deja completa. Pero
**hacerla entera antes de un evento de 7.000 personas es el mayor riesgo del
proyecto**, más que el plan gratis: hoy faltan por probar de punta a punta el
correo, el QR, la compra y el check-in, y esas pruebas no se pueden hacer sobre
una infraestructura que también está estrenándose.

Lo que propongo, y la decisión es de ustedes:

1. **Etapas 1, 2 y 3 ahora.** No dependen de la máquina, bajan el consumo de
   verdad y no se tiran si el plan cambia.
2. **25 USD de Pro el mes del evento.** Quita las cuatro paredes de la sección 0
   —incluida la pausa por inactividad— por menos de lo que cuesta una tarde.
3. **Etapas 4 a 6 después del evento**, con calma y con la aplicación ya
   verificada funcionando.

Si la decisión es migrar antes igualmente, la fecha límite razonable es **tres
semanas antes** del evento, con el proyecto de Supabase intacto como vuelta
atrás. Menos margen que eso y el ensayo no cabe.
