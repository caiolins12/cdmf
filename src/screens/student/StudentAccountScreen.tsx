import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Image, Modal, ScrollView, TextInput, Platform } from "react-native";
import { showAlert, showConfirm, showMessage } from "../../utils/alert";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import CdmfHeader from "../../components/CdmfHeader";
import StudentHeader from "../../components/StudentHeader";
import OnboardingSurveyModal from "../../components/OnboardingSurveyModal";
import { colors } from "../../theme/colors";
import { useAuth } from "../../contexts/AuthContext";
import { useGoogleSignIn, GoogleUser } from "../../services/googleSignIn";
import { useDesktop } from "../../contexts/DesktopContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useActivity } from "../../contexts/ActivityContext";

// Opções de gênero
const GENDER_OPTIONS = [
  { id: "masculino", label: "Masculino" },
  { id: "feminino", label: "Feminino" },
  { id: "outro", label: "Outro" },
  { id: "prefiro_nao_informar", label: "Prefiro não informar" },
];

// Opções de preferência na dança
const DANCE_PREFERENCE_OPTIONS = [
  { id: "condutor", label: "Condutor(a)" },
  { id: "conduzido", label: "Conduzido(a)" },
  { id: "ambos", label: "Ambos" },
];

export default function StudentAccountScreen() {
  const { user, profile, signOut, updateProfile, refreshProfile } = useAuth();
  const { signOut: googleSignOut, switchAccount, getCurrentUser } = useGoogleSignIn();
  const { isDesktopMode } = useDesktop();
  const { colors: themeColors, isDark } = useTheme();
  const { logActivity } = useActivity();
  
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [showPersonalDataModal, setShowPersonalDataModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingField, setEditingField] = useState<string>("");
  const [editValue, setEditValue] = useState("");
  const [personalDataKey, setPersonalDataKey] = useState(0); // Força re-render
  
  // Força atualização quando abre o modal de dados pessoais
  const openPersonalDataModal = async () => {
    await refreshProfile?.();
    setPersonalDataKey(prev => prev + 1); // Força re-render
    setShowPersonalDataModal(true);
  };

  // Verifica se está logado com Google
  const isGoogleUser = user?.providerData?.some(p => p.providerId === "google.com");

  // Atualiza perfil quando a tela recebe foco
  useFocusEffect(
    useCallback(() => {
      refreshProfile?.();
    }, [refreshProfile])
  );

  useEffect(() => {
    if (isGoogleUser) {
      loadGoogleUser();
    }
  }, [isGoogleUser]);

  async function loadGoogleUser() {
    const gUser = await getCurrentUser();
    setGoogleUser(gUser);
  }

  // Dados do usuário
  const displayName = profile?.name || user?.displayName || "Usuário";
  const displayEmail = profile?.email || user?.email || "";
  const displayPhone = profile?.phone || user?.phoneNumber || "";
  const photoURL = user?.photoURL || googleUser?.photo;

  // Obter labels
  const getGenderLabel = (id: string) => GENDER_OPTIONS.find(g => g.id === id)?.label || "";
  const getDancePreferenceLabel = (id: string) => DANCE_PREFERENCE_OPTIONS.find(d => d.id === id)?.label || "";

  // Handler para completar onboarding/edição
  const handleOnboardingComplete = async (data: {
    phone: string;
    phoneVerified: boolean;
    birthDate?: string;
    age?: number;
    gender?: string;
    dancePreference?: string;
  }) => {
    if (!profile?.uid) return;

    try {
      await updateProfile(profile.uid, {
        ...data,
        onboardingCompleted: true,
      });
      
      await refreshProfile?.();
      setShowOnboarding(false);
      showMessage("Dados atualizados! ✅", "Suas informações foram salvas com sucesso.");
    } catch (error) {
      throw error;
    }
  };

  // Abrir modal de edição individual
  const openEditModal = (field: string, currentValue: string = "") => {
    setEditingField(field);
    setEditValue(currentValue);
    setShowEditModal(true);
  };

  // Salvar edição individual
  const handleSaveEdit = async () => {
    if (!profile?.uid) return;

    try {
      let updateData: Partial<Profile> = {};

      switch (editingField) {
        case "phone":
          if (editValue.replace(/\D/g, "").length < 10) {
            showMessage("Telefone inválido", "Telefone deve ter pelo menos 10 dígitos.");
            return;
          }
          updateData = {
            phone: editValue,
            phoneVerified: false, // Remove verificação ao alterar telefone
          };
          break;

        case "birthDate":
          if (editValue && editValue.length !== 10) {
            showMessage("Data inválida", "Formato: DD/MM/AAAA");
            return;
          }
          // Calcular idade
          let age: number | undefined;
          if (editValue) {
            const parts = editValue.split("/");
            if (parts.length === 3) {
              const day = parseInt(parts[0], 10);
              const month = parseInt(parts[1], 10) - 1;
              const year = parseInt(parts[2], 10);
              if (day && month >= 0 && year) {
                const birth = new Date(year, month, day);
                const today = new Date();
                let calculatedAge = today.getFullYear() - birth.getFullYear();
                const monthDiff = today.getMonth() - birth.getMonth();
                if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
                  calculatedAge--;
                }
                age = calculatedAge >= 0 && calculatedAge < 120 ? calculatedAge : undefined;
              }
            }
          }
          updateData = { birthDate: editValue || undefined, age };
          break;

        case "gender":
          updateData = { gender: editValue || undefined };
          break;

        case "dancePreference":
          updateData = { dancePreference: editValue || undefined };
          break;
      }

      await updateProfile(profile.uid, updateData);
      await refreshProfile?.();
      setShowEditModal(false);
      showMessage("Salvo!", "Dados atualizados com sucesso.");
      
      // Registra atividade de atualização de perfil
      const fieldLabels: Record<string, string> = {
        phone: "telefone",
        birthDate: "data de nascimento",
        gender: "gênero",
        dancePreference: "preferência de dança",
      };
      try {
        await logActivity({
          type: "student_profile_updated",
          title: "Aluno atualizou perfil",
          description: `${profile.name} atualizou ${fieldLabels[editField] || editField}`,
          metadata: {
            studentId: profile.uid,
            studentName: profile.name,
          },
        });
      } catch (e) {
        // Silencioso - não bloqueia a atualização do perfil
      }
    } catch (error) {
      showMessage("Erro", "Não foi possível salvar. Tente novamente.");
    }
  };

  async function handleSignOut() {
    showConfirm("Sair da conta", "Tem certeza que deseja sair?", async () => {
      setLoading(true);
      try {
        if (isGoogleUser) await googleSignOut();
        else await signOut();
      } catch (error) {
        showMessage("Erro", "Não foi possível sair. Tente novamente.");
      } finally {
        setLoading(false);
      }
    });
  }

  async function handleSwitchAccount() {
    setShowOptionsModal(false);
    showConfirm("Trocar conta Google", "Você será desconectado e poderá selecionar outra conta.", async () => {
      setLoading(true);
      try {
        const success = await switchAccount();
        if (success) showMessage("Sucesso", "Conta trocada com sucesso!");
      } catch (error: any) {
        if (error?.code !== "SIGN_IN_CANCELLED") {
          showMessage("Erro", "Não foi possível trocar de conta.");
        }
      } finally {
        setLoading(false);
      }
    });
  }

  // Desktop Layout
  if (isDesktopMode) {
    return (
      <View style={[desktopStyles.screen, { backgroundColor: themeColors.bg }]}>
        {/* Modals */}
        <Modal visible={loading} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.loadingModal, { backgroundColor: themeColors.bgCard }]}>
              <ActivityIndicator size="large" color={themeColors.purple} />
              <Text style={[styles.loadingText, { color: themeColors.text }]}>Aguarde...</Text>
            </View>
          </View>
        </Modal>

        <OnboardingSurveyModal
          visible={showOnboarding}
          onComplete={handleOnboardingComplete}
          initialData={{
            phone: profile?.phone,
            birthDate: profile?.birthDate,
            gender: profile?.gender,
            dancePreference: profile?.dancePreference,
            phoneVerified: profile?.phoneVerified,
          }}
          isEditing={true}
        />

        {showPersonalDataModal && (
          <Modal visible={true} transparent animationType="slide">
            <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 }}>
              <View style={{ backgroundColor: themeColors.bgCard, borderRadius: 20, padding: 20, width: "100%", maxWidth: 480, maxHeight: "90%" }}>
                {/* Header */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: themeColors.text }}>Dados Pessoais</Text>
                  <Pressable onPress={() => setShowPersonalDataModal(false)} hitSlop={10}>
                    <Ionicons name="close" size={24} color={themeColors.textMuted} />
                  </Pressable>
                </View>

                <ScrollView showsVerticalScrollIndicator={true}>
                  {/* Foto e Nome */}
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20, gap: 12 }}>
                    {photoURL ? (
                      <Image source={{ uri: photoURL }} style={{ width: 56, height: 56, borderRadius: 28 }} />
                    ) : (
                      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: themeColors.bgSecondary, justifyContent: "center", alignItems: "center" }}>
                        <Ionicons name="person" size={28} color={themeColors.textMuted} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: themeColors.text }}>{displayName}</Text>
                      <Text style={{ fontSize: 13, color: themeColors.textMuted }}>{displayEmail}</Text>
                    </View>
                  </View>

                  {/* Contato */}
                  <View style={{ marginBottom: 20 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: themeColors.textMuted, textTransform: "uppercase", marginBottom: 10 }}>Contato</Text>
                    
                    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: themeColors.border, gap: 12 }}>
                      <Ionicons name="mail" size={18} color={themeColors.purple} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, color: themeColors.textMuted }}>E-mail</Text>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: themeColors.text }}>{displayEmail || "Não informado"}</Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: themeColors.border, gap: 12 }}>
                      <Ionicons name="call" size={18} color={themeColors.purple} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, color: themeColors.textMuted }}>Telefone</Text>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: themeColors.text }}>{profile?.phone || "Não informado"}</Text>
                      </View>
                      {profile?.phoneVerified && (
                        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#2E7D32", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, gap: 4 }}>
                          <Ionicons name="checkmark" size={10} color="#fff" />
                          <Text style={{ fontSize: 10, fontWeight: "600", color: "#fff" }}>Verificado</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Informações Pessoais */}
                  <View style={{ marginBottom: 20 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: themeColors.textMuted, textTransform: "uppercase", marginBottom: 10 }}>Informações Pessoais</Text>
                    
                    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: themeColors.border, gap: 12 }}>
                      <Ionicons name="calendar" size={18} color={themeColors.purple} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, color: themeColors.textMuted }}>Data de Nascimento</Text>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: themeColors.text }}>{profile?.birthDate || "Não informado"}</Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: themeColors.border, gap: 12 }}>
                      <Ionicons name="person" size={18} color={themeColors.purple} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, color: themeColors.textMuted }}>Gênero</Text>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: themeColors.text }}>{profile?.gender ? getGenderLabel(profile.gender) : "Não informado"}</Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: themeColors.border, gap: 12 }}>
                      <FontAwesome5 name="walking" size={16} color={themeColors.purple} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, color: themeColors.textMuted }}>Preferência na Dança</Text>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: themeColors.text }}>{profile?.dancePreference ? getDancePreferenceLabel(profile.dancePreference) : "Não informado"}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Identificação */}
                  <View style={{ marginBottom: 20 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: themeColors.textMuted, textTransform: "uppercase", marginBottom: 10 }}>Identificação</Text>
                    
                    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 }}>
                      <Ionicons name="id-card" size={18} color={themeColors.purple} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, color: themeColors.textMuted }}>Código do Aluno</Text>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: themeColors.text }}>{profile?.uid?.slice(0, 8).toUpperCase() || "N/A"}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Botão Editar */}
                  <Pressable
                    style={{ backgroundColor: themeColors.purple, paddingVertical: 14, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
                    onPress={() => { setShowPersonalDataModal(false); setShowOnboarding(true); }}
                  >
                    <Ionicons name="create-outline" size={18} color="#fff" />
                    <Text style={{ fontSize: 15, fontWeight: "700", color: "#fff" }}>Alterar Dados Cadastrais</Text>
                  </Pressable>
                </ScrollView>

                {/* Botão Fechar */}
                <Pressable 
                  style={{ backgroundColor: themeColors.bgSecondary, paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 12 }}
                  onPress={() => setShowPersonalDataModal(false)}
                >
                  <Text style={{ fontSize: 15, fontWeight: "700", color: themeColors.textSecondary }}>Fechar</Text>
                </Pressable>
              </View>
            </View>
          </Modal>
        )}

        <ScrollView contentContainerStyle={desktopStyles.content} showsVerticalScrollIndicator={false}>
          <View style={[desktopStyles.dashboardContainer, { backgroundColor: themeColors.bg }]}>
            {/* Profile Card */}
            <View style={desktopStyles.profileSection}>
              <View style={[desktopStyles.profileCard, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
                <View style={desktopStyles.profileHeader}>
                  {photoURL ? (
                    <Image source={{ uri: photoURL }} style={desktopStyles.profilePhoto} />
                  ) : (
                    <View style={[desktopStyles.profilePhotoPlaceholder, { backgroundColor: themeColors.bgSecondary }]}>
                      <Ionicons name="person" size={40} color={themeColors.textMuted} />
                    </View>
                  )}
                  <View style={desktopStyles.profileInfo}>
                    <Text style={[desktopStyles.profileName, { color: themeColors.text }]}>{displayName}</Text>
                    <Text style={[desktopStyles.profileEmail, { color: themeColors.textMuted }]}>{displayEmail}</Text>
                    <View style={[desktopStyles.profileBadge, { backgroundColor: isDark ? themeColors.purpleLight : "#F3E8FF" }]}>
                      <Ionicons name={isGoogleUser ? "logo-google" : "mail"} size={12} color={themeColors.purple} />
                      <Text style={[desktopStyles.profileBadgeText, { color: themeColors.purple }]}>
                        {isGoogleUser ? "Google" : "Email"}
                      </Text>
                    </View>
                  </View>
                  <View style={[desktopStyles.profileCode, { backgroundColor: themeColors.bgSecondary, borderColor: themeColors.border }]}>
                    <Text style={[desktopStyles.profileCodeLabel, { color: themeColors.textMuted }]}>Código</Text>
                    <Text style={[desktopStyles.profileCodeValue, { color: themeColors.text }]}>
                      {profile?.uid?.slice(0, 8).toUpperCase() || "N/A"}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Quick Info Cards */}
              <View style={desktopStyles.infoCardsRow}>
                <View style={[desktopStyles.infoCard, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
                  <View style={[desktopStyles.infoCardIcon, { backgroundColor: isDark ? "#14532D" : "#DCFCE7" }]}>
                    <Ionicons name="call" size={20} color="#16A34A" />
                  </View>
                  <View style={desktopStyles.infoCardContent}>
                    <Text style={[desktopStyles.infoCardLabel, { color: themeColors.textMuted }]}>Telefone</Text>
                    <Text style={[desktopStyles.infoCardValue, { color: themeColors.text }]}>
                      {profile?.phone || "Não informado"}
                    </Text>
                  </View>
                  {profile?.phoneVerified && (
                    <View style={desktopStyles.verifiedBadge}>
                      <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                    </View>
                  )}
                </View>

                <View style={[desktopStyles.infoCard, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
                  <View style={[desktopStyles.infoCardIcon, { backgroundColor: isDark ? "#713F12" : "#FEF3C7" }]}>
                    <Ionicons name="calendar" size={20} color="#D97706" />
                  </View>
                  <View style={desktopStyles.infoCardContent}>
                    <Text style={[desktopStyles.infoCardLabel, { color: themeColors.textMuted }]}>Nascimento</Text>
                    <Text style={[desktopStyles.infoCardValue, { color: themeColors.text }]}>
                      {profile?.birthDate || "Não informado"}
                    </Text>
                  </View>
                </View>

                <View style={[desktopStyles.infoCard, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
                  <View style={[desktopStyles.infoCardIcon, { backgroundColor: isDark ? "#1E3A5F" : "#E0E7FF" }]}>
                    <FontAwesome5 name="walking" size={18} color="#4F46E5" />
                  </View>
                  <View style={desktopStyles.infoCardContent}>
                    <Text style={[desktopStyles.infoCardLabel, { color: themeColors.textMuted }]}>Preferência</Text>
                    <Text style={[desktopStyles.infoCardValue, { color: themeColors.text }]}>
                      {profile?.dancePreference ? getDancePreferenceLabel(profile.dancePreference) : "Não informado"}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Actions Grid */}
            <View style={desktopStyles.actionsSection}>
              <Text style={[desktopStyles.sectionTitle, { color: themeColors.textMuted }]}>Configurações</Text>
              <View style={desktopStyles.actionsGrid}>
                <Pressable style={[desktopStyles.actionCard, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]} onPress={openPersonalDataModal}>
                  <View style={[desktopStyles.actionIconBox, { backgroundColor: isDark ? themeColors.purpleLight : "#F3E8FF" }]}>
                    <Ionicons name="person-circle" size={24} color={themeColors.purple} />
                  </View>
                  <Text style={[desktopStyles.actionTitle, { color: themeColors.text }]}>Dados Pessoais</Text>
                  <Text style={[desktopStyles.actionDescription, { color: themeColors.textMuted }]}>
                    Editar informações do perfil
                  </Text>
                </Pressable>

                <Pressable style={[desktopStyles.actionCard, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
                  <View style={[desktopStyles.actionIconBox, { backgroundColor: isDark ? "#1E3A5F" : "#E0E7FF" }]}>
                    <Ionicons name="document-text" size={24} color="#4F46E5" />
                  </View>
                  <Text style={[desktopStyles.actionTitle, { color: themeColors.text }]}>Privacidade</Text>
                  <Text style={[desktopStyles.actionDescription, { color: themeColors.textMuted }]}>
                    Políticas e termos de uso
                  </Text>
                </Pressable>

                {isGoogleUser && (
                  <Pressable style={[desktopStyles.actionCard, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]} onPress={() => setShowOptionsModal(true)}>
                    <View style={[desktopStyles.actionIconBox, { backgroundColor: isDark ? "#7F1D1D" : "#FEE2E2" }]}>
                      <Ionicons name="settings" size={24} color="#DC2626" />
                    </View>
                    <Text style={[desktopStyles.actionTitle, { color: themeColors.text }]}>Conta Google</Text>
                    <Text style={[desktopStyles.actionDescription, { color: themeColors.textMuted }]}>
                      Trocar ou desconectar conta
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* Footer */}
            <View style={[desktopStyles.footerSection, { borderTopColor: themeColors.border }]}>
              <Text style={[desktopStyles.versionText, { color: themeColors.textMuted }]}>Versão do APP: v1.0.0</Text>
              <Pressable style={[desktopStyles.signOutButton, { backgroundColor: isDark ? "#450A0A" : "#FEF2F2", borderColor: themeColors.danger }]} onPress={handleSignOut}>
                <Ionicons name="log-out-outline" size={18} color={themeColors.danger} />
                <Text style={[desktopStyles.signOutText, { color: themeColors.danger }]}>Sair da Conta</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>

        {/* Google Options Modal */}
        <Modal visible={showOptionsModal} transparent animationType="fade">
          <Pressable style={styles.modalOverlay} onPress={() => setShowOptionsModal(false)}>
            <View style={[styles.optionsModal, { backgroundColor: themeColors.bgCard }]}>
              <Text style={[styles.optionsTitle, { color: themeColors.text }]}>Opções da Conta</Text>
              <View style={[styles.currentAccountInfo, { backgroundColor: themeColors.bgSecondary }]}>
                {photoURL && <Image source={{ uri: photoURL }} style={styles.optionsPhoto} />}
                <View style={styles.optionsAccountText}>
                  <Text style={[styles.optionsName, { color: themeColors.text }]}>{displayName}</Text>
                  <Text style={[styles.optionsEmail, { color: themeColors.textMuted }]}>{displayEmail}</Text>
                </View>
              </View>
              <Pressable style={[styles.optionButton, { backgroundColor: themeColors.bgSecondary, borderBottomColor: themeColors.border }]} onPress={handleSwitchAccount}>
                <Ionicons name="swap-horizontal" size={24} color={themeColors.purple} />
                <Text style={[styles.optionButtonText, { color: themeColors.text }]}>Trocar conta Google</Text>
              </Pressable>
              <Pressable style={[styles.optionButton, { backgroundColor: isDark ? "#450A0A" : "#FEF2F2", borderBottomColor: themeColors.border }]} onPress={() => {
                setShowOptionsModal(false);
                handleSignOut();
              }}>
                <Ionicons name="log-out-outline" size={24} color={themeColors.danger} />
                <Text style={[styles.optionButtonText, styles.optionButtonTextDanger, { color: themeColors.danger }]}>Sair da conta</Text>
              </Pressable>
              <Pressable style={[styles.cancelButton, { backgroundColor: themeColors.bgSecondary }]} onPress={() => setShowOptionsModal(false)}>
                <Text style={[styles.cancelButtonText, { color: themeColors.textSecondary }]}>Cancelar</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      </View>
    );
  }

  // Mobile Layout
  return (
    <View style={styles.screen}>
      <StudentHeader />

      {/* Modal de Loading */}
      <Modal visible={loading} transparent animationType="fade">
        <View style={[styles.modalOverlay, { backgroundColor: isDark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.5)" }]}>
          <View style={[styles.loadingModal, { backgroundColor: themeColors.bgCard }]}>
            <ActivityIndicator size="large" color={themeColors.purple} />
            <Text style={[styles.loadingText, { color: themeColors.text }]}>Aguarde...</Text>
          </View>
        </View>
      </Modal>

      {/* Modal de Onboarding/Edição */}
      <OnboardingSurveyModal
        visible={showOnboarding}
        onComplete={handleOnboardingComplete}
        initialData={{
          phone: profile?.phone,
          birthDate: profile?.birthDate,
          gender: profile?.gender,
          dancePreference: profile?.dancePreference,
          phoneVerified: profile?.phoneVerified,
        }}
        isEditing={true}
      />

      {/* Modal de Dados Pessoais */}
      {showPersonalDataModal && (
        <Modal visible={true} transparent animationType="slide">
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 }}>
            <View style={{ backgroundColor: themeColors.bgCard, borderRadius: 20, padding: 20, width: "100%", maxWidth: 400, maxHeight: "90%" }}>
              {/* Header */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <Text style={{ fontSize: 20, fontWeight: "800", color: themeColors.text }}>Dados Pessoais</Text>
                <Pressable onPress={() => setShowPersonalDataModal(false)} hitSlop={10}>
                  <Ionicons name="close" size={24} color={themeColors.textMuted} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={true}>
                {/* Foto e Nome */}
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20, gap: 12 }}>
                  {photoURL ? (
                    <Image source={{ uri: photoURL }} style={{ width: 56, height: 56, borderRadius: 28 }} />
                  ) : (
                    <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: themeColors.bgSecondary, justifyContent: "center", alignItems: "center" }}>
                      <Ionicons name="person" size={28} color={themeColors.textMuted} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: themeColors.text }}>{displayName}</Text>
                    <Text style={{ fontSize: 13, color: themeColors.textMuted }}>{displayEmail}</Text>
                  </View>
                </View>

                {/* Contato */}
                <View style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: themeColors.textMuted, textTransform: "uppercase" }}>Contato</Text>
                    <Pressable onPress={() => { setShowPersonalDataModal(false); setShowOnboarding(true); }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: themeColors.purple }}>Editar</Text>
                    </Pressable>
                  </View>
                  
                  <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: themeColors.border, gap: 12 }}>
                    <Ionicons name="mail" size={18} color={themeColors.purple} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: themeColors.textMuted }}>E-mail</Text>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: themeColors.text }}>{displayEmail || "Não informado"}</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: themeColors.border, gap: 12 }}>
                    <Ionicons name="call" size={18} color={themeColors.purple} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: themeColors.textMuted }}>Telefone</Text>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: themeColors.text }}>{profile?.phone || "Não informado"}</Text>
                    </View>
                    <Pressable onPress={() => openEditModal("phone", profile?.phone || "")}>
                      <Ionicons name="pencil" size={16} color={themeColors.purple} />
                    </Pressable>
                    {profile?.phoneVerified && (
                      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#2E7D32", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, gap: 4 }}>
                        <Ionicons name="checkmark" size={10} color="#fff" />
                        <Text style={{ fontSize: 10, fontWeight: "600", color: "#fff" }}>Verificado</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Informações Pessoais */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: themeColors.textMuted, textTransform: "uppercase", marginBottom: 10 }}>Informações Pessoais</Text>
                  
                  <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: themeColors.border, gap: 12 }}>
                    <Ionicons name="calendar" size={18} color={themeColors.purple} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: themeColors.textMuted }}>Data de Nascimento</Text>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: themeColors.text }}>{profile?.birthDate || "Não informado"}</Text>
                    </View>
                    <Pressable onPress={() => openEditModal("birthDate", profile?.birthDate || "")}>
                      <Ionicons name="pencil" size={16} color={themeColors.purple} />
                    </Pressable>
                  </View>

                  <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: themeColors.border, gap: 12 }}>
                    <Ionicons name="person" size={18} color={themeColors.purple} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: themeColors.textMuted }}>Gênero</Text>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: themeColors.text }}>{profile?.gender ? getGenderLabel(profile.gender) : "Não informado"}</Text>
                    </View>
                    <Pressable onPress={() => openEditModal("gender", profile?.gender || "")}>
                      <Ionicons name="pencil" size={16} color={themeColors.purple} />
                    </Pressable>
                  </View>

                  <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: themeColors.border, gap: 12 }}>
                    <FontAwesome5 name="walking" size={16} color={themeColors.purple} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: themeColors.textMuted }}>Preferência na Dança</Text>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: themeColors.text }}>{profile?.dancePreference ? getDancePreferenceLabel(profile.dancePreference) : "Não informado"}</Text>
                    </View>
                    <Pressable onPress={() => openEditModal("dancePreference", profile?.dancePreference || "")}>
                      <Ionicons name="pencil" size={16} color={themeColors.purple} />
                    </Pressable>
                  </View>
                </View>

                {/* Identificação */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: themeColors.textMuted, textTransform: "uppercase", marginBottom: 10 }}>Identificação</Text>
                  
                  <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 }}>
                    <Ionicons name="id-card" size={18} color={themeColors.purple} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: themeColors.textMuted }}>Código do Aluno</Text>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: themeColors.text }}>{profile?.uid?.slice(0, 8).toUpperCase() || "N/A"}</Text>
                    </View>
                  </View>
                </View>

                {/* Botão Editar */}
                <Pressable
                  style={{ backgroundColor: themeColors.purple, paddingVertical: 14, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
                  onPress={() => { setShowPersonalDataModal(false); setShowOnboarding(true); }}
                >
                  <Ionicons name="create-outline" size={18} color="#fff" />
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#fff" }}>Alterar Dados Cadastrais</Text>
                </Pressable>
              </ScrollView>

              {/* Botão Fechar */}
              <Pressable 
                style={{ backgroundColor: themeColors.bgSecondary, paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 12 }}
                onPress={() => setShowPersonalDataModal(false)}
              >
                <Text style={{ fontSize: 15, fontWeight: "700", color: themeColors.textSecondary }}>Fechar</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}

      {/* Modal de Edição Individual */}
      {showEditModal && (
        <Modal visible={true} transparent animationType="fade">
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 }}>
            <View style={{ backgroundColor: themeColors.bgCard, borderRadius: 20, padding: 20, width: "100%", maxWidth: 400 }}>
              {/* Header */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: themeColors.text }}>
                  {editingField === "phone" && "Editar Telefone"}
                  {editingField === "birthDate" && "Editar Data de Nascimento"}
                  {editingField === "gender" && "Editar Gênero"}
                  {editingField === "dancePreference" && "Editar Preferência na Dança"}
                </Text>
                <Pressable onPress={() => setShowEditModal(false)} hitSlop={10}>
                  <Ionicons name="close" size={20} color={themeColors.textMuted} />
                </Pressable>
              </View>

              {/* Campo de edição */}
              {editingField === "phone" && (
                <>
                  <Text style={{ fontSize: 14, color: themeColors.textMuted, marginBottom: 12 }}>
                    Digite seu telefone com DDD (ex: (11) 99999-9999)
                  </Text>
                  <TextInput
                    id="edit-phone"
                    name="edit-phone"
                    style={{
                      borderWidth: 1,
                      borderColor: "#ddd",
                      borderRadius: 12,
                      padding: 14,
                      fontSize: 16,
                      marginBottom: 8,
                      backgroundColor: "#f9f9f9",
                    }}
                    placeholder="(00) 00000-0000"
                    value={editValue}
                    onChangeText={(text) => {
                      const formatted = text.replace(/\D/g, "");
                      let phone = "";
                      if (formatted.length <= 2) phone = formatted;
                      else if (formatted.length <= 7) phone = `(${formatted.slice(0, 2)}) ${formatted.slice(2)}`;
                      else if (formatted.length <= 11) phone = `(${formatted.slice(0, 2)}) ${formatted.slice(2, 7)}-${formatted.slice(7)}`;
                      else phone = `(${formatted.slice(0, 2)}) ${formatted.slice(2, 7)}-${formatted.slice(7, 11)}`;
                      setEditValue(phone);
                    }}
                    keyboardType="phone-pad"
                    maxLength={15}
                    autoComplete="tel"
                  />
                </>
              )}

              {editingField === "birthDate" && (
                <>
                  <Text style={{ fontSize: 14, color: "#666", marginBottom: 12 }}>
                    Digite sua data de nascimento (DD/MM/AAAA)
                  </Text>
                  <TextInput
                    id="edit-birthdate"
                    name="edit-birthdate"
                    style={{
                      borderWidth: 1,
                      borderColor: "#ddd",
                      borderRadius: 12,
                      padding: 14,
                      fontSize: 16,
                      marginBottom: 8,
                      backgroundColor: "#f9f9f9",
                    }}
                    placeholder="DD/MM/AAAA"
                    value={editValue}
                    onChangeText={(text) => {
                      const formatted = text.replace(/\D/g, "");
                      let date = "";
                      if (formatted.length <= 2) date = formatted;
                      else if (formatted.length <= 4) date = `${formatted.slice(0, 2)}/${formatted.slice(2)}`;
                      else date = `${formatted.slice(0, 2)}/${formatted.slice(2, 4)}/${formatted.slice(4, 8)}`;
                      setEditValue(date);
                    }}
                    keyboardType="number-pad"
                    maxLength={10}
                    autoComplete="bday"
                  />
                </>
              )}

              {editingField === "gender" && (
                <>
                  <Text style={{ fontSize: 14, color: "#666", marginBottom: 12 }}>
                    Selecione sua identificação de gênero
                  </Text>
                  <View style={{ gap: 8 }}>
                    {GENDER_OPTIONS.map((option) => (
                      <Pressable
                        key={option.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          padding: 14,
                          borderWidth: 1,
                          borderColor: editValue === option.id ? colors.purple : "#ddd",
                          borderRadius: 12,
                          backgroundColor: editValue === option.id ? "#f0e6f6" : "#f9f9f9",
                          gap: 12,
                        }}
                        onPress={() => setEditValue(option.id)}
                      >
                        <Ionicons
                          name={option.icon as any}
                          size={20}
                          color={editValue === option.id ? colors.purple : "#666"}
                        />
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "600",
                            color: editValue === option.id ? colors.purple : "#111",
                          }}
                        >
                          {option.label}
                        </Text>
                        {editValue === option.id && (
                          <View style={{ marginLeft: "auto" }}>
                            <Ionicons name="checkmark" size={20} color={colors.purple} />
                          </View>
                        )}
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              {editingField === "dancePreference" && (
                <>
                  <Text style={{ fontSize: 14, color: "#666", marginBottom: 12 }}>
                    Selecione sua preferência na dança
                  </Text>
                  <View style={{ gap: 8 }}>
                    {DANCE_PREFERENCE_OPTIONS.map((option) => (
                      <Pressable
                        key={option.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          padding: 14,
                          borderWidth: 1,
                          borderColor: editValue === option.id ? colors.purple : "#ddd",
                          borderRadius: 12,
                          backgroundColor: editValue === option.id ? "#f0e6f6" : "#f9f9f9",
                          gap: 12,
                        }}
                        onPress={() => setEditValue(option.id)}
                      >
                        <Ionicons
                          name={option.icon as any}
                          size={20}
                          color={editValue === option.id ? colors.purple : "#666"}
                        />
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: "600",
                            color: editValue === option.id ? colors.purple : "#111",
                          }}
                        >
                          {option.label}
                        </Text>
                        <Text
                          style={{
                            fontSize: 13,
                            color: editValue === option.id ? colors.purple : "#666",
                            flex: 1,
                          }}
                        >
                          {option.description}
                        </Text>
                        {editValue === option.id && (
                          <Ionicons name="checkmark" size={20} color={colors.purple} />
                        )}
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              {/* Botões */}
              <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
                <Pressable
                  style={{
                    flex: 1,
                    backgroundColor: "#E0E0E0",
                    paddingVertical: 12,
                    borderRadius: 12,
                    alignItems: "center",
                  }}
                  onPress={() => setShowEditModal(false)}
                >
                  <Text style={{ fontSize: 15, fontWeight: "600", color: "#555" }}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={{
                    flex: 1,
                    backgroundColor: colors.purple,
                    paddingVertical: 12,
                    borderRadius: 12,
                    alignItems: "center",
                  }}
                  onPress={handleSaveEdit}
                >
                  <Text style={{ fontSize: 15, fontWeight: "600", color: "#fff" }}>Salvar</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Modal de Opções da Conta Google */}
      <Modal visible={showOptionsModal} transparent animationType="fade">
        <Pressable style={[styles.modalOverlay, { backgroundColor: isDark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.5)" }]} onPress={() => setShowOptionsModal(false)}>
          <View style={[styles.optionsModal, { backgroundColor: themeColors.bgCard }]}>
            <Text style={[styles.optionsTitle, { color: themeColors.text }]}>Opções da Conta</Text>
            
            <View style={[styles.currentAccountInfo, { backgroundColor: themeColors.bgSecondary }]}>
              {photoURL && <Image source={{ uri: photoURL }} style={styles.optionsPhoto} />}
              <View style={styles.optionsAccountText}>
                <Text style={[styles.optionsName, { color: themeColors.text }]}>{displayName}</Text>
                <Text style={[styles.optionsEmail, { color: themeColors.textMuted }]}>{displayEmail}</Text>
              </View>
            </View>

            <Pressable style={[styles.optionButton, { backgroundColor: themeColors.bgSecondary }]} onPress={handleSwitchAccount}>
              <Ionicons name="swap-horizontal" size={24} color={themeColors.purple} />
              <Text style={[styles.optionButtonText, { color: themeColors.text }]}>Trocar conta Google</Text>
            </Pressable>

            <Pressable style={[styles.optionButton, { backgroundColor: isDark ? "#450A0A" : "#FEF2F2" }]} onPress={() => {
              setShowOptionsModal(false);
              handleSignOut();
            }}>
              <Ionicons name="log-out-outline" size={24} color={themeColors.danger} />
              <Text style={[styles.optionButtonText, { color: themeColors.danger }]}>Sair da conta</Text>
            </Pressable>

            <Pressable style={[styles.cancelButton, { backgroundColor: themeColors.bgSecondary }]} onPress={() => setShowOptionsModal(false)}>
              <Text style={[styles.cancelButtonText, { color: themeColors.textSecondary }]}>Cancelar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={isDesktopMode && desktopStyles.scrollContent}
      >
        <View style={isDesktopMode && desktopStyles.cardContainer}>
          <LinearGradient
            colors={["#7B1FA2", "#FF5ACD"]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={[styles.card, isDesktopMode && desktopStyles.card]}
          >
          {photoURL && (
            <View style={styles.photoContainer}>
              <Image source={{ uri: photoURL }} style={styles.photo} />
              {isGoogleUser && (
                <View style={styles.googleBadge}>
                  <Ionicons name="logo-google" size={14} color="#fff" />
                </View>
              )}
            </View>
          )}

          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.info}>{displayEmail}</Text>
          {displayPhone ? <Text style={styles.info}>{displayPhone}</Text> : null}

          <View style={styles.loginTypeBadge}>
            <Ionicons name={isGoogleUser ? "logo-google" : "mail-outline"} size={14} color="#fff" />
            <Text style={styles.loginTypeText}>
              {isGoogleUser ? "Conectado com Google" : "Email e senha"}
            </Text>
          </View>

          {profile?.uid && (
            <>
              <View style={{ height: 12 }} />
              <Text style={styles.label}>Código do Aluno:</Text>
              <Text style={styles.code}>{profile.uid.slice(0, 8).toUpperCase()}</Text>
            </>
          )}
        </LinearGradient>
        </View>

        <View style={[styles.actionsRow, isDesktopMode && desktopStyles.actionsRow]}>
          <Pressable style={[styles.actionBtn, isDesktopMode && desktopStyles.actionBtn]} onPress={openPersonalDataModal}>
            <Ionicons name="person-circle-outline" size={28} color="#111" />
            <Text style={styles.actionText}>Dados Pessoais</Text>
          </Pressable>

          <Pressable style={[styles.actionBtn, isDesktopMode && desktopStyles.actionBtn]} onPress={() => {}}>
            <Ionicons name="document-text-outline" size={28} color="#111" />
            <Text style={styles.actionText}>Políticas de{"\n"}Privacidade</Text>
          </Pressable>
        </View>

        {isGoogleUser && (
          <Pressable style={styles.googleOptionsBtn} onPress={() => setShowOptionsModal(true)}>
            <Ionicons name="settings-outline" size={20} color={colors.purple} />
            <Text style={styles.googleOptionsBtnText}>Opções da conta Google</Text>
          </Pressable>
        )}

        <Text style={styles.version}>Versão do APP: v1.0.0</Text>

        <Pressable onPress={handleSignOut} disabled={loading}>
          <Text style={[styles.logout, loading && styles.logoutDisabled]}>Sair da Conta</Text>
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  card: {
    margin: 16,
    marginTop: 18,
    borderRadius: 24,
    padding: 18,
    minHeight: 210,
    justifyContent: "center",
    alignItems: "center",
  },
  photoContainer: { position: "relative", marginBottom: 12 },
  photo: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: "#fff" },
  googleBadge: {
    position: "absolute", bottom: 0, right: 0, backgroundColor: "#4285F4",
    borderRadius: 12, width: 24, height: 24, justifyContent: "center", alignItems: "center",
    borderWidth: 2, borderColor: "#fff",
  },
  name: { fontSize: 28, fontWeight: "900", color: "white", textAlign: "center" },
  info: { color: "white", textAlign: "center", marginTop: 6, fontWeight: "700" },
  label: { color: "white", fontWeight: "900" },
  code: { color: "white", fontWeight: "900", fontSize: 18, marginTop: 4 },
  loginTypeBadge: {
    flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginTop: 12, gap: 6,
  },
  loginTypeText: { color: "#fff", fontSize: 12, fontWeight: "600" },

  actionsRow: { flexDirection: "row", gap: 14, paddingHorizontal: 16, marginTop: 8 },
  actionBtn: {
    flex: 1, backgroundColor: colors.grayCard, borderRadius: 20,
    paddingVertical: 18, alignItems: "center", gap: 8,
  },
  actionText: { fontWeight: "900", textAlign: "center", color: colors.text },

  googleOptionsBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: 16, paddingVertical: 12, marginHorizontal: 16, backgroundColor: "#f0e6f6", borderRadius: 12,
  },
  googleOptionsBtnText: { color: colors.purple, fontWeight: "700" },

  version: { textAlign: "center", color: colors.muted, marginTop: 16 },
  logout: { textAlign: "center", color: colors.danger, fontWeight: "900", marginTop: 10 },
  logoutDisabled: { opacity: 0.5 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.5)", justifyContent: "center", alignItems: "center" },
  loadingModal: { backgroundColor: colors.bg, borderRadius: 16, padding: 32, alignItems: "center", minWidth: 200 },
  loadingText: { marginTop: 16, fontSize: 16, color: colors.text, fontWeight: "600" },
  
  optionsModal: { backgroundColor: colors.bg, borderRadius: 20, padding: 24, width: "85%", maxWidth: 340 },
  optionsTitle: { fontSize: 20, fontWeight: "800", color: colors.text, textAlign: "center", marginBottom: 20 },
  currentAccountInfo: { flexDirection: "row", alignItems: "center", backgroundColor: "#f5f5f5", padding: 12, borderRadius: 12, marginBottom: 20 },
  optionsPhoto: { width: 48, height: 48, borderRadius: 24 },
  optionsAccountText: { marginLeft: 12, flex: 1 },
  optionsName: { fontSize: 16, fontWeight: "700", color: colors.text },
  optionsEmail: { fontSize: 13, color: colors.muted, marginTop: 2 },
  optionButton: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, backgroundColor: "#f5f5f5", marginBottom: 10 },
  optionButtonDanger: { backgroundColor: "#fef2f2" },
  optionButtonText: { fontSize: 15, fontWeight: "600", color: colors.text },
  optionButtonTextDanger: { color: colors.danger },
  cancelButton: { paddingVertical: 14, alignItems: "center", marginTop: 4 },
  cancelButtonText: { fontSize: 15, fontWeight: "600", color: colors.muted },

  // Personal Data Modal
  personalDataModal: {
    backgroundColor: "#FFFFFF", 
    borderRadius: 24, 
    width: "92%",
    maxWidth: 400, 
    padding: 20,
  },
  personalDataHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  personalDataTitle: { fontSize: 22, fontWeight: "900", color: colors.text },
  personalDataContent: { flexGrow: 1 },
  personalDataScrollContent: { paddingBottom: 10 },
  personalDataSection: { marginBottom: 24 },
  personalDataPhotoRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  personalDataPhoto: { width: 64, height: 64, borderRadius: 32 },
  personalDataPhotoPlaceholder: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: "#f0f0f0",
    justifyContent: "center", alignItems: "center",
  },
  personalDataNameContainer: { flex: 1 },
  personalDataName: { fontSize: 18, fontWeight: "800", color: colors.text },
  personalDataEmail: { fontSize: 14, color: colors.muted, marginTop: 2 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 1 },
  editSectionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 8 },
  editSectionText: { fontSize: 13, fontWeight: "600", color: colors.purple },
  dataRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  dataRowContent: { flex: 1 },
  dataLabel: { fontSize: 12, color: colors.muted, marginBottom: 2 },
  dataValue: { fontSize: 15, fontWeight: "700", color: colors.text },
  verifiedTag: {
    flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#2E7D32",
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
  },
  verifiedTagText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  editDataButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.purple, paddingVertical: 14, borderRadius: 14, marginTop: 8,
  },
  editDataButtonText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  closeDataButton: { paddingVertical: 14, backgroundColor: "#E0E0E0", borderRadius: 14, alignItems: "center", marginTop: 12 },
  closeDataButtonText: { fontSize: 15, fontWeight: "700", color: "#555" },
});

