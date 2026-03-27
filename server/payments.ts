import { ApiError } from "./errors";
import { JsonObject } from "./db";
import { getDocument, listDocuments, setDocument, updateDocument } from "./doc-store";
import { makeId, sanitizeString, validateEmail } from "./http";
import { checkRateLimit } from "./rate-limit";
import { sendWhatsAppText } from "./whatsapp";

const MP_API_URL = "https://api.mercadopago.com";

type PaymentSettings = {
  mercadoPagoTaxPix?: number;
  mercadoPagoTaxCard?: number;
  mercadoPagoTaxOther?: number;
};

type MPPaymentResponse = {
  id: number;
  status: string;
  status_detail?: string;
  transaction_amount?: number;
  external_reference?: string;
  date_of_expiration?: string;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
};

function getMercadoPagoAccessToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim().replace(/[\r\n\t]/g, "");
  if (!token) {
    throw new ApiError(500, "failed-precondition", "MERCADOPAGO_ACCESS_TOKEN não configurado");
  }
  return token;
}

async function getPaymentSettings(): Promise<PaymentSettings> {
  const settings = await getDocument("settings", "payment");
  if (!settings) {
    return {
      mercadoPagoTaxPix: 1.0,
      mercadoPagoTaxCard: 4.99,
      mercadoPagoTaxOther: 1.0,
    };
  }

  return {
    mercadoPagoTaxPix: typeof settings.mercadoPagoTaxPix === "number" ? settings.mercadoPagoTaxPix : 1.0,
    mercadoPagoTaxCard: typeof settings.mercadoPagoTaxCard === "number" ? settings.mercadoPagoTaxCard : 4.99,
    mercadoPagoTaxOther: typeof settings.mercadoPagoTaxOther === "number" ? settings.mercadoPagoTaxOther : 1.0,
  };
}

function calculateMercadoPagoFee(
  amount: number,
  paymentMethod: string,
  settings: PaymentSettings
): { fee: number; feePercentage: number; amountNet: number } {
  if (paymentMethod !== "pix_mercadopago" && paymentMethod !== "card") {
    return { fee: 0, feePercentage: 0, amountNet: amount };
  }

  const feePercentage =
    paymentMethod === "pix_mercadopago"
      ? settings.mercadoPagoTaxPix ?? 1.0
      : settings.mercadoPagoTaxCard ?? 4.99;

  const fee = Math.round(amount * (feePercentage / 100));
  return {
    fee,
    feePercentage,
    amountNet: amount - fee,
  };
}

async function appendStudentNotification(studentId: string, notification: JsonObject): Promise<void> {
  const profile = (await getDocument("profiles", studentId)) || {};
  const notifications = Array.isArray(profile.pendingNotifications) ? [...profile.pendingNotifications] : [];
  notifications.push(notification);
  await updateDocument("profiles", studentId, {
    pendingNotifications: notifications,
  });
}

async function updateStudentPaymentStatus(studentId: string): Promise<void> {
  const pendingInvoices = await listDocuments("invoices", [
    { type: "where", field: "studentId", op: "==", value: studentId },
    { type: "where", field: "status", op: "in", value: ["pending", "overdue"] },
    { type: "limit", value: 200 },
  ]);

  const hasOverdue = pendingInvoices.some((invoice) => invoice.data.status === "overdue");
  const paymentStatus = pendingInvoices.length === 0 ? "em_dia" : hasOverdue ? "atrasado" : "pendente";

  await updateDocument("profiles", studentId, { paymentStatus });
}

async function createIncomeTransaction(invoiceId: string, invoice: JsonObject): Promise<void> {
  const existing = await listDocuments("transactions", [
    { type: "where", field: "invoiceId", op: "==", value: invoiceId },
    { type: "where", field: "type", op: "==", value: "income" },
    { type: "limit", value: 1 },
  ]);

  if (existing.length > 0) {
    return;
  }

  const settings = await getPaymentSettings();
  const amount = typeof invoice.amount === "number" ? invoice.amount : 0;
  const { fee, feePercentage, amountNet } = calculateMercadoPagoFee(amount, "pix_mercadopago", settings);
  const category =
    invoice.type === "baile" || invoice.type === "outro" || String(invoice.description || "").includes("Ingresso:")
      ? String(invoice.type || "mensalidade")
      : "mensalidade";
  const now = Date.now();
  const transactionId = `TXN_${now}_${Math.random().toString(36).slice(2, 8)}`;

  await setDocument("transactions", transactionId, {
    id: transactionId,
    type: "income",
    category,
    amount,
    amountNet: fee > 0 ? amountNet : undefined,
    fee: fee > 0 ? fee : undefined,
    feePercentage: fee > 0 ? feePercentage : undefined,
    description: `Pagamento PIX - ${String(invoice.description || invoiceId)}`,
    date: new Date().toISOString().slice(0, 10),
    invoiceId,
    studentId: typeof invoice.studentId === "string" ? invoice.studentId : "",
    studentName: typeof invoice.studentName === "string" ? invoice.studentName : "",
    paymentMethod: "pix_mercadopago",
    createdAt: now,
    createdBy: "system",
  });
}

