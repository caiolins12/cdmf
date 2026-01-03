import React, { createContext, useContext, useCallback, useMemo } from "react";
import { doc, setDoc, collection, query, where, getDocs, updateDoc, deleteDoc, orderBy, Timestamp } from "firebase/firestore";
import { db } from "../services/firebase";
import { useAuth, Profile } from "./AuthContext";

// ==================== TIPOS ====================

export type PaymentStatus = "pending" | "paid" | "overdue" | "cancelled";

export type PaymentMethod = "pix" | "cash" | "card" | "transfer";

// Cobrança/Fatura
export type Invoice = {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  amount: number; // em centavos para evitar problemas de float
  description: string;
  dueDate: string; // "YYYY-MM-DD"
  status: PaymentStatus;
  referenceMonth: string; // "2025-01" (para mensalidades)
  classIds?: string[]; // turmas relacionadas
  createdAt: number;
  createdBy: string;
  updatedAt?: number;
  paidAt?: number;
  paidMethod?: PaymentMethod;
  pixCode?: string; // Código PIX gerado
  pixExpiration?: number; // Timestamp de expiração do PIX
  notes?: string;
};

// Transação (entrada ou saída)
export type Transaction = {
  id: string;
  type: "income" | "expense";
  category: string; // "mensalidade", "material", "salario", "aluguel", etc.
  description: string;
  amount: number; // em centavos
  date: string; // "YYYY-MM-DD"
  invoiceId?: string; // referência à fatura (se for pagamento)
  studentId?: string;
  studentName?: string;
  teacherId?: string;
  teacherName?: string;
  paymentMethod?: PaymentMethod;
  createdAt: number;
  createdBy: string;
  notes?: string;
};

// Configurações de pagamento
export type PaymentSettings = {
  monthlyFee: number; // valor padrão da mensalidade em centavos
  pixKey: string; // chave PIX do estabelecimento
  pixKeyType: "cpf" | "cnpj" | "email" | "phone" | "random";
  pixReceiverName: string; // nome do recebedor
  pixCity: string; // cidade do recebedor
  dueDayOfMonth: number; // dia do vencimento (1-28)
  gracePeriodDays: number; // dias de tolerância antes de marcar como atrasado
};

// Resumo financeiro
export type FinancialSummary = {
  totalReceived: number;
  totalPending: number;
  totalOverdue: number;
  totalExpenses: number;
  balance: number;
  invoicesCount: {
    paid: number;
    pending: number;
    overdue: number;
  };
};

// ==================== CONTEXTO ====================

type PaymentContextType = {
  // Faturas
  createInvoice: (data: Omit<Invoice, "id" | "createdAt" | "createdBy" | "status">) => Promise<string>;
  fetchInvoices: (filters?: { studentId?: string; status?: PaymentStatus; month?: string }) => Promise<Invoice[]>;
  updateInvoice: (id: string, data: Partial<Invoice>) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  markAsPaid: (invoiceId: string, method: PaymentMethod, notes?: string) => Promise<void>;
  markAsOverdue: (invoiceId: string) => Promise<void>;
  
  // Transações
  createTransaction: (data: Omit<Transaction, "id" | "createdAt" | "createdBy">) => Promise<string>;
  fetchTransactions: (filters?: { type?: "income" | "expense"; month?: string }) => Promise<Transaction[]>;
  deleteTransaction: (id: string) => Promise<void>;
  
  // PIX
  generatePixCode: (invoice: Invoice) => Promise<string>;
  
  // Relatórios
  getFinancialSummary: (month?: string) => Promise<FinancialSummary>;
  
  // Cobranças em lote
  generateMonthlyInvoices: (students: Profile[], month: string, amount: number) => Promise<number>;
  
  // Atualização automática de status
  updateOverdueInvoices: () => Promise<number>;
  
  // Configurações
  getPaymentSettings: () => Promise<PaymentSettings | null>;
  updatePaymentSettings: (settings: Partial<PaymentSettings>) => Promise<void>;
};

const PaymentContext = createContext<PaymentContextType>({} as PaymentContextType);

// ==================== FUNÇÕES AUXILIARES ====================

// Formata valor de centavos para BRL
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

// Converte reais para centavos
export function toCents(value: number): number {
  return Math.round(value * 100);
}

