import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import CdmfHeader from "../../components/CdmfHeader";
import SectionHeader from "../../components/SectionHeader";
import { colors } from "../../theme/colors";
import { useDesktop } from "../../contexts/DesktopContext";

type PaymentStatus = "Pago" | "Pendente" | "Atrasado";

type Invoice = {
  id: string;
  name: string;          // aluno
  amount: number;        // em reais
  dueDate: string;       // "01/11/2025"
  status: PaymentStatus;
  classesCount: number;  // turmas do aluno
};

type Paid = {
  id: string;
  name: string;
  amount: number;
  paidAt: string; // "02/11/2025"
  method: "PIX" | "Dinheiro" | "Cartão";
};

function brl(v: number) {
  // simples e seguro p/ mock (depois usamos Intl com locale)
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

function StatusDot({ status }: { status: PaymentStatus }) {
  const color =
    status === "Pago" ? "#1B8E3E" : status === "Pendente" ? "#B8860B" : colors.danger;

  const icon =
    status === "Pago"
      ? "checkmark-circle"
      : status === "Pendente"
      ? "time"
      : "alert-circle";

  return <Ionicons name={icon as any} size={18} color={color} />;
}

function KpiCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.kpiCard}>
      <View style={styles.kpiTop}>
        <Ionicons name={icon} size={20} color={colors.text} />
        <Text style={styles.kpiTitle}>{title}</Text>
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      {subtitle ? <Text style={styles.kpiSub}>{subtitle}</Text> : null}
    </View>
  );
}

