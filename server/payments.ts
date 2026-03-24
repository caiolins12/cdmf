import { ApiError } from "./errors";
import { JsonObject } from "./db";
import { getDocument, listDocuments, setDocument, updateDocument } from "./doc-store";
import { sanitizeString, validateEmail } from "./http";
import { checkRateLimit } from "./rate-limit";

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
  if (!invoice || invoice.status === "paid") {
    return;
  }

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

export async function handleMercadoPagoWebhook(body: { type?: string; data?: { id?: number } }): Promise<string> {
  if (body.type !== "payment" || !body.data?.id) {
    return "OK - Tipo ignorado";
  }

  const response = await fetch(`${MP_API_URL}/v1/payments/${body.data.id}`, {
    headers: {
      Authorization: `Bearer ${getMercadoPagoAccessToken()}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(404, "not-found", "Pagamento não encontrado");
  }

  const payment = (await response.json()) as MPPaymentResponse;
  if (payment.status !== "approved" || !payment.external_reference) {
    return "OK";
  }

  await finalizeApprovedPayment(payment.external_reference, payment);
  return "OK";
}
