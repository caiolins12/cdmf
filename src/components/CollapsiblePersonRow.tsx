import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

type Status = "Em dia" | "Pendente";

type Props = {
  name: string;
  classesCount: number;
  type: "Aluno" | "Professor";
  status: Status;

  onView: () => void;
  onEdit: () => void;
  onFinance: () => void;
  onDelete?: () => void; // opcional (talvez você não queira deletar professor)
};

export default function CollapsiblePersonRow({
  name,
  classesCount,
  type,
  status,
  onView,
  onEdit,
  onFinance,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(false);

  const statusColor = status === "Em dia" ? "#1B8E3E" : colors.danger;
  const statusIcon = status === "Em dia" ? "checkmark-circle" : "alert-circle";

  return (
    <View style={styles.wrapper}>
      <Pressable style={styles.header} onPress={() => setOpen((v) => !v)}>
        <View style={styles.left}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>

          <View style={styles.metaRow}>
            <Text style={styles.meta}>
              Turmas: <Text style={styles.metaBold}>{classesCount}</Text>
            </Text>

            <Text style={styles.dot}>•</Text>

            <Text style={styles.meta}>
              Tipo: <Text style={styles.metaBold}>{type}</Text>
            </Text>
          </View>
        </View>

        <View style={styles.right}>
          <Ionicons name={statusIcon} size={20} color={statusColor} />
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={colors.text} />
        </View>
      </Pressable>

      {open ? (
        <View style={styles.body}>
          <View style={styles.actionsRow}>
            <Pressable style={styles.btn} onPress={onView}>
              <Text style={styles.btnText}>VER</Text>
            </Pressable>

            <Pressable style={styles.btn} onPress={onEdit}>
              <Text style={styles.btnText}>EDITAR</Text>
            </Pressable>

            <Pressable style={[styles.btn, styles.btnDark]} onPress={onFinance}>
              <Text style={[styles.btnText, { color: "white" }]}>FINANCEIRO</Text>
            </Pressable>
          </View>

          {onDelete ? (
            <Pressable style={[styles.btn, styles.btnDanger]} onPress={onDelete}>
              <Text style={[styles.btnText, { color: "white" }]}>DELETAR</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: "#E3E3E3",
    borderRadius: 14,
    overflow: "hidden",
  },

  header: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  left: { flex: 1, gap: 4 },
  name: { fontWeight: "900", color: colors.text, fontSize: 14 },

  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { color: colors.text, opacity: 0.85, fontWeight: "700", fontSize: 12 },
  metaBold: { fontWeight: "900", opacity: 1, color: colors.text },
  dot: { color: colors.text, opacity: 0.6 },

  right: { flexDirection: "row", alignItems: "center", gap: 10 },

  body: {
    borderTopWidth: 1,
    borderTopColor: "#D0D0D0",
    padding: 12,
    gap: 10,
  },

  actionsRow: { flexDirection: "row", gap: 10 },
  btn: {
    flex: 1,
    backgroundColor: "#D9D9D9",
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: "center",
  },
  btnText: { fontWeight: "900", color: colors.text, fontSize: 12 },
  btnDark: { backgroundColor: colors.text },
  btnDanger: { backgroundColor: colors.danger, flex: 0 },
});
