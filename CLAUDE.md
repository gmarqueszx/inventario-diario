# Inventário Diário

Sistema web de conferência diária de estoque (empresa de energia solar: placas, inversores, cabos, estrutura etc.).
Operadores contam o estoque físico e comparam com o estoque do ERP (SmartPOS).

## Regra para o Claude

**Ao fim de toda sessão de trabalho neste repositório, atualize este CLAUDE.md** com o que mudou
(arquitetura, decisões, pendências, gotchas). Mantenha-o curto e atual; remova o que deixar de ser verdade.
Comunicação com o usuário em português.

## Stack e deploy

- **Front-end:** um único arquivo `public/index.html` (HTML + CSS + JS puro, sem build, ~1800 linhas).
- **Back-end:** Netlify Functions em `netlify/functions/*.js` (ESM), expostas em `/api/<nome>` (redirect em `netlify.toml`).
- **Banco:** Upstash Redis (`@upstash/redis`), env `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.
- **Deploy:** automático no Netlify a cada push/merge na `main` (repo `gmarqueszx/inventario-diario`).
  O Netlify não publica status de deploy no GitHub, então não dá para confirmar o deploy pelo `gh`.
  Variáveis de ambiente novas só valem a partir do deploy seguinte.
- **Fluxo git:** commit numa branch → PR → merge na `main` → apagar a branch remota.
  A `main` fica em uso pela checkout principal (`C:\Users\conec\João Gabriel Marques\VS Code`), então
  `gh pr merge --delete-branch` falha ao apagar a branch local; apague a remota com `git push origin --delete`
  e dê `git pull --ff-only` na checkout principal depois do merge.
- Mensagens de commit em português, no estilo `feat: ...` / `fix: ...`.

## Funções (`/api/...`)

Todas exigem o header `x-session-token` (sessão no Redis em `session:<token>`, TTL 8h).

| Função | O que faz | Chave Redis |
|---|---|---|
| `auth` | setup do 1º admin, login, logout, `me` | `users`, `session:*` |
| `users` | CRUD de usuários (só admin); papéis `admin` / `operador` | `users` |
| `import` | estoque do ERP importado da planilha, por dia | `import:YYYY-MM-DD` (7 dias) |
| `counts` | contagens do dia | `counts:YYYY-MM-DD` (30 dias) |
| `history` | conferências finalizadas | `history` |
| `priorities` | prioridade por categoria (só admin grava) | `priorities` |
| `shortnames` | nomes curtos do relatório (só admin grava) | `shortnames` |
| `smartpos` | `action=products`: produtos ativos do SmartPOS (cache 15 min); `action=probe`: diagnóstico, só admin | `smartpos:products` |

## Catálogo de produtos

- `CATALOG` fixo no `index.html` (`{codigo, produto, custo, categoria}`), em uma linha de JSON.
- Ao carregar, `mergeSmartposCatalog()` junta os produtos do SmartPOS:
  - produto já existente → só o **custo** é atualizado (nome e categoria locais são mantidos; o usuário renomeou categorias de propósito);
  - produto novo → entra na categoria local mais usada pelos produtos da mesma categoria do SmartPOS;
  - ficam de fora: categorias **EPI** e **Ferramentas** e categorias do SmartPOS sem nenhum produto local.
  - se a API falhar, segue só com o catálogo fixo.
- Por isso, produtos novos normalmente **não** precisam mais ser adicionados à mão no `CATALOG`.
  Se precisar adicionar à mão, acrescente ao fim do array.
- O código do produto (`codigo`) corresponde ao `alphaCode` do SmartPOS.

## SmartPOS API

- Docs: https://smartpos.readme.io/ — base `https://api.smartpos.app/v1`, headers `X-Api-Key-Id` / `X-Api-Key-Secret`
  (env `SMARTPOS_KEY_ID` / `SMARTPOS_KEY_SECRET` no Netlify; nunca expor no front-end).
- **Não há leitura de quantidade em estoque** na API: os produtos só trazem `minimumStock` e `noStock`.
  `/v1/stock` e `/v1/stocks` respondem 403 (talvez exista e não esteja liberado). Por isso o estoque ainda vem
  da planilha importada diariamente (modal de mapeamento de colunas em `index.html`).
- O filtro `alpha-code` de `GET /products` é ignorado pela API; para achar por código, baixe a lista toda (~319 produtos).
- Só fazer GET. Os endpoints `PUT .../stock` alteram o estoque real do ERP.

## Pendências

- Perguntar ao suporte do SmartPOS se existe endpoint para ler saldo de estoque (e se `/v1/stock` precisa ser liberado na chave). Se existir, substituir a importação da planilha.
- Produtos "\*SORTIDO\*" do SmartPOS (ex.: código 99986) entram no catálogo; avaliar se devem ser excluídos.
- Validar no site a correspondência de categorias inferida (aparece no Console: "SmartPOS: X produtos lidos, Y novos...").
