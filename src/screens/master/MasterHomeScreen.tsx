import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, RefreshControl, Animated, Platform, ActivityIndicator } from "react-native";
import { usePressAnimation } from "../../hooks/usePressAnimation";
import { useAuth } from "../../contexts/AuthContext";
import { useDesktop } from "../../contexts/DesktopContext";
import { useDesktopNavigation } from "../../contexts/DesktopNavigationContext";
import { usePayment, formatCurrency } from "../../contexts/PaymentContext";
import { useActivity, ACTIVITY_CONFIG, formatTimeAgo } from "../../contexts/ActivityContext";
import { colors } from "../../theme/colors";
import CdmfHeader from "../../components/CdmfHeader";
import TileButton from "../../components/TileButton";
import NotificationBell from "../../components/NotificationBell";
import MasterHeader from "../../components/MasterHeader";
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";

const MAX_ACTIVITIES_DISPLAY = 10;

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
        <Text style={dk.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
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
  const { signOut, profile, user, fetchStudents, fetchTeachers, fetchClasses } = useAuth();
  const { isDesktopMode } = useDesktop();
  const { getFinancialSummary } = usePayment();
  const { activities, loading: activitiesLoading, clearAllActivities } = useActivity();
  const desktopNav = useDesktopNavigation();
  const navigation = useNavigation<any>();
  
  const [studentsCount, setStudentsCount] = useState(0);
  const [teachersCount, setTeachersCount] = useState(0);
  const [classesCount, setClassesCount] = useState(0);
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Atividades recentes (limitadas para exibição)
  const recentActivities = activities.slice(0, MAX_ACTIVITIES_DISPLAY);
  const hasActivities = activities.length > 0;

  const navigateTo = useCallback((routeName: string) => {
    if (isDesktopMode && desktopNav) {
      desktopNav.navigate(routeName);
    } else {
      navigation.navigate(routeName);
    }
  }, [isDesktopMode, desktopNav, navigation]);

  const loadStats = async () => {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const [students, teachers, classes, financialSummary] = await Promise.all([
        fetchStudents(),
        fetchTeachers(),
        fetchClasses(),
        getFinancialSummary(currentMonth),
      ]);
      setStudentsCount(students.filter(s => s.enrollmentStatus !== "inativo").length);
      setTeachersCount(teachers.filter(t => t.active !== false).length);
      setClassesCount(classes.filter(c => c.active).length);
      setMonthlyRevenue(financialSummary.totalReceived);
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
          <View style={{ flex: 1 }}>
            <Text style={dk.greeting}>{greeting}, {userName} 👋</Text>
            <Text style={dk.welcomeSubtext}>
              Aqui está o resumo do seu centro de danças
            </Text>
          </View>
          <NotificationBell size={26} iconColor="#1E293B" onNavigate={navigateTo} />
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
            value={classesCount}
            label="Turmas ativas"
            onPress={() => navigateTo("Turmas")}
          />
          <DesktopStatCard
            icon={<FontAwesome5 name="coins" size={18} color="#16A34A" />}
            iconColor="#16A34A"
            iconBg="#DCFCE7"
            value={formatCurrency(monthlyRevenue)}
            label="Receita do mês"
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

        {/* Atividade Recente */}
        <View style={dk.section}>
          <View style={dk.sectionHeader}>
            <Text style={dk.sectionTitle}>Atividade Recente</Text>
            {hasActivities && (
              <Pressable
                style={dk.clearActivitiesBtn}
                onPress={async () => {
                  if (Platform.OS === "web") {
                    const confirmed = window.confirm(
                      "Tem certeza que deseja limpar todas as atividades? Esta ação não pode ser desfeita."
                    );
                    if (confirmed) {
                      await clearAllActivities();
                    }
                  } else {
                    const { Alert } = require("react-native");
                    Alert.alert(
                      "Confirmar",
                      "Tem certeza que deseja limpar todas as atividades? Esta ação não pode ser desfeita.",
                      [
                        { text: "Cancelar", style: "cancel" },
                        { 
                          text: "Limpar", 
                          style: "destructive",
                          onPress: clearAllActivities 
                        },
                      ]
                    );
                  }
                }}
              >
                <Ionicons name="trash-outline" size={16} color="#DC2626" />
                <Text style={dk.clearActivitiesText}>Limpar todas</Text>
              </Pressable>
            )}
          </View>

          <View style={dk.activityCard}>
            {activitiesLoading ? (
              <View style={dk.activityEmptyState}>
                <Text style={dk.activityEmptyText}>Carregando atividades...</Text>
              </View>
            ) : recentActivities.length === 0 ? (
              <View style={dk.activityEmptyState}>
                <Ionicons name="time-outline" size={32} color="#94A3B8" />
                <Text style={dk.activityEmptyTitle}>Nenhuma atividade</Text>
                <Text style={dk.activityEmptyText}>
                  As atividades recentes do sistema aparecerão aqui
                </Text>
              </View>
            ) : (
              recentActivities.map((activity, index) => {
                const config = ACTIVITY_CONFIG[activity.type];
                return (
                  <React.Fragment key={activity.id}>
                    {index > 0 && <View style={dk.activityDivider} />}
                    <View style={dk.activityItem}>
                      <View style={[dk.activityDot, { backgroundColor: config.color }]} />
                      <View style={dk.activityContent}>
                        <Text style={dk.activityText}>
                          <Text style={dk.activityBold}>{activity.title}</Text>
                        </Text>
                        <Text style={dk.activityDesc} numberOfLines={1}>{activity.description}</Text>
                        <Text style={dk.activityTime}>{formatTimeAgo(activity.timestamp)}</Text>
                      </View>
                      {activity.metadata?.amount ? (
                        <Text style={dk.activityAmount}>{formatCurrency(activity.metadata.amount)}</Text>
                      ) : activity.metadata?.presentCount ? (
                        <Text style={dk.activityMeta}>{activity.metadata.presentCount} presentes</Text>
                      ) : (
                        <Ionicons name={config.icon as any} size={16} color={config.color} />
                      )}
                    </View>
                  </React.Fragment>
                );
              })
            )}
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
      {/* Header customizado com sino de notificações */}
      <MasterHeader onNavigate={navigateTo} />

      <ScrollView
        style={styles.mobileScrollView}
        contentContainerStyle={styles.mobileScrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.purple]} />
        }
      >
        {/* Cards de Estatísticas */}
        <View style={styles.mobileStatsGrid}>
          <Pressable style={styles.mobileStatCard} onPress={() => navigation.navigate("Alunos")}>
            <View style={[styles.mobileStatIcon, { backgroundColor: "#EDE9FE" }]}>
              <FontAwesome5 name="user-graduate" size={18} color="#7C3AED" />
            </View>
            <Text style={styles.mobileStatValue}>{studentsCount}</Text>
            <Text style={styles.mobileStatLabel}>Alunos</Text>
          </Pressable>

          <Pressable style={styles.mobileStatCard} onPress={() => navigation.navigate("Professores")}>
            <View style={[styles.mobileStatIcon, { backgroundColor: "#CFFAFE" }]}>
              <FontAwesome5 name="chalkboard-teacher" size={16} color="#0891B2" />
            </View>
            <Text style={styles.mobileStatValue}>{teachersCount}</Text>
            <Text style={styles.mobileStatLabel}>Professores</Text>
          </Pressable>

          <Pressable style={styles.mobileStatCard} onPress={() => navigation.navigate("Turmas")}>
            <View style={[styles.mobileStatIcon, { backgroundColor: "#FED7AA" }]}>
              <FontAwesome5 name="users" size={16} color="#EA580C" />
            </View>
            <Text style={styles.mobileStatValue}>{classesCount}</Text>
            <Text style={styles.mobileStatLabel}>Turmas</Text>
          </Pressable>

          <Pressable style={styles.mobileStatCard} onPress={() => navigation.navigate("Financeiro")}>
            <View style={[styles.mobileStatIcon, { backgroundColor: "#DCFCE7" }]}>
              <FontAwesome5 name="coins" size={16} color="#16A34A" />
            </View>
            <Text style={styles.mobileStatValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatCurrency(monthlyRevenue)}
            </Text>
            <Text style={styles.mobileStatLabel}>Receita</Text>
          </Pressable>
        </View>

        {/* Acesso Rápido */}
        <View style={styles.mobileSectionHeader}>
          <Text style={styles.mobileSectionTitle}>Acesso Rápido</Text>
        </View>

        <View style={styles.mobileActionsGrid}>
          <Pressable style={styles.mobileActionCard} onPress={() => navigation.navigate("Alunos")}>
            <View style={[styles.mobileActionIcon, { backgroundColor: "#EDE9FE" }]}>
              <FontAwesome5 name="user-graduate" size={22} color="#7C3AED" />
            </View>
            <Text style={styles.mobileActionTitle}>Alunos</Text>
            <Text style={styles.mobileActionDesc}>Gestão de matrículas</Text>
          </Pressable>

          <Pressable style={styles.mobileActionCard} onPress={() => navigation.navigate("Professores")}>
            <View style={[styles.mobileActionIcon, { backgroundColor: "#CFFAFE" }]}>
              <FontAwesome5 name="chalkboard-teacher" size={20} color="#0891B2" />
            </View>
            <Text style={styles.mobileActionTitle}>Professores</Text>
            <Text style={styles.mobileActionDesc}>Equipe e credenciais</Text>
          </Pressable>

          <Pressable style={styles.mobileActionCard} onPress={() => navigation.navigate("Turmas")}>
            <View style={[styles.mobileActionIcon, { backgroundColor: "#FED7AA" }]}>
              <FontAwesome5 name="users" size={20} color="#EA580C" />
            </View>
            <Text style={styles.mobileActionTitle}>Turmas</Text>
            <Text style={styles.mobileActionDesc}>Horários e frequência</Text>
          </Pressable>

          <Pressable style={styles.mobileActionCard} onPress={() => navigation.navigate("Financeiro")}>
            <View style={[styles.mobileActionIcon, { backgroundColor: "#DCFCE7" }]}>
              <FontAwesome5 name="coins" size={20} color="#16A34A" />
            </View>
            <Text style={styles.mobileActionTitle}>Financeiro</Text>
            <Text style={styles.mobileActionDesc}>Pagamentos</Text>
          </Pressable>
        </View>

        {/* Atividades Recentes */}
        <View style={styles.mobileSectionHeader}>
          <Text style={styles.mobileSectionTitle}>Atividade Recente</Text>
          {activities.length > 0 && (
            <Pressable
              style={styles.mobileClearActivitiesBtn}
              onPress={async () => {
                if (Platform.OS === "web") {
                  const confirmed = window.confirm(
                    "Tem certeza que deseja limpar todas as atividades? Esta ação não pode ser desfeita."
                  );
                  if (confirmed) {
                    await clearAllActivities();
                  }
                } else {
                  const { Alert } = require("react-native");
                  Alert.alert(
                    "Confirmar",
                    "Tem certeza que deseja limpar todas as atividades? Esta ação não pode ser desfeita.",
                    [
                      { text: "Cancelar", style: "cancel" },
                      { 
                        text: "Limpar", 
                        style: "destructive",
                        onPress: clearAllActivities 
                      },
                    ]
                  );
                }
              }}
            >
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
              <Text style={styles.mobileClearActivitiesText}>Limpar todas</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.mobileActivityCard}>
          {activitiesLoading ? (
            <View style={styles.mobileActivityEmpty}>
              <ActivityIndicator size="small" color={colors.purple} />
              <Text style={styles.mobileActivityEmptyText}>Carregando...</Text>
            </View>
          ) : recentActivities.length === 0 ? (
            <View style={styles.mobileActivityEmpty}>
              <Ionicons name="time-outline" size={32} color="#94A3B8" />
              <Text style={styles.mobileActivityEmptyTitle}>Nenhuma atividade</Text>
              <Text style={styles.mobileActivityEmptyText}>
                As atividades recentes aparecerão aqui
              </Text>
            </View>
          ) : (
            recentActivities.slice(0, 5).map((activity, index) => {
              const config = ACTIVITY_CONFIG[activity.type];
              return (
                <View key={activity.id}>
                  {index > 0 && <View style={styles.mobileActivityDivider} />}
                  <View style={styles.mobileActivityItem}>
                    <View style={[styles.mobileActivityDot, { backgroundColor: config.color }]} />
                    <View style={styles.mobileActivityContent}>
                      <Text style={styles.mobileActivityTitle} numberOfLines={1}>
                        {activity.title}
                      </Text>
                      <Text style={styles.mobileActivityDesc} numberOfLines={1}>
                        {activity.description}
                      </Text>
                      <Text style={styles.mobileActivityTime}>
                        {formatTimeAgo(activity.timestamp)}
                      </Text>
                    </View>
                    {activity.metadata?.amount ? (
                      <Text style={styles.mobileActivityAmount}>
                        {formatCurrency(activity.metadata.amount)}
                      </Text>
                    ) : (
                      <Ionicons name={config.icon as any} size={16} color={config.color} />
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Footer */}
        <View style={styles.mobileFooter}>
          <Text style={styles.mobileVersion}>CDMF v1.0.0</Text>
          <AnimatedLogoutButton onPress={signOut} />
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

// ==================== ESTILOS MOBILE ====================
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  

  // ScrollView
  mobileScrollView: {
    flex: 1,
  },
  mobileScrollContent: {
    padding: 16,
    paddingBottom: 0,
  },

  // Stats Grid
  mobileStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  mobileStatCard: {
    width: "48%",
    flexGrow: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  mobileStatIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  mobileStatValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1E293B",
  },
  mobileStatLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 2,
  },

  // Section Header
  mobileSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  mobileSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
  },
  mobileClearActivitiesBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  mobileClearActivitiesText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#DC2626",
  },

  // Actions Grid
  mobileActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  mobileActionCard: {
    width: "48%",
    flexGrow: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  mobileActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  mobileActionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
  },
  mobileActionDesc: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },

  // Activity Card
  mobileActivityCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 20,
  },
  mobileActivityEmpty: {
    alignItems: "center",
    paddingVertical: 24,
  },
  mobileActivityEmptyTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
    marginTop: 10,
  },
  mobileActivityEmptyText: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 4,
    textAlign: "center",
  },
  mobileActivityItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  mobileActivityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  mobileActivityContent: {
    flex: 1,
  },
  mobileActivityTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E293B",
  },
  mobileActivityDesc: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 1,
  },
  mobileActivityTime: {
    fontSize: 10,
    color: "#94A3B8",
    marginTop: 2,
  },
  mobileActivityAmount: {
    fontSize: 13,
    fontWeight: "700",
    color: "#16A34A",
  },
  mobileActivityDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
  },

  // Footer
  mobileFooter: {
    alignItems: "center",
    paddingTop: 10,
  },
  mobileVersion: {
    fontSize: 11,
    color: "#94A3B8",
    marginBottom: 10,
  },
  
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
  },
  logout: { textAlign: "center", color: colors.danger, fontWeight: "900", fontSize: 14 },
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
    maxWidth: 1200,
    alignSelf: "flex-start",
  },

  // Welcome Header
  welcomeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 32,
    maxWidth: 900,
  },
  statCard: {
    minWidth: 190,
    maxWidth: 240,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
    fontSize: 22,
    fontWeight: "700",
    color: "#1E293B",
    lineHeight: 26,
    flexShrink: 0,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1E293B",
  },
  clearActivitiesBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#FEE2E2",
  },
  clearActivitiesText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#DC2626",
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
    maxWidth: 900,
  },
  actionCard: {
    minWidth: 200,
    maxWidth: 220,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 18,
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
    maxWidth: 600,
    minHeight: 120,
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
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
  activityDesc: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  activityTime: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 4,
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
  activityEmptyState: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  activityEmptyTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#64748B",
  },
  activityEmptyText: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
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
