# Tonin Loca — desenho do produto

Data: 08/10/2026. Ideia aprovada; desenho técnico e operacional preparado para revisão.

## Público e resultado

Pequenas locadoras de materiais para festas: mesas, cadeiras, decoração, tendas e brinquedos. Organizar o caminho entre orçamento, reserva, separação, entrega e devolução. Primeira versão para uma locadora piloto, com fundação multiempresa verificada antes de operação comercial.

## Padrão Tonin

Manrope local; fundo #151918; superfície #1e2421; superfície elevada #28302b; texto #f2f5f0; apoio #b8c2ba; divisória #3b453e; destaque #acd5bd. Controles com pelo menos 48px e raio 6px; painéis com raio 12px; espaçamentos 8, 12, 16, 24 e 32px. Navegação lateral no computador e adaptada ao celular. Interface em português, moeda BRL e datas apresentadas em America/Sao_Paulo.

Superadmin configura nome, logo e destaque de cada empresa. Administradores empresariais não alteram identidade visual, planos ou limites comerciais.

## Arquitetura e isolamento

Repositório exclusivo do produto, sem copiar projetos existentes. Frontend React/TypeScript, API Node/TypeScript e PostgreSQL com migrations versionadas. Organização em apps/web, apps/api, packages/contracts e packages/database. Conferir versões e ferramentas disponíveis antes de fixar dependências.

Sessões opacas em cookies HttpOnly, Secure em produção, com proteção CSRF nas mutações e revogação no logout. Login limitado contra abuso. Contexto da empresa derivado da sessão e vínculo ativo, nunca confiado a um organizationId do navegador. Consultas explicitamente escopadas e RLS no banco com papel runtime restrito. Superadmin usa operações administrativas explícitas e auditadas, sem acesso automático aos dados operacionais dos clientes.

Provisionamento do superadmin por comando protegido, sem senha padrão ou cadastro público privilegiado. Arquivos persistentes com acesso autorizado e nomes próprios por empresa; validar tamanho e tipo. Nenhum segredo ou dado real em fixtures ou Git.

## Permissões

- Superadmin: provisionar empresas; gerenciar planos, assinatura manual, limites, trial, suspensão e identidade visual; consultar auditoria administrativa.
- Administrador da empresa: equipe, catálogo, locações, valores, relatórios e configurações operacionais.
- Atendente: clientes, orçamentos e reservas; sem gestão de permissões.
- Operador: separação, entrega, retirada e conferência; sem alterações financeiras.

Suspensão bloqueia novas operações, preservando dados. Planos e limites são configurados pelo superadmin; preços comerciais não são inventados. Pagamentos de assinatura serão registrados manualmente no piloto, sem simular gateway.

## Catálogo e disponibilidade

Itens possuem nome, categoria, descrição, fotos, quantidade total ativa e preço de referência por diária. Unidades com avaria ou manutenção ficam indisponíveis. Kits agrupam itens com quantidades; reservar um kit reserva seus componentes, impedindo dupla contagem.

Períodos são intervalos [retirada, retorno previsto), armazenados como instantes e exibidos no fuso da empresa. Retirada deve anteceder retorno. Reservas confirmadas, separadas e entregues comprometem disponibilidade; rascunhos e canceladas não. Reservas que terminam exatamente quando outra começa não conflitam; tempo de limpeza/transporte deve ser incluído no período operacional informado.

Quantidade disponível é calculada pelo pico de ocupação simultânea durante o período solicitado. Confirmar e alterar uma reserva dentro de transação com bloqueio dos itens envolvidos, em ordem estável, evita duas confirmações concorrentes acima da capacidade. Falha de disponibilidade retorna os itens e quantidades conflitantes, sem salvar parcialmente. Equipamentos entregues com retorno vencido continuam indisponíveis até a devolução; reservas futuras afetadas aparecem como pendências para intervenção.

## Fluxo comercial

