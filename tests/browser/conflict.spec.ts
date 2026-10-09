import { test, expect } from '@playwright/test';
test('a refused confirmation can be corrected by canceling the unconfirmed quote', async ({ page }) => {
  await page.goto('/');
  async function quote() {
    await page.getByRole('button', { name: /^Reservas/ }).click();
    await page.getByRole('button', { name: 'Novo orçamento', exact: true }).click();
    await page.getByRole('combobox', { name: 'Cliente', exact: true }).selectOption({ index: 1 });
    await page.getByLabel('Retirada', { exact: true }).fill('2027-03-10T10:00');
    await page.getByLabel('Retorno previsto').fill('2027-03-11T10:00');
    await page.getByRole('combobox', { name: 'Material 1', exact: true }).selectOption({ label: 'Cadeira Tiffany branca' });
    await page.getByLabel('Quantidade 1').fill('100');
    await page.getByRole('button', { name: 'Salvar orçamento' }).click();
    await expect(page.getByRole('heading', { name: /Orçamento #/ })).toBeVisible();
  }
  await quote();
  await page.getByRole('button', { name: 'Confirmar reserva' }).click();
  await expect(page.getByText('Reserva confirmada.', { exact: true })).toBeVisible();
  await quote();
  await page.getByRole('button', { name: 'Confirmar reserva' }).click();
  await expect(page.getByRole('alert')).toContainText('disponíveis');
  await page.getByRole('button', { name: 'Cancelar orçamento', exact: true }).click();
  await page.getByLabel('Motivo do cancelamento').fill('Cliente prefere outro período.');
  await page.getByRole('button', { name: 'Confirmar cancelamento' }).click();
  await expect(page.locator('.rental-document').getByText('Cancelada', { exact: true })).toBeVisible();
});
