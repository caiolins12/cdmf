import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, Alert, ActivityIndicator, RefreshControl, Platform } from "react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";

import CdmfHeader from "../../components/CdmfHeader";
import SectionHeader from "../../components/SectionHeader";
import { colors } from "../../theme/colors";
import { useDesktop } from "../../contexts/DesktopContext";
import { useAuth, Profile } from "../../contexts/AuthContext";
import { usePayment, Invoice, Transaction, formatCurrency, toCents, PaymentMethod, FinancialSummary } from "../../contexts/PaymentContext";

type FilterMonth = string;

// Formata mês para exibição
function formatMonthDisplay(month: string): string {
  const [year, m] = month.split("-");
  const months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
  return `${months[parseInt(m) - 1]}/${year}`;
}

// Gera lista de últimos 6 meses
function getRecentMonths(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
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
}: { 
  icon: keyof typeof Ionicons.glyphMap; 
  label: string; 
  onPress: () => void;
  disabled?: boolean;
  variant?: "default" | "primary" | "success";
}) {
  const bgColors = {
    default: "#F8FAFC",
    primary: colors.purple,
    success: colors.green,
  };
  const textColors = {
    default: colors.text,
    primary: "#fff",
    success: "#fff",
  };

  return (
    <Pressable 
      style={({ pressed }) => [
        styles.quickAction,
        { backgroundColor: bgColors[variant], opacity: pressed ? 0.8 : disabled ? 0.5 : 1 }
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons name={icon} size={18} color={textColors[variant]} />
      <Text style={[styles.quickActionText, { color: textColors[variant] }]}>{label}</Text>
    </Pressable>
  );
}

function InvoiceCard({ 
  invoice, 
  onPix, 
  onMarkPaid,
}: { 
  invoice: Invoice; 
  onPix: () => void; 
  onMarkPaid: () => void;
}) {
  const isOverdue = invoice.status === "overdue";
  const statusColor = isOverdue ? colors.danger : "#D97706";
  const statusBg = isOverdue ? "#FEF2F2" : "#FEF3C7";
  const statusText = isOverdue ? "Atrasado" : "Pendente";

  return (
    <View style={styles.invoiceCard}>
      <View style={styles.invoiceHeader}>
        <View style={styles.invoiceInfo}>
          <Text style={styles.invoiceName}>{invoice.studentName}</Text>
          <Text style={styles.invoiceMeta}>
            Venc: {invoice.dueDate.split("-").reverse().join("/")}
          </Text>
        </View>
        <View style={styles.invoiceAmountBox}>
          <Text style={styles.invoiceAmount}>{formatCurrency(invoice.amount)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
          </View>
        </View>
      </View>
      <View style={styles.invoiceActions}>
        <Pressable style={styles.invoiceBtn} onPress={onPix}>
          <Ionicons name="qr-code-outline" size={16} color={colors.purple} />
          <Text style={styles.invoiceBtnText}>Gerar PIX</Text>
        </Pressable>
        <Pressable style={[styles.invoiceBtn, styles.invoiceBtnPrimary]} onPress={onMarkPaid}>
          <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
          <Text style={[styles.invoiceBtnText, { color: "#fff" }]}>Marcar Pago</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PaidCard({ invoice }: { invoice: Invoice }) {
  const methodLabels: Record<string, string> = {
    pix: "PIX",
    cash: "Dinheiro",
    card: "Cartão",
    transfer: "Transferência",
  };

  return (
    <View style={styles.paidCard}>
      <View style={styles.paidIcon}>
        <Ionicons name="checkmark-circle" size={20} color={colors.green} />
      </View>
      <View style={styles.paidInfo}>
        <Text style={styles.paidName}>{invoice.studentName}</Text>
        <Text style={styles.paidMeta}>
          {invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString("pt-BR") : ""} • {methodLabels[invoice.paidMethod || "pix"]}
        </Text>
      </View>
      <Text style={styles.paidAmount}>{formatCurrency(invoice.amount)}</Text>
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
  const { fetchStudents, profile, isMaster } = useAuth();
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
  } = usePayment();

  // State
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState(getRecentMonths()[0]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [students, setStudents] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals
  const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPixModal, setShowPixModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showGenerateBatchModal, setShowGenerateBatchModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Form states
  const [newInvoiceStudentId, setNewInvoiceStudentId] = useState("");
  const [newInvoiceAmount, setNewInvoiceAmount] = useState("91");
  const [newInvoiceDescription, setNewInvoiceDescription] = useState("");
  const [newInvoiceDueDate, setNewInvoiceDueDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [pixCode, setPixCode] = useState("");
  const [batchAmount, setBatchAmount] = useState("91");
  const [processing, setProcessing] = useState(false);

  // Settings form
  const [settingsPixKey, setSettingsPixKey] = useState("");
  const [settingsPixKeyType, setSettingsPixKeyType] = useState<"cpf" | "cnpj" | "email" | "phone" | "random">("cpf");
  const [settingsReceiverName, setSettingsReceiverName] = useState("");
  const [settingsCity, setSettingsCity] = useState("");
  const [settingsMonthlyFee, setSettingsMonthlyFee] = useState("91");

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

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Filtro de busca
  const filteredInvoices = invoices.filter(inv => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return inv.studentName.toLowerCase().includes(q) || inv.studentEmail.toLowerCase().includes(q);
  });

  const pendingInvoices = filteredInvoices.filter(i => i.status === "pending" || i.status === "overdue");
  const paidInvoices = filteredInvoices.filter(i => i.status === "paid");

  // Handlers
  const handleCreateInvoice = async () => {
    if (!newInvoiceStudentId) {
      Alert.alert("Atenção", "Selecione um aluno");
      return;
    }
    
    const student = students.find(s => s.uid === newInvoiceStudentId);
    if (!student) return;

    const amount = toCents(parseFloat(newInvoiceAmount) || 91);
    const dueDate = newInvoiceDueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    setProcessing(true);
    try {
      await createInvoice({
        studentId: student.uid,
        studentName: student.name,
        studentEmail: student.email,
        amount,
        description: newInvoiceDescription || `Mensalidade ${month}`,
        dueDate,
        referenceMonth: month,
        classIds: student.classes || [],
      });

      setShowCreateInvoiceModal(false);
      setNewInvoiceStudentId("");
      setNewInvoiceAmount("91");
      setNewInvoiceDescription("");
      setNewInvoiceDueDate("");
      await loadData();
      Alert.alert("Sucesso", "Cobrança criada!");
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

  const handleGenerateBatch = async () => {
    setProcessing(true);
    try {
      const amount = toCents(parseFloat(batchAmount) || 91);
      const created = await generateMonthlyInvoices(students, month, amount);
      setShowGenerateBatchModal(false);
      await loadData();
      Alert.alert("Sucesso", `${created} cobrança(s) gerada(s)`);
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Erro ao gerar cobranças");
    } finally {
      setProcessing(false);
    }
  };

  const handleOpenSettings = async () => {
    const settings = await getPaymentSettings();
    if (settings) {
      setSettingsPixKey(settings.pixKey);
      setSettingsPixKeyType(settings.pixKeyType);
      setSettingsReceiverName(settings.pixReceiverName);
      setSettingsCity(settings.pixCity);
      setSettingsMonthlyFee(String(settings.monthlyFee / 100));
    }
    setShowSettingsModal(true);
  };

  const handleSaveSettings = async () => {
    setProcessing(true);
    try {
      await updatePaymentSettings({
        pixKey: settingsPixKey,
        pixKeyType: settingsPixKeyType,
        pixReceiverName: settingsReceiverName,
        pixCity: settingsCity,
        monthlyFee: toCents(parseFloat(settingsMonthlyFee) || 91),
      });
      setShowSettingsModal(false);
      Alert.alert("Sucesso", "Configurações salvas!");
    } catch (e: any) {
      Alert.alert("Erro", e.message);
    } finally {
      setProcessing(false);
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
      {!isDesktopMode && <CdmfHeader />}
      {!isDesktopMode && <SectionHeader title="Financeiro" />}

      {/* ==================== MODAIS ==================== */}
      
      {/* Modal: Criar Cobrança */}
      <Modal visible={showCreateInvoiceModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => !processing && setShowCreateInvoiceModal(false)}>
          <Pressable style={styles.modal} onPress={e => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Nova Cobrança</Text>

            <Text style={styles.inputLabel}>Aluno</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
              {students.map(s => (
                <Pressable
                  key={s.uid}
                  style={[styles.chip, newInvoiceStudentId === s.uid && styles.chipSelected]}
                  onPress={() => setNewInvoiceStudentId(s.uid)}
                >
                  <Text style={[styles.chipText, newInvoiceStudentId === s.uid && styles.chipTextSelected]}>
                    {s.name.split(" ")[0]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>Valor (R$)</Text>
            <TextInput style={styles.input} value={newInvoiceAmount} onChangeText={setNewInvoiceAmount} keyboardType="decimal-pad" />

            <Text style={styles.inputLabel}>Descrição</Text>
            <TextInput style={styles.input} value={newInvoiceDescription} onChangeText={setNewInvoiceDescription} placeholder={`Mensalidade ${formatMonthDisplay(month)}`} />

            <Text style={styles.inputLabel}>Vencimento</Text>
            <TextInput style={styles.input} value={newInvoiceDueDate} onChangeText={setNewInvoiceDueDate} placeholder="2025-01-10" />

            <View style={styles.modalBtns}>
              <Pressable style={styles.btnSecondary} onPress={() => setShowCreateInvoiceModal(false)}><Text style={styles.btnSecondaryText}>Cancelar</Text></Pressable>
              <Pressable style={styles.btnPrimary} onPress={handleCreateInvoice} disabled={processing}>
                {processing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnPrimaryText}>Criar</Text>}
              </Pressable>
            </View>
          </Pressable>
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
            <TextInput style={[styles.input, { height: 60 }]} value={paymentNotes} onChangeText={setPaymentNotes} multiline placeholder="Opcional..." />

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
            </View>
            
            {selectedInvoice && (
              <View style={styles.invoiceSummary}>
                <Text style={styles.summaryName}>{selectedInvoice.studentName}</Text>
                <Text style={styles.summaryAmount}>{formatCurrency(selectedInvoice.amount)}</Text>
              </View>
            )}

            <View style={styles.pixBox}>
              <Text style={styles.pixLabel}>Copia e Cola:</Text>
              <Text style={styles.pixCode} numberOfLines={3}>{pixCode || "Gerando..."}</Text>
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

      {/* Modal: Gerar Lote */}
      <Modal visible={showGenerateBatchModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => !processing && setShowGenerateBatchModal(false)}>
          <Pressable style={styles.modal} onPress={e => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Gerar Cobranças em Lote</Text>
            <Text style={styles.batchInfo}>Gerar cobranças para todos os {students.length} alunos ativos no mês {formatMonthDisplay(month)}.</Text>

            <Text style={styles.inputLabel}>Valor (R$)</Text>
            <TextInput style={styles.input} value={batchAmount} onChangeText={setBatchAmount} keyboardType="decimal-pad" />

            <View style={styles.modalBtns}>
              <Pressable style={styles.btnSecondary} onPress={() => setShowGenerateBatchModal(false)}><Text style={styles.btnSecondaryText}>Cancelar</Text></Pressable>
              <Pressable style={styles.btnPrimary} onPress={handleGenerateBatch} disabled={processing}>
                {processing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnPrimaryText}>Gerar</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: Configurações */}
      <Modal visible={showSettingsModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => !processing && setShowSettingsModal(false)}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <Pressable style={styles.modal} onPress={e => e.stopPropagation()}>
              <Text style={styles.modalTitle}>Configurações PIX</Text>

              <Text style={styles.inputLabel}>Chave PIX</Text>
              <TextInput style={styles.input} value={settingsPixKey} onChangeText={setSettingsPixKey} placeholder="CPF, Email, Celular..." />

              <Text style={styles.inputLabel}>Tipo da Chave</Text>
              <View style={styles.methodsGrid}>
                {(["cpf", "cnpj", "email", "phone"] as const).map(t => (
                  <Pressable key={t} style={[styles.methodBtn, settingsPixKeyType === t && styles.methodBtnActive]} onPress={() => setSettingsPixKeyType(t)}>
                    <Text style={[styles.methodBtnText, settingsPixKeyType === t && styles.methodBtnTextActive]}>{t.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.inputLabel}>Nome Recebedor</Text>
              <TextInput style={styles.input} value={settingsReceiverName} onChangeText={setSettingsReceiverName} maxLength={25} />

              <Text style={styles.inputLabel}>Cidade</Text>
              <TextInput style={styles.input} value={settingsCity} onChangeText={setSettingsCity} maxLength={15} />

              <Text style={styles.inputLabel}>Mensalidade Padrão (R$)</Text>
              <TextInput style={styles.input} value={settingsMonthlyFee} onChangeText={setSettingsMonthlyFee} keyboardType="decimal-pad" />

              <View style={styles.modalBtns}>
                <Pressable style={styles.btnSecondary} onPress={() => setShowSettingsModal(false)}><Text style={styles.btnSecondaryText}>Cancelar</Text></Pressable>
                <Pressable style={styles.btnPrimary} onPress={handleSaveSettings} disabled={processing}>
                  {processing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnPrimaryText}>Salvar</Text>}
                </Pressable>
              </View>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Modal>

      {/* ==================== CONTEÚDO ==================== */}

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={[styles.content, isDesktopMode && dkStyles.content]} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.purple]} />}
      >
        {/* Header com filtros */}
        <View style={[styles.header, isDesktopMode && dkStyles.header]}>
          <View style={styles.monthsRow}>
            {recentMonths.map(m => (
              <Pressable key={m} onPress={() => setMonth(m)} style={[styles.monthPill, m === month && styles.monthPillActive]}>
                <Text style={[styles.monthText, m === month && styles.monthTextActive]}>{formatMonthDisplay(m)}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color="#94A3B8" />
            <TextInput value={query} onChangeText={setQuery} placeholder="Buscar..." placeholderTextColor="#94A3B8" style={styles.searchInput} />
          </View>
        </View>

        {/* Cards de Estatísticas */}
        <View style={[styles.statsGrid, isDesktopMode && dkStyles.statsGrid]}>
          <StatCard title="Recebido" value={formatCurrency(summary?.totalReceived || 0)} subtitle={`${summary?.invoicesCount.paid || 0} pagamentos`} icon="trending-up" color="#059669" bgColor="#D1FAE5" />
          <StatCard title="Pendente" value={formatCurrency(summary?.totalPending || 0)} subtitle={`${summary?.invoicesCount.pending || 0} aguardando`} icon="time" color="#D97706" bgColor="#FEF3C7" />
          <StatCard title="Atrasado" value={formatCurrency(summary?.totalOverdue || 0)} subtitle={`${summary?.invoicesCount.overdue || 0} vencidos`} icon="alert-circle" color="#DC2626" bgColor="#FEE2E2" />
          <StatCard title="Saldo" value={formatCurrency(summary?.balance || 0)} subtitle="Entradas - Saídas" icon="wallet" color={colors.purple} bgColor="#EDE9FE" />
        </View>

        {/* Ações Rápidas */}
        <View style={[styles.actionsRow, isDesktopMode && dkStyles.actionsRow]}>
          <QuickAction icon="add-circle-outline" label="Nova Cobrança" onPress={() => setShowCreateInvoiceModal(true)} variant="primary" />
          <QuickAction icon="layers-outline" label="Gerar Lote" onPress={() => setShowGenerateBatchModal(true)} />
          <QuickAction icon="settings-outline" label="Configurações" onPress={handleOpenSettings} disabled={!isMaster} />
        </View>

        {/* Pendências */}
        <View style={[styles.section, isDesktopMode && dkStyles.section]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Pendências</Text>
            <Text style={styles.sectionBadge}>{pendingInvoices.length}</Text>
          </View>
          
          {pendingInvoices.length === 0 ? (
            <EmptyState icon="checkmark-done-circle" title="Tudo em dia!" subtitle="Nenhuma cobrança pendente" />
          ) : (
            <View style={styles.cardsList}>
              {pendingInvoices.map(inv => (
                <InvoiceCard key={inv.id} invoice={inv} onPix={() => handleGeneratePix(inv)} onMarkPaid={() => openPaymentModal(inv)} />
              ))}
            </View>
          )}
        </View>

        {/* Pagamentos do Mês */}
        <View style={[styles.section, isDesktopMode && dkStyles.section]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Pagamentos do Mês</Text>
            <Text style={[styles.sectionBadge, { backgroundColor: "#D1FAE5", color: "#059669" }]}>{paidInvoices.length}</Text>
          </View>
          
          {paidInvoices.length === 0 ? (
            <EmptyState icon="receipt-outline" title="Nenhum pagamento" subtitle="Pagamentos aparecerão aqui" />
          ) : (
            <View style={styles.paidList}>
              {paidInvoices.map(inv => <PaidCard key={inv.id} invoice={inv} />)}
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
  monthsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  monthPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E2E8F0" },
  monthPillActive: { backgroundColor: "#1E293B", borderColor: "#1E293B" },
  monthText: { fontSize: 12, fontWeight: "700", color: "#64748B" },
  monthTextActive: { color: "#fff" },
  searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: "#E2E8F0", gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: "#1E293B" },

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
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  quickAction: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 8, 
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  quickActionText: { fontSize: 13, fontWeight: "600" },

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
  invoiceActions: { flexDirection: "row", gap: 10 },
  invoiceBtn: { 
    flex: 1, 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "center", 
    gap: 6, 
    paddingVertical: 10, 
    borderRadius: 8, 
    backgroundColor: "#F1F5F9",
  },
  invoiceBtnPrimary: { backgroundColor: colors.green },
  invoiceBtnText: { fontSize: 13, fontWeight: "600", color: colors.purple },

  // Paid List
  paidList: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" },
  paidCard: { flexDirection: "row", alignItems: "center", padding: 14, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  paidIcon: { marginRight: 12 },
  paidInfo: { flex: 1 },
  paidName: { fontSize: 14, fontWeight: "600", color: "#1E293B" },
  paidMeta: { fontSize: 12, color: "#64748B", marginTop: 2 },
  paidAmount: { fontSize: 15, fontWeight: "700", color: "#059669" },

  // Empty State
  emptyState: { alignItems: "center", paddingVertical: 40, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0" },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: "#64748B", marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: "#94A3B8", marginTop: 4 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  modalScroll: { flexGrow: 1, justifyContent: "center", padding: 20 },
  modal: { backgroundColor: "#fff", borderRadius: 16, padding: 24, width: "90%", maxWidth: 400 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#1E293B", textAlign: "center", marginBottom: 20 },
  inputLabel: { fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: "#F8FAFC", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#1E293B", borderWidth: 1, borderColor: "#E2E8F0" },
  chipsScroll: { marginVertical: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "#F1F5F9", marginRight: 8, borderWidth: 1, borderColor: "#E2E8F0" },
  chipSelected: { backgroundColor: colors.purple, borderColor: colors.purple },
  chipText: { fontSize: 13, fontWeight: "600", color: "#1E293B" },
  chipTextSelected: { color: "#fff" },
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
  methodBtnText: { fontSize: 12, fontWeight: "600", color: "#1E293B" },
  methodBtnTextActive: { color: "#fff" },
  invoiceSummary: { alignItems: "center", padding: 16, backgroundColor: "#F8FAFC", borderRadius: 12, marginBottom: 16 },
  summaryName: { fontSize: 15, fontWeight: "600", color: "#1E293B" },
  summaryAmount: { fontSize: 24, fontWeight: "800", color: colors.purple, marginTop: 4 },
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
    gap: 12,
    marginBottom: 28,
  },
  section: { 
    maxWidth: 800,
    marginBottom: 28,
  },
});
