# GESTEK — Web (gestor-eventos-frontend)

Interfaz de **GESTEK**, una plataforma de marca blanca para organizar eventos.
Tiene dos caras:

- **Público y asistentes:** página del evento, registro y compra de boletas,
  la boleta con QR, el carné digital, agenda, mapa, torneos y networking.
- **Organizador y su equipo:** editor del evento y su landing, formularios,
  boletas, puerta y escáner, aforo por zonas, equipo y roles, reportes,
  conectores e integraciones.

Este repositorio es el frontend (React + Vite, instalable como PWA). La API
está en [gestor-eventos-backend](https://github.com/BBMC-S-S-A/gestor-eventos-backend).

## En producción

| | URL |
|---|---|
| Web | https://gestekeventost.dpdns.org |
| API | https://api.gestekeventost.dpdns.org |

## Uso real

**FESTECH Ibagué** (Alcaldía de Ibagué), del 17 al 19 de septiembre de 2026:
4.485 boletas emitidas, 3.334 personas con ingreso registrado en los tres días
(1.555 el día de más asistencia) y un pico de 67 ingresos en 5 minutos por una
sola puerta. De ese evento salieron el informe de ingresos por hora, los seis
motivos de rechazo en puerta y la elección automática de puerta en el escáner.

## Arquitectura

```
Navegador (React 18 + Vite, PWA)
   │
   ├──► cPanel / Apache ── este sitio, servido como estático
   │
   ├──► API Express en cPanel ── lógica, permisos, pagos, correo
   │        └──► Supabase Postgres
   │
   └──► Supabase directo ── Auth (Google), Storage, Realtime (chat)
```

El frontend pide casi todo a la API propia. Habla directo con Supabase solo
para iniciar sesión, subir archivos a los tres buckets públicos y el canal de
chat. La URL de la API se resuelve en un único sitio (`src/lib/apiUrl.js`).

### Antes y ahora

| | Antes | Ahora |
|---|---|---|
| Hosting de la web | Vercel | cPanel (desde **2026-09-17**) |
| Hosting de la API | Render | cPanel con Passenger (desde **2026-09-17**) |
| Build | `npm ci` + `vite build` dentro de cPanel, que se quedaba sin memoria y fallaba sin avisar | GitHub Actions construye y publica en la rama `deploy`; cPanel solo copia (desde **2026-09-21**) |
| Base y auth | Supabase | Supabase; **migración a MySQL en cPanel en curso**, detrás de la bandera `AUTH_PROPIA` |

## Herramientas e infraestructura

| Área | Herramienta | Notas |
|---|---|---|
| Hosting | cPanel | `public_html` se actualiza copiando la rama `deploy` |
| CI | GitHub Actions | `pruebas.yml` (lint, pruebas, build y pruebas del registro embebido) y `publicar.yml` (build y rama `deploy`, solo si las pruebas pasan) |
| Base de datos | Supabase Postgres | A través de la API; migración a MySQL en curso |
| Autenticación | Supabase Auth | Google y correo; auth propia lista en `src/lib/authPropia.js` |
| Archivos | Supabase Storage | `avatars`, `event-media`, `form-uploads` |
| Tiempo real | Supabase Realtime | Chat; la asistencia en vivo usa sondeo |
| Monitoreo | Sentry | En la API |
| Anti-bot | Cloudflare Turnstile | `VITE_TURNSTILE_SITE_KEY` |
| Pagos | Mercado Pago (cuenta de cada organizador), Wompi (listo) | |
| Correo | SMTP propio, Gmail OAuth2, Resend | Lo envía la API |
| IA | Anthropic, Gemini | Asistente del panel, servido por la API |
| PWA | vite-plugin-pwa, web-push | Service worker en `src/sw.js` |
| Pruebas | `node --test`, Playwright | ~600 pruebas unitarias y de contrato; e2e en `tests/e2e/` |

## Funciones principales

- Boleta con **QR firmado** y vista pública de la boleta.
- **Escáner de puerta** con reingreso, elección de puerta y motivo de cada
  rechazo.
- **Padrón previo por cédula** que prellena el registro.
- **Impresión de escarapelas** y **carné digital** con QR de networking.
- **Registro embebible por iframe** (`/embed/:slug/:seccion`, `public/widget.js`)
  que hereda la tipografía de la web anfitriona.
- **Mapa por zonas** con aforo y alerta visual cuando una zona se llena.
- Informes: ingresos por hora, rechazos de puerta y reporte imprimible.
- **Conectar Claude:** el organizador autoriza herramientas externas por OAuth2
  con PKCE contra el servidor MCP de la API.
- Editor de landing, formularios con condiciones, agenda, sub-eventos, torneos
  con jurado, rueda de negocios, vacantes, recompensas y chat.
- Interfaz en español con traducción al inglés (`src/i18n/`).

## Puesta en marcha en local

Requisitos: Node.js 20 o superior (el CI usa 22).

```bash
npm ci
cp .env.example .env.local   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL
npm run dev                  # http://localhost:5173
```

Para trabajar contra una API local, levantar el backend en `:3000` y apuntar
`VITE_API_URL` ahí. Las variables `VITE_*` se incrustan al compilar: lo que
necesite el sitio publicado tiene que estar en el repositorio o en los
secretos de Actions, no solo en el servidor.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo de Vite |
| `npm run build` / `npm run preview` | Build de producción y vista previa |
| `npm test` | Pruebas con `node --test` |
| `npm run test:e2e` | Pruebas de extremo a extremo con Playwright |
| `npm run test:widget` | Pruebas del registro embebido |
| `npm run lint` | ESLint |
| `npm run i18n:auditar` | Revisa claves de traducción (requiere Python) |

## Estructura

```
src/
  App.jsx              rutas
  pages/               pantallas: públicas, eventos, ajustes, conectar, equipo…
  components/          por dominio: aforo, mapa, plano, formulario, permisos, ui…
  api/                 clientes de la API
  context/ hooks/      sesión y estado compartido
  lib/                 lógica sin interfaz (apiUrl, ingresosPorHora, authPropia…)
  i18n/                traducciones
  sw.js                service worker
public/                manifest, iconos, widget.js del registro embebido, .htaccess
deploy/                cpanel.yml y gitignore que se copian a la rama deploy
tests/                 pruebas unitarias, e2e y de contrato
scripts/               utilidades (auditoría de i18n…)
```

## Decisiones y advertencias

- **El build sale de cPanel.** Actions compila el commit exacto que pasó las
  pruebas y lo publica en `deploy`; cPanel solo copia. Desaparece el fallo de
  "verde pero no publicó" y queda rastro de qué commit está en el aire. Si
  Actions no está disponible, se puede volver a apuntar cPanel a `main`: el
  `.cpanel.yml` de la raíz sigue construyendo como antes.
- **No crear ramas con prefijo `deploy/`**: git no admite a la vez `deploy` y
  `deploy/algo`.
- **Fusionar no es desplegar** en la API: se publica a mano en cPanel.
- **`QR_JWT_SECRET` en la API debe ser el mismo en todos los entornos**; si
  cambia, las boletas ya emitidas dejan de validar en el escáner.
- Los archivos de configuración de Vercel que queden en el repositorio son
  históricos.
