import React, { useEffect, useRef, lazy, Suspense } from "react";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { Animated, View, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { useDesktop } from "../contexts/DesktopContext";

// Lazy loading para evitar dependências circulares
const DesktopLayout = lazy(() => import("../components/desktop/DesktopLayout"));
const MasterHomeScreen = lazy(() => import("../screens/master/MasterHomeScreen"));
const MasterStudentsScreen = lazy(() => import("../screens/master/MasterStudentsScreen"));
const MasterTeachersScreen = lazy(() => import("../screens/master/MasterTeachersScreen"));
const MasterClassesScreen = lazy(() => import("../screens/master/MasterClassesScreen"));
const TeacherFinanceScreen = lazy(() => import("../screens/teacher/TeacherFinanceScreen"));

// Wrapper para telas com Suspense
function ScreenWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator size="large" color={colors.purple} />
      </View>
    }>
      {children}
    </Suspense>
  );
}

// Componente de ícone animado
function AnimatedTabIcon({ children, focused }: { children: React.ReactNode; focused: boolean }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  useEffect(() => {
    if (focused) {
      Animated.sequence([
        Animated.spring(scaleAnim, {
          toValue: 1.2,
          useNativeDriver: true,
          speed: 50,
          bounciness: 12,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          speed: 50,
          bounciness: 8,
        }),
      ]).start();
    }
  }, [focused]);
  
  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      {children}
    </Animated.View>
  );
}

export type MasterTabParamList = {
  Inicio: undefined;
  Alunos: undefined;
  Professores: undefined;
  Turmas: undefined;
  Financeiro: undefined;
};

const Tab = createMaterialTopTabNavigator<MasterTabParamList>();

// Componentes de tela envoltos em Suspense
function HomeScreenWrapper() {
  return <ScreenWrapper><MasterHomeScreen /></ScreenWrapper>;
}
function StudentsScreenWrapper() {
  return <ScreenWrapper><MasterStudentsScreen /></ScreenWrapper>;
}
function TeachersScreenWrapper() {
  return <ScreenWrapper><MasterTeachersScreen /></ScreenWrapper>;
}
function ClassesScreenWrapper() {
  return <ScreenWrapper><MasterClassesScreen /></ScreenWrapper>;
}
function FinanceScreenWrapper() {
  return <ScreenWrapper><TeacherFinanceScreen /></ScreenWrapper>;
}

export default function MasterTabs() {
  const insets = useSafeAreaInsets();
  const { isDesktopMode } = useDesktop();

  // Em desktop web, usa layout com sidebar
  if (isDesktopMode) {
    return (
      <Suspense fallback={
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F7FA" }}>
          <ActivityIndicator size="large" color={colors.purple} />
        </View>
      }>
        <DesktopLayout userRole="master" />
      </Suspense>
    );
  }
  
  // Em mobile (nativo ou web), usa tabs na parte inferior
  return (
    <Tab.Navigator
      tabBarPosition="bottom"
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colors.purple,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
          textTransform: "none",
          marginTop: 2,
        },
        tabBarStyle: {
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 8,
          height: 65 + (insets.bottom > 0 ? insets.bottom : 8),
          elevation: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
        },
        tabBarIndicatorStyle: {
          backgroundColor: colors.purple,
          height: 3,
          borderRadius: 2,
          position: "absolute",
          top: 0,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
        // Habilita swipe entre tabs
        swipeEnabled: true,
        tabBarIcon: ({ color, focused }) => {
          let icon;
          switch (route.name) {
            case "Inicio":
              icon = <Ionicons name="home" size={22} color={color} />;
              break;
            case "Alunos":
              icon = <FontAwesome5 name="user-graduate" size={18} color={color} />;
              break;
            case "Professores":
              icon = <FontAwesome5 name="chalkboard-teacher" size={16} color={color} />;
              break;
            case "Turmas":
              icon = <FontAwesome5 name="users" size={18} color={color} />;
              break;
            case "Financeiro":
              icon = <FontAwesome5 name="coins" size={18} color={color} />;
              break;
            default:
              icon = <Ionicons name="ellipse" size={20} color={color} />;
          }
          return <AnimatedTabIcon focused={focused}>{icon}</AnimatedTabIcon>;
        },
      })}
    >
      <Tab.Screen name="Inicio" component={HomeScreenWrapper} options={{ title: "Início" }} />
      <Tab.Screen name="Alunos" component={StudentsScreenWrapper} />
      <Tab.Screen name="Professores" component={TeachersScreenWrapper} options={{ title: "Profs" }} />
      <Tab.Screen name="Turmas" component={ClassesScreenWrapper} />
      <Tab.Screen name="Financeiro" component={FinanceScreenWrapper} options={{ title: "Finanças" }} />
    </Tab.Navigator>
  );
}
