import { expect, test } from '@playwright/test';

const EMAIL = process.env['E2E_USER_EMAIL'];
const PASSWORD = process.env['E2E_USER_PASSWORD'];

test.skip(!EMAIL || !PASSWORD, 'Define E2E_USER_EMAIL + E2E_USER_PASSWORD para E2E');

test.describe('UJ-03 — CRUD de contactos', () => {
  test('crea, edita, anonimiza y elimina un contacto desde la UI', async ({ page }) => {
    const uniqueSuffix = Date.now();
    const companyName = `E2E Contact Company ${uniqueSuffix}`;
    const companyDomain = `e2e-contact-company-${uniqueSuffix}.test`;
    const contactName = `E2E Contact ${uniqueSuffix}`;

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

    await page.goto('/contacts');
    await page.getByRole('button', { name: /nuevo contacto/i }).click();
    await page.getByLabel(/nombre/i).fill(contactName);
    await page.getByLabel(/email/i).fill(`contact-${uniqueSuffix}@heyday.test`);
    await page.getByRole('button', { name: /crear contacto/i }).click();

    await expect(page.getByRole('link', { name: contactName })).toBeVisible();
    await page.getByRole('link', { name: contactName }).click();

    await expect(page).toHaveURL(/\/contacts\/.+/);
    await expect(page.getByRole('heading', { name: contactName })).toBeVisible();

    await page.getByRole('button', { name: /editar/i }).click();
    await page.getByLabel(/empresa/i).fill(companyName);
    await page.getByRole('option', { name: new RegExp(companyName, 'i') }).click();
    await page.getByLabel(/contacto principal/i).check();
    await page.getByRole('button', { name: /guardar cambios/i }).click();

    await expect(page.getByText('Primary')).toBeVisible();
    await expect(page.getByText(companyDomain)).not.toBeVisible();

    await page.getByRole('button', { name: /anonimizar/i }).click();
    await page.getByLabel(/confirmación/i).fill('ANONIMIZAR');
    await page
      .getByRole('button', { name: /^anonimizar$/i })
      .last()
      .click();

    await expect(page.getByText('Anonimizado')).toBeVisible();
    await expect(page.getByText(contactName)).not.toBeVisible();
    await expect(page.getByText(`contact-${uniqueSuffix}@heyday.test`)).not.toBeVisible();

    await page.getByRole('button', { name: /eliminar/i }).click();
    await page
      .getByRole('button', { name: /^eliminar$/i })
      .last()
      .click();

    await page.waitForURL('**/contacts');
  });
});
