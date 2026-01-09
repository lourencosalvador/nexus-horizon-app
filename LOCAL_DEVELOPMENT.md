# Desenvolvimento local (sem Docker) — porta 3000

Objetivo: rodar o Nexus no seu Mac com **baixo consumo de RAM**, sem `docker compose` e sem Selenium.

## 1) Pré-requisitos

- **Node.js 20+**
- Uma conta/projeto no **Supabase** (hosted)

## 2) Variáveis de ambiente

Crie um arquivo `./.env.local` (na raiz do repo) com:

```bash
# Supabase (obrigatório)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Mantém leve: não usa Selenium Grid
USE_SELENIUM_GRID=false

# OpenAI (opcional)
OPENAI_API_KEY=
NEXUS_OPENAI_MODEL=gpt-4o-mini
```

## 3) Instalar dependências e rodar

```bash
cd /Users/lorrys/Documents/nexus-app
npm install
npm run dev
```

Abra `http://localhost:3000`.

## 4) Conectar Skool sem automação (recomendado)

No `Connect instance`, use **Advanced cookie mode**:

- Skool (no browser) → DevTools → Network → qualquer request → Request Headers → **Cookie**
- Cole o valor completo do header `Cookie` no campo Advanced

Isso evita Playwright/Selenium e reduz bastante o uso de RAM.


