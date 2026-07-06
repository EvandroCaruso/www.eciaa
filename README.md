# ECIAA — Site Institucional

Site institucional estático da **ECIAA** (HTML/CSS/JS vanilla, sem build). Hospedado no **GitHub Pages**.

🌐 **Site ao vivo:** https://www.eciaa.com.br

> ⚠️ **Domínio:** o site é servido em **`www.eciaa.com.br`** (o `CNAME` aponta pra cá). O **apex `eciaa.com.br` (sem www) é OUTRO site — um WordPress** — e dá 404 nas páginas do blog. **Todo `canonical`/OG/sitemap usa `https://www.eciaa.com.br/...`.** Nunca use o apex nos links de SEO.

> 📚 **Documentação completa** (fonte de verdade) vive no vault Obsidian, não aqui:
> `05-Projetos/site-institucional-eciaa/` (estrutura-tecnica, como-publicar, evolucao) e `07-Configuracoes/github/github-pages.md`.

---

## 📁 Estrutura

```
www.eciaa/
├── index.html                    ← Home (com teaser do blog → /blog/)
├── politica-exclusao-dados.html  ← legal (Meta/LGPD)
├── termos-de-servico.html        ← legal
├── robots.txt · sitemap.xml      ← SEO (atualizar sitemap a cada matéria)
├── og-image.png · logo.png · favicon.svg
├── .nojekyll                     ← NÃO REMOVER (ver abaixo)
└── blog/
    ├── index.html                ← Listagem (cards + filtros)
    └── posts/
        ├── TEMPLATE-novo-post.html          ← Template de matéria (alto SEO)
        ├── guia-aprovacao-utility-whatsapp.html
        └── img/                  ← OG por matéria: {slug}-og.png (1200×630)
```

> **`.nojekyll` não pode ser removido.** Sem ele o GitHub Pages roda Jekyll e processa `{{ }}` como Liquid — quebrando exemplos de código/variáveis nas matérias (e podendo falhar o build).

---

## ✍️ Como publicar uma nova matéria

1. **Duplique** `blog/posts/TEMPLATE-novo-post.html` → `blog/posts/{slug}.html` (minúsculas-com-hifens, sem acento).
2. **`<head>`:** edite `<title>` (<60), `description` (140–160), `canonical`, OG + Twitter, `article:published_time`/`modified_time`, e `og:image` → `blog/posts/img/{slug}-og.png`. **Sempre `https://www.eciaa.com.br/...`**.
3. **JSON-LD (3 blocos):** atualize `Article` (headline/datas/imagem), `BreadcrumbList` (nome + URL) e `FAQPage` (perguntas reais — ou remova se não houver FAQ). As perguntas do FAQPage devem ser **iguais** às do bloco `<details>` no corpo.
4. **Conteúdo:** cada seção é `<section class="sec" id="sN">` com um `<h2>`; atualize o índice (TOC) com um `<li>` por seção; ilustrações em **SVG inline** dentro de `<figure>` (com `<title>`/`<desc>` + `figcaption`). O corpo já usa fonte de leitura (Inter) — não troque por monospace.
5. **Imagem OG** (1200×630) em `blog/posts/img/{slug}-og.png`, no padrão dark/lilás da marca.
6. **Card na listagem:** adicione em `blog/index.html` (`#postsGrid`) com `data-cat` = `whatsapp` · `automacao` · `agentes` · `estrategia` (ou crie o filtro).
7. **Sitemap:** adicione a URL da matéria em `sitemap.xml` (com `<lastmod>`).
8. **Publique:**
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
- [ ] Canonical **www** (`https://www.eciaa.com.br/...`)
- [ ] OG (title, description, image 1200×630, url) + Twitter Card
- [ ] `article:published_time` **e** `modified_time`
- [ ] JSON-LD Article + BreadcrumbList (+ FAQPage se houver FAQ) — valida no [Rich Results Test](https://search.google.com/test/rich-results)
- [ ] H1 único; H2 por seção; H3 hierárquico
- [ ] SVG com `<title>`/`<desc>`; toda `<img>` com `alt`
- [ ] Card na listagem + URL no `sitemap.xml`
- [ ] Links internos sem UTM (UTM só no link externo da matéria quando distribuída)

---

## 🚀 Hospedagem (referência)

GitHub Pages · repo `EvandroCaruso/www.eciaa` · branch `main` · raiz · `CNAME = www.eciaa.com.br`. Deploy = `git push`. DNS e detalhes em `07-Configuracoes/github/github-pages.md` no vault.

## 📞 Suporte
- Site: https://www.eciaa.com.br · Email: contato@eciaa.com.br
