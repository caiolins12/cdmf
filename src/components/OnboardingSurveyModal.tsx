import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TextInput,
  Modal,
  Keyboard,
  Platform,
} from "react-native";
import { Ionicons } from "@/shims/icons";
import { colors } from "../theme/colors";
import { apiPost } from "../services/apiClient";

// ── Options ──────────────────────────────────────────────────
const GENDER_OPTIONS = [
  { id: "masculino", label: "Masculino", icon: "male" as const },
  { id: "feminino", label: "Feminino", icon: "female" as const },
  { id: "outro", label: "Outro", icon: "ellipse" as const },
  { id: "prefiro_nao_informar", label: "Não informar", icon: "remove" as const },
];

const DANCE_OPTIONS = [
  { id: "condutor", label: "Condutor(a)", description: "Prefiro conduzir", icon: "arrow-forward" as const },
  { id: "conduzido", label: "Conduzido(a)", description: "Prefiro ser conduzido(a)", icon: "arrow-back" as const },
  { id: "ambos", label: "Ambos", description: "Ambas as posições", icon: "swap-horizontal" as const },
];

// ── Types ─────────────────────────────────────────────────────
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
  onSwitchAccount?: () => void;
  initialData?: {
    phone?: string;
    birthDate?: string;
    gender?: string;
    dancePreference?: string;
    phoneVerified?: boolean;
  };
  isEditing?: boolean;
};

// ── Helpers ───────────────────────────────────────────────────
function formatPhone(value: string): string {
  const n = value.replace(/\D/g, "");
  if (n.length <= 2) return n;
  if (n.length <= 7) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  if (n.length <= 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7, 11)}`;
}

function formatBirthDate(value: string): string {
  const n = value.replace(/\D/g, "");
  if (n.length <= 2) return n;
  if (n.length <= 4) return `${n.slice(0, 2)}/${n.slice(2)}`;
  return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4, 8)}`;
}

function calculateAge(birthDate: string): number | null {
  const [day, month, year] = birthDate.split("/").map(Number);
  if (!day || !month || !year || year < 1900) return null;
  const birth = new Date(year, month - 1, day);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) age--;
  return age >= 0 && age < 120 ? age : null;
}

const STEPS = [
  { emoji: "📱", title: "WhatsApp" },
  { emoji: "🎂", title: "Aniversário" },
  { emoji: "👤", title: "Identidade" },
  { emoji: "💃", title: "Na pista" },
];

