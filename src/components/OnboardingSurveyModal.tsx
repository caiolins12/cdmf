import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  Keyboard,
  TouchableWithoutFeedback,
  Animated,
  Dimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// Opções de gênero
const GENDER_OPTIONS = [
  { id: "masculino", label: "Masculino", icon: "male" },
  { id: "feminino", label: "Feminino", icon: "female" },
  { id: "outro", label: "Outro", icon: "ellipse" },
  { id: "prefiro_nao_informar", label: "Prefiro não informar", icon: "remove" },
];

// Opções de preferência na dança
const DANCE_PREFERENCE_OPTIONS = [
  { id: "condutor", label: "Condutor(a)", description: "Prefiro conduzir", icon: "arrow-forward" },
  { id: "conduzido", label: "Conduzido(a)", description: "Prefiro ser conduzido(a)", icon: "arrow-back" },
  { id: "ambos", label: "Ambos", description: "Ambas posições", icon: "swap-horizontal" },
];

type OnboardingData = {
  phone: string;
  phoneVerified: boolean;
  birthDate?: string;
  age?: number;
  gender?: string;
  dancePreference?: string;
};

type Props = {
  visible: boolean;
  onComplete: (data: OnboardingData) => Promise<void>;
  onSwitchAccount?: () => void; // Callback para trocar de conta
  initialData?: {
    phone?: string;
    birthDate?: string;
    gender?: string;
    dancePreference?: string;
    phoneVerified?: boolean;
  };
  isEditing?: boolean;
};

