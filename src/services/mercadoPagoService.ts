/**
 * Serviço de integração com Mercado Pago PIX
 * 
 * Este serviço utiliza Cloud Functions para comunicação segura com a API do MP.
 * 
 * CONFIGURAÇÃO:
 * 1. Configure as Cloud Functions (ver docs/MERCADOPAGO_SETUP.md)
 * 2. Altere USE_MERCADO_PAGO para true
 */

import { Invoice } from "../contexts/PaymentContext";
import { getFunctions, httpsCallable, Functions } from "firebase/functions";
import { app } from "./firebase.web";

// Flag para usar Mercado Pago (Cloud Functions configuradas!)
export const USE_MERCADO_PAGO = true;

// Firebase Functions instance
let functionsInstance: Functions | null = null;

function getFunctionsInstance(): Functions {
  if (!functionsInstance) {
    functionsInstance = getFunctions(app);
  }
  return functionsInstance;
}

// Tipos
interface CreatePixPaymentParams {
  invoiceId: string;
  amount: number;
  description: string;
  studentName?: string;
  studentEmail: string;
}

interface CreatePixPaymentResult {
  success: boolean;
  paymentId: number;
  pixCode: string;
  pixQrCodeBase64?: string;
  ticketUrl?: string;
  expiresAt?: string;
  status: string;
}

interface CheckPaymentResult {
  status: string;
  statusDetail?: string;
  isPaid: boolean;
  paymentId?: number;
}

/**
 * Verifica se o Mercado Pago está habilitado
 */
export function isMercadoPagoEnabled(): boolean {
  return USE_MERCADO_PAGO;
}

/**
 * Sanitiza mensagens de erro para não expor tokens ou dados sensíveis
 */
function sanitizeErrorMessage(message: string): string {
  if (!message) return "Erro ao processar pagamento PIX";
  
  // Remove tokens do Mercado Pago da mensagem (APP_USR-... ou TEST-...)
  let sanitized = message.replace(/APP_USR-[\w-]+/gi, "[TOKEN_OCULTO]");
  sanitized = sanitized.replace(/TEST-[\w-]+/gi, "[TOKEN_OCULTO]");
  sanitized = sanitized.replace(/Bearer\s+[\w-]+/gi, "Bearer [TOKEN_OCULTO]");
  
  // Mensagens amigáveis para erros comuns
  if (sanitized.includes("not a legal HTTP header value")) {
    return "Erro de configuração do servidor. Entre em contato com o suporte.";
  }
  if (sanitized.includes("unauthenticated") || sanitized.includes("UNAUTHENTICATED")) {
    return "Sessão expirada. Faça login novamente.";
  }
  if (sanitized.includes("network") || sanitized.includes("fetch")) {
    return "Erro de conexão. Verifique sua internet e tente novamente.";
  }
  
  return sanitized;
}

/**
 * Cria um pagamento PIX via Mercado Pago
 */
export async function createMercadoPagoPixPayment(
  params: CreatePixPaymentParams
): Promise<CreatePixPaymentResult> {
  if (!USE_MERCADO_PAGO) {
    throw new Error("Mercado Pago não configurado. Use o método local de geração de PIX.");
  }

  try {
    const functions = getFunctionsInstance();
    
    const createPayment = httpsCallable<CreatePixPaymentParams, CreatePixPaymentResult>(
      functions,
      "createPixPayment"
    );
    
    const result = await createPayment(params);
    return result.data;
  } catch (error: any) {
    console.error("Erro ao criar pagamento PIX:", error);
    throw new Error(sanitizeErrorMessage(error.message));
  }
}

/**
 * Verifica status de um pagamento
 */
export async function checkMercadoPagoPayment(
  invoiceId: string,
  paymentId?: number
): Promise<CheckPaymentResult> {
  if (!USE_MERCADO_PAGO) {
    return { status: "pending", isPaid: false };
  }

  try {
    const functions = getFunctionsInstance();
    
    const checkPayment = httpsCallable<
      { invoiceId?: string; paymentId?: number },
      CheckPaymentResult
    >(functions, "checkPaymentStatus");
    
    const result = await checkPayment({ invoiceId, paymentId });
    return result.data;
  } catch (error: any) {
    console.error("Erro ao verificar pagamento:", error);
    return { status: "error", isPaid: false };
  }
}

/**
 * Gera pagamento PIX para uma fatura
 */
export async function generateMercadoPagoPixForInvoice(
  invoice: Invoice,
  studentName: string,
  studentEmail: string
): Promise<CreatePixPaymentResult> {
  if (!USE_MERCADO_PAGO) {
    throw new Error("USE_LOCAL_PIX");
  }

  if (!studentEmail) {
    throw new Error("Email do aluno é obrigatório para pagamento via Mercado Pago");
  }
  
  return createMercadoPagoPixPayment({
    invoiceId: invoice.id,
    amount: invoice.amount,
    description: invoice.description || `Mensalidade ${invoice.referenceMonth}`,
    studentName,
    studentEmail,
  });
}

/**
 * Verifica se pagamento foi confirmado
 */
export async function isPaymentConfirmed(invoiceId: string): Promise<boolean> {
  try {
    const result = await checkMercadoPagoPayment(invoiceId);
    return result.isPaid;
  } catch {
    return false;
  }
}

/**
 * Poll para verificar pagamento em tempo real
 * Verifica a cada 5 segundos até confirmar ou timeout
 */
export function pollPaymentStatus(
  invoiceId: string,
  onPaid: () => void,
  onError?: (error: Error) => void,
  timeoutMs: number = 300000 // 5 minutos
): () => void {
  if (!USE_MERCADO_PAGO) {
    console.warn("Mercado Pago não configurado, polling desabilitado");
    return () => {};
  }

  const startTime = Date.now();
  let intervalId: ReturnType<typeof setInterval>;
  let stopped = false;

  const check = async () => {
    if (stopped) return;
    
    // Verifica timeout
    if (Date.now() - startTime > timeoutMs) {
      clearInterval(intervalId);
      return;
    }

    try {
      const result = await checkMercadoPagoPayment(invoiceId);
      
      if (result.isPaid) {
        clearInterval(intervalId);
        onPaid();
      }
    } catch (error: any) {
      console.warn("Erro ao verificar pagamento:", error.message);
    }
  };

  // Inicia polling a cada 5 segundos
  intervalId = setInterval(check, 5000);
  
  // Verifica imediatamente
  check();

  // Retorna função para parar o polling
  return () => {
    stopped = true;
    clearInterval(intervalId);
  };
}

/**
 * Status do pagamento traduzido
 */
export function translatePaymentStatus(status: string): string {
  const translations: Record<string, string> = {
    pending: "Aguardando pagamento",
    approved: "Aprovado",
    authorized: "Autorizado",
    in_process: "Em processamento",
    in_mediation: "Em mediação",
    rejected: "Rejeitado",
    cancelled: "Cancelado",
    refunded: "Devolvido",
    charged_back: "Estornado",
  };
  
  return translations[status] || status;
}

