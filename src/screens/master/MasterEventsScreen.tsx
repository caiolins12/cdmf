import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, ScrollView, TextInput, Text, RefreshControl, Pressable, Modal, ActivityIndicator, Linking } from "react-native";
import { showAlert, showConfirm } from "../../utils/alert";
import { Ionicons, FontAwesome5 } from "@/shims/icons";
import { useFocusEffect } from "@react-navigation/native";
import { doc, onSnapshot } from "../../services/postgresFirestoreCompat";
import { db } from "../../services/firebase";

import CdmfHeader from "../../components/CdmfHeader";
import SectionHeader from "../../components/SectionHeader";
import MasterHeader from "../../components/MasterHeader";
import { colors } from "../../theme/colors";
import { useAuth, Event, EventType, Profile, Class } from "../../contexts/AuthContext";
import { useDesktop } from "../../contexts/DesktopContext";
import { useActivity } from "../../contexts/ActivityContext";
import { formatCurrency, toCents, usePayment } from "../../contexts/PaymentContext";

const EVENT_TYPES: { value: EventType; label: string; icon: string; color: string }[] = [
  { value: "workshop", label: "Workshop", icon: "school", color: "#0891B2" },
  { value: "baile", label: "Baile", icon: "musical-notes", color: "#7C3AED" },
  { value: "aula_especial", label: "Aula Especial", icon: "star", color: "#F59E0B" },
  { value: "evento_social", label: "Evento Social", icon: "people", color: "#10B981" },
  { value: "outro", label: "Outro", icon: "calendar", color: "#64748B" },
];

// Funções de formatação e máscara
const formatDateInput = (text: string): string => {
  // Remove tudo que não é número
  const numbers = text.replace(/\D/g, "");
  
  // Aplica máscara DD/MM/YYYY
  if (numbers.length <= 2) {
    return numbers;
  } else if (numbers.length <= 4) {
    return `${numbers.slice(0, 2)}/${numbers.slice(2)}`;
  } else {
    return `${numbers.slice(0, 2)}/${numbers.slice(2, 4)}/${numbers.slice(4, 8)}`;
  }
};

const formatTimeInput = (text: string): string => {
  // Remove tudo que não é número
  const numbers = text.replace(/\D/g, "");
  
  // Aplica máscara HH:MM
  if (numbers.length <= 2) {
    return numbers;
  } else {
    return `${numbers.slice(0, 2)}:${numbers.slice(2, 4)}`;
  }
};

// Converte DD/MM/YYYY para YYYY-MM-DD
const dateBRToISO = (dateBR: string): string => {
  const cleaned = dateBR.replace(/\D/g, "");
  if (cleaned.length === 8) {
    const day = cleaned.slice(0, 2);
    const month = cleaned.slice(2, 4);
    const year = cleaned.slice(4, 8);
    return `${year}-${month}-${day}`;
  }
  return dateBR;
};

// Converte YYYY-MM-DD para DD/MM/YYYY
const dateISOToBR = (dateISO: string): string => {
  try {
    const [year, month, day] = dateISO.split("-");
    if (year && month && day) {
      return `${day}/${month}/${year}`;
    }
  } catch {}
  return dateISO;
};

// Formata data para exibição completa em PT-BR
const formatDateDisplay = (dateStr: string): string => {
  try {
    const [year, month, day] = dateStr.split("-");
    if (year && month && day) {
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      const dayName = date.toLocaleDateString("pt-BR", { weekday: "long" });
      const monthName = date.toLocaleDateString("pt-BR", { month: "long" });
      return `${dayName}, ${day} de ${monthName} de ${year}`;
    }
  } catch {}
  return formatDate(dateStr);
};

