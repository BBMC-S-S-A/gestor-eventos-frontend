# GESTEK · Supabase: estado medido y arranque de la migración

Escrito el **28 de agosto de 2026**, contra el proyecto de producción
`GestorEventosMarcaBlanca` (`yopontbwgdybfsniqawz`, Postgres 17.6, `us-east-2`) y
contra el código de los dos repos. Todo lo que aparece como número está
consultado hoy; lo que no se pudo comprobar va marcado como tal en la sección 8.

Este documento **no reemplaza a `MIGRACION-SUPABASE.md`**, que sigue siendo el
plan y la discusión de a dónde ir. Reemplaza sus **números**, que son del 13 de
agosto y varios ya no son ciertos (sección 1), y añade lo que aquel documento
dejaba en una línea: **cómo se guardan las fotos** (sección 3) y **qué hay que
hacer exactamente para arrancar** (sección 6).

---

## 1 · Qué cambió en quince días

| Qué | 13 ago | Hoy | Comentario |
|---|---|---|---|
| Base de datos | 20 MB | **22 MB** | Sigue siendo irrelevante frente a los 500 MB del plan gratis |
| Archivos | 24 MB, 73 objetos | **80 MB, 107 objetos** | **Se triplicó.** Es el número que hay que vigilar, no el de la base |
| Tablas | 63 | **71** | |
| Políticas RLS | 74 | **76** en `public` + 8 en `storage` | |
| Tablas con RLS y sin política | 14 | **21** | La deuda creció, no bajó |
| Usuarios | 28 | **29** | 13 con sesión en los últimos 30 días |
| Job `send-reminders-hourly` | activo, 1.949 fallos | **desactivado**, 1.981 fallos | Alguien lo apagó. Falta borrarlo |
| Edge Function | «`send-reminders`» | **`quick-processor`** | Ver sección 5: no es la que decía el documento |

Lo importante de esta tabla es la segunda fila, y cruzándola con `TRASPASO.md`
se ve peor de lo que parece:

| Archivos | 13 ago | 25 ago | **28 ago** |
|---|---|---|---|
| Total | 24 MB · 73 objetos | 62 MB · 103 objetos | **80 MB · 107 objetos** |
| `event-media` | — | 48 MB | **65 MB** |

No es un goteo de quince días: son **+17 MB en tres días, repartidos en cuatro
objetos**. La acumulación es reciente y va acelerando, sin evento de por medio y
sin que nadie esté subiendo más que antes. La sección 3.4a explica la causa —no
se borra nunca— y es justo la pieza que el plan gratis cobra por tráfico de
salida, no por volumen.

---

## 2 · Inventario medido

| Servicio | Uso real | Volumen | Sacarlo |
|---|---|---|---|
| **Postgres vía PostgREST** | Backend **844** llamadas `.from(`. Frontend 6, todas contra `profiles` | 71 tablas, 3 vistas, 20 funciones, 22 triggers, 76 políticas | Baja **si no se reescribe** — ver sección 6 |
| **Auth (GoTrue)** | Frontend 11 métodos (PKCE). Backend `auth.getUser()` **en cada petición** (`middleware/auth.js:11` y `:23`) | 29 usuarios, **10 con contraseña**, 22 identidades Google, 21 sesiones vivas | Media — y con una trampa, sección 4 |
| **Storage** | Frontend 5 archivos. Backend **0** | 3 buckets públicos, 107 objetos, **80 MB** | Baja de mecánica, alta de detalle — sección 3 |
| **Realtime** | 3 canales: `notif:`, `asistencia:`, `chat:` | Publicación sobre `tickets`, `chat_messages`, `notificaciones` | Media |
| **pg_cron / pg_net / Edge Functions** | — | 1 job desactivado, 1 función de ejemplo | **Ninguna. Es peso muerto** — sección 5 |

Extensiones instaladas, que hay que reproducir tal cual: `pgcrypto`,
`uuid-ossp`, `pg_cron`, `pg_net`, `pg_stat_statements`, `supabase_vault`.

---

## 3 · Cómo almacenamos las fotos

Esta es la parte que el documento anterior despachaba en una fila de tabla, y es
donde está casi todo el trabajo real de la migración.

### 3.1 · Los tres buckets

Los tres son **públicos**: cualquiera con la URL lee el archivo, sin sesión y sin
firma. Las políticas RLS de `storage` sólo gobiernan quién **escribe**.

