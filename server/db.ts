import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { ApiError, toApiError } from "./errors";
import { maybeEnv } from "./http";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = Record<string, any>;

let pool: Pool | null = null;
let poolConnectionString = "";
let schemaReady = false;
let schemaPromise: Promise<void> | null = null;

function getConnectionString(): string {
  const connectionString = maybeEnv("DATABASE_URL");
  if (!connectionString) {
    throw new ApiError(500, "failed-precondition", "DATABASE_URL nao configurada");
  }
  return connectionString;
}

function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    ssl: connectionString.includes("localhost")
      ? false
      : {
          rejectUnauthorized: false,
        },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export function getPool(): Pool {
  const connectionString = getConnectionString();
  if (!pool || poolConnectionString !== connectionString) {
    pool = createPool(connectionString);
    poolConnectionString = connectionString;
    schemaReady = false;
    schemaPromise = null;
  }
  return pool;
}

async function ensureSchema(poolInstance: Pool): Promise<void> {
  if (schemaReady) {
    return;
  }

  if (!schemaPromise) {
    schemaPromise = (async () => {
      await poolInstance.query(`
        CREATE TABLE IF NOT EXISTS app_documents (
          collection_name TEXT NOT NULL,
          doc_id TEXT NOT NULL,
          data JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (collection_name, doc_id)
        );
      `);

      await poolInstance.query(`
        CREATE INDEX IF NOT EXISTS idx_app_documents_collection_updated
        ON app_documents (collection_name, updated_at DESC);
      `);

      await poolInstance.query(`
        CREATE INDEX IF NOT EXISTS idx_app_documents_data_gin
        ON app_documents
        USING GIN (data);
      `);

      await poolInstance.query(`
        CREATE TABLE IF NOT EXISTS auth_users (
          uid TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT,
          display_name TEXT,
          photo_url TEXT,
          phone_number TEXT,
          provider TEXT NOT NULL DEFAULT 'password',
          google_sub TEXT UNIQUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await poolInstance.query(`
        CREATE TABLE IF NOT EXISTS auth_sessions (
          session_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES auth_users(uid) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL,
          user_agent TEXT,
          ip_address TEXT
        );
      `);

      await poolInstance.query(`
        CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id
        ON auth_sessions (user_id);
      `);

      await poolInstance.query(`
        CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at
        ON auth_sessions (expires_at);
      `);

      schemaReady = true;
    })().catch((error: unknown) => {
      schemaPromise = null;
      throw error;
    });
  }

  await schemaPromise;
}

type TablePresenceRow = {
  app_documents: boolean;
  auth_users: boolean;
  auth_sessions: boolean;
};

export type DatabaseHealth = {
  ok: boolean;
  driver: "pg";
  envConfigured: boolean;
  schema: {
    appDocuments: boolean;
    authUsers: boolean;
    authSessions: boolean;
  };
  error?: {
    code: string;
    message: string;
  };
};

async function getTablePresence(poolInstance: Pool): Promise<TablePresenceRow> {
  const result = await poolInstance.query<TablePresenceRow>(`
    SELECT
      to_regclass('public.app_documents') IS NOT NULL AS app_documents,
      to_regclass('public.auth_users') IS NOT NULL AS auth_users,
      to_regclass('public.auth_sessions') IS NOT NULL AS auth_sessions
  `);

  return (
    result.rows[0] ?? {
      app_documents: false,
      auth_users: false,
      auth_sessions: false,
    }
  );
}

export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      driver: "pg",
      envConfigured: false,
      schema: {
        appDocuments: false,
        authUsers: false,
        authSessions: false,
      },
      error: {
        code: "failed-precondition",
        message: "DATABASE_URL nao configurada",
      },
    };
  }

  try {
    const poolInstance = getPool();
    await ensureSchema(poolInstance);
    const tables = await getTablePresence(poolInstance);

    return {
      ok: tables.app_documents && tables.auth_users && tables.auth_sessions,
      driver: "pg",
      envConfigured: true,
      schema: {
        appDocuments: tables.app_documents,
        authUsers: tables.auth_users,
        authSessions: tables.auth_sessions,
      },
    };
  } catch (error) {
    const apiError = toApiError(error);
    return {
      ok: false,
      driver: "pg",
      envConfigured: true,
      schema: {
        appDocuments: false,
        authUsers: false,
        authSessions: false,
      },
      error: {
        code: apiError.code,
        message: apiError.message,
      },
    };
  }
}

export async function withDb<T>(handler: (client: Pool | PoolClient) => Promise<T>): Promise<T> {
  const poolInstance = getPool();
  await ensureSchema(poolInstance);
  return handler(poolInstance);
}

export async function withTransaction<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
  const poolInstance = getPool();
  await ensureSchema(poolInstance);
  const client = await poolInstance.connect();

  try {
    await client.query("BEGIN");
    const result = await handler(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  client?: Pool | PoolClient
): Promise<QueryResult<T>> {
  if (client) {
    return client.query<T>(sql, params);
  }
  return withDb((db) => db.query<T>(sql, params));
}

