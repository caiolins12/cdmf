import React, { useEffect, useState, useRef, useCallback, useMemo, memo } from "react";
import { View, StyleSheet, ScrollView, Text, Dimensions, FlatList, Pressable, Platform, ActivityIndicator, Modal, Animated, Image, TextInput } from "react-native";
import { Ionicons } from "@/shims/icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";

import CdmfHeader from "../../components/CdmfHeader";
import SectionHeader from "../../components/SectionHeader";
import StudentHeader from "../../components/StudentHeader";
import LessonCard from "../../components/LessonCard";
import EventInvitationModal from "../../components/EventInvitationModal";
import { colors } from "../../theme/colors";
import { useAuth, Class, PaymentNotification, Event, formatDateDisplay } from "../../contexts/AuthContext";
import { useDesktop } from "../../contexts/DesktopContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useActivity } from "../../contexts/ActivityContext";
import { showMessage, showSuccess, showError, showWarning, showInfo, showConfirm } from "../../utils/alert";
import { useStudentDesktopNav } from "../../contexts/StudentDesktopNavigationContext";
import { Linking } from "react-native";
import { formatCurrency, usePayment, Invoice, BaileVoucher } from "../../contexts/PaymentContext";
import { useWhatsAppContact } from "../../utils/whatsapp";

// Mapeamento de estilos de dança para ícones (mesmo do LessonCard)
const DANCE_ICONS: Record<string, any> = {
  // Forró e variações
  "forró": { uri: new URL("../../../assets/dance_ico1.png", import.meta.url).href },
  "forro": { uri: new URL("../../../assets/dance_ico1.png", import.meta.url).href },
  "forró universitário": { uri: new URL("../../../assets/dance_ico1.png", import.meta.url).href },
  "forró pé de serra": { uri: new URL("../../../assets/dance_ico1.png", import.meta.url).href },
  "xote": { uri: new URL("../../../assets/dance_ico1.png", import.meta.url).href },
  "baião": { uri: new URL("../../../assets/dance_ico1.png", import.meta.url).href },
  
  // Dança de Salão e variações
  "dança de salão": { uri: new URL("../../../assets/dance_ico2.png", import.meta.url).href },
  "danca de salao": { uri: new URL("../../../assets/dance_ico2.png", import.meta.url).href },
  "bolero": { uri: new URL("../../../assets/dance_ico2.png", import.meta.url).href },
  "valsa": { uri: new URL("../../../assets/dance_ico2.png", import.meta.url).href },
  "tango": { uri: new URL("../../../assets/dance_ico2.png", import.meta.url).href },
  "foxtrote": { uri: new URL("../../../assets/dance_ico2.png", import.meta.url).href },
  "quickstep": { uri: new URL("../../../assets/dance_ico2.png", import.meta.url).href },
  
  // Samba e variações
  "samba de gafieira": { uri: new URL("../../../assets/dance_ico3.png", import.meta.url).href },
  "samba": { uri: new URL("../../../assets/dance_ico3.png", import.meta.url).href },
  "gafieira": { uri: new URL("../../../assets/dance_ico3.png", import.meta.url).href },
  "pagode": { uri: new URL("../../../assets/dance_ico3.png", import.meta.url).href },
  "samba rock": { uri: new URL("../../../assets/dance_ico3.png", import.meta.url).href },
  "samba no pé": { uri: new URL("../../../assets/dance_ico3.png", import.meta.url).href },
  
  // Zouk, Kizomba e variações
  "zouk": { uri: new URL("../../../assets/dance_ico4.png", import.meta.url).href },
  "zouk brasileiro": { uri: new URL("../../../assets/dance_ico4.png", import.meta.url).href },
  "kizomba": { uri: new URL("../../../assets/dance_ico4.png", import.meta.url).href },
  "bachata": { uri: new URL("../../../assets/dance_ico4.png", import.meta.url).href },
  "lambada": { uri: new URL("../../../assets/dance_ico4.png", import.meta.url).href },
  "lambazouk": { uri: new URL("../../../assets/dance_ico4.png", import.meta.url).href },
  "salsa": { uri: new URL("../../../assets/dance_ico4.png", import.meta.url).href },
  "merengue": { uri: new URL("../../../assets/dance_ico4.png", import.meta.url).href },
  
  // Ícone padrão
  "default": { uri: new URL("../../../assets/dance_ico1.png", import.meta.url).href },
};

// Função para obter o ícone baseado no nome da aula
const getDanceIcon = (lessonName: string) => {
  const normalizedName = lessonName.toLowerCase().trim();
  
  // Procura correspondência exata primeiro
  if (DANCE_ICONS[normalizedName]) {
    return DANCE_ICONS[normalizedName];
  }
  
  // Procura correspondência parcial
  for (const key of Object.keys(DANCE_ICONS)) {
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return DANCE_ICONS[key];
    }
  }
  
  // Retorna ícone padrão
  return DANCE_ICONS["default"];
};

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_MARGIN = 24;
const AUTO_SCROLL_INTERVAL = 8000; // 8 segundos
const isWeb = Platform.OS === "web";

// Função segura para formatar data no formato DD/MM/YYYY
const formatDateSafe = (dateStr: any): string => {
  if (!dateStr || typeof dateStr !== 'string') return '--/--/----';
  try {
    return dateStr.split("-").reverse().join("/");
  } catch {
    return '--/--/----';
  }
};

// Avisos do carrossel (constante fora do componente)
const ANNOUNCEMENTS = [
  {
    id: "1",
    title: "Bem-vindo ao CDMF!",
    message: "Confira sua agenda de aulas e não perca nenhuma.",
    icon: "megaphone",
    bgColor: "#5C2D91",
  },
  {
    id: "2",
    title: "Mantenha-se Atualizado",
    message: "Acompanhe regularmente sua agenda e informações importantes.",
    icon: "notifications",
    bgColor: "#2E7D32",
  },
  {
    id: "3",
    title: "Pratique com Regularidade",
    message: "A prática constante é essencial para o seu desenvolvimento.",
    icon: "musical-notes",
    bgColor: "#1565C0",
  },
  {
    id: "4",
    title: "Fique por Dentro",
    message: "Acesse a seção de eventos para conferir atividades e novidades.",
    icon: "calendar",
    bgColor: "#C62828",
  },
] as const;

const DAYS_OF_WEEK = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;
const DAYS_OF_WEEK_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

// Componente de aviso memoizado
const AnnouncementCard = memo(function AnnouncementCard({ 
  item 
}: { 
  item: typeof ANNOUNCEMENTS[number] 
}) {
  return (
    <View style={styles.announcementCardWrapper}>
      <View style={[styles.announcementCard, { backgroundColor: item.bgColor }]}>
        <View style={styles.announcementIcon}>
          <Ionicons name={item.icon as any} size={32} color="#fff" />
        </View>
        <View style={styles.announcementTextContainer}>
          <Text style={styles.announcementTitle}>{item.title}</Text>
          <Text style={styles.announcementMessage}>{item.message}</Text>
        </View>
      </View>
    </View>
  );
});

// Componente de aula memoizado
const ClassCard = memo(function ClassCard({ 
  classItem, 
  getNextClassInfo 
}: { 
  classItem: Class;
  getNextClassInfo: (c: Class) => { day: string; dayShort: string; date: string; time: string; daysUntil: number } | null;
}) {
  const nextClass = getNextClassInfo(classItem);
  return (
    <View style={styles.classCardWrapper}>
      <LessonCard
        teacher={classItem.teacherName || "Sem professor"}
        lesson={classItem.name}
        date={nextClass?.date || ""}
        time={nextClass?.time || ""}
        dayLabel={nextClass?.daysUntil === 0 ? "HOJE" : nextClass?.daysUntil === 1 ? "AMANHÃ" : nextClass?.day}
      />
    </View>
  );
});

// Dot indicator memoizado
const DotIndicator = memo(function DotIndicator({ 
  index, 
  isActive, 
  onPress 
}: { 
  index: number; 
  isActive: boolean; 
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
    >
      <View style={[styles.dot, isActive && styles.dotActive]} />
    </Pressable>
  );
});

