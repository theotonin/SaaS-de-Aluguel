import {z} from 'zod';
export const returnInput=z.object({lines:z.array(z.object({itemId:z.uuid(),receivedQuantity:z.number().int().min(1).max(100000),damagedQuantity:z.number().int().min(0).max(100000).default(0),note:z.string().trim().max(500).default('')}).strict().refine(v=>v.damagedQuantity<=v.receivedQuantity,'A avaria deve fazer parte do recebido.').refine(v=>v.damagedQuantity===0||v.note.length>0,'Descreva a avaria para registrar a manutenção.')).min(1).max(100)}).strict().refine(v=>new Set(v.lines.map(l=>l.itemId)).size===v.lines.length,'Cada material deve aparecer uma única vez.');
export const maintenanceInput=z.object({quantity:z.number().int().min(1).max(100000),note:z.string().trim().min(1).max(500)}).strict();

export const closeInput=z.object({}).strict();
export const reopenInput=z.object({reason:z.string().trim().min(1).max(500)}).strict();
