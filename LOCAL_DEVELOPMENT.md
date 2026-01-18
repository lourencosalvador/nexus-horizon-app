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

---

# Desenvolvimento local (com Selenium via Docker) — “igual Vercel”

Se o teu objetivo é **testar login por email + password** (sem pedir cookie ao user), usa o `docker-compose.yml` do repo,
que sobe um **Selenium Standalone Chrome** e a app com `USE_SELENIUM_GRID=true`.

## 1) Pré-requisitos

- Docker Desktop instalado e a correr
- Node.js 20+ (para instalar deps, se necessário)

## 2) Variáveis de ambiente

Garante que tens `./.env.local` com as chaves do Supabase (se fores navegar na UI). Para testar só as rotas API, muitas vezes não precisas.

E garante estas flags (a app do compose já injeta, mas é bom estar explícito):

```bash
ENABLE_SKOOL_PASSWORD_LOGIN=true
USE_SELENIUM_GRID=true
SELENIUM_HUB_URL=http://selenium:4444/wd/hub
```

## 3) Subir Selenium + App

Na raiz do repo:

```bash
docker compose up --build
```

Isso expõe:

- App: `http://localhost:3001`
- Selenium: `http://localhost:4444` (UI e Grid)

## 4) Verificar que o Selenium está “UP”

No teu terminal:

```bash
curl -fsS http://localhost:4444/wd/hub/status | head
curl -fsS http://localhost:3001/api/health/selenium-warmup | cat
```

Esperado:

- `.../status` deve responder `200`
- `/api/health/selenium-warmup` deve responder `{ "ok": true, "warmed": true, ... }`

## 5) Testar criação de sessão (email + password) via API

```bash
curl -sS -X POST http://localhost:3001/api/integrations/skool/session/create \
  -H "Content-Type: application/json" \
  -d '{"baseUrl":"https://www.skool.com","email":"TEU_EMAIL","password":"TUA_PASSWORD"}' | cat
```

Esperado (sucesso):

- `"ok": true`
- `"connector": "selenium"`
- `"encryptedCookie": "..."` (string grande)

Se falhar com:

- **503**: Selenium ainda está a arrancar (cold start). Espera ~30–90s e repete.
- **401 + “auth_token”**: Skool bloqueou automação (WAF/captcha) — isto pode acontecer mesmo com Selenium. Nesse caso,
  não existe 100% de garantia sem um fluxo de login interativo (captcha humano).

## 6) Testar o “verify” com o cookie encriptado

Depois de teres `encryptedCookie`:

```bash
curl -sS -X POST http://localhost:3001/api/integrations/skool/verify \
  -H "Content-Type: application/json" \
  -d '{"baseUrl":"https://www.skool.com","encryptedCookie":"COLOCA_AQUI"}' | cat
```

## Nota importante (sobre “não pode pedir cookie”)

Conseguir login 100% automático com Skool depende do WAF/captcha deles. O Selenium ajuda, mas **não garante**.
Se quiseres que isto seja “consumer-proof” (sem pedir cookie), a abordagem robusta é:

- **Login interativo num browser remoto** (o user resolve captcha 1 vez), depois guardamos a sessão encriptada.


