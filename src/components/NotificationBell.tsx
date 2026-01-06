import React, { useState, useRef, useEffect, useMemo } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  Pressable, 
  Modal, 
  ScrollView, 
  Animated,
  Platform,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { useActivity, Activity, ACTIVITY_CONFIG, formatTimeAgo } from "../contexts/ActivityContext";
import { formatCurrency } from "../contexts/PaymentContext";
import { useAuth, PaymentNotification } from "../contexts/AuthContext";

const MAX_VISIBLE_NOTIFICATIONS = 50;
const DROPDOWN_WIDTH = 380;

type Props = {
  iconColor?: string;
  size?: number;
  onNavigate?: (route: string) => void;
};

export default function NotificationBell({ iconColor = "#1E293B", size = 24, onNavigate }: Props) {
  const { activities, unreadCount, markAsRead, markAllAsRead, clearAllActivities, loading } = useActivity();
  const { profile, updateProfile } = useAuth();
  
  // Detecta se é desktop baseado na largura da tela (>= 1024px)
  const [screenWidth, setScreenWidth] = useState(() => {
    try {
      return Dimensions.get("window").width || 1024;
    } catch {
      return 1024;
    }
  });
  
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      if (window.width) {
        setScreenWidth(window.width);
      }
    });
    return () => subscription?.remove();
  }, []);
  
  const isDesktop = Platform.OS === "web" && screenWidth >= 1024;
  
  const [showDropdown, setShowDropdown] = useState(false);
  const [page, setPage] = useState(1);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const badgeAnim = useRef(new Animated.Value(0)).current;
  
  // Para alunos, usa as notificações do perfil (pendingNotifications)
  const isStudent = profile?.role === "student";
  const studentNotifications = profile?.pendingNotifications || [];
  const unreadStudentNotifications = studentNotifications.filter(n => !n.read && !n.dismissedAt);
  
  // Verifica se há notificações/atividades para mostrar o botão de limpar
  // Sempre mostra se houver qualquer notificação/atividade, mesmo antigas
  const hasNotificationsToClear = useMemo(() => {
    if (isStudent) {
      const pending = profile?.pendingNotifications || [];
      // Verifica se há notificações válidas (mesmo que antigas ou dismissed)
      // Para limpar, queremos limpar TODAS, incluindo as que foram dismissed
      return Array.isArray(pending) && pending.length > 0;
    } else {
      // Para admin, verifica atividades
      return Array.isArray(activities) && activities.length > 0;
    }
  }, [isStudent, profile?.pendingNotifications, activities.length]);
  
  // Combina atividades (admin) e notificações do perfil (aluno)
  const allNotifications = useMemo(() => {
    if (isStudent) {
      // Para alunos, retorna as notificações do perfil formatadas (apenas não-dismissed para exibição)
      // Trata notificações antigas que podem não ter dismissedAt ou outras propriedades
      return (studentNotifications || [])
        .filter(n => n && typeof n === 'object')
        .filter(n => !n.dismissedAt)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .map(n => ({
          id: n.id || `notif-${Date.now()}-${Math.random()}`,
          type: n.type || "billing",
          title: n.title || "Notificação",
          message: n.message || "",
          timestamp: n.createdAt || Date.now(),
          read: n.read || false,
          metadata: {
            invoiceId: n.invoiceId,
            amount: n.amount,
            classId: n.classId,
            className: n.className,
          },
        }));
    } else {
      // Para admin, retorna as atividades
      return (activities || [])
        .filter(a => a && a.id)
        .map(a => ({
          id: a.id,
          type: a.type,
          title: a.title,
          message: a.description,
          timestamp: a.timestamp,
          read: a.read || false,
          metadata: a.metadata,
        }));
    }
  }, [isStudent, studentNotifications, activities]);
  
  const totalUnreadCount = isStudent ? unreadStudentNotifications.length : unreadCount;

  // Debug temporário para verificar valores
  useEffect(() => {
    if (Platform.OS === "web" && typeof console !== "undefined") {
      console.debug("[NotificationBell] Estado:", {
        isStudent: profile?.role === "student",
        activitiesCount: activities.length,
        pendingNotificationsCount: profile?.pendingNotifications?.length || 0,
        hasActivities: activities.length > 0,
        hasPendingNotifications: (profile?.pendingNotifications?.length || 0) > 0,
        hasNotificationsToClear,
        allNotificationsCount: allNotifications.length,
        shouldShowClearButton: allNotifications.length > 0,
        showDropdown,
      });
    }
  }, [activities.length, profile?.pendingNotifications?.length, profile?.role, hasNotificationsToClear, allNotifications.length, showDropdown]);

  // Animação do badge quando houver novas notificações
  useEffect(() => {
    if (totalUnreadCount > 0) {
      Animated.sequence([
        Animated.timing(badgeAnim, {
          toValue: 1.2,
          duration: 150,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.spring(badgeAnim, {
          toValue: 1,
          friction: 3,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]).start();
    }
  }, [totalUnreadCount]);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 100,
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 3,
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start();

    setShowDropdown(true);
  };

  const handleClose = () => {
    setShowDropdown(false);
    setPage(1);
  };

  const handleMarkAllRead = async () => {
    if (isStudent) {
      // Marca todas as notificações do aluno como lidas
      if (profile?.uid && studentNotifications.length > 0) {
        const updatedNotifications = studentNotifications.map(n => ({ ...n, read: true }));
        await updateProfile(profile.uid, { pendingNotifications: updatedNotifications });
      }
    } else {
      await markAllAsRead();
    }
  };

  const handleClearAll = async () => {
    try {
      if (isStudent) {
        // Limpa todas as notificações do aluno (incluindo antigas)
        if (profile?.uid) {
          await updateProfile(profile.uid, { pendingNotifications: [] });
        }
      } else {
        // Limpa todas as atividades do admin
        const deleted = await clearAllActivities();
        console.debug(`✅ ${deleted} atividades removidas`);
      }
    } catch (error) {
      console.error("Erro ao limpar notificações/atividades:", error);
      if (Platform.OS === "web") {
        window.alert("Erro ao limpar. Tente novamente.");
      }
    }
  };
  
  const handleNotificationPress = async (notification: any) => {
    if (isStudent) {
      // Marca como lida
      if (profile?.uid && !notification.read) {
        const updatedNotifications = studentNotifications.map(n => 
          n.id === notification.id ? { ...n, read: true } : n
        );
        await updateProfile(profile.uid, { pendingNotifications: updatedNotifications });
      }
      
      // Navega baseado no tipo
      if (onNavigate) {
        handleClose();
        if (notification.type === "billing" || 
            notification.type === "overdue" || 
            notification.type === "reminder" ||
            notification.type === "payment_confirmed" ||
            notification.type === "pending_invoice") {
          onNavigate("Pagamento");
        } else if (notification.type === "class_added" || notification.type === "class_removed") {
          onNavigate("Turmas");
        }
      }
    } else {
      // Comportamento original para admin
      const activity = activities.find(a => a.id === notification.id);
      if (activity) {
        await handleActivityPress(activity);
      }
    }
  };

  const handleActivityPress = async (activity: Activity) => {
    if (!activity.read) {
      await markAsRead(activity.id);
    }
    
    // Navigate based on activity type
    if (onNavigate) {
      if (activity.type === "payment" || activity.type === "invoice_generated" || activity.type === "invoice_overdue") {
        handleClose();
        onNavigate("Finance");
      } else if (activity.type === "student_registered" || activity.type === "student_enrolled") {
        handleClose();
        onNavigate("Students");
      } else if (activity.type === "class_created" || activity.type === "class_attendance") {
        handleClose();
        onNavigate("Classes");
      }
    }
  };

  const handleLoadMore = () => {
    setPage(prev => prev + 1);
  };

  // Notificações paginadas
  const visibleNotifications = allNotifications.slice(0, page * MAX_VISIBLE_NOTIFICATIONS);
  const hasMore = allNotifications.length > visibleNotifications.length;

  const getNotificationConfig = (type: string) => {
    if (isStudent) {
      // Configurações para notificações de aluno
      const studentConfigs: Record<string, { icon: string; color: string; bgColor: string }> = {
        billing: { icon: "receipt", color: colors.purple, bgColor: "#EDE9FE" },
        reminder: { icon: "notifications", color: "#D97706", bgColor: "#FEF3C7" },
        overdue: { icon: "warning", color: "#DC2626", bgColor: "#FEE2E2" },
        payment_confirmed: { icon: "checkmark-circle", color: colors.green, bgColor: "#DCFCE7" },
        class_added: { icon: "add-circle", color: "#0891B2", bgColor: "#CFFAFE" },
        class_removed: { icon: "remove-circle", color: "#DC2626", bgColor: "#FEE2E2" },
        enrollment_inactive: { icon: "ban", color: "#DC2626", bgColor: "#FEE2E2" },
        pending_invoice: { icon: "time", color: "#D97706", bgColor: "#FEF3C7" },
      };
      return studentConfigs[type] || { icon: "information-circle", color: colors.purple, bgColor: "#EDE9FE" };
    } else {
      return ACTIVITY_CONFIG[type as keyof typeof ACTIVITY_CONFIG] || ACTIVITY_CONFIG.system;
    }
  };

  const renderNotification = (notification: any) => {
    const config = getNotificationConfig(notification.type);
    
    return (
      <Pressable
        key={notification.id}
        style={[styles.activityItem, !notification.read && styles.activityItemUnread]}
        onPress={() => handleNotificationPress(notification)}
      >
        <View style={styles.activityIconWrapper}>
          <View style={[styles.activityIconBox, { backgroundColor: config.bgColor }]}>
            <Ionicons name={config.icon as any} size={18} color={config.color} />
          </View>
          {!notification.read && <View style={styles.unreadDot} />}
        </View>
        <View style={styles.activityContent}>
          <Text style={styles.activityTitle} numberOfLines={1}>
            {notification.title}
          </Text>
          <Text style={styles.activityDesc} numberOfLines={2}>
            {notification.message}
          </Text>
          <Text style={styles.activityTime}>{formatTimeAgo(notification.timestamp)}</Text>
        </View>
        {notification.metadata?.amount && (
          <Text style={styles.activityAmount}>
            {formatCurrency(notification.metadata.amount)}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Pressable style={styles.bellButton} onPress={handlePress}>
          <Ionicons name="notifications-outline" size={size} color={iconColor} />
          {totalUnreadCount > 0 && (
            <Animated.View style={[styles.badge, { transform: [{ scale: badgeAnim }] }]}>
              <Text style={styles.badgeText}>
                {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
              </Text>
            </Animated.View>
          )}
        </Pressable>
      </Animated.View>

      <Modal visible={showDropdown} transparent animationType="fade" onRequestClose={handleClose}>
        <Pressable style={[styles.overlay, isDesktop && styles.overlayWeb]} onPress={handleClose}>
          <Pressable 
            style={[styles.dropdown, isDesktop && styles.dropdownWeb]}
            onPress={e => e.stopPropagation()}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Notificações</Text>
              <View style={styles.headerActions}>
                {/* Botão Limpar todas - sempre aparece se houver notificações/atividades */}
                {allNotifications.length > 0 && (
                  <Pressable 
                    style={[styles.clearAllBtn, styles.headerActionBtn]} 
                    onPress={async () => {
                      if (Platform.OS === "web") {
                        const confirmed = window.confirm(
                          isStudent 
                            ? "Tem certeza que deseja limpar todas as notificações? Esta ação não pode ser desfeita."
                            : "Tem certeza que deseja limpar todas as atividades? Esta ação não pode ser desfeita."
                        );
                        if (confirmed) {
                          await handleClearAll();
                          handleClose();
                        }
                      } else {
                        const { Alert } = require("react-native");
                        Alert.alert(
                          "Confirmar",
                          isStudent 
                            ? "Tem certeza que deseja limpar todas as notificações? Esta ação não pode ser desfeita."
                            : "Tem certeza que deseja limpar todas as atividades? Esta ação não pode ser desfeita.",
                          [
                            { text: "Cancelar", style: "cancel" },
                            { 
                              text: "Limpar", 
                              style: "destructive",
                              onPress: async () => {
                                await handleClearAll();
                                handleClose();
                              }
                            },
                          ]
                        );
                      }
                    }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#DC2626" />
                    <Text style={styles.clearAllText}>Limpar todas</Text>
                  </Pressable>
                )}
                {totalUnreadCount > 0 && (
                  <Pressable style={styles.markAllBtn} onPress={handleMarkAllRead}>
                    <Text style={styles.markAllText}>Marcar como lidas</Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* Content */}
            <ScrollView 
              style={styles.scrollView}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {loading && !isStudent ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>Carregando...</Text>
                </View>
              ) : allNotifications.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="notifications-off-outline" size={48} color="#94A3B8" />
                  <Text style={styles.emptyTitle}>Nenhuma notificação</Text>
                  <Text style={styles.emptyText}>
                    {isStudent ? "Suas notificações aparecerão aqui" : "As atividades recentes aparecerão aqui"}
                  </Text>
                </View>
              ) : (
                <>
                  {visibleNotifications.map(renderNotification)}
                  
                  {hasMore && (
                    <Pressable style={styles.loadMoreBtn} onPress={handleLoadMore}>
                      <Text style={styles.loadMoreText}>
                        Carregar mais ({allNotifications.length - visibleNotifications.length} restantes)
                      </Text>
                    </Pressable>
                  )}
                </>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                {allNotifications.length} {isStudent ? "notificação" : "atividade"}{allNotifications.length !== 1 ? "s" : ""}
              </Text>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellButton: {
    padding: 8,
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },

  // Overlay
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: 80,
    paddingHorizontal: 16,
  },
  overlayWeb: {
    alignItems: "flex-end",
    paddingTop: 60,
    paddingHorizontal: 0,
    paddingRight: 16,
  },

  // Dropdown
  dropdown: {
    width: "100%",
    maxWidth: 400,
    maxHeight: "80%",
    backgroundColor: "#fff",
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
    overflow: "hidden",
    alignSelf: "center",
  },
  dropdownWeb: {
    position: "absolute",
    top: 60,
    right: 16,
    width: DROPDOWN_WIDTH,
    maxWidth: DROPDOWN_WIDTH,
    alignSelf: "auto",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    minHeight: 50,
    width: "100%",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
    flexShrink: 0,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  headerActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  clearAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  clearAllText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#DC2626",
  },
  markAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  markAllText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.purple,
  },

  // ScrollView
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 8,
  },

  // Activity Item
  activityItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F8FAFC",
  },
  activityItemUnread: {
    backgroundColor: "#F8FAFC",
  },
  activityIconWrapper: {
    position: "relative",
    flexShrink: 0,
  },
  activityIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  activityContent: {
    flex: 1,
    minWidth: 0,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
  },
  activityDesc: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
    lineHeight: 18,
  },
  activityTime: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 4,
  },
  activityAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#16A34A",
    flexShrink: 0,
    marginLeft: 8,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.purple,
    position: "absolute",
    top: -2,
    right: -2,
    borderWidth: 2,
    borderColor: "#fff",
  },

  // Empty State
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 8,
    textAlign: "center",
  },

  // Load More
  loadMoreBtn: {
    paddingVertical: 12,
    alignItems: "center",
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.purple,
  },

  // Footer
  footer: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    alignItems: "center",
  },
  footerText: {
    fontSize: 12,
    color: "#94A3B8",
  },
});

