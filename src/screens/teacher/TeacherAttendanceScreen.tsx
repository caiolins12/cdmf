import React, { useEffect, useState, useCallback, useMemo } from "react";
import { View, StyleSheet, ScrollView, Text, Pressable, Alert, ActivityIndicator } from "react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import CdmfHeader from "../../components/CdmfHeader";
import SectionHeader from "../../components/SectionHeader";
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

  // Attendance state
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
      
      // Filtra turmas do professor atual (ou todas se for master)
      const myClasses = profile?.role === "master" 
        ? classesData.filter(c => c.active)
        : classesData.filter(c => c.teacherId === profile?.uid && c.active);
      
      setClasses(myClasses);
      setStudents(studentsData);

      if (myClasses.length > 0 && !selectedClass) {
        const firstClass = myClasses[0];
        setSelectedClass(firstClass);
        // Encontra a próxima data válida para a turma
        const nextDate = findNextValidDate(firstClass, new Date());
        setSelectedDate(nextDate);
      }
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
    } finally {
      setLoading(false);
    }
  }, [fetchClasses, fetchStudents, profile]);

  // Recarrega quando a tela ganha foco
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Encontra a próxima data válida baseada nos dias da semana da turma
  const findNextValidDate = (classItem: Class, fromDate: Date): string => {
    if (!classItem.schedule || classItem.schedule.length === 0) {
      return fromDate.toISOString().split("T")[0];
    }
    
    const validDays = classItem.schedule.map(s => s.dayOfWeek);
    const date = new Date(fromDate);
    
    // Se o dia atual é válido, usa ele
    if (validDays.includes(date.getDay())) {
      return date.toISOString().split("T")[0];
    }
    
    // Procura o próximo dia válido (até 7 dias)
    for (let i = 1; i <= 7; i++) {
      const nextDate = new Date(date);
      nextDate.setDate(date.getDate() + i);
      if (validDays.includes(nextDate.getDay())) {
        return nextDate.toISOString().split("T")[0];
      }
    }
    
    return fromDate.toISOString().split("T")[0];
  };

  // Verifica se uma data é válida para a turma selecionada
  const isValidDateForClass = (dateStr: string): boolean => {
    if (!selectedClass || !selectedClass.schedule || selectedClass.schedule.length === 0) {
      return true;
    }
    const date = new Date(dateStr + "T12:00:00");
    const validDays = selectedClass.schedule.map(s => s.dayOfWeek);
    return validDays.includes(date.getDay());
  };

  // Formata as tags da turma (dia e horário)
  const formatClassTags = (classItem: Class): string => {
    if (!classItem.schedule || classItem.schedule.length === 0) return "";
    const schedule = classItem.schedule[0];
    const dayStr = DAYS_SHORT[schedule.dayOfWeek];
    const timeStr = schedule.startTime;
    return `${dayStr} | ${timeStr}h`;
  };

  // Carrega presença quando muda a turma ou data
  useEffect(() => {
    if (selectedClass) {
      loadAttendance();
    }
  }, [selectedClass, selectedDate]);

  const loadAttendance = async () => {
    if (!selectedClass) return;

    try {
      const records = await fetchAttendance(selectedClass.id, selectedDate);
      if (records.length > 0) {
        const record = records[0];
        setExistingAttendance(record);
        
        // Restaura o estado de presença
        const state: Record<string, boolean> = {};
        record.presentStudentIds.forEach(id => { state[id] = true; });
        record.absentStudentIds.forEach(id => { state[id] = false; });
        setAttendanceState(state);
      } else {
        setExistingAttendance(null);
        // Inicializa todos como presentes
        const state: Record<string, boolean> = {};
        selectedClass.studentIds.forEach(id => { state[id] = true; });
        setAttendanceState(state);
      }
    } catch (e) {
      console.error("Erro ao carregar presença:", e);
    }
  };

  const getClassStudents = (classItem: Class): Profile[] => {
    return students.filter(s => classItem.studentIds.includes(s.uid));
  };

  const toggleAttendance = (studentId: string) => {
    setAttendanceState(prev => ({
      ...prev,
      [studentId]: !prev[studentId],
    }));
  };

  const handleSaveAttendance = async () => {
    if (!selectedClass) return;

    setSaving(true);
    try {
      const presentIds = Object.entries(attendanceState)
        .filter(([_, present]) => present)
        .map(([id]) => id);
      
      const absentIds = Object.entries(attendanceState)
        .filter(([_, present]) => !present)
        .map(([id]) => id);

      await recordAttendance(selectedClass.id, selectedDate, presentIds, absentIds);
      
      Alert.alert("Sucesso", "Presença registrada com sucesso!");
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
      Alert.alert("Erro", e.message || "Não foi possível salvar a presença");
    } finally {
      setSaving(false);
    }
  };

  // Carrega todos os registros de presença da turma
  const loadAllAttendance = async () => {
    if (!selectedClass) return;
    try {
      const records = await fetchAttendance(selectedClass.id);
      setAllAttendanceRecords(records);
    } catch (e) {
      console.error("Erro ao carregar histórico de presença:", e);
    }
  };

  // Carrega histórico quando muda a turma
  useEffect(() => {
    if (selectedClass) {
      loadAllAttendance();
    }
  }, [selectedClass]);

  // Estatísticas gerais
  const totalClasses = allAttendanceRecords.length;
  const totalPresences = allAttendanceRecords.reduce((acc, r) => acc + r.presentStudentIds.length, 0);
  const totalAbsences = allAttendanceRecords.reduce((acc, r) => acc + r.absentStudentIds.length, 0);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T12:00:00");
    const dayOfWeek = DAYS_OF_WEEK[date.getDay()];
    return `${dayOfWeek}, ${date.toLocaleDateString("pt-BR")}`;
  };

  // Navega para próxima/anterior data válida da turma
  const changeDate = (direction: number) => {
    if (!selectedClass || !selectedClass.schedule || selectedClass.schedule.length === 0) {
      const current = new Date(selectedDate + "T12:00:00");
      current.setDate(current.getDate() + direction);
      setSelectedDate(current.toISOString().split("T")[0]);
      return;
    }

    const validDays = selectedClass.schedule.map(s => s.dayOfWeek);
    const current = new Date(selectedDate + "T12:00:00");
    
    // Procura o próximo dia válido na direção especificada
    for (let i = 1; i <= 14; i++) {
      const nextDate = new Date(current);
      nextDate.setDate(current.getDate() + (direction * i));
      if (validDays.includes(nextDate.getDay())) {
        setSelectedDate(nextDate.toISOString().split("T")[0]);
        return;
      }
    }
  };

  const classStudents = selectedClass ? getClassStudents(selectedClass) : [];
  const presentCount = Object.values(attendanceState).filter(v => v).length;
  const absentCount = Object.values(attendanceState).filter(v => !v).length;

  if (loading) {
    return (
      <View style={styles.screen}>
        <CdmfHeader />
        <SectionHeader title="Controle de Presença" />
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
        <SectionHeader title="Controle de Presença" />
        <View style={styles.emptyContainer}>
          <FontAwesome5 name="clipboard-list" size={48} color="#ccc" />
          <Text style={styles.emptyText}>Você não tem turmas atribuídas</Text>
          <Text style={styles.emptySubtext}>
            Peça ao administrador para atribuir turmas a você
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CdmfHeader />
      <SectionHeader title="Controle de Presença" />

      {/* Seletor de Turma */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.classSelector}>
        {classes.map(classItem => (
          <Pressable
            key={classItem.id}
            style={[
              styles.classTab,
              selectedClass?.id === classItem.id && styles.classTabSelected,
            ]}
            onPress={() => {
              setSelectedClass(classItem);
              // Encontra a próxima data válida para a nova turma
              const nextDate = findNextValidDate(classItem, new Date(selectedDate + "T12:00:00"));
              setSelectedDate(nextDate);
            }}
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

      {/* Seletor de Data */}
      <View style={styles.dateSelector}>
        <Pressable style={styles.dateArrow} onPress={() => changeDate(-1)}>
          <Ionicons name="chevron-back" size={24} color={colors.purple} />
        </Pressable>
        <View style={styles.dateInfo}>
          <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
          {existingAttendance && (
            <View style={styles.savedBadge}>
              <Ionicons name="checkmark" size={12} color="#fff" />
              <Text style={styles.savedBadgeText}>Salvo</Text>
            </View>
          )}
        </View>
        <Pressable style={styles.dateArrow} onPress={() => changeDate(1)}>
          <Ionicons name="chevron-forward" size={24} color={colors.purple} />
        </Pressable>
      </View>

      {/* Estatísticas do dia */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: "#E8F5E9" }]}>
          <Ionicons name="checkmark-circle" size={20} color={colors.green} />
          <Text style={[styles.statNumber, { color: colors.green }]}>{presentCount}</Text>
          <Text style={styles.statLabel}>Presentes</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: "#FFEBEE" }]}>
          <Ionicons name="close-circle" size={20} color={colors.danger} />
          <Text style={[styles.statNumber, { color: colors.danger }]}>{absentCount}</Text>
          <Text style={styles.statLabel}>Ausentes</Text>
        </View>
      </View>

      {/* Estatísticas gerais */}
      <View style={styles.generalStatsRow}>
        <View style={styles.generalStatItem}>
          <Text style={styles.generalStatNumber}>{totalClasses}</Text>
          <Text style={styles.generalStatLabel}>Aulas registradas</Text>
        </View>
        <View style={styles.generalStatDivider} />
        <View style={styles.generalStatItem}>
          <Text style={styles.generalStatNumber}>{totalPresences}</Text>
          <Text style={styles.generalStatLabel}>Presenças totais</Text>
        </View>
        <View style={styles.generalStatDivider} />
        <View style={styles.generalStatItem}>
          <Text style={styles.generalStatNumber}>{totalAbsences}</Text>
          <Text style={styles.generalStatLabel}>Faltas totais</Text>
        </View>
      </View>

      {/* Lista de Alunos */}
      <ScrollView style={styles.studentsList} contentContainerStyle={styles.studentsListContent}>
        {classStudents.length === 0 ? (
          <View style={styles.noStudentsContainer}>
            <FontAwesome5 name="user-graduate" size={32} color="#ccc" />
            <Text style={styles.noStudentsText}>Nenhum aluno nesta turma</Text>
          </View>
        ) : (
          classStudents.map(student => {
            const isPresent = attendanceState[student.uid] ?? true;
            return (
              <Pressable
                key={student.uid}
                style={[
                  styles.studentRow,
                  isPresent ? styles.studentPresent : styles.studentAbsent,
                ]}
                onPress={() => toggleAttendance(student.uid)}
              >
                <View style={styles.studentInfo}>
                  <Text style={styles.studentName}>{student.name}</Text>
                </View>
                <View style={[
                  styles.attendanceToggle,
                  isPresent ? styles.togglePresent : styles.toggleAbsent,
                ]}>
                  <Ionicons
                    name={isPresent ? "checkmark" : "close"}
                    size={20}
                    color="#fff"
                  />
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* Botão Salvar */}
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
                <Ionicons name="save" size={20} color="#fff" />
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

  dateSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  dateArrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
  },
  dateInfo: {
    alignItems: "center",
  },
  dateText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  savedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.green,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
    gap: 4,
  },
  savedBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },

  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    gap: 10,
  },
  statCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
  },

  generalStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "#F5F5F5",
    marginHorizontal: 12,
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
  },
  generalStatItem: {
    alignItems: "center",
    flex: 1,
  },
  generalStatNumber: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.purple,
  },
  generalStatLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 2,
    textAlign: "center",
  },
  generalStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: "#DDD",
  },

  studentsList: {
    flex: 1,
    marginTop: 12,
  },
  studentsListContent: {
    paddingHorizontal: 12,
    paddingBottom: 12,
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
  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  studentPresent: {
    backgroundColor: "#E8F5E9",
  },
  studentAbsent: {
    backgroundColor: "#FFEBEE",
  },
  studentInfo: { flex: 1 },
  studentName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  attendanceToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  togglePresent: {
    backgroundColor: colors.green,
  },
  toggleAbsent: {
    backgroundColor: colors.danger,
  },

  footer: {
    padding: 12,
    paddingBottom: 20,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.purple,
    paddingVertical: 16,
    borderRadius: 14,
    gap: 10,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
  },
});

