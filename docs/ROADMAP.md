# ROADMAP — CDMF (Centro de Danças Marcelo Ferreira)

> Este arquivo consolida **tudo o que já foi feito até agora** no app **cdmf** (Expo + React Native) e **o que falta implementar**, em ordem lógica para evitar retrabalho.

**Objetivo do app:**  
- **Aluno:** ver aulas, pagamentos, conta (dados pessoais, políticas, sair), suporte/links.  
- **Professor:** ver turmas, administrar presença/faltas, tarefas administrativas não sensíveis.  
- **Master/Admin:** acesso completo (principalmente **Financeiro** e **gestão total**) + **criação de perfis de professores**.

---

## 1) Stack e decisões do projeto

### 1.1 Tecnologias
- Expo + React Native + TypeScript
- React Navigation (Stack + Tabs)
- Firebase
  - Auth (Email/Senha) — já configurado
  - Firestore — já criado/configurado

### 1.2 Regras de acesso (papéis)
- `student`: acesso somente às áreas de aluno e aos próprios dados.
- `teacher`: acesso limitado (turmas/presença/faltas/admin leve).
- `master`: acesso total (inclui financeiro e criação de professores).
- **Importante:** criação de professor **não deve acontecer no app** (cliente), e sim via **backend/Cloud Functions** (segurança).

### 1.3 Padrão visual (Figma)
- Barra superior **preta**, com linha roxa abaixo, e título (ex.: “Olá, Caio” / “Olá, Marcelo”).
- Tabs na parte inferior.
- Layout padronizado com componentes reutilizáveis (Header, SectionHeader, Cards, Accordions).

---

## 2) O que já foi feito ✅

### 2.1 Estrutura do app e navegação
- Projeto Expo TS criado e rodando.
- Estrutura `src/` organizada (screens / components / navigation / theme).
- Navegação separada por perfil:
  - **AuthStack**: telas de autenticação (seleção aluno/professor, login/cadastro).
  - **StudentTabs**: Home / Aulas / Pagamentos / Conta.
  - **TeacherTabs**: Início / Turmas / Financeiro / Gestão de Pessoal.

### 2.2 Telas do Aluno (UI base conforme Figma)
- **Home do aluno**: “Olá, Nome” + seção “Suas Aulas” + seção “Pagamentos”.
- **Aulas**: lista de aulas + blocos de contato/Instagram (parte de links pode depender do `Linking`).
- **Pagamentos**: lista de mensalidades (pago/pendente) + seção suporte.
- **Conta do aluno**: layout com **gradient**, dados do aluno e botões (dados pessoais, políticas, sair).

### 2.3 Telas do Professor/Admin (UI base conforme Figma)
- **Home do professor**: “Olá, Nome” + atalhos de módulos.
- **Turmas**: lista em formato accordion (expansível), com:
  - Cabeçalho compacto (nome/dia/horário + qtd alunos)
  - Corpo com detalhes
  - Botões: **Mais detalhes / Gerenciar / Deletar**
  - Ajustes de fonte e truncamento para caber nomes longos (ex.: “Samba de Gafieira”).

### 2.4 Gestão de Pessoal (Alunos + Professores)
- Renomeado para **“Gestão de Pessoal”**.
- Listagens separadas (Alunos / Professores).
- Estilo/layout padronizado igual ao de Turmas (compacto e escalável).

### 2.5 Financeiro (base)
- Tela base de Financeiro criada (ainda **sem dados reais**).
- Escopo definido: **apenas master** deve enxergar/usar de verdade.

### 2.6 Correções técnicas que já apareceram e foram resolvidas
- Erros de React Navigation / tipagem (`navigate`, `useNavigation`, ParamList).
- Avisos de ciclos de import (“Require cycle”) — planejada refatoração para mover contexto pra arquivo próprio.
- Dependências/erros tipo `expo-linking` quando usados links.

### 2.7 Firebase (Passo 1 concluído ✅)
- Projeto Firebase criado.
- Firestore criado/configurado.
- `firebaseConfig` já inserido no `firebase.ts`.
- Auth habilitado (Email/Senha).

> Observação importante: nunca poste seu `firebaseConfig` público em lugares abertos. Ele não é “senha”, mas ajuda terceiros a apontarem para seu projeto.

---

## 3) O que ainda está mockado (não real)
- Aulas, pagamentos e turmas ainda usam **dados falsos** (arrays locais).
- Botões ainda executam navegação/ações “de mentira” (sem persistência).
- “Financeiro” ainda sem Firestore e sem regras reais de acesso.
- Login/Cadastro ainda não finalizados com comportamento “100% produção” (perfil/role no Firestore, regras, Google).

---

## 4) O que falta implementar 🔜 (ordem recomendada)

> **Ordem pensada para evitar retrabalho**: primeiro Auth + perfis + regras; depois substituir mocks por Firestore; depois módulos mais “pesados”.

### 4.1 Firebase Auth no app (passo 2 do fluxo)
#### 4.1.1 Persistência do login (corrigir warning do AsyncStorage)
- Instalar AsyncStorage:
  - `npx expo install @react-native-async-storage/async-storage`
- Ajustar inicialização do Auth no `firebase.ts` usando `initializeAuth` + `getReactNativePersistence`.

✅ Meta: fechar e abrir o app e continuar logado.

#### 4.1.2 Cadastro do aluno (Email/Senha) + criação de perfil
- Ao criar conta no Auth:
  - criar documento `profiles/{uid}` no Firestore com:
    - `role: "student"`
    - `name`, `surname`, `email` (e outros campos)
    - `createdAt`
