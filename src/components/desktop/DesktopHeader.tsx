import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import NotificationBell from "../NotificationBell";
import { useAuth } from "../../contexts/AuthContext";
import { colors } from "../../theme/colors";

interface DesktopHeaderProps {
  title: string;
  subtitle?: string;
  userName?: string;
  onNavigate?: (route: string) => void;
  showGreeting?: boolean;
  userRole?: "master" | "teacher" | "student";
}

export default function DesktopHeader({
  title,
  subtitle,
  userName,
  onNavigate,
  showGreeting = false,
  userRole,
}: DesktopHeaderProps) {
  const { profile, user } = useAuth();
  const currentDate = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });

  const formattedDate = currentDate.charAt(0).toUpperCase() + currentDate.slice(1);

  const getUserName = () => {
    if (profile?.name) {
      if (profile.name === "Administrador") return "Admin";
      return profile.name.split(" ")[0];
    }
    if (user?.displayName) {
      return user.displayName.split(" ")[0];
    }
    return userName || "Usuário";
  };

  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? "Bom dia" : currentHour < 18 ? "Boa tarde" : "Boa noite";
  const displayUserName = getUserName();
  
  // Debug: verifica se deve mostrar greeting
  const shouldShowGreeting = showGreeting && userRole === "master";

  return (
    <View style={styles.container}>
      {/* Left: Title or Greeting */}
      <View style={styles.titleSection}>
        {shouldShowGreeting ? (
          <View style={styles.greetingSection}>
            <View style={styles.greetingRow}>
              <Text style={styles.greeting}>{greeting}, {displayUserName} 👋</Text>
              <View style={styles.adminBadge}>
                <Ionicons name="shield-checkmark" size={12} color="#fff" />
                <Text style={styles.adminBadgeText}>ADMIN</Text>
              </View>
            </View>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
        ) : (
          <>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </>
        )}
      </View>

      {/* Right: Actions */}
      <View style={styles.rightSection}>
        {/* Date Badge */}
        <View style={styles.dateBadge}>
          <Ionicons name="calendar-outline" size={14} color="#64748B" />
          <Text style={styles.dateText}>{formattedDate}</Text>
        </View>

        {/* Notifications */}
        <NotificationBell iconColor="#475569" size={20} onNavigate={onNavigate} />

        {/* Settings */}
        <Pressable style={styles.iconBtn}>
          <Ionicons name="settings-outline" size={20} color="#475569" />
        </Pressable>

        {/* User */}
        <Pressable style={styles.userBtn}>
          <View style={styles.userAvatar}>
            <Ionicons name="person" size={14} color="#fff" />
          </View>
          <Text style={styles.userName}>{displayUserName}</Text>
          <Ionicons name="chevron-down" size={14} color="#94A3B8" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 32,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },

  titleSection: {},
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "#1E293B",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: "#94A3B8",
    marginTop: 2,
  },
  greetingSection: {
    gap: 4,
  },
  greetingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  greeting: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1E293B",
    letterSpacing: -0.3,
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

  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  dateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#F1F5F9",
    borderRadius: 6,
    marginRight: 8,
  },
  dateText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },

  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },

  userBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 6,
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    marginLeft: 8,
  },
  userAvatar: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#7C3AED",
    alignItems: "center",
    justifyContent: "center",
  },
  userName: {
    fontSize: 13,
    fontWeight: "500",
    color: "#475569",
  },
});
