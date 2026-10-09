import {test,expect} from '@playwright/test';
test('manual finance keeps deposits separate and requires settlement before closing',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/^Reservas/}).click();await page.getByRole('button',{name:'Novo orçamento',exact:true}).click();
 await page.getByRole('combobox',{name:'Cliente',exact:true}).selectOption({index:1});
 const local=(d:Date)=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
 await page.getByLabel('Retirada',{exact:true}).fill(local(new Date(Date.now()-3600000)));await page.getByLabel('Retorno previsto').fill(local(new Date(Date.now()+86400000)));
 await page.getByRole('combobox',{name:'Material 1',exact:true}).selectOption({label:'Cadeira Tiffany branca'});await page.getByLabel('Quantidade 1').fill('1');await page.getByRole('button',{name:'Salvar orçamento'}).click();
 const panel=page.getByRole('region',{name:'Financeiro da reserva'});await expect(panel).toBeVisible();
 const amount=await panel.locator('.document-meta > div').filter({has:page.getByText('Cobrado',{exact:true})}).locator('strong').innerText();
 async function entry(kind:string,value:string,note:string){await panel.getByLabel('Tipo de lançamento').selectOption(kind);await panel.getByLabel('Valor (R$)').fill(value);await panel.getByLabel('Descrição / motivo').fill(note);await panel.getByRole('button',{name:'Registrar lançamento',exact:true}).click();await expect(panel.getByRole('cell',{name:note,exact:true})).toBeVisible();}
 await entry('payment',amount.replace(/[^\d,]/g,'').replace(',','.'),'Pagamento conferido');await entry('deposit_received','50','Caução recebida de exemplo');
 await page.getByRole('button',{name:'Confirmar reserva'}).click();await page.getByRole('button',{name:'Marcar como separada'}).click();await page.getByRole('button',{name:'Registrar entrega'}).click();await page.getByLabel('Recebido — Cadeira Tiffany branca',{exact:true}).fill('1');await page.getByRole('button',{name:'Registrar devolução',exact:true}).click();
 await page.getByRole('button',{name:'Encerrar reserva'}).click();await expect(page.getByRole('alert').filter({hasText:/caução/i})).toBeVisible();
 await entry('deposit_refund','50','Caução devolvida de exemplo');await page.getByRole('button',{name:'Encerrar reserva'}).click();await expect(page.locator('.rental-document').getByText('Encerrada',{exact:true})).toBeVisible();await expect(panel.getByLabel('Valor (R$)')).toHaveCount(0);
 await page.getByLabel('Motivo da reabertura').fill('Conferência solicitada pelo cliente');await page.getByRole('button',{name:'Reabrir reserva',exact:true}).click();await expect(page.getByText(/Conferência solicitada pelo cliente/)).toBeVisible();
});
