# Tonin Loca — plano de implementação inicial

> Execução nesta sessão pela skill executing-plans, com testes antes das regras e revisão ao final.

**Objetivo:** entregar base executável com autenticação, superadmin, isolamento, catálogo, clientes, orçamentos e reservas.
**Arquitetura:** React/TypeScript e API Node com contratos Zod; PostgreSQL e RLS, transações com contexto e bloqueios por item.
**Spec:** ../specs/2026-10-08-tonin-loca-design.md

## Restrições globais

Node >=24; interface em português, BRL, America/Sao_Paulo. Cores e fonte do DESIGN.md. Empresa determinada pela sessão; papel runtime sem BYPASSRLS. Sem credenciais padrão, dados reais ou pagamentos simulados. Commits por incremento validado.

## Estrutura

- packages/contracts: validação de entradas.
- packages/domain: períodos, disponibilidade, diárias e transições.
- packages/database: migrations, adaptador pg e transações por empresa.
- apps/api: autenticação, permissões e rotas operacionais/administrativas.
- apps/web: shell, telas de operação e superadmin.
- scripts: migration e provisionamento explícito de administrador.
- tests: domínio, SQL real via PostgreSQL embarcado e API HTTP.

## 1. Domínio e contratos

- [ ] Criar tests/domain.test.ts cobrindo dois períodos adjacentes, pico de ocupação, atraso, diárias, valores e transições inválidas.
- [ ] Executar `npm test`; confirmar falha por implementação ausente.
- [ ] Implementar packages/domain/rental.ts e packages/contracts/index.ts. Exportar rentalDays(start,end), availableQuantity(total,start,end,reservations,now), calculateTotal(lines,days,delivery,discount) e assertTransition(from,to).
- [ ] Executar `npm test` e `npm run typecheck`; commit `feat: add validated rental domain`.

## 2. Banco e isolamento

- [ ] Criar tests/database.test.ts usando PGlite para executar migrations reais, testar role runtime, RLS, constraints, rollback e separação A/B.
- [ ] Executar testes e confirmar falha por migration ausente.
- [ ] Implementar schema.sql, adaptador e scripts de migration/provisionamento. Contexto em set_config local à transação; política compara organization_id e contexto autenticado. Locks de confirmação seguem IDs ordenados.
- [ ] Executar testes e typecheck; commit `feat: add PostgreSQL tenant isolation and persistence`.

## 3. API real

- [ ] Criar tests/api.test.ts com servidor HTTP e banco SQL, login, CSRF, sessão expirada, privilégios, empresa suspensa, cadastro e reserva com capacidade esgotada.
- [ ] Executar testes; confirmar falha por rotas ausentes.
- [ ] Implementar sessão opaca, hash scrypt, limitador de login, políticas de acesso, superadmin, clientes, itens e orçamento/reserva. Mutação aceita chave idempotente; confirmação e alterações dentro de transação.
- [ ] Executar testes; commit `feat: add authenticated superadmin and rental API`.

## 4. Interface Tonin

- [ ] Criar testes de navegação em tests/browser com API real: login, empresa, cliente, item, orçamento e confirmação.
- [ ] Executar e confirmar ausência das telas.
- [ ] Implementar shell, login, painel, catálogo, clientes, reservas e superadmin. Valores vazios e erro de rede têm mensagens; nenhuma senha é salva no navegador.
- [ ] Compilar e executar navegação; inspecionar 390/1440px em uma rodada, corrigir achados e confirmar.
- [ ] Commit `feat: add Tonin rental management interface`.

## 5. Entrega

- [ ] Documentar execução, variáveis, bootstrap, limites implementados e pendências de produção.
- [ ] Executar testes, typecheck e build. Não declarar concorrência validada em PostgreSQL multi-conexão se somente PGlite estiver disponível.
- [ ] Revisar diff, segredos e estado; commit documentação e enviar branch ao repositório fornecido.

## Próximos incrementos

Kits, fotos persistentes, devolução parcial, caução, despesas e catálogo público têm planos próprios após esta fundação. Não expor controles que prometem funções ainda não implementadas.

## Estado da execução em 08/10/2026

Itens 1–4 implementados e verificados. A navegação do item 4 foi executada na demonstração local; autenticação e permissões reais foram verificadas no teste HTTP com PGlite. A distinção entre esses ambientes está documentada, sem afirmar navegação com PostgreSQL externo. Item 5 finaliza documentação, commits e envio ao repositório. Revisão independente registrada em `docs/verification.md`.
