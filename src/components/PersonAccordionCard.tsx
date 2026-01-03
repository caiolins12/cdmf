import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

type Status = "Em dia" | "Pendente" | "Ativo" | "Inativo";

type Action = {
  label: string;
  onPress: () => void;
  variant?: "normal" | "dangerOutline";
};

type Props = {
  name: string;
  typeLabel: "ALUNO" | "PROFESSOR";
  classesCount?: number;
  subtitle?: string;
  extraInfo?: string;
  phone?: string;
  status?: Status;
  actions: Action[];
};

export default function PersonAccordionCard({
  name,
  typeLabel,
  classesCount,
  subtitle,
  extraInfo,
  phone,
  status,
  actions,
}: Props) {
  const [open, setOpen] = useState(false);

  const classesText = classesCount !== undefined ? String(classesCount).padStart(2, "0") : null;
  
  const getStatusInfo = () => {
    switch (status) {
      case "Em dia":
      case "Ativo":
        return { icon: "checkmark-circle" as const, color: "#1B8E3E" };
      case "Pendente":
        return { icon: "alert-circle" as const, color: colors.danger };
      case "Inativo":
        return { icon: "close-circle" as const, color: colors.muted };
      default:
        return null;
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <View style={styles.card}>
      {/* HEADER */}
      <Pressable style={styles.headerRow} onPress={() => setOpen((v) => !v)}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerText} numberOfLines={1} ellipsizeMode="tail">
            {name}
          </Text>
          {subtitle && (
            <Text style={styles.subtitleText} numberOfLines={1} ellipsizeMode="tail">
              {subtitle}
            </Text>
          )}
        </View>

        <View style={styles.headerRight}>
          {classesText && (
            <Text style={styles.metaText}>{classesText} TURMAS</Text>
          )}

          <View style={styles.typePill}>
            <Text style={styles.typePillText}>{typeLabel}</Text>
          </View>

          {statusInfo && (
            <Ionicons name={statusInfo.icon} size={18} color={statusInfo.color} />
          )}

          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={20}
            color={colors.text}
          />
        </View>
      </Pressable>

      {/* BODY (expandido) */}
      {open && (
        <View style={styles.body}>
          {extraInfo && (
            <Text style={styles.extraInfoText}>{extraInfo}</Text>
          )}

          {/* Telefone (apenas para alunos no perfil do professor) */}
          {phone && typeLabel === "ALUNO" && (
            <View style={styles.phoneContainer}>
              <Ionicons name="call" size={16} color={colors.purple} />
              <Text style={styles.phoneText}>{phone}</Text>
            </View>
          )}

          <View style={styles.actions}>
            {actions.map((a, idx) => (
              <Pressable
                key={idx}
                style={[styles.btn, a.variant === "dangerOutline" ? styles.btnDanger : null]}
                onPress={a.onPress}
              >
                <Text
                  style={[
                    styles.btnText,
                    a.variant === "dangerOutline" ? styles.btnDangerText : null,
                  ]}
                >
                  {a.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
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
    maxWidth: 600,
  },

  headerRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },

  headerLeft: {
    flex: 1,
    marginRight: 6,
  },

  headerText: {
    fontWeight: "900",
    color: colors.text,
    fontSize: 13,
  },

  subtitleText: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: "500",
    marginTop: 2,
  },

  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },

  metaText: {
    fontWeight: "900",
    color: colors.text,
    opacity: 0.8,
    fontSize: 11,
  },

  typePill: {
    backgroundColor: "#EEEEEE",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#CFCFCF",
  },
  typePillText: { fontSize: 10, fontWeight: "900", color: colors.text },

  body: {
    borderTopWidth: 1,
    borderTopColor: "#D9D9D9",
    padding: 12,
  },

  extraInfoText: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 12,
    fontWeight: "500",
  },

  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  btn: {
    backgroundColor: "#EEEEEE",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#CFCFCF",
    minWidth: 100,
  },

  btnText: {
    fontWeight: "900",
    color: colors.text,
    fontSize: 12,
  },

  phoneContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    backgroundColor: "#f0f6ff",
    padding: 10,
    borderRadius: 8,
  },
  phoneText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.purple,
  },

  btnDanger: {
    backgroundColor: "white",
    borderColor: colors.danger,
  },

  btnDangerText: {
    color: colors.danger,
  },
});
