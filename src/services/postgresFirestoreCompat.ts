import { getApp, getApps } from "./appCompat";
import { getFunctions, httpsCallable, type Functions } from "./functionsCompat";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = Record<string, any>;
type ArrayUnionValue = { __dbOp: "arrayUnion"; values: any[] };

type WhereOperator =
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

type DbCollectionReference = {
  kind: "collection";
  path: string;
  id: string;
};

type DbDocumentReference = {
  kind: "doc";
  collectionPath: string;
  id: string;
  path: string;
};

type DbQuery = {
  kind: "query";
  collectionPath: string;
  constraints: QueryConstraint[];
};

type OnSnapshotObserver<T> =
  | ((snapshot: T) => void)
  | {
      next?: (snapshot: T) => void;
      error?: (error: Error) => void;
    };

type Unsubscribe = () => void;

type DbGetDocResponse = {
  exists: boolean;
  doc?: JsonObject;
};

type DbGetDocsResponse = {
  docs: Array<{ id: string; data: JsonObject }>;
};

const ACTIVE_POLL_INTERVAL_MS = 3_000;
const BACKGROUND_POLL_INTERVAL_MS = 12_000;
const OFFLINE_POLL_INTERVAL_MS = 20_000;

let functionsInstance: Functions | null = null;
let refreshScheduled = false;

type QueryDocumentChange = {
  type: "added" | "modified" | "removed";
  doc: DbQueryDocumentSnapshot;
  oldIndex: number;
  newIndex: number;
};

type SharedSubscription = {
  key: string;
  source: DbDocumentReference | DbCollectionReference | DbQuery;
  subscribers: Set<{
    next: (snapshot: DbDocumentSnapshot | DbQuerySnapshot) => void;
    error: (error: Error) => void;
  }>;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  lastSignature: string | null;
  lastSnapshot: DbDocumentSnapshot | DbQuerySnapshot | null;
};

const sharedSubscriptions = new Map<string, SharedSubscription>();

function isCollectionReference(value: unknown): value is DbCollectionReference {
  return Boolean(value) && (value as { kind?: unknown }).kind === "collection";
}

function isDocumentReference(value: unknown): value is DbDocumentReference {
  return Boolean(value) && (value as { kind?: unknown }).kind === "doc";
}

function isQuery(value: unknown): value is DbQuery {
  return Boolean(value) && (value as { kind?: unknown }).kind === "query";
}

function getFunctionsInstance(): Functions {
  if (!functionsInstance) {
    if (getApps().length === 0) {
      throw new Error("Firebase app não inicializado");
    }
    functionsInstance = getFunctions(getApp(), "us-central1");
  }
  return functionsInstance;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleActiveSubscriptionRefresh();
    }
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    scheduleActiveSubscriptionRefresh();
  });
}

async function callDatabaseFunction<TInput, TOutput>(name: string, payload: TInput): Promise<TOutput> {
  const callable = httpsCallable<TInput, TOutput>(getFunctionsInstance(), name);
  const result = await callable(payload);
  return result.data;
}

function assertPathSegment(segment: string, fieldName: string): string {
  if (typeof segment !== "string" || segment.trim() === "") {
    throw new Error(`${fieldName} inválido`);
  }
  return segment.trim();
}

function generateId(): string {
  const randomPart = Math.random().toString(36).slice(2, 12);
  const timePart = Date.now().toString(36);
  return `${timePart}${randomPart}`;
}

