# GESTEK · Enviar el correo desde el dominio del organizador

Pedido: mandar muchos correos **sin conectar una herramienta externa**, y que
salgan **desde el correo de quien registra el evento** — con un registro TXT en
el DNS o algo parecido.

La intuición es correcta: eso es exactamente como funciona, se llama
**autenticación de dominio**, y es lo mismo que hacen por dentro las
herramientas que queremos no usar. Se puede hacer en casa. Lo que sigue es qué
hace falta de verdad, medido contra lo que hay hoy.

Escrito el 13 de agosto de 2026. Acompaña a `MIGRACION-SUPABASE.md`.

---

## 0 · Los dos números que mandan

Antes del diseño, dos topes que hoy hacen imposible el envío a 7.000 personas y
que ninguna decisión de código evita:

| Tope | Valor | Qué implica |
|---|---|---|
| **cPanel, correo por hora** | **200/hora** por dominio de fábrica (algunos hosts 250) | 7.000 correos son **entre 28 y 35 horas** seguidas. Y pasarse **bloquea la cuenta**: cPanel deja una marca en `/var/cpanel/email_send_limits` y el dominio deja de enviar |
| **Google, remitente masivo** | **5.000/día** a direcciones de Gmail | Cruzarlo clasifica el dominio como masivo **para siempre**, aunque el volumen baje. Desde ahí exige SPF **y** DKIM, DMARC con alineación, PTR válido, TLS, quejas por debajo del **0,30 %** y baja en un clic |

Traducción: **el camino actual —SMTP de cPanel— no puede entregar la boletería
de este evento.** No es que sea lento: es que a mitad de camino el host corta.
Y como 7.000 asistentes son mayoritariamente Gmail, se entra de lleno en las
reglas de remitente masivo.

---

## 1 · Tres arquitecturas, y cuál sirve para qué

### A · Delegación por DNS — *lo que preguntaste*

El organizador añade uno o dos registros a **su** dominio y a partir de ahí
nuestro servidor puede firmar correo **como él**. El `From` dice
`eventos@sudominio.com` de verdad, no es un disfraz.

**Lo mínimo que hay que pedirle es UN registro**, y conviene saber por qué:

```
gestek._domainkey.sudominio.com.   CNAME   sudominio-com.dkim.envios.gestek.co.
```

DMARC pasa si **SPF o DKIM** alinean, no hacen falta los dos. El sobre
(`Return-Path`) se queda en **nuestro** dominio para poder procesar los rebotes;
eso hace que SPF pase pero no alinee. Quien alinea es DKIM, porque firmamos con
`d=sudominio.com`. Con esa única firma, DMARC pasa.

Se pide **CNAME y no TXT** a propósito: apuntando a un destino nuestro podemos
**rotar la llave sin volver a molestar al organizador**. Un TXT con la llave
pública dentro obliga a pedirle un cambio de DNS cada vez que se rote.

Dos registros más, según el caso:

```
_dmarc.sudominio.com.   TXT   "v=DMARC1; p=none; rua=mailto:dmarc@gestek.co"
```
Sólo si su dominio **no tiene ya DMARC**. Google lo exige para remitente masivo,
y muchos dominios de empresa pequeña no lo tienen.

```
sudominio.com.   TXT   "v=spf1 include:envios.gestek.co ~all"
```
Opcional. Ayuda, pero **ojo**: SPF sólo admite 10 consultas DNS encadenadas, y si
el organizador ya usa Google Workspace y algo más, añadir la nuestra puede
romperle el SPF que ya tiene. Por eso no se pide de entrada.

**Qué hace falta de nuestro lado** (todo en el VPS del plan de migración, nada
de terceros):

- Un MTA propio: Postfix firmando con OpenDKIM.
- **Puerto 25 saliente abierto.** Muchos proveedores lo bloquean por defecto y
  hay que pedirlo explícitamente. Es lo primero que hay que confirmar.
- **PTR (DNS inverso)** que coincida con el nombre del HELO. Sin eso, Google
  rechaza de entrada.
- TLS en la salida.
- Gestión de rebotes y lista de supresión. Seguir escribiendo a direcciones que
  rebotan es la forma más rápida de quemar la reputación.
- `List-Unsubscribe` con baja en un clic (RFC 8058) en todo lo que sea campaña.

