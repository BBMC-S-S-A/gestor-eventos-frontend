import { defineConfig, devices } from '@playwright/test';

/* Pruebas del botón incrustable, aparte de las de navegación.
 *
 * Van con su propia configuración porque no necesitan nada de lo que necesitan
 * aquéllas: ni cuenta de prueba, ni la app desplegada, ni internet. Se sirve
 * una carpeta estática con `widget.js` y una página que hace de web ajena, y
 * se comprueba lo que pasa en esa página.
 *
 * El servidor sirve `tests/widget/` y `public/` a la vez montando un enlace
 * simbólico; lo prepara `scripts/servir-widget.mjs`.
 *
 * Correr:  npm run test:widget
 */
export default defineConfig({
  testDir: './tests/widget',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4319',
    trace: 'on-first-retry',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      /* El Chromium del entorno, cuando lo hay. Playwright busca por versión
         exacta y en un contenedor con el navegador ya instalado esa versión
         casi nunca coincide; sin esto, la prueba pide descargar 150 MB que ya
         están en el disco. En una máquina normal la variable no existe y
         Playwright usa el suyo. */
      launchOptions: process.env.PLAYWRIGHT_CHROMIUM
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM }
        : undefined,
    },
  }],
  webServer: {
    command: 'node scripts/servir-widget.mjs',
    url: 'http://127.0.0.1:4319/host.html',
    reuseExistingServer: true,
    timeout: 20_000,
  },
});
