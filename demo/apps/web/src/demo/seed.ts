import type { Company, Customer, Item, Rental, Member, Audit } from "../types";
export type CompanyData = {
  customers: Customer[];
  items: Item[];
  rentals: Rental[];
  members: Member[];
};
export type DemoState = {
  version: 1;
  organizations: Company[];
  data: Record<string, CompanyData>;
  audit: Audit[];
  operations: Record<string, { fingerprint: string; result: any }>;
};
export function seed(): DemoState {
  const id = crypto.randomUUID();
  const company: Company = {
    id,
    name: "Celebra Locações",
    slug: "celebra-demo",
    accent: "#acd5bd",
    status: "active",
    plan: "Piloto",
    user_limit: 5,
    item_limit: 100,
    created_at: new Date().toISOString(),
  };
  const customers: Customer[] = [
    {
      id: crypto.randomUUID(),
      name: "Marina Oliveira",
      phone: "(11) 99999-0101",
      email: "marina@example.test",
      address: "Rua das Flores, 120 — endereço fictício",
    },
    {
      id: crypto.randomUUID(),
      name: "Lucas Ferreira",
      phone: "(11) 99999-0102",
      email: "",
      address: "Av. Central, 240 — endereço fictício",
    },
    {
      id: crypto.randomUUID(),
      name: "Beatriz Santos",
      phone: "(11) 99999-0103",
      email: "",
      address: "Rua do Jardim, 85 — endereço fictício",
    },
  ];
  const items: Item[] = [
    {
      id: crypto.randomUUID(),
      name: "Cadeira Tiffany branca",
      category: "Mobiliário",
      description: "Cadeira para cerimônias e recepções.",
      quantity: 100,
      unit_price: 850,
    },
    {
      id: crypto.randomUUID(),
      name: "Mesa redonda · 6 lugares",
      category: "Mobiliário",
      description: "Mesa de apoio para festas.",
      quantity: 20,
      unit_price: 3500,
    },
    {
      id: crypto.randomUUID(),
      name: "Toalha de linho natural",
      category: "Mesa posta",
      description: "Toalha para mesa redonda.",
      quantity: 25,
      unit_price: 1800,
    },
    {
      id: crypto.randomUUID(),
      name: "Painel de fundo modular",
      category: "Decoração",
      description: "Estrutura modular para decoração.",
      quantity: 4,
      unit_price: 18000,
    },
    {
      id: crypto.randomUUID(),
      name: "Tenda branca · 3 × 3 m",
      category: "Estruturas",
      description: "Tenda para eventos ao ar livre.",
      quantity: 6,
      unit_price: 25000,
    },
    {
      id: crypto.randomUUID(),
      name: "Suporte para doces",
      category: "Mesa posta",
      description: "Suporte de cerâmica para composição de mesa.",
      quantity: 12,
      unit_price: 2200,
    },
  ];
  const date = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(10, 0, 0, 0);
    return d.toISOString();
  };
  const rental = (
    number: number,
    customer: Customer,
    offset: number,
    status: string,
    quantity: number,
  ): Rental => ({
    id: crypto.randomUUID(),
    number,
    customer_id: customer.id,
    customer_name: customer.name,
    customer_phone: customer.phone,
    customer_address: customer.address,
    starts_at: date(offset),
    ends_at: date(offset + 1),
    days: 1,
    delivery: 5000,
    discount: 0,
    total: quantity * 850 + 5000,
    status,
    notes: "Dados fictícios para explorar a demonstração.",
    cancellation_reason: "",
    fulfillment: "delivery",
    lines: [
      { item_id: items[0].id, name: items[0].name, quantity, unit_price: 850 },
    ],
  });
  return {
    version: 1,
    organizations: [company],
    data: {
      [id]: {
        customers,
        items,
        rentals: [
          rental(1041, customers[0], 0, "confirmed", 40),
          rental(1042, customers[1], 2, "draft", 30),
          rental(1043, customers[2], 4, "confirmed", 60),
        ],
        members: [
          {
            id: crypto.randomUUID(),
            name: "Gestor da demonstração",
            email: "gestor@example.test",
            role: "admin",
            active: true,
          },
        ],
      },
    },
    audit: [],
    operations: {},
  };
}
