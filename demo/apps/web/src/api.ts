import { createDemo } from './demo/store';
export const isDemo = true;
export const demo = createDemo(window.localStorage);
export class RequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export function setCsrf(_value: string) {}
export async function request<T = any>(path: string, method = 'GET', body?: unknown, key?: string): Promise<T> {
  return demo.request(path, method, body, key);
}