### B · El buzón del propio organizador — *lo más literal a «su correo»* ✅ **construido**

El organizador conecta **su propia cuenta** (Gmail, Outlook, su cPanel) y el
correo sale por ahí. No hace falta tocar el DNS: la autenticación ya es correcta
porque el correo lo manda él de verdad.

- **A favor:** cero configuración de dominio, y es literalmente su dirección.
- **En contra, y es definitivo para este evento:** los topes del proveedor.
  Gmail gratis ~500/día, Workspace ~2.000/día, Outlook ~300/día, cPanel 200/hora.
  **Para 7.000 no sirve.**

**Estado:** hecho. Está en *Event Experience → Emails → «Enviar desde tu propio
correo»*, por evento. Guardar comprueba la conexión de verdad antes de darla por
buena, y el aviso de volumen va en la propia tarjeta.

Un cambio respecto a lo que decía este documento: se guarda la contraseña, no se
usa OAuth. Cifrada con AES-256-GCM (`SMTP_CRYPTO_KEY`) y sin devolverla nunca por
la API. OAuth sería mejor, pero sólo lo ofrecen Google y Microsoft, y dejaría
fuera precisamente a quien tiene un buzón de su propio dominio en cPanel — que es
el caso normal de un organizador con dominio propio.

Dos detalles que costaron y conviene no deshacer:

- **Si el buzón del organizador falla, el envío NO se cae en silencio al
  remitente de la plataforma.** Quien conectó su correo espera que salga de ahí;
  mandarlo desde otra dirección sin avisar es peor que fallar.
- **Gmail no acepta la contraseña normal por SMTP** desde 2022: hace falta una
  contraseña de aplicación, que a su vez exige verificación en dos pasos. Es la
  causa número uno de fallo al conectar, y el mensaje de error lo dice.

Sirve muy bien para lo de bajo volumen —invitaciones al equipo, respuestas,
avisos a un puñado de gente— y no sirve para la boletería de 7.000.

### C · Nuestro dominio con Reply-To — *lo que funciona hoy sin pedir nada*

`From: Feria X <notificaciones@gestek.co>` y `Reply-To:` al correo del
organizador. Cero configuración.

- **A favor:** funciona ya, y es el respaldo natural mientras un organizador no
  verifica su dominio.
- **En contra:** el `From` no es suyo, y —más importante— **la reputación de
  nuestro dominio la comparten todos los organizadores**. Uno que mande a una
  lista comprada nos hunde a todos. Ese es el argumento fuerte a favor de A: con
  delegación, cada quien responde por su propio dominio.

---

## 2 · Lo que propongo

**Las tres, por capas, con A como objetivo y C como respaldo automático.**

1. Cada evento tiene una identidad de remitente: nombre visible y correo de
   respuesta. Sin nada configurado, sale por C.
2. El organizador que quiera su dominio entra a **Ajustes → Remitente**, escribe
   su dominio, y el panel le muestra los registros exactos que tiene que pegar en
   su DNS, con un botón de **Comprobar**.
3. La comprobación la hace el backend con el módulo `dns` de Node —
   `resolveCname` y `resolveTxt`—: **no hace falta ningún servicio externo para
   verificar**, que es justo lo que se pidió.
4. Verificado el dominio, ese evento pasa a firmarse con DKIM y su `From` real.
   Si la verificación se cae (alguien borró el registro), vuelve solo a C en vez
   de dejar de enviar.

**Y una cola con freno**, que hace falta en las tres: los envíos se encolan y
salen a un ritmo configurable por hora, con reintentos y registro de cada
intento. Es lo que evita el bloqueo de cPanel y lo que permite ir subiendo el
ritmo durante el calentamiento.

---

## 3 · Lo que no se puede acelerar: el calentamiento

Una IP nueva que manda 7.000 correos el primer día **va a spam entera**, con
todo bien configurado. Los proveedores confían en función del historial y no hay
forma de saltárselo.

Un ritmo prudente desde cero: ~50 el primer día, doblando cada dos o tres días
si las quejas se mantienen bajas. **Llegar a miles son entre dos y cuatro
semanas.**

> **Esto es lo urgente del documento.** Si el evento está cerca, el calentamiento
> tenía que haber empezado antes que el código. Conviene decidir la fecha y
> arrancar aunque el resto no esté: se puede calentar mandando el correo
> transaccional que ya existe.

