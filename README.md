# Tonin Loca

Gestão de locação de materiais para festas e eventos, com a identidade visual Tonin. Primeiro incremento funcional; a versão comercial ainda depende das etapas descritas abaixo.

## Publicar a demonstração na Vercel

Importe **theotonin/SaaS-de-Aluguel**. Os primeiros commits estão na branch **codex/tonin-loca**; selecione essa branch como Production Branch se o painel escolher outra.

| Configuração | Valor |
| --- | --- |
| Root Directory | **`demo`** |
| Framework | Vite |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | **`dist`** |
| Node | 24.x |

A pasta [`demo`](demo/README.md) é independente: tem instalação própria, apenas arquivos de frontend e nenhuma API ou banco. O `demo/vercel.json` já declara o build e a saída. A raiz do repositório é exclusivamente a versão comercial. Não adicione credenciais de banco ou senhas à demo. O endereço escolhido para divulgação é **https://saas-de-locacao-demo-static.vercel.app/**; o domínio só responderá após você configurar/publicar o projeto na Vercel. Este repositório não contrata nem configura domínio automaticamente.

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
npm ci --prefix demo
npm run dev:demo
```

Para gerar o mesmo artefato da Vercel:

```sh
npm run build:demo
```

## Executar a aplicação conectada ao banco

Requer Node 24+ e PostgreSQL. `npm run dev` e `npm run build` produzem o frontend real, que solicita login; não são a demo.

O projeto está preparado para **Prisma Postgres**, usando URL pooled na API e URL direct nas migrations. Siga o guia completo em [docs/prisma-postgres.md](docs/prisma-postgres.md), que explica conexão, criação do superadmin e publicação real na Vercel.

```sh
# Após copiar .env.example para .env e preencher suas URLs e dados administrativos:
npm ci
npm run db:migrate
npm run admin:create
npm run db:check
npm run dev:api
# Em outro terminal:
npm run dev
```

Para a versão comercial na Vercel, deixe Root Directory vazio, use `npm run build` e saída `dist/web`. Ela sempre gera o frontend real com `/api/*`; a demo é publicada separadamente com Root Directory `demo`. Configure `DATABASE_PROVIDER=prisma`, `DATABASE_URL` pooled, `APP_ORIGIN` HTTPS e `DB_POOL_SIZE`. Credenciais administrativas são usadas somente em migrations/bootstrap, fora do build e da aplicação pública.

O superadmin real cadastra empresas e seus administradores, planos, limites, identidade e suspensão. Cada locadora trabalha com seus próprios clientes, materiais, reservas e equipe. Não há senha padrão ou dados de demonstração no banco real.

No modo Prisma, a aplicação assume `loca_runtime` por transação. Se a URL do provedor usar uma credencial administrativa, ela continua privilegiada no servidor: esse modo não substitui uma credencial de banco realmente restrita contra SQL arbitrário/processo comprometido. A configuração convencional com login restrito continua disponível. Veja os detalhes no guia.

## Estrutura

```text
demo                      projeto estático independente, pronto para Vercel
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
npm ci --prefix demo
npm run demo:check
npm run typecheck
npm test
npm run build
npm run build:demo
npx playwright install chromium
npm run test:browser
```

Os testes SQL executam o schema PostgreSQL real em **PGlite** e os testes HTTP usam um servidor temporário com esse banco embarcado. Isso valida SQL, constraints, isolamento, rollback e fluxo HTTP; **não comprova concorrência entre conexões independentes em PostgreSQL de produção**. O teste adicional `npm run test:postgres` usa PostgreSQL TCP descartável para confirmar isolamento e disputa de capacidade entre conexões independentes. Antes de liberar clientes reais, validar a instância Prisma configurada, restauração de backup e implantação HTTPS. A revisão independente do primeiro incremento está em `docs/verification.md`.

Em ambiente com navegador instalado, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` pode indicar o executável. Com a demo aberta, `node scripts/capture.mjs` captura quatro telas em 390/1440px; resultados ficam em `.local/screens`, fora do Git.

## Próximas entregas e limites

Devolução parcial, avarias, kits, fotos e armazenamento persistente, caução, recebimentos, despesas, catálogo público e relatórios financeiros continuam pendentes. Também são necessários ciclo de recuperação/troca de senha, desativação da equipe e assinatura/trial com histórico antes da operação comercial completa. O cadastro atual de plano e suspensão é administrativo; não processa cobranças.

As listas operacionais retornam até 2.000 registros; a paginação deverá preceder o crescimento além do piloto. Não há edição de período de reserva confirmada nesta entrega. Impressão não é contrato com assinatura eletrônica nem documento fiscal. Não há emissão fiscal, pagamento, envio de mensagens ou integração externa simulada.

A interface da demo é sincronizada da versão comercial por `npm run demo:sync`; `npm run demo:check` verifica igualdade das telas, estilos, fontes e regras. A única substituição é o adaptador local de dados. Não edite manualmente as cópias em `demo/apps` e `demo/packages`.
