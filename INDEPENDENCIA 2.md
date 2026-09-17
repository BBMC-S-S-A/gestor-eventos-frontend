# GESTEK · Mapa de independencia: salir de Supabase, servicio por servicio

Escrito el **28 de agosto de 2026**. Es el documento de desarrollo: qué guarda
Supabase hoy de lo nuestro, con qué se reemplaza cada pieza, **en qué carpeta
vive** y en qué orden se hace.

Complementa a `SUPABASE.md` (el estado medido) y a `TRASPASO.md`. Sustituye el
plan de `MIGRACION-SUPABASE.md` en un punto de fondo: aquel documento decía
«mover el servidor, no reescribir la aplicación», y eso valía mientras el
destino fuera Postgres. **El servidor de destino sólo tiene MySQL**, así que la
regla cambia y este documento explica en qué.

Todos los números vienen de consultar el proyecto de producción
(`yopontbwgdybfsniqawz`) y los dos repos hoy. Lo no verificado está marcado en
la sección 10.

---

## Estado — 29 de agosto

| Fase | Qué | Estado |
|---|---|---|
| 0 | `qr_token` y correo fuera de la URL, limitador del oráculo | **Código hecho** |
| 0 | Cerrar `profiles` y las tablas con contacto en Supabase | **Aplicado en producción el 29** |
| 0 | Barrer los huérfanos del Storage | Lista y script hechos. Falta ejecutarlo: pide la service key |
| 1 | Verificación local del token | **Hecho** |
| 1.b | Backend de Render a cPanel | **Código y guía hechos** (`app.js`, crons, `.cpanel.yml`, `DESPLIEGUE-CPANEL.md`). Falta hacerlo en el panel |
| 2 | `core/` + `modules/` + migraciones numeradas | **Hecho** |
| 3 | Sondeo que se calla, avisos agrupados | **Hecho** (SSE, pendiente de probar el proxy) |
| 4 | **Identidad propia sobre MySQL** | **Código hecho y probado**, en `parches/`. Falta la configuración: `CONFIGURAR.md` |
| 5 | **Archivos propios** | **Código hecho y probado**, en `parches/`. Falta copiar y reescribir |
| 6 | Las 71 tablas a MySQL | Pendiente |
| 7 | Permisos que sustituyan a RLS | **Andamiaje hecho**: `puede()`, `exige()` y la prueba que pasa lista a las 279 rutas. 32 declaradas, 247 por declarar |

La fase 4 incluye el módulo entero (usuarios, Google, sesiones con rotación,
recuperación, freno por cuenta), el adaptador del frontend con interruptor para
volver atrás, las dos pantallas que faltaban —confirmar y restablecer, que
seguían hablando con Supabase—, el script que trae las 29 cuentas conservando
UUID y hashes, y el que comprueba la base.

La fase 5 incluye `modules/archivos/` con su interruptor aparte, el script que
copia los objetos del Storage saltándose los huérfanos, y el SQL que reescribe
las 13 columnas dentro de una transacción comparando los conteos. Los cuatro
problemas de `SUPABASE.md` §3.4 quedan arreglados por construcción: el archivo
anterior se borra, `form-uploads` deja de aceptar a cualquiera, las hojas de
vida salen del bucket público, y empiezan a poder subirse.

La fase 1.b es `app.js` para Passenger, los dos ciclos sacados del proceso a
los Trabajos de cron de cPanel, el `.cpanel.yml` que reinicia Passenger y
`DESPLIEGUE-CPANEL.md` con el orden completo. Falta hacerlo en el panel.

**116 pruebas nuevas. Las 257 de la suite pasan.**

Medido otra vez contra producción, el 29: **29 usuarios, 10 con contraseña y
los 10 con hash bcrypt, 22 identidades de Google, 9 de tipo `email`** —el
descuadre de 10 contra 9 sigue ahí, y el script lo señala por nombre— y las
**57 filas con URL dentro repartidas en las 13 columnas**, exactamente los
mismos conteos del 28.

> ### La lectura anónima, cerrada el 29 — y era peor de lo escrito
>
> La política de `profiles` decía `((auth.uid() = id) OR true)`. Alguien
> escribió la correcta y luego le pegó un `OR true`, que la anula entera.
>
> Lo que este documento decía que se leía —29 correos, 24 teléfonos, 2 tokens
> de MercadoPago— era la mitad. La tabla también guarda `wompi_private_key`,
> `wompi_events_secret`, `wompi_integrity_secret` y `google_refresh_token`. Hoy
> están vacías, pero el agujero ya estaba abierto para el día que alguien
> conecte Wompi.
>
> Aplicado en producción (migración `cerrar_lectura_anonima_de_datos_personales`):
>
> - La política pasa a ser sólo para autenticados. **Anónimo no lee ni una
>   columna de `profiles`.**
> - Los cinco secretos salen del alcance de anon Y de authenticated, con
>   permisos por columna. Ninguna pantalla los pedía —las tres que leen
>   `profiles` piden `mp_user_id`, `mp_public_key` y `mp_connected_at`— y el
>   backend entra con la service key, que no pasa por esto.
> - Los correos de contacto de `torneo_equipos` y `networking_expositores`
>   salen de lo anónimo sin quitar la fila: el cuadro del torneo y la ficha del
>   expositor siguen siendo públicos.
>
> Comprobado después contra las cuatro consultas que el frontend hace a
> `profiles`: las cuatro piden columnas que siguen concedidas.
>
> **La otra mitad, hecha el mismo día.** Entre cuentas autenticadas todavía se
> veían correo y teléfono, porque el chat pedía la ficha entera de otros
> usuarios. Ahora hay una vista `perfiles_publicos` con tres columnas —id,
> nombre y avatar— aplicada ya en producción, y `ChatTab` lee de ahí. El correo
> como nombre de reserva se quitó: los 29 tienen nombre, así que no se usaba.
>
> Falta el último paso, y **no se puede dar hasta que el frontend esté
> desplegado**: `db/migraciones/postgres/002_cerrar_profiles_entre_cuentas.sql`,
> que deja la política en «cada quien la suya». Si se corre antes, el chat se
> queda sin nombres.
>
> La vista es `SECURITY DEFINER` y el linter la marca en rojo. Es a propósito:
> es lo que la hace seguir devolviendo filas cuando la tabla ya no deje leer más
> que la propia.
>
> **Y una buena noticia del linter:** las 21 tablas con RLS activado y sin
> ninguna política no son un agujero. Sin política, RLS deniega por defecto:
> sólo se llega a ellas con la service key, o sea desde el backend.
>
> ### Dónde está el código de la fase 4, y por qué no está donde debería
>
> **En `parches/backend-identidad-propia.patch`, dentro de este repositorio.**
> El código es del backend, pero la app de Claude no tiene permiso de escritura
> sobre `gestor-eventos-backend` (403 en cada `push`) y sí sobre éste.
>
> Esto no es una precaución teórica: **la primera versión de este módulo se
> escribió el 28, se probó, no se pudo subir, y se perdió al reciclarse el
> contenedor.** Lo que hay ahora es la segunda, guardada donde sí se puede
> subir. Instrucciones para aplicarlo, en `parches/README.md`.
>
> Se arregla de una vez cuando un administrador instale la app sobre el
> repositorio del backend. Hasta entonces, todo lo que toque backend termina en
> `parches/` antes de cerrar la sesión.