Cliente com nome e contato; endereço obrigatório para entrega. Orçamento tem período, itens, quantidades, preço por diária, número de diárias, transporte e desconto. Diárias são calculadas por teto da duração em horas/24, com mínimo de uma. Valores em centavos; desconto não pode exceder subtotal mais transporte. Preços e descrições são fotografados no orçamento, preservando o histórico após alteração do catálogo.

Estados: rascunho → orçamento enviado → confirmado → separado → entregue → devolvido → encerrado. Cancelamento permitido antes da entrega, com registro de motivo e tratamento manual de valores recebidos. Não transformar locação entregue em cancelada. Cada transição exige permissão e validação no servidor.

A aprovação comercial do orçamento não garante disponibilidade: confirmar a reserva exige nova checagem transacional. Primeira versão registra a confirmação pelo atendente. Documentos imprimíveis trazem itens, período, totais e condições configuradas pela empresa, sem promessa de assinatura eletrônica integrada.

## Operação e devolução

Agenda com retiradas, entregas e retornos; endereço, responsável e checklist. Devoluções podem ser parciais: registrar quantidades boas, avariadas e faltantes, com fotos opcionais. Só as quantidades boas voltam imediatamente ao disponível. Avarias vão para manutenção; faltantes continuam pendentes. Registrar resolução do faltante como devolução ou baixa definitiva auditada. Ajustes na capacidade não podem ocultar reservas afetadas.

Encerrar exige reconciliação de todos os itens e pendências financeiras resolvidas ou dispensadas pelo administrador com motivo. Repetir uma requisição de confirmação, devolução ou recebimento com a mesma chave não duplica efeitos.

## Financeiro operacional

Registrar sinal, recebimentos, estornos manuais, caução e despesas por locação. Caução é saldo separado da receita, com devolução ou retenção registrada e justificada. Recebimentos registram data, forma e responsável; o sistema não processa PIX ou cartão. Avarias e atrasos geram cobranças somente mediante lançamento explícito autorizado, nunca débito automático. Relatórios distinguem valor contratado, recebido, despesas e saldo pendente; não prometer contabilidade ou emissão fiscal.

## Catálogo público

Página por empresa com marca, fotos, categorias e formulário de solicitação de orçamento. Não expor contatos de outros clientes, financeiro ou agenda detalhada. Solicitação não cria reserva confirmada. Limitar abuso; tokens públicos não sequenciais e revogáveis para consultar propostas, sem permitir acesso à área interna.

## Entregas incrementais

1. Fundação: estrutura, banco, autenticação, isolamento, permissões, superadmin e aplicação da identidade Tonin.
2. Núcleo vendável: clientes, catálogo, orçamento, disponibilidade concorrente e confirmação de reservas.
3. Operação: separação, agenda, entrega, devolução parcial, avarias e pendências.
4. Financeiro e catálogo público: recebimentos, caução, despesas, relatórios, solicitações e impressão.
5. Piloto: publicação, migrações, backup/restauração, testes completos e roteiro de treinamento.

Cada entrega terá plano próprio e commits por mudança coerente verificada. Push depende do repositório fornecido e acesso autenticado. Produção depende do ambiente contratado; não confundir demo com aplicação conectada ao banco.

## Verificação obrigatória

Testes de domínio para períodos, cálculo de diárias, kits e valores. Integração PostgreSQL para empresa A/B, RLS, permissões, reserva concorrente, rollback e idempotência. Navegação para fluxo orçamento→reserva→entrega→devolução, retorno parcial, caução e sessão expirada. Verificação visual em 390px e 1440px, teclado, contraste e erros de formulário. Publicação exige HTTPS, arquivos persistentes, migrações e restauração de backup verificadas.

## Fora da primeira versão

Emissão fiscal, assinatura eletrônica integrada, automação de WhatsApp, gateway de pagamento, rastreamento GPS e aplicativo nativo. Catálogo público é solicitação de orçamento, sem checkout. Integrações serão incrementos separados após validação do piloto.
