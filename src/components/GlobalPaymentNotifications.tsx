import React, { useEffect, useState, useRef, useCallback } from "react";
import { View, Text, StyleSheet, Modal, Pressable, Platform } from "react-native";
import { Ionicons } from "@/shims/icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
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

type NotificationType = "new_invoice" | "upcoming_due" | "overdue" | "payment_confirmed";

interface FloatingNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  invoice?: Invoice;
  priority: number; // Maior = mais urgente
  voucherCode?: string; // Código do voucher se for ingresso de evento
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
  const { subscribeToInvoices, fetchVoucherByInvoiceId } = usePayment();
  const navigation = useNavigation();
  const { isDesktopMode } = useDesktop();
  const studentDesktopNav = useStudentDesktopNav();
  
  const [currentNotification, setCurrentNotification] = useState<FloatingNotification | null>(null);
  const [notificationQueue, setNotificationQueue] = useState<FloatingNotification[]>([]);
  
  // Chave para armazenar notificações de pagamento já vistas
  const SEEN_PAYMENT_NOTIFICATIONS_KEY = "@cdmf_seen_payment_notifications";
  
  // Função auxiliar para salvar no storage (compatível com web e mobile)
  const saveToStorage = useCallback(async (key: string, value: string) => {
    try {
      if (Platform.OS === "web") {
        // Na web, usa localStorage diretamente
        localStorage.setItem(key, value);
      } else {
        // No mobile, usa AsyncStorage
        await AsyncStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn("Erro ao salvar no storage:", e);
    }
  }, []);
  
  // Função auxiliar para carregar do storage (compatível com web e mobile)
  const loadFromStorage = useCallback(async (key: string): Promise<string | null> => {
    try {
      if (Platform.OS === "web") {
        // Na web, usa localStorage diretamente
        return localStorage.getItem(key);
      } else {
        // No mobile, usa AsyncStorage
        return await AsyncStorage.getItem(key);
      }
    } catch (e) {
      console.warn("Erro ao carregar do storage:", e);
      return null;
    }
  }, []);
  
  // Controle de notificações já mostradas nesta sessão (por invoice ID e tipo)
  const shownNotificationsRef = useRef<Set<string>>(new Set());
  // IDs de faturas conhecidas (para detectar novas)
  const knownInvoiceIdsRef = useRef<Set<string>>(new Set());
  // Estado anterior das faturas para detectar mudanças de status
  const previousInvoicesRef = useRef<Invoice[]>([]);
  // Flag para indicar se é a primeira carga
  const isFirstLoadRef = useRef(true);
  // IDs de notificações de pagamento já vistas (persistido)
  const seenPaymentNotificationsRef = useRef<Set<string>>(new Set());
  const [seenPaymentNotificationsLoaded, setSeenPaymentNotificationsLoaded] = useState(false);

  // Carrega notificações de pagamento já vistas do storage
  useEffect(() => {
    if (!profile?.uid || seenPaymentNotificationsLoaded) return;
    
    const loadSeenNotifications = async () => {
      try {
        const stored = await loadFromStorage(SEEN_PAYMENT_NOTIFICATIONS_KEY);
        if (stored) {
          const seenIds = JSON.parse(stored) as string[];
          seenPaymentNotificationsRef.current = new Set(seenIds);
          // Também adiciona ao ref de notificações mostradas
          seenIds.forEach(id => {
            shownNotificationsRef.current.add(`payment_confirmed_${id}`);
          });
        }
        setSeenPaymentNotificationsLoaded(true);
      } catch (e) {
        console.warn("Erro ao carregar notificações vistas:", e);
        setSeenPaymentNotificationsLoaded(true);
      }
    };
    
    loadSeenNotifications();
  }, [profile?.uid, seenPaymentNotificationsLoaded, loadFromStorage]);

  // Salva notificação de pagamento como vista no storage
  const markPaymentNotificationAsSeen = useCallback(async (invoiceId: string) => {
    try {
      // Adiciona ao ref imediatamente
      seenPaymentNotificationsRef.current.add(invoiceId);
      shownNotificationsRef.current.add(`payment_confirmed_${invoiceId}`);
      
      // Salva no storage
      const seenArray = Array.from(seenPaymentNotificationsRef.current);
      await saveToStorage(SEEN_PAYMENT_NOTIFICATIONS_KEY, JSON.stringify(seenArray));
    } catch (e) {
      // Erro silencioso
    }
  }, [saveToStorage]);

  // Processa faturas e gera notificações
  const processInvoices = useCallback((invoices: Invoice[]) => {
    if (!profile?.uid) return;
    
    // Se o storage ainda não carregou, armazena as faturas para processar depois
    if (!seenPaymentNotificationsLoaded) {
      pendingInvoicesRef.current = invoices;
      return;
    }
    
    // Função auxiliar para salvar notificação como vista
    const saveNotificationAsSeen = (invoiceId: string) => {
      seenPaymentNotificationsRef.current.add(invoiceId);
      const seenArray = Array.from(seenPaymentNotificationsRef.current);
      saveToStorage(SEEN_PAYMENT_NOTIFICATIONS_KEY, JSON.stringify(seenArray)).catch(e => {
        console.warn("Erro ao salvar notificação vista:", e);
      });
    };

    const newNotifications: FloatingNotification[] = [];
    const upcomingThreshold = 3; // 3 dias antes do vencimento

    // Na primeira carga, registra os IDs e estado inicial das faturas
    if (isFirstLoadRef.current) {
      invoices.forEach(inv => knownInvoiceIdsRef.current.add(inv.id));
      previousInvoicesRef.current = [...invoices];
      isFirstLoadRef.current = false;
      
      // Verifica pagamentos confirmados recentemente (últimas 24 horas) para mostrar notificação
      const now = Date.now();
      const oneDayAgo = now - (24 * 60 * 60 * 1000); // 24 horas em milissegundos
      
      for (const invoice of invoices) {
        // Verifica se é um pagamento confirmado
        if (invoice.status === "paid" && invoice.paidAt) {
          const notificationKey = `payment_confirmed_${invoice.id}`;
          // Verifica se já foi vista (tanto na sessão atual quanto no storage)
          const seenInSession = shownNotificationsRef.current.has(notificationKey);
          const seenInStorage = seenPaymentNotificationsRef.current.has(invoice.id);
          const alreadySeen = seenInSession || seenInStorage;
          
          // Só mostra se não foi vista E se foi confirmado nas últimas 24 horas
          if (!alreadySeen && invoice.paidAt >= oneDayAgo) {
            // Verifica se é ingresso de evento
            const isEventTicket = invoice.type === "baile" || 
                                  invoice.type === "workshop" || 
                                  invoice.type === "outro" ||
                                  invoice.description?.startsWith("Ingresso:") || 
                                  invoice.description?.includes("Ingresso:");
            
            let message = `Seu pagamento de ${formatCurrency(invoice.amount)} foi confirmado com sucesso!`;
            
            if (isEventTicket) {
              message = `Pagamento confirmado! Seu voucher foi gerado. Acesse a aba de pagamentos para ver o código.`;
            }
            
            newNotifications.push({
              id: notificationKey,
              type: "payment_confirmed",
              title: "✅ Pagamento Confirmado!",
              message: message,
              invoice,
              priority: 4, // Maior prioridade - pagamento confirmado
            });
            // Marca como mostrada na sessão atual
            shownNotificationsRef.current.add(notificationKey);
            // IMPORTANTE: Também marca no storage imediatamente para evitar que apareça novamente
            // mesmo se a página recarregar antes do usuário fechar
            saveNotificationAsSeen(invoice.id);
          }
        }
        
        // Verifica contas atrasadas (apenas se não estiver paga ou cancelada)
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
              priority: 3, // Prioridade alta
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

    // Detecta mudanças de status para pagamento confirmado (maior prioridade)
    const previousPending = previousInvoicesRef.current.filter(
      inv => inv.status === "pending" || inv.status === "overdue"
    );
    
      for (const prevInv of previousPending) {
      const currentInv = invoices.find(inv => inv.id === prevInv.id);
      if (currentInv && currentInv.status === "paid") {
        // Pagamento confirmado! Verifica se já mostrou esta notificação
        const notificationKey = `payment_confirmed_${currentInv.id}`;
        // Verifica se já foi vista (tanto na sessão atual quanto no storage)
        const alreadySeen = shownNotificationsRef.current.has(notificationKey) || 
                           seenPaymentNotificationsRef.current.has(currentInv.id);
        if (!alreadySeen) {
          // Verifica se é ingresso de evento (para incluir voucher se existir)
          const isEventTicket = currentInv.type === "baile" || 
                                currentInv.type === "workshop" || 
                                currentInv.type === "outro" ||
                                currentInv.description?.startsWith("Ingresso:") || 
                                currentInv.description?.includes("Ingresso:");
          
          let message = `Seu pagamento de ${formatCurrency(currentInv.amount)} foi confirmado com sucesso!`;
          
          if (isEventTicket) {
            // Para ingressos de evento, mostra mensagem específica sobre voucher
            // O código do voucher será buscado quando necessário
            message = `Pagamento confirmado! Seu voucher foi gerado. Acesse a aba de pagamentos para ver o código.`;
          }
          
          newNotifications.push({
            id: notificationKey,
            type: "payment_confirmed",
            title: "✅ Pagamento Confirmado!",
            message: message,
            invoice: currentInv,
            priority: 4, // Maior prioridade - pagamento confirmado
          });
          // Marca como mostrada na sessão atual
          shownNotificationsRef.current.add(notificationKey);
          // IMPORTANTE: Também marca no storage imediatamente para evitar que apareça novamente
          // mesmo se a página recarregar antes do usuário fechar
          saveNotificationAsSeen(currentInv.id);
        }
      }
    }
    
    // Atualiza referência anterior para próxima verificação
    previousInvoicesRef.current = [...invoices];

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
            title: "⏰ Vencimento Próximo",
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
            title: "🆕 Nova Cobrança",
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
  }, [profile?.uid, seenPaymentNotificationsLoaded, saveToStorage]);

  // Armazena as últimas faturas recebidas para processar depois que o storage carregar
  const pendingInvoicesRef = useRef<Invoice[] | null>(null);

  // Use ref to store latest processInvoices to avoid re-subscribing on every function change
  const processInvoicesRef = useRef(processInvoices);
  useEffect(() => {
    processInvoicesRef.current = processInvoices;
  }, [processInvoices]);

  // Listener em tempo real para faturas - stable subscription
  useEffect(() => {
    if (!profile?.uid || profile.role !== "student") return;

    // Use ref to call latest processInvoices without re-subscribing
    const handleInvoices = (invoices: Invoice[]) => {
      processInvoicesRef.current(invoices);
    };

    const unsubscribe = subscribeToInvoices(profile.uid, handleInvoices);

    return () => unsubscribe();
  }, [profile?.uid, profile?.role, subscribeToInvoices]);

  // Quando o storage terminar de carregar, processa as faturas pendentes se houver
  useEffect(() => {
    if (seenPaymentNotificationsLoaded && pendingInvoicesRef.current) {
      const invoices = pendingInvoicesRef.current;
      pendingInvoicesRef.current = null;
      processInvoices(invoices);
    }
  }, [seenPaymentNotificationsLoaded, processInvoices]);

  // Estado para armazenar vouchers buscados
  const [voucherCache, setVoucherCache] = useState<Record<string, string>>({});

  // Busca voucher quando necessário (para notificações de pagamento confirmado de eventos)
  useEffect(() => {
    if (!currentNotification || currentNotification.type !== "payment_confirmed") return;
    
    const invoice = currentNotification.invoice;
    if (!invoice || !fetchVoucherByInvoiceId) return;
    
    // Verifica se é ingresso de evento e se já temos o voucher no cache
    const isEventTicket = invoice.type === "baile" || 
                          invoice.type === "workshop" || 
                          invoice.type === "outro" ||
                          invoice.description?.startsWith("Ingresso:") || 
                          invoice.description?.includes("Ingresso:");
    
    if (isEventTicket && !voucherCache[invoice.id]) {
      // Busca o voucher de forma assíncrona
      fetchVoucherByInvoiceId(invoice.id).then(voucher => {
        if (voucher) {
          setVoucherCache(prev => ({ ...prev, [invoice.id]: voucher.voucherCode }));
        }
      }).catch(() => {
        // Ignora erros na busca do voucher
      });
    }
  }, [currentNotification, fetchVoucherByInvoiceId, voucherCache]);

  // Mostra a próxima notificação da fila
  useEffect(() => {
    if (notificationQueue.length > 0 && !currentNotification) {
      const next = notificationQueue[0];
      setCurrentNotification(next);
      setNotificationQueue(prev => prev.slice(1));
      
      // Se for notificação de pagamento confirmado, marca como "em exibição" imediatamente
      // para evitar que seja adicionada novamente à fila se a página recarregar
      if (next.type === "payment_confirmed" && next.invoice?.id) {
        shownNotificationsRef.current.add(`payment_confirmed_${next.invoice.id}`);
      }
    }
  }, [notificationQueue, currentNotification]);

  // Dispensa a notificação atual
  const handleDismiss = useCallback(() => {
    // Se for notificação de pagamento confirmado, marca como vista antes de fechar
    const notification = currentNotification;
    if (notification?.type === "payment_confirmed" && notification.invoice?.id) {
      markPaymentNotificationAsSeen(notification.invoice.id);
    }
    setCurrentNotification(null);
  }, [currentNotification, markPaymentNotificationAsSeen]);

  // Navega para a tela de pagamentos
  const handleGoToPayments = useCallback(() => {
    // Se for notificação de pagamento confirmado, marca como vista antes de fechar
    const notification = currentNotification;
    if (notification?.type === "payment_confirmed" && notification.invoice?.id) {
      markPaymentNotificationAsSeen(notification.invoice.id);
    }
    // Fecha o modal primeiro
    setCurrentNotification(null);
    
    // Pequeno delay para garantir que o estado seja atualizado antes de navegar
    setTimeout(() => {
      // No desktop, usa o contexto de navegação do desktop
      if (isDesktopMode && studentDesktopNav) {
        studentDesktopNav.setActiveTab("pagamentos");
      } else {
        // No mobile/tablet, usa navegação normal
        navigation.navigate("StudentTabs" as never, { screen: "Pagamento" } as never);
      }
    }, 100);
  }, [navigation, isDesktopMode, studentDesktopNav]);

  // Retorna null se não houver notificação para mostrar
  if (!currentNotification) return null;

  const getNotificationColor = (type: NotificationType) => {
    switch (type) {
      case "new_invoice": return colors.purple;
      case "upcoming_due": return "#D97706";
      case "overdue": return "#DC2626";
      case "payment_confirmed": return "#10B981";
      default: return colors.purple;
    }
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case "new_invoice": return "receipt";
      case "upcoming_due": return "notifications";
      case "overdue": return "warning";
      case "payment_confirmed": return "checkmark-circle";
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
              <Text style={styles.message}>
                {currentNotification.type === "payment_confirmed" && 
                 currentNotification.invoice && 
                 voucherCache[currentNotification.invoice.id] 
                  ? `Pagamento confirmado! Seu voucher: ${voucherCache[currentNotification.invoice.id]}. Apresente este código na entrada.`
                  : currentNotification.message}
              </Text>
              
              {currentNotification.invoice?.amount && (
                <View style={styles.amountBox}>
                  <Text style={styles.amountLabel}>Valor:</Text>
                  <Text style={[styles.amountValue, { color }]}>
                    {formatCurrency(currentNotification.invoice.amount)}
                  </Text>
                </View>
              )}
              
              {currentNotification.type === "payment_confirmed" && 
               currentNotification.invoice && 
               voucherCache[currentNotification.invoice.id] && (
                <View style={[styles.voucherBox, { backgroundColor: color + "20" }]}>
                  <Ionicons name="ticket" size={16} color={color} />
                  <Text style={[styles.voucherCode, { color }]}>
                    {voucherCache[currentNotification.invoice.id]}
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
  voucherBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  voucherCode: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 1,
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


