/**
 * Firebase Cloud Functions para integração com Mercado Pago PIX
 * 
 * Versão: PRODUÇÃO
 * Atualizado em: 2026-01-04
 * 
 * Configuração necessária:
 * 1. Criar conta em https://www.mercadopago.com.br/developers
 * 2. Criar aplicação e obter Access Token
 * 3. Configurar secret: firebase functions:secrets:set MERCADOPAGO_ACCESS_TOKEN
 * 4. Deploy: firebase deploy --only functions
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import fetch from "node-fetch";
import { defineSecret } from "firebase-functions/params";

admin.initializeApp();
const db = admin.firestore();

// URL da API do Mercado Pago
const MP_API_URL = "https://api.mercadopago.com";

// Define o secret para o Access Token
const mercadoPagoAccessToken = defineSecret("MERCADOPAGO_ACCESS_TOKEN");

// Obtém Access Token do secret
function getAccessToken(): string {
  const rawToken = mercadoPagoAccessToken.value();
  
  if (!rawToken) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Mercado Pago Access Token não configurado. Execute: firebase functions:secrets:set MERCADOPAGO_ACCESS_TOKEN"
    );
  }
  
  // Remove espaços, quebras de linha e caracteres invisíveis que podem causar erro no header HTTP
  const token = rawToken.trim().replace(/[\r\n\t]/g, '');
  
  // Valida que o token não tem caracteres inválidos para headers HTTP
  if (!/^[\x20-\x7E]+$/.test(token)) {
    console.error("Token contém caracteres inválidos:", token.length, "chars");
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Access Token contém caracteres inválidos. Reconfigure o secret."
    );
  }
  
  return token;
}

// Tipos para Mercado Pago
interface MPPixPaymentRequest {
  transaction_amount: number;
  description: string;
  payment_method_id: "pix";
  payer: {
    email: string;
    first_name?: string;
    last_name?: string;
    identification?: {
      type: string;
      number: string;
    };
  };
  external_reference?: string;
}

interface MPPaymentResponse {
  id: number;
  status: string;
  status_detail: string;
  transaction_amount: number;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
  date_of_expiration?: string;
}

/**
 * Cria um pagamento PIX via Mercado Pago
 */
export const createPixPayment = functions
  .runWith({ secrets: [mercadoPagoAccessToken] })
  .https.onCall(async (data, context) => {
  // Verifica autenticação
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Usuário não autenticado"
    );
  }

  const { invoiceId, amount, description, studentName, studentEmail } = data;

  if (!invoiceId || !amount) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "invoiceId e amount são obrigatórios"
    );
  }

  if (!studentEmail) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Email do aluno é obrigatório para pagamento PIX"
    );
  }

  try {
    const accessToken = getAccessToken();
    
    // Valor mínimo de R$ 1,00 para PIX no Mercado Pago
    const amountInReais = Math.max(amount / 100, 1.00);
    
    // Arredonda para 2 casas decimais
    const finalAmount = Math.round(amountInReais * 100) / 100;
    
    // Prepara dados do pagamento
    const paymentData: MPPixPaymentRequest = {
      transaction_amount: finalAmount,
      description: description || `Mensalidade - ${invoiceId}`,
      payment_method_id: "pix",
      payer: {
        email: studentEmail,
        first_name: studentName?.split(" ")[0] || "Aluno",
        last_name: studentName?.split(" ").slice(1).join(" ") || "CDMF",
      },
      external_reference: invoiceId,
    };

    const tokenType = accessToken.startsWith("TEST-") ? "TESTE" : "PRODUÇÃO";
    
    console.log("=== CRIANDO PAGAMENTO PIX ===");
    console.log("Tipo de Token:", tokenType);
    console.log("Invoice ID:", invoiceId);
    console.log("Valor original (centavos):", amount);
    console.log("Valor final (R$):", finalAmount);
    console.log("Email:", studentEmail);
    console.log("Nome:", studentName);
    console.log("Request body:", JSON.stringify(paymentData, null, 2));

    // Cria pagamento no Mercado Pago
    const response = await fetch(`${MP_API_URL}/v1/payments`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `${invoiceId}_${Date.now()}`, // Único por tentativa
      },
      body: JSON.stringify(paymentData),
    });

    const responseText = await response.text();
    let result: MPPaymentResponse;
    
    try {
      result = JSON.parse(responseText) as MPPaymentResponse;
    } catch (e) {
      console.error("Erro ao parsear resposta:", responseText);
      throw new functions.https.HttpsError("internal", "Resposta inválida do Mercado Pago");
    }

    console.log("=== RESPOSTA MERCADO PAGO ===");
    console.log("HTTP Status:", response.status);
    console.log("Response:", JSON.stringify(result, null, 2));

    if (!response.ok) {
      console.error("Mercado Pago error details:", JSON.stringify(result, null, 2));
      const errorMsg = (result as any).message || 
                       (result as any).cause?.[0]?.description ||
                       `HTTP ${response.status}`;
      throw new functions.https.HttpsError(
        "internal",
        `Erro Mercado Pago: ${errorMsg}`
      );
    }

    // Verifica se pagamento foi rejeitado
    if (result.status === "rejected") {
      console.error("Pagamento rejeitado:", result.status_detail);
      
      // Mensagens amigáveis para diferentes motivos de rejeição
      const rejectionMessages: Record<string, string> = {
        "rejected_high_risk": "Pagamento rejeitado por segurança. Tente com um email válido.",
        "cc_rejected_insufficient_amount": "Valor insuficiente.",
        "cc_rejected_bad_filled_other": "Dados inválidos.",
        "cc_rejected_blacklist": "Pagamento não autorizado.",
      };
      
      const message = rejectionMessages[result.status_detail as string] || 
                      `Pagamento rejeitado: ${result.status_detail}`;
      
      throw new functions.https.HttpsError("aborted", message);
    }
    
    // Extrai dados do PIX
    const pixData = result.point_of_interaction?.transaction_data;
    
    if (!pixData?.qr_code) {
      throw new functions.https.HttpsError(
        "internal",
        "PIX não disponível para este pagamento"
      );
    }

    // Salva dados do pagamento na fatura
    await db.collection("invoices").doc(invoiceId).update({
      pixCode: pixData.qr_code,
      pixQrCodeBase64: pixData.qr_code_base64,
      pixTicketUrl: pixData.ticket_url,
      mpPaymentId: result.id,
      mpStatus: result.status,
      pixExpiresAt: result.date_of_expiration 
        ? new Date(result.date_of_expiration).getTime() 
        : Date.now() + (30 * 60 * 1000), // 30 minutos padrão
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
  } catch (error: any) {
    console.error("Erro ao criar pagamento PIX:", error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      "internal",
      error.message || "Erro ao criar pagamento"
    );
  }
});

