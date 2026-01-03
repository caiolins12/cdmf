import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

type Props = {
  name: string;
  classesCount: number;

  onView: () => void;
  onEdit: () => void;
  onChangeClasses: () => void;   // mudar turmas do professor
  onPermissions: () => void;     // permissões/admin
  onDeactivate?: () => void;     // opcional: desativar professor
};

export default function CollapsibleTeacherRow({
  name,
  classesCount,
  onView,
  onEdit,
  onChangeClasses,
  onPermissions,
  onDeactivate,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrapper}>
      <Pressable style={styles.header} onPress={() => setOpen((v) => !v)}>
        <View style={styles.left}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>

          <Text style={styles.meta}>
            Turmas: <Text style={styles.metaBold}>{classesCount}</Text> • Tipo:{" "}
            <Text style={styles.metaBold}>Professor</Text>
          </Text>
        </View>

        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={colors.text} />
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
          </View>

          <View style={styles.actionsRow}>
            <Pressable style={[styles.btn, styles.btnDark]} onPress={onChangeClasses}>
              <Text style={[styles.btnText, { color: "white" }]}>MUDAR TURMAS</Text>
            </Pressable>

            <Pressable style={[styles.btn, styles.btnDark]} onPress={onPermissions}>
              <Text style={[styles.btnText, { color: "white" }]}>PERMISSÕES</Text>
            </Pressable>
          </View>

          {onDeactivate ? (
            <Pressable style={[styles.btn, styles.btnDanger]} onPress={onDeactivate}>
              <Text style={[styles.btnText, { color: "white" }]}>DESATIVAR</Text>
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
  meta: { color: colors.text, opacity: 0.85, fontWeight: "700", fontSize: 12 },
  metaBold: { fontWeight: "900", color: colors.text, opacity: 1 },

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
  btnDanger: { backgroundColor: colors.danger },
});
