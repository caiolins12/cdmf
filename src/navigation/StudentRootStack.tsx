import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import StudentTabs from "./StudentTabs";
import PaymentDetailsScreen, { Payment } from "../screens/student/PaymentDetailsScreen";

export type StudentRootStackParamList = {
  StudentTabs: undefined;
  PaymentDetails: { payment: Payment };
};

const Stack = createNativeStackNavigator<StudentRootStackParamList>();

export default function StudentRootStack() {
  return (
    <Stack.Navigator 
      screenOptions={{ 
        headerShown: false,
        // Animações de transição modernas
        animation: "slide_from_right",
        animationDuration: 250,
      }}
    >
      <Stack.Screen name="StudentTabs" component={StudentTabs} />
      <Stack.Screen 
        name="PaymentDetails" 
        component={PaymentDetailsScreen}
        options={{
          animation: "slide_from_bottom",
        }}
      />
    </Stack.Navigator>
  );
}
