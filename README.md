# ECIAA — Site Institucional

Site institucional estático da **ECIAA** (HTML/CSS/JS vanilla). Hospedado no **GitHub Pages**, **em migração para o Cloudflare Pages** (ver "Hospedagem" no fim).

🌐 **Site ao vivo:** https://www.eciaa.com.br

> 🔗 **URLs são sem extensão** (`/termos-de-servico`, `/blog/posts/{slug}`) desde 2026-08-12.
> Não escreva `.html` em link interno, `canonical`, OG ou `sitemap.xml` — o Cloudflare Pages
> redireciona `/foo.html` → `/foo` por comportamento embutido e **não configurável**, então
> `.html` em canonical apontaria para uma URL que redireciona.

> ⚠️ **Domínio:** o site é servido em **`www.eciaa.com.br`** (o `CNAME` aponta pra cá). O **apex `eciaa.com.br` (sem www) é OUTRO site — um WordPress** — e dá 404 nas páginas do blog. **Todo `canonical`/OG/sitemap usa `https://www.eciaa.com.br/...`.** Nunca use o apex nos links de SEO.

> 📚 **Documentação completa** (fonte de verdade) vive no vault Obsidian, não aqui:
> `05-Projetos/site-institucional-eciaa/` (README, estrutura-tecnica, como-publicar, evolucao),
> `07-Configuracoes/github/github-pages.md` (hospedagem atual + DNS real da zona) e
> `07-Configuracoes/cloudflare/pages.md` (hospedagem de destino + pendências do cutover).

---

## 📁 Estrutura

```
www.eciaa/
├── styles.css                    ← DESIGN SYSTEM compartilhado (/styles.css) — ver abaixo
├── index.html                    ← Home (hero + seção #ecossistema + teaser do blog → /blog/)
├── politica-exclusao-dados.html  ← legal (Meta/LGPD)
├── termos-de-servico.html        ← legal
├── 404.html                      ← OBRIGATÓRIO no Cloudflare Pages (ver abaixo)
├── robots.txt · sitemap.xml      ← SEO (atualizar sitemap a cada matéria)
├── og-image.png · logo.png · favicon.svg
├── .nojekyll                     ← NÃO REMOVER (ver abaixo)
├── _headers · _redirects         ← borda do Cloudflare Pages (GitHub Pages ignora)
├── scripts/                      ← build-site · check-links · serve-dist (Node puro, 0 dep)
├── dist/                         ← saída do build — gitignored, NUNCA editar à mão
└── blog/
    ├── index.html                ← Listagem (cards + filtros)
    └── posts/
        ├── TEMPLATE-novo-post.html          ← Template de matéria (alto SEO)
        ├── guia-aprovacao-utility-whatsapp.html
        └── img/                  ← OG por matéria: {slug}-og.png (1200×630)
```

> **`.nojekyll` não pode ser removido.** Sem ele o GitHub Pages roda Jekyll e processa `{{ }}` como Liquid — quebrando exemplos de código/variáveis nas matérias (e podendo falhar o build).

> **`404.html` não pode ser removido.** No Cloudflare Pages, **sem um `404.html` no topo ele
> assume que o site é uma SPA** e devolve a home com **status 200** para qualquer URL
> inexistente — soft-404 em todo o blog.

---

## 🎨 Padrão visual (design system v2 — make-clean, desde 2026-07-06)

Redesign inteiro referenciando o **make.com**: base **clara**, colorida, arredondada, com muito respiro. Todo o CSS vive em **`/styles.css`** (referenciado por caminho absoluto em toda página — não há mais `<style>` por página).

- **Tipografia:** **Satoshi** via Fontshare (`api.fontshare.com`, com `preconnect`), pesos 400/500/700/900, para tudo. Sem mono.
- **Paleta (tokens `:root` em `styles.css`):** base `--bg #FBFAFF` / `--surface #FFFFFF` / `--ink #171522` / `--muted #6B6880`; marca **violeta `#7C3AED`** + **coral `#FB6F4A`** + **ciano `#12B5C9`**; gradientes `--grad-hero` e `--grad-text`.
- **Componentes prontos:** `.btn`/`.btn-primary`/`.btn-ghost` (pill), `.card` (arredondado + sombra), `.eyebrow`/`.chip` (pills coloridos), `.nav` com **menu mobile** (`.nav-toggle`), `.hero` com **mesh de gradiente animado** (`.blob`), `.footer` escuro, `.grad-text`. Tudo responsivo e respeitando `prefers-reduced-motion`.
- **Logo:** `EC<span>IA</span>A` — o **"IA"** é gradiente.
- **Seção "Ecossistema conectado"** (`#ecossistema` na home): ECIAA no centro ligado a 8 sistemas; logos como **SVG inline** (sprite `<symbol>`), conexões curvas + pulsos animados.

> A skill do vault `eciaa-visual-pattern` é **outra coisa** (padrão **dark** dos embeds do Chatwoot/hub/dashboards). Não confundir com o site.

---

## ✍️ Como publicar uma nova matéria

> O template `TEMPLATE-novo-post.html` já está no design system v2 e usa `/styles.css` — a matéria nova **herda a identidade automaticamente**.