---

## 0 · Los tres criterios que gobiernan todo lo que sigue

1. **Todo propio.** Ningún servicio de terceros en el camino crítico.
2. **Todo en el backend, en carpetas separadas.** Un módulo por servicio, con
   frontera limpia, de modo que cualquiera se pueda sacar y desplegar aparte
   como microservicio sin reescribirlo.
3. **Incremental.** Cada función se migra y se cambia en el momento, no en un
   corte grande al final. Mientras un módulo no esté listo, la app sigue usando
   Supabase para esa pieza y sólo para esa.

---

## 1 · Lo que hay que arreglar esta semana, antes de migrar nada

Esto no depende de la migración y está abierto ahora mismo.

### 1.1 · `profiles` es legible por cualquiera, sin cuenta

> **Cerrado el 29 de agosto.** Lo que sigue es cómo estaba y cómo se midió; el
> arreglo, lo que resultó ser peor de lo escrito aquí, y lo que aún falta están
> en el bloque del estado, arriba. No hay que volver a aplicar nada de esto.

La política `profiles_select_self` está escrita así:

```
((auth.uid() = id) OR true)
```

El `OR true` la anula entera. Comprobado con una petición real, sin sesión, con
la clave anónima que va publicada en el JavaScript del navegador:

```
HTTP 200 — filas devueltas SIN sesión: 29
con email: 29 | con teléfono: 23 | con mp_access_token: 2
```

Los 29 correos, 23 teléfonos y **dos access tokens de MercadoPago en claro**.
Cualquiera con un `curl`. Dos arreglos, los dos necesarios:

- Quitar el `OR true`.
- Sacar los secretos de `profiles` a una tabla aparte que el navegador no pueda
  consultar nunca: `mp_access_token`, `wompi_private_key`, `wompi_events_secret`,
  `wompi_integrity_secret`, `google_refresh_token`. Aunque la política quede
  correcta, esas columnas no deben vivir en una tabla que el front consulta.

### 1.2 · Otras tablas con lectura abierta

Barrido de las 76 políticas buscando `true`:

| Tabla | Política | Veredicto |
|---|---|---|
| `profiles` | `(auth.uid() = id) OR true` | **Error. Cerrar ya** |
| `torneo_equipos` | `true` | Filtra `contacto_email` — **3 correos reales, medidos** |
| `networking_expositores` | `true` | Filtra `contacto_email`/`contacto_telefono`. Hoy 0 rellenos, pero la puerta está abierta |
| `evento_legal` | `true` | Aceptable: textos legales, son públicos por diseño |
| `categorias`, `torneos`, `torneo_partidos`, `networking_horarios` | `true` | Aceptable: son las páginas públicas |

Las dos primeras se arreglan con una vista pública que no exponga columnas de
contacto, o moviendo esas lecturas al backend.

### 1.3 · Datos sensibles viajando en la URL

Lo que va en la ruta o en la query **queda escrito en los logs de acceso del
servidor en texto plano, en el historial del navegador y en la cabecera
`Referer`**. Lo que va en el cuerpo de un POST, no. Tres casos medidos:

| Dónde | Qué viaja | Gravedad |
|---|---|---|
| `expositor.js:244`, `interacciones.js:271` | `?qr_token=…&codigo=…` | **Alta.** Es la credencial que valida una boleta |
| `AuthContext.jsx:96` → `eventos.publicos.js:777` | `?email=…` | Media. Dato personal registrado en los logs |
| `eventos.publicos.js:777` | — | **Es un oráculo**: endpoint público sin sesión que confirma si un correo tiene invitación. Sin límite de peticiones, permite enumerar |

Los dos primeros se arreglan moviendo el dato al cuerpo de un POST o a una
cabecera. El tercero, con `authLimiter` y devolviendo siempre la misma forma de
respuesta tarde lo que tarde.

**Lo que no hay que hacer: ofuscar las rutas.** Con HTTPS la ruta ya viaja
cifrada — un atacante en la red ve el dominio, no el camino. Poner un
identificador de sesión dentro de la URL, al estilo del `cpsess…` de cPanel, es
justo lo contrario de una mejora: convierte la credencial en algo que se guarda
en historiales y logs. Lo que protege de verdad es que el dato sensible **no esté
en la URL**, que el token vaya en cookie `httpOnly` (§5.5), y que haya freno
contra la fuerza bruta.

