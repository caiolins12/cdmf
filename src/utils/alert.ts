import { Alert, Platform } from "react-native";

type AlertButton = {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
};

/**
 * Cross-platform alert helper
 * - Mobile: usa Alert.alert do React Native
 * - Web: usa window.confirm/alert do navegador
 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[]
) {
  if (Platform.OS === "web") {
    // Web: usa confirmação nativa do navegador
    if (!buttons || buttons.length === 0) {
      window.alert(message ? `${title}\n\n${message}` : title);
      return;
    }

    // Se tem botões de cancelar e confirmar
    const cancelBtn = buttons.find(b => b.style === "cancel");
    const confirmBtn = buttons.find(b => b.style !== "cancel") || buttons[0];

    if (buttons.length > 1) {
      const confirmed = window.confirm(message ? `${title}\n\n${message}` : title);
      if (confirmed) {
        confirmBtn?.onPress?.();
      } else {
        cancelBtn?.onPress?.();
      }
    } else {
      window.alert(message ? `${title}\n\n${message}` : title);
      buttons[0]?.onPress?.();
    }
  } else {
    // Mobile: usa Alert.alert padrão
    Alert.alert(title, message, buttons);
  }
}

/**
 * Confirmação simples (sim/não)
 */
export function showConfirm(
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel?: () => void
) {
  showAlert(title, message, [
    { text: "Cancelar", style: "cancel", onPress: onCancel },
    { text: "Confirmar", style: "destructive", onPress: onConfirm },
  ]);
}

/**
 * Alerta simples (apenas OK)
 */
export function showMessage(title: string, message?: string, onDismiss?: () => void) {
  showAlert(title, message, [
    { text: "OK", onPress: onDismiss },
  ]);
}

