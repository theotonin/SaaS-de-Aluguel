import {mutationRecovery,trackedMutation} from './mutation-recovery';
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
  if (demo) {
    const value=await demo.request(path,method,body,key);
    if(key)window.dispatchEvent(new CustomEvent('mutation-resolved',{detail:{key}}));
    return value;
  }
  const tracked=trackedMutation(path,method);
  if(tracked){const previous=mutationRecovery.pending();if(previous&&previous.body===undefined){try{key=await mutationRecovery.restoreBody(path,body);}catch(error){throw new RequestError((error as Error).message,400);}}if(!key)throw new Error('Esta operação exige um identificador de confirmação.');mutationRecovery.begin(path,body,key);await mutationRecovery.seal(key);}
  else if(mutationRecovery.pending()&&!['GET','HEAD'].includes(method)&&!path.startsWith('/auth/'))throw new Error('Confira a operação pendente antes de registrar outra alteração.');
  const controller=new AbortController();
  const timeout=window.setTimeout(()=>controller.abort(),15000);
  let res: Response;
  try {
    res = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      signal:controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    window.clearTimeout(timeout);
    if(tracked)mutationRecovery.fail(key!);
    throw new Error(
      "Sem conexão com o servidor. Confira a conexão antes de tentar novamente.",
    );
  }
  let data:any;
  try{data=path.includes('/finance/report')&&path.includes('format=csv')?{csv:await res.text()}:await res.json();}catch{
    if(tracked)mutationRecovery.fail(key!,res.ok?undefined:res.status);
    throw new Error('O servidor não respondeu como esperado. Confira o envio anterior antes de repetir.');
  }finally{window.clearTimeout(timeout);}
  if (!res.ok) {
    if(tracked)mutationRecovery.fail(key!,res.status);
    if (res.status === 401) window.dispatchEvent(new Event("session-expired"));
    throw new RequestError(
      data.error ?? "Não foi possível concluir a operação.",
      res.status,
    );
  }
  if(tracked){mutationRecovery.complete(key!);window.dispatchEvent(new CustomEvent('mutation-resolved',{detail:{key}}));}
  return data;
}
