# PostgreSQL Setup

O app persiste dados no PostgreSQL usando a camada compatível em:

- `src/services/postgresFirestoreCompat.ts`
- `server/doc-store.ts`
- `api/rpc/[name].ts`

## Variavel obrigatoria

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
```

## Como funciona

- o frontend continua usando imports de `firebase/firestore`
- o resolver do Metro redireciona esses imports para a camada compativel local
- as operacoes de leitura/escrita chamam `/api/rpc/dbGetDoc`, `/api/rpc/dbGetDocs`, `/api/rpc/dbSetDoc`, `/api/rpc/dbUpdateDoc` e `/api/rpc/dbDeleteDoc`
- os dados ficam na tabela `app_documents` no PostgreSQL
- as tabelas `auth_users` e `auth_sessions` sao criadas automaticamente pela API

## Observacao

O modelo atual mantem compatibilidade de API com Firestore no cliente, mas a infraestrutura agora e 100% Vercel API + PostgreSQL, sem dependencias legadas do Neon e sem Firebase no backend.
