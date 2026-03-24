import { AlertButton as RNAlertButton } from "../contexts/AlertContext";

type AlertButton = {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
};

// Referência global para o contexto de alerta
// Será preenchida pelo AlertProvider
let alertContextRef: {
  showAlert: (type: any, title: string, message?: string, buttons?: any[], onDismiss?: () => void) => void;
  showSuccess: (title: string, message?: string, onDismiss?: () => void) => void;
  showError: (title: string, message?: string, onDismiss?: () => void) => void;
  showWarning: (title: string, message?: string, onDismiss?: () => void) => void;
  showInfo: (title: string, message?: string, onDismiss?: () => void) => void;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    onCancel?: () => void,
    confirmText?: string,
    cancelText?: string
  ) => void;
} | null = null;

export function setAlertContext(context: typeof alertContextRef) {
  alertContextRef = context;
}

/**
 * Alerta customizado profissional
 * Usa o sistema de alertas customizados com design moderno
 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[]
) {
  if (!alertContextRef) {
    console.warn("AlertContext não foi inicializado. Use AlertProvider no root da aplicação.");
    return;
  }

  if (!buttons || buttons.length === 0) {
    // Alerta simples - tenta determinar o tipo pela mensagem
    const type = detectAlertType(title, message);
    alertContextRef.showAlert(type, title, message);
    return;
  }

  if (buttons.length === 1) {
    // Alerta com um botão
    const type = detectAlertType(title, message);
    alertContextRef.showAlert(type, title, message, buttons, buttons[0].onPress);
    return;
  }

  // Alerta com múltiplos botões (confirmação)
  const cancelBtn = buttons.find(b => b.style === "cancel");
  const confirmBtn = buttons.find(b => b.style !== "cancel") || buttons[buttons.length - 1];

  alertContextRef.showConfirm(
    title,
    message || "",
    confirmBtn.onPress || (() => {}),
    cancelBtn?.onPress,
    confirmBtn.text,
    cancelBtn?.text
  );
}

/**
 * Detecta o tipo de alerta baseado no título e mensagem
 */
function detectAlertType(title: string, message?: string): "success" | "error" | "warning" | "info" {
  const text = `${title} ${message || ""}`.toLowerCase();

  if (
    text.includes("sucesso") ||
    text.includes("criado") ||
    text.includes("atualizado") ||
    text.includes("removido") ||
    text.includes("salvo") ||
    text.includes("concluído") ||
    text.includes("✅") ||
    text.includes("🎉")
  ) {
    return "success";
  }

  if (
    text.includes("erro") ||
    text.includes("falha") ||
    text.includes("não foi possível") ||
    text.includes("problema") ||
    text.includes("❌")
  ) {
    return "error";
  }

  if (
    text.includes("atenção") ||
    text.includes("aviso") ||
    text.includes("cuidado") ||
    text.includes("⚠️")
  ) {
    return "warning";
  }

  return "info";
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
  if (!alertContextRef) {
    console.warn("AlertContext não foi inicializado. Use AlertProvider no root da aplicação.");
    return;
  }

  alertContextRef.showConfirm(title, message, onConfirm, onCancel);
}

/**
 * Alerta simples (apenas OK)
 */
export function showMessage(title: string, message?: string, onDismiss?: () => void) {
  if (!alertContextRef) {
    console.warn("AlertContext não foi inicializado. Use AlertProvider no root da aplicação.");
    return;
  }

  const type = detectAlertType(title, message);
  alertContextRef.showAlert(type, title, message, undefined, onDismiss);
}

/**
 * Alerta de sucesso
 */
export function showSuccess(title: string, message?: string, onDismiss?: () => void) {
  if (!alertContextRef) {
    console.warn("AlertContext não foi inicializado.");
    return;
  }
  alertContextRef.showSuccess(title, message, onDismiss);
}

/**
 * Alerta de erro
 */
export function showError(title: string, message?: string, onDismiss?: () => void) {
  if (!alertContextRef) {
    console.warn("AlertContext não foi inicializado.");
    return;
  }
  alertContextRef.showError(title, message, onDismiss);
}

/**
 * Alerta de aviso
 */
export function showWarning(title: string, message?: string, onDismiss?: () => void) {
  if (!alertContextRef) {
    console.warn("AlertContext não foi inicializado.");
    return;
  }
  alertContextRef.showWarning(title, message, onDismiss);
}

/**
 * Alerta informativo
 */
export function showInfo(title: string, message?: string, onDismiss?: () => void) {
  if (!alertContextRef) {
    console.warn("AlertContext não foi inicializado.");
    return;
  }
  alertContextRef.showInfo(title, message, onDismiss);
}

