import React, { useEffect, useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, Alert, ActivityIndicator, RefreshControl, Platform } from "react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";

import CdmfHeader from "../../components/CdmfHeader";
import SectionHeader from "../../components/SectionHeader";
import MasterHeader from "../../components/MasterHeader";
import { colors } from "../../theme/colors";
import { useDesktop } from "../../contexts/DesktopContext";
import { useAuth, Profile } from "../../contexts/AuthContext";
import { usePayment, Invoice, Transaction, formatCurrency, toCents, toReais, PaymentMethod, FinancialSummary, TierPricing, PaymentSettings } from "../../contexts/PaymentContext";
import { useActivity } from "../../contexts/ActivityContext";

type FilterMonth = string;
type StatusFilter = "all" | "pending" | "overdue" | "paid";
type SortOption = "name_asc" | "name_desc" | "amount_asc" | "amount_desc" | "date_asc" | "date_desc";

// Formata mês para exibição
function formatMonthDisplay(month: string): string {
  const [year, m] = month.split("-");
  const months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
  return `${months[parseInt(m) - 1]}/${year}`;
}

// Função segura para formatar data no formato DD/MM/YYYY
const formatDateSafe = (dateStr: any): string => {
  if (!dateStr || typeof dateStr !== 'string') return '--/--/----';
  try {
    return dateStr.split("-").reverse().join("/");
  } catch {
    return '--/--/----';
  }
};

// Gera lista de últimos 12 meses (para o picker)
function getRecentMonths(count: number = 12): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

// Formata mês para exibição longa (ex: "Janeiro 2025")
function formatMonthDisplayLong(month: string): string {
  const [year, m] = month.split("-");
  const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${months[parseInt(m) - 1]} ${year}`;
}

// Navega para mês anterior ou próximo
function navigateMonth(currentMonth: string, direction: "prev" | "next"): string {
  const [year, m] = currentMonth.split("-").map(Number);
  const date = new Date(year, m - 1 + (direction === "next" ? 1 : -1), 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// ==================== FORMATAÇÃO DE CHAVE PIX ====================

// Formata CPF: XXX.XXX.XXX-XX
function formatCPF(value: string): string {
  const numbers = value.replace(/\D/g, "").slice(0, 11);
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 6) return `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
  if (numbers.length <= 9) return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`;
  return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9)}`;
}

// Formata CNPJ: XX.XXX.XXX/XXXX-XX
function formatCNPJ(value: string): string {
  const numbers = value.replace(/\D/g, "").slice(0, 14);
  if (numbers.length <= 2) return numbers;
  if (numbers.length <= 5) return `${numbers.slice(0, 2)}.${numbers.slice(2)}`;
  if (numbers.length <= 8) return `${numbers.slice(0, 2)}.${numbers.slice(2, 5)}.${numbers.slice(5)}`;
  if (numbers.length <= 12) return `${numbers.slice(0, 2)}.${numbers.slice(2, 5)}.${numbers.slice(5, 8)}/${numbers.slice(8)}`;
  return `${numbers.slice(0, 2)}.${numbers.slice(2, 5)}.${numbers.slice(5, 8)}/${numbers.slice(8, 12)}-${numbers.slice(12)}`;
}

