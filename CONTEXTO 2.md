# GESTEK · Dónde estamos y qué sigue

Documento de traspaso. Escrito el 14 de agosto de 2026, al final de una sesión
larga. Sirve para retomar el trabajo sin releer nada más.

Todo lo que dice «medido» o «verificado» se comprobó contra producción o contra
la base de datos, no leyendo el código. Lo que no, va marcado.

---

## 0 · El reloj, que es lo que ordena todo lo demás

| | |
|---|---|
| **Hoy** | 14 de agosto de 2026 |
| **Abren los registros** | La semana del 17 de agosto |
| **El evento** | Mediados de septiembre (~15) |
| **Asistentes esperados** | ~7.000 |

Quedan unas **cuatro semanas de venta** y unos **32 días** para el evento. Ese
reparto es lo que hace que el correo sea tratable: 7.000 correos en cuatro
semanas son ~250/día, muy por debajo de cualquier tope. Lo que no cabe son los
picos — la apertura de registros y el recordatorio masivo.

---

## 1 · El terreno

**Dos repos, los dos con auto-despliegue desde `main`:**

| Repo | Dónde vive | Producción |
|---|---|---|
| `gestor-eventos-frontend` | React + Vite | Vercel → https://gestekeventost.dpdns.org |
| `gestor-eventos-backend` | Express | Render → https://gestor-eventos-backend-yx75.onrender.com |

La base es **Supabase** (`yopontbwgdybfsniqawz`, **plan free**), Postgres 17.

> **Un push a `main` despliega.** `PENDIENTE.md` decía lo contrario sobre el
> frontend; era falso y ya está corregido. Comprobado viendo el corte en vivo.

**Estado de los datos, medido hoy:**

| | |
|---|---|
| Eventos vivos | 16 |
| Boletas emitidas | 34 |
| Campos de formulario | 20 |
| Eventos con términos propios escritos | **0** |
| Buzones propios / llaves de IA | 0 / 0 |
| Conector de Claude | 1, funcionando |

---

## 2 · El riesgo número uno

> **Corregido el 14 de agosto por la tarde.** Este documento decía que no había
> proveedor de correo configurado. Era falso: **Resend está puesto en Render
> desde hace tiempo.** El diagnóstico correcto es peor y mejor a la vez.

Durante toda la vida del proyecto, el correo automático **no fallaba: se
evaporaba**. Cero filas en la tabla de envíos con 34 boletas emitidas, y ningún
error en ningún sitio.

La causa, encontrada probando el recorrido completo desde el conector, era una
línea en `lib/emailPlantillas.js`:

```js
if (evento && 'page_json' in evento) return conSitio(evento);
```

El contrato de `enviarEmailEvento` dice que `evento` puede ser sólo el id, y
**nueve** puntos de envío pasan el id pelado —la boleta pagada, los pagos, los
recordatorios, las tareas, el equipo, la cola…—. Pero `'page_json' in "un-uuid"`
lanza `TypeError`: el operador `in` exige un objeto. Y una cadena no vacía es
truthy, así que pasaba el guardia y reventaba ahí.

Lo que lo volvió invisible: esa función se llamaba **fuera** del `try`, así que
el error se escapaba de `enviarEmailEvento` entera, y todos los que la llaman
usan `.catch(() => {})` para que un correo fallido no tumbe una compra. El
`TypeError` caía en ese catch vacío. Ni excepción, ni log, ni registro — el
registro está *después* del punto donde reventaba.

**Ya está arreglado, y comprobado en producción**: el primer envío de la
historia del proyecto quedó registrado. Falló, pero por un motivo real y
visible: `Resend 422`. Ahora el motivo se guarda entero, con lo que dijo Resend
y qué hacer.

### Lo que queda por resolver del correo

El primer 422 se leyó como «el dominio del remitente no está verificado». **No
era eso**: en cuanto el motivo empezó a guardarse entero, Resend dijo qué
pasaba de verdad —

