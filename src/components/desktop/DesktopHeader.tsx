import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface DesktopHeaderProps {
  title: string;
  subtitle?: string;
  userName?: string;
}

export default function DesktopHeader({
  title,
  subtitle,
  userName,
}: DesktopHeaderProps) {
  const currentDate = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });

  const formattedDate = currentDate.charAt(0).toUpperCase() + currentDate.slice(1);

  return (
    <View style={styles.container}>
      {/* Left: Title */}
      <View style={styles.titleSection}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>

      {/* Right: Actions */}
      <View style={styles.rightSection}>
        {/* Date Badge */}
        <View style={styles.dateBadge}>
          <Ionicons name="calendar-outline" size={14} color="#64748B" />
          <Text style={styles.dateText}>{formattedDate}</Text>
        </View>

        {/* Notifications */}
        <Pressable style={styles.iconBtn}>
          <Ionicons name="notifications-outline" size={20} color="#475569" />
          <View style={styles.notifBadge}>
            <Text style={styles.notifText}>3</Text>
          </View>
        </Pressable>

        {/* Settings */}
        <Pressable style={styles.iconBtn}>
          <Ionicons name="settings-outline" size={20} color="#475569" />
        </Pressable>

        {/* User */}
        <Pressable style={styles.userBtn}>
          <View style={styles.userAvatar}>
            <Ionicons name="person" size={14} color="#fff" />
          </View>
          <Text style={styles.userName}>{userName}</Text>
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
  notifBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  notifText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "700",
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
