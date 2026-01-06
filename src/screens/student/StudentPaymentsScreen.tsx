import React, { useState, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, ActivityIndicator, RefreshControl, Linking, Platform, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";

import CdmfHeader from "../../components/CdmfHeader";
import SectionHeader from "../../components/SectionHeader";
import StudentHeader from "../../components/StudentHeader";
import { colors } from "../../theme/colors";
import { useDesktop } from "../../contexts/DesktopContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useAuth } from "../../contexts/AuthContext";
import { usePayment, Invoice, formatCurrency } from "../../contexts/PaymentContext";
import { 
  USE_MERCADO_PAGO, 
  generateMercadoPagoPixForInvoice, 
  pollPaymentStatus,
  checkMercadoPagoPayment 
} from "../../services/mercadoPagoService";

// Função segura para formatar data no formato DD/MM/YYYY
const formatDateSafe = (dateStr: any): string => {
  if (!dateStr || typeof dateStr !== 'string') return '--/--/----';
  try {
    return dateStr.split("-").reverse().join("/");
  } catch {
    return '--/--/----';
  }
};

// ==================== COMPONENTES ====================

function StatusBadge({ status }: { status: Invoice["status"] }) {
  const configs = {
    pending: { label: "Pendente", color: "#D97706", bg: "#FEF3C7" },
    overdue: { label: "Atrasado", color: "#DC2626", bg: "#FEE2E2" },
    paid: { label: "Pago", color: "#059669", bg: "#D1FAE5" },
    cancelled: { label: "Cancelado", color: "#64748B", bg: "#F1F5F9" },
  };
  const config = configs[status] || configs.pending;

  return (
    <View style={[badgeStyles.badge, { backgroundColor: config.bg }]}>
      <View style={[badgeStyles.dot, { backgroundColor: config.color }]} />
      <Text style={[badgeStyles.text, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 12, fontWeight: "700" },
});

function InvoiceCard({ 
  invoice, 
  onPress,
  themeColors,
}: { 
  invoice: Invoice; 
  onPress: () => void;
  themeColors: any;
}) {
  const isPending = invoice.status === "pending" || invoice.status === "overdue";
  const dueDate = formatDateSafe(invoice.dueDate);
  const lateDueDate = invoice.lateDueDate ? formatDateSafe(invoice.lateDueDate) : null;
  const hasDiscount = invoice.discountAmount > 0;
  
  // Verifica se ainda está no período de desconto
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const earlyDeadline = new Date(invoice.dueDate + "T23:59:59");
  const isInDiscountPeriod = today <= earlyDeadline && isPending;

  return (
    <Pressable 
      style={({ pressed }) => [
        styles.invoiceCard, 
        { backgroundColor: themeColors.bgCard, borderColor: themeColors.border },
        pressed && { opacity: 0.9 }
      ]} 
      onPress={onPress}
    >
      <View style={styles.invoiceHeader}>
        <View style={styles.invoiceInfo}>
          <Text style={[styles.invoiceTitle, { color: themeColors.text }]}>{invoice.description}</Text>
          
          {/* Info de turmas */}
          {invoice.classCount > 0 && (
            <View style={styles.classesBadge}>
              <Ionicons name="school-outline" size={12} color={colors.purple} />
              <Text style={styles.classesBadgeText}>{invoice.classCount} turma{invoice.classCount > 1 ? "s" : ""}</Text>
            </View>
          )}
          
          {/* Datas de vencimento */}
          <Text style={[styles.invoiceDue, { color: themeColors.textMuted }]}>
            {isPending 
              ? isInDiscountPeriod 
                ? `Com desconto até: ${dueDate}`
                : lateDueDate 
                  ? `Vencimento: ${lateDueDate}` 
                  : `Vencimento: ${dueDate}`
              : `Pago em: ${invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString("pt-BR") : dueDate}`
            }
          </Text>
        </View>
        <View style={styles.invoiceRight}>
          {/* Valor com desconto destacado */}
          {hasDiscount && isInDiscountPeriod ? (
            <>
              <Text style={[styles.invoiceOriginalAmount, { color: themeColors.textMuted }]}>
                {formatCurrency(invoice.originalAmount)}
              </Text>
              <Text style={[styles.invoiceAmount, { color: colors.green }]}>
                {formatCurrency(invoice.amount)}
              </Text>
              <View style={styles.discountBadge}>
                <Ionicons name="pricetag" size={10} color="#059669" />
                <Text style={styles.discountText}>-{formatCurrency(invoice.discountAmount)}</Text>
              </View>
            </>
          ) : (
            <Text style={[styles.invoiceAmount, { color: themeColors.text }]}>{formatCurrency(invoice.amount)}</Text>
          )}
          <StatusBadge status={invoice.status} />
        </View>
      </View>

      {/* Info de período de desconto */}
      {hasDiscount && isPending && (
        <View style={[styles.discountInfo, isInDiscountPeriod ? styles.discountInfoActive : styles.discountInfoExpired]}>
          <Ionicons 
            name={isInDiscountPeriod ? "time-outline" : "alert-circle-outline"} 
            size={14} 
            color={isInDiscountPeriod ? "#059669" : "#D97706"} 
          />
          <Text style={[styles.discountInfoText, { color: isInDiscountPeriod ? "#059669" : "#D97706" }]}>
            {isInDiscountPeriod 
              ? `Pague até ${dueDate} e economize ${formatCurrency(invoice.discountAmount)}!`
              : `Desconto expirado. Valor normal: ${formatCurrency(invoice.originalAmount)}`
            }
          </Text>
        </View>
      )}
      
      {isPending && (
        <View style={styles.invoiceAction}>
          <View style={[styles.payNowBtn, { backgroundColor: colors.purple }]}>
            <Ionicons name="qr-code-outline" size={16} color="#fff" />
            <Text style={styles.payNowText}>Pagar com PIX</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

function EmptyState({ icon, title, subtitle, themeColors }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string; themeColors: any }) {
  return (
    <View style={[styles.emptyState, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
      <Ionicons name={icon} size={48} color={themeColors.textMuted} />
      <Text style={[styles.emptyTitle, { color: themeColors.textMuted }]}>{title}</Text>
      {subtitle && <Text style={[styles.emptySubtitle, { color: themeColors.textMuted }]}>{subtitle}</Text>}
    </View>
  );
}

function SummaryCard({ 
  label, 
  value, 
  icon, 
  color, 
  themeColors,
}: { 
  label: string; 
  value: string; 
  icon: keyof typeof Ionicons.glyphMap; 
  color: string;
  themeColors: any;
}) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border, borderLeftColor: color }]}>
      <View style={[styles.summaryIconBox, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View>
        <Text style={[styles.summaryValue, { color }]}>{value}</Text>
        <Text style={[styles.summaryLabel, { color: themeColors.textMuted }]}>{label}</Text>
      </View>
    </View>
  );
}

// ==================== TELA PRINCIPAL ====================

export default function StudentPaymentsScreen() {
  const { isDesktopMode } = useDesktop();
  const { colors: themeColors, isDark } = useTheme();
  const { profile } = useAuth();
  const { fetchInvoices, subscribeToInvoices } = usePayment();

  // State
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Modal states
  const [showPixModal, setShowPixModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [pixCode, setPixCode] = useState("");
  const [pixQrCodeBase64, setPixQrCodeBase64] = useState("");
  const [generatingPix, setGeneratingPix] = useState(false);
  const [pixError, setPixError] = useState("");
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const stopPollingRef = React.useRef<(() => void) | null>(null);
  
  // Tracking invoice being paid (for background detection)
  const [pendingPaymentInvoiceId, setPendingPaymentInvoiceId] = useState<string | null>(null);
  const [showBackgroundConfirmation, setShowBackgroundConfirmation] = useState(false);
  const previousInvoicesRef = React.useRef<Invoice[]>([]);

  // Support links
  const supportLinks = [
    { text: "Problemas no pagamento", icon: "help-circle-outline" as const, url: "https://wa.me/5500000000000?text=Olá, estou com problemas no pagamento" },
    { text: "Valor incorreto", icon: "alert-circle-outline" as const, url: "https://wa.me/5500000000000?text=Olá, o valor da mensalidade está incorreto" },
    { text: "Falar com suporte", icon: "chatbubbles-outline" as const, url: "https://wa.me/5500000000000" },
  ];

  // Carrega faturas (fallback para quando listener falha)
  const loadData = useCallback(async () => {
    if (!profile?.uid) return;
    
    try {
      const data = await fetchInvoices({ studentId: profile.uid });
      setInvoices(data);
    } catch (e) {
      console.error("Erro ao carregar faturas:", e);
    } finally {
      setLoading(false);
    }
  }, [profile?.uid, fetchInvoices]);

  // Tenta usar listener em tempo real, com fallback para fetch simples
  useEffect(() => {
    if (!profile?.uid) {
      setLoading(false);
      return;
    }

    let unsubscribe: (() => void) | null = null;
    let listenerFailed = false;

    try {
      // Tenta usar listener em tempo real
      unsubscribe = subscribeToInvoices(profile.uid, (newInvoices) => {
        // Detecta se alguma fatura que estava pendente agora está paga
        const previousPending = previousInvoicesRef.current.filter(
          inv => inv.status === "pending" || inv.status === "overdue"
        );
        
        for (const prevInv of previousPending) {
          const currentInv = newInvoices.find(inv => inv.id === prevInv.id);
          if (currentInv && currentInv.status === "paid") {
            // Pagamento confirmado! Pode ter sido feito em background
            
            // Se é a fatura que estamos monitorando no modal
            if (selectedInvoice?.id === currentInv.id) {
              setPaymentConfirmed(true);
              setCheckingPayment(false);
              if (stopPollingRef.current) {
                stopPollingRef.current();
                stopPollingRef.current = null;
              }
            }
            
            // Se é a fatura que estava sendo paga (mesmo com modal fechado)
            if (pendingPaymentInvoiceId === currentInv.id) {
              setShowBackgroundConfirmation(true);
              setPendingPaymentInvoiceId(null);
            }
          }
        }
        
        previousInvoicesRef.current = newInvoices;
        setInvoices(newInvoices);
        setLoading(false);
      });
      
      // Timeout de segurança - se após 5s ainda estiver carregando, usa fallback
      const timeout = setTimeout(() => {
        if (loading) {
          loadData();
        }
      }, 5000);
      
      return () => {
        clearTimeout(timeout);
        if (unsubscribe) unsubscribe();
      };
    } catch (error) {
      // Se o listener falhar (ex: índice não existe), usa fetch simples
      console.error("Erro no listener, usando fallback:", error);
      listenerFailed = true;
      loadData();
    }

    if (listenerFailed) {
      return undefined;
    }
  }, [profile?.uid, subscribeToInvoices, loadData, loading, selectedInvoice?.id, pendingPaymentInvoiceId]);
  
  // Detecta quando o app volta ao foreground (visibilidade da página)
  useEffect(() => {
    if (Platform.OS !== "web") return;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Usuário voltou para a aba - verifica pagamentos pendentes
        if (selectedInvoice && !paymentConfirmed) {
          // Verifica se a fatura foi paga enquanto estava em background
          checkMercadoPagoPayment(selectedInvoice.id).then(result => {
            if (result.isPaid) {
              setPaymentConfirmed(true);
              setCheckingPayment(false);
              if (stopPollingRef.current) {
                stopPollingRef.current();
                stopPollingRef.current = null;
              }
              loadData();
            }
          }).catch(() => {});
        }
        
        // Também recarrega dados para garantir sincronização
        loadData();
      }
    };
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [selectedInvoice, paymentConfirmed, loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleOpenInvoice = async (invoice: Invoice) => {
    // Reset estados
    setCopied(false);
    setPaymentConfirmed(false);
    setPixQrCodeBase64("");
    
    // Para de fazer polling anterior se existir
    if (stopPollingRef.current) {
      stopPollingRef.current();
      stopPollingRef.current = null;
    }
    
    if (invoice.status === "paid" || invoice.status === "cancelled") {
      // Para faturas pagas/canceladas, apenas mostrar detalhes
      setSelectedInvoice(invoice);
      setPixCode("");
      setPixError("");
      setShowPixModal(true);
      return;
    }

    // Para faturas pendentes, gerar PIX
    setSelectedInvoice(invoice);
    setPixCode("");
    setPixError("");
    setShowPixModal(true);
    setGeneratingPix(true);

    try {
      // Verifica se a fatura já tem um PIX válido (não expirado)
      const now = Date.now();
      const pixExpiresAt = invoice.pixExpiresAt || 0;
      const hasValidCachedPix = invoice.pixCode && 
                                invoice.pixQrCodeBase64 && 
                                pixExpiresAt > now;
      
      if (hasValidCachedPix) {
        // Usa o PIX já existente na fatura (sem console.log para performance)
        setPixCode(invoice.pixCode!);
        setPixQrCodeBase64(invoice.pixQrCodeBase64!);
        
        // Inicia polling para verificar pagamento automaticamente
        stopPollingRef.current = pollPaymentStatus(
          invoice.id,
          () => {
            setPaymentConfirmed(true);
            setCheckingPayment(false);
            loadData();
          }
        );
        setCheckingPayment(true);
        setGeneratingPix(false);
        return;
      }
      
      // PIX expirado ou inexistente - gerar novo via Mercado Pago
      
      // Valida email antes de usar Mercado Pago
      const emailToUse = profile?.email || invoice.studentEmail;
      const isValidEmail = emailToUse && 
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToUse) &&
        !emailToUse.toLowerCase().includes("test@") &&
        !emailToUse.toLowerCase().includes("teste@") &&
        !emailToUse.toLowerCase().includes("example");
      
      // Verifica se tem email válido para Mercado Pago
      if (!isValidEmail) {
        throw new Error("É necessário ter um email válido cadastrado para gerar o PIX. Atualize seu perfil.");
      }
      
      const result = await generateMercadoPagoPixForInvoice(
        invoice,
        profile?.name || invoice.studentName,
        emailToUse!
      );
      
      // Verifica se o pagamento não foi rejeitado
      if (result.status === "rejected") {
        throw new Error("Pagamento rejeitado pelo Mercado Pago. Tente novamente ou entre em contato.");
      }
      
      setPixCode(result.pixCode);
      if (result.pixQrCodeBase64) {
        setPixQrCodeBase64(result.pixQrCodeBase64);
      }
      
      // Inicia polling para verificar pagamento automaticamente
      stopPollingRef.current = pollPaymentStatus(
        invoice.id,
        () => {
          // Pagamento confirmado!
          setPaymentConfirmed(true);
          setCheckingPayment(false);
          // Recarrega dados
          loadData();
        }
      );
      setCheckingPayment(true);
    } catch (e: any) {
      console.error("[PIX] Erro ao gerar:", e.message, e);
      setPixError(e.message || "Erro ao gerar código PIX. Tente novamente.");
    } finally {
      setGeneratingPix(false);
    }
  };
  
  // Limpa polling ao fechar modal, mas mantém tracking para detecção em background
  const handleClosePixModal = () => {
    // Se havia uma fatura com PIX pendente e não foi confirmada, mantém tracking
    if (selectedInvoice && !paymentConfirmed && pixCode) {
      setPendingPaymentInvoiceId(selectedInvoice.id);
    }
    
    if (stopPollingRef.current) {
      stopPollingRef.current();
      stopPollingRef.current = null;
    }
    setCheckingPayment(false);
    setShowPixModal(false);
    setSelectedInvoice(null);
    setPixCode("");
    setPixQrCodeBase64("");
    setPixError("");
    setPaymentConfirmed(false);
  };
  
  // Fecha modal de confirmação em background
  const handleCloseBackgroundConfirmation = () => {
    setShowBackgroundConfirmation(false);
  };
  
  // Verificar pagamento manualmente
  const handleCheckPayment = async () => {
    if (!selectedInvoice) return;
    
    setCheckingPayment(true);
    try {
      const result = await checkMercadoPagoPayment(selectedInvoice.id);
      if (result.isPaid) {
        setPaymentConfirmed(true);
        loadData();
      }
    } catch (e) {
      console.error("Erro ao verificar pagamento:", e);
    } finally {
      setCheckingPayment(false);
    }
  };

  // Gerar novo PIX (força geração mesmo se existir um válido)
  const handleForceGenerateNewPix = async () => {
    if (!selectedInvoice) return;
    
    // Para de fazer polling anterior se existir
    if (stopPollingRef.current) {
      stopPollingRef.current();
      stopPollingRef.current = null;
    }
    
    setPixCode("");
    setPixQrCodeBase64("");
    setPixError("");
    setGeneratingPix(true);
    setCheckingPayment(false);
    
    try {
      const emailToUse = profile?.email || selectedInvoice.studentEmail;
      const isValidEmail = emailToUse && 
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToUse) &&
        !emailToUse.toLowerCase().includes("test@") &&
        !emailToUse.toLowerCase().includes("teste@") &&
        !emailToUse.toLowerCase().includes("example");
      
      if (!isValidEmail) {
        throw new Error("É necessário ter um email válido cadastrado para gerar o PIX.");
      }
      
      const result = await generateMercadoPagoPixForInvoice(
        selectedInvoice,
        profile?.name || selectedInvoice.studentName,
        emailToUse!
      );
      
      if (result.status === "rejected") {
        throw new Error("Pagamento rejeitado pelo Mercado Pago. Tente novamente.");
      }
      
      setPixCode(result.pixCode);
      if (result.pixQrCodeBase64) {
        setPixQrCodeBase64(result.pixQrCodeBase64);
      }
      
      // Atualiza a fatura local com os novos dados do PIX
      setSelectedInvoice(prev => prev ? {
        ...prev,
        pixCode: result.pixCode,
        pixQrCodeBase64: result.pixQrCodeBase64,
        pixExpiresAt: result.expiresAt ? new Date(result.expiresAt).getTime() : Date.now() + 30 * 60 * 1000,
        mpPaymentId: result.paymentId,
      } : null);
      
      // Inicia polling para verificar pagamento
      stopPollingRef.current = pollPaymentStatus(
        selectedInvoice.id,
        () => {
          setPaymentConfirmed(true);
          setCheckingPayment(false);
          loadData();
        }
      );
      setCheckingPayment(true);
      
      // Recarrega os dados para atualizar a lista
      loadData();
    } catch (e: any) {
      console.error("[PIX] Erro ao gerar novo PIX:", e.message, e);
      setPixError(e.message || "Erro ao gerar código PIX. Tente novamente.");
    } finally {
      setGeneratingPix(false);
    }
  };

  const [copied, setCopied] = useState(false);
  
  // Ref para o textarea (usado para copiar no mobile web)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  
  const handleCopyPix = async () => {
    if (!pixCode) return;
    
    let success = false;
    
    if (Platform.OS === "web") {
      // MÉTODO 1: Usar o textarea visível (mais confiável em mobile)
      if (textareaRef.current) {
        try {
          textareaRef.current.focus();
          textareaRef.current.select();
          textareaRef.current.setSelectionRange(0, pixCode.length);
          success = document.execCommand("copy");
        } catch (e) {
          // Silencioso
        }
      }
      
      // MÉTODO 2: Clipboard API (funciona em HTTPS ou localhost)
      if (!success && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(pixCode);
          success = true;
        } catch (e) {
          // Silencioso
        }
      }
      
      // MÉTODO 3: Criar elemento temporário
      if (!success) {
        try {
          const textarea = document.createElement("textarea");
          textarea.value = pixCode;
          textarea.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100px;opacity:1;z-index:99999";
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          textarea.setSelectionRange(0, pixCode.length);
          success = document.execCommand("copy");
          document.body.removeChild(textarea);
        } catch (e) {
          // Silencioso
        }
      }
    } else {
      // Para apps nativos, usar expo-clipboard
      try {
        await Clipboard.setStringAsync(pixCode);
        success = true;
      } catch (e) {
        // Silencioso
      }
    }
    
    // Feedback visual sempre (mesmo se falhar, usuário pode copiar manualmente)
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  // Separar faturas
  const pendingInvoices = invoices.filter(i => i.status === "pending" || i.status === "overdue");
  const paidInvoices = invoices.filter(i => i.status === "paid");

  // Calcular totais
  const totalPending = pendingInvoices.reduce((sum, i) => sum + i.amount, 0);
  const overdueCount = invoices.filter(i => i.status === "overdue").length;

  if (loading) {
    return (
      <View style={[styles.screen, styles.loadingContainer, { backgroundColor: themeColors.bg }]}>
        <ActivityIndicator size="large" color={colors.purple} />
        <Text style={[styles.loadingText, { color: themeColors.textMuted }]}>Carregando...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: themeColors.bg }]}>
      {!isDesktopMode && <StudentHeader />}
      {!isDesktopMode && <SectionHeader title="Pagamentos" />}

      {/* Modal de Confirmação em Background */}
      <Modal visible={showBackgroundConfirmation} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.backgroundConfirmModal, { backgroundColor: themeColors.bgCard }]}>
            <View style={styles.backgroundConfirmContent}>
              <View style={styles.backgroundConfirmIcon}>
                <Ionicons name="checkmark-circle" size={64} color="#10B981" />
              </View>
              <Text style={styles.backgroundConfirmTitle}>Pagamento Confirmado!</Text>
              <Text style={[styles.backgroundConfirmSubtitle, { color: themeColors.textMuted }]}>
                Seu pagamento foi processado com sucesso enquanto você estava em outra tela.
              </Text>
              <Pressable 
                style={styles.backgroundConfirmBtn}
                onPress={handleCloseBackgroundConfirmation}
              >
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.backgroundConfirmBtnText}>Entendido</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal PIX */}
      <Modal visible={showPixModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, isDesktopMode && dkStyles.modal, { backgroundColor: themeColors.bgCard }]}>
            {/* Indicador de rolagem */}
            <View style={styles.scrollIndicator}>
              <View style={[styles.scrollIndicatorBar, { backgroundColor: themeColors.border }]} />
              <Text style={[styles.scrollIndicatorText, { color: themeColors.textMuted }]}>Deslize para ver mais ↓</Text>
            </View>
            <ScrollView 
              style={styles.modalScrollView}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable onPress={e => e.stopPropagation()}>
                {selectedInvoice && (
                  <>
                    {/* Header */}
                    <View style={styles.pixModalHeader}>
                      <Ionicons 
                        name={selectedInvoice.status === "paid" ? "checkmark-circle" : "qr-code"} 
                        size={48} 
                        color={selectedInvoice.status === "paid" ? colors.green : colors.purple} 
                      />
                      <Text style={[styles.pixModalTitle, { color: themeColors.text }]}>
                        {selectedInvoice.status === "paid" ? "Pagamento Confirmado" : "Pagar com PIX"}
                      </Text>
                    </View>

                    {/* Invoice Info */}
                    <View style={[styles.invoiceSummaryBox, { backgroundColor: themeColors.bgSecondary }]}>
                      <Text style={[styles.invoiceSummaryDesc, { color: themeColors.text }]}>{selectedInvoice.description}</Text>
                      <Text style={[styles.invoiceSummaryAmount, { color: colors.purple }]}>{formatCurrency(selectedInvoice.amount)}</Text>
                      {selectedInvoice.status !== "paid" && (() => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const earlyDeadline = selectedInvoice.dueDate ? new Date(selectedInvoice.dueDate + "T23:59:59") : new Date();
                        const isInDiscountPeriod = today <= earlyDeadline;
                        const dueDate = formatDateSafe(selectedInvoice.dueDate);
                        const lateDueDate = selectedInvoice.lateDueDate ? formatDateSafe(selectedInvoice.lateDueDate) : null;
                        
                        return (
                          <Text style={[styles.invoiceSummaryDue, { color: isInDiscountPeriod ? colors.green : themeColors.textMuted }]}>
                            {isInDiscountPeriod 
                              ? `Com desconto até: ${dueDate}`
                              : lateDueDate 
                                ? `Vencimento: ${lateDueDate}` 
                                : `Vencimento: ${dueDate}`}
                          </Text>
                        );
                      })()}
                      {selectedInvoice.status === "paid" && selectedInvoice.paidAt && (
                        <Text style={[styles.invoiceSummaryDue, { color: colors.green }]}>
                          Pago em: {new Date(selectedInvoice.paidAt).toLocaleDateString("pt-BR")}
                        </Text>
                      )}
                    </View>

                    {/* PIX Code (only for pending) */}
                    {(selectedInvoice.status === "pending" || selectedInvoice.status === "overdue") && (
                      <>
                        {paymentConfirmed ? (
                          <View style={styles.paymentConfirmedBox}>
                            <View style={styles.confirmedIconCircle}>
                              <Ionicons name="checkmark-circle" size={64} color={colors.green} />
                            </View>
                            <Text style={styles.confirmedTitle}>Pagamento Confirmado!</Text>
                            <Text style={[styles.confirmedSubtitle, { color: themeColors.textMuted }]}>
                              Seu pagamento foi processado com sucesso.
                            </Text>
                            
                            {/* Botão Fechar após confirmação */}
                            <Pressable 
                              style={[styles.confirmedCloseBtn, { backgroundColor: colors.green }]} 
                              onPress={handleClosePixModal}
                            >
                              <Ionicons name="checkmark" size={20} color="#fff" />
                              <Text style={styles.confirmedCloseBtnText}>Fechar</Text>
                            </Pressable>
                          </View>
                        ) : generatingPix ? (
                          <View style={styles.pixLoading}>
                            <ActivityIndicator size="large" color={colors.purple} />
                            <Text style={[styles.pixLoadingText, { color: themeColors.textMuted }]}>Gerando código PIX...</Text>
                          </View>
                        ) : pixError ? (
                          <View style={[styles.pixErrorBox, { backgroundColor: "#FEE2E2" }]}>
                            <Ionicons name="warning" size={24} color="#DC2626" />
                            <Text style={styles.pixErrorText}>{pixError}</Text>
                          </View>
                        ) : pixCode ? (
                          <>
                            {/* QR Code */}
                            <View style={styles.qrCodeContainer}>
                              <View style={styles.qrCodeBox}>
                                {pixQrCodeBase64 ? (
                                  <Image 
                                    source={{ uri: `data:image/png;base64,${pixQrCodeBase64}` }}
                                    style={{ width: 180, height: 180 }}
                                  />
                                ) : (
                                  <QRCode
                                    value={pixCode}
                                    size={180}
                                    backgroundColor="#FFFFFF"
                                    color="#000000"
                                  />
                                )}
                              </View>
                              <Text style={[styles.qrCodeHint, { color: themeColors.textMuted }]}>
                                Escaneie o QR Code com o app do seu banco
                              </Text>
                              
                              {/* PIX Expiration info */}
                              {selectedInvoice.pixExpiresAt && (
                                <View style={styles.pixExpirationInfo}>
                                  <Ionicons name="time-outline" size={14} color={themeColors.textMuted} />
                                  <Text style={[styles.pixExpirationText, { color: themeColors.textMuted }]}>
                                    {(() => {
                                      const expiresAt = selectedInvoice.pixExpiresAt!;
                                      const now = Date.now();
                                      const minutesLeft = Math.max(0, Math.round((expiresAt - now) / 60000));
                                      if (minutesLeft > 60) {
                                        const hours = Math.floor(minutesLeft / 60);
                                        const mins = minutesLeft % 60;
                                        return `Expira em ${hours}h ${mins}min`;
                                      }
                                      return `Expira em ${minutesLeft} minutos`;
                                    })()}
                                  </Text>
                                </View>
                              )}
                            </View>
                            
                            {/* Payment status check */}
                            {USE_MERCADO_PAGO && checkingPayment && (
                              <View style={styles.checkingPaymentBox}>
                                <ActivityIndicator size="small" color={colors.purple} />
                                <Text style={[styles.checkingPaymentText, { color: themeColors.textMuted }]}>
                                  Aguardando confirmação do pagamento...
                                </Text>
                              </View>
                            )}

                            {/* Separator */}
                            <View style={styles.pixSeparator}>
                              <View style={[styles.separatorLine, { backgroundColor: themeColors.border }]} />
                              <Text style={[styles.separatorText, { color: themeColors.textMuted }]}>ou</Text>
                              <View style={[styles.separatorLine, { backgroundColor: themeColors.border }]} />
                            </View>

                            {/* Copy Code */}
                            <View style={[styles.pixCodeBox, { backgroundColor: themeColors.bgSecondary, borderColor: themeColors.border }]}>
                              <Text style={[styles.pixCodeLabel, { color: themeColors.textMuted }]}>Código Copia e Cola:</Text>
                              {Platform.OS === "web" ? (
                                <textarea
                                  ref={textareaRef as any}
                                  readOnly
                                  value={pixCode}
                                  style={{
                                    width: "100%",
                                    minHeight: 70,
                                    padding: 10,
                                    fontSize: 12,
                                    fontFamily: "monospace",
                                    border: `1px solid ${themeColors.border}`,
                                    borderRadius: 8,
                                    backgroundColor: themeColors.bgCard,
                                    color: themeColors.text,
                                    resize: "none",
                                    wordBreak: "break-all",
                                    lineHeight: 1.4,
                                  }}
                                />
                              ) : (
                                <Text 
                                  style={[styles.pixCode, { color: themeColors.text }]} 
                                  numberOfLines={3}
                                  selectable={true}
                                >
                                  {pixCode}
                                </Text>
                              )}
                            </View>

                            <Pressable 
                              style={[styles.copyBtn, { backgroundColor: copied ? colors.green : colors.purple }]} 
                              onPress={handleCopyPix}
                            >
                              <Ionicons name={copied ? "checkmark-circle" : "copy"} size={20} color="#fff" />
                              <Text style={styles.copyBtnText}>
                                {copied ? "✓ Código Copiado!" : "Copiar Código PIX"}
                              </Text>
                            </Pressable>
                            
                            {/* Check payment button */}
                            {USE_MERCADO_PAGO && !checkingPayment && (
                              <Pressable 
                                style={[styles.checkPaymentBtn, { borderColor: colors.purple }]} 
                                onPress={handleCheckPayment}
                              >
                                <Ionicons name="refresh" size={18} color={colors.purple} />
                                <Text style={[styles.checkPaymentBtnText, { color: colors.purple }]}>
                                  Já paguei, verificar pagamento
                                </Text>
                              </Pressable>
                            )}
                            
                            {/* Generate new PIX button */}
                            {USE_MERCADO_PAGO && !generatingPix && (
                              <Pressable 
                                style={[styles.generateNewPixBtn, { borderColor: themeColors.border }]} 
                                onPress={handleForceGenerateNewPix}
                              >
                                <Ionicons name="add-circle-outline" size={18} color={themeColors.textMuted} />
                                <Text style={[styles.generateNewPixBtnText, { color: themeColors.textMuted }]}>
                                  Gerar novo código PIX
                                </Text>
                              </Pressable>
                            )}

                            <View style={styles.pixInstructions}>
                              <Text style={[styles.instructionTitle, { color: themeColors.text }]}>Como pagar:</Text>
                              <Text style={[styles.instructionStep, { color: themeColors.textMuted }]}>1. Escaneie o QR Code ou copie o código</Text>
                              <Text style={[styles.instructionStep, { color: themeColors.textMuted }]}>2. Abra o app do seu banco</Text>
                              <Text style={[styles.instructionStep, { color: themeColors.textMuted }]}>3. Escolha "Pagar com PIX"</Text>
                              <Text style={[styles.instructionStep, { color: themeColors.textMuted }]}>4. Confirme o pagamento</Text>
                            </View>
                          </>
                        ) : null}
                      </>
                    )}

                    {/* Close button - só mostra se não for pagamento confirmado (que tem seu próprio botão) */}
                    {!paymentConfirmed && (
                      <Pressable style={[styles.closeBtn, { backgroundColor: themeColors.bgSecondary }]} onPress={handleClosePixModal}>
                        <Text style={[styles.closeBtnText, { color: themeColors.textMuted }]}>Fechar</Text>
                      </Pressable>
                    )}
                  </>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Content */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={[styles.content, isDesktopMode && dkStyles.content]} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.purple]} />}
      >
        {/* Summary Cards */}
        <View style={[styles.summaryRow, isDesktopMode && dkStyles.summaryRow]}>
          <SummaryCard 
            label="Em aberto" 
            value={formatCurrency(totalPending)} 
            icon="wallet-outline" 
            color="#D97706" 
            themeColors={themeColors}
          />
          {overdueCount > 0 && (
            <SummaryCard 
              label="Atrasados" 
              value={String(overdueCount)} 
              icon="alert-circle-outline" 
              color="#DC2626" 
              themeColors={themeColors}
            />
          )}
        </View>

        {/* Pending Invoices */}
        <View style={[styles.section, isDesktopMode && dkStyles.section]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Pendências</Text>
            {pendingInvoices.length > 0 && (
              <View style={[styles.sectionBadge, { backgroundColor: "#FEF3C7" }]}>
                <Text style={[styles.sectionBadgeText, { color: "#D97706" }]}>{pendingInvoices.length}</Text>
              </View>
            )}
          </View>
          
          {pendingInvoices.length === 0 ? (
            <EmptyState 
              icon="checkmark-done-circle" 
              title="Tudo em dia!" 
              subtitle="Você não tem pagamentos pendentes"
              themeColors={themeColors}
            />
          ) : (
            <View style={styles.invoicesList}>
              {pendingInvoices.map(inv => (
                <InvoiceCard key={inv.id} invoice={inv} onPress={() => handleOpenInvoice(inv)} themeColors={themeColors} />
              ))}
            </View>
          )}
        </View>

        {/* Payment History */}
        <View style={[styles.section, isDesktopMode && dkStyles.section]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Histórico de Pagamentos</Text>
            {paidInvoices.length > 0 && (
              <View style={[styles.sectionBadge, { backgroundColor: "#D1FAE5" }]}>
                <Text style={[styles.sectionBadgeText, { color: "#059669" }]}>{paidInvoices.length}</Text>
              </View>
            )}
          </View>
          
          {paidInvoices.length === 0 ? (
            <EmptyState 
              icon="receipt-outline" 
              title="Sem histórico" 
              subtitle="Seus pagamentos aparecerão aqui"
              themeColors={themeColors}
            />
          ) : (
            <View style={[styles.paidList, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
              {paidInvoices.slice(0, 5).map(inv => (
                <Pressable 
                  key={inv.id} 
                  style={[styles.paidItem, { borderBottomColor: themeColors.border }]}
                  onPress={() => handleOpenInvoice(inv)}
                >
                  <View style={styles.paidIcon}>
                    <Ionicons name="checkmark-circle" size={20} color={colors.green} />
                  </View>
                  <View style={styles.paidInfo}>
                    <Text style={[styles.paidDesc, { color: themeColors.text }]} numberOfLines={1}>{inv.description}</Text>
                    <Text style={[styles.paidDate, { color: themeColors.textMuted }]}>
                      {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString("pt-BR") : ""}
                    </Text>
                  </View>
                  <Text style={[styles.paidAmount, { color: colors.green, minWidth: 80, textAlign: "right" }]}>{formatCurrency(inv.amount)}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Support */}
        <View style={[styles.section, isDesktopMode && dkStyles.section]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Precisa de ajuda?</Text>
          </View>
          
          <View style={[styles.supportList, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
            {supportLinks.map((link, idx) => (
              <Pressable 
                key={idx} 
                style={[styles.supportItem, idx < supportLinks.length - 1 && { borderBottomWidth: 1, borderBottomColor: themeColors.border }]}
                onPress={() => Linking.openURL(link.url)}
              >
                <Ionicons name={link.icon} size={20} color={colors.purple} />
                <Text style={[styles.supportText, { color: themeColors.text }]}>{link.text}</Text>
                <Ionicons name="chevron-forward" size={18} color={themeColors.textMuted} />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ==================== ESTILOS ====================

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollView: { flex: 1 },
  loadingContainer: { justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, fontSize: 14 },

  content: { padding: 16 },

  // Summary
  summaryRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
  summaryCard: { 
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff", 
    borderRadius: 12, 
    padding: 16,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  summaryIconBox: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  summaryValue: { fontSize: 18, fontWeight: "800" },
  summaryLabel: { fontSize: 12, marginTop: 2 },

  // Sections
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  sectionBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  sectionBadgeText: { fontSize: 12, fontWeight: "700" },

  // Invoice Card
  invoicesList: { gap: 12 },
  invoiceCard: { 
    borderRadius: 12, 
    padding: 16,
    borderWidth: 1,
  },
  invoiceHeader: { flexDirection: "row", justifyContent: "space-between" },
  invoiceInfo: { flex: 1, marginRight: 12 },
  invoiceTitle: { fontSize: 15, fontWeight: "700" },
  invoiceDue: { fontSize: 12, marginTop: 4 },
  invoiceRight: { alignItems: "flex-end" },
  invoiceAmount: { fontSize: 18, fontWeight: "800", marginBottom: 4 },
  invoiceOriginalAmount: { 
    fontSize: 14, 
    fontWeight: "500", 
    textDecorationLine: "line-through",
    marginBottom: 2,
  },
  discountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 6,
  },
  discountText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#059669",
  },
  classesBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 6,
    alignSelf: "flex-start",
  },
  classesBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.purple,
  },
  discountInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  discountInfoActive: {
    backgroundColor: "#D1FAE5",
  },
  discountInfoExpired: {
    backgroundColor: "#FEF3C7",
  },
  discountInfoText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
  },
  invoiceAction: { marginTop: 14 },
  payNowBtn: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "center", 
    gap: 8, 
    paddingVertical: 12, 
    borderRadius: 10,
  },
  payNowText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  // Empty State
  emptyState: { 
    alignItems: "center", 
    paddingVertical: 40, 
    borderRadius: 12, 
    borderWidth: 1,
  },
  emptyTitle: { fontSize: 15, fontWeight: "600", marginTop: 12 },
  emptySubtitle: { fontSize: 13, marginTop: 4 },

  // Paid List
  paidList: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  paidItem: { flexDirection: "row", alignItems: "center", padding: 14, borderBottomWidth: 1 },
  paidIcon: { marginRight: 12 },
  paidInfo: { flex: 1, marginRight: 12 },
  paidDesc: { fontSize: 14, fontWeight: "600" },
  paidDate: { fontSize: 12, marginTop: 2 },
  paidAmount: { fontSize: 15, fontWeight: "700" },

  // Support
  supportList: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  supportItem: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  supportText: { flex: 1, fontSize: 14, fontWeight: "500" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 },
  modal: { width: "100%", maxWidth: 400, maxHeight: "85%", borderRadius: 20, paddingHorizontal: 24, paddingBottom: 24, paddingTop: 12, overflow: "hidden" },
  scrollIndicator: { alignItems: "center", paddingBottom: 12 },
  scrollIndicatorBar: { width: 40, height: 4, borderRadius: 2, marginBottom: 8 },
  scrollIndicatorText: { fontSize: 11, fontWeight: "500" },
  modalScrollView: { flex: 1, width: "100%" },
  modalScrollContent: { flexGrow: 1, paddingBottom: 4, width: "100%" },
  pixModalHeader: { alignItems: "center", marginBottom: 20 },
  pixModalTitle: { fontSize: 20, fontWeight: "700", marginTop: 12 },
  invoiceSummaryBox: { alignItems: "center", padding: 16, borderRadius: 12, marginBottom: 20 },
  invoiceSummaryDesc: { fontSize: 14, fontWeight: "600", textAlign: "center" },
  invoiceSummaryAmount: { fontSize: 28, fontWeight: "800", marginTop: 8 },
  invoiceSummaryDue: { fontSize: 13, marginTop: 6 },
  pixLoading: { alignItems: "center", paddingVertical: 30 },
  pixLoadingText: { marginTop: 12, fontSize: 14 },
  pixErrorBox: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 10, marginBottom: 16 },
  pixErrorText: { flex: 1, color: "#DC2626", fontSize: 13 },
  pixCodeBox: { padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 16 },
  pixCodeLabel: { fontSize: 12, fontWeight: "600", marginBottom: 8 },
  pixCode: { fontSize: 10, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", lineHeight: 16, marginBottom: 8 },
  pixCodeHint: { fontSize: 11, fontStyle: "italic", textAlign: "center" },
  copyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 10, marginBottom: 16 },
  
  // QR Code
  qrCodeContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  qrCodeBox: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  qrCodeHint: {
    fontSize: 12,
    marginTop: 10,
    textAlign: "center",
  },
  pixSeparator: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 12,
    gap: 10,
  },
  separatorLine: {
    flex: 1,
    height: 1,
  },
  separatorText: {
    fontSize: 12,
    fontWeight: "600",
  },
  copyBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  pixInstructions: { marginBottom: 20 },
  instructionTitle: { fontSize: 14, fontWeight: "700", marginBottom: 8 },
  instructionStep: { fontSize: 13, marginBottom: 4 },
  closeBtn: { paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  closeBtnText: { fontSize: 15, fontWeight: "600" },
  
  // Payment confirmed styles
  paymentConfirmedBox: {
    alignItems: "center",
    paddingVertical: 32,
  },
  confirmedIconCircle: {
    marginBottom: 16,
  },
  confirmedTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#10B981",
    marginBottom: 8,
  },
  confirmedSubtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  confirmedCloseBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    marginTop: 24,
  },
  confirmedCloseBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  
  // Checking payment styles
  checkingPaymentBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 12,
    marginBottom: 8,
  },
  checkingPaymentText: {
    fontSize: 13,
  },
  
  // Check payment button
  checkPaymentBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
    marginTop: 8,
    marginBottom: 8,
  },
  checkPaymentBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  
  // Generate new PIX button
  generateNewPixBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  generateNewPixBtnText: {
    fontSize: 13,
    fontWeight: "500",
  },
  
  // PIX expiration info
  pixExpirationInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
  },
  pixExpirationText: {
    fontSize: 12,
    fontWeight: "500",
  },
  
  // Background confirmation modal
  backgroundConfirmModal: {
    width: "90%",
    maxWidth: 380,
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
  },
  backgroundConfirmContent: {
    alignItems: "center",
  },
  backgroundConfirmIcon: {
    marginBottom: 20,
  },
  backgroundConfirmTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#10B981",
    marginBottom: 12,
    textAlign: "center",
  },
  backgroundConfirmSubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  backgroundConfirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10B981",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: "100%",
  },
  backgroundConfirmBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});

// Desktop Styles
const dkStyles = StyleSheet.create({
  content: { padding: 24, paddingBottom: 40 },
  summaryRow: { maxWidth: 500 },
  section: { maxWidth: 600 },
  modal: { maxWidth: 450, padding: 28 },
});
