import React, { useEffect, useState, useCallback } from "react";
import {
  View, StyleSheet, ScrollView, Text, Pressable, ActivityIndicator,
} from "react-native";
import { showAlert } from "../../utils/alert";
import { Ionicons, FontAwesome5 } from "@/shims/icons";
import { useFocusEffect } from "@react-navigation/native";

import { colors } from "../../theme/colors";
import { useAuth, Class, Profile, AttendanceRecord } from "../../contexts/AuthContext";

const DAYS_OF_WEEK = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DAYS_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

export default function TeacherAttendanceScreen() {
  const { profile, fetchClasses, fetchStudents, recordAttendance, fetchAttendance } = useAuth();

  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [attendanceState, setAttendanceState] = useState<Record<string, boolean>>({});
  const [existingAttendance, setExistingAttendance] = useState<AttendanceRecord | null>(null);
  const [allAttendanceRecords, setAllAttendanceRecords] = useState<AttendanceRecord[]>([]);

  const loadData = useCallback(async () => {
    try {
      const [classesData, studentsData] = await Promise.all([
        fetchClasses(),
        fetchStudents(),
      ]);
      const myClasses =
        profile?.role === "master"
          ? classesData.filter(c => c.active)
          : classesData.filter(c => c.teacherId === profile?.uid && c.active);

      setClasses(myClasses);
      setStudents(studentsData);

      if (myClasses.length > 0 && !selectedClass) {
        const first = myClasses[0];
        setSelectedClass(first);
        setSelectedDate(findNextValidDate(first, new Date()));
      }
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
    } finally {
      setLoading(false);
    }
  }, [fetchClasses, fetchStudents, profile]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const findNextValidDate = (classItem: Class, from: Date): string => {
    if (!classItem.schedule?.length) return from.toISOString().split("T")[0];
    const valid = classItem.schedule.map(s => s.dayOfWeek);
    const d = new Date(from);
    if (valid.includes(d.getDay())) return d.toISOString().split("T")[0];
    for (let i = 1; i <= 7; i++) {
      const next = new Date(d);
      next.setDate(d.getDate() + i);
      if (valid.includes(next.getDay())) return next.toISOString().split("T")[0];
    }
    return from.toISOString().split("T")[0];
  };

  const formatClassTags = (classItem: Class): string => {
    if (!classItem.schedule?.length) return "";
    const s = classItem.schedule[0];
    return `${DAYS_SHORT[s.dayOfWeek]} · ${s.startTime}h`;
  };

  const loadAttendance = async () => {
    if (!selectedClass) return;
    try {
      const records = await fetchAttendance(selectedClass.id, selectedDate);
      if (records.length > 0) {
        const rec = records[0];
        setExistingAttendance(rec);
        const state: Record<string, boolean> = {};
        rec.presentStudentIds.forEach(id => { state[id] = true; });
        rec.absentStudentIds.forEach(id => { state[id] = false; });
        setAttendanceState(state);
      } else {
        setExistingAttendance(null);
        const state: Record<string, boolean> = {};
        selectedClass.studentIds.forEach(id => { state[id] = true; });
        setAttendanceState(state);
      }
    } catch (e) {
      console.error("Erro ao carregar presença:", e);
    }
  };

  const loadAllAttendance = async () => {
    if (!selectedClass) return;
    try {
      const records = await fetchAttendance(selectedClass.id);
      setAllAttendanceRecords(records);
    } catch (e) {
      console.error("Erro ao carregar histórico:", e);
    }
  };

  useEffect(() => { if (selectedClass) loadAttendance(); }, [selectedClass, selectedDate]);
  useEffect(() => { if (selectedClass) loadAllAttendance(); }, [selectedClass]);

  const getClassStudents = (classItem: Class): Profile[] =>
    students.filter(s => classItem.studentIds.includes(s.uid));

  const toggleAttendance = (uid: string) =>
    setAttendanceState(prev => ({ ...prev, [uid]: !prev[uid] }));

  const handleSaveAttendance = async () => {
    if (!selectedClass) return;
    setSaving(true);
    try {
      const presentIds = Object.entries(attendanceState).filter(([, v]) => v).map(([id]) => id);
      const absentIds = Object.entries(attendanceState).filter(([, v]) => !v).map(([id]) => id);
      await recordAttendance(selectedClass.id, selectedDate, presentIds, absentIds);
      showAlert("Sucesso", "Presença registrada com sucesso!");
      setExistingAttendance({
        id: `${selectedClass.id}_${selectedDate}`,
        classId: selectedClass.id,
        date: selectedDate,
        presentStudentIds: presentIds,
        absentStudentIds: absentIds,
        createdBy: profile?.uid || "",
        createdAt: Date.now(),
      });
    } catch (e: any) {
      showAlert("Erro", e.message || "Não foi possível salvar a presença");
    } finally {
      setSaving(false);
    }
  };

  const changeDate = (direction: number) => {
    if (!selectedClass?.schedule?.length) {
      const current = new Date(selectedDate + "T12:00:00");
      current.setDate(current.getDate() + direction);
      setSelectedDate(current.toISOString().split("T")[0]);
      return;
    }
    const valid = selectedClass.schedule.map(s => s.dayOfWeek);
    const current = new Date(selectedDate + "T12:00:00");
    for (let i = 1; i <= 14; i++) {
      const next = new Date(current);
      next.setDate(current.getDate() + direction * i);
      if (valid.includes(next.getDay())) {
        setSelectedDate(next.toISOString().split("T")[0]);
        return;
      }
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T12:00:00");
    return `${DAYS_OF_WEEK[date.getDay()]}, ${date.toLocaleDateString("pt-BR")}`;
  };

  const classStudents = selectedClass ? getClassStudents(selectedClass) : [];
  const presentCount = Object.values(attendanceState).filter(v => v).length;
  const absentCount = Object.values(attendanceState).filter(v => !v).length;
  const totalClasses = allAttendanceRecords.length;
  const totalPresences = allAttendanceRecords.reduce((a, r) => a + r.presentStudentIds.length, 0);
  const totalAbsences = allAttendanceRecords.reduce((a, r) => a + r.absentStudentIds.length, 0);

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.innerHeader}>
          <Text style={styles.innerHeaderTitle}>Controle de Presença</Text>
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
          <Text style={styles.innerHeaderTitle}>Controle de Presença</Text>
        </View>
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconBox}>
            <FontAwesome5 name="clipboard-list" size={32} color="#94A3B8" />
          </View>
          <Text style={styles.emptyTitle}>Nenhuma turma atribuída</Text>
          <Text style={styles.emptySubtext}>
            Peça ao administrador para atribuir turmas a você
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.innerHeader}>
        <Text style={styles.innerHeaderTitle}>Controle de Presença</Text>
      </View>

      {/* Class selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.classSelector}
        contentContainerStyle={styles.classSelectorContent}
      >
        {classes.map(classItem => {
          const selected = selectedClass?.id === classItem.id;
          return (
            <Pressable
              key={classItem.id}
              style={[styles.classTab, selected && styles.classTabSelected]}
              onPress={() => {
                setSelectedClass(classItem);
                setSelectedDate(findNextValidDate(classItem, new Date(selectedDate + "T12:00:00")));
              }}
            >
              <Text style={[styles.classTabText, selected && styles.classTabTextSelected]}>
                {classItem.name}
              </Text>
              <Text style={[styles.classTabTag, selected && styles.classTabTagSelected]}>
                {formatClassTags(classItem)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Date selector */}
      <View style={styles.dateSelector}>
        <Pressable style={styles.dateArrow} onPress={() => changeDate(-1)}>
          <Ionicons name="chevron-back" size={22} color={colors.purple} />
        </Pressable>
        <View style={styles.dateInfo}>
          <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
          {existingAttendance && (
            <View style={styles.savedBadge}>
              <Ionicons name="checkmark" size={11} color="#fff" />
              <Text style={styles.savedBadgeText}>Salvo</Text>
            </View>
          )}
        </View>
        <Pressable style={styles.dateArrow} onPress={() => changeDate(1)}>
          <Ionicons name="chevron-forward" size={22} color={colors.purple} />
        </Pressable>
      </View>

      {/* Day stats */}
      <View style={styles.dayStatsRow}>
        <View style={[styles.dayStatCard, { backgroundColor: "#DCFCE7" }]}>
          <Ionicons name="checkmark-circle" size={18} color={colors.green} />
          <Text style={[styles.dayStatNum, { color: colors.green }]}>{presentCount}</Text>
          <Text style={styles.dayStatLabel}>Presentes</Text>
        </View>
        <View style={[styles.dayStatCard, { backgroundColor: "#FEE2E2" }]}>
          <Ionicons name="close-circle" size={18} color={colors.danger} />
          <Text style={[styles.dayStatNum, { color: colors.danger }]}>{absentCount}</Text>
          <Text style={styles.dayStatLabel}>Ausentes</Text>
        </View>
      </View>

      {/* General stats */}
      <View style={styles.generalStats}>
        <View style={styles.generalStatItem}>
          <Text style={styles.generalStatNum}>{totalClasses}</Text>
          <Text style={styles.generalStatLabel}>Aulas{"\n"}registradas</Text>
        </View>
        <View style={styles.generalStatDivider} />
        <View style={styles.generalStatItem}>
          <Text style={styles.generalStatNum}>{totalPresences}</Text>
          <Text style={styles.generalStatLabel}>Presenças{"\n"}totais</Text>
        </View>
        <View style={styles.generalStatDivider} />
        <View style={styles.generalStatItem}>
          <Text style={styles.generalStatNum}>{totalAbsences}</Text>
          <Text style={styles.generalStatLabel}>Faltas{"\n"}totais</Text>
        </View>
      </View>

      {/* Student list */}
      <ScrollView style={styles.studentsList} contentContainerStyle={styles.studentsListContent}>
        {classStudents.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconBox}>
              <FontAwesome5 name="user-graduate" size={32} color="#94A3B8" />
            </View>
            <Text style={styles.emptyTitle}>Nenhum aluno nesta turma</Text>
          </View>
        ) : (
          classStudents.map(student => {
            const isPresent = attendanceState[student.uid] ?? true;
            return (
              <Pressable
                key={student.uid}
                style={[styles.studentRow, isPresent ? styles.studentPresent : styles.studentAbsent]}
                onPress={() => toggleAttendance(student.uid)}
              >
                <View style={styles.studentAvatar}>
                  <Text style={[styles.studentAvatarText, { color: isPresent ? colors.green : colors.danger }]}>
                    {(student.name || "?")[0].toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.studentName}>{student.name}</Text>
                <View style={[styles.toggle, isPresent ? styles.togglePresent : styles.toggleAbsent]}>
                  <Ionicons name={isPresent ? "checkmark" : "close"} size={18} color="#fff" />
                </View>
              </Pressable>
            );
          })
        )}
        <View style={{ height: 12 }} />
      </ScrollView>

      {/* Save button */}
      {classStudents.length > 0 && (
        <View style={styles.footer}>
          <Pressable
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSaveAttendance}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="save-outline" size={20} color="#fff" />
                <Text style={styles.saveBtnText}>
                  {existingAttendance ? "Atualizar Presença" : "Salvar Presença"}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      )}
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
  classTabSelected: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },
  classTabText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  classTabTextSelected: { color: "#fff" },
  classTabTag: {
    fontSize: 10,
    fontWeight: "600",
    color: "#94A3B8",
    marginTop: 2,
  },
  classTabTagSelected: { color: "rgba(255,255,255,0.75)" },

  dateSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#fff",
    marginTop: 8,
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  dateArrow: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
  },
  dateInfo: { alignItems: "center" },
  dateText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
  },
  savedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.green,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 5,
  },
  savedBadgeText: { fontSize: 11, fontWeight: "700", color: "#fff" },

  dayStatsRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  dayStatCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
  },
  dayStatNum: {
    fontSize: 22,
    fontWeight: "800",
  },
  dayStatLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },

  generalStats: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 12,
  },
  generalStatItem: {
    flex: 1,
    alignItems: "center",
  },
  generalStatNum: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.purple,
  },
  generalStatLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#94A3B8",
    marginTop: 2,
    textAlign: "center",
  },
  generalStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: "#E2E8F0",
  },

  studentsList: { flex: 1, marginTop: 10 },
  studentsListContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },

  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
  },
  studentPresent: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  studentAbsent: {
    backgroundColor: "#FFF5F5",
    borderColor: "#FECACA",
  },
  studentAvatar: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  studentAvatarText: {
    fontSize: 15,
    fontWeight: "800",
  },
  studentName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
  },
  toggle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  togglePresent: { backgroundColor: colors.green },
  toggleAbsent: { backgroundColor: colors.danger },

  footer: {
    padding: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.purple,
    paddingVertical: 15,
    borderRadius: 14,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
  },
});
