import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, StyleSheet, ScrollView, TextInput, Text, RefreshControl, Pressable, Modal, ActivityIndicator } from "react-native";
import { Ionicons, FontAwesome5 } from "@/shims/icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { showAlert, showConfirm } from "../../utils/alert";
import { collection, onSnapshot, query as firestoreQuery, where } from "firebase/firestore";
import { db } from "../../services/firebase";

import CdmfHeader from "../../components/CdmfHeader";
import SectionHeader from "../../components/SectionHeader";
import MasterHeader from "../../components/MasterHeader";
import { colors } from "../../theme/colors";
import { useAuth, Profile, Class, PaymentNotification } from "../../contexts/AuthContext";
import { useDesktop } from "../../contexts/DesktopContext";
import { usePayment, Invoice, formatCurrency } from "../../contexts/PaymentContext";
import { useActivity } from "../../contexts/ActivityContext";

const PAYMENT_STATUS_MAP = {
  em_dia: { label: "Em dia", color: colors.green, icon: "checkmark-circle" },
  pendente: { label: "Pendente", color: "#FFA000", icon: "alert-circle" },
  atrasado: { label: "Atrasado", color: colors.danger, icon: "close-circle" },
  sem_cobranca: { label: "Sem cobrança", color: "#64748B", icon: "remove-circle-outline" },
};

const DAYS_OF_WEEK = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

// Função segura para formatar data no formato DD/MM/YYYY
const formatDateSafe = (dateStr: any): string => {
  if (!dateStr || typeof dateStr !== 'string') return '--/--/----';
  try {
    return dateStr.split("-").reverse().join("/");
  } catch {
    return '--/--/----';
  }
};

const ENROLLMENT_STATUS_MAP = {
  ativo: { label: "Ativo", color: colors.green },
  inativo: { label: "Inativo", color: colors.danger },
};

const GENDER_OPTIONS = [
  { value: "", label: "Selecione..." },
  { value: "masculino", label: "Masculino" },
  { value: "feminino", label: "Feminino" },
  { value: "outro", label: "Outro" },
  { value: "prefiro_nao_informar", label: "Prefiro não informar" },
];

const DANCE_PREFERENCE_OPTIONS = [
  { value: "", label: "Selecione..." },
  { value: "condutor", label: "Condutor(a)" },
  { value: "conduzido", label: "Conduzido(a)" },
  { value: "ambos", label: "Ambos" },
];

// Função para aplicar máscara de telefone
const applyPhoneMask = (value: string): string => {
  // Remove tudo que não é dígito
  const numbers = value.replace(/\D/g, '');

  // Aplica a máscara conforme o número de dígitos
  if (numbers.length <= 10) {
    // Formato: (00) 0000-0000
    return numbers
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .replace(/(-\d{4})\d+?$/, '$1');
  } else {
    // Formato: (00) 00000-0000
    return numbers
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .replace(/(-\d{4})\d+?$/, '$1');
  }
};

type FilterType = "todos" | "ativos" | "inativos";

