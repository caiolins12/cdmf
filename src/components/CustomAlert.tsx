import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Animated,
  Dimensions,
} from "react-native";
import { Ionicons } from "@/shims/icons";
import { useAlert, AlertConfig } from "../contexts/AlertContext";

const { width } = Dimensions.get("window");

const CustomAlert: React.FC = () => {
  const { alerts, hideAlert } = useAlert();
  const [currentAlert, setCurrentAlert] = useState<AlertConfig | null>(null);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.8));

  useEffect(() => {
    if (alerts.length > 0 && !currentAlert) {
      setCurrentAlert(alerts[0]);
    }
  }, [alerts, currentAlert]);

  useEffect(() => {
    if (currentAlert) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.8);
    }
  }, [currentAlert]);

  const handleDismiss = (onPress?: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.8,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (currentAlert) {
        hideAlert(currentAlert.id);
        setCurrentAlert(null);
        onPress?.();
      }
    });
  };

  const getAlertStyle = (type: string) => {
    switch (type) {
      case "success":
        return {
          icon: "checkmark-circle" as const,
          color: "#10B981",
          bgColor: "#ECFDF5",
          borderColor: "#10B981",
        };
      case "error":
        return {
          icon: "close-circle" as const,
          color: "#EF4444",
          bgColor: "#FEF2F2",
          borderColor: "#EF4444",
        };
      case "warning":
        return {
          icon: "warning" as const,
          color: "#F59E0B",
          bgColor: "#FFFBEB",
          borderColor: "#F59E0B",
        };
      case "info":
        return {
          icon: "information-circle" as const,
          color: "#3B82F6",
          bgColor: "#EFF6FF",
          borderColor: "#3B82F6",
        };
      case "confirm":
        return {
          icon: "help-circle" as const,
          color: "#8B5CF6",
          bgColor: "#F5F3FF",
          borderColor: "#8B5CF6",
        };
      default:
        return {
          icon: "information-circle" as const,
          color: "#6B7280",
          bgColor: "#F9FAFB",
          borderColor: "#D1D5DB",
        };
    }
  };

  if (!currentAlert) return null;

  const alertStyle = getAlertStyle(currentAlert.type);

  return (
    <Modal transparent visible={!!currentAlert} animationType="none">
      <Pressable
        style={styles.overlay}
        onPress={() => {
          // Permite fechar clicando fora apenas se não for confirm
          if (currentAlert.type !== "confirm") {
            handleDismiss(currentAlert.onDismiss);
          }
        }}
      >
        <Animated.View
          style={[
            styles.alertContainer,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <Pressable style={styles.alertContent}>
            {/* Header com ícone */}
            <View style={[styles.iconContainer, { backgroundColor: alertStyle.bgColor }]}>
              <Ionicons name={alertStyle.icon} size={48} color={alertStyle.color} />
            </View>

            {/* Título */}
            <Text style={styles.title}>{currentAlert.title}</Text>

            {/* Mensagem */}
            {currentAlert.message && (
              <Text style={styles.message}>{currentAlert.message}</Text>
            )}

            {/* Botões */}
            <View
              style={[
                styles.buttonsContainer,
                currentAlert.buttons && currentAlert.buttons.length > 1
                  ? styles.buttonsRow
                  : styles.buttonsColumn,
              ]}
            >
              {currentAlert.buttons?.map((button, index) => {
                const isDestructive = button.style === "destructive";
                const isCancel = button.style === "cancel";

                return (
                  <Pressable
                    key={index}
                    style={({ pressed }) => [
                      styles.button,
                      isDestructive && { backgroundColor: alertStyle.color },
                      isCancel && styles.cancelButton,
                      !isDestructive && !isCancel && { backgroundColor: alertStyle.color },
                      pressed && styles.buttonPressed,
                      currentAlert.buttons && currentAlert.buttons.length > 1 && styles.buttonFlex,
                    ]}
                    onPress={() => handleDismiss(button.onPress)}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        isCancel && styles.cancelButtonText,
                        !isCancel && styles.confirmButtonText,
                      ]}
                    >
                      {button.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  alertContainer: {
    width: Math.min(width * 0.9, 450),
    maxWidth: 450,
  },
  alertContent: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    boxShadow: "0 10px 40px rgba(0, 0, 0, 0.25)",
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  message: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  buttonsContainer: {
    width: "100%",
  },
  buttonsRow: {
    flexDirection: "row",
    gap: 12,
  },
  buttonsColumn: {
    flexDirection: "column",
    gap: 12,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  buttonFlex: {
    flex: 1,
  },
  cancelButton: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  buttonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  cancelButtonText: {
    color: "#6B7280",
  },
  confirmButtonText: {
    color: "#fff",
  },
});

export default CustomAlert;


