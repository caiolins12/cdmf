/**
 * Chatbot de triagem - CDMF
 * Usa OpenAI gpt-4.1-nano para atender o usuário, coletar a necessidade
 * e encaminhar para atendimento humano.
 */

import { getDocument, listDocuments, setDocument, updateDocument } from "./doc-store";
import { makeId } from "./http";

// ============================================================
// Config
// ============================================================

const OPENAI_MODEL = "gpt-4.1-nano";
const MAX_BOT_TURNS = 6; // teto de segurança — bot para mesmo sem sinal de conclusão
const BOT_DONE_MARKER = "[FIM_ATENDIMENTO]";

const SYSTEM_PROMPT = `Você é o "Assistente de IA" do CDMF (Centro de Danças Marcelo Ferreira), uma escola de dança.

Seu objetivo em ordem:
1. Cumprimentar o usuário de forma simpática e perguntar como pode ajudar.
2. Entender a necessidade ou dúvida dele fazendo perguntas curtas quando necessário.
3. Quando tiver clareza sobre a necessidade, confirmar que entendeu e informar que um responsável do CDMF entrará em contato em breve.

Regras obrigatórias:
- SEMPRE inicie cada resposta com exatamente "Assistente de IA: " (com dois pontos e espaço).
- Responda no mesmo idioma e no mesmo tom do usuário (formal/informal).
- Seja conciso e simpático. Não faça múltiplas perguntas de uma vez.
- NÃO forneça informações sobre preços, horários, turmas disponíveis ou qualquer dado específico da escola — apenas registre a necessidade e direcione para o humano.
- NÃO invente respostas sobre a escola.
- Quando tiver coletado a necessidade e enviado a mensagem final de encaminhamento, inclua exatamente "${BOT_DONE_MARKER}" no fim da sua resposta. Isso encerra o atendimento automatizado.

Exemplo de encerramento correto:
"Assistente de IA: Entendido! Anotei sua solicitação. Em breve, um de nossos responsáveis entrará em contato para te atender. Obrigado por falar com o CDMF! ${BOT_DONE_MARKER}"`;

// ============================================================
// Types
// ============================================================

type SendTextFn = (phone: string, text: string) => Promise<string | undefined>;

// ============================================================
// Main entry point — called by webhook after storing student msg
// ============================================================

export async function processChatbotReply(
  conversationId: string,
  studentPhone: string,
  studentName: string,
  incomingMessage: string,
  sendText: SendTextFn
): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return; // chatbot desabilitado se chave não configurada

  try {
    // Buscar conversa
    const conversation = await getDocument("whatsapp_conversations", conversationId);
    if (!conversation) return;

    // Não responder se bot já concluiu ou se foi desativado manualmente
    const botPhase = conversation.botPhase as string | undefined;
    if (botPhase === "completed" || botPhase === "disabled") return;

    // Não responder se conversa está resolvida (humano já tratou)
    if (conversation.status === "resolved") return;

    // Checar teto de turnos do bot
    const botTurns = Number(conversation.botTurns || 0);
    if (botTurns >= MAX_BOT_TURNS) {
      await updateDocument("whatsapp_conversations", conversationId, {
        botPhase: "completed",
      });
      return;
    }

    // Montar histórico de conversa para contexto do OpenAI (últimas 20 mensagens)
    const recentMessages = await listDocuments("whatsapp_messages", [
      { type: "where", field: "conversationId", op: "==", value: conversationId },
      { type: "orderBy", field: "timestamp", direction: "desc" },
      { type: "limit", value: 20 },
    ]);

    const history = recentMessages
      .reverse()
      .filter((m) => m.data.type === "text" || !m.data.type)
      .map((m) => ({
        role: m.data.from === "student" ? "user" : "assistant",
        content: String(m.data.content || ""),
      })) as Array<{ role: "user" | "assistant"; content: string }>;

    // Chamar OpenAI
    const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...history,
        ],
        max_tokens: 350,
        temperature: 0.7,
      }),
    });

    if (!openAiResponse.ok) {
      const err = await openAiResponse.text().catch(() => "");
      console.error(`[Chatbot] OpenAI error ${openAiResponse.status}:`, err);
      return;
    }

    const openAiData = await openAiResponse.json();
    let botText: string = openAiData?.choices?.[0]?.message?.content || "";
    if (!botText) return;

    // Verificar se o bot sinalizou conclusão
    const isDone = botText.includes(BOT_DONE_MARKER);
    botText = botText.replace(BOT_DONE_MARKER, "").trim();

    // Garantir prefixo correto (fallback caso o modelo não siga)
    if (!botText.startsWith("Assistente de IA:")) {
      botText = `Assistente de IA: ${botText}`;
    }

    // Enviar mensagem via WhatsApp
    await sendText(studentPhone, botText);

    // Salvar mensagem do bot no banco
    const now = Date.now();
    const messageId = makeId("wamsg");
    await setDocument("whatsapp_messages", messageId, {
      conversationId,
      from: "business",
      type: "text",
      content: botText,
      status: "sent",
      timestamp: now,
      sentBy: "chatbot",
    });

    // Atualizar conversa
    await updateDocument("whatsapp_conversations", conversationId, {
      lastMessage: botText.substring(0, 100),
      lastMessageAt: now,
      lastMessageFrom: "business",
      updatedAt: now,
      botTurns: botTurns + 1,
      botPhase: isDone ? "completed" : "active",
    });
  } catch (error) {
    // Erro silencioso — não bloquear o webhook
    console.error("[Chatbot] Erro ao processar resposta:", error);
  }
}

// ============================================================
// Utilitários de controle do bot (chamados via RPC)
// ============================================================

export async function setBotPhase(
  conversationId: string,
  phase: "active" | "completed" | "disabled"
): Promise<{ success: boolean }> {
  await updateDocument("whatsapp_conversations", conversationId, {
    botPhase: phase,
    updatedAt: Date.now(),
  });
  return { success: true };
}

export async function getChatbotStatus(): Promise<{ enabled: boolean; model: string }> {
  const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  return { enabled: hasKey, model: OPENAI_MODEL };
}
