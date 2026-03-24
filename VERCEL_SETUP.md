# Deploy no Vercel

Este projeto usa:

- frontend web em `dist`
- rotas serverless em `api/`
- PostgreSQL via `pg`
- autenticacao web com Google OAuth + sessao em cookie

## Scripts

```bash
npm run build:web
npm run deploy
npm run deploy:preview
```

## Variaveis no Vercel

Configure no projeto:

```bash
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
VITE_API_BASE_URL
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
DATABASE_URL
MASTER_CODE
MASTER_PASSWORD
MERCADOPAGO_ACCESS_TOKEN
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_WEBHOOK_VERIFY_TOKEN
```

## Observacoes

- As rotas da API ficam em `/api/...`
- O webhook do WhatsApp fica em `/api/webhooks/whatsapp`
- O webhook do Mercado Pago fica em `/api/webhooks/mercado-pago`
- O health check do banco fica em `/api/health/database`
- O arquivo `api/tsconfig.json` força `CommonJS` nas funcoes serverless para compatibilidade com o runtime Node da Vercel