| Bucket | Límite | Tipos permitidos | Contenido hoy |
|---|---|---|---|
| `avatars` | 3 MB | sólo imagen | 9 objetos, 788 kB |
| `event-media` | 15 MB | imagen, audio, PDF, Office, texto | 82 objetos, **65 MB** |
| `form-uploads` | 4 MB | **sólo** jpeg, png, webp | 16 objetos, 14 MB |

### 3.2 · Quién sube, y a dónde

Cinco sitios en el frontend. El backend **no toca Storage en absoluto**: sube el
navegador directamente contra Supabase con la llave anónima.

| Archivo | Bucket | Ruta que construye |
|---|---|---|
| `AvatarUploader.jsx:21` | `avatars` | `<uid>/avatar-<ts>.<ext>` |
| `CoverUploader.jsx:26` | `event-media` | `<uid>/<prefijo>-<ts>-<rand>.<ext>` |
| `CoverUploader.jsx:34` | `form-uploads` | `expositor/<ownerId>/<prefijo>-<ts>-<rand>.<ext>` *(sin sesión)* |
| `FormPhotoUploader.jsx:37` | `form-uploads` | `<eventoId>/<campoId>-<ts>.<ext>` |
| `PerfilTalentoEditor.jsx:99` | `form-uploads` | `<uid>/cv-<ts>.<ext>` |
| `DocumentosSection.jsx:72` | `event-media` | `<uid>/docs/<eventoId>/<ts>-<rand>.<ext>` |

La convención que sostiene la seguridad es **la carpeta raíz es el uid**: las
políticas de `avatars` y `event-media` exigen
`auth.uid()::text = (storage.foldername(name))[1]`. Está bien pensada y el código
la respeta en los tres sitios que la necesitan.

### 3.3 · La URL pública queda guardada dentro de la fila

Esto es lo que convierte «copiar archivos» en una migración de datos. Lo que se
persiste no es la ruta, es la **URL absoluta completa** que devuelve
`getPublicUrl()`, con el host de Supabase dentro. Buscado en las 71 tablas, no
supuesto — **13 columnas en 9 tablas, 57 filas**:

| Tabla | Columna | Filas | Tipo |
|---|---|---|---|
| `eventos` | `cover_url` | 16 | texto |
| `torneo_equipos` | `foto_url` | 13 | texto |
| `eventos` | `gallery` | 5 | **JSON** |
| `tickets` | `respuestas` | 5 | **JSON** |
| `eventos` | `page_json` | 4 | **JSON** |
| `profiles` | `empresa_logo_url` | 4 | texto |
| `profiles` | `avatar_url` | 3 | texto |
| `chat_messages` | `file_url` | 2 | texto |
| `eventos` | `pago_qr_url` | 1 | texto |
| `speakers` | `foto_url` | 1 | texto |
| `networking_expositores` | `logo_url` | 1 | texto |
| `eventos` | `paginas` | 1 | **JSON** |
| `eventos` | `branding` | 1 | **JSON** |

**Cinco de las trece son JSON**, y ahí las URLs están enterradas a profundidad
variable (`page_json` es el constructor de páginas: la URL puede estar en
cualquier bloque). No se pueden reescribir con un `UPDATE ... = replace(col, ...)`
sobre una columna de texto. La sección 6.4 trae la forma que sí funciona.

Consulta reproducible para volver a sacar esta tabla cuando cambie:

```sql
select * from (
  select c.table_name, c.column_name,
    (xpath('/row/n/text()', query_to_xml(format(
      'select count(*) as n from public.%I where %I::text like ''%%/storage/v1/object/%%''',
      c.table_name, c.column_name), false, true, '')))[1]::text::int as filas
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema='public' and t.table_name=c.table_name and t.table_type='BASE TABLE'
  where c.table_schema='public' and c.data_type in ('text','character varying','jsonb','json')
) s where filas > 0 order by filas desc;
```

### 3.4 · Cuatro problemas del almacenamiento, ninguno arreglado

Van en orden de lo que más importa. **No he tocado nada de esto**; son hallazgos.

