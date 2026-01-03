import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, RefreshControl } from "react-native";
import { useAuth } from "../../contexts/AuthContext";
import { colors } from "../../theme/colors";
import CdmfHeader from "../../components/CdmfHeader";
import TileButton from "../../components/TileButton";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

export default function TeacherHomeScreen() {
  const { signOut, profile, user, fetchStudents } = useAuth();
  const navigation = useNavigation<any>();
  
  const [studentsCount, setStudentsCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = async () => {
    try {
      const students = await fetchStudents();
      setStudentsCount(students.length);
    } catch (e) {
      console.error("Erro ao carregar estatísticas:", e);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  const getFirstName = () => {
    if (profile?.name) {
      return profile.name.split(" ")[0];
    }
    if (user?.displayName) {
      return user.displayName.split(" ")[0];
    }
    return "Professor";
  };

  const userName = getFirstName();

  return (
    <View style={styles.screen}>
      <CdmfHeader title={`Olá, ${userName}`} />

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.purple]} />
        }
      >
        {/* Badge Professor */}
        <View style={styles.teacherBadge}>
          <FontAwesome5 name="chalkboard-teacher" size={14} color="#fff" />
          <Text style={styles.teacherBadgeText}>PROFESSOR</Text>
          {profile?.teacherCode && (
            <View style={styles.codeContainer}>
              <Text style={styles.codeText}>Código: {profile.teacherCode}</Text>
            </View>
          )}
        </View>

        {/* Estatísticas */}
        <View style={styles.statsRow}>
          <Pressable style={styles.statCard} onPress={() => navigation.navigate("Alunos")}>
            <FontAwesome5 name="user-graduate" size={24} color={colors.purple} />
            <Text style={styles.statNumber}>{studentsCount}</Text>
            <Text style={styles.statLabel}>Alunos</Text>
          </Pressable>
          <Pressable style={styles.statCard} onPress={() => navigation.navigate("Turmas")}>
            <FontAwesome5 name="users" size={24} color={colors.purple} />
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Turmas</Text>
          </Pressable>
        </View>

        <View style={styles.sectionTitleBox}>
          <Text style={styles.sectionTitle}>MENU RÁPIDO</Text>
        </View>

        <View style={styles.grid}>
          <View style={styles.row}>
            <TileButton
              label={"CONTROLE DE\nPRESENÇA"}
              icon={<Ionicons name="clipboard" size={36} color="#111" />}
              onPress={() => navigation.navigate("Presenca")}
            />
            <View style={{ width: 14 }} />
            <TileButton
              label="MEUS ALUNOS"
              icon={<FontAwesome5 name="user-graduate" size={32} color="#111" />}
              onPress={() => navigation.navigate("Alunos")}
            />
          </View>

          <View style={{ height: 14 }} />

          <View style={styles.row}>
            <TileButton
              label="TURMAS"
              icon={<FontAwesome5 name="users" size={32} color="#111" />}
              onPress={() => navigation.navigate("Turmas")}
            />
            <View style={{ width: 14 }} />
            <TileButton
              label={"MINHA\nCONTA"}
              icon={<FontAwesome5 name="user-cog" size={32} color="#111" />}
              onPress={() => {}}
            />
          </View>
        </View>

        <Text style={styles.version}>Versão do APP: v1.0.0</Text>

        <Pressable onPress={signOut} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.logout}>Sair da Conta</Text>
        </Pressable>

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  
  teacherBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4CAF50",
    paddingVertical: 10,
    gap: 8,
    flexWrap: "wrap",
  },
  teacherBadgeText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 1,
  },
  codeContainer: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  codeText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 11,
  },

  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
    maxWidth: 400,
  },
  statCard: {
    minWidth: 140,
    maxWidth: 180,
    backgroundColor: "#F5F5F5",
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  statNumber: {
    fontSize: 28,
    fontWeight: "900",
    color: colors.text,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
    marginTop: 2,
  },

  sectionTitleBox: {
    backgroundColor: "#E6E6E6",
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 16,
  },
  sectionTitle: { fontWeight: "900", color: colors.text },
  
  grid: { padding: 16, paddingTop: 18, maxWidth: 500 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  
  version: { textAlign: "center", color: colors.muted, marginTop: 8 },
  
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
  },
  logout: { textAlign: "center", color: colors.danger, fontWeight: "900" },
});