export default function MasterStudentsScreen() {
  const { fetchStudents, fetchClasses, updateProfile, removeStudentFromClass, createOfflineStudent, updateOfflineStudent, deleteOfflineStudent, deleteStudent, mergeOfflineWithOnline, profile: masterProfile } = useAuth();
  const { isDesktopMode } = useDesktop();
  const { fetchInvoices, createInvoice, generateInvoiceForStudent, getPaymentSettings } = usePayment();
  const { logActivity } = useActivity();
  const navigation = useNavigation<any>();
  const [students, setStudents] = useState<Profile[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("ativos");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Estado para faturas e status de pagamento real
  const [studentInvoices, setStudentInvoices] = useState<Record<string, Invoice[]>>({});
  const [sendingNotification, setSendingNotification] = useState(false);

  // Modal states
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showClassesModal, setShowClassesModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null);
  
  // Modal criar aluno offline
  const [showCreateOfflineModal, setShowCreateOfflineModal] = useState(false);
  const [offlineName, setOfflineName] = useState("");
  const [offlinePhone, setOfflinePhone] = useState("");
  const [offlineNotes, setOfflineNotes] = useState("");
  const [offlineClassIds, setOfflineClassIds] = useState<string[]>([]);
  const [offlineBirthDate, setOfflineBirthDate] = useState("");
  const [offlineGender, setOfflineGender] = useState("");
  const [offlineDancePreference, setOfflineDancePreference] = useState("");
  const [creatingOffline, setCreatingOffline] = useState(false);
  
  // Modal editar aluno offline
  const [showEditOfflineModal, setShowEditOfflineModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Profile | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editClassIds, setEditClassIds] = useState<string[]>([]);
  const [editBirthDate, setEditBirthDate] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editDancePreference, setEditDancePreference] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  
  // Modal mesclagem
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeOnlineStudent, setMergeOnlineStudent] = useState<Profile | null>(null);
  const [mergeOfflineOptions, setMergeOfflineOptions] = useState<Profile[]>([]);
  const [selectedMergeOfflineId, setSelectedMergeOfflineId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  // Paginação
  const STUDENTS_PER_PAGE = 25;
  const [displayLimit, setDisplayLimit] = useState(STUDENTS_PER_PAGE);

  // Reset pagination when filter or query changes
  useEffect(() => {
    setDisplayLimit(STUDENTS_PER_PAGE);
  }, [filter, query]);

  const loadData = useCallback(async () => {
    try {
      const [studentsData, classesData, allInvoices] = await Promise.all([
        fetchStudents(),
        fetchClasses(),
        fetchInvoices({}),
      ]);
      setStudents(studentsData);
      setClasses(classesData);
      
      // Agrupa faturas por aluno
      const invoicesByStudent: Record<string, Invoice[]> = {};
      allInvoices.forEach(inv => {
        if (!invoicesByStudent[inv.studentId]) {
          invoicesByStudent[inv.studentId] = [];
        }
        invoicesByStudent[inv.studentId].push(inv);
      });
      setStudentInvoices(invoicesByStudent);
      
      // Sincroniza status de pagamento em background para nÃ£o travar a tela.
      const statusUpdates = studentsData
        .map((student) => {
          const invoices = invoicesByStudent[student.uid] || [];
          const realStatus = calculateRealPaymentStatus(invoices);

          if (realStatus === student.paymentStatus) {
            return null;
          }

          return {
            uid: student.uid,
            name: student.name,
            paymentStatus: realStatus,
          };
        })
        .filter(Boolean) as Array<{
          uid: string;
          name: string;
          paymentStatus: "em_dia" | "pendente" | "atrasado" | "sem_cobranca";
        }>;

      if (statusUpdates.length > 0) {
        void Promise.allSettled(
          statusUpdates.map((student) =>
            updateProfile(student.uid, { paymentStatus: student.paymentStatus })
          )
        ).then((results) => {
          results.forEach((result, index) => {
            if (result.status === "rejected") {
              console.error(
                `Erro ao atualizar status de ${statusUpdates[index].name}:`,
                result.reason
              );
            }
          });
        });
      }
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
    } finally {
      setLoading(false);
    }
  }, [fetchStudents, fetchClasses, fetchInvoices, updateProfile]);
  
  // Calcula o status de pagamento real baseado nas faturas
  const calculateRealPaymentStatus = (invoices: Invoice[]): "em_dia" | "pendente" | "atrasado" | "sem_cobranca" => {
    // Se não há faturas, o aluno não tem cobranças pendentes
    if (invoices.length === 0) return "sem_cobranca";
    
    // Filtra apenas faturas ativas (não canceladas)
    const activeInvoices = invoices.filter(inv => inv.status !== "cancelled");
    
    if (activeInvoices.length === 0) return "sem_cobranca";
    
    const hasOverdue = activeInvoices.some(inv => inv.status === "overdue");
    const hasPending = activeInvoices.some(inv => inv.status === "pending");
    
    if (hasOverdue) return "atrasado";
    if (hasPending) return "pendente";
    return "em_dia";
  };
  
  // Retorna as faturas pendentes/atrasadas de um aluno
  const getStudentPendingInvoices = (studentId: string): Invoice[] => {
    const invoices = studentInvoices[studentId] || [];
    return invoices.filter(inv => inv.status === "pending" || inv.status === "overdue");
  };

  // Recarrega dados quando a tela ganha foco
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Listener em tempo real para atualizar quando turmas ou perfis mudam
  useEffect(() => {
    // Listener para mudanças nas turmas
    const classesQuery = firestoreQuery(collection(db, "classes"));
    const unsubClasses = onSnapshot(classesQuery, (snapshot) => {
      const classesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Class));
      setClasses(classesData);
    }, (error) => {
      console.error("Erro no listener de turmas:", error);
    });

    // Listener para mudanças nos perfis (alunos)
    const profilesQuery = firestoreQuery(
      collection(db, "profiles"),
      where("role", "==", "student")
    );
    const unsubProfiles = onSnapshot(profilesQuery, (snapshot) => {
      const profilesData = snapshot.docs.map(doc => doc.data() as Profile);
      setStudents(profilesData);
    }, (error) => {
      console.error("Erro no listener de perfis:", error);
    });

    return () => {
      unsubClasses();
      unsubProfiles();
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Filtragem
  const getFilteredStudents = () => {
    let filtered = students;
    
    // Filtro por status de matrícula
    if (filter === "ativos") {
      filtered = filtered.filter(s => s.enrollmentStatus !== "inativo");
    } else if (filter === "inativos") {
      filtered = filtered.filter(s => s.enrollmentStatus === "inativo");
    }
    
    // Filtro por busca
    if (query) {
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(query.toLowerCase()) ||
        s.email.toLowerCase().includes(query.toLowerCase())
      );
    }
    
    return filtered;
  };

  const filteredStudents = getFilteredStudents();

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("pt-BR");
  };

  const getStudentClasses = (student: Profile): Class[] => {
    if (!student.classes || student.classes.length === 0) return [];
    return classes.filter(c => student.classes?.includes(c.id));
  };

  const formatClassWithTags = (classItem: Class): string => {
    if (!classItem.schedule || classItem.schedule.length === 0) {
      return classItem.name;
    }
    const day = DAYS_OF_WEEK[classItem.schedule[0].dayOfWeek];
    const time = `${classItem.schedule[0].startTime}h`;
    return `${classItem.name} • ${day} | ${time}`;
  };

  const getPaymentStatusInfo = (status?: string) => {
    // Se não tem status definido, assume "sem_cobranca" (não "pendente")
    return PAYMENT_STATUS_MAP[status as keyof typeof PAYMENT_STATUS_MAP] || PAYMENT_STATUS_MAP.sem_cobranca;
  };

  const handleViewDetails = (student: Profile) => {
    setSelectedStudent(student);
    setShowDetailsModal(true);
  };

  const handleToggleEnrollment = (student: Profile) => {
    const newStatus = student.enrollmentStatus === "inativo" ? "ativo" : "inativo";
    const action = newStatus === "inativo" ? "inativar" : "reativar";

    const executeToggle = async () => {
      try {
        const updateData: Partial<Profile> = { enrollmentStatus: newStatus };

        if (newStatus === "inativo") {
          updateData.deactivatedAt = Date.now();
          updateData.deactivationNotificationSeen = false;
          if (!student.isOffline) {
            const { arrayUnion, doc, updateDoc } = await import("firebase/firestore");
            const { db } = await import("../../services/firebase");
            const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const notification: PaymentNotification = {
              id: notificationId,
              type: "enrollment_inactive",
              title: "⚠️ Matrícula Inativada",
              message: "Sua matrícula foi inativada. Entre em contato com a administração para mais informações sobre a reativação.",
              createdAt: Date.now(),
              createdBy: masterProfile?.uid || "system",
              read: false,
            };
            await updateDoc(doc(db, "profiles", student.uid), { pendingNotifications: arrayUnion(notification) });
          }
        } else {
          updateData.deactivatedAt = undefined;
          updateData.deactivationNotificationSeen = undefined;
        }

        await updateProfile(student.uid, updateData);
        setStudents(prev => prev.map(s => s.uid === student.uid ? { ...s, ...updateData } : s));
        setSelectedStudent(prev => prev ? { ...prev, enrollmentStatus: newStatus } : null);
        showAlert("Sucesso", `Matrícula ${newStatus === "inativo" ? "inativada" : "reativada"} com sucesso!`);
        loadData();
      } catch (e: any) {
        showAlert("Erro", e.message || "Não foi possível atualizar");
      }
    };

    showConfirm(
      `${newStatus === "inativo" ? "Inativar" : "Reativar"} Matrícula`,
      `Deseja ${action} a matrícula de ${student.name}?`,
      executeToggle,
    );
  };

  const handleRemoveFromClass = (student: Profile, classItem: Class) => {
    const executeRemove = async () => {
      try {
        await removeStudentFromClass(classItem.id, student.uid);
        const updatedClasses = (student.classes || []).filter(id => id !== classItem.id);
        setStudents(prev => prev.map(s => s.uid === student.uid ? { ...s, classes: updatedClasses } : s));
        setSelectedStudent(prev => prev ? { ...prev, classes: updatedClasses } : null);
        showAlert("Sucesso", "Aluno removido da turma!");
        logActivity({
          type: "student_removed_from_class",
          title: "Aluno Removido de Turma",
          description: `${student.name} foi removido(a) da turma "${classItem.name}"`,
          metadata: { studentId: student.uid, studentName: student.name, classId: classItem.id, className: classItem.name },
        }).catch(() => {});
        loadData();
      } catch (e: any) {
        showAlert("Erro", e.message || "Não foi possível remover");
      }
    };

    showConfirm(
      "Remover da Turma",
      `Deseja remover ${student.name} da turma ${classItem.name}?`,
      executeRemove,
    );
  };

  const handleManageClasses = (student: Profile) => {
    setSelectedStudent(student);
    setShowDetailsModal(false);
    setShowClassesModal(true);
  };

  // Limpar formulário de criação
  const clearCreateForm = () => {
    setOfflineName("");
    setOfflinePhone("");
    setOfflineNotes("");
    setOfflineClassIds([]);
    setOfflineBirthDate("");
    setOfflineGender("");
    setOfflineDancePreference("");
  };

  // Criar aluno offline
  const handleCreateOfflineStudent = async () => {
    if (!offlineName.trim()) {
      showAlert("Atenção", "Digite o nome do aluno");
      return;
    }

    // Validação de data de nascimento
    if (offlineBirthDate && !isValidBirthDate(offlineBirthDate)) {
      showAlert("Atenção", "Data de nascimento inválida. Use o formato DD/MM/AAAA");
      return;
    }

    setCreatingOffline(true);
    try {
      await createOfflineStudent({
        name: offlineName.trim(),
        phone: offlinePhone.trim() || undefined,
        notes: offlineNotes.trim() || undefined,
        classIds: offlineClassIds.length > 0 ? offlineClassIds : undefined,
        birthDate: offlineBirthDate.trim() || undefined,
        gender: offlineGender || undefined,
        dancePreference: offlineDancePreference || undefined,
      });
      
      setShowCreateOfflineModal(false);
      clearCreateForm();
      showAlert("Sucesso", "Aluno cadastrado com sucesso!");
      logActivity({
        type: "student_registered",
        title: offlineName.trim(),
        description: offlineClassIds.length > 0
          ? `Cadastrado em ${offlineClassIds.length} turma(s)`
          : "Novo aluno cadastrado (sem turma)",
        metadata: { studentName: offlineName.trim() },
      }).catch(() => {});
      loadData();
    } catch (e: any) {
      console.error("Erro ao criar aluno offline:", e);
      showAlert("Erro", e.message || "Não foi possível cadastrar o aluno");
    } finally {
      setCreatingOffline(false);
    }
  };

  // Validação de data de nascimento
  const isValidBirthDate = (date: string): boolean => {
    const regex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!regex.test(date)) return false;
    
    const parts = date.split("/");
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;
    if (year < 1900 || year > new Date().getFullYear()) return false;
    
    return true;
  };

  // Formatar data enquanto digita
  const formatBirthDateInput = (text: string): string => {
    // Remove tudo que não é número
    const numbers = text.replace(/\D/g, "");
    
    // Formata como DD/MM/AAAA
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 4) return `${numbers.slice(0, 2)}/${numbers.slice(2)}`;
    return `${numbers.slice(0, 2)}/${numbers.slice(2, 4)}/${numbers.slice(4, 8)}`;
  };

  // Abrir modal de edição
  const handleOpenEditModal = (student: Profile) => {
    setEditingStudent(student);
    setEditName(student.name);
    setEditPhone(student.phone || "");
    setEditNotes(student.notes || "");
    setEditClassIds(student.classes || []);
    setEditBirthDate(student.birthDate || "");
    setEditGender(student.gender || "");
    setEditDancePreference(student.dancePreference || "");
    setShowDetailsModal(false);
    setShowEditOfflineModal(true);
  };

  // Salvar edição
  const handleSaveEdit = async () => {
    if (!editingStudent) return;
    
    if (!editName.trim()) {
      showAlert("Atenção", "Digite o nome do aluno");
      return;
    }

    if (editBirthDate && !isValidBirthDate(editBirthDate)) {
      showAlert("Atenção", "Data de nascimento inválida. Use o formato DD/MM/AAAA");
      return;
    }

    setSavingEdit(true);
    try {
      await updateOfflineStudent(editingStudent.uid, {
        name: editName.trim(),
        phone: editPhone.trim(),
        notes: editNotes.trim(),
        classIds: editClassIds,
        birthDate: editBirthDate.trim(),
        gender: editGender,
        dancePreference: editDancePreference,
      });
      
      setShowEditOfflineModal(false);
      setEditingStudent(null);
      showAlert("Sucesso", "Dados atualizados com sucesso!");
      loadData();
    } catch (e: any) {
      console.error("Erro ao editar aluno offline:", e);
      showAlert("Erro", e.message || "Não foi possível salvar as alterações");
    } finally {
      setSavingEdit(false);
    }
  };

  // Toggle turma na edição
  const toggleEditClass = (classId: string) => {
    setEditClassIds(prev => 
      prev.includes(classId) 
        ? prev.filter(id => id !== classId) 
        : [...prev, classId]
    );
  };

  // Deletar aluno offline
  const handleDeleteOfflineStudent = (student: Profile) => {
    showConfirm(
      "Excluir Aluno",
      `Deseja excluir permanentemente o aluno "${student.name}"?\n\nEsta ação não pode ser desfeita.`,
      async () => {
        try {
          await deleteOfflineStudent(student.uid);
          setStudents(prev => prev.filter(s => s.uid !== student.uid));
          setShowDetailsModal(false);
          setSelectedStudent(null);
          showAlert("Sucesso", "Aluno excluído com sucesso");
          loadData();
        } catch (e: any) {
          showAlert("Erro", e.message || "Não foi possível excluir");
        }
      },
    );
  };

  // Deletar aluno (inativo)
  const handleDeleteStudent = (student: Profile) => {
    showConfirm(
      "Excluir Perfil",
      `Deseja excluir permanentemente o perfil de "${student.name}"?\n\nTodas as faturas associadas também serão excluídas. Esta ação não pode ser desfeita.`,
      async () => {
        try {
          await deleteStudent(student.uid);
          setStudents(prev => prev.filter(s => s.uid !== student.uid));
          setShowDetailsModal(false);
          setSelectedStudent(null);
          showAlert("Sucesso", "Perfil excluído com sucesso");
          loadData();
        } catch (e: any) {
          showAlert("Erro", e.message || "Não foi possível excluir");
        }
      },
    );
  };

  const toggleOfflineClass = (classId: string) => {
    setOfflineClassIds(prev => 
      prev.includes(classId) 
        ? prev.filter(id => id !== classId) 
        : [...prev, classId]
    );
  };

  // Abrir modal de mesclagem
  const handleOpenMergeModal = (onlineStudent: Profile) => {
    // Busca os alunos offline que podem ser mesclados
    const offlineMatches = students.filter(
      s => s.isOffline && onlineStudent.possibleOfflineMatches?.includes(s.uid)
    );
    
    if (offlineMatches.length === 0) {
      showAlert("Atenção", "Não há alunos offline correspondentes para mesclar.");
      return;
    }
    
    setMergeOnlineStudent(onlineStudent);
    setMergeOfflineOptions(offlineMatches);
    setSelectedMergeOfflineId(null);
    setShowMergeModal(true);
  };

  // Executar mesclagem
  const handleMerge = async () => {
    if (!mergeOnlineStudent || !selectedMergeOfflineId) {
      showAlert("Atenção", "Selecione um aluno offline para mesclar.");
      return;
    }

    setMerging(true);
    try {
      await mergeOfflineWithOnline(selectedMergeOfflineId, mergeOnlineStudent);
      
      // Limpa a flag de mesclagem pendente
      await updateProfile(mergeOnlineStudent.uid, { 
        hasPendingMerge: false,
        possibleOfflineMatches: [],
      });
      
      setShowMergeModal(false);
      setMergeOnlineStudent(null);
      setMergeOfflineOptions([]);
      setSelectedMergeOfflineId(null);
      showAlert("Sucesso", "Perfis mesclados com sucesso! Os dados do aluno offline foram transferidos.");
      loadData();
    } catch (e: any) {
      console.error("Erro ao mesclar perfis:", e);
      showAlert("Erro", e.message || "Não foi possível mesclar os perfis");
    } finally {
      setMerging(false);
    }
  };

  // Ignorar sugestão de mesclagem
  const handleIgnoreMerge = async (student: Profile) => {
    try {
      await updateProfile(student.uid, {
        hasPendingMerge: false,
        possibleOfflineMatches: [],
      });
      setStudents(prev => prev.map(s => s.uid === student.uid ? { ...s, hasPendingMerge: false, possibleOfflineMatches: [] } : s));
      setShowDetailsModal(false);
      loadData();
    } catch (e: any) {
      console.error("Erro ao ignorar mesclagem:", e);
      showAlert("Erro", e.message || "Não foi possível ignorar");
    }
  };

  // ========== FUNÇÕES DE COBRANÇA E NOTIFICAÇÃO ==========

  // Tipos de notificação relacionados a cobrança (devem ser únicos por fatura)
  const BILLING_NOTIFICATION_TYPES = ["billing", "pending_invoice", "reminder", "overdue"];

  // Envia notificação de pagamento para o aluno
  // Se já existir uma notificação de cobrança para a mesma fatura, substitui pelo novo status
  const handleSendNotification = async (
    student: Profile, 
    type: "reminder" | "overdue" | "billing",
    invoice?: Invoice
  ) => {
    if (!masterProfile) return;
    
    setSendingNotification(true);
    try {
      const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      let title = "";
      let message = "";
      
      switch (type) {
        case "reminder":
          title = "⏰ Lembrete de Pagamento";
          message = invoice 
            ? `Olá ${student.name.split(" ")[0]}! Sua mensalidade de ${formatCurrency(invoice.amount)} vence em ${formatDateSafe(invoice.dueDate)}. Não esqueça de efetuar o pagamento.`
            : `Olá ${student.name.split(" ")[0]}! Você possui pagamentos pendentes. Por favor, regularize sua situação.`;
          break;
        case "overdue":
          title = "⚠️ Pagamento em Atraso";
          message = invoice 
            ? `Olá ${student.name.split(" ")[0]}! Sua mensalidade de ${formatCurrency(invoice.amount)} está atrasada. Por favor, regularize o pagamento o mais rápido possível.`
            : `Olá ${student.name.split(" ")[0]}! Você possui pagamentos em atraso. Por favor, regularize sua situação o quanto antes.`;
          break;
        case "billing":
          title = "🆕 Nova Cobrança";
          message = invoice 
            ? `Olá ${student.name.split(" ")[0]}! Uma nova cobrança foi gerada: ${invoice.description} no valor de ${formatCurrency(invoice.amount)}. Vencimento: ${formatDateSafe(invoice.dueDate)}.`
            : `Olá ${student.name.split(" ")[0]}! Uma nova cobrança foi gerada. Acesse a aba de pagamentos para mais detalhes.`;
          break;
      }
      
      const notification: PaymentNotification = {
        id: notificationId,
        type,
        title,
        message,
        invoiceId: invoice?.id,
        amount: invoice?.amount,
        dueDate: invoice?.dueDate,
        createdAt: Date.now(),
        createdBy: masterProfile.uid,
        read: false,
      };
      
      const existingNotifications = student.pendingNotifications || [];
      let updatedNotifications: PaymentNotification[];
      let actionMessage = "";
      
      // Se tiver invoiceId, verifica duplicatas de notificações de cobrança
      if (invoice?.id) {
        const existingIndex = existingNotifications.findIndex(
          n => n.invoiceId === invoice.id && BILLING_NOTIFICATION_TYPES.includes(n.type)
        );
        
        if (existingIndex !== -1) {
          const existingNotif = existingNotifications[existingIndex];
          
          // Se o tipo é o mesmo, não faz nada (evita duplicata exata)
          if (existingNotif.type === type) {
            showAlert("Aviso", `Já existe uma notificação de ${type === "reminder" ? "lembrete" : type === "overdue" ? "atraso" : "cobrança"} para esta fatura.`);
            setSendingNotification(false);
            return;
          }
          
          // Substitui a notificação existente pelo novo status
          updatedNotifications = [...existingNotifications];
          updatedNotifications[existingIndex] = {
            ...notification,
            id: existingNotif.id, // Mantém o mesmo ID
          };
          actionMessage = `Notificação atualizada de ${existingNotif.type} para ${type}`;
        } else {
          // Não existe notificação para esta fatura, adiciona nova
          updatedNotifications = [...existingNotifications, notification];
          actionMessage = `Notificação de ${type === "reminder" ? "lembrete" : type === "overdue" ? "atraso" : "cobrança"} enviada`;
        }
      } else {
        // Sem invoiceId, apenas adiciona (notificações genéricas)
        updatedNotifications = [...existingNotifications, notification];
        actionMessage = `Notificação de ${type === "reminder" ? "lembrete" : type === "overdue" ? "atraso" : "cobrança"} enviada`;
      }
      
      await updateProfile(student.uid, {
        pendingNotifications: updatedNotifications,
      });
      
      showAlert("Sucesso", `${actionMessage} para ${student.name}!`);
      
      // Atualiza o student selecionado
      setSelectedStudent(prev => prev ? {
        ...prev,
        pendingNotifications: updatedNotifications,
      } : null);
      
    } catch (e: any) {
      console.error("Erro ao enviar notificação:", e);
      showAlert("Erro", e.message || "Não foi possível enviar a notificação");
    } finally {
      setSendingNotification(false);
    }
  };

  // Gera cobrança individual para o aluno
  const handleGenerateInvoice = async (student: Profile) => {
    setSendingNotification(true);
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const invoice = await generateInvoiceForStudent(student, currentMonth);
      
      if (invoice) {
        // Recarrega dados para atualizar status do aluno
        await loadData();
        
        // Nota: A notificação já é enviada automaticamente pelo generateInvoiceForStudent
        // Não é necessário chamar handleSendNotification novamente
        
        showAlert("Sucesso", `Cobrança gerada para ${student.name}: ${formatCurrency(invoice.amount)}`);
      } else {
        showAlert("Atenção", "Não foi possível gerar a cobrança. Verifique se o aluno está matriculado em alguma turma.");
      }
    } catch (e: any) {
      console.error("Erro ao gerar cobrança:", e);
      showAlert("Erro", e.message || "Não foi possível gerar a cobrança");
    } finally {
      setSendingNotification(false);
    }
  };

  // Estatísticas
  const offlineCount = students.filter(s => s.isOffline).length;
  const pendingMergeCount = students.filter(s => s.hasPendingMerge).length;
  const activeStudents = students.filter(s => s.enrollmentStatus !== "inativo");
  const inactiveStudents = students.filter(s => s.enrollmentStatus === "inativo");
  const emDia = activeStudents.filter(s => s.paymentStatus === "em_dia" || s.paymentStatus === "sem_cobranca").length;
  const pendentes = activeStudents.filter(s => s.paymentStatus === "pendente").length;
  const atrasados = activeStudents.filter(s => s.paymentStatus === "atrasado").length;
  const semCobranca = activeStudents.filter(s => !s.paymentStatus || s.paymentStatus === "sem_cobranca").length;

  return (
    <View style={[styles.screen, isDesktopMode && desktopStyles.screen]}>
      {!isDesktopMode && <MasterHeader />}
      {!isDesktopMode && <SectionHeader title="Gestão de Alunos" />}

      {/* Modal de detalhes do aluno */}
      <Modal visible={showDetailsModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowDetailsModal(false)} />
          <View style={styles.detailsModalContainer}>
            <ScrollView
              contentContainerStyle={styles.detailsModalScrollCompact}
              showsVerticalScrollIndicator={false}
            >
              {selectedStudent && (
                <>
                  {/* Header compacto: avatar + nome + email + badge de matrícula */}
                  <View style={styles.detailsHeaderRow}>
                    <View style={styles.detailsAvatarSmall}>
                      <FontAwesome5 name="user-graduate" size={20} color={colors.purple} />
                    </View>
                    <View style={styles.detailsHeaderInfo}>
                      <Text style={styles.detailsNameCompact} numberOfLines={1}>{selectedStudent.name}</Text>
                      <Text style={styles.detailsEmailCompact} numberOfLines={1}>{selectedStudent.email}</Text>
                    </View>
                    <View style={[
                      styles.enrollmentBadgeCompact,
                      { backgroundColor: selectedStudent.enrollmentStatus === "inativo" ? "#FFEBEE" : "#E8F5E9" }
                    ]}>
                      <Ionicons
                        name={selectedStudent.enrollmentStatus === "inativo" ? "close-circle" : "checkmark-circle"}
                        size={12}
                        color={selectedStudent.enrollmentStatus === "inativo" ? colors.danger : colors.green}
                      />
                      <Text style={[
                        styles.enrollmentBadgeCompactText,
                        { color: selectedStudent.enrollmentStatus === "inativo" ? colors.danger : colors.green }
                      ]}>
                        {selectedStudent.enrollmentStatus === "inativo" ? "Inativa" : "Ativa"}
                      </Text>
                    </View>
                  </View>

                  {/* Pagamento — status calculado automaticamente */}
                  <View style={styles.compactSection}>
                    <View style={styles.compactSectionHeader}>
                      <Text style={styles.compactSectionTitle}>PAGAMENTO</Text>
                      {(() => {
                        const pending = getStudentPendingInvoices(selectedStudent.uid);
                        if (pending.length === 0) return null;
                        return (
                          <View style={styles.invoiceCountBadge}>
                            <Ionicons name="receipt-outline" size={11} color="#D97706" />
                            <Text style={styles.invoiceCountText}>{pending.length} pendente(s)</Text>
                          </View>
                        );
                      })()}
                    </View>
                    {(() => {
                      const realStatus = calculateRealPaymentStatus(studentInvoices[selectedStudent.uid] || []);
                      const info = PAYMENT_STATUS_MAP[realStatus] || PAYMENT_STATUS_MAP.sem_cobranca;
                      return (
                        <View style={[styles.paymentStatusDisplay, { borderColor: info.color + "40", backgroundColor: info.color + "12" }]}>
                          <Ionicons name={info.icon as any} size={16} color={info.color} />
                          <Text style={[styles.paymentStatusDisplayText, { color: info.color }]}>{info.label}</Text>
                          <Text style={styles.paymentStatusDisplayHint}>calculado automaticamente</Text>
                        </View>
                      );
                    })()}
                    {!selectedStudent.isOffline && (
                      <View style={styles.billingActionsCompact}>
                        {(selectedStudent.paymentStatus === "pendente" || getStudentPendingInvoices(selectedStudent.uid).length > 0) && (
                          <Pressable
                            style={[styles.billingBtnCompact, styles.billingBtnCompactWarning]}
                            onPress={() => {
                              const pending = getStudentPendingInvoices(selectedStudent.uid)[0];
                              handleSendNotification(selectedStudent, "reminder", pending);
                            }}
                            disabled={sendingNotification}
                          >
                            <Ionicons name="notifications-outline" size={13} color="#D97706" />
                            <Text style={[styles.billingBtnCompactText, { color: "#D97706" }]}>Lembrete</Text>
                          </Pressable>
                        )}
                        {(selectedStudent.paymentStatus === "atrasado" || getStudentPendingInvoices(selectedStudent.uid).some(i => i.status === "overdue")) && (
                          <Pressable
                            style={[styles.billingBtnCompact, styles.billingBtnCompactDanger]}
                            onPress={() => {
                              const overdue = getStudentPendingInvoices(selectedStudent.uid).find(i => i.status === "overdue");
                              handleSendNotification(selectedStudent, "overdue", overdue);
                            }}
                            disabled={sendingNotification}
                          >
                            <Ionicons name="warning-outline" size={13} color={colors.danger} />
                            <Text style={[styles.billingBtnCompactText, { color: colors.danger }]}>Notif. Atraso</Text>
                          </Pressable>
                        )}
                      </View>
                    )}
                  </View>

                  {/* Turmas — chips compactos */}
                  <View style={styles.compactSection}>
                    <Text style={styles.compactSectionTitle}>TURMAS</Text>
                    {getStudentClasses(selectedStudent).length === 0 ? (
                      <Text style={styles.noClassesText}>Não matriculado em nenhuma turma</Text>
                    ) : (
                      <View style={styles.classChipsRow}>
                        {getStudentClasses(selectedStudent).map(classItem => (
                          <View key={classItem.id} style={styles.classChipModal}>
                            <FontAwesome5 name="users" size={10} color={colors.purple} />
                            <Text style={styles.classChipModalText} numberOfLines={1}>{formatClassWithTags(classItem)}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Dados Pessoais — grid 2×2 compacto */}
                  <View style={styles.compactSection}>
                    <Text style={styles.compactSectionTitle}>DADOS PESSOAIS</Text>
                    <View style={styles.dataGrid}>
                      <View style={styles.dataGridItem}>
                        <Ionicons name="call-outline" size={13} color={colors.muted} />
                        <Text style={styles.dataGridValue} numberOfLines={1}>
                          {selectedStudent.phone || "Sem telefone"}{selectedStudent.phoneVerified ? " ✓" : ""}
                        </Text>
                      </View>
                      <View style={styles.dataGridItem}>
                        <Ionicons name="calendar-outline" size={13} color={colors.muted} />
                        <Text style={styles.dataGridValue}>
                          {selectedStudent.birthDate || "Sem data"}{selectedStudent.age ? ` (${selectedStudent.age}a)` : ""}
                        </Text>
                      </View>
                      <View style={styles.dataGridItem}>
                        <Ionicons name="person-outline" size={13} color={colors.muted} />
                        <Text style={styles.dataGridValue}>
                          {selectedStudent.gender === "masculino" ? "Masculino" :
                           selectedStudent.gender === "feminino" ? "Feminino" :
                           selectedStudent.gender === "outro" ? "Outro" :
                           selectedStudent.gender === "prefiro_nao_informar" ? "Não informar" :
                           "Não informado"}
                        </Text>
                      </View>
                      <View style={styles.dataGridItem}>
                        <Ionicons name="swap-horizontal-outline" size={13} color={colors.muted} />
                        <Text style={styles.dataGridValue}>
                          {selectedStudent.dancePreference === "condutor" ? "Condutor(a)" :
                           selectedStudent.dancePreference === "conduzido" ? "Conduzido(a)" :
                           selectedStudent.dancePreference === "ambos" ? "Ambos" :
                           "Não informado"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Ações principais */}
                  <View style={styles.actionsCompactRow}>
                    <Pressable
                      style={styles.actionBtnSecondaryCompact}
                      onPress={() => handleManageClasses(selectedStudent)}
                    >
                      <Ionicons name="school-outline" size={15} color={colors.purple} />
                      <Text style={styles.actionBtnSecondaryCompactText}>Turmas</Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.actionBtnPrimaryCompact,
                        selectedStudent.enrollmentStatus === "inativo" ? styles.actionButtonSuccess : styles.actionButtonDanger
                      ]}
                      onPress={() => handleToggleEnrollment(selectedStudent)}
                    >
                      <Ionicons
                        name={selectedStudent.enrollmentStatus === "inativo" ? "refresh" : "ban"}
                        size={15} color="#fff"
                      />
                      <Text style={styles.actionBtnPrimaryCompactText}>
                        {selectedStudent.enrollmentStatus === "inativo" ? "Reativar" : "Inativar"}
                      </Text>
                    </Pressable>
                  </View>

                  {/* Mesclagem pendente — banner compacto */}
                  {selectedStudent.hasPendingMerge && !selectedStudent.isOffline && (
                    <View style={styles.mergeSectionCompact}>
                      <View style={styles.mergeSectionCompactInner}>
                        <Ionicons name="git-merge-outline" size={14} color="#7C3AED" />
                        <Text style={styles.mergeSectionCompactTitle}>Mesclagem pendente</Text>
                        <Pressable
                          style={styles.mergeIgnoreBtnCompact}
                          onPress={() => handleIgnoreMerge(selectedStudent)}
                        >
                          <Text style={styles.mergeIgnoreBtnCompactText}>Ignorar</Text>
                        </Pressable>
                        <Pressable
                          style={styles.mergeActionBtnCompact}
                          onPress={() => {
                            setShowDetailsModal(false);
                            handleOpenMergeModal(selectedStudent);
                          }}
                        >
                          <Ionicons name="git-merge" size={13} color="#fff" />
                          <Text style={styles.mergeActionBtnCompactText}>Mesclar</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {/* Ações para alunos offline: Editar | Excluir lado a lado */}
                  {selectedStudent.isOffline && (
                    <View style={styles.offlineActionsRow}>
                      <Pressable
                        style={styles.editOfflineBtnCompact}
                        onPress={() => handleOpenEditModal(selectedStudent)}
                      >
                        <Ionicons name="create-outline" size={14} color={colors.purple} />
                        <Text style={styles.editOfflineBtnCompactText}>Editar dados</Text>
                      </Pressable>
                      <Pressable
                        style={styles.deleteOfflineBtnCompact}
                        onPress={() => handleDeleteOfflineStudent(selectedStudent)}
                      >
                        <Ionicons name="trash-outline" size={14} color={colors.danger} />
                        <Text style={styles.deleteOfflineBtnCompactText}>Excluir</Text>
                      </Pressable>
                    </View>
                  )}

                  {/* Excluir perfil — apenas para alunos inativos não-offline */}
                  {!selectedStudent.isOffline && selectedStudent.enrollmentStatus === "inativo" && (
                    <Pressable
                      style={[styles.deleteOfflineBtn, { marginTop: 8 }]}
                      onPress={() => handleDeleteStudent(selectedStudent)}
                    >
                      <Ionicons name="trash-outline" size={14} color={colors.danger} />
                      <Text style={styles.deleteOfflineBtnText}>Excluir perfil permanentemente</Text>
                    </Pressable>
                  )}

                  <Pressable style={styles.closeBtnCompact} onPress={() => setShowDetailsModal(false)}>
                    <Text style={styles.closeBtnCompactText}>Fechar</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal de gerenciar turmas do aluno */}
      <Modal visible={showClassesModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowClassesModal(false)}>
          <Pressable style={styles.classesModal} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Turmas do Aluno</Text>
            <Text style={styles.modalSubtitle}>{selectedStudent?.name}</Text>

            <ScrollView style={styles.classesScrollView}>
              {selectedStudent && getStudentClasses(selectedStudent).length === 0 ? (
                <View style={styles.emptyClassesContainer}>
                  <FontAwesome5 name="users" size={32} color="#ccc" />
                  <Text style={styles.emptyClassesText}>Não está em nenhuma turma</Text>
                  <Text style={styles.emptyClassesSubtext}>
                    Adicione o aluno a turmas na tela de Gestão de Turmas
                  </Text>
                </View>
              ) : (
                selectedStudent && getStudentClasses(selectedStudent).map(classItem => (
                  <View key={classItem.id} style={styles.classRow}>
                    <View style={styles.classRowInfo}>
                      <Text style={styles.classRowName}>{classItem.name}</Text>
                      <Text style={styles.classRowTeacher}>Prof. {classItem.teacherName}</Text>
                    </View>
                    <Pressable 
                      style={styles.removeClassBtn}
                      onPress={() => handleRemoveFromClass(selectedStudent, classItem)}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </Pressable>
                  </View>
                ))
              )}
            </ScrollView>

            <Pressable style={styles.doneBtn} onPress={() => setShowClassesModal(false)}>
              <Text style={styles.doneBtnText}>Concluir</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal criar aluno offline */}
      <Modal visible={showCreateOfflineModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => !creatingOffline && setShowCreateOfflineModal(false)}>
          <Pressable style={styles.createOfflineModal} onPress={(e) => e.stopPropagation()}>
            {/* Header compacto */}
            <View style={styles.ofModalHeaderRow}>
              <FontAwesome5 name="user-plus" size={18} color={colors.purple} />
              <Text style={styles.ofModalTitle}>Novo Aluno Offline</Text>
              <Pressable onPress={() => !creatingOffline && setShowCreateOfflineModal(false)} disabled={creatingOffline}>
                <Ionicons name="close" size={20} color="#64748B" />
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>Nome do aluno *</Text>
            <TextInput
              id="offline-student-name"
              name="offline-student-name"
              value={offlineName}
              onChangeText={setOfflineName}
              placeholder="Nome completo"
              placeholderTextColor="#999"
              style={styles.createOfflineInput}
            />

            <View style={[styles.formRow, { marginTop: 10 }]}>
              <View style={styles.formField}>
                <Text style={styles.inputLabel}>Telefone</Text>
                <TextInput
                  id="offline-student-phone"
                  name="offline-student-phone"
                  value={offlinePhone}
                  onChangeText={(text) => setOfflinePhone(applyPhoneMask(text))}
                  placeholder="(00) 00000-0000"
                  placeholderTextColor="#999"
                  keyboardType="phone-pad"
                  style={styles.createOfflineInput}
                  maxLength={15}
                />
              </View>
              <View style={styles.formField}>
                <Text style={styles.inputLabel}>Nascimento</Text>
                <TextInput
                  id="offline-student-birthdate"
                  name="offline-student-birthdate"
                  value={offlineBirthDate}
                  onChangeText={(text) => setOfflineBirthDate(formatBirthDateInput(text))}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor="#999"
                  keyboardType="numeric"
                  maxLength={10}
                  style={styles.createOfflineInput}
                />
              </View>
            </View>

            <View style={{ marginTop: 10 }}>
              <Text style={styles.inputLabel}>Gênero</Text>
              <View style={styles.selectContainerHorizontal}>
                {GENDER_OPTIONS.filter(o => o.value).map(opt => (
                  <Pressable
                    key={opt.value}
                    style={[styles.genderChipCompact, offlineGender === opt.value && styles.genderChipActive]}
                    onPress={() => setOfflineGender(offlineGender === opt.value ? "" : opt.value)}
                  >
                    <Text style={[styles.genderChipText, offlineGender === opt.value && styles.genderChipTextActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={{ marginTop: 10 }}>
              <Text style={styles.inputLabel}>Preferência de Dança</Text>
              <View style={styles.selectContainerHorizontal}>
                {DANCE_PREFERENCE_OPTIONS.filter(o => o.value).map(opt => (
                  <Pressable
                    key={opt.value}
                    style={[styles.danceChip, offlineDancePreference === opt.value && styles.danceChipActive]}
                    onPress={() => setOfflineDancePreference(offlineDancePreference === opt.value ? "" : opt.value)}
                  >
                    <Ionicons
                      name={opt.value === "condutor" ? "arrow-forward" : opt.value === "conduzido" ? "arrow-back" : "swap-horizontal"}
                      size={13}
                      color={offlineDancePreference === opt.value ? "#fff" : colors.purple}
                    />
                    <Text style={[styles.danceChipText, offlineDancePreference === opt.value && styles.danceChipTextActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={{ marginTop: 10 }}>
              <Text style={styles.inputLabel}>Turmas</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.classChipsScroll}>
                {classes.map(c => (
                  <Pressable
                    key={c.id}
                    style={[styles.classChip, offlineClassIds.includes(c.id) && styles.classChipSelected]}
                    onPress={() => toggleOfflineClass(c.id)}
                  >
                    <Text style={[styles.classChipText, offlineClassIds.includes(c.id) && styles.classChipTextSelected]}>
                      {c.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={{ marginTop: 10 }}>
              <Text style={styles.inputLabel}>Observações</Text>
              <TextInput
                id="offline-student-notes"
                name="offline-student-notes"
                value={offlineNotes}
                onChangeText={setOfflineNotes}
                placeholder="Ex: Paga em dinheiro, filho da Maria..."
                placeholderTextColor="#999"
                multiline
                numberOfLines={2}
                style={[styles.createOfflineInput, { height: 46, textAlignVertical: "top" }]}
              />
            </View>

            <View style={styles.createOfflineBtns}>
              <Pressable
                style={styles.createOfflineCancelBtn}
                onPress={() => setShowCreateOfflineModal(false)}
                disabled={creatingOffline}
              >
                <Text style={styles.createOfflineCancelBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={styles.createOfflineSubmitBtn}
                onPress={handleCreateOfflineStudent}
                disabled={creatingOffline}
              >
                {creatingOffline ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={styles.createOfflineSubmitBtnText}>Cadastrar</Text>
                  </>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal de mesclagem */}
      <Modal visible={showMergeModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => !merging && setShowMergeModal(false)}>
          <Pressable style={styles.mergeModal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.mergeHeader}>
              <Ionicons name="git-merge-outline" size={32} color={colors.purple} />
              <Text style={styles.mergeTitle}>Mesclar Perfis</Text>
              <Text style={styles.mergeSubtitle}>
                Encontramos um aluno offline que pode ser o mesmo que se cadastrou no app
              </Text>
            </View>

            {mergeOnlineStudent && (
              <View style={styles.mergeOnlineCard}>
                <View style={styles.mergeCardHeader}>
                  <Ionicons name="phone-portrait-outline" size={16} color={colors.green} />
                  <Text style={styles.mergeCardLabel}>Cadastrado no App</Text>
                </View>
                <Text style={styles.mergeCardName}>{mergeOnlineStudent.name}</Text>
                <Text style={styles.mergeCardEmail}>{mergeOnlineStudent.email}</Text>
              </View>
            )}

            <Ionicons name="arrow-down" size={24} color={colors.muted} style={{ alignSelf: "center", marginVertical: 8 }} />

            <Text style={styles.mergeSelectLabel}>Selecione o perfil offline correspondente:</Text>
            
            <ScrollView style={styles.mergeOptionsScroll}>
              {mergeOfflineOptions.map(offline => (
                <Pressable
                  key={offline.uid}
                  style={[
                    styles.mergeOptionCard,
                    selectedMergeOfflineId === offline.uid && styles.mergeOptionCardSelected
                  ]}
                  onPress={() => setSelectedMergeOfflineId(offline.uid)}
                >
                  <View style={styles.mergeOptionRadio}>
                    {selectedMergeOfflineId === offline.uid ? (
                      <Ionicons name="checkmark-circle" size={24} color={colors.purple} />
                    ) : (
                      <Ionicons name="ellipse-outline" size={24} color={colors.muted} />
                    )}
                  </View>
                  <View style={styles.mergeOptionInfo}>
                    <Text style={styles.mergeOptionName}>{offline.name}</Text>
                    {offline.phone && <Text style={styles.mergeOptionPhone}>{offline.phone}</Text>}
                    {offline.notes && <Text style={styles.mergeOptionNotes}>{offline.notes}</Text>}
                    {offline.classes && offline.classes.length > 0 && (
                      <Text style={styles.mergeOptionClasses}>
                        {offline.classes.length} turma(s)
                      </Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.mergeInfo}>
              <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
              <Text style={styles.mergeInfoText}>
                Ao mesclar, as turmas e histórico de pagamentos do aluno offline serão transferidos para o perfil cadastrado.
              </Text>
            </View>

            <View style={styles.mergeBtns}>
              <Pressable 
                style={styles.mergeCancelBtn} 
                onPress={() => setShowMergeModal(false)}
                disabled={merging}
              >
                <Text style={styles.mergeCancelBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable 
                style={[styles.mergeSubmitBtn, !selectedMergeOfflineId && { opacity: 0.5 }]} 
                onPress={handleMerge}
                disabled={merging || !selectedMergeOfflineId}
              >
                {merging ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="git-merge" size={18} color="#fff" />
                    <Text style={styles.mergeSubmitBtnText}>Mesclar</Text>
                  </>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal editar aluno offline */}
      <Modal visible={showEditOfflineModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => !savingEdit && setShowEditOfflineModal(false)}>
          <View style={styles.editOfflineModal}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              {/* Header compacto */}
              <View style={styles.ofModalHeaderRow}>
                <FontAwesome5 name="user-edit" size={18} color={colors.purple} />
                <Text style={styles.ofModalTitle}>Editar Aluno</Text>
                <Pressable onPress={() => !savingEdit && setShowEditOfflineModal(false)} disabled={savingEdit}>
                  <Ionicons name="close" size={20} color="#64748B" />
                </Pressable>
              </View>

              <Text style={styles.inputLabel}>Nome do aluno *</Text>
              <TextInput
                id="edit-student-name"
                name="edit-student-name"
                value={editName}
                onChangeText={setEditName}
                placeholder="Nome completo"
                placeholderTextColor="#999"
                style={styles.createOfflineInput}
              />

              <View style={[styles.formRow, { marginTop: 10 }]}>
                <View style={styles.formField}>
                  <Text style={styles.inputLabel}>Telefone</Text>
                  <TextInput
                    id="edit-student-phone"
                    name="edit-student-phone"
                    value={editPhone}
                    onChangeText={(text) => setEditPhone(applyPhoneMask(text))}
                    placeholder="(00) 00000-0000"
                    placeholderTextColor="#999"
                    keyboardType="phone-pad"
                    style={styles.createOfflineInput}
                    maxLength={15}
                  />
                </View>
                <View style={styles.formField}>
                  <Text style={styles.inputLabel}>Nascimento</Text>
                  <TextInput
                    id="edit-student-birthdate"
                    name="edit-student-birthdate"
                    value={editBirthDate}
                    onChangeText={(text) => setEditBirthDate(formatBirthDateInput(text))}
                    placeholder="DD/MM/AAAA"
                    placeholderTextColor="#999"
                    keyboardType="numeric"
                    maxLength={10}
                    style={styles.createOfflineInput}
                    autoComplete="bday"
                  />
                </View>
              </View>

              <View style={{ marginTop: 10 }}>
                <Text style={styles.inputLabel}>Gênero</Text>
                <View style={styles.selectContainerHorizontal}>
                  {GENDER_OPTIONS.filter(o => o.value).map(opt => (
                    <Pressable
                      key={opt.value}
                      style={[styles.genderChipCompact, editGender === opt.value && styles.genderChipActive]}
                      onPress={() => setEditGender(editGender === opt.value ? "" : opt.value)}
                    >
                      <Text style={[styles.genderChipText, editGender === opt.value && styles.genderChipTextActive]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={{ marginTop: 10 }}>
                <Text style={styles.inputLabel}>Preferência de Dança</Text>
                <View style={styles.selectContainerHorizontal}>
                  {DANCE_PREFERENCE_OPTIONS.filter(o => o.value).map(opt => (
                    <Pressable
                      key={opt.value}
                      style={[styles.danceChip, editDancePreference === opt.value && styles.danceChipActive]}
                      onPress={() => setEditDancePreference(editDancePreference === opt.value ? "" : opt.value)}
                    >
                      <Ionicons
                        name={opt.value === "condutor" ? "arrow-forward" : opt.value === "conduzido" ? "arrow-back" : "swap-horizontal"}
                        size={13}
                        color={editDancePreference === opt.value ? "#fff" : colors.purple}
                      />
                      <Text style={[styles.danceChipText, editDancePreference === opt.value && styles.danceChipTextActive]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={{ marginTop: 10 }}>
                <Text style={styles.inputLabel}>Turmas</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.classChipsScroll}>
                  {classes.map(c => (
                    <Pressable
                      key={c.id}
                      style={[styles.classChip, editClassIds.includes(c.id) && styles.classChipSelected]}
                      onPress={() => toggleEditClass(c.id)}
                    >
                      <Text style={[styles.classChipText, editClassIds.includes(c.id) && styles.classChipTextSelected]}>
                        {c.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={{ marginTop: 10 }}>
                <Text style={styles.inputLabel}>Observações</Text>
                <TextInput
                  id="edit-student-notes"
                  name="edit-student-notes"
                  value={editNotes}
                  onChangeText={setEditNotes}
                  placeholder="Ex: Paga em dinheiro, filho da Maria..."
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={2}
                  style={[styles.createOfflineInput, { height: 46, textAlignVertical: "top" }]}
                />
              </View>

              <View style={styles.createOfflineBtns}>
                <Pressable
                  style={styles.createOfflineCancelBtn}
                  onPress={() => setShowEditOfflineModal(false)}
                  disabled={savingEdit}
                >
                  <Text style={styles.createOfflineCancelBtnText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={styles.createOfflineSubmitBtn}
                  onPress={handleSaveEdit}
                  disabled={savingEdit}
                >
                  {savingEdit ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <Text style={styles.createOfflineSubmitBtnText}>Salvar</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Alerta de mesclagem pendente */}
      {pendingMergeCount > 0 && (
        <View style={styles.mergeAlert}>
          <Ionicons name="git-merge-outline" size={18} color="#7C3AED" />
          <Text style={styles.mergeAlertText}>
            {pendingMergeCount} aluno(s) com possível correspondência offline
          </Text>
        </View>
      )}

      <View style={[styles.searchBox, isDesktopMode && desktopStyles.searchBox]}>
        <View style={[styles.searchRow]}>
          <View style={[styles.searchContainer, isDesktopMode && desktopStyles.searchContainer, { flex: 1 }]}>
            <Ionicons name="search" size={20} color="#777" style={styles.searchIcon} />
            <TextInput
              id="master-students-search"
              name="master-students-search"
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar aluno por nome ou email..."
              placeholderTextColor="#777"
              style={[styles.search, isDesktopMode && desktopStyles.search]}
            />
          </View>
          <Pressable 
            style={styles.addOfflineBtn}
            onPress={() => setShowCreateOfflineModal(true)}
          >
            <Ionicons name="person-add" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* Filtros */}
      <View style={[styles.filterRow, isDesktopMode && desktopStyles.filterRow]}>
        {(["ativos", "inativos", "todos"] as FilterType[]).map(f => (
          <Pressable
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterBtnText, filter === f && styles.filterBtnTextActive]}>
              {f === "ativos" ? `Ativos (${activeStudents.length})` : 
               f === "inativos" ? `Inativos (${inactiveStudents.length})` : 
               `Todos (${students.length})`}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        style={[styles.mainScrollView, isDesktopMode && desktopStyles.mainScrollView]}
        contentContainerStyle={[styles.mainScrollContent, isDesktopMode && desktopStyles.mainScrollContent]}
        showsVerticalScrollIndicator={true}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.purple]} />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.purple} />
            <Text style={styles.loadingText}>Carregando alunos...</Text>
          </View>
        ) : filteredStudents.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>
              {query ? "Nenhum aluno encontrado" :
               filter === "inativos" ? "Nenhum aluno inativo" : "Nenhum aluno cadastrado"}
            </Text>
          </View>
        ) : (
          <>
            {filteredStudents.slice(0, displayLimit).map((student) => {
              const paymentInfo = getPaymentStatusInfo(student.paymentStatus);
              const studentClasses = getStudentClasses(student);
              const isInactive = student.enrollmentStatus === "inativo";

              return (
                <Pressable
                  key={student.uid}
                  style={[styles.studentCard, isInactive && styles.studentCardInactive]}
                  onPress={() => handleViewDetails(student)}
                >
                      {/* Indicador de status lateral */}
                      <View style={[
                        styles.statusIndicator, 
                        { backgroundColor: isInactive ? colors.danger : paymentInfo.color }
                      ]} />
                      
                      <View style={styles.studentHeader}>
                        <View style={styles.studentInfo}>
                          <View style={styles.nameRow}>
                            <Text style={[styles.studentName, isInactive && styles.studentNameInactive]}>
                              {student.name || "Sem nome"}
                            </Text>
                            {/* Mini ícones de status */}
                            <View style={styles.miniIcons}>
                              {/* Badge Offline */}
                              {student.isOffline && (
                                <View style={[styles.offlineBadge]}>
                                  <Text style={styles.offlineBadgeText}>Offline</Text>
                                </View>
                              )}
                              
                              {/* Badge Mesclagem Pendente */}
                              {student.hasPendingMerge && !student.isOffline && (
                                <View style={[styles.mergeBadge]}>
                                  <Ionicons name="git-merge-outline" size={10} color="#7C3AED" />
                                </View>
                              )}
                              
                              {isInactive ? (
                                <View style={[styles.miniIcon, styles.miniIconDanger]}>
                                  <Ionicons name="close" size={10} color="#fff" />
                                </View>
                              ) : (
                                <>
                                  <View style={[styles.miniIcon, { backgroundColor: paymentInfo.color }]}>
                                    <Ionicons name={paymentInfo.icon as any} size={10} color="#fff" />
                                  </View>
                                  {studentClasses.length > 0 && (
                                    <View style={[styles.miniIcon, styles.miniIconPurple]}>
                                      <Text style={styles.miniIconText}>{studentClasses.length}</Text>
                                    </View>
                                  )}
                                </>
                              )}

                              {/* Indicadores de dança */}
                              {!isInactive && student.dancePreference && (
                                <View style={[styles.miniIcon, styles.miniIconDance]}>
                                  <Ionicons
                                    name={
                                      student.dancePreference === "condutor" ? "arrow-forward" :
                                      student.dancePreference === "conduzido" ? "arrow-back" :
                                      student.dancePreference === "ambos" ? "swap-horizontal" :
                                      "help-circle"
                                    }
                                    size={10}
                                    color="#fff"
                                  />
                                </View>
                              )}
                            </View>
                          </View>
                          <Text style={styles.studentEmail}>{student.email}</Text>
                          {studentClasses.length > 0 && !isInactive && (
                            <Text style={styles.studentClasses} numberOfLines={1}>
                              {studentClasses.map(c => formatClassWithTags(c)).join(" • ")}
                            </Text>
                          )}
                        </View>
                        {!isInactive && (
                          <View style={[styles.statusBadge, { backgroundColor: paymentInfo.color }]}>
                            <Ionicons name={paymentInfo.icon as any} size={14} color="#fff" />
                            <Text style={styles.statusText}>{paymentInfo.label}</Text>
                          </View>
                        )}
                      </View>
                    </Pressable>
                  );
            })}
            
            {/* Botão de carregar mais */}
            {filteredStudents.length > displayLimit && (
              <Pressable 
                style={styles.loadMoreButton}
                onPress={() => setDisplayLimit(prev => prev + STUDENTS_PER_PAGE)}
              >
                <Ionicons name="chevron-down-circle-outline" size={20} color={colors.purple} />
                <Text style={styles.loadMoreText}>
                  Carregar mais ({filteredStudents.length - displayLimit} restantes)
                </Text>
              </Pressable>
            )}
            
            {/* Contador de exibição */}
            {filteredStudents.length > 0 && (
              <Text style={styles.displayCount}>
                Exibindo {Math.min(displayLimit, filteredStudents.length)} de {filteredStudents.length} alunos
              </Text>
            )}
          </>
        )}
        <View style={{ height: 18 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },

  searchBox: { 
    paddingHorizontal: 12, 
    paddingTop: 14,
  },
  searchContainer: {
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

  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F8FAFC",
  },
  filterBtnActive: {
    backgroundColor: colors.purple,
  },
  filterBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
  },
  filterBtnTextActive: {
    color: "#fff",
  },

  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 22,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 2,
  },

  mainScrollView: {
    flex: 1,
    marginHorizontal: 12,
  },
  mainScrollContent: {
    paddingTop: 10,
    paddingBottom: 18,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    color: colors.muted,
    fontWeight: "600",
  },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    color: colors.muted,
    fontWeight: "600",
    marginTop: 12,
    fontSize: 15,
  },

  // Load More Button
  loadMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    marginTop: 8,
    marginHorizontal: 12,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.purple,
  },
  displayCount: {
    textAlign: "center",
    fontSize: 12,
    color: colors.muted,
    marginTop: 8,
    marginBottom: 8,
  },

  // Student Card
  studentCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    paddingLeft: 18,
    marginBottom: 10,
    flexDirection: "row",
    overflow: "hidden",
  },
  studentCardInactive: {
    backgroundColor: "#FAFAFA",
    borderColor: "#E2E8F0",
  },
  statusIndicator: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  studentHeader: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  studentInfo: { flex: 1 },
  nameRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  studentName: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  studentNameInactive: {
    color: colors.muted,
  },
  inactivePill: {
    backgroundColor: "#FFEBEE",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  inactivePillText: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.danger,
  },
  miniIcons: {
    flexDirection: "row",
    gap: 4,
    marginLeft: 6,
  },
  miniIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  miniIconDanger: {
    backgroundColor: colors.danger,
  },
  miniIconPurple: {
    backgroundColor: colors.purple,
  },
  miniIconDance: {
    backgroundColor: "#FF6B35", // Cor laranja para dança
  },
  miniIconText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
  },
  studentEmail: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  studentClasses: {
    fontSize: 11,
    color: colors.purple,
    marginTop: 4,
    fontWeight: "600",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  detailsModalContainer: {
    width: "92%",
    maxWidth: 420,
    maxHeight: "85%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    overflow: "hidden",
  },
  scrollIndicator: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 4,
  },
  scrollIndicatorBar: {
    width: 40,
    height: 4,
    backgroundColor: "#DDD",
    borderRadius: 2,
  },
  detailsModalScroll: {
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  detailsModal: {
    alignItems: "center",
    width: "100%",
  },
  studentAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#F3E5F5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  detailsName: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
  },
  detailsEmail: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 6,
    textAlign: "center",
  },
  enrollmentBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 16,
    gap: 8,
  },
  enrollmentBadgeText: {
    fontSize: 13,
    fontWeight: "700",
  },
  section: {
    width: "100%",
    marginTop: 28,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.muted,
    letterSpacing: 0.5,
    flex: 1,
  },
  manageLink: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.purple,
    backgroundColor: "#F3E5F5",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  paymentButtons: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  paymentBtn: {
    minWidth: 90,
    maxWidth: 110,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    minHeight: 60,
  },
  paymentBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
    marginTop: 6,
  },
  
  // Status atual de pagamento
  currentStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  currentStatusInfo: {
    flex: 1,
  },
  currentStatusLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  currentStatusHint: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 4,
  },
  
  // Faturas pendentes
  pendingInvoicesBox: {
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  pendingInvoicesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  pendingInvoicesTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#D97706",
  },
  pendingInvoiceItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  pendingInvoiceInfo: {
    flex: 1,
  },
  pendingInvoiceDesc: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
  },
  pendingInvoiceStatus: {
    fontSize: 11,
    color: "#D97706",
    marginTop: 2,
  },
  pendingInvoiceAmount: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  
  // Ações de cobrança
  billingActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  billingActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#EDE9FE",
  },
  billingActionBtnWarning: {
    backgroundColor: "#FEF3C7",
  },
  billingActionBtnDanger: {
    backgroundColor: "#FEE2E2",
  },
  billingActionBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.purple,
  },
  
  noClassesText: {
    fontSize: 13,
    color: colors.muted,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 12,
  },
  classItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3E5F5",
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    gap: 12,
  },
  classItemInfo: { 
    flex: 1,
  },
  classItemName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  classItemTeacher: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
  },
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  dataLabel: {
    fontSize: 13,
    color: colors.muted,
  },
  dataValue: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2E7D32",
  },
  actionsSection: {
    width: "100%",
    marginTop: 24,
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  actionButtonSecondary: {
    minWidth: 120,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#F3E5F5",
    gap: 6,
  },
  actionButtonSecondaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.purple,
  },
  actionButtonPrimary: {
    minWidth: 120,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 6,
  },
  actionButtonDanger: {
    backgroundColor: colors.danger,
  },
  actionButtonSuccess: {
    backgroundColor: colors.green,
  },
  actionButtonPrimaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  closeBtn: {
    backgroundColor: "#F8FAFC",
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 24,
    alignItems: "center",
    width: "100%",
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#64748B",
  },

  // Classes Modal
  classesModal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    width: "90%",
    maxWidth: 380,
    maxHeight: "70%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 16,
  },
  classesScrollView: {
    maxHeight: 250,
  },
  emptyClassesContainer: {
    alignItems: "center",
    paddingVertical: 30,
  },
  emptyClassesText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 12,
  },
  emptyClassesSubtext: {
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    marginTop: 8,
  },
  classRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  classRowInfo: { flex: 1 },
  classRowName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  classRowTeacher: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  removeClassBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFEBEE",
    alignItems: "center",
    justifyContent: "center",
  },
  doneBtn: {
    backgroundColor: colors.purple,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },

  // Formulário de criação/edição
  formRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  formField: {
    flex: 1,
  },
  selectContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  selectContainerHorizontal: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  selectOption: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  selectOptionActive: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },
  selectOptionText: {
    fontSize: 12,
    color: colors.muted,
  },
  selectOptionTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  danceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#EDE9FE",
    borderWidth: 1,
    borderColor: "#DDD6FE",
  },
  danceChipActive: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },
  danceChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.purple,
  },
  danceChipTextActive: {
    color: "#fff",
  },
  genderChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#E2E8F0",
    flex: 1,
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  genderChipActive: {
    backgroundColor: "#7C3AED",
    borderColor: "#7C3AED",
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  genderChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
  genderChipTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },

  // Botão editar aluno offline
  editOfflineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#EDE9FE",
  },
  editOfflineBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.purple,
  },

  // Modal editar aluno offline
  editOfflineModal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    width: "92%",
    maxWidth: 500,
    overflow: "hidden",
  },

  // Search row com botão add
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  addOfflineBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── DETALHES MODAL COMPACTO ─────────────────────────────────────────────────
  detailsModalScrollCompact: {
    padding: 16,
  },
  detailsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 2,
  },
  detailsAvatarSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F3E5F5",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  detailsHeaderInfo: {
    flex: 1,
    minWidth: 0,
  },
  detailsNameCompact: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  detailsEmailCompact: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  enrollmentBadgeCompact: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
    flexShrink: 0,
  },
  enrollmentBadgeCompactText: {
    fontSize: 11,
    fontWeight: "700",
  },
  compactSection: {
    width: "100%",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  compactSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  compactSectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.muted,
    letterSpacing: 0.5,
  },
  invoiceCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  invoiceCountText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#D97706",
  },
  paymentButtonsCompact: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  paymentStatusDisplay: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 6,
  },
  paymentStatusDisplayText: {
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  paymentStatusDisplayHint: {
    fontSize: 10,
    color: colors.muted,
    fontStyle: "italic",
  },
  paymentBtnCompact: {
    flex: 1,
    minWidth: 70,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    gap: 3,
  },
  paymentBtnCompactText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  billingActionsCompact: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  billingBtnCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#EDE9FE",
  },
  billingBtnCompactText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.purple,
  },
  billingBtnCompactWarning: {
    backgroundColor: "#FEF3C7",
  },
  billingBtnCompactDanger: {
    backgroundColor: "#FEE2E2",
  },
  classChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  classChipModal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F3E5F5",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  classChipModalText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
    flexShrink: 1,
  },
  dataGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  dataGridItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "48%",
    backgroundColor: "#F8FAFC",
    padding: 8,
    borderRadius: 8,
  },
  dataGridValue: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text,
    flex: 1,
    flexShrink: 1,
  },
  actionsCompactRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  actionBtnSecondaryCompact: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#F3E5F5",
    gap: 6,
  },
  actionBtnSecondaryCompactText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.purple,
  },
  actionBtnPrimaryCompact: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 6,
  },
  actionBtnPrimaryCompactText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  mergeSectionCompact: {
    marginTop: 8,
    backgroundColor: "#EDE9FE",
    borderRadius: 10,
    padding: 10,
  },
  mergeSectionCompactInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  mergeSectionCompactTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#7C3AED",
  },
  mergeIgnoreBtnCompact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  mergeIgnoreBtnCompactText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  mergeActionBtnCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.purple,
  },
  mergeActionBtnCompactText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  offlineActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  editOfflineBtnCompact: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#EDE9FE",
  },
  editOfflineBtnCompactText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.purple,
  },
  deleteOfflineBtnCompact: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#FFEBEE",
  },
  deleteOfflineBtnCompactText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.danger,
  },
  closeBtnCompact: {
    backgroundColor: "#F8FAFC",
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 12,
    alignItems: "center",
    width: "100%",
  },
  closeBtnCompactText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748B",
  },
  // ────────────────────────────────────────────────────────────────────────────

  // Badge offline
  offlineBadge: {
    backgroundColor: "#E0E7FF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  offlineBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#4338CA",
  },

  // Modal criar aluno offline
  createOfflineModal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    width: "92%",
    maxWidth: 420,
    overflow: "hidden",
    flexDirection: "column",
  },
  createOfflineHeader: {
    alignItems: "center",
    marginBottom: 12,
  },
  createOfflineTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    marginTop: 8,
  },
  createOfflineSubtitle: {
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    marginTop: 4,
  },
  ofModalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  ofModalTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  genderChipCompact: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#E2E8F0",
    flex: 1,
    alignItems: "center",
  },
  createOfflineInput: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  classChipsScroll: {
    marginVertical: 8,
  },
  classChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F8FAFC",
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  classChipSelected: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },
  classChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  classChipTextSelected: {
    color: "#fff",
  },
  createOfflineBtns: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
  },
  createOfflineCancelBtn: {
    flex: 1,
    maxWidth: 120,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
  },
  createOfflineCancelBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748B",
  },
  createOfflineSubmitBtn: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  createOfflineSubmitBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },

  // Botão deletar aluno offline
  deleteOfflineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#FFEBEE",
  },
  deleteOfflineBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.danger,
  },

  // Badge mesclagem
  mergeBadge: {
    backgroundColor: "#EDE9FE",
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },

  // Alerta de mesclagem pendente
  mergeAlert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EDE9FE",
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  mergeAlertText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#7C3AED",
  },

  // Modal de mesclagem
  mergeModal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    width: "92%",
    maxWidth: 450,
    maxHeight: "80%",
  },
  mergeHeader: {
    alignItems: "center",
    marginBottom: 20,
  },
  mergeTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
    marginTop: 12,
  },
  mergeSubtitle: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  mergeOnlineCard: {
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#C8E6C9",
  },
  mergeCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  mergeCardLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.green,
  },
  mergeCardName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  mergeCardEmail: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  mergeSelectLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
    marginTop: 16,
    marginBottom: 10,
  },
  mergeOptionsScroll: {
    maxHeight: 180,
  },
  mergeOptionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  mergeOptionCardSelected: {
    backgroundColor: "#EDE9FE",
    borderColor: colors.purple,
  },
  mergeOptionRadio: {
    marginRight: 12,
  },
  mergeOptionInfo: {
    flex: 1,
  },
  mergeOptionName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  mergeOptionPhone: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  mergeOptionNotes: {
    fontSize: 11,
    color: colors.muted,
    fontStyle: "italic",
    marginTop: 4,
  },
  mergeOptionClasses: {
    fontSize: 11,
    color: colors.purple,
    fontWeight: "600",
    marginTop: 4,
  },
  mergeInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FEF3C7",
    padding: 12,
    borderRadius: 10,
    marginTop: 16,
  },
  mergeInfoText: {
    flex: 1,
    fontSize: 12,
    color: "#92400E",
    lineHeight: 16,
  },
  mergeBtns: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  mergeCancelBtn: {
    flex: 1,
    maxWidth: 100,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
  },
  mergeCancelBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#64748B",
  },
  mergeSubmitBtn: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  mergeSubmitBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },

  // Seção de mesclagem no modal de detalhes
  mergeSection: {
    backgroundColor: "#EDE9FE",
    borderRadius: 12,
    padding: 14,
    marginTop: 20,
  },
  mergeSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  mergeSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#7C3AED",
  },
  mergeSectionText: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 16,
    marginBottom: 12,
  },
  mergeSectionBtns: {
    flexDirection: "row",
    gap: 10,
  },
  mergeIgnoreBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  mergeIgnoreBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
  mergeActionBtn: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  mergeActionBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },

});

// Desktop Styles
const desktopStyles = StyleSheet.create({
  screen: {
    backgroundColor: "#F8FAFC",
  },
  searchBox: {
    paddingHorizontal: 32,
    paddingTop: 24,
    maxWidth: 1000,
  },
  searchContainer: {
    maxWidth: 350,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
  },
  search: {
    paddingVertical: 10,
    fontSize: 14,
  },
  filterRow: {
    paddingHorizontal: 32,
    paddingTop: 16,
    gap: 8,
    maxWidth: 1000,
  },
  statsRow: {
    paddingHorizontal: 32,
    paddingTop: 16,
    gap: 12,
    maxWidth: 450,
  },
  statCard: {
    borderRadius: 10,
    padding: 14,
    minWidth: 100,
    maxWidth: 140,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  mainScrollView: {
    marginHorizontal: 32,
    maxWidth: 800,
  },
  mainScrollContent: {
    paddingTop: 16,
    paddingBottom: 32,
  },
  // Modal desktop styles
  modalContainer: {
    maxWidth: 480,
    width: "90%",
  },
});


