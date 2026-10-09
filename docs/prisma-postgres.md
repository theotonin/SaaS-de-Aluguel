# Conectar o Tonin Loca ao Prisma Postgres

Este projeto usa **PostgreSQL hospedado pela Prisma**, com o driver `pg`. Prisma ORM não é necessário para conectar esse provedor. As migrations SQL são a fonte da estrutura, inclusive funções de autenticação e políticas RLS; não execute `prisma db push` sobre este banco.

## 1. Configurar as conexões

No Prisma Console, abra o banco exclusivo deste produto, entre em **Connect to your database** e copie as URLs **pooled** e **direct** no formato `postgres://` ou `postgresql://`. Se o painel mostrar `prisma+postgres://`, obtenha as URLs TCP; aquela URL é do Accelerate e não funciona no driver `pg`.

Copie `.env.example` para `.env`, que está ignorado pelo Git. Preencha:

| Variável | Conteúdo |
| --- | --- |
| `DATABASE_PROVIDER` | `prisma` |
| `DATABASE_URL` | URL **pooled**, usada pela API |
| `DIRECT_URL` | URL **direct**, usada somente em migrations e bootstrap |
| `DB_POOL_SIZE` | `3`, ajustável entre 1 e 20 por processo |
| `APP_ORIGIN` | `http://localhost:5173` local ou a origem HTTPS definitiva |
| `ADMIN_NAME` | Nome do primeiro superadmin |
| `ADMIN_EMAIL` | Seu e-mail administrativo |
| `ADMIN_PASSWORD` | Senha exclusiva, de 12 a 128 caracteres |

Mantenha `sslmode=require` nas URLs Prisma. O adaptador eleva esse modo para `verify-full`, exigindo certificado e hostname válidos. Não desative a validação TLS. Nenhuma credencial deve usar prefixo `VITE_`, pois ele expõe valores no navegador.

O padrão `DATABASE_PROVIDER=postgres` continua disponível para PostgreSQL convencional: a API deve conectar diretamente como `loca_runtime`, sem privilégios administrativos. `DATABASE_ADMIN_URL` permanece como alternativa legada para `DIRECT_URL`.

## 2. Criar estrutura e superadmin

Com Node 24+, na raiz do projeto:

```sh
npm ci
npm run db:migrate
npm run admin:create
npm run db:check
```

As migrations criam tabelas, índices, relacionamentos, funções de autenticação/superadmin e RLS. O histórico registra versões e checksums; execuções concorrentes usam bloqueio transacional. Uma falha reverte a transação. Não edite migrations aplicadas: acrescente uma nova migration ao manifesto de `packages/database/migrate.ts`. A primeira versão sem checksum é atualizada sem apagar dados.

O banco precisa permitir a criação de `loca_runtime` e a troca para esse papel. Se o provedor não oferecer essas permissões, a instalação falha; não há fallback que desative RLS. O diagnóstico confirma o papel efetivo e RLS, sem imprimir URLs, senhas ou hashes.

`admin:create` não cria dados fictícios nem senhas padrão. Reexecutar com o mesmo superadmin ativo preserva sua senha. E-mail já usado por conta de empresa é recusado. Remova `ADMIN_PASSWORD` do ambiente após a criação. Para trocar uma senha, não use novamente esse bootstrap: recuperação/troca de senha ainda precisa de módulo próprio.

## 3. Usar a aplicação real

```sh
npm run dev:api
```

Em outro terminal:

```sh
npm run dev
```

Entre com o superadmin criado. Em **Empresas**, cadastre a locadora e seu administrador inicial, plano e limites. O superadmin também pode alterar identidade/cor, suspender/reativar a empresa e consultar auditoria administrativa. O administrador da empresa cadastra equipe com papéis de administrador, atendente e operador. Superadmin não recebe acesso aos dados operacionais das locadoras.

| Estrutura persistente | Finalidade |
| --- | --- |
| `organizations` | Empresas, identidade, status, plano e limites |
| `users`, `sessions` | Papéis, hashes scrypt, sessões e proteção CSRF |
| `customers`, `items` | Clientes e materiais por empresa |
| `rentals`, `rental_lines` | Orçamentos/reservas, períodos e preços congelados |
| `idempotency` | Evitar duplicação em reenvios de operações |
| `audit_log` | Registro de ações administrativas e operacionais |
| `schema_migrations` | Evolução versionada do banco |

## 4. Publicar na Vercel com banco