/**
 * Verifica status de um pagamento
 */
export const checkPaymentStatus = functions
  .runWith({ secrets: [mercadoPagoAccessToken] })
  .https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Usuário não autenticado"
    );
  }

  const { paymentId, invoiceId } = data;

  if (!paymentId && !invoiceId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "paymentId ou invoiceId é obrigatório"
    );
  }

  try {
    const accessToken = getAccessToken();
    
    let mpPaymentId = paymentId;
    
    // Se não tem paymentId, busca da fatura
    if (!mpPaymentId && invoiceId) {
      const invoiceDoc = await db.collection("invoices").doc(invoiceId).get();
      if (invoiceDoc.exists) {
        mpPaymentId = invoiceDoc.data()?.mpPaymentId;
      }
    }

    if (!mpPaymentId) {
      return { status: "not_found", isPaid: false };
    }

    // Consulta status no Mercado Pago
    const response = await fetch(`${MP_API_URL}/v1/payments/${mpPaymentId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new functions.https.HttpsError(
        "not-found",
        "Pagamento não encontrado"
      );
    }

    const payment = await response.json() as MPPaymentResponse;
    const isPaid = payment.status === "approved";

    // Se foi aprovado, atualiza a fatura
    if (isPaid && invoiceId) {
      const invoiceRef = db.collection("invoices").doc(invoiceId);
      const invoiceDoc = await invoiceRef.get();
      
      if (invoiceDoc.exists && invoiceDoc.data()?.status !== "paid") {
        await invoiceRef.update({
          status: "paid",
          paidAt: Date.now(),
          paidMethod: "pix_mercadopago",
          mpStatus: payment.status,
          updatedAt: Date.now(),
        });

        // Cria transação de recebimento
        const invoice = invoiceDoc.data()!;
        const txnId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        await db.collection("transactions").doc(txnId).set({
          id: txnId,
          type: "income",
          category: "mensalidade",
          amount: invoice.amount,
          description: `Pagamento PIX - ${invoice.description || invoiceId}`,
          date: new Date().toISOString().slice(0, 10),
          invoiceId,
          studentId: invoice.studentId,
          studentName: invoice.studentName || "",
          paymentMethod: "pix_mercadopago",
          createdAt: Date.now(),
          createdBy: "system",
        });

        // Notifica o aluno e atualiza status de pagamento
        if (invoice.studentId) {
          try {
            const studentRef = db.collection("profiles").doc(invoice.studentId);
            
            // Busca todas as faturas pendentes do aluno para calcular o novo status
            const pendingInvoicesSnap = await db.collection("invoices")
              .where("studentId", "==", invoice.studentId)
              .where("status", "in", ["pending", "overdue"])
              .get();
            
            // Se não tem mais faturas pendentes, marca como em_dia
            const newPaymentStatus = pendingInvoicesSnap.empty ? "em_dia" : 
              pendingInvoicesSnap.docs.some(d => d.data().status === "overdue") ? "atrasado" : "pendente";
            
            await studentRef.update({
              paymentStatus: newPaymentStatus,
              pendingNotifications: admin.firestore.FieldValue.arrayUnion({
                id: `NOTIF_${Date.now()}`,
                type: "billing",
                title: "Pagamento confirmado! ✅",
                message: `Seu pagamento de R$ ${(invoice.amount / 100).toFixed(2).replace(".", ",")} foi confirmado.`,
                invoiceId,
                createdAt: Date.now(),
                createdBy: "system",
              }),
            });
          } catch (e) {
            console.warn("Erro ao notificar aluno:", e);
          }
        }
        
        // Cria atividade para o log de atividades recentes
        try {
          const activityId = `ACT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
          await db.collection("activities").doc(activityId).set({
            id: activityId,
            type: "payment",
            title: "Pagamento PIX recebido",
            description: `${invoice.studentName || "Aluno"} pagou ${invoice.description || "mensalidade"}`,
            amount: invoice.amount,
            studentId: invoice.studentId,
            studentName: invoice.studentName || "",
            invoiceId,
            createdAt: Date.now(),
            createdBy: "system",
          });
        } catch (e) {
          console.warn("Erro ao criar atividade:", e);
        }
      }
    }

    return {
      status: payment.status,
      statusDetail: payment.status_detail,
      isPaid,
      paymentId: mpPaymentId,
    };
  } catch (error: any) {
    console.error("Erro ao verificar pagamento:", error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      "internal",
      error.message || "Erro ao verificar pagamento"
    );
  }
});

