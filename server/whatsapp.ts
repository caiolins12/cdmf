import { ApiError } from "./errors";
import { JsonObject, query as dbQuery } from "./db";
import { getDocument, listDocuments, setDocument, updateDocument, deleteDocument } from "./doc-store";
import { makeId, sanitizeString } from "./http";
import { checkRateLimit } from "./rate-limit";
import { processChatbotReply, transcribeAudio } from "./chatbot";

// ============================================================
// Evolution API Integration
// ============================================================

function getEvolutionApiUrl(): string {
  const url = process.env.EVOLUTION_API_URL?.trim().replace(/\/+$/, "");
  if (!url) {
    throw new ApiError(500, "failed-precondition", "EVOLUTION_API_URL não configurado");
  }
  return url;
}

function getEvolutionApiKey(): string {
  const key = process.env.EVOLUTION_API_KEY?.trim();
  if (!key) {
    throw new ApiError(500, "failed-precondition", "EVOLUTION_API_KEY não configurado");
  }
  return key;
}

function getEvolutionInstanceName(): string {
  return process.env.EVOLUTION_INSTANCE_NAME?.trim() || "cdmf";
}

type Audience = {
  type: "all_students" | "class" | "event" | "specific_students";
  targetId?: string;
  targetName?: string;
  count?: number;
  studentIds?: string[];
};

/**
 * Normaliza telefone para formato completo: 55 + DDD + 9 dígitos.
 * Lida com variações: +55, 0xx, com/sem nono dígito, parênteses, traços, espaços.
 */
function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");

  // Remover prefixo 0 de discagem interurbana (0xx)
  if (digits.startsWith("0") && !digits.startsWith("00")) {
    digits = digits.slice(1);
  }

  // Remover código país 55 para normalizar
  if (digits.startsWith("55") && digits.length >= 12) {
    digits = digits.slice(2);
  }

  // Se tem 10 dígitos (DDD + 8), adiciona o nono dígito (9) após o DDD
  if (digits.length === 10) {
    const ddd = digits.slice(0, 2);
    const number = digits.slice(2);
    digits = `${ddd}9${number}`;
  }

  // Adicionar código país
  if (digits.length === 11) {
    digits = `55${digits}`;
  } else if (!digits.startsWith("55")) {
    digits = `55${digits}`;
  }

  return digits;
}

function trimDocument<T extends JsonObject>(doc: { id: string; data: T }) {
  return { id: doc.id, ...doc.data };
}

// ============================================================
// Evolution API HTTP helpers
// ============================================================

async function evolutionFetch(path: string, options: RequestInit = {}): Promise<any> {
  const baseUrl = getEvolutionApiUrl();
  const apiKey = getEvolutionApiKey();

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const rawMsg = payload?.response?.message || payload?.message;
    const message = Array.isArray(rawMsg) ? rawMsg.join(", ") : (rawMsg || payload?.error || JSON.stringify(payload) || "Evolution API error");
    throw new ApiError(500, "evolution-api-error", `Evolution API: ${message}`);
  }

  return payload;
}

// ============================================================
// Instance management
// ============================================================

export async function getInstanceStatus(): Promise<{
  connected: boolean;
  state: string;
  instanceName: string;
}> {
  const instance = getEvolutionInstanceName();
  try {
    const data = await evolutionFetch(`/instance/connectionState/${instance}`);
    const state = data?.instance?.state || data?.state || "close";
    return {
      connected: state === "open",
      state,
      instanceName: instance,
    };
  } catch {
    return { connected: false, state: "close", instanceName: instance };
  }
}

function extractInstanceOwnerPhone(instancePayload: any): string | null {
  const owner =
    instancePayload?.instance?.owner ||
    instancePayload?.owner ||
    instancePayload?.instance?.wuid ||
    instancePayload?.wuid;

  if (typeof owner !== "string" || !owner.trim()) {
    return null;
  }

  const phone = owner.replace(/@.*$/, "").replace(/\D/g, "");
  return phone ? normalizePhone(phone) : null;
}

export async function getInstanceContactPhone(): Promise<string | null> {
  const instance = getEvolutionInstanceName();

  try {
    const data = await evolutionFetch(`/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`);
    const instances = Array.isArray(data)
      ? data
      : Array.isArray(data?.response)
        ? data.response
        : Array.isArray(data?.instances)
          ? data.instances
          : [];

    const matchingInstance =
      instances.find((item: any) => item?.instance?.instanceName === instance || item?.instanceName === instance) ||
      instances[0];

    return extractInstanceOwnerPhone(matchingInstance);
  } catch (error) {
    console.warn("[WhatsApp] Nao foi possivel obter o numero conectado da instancia:", (error as Error)?.message || error);
    return null;
  }
}