// ── Component ─────────────────────────────────────────────────
export default function OnboardingSurveyModal({
  visible,
  onComplete,
  onSwitchAccount,
  initialData,
  isEditing,
}: Props) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1 – phone & OTP
  const [phone, setPhone] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [otpError, setOtpError] = useState<string | null>(null);

  // Steps 2-4
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");
  const [dancePreference, setDancePreference] = useState("");

  const phoneInputRef = useRef<TextInput>(null);
  const otpInputRef = useRef<TextInput>(null);
  const hasInitialized = useRef(false);

  // Initialize from existing data
  useEffect(() => {
    if (visible && !hasInitialized.current) {
      hasInitialized.current = true;
      if (initialData) {
        setPhone(initialData.phone || "");
        setBirthDate(initialData.birthDate || "");
        setGender(initialData.gender || "");
        setDancePreference(initialData.dancePreference || "");
        const verified = !!(initialData.phoneVerified && initialData.phone?.trim());
        setPhoneVerified(verified);
      }
    }
    if (!visible) {
      hasInitialized.current = false;
    }
  }, [visible, initialData]);

  // Reset step when closed
  useEffect(() => {
    if (!visible) {
      setStep(1);
      setOtpSent(false);
      setOtpCode("");
      setOtpError(null);
      setCountdown(0);
    }
  }, [visible]);

  // Auto-focus OTP input when sent
  useEffect(() => {
    if (otpSent && !phoneVerified) {
      setTimeout(() => otpInputRef.current?.focus(), 300);
    }
  }, [otpSent, phoneVerified]);

  // Countdown
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // ── OTP handlers ───────────────────────────────────────────
  const handleSendOtp = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setOtpError("Insira um número de WhatsApp válido com DDD.");
      return;
    }
    setSendingOtp(true);
    setOtpError(null);
    Keyboard.dismiss();
    try {
      await apiPost("/api/rpc/sendPhoneOtp", { phone: digits });
      setOtpSent(true);
      setOtpCode("");
      setCountdown(60);
    } catch (err: any) {
      setOtpError(err?.message || "Não foi possível enviar o código. Tente novamente.");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async (codeOverride?: string) => {
    const code = codeOverride ?? otpCode;
    if (code.length !== 6) return;
    const digits = phone.replace(/\D/g, "");
    setVerifyingOtp(true);
    setOtpError(null);
    try {
      await apiPost("/api/rpc/verifyPhoneOtp", { phone: digits, code });
      setPhoneVerified(true);
      setOtpSent(false);
      setOtpError(null);
    } catch (err: any) {
      setOtpError(err?.message || "Código incorreto. Verifique e tente novamente.");
      setOtpCode("");
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleOtpChange = (text: string) => {
    const clean = text.replace(/\D/g, "").slice(0, 6);
    setOtpCode(clean);
    if (clean.length === 6) {
      setTimeout(() => handleVerifyOtp(clean), 150);
    }
  };

  const handlePhoneChange = (text: string) => {
    setPhone(formatPhone(text));
    if (phoneVerified) setPhoneVerified(false);
    if (otpSent) { setOtpSent(false); setOtpCode(""); }
    setOtpError(null);
  };

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const age = calculateAge(birthDate) ?? undefined;
      await onComplete({
        phone,
        phoneVerified: true,
        birthDate: birthDate || undefined,
        age,
        gender: gender || undefined,
        dancePreference: dancePreference || undefined,
      });
    } catch {
      // error surfaced by parent
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => {
    Keyboard.dismiss();
    if (step === 1 && !phoneVerified) return;
    if (step < 4) setStep(s => s + 1);
    else handleSave();
  };

  if (!visible) return null;

  // ── Render ─────────────────────────────────────────────────
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.modal}>

          {/* ── Step indicator ── */}
          <View style={styles.stepBar}>
            {STEPS.map((s, i) => {
              const num = i + 1;
              const done = num < step;
              const active = num === step;
              return (
                <React.Fragment key={num}>
                  <View style={[styles.stepCircle, active && styles.stepCircleActive, done && styles.stepCircleDone]}>
                    {done
                      ? <Ionicons name="checkmark" size={13} color="#fff" />
                      : <Text style={[styles.stepCircleText, active && styles.stepCircleTextActive]}>{num}</Text>
                    }
                  </View>
                  {i < 3 && (
                    <View style={[styles.stepLine, (done || active) && styles.stepLineDone]} />
                  )}
                </React.Fragment>
              );
            })}
          </View>

          {/* ── Step header ── */}
          <View style={styles.stepHeader}>
            <Text style={styles.stepEmoji}>{STEPS[step - 1].emoji}</Text>
            <View style={styles.stepHeaderText}>
              <Text style={styles.stepLabel}>Etapa {step} de 4</Text>
              <Text style={styles.stepTitle}>
                {step === 1 ? "Verificação do WhatsApp"
                  : step === 2 ? "Data de Nascimento"
                  : step === 3 ? "Como você se identifica?"
                  : "Preferência na Dança"}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* ── Content ── */}
          <View style={styles.content}>

            {/* Step 1: Phone + OTP */}
            {step === 1 && (
              <View style={styles.stepContent}>
                <Text style={styles.fieldLabel}>Número do WhatsApp</Text>
                <View style={[styles.phoneRow, phoneVerified && styles.phoneRowVerified]}>
                  <Ionicons
                    name={phoneVerified ? "checkmark-circle" : "logo-whatsapp"}
                    size={20}
                    color={phoneVerified ? "#16A34A" : "#25D366"}
                    style={styles.phoneIcon}
                  />
                  <TextInput
                    ref={phoneInputRef}
                    style={styles.phoneInput}
                    placeholder="(00) 00000-0000"
                    placeholderTextColor="#94A3B8"
                    value={phone}
                    onChangeText={handlePhoneChange}
                    keyboardType="phone-pad"
                    maxLength={15}
                    editable={!phoneVerified || !!isEditing}
                    autoComplete="tel"
                    {...(Platform.OS === "web" && { style: [styles.phoneInput, { outlineStyle: "none" } as any] })}
                  />
                  {phoneVerified && (
                    <Text style={styles.verifiedTag}>Verificado ✓</Text>
                  )}
                </View>

                {/* Error */}
                {otpError && (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle" size={15} color="#DC2626" />
                    <Text style={styles.errorText}>{otpError}</Text>
                  </View>
                )}

                {/* Send OTP */}
                {!phoneVerified && !otpSent && (
                  <Pressable
                    style={[styles.waBtn, (sendingOtp || phone.replace(/\D/g, "").length < 10) && styles.waBtnDisabled]}
                    onPress={handleSendOtp}
                    disabled={sendingOtp || phone.replace(/\D/g, "").length < 10}
                  >
                    {sendingOtp
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                    }
                    <Text style={styles.waBtnText}>
                      {sendingOtp ? "Enviando..." : "Enviar código pelo WhatsApp"}
                    </Text>
                  </Pressable>
                )}

                {/* OTP input */}
                {!phoneVerified && otpSent && (
                  <View style={styles.otpArea}>
                    <Text style={styles.otpSentHint}>
                      Código enviado para <Text style={{ fontWeight: "700" }}>{phone}</Text>
                    </Text>
                    <TextInput
                      ref={otpInputRef}
                      style={styles.otpInput}
                      placeholder="000000"
                      placeholderTextColor="#CBD5E1"
                      value={otpCode}
                      onChangeText={handleOtpChange}
                      keyboardType="number-pad"
                      maxLength={6}
                      autoComplete="one-time-code"
                      {...(Platform.OS === "web" && { style: [styles.otpInput, { outlineStyle: "none" } as any] })}
                    />
                    <View style={styles.otpActions}>
                      {verifyingOtp
                        ? <ActivityIndicator color={colors.purple} />
                        : (
                          <Pressable
                            style={[styles.otpVerifyBtn, otpCode.length !== 6 && styles.otpVerifyBtnDisabled]}
                            onPress={() => handleVerifyOtp()}
                            disabled={otpCode.length !== 6 || verifyingOtp}
                          >
                            <Text style={styles.otpVerifyBtnText}>Verificar código</Text>
                          </Pressable>
                        )
                      }
                      <Pressable
                        onPress={handleSendOtp}
                        disabled={countdown > 0 || sendingOtp}
                        style={styles.resendBtn}
                      >
                        <Text style={[styles.resendText, countdown > 0 && styles.resendTextDisabled]}>
                          {countdown > 0 ? `Reenviar em ${countdown}s` : "Reenviar código"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* Success */}
                {phoneVerified && (
                  <View style={styles.verifiedBox}>
                    <Ionicons name="checkmark-circle" size={22} color="#16A34A" />
                    <Text style={styles.verifiedText}>Número verificado com sucesso!</Text>
                  </View>
                )}
              </View>
            )}

            {/* Step 2: Birth date */}
            {step === 2 && (
              <View style={styles.stepContent}>
                <Text style={styles.fieldLabel}>Data de nascimento</Text>
                <Text style={styles.fieldHint}>Usamos para personalizar sua experiência 🎉</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor="#94A3B8"
                  value={birthDate}
                  onChangeText={t => setBirthDate(formatBirthDate(t))}
                  keyboardType="number-pad"
                  maxLength={10}
                  autoComplete="bday"
                  {...(Platform.OS === "web" && { style: [styles.textInput, { outlineStyle: "none" } as any] })}
                />
                {birthDate.length === 10 && calculateAge(birthDate) !== null && (
                  <View style={styles.agePill}>
                    <Ionicons name="gift-outline" size={14} color={colors.purple} />
                    <Text style={styles.agePillText}>{calculateAge(birthDate)} anos</Text>
                  </View>
                )}
              </View>
            )}

            {/* Step 3: Gender */}
            {step === 3 && (
              <View style={styles.stepContent}>
                <Text style={styles.fieldHint}>Ajuda a personalizar seu perfil ✨</Text>
                <View style={styles.genderGrid}>
                  {GENDER_OPTIONS.map(opt => (
                    <Pressable
                      key={opt.id}
                      style={[styles.genderChip, gender === opt.id && styles.genderChipSelected]}
                      onPress={() => setGender(opt.id)}
                    >
                      <Ionicons
                        name={opt.icon}
                        size={16}
                        color={gender === opt.id ? "#fff" : colors.purple}
                      />
                      <Text style={[styles.genderChipText, gender === opt.id && styles.genderChipTextSelected]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Step 4: Dance preference */}
            {step === 4 && (
              <View style={styles.stepContent}>
                <Text style={styles.fieldHint}>Forma os melhores pares! 💃🕺</Text>
                <View style={styles.danceList}>
                  {DANCE_OPTIONS.map(opt => (
                    <Pressable
                      key={opt.id}
                      style={[styles.danceCard, dancePreference === opt.id && styles.danceCardSelected]}
                      onPress={() => setDancePreference(opt.id)}
                    >
                      <View style={[styles.danceCardIcon, dancePreference === opt.id && styles.danceCardIconSelected]}>
                        <Ionicons name={opt.icon} size={22} color={dancePreference === opt.id ? "#fff" : colors.purple} />
                      </View>
                      <View style={styles.danceCardText}>
                        <Text style={[styles.danceCardLabel, dancePreference === opt.id && styles.danceCardLabelSelected]}>
                          {opt.label}
                        </Text>
                        <Text style={[styles.danceCardDesc, dancePreference === opt.id && styles.danceCardDescSelected]}>
                          {opt.description}
                        </Text>
                      </View>
                      {dancePreference === opt.id && (
                        <Ionicons name="checkmark-circle" size={20} color="#fff" />
                      )}
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* ── Footer ── */}
          <View style={styles.footer}>
            {step > 1 && (
              <Pressable style={styles.backBtn} onPress={() => setStep(s => s - 1)}>
                <Ionicons name="arrow-back" size={18} color="#64748B" />
              </Pressable>
            )}
            <Pressable
              style={[
                styles.nextBtn,
                (saving || (step === 1 && !phoneVerified)) && styles.nextBtnDisabled,
              ]}
              onPress={goNext}
              disabled={saving || (step === 1 && !phoneVerified)}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : (
                  <>
                    <Text style={styles.nextBtnText}>{step === 4 ? "Finalizar" : "Continuar"}</Text>
                    {step < 4 && <Ionicons name="arrow-forward" size={16} color="#fff" />}
                    {step === 4 && <Text style={styles.nextBtnEmoji}>🎉</Text>}
                  </>
                )
              }
            </Pressable>
          </View>

          {/* Optional: skip + switch account */}
          {step > 1 && !isEditing && (
            <Pressable onPress={handleSave} style={styles.skipBtn}>
              <Text style={styles.skipText}>Pular opcionais e finalizar</Text>
            </Pressable>
          )}

          {!isEditing && onSwitchAccount && (
            <View style={styles.switchContainer}>
              <View style={styles.switchDivider} />
              <Pressable onPress={onSwitchAccount} style={styles.switchBtn}>
                <Ionicons name="log-out-outline" size={16} color="#fff" />
                <Text style={styles.switchBtnText}>Sair e usar outra conta</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modal: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },

  // Step indicator
  stepBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#E2E8F0",
  },
  stepCircleActive: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },
  stepCircleDone: {
    backgroundColor: "#16A34A",
    borderColor: "#16A34A",
  },
  stepCircleText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94A3B8",
  },
  stepCircleTextActive: {
    color: "#fff",
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 4,
    maxWidth: 48,
  },
  stepLineDone: {
    backgroundColor: colors.purple,
  },

  // Step header
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
  },
  stepEmoji: {
    fontSize: 36,
  },
  stepHeaderText: {
    flex: 1,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1E293B",
    lineHeight: 24,
  },
  divider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginBottom: 20,
  },

  // Content area
  content: {
    minHeight: 180,
  },
  stepContent: {
    gap: 10,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 2,
  },
  fieldHint: {
    fontSize: 13,
    color: "#94A3B8",
  },

  // Phone input row
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 4,
    gap: 8,
  },
  phoneRowVerified: {
    borderColor: "#16A34A",
    backgroundColor: "#F0FDF4",
  },
  phoneIcon: {
    flexShrink: 0,
  },
  phoneInput: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: "#1E293B",
    paddingVertical: 10,
    backgroundColor: "transparent",
  },
  verifiedTag: {
    fontSize: 11,
    fontWeight: "700",
    color: "#16A34A",
    flexShrink: 0,
  },

  // Error
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: "#DC2626",
    fontWeight: "500",
  },

  // WhatsApp button
  waBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#16A34A",
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 2,
  },
  waBtnDisabled: {
    opacity: 0.45,
  },
  waBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },

  // OTP area
  otpArea: {
    gap: 10,
    alignItems: "center",
    marginTop: 4,
  },
  otpSentHint: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
  },
  otpInput: {
    width: "65%",
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    paddingVertical: 12,
    fontSize: 30,
    fontWeight: "900",
    color: colors.purple,
    textAlign: "center",
    letterSpacing: 10,
  },
  otpActions: {
    alignItems: "center",
    gap: 6,
    width: "100%",
  },
  otpVerifyBtn: {
    backgroundColor: colors.purple,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  otpVerifyBtnDisabled: {
    opacity: 0.4,
  },
  otpVerifyBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  resendBtn: {
    padding: 6,
  },
  resendText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.purple,
  },
  resendTextDisabled: {
    color: "#94A3B8",
  },

  // Verified box
  verifiedBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F0FDF4",
    padding: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  verifiedText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#16A34A",
  },

  // Text input (birth date)
  textInput: {
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 20,
    fontWeight: "700",
    color: "#1E293B",
    textAlign: "center",
  },
  agePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: "center",
  },
  agePillText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.purple,
  },

  // Gender grid
  genderGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  genderChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
  },
  genderChipSelected: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },
  genderChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  genderChipTextSelected: {
    color: "#fff",
  },

  // Dance cards
  danceList: {
    gap: 8,
    marginTop: 4,
  },
  danceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 14,
  },
  danceCardSelected: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },
  danceCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
  },
  danceCardIconSelected: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  danceCardText: {
    flex: 1,
  },
  danceCardLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
  },
  danceCardLabelSelected: {
    color: "#fff",
  },
  danceCardDesc: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 1,
  },
  danceCardDescSelected: {
    color: "rgba(255,255,255,0.75)",
  },

  // Footer
  footer: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  backBtn: {
    width: 48,
    height: 48,
    backgroundColor: "#F1F5F9",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  nextBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.purple,
    paddingVertical: 14,
    borderRadius: 14,
  },
  nextBtnDisabled: {
    backgroundColor: "#CBD5E1",
  },
  nextBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  nextBtnEmoji: {
    fontSize: 16,
  },

  // Skip early
  skipBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  skipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94A3B8",
  },

  // Switch account
  switchContainer: {
    marginTop: 8,
  },
  switchDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginBottom: 12,
  },
  switchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#EF4444",
    paddingVertical: 12,
    borderRadius: 12,
  },
  switchBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
});