// Converte centavos para reais
export function toReais(cents: number): number {
  return cents / 100;
}

// Gera ID único
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Verifica se uma data está vencida
function isOverdue(dueDate: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + "T00:00:00");
  return due < today;
}

// Gera payload PIX (EMV QR Code estático simplificado)
function generatePixPayload(
  pixKey: string,
  pixKeyType: string,
  receiverName: string,
  city: string,
  amount: number,
  txId: string,
  description: string
): string {
  // Implementação simplificada do payload PIX
  // Em produção, usar biblioteca específica como 'pix-payload' ou API do banco
  
  const amountStr = (amount / 100).toFixed(2);
  
  // Monta payload EMV
  const payload = [
    "00020126", // Payload Format Indicator
    formatEMVField("26", [
      "0014BR.GOV.BCB.PIX",
      formatEMVField("01", pixKey),
    ].join("")),
    "52040000", // Merchant Category Code
    "5303986", // Transaction Currency (986 = BRL)
    formatEMVField("54", amountStr),
    "5802BR", // Country Code
    formatEMVField("59", receiverName.substring(0, 25)),
    formatEMVField("60", city.substring(0, 15)),
    formatEMVField("62", formatEMVField("05", txId.substring(0, 25))),
  ].join("");
  
  // Adiciona CRC16
  const crc = calculateCRC16(payload + "6304");
  return payload + "6304" + crc;
}

function formatEMVField(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return id + len + value;
}

function calculateCRC16(str: string): string {
  // CRC16-CCITT-FALSE
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");
}

// ==================== PROVIDER ====================