function splitPath(path: string): string[] {
  return path
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function normalizeCollectionPath(path: string): string {
  const segments = splitPath(path);
  if (segments.length === 0) {
    throw new Error("collection path inválido");
  }
  for (const segment of segments) {
    assertPathSegment(segment, "collection path");
  }
  return segments.join("/");
}

function createCollectionReference(path: string): DbCollectionReference {
  const normalizedPath = normalizeCollectionPath(path);
  const segments = splitPath(normalizedPath);
  return {
    kind: "collection",
    path: normalizedPath,
    id: segments[segments.length - 1],
  };
}

function createDocumentReference(collectionPath: string, docId: string): DbDocumentReference {
  const normalizedCollectionPath = normalizeCollectionPath(collectionPath);
  const normalizedDocId = assertPathSegment(docId, "docId");
  return {
    kind: "doc",
    collectionPath: normalizedCollectionPath,
    id: normalizedDocId,
    path: `${normalizedCollectionPath}/${normalizedDocId}`,
  };
}

function normalizeObserver<T>(
  observerOrNext: OnSnapshotObserver<T>,
  onError?: (error: Error) => void
): {
  next: (snapshot: T) => void;
  error: (error: Error) => void;
} {
  if (typeof observerOrNext === "function") {
    return {
      next: observerOrNext,
      error: onError ?? ((error: Error) => console.error(error)),
    };
  }

  return {
    next: observerOrNext.next ?? (() => {}),
    error: observerOrNext.error ?? onError ?? ((error: Error) => console.error(error)),
  };
}

function serializeSourceKey(
  source: DbDocumentReference | DbCollectionReference | DbQuery
): string {
  if (isDocumentReference(source)) {
    return JSON.stringify({
      kind: source.kind,
      collectionPath: source.collectionPath,
      id: source.id,
    });
  }

  if (isCollectionReference(source)) {
    return JSON.stringify({
      kind: source.kind,
      path: source.path,
    });
  }

  return JSON.stringify({
    kind: source.kind,
    collectionPath: source.collectionPath,
    constraints: source.constraints,
  });
}

function getCurrentPollInterval(): number {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return OFFLINE_POLL_INTERVAL_MS;
  }

  if (
    typeof document !== "undefined" &&
    document.visibilityState === "hidden"
  ) {
    return BACKGROUND_POLL_INTERVAL_MS;
  }

  return ACTIVE_POLL_INTERVAL_MS;
}

function serializeSnapshot(snapshot: DbDocumentSnapshot | DbQuerySnapshot): string {
  if (snapshot instanceof DbDocumentSnapshot) {
    return JSON.stringify({
      id: snapshot.id,
      exists: snapshot.exists(),
      data: snapshot.toComparableValue(),
    });
  }

  return JSON.stringify(
    snapshot.docs.map((item) => ({
      id: item.id,
      data: item.toComparableValue(),
    }))
  );
}

function createInitialChanges(
  docs: DbQueryDocumentSnapshot[]
): QueryDocumentChange[] {
  return docs.map((docItem, index) => ({
    type: "added",
    doc: docItem,
    oldIndex: -1,
    newIndex: index,
  }));
}

function computeQueryChanges(
  previousSnapshot: DbQuerySnapshot | null,
  nextDocs: DbQueryDocumentSnapshot[]
): QueryDocumentChange[] {
  if (!previousSnapshot) {
    return createInitialChanges(nextDocs);
  }

  const previousDocs = previousSnapshot.docs;
  const previousIndexById = new Map<string, number>();
  const nextIndexById = new Map<string, number>();
  const changes: QueryDocumentChange[] = [];

  previousDocs.forEach((docItem, index) => {
    previousIndexById.set(docItem.id, index);
  });

  nextDocs.forEach((docItem, index) => {
    nextIndexById.set(docItem.id, index);
  });

  previousDocs.forEach((docItem, index) => {
    if (!nextIndexById.has(docItem.id)) {
      changes.push({
        type: "removed",
        doc: docItem,
        oldIndex: index,
        newIndex: -1,
      });
    }
  });

  nextDocs.forEach((docItem, index) => {
    const previousIndex = previousIndexById.get(docItem.id);
    if (previousIndex === undefined) {
      changes.push({
        type: "added",
        doc: docItem,
        oldIndex: -1,
        newIndex: index,
      });
      return;
    }

    const previousDoc = previousDocs[previousIndex];
    const previousPayload = JSON.stringify(previousDoc.toComparableValue());
    const nextPayload = JSON.stringify(docItem.toComparableValue());

    if (previousPayload !== nextPayload || previousIndex !== index) {
      changes.push({
        type: "modified",
        doc: docItem,
        oldIndex: previousIndex,
        newIndex: index,
      });
    }
  });

  return changes;
}

function withQueryChanges(
  nextSnapshot: DbQuerySnapshot,
  previousSnapshot: DbQuerySnapshot | null
): DbQuerySnapshot {
  return new DbQuerySnapshot(
    nextSnapshot.docs,
    computeQueryChanges(previousSnapshot, nextSnapshot.docs)
  );
}

