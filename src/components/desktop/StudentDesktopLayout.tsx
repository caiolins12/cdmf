import React, { lazy, Suspense, useState, useCallback, createContext, useContext } from "react";
import { View, Text, Pressable, StyleSheet, Platform, ActivityIndicator, Image, ScrollView } from "react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";

// Contexto para navegação no desktop do estudante
type StudentDesktopTab = "inicio" | "aulas" | "pagamentos" | "conta";
interface StudentDesktopNavContextType {
  activeTab: StudentDesktopTab;
  setActiveTab: (tab: StudentDesktopTab) => void;
}
const StudentDesktopNavContext = createContext<StudentDesktopNavContextType | null>(null);
export function useStudentDesktopNav() {
  return useContext(StudentDesktopNavContext);
}

// Lazy loading das telas
const StudentHomeScreen = lazy(() => import("../../screens/student/StudentHomeScreen"));
const StudentClassesScreen = lazy(() => import("../../screens/student/StudentClassesScreen"));
const StudentPaymentsScreen = lazy(() => import("../../screens/student/StudentPaymentsScreen"));
const StudentAccountScreen = lazy(() => import("../../screens/student/StudentAccountScreen"));

type StudentTab = "inicio" | "aulas" | "pagamentos" | "conta";

interface NavItem {
  id: StudentTab;
  label: string;
  icon: React.ReactNode;
  iconActive: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "inicio",
    label: "Início",
    icon: <Ionicons name="home-outline" size={18} color="#94A3B8" />,
    iconActive: <Ionicons name="home" size={18} color="#7C3AED" />,
  },
  {
    id: "aulas",
    label: "Minhas Aulas",
    icon: <Ionicons name="calendar-outline" size={18} color="#94A3B8" />,
    iconActive: <Ionicons name="calendar" size={18} color="#7C3AED" />,
  },
  {
    id: "pagamentos",
    label: "Pagamentos",
    icon: <Ionicons name="card-outline" size={18} color="#94A3B8" />,
    iconActive: <Ionicons name="card" size={18} color="#7C3AED" />,
  },
  {
    id: "conta",
    label: "Minha Conta",
    icon: <Ionicons name="person-outline" size={18} color="#94A3B8" />,
    iconActive: <Ionicons name="person" size={18} color="#7C3AED" />,
  },
];

const TAB_TITLES: Record<StudentTab, { title: string; subtitle?: string }> = {
  inicio: { title: "Início", subtitle: "Bem-vindo ao CDMF" },
  aulas: { title: "Minhas Aulas", subtitle: "Suas turmas e horários" },
  pagamentos: { title: "Pagamentos", subtitle: "Histórico e pendências" },
  conta: { title: "Minha Conta", subtitle: "Configurações do perfil" },
};

function ScreenLoader() {
  const { colors: themeColors } = useTheme();
  return (
    <View style={[styles.loader, { backgroundColor: themeColors.bg }]}>
      <ActivityIndicator size="large" color={themeColors.purple} />
    </View>
  );
}

