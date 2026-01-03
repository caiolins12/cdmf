import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, ScrollView, Text, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import CdmfHeader from "../../components/CdmfHeader";
import SectionHeader from "../../components/SectionHeader";
import { colors } from "../../theme/colors";
import { useAuth, Class, Profile, AttendanceRecord } from "../../contexts/AuthContext";

const DAYS_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

type StudentAttendanceStats = {
  student: Profile;
  totalClasses: number;
  presences: number;
  absences: number;
  percentage: number;
};

export default function TeacherReportsScreen() {
  const { profile, fetchClasses, fetchStudents, fetchAttendance } = useAuth();
  
  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<"general" | "individual">("general");

  const loadData = useCallback(async () => {
    try {
      const [classesData, studentsData] = await Promise.all([
        fetchClasses(),
        fetchStudents(),
      ]);
      
      // Filtra turmas do professor atual
      const myClasses = classesData.filter(c => c.teacherId === profile?.uid && c.active);
      
      setClasses(myClasses);
      setStudents(studentsData);

      if (myClasses.length > 0 && !selectedClass) {
        setSelectedClass(myClasses[0]);
      }
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
    } finally {
      setLoading(false);
    }
  }, [fetchClasses, fetchStudents, profile]);

  // Carrega registros de presença da turma selecionada
  const loadAttendanceRecords = useCallback(async () => {
    if (!selectedClass) return;
    
    setLoadingAttendance(true);
    try {
      const records = await fetchAttendance(selectedClass.id);
      setAttendanceRecords(records);
    } catch (e) {
      console.error("Erro ao carregar presença:", e);
    } finally {
      setLoadingAttendance(false);
    }
  }, [selectedClass, fetchAttendance]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    if (selectedClass) {
      loadAttendanceRecords();
    }
  }, [selectedClass, loadAttendanceRecords]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    if (selectedClass) {
      await loadAttendanceRecords();
    }
    setRefreshing(false);
  };

  // Estatísticas gerais
  const totalClasses = attendanceRecords.length;
  const totalPresences = attendanceRecords.reduce((acc, r) => acc + r.presentStudentIds.length, 0);
  const totalAbsences = attendanceRecords.reduce((acc, r) => acc + r.absentStudentIds.length, 0);
  const totalStudents = selectedClass?.studentIds?.length || 0;
  const overallPercentage = totalPresences + totalAbsences > 0 
    ? Math.round((totalPresences / (totalPresences + totalAbsences)) * 100) 
    : 0;

  // Estatísticas individuais por aluno
  const getStudentStats = (): StudentAttendanceStats[] => {
    if (!selectedClass) return [];
    
    const classStudents = students.filter(s => selectedClass.studentIds?.includes(s.uid));
    
    return classStudents.map(student => {
      let presences = 0;
      let absences = 0;
      
      attendanceRecords.forEach(record => {
        if (record.presentStudentIds.includes(student.uid)) {
          presences++;
        } else if (record.absentStudentIds.includes(student.uid)) {
          absences++;
        }
      });
      
      const total = presences + absences;
      const percentage = total > 0 ? Math.round((presences / total) * 100) : 0;
      
      return {
        student,
        totalClasses: total,
        presences,
        absences,
        percentage,
      };
    }).sort((a, b) => b.percentage - a.percentage);
  };

  const studentStats = getStudentStats();

  // Formata as tags da turma
  const formatClassTags = (classItem: Class): string => {
    if (!classItem.schedule || classItem.schedule.length === 0) return "";
    const schedule = classItem.schedule[0];
    const dayStr = DAYS_SHORT[schedule.dayOfWeek];
    const timeStr = schedule.startTime;
    return `${dayStr} | ${timeStr}h`;
  };

  // Cor baseada na porcentagem
  const getPercentageColor = (percentage: number): string => {
    if (percentage >= 80) return colors.green;
    if (percentage >= 60) return "#FFA000";
    return colors.danger;
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <CdmfHeader />
        <SectionHeader title="Relatórios" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.purple} />
          <Text style={styles.loadingText}>Carregando...</Text>
        </View>
      </View>
    );
  }

  if (classes.length === 0) {
    return (
      <View style={styles.screen}>
        <CdmfHeader />
        <SectionHeader title="Relatórios" />
        <View style={styles.emptyContainer}>
          <FontAwesome5 name="chart-bar" size={48} color="#ccc" />
          <Text style={styles.emptyText}>Você não tem turmas atribuídas</Text>
          <Text style={styles.emptySubtext}>
            Os relatórios estarão disponíveis quando você tiver turmas
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CdmfHeader />
      <SectionHeader title="Relatórios de Presença" />

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.purple]} />
        }
      >
        {/* Seletor de Turma */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.classSelector}>
          {classes.map(classItem => (
            <Pressable
              key={classItem.id}
              style={[
                styles.classTab,
                selectedClass?.id === classItem.id && styles.classTabSelected,
              ]}
              onPress={() => setSelectedClass(classItem)}
            >
              <Text style={[
                styles.classTabText,
                selectedClass?.id === classItem.id && styles.classTabTextSelected,
              ]}>
                {classItem.name}
              </Text>
              <Text style={[
                styles.classTabTag,
                selectedClass?.id === classItem.id && styles.classTabTagSelected,
              ]}>
                {formatClassTags(classItem)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Toggle de visualização */}
        <View style={styles.toggleContainer}>
          <Pressable
            style={[styles.toggleBtn, viewMode === "general" && styles.toggleBtnActive]}
            onPress={() => setViewMode("general")}
          >
            <Ionicons 
              name="stats-chart" 
              size={18} 
              color={viewMode === "general" ? "#fff" : colors.purple} 
            />
            <Text style={[styles.toggleText, viewMode === "general" && styles.toggleTextActive]}>
              Geral
            </Text>
          </Pressable>
          <Pressable
            style={[styles.toggleBtn, viewMode === "individual" && styles.toggleBtnActive]}
            onPress={() => setViewMode("individual")}
          >
            <Ionicons 
              name="people" 
              size={18} 
              color={viewMode === "individual" ? "#fff" : colors.purple} 
            />
            <Text style={[styles.toggleText, viewMode === "individual" && styles.toggleTextActive]}>
              Individual
            </Text>
          </Pressable>
        </View>

        {loadingAttendance ? (
          <View style={styles.loadingAttendance}>
            <ActivityIndicator size="small" color={colors.purple} />
            <Text style={styles.loadingText}>Carregando dados...</Text>
          </View>
        ) : viewMode === "general" ? (
          /* Visão Geral */
          <View style={styles.generalView}>
            {/* Card principal de porcentagem */}
            <View style={styles.mainPercentageCard}>
              <View style={[styles.percentageCircle, { borderColor: getPercentageColor(overallPercentage) }]}>
                <Text style={[styles.percentageValue, { color: getPercentageColor(overallPercentage) }]}>
                  {overallPercentage}%
                </Text>
              </View>
              <Text style={styles.percentageLabel}>Taxa de Presença Geral</Text>
            </View>

            {/* Grid de estatísticas */}
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <View style={[styles.statIcon, { backgroundColor: "#E3F2FD" }]}>
                  <Ionicons name="calendar" size={20} color="#1976D2" />
                </View>
                <Text style={styles.statValue}>{totalClasses}</Text>
                <Text style={styles.statLabel}>Aulas{"\n"}Registradas</Text>
              </View>

              <View style={styles.statBox}>
                <View style={[styles.statIcon, { backgroundColor: "#E8F5E9" }]}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.green} />
                </View>
                <Text style={styles.statValue}>{totalPresences}</Text>
                <Text style={styles.statLabel}>Total de{"\n"}Presenças</Text>
              </View>

              <View style={styles.statBox}>
                <View style={[styles.statIcon, { backgroundColor: "#FFEBEE" }]}>
                  <Ionicons name="close-circle" size={20} color={colors.danger} />
                </View>
                <Text style={styles.statValue}>{totalAbsences}</Text>
                <Text style={styles.statLabel}>Total de{"\n"}Faltas</Text>
              </View>

              <View style={styles.statBox}>
                <View style={[styles.statIcon, { backgroundColor: "#F3E5F5" }]}>
                  <FontAwesome5 name="user-graduate" size={18} color={colors.purple} />
                </View>
                <Text style={styles.statValue}>{totalStudents}</Text>
                <Text style={styles.statLabel}>Alunos{"\n"}Matriculados</Text>
              </View>
            </View>

            {/* Resumo por aula */}
            {attendanceRecords.length > 0 && (
              <View style={styles.recentSection}>
                <Text style={styles.sectionTitle}>ÚLTIMAS AULAS REGISTRADAS</Text>
                {attendanceRecords.slice(0, 5).map((record, index) => {
                  const date = new Date(record.date + "T12:00:00");
                  const dayOfWeek = DAYS_SHORT[date.getDay()];
                  const dateStr = date.toLocaleDateString("pt-BR");
                  const present = record.presentStudentIds.length;
                  const absent = record.absentStudentIds.length;
                  const total = present + absent;
                  const pct = total > 0 ? Math.round((present / total) * 100) : 0;
                  
                  return (
                    <View key={record.id || index} style={styles.recentRow}>
                      <View style={styles.recentDate}>
                        <Text style={styles.recentDayText}>{dayOfWeek}</Text>
                        <Text style={styles.recentDateText}>{dateStr}</Text>
                      </View>
                      <View style={styles.recentStats}>
                        <View style={styles.recentStatItem}>
                          <Ionicons name="checkmark" size={14} color={colors.green} />
                          <Text style={styles.recentStatText}>{present}</Text>
                        </View>
                        <View style={styles.recentStatItem}>
                          <Ionicons name="close" size={14} color={colors.danger} />
                          <Text style={styles.recentStatText}>{absent}</Text>
                        </View>
                      </View>
                      <View style={[styles.recentPct, { backgroundColor: getPercentageColor(pct) + "20" }]}>
                        <Text style={[styles.recentPctText, { color: getPercentageColor(pct) }]}>
                          {pct}%
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ) : (
          /* Visão Individual */
          <View style={styles.individualView}>
            <Text style={styles.sectionTitle}>PRESENÇA POR ALUNO</Text>
            
            {studentStats.length === 0 ? (
              <View style={styles.noStudentsContainer}>
                <FontAwesome5 name="user-graduate" size={32} color="#ccc" />
                <Text style={styles.noStudentsText}>Nenhum aluno nesta turma</Text>
              </View>
            ) : (
              studentStats.map((stat, index) => (
                <View key={stat.student.uid} style={styles.studentCard}>
                  <View style={styles.studentRank}>
                    <Text style={styles.studentRankText}>{index + 1}º</Text>
                  </View>
                  <View style={styles.studentInfo}>
                    <Text style={styles.studentName}>{stat.student.name}</Text>
                    <View style={styles.studentStatsRow}>
                      <View style={styles.studentStatItem}>
                        <Ionicons name="checkmark-circle" size={12} color={colors.green} />
                        <Text style={styles.studentStatText}>{stat.presences} presenças</Text>
                      </View>
                      <View style={styles.studentStatItem}>
                        <Ionicons name="close-circle" size={12} color={colors.danger} />
                        <Text style={styles.studentStatText}>{stat.absences} faltas</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.studentPercentage}>
                    <View style={[
                      styles.percentageBadge, 
                      { backgroundColor: getPercentageColor(stat.percentage) + "20" }
                    ]}>
                      <Text style={[
                        styles.percentageBadgeText,
                        { color: getPercentageColor(stat.percentage) }
                      ]}>
                        {stat.percentage}%
                      </Text>
                    </View>
                    <View style={styles.progressBar}>
                      <View 
                        style={[
                          styles.progressFill, 
                          { 
                            width: `${stat.percentage}%`,
                            backgroundColor: getPercentageColor(stat.percentage),
                          }
                        ]} 
                      />
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

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
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    marginTop: 8,
  },

  classSelector: {
    maxHeight: 70,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  classTab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "#f5f5f5",
    marginRight: 8,
    alignItems: "center",
  },
  classTabSelected: {
    backgroundColor: colors.purple,
  },
  classTabText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  classTabTextSelected: {
    color: "#fff",
  },
  classTabTag: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 2,
  },
  classTabTagSelected: {
    color: "rgba(255,255,255,0.8)",
  },

  toggleContainer: {
    flexDirection: "row",
    marginHorizontal: 12,
    marginTop: 16,
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    padding: 4,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  toggleBtnActive: {
    backgroundColor: colors.purple,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.purple,
  },
  toggleTextActive: {
    color: "#fff",
  },

  loadingAttendance: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 12,
  },

  /* General View */
  generalView: {
    padding: 12,
  },
  mainPercentageCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  percentageCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  percentageValue: {
    fontSize: 36,
    fontWeight: "900",
  },
  percentageLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.muted,
  },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "900",
    color: colors.text,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    textAlign: "center",
    marginTop: 4,
  },

  recentSection: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.muted,
    letterSpacing: 0.5,
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  recentDate: {
    flex: 1,
  },
  recentDayText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.purple,
  },
  recentDateText: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  recentStats: {
    flexDirection: "row",
    gap: 12,
  },
  recentStatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  recentStatText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  recentPct: {
    marginLeft: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  recentPctText: {
    fontSize: 12,
    fontWeight: "800",
  },

  /* Individual View */
  individualView: {
    padding: 12,
  },
  noStudentsContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  noStudentsText: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 12,
  },
  studentCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  studentRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3E5F5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  studentRankText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.purple,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  studentStatsRow: {
    flexDirection: "row",
    marginTop: 4,
    gap: 12,
  },
  studentStatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  studentStatText: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: "600",
  },
  studentPercentage: {
    alignItems: "flex-end",
    width: 70,
  },
  percentageBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 6,
  },
  percentageBadgeText: {
    fontSize: 13,
    fontWeight: "800",
  },
  progressBar: {
    width: "100%",
    height: 4,
    backgroundColor: "#E0E0E0",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
});