// Desktop styles
const desktopStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  content: {
    padding: 32,
    paddingTop: 24,
  },
  dashboardContainer: {
    maxWidth: 900,
  },

  // Profile Section
  profileSection: {
    marginBottom: 28,
  },
  profileCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  profilePhoto: {
    width: 80,
    height: 80,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: "#E2E8F0",
  },
  profilePhotoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: "#64748B",
    marginBottom: 8,
  },
  profileBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F3E8FF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  profileBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#7C3AED",
  },
  profileCode: {
    backgroundColor: "#F8FAFC",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  profileCodeLabel: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  profileCodeValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
    letterSpacing: 1,
  },

  // Info Cards
  infoCardsRow: {
    flexDirection: "row",
    gap: 12,
  },
  infoCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 12,
  },
  infoCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCardContent: {
    flex: 1,
  },
  infoCardLabel: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  infoCardValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
  },
  verifiedBadge: {
    padding: 4,
  },

  // Actions Section
  actionsSection: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 16,
  },
  actionsGrid: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
  },
  actionCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    width: 200,
    gap: 10,
  },
  actionIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1E293B",
  },
  actionDescription: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 16,
  },

  // Footer
  footerSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  versionText: {
    fontSize: 12,
    color: "#94A3B8",
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  signOutText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#DC2626",
  },
});
