// Arquivo de teste - renomeie para App.tsx se quiser testar
import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>CDMF - Centro de Danças</Text>
      <Text style={styles.subtitle}>Plataforma: {Platform.OS}</Text>
      <Text style={styles.text}>Se você está vendo isso, o React está funcionando!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFB300",
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 18,
    color: "#9C27B0",
    marginBottom: 8,
  },
  text: {
    fontSize: 16,
    color: "#FFFFFF",
    textAlign: "center",
  },
});

