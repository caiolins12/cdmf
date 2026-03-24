import React, { useState, useCallback } from "react";
import { View, StyleSheet, ScrollView, Text, Pressable, RefreshControl, Switch, ActivityIndicator } from "react-native";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Ionicons } from "@/shims/icons";
import { useFocusEffect } from "@react-navigation/native";

import MasterHeader from "../../components/MasterHeader";
import SectionHeader from "../../components/SectionHeader";
import { BaseModal, ModalButtons, FormInput, InfoRow, StatusBadge } from "../../components/ui";
import { colors } from "../../theme/colors";
import { useDesktop } from "../../contexts/DesktopContext";
import { useAuth } from "../../contexts/AuthContext";
import { db } from "../../services/firebase";
import { showError, showSuccess, showWarning } from "../../utils/alert";

interface SettingsSection {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
}

type FeedbackTone = "loading" | "success" | "error" | "info";

type FeedbackState = {
  tone: FeedbackTone;
  title: string;
  message: string;
  sectionId?: string;
};

type SectionStatus = {
  label: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
};

type StoredNotificationsSettings = {
  autoPaymentReminder?: boolean;
  reminderDaysBefore?: number;
  autoClassReminder?: boolean;
  updatedAt?: number;
};

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "notifications",
    title: "Notificações",
    icon: "notifications-outline",
    description: "Alertas e lembretes automáticos",
  },
  {
    id: "account",
    title: "Conta",
    icon: "person-outline",
    description: "Dados do administrador",
  },
];

function formatRelativeUpdate(timestamp?: number): string {
  if (!timestamp) return "sem registro";

  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "agora";
  if (diff < 3_600_000) return `ha ${Math.max(1, Math.floor(diff / 60_000))} min`;
  if (diff < 86_400_000) return `ha ${Math.max(1, Math.floor(diff / 3_600_000))} h`;
  return new Date(timestamp).toLocaleDateString("pt-BR");
}

