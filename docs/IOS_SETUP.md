# Configuração iOS para CDMF

Este guia descreve os passos necessários para configurar o build iOS do aplicativo CDMF.

## Pré-requisitos

1. **Conta Apple Developer** (para distribuição na App Store)
2. **Mac com Xcode** (para desenvolvimento local) ou usar **EAS Build** (recomendado)
3. **Conta Expo** (para EAS Build)

---

## 1. Configurar Firebase para iOS

### Passo 1: Acessar o Firebase Console

1. Acesse [Firebase Console](https://console.firebase.google.com/)
2. Selecione o projeto **cdmf-d52fa**

### Passo 2: Adicionar App iOS

1. Na página inicial do projeto, clique em **"Adicionar app"**
2. Selecione **iOS** (ícone da Apple)
3. Preencha os dados:
   - **Bundle ID**: `com.cdmf.app`
   - **Nome do app**: `CDMF`
   - **App Store ID**: (deixe em branco por enquanto)
4. Clique em **"Registrar app"**

### Passo 3: Baixar GoogleService-Info.plist

1. Após registrar, baixe o arquivo **GoogleService-Info.plist**
2. Coloque o arquivo na **raiz do projeto** (junto com `google-services.json`)

### Passo 4: Configurar Google Sign-In para iOS

1. No Firebase Console, vá em **Authentication** > **Sign-in method**
2. Clique em **Google**
3. Copie o **iOS Client ID** (será algo como `225551176748-xxxxxxxx.apps.googleusercontent.com`)
4. Atualize o arquivo `src/services/googleSignIn.ts`:
   ```typescript
   const IOS_CLIENT_ID = "SEU_IOS_CLIENT_ID_AQUI.apps.googleusercontent.com";
   ```

---

## 2. Configurar URL Schemes para iOS

O arquivo `app.json` já está configurado com o URL scheme necessário para o Google Sign-In:

```json
{
  "ios": {
    "infoPlist": {
      "CFBundleURLTypes": [
        {
          "CFBundleURLSchemes": [
            "com.googleusercontent.apps.225551176748-SEU_CLIENT_ID"
          ]
        }
      ]
    }
  }
}
```

**Importante**: Atualize o `CFBundleURLSchemes` com o Client ID correto do iOS que você obteve no Firebase.

---

## 3. Fazer Build iOS com EAS

### Opção A: Build para Simulador (Desenvolvimento)

```bash
eas build --platform ios --profile development
```

### Opção B: Build Preview (TestFlight interno)

```bash
eas build --platform ios --profile preview
```

### Opção C: Build de Produção

```bash
eas build --platform ios --profile production
```

---

## 4. Testar no Simulador iOS (Mac necessário)

Se você tiver um Mac com Xcode instalado:

```bash
# Gerar código nativo
npx expo prebuild --platform ios

# Rodar no simulador
npx expo run:ios
```

---

## 5. Configurar Apple Developer Account para Distribuição

### Para TestFlight e App Store:

1. Crie uma conta em [Apple Developer](https://developer.apple.com/)
2. Crie um **App ID** com o bundle identifier `com.cdmf.app`
3. Configure o **Signing & Capabilities**
4. Atualize `eas.json` com suas credenciais:

```json
{
  "submit": {
    "production": {
      "ios": {
        "appleId": "seu-email@apple.com",
        "ascAppId": "SEU_APP_ID"
      }
    }
  }
}
```

---

## Checklist Final

- [ ] `GoogleService-Info.plist` na raiz do projeto
- [ ] iOS Client ID atualizado em `googleSignIn.ts`
- [ ] URL Scheme atualizado em `app.json`
- [ ] Conta Apple Developer configurada (para distribuição)
- [ ] Build testado no simulador ou dispositivo

---

## Comandos Úteis

```bash
# Login no EAS
eas login

# Verificar configuração
eas build:configure

# Build iOS Preview
eas build --platform ios --profile preview

# Build iOS Produção
eas build --platform ios --profile production

# Submeter para App Store
eas submit --platform ios --profile production
```

---

## Troubleshooting

### Erro: "No provisioning profile"
- Certifique-se de ter uma conta Apple Developer válida
- Use `eas credentials` para configurar os certificados

### Erro: "Bundle ID não encontrado"
- Verifique se o Bundle ID no Firebase corresponde ao do `app.json`
- Bundle ID: `com.cdmf.app`

### Google Sign-In não funciona no iOS
- Verifique se o `iosClientId` está correto em `googleSignIn.ts`
- Confirme o URL Scheme no `app.json`