1. **Duplique** `blog/posts/TEMPLATE-novo-post.html` → `blog/posts/{slug}.html` (minúsculas-com-hifens, sem acento).
2. **`<head>`:** edite `<title>` (<60), `description` (140–160), `canonical`, OG + Twitter, `article:published_time`/`modified_time`, e `og:image` → `blog/posts/img/{slug}-og.png`. **Sempre `https://www.eciaa.com.br/...` e SEM `.html`** (o `og:image` continua `.png`, claro).
3. **JSON-LD (3 blocos):** atualize `Article` (headline/datas/imagem), `BreadcrumbList` (nome + URL) e `FAQPage` (perguntas reais — ou remova se não houver FAQ). As perguntas do FAQPage devem ser **iguais** às do bloco `<details>` no corpo.
4. **Conteúdo:** cada seção é `<section class="sec" id="sN">` com um `<h2>`; atualize o índice (TOC) com um `<li>` por seção; ilustrações em **SVG inline** dentro de `<figure>` (com `<title>`/`<desc>` + `figcaption`). O corpo é **Satoshi** em tamanho de leitura — não use monospace. **SVG no tema claro:** fundo `#F3F1FB`/`#FFFFFF`, texto `#171522`, acentos `#7C3AED`/`#FB6F4A`/`#12B5C9`.
5. **Imagem OG** (1200×630) em `blog/posts/img/{slug}-og.png`, na **identidade clara/multicolor** (base `#FBFAFF` + blobs de gradiente + Satoshi). Feita renderizando um HTML 1200×630 headless → PNG.
6. **Card na listagem:** adicione em `blog/index.html` (`#postsGrid`) — `<a class="card post-card" data-cat="...">` com `.post-meta` (`.post-date` + `.chip`), `.post-title`, `.post-excerpt`, `.post-read`. `data-cat` = `whatsapp` · `automacao` · `agentes` · `estrategia` (ou crie o filtro).
7. **Sitemap:** adicione a URL da matéria em `sitemap.xml` (com `<lastmod>`), **sem `.html`**.
8. **Verifique antes de publicar** (Node puro, nada para instalar):
   ```bash
   node scripts/build-site.mjs     # monta dist/ só com o que é público
   node scripts/check-links.mjs    # todo link interno resolve? (falha se não)
   node scripts/serve-dist.mjs     # preview em localhost:4173 com as regras do Pages
   ```
9. **Publique:**
   ```bash
   git add .
   git commit -m "Nova matéria: {título}"
   git push
   ```
   O GitHub Pages publica em ~1 min **no www** (o apex/WordPress não muda).

> 💡 Há a skill `materia-nova` (em desenvolvimento) que automatiza os passos 1–7. Ver `como-publicar.md` no vault.

---

## 🔧 Checklist SEO por matéria

- [ ] Title < 60 · description 140–160
- [ ] Canonical **www**, **sem `.html`** (`https://www.eciaa.com.br/blog/posts/{slug}`)
- [ ] `node scripts/check-links.mjs` passa
- [ ] OG (title, description, image 1200×630, url) + Twitter Card
- [ ] `article:published_time` **e** `modified_time`
- [ ] JSON-LD Article + BreadcrumbList (+ FAQPage se houver FAQ) — valida no [Rich Results Test](https://search.google.com/test/rich-results)
- [ ] H1 único; H2 por seção; H3 hierárquico
- [ ] SVG com `<title>`/`<desc>`; toda `<img>` com `alt`
- [ ] Card na listagem + URL no `sitemap.xml`
- [ ] Links internos sem UTM (UTM só no link externo da matéria quando distribuída)

---

## 🚀 Hospedagem

**Hoje (no ar):** GitHub Pages · repo **privado** `EvandroCaruso/www.eciaa` · branch `main` ·
**raiz do repo** · `CNAME = www.eciaa.com.br`. Deploy = `git push`. O DNS já é Cloudflare
(nameservers `april`/`simon.ns.cloudflare.com`), mas o `www` está em **nuvem cinza** — o tráfego
vai direto ao GitHub/Fastly, sem passar pela Cloudflare.

**Em migração para o Cloudflare Pages.** Motivo: Pages a partir de repo **privado** exige plano
pago no GitHub (Pro/Team, US$ 4/mês); no Cloudflare Pages é grátis, sem limite de banda (o
GitHub tem soft limit de 100 GB/mês), e sai da zona cinzenta dos Termos Adicionais do GitHub,
que vedam usar Pages como hospedagem gratuita de negócio online.

Estado da migração:

| Etapa | Estado |
|---|---|
| URLs sem extensão (81 URLs: canonical, OG, JSON-LD, sitemap, links) | ✅ feito |
| `404.html`, `_headers` (HSTS), `_redirects` (`/flow-editor/`) | ✅ feito |
| Build limpo (`dist/` só com o que é público) | ✅ feito |
| Conectar o repo no Cloudflare Pages (build `node scripts/build-site.mjs`, output `dist`) | ⏳ OAuth de dashboard |
| Domínio `www.eciaa.com.br` no projeto + CNAME | ⏳ precisa token com `Zone > DNS: Edit` |
| Desligar o GitHub Pages | ⏳ depois do cutover |

**Rollback:** apontar o CNAME de volta para `evandrocaruso.github.io` e reativar o GitHub Pages.

> ⚠️ O GitHub Pages publica a **raiz do repo**; o Cloudflare Pages publica **`dist/`**. Enquanto
> os dois estiverem ligados, o `dist/` é o que vale no Cloudflare e a raiz é o que vale no GitHub
> — daí o `_headers`/`_redirects` só valerem no segundo.

## 📞 Suporte
- Site: https://www.eciaa.com.br · Email: contato@eciaa.com.br
