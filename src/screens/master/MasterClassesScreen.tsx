import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, ScrollView, TextInput, Text, RefreshControl, Pressable, Modal, ActivityIndicator, KeyboardAvoidingView } from "react-native";
import { showAlert, showConfirm } from "../../utils/alert";
import { Ionicons, FontAwesome5 } from "@/shims/icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";

import CdmfHeader from "../../components/CdmfHeader";
import SectionHeader from "../../components/SectionHeader";
import MasterHeader from "../../components/MasterHeader";
import TimeInput from "../../components/TimeInput";
import { colors } from "../../theme/colors";
import { useAuth, Class, Profile } from "../../contexts/AuthContext";
import { useDesktop } from "../../contexts/DesktopContext";
import { useActivity } from "../../contexts/ActivityContext";

const PAYMENT_STATUS_MAP = {
  em_dia: { label: "Em dia", color: colors.green, icon: "checkmark-circle" },
  pendente: { label: "Pendente", color: "#FFA000", icon: "alert-circle" },
  atrasado: { label: "Atrasado", color: colors.danger, icon: "close-circle" },
};

const DAYS_OF_WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function MasterClassesScreen() {
  const { fetchClasses, createClass, updateClass, deleteClass, fetchTeachers, fetchStudents, addStudentToClass, removeStudentFromClass } = useAuth();
  const { isDesktopMode } = useDesktop();
  const { logActivity } = useActivity();
  
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
  const [togglingStudentId, setTogglingStudentId] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState("");

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

  // Função para adicionar 1 hora a um horário
  const addOneHour = (timeStr: string): string => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    date.setHours(date.getHours() + 1);
    const newHours = date.getHours().toString().padStart(2, "0");
    const newMinutes = date.getMinutes().toString().padStart(2, "0");
    return `${newHours}:${newMinutes}`;
  };

  // Atualiza hora de término automaticamente quando hora de início muda (apenas no modal de criação)
  useEffect(() => {
    if (showCreateModal) {
      setEndTime(addOneHour(startTime));
    }
  }, [startTime, showCreateModal]);

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
    (c.teacherName ?? "").toLowerCase().includes(query.toLowerCase())
  );

  const handleCreateClass = async () => {
    if (!newName.trim()) {
      showAlert("Atenção", "Digite o nome da turma");
      return;
    }
    if (selectedDays.length === 0) {
      showAlert("Atenção", "Selecione pelo menos um dia da semana");
      return;
    }

    const teacher = selectedTeacherId
      ? teachers.find(t => t.uid === selectedTeacherId)
      : null;
    if (selectedTeacherId && !teacher) {
      showAlert("Erro", "Professor não encontrado");
      return;
    }

    setCreating(true);
    try {
      const classData: any = {
        name: newName.trim(),
        teacherId: teacher?.uid || "",
        teacherName: teacher?.name || "Sem professor",
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
      
      const newClassId = await createClass(classData);

      // Optimistic: add new class immediately to the list
      const newClassEntry: Class = { ...classData, id: newClassId, createdAt: Date.now() };
      setClasses(prev => [newClassEntry, ...prev]);

      setShowCreateModal(false);
      resetForm();
      showAlert("Sucesso", "Turma criada com sucesso!");

      // Fire-and-forget: log + background sync
      logActivity({
        type: "class_created",
        title: classData.name,
        description: `Nova turma criada${classData.schedule?.length ? ` - ${DAYS_OF_WEEK[classData.schedule[0].dayOfWeek]} ${classData.schedule[0].startTime}` : ""}`,
      }).catch(() => {});
      loadData();
    } catch (e: any) {
      showAlert("Erro", e.message || "Não foi possível criar a turma");
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
    showConfirm(
      "Excluir Turma",
      `Deseja excluir a turma "${classItem.name}"?\n\nEsta ação não pode ser desfeita.`,
      async () => {
        try {
          await deleteClass(classItem.id);
          setClasses(prev => prev.filter(c => c.id !== classItem.id));
          showAlert("Sucesso", "Turma excluída com sucesso!");
          loadData();
        } catch (e: any) {
          showAlert("Erro", e.message || "Não foi possível excluir a turma");
        }
      }
    );
  };

  const handleSaveEdit = async () => {
    if (!selectedClass) return;
    
    if (!editName.trim()) {
      showAlert("Atenção", "Digite o nome da turma");
      return;
    }
    if (editDays.length === 0) {
      showAlert("Atenção", "Selecione pelo menos um dia da semana");
      return;
    }

    const teacher = editTeacherId
      ? teachers.find(t => t.uid === editTeacherId)
      : null;
    if (editTeacherId && !teacher) {
      showAlert("Erro", "Professor não encontrado");
      return;
    }

    setEditing(true);
    try {
      const updateData: any = {
        name: editName.trim(),
        teacherId: teacher?.uid || "",
        teacherName: teacher?.name || "Sem professor",
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

      // Optimistic: update the class in the list immediately
      setClasses(prev => prev.map(c =>
        c.id === selectedClass.id ? { ...c, ...updateData } : c
      ));

      setShowEditModal(false);
      showAlert("Sucesso", "Turma atualizada com sucesso!");
      loadData();
    } catch (e: any) {
      showAlert("Erro", e.message || "Não foi possível atualizar a turma");
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
    if (!selectedClass || togglingStudentId) return;
    setTogglingStudentId(studentId);

    const student = students.find(s => s.uid === studentId);
    const studentName = student?.name || "Aluno";

    try {
      const isInClass = selectedClass.studentIds.includes(studentId);
      if (isInClass) {
        await removeStudentFromClass(selectedClass.id, studentId);
        logActivity({
          type: "student_removed_from_class",
          title: "Aluno Removido de Turma",
          description: `${studentName} foi removido(a) da turma "${selectedClass.name}"`,
          metadata: { studentId, studentName, classId: selectedClass.id, className: selectedClass.name },
        }).catch(() => {});
      } else {
        await addStudentToClass(selectedClass.id, studentId);
        logActivity({
          type: "student_added_to_class",
          title: "Aluno Adicionado à Turma",
          description: `${studentName} foi matriculado(a) na turma "${selectedClass.name}"`,
          metadata: { studentId, studentName, classId: selectedClass.id, className: selectedClass.name },
        }).catch(() => {});
      }

      const updatedIds = isInClass
        ? selectedClass.studentIds.filter(id => id !== studentId)
        : [...selectedClass.studentIds, studentId];
      setSelectedClass({ ...selectedClass, studentIds: updatedIds });
      setClasses(prev => prev.map(c =>
        c.id === selectedClass.id ? { ...c, studentIds: updatedIds } : c
      ));

      loadData();
    } catch (e: any) {
      showAlert("Erro", e.message || "Não foi possível atualizar");
    } finally {
      setTogglingStudentId(null);
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
      {!isDesktopMode && <MasterHeader />}
      {!isDesktopMode && <SectionHeader title="Gestão de Turmas" />}

      {/* Modal para criar turma */}
      <Modal visible={showCreateModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => !creating && setShowCreateModal(false)}>
          <Pressable style={styles.createModal} onPress={(e) => e.stopPropagation()}>
            {/* Header compacto */}
            <View style={styles.cmModalHeaderRow}>
              <FontAwesome5 name="users" size={16} color={colors.purple} />
              <Text style={styles.cmModalTitle}>Nova Turma</Text>
              <Pressable onPress={() => { if (!creating) { setShowCreateModal(false); resetForm(); } }} disabled={creating}>
                <Ionicons name="close" size={20} color="#64748B" />
              </Pressable>
            </View>

            <View style={styles.cmInputGroup}>
              <Text style={styles.inputLabel}>Nome da Turma *</Text>
              <TextInput
                id="new-class-name"
                name="new-class-name"
                value={newName}
                onChangeText={setNewName}
                placeholder="Ex: Forró Iniciante"
                placeholderTextColor="#999"
                style={styles.modalInput}
                editable={!creating}
              />
            </View>

            <View style={styles.cmInputGroup}>
              <Text style={styles.inputLabel}>Descrição (opcional)</Text>
              <TextInput
                id="new-class-description"
                name="new-class-description"
                value={newDescription}
                onChangeText={setNewDescription}
                placeholder="Detalhes sobre a turma..."
                placeholderTextColor="#999"
                style={[styles.modalInput, { height: 50, textAlignVertical: "top" }]}
                multiline
                editable={!creating}
              />
            </View>

            <View style={styles.cmInputGroup}>
              <Text style={styles.inputLabel}>Professor (opcional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.teachersList}>
                <Pressable
                  style={[styles.teacherChip, selectedTeacherId === "" && styles.teacherChipSelected]}
                  onPress={() => setSelectedTeacherId("")}
                >
                  <Text style={[styles.teacherChipText, selectedTeacherId === "" && styles.teacherChipTextSelected]}>
                    Sem professor
                  </Text>
                </Pressable>
                {teachers.map(teacher => (
                  <Pressable
                    key={teacher.uid}
                    style={[styles.teacherChip, selectedTeacherId === teacher.uid && styles.teacherChipSelected]}
                    onPress={() => setSelectedTeacherId(prev => prev === teacher.uid ? "" : teacher.uid)}
                  >
                    <Text style={[styles.teacherChipText, selectedTeacherId === teacher.uid && styles.teacherChipTextSelected]}>
                      {teacher.name}
                    </Text>
                  </Pressable>
                ))}
                {teachers.length === 0 && (
                  <Text style={styles.noTeachersText}>Nenhum professor cadastrado.</Text>
                )}
              </ScrollView>
            </View>

            <View style={styles.cmInputGroup}>
              <Text style={styles.inputLabel}>Dias da Semana *</Text>
              <View style={styles.daysRow}>
                {DAYS_OF_WEEK.map((day, index) => (
                  <Pressable
                    key={index}
                    style={[styles.dayChip, selectedDays.includes(index) && styles.dayChipSelected]}
                    onPress={() => toggleDay(index)}
                  >
                    <Text style={[styles.dayChipText, selectedDays.includes(index) && styles.dayChipTextSelected]}>
                      {day}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.cmInputGroup}>
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
        </Pressable>
      </Modal>

      {/* Modal para gerenciar alunos da turma */}
      <Modal visible={showManageStudentsModal} transparent animationType="fade" onRequestClose={() => { setShowManageStudentsModal(false); setStudentSearch(""); }}>
        <Pressable style={styles.modalOverlay} onPress={() => { setShowManageStudentsModal(false); setStudentSearch(""); }}>
          <View style={styles.smModal} onStartShouldSetResponder={() => true}>

            {/* Header */}
            <View style={styles.smHeader}>
              <FontAwesome5 name="users" size={14} color={colors.purple} />
              <Text style={styles.smHeaderTitle} numberOfLines={1}>{selectedClass?.name}</Text>
              <View style={styles.smCountBadge}>
                <Text style={styles.smCountText}>{selectedClass?.studentIds.length ?? 0}</Text>
              </View>
              <Pressable onPress={() => { setShowManageStudentsModal(false); setStudentSearch(""); }} style={{ marginLeft: "auto" }}>
                <Ionicons name="close" size={20} color="#64748B" />
              </Pressable>
            </View>

            {/* Search */}
            <View style={styles.smSearchBox}>
              <Ionicons name="search" size={15} color="#94A3B8" />
              <TextInput
                value={studentSearch}
                onChangeText={setStudentSearch}
                placeholder="Buscar aluno..."
                placeholderTextColor="#94A3B8"
                style={styles.smSearchInput}
              />
              {studentSearch.length > 0 && (
                <Pressable onPress={() => setStudentSearch("")}>
                  <Ionicons name="close-circle" size={16} color="#94A3B8" />
                </Pressable>
              )}
            </View>

            {/* Student list */}
            <ScrollView style={styles.smList} showsVerticalScrollIndicator={false}>
              {(() => {
                const active = students.filter(s => s.enrollmentStatus !== "inativo");
                const filtered = studentSearch.trim()
                  ? active.filter(s => s.name?.toLowerCase().includes(studentSearch.toLowerCase()))
                  : active;
                const enrolled = filtered.filter(s => selectedClass?.studentIds.includes(s.uid));
                const available = filtered.filter(s => !selectedClass?.studentIds.includes(s.uid));

                if (filtered.length === 0) {
                  return <Text style={styles.smEmpty}>{studentSearch ? "Nenhum aluno encontrado" : "Nenhum aluno ativo no sistema"}</Text>;
                }

                const renderRow = (student: Profile, isInClass: boolean) => {
                  const paymentInfo = getPaymentStatusInfo(student.paymentStatus);
                  const isToggling = togglingStudentId === student.uid;
                  const initial = (student.name || "?")[0].toUpperCase();
                  return (
                    <View key={student.uid} style={[styles.smRow, isInClass ? styles.smRowIn : styles.smRowOut]}>
                      <View style={[styles.smAvatar, { backgroundColor: isInClass ? colors.green + "20" : "#F1F5F9" }]}>
                        <Text style={[styles.smAvatarText, { color: isInClass ? colors.green : "#64748B" }]}>{initial}</Text>
                      </View>
                      <View style={styles.smStudentInfo}>
                        <View style={styles.smNameRow}>
                          <Text style={styles.smStudentName} numberOfLines={1}>{student.name}</Text>
                          {student.dancePreference && student.dancePreference !== "ambos" && (
                            <Ionicons
                              name={student.dancePreference === "condutor" ? "arrow-forward" : "arrow-back"}
                              size={11}
                              color="#FF6B35"
                            />
                          )}
                        </View>
                        <View style={[styles.smPayBadge, { backgroundColor: paymentInfo.color + "20" }]}>
                          <Text style={[styles.smPayBadgeText, { color: paymentInfo.color }]}>{paymentInfo.label}</Text>
                        </View>
                      </View>
                      <Pressable
                        style={[styles.smToggleBtn, isInClass ? styles.smToggleBtnIn : styles.smToggleBtnOut, isToggling && styles.smToggleBtnBusy]}
                        onPress={() => !isToggling && !togglingStudentId && handleToggleStudent(student.uid)}
                        disabled={!!togglingStudentId}
                      >
                        {isToggling ? (
                          <ActivityIndicator size="small" color={isInClass ? colors.danger : colors.green} />
                        ) : (
                          <Ionicons name={isInClass ? "remove" : "add"} size={18} color={isInClass ? colors.danger : colors.green} />
                        )}
                      </Pressable>
                    </View>
                  );
                };

                return (
                  <>
                    {enrolled.length > 0 && (
                      <>
                        <View style={styles.smSectionHeader}>
                          <View style={[styles.smSectionDot, { backgroundColor: colors.green }]} />
                          <Text style={styles.smSectionLabel}>NA TURMA</Text>
                          <Text style={styles.smSectionCount}>{enrolled.length}</Text>
                        </View>
                        {enrolled.map(s => renderRow(s, true))}
                      </>
                    )}
                    {available.length > 0 && (
                      <>
                        <View style={[styles.smSectionHeader, enrolled.length > 0 && { marginTop: 10 }]}>
                          <View style={[styles.smSectionDot, { backgroundColor: "#94A3B8" }]} />
                          <Text style={styles.smSectionLabel}>DISPONÍVEIS</Text>
                          <Text style={styles.smSectionCount}>{available.length}</Text>
                        </View>
                        {available.map(s => renderRow(s, false))}
                      </>
                    )}
                  </>
                );
              })()}
            </ScrollView>

            <Pressable style={styles.smDoneBtn} onPress={() => { setShowManageStudentsModal(false); setStudentSearch(""); }}>
              <Text style={styles.smDoneBtnText}>Concluir</Text>
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
          <Pressable style={styles.createModal} onPress={(e) => e.stopPropagation()}>
            {/* Header compacto */}
            <View style={styles.cmModalHeaderRow}>
              <Ionicons name="create-outline" size={18} color={colors.purple} />
              <Text style={styles.cmModalTitle}>Editar Turma</Text>
              <Pressable onPress={() => !editing && setShowEditModal(false)} disabled={editing}>
                <Ionicons name="close" size={20} color="#64748B" />
              </Pressable>
            </View>

            <View style={styles.cmInputGroup}>
              <Text style={styles.inputLabel}>Nome da Turma *</Text>
              <TextInput
                id="edit-class-name"
                name="edit-class-name"
                value={editName}
                onChangeText={setEditName}
                placeholder="Ex: Forró Iniciante"
                placeholderTextColor="#999"
                style={styles.modalInput}
                editable={!editing}
              />
            </View>

            <View style={styles.cmInputGroup}>
              <Text style={styles.inputLabel}>Descrição (opcional)</Text>
              <TextInput
                id="edit-class-description"
                name="edit-class-description"
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder="Detalhes sobre a turma..."
                placeholderTextColor="#999"
                style={[styles.modalInput, { height: 50, textAlignVertical: "top" }]}
                multiline
                editable={!editing}
              />
            </View>

            <View style={styles.cmInputGroup}>
              <Text style={styles.inputLabel}>Professor (opcional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.teachersList}>
                <Pressable
                  style={[styles.teacherChip, editTeacherId === "" && styles.teacherChipSelected]}
                  onPress={() => setEditTeacherId("")}
                >
                  <Text style={[styles.teacherChipText, editTeacherId === "" && styles.teacherChipTextSelected]}>
                    Sem professor
                  </Text>
                </Pressable>
                {teachers.map(teacher => (
                  <Pressable
                    key={teacher.uid}
                    style={[styles.teacherChip, editTeacherId === teacher.uid && styles.teacherChipSelected]}
                    onPress={() => setEditTeacherId(prev => prev === teacher.uid ? "" : teacher.uid)}
                  >
                    <Text style={[styles.teacherChipText, editTeacherId === teacher.uid && styles.teacherChipTextSelected]}>
                      {teacher.name}
                    </Text>
                  </Pressable>
                ))}
                {teachers.length === 0 && (
                  <Text style={styles.noTeachersText}>Nenhum professor cadastrado.</Text>
                )}
              </ScrollView>
            </View>

            <View style={styles.cmInputGroup}>
              <Text style={styles.inputLabel}>Dias da Semana *</Text>
              <View style={styles.daysRow}>
                {DAYS_OF_WEEK.map((day, index) => (
                  <Pressable
                    key={index}
                    style={[styles.dayChip, editDays.includes(index) && styles.dayChipSelected]}
                    onPress={() => toggleEditDay(index)}
                  >
                    <Text style={[styles.dayChipText, editDays.includes(index) && styles.dayChipTextSelected]}>
                      {day}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.cmInputGroup}>
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
        </Pressable>
      </Modal>

      <View style={[styles.searchBox, isDesktopMode && desktopStyles.searchBox]}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#777" style={styles.searchIcon} />
          <TextInput
            id="master-classes-search"
            name="master-classes-search"
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

      <View style={[styles.statsRow, isDesktopMode && desktopStyles.statsRow]}>
        <View style={[styles.statCard, isDesktopMode && desktopStyles.statCard]}>
          <FontAwesome5 name="users" size={20} color={colors.purple} />
          <Text style={styles.statNumber}>{classes.filter(c => c.active).length}</Text>
          <Text style={styles.statLabel}>Turmas Ativas</Text>
        </View>
        <View style={[styles.statCard, isDesktopMode && desktopStyles.statCard]}>
          <FontAwesome5 name="user-graduate" size={20} color={colors.purple} />
          <Text style={styles.statNumber}>
            {classes.reduce((sum, c) => sum + (c.studentIds?.length || 0), 0)}
          </Text>
          <Text style={styles.statLabel}>Alunos Matriculados</Text>
        </View>
      </View>

      <View style={[styles.listContainer, isDesktopMode && desktopStyles.listContainer]}>
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
                <View key={classItem.id} style={[styles.classCard, isDesktopMode && desktopStyles.classCard]}>
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
  screen: { flex: 1, backgroundColor: "#F8FAFC" },

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
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
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
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderLeftWidth: 3,
    borderLeftColor: colors.purple,
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
    borderColor: "#E2E8F0",
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
    backgroundColor: colors.purple + "15",
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
    backgroundColor: colors.purple + "15",
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
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  classActionBtn: {
    minWidth: 90,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
  },
  classActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.purple,
  },
  classActionBtnDanger: {
    minWidth: 90,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
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
    paddingHorizontal: 20,
  },
  modalScrollContent: {
    paddingBottom: 16,
  },
  createModal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    width: "100%",
    maxWidth: 400,
  },
  cmModalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  cmModalTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
  },
  cmInputGroup: {
    marginBottom: 10,
  },
  modalScrollView: {
    flexShrink: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E293B",
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
    marginBottom: 5,
  },
  modalInput: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  teachersList: { flexDirection: "row", marginTop: 4 },
  teacherChip: {
    backgroundColor: "#F8FAFC",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
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
    flexWrap: "wrap",
    gap: 6,
  },
  dayChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
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
    paddingBottom: 10,
  },
  modalActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    minWidth: 120,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
  },
  createBtn: {
    minWidth: 140,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },

  // Students Management Modal (sm prefix)
  smModal: {
    backgroundColor: "#fff",
    borderRadius: 18,
    width: "92%",
    maxWidth: 440,
    maxHeight: "85%",
    overflow: "hidden",
  },
  smHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  smHeaderTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
    flex: 1,
  },
  smCountBadge: {
    backgroundColor: colors.purple,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: "center",
  },
  smCountText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#fff",
  },
  smSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginVertical: 10,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  smSearchInput: {
    flex: 1,
    fontSize: 14,
    color: "#1E293B",
    paddingVertical: 0,
  },
  smList: {
    maxHeight: 420,
    paddingHorizontal: 12,
  },
  smEmpty: {
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 14,
    paddingVertical: 24,
  },
  smSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
    marginTop: 4,
  },
  smSectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  smSectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.8,
  },
  smSectionCount: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94A3B8",
    marginLeft: 2,
  },
  smRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 4,
    borderWidth: 1,
  },
  smRowIn: {
    backgroundColor: colors.green + "0D",
    borderColor: colors.green + "30",
  },
  smRowOut: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
  },
  smAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  smAvatarText: {
    fontSize: 14,
    fontWeight: "800",
  },
  smStudentInfo: {
    flex: 1,
    minWidth: 0,
  },
  smNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  smStudentName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
    flex: 1,
  },
  smPayBadge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 3,
  },
  smPayBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  smToggleBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  smToggleBtnIn: {
    backgroundColor: colors.danger + "15",
  },
  smToggleBtnOut: {
    backgroundColor: colors.green + "15",
  },
  smToggleBtnBusy: {
    opacity: 0.6,
  },
  smDoneBtn: {
    margin: 12,
    backgroundColor: colors.purple,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
  },
  smDoneBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },

  // Student Details Modal
  studentDetailsModal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 24,
    width: "90%",
    maxWidth: 380,
    alignItems: "center",
  },
  studentAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.purple + "15",
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
    backgroundColor: colors.purple + "15",
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
    backgroundColor: "#F8FAFC",
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 10,
    width: "100%",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  closeDetailsBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748B",
  },
});

// Desktop Styles
const desktopStyles = StyleSheet.create({
  screen: {
    backgroundColor: "#F8FAFC",
  },
  searchBox: {
    maxWidth: 500,
    paddingHorizontal: 24,
  },
  statsRow: {
    maxWidth: 400,
    paddingHorizontal: 24,
  },
  statCard: {
    maxWidth: 180,
  },
  listContainer: {
    maxWidth: 700,
    marginHorizontal: 24,
  },
  classCard: {
    maxWidth: 600,
  },
});



