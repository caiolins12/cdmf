import React from "react";
import { View, Modal, Pressable, Text, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView } from "react-native";
import { Ionicons } from "@/shims/icons";
import { colors } from "../../theme/colors";

export interface BaseModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "small" | "medium" | "large";
  closeOnOverlay?: boolean;
  showCloseButton?: boolean;
  loading?: boolean;
  scrollable?: boolean;
}

export default function BaseModal({
  visible,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  size = "medium",
  closeOnOverlay = true,
  showCloseButton = true,
  loading = false,
  scrollable = true,
}: BaseModalProps) {
  const modalWidth = size === "small" ? 320 : size === "large" ? 500 : 400;
  const maxHeight = size === "large" ? "90%" : "85%";

  const handleOverlayPress = () => {
    if (closeOnOverlay && !loading) {
      onClose();
    }
  };

  const content = (
    <View style={[styles.modal, { maxWidth: modalWidth, maxHeight }]}>
      {/* Header */}
      {(title || icon || showCloseButton) && (
        <View style={styles.header}>
          {icon && <View style={styles.iconContainer}>{icon}</View>}
          <View style={styles.titleContainer}>
            {title && <Text style={styles.title}>{title}</Text>}
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
          {showCloseButton && (
            <Pressable style={styles.closeBtn} onPress={onClose} disabled={loading}>
              <Ionicons name="close" size={24} color="#64748B" />
            </Pressable>
          )}
        </View>
      )}

      {/* Content */}
      {scrollable ? (
        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={styles.scrollContentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.content}>{children}</View>
      )}

      {/* Footer */}
      {footer && <View style={styles.footer}>{footer}</View>}

      {/* Loading Overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.purple} />
        </View>
      )}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleOverlayPress} />
        {content}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modal: {
    backgroundColor: "#fff",
    borderRadius: 20,
    width: "100%",
    overflow: "hidden",
    position: "relative",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  iconContainer: {
    marginRight: 12,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E293B",
  },
  subtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
    marginLeft: 8,
  },
  scrollContent: {
    maxHeight: 400,
  },
  scrollContentContainer: {
    padding: 20,
  },
  content: {
    padding: 20,
  },
  footer: {
    padding: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
  },
});


