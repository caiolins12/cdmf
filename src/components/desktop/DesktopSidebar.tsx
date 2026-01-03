import React from "react";
import { View, Text, Pressable, StyleSheet, Image, ScrollView } from "react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { DesktopTab } from "../../contexts/DesktopNavigationContext";

interface SidebarItem {
  id: DesktopTab;
  label: string;
  icon: React.ReactNode;
  iconActive: React.ReactNode;
}

interface DesktopSidebarProps {
  activeTab: DesktopTab;
  onTabChange: (tab: DesktopTab) => void;
  userRole: "master" | "teacher" | "student";
  userName?: string;
  onSignOut?: () => void;
}

const MASTER_ITEMS: SidebarItem[] = [
  {
    id: "inicio",
    label: "Dashboard",
    icon: <Ionicons name="grid-outline" size={18} color="#94A3B8" />,
    iconActive: <Ionicons name="grid" size={18} color="#7C3AED" />,
  },
  {
    id: "alunos",
    label: "Alunos",
    icon: <FontAwesome5 name="user-graduate" size={15} color="#94A3B8" />,
    iconActive: <FontAwesome5 name="user-graduate" size={15} color="#7C3AED" />,
  },
  {
    id: "professores",
    label: "Professores",
    icon: <FontAwesome5 name="chalkboard-teacher" size={14} color="#94A3B8" />,
    iconActive: <FontAwesome5 name="chalkboard-teacher" size={14} color="#7C3AED" />,
  },
  {
    id: "turmas",
    label: "Turmas",
    icon: <FontAwesome5 name="users" size={15} color="#94A3B8" />,
    iconActive: <FontAwesome5 name="users" size={15} color="#7C3AED" />,
  },
  {
    id: "financeiro",
    label: "Financeiro",
    icon: <FontAwesome5 name="coins" size={15} color="#94A3B8" />,
    iconActive: <FontAwesome5 name="coins" size={15} color="#7C3AED" />,
  },
];

export default function DesktopSidebar({
  activeTab,
  onTabChange,
  userRole,
  userName,
  onSignOut,
}: DesktopSidebarProps) {
  const items = MASTER_ITEMS;

  const getRoleBadge = () => {
    switch (userRole) {
      case "master":
        return { label: "Admin", color: "#7C3AED" };
      case "teacher":
        return { label: "Professor", color: "#0891B2" };
      case "student":
        return { label: "Aluno", color: "#16A34A" };
    }
  };

  const badge = getRoleBadge();

  return (
    <View style={styles.container}>
      {/* Logo Section */}
      <View style={styles.logoSection}>
        <View style={styles.logoBox}>
          <Image
            source={require("../../../assets/cdmf-logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
      </View>

      {/* User Section */}
      <View style={styles.userSection}>
        <View style={styles.userAvatar}>
          <Ionicons name="person" size={18} color="#fff" />
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>{userName || "Usuário"}</Text>
          <View style={[styles.roleBadge, { backgroundColor: badge.color + "20" }]}>
            <Text style={[styles.roleText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        </View>
      </View>

      {/* Navigation */}
      <View style={styles.navSection}>
        <Text style={styles.navLabel}>MENU</Text>
        
        {items.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <Pressable
              key={item.id}
              style={[styles.navItem, isActive && styles.navItemActive]}
              onPress={() => onTabChange(item.id)}
            >
              <View style={styles.navIconBox}>
                {isActive ? item.iconActive : item.icon}
              </View>
              <Text style={[styles.navItemText, isActive && styles.navItemTextActive]}>
                {item.label}
              </Text>
              {isActive && <View style={styles.activeBar} />}
            </Pressable>
          );
        })}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerDivider} />
        
        <Pressable style={styles.signOutBtn} onPress={onSignOut}>
          <Ionicons name="log-out-outline" size={18} color="#94A3B8" />
          <Text style={styles.signOutText}>Sair</Text>
        </Pressable>

        <Text style={styles.version}>v1.0.0</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 240,
    height: "100%",
    backgroundColor: "#FFFFFF",
    borderRightWidth: 1,
    borderRightColor: "#E2E8F0",
    paddingTop: 20,
  },

  // Logo
  logoSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  logoBox: {
    height: 48,
    justifyContent: "center",
  },
  logo: {
    width: 120,
    height: 40,
  },

  // User
  userSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginHorizontal: 12,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    marginBottom: 24,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#7C3AED",
    alignItems: "center",
    justifyContent: "center",
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 4,
  },
  roleBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleText: {
    fontSize: 11,
    fontWeight: "600",
  },

  // Navigation
  navSection: {
    flex: 1,
    paddingHorizontal: 12,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
    letterSpacing: 0.5,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 2,
    position: "relative",
  },
  navItemActive: {
    backgroundColor: "#F5F3FF",
  },
  navIconBox: {
    width: 28,
    alignItems: "center",
  },
  navItemText: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "500",
  },
  navItemTextActive: {
    color: "#7C3AED",
    fontWeight: "600",
  },
  activeBar: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    backgroundColor: "#7C3AED",
    borderRadius: 2,
  },

  // Footer
  footer: {
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  footerDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginBottom: 16,
    marginHorizontal: 8,
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  signOutText: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "500",
  },
  version: {
    fontSize: 11,
    color: "#CBD5E1",
    textAlign: "center",
    marginTop: 12,
  },
});
