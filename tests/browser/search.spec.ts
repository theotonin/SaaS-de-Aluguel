import { test, expect } from "@playwright/test";

test("search supports phone numbers, email, flexible material terms and clear controls", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Clientes", exact: true }).click();
  const customers = page.getByRole("searchbox", {
    name: "Buscar nome, telefone ou e-mail",
  });
  await customers.fill("11999990101");
  await expect(
    page.getByRole("cell", { name: "Marina Oliveira", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("1 de 1 clientes", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Limpar busca", exact: true }).click();
  await expect(customers).toHaveValue("");
  await expect(customers).toBeFocused();
  await customers.fill("marina@example.test");
  await expect(
    page.getByRole("cell", { name: "Marina Oliveira", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Materiais", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Buscar material ou categoria" })
    .fill("  BRANCA   mobiliario ");
  await expect(
    page.getByRole("row").filter({ hasText: "Cadeira Tiffany branca" }),
  ).toBeVisible();
  await expect(
    page.getByText("1 de 1 materiais", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Reservas/ }).click();
  await page
    .getByRole("searchbox", { name: "Buscar cliente ou número" })
    .fill("inexistente");
  await expect(
    page.getByText("Nenhuma reserva encontrada", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Filtrar etapa" })
    .selectOption("draft");
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();
  await expect(
    page.getByRole("searchbox", { name: "Buscar cliente ou número" }),
  ).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "Filtrar etapa" }),
  ).toHaveValue("all");
});

test("search and clear control fit on narrow mobile screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "Clientes", exact: true }).click();
  await page.getByRole("searchbox").fill("marina");
  const clear = page.getByRole("button", { name: "Limpar busca", exact: true });
  await expect(clear).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await clear.click();
  await expect(page.getByRole("searchbox")).toBeFocused();
});
