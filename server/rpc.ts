import { ApiError } from "./errors";
import { JsonObject } from "./db";
import {
  assertCollectionName,
  assertDocId,
  assertJsonObject,
  deleteDocument,
  getDocument,
  listDocuments,
  normalizeConstraints,
  setDocument,
  updateDocument,
} from "./doc-store";
import { ensureMasterAccount, requireRole, requireSessionUser, resolveTeacherEmailByCode } from "./auth";
import { ApiRequest, getRequestIp } from "./http";
import { createPixPayment, checkPaymentStatus } from "./payments";
import {
  clearConversations,
  deleteConversation,
  deleteTemplate,
  getBroadcastImages,
  getBroadcastStats,
  getConversations,
  getInstanceStatus,
  getMessages,
  getQrCode,
  getTemplates,
  logoutInstance,
  markConversationResolved,
  restartInstance,
  saveTemplate,
  sendBroadcast,
  sendPhoneOtp,
  sendReply,
  uploadBroadcastImage,
  deleteBroadcastImage,
  verifyPhoneOtp,
} from "./whatsapp";
import { checkRateLimit } from "./rate-limit";
import { setBotPhase, getChatbotStatus } from "./chatbot";

type RpcHandler = (req: ApiRequest, payload: any) => Promise<unknown>;

