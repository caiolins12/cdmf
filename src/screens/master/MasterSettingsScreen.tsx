import React, { useState, useCallback } from "react";
import { View, StyleSheet, ScrollView, Text, Pressable, RefreshControl, ActivityIndicator, Modal } from "react-native";
import { doc, getDocs, collection, deleteDoc, query, where, updateDoc } from "../../services/postgresFirestoreCompat";
import { Ionicons } from "@/shims/icons";
import { useFocusEffect } from "@react-navigation/native";

import MasterHeader from "../../components/MasterHeader";
import SectionHeader from "../../components/SectionHeader";
import { BaseModal, ModalButtons, FormInput, InfoRow } from "../../components/ui";
import { colors } from "../../theme/colors";
import { useDesktop } from "../../contexts/DesktopContext";
import { useAuth } from "../../contexts/AuthContext";
import { db } from "../../services/firebase";
import { showError, showSuccess, showWarning } from "../../utils/alert";

type ClearOption = {
  id: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  collections: string[];
  special?: "financial_reset" | "delete_students";
};

const CLEAR_OPTIONS: ClearOption[] = [
  {
    id: "financial",
    label: "Dados financeiros",
    description: "Faturas, transações e cobranças",
    icon: "cash-outline",
    collections: ["invoices", "transactions"],
    special: "financial_reset",
  },
  {
    id: "events",
    label: "Eventos",
    description: "Todos os eventos cadastrados",
    icon: "calendar-outline",
    collections: ["events"],
  },
  {
    id: "classes",
    label: "Turmas",
    description: "Todas as turmas e aulas",
    icon: "school-outline",
    collections: ["classes"],
  },
  {
    id: "vouchers",
    label: "Vouchers",
    description: "Todos os ingressos e vouchers",
    icon: "ticket-outline",
    collections: ["vouchers"],
  },
  {
    id: "students",
    label: "Alunos",
    description: "Todos os perfis de alunos",
    icon: "people-outline",
    collections: [],
    special: "delete_students",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    description: "Conversas e mensagens do bot",
    icon: "chatbubbles-outline",
    collections: ["whatsapp_conversations", "whatsapp_messages"],
  },
  {
    id: "activities",
    label: "Atividades",
    description: "Histórico de atividades do sistema",
    icon: "time-outline",
    collections: ["activities"],
  },
];

