import {test,expect} from '@playwright/test';
test('commercial client preserves original key and exact body through reload and a second lost response',async({page})=>{
 const keys=new Set<string>();let calls=0;
 await page.route('**/api/**',async route=>{
  const req=route.request();
  if(req.url().endsWith('/finance')&&req.method()==='POST'){calls++;keys.add(req.headers()['idempotency-key']);await route.abort('failed');return;}
  if(req.url().includes('/operations/')){await route.fulfill({json:{found:true,result:{}}});return;}
  await route.fulfill({status:401,json:{error:'Entre na conta de teste'}});
 });
 await page.goto('http://127.0.0.1:5183');await expect(page.getByRole('button',{name:'Entrar no Tonin Loca',exact:true})).toBeVisible();
 const initial=await page.evaluate(async()=>{
  const {request}=await import(/* @vite-ignore */ String('/src/api.ts'));const {mutationRecovery}=await import(/* @vite-ignore */ String('/src/mutation-recovery.ts'));
  mutationRecovery.setIdentity({userId:'test-user',organizationId:'test-org'});const key=crypto.randomUUID();
  try{await request('/rentals/test-rental/finance','POST',{kind:'payment',amount:100,method:'pix',note:'Teste'},key);}catch{}
  return {key,pending:mutationRecovery.pending()?.key,stored:sessionStorage.getItem('tonin-loca-pending-reference-v1')};
 });expect(initial.pending).toBe(initial.key);expect(initial.stored).not.toContain('amount');
 await page.reload();await expect(page.getByRole('button',{name:'Entrar no Tonin Loca',exact:true})).toBeVisible();
 const restored=await page.evaluate(async()=>{
  const {request}=await import(/* @vite-ignore */ String('/src/api.ts'));const {mutationRecovery,mutationKey}=await import(/* @vite-ignore */ String('/src/mutation-recovery.ts'));mutationRecovery.setIdentity({userId:'test-user',organizationId:'test-org'});
  const formKey=mutationKey('/rentals/test-rental/finance');
  try{await request('/rentals/test-rental/finance','POST',{kind:'payment',amount:100,method:'pix',note:'Teste'},formKey);}catch{}
  const pending=mutationRecovery.pending()?.key;const result=await request('/operations/'+formKey);mutationRecovery.confirmLookup(formKey,result);
  return {formKey,pending,after:mutationRecovery.pending()};
 });expect(restored.formKey).toBe(initial.key);expect(restored.pending).toBe(initial.key);expect(restored.after).toBeNull();expect(calls).toBe(2);expect(keys.size).toBe(1);
});
