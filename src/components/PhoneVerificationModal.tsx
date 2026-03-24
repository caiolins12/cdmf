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

type Props = {
  visible: boolean;
  initialPhone?: string;
  onComplete: (phone: string) => Promise<void>;
  onSwitchAccount?: () => void;
};

function formatPhone(value: string): string {
  const n = value.replace(/\D/g, "");
  if (n.length <= 2) return n;
  if (n.length <= 7) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  if (n.length <= 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7, 11)}`;
}

export default function PhoneVerificationModal({
  visible,
  initialPhone,
  onComplete,
  onSwitchAccount,
}: Props) {
  const [phone, setPhone] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const phoneInputRef = useRef<TextInput>(null);
  const otpInputRef = useRef<TextInput>(null);
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (visible && !hasInitialized.current) {
      hasInitialized.current = true;
      setPhone(initialPhone ? formatPhone(initialPhone) : "");
    }
    if (!visible) {
      hasInitialized.current = false;
      setPhone("");
      setPhoneVerified(false);
      setOtpSent(false);
      setOtpCode("");
      setOtpError(null);
      setCountdown(0);
    }
  }, [visible, initialPhone]);

  useEffect(() => {
    if (otpSent && !phoneVerified) {
      setTimeout(() => otpInputRef.current?.focus(), 300);
    }
  }, [otpSent, phoneVerified]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

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

  const handleConfirm = async () => {
    if (!phoneVerified) return;
    setSaving(true);
    try {
      await onComplete(phone);
    } catch {
      // error surfaced by parent
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.modal}>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="logo-whatsapp" size={28} color="#25D366" />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>Verificação de número</Text>
              <Text style={styles.subtitle}>
                Confirme seu WhatsApp para continuar usando o app
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Phone input */}
          <Text style={styles.fieldLabel}>Número do WhatsApp</Text>
          <View style={[styles.phoneRow, phoneVerified && styles.phoneRowVerified]}>
            <Ionicons
              name={phoneVerified ? "checkmark-circle" : "logo-whatsapp"}
              size={20}
              color={phoneVerified ? "#16A34A" : "#25D366"}
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
              editable={!phoneVerified}
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

          {/* Send OTP button */}
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

          {/* Verified success */}
          {phoneVerified && (
            <View style={styles.verifiedBox}>
              <Ionicons name="checkmark-circle" size={20} color="#16A34A" />
              <Text style={styles.verifiedText}>Número verificado com sucesso!</Text>
            </View>
          )}

          {/* Confirm button */}
          <Pressable
            style={[styles.confirmBtn, (!phoneVerified || saving) && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!phoneVerified || saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : (
                <>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.confirmBtnText}>Confirmar</Text>
                </>
              )
            }
          </Pressable>

          {/* Switch account */}
          {onSwitchAccount && (
            <View style={styles.switchContainer}>
              <View style={styles.switchDivider} />
              <Pressable onPress={onSwitchAccount} style={styles.switchBtn}>
                <Ionicons name="log-out-outline" size={15} color="#fff" />
                <Text style={styles.switchBtnText}>Sair e usar outra conta</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

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
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#F0FDF4",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1E293B",
    marginBottom: 3,
  },
  subtitle: {
    fontSize: 13,
    color: "#64748B",
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: "#F1F5F9",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
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
    overflow: "hidden",
  },
  phoneRowVerified: {
    borderColor: "#16A34A",
    backgroundColor: "#F0FDF4",
  },
  phoneInput: {
    flex: 1,
    minWidth: 0,
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
  waBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#16A34A",
    paddingVertical: 13,
    borderRadius: 14,
  },
  waBtnDisabled: {
    opacity: 0.45,
  },
  waBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  otpArea: {
    gap: 10,
    alignItems: "center",
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
  verifiedBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F0FDF4",
    padding: 12,
    borderRadius: 12,
  },
  verifiedText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#16A34A",
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.purple,
    paddingVertical: 14,
    borderRadius: 14,
  },
  confirmBtnDisabled: {
    backgroundColor: "#CBD5E1",
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  switchContainer: {
    gap: 12,
  },
  switchDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
  },
  switchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#EF4444",
    paddingVertical: 11,
    borderRadius: 12,
  },
  switchBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
});