Use **um projeto separado da demo**. A demo divulgada no site Tonin pode continuar sem banco.

No projeto real, configure Node 24.x, raiz vazia, saída `dist/web` e Build Command **`npm run build`**. Remova qualquer override antigo `npm run build:demo` do painel. Cadastre no ambiente de **Production**:

```text
DATABASE_PROVIDER=prisma
DATABASE_URL=<URL pooled privada>
DB_POOL_SIZE=3
APP_ORIGIN=https://seu-dominio-definitivo
NODE_ENV=production
```

A raiz sempre gera o frontend comercial, independentemente de `VITE_DEMO`. A demo agora está em `demo/`, com instalação e configuração Vercel próprias, sem API nem banco; veja [o guia da demo](../demo/README.md). `TONIN_DEPLOYMENT` não é mais necessário. A função comercial `api/[...path].ts` atende `/api/*` na mesma origem e reutiliza um pool por instância. Não precisa de servidor Express separado. Rotas do painel usam navegação interna; não há URLs de páginas adicionais que exijam fallback SPA.

Execute migrations e bootstrap **antes** de liberar o acesso, usando `DIRECT_URL` apenas no seu ambiente administrativo local ou em job de release protegido. Não configure `DIRECT_URL`, `ADMIN_PASSWORD` ou bootstrap no frontend, no build público ou em requisições. Não há migrations automáticas no startup.

Na Vercel, o adaptador trata corpos JSON já processados pelo runtime e usa somente o header de IP substituído pela plataforma. Fora da Vercel, headers enviados pelo visitante continuam ignorados, exceto quando `TRUST_PROXY_ADDRESS` identifica seu proxy controlado. O limite de login atual é por instância: antes de escala com várias instâncias, configure proteção centralizada na borda ou substitua o contador por um armazenamento compartilhado.

Depois do deploy, `/api/health` deve responder `{"status":"ok"}`. Teste login, criação de uma empresa e acesso do administrador da locadora. Preview com outro domínio precisa de `APP_ORIGIN` próprio e banco de homologação; não compartilhe credenciais de produção com previews não confiáveis.

## 5. Servidor Node convencional

`npm start` inicia a API. `tsx` é dependência de execução, inclusive em instalações com `--omit=dev`. Defina `HOST=0.0.0.0` apenas se a plataforma precisar expor a porta; o padrão é `127.0.0.1`. Sirva `dist/web` por HTTPS e encaminhe `/api` para a API na mesma origem. Configure `APP_ORIGIN`, `NODE_ENV=production` e um proxy que substitua `X-Forwarded-For` por um único IP válido.

## Segurança e validação pendente

No modo Prisma, **cada consulta** da aplicação executa em transação com `SET LOCAL ROLE loca_runtime`; dados de empresa usam `set_config(...,true)` na mesma transação. Ambos são locais à transação, compatíveis com pooling. A API recusa um papel efetivo administrativo, herdado ou proprietário das tabelas.

Se a credencial Prisma autenticar como proprietário/superusuário, ela continua privilegiada no servidor. A troca de papel protege as consultas normais e evita vazamentos acidentais entre empresas; **não é uma barreira contra SQL arbitrário ou um processo comprometido que possa executar RESET ROLE**. Para uma fronteira de privilégio no próprio acesso, utilize uma credencial realmente restrita, quando suportada pelo provedor, com `DATABASE_PROVIDER=postgres`. Nunca entregue uma credencial de banco ao navegador.

Os testes embarcados verificam SQL, RLS, rollback, migrations, bootstrap e fluxo HTTP. `npm run test:postgres` valida também conexões TCP independentes e confirmação concorrente, exigindo `TEST_DATABASE_ADMIN_URL` para banco vazio e descartável. O teste recusa banco que já tenha a tabela `organizations`; não aponte para clientes reais. A pipeline usa um PostgreSQL temporário exclusivo.

Sem suas URLs privadas, a conexão com **sua instância Prisma** e a implantação HTTPS não podem ser comprovadas. Após configurá-las, execute `db:migrate`, `admin:create`, `db:check` e os testes de acesso acima. Devoluções, financeiro, recuperação de senha e assinatura comercial continuam nas próximas entregas do produto.

Referência: [conexões oficiais do Prisma Postgres](https://www.prisma.io/docs/postgres/database/connecting-to-your-database), [runtime Node da Vercel](https://vercel.com/docs/functions/runtimes/node-js), [headers de IP da Vercel](https://vercel.com/docs/headers/request-headers).
