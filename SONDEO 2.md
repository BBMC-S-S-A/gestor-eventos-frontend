# Sondeo completo de GESTEK

Instrucciones para recorrer la plataforma entera buscando fallos, en una
ventana nueva. Escrito el 15 de agosto de 2026.

Lee antes `CONTEXTO.md` (estado del proyecto) y `PENDIENTE.md`.

---

## 1 · El objetivo

**No es añadir funciones. Es encontrar lo que ya está roto y nadie ha visto.**

El evento es a mediados de septiembre, con ~7.000 asistentes, y los registros
abren la semana del 17 de agosto. A estas alturas el riesgo no son las
funciones que faltan: es que casi nada de lo construido lo ha tocado una
persona real. Cada recorrido que se hace encuentra algo.

Dato que ordena la prioridad: en la última sesión, **tres tandas de navegador
encontraron fallo cada una**, y tres de esos fallos llevaban meses en
producción.

---

## 2 · El método que funciona

### Medir, no deducir

Nunca digas «esto funciona» porque el código lo parezca. Ábrelo, úsalo, mide.
Cuando reportes, separa siempre lo **medido** de lo **sin verificar**.

### El navegador ve lo que HTTP no

Esta es la lección más cara de la sesión anterior. La aplicación es una SPA:
**cualquier ruta devuelve 200**, exista o no. Un `curl` a una URL inventada
responde igual que a una real.

Así se descubrió que `/e/<slug>` —la URL que el conector le daba a los
organizadores para compartir su evento— no existía y caía a la portada. Por
HTTP parecía correcta.

Herramientas: `mcp__Claude_Browser__navigate`, `read_page`, `computer`,
`javascript_tool` (sólo para inspeccionar, nunca para cambiar la interfaz).

Para medir maquetación, `javascript_tool` con `getComputedStyle` y
`getBoundingClientRect` da números reales. Ejemplo que se usó:

```js
const form = document.querySelector('form');
getComputedStyle(form).gridTemplateColumns   // "359.875px 359.875px"
```

### Comprobar un despliegue por contenido

Comparar hashes de bundle **no vale**. Y buscar en el chunk principal tampoco:
Vite parte el código y las pantallas viven en chunks perezosos. El manifiesto
del service worker lista los 72 archivos:

```bash
curl -s https://gestekeventost.dpdns.org/sw.js | grep -oE '"assets/[^"]+\.js"' | tr -d '"'
```

Descárgalos todos y busca ahí. **Valida el método con una cadena que sepas que
lleva días en producción** antes de concluir que algo no desplegó — la primera
vez dio falsos negativos por bajar 404 KB de 3,5 MB.

Ojo: una cadena construida con plantilla (`Aquí va ${esperado}`) no aparece
entera. Busca los trozos literales.

### Reproducir antes de arreglar, y exigir que la prueba falle

Cuando encuentres un fallo, reprodúcelo primero. Y si escribes una prueba de
regresión, **vuelve a meter el fallo a propósito y comprueba que la prueba
falla**. En la sesión anterior una prueba pasaba con el fallo puesto porque
medía otra cosa.

---

## 3 · Caza por clases, no por pantallas

Los fallos de esta plataforma se repiten en familia. Cuando encuentres uno,
busca sus hermanos antes de seguir. Las clases ya confirmadas:

| Clase | Cómo se ve | Ya apareció en |
|---|---|---|
| **Fecha en UTC donde toca local** | Una sesión de las 8 p. m. sale en el día siguiente | Agenda pública, creación desde PDF |
| **Recorte silencioso** (`.limit()`, `.slice()`) | «47 creados» y faltan 5.000 | Exportación del panel, del conector, recordatorios |
| **Error tragado** (`.catch(() => {})`) | No falla, se evapora | El TypeError que mató el correo durante meses |
| **Contar intentos en vez de éxitos** | «enviado» con el envío rechazado | `enviar_recordatorio` |
| **Ruta inventada** | Enlace que cae a la portada | `/e/<slug>`, `/explorar/:slug/legal` |
| **Confianza falsa** | Dato adivinado con etiqueta de «lo dice el documento» | Aforo del PDF |
| **Función escrita y no conectada** | La lógica existe y la pantalla llama a otra | `verificar()` vs `verificarCorreo()` |
| **Leer y no poder escribir** | Un campo se muestra y no se guarda | `formulario_modo`, indicativo telefónico |

Busca cada clase por todo el código, en los dos repos.

---

## 4 · Qué recorrer

