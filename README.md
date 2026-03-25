# CDMF

Aplicação web responsiva do **Centro de Danças Marcelo Ferreira (CDMF)** para gestão acadêmica, financeira e de comunicação com alunos, professores e administração. O projeto combina interface em React/React Native Web, backend serverless na Vercel, persistência em PostgreSQL, pagamentos PIX via Mercado Pago e atendimento/automação via WhatsApp.

## Visão geral

O sistema foi desenhado para centralizar a operação da escola em um único produto:

- **Alunos** acessam aulas, eventos, pagamentos, vouchers e dados da conta.
- **Professores** acompanham turmas, alunos, presença e relatórios.
- **Administração (master)** gerencia alunos, professores, turmas, eventos, cobranças, comunicações e manutenção operacional.
- **WhatsApp** funciona como canal de atendimento, notificações, disparos segmentados e triagem automatizada com IA.

## Principais funcionalidades

### Área do aluno

- Login com **Google OAuth**.
- Verificação obrigatória de telefone por **código enviado no WhatsApp**.
- Onboarding com coleta de:
  - telefone
  - data de nascimento
  - gênero
  - preferência na dança
- Dashboard com avisos, convites e eventos ativos.
- Visualização das turmas em que o aluno está matriculado.
- Ações rápidas via WhatsApp para:
  - avisar falta
  - tirar dúvidas sobre aulas
  - solicitar saída da turma
  - pedir novas inscrições
- Área financeira com:
  - mensalidades
  - ingressos
  - status das cobranças
  - geração de PIX
  - cópia do código PIX
  - QR Code
  - checagem manual e automática de pagamento
  - regeneração de PIX
- Fluxo de eventos com:
  - confirmação de presença
  - geração de ingresso
  - pagamento de evento pago
  - geração e exibição de voucher
  - cancelamento de participação
- Fluxo de acompanhante em evento:
  - o aluno pode pagar o ingresso do convidado
  - ou enviar convite via WhatsApp para o convidado criar conta e pagar o próprio ingresso
- Gestão de conta com edição de perfil, políticas, troca de conta Google e logout.

### Área do professor

- Login por **código do professor + senha**.
- Visualização apenas das turmas atribuídas ao docente.
- Lista de alunos vinculados às próprias turmas.
- Registro de presença por turma e por data.
- Relatórios de frequência com indicadores por aula e por aluno.

### Área master / administração

- Dashboard com indicadores operacionais e feed de atividades.
- Gestão de alunos:
  - cadastro de aluno offline
  - edição de perfil
  - ativação/inativação de matrícula
  - exclusão de perfil
  - matrícula e remoção em turmas
  - mesclagem entre perfil offline e perfil cadastrado no app
  - geração de cobrança individual
  - envio de lembretes financeiros
- Gestão de professores:
  - criação de professor com geração de código e senha
  - edição
  - ativação/desativação
  - exclusão
  - atribuição e remoção em turmas
- Gestão de turmas:
  - criação, edição e exclusão
  - configuração de professor responsável
  - definição de horários
  - matrícula e remoção de alunos
- Gestão de eventos:
  - criação e edição
  - eventos gratuitos ou pagos
  - limite de participantes
  - confirmação e cancelamento de participantes
  - envio e reenvio de convites
  - cancelamento de evento com limpeza de vouchers e cobranças pendentes relacionadas
- Central de comunicações via WhatsApp:
  - conexão da instância por QR Code
  - monitoramento de conversas em tempo real
  - resposta manual
  - pausa do bot por conversa
  - resolução/arquivamento operacional
  - disparos segmentados por alunos, turma, evento ou lista específica
  - templates reutilizáveis
  - upload de imagens para campanhas
  - avaliação de risco antes de disparos em massa
- Configurações administrativas:
  - edição dos dados da conta master
  - limpeza assistida de dados por domínio funcional
  - reset operacional de bases específicas

### Backend e automações

- Camada compatível com Firestore sobre **PostgreSQL**.
- Autenticação com sessão em cookie HTTP-only.
- Webhooks para:
  - **Mercado Pago**
  - **Evolution API / WhatsApp**
