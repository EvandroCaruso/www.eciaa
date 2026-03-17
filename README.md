# ECIAA — Site Institucional

Site institucional da **ECIAA — Desenvolvimento de Ecossistemas de Apps baseados em IA**.

🌐 **Site ao vivo:** [eciaa.com.br](https://eciaa.com.br)

---

## 📁 Estrutura do Projeto

```
eciaa/
├── index.html                        ← Página principal
├── blog/
│   ├── index.html                    ← Listagem do blog
│   └── posts/
│       ├── TEMPLATE-novo-post.html   ← Template para novos posts
│       ├── post-1.html               ← Posts publicados
│       └── post-2.html
└── README.md
```

---

## ✍️ Como publicar um novo post no blog

### Passo 1 — Duplique o template
Dentro de `blog/posts/`, copie o arquivo `TEMPLATE-novo-post.html` e renomeie com o slug do post:
```
ex: como-usar-ia-em-academias.html
```
> Use letras minúsculas, sem acentos, separadas por hífen.

### Passo 2 — Edite o cabeçalho (`<head>`)
Substitua os campos marcados com MAIÚSCULAS:
- `<title>` → Título do post
- `<meta name="description">` → Resumo em até 160 caracteres
- `<link rel="canonical">` → URL completa do post
- Tags `og:` → Para compartilhamento em redes sociais
- `article:published_time` → Data de publicação (formato AAAA-MM-DD)

### Passo 3 — Edite o cabeçalho visual
No bloco `<!-- CABEÇALHO DO POST -->`, preencha:
- Data no formato "15 Mar 2025"
- Categoria: Agentes / Automação / Cases / Estratégia
- Tempo de leitura estimado
- Título e lead do post

### Passo 4 — Escreva o conteúdo
No bloco `<article class="post-content">`, use:
- `<h2>` para seções principais
- `<h3>` para subtópicos
- `<p>` para parágrafos normais
- `<strong>` para destacar termos
- `<blockquote>` para citações em destaque
- `.metric-highlight` para exibir 3 métricas lado a lado
- `<ul>/<li>` para listas

### Passo 5 — Adicione o post na listagem
Abra `blog/index.html` e adicione um novo card no `#postsGrid`:

```html
<a href="posts/seu-slug.html" class="post-card" data-cat="CATEGORIA">
  <div class="post-card-body">
    <div class="post-meta">
      <span class="post-date">Mês AAAA</span>
      <span class="post-cat">Categoria</span>
    </div>
    <div class="post-title">Título do post</div>
    <p class="post-excerpt">Resumo curto do post em 1-2 frases.</p>
    <span class="post-read">Ler artigo →</span>
  </div>
</a>
```

> **data-cat** deve ser: `agentes`, `automacao`, `cases` ou `estrategia`

### Passo 6 — Suba no GitHub
```bash
git add .
git commit -m "post: título do novo post"
git push
```
O GitHub Pages publica automaticamente em segundos.

---

## 🚀 Publicação no GitHub Pages

### Primeira vez (configuração)
1. Crie um repositório no GitHub: `github.com/seu-usuario/eciaa`
2. Faça upload de todos os arquivos
3. Vá em **Settings → Pages**
4. Em **Source**, selecione `Deploy from a branch`
5. Selecione branch `main` e pasta `/ (root)`
6. Clique em **Save**

O site fica disponível em `seu-usuario.github.io/eciaa`

### Apontando o domínio eciaa.com.br
1. No GitHub Pages, adicione o domínio em **Custom domain**: `eciaa.com.br`
2. No painel do seu registrador de domínio, adicione os registros DNS:

**Registros A (para domínio raiz):**
```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

**Registro CNAME (para www):**
```
www → seu-usuario.github.io
```

3. Aguarde até 48h para propagação do DNS
4. Ative **Enforce HTTPS** nas configurações do GitHub Pages

---

## 🔧 SEO — Checklist para cada novo post

- [ ] `<title>` único e descritivo (até 60 caracteres)
- [ ] `<meta description>` com CTA implícito (até 160 caracteres)
- [ ] URL amigável (slug com palavras-chave)
- [ ] Tag `canonical` correta
- [ ] Tags Open Graph preenchidas
- [ ] Data de publicação (`article:published_time`)
- [ ] Posts relacionados apontando para outros conteúdos do site
- [ ] CTA final linkando para `#contato`

---

## 📞 Suporte
- Site: [eciaa.com.br](https://eciaa.com.br)
- Email: contato@eciaa.com.br
