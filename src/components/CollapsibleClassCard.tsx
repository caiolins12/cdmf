import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

type Props = {
  title: string;           // ex: "FORRÓ - TURMA 01"
  studentsCount: number;   // ex: 12
  schedule: string;        // ex: "SEG / QUA - 18:20"
  onMoreDetails: () => void;
  onManage: () => void;
  onDelete: () => void;
};

export default function CollapsibleClassCard({
  title,
  studentsCount,
  schedule,
  onMoreDetails,
  onManage,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrapper}>
      <Pressable style={styles.header} onPress={() => setOpen((v) => !v)}>
        <Text style={styles.title}>{title}</Text>

        <View style={styles.right}>
          <Text style={styles.count}>{studentsCount} alunos</Text>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={22}
            color={colors.text}
          />
        </View>
      </Pressable>

      {open ? (
        <View style={styles.body}>
          <Text style={styles.line}>
            <Text style={styles.bold}>Horário:</Text> {schedule}
          </Text>

          <View style={styles.actions}>
            <Pressable style={styles.btn} onPress={onMoreDetails}>
              <Text style={styles.btnText}>MAIS DETALHES</Text>
            </Pressable>

            <Pressable style={[styles.btn, styles.btnDark]} onPress={onManage}>
              <Text style={[styles.btnText, { color: "white" }]}>GERENCIAR</Text>
            </Pressable>

            <Pressable style={[styles.btn, styles.btnDanger]} onPress={onDelete}>
              <Text style={[styles.btnText, { color: "white" }]}>DELETAR</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: "#E3E3E3",
    borderRadius: 18,
    overflow: "hidden",
  },
  header: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  title: { flex: 1, fontWeight: "900", color: colors.text },
  right: { flexDirection: "row", gap: 8, alignItems: "center" },
  count: { fontWeight: "800", color: colors.text, opacity: 0.85 },

  body: {
    borderTopWidth: 1,
    borderTopColor: "#D0D0D0",
    padding: 14,
    gap: 12,
  },
  line: { fontWeight: "700", color: colors.text },
  bold: { fontWeight: "900" },

  actions: { gap: 10 },
  btn: {
    backgroundColor: "#D9D9D9",
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: "center",
  },
  btnText: { fontWeight: "900", color: colors.text },
  btnDark: { backgroundColor: colors.text },
  btnDanger: { backgroundColor: colors.danger },
});