function cloneForInitialDelivery(
  snapshot: DbDocumentSnapshot | DbQuerySnapshot
): DbDocumentSnapshot | DbQuerySnapshot {
  if (snapshot instanceof DbDocumentSnapshot) {
    return snapshot;
  }

  return new DbQuerySnapshot(snapshot.docs, createInitialChanges(snapshot.docs));
}

function normalizeDocumentData(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as JsonObject;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

class DbDocumentSnapshot {
  public readonly id: string;
  private readonly payload: JsonObject | undefined;

  constructor(id: string, payload: JsonObject | undefined) {
    this.id = id;
    this.payload = payload;
  }

  exists(): boolean {
    return this.payload !== undefined;
  }

  data(): JsonObject | undefined {
    if (!this.payload) {
      return undefined;
    }
    return cloneJson(this.payload);
  }

  toComparableValue(): JsonObject | undefined {
    return this.payload;
  }
}

class DbQueryDocumentSnapshot {
  public readonly id: string;
  private readonly payload: JsonObject;

  constructor(id: string, payload: JsonObject) {
    this.id = id;
    this.payload = payload;
  }

  data(): JsonObject {
    return cloneJson(this.payload);
  }

  toComparableValue(): JsonObject {
    return this.payload;
  }
}

class DbQuerySnapshot {
  public readonly docs: DbQueryDocumentSnapshot[];
  public readonly size: number;
  public readonly empty: boolean;
  private readonly changes: QueryDocumentChange[];

  constructor(
    docs: DbQueryDocumentSnapshot[],
    changes: QueryDocumentChange[] = []
  ) {
    this.docs = docs;
    this.size = docs.length;
    this.empty = docs.length === 0;
    this.changes = changes;
  }

  forEach(callback: (doc: DbQueryDocumentSnapshot) => void): void {
    this.docs.forEach(callback);
  }

  docChanges(): QueryDocumentChange[] {
    return this.changes.slice();
  }
}

function getCollectionPathFromSource(source: DbCollectionReference | DbQuery): string {
  return source.kind === "collection" ? source.path : source.collectionPath;
}

async function fetchSnapshot(source: DbDocumentReference | DbCollectionReference | DbQuery): Promise<DbDocumentSnapshot | DbQuerySnapshot> {
  if (isDocumentReference(source)) {
    return getDoc(source);
  }

  return getDocs(source);
}

function scheduleSharedPoll(shared: SharedSubscription): void {
  if (shared.subscribers.size === 0) {
    return;
  }

  if (shared.timer) {
    clearTimeout(shared.timer);
  }

  shared.timer = setTimeout(() => {
    void pollSharedSubscription(shared);
  }, getCurrentPollInterval());
}

function notifySharedSubscribers(
  shared: SharedSubscription,
  snapshot: DbDocumentSnapshot | DbQuerySnapshot
): void {
  shared.subscribers.forEach((subscriber) => {
    try {
      subscriber.next(snapshot);
    } catch (error: unknown) {
      subscriber.error(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  });
}

async function pollSharedSubscription(shared: SharedSubscription): Promise<void> {
  if (shared.inFlight || shared.subscribers.size === 0) {
    scheduleSharedPoll(shared);
    return;
  }

  shared.inFlight = true;
  try {
    const rawSnapshot = await fetchSnapshot(shared.source);
    const nextSnapshot =
      rawSnapshot instanceof DbQuerySnapshot
        ? withQueryChanges(
            rawSnapshot,
            shared.lastSnapshot instanceof DbQuerySnapshot
              ? shared.lastSnapshot
              : null
          )
        : rawSnapshot;
    const signature = serializeSnapshot(nextSnapshot);

    if (signature !== shared.lastSignature) {
      shared.lastSignature = signature;
      shared.lastSnapshot = nextSnapshot;
      notifySharedSubscribers(shared, nextSnapshot);
    }
  } catch (error: unknown) {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));
    shared.subscribers.forEach((subscriber) => {
      subscriber.error(normalizedError);
    });
  } finally {
    shared.inFlight = false;
    scheduleSharedPoll(shared);
  }
}

function getOrCreateSharedSubscription(
  source: DbDocumentReference | DbCollectionReference | DbQuery
): SharedSubscription {
  const key = serializeSourceKey(source);
  const existing = sharedSubscriptions.get(key);
  if (existing) {
    return existing;
  }

  const shared: SharedSubscription = {
    key,
    source,
    subscribers: new Set(),
    timer: null,
    inFlight: false,
    lastSignature: null,
    lastSnapshot: null,
  };

  sharedSubscriptions.set(key, shared);
  return shared;
}

function releaseSharedSubscription(shared: SharedSubscription): void {
  if (shared.subscribers.size > 0) {
    return;
  }

  if (shared.timer) {
    clearTimeout(shared.timer);
    shared.timer = null;
  }

  sharedSubscriptions.delete(shared.key);
}

function scheduleActiveSubscriptionRefresh(): void {
  if (refreshScheduled) {
    return;
  }

  refreshScheduled = true;
  setTimeout(() => {
    refreshScheduled = false;
    sharedSubscriptions.forEach((shared) => {
      void pollSharedSubscription(shared);
    });
  }, 0);
}

function normalizeData(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Dados inválidos: esperado objeto");
  }
  return value as JsonObject;
}