export async function getQrCode(): Promise<{ qrcode?: string; base64?: string; state: string }> {
  const instance = getEvolutionInstanceName();

  // First check if already connected
  const status = await getInstanceStatus();
  if (status.connected) {
    return { state: "open" };
  }

  try {
    const data = await evolutionFetch(`/instance/connect/${instance}`);
    return {
      qrcode: data?.qrcode?.code || data?.code,
      base64: data?.qrcode?.base64 || data?.base64,
      state: data?.instance?.state || "connecting",
    };
  } catch (error: any) {
    // Instance may not exist, try creating it
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("not found") || msg.includes("not exist") || msg.includes("does not exist") || msg.includes("404")) {
      const created = await createInstance();
      return {
        qrcode: created?.qrcode?.code || created?.code,
        base64: created?.qrcode?.base64 || created?.base64,
        state: "connecting",
      };
    }
    throw error;
  }
}

async function createInstance(): Promise<any> {
  const instance = getEvolutionInstanceName();
  const webhookUrl = process.env.EVOLUTION_WEBHOOK_URL?.trim() || "";

  const body: any = {
    instanceName: instance,
    integration: "WHATSAPP-BAILEYS",
    qrcode: true,
    rejectCall: false,
    groupsIgnore: true,
    alwaysOnline: false,
    readMessages: false,
    readStatus: false,
    syncFullHistory: false,
  };

  if (webhookUrl) {
    body.webhook = {
      url: webhookUrl,
      byEvents: false,
      base64: false,
      events: [
        "MESSAGES_UPSERT",
        "MESSAGES_UPDATE",
        "CONNECTION_UPDATE",
      ],
    };
  }

  return evolutionFetch("/instance/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function logoutInstance(): Promise<{ success: boolean }> {
  const instance = getEvolutionInstanceName();
  await evolutionFetch(`/instance/logout/${instance}`, { method: "DELETE" });
  return { success: true };
}

export async function restartInstance(): Promise<{ success: boolean }> {
  const instance = getEvolutionInstanceName();
  try {
    await evolutionFetch(`/instance/restart/${instance}`, { method: "PUT" });
  } catch {
    // If restart fails, try connect
    await evolutionFetch(`/instance/connect/${instance}`);
  }
  return { success: true };
}

// ============================================================
// Phone OTP via WhatsApp
// ============================================================

async function checkDuplicatePhone(userId: string, normalizedPhone: string): Promise<void> {
  const allStudents = await listDocuments("profiles", [
    { type: "where", field: "role", op: "==", value: "student" },
    { type: "limit", value: 5000 },
  ]);

  const last9 = normalizedPhone.slice(-9);
  const duplicate = allStudents.find((p) => {
    if (p.id === userId) return false;
    if (!p.data) return false;
    const pPhone = typeof p.data.phone === "string" ? normalizePhone(String(p.data.phone)) : "";
    return pPhone.length >= 9 && pPhone.endsWith(last9);
  });

  if (duplicate) {
    throw new ApiError(
      400,
      "already-exists",
      "Este número já está cadastrado em outra conta. Utilize outro número ou entre em contato com o suporte."
    );
  }
}

export async function sendPhoneOtp(userId: string, phone: string): Promise<{ success: boolean }> {
  const normalizedPhone = normalizePhone(phone);

  // Block duplicate phone numbers before even sending the OTP
  await checkDuplicatePhone(userId, normalizedPhone);

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  // Overwrite any previous OTP for this user
  await setDocument("phone_otps", userId, {
    userId,
    phone: normalizedPhone,
    code,
    expiresAt,
    used: false,
    createdAt: Date.now(),
  }, { merge: false });

  const message =
    `🔐 *CDMF – Verificação de número*\n\n` +
    `Seu código de verificação é:\n\n` +
    `*${code}*\n\n` +
    `Válido por 10 minutos. Não compartilhe este código.`;

  await sendWhatsAppText(normalizedPhone, message);
  return { success: true };
}

export async function verifyPhoneOtp(userId: string, phone: string, code: string): Promise<{ success: boolean }> {
  const normalizedPhone = normalizePhone(phone);
  const result = await getDocument("phone_otps", userId);

  if (!result) {
    throw new ApiError(400, "not-found", "Nenhum código encontrado. Solicite um novo código.");
  }

  const data = result as any;

  if (data.phone !== normalizedPhone) {
    throw new ApiError(400, "invalid-argument", "Número de telefone não confere. Solicite um novo código.");
  }
  if (data.used) {
    throw new ApiError(400, "already-exists", "Este código já foi utilizado. Solicite um novo código.");
  }
  if (data.expiresAt < Date.now()) {
    throw new ApiError(400, "deadline-exceeded", "Código expirado. Solicite um novo código.");
  }
  if (data.code !== code) {
    throw new ApiError(400, "invalid-argument", "Código incorreto. Verifique e tente novamente.");
  }

  // Double-check duplicates at verification time (catches race conditions)
  await checkDuplicatePhone(userId, normalizedPhone);

  await updateDocument("phone_otps", userId, { used: true });
  return { success: true };
}

// ============================================================
// Send message via Evolution API
// ============================================================

export async function sendWhatsAppText(to: string, body: string): Promise<string | undefined> {
  const instance = getEvolutionInstanceName();

  const payload = {
    number: to,
    text: body,
  };

  const result = await evolutionFetch(`/message/sendText/${instance}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return result?.key?.id || result?.messageId;
}

export async function sendWhatsAppAudio(to: string, audioBase64: string): Promise<string | undefined> {
  const instance = getEvolutionInstanceName();
  console.log(`[WhatsApp] Enviando áudio para ${to} (${audioBase64.length} chars base64)`);

  // Tenta endpoint de nota de voz (ptt) primeiro — base64 puro sem prefixo data URI
  try {
    const result = await evolutionFetch(`/message/sendWhatsAppAudio/${instance}`, {
      method: "POST",
      body: JSON.stringify({
        number: to,
        audio: audioBase64,
        encoding: true,
      }),
    });
    console.log("[WhatsApp] Áudio enviado via sendWhatsAppAudio");
    return result?.key?.id || result?.messageId;
  } catch (err1) {
    console.log("[WhatsApp] sendWhatsAppAudio falhou, tentando sendMedia com data URI...", (err1 as any)?.message);
    try {
      const result = await evolutionFetch(`/message/sendMedia/${instance}`, {
        method: "POST",
        body: JSON.stringify({
          number: to,
          mediatype: "audio",
          media: `data:audio/mpeg;base64,${audioBase64}`,
          fileName: "audio.mp3",
        }),
      });
      console.log("[WhatsApp] Áudio enviado via sendMedia");
      return result?.key?.id || result?.messageId;
    } catch (err2) {
      console.error("[WhatsApp] Ambos os endpoints de áudio falharam:", (err2 as any)?.message);
      throw err2;
    }
  }
}

async function getMediaBase64(fullMessage: any): Promise<string | null> {
  const instance = getEvolutionInstanceName();
  console.log("[WhatsApp] getMediaBase64 — baixando áudio...", JSON.stringify(fullMessage?.key).substring(0, 100));

  try {
    // O endpoint exige o objeto message completo (key + message content)
    const result = await evolutionFetch(`/chat/getBase64FromMediaMessage/${instance}`, {
      method: "POST",
      body: JSON.stringify({ message: fullMessage }),
    });

    // A resposta pode conter base64 diretamente ou dentro de um wrapper
    const b64 = result?.base64 || result?.data?.base64 || result?.media;
    if (b64) {
      console.log(`[WhatsApp] getMediaBase64 OK — ${String(b64).length} chars`);
      return b64;
    }

    console.error("[WhatsApp] getMediaBase64: resposta sem base64:", JSON.stringify(result).substring(0, 500));
    return null;
  } catch (err) {
    console.error("[WhatsApp] getMediaBase64 falhou:", err);
    return null;
  }
}

async function sendWhatsAppMedia(
  to: string,
  mediaUrl: string,
  caption?: string
): Promise<string | undefined> {
  const instance = getEvolutionInstanceName();

  const payload: Record<string, any> = {
    number: to,
    media: mediaUrl,
    mediatype: "image",
  };
  if (caption) payload.caption = caption;

  const result = await evolutionFetch(`/message/sendMedia/${instance}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return result?.key?.id || result?.messageId;
}

// ============================================================
// Recipients
// ============================================================

async function getRecipients(audience: Audience): Promise<Array<{ studentId: string; name: string; phone: string }>> {
  if (audience.type === "all_students") {
    const students = await listDocuments("profiles", [
      { type: "where", field: "role", op: "==", value: "student" },
      { type: "where", field: "enrollmentStatus", op: "==", value: "ativo" },
      { type: "limit", value: 5000 },
    ]);

    return students
      .filter((student) => typeof student.data.phone === "string" && student.data.phone)
      .map((student) => ({
        studentId: student.id,
        name: String(student.data.name || "Aluno"),
        phone: normalizePhone(String(student.data.phone)),
      }));
  }

  if (audience.type === "class" && audience.targetId) {
    const classDoc = await getDocument("classes", audience.targetId);
    const studentIds = Array.isArray(classDoc?.studentIds) ? classDoc.studentIds : [];
    const recipients: Array<{ studentId: string; name: string; phone: string }> = [];

    for (const studentId of studentIds) {
      if (typeof studentId !== "string") continue;
      const student = await getDocument("profiles", studentId);
      if (student?.phone && student.enrollmentStatus === "ativo") {
        recipients.push({
          studentId,
          name: String(student.name || "Aluno"),
          phone: normalizePhone(String(student.phone)),
        });
      }
    }

    return recipients;
  }

  if (audience.type === "event" && audience.targetId) {
    const eventDoc = await getDocument("events", audience.targetId);
    const studentIds = Array.isArray(eventDoc?.confirmedStudentIds) ? eventDoc.confirmedStudentIds : [];
    const recipients: Array<{ studentId: string; name: string; phone: string }> = [];

    for (const studentId of studentIds) {
      if (typeof studentId !== "string") continue;
      const student = await getDocument("profiles", studentId);
      if (student?.phone) {
        recipients.push({
          studentId,
          name: String(student.name || "Aluno"),
          phone: normalizePhone(String(student.phone)),
        });
      }
    }

    return recipients;
  }

  if (audience.type === "specific_students") {
    // Support both studentIds array and comma-separated targetId
    const studentIds = Array.isArray(audience.studentIds) && audience.studentIds.length > 0
      ? audience.studentIds
      : audience.targetId ? audience.targetId.split(",").map((item) => item.trim()).filter(Boolean) : [];
    const recipients: Array<{ studentId: string; name: string; phone: string }> = [];

    for (const studentId of studentIds) {
      const student = await getDocument("profiles", studentId);
      if (student?.phone) {
        recipients.push({
          studentId,
          name: String(student.name || "Aluno"),
          phone: normalizePhone(String(student.phone)),
        });
      }
    }

    return recipients;
  }

  return [];
}

// ============================================================
// Templates (local, stored in DB — not Meta templates)
// ============================================================

export async function getTemplates(): Promise<any[]> {
  const templates = await listDocuments("whatsapp_templates", [
    { type: "orderBy", field: "createdAt", direction: "desc" },
    { type: "limit", value: 200 },
  ]);
  return templates.map(trimDocument);
}

export async function saveTemplate(payload: {
  id?: string;
  title?: string;
  content?: string;
  category?: string;
  variables?: string[];
  imageUrl?: string;
}): Promise<{ success: boolean; id: string }> {
  const title = sanitizeString(String(payload.title || ""), 100);
  const content = sanitizeString(String(payload.content || ""), 4096);
  const id = payload.id || makeId("tmpl");
  const now = Date.now();

  const data: Record<string, unknown> = {
    title,
    content,
    category: payload.category || "marketing",
    variables: Array.isArray(payload.variables) ? payload.variables : [],
    updatedAt: now,
  };
  if (!payload.id) data.createdAt = now;
  if (payload.imageUrl !== undefined) data.imageUrl = payload.imageUrl || null;

  await setDocument("whatsapp_templates", id, data, { merge: true });

  return { success: true, id };
}

export async function deleteTemplate(id: string): Promise<{ success: boolean }> {
  await deleteDocument("whatsapp_templates", id);
  return { success: true };
}

// ============================================================
// Broadcast Images
// ============================================================

export async function getBroadcastImages(): Promise<any[]> {
  const images = await listDocuments("broadcast_images", [
    { type: "orderBy", field: "createdAt", direction: "desc" },
    { type: "limit", value: 100 },
  ]);
  return images.map(trimDocument);
}

export async function uploadBroadcastImage(payload: {
  name?: string;
  base64?: string;
}): Promise<{ id: string; name: string; url: string; createdAt: number }> {
  if (!payload.base64 || typeof payload.base64 !== "string") {
    throw new ApiError(400, "invalid-argument", "base64 é obrigatório");
  }
  const id = makeId("bimg");
  const name = sanitizeString(String(payload.name || "image"), 100);
  const now = Date.now();

  await setDocument("broadcast_images", id, {
    name,
    url: payload.base64,
    createdAt: now,
  });

  return { id, name, url: payload.base64, createdAt: now };
}

export async function deleteBroadcastImage(id: string): Promise<{ success: boolean }> {
  if (!id) throw new ApiError(400, "invalid-argument", "ID da imagem é obrigatório");
  await deleteDocument("broadcast_images", id);
  return { success: true };
}

// ============================================================
// Broadcast Stats (for risk assessment)
// ============================================================

export async function getBroadcastStats(): Promise<{
  broadcasts1h: number;
  broadcasts24h: number;
  messages1h: number;
  messages24h: number;
  lastBroadcastAt: number | null;
  lastBroadcastRecipients: number;
  recentBroadcasts: Array<{ templateTitle: string; recipientCount: number; sentAt: number }>;
}> {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

  // Fetch recent broadcasts (last 24h)
  const recentBroadcasts = await listDocuments("whatsapp_broadcasts", [
    { type: "where", field: "sentAt", op: ">=", value: twentyFourHoursAgo },
    { type: "orderBy", field: "sentAt", direction: "desc" },
    { type: "limit", value: 50 },
  ]);

  const broadcasts1h = recentBroadcasts.filter(
    (b) => typeof b.data.sentAt === "number" && b.data.sentAt >= oneHourAgo
  ).length;
  const broadcasts24h = recentBroadcasts.length;

  let messages1h = 0;
  let messages24h = 0;
  let lastBroadcastAt: number | null = null;
  let lastBroadcastRecipients = 0;

  const recent: Array<{ templateTitle: string; recipientCount: number; sentAt: number }> = [];

  for (const b of recentBroadcasts) {
    const sentAt = typeof b.data.sentAt === "number" ? b.data.sentAt : 0;
    const count = typeof b.data.successCount === "number" ? b.data.successCount : 0;
    const total = typeof b.data.totalRecipients === "number" ? b.data.totalRecipients : count;

    if (sentAt >= oneHourAgo) messages1h += total;
    messages24h += total;

    if (lastBroadcastAt === null || sentAt > lastBroadcastAt) {
      lastBroadcastAt = sentAt;
      lastBroadcastRecipients = total;
    }

    recent.push({
      templateTitle: String(b.data.templateTitle || ""),
      recipientCount: total,
      sentAt,
    });
  }

  return {
    broadcasts1h,
    broadcasts24h,
    messages1h,
    messages24h,
    lastBroadcastAt,
    lastBroadcastRecipients,
    recentBroadcasts: recent.slice(0, 10),
  };
}

// ============================================================
// Broadcast
// ============================================================

export async function sendBroadcast(
  userId: string,
  payload: { templateId?: string; audience?: Audience; variables?: Record<string, string>; imageUrl?: string; customContent?: string }
): Promise<{ success: boolean; count: number; failed: number; errors: string[] }> {
  checkRateLimit(`sendWhatsAppMessage_${userId}`);

  if (!payload.templateId || !payload.audience) {
    throw new ApiError(400, "invalid-argument", "templateId e audience são obrigatórios");
  }

  const template = await getDocument("whatsapp_templates", payload.templateId);
  if (!template) {
    throw new ApiError(404, "not-found", "Template não encontrado");
  }

  const recipients = await getRecipients(payload.audience);
  if (recipients.length === 0) {
    throw new ApiError(412, "failed-precondition", "Nenhum destinatário encontrado com telefone cadastrado");
  }

  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  for (const recipient of recipients) {
    try {
      // Usa customContent se o usuário editou a mensagem; caso contrário, usa o template original
      let content = String(payload.customContent || template.content || "");
      for (const [key, value] of Object.entries(payload.variables || {})) {
        content = content.replace(new RegExp(`{{${key}}}`, "g"), value);
      }
      content = content.replace(/{{name}}/g, recipient.name);

      const imageUrl = payload.imageUrl || (typeof template.imageUrl === "string" ? template.imageUrl : "");
      if (imageUrl) {
        await sendWhatsAppMedia(recipient.phone, imageUrl, content);
      } else {
        await sendWhatsAppText(recipient.phone, content);
      }
      successCount += 1;

      await setDocument("whatsapp_logs", makeId("walog"), {
        templateId: payload.templateId,
        templateTitle: String(template.title || ""),
        recipientPhone: recipient.phone,
        recipientName: recipient.name,
        studentId: recipient.studentId,
        content,
        status: "sent",
        sentAt: Date.now(),
        sentBy: userId,
      });

      // Small delay between messages to avoid rate limiting
      if (recipients.length > 5) {
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (error) {
      failCount += 1;
      errors.push(`${recipient.name}: ${error instanceof Error ? error.message : "Erro desconhecido"}`);
    }
  }

  await setDocument("whatsapp_broadcasts", makeId("wabrd"), {
    templateId: payload.templateId,
    templateTitle: String(template.title || ""),
    audienceType: payload.audience.type,
    audienceTargetId: payload.audience.targetId || null,
    audienceTargetName: payload.audience.targetName || null,
    totalRecipients: recipients.length,
    successCount,
    failCount,
    sentAt: Date.now(),
    sentBy: userId,
  });

  return {
    success: true,
    count: successCount,
    failed: failCount,
    errors: errors.slice(0, 5),
  };
}

// ============================================================
// Conversations
// ============================================================

export async function getConversations(): Promise<any[]> {
  const conversations = await listDocuments("whatsapp_conversations", [
    { type: "orderBy", field: "lastMessageAt", direction: "desc" },
    { type: "limit", value: 100 },
  ]);

  return conversations.map(trimDocument);
}

export async function getMessages(conversationId: string, messageLimit = 50): Promise<any[]> {
  const messages = await listDocuments("whatsapp_messages", [
    { type: "where", field: "conversationId", op: "==", value: conversationId },
    { type: "orderBy", field: "timestamp", direction: "desc" },
    { type: "limit", value: messageLimit },
  ]);

  await updateDocument("whatsapp_conversations", conversationId, {
    unreadCount: 0,
  });

  return messages.map(trimDocument).reverse();
}

export async function sendReply(
  userId: string,
  payload: { conversationId?: string; message?: string }
): Promise<{ success: boolean; messageId: string; waMessageId?: string }> {
  checkRateLimit(`sendWhatsAppReply_${userId}`);

  if (!payload.conversationId || !payload.message) {
    throw new ApiError(400, "invalid-argument", "conversationId e message são obrigatórios");
  }

  const conversation = await getDocument("whatsapp_conversations", payload.conversationId);
  if (!conversation) {
    throw new ApiError(404, "not-found", "Conversa não encontrada");
  }

  const sanitizedMessage = sanitizeString(payload.message, 4096);
  const recipientPhone = normalizePhone(String(conversation.studentPhone || ""));
  const waMessageId = await sendWhatsAppText(recipientPhone, sanitizedMessage);
  const now = Date.now();
  const messageId = makeId("wamsg");

  await setDocument("whatsapp_messages", messageId, {
    conversationId: payload.conversationId,
    waMessageId,
    from: "business",
    type: "text",
    content: sanitizedMessage,
    status: "sent",
    timestamp: now,
    sentBy: userId,
  });

  await updateDocument("whatsapp_conversations", payload.conversationId, {
    lastMessage: sanitizedMessage.substring(0, 100),
    lastMessageAt: now,
    lastMessageFrom: "business",
    updatedAt: now,
    // Humano assumiu — bot não deve mais responder nessa conversa
    botPhase: "completed",
  });

  return {
    success: true,
    messageId,
    waMessageId,
  };
}

export async function clearConversations(): Promise<{ success: boolean; deleted: number }> {
  const result = await dbQuery(
    `DELETE FROM app_documents WHERE collection_name IN ('whatsapp_conversations', 'whatsapp_messages')`,
    []
  );
  return { success: true, deleted: result.rowCount ?? 0 };
}

export async function deleteConversation(conversationId: string): Promise<{ success: boolean; deleted: number }> {
  if (!conversationId) {
    throw new ApiError(400, "invalid-argument", "conversationId é obrigatório");
  }

  // Buscar conversa para obter o telefone antes de deletar
  const conversation = await getDocument("whatsapp_conversations", conversationId);
  const studentPhone = conversation?.studentPhone as string | undefined;

  // Tentar arquivar e limpar o chat no WhatsApp (best-effort — não falha se indisponível)
  if (studentPhone) {
    const instance = getEvolutionInstanceName();
    const remoteJid = `${studentPhone}@s.whatsapp.net`;

    // Arquivar o chat
    evolutionFetch(`/chat/archiveChat/${instance}`, {
      method: "POST",
      body: JSON.stringify({ chat: remoteJid, archive: true }),
    }).catch(() => {});

    // Deletar mensagens do lado do bot no WhatsApp (limpa histórico local do dispositivo)
    evolutionFetch(`/chat/deleteMessage/${instance}`, {
      method: "DELETE",
      body: JSON.stringify({ remoteJid, fromMe: true }),
    }).catch(() => {});
  }

  // Deletar mensagens e conversa do banco
  const msgResult = await dbQuery(
    `DELETE FROM app_documents WHERE collection_name = 'whatsapp_messages' AND data->>'conversationId' = $1`,
    [conversationId]
  );
  await deleteDocument("whatsapp_conversations", conversationId);

  return { success: true, deleted: (msgResult.rowCount ?? 0) + 1 };
}

export async function markConversationResolved(conversationId: string): Promise<{ success: boolean }> {
  await updateDocument("whatsapp_conversations", conversationId, {
    status: "resolved",
    unreadCount: 0,
    updatedAt: Date.now(),
    // Ao resolver, reativa o bot para a próxima conversa
    botPhase: "active",
    botTurns: 0,
  });
  return { success: true };
}

// ============================================================
// Webhook (incoming messages from Evolution API)
// ============================================================

async function findStudentByPhone(phone: string): Promise<{ studentId: string; studentName: string } | null> {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone || normalizedPhone.length < 8) return null;

  const students = await listDocuments("profiles", [
    { type: "where", field: "role", op: "==", value: "student" },
    { type: "limit", value: 5000 },
  ]);

  // Tentativa 1: match exato pelo telefone completo normalizado
  let match = students.find((student) => {
    const candidate = typeof student.data.phone === "string" ? normalizePhone(student.data.phone) : "";
    return candidate === normalizedPhone;
  });

  // Tentativa 2: match pelos últimos 10 dígitos (DDD + número)
  if (!match) {
    const last10 = normalizedPhone.slice(-10);
    if (last10.length === 10) {
      match = students.find((student) => {
        const candidate = typeof student.data.phone === "string" ? normalizePhone(student.data.phone) : "";
        return candidate.slice(-10) === last10;
      });
    }
  }

  // Tentativa 3: match pelos últimos 9 dígitos
  if (!match) {
    const last9 = normalizedPhone.slice(-9);
    if (last9.length === 9) {
      match = students.find((student) => {
        const candidate = typeof student.data.phone === "string" ? normalizePhone(student.data.phone) : "";
        return candidate.slice(-9) === last9;
      });
    }
  }

  if (!match) return null;

  return {
    studentId: match.id,
    studentName: String(match.data.name || "Aluno"),
  };
}

function extractMessageContent(messageContent: any, messageId: string): { content: string; mediaUrl: string; messageType: string; hasAudio: boolean } {
  let content = "";
  let mediaUrl = "";
  let messageType = "text";

  if (messageContent.conversation) {
    content = messageContent.conversation;
  } else if (messageContent.extendedTextMessage?.text) {
    content = messageContent.extendedTextMessage.text;
  } else if (messageContent.imageMessage) {
    content = messageContent.imageMessage.caption || "[Imagem]";
    messageType = "image";
    mediaUrl = messageId;
  } else if (messageContent.audioMessage) {
    content = "[Áudio]";
    messageType = "audio";
    mediaUrl = messageId;
  } else if (messageContent.documentMessage) {
    content = messageContent.documentMessage.fileName || "[Documento]";
    messageType = "document";
    mediaUrl = messageId;
  } else if (messageContent.videoMessage) {
    content = messageContent.videoMessage.caption || "[Vídeo]";
    messageType = "video";
    mediaUrl = messageId;
  } else if (messageContent.stickerMessage) {
    content = "[Sticker]";
    messageType = "sticker";
  } else if (messageContent.contactMessage) {
    content = `[Contato] ${messageContent.contactMessage.displayName || ""}`;
    messageType = "contact";
  } else if (messageContent.locationMessage) {
    content = "[Localização]";
    messageType = "location";
  } else {
    content = "[Mensagem não suportada]";
  }

  return { content, mediaUrl, messageType, hasAudio: messageType === "audio" };
}

async function processWebhookMessage(data: any): Promise<void> {
  // Evolution API sends messages in different formats depending on version
  const message = data?.data || data;
  const key = message?.key || {};
  const messageContent = message?.message || {};

  const isFromMe = !!key.fromMe;
  const remoteJid = key.remoteJid || "";
  // Ignore group messages
  if (remoteJid.includes("@g.us")) return;
  // Extract phone number from JID (format: 5511999999999@s.whatsapp.net)
  const contactPhone = remoteJid.replace(/@.*$/, "");
  if (!contactPhone) return;

  // Ignore protocol/status messages with no real content
  if (!messageContent || Object.keys(messageContent).length === 0) return;
  // Ignore protocol messages (reactions, receipts, etc.)
  if (messageContent.protocolMessage || messageContent.reactionMessage) return;

  const messageId = key.id || "";
  const timestamp = Number(message.messageTimestamp || 0) * 1000 || Date.now();
  const pushName = message.pushName || "Desconhecido";

  const { content, mediaUrl, messageType } = extractMessageContent(messageContent, messageId);

  // Skip empty content
  if (!content) return;

  // Avoid duplicate messages: check if this waMessageId already exists
  const existingMessages = await listDocuments("whatsapp_messages", [
    { type: "where", field: "waMessageId", op: "==", value: messageId },
    { type: "limit", value: 1 },
  ]);
  if (existingMessages.length > 0) return;

  // Find or create conversation
  const existingConversations = await listDocuments("whatsapp_conversations", [
    { type: "where", field: "studentPhone", op: "==", value: contactPhone },
    { type: "limit", value: 1 },
  ]);

  const studentMatch = await findStudentByPhone(contactPhone);
  const studentId = studentMatch?.studentId || "";
  const studentName = studentMatch?.studentName || pushName;
  const now = Date.now();

  const msgFrom = isFromMe ? "business" : "student";

  let conversationId = existingConversations[0]?.id;
  if (!conversationId) {
    conversationId = makeId("waconv");
    await setDocument("whatsapp_conversations", conversationId, {
      studentId,
      studentName,
      studentPhone: contactPhone,
      lastMessage: content.substring(0, 100),
      lastMessageAt: timestamp,
      lastMessageFrom: msgFrom,
      unreadCount: isFromMe ? 0 : 1,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
  } else {
    const current = existingConversations[0].data;
    const updateData: Record<string, unknown> = {
      studentId: studentId || current.studentId,
      studentName: studentName || current.studentName,
      lastMessage: content.substring(0, 100),
      lastMessageAt: timestamp,
      lastMessageFrom: msgFrom,
      updatedAt: now,
    };

    if (!isFromMe) {
      updateData.unreadCount = Number(current.unreadCount || 0) + 1;
      updateData.status = "open";
      // Reativa o bot quando o usuário envia mensagem após a conversa ser resolvida
      if (current.status === "resolved") {
        updateData.botPhase = "active";
        updateData.botTurns = 0;
      }
    }

    await updateDocument("whatsapp_conversations", conversationId, updateData);
  }

  await setDocument("whatsapp_messages", makeId("wamsg"), {
    conversationId,
    waMessageId: messageId,
    from: msgFrom,
    type: messageType,
    content,
    mediaUrl,
    status: isFromMe ? "sent" : "received",
    timestamp,
  });

  // Disparar chatbot para mensagens de texto ou áudio recebidas de estudantes
  // IMPORTANTE: deve ser aguardado em serverless (Vercel encerra o processo ao enviar a resposta HTTP)
  if (!isFromMe && messageType === "text") {
    await processChatbotReply(
      conversationId,
      contactPhone,
      studentName,
      content,
      sendWhatsAppText,
      sendWhatsAppAudio,
      false
    );
  } else if (!isFromMe && messageType === "audio") {
    console.log(`[WhatsApp] Áudio recebido de ${contactPhone}, messageId: ${messageId}`);

    // Baixar áudio via Evolution API — passa o message completo (key + content)
    const fullMessage = { key, message: messageContent };
    let transcription: string | null = null;
    let canRespondAudio = false;

    const audioBase64 = await getMediaBase64(fullMessage);
    if (audioBase64) {
      console.log("[WhatsApp] Áudio baixado com sucesso, transcrevendo...");
      transcription = await transcribeAudio(audioBase64);
      canRespondAudio = true;
      if (transcription) {
        console.log(`[WhatsApp] Transcrição: "${transcription}"`);
        // Atualiza a mensagem salva com a transcrição real
        await dbQuery(
          `UPDATE app_documents SET data = data || $1::jsonb
           WHERE collection_name = 'whatsapp_messages' AND data->>'waMessageId' = $2`,
          [JSON.stringify({ content: `🎤 ${transcription}` }), messageId]
        );
      } else {
        console.error("[WhatsApp] Transcrição retornou null");
      }
    } else {
      console.error("[WhatsApp] Não foi possível baixar o áudio da mensagem:", messageId);
    }

    // Sempre aciona o chatbot — com áudio se possível, texto como fallback
    await processChatbotReply(
      conversationId,
      contactPhone,
      studentName,
      transcription || "O usuário enviou um áudio mas não foi possível transcrever. Peça gentilmente que envie por texto.",
      sendWhatsAppText,
      sendWhatsAppAudio,
      canRespondAudio
    );
  }
}

async function processMessageStatus(data: any): Promise<void> {
  const message = data?.data || data;
  const key = message?.key || {};
  const messageId = key.id || "";
  const status = message?.status;

  if (!messageId || !status) return;

  // Map Evolution API status to our status
  const statusMap: Record<string, string> = {
    DELIVERY_ACK: "delivered",
    READ: "read",
    PLAYED: "read",
    SERVER_ACK: "sent",
    ERROR: "failed",
  };

  const mappedStatus = typeof status === "string" ? (statusMap[status] || status.toLowerCase()) : "sent";

  const messages = await listDocuments("whatsapp_messages", [
    { type: "where", field: "waMessageId", op: "==", value: messageId },
    { type: "limit", value: 1 },
  ]);

  if (messages[0]) {
    await updateDocument("whatsapp_messages", messages[0].id, {
      status: mappedStatus,
    });
  }
}

export async function handleWebhook(body: any): Promise<void> {
  // Evolution API webhook format
  const event = body?.event || body?.type;

  if (!event) {
    // Try legacy/alternative format
    if (body?.data?.key) {
      await processWebhookMessage(body);
      return;
    }
    return;
  }

  switch (event) {
    case "messages.upsert":
    case "MESSAGES_UPSERT": {
      const messages = Array.isArray(body.data) ? body.data : [body.data];
      for (const msg of messages) {
        await processWebhookMessage({ data: msg });
      }
      break;
    }

    case "messages.update":
    case "MESSAGES_UPDATE": {
      const updates = Array.isArray(body.data) ? body.data : [body.data];
      for (const update of updates) {
        await processMessageStatus({ data: update });
      }
      break;
    }

    case "connection.update":
    case "CONNECTION_UPDATE":
      // Connection status changes — could log or store
      break;

    default:
      // Ignore other events
      break;
  }
}
