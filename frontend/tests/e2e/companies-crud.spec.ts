import { expect, test } from '@playwright/test';

const EMAIL = process.env['E2E_USER_EMAIL'];
const PASSWORD = process.env['E2E_USER_PASSWORD'];

test.skip(!EMAIL || !PASSWORD, 'Define E2E_USER_EMAIL + E2E_USER_PASSWORD para E2E');

test.describe('UJ-02 — CRUD de empresas', () => {
  test('crea, edita y elimina una empresa desde la UI', async ({ page }) => {
    const uniqueSuffix = Date.now();
    const companyName = `E2E UJ02 ${uniqueSuffix}`;
    const companyDomain = `e2e-uj02-${uniqueSuffix}.test`;

    await page.goto('/login');
    await page.getByLabel(/email/i).fill(EMAIL!);
    await page.getByLabel(/contraseña/i).fill(PASSWORD!);
    await page.getByRole('button', { name: /entrar/i }).click();

    await page.waitForURL('**/dashboard');
    await page.goto('/companies');
    await page.getByRole('button', { name: /nueva empresa/i }).click();

    await page.getByLabel(/nombre/i).fill(companyName);
    await page.getByLabel(/dominio/i).fill(companyDomain);
    await page.getByLabel(/^país$/i).fill('ES');
    await page.getByRole('button', { name: /crear empresa/i }).click();

    await expect(page.getByRole('link', { name: companyName })).toBeVisible();
    await page.getByRole('link', { name: companyName }).click();

    await expect(page).toHaveURL(/\/companies\/.+/);
    await expect(page.getByRole('heading', { name: companyName })).toBeVisible();

    await page.getByRole('button', { name: /editar/i }).click();
    await page.getByLabel(/ciudad/i).fill('Valencia');
    await page.getByRole('button', { name: /guardar cambios/i }).click();

    await expect(page.getByText('Valencia')).toBeVisible();
    await expect(page.getByText(/actualizado/i)).toBeVisible();

    await page.getByRole('button', { name: /eliminar/i }).click();
    await page
      .getByRole('button', { name: /^eliminar$/i })
      .last()
      .click();

    await page.waitForURL('**/companies');
    await expect(page.getByRole('link', { name: companyName })).not.toBeVisible();
  });
});
