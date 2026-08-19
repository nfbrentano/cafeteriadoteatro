# Cafeteria do Teatro ☕🎭

Site institucional e cardápio digital da **Cafeteria do Teatro**, localizada no Teatro da Univates (Lajeado/RS). Um espaço onde o café encontra a cultura.

---

## 🚀 Stack Tecnológica

O projeto foi construído utilizando tecnologias web modernas e leves (Vanilla), garantindo performance e facilidade de manutenção:

- **Frontend:** HTML5, CSS3 (Vanilla) e JavaScript (ES6+).
- **Backend (BaaS):** [Supabase](https://supabase.com/) para Gerenciamento de Banco de Dados (PostgreSQL) e Storage (Arquivos/Imagens).
- **Tipografia:** Google Fonts (Cormorant Garamond e Jost).
- **PWA:** Suporte a Progressive Web App com `manifest.json`.

---

## 📁 Estrutura de Pastas

```text
/
├── assets/             # Imagens, ícones e arquivos estáticos
├── css/                # Folhas de estilo (separadas por componentes e páginas)
│   ├── base.css        # Resets, variáveis globais e tokens de design
│   ├── components.css  # Estilos de elementos reutilizáveis (botões, cards, navbar)
│   ├── home.css        # Estilos específicos da página inicial
│   ├── cardapio.css    # Estilos específicos da página do cardápio
│   ├── admin.css       # Interface do painel administrativo
│   └── ...
├── js/                 # Lógica de aplicação
│   ├── main.js         # Comportamentos globais (navbar, animações)
│   ├── db.js           # Funções de interação com o Supabase (CRUD)
│   ├── supabase-client.js # Inicialização e credenciais do cliente Supabase
│   ├── home-dynamic.js # Carregamento dinâmico de dados na Home
│   ├── admin/          # Lógica específica do painel administrativo
│   └── ...
├── index.html          # Página Inicial
├── cardapio.html       # Cardápio Digital
├── admin.html          # Painel de Administração (Gerenciamento de produtos/fotos)
├── 404.html            # Página de erro customizada
├── sitemap.xml         # Arquivo para SEO (Search Engine Optimization)
└── robots.txt          # Instruções para rastreadores de busca
```

---

## 💻 Como Rodar Localmente

Como o projeto é estático, você pode executá-lo de várias formas simples:

1.  **VS Code Live Server:** Clique com o botão direito em `index.html` e selecione "Open with Live Server".
2.  **Node.js (npx):**
    ```bash
    npx serve .
    ```
3.  **Python:**
    ```bash
    python -m http.server 8000
    ```

---

## 🛠️ Configuração de Produção

### Domínio
O site está configurado por padrão com o domínio `https://cafeteriadoteatro.com.br` para SEO, OpenGraph, Canonical URLs e Sitemaps. Se desejar alterar o domínio:

1. Faça uma busca global por `cafeteriadoteatro.com.br` em todo o projeto.
2. Substitua as ocorrências pelo seu novo domínio.
3. Arquivos afetados: `index.html`, `cardapio.html`, `admin.html`, `404.html`, `sitemap.xml`, `robots.txt` e `manifest.json`.

### Integração Supabase
As chaves de acesso estão localizadas em `js/supabase-client.js`. Em caso de mudança de ambiente (produção/homologação), atualize a `SUPABASE_URL` e `SUPABASE_ANON_KEY` neste arquivo.

---

## 📝 Licença
© 2026 Cafeteria do Teatro. Todos os direitos reservados.
