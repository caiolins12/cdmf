import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, ScrollView, TextInput, Text, RefreshControl, Pressable, Modal, Alert, ActivityIndicator, Platform } from "react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import CdmfHeader from "../../components/CdmfHeader";
import SectionHeader from "../../components/SectionHeader";
import PersonAccordionCard from "../../components/PersonAccordionCard";
import { colors } from "../../theme/colors";
import { useAuth, Profile, Class } from "../../contexts/AuthContext";
import { useDesktop } from "../../contexts/DesktopContext";

export default function MasterTeachersScreen() {
  const { isDesktopMode } = useDesktop();
  const { fetchTeachers, createTeacher, deleteTeacher, toggleTeacherActive, getTeacherClasses, removeTeacherFromClass, removeTeacherFromAllClasses, fetchClasses, assignTeacherToClass, getClassesWithoutTeacher } = useAuth();
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [allClasses, setAllClasses] = useState<Class[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [showViewCredentialsModal, setShowViewCredentialsModal] = useState(false);
  const [showClassesModal, setShowClassesModal] = useState(false);
  const [showAddClassModal, setShowAddClassModal] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<Profile | null>(null);
  const [teacherClasses, setTeacherClasses] = useState<Class[]>([]);
  const [availableClasses, setAvailableClasses] = useState<Class[]>([]);
  const [creating, setCreating] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(false);

  // Form states
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [createdCredentials, setCreatedCredentials] = useState<{ code: string; password: string } | null>(null);

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

  // Recarrega dados quando a tela ganha foco
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

  const filteredTeachers = teachers.filter((t) =>
    t.name.toLowerCase().includes(query.toLowerCase()) ||
    (t.teacherCode?.toLowerCase().includes(query.toLowerCase()) ?? false)
  );

  const activeTeachers = teachers.filter((t) => t.active !== false);
  const inactiveTeachers = teachers.filter((t) => t.active === false);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("pt-BR");
  };

  const handleCreateTeacher = async () => {
    if (!newName.trim()) {
      Alert.alert("Atenção", "Digite o nome do professor");
      return;
    }

    setCreating(true);
    try {
      const credentials = await createTeacher(newName.trim(), newPhone.trim() || undefined);
      setCreatedCredentials(credentials);
      setShowCreateModal(false);
      setShowCredentialsModal(true);
      setNewName("");
      setNewPhone("");
      await loadTeachers();
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Não foi possível criar o professor");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (teacher: Profile) => {
    const newStatus = !teacher.active;
    const action = newStatus ? "ativar" : "desativar";
    
    const message = newStatus 
      ? `Deseja ativar o professor ${teacher.name}?`
      : `Deseja desativar o professor ${teacher.name}?\n\nEle será removido de todas as turmas em que está.`;
    
    Alert.alert(
      `${newStatus ? "Ativar" : "Desativar"} Professor`,
      message,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Confirmar",
          style: newStatus ? "default" : "destructive",
          onPress: async () => {
            try {
              await toggleTeacherActive(teacher.uid, newStatus);
              await loadTeachers();
              Alert.alert("Sucesso", `Professor ${newStatus ? "ativado" : "desativado"} com sucesso!`);
            } catch (e: any) {
              Alert.alert("Erro", e.message || "Não foi possível alterar o status");
            }
          },
        },
      ]
    );
  };

  const handleDeleteTeacher = async (teacher: Profile) => {
    Alert.alert(
      "Excluir Professor",
      `Tem certeza que deseja excluir permanentemente o professor ${teacher.name}?\n\nEsta ação não pode ser desfeita.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteTeacher(teacher.uid);
              await loadTeachers();
              Alert.alert("Sucesso", "Professor excluído com sucesso!");
            } catch (e: any) {
              Alert.alert("Erro", e.message || "Não foi possível excluir o professor");
            }
          },
        },
      ]
    );
  };

  const handleViewCredentials = (teacher: Profile) => {
    setSelectedTeacher(teacher);
    setShowViewCredentialsModal(true);
  };

  const handleManageClasses = async (teacher: Profile) => {
    setSelectedTeacher(teacher);
    setLoadingClasses(true);
    setShowClassesModal(true);
    
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

  const handleRemoveFromClass = (classItem: Class) => {
    Alert.alert(
      "Remover da Turma",
      `Deseja remover ${selectedTeacher?.name} da turma ${classItem.name}?\n\nA turma ficará sem professor.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: async () => {
            try {
              await removeTeacherFromClass(classItem.id);
              // Recarrega as turmas do professor
              const classes = await getTeacherClasses(selectedTeacher!.uid);
              setTeacherClasses(classes);
              Alert.alert("Sucesso", "Professor removido da turma!");
            } catch (e: any) {
              Alert.alert("Erro", e.message || "Não foi possível remover");
            }
          },
        },
      ]
    );
  };

  const handleRemoveFromAllClasses = () => {
    if (!selectedTeacher || teacherClasses.length === 0) return;
    
    Alert.alert(
      "Remover de Todas as Turmas",
      `Deseja remover ${selectedTeacher.name} de todas as ${teacherClasses.length} turma(s)?\n\nAs turmas ficarão sem professor.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover de Todas",
          style: "destructive",
          onPress: async () => {
            try {
              await removeTeacherFromAllClasses(selectedTeacher.uid);
              setTeacherClasses([]);
              await loadTeachers(); // Recarrega para atualizar
              Alert.alert("Sucesso", "Professor removido de todas as turmas!");
            } catch (e: any) {
              Alert.alert("Erro", e.message || "Não foi possível remover");
            }
          },
        },
      ]
    );
  };

  const handleOpenAddClass = () => {
    // Filtra turmas que o professor ainda não está e turmas sem professor ou com outro professor
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
      // Recarrega turmas do professor
      const classes = await getTeacherClasses(selectedTeacher.uid);
      setTeacherClasses(classes);
      setShowAddClassModal(false);
      await loadTeachers(); // Recarrega para atualizar
      Alert.alert("Sucesso", `Professor adicionado à turma ${classItem.name}!`);
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Não foi possível adicionar");
    }
  };

  // Helper para formatar horário da turma
  const formatClassSchedule = (classItem: Class) => {
    if (!classItem.schedule || classItem.schedule.length === 0) return "";
    const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const schedule = classItem.schedule[0];
    return `${days[schedule.dayOfWeek]} ${schedule.startTime}`;
  };

  return (
    <View style={[styles.screen, isDesktopMode && desktopStyles.screen]}>
      {!isDesktopMode && <CdmfHeader />}
      {!isDesktopMode && <SectionHeader title="Gestão de Professores" />}

      {/* Modal para criar professor */}
      <Modal visible={showCreateModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => !creating && setShowCreateModal(false)}>
          <Pressable style={styles.createModal} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Novo Professor</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Nome completo *</Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="Ex: Maria Silva"
                placeholderTextColor="#999"
                style={styles.modalInput}
                editable={!creating}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Telefone (opcional)</Text>
              <TextInput
                value={newPhone}
                onChangeText={setNewPhone}
                placeholder="(00) 00000-0000"
                placeholderTextColor="#999"
                keyboardType="phone-pad"
                style={styles.modalInput}
                editable={!creating}
              />
            </View>

            <View style={styles.modalInfo}>
              <Ionicons name="information-circle" size={18} color={colors.purple} />
              <Text style={styles.modalInfoText}>
                Será gerado um código e senha para o professor acessar o sistema
              </Text>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setShowCreateModal(false)}
                disabled={creating}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </Pressable>

              {creating ? (
                <View style={styles.createBtn}>
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              ) : (
                <Pressable style={styles.createBtn} onPress={handleCreateTeacher}>
                  <Text style={styles.createBtnText}>Criar Professor</Text>
                </Pressable>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal com credenciais do professor criado */}
      <Modal visible={showCredentialsModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.credentialsModal}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={64} color={colors.green} />
            </View>

            <Text style={styles.credentialsTitle}>Professor Criado!</Text>
            <Text style={styles.credentialsSubtitle}>Credenciais de acesso:</Text>

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

            <Text style={styles.credentialsWarning}>
              ⚠️ Anote e guarde estas informações com segurança!
            </Text>

            <Pressable style={styles.doneBtn} onPress={() => setShowCredentialsModal(false)}>
              <Text style={styles.doneBtnText}>Entendi</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Modal para ver credenciais de professor existente */}
      <Modal visible={showViewCredentialsModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowViewCredentialsModal(false)}>
          <View style={styles.credentialsModal}>
            <Ionicons name="key" size={48} color={colors.purple} style={{ marginBottom: 16 }} />

            <Text style={styles.credentialsTitle}>Credenciais do Professor</Text>
            <Text style={styles.credentialsSubtitle}>{selectedTeacher?.name}</Text>

            {selectedTeacher && (
              <View style={styles.credentialsBox}>
                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Código:</Text>
                  <Text style={styles.credentialValue}>{selectedTeacher.teacherCode || "N/A"}</Text>
                </View>
                <View style={styles.credentialRow}>
                  <Text style={styles.credentialLabel}>Senha:</Text>
                  <Text style={[styles.credentialValue, { fontSize: 13 }]}>
                    {selectedTeacher.tempPassword || "Definida pelo professor"}
                  </Text>
                </View>
              </View>
            )}

            <Pressable style={styles.doneBtn} onPress={() => setShowViewCredentialsModal(false)}>
              <Text style={styles.doneBtnText}>Fechar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Modal para gerenciar turmas do professor */}
      <Modal visible={showClassesModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowClassesModal(false)}>
          <Pressable style={styles.classesModal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.classesHeader}>
              <FontAwesome5 name="chalkboard-teacher" size={28} color={colors.purple} />
              <Text style={styles.classesTitle}>Turmas do Professor</Text>
              <Text style={styles.classesSubtitle}>{selectedTeacher?.name}</Text>
            </View>

            {loadingClasses ? (
              <View style={styles.classesLoading}>
                <ActivityIndicator size="large" color={colors.purple} />
                <Text style={styles.classesLoadingText}>Carregando turmas...</Text>
              </View>
            ) : teacherClasses.length === 0 ? (
              <View style={styles.noClassesContainer}>
                <Ionicons name="school-outline" size={48} color="#ccc" />
                <Text style={styles.noClassesText}>Não está em nenhuma turma</Text>
                <Text style={styles.noClassesSubtext}>
                  Atribua turmas na tela de Gestão de Turmas
                </Text>
              </View>
            ) : (
              <>
                <ScrollView style={styles.classesList}>
                  {teacherClasses.map((classItem) => (
                    <View key={classItem.id} style={styles.classRow}>
                      <View style={styles.classInfo}>
                        <Text style={styles.className}>{classItem.name}</Text>
                        <Text style={styles.classDetails}>
                          {classItem.studentIds?.length || 0} alunos
                        </Text>
                      </View>
                      <Pressable
                        style={styles.removeClassBtn}
                        onPress={() => handleRemoveFromClass(classItem)}
                      >
                        <Ionicons name="close-circle" size={24} color={colors.danger} />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>

                {teacherClasses.length > 1 && (
                  <Pressable style={styles.removeAllBtn} onPress={handleRemoveFromAllClasses}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    <Text style={styles.removeAllBtnText}>Remover de todas as turmas</Text>
                  </Pressable>
                )}
              </>
            )}

            <Pressable style={styles.addClassBtn} onPress={handleOpenAddClass}>
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={styles.addClassBtnText}>Adicionar a uma Turma</Text>
            </Pressable>

            <Pressable style={styles.doneBtn} onPress={() => setShowClassesModal(false)}>
              <Text style={styles.doneBtnText}>Fechar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal para adicionar professor a uma turma */}
      <Modal visible={showAddClassModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowAddClassModal(false)}>
          <Pressable style={styles.addClassModal} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.addClassModalTitle}>Selecionar Turma</Text>
            <Text style={styles.addClassModalSubtitle}>Adicionar {selectedTeacher?.name} a:</Text>

            <ScrollView style={styles.availableClassesList}>
              {availableClasses.length === 0 ? (
                <View style={styles.noAvailableClasses}>
                  <Ionicons name="school-outline" size={40} color="#ccc" />
                  <Text style={styles.noAvailableClassesText}>Nenhuma turma disponível</Text>
                </View>
              ) : (
                availableClasses.map((classItem) => (
                  <Pressable
                    key={classItem.id}
                    style={styles.availableClassRow}
                    onPress={() => handleAddToClass(classItem)}
                  >
                    <View style={styles.availableClassInfo}>
                      <Text style={styles.availableClassName}>{classItem.name}</Text>
                      <Text style={styles.availableClassMeta}>
                        {formatClassSchedule(classItem)} • {classItem.studentIds?.length || 0} alunos
                        {classItem.teacherName && classItem.teacherName !== "Sem professor" && (
                          <Text style={styles.currentTeacher}> • Prof. {classItem.teacherName}</Text>
                        )}
                      </Text>
                    </View>
                    <Ionicons name="add-circle" size={24} color={colors.green} />
                  </Pressable>
                ))
              )}
            </ScrollView>

            <Pressable style={styles.cancelAddBtn} onPress={() => setShowAddClassModal(false)}>
              <Text style={styles.cancelAddBtnText}>Cancelar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={styles.searchBox}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#777" style={styles.searchIcon} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar professor..."
            placeholderTextColor="#777"
            style={styles.search}
          />
        </View>
        <Pressable style={styles.addBtn} onPress={() => setShowCreateModal(true)}>
          <Ionicons name="add" size={24} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{activeTeachers.length}</Text>
          <Text style={styles.statLabel}>Ativos</Text>
        </View>
        <View style={[styles.statCard, styles.statCardInactive]}>
          <Text style={[styles.statNumber, styles.statNumberInactive]}>{inactiveTeachers.length}</Text>
          <Text style={styles.statLabel}>Inativos</Text>
        </View>
      </View>

      <View style={styles.listContainer}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.purple} />
            <Text style={styles.loadingText}>Carregando professores...</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.purple]} />
            }
          >
            {filteredTeachers.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="person-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>
                  {query ? "Nenhum professor encontrado" : "Nenhum professor cadastrado"}
                </Text>
                <Pressable style={styles.emptyBtn} onPress={() => setShowCreateModal(true)}>
                  <Ionicons name="add" size={20} color="#fff" />
                  <Text style={styles.emptyBtnText}>Adicionar Professor</Text>
                </Pressable>
              </View>
            ) : (
              <>
                {filteredTeachers.filter(t => t.active !== false).length > 0 && (
                  <>
                    <Text style={styles.groupTitle}>PROFESSORES ATIVOS</Text>
                    {filteredTeachers
                      .filter((t) => t.active !== false)
                      .map((teacher) => (
                        <View key={teacher.uid} style={{ marginBottom: 10 }}>
                          <PersonAccordionCard
                            name={teacher.name}
                            typeLabel="PROFESSOR"
                            subtitle={`Código: ${teacher.teacherCode || "N/A"}`}
                            extraInfo={`Telefone: ${teacher.phone || "Não informado"} • Desde: ${formatDate(teacher.createdAt)}`}
                            status="Ativo"
                            actions={[
                              {
                                label: "VER CREDENCIAIS",
                                onPress: () => handleViewCredentials(teacher),
                              },
                              {
                                label: "GERENCIAR TURMAS",
                                onPress: () => handleManageClasses(teacher),
                              },
                              {
                                label: "DESATIVAR",
                                onPress: () => handleToggleActive(teacher),
                                variant: "dangerOutline",
                              },
                            ]}
                          />
                        </View>
                      ))}
                  </>
                )}

                {filteredTeachers.filter(t => t.active === false).length > 0 && (
                  <>
                    <Text style={[styles.groupTitle, { marginTop: 16 }]}>PROFESSORES INATIVOS</Text>
                    {filteredTeachers
                      .filter((t) => t.active === false)
                      .map((teacher) => (
                        <View key={teacher.uid} style={{ marginBottom: 10, opacity: 0.7 }}>
                          <PersonAccordionCard
                            name={teacher.name}
                            typeLabel="PROFESSOR"
                            subtitle={`Código: ${teacher.teacherCode || "N/A"}`}
                            status="Inativo"
                            actions={[
                              {
                                label: "REATIVAR",
                                onPress: () => handleToggleActive(teacher),
                              },
                              {
                                label: "EXCLUIR",
                                onPress: () => handleDeleteTeacher(teacher),
                                variant: "danger",
                              },
                            ]}
                          />
                        </View>
                      ))}
                  </>
                )}
              </>
            )}
            <View style={{ height: 18 }} />
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  searchBox: {
    paddingHorizontal: 12,
    paddingTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E3E3E3",
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  search: {
    flex: 1,
    paddingVertical: 12,
    fontWeight: "600",
    color: colors.text,
    fontSize: 15,
  },
  addBtn: {
    backgroundColor: colors.purple,
    borderRadius: 14,
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },

  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  statCardInactive: {
    backgroundColor: "#FFEBEE",
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.green,
  },
  statNumberInactive: {
    color: colors.danger,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 2,
  },

  listContainer: {
    flex: 1,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#BDBDBD",
    backgroundColor: "#EFEFEF",
    padding: 10,
  },
  listContent: { paddingBottom: 10 },

  groupTitle: {
    fontWeight: "900",
    color: colors.text,
    marginBottom: 8,
    marginTop: 6,
    fontSize: 13,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    color: colors.muted,
    fontWeight: "600",
  },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    color: colors.muted,
    fontWeight: "600",
    marginTop: 12,
    fontSize: 15,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.purple,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  emptyBtnText: {
    color: "#fff",
    fontWeight: "700",
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  createModal: {
    backgroundColor: colors.bg,
    borderRadius: 20,
    padding: 24,
    width: "90%",
    maxWidth: 360,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.grayBorder,
  },
  modalInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3e5f5",
    padding: 12,
    borderRadius: 10,
    marginTop: 6,
    marginBottom: 16,
    gap: 8,
  },
  modalInfoText: {
    flex: 1,
    fontSize: 12,
    color: colors.purple,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.muted,
  },
  createBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },

  // Credentials modal
  credentialsModal: {
    backgroundColor: colors.bg,
    borderRadius: 20,
    padding: 24,
    width: "90%",
    maxWidth: 360,
    alignItems: "center",
  },
  successIcon: {
    marginBottom: 16,
  },
  credentialsTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
  },
  credentialsSubtitle: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 8,
    marginBottom: 16,
  },
  credentialsBox: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 16,
    width: "100%",
    marginBottom: 16,
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
    color: colors.muted,
  },
  credentialValue: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.purple,
  },
  credentialsWarning: {
    fontSize: 12,
    color: colors.danger,
    textAlign: "center",
    marginBottom: 16,
  },
  doneBtn: {
    backgroundColor: "#E0E0E0",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    width: "100%",
    marginTop: 12,
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#555",
  },

  // Classes modal
  classesModal: {
    backgroundColor: colors.bg,
    borderRadius: 20,
    padding: 24,
    width: "90%",
    maxWidth: 360,
    maxHeight: "70%",
  },
  classesHeader: {
    alignItems: "center",
    marginBottom: 20,
  },
  classesTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
    marginTop: 12,
  },
  classesSubtitle: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 4,
  },
  classesLoading: {
    alignItems: "center",
    paddingVertical: 40,
  },
  classesLoadingText: {
    color: colors.muted,
    marginTop: 12,
  },
  noClassesContainer: {
    alignItems: "center",
    paddingVertical: 30,
  },
  noClassesText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 12,
  },
  noClassesSubtext: {
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    marginTop: 6,
  },
  classesList: {
    maxHeight: 200,
    marginBottom: 16,
  },
  classRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  classInfo: {
    flex: 1,
  },
  className: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  classDetails: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  removeClassBtn: {
    padding: 4,
  },
  removeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFEBEE",
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 16,
    gap: 8,
  },
  removeAllBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.danger,
  },
  addClassBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.green,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 16,
    width: "100%",
    gap: 8,
  },
  addClassBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },

  // Add Class Modal
  addClassModal: {
    backgroundColor: colors.bg,
    borderRadius: 20,
    padding: 24,
    width: "90%",
    maxWidth: 360,
    maxHeight: "70%",
  },
  addClassModalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
  },
  addClassModalSubtitle: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 16,
  },
  availableClassesList: {
    maxHeight: 250,
  },
  noAvailableClasses: {
    alignItems: "center",
    paddingVertical: 30,
  },
  noAvailableClassesText: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 12,
  },
  availableClassRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  availableClassInfo: {
    flex: 1,
  },
  availableClassName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  availableClassMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  currentTeacher: {
    color: colors.purple,
  },
  cancelAddBtn: {
    backgroundColor: "#f5f5f5",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 12,
  },
  cancelAddBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.muted,
  },
});

// Desktop Styles
const desktopStyles = StyleSheet.create({
  screen: {
    backgroundColor: "#F8FAFC",
  },
});
