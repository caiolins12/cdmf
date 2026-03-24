import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireRole } from "../../server/auth";
import { query } from "../../server/db";
import type { JsonObject } from "../../server/db";

export const config = {
  maxDuration: 60,
};

const MAX_OPEN_MS = 55_000;
const POLL_INTERVAL_MS = 1_500;
const HEARTBEAT_INTERVAL_MS = 20_000;

function toMs(ts: Date | string): number {
  return new Date(ts).getTime();
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Auth
  try {
    await requireRole(req as any, ["master"]);
  } catch {
    res.status(401).end();
    return;
  }

  const sinceParam = parseInt((req.query.since as string) || "0", 10);
  const sinceMs = sinceParam > 0 ? sinceParam : Date.now() - 60_000;
  const type = (req.query.type as string) || "conversations";
  const conversationId = req.query.conversationId as string | undefined;

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let closed = false;
  let lastSinceMs = sinceMs;

  const send = (event: string, data: object) => {
    if (closed) return;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      closed = true;
    }
  };

  const cleanup = (pollId: ReturnType<typeof setInterval>, heartbeatId: ReturnType<typeof setInterval>, closeId: ReturnType<typeof setTimeout>) => {
    closed = true;
    clearInterval(pollId);
    clearInterval(heartbeatId);
    clearTimeout(closeId);
  };

  if (type === "conversations") {
    // Initial: full conversations list
    try {
      const result = await query<{ doc_id: string; data: JsonObject; updated_at: Date }>(
        `SELECT doc_id, data, updated_at FROM app_documents
         WHERE collection_name = 'whatsapp_conversations'
         ORDER BY (data->>'lastMessageAt')::bigint DESC NULLS LAST
         LIMIT 100`,
        []
      );
      const conversations = result.rows.map((r) => ({ id: r.doc_id, ...r.data }));
      if (result.rows.length > 0) {
        lastSinceMs = Math.max(...result.rows.map((r) => toMs(r.updated_at)));
      }
      send("conversations_init", { conversations });
    } catch (e) {
      console.error("[SSE] init conversations:", e);
      send("conversations_init", { conversations: [] });
    }

    // Poll for updates
    const poll = async () => {
      if (closed) return;
      try {
        const result = await query<{ doc_id: string; data: JsonObject; updated_at: Date }>(
          `SELECT doc_id, data, updated_at FROM app_documents
           WHERE collection_name = 'whatsapp_conversations'
             AND updated_at > to_timestamp($1 / 1000.0)
           ORDER BY updated_at ASC LIMIT 50`,
          [lastSinceMs]
        );
        if (result.rows.length > 0) {
          const conversations = result.rows.map((r) => ({ id: r.doc_id, ...r.data }));
          lastSinceMs = Math.max(...result.rows.map((r) => toMs(r.updated_at)));
          send("conversations_update", { conversations });
        }
      } catch (e) {
        console.error("[SSE] poll conversations:", e);
      }
    };

    const pollId = setInterval(poll, POLL_INTERVAL_MS);
    const heartbeatId = setInterval(() => send("heartbeat", { ts: Date.now() }), HEARTBEAT_INTERVAL_MS);
    const closeId = setTimeout(() => {
      send("reconnect", { since: lastSinceMs });
      cleanup(pollId, heartbeatId, closeId);
      res.end();
    }, MAX_OPEN_MS);

    req.on("close", () => cleanup(pollId, heartbeatId, closeId));
    req.on("error", () => cleanup(pollId, heartbeatId, closeId));

  } else if (type === "messages" && conversationId) {
    // Initial: full message list for this conversation
    try {
      const result = await query<{ doc_id: string; data: JsonObject; updated_at: Date }>(
        `SELECT doc_id, data, updated_at FROM app_documents
         WHERE collection_name = 'whatsapp_messages'
           AND data->>'conversationId' = $1
         ORDER BY (data->>'timestamp')::bigint ASC NULLS LAST
         LIMIT 100`,
        [conversationId]
      );
      const messages = result.rows.map((r) => ({ id: r.doc_id, ...r.data }));
      if (result.rows.length > 0) {
        lastSinceMs = Math.max(...result.rows.map((r) => toMs(r.updated_at)));
      }
      send("messages_init", { messages, conversationId });
    } catch (e) {
      console.error("[SSE] init messages:", e);
      send("messages_init", { messages: [], conversationId });
    }

    // Poll for new messages
    const poll = async () => {
      if (closed) return;
      try {
        const result = await query<{ doc_id: string; data: JsonObject; updated_at: Date }>(
          `SELECT doc_id, data, updated_at FROM app_documents
           WHERE collection_name = 'whatsapp_messages'
             AND data->>'conversationId' = $1
             AND updated_at > to_timestamp($2 / 1000.0)
           ORDER BY (data->>'timestamp')::bigint ASC NULLS LAST
           LIMIT 100`,
          [conversationId, lastSinceMs]
        );
        if (result.rows.length > 0) {
          const messages = result.rows.map((r) => ({ id: r.doc_id, ...r.data }));
          lastSinceMs = Math.max(...result.rows.map((r) => toMs(r.updated_at)));
          send("messages_new", { messages, conversationId });
        }
      } catch (e) {
        console.error("[SSE] poll messages:", e);
      }
    };

    const pollId = setInterval(poll, POLL_INTERVAL_MS);
    const heartbeatId = setInterval(() => send("heartbeat", { ts: Date.now() }), HEARTBEAT_INTERVAL_MS);
    const closeId = setTimeout(() => {
      send("reconnect", { since: lastSinceMs });
      cleanup(pollId, heartbeatId, closeId);
      res.end();
    }, MAX_OPEN_MS);

    req.on("close", () => cleanup(pollId, heartbeatId, closeId));
    req.on("error", () => cleanup(pollId, heartbeatId, closeId));

  } else {
    res.status(400).end();
  }
}
