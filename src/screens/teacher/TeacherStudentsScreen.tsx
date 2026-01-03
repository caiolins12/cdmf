import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, ScrollView, TextInput, Text, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import CdmfHeader from "../../components/CdmfHeader";
import SectionHeader from "../../components/SectionHeader";
import PersonAccordionCard from "../../components/PersonAccordionCard";
import { colors } from "../../theme/colors";
import { useAuth, Profile, Class } from "../../contexts/AuthContext";

export default function TeacherStudentsScreen() {
  const { profile, fetchStudents, fetchClasses } = useAuth();
  const [students, setStudents] = useState<Profile[]>([]);
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
      
      // Filtra apenas as turmas do professor atual
      const myClasses = allClasses.filter(c => c.teacherId === profile?.uid && c.active);
      
      // Pega todos os IDs de alunos das turmas do professor
      const myStudentIds = new Set<string>();
      myClasses.forEach(c => {
        c.studentIds?.forEach(id => myStudentIds.add(id));
      });
      
      // Filtra apenas os alunos das turmas do professor
      const filteredStudents = allStudents.filter(s => myStudentIds.has(s.uid));
      
      setStudents(allStudents);
      setMyStudents(filteredStudents);
    } catch (e) {
      console.error("Erro ao carregar alunos:", e);
    } finally {
      setLoading(false);
    }
  }, [fetchStudents, fetchClasses, profile]);

  // Recarrega quando a tela ganha foco
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

  const filteredStudents = myStudents.filter((s) =>
    s.name.toLowerCase().includes(query.toLowerCase()) ||
    (s.phone?.toLowerCase().includes(query.toLowerCase()) ?? false)
  );

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("pt-BR");
  };

  return (
    <View style={styles.screen}>
      <CdmfHeader />
      <SectionHeader title="Meus Alunos" />

      <View style={styles.searchBox}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#777" style={styles.searchIcon} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar aluno..."
            placeholderTextColor="#777"
            style={styles.search}
          />
        </View>
      </View>

      <View style={styles.infoCard}>
        <Ionicons name="information-circle" size={20} color={colors.purple} />
        <Text style={styles.infoText}>
          Exibindo apenas os alunos das suas turmas.
        </Text>
      </View>

      <View style={styles.listContainer}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Carregando alunos...</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.purple]} />
            }
          >
            <Text style={styles.countText}>{filteredStudents.length} aluno(s) encontrado(s)</Text>
            
            {filteredStudents.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="people-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>
                  {query ? "Nenhum aluno encontrado" : "Nenhum aluno cadastrado"}
                </Text>
              </View>
            ) : (
              filteredStudents.map((student) => (
                <View key={student.uid} style={{ marginBottom: 10 }}>
                  <PersonAccordionCard
                    name={student.name || "Sem nome"}
                    typeLabel="ALUNO"
                    subtitle={student.email}
                    phone={student.phone}
                    extraInfo={`Desde: ${formatDate(student.createdAt)}`}
                    actions={[
                      { 
                        label: "CONTATO", 
                        onPress: () => {
                          if (student.phone) {
                            Alert.alert(
                              "Contato do Aluno",
                              `Nome: ${student.name}\nTelefone: ${student.phone}`,
                              [
                                { text: "Fechar", style: "cancel" },
                                { 
                                  text: "Ligar", 
                                  onPress: () => {
                                    const phoneUrl = `tel:${student.phone}`;
                                    import("react-native").then(({ Linking }) => {
                                      Linking.openURL(phoneUrl);
                                    });
                                  }
                                },
                              ]
                            );
                          } else {
                            Alert.alert("Sem contato", "Este aluno não tem telefone cadastrado.");
                          }
                        }
                      },
                    ]}
                  />
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
  searchIcon: {
    marginRight: 8,
  },
  search: {
    flex: 1,
    paddingVertical: 12,
    fontWeight: "600",
    color: colors.text,
    fontSize: 15,
  },

  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3E5F5",
    marginHorizontal: 12,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: colors.purple,
    fontWeight: "500",
  },

  countText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 10,
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
  listContent: { paddingBottom: 10 },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
});

