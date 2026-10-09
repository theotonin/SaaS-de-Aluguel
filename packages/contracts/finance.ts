import { z } from 'zod';
export const financeInput = z.object({
  kind: z.enum(['payment','refund','deposit_received','deposit_refund','expense','charge','charge_reversal']),
  amount: z.number().int().min(1).max(100000000),
  method: z.enum(['cash','pix','card','transfer','other']),
  note: z.string().trim().min(1).max(500),
}).strict();
export type FinanceInput = z.infer<typeof financeInput>;
export type FinanceEntry = FinanceInput & { id: string; created_at: string };
export type FinanceSummary = { charged:number; paid:number; balance:number; credit:number; depositHeld:number; expenses:number };
export type FinanceDetails = { entries:FinanceEntry[]; summary:FinanceSummary };