- Cron job para rechecagem de pagamentos PIX pendentes.
- Chatbot de triagem no WhatsApp com **OpenAI**, incluindo:
  - atendimento contextual
  - leitura de situação financeira do aluno
  - geração de PIX pelo bot
  - geração de voucher pelo bot
  - suporte a transcrição de áudio
  - fallback para atendimento humano

## Arquitetura

### Frontend

- **React 19**
- **React Native Web**
- **React Navigation**
- **Vite**

O frontend usa uma abordagem de app web com layout responsivo, tabs para mobile e sidebar para desktop em partes do sistema.

### Backend

- **Vercel Serverless Functions** em `api/`
- Helpers HTTP e autenticação em `server/`
- Sessões persistidas em PostgreSQL
- SSE para atualização em tempo real das conversas do WhatsApp

### Persistência

O projeto não usa Firestore real em produção. Em vez disso, mantém compatibilidade de API no cliente com uma camada local que persiste documentos em PostgreSQL:

- cliente: `src/services/postgresFirestoreCompat.ts`
- backend: `server/doc-store.ts`
- RPC: `api/rpc/[name].ts`

As tabelas principais são criadas automaticamente:

- `app_documents`
- `auth_users`
- `auth_sessions`

## Stack e integrações

- **Banco de dados:** PostgreSQL (`pg`)
- **Autenticação do aluno:** Google Identity Services / OAuth
- **Autenticação administrativa:** sessão própria com cookie
- **Pagamentos:** Mercado Pago PIX
- **Mensageria:** Evolution API + WhatsApp
- **IA:** OpenAI para chatbot de atendimento
- **Deploy:** Vercel

## Estrutura do projeto

```text
.
├── api/                     # Rotas serverless, webhooks, RPC, cron e SSE
├── assets/                  # Ícones, logos e imagens do app
├── docs/                    # Documentação operacional complementar
├── public/                  # Arquivos públicos e páginas legais
├── scripts/                 # Scripts auxiliares de build
├── server/                  # Regras de negócio, auth, DB, pagamentos e WhatsApp
├── src/
│   ├── components/          # Componentes visuais e módulos especializados
│   ├── contexts/            # Providers globais
│   ├── hooks/               # Hooks utilitários
│   ├── navigation/          # Navegação por perfil
│   ├── screens/             # Telas de aluno, professor e master
│   ├── services/            # Serviços de API, auth, pagamentos e compatibilidade
│   └── utils/               # Utilitários gerais
├── App.tsx                  # Bootstrap da aplicação
├── index.ts                 # Entrada web
├── vite.config.ts           # Configuração do Vite
└── vercel.json              # Configuração de deploy e cron
```

## Pré-requisitos

- Node.js 18+
- npm 9+
- PostgreSQL acessível pela aplicação
- Conta Google OAuth configurada
- Conta Mercado Pago com credenciais válidas
- Instância Evolution API configurada para WhatsApp
- Projeto Vercel para deploy

## Configuração local

### 1. Instale as dependências

```bash
npm install
```

### 2. Configure o ambiente

Use `.env.example` como base:

```bash
cp .env.example .env
```

No Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

### 3. Preencha as variáveis de ambiente

Veja a tabela completa na seção abaixo.

### 4. Escolha a forma de executar

#### Opção A: frontend local apontando para um backend já publicado

Defina `VITE_API_BASE_URL` com a URL do ambiente que expõe `/api/...` e rode:

```bash
npm run dev
```

#### Opção B: execução local full-stack com rotas serverless

Para simular frontend + `api/` localmente, use a CLI da Vercel:

```bash
npx vercel dev
```

Essa é a opção mais próxima do comportamento real do ambiente de produção.

## Variáveis de ambiente