export default function StudentDesktopLayout() {
  const { signOut, profile, user } = useAuth();
  const { colors: themeColors, isDark, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<StudentTab>("inicio");

  const getUserName = useCallback(() => {
    if (profile?.name) {
      return profile.name.split(" ")[0];
    }
    if (user?.displayName) {
      return user.displayName.split(" ")[0];
    }
    return "Aluno";
  }, [profile, user]);

  // Foto do Google ou placeholder
  const photoURL = user?.photoURL || null;

  const renderContent = () => {
    switch (activeTab) {
      case "inicio":
        return <StudentHomeScreen />;
      case "aulas":
        return <StudentClassesScreen />;
      case "pagamentos":
        return <StudentPaymentsScreen />;
      case "conta":
        return <StudentAccountScreen />;
      default:
        return <StudentHomeScreen />;
    }
  };

  const tabInfo = TAB_TITLES[activeTab];
  const userName = getUserName();
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? "Bom dia" : currentHour < 18 ? "Boa tarde" : "Boa noite";

  // Valor do contexto de navegação
  const navContextValue = { activeTab, setActiveTab };

  return (
    <StudentDesktopNavContext.Provider value={navContextValue}>
    <View style={[styles.container, { backgroundColor: themeColors.bg }]}>
      {/* Sidebar */}
      <View style={[styles.sidebar, { backgroundColor: themeColors.bgSidebar, borderRightColor: themeColors.border }]}>
        {/* Logo */}
        <View style={styles.logoSection}>
          <Image
            source={require("../../../assets/cdmf-logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* User Card */}
        <View style={[styles.userCard, { backgroundColor: themeColors.bgSecondary }]}>
          {photoURL ? (
            <Image source={{ uri: photoURL }} style={styles.userAvatarImage} />
          ) : (
            <View style={styles.userAvatar}>
              <Ionicons name="person" size={20} color="#fff" />
            </View>
          )}
          <View style={styles.userInfo}>
            <Text style={[styles.userName, { color: themeColors.text }]} numberOfLines={1}>{userName}</Text>
            <View style={[styles.studentBadge, { backgroundColor: isDark ? "#14532D" : "#DCFCE7" }]}>
              <Text style={[styles.studentBadgeText, { color: isDark ? "#86EFAC" : "#16A34A" }]}>Aluno</Text>
            </View>
          </View>
        </View>

        {/* Navigation */}
        <View style={styles.navSection}>
          <Text style={[styles.navLabel, { color: themeColors.textMuted }]}>MENU</Text>
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <Pressable
                key={item.id}
                style={[
                  styles.navItem, 
                  isActive && [styles.navItemActive, { backgroundColor: themeColors.purpleLight }]
                ]}
                onPress={() => setActiveTab(item.id)}
              >
                <View style={styles.navIconBox}>
                  {isActive ? item.iconActive : (
                    <Ionicons 
                      name={item.id === "inicio" ? "home-outline" : 
                            item.id === "aulas" ? "calendar-outline" : 
                            item.id === "pagamentos" ? "card-outline" : "person-outline"} 
                      size={18} 
                      color={themeColors.textMuted} 
                    />
                  )}
                </View>
                <Text style={[
                  styles.navItemText, 
                  { color: themeColors.textSecondary },
                  isActive && styles.navItemTextActive
                ]}>
                  {item.label}
                </Text>
                {isActive && <View style={[styles.activeBar, { backgroundColor: themeColors.purple }]} />}
              </Pressable>
            );
          })}
        </View>

        {/* Footer */}
        <View style={styles.sidebarFooter}>
          <View style={[styles.footerDivider, { backgroundColor: themeColors.border }]} />
          <Pressable style={styles.signOutBtn} onPress={signOut}>
            <Ionicons name="log-out-outline" size={18} color={themeColors.textMuted} />
            <Text style={[styles.signOutText, { color: themeColors.textSecondary }]}>Sair</Text>
          </Pressable>
          <Text style={[styles.version, { color: themeColors.textMuted }]}>v1.0.0</Text>
        </View>
      </View>

      {/* Main Content */}
      <View style={[styles.mainArea, { backgroundColor: themeColors.bg }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: themeColors.bgHeader, borderBottomColor: themeColors.border }]}>
          <View>
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>{tabInfo.title}</Text>
            {tabInfo.subtitle && <Text style={[styles.headerSubtitle, { color: themeColors.textMuted }]}>{tabInfo.subtitle}</Text>}
          </View>
          <View style={styles.headerRight}>
            {/* Theme Toggle */}
            <Pressable 
              style={[styles.headerIconBtn, isDark && { backgroundColor: themeColors.bgHover }]} 
              onPress={toggleTheme}
            >
              <Ionicons 
                name={isDark ? "sunny" : "moon"} 
                size={20} 
                color={isDark ? "#FBBF24" : "#475569"} 
              />
            </Pressable>
            <Pressable style={[styles.headerIconBtn, isDark && { backgroundColor: themeColors.bgHover }]}>
              <Ionicons name="notifications-outline" size={20} color={isDark ? themeColors.textSecondary : "#475569"} />
            </Pressable>
            <View style={[styles.headerUserBtn, isDark && { backgroundColor: themeColors.bgHover }]}>
              {photoURL ? (
                <Image source={{ uri: photoURL }} style={styles.headerUserAvatarImage} />
              ) : (
                <View style={styles.headerUserAvatar}>
                  <Ionicons name="person" size={14} color="#fff" />
                </View>
              )}
              <Text style={[styles.headerUserName, isDark && { color: themeColors.text }]}>{userName}</Text>
            </View>
          </View>
        </View>

        {/* Content */}
        <View style={[styles.content, { backgroundColor: themeColors.bg }]}>
          <Suspense fallback={<ScreenLoader />}>
            {renderContent()}
          </Suspense>
        </View>
      </View>
    </View>
    </StudentDesktopNavContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#F8FAFC",
    ...(Platform.OS === "web" && {
      height: "100vh" as any,
      width: "100vw" as any,
      overflow: "hidden" as any,
    }),
  },

  // Sidebar
  sidebar: {
    width: 240,
    height: "100%",
    backgroundColor: "#FFFFFF",
    borderRightWidth: 1,
    borderRightColor: "#E2E8F0",
    paddingTop: 20,
  },
  logoSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  logo: {
    width: 220,
    height: 75,
  },

  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 12,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    marginBottom: 24,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#7C3AED",
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 4,
  },
  studentBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#DCFCE7",
  },
  studentBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#16A34A",
  },

  navSection: {
    flex: 1,
    paddingHorizontal: 12,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
    letterSpacing: 0.5,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 2,
    position: "relative",
  },
  navItemActive: {
    backgroundColor: "#F5F3FF",
  },
  navIconBox: {
    width: 28,
    alignItems: "center",
  },
  navItemText: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "500",
  },
  navItemTextActive: {
    color: "#7C3AED",
    fontWeight: "600",
  },
  activeBar: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    backgroundColor: "#7C3AED",
    borderRadius: 2,
  },

  sidebarFooter: {
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  footerDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginBottom: 16,
    marginHorizontal: 8,
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  signOutText: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "500",
  },
  version: {
    fontSize: 11,
    color: "#CBD5E1",
    textAlign: "center",
    marginTop: 12,
  },

  // Main Area
  mainArea: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: "#F8FAFC",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 32,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#1E293B",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#94A3B8",
    marginTop: 2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  headerUserBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 6,
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
  },
  headerUserAvatar: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#7C3AED",
    alignItems: "center",
    justifyContent: "center",
  },
  headerUserAvatarImage: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  headerUserName: {
    fontSize: 13,
    fontWeight: "500",
    color: "#475569",
  },

  content: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    ...(Platform.OS === "web" && {
      overflow: "auto" as any,
    }),
  },

  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
});

