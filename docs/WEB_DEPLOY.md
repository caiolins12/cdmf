# Deploy Web - CDMF

## 🚀 Rodando Localmente

Para testar a versão web localmente:

```bash
npm run web
```

Acesse: http://localhost:8081

---

## 📦 Fazendo Build para Produção

1. Gerar os arquivos estáticos:

```bash
npm run build:web
```

Os arquivos serão gerados na pasta `dist/`.

---

## 🌐 Deploy no Firebase Hosting (GRATUITO)

### Passo 1: Instalar Firebase CLI (apenas uma vez)

```bash
npm install -g firebase-tools
```

### Passo 2: Login no Firebase

```bash
firebase login
```

### Passo 3: Deploy

```bash
npm run deploy
```

Ou manualmente:

```bash
npm run build:web
firebase deploy --only hosting
```

Após o deploy, seu site estará disponível em:
- **https://cdmf-d52fa.web.app**
- **https://cdmf-d52fa.firebaseapp.com**

---

## ⚙️ Configuração do Google Sign-In para Web

Para o login com Google funcionar na versão web, você precisa adicionar o domínio autorizado no Firebase:

1. Acesse [Firebase Console](https://console.firebase.google.com/)
2. Selecione o projeto **cdmf-d52fa**
3. Vá em **Authentication** > **Settings** > **Authorized domains**
4. Adicione os domínios:
   - `localhost` (para desenvolvimento)
   - `cdmf-d52fa.web.app` (após deploy)
   - `cdmf-d52fa.firebaseapp.com` (após deploy)
   - Se usar domínio próprio, adicione também

---

## 📱 PWA (Progressive Web App)

A versão web funciona como PWA! Usuários podem:
- **Instalar** o app no celular (iOS/Android) via navegador
- **Usar offline** (em breve, se configurar service worker)
- **Receber notificações** (futura implementação)

### Como instalar no celular:

**iOS (Safari):**
1. Acesse o site
2. Toque no ícone de compartilhar (quadrado com seta)
3. Selecione "Adicionar à Tela de Início"

**Android (Chrome):**
1. Acesse o site
2. Toque nos 3 pontos do menu
3. Selecione "Instalar app" ou "Adicionar à tela inicial"

---

## 🔗 Domínio Personalizado (Opcional)

Você pode conectar seu próprio domínio:

1. No Firebase Console, vá em **Hosting**
2. Clique em **Adicionar domínio personalizado**
3. Siga as instruções para configurar o DNS

---

## 📊 Custos

**Firebase Hosting - Plano Gratuito (Spark):**
- 10 GB de armazenamento
- 360 MB/dia de transferência (10 GB/mês)
- Domínios .web.app e .firebaseapp.com gratuitos
- SSL gratuito

Para a maioria dos projetos pequenos/médios, o plano gratuito é suficiente!

---

## 🔄 Atualizando o Site

Para atualizar a versão do site após fazer alterações:

```bash
npm run deploy
```

Isso irá:
1. Gerar novo build
2. Fazer upload para o Firebase Hosting
3. O site é atualizado instantaneamente

---

## ✅ Checklist Final

- [ ] Testar localmente com `npm run web`
- [ ] Login no Firebase CLI: `firebase login`
- [ ] Adicionar domínios autorizados no Firebase Console
- [ ] Deploy: `npm run deploy`
- [ ] Testar o site em produção
- [ ] Testar login com Google no site


