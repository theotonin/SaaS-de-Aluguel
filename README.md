# Tonin Loca

Gestão de locação de materiais para festas e eventos, com a identidade visual Tonin. Primeiro incremento funcional; a versão comercial ainda depende das etapas descritas abaixo.

## Publicar a demonstração na Vercel

Importe **theotonin/SaaS-de-Aluguel**. Os primeiros commits estão na branch **codex/tonin-loca**; selecione essa branch como Production Branch se o painel escolher outra.

| Configuração | Valor |
| --- | --- |
| Root Directory | raiz do repositório, deixar vazio |
| Framework | Vite |
| Install Command | `npm ci` |
| Build Command | `npm run build:demo` |
| Output Directory | `dist/web` |
| Node | 24.x |

O `vercel.json` já declara o build e a saída. Não adicione credenciais de banco ou senhas à demo. O endereço escolhido para divulgação é **https://saas-de-locacao-demo-static.vercel.app/**; o domínio só responderá após você configurar/publicar o projeto na Vercel. Este repositório não contrata nem configura domínio automaticamente.

A demo abre diretamente na locadora fictícia **Celebra Locações**. O seletor superior permite explorar locadora, operador e superadmin. É uma simulação identificada, sem login real, API ou banco. Os dados ficam no navegador; não use informações reais. “Restaurar exemplos” apaga apenas as alterações deste produto nesse navegador. Dados de empresas criadas na demo ficam separados no estado local. Essa simulação não é um controle de segurança.

## O que já funciona

- Painel, agenda de saídas/retornos previstos e filtros de reservas.
- Cadastro de clientes e endereços; materiais, categorias, quantidades e diárias.
- Orçamento com vários materiais, período, transporte, desconto, observações e impressão.
- Disponibilidade pelo pico de ocupação simultânea; confirmação transacional com bloqueio dos materiais.
- Etapas de orçamento, confirmação, separação, entrega e cancelamento antes da saída.
- Distinção entre retirada pelo cliente e entrega pela locadora, com endereço obrigatório para entrega.
- Superadmin: empresas, administrador inicial, identidade por nome/cor, planos, limites, suspensão e auditoria administrativa.
- Equipe com administrador, atendente e operador; criação de acessos sem senhas padrão.
- API real com PostgreSQL, sessões opacas, cookies HttpOnly, proteção CSRF, hash scrypt e contexto por empresa/RLS.

Entregas físicas fora do período reservado são bloqueadas. Na primeira versão, corrija isso cancelando antes da saída e criando uma nova proposta com o período correto. Materiais entregues cujo retorno previsto venceu seguem ocupando capacidade até o futuro módulo de devolução; não há botão de devolução fictício.

## Executar a demo local

```sh
npm ci
npm run dev:demo
```

Para gerar o mesmo artefato da Vercel:

```sh
npm run build:demo
```

## Executar a aplicação conectada ao banco

Requer Node 24+ e PostgreSQL. `npm run dev` e `npm run build` produzem o frontend real, que solicita login; não são a demo.

1. Copie `.env.example` para `.env` e preencha credenciais próprias. Não envie esse arquivo ao Git.
2. Prepare um banco exclusivo do produto e uma conexão administrativa para migrations. O script inicial precisa poder criar o papel `loca_runtime`; em provedor gerenciado, prepare esse papel previamente se a conta não tiver CREATEROLE.
3. Execute `npm run db:migrate` com `DATABASE_ADMIN_URL`. Migrations têm registro e bloqueio para evitar execução simultânea.
4. Configure uma senha exclusiva e LOGIN para `loca_runtime` no ambiente do banco; preencha `DATABASE_URL` com esse acesso. Nunca utilize o proprietário ou superusuário na API. O startup recusa role diferente, BYPASSRLS e proteção RLS ausente.
5. Defina `ADMIN_EMAIL` e `ADMIN_PASSWORD` exclusivos, execute `npm run admin:create` e remova a senha do ambiente depois. Não há usuário ou senha padrão.
6. Execute `npm run dev:api` e, em outro terminal, `npm run dev`. `APP_ORIGIN` deve corresponder exatamente à origem usada no navegador; por exemplo, `http://localhost:5173`.

Em produção, sirva `dist/web` e encaminhe `/api` para a API na mesma origem. Configure `NODE_ENV=production`, `APP_ORIGIN=https://seu-endereco` e HTTPS. `npm start` executa a API, que escuta em `127.0.0.1:3001`; o proxy fica no mesmo servidor. O processo precisa das dependências de execução e do carregador TypeScript `tsx` instalado. Não execute o build de demo para clientes reais.

Atrás de proxy controlado, configure `TRUST_PROXY_ADDRESS` com o IP exato do proxy. Ele deve **sobrescrever** `X-Forwarded-For` com um único IP do cliente; não reaproveite o header recebido do visitante. Headers encaminhados de outros endereços são ignorados. Sem essa configuração, o limite de login identifica a conexão direta e pode agrupar clientes atrás do proxy.

## Estrutura

```text
apps/api                  HTTP, autenticação e operações de locação
apps/web/src/screens      telas separadas por responsabilidade
apps/web/src/demo         simulação local exclusiva da demo
packages/contracts        validação compartilhada
packages/domain           períodos, capacidade, valores e transições
packages/database         schema inicial, RLS e transações PostgreSQL
scripts                   migrations, bootstrap e capturas visuais
tests                     domínio, SQL, API e navegação
docs/superpowers          especificação e plano
```

## Verificação

```sh
npm run typecheck
npm test
npm run build
npm run build:demo
npx playwright install chromium
npm run test:browser
```

Os testes SQL executam o schema PostgreSQL real em **PGlite** e os testes HTTP usam um servidor temporário com esse banco embarcado. Isso valida SQL, constraints, isolamento, rollback e fluxo HTTP; **não comprova concorrência entre conexões independentes em PostgreSQL de produção**. Antes de liberar clientes reais, testar confirmações concorrentes com o papel runtime em PostgreSQL externo, restauração de backup e implantação HTTPS. A revisão independente do primeiro incremento está em `docs/verification.md`.

Em ambiente com navegador instalado, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` pode indicar o executável. Com a demo aberta, `node scripts/capture.mjs` captura quatro telas em 390/1440px; resultados ficam em `.local/screens`, fora do Git.

## Próximas entregas e limites

Devolução parcial, avarias, kits, fotos e armazenamento persistente, caução, recebimentos, despesas, catálogo público e relatórios financeiros continuam pendentes. Também são necessários ciclo de recuperação/troca de senha, desativação da equipe e assinatura/trial com histórico antes da operação comercial completa. O cadastro atual de plano e suspensão é administrativo; não processa cobranças.

As listas operacionais retornam até 2.000 registros; a paginação deverá preceder o crescimento além do piloto. Não há edição de período de reserva confirmada nesta entrega. Impressão não é contrato com assinatura eletrônica nem documento fiscal. Não há emissão fiscal, pagamento, envio de mensagens ou integração externa simulada.
