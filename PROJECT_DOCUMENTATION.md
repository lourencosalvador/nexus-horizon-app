# Nexus App - Documentação Completa do Projeto

## 1. Objetivo do Documento

Este documento descreve **toda a experiência do usuário no frontend** do Nexus App, desde a primeira interação (login) até as páginas mais avançadas (automações, auditoria e insights).

O foco central é em:

- **Clareza**
- **Confiança**
- **Controle**
- **Transparência**

O frontend não é apenas uma interface: é **uma ferramenta de tomada de decisão para administradores**.

---

## 2. Princípios UX/UI do Nexus App

1. **Nada acontece sem uma explicação**
2. **O usuário nunca se sente perdido**
3. **A automação é visível, não mágica**
4. **Administradores podem responder "por quê?" em segundos**
5. **Divulgação progressiva** – a complexidade é revelada apenas quando necessário

---

## 3. Stack Frontend Recomendada

### Core

- **Next.js (React)** – App Router
- **TypeScript** – segurança e legibilidade
- **Tailwind CSS** – consistência visual e velocidade

### Estado & Dados

- **TanStack Query** – gerenciamento de dados assíncronos
- **Zustand** – estado global leve (auth, UI, filtros)

### UI & Produtividade

- **shadcn/ui** – componentes acessíveis
- **Lucide Icons** – ícones limpos e consistentes
- **Framer Motion** – micro-interações e transições

### Observabilidade Frontend

- **PostHog / OpenReplay** – rastreamento de comportamento do usuário
- **Sentry** – monitoramento de erros na UI

---

## 4. Estrutura de Navegação Global

```
Login / Auth
│
├── Onboarding
│
├── Dashboard
│   ├── Overview
│   ├── Activity Feed
│   └── Alerts
│
├── Conversations
│   ├── Inbox
│   ├── Conversation View
│   └── Automation Trace
│
├── Automations
│   ├── Flows
│   ├── Rules
│   └── Simulator
│
├── Analytics
│   ├── Performance
│   ├── Automation Impact
│   └── Drop-offs
│
├── Audit & Logs
│   ├── Decisions
│   ├── Messages
│   └── State Changes
│
├── Integrations
│   └── Skool
│
└── Settings
    ├── Team & Roles
    ├── Permissions
    └── Notifications
```

---

## 5. Login & Autenticação

### Funcionalidades

- Login por email
- Magic link (opcional)
- 2FA para administradores

### Inovação UX

- Mostrar **o que o usuário vai controlar** mesmo antes de fazer login
- Mensagem clara: *"Veja exatamente por que cada mensagem é enviada"*

### Implementação Atual

- Página de login em `/auth/signin`
- Página de cadastro em `/auth/signup`
- Validação com Zod e React Hook Form
- Upload de foto de perfil no cadastro
- Fonte: Rubik

---

## 6. Onboarding Inteligente

### Objetivo

Guiar o usuário de **zero até sua primeira automação ativa** com confiança.

### Etapas

1. Conectar Skool
2. Visualizar um evento de teste
3. Criar um primeiro fluxo simples
4. Simular uma resposta

### Inovação

- **Previews de logs reais e explicações durante o onboarding**

---

## 7. Dashboard (Home)

### Seções

#### Overview

- Automações ativas
- Conversas hoje
- Ações humanas vs automatizadas

#### Activity Feed (tempo real)

- "Mensagem enviada automaticamente"
- "Regra X foi acionada"

#### Alerts

- Fluxos pausados
- Mensagens não respondidas

### Inovação

- Cada item é clicável e abre o **Automation Trace**

---

## 8. Conversations (Inbox)

### Inbox

- Lista de conversas
- Filtros baseados em estado
- Indicadores de automação vs humano

### Conversation View

Layout dividido:

- Esquerda: chat
- Direita: contexto de automação

### Automation Trace (DIFERENCIADOR CHAVE)

Exibir claramente:

- **Por que esta mensagem foi enviada**
- **Qual regra foi acionada**
- Estado do usuário no momento

```
Mensagem enviada porque:
• Regra: welcome.option_1
• Condição: response == '1'
• Estado anterior: awaiting_option
```

---

## 9. Automations

### Flows

- Editor visual (baseado em nós)
- Versionamento

### Rules

- Lista de regras
- Condições legíveis por humanos (não código bruto)

