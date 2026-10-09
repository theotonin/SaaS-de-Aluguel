import { createDemo } from "./demo/store";
export const isDemo = import.meta.env.VITE_DEMO === "true";
export const demo = isDemo ? createDemo(window.localStorage) : null;
let csrf = "";
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function setCsrf(value: string) {
  csrf = value;
}
export async function request<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
): Promise<T> {
  if (demo) return demo.request(path, method, body, key);
  let res: Response;
  try {
    res = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "Sem conexão com o servidor. Confira a conexão antes de tentar novamente.",
    );
  }
  const data = await res.json().catch(() => ({
    error: "O servidor não respondeu como esperado. Tente novamente.",
  }));
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event("session-expired"));
    throw new RequestError(
      data.error ?? "Não foi possível concluir a operação.",
      res.status,
    );
  }
  return data;
}