Recórrelo **como usuario**, no leyendo archivos. En cada paso pregunta: ¿qué
veo?, ¿qué se guardó de verdad?, ¿qué pasa si me equivoco?

### A · Cuenta
Crear cuenta (los dos pasos), iniciar sesión, recuperar contraseña,
restablecerla, completar perfil. Comprueba que **lo que se escribe se guarda**:
el selector de indicativo telefónico era decoración y el número se guardaba sin
prefijo.

### B · Crear un evento
Los cuatro pasos del asistente. Las tres vías de entrada: desde cero, desde un
PDF y con el asistente de IA. En el PDF prueba **un documento largo sin
etiquetas** — es donde fallaba.

### C · Configuración del evento
Boletas y precios · categorías · formulario de compra (los 11 tipos de campo) ·
plantilla de importación · términos y condiciones · pagos · marca ·
página pública y su editor · agenda y sub-eventos · espacios y sus categorías ·
equipo y roles · torneos · networking · stands · vacantes.

### D · Lo público  ← *lo que quedó pendiente*
Página del evento · **agenda pública** (recién tocada: el agrupado por días
estaba en UTC, verifica que un sub-evento de noche cae en su día) ·
**página de la boleta con el QR** · página de términos (nueva, sin estrenar) ·
inscripción a sub-eventos · lista de espera · el embed en otra web.

### E · Operación
Importar asistentes desde Excel · exportar a Excel · reparto sin correo ·
**check-in y reentrada** · alertas · métricas y reportes.

### F · Integraciones
Conector de Claude (OAuth) · llave de Anthropic por organizador · buzón SMTP
por evento · webhooks · tokens de API.

---

## 5 · Reglas al tocar producción

Esto corre contra la base y el dominio **reales**, con 16 eventos y 34 boletas
de verdad.

- **No comprar ni reservar en un evento real.** Se puede abrir el modal,
  rellenarlo y comprobar la validación **sin enviar**. Para probar el envío,
  crea un evento propio de prueba y **bórralo después**.
- **No publicar** un evento ajeno, ni cambiarle el estado.
- **No mandar correos** a nadie que no seas tú.
- **Avisar antes de aplicar una migración**, y que el código vaya por delante
  de la columna nueva, no al revés.
- **Nunca `router.use(auth)`** en un router montado en `'/'`: autentica toda
  petición que pase por él y deja la web pública en 401. Hay una prueba que lo
  vigila por posición (`test/montaje.test.js`).
- **Cuidado con `git checkout --`** para deshacer un experimento: borra todo lo
  no guardado de ese archivo. Haz copia antes.

Lo que **no** puede hacer el agente y hay que pedirle a la persona: poner
secretos (`MP_WEBHOOK_SECRET`, credenciales), verificar el dominio en Resend,
y cualquier cosa que mande algo hacia fuera.

---

## 6 · Cómo trabajar

1. Recorre un área.
2. Si algo falla, **reprodúcelo** y anota qué esperabas y qué pasó.
3. Busca los hermanos de esa clase de fallo.
4. Arréglalo, compila, pasa las pruebas (`npm test` en el backend), sube.
5. Un commit por hallazgo, contando **el problema y la decisión**, no la lista
   de archivos.
6. Sigue con la siguiente área. No pares a mitad.

### Estilo de la casa
Comentarios en español que explican **por qué**, no qué. Nada de datos del
evento escritos en el código: la plataforma no se adapta a este evento, el
evento se adapta a la plataforma. El servidor es la autoridad; el panel
consume su catálogo y no mantiene copias.

---

## 7 · Qué entregar

Un informe con:

- **Fallos encontrados**, cada uno con: cómo reproducirlo, qué se esperaba, qué
  pasó, y si está arreglado o no.
- **Lo que se probó y funciona** — con el detalle de cómo se comprobó.
- **Lo que no se pudo probar** y por qué.
- **Lo que sigue**, ordenado por daño.

Actualiza `CONTEXTO.md` con lo que cambie, y corrige lo que haya quedado falso.
Ese documento ya mintió una vez sobre el despliegue y costó tiempo.

---

## 8 · Lo primero, si hay poco tiempo

Por orden de daño:

1. **Comprar una boleta de verdad**, de punta a punta, en un evento de prueba
   propio. Es el recorrido del 100 % de los asistentes y el que más se tocó.
2. **Check-in**: escanear un QR real y volver a escanearlo.
3. **Agenda pública**: que un sub-evento de noche caiga en su día.
4. **Importar un Excel** con la plantilla nueva.
5. **La página de términos**, recién creada y sin estrenar.