**Y una de operación, no de código:** al panel y a phpMyAdmin hay que entrar por
el **dominio**, nunca por la IP (`https://162.214.73.93:2083`). Por IP el
certificado no valida —el navegador lo marca «No seguro»— y la sesión de cPanel,
que lleva su token en la URL, queda expuesta a intercepción activa.

### 1.4 · Lo que ya estaba anotado y sigue sin tocar

De `SUPABASE.md` §3.4, sin cambios: subida anónima abierta a `form-uploads`,
hojas de vida en bucket público, 40 objetos huérfanos (28 MB), y la subida de CV
que no puede funcionar. Y 21 tablas con RLS activo y **ninguna política**, entre
ellas `oauth_tokens`, `evento_smtp`, `organizador_conexiones` y `cobros_vacantes`.
Hoy no filtran porque el backend entra con la service key; el día que algo del
navegador las consulte, fallan o responden de más.

---

## 2 · El motor y el servidor, medidos

**MySQL 8.0.46** sobre hosting compartido con **cPanel**, con Node por
Application Manager. Todo lo de esta sección está comprobado contra el panel y
contra el propio servidor. Aun así conviene saber qué cuesta el cambio de motor,
porque no es «cambiar la cadena de conexión».

### 2.0 · El servidor, medido

Hosting **compartido** con cPanel (dice *Shared IP Address*), usuario `gestek`,
home `/home/gestek`, dominio principal `gestekeventost.dpdns.org`. No hay root,
lo que corrige lo que daba por bueno `TRASPASO.md`. Pero **sí corre Node**, y eso
es lo que decide que el plan sea viable.

**Node corre por Application Manager (Phusion Passenger).** No aparece como
«Setup Node.js App» ni lo encuentra el buscador con «node»: está en Software →
**Application Manager**. Ya hay dos aplicaciones registradas y habilitadas:

| Nombre | Dominio | Ruta |
|---|---|---|
| `gestek-backend` | `api.gestekeventost.dpdns.org` | `/gestek-api` |
| `gestek-mailer` | `api.gestekeventost.dpdns.org` | `/gestek-mailer` |

Comprobado contra el servidor: `GET /health` responde `200` en **0,78 s** con
`X-Powered-By: Express, Phusion Passenger(R) 6.1.8`. **Express corre aquí tal
cual, sin reescribir nada.** Lo que todavía no está desplegado es el backend
completo: `/categorias` devuelve 404, así que hoy sólo vive ahí un `/health`.

**Cuotas del plan, medidas:**

| Recurso | Estado | Lectura |
|---|---|---|
| **Banda ancha** | 2,87 MB / **∞** | **Ilimitada.** Cierra el asunto del egress que venía del 13 de agosto |
| Disco | 536 MB / **9,81 GB** | Los 80 MB de archivos caben de sobra |
| Base de datos | 0 / 9,29 GB | Los 22 MB no son nada |
| **Bases de datos** | **0 / 2** | Llega para una, pero sin margen para otra de pruebas al lado |
| **Cuentas de correo** | **2 / 2** | **Al límite.** Para el SMTP de la app hay que reutilizar una o ampliar |
| Terminal, SSH, Trabajos de cron, Git | Disponibles | Sirven para desplegar y programar tareas |

**Lo que sigue condicionado por ser compartido:**

| Pieza | Consecuencia |
|---|---|
| **SSE** (§7) | Hay **Nginx delante con caché activa**. Puede bufferizar el flujo y dejarlo sin salir. **Hay que probarlo antes de construir el módulo** |
| Archivos privados (§6) | `X-Accel-Redirect` sí es viable porque el proxy es Nginx, pero hay que confirmar que se puede configurar desde el plan |
| **`node-cron`** | Passenger **duerme el proceso cuando no hay tráfico**, y un cron dentro del proceso no se ejecuta si el proceso no existe. Los recordatorios de `lib/recordatorios.js` **no se pueden quedar ahí**: van a los *Trabajos de cron* de cPanel, llamando a un endpoint |
| Módulos como microservicios (§4) | Se pueden registrar varias apps —ya hay dos—, pero todas comparten los recursos del mismo plan |

**Verificación pendiente antes de la fase 3:** un endpoint SSE de prueba que
emita una línea por segundo. Si llega goteando, hay SSE. Si llega todo junto al
final, está bufferizado y el módulo de tiempo real usa sondeo largo (30–60 s),
que sigue siendo cien veces menos tráfico que los 5 segundos de hoy.

### 2.0.a · Dónde vive el backend: cPanel, no Render

Hoy el backend está en Render, plan gratuito. Medido hoy, una detrás de otra:

| | Primera petición | Segunda |
|---|---|---|
| **Render** | **21,4 s** | 0,19 s |
| **cPanel** | 0,78 s | 0,78 s |

Veintiún segundos de arranque en frío. Es la causa del sondeo (§7.3) y la razón
de las decenas de miles de peticiones. **La recomendación es mover el backend a
cPanel**, y no por rendimiento: por dos razones concretas.

1. **Desaparece el arranque en frío**, y con él la razón de existir del sondeo.
2. **La base queda al lado.** Si el backend se queda en Render y la base pasa a
   MySQL aquí, hay que abrirla por *Remote Database Access* — y Render en plan
   gratuito **no tiene IP fija**, así que habría que autorizar `%`: MySQL
   expuesto a internet con usuario y contraseña como única defensa, para una
   base con los datos de 7.000 asistentes. Con el backend en cPanel, la conexión
   es local y no se expone nada.

