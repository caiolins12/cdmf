import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@/shims/icons";
import { useAuth } from "../contexts/AuthContext";
import { colors } from "../theme/colors";
import NotificationBell from "./NotificationBell";
import { useNavigation } from "@react-navigation/native";

interface MasterHeaderProps {
  onNavigate?: (route: string) => void;
  isHome?: boolean;
}

export default function MasterHeader({ onNavigate, isHome = false }: MasterHeaderProps) {
  const { profile, user } = useAuth();
  const navigation = useNavigation<any>();
  const canGoBack = !isHome && navigation.canGoBack();

  const getUserName = () => {
    if (profile?.name) {
      if (profile.name === "Administrador") return "Admin";
      return profile.name.split(" ")[0];
    }
    if (user?.displayName) {
      return user.displayName.split(" ")[0];
    }
    return "Admin";
  };

  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? "Bom dia" : currentHour < 18 ? "Boa tarde" : "Boa noite";
  const userName = getUserName();

  const navigateTo = (routeName: string) => {
    if (onNavigate) {
      onNavigate(routeName);
    } else {
      navigation.navigate(routeName);
    }
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        {canGoBack ? (
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color="#1E293B" />
            <Text style={styles.backText}>Início</Text>
          </Pressable>
        ) : (
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{greeting}, {userName} 👋</Text>
            <View style={styles.adminBadge}>
              <Ionicons name="shield-checkmark" size={12} color="#fff" />
              <Text style={styles.adminBadgeText}>ADMIN</Text>
            </View>
          </View>
        )}
        <View style={styles.headerRight}>
          <NotificationBell iconColor="#1E293B" size={24} onNavigate={navigateTo} />
          <Pressable
            onPress={() => navigateTo("Configuracoes")}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="settings-outline" size={24} color="#1E293B" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  backText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
  },
  greeting: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
  },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.purple,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  adminBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.5,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
