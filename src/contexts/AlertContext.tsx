import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { setAlertContext } from "../utils/alert";

export type AlertType = "success" | "error" | "warning" | "info" | "confirm";

export interface AlertButton {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
}

export interface AlertConfig {
  id: string;
  type: AlertType;
  title: string;
  message?: string;
  buttons?: AlertButton[];
  onDismiss?: () => void;
}

interface AlertContextData {
  showAlert: (
    type: AlertType,
    title: string,
    message?: string,
    buttons?: AlertButton[],
    onDismiss?: () => void
  ) => void;
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
  hideAlert: (id: string) => void;
  alerts: AlertConfig[];
}

const AlertContext = createContext<AlertContextData>({} as AlertContextData);

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error("useAlert deve ser usado dentro de um AlertProvider");
  }
  return context;
};

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alerts, setAlerts] = useState<AlertConfig[]>([]);

  const showAlert = useCallback(
    (
      type: AlertType,
      title: string,
      message?: string,
      buttons?: AlertButton[],
      onDismiss?: () => void
    ) => {
      const id = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const defaultButtons: AlertButton[] = buttons || [
        {
          text: "OK",
          style: "default",
          onPress: () => {
            hideAlert(id);
            onDismiss?.();
          },
        },
      ];

      const alert: AlertConfig = {
        id,
        type,
        title,
        message,
        buttons: defaultButtons,
        onDismiss,
      };

      setAlerts((prev) => [...prev, alert]);

      // Auto-dismiss após 10 segundos se for info, success ou warning
      if (type === "success" || type === "info" || type === "warning") {
        setTimeout(() => {
          hideAlert(id);
        }, 10000);
      }
    },
    []
  );

  const hideAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== id));
  }, []);

  const showSuccess = useCallback(
    (title: string, message?: string, onDismiss?: () => void) => {
      showAlert("success", title, message, undefined, onDismiss);
    },
    [showAlert]
  );

  const showError = useCallback(
    (title: string, message?: string, onDismiss?: () => void) => {
      showAlert("error", title, message, undefined, onDismiss);
    },
    [showAlert]
  );

  const showWarning = useCallback(
    (title: string, message?: string, onDismiss?: () => void) => {
      showAlert("warning", title, message, undefined, onDismiss);
    },
    [showAlert]
  );

  const showInfo = useCallback(
    (title: string, message?: string, onDismiss?: () => void) => {
      showAlert("info", title, message, undefined, onDismiss);
    },
    [showAlert]
  );

  const showConfirm = useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => void,
      onCancel?: () => void,
      confirmText: string = "Confirmar",
      cancelText: string = "Cancelar"
    ) => {
      const id = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const buttons: AlertButton[] = [
        {
          text: cancelText,
          style: "cancel",
          onPress: () => {
            hideAlert(id);
            onCancel?.();
          },
        },
        {
          text: confirmText,
          style: "destructive",
          onPress: () => {
            hideAlert(id);
            onConfirm();
          },
        },
      ];

      showAlert("confirm", title, message, buttons);
    },
    [showAlert]
  );

  const value = {
    showAlert,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showConfirm,
    hideAlert,
    alerts,
  };

  // Registra o contexto globalmente para ser usado pelo alert.ts
  useEffect(() => {
    setAlertContext(value);
    return () => setAlertContext(null);
  }, [value]);

  return (
    <AlertContext.Provider value={value}>
      {children}
    </AlertContext.Provider>
  );
};
