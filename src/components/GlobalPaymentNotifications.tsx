import React, { useEffect, useState, useRef, useCallback } from "react";
import { View, Text, StyleSheet, Modal, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { usePayment, Invoice, formatCurrency } from "../contexts/PaymentContext";
import { useNavigation } from "@react-navigation/native";
import { useDesktop } from "../contexts/DesktopContext";
import { useStudentDesktopNav } from "../contexts/StudentDesktopNavigationContext";
import { colors } from "../theme/colors";

// Função segura para formatar data
const formatDateSafe = (dateStr: any): string => {
  if (!dateStr || typeof dateStr !== 'string') return '--/--/----';
  try {
    return dateStr.split("-").reverse().join("/");
  } catch {
    return '--/--/----';
  }
};

// Calcula dias até o vencimento
const getDaysUntilDue = (dueDate: string): number => {
  if (!dueDate) return 999;
  try {
    const [year, month, day] = dueDate.split("-").map(Number);
    const due = new Date(year, month - 1, day);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  } catch {
    return 999;
  }
};

type NotificationType = "new_invoice" | "upcoming_due" | "overdue";

interface FloatingNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  invoice?: Invoice;
  priority: number; // Maior = mais urgente
}

/**
 * GlobalPaymentNotifications
 * 
 * Responsável APENAS por mostrar lembretes flutuantes na tela.
 * - Detecta mudanças em faturas (nova cobrança, vencimento próximo, atraso)
 * - Mostra lembrete flutuante APENAS UMA VEZ por sessão
 * - Prioriza: atrasada (3) > vencimento próximo (2) > nova cobrança (1)
 * 
 * NÃO processa pendingNotifications do perfil - isso é responsabilidade do NotificationBell (sino).
 */