**a) 40 objetos huérfanos, 28 MB — más de un tercio del bucket.** Cruzando las
107 rutas de `storage.objects` contra las 67 que alguna fila referencia, sobran
40 archivos que ya no apunta nadie. Sólo `DocumentosSection` borra el archivo al
quitar el registro; los otros cuatro uploaders dejan el anterior donde está cada
vez que alguien cambia su foto. **Esto es lo que explica el salto de 24 a 80 MB.**
No es que se suba más: es que no se borra nunca. Antes de copiar archivos a
ningún sitio conviene barrer esto, porque migrar 80 MB de los que 28 sobran es
pagar el trabajo dos veces.

**b) Cualquiera puede subir a `form-uploads` sin estar autenticado.** La política
es literalmente `bucket_id = 'form-uploads'`, para el rol `public`, sin más
condición. Es deliberado —el expositor sin cuenta edita su ficha por código, lo
dice el comentario en `CoverUploader.jsx:14`— pero el efecto es que con la llave
anónima, que está en el bundle del navegador, **cualquiera en internet puede
escribir en el bucket** hasta 4 MB por archivo, sin límite de cantidad. Y como no
hay política de DELETE, tampoco se puede borrar lo que metan sin la service key.
Para un evento de 7.000 personas con la URL pública circulando, esto es la vía
más barata de llenarnos el almacenamiento.

**c) Las hojas de vida están en un bucket público.** `PerfilTalentoEditor` sube
el CV a `form-uploads`, que es de lectura pública. El comentario en
`FormPhotoUploader.jsx:39` dice que se quitó la política de SELECT «para que
nadie pudiera listar las fotos de otros invitados», y es verdad a medias: no se
puede **listar**, pero cada archivo **se lee** por su URL, porque el bucket es
público y eso no pasa por RLS. Con rutas del tipo `<uid>/cv-<timestamp>.pdf`, el
uid se conoce y el timestamp es acotable. Son datos personales.

**d) La subida de hojas de vida no puede funcionar.** El código acepta PDF y
DOCX hasta 8 MB (`archivos.js:37`, `:46`) y sube a `form-uploads`, que sólo
admite **jpeg, png y webp** y **4 MB**. El bucket rechaza el archivo siempre. Lo
confirma el propio almacenamiento: en `form-uploads` hay 16 objetos y **ninguno
es PDF**. Nunca se ha cargado un CV con éxito. Es el mismo patrón del cron de
recordatorios: una función que nadie probó de punta a punta.

---

## 4 · Auth: una corrección al documento de traspaso

`TRASPASO.md` dice que los hashes bcrypt son portables y que **nadie tendría que
restablecer su contraseña**. Medido, eso vale para **10 de los 29 usuarios**.

```
usuarios: 29 · con contraseña: 10 · identidades Google: 22 · sesiones vivas: 21
```

Los otros diecinueve entran **por Google**. Sus contraseñas no existen, así que
no hay hash que migrar: lo que hay que preservar es el flujo de OAuth. Si se
autoaloja GoTrue eso se conserva, pero **no sale gratis**: hay que registrar el
nuevo dominio de callback en Google Cloud Console con las mismas credenciales de
cliente, y si el `client_id` cambia, las 22 identidades no se reconocen y esos
usuarios se quedan fuera aunque sus filas estén intactas.

La afirmación correcta es: *los hashes se migran solos; el OAuth de Google hay
que volver a conectarlo a mano, y afecta a tres de cada cuatro usuarios.*

Lo demás sigue en pie y sigue siendo lo más peligroso: los UUID de `auth.users`
están referenciados por claves ajenas, y `auth.uid()` gobierna las 76 políticas.
Un JWT propio mal formado no da error — deniega todo o deja pasar todo.

---

## 5 · Peso muerto que se borra antes de empezar

- **El job `send-reminders-hourly`** ya está desactivado, con **1.981 de 1.981
  ejecuciones fallidas** y la última el 14 de agosto. Su comando todavía lleva
  los marcadores `<TU_PROJECT_REF>` y `<TU_ANON_KEY>` sin rellenar. Falta
  borrarlo, no sólo apagarlo.
- **La Edge Function `send-reminders` no existe en el proyecto.** El documento
  anterior la daba por desplegada; sólo está el código en
  `supabase/functions/send-reminders/index.ts` del backend. Nunca se subió.
- **Sí hay una Edge Function desplegada y activa: `quick-processor`.** Es el
  ejemplo «Hello World» que Supabase crea al pulsar el botón, subido el 18 de
  mayo, sin ninguna referencia en los dos repos. No hace nada nuestro. Debería
  borrarse.

