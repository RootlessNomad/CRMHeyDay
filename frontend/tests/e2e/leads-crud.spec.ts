import { expect, test } from '@playwright/test';

const EMAIL = process.env['E2E_USER_EMAIL'];
const PASSWORD = process.env['E2E_USER_PASSWORD'];

test.skip(!EMAIL || !PASSWORD, 'Define E2E_USER_EMAIL + E2E_USER_PASSWORD para E2E');

test.describe('UJ-04 — CRUD de leads', () => {
  test('crea, mueve, gana y elimina un lead desde la UI', async ({ page }) => {
    const uniqueSuffix = Date.now();
    const companyName = `E2E Lead Company ${uniqueSuffix}`;
    const companyDomain = `e2e-lead-company-${uniqueSuffix}.test`;
    const leadLabel = companyName;

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

    await page.goto('/leads?view=list');
    await page.getByRole('button', { name: /nuevo lead/i }).click();
    await page.getByLabel(/empresa/i).fill(companyName);
    await page.getByRole('option', { name: new RegExp(companyName, 'i') }).click();
    await page.getByRole('button', { name: /crear lead/i }).click();

    const row = page.locator('tr', { hasText: leadLabel }).first();
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: /mover a stage/i }).click();
    const stageSelect = page.getByLabel(/stage destino/i);
    const options = await stageSelect.locator('option').allTextContents();
    const nextOpenStage = options.find((option) => !/won|lost/i.test(option)) ?? options[0];
    await stageSelect.selectOption({ label: nextOpenStage! });
    await page.getByRole('button', { name: /^confirmar$/i }).click();

    await row.getByRole('button', { name: /^won$/i }).click();
    await page.getByRole('button', { name: /^confirmar$/i }).click();

    await row.getByRole('button', { name: /eliminar/i }).click();
    await page
      .getByRole('button', { name: /^eliminar$/i })
      .last()
      .click();

    await expect(page.getByText(leadLabel)).not.toBeVisible();
  });
});