const handlers: Record<string, RpcHandler> = {
  async dbGetDoc(req, payload) {
    await requireSessionUser(req);
    const collection = assertCollectionName(payload?.collection);
    const docId = assertDocId(payload?.docId);
    const doc = await getDocument(collection, docId);
    return doc ? { exists: true, doc } : { exists: false };
  },

  async dbGetDocs(req, payload) {
    await requireSessionUser(req);
    const collection = assertCollectionName(payload?.collection);
    const constraints = normalizeConstraints(payload?.constraints);
    const docs = await listDocuments(collection, constraints);
    return {
      docs: docs.map((item) => ({ id: item.id, data: item.data })),
    };
  },

  async dbSetDoc(req, payload) {
    await requireSessionUser(req);
    const collection = assertCollectionName(payload?.collection);
    const docId = assertDocId(payload?.docId);
    const data = assertJsonObject(payload?.data, "data");
    await setDocument(collection, docId, data, { merge: payload?.merge === true });
    return { success: true };
  },

  async dbUpdateDoc(req, payload) {
    await requireSessionUser(req);
    const collection = assertCollectionName(payload?.collection);
    const docId = assertDocId(payload?.docId);
    const data = assertJsonObject(payload?.data, "data");
    await updateDocument(collection, docId, data);
    return { success: true };
  },

  async dbDeleteDoc(req, payload) {
    await requireSessionUser(req);
    const collection = assertCollectionName(payload?.collection);
    const docId = assertDocId(payload?.docId);
    await deleteDocument(collection, docId);
    return { success: true };
  },

  async masterSignIn(req, payload) {
    checkRateLimit(`masterSignIn_${getRequestIp(req)}`);
    const code = typeof payload?.code === "string" ? payload.code : "";
    const password = typeof payload?.password === "string" ? payload.password : "";
    const result = await ensureMasterAccount(code, password);
    return { success: true, email: result.email };
  },

  async resolveTeacherSignIn(_req, payload) {
    const code = typeof payload?.code === "string" ? payload.code : "";
    if (!code.trim()) {
      throw new ApiError(400, "invalid-argument", "CÃ³digo de professor Ã© obrigatÃ³rio");
    }

    const email = await resolveTeacherEmailByCode(code);
    if (!email) {
      throw new ApiError(404, "not-found", "CÃ³digo de professor nÃ£o encontrado ou inativo");
    }

    return { success: true, email };
  },

  async createPixPayment(req, payload) {
    const user = await requireSessionUser(req);
    return createPixPayment(user.uid, payload);
  },

  async checkPaymentStatus(req, payload) {
    const user = await requireSessionUser(req);
    return checkPaymentStatus(user.uid, payload);
  },

  async getWhatsAppTemplates(req) {
    await requireRole(req, ["master"]);
    return { success: true, templates: await getTemplates() };
  },

  async saveWhatsAppTemplate(req, payload) {
    await requireRole(req, ["master"]);
    return saveTemplate(payload);
  },

  async deleteWhatsAppTemplate(req, payload) {
    await requireRole(req, ["master"]);
    if (!payload?.id || typeof payload.id !== "string") {
      throw new ApiError(400, "invalid-argument", "ID do template Ã© obrigatÃ³rio");
    }
    return deleteTemplate(payload.id);
  },

  async getBroadcastImages(req) {
    await requireRole(req, ["master"]);
    return { success: true, images: await getBroadcastImages() };
  },

  async uploadBroadcastImage(req, payload) {
    await requireRole(req, ["master"]);
    return uploadBroadcastImage(payload);
  },

  async deleteBroadcastImage(req, payload) {
    await requireRole(req, ["master"]);
    if (!payload?.id || typeof payload.id !== "string") {
      throw new ApiError(400, "invalid-argument", "ID da imagem é obrigatório");
    }
    return deleteBroadcastImage(payload.id);
  },

  async getBroadcastStats(req) {
    await requireRole(req, ["master"]);
    return { success: true, ...(await getBroadcastStats()) };
  },

  async sendWhatsAppMessage(req, payload) {
    const user = await requireRole(req, ["master"]);
    return sendBroadcast(user.uid, payload);
  },

  // ── Chatbot ──────────────────────────────────────────────
  async getChatbotStatus(req) {
    await requireRole(req, ["master"]);
    return getChatbotStatus();
  },

  async setChatbotPhase(req, payload) {
    await requireRole(req, ["master"]);
    if (!payload?.conversationId || !payload?.phase) {
      throw new ApiError(400, "invalid-argument", "conversationId e phase são obrigatórios");
    }
    const validPhases = ["active", "completed", "disabled"];
    if (!validPhases.includes(payload.phase)) {
      throw new ApiError(400, "invalid-argument", `phase deve ser: ${validPhases.join(", ")}`);
    }
    return setBotPhase(payload.conversationId, payload.phase);
  },

  async getWhatsAppConversations(req) {
    await requireRole(req, ["master"]);
    return { success: true, conversations: await getConversations() };
  },

  async getWhatsAppMessages(req, payload) {
    await requireRole(req, ["master"]);
    if (!payload?.conversationId || typeof payload.conversationId !== "string") {
      throw new ApiError(400, "invalid-argument", "conversationId Ã© obrigatÃ³rio");
    }
    return {
      success: true,
      messages: await getMessages(payload.conversationId, Number(payload.limit) || 50),
    };
  },

  async sendWhatsAppReply(req, payload) {
    const user = await requireRole(req, ["master"]);
    return sendReply(user.uid, payload);
  },

  async markConversationResolved(req, payload) {
    await requireRole(req, ["master"]);
    if (!payload?.conversationId || typeof payload.conversationId !== "string") {
      throw new ApiError(400, "invalid-argument", "conversationId Ã© obrigatÃ³rio");
    }
    return markConversationResolved(payload.conversationId);
  },

  // Evolution API instance management
  async getWhatsAppStatus(req) {
    await requireRole(req, ["master"]);
    const status = await getInstanceStatus();
    return { success: true, ...status };
  },

  async getWhatsAppQrCode(req) {
    await requireRole(req, ["master"]);
    const result = await getQrCode();
    return { success: true, ...result };
  },

  async whatsAppLogout(req) {
    await requireRole(req, ["master"]);
    return logoutInstance();
  },

  async clearWhatsAppConversations(req) {
    await requireRole(req, ["master"]);
    return clearConversations();
  },

  async deleteWhatsAppConversation(req, payload) {
    await requireRole(req, ["master"]);
    if (!payload?.conversationId || typeof payload.conversationId !== "string") {
      throw new ApiError(400, "invalid-argument", "conversationId é obrigatório");
    }
    return deleteConversation(payload.conversationId);
  },

  async whatsAppRestart(req) {
    await requireRole(req, ["master"]);
    return restartInstance();
  },

  async sendPhoneOtp(req, payload) {
    const user = await requireSessionUser(req);
    if (!payload?.phone || typeof payload.phone !== "string") {
      throw new ApiError(400, "invalid-argument", "Telefone inválido");
    }
    return sendPhoneOtp(user.uid, payload.phone);
  },

  async verifyPhoneOtp(req, payload) {
    const user = await requireSessionUser(req);
    if (!payload?.phone || !payload?.code || typeof payload.code !== "string") {
      throw new ApiError(400, "invalid-argument", "Telefone e código são obrigatórios");
    }
    return verifyPhoneOtp(user.uid, payload.phone, payload.code);
  },

  async resetAllPhoneVerified(req) {
    await requireRole(req, ["master"]);
    const profiles = await listDocuments("profiles", [
      { type: "where", field: "role", op: "==", value: "student" },
      { type: "where", field: "phoneVerified", op: "==", value: true },
      { type: "limit", value: 5000 },
    ]);
    for (const p of profiles) {
      await updateDocument("profiles", p.id, { phoneVerified: false });
    }
    return { success: true, count: profiles.length };
  },
};

export async function runRpc(name: string, req: ApiRequest, payload: JsonObject): Promise<unknown> {
  const handler = handlers[name];
  if (!handler) {
    throw new ApiError(404, "not-found", `RPC ${name} nÃ£o encontrada`);
  }
  return handler(req, payload);
}