export default function GlobalPaymentNotifications() {
  const { profile } = useAuth();
  const { subscribeToInvoices } = usePayment();
  const navigation = useNavigation();
  const { isDesktopMode } = useDesktop();
  const studentDesktopNav = useStudentDesktopNav();
  
  const [currentNotification, setCurrentNotification] = useState<FloatingNotification | null>(null);
  const [notificationQueue, setNotificationQueue] = useState<FloatingNotification[]>([]);
  
  // Controle de notificações já mostradas nesta sessão (por invoice ID e tipo)
  const shownNotificationsRef = useRef<Set<string>>(new Set());
  // IDs de faturas conhecidas (para detectar novas)
  const knownInvoiceIdsRef = useRef<Set<string>>(new Set());
  // Flag para indicar se é a primeira carga
  const isFirstLoadRef = useRef(true);

  // Processa faturas e gera notificações
  const processInvoices = useCallback((invoices: Invoice[]) => {
    if (!profile?.uid) return;

    const newNotifications: FloatingNotification[] = [];
    const upcomingThreshold = 3; // 3 dias antes do vencimento

    // Na primeira carga, apenas registra os IDs sem mostrar notificações
    if (isFirstLoadRef.current) {
      invoices.forEach(inv => knownInvoiceIdsRef.current.add(inv.id));
      isFirstLoadRef.current = false;
      
      // Mas ainda verifica contas atrasadas para mostrar uma vez
      for (const invoice of invoices) {
        if (invoice.status === "paid" || invoice.status === "cancelled") continue;
        
        const daysUntilDue = getDaysUntilDue(invoice.dueDate || invoice.lateDueDate);
        
        // Conta atrasada - sempre mostra uma vez por sessão
        if (invoice.status === "overdue" || daysUntilDue < 0) {
          const notificationKey = `overdue_${invoice.id}`;
          if (!shownNotificationsRef.current.has(notificationKey)) {
            newNotifications.push({
              id: notificationKey,
              type: "overdue",
              title: "⚠️ Conta Atrasada",
              message: `Sua conta de ${formatCurrency(invoice.amount)} venceu em ${formatDateSafe(invoice.dueDate || invoice.lateDueDate)}. Por favor, regularize o pagamento.`,
              invoice,
              priority: 3, // Maior prioridade
            });
            shownNotificationsRef.current.add(notificationKey);
          }
        }
      }
      
      if (newNotifications.length > 0) {
        // Ordena por prioridade e adiciona à fila
        const sorted = newNotifications.sort((a, b) => b.priority - a.priority);
        setNotificationQueue(prev => [...prev, ...sorted]);
      }
      return;
    }

    // Processa cada fatura
    for (const invoice of invoices) {
      // Ignora faturas pagas ou canceladas
      if (invoice.status === "paid" || invoice.status === "cancelled") continue;

      const daysUntilDue = getDaysUntilDue(invoice.dueDate || invoice.lateDueDate);
      const isNewInvoice = !knownInvoiceIdsRef.current.has(invoice.id);
      
      // Registra o ID
      knownInvoiceIdsRef.current.add(invoice.id);

      // PRIORIDADE 1: Verifica se está atrasada PRIMEIRO
      // Se a conta já está atrasada, NÃO mostra "nova cobrança", só "conta atrasada"
      if (invoice.status === "overdue" || daysUntilDue < 0) {
        const notificationKey = `overdue_${invoice.id}`;
        if (!shownNotificationsRef.current.has(notificationKey)) {
          newNotifications.push({
            id: notificationKey,
            type: "overdue",
            title: "⚠️ Conta Atrasada",
            message: `Sua conta de ${formatCurrency(invoice.amount)} venceu em ${formatDateSafe(invoice.dueDate || invoice.lateDueDate)}. Por favor, regularize o pagamento.`,
            invoice,
            priority: 3,
          });
          shownNotificationsRef.current.add(notificationKey);
          // Marca também como "nova" mostrada para não duplicar
          shownNotificationsRef.current.add(`new_${invoice.id}`);
        }
        continue; // Não processa mais para esta fatura
      }

      // PRIORIDADE 2: Conta próxima do vencimento
      if (daysUntilDue <= upcomingThreshold && daysUntilDue >= 0) {
        const notificationKey = `upcoming_${invoice.id}`;
        if (!shownNotificationsRef.current.has(notificationKey)) {
          newNotifications.push({
            id: notificationKey,
            type: "upcoming_due",
            title: "🔔 Vencimento Próximo",
            message: `Sua conta de ${formatCurrency(invoice.amount)} vence em ${daysUntilDue} ${daysUntilDue === 1 ? 'dia' : 'dias'} (${formatDateSafe(invoice.dueDate || invoice.lateDueDate)}).`,
            invoice,
            priority: 2,
          });
          shownNotificationsRef.current.add(notificationKey);
          // Marca também como "nova" mostrada para não duplicar
          if (isNewInvoice) {
            shownNotificationsRef.current.add(`new_${invoice.id}`);
          }
        }
        continue;
      }

      // PRIORIDADE 3: Nova cobrança (só se não está atrasada e não está próxima do vencimento)
      if (isNewInvoice) {
        const notificationKey = `new_${invoice.id}`;
        if (!shownNotificationsRef.current.has(notificationKey)) {
          newNotifications.push({
            id: notificationKey,
            type: "new_invoice",
            title: "📋 Nova Cobrança",
            message: `Uma nova cobrança foi gerada: ${invoice.description || 'Mensalidade'} no valor de ${formatCurrency(invoice.amount)}. Vencimento: ${formatDateSafe(invoice.dueDate || invoice.lateDueDate)}.`,
            invoice,
            priority: 1,
          });
          shownNotificationsRef.current.add(notificationKey);
        }
      }
    }

    if (newNotifications.length > 0) {
      // Ordena por prioridade (maior primeiro) e adiciona à fila
      const sorted = newNotifications.sort((a, b) => b.priority - a.priority);
      setNotificationQueue(prev => [...prev, ...sorted]);
    }
  }, [profile?.uid]);

  // Listener em tempo real para faturas
  useEffect(() => {
    if (!profile?.uid || profile.role !== "student") return;

    const unsubscribe = subscribeToInvoices(profile.uid, processInvoices);

    return () => unsubscribe();
  }, [profile?.uid, profile?.role, subscribeToInvoices, processInvoices]);

  // Mostra a próxima notificação da fila
  useEffect(() => {
    if (notificationQueue.length > 0 && !currentNotification) {
      const next = notificationQueue[0];
      setCurrentNotification(next);
      setNotificationQueue(prev => prev.slice(1));
    }
  }, [notificationQueue, currentNotification]);

  // Dispensa a notificação atual
  const handleDismiss = useCallback(() => {
    setCurrentNotification(null);
  }, []);

  // Navega para a tela de pagamentos
  const handleGoToPayments = useCallback(() => {
    handleDismiss();
    
    // No desktop, usa o contexto de navegação do desktop
    if (isDesktopMode && studentDesktopNav) {
      studentDesktopNav.setActiveTab("pagamentos");
    } else {
      // No mobile/tablet, usa navegação normal
      navigation.navigate("StudentTabs" as never, { screen: "Pagamento" } as never);
    }
  }, [handleDismiss, navigation, isDesktopMode, studentDesktopNav]);

  // Retorna null se não houver notificação para mostrar
  if (!currentNotification) return null;

  const getNotificationColor = (type: NotificationType) => {
    switch (type) {
      case "new_invoice": return colors.purple;
      case "upcoming_due": return "#D97706";
      case "overdue": return "#DC2626";
      default: return colors.purple;
    }
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case "new_invoice": return "receipt";
      case "upcoming_due": return "notifications";
      case "overdue": return "warning";
      default: return "information-circle";
    }
  };

  const color = getNotificationColor(currentNotification.type);
  const icon = getNotificationIcon(currentNotification.type);

  return (
    <Modal visible={true} transparent animationType="fade">
      <Pressable style={styles.overlay} onPress={handleDismiss}>
        <View style={styles.container}>
          <View style={[styles.card, { borderLeftColor: color }]}>
            <View style={[styles.iconBox, { backgroundColor: color + "20" }]}>
              <Ionicons name={icon as any} size={28} color={color} />
            </View>
            
            <View style={styles.content}>
              <Text style={styles.title}>{currentNotification.title}</Text>
              <Text style={styles.message}>{currentNotification.message}</Text>
              
              {currentNotification.invoice?.amount && (
                <View style={styles.amountBox}>
                  <Text style={styles.amountLabel}>Valor:</Text>
                  <Text style={[styles.amountValue, { color }]}>
                    {formatCurrency(currentNotification.invoice.amount)}
                  </Text>
                </View>
              )}
            </View>
            
            <Pressable style={styles.dismissBtn} onPress={handleDismiss}>
              <Ionicons name="close" size={22} color="#64748B" />
            </Pressable>
          </View>
          
          <Pressable style={[styles.actionBtn, { backgroundColor: color }]} onPress={handleGoToPayments}>
            <Ionicons name="card" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Ver Pagamentos</Text>
          </Pressable>
          
          {notificationQueue.length > 0 && (
            <Text style={styles.queueHint}>
              +{notificationQueue.length} {notificationQueue.length === 1 ? 'notificação' : 'notificações'}
            </Text>
          )}
          
          <Text style={styles.tapHint}>Toque fora para fechar</Text>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  container: {
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
  },
  card: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderLeftWidth: 4,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 6,
  },
  message: {
    fontSize: 14,
    color: "#64748B",
    lineHeight: 20,
    marginBottom: 8,
  },
  amountBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  amountLabel: {
    fontSize: 13,
    color: "#94A3B8",
    fontWeight: "600",
  },
  amountValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  dismissBtn: {
    padding: 4,
  },
  actionBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  queueHint: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.9)",
    fontWeight: "600",
    marginBottom: 4,
  },
  tapHint: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.7)",
    marginTop: 4,
  },
});