**Seguir con Express no obliga a seguir en Render:** Passenger ejecuta el mismo
`index.js` sin cambios, y ya está probado en este servidor.

### 2.0.b · El motor, confirmado: MySQL 8.0.46

**MySQL 8.0.46 Community Server**, no MariaDB — que era el riesgo. Conexión por
**socket UNIX local**, PHP 8.4.24, phpMyAdmin 5.2.3. Todavía no hay ninguna base
creada: sólo están `information_schema` y `performance_schema`.

Con MySQL 8 se confirma lo que este documento daba por supuesto:

- **Tipo `JSON` nativo**, binario y validado. Las cinco columnas JSON de §6.2 se
  migran como `JSON` y las funciones `JSON_EXTRACT` / `JSON_SET` están completas.
- **Columnas generadas indexables** sobre campos del JSON, si hiciera falta
  buscar dentro.
- CTEs y funciones de ventana disponibles, que es lo que hace falta para
  reescribir algunas de las 20 funciones plpgsql sin retorcerlas.

Y el socket local refuerza §2.0.a: con el backend en este mismo servidor, la
base no sale a la red en ningún momento.

**Dos trampas que hay que evitar al crear la base, no después:**

**a) El juego de caracteres del servidor es `utf8mb3`, no `utf8mb4`.** Es el
valor por defecto de la instalación, y `utf8mb3` **no puede almacenar emojis** ni
nada fuera del plano básico: los guarda mal o corta la cadena. Tenemos nombres de
eventos y mensajes de chat con emoji. La base y las tablas hay que crearlas
**explícitamente** así:

```sql
CREATE DATABASE gestek
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
```

Y comprobar después que ninguna tabla se creó con el valor heredado. Si esto se
descubre con datos dentro, se arregla, pero es una conversión de toda la base.

**b) Los UUID: `CHAR(36) CHARACTER SET ascii`.** Un `CHAR(36)` en `utf8mb4`
reserva **144 bytes** por valor en cada índice, y aquí los UUID son la clave
primaria de casi todo y viajan por claves ajenas en las 71 tablas. Declarando esa
columna en `ascii` son 36 bytes: cuatro veces menos índice, sin tocar una línea
de código. `BINARY(16)` con `UUID_TO_BIN()` sería aún mejor en espacio, pero
obliga a convertir en cada consulta y a que el UUID deje de leerse a simple
vista; no compensa para nuestro tamaño.

**Lo que se traduce solo:** las tablas, los índices, las claves ajenas, y las
consultas normales. El grueso del esquema pasa sin drama.

**Lo que hay que reescribir a mano:**

| Pieza Postgres | Cuánto hay | Qué se hace en MySQL |
|---|---|---|
| `jsonb` (`page_json`, `gallery`, `branding`, `paginas`, `respuestas`) | 5 columnas | Tipo `JSON` de MySQL 8. Los operadores cambian: hay que revisar cada consulta que los use |
| `uuid` nativo | Todas las claves | `CHAR(36)` o `BINARY(16)`. **Los valores se conservan tal cual** — es innegociable, están referenciados por claves ajenas en todo el esquema |
| Funciones plpgsql | 20 | Reescribir en SQL de MySQL o, mejor, subirlas a JavaScript en el backend |
| Triggers | 22 | Igual: la mayoría se lleva mejor en el backend, donde se pueden probar |
| Extensiones (`pgcrypto`, `uuid-ossp`…) | 6 | No existen. Lo que dan se hace en Node |
| Políticas RLS | 76 | **No existen en MySQL.** Ver abajo |
| Vistas | 3 | Revisar una a una |

**Sobre las RLS, la buena noticia medida:** el backend entra con `service_role`,
que ya se salta RLS, y hace su propia autorización comparando contra
`req.user.id` (297 veces). El navegador sólo habla directo con la base en
**cuatro sitios, todos contra `profiles`**. Es decir: las 76 políticas hoy casi
no protegen nada real. No hay que traducir 76 políticas a MySQL — hay que mover
4 llamadas al backend y que la autorización viva donde ya vive. Eso reduce el
trabajo de meses a días, pero **sube la apuesta**: cuando RLS desaparezca no
habrá red de seguridad debajo, así que cada endpoint tiene que comprobar
permisos de verdad. Ver §4.4.

---

## 3 · Inventario: qué de Supabase guarda cosas nuestras

Un módulo por fila. La columna «carpeta» es dónde vive en el backend.

| # | Servicio hoy | Qué guarda / hace | Reemplazo propio | Carpeta |
|---|---|---|---|---|
| 1 | **Auth (GoTrue)** | 29 usuarios, contraseñas, identidades Google, sesiones | Módulo de identidad propio | `modules/auth/` |
| 2 | **Postgres vía PostgREST** | 71 tablas, todos los datos | MySQL + capa de datos propia | `modules/*/repositorio.js` + `db/` |
| 3 | **Storage** | 107 objetos, 80 MB: portadas, avatares, documentos, CV | Módulo de archivos en disco propio | `modules/archivos/` |
| 4 | **Realtime** | 3 canales: notificaciones, aforo, chat | SSE propio | `modules/tiempo-real/` |
| 5 | **pg_cron / pg_net** | 1 job desactivado, 1.981 fallos | Ya está en `node-cron` | `modules/tareas/` |
| 6 | **Edge Functions** | `quick-processor`, un Hello World de ejemplo | Nada. Se borra | — |

Los dos últimos son peso muerto: se borran antes de empezar y no se reemplazan
por nada.

---

## 4 · Arquitectura de carpetas

### 4.1 · Cómo está hoy

