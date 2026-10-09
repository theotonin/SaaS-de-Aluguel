# Verificação do primeiro incremento

08/10/2026. Escopo: fundação, catálogo/clientes/equipe, orçamento, disponibilidade, confirmação, separação e entrega; demo Vercel e apresentação no site Tonin.

## Evidências

- Testes de domínio: intervalos adjacentes, pico de ocupação, equipamento entregue com atraso, diárias, centavos, descontos e transições.
- SQL PostgreSQL em PGlite: schema executado; role runtime sem leitura direta de usuários; RLS A/B; rejeição de escrita cruzada e FK de empresa diferente; contexto descartado no rollback; runtime sem permissão de alterar schema.
- HTTP: login, CSRF, superadmin, empresas, ausência de acesso operacional pelo superadmin, clientes, itens, orçamento idempotente, confirmação, falta de capacidade, redução bloqueada de acervo, equipe, perfis, suspensão e logout.
- Demo: persistência local, recuperação de armazenamento inválido, capacidade e separação dos dados das empresas.
- Branding: destaque derivado com contraste mínimo para superfícies escuras e texto dos botões.
- Interface: captura de painel, materiais, orçamento e superadmin em 390px e 1440px, sem overflow de página ou erro JavaScript nessa rodada.
- Navegação da demo: três roteiros passaram, cobrindo cadastro de cliente/material, orçamento e confirmação com persistência após reload, recuperação por cancelamento após conflito de capacidade, superadmin e formulário no celular.

Resultado do primeiro incremento: 14 testes de domínio/SQL/HTTP/demo/branding e três roteiros de navegador aprovados. Os builds real e de demonstração são verificações separadas. No site Tonin, 25 testes e 20 roteiros selecionados de navegador passaram, incluindo acessibilidade, responsividade, diagrama com quatro produtos e o link exato da nova demo.

## Revisão independente

Revisor inspecionou API, schema, RLS, contratos e demo. Encontrou e confirmou a correção de três questões: entrega fora do período, identificação de IP atrás do proxy e entrega sem endereço. Correções têm testes de guarda e integração para endereço. A execução de HTTP pelo revisor foi impedida pelo sandbox; a suíte principal foi executada com autorização para o servidor temporário.

As telas foram separadas em arquivos próprios para manter navegação e operações organizadas. A demo usa o mesmo domínio e contratos de validação; ela não substitui autenticação, autorização ou banco de produção.

## Limites da evidência

Não houve publicação na Vercel ou implantação comercial. A publicação da demo será feita pelo usuário no endereço fornecido. Não houve ensaio de concorrência PostgreSQL com múltiplas conexões, HTTPS real, arquivos persistentes ou backup/restauração em servidor externo. Devoluções/financeiro/kits/fotos/catalogo público estão fora deste incremento, e isso aparece na documentação e no escopo comercial do site.
