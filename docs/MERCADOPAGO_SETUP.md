# Configuração do Mercado Pago para Pagamentos PIX

## 1. Criar conta de desenvolvedor

1. Acesse https://www.mercadopago.com.br/developers
2. Faça login com sua conta Mercado Pago (ou crie uma)
3. Vá em **Suas integrações** > **Criar aplicação**
4. Escolha um nome (ex: "CDMF Pagamentos")
5. Selecione **Pagamentos online** > **CheckoutAPI**

## 2. Obter credenciais

1. Na sua aplicação, vá em **Credenciais de produção**
2. Copie o **Access Token** (começa com `APP_USR-`)

> ⚠️ **IMPORTANTE**: Nunca exponha o Access Token no código frontend!

### Para testes (sandbox):
1. Vá em **Credenciais de teste**
2. Use o Access Token de teste para desenvolvimento
3. Use os cartões de teste do MP para simular pagamentos

## 3. Configurar Firebase Cloud Functions

### 3.1 Instalar Firebase CLI
```bash
npm install -g firebase-tools
firebase login
```

### 3.2 Inicializar Functions (primeira vez)
```bash
firebase init functions
# Escolha TypeScript
# Diga "Yes" para ESLint
```

### 3.3 Instalar dependências
```bash
cd functions
npm install
```

### 3.4 Configurar Access Token
```bash
# Para produção
firebase functions:config:set mercadopago.access_token="APP_USR-xxxxx"

# Para verificar
firebase functions:config:get
```

### 3.5 Deploy das functions
```bash
npm run build
firebase deploy --only functions
```

## 4. Configurar Webhook (Notificações IPN)

1. No painel do Mercado Pago, vá em **Suas integrações** > sua aplicação
2. Clique em **Webhooks** > **Configurar notificações**
3. Adicione a URL:
   ```
   https://us-central1-cdmf-d52fa.cloudfunctions.net/mercadoPagoWebhook
   ```
4. Selecione os eventos:
   - ✅ Pagamentos
5. Clique em **Salvar**

## 5. Ativar no aplicativo

Após configurar as Cloud Functions, edite o arquivo:
`src/services/mercadoPagoService.ts`

```typescript
// Mude de false para true
export const USE_MERCADO_PAGO = true;
```

## 6. Testar a integração

### 6.1 Testar localmente
```bash
cd functions
npm run serve
```

### 6.2 Testar em produção
1. Gere uma cobrança PIX para um aluno
2. Escaneie o QR Code com um app de banco
3. Faça o pagamento
4. O status deve atualizar automaticamente

## 7. Custos do Mercado Pago

| Tipo | Taxa |
|------|------|
| PIX | **0,99%** por transação |
| Cartão de crédito | 4,98% |
| Boleto | R$ 3,49 |

### Exemplo de custos PIX:
| Valor recebido | Taxa MP (0.99%) |
|----------------|-----------------|
| R$ 50,00       | R$ 0,50         |
| R$ 100,00      | R$ 0,99         |
| R$ 200,00      | R$ 1,98         |
| R$ 500,00      | R$ 4,95         |

> O dinheiro cai na sua conta Mercado Pago na hora. Transferência para conta bancária é grátis.

## 8. Solução de problemas

### Erro: "Access Token não configurado"
```bash
firebase functions:config:set mercadopago.access_token="SEU_TOKEN"
firebase deploy --only functions
```

### Erro: "Email do aluno é obrigatório"
O Mercado Pago exige email do pagador. Certifique-se de que o aluno tem email cadastrado.

### Pagamento não confirma automaticamente
1. Verifique se o webhook está configurado corretamente
2. Verifique os logs: `firebase functions:log`
3. Teste a URL do webhook manualmente

### Logs das functions
```bash
firebase functions:log --only createPixPayment
firebase functions:log --only mercadoPagoWebhook
```

## 9. Documentação oficial

- [API de Pagamentos](https://www.mercadopago.com.br/developers/pt/reference/payments/_payments/post)
- [PIX](https://www.mercadopago.com.br/developers/pt/docs/checkout-api/integration-configuration/integrate-with-pix)
- [Webhooks](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks)
- [Credenciais de teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-api/additional-content/your-integrations/test/cards)

## 10. Suporte

- Documentação: https://www.mercadopago.com.br/developers
- Comunidade: https://github.com/mercadopago
- Suporte: https://www.mercadopago.com.br/ajuda

