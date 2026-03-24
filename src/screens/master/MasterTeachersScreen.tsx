import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, ScrollView, TextInput, Text, RefreshControl, Pressable, ActivityIndicator } from "react-native";
import { Ionicons, FontAwesome5 } from "@/shims/icons";
import { useFocusEffect } from "@react-navigation/native";

import MasterHeader from "../../components/MasterHeader";
import SectionHeader from "../../components/SectionHeader";
import { TeacherFormModal, TeacherDetailsModal } from "../../components/master";
import { showAlert } from "../../components/ui";
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
    toggleTeacherActive,
    getTeacherClasses,
    removeTeacherFromClass,
    fetchClasses,
    assignTeacherToClass,
    updateProfile,
    deleteTeacher,
  } = useAuth();

  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [allClasses, setAllClasses] = useState<Class[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("ativos");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal states - Simplificado para 2 modais
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const [selectedTeacher, setSelectedTeacher] = useState<Profile | null>(null);
  const [teacherClasses, setTeacherClasses] = useState<Class[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

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
    const matchesQuery =
      t.name.toLowerCase().includes(query.toLowerCase()) ||
      (t.teacherCode?.toLowerCase().includes(query.toLowerCase()) ?? false);

    if (filter === "ativos") return matchesQuery && t.active !== false;
    if (filter === "inativos") return matchesQuery && t.active === false;
    return matchesQuery;
  });

  const activeTeachers = teachers.filter((t) => t.active !== false);
  const inactiveTeachers = teachers.filter((t) => t.active === false);

  // Get teacher's classes count
  const getTeacherClassCount = (teacherId: string) => {
    return allClasses.filter((c) => c.teacherId === teacherId).length;
  };

  // ========== Handlers ==========

  const handleOpenCreate = () => {
    setSelectedTeacher(null);
    setIsEditMode(false);
    setShowFormModal(true);
  };

  const handleOpenEdit = () => {
    setIsEditMode(true);
    setShowDetailsModal(false);
    setShowFormModal(true);
  };

  const handleSaveTeacher = async (data: { name: string; phone?: string }) => {
    if (isEditMode && selectedTeacher) {
      // Modo edição
      await updateProfile(selectedTeacher.uid, {
        name: data.name,
        phone: data.phone,
      });
      // Optimistic update
      setTeachers(prev => prev.map(t =>
        t.uid === selectedTeacher.uid ? { ...t, name: data.name, phone: data.phone } : t
      ));
      setSelectedTeacher((prev) =>
        prev ? { ...prev, name: data.name, phone: data.phone } : null
      );
      showAlert("Sucesso", "Dados atualizados com sucesso!");
      loadTeachers();
      return;
    } else {
      // Modo criação
      const credentials = await createTeacher(data.name, data.phone);
      logActivity({
        type: "student_registered",
        title: data.name,
        description: "Novo professor cadastrado",
      }).catch(() => {});
      loadTeachers();
      return credentials;
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

  const handleToggleActive = async (teacher: Profile) => {
    try {
      const newStatus = !teacher.active;
      await toggleTeacherActive(teacher.uid, newStatus);
      // Optimistic update
      setTeachers(prev => prev.map(t =>
        t.uid === teacher.uid ? { ...t, active: newStatus } : t
      ));
      showAlert(
        "Sucesso",
        `Professor ${newStatus ? "ativado" : "desativado"} com sucesso!`
      );
      setShowDetailsModal(false);
      loadTeachers();
    } catch (e: any) {
      showAlert("Erro", e.message || "Não foi possível alterar o status");
    }
  };

  const handleDeleteTeacher = async (teacher: Profile) => {
    try {
      await deleteTeacher(teacher.uid);
      setTeachers(prev => prev.filter(t => t.uid !== teacher.uid));
      setShowDetailsModal(false);
      showAlert("Sucesso", "Professor excluído com sucesso!");
      loadTeachers();
    } catch (e: any) {
      showAlert("Erro", e.message || "Não foi possível excluir o professor");
    }
  };

  const handleRemoveFromClass = async (classItem: Class) => {
    if (!selectedTeacher) return;
    try {
      await removeTeacherFromClass(classItem.id);
      setTeacherClasses(prev => prev.filter(c => c.id !== classItem.id));
      showAlert("Sucesso", "Professor removido da turma!");
      loadTeachers();
    } catch (e: any) {
      showAlert("Erro", e.message || "Não foi possível remover");
    }
  };

  const handleAddToClass = async (classItem: Class) => {
    if (!selectedTeacher) return;
    try {
      await assignTeacherToClass(
        classItem.id,
        selectedTeacher.uid,
        selectedTeacher.name
      );
      setTeacherClasses(prev => [...prev, classItem]);
      showAlert("Sucesso", `Professor adicionado à turma ${classItem.name}!`);
      loadTeachers();
    } catch (e: any) {
      showAlert("Erro", e.message || "Não foi possível adicionar");
    }
  };

  return (
    <View style={[styles.screen, isDesktopMode && desktopStyles.screen]}>
      {!isDesktopMode && <MasterHeader />}
      {!isDesktopMode && <SectionHeader title="Gestão de Professores" />}

      {/* Modal de Formulário (Criar/Editar) */}
      <TeacherFormModal
        visible={showFormModal}
        onClose={() => setShowFormModal(false)}
        onSave={handleSaveTeacher}
        teacher={isEditMode ? selectedTeacher : null}
      />

      {/* Modal de Detalhes */}
      <TeacherDetailsModal
        visible={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        teacher={selectedTeacher}
        classes={teacherClasses}
        allClasses={allClasses}
        loadingClasses={loadingClasses}
        onEdit={handleOpenEdit}
        onToggleActive={handleToggleActive}
        onDelete={handleDeleteTeacher}
        onRemoveFromClass={handleRemoveFromClass}
        onAddToClass={handleAddToClass}
      />

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
        <Pressable style={styles.addBtn} onPress={handleOpenCreate}>
          <Ionicons name="add" size={24} color="#fff" />
        </Pressable>
      </View>

      {/* Filters */}
      <View style={[styles.filtersRow, isDesktopMode && desktopStyles.filtersRow]}>
        {(["ativos", "inativos", "todos"] as FilterType[]).map((f) => (
          <Pressable
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text
              style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}
            >
              {f === "ativos"
                ? `Ativos (${activeTeachers.length})`
                : f === "inativos"
                ? `Inativos (${inactiveTeachers.length})`
                : `Todos (${teachers.length})`}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Stats */}
      <View style={[styles.statsRow, isDesktopMode && desktopStyles.statsRow]}>
        <View style={[styles.statCard, styles.statCardGreen]}>
          <Text style={[styles.statNumber, { color: colors.green }]}>
            {activeTeachers.length}
          </Text>
          <Text style={styles.statLabel}>Ativos</Text>
        </View>
        <View style={[styles.statCard, styles.statCardRed]}>
          <Text style={[styles.statNumber, { color: colors.danger }]}>
            {inactiveTeachers.length}
          </Text>
          <Text style={styles.statLabel}>Inativos</Text>
        </View>
      </View>

      {/* Teacher List */}
      <ScrollView
        style={styles.listContainer}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.purple]}
          />
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
            <Pressable style={styles.btnPrimary} onPress={handleOpenCreate}>
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
                  <View
                    style={[
                      styles.statusIndicator,
                      { backgroundColor: isInactive ? colors.danger : colors.green },
                    ]}
                  />

                  <View style={styles.teacherInfo}>
                    <View style={styles.nameRow}>
                      <Text
                        style={[styles.teacherName, isInactive && styles.teacherNameInactive]}
                      >
                        {teacher.name}
                      </Text>
                      {classCount > 0 && (
                        <View style={styles.classCountBadge}>
                          <Text style={styles.classCountText}>{classCount}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.teacherCode}>
                      Código: {teacher.teacherCode || "N/A"}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusTag,
                      { backgroundColor: isInactive ? "#FEE2E2" : "#DCFCE7" },
                    ]}
                  >
                    <Ionicons
                      name={isInactive ? "close-circle" : "checkmark-circle"}
                      size={14}
                      color={isInactive ? colors.danger : colors.green}
                    />
                    <Text
                      style={[
                        styles.statusTagText,
                        { color: isInactive ? colors.danger : colors.green },
                      ]}
                    >
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
                onPress={() => setDisplayLimit((prev) => prev + TEACHERS_PER_PAGE)}
              >
                <Ionicons name="chevron-down-circle-outline" size={20} color={colors.purple} />
                <Text style={styles.loadMoreText}>
                  Carregar mais ({filteredTeachers.length - displayLimit} restantes)
                </Text>
              </Pressable>
            )}

            {filteredTeachers.length > 0 && (
              <Text style={styles.displayCount}>
                Exibindo {Math.min(displayLimit, filteredTeachers.length)} de{" "}
                {filteredTeachers.length} professores
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

  // Buttons
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.purple,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 16,
  },
  btnPrimaryText: {
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


