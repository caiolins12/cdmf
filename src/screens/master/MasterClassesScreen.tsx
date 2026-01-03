import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, ScrollView, TextInput, Text, RefreshControl, Pressable, Modal, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";

import CdmfHeader from "../../components/CdmfHeader";
import SectionHeader from "../../components/SectionHeader";
import TimeInput from "../../components/TimeInput";
import { colors } from "../../theme/colors";
import { useAuth, Class, Profile } from "../../contexts/AuthContext";
import { useDesktop } from "../../contexts/DesktopContext";

const PAYMENT_STATUS_MAP = {
  em_dia: { label: "Em dia", color: colors.green, icon: "checkmark-circle" },
  pendente: { label: "Pendente", color: "#FFA000", icon: "alert-circle" },
  atrasado: { label: "Atrasado", color: colors.danger, icon: "close-circle" },
};

const DAYS_OF_WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function MasterClassesScreen() {
  const { fetchClasses, createClass, updateClass, deleteClass, fetchTeachers, fetchStudents, addStudentToClass, removeStudentFromClass } = useAuth();
  const { isDesktopMode } = useDesktop();
  
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const navigation = useNavigation<any>();

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showManageStudentsModal, setShowManageStudentsModal] = useState(false);
  const [showStudentDetailsModal, setShowStudentDetailsModal] = useState(false);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);

  // Form states (criar)
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");

  // Form states (editar)
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTeacherId, setEditTeacherId] = useState("");
  const [editDays, setEditDays] = useState<number[]>([]);
  const [editStartTime, setEditStartTime] = useState("08:00");
  const [editEndTime, setEditEndTime] = useState("09:00");

  const loadData = useCallback(async () => {
    try {
      const [classesData, teachersData, studentsData] = await Promise.all([
        fetchClasses(),
        fetchTeachers(),
        fetchStudents(),
      ]);
      setClasses(classesData);
      setTeachers(teachersData.filter(t => t.active !== false));
      setStudents(studentsData);
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
    } finally {
      setLoading(false);
    }
  }, [fetchClasses, fetchTeachers, fetchStudents]);

  // Recarrega dados quando a tela ganha foco
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const filteredClasses = classes.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.teacherName.toLowerCase().includes(query.toLowerCase())
  );

  const handleCreateClass = async () => {
    if (!newName.trim()) {
      Alert.alert("Atenção", "Digite o nome da turma");
      return;
    }
    if (!selectedTeacherId) {
      Alert.alert("Atenção", "Selecione um professor responsável");
      return;
    }
    if (selectedDays.length === 0) {
      Alert.alert("Atenção", "Selecione pelo menos um dia da semana");
      return;
    }

    const teacher = teachers.find(t => t.uid === selectedTeacherId);
    if (!teacher) {
      Alert.alert("Erro", "Professor não encontrado");
      return;
    }

    setCreating(true);
    try {
      const classData: any = {
        name: newName.trim(),
        teacherId: selectedTeacherId,
        teacherName: teacher.name,
        studentIds: [],
        schedule: selectedDays.map(day => ({
          dayOfWeek: day,
          startTime,
          endTime,
        })),
        active: true,
      };
      
      // Só adiciona descrição se tiver valor
      if (newDescription.trim()) {
        classData.description = newDescription.trim();
      }
      
      await createClass(classData);

      setShowCreateModal(false);
      resetForm();
      await loadData();
      Alert.alert("Sucesso", "Turma criada com sucesso!");
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Não foi possível criar a turma");
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setNewName("");
    setNewDescription("");
    setSelectedTeacherId("");
    setSelectedDays([]);
    setStartTime("08:00");
    setEndTime("09:00");
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleManageStudents = (classItem: Class) => {
    setSelectedClass(classItem);
    setShowManageStudentsModal(true);
  };

  const handleEditClass = (classItem: Class) => {
    setSelectedClass(classItem);
    setEditName(classItem.name);
    setEditDescription(classItem.description || "");
    setEditTeacherId(classItem.teacherId);
    setEditDays(classItem.schedule?.map(s => s.dayOfWeek) || []);
    setEditStartTime(classItem.schedule?.[0]?.startTime || "08:00");
    setEditEndTime(classItem.schedule?.[0]?.endTime || "09:00");
    setShowEditModal(true);
  };

  const handleDeleteClass = (classItem: Class) => {
    Alert.alert(
      "Excluir Turma",
      `Deseja excluir a turma "${classItem.name}"?\n\nEsta ação não pode ser desfeita.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteClass(classItem.id);
              await loadData();
              Alert.alert("Sucesso", "Turma excluída com sucesso!");
            } catch (e: any) {
              Alert.alert("Erro", e.message || "Não foi possível excluir a turma");
            }
          },
        },
      ]
    );
  };

  const handleSaveEdit = async () => {
    if (!selectedClass) return;
    
    if (!editName.trim()) {
      Alert.alert("Atenção", "Digite o nome da turma");
      return;
    }
    if (!editTeacherId) {
      Alert.alert("Atenção", "Selecione um professor responsável");
      return;
    }
    if (editDays.length === 0) {
      Alert.alert("Atenção", "Selecione pelo menos um dia da semana");
      return;
    }

    const teacher = teachers.find(t => t.uid === editTeacherId);
    if (!teacher) {
      Alert.alert("Erro", "Professor não encontrado");
      return;
    }

    setEditing(true);
    try {
      const updateData: any = {
        name: editName.trim(),
        teacherId: editTeacherId,
        teacherName: teacher.name,
        schedule: editDays.map(day => ({
          dayOfWeek: day,
          startTime: editStartTime,
          endTime: editEndTime,
        })),
      };

      // Só adiciona descrição se tiver valor
      if (editDescription.trim()) {
        updateData.description = editDescription.trim();
      }

      await updateClass(selectedClass.id, updateData);

      setShowEditModal(false);
      await loadData();
      Alert.alert("Sucesso", "Turma atualizada com sucesso!");
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Não foi possível atualizar a turma");
    } finally {
      setEditing(false);
    }
  };

  const toggleEditDay = (day: number) => {
    setEditDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleToggleStudent = async (studentId: string) => {
    if (!selectedClass) return;

    try {
      if (selectedClass.studentIds.includes(studentId)) {
        await removeStudentFromClass(selectedClass.id, studentId);
      } else {
        await addStudentToClass(selectedClass.id, studentId);
      }
      await loadData();
      // Atualiza o selectedClass com os novos dados
      const updatedClasses = await fetchClasses();
      const updated = updatedClasses.find(c => c.id === selectedClass.id);
      if (updated) setSelectedClass(updated);
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Não foi possível atualizar");
    }
  };

  const handleViewStudentDetails = (student: Profile) => {
    setSelectedStudent(student);
    setShowStudentDetailsModal(true);
  };

  const handleGoToStudentScreen = () => {
    setShowStudentDetailsModal(false);
    setShowManageStudentsModal(false);
    // Navega para a aba de Alunos
    navigation.navigate("Alunos");
  };

  const getStudentClasses = (student: Profile): Class[] => {
    return classes.filter(c => c.studentIds?.includes(student.uid));
  };

  const getPaymentStatusInfo = (status?: string) => {
    return PAYMENT_STATUS_MAP[status as keyof typeof PAYMENT_STATUS_MAP] || PAYMENT_STATUS_MAP.pendente;
  };

  const formatSchedule = (classItem: Class) => {
    if (!classItem.schedule || classItem.schedule.length === 0) return "Sem horário";
    const days = classItem.schedule.map(s => DAYS_OF_WEEK[s.dayOfWeek]).join(", ");
    const time = classItem.schedule[0];
    return `${days} • ${time.startTime} - ${time.endTime}`;
  };

  return (
    <View style={[styles.screen, isDesktopMode && desktopStyles.screen]}>
      {!isDesktopMode && <CdmfHeader />}
      {!isDesktopMode && <SectionHeader title="Gestão de Turmas" />}

      {/* Modal para criar turma */}
      <Modal visible={showCreateModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => !creating && setShowCreateModal(false)}>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <Pressable style={styles.createModal} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>Nova Turma</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nome da Turma *</Text>
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Ex: Violão Iniciante"
                  placeholderTextColor="#999"
                  style={styles.modalInput}
                  editable={!creating}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Descrição (opcional)</Text>
                <TextInput
                  value={newDescription}
                  onChangeText={setNewDescription}
                  placeholder="Detalhes sobre a turma..."
                  placeholderTextColor="#999"
                  style={[styles.modalInput, { height: 80, textAlignVertical: "top" }]}
                  multiline
                  editable={!creating}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Professor Responsável *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.teachersList}>
                  {teachers.map(teacher => (
                    <Pressable
                      key={teacher.uid}
                      style={[
                        styles.teacherChip,
                        selectedTeacherId === teacher.uid && styles.teacherChipSelected,
                      ]}
                      onPress={() => setSelectedTeacherId(teacher.uid)}
                    >
                      <Text style={[
                        styles.teacherChipText,
                        selectedTeacherId === teacher.uid && styles.teacherChipTextSelected,
                      ]}>
                        {teacher.name}
                      </Text>
                    </Pressable>
                  ))}
                  {teachers.length === 0 && (
                    <Text style={styles.noTeachersText}>Nenhum professor cadastrado</Text>
                  )}
                </ScrollView>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Dias da Semana *</Text>
                <View style={styles.daysRow}>
                  {DAYS_OF_WEEK.map((day, index) => (
                    <Pressable
                      key={index}
                      style={[
                        styles.dayChip,
                        selectedDays.includes(index) && styles.dayChipSelected,
                      ]}
                      onPress={() => toggleDay(index)}
                    >
                      <Text style={[
                        styles.dayChipText,
                        selectedDays.includes(index) && styles.dayChipTextSelected,
                      ]}>
                        {day}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Horário</Text>
                <View style={styles.timeRow}>
                  <TimeInput label="Início" value={startTime} onChange={setStartTime} />
                  <Text style={styles.timeSeparator}>até</Text>
                  <TimeInput label="Fim" value={endTime} onChange={setEndTime} />
                </View>
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  style={styles.cancelBtn}
                  onPress={() => { setShowCreateModal(false); resetForm(); }}
                  disabled={creating}
                >
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </Pressable>

                {creating ? (
                  <View style={styles.createBtn}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                ) : (
                  <Pressable style={styles.createBtn} onPress={handleCreateClass}>
                    <Text style={styles.createBtnText}>Criar Turma</Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Modal>

      {/* Modal para gerenciar alunos da turma */}
      <Modal visible={showManageStudentsModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowManageStudentsModal(false)}>
          <View style={styles.studentsModal}>
            <Text style={styles.modalTitle}>Alunos da Turma</Text>
            <Text style={styles.modalSubtitle}>{selectedClass?.name}</Text>

            <ScrollView style={styles.studentsList}>
              {students.filter(s => s.enrollmentStatus !== "inativo").length === 0 ? (
                <Text style={styles.noStudentsText}>Nenhum aluno ativo cadastrado no sistema</Text>
              ) : (
                students.filter(s => s.enrollmentStatus !== "inativo").map(student => {
                  const isInClass = selectedClass?.studentIds.includes(student.uid);
                  const paymentInfo = getPaymentStatusInfo(student.paymentStatus);
                  return (
                    <View key={student.uid} style={[styles.studentRow, isInClass && styles.studentRowSelected]}>
                      <Pressable
                        style={styles.studentInfo}
                        onPress={() => handleViewStudentDetails(student)}
                      >
                        <View style={styles.studentNameRow}>
                          <Text style={styles.studentName}>{student.name}</Text>
                          {student.dancePreference && (
                            <View style={styles.danceIcon}>
                              <Ionicons
                                name={
                                  student.dancePreference === "condutor" ? "arrow-forward" :
                                  student.dancePreference === "conduzido" ? "arrow-back" :
                                  student.dancePreference === "ambos" ? "swap-horizontal" :
                                  "help-circle"
                                }
                                size={14}
                                color="#FF6B35"
                              />
                            </View>
                          )}
                        </View>
                        <View style={styles.studentMeta}>
                          <View style={[styles.studentStatusDot, { backgroundColor: paymentInfo.color }]} />
                          <Text style={styles.studentEmail}>{student.email}</Text>
                        </View>
                      </Pressable>
                      <Pressable 
                        style={styles.toggleStudentBtn}
                        onPress={() => handleToggleStudent(student.uid)}
                      >
                        <Ionicons
                          name={isInClass ? "checkmark-circle" : "add-circle-outline"}
                          size={28}
                          color={isInClass ? colors.green : colors.muted}
                        />
                      </Pressable>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <Pressable style={styles.doneBtn} onPress={() => setShowManageStudentsModal(false)}>
              <Text style={styles.doneBtnText}>Concluir</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Modal de detalhes do aluno */}
      <Modal visible={showStudentDetailsModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowStudentDetailsModal(false)}>
          <Pressable style={styles.studentDetailsModal} onPress={(e) => e.stopPropagation()}>
            {selectedStudent && (
              <>
                <View style={styles.studentAvatar}>
                  <FontAwesome5 name="user-graduate" size={28} color={colors.purple} />
                </View>

                <Text style={styles.studentDetailsName}>{selectedStudent.name}</Text>
                <Text style={styles.studentDetailsEmail}>{selectedStudent.email}</Text>

                {/* Status de Pagamento */}
                <View style={[
                  styles.paymentBadge,
                  { backgroundColor: getPaymentStatusInfo(selectedStudent.paymentStatus).color }
                ]}>
                  <Ionicons 
                    name={getPaymentStatusInfo(selectedStudent.paymentStatus).icon as any} 
                    size={14} 
                    color="#fff" 
                  />
                  <Text style={styles.paymentBadgeText}>
                    {getPaymentStatusInfo(selectedStudent.paymentStatus).label}
                  </Text>
                </View>

                {/* Turmas */}
                <View style={styles.studentSection}>
                  <Text style={styles.studentSectionTitle}>TURMAS MATRICULADO</Text>
                  {getStudentClasses(selectedStudent).length === 0 ? (
                    <Text style={styles.noClassesText}>Não está em nenhuma turma</Text>
                  ) : (
                    getStudentClasses(selectedStudent).map(c => {
                      const scheduleInfo = c.schedule && c.schedule.length > 0
                        ? `${DAYS_OF_WEEK[c.schedule[0].dayOfWeek].toUpperCase()} | ${c.schedule[0].startTime}h`
                        : "";
                      return (
                        <View key={c.id} style={styles.miniClassItem}>
                          <FontAwesome5 name="users" size={12} color={colors.purple} />
                          <Text style={styles.miniClassName}>
                            {c.name}{scheduleInfo ? ` • ${scheduleInfo}` : ""}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </View>

                {/* Ações */}
                <View style={styles.studentActions}>
                  <Pressable style={styles.goToProfileBtn} onPress={handleGoToStudentScreen}>
                    <Ionicons name="open-outline" size={18} color={colors.purple} />
                    <Text style={styles.goToProfileBtnText}>Ver Perfil Completo</Text>
                  </Pressable>
                </View>

                <Pressable style={styles.closeDetailsBtn} onPress={() => setShowStudentDetailsModal(false)}>
                  <Text style={styles.closeDetailsBtnText}>Fechar</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal para editar turma */}
      <Modal visible={showEditModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => !editing && setShowEditModal(false)}>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <Pressable style={styles.createModal} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>Editar Turma</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nome da Turma *</Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Ex: Violão Iniciante"
                  placeholderTextColor="#999"
                  style={styles.modalInput}
                  editable={!editing}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Descrição (opcional)</Text>
                <TextInput
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder="Detalhes sobre a turma..."
                  placeholderTextColor="#999"
                  style={[styles.modalInput, { height: 80, textAlignVertical: "top" }]}
                  multiline
                  editable={!editing}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Professor Responsável *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.teachersList}>
                  {teachers.map(teacher => (
                    <Pressable
                      key={teacher.uid}
                      style={[
                        styles.teacherChip,
                        editTeacherId === teacher.uid && styles.teacherChipSelected,
                      ]}
                      onPress={() => setEditTeacherId(teacher.uid)}
                    >
                      <Text style={[
                        styles.teacherChipText,
                        editTeacherId === teacher.uid && styles.teacherChipTextSelected,
                      ]}>
                        {teacher.name}
                      </Text>
                    </Pressable>
                  ))}
                  {teachers.length === 0 && (
                    <Text style={styles.noTeachersText}>Nenhum professor cadastrado</Text>
                  )}
                </ScrollView>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Dias da Semana *</Text>
                <View style={styles.daysRow}>
                  {DAYS_OF_WEEK.map((day, index) => (
                    <Pressable
                      key={index}
                      style={[
                        styles.dayChip,
                        editDays.includes(index) && styles.dayChipSelected,
                      ]}
                      onPress={() => toggleEditDay(index)}
                    >
                      <Text style={[
                        styles.dayChipText,
                        editDays.includes(index) && styles.dayChipTextSelected,
                      ]}>
                        {day}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Horário</Text>
                <View style={styles.timeRow}>
                  <TimeInput label="Início" value={editStartTime} onChange={setEditStartTime} />
                  <Text style={styles.timeSeparator}>até</Text>
                  <TimeInput label="Fim" value={editEndTime} onChange={setEditEndTime} />
                </View>
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  style={styles.cancelBtn}
                  onPress={() => setShowEditModal(false)}
                  disabled={editing}
                >
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </Pressable>

                {editing ? (
                  <View style={styles.createBtn}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                ) : (
                  <Pressable style={styles.createBtn} onPress={handleSaveEdit}>
                    <Text style={styles.createBtnText}>Salvar</Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Modal>

      <View style={styles.searchBox}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#777" style={styles.searchIcon} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar turma..."
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
          <FontAwesome5 name="users" size={20} color={colors.purple} />
          <Text style={styles.statNumber}>{classes.filter(c => c.active).length}</Text>
          <Text style={styles.statLabel}>Turmas Ativas</Text>
        </View>
        <View style={styles.statCard}>
          <FontAwesome5 name="user-graduate" size={20} color={colors.purple} />
          <Text style={styles.statNumber}>
            {classes.reduce((sum, c) => sum + (c.studentIds?.length || 0), 0)}
          </Text>
          <Text style={styles.statLabel}>Alunos Matriculados</Text>
        </View>
      </View>

      <View style={styles.listContainer}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.purple} />
            <Text style={styles.loadingText}>Carregando turmas...</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.purple]} />
            }
          >
            {filteredClasses.length === 0 ? (
              <View style={styles.emptyContainer}>
                <FontAwesome5 name="users" size={48} color="#ccc" />
                <Text style={styles.emptyText}>
                  {query ? "Nenhuma turma encontrada" : "Nenhuma turma cadastrada"}
                </Text>
                <Pressable style={styles.emptyBtn} onPress={() => setShowCreateModal(true)}>
                  <Ionicons name="add" size={20} color="#fff" />
                  <Text style={styles.emptyBtnText}>Criar Turma</Text>
                </Pressable>
              </View>
            ) : (
              filteredClasses.map(classItem => (
                <View key={classItem.id} style={styles.classCard}>
                  <View style={styles.classHeader}>
                    <View style={styles.classInfo}>
                      <View style={styles.classNameRow}>
                        <Text style={styles.className}>{classItem.name}</Text>
                        {classItem.schedule && classItem.schedule.length > 0 && (
                          <View style={styles.classTags}>
                            <View style={styles.classTag}>
                              <Text style={styles.classTagText}>
                                {classItem.schedule.map(s => DAYS_OF_WEEK[s.dayOfWeek].toUpperCase()).join(", ")}
                              </Text>
                            </View>
                            <Text style={styles.classTagSeparator}>|</Text>
                            <View style={styles.classTag}>
                              <Text style={styles.classTagText}>
                                {classItem.schedule[0].startTime}h
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>
                      {classItem.teacherId ? (
                        <Pressable onPress={() => navigation.navigate("Professores")}>
                          <Text style={styles.classTeacherLink}>
                            Prof. {classItem.teacherName} <Ionicons name="open-outline" size={12} color={colors.purple} />
                          </Text>
                        </Pressable>
                      ) : (
                        <Text style={styles.classNoTeacher}>Sem professor atribuído</Text>
                      )}
                    </View>
                    <View style={styles.classStats}>
                      <Text style={styles.classStudentCount}>{classItem.studentIds?.length || 0}</Text>
                      <Text style={styles.classStudentLabel}>alunos</Text>
                      {classItem.studentIds && classItem.studentIds.length > 0 && (
                        <View style={styles.classDanceStats}>
                          {(() => {
                            const classStudents = students.filter(s => classItem.studentIds!.includes(s.uid));
                            const condutores = classStudents.filter(s => s.dancePreference === "condutor").length;
                            const conduzidos = classStudents.filter(s => s.dancePreference === "conduzido").length;
                            const ambos = classStudents.filter(s => s.dancePreference === "ambos").length;

                            return (
                              <>
                                {condutores > 0 && (
                                  <View style={styles.danceStat}>
                                    <Ionicons name="arrow-forward" size={10} color="#fff" />
                                    <Text style={styles.danceStatText}>{condutores}</Text>
                                  </View>
                                )}
                                {conduzidos > 0 && (
                                  <View style={styles.danceStat}>
                                    <Ionicons name="arrow-back" size={10} color="#fff" />
                                    <Text style={styles.danceStatText}>{conduzidos}</Text>
                                  </View>
                                )}
                                {ambos > 0 && (
                                  <View style={styles.danceStat}>
                                    <Ionicons name="swap-horizontal" size={10} color="#fff" />
                                    <Text style={styles.danceStatText}>{ambos}</Text>
                                  </View>
                                )}
                              </>
                            );
                          })()}
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.classActions}>
                    <Pressable style={styles.classActionBtn} onPress={() => handleManageStudents(classItem)}>
                      <Ionicons name="people" size={16} color={colors.purple} />
                      <Text style={styles.classActionText}>Alunos</Text>
                    </Pressable>
                    <Pressable style={styles.classActionBtn} onPress={() => handleEditClass(classItem)}>
                      <Ionicons name="create" size={16} color={colors.purple} />
                      <Text style={styles.classActionText}>Editar</Text>
                    </Pressable>
                    <Pressable style={styles.classActionBtnDanger} onPress={() => handleDeleteClass(classItem)}>
                      <Ionicons name="trash" size={16} color={colors.danger} />
                      <Text style={styles.classActionTextDanger}>Excluir</Text>
                    </Pressable>
                  </View>
                </View>
              ))
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
  searchIcon: { marginRight: 8 },
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
    backgroundColor: "#F3E5F5",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.purple,
    marginTop: 4,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 2,
  },

  listContainer: {
    flex: 1,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 10,
  },
  listContent: { paddingBottom: 10 },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: { color: colors.muted, fontWeight: "600" },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
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
  emptyBtnText: { color: "#fff", fontWeight: "700" },

  // Class Card
  classCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    marginBottom: 12,
    overflow: "hidden",
  },
  classHeader: {
    flexDirection: "row",
    padding: 14,
    alignItems: "center",
  },
  classInfo: { flex: 1 },
  className: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  classNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  classTags: {
    flexDirection: "row",
    gap: 4,
  },
  classTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3E5F5",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  classTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.purple,
  },
  classTagSeparator: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.purple,
  },
  classTeacher: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: "600",
    marginTop: 2,
  },
  classTeacherLink: {
    fontSize: 13,
    color: colors.purple,
    fontWeight: "600",
    marginTop: 2,
  },
  classNoTeacher: {
    fontSize: 13,
    color: colors.danger,
    fontWeight: "600",
    fontStyle: "italic",
    marginTop: 2,
  },
  classSchedule: {
    fontSize: 12,
    color: colors.purple,
    fontWeight: "600",
    marginTop: 4,
  },
  classStats: {
    alignItems: "center",
    backgroundColor: "#F3E5F5",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  classStudentCount: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.purple,
  },
  classStudentLabel: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: "600",
  },
  classDanceStats: {
    flexDirection: "row",
    gap: 4,
    marginTop: 6,
  },
  danceStat: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF6B35",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 2,
  },
  danceStatText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
  },
  classActions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#E8E8E8",
  },
  classActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 4,
  },
  classActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.purple,
  },
  classActionBtnDanger: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 4,
  },
  classActionTextDanger: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.danger,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
  },
  createModal: {
    backgroundColor: colors.bg,
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 360,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
    marginBottom: 20,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    marginTop: -12,
    marginBottom: 16,
  },
  inputGroup: { marginBottom: 14 },
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
  teachersList: { flexDirection: "row", marginTop: 4 },
  teacherChip: {
    backgroundColor: "#f5f5f5",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  teacherChipSelected: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },
  teacherChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  teacherChipTextSelected: { color: "#fff" },
  noTeachersText: {
    fontSize: 13,
    color: colors.muted,
    fontStyle: "italic",
  },
  daysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dayChip: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  dayChipSelected: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },
  dayChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text,
  },
  dayChipTextSelected: { color: "#fff" },
  timeRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  timeSeparator: {
    color: colors.muted,
    fontWeight: "600",
    paddingBottom: 16,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
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

  // Students Modal
  studentsModal: {
    backgroundColor: colors.bg,
    borderRadius: 20,
    padding: 24,
    width: "90%",
    maxWidth: 360,
    maxHeight: "80%",
  },
  studentsList: {
    maxHeight: 300,
    marginVertical: 12,
  },
  noStudentsText: {
    textAlign: "center",
    color: colors.muted,
    fontStyle: "italic",
    paddingVertical: 20,
  },
  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
    marginBottom: 8,
  },
  studentRowSelected: {
    backgroundColor: "#E8F5E9",
  },
  studentInfo: { flex: 1 },
  studentName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  studentNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  danceIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255, 107, 53, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  studentEmail: {
    fontSize: 12,
    color: colors.muted,
  },
  studentMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    gap: 6,
  },
  studentStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  toggleStudentBtn: {
    padding: 4,
  },

  // Student Details Modal
  studentDetailsModal: {
    backgroundColor: colors.bg,
    borderRadius: 20,
    padding: 24,
    width: "90%",
    maxWidth: 340,
    alignItems: "center",
  },
  studentAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#F3E5F5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  studentDetailsName: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  studentDetailsEmail: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
  },
  paymentBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
    gap: 6,
  },
  paymentBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  studentSection: {
    width: "100%",
    marginTop: 20,
  },
  studentSectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.muted,
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  noClassesText: {
    fontSize: 13,
    color: colors.muted,
    fontStyle: "italic",
    textAlign: "center",
  },
  miniClassItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3E5F5",
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
    gap: 8,
  },
  miniClassName: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  studentActions: {
    width: "100%",
    marginTop: 12,
  },
  goToProfileBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.purple,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  goToProfileBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  closeDetailsBtn: {
    backgroundColor: "#E0E0E0",
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 10,
    width: "100%",
    alignItems: "center",
  },
  closeDetailsBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#555",
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
});

// Desktop Styles
const desktopStyles = StyleSheet.create({
  screen: {
    backgroundColor: "#F8FAFC",
  },
});

