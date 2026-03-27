import React, { useState, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  RefreshControl, ActivityIndicator, Animated,
} from "react-native";
import { Ionicons, FontAwesome5 } from "@/shims/icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";

import { useAuth } from "../../contexts/AuthContext";
import { colors } from "../../theme/colors";
import NotificationBell from "../../components/NotificationBell";

export default function TeacherHomeScreen() {
  const { profile, user, fetchStudents, fetchClasses, logout } = useAuth();
  const navigation = useNavigation<any>();

  const [studentsCount, setStudentsCount] = useState(0);
  const [classesCount, setClassesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;

  const toggleMenu = () => {
    const toValue = menuOpen ? 0 : 1;
    setMenuOpen(!menuOpen);
    Animated.spring(menuAnim, {
      toValue,
      useNativeDriver: false,
      speed: 20,
      bounciness: 4,
    }).start();
  };

  const handleLogout = async () => {
    setMenuOpen(false);
    menuAnim.setValue(0);
    await logout();
  };

  const getFirstName = () => {
    const name = profile?.name || user?.displayName;
    return name ? name.split(" ")[0] : "Professor";
  };

  const currentHour = new Date().getHours();
  const greeting =
    currentHour < 12 ? "Bom dia" : currentHour < 18 ? "Boa tarde" : "Boa noite";

  const loadStats = useCallback(async () => {
    try {
      const [studentsData, classesData] = await Promise.all([
        fetchStudents(),
        fetchClasses(),
      ]);
      setStudentsCount(studentsData.length);
      const myClasses = classesData.filter(
        (c) => c.teacherId === profile?.uid && c.active
      );
      setClassesCount(myClasses.length);
    } catch (e) {
      console.error("Erro ao carregar estatísticas:", e);
    } finally {
      setLoading(false);
    }
  }, [fetchStudents, fetchClasses, profile?.uid]);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  const navItems = [
    {
      route: "Presenca",
      title: "Controle de Presença",
      desc: "Registrar presença dos alunos",
      icon: <Ionicons name="clipboard" size={22} color="#7C3AED" />,
      iconBg: "#EDE9FE",
    },
    {
      route: "Alunos",
      title: "Meus Alunos",
      desc: "Lista de alunos matriculados",
      icon: <FontAwesome5 name="user-graduate" size={20} color="#0891B2" />,
      iconBg: "#CFFAFE",
    },
    {
      route: "Turmas",
      title: "Minhas Turmas",
      desc: "Turmas e horários",
      icon: <FontAwesome5 name="users" size={20} color="#EA580C" />,
      iconBg: "#FED7AA",
    },
    {
      route: "Relatorios",
      title: "Relatórios",
      desc: "Estatísticas de presença",
      icon: <Ionicons name="bar-chart" size={22} color="#16A34A" />,
      iconBg: "#DCFCE7",
    },
  ];

  const menuHeight = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 180],
  });
  const menuOpacity = menuAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.6, 1],
  });

  const initials = (profile?.name || user?.displayName || "P")
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.avatarBtn} onPress={toggleMenu}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Ionicons
            name={menuOpen ? "chevron-up" : "chevron-down"}
            size={14}
            color={colors.purple}
          />
        </Pressable>

        <Text style={styles.greeting} numberOfLines={1}>
          {greeting}, {getFirstName()} 👋
        </Text>

        <NotificationBell iconColor="#1E293B" size={24} />
      </View>

      {/* Dropdown menu */}
      <Animated.View style={[styles.menuPanel, { height: menuHeight, opacity: menuOpacity }]}>
        <View style={styles.menuProfile}>
          <View style={styles.menuAvatar}>
            <Text style={styles.menuAvatarText}>{initials}</Text>
          </View>
          <View style={styles.menuInfo}>
            <Text style={styles.menuName} numberOfLines={1}>{profile?.name || user?.displayName || "Professor"}</Text>
            <Text style={styles.menuEmail} numberOfLines={1}>{profile?.email || user?.email || ""}</Text>
            {profile?.teacherCode ? (
              <View style={styles.menuCodeBadge}>
                <Text style={styles.menuCodeText}>#{profile.teacherCode}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.menuDivider} />
        <Pressable style={styles.menuLogoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={styles.menuLogoutText}>Sair da conta</Text>
        </Pressable>
      </Animated.View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.purple]}
          />
        }
      >
        {/* Stats */}
        {loading ? (
          <View style={styles.statsLoadingBox}>
            <ActivityIndicator size="small" color={colors.purple} />
          </View>
        ) : (
          <View style={styles.statsGrid}>
            <Pressable
              style={styles.statCard}
              onPress={() => navigation.navigate("Alunos")}
            >
              <View style={[styles.statIcon, { backgroundColor: "#CFFAFE" }]}>
                <FontAwesome5 name="user-graduate" size={18} color="#0891B2" />
              </View>
              <Text style={styles.statValue}>{studentsCount}</Text>
              <Text style={styles.statLabel}>Alunos</Text>
            </Pressable>

            <Pressable
              style={styles.statCard}
              onPress={() => navigation.navigate("Turmas")}
            >
              <View style={[styles.statIcon, { backgroundColor: "#FED7AA" }]}>
                <FontAwesome5 name="users" size={18} color="#EA580C" />
              </View>
              <Text style={styles.statValue}>{classesCount}</Text>
              <Text style={styles.statLabel}>Turmas</Text>
            </Pressable>
          </View>
        )}

        {/* Quick Access */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Acesso Rápido</Text>
        </View>

        <View style={styles.actionsGrid}>
          {navItems.map((item) => (
            <Pressable
              key={item.route}
              style={styles.actionCard}
              onPress={() => navigation.navigate(item.route as any)}
            >
              <View style={[styles.actionIcon, { backgroundColor: item.iconBg }]}>
                {item.icon}
              </View>
              <Text style={styles.actionTitle}>{item.title}</Text>
              <Text style={styles.actionDesc}>{item.desc}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.versionBox}>
          <Text style={styles.versionText}>CDMF v1.0.0</Text>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    gap: 10,
  },
  avatarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#fff",
  },
  greeting: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
  },

  // Dropdown menu
  menuPanel: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  menuProfile: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 12,
  },
  menuAvatar: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
  },
  menuAvatarText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
  },
  menuInfo: { flex: 1 },
  menuName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
  },
  menuEmail: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  menuCodeBadge: {
    marginTop: 5,
    alignSelf: "flex-start",
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  menuCodeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.purple,
  },
  menuDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginHorizontal: 16,
  },
  menuLogoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuLogoutText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.danger,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  // Stats
  statsLoadingBox: {
    paddingVertical: 24,
    alignItems: "center",
    marginBottom: 20,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
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
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  statValue: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1E293B",
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 2,
  },

  // Section
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
  },

  // Actions
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  actionCard: {
    width: "47%",
    flexGrow: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  actionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
  },
  actionDesc: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },

  // Version
  versionBox: {
    alignItems: "center",
    paddingVertical: 8,
  },
  versionText: {
    fontSize: 11,
    color: "#CBD5E1",
    fontWeight: "600",
  },
});