export function PaymentProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();

  // ========== FATURAS ==========

  const createInvoice = useCallback(async (
    data: Omit<Invoice, "id" | "createdAt" | "createdBy" | "status">
  ): Promise<string> => {
    if (!profile) throw new Error("Usuário não autenticado");

    const id = generateId("INV");
    const invoice: Invoice = {
      ...data,
      id,
      status: "pending",
      createdAt: Date.now(),
      createdBy: profile.uid,
    };

    await setDoc(doc(db, "invoices", id), invoice);
    return id;
  }, [profile]);

  const fetchInvoices = useCallback(async (
    filters?: { studentId?: string; status?: PaymentStatus; month?: string }
  ): Promise<Invoice[]> => {
    try {
      const invoicesRef = collection(db, "invoices");
      let constraints: any[] = [];

      if (filters?.studentId) {
        constraints.push(where("studentId", "==", filters.studentId));
      }
      if (filters?.status) {
        constraints.push(where("status", "==", filters.status));
      }
      if (filters?.month) {
        constraints.push(where("referenceMonth", "==", filters.month));
      }

      const q = constraints.length > 0 
        ? query(invoicesRef, ...constraints)
        : query(invoicesRef);
      
      const snap = await getDocs(q);
      const invoices = snap.docs.map(d => d.data() as Invoice);
      
      // Ordena por data de vencimento
      return invoices.sort((a, b) => 
        new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      );
    } catch (e) {
      console.error("Erro ao buscar faturas:", e);
      return [];
    }
  }, []);

  const updateInvoice = useCallback(async (id: string, data: Partial<Invoice>): Promise<void> => {
    const ref = doc(db, "invoices", id);
    await updateDoc(ref, { ...data, updatedAt: Date.now() });
  }, []);

  const deleteInvoice = useCallback(async (id: string): Promise<void> => {
    await deleteDoc(doc(db, "invoices", id));
  }, []);

  const markAsPaid = useCallback(async (
    invoiceId: string, 
    method: PaymentMethod, 
    notes?: string
  ): Promise<void> => {
    if (!profile) throw new Error("Usuário não autenticado");

    const ref = doc(db, "invoices", invoiceId);
    const now = Date.now();
    
    // Atualiza a fatura
    await updateDoc(ref, {
      status: "paid",
      paidAt: now,
      paidMethod: method,
      updatedAt: now,
      ...(notes ? { notes } : {}),
    });

    // Busca dados da fatura para criar transação
    const invoicesRef = collection(db, "invoices");
    const q = query(invoicesRef, where("id", "==", invoiceId));
    const snap = await getDocs(q);
    
    if (!snap.empty) {
      const invoice = snap.docs[0].data() as Invoice;
      
      // Cria transação de entrada
      const transactionId = generateId("TXN");
      const transaction: Transaction = {
        id: transactionId,
        type: "income",
        category: "mensalidade",
        description: `Pagamento - ${invoice.studentName} (${invoice.referenceMonth})`,
        amount: invoice.amount,
        date: new Date().toISOString().split("T")[0],
        invoiceId,
        studentId: invoice.studentId,
        studentName: invoice.studentName,
        paymentMethod: method,
        createdAt: now,
        createdBy: profile.uid,
      };

      await setDoc(doc(db, "transactions", transactionId), transaction);
    }
  }, [profile]);

  const markAsOverdue = useCallback(async (invoiceId: string): Promise<void> => {
    const ref = doc(db, "invoices", invoiceId);
    await updateDoc(ref, {
      status: "overdue",
      updatedAt: Date.now(),
    });
  }, []);

  // ========== TRANSAÇÕES ==========

  const createTransaction = useCallback(async (
    data: Omit<Transaction, "id" | "createdAt" | "createdBy">
  ): Promise<string> => {
    if (!profile) throw new Error("Usuário não autenticado");

    const id = generateId("TXN");
    const transaction: Transaction = {
      ...data,
      id,
      createdAt: Date.now(),
      createdBy: profile.uid,
    };

    await setDoc(doc(db, "transactions", id), transaction);
    return id;
  }, [profile]);

  const fetchTransactions = useCallback(async (
    filters?: { type?: "income" | "expense"; month?: string }
  ): Promise<Transaction[]> => {
    try {
      const transactionsRef = collection(db, "transactions");
      let constraints: any[] = [];

      if (filters?.type) {
        constraints.push(where("type", "==", filters.type));
      }

      const q = constraints.length > 0 
        ? query(transactionsRef, ...constraints)
        : query(transactionsRef);
      
      const snap = await getDocs(q);
      let transactions = snap.docs.map(d => d.data() as Transaction);

      // Filtra por mês no cliente (para evitar índice composto)
      if (filters?.month) {
        transactions = transactions.filter(t => t.date.startsWith(filters.month!));
      }
      
      // Ordena por data
      return transactions.sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    } catch (e) {
      console.error("Erro ao buscar transações:", e);
      return [];
    }
  }, []);

  const deleteTransaction = useCallback(async (id: string): Promise<void> => {
    await deleteDoc(doc(db, "transactions", id));
  }, []);

  // ========== PIX ==========

  const generatePixCode = useCallback(async (invoice: Invoice): Promise<string> => {
    // Busca configurações
    const settings = await getPaymentSettings();
    
    if (!settings?.pixKey) {
      throw new Error("Chave PIX não configurada");
    }

    const txId = invoice.id.replace(/[^a-zA-Z0-9]/g, "").substring(0, 25);
    
    const pixCode = generatePixPayload(
      settings.pixKey,
      settings.pixKeyType,
      settings.pixReceiverName,
      settings.pixCity,
      invoice.amount,
      txId,
      invoice.description
    );

    // Salva o código PIX na fatura
    await updateInvoice(invoice.id, {
      pixCode,
      pixExpiration: Date.now() + (24 * 60 * 60 * 1000), // 24 horas
    });

    return pixCode;
  }, [updateInvoice]);

  // ========== RELATÓRIOS ==========

  const getFinancialSummary = useCallback(async (month?: string): Promise<FinancialSummary> => {
    const currentMonth = month || new Date().toISOString().slice(0, 7);
    
    // Busca faturas do mês
    const invoices = await fetchInvoices({ month: currentMonth });
    
    // Busca transações do mês
    const transactions = await fetchTransactions({ month: currentMonth });

    const paid = invoices.filter(i => i.status === "paid");
    const pending = invoices.filter(i => i.status === "pending");
    const overdue = invoices.filter(i => i.status === "overdue");

    const totalReceived = transactions
      .filter(t => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const totalExpenses = transactions
      .filter(t => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    const totalPending = pending.reduce((sum, i) => sum + i.amount, 0);
    const totalOverdue = overdue.reduce((sum, i) => sum + i.amount, 0);

    return {
      totalReceived,
      totalPending,
      totalOverdue,
      totalExpenses,
      balance: totalReceived - totalExpenses,
      invoicesCount: {
        paid: paid.length,
        pending: pending.length,
        overdue: overdue.length,
      },
    };
  }, [fetchInvoices, fetchTransactions]);

  // ========== COBRANÇAS EM LOTE ==========

  const generateMonthlyInvoices = useCallback(async (
    students: Profile[],
    month: string,
    amount: number
  ): Promise<number> => {
    if (!profile) throw new Error("Usuário não autenticado");

    // Busca faturas existentes do mês
    const existingInvoices = await fetchInvoices({ month });
    const existingStudentIds = new Set(existingInvoices.map(i => i.studentId));

    // Filtra alunos que ainda não têm fatura
    const studentsToInvoice = students.filter(
      s => s.enrollmentStatus === "ativo" && !existingStudentIds.has(s.uid)
    );

    // Calcula data de vencimento (dia 10 do mês seguinte)
    const [year, monthNum] = month.split("-").map(Number);
    const dueDate = new Date(year, monthNum, 10).toISOString().split("T")[0];

    // Cria faturas
    let created = 0;
    for (const student of studentsToInvoice) {
      try {
        await createInvoice({
          studentId: student.uid,
          studentName: student.name,
          studentEmail: student.email,
          amount,
          description: `Mensalidade ${month}`,
          dueDate,
          referenceMonth: month,
          classIds: student.classes || [],
        });
        created++;
      } catch (e) {
        console.error(`Erro ao criar fatura para ${student.name}:`, e);
      }
    }

    return created;
  }, [profile, fetchInvoices, createInvoice]);

  // ========== ATUALIZAÇÃO AUTOMÁTICA ==========

  const updateOverdueInvoices = useCallback(async (): Promise<number> => {
    const pendingInvoices = await fetchInvoices({ status: "pending" });
    
    let updated = 0;
    for (const invoice of pendingInvoices) {
      if (isOverdue(invoice.dueDate)) {
        await markAsOverdue(invoice.id);
        updated++;
      }
    }

    return updated;
  }, [fetchInvoices, markAsOverdue]);

  // ========== CONFIGURAÇÕES ==========

  const getPaymentSettings = useCallback(async (): Promise<PaymentSettings | null> => {
    try {
      const settingsRef = collection(db, "settings");
      const q = query(settingsRef, where("type", "==", "payment"));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        // Retorna configurações padrão
        return {
          monthlyFee: 9100, // R$ 91,00
          pixKey: "",
          pixKeyType: "cpf",
          pixReceiverName: "CDMF",
          pixCity: "SAO PAULO",
          dueDayOfMonth: 10,
          gracePeriodDays: 5,
        };
      }
      
      return snap.docs[0].data() as PaymentSettings;
    } catch (e) {
      console.error("Erro ao buscar configurações:", e);
      return null;
    }
  }, []);

  const updatePaymentSettings = useCallback(async (settings: Partial<PaymentSettings>): Promise<void> => {
    const ref = doc(db, "settings", "payment");
    await setDoc(ref, { ...settings, type: "payment" }, { merge: true });
  }, []);

  // ==================== VALUE ====================

  const value = useMemo(
    () => ({
      // Faturas
      createInvoice,
      fetchInvoices,
      updateInvoice,
      deleteInvoice,
      markAsPaid,
      markAsOverdue,
      // Transações
      createTransaction,
      fetchTransactions,
      deleteTransaction,
      // PIX
      generatePixCode,
      // Relatórios
      getFinancialSummary,
      // Lote
      generateMonthlyInvoices,
      updateOverdueInvoices,
      // Configurações
      getPaymentSettings,
      updatePaymentSettings,
    }),
    [
      createInvoice,
      fetchInvoices,
      updateInvoice,
      deleteInvoice,
      markAsPaid,
      markAsOverdue,
      createTransaction,
      fetchTransactions,
      deleteTransaction,
      generatePixCode,
      getFinancialSummary,
      generateMonthlyInvoices,
      updateOverdueInvoices,
      getPaymentSettings,
      updatePaymentSettings,
    ]
  );

  return <PaymentContext.Provider value={value}>{children}</PaymentContext.Provider>;
}

export function usePayment() {
  const ctx = useContext(PaymentContext);
  if (!ctx) throw new Error("usePayment must be used within <PaymentProvider>");
  return ctx;
}

