import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, ScrollView, Pressable, Text, RefreshControl, ActivityIndicator } from "react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import CdmfHeader from "../../components/CdmfHeader";
import SectionHeader from "../../components/SectionHeader";
import { colors } from "../../theme/colors";
import { useAuth, Class, Profile } from "../../contexts/AuthContext";

const DAYS_OF_WEEK = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DAYS_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

export default function TeacherClassesScreen() {
  const { profile, fetchClasses, fetchStudents } = useAuth();
  
  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [classesData, studentsData] = await Promise.all([
        fetchClasses(),
        fetchStudents(),
      ]);
      
      // Filtra apenas as turmas do professor atual
      const myClasses = classesData.filter(c => c.teacherId === profile?.uid && c.active);
      
      setClasses(myClasses);
      setStudents(studentsData);
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

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const getClassStudents = (classItem: Class): Profile[] => {
    return students.filter(s => classItem.studentIds?.includes(s.uid));
  };

  const formatClassTags = (classItem: Class): string => {
    if (!classItem.schedule || classItem.schedule.length === 0) return "";
    const schedule = classItem.schedule[0];
    const dayStr = DAYS_SHORT[schedule.dayOfWeek];
    const timeStr = schedule.startTime;
    return `${dayStr} | ${timeStr}h`;
  };

  const formatDayTime = (classItem: Class) => {
    if (!classItem.schedule || classItem.schedule.length === 0) return { day: "-", time: "-" };
    const schedule = classItem.schedule[0];
    return {
      day: DAYS_OF_WEEK[schedule.dayOfWeek],
      time: `${schedule.startTime} - ${schedule.endTime}`,
    };
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <CdmfHeader />
        <SectionHeader title="Minhas Turmas" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.purple} />
          <Text style={styles.loadingText}>Carregando...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CdmfHeader />
      <SectionHeader title="Minhas Turmas" />

      {classes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <FontAwesome5 name="users" size={48} color="#ccc" />
          <Text style={styles.emptyText}>Você não tem turmas atribuídas</Text>
          <Text style={styles.emptySubtext}>
            Peça ao administrador para atribuir turmas a você
          </Text>
        </View>
      ) : (
        <View style={styles.listContainer}>
          <ScrollView 
            contentContainerStyle={styles.listContent} 
            showsVerticalScrollIndicator
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.purple]} />
            }
          >
            {classes.map((classItem) => {
              const classStudents = getClassStudents(classItem);
              const { day, time } = formatDayTime(classItem);
              const isExpanded = expandedClass === classItem.id;
              
              return (
                <Pressable 
                  key={classItem.id} 
                  style={styles.classCard}
                  onPress={() => setExpandedClass(isExpanded ? null : classItem.id)}
                >
                  <View style={styles.classHeader}>
                    <View style={styles.classInfo}>
                      <Text style={styles.className}>{classItem.name}</Text>
                      <View style={styles.classTags}>
                        <View style={styles.classTag}>
                          <Ionicons name="calendar" size={12} color={colors.purple} />
                          <Text style={styles.classTagText}>{DAYS_SHORT[classItem.schedule?.[0]?.dayOfWeek ?? 0]}</Text>
                        </View>
                        <View style={styles.classTag}>
                          <Ionicons name="time" size={12} color={colors.purple} />
                          <Text style={styles.classTagText}>{classItem.schedule?.[0]?.startTime || "-"}h</Text>
                        </View>
                        <View style={styles.classTag}>
                          <FontAwesome5 name="user-graduate" size={10} color={colors.purple} />
                          <Text style={styles.classTagText}>{classStudents.length}</Text>
                        </View>
                      </View>
                    </View>
                    <Ionicons 
                      name={isExpanded ? "chevron-up" : "chevron-down"} 
                      size={20} 
                      color={colors.muted} 
                    />
                  </View>

                  {isExpanded && (
                    <View style={styles.classDetails}>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Dia:</Text>
                        <Text style={styles.detailValue}>{day}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Horário:</Text>
                        <Text style={styles.detailValue}>{time}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Alunos:</Text>
                        <Text style={styles.detailValue}>{classStudents.length} matriculados</Text>
                      </View>

                      {classStudents.length > 0 && (
                        <View style={styles.studentsList}>
                          <Text style={styles.studentsTitle}>Lista de Alunos:</Text>
                          {classStudents.map(student => (
                            <View key={student.uid} style={styles.studentItem}>
                              <FontAwesome5 name="user" size={12} color={colors.muted} />
                              <Text style={styles.studentName}>{student.name}</Text>
                              {student.phone && (
                                <Text style={styles.studentPhone}>📞 {student.phone}</Text>
                              )}
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </Pressable>
              );
            })}

            <View style={{ height: 10 }} />
          </ScrollView>
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
  listContent: {
    paddingBottom: 10,
  },

  classCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  classHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  classInfo: {
    flex: 1,
  },
  className: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  classTags: {
    flexDirection: "row",
    marginTop: 6,
    gap: 8,
  },
  classTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3E5F5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  classTagText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.purple,
  },

  classDetails: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#EEE",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  detailLabel: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: "600",
  },
  detailValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: "700",
  },

  studentsList: {
    marginTop: 12,
    backgroundColor: "#F5F5F5",
    borderRadius: 10,
    padding: 12,
  },
  studentsTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.muted,
    marginBottom: 10,
  },
  studentItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    gap: 8,
  },
  studentName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  studentPhone: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: "500",
  },
});