async function createPaymentActivity(invoiceId: string, invoice: JsonObject): Promise<void> {
  const activityId = `ACT_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await setDocument("activities", activityId, {
    id: activityId,
    type: "payment",
    title: "Pagamento PIX recebido",
    description: `${String(invoice.studentName || "Aluno")} pagou ${String(invoice.description || "mensalidade")}`,
    timestamp: Date.now(),
    metadata: {
      studentId: invoice.studentId,
      studentName: invoice.studentName || "",
      invoiceId,
      amount: invoice.amount || 0,
    },
    read: false,
    createdBy: "system",
  });
}

export async function finalizeApprovedPayment(invoiceId: string, payment: MPPaymentResponse): Promise<void> {
  const invoice = await getDocument("invoices", invoiceId);
  if (!invoice) return;

  // Se já está pago E já foi notificado via WhatsApp, não faz nada
  if (invoice.status === "paid" && invoice.whatsappNotified === true) {
    return;
  }

  // Se ainda não está pago, finalizar pagamento
  if (invoice.status !== "paid") {
    await updateDocument("invoices", invoiceId, {
      status: "paid",
      paidAt: Date.now(),
      paidMethod: "pix_mercadopago",
      mpStatus: payment.status,
      mpPaymentId: payment.id,
      updatedAt: Date.now(),
    });

    await createIncomeTransaction(invoiceId, invoice);

    if (typeof invoice.studentId === "string" && invoice.studentId) {
      await updateStudentPaymentStatus(invoice.studentId);
      await appendStudentNotification(invoice.studentId, {
        id: `NOTIF_${Date.now()}`,
        type: "billing",
        title: "Pagamento confirmado!",
        message: `Seu pagamento de R$ ${((Number(invoice.amount) || 0) / 100).toFixed(2).replace(".", ",")} foi confirmado.`,
        invoiceId,
        createdAt: Date.now(),
        createdBy: "system",
      });
    }

    await createPaymentActivity(invoiceId, invoice);

    // Se for ingresso de evento, gerar voucher automaticamente
    await createVoucherAfterPayment(invoiceId, invoice);
  }

  // Notificar aluno via WhatsApp (se ainda não foi notificado)
  if (typeof invoice.studentId === "string" && invoice.studentId && invoice.whatsappNotified !== true) {
    try {
      const profile = await getDocument("profiles", invoice.studentId);
      const studentPhone = typeof profile?.phone === "string" ? profile.phone.replace(/\D/g, "") : "";
      if (studentPhone) {
        const amountFormatted = `R$ ${((Number(invoice.amount) || 0) / 100).toFixed(2).replace(".", ",")}`;
        const description = String(invoice.description || "Cobrança");
        const isTicket = Boolean(invoice.isGuestTicket) ||
          /^Ingresso:/i.test(description) ||
          invoice.type === "baile" || invoice.type === "workshop";

        let confirmMsg: string;
        if (isTicket) {
          const voucherDocs = await listDocuments("vouchers", [
            { type: "where", field: "invoiceId", op: "==", value: invoiceId },
            { type: "limit", value: 1 },
          ]);
          const voucherData = voucherDocs[0]?.data as any;
          const voucherInfo = voucherData?.voucherCode
            ? `\n\n🎟️ *Seu voucher:* ${voucherData.voucherCode}\n\nGuarde este código! Você vai precisar dele na entrada do evento.`
            : "";
          confirmMsg =
            `✅ *Pagamento do Ingresso Confirmado!*\n\n` +
            `🎉 *${description}*\n` +
            `💰 Valor: *${amountFormatted}*\n\n` +
            `Seu ingresso foi confirmado com sucesso! Nos vemos no evento 💜${voucherInfo}\n\n` +
            `Quer levar um acompanhante? É só me dizer aqui que eu te ajudo!`;
        } else {
          confirmMsg =
            `✅ *Pagamento Confirmado!*\n\n` +
            `📋 *${description}*\n` +
            `💰 Valor: *${amountFormatted}*\n\n` +
            `Seu pagamento foi recebido e confirmado com sucesso! Obrigada por manter suas mensalidades em dia 💜\n\n` +
            `Se precisar de algo, é só me chamar aqui!`;
        }
        await sendWhatsAppText(studentPhone, confirmMsg);

        // Marcar como notificado via WhatsApp
        await updateDocument("invoices", invoiceId, {
          whatsappNotified: true,
          whatsappNotifiedAt: Date.now(),
        });

        // Salvar mensagem de confirmação na conversa do WhatsApp
        const convDocs = await listDocuments("whatsapp_conversations", [
          { type: "where", field: "studentPhone", op: "==", value: studentPhone },
          { type: "limit", value: 1 },
        ]);
        const conv = convDocs[0];
        if (conv) {
          const now = Date.now();
          await setDocument("whatsapp_messages", makeId("wamsg"), {
            conversationId: conv.id,
            from: "business",
            type: "text",
            content: confirmMsg,
            status: "sent",
            timestamp: now,
            sentBy: "system",
          });
          await updateDocument("whatsapp_conversations", conv.id, {
            lastMessage: isTicket ? "✅ Ingresso Confirmado!" : "✅ Pagamento Confirmado!",
            lastMessageAt: now,
            lastMessageFrom: "business",
            updatedAt: now,
          });
        }
      } else {
        // Sem telefone — marcar como notificado para não tentar de novo
        await updateDocument("invoices", invoiceId, { whatsappNotified: true });
      }
    } catch (whatsappErr) {
      console.error("[Payments] Erro ao notificar pagamento via WhatsApp:", whatsappErr);
      // NÃO marca whatsappNotified — assim o cron tenta novamente na próxima execução
    }
  }
}

export async function createPixPayment(
  userId: string,
  payload: {
    invoiceId?: string;
    amount?: number;
    description?: string;
    studentName?: string;
    studentEmail?: string;
  }
): Promise<{
  success: boolean;
  paymentId: number;
  pixCode: string;
  pixQrCodeBase64?: string;
  ticketUrl?: string;
  expiresAt?: string;
  status: string;
}> {
  checkRateLimit(`createPixPayment_${userId}`);

  const profile = await getDocument("profiles", userId);
  if (!profile || profile.role !== "student") {
    throw new ApiError(403, "permission-denied", "Apenas alunos podem criar pagamentos");
  }

  const invoiceId = String(payload.invoiceId || "");
  const amount = Number(payload.amount || 0);
  if (!invoiceId) {
    throw new ApiError(400, "invalid-argument", "invoiceId é obrigatório");
  }
  if (!Number.isFinite(amount) || amount < 100) {
    throw new ApiError(400, "invalid-argument", "Valor inválido. Mínimo: R$ 1,00");
  }

  const invoice = await getDocument("invoices", invoiceId);
  if (!invoice) {
    throw new ApiError(404, "not-found", "Fatura não encontrada");
  }
  if (invoice.studentId !== userId) {
    throw new ApiError(403, "permission-denied", "Você não tem permissão para pagar esta fatura");
  }

  const studentEmail = String(payload.studentEmail || "");
  if (!validateEmail(studentEmail)) {
    throw new ApiError(400, "invalid-argument", "Email inválido");
  }

  const studentName = payload.studentName
    ? sanitizeString(payload.studentName, 100)
    : String(profile.name || "Aluno");
  const description = payload.description
    ? sanitizeString(payload.description, 200)
    : `Mensalidade - ${invoiceId}`;

  const amountInReais = Math.max(amount / 100, 1);
  const finalAmount = Math.round(amountInReais * 100) / 100;

  const response = await fetch(`${MP_API_URL}/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getMercadoPagoAccessToken()}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `${invoiceId}_${Date.now()}`,
    },
    body: JSON.stringify({
      transaction_amount: finalAmount,
      description,
      payment_method_id: "pix",
      payer: {
        email: studentEmail,
        first_name: studentName.split(" ")[0] || "Aluno",
        last_name: studentName.split(" ").slice(1).join(" ") || "CDMF",
      },
      external_reference: invoiceId,
      notification_url: `${process.env.APP_PUBLIC_URL?.trim() || "https://cdmf.vercel.app"}/api/webhooks/mercado-pago`,
    }),
  });

  const result = (await response.json()) as MPPaymentResponse & {
    message?: string;
    cause?: Array<{ description?: string }>;
  };

  if (!response.ok) {
    throw new ApiError(
      500,
      "mercadopago-error",
      result.message || result.cause?.[0]?.description || `HTTP ${response.status}`
    );
  }

  if (result.status === "rejected") {
    throw new ApiError(409, "payment-rejected", result.status_detail || "Pagamento rejeitado");
  }

  const pixData = result.point_of_interaction?.transaction_data;
  if (!pixData?.qr_code) {
    throw new ApiError(500, "pix-unavailable", "PIX não disponível para este pagamento");
  }

  await updateDocument("invoices", invoiceId, {
    pixCode: pixData.qr_code,
    pixQrCodeBase64: pixData.qr_code_base64,
    pixTicketUrl: pixData.ticket_url,
    mpPaymentId: result.id,
    mpStatus: result.status,
    pixExpiresAt: result.date_of_expiration
      ? new Date(result.date_of_expiration).getTime()
      : Date.now() + 30 * 60 * 1000,
    updatedAt: Date.now(),
  });

  return {
    success: true,
    paymentId: result.id,
    pixCode: pixData.qr_code,
    pixQrCodeBase64: pixData.qr_code_base64,
    ticketUrl: pixData.ticket_url,
    expiresAt: result.date_of_expiration,
    status: result.status,
  };
}

