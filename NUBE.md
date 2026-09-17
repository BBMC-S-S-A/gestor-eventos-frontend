# Trabajar GESTEK desde la nube

Cómo retomar este proyecto en una ventana **sin la máquina local**. Escrito el
15 de agosto de 2026; **actualizado el 1 de septiembre** (bloque de abajo).

Lee también `CONTEXTO.md` (dónde estamos), `CONTINUAR.md` (estado por fases),
`SONDEO.md` (cómo buscar fallos) y `../gestor-eventos-backend/DESPLIEGUE.md`
(credenciales).

Este archivo existe porque el traspaso a la nube no es «clonar y ya»: la mitad
de lo que hacía funcionar la sesión local eran conectores y un navegador, no
archivos. Aquí está qué se pierde, qué hay que reconectar y qué cambia.

---

## Actualización — 1 de septiembre de 2026

Sesión larga con FESTECH IBAGUÉ (`festech2026`) registrando en vivo. **Todo
mergeado a `main`** (frontend PR #11, #14–#19; backend PR #13–#17).

**Lo que se hizo** (detalle en `PENDIENTE.md §4/§5/§6` y `CONTINUAR.md §0.b`):
- **§4.1–§4.6 · registro embebido.** Enlace de boleta configurable, la página
  reconoce a quien ya tiene boleta (localStorage), sub-eventos como paso final
  del registro, ancho/alto del modal editables, y el iframe **hereda la
  tipografía** de la web anfitriona (`widget.js` + `EmbedPage.jsx`). Falta el
  SDK sin iframe y el color de acento — sesión aparte.
- **§5 · mapa por zonas.** Casi todo ya estaba; lo nuevo es «zona llena se
  prende en fuego» (`lib/aforoZonas.js` → `nivel`; `LlamaZona.jsx`).
- **§6 · Realtime a cero en segundo plano.** Asistencia por sondeo, latido
  25→50 s, `ChatTab` sólo con pestaña visible, `TopBar` sin canal.
- **Fase 6.** El esquema **y los datos** de Supabase ya están en archivo para
  MySQL 8 (`gestor-eventos-backend/db/esquema/`). `03_datos.sql` está gitignored
  (datos personales reales) — se regenera con `db/esquema/generar-datos.mjs`.
- **Migraciones aplicadas:** `0084`, `0082`, `0085` (aditivas). Sin aplicar a
  propósito con registro en vivo: `0081`, `0083`, `0086`.

**Bug de producción arreglado:** la `0084` (`visible_si`) nunca se aplicó y el
backend hace `const { data } = await supabase...` sin mirar `error` → las
consultas de formulario fallaban en silencio (3 campos en vez de 10, sin exigir
obligatorios al comprar). **Pendiente:** auditar todos los `.select()` que
ignoran `error`.

**Nada verificado de punta a punta.** Evento de banco de pruebas: **TechNova
Summit 2026** (`technova-summit-2026`, id `f0259473-af92-42ed-bc77-52e7200112f2`),
NO Festech. Mapa de pruebas con 90 casos:
`claude.ai/code/artifact/94881685-f739-4ad7-97d3-316f7138d54c`.
- §4.5 necesita prueba **cross-site real**: una web en otro origen, servida por
  HTTP, con `font-family` propia, y pegar los snippets del widget y de sección.
- §5 necesita **crear una zona** en TechNova (no tiene ninguna): marcador tipo
  `zona` + `aforo_max` + una `agenda_session` enlazada por `zona_id`.
- Las 2 sesiones de TechNova tienen fecha de agosto — moverlas al futuro.

**Deuda:** rotar la contraseña de Postgres (se pegó en un chat; el backend usa
`SUPABASE_SERVICE_KEY`); arreglar `torneo_categorias_unica_hija` en el
`db/migraciones/003` original (columna TEXT, sólo corregido en `db/esquema/02`).

**Las skills** (`db-guardian`, `legal-radar`, `obsidian-log`) **no se cargan en
la nube** salvo que el repo lleve `Sekkon0906/SkillsDesarrollo` como submódulo
en `.claude/skills/skillsdesarrollo` — hoy no lo lleva. `obsidian-log` no
funciona en la nube ni con submódulo (necesita la bóveda en disco): al cerrar,
devolver un resumen en texto para pegarlo a mano.

---

## 1 · Lo mínimo para empezar

```bash
git clone https://github.com/ronaldbarrios-hue/gestor-eventos-frontend.git
git clone https://github.com/ronaldbarrios-hue/gestor-eventos-backend.git
```

Los dos son **públicos en la misma cuenta**, van por `main`, y **un push a
`main` despliega solo**. No hay entorno de pruebas: lo que se sube, sale.

| | Repo | Corre en | Producción |
|---|---|---|---|
| Panel y público | `gestor-eventos-frontend` | React + Vite | https://gestekeventost.dpdns.org |
| API | `gestor-eventos-backend` | Express (Node 22) | https://api.gestekeventost.dpdns.org |

> **Render y Vercel están fuera desde el 17-sep.** Los dos repos se despliegan
> en **cPanel**. El host viejo (`gestor-eventos-backend-yx75.onrender.com`)
> contesta **503**: cualquier cosa que siga apuntando ahí —un conector MCP
> guardado, un webhook, un marcador— hay que cambiarla a mano.

Base de datos: **Supabase** `yopontbwgdybfsniqawz`, Postgres 17, **plan Pro**
desde el 17-sep (comprobado: la organización está en `pro`).

> **Pro no sube la máquina solo.** El plan cambia las cuotas y quita la pausa
> por inactividad, pero el tamaño de cómputo sigue siendo el que hubiera y se
> cambia a mano en *Settings → Compute and Disk* — y ese cambio **reinicia la
> base**, así que no se hace en mitad de un evento. Y el *spend cap* viene
> encendido: con él puesto, pasarse de la cuota incluida **limita** en vez de
> cobrar, que es justo lo que parece «el plan no se aplicó».

Instalar y comprobar que todo arranca:

```bash
cd gestor-eventos-frontend && npm install && npm run lint && npm run build
```

```bash
cd gestor-eventos-backend && npm install && npm test
```

Referencia (1 de septiembre): **~336 pruebas del backend en verde** y **7 del
widget** en Chromium (`npm run test:widget`), `lint` limpio y `build` sin
errores. Si algo de eso falla nada más clonar, el problema es del entorno, no
del código — resuélvelo antes de tocar nada.

---

## 2 · Lo que NO viaja en el repositorio

Esto es lo que hay que reconectar a mano, y sin ello media sesión no se puede
hacer. Es lo primero que conviene comprobar, no descubrirlo a mitad.

**Conector MCP de GESTEK.** Es lo que permite crear eventos, emitir cortesías,
hacer check-in y listar agenda sin pasar por el panel. Se añade en *Claude →
Configuración → Conectores → Añadir conector personalizado*:

```
https://api.gestekeventost.dpdns.org/mcp
```

Claude descubre el OAuth solo. **Ojo con dos cosas**: el conector sólo ve los
eventos **de su dueño** —si devuelve `[]` no está roto, es que esa cuenta no
tiene eventos propios— y en ejecuciones desatendidas (cron, headless) los
conectores con login interactivo pueden no estar disponibles.

**MCP de Supabase.** Es como se miden los datos de verdad y se aplican
migraciones. Sin él no hay forma de comprobar si algo se guardó.

**Navegador.** `SONDEO.md` insiste en esto y hoy volvió a pagar: la aplicación
es una SPA, **cualquier ruta devuelve 200 exista o no**, así que comprobar por
HTTP da falsos positivos. Sólo el navegador ve que una URL cae a la portada.

**Sesión del panel.** Lo público se recorre entero sin login, pero el panel
(`/eventos/:id`) exige sesión. Un agente **no puede escribir contraseñas**, así
que todo lo del panel se verifica con quien tenga la cuenta. Los tres crashes
del 15 de agosto se encontraron leyendo y con el linter, no en pantalla — y
quedaron sin confirmar visualmente por esto.

**Secretos.** No están en el repo y no deben estarlo. Los pone una persona en
cPanel. Ver `DESPLIEGUE.md` y la sección 3 de `CONTEXTO.md`.

---

## 3 · Lo que cambia respecto a local

| | Local (15 de agosto) | En la nube |
|---|---|---|
| Rutas | `C:\Users\...\ProyectosGitHub\...` | las del clon; **no reutilices rutas absolutas de la conversación vieja** |
| Los dos repos | carpetas hermanas | hay que clonar **los dos**: los arreglos suelen tocar ambos |
| Navegador | panel del navegador integrado | comprueba que existe antes de prometer una verificación en pantalla |
| Captura de pantalla | fallaba (panel no visible) | si vuelve a fallar, usa `read_page` y `get_page_text`, que además son más fiables para leer texto |
| Zona horaria | `America/Bogota` (UTC-5) | **compruébala**: media docena de fallos de este proyecto son de fecha, y una máquina en UTC no los distingue |

Ese último punto es el más traicionero. Para que una prueba de fechas
signifique algo, el reloj tiene que estar en hora de Colombia:

```bash
TZ=America/Bogota node loquesea.mjs
```

Y en el navegador, antes de concluir nada:

```js
Intl.DateTimeFormat().resolvedOptions().timeZone   // ha de ser America/Bogota
```

---

## 4 · Cómo comprobar que algo se desplegó

Comparar hashes de bundle **no vale**, y buscar en el chunk principal tampoco:
Vite parte el código y las pantallas viven en chunks perezosos. Lo que sí
funciona, y es lo más rápido, es preguntarle al servicio por el dato:

```bash
curl -s https://api.gestekeventost.dpdns.org/eventos/publicos/slug/festech | head -c 400
```

El despliegue tarda un rato en quedar servido. Conviene esperar en bucle en vez
de mirar a ojo:

```bash
for i in $(seq 1 10); do
  curl -s "<url>" | grep -q "<cadena nueva>" && echo "desplegado" && break
  sleep 20
done
```

Para el frontend, el navegador guarda un service worker que sirve la versión
vieja. Antes de dar por bueno un arreglo:

```js
(async () => {
  for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  for (const k of await caches.keys()) await caches.delete(k);
  location.reload();
})()
```

Y si hay que buscar dentro del bundle, baja los archivos del manifiesto del
service worker (`/sw.js`) y **valida el método con una cadena que sepas que
lleva días en producción** antes de concluir que algo no desplegó.

---

## 5 · El evento de prueba, que es el único modo de sondear lo público

El conector no ve los eventos ajenos y no se puede comprar en uno real. Hay dos
caminos:

**a) `TechNova Summit 2026`** (`technova-summit-2026`) — el evento de banco de
pruebas que dejó la sesión del 1-sep. Ya publicado, con 4 tipos de boleta, 21
campos de formulario y 2 sesiones. Sirve para recorrer §4.1–§4.6 y §6. Para §5
hay que crearle una zona primero. **No borrarlo**: es de la cuenta y se
reutiliza. El mapa de pruebas completo está en el artefacto
`claude.ai/code/artifact/94881685-f739-4ad7-97d3-316f7138d54c`.

