import React, { lazy, Suspense } from "react";
import { View, StyleSheet, Platform, ActivityIndicator } from "react-native";
import DesktopSidebar from "./DesktopSidebar";
import DesktopHeader from "./DesktopHeader";
import { useAuth } from "../../contexts/AuthContext";
import { DesktopNavigationProvider, useDesktopNavigation, DesktopTab } from "../../contexts/DesktopNavigationContext";

// Lazy loading das telas
const MasterHomeScreen = lazy(() => import("../../screens/master/MasterHomeScreen"));
const MasterStudentsScreen = lazy(() => import("../../screens/master/MasterStudentsScreen"));
const MasterTeachersScreen = lazy(() => import("../../screens/master/MasterTeachersScreen"));
const MasterClassesScreen = lazy(() => import("../../screens/master/MasterClassesScreen"));
const TeacherFinanceScreen = lazy(() => import("../../screens/teacher/TeacherFinanceScreen"));

interface DesktopLayoutProps {
  userRole: "master" | "teacher" | "student";
}

const TAB_TITLES: Record<DesktopTab, { title: string; subtitle?: string }> = {
  inicio: { title: "Dashboard", subtitle: "Visão geral do sistema" },
  alunos: { title: "Gestão de Alunos", subtitle: "Cadastros e matrículas" },
  professores: { title: "Professores", subtitle: "Equipe docente" },
  turmas: { title: "Turmas", subtitle: "Horários e frequência" },
  financeiro: { title: "Financeiro", subtitle: "Pagamentos e receitas" },
};

function ScreenLoader() {
  return (
    <View style={styles.loader}>
      <ActivityIndicator size="large" color="#7C3AED" />
    </View>
  );
}

function DesktopLayoutContent({ userRole }: DesktopLayoutProps) {
  const { signOut, profile, user } = useAuth();
  const desktopNav = useDesktopNavigation();
  const activeTab = desktopNav?.activeTab || "inicio";

  const handleTabChange = (tab: DesktopTab) => {
    desktopNav?.setActiveTab(tab);
  };

  const getUserName = () => {
    if (profile?.name) {
      if (profile.name === "Administrador") return "Admin";
      return profile.name.split(" ")[0];
    }
    if (user?.displayName) {
      return user.displayName.split(" ")[0];
    }
    return "Usuário";
  };

  const renderContent = () => {
    switch (activeTab) {
      case "inicio":
        return <MasterHomeScreen />;
      case "alunos":
        return <MasterStudentsScreen />;
      case "professores":
        return <MasterTeachersScreen />;
      case "turmas":
        return <MasterClassesScreen />;
      case "financeiro":
        return <TeacherFinanceScreen />;
      default:
        return <MasterHomeScreen />;
    }
  };

  const tabInfo = TAB_TITLES[activeTab];

  return (
    <View style={styles.container}>
      <DesktopSidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        userRole={userRole}
        userName={getUserName()}
        onSignOut={signOut}
      />

      <View style={styles.mainArea}>
        <DesktopHeader
          title={tabInfo.title}
          subtitle={tabInfo.subtitle}
          userName={getUserName()}
        />

        <View style={styles.content}>
          <Suspense fallback={<ScreenLoader />}>
            {renderContent()}
          </Suspense>
        </View>
      </View>
    </View>
  );
}

export default function DesktopLayout({ userRole }: DesktopLayoutProps) {
  return (
    <DesktopNavigationProvider>
      <DesktopLayoutContent userRole={userRole} />
    </DesktopNavigationProvider>
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
  mainArea: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: "#F8FAFC",
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
