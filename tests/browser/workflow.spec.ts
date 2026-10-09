import { test, expect } from "@playwright/test";

test("customer, material, quote and confirmation work through the demo interface", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Demonstração · dados fictícios")).toBeVisible();
  await page.getByRole("button", { name: "Clientes", exact: true }).click();
  await page.getByRole("button", { name: "Novo cliente", exact: true }).click();
  await page.getByLabel("Nome do cliente").fill("Cliente do teste");
  await page.getByLabel("Telefone", { exact: true }).fill("11999999999");
  await page.getByRole("button", { name: "Salvar cliente" }).click();
  await expect(
    page.getByRole("cell", { name: "Cliente do teste", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Materiais", exact: true }).click();
  await page
    .getByRole("button", { name: "Novo material", exact: true })
    .click();
  await page.getByLabel("Nome do material").fill("Mesa de teste");
  await page.getByLabel("Categoria", { exact: true }).fill("Mobiliário");
  await page.getByLabel("Quantidade total").fill("20");
  await page.getByLabel("Valor da diária (R$)").fill("15");
  await page.getByRole("button", { name: "Salvar material" }).click();
  await expect(
    page.getByRole("cell", { name: "Mesa de teste", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Reservas/ }).click();
  await page
    .getByRole("button", { name: "Novo orçamento", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Cliente", exact: true })
    .selectOption({ label: "Cliente do teste" });
  await page.getByLabel("Retirada", { exact: true }).fill("2027-02-10T10:00");
  await page.getByLabel("Retorno previsto").fill("2027-02-11T10:00");
  await page.getByRole("combobox", { name: "Material 1", exact: true }).selectOption({ label: "Mesa de teste" });
  await page.getByLabel("Quantidade 1").fill("5");
  await page.getByRole("button", { name: "Salvar orçamento" }).click();
  await expect(
    page.getByRole("heading", { name: /Orçamento #/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirmar reserva" }).click();
  await expect(
    page.getByText("Reserva confirmada.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^Reservas/ }).click();
  await expect(
    page.getByRole("cell", { name: "Cliente do teste", exact: true }),
  ).toBeVisible();
});

test("mobile navigation and superadmin stay usable without page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Perfil da demonstração").selectOption("superadmin");
  await expect(
    page.getByRole("heading", { name: "Empresas", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nova empresa" }).click();
  await expect(page.getByLabel("Nome da empresa")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
