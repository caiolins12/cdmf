import { createHmac, timingSafeEqual } from "crypto";
import { ApiRequest, ApiResponse, getHeader } from "../../server/http";
import { handleMercadoPagoWebhook } from "../../server/payments";

/**
 * Verifies the Mercado Pago HMAC-SHA256 webhook signature.
 *
 * MP signs every notification with:
 *   x-signature: ts=<timestamp>,v1=<hmac_hex>
 *   x-request-id: <uuid>
 *
 * Signed manifest: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * Secret: process.env.MERCADOPAGO_WEBHOOK_SECRET
 *
 * Returns true  → signature valid (or secret not configured → warn + skip).
 * Returns false → signature invalid → do NOT process the payload.
 */
function verifyMpSignature(
  req: ApiRequest,
  dataId: string | undefined
): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();

  if (!secret) {
    // Secret not configured: log a warning but allow processing so existing
    // deployments aren't broken. Set MERCADOPAGO_WEBHOOK_SECRET to enforce.
    console.warn(
      "[Webhook MP] MERCADOPAGO_WEBHOOK_SECRET não configurado — " +
        "validação de assinatura HMAC ignorada. Configure a variável de ambiente."
    );
    return true;
  }

  const signatureHeader = getHeader(req, "x-signature");
  const requestId = getHeader(req, "x-request-id") ?? "";

  if (!signatureHeader) {
    console.warn("[Webhook MP] Header x-signature ausente — requisição rejeitada.");
    return false;
  }

  // Parse ts and v1 from "ts=<ts>,v1=<hash>"
  let ts = "";
  let v1 = "";
  for (const part of signatureHeader.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key?.trim() === "ts") ts = value?.trim() ?? "";
    if (key?.trim() === "v1") v1 = value?.trim() ?? "";
  }

  if (!ts || !v1) {
    console.warn("[Webhook MP] Header x-signature malformado — requisição rejeitada.");
    return false;
  }

  // Build the signed manifest exactly as Mercado Pago defines it
  const manifest = `id:${dataId ?? ""};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");

  try {
    const expectedBuf = Buffer.from(expected, "hex");
    const receivedBuf = Buffer.from(v1, "hex");
    if (expectedBuf.length !== receivedBuf.length) {
      console.warn("[Webhook MP] Assinatura HMAC inválida — requisição rejeitada.");
      return false;
    }
    const valid = timingSafeEqual(expectedBuf, receivedBuf);
    if (!valid) {
      console.warn("[Webhook MP] Assinatura HMAC inválida — requisição rejeitada.");
    }
    return valid;
  } catch {
    console.warn("[Webhook MP] Erro ao comparar assinatura HMAC — requisição rejeitada.");
    return false;
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  // Mercado Pago envia notificações via POST (body) e também via GET (query params).
  // Sempre responder 200 imediatamente para evitar retries do MP.
  // Depois processar o pagamento somente se a assinatura for válida.

  try {
    // Montar o payload a partir do body OU query params
    let payload: Record<string, any> = {};

    if (req.method === "POST" && req.body && typeof req.body === "object") {
      payload = req.body as Record<string, any>;
    }

    // Mercado Pago também envia dados via query string (ex: ?type=payment&data.id=123)
    const query = (req as any).query || {};
    if (!payload.type && query.type) payload.type = query.type;
    if (!payload.data?.id && query["data.id"]) payload.data = { id: query["data.id"] };
    if (!payload.topic && query.topic) payload.topic = query.topic;
    if (!payload.resource && query.resource) payload.resource = query.resource;
    // Formato query: ?id=123&topic=payment
    if (!payload.data?.id && query.id && query.topic === "payment") {
      payload.data = { id: query.id };
      payload.type = "payment";
    }

    // Validate signature BEFORE responding so we know if this is legitimate.
    // We still respond 200 on failure to avoid MP retrying invalid requests forever.
    const dataId = typeof payload.data?.id === "string" ? payload.data.id
      : payload.data?.id != null ? String(payload.data.id)
      : undefined;

    const signatureValid = verifyMpSignature(req, dataId);

    // Respond 200 immediately (MP requires fast acknowledgment)
    res.status(200).send("OK");

    if (!signatureValid) {
      // Signature failed — do not process
      return;
    }

    // Process payment after responding
    if (payload.type || payload.data?.id || payload.topic || payload.action) {
      await handleMercadoPagoWebhook(payload);
    }
  } catch (error) {
    console.error("[Webhook MP] Erro no handler:", error);
    if (!res.writableEnded) {
      res.status(200).send("OK");
    }
  }
}
