import React from "react";
import { View, StyleSheet, ScrollView, Pressable, Text, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";

import CdmfHeader from "../../components/CdmfHeader";
import SectionHeader from "../../components/SectionHeader";
import PaymentCard from "../../components/PaymentCard";
import { colors } from "../../theme/colors";
import { useDesktop } from "../../contexts/DesktopContext";
import { useTheme } from "../../contexts/ThemeContext";
import { StudentRootStackParamList } from "../../navigation/StudentRootStack";
import { Payment } from "./PaymentDetailsScreen";

type Nav = NativeStackNavigationProp<StudentRootStackParamList>;

export default function StudentPaymentsScreen() {
  const navigation = useNavigation<Nav>();
  const { isDesktopMode } = useDesktop();
  const { colors: themeColors, isDark } = useTheme();

  const payments: Payment[] = [
    { title: "Mensalidade de Outubro", due: "Vencimento 01 - NOV - 2025", amount: "R$ 91,00", status: "Pendente" },
    { title: "Mensalidade de Setembro", due: "Vencimento 01 - OUT - 2025", amount: "R$ 91,00", status: "Pago" },
    { title: "Mensalidade de Agosto", due: "Vencimento 01 - SET - 2025", amount: "R$ 91,00", status: "Pago" },
  ];

  const supportLinks = [
    { text: "Estou com problemas no pagamento", url: "https://wa.me/5500000000000" },
    { text: "Valor incorreto da mensalidade", url: "https://wa.me/5500000000000" },
    { text: "Encerramento da matrícula", url: "https://wa.me/5500000000000" },
  ];

  return (
    <View style={[styles.screen, isDesktopMode && desktopStyles.screen, isDesktopMode && { backgroundColor: themeColors.bg }]}>
      {!isDesktopMode && <CdmfHeader />}
      {!isDesktopMode && <SectionHeader title="Pagamentos" />}

      <ScrollView contentContainerStyle={[styles.content, isDesktopMode && desktopStyles.content]} showsVerticalScrollIndicator={false}>
        <View style={[
          styles.block, 
          isDesktopMode && desktopStyles.block, 
          isDesktopMode && { 
            backgroundColor: themeColors.bgCard, 
            borderColor: themeColors.border,
            borderWidth: 1,
            borderRadius: 16,
            padding: 20,
          }
        ]}>
          {payments.map((p, idx) => (
            <View key={idx} style={[{ marginBottom: 10 }, isDesktopMode && desktopStyles.paymentCardWrapper]}>
              <PaymentCard
                {...p}
                onPress={() => navigation.navigate("PaymentDetails", { payment: p })}
              />
            </View>
          ))}

          <Pressable style={[styles.moreRow, isDesktopMode && desktopStyles.moreRow]} onPress={() => {}}>
            <Ionicons name="arrow-forward" size={18} color={themeColors.purple} />
            <Text style={[styles.moreText, isDesktopMode && { color: themeColors.purple }]}>Mensalidades anteriores</Text>
          </Pressable>
        </View>

        {!isDesktopMode && <SectionHeader title="Suporte" />}
        {isDesktopMode && (
          <View style={desktopStyles.sectionHeader}>
            <Text style={[desktopStyles.sectionTitle, { color: themeColors.textMuted }]}>Suporte</Text>
          </View>
        )}

        <View style={[styles.supportBox, isDesktopMode && desktopStyles.supportBox, isDesktopMode && { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          <Ionicons name="chatbubbles-outline" size={isDesktopMode ? 40 : 54} color={isDesktopMode ? themeColors.textMuted : colors.text} />
        </View>

        <View style={[styles.links, isDesktopMode && desktopStyles.links, isDesktopMode && { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
          {supportLinks.map((i, idx) => (
            <Pressable key={idx} style={[styles.linkRow, isDesktopMode && { borderBottomColor: themeColors.border }]} onPress={() => Linking.openURL(i.url)}>
              <Ionicons name="arrow-forward" size={18} color={themeColors.purple} />
              <Text style={[styles.linkText, isDesktopMode && { color: themeColors.text }]}>{i.text}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ height: 18 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 16 },

  block: { padding: 12, paddingTop: 14 },

  moreRow: {
    marginTop: 6,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  moreText: { color: colors.purple, fontWeight: "900" },

  supportBox: {
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
  },

  links: { padding: 16, gap: 10, backgroundColor: "white" },
  linkRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  linkText: { color: colors.purple, fontWeight: "900" },
});

// Desktop styles
const desktopStyles = StyleSheet.create({
  screen: {
    backgroundColor: "#F8FAFC",
  },
  content: {
    padding: 32,
    paddingTop: 24,
    maxWidth: 1000,
  },
  block: {
    padding: 0,
    paddingTop: 0,
  },
  paymentCardWrapper: {
    maxWidth: 500,
    marginBottom: 12,
  },
  moreRow: {
    justifyContent: "flex-start",
    paddingHorizontal: 0,
    maxWidth: 500,
  },
  sectionHeader: {
    marginBottom: 16,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1E293B",
  },
  supportBox: {
    maxWidth: 400,
    padding: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  links: {
    maxWidth: 400,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginTop: 16,
  },
});
