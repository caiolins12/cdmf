import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, Modal, Animated, Easing, ActivityIndicator, Platform } from "react-native";
import { showMessage } from "../../utils/alert";
import AuthLayout from "../../components/auth/AuthLayout";
import GoogleButton from "../../components/auth/GoogleButton";
import { colors } from "../../theme/colors";
import { ui } from "../../theme/ui";
import { useGoogleSignIn } from "../../services/googleSignIn";
import { Ionicons } from "@/shims/icons";

export default function StudentEntryScreen({ navigation }: any) {
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const { signIn } = useGoogleSignIn();

  const spinAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Spinning animation while loading overlay is visible
  useEffect(() => {
    if (!showLoadingOverlay) return;
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
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 800, useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 800, useNativeDriver: Platform.OS !== "web" }),
      ])
    );
    spin.start();
    pulse.start();
    return () => { spin.stop(); pulse.stop(); };
  }, [showLoadingOverlay]);

  const spinInterpolate = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  // Ref to handle cancellation / timeout
  const signInAborted = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearAuthTimeout = () => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  };

  const stopFeedback = () => {
    clearAuthTimeout();
    setShowLoadingOverlay(false);
    setLoadingMessage("");
    setGoogleLoading(false);
  };

  const startFeedback = (message: string) => {
    signInAborted.current = false;
    setGoogleLoading(true);
    setLoadingMessage(message);
    setShowLoadingOverlay(true);
    clearAuthTimeout();
    timeoutRef.current = setTimeout(() => {
      if (!signInAborted.current) {
        signInAborted.current = true;
        stopFeedback();
        showMessage("Tempo esgotado", "O login demorou muito. Tente novamente.");
      }
    }, 30000);
  };

  const cancelSignIn = () => {
    signInAborted.current = true;
    stopFeedback();
  };

  useEffect(() => () => clearAuthTimeout(), []);

  // ── Single sign-in flow ──────────────────────────────────────
  const performGoogleSignIn = async () => {
    startFeedback("Conectando com Google...");
    try {
      const success = await signIn();
      clearAuthTimeout();
      if (signInAborted.current) return;
      if (!success) { stopFeedback(); return; }

      setLoadingMessage("Verificando credenciais...");
      await new Promise(resolve => setTimeout(resolve, 500));
      if (signInAborted.current) return;

      setShowLoadingOverlay(false);
      setLoadingMessage("");
      setShowSuccessModal(true);
      setTimeout(() => setShowSuccessModal(false), 1500);
    } catch (e: any) {
      clearAuthTimeout();
      if (signInAborted.current) return;
      setShowLoadingOverlay(false);
      setLoadingMessage("");
      if (e?.code !== "SIGN_IN_CANCELLED" && e?.code !== "auth/popup-closed-by-user") {
        showMessage("Não foi possível entrar", `Erro no Google Sign-In: ${e?.message ?? "Tente novamente."}`);
      }
    } finally {
      if (!signInAborted.current) setGoogleLoading(false);
    }
  };

  // ── Handlers forwarded to GoogleButton ──────────────────────
  const handleGoogleButtonStart = () => {
    if (googleLoading) return;
    startFeedback("Abrindo login do Google...");
  };

  const handleGoogleButtonSuccess = async () => {
    clearAuthTimeout();
    setLoadingMessage("Verificando credenciais...");
    await new Promise(resolve => setTimeout(resolve, 350));
    setShowLoadingOverlay(false);
    setLoadingMessage("");
    setGoogleLoading(false);
    setShowSuccessModal(true);
    setTimeout(() => setShowSuccessModal(false), 1500);
  };

  const handleGoogleButtonError = (error: any) => {
    signInAborted.current = true;
    stopFeedback();
    if (error?.code === "SIGN_IN_CANCELLED" || error?.code === "auth/popup-closed-by-user") return;
    showMessage("Não foi possível entrar", `Erro no Google Sign-In: ${error?.message ?? "Tente novamente."}`);
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <AuthLayout
      noScroll
      logoContainerStyle={{ width: "82%", maxWidth: ui.layout.contentMaxWidth, alignItems: "center" }}
      logoStyle={{ width: 360, height: 220 }}
      logoOffsetY={80}
      logoGap={-8}
    >
      {/* Loading overlay */}
      <Modal visible={showLoadingOverlay} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.loadingModal}>
            <Animated.View style={{ transform: [{ rotate: spinInterpolate }, { scale: pulseAnim }] }}>
              <Ionicons name="logo-google" size={48} color="#4285F4" />
            </Animated.View>
            <Text style={styles.loadingModalText}>{loadingMessage}</Text>
            <ActivityIndicator size="small" color={colors.purple} style={{ marginTop: 12 }} />
            <Text style={styles.cancelLoadingText} onPress={cancelSignIn}>Cancelar</Text>
          </View>
        </View>
      </Modal>

      {/* Success overlay */}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.successModal}>
            <Ionicons name="checkmark-circle" size={64} color={colors.green} />
            <Text style={styles.successTitle}>Conectado com Google!</Text>
            <Text style={styles.successSubtitle}>Redirecionando...</Text>
          </View>
        </View>
      </Modal>

      <View style={styles.bodyCentered}>
        <Text style={styles.welcomeText}>Bem-vindo ao CDMF</Text>
        <Text style={styles.subtitleText}>Entre com sua conta para continuar</Text>

        {googleLoading && Platform.OS !== "web" ? (
          <View style={styles.loadingButton}>
            <ActivityIndicator size="small" color={colors.purple} />
            <Text style={styles.loadingButtonText}>Conectando...</Text>
          </View>
        ) : (
          <GoogleButton
            onPress={performGoogleSignIn}
            loading={googleLoading}
            disabled={googleLoading}
            onStart={handleGoogleButtonStart}
            onSuccess={handleGoogleButtonSuccess}
            onError={handleGoogleButtonError}
          />
        )}
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  bodyCentered: {
    width: "100%",
    maxWidth: 460,
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-start",
    marginTop: 52,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  welcomeText: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitleText: {
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 340,
    marginBottom: 16,
  },
  loadingButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DADCE0",
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: "100%",
    maxWidth: 340,
    marginTop: 4,
    gap: 12,
  },
  loadingButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.muted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
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
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  successSubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
  },
});
