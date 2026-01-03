import React from "react";
import { Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { useTheme } from "../contexts/ThemeContext";

type Status = "Pendente" | "Pago";

type Props = {
  title: string;
  due: string;
  amount: string;
  status: Status;
  onPress?: () => void;
};

export default function PaymentCard({ title, due, amount, status, onPress }: Props) {
  const { colors: themeColors, isDark } = useTheme();
  const statusColor = status === "Pago" ? (isDark ? "#4ADE80" : "#1B8E3E") : (isDark ? "#F87171" : colors.danger);

  return (
    <Pressable onPress={onPress} style={[styles.card, { backgroundColor: isDark ? themeColors.bgSecondary : "#E3E3E3" }]}>
      <Text style={[styles.title, { color: themeColors.text }]}>{title}</Text>
      <Text style={[styles.due, { color: themeColors.textSecondary }]}>{due}</Text>
      <Text style={[styles.amount, { color: themeColors.text }]}>{amount}</Text>

      <Text style={[styles.status, { color: themeColors.textSecondary }]}>
        Status: <Text style={{ color: statusColor, fontWeight: "900" }}>{status}</Text>
      </Text>

      <Ionicons name="document-text-outline" size={22} color={themeColors.textMuted} style={styles.icon} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#E3E3E3",
    borderRadius: 14,
    padding: 12,
    position: "relative",
  },
  title: { fontSize: 16, fontWeight: "900", color: colors.text },
  due: { marginTop: 2, color: colors.text, opacity: 0.85, fontWeight: "700" },
  amount: { marginTop: 6, fontSize: 16, fontWeight: "900", color: colors.text },
  status: { marginTop: 4, fontWeight: "700", color: colors.text },
  icon: { position: "absolute", right: 12, top: 18 },
});