export default function MasterSettingsScreen() {
  const { isDesktopMode } = useDesktop();
  const { profile, updateProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [sectionUpdatedAt, setSectionUpdatedAt] = useState<Record<string, number | undefined>>({});

  // Notification settings
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [autoPaymentReminder, setAutoPaymentReminder] = useState(true);
  const [reminderDaysBefore, setReminderDaysBefore] = useState("3");
  const [autoClassReminder, setAutoClassReminder] = useState(true);
  const [savingNotifications, setSavingNotifications] = useState(false);

  // Account settings
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountPhone, setAccountPhone] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);

  const loadSettings = useCallback(async () => {
    let loadedSuccessfully = false;

    try {
      const notificationsSnap = await getDoc(doc(db, "settings", "notifications"));

      const notificationsData = (notificationsSnap.exists() ? notificationsSnap.data() : {}) as StoredNotificationsSettings;
      setAutoPaymentReminder(notificationsData.autoPaymentReminder ?? true);
      setReminderDaysBefore(String(notificationsData.reminderDaysBefore ?? 3));
      setAutoClassReminder(notificationsData.autoClassReminder ?? true);
      if (profile) {
        setAccountName(profile.name || "");
        setAccountPhone(profile.phone || "");
      }
      setSectionUpdatedAt(prev => ({
        ...prev,
        notifications: notificationsData.updatedAt,
      }));
      loadedSuccessfully = true;
    } catch (error) {
      console.error("Erro ao carregar configuracoes:", error);
      setFeedback({
        tone: "error",
        title: "Falha ao carregar",
        message: "Nao foi possivel buscar as configuracoes do administrador.",
        sectionId: "refresh",
      });
    } finally {
      setLoading(false);
    }

    return loadedSuccessfully;
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    setFeedback({
      tone: "loading",
      title: "Atualizando configuracoes",
      message: "Buscando os dados mais recentes da conta de administrador.",
      sectionId: "refresh",
    });

    try {
      const loadedSuccessfully = await loadSettings();
      if (loadedSuccessfully) {
        setFeedback({
          tone: "success",
          title: "Configuracoes atualizadas",
          message: "Os dados do administrador foram recarregados com sucesso.",
          sectionId: "refresh",
        });
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleOpenSection = (sectionId: string) => {
    setActiveSection(sectionId);

    const section = SETTINGS_SECTIONS.find(item => item.id === sectionId);
    if (section) {
      setFeedback({
        tone: "info",
        title: `${section.title} aberto`,
        message: `Voce esta ajustando ${section.title.toLowerCase()} da conta de administrador.`,
        sectionId,
      });
    }

    switch (sectionId) {
      case "notifications":
        setShowNotificationsModal(true);
        break;
      case "account":
        setAccountName(profile?.name || "");
        setAccountPhone(profile?.phone || "");
        setShowAccountModal(true);
        break;
    }
  };

  const handleSaveNotificationSettings = async () => {
    setSavingNotifications(true);
    setFeedback({
      tone: "loading",
      title: "Salvando notificacoes",
      message: "Atualizando os lembretes automaticos da conta de administrador.",
      sectionId: "notifications",
    });

    try {
      const nextUpdatedAt = Date.now();
      await setDoc(
        doc(db, "settings", "notifications"),
        {
          type: "notifications",
          autoPaymentReminder,
          reminderDaysBefore: parseInt(reminderDaysBefore, 10) || 3,
          autoClassReminder,
          updatedAt: nextUpdatedAt,
          updatedBy: profile?.uid || "",
        },
        { merge: true }
      );

      setSectionUpdatedAt(prev => ({ ...prev, notifications: nextUpdatedAt }));
      setShowNotificationsModal(false);
      setFeedback({
        tone: "success",
        title: "Notificacoes atualizadas",
        message: "As preferencias de lembrete do administrador foram salvas.",
        sectionId: "notifications",
      });
      showSuccess("Sucesso", "Configuracoes de notificacoes salvas!");
    } catch (error: any) {
      setFeedback({
        tone: "error",
        title: "Erro ao salvar notificacoes",
        message: error.message || "Nao foi possivel salvar as preferencias de lembrete.",
        sectionId: "notifications",
      });
      showError("Erro", error.message || "Nao foi possivel salvar as configuracoes de notificacoes");
    } finally {
      setSavingNotifications(false);
    }
  };

  const handleSaveAccountSettings = async () => {
    if (!accountName.trim()) {
      setFeedback({
        tone: "error",
        title: "Nome obrigatorio",
        message: "Informe o nome do administrador antes de salvar a conta.",
        sectionId: "account",
      });
      showWarning("Atencao", "Informe seu nome");
      return;
    }

    if (!profile?.uid) {
      setFeedback({
        tone: "error",
        title: "Conta nao encontrada",
        message: "Nao foi possivel identificar o administrador para concluir a atualizacao.",
        sectionId: "account",
      });
      showError("Erro", "Conta do administrador nao encontrada.");
      return;
    }

    setSavingAccount(true);
    setFeedback({
      tone: "loading",
      title: "Salvando conta",
      message: "Atualizando os dados principais da conta de administrador.",
      sectionId: "account",
    });
    try {
      await updateProfile(profile.uid, {
        name: accountName.trim(),
        phone: accountPhone.trim() || undefined,
      });

      const nextUpdatedAt = Date.now();
      setSectionUpdatedAt(prev => ({ ...prev, account: nextUpdatedAt }));
      setShowAccountModal(false);
      setFeedback({
        tone: "success",
        title: "Conta atualizada",
        message: "Os dados do administrador foram salvos com sucesso.",
        sectionId: "account",
      });
      showSuccess("Sucesso", "Dados da conta atualizados!");
    } catch (error: any) {
      setFeedback({
        tone: "error",
        title: "Erro ao salvar a conta",
        message: error.message || "Nao foi possivel salvar os dados do administrador.",
        sectionId: "account",
      });
      showError("Erro", error.message || "Nao foi possivel salvar");
    } finally {
      setSavingAccount(false);
    }
  };

  const getFeedbackVisuals = (tone: FeedbackTone) => {
    switch (tone) {
      case "loading":
        return {
          color: colors.purple,
          backgroundColor: colors.purple + "12",
          icon: "sync-outline" as const,
        };
      case "success":
        return {
          color: colors.green,
          backgroundColor: colors.green + "12",
          icon: "checkmark-circle" as const,
        };
      case "error":
        return {
          color: colors.danger,
          backgroundColor: colors.danger + "12",
          icon: "alert-circle" as const,
        };
      default:
        return {
          color: "#2563EB",
          backgroundColor: "#DBEAFE",
          icon: "information-circle" as const,
        };
    }
  };

  const getSectionStatus = (sectionId: string): SectionStatus => {
    if (feedback?.sectionId === sectionId) {
      switch (feedback.tone) {
        case "loading":
          return { label: "Processando", color: colors.purple, icon: "sync-outline" };
        case "success":
          return { label: "Atualizado", color: colors.green, icon: "checkmark-circle" };
        case "error":
          return { label: "Revisar", color: colors.danger, icon: "alert-circle" };
        default:
          return { label: "Aberto", color: "#2563EB", icon: "eye-outline" };
      }
    }

    if (sectionId === "notifications") {
      return {
        label: sectionUpdatedAt.notifications
          ? `Salvo ${formatRelativeUpdate(sectionUpdatedAt.notifications)}`
          : "Padrao ativo",
        color: colors.green,
        icon: "notifications",
      };
    }

    if (sectionId === "account") {
      return {
        label: sectionUpdatedAt.account ? `Salvo ${formatRelativeUpdate(sectionUpdatedAt.account)}` : "Pronta",
        color: colors.green,
        icon: "person-circle",
      };
    }

    return { label: "Disponível", color: "#64748B", icon: "construct-outline" };
  };

  const feedbackVisuals = feedback ? getFeedbackVisuals(feedback.tone) : null;

  return (
    <View style={[styles.screen, isDesktopMode && desktopStyles.screen]}>
      {!isDesktopMode && <MasterHeader />}
      {!isDesktopMode && <SectionHeader title="Configuracoes" />}

      {/* Notifications Settings Modal */}
      <BaseModal
        visible={showNotificationsModal}
        onClose={() => setShowNotificationsModal(false)}
        title="Notificações"
        icon={<Ionicons name="notifications" size={24} color={colors.purple} />}
        loading={savingNotifications}
        footer={
          <ModalButtons
            primaryLabel="Salvar"
            secondaryLabel="Fechar"
            onPrimaryPress={handleSaveNotificationSettings}
            onSecondaryPress={() => setShowNotificationsModal(false)}
            primaryLoading={savingNotifications}
            primaryIcon="checkmark"
          />
        }
      >
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Lembrete de Pagamento</Text>
            <Text style={styles.settingDescription}>Envia lembrete automático antes do vencimento</Text>
          </View>
          <Switch
            value={autoPaymentReminder}
            onValueChange={setAutoPaymentReminder}
            trackColor={{ false: "#E2E8F0", true: colors.purple + "50" }}
            thumbColor={autoPaymentReminder ? colors.purple : "#94A3B8"}
          />
        </View>

        {autoPaymentReminder && (
          <FormInput
            label="Dias antes do vencimento"
            value={reminderDaysBefore}
            onChangeText={setReminderDaysBefore}
            placeholder="3"
            keyboardType="numeric"
          />
        )}

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>Lembrete de Aula</Text>
            <Text style={styles.settingDescription}>Notifica alunos sobre próximas aulas</Text>
          </View>
          <Switch
            value={autoClassReminder}
            onValueChange={setAutoClassReminder}
            trackColor={{ false: "#E2E8F0", true: colors.purple + "50" }}
            thumbColor={autoClassReminder ? colors.purple : "#94A3B8"}
          />
        </View>
      </BaseModal>

      {/* Account Settings Modal */}
      <BaseModal
        visible={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        title="Dados da Conta"
        icon={<Ionicons name="person" size={24} color={colors.purple} />}
        loading={savingAccount}
        footer={
          <ModalButtons
            primaryLabel="Salvar"
            secondaryLabel="Cancelar"
            onPrimaryPress={handleSaveAccountSettings}
            onSecondaryPress={() => setShowAccountModal(false)}
            primaryLoading={savingAccount}
            primaryIcon="checkmark"
          />
        }
      >
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
      </BaseModal>

      {/* Main Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.purple]} />
        }
      >
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={colors.purple} />
            <Text style={styles.loadingText}>Carregando configurações...</Text>
          </View>
        ) : (
          <>
            {/* Header Card */}
            <View style={styles.headerCard}>
              <View style={styles.headerIcon}>
                <Ionicons name="settings" size={32} color={colors.purple} />
              </View>
              <Text style={styles.headerTitle}>Configurações</Text>
              <Text style={styles.headerSubtitle}>
                Gerencie notificações e dados da sua conta
              </Text>
            </View>

            {feedback && feedbackVisuals && (
              <View
                style={[
                  styles.feedbackCard,
                  {
                    backgroundColor: feedbackVisuals.backgroundColor,
                    borderColor: feedbackVisuals.color + "30",
                  },
                ]}
              >
                <View style={styles.feedbackIconWrap}>
                  {feedback.tone === "loading" ? (
                    <ActivityIndicator size="small" color={feedbackVisuals.color} />
                  ) : (
                    <Ionicons name={feedbackVisuals.icon} size={18} color={feedbackVisuals.color} />
                  )}
                </View>
                <View style={styles.feedbackContent}>
                  <Text style={[styles.feedbackTitle, { color: feedbackVisuals.color }]}>
                    {feedback.title}
                  </Text>
                  <Text style={styles.feedbackMessage}>{feedback.message}</Text>
                </View>
              </View>
            )}

            {/* Settings Sections */}
            <View style={styles.sectionsContainer}>
              {SETTINGS_SECTIONS.map((section) => {
                const sectionStatus = getSectionStatus(section.id);

                return (
                  <Pressable
                    key={section.id}
                    style={[
                      styles.sectionCard,
                      activeSection === section.id && styles.sectionCardActive,
                    ]}
                    onPress={() => handleOpenSection(section.id)}
                  >
                    <View style={[styles.sectionIcon, { backgroundColor: colors.purple + "15" }]}>
                      <Ionicons name={section.icon} size={22} color={colors.purple} />
                    </View>
                    <View style={styles.sectionInfo}>
                      <View style={styles.sectionTitleRow}>
                        <Text style={styles.sectionTitle}>{section.title}</Text>
                        <StatusBadge
                          label={sectionStatus.label}
                          color={sectionStatus.color}
                          icon={sectionStatus.icon}
                          size="small"
                        />
                      </View>
                      <Text style={styles.sectionDescription}>{section.description}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
                  </Pressable>
                );
              })}
            </View>

            {/* Quick Stats */}
            <View style={styles.statsSection}>
              <Text style={styles.statsSectionTitle}>Resumo de Configurações</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Ionicons name="notifications" size={24} color={colors.green} />
                  <Text style={styles.statLabel}>Notificações</Text>
                  <Text style={styles.statValue}>
                    {sectionUpdatedAt.notifications ? "Personalizadas" : "Padrao ativo"}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Ionicons name="person-circle" size={24} color={colors.purple} />
                  <Text style={styles.statLabel}>Conta</Text>
                  <Text style={styles.statValue}>
                    {sectionUpdatedAt.account ? "Atualizada" : "Configurada"}
                  </Text>
                </View>
              </View>
            </View>

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
  screen: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingState: {
    alignItems: "center",
    paddingVertical: 60,
  },
  loadingText: {
    color: "#64748B",
    fontWeight: "600",
    marginTop: 12,
  },

  // Header Card
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
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1E293B",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
  },
  feedbackCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  feedbackIconWrap: {
    width: 28,
    alignItems: "center",
    paddingTop: 2,
  },
  feedbackContent: {
    flex: 1,
  },
  feedbackTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  feedbackMessage: {
    fontSize: 13,
    color: "#475569",
    lineHeight: 18,
  },

  // Sections
  sectionsContainer: {
    gap: 10,
    marginBottom: 24,
  },
  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sectionCardActive: {
    borderColor: colors.purple,
    backgroundColor: colors.purple + "08",
  },
  sectionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  sectionInfo: {
    flex: 1,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
  },
  sectionDescription: {
    fontSize: 13,
    color: "#64748B",
  },

  // Stats
  statsSection: {
    marginBottom: 24,
  },
  statsSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748B",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 8,
  },
  statValue: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
    textAlign: "center",
  },

  // Version
  versionInfo: {
    alignItems: "center",
    paddingVertical: 20,
  },
  versionText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94A3B8",
  },
  versionSubtext: {
    fontSize: 11,
    color: "#CBD5E1",
    marginTop: 2,
  },

  // Modal Styles
  chipGroup: {
    marginBottom: 16,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 8,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipActive: {
    backgroundColor: colors.purple + "15",
    borderColor: colors.purple,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#64748B",
  },
  chipTextActive: {
    color: colors.purple,
    fontWeight: "600",
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.purple + "10",
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: colors.purple,
    lineHeight: 18,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 12,
    color: "#64748B",
  },
  accountInfo: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  systemAction: {
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  systemActionInfo: {
    gap: 4,
  },
  systemActionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
  },
  systemActionDesc: {
    fontSize: 13,
    color: "#64748B",
    lineHeight: 18,
  },
  systemActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#EA580C",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  systemActionBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
});

const desktopStyles = StyleSheet.create({
  screen: {
    backgroundColor: "#F8FAFC",
  },
});


