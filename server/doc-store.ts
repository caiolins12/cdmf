import { ApiError } from "./errors";
import { JsonObject, query, withTransaction } from "./db";

export type WhereOperator =
  | "=="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "in"
  | "array-contains"
  | "array-contains-any";

export type QueryConstraint =
  | {
      type: "where";
      field: string;
      op: WhereOperator;
      value: unknown;
    }
  | {
      type: "orderBy";
      field: string;
      direction?: "asc" | "desc";
    }
  | {
      type: "limit";
      value: number;
    };

type ArrayUnionValue = {
  __dbOp: "arrayUnion";
  values: unknown[];
};

export type DocumentRecord = {
  id: string;
  data: JsonObject;
};

export function assertCollectionName(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_/-]+$/.test(value.trim())) {
    throw new ApiError(400, "invalid-argument", "collection invÃ¡lida");
  }
  return value.trim();
}

export function assertDocId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value.trim())) {
    throw new ApiError(400, "invalid-argument", "docId invÃ¡lido");
  }
  return value.trim();
}

export function assertJsonObject(value: unknown, fieldName: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid-argument", `${fieldName} deve ser um objeto`);
  }
  return value as JsonObject;
}

function isPlainObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isArrayUnionValue(value: unknown): value is ArrayUnionValue {
  return (
    isPlainObject(value) &&
    value.__dbOp === "arrayUnion" &&
    Array.isArray((value as ArrayUnionValue).values)
  );
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeObjects(base: JsonObject, patch: JsonObject): JsonObject {
  const result: JsonObject = { ...base };

  for (const [key, patchValue] of Object.entries(patch)) {
    const currentValue = result[key];

    if (isArrayUnionValue(patchValue)) {
      const currentArray = Array.isArray(currentValue) ? [...currentValue] : [];
      for (const value of patchValue.values) {
        if (!currentArray.some((existing) => deepEqual(existing, value))) {
          currentArray.push(value as never);
        }
      }
      result[key] = currentArray;
      continue;
    }

    if (isPlainObject(currentValue) && isPlainObject(patchValue)) {
      result[key] = mergeObjects(currentValue, patchValue);
      continue;
    }

    result[key] = patchValue as JsonObject[keyof JsonObject];
  }

  return result;
}

function sanitizeFieldPath(field: string): string {
  if (field === "id") {
    return field;
  }

  if (typeof field !== "string" || field.trim() === "") {
    throw new ApiError(400, "invalid-argument", "field invÃ¡lido");
  }

  const segments = field.trim().split(".");
  for (const segment of segments) {
    if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
      throw new ApiError(400, "invalid-argument", `field invÃ¡lido: ${field}`);
    }
  }

  return segments.join(",");
}

function textExprForField(field: string): string {
  if (field === "id") {
    return "d.doc_id";
  }
  return `d.data #>> '{${sanitizeFieldPath(field)}}'`;
}

function jsonExprForField(field: string): string {
  if (field === "id") {
    return "to_jsonb(d.doc_id)";
  }
  return `d.data #> '{${sanitizeFieldPath(field)}}'`;
}

function numericExprForField(field: string): string {
  const textExpr = textExprForField(field);
  return `(CASE WHEN ${textExpr} ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (${textExpr})::double precision ELSE NULL END)`;
}

function buildWhereClause(
  constraint: Extract<QueryConstraint, { type: "where" }>,
  params: unknown[]
): string {
  const { field, op, value } = constraint;
  const textExpr = textExprForField(field);
  const jsonExpr = jsonExprForField(field);
  const numericExpr = numericExprForField(field);

  if (op === "array-contains") {
    params.push(JSON.stringify([value]));
    return `COALESCE(${jsonExpr}, '[]'::jsonb) @> $${params.length}::jsonb`;
  }

  if (op === "array-contains-any") {
    if (!Array.isArray(value) || value.length === 0) {
      return "FALSE";
    }

    const clauses: string[] = [];
    for (const item of value) {
      params.push(JSON.stringify([item]));
      clauses.push(`COALESCE(${jsonExpr}, '[]'::jsonb) @> $${params.length}::jsonb`);
    }
    return `(${clauses.join(" OR ")})`;
  }

  if (op === "in") {
    if (!Array.isArray(value) || value.length === 0) {
      return "FALSE";
    }

    const nonNullValues = value.filter((item) => item !== null && item !== undefined);
    const hasNull = nonNullValues.length !== value.length;

    if (nonNullValues.length === 0) {
      return `${jsonExpr} IS NULL`;
    }

    if (nonNullValues.every((item) => typeof item === "number")) {
      params.push(nonNullValues as number[]);
      const clause = `${numericExpr} = ANY($${params.length}::double precision[])`;
      return hasNull ? `(${clause} OR ${jsonExpr} IS NULL)` : clause;
    }

    params.push(nonNullValues.map((item) => String(item)));
    const clause = `${textExpr} = ANY($${params.length}::text[])`;
    return hasNull ? `(${clause} OR ${jsonExpr} IS NULL)` : clause;
  }

  if (value === null || value === undefined) {
    if (op === "==") {
      return `${jsonExpr} IS NULL`;
    }
    if (op === "!=") {
      return `${jsonExpr} IS NOT NULL`;
    }
    throw new ApiError(400, "invalid-argument", `Operador ${op} nÃ£o aceita null`);
  }

  const sqlOp =
    op === "==" ? "=" : op === "!=" ? "<>" : op === ">" ? ">" : op === ">=" ? ">=" : op === "<" ? "<" : "<=";

  if (!sqlOp) {
    throw new ApiError(400, "invalid-argument", `Operador invÃ¡lido: ${op}`);
  }

  if (typeof value === "number") {
    params.push(value);
    return `${numericExpr} ${sqlOp} $${params.length}::double precision`;
  }

  if (typeof value === "boolean") {
    params.push(value);
    return `(${textExpr})::boolean ${sqlOp} $${params.length}::boolean`;
  }

  if (typeof value === "object") {
    params.push(JSON.stringify(value));
    return `${jsonExpr} ${sqlOp} $${params.length}::jsonb`;
  }

  params.push(String(value));
  return `${textExpr} ${sqlOp} $${params.length}::text`;
}