19.789 líneas. 38 archivos de rutas montados a mano en `index.js`, algunos con
más de mil líneas (`eventos.publicos.js` 1.027, `clientes.js` 975, `torneos.js`
801). No hay separación entre ruta, lógica y acceso a datos: un archivo de
`routes/` decide permisos, ejecuta la consulta y arma la respuesta. Nueve
`app.use('/')` distintos montan rutas en la raíz, así que para saber qué atiende
un endpoint hay que leer varios archivos.

Eso no es sostenible para lo que viene, porque la migración toca justo lo que
está mezclado: el acceso a datos.

### 4.2 · Cómo debería quedar

Cada módulo es autocontenido y expone **una sola puerta** (`index.js`). Nadie
importa el interior de otro módulo. Esa regla es la que permite sacar cualquier
carpeta y desplegarla aparte sin tocar su código.

```
backend/
├── index.js                    # sólo arranque y montaje
├── core/                       # lo transversal, sin lógica de negocio
│   ├── db/                     # conexión MySQL, pool, transacciones
│   ├── errores/
│   ├── config/                 # lee el entorno, valida al arrancar
│   └── log/
├── modules/
│   ├── auth/                   # ← el primero (§5)
│   │   ├── index.js            # única puerta: rutas + middleware exportado
│   │   ├── rutas.js
│   │   ├── servicio.js         # login, registro, refresco, recuperación
│   │   ├── tokens.js           # emisión y verificación
│   │   ├── google.js           # OAuth
│   │   ├── repositorio.js      # ÚNICO sitio que toca la tabla de usuarios
│   │   └── correos/
│   ├── archivos/               # ← el segundo (§6)
│   ├── tiempo-real/            # ← el tercero (§7)
│   ├── eventos/
│   ├── tickets/
│   ├── pagos/
│   ├── correo/
│   └── ...
└── db/
    └── migraciones/            # numeradas, en orden, sin excepción
```

**Las tres reglas que hacen que esto sirva de algo:**

1. **Sólo `repositorio.js` toca la base.** Ninguna ruta escribe SQL. Cuando se
   cambie de motor, se toca un archivo por módulo, no ciento.
2. **Nadie importa el interior de otro módulo**, sólo su `index.js`. Si
   `tickets` necesita algo de `auth`, lo pide por la puerta.
3. **Un módulo no sabe que existe HTTP** más allá de su `rutas.js`. Así el día
   que se saque a microservicio, sólo cambia cómo entra la petición.

### 4.3 · Cómo se llega ahí sin parar el trabajo

No se reorganiza todo de golpe. Se crea `core/` y `modules/`, y **cada vez que
se migra un servicio, ese servicio nace ya en su carpeta nueva**. Lo viejo se
queda en `routes/` hasta que le toque. Al final `routes/` queda vacío y se borra.

### 4.4 · La autorización, que hoy la sostiene RLS a medias

Cuando RLS desaparezca, cada endpoint tiene que comprobar permisos por sí mismo.
Hoy eso se hace a mano en cada handler comparando `owner_id` contra
`req.user.id`. Con 38 archivos y 312 usos de `req.user`, la probabilidad de que
alguno se olvide no es teórica. La medida concreta: un único helper
`puede(usuario, accion, recurso)` en `core/`, y una prueba automática que
recorra todas las rutas registradas y falle si alguna no declara qué permiso
exige. Es la pieza que sustituye a las 76 políticas, y hay que escribirla
**antes** de apagar RLS, no después.

---

## 5 · Módulo 1 · Auth (`modules/auth/`)

Es el primero porque todo lo demás depende de él.

### 5.1 · Qué hace Supabase Auth hoy, función por función

Esto es lo que hay que cubrir. Nada más, y nada menos.

| Función | Dónde se usa hoy | Qué hará el módulo propio |
|---|---|---|
| Iniciar sesión con contraseña | `AuthContext.jsx:168` | `POST /auth/login` → verifica bcrypt, emite tokens |
| Registro | `AuthContext.jsx:176` | `POST /auth/registro` → crea usuario + envía correo de confirmación |
| Cerrar sesión | `AuthContext.jsx:194`, `client.js:37` | `POST /auth/logout` → revoca el refresh |
| Entrar con Google | `AuthContext.jsx:202` | `GET /auth/google` → consentimiento; el callback abre sesión |
| Recuperar contraseña | `AuthContext.jsx:212` | `POST /auth/recuperar` → correo con enlace de un solo uso |
| Cambiar contraseña | `AuthContext.jsx:220`, `:226` | `PATCH /auth/password` |
| Actualizar metadatos | `AuthContext.jsx:226` y 3 pantallas | `PATCH /auth/perfil` |
| Reenviar confirmación | `AuthContext.jsx:240` | `POST /auth/reenviar` |
| Confirmar correo | `ConfirmarPage.jsx` | `GET /auth/confirmar?token=` |
| Leer sesión / refrescar | `AuthContext.jsx:137`, `client.js:16` | `POST /auth/refresh` |
| Validar token en el backend | `middleware/auth.js:11` y `:23` | Verificación **local**, sin red |

### 5.2 · La mitad ya está escrita

`lib/oauth.js` es un servidor de tokens propio, hoy en producción para el MCP:
tokens aleatorios guardados como hash SHA-256, refresco con rotación (revoca el
anterior), revocación, PKCE S256, sobre `oauth_clients`, `oauth_codes` y
`oauth_tokens`. Ese es el motor de sesiones y **se reutiliza tal cual**.

`lib/googleCalendar.js` ya tiene el flujo OAuth de Google completo: `authUrl`,
`state` firmado, `intercambiarCodigo`, lectura de `userinfo`. Para «entrar con
Google» sólo cambia el scope y qué se hace al volver.

Lo que falta de verdad: la tabla de usuarios, la verificación de contraseña, los
endpoints, y conectar el middleware.

