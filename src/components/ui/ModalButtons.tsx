import React from "react";
import { View, Pressable, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@/shims/icons";
import { colors } from "../../theme/colors";

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface ModalButtonsProps {
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimaryPress?: () => void;
  onSecondaryPress?: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  primaryIcon?: keyof typeof Ionicons.glyphMap;
  variant?: "default" | "danger" | "success";
  layout?: "row" | "column";
}

export function PrimaryButton({ label, onPress, disabled, loading, icon }: ButtonProps) {
  return (
    <Pressable
      style={[styles.btnPrimary, disabled && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color="#fff" />}
          <Text style={styles.btnPrimaryText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, disabled }: ButtonProps) {
  return (
    <Pressable
      style={[styles.btnSecondary, disabled && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.btnSecondaryText}>{label}</Text>
    </Pressable>
  );
}

export function DangerButton({ label, onPress, disabled, loading, icon }: ButtonProps) {
  return (
    <Pressable
      style={[styles.btnDanger, disabled && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color="#fff" />}
          <Text style={styles.btnDangerText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function SuccessButton({ label, onPress, disabled, loading, icon }: ButtonProps) {
  return (
    <Pressable
      style={[styles.btnSuccess, disabled && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color="#fff" />}
          <Text style={styles.btnSuccessText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export default function ModalButtons({
  primaryLabel = "Salvar",
  secondaryLabel = "Cancelar",
  onPrimaryPress,
  onSecondaryPress,
  primaryDisabled = false,
  primaryLoading = false,
  primaryIcon,
  variant = "default",
  layout = "row",
}: ModalButtonsProps) {
  const isColumn = layout === "column";

  const PrimaryBtn = variant === "danger" ? DangerButton : variant === "success" ? SuccessButton : PrimaryButton;

  return (
    <View style={[styles.container, isColumn && styles.containerColumn]}>
      {onSecondaryPress && (
        <SecondaryButton
          label={secondaryLabel}
          onPress={onSecondaryPress}
          disabled={primaryLoading}
        />
      )}
      {onPrimaryPress && (
        <PrimaryBtn
          label={primaryLabel}
          onPress={onPrimaryPress}
          disabled={primaryDisabled}
          loading={primaryLoading}
          icon={primaryIcon}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 10,
  },
  containerColumn: {
    flexDirection: "column",
  },
  btnPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.purple,
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnPrimaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  btnSecondary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnSecondaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  btnDanger: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.danger,
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnDangerText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  btnSuccess: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.green,
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnSuccessText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  btnDisabled: {
    opacity: 0.5,
  },
});