export async function checkPaymentStatus(
  userId: string,
  payload: { invoiceId?: string; paymentId?: number }
): Promise<{ status: string; statusDetail?: string; isPaid: boolean; paymentId?: number }> {
  checkRateLimit(`checkPaymentStatus_${userId}`);

  const profile = await getDocument("profiles", userId);
  if (!profile) {
    throw new ApiError(403, "permission-denied", "Perfil não encontrado");
  }

  const invoiceId = typeof payload.invoiceId === "string" ? payload.invoiceId : undefined;
  let paymentId = typeof payload.paymentId === "number" ? payload.paymentId : undefined;

  if (!paymentId && !invoiceId) {
    throw new ApiError(400, "invalid-argument", "paymentId ou invoiceId é obrigatório");
  }

  let invoice: JsonObject | null = null;
  if (!paymentId && invoiceId) {
    invoice = await getDocument("invoices", invoiceId);
    if (!invoice) {
      throw new ApiError(404, "not-found", "Fatura não encontrada");
    }

    if (profile.role !== "master" && invoice.studentId !== userId) {
      throw new ApiError(403, "permission-denied", "Você não tem permissão para verificar este pagamento");
    }

    paymentId = typeof invoice.mpPaymentId === "number" ? invoice.mpPaymentId : undefined;
  }

  if (!paymentId) {
    return { status: "not_found", isPaid: false };
  }

  const response = await fetch(`${MP_API_URL}/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${getMercadoPagoAccessToken()}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(404, "not-found", "Pagamento não encontrado");
  }

  const payment = (await response.json()) as MPPaymentResponse;
  const isPaid = payment.status === "approved";

  if (isPaid && invoiceId) {
    await finalizeApprovedPayment(invoiceId, payment);
  }

  return {
    status: payment.status,
    statusDetail: payment.status_detail,
    isPaid,
    paymentId,
  };
}

export async function handleMercadoPagoWebhook(body: Record<string, any>): Promise<string> {
  console.log("[Webhook MP] Body recebido:", JSON.stringify(body));

  // Mercado Pago envia em dois formatos:
  // Formato 1 (IPN): { type: "payment", data: { id: 123 } }
  // Formato 2 (Webhooks v2): { action: "payment.created"|"payment.updated", data: { id: "123" } }
  // Formato 3 (IPN antigo): { topic: "payment", resource: "https://api.mercadopago.com/v1/payments/123" }

  let paymentId: number | undefined;

  if (body.data?.id) {
    paymentId = Number(body.data.id);
  } else if (body.topic === "payment" && typeof body.resource === "string") {
    const match = body.resource.match(/\/payments\/(\d+)/);
    if (match) paymentId = Number(match[1]);
  }

  if (!paymentId) {
    console.log("[Webhook MP] Tipo ignorado ou sem paymentId:", body.type || body.action || body.topic);
    return "OK - Tipo ignorado";
  }

  console.log(`[Webhook MP] Consultando pagamento ${paymentId}...`);
  const response = await fetch(`${MP_API_URL}/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${getMercadoPagoAccessToken()}`,
    },
  });

  if (!response.ok) {
    console.error(`[Webhook MP] Pagamento ${paymentId} não encontrado: ${response.status}`);
    return "OK - Pagamento não encontrado";
  }

  const payment = (await response.json()) as MPPaymentResponse;
  console.log(`[Webhook MP] Pagamento ${paymentId}: status=${payment.status}, ref=${payment.external_reference}`);

  if (payment.status !== "approved" || !payment.external_reference) {
    return "OK";
  }

  await finalizeApprovedPayment(payment.external_reference, payment);
  console.log(`[Webhook MP] Pagamento ${paymentId} finalizado com sucesso`);
  return "OK";
}

/**
 * Gera um pagamento PIX para o chatbot — sem autenticação de sessão.
 * Usado quando o bot identifica que o aluno quer pagar uma cobrança pendente.
 */
type PixBotResult = {
  success: boolean;
  pixCode?: string;
  pixQrCodeBase64?: string;
  ticketUrl?: string;
  amount?: number;
  description?: string;
  reason?: string;
  invoiceStatus?: string;
};

export async function createPixPaymentForBot(
  invoiceId: string
): Promise<PixBotResult> {
  try {
    const invoice = await getDocument("invoices", invoiceId);
    if (!invoice) {
      return { success: false, reason: "not_found" };
    }

    const description = String(invoice.description || "Cobrança");
    const amount = Number(invoice.amount || 0);
    const status = String(invoice.status || "unknown");

    // Cobrança já paga
    if (status === "paid") {
      return { success: false, reason: "already_paid", invoiceStatus: "paid", amount, description };
    }

    // Cobrança cancelada
    if (status === "cancelled") {
      return { success: false, reason: "cancelled", invoiceStatus: "cancelled", amount, description };
    }

    // Só gera PIX para cobranças pendentes ou vencidas
    if (status !== "pending" && status !== "overdue") {
      return { success: false, reason: "invalid_status", invoiceStatus: status, amount, description };
    }

    // Se já tem PIX gerado e não expirou, retorna o existente
    const pixExpiresAt = typeof invoice.pixExpiresAt === "number" ? invoice.pixExpiresAt : 0;
    if (invoice.pixCode && pixExpiresAt > Date.now()) {
      return {
        success: true,
        pixCode: String(invoice.pixCode),
        pixQrCodeBase64: invoice.pixQrCodeBase64 ? String(invoice.pixQrCodeBase64) : undefined,
        ticketUrl: invoice.pixTicketUrl ? String(invoice.pixTicketUrl) : undefined,
        amount,
        description,
      };
    }

    // Buscar dados do aluno
    const studentId = String(invoice.studentId || "");
    const profile = studentId ? await getDocument("profiles", studentId) : null;
    const studentName = String(profile?.name || invoice.studentName || "Aluno");
    const studentEmail = String(profile?.email || "aluno@cdmf.com.br");

    if (!Number.isFinite(amount) || amount < 100) {
      return { success: false, reason: "invalid_amount", amount, description };
    }

    const amountInReais = Math.max(amount / 100, 1);
    const finalAmount = Math.round(amountInReais * 100) / 100;

    const token = getMercadoPagoAccessToken();
    const response = await fetch(`${MP_API_URL}/v1/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `bot_${invoiceId}_${Date.now()}`,
      },
      body: JSON.stringify({
        transaction_amount: finalAmount,
        description,
        payment_method_id: "pix",
        payer: {
          email: studentEmail,
          first_name: studentName.split(" ")[0] || "Aluno",
          last_name: studentName.split(" ").slice(1).join(" ") || "CDMF",
        },
        external_reference: invoiceId,
        notification_url: `${process.env.APP_PUBLIC_URL?.trim() || "https://cdmf.vercel.app"}/api/webhooks/mercado-pago`,
      }),
    });

    const result = (await response.json()) as MPPaymentResponse;
    if (!response.ok || !result.point_of_interaction?.transaction_data?.qr_code) {
      console.error("[Payments/Bot] Erro ao gerar PIX:", result);
      return { success: false, reason: "mp_error", amount, description };
    }

    const pixData = result.point_of_interaction.transaction_data;

    // Salvar PIX na fatura
    await updateDocument("invoices", invoiceId, {
      pixCode: pixData.qr_code,
      pixQrCodeBase64: pixData.qr_code_base64,
      pixTicketUrl: pixData.ticket_url,
      mpPaymentId: result.id,
      mpStatus: result.status,
      pixExpiresAt: result.date_of_expiration
        ? new Date(result.date_of_expiration).getTime()
        : Date.now() + 30 * 60 * 1000,
      updatedAt: Date.now(),
    });

    return {
      success: true,
      pixCode: pixData.qr_code!,
      pixQrCodeBase64: pixData.qr_code_base64,
      ticketUrl: pixData.ticket_url,
      amount,
      description,
    };
  } catch (err) {
    console.error("[Payments/Bot] Falha ao criar PIX:", err);
    return { success: false, reason: "error" };
  }
}