function ActionTile({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.tile} onPress={onPress}>
      <Ionicons name={icon} size={22} color={colors.text} />
      <Text style={styles.tileText} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function TeacherFinanceScreen() {
  const { isDesktopMode } = useDesktop();
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState<"NOV/2025" | "OUT/2025" | "SET/2025">("NOV/2025");

  // Mock (depois vem do Firebase)
  const invoices: Invoice[] = [
    { id: "i1", name: "Caio Lins", amount: 91, dueDate: "01/11/2025", status: "Pendente", classesCount: 2 },
    { id: "i2", name: "Julia Santos", amount: 91, dueDate: "01/11/2025", status: "Atrasado", classesCount: 1 },
    { id: "i3", name: "Pedro Henrique", amount: 91, dueDate: "01/11/2025", status: "Pendente", classesCount: 3 },
    { id: "i4", name: "Ana Beatriz", amount: 91, dueDate: "01/11/2025", status: "Pago", classesCount: 1 },
  ];

  const paid: Paid[] = [
    { id: "p1", name: "Ana Beatriz", amount: 91, paidAt: "02/11/2025", method: "PIX" },
    { id: "p2", name: "Pedro Henrique", amount: 91, paidAt: "28/10/2025", method: "Dinheiro" },
    { id: "p3", name: "Marcelo (Professor)", amount: 300, paidAt: "25/10/2025", method: "PIX" },
  ];

  const filteredInvoices = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter((i) => i.name.toLowerCase().includes(q));
  }, [query]);

  const summary = useMemo(() => {
    const received = invoices
      .filter((i) => i.status === "Pago")
      .reduce((acc, i) => acc + i.amount, 0);

    const toReceive = invoices
      .filter((i) => i.status !== "Pago")
      .reduce((acc, i) => acc + i.amount, 0);

    const overdueCount = invoices.filter((i) => i.status === "Atrasado").length;
    const pendingCount = invoices.filter((i) => i.status === "Pendente").length;

    return { received, toReceive, overdueCount, pendingCount };
  }, [invoices]);

  // Ações (por enquanto vazias)
  const onRegisterPayment = () => {};
  const onCreateCharge = () => {};
  const onExpenses = () => {};
  const onReports = () => {};

  const onInvoiceDetails = (inv: Invoice) => {};
  const onMarkAsPaid = (inv: Invoice) => {};
  const onSendReminder = (inv: Invoice) => {};

  return (
    <View style={[styles.screen, isDesktopMode && desktopStyles.screen]}>
      {!isDesktopMode && <CdmfHeader />}
      {!isDesktopMode && <SectionHeader title="Financeiro" />}

      {/* Filtros */}
      <View style={styles.filtersRow}>
        <View style={styles.monthRow}>
          {(["NOV/2025", "OUT/2025", "SET/2025"] as const).map((m) => {
            const active = m === month;
            return (
              <Pressable
                key={m}
                onPress={() => setMonth(m)}
                style={[styles.monthPill, active ? styles.monthPillActive : null]}
              >
                <Text style={[styles.monthText, active ? styles.monthTextActive : null]}>{m}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#666" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar aluno..."
            placeholderTextColor="#777"
            style={styles.searchInput}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* KPI / Resumo do mês */}
        <View style={styles.kpiGrid}>
          <KpiCard
            title="Recebido no mês"
            value={brl(summary.received)}
            subtitle="Entradas confirmadas"
            icon="cash-outline"
          />
          <KpiCard
            title="A receber"
            value={brl(summary.toReceive)}
            subtitle="Pendentes + atrasados"
            icon="wallet-outline"
          />
          <KpiCard
            title="Pendentes"
            value={String(summary.pendingCount)}
            subtitle="Ainda no prazo"
            icon="time-outline"
          />
          <KpiCard
            title="Atrasados"
            value={String(summary.overdueCount)}
            subtitle="Inadimplência"
            icon="alert-circle-outline"
          />
        </View>

        {/* Atalhos */}
        <SectionHeader title="Atalhos" />
        <View style={styles.tilesGrid}>
          <ActionTile label="Registrar pagamento" icon="add-circle-outline" onPress={onRegisterPayment} />
          <ActionTile label="Gerar cobrança / PIX" icon="qr-code-outline" onPress={onCreateCharge} />
          <ActionTile label="Despesas" icon="receipt-outline" onPress={onExpenses} />
          <ActionTile label="Relatórios / Exportar" icon="document-text-outline" onPress={onReports} />
        </View>

        {/* Pendências */}
        <SectionHeader title="Pendências do mês" />
        <View style={styles.panel}>
          {filteredInvoices.length === 0 ? (
            <Text style={styles.empty}>Nenhum aluno encontrado.</Text>
          ) : (
            filteredInvoices
              .filter((i) => i.status !== "Pago")
              .map((inv) => (
                <View key={inv.id} style={styles.invoiceRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.invoiceName} numberOfLines={1} ellipsizeMode="tail">
                      {inv.name}
                    </Text>
                    <Text style={styles.invoiceMeta}>
                      Venc.: {inv.dueDate} • Turmas: {String(inv.classesCount).padStart(2, "0")}
                    </Text>
                  </View>

                  <View style={styles.invoiceRight}>
                    <Text style={styles.invoiceAmount}>{brl(inv.amount)}</Text>
                    <StatusDot status={inv.status} />
                  </View>

                  <View style={styles.invoiceActions}>
                    <Pressable style={styles.smallBtn} onPress={() => onInvoiceDetails(inv)}>
                      <Text style={styles.smallBtnText}>DETALHES</Text>
                    </Pressable>

                    <Pressable style={styles.smallBtn} onPress={() => onSendReminder(inv)}>
                      <Text style={styles.smallBtnText}>LEMBRAR</Text>
                    </Pressable>

                    <Pressable style={[styles.smallBtn, styles.smallBtnDark]} onPress={() => onMarkAsPaid(inv)}>
                      <Text style={[styles.smallBtnText, { color: "white" }]}>MARCAR PAGO</Text>
                    </Pressable>
                  </View>

                  <View style={styles.divider} />
                </View>
              ))
          )}
        </View>

        {/* Últimos pagamentos */}
        <SectionHeader title="Últimos pagamentos" />
        <View style={styles.panel}>
          {paid.map((p) => (
            <View key={p.id} style={styles.paidRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.invoiceName} numberOfLines={1} ellipsizeMode="tail">
                  {p.name}
                </Text>
                <Text style={styles.invoiceMeta}>
                  {p.paidAt} • {p.method}
                </Text>
              </View>

              <Text style={styles.invoiceAmount}>{brl(p.amount)}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 18 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  filtersRow: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, gap: 10, backgroundColor: "white", marginBottom: 0 },

  monthRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  monthPill: {
    backgroundColor: "#E3E3E3",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#CFCFCF",
  },
  monthPillActive: { backgroundColor: colors.text, borderColor: colors.text },
  monthText: { fontWeight: "900", fontSize: 11, color: colors.text },
  monthTextActive: { color: "white" },

  searchBox: {
    backgroundColor: "#E3E3E3",
    borderRadius: 14,
    paddingHorizontal: 4,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#CFCFCF",
  },
  searchInput: { flex: 1, fontWeight: "700", color: colors.text },

  content: { paddingBottom: 16 },

  kpiGrid: {
    padding: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  kpiCard: {
    width: "48%",
    backgroundColor: "white",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CFCFCF",
    padding: 12,
  },
  kpiTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  kpiTitle: { fontWeight: "900", color: colors.text, fontSize: 12, flex: 1 },
  kpiValue: { fontWeight: "900", color: colors.text, fontSize: 18 },
  kpiSub: { marginTop: 4, fontWeight: "700", color: "#666", fontSize: 11 },

  tilesGrid: {
    padding: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tile: {
    width: "48%",
    backgroundColor: "white",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CFCFCF",
    padding: 12,
    gap: 8,
  },
  tileText: { fontWeight: "900", color: colors.text, fontSize: 12 },

  panel: {
    marginHorizontal: 12,
    backgroundColor: "white",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CFCFCF",
    padding: 12,
    marginTop: 12,
    marginBottom: 12,
  },

  empty: { color: "#666", fontWeight: "700", paddingVertical: 10 },

  invoiceRow: { paddingVertical: 10 },
  divider: { height: 1, backgroundColor: "#E6E6E6", marginTop: 12 },

  invoiceName: { fontWeight: "900", color: colors.text, fontSize: 13 },
  invoiceMeta: { fontWeight: "700", color: "#666", fontSize: 11, marginTop: 4 },

  invoiceRight: { alignItems: "flex-end", justifyContent: "center", gap: 6 },
  invoiceAmount: { fontWeight: "900", color: colors.text, fontSize: 13 },

  invoiceActions: { marginTop: 10, flexDirection: "row", gap: 8, flexWrap: "wrap" },
  smallBtn: {
    backgroundColor: "#EEEEEE",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#CFCFCF",
  },
  smallBtnDark: { backgroundColor: colors.text, borderColor: colors.text },
  smallBtnText: { fontWeight: "900", color: colors.text, fontSize: 11 },

  paidRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E6E6E6",
  },
});

// Desktop Styles
const desktopStyles = StyleSheet.create({
  screen: {
    backgroundColor: "#F8FAFC",
  },
});
