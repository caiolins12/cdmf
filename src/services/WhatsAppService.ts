/**
 * WhatsApp Service - Evolution API Integration
 * Connects to backend API for conversations, messages, broadcasts, and instance management
 */

import { apiPost } from "./apiClient";

// Types
export interface Conversation {
  id: string;
  studentId: string;
  studentName: string;
  studentPhone: string;
  lastMessage: string;
  lastMessageAt: number;
  lastMessageFrom: "student" | "business";
  unreadCount: number;
  status: "open" | "resolved";
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  conversationId: string;
  waMessageId?: string;
  from: "student" | "business";
  type: "text" | "image" | "audio" | "document" | "video" | "template" | "sticker" | "contact" | "location";
  content: string;
  mediaUrl?: string;
  status: "sent" | "delivered" | "read" | "failed" | "received";
  timestamp: number;
  sentBy?: string;
}

export interface MessageTemplate {
  id: string;
  title: string;
  content: string;
  category: "marketing" | "utility" | "auth" | "service";
  createdAt: number;
  variables?: string[];
  imageUrl?: string;
}

export interface BroadcastImage {
  id: string;
  name: string;
  url: string;
  createdAt: number;
}

export interface WhatsAppAudience {
  type: "all_students" | "class" | "event" | "specific_students";
  targetId?: string;
  targetName?: string;
  count?: number;
  studentIds?: string[];
}

export interface InstanceStatus {
  connected: boolean;
  state: string;
  instanceName: string;
}

export interface QrCodeResult {
  qrcode?: string;
  base64?: string;
  state: string;
}

// RPC helper
async function rpc<T>(name: string, payload?: any): Promise<T> {
  return apiPost<T>(`/api/rpc/${encodeURIComponent(name)}`, payload || {});
}

