import React, { useEffect, useRef, memo, useMemo, useCallback, useState } from "react";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { Ionicons } from "@/shims/icons";
import { Animated, Platform, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDesktop } from "../contexts/DesktopContext";
import { useAuth } from "../contexts/AuthContext";
import { colors } from "../theme/colors";
import { createLazyScreen } from "./createLazyScreen";
import OnboardingSurveyModal from "../components/OnboardingSurveyModal";
import PhoneVerificationModal from "../components/PhoneVerificationModal";

import StudentDesktopLayout from "../components/desktop/StudentDesktopLayout";
const StudentHomeScreen = createLazyScreen(
  () => import("../screens/student/StudentHomeScreen")
);
const StudentClassesScreen = createLazyScreen(
  () => import("../screens/student/StudentClassesScreen")
);
const StudentPaymentsScreen = createLazyScreen(
  () => import("../screens/student/StudentPaymentsScreen")
);
const StudentAccountScreen = createLazyScreen(
  () => import("../screens/student/StudentAccountScreen")
);

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
  const { profile, updateProfile, refreshProfile, logout } = useAuth();

  // Decide which verification modal to show:
  // - Existing user (onboardingCompleted) but not verified via WhatsApp → simple re-verification modal
  // - New user (no onboardingCompleted) → full onboarding wizard
  const needsVerification =
    profile?.role === "student" &&
    (!profile.phone || !profile.phoneVerified || profile.phoneVerificationMethod !== "whatsapp");

  const isReVerification = Boolean(
    needsVerification && profile?.onboardingCompleted
  );
  const isFullOnboarding = Boolean(
    needsVerification && !profile?.onboardingCompleted
  );

  const [showVerification, setShowVerification] = useState(false);

  useEffect(() => {
    setShowVerification(Boolean(needsVerification));
  }, [needsVerification]);

  // Handler for full onboarding (new users)
  const handleOnboardingComplete = useCallback(async (data: {
    phone: string;
    phoneVerified: boolean;
    birthDate?: string;
    age?: number;
    gender?: string;
    dancePreference?: string;
  }) => {
    if (!profile?.uid) return;
    await updateProfile(profile.uid, {
      ...data,
      onboardingCompleted: true,
      phoneVerificationMethod: "whatsapp",
    });
    await refreshProfile?.();
  }, [profile?.uid, updateProfile, refreshProfile]);

  // Handler for simple re-verification (existing users)
  const handleReVerificationComplete = useCallback(async (phone: string) => {
    if (!profile?.uid) return;
    await updateProfile(profile.uid, {
      phone,
      phoneVerified: true,
      phoneVerificationMethod: "whatsapp",
    });
    await refreshProfile?.();
  }, [profile?.uid, updateProfile, refreshProfile]);

  const handleSwitchAccount = useCallback(async () => {
    setShowVerification(false);
    try { await logout(); } catch {}
  }, [logout]);

  const verificationModal = isReVerification ? (
    <PhoneVerificationModal
      visible={showVerification}
      initialPhone={profile?.phone}
      onComplete={handleReVerificationComplete}
      onSwitchAccount={handleSwitchAccount}
    />
  ) : (
    <OnboardingSurveyModal
      visible={showVerification && isFullOnboarding}
      onComplete={handleOnboardingComplete}
      onSwitchAccount={handleSwitchAccount}
      initialData={{
        phone: profile?.phone,
        birthDate: profile?.birthDate,
        gender: profile?.gender,
        dancePreference: profile?.dancePreference,
        phoneVerified: false,
      }}
    />
  );

  // Em desktop web, usa layout com sidebar
  if (isDesktopMode) {
    return (
      <>
        <StudentDesktopLayout />
        {verificationModal}
      </>
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
        <Tab.Screen name="Inicio" component={StudentHomeScreen} options={{ title: "Início" }} />
        <Tab.Screen name="Aulas" component={StudentClassesScreen} />
        <Tab.Screen name="Pagamento" component={StudentPaymentsScreen} options={{ title: "Pagar" }} />
        <Tab.Screen name="Conta" component={StudentAccountScreen} />
      </Tab.Navigator>
      {verificationModal}
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
});


