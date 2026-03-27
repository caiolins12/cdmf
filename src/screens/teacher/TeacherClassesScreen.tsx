import React, { useState, useCallback } from "react";
import {
  View, StyleSheet, ScrollView, Pressable, Text,
  RefreshControl, ActivityIndicator,
} from "react-native";
import { Ionicons, FontAwesome5 } from "@/shims/icons";
import { useFocusEffect } from "@react-navigation/native";

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
      const myClasses = classesData.filter(
        (c) => c.teacherId === profile?.uid && c.active
      );
      setClasses(myClasses);
      setStudents(studentsData);
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
    } finally {
      setLoading(false);
    }
  }, [fetchClasses, fetchStudents, profile]);

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

  const getClassStudents = (classItem: Class): Profile[] =>
    students.filter((s) => classItem.studentIds?.includes(s.uid));

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.innerHeader}>
          <Text style={styles.innerHeaderTitle}>Minhas Turmas</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.purple} />
          <Text style={styles.loadingText}>Carregando...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.innerHeader}>
        <Text style={styles.innerHeaderTitle}>Minhas Turmas</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{classes.length}</Text>
        </View>
      </View>

      {classes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconBox}>
            <FontAwesome5 name="users" size={32} color="#94A3B8" />
          </View>
          <Text style={styles.emptyTitle}>Nenhuma turma atribuída</Text>
          <Text style={styles.emptySubtext}>
            Peça ao administrador para atribuir turmas a você
          </Text>
        </View>
      ) : (
        <ScrollView
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
          {classes.map((classItem) => {
            const classStudents = getClassStudents(classItem);
            const schedule = classItem.schedule?.[0];
            const isExpanded = expandedClass === classItem.id;

            return (
              <Pressable
                key={classItem.id}
                style={[styles.classCard, isExpanded && styles.classCardExpanded]}
                onPress={() =>
                  setExpandedClass(isExpanded ? null : classItem.id)
                }
              >
                {/* Card Header */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardIconBox}>
                    <FontAwesome5 name="users" size={18} color={colors.purple} />
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.className}>{classItem.name}</Text>
                    <View style={styles.tagRow}>
                      {schedule && (
                        <>
                          <View style={styles.tag}>
                            <Ionicons name="calendar-outline" size={11} color={colors.purple} />
                            <Text style={styles.tagText}>
                              {DAYS_SHORT[schedule.dayOfWeek]}
                            </Text>
                          </View>
                          <View style={styles.tag}>
                            <Ionicons name="time-outline" size={11} color={colors.purple} />
                            <Text style={styles.tagText}>{schedule.startTime}h</Text>
                          </View>
                        </>
                      )}
                      <View style={[styles.tag, styles.tagStudents]}>
                        <Ionicons name="people-outline" size={11} color="#0891B2" />
                        <Text style={[styles.tagText, { color: "#0891B2" }]}>
                          {classStudents.length} alunos
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Ionicons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={18}
                    color="#94A3B8"
                  />
                </View>

                {/* Expanded Details */}
                {isExpanded && (
                  <View style={styles.cardBody}>
                    <View style={styles.detailsGrid}>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailItemLabel}>DIA</Text>
                        <Text style={styles.detailItemValue}>
                          {schedule
                            ? DAYS_OF_WEEK[schedule.dayOfWeek]
                            : "—"}
                        </Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailItemLabel}>HORÁRIO</Text>
                        <Text style={styles.detailItemValue}>
                          {schedule
                            ? `${schedule.startTime} – ${schedule.endTime}`
                            : "—"}
                        </Text>
                      </View>
                      <View style={styles.detailItem}>
                        <Text style={styles.detailItemLabel}>ALUNOS</Text>
                        <Text style={styles.detailItemValue}>
                          {classStudents.length}
                        </Text>
                      </View>
                    </View>

                    {classStudents.length > 0 && (
                      <View style={styles.studentsList}>
                        <Text style={styles.studentsListTitle}>ALUNOS MATRICULADOS</Text>
                        {classStudents.map((student, idx) => (
                          <View
                            key={student.uid}
                            style={[
                              styles.studentRow,
                              idx < classStudents.length - 1 && styles.studentRowBorder,
                            ]}
                          >
                            <View style={styles.studentAvatar}>
                              <Text style={styles.studentAvatarText}>
                                {(student.name || "?")[0].toUpperCase()}
                              </Text>
                            </View>
                            <View style={styles.studentInfo}>
                              <Text style={styles.studentName}>{student.name}</Text>
                              {student.phone && (
                                <Text style={styles.studentPhone}>{student.phone}</Text>
                              )}
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </Pressable>
            );
          })}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },

  // Inner section header (not top nav)
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
  countBadge: {
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.purple,
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

  listContent: {
    padding: 16,
  },

  classCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 12,
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
    overflow: "hidden",
  },
  classCardExpanded: {
    borderColor: colors.purple + "40",
  },

  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  cardIconBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: { flex: 1 },
  className: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1E293B",
    marginBottom: 6,
  },
  tagRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "nowrap",
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagStudents: {
    backgroundColor: "#CFFAFE",
  },
  tagText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.purple,
    flexShrink: 1,
  },

  cardBody: {
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    padding: 16,
    paddingTop: 14,
  },

  detailsGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  detailItem: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
  },
  detailItemLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  detailItemValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
    textAlign: "center",
  },

  studentsList: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  studentsListTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  studentRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  studentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
  },
  studentAvatarText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.purple,
  },
  studentInfo: { flex: 1 },
  studentName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E293B",
  },
  studentPhone: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 1,
  },
});
