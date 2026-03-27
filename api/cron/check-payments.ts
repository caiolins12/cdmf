import { ApiRequest, ApiResponse } from "../../server/http";
import { handlePendingPixPayments } from "../../server/payments";

/**
 * Vercel Cron Job — verifica pagamentos PIX pendentes.
 * Roda 1x por dia (rede de segurança). A checagem principal
 * ocorre a cada interação do aluno no chatbot (checkAndNotifyPaidInvoices).
 */
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  // Verificar autorização do cron
  const authHeader = req.headers["authorization"];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const result = await handlePendingPixPayments();
    res.status(200).json(result);
  } catch (error) {
    console.error("[Cron] Erro ao verificar pagamentos:", error);
    res.status(500).json({ error: "Internal error" });
  }
}