// Formata valor monetário para input (R$ 0,00)
const formatCurrencyInput = (value: string): string => {
  // Remove tudo exceto números
  const numbers = value.replace(/\D/g, "");
  if (!numbers) return "";
  
  // Converte para centavos e depois para reais
  const cents = parseInt(numbers, 10);
  const reais = cents / 100;
  
  // Formata como moeda brasileira
  return reais.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// Extrai valor numérico da string formatada
const parseCurrencyInput = (formatted: string): number => {
  if (!formatted) return 0;
  // Remove pontos de milhar e substitui vírgula por ponto
  const normalized = formatted.replace(/\./g, "").replace(",", ".");
  return parseFloat(normalized) || 0;
};

export default function MasterEventsScreen() {
  const { 
    fetchEvents, 
    createEvent, 
    updateEvent, 
    deleteEvent, 
    confirmStudentToEvent, 
    cancelStudentFromEvent,
    sendEventNotification,
    sendEventInvitations,
    fetchStudents,
    fetchClasses
  } = useAuth();
  const { createInvoice, deleteInvoice, fetchInvoices, fetchAllVouchers, deleteVoucher } = usePayment();
  const { isDesktopMode } = useDesktop();
  const { logActivity } = useActivity();
  
  const [events, setEvents] = useState<Event[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<EventType | "all">("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [inviteFilter, setInviteFilter] = useState<"all" | "gender" | "class" | "custom">("all");
  const [inviteGender, setInviteGender] = useState<"masculino" | "feminino" | "">("");
  const [inviteClassIds, setInviteClassIds] = useState<string[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [sendingInvites, setSendingInvites] = useState(false);
  const [expandedMenuId, setExpandedMenuId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);

  // Validação do botão de enviar convites
  const isInviteButtonDisabled =
    sendingInvites ||
    (inviteFilter === "gender" && !inviteGender) ||
    (inviteFilter === "class" && inviteClassIds.length === 0) ||
    (inviteFilter === "custom" && selectedStudentIds.length === 0);

  // Form states (criar)
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<EventType>("workshop");
  const [newDescription, setNewDescription] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newMaxParticipants, setNewMaxParticipants] = useState("");
  const [newRequiresPayment, setNewRequiresPayment] = useState(false);

  // Form states (editar)
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<EventType>("workshop");
  const [editDescription, setEditDescription] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editMaxParticipants, setEditMaxParticipants] = useState("");
  const [editRequiresPayment, setEditRequiresPayment] = useState(false);
  const [editActive, setEditActive] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [eventsData, studentsData, classesData] = await Promise.all([
        fetchEvents(),
        fetchStudents(),
        fetchClasses(),
      ]);
      setEvents(eventsData);
      setStudents(studentsData.filter(s => s.enrollmentStatus !== "inativo" && !s.isOffline));
      setClasses(classesData);
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
    } finally {
      setLoading(false);
    }
  }, [fetchEvents, fetchStudents, fetchClasses]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const filteredEvents = events.filter((e) => {
    const matchesQuery = e.name.toLowerCase().includes(query.toLowerCase()) ||
      e.description?.toLowerCase().includes(query.toLowerCase());
    const matchesType = typeFilter === "all" || e.type === typeFilter;
    return matchesQuery && matchesType;
  });

  const handleCreateEvent = async () => {
    try {
      console.log("[Event] ===== INÍCIO DA CRIAÇÃO ======");
      console.log("[Event] Iniciando criação de evento...");
      console.log("[Event] Dados atuais:", { 
        newName, 
        newDate, 
        newType, 
        newRequiresPayment,
        newPrice,
        creating 
      });
      
      if (!newName.trim()) {
        console.log("[Event] ERRO: Nome vazio");
        showAlert("Atenção", "Digite o nome do evento");
        return;
      }
      if (!newDate.trim()) {
        console.log("[Event] ERRO: Data vazia");
        showAlert("Atenção", "Selecione a data do evento");
        return;
      }

      // Valida data
      const dateISO = dateBRToISO(newDate);
      console.log("[Event] Data formatada:", dateISO, "de", newDate);
      
      if (dateISO.length !== 10 || !dateISO.match(/^\d{4}-\d{2}-\d{2}$/)) {
        console.log("[Event] ERRO: Data inválida");
        showAlert("Atenção", `Data inválida. Use o formato DD/MM/AAAA. Recebido: ${newDate} (${dateISO})`);
        return;
      }

      // Valida horário se preenchido
      if (newTime.trim() && !newTime.match(/^\d{2}:\d{2}$/)) {
        console.log("[Event] ERRO: Horário inválido");
        showAlert("Atenção", "Horário inválido. Use o formato HH:MM");
        return;
      }

      // Valida preço se evento requer pagamento
      if (newRequiresPayment && (!newPrice || parseCurrencyInput(newPrice) <= 0)) {
        console.log("[Event] ERRO: Preço inválido para evento pago");
        showAlert("Atenção", "Eventos pagos devem ter um preço válido");
        return;
      }

      console.log("[Event] Validações passadas, iniciando criação...");
      setCreating(true);
      
      console.log("[Event] Dados do evento:", { newName, newType, newDate, dateISO, newPrice, newRequiresPayment });
      
      const priceInCents = newPrice ? toCents(parseCurrencyInput(newPrice)) : undefined;
      console.log("[Event] Preço convertido:", priceInCents);
      
      // Cria objeto base sem campos undefined (Firebase não aceita undefined)
      const eventData: any = {
        name: newName.trim(),
        type: newType,
        date: dateISO,
        requiresPayment: newRequiresPayment,
        active: true,
      };
      
      // Adiciona campos opcionais apenas se tiverem valores
      if (newDescription.trim()) {
        eventData.description = newDescription.trim();
      }
      if (newTime.trim()) {
        eventData.time = newTime.trim();
      }
      if (newLocation.trim()) {
        eventData.location = newLocation.trim();
      }
      if (priceInCents !== undefined) {
        eventData.price = priceInCents;
      }
      if (newMaxParticipants && newMaxParticipants.trim()) {
        const maxParticipants = parseInt(newMaxParticipants, 10);
        if (!isNaN(maxParticipants) && maxParticipants > 0) {
          eventData.maxParticipants = maxParticipants;
        }
      }

      console.log("[Event] Criando evento no Firebase...");
      const eventId = await createEvent(eventData);
      console.log("[Event] Evento criado com ID:", eventId);

      // Optimistic: add new event immediately
      const newEvent: Event = { ...eventData, id: eventId, createdAt: Date.now(), confirmedStudentIds: [], waitlistStudentIds: [] } as Event;
      setEvents(prev => [newEvent, ...prev]);

      setShowCreateModal(false);
      resetCreateForm();
      showAlert(
        "Sucesso",
        "Evento criado com sucesso! Use o botão 'Convites' para enviar convites aos alunos."
      );

      // Fire-and-forget
      logActivity({
        type: "event_created",
        title: newName.trim(),
        description: `Novo evento ${EVENT_TYPES.find(t => t.value === newType)?.label} criado`,
      }).catch(() => {});
      loadData();
    } catch (e: any) {
      console.error("[Event] ===== ERRO NA CRIAÇÃO ======");
      console.error("[Event] Erro ao criar evento:", e);
      console.error("[Event] Stack:", e.stack);
      showAlert("Erro", e.message || "Não foi possível criar o evento");
    } finally {
      setCreating(false);
      console.log("[Event] ===== FIM DA CRIAÇÃO ======");
    }
  };

  const resetCreateForm = () => {
    setNewName("");
    setNewType("workshop");
    setNewDescription("");
    setNewDate("");
    setNewTime("");
    setNewLocation("");
    setNewPrice("");
    setNewMaxParticipants("");
    setNewRequiresPayment(false);
  };

  const handleEditEvent = (event: Event) => {
    setSelectedEvent(event);
    setEditName(event.name);
    setEditType(event.type);
    setEditDescription(event.description || "");
    setEditDate(dateISOToBR(event.date));
    setEditTime(event.time || "");
    setEditLocation(event.location || "");
    setEditPrice(event.price ? formatCurrencyInput((event.price / 100).toString()) : "");
    setEditMaxParticipants(event.maxParticipants?.toString() || "");
    setEditRequiresPayment(event.requiresPayment || false);
    setEditActive(event.active !== false);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedEvent) return;
    
    if (!editName.trim()) {
      showAlert("Atenção", "Digite o nome do evento");
      return;
    }
    if (!editDate.trim()) {
      showAlert("Atenção", "Selecione a data do evento");
      return;
    }

    // Valida data
    const dateISO = dateBRToISO(editDate);
    if (dateISO.length !== 10 || !dateISO.match(/^\d{4}-\d{2}-\d{2}$/)) {
      showAlert("Atenção", "Data inválida. Use o formato DD/MM/AAAA");
      return;
    }

    // Valida horário se preenchido
    if (editTime.trim() && !editTime.match(/^\d{2}:\d{2}$/)) {
      showAlert("Atenção", "Horário inválido. Use o formato HH:MM");
      return;
    }

    // Valida preço se evento requer pagamento
    if (editRequiresPayment && (!editPrice || parseCurrencyInput(editPrice) <= 0)) {
      showAlert("Atenção", "Eventos pagos devem ter um preço válido");
      return;
    }

    setEditing(true);
    try {
      const priceInCents = editPrice ? toCents(parseCurrencyInput(editPrice)) : undefined;
      
      // Cria objeto base sem campos undefined (Firebase não aceita undefined)
      const updateData: any = {
        name: editName.trim(),
        type: editType,
        date: dateISO,
        requiresPayment: editRequiresPayment,
        active: editActive,
      };
      
      // Adiciona campos opcionais apenas se tiverem valores
      if (editDescription.trim()) {
        updateData.description = editDescription.trim();
      }
      if (editTime.trim()) {
        updateData.time = editTime.trim();
      }
      if (editLocation.trim()) {
        updateData.location = editLocation.trim();
      }
      if (priceInCents !== undefined) {
        updateData.price = priceInCents;
      }
      if (editMaxParticipants && editMaxParticipants.trim()) {
        const maxParticipants = parseInt(editMaxParticipants, 10);
        if (!isNaN(maxParticipants) && maxParticipants > 0) {
          updateData.maxParticipants = maxParticipants;
        }
      }

      await updateEvent(selectedEvent.id, updateData);

      // Optimistic update
      setEvents(prev => prev.map(e =>
        e.id === selectedEvent.id ? { ...e, ...updateData } : e
      ));

      setShowEditModal(false);
      showAlert("Sucesso", "Evento atualizado com sucesso!");

      // Fire-and-forget
      logActivity({
        type: "event_updated",
        title: editName.trim(),
        description: `Evento ${EVENT_TYPES.find(t => t.value === editType)?.label} atualizado`,
      }).catch(() => {});
      loadData();
    } catch (e: any) {
      showAlert("Erro", e.message || "Não foi possível atualizar o evento");
    } finally {
      setEditing(false);
    }
  };

  const handleSendInvitations = async (event: Event) => {
    console.log("[Event] Abrindo modal de convites para evento:", event.name);
    setSelectedEvent(event);
    setInviteFilter("all");
    setInviteGender("");
    setInviteClassIds([]);
    setSelectedStudentIds([]);
    setShowInviteModal(true);
  };

  const handleWhatsAppInvite = (event: Event) => {
    const eventEmojis: Record<string, string> = {
      baile: "💃",
      workshop: "🎓",
      show: "🎤",
      festa: "🎉",
      aula: "🕺",
    };
    const emoji = eventEmojis[event.type] || "🎉";
    const message =
      `Oi, gostaria de convidar você para o ${event.name}. ${emoji}\n` +
      `Basta acessar o link e confirmar sua participação:\n` +
      `https://cdmf.vercel.app/`;
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    Linking.openURL(url).catch(() =>
      showAlert("Erro", "Não foi possível abrir o WhatsApp. Verifique se ele está instalado.")
    );
  };

  const handleConfirmSendInvites = async () => {
    console.log("[Event] ===== BOTÃO CLICADO =====");
    console.log("[Event] Estado atual:", {
      inviteFilter,
      inviteGender,
      inviteClassIds: inviteClassIds.length,
      selectedStudentIds: selectedStudentIds.length,
      selectedEvent: selectedEvent?.name,
      sendingInvites
    });

    if (!selectedEvent) {
      console.error("[Event] Nenhum evento selecionado");
      return;
    }

    console.log("[Event] Enviando convites com filtro:", inviteFilter);
    setSendingInvites(true);
    try {
      let filters: { studentIds?: string[]; gender?: "masculino" | "feminino"; classIds?: string[] } | undefined;

      if (inviteFilter === "custom" && selectedStudentIds.length > 0) {
        filters = { studentIds: selectedStudentIds };
        console.log("[Event] Filtro customizado:", selectedStudentIds.length, "alunos");
      } else if (inviteFilter === "gender" && inviteGender) {
        filters = { gender: inviteGender };
        console.log("[Event] Filtro por gênero:", inviteGender);
      } else if (inviteFilter === "class" && inviteClassIds.length > 0) {
        filters = { classIds: inviteClassIds };
        console.log("[Event] Filtro por turmas:", inviteClassIds);
      } else {
        console.log("[Event] Enviando para todos os alunos ativos");
      }

      console.log("[Event] Chamando sendEventInvitations...");
      const count = await sendEventInvitations(selectedEvent.id, filters);
      console.log("[Event] Convites enviados:", count);
      
      showAlert("Sucesso", `${count} convite(s) enviado(s) com sucesso!`);
      setShowInviteModal(false);
      logActivity({
        type: "notification_sent",
        title: "Convites enviados",
        description: `${count} convite(s) enviado(s) para o evento "${selectedEvent.name}"`,
      }).catch(() => {});
    } catch (e: any) {
      console.error("[Event] Erro ao enviar convites:", e);
      showAlert("Erro", e.message || "Não foi possível enviar os convites");
    } finally {
      setSendingInvites(false);
    }
  };

  const handleDeleteEvent = (event: Event) => {
    showConfirm(
      "Excluir Evento",
      `Deseja excluir o evento "${event.name}"?\n\nTodas as faturas de ingressos relacionadas também serão excluídas.\nEsta ação não pode ser desfeita.`,
      async () => {
        try {
          const allInvoices = await fetchInvoices();
          const eventInvoices = allInvoices.filter(inv =>
            inv.description?.includes(`Ingresso: ${event.name}`)
          );
          for (const invoice of eventInvoices) {
            try {
              await deleteInvoice(invoice.id);
            } catch (e) {
              console.warn(`Erro ao deletar fatura ${invoice.id}:`, e);
            }
          }
          await deleteEvent(event.id);
          setEvents(prev => prev.filter(e => e.id !== event.id));
          showAlert("Sucesso", "Evento excluído com sucesso!");
          loadData();
        } catch (e: any) {
          showAlert("Erro", e.message || "Não foi possível excluir o evento");
        }
      }
    );
  };

  const handleCancelEvent = (event: Event) => {
    if (!event.active) {
      showAlert("Atenção", "Este evento já está inativo.");
      return;
    }
    showConfirm(
      "Cancelar Evento",
      `Deseja cancelar o evento "${event.name}"?\n\nTodos os vouchers/ingressos gerados serão removidos e as faturas pendentes serão excluídas.\nOs alunos confirmados serão notificados.`,
      async () => {
        try {
          // 1. Deactivate event
          await updateEvent(event.id, { active: false });

          // 2. Delete all vouchers for this event
          const allVouchers = await fetchAllVouchers();
          const eventVouchers = allVouchers.filter(
            (v) => (v as any).eventId === event.id || v.eventName === event.name
          );
          for (const voucher of eventVouchers) {
            try {
              await deleteVoucher(voucher.id);
            } catch (e) {
              console.warn(`Erro ao deletar voucher ${voucher.id}:`, e);
            }
          }

          // 3. Delete pending invoices for this event
          const allInvoices = await fetchInvoices();
          const pendingInvoices = allInvoices.filter(
            (inv) =>
              inv.description?.includes(`Ingresso: ${event.name}`) &&
              (inv.status === "pending" || inv.status === "overdue")
          );
          for (const invoice of pendingInvoices) {
            try {
              await deleteInvoice(invoice.id);
            } catch (e) {
              console.warn(`Erro ao deletar fatura ${invoice.id}:`, e);
            }
          }

          // 4. Notify confirmed students
          try {
            await sendEventNotification(event.id, "cancellation");
          } catch (e) {
            console.warn("Erro ao notificar alunos sobre cancelamento:", e);
          }

          // 5. Optimistic update
          setEvents((prev) =>
            prev.map((e) => (e.id === event.id ? { ...e, active: false } : e))
          );

          showAlert(
            "Evento Cancelado",
            `O evento "${event.name}" foi cancelado.\n${eventVouchers.length} voucher(s) removido(s).\n${pendingInvoices.length} fatura(s) pendente(s) excluída(s).`
          );

          logActivity({
            type: "event_updated",
            title: "Evento Cancelado",
            description: `Evento "${event.name}" cancelado. ${eventVouchers.length} voucher(s) removido(s).`,
          }).catch(() => {});

          loadData();
        } catch (e: any) {
          showAlert("Erro", e.message || "Não foi possível cancelar o evento");
        }
      }
    );
  };

  const handleViewParticipants = (event: Event) => {
    setSelectedEvent(event);
    setShowParticipantsModal(true);
  };

  // Listener em tempo real para atualizar o evento selecionado quando o modal estiver aberto
  useEffect(() => {
    if (!showParticipantsModal || !selectedEvent?.id) return;

    const eventRef = doc(db, "events", selectedEvent.id);
    const unsubscribe = onSnapshot(
      eventRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const updatedEvent = snapshot.data() as Event;
          setSelectedEvent(updatedEvent);
          // Também atualiza na lista de eventos
          setEvents(prev => prev.map(e => e.id === updatedEvent.id ? updatedEvent : e));
        }
      },
      (error) => {
        console.error("Erro ao escutar mudanças no evento:", error);
      }
    );

    return () => unsubscribe();
  }, [showParticipantsModal, selectedEvent?.id]);

  const handleConfirmStudent = async (studentId: string) => {
    if (!selectedEvent) return;

    try {
      await confirmStudentToEvent(selectedEvent.id, studentId);
      // Optimistic: add student to confirmedStudentIds
      const updatedEvent = {
        ...selectedEvent,
        confirmedStudentIds: [...(selectedEvent.confirmedStudentIds || []), studentId],
      };
      setSelectedEvent(updatedEvent);
      setEvents(prev => prev.map(e => e.id === selectedEvent.id ? updatedEvent : e));
      loadData();
    } catch (e: any) {
      showAlert("Erro", e.message || "Não foi possível confirmar o aluno");
    }
  };

  const handleCancelStudent = async (studentId: string) => {
    if (!selectedEvent) return;

    try {
      await cancelStudentFromEvent(selectedEvent.id, studentId);
      // Optimistic: remove student from confirmedStudentIds
      const updatedEvent = {
        ...selectedEvent,
        confirmedStudentIds: (selectedEvent.confirmedStudentIds || []).filter(id => id !== studentId),
      };
      setSelectedEvent(updatedEvent);
      setEvents(prev => prev.map(e => e.id === selectedEvent.id ? updatedEvent : e));
      loadData();
    } catch (e: any) {
      showAlert("Erro", e.message || "Não foi possível cancelar a confirmação");
    }
  };

  const handleSendNotification = async () => {
    if (!selectedEvent) return;
    
    try {
      // Reenvia os convites para que apareçam novamente para os alunos
      // Busca todos os alunos ativos (confirmados e não confirmados) para reenviar convites
      const allStudents = await fetchStudents();
      const eligibleStudents = allStudents
        .filter(s => s.role === "student" && s.active !== false && !s.isOffline && s.enrollmentStatus !== "inativo");
      
      // Reenvia convites para todos os alunos elegíveis
      // Isso fará com que o modal apareça novamente para eles, independente do estado atual
      const count = await sendEventInvitations(selectedEvent.id, { 
        studentIds: eligibleStudents.map(s => s.uid) 
      });
      
      showAlert(
        "✅ Convites Reenviados", 
        `Os convites foram reenviados para ${count} aluno(s)! O modal de convite aparecerá novamente para eles quando acessarem a aplicação.`
      );
      setShowNotificationModal(false);
    } catch (e: any) {
      showAlert("Erro", e.message || "Não foi possível enviar as notificações");
    }
  };

  const getEventTypeInfo = (type: EventType | undefined) => {
    if (!type) return EVENT_TYPES[0];
    return EVENT_TYPES.find(t => t.value === type) || EVENT_TYPES[0];
  };

  const formatDate = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split("-");
      if (year && month && day) {
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        const dayName = date.toLocaleDateString("pt-BR", { weekday: "short" });
        const monthName = date.toLocaleDateString("pt-BR", { month: "short" });
        return `${dayName}, ${day} de ${monthName} de ${year}`;
      }
    } catch {}
    return dateISOToBR(dateStr);
  };

  const getConfirmedStudents = (event: Event): Profile[] => {
    return students.filter(s => event.confirmedStudentIds.includes(s.uid));
  };

  const getWaitlistStudents = (event: Event): Profile[] => {
    return students.filter(s => event.waitlistStudentIds.includes(s.uid));
  };

  const getAvailableStudents = (event: Event): Profile[] => {
    const confirmedAndWaitlist = [...event.confirmedStudentIds, ...event.waitlistStudentIds];
    return students.filter(s => !confirmedAndWaitlist.includes(s.uid));
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={colors.purple} />
        <Text style={styles.loadingText}>Carregando eventos...</Text>
      </View>
    );
  }

  return (
    <Pressable 
      style={[styles.screen, isDesktopMode && desktopStyles.screen]}
      onPress={() => setExpandedMenuId(null)}
      activeOpacity={1}
    >
      {!isDesktopMode && <MasterHeader />}
      {!isDesktopMode && <SectionHeader title="Gestão de Eventos" />}

      {/* Modal: Criar Evento */}
      <Modal visible={showCreateModal} transparent animationType="fade">
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => !creating && setShowCreateModal(false)}
          activeOpacity={1}
        >
          <Pressable
            style={styles.createModal}
            onPress={(e) => {
              e.stopPropagation();
            }}
            activeOpacity={1}
          >
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Novo Evento</Text>
                <Text style={styles.modalSubtitle}>Preencha os dados abaixo e revise as ações no rodapé.</Text>
              </View>

              <ScrollView
                style={styles.modalBodyScroll}
                contentContainerStyle={styles.modalScrollContent}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Nome do Evento *</Text>
                  <TextInput
                    id="new-event-name"
                    name="new-event-name"
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="Ex: Workshop de Salsa"
                    placeholderTextColor="#999"
                    style={styles.modalInput}
                    editable={!creating}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Tipo de Evento *</Text>
                  <View style={styles.typeRow}>
                    {EVENT_TYPES.map(type => (
                      <Pressable
                        key={type.value}
                        style={[
                          styles.typeChip,
                          newType === type.value && { backgroundColor: type.color, borderColor: type.color },
                        ]}
                        onPress={() => setNewType(type.value)}
                      >
                        <Ionicons
                          name={type.icon as any}
                          size={16}
                          color={newType === type.value ? "#fff" : type.color}
                        />
                        <Text style={[
                          styles.typeChipText,
                          newType === type.value && styles.typeChipTextSelected,
                        ]}>
                          {type.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Row: Data + Horário */}
                <View style={styles.modalRow}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Data *</Text>
                    <TextInput
                      id="new-event-date"
                      name="new-event-date"
                      value={newDate}
                      onChangeText={(text) => {
                        const formatted = formatDateInput(text);
                        if (formatted.length <= 10) setNewDate(formatted);
                      }}
                      placeholder="DD/MM/AAAA"
                      placeholderTextColor="#999"
                      style={styles.modalInput}
                      editable={!creating}
                      keyboardType="number-pad"
                      maxLength={10}
                    />
                  </View>
                  <View style={[styles.inputGroup, { width: 110 }]}>
                    <Text style={styles.inputLabel}>Horário</Text>
                    <TextInput
                      id="new-event-time"
                      name="new-event-time"
                      value={newTime}
                      onChangeText={(text) => {
                        const formatted = formatTimeInput(text);
                        if (formatted.length <= 5) setNewTime(formatted);
                      }}
                      placeholder="HH:MM"
                      placeholderTextColor="#999"
                      style={styles.modalInput}
                      editable={!creating}
                      keyboardType="number-pad"
                      maxLength={5}
                    />
                  </View>
                </View>

                {/* Row: Local + Máx. Participantes */}
                <View style={styles.modalRow}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Local</Text>
                    <TextInput
                      id="new-event-location"
                      name="new-event-location"
                      value={newLocation}
                      onChangeText={setNewLocation}
                      placeholder="Ex: Salão Principal"
                      placeholderTextColor="#999"
                      style={styles.modalInput}
                      editable={!creating}
                    />
                  </View>
                  <View style={[styles.inputGroup, { width: 110 }]}>
                    <Text style={styles.inputLabel}>Máx. Vagas</Text>
                    <TextInput
                      id="new-event-max-participants"
                      name="new-event-max-participants"
                      value={newMaxParticipants}
                      onChangeText={setNewMaxParticipants}
                      placeholder="Ex: 50"
                      placeholderTextColor="#999"
                      keyboardType="number-pad"
                      style={styles.modalInput}
                      editable={!creating}
                    />
                  </View>
                </View>

                {/* Row: Preço + Requer Pagamento */}
                <View style={styles.modalRow}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Preço</Text>
                    <View style={styles.priceInputContainer}>
                      <Text style={styles.currencySymbol}>R$</Text>
                      <TextInput
                        id="new-event-price"
                        name="new-event-price"
                        value={newPrice}
                        onChangeText={(text) => setNewPrice(formatCurrencyInput(text))}
                        placeholder="0,00"
                        placeholderTextColor="#999"
                        keyboardType="number-pad"
                        style={styles.priceInput}
                        editable={!creating}
                      />
                    </View>
                  </View>
                  <View style={[styles.inputGroup, { justifyContent: "flex-end", paddingBottom: 2 }]}>
                    <Pressable
                      style={styles.checkboxRow}
                      onPress={() => setNewRequiresPayment(!newRequiresPayment)}
                    >
                      <View style={[styles.checkbox, newRequiresPayment && styles.checkboxChecked]}>
                        {newRequiresPayment && <Ionicons name="checkmark" size={16} color="#fff" />}
                      </View>
                      <Text style={styles.checkboxLabel}>Requer pagamento</Text>
                    </Pressable>
                  </View>
                </View>
                {newRequiresPayment && !newPrice && (
                  <Text style={[styles.priceWarning, { marginTop: -10, marginBottom: 8 }]}>⚠️ Eventos pagos precisam ter um preço definido</Text>
                )}

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Descrição (opcional)</Text>
                  <TextInput
                    id="new-event-description"
                    name="new-event-description"
                    value={newDescription}
                    onChangeText={setNewDescription}
                    placeholder="Detalhes sobre o evento..."
                    placeholderTextColor="#999"
                    style={[styles.modalInput, styles.modalTextArea]}
                    multiline
                    editable={!creating}
                  />
                </View>
              </ScrollView>

              <View style={styles.modalActions}>
                <Pressable
                  style={styles.cancelBtn}
                  onPress={() => { setShowCreateModal(false); resetCreateForm(); }}
                  disabled={creating}
                >
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </Pressable>

                {creating ? (
                  <View style={styles.createBtn}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                ) : (
                  <Pressable 
                    style={styles.createBtn} 
                    onPress={() => {
                      console.log("[Event] ========== BOTÃO CRIAR EVENTO CLICADO ==========");
                      console.log("[Event] Estado atual:", { creating, newName, newDate });
                      handleCreateEvent();
                    }}
                    disabled={creating}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.createBtnText}>Criar Evento</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: Editar Evento */}
      <Modal visible={showEditModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => !editing && setShowEditModal(false)}>
          <View style={styles.createModal}>
            <Pressable onPress={(e) => e.stopPropagation()} style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Editar Evento</Text>
                <Text style={styles.modalSubtitle}>Atualize os dados e revise o estado do evento antes de salvar.</Text>
              </View>

              <ScrollView 
                style={styles.modalBodyScroll}
                contentContainerStyle={styles.modalScrollContent}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Nome do Evento *</Text>
                  <TextInput
                    id="edit-event-name"
                    name="edit-event-name"
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Ex: Workshop de Salsa"
                    placeholderTextColor="#999"
                    style={styles.modalInput}
                    editable={!editing}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Tipo de Evento *</Text>
                  <View style={styles.typeRow}>
                    {EVENT_TYPES.map(type => (
                      <Pressable
                        key={type.value}
                        style={[
                          styles.typeChip,
                          editType === type.value && { backgroundColor: type.color, borderColor: type.color },
                        ]}
                        onPress={() => setEditType(type.value)}
                      >
                        <Ionicons 
                          name={type.icon as any} 
                          size={16} 
                          color={editType === type.value ? "#fff" : type.color} 
                        />
                        <Text style={[
                          styles.typeChipText,
                          editType === type.value && styles.typeChipTextSelected,
                        ]}>
                          {type.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Descrição (opcional)</Text>
                  <TextInput
                    id="edit-event-description"
                    name="edit-event-description"
                    value={editDescription}
                    onChangeText={setEditDescription}
                    placeholder="Detalhes sobre o evento..."
                    placeholderTextColor="#999"
                    style={[styles.modalInput, styles.modalTextArea]}
                    multiline
                    editable={!editing}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Data *</Text>
                  <TextInput
                    id="edit-event-date"
                    name="edit-event-date"
                    value={editDate}
                    onChangeText={(text) => {
                      const formatted = formatDateInput(text);
                      if (formatted.length <= 10) {
                        setEditDate(formatted);
                      }
                    }}
                    placeholder="DD/MM/AAAA (ex: 15/03/2025)"
                    placeholderTextColor="#999"
                    style={styles.modalInput}
                    editable={!editing}
                    keyboardType="number-pad"
                    maxLength={10}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Horário (opcional)</Text>
                  <TextInput
                    id="edit-event-time"
                    name="edit-event-time"
                    value={editTime}
                    onChangeText={(text) => {
                      const formatted = formatTimeInput(text);
                      if (formatted.length <= 5) {
                        setEditTime(formatted);
                      }
                    }}
                    placeholder="HH:MM (ex: 19:00)"
                    placeholderTextColor="#999"
                    style={styles.modalInput}
                    editable={!editing}
                    keyboardType="number-pad"
                    maxLength={5}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Local (opcional)</Text>
                  <TextInput
                    id="edit-event-location"
                    name="edit-event-location"
                    value={editLocation}
                    onChangeText={setEditLocation}
                    placeholder="Ex: Salão Principal"
                    placeholderTextColor="#999"
                    style={styles.modalInput}
                    editable={!editing}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Preço (opcional)</Text>
                  <View style={styles.priceInputContainer}>
                    <Text style={styles.currencySymbol}>R$</Text>
                    <TextInput
                      id="edit-event-price"
                      name="edit-event-price"
                      value={editPrice}
                      onChangeText={(text) => {
                        const formatted = formatCurrencyInput(text);
                        setEditPrice(formatted);
                      }}
                      placeholder="0,00"
                      placeholderTextColor="#999"
                      keyboardType="number-pad"
                      style={styles.priceInput}
                      editable={!editing}
                    />
                  </View>
                  {editRequiresPayment && !editPrice && (
                    <Text style={styles.priceWarning}>⚠️ Eventos pagos precisam ter um preço definido</Text>
                  )}
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Máximo de Participantes (opcional)</Text>
                  <TextInput
                    id="edit-event-max-participants"
                    name="edit-event-max-participants"
                    value={editMaxParticipants}
                    onChangeText={setEditMaxParticipants}
                    placeholder="Ex: 50"
                    placeholderTextColor="#999"
                    keyboardType="number-pad"
                    style={styles.modalInput}
                    editable={!editing}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Pressable
                    style={styles.checkboxRow}
                    onPress={() => setEditRequiresPayment(!editRequiresPayment)}
                  >
                    <View style={[styles.checkbox, editRequiresPayment && styles.checkboxChecked]}>
                      {editRequiresPayment && <Ionicons name="checkmark" size={16} color="#fff" />}
                    </View>
                    <Text style={styles.checkboxLabel}>Requer pagamento</Text>
                  </Pressable>
                </View>

                <View style={styles.inputGroup}>
                  <Pressable
                    style={styles.checkboxRow}
                    onPress={() => setEditActive(!editActive)}
                  >
                    <View style={[styles.checkbox, editActive && styles.checkboxChecked]}>
                      {editActive && <Ionicons name="checkmark" size={16} color="#fff" />}
                    </View>
                    <Text style={styles.checkboxLabel}>Evento ativo</Text>
                  </Pressable>
                </View>
              </ScrollView>

              <View style={styles.modalActions}>
                <Pressable
                  style={styles.cancelBtn}
                  onPress={() => setShowEditModal(false)}
                  disabled={editing}
                >
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </Pressable>

                {editing ? (
                  <View style={styles.createBtn}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                ) : (
                  <Pressable style={styles.createBtn} onPress={handleSaveEdit}>
                    <Text style={styles.createBtnText}>Salvar</Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Modal: Participantes */}
      <Modal visible={showParticipantsModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowParticipantsModal(false)}>
          <Pressable style={styles.participantsModal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Participantes</Text>
              <Text style={styles.modalSubtitle}>{selectedEvent?.name}</Text>
            </View>

            <ScrollView style={styles.participantsList}>
              {/* Confirmados */}
              <View style={styles.participantsSection}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.green} />
                  <Text style={styles.sectionTitle}>
                    Confirmados ({selectedEvent?.confirmedStudentIds.length || 0})
                    {selectedEvent?.maxParticipants && ` / ${selectedEvent.maxParticipants}`}
                  </Text>
                </View>
                {selectedEvent && getConfirmedStudents(selectedEvent).length === 0 ? (
                  <Text style={styles.emptyText}>Nenhum participante confirmado</Text>
                ) : (
                  selectedEvent && getConfirmedStudents(selectedEvent).map(student => (
                    <View key={student.uid} style={styles.participantRow}>
                      <View style={styles.participantInfo}>
                        <Text style={styles.participantName}>{student.name}</Text>
                        <Text style={styles.participantEmail}>{student.email}</Text>
                      </View>
                      <Pressable
                        style={styles.removeBtn}
                        onPress={() => handleCancelStudent(student.uid)}
                      >
                        <Ionicons name="close-circle" size={20} color={colors.danger} />
                      </Pressable>
                    </View>
                  ))
                )}
              </View>

              {/* Lista de Espera */}
              {selectedEvent && selectedEvent.waitlistStudentIds.length > 0 && (
                <View style={styles.participantsSection}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="time" size={18} color="#F59E0B" />
                    <Text style={styles.sectionTitle}>
                      Lista de Espera ({selectedEvent.waitlistStudentIds.length})
                    </Text>
                  </View>
                  {getWaitlistStudents(selectedEvent).map(student => (
                    <View key={student.uid} style={styles.participantRow}>
                      <View style={styles.participantInfo}>
                        <Text style={styles.participantName}>{student.name}</Text>
                        <Text style={styles.participantEmail}>{student.email}</Text>
                      </View>
                      <Pressable
                        style={styles.confirmBtn}
                        onPress={() => handleConfirmStudent(student.uid)}
                      >
                        <Ionicons name="checkmark-circle" size={20} color={colors.green} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}

              {/* Alunos Disponíveis */}
              {selectedEvent && getAvailableStudents(selectedEvent).length > 0 && (
                <View style={styles.participantsSection}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="person-add" size={18} color={colors.purple} />
                    <Text style={styles.sectionTitle}>
                      Adicionar Participante ({getAvailableStudents(selectedEvent).length} disponíveis)
                    </Text>
                  </View>
                  {getAvailableStudents(selectedEvent).map(student => (
                    <Pressable
                      key={student.uid}
                      style={styles.participantRow}
                      onPress={() => handleConfirmStudent(student.uid)}
                    >
                      <View style={styles.participantInfo}>
                        <Text style={styles.participantName}>{student.name}</Text>
                        <Text style={styles.participantEmail}>{student.email}</Text>
                      </View>
                      <Ionicons name="add-circle" size={20} color={colors.purple} />
                    </Pressable>
                  ))}
                </View>
              )}
            </ScrollView>

            <Pressable style={styles.doneBtn} onPress={() => setShowParticipantsModal(false)}>
              <Text style={styles.doneBtnText}>Fechar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: Enviar Convites */}
      <Modal visible={showInviteModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => !sendingInvites && setShowInviteModal(false)}>
          <Pressable style={styles.createModal} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Enviar Convites</Text>
            <Text style={styles.modalSubtitle}>{selectedEvent?.name}</Text>

            <ScrollView style={{ maxHeight: 500 }}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Selecionar Destinatários</Text>
                
                <Pressable
                  style={[styles.filterOption, inviteFilter === "all" && styles.filterOptionActive]}
                  onPress={() => {
                    setInviteFilter("all");
                    setInviteGender("");
                    setInviteClassIds([]);
                    setSelectedStudentIds([]);
                  }}
                >
                  <Ionicons name="people" size={20} color={inviteFilter === "all" ? colors.purple : colors.muted} />
                  <Text style={[styles.filterOptionText, inviteFilter === "all" && styles.filterOptionTextActive]}>
                    Todos os alunos ativos
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.filterOption, inviteFilter === "gender" && styles.filterOptionActive]}
                  onPress={() => {
                    setInviteFilter("gender");
                    setInviteClassIds([]);
                    setSelectedStudentIds([]);
                  }}
                >
                  <Ionicons name="person" size={20} color={inviteFilter === "gender" ? colors.purple : colors.muted} />
                  <Text style={[styles.filterOptionText, inviteFilter === "gender" && styles.filterOptionTextActive]}>
                    Por gênero
                  </Text>
                </Pressable>

                {inviteFilter === "gender" && (
                  <View style={styles.genderOptions}>
                    <Pressable
                      style={[styles.genderOption, inviteGender === "feminino" && styles.genderOptionActive]}
                      onPress={() => setInviteGender("feminino")}
                    >
                      <Ionicons name="female" size={18} color={inviteGender === "feminino" ? "#fff" : colors.purple} />
                      <Text style={[styles.genderOptionText, inviteGender === "feminino" && styles.genderOptionTextActive]}>
                        Apenas feminino
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.genderOption, inviteGender === "masculino" && styles.genderOptionActive]}
                      onPress={() => setInviteGender("masculino")}
                    >
                      <Ionicons name="male" size={18} color={inviteGender === "masculino" ? "#fff" : colors.purple} />
                      <Text style={[styles.genderOptionText, inviteGender === "masculino" && styles.genderOptionTextActive]}>
                        Apenas masculino
                      </Text>
                    </Pressable>
                  </View>
                )}

                <Pressable
                  style={[styles.filterOption, inviteFilter === "class" && styles.filterOptionActive]}
                  onPress={() => {
                    setInviteFilter("class");
                    setInviteGender("");
                    setSelectedStudentIds([]);
                  }}
                >
                  <Ionicons name="school" size={20} color={inviteFilter === "class" ? colors.purple : colors.muted} />
                  <Text style={[styles.filterOptionText, inviteFilter === "class" && styles.filterOptionTextActive]}>
                    Por turma
                  </Text>
                </Pressable>

                {inviteFilter === "class" && (
                  <View style={styles.classOptions}>
                    {classes.filter(c => c.active).map(classItem => (
                      <Pressable
                        key={classItem.id}
                        style={[styles.classOption, inviteClassIds.includes(classItem.id) && styles.classOptionActive]}
                        onPress={() => {
                          if (inviteClassIds.includes(classItem.id)) {
                            setInviteClassIds(inviteClassIds.filter(id => id !== classItem.id));
                          } else {
                            setInviteClassIds([...inviteClassIds, classItem.id]);
                          }
                        }}
                      >
                        <Ionicons 
                          name={inviteClassIds.includes(classItem.id) ? "checkbox" : "checkbox-outline"} 
                          size={20} 
                          color={inviteClassIds.includes(classItem.id) ? colors.purple : colors.muted} 
                        />
                        <Text style={[styles.classOptionText, inviteClassIds.includes(classItem.id) && styles.classOptionTextActive]}>
                          {classItem.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                <Pressable
                  style={[styles.filterOption, inviteFilter === "custom" && styles.filterOptionActive]}
                  onPress={() => {
                    setInviteFilter("custom");
                    setInviteGender("");
                    setInviteClassIds([]);
                  }}
                >
                  <Ionicons name="list" size={20} color={inviteFilter === "custom" ? colors.purple : colors.muted} />
                  <Text style={[styles.filterOptionText, inviteFilter === "custom" && styles.filterOptionTextActive]}>
                    Seleção manual
                  </Text>
                </Pressable>

                {inviteFilter === "custom" && (
                  <View style={styles.customSelection}>
                    <ScrollView style={{ maxHeight: 200 }}>
                      {students.map(student => (
                        <Pressable
                          key={student.uid}
                          style={[styles.studentOption, selectedStudentIds.includes(student.uid) && styles.studentOptionActive]}
                          onPress={() => {
                            if (selectedStudentIds.includes(student.uid)) {
                              setSelectedStudentIds(selectedStudentIds.filter(id => id !== student.uid));
                            } else {
                              setSelectedStudentIds([...selectedStudentIds, student.uid]);
                            }
                          }}
                        >
                          <Ionicons 
                            name={selectedStudentIds.includes(student.uid) ? "checkbox" : "checkbox-outline"} 
                            size={18} 
                            color={selectedStudentIds.includes(student.uid) ? colors.purple : colors.muted} 
                          />
                          <Text style={[styles.studentOptionText, selectedStudentIds.includes(student.uid) && styles.studentOptionTextActive]}>
                            {student.name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setShowInviteModal(false)}
                disabled={sendingInvites}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.createBtn, isInviteButtonDisabled && styles.createBtnDisabled]}
                onPress={handleConfirmSendInvites}
                disabled={isInviteButtonDisabled}
                pointerEvents={isInviteButtonDisabled ? "none" : "auto"}
              >
                {sendingInvites ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.createBtnText}>Enviar Convites</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: Enviar Notificação */}
      <Modal visible={showNotificationModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowNotificationModal(false)}>
          <Pressable style={styles.notificationModal} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Enviar Lembrete</Text>
            <Text style={styles.modalSubtitle}>{selectedEvent?.name}</Text>
            <Text style={styles.notificationInfo}>
              Reenviar convites do evento para todos os alunos ativos. O modal de convite aparecerá novamente para eles.
            </Text>

            <View style={styles.notificationOptions}>
              <Pressable
                style={styles.notificationOption}
                onPress={handleSendNotification}
              >
                <Ionicons name="notifications" size={24} color="#F59E0B" />
                <Text style={styles.notificationOptionText}>Lembrete</Text>
                <Text style={styles.notificationOptionDesc}>Reenviar convites do evento para os alunos</Text>
              </Pressable>
            </View>

            <Pressable style={styles.cancelBtn} onPress={() => setShowNotificationModal(false)}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Header com filtros */}
      <View style={[styles.searchBox, isDesktopMode && desktopStyles.searchBox]}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#777" style={styles.searchIcon} />
          <TextInput
            id="master-events-search"
            name="master-events-search"
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar evento..."
            placeholderTextColor="#777"
            style={styles.search}
          />
        </View>
        <Pressable style={styles.addBtn} onPress={() => setShowCreateModal(true)}>
          <Ionicons name="add" size={24} color="#fff" />
        </Pressable>
      </View>

      {/* Filtros de tipo */}
      <View style={styles.filtersRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersContent}>
          <Pressable
            style={[styles.filterChip, typeFilter === "all" && styles.filterChipActive]}
            onPress={() => setTypeFilter("all")}
          >
            <Text style={[styles.filterChipText, typeFilter === "all" && styles.filterChipTextActive]}>
              Todos
            </Text>
          </Pressable>
          {EVENT_TYPES.map(type => (
            <Pressable
              key={type.value}
              style={[styles.filterChip, typeFilter === type.value && styles.filterChipActive]}
              onPress={() => setTypeFilter(type.value)}
            >
              <Ionicons 
                name={type.icon as any} 
                size={14} 
                color={typeFilter === type.value ? "#fff" : type.color} 
              />
              <Text style={[styles.filterChipText, typeFilter === type.value && styles.filterChipTextActive]}>
                {type.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Lista de eventos */}
      <View style={[styles.listContainer, isDesktopMode && desktopStyles.listContainer]}>
        {filteredEvents.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>
              {query || typeFilter !== "all" ? "Nenhum evento encontrado" : "Nenhum evento cadastrado"}
            </Text>
            <Pressable style={styles.emptyBtn} onPress={() => setShowCreateModal(true)}>
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.emptyBtnText}>Criar Evento</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.purple]} />
            }
          >
            {filteredEvents.map(event => {
              const typeInfo = getEventTypeInfo(event.type);
              const confirmedCount = event.confirmedStudentIds.length;
              const isFull = event.maxParticipants ? confirmedCount >= event.maxParticipants : false;
              
              return (
                <View key={event.id} style={[styles.eventCard, isDesktopMode && desktopStyles.eventCard, !event.active && styles.eventCardInactive]}>
                  <View style={styles.eventHeader}>
                    <View style={styles.eventInfo}>
                      <View style={styles.eventTitleRow}>
                        <Text style={styles.eventName}>{event.name}</Text>
                        <View style={[styles.eventTypeBadge, { backgroundColor: typeInfo.color + "20" }]}>
                          <Ionicons name={typeInfo.icon as any} size={12} color={typeInfo.color} />
                          <Text style={[styles.eventTypeText, { color: typeInfo.color }]}>
                            {typeInfo.label}
                          </Text>
                        </View>
                        {!event.active && (
                          <View style={styles.inactiveBadge}>
                            <Text style={styles.inactiveBadgeText}>Inativo</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.eventMetaRow}>
                        <View style={styles.eventMeta}>
                          <Ionicons name="calendar" size={13} color={colors.muted} />
                          <Text style={styles.eventMetaText}>
                            {formatDate(event.date)}
                          </Text>
                          {event.time && (
                            <>
                              <Text style={styles.eventMetaText}> • </Text>
                              <Ionicons name="time" size={13} color={colors.muted} />
                              <Text style={styles.eventMetaText}>{event.time}</Text>
                            </>
                          )}
                        </View>
                        {event.location && (
                          <View style={styles.eventMeta}>
                            <Ionicons name="location" size={13} color={colors.muted} />
                            <Text style={styles.eventMetaText}>{event.location}</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.eventStatsRow}>
                        <View style={[styles.statBoxCompact, { backgroundColor: colors.green + "20" }]}>
                          <Ionicons name="people" size={14} color={colors.green} />
                          <Text style={[styles.statNumberCompact, { color: colors.green }]}>
                            {confirmedCount}
                            {event.maxParticipants && `/${event.maxParticipants}`}
                          </Text>
                          <Text style={styles.statLabelCompact}>confirmados</Text>
                        </View>
                        {event.price && (
                          <View style={[styles.statBoxCompact, { backgroundColor: colors.purple + "20" }]}>
                            <Ionicons name="cash" size={14} color={colors.purple} />
                            <Text style={[styles.statPriceCompact, { color: colors.purple }]}>
                              {formatCurrency(event.price)}
                            </Text>
                          </View>
                        )}
                      </View>
                      {event.description && (
                        <Text style={styles.eventDescription} numberOfLines={1}>
                          {event.description}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.eventActions}>
                    <View style={styles.actionButtonsRow}>
                      <Pressable
                        style={[styles.actionButton, styles.actionButtonWhatsApp]}
                        onPress={() => handleWhatsAppInvite(event)}
                      >
                        <FontAwesome5 name="whatsapp" size={16} color="#25D366" />
                        <Text style={[styles.actionButtonText, { color: "#25D366" }]}>Convidar</Text>
                      </Pressable>
                      <Pressable 
                        style={styles.actionButton} 
                        onPress={() => handleViewParticipants(event)}
                      >
                        <Ionicons name="people" size={16} color={colors.purple} />
                        <Text style={styles.actionButtonText}>Participantes</Text>
                      </Pressable>
                      <Pressable 
                        style={styles.actionButton} 
                        onPress={() => {
                          setSelectedEvent(event);
                          setShowNotificationModal(true);
                        }}
                      >
                        <Ionicons name="notifications" size={16} color="#F59E0B" />
                        <Text style={styles.actionButtonText}>Avisos</Text>
                      </Pressable>
                    </View>
                    <View style={styles.menuButtonContainer}>
                      <Pressable 
                        style={styles.menuButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          setExpandedMenuId(expandedMenuId === event.id ? null : event.id);
                        }}
                      >
                        <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
                      </Pressable>
                      {expandedMenuId === event.id && (
                        <View style={styles.menuDropdown}>
                          <Pressable
                            style={styles.menuItem}
                            onPress={() => {
                              setExpandedMenuId(null);
                              handleEditEvent(event);
                            }}
                          >
                            <Ionicons name="create" size={16} color={colors.purple} />
                            <Text style={styles.menuItemText}>Editar</Text>
                          </Pressable>
                          <View style={styles.menuDivider} />
                          {event.active && (
                            <>
                              <Pressable
                                style={styles.menuItemDanger}
                                onPress={() => {
                                  setExpandedMenuId(null);
                                  handleCancelEvent(event);
                                }}
                              >
                                <Ionicons name="close-circle" size={16} color="#D97706" />
                                <Text style={[styles.menuItemTextDanger, { color: "#D97706" }]}>Cancelar Evento</Text>
                              </Pressable>
                              <View style={styles.menuDivider} />
                            </>
                          )}
                          <Pressable
                            style={styles.menuItemDanger}
                            onPress={() => {
                              setExpandedMenuId(null);
                              handleDeleteEvent(event);
                            }}
                          >
                            <Ionicons name="trash" size={16} color={colors.danger} />
                            <Text style={styles.menuItemTextDanger}>Excluir</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
            <View style={{ height: 18 }} />
          </ScrollView>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  loadingContainer: { justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, color: colors.muted, fontSize: 14 },

  searchBox: {
    paddingHorizontal: 12,
    paddingTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  searchIcon: { marginRight: 8 },
  search: {
    flex: 1,
    paddingVertical: 12,
    fontWeight: "600",
    color: colors.text,
    fontSize: 15,
  },
  addBtn: {
    backgroundColor: colors.purple,
    borderRadius: 14,
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },

  filtersRow: {
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  filtersContent: {
    gap: 8,
    paddingRight: 12,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  filterChipActive: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  filterChipTextActive: {
    color: "#fff",
  },

  listContainer: {
    flex: 1,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 10,
  },
  listContent: { paddingBottom: 10 },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    color: colors.muted,
    fontWeight: "600",
    marginTop: 12,
    fontSize: 15,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.purple,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  emptyBtnText: { color: "#fff", fontWeight: "700" },

  // Event Card
  eventCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 10,
    overflow: "visible",
  },
  eventCardInactive: {
    opacity: 0.6,
  },
  eventHeader: {
    padding: 10,
  },
  eventInfo: { flex: 1 },
  eventTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
  },
  eventName: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  eventTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  eventTypeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  inactiveBadge: {
    backgroundColor: colors.danger + "20",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  inactiveBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.danger,
  },
  eventMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
  },
  eventMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  eventMetaText: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: "600",
  },
  eventDescription: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
    lineHeight: 14,
  },
  eventStatsRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 2,
  },
  statBoxCompact: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 4,
  },
  statNumberCompact: {
    fontSize: 13,
    fontWeight: "800",
  },
  statLabelCompact: {
    fontSize: 9,
    color: colors.muted,
    fontWeight: "600",
    marginLeft: 1,
  },
  statPriceCompact: {
    fontSize: 12,
    fontWeight: "700",
  },
  eventActions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: "space-between",
    alignItems: "center",
    position: "relative",
  },
  actionButtonsRow: {
    flexDirection: "row",
    flex: 1,
    gap: 8,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 4,
    borderRadius: 6,
    backgroundColor: "#F8FAFC",
    flex: 1,
    minWidth: 0,
  },
  actionButtonWhatsApp: {
    backgroundColor: "#F0FDF4",
  },
  actionButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text,
  },
  menuButtonContainer: {
    position: "relative",
    marginLeft: 8,
  },
  menuButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: "#F8FAFC",
  },
  menuDropdown: {
    position: "absolute",
    bottom: 40,
    right: 0,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 150,
    zIndex: 1000,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  menuItemDanger: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    flex: 1,
  },
  menuItemTextDanger: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.danger,
    flex: 1,
  },
  menuDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 4,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContainer: {
    flex: 1,
  },
  modalBodyScroll: {
    flex: 1,
  },
  modalScrollContent: {
    paddingBottom: 8,
  },
  modalRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "stretch",
  },
  createModal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
    width: "100%",
    maxWidth: 520,
    maxHeight: "92%",
    overflow: "hidden",
    margin: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E293B",
    textAlign: "center",
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  modalHeader: {
    marginBottom: 16,
  },
  inputGroup: { marginBottom: 14 },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  modalTextArea: {
    minHeight: 84,
    textAlignVertical: "top",
  },
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
  },
  typeChipTextSelected: {
    color: "#fff",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  checkboxChecked: {
    backgroundColor: colors.purple,
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  priceInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
  },
  currencySymbol: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    marginRight: 6,
  },
  priceInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  priceWarning: {
    fontSize: 12,
    color: colors.danger,
    marginTop: 4,
    fontStyle: "italic",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  cancelBtn: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
  },
  createBtn: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },

  // Participants Modal
  participantsModal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 20,
    width: "90%",
    maxWidth: 500,
    maxHeight: "85%",
    margin: 16,
  },
  participantsList: {
    maxHeight: 400,
    marginVertical: 12,
  },
  participantsSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    marginBottom: 8,
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  participantEmail: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  confirmBtn: {
    padding: 4,
  },
  removeBtn: {
    padding: 4,
  },
  doneBtn: {
    backgroundColor: "#F8FAFC",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    width: "100%",
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748B",
  },

  // Notification Modal
  notificationModal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 20,
    width: "90%",
    maxWidth: 400,
    alignItems: "center",
    margin: 16,
  },
  notificationInfo: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 20,
  },
  notificationOptions: {
    width: "100%",
    gap: 12,
    marginBottom: 20,
  },
  notificationOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  notificationOptionText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  notificationOptionDesc: {
    fontSize: 12,
    color: colors.muted,
    marginLeft: "auto",
  },

  // Modal de Convites
  filterOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    marginBottom: 8,
    gap: 10,
    borderWidth: 2,
    borderColor: "transparent",
  },
  filterOptionActive: {
    backgroundColor: colors.purple + "15",
    borderColor: colors.purple,
  },
  filterOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    flex: 1,
  },
  filterOptionTextActive: {
    color: colors.purple,
  },
  genderOptions: {
    marginLeft: 20,
    marginTop: 8,
    marginBottom: 8,
    gap: 8,
  },
  genderOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 2,
    borderColor: "transparent",
    gap: 8,
  },
  genderOptionActive: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },
  genderOptionText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  genderOptionTextActive: {
    color: "#fff",
  },
  classOptions: {
    marginLeft: 20,
    marginTop: 8,
    marginBottom: 8,
    gap: 6,
    maxHeight: 200,
  },
  classOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    gap: 8,
  },
  classOptionActive: {
    backgroundColor: colors.purple + "15",
  },
  classOptionText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    flex: 1,
  },
  classOptionTextActive: {
    color: colors.purple,
  },
  customSelection: {
    marginLeft: 20,
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    padding: 8,
  },
  studentOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 6,
    gap: 8,
  },
  studentOptionActive: {
    backgroundColor: colors.purple + "10",
  },
  studentOptionText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    flex: 1,
  },
  studentOptionTextActive: {
    color: colors.purple,
  },
  createBtnDisabled: {
    opacity: 0.5,
  },
});

// Desktop Styles
const desktopStyles = StyleSheet.create({
  screen: {
    backgroundColor: "#F8FAFC",
  },
  searchBox: {
    maxWidth: 600,
    paddingHorizontal: 24,
  },
  listContainer: {
    maxWidth: 800,
    marginHorizontal: 24,
  },
  eventCard: {
    maxWidth: 750,
  },
});


