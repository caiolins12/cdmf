import React, { useEffect, useState, useCallback } from "react";
import {
  View, StyleSheet, ScrollView, Text, Pressable,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { Ionicons, FontAwesome5 } from "@/shims/icons";
import { useFocusEffect } from "@react-navigation/native";

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

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  useEffect(() => { if (selectedClass) loadAttendanceRecords(); }, [selectedClass, loadAttendanceRecords]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    if (selectedClass) await loadAttendanceRecords();
    setRefreshing(false);
  };

  const totalClasses = attendanceRecords.length;
  const totalPresences = attendanceRecords.reduce((a, r) => a + r.presentStudentIds.length, 0);
  const totalAbsences = attendanceRecords.reduce((a, r) => a + r.absentStudentIds.length, 0);
  const totalStudents = selectedClass?.studentIds?.length || 0;
  const overallPct =
    totalPresences + totalAbsences > 0
      ? Math.round((totalPresences / (totalPresences + totalAbsences)) * 100)
      : 0;

  const getStudentStats = (): StudentAttendanceStats[] => {
    if (!selectedClass) return [];
    return students
      .filter(s => selectedClass.studentIds?.includes(s.uid))
      .map(student => {
        let presences = 0, absences = 0;
        attendanceRecords.forEach(r => {
          if (r.presentStudentIds.includes(student.uid)) presences++;
          else if (r.absentStudentIds.includes(student.uid)) absences++;
        });
        const total = presences + absences;
        return {
          student,
          totalClasses: total,
          presences,
          absences,
          percentage: total > 0 ? Math.round((presences / total) * 100) : 0,
        };
      })
      .sort((a, b) => b.percentage - a.percentage);
  };

  const studentStats = getStudentStats();

  const formatClassTags = (classItem: Class): string => {
    if (!classItem.schedule?.length) return "";
    const s = classItem.schedule[0];
    return `${DAYS_SHORT[s.dayOfWeek]} · ${s.startTime}h`;
  };

  const getPctColor = (pct: number) =>
    pct >= 80 ? colors.green : pct >= 60 ? "#F59E0B" : colors.danger;

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.innerHeader}>
          <Text style={styles.innerHeaderTitle}>Relatórios</Text>
        </View>
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
        <View style={styles.innerHeader}>
          <Text style={styles.innerHeaderTitle}>Relatórios</Text>
        </View>
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconBox}>
            <FontAwesome5 name="chart-bar" size={32} color="#94A3B8" />
          </View>
          <Text style={styles.emptyTitle}>Nenhuma turma atribuída</Text>
          <Text style={styles.emptySubtext}>
            Os relatórios estarão disponíveis quando você tiver turmas
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.innerHeader}>
        <Text style={styles.innerHeaderTitle}>Relatórios</Text>
      </View>

      {/* Class selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.classSelector}
        contentContainerStyle={styles.classSelectorContent}
      >
        {classes.map(classItem => {
          const sel = selectedClass?.id === classItem.id;
          return (
            <Pressable
              key={classItem.id}
              style={[styles.classTab, sel && styles.classTabSelected]}
              onPress={() => setSelectedClass(classItem)}
            >
              <Text style={[styles.classTabText, sel && styles.classTabTextSelected]}>
                {classItem.name}
              </Text>
              <Text style={[styles.classTabTag, sel && styles.classTabTagSelected]}>
                {formatClassTags(classItem)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* View mode toggle */}
      <View style={styles.toggleWrap}>
        <Pressable
          style={[styles.toggleBtn, viewMode === "general" && styles.toggleBtnActive]}
          onPress={() => setViewMode("general")}
        >
          <Ionicons
            name="stats-chart"
            size={16}
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
            size={16}
            color={viewMode === "individual" ? "#fff" : colors.purple}
          />
          <Text style={[styles.toggleText, viewMode === "individual" && styles.toggleTextActive]}>
            Individual
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.purple]} />
        }
      >
        {loadingAttendance ? (
          <View style={styles.loadingAttendance}>
            <ActivityIndicator size="small" color={colors.purple} />
            <Text style={styles.loadingText}>Carregando dados...</Text>
          </View>
        ) : viewMode === "general" ? (
          <View style={styles.section}>
            {/* Percentage circle card */}
            <View style={styles.pctCard}>
              <View style={[styles.pctCircle, { borderColor: getPctColor(overallPct) }]}>
                <Text style={[styles.pctValue, { color: getPctColor(overallPct) }]}>
                  {overallPct}%
                </Text>
              </View>
              <Text style={styles.pctLabel}>Taxa de Presença Geral</Text>
            </View>

            {/* Stats grid */}
            <View style={styles.statsGrid}>
              {[
                { icon: "calendar-outline", bg: "#EFF6FF", color: "#3B82F6", val: totalClasses, label: "Aulas\nRegistradas" },
                { icon: "checkmark-circle-outline", bg: "#DCFCE7", color: colors.green, val: totalPresences, label: "Total de\nPresenças" },
                { icon: "close-circle-outline", bg: "#FEE2E2", color: colors.danger, val: totalAbsences, label: "Total de\nFaltas" },
                { icon: "people-outline", bg: "#EDE9FE", color: colors.purple, val: totalStudents, label: "Alunos\nMatriculados" },
              ].map((item, i) => (
                <View key={i} style={styles.statBox}>
                  <View style={[styles.statIcon, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon as any} size={20} color={item.color} />
                  </View>
                  <Text style={styles.statValue}>{item.val}</Text>
                  <Text style={styles.statLabel}>{item.label}</Text>
                </View>
              ))}
            </View>

            {/* Recent classes */}
            {attendanceRecords.length > 0 && (
              <View style={styles.recentCard}>
                <Text style={styles.sectionLabel}>ÚLTIMAS AULAS REGISTRADAS</Text>
                {attendanceRecords.slice(0, 5).map((record, idx) => {
                  const date = new Date(record.date + "T12:00:00");
                  const dayOfWeek = DAYS_SHORT[date.getDay()];
                  const dateStr = date.toLocaleDateString("pt-BR");
                  const present = record.presentStudentIds.length;
                  const absent = record.absentStudentIds.length;
                  const total = present + absent;
                  const pct = total > 0 ? Math.round((present / total) * 100) : 0;
                  return (
                    <View
                      key={record.id || idx}
                      style={[styles.recentRow, idx < 4 && styles.recentRowBorder]}
                    >
                      <View style={styles.recentDateBox}>
                        <Text style={styles.recentDay}>{dayOfWeek}</Text>
                        <Text style={styles.recentDate}>{dateStr}</Text>
                      </View>
                      <View style={styles.recentCounts}>
                        <View style={styles.recentCountItem}>
                          <Ionicons name="checkmark" size={13} color={colors.green} />
                          <Text style={styles.recentCountText}>{present}</Text>
                        </View>
                        <View style={styles.recentCountItem}>
                          <Ionicons name="close" size={13} color={colors.danger} />
                          <Text style={styles.recentCountText}>{absent}</Text>
                        </View>
                      </View>
                      <View style={[styles.recentPct, { backgroundColor: getPctColor(pct) + "20" }]}>
                        <Text style={[styles.recentPctText, { color: getPctColor(pct) }]}>
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
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>PRESENÇA POR ALUNO</Text>
            {studentStats.length === 0 ? (
              <View style={styles.emptyInline}>
                <FontAwesome5 name="user-graduate" size={32} color="#94A3B8" />
                <Text style={styles.emptyTitle}>Nenhum aluno nesta turma</Text>
              </View>
            ) : (
              studentStats.map((stat, idx) => (
                <View key={stat.student.uid} style={styles.studentCard}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>{idx + 1}º</Text>
                  </View>
                  <View style={styles.studentInfo}>
                    <Text style={styles.studentName}>{stat.student.name}</Text>
                    <View style={styles.studentMeta}>
                      <View style={styles.metaItem}>
                        <Ionicons name="checkmark-circle" size={12} color={colors.green} />
                        <Text style={styles.metaText}>{stat.presences} pres.</Text>
                      </View>
                      <View style={styles.metaItem}>
                        <Ionicons name="close-circle" size={12} color={colors.danger} />
                        <Text style={styles.metaText}>{stat.absences} falt.</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.studentPct}>
                    <View style={[styles.pctBadge, { backgroundColor: getPctColor(stat.percentage) + "20" }]}>
                      <Text style={[styles.pctBadgeText, { color: getPctColor(stat.percentage) }]}>
                        {stat.percentage}%
                      </Text>
                    </View>
                    <View style={styles.progressBar}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${stat.percentage}%`, backgroundColor: getPctColor(stat.percentage) },
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
  screen: { flex: 1, backgroundColor: "#F8FAFC" },

  innerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  innerHeaderTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1E293B",
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: { color: "#64748B", fontWeight: "600", fontSize: 14 },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyIconBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 6,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
  },
  emptyInline: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },

  classSelector: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    maxHeight: 72,
  },
  classSelectorContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  classTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  classTabSelected: { backgroundColor: colors.purple, borderColor: colors.purple },
  classTabText: { fontSize: 13, fontWeight: "700", color: "#475569" },
  classTabTextSelected: { color: "#fff" },
  classTabTag: { fontSize: 10, fontWeight: "600", color: "#94A3B8", marginTop: 2 },
  classTabTagSelected: { color: "rgba(255,255,255,0.75)" },

  toggleWrap: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: "#EDE9FE",
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
  toggleBtnActive: { backgroundColor: colors.purple },
  toggleText: { fontSize: 13, fontWeight: "700", color: colors.purple },
  toggleTextActive: { color: "#fff" },

  loadingAttendance: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 12,
  },

  section: { padding: 16 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.5,
    marginBottom: 12,
  },

  pctCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  pctCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  pctValue: { fontSize: 36, fontWeight: "900" },
  pctLabel: { fontSize: 14, fontWeight: "700", color: "#64748B" },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statValue: { fontSize: 24, fontWeight: "900", color: "#1E293B" },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "center",
    marginTop: 4,
  },

  recentCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  recentRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  recentDateBox: { flex: 1 },
  recentDay: { fontSize: 12, fontWeight: "800", color: colors.purple },
  recentDate: { fontSize: 11, color: "#64748B", marginTop: 2 },
  recentCounts: { flexDirection: "row", gap: 12 },
  recentCountItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  recentCountText: { fontSize: 13, fontWeight: "700", color: "#1E293B" },
  recentPct: {
    marginLeft: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  recentPctText: { fontSize: 12, fontWeight: "800" },

  studentCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rankText: { fontSize: 12, fontWeight: "800", color: colors.purple },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 14, fontWeight: "700", color: "#1E293B" },
  studentMeta: { flexDirection: "row", gap: 12, marginTop: 4 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 11, color: "#64748B", fontWeight: "600" },
  studentPct: { alignItems: "flex-end", width: 70 },
  pctBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 6,
  },
  pctBadgeText: { fontSize: 13, fontWeight: "800" },
  progressBar: {
    width: "100%",
    height: 4,
    backgroundColor: "#E2E8F0",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 2 },
});