Con esos tres gestos desaparecen `pg_cron`, `pg_net` y Edge Functions del
inventario, y se cierra de paso el aviso del linter sobre `pg_net` en `public`.
Los recordatorios ya viven en el `node-cron` del backend (`lib/recordatorios.js`).

---

## 6 · Arranque de la migración, en orden

La regla de `MIGRACION-SUPABASE.md` sigue siendo la buena y conviene repetirla:
**la migración mueve el servidor, no reescribe la aplicación.** Con PostgREST +
GoTrue + Storage levantados al lado de Postgres, las 844 llamadas `.from(` no se
tocan; cambian dos variables de entorno. Cualquier etapa que empiece a reescribir
consultas se ha desviado.

Lo que sigue es el arranque concreto, en el orden en que hay que hacerlo.

### 6.1 · Antes de nada: barrer

Los huérfanos (3.4a) y el peso muerto (sección 5). Media hora, riesgo cero, y
evita migrar 28 MB de basura y tres dependencias que no hacen nada.

### 6.2 · Congelar el inventario

Guardar, con fecha, en un archivo del repo: la lista de las 107 rutas de
`storage.objects`, la tabla de 13 columnas de la sección 3.3 y el conteo de filas
por tabla. Es la única forma de verificar después que no se perdió nada, y de
darse cuenta si alguien sube algo durante la ventana de migración.

### 6.3 · El volcado

Tres piezas separadas, y las tres importan:

```bash
# 1 · Esquema y datos de la aplicación
pg_dump --schema=public --no-owner --no-privileges "$SUPABASE_DB_URL" > public.sql

# 2 · Auth: es lo que preserva UUIDs, hashes e identidades de Google
pg_dump --schema=auth --no-owner --no-privileges "$SUPABASE_DB_URL" > auth.sql

# 3 · Storage: los metadatos de los objetos, no los bytes
pg_dump --schema=storage --no-owner --no-privileges "$SUPABASE_DB_URL" > storage.sql
```

Son 22 MB: cuestión de segundos. Las políticas RLS viajan dentro del volcado de
esquema, pero **dependen de que existan los roles** `anon`, `authenticated`,
`service_role` y `supabase_admin` en el destino. Hay que crearlos antes de
restaurar o la restauración falla a mitad, con las tablas ya creadas.

Y las seis extensiones de la sección 2 tienen que estar instaladas **antes** del
volcado de `public`, porque hay columnas y funciones que las usan.

### 6.4 · Los archivos y la reescritura de URLs

Es la parte con más filo. En este orden:

1. **Copiar** los 107 objetos (menos los huérfanos ya barridos) conservando la
   ruta `bucket/carpeta/archivo` tal cual. Si se conserva la estructura, la
   reescritura de abajo es una sustitución de prefijo y nada más.
2. **Servir las dos copias en paralelo** durante toda la ventana. Las URLs viejas
   tienen que seguir respondiendo hasta que la reescritura esté verificada, o
   cada portada que quede sin migrar es un hueco en una página pública.
3. **Reescribir las 13 columnas.** Las ocho de texto son directas:

```sql
update eventos
   set cover_url = replace(cover_url,
        'https://yopontbwgdybfsniqawz.supabase.co/storage/v1/object/public/',
        'https://NUEVO_HOST/archivos/')
 where cover_url like '%/storage/v1/object/public/%';
```

Las cinco de JSON no admiten eso. La forma que funciona es pasar por texto y
volver, en una sola sentencia por columna:

```sql
update eventos
   set page_json = replace(page_json::text,
        'https://yopontbwgdybfsniqawz.supabase.co/storage/v1/object/public/',
        'https://NUEVO_HOST/archivos/')::jsonb
 where page_json::text like '%/storage/v1/object/public/%';
```

Funciona porque la sustitución no cambia la estructura del JSON ni introduce
comillas. **Con una condición que hay que respetar: el host nuevo no puede
contener caracteres que haya que escapar en JSON.** Antes de correrlo en
producción, hacerlo dentro de una transacción y comparar
`count(*)` de filas afectadas contra la tabla de la sección 3.3 — si los números
no cuadran exactamente (16, 13, 5, 5, 4, 4, 3, 2, 1, 1, 1, 1, 1), parar.

4. **Arreglar los uploaders.** Los cinco sitios de la sección 3.2 construyen la
   URL con `getPublicUrl()`. Mientras Storage siga siendo el de Supabase no hay
   nada que hacer; el día que se cambie, es donde hay que tocar. Es también el
   momento natural de arreglar (b), (c) y (d) de la sección 3.4, porque son
   cambios en los mismos cinco archivos.