**Y el freno contra fuerza bruta también está listo.** `config/security.js` define
un `authLimiter` que hoy sólo se aplica a `pagos.js`, con un comentario que dice
que se dejó preparado «por si se agregan endpoints propios `/auth`». Es
exactamente lo que se va a hacer: al montar `modules/auth/` hay que enchufarlo a
`/auth/login`, `/auth/recuperar` y `/auth/registro`, que son las tres puertas que
se atacan por repetición.

### 5.3 · Los datos que se migran

```
usuarios: 29 · con contraseña: 10 · identidades Google: 22 · sesiones vivas: 21
```

- **Las contraseñas se migran intactas.** Los 10 hashes son `$2a$`, bcrypt
  estándar: `bcryptjs` los verifica sin tocarlos. **Nadie restablece nada.**
- **Los UUID se conservan exactamente.** Están referenciados por claves ajenas
  en todo el esquema y por `profiles.id`. Cambiar uno rompe el evento entero.
- **Las 22 identidades de Google** se migran con su `sub`, y hay que usar el
  **mismo `client_id`**. Si cambia, esos 22 usuarios no entran aunque sus filas
  estén perfectas.
- **Descuadre que hay que mirar antes de migrar:** hay 10 usuarios con
  contraseña pero sólo 9 identidades de tipo `email`. Uno está descolocado; si
  no se revisa, se queda sin poder entrar.

### 5.4 · El cambio que más rinde por línea

`middleware/auth.js` llama hoy a `supabase.auth.getUser(token)` **en cada
petición**: una llamada de red a Supabase por cada petición que hace la app.
Sustituirla por una verificación local de firma son unas quince líneas, y con
compatibilidad hacia atrás (si el token no valida con nuestro secreto, cae al
método viejo) **no se toca ninguno de los 38 archivos de rutas ni las 312
referencias a `req.user`, y las 21 sesiones vivas no se cortan**.

Esto conecta directamente con §7: hoy cada petición del sondeo cuesta dos viajes.

### 5.5 · El frontend casi no se entera

De los 23 usos de `supabase.auth`, **11 están dentro de `AuthContext.jsx`**.
Si el contexto conserva su superficie hacia fuera (`login`, `register`,
`logout`, `signInWithGoogle`, `resetPassword`, `updatePassword`,
`updateProfile`, `resendConfirmation`), **ninguna otra pantalla cambia**.
Quedan sueltos 4 `getSession()` que sólo sacan el token para subir archivos, y
4 `updateUser`.

Un cambio que sí conviene hacer de paso: hoy el token vive en `localStorage`,
donde cualquier XSS lo lee. Con backend propio se puede usar cookie `httpOnly`
+ refresh, que es la razón principal por la que hacerlo propio mejora la
seguridad en vez de sólo moverla.

---

## 6 · Módulo 2 · Archivos e imágenes (`modules/archivos/`)

### 6.1 · Dónde están hoy y dónde quedarían

Tres buckets públicos, 107 objetos, 80 MB. Todo lo sube **el navegador directo
contra Supabase**; el backend no toca Storage en absoluto. Eso se invierte: el
navegador sube al backend, y el backend escribe en disco.

| Hoy | Mañana |
|---|---|
| `avatars/<uid>/avatar-<ts>.jpg` | `/var/gestek/archivos/avatars/<uid>/…` |
| `event-media/<uid>/…` | `/var/gestek/archivos/event-media/<uid>/…` |
| `form-uploads/<eventoId>/…` | `/var/gestek/archivos/form-uploads/<eventoId>/…` |

**La estructura de carpetas se conserva idéntica.** Es lo que convierte la
reescritura de URLs en una sustitución de prefijo y nada más.

Fuera del repo y fuera de la carpeta del código: un disco montado, para que un
despliegue no se lleve los archivos por delante. Servidos por Nginx directamente
(no por Node), con `X-Accel-Redirect` para los privados.

### 6.2 · Las URL están dentro de las filas

Es lo que convierte «copiar archivos» en migración de datos: lo guardado no es
la ruta, es la URL absoluta con el host de Supabase dentro. **13 columnas en 9
tablas, 57 filas**, y **cinco de esas columnas son JSON** (`gallery`,
`page_json`, `paginas`, `branding`, `tickets.respuestas`), donde la URL está a
profundidad variable y un `replace` sobre texto no las alcanza. La tabla
completa y las sentencias que sí funcionan están en `SUPABASE.md` §3.3 y §6.4.

Orden obligatorio: copiar → servir las dos copias en paralelo → reescribir
dentro de una transacción comparando los conteos (16, 13, 5, 5, 4, 4, 3, 2, 1,
1, 1, 1, 1) → y sólo cuando cuadren, apagar el origen.

### 6.3 · Lo que se arregla al pasar por el backend

Los cuatro problemas de `SUPABASE.md` §3.4 desaparecen solos cuando la subida
pasa por nuestro servidor, porque ahí sí se puede validar: tipo real (no la
extensión), tamaño, cuota por usuario, y **borrar el archivo anterior** — que es
lo que hoy no hace nadie salvo `DocumentosSection`, y por lo que hay 40
huérfanos y 28 MB de basura. Los CV dejan de estar en un bucket público y pasan
a servirse con enlace firmado y caducidad.

---

## 7 · Módulo 3 · Tiempo real y el problema de las peticiones

### 7.1 · Lo que está medido

En 24 horas, contra Supabase: **1.170 peticiones, de las cuales 861 (74%) son
`/realtime/v1/websocket`**. Un WebSocket sano se abre una vez y dura horas; 861
aperturas con tres personas es reconexión constante, no uso.

**Las ~70.000 peticiones de ayer no aparecen aquí.** No pasaron por Supabase:
van contra el backend propio. Desde esta sesión no puedo verlas — hay que
mirarlas en el panel de Render o en la pestaña de red del navegador. Lo que sí
puedo hacer es explicar de dónde salen, porque los multiplicadores están en el
código y son tres:

