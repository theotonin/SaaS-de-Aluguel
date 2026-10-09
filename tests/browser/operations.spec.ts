import { test, expect } from '@playwright/test';

test('Today and finance report work in the browser-only demo and keep finance out of operator navigation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Hoje',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Hoje',exact:true})).toBeVisible();
  await expect(page.getByText('Devoluções atrasadas',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Financeiro',exact:true}).click();
  await page.getByLabel('De',{exact:true}).fill('2027-01-01');
  await page.getByLabel('Até',{exact:true}).fill('2027-01-31');
  await page.getByRole('button',{name:'Gerar relatório'}).click();
  await expect(page.getByRole('heading',{name:/Período de 2027-01-01/})).toBeVisible();
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Exportar CSV'}).click();
  expect((await download).suggestedFilename()).toBe('tonin-loca-financeiro.csv');
  await page.getByText('Perfis e opções',{exact:true}).click();
  await page.getByLabel('Perfil simulado').selectOption('operator');
  await expect(page.getByRole('button',{name:'Financeiro',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Hoje',exact:true})).toBeVisible();
});

test('rental quote selectors search remotely and page through larger catalogs', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button',{name:/^Reservas/}).click();
  await page.getByRole('button',{name:'Novo orçamento',exact:true}).click();
  await page.getByRole('textbox',{name:'Buscar cliente'}).fill('marina');
  await expect(page.getByRole('combobox',{name:'Cliente'}).locator('option')).toHaveCount(2);
  await page.getByRole('combobox',{name:'Cliente'}).selectOption({label:'Marina Oliveira'});
  await page.getByRole('textbox',{name:'Buscar material'}).fill('tiffany');
  await expect(page.getByRole('combobox',{name:'Material 1'}).locator('option')).toHaveCount(2);
});