function buildOrderByClause(constraint: Extract<QueryConstraint, { type: "orderBy" }>): string {
  const direction = constraint.direction === "desc" ? "DESC" : "ASC";
  return `${textExprForField(constraint.field)} ${direction}`;
}

export function normalizeConstraints(value: unknown): QueryConstraint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const constraints: QueryConstraint[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || typeof (item as QueryConstraint).type !== "string") {
      continue;
    }

    const raw = item as QueryConstraint;
    if (raw.type === "where") {
      constraints.push({
        type: "where",
        field: raw.field,
        op: raw.op,
        value: raw.value,
      });
      continue;
    }

    if (raw.type === "orderBy") {
      constraints.push({
        type: "orderBy",
        field: raw.field,
        direction: raw.direction === "desc" ? "desc" : "asc",
      });
      continue;
    }

    if (raw.type === "limit") {
      constraints.push({
        type: "limit",
        value: Math.max(1, Math.floor(Number(raw.value) || 100)),
      });
    }
  }

  return constraints;
}

export async function getDocument(collectionName: string, docId: string): Promise<JsonObject | null> {
  const result = await query<{ data: JsonObject }>(
    `
      SELECT data
      FROM app_documents
      WHERE collection_name = $1
        AND doc_id = $2
      LIMIT 1
    `,
    [collectionName, docId]
  );

  return result.rows[0]?.data ?? null;
}

export async function listDocuments(
  collectionName: string,
  constraints: QueryConstraint[] = []
): Promise<DocumentRecord[]> {
  const params: unknown[] = [collectionName];
  const whereClauses: string[] = [];
  const orderByClauses: string[] = [];
  let limitValue: number | null = null;

  for (const constraint of constraints) {
    if (constraint.type === "where") {
      whereClauses.push(buildWhereClause(constraint, params));
    } else if (constraint.type === "orderBy") {
      orderByClauses.push(buildOrderByClause(constraint));
    } else if (constraint.type === "limit") {
      limitValue = constraint.value;
    }
  }

  let sql = `
    SELECT doc_id, data
    FROM app_documents d
    WHERE d.collection_name = $1
  `;

  if (whereClauses.length > 0) {
    sql += ` AND ${whereClauses.join(" AND ")}`;
  }

  if (orderByClauses.length > 0) {
    sql += ` ORDER BY ${orderByClauses.join(", ")}`;
  } else {
    sql += " ORDER BY d.updated_at DESC";
  }

  if (limitValue) {
    params.push(limitValue);
    sql += ` LIMIT $${params.length}`;
  }

  const result = await query<{ doc_id: string; data: JsonObject }>(sql, params);
  return result.rows.map((row: { doc_id: string; data: JsonObject }) => ({ id: row.doc_id, data: row.data }));
}

export async function setDocument(
  collectionName: string,
  docId: string,
  data: JsonObject,
  options?: { merge?: boolean }
): Promise<JsonObject> {
  return withTransaction(async (client) => {
    let finalData = data;

    if (options?.merge) {
      const existing = await query<{ data: JsonObject }>(
        `
          SELECT data
          FROM app_documents
          WHERE collection_name = $1
            AND doc_id = $2
          LIMIT 1
        `,
        [collectionName, docId],
        client
      );
      if (existing.rows.length > 0) {
        finalData = mergeObjects(existing.rows[0].data, data);
      }
    }

    await query(
      `
        INSERT INTO app_documents (collection_name, doc_id, data, created_at, updated_at)
        VALUES ($1, $2, $3::jsonb, NOW(), NOW())
        ON CONFLICT (collection_name, doc_id)
        DO UPDATE
        SET data = EXCLUDED.data,
            updated_at = NOW()
      `,
      [collectionName, docId, JSON.stringify(finalData)],
      client
    );

    return finalData;
  });
}

export async function updateDocument(
  collectionName: string,
  docId: string,
  patch: JsonObject
): Promise<JsonObject> {
  return withTransaction(async (client) => {
    const existing = await query<{ data: JsonObject }>(
      `
        SELECT data
        FROM app_documents
        WHERE collection_name = $1
          AND doc_id = $2
        LIMIT 1
      `,
      [collectionName, docId],
      client
    );

    if (existing.rows.length === 0) {
      throw new ApiError(404, "not-found", "Documento nÃ£o encontrado");
    }

    const finalData = mergeObjects(existing.rows[0].data, patch);
    await query(
      `
        UPDATE app_documents
        SET data = $3::jsonb,
            updated_at = NOW()
        WHERE collection_name = $1
          AND doc_id = $2
      `,
      [collectionName, docId, JSON.stringify(finalData)],
      client
    );

    return finalData;
  });
}

export async function deleteDocument(collectionName: string, docId: string): Promise<void> {
  await query(
    `
      DELETE FROM app_documents
      WHERE collection_name = $1
        AND doc_id = $2
    `,
    [collectionName, docId]
  );
}


