import React, { useState, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, ActivityIndicator, RefreshControl, Linking, Platform, Image, TextInput } from "react-native";
import { showAlert } from "../../utils/alert";
import { Ionicons } from "@/shims/icons";
import { useFocusEffect } from "@react-navigation/native";
import * as Clipboard from "@/shims/clipboard";
import { QRCodeSVG } from "qrcode.react";

import CdmfHeader from "../../components/CdmfHeader";
import SectionHeader from "../../components/SectionHeader";
import StudentHeader from "../../components/StudentHeader";
import { colors } from "../../theme/colors";
import { useDesktop } from "../../contexts/DesktopContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useAuth } from "../../contexts/AuthContext";
import { usePayment, Invoice, BaileVoucher, formatCurrency } from "../../contexts/PaymentContext";
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
  const {
    fetchInvoices,
    subscribeToInvoices,
    fetchStudentVouchers,
    createGuestInvoice,
    fetchGuestVouchers,
    getPaymentSettings,
  } = usePayment();

  // State
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [vouchers, setVouchers] = useState<BaileVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<BaileVoucher | null>(null);

  // Modal states
  const [showPixModal, setShowPixModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showAllPaymentsModal, setShowAllPaymentsModal] = useState(false);
  const [showAllVouchersModal, setShowAllVouchersModal] = useState(false);
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

  // Estado para modal de adicionar acompanhante
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestModalTab, setGuestModalTab] = useState<"pay" | "invite">("pay");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestPrice, setGuestPrice] = useState(5000); // R$ 50,00 padrão
  const [creatingGuestInvoice, setCreatingGuestInvoice] = useState(false);
  const [guestVouchers, setGuestVouchers] = useState<BaileVoucher[]>([]);

  // Support links
  const supportLinks = [
    { text: "Problemas no pagamento", icon: "help-circle-outline" as const, url: "https://wa.me/5500000000000?text=Olá, estou com problemas no pagamento" },
    { text: "Valor incorreto", icon: "alert-circle-outline" as const, url: "https://wa.me/5500000000000?text=Olá, o valor da mensalidade está incorreto" },
    { text: "Falar com suporte", icon: "chatbubbles-outline" as const, url: "https://wa.me/5500000000000" },
  ];

  // Carrega faturas e vouchers (fallback para quando listener falha)
  const loadData = useCallback(async () => {
    if (!profile?.uid) return;
    
    try {
      const [invoicesData, vouchersData] = await Promise.all([
        fetchInvoices({ studentId: profile.uid }),
        fetchStudentVouchers(profile.uid),
      ]);
      setInvoices(invoicesData);
      setVouchers(vouchersData);
    } catch (e) {
      console.error("Erro ao carregar faturas:", e);
    } finally {
      setLoading(false);
    }
  }, [profile?.uid, fetchInvoices, fetchStudentVouchers]);

  // Tenta usar listener em tempo real, com fallback para fetch simples
  useEffect(() => {
    if (!profile?.uid) {
      setLoading(false);
      return;
    }

    let unsubscribe: (() => void) | null = null;
    let listenerFailed = false;

    // Carrega vouchers imediatamente (não tem listener em tempo real)
    fetchStudentVouchers(profile.uid).then(vouchersData => {
      setVouchers(vouchersData);
    }).catch(e => {
      console.error("Erro ao carregar vouchers:", e);
    });

    try {
      // Tenta usar listener em tempo real para invoices
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

            // Recarrega vouchers quando um pagamento é confirmado (pode ter gerado voucher novo)
            fetchStudentVouchers(profile.uid).then(vouchersData => {
              setVouchers(vouchersData);
            }).catch(() => {});
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
  }, [profile?.uid, subscribeToInvoices, loadData, loading, selectedInvoice?.id, pendingPaymentInvoiceId, fetchStudentVouchers]);
  
  // Verificação periódica em background para pagamentos pendentes
  useEffect(() => {
    if (!profile?.uid) return;
    
    // Lista de invoices pendentes com mpPaymentId que precisam ser verificadas
    const pendingPixInvoices = invoices.filter(
      inv => (inv.status === "pending" || inv.status === "overdue") && inv.mpPaymentId
    );
    
    if (pendingPixInvoices.length === 0) return;
    
    // Verifica pagamentos pendentes a cada 30 segundos
    const intervalId = setInterval(async () => {
      for (const invoice of pendingPixInvoices) {
        try {
          const result = await checkMercadoPagoPayment(invoice.id);
          if (result.isPaid) {
            // Pagamento confirmado! O listener do Firestore vai atualizar automaticamente
            // mas recarregamos os dados para garantir sincronização
            console.log(`[BackgroundCheck] Pagamento confirmado para fatura ${invoice.id}`);
            loadData();
          }
        } catch (e) {
          console.warn(`[BackgroundCheck] Erro ao verificar fatura ${invoice.id}:`, e);
        }
      }
    }, 30000); // Verifica a cada 30 segundos
    
    return () => clearInterval(intervalId);
  }, [profile?.uid, invoices, loadData]);
  
  // Detecta quando o app volta ao foreground (visibilidade da página)
  useEffect(() => {
    if (Platform.OS !== "web") return;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Usuário voltou para a aba - verifica pagamentos pendentes
        // Verifica todas as invoices pendentes com mpPaymentId
        const pendingPixInvoices = invoices.filter(
          inv => (inv.status === "pending" || inv.status === "overdue") && inv.mpPaymentId
        );
        
        for (const invoice of pendingPixInvoices) {
          checkMercadoPagoPayment(invoice.id).then(result => {
            if (result.isPaid) {
              console.log(`[VisibilityChange] Pagamento confirmado para fatura ${invoice.id}`);
              loadData();
            }
          }).catch(() => {});
        }
        
        // Recarrega dados para garantir sincronização
        loadData();
      }
    };
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [invoices, loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Recarrega dados quando a tela recebe foco
  useFocusEffect(
    useCallback(() => {
      if (profile?.uid) {
        // Recarrega vouchers
        fetchStudentVouchers(profile.uid).then(vouchersData => {
          setVouchers(vouchersData);
        }).catch(e => {
          console.error("Erro ao recarregar vouchers:", e);
        });
      }
    }, [profile?.uid, fetchStudentVouchers])
  );

  // Carrega vouchers de acompanhante e define o preço quando um voucher é selecionado
  useEffect(() => {
    if (selectedVoucher && !selectedVoucher.isGuest) {
      fetchGuestVouchers(selectedVoucher.id).then(guests => {
        setGuestVouchers(guests);
      }).catch(e => {
        console.error("Erro ao carregar acompanhantes:", e);
        setGuestVouchers([]);
      });
      // Usa o valor do ingresso pago pelo aluno como preço do acompanhante
      const relatedInvoice = invoices.find(inv => inv.id === selectedVoucher.invoiceId);
      if (relatedInvoice?.amount) {
        setGuestPrice(relatedInvoice.amount);
      }
    } else {
      setGuestVouchers([]);
    }
  }, [selectedVoucher, fetchGuestVouchers, invoices]);

  // Função para criar invoice de acompanhante
  const handleCreateGuestInvoice = async () => {
    if (!selectedVoucher || !guestName.trim()) {
      showAlert("Atenção", "Informe o nome do acompanhante");
      return;
    }

    setCreatingGuestInvoice(true);
    try {
      const invoice = await createGuestInvoice(selectedVoucher, guestName.trim(), guestPrice);

      setShowGuestModal(false);
      setGuestName("");

      // Abre o modal de pagamento para a invoice criada
      handleOpenInvoice(invoice);

      // Recarrega vouchers
      if (profile?.uid) {
        const vouchersData = await fetchStudentVouchers(profile.uid);
        setVouchers(vouchersData);
      }
    } catch (e: any) {
      showAlert("Erro", e.message || "Não foi possível criar a cobrança");
    } finally {
      setCreatingGuestInvoice(false);
    }
  };

  // Função helper para determinar o status do voucher (incluindo expiração)
  const getVoucherStatus = (voucher: BaileVoucher): "valid" | "used" | "cancelled" | "expired" => {
    // Se já foi usado ou cancelado, mantém o status
    if (voucher.status === "used" || voucher.status === "cancelled") {
      return voucher.status;
    }

    // Data atual (início do dia para comparação)
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    // Função auxiliar para verificar se uma data já passou
    const isDateExpired = (dateStr: string): boolean => {
      try {
        const dateOnly = dateStr.split('T')[0];
        const [year, month, day] = dateOnly.split('-').map(Number);
        // Cria data do fim do dia do evento (local)
        const eventEndOfDay = new Date(year, month - 1, day, 23, 59, 59);
        return now > eventEndOfDay;
      } catch (e) {
        return false;
      }
    };

    // 1. Verifica se o voucher tem eventDate definido
    if (voucher.eventDate && typeof voucher.eventDate === 'string' && voucher.eventDate.length >= 10) {
      if (isDateExpired(voucher.eventDate)) {
        return "expired";
      }
    }

    // 2. Fallback: tenta usar dueDate da invoice relacionada
    const relatedInvoice = invoices.find(inv => inv.id === voucher.invoiceId);
    if (relatedInvoice?.dueDate && typeof relatedInvoice.dueDate === 'string') {
      if (isDateExpired(relatedInvoice.dueDate)) {
        return "expired";
      }
    }

    // 3. Último fallback: se voucher foi criado há mais de 7 dias e não tem data de evento, considera expirado
    // (vouchers de eventos geralmente são usados em poucos dias)
    if (!voucher.eventDate && !relatedInvoice?.dueDate) {
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      if (voucher.createdAt && (Date.now() - voucher.createdAt) > sevenDaysMs) {
        return "expired";
      }
    }

    return "valid";
  };

  // Atualiza os vouchers com status de expiração
  const vouchersWithStatus = React.useMemo(() =>
    vouchers.map(voucher => ({
      ...voucher,
      displayStatus: getVoucherStatus(voucher),
    })),
    [vouchers, invoices] // Incluindo invoices pois getVoucherStatus pode usar a invoice relacionada
  );

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
    // Se havia uma fatura com PIX pendente e não foi confirmada, mantém tracking para verificação em background
    if (selectedInvoice && !paymentConfirmed && pixCode && selectedInvoice.mpPaymentId) {
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
      // Copia para a area de transferencia no navegador
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

      {/* Modal PIX — layout compacto sem rolagem */}
      <Modal visible={showPixModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.pixCompactModal, isDesktopMode && dkStyles.modal, { backgroundColor: themeColors.bgCard }]}
            onStartShouldSetResponder={() => true}
          >
            {selectedInvoice && (
              <>
                {/* Header compacto */}
                <View style={[styles.pixCompactHeader, { borderBottomColor: themeColors.border }]}>
                  <View style={[styles.pixCompactIconBox, {
                    backgroundColor: selectedInvoice.status === "paid" ? "#D1FAE5" : "#EDE9FE"
                  }]}>
                    <Ionicons
                      name={selectedInvoice.status === "paid" ? "checkmark-circle" : "qr-code"}
                      size={20}
                      color={selectedInvoice.status === "paid" ? colors.green : colors.purple}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pixCompactTitle, { color: themeColors.text }]}>
                      {selectedInvoice.status === "paid" ? "Pagamento Confirmado" : "Pagar com PIX"}
                    </Text>
                    <Text style={[styles.pixCompactDesc, { color: themeColors.textMuted }]} numberOfLines={1}>
                      {selectedInvoice.description}
                    </Text>
                  </View>
                  <Text style={[styles.pixCompactAmount, { color: colors.purple }]}>
                    {formatCurrency(selectedInvoice.amount)}
                  </Text>
                </View>

                {/* Corpo principal */}
                {(selectedInvoice.status === "pending" || selectedInvoice.status === "overdue") && (
                  <>
                    {paymentConfirmed ? (
                      <View style={styles.pixCompactConfirmed}>
                        <Ionicons name="checkmark-circle" size={56} color={colors.green} />
                        <Text style={styles.confirmedTitle}>Pagamento Confirmado!</Text>
                        <Text style={[styles.confirmedSubtitle, { color: themeColors.textMuted }]}>
                          Seu pagamento foi processado com sucesso.
                        </Text>
                      </View>
                    ) : generatingPix ? (
                      <View style={styles.pixCompactLoading}>
                        <ActivityIndicator size="large" color={colors.purple} />
                        <Text style={[styles.pixLoadingText, { color: themeColors.textMuted }]}>Gerando código PIX...</Text>
                      </View>
                    ) : pixError ? (
                      <View style={[styles.pixErrorBox, { backgroundColor: "#FEE2E2", margin: 16 }]}>
                        <Ionicons name="warning" size={24} color="#DC2626" />
                        <Text style={styles.pixErrorText}>{pixError}</Text>
                      </View>
                    ) : pixCode ? (
                      <>
                        {/* QR Code compacto */}
                        <View style={styles.pixCompactQr}>
                          <View style={styles.qrCodeBox}>
                            {pixQrCodeBase64 ? (
                              <Image
                                source={{ uri: `data:image/png;base64,${pixQrCodeBase64}` }}
                                style={{ width: 150, height: 150 }}
                              />
                            ) : (
                              <QRCodeSVG value={pixCode} size={150} bgColor="#FFFFFF" fgColor="#000000" />
                            )}
                          </View>
                          <Text style={[styles.qrCodeHint, { color: themeColors.textMuted, marginTop: 6 }]}>
                            Escaneie com o app do banco
                          </Text>
                          {selectedInvoice.pixExpiresAt && (
                            <View style={[styles.pixExpirationInfo, { marginTop: 4 }]}>
                              <Ionicons name="time-outline" size={12} color={themeColors.textMuted} />
                              <Text style={[styles.pixExpirationText, { color: themeColors.textMuted, fontSize: 11 }]}>
                                {(() => {
                                  const minutesLeft = Math.max(0, Math.round((selectedInvoice.pixExpiresAt! - Date.now()) / 60000));
                                  return minutesLeft > 60
                                    ? `Expira em ${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}min`
                                    : `Expira em ${minutesLeft} min`;
                                })()}
                              </Text>
                            </View>
                          )}
                        </View>

                        {/* Separador */}
                        <View style={styles.pixSeparator}>
                          <View style={[styles.separatorLine, { backgroundColor: themeColors.border }]} />
                          <Text style={[styles.separatorText, { color: themeColors.textMuted }]}>ou copie o código</Text>
                          <View style={[styles.separatorLine, { backgroundColor: themeColors.border }]} />
                        </View>

                        {/* Código PIX compacto */}
                        <View style={[styles.pixCompactCodeRow, { backgroundColor: themeColors.bgSecondary, borderColor: themeColors.border }]}>
                          {Platform.OS === "web" ? (
                            <textarea
                              ref={textareaRef as any}
                              readOnly
                              value={pixCode}
                              style={{
                                flex: 1,
                                minHeight: 40,
                                maxHeight: 56,
                                padding: 8,
                                fontSize: 11,
                                fontFamily: "monospace",
                                border: "none",
                                backgroundColor: "transparent",
                                color: themeColors.text,
                                resize: "none",
                                wordBreak: "break-all",
                                lineHeight: 1.4,
                                outline: "none",
                              }}
                            />
                          ) : (
                            <Text style={[styles.pixCode, { color: themeColors.text, flex: 1, fontSize: 11 }]} numberOfLines={2} selectable>
                              {pixCode}
                            </Text>
                          )}
                        </View>

                        {/* Botão copiar */}
                        <Pressable
                          style={[styles.copyBtn, { backgroundColor: copied ? colors.green : colors.purple, marginHorizontal: 16, marginTop: 8 }]}
                          onPress={handleCopyPix}
                        >
                          <Ionicons name={copied ? "checkmark-circle" : "copy"} size={18} color="#fff" />
                          <Text style={styles.copyBtnText}>{copied ? "Copiado!" : "Copiar Código PIX"}</Text>
                        </Pressable>

                        {/* Verificar pagamento + Gerar novo */}
                        {USE_MERCADO_PAGO && (
                          <View style={styles.pixCompactActions}>
                            <Pressable
                              style={[styles.checkPaymentBtn, { borderColor: colors.purple, flex: 1, opacity: checkingPayment ? 0.6 : 1 }]}
                              onPress={handleCheckPayment}
                              disabled={checkingPayment || generatingPix}
                            >
                              {checkingPayment
                                ? <ActivityIndicator size="small" color={colors.purple} />
                                : <Ionicons name="refresh" size={16} color={colors.purple} />
                              }
                              <Text style={[styles.checkPaymentBtnText, { color: colors.purple, fontSize: 12 }]}>
                                {checkingPayment ? "Verificando..." : "Já paguei"}
                              </Text>
                            </Pressable>
                            <Pressable
                              style={[styles.generateNewPixBtn, { borderColor: themeColors.border, flex: 1, margin: 0, opacity: generatingPix ? 0.6 : 1 }]}
                              onPress={handleForceGenerateNewPix}
                              disabled={generatingPix || checkingPayment}
                            >
                              {generatingPix
                                ? <ActivityIndicator size="small" color={themeColors.textMuted} />
                                : <Ionicons name="refresh-circle-outline" size={16} color={themeColors.textMuted} />
                              }
                              <Text style={[styles.generateNewPixBtnText, { color: themeColors.textMuted, fontSize: 12 }]}>
                                {generatingPix ? "Gerando..." : "Novo PIX"}
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </>
                    ) : null}
                  </>
                )}

                {/* Vencimento (para faturas pendentes não confirmadas) */}
                {selectedInvoice.status !== "paid" && !paymentConfirmed && (
                  <View style={[styles.pixCompactDue, { borderTopColor: themeColors.border }]}>
                    {(() => {
                      const today = new Date(); today.setHours(0,0,0,0);
                      const earlyDeadline = selectedInvoice.dueDate ? new Date(selectedInvoice.dueDate + "T23:59:59") : new Date();
                      const isInDiscountPeriod = today <= earlyDeadline;
                      const dueDate = formatDateSafe(selectedInvoice.dueDate);
                      const lateDueDate = selectedInvoice.lateDueDate ? formatDateSafe(selectedInvoice.lateDueDate) : null;
                      return (
                        <Text style={{ fontSize: 11, color: isInDiscountPeriod ? colors.green : themeColors.textMuted }}>
                          {isInDiscountPeriod ? `Desconto até ${dueDate}` : lateDueDate ? `Vence ${lateDueDate}` : `Vence ${dueDate}`}
                        </Text>
                      );
                    })()}
                  </View>
                )}

                {/* Footer fechar */}
                <View style={[styles.pixCompactFooter, { borderTopColor: themeColors.border }]}>
                  {paymentConfirmed ? (
                    <Pressable style={[styles.pixCompactCloseBtn, { backgroundColor: colors.green }]} onPress={handleClosePixModal}>
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <Text style={[styles.pixCompactCloseBtnText, { color: "#fff" }]}>Fechar</Text>
                    </Pressable>
                  ) : (
                    <Pressable style={[styles.pixCompactCloseBtn, { backgroundColor: themeColors.bgSecondary }]} onPress={handleClosePixModal}>
                      <Text style={[styles.pixCompactCloseBtnText, { color: themeColors.textMuted }]}>Fechar</Text>
                    </Pressable>
                  )}
                </View>
              </>
            )}
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
            <>
              <View style={[styles.paidList, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
                {paidInvoices.slice(0, 1).map(inv => (
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

            {/* Botão Ver Mais */}
            {paidInvoices.length > 1 && (
              <Pressable
                style={[styles.viewMoreButton, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}
                onPress={() => setShowAllPaymentsModal(true)}
              >
                <Text style={[styles.viewMoreText, { color: colors.purple }]}>Ver mais</Text>
                <Ionicons name="chevron-down" size={18} color={colors.purple} />
              </Pressable>
            )}
            </>
          )}
        </View>

        {/* Vouchers de Baile */}
        {vouchers.length > 0 && (
          <View style={[styles.section, isDesktopMode && dkStyles.section]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>🎫 Meus Vouchers</Text>
              <View style={[styles.sectionBadge, { backgroundColor: "#EDE9FE" }]}>
                <Text style={[styles.sectionBadgeText, { color: colors.purple }]}>{vouchersWithStatus.filter(v => v.displayStatus === "valid").length}</Text>
              </View>
            </View>

            <View style={styles.invoicesList}>
              {vouchersWithStatus.slice(0, 2).map(voucher => {
                const status = voucher.displayStatus;
                const isValid = status === "valid";
                const isExpired = status === "expired";
                const isUsed = status === "used";

                const statusConfig = isValid
                  ? { bg: "#D1FAE5", color: "#059669", label: "Válido", icon: "checkmark-circle" as const }
                  : isExpired
                  ? { bg: "#FEE2E2", color: "#DC2626", label: "Expirado", icon: "time-outline" as const }
                  : isUsed
                  ? { bg: "#F1F5F9", color: "#64748B", label: "Usado", icon: "checkmark-circle" as const }
                  : { bg: "#FEE2E2", color: "#DC2626", label: "Cancelado", icon: "close-circle" as const };

                return (
                <Pressable
                  key={voucher.id}
                  style={[
                    styles.voucherCard,
                    {
                      backgroundColor: themeColors.bgCard,
                      borderColor: isValid ? colors.purple : themeColors.border,
                      borderWidth: isValid ? 2 : 1,
                    }
                  ]}
                  onPress={() => {
                    setSelectedVoucher(voucher);
                    setShowVoucherModal(true);
                  }}
                >
                  <View style={styles.voucherLeft}>
                    <View style={[
                      styles.voucherIconBox,
                      { backgroundColor: isValid ? "#EDE9FE" : "#F1F5F9" }
                    ]}>
                      <Ionicons
                        name={isValid ? "ticket" : statusConfig.icon}
                        size={24}
                        color={isValid ? colors.purple : statusConfig.color}
                      />
                    </View>
                    <View style={styles.voucherInfo}>
                      <Text style={[styles.voucherTitle, { color: themeColors.text }]}>{voucher.eventName}</Text>
                      <Text style={[styles.voucherCode, { color: colors.purple }]}>{voucher.voucherCode}</Text>
                      <Text style={[styles.voucherDate, { color: themeColors.textMuted }]}>
                        {new Date(voucher.createdAt).toLocaleDateString("pt-BR")}
                      </Text>
                    </View>
                  </View>
                  <View style={[
                    styles.voucherStatusBadge,
                    { backgroundColor: statusConfig.bg }
                  ]}>
                    <Text style={[
                      styles.voucherStatusText,
                      { color: statusConfig.color }
                    ]}>
                      {statusConfig.label}
                    </Text>
                  </View>
                </Pressable>
                );
              })}
            </View>

            {/* Botão Ver Mais para Vouchers */}
            {vouchers.length > 2 && (
              <Pressable
                style={[styles.viewMoreButton, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border, marginTop: 12 }]}
                onPress={() => setShowAllVouchersModal(true)}
              >
                <Text style={[styles.viewMoreText, { color: colors.purple }]}>Ver mais</Text>
                <Ionicons name="chevron-down" size={18} color={colors.purple} />
              </Pressable>
            )}
          </View>
        )}

        {/* Modal do Voucher */}
        <Modal visible={showVoucherModal} transparent animationType="fade">
          <Pressable style={styles.modalOverlay} onPress={() => setShowVoucherModal(false)}>
            <Pressable style={[styles.voucherModal, { backgroundColor: themeColors.bgCard }]} onPress={e => e.stopPropagation()}>
              {selectedVoucher && (() => {
                const voucherStatus = getVoucherStatus(selectedVoucher);
                const isValid = voucherStatus === "valid";
                const isExpired = voucherStatus === "expired";
                const isUsed = voucherStatus === "used";

                const statusConfig = isValid
                  ? { bg: "#D1FAE5", color: "#059669", label: "Presença Confirmada", icon: "checkmark-circle" as const }
                  : isExpired
                  ? { bg: "#FEE2E2", color: "#DC2626", label: "Voucher Expirado", icon: "time-outline" as const }
                  : isUsed
                  ? { bg: "#F1F5F9", color: "#64748B", label: "Já Utilizado", icon: "checkmark-circle" as const }
                  : { bg: "#FEE2E2", color: "#DC2626", label: "Cancelado", icon: "close-circle" as const };

                return (
                <>
                  {/* Conteúdo rolável */}
                  <ScrollView
                    style={styles.voucherModalScroll}
                    contentContainerStyle={styles.voucherModalScrollContent}
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                  >
                    {/* Header compacto: ícone + título + badge em linha */}
                    <View style={styles.voucherModalHeaderRow}>
                      <View style={[styles.voucherModalIconBoxSm, { backgroundColor: isValid ? "#EDE9FE" : "#F1F5F9" }]}>
                        <Ionicons
                          name={isValid ? "ticket" : statusConfig.icon}
                          size={26}
                          color={isValid ? colors.purple : statusConfig.color}
                        />
                      </View>
                      <View style={styles.voucherModalHeaderInfo}>
                        <Text style={[styles.voucherModalTitleSm, { color: themeColors.text }]} numberOfLines={2}>
                          {selectedVoucher.eventName}
                        </Text>
                        <View style={[styles.voucherStatusBadgeSm, { backgroundColor: statusConfig.bg }]}>
                          <Ionicons name={statusConfig.icon} size={11} color={statusConfig.color} />
                          <Text style={[styles.voucherStatusBadgeSmText, { color: statusConfig.color }]}>
                            {statusConfig.label}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Separador */}
                    <View style={[styles.voucherDivider, { backgroundColor: themeColors.border }]} />

                    {/* Código + QR lado a lado quando válido */}
                    {isValid ? (
                      <View style={styles.voucherMainRow}>
                        <View style={[styles.voucherCodeBoxCompact, { backgroundColor: themeColors.bgSecondary }]}>
                          <Text style={[styles.voucherCodeLabel, { color: themeColors.textMuted }]}>Código</Text>
                          <Text style={[styles.voucherCodeLarge, { color: colors.purple, fontSize: 20, letterSpacing: 1 }]}>
                            {selectedVoucher.voucherCode}
                          </Text>
                          <Text style={[styles.voucherCodeHint, { color: themeColors.textMuted }]}>
                            Apresente na entrada
                          </Text>
                        </View>
                        <View style={styles.qrCodeContainerVoucher}>
                          <QRCodeSVG
                            value={selectedVoucher.voucherCode}
                            size={108}
                            bgColor="#FFFFFF"
                            fgColor="#000000"
                          />
                        </View>
                      </View>
                    ) : (
                      <View style={[styles.voucherCodeBox, { backgroundColor: themeColors.bgSecondary }]}>
                        <Text style={[styles.voucherCodeLabel, { color: themeColors.textMuted }]}>Código do Voucher</Text>
                        <Text style={[styles.voucherCodeLarge, { color: colors.purple }]}>{selectedVoucher.voucherCode}</Text>
                        <Text style={[styles.voucherCodeHint, { color: themeColors.textMuted }]}>
                          {isExpired ? "Este voucher não pode mais ser utilizado" : "Este voucher foi usado ou cancelado"}
                        </Text>
                      </View>
                    )}

                    {/* Seção de acompanhante */}
                    {isValid && !selectedVoucher.isGuest && (
                      <View style={styles.companionSection}>
                        <View style={styles.companionSectionHeader}>
                          <Ionicons name="people" size={14} color={colors.purple} />
                          <Text style={[styles.companionSectionTitle, { color: themeColors.text }]}>Leve alguém junto! 🎶</Text>
                        </View>
                        <View style={styles.companionSectionBtns}>
                          <Pressable
                            style={styles.companionBtnPay}
                            onPress={() => {
                              setShowVoucherModal(false);
                              setGuestName("");
                              setGuestPhone("");
                              setGuestModalTab("pay");
                              setShowGuestModal(true);
                            }}
                          >
                            <Ionicons name="person-add" size={13} color="#fff" />
                            <Text style={styles.companionBtnText}>Eu pago</Text>
                          </Pressable>
                          <Pressable
                            style={styles.companionBtnWa}
                            onPress={() => {
                              setShowVoucherModal(false);
                              setGuestPhone("");
                              setGuestModalTab("invite");
                              setShowGuestModal(true);
                            }}
                          >
                            <Ionicons name="logo-whatsapp" size={13} color="#fff" />
                            <Text style={styles.companionBtnText}>Convidar pelo WhatsApp</Text>
                          </Pressable>
                        </View>
                        {guestVouchers.length > 0 && (
                          <View style={styles.guestVouchersList}>
                            <Text style={[styles.guestVouchersTitle, { color: themeColors.text }]}>
                              Acompanhantes ({guestVouchers.length})
                            </Text>
                            {guestVouchers.map(gv => (
                              <View key={gv.id} style={[styles.guestVoucherItem, { backgroundColor: themeColors.bgSecondary }]}>
                                <View style={styles.guestVoucherInfo}>
                                  <Ionicons name="person" size={14} color={colors.purple} />
                                  <Text style={[styles.guestVoucherName, { color: themeColors.text }]}>{gv.guestName}</Text>
                                </View>
                                <Text style={[styles.guestVoucherCode, { color: colors.purple }]}>{gv.voucherCode}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    )}
                  </ScrollView>

                  {/* Botão fixo fora do scroll */}
                  <Pressable
                    style={[styles.voucherCloseBtn, { backgroundColor: colors.purple }]}
                    onPress={() => setShowVoucherModal(false)}
                  >
                    <Text style={styles.voucherCloseBtnText}>Fechar</Text>
                  </Pressable>
                </>
                );
              })()}
            </Pressable>
          </Pressable>
        </Modal>

        {/* Modal de Histórico Completo de Pagamentos */}
        <Modal visible={showAllPaymentsModal} transparent animationType="fade">
          <Pressable style={styles.modalOverlay} onPress={() => setShowAllPaymentsModal(false)}>
            <Pressable
              style={[styles.fullListModal, { backgroundColor: themeColors.bgCard }]}
              onPress={e => e.stopPropagation()}
            >
              <View style={styles.fullListHeader}>
                <Text style={[styles.fullListTitle, { color: themeColors.text }]}>Histórico Completo</Text>
                <Pressable onPress={() => setShowAllPaymentsModal(false)}>
                  <Ionicons name="close-circle" size={28} color={themeColors.textMuted} />
                </Pressable>
              </View>

              <ScrollView style={styles.fullListScroll} showsVerticalScrollIndicator={false}>
                {paidInvoices.map(inv => (
                  <Pressable
                    key={inv.id}
                    style={[styles.paidItem, { borderBottomColor: themeColors.border }]}
                    onPress={() => {
                      setShowAllPaymentsModal(false);
                      handleOpenInvoice(inv);
                    }}
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
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Modal de Todos os Vouchers */}
        <Modal visible={showAllVouchersModal} transparent animationType="fade">
          <Pressable style={styles.modalOverlay} onPress={() => setShowAllVouchersModal(false)}>
            <Pressable
              style={[styles.fullListModal, { backgroundColor: themeColors.bgCard }]}
              onPress={e => e.stopPropagation()}
            >
              <View style={styles.fullListHeader}>
                <Text style={[styles.fullListTitle, { color: themeColors.text }]}>🎫 Todos os Vouchers</Text>
                <Pressable onPress={() => setShowAllVouchersModal(false)}>
                  <Ionicons name="close-circle" size={28} color={themeColors.textMuted} />
                </Pressable>
              </View>

              <ScrollView style={styles.fullListScroll} showsVerticalScrollIndicator={false}>
                {vouchersWithStatus.map(voucher => {
                  const status = voucher.displayStatus;
                  const isValid = status === "valid";
                  const isExpired = status === "expired";
                  const isUsed = status === "used";

                  const statusConfig = isValid
                    ? { bg: "#D1FAE5", color: "#059669", label: "Válido", icon: "checkmark-circle" as const }
                    : isExpired
                    ? { bg: "#FEE2E2", color: "#DC2626", label: "Expirado", icon: "time-outline" as const }
                    : isUsed
                    ? { bg: "#F1F5F9", color: "#64748B", label: "Usado", icon: "checkmark-circle" as const }
                    : { bg: "#FEE2E2", color: "#DC2626", label: "Cancelado", icon: "close-circle" as const };

                  return (
                    <Pressable
                      key={voucher.id}
                      style={[
                        styles.voucherCard,
                        {
                          backgroundColor: themeColors.bgCard,
                          borderColor: isValid ? colors.purple : themeColors.border,
                          borderWidth: isValid ? 2 : 1,
                          marginBottom: 12,
                        }
                      ]}
                      onPress={() => {
                        setShowAllVouchersModal(false);
                        setSelectedVoucher(voucher);
                        setShowVoucherModal(true);
                      }}
                    >
                      <View style={styles.voucherLeft}>
                        <View style={[
                          styles.voucherIconBox,
                          { backgroundColor: isValid ? "#EDE9FE" : "#F1F5F9" }
                        ]}>
                          <Ionicons
                            name={isValid ? "ticket" : statusConfig.icon}
                            size={24}
                            color={isValid ? colors.purple : statusConfig.color}
                          />
                        </View>
                        <View style={styles.voucherInfo}>
                          <Text style={[styles.voucherTitle, { color: themeColors.text }]}>{voucher.eventName}</Text>
                          <Text style={[styles.voucherCode, { color: colors.purple }]}>{voucher.voucherCode}</Text>
                          <Text style={[styles.voucherDate, { color: themeColors.textMuted }]}>
                            {new Date(voucher.createdAt).toLocaleDateString("pt-BR")}
                          </Text>
                        </View>
                      </View>
                      <View style={[
                        styles.voucherStatusBadge,
                        { backgroundColor: statusConfig.bg }
                      ]}>
                        <Text style={[
                          styles.voucherStatusText,
                          { color: statusConfig.color }
                        ]}>
                          {statusConfig.label}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Modal de Adicionar Acompanhante / Convidar */}
        <Modal visible={showGuestModal} transparent animationType="fade">
          <Pressable style={styles.modalOverlay} onPress={() => !creatingGuestInvoice && setShowGuestModal(false)}>
            <Pressable style={[styles.guestModal, { backgroundColor: themeColors.bgCard }]} onPress={e => e.stopPropagation()}>
              {/* Header */}
              <View style={styles.guestModalHeader}>
                <View style={[styles.guestModalIconBox, { backgroundColor: "#EDE9FE" }]}>
                  <Ionicons name="people" size={40} color={colors.purple} />
                </View>
                <Text style={[styles.guestModalTitle, { color: themeColors.text }]}>Leve Alguém Junto</Text>
                {selectedVoucher && (
                  <Text style={[styles.guestModalSubtitle, { color: themeColors.textMuted }]}>
                    {selectedVoucher.eventName}
                  </Text>
                )}
              </View>

              {/* Tabs */}
              <View style={styles.guestTabs}>
                <Pressable
                  style={[styles.guestTab, guestModalTab === "pay" && styles.guestTabActive]}
                  onPress={() => setGuestModalTab("pay")}
                >
                  <Ionicons name="card" size={15} color={guestModalTab === "pay" ? colors.purple : themeColors.textMuted} />
                  <Text style={[styles.guestTabText, { color: themeColors.textMuted }, guestModalTab === "pay" && styles.guestTabTextActive]}>
                    Eu pago
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.guestTab, guestModalTab === "invite" && { backgroundColor: "#F0FDF4" }]}
                  onPress={() => setGuestModalTab("invite")}
                >
                  <Ionicons name="logo-whatsapp" size={15} color={guestModalTab === "invite" ? "#25D366" : themeColors.textMuted} />
                  <Text style={[styles.guestTabText, { color: themeColors.textMuted }, guestModalTab === "invite" && { color: "#25D366", fontWeight: "700" }]}>
                    Convidar
                  </Text>
                </Pressable>
              </View>

              {guestModalTab === "pay" ? (
                <>
                  <View style={[styles.guestInfoBox, { backgroundColor: themeColors.bgSecondary }]}>
                    <Ionicons name="information-circle" size={16} color={colors.purple} />
                    <Text style={[styles.guestInfoText, { color: themeColors.textMuted }]}>
                      Você paga o ingresso via PIX. O acompanhante recebe um voucher próprio para entrar.
                    </Text>
                  </View>
                  <View style={styles.guestFormSection}>
                    <Text style={[styles.guestInputLabel, { color: themeColors.text }]}>Nome do Acompanhante</Text>
                    <TextInput
                      style={[styles.guestInput, { backgroundColor: themeColors.bgSecondary, color: themeColors.text, borderColor: themeColors.border }]}
                      placeholder="Digite o nome completo..."
                      placeholderTextColor={themeColors.textMuted}
                      value={guestName}
                      onChangeText={setGuestName}
                      editable={!creatingGuestInvoice}
                    />
                  </View>
                  <View style={[styles.guestPriceBox, { backgroundColor: "#EDE9FE" }]}>
                    <Text style={[styles.guestPriceLabel, { color: themeColors.textMuted }]}>Valor do Ingresso</Text>
                    <Text style={[styles.guestPriceValue, { color: colors.purple }]}>{formatCurrency(guestPrice)}</Text>
                  </View>
                  <View style={styles.guestModalButtons}>
                    <Pressable
                      style={[styles.guestCancelBtn, { backgroundColor: themeColors.bgSecondary }]}
                      onPress={() => setShowGuestModal(false)}
                      disabled={creatingGuestInvoice}
                    >
                      <Text style={[styles.guestCancelBtnText, { color: themeColors.textMuted }]}>Cancelar</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.guestConfirmBtn, { backgroundColor: colors.purple, opacity: creatingGuestInvoice ? 0.7 : 1 }]}
                      onPress={handleCreateGuestInvoice}
                      disabled={creatingGuestInvoice}
                    >
                      {creatingGuestInvoice ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={20} color="#fff" />
                          <Text style={styles.guestConfirmBtnText}>Gerar Cobrança PIX</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <View style={[styles.guestInfoBox, { backgroundColor: "#F0FDF4" }]}>
                    <Ionicons name="information-circle" size={16} color="#25D366" />
                    <Text style={[styles.guestInfoText, { color: "#065F46" }]}>
                      Envie um convite. A pessoa cria conta no app, confirma presença e paga o próprio ingresso.
                    </Text>
                  </View>
                  <View style={styles.guestFormSection}>
                    <Text style={[styles.guestInputLabel, { color: themeColors.text }]}>WhatsApp do convidado (opcional)</Text>
                    <TextInput
                      style={[styles.guestInput, { backgroundColor: themeColors.bgSecondary, color: themeColors.text, borderColor: themeColors.border }]}
                      placeholder="(11) 99999-9999"
                      placeholderTextColor={themeColors.textMuted}
                      value={guestPhone}
                      onChangeText={setGuestPhone}
                      keyboardType="phone-pad"
                    />
                  </View>
                  <View style={[styles.guestPriceBox, { backgroundColor: "#F0FDF4" }]}>
                    <Ionicons name="chatbubble-ellipses" size={20} color="#25D366" />
                    <Text style={[styles.guestPriceLabel, { color: "#065F46", textAlign: "center" }]}>
                      Mensagem com link do app e informações do evento será enviada.
                    </Text>
                  </View>
                  <View style={styles.guestModalButtons}>
                    <Pressable
                      style={[styles.guestCancelBtn, { backgroundColor: themeColors.bgSecondary }]}
                      onPress={() => setShowGuestModal(false)}
                    >
                      <Text style={[styles.guestCancelBtnText, { color: themeColors.textMuted }]}>Cancelar</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.guestConfirmBtn, { backgroundColor: "#25D366" }]}
                      onPress={() => {
                        setShowGuestModal(false);
                        const eventName = selectedVoucher?.eventName || "evento";
                        const appUrl = "https://cdmf.vercel.app";
                        const msg = `Olá! 🎉 Fui convidado(a) para o *${eventName}*.\n\nCrie sua conta no app CDMF, confirme presença e garanta seu voucher:\n👉 ${appUrl}`;
                        const encoded = encodeURIComponent(msg);
                        const url = guestPhone
                          ? `https://wa.me/55${guestPhone.replace(/\D/g, "")}?text=${encoded}`
                          : `https://wa.me/?text=${encoded}`;
                        Linking.openURL(url);
                      }}
                    >
                      <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                      <Text style={styles.guestConfirmBtnText}>Enviar Convite</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </Pressable>
          </Pressable>
        </Modal>

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
  invoiceAction: { marginTop: 14, alignItems: "center" },
  payNowBtn: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "center", 
    gap: 8, 
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignSelf: "center",
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

  // PIX modal compacto (sem rolagem)
  pixCompactModal: { width: "100%", maxWidth: 400, borderRadius: 20, overflow: "hidden" },
  pixCompactHeader: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderBottomWidth: 1 },
  pixCompactIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  pixCompactTitle: { fontSize: 14, fontWeight: "700" },
  pixCompactDesc: { fontSize: 11, marginTop: 1 },
  pixCompactAmount: { fontSize: 16, fontWeight: "800" },
  pixCompactQr: { alignItems: "center", paddingVertical: 14 },
  pixCompactLoading: { alignItems: "center", paddingVertical: 32, gap: 12 },
  pixCompactConfirmed: { alignItems: "center", paddingVertical: 24, gap: 10 },
  pixCompactCodeRow: { marginHorizontal: 16, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  pixCompactActions: { flexDirection: "row", gap: 8, marginHorizontal: 16, marginTop: 8 },
  pixCompactDue: { paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, alignItems: "center" },
  pixCompactFooter: { padding: 12, borderTopWidth: 1 },
  pixCompactCloseBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 10 },
  pixCompactCloseBtnText: { fontSize: 14, fontWeight: "600" },
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
  pixCode: { fontSize: 10, fontFamily: "monospace", lineHeight: 16, marginBottom: 8 },
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
  
  // Voucher Card styles
  voucherCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 12,
  },
  voucherLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  voucherIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  voucherInfo: {
    flex: 1,
  },
  voucherTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  voucherCode: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  voucherDate: {
    fontSize: 12,
  },
  voucherStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  voucherStatusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  
  // Voucher Modal styles
  voucherModal: {
    width: "90%",
    maxWidth: 400,
    maxHeight: "88%",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    gap: 12,
  },
  voucherModalScroll: {
    width: "100%",
  },
  voucherModalScrollContent: {
    gap: 10,
  },
  voucherModalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  voucherModalIconBoxSm: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  voucherModalHeaderInfo: {
    flex: 1,
    gap: 5,
  },
  voucherModalTitleSm: {
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },
  voucherStatusBadgeSm: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  voucherStatusBadgeSmText: {
    fontSize: 11,
    fontWeight: "700",
  },
  voucherDivider: {
    height: 1,
    width: "100%",
  },
  voucherMainRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  voucherCodeBoxCompact: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  voucherModalHeader: {
    alignItems: "center",
  },
  voucherModalIconBox: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  voucherModalTitle: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  voucherStatusBadgeLarge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
  },
  voucherStatusTextLarge: {
    fontSize: 13,
    fontWeight: "700",
  },
  voucherCodeBox: {
    width: "100%",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    gap: 6,
  },
  voucherCodeLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  voucherCodeLarge: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 2,
  },
  voucherCodeHint: {
    fontSize: 11,
    textAlign: "center",
  },
  qrCodeContainerVoucher: {
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 12,
  },
  voucherCloseBtn: {
    width: "100%",
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
  },
  voucherCloseBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },

  // Ver Mais Button
  viewMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    gap: 6,
  },
  viewMoreText: {
    fontSize: 14,
    fontWeight: "600",
  },

  // Full List Modal
  fullListModal: {
    width: "90%",
    maxWidth: 500,
    maxHeight: "80%",
    borderRadius: 20,
    padding: 20,
  },
  fullListHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  fullListTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  fullListScroll: {
    maxHeight: 500,
  },

  // Estilos do botão de adicionar acompanhante
  addGuestBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 16,
  },
  addGuestBtnText: {
    fontSize: 15,
    fontWeight: "700",
  },

  // Lista de vouchers de acompanhantes
  guestVouchersList: {
    width: "100%",
    gap: 6,
  },
  guestVouchersTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  guestVoucherItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 10,
    marginBottom: 6,
  },
  guestVoucherInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  guestVoucherName: {
    fontSize: 14,
    fontWeight: "600",
  },
  guestVoucherCode: {
    fontSize: 12,
    fontWeight: "700",
  },

  // === Companion Section (inside voucher modal) ===
  companionSection: {
    width: "100%",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#EDE9FE",
    borderWidth: 1,
    borderColor: "#DDD6FE",
    gap: 8,
  },
  companionSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  companionSectionTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  companionSectionBtns: {
    flexDirection: "row",
    gap: 8,
  },
  companionBtnPay: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "#7C3AED",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  companionBtnWa: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "#25D366",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  companionBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },

  // Modal de adicionar acompanhante
  guestModal: {
    width: "90%",
    maxWidth: 400,
    borderRadius: 20,
    padding: 24,
    gap: 14,
  },
  guestModalHeader: {
    alignItems: "center",
  },
  guestModalIconBox: {
    width: 72,
    height: 72,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  guestModalTitle: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 4,
  },
  guestModalSubtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  guestFormSection: {
    width: "100%",
    marginBottom: 16,
  },
  guestInputLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  guestInput: {
    width: "100%",
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  guestPriceBox: {
    width: "100%",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 20,
  },
  guestPriceLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  guestPriceValue: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 4,
  },
  guestPriceHint: {
    fontSize: 12,
    textAlign: "center",
  },
  guestTabs: {
    flexDirection: "row",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  guestTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: "#F8FAFC",
  },
  guestTabActive: {
    backgroundColor: "#EDE9FE",
  },
  guestTabText: {
    fontSize: 13,
    fontWeight: "600",
  },
  guestTabTextActive: {
    color: "#7C3AED",
    fontWeight: "700",
  },
  guestInfoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 10,
    padding: 12,
  },
  guestInfoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  guestModalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  guestCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  guestCancelBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
  guestConfirmBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
  },
  guestConfirmBtnText: {
    color: "#fff",
    fontSize: 15,
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


