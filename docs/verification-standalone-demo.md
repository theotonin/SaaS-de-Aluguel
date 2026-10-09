# Verificação da demo independente

- `demo/` tem manifesto, lockfile, TypeScript, Vite e Vercel próprios. Não inclui API, pacote de banco, pg ou tsx.
- `npm ci --prefix demo` passou usando as dependências declaradas pela própria demo.
- Build comercial e build da demo passaram. A raiz fixa modo comercial e a demo fixa modo demonstração, independentemente de flags VITE_DEMO.
- A pasta inteira foi copiada para `/tmp/tonin-demo-export`, fora da árvore do projeto. O build dessa cópia passou, inclusive com `VITE_DEMO=false`, comprovando que não depende de arquivos acima da pasta e continua sendo demo.
- `npm run demo:check` passou: interface, fontes, estilos e regras são idênticos à fonte comercial, exceto pelo adaptador local de dados.
- 25 testes de backend/contratos/demo passaram.
- 3 testes de navegador passaram na nova pasta demo: cadastro → orçamento → confirmação → persistência após reload; conflito de disponibilidade; superadmin em tela móvel. O primeiro cenário também confirmou zero requisições para `/api/*`.
- A revisão independente não encontrou bloqueios concretos na separação.

Publicação remota não foi executada. Para a Vercel, selecione **Root Directory `demo`**, Build `npm run build`, Output `dist` e Node 24.x. Não é preciso configurar banco ou variáveis de ambiente. A versão comercial permanece na raiz com saída `dist/web`.
