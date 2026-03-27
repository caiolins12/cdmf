import React, { useState, useCallback } from "react";
import {
  View, StyleSheet, ScrollView, TextInput, Text,
  RefreshControl, ActivityIndicator, Pressable, Linking,
} from "react-native";
import { Ionicons, FontAwesome5 } from "@/shims/icons";
import { useFocusEffect } from "@react-navigation/native";
import { showAlert } from "../../utils/alert";

import { colors } from "../../theme/colors";
import { useAuth, Profile, Class } from "../../contexts/AuthContext";

export default function TeacherStudentsScreen() {
  const { profile, fetchStudents, fetchClasses } = useAuth();
  const [myStudents, setMyStudents] = useState<Profile[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStudents = useCallback(async () => {
    try {
      const [allStudents, allClasses] = await Promise.all([
        fetchStudents(),
        fetchClasses(),
      ]);
      const myClasses = allClasses.filter(c => c.teacherId === profile?.uid && c.active);
      const myStudentIds = new Set<string>();
      myClasses.forEach(c => c.studentIds?.forEach(id => myStudentIds.add(id)));
      setMyStudents(allStudents.filter(s => myStudentIds.has(s.uid)));
    } catch (e) {
      console.error("Erro ao carregar alunos:", e);
    } finally {
      setLoading(false);
    }
  }, [fetchStudents, fetchClasses, profile]);

  useFocusEffect(
    useCallback(() => {
      loadStudents();
    }, [loadStudents])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStudents();
    setRefreshing(false);
  };

  const filtered = myStudents.filter(
    s =>
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      (s.phone?.toLowerCase().includes(query.toLowerCase()) ?? false)
  );

  const handleContact = (student: Profile) => {
    if (!student.phone) {
      showAlert("Sem contato", "Este aluno não tem telefone cadastrado.");
      return;
    }
    showAlert("Contato do Aluno", `Nome: ${student.name}\nTelefone: ${student.phone}`, [
      { text: "Fechar", style: "cancel" },
      { text: "Ligar", onPress: () => Linking.openURL(`tel:${student.phone}`) },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.innerHeader}>
          <Text style={styles.innerHeaderTitle}>Meus Alunos</Text>
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
      {/* Header */}
      <View style={styles.innerHeader}>
        <Text style={styles.innerHeaderTitle}>Meus Alunos</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{myStudents.length}</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#94A3B8" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar aluno..."
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Info banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle-outline" size={16} color={colors.purple} />
        <Text style={styles.infoBannerText}>Exibindo apenas os alunos das suas turmas</Text>
      </View>

      {myStudents.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconBox}>
            <FontAwesome5 name="user-graduate" size={32} color="#94A3B8" />
          </View>
          <Text style={styles.emptyTitle}>Nenhum aluno encontrado</Text>
          <Text style={styles.emptySubtext}>
            Você ainda não tem alunos matriculados nas suas turmas
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.purple]} />
          }
        >
          {query.length > 0 && (
            <Text style={styles.resultCount}>
              {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
            </Text>
          )}

          {filtered.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconBox}>
                <Ionicons name="search-outline" size={32} color="#94A3B8" />
              </View>
              <Text style={styles.emptyTitle}>Nenhum aluno encontrado</Text>
              <Text style={styles.emptySubtext}>Tente outro termo de busca</Text>
            </View>
          ) : (
            filtered.map((student, idx) => (
              <View
                key={student.uid}
                style={[styles.studentCard, idx < filtered.length - 1 && styles.studentCardBorder]}
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
                  {student.email && (
                    <Text style={styles.studentEmail}>{student.email}</Text>
                  )}
                </View>
                {student.phone && (
                  <Pressable
                    style={styles.contactBtn}
                    onPress={() => handleContact(student)}
                    hitSlop={6}
                  >
                    <Ionicons name="call-outline" size={18} color={colors.purple} />
                  </Pressable>
                )}
              </View>
            ))
          )}
          <View style={{ height: 24 }} />
        </ScrollView>
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

  searchWrap: {
    padding: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#1E293B",
  },

  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EDE9FE",
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: colors.purple,
  },

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

  resultCount: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 12,
  },

  listContent: {
    padding: 16,
  },

  studentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  studentCardBorder: {
    // kept for potential use
  },
  studentAvatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
  },
  studentAvatarText: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.purple,
  },
  studentInfo: { flex: 1 },
  studentName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
  },
  studentPhone: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  studentEmail: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 1,
  },
  contactBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
  },
});