| Variável | Obrigatória | Finalidade |
| --- | --- | --- |
| `VITE_GOOGLE_WEB_CLIENT_ID` | Sim | Client ID do Google para o frontend web |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Sim | Alias usado pelo build web e compatibilidade com a camada React Native |
| `VITE_API_BASE_URL` | Condicional | URL base da API quando frontend e backend não estão no mesmo domínio |
| `GOOGLE_OAUTH_CLIENT_ID` | Sim | Client ID usado no backend para troca/validação do login Google |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Sim | Secret do OAuth Google |
| `DATABASE_URL` | Sim | String de conexão do PostgreSQL |
| `MASTER_CODE` | Sim | Código mestre para bootstrap do perfil administrativo |
| `MASTER_PASSWORD` | Sim | Senha do perfil master |
| `MERCADOPAGO_ACCESS_TOKEN` | Sim | Token do Mercado Pago para geração e consulta de pagamentos PIX |
| `EVOLUTION_API_URL` | Sim | URL base da Evolution API |
| `EVOLUTION_API_KEY` | Sim | Chave da Evolution API |
| `EVOLUTION_INSTANCE_NAME` | Sim | Nome da instância do WhatsApp |
| `EVOLUTION_WEBHOOK_URL` | Sim | URL pública do webhook do WhatsApp |
| `OPENAI_API_KEY` | Opcional | Habilita o chatbot de atendimento no WhatsApp |
| `APP_PUBLIC_URL` | Recomendável | URL pública do app usada em links e webhooks |
| `CRON_SECRET` | Recomendável | Token de proteção do endpoint do cron |
| `VITE_ENABLE_DEBUG_LOGS` | Opcional | Mantém logs de debug no frontend mesmo fora de desenvolvimento |

## Endpoints relevantes

### Autenticação

- `GET /api/auth/session`
- `POST /api/auth/password-signin`
- `POST /api/auth/google-signin`
- `POST /api/auth/create-user`
- `POST /api/auth/signout`

### Backend de aplicação

- `POST /api/rpc/[name]`
- `GET /api/health/database`
- `GET /api/events/whatsapp`

### Webhooks e jobs

- `POST /api/webhooks/whatsapp`
- `GET|POST /api/webhooks/mercado-pago`
- `GET /api/cron/check-payments`

## Fluxos de negócio importantes

### Autenticação e perfis

- Aluno entra com Google.
- Professor entra com código e senha.
- Master entra com `MASTER_CODE` e `MASTER_PASSWORD`.
- Depois do login, o sistema resolve a navegação conforme `profile.role`.

### Pagamentos

- O aluno abre uma cobrança pendente.
- O sistema gera ou reutiliza um PIX do Mercado Pago.
- O pagamento pode ser confirmado por:
  - verificação manual no app
  - webhook do Mercado Pago
  - cron de reconciliação
  - checagem acionada pelo chatbot
- Após aprovação:
  - a fatura é marcada como paga
  - a transação financeira é criada
  - o status financeiro do aluno é recalculado
  - notificações são emitidas
  - mensagens de confirmação podem ser enviadas por WhatsApp
  - vouchers de evento podem ser criados automaticamente

### Eventos e vouchers

- Evento gratuito confirma presença imediatamente.
- Evento pago gera cobrança/invoice.
- O voucher é disponibilizado após a confirmação do pagamento.
- Cancelamentos removem participação e podem limpar cobrança pendente e voucher relacionado.

### WhatsApp

- A conexão da conta é feita por QR Code via Evolution API.
- As conversas ficam persistidas no banco e atualizadas por SSE.
- O master pode responder manualmente, resolver conversas e pausar o bot.
- O bot pode operar com texto e áudio.

## Coleções de dados mais relevantes

- `profiles`
- `classes`
- `invoices`
- `transactions`
- `events`
- `vouchers`
- `activities`
- `phone_otps`
- `whatsapp_conversations`
- `whatsapp_messages`
- `whatsapp_templates`
- `whatsapp_logs`
- `whatsapp_broadcasts`
- `broadcast_images`

## Deploy

### Build web

```bash
npm run build:web
```

### Preview local do build

```bash
npm run preview
```

### Deploy na Vercel

```bash
npm run deploy
```

Ou deploy de preview:

```bash
npm run deploy:preview
```

Observações importantes:

- o frontend é publicado a partir de `dist/`
- as funções serverless ficam em `api/`
- o cron diário está configurado em `vercel.json`
- políticas públicas ficam em `public/privacy-policy.html` e `public/terms-of-service.html`

## Documentação complementar

- `POSTGRES_SETUP.md`
- `VERCEL_SETUP.md`
- `docs/atendimento-app-cdmf.md`

## Status do projeto

Este repositório representa uma base operacional completa para gestão escolar no contexto do CDMF, com foco em experiência do aluno, automação administrativa e integração direta com canais de pagamento e atendimento.
