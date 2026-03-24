import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useDesktop } from "../contexts/DesktopContext";
import { createLazyScreen } from "./createLazyScreen";

import DesktopLayout from "../components/desktop/DesktopLayout";

const MasterHomeScreen = createLazyScreen(
  () => import("../screens/master/MasterHomeScreen")
);
const MasterStudentsScreen = createLazyScreen(
  () => import("../screens/master/MasterStudentsScreen")
);
const MasterTeachersScreen = createLazyScreen(
  () => import("../screens/master/MasterTeachersScreen")
);
const MasterClassesScreen = createLazyScreen(
  () => import("../screens/master/MasterClassesScreen")
);
const MasterFinanceScreen = createLazyScreen(
  () => import("../screens/master/MasterFinanceScreen")
);
const MasterEventsScreen = createLazyScreen(
  () => import("../screens/master/MasterEventsScreen")
);
const MasterCommunicationsScreen = createLazyScreen(
  () => import("../screens/master/MasterCommunicationsScreen")
);

export type MasterTabParamList = {
  Inicio: undefined;
  Alunos: undefined;
  Professores: undefined;
  Turmas: undefined;
  Financeiro: undefined;
  Eventos: undefined;
  Comunicacoes: undefined;
};

const Stack = createNativeStackNavigator<MasterTabParamList>();

export default function MasterTabs() {
  const { isDesktopMode } = useDesktop();

  // Em desktop web, usa layout com sidebar
  if (isDesktopMode) {
    return <DesktopLayout userRole="master" />;
  }

  // Em mobile, usa Stack Navigator com transições de tela adequadas
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="Inicio" component={MasterHomeScreen} />
      <Stack.Screen name="Alunos" component={MasterStudentsScreen} />
      <Stack.Screen name="Professores" component={MasterTeachersScreen} />
      <Stack.Screen name="Turmas" component={MasterClassesScreen} />
      <Stack.Screen name="Financeiro" component={MasterFinanceScreen} />
      <Stack.Screen name="Eventos" component={MasterEventsScreen} />
      <Stack.Screen name="Comunicacoes" component={MasterCommunicationsScreen} />
    </Stack.Navigator>
  );
}