### Simulator (Diferenciador)

- Simular conversas
- Visualizar decisões sem impactar usuários reais

---

## 10. Analytics

### Performance

- Taxa de resposta
- Tempo médio de resposta

### Automation Impact

- Mensagens economizadas
- Conversas resolvidas automaticamente

### Drop-offs

- Onde os usuários saem do fluxo

---

## 11. Audit & Logs (Poder do Admin)

### Decisions

- Histórico do motor de decisão

### Messages

- Histórico completo de mensagens

### State Changes

- Evolução do estado do usuário

### Inovação

- Filtragem baseada em regras
- Exportação CSV

---

## 12. Integrations

### Skool

- Status de conexão
- Eventos recebidos
- Limites de taxa

---

## 13. Settings

### Team & Roles

- Admin
- Operator
- Viewer

### Permissions

- Quem pode editar fluxos

### Notifications

- Alertas críticos

---

## 14. Diferenciadores UX

- **Explicações explícitas de decisões**
- **Simulador de automação**
- **Estado do usuário sempre visível**
- **Logs legíveis por humanos**
- **Confiança e previsibilidade**

---

## 15. Estrutura de Arquivos do Projeto

```
nexus-app/
├── app/
│   ├── auth/
│   │   ├── signin/
│   │   │   └── page.tsx
│   │   └── signup/
│   │       └── page.tsx
│   ├── assets/
│   │   └── image/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── PROJECT_DOCUMENTATION.md
└── package.json
```

---

## 16. Convenções de Código

### TypeScript

- Sempre usar tipos explícitos
- Interfaces para objetos complexos
- Enums para valores fixos

### Componentes React

- Componentes funcionais com hooks
- Separar lógica de apresentação
- Usar React Hook Form para formulários
- Validação com Zod

### Estilização

- Tailwind CSS para estilos
- Classes utilitárias
- Componentes reutilizáveis com shadcn/ui

### Estado

- Zustand para estado global
- TanStack Query para dados do servidor
- React Hook Form para estado de formulários

---

## 17. Fluxo de Autenticação

1. Usuário acessa `/auth/signin` ou `/auth/signup`
2. Preenche formulário com validação em tempo real
3. Após login bem-sucedido, redireciona para Dashboard
4. Estado de autenticação gerenciado globalmente (Zustand)

---

## 18. Próximos Passos de Desenvolvimento

### Fase 1: Autenticação Completa
- [x] Páginas de login e cadastro
- [x] Validação com Zod e React Hook Form
- [ ] Integração com backend de autenticação
- [ ] Gerenciamento de sessão

### Fase 2: Dashboard
- [ ] Layout principal com navegação
- [ ] Overview com métricas
- [ ] Activity Feed em tempo real
- [ ] Sistema de alertas

### Fase 3: Conversations
- [ ] Inbox de conversas
- [ ] Visualização de conversa individual
- [ ] Automation Trace

### Fase 4: Automations
- [ ] Editor visual de fluxos
- [ ] Gerenciamento de regras
- [ ] Simulador de conversas

### Fase 5: Analytics & Audit
- [ ] Páginas de analytics
- [ ] Sistema de logs e auditoria
- [ ] Exportação de dados

---

## 19. Notas Importantes para Desenvolvedores

### Antes de Começar a Trabalhar

1. **Leia este documento completamente** para entender a visão geral do projeto
2. **Entenda os princípios UX/UI** antes de criar novos componentes
3. **Siga a estrutura de navegação** ao criar novas páginas
4. **Mantenha a consistência** com o design system existente
5. **Priorize clareza e transparência** em todas as interações

### Ao Criar Novos Componentes

- Sempre explique o "por quê" das ações
- Torne a automação visível, não mágica
- Use validação adequada (Zod + React Hook Form)
- Mantenha acessibilidade em mente
- Teste em diferentes tamanhos de tela

### Ao Trabalhar com Automações

- Sempre mostre qual regra foi acionada
- Exiba o estado do usuário no momento da decisão
- Permita rastreabilidade completa
- Facilite a depuração com logs claros

---

## 20. Contato e Suporte

Para dúvidas sobre a arquitetura ou decisões de design, consulte este documento primeiro.

**Princípio Fundamental**: Se o usuário não entender por que algo aconteceu, o design falhou.

---

**Última atualização**: 2024
**Versão do documento**: 1.0





