import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, Modal, Animated, Easing, ActivityIndicator, Platform } from "react-native";
import { showMessage } from "../../utils/alert";
import AuthLayout from "../../components/auth/AuthLayout";
import GoogleButton from "../../components/auth/GoogleButton";
import { colors } from "../../theme/colors";
import { ui } from "../../theme/ui";
import { useGoogleSignIn, GoogleUser } from "../../services/googleSignIn";
import { Ionicons } from "@expo/vector-icons";

export default function StudentEntryScreen({ navigation }: any) {
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [previousGoogleUser, setPreviousGoogleUser] = useState<GoogleUser | null>(null);
  const [showGoogleOptions, setShowGoogleOptions] = useState(false);

  const { signIn, switchAccount, getCurrentUser } = useGoogleSignIn();

  // Animação para o loading
  const spinAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Verifica se há uma conta Google previamente logada
  useEffect(() => {
    checkPreviousGoogleUser();
  }, []);

  async function checkPreviousGoogleUser() {
    const user = await getCurrentUser();
    setPreviousGoogleUser(user);
  }

  // Animação de rotação contínua
  useEffect(() => {
    if (showLoadingOverlay) {
      const spin = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: Platform.OS !== "web",
        })
      );
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 800,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: Platform.OS !== "web",
          }),
        ])
      );
      spin.start();
      pulse.start();
      return () => {
        spin.stop();
        pulse.stop();
      };
    }
  }, [showLoadingOverlay]);

  const spinInterpolate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const onGoogle = async () => {
    if (googleLoading) return;
    
    // Se já há uma conta Google previamente logada, pergunta se quer usar ou trocar
    if (previousGoogleUser) {
      setShowGoogleOptions(true);
      return;
    }
    
    await performGoogleSignIn();
  };

  // Ref para controlar cancelamento
  const signInAborted = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cancelSignIn = () => {
    signInAborted.current = true;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setShowLoadingOverlay(false);
    setLoadingMessage("");
    setGoogleLoading(false);
  };

  const performGoogleSignIn = async () => {
    signInAborted.current = false;
    setGoogleLoading(true);
    setLoadingMessage("Conectando com Google...");
    setShowLoadingOverlay(true);
    
    // Timeout de 30 segundos
    timeoutRef.current = setTimeout(() => {
      if (!signInAborted.current) {
        signInAborted.current = true;
        setShowLoadingOverlay(false);
        setLoadingMessage("");
        setGoogleLoading(false);
        showMessage("Tempo esgotado", "O login demorou muito. Tente novamente.");
      }
    }, 30000);
    
    try {
      const success = await signIn();
      
      // Limpa o timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      if (signInAborted.current) return;
      
      if (!success) {
        setShowLoadingOverlay(false);
        setLoadingMessage("");
        setGoogleLoading(false);
        return;
      }
      
      if (signInAborted.current) return;
      
      setLoadingMessage("Verificando credenciais...");
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (signInAborted.current) return;
      
      setShowLoadingOverlay(false);
      setLoadingMessage("");
      setShowSuccessModal(true);
      
      // Fecha o modal de sucesso após 1.5 segundos
      setTimeout(() => {
        setShowSuccessModal(false);
      }, 1500);
    } catch (e: any) {
      // Limpa o timeout em caso de erro
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      if (signInAborted.current) return;
      
      setShowLoadingOverlay(false);
      setLoadingMessage("");
      // Só mostra erro se não foi cancelamento pelo usuário
      if (e?.code !== "SIGN_IN_CANCELLED" && e?.code !== "auth/popup-closed-by-user") {
        showMessage("Não foi possível entrar", `Erro no Google Sign-In: ${e?.message ?? "Tente novamente."}`);
      }
    } finally {
      if (!signInAborted.current) {
        setGoogleLoading(false);
      }
    }
  };

  const handleUseExistingAccount = async () => {
    setShowGoogleOptions(false);
    await performGoogleSignIn();
  };

  const handleSwitchGoogleAccount = async () => {
    setShowGoogleOptions(false);
    signInAborted.current = false;
    setGoogleLoading(true);
    setLoadingMessage("Trocando conta...");
    setShowLoadingOverlay(true);
    
    // Timeout de 30 segundos
    timeoutRef.current = setTimeout(() => {
      if (!signInAborted.current) {
        signInAborted.current = true;
        setShowLoadingOverlay(false);
        setLoadingMessage("");
        setGoogleLoading(false);
        showMessage("Tempo esgotado", "A troca de conta demorou muito. Tente novamente.");
      }
    }, 30000);
    
    try {
      const success = await switchAccount();
      
      // Limpa o timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      if (signInAborted.current) return;
      
      if (!success) {
        setShowLoadingOverlay(false);
        setLoadingMessage("");
        setGoogleLoading(false);
        return;
      }
      
      if (signInAborted.current) return;
      
      setLoadingMessage("Verificando credenciais...");
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (signInAborted.current) return;
      
      await checkPreviousGoogleUser();
      setShowLoadingOverlay(false);
      setLoadingMessage("");
      setShowSuccessModal(true);
      
      // Fecha o modal de sucesso após 1.5 segundos
      setTimeout(() => {
        setShowSuccessModal(false);
      }, 1500);
    } catch (e: any) {
      // Limpa o timeout em caso de erro
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      if (signInAborted.current) return;
      
      setShowLoadingOverlay(false);
      setLoadingMessage("");
      if (e?.code !== "SIGN_IN_CANCELLED" && e?.code !== "auth/popup-closed-by-user") {
        showMessage("Erro", "Não foi possível trocar de conta.");
      }
    } finally {
      if (!signInAborted.current) {
        setGoogleLoading(false);
      }
    }
  };

  return (
    <AuthLayout
      noScroll
      logoContainerStyle={{ width: "82%", maxWidth: ui.layout.contentMaxWidth, alignItems: "center" }}
      logoStyle={{ width: 360, height: 220 }}
      logoOffsetY={80}
      logoGap={-8}
    >
      {/* Modal de Loading com animação */}
      <Modal visible={showLoadingOverlay} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.loadingModal}>
            <Animated.View style={{ transform: [{ rotate: spinInterpolate }, { scale: pulseAnim }] }}>
              <Ionicons name="logo-google" size={48} color="#4285F4" />
            </Animated.View>
            <Text style={styles.loadingModalText}>{loadingMessage}</Text>
            <View style={styles.loadingDotsContainer}>
              <ActivityIndicator size="small" color={colors.purple} />
            </View>
            {/* Botão de cancelar */}
            <Text style={styles.cancelLoadingText} onPress={cancelSignIn}>
              Cancelar
            </Text>
          </View>
        </View>
      </Modal>

      {/* Modal de Sucesso */}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.successModal}>
            <View style={styles.successIconContainer}>
              <Ionicons name="checkmark-circle" size={64} color={colors.green} />
            </View>
            <Text style={styles.successTitle}>Conectado com Google!</Text>
            <Text style={styles.successSubtitle}>Redirecionando...</Text>
          </View>
        </View>
      </Modal>

      {/* Modal de Opções Google */}
      <Modal visible={showGoogleOptions} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.googleOptionsModal}>
            <Text style={styles.googleOptionsTitle}>Conta Google detectada</Text>
            
            {previousGoogleUser && (
              <View style={styles.previousAccountInfo}>
                <Ionicons name="logo-google" size={24} color="#4285F4" />
                <View style={styles.previousAccountText}>
                  <Text style={styles.previousAccountName}>{previousGoogleUser.name}</Text>
                  <Text style={styles.previousAccountEmail}>{previousGoogleUser.email}</Text>
                </View>
              </View>
            )}

            <Text style={styles.googleOptionsSubtitle}>Deseja continuar com esta conta?</Text>

            <View style={styles.googleOptionBtn}>
              <Ionicons name="checkmark-circle" size={22} color={colors.green} />
              <Text style={styles.googleOptionBtnText} onPress={handleUseExistingAccount}>
                Continuar com esta conta
              </Text>
            </View>

            <View style={[styles.googleOptionBtn, styles.googleOptionBtnSecondary]}>
              <Ionicons name="swap-horizontal" size={22} color={colors.purple} />
              <Text style={[styles.googleOptionBtnText, styles.googleOptionBtnTextSecondary]} onPress={handleSwitchGoogleAccount}>
                Usar outra conta
              </Text>
            </View>

            <Text style={styles.googleOptionCancelText} onPress={() => setShowGoogleOptions(false)}>
              Cancelar
            </Text>
          </View>
        </View>
      </Modal>

      <View style={styles.bodyCentered}>
        <Text style={styles.welcomeText}>Bem-vindo ao CDMF</Text>
        <Text style={styles.subtitleText}>Entre com sua conta para continuar</Text>
        
        {googleLoading ? (
          <View style={styles.loadingButton}>
            <ActivityIndicator size="small" color={colors.purple} />
            <Text style={styles.loadingButtonText}>Conectando...</Text>
          </View>
        ) : (
          <GoogleButton onPress={onGoogle} />
        )}
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  bodyCentered: { 
    width: "100%", 
    alignItems: "center", 
    flex: 1, 
    justifyContent: "flex-start", 
    marginTop: 60, 
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitleText: {
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 32,
  },
  loadingButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    paddingVertical: 18,
    paddingHorizontal: 24,
    width: "82%",
    maxWidth: 320,
    marginTop: 16,
    gap: 12,
  },
  loadingButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.muted,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingModal: {
    backgroundColor: colors.bg,
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    minWidth: 200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  loadingModalText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.text,
    fontWeight: "600",
  },
  loadingDotsContainer: {
    marginTop: 12,
  },
  cancelLoadingText: {
    marginTop: 20,
    fontSize: 14,
    fontWeight: "600",
    color: "#DC2626",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  successModal: {
    backgroundColor: colors.bg,
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    minWidth: 250,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  successIconContainer: {
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  successSubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
  },
  googleOptionsModal: {
    backgroundColor: colors.bg,
    borderRadius: 20,
    padding: 24,
    width: "85%",
    maxWidth: 340,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  googleOptionsTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
    marginBottom: 16,
  },
  googleOptionsSubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 16,
  },
  previousAccountInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    gap: 12,
  },
  previousAccountText: {
    flex: 1,
  },
  previousAccountName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  previousAccountEmail: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  googleOptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#e8f5e9",
    marginBottom: 10,
  },
  googleOptionBtnSecondary: {
    backgroundColor: "#f3e5f5",
  },
  googleOptionBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.green,
  },
  googleOptionBtnTextSecondary: {
    color: colors.purple,
  },
  googleOptionCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
    textAlign: "center",
    paddingVertical: 12,
    marginTop: 4,
  },
});