**a) Sondeo fijo.** `AforoSection.jsx:89` pide cada **5 segundos**
(`REFRESCO_MS`); `AccesosSection.jsx:56` cada **8 segundos**. Son 720 y 450
peticiones por hora **por pestaña abierta**. Tres personas con las dos pantallas
abiertas una jornada de 8 horas: ~28.000 peticiones, sin que nadie haga nada.

**b) El amplificador cuadrático.** `useAsistenciaEnVivo.js:35` se suscribe a
`event: '*'` sobre `tickets` y, **por cada cambio en cualquier ticket**, lanza
`refrescar()`, que es otra petición al backend. Con N pantallas abiertas y M
escaneos en la puerta, son **N×M peticiones**. En una jornada de check-in real
es exactamente el patrón que dispara los números a decenas de miles. Este es el
duplicador que se sospechaba, y está aquí.

**c) Cada petición cuesta dos viajes.** Todas pasan por `middleware/auth.js`,
que llama a Supabase para validar el token. El sondeo no multiplica peticiones:
multiplica pares de peticiones. §5.4 lo corta a la mitad de un plumazo.

### 7.2 · Qué se hace

1. **Verificación local del token** (§5.4). Es lo más barato y quita la mitad
   del tráfico sin tocar ninguna pantalla.
2. **Reemplazar el sondeo por SSE** — *si cPanel lo permite*, ver §2.0. Una
   conexión abierta por pantalla, y el servidor empuja cuando algo cambia. El
   aforo pasa de 720 peticiones/hora a una conexión. Si el proxy bufferiza,
   sondeo largo de 30–60 s: peor, pero sigue siendo cien veces menos que hoy.
3. **Que el evento traiga el dato.** El error de `useAsistenciaEnVivo` no es
   suscribirse: es que al recibir el aviso vuelve a preguntar. Si el mensaje ya
   trae el número nuevo, la petición extra sobra entera.
4. **Parar cuando la pestaña no se ve.** Con `visibilitychange` — hoy no hay
   ni uno en todo el frontend. Un portátil olvidado abierto toda la noche
   sondea igual que uno en uso.
5. **Instrumentar antes y después.** Un contador de peticiones por minuto en el
   backend, para que «mejoró» sea un número y no una impresión.

### 7.3 · Por qué se congela: no es Supabase

El sondeo se puso con la idea de que **Supabase se congela si no recibe
peticiones**, por ser plan gratuito. Medido, eso no es lo que pasa:

- El **28 de agosto, de 07:00 a 15:00, el proyecto recibió 1 petición por hora
  durante ocho horas seguidas**, y siguió `ACTIVE_HEALTHY`. Si se congelara por
  falta de tráfico, esas ocho horas lo habrían tumbado.
- La pausa del plan gratuito de Supabase existe, pero es tras **7 días completos
  sin actividad**, y es una pausa explícita que se deshace desde el panel. No es
  algo que se cure sondeando cada 5 segundos.
- Los síntomas no coinciden. Con Supabase dormido la app daría **errores de red**
  (503, peticiones fallidas). Lo que se observa es la **interfaz congelada**, que
  es el navegador, no el servidor.

**La causa, medida:** es **Render**, que en plan gratuito duerme el servicio por
inactividad. Dos peticiones seguidas al mismo endpoint, hoy:

| | Primera petición | Segunda |
|---|---|---|
| **Render** | **21,4 s** | 0,19 s |
| cPanel (Passenger) | 0,78 s | 0,78 s |

Veintiún segundos esperando la primera respuesta. Eso es lo que se percibe como
«la página se congeló», y es lo que el sondeo cada 5 segundos venía tapando: al
mantener tráfico constante, Render nunca se dormía. **El sondeo funcionaba, pero
por una razón distinta a la que se creía, y contra Render, no contra Supabase.**

**La solución no es sondear desde siete navegadores.** En orden de preferencia:

1. **Mover el backend a cPanel** (§2.0.a). El arranque en frío desaparece y de
   paso la base queda al lado. Es la salida buena.
2. Si se queda en Render por ahora: **un solo ping cada 10 minutos** desde los
   *Trabajos de cron* de cPanel. Mismo efecto que 7 navegadores sondeando, con
   cuatro órdenes de magnitud menos de tráfico.

**Queda una comprobación pendiente**, y conviene no saltársela: con el backend ya
despierto, ¿la interfaz sigue congelándose tras un rato largo de uso? Si sí,
además del arranque en frío hay algo en el navegador —fuga de memoria, listeners
acumulados, un bucle de renders— y eso el SSE lo heredaría igual que el sondeo.

---

## 8 · Orden de trabajo

Cada fase deja el sistema funcionando. Nada de un corte grande al final.

| Fase | Qué | Depende de | Riesgo |
|---|---|---|---|
| **0** | Cerrar `profiles` y las dos tablas con contacto. Sacar el `qr_token` y el correo de las URL, y poner `authLimiter` al endpoint oráculo (§1.3). Borrar el cron muerto y `quick-processor`. Barrer los 40 huérfanos | Nada | Ninguno |
| **1** | Verificación local del token (§5.4) | Nada | Bajo. Compatible hacia atrás |
| **1.b** | **Mover el backend de Render a cPanel** (§2.0.a). Quita los 21 s de arranque en frío y con ellos la razón del sondeo. Los recordatorios salen de `node-cron` a los *Trabajos de cron* de cPanel | Nada — Passenger ya está probado ahí | Medio |
| **2** | `core/` + `modules/`. Migraciones numeradas | Nada | Ninguno: es andamiaje |
| **3** | Sondeo → SSE, y el evento con el dato dentro (§7.2) | Fase 2 | Bajo |
| **4** | **Auth propio** (§5) en MySQL, conviviendo con Supabase | Fases 1–2 | **Alto**. Ver §9 |
| **5** | Archivos propios (§6) | Fase 2 | Medio |
| **6** | El resto de tablas a MySQL, módulo a módulo | Fase 4 | Alto |
| **7** | Helper de permisos + prueba que recorra las rutas (§4.4) | Fase 6 | **Alto**: es lo que sustituye a RLS |
| **8** | Apagar Supabase | Todas | — |

