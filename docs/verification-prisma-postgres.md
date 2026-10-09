# Verificação — preparação Prisma Postgres

## Evidências locais

- `npm run typecheck`: passou.
- `npm test`: 24 testes passaram, incluindo fluxo HTTP completo de superadmin → empresas → locadoras, CSRF, papéis, suspensão, reservas, RLS e bootstrap.
- `TONIN_DEPLOYMENT=production npm run build:vercel`: frontend real gerado.
- `npm run build:vercel`: demo gerada por padrão.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/google/chrome/chrome npm run test:browser`: 3 cenários passaram.
- Empacotamento da função Node com esbuild: passou.
- `npm run test:postgres` com PostgreSQL **17.5** temporário em localhost: passou. Foram usadas conexões TCP independentes do driver pg; migrations repetidas, criação do superadmin, RLS, reutilização do pool e confirmação concorrente do mesmo material foram verificadas. Exatamente uma confirmação foi aceita para capacidade de uma unidade; a outra retornou conflito. O servidor temporário foi desligado após o teste.
- `git diff --check`: passou.

## Revisão independente

A revisão identificou leitura de JSON e endereçamento do cliente como riscos do adaptador Vercel. Foram corrigidos com suporte ao `req.body` documentado pelo runtime e identificação de IP exclusiva da entrada Vercel, mantendo a política de proxy restrita no servidor convencional. Dois testes novos cobrem esses adaptadores. A revisão posterior não encontrou bloqueios concretos adicionais.

## Limites da evidência

PostgreSQL local não comprova permissões de criação de papéis, SSL ou pooling da conta **Prisma do usuário**. As URLs privadas não foram fornecidas e nenhum banco externo foi provisionado ou alterado. A função foi empacotada e seus adaptadores testados localmente; um deploy autenticado na Vercel ainda não foi executado nesta etapa. CI foi configurada para repetir o teste com PostgreSQL 17, mas seu resultado remoto deve ser conferido no GitHub.

Credencial administrativa do Prisma continua privilegiada mesmo com papel restrito por transação. O limite de login atual continua por instância. Esses pontos e os passos de configuração estão no [guia Prisma](prisma-postgres.md). A entrega prepara a integração persistente e o superadmin existente; não conclui os módulos comerciais pendentes listados no README.
