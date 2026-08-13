# apex-redirect — projeto Pages só para o 301 do apex

`eciaa.com.br` (sem www) redireciona **301** para `https://www.eciaa.com.br` preservando caminho e
query string. Quem faz isso é o `_redirects` deste diretório, publicado como um **projeto Pages
separado** (`eciaa-apex-redirect`), com o apex anexado como domínio customizado.

**Não é o site.** O site é o projeto `eciaa-site`, publicado a partir de `dist/` na raiz do repo.

## Por que um projeto separado em vez de uma Redirect Rule

O caminho canônico da Cloudflare para isso é uma **Single Redirect** (fase
`http_request_dynamic_redirect`), que se configura no dashboard ou por API. Em 2026-08-13 a API
recusou (`403`) com os dois tokens disponíveis — um só tinha `DNS: Edit`, o outro lia rulesets mas
não escrevia. Este projeto entrega o **mesmo resultado observável** (301 com caminho e query
preservados, na borda, sem tocar no WordPress antigo) usando só permissão de Pages + DNS.

Se um dia houver token com escrita em rulesets, o mais limpo é migrar para a Redirect Rule nativa e
**apagar este projeto e o domínio anexado a ele** — não deixar os dois.

## Deploy

```bash
npx wrangler pages deploy apex-redirect --project-name=eciaa-apex-redirect --branch=main
```

## DNS

| | valor |
|---|---|
| registro | `CNAME` `eciaa.com.br` → `eciaa-apex-redirect.pages.dev`, **proxiado** |
| id do registro | `d8da4c5826a74a2ad8557aea2a295a30` |
| rollback | `A` → `89.116.58.250`, `proxied: false` (o WordPress antigo, que **continua vivo na Hostinger**) |

Os `MX` (Hostinger), `autoconfig`, `autodiscover`, DKIM, SPF e DMARC do apex **não são afetados** —
são outros tipos de registro. O e-mail não passa por aqui.
