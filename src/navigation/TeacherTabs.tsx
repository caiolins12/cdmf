import React, { useEffect, useRef } from "react";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

import TeacherHomeScreen from "../screens/teacher/TeacherHomeScreen";
import TeacherClassesScreen from "../screens/teacher/TeacherClassesScreen";
import TeacherStudentsScreen from "../screens/teacher/TeacherStudentsScreen";
import TeacherAttendanceScreen from "../screens/teacher/TeacherAttendanceScreen";
import TeacherReportsScreen from "../screens/teacher/TeacherReportsScreen";

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

export type TeacherTabParamList = {
  Inicio: undefined;
  Presenca: undefined;
  Relatorios: undefined;
  Alunos: undefined;
  Turmas: undefined;
};

const Tab = createMaterialTopTabNavigator<TeacherTabParamList>();

export default function TeacherTabs() {
  const insets = useSafeAreaInsets();
  
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
        // Habilita swipe entre tabs
        swipeEnabled: true,
        tabBarIcon: ({ color, focused }) => {
          let icon;
          switch (route.name) {
            case "Inicio":
              icon = <Ionicons name="home" size={20} color={color} />;
              break;
            case "Presenca":
              icon = <Ionicons name="clipboard" size={18} color={color} />;
              break;
            case "Relatorios":
              icon = <Ionicons name="bar-chart" size={18} color={color} />;
              break;
            case "Alunos":
              icon = <FontAwesome5 name="user-graduate" size={16} color={color} />;
              break;
            case "Turmas":
              icon = <FontAwesome5 name="users" size={16} color={color} />;
              break;
            default:
              icon = <Ionicons name="ellipse" size={18} color={color} />;
          }
          return <AnimatedTabIcon focused={focused}>{icon}</AnimatedTabIcon>;
        },
      })}
    >
      <Tab.Screen name="Inicio" component={TeacherHomeScreen} options={{ title: "Início" }} />
      <Tab.Screen name="Presenca" component={TeacherAttendanceScreen} options={{ title: "Presença" }} />
      <Tab.Screen name="Relatorios" component={TeacherReportsScreen} options={{ title: "Relatórios" }} />
      <Tab.Screen name="Alunos" component={TeacherStudentsScreen} />
      <Tab.Screen name="Turmas" component={TeacherClassesScreen} />
    </Tab.Navigator>
  );
}