/**
 * Webhook para receber notificações do Mercado Pago
 * Configure este URL no painel do Mercado Pago:
 * https://us-central1-SEU_PROJETO.cloudfunctions.net/mercadoPagoWebhook
 */
export const mercadoPagoWebhook = functions
  .runWith({ secrets: [mercadoPagoAccessToken] })
  .https.onRequest(async (req, res) => {
  // Aceita GET para verificação do MP e POST para notificações
  if (req.method === "GET") {
    res.status(200).send("OK");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  try {
    const { type, data } = req.body;
    
    console.log("Webhook recebido:", { type, data });

    // Apenas processa notificações de pagamento
    if (type !== "payment") {
      res.status(200).send("OK - Tipo ignorado");
      return;
    }

    const paymentId = data?.id;
    if (!paymentId) {
      res.status(400).send("Payment ID não encontrado");
      return;
    }

    const accessToken = getAccessToken();

    // Busca detalhes do pagamento
    const response = await fetch(`${MP_API_URL}/v1/payments/${paymentId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error("Erro ao buscar pagamento:", response.status);
      res.status(200).send("OK - Pagamento não encontrado");
      return;
    }

    const payment = await response.json() as MPPaymentResponse & { external_reference?: string };
    
    // Só processa se foi aprovado
    if (payment.status !== "approved") {
      console.log(`Pagamento ${paymentId} com status ${payment.status}, ignorando`);
      res.status(200).send("OK - Status não é approved");
      return;
    }

    // Busca fatura pelo external_reference (invoiceId)
    const invoiceId = payment.external_reference;
    if (!invoiceId) {
      console.warn("Pagamento sem external_reference");
      res.status(200).send("OK - Sem referência");
      return;
    }

    // Atualiza fatura
    const invoiceRef = db.collection("invoices").doc(invoiceId);
    const invoiceDoc = await invoiceRef.get();

    if (!invoiceDoc.exists) {
      console.warn(`Fatura ${invoiceId} não encontrada`);
      res.status(200).send("OK - Fatura não encontrada");
      return;
    }

    const invoice = invoiceDoc.data()!;

    // Já está paga?
    if (invoice.status === "paid") {
      res.status(200).send("OK - Já processado");
      return;
    }

    // Atualiza fatura como paga
    await invoiceRef.update({
      status: "paid",
      paidAt: Date.now(),
      paidMethod: "pix_mercadopago",
      mpStatus: "approved",
      mpPaymentId: paymentId,
      updatedAt: Date.now(),
    });

    // Cria transação de recebimento
    const txnId2 = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    await db.collection("transactions").doc(txnId2).set({
      id: txnId2,
      type: "income",
      category: "mensalidade",
      amount: invoice.amount,
      description: `Pagamento PIX - ${invoice.description || invoiceId}`,
      date: new Date().toISOString().slice(0, 10),
      invoiceId,
      studentId: invoice.studentId,
      studentName: invoice.studentName || "",
      paymentMethod: "pix_mercadopago",
      createdAt: Date.now(),
      createdBy: "system",
    });

    // Notifica o aluno e atualiza status de pagamento
    if (invoice.studentId) {
      try {
        const studentRef = db.collection("profiles").doc(invoice.studentId);
        
        // Busca todas as faturas pendentes do aluno para calcular o novo status
        const pendingInvoicesSnap = await db.collection("invoices")
          .where("studentId", "==", invoice.studentId)
          .where("status", "in", ["pending", "overdue"])
          .get();
        
        // Se não tem mais faturas pendentes, marca como em_dia
        const newPaymentStatus = pendingInvoicesSnap.empty ? "em_dia" : 
          pendingInvoicesSnap.docs.some(d => d.data().status === "overdue") ? "atrasado" : "pendente";
        
        await studentRef.update({
          paymentStatus: newPaymentStatus,
          pendingNotifications: admin.firestore.FieldValue.arrayUnion({
            id: `NOTIF_${Date.now()}`,
            type: "billing",
            title: "Pagamento confirmado! ✅",
            message: `Seu pagamento de R$ ${(invoice.amount / 100).toFixed(2).replace(".", ",")} foi confirmado.`,
            invoiceId,
            createdAt: Date.now(),
            createdBy: "system",
          }),
        });
      } catch (e) {
        console.warn("Erro ao notificar aluno:", e);
      }
    }
    
    // Cria atividade para o log de atividades recentes
    try {
      const activityId = `ACT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await db.collection("activities").doc(activityId).set({
        id: activityId,
        type: "payment",
        title: "Pagamento PIX recebido",
        description: `${invoice.studentName || "Aluno"} pagou ${invoice.description || "mensalidade"}`,
        amount: invoice.amount,
        studentId: invoice.studentId,
        studentName: invoice.studentName || "",
        invoiceId,
        createdAt: Date.now(),
        createdBy: "system",
      });
    } catch (e) {
      console.warn("Erro ao criar atividade:", e);
    }

    console.log(`Pagamento ${paymentId} confirmado para fatura ${invoiceId}`);
    res.status(200).send("OK");
  } catch (error) {
    console.error("Erro no webhook:", error);
    res.status(500).send("Erro interno");
  }
});

/**
 * Função agendada para verificar pagamentos pendentes
 * Executa a cada 15 minutos
 */
export const checkPendingPixPayments = functions
  .runWith({ secrets: [mercadoPagoAccessToken] })
  .pubsub
  .schedule("every 15 minutes")
  .onRun(async () => {
    try {
      const accessToken = getAccessToken();
      
      // Busca faturas com PIX gerado mas não pagas
      const pendingInvoices = await db.collection("invoices")
        .where("status", "in", ["pending", "overdue"])
        .where("mpPaymentId", "!=", null)
        .get();

      let processed = 0;

      for (const doc of pendingInvoices.docs) {
        const invoice = doc.data();
        const invoiceId = doc.id;
        const mpPaymentId = invoice.mpPaymentId;

        if (!mpPaymentId) continue;

        try {
          const response = await fetch(`${MP_API_URL}/v1/payments/${mpPaymentId}`, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
            },
          });

          if (response.ok) {
            const payment = await response.json() as MPPaymentResponse;
            
            if (payment.status === "approved") {
              // Marca como paga
              await db.collection("invoices").doc(invoiceId).update({
                status: "paid",
                paidAt: Date.now(),
                paidMethod: "pix_mercadopago",
                mpStatus: "approved",
                updatedAt: Date.now(),
              });

              // Cria transação
              const txnId3 = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
              await db.collection("transactions").doc(txnId3).set({
                id: txnId3,
                type: "income",
                category: "mensalidade",
                amount: invoice.amount,
                description: `Pagamento PIX - ${invoice.description || invoiceId}`,
                date: new Date().toISOString().slice(0, 10),
                invoiceId,
                studentId: invoice.studentId,
                studentName: invoice.studentName || "",
                paymentMethod: "pix_mercadopago",
                createdAt: Date.now(),
                createdBy: "system",
              });

              processed++;
              console.log(`Pagamento confirmado (polling): ${invoiceId}`);
            }
          }
        } catch (e) {
          console.error(`Erro ao verificar fatura ${invoiceId}:`, e);
        }
      }

      console.log(`Verificação de pagamentos concluída. ${processed} de ${pendingInvoices.size} faturas processadas.`);
    } catch (error) {
      console.error("Erro na verificação de pagamentos:", error);
    }
  });

