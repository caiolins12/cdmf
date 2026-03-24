import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { showAlert as _showAlert, showConfirm as _showConfirm } from "../../utils/alert";
import { Ionicons } from "@/shims/icons";
import BaseModal from "./BaseModal";
import ModalButtons from "./ModalButtons";
import { colors } from "../../theme/colors";

interface ConfirmDialogProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger" | "success";
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
}

export default function ConfirmDialog({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  icon,
  loading = false,
}: ConfirmDialogProps) {
  const iconColor = variant === "danger" ? colors.danger : variant === "success" ? colors.green : colors.purple;
  const defaultIcon = variant === "danger" ? "warning" : variant === "success" ? "checkmark-circle" : "help-circle";

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      size="small"
      closeOnOverlay={!loading}
      showCloseButton={false}
      scrollable={false}
    >
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: iconColor + "15" }]}>
          <Ionicons name={icon || defaultIcon} size={32} color={iconColor} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
      <View style={styles.buttons}>
        <ModalButtons
          primaryLabel={confirmLabel}
          secondaryLabel={cancelLabel}
          onPrimaryPress={onConfirm}
          onSecondaryPress={onClose}
          primaryLoading={loading}
          variant={variant}
        />
      </View>
    </BaseModal>
  );
}

// Helper function to show confirm dialog
export function showConfirmDialog(options: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  variant?: "default" | "danger";
}) {
  const { title, message, onConfirm, onCancel } = options;
  _showConfirm(title, message, onConfirm, onCancel);
}

// Helper function to show simple alert
export function showAlert(title: string, message: string) {
  _showAlert(title, message);
}

const styles = StyleSheet.create({
  content: {
    alignItems: "center",
    paddingVertical: 8,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E293B",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
  },
  buttons: {
    marginTop: 20,
  },
});