export default function OnboardingSurveyModal({ visible, onComplete, onSwitchAccount, initialData, isEditing }: Props) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Verificação SMS
  const [verificationCode, setVerificationCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Dados do onboarding
  const [phoneInput, setPhoneInput] = useState("");
  const [birthDateInput, setBirthDateInput] = useState("");
  const [genderInput, setGenderInput] = useState("");
  const [dancePreferenceInput, setDancePreferenceInput] = useState("");
  
  // Mensagem inline (para web onde Alert não funciona)
  const [inlineMessage, setInlineMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Animação
  const translateY = useRef(new Animated.Value(0)).current;
  
  // Refs para inputs
  const phoneInputRef = useRef<TextInput>(null);
  const codeInputRef = useRef<TextInput>(null);
  const birthInputRef = useRef<TextInput>(null);

  // Monitora teclado
  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboardVisible(true);
      Animated.timing(translateY, {
        toValue: -e.endCoordinates.height * 0.4,
        duration: 250,
        useNativeDriver: Platform.OS !== "web",
      }).start();
    });
    
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardVisible(false);
      Animated.timing(translateY, {
        toValue: 0,
        duration: 250,
        useNativeDriver: Platform.OS !== "web",
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [translateY]);

  // Inicializa com dados existentes APENAS quando abre o modal
  const hasInitialized = useRef(false);
  
  useEffect(() => {
    if (visible && !hasInitialized.current) {
      hasInitialized.current = true;
      if (initialData) {
        setPhoneInput(initialData.phone || "");
        setBirthDateInput(initialData.birthDate || "");
        setGenderInput(initialData.gender || "");
        setDancePreferenceInput(initialData.dancePreference || "");
        setPhoneVerified(!!initialData.phoneVerified && !!initialData.phone);
      }
    }
    
    if (!visible) {
      hasInitialized.current = false;
    }
  }, [visible]);

  // Reset quando fechar
  useEffect(() => {
    if (!visible) {
      setStep(1);
      setCodeSent(false);
      setVerificationCode("");
      setGeneratedCode("");
      setCountdown(0);
    }
  }, [visible]);

  // Auto-focus no input de telefone quando o modal abre
  useEffect(() => {
    if (visible && step === 1 && !phoneVerified) {
      // Delay para garantir que o modal está renderizado
      const timer = setTimeout(() => {
        phoneInputRef.current?.focus();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [visible, step, phoneVerified]);

  // Auto-focus no input de código quando muda para modo de verificação
  useEffect(() => {
    if (codeSent && !phoneVerified) {
      const timer = setTimeout(() => {
        codeInputRef.current?.focus();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [codeSent, phoneVerified]);

  // Auto-focus no input de data quando muda para step 2
  useEffect(() => {
    if (step === 2) {
      const timer = setTimeout(() => {
        birthInputRef.current?.focus();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [step]);

  // Countdown para reenviar código
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Formata telefone
  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    if (numbers.length <= 11) return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };
  
  // Handler para mudança de telefone
  const handlePhoneChange = (text: string) => {
    const formatted = formatPhone(text);
    setPhoneInput(formatted);
    
    // Reseta verificação se mudou o número
    if (codeSent) {
      setCodeSent(false);
      setVerificationCode("");
    }
    if (phoneVerified) {
      setPhoneVerified(false);
    }
  };

  // Formata data de nascimento
  const formatBirthDate = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 4) return `${numbers.slice(0, 2)}/${numbers.slice(2)}`;
    return `${numbers.slice(0, 2)}/${numbers.slice(2, 4)}/${numbers.slice(4, 8)}`;
  };

  // Calcula idade
  const calculateAge = (birthDate: string): number | null => {
    const parts = birthDate.split("/");
    if (parts.length !== 3) return null;

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);

    if (isNaN(day) || isNaN(month) || isNaN(year) || year < 1900) return null;

    const birth = new Date(year, month, day);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    return age >= 0 && age < 120 ? age : null;
  };

  // Gerar código de verificação
  const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  // Alert cross-platform
  const showAlert = (title: string, message: string, type: "success" | "error" | "info" = "info") => {
    if (Platform.OS === "web") {
      setInlineMessage({ type, text: `${title}: ${message}` });
      // Limpa mensagem após 5 segundos
      setTimeout(() => setInlineMessage(null), 5000);
    } else {
      Alert.alert(title, message);
    }
  };

  // Enviar código SMS
  const handleSendCode = async () => {
    const phoneNumbers = phoneInput.replace(/\D/g, "");
    if (phoneNumbers.length < 10) {
      showAlert("Telefone inválido", "Por favor, insira um telefone válido com DDD.", "error");
      return;
    }

    setSendingCode(true);
    Keyboard.dismiss();

    try {
      const code = generateVerificationCode();
      setGeneratedCode(code);

      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Em produção, enviar SMS real aqui
      // Por enquanto, mostra o código para teste
      showAlert("Código enviado! 📱", `Para teste, seu código é: ${code}`, "success");

      setCodeSent(true);
      setCountdown(60);
    } catch (error) {
      showAlert("Erro", "Não foi possível enviar o código. Tente novamente.", "error");
    } finally {
      setSendingCode(false);
    }
  };

  // Verificar código
  const handleVerifyCode = (codeToVerify?: string) => {
    const code = codeToVerify || verificationCode;
    
    if (code.length !== 6) {
      showAlert("Código inválido", "O código deve ter 6 dígitos.", "error");
      return;
    }

    setVerifying(true);
    Keyboard.dismiss();

    setTimeout(() => {
      if (code === generatedCode) {
        setPhoneVerified(true);
        setCodeSent(false);
        setInlineMessage(null); // Limpa qualquer mensagem anterior
        showAlert("Verificado! ✅", "Telefone verificado! Toque em Continuar.", "success");
      } else {
        showAlert("Código incorreto", "Tente novamente.", "error");
        setVerificationCode("");
      }
      setVerifying(false);
    }, 300);
  };
  
  // Verifica automaticamente quando digitar 6 dígitos
  const handleCodeChange = (text: string) => {
    const cleanCode = text.replace(/\D/g, "").slice(0, 6);
    setVerificationCode(cleanCode);
    
    // Auto-verificar quando completar 6 dígitos
    if (cleanCode.length === 6 && generatedCode) {
      setTimeout(() => {
        handleVerifyCode(cleanCode);
      }, 200);
    }
  };

  // Salvar dados
  const handleSave = async () => {
    setSaving(true);
    try {
      const age = calculateAge(birthDateInput);

      await onComplete({
        phone: phoneInput,
        phoneVerified: true,
        birthDate: birthDateInput || undefined,
        age: age || undefined,
        gender: genderInput || undefined,
        dancePreference: dancePreferenceInput || undefined,
      });
    } catch (error) {
      showAlert("Erro", "Não foi possível salvar. Tente novamente.", "error");
    } finally {
      setSaving(false);
    }
  };

  // Próximo passo
  const nextStep = () => {
    Keyboard.dismiss();
    
    if (step === 1) {
      if (isEditing && phoneVerified) {
        setStep(2);
        return;
      }

      if (!phoneVerified) {
        showAlert("Verificação necessária", "Verifique seu telefone antes de continuar.", "error");
        return;
      }
      
      setStep(2);
      return;
    }

    if (step < 4) {
      setStep(step + 1);
    } else {
      handleSave();
    }
  };

  // Pular passos opcionais
  const handleFinishEarly = () => {
    if (step === 1 && !phoneVerified) {
      showAlert("Telefone obrigatório", "Precisamos do seu telefone para contato.", "error");
      return;
    }
    handleSave();
  };

  if (!visible) return null;

  // Handler para fechar teclado apenas no overlay (não no conteúdo)
  const handleOverlayPress = () => {
    Keyboard.dismiss();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        {/* Área clicável para fechar teclado - apenas o fundo */}
        <TouchableWithoutFeedback onPress={handleOverlayPress}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
        
        {/* Modal content - não intercepta cliques para o teclado */}
        <Animated.View style={[styles.modal, { transform: [{ translateY }] }]}>
            {/* Header compacto */}
            <View style={styles.header}>
              <Text style={styles.emoji}>
                {step === 1 ? "📱" : step === 2 ? "🎂" : step === 3 ? "👤" : "💃"}
              </Text>
              <Text style={styles.title}>
                {step === 1 ? "Vamos começar!" : step === 2 ? "Quase lá..." : step === 3 ? "Mais um pouco..." : "Última etapa!"}
              </Text>
              
              {/* Progress dots */}
              <View style={styles.progressDots}>
                {[1, 2, 3, 4].map((s) => (
                  <View key={s} style={[styles.dot, s === step && styles.dotActive, s < step && styles.dotCompleted]} />
                ))}
              </View>
            </View>

            {/* Mensagem inline (para web) */}
            {inlineMessage && (
              <View style={[
                styles.inlineMessage,
                inlineMessage.type === "success" && styles.inlineMessageSuccess,
                inlineMessage.type === "error" && styles.inlineMessageError,
              ]}>
                <Ionicons 
                  name={inlineMessage.type === "success" ? "checkmark-circle" : inlineMessage.type === "error" ? "alert-circle" : "information-circle"} 
                  size={18} 
                  color={inlineMessage.type === "success" ? "#15803D" : inlineMessage.type === "error" ? "#DC2626" : "#2563EB"} 
                />
                <Text style={[
                  styles.inlineMessageText,
                  inlineMessage.type === "success" && styles.inlineMessageTextSuccess,
                  inlineMessage.type === "error" && styles.inlineMessageTextError,
                ]}>
                  {inlineMessage.text}
                </Text>
                <Pressable onPress={() => setInlineMessage(null)} style={styles.inlineMessageClose}>
                  <Ionicons name="close" size={16} color="#64748B" />
                </Pressable>
              </View>
            )}

            {/* Content */}
            <View style={styles.content}>
              {/* Etapa 1: Telefone */}
              {step === 1 && (
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Qual seu telefone?</Text>
                  <Text style={styles.stepDescription}>Para avisar sobre suas aulas 🎉</Text>

                  <TextInput
                    ref={phoneInputRef}
                    id="onboarding-phone"
                    name="onboarding-phone"
                    style={[styles.textInput, phoneVerified && styles.textInputVerified]}
                    placeholder="(00) 00000-0000"
                    placeholderTextColor="#999"
                    value={phoneInput}
                    onChangeText={handlePhoneChange}
                    keyboardType="phone-pad"
                    maxLength={15}
                    editable={!phoneVerified}
                    autoFocus={Platform.OS !== "web"}
                    autoComplete="tel"
                  />

                  {phoneVerified && (
                    <View style={styles.successBadge}>
                      <Ionicons name="checkmark-circle" size={20} color="#2E7D32" />
                      <Text style={styles.successText}>Verificado!</Text>
                    </View>
                  )}

                  {!phoneVerified && !codeSent && (
                    <Pressable
                      style={[styles.actionButton, (sendingCode || phoneInput.replace(/\D/g, "").length < 10) && styles.buttonDisabled]}
                      onPress={handleSendCode}
                      disabled={sendingCode || phoneInput.replace(/\D/g, "").length < 10}
                    >
                      {sendingCode ? <ActivityIndicator color="#fff" /> : (
                        <Text style={styles.actionButtonText}>Enviar código SMS</Text>
                      )}
                    </Pressable>
                  )}

                  {codeSent && !phoneVerified && (
                    <>
                      {/* Mostra código de teste na interface */}
                      {generatedCode && (
                        <View style={styles.testCodeBox}>
                          <Text style={styles.testCodeLabel}>Código de teste:</Text>
                          <Text style={styles.testCodeValue}>{generatedCode}</Text>
                        </View>
                      )}
                      
                      <TextInput
                        ref={codeInputRef}
                        id="verification-code"
                        name="verification-code"
                        style={styles.codeInput}
                        placeholder="000000"
                        placeholderTextColor="#ccc"
                        value={verificationCode}
                        onChangeText={handleCodeChange}
                        keyboardType="number-pad"
                        maxLength={6}
                        autoComplete="one-time-code"
                      />

                      <Pressable
                        style={[styles.actionButton, (verifying || verificationCode.length !== 6) && styles.buttonDisabled]}
                        onPress={handleVerifyCode}
                        disabled={verifying || verificationCode.length !== 6}
                      >
                        {verifying ? <ActivityIndicator color="#fff" /> : (
                          <Text style={styles.actionButtonText}>Verificar</Text>
                        )}
                      </Pressable>

                      <Pressable onPress={handleSendCode} disabled={countdown > 0} style={styles.resendButton}>
                        <Text style={[styles.resendText, countdown > 0 && styles.resendTextDisabled]}>
                          {countdown > 0 ? `Reenviar em ${countdown}s` : "Reenviar código"}
                        </Text>
                      </Pressable>
                    </>
                  )}
                </View>
              )}

              {/* Etapa 2: Data de Nascimento */}
              {step === 2 && (
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Data de nascimento</Text>
                  <Text style={styles.stepDescription}>Surpresas no seu aniversário! 🎁</Text>

                  <TextInput
                    ref={birthInputRef}
                    id="onboarding-birthdate"
                    name="onboarding-birthdate"
                    style={styles.textInput}
                    placeholder="DD/MM/AAAA"
                    placeholderTextColor="#999"
                    value={birthDateInput}
                    onChangeText={(text) => setBirthDateInput(formatBirthDate(text))}
                    keyboardType="number-pad"
                    maxLength={10}
                    autoComplete="bday"
                  />

                  <Pressable onPress={() => setStep(3)} style={styles.skipButton}>
                    <Text style={styles.skipText}>Pular</Text>
                  </Pressable>
                </View>
              )}

              {/* Etapa 3: Gênero */}
              {step === 3 && (
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Como se identifica?</Text>
                  <Text style={styles.stepDescription}>Personalizar sua experiência 🌟</Text>

                  <View style={styles.optionsRow}>
                    {GENDER_OPTIONS.map((opt) => (
                      <Pressable
                        key={opt.id}
                        style={[styles.optionChip, genderInput === opt.id && styles.optionChipSelected]}
                        onPress={() => setGenderInput(opt.id)}
                      >
                        <Ionicons name={opt.icon as any} size={18} color={genderInput === opt.id ? "#fff" : colors.purple} />
                        <Text style={[styles.optionChipText, genderInput === opt.id && styles.optionChipTextSelected]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Pressable onPress={() => setStep(4)} style={styles.skipButton}>
                    <Text style={styles.skipText}>Pular</Text>
                  </Pressable>
                </View>
              )}

              {/* Etapa 4: Preferência na dança */}
              {step === 4 && (
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Na dança, prefere...</Text>
                  <Text style={styles.stepDescription}>Formar pares ideais! 💃🕺</Text>

                  <View style={styles.danceOptions}>
                    {DANCE_PREFERENCE_OPTIONS.map((opt) => (
                      <Pressable
                        key={opt.id}
                        style={[styles.danceOption, dancePreferenceInput === opt.id && styles.danceOptionSelected]}
                        onPress={() => setDancePreferenceInput(opt.id)}
                      >
                        <Ionicons name={opt.icon as any} size={24} color={dancePreferenceInput === opt.id ? "#fff" : colors.purple} />
                        <Text style={[styles.danceOptionText, dancePreferenceInput === opt.id && styles.danceOptionTextSelected]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              {step > 1 && (
                <Pressable style={styles.backBtn} onPress={() => setStep(step - 1)}>
                  <Ionicons name="arrow-back" size={20} color="#666" />
                </Pressable>
              )}

              <Pressable
                style={[styles.nextBtn, (saving || (step === 1 && !phoneVerified)) && styles.nextBtnDisabled]}
                onPress={nextStep}
                disabled={saving || (step === 1 && !phoneVerified)}
              >
                {saving ? <ActivityIndicator color="#fff" /> : (
                  <Text style={styles.nextBtnText}>{step === 4 ? "Finalizar 🎉" : "Continuar"}</Text>
                )}
              </Pressable>
            </View>

            {step > 1 && !isEditing && (
              <Pressable onPress={handleFinishEarly} style={styles.finishEarlyBtn}>
                <Text style={styles.finishEarlyText}>Pular opcionais e finalizar</Text>
              </Pressable>
            )}
            
            {/* Botão para trocar de conta - SEMPRE visível se não estiver editando */}
            {!isEditing && onSwitchAccount && (
              <View style={styles.switchAccountContainer}>
                <View style={styles.switchAccountDivider} />
                <Pressable onPress={onSwitchAccount} style={styles.switchAccountBtn}>
                  <Ionicons name="log-out-outline" size={18} color="#fff" />
                  <Text style={styles.switchAccountText}>Sair e usar outra conta</Text>
                </Pressable>
              </View>
            )}
          </Animated.View>
        </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modal: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.bg,
    borderRadius: 24,
    padding: 24,
  },

  header: {
    alignItems: "center",
    marginBottom: 20,
  },
  emoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: colors.text,
    marginBottom: 12,
  },
  progressDots: {
    flexDirection: "row",
    gap: 10,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#D0D0D0",
  },
  dotActive: {
    backgroundColor: colors.purple,
  },
  dotCompleted: {
    backgroundColor: colors.purple,
  },

  content: {
    minHeight: 200,
  },
  stepContent: {
    alignItems: "center",
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 20,
  },

  textInput: {
    width: "100%",
    backgroundColor: "#f5f5f5",
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  textInputVerified: {
    borderColor: "#2E7D32",
    backgroundColor: "#E8F5E9",
  },

  successBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  successText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2E7D32",
  },

  actionButton: {
    width: "100%",
    backgroundColor: colors.purple,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 16,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  codeInput: {
    width: "70%",
    backgroundColor: "#f5f5f5",
    borderRadius: 14,
    paddingVertical: 14,
    fontSize: 28,
    fontWeight: "900",
    color: colors.text,
    textAlign: "center",
    letterSpacing: 8,
    marginTop: 12,
  },
  testCodeBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 16,
    gap: 8,
  },
  testCodeLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#92400E",
  },
  testCodeValue: {
    fontSize: 18,
    fontWeight: "900",
    color: "#D97706",
    letterSpacing: 4,
  },

  resendButton: {
    marginTop: 12,
    padding: 8,
  },
  resendText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.purple,
  },
  resendTextDisabled: {
    color: colors.muted,
  },

  ageText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.purple,
    marginTop: 12,
  },

  skipButton: {
    marginTop: 16,
    padding: 8,
  },
  skipText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
  },

  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  optionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "transparent",
  },
  optionChipSelected: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },
  optionChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  optionChipTextSelected: {
    color: "#fff",
  },

  danceOptions: {
    width: "100%",
    gap: 10,
  },
  danceOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#f5f5f5",
    padding: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "transparent",
  },
  danceOptionSelected: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },
  danceOptionText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  danceOptionTextSelected: {
    color: "#fff",
  },

  footer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  backBtn: {
    width: 48,
    height: 48,
    backgroundColor: "#E0E0E0",
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  nextBtn: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: colors.purple,
    borderRadius: 14,
    alignItems: "center",
  },
  nextBtnDisabled: {
    backgroundColor: "#ccc",
  },
  nextBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },

  finishEarlyBtn: {
    alignItems: "center",
    marginTop: 12,
  },
  finishEarlyText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
  switchAccountContainer: {
    marginTop: 24,
    width: "100%",
  },
  switchAccountDivider: {
    height: 1,
    backgroundColor: "#E5E5E5",
    marginBottom: 16,
  },
  switchAccountBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#DC2626",
  },
  switchAccountText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  // Inline message styles
  inlineMessage: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 16,
    gap: 8,
  },
  inlineMessageSuccess: {
    backgroundColor: "#DCFCE7",
  },
  inlineMessageError: {
    backgroundColor: "#FEE2E2",
  },
  inlineMessageText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#1E40AF",
  },
  inlineMessageTextSuccess: {
    color: "#15803D",
  },
  inlineMessageTextError: {
    color: "#DC2626",
  },
  inlineMessageClose: {
    padding: 4,
  },
});
