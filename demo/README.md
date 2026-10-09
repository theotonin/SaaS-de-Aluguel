# Tonin Loca — demonstração independente

Esta pasta contém a demonstração completa e pode ser publicada **sozinha**. Ela usa as mesmas telas, estilos, fontes, formulários e regras de locação da versão comercial, com contas e dados fictícios. O seletor superior permite alternar locadora, operador e superadmin.

Clientes, materiais, reservas e empresas criados aqui ficam somente no `localStorage` do navegador. Atualizar a página preserva as alterações; **Restaurar exemplos** repõe os dados fictícios. Não há API, PostgreSQL, autenticação real ou variáveis secretas. Os perfis são uma simulação e não devem receber dados de clientes reais.

## Publicar na Vercel

Importe o repositório `theotonin/SaaS-de-Aluguel` e configure:

| Campo | Valor |
| --- | --- |
| Production Branch | `codex/tonin-loca` |
| Root Directory | **`demo`** |
| Framework | Vite |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | **`dist`** |
| Node | 24.x |
| Environment Variables | Nenhuma |

O arquivo `vercel.json` desta pasta já contém a configuração. Ao mudar um projeto existente, remova overrides antigos de build/output e credenciais de banco. O domínio divulgado pode continuar sendo `saas-de-aluguel-demo.vercel.app`.

Para publicar sem GitHub, copie **esta pasta inteira**, incluindo `package.json`, `package-lock.json`, configs, `apps` e `packages`. Ela não usa arquivos acima de `demo`.

## Executar localmente

Dentro desta pasta:

```sh
npm ci
npm run dev
```

Para gerar arquivos estáticos:

```sh
npm run build
npm run preview
```

## Manter a interface igual à comercial

O código em `apps/web` e `packages` desta pasta é uma cópia sincronizada. Na raiz do repositório, após alterar a interface comercial:

```sh
npm run demo:sync
npm run demo:check
```

O sincronizador copia interface, assets e regras compartilhadas e substitui somente o adaptador de acesso aos dados por uma implementação local. A pipeline recusa diferenças nessas cópias. Edite as telas na fonte comercial e sincronize, evitando alterações manuais nas cópias geradas.

O build desta pasta sempre gera demo, independentemente de `VITE_DEMO`. A raiz do repositório sempre gera a aplicação comercial com API real. A equivalência cobre as funcionalidades já implementadas; a demo não simula módulos comerciais ainda pendentes nem integrações externas.