export default function MasterSettingsScreen() {
  const { isDesktopMode } = useDesktop();
  const { profile, updateProfile, signOut } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Accordion: quais seções estão abertas
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  // Account settings
  const [accountName, setAccountName] = useState("");
  const [accountPhone, setAccountPhone] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);

  // Clear modal
  const [showClearModal, setShowClearModal] = useState(false);
  const [selectedClearIds, setSelectedClearIds] = useState<string[]>([]);
  const [clearing, setClearing] = useState(false);

  const toggleSection = (id: string) => {
    setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleClearOption = (id: string) => {
    setSelectedClearIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllClear = () => {
    setSelectedClearIds(CLEAR_OPTIONS.map(o => o.id));
  };

  const deselectAllClear = () => {
    setSelectedClearIds([]);
  };

  const handleOpenClearModal = () => {
    setSelectedClearIds([]);
    setShowClearModal(true);
  };

  const handleConfirmClear = async () => {
    if (selectedClearIds.length === 0) return;
    setClearing(true);
    try {
      let total = 0;
      const selectedOptions = CLEAR_OPTIONS.filter(o => selectedClearIds.includes(o.id));

      for (const option of selectedOptions) {
        // Deletar coleções normais
        for (const col of option.collections) {
          const snap = await getDocs(collection(db, col));
          for (const d of snap.docs) { await deleteDoc(doc(db, col, d.id)); total++; }
        }

        // Ações especiais
        if (option.special === "financial_reset") {
          // Resetar status de pagamento dos alunos
          const studentsSnap = await getDocs(query(collection(db, "profiles"), where("role", "==", "student")));
          for (const d of studentsSnap.docs) {
            await updateDoc(doc(db, "profiles", d.id), { paymentStatus: "sem_cobranca", pendingNotifications: [] });
          }
        }

        if (option.special === "delete_students") {
          const studentsSnap = await getDocs(query(collection(db, "profiles"), where("role", "==", "student")));
          for (const d of studentsSnap.docs) { await deleteDoc(doc(db, "profiles", d.id)); total++; }
        }
      }

      setShowClearModal(false);
      setSelectedClearIds([]);
      showSuccess("Dados Removidos", `${total} registro(s) removido(s) com sucesso.`);
    } catch (e: any) {
      showError("Erro", e.message || "Erro ao limpar dados");
    } finally {
      setClearing(false);
    }
  };

  const loadSettings = useCallback(async () => {
    try {
      if (profile) {
        setAccountName(profile.name || "");
        setAccountPhone(profile.phone || "");
      }
      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useFocusEffect(useCallback(() => { loadSettings(); }, [loadSettings]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSettings();
    setRefreshing(false);
  };

  const handleSaveAccountSettings = async () => {
    if (!accountName.trim()) { showWarning("Atenção", "Informe seu nome"); return; }
    if (!profile?.uid) { showError("Erro", "Conta não encontrada."); return; }
    setSavingAccount(true);
    try {
      await updateProfile(profile.uid, {
        name: accountName.trim(),
        phone: accountPhone.trim() || undefined,
      });
      setExpandedSections(prev => ({ ...prev, account: false }));
      showSuccess("Salvo", "Dados da conta atualizados!");
    } catch (error: any) {
      showError("Erro", error.message || "Não foi possível salvar");
    } finally {
      setSavingAccount(false);
    }
  };

  const allSelected = selectedClearIds.length === CLEAR_OPTIONS.length;

  return (
    <View style={[styles.screen, isDesktopMode && desktopStyles.screen]}>
      {!isDesktopMode && <MasterHeader />}
      {!isDesktopMode && <SectionHeader title="Configurações" />}

      {/* Modal de Limpeza de Dados */}
      <Modal visible={showClearModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => !clearing && setShowClearModal(false)}>
          <Pressable style={styles.clearModal} onPress={(e: any) => e.stopPropagation()}>
            {/* Header */}
            <View style={styles.clearModalHeader}>
              <View style={styles.clearModalIconBox}>
                <Ionicons name="trash" size={22} color="#DC2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.clearModalTitle}>Limpar Dados</Text>
                <Text style={styles.clearModalSubtitle}>Selecione o que deseja apagar</Text>
              </View>
              <Pressable onPress={() => !clearing && setShowClearModal(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </Pressable>
            </View>

            {/* Select all row */}
            <View style={styles.clearSelectAllRow}>
              <Text style={styles.clearSelectAllLabel}>
                {selectedClearIds.length} de {CLEAR_OPTIONS.length} selecionados
              </Text>
              <Pressable onPress={allSelected ? deselectAllClear : selectAllClear}>
                <Text style={styles.clearSelectAllBtn}>
                  {allSelected ? "Desmarcar tudo" : "Selecionar tudo"}
                </Text>
              </Pressable>
            </View>

            {/* Options */}
            <ScrollView style={styles.clearOptionsList} showsVerticalScrollIndicator={false}>
              {CLEAR_OPTIONS.map(option => {
                const checked = selectedClearIds.includes(option.id);
                return (
                  <Pressable
                    key={option.id}
                    style={[styles.clearOption, checked && styles.clearOptionChecked]}
                    onPress={() => toggleClearOption(option.id)}
                    disabled={clearing}
                  >
                    <View style={[styles.clearOptionIcon, { backgroundColor: checked ? "#FEE2E2" : "#F8FAFC" }]}>
                      <Ionicons name={option.icon} size={18} color={checked ? "#DC2626" : "#64748B"} />
                    </View>
                    <View style={styles.clearOptionInfo}>
                      <Text style={[styles.clearOptionLabel, checked && { color: "#DC2626" }]}>
                        {option.label}
                      </Text>
                      <Text style={styles.clearOptionDesc}>{option.description}</Text>
                    </View>
                    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                      {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Warning */}
            {selectedClearIds.length > 0 && (
              <View style={styles.clearWarning}>
                <Ionicons name="warning" size={14} color="#D97706" />
                <Text style={styles.clearWarningText}>
                  Esta ação é irreversível. Os dados selecionados serão apagados permanentemente.
                </Text>
              </View>
            )}

            {/* Buttons */}
            <View style={styles.clearModalBtns}>
              <Pressable
                style={styles.clearCancelBtn}
                onPress={() => setShowClearModal(false)}
                disabled={clearing}
              >
                <Text style={styles.clearCancelBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.clearConfirmBtn,
                  (selectedClearIds.length === 0 || clearing) && styles.clearConfirmBtnDisabled,
                ]}
                onPress={handleConfirmClear}
                disabled={selectedClearIds.length === 0 || clearing}
              >
                {clearing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="trash" size={16} color="#fff" />
                )}
                <Text style={styles.clearConfirmBtnText}>
                  {clearing ? "Apagando..." : `Apagar ${selectedClearIds.length > 0 ? `(${selectedClearIds.length})` : ""}`}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Account Settings Modal */}
      <BaseModal
        visible={expandedSections.accountModal === true}
        onClose={() => setExpandedSections(prev => ({ ...prev, accountModal: false }))}
        title="Dados da Conta"
        icon={<Ionicons name="person" size={24} color={colors.purple} />}
        loading={savingAccount}
        footer={
          <ModalButtons
            primaryLabel="Salvar"
            secondaryLabel="Cancelar"
            onPrimaryPress={handleSaveAccountSettings}
            onSecondaryPress={() => setExpandedSections(prev => ({ ...prev, accountModal: false }))}
            primaryLoading={savingAccount}
            primaryIcon="checkmark"
          />
        }
      >
        <FormInput label="Nome" value={accountName} onChangeText={setAccountName} placeholder="Seu nome" required />
        <FormInput label="Telefone" value={accountPhone} onChangeText={setAccountPhone} placeholder="(00) 00000-0000" keyboardType="phone-pad" />
        <View style={styles.accountInfo}>
          <InfoRow label="E-mail" value={profile?.email || "Não informado"} icon="mail-outline" />
          <InfoRow label="Função" value="Administrador" icon="shield-checkmark-outline" />
          <InfoRow
            label="Membro desde"
            value={profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString("pt-BR") : "--"}
            icon="calendar-outline"
          />
        </View>
      </BaseModal>

      {/* Main Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.purple]} />}
      >
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={colors.purple} />
            <Text style={styles.loadingText}>Carregando configurações...</Text>
          </View>
        ) : (
          <>
            {/* Header */}
            <View style={styles.headerCard}>
              <View style={styles.headerIcon}>
                <Ionicons name="settings" size={32} color={colors.purple} />
              </View>
              <Text style={styles.headerTitle}>Configurações</Text>
              <Text style={styles.headerSubtitle}>Gerencie os dados da sua conta</Text>
            </View>

            {/* Accordion */}
            <View style={styles.accordionContainer}>

              {/* ── Conta ── */}
              <View style={[styles.accordionCard, expandedSections.account && styles.accordionCardOpen]}>
                <Pressable
                  style={styles.accordionHeader}
                  onPress={() => toggleSection("account")}
                >
                  <View style={[styles.accordionIcon, { backgroundColor: colors.purple + "15" }]}>
                    <Ionicons name="person-outline" size={20} color={colors.purple} />
                  </View>
                  <View style={styles.accordionInfo}>
                    <Text style={styles.accordionTitle}>Conta</Text>
                    <Text style={styles.accordionDesc}>Dados do administrador</Text>
                  </View>
                  <Ionicons
                    name={expandedSections.account ? "chevron-up" : "chevron-down"}
                    size={18}
                    color="#94A3B8"
                  />
                </Pressable>

                {expandedSections.account && (
                  <View style={styles.accordionBody}>
                    <FormInput
                      label="Nome"
                      value={accountName}
                      onChangeText={setAccountName}
                      placeholder="Seu nome"
                      required
                    />
                    <FormInput
                      label="Telefone"
                      value={accountPhone}
                      onChangeText={setAccountPhone}
                      placeholder="(00) 00000-0000"
                      keyboardType="phone-pad"
                    />
                    <View style={styles.accountInfo}>
                      <InfoRow label="E-mail" value={profile?.email || "Não informado"} icon="mail-outline" />
                      <InfoRow label="Função" value="Administrador" icon="shield-checkmark-outline" />
                      <InfoRow
                        label="Membro desde"
                        value={profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString("pt-BR") : "--"}
                        icon="calendar-outline"
                      />
                    </View>
                    <Pressable
                      style={[styles.saveBtn, savingAccount && styles.saveBtnDisabled]}
                      onPress={handleSaveAccountSettings}
                      disabled={savingAccount}
                    >
                      {savingAccount
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Ionicons name="checkmark" size={16} color="#fff" />
                      }
                      <Text style={styles.saveBtnText}>
                        {savingAccount ? "Salvando..." : "Salvar"}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>

              {/* ── Zona de Perigo ── */}
              <View style={[styles.accordionCard, styles.accordionCardDanger, expandedSections.danger && styles.accordionCardDangerOpen]}>
                <Pressable
                  style={styles.accordionHeader}
                  onPress={() => toggleSection("danger")}
                >
                  <View style={[styles.accordionIcon, { backgroundColor: "#FEE2E2" }]}>
                    <Ionicons name="warning-outline" size={20} color="#DC2626" />
                  </View>
                  <View style={styles.accordionInfo}>
                    <Text style={[styles.accordionTitle, { color: "#DC2626" }]}>Zona de Perigo</Text>
                    <Text style={styles.accordionDesc}>Ações destrutivas e irreversíveis</Text>
                  </View>
                  <Ionicons
                    name={expandedSections.danger ? "chevron-up" : "chevron-down"}
                    size={18}
                    color="#DC2626"
                  />
                </Pressable>

                {expandedSections.danger && (
                  <View style={styles.accordionBody}>
                    <Text style={styles.dangerBodyDesc}>
                      Os dados apagados não poderão ser recuperados. Proceda com cuidado.
                    </Text>
                    <Pressable
                      style={styles.dangerBtn}
                      onPress={handleOpenClearModal}
                    >
                      <Ionicons name="trash-outline" size={18} color="#DC2626" />
                      <View style={styles.dangerBtnInfo}>
                        <Text style={styles.dangerBtnTitle}>Limpar Dados</Text>
                        <Text style={styles.dangerBtnDesc}>Selecione o que deseja apagar</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#DC2626" />
                    </Pressable>
                  </View>
                )}
              </View>

            </View>

            {/* Logout */}
            <Pressable style={styles.logoutBtn} onPress={signOut}>
              <Ionicons name="log-out-outline" size={20} color={colors.danger} />
              <Text style={styles.logoutText}>Sair da Conta</Text>
            </Pressable>

            {/* Version Info */}
            <View style={styles.versionInfo}>
              <Text style={styles.versionText}>CDMF v1.0.0</Text>
              <Text style={styles.versionSubtext}>Sistema de Gestão de Escola de Dança</Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  content: { flex: 1 },
  contentContainer: { padding: 16, paddingBottom: 40 },
  loadingState: { alignItems: "center", paddingVertical: 60 },
  loadingText: { color: "#64748B", fontWeight: "600", marginTop: 12 },

  // Header
  headerCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.purple + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#1E293B", marginBottom: 4 },
  headerSubtitle: { fontSize: 14, color: "#64748B", textAlign: "center" },

  // Accordion container
  accordionContainer: { gap: 10, marginBottom: 24 },

  accordionCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  accordionCardOpen: {
    borderColor: colors.purple + "60",
  },
  accordionCardDanger: {
    borderColor: "#FECACA",
    backgroundColor: "#FFF5F5",
  },
  accordionCardDangerOpen: {
    borderColor: "#DC262660",
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  accordionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  accordionInfo: { flex: 1 },
  accordionTitle: { fontSize: 15, fontWeight: "700", color: "#1E293B" },
  accordionDesc: { fontSize: 12, color: "#64748B", marginTop: 2 },

  accordionBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    gap: 4,
  },

  // Settings rows
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  settingInfo: { flex: 1, marginRight: 12 },
  settingTitle: { fontSize: 14, fontWeight: "600", color: "#1E293B", marginBottom: 2 },
  settingDescription: { fontSize: 12, color: "#64748B" },

  inlineInput: { paddingTop: 4 },
  inlineInputLabel: { fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 4 },

  // Save button (inside accordion)
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.purple,
    borderRadius: 10,
    paddingVertical: 11,
    marginTop: 12,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },

  // Account info
  accountInfo: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },

  // Danger zone body
  dangerBodyDesc: {
    fontSize: 13,
    color: "#64748B",
    lineHeight: 18,
    paddingTop: 12,
    paddingBottom: 8,
  },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 14,
  },
  dangerBtnInfo: { flex: 1, gap: 2 },
  dangerBtnTitle: { fontSize: 14, fontWeight: "700", color: "#1E293B" },
  dangerBtnDesc: { fontSize: 12, color: "#64748B" },

  // Version
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    marginTop: 8,
    marginBottom: 4,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: "900",
    color: colors.danger,
  },

  versionInfo: { alignItems: "center", paddingVertical: 20 },
  versionText: { fontSize: 13, fontWeight: "600", color: "#94A3B8" },
  versionSubtext: { fontSize: 11, color: "#CBD5E1", marginTop: 2 },

  // ── Clear Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  clearModal: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingTop: 4,
    maxHeight: "85%",
    overflow: "hidden",
  },
  clearModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  clearModalIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },
  clearModalTitle: { fontSize: 16, fontWeight: "800", color: "#1E293B" },
  clearModalSubtitle: { fontSize: 13, color: "#64748B" },

  clearSelectAllRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#F8FAFC",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  clearSelectAllLabel: { fontSize: 13, color: "#64748B", fontWeight: "500" },
  clearSelectAllBtn: { fontSize: 13, color: colors.purple, fontWeight: "700" },

  clearOptionsList: { maxHeight: 360 },

  clearOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F8FAFC",
  },
  clearOptionChecked: { backgroundColor: "#FFF5F5" },
  clearOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  clearOptionInfo: { flex: 1 },
  clearOptionLabel: { fontSize: 14, fontWeight: "600", color: "#1E293B" },
  clearOptionDesc: { fontSize: 12, color: "#64748B", marginTop: 2 },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#DC2626",
    borderColor: "#DC2626",
  },

  clearWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 10,
    backgroundColor: "#FFFBEB",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  clearWarningText: { flex: 1, fontSize: 12, color: "#92400E", lineHeight: 17 },

  clearModalBtns: {
    flexDirection: "row",
    gap: 10,
    padding: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  clearCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
  },
  clearCancelBtnText: { fontSize: 14, fontWeight: "600", color: "#64748B" },
  clearConfirmBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#DC2626",
  },
  clearConfirmBtnDisabled: { opacity: 0.4 },
  clearConfirmBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});

const desktopStyles = StyleSheet.create({
  screen: { backgroundColor: "#F8FAFC" },
});
