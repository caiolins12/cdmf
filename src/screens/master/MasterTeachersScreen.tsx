import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, ScrollView, TextInput, Text, RefreshControl, Pressable, Modal, Alert, ActivityIndicator, Platform } from "react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import CdmfHeader from "../../components/CdmfHeader";
import SectionHeader from "../../components/SectionHeader";
import MasterHeader from "../../components/MasterHeader";
import { colors } from "../../theme/colors";
import { useAuth, Profile, Class } from "../../contexts/AuthContext";
import { useDesktop } from "../../contexts/DesktopContext";
import { useActivity } from "../../contexts/ActivityContext";

type FilterType = "todos" | "ativos" | "inativos";

export default function MasterTeachersScreen() {
  const { isDesktopMode } = useDesktop();
  const { logActivity } = useActivity();
  const { 
    fetchTeachers, 
    createTeacher, 
    deleteTeacher, 
    toggleTeacherActive, 
    getTeacherClasses, 
    removeTeacherFromClass, 
    removeTeacherFromAllClasses, 
    fetchClasses, 
    assignTeacherToClass,
    updateProfile,
  } = useAuth();
  
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [allClasses, setAllClasses] = useState<Class[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("ativos");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showClassesModal, setShowClassesModal] = useState(false);
  const [showAddClassModal, setShowAddClassModal] = useState(false);
  
  const [selectedTeacher, setSelectedTeacher] = useState<Profile | null>(null);
  const [teacherClasses, setTeacherClasses] = useState<Class[]>([]);
  const [availableClasses, setAvailableClasses] = useState<Class[]>([]);
  const [creating, setCreating] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form states - Create
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [createdCredentials, setCreatedCredentials] = useState<{ code: string; password: string } | null>(null);

  // Form states - Edit
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");

  // Pagination
  const TEACHERS_PER_PAGE = 20;
  const [displayLimit, setDisplayLimit] = useState(TEACHERS_PER_PAGE);

  useEffect(() => {
    setDisplayLimit(TEACHERS_PER_PAGE);
  }, [filter, query]);

  const loadTeachers = useCallback(async () => {
    try {
      const [teachersData, classesData] = await Promise.all([
        fetchTeachers(),
        fetchClasses(),
      ]);
      setTeachers(teachersData);
      setAllClasses(classesData);
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
    } finally {
      setLoading(false);
    }
  }, [fetchTeachers, fetchClasses]);

  useFocusEffect(
    useCallback(() => {
      loadTeachers();
    }, [loadTeachers])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTeachers();
    setRefreshing(false);
  };

  // Filter teachers
  const filteredTeachers = teachers.filter((t) => {
    const matchesQuery = t.name.toLowerCase().includes(query.toLowerCase()) ||
      (t.teacherCode?.toLowerCase().includes(query.toLowerCase()) ?? false);
    
    if (filter === "ativos") return matchesQuery && t.active !== false;
    if (filter === "inativos") return matchesQuery && t.active === false;
    return matchesQuery;
  });

  const activeTeachers = teachers.filter((t) => t.active !== false);
  const inactiveTeachers = teachers.filter((t) => t.active === false);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("pt-BR");
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === "web") {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // Get teacher's classes count
  const getTeacherClassCount = (teacherId: string) => {
    return allClasses.filter(c => c.teacherId === teacherId).length;
  };

  // ========== Handlers ==========

  const handleCreateTeacher = async () => {
    if (!newName.trim()) {
      showAlert("Atenção", "Digite o nome do professor");
      return;
    }

    setCreating(true);
    try {
      const credentials = await createTeacher(newName.trim(), newPhone.trim() || undefined);
      
      // Log activity
      await logActivity({
        type: "student_registered", // Using similar type for now
        title: newName.trim(),
        description: "Novo professor cadastrado",
      });
      
      setCreatedCredentials(credentials);
      setShowCreateModal(false);
      setShowCredentialsModal(true);
      setNewName("");
      setNewPhone("");
      await loadTeachers();
    } catch (e: any) {
      showAlert("Erro", e.message || "Não foi possível criar o professor");
    } finally {
      setCreating(false);
    }
  };

  const handleViewDetails = async (teacher: Profile) => {
    setSelectedTeacher(teacher);
    setLoadingClasses(true);
    setShowDetailsModal(true);
    
    try {
      const classes = await getTeacherClasses(teacher.uid);
      setTeacherClasses(classes);
    } catch (e) {
      console.error("Erro ao carregar turmas:", e);
      setTeacherClasses([]);
    } finally {
      setLoadingClasses(false);
    }
  };

  const handleOpenEdit = () => {
    if (!selectedTeacher) return;
    setEditName(selectedTeacher.name);
    setEditPhone(selectedTeacher.phone || "");
    setShowDetailsModal(false);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedTeacher) return;
    if (!editName.trim()) {
      showAlert("Atenção", "O nome é obrigatório");
      return;
    }

    setSaving(true);
    try {
      await updateProfile(selectedTeacher.uid, {
        name: editName.trim(),
        phone: editPhone.trim() || undefined,
      });
      
      // Update in allClasses where this teacher is assigned
      for (const classItem of allClasses) {
        if (classItem.teacherId === selectedTeacher.uid) {
          // This would need updateClass but for now just reload
        }
      }
      
      await loadTeachers();
      setShowEditModal(false);
      setSelectedTeacher(prev => prev ? { ...prev, name: editName.trim(), phone: editPhone.trim() } : null);
      showAlert("Sucesso", "Dados atualizados com sucesso!");
    } catch (e: any) {
      showAlert("Erro", e.message || "Não foi possível atualizar");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (teacher: Profile) => {
    const newStatus = !teacher.active;
    const action = newStatus ? "ativar" : "desativar";
    
    const message = newStatus 
      ? `Deseja ativar o professor ${teacher.name}?`
      : `Deseja desativar o professor ${teacher.name}?\n\nEle será removido de todas as turmas em que está.`;
    
    if (Platform.OS === "web") {
      if (!window.confirm(message)) return;
    } else {
      return new Promise<void>((resolve) => {
        Alert.alert(
          `${newStatus ? "Ativar" : "Desativar"} Professor`,
          message,
          [
            { text: "Cancelar", style: "cancel", onPress: () => resolve() },
            {
              text: "Confirmar",
              style: newStatus ? "default" : "destructive",
              onPress: async () => {
                try {
                  await toggleTeacherActive(teacher.uid, newStatus);
                  await loadTeachers();
                  showAlert("Sucesso", `Professor ${newStatus ? "ativado" : "desativado"} com sucesso!`);
                } catch (e: any) {
                  showAlert("Erro", e.message || "Não foi possível alterar o status");
                }
                resolve();
              },
            },
          ]
        );
      });
    }
    
    // Web flow
    try {
      await toggleTeacherActive(teacher.uid, newStatus);
      await loadTeachers();
      showAlert("Sucesso", `Professor ${newStatus ? "ativado" : "desativado"} com sucesso!`);
    } catch (e: any) {
      showAlert("Erro", e.message || "Não foi possível alterar o status");
    }
  };

  const handleDeleteTeacher = async (teacher: Profile) => {
    const message = `Tem certeza que deseja excluir permanentemente o professor ${teacher.name}?\n\nEsta ação não pode ser desfeita.`;
    
    if (Platform.OS === "web") {
      if (!window.confirm(message)) return;
    } else {
      return new Promise<void>((resolve) => {
        Alert.alert(
          "Excluir Professor",
          message,
          [
            { text: "Cancelar", style: "cancel", onPress: () => resolve() },
            {
              text: "Excluir",
              style: "destructive",
              onPress: async () => {
                try {
                  await deleteTeacher(teacher.uid);
                  await loadTeachers();
                  setShowDetailsModal(false);
                  showAlert("Sucesso", "Professor excluído com sucesso!");
                } catch (e: any) {
                  showAlert("Erro", e.message || "Não foi possível excluir o professor");
                }
                resolve();
              },
            },
          ]
        );
      });
    }
    
    // Web flow
    try {
      await deleteTeacher(teacher.uid);
      await loadTeachers();
      setShowDetailsModal(false);
      showAlert("Sucesso", "Professor excluído com sucesso!");
    } catch (e: any) {
      showAlert("Erro", e.message || "Não foi possível excluir o professor");
    }
  };

  const handleOpenClassesModal = () => {
    setShowDetailsModal(false);
    setShowClassesModal(true);
  };

  const handleRemoveFromClass = async (classItem: Class) => {
    const message = `Deseja remover ${selectedTeacher?.name} da turma ${classItem.name}?\n\nA turma ficará sem professor.`;
    
    if (Platform.OS === "web") {
      if (!window.confirm(message)) return;
    } else {
      return new Promise<void>((resolve) => {
        Alert.alert(
          "Remover da Turma",
          message,
          [
            { text: "Cancelar", style: "cancel", onPress: () => resolve() },
            {
              text: "Remover",
              style: "destructive",
              onPress: async () => {
                try {
                  await removeTeacherFromClass(classItem.id);
                  const classes = await getTeacherClasses(selectedTeacher!.uid);
                  setTeacherClasses(classes);
                  showAlert("Sucesso", "Professor removido da turma!");
                } catch (e: any) {
                  showAlert("Erro", e.message || "Não foi possível remover");
                }
                resolve();
              },
            },
          ]
        );
      });
    }
    
    // Web flow
    try {
      await removeTeacherFromClass(classItem.id);
      const classes = await getTeacherClasses(selectedTeacher!.uid);
      setTeacherClasses(classes);
      showAlert("Sucesso", "Professor removido da turma!");
    } catch (e: any) {
      showAlert("Erro", e.message || "Não foi possível remover");
    }
  };

  const handleOpenAddClass = () => {
    const available = allClasses.filter(c => 
      !teacherClasses.some(tc => tc.id === c.id)
    );
    setAvailableClasses(available);
    setShowAddClassModal(true);
  };

  const handleAddToClass = async (classItem: Class) => {
    if (!selectedTeacher) return;
    
    try {
      await assignTeacherToClass(classItem.id, selectedTeacher.uid, selectedTeacher.name);
      const classes = await getTeacherClasses(selectedTeacher.uid);
      setTeacherClasses(classes);
      setShowAddClassModal(false);
      await loadTeachers();
      showAlert("Sucesso", `Professor adicionado à turma ${classItem.name}!`);
    } catch (e: any) {
      showAlert("Erro", e.message || "Não foi possível adicionar");
    }
  };

  const formatClassSchedule = (classItem: Class) => {
    if (!classItem.schedule || classItem.schedule.length === 0) return "";
    const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const schedule = classItem.schedule[0];
    return `${days[schedule.dayOfWeek]} ${schedule.startTime}`;
  };

  return (
    <View style={[styles.screen, isDesktopMode && desktopStyles.screen]}>
      {!isDesktopMode && <MasterHeader />}
      {!isDesktopMode && <SectionHeader title="Gestão de Professores" />}

      {/* Modal: Criar Professor */}
      <Modal visible={showCreateModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => !creating && setShowCreateModal(false)}>
          <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <FontAwesome5 name="chalkboard-teacher" size={28} color={colors.purple} />
              <Text style={styles.modalTitle}>Novo Professor</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Nome completo *</Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="Ex: Maria Silva"
                placeholderTextColor="#94A3B8"
                style={styles.input}
                editable={!creating}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Telefone (opcional)</Text>
              <TextInput
                value={newPhone}
                onChangeText={setNewPhone}
                placeholder="(00) 00000-0000"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                style={styles.input}
                editable={!creating}
              />
            </View>

            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={18} color={colors.purple} />
              <Text style={styles.infoText}>
                Será gerado um código e senha para o professor acessar o sistema
              </Text>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.btnSecondary}
                onPress={() => setShowCreateModal(false)}
                disabled={creating}
              >
                <Text style={styles.btnSecondaryText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.btnPrimary} onPress={handleCreateTeacher} disabled={creating}>
                {creating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="add" size={18} color="#fff" />
                    <Text style={styles.btnPrimaryText}>Criar</Text>
                  </>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: Credenciais */}
      <Modal visible={showCredentialsModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={64} color={colors.green} />
            </View>

            <Text style={styles.modalTitle}>Professor Criado!</Text>
            <Text style={styles.modalSubtitle}>Credenciais de acesso:</Text>

            {createdCredentials && (
              <View style={styles.credentialsBox}>
                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Código:</Text>
                  <Text style={styles.credentialValue}>{createdCredentials.code}</Text>
                </View>
                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Senha:</Text>
                  <Text style={styles.credentialValue}>{createdCredentials.password}</Text>
                </View>
              </View>
            )}

            <Text style={styles.warningText}>
              ⚠️ Anote e guarde estas informações com segurança!
            </Text>

            <Pressable style={styles.btnSecondaryFull} onPress={() => setShowCredentialsModal(false)}>
              <Text style={styles.btnSecondaryText}>Entendi</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Modal: Detalhes do Professor */}
      <Modal visible={showDetailsModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowDetailsModal(false)} />
          <View style={styles.detailsModalContainer}>
            {/* Indicador de arraste */}
            <View style={styles.scrollIndicator}>
              <View style={styles.scrollIndicatorBar} />
            </View>
            <ScrollView 
              contentContainerStyle={styles.detailsModalScroll}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.detailsModalContent}>
              {selectedTeacher && (
                <>
                  <View style={styles.detailsHeader}>
                    <View style={[styles.avatar, selectedTeacher.active === false && { backgroundColor: "#FFCDD2" }]}>
                      <Text style={[styles.avatarText, selectedTeacher.active === false && { color: colors.danger }]}>
                        {selectedTeacher.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.detailsName}>{selectedTeacher.name}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: selectedTeacher.active !== false ? "#DCFCE7" : "#FEE2E2" }]}>
                      <Ionicons 
                        name={selectedTeacher.active !== false ? "checkmark-circle" : "close-circle"} 
                        size={14} 
                        color={selectedTeacher.active !== false ? colors.green : colors.danger} 
                      />
                      <Text style={[styles.statusBadgeText, { color: selectedTeacher.active !== false ? colors.green : colors.danger }]}>
                        {selectedTeacher.active !== false ? "Ativo" : "Inativo"}
                      </Text>
                    </View>
                  </View>

                  {/* Info Section */}
                  <View style={styles.detailsSection}>
                    <Text style={styles.sectionTitle}>Informações</Text>
                    
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Código:</Text>
                      <Text style={styles.infoValue}>{selectedTeacher.teacherCode || "N/A"}</Text>
                    </View>
                    
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Senha:</Text>
                      <Text style={styles.infoValue}>
                        {selectedTeacher.tempPassword || "Definida pelo professor"}
                      </Text>
                    </View>
                    
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Telefone:</Text>
                      <Text style={styles.infoValue}>{selectedTeacher.phone || "Não informado"}</Text>
                    </View>
                    
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Cadastrado em:</Text>
                      <Text style={styles.infoValue}>{formatDate(selectedTeacher.createdAt)}</Text>
                    </View>
                  </View>

                  {/* Turmas Section */}
                  <View style={styles.detailsSection}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>Turmas</Text>
                      <Pressable style={styles.manageBtn} onPress={handleOpenClassesModal}>
                        <Text style={styles.manageBtnText}>Gerenciar</Text>
                        <Ionicons name="chevron-forward" size={14} color={colors.purple} />
                      </Pressable>
                    </View>
                    
                    {loadingClasses ? (
                      <ActivityIndicator size="small" color={colors.purple} />
                    ) : teacherClasses.length === 0 ? (
                      <Text style={styles.emptyText}>Não está em nenhuma turma</Text>
                    ) : (
                      <View style={styles.classesList}>
                        {teacherClasses.slice(0, 3).map(c => (
                          <View key={c.id} style={styles.classChip}>
                            <Text style={styles.classChipText}>{c.name}</Text>
                          </View>
                        ))}
                        {teacherClasses.length > 3 && (
                          <Text style={styles.moreClasses}>+{teacherClasses.length - 3} mais</Text>
                        )}
                      </View>
                    )}
                  </View>

                  {/* Actions */}
                  <View style={styles.detailsActions}>
                    <Pressable style={styles.actionBtn} onPress={handleOpenEdit}>
                      <Ionicons name="create-outline" size={20} color={colors.purple} />
                      <Text style={styles.actionBtnText}>Editar</Text>
                    </Pressable>
                    
                    {selectedTeacher.active !== false ? (
                      <Pressable 
                        style={[styles.actionBtn, styles.actionBtnDanger]} 
                        onPress={() => handleToggleActive(selectedTeacher)}
                      >
                        <Ionicons name="close-circle-outline" size={20} color={colors.danger} />
                        <Text style={[styles.actionBtnText, { color: colors.danger }]}>Desativar</Text>
                      </Pressable>
                    ) : (
                      <>
                        <Pressable 
                          style={[styles.actionBtn, styles.actionBtnSuccess]} 
                          onPress={() => handleToggleActive(selectedTeacher)}
                        >
                          <Ionicons name="checkmark-circle-outline" size={20} color={colors.green} />
                          <Text style={[styles.actionBtnText, { color: colors.green }]}>Reativar</Text>
                        </Pressable>
                        <Pressable 
                          style={[styles.actionBtn, styles.actionBtnDanger]} 
                          onPress={() => handleDeleteTeacher(selectedTeacher)}
                        >
                          <Ionicons name="trash-outline" size={20} color={colors.danger} />
                          <Text style={[styles.actionBtnText, { color: colors.danger }]}>Excluir</Text>
                        </Pressable>
                      </>
                    )}
                  </View>

                  <Pressable style={styles.btnSecondaryFull} onPress={() => setShowDetailsModal(false)}>
                    <Text style={styles.btnSecondaryText}>Fechar</Text>
                  </Pressable>
                </>
              )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal: Editar Professor */}
      <Modal visible={showEditModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => !saving && setShowEditModal(false)}>
          <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Ionicons name="create-outline" size={28} color={colors.purple} />
              <Text style={styles.modalTitle}>Editar Professor</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Nome completo *</Text>
              <TextInput
                value={editName}
                onChangeText={setEditName}
                placeholder="Nome do professor"
                placeholderTextColor="#94A3B8"
                style={styles.input}
                editable={!saving}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Telefone</Text>
              <TextInput
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="(00) 00000-0000"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                style={styles.input}
                editable={!saving}
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.btnSecondary}
                onPress={() => setShowEditModal(false)}
                disabled={saving}
              >
                <Text style={styles.btnSecondaryText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.btnPrimary} onPress={handleSaveEdit} disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={styles.btnPrimaryText}>Salvar</Text>
                  </>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: Gerenciar Turmas */}
      <Modal visible={showClassesModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowClassesModal(false)}>
          <Pressable style={[styles.modal, styles.classesModal]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <FontAwesome5 name="chalkboard-teacher" size={28} color={colors.purple} />
              <Text style={styles.modalTitle}>Turmas do Professor</Text>
              <Text style={styles.modalSubtitle}>{selectedTeacher?.name}</Text>
            </View>

            {loadingClasses ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="large" color={colors.purple} />
              </View>
            ) : teacherClasses.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="school-outline" size={48} color="#CBD5E1" />
                <Text style={styles.emptyStateTitle}>Sem turmas</Text>
                <Text style={styles.emptyStateText}>Não está em nenhuma turma</Text>
              </View>
            ) : (
              <ScrollView style={styles.classesListScroll}>
                {teacherClasses.map((classItem) => (
                  <View key={classItem.id} style={styles.classRow}>
                    <View style={styles.classInfo}>
                      <Text style={styles.className}>{classItem.name}</Text>
                      <Text style={styles.classMeta}>
                        {formatClassSchedule(classItem)} • {classItem.studentIds?.length || 0} alunos
                      </Text>
                    </View>
                    <Pressable
                      style={styles.removeBtn}
                      onPress={() => handleRemoveFromClass(classItem)}
                    >
                      <Ionicons name="close-circle" size={24} color={colors.danger} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}

            <Pressable style={styles.btnSuccess} onPress={handleOpenAddClass}>
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text style={styles.btnSuccessText}>Adicionar a uma Turma</Text>
            </Pressable>

            <Pressable style={styles.btnSecondaryFull} onPress={() => setShowClassesModal(false)}>
              <Text style={styles.btnSecondaryText}>Fechar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: Adicionar a Turma */}
      <Modal visible={showAddClassModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowAddClassModal(false)}>
          <Pressable style={[styles.modal, styles.classesModal]} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Selecionar Turma</Text>
            <Text style={styles.modalSubtitle}>Adicionar {selectedTeacher?.name} a:</Text>

            <ScrollView style={styles.classesListScroll}>
              {availableClasses.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="school-outline" size={40} color="#CBD5E1" />
                  <Text style={styles.emptyStateText}>Nenhuma turma disponível</Text>
                </View>
              ) : (
                availableClasses.map((classItem) => (
                  <Pressable
                    key={classItem.id}
                    style={styles.classRow}
                    onPress={() => handleAddToClass(classItem)}
                  >
                    <View style={styles.classInfo}>
                      <Text style={styles.className}>{classItem.name}</Text>
                      <Text style={styles.classMeta}>
                        {formatClassSchedule(classItem)} • {classItem.studentIds?.length || 0} alunos
                        {classItem.teacherName && classItem.teacherName !== "Sem professor" && (
                          <Text style={{ color: colors.purple }}> • Prof. {classItem.teacherName}</Text>
                        )}
                      </Text>
                    </View>
                    <Ionicons name="add-circle" size={24} color={colors.green} />
                  </Pressable>
                ))
              )}
            </ScrollView>

            <Pressable style={styles.btnSecondaryFull} onPress={() => setShowAddClassModal(false)}>
              <Text style={styles.btnSecondaryText}>Cancelar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Search and Filters */}
      <View style={[styles.searchBox, isDesktopMode && desktopStyles.searchBox]}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#64748B" style={styles.searchIcon} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar professor..."
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
          />
        </View>
        <Pressable style={styles.addBtn} onPress={() => setShowCreateModal(true)}>
          <Ionicons name="add" size={24} color="#fff" />
        </Pressable>
      </View>

      {/* Filters */}
      <View style={[styles.filtersRow, isDesktopMode && desktopStyles.filtersRow]}>
        {(["ativos", "inativos", "todos"] as FilterType[]).map(f => (
          <Pressable
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {f === "ativos" ? `Ativos (${activeTeachers.length})` :
               f === "inativos" ? `Inativos (${inactiveTeachers.length})` :
               `Todos (${teachers.length})`}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Stats */}
      <View style={[styles.statsRow, isDesktopMode && desktopStyles.statsRow]}>
        <View style={[styles.statCard, styles.statCardGreen]}>
          <Text style={[styles.statNumber, { color: colors.green }]}>{activeTeachers.length}</Text>
          <Text style={styles.statLabel}>Ativos</Text>
        </View>
        <View style={[styles.statCard, styles.statCardRed]}>
          <Text style={[styles.statNumber, { color: colors.danger }]}>{inactiveTeachers.length}</Text>
          <Text style={styles.statLabel}>Inativos</Text>
        </View>
      </View>

      {/* Teacher List */}
      <ScrollView
        style={styles.listContainer}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.purple]} />
        }
      >
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={colors.purple} />
            <Text style={styles.loadingText}>Carregando professores...</Text>
          </View>
        ) : filteredTeachers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="person-outline" size={48} color="#CBD5E1" />
            <Text style={styles.emptyStateTitle}>
              {query ? "Nenhum professor encontrado" : "Nenhum professor cadastrado"}
            </Text>
            <Pressable style={styles.btnPrimary} onPress={() => setShowCreateModal(true)}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.btnPrimaryText}>Adicionar Professor</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {filteredTeachers.slice(0, displayLimit).map((teacher) => {
              const isInactive = teacher.active === false;
              const classCount = getTeacherClassCount(teacher.uid);
              
              return (
                <Pressable
                  key={teacher.uid}
                  style={[styles.teacherCard, isInactive && styles.teacherCardInactive]}
                  onPress={() => handleViewDetails(teacher)}
                >
                  <View style={[styles.statusIndicator, { backgroundColor: isInactive ? colors.danger : colors.green }]} />
                  
                  <View style={styles.teacherInfo}>
                    <View style={styles.nameRow}>
                      <Text style={[styles.teacherName, isInactive && styles.teacherNameInactive]}>
                        {teacher.name}
                      </Text>
                      {classCount > 0 && (
                        <View style={styles.classCountBadge}>
                          <Text style={styles.classCountText}>{classCount}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.teacherCode}>Código: {teacher.teacherCode || "N/A"}</Text>
                  </View>
                  
                  <View style={[styles.statusTag, { backgroundColor: isInactive ? "#FEE2E2" : "#DCFCE7" }]}>
                    <Ionicons 
                      name={isInactive ? "close-circle" : "checkmark-circle"} 
                      size={14} 
                      color={isInactive ? colors.danger : colors.green} 
                    />
                    <Text style={[styles.statusTagText, { color: isInactive ? colors.danger : colors.green }]}>
                      {isInactive ? "Inativo" : "Ativo"}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
            
            {/* Load More */}
            {filteredTeachers.length > displayLimit && (
              <Pressable 
                style={styles.loadMoreBtn}
                onPress={() => setDisplayLimit(prev => prev + TEACHERS_PER_PAGE)}
              >
                <Ionicons name="chevron-down-circle-outline" size={20} color={colors.purple} />
                <Text style={styles.loadMoreText}>
                  Carregar mais ({filteredTeachers.length - displayLimit} restantes)
                </Text>
              </Pressable>
            )}
            
            {filteredTeachers.length > 0 && (
              <Text style={styles.displayCount}>
                Exibindo {Math.min(displayLimit, filteredTeachers.length)} de {filteredTeachers.length} professores
              </Text>
            )}
          </>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },

  // Search
  searchBox: {
    paddingHorizontal: 16,
    paddingTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontWeight: "500",
    color: "#1E293B",
    fontSize: 15,
  },
  addBtn: {
    backgroundColor: colors.purple,
    borderRadius: 12,
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },

  // Filters
  filtersRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  filterChipActive: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  filterChipTextActive: {
    color: "#fff",
  },

  // Stats
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  statCardGreen: { borderLeftWidth: 3, borderLeftColor: colors.green },
  statCardRed: { borderLeftWidth: 3, borderLeftColor: colors.danger },
  statNumber: {
    fontSize: 24,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 2,
  },

  // List
  listContainer: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  listContent: { paddingBottom: 20 },

  // Teacher Card
  teacherCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  teacherCardInactive: { opacity: 0.7 },
  statusIndicator: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  teacherInfo: { flex: 1, marginLeft: 8 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  teacherName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
  },
  teacherNameInactive: { color: "#94A3B8" },
  classCountBadge: {
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  classCountText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.purple,
  },
  teacherCode: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  statusTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusTagText: {
    fontSize: 11,
    fontWeight: "700",
  },

  // Load More
  loadMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    marginTop: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.purple,
  },
  displayCount: {
    textAlign: "center",
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 8,
  },

  // States
  loadingState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  loadingText: {
    color: "#64748B",
    fontWeight: "600",
    marginTop: 12,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
    marginTop: 16,
  },
  emptyStateText: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 13,
    color: "#94A3B8",
    fontStyle: "italic",
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    width: "90%",
    maxWidth: 400,
  },
  detailsModalContainer: {
    width: "92%",
    maxWidth: 420,
    maxHeight: "85%",
    backgroundColor: colors.bg,
    borderRadius: 20,
    overflow: "hidden",
  },
  scrollIndicator: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 4,
  },
  scrollIndicatorBar: {
    width: 40,
    height: 4,
    backgroundColor: "#CBD5E1",
    borderRadius: 2,
  },
  detailsModalScroll: {
    paddingVertical: 20,
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  detailsModalContent: {
    alignItems: "stretch",
    width: "100%",
  },
  detailsModal: { maxWidth: 420 },
  classesModal: { maxHeight: "70%" },
  modalHeader: { alignItems: "center", marginBottom: 20 },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E293B",
    textAlign: "center",
    marginTop: 12,
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    marginTop: 4,
  },
  successIcon: { alignItems: "center", marginBottom: 8 },

  // Input
  inputGroup: { marginBottom: 14 },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1E293B",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  // Info Box
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EDE9FE",
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: colors.purple,
  },

  // Credentials
  credentialsBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 16,
    width: "100%",
    marginVertical: 16,
  },
  credentialRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  credentialLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  credentialValue: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.purple,
  },
  warningText: {
    fontSize: 12,
    color: colors.danger,
    textAlign: "center",
    marginBottom: 16,
  },

  // Details Modal
  detailsHeader: { 
    alignItems: "center", 
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.purple,
  },
  detailsName: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1E293B",
    marginTop: 4,
    marginBottom: 8,
    textAlign: "center",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 8,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  detailsSection: { 
    marginBottom: 20,
    width: "100%",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 12,
  },
  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  manageBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.purple,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  infoLabel: {
    fontSize: 14,
    color: "#64748B",
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
    textAlign: "right",
    flex: 1,
    marginLeft: 12,
  },
  classesList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  classChip: {
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  classChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.purple,
  },
  moreClasses: {
    fontSize: 12,
    color: "#64748B",
    alignSelf: "center",
  },
  detailsActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginTop: 20,
    marginBottom: 20,
    width: "100%",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "#EDE9FE",
    minWidth: 100,
  },
  actionBtnDanger: { backgroundColor: "#FEE2E2" },
  actionBtnSuccess: { backgroundColor: "#DCFCE7" },
  actionBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.purple,
  },

  // Classes Modal
  classesListScroll: { maxHeight: 250, marginBottom: 16 },
  classRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  classInfo: { flex: 1 },
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
  removeBtn: { padding: 4 },

  // Buttons
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  btnPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.purple,
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnPrimaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  btnSecondary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnSecondaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  btnSecondaryFull: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 8,
    width: "100%",
  },
  btnSuccess: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.green,
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnSuccessText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
});

const desktopStyles = StyleSheet.create({
  screen: { backgroundColor: "#F8FAFC" },
  searchBox: { maxWidth: 500, paddingHorizontal: 24 },
  filtersRow: { maxWidth: 500, paddingHorizontal: 24 },
  statsRow: { maxWidth: 350, paddingHorizontal: 24 },
});