### 6.5 · Verificar con un usuario real, no con la service key

Es el consejo del documento anterior y hay que subrayarlo, porque con la service
key **todo funciona siempre**: se salta RLS. Las tres pruebas que de verdad
dicen algo:

- Entrar con uno de los 10 usuarios de contraseña y con uno de los 22 de Google.
- Que un usuario sin permiso **no** vea un evento ajeno — es decir, que las
  políticas denieguen, no sólo que permitan.
- Que un QR ya emitido siga validando. `QR_JWT_SECRET` tiene que viajar idéntico.

### 6.6 · Y las 21 tablas sin política

Hoy no filtran nada porque el backend entra con la service key. **En cuanto el
navegador hable directamente con nuestro PostgREST, esas 21 tablas dejan de
responder** —o responden de más— sin mensaje de error que lo explique. Entre
ellas hay `oauth_tokens`, `evento_smtp`, `organizador_conexiones` y
`cobros_vacantes`: credenciales y dinero. Es trabajo que hay que hacer sí o sí
antes de exponer PostgREST, y no aparece en ninguna estimación hasta ahora.

---

## 7 · Lo que hay que decidir antes de escribir código

Sigue vigente la sección 3 de `MIGRACION-SUPABASE.md`: **saber qué máquina es**.
`TRASPASO.md` ya recoge que el administrador tiene root, lo que retira la
objeción de fondo sobre el hosting compartido. Con eso, las dos decisiones que
quedan abiertas son:

1. **Realtime: autoalojar o sustituir.** Tres canales. Notificaciones y
   asistencia aguantan sondeo; el chat pide SSE. No antes del evento.
2. **Storage: propio desde el principio o después.** Se puede migrar la base y
   dejar los archivos en Supabase un tiempo — son piezas independientes. Dado que
   el almacenamiento es lo que crece y lo que se cobra por tráfico, mi
   recomendación es al revés de lo que parece natural: **los archivos primero, la
   base después.**

---

## 8 · Qué está verificado y qué no

**Verificado hoy contra producción:** los tamaños y conteos de la sección 1; los
tres buckets con sus límites y tipos; los 107 objetos y su reparto; los 40
huérfanos y sus 28 MB; las 13 columnas con URLs y sus 57 filas; las 8 políticas
de `storage`; las 21 tablas con RLS sin política; los 29 usuarios con su reparto
de contraseña y Google; el job de cron desactivado con sus 1.981 fallos; que la
Edge Function desplegada es `quick-processor` y no `send-reminders`; que en
`form-uploads` no hay ningún PDF.

**No verificado:**

- **El tráfico de salida real.** Es el techo que el documento anterior señala
  como el primero que se toca, y no se puede medir desde aquí. Está en
  Organization → Usage, y **es el número que de verdad decide** si hace falta el
  plan Pro el mes del evento. Sin él, todo lo que digamos sobre egress es
  aritmética de servilleta.
- **Los límites vigentes del plan gratis.** Supabase los cambia; los del
  documento anterior no se releyeron.
- **Nada de la sección 6 se ha ensayado.** El volcado, la restauración y la
  reescritura de URLs están escritos a partir del esquema real, pero no se han
  ejecutado ni contra una copia. La primera vez que se corran, que sea contra un
  proyecto de pruebas.
- **No he modificado nada en Supabase.** Ni borrado huérfanos, ni tocado
  políticas, ni eliminado el job o la función de ejemplo. Todo lo de la sección 5
  y 3.4 está pendiente.

---

## 9 · Por dónde empezar, si hay que elegir tres cosas

1. **Mirar el egress en el panel.** Diez segundos, y es el único dato que falta
   para decidir si esto corre o espera.
2. **Cerrar la subida anónima a `form-uploads` (3.4b) y sacar los CV del bucket
   público (3.4c).** No dependen de la migración, y el segundo son datos
   personales de gente real expuestos hoy.
3. **Barrer los 40 huérfanos y el peso muerto de la sección 5.** Deja el
   inventario limpio antes de que alguien empiece a copiar archivos.

La verificación local del token que `TRASPASO.md` pone primero sigue siendo
correcta y sigue siendo pequeña. Va después de estas tres sólo porque estas tres
son más baratas todavía.
