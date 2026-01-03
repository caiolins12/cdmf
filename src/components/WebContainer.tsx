import React from "react";
import { View, StyleSheet, Platform } from "react-native";

type Props = {
  children: React.ReactNode;
  maxWidth?: number;
  backgroundColor?: string;
};

/**
 * Container responsivo
 * - Em mobile nativo: retorna children diretamente
 * - Em web: aplica container com altura total
 */
export default function WebContainer({ children }: Props) {
  // Em mobile nativo, retorna children sem wrapper
  if (Platform.OS !== "web") {
    return <View style={styles.nativeContainer}>{children}</View>;
  }
  
  // Em web
  return (
    <View style={styles.webContainer}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  nativeContainer: {
    flex: 1,
  },
  webContainer: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#fff",
  },
});
