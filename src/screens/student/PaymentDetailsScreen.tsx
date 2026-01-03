import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { RouteProp, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import CdmfHeader from "../../components/CdmfHeader";
import SectionHeader from "../../components/SectionHeader";
import { colors } from "../../theme/colors";
import { StudentRootStackParamList } from "../../navigation/StudentRootStack";

export type Payment = {
  title: string;
  due: string;
  amount: string;
  status: "Pendente" | "Pago";
};

type R = RouteProp<StudentRootStackParamList, "PaymentDetails">;

export default function PaymentDetailsScreen() {
  const route = useRoute<R>();
  const { payment } = route.params;

  return (
    <View style={styles.screen}>
      <CdmfHeader />
      <SectionHeader title="Pagamentos" />

      <View style={styles.content}>
        <View style={styles.bigCard}>
          <Text style={styles.bigTitle}>{payment.title}</Text>
          <Text style={styles.bigDue}>{payment.due}</Text>
          <Text style={styles.bigAmount}>{payment.amount}</Text>

          <Text style={styles.bigStatus}>
            Status:{" "}
            <Text style={{ color: payment.status === "Pago" ? "#1B8E3E" : colors.danger, fontWeight: "900" }}>
              {payment.status}
            </Text>
          </Text>
        </View>

        <View style={styles.pixArea}>
          <Ionicons name="qr-code-outline" size={64} color="#00B2A9" />
          <Text style={styles.pixText}>PIX</Text>
        </View>

        <Pressable style={styles.button} onPress={() => {}}>
          <Text style={styles.buttonText}>CONTINUAR PARA PAGAMENTO</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "white" },
  content: { flex: 1, padding: 18, alignItems: "center" },

  bigCard: {
    width: "100%",
    backgroundColor: "#E3E3E3",
    borderRadius: 26,
    paddingVertical: 26,
    paddingHorizontal: 18,
    alignItems: "center",
    marginTop: 18,
  },
  bigTitle: { fontSize: 22, fontWeight: "900", color: colors.text, textAlign: "center" },
  bigDue: { marginTop: 12, fontWeight: "700", color: colors.text, opacity: 0.9, textAlign: "center" },
  bigAmount: { marginTop: 18, fontSize: 34, fontWeight: "900", color: colors.text },
  bigStatus: { marginTop: 16, fontWeight: "700", color: colors.text },

  pixArea: { marginTop: 26, alignItems: "center", gap: 6 },
  pixText: { fontSize: 20, fontWeight: "900", color: colors.text },

  button: {
    marginTop: 22,
    width: "100%",
    backgroundColor: colors.purple,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: { color: "white", fontWeight: "900" },
});
