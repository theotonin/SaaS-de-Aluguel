export type Company = {
  id: string;
  name: string;
  slug: string;
  accent: string;
  status: "active" | "suspended";
  plan: string;
  user_limit: number;
  item_limit: number;
  created_at: string;
};
export type User = {
  id: string;
  name: string;
  email: string;
  role: "superadmin" | "admin" | "attendant" | "operator";
  organization_id: string | null;
  organization: Company | null;
  csrf: string;
};
export type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
};
export type Item = {
  id: string;
  name: string;
  category: string;
  description: string;
  quantity: number;
  unit_price: number;
  available?: number;
  maintenance_quantity?: number;
};
export type Line = {
  item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  received_quantity?: number;
  damaged_quantity?: number;
};
export type ReturnEvent = { id: string; created_at: string; lines: {item_id: string; name: string; received_quantity: number; damaged_quantity: number; note: string}[] };
export type Maintenance = { id: string; item_id: string; name: string; quantity: number; remaining_quantity: number; note: string; created_at: string; releases?: {id:string;quantity:number;note:string;created_at:string}[] };
export type Rental = {
  id: string;
  number: number | string;
  customer_id: string;
  customer_name: string;
  customer_phone?: string;
  customer_address?: string;
  starts_at: string;
  ends_at: string;
  days: number;
  delivery: number;
  discount: number;
  total: number | string;
  status: string;
  notes: string;
  cancellation_reason: string;
  fulfillment: "pickup" | "delivery";
  lines?: Line[];
  returns?: ReturnEvent[];
  maintenance?: Maintenance[];
  reopenings?: {id:string;reason:string;created_at:string}[];
};
export type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
};
export type Audit = {
  action: string;
  created_at: string;
  company: string;
  actor: string;
};

export type Screen =
  | "overview"
  | "agenda"
  | "rentals"
  | "items"
  | "customers"
  | "team"
  | "companies"
  | "audit"
  | "quote"
  | "detail";
