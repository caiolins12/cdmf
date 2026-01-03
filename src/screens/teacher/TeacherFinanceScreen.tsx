import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, Alert, ActivityIndicator, RefreshControl } from "react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";

import CdmfHeader from "../../components/CdmfHeader";
import SectionHeader from "../../components/SectionHeader";
import { colors } from "../../theme/colors";
import { useDesktop } from "../../contexts/DesktopContext";
import { useAuth, Profile } from "../../contexts/AuthContext";
import { usePayment, Invoice, Transaction, formatCurrency, toCents, PaymentMethod, FinancialSummary } from "../../contexts/PaymentContext";

type FilterMonth = string; // "2025-01" format

function StatusDot({ status }: { status: Invoice["status"] }) {
  const config = {
    paid: { color: "#1B8E3E", icon: "checkmark-circle" },
    pending: { color: "#B8860B", icon: "time" },
    overdue: { color: colors.danger, icon: "alert-circle" },
    cancelled: { color: colors.muted, icon: "close-circle" },
  };
  const { color, icon } = config[status];
  return <Ionicons name={icon as any} size={18} color={color} />;
}

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  color,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
}) {
  return (
    <View style={styles.kpiCard}>
      <View style={styles.kpiTop}>
        <Ionicons name={icon} size={20} color={color || colors.text} />
        <Text style={styles.kpiTitle}>{title}</Text>
      </View>
      <Text style={[styles.kpiValue, color ? { color } : null]}>{value}</Text>
      {subtitle ? <Text style={styles.kpiSub}>{subtitle}</Text> : null}
    </View>
  );
}