**b) Un evento nuevo de usar y tirar**, autorizado por `SONDEO.md` §5:

1. `crear_evento` con un título que grite que es de prueba: `ZZ … (borrar)`.
2. `crear_tipo_ticket`, `crear_bloque_agenda`, y lo que haga falta.
3. `publicar_evento` — un borrador **no** se sirve en público (da 404).
4. Recorrerlo en el navegador.
5. **Borrarlo**: `delete from eventos where id='…' and titulo='ZZ … (borrar)'`.
   Todo lo relevante cae en cascada (boletas, agenda, legal, envíos de correo).
6. Comprobar que la base quedó como estaba.

Cifras de referencia tras limpiar (comprobar las de hoy, se mueven):

```sql
select (select count(*) from eventos) eventos,          -- 15-ago: 31
       (select count(*) from tickets) boletas,          -- 15-ago: 34
       (select count(*) from event_form_fields) campos; -- 15-ago: 20
```

---

## 6 · Reglas al tocar producción

- **No comprar ni reservar en un evento ajeno.** El modal se puede abrir y
  validar sin enviar.
- **No publicar un evento ajeno** ni cambiarle el estado. El propio de prueba
  sí, y se borra después.
- **No mandar correos** a nadie que no sea uno mismo.
- **Avisar antes de aplicar una migración**, y que el código vaya por delante
  de la columna nueva. Al revés ya costó un incidente (31 páginas públicas
  vacías unos minutos).