- Login deve:
  - autenticar no Auth
  - carregar `profiles/{uid}`
  - direcionar para a navegação correta (StudentTabs / TeacherTabs / MasterTabs)

#### 4.1.3 Reset de senha
- “Esqueceu sua senha?” => `sendPasswordResetEmail`.

### 4.2 Papéis e segurança (essencial)
#### 4.2.1 Regras do Firestore (Rules)
- Impedir que usuário altere `role` no próprio profile.
- `student`: só lê/escreve seus dados + dados necessários (ex.: turmas em que está matriculado).
- `teacher`: lê turmas atribuídas + escreve presença/faltas.
- `master`: lê/escreve tudo (principalmente financeiro).

> Sem isso, qualquer pessoa logada poderia acessar/alterar dados sensíveis.

#### 4.2.2 Master/Admin
- Criar (manual) um usuário master e definir role:
  - opção simples (MVP): campo `role: "master"` no `profiles/{uid}` (com Rules fortes).
  - opção robusta: Custom Claims (recomendado mais adiante).

### 4.3 Professores (somente master cria)
- **Não criar professor pelo app do professor/aluno.**
- Implementar criação via **Cloud Functions (Admin SDK)**:
  - `createTeacher(email, name, ...)` => cria Auth + cria profile `role:"teacher"`
- Criar uma tela “Criar Professor” acessível somente ao master.

### 4.4 Google Sign-In (aluno e/ou professor)
- Habilitar Google no Firebase Auth.
- Implementar login com Google no app.
- Observação: pode exigir **EAS Dev Build** (fora do Expo Go) dependendo do método adotado.

#### 4.4.1 Package name (Android)

O **Package name** usado no Android está definido em `app.json`:

- `expo.android.package`: `com.cdmf.app`

Esse valor é exatamente o que o Google pede ao criar o OAuth Client ID do tipo **Android**.

#### 4.4.2 SHA-1 (recomendado: EAS Dev Build)

Para obter o SHA-1 do keystore do app (e ter um Google Login estável no Android), o caminho recomendado é via **EAS Dev Build**:

- Instalar EAS CLI:
  - `npm i -g eas-cli`
- Login:
  - `eas login`
- Configurar EAS no projeto:
  - `eas build:configure`
- Ver credenciais e copiar o SHA-1:
  - `eas credentials -p android`

Com **package name + SHA-1**, crie o OAuth Client ID Android no Google Cloud. Depois, coloque o Client ID em:

- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`

### 4.5 Substituir mocks por Firestore (dados reais)
#### 4.5.1 Modelagem base (v1)
- `profiles/{uid}`: perfil + role
- `classes/{classId}`: turmas (dia, horário, professorId, lista de alunos/matrículas)
- `enrollments/{id}` ou `classes/{classId}/students/{uid}` (definir a melhor)
- `payments/{paymentId}`: mensalidades e status (por aluno)
- `attendance/{classId}/dates/{date}`: presença/faltas por dia

#### 4.5.2 Turmas
- Listar turmas do Firestore:
  - master vê todas
  - teacher vê apenas as atribuídas
- Criar/Editar/Excluir turmas (master)
- “Gerenciar” abre detalhes + lista de alunos + presença.

#### 4.5.3 Presença e faltas (teacher)
- Tela de chamada por turma:
  - escolher data
  - listar alunos
  - marcar presente/falta
  - salvar no Firestore

#### 4.5.4 Pagamentos do aluno
- Listar mensalidades reais e status.
- Detalhes do pagamento.
- Futuro: PIX (integração).

### 4.6 Financeiro (master-only)
- Visão geral do mês:
  - entradas (mensalidades pagas)
  - pendências (em aberto)
  - despesas (fixas/variáveis)
- Lançamentos manuais (despesa/receita).
- Relatórios simples:
  - por mês, por categoria, por turma/estilo (futuro)

---

## 5) Próximos marcos (checkpoints)

### Marco A — Autenticação real + perfil
- [ ] AsyncStorage no Auth
- [ ] Cadastro aluno grava profile
- [ ] Login roteia por role
- [ ] Reset de senha

### Marco B — Segurança (Rules) + Master
- [ ] Rules do Firestore
- [ ] Master definido e restrições aplicadas

### Marco C — Professores via Admin/Cloud Function
- [ ] Cloud Function de criação
- [ ] Tela master para criar professor

### Marco D — Dados reais (Firestore substitui mocks)
- [ ] Turmas reais
- [ ] Matrículas reais
- [ ] Pagamentos reais

### Marco E — Presença/Faltas
- [ ] Chamada por turma/data
- [ ] Relatórios básicos

### Marco F — Financeiro real (master)
- [ ] Transações reais
- [ ] Visão geral
- [ ] Relatórios

### Marco G — Google Sign-In (opcional no MVP)
- [ ] Firebase Google
- [ ] Login Google no app

---

## 6) Checklist rápido

### Feito ✅
- [x] UI principal aluno (Home/Aulas/Pagamentos/Conta)
- [x] UI principal professor (Home/Turmas/Gestão de Pessoal/Financeiro base)
- [x] Accordions de turmas finalizados
- [x] Gestão de Pessoal no mesmo padrão de Turmas
- [x] Firebase criado e config no projeto

### Próximo 🔜 (passo 2)
- [ ] Corrigir persistência do Firebase Auth com AsyncStorage
- [ ] Finalizar login/cadastro com Firebase + profile no Firestore
- [ ] Implementar roles com Rules
- [ ] Definir master e criação de professores via Cloud Function

---

**Última atualização:** 2025-12-30
