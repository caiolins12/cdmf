import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, ScrollView, TextInput, Text, RefreshControl, Pressable, Alert, Modal, ActivityIndicator, Platform } from "react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";

import CdmfHeader from "../../components/CdmfHeader";
import SectionHeader from "../../components/SectionHeader";
import { colors } from "../../theme/colors";
import { useAuth, Profile, Class } from "../../contexts/AuthContext";
import { useDesktop } from "../../contexts/DesktopContext";

const PAYMENT_STATUS_MAP = {
  em_dia: { label: "Em dia", color: colors.green, icon: "checkmark-circle" },
  pendente: { label: "Pendente", color: "#FFA000", icon: "alert-circle" },
  atrasado: { label: "Atrasado", color: colors.danger, icon: "close-circle" },
};

const DAYS_OF_WEEK = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

const ENROLLMENT_STATUS_MAP = {
  ativo: { label: "Ativo", color: colors.green },
  inativo: { label: "Inativo", color: colors.danger },
};

type FilterType = "todos" | "ativos" | "inativos";

export default function MasterStudentsScreen() {
  const { fetchStudents, fetchClasses, updateProfile, removeStudentFromClass } = useAuth();
  const { isDesktopMode } = useDesktop();
  const navigation = useNavigation<any>();
  const [students, setStudents] = useState<Profile[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("ativos");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal states
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showClassesModal, setShowClassesModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [studentsData, classesData] = await Promise.all([
        fetchStudents(),
        fetchClasses(),
      ]);
      setStudents(studentsData);
      setClasses(classesData);
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
    } finally {
      setLoading(false);
    }
  }, [fetchStudents, fetchClasses]);

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

  // Filtragem
  const getFilteredStudents = () => {
    let filtered = students;
    
    // Filtro por status de matrícula
    if (filter === "ativos") {
      filtered = filtered.filter(s => s.enrollmentStatus !== "inativo");
    } else if (filter === "inativos") {
      filtered = filtered.filter(s => s.enrollmentStatus === "inativo");
    }
    
    // Filtro por busca
    if (query) {
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(query.toLowerCase()) ||
        s.email.toLowerCase().includes(query.toLowerCase())
      );
    }
    
    return filtered;
  };

  const filteredStudents = getFilteredStudents();

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("pt-BR");
  };

  const getStudentClasses = (student: Profile): Class[] => {
    if (!student.classes || student.classes.length === 0) return [];
    return classes.filter(c => student.classes?.includes(c.id));
  };

  const formatClassWithTags = (classItem: Class): string => {
    if (!classItem.schedule || classItem.schedule.length === 0) {
      return classItem.name;
    }
    const day = DAYS_OF_WEEK[classItem.schedule[0].dayOfWeek];
    const time = `${classItem.schedule[0].startTime}h`;
    return `${classItem.name} • ${day} | ${time}`;
  };

  const getPaymentStatusInfo = (status?: string) => {
    return PAYMENT_STATUS_MAP[status as keyof typeof PAYMENT_STATUS_MAP] || PAYMENT_STATUS_MAP.pendente;
  };

  const handleViewDetails = (student: Profile) => {
    setSelectedStudent(student);
    setShowDetailsModal(true);
  };

  const handleUpdatePaymentStatus = async (studentId: string, status: "em_dia" | "pendente" | "atrasado") => {
    try {
      await updateProfile(studentId, { paymentStatus: status });
      await loadData();
      setSelectedStudent(prev => prev ? { ...prev, paymentStatus: status } : null);
      Alert.alert("Sucesso", "Status de pagamento atualizado!");
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Não foi possível atualizar");
    }
  };

  const handleToggleEnrollment = async (student: Profile) => {
    const newStatus = student.enrollmentStatus === "inativo" ? "ativo" : "inativo";
    const action = newStatus === "inativo" ? "inativar" : "reativar";
    
    Alert.alert(
      `${newStatus === "inativo" ? "Inativar" : "Reativar"} Matrícula`,
      `Deseja ${action} a matrícula de ${student.name}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Confirmar",
          style: newStatus === "inativo" ? "destructive" : "default",
          onPress: async () => {
            try {
              await updateProfile(student.uid, { enrollmentStatus: newStatus });
              await loadData();
              setSelectedStudent(prev => prev ? { ...prev, enrollmentStatus: newStatus } : null);
              Alert.alert("Sucesso", `Matrícula ${newStatus === "inativo" ? "inativada" : "reativada"} com sucesso!`);
            } catch (e: any) {
              Alert.alert("Erro", e.message || "Não foi possível atualizar");
            }
          },
        },
      ]
    );
  };

  const handleRemoveFromClass = async (student: Profile, classItem: Class) => {
    Alert.alert(
      "Remover da Turma",
      `Deseja remover ${student.name} da turma ${classItem.name}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: async () => {
            try {
              await removeStudentFromClass(classItem.id, student.uid);
              await loadData();
              // Atualiza o student selecionado
              const updatedStudents = await fetchStudents();
              const updated = updatedStudents.find(s => s.uid === student.uid);
              if (updated) setSelectedStudent(updated);
              Alert.alert("Sucesso", "Aluno removido da turma!");
            } catch (e: any) {
              Alert.alert("Erro", e.message || "Não foi possível remover");
            }
          },
        },
      ]
    );
  };

  const handleManageClasses = (student: Profile) => {
    setSelectedStudent(student);
    setShowDetailsModal(false);
    setShowClassesModal(true);
  };

  // Estatísticas
  const activeStudents = students.filter(s => s.enrollmentStatus !== "inativo");
  const inactiveStudents = students.filter(s => s.enrollmentStatus === "inativo");
  const emDia = activeStudents.filter(s => s.paymentStatus === "em_dia").length;
  const pendentes = activeStudents.filter(s => !s.paymentStatus || s.paymentStatus === "pendente").length;
  const atrasados = activeStudents.filter(s => s.paymentStatus === "atrasado").length;

  return (
    <View style={[styles.screen, isDesktopMode && desktopStyles.screen]}>
      {!isDesktopMode && <CdmfHeader />}
      {!isDesktopMode && <SectionHeader title="Gestão de Alunos" />}

      {/* Modal de detalhes do aluno */}
      <Modal visible={showDetailsModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowDetailsModal(false)} />
          <View style={styles.detailsModalContainer}>
            {/* Indicador de arraste */}
            <View style={styles.scrollIndicator}>
              <View style={styles.scrollIndicatorBar} />
            </View>
            <ScrollView 
              contentContainerStyle={styles.detailsModalScroll}
              showsVerticalScrollIndicator={true}
              persistentScrollbar={true}
            >
              <View style={styles.detailsModal}>
              {selectedStudent && (
                <>
                  <View style={styles.studentAvatar}>
                    <FontAwesome5 name="user-graduate" size={32} color={colors.purple} />
                  </View>
                  
                  <Text style={styles.detailsName}>{selectedStudent.name}</Text>
                  <Text style={styles.detailsEmail}>{selectedStudent.email}</Text>

                  {/* Status de Matrícula */}
                  <View style={[
                    styles.enrollmentBadge,
                    { backgroundColor: selectedStudent.enrollmentStatus === "inativo" ? "#FFEBEE" : "#E8F5E9" }
                  ]}>
                    <Ionicons 
                      name={selectedStudent.enrollmentStatus === "inativo" ? "close-circle" : "checkmark-circle"} 
                      size={16} 
                      color={selectedStudent.enrollmentStatus === "inativo" ? colors.danger : colors.green} 
                    />
                    <Text style={[
                      styles.enrollmentBadgeText,
                      { color: selectedStudent.enrollmentStatus === "inativo" ? colors.danger : colors.green }
                    ]}>
                      Matrícula {selectedStudent.enrollmentStatus === "inativo" ? "Inativa" : "Ativa"}
                    </Text>
                  </View>

                  {/* Status de Pagamento */}
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>STATUS DE PAGAMENTO</Text>
                    <View style={styles.paymentButtons}>
                      {(["em_dia", "pendente", "atrasado"] as const).map(status => {
                        const info = PAYMENT_STATUS_MAP[status];
                        const isSelected = selectedStudent.paymentStatus === status || 
                          (!selectedStudent.paymentStatus && status === "pendente");
                        return (
                          <Pressable
                            key={status}
                            style={[
                              styles.paymentBtn,
                              isSelected && { backgroundColor: info.color },
                            ]}
                            onPress={() => handleUpdatePaymentStatus(selectedStudent.uid, status)}
                          >
                            <Ionicons 
                              name={info.icon as any} 
                              size={16} 
                              color={isSelected ? "#fff" : info.color} 
                            />
                            <Text style={[
                              styles.paymentBtnText,
                              isSelected && { color: "#fff" },
                            ]}>
                              {info.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Turmas */}
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>TURMAS MATRICULADO</Text>
                      <Pressable onPress={() => handleManageClasses(selectedStudent)}>
                        <Text style={styles.manageLink}>Gerenciar</Text>
                      </Pressable>
                    </View>
                    {getStudentClasses(selectedStudent).length === 0 ? (
                      <Text style={styles.noClassesText}>Não está matriculado em nenhuma turma</Text>
                    ) : (
                      getStudentClasses(selectedStudent).map(classItem => (
                        <Pressable 
                          key={classItem.id} 
                          style={styles.classItem}
                          onPress={() => {
                            setShowDetailsModal(false);
                            navigation.navigate("Turmas");
                          }}
                        >
                          <FontAwesome5 name="users" size={14} color={colors.purple} />
                          <View style={styles.classItemInfo}>
                            <Text style={styles.classItemName}>{formatClassWithTags(classItem)}</Text>
                            <Text style={styles.classItemTeacher}>
                              {classItem.teacherId ? `Prof. ${classItem.teacherName}` : "Sem professor"}
                            </Text>
                          </View>
                          <Ionicons name="open-outline" size={14} color={colors.purple} />
                        </Pressable>
                      ))
                    )}
                  </View>

                  {/* Dados Pessoais */}
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>DADOS PESSOAIS</Text>
                    <View style={styles.dataRow}>
                      <Text style={styles.dataLabel}>Telefone:</Text>
                      <Text style={styles.dataValue}>
                        {selectedStudent.phone || "Não informado"}
                        {selectedStudent.phoneVerified && (
                          <Text style={styles.verifiedText}> (Verificado)</Text>
                        )}
                      </Text>
                    </View>
                    <View style={styles.dataRow}>
                      <Text style={styles.dataLabel}>Data de nascimento:</Text>
                      <Text style={styles.dataValue}>
                        {selectedStudent.birthDate || "Não informado"}
                        {selectedStudent.age ? ` (${selectedStudent.age} anos)` : ""}
                      </Text>
                    </View>
                    <View style={styles.dataRow}>
                      <Text style={styles.dataLabel}>Gênero:</Text>
                      <Text style={styles.dataValue}>
                        {selectedStudent.gender ?
                          selectedStudent.gender === "masculino" ? "Masculino" :
                          selectedStudent.gender === "feminino" ? "Feminino" :
                          selectedStudent.gender === "outro" ? "Outro" :
                          selectedStudent.gender === "prefiro_nao_informar" ? "Prefiro não informar" :
                          selectedStudent.gender
                          : "Não informado"
                        }
                      </Text>
                    </View>
                    <View style={styles.dataRow}>
                      <Text style={styles.dataLabel}>Preferência na dança:</Text>
                      <Text style={styles.dataValue}>
                        {selectedStudent.dancePreference ?
                          selectedStudent.dancePreference === "condutor" ? "Condutor(a)" :
                          selectedStudent.dancePreference === "conduzido" ? "Conduzido(a)" :
                          selectedStudent.dancePreference === "ambos" ? "Ambos" :
                          selectedStudent.dancePreference
                          : "Não informado"
                        }
                      </Text>
                    </View>
                    <View style={styles.dataRow}>
                      <Text style={styles.dataLabel}>Cadastrado em:</Text>
                      <Text style={styles.dataValue}>{formatDate(selectedStudent.createdAt)}</Text>
                    </View>
                  </View>

                  {/* Ações */}
                  <View style={styles.actionsSection}>
                    <View style={styles.actionButtonsRow}>
                      <Pressable 
                        style={styles.actionButtonSecondary}
                        onPress={() => handleManageClasses(selectedStudent)}
                      >
                        <Ionicons name="school-outline" size={16} color={colors.purple} />
                        <Text style={styles.actionButtonSecondaryText}>Turmas</Text>
                      </Pressable>
                      
                      <Pressable 
                        style={[
                          styles.actionButtonPrimary,
                          selectedStudent.enrollmentStatus === "inativo" 
                            ? styles.actionButtonSuccess 
                            : styles.actionButtonDanger
                        ]}
                        onPress={() => handleToggleEnrollment(selectedStudent)}
                      >
                        <Ionicons 
                          name={selectedStudent.enrollmentStatus === "inativo" ? "refresh" : "ban"} 
                          size={16} 
                          color="#fff" 
                        />
                        <Text style={styles.actionButtonPrimaryText}>
                          {selectedStudent.enrollmentStatus === "inativo" ? "Reativar" : "Inativar"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  <Pressable style={styles.closeBtn} onPress={() => setShowDetailsModal(false)}>
                    <Text style={styles.closeBtnText}>Fechar</Text>
                  </Pressable>
                </>
              )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal de gerenciar turmas do aluno */}
      <Modal visible={showClassesModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowClassesModal(false)}>
          <Pressable style={styles.classesModal} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Turmas do Aluno</Text>
            <Text style={styles.modalSubtitle}>{selectedStudent?.name}</Text>

            <ScrollView style={styles.classesScrollView}>
              {selectedStudent && getStudentClasses(selectedStudent).length === 0 ? (
                <View style={styles.emptyClassesContainer}>
                  <FontAwesome5 name="users" size={32} color="#ccc" />
                  <Text style={styles.emptyClassesText}>Não está em nenhuma turma</Text>
                  <Text style={styles.emptyClassesSubtext}>
                    Adicione o aluno a turmas na tela de Gestão de Turmas
                  </Text>
                </View>
              ) : (
                selectedStudent && getStudentClasses(selectedStudent).map(classItem => (
                  <View key={classItem.id} style={styles.classRow}>
                    <View style={styles.classRowInfo}>
                      <Text style={styles.classRowName}>{classItem.name}</Text>
                      <Text style={styles.classRowTeacher}>Prof. {classItem.teacherName}</Text>
                    </View>
                    <Pressable 
                      style={styles.removeClassBtn}
                      onPress={() => handleRemoveFromClass(selectedStudent, classItem)}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </Pressable>
                  </View>
                ))
              )}
            </ScrollView>

            <Pressable style={styles.doneBtn} onPress={() => setShowClassesModal(false)}>
              <Text style={styles.doneBtnText}>Concluir</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={[styles.searchBox, isDesktopMode && desktopStyles.searchBox]}>
        <View style={[styles.searchContainer, isDesktopMode && desktopStyles.searchContainer]}>
          <Ionicons name="search" size={20} color="#777" style={styles.searchIcon} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar aluno por nome ou email..."
            placeholderTextColor="#777"
            style={[styles.search, isDesktopMode && desktopStyles.search]}
          />
        </View>
      </View>

      {/* Filtros */}
      <View style={[styles.filterRow, isDesktopMode && desktopStyles.filterRow]}>
        {(["ativos", "inativos", "todos"] as FilterType[]).map(f => (
          <Pressable
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterBtnText, filter === f && styles.filterBtnTextActive]}>
              {f === "ativos" ? `Ativos (${activeStudents.length})` : 
               f === "inativos" ? `Inativos (${inactiveStudents.length})` : 
               `Todos (${students.length})`}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Estatísticas (apenas para ativos) */}
      {filter === "ativos" && (
        <View style={[styles.statsRow, isDesktopMode && desktopStyles.statsRow]}>
          <View style={[styles.statCard, { backgroundColor: "#E8F5E9" }, isDesktopMode && desktopStyles.statCard]}>
            <Text style={[styles.statNumber, { color: colors.green }]}>{emDia}</Text>
            <Text style={styles.statLabel}>Em dia</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#FFF3E0" }, isDesktopMode && desktopStyles.statCard]}>
            <Text style={[styles.statNumber, { color: "#FFA000" }]}>{pendentes}</Text>
            <Text style={styles.statLabel}>Pendentes</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#FFEBEE" }, isDesktopMode && desktopStyles.statCard]}>
            <Text style={[styles.statNumber, { color: colors.danger }]}>{atrasados}</Text>
            <Text style={styles.statLabel}>Atrasados</Text>
          </View>
        </View>
      )}

      <ScrollView
        style={[styles.mainScrollView, isDesktopMode && desktopStyles.mainScrollView]}
        contentContainerStyle={[styles.mainScrollContent, isDesktopMode && desktopStyles.mainScrollContent]}
        showsVerticalScrollIndicator={true}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.purple]} />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.purple} />
            <Text style={styles.loadingText}>Carregando alunos...</Text>
          </View>
        ) : filteredStudents.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>
              {query ? "Nenhum aluno encontrado" :
               filter === "inativos" ? "Nenhum aluno inativo" : "Nenhum aluno cadastrado"}
            </Text>
          </View>
        ) : (
          filteredStudents.map((student) => {
            const paymentInfo = getPaymentStatusInfo(student.paymentStatus);
            const studentClasses = getStudentClasses(student);
            const isInactive = student.enrollmentStatus === "inativo";

            return (
              <Pressable
                key={student.uid}
                style={[styles.studentCard, isInactive && styles.studentCardInactive]}
                onPress={() => handleViewDetails(student)}
              >
                    {/* Indicador de status lateral */}
                    <View style={[
                      styles.statusIndicator, 
                      { backgroundColor: isInactive ? colors.danger : paymentInfo.color }
                    ]} />
                    
                    <View style={styles.studentHeader}>
                      <View style={styles.studentInfo}>
                        <View style={styles.nameRow}>
                          <Text style={[styles.studentName, isInactive && styles.studentNameInactive]}>
                            {student.name || "Sem nome"}
                          </Text>
                          {/* Mini ícones de status */}
                          <View style={styles.miniIcons}>
                            {isInactive ? (
                              <View style={[styles.miniIcon, styles.miniIconDanger]}>
                                <Ionicons name="close" size={10} color="#fff" />
                              </View>
                            ) : (
                              <>
                                <View style={[styles.miniIcon, { backgroundColor: paymentInfo.color }]}>
                                  <Ionicons name={paymentInfo.icon as any} size={10} color="#fff" />
                                </View>
                                {studentClasses.length > 0 && (
                                  <View style={[styles.miniIcon, styles.miniIconPurple]}>
                                    <Text style={styles.miniIconText}>{studentClasses.length}</Text>
                                  </View>
                                )}
                              </>
                            )}

                            {/* Indicadores de dança */}
                            {!isInactive && student.dancePreference && (
                              <View style={[styles.miniIcon, styles.miniIconDance]}>
                                <Ionicons
                                  name={
                                    student.dancePreference === "condutor" ? "arrow-forward" :
                                    student.dancePreference === "conduzido" ? "arrow-back" :
                                    student.dancePreference === "ambos" ? "swap-horizontal" :
                                    "help-circle"
                                  }
                                  size={10}
                                  color="#fff"
                                />
                              </View>
                            )}
                          </View>
                        </View>
                        <Text style={styles.studentEmail}>{student.email}</Text>
                        {studentClasses.length > 0 && !isInactive && (
                          <Text style={styles.studentClasses} numberOfLines={1}>
                            {studentClasses.map(c => formatClassWithTags(c)).join(" • ")}
                          </Text>
                        )}
                      </View>
                      {!isInactive && (
                        <View style={[styles.statusBadge, { backgroundColor: paymentInfo.color }]}>
                          <Ionicons name={paymentInfo.icon as any} size={14} color="#fff" />
                          <Text style={styles.statusText}>{paymentInfo.label}</Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                );
              })
          )
        }
        <View style={{ height: 18 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  searchBox: { 
    paddingHorizontal: 12, 
    paddingTop: 14,
  },
  searchContainer: {
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

  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f5f5f5",
  },
  filterBtnActive: {
    backgroundColor: colors.purple,
  },
  filterBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
  },
  filterBtnTextActive: {
    color: "#fff",
  },

  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 22,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 2,
  },

  mainScrollView: {
    flex: 1,
    marginHorizontal: 12,
  },
  mainScrollContent: {
    paddingTop: 10,
    paddingBottom: 18,
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

  // Student Card
  studentCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    padding: 14,
    paddingLeft: 18,
    marginBottom: 10,
    flexDirection: "row",
    overflow: "hidden",
  },
  studentCardInactive: {
    backgroundColor: "#FAFAFA",
    borderColor: "#E0E0E0",
  },
  statusIndicator: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  studentHeader: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  studentInfo: { flex: 1 },
  nameRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  studentName: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  studentNameInactive: {
    color: colors.muted,
  },
  inactivePill: {
    backgroundColor: "#FFEBEE",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  inactivePillText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.danger,
  },
  miniIcons: {
    flexDirection: "row",
    gap: 4,
    marginLeft: 6,
  },
  miniIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  miniIconDanger: {
    backgroundColor: colors.danger,
  },
  miniIconPurple: {
    backgroundColor: colors.purple,
  },
  miniIconDance: {
    backgroundColor: "#FF6B35", // Cor laranja para dança
  },
  miniIconText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
  },
  studentEmail: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  studentClasses: {
    fontSize: 11,
    color: colors.purple,
    marginTop: 4,
    fontWeight: "600",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  detailsModalContainer: {
    width: "92%",
    maxWidth: 400,
    maxHeight: "85%",
    backgroundColor: colors.bg,
    borderRadius: 24,
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
    backgroundColor: "#DDD",
    borderRadius: 2,
  },
  detailsModalScroll: {
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  detailsModal: {
    alignItems: "center",
    width: "100%",
  },
  studentAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#F3E5F5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  detailsName: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
  },
  detailsEmail: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 6,
    textAlign: "center",
  },
  enrollmentBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 16,
    gap: 8,
  },
  enrollmentBadgeText: {
    fontSize: 13,
    fontWeight: "700",
  },
  section: {
    width: "100%",
    marginTop: 28,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.muted,
    letterSpacing: 0.5,
    flex: 1,
  },
  manageLink: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.purple,
    backgroundColor: "#F3E5F5",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  paymentButtons: {
    flexDirection: "row",
    gap: 12,
  },
  paymentBtn: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "#f5f5f5",
    minHeight: 68,
  },
  paymentBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
    marginTop: 6,
  },
  noClassesText: {
    fontSize: 13,
    color: colors.muted,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 12,
  },
  classItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3E5F5",
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    gap: 12,
  },
  classItemInfo: { 
    flex: 1,
  },
  classItemName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  classItemTeacher: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
  },
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  dataLabel: {
    fontSize: 13,
    color: colors.muted,
  },
  dataValue: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2E7D32",
  },
  actionsSection: {
    width: "100%",
    marginTop: 24,
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: 12,
  },
  actionButtonSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#F3E5F5",
    gap: 8,
  },
  actionButtonSecondaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.purple,
  },
  actionButtonPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  actionButtonDanger: {
    backgroundColor: colors.danger,
  },
  actionButtonSuccess: {
    backgroundColor: colors.green,
  },
  actionButtonPrimaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  closeBtn: {
    backgroundColor: "#E0E0E0",
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 24,
    alignItems: "center",
    width: "100%",
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#555",
  },

  // Classes Modal
  classesModal: {
    backgroundColor: colors.bg,
    borderRadius: 20,
    padding: 24,
    width: "90%",
    maxWidth: 360,
    maxHeight: "70%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 16,
  },
  classesScrollView: {
    maxHeight: 250,
  },
  emptyClassesContainer: {
    alignItems: "center",
    paddingVertical: 30,
  },
  emptyClassesText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 12,
  },
  emptyClassesSubtext: {
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    marginTop: 8,
  },
  classRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  classRowInfo: { flex: 1 },
  classRowName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  classRowTeacher: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  removeClassBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFEBEE",
    alignItems: "center",
    justifyContent: "center",
  },
  doneBtn: {
    backgroundColor: colors.purple,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },

});

// Desktop Styles
const desktopStyles = StyleSheet.create({
  screen: {
    backgroundColor: "#F8FAFC",
  },
  searchBox: {
    paddingHorizontal: 32,
    paddingTop: 24,
  },
  searchContainer: {
    maxWidth: 400,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
  },
  search: {
    paddingVertical: 10,
    fontSize: 14,
  },
  filterRow: {
    paddingHorizontal: 32,
    paddingTop: 16,
    gap: 8,
  },
  statsRow: {
    paddingHorizontal: 32,
    paddingTop: 16,
    gap: 12,
    maxWidth: 500,
  },
  statCard: {
    borderRadius: 10,
    padding: 14,
    minWidth: 100,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  mainScrollView: {
    marginHorizontal: 32,
  },
  mainScrollContent: {
    paddingTop: 16,
    paddingBottom: 32,
  },
});
