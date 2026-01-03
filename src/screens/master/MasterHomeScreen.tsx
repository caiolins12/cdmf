import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, RefreshControl, Animated, Platform } from "react-native";
import { usePressAnimation } from "../../hooks/usePressAnimation";
import { useAuth } from "../../contexts/AuthContext";
import { useDesktop } from "../../contexts/DesktopContext";
import { useDesktopNavigation } from "../../contexts/DesktopNavigationContext";
import { colors } from "../../theme/colors";
import CdmfHeader from "../../components/CdmfHeader";
import TileButton from "../../components/TileButton";
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";

// Componente de card animado (Mobile)
function AnimatedStatCard({ count, label, onPress, isPurple }: { 
  count: number; 
  label: string; 
  onPress: () => void; 
  isPurple?: boolean;
}) {
  const { pressAnim, onPressIn, onPressOut } = usePressAnimation();
  
  return (
    <Animated.View style={{ flex: 1, transform: [{ scale: pressAnim }] }}>
      <Pressable 
        style={[styles.statCard, isPurple && styles.statCardPurple]} 
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        <Text style={[styles.statNumber, isPurple && styles.statNumberWhite]}>{count}</Text>
        <Text style={[styles.statLabel, isPurple && styles.statLabelWhite]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

// Botão de logout animado (Mobile)
function AnimatedLogoutButton({ onPress }: { onPress: () => void }) {
  const { pressAnim, onPressIn, onPressOut } = usePressAnimation();
  
  return (
    <Animated.View style={{ transform: [{ scale: pressAnim }] }}>
      <Pressable 
        onPress={onPress} 
        style={styles.logoutBtn}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        <Ionicons name="log-out-outline" size={20} color={colors.danger} />
        <Text style={styles.logout}>Sair da Conta</Text>
      </Pressable>
    </Animated.View>
  );
}

// ==================== COMPONENTES DESKTOP ====================

// Card de estatística compacto para desktop
function DesktopStatCard({ 
  icon, 
  iconColor,
  iconBg,
  value, 
  label, 
  trend,
  onPress 
}: { 
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  value: number | string; 
  label: string;
  trend?: { value: string; positive: boolean };
  onPress?: () => void;
}) {
  return (
    <Pressable style={dk.statCard} onPress={onPress}>
      <View style={[dk.statIconBox, { backgroundColor: iconBg }]}>
        {icon}
      </View>
      <View style={dk.statContent}>
        <Text style={dk.statValue}>{value}</Text>
        <Text style={dk.statLabel}>{label}</Text>
      </View>
      {trend && (
        <View style={[dk.trendBadge, trend.positive ? dk.trendPositive : dk.trendNegative]}>
          <Ionicons 
            name={trend.positive ? "trending-up" : "trending-down"} 
            size={12} 
            color={trend.positive ? "#059669" : "#DC2626"} 
          />
          <Text style={[dk.trendText, trend.positive ? dk.trendTextPositive : dk.trendTextNegative]}>
            {trend.value}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// Card de ação rápida para desktop
function DesktopActionCard({
  icon,
  title,
  description,
  accentColor,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  accentColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable 
      style={({ pressed }) => [dk.actionCard, pressed && dk.actionCardPressed]}
      onPress={onPress}
    >
      <View style={dk.actionCardHeader}>
        <View style={[dk.actionIconBox, { backgroundColor: accentColor + "15" }]}>
          {icon}
        </View>
        <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
      </View>
      <Text style={dk.actionTitle}>{title}</Text>
      <Text style={dk.actionDesc}>{description}</Text>
    </Pressable>
  );
}

// ==================== COMPONENTE PRINCIPAL ====================

export default function MasterHomeScreen() {
  const { signOut, profile, user, fetchStudents, fetchTeachers } = useAuth();
  const { isDesktopMode } = useDesktop();
  const desktopNav = useDesktopNavigation();
  const navigation = useNavigation<any>();
  
  const [studentsCount, setStudentsCount] = useState(0);
  const [teachersCount, setTeachersCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const navigateTo = useCallback((routeName: string) => {
    if (isDesktopMode && desktopNav) {
      desktopNav.navigate(routeName);
    } else {
      navigation.navigate(routeName);
    }
  }, [isDesktopMode, desktopNav, navigation]);

  const loadStats = async () => {
    try {
      const [students, teachers] = await Promise.all([
        fetchStudents(),
        fetchTeachers(),
      ]);
      setStudentsCount(students.length);
      setTeachersCount(teachers.filter(t => t.active !== false).length);
    } catch (e) {
      console.error("Erro ao carregar estatísticas:", e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  const getFirstName = () => {
    if (profile?.name) {
      if (profile.name === "Administrador") return "Admin";
      return profile.name.split(" ")[0];
    }
    if (user?.displayName) {
      return user.displayName.split(" ")[0];
    }
    return "Master";
  };

  const userName = getFirstName();
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? "Bom dia" : currentHour < 18 ? "Boa tarde" : "Boa noite";

  // ==================== LAYOUT DESKTOP ====================
  if (isDesktopMode) {
    return (
      <ScrollView 
        style={dk.container}
        contentContainerStyle={dk.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.purple]} />
        }
      >
        {/* Header de boas-vindas */}
        <View style={dk.welcomeHeader}>
          <View>
            <Text style={dk.greeting}>{greeting}, {userName} 👋</Text>
            <Text style={dk.welcomeSubtext}>
              Aqui está o resumo do seu centro de danças
            </Text>
          </View>
        </View>

        {/* Cards de Estatísticas */}
        <View style={dk.statsRow}>
          <DesktopStatCard
            icon={<FontAwesome5 name="user-graduate" size={20} color="#7C3AED" />}
            iconColor="#7C3AED"
            iconBg="#EDE9FE"
            value={studentsCount}
            label="Alunos ativos"
            trend={{ value: "+12%", positive: true }}
            onPress={() => navigateTo("Alunos")}
          />
          <DesktopStatCard
            icon={<FontAwesome5 name="chalkboard-teacher" size={18} color="#0891B2" />}
            iconColor="#0891B2"
            iconBg="#CFFAFE"
            value={teachersCount}
            label="Professores"
            onPress={() => navigateTo("Professores")}
          />
          <DesktopStatCard
            icon={<FontAwesome5 name="users" size={18} color="#EA580C" />}
            iconColor="#EA580C"
            iconBg="#FED7AA"
            value="8"
            label="Turmas ativas"
            onPress={() => navigateTo("Turmas")}
          />
          <DesktopStatCard
            icon={<FontAwesome5 name="coins" size={18} color="#16A34A" />}
            iconColor="#16A34A"
            iconBg="#DCFCE7"
            value="R$ 4.200"
            label="Receita do mês"
            trend={{ value: "+8%", positive: true }}
            onPress={() => navigateTo("Financeiro")}
          />
        </View>

        {/* Seção de Ações Rápidas */}
        <View style={dk.section}>
          <View style={dk.sectionHeader}>
            <Text style={dk.sectionTitle}>Acesso Rápido</Text>
            <Text style={dk.sectionSubtitle}>Gerencie seu centro de danças</Text>
          </View>

          <View style={dk.actionsGrid}>
            <DesktopActionCard
              icon={<FontAwesome5 name="user-graduate" size={22} color="#7C3AED" />}
              title="Gestão de Alunos"
              description="Cadastros, matrículas e status de pagamento"
              accentColor="#7C3AED"
              onPress={() => navigateTo("Alunos")}
            />
            <DesktopActionCard
              icon={<FontAwesome5 name="chalkboard-teacher" size={20} color="#0891B2" />}
              title="Professores"
              description="Gerenciar equipe e credenciais"
              accentColor="#0891B2"
              onPress={() => navigateTo("Professores")}
            />
            <DesktopActionCard
              icon={<FontAwesome5 name="users" size={20} color="#EA580C" />}
              title="Turmas"
              description="Horários, alunos e frequência"
              accentColor="#EA580C"
              onPress={() => navigateTo("Turmas")}
            />
            <DesktopActionCard
              icon={<FontAwesome5 name="coins" size={20} color="#16A34A" />}
              title="Financeiro"
              description="Relatórios e controle de pagamentos"
              accentColor="#16A34A"
              onPress={() => navigateTo("Financeiro")}
            />
          </View>
        </View>

        {/* Atividade Recente (placeholder) */}
        <View style={dk.section}>
          <View style={dk.sectionHeader}>
            <Text style={dk.sectionTitle}>Atividade Recente</Text>
          </View>

          <View style={dk.activityCard}>
            <View style={dk.activityItem}>
              <View style={[dk.activityDot, { backgroundColor: "#16A34A" }]} />
              <View style={dk.activityContent}>
                <Text style={dk.activityText}>
                  <Text style={dk.activityBold}>Ana Beatriz</Text> realizou pagamento
                </Text>
                <Text style={dk.activityTime}>Há 2 horas</Text>
              </View>
              <Text style={dk.activityAmount}>R$ 91,00</Text>
            </View>

            <View style={dk.activityDivider} />

            <View style={dk.activityItem}>
              <View style={[dk.activityDot, { backgroundColor: "#7C3AED" }]} />
              <View style={dk.activityContent}>
                <Text style={dk.activityText}>
                  <Text style={dk.activityBold}>Novo aluno</Text> cadastrado
                </Text>
                <Text style={dk.activityTime}>Há 5 horas</Text>
              </View>
              <Ionicons name="person-add" size={16} color="#7C3AED" />
            </View>

            <View style={dk.activityDivider} />

            <View style={dk.activityItem}>
              <View style={[dk.activityDot, { backgroundColor: "#EA580C" }]} />
              <View style={dk.activityContent}>
                <Text style={dk.activityText}>
                  Turma <Text style={dk.activityBold}>Forró Iniciante</Text> - aula realizada
                </Text>
                <Text style={dk.activityTime}>Ontem às 19:00</Text>
              </View>
              <Text style={dk.activityMeta}>12 presentes</Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={dk.footer}>
          <Text style={dk.footerText}>CDMF Sistema de Gestão • v1.0.0</Text>
        </View>
      </ScrollView>
    );
  }

  // ==================== LAYOUT MOBILE ====================
  return (
    <View style={styles.screen}>
      <CdmfHeader title={`Olá, ${userName}`} />

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.purple]} />
        }
      >
        <View style={styles.masterBadge}>
          <Ionicons name="shield-checkmark" size={18} color="#fff" />
          <Text style={styles.masterBadgeText}>ADMINISTRADOR</Text>
        </View>

        <View style={styles.statsRow}>
          <AnimatedStatCard 
            count={studentsCount} 
            label="Alunos" 
            onPress={() => navigation.navigate("Alunos")} 
          />
          <AnimatedStatCard 
            count={teachersCount} 
            label="Professores" 
            onPress={() => navigation.navigate("Professores")} 
            isPurple 
          />
        </View>

        <View style={styles.sectionTitleBox}>
          <Text style={styles.sectionTitle}>PAINEL DE CONTROLE</Text>
        </View>

        <View style={styles.grid}>
          <View style={styles.row}>
            <TileButton
              label="ALUNOS"
              icon={<FontAwesome5 name="user-graduate" size={32} color="#111" />}
              onPress={() => navigation.navigate("Alunos")}
            />
            <View style={{ width: 14 }} />
            <TileButton
              label="PROFESSORES"
              icon={<FontAwesome5 name="chalkboard-teacher" size={30} color="#111" />}
              onPress={() => navigation.navigate("Professores")}
            />
          </View>

          <View style={{ height: 14 }} />

          <View style={styles.row}>
            <TileButton
              label="TURMAS"
              icon={<FontAwesome5 name="users" size={32} color="#111" />}
              onPress={() => navigation.navigate("Turmas")}
            />
            <View style={{ width: 14 }} />
            <TileButton
              label={"RELATÓRIO\nFINANCEIRO"}
              icon={<FontAwesome5 name="coins" size={32} color="#111" />}
              onPress={() => navigation.navigate("Financeiro")}
            />
          </View>
        </View>

        <Text style={styles.version}>Versão do APP: v1.0.0</Text>

        <AnimatedLogoutButton onPress={signOut} />

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

// ==================== ESTILOS MOBILE ====================
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  
  masterBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.purple,
    paddingTop: 6,
    paddingBottom: 12,
    gap: 8,
  },
  masterBadgeText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 1,
  },

  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  statCardPurple: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },
  statNumber: {
    fontSize: 32,
    fontWeight: "900",
    color: colors.text,
  },
  statNumberWhite: {
    color: "#fff",
  },
  statLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.muted,
    marginTop: 4,
  },
  statLabelWhite: {
    color: "rgba(255,255,255,0.9)",
  },

  sectionTitleBox: {
    backgroundColor: "#E6E6E6",
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 16,
  },
  sectionTitle: { fontWeight: "900", color: colors.text },
  
  grid: { padding: 16, paddingTop: 18 },
  row: { flexDirection: "row" },
  
  version: { textAlign: "center", color: colors.muted, marginTop: 8 },
  
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
  },
  logout: { textAlign: "center", color: colors.danger, fontWeight: "900" },
});

// ==================== ESTILOS DESKTOP ====================
const dk = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollContent: {
    padding: 32,
    paddingTop: 24,
    maxWidth: 1400,
  },

  // Welcome Header
  welcomeHeader: {
    marginBottom: 28,
  },
  greeting: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1E293B",
    letterSpacing: -0.5,
  },
  welcomeSubtext: {
    fontSize: 15,
    color: "#64748B",
    marginTop: 4,
  },

  // Stats Row
  statsRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 32,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  statIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statContent: {
    flex: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1E293B",
    lineHeight: 28,
  },
  statLabel: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  trendBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 3,
  },
  trendPositive: {
    backgroundColor: "#ECFDF5",
  },
  trendNegative: {
    backgroundColor: "#FEF2F2",
  },
  trendText: {
    fontSize: 12,
    fontWeight: "600",
  },
  trendTextPositive: {
    color: "#059669",
  },
  trendTextNegative: {
    color: "#DC2626",
  },

  // Section
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1E293B",
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#94A3B8",
    marginTop: 2,
  },

  // Actions Grid
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  actionCard: {
    width: 240,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  actionCardPressed: {
    backgroundColor: "#F8FAFC",
    transform: [{ scale: 0.98 }],
  },
  actionCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  actionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 4,
  },
  actionDesc: {
    fontSize: 13,
    color: "#64748B",
    lineHeight: 18,
  },

  // Activity Card
  activityCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    fontSize: 14,
    color: "#475569",
  },
  activityBold: {
    fontWeight: "600",
    color: "#1E293B",
  },
  activityTime: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 2,
  },
  activityAmount: {
    fontSize: 14,
    fontWeight: "600",
    color: "#16A34A",
  },
  activityMeta: {
    fontSize: 13,
    color: "#64748B",
  },
  activityDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 14,
  },

  // Footer
  footer: {
    alignItems: "center",
    paddingTop: 20,
    marginTop: 12,
  },
  footerText: {
    fontSize: 12,
    color: "#94A3B8",
  },
});
