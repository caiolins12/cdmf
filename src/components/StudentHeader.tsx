import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { colors } from "../theme/colors";
import NotificationBell from "./NotificationBell";
import { useNavigation } from "@react-navigation/native";

interface StudentHeaderProps {
  onNavigate?: (route: string) => void;
}

export default function StudentHeader({ onNavigate }: StudentHeaderProps) {
  const { profile, user } = useAuth();
  const navigation = useNavigation<any>();

  const getUserName = () => {
    if (profile?.name) {
      return profile.name.split(" ")[0];
    }
    if (user?.displayName) {
      return user.displayName.split(" ")[0];
    }
    return "Aluno";
  };

  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? "Bom dia" : currentHour < 18 ? "Boa tarde" : "Boa noite";
  const userName = getUserName();

  const navigateTo = (route: string) => {
    if (onNavigate) {
      onNavigate(route);
    } else {
      navigation.navigate(route);
    }
  };

  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <Text style={styles.greeting}>{greeting}, {userName} 👋</Text>
        <View style={styles.studentBadge}>
          <Ionicons name="school" size={12} color="#fff" />
          <Text style={styles.studentBadgeText}>ALUNO</Text>
        </View>
      </View>
      <NotificationBell iconColor="#1E293B" size={24} onNavigate={navigateTo} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  greeting: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
  },
  studentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.green,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  studentBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.5,
  },
});

