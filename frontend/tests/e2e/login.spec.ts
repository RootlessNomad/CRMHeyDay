// E2E del flujo de login (UJ-01).
//
// Pre-requisitos: backend + frontend corriendo localmente, DB seedeada con
// Alex (`pnpm seed:demo`). Las credenciales se leen de env:
//   E2E_USER_EMAIL, E2E_USER_PASSWORD
// Si no están definidas, los tests se saltan — así CI no falla por entorno.

import { expect, test } from '@playwright/test';

const EMAIL = process.env['E2E_USER_EMAIL'];
const PASSWORD = process.env['E2E_USER_PASSWORD'];

test.skip(!EMAIL || !PASSWORD, 'Define E2E_USER_EMAIL + E2E_USER_PASSWORD para E2E');

test.describe('UJ-01 — Login y sesión persistente', () => {
  test('happy path: login → dashboard → reload mantiene sesión', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(EMAIL!);
    await page.getByLabel(/contraseña/i).fill(PASSWORD!);
    await page.getByRole('button', { name: /entrar/i }).click();

    await page.waitForURL('**/dashboard');
    await expect(page.getByRole('heading', { name: /hola/i })).toBeVisible();

    // Recargar la página: AuthBootstrap debe restaurar la sesión via cookie.
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: /hola/i })).toBeVisible();
  });

  test('credenciales inválidas: muestra toast de error y permanece en /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(EMAIL!);
    await page.getByLabel(/contraseña/i).fill('definitelywrong-1234');
    await page.getByRole('button', { name: /entrar/i }).click();

    // Mensaje del backend mapeado a copy ES.
    await expect(page.getByText(/incorrectos/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout: limpia sesión y vuelve a /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(EMAIL!);
    await page.getByLabel(/contraseña/i).fill(PASSWORD!);
    await page.getByRole('button', { name: /entrar/i }).click();
    await page.waitForURL('**/dashboard');

    // Abre el menú del avatar y pulsa "Cerrar sesión".
    await page
      .getByRole('button', { name: /·|alex|alba/i })
      .first()
      .click();
    await page.getByRole('menuitem', { name: /cerrar sesión/i }).click();

    await page.waitForURL('**/login');
    // Tras logout, intentar volver a /dashboard debe redirigir al middleware.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