// Formata Telefone: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
function formatPhone(value: string): string {
  const numbers = value.replace(/\D/g, "").slice(0, 11);
  if (numbers.length <= 2) return numbers.length ? `(${numbers}` : "";
  if (numbers.length <= 6) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
  if (numbers.length <= 10) return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6)}`;
  return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
}

// Valida formato de email básico
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Remove acentos e caracteres especiais (para nome/cidade PIX)
function removeAccents(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .toUpperCase();
}

// Formata chave PIX baseado no tipo selecionado
function formatPixKey(value: string, type: "cpf" | "cnpj" | "email" | "phone" | "random"): string {
  switch (type) {
    case "cpf":
      return formatCPF(value);
    case "cnpj":
      return formatCNPJ(value);
    case "phone":
      return formatPhone(value);
    case "email":
      return value.toLowerCase().trim();
    case "random":
    default:
      return value.trim();
  }
}

// Retorna placeholder baseado no tipo
function getPixKeyPlaceholder(type: "cpf" | "cnpj" | "email" | "phone" | "random"): string {
  switch (type) {
    case "cpf": return "000.000.000-00";
    case "cnpj": return "00.000.000/0000-00";
    case "phone": return "(00) 00000-0000";
    case "email": return "email@exemplo.com";
    case "random": return "Chave aleatória (EVP)";
    default: return "";
  }
}

// Retorna tipo de teclado baseado no tipo de chave
function getPixKeyboardType(type: "cpf" | "cnpj" | "email" | "phone" | "random"): "default" | "numeric" | "email-address" | "phone-pad" {
  switch (type) {
    case "cpf":
    case "cnpj":
    case "phone":
      return "phone-pad";
    case "email":
      return "email-address";
    case "random":
    default:
      return "default";
  }
}

// Valida chave PIX
function validatePixKey(value: string, type: "cpf" | "cnpj" | "email" | "phone" | "random"): { valid: boolean; message?: string } {
  if (!value.trim()) return { valid: false, message: "Informe a chave PIX" };
  
  switch (type) {
    case "cpf":
      const cpfNumbers = value.replace(/\D/g, "");
      if (cpfNumbers.length !== 11) return { valid: false, message: "CPF deve ter 11 dígitos" };
      return { valid: true };
    case "cnpj":
      const cnpjNumbers = value.replace(/\D/g, "");
      if (cnpjNumbers.length !== 14) return { valid: false, message: "CNPJ deve ter 14 dígitos" };
      return { valid: true };
    case "phone":
      const phoneNumbers = value.replace(/\D/g, "");
      if (phoneNumbers.length < 10 || phoneNumbers.length > 11) return { valid: false, message: "Telefone inválido" };
      return { valid: true };
    case "email":
      if (!isValidEmail(value)) return { valid: false, message: "Email inválido" };
      return { valid: true };
    case "random":
      if (value.length < 10) return { valid: false, message: "Chave muito curta" };
      return { valid: true };
    default:
      return { valid: true };
  }
}

// ==================== COMPONENTES ====================

function StatCard({ 
  title,
  value,
  subtitle,
  icon,
  color,
  bgColor,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bgColor: string;
}) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={[styles.statIconBox, { backgroundColor: bgColor }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={styles.statContent}>
        <Text style={styles.statTitle}>{title}</Text>
        <Text style={[styles.statValue, { color }]}>{value}</Text>
        {subtitle && <Text style={styles.statSubtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
}

function QuickAction({ 
  icon, 
  label,
  onPress,
  disabled,
  variant = "default",
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap; 
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "default" | "primary" | "success" | "outline";
  style?: any;
}) {
  const bgColors = {
    default: "#F8FAFC",
    primary: colors.purple,
    success: colors.green,
    outline: "#fff",
  };
  const textColors = {
    default: colors.text,
    primary: "#fff",
    success: "#fff",
    outline: colors.text,
  };

  return (
    <Pressable 
      style={({ pressed }) => [
        styles.quickAction,
        variant === "outline" && styles.quickActionOutline,
        { backgroundColor: bgColors[variant], opacity: pressed ? 0.8 : disabled ? 0.5 : 1 },
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons name={icon} size={16} color={textColors[variant]} />
      <Text style={[styles.quickActionText, { color: textColors[variant] }]}>{label}</Text>
    </Pressable>
  );
}

function InvoiceCard({ 
  invoice, 
  onPix, 
  onMarkPaid,
  isDesktop = false,
}: { 
  invoice: Invoice; 
  onPix: () => void; 
  onMarkPaid: () => void;
  isDesktop?: boolean;
}) {
  const isOverdue = invoice.status === "overdue";
  const hasMpPending = invoice.mpPaymentId && invoice.mpStatus === "pending";
  
  // Define cores do status
  let statusColor = isOverdue ? colors.danger : "#D97706";
  let statusBg = isOverdue ? "#FEF2F2" : "#FEF3C7";
  let statusText = isOverdue ? "Atrasado" : "Pendente";
  let statusIcon: keyof typeof Ionicons.glyphMap = isOverdue ? "alert-circle" : "time";
  
  // Se tem PIX Mercado Pago pendente, mostra status especial
  if (hasMpPending) {
    statusColor = colors.purple;
    statusBg = "#F3E8FF";
    statusText = "Aguardando PIX";
    statusIcon = "qr-code";
  }
  
  // Calcula dias até/desde vencimento
  const today = new Date();
  const dueDate = new Date(invoice.dueDate);
  const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  let dueDateLabel = "";
  if (diffDays === 0) dueDateLabel = "Vence hoje";
  else if (diffDays === 1) dueDateLabel = "Vence amanhã";
  else if (diffDays > 1) dueDateLabel = `Vence em ${diffDays} dias`;
  else if (diffDays === -1) dueDateLabel = "Venceu ontem";
  else dueDateLabel = `Vencido há ${Math.abs(diffDays)} dias`;

  return (
    <View style={[styles.invoiceCardNew, isOverdue && styles.invoiceCardOverdue]}>
      {/* Barra lateral de status */}
      <View style={[styles.invoiceStatusBar, { backgroundColor: statusColor }]} />
      
      <View style={styles.invoiceCardContent}>
        {/* Cabeçalho com nome e valor */}
        <View style={styles.invoiceCardHeader}>
          <View style={styles.invoiceCardLeft}>
            <View style={styles.invoiceCardNameRow}>
              <Text style={styles.invoiceCardName} numberOfLines={1}>{invoice.studentName}</Text>
              <View style={[styles.invoiceStatusChip, { backgroundColor: statusBg }]}>
                <Ionicons name={statusIcon} size={12} color={statusColor} />
                <Text style={[styles.invoiceStatusChipText, { color: statusColor }]}>{statusText}</Text>
              </View>
            </View>
            <Text style={styles.invoiceCardRef} numberOfLines={1}>
              {invoice.description || `Ref: ${invoice.referenceMonth}`}
            </Text>
            <Text style={styles.invoiceCardDueText}>{dueDateLabel}</Text>
          </View>
          <Text style={[styles.invoiceCardAmount, { color: statusColor }]}>{formatCurrency(invoice.amount)}</Text>
        </View>
        
        {/* Informações adicionais */}
        {invoice.classCount && invoice.classCount > 0 && (
          <View style={styles.invoiceCardExtra}>
            <Ionicons name="albums-outline" size={12} color="#94A3B8" />
            <Text style={styles.invoiceCardExtraText}>{invoice.classCount} turma(s)</Text>
          </View>
        )}
        
        {hasMpPending && (
          <View style={styles.invoiceMpBadge}>
            <Ionicons name="logo-google" size={12} color={colors.purple} />
            <Text style={styles.invoiceMpBadgeText}>PIX gerado via Mercado Pago</Text>
          </View>
        )}
        
        {/* Ações */}
        <View style={[styles.invoiceCardActions, isDesktop && styles.invoiceCardActionsDesktop]}>
          <Pressable style={[styles.invoiceActionBtn, isDesktop && styles.invoiceActionBtnDesktop]} onPress={onPix}>
            <Ionicons name="qr-code-outline" size={16} color={colors.purple} />
            <Text style={styles.invoiceActionBtnText}>{hasMpPending ? "Ver PIX" : "Gerar PIX"}</Text>
          </Pressable>
          <Pressable style={[styles.invoiceActionBtn, styles.invoiceActionBtnPrimary, isDesktop && styles.invoiceActionBtnDesktop]} onPress={onMarkPaid}>
            <Ionicons name="checkmark-circle" size={16} color="#fff" />
            <Text style={[styles.invoiceActionBtnText, { color: "#fff" }]}>Marcar como Pago</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function PaidCard({ invoice }: { invoice: Invoice }) {
  const methodConfig: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
    pix: { label: "PIX", icon: "qr-code-outline", color: "#059669" },
    pix_mercadopago: { label: "PIX (MP)", icon: "logo-google", color: colors.purple },
    cash: { label: "Dinheiro", icon: "cash-outline", color: "#059669" },
    card: { label: "Cartão", icon: "card-outline", color: "#3B82F6" },
    transfer: { label: "Transferência", icon: "swap-horizontal-outline", color: "#8B5CF6" },
  };
  
  const method = methodConfig[invoice.paidMethod || "pix"] || methodConfig.pix;
  const paidDate = invoice.paidAt ? new Date(invoice.paidAt) : null;

  return (
    <View style={styles.paidCardNew}>
      <View style={[styles.paidCardIcon, { backgroundColor: "#D1FAE5" }]}>
        <Ionicons name="checkmark-circle" size={22} color="#059669" />
      </View>
      <View style={styles.paidCardInfo}>
        <Text style={styles.paidCardName} numberOfLines={1}>{invoice.studentName}</Text>
        <View style={styles.paidCardMeta}>
          <Text style={styles.paidCardDate}>
            {paidDate ? paidDate.toLocaleDateString("pt-BR") : ""}
          </Text>
          <View style={styles.paidCardMethodBadge}>
            <Ionicons name={method.icon} size={12} color={method.color} />
            <Text style={[styles.paidCardMethodText, { color: method.color }]}>{method.label}</Text>
          </View>
        </View>
      </View>
      <View style={styles.paidCardAmountBox}>
        <Text style={styles.paidCardAmount}>{formatCurrency(invoice.amount)}</Text>
        <Text style={styles.paidCardRef}>{invoice.referenceMonth ? formatMonthDisplay(invoice.referenceMonth) : ""}</Text>
      </View>
    </View>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon} size={40} color="#CBD5E1" />
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
    </View>
  );
}

// ==================== TELA PRINCIPAL ====================

export default function TeacherFinanceScreen() {
  const { isDesktopMode } = useDesktop();
  const { fetchStudents, fetchClasses, profile, isMaster } = useAuth();
  const { 
    fetchInvoices, 
    fetchTransactions, 
    getFinancialSummary, 
    createInvoice,
    markAsPaid,
    generateMonthlyInvoices,
    updateOverdueInvoices,
    generatePixCode,
    getPaymentSettings,
    updatePaymentSettings,
    generateInvoiceForStudent,
    deleteInvoice,
    subscribeToAllInvoices,
    clearAllFinancialData,
  } = usePayment();
  const { logActivity } = useActivity();

  // State
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState(getRecentMonths()[0]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [students, setStudents] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filtros avançados
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("name_asc");
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  // Modals
  const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPixModal, setShowPixModal] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false); // Menu de valores/descontos
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showStudentAccountModal, setShowStudentAccountModal] = useState(false); // Controle de contas
  const [showInitialInvoicesModal, setShowInitialInvoicesModal] = useState(false); // Geração inicial
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedStudentForAccount, setSelectedStudentForAccount] = useState<Profile | null>(null);
  const [customInvoiceAmount, setCustomInvoiceAmount] = useState("");
  const [customInvoiceDescription, setCustomInvoiceDescription] = useState("");
  
  // Formata valor monetário com máscara enquanto digita (entrada em centavos)
  const formatCurrencyInput = (value: string): string => {
    // Remove tudo exceto números
    const numbers = value.replace(/\D/g, "");
    if (!numbers) return "";
    
    // Converte para centavos e depois para reais
    const cents = parseInt(numbers, 10);
    const reais = cents / 100;
    
    // Formata como moeda brasileira
    return reais.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };
  
  // Formata número em reais para string (ex: 50.00 → "50,00")
  const formatReaisToString = (reais: number): string => {
    return reais.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };
  
  // Extrai valor numérico da string formatada
  const parseCurrencyInput = (formatted: string): number => {
    if (!formatted) return 0;
    // Remove pontos de milhar e substitui vírgula por ponto
    const normalized = formatted.replace(/\./g, "").replace(",", ".");
    return parseFloat(normalized) || 0;
  };
  
  const handleCustomInvoiceAmountChange = (text: string) => {
    const formatted = formatCurrencyInput(text);
    setCustomInvoiceAmount(formatted);
  };

  // Form states
  const [newInvoiceStudentIds, setNewInvoiceStudentIds] = useState<string[]>([]);
  const [newInvoiceAmount, setNewInvoiceAmount] = useState("91,00");
  const [newInvoiceDescription, setNewInvoiceDescription] = useState("");
  const [newInvoiceDueDate, setNewInvoiceDueDate] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [pixCode, setPixCode] = useState("");
  const [processing, setProcessing] = useState(false);
  
  // Filtros e tipo de cobrança
  type StudentFilter = "todos" | "masculino" | "feminino" | "condutor" | "conduzido" | "ambos";
  type InvoiceType = "mensalidade" | "baile" | "workshop" | "outro";
  const [studentFilter, setStudentFilter] = useState<StudentFilter>("todos");
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("mensalidade");

  // Settings form
  const [settingsPixKey, setSettingsPixKey] = useState("");
  const [settingsPixKeyType, setSettingsPixKeyType] = useState<"cpf" | "cnpj" | "email" | "phone" | "random">("cpf");
  const [settingsReceiverName, setSettingsReceiverName] = useState("");
  const [settingsCity, setSettingsCity] = useState("");
  const [pixKeyError, setPixKeyError] = useState("");
  const [settingsMonthlyFee, setSettingsMonthlyFee] = useState("10.90");
  const [settingsDueDayOfMonth, setSettingsDueDayOfMonth] = useState("1");
  const [settingsLatePaymentDeadline, setSettingsLatePaymentDeadline] = useState("8");
  // Tabela de preços por turmas
  const [tierPricing, setTierPricing] = useState<TierPricing[]>([
    { classes: 1, earlyPrice: 990, regularPrice: 1090 },
    { classes: 2, earlyPrice: 1780, regularPrice: 1980 },
    { classes: 3, earlyPrice: 2520, regularPrice: 2820 },
    { classes: 4, earlyPrice: 3160, regularPrice: 3560 },
  ]);

  const recentMonths = getRecentMonths();

  const loadData = useCallback(async () => {
    try {
      const [invoicesData, transactionsData, summaryData, studentsData] = await Promise.all([
        fetchInvoices({ month }),
        fetchTransactions({ month }),
        getFinancialSummary(month),
        fetchStudents(),
      ]);
      
      setInvoices(invoicesData);
      setTransactions(transactionsData);
      setSummary(summaryData);
      setStudents(studentsData.filter(s => s.enrollmentStatus === "ativo"));

      await updateOverdueInvoices();
    } catch (e) {
      console.error("Erro ao carregar dados financeiros:", e);
    } finally {
      setLoading(false);
    }
  }, [month, fetchInvoices, fetchTransactions, getFinancialSummary, fetchStudents, updateOverdueInvoices]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );
  
  // Real-time subscription para faturas (atualiza quando pagamentos acontecem)
  useEffect(() => {
    const unsubscribe = subscribeToAllInvoices((allInvoices) => {
      // Filtra por mês no cliente
      const monthInvoices = allInvoices.filter(inv => inv.referenceMonth === month);
      setInvoices(monthInvoices);
    }, { month });
    
    return () => unsubscribe();
  }, [month, subscribeToAllInvoices]);

  // Atualiza automaticamente o mês quando um novo mês começa
  useEffect(() => {
    const checkCurrentMonth = () => {
      const currentMonth = getRecentMonths()[0];
      const currentDate = new Date();
      const selectedDate = new Date(month.split("-")[0], parseInt(month.split("-")[1]) - 1, 1);
      
      // Se o mês selecionado é o mês anterior ao atual, atualiza automaticamente para o mês atual
      // Isso garante que quando fevereiro chegar, se o usuário estava em janeiro, será atualizado
      const previousMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
      
      if (
        month !== currentMonth &&
        selectedDate.getFullYear() === previousMonth.getFullYear() &&
        selectedDate.getMonth() === previousMonth.getMonth()
      ) {
        setMonth(currentMonth);
      }
    };

    // Verifica imediatamente ao montar e quando o mês muda
    checkCurrentMonth();

    // Verifica a cada hora para detectar mudança de mês (mais eficiente que a cada minuto)
    const interval = setInterval(checkCurrentMonth, 3600000);

    return () => clearInterval(interval);
  }, [month]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Dados de alunos enriquecidos com status de pagamento
  const enrichedStudents = students.map(student => {
    const studentInvoices = invoices.filter(inv => inv.studentId === student.uid);
    const pendingInvoices = studentInvoices.filter(inv => inv.status === "pending");
    const overdueInvoices = studentInvoices.filter(inv => inv.status === "overdue");
    const paidInvoices = studentInvoices.filter(inv => inv.status === "paid");
    
    const totalPending = [...pendingInvoices, ...overdueInvoices]
      .reduce((acc, inv) => acc + inv.amount, 0);
    const totalPaid = paidInvoices.reduce((acc, inv) => acc + inv.amount, 0);
    
    let paymentStatus: "em_dia" | "pendente" | "atrasado" | "sem_cobranca" = "sem_cobranca";
    if (studentInvoices.length === 0) {
      paymentStatus = "sem_cobranca";
    } else if (overdueInvoices.length > 0) {
      paymentStatus = "atrasado";
    } else if (pendingInvoices.length > 0) {
      paymentStatus = "pendente";
    } else {
      paymentStatus = "em_dia";
    }
    
    const lastPayment = paidInvoices
      .filter(inv => inv.paidAt)
      .sort((a, b) => new Date(b.paidAt!).getTime() - new Date(a.paidAt!).getTime())[0];
    
    return {
      ...student,
      invoiceCount: studentInvoices.length,
      pendingCount: pendingInvoices.length + overdueInvoices.length,
      paidCount: paidInvoices.length,
      totalPending,
      totalPaid,
      paymentStatus,
      lastPaymentDate: lastPayment?.paidAt || null,
    };
  });

  // Filtro de busca e status para alunos
  const filteredStudents = enrichedStudents.filter(student => {
    const q = query.trim().toLowerCase();
    const matchesQuery = !q || student.name.toLowerCase().includes(q) || (student.email && student.email.toLowerCase().includes(q));
    
    let matchesStatus = true;
    if (statusFilter === "pending") {
      matchesStatus = student.paymentStatus === "pendente";
    } else if (statusFilter === "overdue") {
      matchesStatus = student.paymentStatus === "atrasado";
    } else if (statusFilter === "paid") {
      matchesStatus = student.paymentStatus === "em_dia";
    }
    
    return matchesQuery && matchesStatus;
  });

  // Ordenação de alunos
  const sortedStudents = [...filteredStudents].sort((a, b) => {
    switch (sortOption) {
      case "name_asc":
        return a.name.localeCompare(b.name);
      case "name_desc":
        return b.name.localeCompare(a.name);
      case "amount_asc":
        return a.totalPending - b.totalPending;
      case "amount_desc":
        return b.totalPending - a.totalPending;
      case "date_asc":
        return (a.lastPaymentDate || "").localeCompare(b.lastPaymentDate || "");
      case "date_desc":
        return (b.lastPaymentDate || "").localeCompare(a.lastPaymentDate || "");
      default:
        return 0;
    }
  });
  
  // Contadores de status
  const statusCounts = {
    all: enrichedStudents.length,
    pending: enrichedStudents.filter(s => s.paymentStatus === "pendente").length,
    overdue: enrichedStudents.filter(s => s.paymentStatus === "atrasado").length,
    paid: enrichedStudents.filter(s => s.paymentStatus === "em_dia").length,
  };

  // Filtro de busca para faturas
  const filteredInvoices = invoices.filter(inv => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return inv.studentName.toLowerCase().includes(q) || inv.studentEmail.toLowerCase().includes(q);
  });

  const pendingInvoices = filteredInvoices.filter(i => i.status === "pending" || i.status === "overdue");
  const paidInvoices = filteredInvoices.filter(i => i.status === "paid");

  // Paginação para listas grandes
  const ITEMS_PER_PAGE = 15;
  const [pendingDisplayLimit, setPendingDisplayLimit] = useState(ITEMS_PER_PAGE);
  const [paidDisplayLimit, setPaidDisplayLimit] = useState(ITEMS_PER_PAGE);
  const [studentAccountDisplayLimit, setStudentAccountDisplayLimit] = useState(ITEMS_PER_PAGE);
  
  // Modo de seleção em lote
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Reset pagination when query or month changes
  useEffect(() => {
    setPendingDisplayLimit(ITEMS_PER_PAGE);
    setPaidDisplayLimit(ITEMS_PER_PAGE);
    setStudentAccountDisplayLimit(ITEMS_PER_PAGE);
  }, [query, month]);

  // Filtra alunos baseado no filtro selecionado
  const getFilteredStudents = useCallback(() => {
    return students.filter(s => {
      if (studentFilter === "todos") return true;
      if (studentFilter === "masculino") return s.gender === "masculino";
      if (studentFilter === "feminino") return s.gender === "feminino";
      if (studentFilter === "condutor") return s.dancePreference === "condutor";
      if (studentFilter === "conduzido") return s.dancePreference === "conduzido";
      if (studentFilter === "ambos") return s.dancePreference === "ambos";
      return true;
    });
  }, [students, studentFilter]);

  // Seleciona todos os alunos (ou todos filtrados)
  const selectAllStudents = useCallback(() => {
    const filtered = getFilteredStudents();
    const allIds = filtered.map(s => s.uid);
    setNewInvoiceStudentIds(allIds);
  }, [getFilteredStudents]);

  // Desseleciona todos os alunos
  const deselectAllStudents = useCallback(() => {
    setNewInvoiceStudentIds([]);
  }, []);

  // Abre o modal de nova cobrança com estado resetado
  const openCreateInvoiceModal = useCallback(() => {
    setNewInvoiceStudentIds([]);
    setNewInvoiceAmount("91,00");
    setNewInvoiceDescription("");
    setNewInvoiceDueDate("");
    setStudentFilter("todos");
    setInvoiceType("mensalidade");
    setShowCreateInvoiceModal(true);
  }, []);

  // Verifica se todos os alunos filtrados estão selecionados
  const areAllFilteredSelected = useMemo(() => {
    const filtered = getFilteredStudents();
    if (filtered.length === 0) return false;
    return filtered.every(s => newInvoiceStudentIds.includes(s.uid));
  }, [getFilteredStudents, newInvoiceStudentIds]);

  // Retorna a descrição padrão baseada no tipo de cobrança
  const getDefaultDescription = useCallback(() => {
    switch (invoiceType) {
      case "mensalidade": return `Mensalidade ${formatMonthDisplay(month)}`;
      case "baile": return "Ingresso Baile";
      case "workshop": return "Workshop";
      default: return "";
    }
  }, [invoiceType, month]);

  // Toggle seleção de aluno para cobrança
  const toggleStudentSelection = (studentId: string) => {
    setNewInvoiceStudentIds(prev => 
      prev.includes(studentId) 
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  // Handlers
  // Handler para mudança de valor na nova cobrança
  const handleNewInvoiceAmountChange = (text: string) => {
    const formatted = formatCurrencyInput(text);
    setNewInvoiceAmount(formatted);
  };

  // Formata data para DD/MM/YYYY
  const formatDateInput = (value: string): string => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 4) return `${numbers.slice(0, 2)}/${numbers.slice(2)}`;
    return `${numbers.slice(0, 2)}/${numbers.slice(2, 4)}/${numbers.slice(4, 8)}`;
  };

  // Converte DD/MM/YYYY para YYYY-MM-DD
  const parseDateInput = (formatted: string): string => {
    if (!formatted) return "";
    const parts = formatted.split("/");
    if (parts.length !== 3) return "";
    const [day, month, year] = parts;
    if (!day || !month || !year) return "";
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  };

  // Handler para mudança de data
  const handleNewInvoiceDueDateChange = (text: string) => {
    const formatted = formatDateInput(text);
    setNewInvoiceDueDate(formatted);
  };

  // Gera data padrão (7 dias a partir de hoje)
  const getDefaultDueDate = (): string => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const handleCreateInvoice = async () => {
    if (newInvoiceStudentIds.length === 0) {
      Alert.alert("Atenção", "Selecione pelo menos um aluno");
      return;
    }
    
    const selectedStudents = students.filter(s => newInvoiceStudentIds.includes(s.uid));
    if (selectedStudents.length === 0) return;

    const amount = toCents(parseCurrencyInput(newInvoiceAmount) || 91);
    const dueDateStr = parseDateInput(newInvoiceDueDate);
    const dueDate = dueDateStr || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    setProcessing(true);
    try {
      let created = 0;
      const description = newInvoiceDescription || getDefaultDescription();
      for (const student of selectedStudents) {
        await createInvoice({
          studentId: student.uid,
          studentName: student.name,
          studentEmail: student.email,
          amount,
          description,
          dueDate,
          referenceMonth: month,
          classIds: student.classes || [],
        });
        created++;
      }

      setShowCreateInvoiceModal(false);
      setNewInvoiceStudentIds([]);
      setNewInvoiceAmount("91,00");
      setNewInvoiceDescription("");
      setNewInvoiceDueDate(getDefaultDueDate());
      await loadData();
      Alert.alert("Sucesso", `${created} cobrança(s) criada(s)!`);
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Não foi possível criar a cobrança");
    } finally {
      setProcessing(false);
    }
  };

  const handleMarkAsPaid = async () => {
    if (!selectedInvoice) return;

    setProcessing(true);
    try {
      await markAsPaid(selectedInvoice.id, paymentMethod, paymentNotes);
      
      // Registra atividade
      await logActivity({
        type: "payment",
        title: selectedInvoice.studentName,
        description: `Pagamento via ${paymentMethod === "pix" ? "PIX" : paymentMethod === "cash" ? "Dinheiro" : paymentMethod === "card" ? "Cartão" : "Transferência"}`,
        metadata: {
          studentId: selectedInvoice.studentId,
          studentName: selectedInvoice.studentName,
          invoiceId: selectedInvoice.id,
          amount: selectedInvoice.amount,
        },
      });
      
      setShowPaymentModal(false);
      setSelectedInvoice(null);
      setPaymentNotes("");
      await loadData();
      Alert.alert("Sucesso", "Pagamento registrado!");
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Não foi possível registrar o pagamento");
    } finally {
      setProcessing(false);
    }
  };

  const handleGeneratePix = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setProcessing(true);
    try {
      // Se já tem PIX do Mercado Pago, usa ele
      if (invoice.pixCode && invoice.mpPaymentId) {
        setPixCode(invoice.pixCode);
        setShowPixModal(true);
        return;
      }
      
      // Gera novo código PIX local
      const code = await generatePixCode(invoice);
      setPixCode(code);
      setShowPixModal(true);
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Configure a chave PIX nas configurações.");
    } finally {
      setProcessing(false);
    }
  };

  const handleCopyPix = async () => {
    await Clipboard.setStringAsync(pixCode);
    Alert.alert("Copiado!", "Código PIX copiado");
  };


  // Abre menu de configuração de preços/mensalidades
  const handleOpenPricingSettings = async () => {
    const settings = await getPaymentSettings();
    
    // Usa valores do servidor ou padrão
    let currentTierPricing = tierPricing;
    
    if (settings) {
      setSettingsMonthlyFee(String(settings.monthlyFee / 100));
      setSettingsDueDayOfMonth(String(settings.dueDayOfMonth || 1));
      setSettingsLatePaymentDeadline(String(settings.latePaymentDeadline || 8));
      if (settings.tierPricing && settings.tierPricing.length > 0) {
        currentTierPricing = settings.tierPricing;
        setTierPricing(settings.tierPricing);
      }
    }
    
    // Sempre atualiza os inputs de preço ao abrir o modal
    const inputs: Record<string, string> = {};
    currentTierPricing.forEach((tier, index) => {
      inputs[`early_${index}`] = formatReaisToString(tier.earlyPrice / 100);
      inputs[`regular_${index}`] = formatReaisToString(tier.regularPrice / 100);
    });
    setPriceInputs(inputs);
    
    setShowPricingModal(true);
  };

  // Salva apenas configurações de preços
  const handleSavePricingSettings = async () => {
    setProcessing(true);
    try {
      await updatePaymentSettings({
        monthlyFee: toCents(parseFloat(settingsMonthlyFee) || 10.90),
        dueDayOfMonth: parseInt(settingsDueDayOfMonth) || 1,
        latePaymentDeadline: parseInt(settingsLatePaymentDeadline) || 8,
        tierPricing,
      });
      setShowPricingModal(false);
      showAlert("Sucesso", "Valores atualizados!");
      await loadData();
    } catch (e: any) {
      showAlert("Erro", e.message);
    } finally {
      setProcessing(false);
    }
  };

  // Gera cobranças iniciais para todos os alunos que ainda não têm
  const handleGenerateInitialInvoices = async () => {
    setProcessing(true);
    try {
      const currentMonth = month;
      
      // Buscar faturas existentes do mês
      const existingInvoices = await fetchInvoices({ month: currentMonth });
      const studentsWithInvoice = new Set(existingInvoices.map(inv => inv.studentId));
      
      // Filtrar alunos que ainda não têm fatura
      const studentsWithoutInvoice = students.filter(s => !studentsWithInvoice.has(s.uid));
      
      if (studentsWithoutInvoice.length === 0) {
        showAlert("Aviso", "Todos os alunos já possuem cobrança neste mês.");
        setShowInitialInvoicesModal(false);
        setProcessing(false);
        return;
      }
      
      let generated = 0;
      for (const student of studentsWithoutInvoice) {
        try {
          const invoice = await generateInvoiceForStudent(student, currentMonth);
          if (invoice) generated++;
        } catch (e) {
          console.error(`Erro ao gerar fatura para ${student.name}:`, e);
        }
      }
      
      // Registra atividade
      if (generated > 0) {
        await logActivity({
          type: "invoice_generated",
          title: "Cobranças geradas",
          description: `${generated} cobrança(s) inicial(is) para ${formatMonthDisplay(currentMonth)}`,
        });
      }
      
      setShowInitialInvoicesModal(false);
      showAlert("Sucesso", `${generated} cobrança(s) gerada(s) com sucesso!`);
      await loadData();
    } catch (e: any) {
      showAlert("Erro", e.message || "Erro ao gerar cobranças");
    } finally {
      setProcessing(false);
    }
  };

  // Abre modal de controle de conta de um aluno
  const handleOpenStudentAccount = (student: Profile) => {
    setSelectedStudentForAccount(student);
    setCustomInvoiceAmount("");
    setCustomInvoiceDescription("");
    setShowStudentAccountModal(true);
  };

  // Toggle seleção de aluno para ações em lote
  const toggleBulkSelection = (studentId: string) => {
    setSelectedStudentIds(prev => 
      prev.includes(studentId) 
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  // Selecionar todos os alunos
  const handleSelectAll = () => {
    if (selectedStudentIds.length === students.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(students.map(s => s.uid));
    }
  };

  // Selecionar apenas alunos com pendências
  const handleSelectPending = () => {
    const pendingStudentIds = students
      .filter(s => invoices.some(inv => inv.studentId === s.uid && (inv.status === "pending" || inv.status === "overdue")))
      .map(s => s.uid);
    setSelectedStudentIds(pendingStudentIds);
  };

  // Apagar todas as cobranças pendentes dos alunos selecionados
  const handleBulkDeletePending = async () => {
    if (selectedStudentIds.length === 0) {
      showAlert("Atenção", "Selecione pelo menos um aluno");
      return;
    }

    const pendingInvoicesToDelete = invoices.filter(
      inv => selectedStudentIds.includes(inv.studentId) && (inv.status === "pending" || inv.status === "overdue")
    );

    if (pendingInvoicesToDelete.length === 0) {
      showAlert("Aviso", "Nenhuma cobrança pendente encontrada para os alunos selecionados");
      return;
    }

    const message = `Deseja apagar ${pendingInvoicesToDelete.length} cobrança(s) pendente(s) de ${selectedStudentIds.length} aluno(s)?\n\nEsta ação não pode ser desfeita.`;
    
    if (Platform.OS === "web") {
      if (!window.confirm(message)) return;
    } else {
      return new Promise<void>((resolve) => {
        Alert.alert("Confirmar", message, [
          { text: "Cancelar", style: "cancel", onPress: () => resolve() },
          { text: "Apagar", style: "destructive", onPress: async () => {
            await executeBulkDelete(pendingInvoicesToDelete);
            resolve();
          }},
        ]);
      });
    }

    await executeBulkDelete(pendingInvoicesToDelete);
  };

  const executeBulkDelete = async (invoicesToDelete: Invoice[]) => {
    setBulkProcessing(true);
    try {
      let deleted = 0;
      for (const inv of invoicesToDelete) {
        await deleteInvoice(inv.id);
        deleted++;
      }
      
      showAlert("Sucesso", `${deleted} cobrança(s) removida(s) com sucesso!`);
      setSelectedStudentIds([]);
      setBulkMode(false);
      await loadData();
    } catch (e: any) {
      showAlert("Erro", e.message || "Erro ao remover cobranças");
    } finally {
      setBulkProcessing(false);
    }
  };

  // Gerar cobranças para alunos selecionados
  const handleBulkGenerateInvoices = async () => {
    if (selectedStudentIds.length === 0) {
      showAlert("Atenção", "Selecione pelo menos um aluno");
      return;
    }

    const selectedStudents = students.filter(s => selectedStudentIds.includes(s.uid));
    
    setBulkProcessing(true);
    try {
      let generated = 0;
      for (const student of selectedStudents) {
        const invoice = await generateInvoiceForStudent(student, month);
        if (invoice) generated++;
      }
      
      showAlert("Sucesso", `${generated} cobrança(s) gerada(s)!`);
      setSelectedStudentIds([]);
      setBulkMode(false);
      await loadData();
    } catch (e: any) {
      showAlert("Erro", e.message || "Erro ao gerar cobranças");
    } finally {
      setBulkProcessing(false);
    }
  };

  // Adiciona mensalidade padrão para o aluno
  const handleAddStandardInvoice = async () => {
    if (!selectedStudentForAccount) return;
    
    setProcessing(true);
    try {
      // Verifica se o aluno está em alguma turma
      const studentClasses = await fetchClasses();
      const studentClassIds = studentClasses
        .filter(c => c.studentIds && c.studentIds.includes(selectedStudentForAccount.uid))
        .map(c => c.id);
      
      if (studentClassIds.length === 0) {
        showAlert("Aviso", "Este aluno não está matriculado em nenhuma turma. Não é possível gerar mensalidade padrão.");
        setProcessing(false);
        return;
      }

      // Verifica se já existe mensalidade para este mês
      const existingInvoices = await fetchInvoices({ 
        studentId: selectedStudentForAccount.uid, 
        month 
      });
      
      const monthInvoice = existingInvoices.find(inv => inv.referenceMonth === month);
      
      if (monthInvoice) {
        if (monthInvoice.status === "paid") {
          showAlert("Aviso", `Este aluno já possui uma mensalidade paga para ${formatMonthDisplay(month)}. Não é possível gerar outra mensalidade padrão para este mês.`);
          setProcessing(false);
          return;
        } else if (monthInvoice.status === "pending" || monthInvoice.status === "overdue") {
          Alert.alert(
            "Aviso", 
            `Este aluno já possui uma mensalidade pendente para ${formatMonthDisplay(month)}. Deseja realmente gerar outra?`,
            [
              { text: "Cancelar", style: "cancel", onPress: () => setProcessing(false) },
              { 
                text: "Gerar Mesmo Assim", 
                onPress: async () => {
                  try {
                    const invoice = await generateInvoiceForStudent(selectedStudentForAccount, month);
                    if (invoice) {
                      setShowStudentAccountModal(false);
                      showAlert("Sucesso", "Mensalidade padrão gerada!");
                      await loadData();
                    }
                  } catch (e: any) {
                    showAlert("Erro", e.message || "Erro ao gerar mensalidade");
                  } finally {
                    setProcessing(false);
                  }
                }
              },
            ]
          );
          return;
        }
      }

      // Gera a mensalidade
      const invoice = await generateInvoiceForStudent(selectedStudentForAccount, month);
      if (invoice) {
        setShowStudentAccountModal(false);
        showAlert("Sucesso", "Mensalidade padrão gerada com sucesso!");
        await loadData();
      } else {
        showAlert("Aviso", "Não foi possível gerar a mensalidade. Verifique as configurações de valores.");
      }
    } catch (e: any) {
      showAlert("Erro", e.message || "Erro ao gerar mensalidade");
    } finally {
      setProcessing(false);
    }
  };

  // Adiciona cobrança personalizada para o aluno
  const handleAddCustomInvoice = async () => {
    if (!selectedStudentForAccount) return;
    
    const amount = parseCurrencyInput(customInvoiceAmount);
    if (!amount || amount <= 0) {
      showAlert("Atenção", "Informe um valor válido");
      return;
    }
    
    setProcessing(true);
    try {
      const settings = await getPaymentSettings();
      const [year, monthNum] = month.split("-").map(Number);
      const dueDayStr = (settings?.dueDayOfMonth || 1).toString().padStart(2, "0");
      const lateDayStr = (settings?.latePaymentDeadline || 8).toString().padStart(2, "0");
      const dueDate = `${year}-${monthNum.toString().padStart(2, "0")}-${dueDayStr}`;
      const lateDueDate = `${year}-${monthNum.toString().padStart(2, "0")}-${lateDayStr}`;
      
      await createInvoice({
        studentId: selectedStudentForAccount.uid,
        studentName: selectedStudentForAccount.name,
        studentEmail: selectedStudentForAccount.email || "",
        amount: toCents(amount),
        originalAmount: toCents(amount),
        discountAmount: 0,
        dueDate,
        lateDueDate,
        description: customInvoiceDescription || `Cobrança personalizada - ${formatMonthDisplay(month)}`,
        referenceMonth: month,
        classIds: [],
        classCount: 0,
      });
      
      // Não fecha o modal imediatamente para o usuário ver a cobrança criada
      setCustomInvoiceAmount("");
      setCustomInvoiceDescription("");
      showAlert("Sucesso", "Cobrança personalizada criada!");
      await loadData();
    } catch (e: any) {
      showAlert("Erro", e.message || "Erro ao criar cobrança");
    } finally {
      setProcessing(false);
    }
  };

  // Remove fatura do aluno
  const handleRemoveStudentInvoice = async (invoiceId: string) => {
    const confirm = () => {
      return new Promise<boolean>((resolve) => {
        if (Platform.OS === "web") {
          resolve(window.confirm("Tem certeza que deseja remover esta cobrança?"));
        } else {
          Alert.alert("Confirmar", "Tem certeza que deseja remover esta cobrança?", [
            { text: "Cancelar", onPress: () => resolve(false) },
            { text: "Remover", style: "destructive", onPress: () => resolve(true) },
          ]);
        }
      });
    };
    
    const confirmed = await confirm();
    if (!confirmed) return;
    
    setProcessing(true);
    try {
      await deleteInvoice(invoiceId);
      showAlert("Sucesso", "Cobrança removida!");
      await loadData();
    } catch (e: any) {
      showAlert("Erro", e.message || "Erro ao remover cobrança");
    } finally {
      setProcessing(false);
    }
  };

  const handleOpenSettings = async () => {
    // Modal de configurações agora só tem a Zona de Perigo
    setShowSettingsModal(true);
  };

  // handleSaveSettings removido - não é mais necessário pois o modal só tem a Zona de Perigo

  // Zerar todos os dados financeiros
  const handleClearAllFinancialData = async () => {
    const confirm = () => {
      return new Promise<boolean>((resolve) => {
        if (Platform.OS === "web") {
          resolve(window.confirm(
            "⚠️ ATENÇÃO!\n\n" +
            "Esta ação irá DELETAR PERMANENTEMENTE:\n" +
            "• Todas as faturas/cobranças\n" +
            "• Todas as transações de pagamento\n" +
            "• Todos os registros financeiros\n" +
            "• Todas as notificações de pagamento dos alunos\n\n" +
            "Esta ação NÃO PODE SER DESFEITA!\n\n" +
            "Tem certeza que deseja continuar?"
          ));
        } else {
          Alert.alert(
            "⚠️ Zerar Dados Financeiros",
            "Esta ação irá DELETAR PERMANENTEMENTE todas as faturas, transações e registros financeiros.\n\nEsta ação NÃO PODE SER DESFEITA!",
            [
              { text: "Cancelar", onPress: () => resolve(false) },
              { text: "Zerar Tudo", style: "destructive", onPress: () => resolve(true) },
            ]
          );
        }
      });
    };

    const confirmed = await confirm();
    if (!confirmed) return;

    setProcessing(true);
    try {
      const result = await clearAllFinancialData();
      showAlert(
        "Dados Zerados", 
        `Foram removidos:\n• ${result.invoices} faturas\n• ${result.transactions} transações\n• ${result.studentsUpdated} alunos atualizados`
      );
      await loadData();
      setShowSettingsModal(false);
    } catch (e: any) {
      showAlert("Erro", e.message || "Erro ao zerar dados financeiros");
    } finally {
      setProcessing(false);
    }
  };

  // Estado para valores de edição de preços (strings para permitir digitação livre)
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});

  // Inicializa os inputs de preço apenas na primeira vez
  useEffect(() => {
    if (Object.keys(priceInputs).length === 0) {
      const inputs: Record<string, string> = {};
      tierPricing.forEach((tier, index) => {
        inputs[`early_${index}`] = formatReaisToString(toReais(tier.earlyPrice));
        inputs[`regular_${index}`] = formatReaisToString(toReais(tier.regularPrice));
      });
      setPriceInputs(inputs);
    }
  }, []); // Só executa uma vez na montagem

  // Atualiza o valor do input de preço (permite digitação livre)
  const handlePriceInputChange = (key: string, value: string) => {
    // Permite apenas números, vírgula e ponto
    const cleaned = value.replace(/[^\d,\.]/g, "");
    setPriceInputs(prev => ({ ...prev, [key]: cleaned }));
  };

  // Converte string de preço para número em reais
  const parsePriceInput = (value: string): number => {
    if (!value) return 0;
    // Normaliza: remove pontos de milhar, troca vírgula por ponto
    const normalized = value.replace(/\./g, "").replace(",", ".");
    const num = parseFloat(normalized);
    return isNaN(num) ? 0 : num;
  };

  // Aplica o valor ao tierPricing (usado tanto no blur quanto no submit)
  const applyPriceValue = (index: number, field: "earlyPrice" | "regularPrice") => {
    const key = field === "earlyPrice" ? `early_${index}` : `regular_${index}`;
    const inputValue = priceInputs[key] || "0";
    
    // Interpreta o valor digitado como REAIS (não centavos)
    const reais = parsePriceInput(inputValue);
    const cents = Math.round(reais * 100); // Converte para centavos
    
    // Atualiza tierPricing
    const newPricing = [...tierPricing];
    newPricing[index] = {
      ...newPricing[index],
      [field]: cents,
    };
    setTierPricing(newPricing);
    
    // Formata o valor para exibição
    setPriceInputs(prev => ({ ...prev, [key]: formatReaisToString(reais) }));
  };

  // Aplica o valor ao tierPricing quando o campo perde foco
  const handlePriceInputBlur = (index: number, field: "earlyPrice" | "regularPrice") => {
    applyPriceValue(index, field);
  };

  // Aplica o valor quando o usuário pressiona Enter
  const handlePriceInputSubmit = (index: number, field: "earlyPrice" | "regularPrice") => {
    applyPriceValue(index, field);
  };

  // Atualiza preço de um tier (mantido para compatibilidade)
  const updateTierPrice = (index: number, field: "earlyPrice" | "regularPrice", value: string) => {
    const key = field === "earlyPrice" ? `early_${index}` : `regular_${index}`;
    handlePriceInputChange(key, value);
  };

  // Helper para alertas cross-platform
  const showAlert = (title: string, message: string) => {
    if (Platform.OS === "web") {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const openPaymentModal = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setPaymentMethod("pix");
    setPaymentNotes("");
    setShowPaymentModal(true);
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={colors.purple} />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, isDesktopMode && dkStyles.screen]}>
      {!isDesktopMode && isMaster && <MasterHeader />}
      {!isDesktopMode && !isMaster && <CdmfHeader />}
      {!isDesktopMode && <SectionHeader title="Financeiro" />}

      {/* ==================== MODAIS ==================== */}
      
      {/* Modal: Seletor de Mês */}
      <Modal visible={showMonthPicker} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowMonthPicker(false)}>
          <Pressable style={styles.monthPickerModal} onPress={e => e.stopPropagation()}>
            <View style={styles.monthPickerHeader}>
              <Text style={styles.monthPickerTitle}>Selecionar Período</Text>
              <Pressable onPress={() => setShowMonthPicker(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </Pressable>
            </View>
            
            <ScrollView style={styles.monthPickerScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.monthPickerGrid}>
                {recentMonths.map((m, index) => {
                  const isSelected = m === month;
                  const isCurrent = index === 0;
                  
                  return (
                    <Pressable
                      key={m}
                      style={[
                        styles.monthPickerItem,
                        isSelected && styles.monthPickerItemSelected,
                        isCurrent && !isSelected && styles.monthPickerItemCurrent,
                      ]}
                      onPress={() => {
                        setMonth(m);
                        setShowMonthPicker(false);
                      }}
                    >
                      <Text style={[
                        styles.monthPickerItemMonth,
                        isSelected && styles.monthPickerItemTextSelected,
                      ]}>
                        {formatMonthDisplay(m).split("/")[0]}
                      </Text>
                      <Text style={[
                        styles.monthPickerItemYear,
                        isSelected && styles.monthPickerItemTextSelected,
                      ]}>
                        {m.split("-")[0]}
                      </Text>
                      {isCurrent && (
                        <View style={[styles.currentBadge, isSelected && { backgroundColor: "#fff" }]}>
                          <Text style={[styles.currentBadgeText, isSelected && { color: colors.purple }]}>Atual</Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      
      {/* Modal: Criar Cobrança */}
      <Modal 
        visible={showCreateInvoiceModal} 
        transparent 
        animationType="fade"
        onShow={() => {
          if (!newInvoiceDueDate) {
            setNewInvoiceDueDate(getDefaultDueDate());
          }
        }}
      >
        <Pressable style={styles.modalOverlay} onPress={() => !processing && setShowCreateInvoiceModal(false)}>
          <ScrollView style={{ maxHeight: "90%" }} contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 16 }}>
          <Pressable style={[styles.modal, { maxHeight: undefined }]} onPress={e => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Nova Cobrança</Text>

            {/* Tipo de Cobrança */}
            <Text style={styles.inputLabel}>Tipo de Cobrança</Text>
            <View style={styles.invoiceTypeContainer}>
              {([
                { id: "mensalidade", label: "Mensalidade", icon: "calendar" },
                { id: "baile", label: "Baile", icon: "musical-notes" },
                { id: "workshop", label: "Workshop", icon: "school" },
                { id: "outro", label: "Outro", icon: "pricetag" },
              ] as const).map(type => (
                <Pressable
                  key={type.id}
                  style={[styles.invoiceTypeBtn, invoiceType === type.id && styles.invoiceTypeBtnActive]}
                  onPress={() => setInvoiceType(type.id)}
                >
                  <Ionicons name={type.icon as any} size={16} color={invoiceType === type.id ? "#fff" : "#64748B"} />
                  <Text style={[styles.invoiceTypeBtnText, invoiceType === type.id && styles.invoiceTypeBtnTextActive]}>
                    {type.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Filtros de Alunos */}
            <Text style={styles.inputLabel}>Filtrar Alunos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipsScroll}>
              {([
                { id: "todos", label: "Todos", icon: "people" },
                { id: "masculino", label: "Masculino", icon: "male" },
                { id: "feminino", label: "Feminino", icon: "female" },
                { id: "condutor", label: "Condutores", icon: "arrow-forward" },
                { id: "conduzido", label: "Conduzidos", icon: "arrow-back" },
                { id: "ambos", label: "Ambos", icon: "swap-horizontal" },
              ] as const).map(filter => (
                <Pressable
                  key={filter.id}
                  style={[styles.filterChip, studentFilter === filter.id && styles.filterChipActive]}
                  onPress={() => setStudentFilter(filter.id)}
                >
                  <Ionicons name={filter.icon as any} size={14} color={studentFilter === filter.id ? "#fff" : "#64748B"} />
                  <Text style={[styles.filterChipText, studentFilter === filter.id && styles.filterChipTextActive]}>
                    {filter.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Seleção de Alunos */}
            <View style={styles.inputLabelRow}>
              <Text style={styles.inputLabel}>Alunos</Text>
              <View style={styles.selectionActions}>
                {newInvoiceStudentIds.length > 0 && (
                  <Text style={styles.selectedCount}>{newInvoiceStudentIds.length} selecionado(s)</Text>
                )}
                <Pressable 
                  style={styles.selectAllBtn} 
                  onPress={areAllFilteredSelected ? deselectAllStudents : selectAllStudents}
                >
                  <Ionicons 
                    name={areAllFilteredSelected ? "close-circle" : "checkmark-done-circle"} 
                    size={16} 
                    color={colors.purple} 
                  />
                  <Text style={styles.selectAllBtnText}>
                    {areAllFilteredSelected ? "Limpar" : "Todos"}
                  </Text>
                </Pressable>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
              {getFilteredStudents().map(s => {
                const isSelected = newInvoiceStudentIds.includes(s.uid);
                return (
                  <Pressable
                    key={s.uid}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => toggleStudentSelection(s.uid)}
                  >
                    {isSelected && <Ionicons name="checkmark-circle" size={14} color="#fff" style={{ marginRight: 4 }} />}
                    <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                      {s.name.split(" ")[0]}
                    </Text>
                  </Pressable>
                );
              })}
              {getFilteredStudents().length === 0 && (
                <Text style={styles.noStudentsText}>Nenhum aluno encontrado com este filtro</Text>
              )}
            </ScrollView>

            <Text style={styles.inputLabel}>Valor (R$)</Text>
            <View style={styles.inputWithPrefix}>
              <Text style={styles.inputPrefix}>R$</Text>
              <TextInput 
                id="new-invoice-amount"
                name="new-invoice-amount"
                style={[styles.input, styles.inputWithPrefixInput]} 
                value={newInvoiceAmount} 
                onChangeText={handleNewInvoiceAmountChange} 
                keyboardType="numeric"
                placeholder="0,00"
                placeholderTextColor="#94A3B8"
              />
            </View>

            <Text style={styles.inputLabel}>Descrição</Text>
            <TextInput 
              id="new-invoice-description"
              name="new-invoice-description"
              style={styles.input} 
              value={newInvoiceDescription} 
              onChangeText={setNewInvoiceDescription} 
              placeholder={getDefaultDescription()} 
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.inputLabel}>Vencimento (DD/MM/AAAA)</Text>
            <TextInput 
              id="new-invoice-due-date"
              name="new-invoice-due-date"
              style={styles.input} 
              value={newInvoiceDueDate} 
              onChangeText={handleNewInvoiceDueDateChange} 
              placeholder={getDefaultDueDate()}
              keyboardType="numeric"
              maxLength={10}
              placeholderTextColor="#94A3B8"
            />

            <View style={styles.modalBtns}>
              <Pressable style={styles.btnSecondary} onPress={() => setShowCreateInvoiceModal(false)}><Text style={styles.btnSecondaryText}>Cancelar</Text></Pressable>
              <Pressable style={styles.btnPrimary} onPress={handleCreateInvoice} disabled={processing}>
                {processing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnPrimaryText}>Criar</Text>}
              </Pressable>
            </View>
          </Pressable>
          </ScrollView>
        </Pressable>
      </Modal>

      {/* Modal: Registrar Pagamento */}
      <Modal visible={showPaymentModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => !processing && setShowPaymentModal(false)}>
          <Pressable style={styles.modal} onPress={e => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Registrar Pagamento</Text>
            
            {selectedInvoice && (
              <View style={styles.invoiceSummary}>
                <Text style={styles.summaryName}>{selectedInvoice.studentName}</Text>
                <Text style={styles.summaryAmount}>{formatCurrency(selectedInvoice.amount)}</Text>
              </View>
            )}

            <Text style={styles.inputLabel}>Método</Text>
            <View style={styles.methodsGrid}>
              {([
                { id: "pix", label: "PIX", icon: "qr-code" },
                { id: "cash", label: "Dinheiro", icon: "cash" },
                { id: "card", label: "Cartão", icon: "card" },
                { id: "transfer", label: "Transf.", icon: "swap-horizontal" },
              ] as const).map(m => (
              <Pressable
                  key={m.id}
                  style={[styles.methodBtn, paymentMethod === m.id && styles.methodBtnActive]}
                  onPress={() => setPaymentMethod(m.id)}
                >
                  <Ionicons name={m.icon} size={18} color={paymentMethod === m.id ? "#fff" : colors.text} />
                  <Text style={[styles.methodBtnText, paymentMethod === m.id && styles.methodBtnTextActive]}>{m.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.inputLabel}>Observação</Text>
            <TextInput 
              id="payment-notes"
              name="payment-notes"
              style={[styles.input, { height: 60 }]} 
              value={paymentNotes} 
              onChangeText={setPaymentNotes} 
              multiline 
              placeholder="Opcional..." 
            />

            <View style={styles.modalBtns}>
              <Pressable style={styles.btnSecondary} onPress={() => setShowPaymentModal(false)}><Text style={styles.btnSecondaryText}>Cancelar</Text></Pressable>
              <Pressable style={[styles.btnPrimary, { backgroundColor: colors.green }]} onPress={handleMarkAsPaid} disabled={processing}>
                {processing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnPrimaryText}>Confirmar</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: PIX */}
      <Modal visible={showPixModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowPixModal(false)}>
          <Pressable style={styles.modal} onPress={e => e.stopPropagation()}>
            <View style={styles.pixHeader}>
              <Ionicons name="qr-code" size={40} color={colors.purple} />
              <Text style={styles.modalTitle}>Código PIX</Text>
              {selectedInvoice?.mpPaymentId && (
                <View style={[styles.statusBadge, { backgroundColor: "#F3E8FF", marginTop: 8 }]}>
                  <Ionicons name="shield-checkmark" size={12} color={colors.purple} />
                  <Text style={[styles.statusText, { color: colors.purple, marginLeft: 4 }]}>
                    Via Mercado Pago
                  </Text>
                </View>
              )}
            </View>
            
            {selectedInvoice && (
              <View style={styles.invoiceSummary}>
                <Text style={styles.summaryName}>{selectedInvoice.studentName}</Text>
                <Text style={styles.summaryAmount}>{formatCurrency(selectedInvoice.amount)}</Text>
                {selectedInvoice.mpStatus === "pending" && (
                  <Text style={[styles.summaryMeta, { color: colors.purple }]}>
                    ⏳ Aguardando pagamento
                  </Text>
                )}
              </View>
            )}

            <View style={styles.pixBox}>
              <Text style={styles.pixLabel}>Copia e Cola:</Text>
              <Text style={styles.pixCode} numberOfLines={3} selectable>{pixCode || "Gerando..."}</Text>
            </View>

            <Pressable style={styles.btnPrimary} onPress={handleCopyPix}>
              <Ionicons name="copy" size={18} color="#fff" />
              <Text style={styles.btnPrimaryText}>Copiar Código</Text>
            </Pressable>
            <Pressable style={[styles.btnSecondary, { marginTop: 10 }]} onPress={() => setShowPixModal(false)}>
              <Text style={styles.btnSecondaryText}>Fechar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>


      {/* Modal: Gerar Cobranças Iniciais */}
      <Modal visible={showInitialInvoicesModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => !processing && setShowInitialInvoicesModal(false)}>
          <Pressable style={[styles.modal, { maxWidth: 420 }]} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Ionicons name="receipt-outline" size={32} color={colors.purple} />
              <Text style={styles.modalTitle}>Gerar Cobranças Iniciais</Text>
              <Text style={styles.modalSubtitle}>Gera mensalidades para alunos sem cobrança</Text>
            </View>

            <View style={styles.initialInvoicesInfo}>
              <View style={styles.infoRow}>
                <Ionicons name="people" size={18} color={colors.purple} />
                <Text style={styles.infoText}>{students.length} alunos ativos</Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="calendar" size={18} color={colors.purple} />
                <Text style={styles.infoText}>Mês: {formatMonthDisplay(month)}</Text>
              </View>
              <Text style={styles.infoNote}>
                Serão geradas cobranças apenas para alunos que ainda não possuem fatura neste mês. 
                Os valores serão calculados automaticamente com base na quantidade de turmas de cada aluno.
              </Text>
            </View>

            <View style={styles.modalBtns}>
              <Pressable style={styles.btnSecondary} onPress={() => setShowInitialInvoicesModal(false)}>
                <Text style={styles.btnSecondaryText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.btnPrimary} onPress={handleGenerateInitialInvoices} disabled={processing}>
                {processing ? <ActivityIndicator color="#fff" size="small" /> : (
                  <>
                    <Ionicons name="flash" size={18} color="#fff" />
                    <Text style={styles.btnPrimaryText}>Gerar Agora</Text>
                  </>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: Controle de Conta do Aluno */}
      <Modal visible={showStudentAccountModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => !processing && setShowStudentAccountModal(false)}>
          <View style={[styles.modal, styles.studentAccountModal]}>
            <ScrollView 
              style={styles.modalScrollView}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.studentAccountScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable onPress={e => e.stopPropagation()}>
                <View style={styles.modalHeader}>
                  <Ionicons name="person-circle-outline" size={32} color={colors.purple} />
                  <Text style={styles.modalTitle}>Controle de Conta</Text>
                  {selectedStudentForAccount && (
                    <Text style={styles.modalSubtitle}>{selectedStudentForAccount.name}</Text>
                  )}
                </View>

                {/* Faturas do aluno no mês */}
                {selectedStudentForAccount && (
                  <View style={styles.studentInvoicesList}>
                    <Text style={styles.sectionLabel}>Cobranças deste mês</Text>
                    {invoices.filter(inv => inv.studentId === selectedStudentForAccount.uid).length === 0 ? (
                      <View style={styles.noInvoicesBox}>
                        <Ionicons name="document-outline" size={24} color="#94A3B8" />
                        <Text style={styles.noInvoicesText}>Nenhuma cobrança neste mês</Text>
                      </View>
                    ) : (
                      invoices
                        .filter(inv => inv.studentId === selectedStudentForAccount.uid)
                        .map(inv => (
                          <View key={inv.id} style={styles.studentInvoiceItem}>
                            <View style={styles.studentInvoiceInfo}>
                              <Text style={styles.studentInvoiceDesc}>{inv.description}</Text>
                              <Text style={[
                                styles.studentInvoiceStatus,
                                inv.status === "paid" && { color: colors.green },
                                inv.status === "overdue" && { color: colors.danger },
                              ]}>
                                {inv.status === "paid" ? "Pago" : inv.status === "overdue" ? "Atrasado" : "Pendente"}
                              </Text>
                            </View>
                            <Text style={styles.studentInvoiceAmount}>{formatCurrency(inv.amount)}</Text>
                            {inv.status !== "paid" && (
                              <Pressable 
                                style={styles.removeInvoiceBtn}
                                onPress={() => handleRemoveStudentInvoice(inv.id)}
                              >
                                <Ionicons name="trash-outline" size={16} color={colors.danger} />
                              </Pressable>
                            )}
                          </View>
                        ))
                    )}
                  </View>
                )}

                {/* Ações */}
                <View style={styles.accountActionsSection}>
                  <Text style={styles.sectionLabel}>Adicionar Cobrança</Text>
                  
                  <Pressable 
                    style={styles.accountActionBtn}
                    onPress={handleAddStandardInvoice}
                    disabled={processing}
                  >
                    <View style={[styles.accountActionIcon, { backgroundColor: "#DCFCE7" }]}>
                      <Ionicons name="receipt" size={20} color="#16A34A" />
                    </View>
                    <View style={styles.accountActionInfo}>
                      <Text style={styles.accountActionTitle}>Mensalidade Padrão</Text>
                      <Text style={styles.accountActionDesc}>Valor calculado pelas turmas</Text>
                    </View>
                    <Ionicons name="add-circle" size={24} color="#16A34A" />
                  </Pressable>

                  <View style={styles.customInvoiceSection}>
                    <Text style={styles.customInvoiceLabel}>Cobrança Personalizada</Text>
                    <View style={styles.customInvoiceRow}>
                      <TextInput
                        id="custom-invoice-amount"
                        name="custom-invoice-amount"
                        style={[styles.input, { flex: 1 }]}
                        value={customInvoiceAmount ? `R$ ${customInvoiceAmount}` : ""}
                        onChangeText={handleCustomInvoiceAmountChange}
                        placeholder="R$ 0,00"
                        keyboardType="decimal-pad"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                    <TextInput
                      id="custom-invoice-description"
                      name="custom-invoice-description"
                      style={[styles.input, { marginTop: 8 }]}
                      value={customInvoiceDescription}
                      onChangeText={setCustomInvoiceDescription}
                      placeholder="Descrição (opcional)"
                      placeholderTextColor="#94A3B8"
                    />
                    <Pressable 
                      style={[styles.btnPrimary, { marginTop: 12, justifyContent: "center" }]}
                      onPress={handleAddCustomInvoice}
                      disabled={processing || !customInvoiceAmount}
                    >
                      {processing ? <ActivityIndicator color="#fff" size="small" /> : (
                        <>
                          <Ionicons name="add" size={18} color="#fff" />
                          <Text style={styles.btnPrimaryText}>Adicionar</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </View>

                <View style={[styles.modalBtns, { marginTop: 20 }]}>
                  <Pressable style={styles.btnSecondary} onPress={() => setShowStudentAccountModal(false)}>
                    <Text style={styles.btnSecondaryText}>Fechar</Text>
                  </Pressable>
                </View>
              </Pressable>
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Modal: Valores e Descontos */}
      <Modal visible={showPricingModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, styles.pricingModal]}>
            <ScrollView 
              style={styles.modalScrollView}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable onPress={e => e.stopPropagation()}>
                <View style={styles.modalHeader}>
                  <Ionicons name="pricetag-outline" size={32} color={colors.purple} />
                  <Text style={styles.modalTitle}>Valores e Descontos</Text>
                  <Text style={styles.modalSubtitle}>Configure os valores das mensalidades automáticas</Text>
                </View>

                {/* Prazos */}
                <View style={styles.deadlinesSection}>
                  <Text style={styles.sectionLabel}>Prazos de Pagamento</Text>
                  <View style={styles.deadlinesRow}>
                    <View style={styles.deadlineField}>
                      <Text style={styles.deadlineLabel}>Com desconto até dia</Text>
                      <TextInput 
                        style={styles.deadlineInput} 
                        value={settingsDueDayOfMonth} 
                        onChangeText={setSettingsDueDayOfMonth} 
                        keyboardType="number-pad"
                        maxLength={2}
                      />
                    </View>
                    <View style={styles.deadlineField}>
                      <Text style={styles.deadlineLabel}>Vencimento até dia</Text>
                      <TextInput 
                        style={styles.deadlineInput} 
                        value={settingsLatePaymentDeadline} 
                        onChangeText={setSettingsLatePaymentDeadline} 
                        keyboardType="number-pad"
                        maxLength={2}
                      />
                    </View>
                  </View>
                  <View style={styles.deadlineInfo}>
                    <Ionicons name="information-circle-outline" size={14} color={colors.muted} />
                    <Text style={styles.deadlineInfoText}>
                      Pagando até o dia {settingsDueDayOfMonth}, o aluno tem desconto. Após o dia {settingsLatePaymentDeadline}, considera-se atrasado.
                    </Text>
                  </View>
                </View>

                {/* Tabela de Preços */}
                <View style={styles.pricingTableSection}>
                  <Text style={styles.sectionLabel}>Tabela de Preços por Turmas</Text>
                  
                  <View style={styles.pricingTable}>
                    <View style={styles.pricingTableHeader}>
                      <Text style={[styles.pricingTableCell, styles.pricingTableHeaderCell, { flex: 0.6 }]}>Turmas</Text>
                      <Text style={[styles.pricingTableCell, styles.pricingTableHeaderCell, { flex: 1 }]}>Com Desconto</Text>
                      <Text style={[styles.pricingTableCell, styles.pricingTableHeaderCell, { flex: 1 }]}>Valor Normal</Text>
                    </View>
                    
                    {tierPricing.map((tier, index) => (
                      <View key={tier.classes} style={styles.pricingTableRow}>
                        <View style={[styles.pricingTableCell, { flex: 0.6 }]}>
                          <View style={styles.tierBadge}>
                            <Text style={styles.tierBadgeText}>{tier.classes}</Text>
                          </View>
                        </View>
                        <View style={[styles.pricingTableCell, { flex: 1 }]}>
                          <View style={styles.priceInputContainer}>
                            <Text style={styles.priceInputPrefix}>R$</Text>
                            <TextInput
                              id={`price-early-${index}`}
                              name={`price-early-${index}`}
                              style={styles.priceInput}
                              value={priceInputs[`early_${index}`] ?? formatReaisToString(toReais(tier.earlyPrice))}
                              onChangeText={(v) => handlePriceInputChange(`early_${index}`, v)}
                              onBlur={() => handlePriceInputBlur(index, "earlyPrice")}
                              onSubmitEditing={() => handlePriceInputSubmit(index, "earlyPrice")}
                              returnKeyType="next"
                              keyboardType="decimal-pad"
                              placeholder="99,00"
                              placeholderTextColor="#94A3B8"
                              selectTextOnFocus
                            />
                          </View>
                        </View>
                        <View style={[styles.pricingTableCell, { flex: 1 }]}>
                          <View style={styles.priceInputContainer}>
                            <Text style={styles.priceInputPrefix}>R$</Text>
                            <TextInput
                              id={`price-regular-${index}`}
                              name={`price-regular-${index}`}
                              style={styles.priceInput}
                              value={priceInputs[`regular_${index}`] ?? formatReaisToString(toReais(tier.regularPrice))}
                              onChangeText={(v) => handlePriceInputChange(`regular_${index}`, v)}
                              onBlur={() => handlePriceInputBlur(index, "regularPrice")}
                              onSubmitEditing={() => handlePriceInputSubmit(index, "regularPrice")}
                              returnKeyType="done"
                              keyboardType="decimal-pad"
                              placeholder="109,00"
                              placeholderTextColor="#94A3B8"
                              selectTextOnFocus
                            />
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>

                <View style={styles.modalBtns}>
                  <Pressable style={styles.btnSecondary} onPress={() => setShowPricingModal(false)}>
                    <Text style={styles.btnSecondaryText}>Cancelar</Text>
                  </Pressable>
                  <Pressable style={styles.btnPrimary} onPress={handleSavePricingSettings} disabled={processing}>
                    {processing ? <ActivityIndicator color="#fff" size="small" /> : (
                      <>
                        <Ionicons name="checkmark" size={18} color="#fff" />
                        <Text style={styles.btnPrimaryText}>Salvar</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal: Configurações - Apenas Zona de Perigo */}
      <Modal visible={showSettingsModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, styles.settingsModal, isDesktopMode && dkStyles.settingsModal]}>
            <Pressable onPress={e => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <Ionicons name="settings-outline" size={32} color={colors.purple} />
                <Text style={styles.modalTitle}>Configurações</Text>
                <Text style={styles.modalSubtitle}>Ações administrativas</Text>
              </View>
              
              {/* Seção de Administração - Zerar Dados */}
              {isMaster && (
                <View style={styles.dangerZone}>
                  <View style={styles.dangerZoneHeader}>
                    <Ionicons name="warning" size={20} color="#DC2626" />
                    <Text style={styles.dangerZoneTitle}>Zona de Perigo</Text>
                  </View>
                  <Text style={styles.dangerZoneDesc}>
                    Ações destrutivas que não podem ser desfeitas.
                  </Text>
                  <Pressable 
                    style={styles.dangerBtn} 
                    onPress={handleClearAllFinancialData}
                    disabled={processing}
                  >
                    {processing ? <ActivityIndicator color="#DC2626" size="small" /> : (
                      <>
                        <Ionicons name="trash-outline" size={18} color="#DC2626" />
                        <Text style={styles.dangerBtnText}>Zerar Todos os Dados Financeiros</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              )}
              
              {!isMaster && (
                <View style={styles.emptySettingsBox}>
                  <Ionicons name="lock-closed-outline" size={48} color="#CBD5E1" />
                  <Text style={styles.emptySettingsText}>Apenas administradores podem acessar estas configurações</Text>
                </View>
              )}
              
              <View style={styles.settingsModalBtns}>
                <Pressable style={styles.settingsCancelBtn} onPress={() => setShowSettingsModal(false)}>
                  <Text style={styles.settingsCancelBtnText}>Fechar</Text>
                </Pressable>
              </View>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ==================== CONTEÚDO ==================== */}

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={[styles.content, isDesktopMode && dkStyles.content]} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.purple]} />}
      >
        {/* Header com filtros aprimorados */}
        <View style={[styles.header, isDesktopMode && dkStyles.header]}>
          {/* Seletor de Mês Compacto */}
          <View style={styles.monthSelectorRow}>
            {/* Botão Mês Anterior */}
            <Pressable 
              style={styles.monthNavBtn}
              onPress={() => setMonth(navigateMonth(month, "prev"))}
            >
              <Ionicons name="chevron-back" size={20} color={colors.purple} />
            </Pressable>
            
            {/* Seletor de Mês (clicável para abrir picker) */}
            <Pressable 
              style={styles.monthSelector}
              onPress={() => setShowMonthPicker(true)}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.purple} />
              <Text style={styles.monthSelectorText}>{formatMonthDisplayLong(month)}</Text>
              <Ionicons name="chevron-down" size={16} color="#94A3B8" />
            </Pressable>
            
            {/* Botão Próximo Mês */}
            <Pressable 
              style={[
                styles.monthNavBtn,
                month === recentMonths[0] && styles.monthNavBtnDisabled
              ]}
              onPress={() => month !== recentMonths[0] && setMonth(navigateMonth(month, "next"))}
              disabled={month === recentMonths[0]}
            >
              <Ionicons name="chevron-forward" size={20} color={month === recentMonths[0] ? "#CBD5E1" : colors.purple} />
            </Pressable>
            
            {/* Botão Ir para Mês Atual */}
            {month !== recentMonths[0] && (
              <Pressable 
                style={styles.goToCurrentBtn}
                onPress={() => setMonth(recentMonths[0])}
              >
                <Text style={styles.goToCurrentBtnText}>Atual</Text>
              </Pressable>
            )}
          </View>
          
          {/* Linha 2: Busca e Filtros */}
          <View style={styles.searchFilterRow}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={16} color="#94A3B8" />
              <TextInput 
                value={query} 
                onChangeText={setQuery} 
                placeholder="Buscar aluno por nome ou email..." 
                placeholderTextColor="#94A3B8" 
                style={styles.searchInput} 
              />
              {query.length > 0 && (
                <Pressable onPress={() => setQuery("")} style={styles.clearSearchBtn}>
                  <Ionicons name="close-circle" size={18} color="#94A3B8" />
                </Pressable>
              )}
            </View>
            <Pressable 
              style={[styles.filterToggleBtn, showFiltersPanel && styles.filterToggleBtnActive]}
              onPress={() => setShowFiltersPanel(!showFiltersPanel)}
            >
              <Ionicons name="options-outline" size={18} color={showFiltersPanel ? "#fff" : colors.purple} />
              {!isDesktopMode && <Text style={[styles.filterToggleBtnText, showFiltersPanel && { color: "#fff" }]}>Filtros</Text>}
            </Pressable>
          </View>
          
          {/* Painel de Filtros Expandido */}
          {showFiltersPanel && (
            <View style={styles.filtersPanel}>
              {/* Ordenação */}
              <View style={styles.filterGroup}>
                <Text style={styles.filterGroupLabel}>Ordenar por</Text>
                <View style={styles.sortOptionsRow}>
                  {([
                    { value: "name_asc", label: "Nome A-Z", icon: "text" },
                    { value: "name_desc", label: "Nome Z-A", icon: "text" },
                    { value: "amount_desc", label: "Maior valor", icon: "trending-up" },
                    { value: "amount_asc", label: "Menor valor", icon: "trending-down" },
                  ] as const).map(opt => (
                    <Pressable
                      key={opt.value}
                      style={[styles.sortOptionBtn, sortOption === opt.value && styles.sortOptionBtnActive]}
                      onPress={() => setSortOption(opt.value)}
                    >
                      <Ionicons name={opt.icon as any} size={14} color={sortOption === opt.value ? "#fff" : "#64748B"} />
                      <Text style={[styles.sortOptionBtnText, sortOption === opt.value && { color: "#fff" }]}>{opt.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Cards de Estatísticas */}
        <View style={[styles.statsGrid, isDesktopMode && dkStyles.statsGrid]}>
          <StatCard title="Recebido" value={formatCurrency(summary?.totalReceived || 0)} subtitle={`${summary?.invoicesCount.paid || 0} pagamentos`} icon="trending-up" color="#059669" bgColor="#D1FAE5" />
          <StatCard title="Pendente" value={formatCurrency(summary?.totalPending || 0)} subtitle={`${summary?.invoicesCount.pending || 0} aguardando`} icon="time" color="#D97706" bgColor="#FEF3C7" />
          <StatCard title="Atrasado" value={formatCurrency(summary?.totalOverdue || 0)} subtitle={`${summary?.invoicesCount.overdue || 0} vencidos`} icon="alert-circle" color="#DC2626" bgColor="#FEE2E2" />
          <StatCard title="Saldo" value={formatCurrency(summary?.balance || 0)} subtitle="Entradas - Saídas" icon="wallet" color={colors.purple} bgColor="#EDE9FE" />
        </View>

        {/* Barra de Ações Unificada */}
        {isDesktopMode ? (
          <View style={[styles.actionToolbar, dkStyles.actionToolbar]}>
            <View style={styles.toolbarSection}>
              <Pressable 
                style={styles.toolbarBtnPrimary}
                onPress={openCreateInvoiceModal}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.toolbarBtnPrimaryText}>Nova Cobrança</Text>
              </Pressable>
              
              {isMaster && (
                <Pressable 
                  style={styles.toolbarBtn}
                  onPress={() => setShowInitialInvoicesModal(true)}
                >
                  <Ionicons name="flash-outline" size={16} color={colors.purple} />
                  <Text style={styles.toolbarBtnText}>Gerar Mensalidades</Text>
                </Pressable>
              )}
            </View>
            
            <View style={styles.toolbarSection}>
              <Pressable 
                style={styles.toolbarBtn}
                onPress={handleOpenPricingSettings}
                disabled={!isMaster}
              >
                <Ionicons name="pricetag-outline" size={16} color={isMaster ? colors.purple : "#94A3B8"} />
                <Text style={[styles.toolbarBtnText, !isMaster && { color: "#94A3B8" }]}>Valores</Text>
              </Pressable>
              
              <Pressable 
                style={styles.toolbarBtn}
                onPress={handleOpenSettings}
              >
                <Ionicons name="settings-outline" size={16} color="#64748B" />
                <Text style={styles.toolbarBtnText}>Configurações</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.actionToolbarMobile}>
            <Pressable 
              style={styles.toolbarBtnMobilePrimary}
              onPress={openCreateInvoiceModal}
            >
              <View style={styles.toolbarBtnIconContainer}>
                <Ionicons name="add" size={22} color="#fff" />
              </View>
              <Text style={styles.toolbarBtnMobilePrimaryText}>Nova Cobrança</Text>
            </Pressable>
            
            {isMaster && (
              <Pressable 
                style={styles.toolbarBtnMobile}
                onPress={() => setShowInitialInvoicesModal(true)}
              >
                <View style={[styles.toolbarBtnIconContainer, styles.toolbarBtnIconContainerSecondary]}>
                  <Ionicons name="flash-outline" size={22} color={colors.purple} />
                </View>
                <Text style={styles.toolbarBtnMobileText}>Gerar Mensalidades</Text>
              </Pressable>
            )}
            
            <Pressable 
              style={styles.toolbarBtnMobile}
              onPress={handleOpenPricingSettings}
              disabled={!isMaster}
            >
              <View style={[styles.toolbarBtnIconContainer, styles.toolbarBtnIconContainerSecondary, !isMaster && styles.toolbarBtnIconContainerDisabled]}>
                <Ionicons name="pricetag-outline" size={22} color={isMaster ? colors.purple : "#94A3B8"} />
              </View>
              <Text style={[styles.toolbarBtnMobileText, !isMaster && styles.toolbarBtnMobileTextDisabled]}>Valores</Text>
            </Pressable>
            
            <Pressable 
              style={styles.toolbarBtnMobile}
              onPress={handleOpenSettings}
            >
              <View style={[styles.toolbarBtnIconContainer, styles.toolbarBtnIconContainerSecondary]}>
                <Ionicons name="settings-outline" size={22} color="#64748B" />
              </View>
              <Text style={styles.toolbarBtnMobileText}>Configurações</Text>
            </Pressable>
          </View>
        )}

        {/* Gestão de Alunos - Controle de Contas Aprimorado */}
        {isMaster && (
          <View style={[styles.section, isDesktopMode && dkStyles.section]}>
            {/* Header com Título e Contador */}
            <View style={styles.sectionHeaderNew}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="people" size={20} color={colors.purple} />
                <Text style={styles.sectionTitleNew}>Gestão de Alunos</Text>
                <View style={styles.totalBadge}>
                  <Text style={styles.totalBadgeText}>{enrichedStudents.length} alunos</Text>
                </View>
              </View>
              
              {/* Tabs de Status */}
              <View style={styles.statusTabs}>
                {([
                  { key: "all", label: "Todos", count: statusCounts.all, color: "#64748B" },
                  { key: "pending", label: "Pendentes", count: statusCounts.pending, color: "#D97706" },
                  { key: "overdue", label: "Atrasados", count: statusCounts.overdue, color: "#DC2626" },
                  { key: "paid", label: "Em dia", count: statusCounts.paid, color: "#059669" },
                ] as const).map(tab => (
                  <Pressable
                    key={tab.key}
                    style={[styles.statusTab, statusFilter === tab.key && styles.statusTabActive]}
                    onPress={() => setStatusFilter(tab.key)}
                  >
                    <Text style={[
                      styles.statusTabText, 
                      statusFilter === tab.key && styles.statusTabTextActive,
                      statusFilter === tab.key && { color: tab.color }
                    ]}>
                      {tab.label}
                    </Text>
                    <View style={[
                      styles.statusTabCount, 
                      statusFilter === tab.key && { backgroundColor: tab.color }
                    ]}>
                      <Text style={[
                        styles.statusTabCountText,
                        statusFilter === tab.key && { color: "#fff" }
                      ]}>{tab.count}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
            
            {/* Barra de Ações em Lote */}
            <View style={styles.bulkActionsBar}>
              <Pressable 
                style={[styles.bulkModeToggle, bulkMode && styles.bulkModeToggleActive]}
                onPress={() => {
                  setBulkMode(!bulkMode);
                  setSelectedStudentIds([]);
                }}
              >
                <Ionicons 
                  name={bulkMode ? "close" : "checkbox-outline"} 
                  size={16} 
                  color={bulkMode ? "#fff" : colors.purple} 
                />
                <Text style={[styles.bulkModeToggleText, bulkMode && { color: "#fff" }]}>
                  {bulkMode ? "Cancelar Seleção" : "Seleção em Lote"}
                </Text>
              </Pressable>
              
              {bulkMode && (
                <>
                  <View style={styles.bulkQuickSelect}>
                    <Pressable style={styles.quickSelectBtn} onPress={handleSelectAll}>
                      <Ionicons 
                        name={selectedStudentIds.length === sortedStudents.length ? "checkbox" : "square-outline"} 
                        size={16} 
                        color={colors.purple} 
                      />
                      <Text style={styles.quickSelectBtnText}>Todos</Text>
                    </Pressable>
                    <Pressable style={styles.quickSelectBtn} onPress={handleSelectPending}>
                      <Ionicons name="alert-circle" size={16} color="#D97706" />
                      <Text style={styles.quickSelectBtnText}>Inadimplentes</Text>
                    </Pressable>
                  </View>
                  
                  {selectedStudentIds.length > 0 && (
                    <View style={styles.bulkActionsGroup}>
                      <Text style={styles.selectedCountBadge}>{selectedStudentIds.length} selecionado(s)</Text>
                      <Pressable 
                        style={styles.bulkActionBtnNew}
                        onPress={handleBulkGenerateInvoices}
                        disabled={bulkProcessing}
                      >
                        {bulkProcessing ? (
                          <ActivityIndicator size="small" color={colors.purple} />
                        ) : (
                          <>
                            <Ionicons name="add-circle" size={16} color={colors.purple} />
                            <Text style={styles.bulkActionBtnNewText}>Gerar Cobranças</Text>
                          </>
                        )}
                      </Pressable>
                      <Pressable 
                        style={[styles.bulkActionBtnNew, styles.bulkActionBtnNewDanger]}
                        onPress={handleBulkDeletePending}
                        disabled={bulkProcessing}
                      >
                        <Ionicons name="trash" size={16} color={colors.danger} />
                      </Pressable>
                    </View>
                  )}
                </>
              )}
            </View>
            
            {/* Lista de Alunos */}
            {sortedStudents.length === 0 ? (
              <View style={styles.emptyStateNew}>
                <Ionicons name="search" size={40} color="#CBD5E1" />
                <Text style={styles.emptyStateTitle}>Nenhum aluno encontrado</Text>
                <Text style={styles.emptyStateSubtitle}>Tente ajustar os filtros ou busca</Text>
              </View>
            ) : (
              <View style={styles.studentsGrid}>
                {sortedStudents.slice(0, studentAccountDisplayLimit).map(student => {
                  const isSelected = selectedStudentIds.includes(student.uid);
                  
                  // Cores e ícones baseados no status
                  const statusConfig = {
                    em_dia: { color: "#059669", bg: "#D1FAE5", icon: "checkmark-circle" as const, label: "Em dia" },
                    pendente: { color: "#D97706", bg: "#FEF3C7", icon: "time" as const, label: "Pendente" },
                    atrasado: { color: "#DC2626", bg: "#FEE2E2", icon: "alert-circle" as const, label: "Atrasado" },
                    sem_cobranca: { color: "#64748B", bg: "#F1F5F9", icon: "remove-circle" as const, label: "Sem cobrança" },
                  };
                  const config = statusConfig[student.paymentStatus];
                  
                  return (
                    <Pressable 
                      key={student.uid} 
                      style={[
                        styles.studentCard, 
                        isSelected && styles.studentCardSelected,
                        isDesktopMode && styles.studentCardDesktop
                      ]}
                      onPress={() => bulkMode ? toggleBulkSelection(student.uid) : handleOpenStudentAccount(student)}
                    >
                      {/* Checkbox para seleção */}
                      {bulkMode && (
                        <View style={styles.studentCardCheckbox}>
                          <Ionicons 
                            name={isSelected ? "checkbox" : "square-outline"} 
                            size={22} 
                            color={isSelected ? colors.purple : "#CBD5E1"} 
                          />
                        </View>
                      )}
                      
                      {/* Avatar com inicial */}
                      <View style={[styles.studentCardAvatar, { backgroundColor: config.bg }]}>
                        <Text style={[styles.studentCardAvatarText, { color: config.color }]}>
                          {student.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      
                      {/* Info principal */}
                      <View style={styles.studentCardInfo}>
                        <Text style={styles.studentCardName} numberOfLines={1}>{student.name}</Text>
                        <View style={styles.studentCardMeta}>
                          <View style={[styles.statusIndicator, { backgroundColor: config.bg }]}>
                            <Ionicons name={config.icon} size={12} color={config.color} />
                            <Text style={[styles.statusIndicatorText, { color: config.color }]}>{config.label}</Text>
                          </View>
                        </View>
                      </View>
                      
                      {/* Valores */}
                      <View style={styles.studentCardValues}>
                        {student.totalPending > 0 ? (
                          <>
                            <Text style={[styles.studentCardAmount, { color: config.color }]}>
                              {formatCurrency(student.totalPending)}
                            </Text>
                            <Text style={styles.studentCardAmountLabel}>pendente</Text>
                          </>
                        ) : student.paymentStatus === "em_dia" ? (
                          <>
                            <Ionicons name="checkmark-done" size={20} color="#059669" />
                            <Text style={styles.studentCardAmountLabel}>quitado</Text>
                          </>
                        ) : (
                          <Text style={styles.studentCardAmountLabel}>-</Text>
                        )}
                      </View>
                      
                      {/* Seta */}
                      {!bulkMode && (
                        <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
            
            {/* Botão Carregar Mais */}
            {sortedStudents.length > studentAccountDisplayLimit && (
              <Pressable 
                style={styles.loadMoreBtnNew}
                onPress={() => setStudentAccountDisplayLimit(prev => prev + ITEMS_PER_PAGE)}
              >
                <Ionicons name="chevron-down-circle-outline" size={20} color={colors.purple} />
                <Text style={styles.loadMoreBtnText}>
                  Carregar mais ({sortedStudents.length - studentAccountDisplayLimit} restantes)
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Pendências - Redesigned */}
        <View style={[styles.section, isDesktopMode && dkStyles.section]}>
          <View style={styles.sectionHeaderEnhanced}>
            <View style={styles.sectionHeaderLeft}>
              <View style={[styles.sectionIconBox, { backgroundColor: "#FEF3C7" }]}>
                <Ionicons name="time" size={18} color="#D97706" />
              </View>
              <View>
                <Text style={styles.sectionTitleEnhanced}>Cobranças Pendentes</Text>
                <Text style={styles.sectionSubtitleEnhanced}>
                  {pendingInvoices.filter(i => i.status === "overdue").length > 0 
                    ? `${pendingInvoices.filter(i => i.status === "overdue").length} atrasada(s)` 
                    : "Nenhuma atrasada"}
                </Text>
              </View>
            </View>
            <View style={styles.sectionStats}>
              <View style={[styles.sectionStatBadge, { backgroundColor: "#FEF3C7" }]}>
                <Text style={[styles.sectionStatNumber, { color: "#D97706" }]}>{pendingInvoices.length}</Text>
                <Text style={styles.sectionStatLabel}>total</Text>
              </View>
              <View style={[styles.sectionStatBadge, { backgroundColor: "#FEE2E2" }]}>
                <Text style={[styles.sectionStatNumber, { color: "#DC2626" }]}>
                  {formatCurrency(pendingInvoices.reduce((acc, inv) => acc + inv.amount, 0))}
                </Text>
                <Text style={styles.sectionStatLabel}>valor</Text>
              </View>
            </View>
          </View>
          
          {pendingInvoices.length === 0 ? (
            <View style={styles.emptyStateSuccess}>
              <Ionicons name="checkmark-done-circle" size={48} color="#059669" />
              <Text style={styles.emptyStateSuccessTitle}>Tudo em dia!</Text>
              <Text style={styles.emptyStateSuccessSubtitle}>Nenhuma cobrança pendente neste mês</Text>
            </View>
          ) : (
            <View style={styles.cardsList}>
              {pendingInvoices.slice(0, pendingDisplayLimit).map(inv => (
                <InvoiceCard key={inv.id} invoice={inv} onPix={() => handleGeneratePix(inv)} onMarkPaid={() => openPaymentModal(inv)} isDesktop={isDesktopMode} />
              ))}
              {pendingInvoices.length > pendingDisplayLimit && (
                <Pressable 
                  style={styles.loadMoreBtnNew}
                  onPress={() => setPendingDisplayLimit(prev => prev + ITEMS_PER_PAGE)}
                >
                  <Ionicons name="chevron-down-circle-outline" size={20} color={colors.purple} />
                  <Text style={styles.loadMoreBtnText}>
                    Carregar mais ({pendingInvoices.length - pendingDisplayLimit} restantes)
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* Pagamentos do Mês - Redesigned */}
        <View style={[styles.section, isDesktopMode && dkStyles.section]}>
          <View style={styles.sectionHeaderEnhanced}>
            <View style={styles.sectionHeaderLeft}>
              <View style={[styles.sectionIconBox, { backgroundColor: "#D1FAE5" }]}>
                <Ionicons name="checkmark-circle" size={18} color="#059669" />
              </View>
              <View>
                <Text style={styles.sectionTitleEnhanced}>Pagamentos Recebidos</Text>
                <Text style={styles.sectionSubtitleEnhanced}>
                  {formatMonthDisplay(month)}
                </Text>
              </View>
            </View>
            <View style={styles.sectionStats}>
              <View style={[styles.sectionStatBadge, { backgroundColor: "#D1FAE5" }]}>
                <Text style={[styles.sectionStatNumber, { color: "#059669" }]}>{paidInvoices.length}</Text>
                <Text style={styles.sectionStatLabel}>pagos</Text>
              </View>
              <View style={[styles.sectionStatBadge, { backgroundColor: "#ECFDF5" }]}>
                <Text style={[styles.sectionStatNumber, { color: "#059669" }]}>
                  {formatCurrency(paidInvoices.reduce((acc, inv) => acc + inv.amount, 0))}
                </Text>
                <Text style={styles.sectionStatLabel}>total</Text>
              </View>
            </View>
          </View>

          {paidInvoices.length === 0 ? (
            <View style={styles.emptyStatePaid}>
              <Ionicons name="receipt-outline" size={40} color="#CBD5E1" />
              <Text style={styles.emptyStatePaidTitle}>Nenhum pagamento ainda</Text>
              <Text style={styles.emptyStatePaidSubtitle}>Pagamentos confirmados aparecerão aqui</Text>
            </View>
          ) : (
            <View style={styles.paidListNew}>
              {paidInvoices.slice(0, paidDisplayLimit).map(inv => <PaidCard key={inv.id} invoice={inv} />)}
              {paidInvoices.length > paidDisplayLimit && (
                <Pressable 
                  style={[styles.loadMoreBtnNew, { marginTop: 0 }]}
                  onPress={() => setPaidDisplayLimit(prev => prev + ITEMS_PER_PAGE)}
                >
                  <Ionicons name="chevron-down-circle-outline" size={20} color="#059669" />
                  <Text style={[styles.loadMoreBtnText, { color: "#059669" }]}>
                    Carregar mais ({paidInvoices.length - paidDisplayLimit} restantes)
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ==================== ESTILOS ====================

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  scrollView: { flex: 1 },
  loadingContainer: { justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, color: "#64748B", fontSize: 14 },

  content: { padding: 16 },

  // Header
  header: { marginBottom: 20 },
  
  // Month Selector (compact)
  monthSelectorRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  monthNavBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#F3E8FF", alignItems: "center", justifyContent: "center" },
  monthNavBtnDisabled: { backgroundColor: "#F8FAFC" },
  monthSelector: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#fff", paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0" },
  monthSelectorText: { fontSize: 16, fontWeight: "700", color: "#1E293B" },
  goToCurrentBtn: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.purple, borderRadius: 8 },
  goToCurrentBtnText: { fontSize: 12, fontWeight: "600", color: "#fff" },
  
  // Month Picker Modal
  monthPickerModal: { backgroundColor: "#fff", borderRadius: 20, padding: 20, width: "90%", maxWidth: 360, maxHeight: "70%" },
  monthPickerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  monthPickerTitle: { fontSize: 18, fontWeight: "700", color: "#1E293B" },
  monthPickerScroll: { maxHeight: 400 },
  monthPickerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  monthPickerItem: { width: 100, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, backgroundColor: "#F8FAFC", alignItems: "center", borderWidth: 1, borderColor: "#E2E8F0" },
  monthPickerItemSelected: { backgroundColor: colors.purple, borderColor: colors.purple },
  monthPickerItemCurrent: { borderColor: colors.purple, borderWidth: 2 },
  monthPickerItemMonth: { fontSize: 16, fontWeight: "800", color: "#1E293B" },
  monthPickerItemYear: { fontSize: 12, fontWeight: "500", color: "#64748B", marginTop: 2 },
  monthPickerItemTextSelected: { color: "#fff" },
  currentBadge: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: "#EDE9FE", borderRadius: 6 },
  currentBadgeText: { fontSize: 10, fontWeight: "600", color: colors.purple },
  
  // Legacy (keeping for compatibility)
  monthsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  monthPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E2E8F0" },
  monthPillActive: { backgroundColor: "#1E293B", borderColor: "#1E293B" },
  monthText: { fontSize: 12, fontWeight: "700", color: "#64748B" },
  monthTextActive: { color: "#fff" },
  
  // Search & Filter Row
  searchFilterRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  searchBox: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: "#E2E8F0", gap: 10 },
  searchInput: { flex: 1, fontSize: 14, color: "#1E293B" },
  clearSearchBtn: { padding: 2 },
  filterToggleBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: "#F3E8FF", borderWidth: 1, borderColor: "#E9D5FF" },
  filterToggleBtnActive: { backgroundColor: colors.purple, borderColor: colors.purple },
  filterToggleBtnText: { fontSize: 13, fontWeight: "600", color: colors.purple },
  
  // Filters Panel
  filtersPanel: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginTop: 12, borderWidth: 1, borderColor: "#E2E8F0" },
  filterGroup: { marginBottom: 8 },
  filterGroupLabel: { fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  sortOptionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sortOptionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0" },
  sortOptionBtnActive: { backgroundColor: colors.purple, borderColor: colors.purple },
  sortOptionBtnText: { fontSize: 12, fontWeight: "500", color: "#64748B" },
  
  // Action Toolbar
  actionToolbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: "#E2E8F0", flexWrap: "wrap", gap: 10 },
  toolbarSection: { flexDirection: "row", alignItems: "center", gap: 8 },
  toolbarBtnPrimary: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.purple },
  toolbarBtnPrimaryText: { fontSize: 14, fontWeight: "600", color: "#fff" },
  toolbarBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0" },
  toolbarBtnText: { fontSize: 13, fontWeight: "500", color: "#475569" },
  
  // Action Toolbar Mobile
  actionToolbarMobile: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  toolbarBtnMobilePrimary: {
    flex: 1,
    minWidth: "47%",
    backgroundColor: colors.purple,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.purple,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  toolbarBtnMobile: {
    flex: 1,
    minWidth: "47%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  toolbarBtnIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  toolbarBtnIconContainerSecondary: {
    backgroundColor: "#F3E8FF",
  },
  toolbarBtnIconContainerDisabled: {
    backgroundColor: "#F1F5F9",
  },
  toolbarBtnMobilePrimaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },
  toolbarBtnMobileText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
    textAlign: "center",
  },
  toolbarBtnMobileTextDisabled: {
    color: "#94A3B8",
  },

  // Stats
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 20 },
  statCard: { 
    backgroundColor: "#fff", 
    borderRadius: 12, 
    padding: 16, 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderLeftWidth: 4,
    minWidth: 160,
    flex: 1,
  },
  statIconBox: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statContent: { flex: 1 },
  statTitle: { fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 2 },
  statValue: { fontSize: 18, fontWeight: "800" },
  statSubtitle: { fontSize: 11, color: "#94A3B8", marginTop: 2 },

  // Actions
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 20, justifyContent: "flex-start" },
  actionsRowMobile: { 
    flexDirection: "row", 
    gap: 8, 
    marginBottom: 10, 
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  quickAction: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "center",
    gap: 6, 
    paddingHorizontal: 14, 
    paddingVertical: 10, 
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  quickActionOutline: {
    backgroundColor: "#fff",
    borderColor: "#E2E8F0",
  },
  quickActionMobile: {
    flex: 1,
    minWidth: 90,
  },
  quickActionText: { fontSize: 12, fontWeight: "600" },

  // Sections
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#1E293B" },
  sectionBadge: { 
    backgroundColor: "#FEF3C7", 
    color: "#D97706", 
    fontSize: 12, 
    fontWeight: "700", 
    paddingHorizontal: 10, 
    paddingVertical: 4,
    borderRadius: 12,
  },
  
  // New Section Header Style
  sectionHeaderNew: { marginBottom: 16 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  sectionTitleNew: { fontSize: 18, fontWeight: "800", color: "#1E293B" },
  totalBadge: { backgroundColor: "#EDE9FE", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  totalBadgeText: { fontSize: 12, fontWeight: "600", color: colors.purple },
  
  // Status Tabs
  statusTabs: { flexDirection: "row", backgroundColor: "#F8FAFC", borderRadius: 12, padding: 4, gap: 2 },
  statusTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10 },
  statusTabActive: { backgroundColor: "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  statusTabText: { fontSize: 12, fontWeight: "500", color: "#64748B" },
  statusTabTextActive: { fontWeight: "700" },
  statusTabCount: { backgroundColor: "#E2E8F0", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, minWidth: 22, alignItems: "center" },
  statusTabCountText: { fontSize: 11, fontWeight: "700", color: "#64748B" },
  
  // Bulk Actions Bar
  bulkActionsBar: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: "#F8FAFC", borderRadius: 12 },
  bulkModeToggle: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E9D5FF" },
  bulkModeToggleActive: { backgroundColor: colors.purple, borderColor: colors.purple },
  bulkModeToggleText: { fontSize: 13, fontWeight: "600", color: colors.purple },
  bulkQuickSelect: { flexDirection: "row", gap: 8 },
  quickSelectBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E2E8F0" },
  quickSelectBtnText: { fontSize: 12, fontWeight: "500", color: "#475569" },
  bulkActionsGroup: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: "auto" },
  selectedCountBadge: { fontSize: 13, fontWeight: "600", color: colors.purple, backgroundColor: "#EDE9FE", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  bulkActionBtnNew: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E9D5FF" },
  bulkActionBtnNewText: { fontSize: 12, fontWeight: "600", color: colors.purple },
  bulkActionBtnNewDanger: { borderColor: "#FECACA", paddingHorizontal: 10 },
  
  // Students Grid
  studentsGrid: { gap: 10 },
  studentCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", padding: 14, borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", gap: 12 },
  studentCardSelected: { backgroundColor: "#F3E8FF", borderColor: colors.purple },
  studentCardDesktop: { maxWidth: "100%" },
  studentCardCheckbox: { marginRight: 4 },
  studentCardAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  studentCardAvatarText: { fontSize: 18, fontWeight: "700" },
  studentCardInfo: { flex: 1, minWidth: 0 },
  studentCardName: { fontSize: 15, fontWeight: "600", color: "#1E293B", marginBottom: 4 },
  studentCardMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusIndicator: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusIndicatorText: { fontSize: 11, fontWeight: "600" },
  studentCardValues: { alignItems: "flex-end", minWidth: 70 },
  studentCardAmount: { fontSize: 16, fontWeight: "800" },
  studentCardAmountLabel: { fontSize: 11, color: "#94A3B8", marginTop: 2 },
  
  // Empty State New
  emptyStateNew: { alignItems: "center", paddingVertical: 48, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0" },
  emptyStateTitle: { fontSize: 16, fontWeight: "600", color: "#475569", marginTop: 16 },
  emptyStateSubtitle: { fontSize: 13, color: "#94A3B8", marginTop: 4 },
  
  // Load More Button New
  loadMoreBtnNew: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, marginTop: 12, backgroundColor: "#F8FAFC", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0" },
  loadMoreBtnText: { fontSize: 14, fontWeight: "600", color: colors.purple },

  // Cards
  cardsList: { gap: 12 },
  invoiceCard: { 
    backgroundColor: "#fff", 
    borderRadius: 12, 
    padding: 16, 
    borderWidth: 1, 
    borderColor: "#E2E8F0",
  },
  invoiceHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  invoiceInfo: { flex: 1 },
  invoiceName: { fontSize: 15, fontWeight: "700", color: "#1E293B" },
  invoiceMeta: { fontSize: 12, color: "#64748B", marginTop: 4 },
  invoiceAmountBox: { alignItems: "flex-end" },
  invoiceAmount: { fontSize: 18, fontWeight: "800", color: "#1E293B" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: "700" },
  invoiceActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  invoiceBtn: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "center", 
    gap: 4, 
    paddingVertical: 8, 
    paddingHorizontal: 12,
    borderRadius: 8, 
    backgroundColor: "#F1F5F9",
  },
  invoiceBtnPrimary: { backgroundColor: colors.green },
  invoiceBtnText: { fontSize: 12, fontWeight: "600", color: colors.purple },
  
  // New Invoice Card Styles
  invoiceCardNew: { 
    backgroundColor: "#fff", 
    borderRadius: 14, 
    borderWidth: 1, 
    borderColor: "#E2E8F0",
    overflow: "hidden",
    flexDirection: "row",
  },
  invoiceCardOverdue: { borderColor: "#FECACA" },
  invoiceStatusBar: { width: 4 },
  invoiceCardContent: { flex: 1, padding: 16 },
  invoiceCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  invoiceCardLeft: { flex: 1 },
  invoiceCardNameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" },
  invoiceCardName: { fontSize: 16, fontWeight: "700", color: "#1E293B" },
  invoiceCardDetails: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  invoiceStatusChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  invoiceStatusChipText: { fontSize: 11, fontWeight: "700" },
  invoiceCardRef: { fontSize: 12, color: "#64748B", marginBottom: 4 },
  invoiceCardDueText: { fontSize: 12, color: "#94A3B8" },
  invoiceCardRight: { alignItems: "flex-end" },
  invoiceCardAmount: { fontSize: 20, fontWeight: "800" },
  invoiceCardExtra: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  invoiceCardExtraText: { fontSize: 12, color: "#64748B" },
  invoiceMpBadge: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#F3E8FF", borderRadius: 8, alignSelf: "flex-start" },
  invoiceMpBadgeText: { fontSize: 11, fontWeight: "500", color: colors.purple },
  invoiceCardActions: { flexDirection: "row", gap: 10, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  invoiceCardActionsDesktop: { justifyContent: "flex-start" },
  invoiceActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0" },
  invoiceActionBtnDesktop: { flex: 0, paddingHorizontal: 20, minWidth: 140, maxWidth: 200 },
  invoiceActionBtnPrimary: { backgroundColor: colors.green, borderColor: colors.green },
  invoiceActionBtnText: { fontSize: 13, fontWeight: "600", color: colors.purple },

  // Paid List
  paidList: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" },
  paidCard: { flexDirection: "row", alignItems: "center", padding: 14, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  paidIcon: { marginRight: 12 },
  paidInfo: { flex: 1 },
  paidName: { fontSize: 14, fontWeight: "600", color: "#1E293B" },
  paidMeta: { fontSize: 12, color: "#64748B", marginTop: 2 },
  paidAmount: { fontSize: 15, fontWeight: "700", color: "#059669" },
  
  // New Paid Card Styles
  paidCardNew: { flexDirection: "row", alignItems: "center", padding: 14, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", gap: 12 },
  paidCardIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  paidCardInfo: { flex: 1, minWidth: 0 },
  paidCardName: { fontSize: 14, fontWeight: "600", color: "#1E293B", marginBottom: 4 },
  paidCardMeta: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  paidCardDate: { fontSize: 12, color: "#64748B" },
  paidCardMethodBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: "#F8FAFC", borderRadius: 6 },
  paidCardMethodText: { fontSize: 11, fontWeight: "600" },
  paidCardAmountBox: { alignItems: "flex-end" },
  paidCardAmount: { fontSize: 16, fontWeight: "700", color: "#059669" },
  paidCardRef: { fontSize: 11, color: "#94A3B8", marginTop: 2 },

  // Empty State
  emptyState: { alignItems: "center", paddingVertical: 40, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0" },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: "#64748B", marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: "#94A3B8", marginTop: 4 },
  
  // Enhanced Section Headers
  sectionHeaderEnhanced: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  sectionIconBox: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sectionTitleEnhanced: { fontSize: 17, fontWeight: "700", color: "#1E293B" },
  sectionSubtitleEnhanced: { fontSize: 12, color: "#64748B", marginTop: 2 },
  sectionStats: { flexDirection: "row", gap: 10 },
  sectionStatBadge: { alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  sectionStatNumber: { fontSize: 16, fontWeight: "800" },
  sectionStatLabel: { fontSize: 10, color: "#64748B", marginTop: 1, textTransform: "uppercase" },
  
  // Empty State Success
  emptyStateSuccess: { alignItems: "center", paddingVertical: 48, backgroundColor: "#ECFDF5", borderRadius: 16, borderWidth: 1, borderColor: "#A7F3D0" },
  emptyStateSuccessTitle: { fontSize: 18, fontWeight: "700", color: "#059669", marginTop: 16 },
  emptyStateSuccessSubtitle: { fontSize: 13, color: "#10B981", marginTop: 4 },
  
  // Empty State Paid
  emptyStatePaid: { alignItems: "center", paddingVertical: 40, backgroundColor: "#F8FAFC", borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0" },
  emptyStatePaidTitle: { fontSize: 15, fontWeight: "600", color: "#64748B", marginTop: 12 },
  emptyStatePaidSubtitle: { fontSize: 13, color: "#94A3B8", marginTop: 4 },
  
  // Paid List New
  paidListNew: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 },
  modalScroll: { flexGrow: 1, justifyContent: "center", padding: 16, width: "100%", maxHeight: "100%" },
  modalScrollView: { flex: 1, width: "100%" },
  modalScrollContent: { flexGrow: 1, paddingBottom: 4, width: "100%" },
  modal: { backgroundColor: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 400, alignSelf: "center", maxHeight: "85%", overflow: "hidden" },
  settingsModal: { maxWidth: 500, maxHeight: "90%", padding: 16 },
  pixKeyModal: { maxWidth: 380, maxHeight: "80%", paddingHorizontal: 24 },
  pricingModal: { maxWidth: 420, maxHeight: "80%" },
  studentAccountModal: { maxWidth: 480, maxHeight: "85%", padding: 0 },
  studentAccountScrollContent: { padding: 24, paddingBottom: 32 },
  modalHeader: { alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#1E293B", textAlign: "center", marginTop: 12 },
  modalSubtitle: { fontSize: 13, color: "#64748B", textAlign: "center", marginTop: 4 },
  formGrid: { gap: 0 },
  formGroup: { marginBottom: 4 },
  inputLabel: { fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 6, marginTop: 12 },
  inputLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  selectedCount: { fontSize: 12, fontWeight: "600", color: colors.purple, marginTop: 12 },
  inputHint: { fontSize: 11, color: "#94A3B8", marginTop: 4 },
  input: { backgroundColor: "#F8FAFC", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#1E293B", borderWidth: 1, borderColor: "#E2E8F0", width: "100%", outlineStyle: "none" } as any,
  inputError: { borderColor: "#DC2626", fontSize: 11, color: "#DC2626", marginTop: 4, fontWeight: "500" } as any,
  inputWithPrefix: { flexDirection: "row", alignItems: "center", backgroundColor: "#F8FAFC", borderRadius: 10, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" },
  inputPrefix: { paddingLeft: 14, paddingVertical: 12, fontSize: 15, fontWeight: "600", color: "#64748B" },
  inputWithPrefixInput: { flex: 1, paddingLeft: 8, paddingRight: 14, borderWidth: 0, backgroundColor: "transparent" },
  chipsScroll: { marginVertical: 4 },
  chip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "#F1F5F9", marginRight: 8, borderWidth: 1, borderColor: "#E2E8F0" },
  chipSelected: { backgroundColor: colors.purple, borderColor: colors.purple },
  chipText: { fontSize: 13, fontWeight: "600", color: "#1E293B" },
  chipTextSelected: { color: "#fff" },
  
  // Invoice type buttons
  invoiceTypeContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 8 },
  invoiceTypeBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: "#F1F5F9", borderWidth: 1, borderColor: "#E2E8F0" },
  invoiceTypeBtnActive: { backgroundColor: colors.purple, borderColor: colors.purple },
  invoiceTypeBtnText: { fontSize: 13, fontWeight: "600", color: "#64748B" },
  invoiceTypeBtnTextActive: { color: "#fff" },
  
  // Filter chips
  filterChipsScroll: { marginVertical: 6 },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: "#F8FAFC", marginRight: 6, borderWidth: 1, borderColor: "#E2E8F0" },
  filterChipActive: { backgroundColor: "#7C3AED20", borderColor: colors.purple },
  filterChipText: { fontSize: 12, fontWeight: "500", color: "#64748B" },
  filterChipTextActive: { color: colors.purple, fontWeight: "600" },
  
  // Selection actions
  selectionActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  selectAllBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: "#F3E8FF" },
  selectAllBtnText: { fontSize: 12, fontWeight: "600", color: colors.purple },
  noStudentsText: { fontSize: 13, color: "#94A3B8", fontStyle: "italic", paddingVertical: 8 },
  methodsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  methodBtn: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 6, 
    paddingHorizontal: 14, 
    paddingVertical: 10, 
    borderRadius: 10, 
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  methodBtnActive: { backgroundColor: colors.purple, borderColor: colors.purple },

  // PIX Key Modal
  activePixBox: {
    backgroundColor: "#D1FAE5",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  activePixHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  activePixLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#059669",
  },
  activePixKey: {
    fontSize: 16,
    fontWeight: "700",
    color: "#065F46",
  },
  activePixType: {
    fontSize: 11,
    color: "#059669",
    marginTop: 4,
  },
  noPixBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  noPixText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#D97706",
  },
  pixTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  pixTypeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  pixTypeBtnActive: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },
  pixTypeBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  pixTypeBtnTextActive: {
    color: "#fff",
  },

  // Pricing Modal
  deadlinesSection: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 12,
    textAlign: "center",
  },
  deadlinesRow: {
    flexDirection: "row",
    gap: 12,
  },
  deadlineField: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  deadlineLabel: {
    fontSize: 11,
    color: "#64748B",
    marginBottom: 6,
    textAlign: "center",
  },
  deadlineInput: {
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 24,
    fontWeight: "800",
    color: colors.purple,
    borderWidth: 2,
    borderColor: "#E2E8F0",
    textAlign: "center",
    width: 80,
    maxWidth: 100,
  },
  deadlineInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 12,
    padding: 10,
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
  },
  deadlineInfoText: {
    flex: 1,
    fontSize: 11,
    color: "#64748B",
    lineHeight: 15,
  },
  pricingTableSection: {
    marginBottom: 16,
  },
  methodBtnText: { fontSize: 12, fontWeight: "600", color: "#1E293B" },
  methodBtnTextActive: { color: "#fff" },
  invoiceSummary: { alignItems: "center", padding: 16, backgroundColor: "#F8FAFC", borderRadius: 12, marginBottom: 16 },
  summaryName: { fontSize: 15, fontWeight: "600", color: "#1E293B" },
  summaryAmount: { fontSize: 24, fontWeight: "800", color: colors.purple, marginTop: 4 },
  summaryMeta: { fontSize: 12, fontWeight: "500", marginTop: 4 },
  pixHeader: { alignItems: "center", marginBottom: 16 },
  pixBox: { backgroundColor: "#F8FAFC", borderRadius: 10, padding: 14, marginBottom: 16 },
  pixLabel: { fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 },
  pixCode: { fontSize: 11, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", color: "#1E293B", lineHeight: 18 },
  batchInfo: { fontSize: 14, color: "#64748B", textAlign: "center", marginBottom: 16, lineHeight: 20 },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 20 },
  btnSecondary: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: "#F1F5F9", alignItems: "center" },
  btnSecondaryText: { fontSize: 15, fontWeight: "600", color: "#64748B" },
  btnPrimary: { flex: 1, flexDirection: "row", paddingVertical: 14, borderRadius: 10, backgroundColor: colors.purple, alignItems: "center", justifyContent: "center", gap: 8 },
  btnPrimaryText: { fontSize: 15, fontWeight: "600", color: "#fff" },
  
  // Settings modal buttons
  settingsModalBtns: { 
    flexDirection: "row",
    justifyContent: "center",
    gap: 12, 
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  settingsCancelBtn: { 
    flex: 1,
    maxWidth: 140,
    paddingVertical: 14, 
    borderRadius: 10, 
    backgroundColor: "#F1F5F9", 
    alignItems: "center",
    justifyContent: "center",
  },
  settingsCancelBtnText: { 
    fontSize: 15, 
    fontWeight: "600", 
    color: "#64748B",
  },
  settingsSaveBtn: { 
    flex: 1,
    maxWidth: 140,
    flexDirection: "row", 
    paddingVertical: 14, 
    borderRadius: 10, 
    backgroundColor: colors.purple, 
    alignItems: "center", 
    justifyContent: "center", 
    gap: 6,
  },
  settingsSaveBtnText: { 
    fontSize: 15, 
    fontWeight: "600", 
    color: "#fff",
  },
  
  // Zona de perigo
  dangerZone: {
    marginTop: 32,
    padding: 16,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  dangerZoneHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  dangerZoneTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#DC2626",
  },
  dangerZoneDesc: {
    fontSize: 13,
    color: "#991B1B",
    marginBottom: 16,
  },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#DC2626",
    backgroundColor: "#FFFFFF",
  },
  dangerBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#DC2626",
  },
  
  // Empty settings box
  emptySettingsBox: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptySettingsText: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 16,
    lineHeight: 20,
  },

  // Seção de preços
  pricingSection: {
    marginTop: 24,
    padding: 16,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  pricingSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  pricingSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
  },
  pricingSectionSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 16,
  },
  pricingTable: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  pricingTableHeader: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  pricingTableHeaderCell: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
  },
  pricingTableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    alignItems: "center",
  },
  pricingTableCell: {
    justifyContent: "center",
  },
  tierBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
  },
  tierBadgeText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
  },
  priceInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  priceInputPrefix: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    marginRight: 4,
  },
  priceInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
    minWidth: 50,
  },
  pricingInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 12,
    padding: 10,
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
  },
  pricingInfoText: {
    flex: 1,
    fontSize: 12,
    color: "#92400E",
    lineHeight: 16,
  },

  // Initial Invoices Modal
  initialInvoicesInfo: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
    gap: 10,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
  },
  infoNote: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 18,
    marginTop: 8,
  },

  // Student Account Control
  studentsAccountList: {
    gap: 8,
  },
  studentAccountItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 12,
  },
  studentAccountItemSelected: {
    backgroundColor: "#F3E8FF",
    borderColor: colors.purple,
  },
  studentCheckbox: {
    marginRight: 4,
  },
  // Bulk actions
  sectionHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bulkModeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#F3E8FF",
  },
  bulkModeBtnActive: {
    backgroundColor: colors.purple,
  },
  bulkModeBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.purple,
  },
  bulkActionsContainer: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 12,
  },
  bulkSelectRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
  },
  bulkSelectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  bulkSelectBtnText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#475569",
  },
  bulkSelectedCount: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.purple,
    marginLeft: "auto",
  },
  bulkActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  bulkActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  bulkActionBtnDanger: {
    backgroundColor: colors.danger,
  },
  bulkActionBtnPrimary: {
    backgroundColor: colors.purple,
  },
  bulkActionBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  studentAccountAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
  },
  studentAccountAvatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.purple,
  },
  studentAccountInfo: {
    flex: 1,
  },
  studentAccountName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
  },
  studentAccountStatus: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  moreStudentsText: {
    textAlign: "center",
    fontSize: 12,
    color: "#64748B",
    marginTop: 8,
  },
  loadMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    marginTop: 8,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.purple,
  },

  // Student Account Modal
  studentInvoicesList: {
    marginBottom: 20,
  },
  noInvoicesBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8FAFC",
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  noInvoicesText: {
    fontSize: 13,
    color: "#64748B",
  },
  studentInvoiceItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginTop: 8,
    gap: 10,
  },
  studentInvoiceInfo: {
    flex: 1,
  },
  studentInvoiceDesc: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E293B",
  },
  studentInvoiceStatus: {
    fontSize: 11,
    color: "#FFA000",
    marginTop: 2,
  },
  studentInvoiceAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
  },
  removeInvoiceBtn: {
    padding: 8,
  },

  // Account Actions
  accountActionsSection: {
    marginTop: 16,
  },
  accountActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 12,
    marginBottom: 12,
  },
  accountActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  accountActionInfo: {
    flex: 1,
  },
  accountActionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
  },
  accountActionDesc: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  customInvoiceSection: {
    backgroundColor: "#F8FAFC",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  customInvoiceLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 10,
  },
  customInvoiceRow: {
    flexDirection: "row",
    gap: 10,
  },
});

// Desktop Styles
const dkStyles = StyleSheet.create({
  screen: { backgroundColor: "#F8FAFC" },
  content: { padding: 24, paddingBottom: 40 },
  header: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 24,
  },
  statsGrid: { 
    flexDirection: "row", 
    flexWrap: "wrap", 
    gap: 16,
    marginBottom: 24,
  },
  actionsRow: { 
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 28,
    justifyContent: "flex-start",
  },
  actionToolbar: {
    padding: 16,
  },
  section: { 
    maxWidth: 1000,
    marginBottom: 28,
  },
  // Modal desktop
  modalScroll: {
    padding: 32,
  },
  settingsModal: {
    maxWidth: 600,
    padding: 32,
  },
  formGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  formGroupFull: {
    width: "100%",
  },
  formGroupHalf: {
    flex: 1,
    minWidth: 200,
  },
});