**En septiembre no se migra nada.** El evento es a mediados de mes y sigue en
pie lo que decía `TRASPASO.md`. Las fases 0 a 3 sí caben antes, porque ninguna
cambia dónde viven los datos y las tres primeras sólo quitan riesgo.

---

## 9 · Credenciales: qué hace falta y cuándo

Nada de esto lo puedo hacer yo, y hay dos que tardan por trámite, no por
trabajo. Conviene pedirlas al empezar la fase anterior, no el día que se usan.

| Qué | Para qué | Cuándo hace falta | Quién |
|---|---|---|---|
| **Acceso a cPanel** (usuario, base MySQL/MariaDB, dominio) y **si hay SSH/root** | Todo. Ver §2.0 | **Antes de la fase 2** | Administrador |
| **Google Cloud Console** | Añadir el nuevo dominio de callback **conservando el `client_id`** | **Fase 4.** Si el `client_id` cambia, los 22 usuarios de Google se quedan fuera | Dueño del proyecto Google |
| **SMTP propio** | Confirmación, recuperación de contraseña | Fase 4 — sin esto no se puede registrar nadie | Sale del propio cPanel, pero las **cuentas están a 2 de 2**: hay que reutilizar una o ampliar |
| ~~Certificado TLS~~ | Cookies `httpOnly` seguras | — | **Ya resuelto**: el SSL del dominio está activo |
| **Secretos nuevos** (`JWT_SECRET`, refresco) | Firmar los tokens | Fase 4 | Se generan; no se reutiliza ninguno de Supabase |
| **`QR_JWT_SECRET`** | Que los QR ya emitidos sigan validando | Fase 6. **Tiene que viajar idéntico** | Ya existe |

El punto crítico es el de Google, y no por dificultad: es una pantalla de la
consola. Es que si se descubre tarde que el `client_id` no se puede conservar,
afecta a **tres de cada cuatro usuarios** y no hay arreglo rápido. Conviene
verificar que se tiene acceso a esa consola **ahora**, no en la fase 4.

---

## 10 · Qué está medido y qué no

**Medido hoy contra producción y contra el código:** la política de `profiles` y
la lectura anónima real (29 filas, 29 correos, 23 teléfonos, 2 tokens de
MercadoPago); las 8 políticas con `true` y qué expone cada una; los 3 correos
de `torneo_equipos`; las 1.170 peticiones de 24 h con 861 WebSockets; los
intervalos de 5 s y 8 s y dónde están; el amplificador de `useAsistenciaEnVivo`;
297 usos de `req.user.id`, 9 de `.email` y 1 de `user_metadata`; las 4 llamadas
directas del navegador a `profiles`; los 23 usos de `supabase.auth` y su reparto;
los 10 hashes `$2a$`; las 22 identidades de Google; el descuadre de 10 contra 9;
19.789 líneas y 38 archivos de rutas; que `lib/oauth.js` y `lib/googleCalendar.js`
ya implementan lo que se creía por escribir.

**Medido contra el servidor de destino:** que es hosting compartido con cPanel;
que **Node corre por Application Manager con Passenger 6.1.8** y ya hay dos
aplicaciones registradas; que `api.gestekeventost.dpdns.org/health` responde 200
en 0,78 s con Express; que el backend completo **no** está desplegado ahí
(`/categorias` da 404); que la banda ancha es ilimitada, el disco 9,81 GB, las
bases de datos 2 y las cuentas de correo 2 de 2; que el motor es **MySQL 8.0.46**
por socket local, con el servidor en `utf8mb3` y sin ninguna base creada aún; y
que **Render tarda 21,4 s en la primera petición y 0,19 s en la segunda**, que es
la causa del congelamiento.

**No medido:**

- **Las ~70.000 peticiones de ayer.** No pasaron por Supabase; hay que verlas en
  Render o en el navegador. La aritmética de §7.1 las explica, pero explicar no
  es medir.
- **Por qué se congela la página.** Lo que sí está medido es que **no es
  Supabase por falta de peticiones** (§7.3): ocho horas seguidas a 1 petición
  por hora y el proyecto siguió sano. La hipótesis de Render dormido explica los
  síntomas, pero no la he podido medir desde aquí — hace falta la pestaña de red
  o el panel de Render.
- **La causa exacta de las 861 reconexiones.** El número es real; el porqué hay
  que instrumentarlo.
- **El egress.** Sigue sin mirarse desde el 13 de agosto, y es el único dato que
  decide si hace falta plan Pro el mes del evento.
- **Nada de este plan se ha ensayado.** La primera vez que se corra, contra una
  copia.
- **Si el proxy deja pasar SSE** (§2.0). Diez minutos de prueba, y condiciona
  todo el módulo de tiempo real.
- **Si la interfaz se congela también con el backend despierto** (§7.3). El
  arranque en frío ya está explicado y medido; lo que no se ha descartado es que
  además haya algo en el navegador.
- **El dominio definitivo.** Hoy es `gestekeventost.dpdns.org`, que parece de
  pruebas. El callback de Google conviene registrarlo una sola vez, con el bueno.

**La trampa de siempre:** `VITE_DEV_BYPASS_AUTH=1` (`AuthContext.jsx:11`) hay
que quitarlo antes de probar de verdad, o la app usa el usuario ficticio y las
pantallas salen vacías.
