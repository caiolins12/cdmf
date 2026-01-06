import React, { useEffect, useRef, memo, useMemo, useCallback, lazy, Suspense } from "react";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { Ionicons } from "@expo/vector-icons";
import { Animated, Platform, View, StyleSheet, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDesktop } from "../contexts/DesktopContext";
import { colors } from "../theme/colors";

// Lazy loading
const StudentDesktopLayout = lazy(() => import("../components/desktop/StudentDesktopLayout"));
const StudentHomeScreen = lazy(() => import("../screens/student/StudentHomeScreen"));
const StudentClassesScreen = lazy(() => import("../screens/student/StudentClassesScreen"));
const StudentPaymentsScreen = lazy(() => import("../screens/student/StudentPaymentsScreen"));
const StudentAccountScreen = lazy(() => import("../screens/student/StudentAccountScreen"));

const isWeb = Platform.OS === "web";

// Mapa de ícones
const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  Inicio: "home-outline",
  Aulas: "calendar-outline",
  Pagamento: "cash-outline",
  Conta: "settings-outline",
};

// Componente de ícone animado
const AnimatedTabIcon = memo(function AnimatedTabIcon({ 
  children, 
  focused 
}: { 
  children: React.ReactNode; 
  focused: boolean 
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  useEffect(() => {
    if (focused) {
      Animated.sequence([
        Animated.spring(scaleAnim, {
          toValue: 1.2,
          useNativeDriver: Platform.OS !== "web",
          speed: 50,
          bounciness: 12,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: Platform.OS !== "web",
          speed: 50,
          bounciness: 8,
        }),
      ]).start();
    }
  }, [focused, scaleAnim]);
  
  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      {children}
    </Animated.View>
  );
});

// Loader
function ScreenLoader() {
  return (
    <View style={styles.loader}>
      <ActivityIndicator size="large" color={colors.purple} />
    </View>
  );
}

// Wrappers para lazy loading
function HomeWrapper() {
  return <Suspense fallback={<ScreenLoader />}><StudentHomeScreen /></Suspense>;
}
function ClassesWrapper() {
  return <Suspense fallback={<ScreenLoader />}><StudentClassesScreen /></Suspense>;
}
function PaymentsWrapper() {
  return <Suspense fallback={<ScreenLoader />}><StudentPaymentsScreen /></Suspense>;
}
function AccountWrapper() {
  return <Suspense fallback={<ScreenLoader />}><StudentAccountScreen /></Suspense>;
}

export type StudentTabParamList = {
  Inicio: undefined;
  Aulas: undefined;
  Pagamento: undefined;
  Conta: undefined;
};

const Tab = createMaterialTopTabNavigator<StudentTabParamList>();

function StudentTabs() {
  const insets = useSafeAreaInsets();
  const { isDesktopMode, width } = useDesktop();

  // Em desktop web, usa layout com sidebar
  if (isDesktopMode) {
    return (
      <Suspense fallback={<ScreenLoader />}>
        <StudentDesktopLayout />
      </Suspense>
    );
  }
  
  // Mobile/tablet: usa tabs
  const tabBarStyle = useMemo(() => ({
    paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
    paddingTop: 8,
    height: 65 + (insets.bottom > 0 ? insets.bottom : 8),
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    ...(isWeb && {
      position: 'relative' as any,
      zIndex: 100,
    }),
  }), [insets.bottom]);

  const screenOptions = useCallback(({ route }: { route: { name: string } }) => ({
    tabBarActiveTintColor: colors.purple,
    tabBarInactiveTintColor: "#444",
    tabBarLabelStyle: { 
      fontSize: 10, 
      fontWeight: "700" as const,
      textTransform: "none" as const,
      marginTop: 2,
    },
    tabBarStyle,
    tabBarIndicatorStyle: {
      backgroundColor: colors.purple,
      height: 3,
      borderRadius: 2,
      position: "absolute" as const,
      top: 0,
    },
    swipeEnabled: !isWeb,
    lazy: true,
    lazyPreloadDistance: 1,
    tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
      <AnimatedTabIcon focused={focused}>
        <Ionicons name={ICON_MAP[route.name]} size={22} color={color} />
      </AnimatedTabIcon>
    ),
  }), [tabBarStyle]);
  
  return (
    <View style={styles.container}>
      <Tab.Navigator
        tabBarPosition="bottom"
        screenOptions={screenOptions}
        backBehavior="none"
        sceneContainerStyle={styles.sceneContainer}
      >
        <Tab.Screen name="Inicio" component={HomeWrapper} options={{ title: "Início" }} />
        <Tab.Screen name="Aulas" component={ClassesWrapper} />
        <Tab.Screen name="Pagamento" component={PaymentsWrapper} options={{ title: "Pagar" }} />
        <Tab.Screen name="Conta" component={AccountWrapper} />
      </Tab.Navigator>
    </View>
  );
}

// Removido memo para garantir re-render quando desktop mode muda
export default StudentTabs;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    ...(isWeb && {
      overflow: 'hidden' as any,
      height: '100%' as any,
    }),
  },
  sceneContainer: {
    ...(isWeb && {
      overflow: 'hidden' as any,
    }),
  },
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
});
