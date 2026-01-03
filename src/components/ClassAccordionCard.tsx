import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

type Props = {
  header: string;
  studentsCount: number;
  teacher: string;
  styleName: string;
  day: string;
  time: string;
  studentsLabel?: string;

  onMoreDetails: () => void;
  onManage: () => void;
  onDelete: () => void;
};

export default function ClassAccordionCard({
  header,
  studentsCount,
  teacher,
  styleName,
  day,
  time,
  studentsLabel,
  onMoreDetails,
  onManage,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(false);

  const countText = studentsLabel ?? String(studentsCount).padStart(2, "0");

  return (
    <View style={styles.card}>
      {/* HEADER (compacto) */}
      <Pressable style={styles.headerRow} onPress={() => setOpen((v) => !v)}>
        <Text style={styles.headerText} numberOfLines={1} ellipsizeMode="tail">
          {header}
        </Text>

        <View style={styles.headerRight}>
          <Text style={styles.countText}>{countText} ALUNOS</Text>
          <Ionicons name="people-outline" size={18} color={colors.text} />
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={20}
            color={colors.text}
          />
        </View>
      </Pressable>

      {/* BODY (expandido) */}
      {open ? (
        <View style={styles.body}>
          {/* ESQUERDA: detalhes alinhados em colunas */}
          <View style={styles.details}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Professor:</Text>
              <Text style={styles.detailValue} numberOfLines={1} ellipsizeMode="tail">
                {teacher}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Estilo:</Text>
              <Text style={styles.detailValue} numberOfLines={2}>
                {styleName}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Dia:</Text>
              <Text style={styles.detailValue} numberOfLines={2}>
                {day}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Horário:</Text>
              <Text style={styles.detailValue} numberOfLines={1} ellipsizeMode="tail">
                {time}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Alunos:</Text>
              <Text style={styles.detailValue} numberOfLines={1} ellipsizeMode="tail">
                {countText}
              </Text>
            </View>
          </View>

          {/* DIREITA: botões em coluna */}
          <View style={styles.actions}>
            <Pressable style={styles.btn} onPress={onMoreDetails}>
              <Text style={styles.btnText}>MAIS DETALHES</Text>
            </Pressable>

            <Pressable style={styles.btn} onPress={onManage}>
              <Text style={styles.btnText}>GERENCIAR</Text>
            </Pressable>

            <Pressable style={[styles.btn, styles.btnDanger]} onPress={onDelete}>
              <Text style={[styles.btnText, styles.btnDangerText]}>DELETAR</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "white",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CFCFCF",
    overflow: "hidden",
  },

  headerRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  headerText: {
    flex: 1,
    fontWeight: "900",
    color: colors.text,
    fontSize: 12,
    marginRight: 6,
  },

  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  countText: {
    fontWeight: "900",
    color: colors.text,
    opacity: 0.8,
    fontSize: 11,
  },

  body: {
    borderTopWidth: 1,
    borderTopColor: "#D9D9D9",
    padding: 12,
    flexDirection: "row",
    gap: 12,
  },

  details: {
    flex: 1,
    gap: 4,
  },

  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start", // << melhor pra textos com 2 linhas
  },

  // se precisar de mais espaço pro valor, diminua esse width (ex: 76)
  detailLabel: {
  width: 68, // << menor (testa 62~72 se quiser)
  fontSize: 12,
  fontWeight: "900",
  color: colors.text,
  opacity: 0.85,
},

  detailValue: {
    flex: 1,
    minWidth: 0, // << importante no Android pra evitar corte estranho
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },

  actions: {
    width: 140,
    gap: 10,
    justifyContent: "center",
  },

  btn: {
    backgroundColor: "#EEEEEE",
    borderRadius: 999,
    paddingVertical: 9,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#CFCFCF",
  },

  btnText: {
    fontWeight: "900",
    color: colors.text,
    fontSize: 12,
  },

  btnDanger: {
    backgroundColor: "white",
    borderColor: colors.danger,
  },

  btnDangerText: {
    color: colors.danger,
  },
});
