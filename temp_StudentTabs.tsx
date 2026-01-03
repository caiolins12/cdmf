import React, { useEffect, useRef } from "react";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { Ionicons } from "@expo/vector-icons";
import { Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import StudentHomeScreen from "../screens/student/StudentHomeScreen";
import StudentClassesScreen from "../screens/student/StudentClassesScreen";
import StudentPaymentsScreen from "../screens/student/StudentPaymentsScreen";
import StudentAccountScreen from "../screens/student/StudentAccountScreen";
import { colors } from "../theme/colors";

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

export type StudentTabParamList = {
  Inicio: undefined;
  Aulas: undefined;
  Pagamento: undefined;
  Conta: undefined;
};

const Tab = createMaterialTopTabNavigator<StudentTabParamList>();

export default function StudentTabs() {
  const insets = useSafeAreaInsets();
  
  return (
    <Tab.Navigator
      tabBarPosition="bottom"
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colors.purple,
        tabBarInactiveTintColor: "#444",
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
        // Habilita swipe entre tabs
        swipeEnabled: true,
        tabBarIcon: ({ color, focused }) => {
          const map: Record<string, keyof typeof Ionicons.glyphMap> = {
            Inicio: "home-outline",
            Aulas: "calendar-outline",
            Pagamento: "cash-outline",
            Conta: "settings-outline",
          };
          return (
            <AnimatedTabIcon focused={focused}>
              <Ionicons name={map[route.name]} size={22} color={color} />
            </AnimatedTabIcon>
          );
        },
      })}
    >
      <Tab.Screen name="Inicio" component={StudentHomeScreen} options={{ title: "Início" }} />
      <Tab.Screen name="Aulas" component={StudentClassesScreen} />
      <Tab.Screen name="Pagamento" component={StudentPaymentsScreen} options={{ title: "Pagar" }} />
      <Tab.Screen name="Conta" component={StudentAccountScreen} />
    </Tab.Navigator>
  );
}