Y una salida honesta si no da tiempo: **repartir la boletería en el tiempo** en
vez de un envío masivo. 7.000 correos transaccionales que salen a medida que la
gente compra, repartidos en semanas, no cruzan el umbral de 5.000/día ni el tope
por hora. El que sí lo cruza es el envío masivo de golpe.

---

## 4 · Orden de trabajo

| # | Qué | Por qué ahí |
|---|---|---|
| 1 | **Preguntar al proveedor: ¿puerto 25 saliente y PTR propio?** | Si la respuesta es no, la arquitectura A no existe y hay que replantear. Es una pregunta, no una tarea |
| 2 | Identidad de remitente por evento + `Reply-To` + registro de cada envío | Funciona sin DNS y sin MTA propio, y quita el fallo silencioso de hoy |
| 3 | La cola con freno por hora | Sin esto, el primer envío grande bloquea la cuenta de cPanel |
| 4 | `List-Unsubscribe` en un clic | Lo exige Google para masivo, y es barato hacerlo bien desde el principio |
| 5 | Verificación de dominio por DNS en el panel | El corazón de lo pedido. No necesita el MTA todavía: se puede verificar antes de poder firmar |
| 6 | Postfix + OpenDKIM en el VPS y **empezar el calentamiento** | Lo más lento. Cuanto antes empiece, antes sirve |
| 7 | Rebotes y lista de supresión | En cuanto haya volumen, esto decide si el correo sigue llegando |

---

## 5 · Lo que hay que mirar y no se puede desde aquí

- **¿El proveedor abre el puerto 25 y da PTR?** Punto 1 de arriba.
- **¿Cuál es el tope real por hora del hosting actual?** El de fábrica son 200,
  pero cada host lo cambia. Se mira en cPanel o se pregunta.
- **¿Cuántos de los 7.000 son Gmail?** Decide si las reglas de remitente masivo
  aplican de lleno. Se puede contar sobre la lista real antes de enviar nada.

## Fuentes

- [Email sender guidelines · Gmail Help](https://support.google.com/a/answer/81126?hl=en)
- [Bulk Email Sender Rules For Google, Yahoo, Microsoft & Apple (2026)](https://powerdmarc.com/bulk-email-sender-requirements/)
- [Setting the Max Emails Per Hour Setting in WHM](https://www.inmotionhosting.com/support/edu/whm/set-max-hourly-email-limit/)
- [Domain Has Exceeded the Max Emails per Hour](https://www.inmotionhosting.com/support/email/domain-exceeded-max-emails-per-hour/)

---

## Decisión del 16 de agosto: dos capas, y cuál manda

Se construyeron **dos relevos entre buzones a la vez**, en sesiones distintas.
Queda escrito cuál se usa para que nadie rehaga el otro.

**El envío lo manda `lib/email.js`** — los buzones de plataforma que se
alternan por variables de entorno (`CPANEL_SMTP_*` y `CPANEL_SMTP_*2`). Es el
que se queda, y no por gusto:

- Funciona hoy. El otro exige `SMTP_CRYPTO_KEY`, que no está puesta.
- Tiene **failover**: si un buzón falla, prueba el otro antes de rendirse. Para
  el correo de una boleta —que sale una vez— eso pesa más que afinar el cupo.
- Está probado contra la red real de Render. El arreglo de IPv4
  (`ENETUNREACH`/timeout) es la clase de fallo que sólo aparece en producción.

**`evento_smtp` NO es para escalar.** Es otra cosa: el buzón propio de UN
organizador, para que su correo salga con su dirección. Si alguien lo usa para
repartir volumen acabará con la misma configuración en dos sitios.

**Lo que le falta al que se queda: no sabe de cupo.** Alterna uno y uno, lo que
duplica la capacidad, pero no mira cuánto lleva enviado cada buzón. Dos buzones
alternando a toda velocidad llegan a sus dos topes igual de rápido, sólo que a
la vez — y pasarse **bloquea la cuenta**, no la retrasa.

Portar eso es lo que queda: contar lo enviado por buzón en la última hora y
saltarlo al 70%. La lógica ya existe probada en `smtpEvento.conSitio()`; es
moverla, no inventarla.
