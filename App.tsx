import React, { useContext, useState, useEffect, useMemo, useCallback, memo, lazy, Suspense } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { View, Text, ActivityIndicator, Platform, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, AuthContext } from "./src/contexts/AuthContext";
import { DesktopProvider } from "./src/contexts/DesktopContext";
import { ThemeProvider } from "./src/contexts/ThemeContext";

const isWeb = Platform.OS === "web";

// Lazy loading dos stacks de navegação para reduzir bundle inicial
const AuthStack = lazy(() => import("./src/navigation/AuthStack"));
const MasterTabs = lazy(() => import("./src/navigation/MasterTabs"));
const TeacherTabs = lazy(() => import("./src/navigation/TeacherTabs"));
const StudentRootStack = lazy(() => import("./src/navigation/StudentRootStack"));

// Linking config para navegação web (memoizado para evitar recriação)
const linking = {
  prefixes: ["https://cdmf.app", "cdmf://"],
  config: {
    screens: {},
  },
};

// Loading component otimizado com memo
const LoadingView = memo(function LoadingView() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#9C27B0" />
      <Text style={styles.loadingText}>Carregando...</Text>
    </View>
  );
});

// Fallback para Suspense
const SuspenseFallback = memo(function SuspenseFallback() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="small" color="#9C27B0" />
    </View>
  );
});

// Routes component otimizado
const Routes = memo(function Routes() {
  const { user, profile, loading } = useContext(AuthContext);
  const [showSplash, setShowSplash] = useState(!isWeb);
  const [SplashComponent, setSplashComponent] = useState<React.ComponentType<any> | null>(null);

  // Carrega SplashScreen apenas no mobile
  useEffect(() => {
    if (!isWeb && showSplash) {
      import("./src/screens/SplashScreen").then((module) => {
        setSplashComponent(() => module.default);
      });
    }
  }, [showSplash]);

  // Timer para esconder splash
  useEffect(() => {
    if (!isWeb && !loading) {
      const timer = setTimeout(() => setShowSplash(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  // Callback memoizado para onFinish
  const handleSplashFinish = useCallback(() => setShowSplash(false), []);

  // Splash screen apenas no mobile
  if (showSplash && !isWeb) {
    if (SplashComponent) {
      return <SplashComponent onFinish={handleSplashFinish} />;
    }
    return <LoadingView />;
  }

  // Loading state
  if (loading) {
    return <LoadingView />;
  }

  // Não logado -> tela de autenticação
  if (!user) {
    return (
      <Suspense fallback={<SuspenseFallback />}>
        <AuthStack />
      </Suspense>
    );
  }

  // Aguardando perfil
  if (!profile) {
    return <LoadingView />;
  }

  // Navegação baseada no perfil
  return (
    <Suspense fallback={<SuspenseFallback />}>
      {profile.role === "master" && <MasterTabs />}
      {profile.role === "teacher" && <TeacherTabs />}
      {profile.role === "student" && <StudentRootStack />}
      {!["master", "teacher", "student"].includes(profile.role) && <StudentRootStack />}
    </Suspense>
  );
});

// Document title formatter memoizado
const documentTitleFormatter = (options: any, route: any) =>
  `CDMF - ${options?.title ?? route?.name ?? "Centro de Danças"}`;

// AppContent otimizado
const AppContent = memo(function AppContent() {
  // Memoiza as props do NavigationContainer
  const navigationProps = useMemo(() => ({
    linking: isWeb ? linking : undefined,
    documentTitle: {
      formatter: documentTitleFormatter,
    },
  }), []);

  return (
    <ThemeProvider>
      <DesktopProvider>
        <AuthProvider>
          <NavigationContainer {...navigationProps}>
            <Routes />
          </NavigationContainer>
        </AuthProvider>
      </DesktopProvider>
    </ThemeProvider>
  );
});

// App principal
export default function App() {
  return (
    <View style={styles.container}>
      <SafeAreaProvider>
        <AppContent />
      </SafeAreaProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Na web, precisamos definir altura explícita e bloquear overflow
    ...(isWeb && {
      height: '100%' as any,
      width: '100%' as any,
      overflow: 'hidden' as any,
      position: 'fixed' as any,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    }),
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666666",
  },
});