function toBackendConstraints(constraints: QueryConstraint[]): QueryConstraint[] {
  return constraints.map((constraint) => {
    if (constraint.type === "limit") {
      return {
        type: "limit",
        value: Math.max(1, Math.floor(constraint.value)),
      };
    }
    return constraint;
  });
}

export function getFirestore(_app?: unknown): { kind: "postgres-firestore" } {
  return { kind: "postgres-firestore" };
}

export function collection(_db: unknown, ...pathSegments: string[]): DbCollectionReference {
  if (pathSegments.length === 0) {
    throw new Error("collection requer path");
  }
  const fullPath = pathSegments.map((segment) => assertPathSegment(segment, "collection path")).join("/");
  return createCollectionReference(fullPath);
}

export function doc(
  reference: unknown,
  ...pathSegments: string[]
): DbDocumentReference {
  if (isCollectionReference(reference)) {
    if (pathSegments.length > 1) {
      throw new Error("doc(collectionRef, id) aceita apenas um ID opcional");
    }
    const docId = pathSegments[0] ? assertPathSegment(pathSegments[0], "docId") : generateId();
    return createDocumentReference(reference.path, docId);
  }

  if (isDocumentReference(reference)) {
    if (pathSegments.length !== 2) {
      throw new Error("doc(docRef, collection, id) requer dois segmentos");
    }
    const [subCollection, subDocId] = pathSegments;
    const nestedCollectionPath = `${reference.path}/${assertPathSegment(subCollection, "collection")}`;
    return createDocumentReference(nestedCollectionPath, assertPathSegment(subDocId, "docId"));
  }

  if (pathSegments.length < 2 || pathSegments.length % 2 !== 0) {
    throw new Error("doc(db, collection, id, ...) requer número par de segmentos");
  }

  const fullPath = pathSegments.map((segment) => assertPathSegment(segment, "path segment")).join("/");
  const segments = splitPath(fullPath);
  const docId = segments[segments.length - 1];
  const collectionPath = segments.slice(0, -1).join("/");
  return createDocumentReference(collectionPath, docId);
}

export function where(field: string, op: WhereOperator, value: unknown): QueryConstraint {
  return {
    type: "where",
    field,
    op,
    value,
  };
}

export function orderBy(field: string, direction: "asc" | "desc" = "asc"): QueryConstraint {
  return {
    type: "orderBy",
    field,
    direction,
  };
}

export function limit(value: number): QueryConstraint {
  return {
    type: "limit",
    value,
  };
}

export function query(
  source: DbCollectionReference | DbQuery,
  ...constraints: QueryConstraint[]
): DbQuery {
  if (isQuery(source)) {
    return {
      kind: "query",
      collectionPath: source.collectionPath,
      constraints: [...source.constraints, ...constraints],
    };
  }

  return {
    kind: "query",
    collectionPath: source.path,
    constraints: [...constraints],
  };
}

export async function getDoc(reference: DbDocumentReference): Promise<DbDocumentSnapshot> {
  const response = await callDatabaseFunction<
    { collection: string; docId: string },
    DbGetDocResponse
  >("dbGetDoc", {
    collection: reference.collectionPath,
    docId: reference.id,
  });

  if (!response.exists) {
    return new DbDocumentSnapshot(reference.id, undefined);
  }

  return new DbDocumentSnapshot(reference.id, normalizeDocumentData(response.doc));
}