// ============================================================
// Voucher — geração server-side para o chatbot
// ============================================================

function generateVoucherCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "BAILE-";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Gera um voucher de evento para o chatbot (sem auth de sessão).
 * Cria a invoice de ingresso, gera o PIX, e retorna os dados.
 * Se o evento for gratuito, cria o voucher diretamente.
 */
type VoucherBotResult = {
  success: boolean;
  reason?: string;
  voucher?: { id: string; voucherCode: string; eventName: string; eventDate?: string };
  invoice?: { id: string; amount: number; description: string };
  pixCode?: string;
  needsPayment: boolean;
};

export async function createEventVoucherForBot(
  eventId: string,
  studentId: string,
  guestName?: string,
  parentVoucherId?: string,
): Promise<VoucherBotResult> {
  try {
    const event = await getDocument("events", eventId);
    if (!event) {
      console.error(`[Voucher/Bot] Evento ${eventId} não encontrado`);
      return { success: false, reason: "event_not_found", needsPayment: false };
    }
    if (!event.active) {
      return { success: false, reason: "event_inactive", needsPayment: false };
    }

    const profile = await getDocument("profiles", studentId);
    if (!profile) {
      console.error(`[Voucher/Bot] Perfil ${studentId} não encontrado`);
      return { success: false, reason: "student_not_found", needsPayment: false };
    }

    const eventName = String(event.name || "Evento");
    const eventDate = typeof event.date === "string" ? event.date : undefined;
    const eventPrice = Number(event.price || 0);
    const requiresPayment = Boolean(event.requiresPayment) && eventPrice > 0;
    const studentName = String(profile.name || "Aluno");
    const studentEmail = String(profile.email || "aluno@cdmf.com.br");

    const isGuest = Boolean(guestName && parentVoucherId);
    const finalName = isGuest ? guestName! : studentName;
    const invoiceDescription = isGuest
      ? `Ingresso Acompanhante: ${finalName} - ${eventName}`
      : `Ingresso: ${eventName}`;

    // Verificar se já tem voucher para este evento
    if (!isGuest) {
      const existingVouchers = await listDocuments("vouchers", [
        { type: "where", field: "studentId", op: "==", value: studentId },
        { type: "where", field: "eventName", op: "==", value: eventName },
        { type: "limit", value: 5 },
      ]);
      if (existingVouchers.length > 0) {
        const validVoucher = existingVouchers.find((v) => (v.data as any).status === "valid");
        if (validVoucher) {
          const existing = validVoucher.data as any;
          return {
            success: true,
            reason: "already_has_voucher",
            voucher: { id: existing.id, voucherCode: existing.voucherCode, eventName, eventDate },
            needsPayment: false,
          };
        }
        const usedVoucher = existingVouchers.find((v) => (v.data as any).status === "used");
        if (usedVoucher) {
          return { success: false, reason: "voucher_already_used", needsPayment: false };
        }
      }

      // Verificar se já tem invoice paga para este evento (voucher pode não ter sido gerado ainda)
      const existingInvoices = await listDocuments("invoices", [
        { type: "where", field: "studentId", op: "==", value: studentId },
        { type: "limit", value: 200 },
      ]);
      const paidTicketInvoice = existingInvoices.find((inv) => {
        const d = inv.data as any;
        const desc = String(d.description || "");
        return d.status === "paid" && (desc.includes(eventName) || desc === invoiceDescription);
      });
      if (paidTicketInvoice) {
        // Já pagou — gera voucher agora que faltou
        const voucherId = `VCH_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const voucherCode = generateVoucherCode();
        await setDocument("vouchers", voucherId, {
          id: voucherId,
          invoiceId: paidTicketInvoice.id,
          studentId,
          studentName: finalName,
          studentEmail,
          eventName,
          eventDate,
          voucherCode,
          status: "valid",
          createdAt: Date.now(),
        });
        await updateDocument("invoices", paidTicketInvoice.id, { voucherId });
        await confirmStudentInEvent(eventId, studentId);
        return {
          success: true,
          reason: "voucher_created_from_paid",
          voucher: { id: voucherId, voucherCode, eventName, eventDate },
          needsPayment: false,
        };
      }

      // Verificar se já tem invoice pendente para este evento (não precisa criar outra)
      const pendingTicketInvoice = existingInvoices.find((inv) => {
        const d = inv.data as any;
        const desc = String(d.description || "");
        return (d.status === "pending" || d.status === "overdue") && (desc.includes(eventName) || desc === invoiceDescription);
      });
      if (pendingTicketInvoice && requiresPayment) {
        // Já tem invoice pendente — gera PIX para ela
        const pixResult = await createPixPaymentForBot(pendingTicketInvoice.id);
        return {
          success: true,
          reason: "existing_invoice",
          invoice: {
            id: pendingTicketInvoice.id,
            amount: Number((pendingTicketInvoice.data as any).amount || 0),
            description: String((pendingTicketInvoice.data as any).description || invoiceDescription),
          },
          pixCode: pixResult?.success ? pixResult.pixCode : undefined,
          needsPayment: true,
        };
      }
    }

    if (!requiresPayment) {
      // Evento gratuito — gera voucher direto
      const voucherId = `VCH_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const voucherCode = generateVoucherCode();
      const voucher: Record<string, any> = {
        id: voucherId,
        invoiceId: "",
        studentId,
        studentName: finalName,
        studentEmail,
        eventName,
        eventDate,
        voucherCode,
        status: "valid",
        createdAt: Date.now(),
      };
      if (isGuest) {
        voucher.isGuest = true;
        voucher.guestName = guestName;
        voucher.parentVoucherId = parentVoucherId;
      }
      await setDocument("vouchers", voucherId, voucher);

      // Confirmar presença no evento
      await confirmStudentInEvent(eventId, studentId);

      return {
        success: true,
        voucher: { id: voucherId, voucherCode, eventName, eventDate },
        needsPayment: false,
      };
    }

    // Evento pago — cria invoice + PIX
    const invoiceId = `INV_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const invoice: Record<string, any> = {
      id: invoiceId,
      studentId,
      studentName: finalName,
      studentEmail,
      amount: eventPrice,
      originalAmount: eventPrice,
      discountAmount: 0,
      description: invoiceDescription,
      dueDate: eventDate || new Date().toISOString().split("T")[0],
      lateDueDate: eventDate || new Date().toISOString().split("T")[0],
      status: "pending",
      referenceMonth: new Date().toISOString().slice(0, 7),
      classCount: 0,
      createdAt: Date.now(),
      createdBy: "system",
      type: "baile",
    };
    if (isGuest) {
      invoice.isGuestTicket = true;
      invoice.guestName = guestName;
      invoice.parentVoucherId = parentVoucherId;
    }
    await setDocument("invoices", invoiceId, invoice);

    // Gerar PIX para o ingresso
    const pixResult = await createPixPaymentForBot(invoiceId);

    return {
      success: true,
      invoice: { id: invoiceId, amount: eventPrice, description: invoiceDescription },
      pixCode: pixResult?.pixCode,
      needsPayment: true,
    };
  } catch (err) {
    console.error("[Voucher/Bot] Erro ao gerar voucher:", err);
    return { success: false, reason: "error", needsPayment: false };
  }
}

/**
 * Confirma presença do aluno no evento (server-side).
 */
async function confirmStudentInEvent(eventId: string, studentId: string): Promise<void> {
  try {
    const event = await getDocument("events", eventId);
    if (!event) return;

    const confirmedIds: string[] = Array.isArray(event.confirmedStudentIds) ? event.confirmedStudentIds : [];
    if (confirmedIds.includes(studentId)) return;

    const maxParticipants = typeof event.maxParticipants === "number" ? event.maxParticipants : 0;
    if (maxParticipants > 0 && confirmedIds.length >= maxParticipants) {
      // Evento lotado — adiciona na waitlist
      const waitlist: string[] = Array.isArray(event.waitlistStudentIds) ? event.waitlistStudentIds : [];
      if (!waitlist.includes(studentId)) {
        await updateDocument("events", eventId, {
          waitlistStudentIds: [...waitlist, studentId],
          updatedAt: Date.now(),
        });
      }
      return;
    }

    await updateDocument("events", eventId, {
      confirmedStudentIds: [...confirmedIds, studentId],
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error("[Voucher/Bot] Erro ao confirmar presença no evento:", err);
  }
}

/**
 * Verifica pagamentos de um aluno específico: faturas pendentes com PIX gerado
 * e faturas pagas mas não notificadas. Chamado a cada interação do chatbot.
 */
export async function checkAndNotifyPaidInvoices(studentId: string, studentPhone: string): Promise<void> {
  if (!studentId) return;

  try {
    // Buscar faturas do aluno que têm PIX gerado (pendentes ou pagas sem notificação)
    const invoices = await listDocuments("invoices", [
      { type: "where", field: "studentId", op: "==", value: studentId },
      { type: "limit", value: 50 },
    ]);

    const token = getMercadoPagoAccessToken();

    for (const inv of invoices) {
      const d = inv.data as Record<string, unknown>;
      const mpPaymentId = d.mpPaymentId as number | undefined;
      if (!mpPaymentId || typeof mpPaymentId !== "number") continue;

      // Caso 1: Já pago mas não notificado via WhatsApp → reenviar notificação
      if (d.status === "paid" && d.whatsappNotified !== true) {
        console.log(`[CheckNotify] Fatura ${inv.id} paga mas não notificada. Enviando...`);
        const mpPayment: MPPaymentResponse = { id: mpPaymentId, status: "approved" };
        await finalizeApprovedPayment(inv.id, mpPayment);
        continue;
      }

      // Caso 2: Pendente com PIX gerado → checar status no MP
      if (d.status === "pending" || d.status === "overdue") {
        try {
          const response = await fetch(`${MP_API_URL}/v1/payments/${mpPaymentId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!response.ok) continue;

          const payment = (await response.json()) as MPPaymentResponse;
          if (payment.status === "approved") {
            console.log(`[CheckNotify] Pagamento ${mpPaymentId} aprovado! Finalizando fatura ${inv.id}...`);
            await finalizeApprovedPayment(inv.id, payment);
          } else if (payment.status === "cancelled" || payment.status === "rejected") {
            await updateDocument("invoices", inv.id, {
              mpStatus: payment.status,
              updatedAt: Date.now(),
            });
          }
        } catch (err) {
          console.error(`[CheckNotify] Erro ao checar pagamento ${mpPaymentId}:`, err);
        }
      }
    }
  } catch (err) {
    console.error("[CheckNotify] Erro geral:", err);
  }
}