> Invalid `to` field. Please use our testing email address instead of domains
> like `example.com`.

Era la dirección de prueba, no la configuración. O sea que **el correo puede
estar bien ya**, y no hay forma de saberlo sin mandar uno a una bandeja real.

**Lo único que falta comprobar del correo es eso: un envío a una dirección de
verdad.** Emitir una cortesía a un correo propio y mirar:

```sql
select destinatario, ok, motivo from evento_email_envios order by created_at desc limit 5;
```

Si sale `ok = true` y llega, el correo está resuelto. Si vuelve un 422 hablando
del dominio, entonces sí toca verificarlo en
[resend.com/domains](https://resend.com/domains).

Esto es un recordatorio de por qué el motivo hay que guardarlo entero: dos
diagnósticos opuestos —«hay que tocar DNS» y «no hay nada que tocar»— cabían
igual de bien en «Resend 422».

---

## 3 · Lo que falta poner en el servidor

| Variable | Para qué | Sin ella |
|---|---|---|
| `RESEND_API_KEY` | El correo | **Ya está puesta.** Lo que falta es verificar el dominio en Resend |
| `SMTP_CRYPTO_KEY` | Cifrar buzones propios y llaves de IA | Las tablas existen, guardar devuelve un error que ahora dice por qué |
| `EMAIL_COLA_ACTIVA=1` | Encender la cola con freno | Envío directo, sin protección ante picos |
| `EMAIL_MAX_POR_HORA` | Ritmo de la cola | Por defecto 150/h |
| `ANTHROPIC_API_KEY` | Gestbot con la cuenta de la plataforma | Sin ella, cada organizador usa la suya (que es lo que queremos) |
| `MP_WEBHOOK_SECRET` | Firma de webhooks de Mercado Pago | **Hueco de seguridad**: cualquiera con la URL marca una boleta como pagada |

La llave de cifrado se genera así, y **se guarda también en un gestor de
contraseñas** — si se pierde, todos los secretos cifrados dejan de poder
descifrarse:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`FRONTEND_URL` **ya está puesta** (verificado: el redirect de OAuth apunta al
dominio correcto).

---

## 4 · Qué se construyó en esta sesión

Todo está en `main` de los dos repos, desplegado y con las migraciones
aplicadas. **104 pruebas del backend en verde.**

### Formularios — estaban rotos y nadie lo sabía

El servidor tenía 11 tipos de campo, validación por tipo y tres fichas
prearmadas (incluida la de caracterización, de 22 preguntas), y los servía en
cada respuesta. **El panel no leía nada de eso**: mantenía su propia lista de
seis. Consecuencias que estaban vivas:

- Selección múltiple, párrafo, correo, teléfono y documento **no se podían
  elegir**, así que la validación por tipo no se disparaba nunca.
- Las fichas **no tenían botón en ninguna pantalla**.
- El editor de sub-eventos mandaba `select` y `textarea`, que no existen — el
  servidor los rechazaba. Guardar una pregunta «Elegir una» fallaba siempre.
- Había **tres copias** del renderizador público, ya divergidas.

Ahora hay un catálogo (el del servidor) y un renderizador
(`components/ui/CampoFormulario.jsx`).

### Excel — tres caminos de carga

`src/lib/hojaCalculo.js` lee `.xlsx` y CSV **sin dependencias**
(`DecompressionStream` + `DOMParser`), con 28 pruebas contra un archivo real.
Se evitó SheetJS a propósito: su versión de npm arrastra dos CVE y va justo por
donde entran los datos de los asistentes.

Se usa en: la batería de preguntas, las opciones de un campo, y **la carga de
inscritos en masa** con mapeo de columnas. El endpoint se rehizo: acepta 5.000
por envío, inserta por lotes, y **el correo pasó a ser opcional** — porque la
gente a la que hay que entregarle la boleta en mano es justo la que no lo tiene.

### La red de seguridad del correo

- **Reparto sin correo** (pestaña de asistentes): imprime invitaciones con el
  QR firmado, arma un enlace de WhatsApp por persona, y exporta la lista.
- **Calendario `.ics`** con alarmas a 1 día y 1 hora, adjunto en la boleta. Es
  lo que traslada el recordatorio al teléfono y **evita el envío masivo**, que
  es el único que no cabe (7.000 de golpe son 35 h al tope de cPanel).
- **Cola con freno por hora** (migración 0070), apagada por defecto.
- **Buzón propio por evento**: el correo sale de la cuenta del organizador.
- **Verificación real del SMTP**: antes el diagnóstico sólo miraba si las
  variables existían.

### Claude

- **Conector de llave**: cada organizador pone su cuenta de Anthropic y paga su
  consumo. Antes lo pagaba la plataforma por todos.
- **Servidor MCP** con las 70 herramientas de `lib/agente.js` (mismo ejecutor,
  no un catálogo aparte).
- **OAuth 2.1** completo, para que se pueda añadir como conector en claude.ai
  pegando sólo una URL.
- **Pantalla de permiso** en `/conectar/autorizar`.

### Migraciones aplicadas

| | Qué |
|---|---|
| 0069 | Constancia de aceptación de términos |
| 0070 | Cola de correo |
| 0071 | Buzón SMTP por evento |
| 0072 | Conexiones del organizador (llave de IA) |
| 0073 | OAuth para conectores |
| 0074 | Campo de formulario buscable (listas largas) |
| 0075 | Subcategoría de espacio + buzón de sugerencias |
| 0076 | Los once tipos de pregunta del catálogo (la base sólo aceptaba seis) |

---

## 5 · Lo que sigue, en orden

### Esta semana, antes de que abran los registros

1. **Verificar el dominio en Resend.** Sección 2. Es lo único que separa a la
   plataforma de mandar correo de verdad, y el código ya está arreglado.
2. **Escribir los términos de los eventos.** `evento_legal` sigue vacía en los
   16, pero **ya hay dónde escribirlos**: el editor está en el evento →
   Comercial → Checkout → «Términos y datos personales». Trae un borrador con
   huecos marcados y permite copiar de otro evento.

   Sigue siendo lo primero de la lista porque el consentimiento **no se puede
   pedir hacia atrás**: quien se registre antes de que existan los términos ya
   habrá entregado documento, teléfono y —con la ficha— etnia, discapacidad y
   condición de víctima. Son once eventos publicados.

   El borrador NO es asesoría legal: los plazos de conservación, las bases
   legales y la política de devoluciones se dejan como huecos porque dependen
   del organizador y de su país.
3. ~~**Decidir qué hacer con `send-reminders-hourly`.**~~ **Decidido y hecho el
   14 de agosto: los recordatorios los hace Google Calendar, no la
   plataforma.** El cron quedó **desactivado** (`active = false`, no borrado)
   tras 1.980 ejecuciones fallidas sin haber enviado nunca nada — nunca se
   configuró, quedó la plantilla literal con `<TU_PROJECT_REF>` sin rellenar.

   Consecuencia de la decisión: **el `.ics` de la boleta deja de ser un extra y
   pasa a ser el único recordatorio que recibe el asistente.** Si el correo de
   la boleta no llega, no hay segunda oportunidad.
4. **Retirar el puente de `page_json`.** Sigue vivo: dos copias del mismo dato
   y un trigger evitando que se separen. El paso que faltaba (desplegar el
   frontend) ya está hecho. Queda: abrir una página pública, guardar algo desde
   el editor, y entonces ejecutar el `drop` del final de la `0065`.
5. **Encender la cola** (`EMAIL_COLA_ACTIVA=1`). Sin ella, el pico del día de
   apertura sale de golpe contra el tope del proveedor.
6. **Decidir Supabase Pro** (~25 USD/mes). Quita la pausa por inactividad y el
   techo de cómputo el día del pico. Ver `MIGRACION-SUPABASE.md`.

### Antes del evento

7. **Probar el reparto de punta a punta**: imprimir un bloque y **escanear uno
   de esos QR en el check-in**. Diez minutos, y es lo único que confirma que la
   red de seguridad funciona.
8. **Prueba de carga del escaneo.** Es la única función que no puede fallar el
   día del evento.
9. **`MP_WEBHOOK_SECRET`.** Hueco de seguridad abierto.

### Después del evento

10. **Salir de Supabase a un VPS.** Plan completo en `MIGRACION-SUPABASE.md`.
    Ojo: **la base son 20 MB** — los datos no son el problema, el egress sí.
11. **Envío desde el dominio del organizador** (DKIM por DNS). Necesita la
    misma máquina del punto 10. Ver `CORREO-Y-DOMINIOS.md`. Pregunta abierta y
    bloqueante: **¿el proveedor da puerto 25 saliente y PTR propio?**

---

## 6 · Qué se ha visto funcionar, y qué no

### Probado contra producción, de punta a punta (14 de agosto)

Recorrido completo de un evento, desde el conector de Claude:

| Paso | Resultado |
|---|---|
| Crear evento, boletas, ponente, agenda, descuento | Bien, con la zona horaria correcta |
| Publicar | Bien |
| Página pública (API y web) | 200, con las dos boletas y la agenda — **la mitad «web» era falsa, ver §9** |
| Emitir cortesía | Bien |
| Página de la boleta con QR firmado | 200, token de 253 caracteres |
| Check-in | Bien |
| **Check-in otra vez con la misma boleta** | **Rechazado**, y dice a qué hora entró |
| Check-in con código inventado | Rechazado |
| Aislamiento del conector | Sólo ve los eventos de su dueño, no los 16 |

El evento de prueba se borró después.

### El correo, resuelto

Con el TypeError arreglado, una cortesía a una dirección real quedó registrada
con **`ok = true`**: Resend la aceptó. Es el primer correo que sale del
proyecto. Lo que Resend acepta no es lo mismo que lo que llega a la bandeja
—queda mirar carpeta de correo no deseado—, pero la cadena entera funciona.

### Construido pero sin recorrido humano

- El importador no se ha corrido contra el endpoint real con un Excel de verdad.
- La impresión de invitaciones no se ha visto salir de una impresora.
- El buzón propio no se ha probado con credenciales reales.

### Un detalle pendiente, menor

Los recordatorios sueltos salen con tipo `personalizado`, que **no lleva el
`.ics` adjunto** (`CON_CALENDARIO` no lo incluye). Los recordatorios
automáticos sí. Añadirlo es una línea, pero afectaría también a las campañas
libres del panel, donde un calendario no siempre pinta. Decisión pendiente.

---

## 7 · Cosas que la próxima ventana debe saber

**Montaje de routers.** Un `router.use(auth)` en un router montado en `'/'`
autentica **toda** petición que pasa por él, no sólo las que casan con sus
rutas. Puesto antes del bloque público, deja la web entera en 401. Pasó al
añadir el MCP y se cazó antes de producción. Hay una prueba
(`test/montaje.test.js`) que lo vigila **por posición** — hay siete routers
heredados con el mismo patrón que no rompen porque van detrás de lo público.

**Cómo comprobar un despliegue.** Comparar el hash del bundle local contra el
de producción **no vale**: no tienen por qué coincidir. Hay que buscar texto
que sólo exista en el código nuevo:

```bash
curl -s https://gestekeventost.dpdns.org/ | grep -oE 'assets/index-[^"]+\.js'
# y buscar una cadena nueva dentro del chunk
```

**Base de datos.** Lo que toque migraciones se avisa antes de aplicar. Y una
migración que salga por delante del código ya costó un incidente (31 páginas
públicas vacías unos minutos).

**Una prueba que pasa no siempre protege.** Al arreglar el TypeError del correo
se escribió una prueba que comprobaba «no lanza». Pasaba con el fallo puesto:
el `try` que se había añadido en el mismo arreglo atrapaba el error y devolvía
un objeto igual. La prueba medía el segundo arreglo, no el primero. La forma de
saberlo es **volver a meter el fallo a propósito y exigir que la prueba falle**
— y hacerlo antes de creerse la prueba, no después.

**`git checkout --` para deshacer un experimento borra todo lo no commiteado
de ese archivo.** Al probar lo anterior se perdieron los dos arreglos, y la
comprobación de que seguían ahí dio un falso positivo porque el `grep` casó con
otra línea parecida. Si se va a experimentar sobre un archivo con cambios sin
guardar, se hace copia primero, y se verifica con el texto exacto.

**Estilo de la casa.** Comentarios en español que explican **por qué**, no qué.
Los mensajes de commit cuentan el problema y la decisión, no la lista de
archivos. Merece la pena mantenerlo: buena parte de lo que se arregló esta
sesión se encontró leyendo comentarios que explicaban una decisión vieja.

**Documentos vivos:**

| Archivo | Qué contiene |
|---|---|
| `PENDIENTE.md` | Estado del despliegue y las tareas pedidas por el equipo |
| `MIGRACION-SUPABASE.md` | Plan para salir de Supabase, con lo medido |
| `CORREO-Y-DOMINIOS.md` | Cómo enviar mucho correo y desde el dominio propio |
| `CONTEXTO.md` | Este archivo |
| `SONDEO.md` | Cómo recorrer la plataforma entera buscando fallos, y por qué el navegador ve lo que HTTP no |
| `NUBE.md` | Cómo retomar el proyecto sin la máquina local: qué conectores hay que reconectar y qué cambia |
| `../gestor-eventos-backend/DESPLIEGUE.md` | Credenciales y qué se rompe sin cada una |

---

## 8 · Para conectar Claude ahora mismo

No necesita `SMTP_CRYPTO_KEY`. En **Claude → Configuración → Conectores →
Añadir conector personalizado**:

```
https://gestor-eventos-backend-yx75.onrender.com/mcp
```

Claude descubre el OAuth solo, se registra, trae al organizador a la pantalla
de permiso, y vuelve conectado. Verificado en producción salvo el paso de
aprobar.

Para Claude Code o Claude Desktop, que no usan ese conector, hay un token en
*Ajustes → Integraciones → «Conectar desde Claude Code o Claude Desktop»*.

---

## 9 · Sondeo de lo público (15 de agosto)

Primera pasada de `SONDEO.md`, por las pantallas que ve el asistente. Todo lo
de abajo se midió en el navegador contra producción, con un evento de prueba
propio que se creó, se publicó, se recorrió entero y **se borró** (la base
quedó en 31 filas / 16 vivos / 34 boletas, igual que antes).

### Lo que estaba roto

**La página pública de un evento creado desde el conector salía vacía.**
Lo más caro de la sesión. `crear_evento` deja `page_json` con `pages: []` y
`blocks: []`, y la página pública envolvía ese array vacío en una página sin un
solo bloque: el visitante veía el logo del organizador y nada más — sin título,
sin fecha, sin lugar y **sin boletas**— mientras la API devolvía los tipos de
boleta perfectamente. El editor ya caía a los bloques del sistema en ese caso;
el lado público, que es el que vende, era el único sin ese suelo. Arreglado y
verificado en producción.

Aquí está la lección de método: §6 daba por buena la «página pública (API y
web)». La API sí respondía. La web no se había abierto. Es la clase «confianza
falsa» aplicada a este mismo documento.

**Programar un partido lo corría un día, y de forma acumulativa.** El modal
leía el día en UTC (`toISOString`) y la hora en local (`toTimeString`). Un
partido de las 9 p. m. del 15 se reabría como «16, 21:00» y guardar sin tocar
nada lo escribía en el 17. El cálculo era una línea copiada en tres archivos:
ahora vive en `src/lib/fechaLocal.js` y los tres la comparten. De paso, el PDF
de asistentes exportado de noche se nombraba con la fecha de mañana.

**La boleta pública no traía `fecha_fin` ni `page_json`.** Dos ausencias que
fallaban en silencio con un respaldo razonable cada una: el enlace «Añadir a
Google Calendar» caía a su valor por defecto de dos horas —en un evento de dos
días, una cita de 9 a 11 del primer día, y desde que los recordatorios los
lleva el calendario ése es el único aviso que recibe el asistente—, y la
escarapela digital se pintaba siempre con el diseño por defecto, así que lo que
el organizador configura en Asistentes → Tarjeta no lo veía nadie.

### Lo que se recorrió y funciona

| Recorrido | Cómo se comprobó |
|---|---|
| Agenda pública, agrupado por días | Sesión de las 8 p. m. del 15 en la pestaña del 15, no en la del 16. El arreglo del 14 está bien puesto |
| Compra de punta a punta | Reserva completada en el evento de prueba: código, QR, enlace permanente y correo con `ok = true` |
| Casilla de términos obligatoria | Bloquea con «Debes aceptar los términos para continuar» y enlaza a `/explorar/:slug/legal#terminos`, que ahora existe |
| Constancia de aceptación (0069) | Guarda el instante **y el hash del contenido** aceptado, no un booleano |
| Página de términos | Con documentos y sin ellos; respeta los saltos de línea del organizador |
| Check-in, reentrada y código inventado | Entra, rechaza el segundo intento diciendo a qué hora entró, rechaza el inventado |
| Boleta con código inexistente | «El código X no existe», no una pantalla en blanco |
| Embed de boletas en web ajena | Sirve la sección aunque el evento no tenga landing (`EMBED_SIN_CONFIG`) |
| Pista cruzada del correo | Un teléfono en la casilla de correo responde «Eso parece un teléfono. Aquí va el correo.» |
| `/explorar` muestra 3 de 11 publicados | **No es recorte**: los otros 8 ya pasaron. Medido contra la base |

### El correo, otra vez

Dos envíos más con `ok = true` a una dirección real (la cortesía y la compra).
Resend los aceptó. **Sigue faltando lo mismo que el 14: mirar la bandeja**, y
la carpeta de correo no deseado. Es lo único que no puede comprobar el agente.

### Segunda tanda: el registro de Festech (15 de agosto, tarde)

Festech es **el único evento real** de los 31 de la base: 17–19 de septiembre,
10 boletas ya emitidas, y la boletería abre la semana del 17. Todo lo demás son
pruebas. Tenía 2 preguntas de formulario y **cero sesiones de agenda**.

**El bloqueador, que estaba escondido en la base.** El catálogo del servidor
ofrece once tipos de pregunta; el `CHECK` de `event_form_fields.tipo` sólo
aceptaba seis. Como `filaCampo` guarda `tipo` tal cual, **`parrafo`, `email`,
`telefono`, `documento` y `multiple` no se podían guardar**: el insert
reventaba. El trabajo de formularios de la sesión anterior estaba a medias en
el sitio que no se ve — se arregló el panel para ofrecer los once y nunca se
ensanchó la columna. La ficha de caracterización no se podía aplicar a ningún
evento. **Migración 0076 aplicada**, comprobada en las dos direcciones.

**El público no veía tres columnas que el panel sí guardaba.** `grupo`, `ayuda`
y `buscable` viajaban al panel pero no a la página pública: las dos consultas
de `eventos.publicos.js` tenían su propia lista de columnas recortada mientras
`COLUMNAS_CAMPO` ya existía con las diez. Sin `grupo` no hay módulos, y el
texto de `ayuda` —el que explica una pregunta delicada— se perdía justo donde
había que leerlo.

**Registro por módulos.** El formulario público se reparte por la columna
«Grupo» de la plantilla, con tope de 10 y troceo automático de red de
seguridad. Se valida al avanzar, no al final; el cierre legal va en el último
paso; con pocas preguntas no se pagina. Medido con 13 preguntas en 5 grupos:
«Paso 1 de 6», cada módulo con su nombre, y el buscador encendiéndose solo en
la lista de 12 barrios (filtró a 1 con tres letras) pero no en la de 6 estratos.

**Apuntarse a un sub-evento ya no pide el código de memoria.** El servidor
siempre supo resolverlo con el código de la boleta; lo que faltaba era llegar
hasta ahí. Ahora el código viaja en el enlace desde la boleta y se detecta con
sesión iniciada. Medido: el modal dice «Te apuntas como … · Boleta …» sin pedir
nada, la inscripción queda vinculada a la boleta y el cupo baja. Con un código
inventado en la URL vuelve a pedirlo a mano — se comprueba contra el servidor
antes de saludar a nadie por su nombre.

**El webhook de Mercado Pago no era el agujero que decían estos documentos.**
El manejador nunca se cree el aviso: reverifica el pago contra MP. Lo que sí
estaba abierto era un amplificador — un id inventado provocaba una llamada
saliente por cada organizador conectado, y el limitador no contaba nada porque
el webhook responde 200 antes de procesar. Corregido. **`MP_WEBHOOK_SECRET`
sigue sin poner**, y ahora el servidor avisa al arrancar.

### Tercera tanda: el panel (15 de agosto, noche)

**Tres pantallas rotas, todas de la misma familia y todas invisibles al
compilar.** Emails tumbaba la aplicación con «n is not a function» al SALIR de
la pestaña —`useEffect(cargar, …)` devolvía la promesa del fetch y React la
llamaba como función de limpieza—, así que el error aparecía con la URL de la
pestaña siguiente. Las fichas prearmadas no hacían nada al pulsarlas porque
`agregarFicha` llamaba a `clave()`, que no existía en ningún archivo: un
ReferenceError dentro de un manejador de clic no lo atrapa el error boundary de
React, y el botón se queda mudo, sin pantalla de error que seguir. Y Anuncios ni
se pintaba, por `anunciosVersion` usado fuera de su componente.

**La lección de método, que vale más que los tres arreglos:** eslint llevaba
todo el proyecto entre las dependencias, sin configuración ni script, así que
nunca se corrió. Pasarle `no-undef` a `src` encontró dos de las tres en treinta
segundos. Ahora hay `eslint.config.js` con esa única regla y `npm run lint`.
Deliberadamente sin reglas de estilo: un linter que grita por las comillas se
acaba desactivando, y con él se va el que sí servía.

**El importador**, con dos cambios pedidos: la columna «Obligatoria» vacía ahora
significa Sí —antes dejaba todas las preguntas opcionales y no se notaba hasta
exportar— y subir una hoja fusiona con lo que ya esté escrito a mano, ganando
el archivo y conservando el `id` para no dejar huérfanas las respuestas.

**La vista previa del checkout era un dibujo**: «General, $50.000» escrito a
mano, con la boleta real gratis, y nunca mostraba las preguntas porque leía un
campo que el objeto del panel no trae. Ahora pide boletas y formulario al
servidor y enseña los módulos reales, navegables.

**Un solo sitio para los términos.** Había dos editores en la misma pantalla: el
de `page_json.checkout` (anterior a la 0059) y el de `evento_legal`. Se retiró
el viejo — cero de los 31 eventos lo tenían activo. Las validaciones se
movieron junto al formulario, que es la misma decisión.

**Los módulos bajaron de diez a cinco preguntas.**

### Cuarta tanda: los espacios del evento, conectados (15 de agosto, noche)

Los espacios públicos de un evento —agenda, rueda de negocios, torneo, ranking—
eran **calles sin salida**. Entrar en la agenda dejaba al visitante sin saber de
qué evento era («Todo lo que pasa dentro», y nada más), sin las otras secciones
y sin manera de volver. Lo que había en algunas era un «← Volver a explorar» al
listado general, que no es volver: quien llega por un enlace compartido nunca
pasó por el listado.

Ahora las cinco llevan la misma `BarraEvento`: el nombre del evento como
retorno y los demás espacios al lado. **También en las pantallas vacías y en las
puertas de sesión**, que es donde más falta hacía — la rueda de negocios tiene
cinco salidas distintas y la que ve un visitante sin sesión era la que menos
tenía. Dentro de un iframe no se pinta, para no sacar a nadie de la web ajena.

**El mapa del evento no tenía forma de verse.** Se configura en el panel y se
guarda en `page_json.mapa`, pero sólo aparecía si el organizador añadía a mano
el bloque «Mapa del evento» a su landing. TechNova lo tenía configurado y su
landing no lo incluía. Ahora es un espacio más, con ruta propia
`/explorar/:slug/mapa`, reutilizando el mismo bloque que ya lo pintaba.

Verificado en producción sobre TechNova: los cinco espacios se alcanzan desde
los cinco, y el retorno al evento funciona desde todos.

### Quinta tanda: el registro por boleta, y el movimiento (15 de agosto, noche)

**El registro se edita por boleta.** Registrar a un asistente no es lo mismo
que registrar al staff o a una empresa con stand. La base lo soportaba desde
siempre —cada pregunta puede ser de una boleta o de todas— pero no había por
dónde elegir, así que el formulario era uno solo para todos. Ahora se elige
primero a quién se le edita, con el número de preguntas al lado: «Staff · 0» se
lee de un vistazo.

El riesgo estaba en el guardado y quedó atado: **el filtro afecta a lo que se
muestra, nunca a lo que se guarda**. El servidor hace diff contra la lista
completa, así que mandar sólo lo visible habría borrado las preguntas de las
otras boletas. Y cuando una boleta está vacía se ofrece copiar las de otra —
staff y expositores comparten casi todo y se diferencian en dos preguntas.

**Las animaciones del sondeo, cuatro de cinco.** La que importa está verificada
en producción: los pasos del registro entran por el lado del que vienen, 180 ms
con la curva de la casa. Más el fundido de los KPI y la pantalla de carga con
el bot, que sustituye a los recuadros grises **sólo en la primera carga**.

**El acompañante** pasa a abajo a la izquierda, esconderlo se recuerda entre
sesiones, y la lámpara se rehizo con brazo articulado —el codo es lo que la
hace leer como lámpara y no como un alambre.

**La ficha de caracterización es un interruptor**: el mismo clic pone y quita
las 22 preguntas, con aviso si alguna ya está guardada (quitarla borraría
respuestas ya diligenciadas).

> Ojo con TechNova: tiene cuatro tipos de boleta y dos se llaman `vip` y `VIP`.
> Son dos filas distintas y en el selector salen las dos.

### Verificado por el equipo (16 de agosto)

Todo lo construido entre el 15 y el 16 —los tres crashes del panel, el registro
por módulos y por boleta, la barra de espacios, el mapa público, la ficha como
interruptor, las plantillas de correo y el reporte— **se recorrió en pantalla y
funciona**. Lo que el agente no puede comprobar es el panel, porque exige sesión
y no escribe contraseñas; esa parte la valida una persona.

Lo que sigue sin comprobar es una sola cosa, y es de fuera: **que el correo
llegue a la bandeja**. Resend acepta y registra `ok = true`, pero aceptar no es
entregar.

### Lo que queda de lo público, sin tocar

Inscripción a sub-eventos con cupo, lista de espera (hace falta agotar un tipo
de boleta), agenda multi-sala con varios `track`, e importar un Excel con la
plantilla nueva. Y `MP_WEBHOOK_SECRET` sigue sin poner: cualquiera con la URL
del webhook marca una boleta como pagada.