export const WhatsAppService = {
  // ===============================
  // INSTANCE MANAGEMENT (Evolution API)
  // ===============================

  async getInstanceStatus(): Promise<InstanceStatus> {
    try {
      const result = await rpc<InstanceStatus & { success: boolean }>("getWhatsAppStatus");
      return {
        connected: result.connected,
        state: result.state,
        instanceName: result.instanceName,
      };
    } catch (error: any) {
      console.error("Erro ao verificar status:", error);
      return { connected: false, state: "error", instanceName: "" };
    }
  },

  async getQrCode(): Promise<QrCodeResult> {
    try {
      const result = await rpc<QrCodeResult & { success: boolean }>("getWhatsAppQrCode");
      return {
        qrcode: result.qrcode,
        base64: result.base64,
        state: result.state,
      };
    } catch (error: any) {
      console.error("Erro ao obter QR Code:", error);
      throw new Error(error.message || "Falha ao obter QR Code");
    }
  },

  async logout(): Promise<void> {
    try {
      await rpc("whatsAppLogout");
    } catch (error: any) {
      console.error("Erro ao desconectar:", error);
      throw new Error(error.message || "Falha ao desconectar");
    }
  },

  async restart(): Promise<void> {
    try {
      await rpc("whatsAppRestart");
    } catch (error: any) {
      console.error("Erro ao reconectar:", error);
      throw new Error(error.message || "Falha ao reconectar");
    }
  },

  async clearConversations(): Promise<void> {
    try {
      await rpc("clearWhatsAppConversations");
    } catch (error: any) {
      console.error("Erro ao limpar conversas:", error);
      throw new Error(error.message || "Falha ao limpar conversas");
    }
  },

  async deleteConversation(conversationId: string): Promise<void> {
    try {
      await rpc("deleteWhatsAppConversation", { conversationId });
    } catch (error: any) {
      console.error("Erro ao apagar conversa:", error);
      throw new Error(error.message || "Falha ao apagar conversa");
    }
  },

  // ===============================
  // CONVERSATIONS
  // ===============================

  async getConversations(): Promise<Conversation[]> {
    try {
      const result = await rpc<{ conversations: Conversation[] }>("getWhatsAppConversations");
      return result.conversations || [];
    } catch (error: any) {
      console.error("Erro ao buscar conversas:", error);
      throw new Error(error.message || "Falha ao buscar conversas");
    }
  },

  // SSE-based real-time listener for conversations
  subscribeToConversations(
    callback: (conversations: Conversation[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    // Fall back to polling when EventSource is not available
    if (typeof EventSource === "undefined") {
      let stopped = false;
      const poll = async () => {
        if (stopped) return;
        try {
          const conversations = await WhatsAppService.getConversations();
          if (!stopped) callback(conversations);
        } catch (error: any) {
          if (!stopped) onError?.(error);
        }
      };
      poll();
      const id = setInterval(poll, 5000);
      return () => { stopped = true; clearInterval(id); };
    }

    let stopped = false;
    let es: EventSource | null = null;
    let since = 0;
    let allConversations: Conversation[] = [];

    const connect = () => {
      if (stopped) return;
      es = new EventSource(`/api/events/whatsapp?type=conversations&since=${since}`);

      es.addEventListener("conversations_init", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          allConversations = data.conversations || [];
          callback([...allConversations]);
        } catch {}
      });

      es.addEventListener("conversations_update", (e: MessageEvent) => {
        try {
          const { conversations: updates } = JSON.parse(e.data) as { conversations: Conversation[] };
          const map = new Map(allConversations.map((c) => [c.id, c]));
          updates.forEach((c) => map.set(c.id, c));
          allConversations = [...map.values()].sort(
            (a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0)
          );
          callback([...allConversations]);
        } catch {}
      });

      es.addEventListener("reconnect", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (data.since) since = data.since;
        } catch {}
        es?.close();
        if (!stopped) connect();
      });

      es.addEventListener("heartbeat", () => {});

      es.onerror = () => {
        es?.close();
        if (!stopped) {
          onError?.(new Error("Conexão perdida, reconectando..."));
          setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      stopped = true;
      es?.close();
    };
  },

  // ===============================
  // MESSAGES
  // ===============================

  async getMessages(conversationId: string, messageLimit = 50): Promise<Message[]> {
    try {
      const result = await rpc<{ messages: Message[] }>("getWhatsAppMessages", {
        conversationId,
        limit: messageLimit,
      });
      return result.messages || [];
    } catch (error: any) {
      console.error("Erro ao buscar mensagens:", error);
      throw new Error(error.message || "Falha ao buscar mensagens");
    }
  },

  // SSE-based real-time listener for messages
  subscribeToMessages(
    conversationId: string,
    callback: (messages: Message[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    // Fall back to polling when EventSource is not available
    if (typeof EventSource === "undefined") {
      let stopped = false;
      const poll = async () => {
        if (stopped) return;
        try {
          const messages = await WhatsAppService.getMessages(conversationId);
          if (!stopped) callback(messages);
        } catch (error: any) {
          if (!stopped) onError?.(error);
        }
      };
      poll();
      const id = setInterval(poll, 3000);
      return () => { stopped = true; clearInterval(id); };
    }

    let stopped = false;
    let es: EventSource | null = null;
    let since = 0;
    let allMessages: Message[] = [];

    const connect = () => {
      if (stopped) return;
      const url = `/api/events/whatsapp?type=messages&conversationId=${encodeURIComponent(conversationId)}&since=${since}`;
      es = new EventSource(url);

      es.addEventListener("messages_init", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          allMessages = data.messages || [];
          callback([...allMessages]);
        } catch {}
      });

      es.addEventListener("messages_new", (e: MessageEvent) => {
        try {
          const { messages: newMsgs } = JSON.parse(e.data) as { messages: Message[]; conversationId: string };
          const existingIds = new Set(allMessages.map((m) => m.id));
          const toAdd = newMsgs.filter((m) => !existingIds.has(m.id));
          if (toAdd.length > 0) {
            allMessages = [...allMessages, ...toAdd];
            callback([...allMessages]);
          }
        } catch {}
      });

      es.addEventListener("reconnect", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (data.since) since = data.since;
        } catch {}
        es?.close();
        if (!stopped) connect();
      });

      es.addEventListener("heartbeat", () => {});

      es.onerror = () => {
        es?.close();
        if (!stopped) setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      stopped = true;
      es?.close();
    };
  },

  async sendReply(conversationId: string, message: string): Promise<{ messageId: string }> {
    try {
      const result = await rpc<{ messageId: string }>("sendWhatsAppReply", {
        conversationId,
        message,
      });
      return { messageId: result.messageId };
    } catch (error: any) {
      console.error("Erro ao enviar resposta:", error);
      throw new Error(error.message || "Falha ao enviar mensagem");
    }
  },

  async markAsResolved(conversationId: string): Promise<void> {
    try {
      await rpc("markConversationResolved", { conversationId });
    } catch (error: any) {
      console.error("Erro ao marcar como resolvido:", error);
      throw new Error(error.message || "Falha ao atualizar conversa");
    }
  },

  // ===============================
  // TEMPLATES
  // ===============================

  async getTemplates(): Promise<MessageTemplate[]> {
    try {
      const result = await rpc<{ templates: MessageTemplate[] }>("getWhatsAppTemplates");
      return result.templates || [];
    } catch (error: any) {
      console.error("Erro ao buscar templates:", error);
      return [];
    }
  },

  async saveTemplate(template: Omit<MessageTemplate, "id" | "createdAt">): Promise<string> {
    try {
      const result = await rpc<{ id: string }>("saveWhatsAppTemplate", {
        title: template.title,
        content: template.content,
        category: template.category,
        variables: template.variables,
        imageUrl: template.imageUrl,
      });
      return result.id;
    } catch (error: any) {
      console.error("Erro ao salvar template:", error);
      throw new Error(error.message || "Falha ao salvar template");
    }
  },

  async updateTemplate(id: string, template: Partial<MessageTemplate>): Promise<void> {
    try {
      await rpc("saveWhatsAppTemplate", {
        id,
        title: template.title || "",
        content: template.content || "",
        category: template.category || "marketing",
        variables: template.variables,
        imageUrl: template.imageUrl,
      });
    } catch (error: any) {
      console.error("Erro ao atualizar template:", error);
      throw new Error(error.message || "Falha ao atualizar template");
    }
  },

  async deleteTemplate(id: string): Promise<void> {
    try {
      await rpc("deleteWhatsAppTemplate", { id });
    } catch (error: any) {
      console.error("Erro ao deletar template:", error);
      throw new Error(error.message || "Falha ao deletar template");
    }
  },

  // ===============================
  // BROADCASTS
  // ===============================

  async sendBroadcast(
    templateId: string,
    audience: WhatsAppAudience,
    variables?: Record<string, string>,
    imageUrl?: string
  ): Promise<{ count: number; failed?: number; errors?: string[] }> {
    try {
      const result = await rpc<{ count: number; failed?: number; errors?: string[] }>(
        "sendWhatsAppMessage",
        { templateId, audience, variables, imageUrl }
      );
      return {
        count: result.count,
        failed: result.failed,
        errors: result.errors,
      };
    } catch (error: any) {
      console.error("Erro ao enviar broadcast:", error);
      throw new Error(error.message || "Falha ao enviar mensagens");
    }
  },

  // ===============================
  // BROADCAST IMAGES
  // ===============================

  async getBroadcastImages(): Promise<BroadcastImage[]> {
    try {
      const result = await rpc<{ images: BroadcastImage[] }>("getBroadcastImages");
      return result.images || [];
    } catch (error: any) {
      console.error("Erro ao buscar imagens:", error);
      return [];
    }
  },

  async uploadBroadcastImage(name: string, base64: string): Promise<BroadcastImage> {
    try {
      const result = await rpc<BroadcastImage>("uploadBroadcastImage", { name, base64 });
      return result;
    } catch (error: any) {
      console.error("Erro ao fazer upload da imagem:", error);
      throw new Error(error.message || "Falha ao fazer upload da imagem");
    }
  },

  async deleteBroadcastImage(id: string): Promise<void> {
    try {
      await rpc("deleteBroadcastImage", { id });
    } catch (error: any) {
      console.error("Erro ao deletar imagem:", error);
      throw new Error(error.message || "Falha ao deletar imagem");
    }
  },

  // ===============================
  // BROADCAST STATS
  // ===============================

  async getBroadcastStats(): Promise<BroadcastStats> {
    try {
      const result = await rpc<BroadcastStats & { success: boolean }>("getBroadcastStats");
      return {
        broadcasts1h: result.broadcasts1h || 0,
        broadcasts24h: result.broadcasts24h || 0,
        messages1h: result.messages1h || 0,
        messages24h: result.messages24h || 0,
        lastBroadcastAt: result.lastBroadcastAt || null,
        lastBroadcastRecipients: result.lastBroadcastRecipients || 0,
        recentBroadcasts: result.recentBroadcasts || [],
      };
    } catch (error: any) {
      console.error("Erro ao buscar stats:", error);
      return {
        broadcasts1h: 0, broadcasts24h: 0, messages1h: 0, messages24h: 0,
        lastBroadcastAt: null, lastBroadcastRecipients: 0, recentBroadcasts: [],
      };
    }
  },

  // ===============================
  // VALIDATION & RISK ASSESSMENT
  // ===============================

  validateMessage(content: string): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    if (content.length > 4096) warnings.push("Mensagem muito longa. Máximo: 4.096 caracteres.");
    return { valid: warnings.length === 0, warnings };
  },

  /**
   * Assess broadcast risk based on real WhatsApp behavior patterns.
   *
   * Context: Evolution API uses Baileys (unofficial WhatsApp Web client).
   * Risks are based on observed account suspension triggers, not official Meta docs.
   *
   * NOT flagged (normal school operation):
   *   - Multiple broadcasts per day to known opted-in contacts
   *   - Sending to 100-300 recipients
   *   - Sending outside "business hours" (not a WhatsApp rule)
   *
   * REAL risks flagged:
   *   - Very high daily message volume (bot-like behavior)
   *   - Rapid back-to-back large broadcasts (triggers spam detection)
   *   - Spam-like message content (triggers recipient reports)
   *   - Extremely large single-broadcast bursts
   */
  assessBroadcastRisk(
    stats: BroadcastStats,
    recipientCount: number,
    messageContent: string,
    _category: string
  ): BroadcastWarning[] {
    const warnings: BroadcastWarning[] = [];
    const now = Date.now();

    // --- Daily message volume ---
    // Risk begins when total volume looks automated/abnormal.
    // A school sending to all 400 students = 400 msgs. Sending twice = 800.
    // Real risk starts around 800-1000+ for established accounts.
    const totalMessages24h = stats.messages24h + recipientCount;
    if (totalMessages24h > 1000) {
      warnings.push({
        severity: "critical",
        icon: "trending-up",
        title: "Volume diário muito elevado",
        message: `Com este envio, serão ${totalMessages24h} mensagens enviadas hoje. Volume acima de 1.000/dia aumenta significativamente o risco de bloqueio de conta.`,
      });
    } else if (totalMessages24h > 700) {
      warnings.push({
        severity: "warning",
        icon: "trending-up",
        title: "Volume diário elevado",
        message: `Com este envio, serão ${totalMessages24h} mensagens enviadas hoje. Considere espaçar disparos grandes em dias diferentes.`,
      });
    }

    // --- Rapid succession: short interval after a large broadcast ---
    // Sending a large broadcast right after another is a strong spam signal.
    if (stats.lastBroadcastAt && stats.lastBroadcastRecipients > 50) {
      const minutesSinceLast = (now - stats.lastBroadcastAt) / (60 * 1000);
      if (minutesSinceLast < 3) {
        warnings.push({
          severity: "critical",
          icon: "flash",
          title: "Intervalo muito curto após disparo grande",
          message: `O último disparo (${stats.lastBroadcastRecipients} destinatários) foi há ${Math.floor(minutesSinceLast)} minuto(s). Aguarde pelo menos 5 minutos antes de enviar outro disparo em massa.`,
        });
      } else if (minutesSinceLast < 10) {
        warnings.push({
          severity: "warning",
          icon: "time",
          title: "Disparo recente em massa",
          message: `O último disparo em massa foi há ${Math.floor(minutesSinceLast)} minutos. Recomenda-se aguardar ao menos 10 minutos entre disparos grandes.`,
        });
      }
    }

    // --- Single broadcast size ---
    // Sending to 500+ people in one burst is an unusual pattern even for businesses.
    if (recipientCount > 500) {
      warnings.push({
        severity: "critical",
        icon: "people",
        title: "Disparo muito grande",
        message: `${recipientCount} destinatários em um único disparo é um volume alto. Considere dividir em lotes de até 300 para reduzir o risco.`,
      });
    } else if (recipientCount > 350) {
      warnings.push({
        severity: "warning",
        icon: "people",
        title: "Disparo grande",
        message: `${recipientCount} destinatários. Para contas com histórico limitado de uso, considere enviar em lotes menores.`,
      });
    }

    // --- Content quality ---
    // Spam-like content leads to recipient reports, which trigger account blocks.
    if (messageContent.length > 10 && messageContent.trim() === messageContent.trim().toUpperCase()) {
      warnings.push({
        severity: "warning",
        icon: "text",
        title: "Mensagem em maiúsculas",
        message: "Mensagens escritas inteiramente em MAIÚSCULAS têm maior taxa de reporte como spam pelos destinatários.",
      });
    }

    const spamPattern = /(.)\1{4,}|!{3,}|\?{3,}/;
    if (spamPattern.test(messageContent)) {
      warnings.push({
        severity: "warning",
        icon: "document-text",
        title: "Padrão de spam no conteúdo",
        message: "Excesso de pontuação repetida (!!!, ???) ou caracteres repetidos é um dos critérios usados para detectar spam.",
      });
    }

    if (messageContent.length > 4096) {
      warnings.push({
        severity: "critical",
        icon: "alert-circle",
        title: "Mensagem acima do limite",
        message: `A mensagem tem ${messageContent.length} caracteres. O WhatsApp aceita no máximo 4.096 caracteres por mensagem.`,
      });
    }

    // Sort: critical first, then warning
    const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    warnings.sort((a, b) => order[a.severity] - order[b.severity]);

    return warnings;
  },
};

// ===============================
// TYPES (Broadcast stats & risk)
// ===============================

export interface BroadcastStats {
  broadcasts1h: number;
  broadcasts24h: number;
  messages1h: number;
  messages24h: number;
  lastBroadcastAt: number | null;
  lastBroadcastRecipients: number;
  recentBroadcasts: Array<{ templateTitle: string; recipientCount: number; sentAt: number }>;
}

export interface BroadcastWarning {
  severity: "critical" | "warning" | "info";
  icon: string;
  title: string;
  message: string;
}
