# Prisma Postgres — implementação autorizada

Objetivo: conectar o Tonin Loca ao PostgreSQL hospedado pela Prisma, preservando demo, autenticação, superadmin, empresas, limites e isolamento.

1. Validar URLs PostgreSQL TCP, separar aplicação pooled e administração direct, oferecer modo Prisma explícito. Não exigir Prisma ORM: o provedor aceita o driver pg existente.
2. Executar todas as consultas de aplicação com `SET LOCAL ROLE loca_runtime` dentro de transações no modo Prisma. Nunca manter estado de sessão no pooler. Manter conexão runtime restrita como padrão para PostgreSQL convencional. Documentar que a credencial Prisma administrativa permanece privilegiada e que a troca de papel protege o código da aplicação, mas não um processo comprometido.
3. Evoluir migrations com histórico/checksums e bloqueio, validar papel e permissões. Bootstrap superadmin repetível sem sobrescrever contas. Diagnóstico sem imprimir credenciais.
4. Preparar backend para execução persistente e Vercel com API real na mesma origem; manter publicação demo padrão separada. Sem migrations durante requisições ou build.
5. Testar configuração, troca de papel/transações/RLS, migrations e bootstrap, além dos testes existentes de API e superadmin. Revisar, registrar limitações e publicar commits por etapa.

Validação externa depende das URLs privadas do usuário. Não criar banco temporário em conta externa, inventar credenciais ou afirmar conexão real sem executá-la.
