import React from "react";
import { View, StyleSheet, ScrollView, Platform } from "react-native";

interface DesktopContentWrapperProps {
  children: React.ReactNode;
  padding?: number;
  maxWidth?: number;
  scrollable?: boolean;
}

/**
 * Wrapper para conteúdo de telas no layout desktop
 * Adiciona padding consistente e scroll quando necessário
 */
export default function DesktopContentWrapper({
  children,
  padding = 32,
  maxWidth,
  scrollable = true,
}: DesktopContentWrapperProps) {
  const content = (
    <View style={[styles.inner, maxWidth ? { maxWidth } : null]}>
      {children}
    </View>
  );

  if (scrollable) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { padding }]}
        showsVerticalScrollIndicator={true}
      >
        {content}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.container, { padding }]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  scrollContent: {
    flexGrow: 1,
  },
  inner: {
    flex: 1,
  },
});