/**
 * Verifica todos os pagamentos PIX pendentes e finaliza os aprovados.
 * Chamado pelo cron job diário.
 */
export async function handlePendingPixPayments(): Promise<{ checked: number; approved: number; errors: number }> {
  let checked = 0;
  let approved = 0;
  let errors = 0;

  try {
    // 1) Buscar faturas pendentes que têm mpPaymentId (PIX gerado)
    const pendingInvoices = await listDocuments("invoices", [
      { type: "where", field: "status", op: "in", value: ["pending", "overdue"] },
      { type: "limit", value: 100 },
    ]);

    // Filtrar apenas as que têm PIX gerado (mpPaymentId) e não expiraram há muito tempo
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24h
    const withPix = pendingInvoices.filter((inv) => {
      const d = inv.data as any;
      return (
        typeof d.mpPaymentId === "number" &&
        d.mpPaymentId > 0 &&
        (typeof d.pixExpiresAt !== "number" || d.pixExpiresAt > now - maxAge)
      );
    });

    // 2) Buscar faturas já pagas mas que NÃO foram notificadas via WhatsApp
    const paidNotNotified = await listDocuments("invoices", [
      { type: "where", field: "status", op: "==", value: "paid" },
      { type: "limit", value: 100 },
    ]);
    const needsNotification = paidNotNotified.filter((inv) => {
      const d = inv.data as any;
      return d.whatsappNotified !== true && typeof d.mpPaymentId === "number" && d.mpPaymentId > 0;
    });

    // Reenviar notificação para faturas pagas mas não notificadas
    for (const inv of needsNotification) {
      const d = inv.data as any;
      checked++;
      try {
        console.log(`[Cron] Fatura ${inv.id} paga mas não notificada. Reenviando notificação...`);
        const mpPayment: MPPaymentResponse = {
          id: d.mpPaymentId,
          status: "approved",
        };
        await finalizeApprovedPayment(inv.id, mpPayment);
        approved++;
      } catch (err) {
        console.error(`[Cron] Erro ao reenviar notificação para fatura ${inv.id}:`, err);
        errors++;
      }
    }

    if (withPix.length === 0) {
      return { checked, approved, errors };
    }

    const token = getMercadoPagoAccessToken();

    for (const inv of withPix) {
      const d = inv.data as any;
      const paymentId = d.mpPaymentId as number;
      checked++;

      try {
        const response = await fetch(`${MP_API_URL}/v1/payments/${paymentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          console.error(`[Cron] Pagamento ${paymentId} não encontrado: ${response.status}`);
          errors++;
          continue;
        }

        const payment = (await response.json()) as MPPaymentResponse;

        if (payment.status === "approved") {
          console.log(`[Cron] Pagamento ${paymentId} aprovado! Finalizando fatura ${inv.id}...`);
          await finalizeApprovedPayment(inv.id, payment);
          approved++;
        } else if (payment.status === "cancelled" || payment.status === "rejected") {
          await updateDocument("invoices", inv.id, {
            mpStatus: payment.status,
            updatedAt: Date.now(),
          });
        }
      } catch (err) {
        console.error(`[Cron] Erro ao checar pagamento ${paymentId}:`, err);
        errors++;
      }
    }
  } catch (err) {
    console.error("[Cron] Erro geral ao verificar pagamentos:", err);
    errors++;
  }

  console.log(`[Cron] Verificação concluída: ${checked} checados, ${approved} aprovados, ${errors} erros`);
  return { checked, approved, errors };
}

/**
 * Após pagamento de ingresso, cria o voucher automaticamente (chamado pelo finalizeApprovedPayment).
 */
export async function createVoucherAfterPayment(invoiceId: string, invoice: JsonObject): Promise<void> {
  try {
    const description = String(invoice.description || "");
    const isTicket = Boolean(invoice.isGuestTicket) ||
      /^Ingresso:/i.test(description) ||
      invoice.type === "baile" || invoice.type === "workshop" || invoice.type === "outro";

    if (!isTicket) return;

    // Verificar se já tem voucher
    const existing = await listDocuments("vouchers", [
      { type: "where", field: "invoiceId", op: "==", value: invoiceId },
      { type: "limit", value: 1 },
    ]);
    if (existing.length > 0) return;

    const studentId = String(invoice.studentId || "");
    const studentName = String(invoice.studentName || "Aluno");
    const studentEmail = String(invoice.studentEmail || "aluno@cdmf.com.br");

    // Extrair nome do evento da descrição
    let eventName = description;
    if (description.startsWith("Ingresso:")) {
      eventName = description.replace(/^Ingresso:\s*/, "").split(" - ")[0].trim();
    } else if (description.startsWith("Ingresso Acompanhante:")) {
      eventName = description.replace(/^Ingresso Acompanhante:\s*/, "").split(" - ")[0].trim();
      // Remove o nome do acompanhante
      const parts = eventName.split(" - ");
      if (parts.length > 1) eventName = parts[parts.length - 1].trim();
    }

    const voucherId = `VCH_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const voucherCode = generateVoucherCode();
    const voucher: Record<string, any> = {
      id: voucherId,
      invoiceId,
      studentId,
      studentName,
      studentEmail,
      eventName,
      eventDate: typeof invoice.dueDate === "string" ? invoice.dueDate : undefined,
      voucherCode,
      status: "valid",
      createdAt: Date.now(),
    };

    if (invoice.isGuestTicket) {
      voucher.isGuest = true;
      voucher.guestName = typeof invoice.guestName === "string" ? invoice.guestName : studentName;
      voucher.parentVoucherId = typeof invoice.parentVoucherId === "string" ? invoice.parentVoucherId : undefined;
      voucher.guestPrice = Number(invoice.amount || 0);
    }

    await setDocument("vouchers", voucherId, voucher);
    await updateDocument("invoices", invoiceId, { voucherId });

    // Confirmar presença no evento
    const events = await listDocuments("events", [
      { type: "where", field: "name", op: "==", value: eventName },
      { type: "where", field: "active", op: "==", value: true },
      { type: "limit", value: 1 },
    ]);
    if (events.length > 0) {
      await confirmStudentInEvent(events[0].id, studentId);
    }

    console.log(`[Voucher/Bot] Voucher ${voucherCode} criado para ${studentName} - ${eventName}`);
  } catch (err) {
    console.error("[Voucher/Bot] Erro ao criar voucher após pagamento:", err);
  }
}