export async function getDocs(source: DbCollectionReference | DbQuery): Promise<DbQuerySnapshot> {
  const collectionPath = getCollectionPathFromSource(source);
  const constraints = isQuery(source) ? source.constraints : [];

  const response = await callDatabaseFunction<
    { collection: string; constraints: QueryConstraint[] },
    DbGetDocsResponse
  >("dbGetDocs", {
    collection: collectionPath,
    constraints: toBackendConstraints(constraints),
  });

  const docs = response.docs.map(
    (item) => new DbQueryDocumentSnapshot(item.id, normalizeDocumentData(item.data))
  );
  return new DbQuerySnapshot(docs);
}

export async function setDoc(
  reference: DbDocumentReference,
  data: JsonObject,
  options?: { merge?: boolean }
): Promise<void> {
  const payload = normalizeData(data);
  await callDatabaseFunction<
    { collection: string; docId: string; data: JsonObject; merge: boolean },
    { success: boolean }
  >("dbSetDoc", {
    collection: reference.collectionPath,
    docId: reference.id,
    data: payload,
    merge: options?.merge === true,
  });
  scheduleActiveSubscriptionRefresh();
}

export async function updateDoc(reference: DbDocumentReference, data: JsonObject): Promise<void> {
  const payload = normalizeData(data);
  await callDatabaseFunction<
    { collection: string; docId: string; data: JsonObject },
    { success: boolean }
  >("dbUpdateDoc", {
    collection: reference.collectionPath,
    docId: reference.id,
    data: payload,
  });
  scheduleActiveSubscriptionRefresh();
}

export async function deleteDoc(reference: DbDocumentReference): Promise<void> {
  await callDatabaseFunction<
    { collection: string; docId: string },
    { success: boolean }
  >("dbDeleteDoc", {
    collection: reference.collectionPath,
    docId: reference.id,
  });
  scheduleActiveSubscriptionRefresh();
}

export function onSnapshot(
  source: DbDocumentReference,
  observerOrNext: OnSnapshotObserver<DbDocumentSnapshot>,
  onError?: (error: Error) => void
): Unsubscribe;
export function onSnapshot(
  source: DbCollectionReference | DbQuery,
  observerOrNext: OnSnapshotObserver<DbQuerySnapshot>,
  onError?: (error: Error) => void
): Unsubscribe;
export function onSnapshot(
  source: DbDocumentReference | DbCollectionReference | DbQuery,
  observerOrNext: OnSnapshotObserver<DbDocumentSnapshot> | OnSnapshotObserver<DbQuerySnapshot>,
  onError?: (error: Error) => void
): Unsubscribe {
  const observer = normalizeObserver(
    observerOrNext as OnSnapshotObserver<DbDocumentSnapshot | DbQuerySnapshot>,
    onError
  );
  const shared = getOrCreateSharedSubscription(source);
  const subscriber = {
    next: observer.next,
    error: observer.error,
  };

  shared.subscribers.add(subscriber);

  if (shared.lastSnapshot) {
    observer.next(cloneForInitialDelivery(shared.lastSnapshot));
  } else {
    void pollSharedSubscription(shared);
  }

  return () => {
    shared.subscribers.delete(subscriber);
    releaseSharedSubscription(shared);
  };
}

export function arrayUnion(...values: unknown[]): ArrayUnionValue {
  return {
    __dbOp: "arrayUnion",
    values,
  };
}

export class Timestamp {
  private readonly milliseconds: number;

  constructor(seconds: number, nanoseconds: number = 0) {
    this.milliseconds = seconds * 1_000 + Math.floor(nanoseconds / 1_000_000);
  }

  static now(): Timestamp {
    return Timestamp.fromMillis(Date.now());
  }

  static fromDate(date: Date): Timestamp {
    return Timestamp.fromMillis(date.getTime());
  }

  static fromMillis(milliseconds: number): Timestamp {
    const seconds = Math.floor(milliseconds / 1_000);
    const remainder = milliseconds % 1_000;
    return new Timestamp(seconds, remainder * 1_000_000);
  }

  toDate(): Date {
    return new Date(this.milliseconds);
  }

  toMillis(): number {
    return this.milliseconds;
  }

  valueOf(): string {
    return this.milliseconds.toString();
  }
}


