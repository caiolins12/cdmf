import React, { useState, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator, Modal, TextInput } from "react-native";
import AuthLayout from "../../components/auth/AuthLayout";
import AuthInput from "../../components/auth/AuthInput";
import { PrimaryButton } from "../../components/auth/AuthButtons";
import { useAuth } from "../../contexts/AuthContext";
import { colors } from "../../theme/colors";
import { ui } from "../../theme/ui";
import { Ionicons } from "@expo/vector-icons";

export default function TeacherLoginScreen() {
  const { teacherSignIn } = useAuth();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  
  const passwordRef = useRef<TextInput>(null);

  const handleLogin = async () => {
    if (!code.trim()) {
      Alert.alert("Atenção", "Digite o código do professor");
      return;
    }
    if (!password) {
      Alert.alert("Atenção", "Digite a senha");
      return;
    }

    setLoading(true);
    try {
      const result = await teacherSignIn(code.trim(), password);
      
      if (!result.success) {
        Alert.alert("Erro", result.error || "Não foi possível fazer login");
      }
      // Se sucesso, o AuthContext redireciona automaticamente
    } catch (e: any) {
      Alert.alert("Erro", "Ocorreu um erro ao fazer login. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    Alert.alert(
      "Recuperar Senha",
      "Entre em contato com o administrador do sistema para recuperar sua senha.",
      [{ text: "OK" }]
    );
  };

  return (
    <AuthLayout
      noScroll
      logoContainerStyle={{ width: "82%", maxWidth: ui.layout.contentMaxWidth, alignItems: "center" }}
      logoStyle={{ width: 360, height: 220 }}
      logoOffsetY={48}
      logoGap={-18}
    >
      {/* Modal de Loading */}
      <Modal visible={loading} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.loadingModal}>
            <ActivityIndicator size="large" color={colors.purple} />
            <Text style={styles.loadingText}>Verificando credenciais...</Text>
          </View>
        </View>
      </Modal>

      <View style={styles.container} importantForAccessibility="yes">
        <AuthInput 
          label="Código do Professor" 
          value={code} 
          onChangeText={setCode} 
          autoCapitalize="characters"
          autoComplete="username"
          textContentType="username"
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => passwordRef.current?.focus()}
          editable={!loading}
        />
        <AuthInput 
          ref={passwordRef}
          label="Senha" 
          value={password} 
          onChangeText={setPassword} 
          secureTextEntry
          autoComplete="password"
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={handleLogin}
          editable={!loading}
        />

        <Pressable onPress={handleForgotPassword} style={styles.forgotWrap} disabled={loading}>
          <Text style={styles.forgotText}>Esqueceu sua senha?</Text>
        </Pressable>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.purple} />
          </View>
        ) : (
          <PrimaryButton title="ENTRAR" onPress={handleLogin} />
        )}
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  container: { 
    width: "100%", 
    alignItems: "center", 
    flex: 1, 
    justifyContent: "flex-start", 
    marginTop: 30, 
    paddingBottom: 18 
  },
  forgotWrap: { 
    width: "82%", 
    maxWidth: ui.layout.contentMaxWidth, 
    alignItems: "center", 
    marginTop: 10, 
    marginBottom: 8 
  },
  forgotText: { color: colors.purple, fontWeight: "700" },
  loadingContainer: { 
    height: 50, 
    justifyContent: "center", 
    alignItems: "center" 
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
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.text,
    fontWeight: "600",
  },
});
