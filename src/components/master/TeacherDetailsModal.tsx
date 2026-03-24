import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons, FontAwesome5 } from "@/shims/icons";
import { BaseModal, ModalButtons, showConfirmDialog } from "../ui";
import { Avatar, StatusBadge } from "../ui";
import { colors } from "../../theme/colors";
import { Profile, Class } from "../../contexts/AuthContext";

interface TeacherDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  teacher: Profile | null;
  classes: Class[];
  allClasses: Class[];
  loadingClasses: boolean;
  onEdit: () => void;
  onToggleActive: (teacher: Profile) => void;
  onDelete: (teacher: Profile) => void;
  onRemoveFromClass: (classItem: Class) => void;
  onAddToClass: (classItem: Class) => void;
}

export default function TeacherDetailsModal({
  visible,
  onClose,
  teacher,
  classes,
  allClasses,
  loadingClasses,
  onEdit,
  onToggleActive,
  onDelete,
  onRemoveFromClass,
  onAddToClass,
}: TeacherDetailsModalProps) {
  const [showClassManager, setShowClassManager] = useState(false);

  useEffect(() => {
    if (visible) setShowClassManager(false);
  }, [visible]);

  const availableClasses = useMemo(
    () => allClasses.filter(c => !classes.some(tc => tc.id === c.id)),
    [allClasses, classes]
  );

  if (!teacher) return null;

  const isInactive = teacher.active === false;

  const formatDate = (timestamp: number) => new Date(timestamp).toLocaleDateString("pt-BR");

  const formatClassSchedule = (classItem: Class) => {
    if (!classItem.schedule || classItem.schedule.length === 0) return "Sem horário";
    const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const s = classItem.schedule[0];
    return `${days[s.dayOfWeek]} ${s.startTime}`;
  };

  const handleToggleActive = () => {
    showConfirmDialog({
      title: `${isInactive ? "Ativar" : "Desativar"} Professor`,
      message: isInactive
        ? `Deseja ativar o professor ${teacher.name}?`
        : `Deseja desativar o professor ${teacher.name}?\n\nEle será removido de todas as turmas em que está.`,
      confirmLabel: "Confirmar",
      variant: isInactive ? "default" : "danger",
      onConfirm: () => onToggleActive(teacher),
    });
  };

  const handleDelete = () => {
    showConfirmDialog({
      title: "Excluir Professor",
      message: `Tem certeza que deseja excluir permanentemente o professor ${teacher.name}?\n\nEsta ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      variant: "danger",
      onConfirm: () => onDelete(teacher),
    });
  };

  const handleRemoveFromClass = (classItem: Class) => {
    showConfirmDialog({
      title: "Remover da Turma",
      message: `Deseja remover ${teacher.name} da turma ${classItem.name}?\n\nA turma ficará sem professor.`,
      confirmLabel: "Remover",
      variant: "danger",
      onConfirm: () => onRemoveFromClass(classItem),
    });
  };

  // ── Gerenciador de turmas completo (tela alternativa) ────────────────────────
  if (showClassManager) {
    return (
      <BaseModal
        visible={visible}
        onClose={() => setShowClassManager(false)}
        title="Gerenciar Turmas"
        subtitle={teacher.name}
        icon={<FontAwesome5 name="chalkboard-teacher" size={20} color={colors.purple} />}
        footer={
          <ModalButtons
            secondaryLabel="Voltar"
            onSecondaryPress={() => setShowClassManager(false)}
          />
        }
      >
        <View style={styles.managerSection}>
          <Text style={styles.managerTitle}>Turmas atuais</Text>
          {classes.length === 0 ? (
            <Text style={styles.managerEmptyText}>Professor ainda não está em nenhuma turma.</Text>
          ) : (
            classes.map((classItem) => (
              <View key={classItem.id} style={styles.classRow}>
                <View style={styles.classInfo}>
                  <Text style={styles.className}>{classItem.name}</Text>
                  <Text style={styles.classMeta}>
                    {formatClassSchedule(classItem)} · {classItem.studentIds?.length || 0} alunos
                  </Text>
                </View>
                <Pressable style={styles.iconAction} onPress={() => handleRemoveFromClass(classItem)}>
                  <Ionicons name="close-circle" size={22} color={colors.danger} />
                </Pressable>
              </View>
            ))
          )}
        </View>

        <View style={styles.managerSection}>
          <Text style={styles.managerTitle}>Turmas disponíveis</Text>
          {availableClasses.length === 0 ? (
            <Text style={styles.managerEmptyText}>Não há outras turmas disponíveis no momento.</Text>
          ) : (
            availableClasses.map((classItem) => (
              <Pressable
                key={classItem.id}
                style={styles.classRow}
                onPress={() => {
                  onAddToClass(classItem);
                  setShowClassManager(false);
                }}
              >
                <View style={styles.classInfo}>
                  <Text style={styles.className}>{classItem.name}</Text>
                  <Text style={styles.classMeta}>
                    {formatClassSchedule(classItem)} · {classItem.studentIds?.length || 0} alunos
                  </Text>
                </View>
                <Ionicons name="add-circle" size={22} color={colors.green} />
              </Pressable>
            ))
          )}
        </View>
      </BaseModal>
    );
  }

  // ── Modal principal compacto ─────────────────────────────────────────────────
  // showCloseButton=false: evita o header extra do BaseModal (que criava gap grande acima do nome)
  // O botão X fica dentro do nosso próprio header row
  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      size="large"
      scrollable={false}
      showCloseButton={false}
    >
      {/* Header: avatar + nome/subline + badge + X */}
      <View style={styles.header}>
        <Avatar name={teacher.name} size={48} inactive={isInactive} />
        <View style={styles.headerText}>
          <Text style={styles.teacherName} numberOfLines={1}>{teacher.name}</Text>
          <Text style={styles.teacherSubline}>
            {teacher.phone || "Sem telefone"} · Cadastrado {formatDate(teacher.createdAt)}
          </Text>
        </View>
        <StatusBadge
          label={isInactive ? "Inativo" : "Ativo"}
          color={isInactive ? colors.danger : colors.green}
          icon={isInactive ? "close-circle" : "checkmark-circle"}
          size="small"
        />
        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Ionicons name="close" size={22} color="#64748B" />
        </Pressable>
      </View>

      {/* Credenciais de acesso */}
      <View style={styles.credentialsRow}>
        <View style={styles.credentialItem}>
          <Ionicons name="key-outline" size={13} color={colors.muted} />
          <Text style={styles.credentialLabel}>Código</Text>
          <Text style={styles.credentialValue}>{teacher.teacherCode || "--"}</Text>
        </View>
        <View style={styles.credentialItem}>
          <Ionicons name="lock-closed-outline" size={13} color={colors.muted} />
          <Text style={styles.credentialLabel}>Senha</Text>
          <Text style={styles.credentialValue}>{teacher.tempPassword || "--"}</Text>
        </View>
      </View>

      {/* Turmas atuais — chips compactos */}
      <View style={styles.compactSection}>
        <View style={styles.compactSectionHeader}>
          <Text style={styles.compactSectionTitle}>
            TURMAS ({classes.length})
          </Text>
          <Pressable onPress={() => setShowClassManager(true)}>
            <Text style={styles.manageLink}>Gerenciar</Text>
          </Pressable>
        </View>

        {loadingClasses ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="small" color={colors.purple} />
            <Text style={styles.loadingText}>Carregando turmas...</Text>
          </View>
        ) : classes.length === 0 ? (
          <Text style={styles.emptyText}>Professor sem turmas atribuídas</Text>
        ) : (
          <View style={styles.chipsRow}>
            {classes.map((classItem) => (
              <View key={classItem.id} style={styles.classChip}>
                <View style={styles.classChipInfo}>
                  <Text style={styles.classChipName} numberOfLines={1}>{classItem.name}</Text>
                  <Text style={styles.classChipMeta}>{formatClassSchedule(classItem)} · {classItem.studentIds?.length || 0}al</Text>
                </View>
                <Pressable onPress={() => handleRemoveFromClass(classItem)}>
                  <Ionicons name="close-circle" size={16} color={colors.danger} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Turmas disponíveis para adicionar */}
      {!loadingClasses && availableClasses.length > 0 && (
        <View style={styles.compactSection}>
          <View style={styles.compactSectionHeader}>
            <Text style={styles.compactSectionTitle}>
              ADICIONAR ({availableClasses.length} disponível/is)
            </Text>
          </View>
          <View style={styles.chipsRow}>
            {availableClasses.slice(0, 4).map((classItem) => (
              <Pressable
                key={classItem.id}
                style={styles.addChip}
                onPress={() => onAddToClass(classItem)}
              >
                <Ionicons name="add-circle" size={14} color={colors.green} />
                <View style={styles.classChipInfo}>
                  <Text style={styles.addChipName} numberOfLines={1}>{classItem.name}</Text>
                  <Text style={styles.addChipMeta}>{formatClassSchedule(classItem)}</Text>
                </View>
              </Pressable>
            ))}
            {availableClasses.length > 4 && (
              <Pressable style={styles.moreChip} onPress={() => setShowClassManager(true)}>
                <Text style={styles.moreChipText}>+{availableClasses.length - 4} mais</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* Ações */}
      <View style={styles.actionsRow}>
        <Pressable style={styles.actionBtn} onPress={onEdit}>
          <Ionicons name="create-outline" size={16} color={colors.purple} />
          <Text style={styles.actionBtnText}>Editar</Text>
        </Pressable>

        <Pressable
          style={[styles.actionBtn, isInactive ? styles.actionBtnSuccess : styles.actionBtnDanger]}
          onPress={handleToggleActive}
        >
          <Ionicons
            name={isInactive ? "checkmark-circle-outline" : "close-circle-outline"}
            size={16}
            color={isInactive ? colors.green : colors.danger}
          />
          <Text style={[styles.actionBtnText, { color: isInactive ? colors.green : colors.danger }]}>
            {isInactive ? "Reativar" : "Desativar"}
          </Text>
        </Pressable>

        {isInactive && (
          <Pressable style={[styles.actionBtn, styles.actionBtnDanger]} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
            <Text style={[styles.actionBtnText, { color: colors.danger }]}>Excluir</Text>
          </Pressable>
        )}
      </View>
    </BaseModal>
  );
}

const styles = StyleSheet.create({
  // ── Header (sem X separado do BaseModal) ────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 12,
    marginBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  teacherName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1E293B",
    marginBottom: 3,
  },
  teacherSubline: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 17,
  },
  closeBtn: {
    padding: 4,
    marginLeft: 2,
  },

  // ── Credenciais ─────────────────────────────────────────────────────────────
  credentialsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  credentialItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  credentialLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
  },
  credentialValue: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.purple,
    flexShrink: 1,
  },

  // ── Seções compactas ────────────────────────────────────────────────────────
  compactSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  compactSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  compactSectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.5,
  },
  manageLink: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.purple,
    backgroundColor: "#F3E5F5",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  emptyText: {
    fontSize: 13,
    color: "#64748B",
    fontStyle: "italic",
  },
  loadingState: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  loadingText: {
    fontSize: 12,
    color: "#64748B",
  },

  // ── Chips de turma ──────────────────────────────────────────────────────────
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  classChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F3E5F5",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: "100%",
  },
  classChipInfo: {
    flexShrink: 1,
  },
  classChipName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E293B",
  },
  classChipMeta: {
    fontSize: 10,
    color: "#64748B",
    marginTop: 1,
  },
  addChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F0FDF4",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  addChipName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#14532D",
  },
  addChipMeta: {
    fontSize: 10,
    color: "#166534",
    marginTop: 1,
  },
  moreChip: {
    backgroundColor: "#EDE9FE",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    justifyContent: "center",
  },
  moreChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.purple,
  },

  // ── Ações ───────────────────────────────────────────────────────────────────
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  actionBtn: {
    flex: 1,
    minWidth: 90,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#EDE9FE",
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.purple,
  },
  actionBtnDanger: {
    backgroundColor: "#FEE2E2",
  },
  actionBtnSuccess: {
    backgroundColor: "#DCFCE7",
  },

  // ── Gerenciador completo (tela alternativa) ─────────────────────────────────
  managerSection: {
    marginBottom: 18,
  },
  managerTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1E293B",
    marginBottom: 10,
  },
  managerEmptyText: {
    fontSize: 13,
    color: "#64748B",
  },
  classRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
  },
  classInfo: {
    flex: 1,
  },
  className: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
  },
  classMeta: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  iconAction: {
    padding: 2,
    marginLeft: 10,
  },
});
