import { defineConfig, devices } from '@playwright/test';

/* Pruebas E2E de navegación. Objetivo principal: cazar secciones que se caen
   (pantalla en blanco / error). Requiere credenciales de una cuenta de prueba
   y la URL de la app.

   Variables de entorno:
     E2E_BASE_URL      URL de la app (default: producción)
     E2E_EMAIL         email de la cuenta de prueba
     E2E_PASSWORD      contraseña
     E2E_EVENT_ID      (opcional) id de un evento para recorrer sus secciones

   Correr:  npm run test:e2e        (o  npm run test:e2e:ui  para ver el navegador)
*/
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://gestekeventost.dpdns.org',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
