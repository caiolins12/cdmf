import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import ChooseRoleScreen from "../screens/auth/ChooseRoleScreen";
import StudentEntryScreen from "../screens/auth/StudentEntryScreen";
import TeacherLoginScreen from "../screens/auth/TeacherLoginScreen";

type AuthStackParamList = {
  ChooseRole: undefined;
  StudentEntry: undefined;
  TeacherLogin: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthStack() {
  return (
    <Stack.Navigator 
      screenOptions={{ 
        headerShown: false, 
        title: "",
        // Animações de transição modernas
        animation: "slide_from_right",
        animationDuration: 250,
      }}
    >
      <Stack.Screen name="ChooseRole" component={ChooseRoleScreen} />
      <Stack.Screen name="StudentEntry" component={StudentEntryScreen} />
      <Stack.Screen name="TeacherLogin" component={TeacherLoginScreen} />
    </Stack.Navigator>
  );
}