- **Nunca `router.use(auth)`** en un router montado en `'/'`: autentica toda
  petición que pase por él y deja la web pública en 401. Hay una prueba que lo
  vigila por posición (`test/montaje.test.js`).
- **Cuidado con `git checkout --`** para deshacer un experimento: borra lo no
  guardado de ese archivo. Haz copia antes y verifica con el texto exacto.

---

## 7 · Cómo se trabaja aquí

Del `SONDEO.md`, y confirmado hoy tres veces:

**Medir, no deducir.** Que la API responda no prueba que la pantalla funcione.
`CONTEXTO.md` daba por buena la «página pública (API y web)» de un evento
creado desde el conector; la API devolvía las boletas y la web estaba vacía.

**Reproducir antes de arreglar, y exigir que la prueba falle.** Si escribes una
regresión, vuelve a meter el fallo a propósito y comprueba que salta. Aquí ya
pasó una prueba que pasaba con el fallo puesto porque medía otra cosa.

**Cazar por familia, no por pantalla.** Los fallos se repiten: fecha en UTC
donde toca local, recorte silencioso, error tragado, contar intentos en vez de
éxitos, ruta inventada, confianza falsa, función escrita y no conectada, leer
sin poder escribir. Cuando encuentres uno, busca sus hermanos en los dos repos.

