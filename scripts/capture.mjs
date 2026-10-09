import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
await mkdir('.local/screens', { recursive: true });
const base = process.env.CAPTURE_URL || 'http://127.0.0.1:5178';
const results = [];
for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  await page.getByRole('heading', { name: 'Visão geral', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  for (const [name, action] of [
    ['overview', async () => {}],
    ['materials', async () => page.getByRole('button', { name: 'Materiais', exact: true }).click()],
    ['quote', async () => { await page.getByRole('button', { name: /^Reservas/ }).click(); await page.getByRole('button', { name: 'Novo orçamento', exact: true }).click(); }],
    ['superadmin', async () => page.getByLabel('Perfil da demonstração').selectOption('superadmin')],
  ]) {
    await action();
    await page.screenshot({ path: `.local/screens/${name}-${width}.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    results.push({ name, width, overflow, errors: [...errors] });
  }
  await page.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 2));
if (results.some(r => r.overflow || r.errors.length)) process.exitCode = 1;