function StudentHomeScreen() {
  const { profile, user, fetchClasses, fetchEvents, confirmEventAttendance, rejectEventAttendance, updateProfile, refreshProfile, profileDeleted, logout } = useAuth();
  const { fetchInvoices, createInvoice, fetchVoucherByInvoiceId, fetchVoucherByEventId, createBaileVoucher, deleteVoucher, subscribeToInvoices, deleteInvoice, updateInvoice, createGuestInvoice } = usePayment();
  const { isDesktopMode } = useDesktop();
  const { colors: themeColors, isDark } = useTheme();
  const { logActivity } = useActivity();
  const desktopNav = useStudentDesktopNav();
  const navigation = useNavigation<any>();
  const { buildUrl: buildWhatsAppUrl } = useWhatsAppContact();

  // ========== TODOS OS ESTADOS PRIMEIRO ==========
  const [myClasses, setMyClasses] = useState<Class[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [eventVouchers, setEventVouchers] = useState<Record<string, any>>({});
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);
  // Controla qual evento está em processamento (action = "join" | "cancel" | "invoice" | "voucher" | "view_voucher")
  const [loadingEventAction, setLoadingEventAction] = useState<{ id: string; action: string } | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showDeletedModal, setShowDeletedModal] = useState(false);
  const [showDeactivatedModal, setShowDeactivatedModal] = useState(false);
  const [showEventInvitation, setShowEventInvitation] = useState(false);
  const [currentInvitation, setCurrentInvitation] = useState<PaymentNotification | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<PaymentNotification[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [showCompanionModal, setShowCompanionModal] = useState(false);
  const [companionModalTab, setCompanionModalTab] = useState<"pay" | "invite">("pay");
  const [companionName, setCompanionName] = useState("");
  const [companionPhone, setCompanionPhone] = useState("");
  const [companionEvent, setCompanionEvent] = useState<Event | null>(null);
  const [creatingCompanion, setCreatingCompanion] = useState(false);

  // ========== TODOS OS REFS ==========
  const previousInvoicesRef = useRef<Invoice[]>([]);
  const loadingEventsRef = useRef(false);
  const eventsLoadedRef = useRef(false);
  // Eventos cancelados explicitamente pelo aluno nesta sessão — impede o auto-reconfirm do loadEvents
  const cancelledEventIdsRef = useRef<Set<string>>(new Set());
  const scrollViewRef = useRef<ScrollView>(null);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const processingInvitationRef = useRef(false);
  const initialInvitationShownRef = useRef(false);
  const shownInvitationIdsRef = useRef<Set<string>>(new Set());
  const showEventInvitationRef = useRef(showEventInvitation);

  // Link do WhatsApp dinâmico baseado nas configurações

  // Chave para armazenar convites mostrados (persiste durante a sessão do navegador)
  const SHOWN_INVITATIONS_KEY = `@cdmf_shown_invitations_${profile?.uid || 'guest'}`;

  // ========== FUNÇÕES E CALLBACKS ==========

  // Carrega IDs de convites já mostrados do sessionStorage
  useEffect(() => {
    if (!profile?.uid) return;

    try {
      if (Platform.OS === "web") {
        const stored = sessionStorage.getItem(SHOWN_INVITATIONS_KEY);
        if (stored) {
          const ids = JSON.parse(stored) as string[];
          shownInvitationIdsRef.current = new Set(ids);
        }
      }
    } catch (e) {
      console.warn("Erro ao carregar convites mostrados:", e);
    }
  }, [profile?.uid]);

  // Salva IDs de convites mostrados no sessionStorage
  const saveShownInvitations = useCallback(() => {
    if (!profile?.uid) return;

    try {
      if (Platform.OS === "web") {
        const ids = Array.from(shownInvitationIdsRef.current);
        sessionStorage.setItem(SHOWN_INVITATIONS_KEY, JSON.stringify(ids));
      }
    } catch (e) {
      console.warn("Erro ao salvar convites mostrados:", e);
    }
  }, [profile?.uid, SHOWN_INVITATIONS_KEY]);

  // Marca notificação como lida
  const markNotificationAsRead = async (notificationId: string) => {
    if (!profile?.uid || !profile.pendingNotifications) return;

    try {
      const updatedNotifications = profile.pendingNotifications.map(n =>
        n.id === notificationId ? { ...n, read: true } : n
      );
      await updateProfile(profile.uid, { pendingNotifications: updatedNotifications });
    } catch (e) {
      console.error("Erro ao marcar notificação como lida:", e);
    }
  };

  // Mostra próximo convite pendente
  const showNextInvitation = useCallback((excludeId?: string) => {
    // Evita chamadas simultâneas
    if (processingInvitationRef.current) return;

    processingInvitationRef.current = true;

    // Aguarda um tempo para garantir que os estados foram atualizados
    setTimeout(() => {
      const remaining = pendingInvitations.filter(inv => {
        // Exclui o convite atual (por ID)
        if (excludeId && inv.id === excludeId) return false;
        // Inclui apenas não lidos
        return !inv.read;
      });

      if (remaining.length > 0) {
        setCurrentInvitation(remaining[0]);
        setShowEventInvitation(true);
      } else {
        setCurrentInvitation(null);
        setShowEventInvitation(false);
      }

      processingInvitationRef.current = false;
    }, 100);
  }, [pendingInvitations]);

  // Pega o primeiro nome do usuário logado - memoizado
  const studentName = useMemo(() => {
    if (profile?.name) {
      return profile.name.split(" ")[0];
    }
    if (user?.displayName) {
      return user.displayName.split(" ")[0];
    }
    return "Aluno";
  }, [profile?.name, user?.displayName]);

  // Atualiza a lista de convites pendentes
  // IMPORTANTE: NÃO abre o modal aqui - isso é responsabilidade EXCLUSIVA do listener em tempo real abaixo
  // Este useEffect serve apenas para manter o estado pendingInvitations sincronizado
  useEffect(() => {
    if (profile?.pendingNotifications) {
      const eventInvitations = profile.pendingNotifications.filter(
        (n: PaymentNotification) => {
          // Inclui convites de evento e lembretes de evento que não foram lidos
          const isEventRelated = n.type === "event_invitation" ||
                                 (n.type === "reminder" && (n.voucherId || n.eventId));
          return isEventRelated && !n.read;
        }
      );
      setPendingInvitations(eventInvitations);
    } else {
      // Se não há notificações, limpa os estados
      setPendingInvitations([]);
    }
  }, [profile?.pendingNotifications]);

  // Mantém as refs atualizadas
  useEffect(() => {
    showEventInvitationRef.current = showEventInvitation;
  }, [showEventInvitation]);

  // Ref para saveShownInvitations (para usar no listener)
  const saveShownInvitationsRef = useRef(saveShownInvitations);
  useEffect(() => {
    saveShownInvitationsRef.current = saveShownInvitations;
  }, [saveShownInvitations]);

  // Listener em tempo real para convites de eventos (funciona mesmo com app aberto)
  useEffect(() => {
    if (!profile?.uid) return;

    let unsubscribe: (() => void) | null = null;
    let isMounted = true;

    const setupListener = async () => {
      try {
        const { doc, onSnapshot } = await import("../../services/postgresFirestoreCompat");
        const { db } = await import("../../services/firebase");

        if (!isMounted) return;

        const profileRef = doc(db, "profiles", profile.uid);

        unsubscribe = onSnapshot(profileRef, (snapshot) => {
          if (!isMounted) return;

          if (snapshot.exists()) {
            const data = snapshot.data();
            const notifications = data?.pendingNotifications || [];

            // Filtra convites de eventos não lidos
            const eventInvitations = notifications.filter(
              (n: PaymentNotification) => {
                const isEventRelated = n.type === "event_invitation" ||
                                       (n.type === "reminder" && (n.voucherId || n.eventId));
                return isEventRelated && !n.read;
              }
            );

            // Verifica se há novos convites que não foram mostrados ainda
            const newInvitations = eventInvitations.filter(
              (inv: PaymentNotification) => !shownInvitationIdsRef.current.has(inv.id)
            );

            // Se encontrou novos convites e o modal não está aberto (usa refs para evitar dependência no useEffect)
            if (newInvitations.length > 0 && !showEventInvitationRef.current && profile?.phoneVerified && !processingInvitationRef.current) {
              setPendingInvitations(eventInvitations);
              setCurrentInvitation(newInvitations[0]);
              setShowEventInvitation(true);
              shownInvitationIdsRef.current.add(newInvitations[0].id);
              // Salva no sessionStorage
              saveShownInvitationsRef.current();
            }
          }
        }, (error) => {
          console.error("Erro no listener de convites:", error);
        });
      } catch (error) {
        console.error("Erro ao configurar listener de convites:", error);
      }
    };

    setupListener();

    return () => {
      isMounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [profile?.uid]); // Apenas depende do uid do perfil

  // Verifica se o perfil foi deletado
  // IMPORTANTE: Este modal só aparece se o perfil foi deletado DURANTE a sessão ativa
  // (ou seja, o perfil existia e foi deletado enquanto o usuário estava usando o app)
  // Se o perfil já foi deletado antes do login, o App.tsx já trata isso globalmente
  useEffect(() => {
    // Só mostra o modal se:
    // 1. profileDeleted é true (perfil foi deletado)
    // 2. Há um usuário logado
    // 3. Não há perfil (foi realmente deletado)
    // Isso garante que não aparece para novos usuários (que também não têm perfil)
    if (profileDeleted && user && !profile) {
      setShowDeletedModal(true);
    } else {
      // Se o perfil existe novamente, fecha o modal (caso raro: perfil foi recriado)
      setShowDeletedModal(false);
    }
  }, [profileDeleted, user, profile]);

  // Verifica se o perfil foi desativado
  useEffect(() => {
    if (profile?.enrollmentStatus === "inativo" && profile.deactivatedAt && !profile.deactivationNotificationSeen) {
      setShowDeactivatedModal(true);
    }
  }, [profile?.enrollmentStatus, profile?.deactivatedAt, profile?.deactivationNotificationSeen]);

  // Fecha o modal de conta deletada e faz logout (permite criar nova conta - não é banimento)
  const handleDeletedModalClose = async () => {
    setShowDeletedModal(false);
    await logout();
  };

  // Dispensa a notificação de desativação
  const handleDismissDeactivation = async () => {
    if (!profile?.uid) return;
    try {
      await updateProfile(profile.uid, { deactivationNotificationSeen: true });
      setShowDeactivatedModal(false);
    } catch (e) {
      console.error("Erro ao dispensar notificação de desativação:", e);
      setShowDeactivatedModal(false);
    }
  };

  // Abre WhatsApp para contato
  const handleContactWhatsApp = (message?: string) => {
    Linking.openURL(
      buildWhatsAppUrl(message || "Olá! Preciso de ajuda com minha conta, matrícula ou informações no app do CDMF.")
    );
  };

  // Verifica sempre que a tela ganha foco
  useFocusEffect(
    useCallback(() => {
      refreshProfile?.();
    }, [refreshProfile])
  );

  // Carrega as turmas do aluno
  const loadClasses = useCallback(async () => {
    if (!profile?.uid) {
      setLoading(false);
      return;
    }
    
    try {
      const allClasses = await fetchClasses();
      const enrolledClasses = allClasses.filter(c => 
        c.active && c.studentIds?.includes(profile.uid)
      );
      setMyClasses(enrolledClasses);
    } catch (e) {
      console.error("Erro ao carregar turmas:", e);
    } finally {
      setLoading(false);
    }
  }, [profile?.uid, fetchClasses]);

  // Carrega os eventos ativos
  const loadEvents = useCallback(async () => {
    if (!profile?.uid) {
      setLoadingEvents(false);
      return;
    }
    
    // Evita múltiplas chamadas simultâneas
    if (loadingEventsRef.current) {
      return;
    }
    
    loadingEventsRef.current = true;
    
    // Só mostra loading se for a primeira vez
    // Isso evita o flicker "Carregando" <-> "Nenhum evento" em recarregamentos
    if (!eventsLoadedRef.current) {
      setLoadingEvents(true);
    }
    try {
      const [allEvents, allInvoices] = await Promise.all([
        fetchEvents({ active: true }),
        fetchInvoices({ studentId: profile.uid })
      ]);

      // Confirma presença automaticamente quando o ingresso é pago
      // Não reconferma eventos que o aluno cancelou explicitamente nesta sessão
      for (const event of allEvents) {
        if (cancelledEventIdsRef.current.has(event.id)) continue;
        // Se o evento requer pagamento e o aluno ainda não está confirmado
        if (event.requiresPayment && event.price && !event.confirmedStudentIds.includes(profile.uid)) {
          // Verifica se existe invoice pago para este evento
          const paidInvoice = allInvoices.find(inv =>
            inv.description?.includes(`Ingresso: ${event.name}`) &&
            inv.studentId === profile.uid &&
            inv.status === "paid"
          );

          if (paidInvoice) {
            try {
              await confirmEventAttendance(event.id);

              // Atualiza o evento na lista local para refletir a confirmação
              event.confirmedStudentIds.push(profile.uid);

              // Cria notificação de confirmação
              await logActivity({
                type: "event_updated",
                title: "✅ Presença Confirmada",
                description: `Sua presença no evento "${event.name}" foi confirmada após o pagamento do ingresso!`,
                metadata: {
                  eventId: event.id,
                  eventName: event.name,
                },
              });
            } catch (e) {
              console.warn(`Erro ao confirmar presença automaticamente para evento ${event.id}:`, e);
            }
          }
        }
      }

      // Data atual (meia-noite para comparar apenas a data)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Filtra eventos que ainda não passaram (data >= hoje)
      const activeEvents = allEvents.filter(event => {
        if (!event.date) return true; // Mantém eventos sem data
        
        try {
          const [year, month, day] = event.date.split("-").map(Number);
          if (year && month && day) {
            const eventDate = new Date(year, month - 1, day);
            eventDate.setHours(0, 0, 0, 0);
            return eventDate >= today;
          }
        } catch (e) {
          console.warn("Erro ao processar data do evento:", e, event.date);
        }
        return true; // Em caso de erro, mantém o evento
      });
      
      // Cancela/deleta vouchers de eventos que já passaram
      const expiredEvents = allEvents.filter(event => {
        if (!event.date) return false;
        
        try {
          const [year, month, day] = event.date.split("-").map(Number);
          if (year && month && day) {
            const eventDate = new Date(year, month - 1, day);
            eventDate.setHours(0, 0, 0, 0);
            return eventDate < today;
          }
        } catch (e) {
          return false;
        }
        return false;
      });
      
      // Remove vouchers de eventos expirados
      for (const expiredEvent of expiredEvents) {
        if (expiredEvent.requiresPayment && expiredEvent.price) {
          const invoice = allInvoices.find(inv => 
            inv.description?.includes(`Ingresso: ${expiredEvent.name}`) && 
            inv.status === "paid"
          );
          if (invoice) {
            try {
              const voucher = await fetchVoucherByInvoiceId(invoice.id);
              if (voucher) {
                // Deleta o voucher do evento expirado
                await deleteVoucher(voucher.id);
                console.log(`Voucher ${voucher.id} deletado para evento expirado: ${expiredEvent.name}`);
              }
            } catch (e) {
              console.warn(`Erro ao deletar voucher do evento expirado ${expiredEvent.id}:`, e);
            }
          }
        }
      }
      
      // Ordena por data (mais próximos primeiro)
      const sortedEvents = activeEvents.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateA - dateB;
      });
      setEvents(sortedEvents);
      setInvoices(allInvoices);
      previousInvoicesRef.current = allInvoices;
      
      // Busca vouchers para eventos (apenas dos eventos ativos)
      // Busca tanto por invoice (pagamento) quanto diretamente por evento (adicionado manualmente)
      const vouchersMap: Record<string, any> = {};
      for (const event of sortedEvents) {
        // Verifica se o aluno está confirmado no evento
        const isConfirmed = event.confirmedStudentIds.includes(profile.uid);
        
        if (!isConfirmed) continue; // Só busca voucher se o aluno estiver confirmado
        
        let voucher: any = null;
        
        // Primeiro tenta buscar por invoice (se o evento requer pagamento)
        if (event.requiresPayment && event.price) {
          const invoice = allInvoices.find(inv => 
            (inv.description?.includes(`Ingresso: ${event.name}`) || 
             inv.type === "baile" || inv.type === "workshop" || inv.type === "outro") &&
            inv.studentId === profile.uid &&
            inv.status === "paid"
          );
          if (invoice) {
            try {
              voucher = await fetchVoucherByInvoiceId(invoice.id);
            } catch (e) {
              console.warn(`Erro ao buscar voucher por invoice para evento ${event.id}:`, e);
            }
          }
        }
        
        // Se não encontrou por invoice, tenta buscar diretamente por eventId (voucher criado manualmente)
        if (!voucher) {
          try {
            voucher = await fetchVoucherByEventId(event.id, profile.uid);
          } catch (e) {
            console.warn(`Erro ao buscar voucher por eventId para evento ${event.id}:`, e);
          }
        }
        
        if (voucher) {
          vouchersMap[event.id] = voucher;
        }
      }
      setEventVouchers(vouchersMap);
      eventsLoadedRef.current = true;
    } catch (e) {
      console.error("Erro ao carregar eventos:", e);
      eventsLoadedRef.current = true; // Marca como carregado mesmo em caso de erro
    } finally {
      setLoadingEvents(false);
      loadingEventsRef.current = false;
    }
  }, [profile?.uid, fetchEvents, fetchInvoices, fetchVoucherByInvoiceId, fetchVoucherByEventId, deleteVoucher]);

  // Reseta o flag quando o perfil mudar
  useEffect(() => {
    if (profile?.uid) {
      eventsLoadedRef.current = false;
    }
  }, [profile?.uid]);

  // Listener de invoices para atualizar status de pagamento de eventos em tempo real
  useEffect(() => {
    if (!profile?.uid || !subscribeToInvoices) return;

    const unsubscribe = subscribeToInvoices(profile.uid, (newInvoices) => {
      // Verifica se há mudanças em invoices de eventos
      const previousEventInvoices = previousInvoicesRef.current.filter(inv => 
        inv.description?.includes("Ingresso:") || inv.type === "baile"
      );
      
      const currentEventInvoices = newInvoices.filter(inv => 
        inv.description?.includes("Ingresso:") || inv.type === "baile"
      );
      
      // Detecta se houve mudanças: novas invoices, mudança de status (especialmente para "paid"), ou remoção
      const hasNewInvoice = currentEventInvoices.length > previousEventInvoices.length;
      
      // Verifica mudança de status, especialmente de pending/overdue para paid
      const hasStatusChange = previousEventInvoices.some(prevInv => {
        const currentInv = currentEventInvoices.find(inv => inv.id === prevInv.id);
        if (currentInv && currentInv.status !== prevInv.status) {
          // Se mudou de pending/overdue para paid, precisa recarregar eventos para buscar voucher
          if (
            (prevInv.status === "pending" || prevInv.status === "overdue") &&
            currentInv.status === "paid"
          ) {
            return true;
          }
          return currentInv.status !== prevInv.status;
        }
        return false;
      });
      
      const hasRemovedInvoice = previousEventInvoices.length > currentEventInvoices.length;
      
      // Atualiza a lista de invoices local
      setInvoices(newInvoices);

      // Recarrega eventos se houve mudanças relacionadas a eventos
      // Só recarrega se não estiver carregando
      if ((hasNewInvoice || hasStatusChange || hasRemovedInvoice) && !loadingEventsRef.current) {
        // Atualiza a referência antes de recarregar
        previousInvoicesRef.current = newInvoices;
        // Delay para garantir que a invoice foi salva no Firestore
        setTimeout(() => {
          if (!loadingEventsRef.current) {
            loadEvents();
          }
        }, 1000);
      } else {
        // Atualiza a referência mesmo se não recarregar eventos
        previousInvoicesRef.current = newInvoices;
      }
    });

    return () => unsubscribe();
  }, [profile?.uid, subscribeToInvoices, loadEvents]);

  // Recarrega eventos quando há notificações de eventos (incluindo remoção)
  useEffect(() => {
    if (!profile?.pendingNotifications) return;
    
    // Verifica se há notificações relacionadas a eventos que indicam mudança
    const eventRelatedNotifications = profile.pendingNotifications.filter(
      (n: PaymentNotification) => {
        const isEventRelated = n.type === "event_invitation" || n.type === "reminder";
        const isAboutRemoval = n.title?.includes("Removido") || n.message?.includes("removido");
        const isAboutConfirmation = n.title?.includes("Confirmada") || n.message?.includes("confirmada");
        return isEventRelated && (isAboutRemoval || isAboutConfirmation);
      }
    );
    
    // Se há notificações de eventos e os eventos não estão carregando, recarrega
    // Só recarrega se já tiver carregado pelo menos uma vez
    if (eventRelatedNotifications.length > 0 && !loadingEventsRef.current && eventsLoadedRef.current) {
      // Delay maior para evitar múltiplos recarregamentos
      setTimeout(() => {
        if (!loadingEventsRef.current) {
          loadEvents();
        }
      }, 800);
    }
  }, [profile?.pendingNotifications, loadEvents]);

  // Carrega dados quando a tela ganha foco
  useFocusEffect(
    useCallback(() => {
      loadClasses();
      if (profile?.uid && !loadingEventsRef.current) {
        // Sempre recarrega se ainda não carregou, ou se há convites pendentes não lidos
        const hasPendingInvites = (profile.pendingNotifications || []).some(
          (n: any) => (n.type === "event_invitation" || (n.type === "reminder" && (n.voucherId || n.eventId))) && !n.read
        );
        if (!eventsLoadedRef.current || hasPendingInvites) {
          loadEvents();
        }
      }
    }, [loadClasses, profile?.uid, profile?.pendingNotifications, loadEvents])
  );

  // Listener em tempo real para eventos (detecta quando aluno é adicionado/removido manualmente)
  // Escuta TODOS os eventos ativos para detectar quando o aluno é adicionado/removido
  useEffect(() => {
    if (!profile?.uid) return;

    let unsubscribe: (() => void) | null = null;
    let isMounted = true; // Track if component is still mounted

    try {
      // Importa dinamicamente para evitar dependência circular
      import("../../services/firebase").then(({ db }) => {
        import("../../services/postgresFirestoreCompat").then(({ collection, query, where, onSnapshot }) => {
          // Don't create listener if component unmounted during import
          if (!isMounted) return;

          const eventsRef = collection(db, "events");

          // Escuta TODOS os eventos ativos (não apenas onde o aluno está confirmado)
          // Isso permite detectar quando o aluno é adicionado pela primeira vez
          const q = query(
            eventsRef,
            where("active", "==", true)
          );

          // Mantém estado anterior para comparar mudanças
          let previousEventsMap = new Map<string, boolean>();

          unsubscribe = onSnapshot(q, (snapshot) => {
            // Don't process if unmounted
            if (!isMounted) return;

            // Verifica se algum evento mudou
            let shouldReload = false;

            snapshot.docChanges().forEach((change) => {
              const eventData = change.doc.data();
              const eventId = change.doc.id;
              const isNowConfirmed = eventData.confirmedStudentIds?.includes(profile.uid) || false;
              const wasConfirmed = previousEventsMap.get(eventId) || false;

              // Recarrega se:
              // 1. Um evento novo foi adicionado (independente de estar confirmado)
              // 2. Um evento foi removido
              // 3. O status de confirmação do aluno mudou
              if (change.type === "added" || change.type === "removed" || isNowConfirmed !== wasConfirmed) {
                shouldReload = true;
              }

              // Atualiza estado anterior (remove se foi deleted)
              if (change.type === "removed") {
                previousEventsMap.delete(eventId);
              } else {
                previousEventsMap.set(eventId, isNowConfirmed);
              }
            });

            // Se é a primeira carga (não há mudanças mas há documentos), apenas popula o mapa
            if (snapshot.docChanges().length === 0 && previousEventsMap.size === 0) {
              snapshot.docs.forEach((doc) => {
                const eventData = doc.data();
                const isConfirmed = eventData.confirmedStudentIds?.includes(profile.uid) || false;
                previousEventsMap.set(doc.id, isConfirmed);
              });
              // Primeira carga não precisa recarregar, já foi carregado pelo useFocusEffect
              return;
            }

            // Só recarrega se já tiver carregado pelo menos uma vez
            if (shouldReload && eventsLoadedRef.current && !loadingEventsRef.current) {
              // Recarrega eventos após um pequeno delay para garantir que os dados estão atualizados
              setTimeout(() => {
                if (!loadingEventsRef.current && isMounted) {
                  loadEvents();
                }
              }, 800);
            }
          }, (error) => {
            // Erro silenciado
          });
        });
      });
    } catch (e) {
      // Erro silenciado
    }

    return () => {
      isMounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [profile?.uid, loadEvents]);

  // Listener em tempo real para vouchers do aluno (detecta quando voucher é criado)
  useEffect(() => {
    if (!profile?.uid) return;

    let unsubscribe: (() => void) | null = null;
    let isFirstSnapshot = true; // Flag para ignorar snapshot inicial
    let isMounted = true; // Track if component is still mounted

    try {
      // Importa dinamicamente para evitar dependência circular
      import("../../services/firebase").then(({ db }) => {
        import("../../services/postgresFirestoreCompat").then(({ collection, query, where, onSnapshot }) => {
          // Don't create listener if component unmounted during import
          if (!isMounted) return;

          const vouchersRef = collection(db, "vouchers");

          // Escuta vouchers do aluno
          const q = query(
            vouchersRef,
            where("studentId", "==", profile.uid),
            where("status", "==", "valid")
          );

          unsubscribe = onSnapshot(q, (snapshot) => {
            // Don't process if unmounted
            if (!isMounted) return;

            // Ignora o snapshot inicial para evitar loop
            if (isFirstSnapshot) {
              isFirstSnapshot = false;
              return;
            }

            // Só recarrega se houver mudanças reais (documentos adicionados/modificados/removidos)
            if (snapshot.docChanges().length > 0 && eventsLoadedRef.current && !loadingEventsRef.current) {
              // Recarrega eventos após um delay para garantir que os dados estão atualizados
              setTimeout(() => {
                if (!loadingEventsRef.current && isMounted) {
                  loadEvents();
                }
              }, 800);
            }
          }, (error) => {
            // Erro silenciado - não afeta a experiência do usuário
          });
        });
      });
    } catch (e) {
      // Erro silenciado
    }

    return () => {
      isMounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [profile?.uid, loadEvents]);

  // Verifica se aluno está confirmado no evento
  const isConfirmedInEvent = useCallback((event: Event) => {
    if (!profile?.uid) return false;
    return event.confirmedStudentIds?.includes(profile.uid) || false;
  }, [profile?.uid]);

  // Verifica se há ingresso pendente de pagamento para o evento
  const hasPendingInvoice = useCallback((event: Event) => {
    if (!event.requiresPayment || !event.price) return false;
    return invoices.some(inv => 
      inv.description?.includes(`Ingresso: ${event.name}`) && 
      (inv.status === "pending" || inv.status === "overdue")
    );
  }, [invoices]);

  // Verifica se o ingresso foi pago
  const hasPaidInvoice = useCallback((event: Event) => {
    if (!event.requiresPayment || !event.price) return false;
    return invoices.some(inv => 
      inv.description?.includes(`Ingresso: ${event.name}`) && 
      inv.status === "paid"
    );
  }, [invoices]);

  // Verifica se o aluno está confirmado mas não tem ingresso gerado (caso de confirmação anterior)
  const isConfirmedWithoutInvoice = useCallback((event: Event) => {
    if (!event.requiresPayment || !event.price) return false;
    const isConfirmed = isConfirmedInEvent(event);
    if (!isConfirmed) return false;
    
    // Verifica se não existe nenhum ingresso (pendente ou pago) para este evento
    const hasAnyInvoice = invoices.some(inv => 
      inv.description?.includes(`Ingresso: ${event.name}`)
    );
    
    return !hasAnyInvoice;
  }, [invoices, isConfirmedInEvent]);

  // Determina o status do evento para exibição
  const getEventStatus = useCallback((event: Event) => {
    const isConfirmed = isConfirmedInEvent(event);

    // Se não requer pagamento e está confirmado, mostra confirmado
    if (!event.requiresPayment || !event.price) {
      if (isConfirmed) {
        return { type: "confirmed", label: "Confirmado", color: colors.green, icon: "checkmark-circle" };
      }
      return null; // Não confirmado
    }

    // Verifica status do ingresso
    const paid = hasPaidInvoice(event);
    const pending = hasPendingInvoice(event);
    const needsInvoice = isConfirmedWithoutInvoice(event);

    // Verifica se tem voucher gerado
    const hasVoucher = !!eventVouchers[event.id];

    if (isConfirmed && paid) {
      // Se pagou mas ainda não tem voucher, mostra "Gerar Voucher"
      if (!hasVoucher) {
        return { type: "needs_voucher", label: "Gerar Voucher", color: "#10B981", icon: "ticket-outline" };
      }
      // Se pagou e tem voucher, mostra "Voucher Gerado"
      return { type: "voucher_generated", label: "Voucher Gerado", color: colors.green, icon: "ticket" };
    } else if (pending) {
      // Mostra "Pagamento Pendente" mesmo se ainda não confirmado (porque agora a confirmação vem após pagamento)
      return { type: "pending", label: "Pagamento Pendente", color: "#F59E0B", icon: "time" };
    } else if (needsInvoice) {
      return { type: "needs_invoice", label: "Gerar Ingresso", color: "#3B82F6", icon: "receipt" };
    }

    // Se chegou aqui e não está confirmado, não mostra status
    if (!isConfirmed) {
      return null;
    }

    return { type: "confirmed", label: "Presença Confirmada", color: "#6B7280", icon: "checkmark-circle" };
  }, [isConfirmedInEvent, hasPaidInvoice, hasPendingInvoice, isConfirmedWithoutInvoice, eventVouchers, invoices]);

  // Handler para gerar ingresso retroativamente para alunos que já confirmaram antes
  const handleGenerateInvoice = useCallback(async (event: Event) => {
    if (!profile?.uid || !event.id || !event.requiresPayment || !event.price) return;
    if (loadingEventAction) return;
    setLoadingEventAction({ id: event.id, action: "invoice" });
    try {
      await createInvoice({
        studentId: profile.uid,
        studentName: profile.name,
        studentEmail: profile.email,
        amount: event.price,
        originalAmount: event.price,
        discountAmount: 0,
        description: `Ingresso: ${event.name}${event.time ? ` - ${event.time}` : ""}${event.location ? ` - ${event.location}` : ""}`,
        dueDate: event.date,
        lateDueDate: event.date,
        status: "pending",
        referenceMonth: event.date.substring(0, 7),
        classIds: [],
        classCount: 0,
        type: event.type === "baile" ? "baile" : "outro",
      });
      
      showMessage(
        "✅ Ingresso Gerado - Pagamento Necessário",
        `Um ingresso no valor de ${formatCurrency(event.price)} foi gerado para você.\n\n⚠️ IMPORTANTE: Sua presença no evento será confirmada APENAS após o pagamento do ingresso.\n\nAcesse a aba "Pagamentos" para realizar o pagamento e confirmar sua participação.`
      );

      await loadEvents();
    } catch (invoiceError: any) {
      console.error("Erro ao gerar ingresso:", invoiceError);
      showMessage("Erro", invoiceError.message || "Não foi possível gerar o ingresso. Entre em contato com a administração.");
    } finally {
      setLoadingEventAction(null);
    }
  }, [profile, createInvoice, loadEvents, loadingEventAction]);

  // Handler para gerar voucher após pagamento
  const handleGenerateVoucher = useCallback(async (event: Event) => {
    if (!profile?.uid || !event.id) return;
    if (loadingEventAction) return;
    setLoadingEventAction({ id: event.id, action: "voucher" });
    try {
      // Busca o ingresso pago do evento
      const invoice = invoices.find(inv =>
        inv.description?.includes(`Ingresso: ${event.name}`) &&
        inv.status === "paid"
      );

      if (!invoice) {
        console.error("[handleGenerateVoucher] Invoice pago não encontrado");
        showError("Erro", "Ingresso pago não encontrado. Entre em contato com a administração.");
        return;
      }

      // Verifica se já existe voucher
      let voucher = await fetchVoucherByInvoiceId(invoice.id);

      if (!voucher) {
        // Gera o voucher
        showInfo("Gerando voucher...", "Aguarde enquanto geramos seu voucher de entrada.");

        try {
          voucher = await createBaileVoucher(invoice);
        } catch (createError: any) {
          console.error("[handleGenerateVoucher] ERRO ao criar voucher:", createError);
          console.error("[handleGenerateVoucher] Detalhes do erro:", {
            message: createError.message,
            code: createError.code,
            stack: createError.stack
          });
          showError("Erro ao Gerar Voucher", createError.message || "Erro desconhecido ao gerar voucher. Tente novamente.");
          return;
        }

        if (!voucher) {
          showError("Erro", "Não foi possível gerar o voucher. Tente novamente.");
          return;
        }

        // Atualiza o state local
        setEventVouchers(prev => ({ ...prev, [event.id]: voucher }));

        // Cria notificação de atividade para o aluno
        try {
          await logActivity({
            type: "event_updated",
            title: "🎫 Voucher de Evento Gerado",
            description: `Seu voucher para o evento "${event.name}" foi gerado com sucesso! Código: ${voucher.voucherCode}`,
            metadata: {
              eventId: event.id,
              eventName: event.name,
              voucherId: voucher.id,
              voucherCode: voucher.voucherCode,
            },
          });
        } catch (activityError) {
          console.warn("Erro ao criar atividade de geração de voucher:", activityError);
        }

        // Recarrega eventos para atualizar o status
        await loadEvents();

        showSuccess(
          "Voucher Gerado! 🎉",
          `Seu voucher de entrada foi gerado com sucesso! Código: ${voucher.voucherCode}. Você pode visualizá-lo a qualquer momento no card do evento.`
        );
      } else {
        // Já existe voucher
        setEventVouchers(prev => ({ ...prev, [event.id]: voucher }));
        showInfo("Voucher já existe", "Seu voucher já foi gerado anteriormente.");
      }
    } catch (error: any) {
      console.error("Erro ao gerar voucher:", error);
      showError("Erro", error.message || "Não foi possível gerar o voucher. Tente novamente.");
    } finally {
      setLoadingEventAction(null);
    }
  }, [profile, invoices, fetchVoucherByInvoiceId, createBaileVoucher, loadEvents, logActivity, loadingEventAction]);

  // Handler para abrir modal de acompanhante
  const handleOpenCompanion = useCallback((event: Event, tab: "pay" | "invite" = "pay") => {
    const voucher = eventVouchers[event.id];
    if (!voucher) {
      showMessage("Voucher não encontrado", "Seu voucher precisa estar disponível para adicionar um acompanhante.");
      return;
    }
    setCompanionEvent(event);
    setCompanionName("");
    setCompanionPhone("");
    setCompanionModalTab(tab);
    setShowCompanionModal(true);
  }, [eventVouchers]);

  // Handler para enviar convite pelo WhatsApp diretamente
  const handleShareEventWhatsApp = useCallback((event: Event, phone?: string) => {
    const eventEmojis: Record<string, string> = {
      baile: "💃",
      workshop: "🎓",
      show: "🎤",
      festa: "🎉",
      aula: "🕺",
    };
    const emoji = eventEmojis[event.type] || "🎉";
    const msg =
      `Oi, gostaria de convidar você para o ${event.name}. ${emoji}\n` +
      `Basta acessar o link e confirmar sua participação:\n` +
      `https://cdmf.vercel.app/`;
    const encoded = encodeURIComponent(msg);
    const url = phone
      ? `https://wa.me/55${phone.replace(/\D/g, "")}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    Linking.openURL(url);
  }, []);

  // Handler para confirmar acompanhante e gerar cobrança
  const handleConfirmCompanion = useCallback(async () => {
    if (!companionEvent || !companionName.trim()) {
      showMessage("Atenção", "Informe o nome do acompanhante.");
      return;
    }
    const voucher = eventVouchers[companionEvent.id] as BaileVoucher;
    if (!voucher) {
      showMessage("Erro", "Voucher não encontrado. Tente novamente.");
      return;
    }
    setCreatingCompanion(true);
    try {
      await createGuestInvoice(voucher, companionName.trim(), companionEvent.price || 0);
      setShowCompanionModal(false);
      setCompanionName("");
      showSuccess(
        "Cobrança gerada! 🎉",
        "Agora vá para a aba de Pagamentos para pagar o ingresso do acompanhante."
      );
      if (isDesktopMode && desktopNav) {
        desktopNav.setActiveTab("pagamentos");
      } else {
        navigation.navigate("Pagamento");
      }
    } catch (e: any) {
      showMessage("Erro", e.message || "Não foi possível criar a cobrança.");
    } finally {
      setCreatingCompanion(false);
    }
  }, [companionEvent, companionName, eventVouchers, createGuestInvoice, isDesktopMode, desktopNav, navigation]);

  // Handler para participar do evento
  const handleJoinEvent = useCallback(async (event: Event) => {
    if (!profile?.uid || !event.id) return;
    if (loadingEventAction) return;

    if (isConfirmedInEvent(event)) {
      showMessage("Você já está confirmado neste evento!", "Sua presença já foi registrada.");
      return;
    }

    setLoadingEventAction({ id: event.id, action: "join" });
    try {
      // Se o evento requer pagamento, confirma presença E gera ingresso
      if (event.requiresPayment && event.price) {
        try {
          console.log("[handleJoinEvent] Gerando ingresso para evento:", {
            eventId: event.id,
            eventName: event.name,
            studentId: profile.uid,
            studentName: profile.name,
            studentEmail: profile.email,
            price: event.price,
            date: event.date
          });

          // Verifica se já existe invoice para este evento
          const existingInvoice = invoices.find(inv =>
            inv.description?.includes(`Ingresso: ${event.name}`) &&
            inv.studentId === profile.uid
          );

          if (existingInvoice) {
            console.log("Já existe invoice para este evento:", existingInvoice.id);
            showMessage(
              "Ingresso Já Existe",
              `Você já possui um ingresso para este evento. Realize o pagamento na aba "Pagamentos" para confirmar sua presença.`
            );
            await loadEvents();
            await refreshProfile();
            return;
          }

          // Gera ingresso (presença será confirmada após pagamento)
          const invoiceData = {
            studentId: profile.uid,
            studentName: profile.name,
            studentEmail: profile.email || "",
            amount: event.price,
            originalAmount: event.price,
            discountAmount: 0,
            description: `Ingresso: ${event.name}${event.time ? ` - ${event.time}` : ""}${event.location ? ` - ${event.location}` : ""}`,
            dueDate: event.date,
            lateDueDate: event.date,
            status: "pending" as const,
            referenceMonth: event.date.substring(0, 7),
            classIds: [],
            classCount: 0,
            type: (event.type === "baile" ? "baile" : "outro") as "baile" | "outro",
          };

          console.log("Dados do ingresso:", invoiceData);
          await createInvoice(invoiceData);

          // Cria notificação de atividade para o aluno
          try {
            await logActivity({
              type: "payment_generated",
              title: "🎫 Ingresso de Evento Gerado",
              description: `Seu ingresso para o evento "${event.name}" foi gerado. Sua presença será confirmada APENAS após o pagamento de ${formatCurrency(event.price)}.`,
              metadata: {
                eventId: event.id,
                eventName: event.name,
                amount: event.price,
              },
            });
          } catch (activityError) {
            console.warn("Erro ao criar atividade de geração de ingresso:", activityError);
          }

          // Atualiza eventos antes de mostrar mensagem
          await loadEvents();
          await refreshProfile();

          showMessage(
            "Ingresso Gerado! 🎉",
            `Um ingresso no valor de ${formatCurrency(event.price)} foi gerado.\n\n⚠️ Sua presença será confirmada APENAS após o pagamento.\n\nAcesse a aba "Pagamentos" para pagar e confirmar sua participação.`
          );
        } catch (invoiceError: any) {
          console.error("Erro ao criar ingresso:", invoiceError);
          const errorMessage = invoiceError?.message || "Houve um problema ao gerar o ingresso. Entre em contato com a administração.";
          showError("Erro", errorMessage);
        }
      } else {
        // Evento gratuito - confirma presença imediatamente
        await confirmEventAttendance(event.id);
        showSuccess("Presença confirmada! 🎉", "Você está confirmado no evento! Te esperamos lá!");
        await refreshProfile();
        await loadEvents();
      }
    } catch (e: any) {
      showError("Erro", e.message || "Não foi possível processar sua solicitação");
    } finally {
      setLoadingEventAction(null);
    }
  }, [profile, isConfirmedInEvent, confirmEventAttendance, createInvoice, refreshProfile, loadEvents, isDesktopMode, desktopNav, navigation, logActivity, loadingEventAction]);

  // Cancela participação no evento
  const handleCancelEvent = useCallback((event: Event) => {
    if (!profile?.uid || !event.id) return;

    if (!isConfirmedInEvent(event)) {
      showWarning("Você não está confirmado neste evento", "Não há participação para cancelar.");
      return;
    }

    showConfirm(
      "Cancelar Participação",
      `Tem certeza que deseja cancelar sua participação no evento "${event.name}"?\n\n` +
      `Se você já gerou um ingresso, ele será removido. Se já pagou, entre em contato com a administração.`,
      async () => {
    setLoadingEventAction({ id: event.id, action: "cancel" });
    try {
      // Busca invoice relacionada ao evento antes de cancelar
      const eventInvoice = invoices.find(inv =>
        inv.description?.includes(`Ingresso: ${event.name}`) &&
        (inv.status === "pending" || inv.status === "overdue")
      );
      const paidEventInvoice = invoices.find(inv =>
        inv.description?.includes(`Ingresso: ${event.name}`) &&
        inv.status === "paid"
      );

      // Marca o evento como cancelado para impedir auto-reconfirm no próximo loadEvents()
      cancelledEventIdsRef.current.add(event.id);

      // Remove participação do evento (remove de confirmedStudentIds e waitlistStudentIds)
      await rejectEventAttendance(event.id);

      // Atualização otimista imediata: remove o aluno do estado local sem esperar loadEvents()
      setEvents(prev => prev.map(e =>
        e.id === event.id
          ? {
              ...e,
              confirmedStudentIds: (e.confirmedStudentIds || []).filter(id => id !== profile.uid),
              waitlistStudentIds: (e.waitlistStudentIds || []).filter(id => id !== profile.uid),
            }
          : e
      ));

      // Remove invoice pendente se existir
      if (eventInvoice) {
        try {
          await deleteInvoice(eventInvoice.id);
        } catch (invoiceError) {
          // Erro silenciado - invoice pode já ter sido removida
          // Continua mesmo se falhar a remoção da invoice
        }
      }

      // Marca invoice pago como cancelado para evitar auto-reconfirmação em próximas sessões
      if (paidEventInvoice) {
        try {
          await updateInvoice(paidEventInvoice.id, { status: "cancelled" as any });
        } catch (e) {
          console.warn("Erro ao cancelar invoice pago:", e);
        }
      }

      // Remove voucher se existir (aluno havia gerado ingresso pago)
      try {
        let voucherToDelete: any = null;
        if (paidEventInvoice) {
          voucherToDelete = await fetchVoucherByInvoiceId(paidEventInvoice.id);
        }
        if (!voucherToDelete) {
          voucherToDelete = await fetchVoucherByEventId(event.id, profile.uid);
        }
        if (voucherToDelete) {
          await deleteVoucher(voucherToDelete.id);
        }
      } catch (voucherError) {
        console.warn("Erro ao deletar voucher:", voucherError);
      }

      // Limpa voucher do estado local imediatamente (sem esperar reload)
      setEventVouchers(prev => {
        const next = { ...prev };
        delete next[event.id];
        return next;
      });

      // Cria notificação no perfil do aluno confirmando o cancelamento
      try {
        const { doc, updateDoc, arrayUnion } = await import("../../services/postgresFirestoreCompat");
        const { db } = await import("../../services/firebase");
        const studentRef = doc(db, "profiles", profile.uid);
        
        const notification: PaymentNotification = {
          id: `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: "billing",
          title: "❌ Participação Cancelada",
          message: `Você cancelou sua participação no evento "${event.name}". ${eventInvoice ? "O ingresso foi removido." : ""}`,
          createdAt: Date.now(),
          createdBy: profile.uid,
          read: false,
          eventId: event.id,
        };
        
        await updateDoc(studentRef, {
          pendingNotifications: arrayUnion(notification),
        });
      } catch (notificationError) {
        console.warn("Erro ao criar notificação de cancelamento:", notificationError);
        // Continua mesmo se falhar a criação da notificação
      }

      // Cria atividade na coleção activities para o log do sistema
      try {
        const activityId = `ACT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const { doc, setDoc, collection } = await import("../../services/postgresFirestoreCompat");
        const { db } = await import("../../services/firebase");
        await setDoc(doc(collection(db, "activities"), activityId), {
          id: activityId,
          type: "event_cancelled",
          title: "❌ Participação Cancelada",
          description: `${profile.name} cancelou sua participação no evento "${event.name}". ${eventInvoice ? "O ingresso foi removido." : ""}`,
          timestamp: Date.now(),
          metadata: {
            eventId: event.id,
            eventName: event.name,
            studentId: profile.uid,
            studentName: profile.name,
            invoiceRemoved: !!eventInvoice,
          },
          read: false,
          createdBy: profile.uid,
        });
      } catch (activityError) {
        console.warn("Erro ao criar atividade de cancelamento:", activityError);
        // Continua mesmo se falhar a criação da atividade
      }

      // Atualiza eventos e perfil
      await refreshProfile();
      await loadEvents();

      showSuccess("Participação cancelada", "Sua participação no evento foi cancelada com sucesso.");
    } catch (e: any) {
      console.error("Erro ao cancelar participação:", e);
      showError("Erro", e.message || "Não foi possível cancelar sua participação");
    } finally {
      setLoadingEventAction(null);
    }
      }
    );
  }, [profile, invoices, isConfirmedInEvent, rejectEventAttendance, deleteInvoice, updateInvoice, fetchVoucherByInvoiceId, fetchVoucherByEventId, deleteVoucher, setEventVouchers, setEvents, refreshProfile, loadEvents]);

  // Função para iniciar o timer de auto-scroll
  const startAutoScroll = useCallback(() => {
    if (autoScrollTimer.current) {
      clearInterval(autoScrollTimer.current);
    }
    
    autoScrollTimer.current = setInterval(() => {
      setCurrentIndex((prev) => {
        const nextIndex = (prev + 1) % ANNOUNCEMENTS.length;
        if (scrollViewRef.current) {
          scrollViewRef.current.scrollTo({
            x: nextIndex * SCREEN_WIDTH,
            animated: true,
          });
        }
        return nextIndex;
      });
    }, AUTO_SCROLL_INTERVAL);
  }, []);

  // Auto scroll do carrossel
  useEffect(() => {
    startAutoScroll();
    return () => {
      if (autoScrollTimer.current) {
        clearInterval(autoScrollTimer.current);
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [startAutoScroll]);


  // Atualiza o índice durante o scroll para acompanhar o marcador
  const handleScroll = useCallback((event: any) => {
    const contentOffset = event.nativeEvent.contentOffset.x;
    const itemWidth = SCREEN_WIDTH;
    const calculatedIndex = contentOffset / itemWidth;
    const index = Math.round(calculatedIndex);
    const clampedIndex = Math.max(0, Math.min(index, ANNOUNCEMENTS.length - 1));
    
    // Atualiza o índice em tempo real para acompanhar o marcador
    setCurrentIndex(clampedIndex);
  }, []);

  // Quando o usuário começa a deslizar - pausa auto-scroll
  const handleScrollBeginDrag = useCallback(() => {
    if (autoScrollTimer.current) {
      clearInterval(autoScrollTimer.current);
      autoScrollTimer.current = null;
    }
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }
  }, []);

  // Quando o scroll termina completamente (após momentum) - atualiza índice
  const handleMomentumScrollEnd = useCallback((event: any) => {
    const contentOffset = event.nativeEvent.contentOffset.x;
    const itemWidth = SCREEN_WIDTH;
    // Calcula qual item está visível
    const index = Math.round(contentOffset / itemWidth);
    const clampedIndex = Math.max(0, Math.min(index, ANNOUNCEMENTS.length - 1));
    
    // Atualiza o índice
    setCurrentIndex(clampedIndex);
    
    // Garante alinhamento perfeito
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        x: clampedIndex * SCREEN_WIDTH,
        animated: false,
      });
    }
    
    // Reinicia o auto-scroll após um delay
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = setTimeout(() => {
      startAutoScroll();
    }, AUTO_SCROLL_INTERVAL);
  }, [startAutoScroll]);

  // Navegar para um aviso específico ao clicar no dot
  const goToSlide = useCallback((index: number) => {
    if (scrollViewRef.current && index >= 0 && index < ANNOUNCEMENTS.length) {
      setCurrentIndex(index);
      
      // Pausa auto-scroll temporariamente
      if (autoScrollTimer.current) {
        clearInterval(autoScrollTimer.current);
        autoScrollTimer.current = null;
      }
      
      scrollViewRef.current.scrollTo({
        x: index * SCREEN_WIDTH,
        animated: true,
      });
      
      // Reinicia o auto-scroll após um delay
      setTimeout(() => {
        startAutoScroll();
      }, AUTO_SCROLL_INTERVAL);
    }
  }, [startAutoScroll]);


  // Formata a próxima aula - memoizado
  const getNextClassInfo = useCallback((classItem: Class) => {
    const now = new Date();
    const todayDayOfWeek = now.getDay();
    
    let nextSchedule = null;
    let daysUntilClass = 8;

    for (const schedule of classItem.schedule) {
      let daysUntil = schedule.dayOfWeek - todayDayOfWeek;
      if (daysUntil < 0) daysUntil += 7;
      if (daysUntil === 0) {
        const [hours, minutes] = schedule.startTime.split(":").map(Number);
        const classTime = new Date(now);
        classTime.setHours(hours, minutes, 0, 0);
        if (classTime < now) {
          daysUntil = 7;
        }
      }

      if (daysUntil < daysUntilClass) {
        daysUntilClass = daysUntil;
        nextSchedule = schedule;
      }
    }
    
    if (!nextSchedule) return null;
    
    const nextDate = new Date(now);
    nextDate.setDate(now.getDate() + daysUntilClass);
    
    return {
      day: DAYS_OF_WEEK[nextSchedule.dayOfWeek],
      dayShort: DAYS_OF_WEEK_SHORT[nextSchedule.dayOfWeek],
      date: nextDate.toLocaleDateString("pt-BR"),
      time: nextSchedule.startTime,
      daysUntil: daysUntilClass,
    };
  }, []);

  return (
    <View style={[styles.screen, isDesktopMode && desktopStyles.screen, isDesktopMode && { backgroundColor: themeColors.bg }]}>
      {!isDesktopMode && <StudentHeader />}

      {/* Modal de Convite de Evento */}
      <EventInvitationModal
        visible={showEventInvitation && !!profile?.phoneVerified && !!currentInvitation}
        invitation={currentInvitation}
        onClose={() => {
          const invitationId = currentInvitation?.id;
          // Fecha o modal primeiro
          setShowEventInvitation(false);
          setCurrentInvitation(null);
          // Marca como lida
          if (invitationId && profile?.uid) {
            markNotificationAsRead(invitationId);
          }
          // Mostra próximo convite se houver (excluindo o atual)
          showNextInvitation(invitationId);
        }}
        onConfirm={async () => {
          const invitationId = currentInvitation?.id;
          // Fecha o modal primeiro
          setShowEventInvitation(false);
          setCurrentInvitation(null);
          // Marca como lida
          if (invitationId && profile?.uid) {
            markNotificationAsRead(invitationId);
          }
          // Recarrega o perfil para atualizar notificações
          await refreshProfile();
          // Mostra próximo convite se houver (excluindo o atual)
          showNextInvitation(invitationId);
        }}
        onDecline={async () => {
          const invitationId = currentInvitation?.id;
          // Fecha o modal PRIMEIRO - isso é crítico
          setShowEventInvitation(false);
          setCurrentInvitation(null);
          // A função rejectEventAttendance já foi chamada dentro do modal
          // e já removeu a notificação e qualquer cobrança relacionada
          // Recarrega o perfil para atualizar notificações
          if (profile?.uid) {
            await refreshProfile();
          }
          // Mostra próximo convite se houver (excluindo o atual)
          showNextInvitation(invitationId);
        }}
        onMaybe={() => {
          const invitationId = currentInvitation?.id;
          // Fecha o modal primeiro
          setShowEventInvitation(false);
          setCurrentInvitation(null);
          // NÃO marca como lida - a notificação deve reaparecer na próxima vez que entrar no app
          // Adiciona à lista de mostrados nesta sessão (para não reabrir imediatamente)
          if (invitationId) {
            shownInvitationIdsRef.current.add(invitationId);
            saveShownInvitations();
          }
          // Recarrega eventos para garantir que o evento apareça na lista
          if (!loadingEventsRef.current) {
            loadEvents();
          }
          // Mostra próximo convite se houver (excluindo o atual)
          showNextInvitation(invitationId);
        }}
      />
      
      {/* Modal de Conta Deletada */}
      <Modal visible={showDeletedModal} transparent animationType="fade">
        <View style={accountModalStyles.overlay}>
          <View style={accountModalStyles.container}>
            <View style={[accountModalStyles.iconBox, { backgroundColor: "#FEE2E2" }]}>
              <Ionicons name="trash-outline" size={48} color={colors.danger} />
            </View>
            
            <Text style={accountModalStyles.title}>Conta Removida</Text>
            <Text style={accountModalStyles.message}>
              Sua conta anterior foi removida do sistema.
            </Text>
            <Text style={accountModalStyles.submessage}>
              Você pode criar uma nova conta normalmente. Isso não é um banimento - é apenas remoção da conta anterior.
            </Text>
            
            <View style={accountModalStyles.actions}>
              <Pressable 
                style={[accountModalStyles.btn, accountModalStyles.btnSecondary]}
                onPress={() => handleContactWhatsApp("Olá! Minha conta anterior foi removida do sistema e preciso de ajuda para continuar meu acesso ao app.")}
              >
                <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                <Text style={accountModalStyles.btnSecondaryText}>Entrar em Contato</Text>
              </Pressable>
              
              <Pressable 
                style={[accountModalStyles.btn, accountModalStyles.btnPrimary]}
                onPress={handleDeletedModalClose}
              >
                <Text style={accountModalStyles.btnPrimaryText}>Sair e criar nova conta</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de Matrícula Desativada */}
      <Modal visible={showDeactivatedModal} transparent animationType="fade">
        <View style={accountModalStyles.overlay}>
          <View style={accountModalStyles.container}>
            <View style={[accountModalStyles.iconBox, { backgroundColor: "#FEF3C7" }]}>
              <Ionicons name="alert-circle-outline" size={48} color="#D97706" />
            </View>
            
            <Text style={accountModalStyles.title}>Matrícula Desativada</Text>
            <Text style={accountModalStyles.message}>
              Sua matrícula foi temporariamente desativada.
            </Text>
            <Text style={accountModalStyles.submessage}>
              Isso pode ter ocorrido por diversos motivos. Entre em contato com a administração para mais informações ou para reativar sua matrícula.
            </Text>
            
            <View style={accountModalStyles.actions}>
              <Pressable 
                style={[accountModalStyles.btn, accountModalStyles.btnSecondary]}
                onPress={() => {
                  handleDismissDeactivation();
                }}
              >
                <Ionicons name="close-outline" size={18} color="#64748B" />
                <Text style={accountModalStyles.btnSecondaryText}>Ignorar por agora</Text>
              </Pressable>
              
              <Pressable 
                style={[accountModalStyles.btn, accountModalStyles.btnPrimary, { backgroundColor: "#25D366" }]}
                onPress={() => {
                  handleDismissDeactivation();
                  handleContactWhatsApp("Olá! Minha matrícula foi desativada e gostaria de saber como posso regularizar ou reativar meu cadastro.");
                }}
              >
                <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                <Text style={accountModalStyles.btnPrimaryText}>Entrar em Contato</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView 
        contentContainerStyle={[styles.content, isDesktopMode && desktopStyles.content]} 
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={!isWeb}
        scrollEventThrottle={16}
        bounces={!isWeb}
        overScrollMode="never"
      >
        {/* Carrossel de Avisos */}
        {!isDesktopMode && <SectionHeader title="Avisos" />}
        
        {/* Carrossel - Mobile */}
        {!isDesktopMode && (
          <View style={styles.carouselContainer}>
            <ScrollView
              ref={scrollViewRef}
              horizontal
              pagingEnabled={true}
              showsHorizontalScrollIndicator={false}
              onScroll={handleScroll}
              onScrollBeginDrag={handleScrollBeginDrag}
              onMomentumScrollEnd={handleMomentumScrollEnd}
              scrollEventThrottle={16}
              decelerationRate={0}
              bounces={false}
              scrollEnabled={true}
            >
              {ANNOUNCEMENTS.map((item) => (
                <View key={item.id} style={{ width: SCREEN_WIDTH }}>
                  <AnnouncementCard item={item} />
                </View>
              ))}
            </ScrollView>
            
            <View style={styles.dotsContainer}>
              {ANNOUNCEMENTS.map((_, index) => (
                <DotIndicator 
                  key={index}
                  index={index}
                  isActive={index === currentIndex}
                  onPress={() => goToSlide(index)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Desktop Dashboard Layout */}
        {isDesktopMode && (
          <View style={[desktopStyles.dashboardContainer, { backgroundColor: themeColors.bg }]}>
            {/* Welcome Banner */}
            <View style={[desktopStyles.welcomeBanner, isDark && { backgroundColor: '#581C87' }]}>
              <View style={desktopStyles.welcomeContent}>
                <Text style={desktopStyles.welcomeGreeting}>
                  👋 Olá, {studentName}!
                </Text>
                <Text style={desktopStyles.welcomeMessage}>
                  Bem-vindo ao seu painel. Confira suas aulas e avisos importantes.
                </Text>
              </View>
              <View style={desktopStyles.welcomeDecoration}>
                <Ionicons name="sparkles" size={48} color="rgba(255,255,255,0.3)" />
              </View>
            </View>

            {/* Main Grid: Aulas + Avisos lado a lado */}
            <View style={desktopStyles.mainGrid}>
              {/* Coluna Esquerda: Próximas Turmas */}
              <View style={[desktopStyles.classesColumn, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
                <View style={desktopStyles.sectionHeaderRow}>
                  <View style={[desktopStyles.sectionIconBox, { backgroundColor: themeColors.purpleLight }]}>
                    <Ionicons name="calendar" size={18} color={themeColors.purple} />
                  </View>
                  <Text style={[desktopStyles.sectionTitle, { color: themeColors.text }]}>Próximas Turmas</Text>
                  <Text style={[desktopStyles.sectionBadge, { backgroundColor: themeColors.purpleLight, color: themeColors.purple }]}>{myClasses.length}</Text>
                </View>

                <View style={desktopStyles.classesContainer}>
                  {loading ? (
                    <View style={[desktopStyles.loadingBox, { backgroundColor: themeColors.bgSecondary }]}>
                      <ActivityIndicator size="small" color={themeColors.purple} />
                      <Text style={[desktopStyles.loadingText, { color: themeColors.textMuted }]}>Carregando...</Text>
                    </View>
                  ) : myClasses.length === 0 ? (
                    <View style={desktopStyles.emptyClassesBox}>
                      <Ionicons name="school-outline" size={40} color={themeColors.textMuted} />
                      <Text style={[desktopStyles.emptyTitle, { color: themeColors.text }]}>Nenhuma turma</Text>
                      <Text style={[desktopStyles.emptySubtitle, { color: themeColors.textMuted }]}>
                        Entre em contato para se matricular
                      </Text>
                    </View>
                  ) : (
                    myClasses.map((classItem, index) => {
                      const nextClass = getNextClassInfo(classItem);
                      const isToday = nextClass?.daysUntil === 0;
                      const isTomorrow = nextClass?.daysUntil === 1;
                      const danceIcon = getDanceIcon(classItem.name);
                      return (
                        <View 
                          key={classItem.id} 
                          style={[
                            desktopStyles.classCard,
                            { 
                              backgroundColor: "#FFC107", 
                              borderWidth: 1,
                              borderColor: themeColors.border,
                            },
                            isToday && [desktopStyles.classCardToday, isDark && { backgroundColor: '#14532D', borderColor: '#22C55E' }],
                            isTomorrow && isDark && { backgroundColor: '#1E3A5F', borderColor: '#3B82F6' }
                          ]}
                        >
                          {/* Ícone da dança */}
                          <View style={[
                            desktopStyles.classIconContainer,
                            { backgroundColor: "#3B2E6E" },
                            isToday && desktopStyles.classIconContainerToday,
                            isTomorrow && desktopStyles.classIconContainerTomorrow
                          ]}>
                            <Image 
                              source={danceIcon} 
                              style={desktopStyles.classDanceIcon}
                              resizeMode="cover"
                            />
                          </View>
                          <View style={desktopStyles.classInfo}>
                            <Text style={[desktopStyles.className, { color: colors.text }]}>{classItem.name}</Text>
                            <Text style={[desktopStyles.classTeacher, { color: colors.text, opacity: 0.75 }]}>
                              Prof. {classItem.teacherName || "A definir"}
                            </Text>
                          </View>
                          <View style={desktopStyles.classSchedule}>
                            <View style={[
                              desktopStyles.classDayBadge,
                              { backgroundColor: "#3B2E6E" },
                              isToday && desktopStyles.classDayBadgeToday,
                              isTomorrow && desktopStyles.classDayBadgeTomorrow
                            ]}>
                              <Text style={[
                                desktopStyles.classDayText,
                                { color: "#fff" }
                              ]}>
                                {isToday ? "HOJE" : isTomorrow ? "AMANHÃ" : nextClass?.dayShort}
                              </Text>
                            </View>
                            <Text style={[desktopStyles.classTime, { color: colors.text }]}>{nextClass?.time}h</Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              </View>

              {/* Coluna Direita: Avisos */}
              <View style={[desktopStyles.announcementsColumn, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
                <View style={desktopStyles.sectionHeaderRow}>
                  <View style={[desktopStyles.sectionIconBox, { backgroundColor: isDark ? "#713F12" : "#FEF3C7" }]}>
                    <Ionicons name="megaphone" size={18} color="#D97706" />
                  </View>
                  <Text style={[desktopStyles.sectionTitle, { color: themeColors.text }]}>Avisos</Text>
                  <Text style={[desktopStyles.sectionBadge, { backgroundColor: isDark ? "#713F12" : "#FEF3C7", color: "#D97706" }]}>
                    {ANNOUNCEMENTS.length}
                  </Text>
                </View>

                <View style={desktopStyles.announcementsList}>
                  {ANNOUNCEMENTS.map((item, index) => (
                    <View 
                      key={item.id} 
                      style={[
                        desktopStyles.announcementCard,
                        { 
                          backgroundColor: themeColors.bgSecondary, 
                          borderWidth: 1,
                          borderColor: themeColors.border,
                        }
                      ]}
                    >
                      <View style={[desktopStyles.announcementIconBox, { backgroundColor: item.bgColor }]}>
                        <Ionicons name={item.icon as any} size={18} color="#fff" />
                      </View>
                      <View style={desktopStyles.announcementContent}>
                        <Text style={[desktopStyles.announcementTitle, { color: themeColors.text }]}>{item.title}</Text>
                        <Text style={[desktopStyles.announcementMessage, { color: themeColors.textMuted }]} numberOfLines={2}>
                          {item.message}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {/* Seção de Eventos */}
            <View style={[desktopStyles.eventsSection, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
              <View style={desktopStyles.sectionHeaderRow}>
                <View style={[desktopStyles.sectionIconBox, { backgroundColor: isDark ? "#581C87" : "#F3E8FF" }]}>
                  <Ionicons name="calendar" size={18} color={themeColors.purple} />
                </View>
                <Text style={[desktopStyles.sectionTitle, { color: themeColors.text }]}>Eventos</Text>
                <Text style={[desktopStyles.sectionBadge, { backgroundColor: isDark ? "#581C87" : "#F3E8FF", color: themeColors.purple }]}>
                  {events.length}
                </Text>
              </View>

              <View style={desktopStyles.eventsContainer}>
                {loadingEvents && !eventsLoadedRef.current ? (
                  <View style={[desktopStyles.loadingBox, { backgroundColor: themeColors.bgSecondary }]}>
                    <ActivityIndicator size="small" color={themeColors.purple} />
                    <Text style={[desktopStyles.loadingText, { color: themeColors.textMuted }]}>Carregando eventos...</Text>
                  </View>
                ) : events.length === 0 ? (
                  <View style={desktopStyles.emptyEventsBox}>
                    <Ionicons name="calendar-outline" size={40} color={themeColors.textMuted} />
                    <Text style={[desktopStyles.emptyTitle, { color: themeColors.text }]}>Nenhum evento disponível</Text>
                    <Text style={[desktopStyles.emptySubtitle, { color: themeColors.textMuted }]}>
                      Fique atento para novas oportunidades!
                    </Text>
                  </View>
                ) : (
                  <View style={desktopStyles.eventsGrid}>
                    {events.map((event) => {
                      const isConfirmed = isConfirmedInEvent(event);
                      const eventStatus = getEventStatus(event);
                      const eventTypeInfo = getEventTypeInfo(event.type);
                      const eventDate = event.date ? (() => {
                        try {
                          const [year, month, day] = event.date.split("-").map(Number);
                          if (year && month && day) {
                            const date = new Date(year, month - 1, day);
                            return date.toLocaleDateString("pt-BR", {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            });
                          }
                        } catch (e) {
                          console.warn("Erro ao formatar data do evento:", e, event.date);
                        }
                        return event.date;
                      })() : "";

                      return (
                        <View 
                          key={event.id} 
                          style={[
                            desktopStyles.eventCard,
                            { 
                              backgroundColor: eventTypeInfo.color + "08",
                              borderColor: themeColors.border,
                            }
                          ]}
                        >
                          <View style={desktopStyles.eventCardHeader}>
                            <View style={[desktopStyles.eventTypeBadge, { backgroundColor: eventTypeInfo.color + "20" }]}>
                              <Ionicons name={eventTypeInfo.icon as any} size={16} color={eventTypeInfo.color} />
                              <Text style={[desktopStyles.eventTypeText, { color: eventTypeInfo.color }]}>
                                {eventTypeInfo.label}
                              </Text>
                            </View>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                              {eventStatus && (
                                <View style={[desktopStyles.statusBadge, { 
                                  backgroundColor: eventStatus.color + "20",
                                  borderColor: eventStatus.color + "40"
                                }]}>
                                  <Ionicons name={eventStatus.icon as any} size={14} color={eventStatus.color} />
                                  <Text style={[desktopStyles.statusText, { color: eventStatus.color }]}>
                                    {eventStatus.label}
                                  </Text>
                                </View>
                              )}
                              <Pressable
                                onPress={() => {
                                  setExpandedEvents(prev => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(event.id)) {
                                      newSet.delete(event.id);
                                    } else {
                                      newSet.add(event.id);
                                    }
                                    return newSet;
                                  });
                                }}
                                style={desktopStyles.expandButton}
                              >
                                <Ionicons 
                                  name={expandedEvents.has(event.id) ? "chevron-up" : "chevron-down"} 
                                  size={18} 
                                  color={themeColors.textMuted} 
                                />
                              </Pressable>
                            </View>
                          </View>
                          
                          <Text style={[desktopStyles.eventName, { color: themeColors.text }]}>{event.name}</Text>
                          
                          <View style={desktopStyles.eventDetails}>
                            {event.date && (
                              <View style={desktopStyles.eventDetailRow}>
                                <Ionicons name="calendar" size={14} color={themeColors.textMuted} />
                                <Text style={[desktopStyles.eventDetailText, { color: themeColors.textMuted }]}>{eventDate}</Text>
                              </View>
                            )}
                            {event.time && (
                              <View style={desktopStyles.eventDetailRow}>
                                <Ionicons name="time" size={14} color={themeColors.textMuted} />
                                <Text style={[desktopStyles.eventDetailText, { color: themeColors.textMuted }]}>{event.time}</Text>
                              </View>
                            )}
                            {event.location && (
                              <View style={desktopStyles.eventDetailRow}>
                                <Ionicons name="location" size={14} color={themeColors.textMuted} />
                                <Text style={[desktopStyles.eventDetailText, { color: themeColors.textMuted }]}>{event.location}</Text>
                              </View>
                            )}
                            {event.price && (
                              <View style={desktopStyles.eventDetailRow}>
                                <Ionicons name="cash" size={14} color={themeColors.textMuted} />
                                <Text style={[desktopStyles.eventDetailText, { color: themeColors.textMuted }]}>{formatCurrency(event.price)}</Text>
                              </View>
                            )}
                          </View>

                          {expandedEvents.has(event.id) && (
                            <>
                              {event.description && (
                                <Text style={[desktopStyles.eventDescription, { color: themeColors.textMuted }]}>
                                  {event.description}
                                </Text>
                              )}

                              {/* Info alerts — sem botões dentro */}
                          {isConfirmed && isConfirmedWithoutInvoice(event) && (
                            <View style={[desktopStyles.missingInvoiceAlert, { backgroundColor: themeColors.bgSecondary }]}>
                              <Ionicons name="information-circle" size={18} color="#3B82F6" />
                              <View style={desktopStyles.paymentAlertContent}>
                                <Text style={[desktopStyles.missingInvoiceTitle, { color: themeColors.text }]}>⚠️ Ação Necessária</Text>
                                <Text style={[desktopStyles.missingInvoiceText, { color: themeColors.textMuted }]}>
                                  Você está confirmado no evento, mas seu ingresso ainda não foi gerado.
                                </Text>
                              </View>
                            </View>
                          )}
                          {hasPendingInvoice(event) && (
                            <View style={[desktopStyles.paymentAlert, { backgroundColor: themeColors.bgSecondary }]}>
                              <Ionicons name="alert-circle" size={20} color="#F59E0B" />
                              <View style={desktopStyles.paymentAlertContent}>
                                <Text style={[desktopStyles.paymentAlertTitle, { color: themeColors.text }]}>⚠️ Pagamento Pendente</Text>
                                <Text style={[desktopStyles.paymentAlertText, { color: themeColors.textMuted }]}>
                                  Sua presença será confirmada após o pagamento do ingresso.
                                </Text>
                              </View>
                            </View>
                          )}
                          {hasPendingInvoice(event) && (
                            <View style={styles.companionCard}>
                              <View style={styles.companionCardHeader}>
                                <Ionicons name="people" size={16} color={colors.purple} />
                                <Text style={styles.companionCardTitle}>Convide alguém! 🎶</Text>
                              </View>
                              <View style={styles.companionCardBtns}>
                                <Pressable
                                  style={styles.companionCardBtnWa}
                                  onPress={() => handleShareEventWhatsApp(event)}
                                  disabled={!!loadingEventAction}
                                >
                                  <Ionicons name="logo-whatsapp" size={15} color="#fff" />
                                  <Text style={styles.companionCardBtnText}>Convidar pelo WhatsApp</Text>
                                </Pressable>
                              </View>
                            </View>
                          )}
                          {isConfirmed && eventStatus?.type === "needs_voucher" && (
                            <View style={[desktopStyles.paymentAlert, { backgroundColor: "#ECFDF5", borderColor: "#10B981" }]}>
                              <Ionicons name="ticket-outline" size={20} color="#10B981" />
                              <View style={desktopStyles.paymentAlertContent}>
                                <Text style={[desktopStyles.paymentAlertTitle, { color: "#10B981" }]}>✅ Pagamento Confirmado</Text>
                                <Text style={[desktopStyles.paymentAlertText, { color: "#065F46" }]}>
                                  Seu pagamento foi confirmado! Gere seu voucher de entrada.
                                </Text>
                              </View>
                            </View>
                          )}
                          {isConfirmed && eventStatus?.type === "needs_voucher" && (
                            <View style={styles.companionCard}>
                              <View style={styles.companionCardHeader}>
                                <Ionicons name="people" size={16} color={colors.purple} />
                                <Text style={styles.companionCardTitle}>Leve alguém junto! 🎶</Text>
                              </View>
                              <View style={styles.companionCardBtns}>
                                <Pressable
                                  style={styles.companionCardBtnPay}
                                  onPress={() => handleOpenCompanion(event, "pay")}
                                  disabled={!!loadingEventAction}
                                >
                                  <Ionicons name="person-add" size={15} color="#fff" />
                                  <Text style={styles.companionCardBtnText}>Eu pago o ingresso</Text>
                                </Pressable>
                                <Pressable
                                  style={styles.companionCardBtnWa}
                                  onPress={() => handleShareEventWhatsApp(event)}
                                  disabled={!!loadingEventAction}
                                >
                                  <Ionicons name="logo-whatsapp" size={15} color="#fff" />
                                  <Text style={styles.companionCardBtnText}>Convidar pelo WhatsApp</Text>
                                </Pressable>
                              </View>
                            </View>
                          )}
                          {isConfirmed && eventStatus?.type === "voucher_generated" && (
                            <>
                              <View style={[desktopStyles.voucherGeneratedAlert, { backgroundColor: themeColors.bgSecondary }]}>
                                <Ionicons name="ticket" size={20} color={colors.green} />
                                <View style={desktopStyles.paymentAlertContent}>
                                  <Text style={[desktopStyles.voucherGeneratedTitle, { color: themeColors.text }]}>✅ Voucher Gerado</Text>
                                  <Text style={[desktopStyles.voucherGeneratedText, { color: themeColors.textMuted }]}>
                                    Seu ingresso está confirmado! Leve alguém especial.
                                  </Text>
                                </View>
                              </View>
                              <View style={styles.companionCard}>
                                <View style={styles.companionCardHeader}>
                                  <Ionicons name="people" size={16} color={colors.purple} />
                                  <Text style={styles.companionCardTitle}>Leve alguém junto! 🎶</Text>
                                </View>
                                <View style={styles.companionCardBtns}>
                                  <Pressable
                                    style={styles.companionCardBtnPay}
                                    onPress={() => handleOpenCompanion(event, "pay")}
                                    disabled={!!loadingEventAction}
                                  >
                                    <Ionicons name="person-add" size={15} color="#fff" />
                                    <Text style={styles.companionCardBtnText}>Eu pago o ingresso</Text>
                                  </Pressable>
                                  <Pressable
                                    style={styles.companionCardBtnWa}
                                    onPress={() => handleShareEventWhatsApp(event)}
                                    disabled={!!loadingEventAction}
                                  >
                                    <Ionicons name="logo-whatsapp" size={15} color="#fff" />
                                    <Text style={styles.companionCardBtnText}>Convidar pelo WhatsApp</Text>
                                  </Pressable>
                                </View>
                              </View>
                            </>
                          )}

                          {/* Linha de botões quando confirmado */}
                          {isConfirmed && (
                            <View style={styles.eventBtnRow}>
                              {eventStatus?.type === "needs_invoice" && (
                                <Pressable
                                  style={[styles.eventBtnAction, { backgroundColor: "#3B82F6" }, !!loadingEventAction && { opacity: 0.6 }]}
                                  onPress={() => handleGenerateInvoice(event)}
                                  disabled={!!loadingEventAction}
                                >
                                  {loadingEventAction?.id === event.id && loadingEventAction?.action === "invoice"
                                    ? <ActivityIndicator size="small" color="#fff" />
                                    : <Ionicons name="receipt" size={14} color="#fff" />}
                                  <Text style={styles.eventBtnActionText}>
                                    {loadingEventAction?.id === event.id && loadingEventAction?.action === "invoice" ? "Gerando..." : "Gerar Ingresso"}
                                  </Text>
                                </Pressable>
                              )}
                              {eventStatus?.type === "pending" && (
                                <Pressable
                                  style={[styles.eventBtnAction, { backgroundColor: "#F59E0B" }]}
                                  onPress={() => desktopNav?.setActiveTab("pagamentos")}
                                >
                                  <Ionicons name="card" size={14} color="#fff" />
                                  <Text style={styles.eventBtnActionText}>Ir para Pagamentos</Text>
                                </Pressable>
                              )}
                              {eventStatus?.type === "needs_voucher" && (
                                <Pressable
                                  style={[styles.eventBtnAction, { backgroundColor: "#10B981" }, !!loadingEventAction && { opacity: 0.6 }]}
                                  onPress={() => handleGenerateVoucher(event)}
                                  disabled={!!loadingEventAction}
                                >
                                  {loadingEventAction?.id === event.id && loadingEventAction?.action === "voucher"
                                    ? <ActivityIndicator size="small" color="#fff" />
                                    : <Ionicons name="ticket" size={14} color="#fff" />}
                                  <Text style={styles.eventBtnActionText}>
                                    {loadingEventAction?.id === event.id && loadingEventAction?.action === "voucher" ? "Gerando..." : "Gerar Voucher"}
                                  </Text>
                                </Pressable>
                              )}
                              {eventStatus?.type === "voucher_generated" && (
                                <>
                                  <Pressable
                                    style={[styles.eventBtnAction, { backgroundColor: colors.green }, !!loadingEventAction && { opacity: 0.6 }]}
                                    disabled={!!loadingEventAction}
                                    onPress={async () => {
                                      if (loadingEventAction) return;
                                      setLoadingEventAction({ id: event.id, action: "view_voucher" });
                                      try {
                                        if (!eventVouchers[event.id]) {
                                          const invoice = invoices.find(inv =>
                                            inv.description?.includes(`Ingresso: ${event.name}`) && inv.status === "paid"
                                          );
                                          if (invoice) {
                                            let v = await fetchVoucherByInvoiceId(invoice.id);
                                            if (!v) v = await createBaileVoucher(invoice);
                                            if (v) { setEventVouchers(prev => ({ ...prev, [event.id]: v })); setSelectedVoucher(v); setShowVoucherModal(true); }
                                            else showMessage("Erro", "Não foi possível gerar o voucher.");
                                          } else showMessage("Ingresso não encontrado", "Ingresso pago não localizado.");
                                        } else { setSelectedVoucher(eventVouchers[event.id]); setShowVoucherModal(true); }
                                      } catch { showMessage("Erro", "Não foi possível carregar o voucher."); }
                                      finally { setLoadingEventAction(null); }
                                    }}
                                  >
                                    {loadingEventAction?.id === event.id && loadingEventAction?.action === "view_voucher"
                                      ? <ActivityIndicator size="small" color="#fff" />
                                      : <Ionicons name="ticket" size={14} color="#fff" />}
                                    <Text style={styles.eventBtnActionText}>
                                      {loadingEventAction?.id === event.id && loadingEventAction?.action === "view_voucher" ? "Carregando..." : "Ver Voucher"}
                                    </Text>
                                  </Pressable>
                                </>
                              )}
                              <Pressable
                                style={[styles.eventBtnCancel,
                                  loadingEventAction?.id === event.id && loadingEventAction?.action === "cancel" && { opacity: 0.6 }
                                ]}
                                onPress={() => handleCancelEvent(event)}
                                disabled={loadingEventAction?.id === event.id && loadingEventAction?.action === "cancel"}
                              >
                                {loadingEventAction?.id === event.id && loadingEventAction?.action === "cancel"
                                  ? <ActivityIndicator size="small" color="#fff" />
                                  : <Ionicons name="close-circle" size={14} color="#fff" />}
                                <Text style={styles.eventBtnActionText}>
                                  {loadingEventAction?.id === event.id && loadingEventAction?.action === "cancel" ? "Cancelando..." : "Cancelar"}
                                </Text>
                              </Pressable>
                            </View>
                          )}

                          {!isConfirmed && hasPendingInvoice(event) && (
                            <Pressable
                              style={[desktopStyles.joinButton, { backgroundColor: "#F59E0B" }]}
                              onPress={() => desktopNav?.setActiveTab("pagamentos")}
                            >
                              <Ionicons name="card" size={18} color="#fff" />
                              <Text style={desktopStyles.joinButtonText}>Ir para Pagamentos</Text>
                            </Pressable>
                          )}

                          {!isConfirmed && !hasPendingInvoice(event) && !hasPaidInvoice(event) && (
                            <Pressable
                              style={[desktopStyles.joinButton, { backgroundColor: eventTypeInfo.color },
                                loadingEventAction?.id === event.id && loadingEventAction?.action === "join" && { opacity: 0.6 }
                              ]}
                              onPress={() => handleJoinEvent(event)}
                              disabled={!!loadingEventAction}
                            >
                              {loadingEventAction?.id === event.id && loadingEventAction?.action === "join"
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <Ionicons name="add-circle" size={18} color="#fff" />
                              }
                              <Text style={desktopStyles.joinButtonText}>
                                {loadingEventAction?.id === event.id && loadingEventAction?.action === "join" ? "Aguarde..." : "Participar"}
                              </Text>
                            </Pressable>
                          )}
                            </>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>

            {/* Quick Actions */}
            <View style={desktopStyles.quickActionsSection}>
              <Text style={[desktopStyles.quickActionsTitle, { color: themeColors.text }]}>Ações Rápidas</Text>
              <View style={desktopStyles.quickActionsGrid}>
                <Pressable 
                  style={[desktopStyles.quickActionCard, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}
                  onPress={() => handleContactWhatsApp("Olá! Gostaria de falar com a escola sobre meu perfil e minhas informações no app.")}
                >
                  <View style={[desktopStyles.quickActionIcon, { backgroundColor: isDark ? "#14532D" : "#DCFCE7" }]}>
                    <Ionicons name="logo-whatsapp" size={22} color="#16A34A" />
                  </View>
                  <Text style={[desktopStyles.quickActionLabel, { color: themeColors.text }]}>Falar com a Escola</Text>
                </Pressable>
                <Pressable 
                  style={[desktopStyles.quickActionCard, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}
                  onPress={() => desktopNav?.setActiveTab("pagamentos")}
                >
                  <View style={[desktopStyles.quickActionIcon, { backgroundColor: isDark ? "#7F1D1D" : "#FEE2E2" }]}>
                    <Ionicons name="card-outline" size={22} color="#DC2626" />
                  </View>
                  <Text style={[desktopStyles.quickActionLabel, { color: themeColors.text }]}>Ver Pagamentos</Text>
                </Pressable>
                <Pressable 
                  style={[desktopStyles.quickActionCard, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}
                  onPress={() => desktopNav?.setActiveTab("conta")}
                >
                  <View style={[desktopStyles.quickActionIcon, { backgroundColor: isDark ? "#1E3A5F" : "#E0E7FF" }]}>
                    <Ionicons name="person-outline" size={22} color="#4F46E5" />
                  </View>
                  <Text style={[desktopStyles.quickActionLabel, { color: themeColors.text }]}>Meus Dados</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Mobile Layout - Suas Aulas */}
        {!isDesktopMode && <SectionHeader title="Suas Turmas" />}

        {!isDesktopMode && (
          <View style={styles.block}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Carregando aulas...</Text>
              </View>
            ) : myClasses.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="calendar-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>Você não está matriculado em nenhuma turma</Text>
                <Text style={styles.emptySubtext}>
                  Entre em contato com a administração para se matricular
                </Text>
              </View>
            ) : (
              <>
                {myClasses.slice(0, 2).map((classItem) => (
                  <ClassCard
                    key={classItem.id}
                    classItem={classItem}
                    getNextClassInfo={getNextClassInfo}
                  />
                ))}
                {myClasses.length > 2 && (
                  <Pressable
                    style={styles.viewAllClassesBtn}
                    onPress={() => navigation.navigate("Turmas")}
                  >
                    <Ionicons name="grid-outline" size={16} color={colors.purple} />
                    <Text style={styles.viewAllClassesBtnText}>
                      Ver todas as turmas ({myClasses.length})
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.purple} />
                  </Pressable>
                )}
              </>
            )}
          </View>
        )}

        {/* Mobile Layout - Eventos */}
        {!isDesktopMode && <SectionHeader title="Eventos" />}

        {!isDesktopMode && (
          <View style={styles.block}>
            {loadingEvents && !eventsLoadedRef.current ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Carregando eventos...</Text>
              </View>
            ) : events.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="calendar-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>Nenhum evento disponível no momento</Text>
                <Text style={styles.emptySubtext}>
                  Fique atento para novas oportunidades!
                </Text>
              </View>
            ) : (
              events.map((event) => {
                const isConfirmed = isConfirmedInEvent(event);
                const hasPendingPayment = hasPendingInvoice(event);
                const needsInvoiceGeneration = isConfirmedWithoutInvoice(event);
                const eventStatus = getEventStatus(event);
                const eventTypeInfo = getEventTypeInfo(event.type);
                // Formata data corretamente (event.date vem no formato YYYY-MM-DD)
                const eventDate = event.date ? (() => {
                  try {
                    const [year, month, day] = event.date.split("-").map(Number);
                    if (year && month && day) {
                      // Usa Date local para evitar problemas de timezone
                      const date = new Date(year, month - 1, day);
                      return date.toLocaleDateString("pt-BR", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      });
                    }
                  } catch (e) {
                    console.warn("Erro ao formatar data do evento:", e, event.date);
                  }
                  return event.date;
                })() : "";
                
                return (
                  <View key={event.id} style={[styles.eventCard, { backgroundColor: eventTypeInfo.color + "08" }]}>
                    <View style={styles.eventCardHeader}>
                      <View style={[styles.eventTypeBadge, { backgroundColor: eventTypeInfo.color + "20" }]}>
                        <Ionicons name={eventTypeInfo.icon as any} size={16} color={eventTypeInfo.color} />
                        <Text style={[styles.eventTypeText, { color: eventTypeInfo.color }]}>
                          {eventTypeInfo.label}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        {eventStatus && (
                          <View style={[styles.statusBadge, { 
                            backgroundColor: eventStatus.color + "20",
                            borderColor: eventStatus.color + "40"
                          }]}>
                            <Ionicons name={eventStatus.icon as any} size={14} color={eventStatus.color} />
                            <Text style={[styles.statusText, { color: eventStatus.color }]}>
                              {eventStatus.label}
                            </Text>
                          </View>
                        )}
                        <Pressable
                          onPress={() => {
                            setExpandedEvents(prev => {
                              const newSet = new Set(prev);
                              if (newSet.has(event.id)) {
                                newSet.delete(event.id);
                              } else {
                                newSet.add(event.id);
                              }
                              return newSet;
                            });
                          }}
                          style={styles.expandButton}
                        >
                          <Ionicons 
                            name={expandedEvents.has(event.id) ? "chevron-up" : "chevron-down"} 
                            size={18} 
                            color={colors.muted} 
                          />
                        </Pressable>
                      </View>
                    </View>
                    
                    <Text style={styles.eventName}>{event.name}</Text>
                    
                    <View style={styles.eventDetails}>
                      {event.date && (
                        <View style={styles.eventDetailRow}>
                          <Ionicons name="calendar" size={14} color={colors.muted} />
                          <Text style={styles.eventDetailText}>{eventDate}</Text>
                        </View>
                      )}
                      {event.time && (
                        <View style={styles.eventDetailRow}>
                          <Ionicons name="time" size={14} color={colors.muted} />
                          <Text style={styles.eventDetailText}>{event.time}</Text>
                        </View>
                      )}
                      {event.location && (
                        <View style={styles.eventDetailRow}>
                          <Ionicons name="location" size={14} color={colors.muted} />
                          <Text style={styles.eventDetailText}>{event.location}</Text>
                        </View>
                      )}
                      {event.price && (
                        <View style={styles.eventDetailRow}>
                          <Ionicons name="cash" size={14} color={colors.muted} />
                          <Text style={styles.eventDetailText}>{formatCurrency(event.price)}</Text>
                        </View>
                      )}
                    </View>

                    {expandedEvents.has(event.id) && (
                      <>
                        {event.description && (
                          <Text style={styles.eventDescription}>
                            {event.description}
                          </Text>
                        )}

                        {/* Info alerts — sem botões dentro */}
                    {isConfirmed && needsInvoiceGeneration && (
                      <View style={styles.missingInvoiceAlert}>
                        <Text style={styles.missingInvoiceTitle}>⚠️ Ação Necessária</Text>
                        <Text style={styles.missingInvoiceText}>
                          Você está confirmado no evento, mas seu ingresso ainda não foi gerado. Gere o ingresso para receber seu voucher de entrada.
                        </Text>
                      </View>
                    )}
                    {hasPendingPayment && (
                      <View style={styles.paymentAlert}>
                        <Ionicons name="alert-circle" size={20} color="#F59E0B" style={styles.paymentAlertIcon} />
                        <Text style={styles.paymentAlertTitle}>⚠️ Pagamento Pendente</Text>
                        <Text style={styles.paymentAlertText}>
                          Sua presença será confirmada após o pagamento do ingresso.
                        </Text>
                      </View>
                    )}
                    {isConfirmed && eventStatus?.type === "needs_voucher" && (
                      <View style={[styles.paymentAlert, { backgroundColor: "#ECFDF5", borderColor: "#10B981" }]}>
                        <Ionicons name="ticket-outline" size={20} color="#10B981" style={styles.paymentAlertIcon} />
                        <Text style={[styles.paymentAlertTitle, { color: "#10B981" }]}>✅ Pagamento Confirmado</Text>
                        <Text style={[styles.paymentAlertText, { color: "#065F46" }]}>
                          Seu pagamento foi confirmado! Gere seu voucher de entrada.
                        </Text>
                      </View>
                    )}
                    {isConfirmed && eventStatus?.type === "needs_voucher" && (
                      <View style={styles.companionCard}>
                        <View style={styles.companionCardHeader}>
                          <Ionicons name="people" size={16} color={colors.purple} />
                          <Text style={styles.companionCardTitle}>Leve alguém junto! 🎶</Text>
                        </View>
                        <View style={styles.companionCardBtns}>
                          <Pressable
                            style={styles.companionCardBtnPay}
                            onPress={() => handleOpenCompanion(event, "pay")}
                            disabled={!!loadingEventAction}
                          >
                            <Ionicons name="person-add" size={15} color="#fff" />
                            <Text style={styles.companionCardBtnText}>Eu pago o ingresso</Text>
                          </Pressable>
                          <Pressable
                            style={styles.companionCardBtnWa}
                            onPress={() => handleShareEventWhatsApp(event)}
                            disabled={!!loadingEventAction}
                          >
                            <Ionicons name="logo-whatsapp" size={15} color="#fff" />
                            <Text style={styles.companionCardBtnText}>Convidar pelo WhatsApp</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                    {hasPendingPayment && (
                      <View style={styles.companionCard}>
                        <View style={styles.companionCardHeader}>
                          <Ionicons name="people" size={16} color={colors.purple} />
                          <Text style={styles.companionCardTitle}>Convide alguém! 🎶</Text>
                        </View>
                        <View style={styles.companionCardBtns}>
                          <Pressable
                            style={styles.companionCardBtnWa}
                            onPress={() => handleShareEventWhatsApp(event)}
                            disabled={!!loadingEventAction}
                          >
                            <Ionicons name="logo-whatsapp" size={15} color="#fff" />
                            <Text style={styles.companionCardBtnText}>Convidar pelo WhatsApp</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                    {isConfirmed && eventStatus?.type === "voucher_generated" && (
                      <>
                        <View style={styles.voucherGeneratedAlert}>
                          <Ionicons name="ticket" size={20} color={colors.green} style={styles.paymentAlertIcon} />
                          <Text style={styles.voucherGeneratedTitle}>✅ Voucher Gerado</Text>
                          <Text style={styles.voucherGeneratedText}>
                            Seu ingresso está confirmado! Leve alguém especial.
                          </Text>
                        </View>
                        <View style={styles.companionCard}>
                          <View style={styles.companionCardHeader}>
                            <Ionicons name="people" size={16} color={colors.purple} />
                            <Text style={styles.companionCardTitle}>Leve alguém junto! 🎶</Text>
                          </View>
                          <View style={styles.companionCardBtns}>
                            <Pressable
                              style={styles.companionCardBtnPay}
                              onPress={() => handleOpenCompanion(event, "pay")}
                              disabled={!!loadingEventAction}
                            >
                              <Ionicons name="person-add" size={15} color="#fff" />
                              <Text style={styles.companionCardBtnText}>Eu pago o ingresso</Text>
                            </Pressable>
                            <Pressable
                              style={styles.companionCardBtnWa}
                              onPress={() => handleShareEventWhatsApp(event)}
                              disabled={!!loadingEventAction}
                            >
                              <Ionicons name="logo-whatsapp" size={15} color="#fff" />
                              <Text style={styles.companionCardBtnText}>Convidar pelo WhatsApp</Text>
                            </Pressable>
                          </View>
                        </View>
                      </>
                    )}

                    {/* Linha de botões de ação quando confirmado */}
                    {isConfirmed && (
                      <View style={styles.eventBtnRow}>
                        {eventStatus?.type === "needs_invoice" && (
                          <Pressable
                            style={[styles.eventBtnAction, { backgroundColor: "#3B82F6" }, !!loadingEventAction && { opacity: 0.6 }]}
                            onPress={() => handleGenerateInvoice(event)}
                            disabled={!!loadingEventAction}
                          >
                            {loadingEventAction?.id === event.id && loadingEventAction?.action === "invoice"
                              ? <ActivityIndicator size="small" color="#fff" />
                              : <Ionicons name="receipt" size={14} color="#fff" />}
                            <Text style={styles.eventBtnActionText}>
                              {loadingEventAction?.id === event.id && loadingEventAction?.action === "invoice" ? "Gerando..." : "Gerar Ingresso"}
                            </Text>
                          </Pressable>
                        )}
                        {eventStatus?.type === "pending" && (
                          <Pressable
                            style={[styles.eventBtnAction, { backgroundColor: "#F59E0B" }]}
                            onPress={() => isDesktopMode && desktopNav ? desktopNav.setActiveTab("pagamentos") : navigation.navigate("Pagamento")}
                          >
                            <Ionicons name="card" size={14} color="#fff" />
                            <Text style={styles.eventBtnActionText}>Ir para Pagamentos</Text>
                          </Pressable>
                        )}
                        {eventStatus?.type === "needs_voucher" && (
                          <Pressable
                            style={[styles.eventBtnAction, { backgroundColor: "#10B981" }, !!loadingEventAction && { opacity: 0.6 }]}
                            onPress={() => handleGenerateVoucher(event)}
                            disabled={!!loadingEventAction}
                          >
                            {loadingEventAction?.id === event.id && loadingEventAction?.action === "voucher"
                              ? <ActivityIndicator size="small" color="#fff" />
                              : <Ionicons name="ticket" size={14} color="#fff" />}
                            <Text style={styles.eventBtnActionText}>
                              {loadingEventAction?.id === event.id && loadingEventAction?.action === "voucher" ? "Gerando..." : "Gerar Voucher"}
                            </Text>
                          </Pressable>
                        )}
                        {eventStatus?.type === "voucher_generated" && (
                          <>
                            <Pressable
                              style={[styles.eventBtnAction, { backgroundColor: colors.green }, !!loadingEventAction && { opacity: 0.6 }]}
                              disabled={!!loadingEventAction}
                              onPress={async () => {
                                if (loadingEventAction) return;
                                setLoadingEventAction({ id: event.id, action: "view_voucher" });
                                try {
                                  if (!eventVouchers[event.id]) {
                                    const invoice = invoices.find(inv =>
                                      inv.description?.includes(`Ingresso: ${event.name}`) && inv.status === "paid"
                                    );
                                    if (invoice) {
                                      let v = await fetchVoucherByInvoiceId(invoice.id);
                                      if (!v) v = await createBaileVoucher(invoice);
                                      if (v) { setEventVouchers(prev => ({ ...prev, [event.id]: v })); setSelectedVoucher(v); setShowVoucherModal(true); }
                                      else showMessage("Erro", "Não foi possível gerar o voucher.");
                                    } else showMessage("Ingresso não encontrado", "Ingresso pago não localizado.");
                                  } else { setSelectedVoucher(eventVouchers[event.id]); setShowVoucherModal(true); }
                                } catch { showMessage("Erro", "Não foi possível carregar o voucher."); }
                                finally { setLoadingEventAction(null); }
                              }}
                            >
                              {loadingEventAction?.id === event.id && loadingEventAction?.action === "view_voucher"
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <Ionicons name="ticket" size={14} color="#fff" />}
                              <Text style={styles.eventBtnActionText}>
                                {loadingEventAction?.id === event.id && loadingEventAction?.action === "view_voucher" ? "Carregando..." : "Ver Voucher"}
                              </Text>
                            </Pressable>
                          </>
                        )}
                        <Pressable
                          style={[styles.eventBtnCancel,
                            loadingEventAction?.id === event.id && loadingEventAction?.action === "cancel" && { opacity: 0.6 }
                          ]}
                          onPress={() => handleCancelEvent(event)}
                          disabled={loadingEventAction?.id === event.id && loadingEventAction?.action === "cancel"}
                        >
                          {loadingEventAction?.id === event.id && loadingEventAction?.action === "cancel"
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Ionicons name="close-circle" size={14} color="#fff" />}
                          <Text style={styles.eventBtnActionText}>
                            {loadingEventAction?.id === event.id && loadingEventAction?.action === "cancel" ? "Cancelando..." : "Cancelar"}
                          </Text>
                        </Pressable>
                      </View>
                    )}

                    {/* Pagamento pendente mas não confirmado — navega para pagamentos */}
                    {!isConfirmed && hasPendingPayment && (
                      <Pressable
                        style={[styles.joinButton, { backgroundColor: "#F59E0B" }]}
                        onPress={() => isDesktopMode && desktopNav ? desktopNav.setActiveTab("pagamentos") : navigation.navigate("Pagamento")}
                      >
                        <Ionicons name="card" size={18} color="#fff" />
                        <Text style={styles.joinButtonText}>Ir para Pagamentos</Text>
                      </Pressable>
                    )}

                    {!isConfirmed && !hasPendingPayment && !hasPaidInvoice(event) && (
                      <Pressable
                        style={[styles.joinButton, { backgroundColor: eventTypeInfo.color },
                          loadingEventAction?.id === event.id && loadingEventAction?.action === "join" && { opacity: 0.6 }
                        ]}
                        onPress={() => handleJoinEvent(event)}
                        disabled={!!loadingEventAction}
                      >
                        {loadingEventAction?.id === event.id && loadingEventAction?.action === "join"
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Ionicons name="add-circle" size={18} color="#fff" />
                        }
                        <Text style={styles.joinButtonText}>
                          {loadingEventAction?.id === event.id && loadingEventAction?.action === "join" ? "Aguarde..." : "Participar"}
                        </Text>
                      </Pressable>
                    )}
                      </>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Modal de Voucher */}
      <Modal visible={showVoucherModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowVoucherModal(false)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            {selectedVoucher && (
              <View style={[styles.voucherModal, { backgroundColor: colors.bg }]}>
                <View style={styles.voucherModalHeader}>
                  <View style={[styles.voucherIconBoxLarge, { backgroundColor: selectedVoucher.status === "valid" ? "#EDE9FE" : "#F1F5F9" }]}>
                    <Ionicons 
                      name="ticket" 
                      size={48} 
                      color={selectedVoucher.status === "valid" ? colors.purple : "#64748B"} 
                    />
                  </View>
                  <View style={[
                    styles.voucherStatusBadgeLarge,
                    { backgroundColor: selectedVoucher.status === "valid" ? "#D1FAE5" : "#F1F5F9" }
                  ]}>
                    <Ionicons 
                      name={selectedVoucher.status === "valid" ? "checkmark-circle" : "close-circle"} 
                      size={16} 
                      color={selectedVoucher.status === "valid" ? "#059669" : "#64748B"} 
                    />
                    <Text style={[
                      styles.voucherStatusTextLarge,
                      { color: selectedVoucher.status === "valid" ? "#059669" : "#64748B" }
                    ]}>
                      {selectedVoucher.status === "valid" ? "Válido" : selectedVoucher.status === "used" ? "Já Utilizado" : "Cancelado"}
                    </Text>
                  </View>
                </View>

                <View style={styles.voucherModalContent}>
                  <Text style={styles.voucherEventName}>{selectedVoucher.eventName}</Text>
                  <Text style={styles.voucherCodeLabel}>Código do Voucher</Text>
                  <View style={[styles.voucherCodeBox, { backgroundColor: colors.purple + "15", borderColor: colors.purple + "40" }]}>
                    <Text style={[styles.voucherCodeText, { color: colors.purple }]}>{selectedVoucher.voucherCode}</Text>
                  </View>
                  <Text style={styles.voucherInstructions}>
                    Apresente este código na entrada do evento para validar sua presença.
                  </Text>
                  {selectedVoucher.createdAt && (
                    <Text style={styles.voucherDate}>
                      Gerado em: {new Date(selectedVoucher.createdAt).toLocaleDateString("pt-BR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </Text>
                  )}
                </View>

                <Pressable
                  style={[styles.voucherCloseBtn, { backgroundColor: colors.purple }]}
                  onPress={() => setShowVoucherModal(false)}
                >
                  <Text style={styles.voucherCloseBtnText}>Fechar</Text>
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal de Acompanhante */}
      <Modal visible={showCompanionModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => !creatingCompanion && setShowCompanionModal(false)}>
          <Pressable style={[styles.companionModal, { backgroundColor: colors.bg }]} onPress={(e: any) => e.stopPropagation()}>
            {/* Header */}
            <View style={styles.companionModalHeader}>
              <View style={[styles.companionModalIcon, { backgroundColor: "#EDE9FE" }]}>
                <Ionicons name="people" size={32} color={colors.purple} />
              </View>
              <Text style={[styles.companionModalTitle, { color: colors.text }]}>Leve Alguém Junto</Text>
              {companionEvent && (
                <Text style={[styles.companionModalEvent, { color: colors.muted }]}>{companionEvent.name}</Text>
              )}
            </View>

            {/* Tabs */}
            <View style={styles.companionTabs}>
              <Pressable
                style={[styles.companionTab, companionModalTab === "pay" && styles.companionTabActive]}
                onPress={() => setCompanionModalTab("pay")}
              >
                <Ionicons name="card" size={15} color={companionModalTab === "pay" ? colors.purple : colors.muted} />
                <Text style={[styles.companionTabText, companionModalTab === "pay" && styles.companionTabTextActive]}>
                  Eu pago
                </Text>
              </Pressable>
              <Pressable
                style={[styles.companionTab, companionModalTab === "invite" && styles.companionTabActive]}
                onPress={() => setCompanionModalTab("invite")}
              >
                <Ionicons name="logo-whatsapp" size={15} color={companionModalTab === "invite" ? "#25D366" : colors.muted} />
                <Text style={[styles.companionTabText, companionModalTab === "invite" && { color: "#25D366", fontWeight: "700" }]}>
                  Convidar
                </Text>
              </Pressable>
            </View>

            {companionModalTab === "pay" ? (
              <>
                {/* Descrição */}
                <View style={[styles.companionInfoBox, { backgroundColor: colors.grayCard }]}>
                  <Ionicons name="information-circle" size={16} color={colors.purple} />
                  <Text style={[styles.companionInfoText, { color: colors.muted }]}>
                    Você paga o ingresso do acompanhante via PIX. Ele receberá um voucher próprio para entrar.
                  </Text>
                </View>
                <View style={styles.companionFormRow}>
                  <Text style={[styles.companionLabel, { color: colors.text }]}>Nome do Acompanhante</Text>
                  <TextInput
                    style={[styles.companionInput, { borderColor: colors.grayBorder, color: colors.text, backgroundColor: colors.grayCard }]}
                    placeholder="Nome completo..."
                    placeholderTextColor={colors.muted}
                    value={companionName}
                    onChangeText={setCompanionName}
                    editable={!creatingCompanion}
                  />
                </View>
                <View style={[styles.companionPriceBox, { backgroundColor: "#EDE9FE" }]}>
                  <Text style={[styles.companionPriceLabel, { color: colors.muted }]}>Valor do Ingresso</Text>
                  <Text style={[styles.companionPriceValue, { color: colors.purple }]}>
                    {companionEvent?.price ? formatCurrency(companionEvent.price) : "--"}
                  </Text>
                </View>
                <View style={styles.companionModalBtns}>
                  <Pressable
                    style={[styles.companionCancelBtn, { backgroundColor: colors.grayCard }]}
                    onPress={() => setShowCompanionModal(false)}
                    disabled={creatingCompanion}
                  >
                    <Text style={[styles.companionCancelBtnText, { color: colors.muted }]}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.companionConfirmBtn, { backgroundColor: colors.purple, opacity: creatingCompanion ? 0.7 : 1 }]}
                    onPress={handleConfirmCompanion}
                    disabled={creatingCompanion}
                  >
                    {creatingCompanion ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={18} color="#fff" />
                        <Text style={styles.companionConfirmBtnText}>Gerar Cobrança PIX</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                {/* Descrição */}
                <View style={[styles.companionInfoBox, { backgroundColor: "#F0FDF4" }]}>
                  <Ionicons name="information-circle" size={16} color="#25D366" />
                  <Text style={[styles.companionInfoText, { color: "#065F46" }]}>
                    Envie um convite pelo WhatsApp. A pessoa cria conta no app, confirma presença e paga o próprio ingresso.
                  </Text>
                </View>
                <View style={styles.companionFormRow}>
                  <Text style={[styles.companionLabel, { color: colors.text }]}>WhatsApp do convidado (opcional)</Text>
                  <TextInput
                    style={[styles.companionInput, { borderColor: colors.grayBorder, color: colors.text, backgroundColor: colors.grayCard }]}
                    placeholder="(11) 99999-9999"
                    placeholderTextColor={colors.muted}
                    value={companionPhone}
                    onChangeText={setCompanionPhone}
                    keyboardType="phone-pad"
                  />
                </View>
                <View style={[styles.companionPriceBox, { backgroundColor: "#F0FDF4" }]}>
                  <Ionicons name="chatbubble-ellipses" size={20} color="#25D366" />
                  <Text style={[styles.companionPriceLabel, { color: "#065F46", textAlign: "center" }]}>
                    Uma mensagem será enviada com o link do app e as informações do evento.
                  </Text>
                </View>
                <View style={styles.companionModalBtns}>
                  <Pressable
                    style={[styles.companionCancelBtn, { backgroundColor: colors.grayCard }]}
                    onPress={() => setShowCompanionModal(false)}
                  >
                    <Text style={[styles.companionCancelBtnText, { color: colors.muted }]}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.companionConfirmBtn, { backgroundColor: "#25D366" }]}
                    onPress={() => {
                      setShowCompanionModal(false);
                      handleShareEventWhatsApp(companionEvent!, companionPhone);
                    }}
                  >
                    <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                    <Text style={styles.companionConfirmBtnText}>Enviar Convite</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// Função auxiliar para obter informações do tipo de evento
const getEventTypeInfo = (type: string | undefined) => {
  const types: Record<string, { label: string; icon: string; color: string }> = {
    workshop: { label: "Workshop", icon: "school", color: "#0891B2" },
    baile: { label: "Baile", icon: "musical-notes", color: "#7C3AED" },
    aula_especial: { label: "Aula Especial", icon: "star", color: "#F59E0B" },
    evento_social: { label: "Evento Social", icon: "people", color: "#10B981" },
    outro: { label: "Outro", icon: "calendar", color: "#64748B" },
  };
  return types[type || "outro"] || types.outro;
};

export default memo(StudentHomeScreen);

const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: colors.bg,
    ...(isWeb && {
      overflow: 'hidden' as any,
    }),
  },
  content: { 
    paddingBottom: 18,
  },
  block: { padding: 12, paddingTop: 14 },
  
  // Carrossel
  carouselContainer: {
    marginTop: 8,
  },
  announcementCardWrapper: {
    width: SCREEN_WIDTH,
    paddingHorizontal: CARD_MARGIN,
    justifyContent: "center",
    alignItems: "center",
    flex: 1,
  },
  announcementCard: {
    width: "100%",
    borderRadius: 16,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  announcementIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  announcementTextContainer: {
    flex: 1,
  },
  announcementTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 4,
  },
  announcementMessage: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
    lineHeight: 20,
  },
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 14,
    marginBottom: 8,
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#D0D0D0",
  },
  dotActive: {
    backgroundColor: colors.purple,
    transform: [{ scale: 1.2 }],
  },
  
  // Class card
  classCardWrapper: {
    marginBottom: 10,
  },
  
  // Loading e Empty
  loadingContainer: {
    padding: 40,
    alignItems: "center",
  },
  loadingText: {
    color: colors.muted,
    fontWeight: "600",
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    marginTop: 16,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    marginTop: 8,
  },
  viewAllClassesBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
    paddingVertical: 13,
    paddingHorizontal: 16,
    backgroundColor: "#EDE9FE",
    borderRadius: 12,
  },
  viewAllClassesBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.purple,
    flex: 1,
    textAlign: "center",
  },
  bottomSpacer: {
    height: 14,
  },
  
  // Event Card Styles
  eventCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  eventCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  eventTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  eventTypeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  expandButton: {
    padding: 4,
    borderRadius: 6,
  },
  eventName: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 12,
  },
  eventDetails: {
    gap: 8,
    marginBottom: 12,
  },
  eventDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  eventDetailText: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: "600",
  },
  eventDescription: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    marginBottom: 12,
  },
  joinButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  joinButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
    alignSelf: "center",
    marginTop: 16,
  },
  cancelButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  paymentAlert: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
    gap: 10,
    alignItems: "center",
  },
  paymentAlertIcon: {
    alignSelf: "center",
  },
  paymentAlertTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#92400E",
    textAlign: "center",
    width: "100%",
  },
  paymentAlertText: {
    fontSize: 12,
    color: "#78350F",
    lineHeight: 18,
    textAlign: "center",
    width: "100%",
  },
  paymentAlertButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F59E0B",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
    alignSelf: "center",
    marginTop: 2,
  },
  paymentAlertButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  voucherGeneratedAlert: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#86EFAC",
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
    gap: 10,
    alignItems: "center",
  },
  voucherGeneratedTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#065F46",
    textAlign: "center",
  },
  voucherGeneratedText: {
    fontSize: 12,
    color: "#047857",
    lineHeight: 16,
    textAlign: "center",
  },
  viewVoucherButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.green,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
    marginTop: 8,
    alignSelf: "center",
  },
  viewVoucherButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  missingInvoiceAlert: {
    flexDirection: "column",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#93C5FD",
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
    gap: 10,
  },
  paymentAlertContent: {
    flex: 1,
    flexShrink: 1,
    alignItems: "center",
    width: "100%",
  },
  missingInvoiceTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E40AF",
    textAlign: "center",
    marginBottom: 4,
  },
  missingInvoiceText: {
    fontSize: 12,
    color: "#1E3A8A",
    lineHeight: 16,
    textAlign: "center",
    width: "100%",
  },
  generateInvoiceButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3B82F6",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
    marginTop: 4,
    alignSelf: "center",
  },
  generateInvoiceButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  // Modal de Voucher
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  voucherModal: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  voucherModalHeader: {
    alignItems: "center",
    marginBottom: 20,
  },
  voucherIconBoxLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  voucherStatusBadgeLarge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  voucherStatusTextLarge: {
    fontSize: 13,
    fontWeight: "700",
  },
  voucherModalContent: {
    width: "100%",
    alignItems: "center",
    marginBottom: 20,
  },
  voucherEventName: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
    marginBottom: 16,
  },
  voucherCodeLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  voucherCodeBox: {
    width: "100%",
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    marginBottom: 16,
  },
  voucherCodeText: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 2,
    fontFamily: Platform.OS === "web" ? "monospace" : "monospace",
  },
  voucherInstructions: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 12,
  },
  voucherDate: {
    fontSize: 11,
    color: colors.muted,
    textAlign: "center",
  },
  voucherCloseBtn: {
    width: "100%",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: colors.purple,
  },
  voucherCloseBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },

  // === Linha de botões de ação dos eventos ===
  eventBtnRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  eventBtnAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    minWidth: 80,
  },
  eventBtnCancel: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.danger,
    minWidth: 80,
  },
  eventBtnActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },

  // === Companion Card (inline on event card) ===
  companionCard: {
    borderRadius: 12,
    padding: 12,
    gap: 10,
    backgroundColor: "#EDE9FE",
    borderWidth: 1,
    borderColor: "#DDD6FE",
    marginTop: 2,
  },
  companionCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  companionCardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#5B21B6",
  },
  companionCardBtns: {
    flexDirection: "row",
    gap: 8,
  },
  companionCardBtnPay: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "#7C3AED",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  companionCardBtnWa: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "#25D366",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  companionCardBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },

  // === Modal de Acompanhante ===
  companionModal: {
    margin: 20,
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  companionModalHeader: {
    alignItems: "center",
    gap: 6,
  },
  companionModalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  companionModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  companionModalEvent: {
    fontSize: 13,
    textAlign: "center",
  },
  companionTabs: {
    flexDirection: "row",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  companionTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: "#F8FAFC",
  },
  companionTabActive: {
    backgroundColor: "#EDE9FE",
  },
  companionTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94A3B8",
  },
  companionTabTextActive: {
    color: "#7C3AED",
    fontWeight: "700",
  },
  companionInfoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 10,
    padding: 12,
  },
  companionInfoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  companionFormRow: {
    gap: 6,
  },
  companionLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  companionInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  companionPriceBox: {
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    gap: 6,
  },
  companionPriceLabel: {
    fontSize: 12,
  },
  companionPriceValue: {
    fontSize: 22,
    fontWeight: "800",
  },
  companionPriceHint: {
    fontSize: 11,
    textAlign: "center",
  },
  companionModalBtns: {
    flexDirection: "row",
    gap: 10,
  },
  companionCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  companionCancelBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  companionConfirmBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  companionConfirmBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
});

// Desktop styles
const desktopStyles = StyleSheet.create({
  screen: {
    backgroundColor: "#F8FAFC",
  },
  content: {
    padding: 32,
    paddingTop: 24,
  },

  // Dashboard Container
  dashboardContainer: {
    maxWidth: 1100,
  },

  // Welcome Banner
  welcomeBanner: {
    backgroundColor: "#7C3AED",
    borderRadius: 16,
    padding: 24,
    marginBottom: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    overflow: "hidden",
  },
  welcomeContent: {
    flex: 1,
  },
  welcomeGreeting: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 6,
  },
  welcomeMessage: {
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    lineHeight: 20,
  },
  welcomeDecoration: {
    marginLeft: 20,
  },

  // Main Grid
  mainGrid: {
    flexDirection: "row",
    gap: 24,
    marginBottom: 28,
  },

  // Classes Column
  classesColumn: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    minWidth: 320,
    maxWidth: 480,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 10,
  },
  sectionIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
    flex: 1,
  },
  sectionBadge: {
    backgroundColor: "#F3E8FF",
    color: "#7C3AED",
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  classesContainer: {
    gap: 10,
  },
  classCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#FFC107",
    borderRadius: 14,
    gap: 12,
  },
  classCardFirst: {
    backgroundColor: "#FEF9C3",
    borderWidth: 1,
    borderColor: "#FDE047",
  },
  classCardToday: {
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#86EFAC",
  },
  classIconContainer: {
    width: 70,
    height: 70,
    borderRadius: 14,
    backgroundColor: "#3B2E6E",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  classIconContainerToday: {
    backgroundColor: "#2E7D32",
  },
  classIconContainerTomorrow: {
    backgroundColor: "#1565C0",
  },
  classDanceIcon: {
    width: "100%",
    height: "100%",
  },
  classInfo: {
    flex: 1,
  },
  className: {
    fontSize: 17,
    fontWeight: "900",
    color: "#1E293B",
    marginBottom: 2,
  },
  classTeacher: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
  },
  classSchedule: {
    alignItems: "flex-end",
    gap: 4,
  },
  classDayBadge: {
    backgroundColor: "#3B2E6E",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  classDayBadgeToday: {
    backgroundColor: "#2E7D32",
  },
  classDayBadgeTomorrow: {
    backgroundColor: "#1565C0",
  },
  classDayText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
    textTransform: "uppercase",
  },
  classDayTextHighlight: {
    color: "#fff",
  },
  classTime: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1E293B",
  },
  emptyClassesBox: {
    padding: 32,
    alignItems: "center",
    gap: 8,
  },

  // Announcements Column
  announcementsColumn: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    minWidth: 320,
    maxWidth: 480,
  },
  announcementsList: {
    gap: 10,
  },
  announcementCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    gap: 12,
  },
  announcementCardFirst: {
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  announcementIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  announcementContent: {
    flex: 1,
  },
  announcementTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 2,
  },
  announcementMessage: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 16,
  },

  // Quick Actions
  // Events Section
  eventsSection: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 28,
  },
  eventsContainer: {
    gap: 16,
  },
  eventsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  eventCard: {
    flex: 1,
    minWidth: 300,
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  eventCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 8,
  },
  eventTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  eventTypeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  expandButton: {
    padding: 4,
    borderRadius: 6,
  },
  eventName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 12,
  },
  eventDetails: {
    gap: 8,
    marginBottom: 12,
  },
  eventDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  eventDetailText: {
    fontSize: 13,
    color: "#64748B",
    flex: 1,
  },
  eventDescription: {
    fontSize: 13,
    color: "#64748B",
    lineHeight: 18,
    marginBottom: 12,
  },
  missingInvoiceAlert: {
    flexDirection: "column",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#93C5FD",
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
    gap: 10,
  },
  paymentAlertContent: {
    alignItems: "center",
    width: "100%",
  },
  missingInvoiceTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E40AF",
    marginBottom: 4,
    textAlign: "center",
  },
  missingInvoiceText: {
    fontSize: 12,
    color: "#3B82F6",
    lineHeight: 16,
    textAlign: "center",
    width: "100%",
  },
  generateInvoiceButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3B82F6",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
    alignSelf: "center",
  },
  generateInvoiceButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  paymentAlert: {
    flexDirection: "column",
    alignItems: "center",
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
    gap: 10,
  },
  paymentAlertIcon: {
    marginBottom: 4,
  },
  paymentAlertTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#92400E",
    marginBottom: 4,
    textAlign: "center",
  },
  paymentAlertText: {
    fontSize: 12,
    color: "#D97706",
    lineHeight: 16,
    textAlign: "center",
    width: "100%",
  },
  paymentAlertButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F59E0B",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
    alignSelf: "center",
  },
  paymentAlertButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  voucherGeneratedAlert: {
    flexDirection: "column",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#86EFAC",
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
    gap: 10,
  },
  voucherGeneratedTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#065F46",
    marginBottom: 4,
    textAlign: "center",
  },
  voucherGeneratedText: {
    fontSize: 12,
    color: "#047857",
    lineHeight: 16,
    textAlign: "center",
    width: "100%",
  },
  viewVoucherButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10B981",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
    marginTop: 8,
    alignSelf: "center",
  },
  viewVoucherButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  joinButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
    marginTop: 8,
  },
  joinButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
    alignSelf: "center",
    marginTop: 16,
  },
  cancelButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  emptyEventsBox: {
    alignItems: "center",
    padding: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
  },
  loadingBox: {
    alignItems: "center",
    padding: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: "#94A3B8",
  },

  quickActionsSection: {
    marginBottom: 20,
  },
  quickActionsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 14,
  },
  quickActionsGrid: {
    flexDirection: "row",
    gap: 14,
  },
  quickActionCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 10,
    width: 130,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
    textAlign: "center",
  },
});

// Account Modal styles (deleted/deactivated)
const accountModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  container: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  iconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1E293B",
    textAlign: "center",
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    fontWeight: "600",
    color: "#475569",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 8,
  },
  submessage: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 24,
  },
  actions: {
    width: "100%",
    gap: 12,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  btnPrimary: {
    backgroundColor: colors.purple,
  },
  btnPrimaryText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  btnSecondary: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  btnSecondaryText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#475569",
  },
});