**Pásale el linter antes de leer.** `npm run lint` (sólo `no-undef`) encontró
dos de los tres crashes del 15 de agosto en treinta segundos. Los tres
compilaban sin una queja: son errores de ejecución y Vite no los ve.

**Estilo de la casa.** Comentarios en español que explican **por qué**, no qué.
Los mensajes de commit cuentan el problema y la decisión, no la lista de
archivos. Un commit por hallazgo.

---

## 8 · Dónde está el proyecto ahora

> **Esta sección es del 15 de agosto y ha quedado atrás en varios puntos.**
> Para el estado real: el bloque «Actualización — 1 de septiembre» de arriba,
> `CONTINUAR.md` y `PENDIENTE.md`. En corto: el registro por tipo de boleta, el
> formulario condicional, la agenda con inscripción y el registro embebido
> (§4.1–§4.6) **ya están hechos**; FESTECH IBAGUÉ (`festech2026`) está
> registrando en vivo. Lo de abajo se deja como contexto histórico.

**Festech es el único evento real** de los 31 de la base: 17–19 de septiembre en
Ibagué, Develovers Group SAS, ~7.000 asistentes esperados, **la boletería abre
la semana del 17 de agosto**. Todo lo demás son pruebas.

Lo que le falta a Festech, y **no es código**:

1. **El formulario.** Tenía 2 preguntas. Se descarga la plantilla, se llena con
   la columna **Grupo** puesta (es la que parte el registro en pasos) y se sube.
2. **Los términos.** `evento_legal` sigue vacía en los 11 eventos publicados. La
   cadena está probada entera; falta el texto. El consentimiento **no se puede
   pedir hacia atrás**.
3. **La agenda.** Cero sesiones. Sin sub-eventos marcados como «requiere
   inscripción» no hay a qué apuntarse.

### Pendiente de código, por orden

1. **Selector de tipo de boleta en Proceso de compra.** Que la pantalla empiece
   eligiendo boleta y muestre su formulario. **A medias ya**:
   `event_form_fields.ticket_type_id` existe y el checkout público ya filtra por
   él; falta la interfaz. Es lo que desbloquea el registro de Festech.
2. **Pago por tipo de boleta.** No existe en el modelo: hoy el cobro es del
   evento entero. Migración + checkout + webhook.
3. **Correos**: subir la plantilla visual y que las variables dejen de ser
   `{{nombre}}`. Decidido: botones que insertan el dato con nombre humano, sin
   que el organizador vea sintaxis nunca.
4. **Reportes**: ingresos por tipo de boleta, participación por torneo.
5. **Unir Credenciales con Tarjeta** y **mover Control de ingreso a Espacio del
   evento**. Mecánicos.
6. **Revisión de redundancias** en el flujo de información.

### Pendiente que necesita a una persona

- **`MP_WEBHOOK_SECRET`** en cPanel. El código está listo y el servidor avisa al
  arrancar si falta. Ojo: el diagnóstico viejo («cualquiera marca una boleta como
  pagada») **era falso** — el pago se reverifica contra Mercado Pago. Lo que se
  cerró fue un amplificador de peticiones.
- **Confirmar que el correo llega a la bandeja.** Van cuatro envíos con
  `ok = true`; que Resend acepte no es que entregue. Mirar también correo no
  deseado.
- ~~Verificar en pantalla los arreglos del panel~~ **Hecho el 16 de agosto por
  el equipo: el panel se recorrió entero y funciona.** Queda dicho porque el
  agente no puede entrar (el panel exige sesión y no escribe contraseñas), así
  que todo lo del panel lo verifica una persona — no es una laguna del método,
  es dónde está la frontera.