function ActionTile({
  label,
  icon,
  onPress,
  disabled,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable 
      style={[styles.tile, disabled && styles.tileDisabled]} 
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons name={icon} size={22} color={disabled ? colors.muted : colors.text} />
      <Text style={[styles.tileText, disabled && styles.tileTextDisabled]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

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

      // Atualiza faturas vencidas
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
      Alert.alert("Sucesso", "Cobrança criada com sucesso!");
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
      Alert.alert("Sucesso", "Pagamento registrado com sucesso!");
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
      Alert.alert("Erro", e.message || "Não foi possível gerar o PIX. Configure a chave PIX nas configurações.");
    } finally {
      setProcessing(false);
    }
  };

  const handleCopyPix = async () => {
    await Clipboard.setStringAsync(pixCode);
    Alert.alert("Copiado!", "Código PIX copiado para a área de transferência");
  };

  const handleGenerateBatch = async () => {
    setProcessing(true);
    try {
      const amount = toCents(parseFloat(batchAmount) || 91);
      const created = await generateMonthlyInvoices(students, month, amount);
      setShowGenerateBatchModal(false);
      await loadData();
      Alert.alert("Sucesso", `${created} cobrança(s) gerada(s) para o mês ${formatMonthDisplay(month)}`);
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
      Alert.alert("Erro", e.message || "Erro ao salvar configurações");
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
        <Text style={styles.loadingText}>Carregando dados financeiros...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, isDesktopMode && desktopStyles.screen]}>
      {!isDesktopMode && <CdmfHeader />}
      {!isDesktopMode && <SectionHeader title="Financeiro" />}

      {/* Modal: Criar Cobrança */}
      <Modal visible={showCreateInvoiceModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => !processing && setShowCreateInvoiceModal(false)}>
          <Pressable style={styles.modal} onPress={e => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Nova Cobrança</Text>

            <Text style={styles.inputLabel}>Aluno *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.studentsScroll}>
              {students.map(s => (
                <Pressable
                  key={s.uid}
                  style={[styles.studentChip, newInvoiceStudentId === s.uid && styles.studentChipSelected]}
                  onPress={() => setNewInvoiceStudentId(s.uid)}
                >
                  <Text style={[styles.studentChipText, newInvoiceStudentId === s.uid && styles.studentChipTextSelected]}>
                    {s.name.split(" ")[0]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>Valor (R$)</Text>
            <TextInput
              style={styles.input}
              value={newInvoiceAmount}
              onChangeText={setNewInvoiceAmount}
              keyboardType="decimal-pad"
              placeholder="91.00"
            />

            <Text style={styles.inputLabel}>Descrição</Text>
            <TextInput
              style={styles.input}
              value={newInvoiceDescription}
              onChangeText={setNewInvoiceDescription}
              placeholder={`Mensalidade ${formatMonthDisplay(month)}`}
            />

            <Text style={styles.inputLabel}>Vencimento (AAAA-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={newInvoiceDueDate}
              onChangeText={setNewInvoiceDueDate}
              placeholder="2025-01-10"
            />

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowCreateInvoiceModal(false)} disabled={processing}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.confirmBtn} onPress={handleCreateInvoice} disabled={processing}>
                {processing ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmBtnText}>Criar</Text>}
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
                <Text style={styles.invoiceSummaryName}>{selectedInvoice.studentName}</Text>
                <Text style={styles.invoiceSummaryAmount}>{formatCurrency(selectedInvoice.amount)}</Text>
              </View>
            )}

            <Text style={styles.inputLabel}>Método de Pagamento</Text>
            <View style={styles.methodsRow}>
              {(["pix", "cash", "card", "transfer"] as PaymentMethod[]).map(m => (
                <Pressable
                  key={m}
                  style={[styles.methodChip, paymentMethod === m && styles.methodChipSelected]}
                  onPress={() => setPaymentMethod(m)}
                >
                  <Ionicons 
                    name={m === "pix" ? "qr-code" : m === "cash" ? "cash" : m === "card" ? "card" : "swap-horizontal"} 
                    size={16} 
                    color={paymentMethod === m ? "#fff" : colors.text} 
                  />
                  <Text style={[styles.methodChipText, paymentMethod === m && styles.methodChipTextSelected]}>
                    {m === "pix" ? "PIX" : m === "cash" ? "Dinheiro" : m === "card" ? "Cartão" : "Transf."}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.inputLabel}>Observações (opcional)</Text>
            <TextInput
              style={[styles.input, { height: 60 }]}
              value={paymentNotes}
              onChangeText={setPaymentNotes}
              placeholder="Adicionar observação..."
              multiline
            />

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowPaymentModal(false)} disabled={processing}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable style={[styles.confirmBtn, { backgroundColor: colors.green }]} onPress={handleMarkAsPaid} disabled={processing}>
                {processing ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmBtnText}>Confirmar</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: PIX */}
      <Modal visible={showPixModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowPixModal(false)}>
          <Pressable style={styles.modal} onPress={e => e.stopPropagation()}>
            <Ionicons name="qr-code" size={48} color={colors.purple} style={{ alignSelf: "center", marginBottom: 16 }} />
            <Text style={styles.modalTitle}>Código PIX</Text>
            
            {selectedInvoice && (
              <View style={styles.invoiceSummary}>
                <Text style={styles.invoiceSummaryName}>{selectedInvoice.studentName}</Text>
                <Text style={styles.invoiceSummaryAmount}>{formatCurrency(selectedInvoice.amount)}</Text>
              </View>
            )}

            <View style={styles.pixCodeBox}>
              <Text style={styles.pixCodeLabel}>Copia e Cola:</Text>
              <Text style={styles.pixCode} numberOfLines={3} ellipsizeMode="middle">
                {pixCode || "Gerando..."}
              </Text>
            </View>

            <Pressable style={[styles.confirmBtn, { marginTop: 16 }]} onPress={handleCopyPix}>
              <Ionicons name="copy" size={18} color="#fff" />
              <Text style={styles.confirmBtnText}>Copiar Código</Text>
            </Pressable>

            <Pressable style={[styles.cancelBtn, { marginTop: 10 }]} onPress={() => setShowPixModal(false)}>
              <Text style={styles.cancelBtnText}>Fechar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: Gerar Cobranças em Lote */}
      <Modal visible={showGenerateBatchModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => !processing && setShowGenerateBatchModal(false)}>
          <Pressable style={styles.modal} onPress={e => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Gerar Cobranças em Lote</Text>
            
            <Text style={styles.batchInfo}>
              Serão geradas cobranças para todos os alunos ativos que ainda não possuem cobrança no mês {formatMonthDisplay(month)}.
            </Text>

            <Text style={styles.batchInfo}>
              <Text style={{ fontWeight: "800" }}>{students.length}</Text> alunos ativos
            </Text>

            <Text style={styles.inputLabel}>Valor da Mensalidade (R$)</Text>
            <TextInput
              style={styles.input}
              value={batchAmount}
              onChangeText={setBatchAmount}
              keyboardType="decimal-pad"
              placeholder="91.00"
            />

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowGenerateBatchModal(false)} disabled={processing}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.confirmBtn} onPress={handleGenerateBatch} disabled={processing}>
                {processing ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmBtnText}>Gerar</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: Configurações */}
      <Modal visible={showSettingsModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => !processing && setShowSettingsModal(false)}>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <Pressable style={styles.modal} onPress={e => e.stopPropagation()}>
              <Text style={styles.modalTitle}>Configurações de Pagamento</Text>

              <Text style={styles.inputLabel}>Chave PIX</Text>
              <TextInput
                style={styles.input}
                value={settingsPixKey}
                onChangeText={setSettingsPixKey}
                placeholder="CPF, CNPJ, Email ou Celular"
              />

              <Text style={styles.inputLabel}>Tipo da Chave</Text>
              <View style={styles.methodsRow}>
                {(["cpf", "cnpj", "email", "phone"] as const).map(t => (
                  <Pressable
                    key={t}
                    style={[styles.methodChip, settingsPixKeyType === t && styles.methodChipSelected]}
                    onPress={() => setSettingsPixKeyType(t)}
                  >
                    <Text style={[styles.methodChipText, settingsPixKeyType === t && styles.methodChipTextSelected]}>
                      {t.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.inputLabel}>Nome do Recebedor</Text>
              <TextInput
                style={styles.input}
                value={settingsReceiverName}
                onChangeText={setSettingsReceiverName}
                placeholder="CDMF Centro de Danças"
                maxLength={25}
              />

              <Text style={styles.inputLabel}>Cidade</Text>
              <TextInput
                style={styles.input}
                value={settingsCity}
                onChangeText={setSettingsCity}
                placeholder="SAO PAULO"
                maxLength={15}
              />

              <Text style={styles.inputLabel}>Mensalidade Padrão (R$)</Text>
              <TextInput
                style={styles.input}
                value={settingsMonthlyFee}
                onChangeText={setSettingsMonthlyFee}
                keyboardType="decimal-pad"
                placeholder="91.00"
              />

              <View style={styles.modalActions}>
                <Pressable style={styles.cancelBtn} onPress={() => setShowSettingsModal(false)} disabled={processing}>
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </Pressable>
                <Pressable style={styles.confirmBtn} onPress={handleSaveSettings} disabled={processing}>
                  {processing ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmBtnText}>Salvar</Text>}
                </Pressable>
              </View>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Modal>

      {/* Filtros */}
      <View style={[styles.filtersRow, isDesktopMode && desktopStyles.filtersRow]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthScroll}>
          <View style={styles.monthRow}>
            {recentMonths.map(m => (
              <Pressable
                key={m}
                onPress={() => setMonth(m)}
                style={[styles.monthPill, m === month && styles.monthPillActive]}
              >
                <Text style={[styles.monthText, m === month && styles.monthTextActive]}>
                  {formatMonthDisplay(m)}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#666" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar aluno..."
            placeholderTextColor="#777"
            style={styles.searchInput}
          />
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={[styles.content, isDesktopMode && desktopStyles.content]} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.purple]} />
        }
      >
        {/* KPI / Resumo do mês */}
        <View style={[styles.kpiGrid, isDesktopMode && desktopStyles.kpiGrid]}>
          <KpiCard
            title="Recebido"
            value={formatCurrency(summary?.totalReceived || 0)}
            subtitle={`${summary?.invoicesCount.paid || 0} pagos`}
            icon="cash-outline"
            color={colors.green}
          />
          <KpiCard
            title="Pendente"
            value={formatCurrency(summary?.totalPending || 0)}
            subtitle={`${summary?.invoicesCount.pending || 0} aguardando`}
            icon="time-outline"
            color="#B8860B"
          />
          <KpiCard
            title="Atrasado"
            value={formatCurrency(summary?.totalOverdue || 0)}
            subtitle={`${summary?.invoicesCount.overdue || 0} vencidos`}
            icon="alert-circle-outline"
            color={colors.danger}
          />
          <KpiCard
            title="Saldo"
            value={formatCurrency(summary?.balance || 0)}
            subtitle="Entradas - Saídas"
            icon="wallet-outline"
            color={colors.purple}
          />
        </View>

        {/* Atalhos */}
        <SectionHeader title="Ações Rápidas" />
        <View style={[styles.tilesGrid, isDesktopMode && desktopStyles.tilesGrid]}>
          <ActionTile 
            label="Nova Cobrança" 
            icon="add-circle-outline" 
            onPress={() => setShowCreateInvoiceModal(true)} 
          />
          <ActionTile 
            label="Gerar Lote" 
            icon="layers-outline" 
            onPress={() => setShowGenerateBatchModal(true)} 
          />
          <ActionTile 
            label="Configurações" 
            icon="settings-outline" 
            onPress={handleOpenSettings}
            disabled={!isMaster}
          />
          <ActionTile 
            label="Relatórios" 
            icon="document-text-outline" 
            onPress={() => Alert.alert("Em breve", "Relatórios serão implementados em breve!")} 
          />
        </View>

        {/* Pendências */}
        <SectionHeader title={`Pendências (${pendingInvoices.length})`} />
        <View style={[styles.panel, isDesktopMode && desktopStyles.panel]}>
          {pendingInvoices.length === 0 ? (
            <Text style={styles.empty}>Nenhuma cobrança pendente 🎉</Text>
          ) : (
            pendingInvoices.map(inv => (
              <View key={inv.id} style={styles.invoiceRow}>
                <View style={styles.invoiceInfo}>
                  <Text style={styles.invoiceName} numberOfLines={1}>{inv.studentName}</Text>
                  <Text style={styles.invoiceMeta}>
                    Venc.: {inv.dueDate.split("-").reverse().join("/")} • {inv.description}
                  </Text>
                </View>

                <View style={styles.invoiceRight}>
                  <Text style={styles.invoiceAmount}>{formatCurrency(inv.amount)}</Text>
                  <StatusDot status={inv.status} />
                </View>

                <View style={styles.invoiceActions}>
                  <Pressable style={styles.smallBtn} onPress={() => handleGeneratePix(inv)}>
                    <Text style={styles.smallBtnText}>PIX</Text>
                  </Pressable>
                  <Pressable style={[styles.smallBtn, styles.smallBtnDark]} onPress={() => openPaymentModal(inv)}>
                    <Text style={[styles.smallBtnText, { color: "white" }]}>PAGO</Text>
                  </Pressable>
                </View>

                <View style={styles.divider} />
              </View>
            ))
          )}
        </View>

        {/* Últimos pagamentos */}
        <SectionHeader title={`Pagamentos do Mês (${paidInvoices.length})`} />
        <View style={[styles.panel, isDesktopMode && desktopStyles.panel]}>
          {paidInvoices.length === 0 ? (
            <Text style={styles.empty}>Nenhum pagamento registrado</Text>
          ) : (
            paidInvoices.map(inv => (
              <View key={inv.id} style={styles.paidRow}>
                <View style={styles.paidInfo}>
                  <Text style={styles.invoiceName} numberOfLines={1}>{inv.studentName}</Text>
                  <Text style={styles.invoiceMeta}>
                    {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString("pt-BR") : ""} • {
                      inv.paidMethod === "pix" ? "PIX" :
                      inv.paidMethod === "cash" ? "Dinheiro" :
                      inv.paidMethod === "card" ? "Cartão" : "Transferência"
                    }
                  </Text>
                </View>
                <Text style={[styles.invoiceAmount, { color: colors.green }]}>{formatCurrency(inv.amount)}</Text>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loadingContainer: { justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, color: colors.muted, fontWeight: "600" },

  filtersRow: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, gap: 10, backgroundColor: "white" },
  monthScroll: { marginBottom: 8 },
  monthRow: { flexDirection: "row", gap: 8 },
  monthPill: {
    backgroundColor: "#E3E3E3",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#CFCFCF",
  },
  monthPillActive: { backgroundColor: colors.text, borderColor: colors.text },
  monthText: { fontWeight: "800", fontSize: 12, color: colors.text },
  monthTextActive: { color: "white" },

  searchBox: {
    backgroundColor: "#E3E3E3",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#CFCFCF",
  },
  searchInput: { flex: 1, fontWeight: "600", color: colors.text },

  content: { paddingBottom: 16 },

  kpiGrid: { padding: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiCard: {
    minWidth: 140,
    flex: 1,
    maxWidth: 200,
    backgroundColor: "white",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CFCFCF",
    padding: 14,
  },
  kpiTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  kpiTitle: { fontWeight: "800", color: colors.text, fontSize: 12, flex: 1 },
  kpiValue: { fontWeight: "900", color: colors.text, fontSize: 18 },
  kpiSub: { marginTop: 4, fontWeight: "600", color: "#666", fontSize: 11 },

  tilesGrid: { padding: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    minWidth: 130,
    flex: 1,
    maxWidth: 180,
    backgroundColor: "white",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CFCFCF",
    padding: 14,
    gap: 8,
  },
  tileDisabled: { opacity: 0.5 },
  tileText: { fontWeight: "800", color: colors.text, fontSize: 12 },
  tileTextDisabled: { color: colors.muted },

  panel: {
    marginHorizontal: 12,
    backgroundColor: "white",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CFCFCF",
    padding: 14,
    marginTop: 8,
    marginBottom: 12,
  },

  empty: { color: "#666", fontWeight: "600", paddingVertical: 16, textAlign: "center" },

  invoiceRow: { paddingVertical: 12 },
  invoiceInfo: { flex: 1, minWidth: 0 },
  divider: { height: 1, backgroundColor: "#E6E6E6", marginTop: 12 },
  invoiceName: { fontWeight: "800", color: colors.text, fontSize: 14 },
  invoiceMeta: { fontWeight: "600", color: "#666", fontSize: 11, marginTop: 4 },
  invoiceRight: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  invoiceAmount: { fontWeight: "900", color: colors.text, fontSize: 15 },
  invoiceActions: { marginTop: 10, flexDirection: "row", gap: 8, flexWrap: "wrap" },
  
  smallBtn: {
    backgroundColor: "#EEEEEE",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#CFCFCF",
    minWidth: 60,
    alignItems: "center",
  },
  smallBtnDark: { backgroundColor: colors.green, borderColor: colors.green },
  smallBtnText: { fontWeight: "800", color: colors.text, fontSize: 11 },

  paidRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E6E6E6",
  },
  paidInfo: { flex: 1, minWidth: 0 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalScrollContent: { flexGrow: 1, justifyContent: "center", padding: 20 },
  modal: {
    backgroundColor: colors.bg,
    borderRadius: 18,
    padding: 24,
    width: "90%",
    maxWidth: 400,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: colors.text, textAlign: "center", marginBottom: 20 },
  inputLabel: { fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  studentsScroll: { maxHeight: 50, marginTop: 4 },
  studentChip: {
    backgroundColor: "#f5f5f5",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  studentChipSelected: { backgroundColor: colors.purple, borderColor: colors.purple },
  studentChipText: { fontSize: 13, fontWeight: "600", color: colors.text },
  studentChipTextSelected: { color: "#fff" },
  methodsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  methodChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f5f5f5",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  methodChipSelected: { backgroundColor: colors.purple, borderColor: colors.purple },
  methodChipText: { fontSize: 12, fontWeight: "600", color: colors.text },
  methodChipTextSelected: { color: "#fff" },
  invoiceSummary: { alignItems: "center", marginBottom: 16, padding: 12, backgroundColor: "#f5f5f5", borderRadius: 10 },
  invoiceSummaryName: { fontSize: 16, fontWeight: "700", color: colors.text },
  invoiceSummaryAmount: { fontSize: 24, fontWeight: "900", color: colors.purple, marginTop: 4 },
  pixCodeBox: { backgroundColor: "#f5f5f5", borderRadius: 10, padding: 12, marginTop: 8 },
  pixCodeLabel: { fontSize: 12, fontWeight: "600", color: colors.muted, marginBottom: 6 },
  pixCode: { fontSize: 11, fontFamily: "monospace", color: colors.text, lineHeight: 16 },
  batchInfo: { fontSize: 14, color: colors.text, marginBottom: 8, textAlign: "center" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
  },
  cancelBtnText: { fontSize: 15, fontWeight: "600", color: colors.muted },
  confirmBtn: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  confirmBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});

// Desktop Styles
const desktopStyles = StyleSheet.create({
  screen: { backgroundColor: "#F8FAFC" },
  filtersRow: { maxWidth: 600, paddingHorizontal: 24 },
  content: { maxWidth: 900, paddingHorizontal: 24 },
  kpiGrid: { maxWidth: 700, gap: 12 },
  tilesGrid: { maxWidth: 600, gap: 12 },
  panel: { maxWidth: 650 },
});
