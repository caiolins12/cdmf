import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { doc, getDoc, setDoc, collection, query, where, getDocs, updateDoc, deleteDoc, onSnapshot, arrayUnion } from "../services/postgresFirestoreCompat";
import { auth, db, UnifiedUser } from "../services/firebase";
import { apiPost, ClientApiError } from "../services/apiClient";
import { formatCurrency, BaileVoucher, Invoice, PaymentStatus, InvoiceType, PaymentMethod } from "./PaymentContext";

export type Role = "student" | "teacher" | "master";

export type ClassSchedule = {
  dayOfWeek: number; // 0-6 (domingo-sábado)
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
};

export type Class = {
  id: string;
  name: string;
  description?: string;
  teacherId: string;
  teacherName: string;
  studentIds: string[];
  schedule: ClassSchedule[];
  createdAt: number;
  active: boolean;
};

export type AttendanceRecord = {
  id: string;
  classId: string;
  date: string; // "YYYY-MM-DD"
  presentStudentIds: string[];
  absentStudentIds: string[];
  createdBy: string;
  createdAt: number;
};

// Notificação de pagamento para o aluno
export type PaymentNotification = {
  id: string;
  type: "reminder" | "overdue" | "billing" | "payment_confirmed" | "class_added" | "class_removed" | "enrollment_inactive" | "pending_invoice" | "voucher" | "invoice_deleted" | "event_invitation"; // tipos de notificação
  title: string;
  message: string;
  invoiceId?: string;
  amount?: number;
  dueDate?: string;
  classId?: string; // ID da turma (para notificações de turma)
  className?: string; // Nome da turma (para notificações de turma)
  voucherId?: string; // ID do voucher (para notificações de baile) ou eventId (para convites de eventos)
  voucherCode?: string; // Código do voucher (para notificações de baile) ou nome do evento (para convites)
  eventId?: string; // ID do evento (para convites de eventos)
  createdAt: number;
  createdBy: string; // UID de quem enviou
  read?: boolean; // Se o aluno já leu
  dismissedAt?: number; // Quando o aluno dispensou
};

export type Profile = {
  uid: string;
  role: Role;
  name: string;
  email: string;
  phone?: string;
  teacherCode?: string; // Código único do professor
  tempPassword?: string; // Senha temporária (só para professores)
  createdAt: number;
  createdBy?: string; // UID do master que criou (para teachers)
  active?: boolean; // Se o professor está ativo
  photoURL?: string;
  // Campos adicionais para alunos
  paymentStatus?: "em_dia" | "pendente" | "atrasado" | "sem_cobranca";
  enrollmentStatus?: "ativo" | "inativo"; // Status de matrícula
  classes?: string[]; // IDs das turmas
  // Dados pessoais (onboarding)
  birthDate?: string; // DD/MM/AAAA
  age?: number;
  gender?: string; // masculino, feminino, outro, prefiro_nao_informar
  dancePreference?: string; // condutor, conduzido, ambos
  onboardingCompleted?: boolean;
  phoneVerified?: boolean;
  phoneVerificationMethod?: string; // "whatsapp" = verificado pelo novo método OTP
  // Aluno offline (sem acesso à plataforma)
  isOffline?: boolean; // Aluno cadastrado manualmente, sem conta
  notes?: string; // Observações sobre o aluno
  // Controle de conversão offline -> online
  convertedFromOfflineId?: string; // ID do perfil offline original (se foi convertido)
  convertedAt?: number; // Data da conversão
  // Controle de mesclagem pendente
  possibleOfflineMatches?: string[]; // IDs de alunos offline que podem ser o mesmo
  hasPendingMerge?: boolean; // Flag indicando mesclagem pendente
  // Notificações de pagamento pendentes
  pendingNotifications?: PaymentNotification[];
  // Status de desativação - para notificar o aluno
  deactivatedAt?: number; // Data em que foi desativado
  deactivationNotificationSeen?: boolean; // Se o aluno já viu a notificação
  // Aceite de termos de consentimento e políticas de privacidade
  termsAccepted?: boolean; // Se o aluno aceitou os termos
  termsAcceptedAt?: number; // Data/hora em que aceitou os termos
  privacyPolicyAccepted?: boolean; // Aceite especifico da politica de privacidade
  privacyPolicyAcceptedAt?: number; // Data/hora do aceite da politica de privacidade
  termsOfServiceAccepted?: boolean; // Aceite especifico dos termos de servico
  termsOfServiceAcceptedAt?: number; // Data/hora do aceite dos termos de servico
};

// Dados para criar/editar aluno offline
export type OfflineStudentData = {
  name: string;
  phone?: string;
  notes?: string;
  classIds?: string[];
  birthDate?: string;
  gender?: string;
  dancePreference?: string;
};

// Tipos de eventos
export type EventType = "workshop" | "baile" | "aula_especial" | "evento_social" | "outro";

export type Event = {
  id: string;
  name: string;
  type: EventType;
  description?: string;
  date: string; // "YYYY-MM-DD"
  time?: string; // "HH:MM"
  location?: string;
  price?: number; // em centavos
  maxParticipants?: number;
  confirmedStudentIds: string[]; // IDs dos alunos confirmados
  waitlistStudentIds: string[]; // IDs dos alunos em lista de espera
  createdBy: string;
  createdAt: number;
  updatedAt?: number;
  active: boolean;
  requiresPayment: boolean;
  invoiceId?: string; // ID da fatura relacionada (se houver)
};

export type EventConfirmation = {
  studentId: string;
  studentName: string;
  studentEmail: string;
  confirmedAt: number;
  status: "confirmed" | "waitlist" | "cancelled";
};

type AuthContextType = {
  user: UnifiedUser | null;
  profile: Profile | null;
  loading: boolean;
  profileDeleted: boolean;
  isMaster: boolean;
  isTeacher: boolean;
  isStudent: boolean;
  teacherSignIn: (code: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  signOut: () => Promise<void>;
  // Funções do Master
  createTeacher: (name: string, phone?: string) => Promise<{ code: string; password: string }>;
  deleteTeacher: (teacherId: string) => Promise<void>;
  createOfflineStudent: (data: OfflineStudentData) => Promise<string>;
  updateOfflineStudent: (studentId: string, data: Partial<OfflineStudentData>) => Promise<void>;
  deleteOfflineStudent: (studentId: string) => Promise<void>;
  deleteStudent: (studentId: string) => Promise<void>;
  convertOfflineToOnline: (offlineId: string, onlineUid: string) => Promise<void>;
  findPossibleOfflineMatches: (name: string, phone?: string) => Promise<Profile[]>;
  mergeOfflineWithOnline: (offlineId: string, onlineProfile: Profile) => Promise<void>;
  // Funções de listagem
  fetchStudents: () => Promise<Profile[]>;
  fetchTeachers: () => Promise<Profile[]>;
  // Funções de gerenciamento
  toggleTeacherActive: (uid: string, active: boolean) => Promise<void>;
  updateProfile: (uid: string, data: Partial<Profile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
  // Funções de turmas
  createClass: (data: Omit<Class, "id" | "createdAt">) => Promise<string>;
  fetchClasses: () => Promise<Class[]>;
  updateClass: (id: string, data: Partial<Class>) => Promise<void>;
  deleteClass: (id: string) => Promise<void>;
  addStudentToClass: (classId: string, studentId: string) => Promise<void>;
  removeStudentFromClass: (classId: string, studentId: string) => Promise<void>;
  removeTeacherFromClass: (classId: string) => Promise<void>;
  removeTeacherFromAllClasses: (teacherId: string) => Promise<void>;
  getTeacherClasses: (teacherId: string) => Promise<Class[]>;
  assignTeacherToClass: (classId: string, teacherId: string, teacherName: string) => Promise<void>;
  getClassesWithoutTeacher: () => Promise<Class[]>;
  // Funções de presença
  recordAttendance: (classId: string, date: string, presentIds: string[], absentIds: string[]) => Promise<void>;
  fetchAttendance: (classId: string, date?: string) => Promise<AttendanceRecord[]>;
  // Funções de eventos
  createEvent: (data: Omit<Event, "id" | "createdAt" | "createdBy" | "confirmedStudentIds" | "waitlistStudentIds">) => Promise<string>;
  fetchEvents: (filters?: { type?: EventType; active?: boolean }) => Promise<Event[]>;
  updateEvent: (id: string, data: Partial<Event>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  confirmStudentToEvent: (eventId: string, studentId: string) => Promise<void>;
  cancelStudentFromEvent: (eventId: string, studentId: string) => Promise<void>;
  sendEventNotification: (eventId: string, notificationType: "reminder" | "confirmation" | "cancellation") => Promise<void>;
  sendEventInvitations: (eventId: string, filters?: { studentIds?: string[]; gender?: "masculino" | "feminino"; classIds?: string[] }) => Promise<number>; // Retorna número de convites enviados
  confirmEventAttendance: (eventId: string) => Promise<void>; // Aluno confirma presença
  rejectEventAttendance: (eventId: string) => Promise<void>; // Aluno recusa presença
  confirmEventAttendanceAfterPayment: (invoiceId: string, studentId: string, eventName: string) => Promise<void>; // Confirma presença após pagamento
};

export const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UnifiedUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Flag para ignorar onAuthStateChanged durante operações internas
  const isCreatingTeacher = useRef(false);

  // Flag para indicar que o perfil foi deletado (só true se JÁ EXISTIU antes)
  const [profileDeleted, setProfileDeleted] = useState(false);
  
  // Rastreia se o perfil já existiu alguma vez nesta sessão PARA O USUÁRIO ATUAL
  const profileExistedRef = useRef(false);
  
  // Rastreia o UID do usuário atual para resetar quando mudar
  const currentUserUidRef = useRef<string | null>(null);
  
  // Flag para indicar que estamos criando o perfil (evita marcar como deletado durante criação)
  const isCreatingProfileRef = useRef(false);

  // Ref para manter o profile sempre atualizado nas funções memoizadas
  const profileRef = useRef<Profile | null>(null);

  // Sincroniza profileRef com o state profile
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  async function loadProfile(uid: string) {
    // Reset refs se o usuário mudou
    if (currentUserUidRef.current !== uid) {
      currentUserUidRef.current = uid;
      profileExistedRef.current = false;
      setProfileDeleted(false);
    }
    
    const ref = doc(db, "profiles", uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      setProfile(snap.data() as Profile);
      setProfileDeleted(false);
      profileExistedRef.current = true; // Marca que o perfil existiu para este usuário
      isCreatingProfileRef.current = false; // Perfil foi encontrado/criado
    } else {
      setProfile(null);
      // Só marca como deletado se:
      // 1. O perfil JÁ EXISTIU antes nesta sessão PARA ESTE USUÁRIO
      // 2. NÃO estamos criando o perfil no momento
      // Usuários novos não têm perfil ainda, não é "deletado"
      if (profileExistedRef.current && !isCreatingProfileRef.current) {
        setProfileDeleted(true);
      }
    }
  }

  const refreshProfile = useCallback(async () => {
    if (user) {
      await loadProfile(user.uid);
    }
  }, [user]);

  // Listener em tempo real para detectar exclusão/alteração do perfil
  useEffect(() => {
    if (!user) {
      // Reset refs quando não há usuário
      currentUserUidRef.current = null;
      profileExistedRef.current = false;
      setProfileDeleted(false);
      return;
    }

    // Reset refs se o usuário mudou
    if (currentUserUidRef.current !== user.uid) {
      currentUserUidRef.current = user.uid;
      profileExistedRef.current = false;
      setProfileDeleted(false);
    }

    const profileRef = doc(db, "profiles", user.uid);
    const unsubProfile = onSnapshot(profileRef, (snap) => {
      if (snap.exists()) {
        setProfile(snap.data() as Profile);
        setProfileDeleted(false);
        profileExistedRef.current = true; // Marca que o perfil existiu para este usuário
        isCreatingProfileRef.current = false; // Perfil foi encontrado/criado
      } else {
        setProfile(null);
        // Só marca como deletado se:
        // 1. O perfil JÁ EXISTIU antes nesta sessão PARA ESTE USUÁRIO
        // 2. NÃO estamos criando o perfil no momento
        // Isso evita marcar usuários novos como "deletados"
        if (profileExistedRef.current && !isCreatingProfileRef.current) {
          // Adiciona um pequeno delay para dar tempo do perfil ser criado
          // (evita race condition durante criação inicial)
          setTimeout(() => {
            // Verifica novamente se ainda não existe e não está sendo criado
            if (!isCreatingProfileRef.current && profileExistedRef.current && currentUserUidRef.current === user.uid) {
              setProfileDeleted(true);
            }
          }, 500);
        }
      }
    }, (error) => {
      console.error("Erro no listener do perfil:", error);
    });

    return () => unsubProfile();
  }, [user]);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      // Ignora durante criação de professor
      if (isCreatingTeacher.current) {
        return;
      }
      
      try {
        // Reset refs quando o usuário muda ou não há usuário
        if (!u || currentUserUidRef.current !== u.uid) {
          if (!u) {
            currentUserUidRef.current = null;
            profileExistedRef.current = false;
            setProfileDeleted(false);
          } else {
            // Novo usuário - reseta refs
            currentUserUidRef.current = u.uid;
            profileExistedRef.current = false;
            setProfileDeleted(false);
          }
        }
        
        setUser(u);
        if (u) {
          // Marca que estamos criando o perfil (evita marcar como deletado durante criação)
          isCreatingProfileRef.current = true;
          
          // Garante que o perfil existe antes de carregar
          try {
            await ensureProfileForUser(u);
          } catch (profileError) {
            console.log("Erro ao criar perfil:", profileError);
            // Continua mesmo se falhar ao criar perfil
          } finally {
            // Aguarda um pouco para o perfil ser criado antes de carregar
            await new Promise(resolve => setTimeout(resolve, 100));
            isCreatingProfileRef.current = false;
          }
          
          await loadProfile(u.uid);
        } else {
          setProfile(null);
          setProfileDeleted(false);
          profileExistedRef.current = false;
          currentUserUidRef.current = null;
        }
      } catch (error) {
        console.log("Erro no auth state change:", error);
        setProfile(null);
        isCreatingProfileRef.current = false;
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  async function ensureProfileForUser(
    u: UnifiedUser,
    defaults?: Partial<Pick<Profile, "name" | "email" | "role" | "phone">>
  ) {
    const ref = doc(db, "profiles", u.uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      // Perfil já existe - verifica integridade dos dados
      const existingProfile = snap.data() as Profile;
      // Marca que o perfil existiu para este usuário
      profileExistedRef.current = true;
      isCreatingProfileRef.current = false;
      await checkAndMigrateProfile(u, existingProfile);
      return;
    }
    
    // Perfil não existe - vamos criar (já está marcado como isCreatingProfileRef.current = true no caller)

    const role = defaults?.role ?? "student";
    const userName = defaults?.name ?? u.displayName ?? "";
    const userPhone = defaults?.phone ?? u.phoneNumber;
    
    // Monta o perfil base sem campos undefined
    const newProfile: Record<string, any> = {
      uid: u.uid,
      role: role,
      name: userName,
      email: defaults?.email ?? u.email ?? "",
      createdAt: Date.now(),
      active: true,
    };

    // Adiciona campos opcionais apenas se tiverem valor
    if (userPhone) newProfile.phone = userPhone;

    const photoURL = u.photoURL;
    if (photoURL) newProfile.photoURL = photoURL;

    // Adiciona campos específicos para alunos
    if (role === "student") {
      newProfile.paymentStatus = "em_dia";
      newProfile.enrollmentStatus = "ativo";
      newProfile.classes = [];
      // Novos campos inicializados como não completos
      newProfile.onboardingCompleted = false;
      newProfile.phoneVerified = false;

      // Verifica se existe aluno offline correspondente
      try {
        const possibleMatches = await findPossibleOfflineMatchesInternal(userName, userPhone || undefined);
        if (possibleMatches.length > 0) {
          // Sinaliza que há possíveis correspondências para mesclagem
          newProfile.possibleOfflineMatches = possibleMatches.map(m => m.uid);
          newProfile.hasPendingMerge = true;
        }
      } catch (e) {
        console.log("Erro ao verificar correspondências offline:", e);
      }
    }

    await setDoc(ref, newProfile as Profile);
    
    // Marca que o perfil foi criado e existe para este usuário
    profileExistedRef.current = true;
    isCreatingProfileRef.current = false;
  }
  
  // Normaliza texto removendo acentos, espaços extras e convertendo para minúsculo
  function normalizeText(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove acentos
      .replace(/\s+/g, " "); // Remove espaços extras
  }

  // Calcula idade a partir da data de nascimento (DD/MM/AAAA)
  function calculateAge(birthDate: string): number | null {
    try {
      const parts = birthDate.split("/");
      if (parts.length !== 3) return null;
      
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Mês é 0-indexed
      const year = parseInt(parts[2], 10);
      
      const birth = new Date(year, month, day);
      const today = new Date();
      
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      
      return age >= 0 && age < 150 ? age : null;
    } catch {
      return null;
    }
  }

  // Normaliza telefone mantendo apenas números
  function normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    // Remove código do país (55) se presente
    if (digits.length === 13 && digits.startsWith("55")) {
      return digits.substring(2);
    }
    return digits;
  }

  // Calcula score de correspondência entre dois perfis (0-100)
  function calculateMatchScore(
    onlineName: string, 
    onlinePhone: string | undefined,
    onlineBirthDate: string | undefined,
    offlineStudent: Profile
  ): number {
    let score = 0;
    
    const normalizedOnlineName = normalizeText(onlineName);
    const normalizedOfflineName = normalizeText(offlineStudent.name);
    const normalizedOnlinePhone = onlinePhone ? normalizePhone(onlinePhone) : "";
    const normalizedOfflinePhone = offlineStudent.phone ? normalizePhone(offlineStudent.phone) : "";

    // Correspondência exata de telefone = +50 pontos
    if (normalizedOnlinePhone && normalizedOfflinePhone && 
        normalizedOnlinePhone.length >= 10 && 
        normalizedOnlinePhone === normalizedOfflinePhone) {
      score += 50;
    }

    // Correspondência de data de nascimento = +30 pontos
    if (onlineBirthDate && offlineStudent.birthDate && 
        onlineBirthDate === offlineStudent.birthDate) {
      score += 30;
    }

    // Nome completo igual = +40 pontos
    if (normalizedOnlineName === normalizedOfflineName) {
      score += 40;
    } else {
      // Análise parcial do nome
      const onlineWords = normalizedOnlineName.split(" ").filter(w => w.length >= 2);
      const offlineWords = normalizedOfflineName.split(" ").filter(w => w.length >= 2);
      
      if (onlineWords.length > 0 && offlineWords.length > 0) {
        // Primeiro nome igual = +20 pontos
        if (onlineWords[0] === offlineWords[0]) {
          score += 20;
          
          // Último nome igual = +15 pontos
          if (onlineWords.length > 1 && offlineWords.length > 1 &&
              onlineWords[onlineWords.length - 1] === offlineWords[offlineWords.length - 1]) {
            score += 15;
          }
        }
        
        // Contagem de palavras em comum
        const commonWords = onlineWords.filter(w => offlineWords.includes(w));
        const wordMatchRatio = commonWords.length / Math.max(onlineWords.length, offlineWords.length);
        score += Math.round(wordMatchRatio * 10);
      }
    }

    return Math.min(score, 100);
  }

  // Versão interna da busca de correspondências (para usar antes do perfil existir)
  async function findPossibleOfflineMatchesInternal(
    name: string, 
    phone?: string,
    birthDate?: string
  ): Promise<Profile[]> {
    try {
      const profilesRef = collection(db, "profiles");
      const q = query(
        profilesRef,
        where("role", "==", "student"),
        where("isOffline", "==", true),
        where("enrollmentStatus", "==", "ativo")
      );
      const snap = await getDocs(q);
      const offlineStudents = snap.docs.map(d => d.data() as Profile);

      // Calcula score para cada aluno offline
      const scoredMatches = offlineStudents.map(student => ({
        student,
        score: calculateMatchScore(name, phone, birthDate, student)
      }));

      // Retorna apenas correspondências com score >= 40 (mínimo: primeiro nome igual)
      // Ordena por score decrescente
      return scoredMatches
        .filter(m => m.score >= 40)
        .sort((a, b) => b.score - a.score)
        .map(m => m.student);
    } catch (e) {
      return [];
    }
  }

  // Verifica e migra dados de perfis existentes para novas versões
  async function checkAndMigrateProfile(u: UnifiedUser, existingProfile: Profile) {
    const ref = doc(db, "profiles", u.uid);
    const updates: Partial<Profile> = {};
    let needsUpdate = false;

    // Migração: Verifica se campos novos existem para alunos
    if (existingProfile.role === "student") {
      // Se não tem onboardingCompleted definido, define como false
      if (existingProfile.onboardingCompleted === undefined) {
        // Se tem telefone verificado, considera como completo
        if (existingProfile.phone && existingProfile.phoneVerified) {
          updates.onboardingCompleted = true;
        } else {
          updates.onboardingCompleted = false;
        }
        needsUpdate = true;
      }

      // Se não tem phoneVerified definido
      if (existingProfile.phoneVerified === undefined) {
        // Se tem telefone mas não foi verificado
        updates.phoneVerified = false;
        needsUpdate = true;
      }

      // Se não tem paymentStatus
      if (existingProfile.paymentStatus === undefined) {
        updates.paymentStatus = "em_dia";
        needsUpdate = true;
      }

      // Se não tem enrollmentStatus
      if (existingProfile.enrollmentStatus === undefined) {
        updates.enrollmentStatus = "ativo";
        needsUpdate = true;
      }

      // Se não tem classes
      if (existingProfile.classes === undefined) {
        updates.classes = [];
        needsUpdate = true;
      }
    }

    // Atualiza photoURL se mudou
    if (u.photoURL && existingProfile.photoURL !== u.photoURL) {
      updates.photoURL = u.photoURL;
      needsUpdate = true;
    }

    // Atualiza nome se estava vazio e agora tem
    if (!existingProfile.name && u.displayName) {
      updates.name = u.displayName;
      needsUpdate = true;
    }

    // Aplica atualizações se necessário
    if (needsUpdate) {
      try {
        await updateDoc(ref, updates);
        console.log("Perfil migrado/atualizado:", updates);
      } catch (e) {
        console.log("Erro ao migrar perfil:", e);
      }
    }
  }

  // Login de professor/mestre
  async function teacherSignIn(code: string, password: string): Promise<{ success: boolean; error?: string }> {
    const trimmedCode = code.trim().toUpperCase();

    // 1. Tenta login como administrador master
    try {
      const data = await apiPost<{ success: boolean; email: string }>(
        "/api/rpc/masterSignIn",
        { code: trimmedCode, password }
      );
      if (data.email) {
        await auth.signInWithEmailAndPassword(data.email, password);
        return { success: true };
      }
    } catch (masterError: any) {
      const code = masterError instanceof ClientApiError ? masterError.code : undefined;
      // Credenciais de master incorretas — tenta como professor
      if (code === "permission-denied") {
        // cai no bloco de professor abaixo
      } else if (masterError.code === "auth/wrong-password" || masterError.code === "auth/invalid-credential") {
        return { success: false, error: "Senha incorreta." };
      } else if (code && code !== "not-found") {
        // Erro real (configuração, rede, etc.)
        return { success: false, error: masterError.message || "Erro ao autenticar." };
      }
      // "not-found" ou erros desconhecidos → tenta professor
    }

    // 2. Tenta login como professor
    try {
      const teacherData = await apiPost<{ success: boolean; email: string }>(
        "/api/rpc/resolveTeacherSignIn",
        { code: trimmedCode }
      );
      if (!teacherData.email) {
        return { success: false, error: "Código de professor não encontrado ou inativo." };
      }
      await auth.signInWithEmailAndPassword(teacherData.email, password);
      return { success: true };
    } catch (e: any) {
      if (e instanceof ClientApiError) {
        if (e.code === "not-found" || e.code === "permission-denied") {
          return { success: false, error: "Código de professor não encontrado ou inativo." };
        }
      }
      if (e.code === "auth/wrong-password" || e.code === "auth/invalid-credential") {
        return { success: false, error: "Senha incorreta." };
      }
      return { success: false, error: "Erro ao fazer login. Verifique suas credenciais." };
    }
  }

  // Função para gerar código único de professor
  function generateTeacherCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "PROF";
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Função para gerar senha temporária
  function generateTempPassword(): string {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let password = "";
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  // Criar novo professor (apenas master pode fazer isso)
  async function createTeacher(name: string, phone?: string): Promise<{ code: string; password: string }> {
    if (profileRef.current?.role !== "master") {
      throw new Error("Apenas o administrador master pode criar professores");
    }

    const teacherCode = generateTeacherCode();
    const tempPassword = generateTempPassword();
    // Gera um email interno baseado no código (não é usado pelo professor)
    const internalEmail = `${teacherCode.toLowerCase()}@cdmf.internal`;

    // Ativa flag para ignorar onAuthStateChanged
    isCreatingTeacher.current = true;
    
    try {
      // Cria a conta do professor com email interno
      const cred = await auth.createUserWithEmailAndPassword(internalEmail, tempPassword);
      
      const teacherProfile: Profile = {
        uid: cred.user.uid,
        role: "teacher",
        name,
        email: internalEmail,
        teacherCode,
        tempPassword, // Salva a senha para o master poder ver
        createdAt: Date.now(),
        createdBy: profileRef.current?.uid || "",
        active: true,
        ...(phone ? { phone } : {}), // Só inclui se phone tiver valor
      };

      await setDoc(doc(db, "profiles", cred.user.uid), teacherProfile);

      // Reloga o master silenciosamente
      // NOTA: Para criar professores, o master já deve estar logado
      // Se necessário, o master precisa fazer login novamente manualmente
      // Removido relogin automático por segurança
      
      // Restaura o perfil e usuário do master
      setUser(auth.currentUser);
      await loadProfile(auth.currentUser!.uid);

      return { code: teacherCode, password: tempPassword };
    } catch (e: any) {
      // Se der erro ao criar professor, apenas loga o erro
      // Não tenta relogar automaticamente por segurança
      console.error("Erro ao criar professor:", e);
      throw e;
    } finally {
      // Desativa flag
      isCreatingTeacher.current = false;
    }
  }

  // Deletar professor (apenas master pode fazer isso)
  async function deleteTeacher(teacherId: string): Promise<void> {
    if (profileRef.current?.role !== "master") {
      throw new Error("Apenas o administrador pode deletar professores");
    }

    // Remove o professor de todas as turmas
    const classesRef = collection(db, "classes");
    const q = query(classesRef, where("teacherId", "==", teacherId));
    const snap = await getDocs(q);
    
    for (const classDoc of snap.docs) {
      await updateDoc(doc(db, "classes", classDoc.id), {
        teacherId: null,
        teacherName: null,
      });
    }

    // Deleta o perfil do professor
    await deleteDoc(doc(db, "profiles", teacherId));
  }

  // Criar aluno offline (sem conta na plataforma)
  async function createOfflineStudent(data: OfflineStudentData): Promise<string> {
    if (profileRef.current?.role !== "master" && profileRef.current?.role !== "teacher") {
      throw new Error("Apenas administradores podem cadastrar alunos offline");
    }

    if (!data.name || data.name.trim().length < 2) {
      throw new Error("Nome do aluno é obrigatório");
    }

    // Gera um ID único para o aluno offline
    const offlineId = `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Monta o perfil sem campos undefined (Firestore não aceita undefined)
    const studentProfile: Record<string, any> = {
      uid: offlineId,
      role: "student",
      name: data.name.trim(),
      email: `${offlineId}@offline.cdmf`, // Email fictício para alunos offline
      createdAt: Date.now(),
      createdBy: profileRef.current?.uid || "",
      isOffline: true,
      paymentStatus: "sem_cobranca",
      enrollmentStatus: "ativo",
      classes: data.classIds || [],
      onboardingCompleted: true, // Não precisa de onboarding
      phoneVerified: false,
      active: true,
    };

    // Adiciona campos opcionais apenas se tiverem valor
    if (data.phone && data.phone.trim()) {
      studentProfile.phone = data.phone.trim();
    }
    if (data.notes && data.notes.trim()) {
      studentProfile.notes = data.notes.trim();
    }
    if (data.birthDate && data.birthDate.trim()) {
      studentProfile.birthDate = data.birthDate.trim();
      // Calcula idade se tiver data de nascimento
      const age = calculateAge(data.birthDate.trim());
      if (age !== null) {
        studentProfile.age = age;
      }
    }
    if (data.gender) {
      studentProfile.gender = data.gender;
    }
    if (data.dancePreference) {
      studentProfile.dancePreference = data.dancePreference;
    }

    await setDoc(doc(db, "profiles", offlineId), studentProfile as Profile);

    // Se tiver turmas, adiciona o aluno a elas
    if (data.classIds && data.classIds.length > 0) {
      for (const classId of data.classIds) {
        try {
          await addStudentToClass(classId, offlineId);
        } catch (e) {
          console.error(`Erro ao adicionar aluno à turma ${classId}:`, e);
        }
      }
    }

    return offlineId;
  }

  // Atualizar aluno offline
  async function updateOfflineStudent(studentId: string, data: Partial<OfflineStudentData>): Promise<void> {
    if (profileRef.current?.role !== "master" && profileRef.current?.role !== "teacher") {
      throw new Error("Apenas administradores podem editar alunos offline");
    }

    // Verifica se é um aluno offline
    const studentRef = doc(db, "profiles", studentId);
    const studentSnap = await getDoc(studentRef);
    
    if (!studentSnap.exists()) {
      throw new Error("Aluno não encontrado");
    }

    const studentData = studentSnap.data() as Profile;
    
    if (!studentData.isOffline) {
      throw new Error("Apenas alunos offline podem ser editados por esta função");
    }

    // Monta o objeto de atualização sem campos undefined
    const updates: Record<string, any> = {};

    if (data.name !== undefined && data.name.trim().length >= 2) {
      updates.name = data.name.trim();
    }
    if (data.phone !== undefined) {
      if (data.phone.trim()) {
        updates.phone = data.phone.trim();
      } else {
        // Se vazio, remove o campo (Firestore deleteField seria melhor, mas simplificando)
        updates.phone = "";
      }
    }
    if (data.notes !== undefined) {
      updates.notes = data.notes.trim();
    }
    if (data.birthDate !== undefined) {
      if (data.birthDate.trim()) {
        updates.birthDate = data.birthDate.trim();
        const age = calculateAge(data.birthDate.trim());
        if (age !== null) {
          updates.age = age;
        }
      } else {
        updates.birthDate = "";
        updates.age = null;
      }
    }
    if (data.gender !== undefined) {
      updates.gender = data.gender;
    }
    if (data.dancePreference !== undefined) {
      updates.dancePreference = data.dancePreference;
    }
    if (data.classIds !== undefined) {
      // Atualiza as turmas
      const oldClassIds = studentData.classes || [];
      const newClassIds = data.classIds;
      
      // Remove das turmas antigas que não estão nas novas
      for (const classId of oldClassIds) {
        if (!newClassIds.includes(classId)) {
          try {
            await removeStudentFromClass(classId, studentId);
          } catch (e) {
            console.error(`Erro ao remover de turma ${classId}:`, e);
          }
        }
      }
      
      // Adiciona nas turmas novas que não estavam nas antigas
      for (const classId of newClassIds) {
        if (!oldClassIds.includes(classId)) {
          try {
            await addStudentToClass(classId, studentId);
          } catch (e) {
            console.error(`Erro ao adicionar na turma ${classId}:`, e);
          }
        }
      }
      
      updates.classes = newClassIds;
    }

    updates.updatedAt = Date.now();

    await updateDoc(studentRef, updates);
  }

  // Deletar aluno offline
  async function deleteOfflineStudent(studentId: string): Promise<void> {
    if (profileRef.current?.role !== "master") {
      throw new Error("Apenas o administrador pode deletar alunos");
    }

    // Verifica se é um aluno offline
    const studentRef = doc(db, "profiles", studentId);
    const studentSnap = await getDoc(studentRef);
    
    if (!studentSnap.exists()) {
      throw new Error("Aluno não encontrado");
    }

    const studentData = studentSnap.data() as Profile;
    
    if (!studentData.isOffline) {
      throw new Error("Apenas alunos offline podem ser deletados");
    }

    // Remove o aluno de todas as turmas
    if (studentData.classes && studentData.classes.length > 0) {
      for (const classId of studentData.classes) {
        try {
          await removeStudentFromClass(classId, studentId);
        } catch (e) {
          console.error(`Erro ao remover aluno da turma ${classId}:`, e);
        }
      }
    }

    // Deleta faturas associadas
    const invoicesRef = collection(db, "invoices");
    const invoicesQuery = query(invoicesRef, where("studentId", "==", studentId));
    const invoicesSnap = await getDocs(invoicesQuery);
    
    for (const invoiceDoc of invoicesSnap.docs) {
      await deleteDoc(doc(db, "invoices", invoiceDoc.id));
    }

    // Deleta o perfil do aluno
    await deleteDoc(studentRef);
  }

  // Deletar qualquer aluno (offline ou inativo online)
  async function deleteStudent(studentId: string): Promise<void> {
    if (profileRef.current?.role !== "master") {
      throw new Error("Apenas o administrador pode deletar alunos");
    }

    const studentRef = doc(db, "profiles", studentId);
    const studentSnap = await getDoc(studentRef);
    
    if (!studentSnap.exists()) {
      throw new Error("Aluno não encontrado");
    }

    const studentData = studentSnap.data() as Profile;
    
    // Só pode deletar alunos offline OU alunos inativos
    if (!studentData.isOffline && studentData.enrollmentStatus !== "inativo") {
      throw new Error("Apenas alunos offline ou inativos podem ser excluídos. Inative o aluno primeiro.");
    }

    // Remove o aluno de todas as turmas
    if (studentData.classes && studentData.classes.length > 0) {
      for (const classId of studentData.classes) {
        try {
          await removeStudentFromClass(classId, studentId);
        } catch (e) {
          console.error(`Erro ao remover aluno da turma ${classId}:`, e);
        }
      }
    }

    // Deleta faturas associadas
    const invoicesRef = collection(db, "invoices");
    const invoicesQuery = query(invoicesRef, where("studentId", "==", studentId));
    const invoicesSnap = await getDocs(invoicesQuery);
    
    for (const invoiceDoc of invoicesSnap.docs) {
      await deleteDoc(doc(db, "invoices", invoiceDoc.id));
    }

    // Se não for offline, também deletar conta de autenticação (via Cloud Functions seria ideal)
    // Por enquanto apenas deletamos o perfil

    // Deleta o perfil do aluno
    await deleteDoc(studentRef);
  }

  // Buscar possíveis correspondências de alunos offline pelo nome ou telefone
  async function findPossibleOfflineMatches(name: string, phone?: string): Promise<Profile[]> {
    try {
      const profilesRef = collection(db, "profiles");
      const q = query(
        profilesRef,
        where("role", "==", "student"),
        where("isOffline", "==", true)
      );
      const snap = await getDocs(q);
      const offlineStudents = snap.docs.map(d => d.data() as Profile);

      // Normaliza o nome para comparação
      const normalizedName = name.toLowerCase().trim();
      const normalizedPhone = phone?.replace(/\D/g, "") || "";

      // Filtra por correspondência de nome ou telefone
      return offlineStudents.filter(student => {
        const studentName = student.name.toLowerCase().trim();
        const studentPhone = student.phone?.replace(/\D/g, "") || "";

        // Correspondência exata de telefone
        if (normalizedPhone && studentPhone && normalizedPhone === studentPhone) {
          return true;
        }

        // Correspondência parcial de nome (pelo menos 80% de similaridade)
        const nameSimilarity = calculateNameSimilarity(normalizedName, studentName);
        if (nameSimilarity >= 0.8) {
          return true;
        }

        // Primeiro nome igual
        const firstName = normalizedName.split(" ")[0];
        const studentFirstName = studentName.split(" ")[0];
        if (firstName.length >= 3 && firstName === studentFirstName) {
          return true;
        }

        return false;
      });
    } catch (e) {
      console.error("Erro ao buscar correspondências:", e);
      return [];
    }
  }

  // Calcula similaridade entre dois nomes (0-1)
  function calculateNameSimilarity(name1: string, name2: string): number {
    const words1 = name1.split(" ").filter(w => w.length > 2);
    const words2 = name2.split(" ").filter(w => w.length > 2);
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    let matches = 0;
    for (const word of words1) {
      if (words2.includes(word)) matches++;
    }
    
    return matches / Math.max(words1.length, words2.length);
  }

  // Converte aluno offline para online (quando se cadastra no app)
  async function convertOfflineToOnline(offlineId: string, onlineUid: string): Promise<void> {
    if (profileRef.current?.role !== "master") {
      throw new Error("Apenas o administrador pode converter perfis");
    }

    const offlineRef = doc(db, "profiles", offlineId);
    const offlineSnap = await getDoc(offlineRef);
    
    if (!offlineSnap.exists()) {
      throw new Error("Perfil offline não encontrado");
    }

    const offlineData = offlineSnap.data() as Profile;
    
    if (!offlineData.isOffline) {
      throw new Error("Este perfil já está online");
    }

    const onlineRef = doc(db, "profiles", onlineUid);
    const onlineSnap = await getDoc(onlineRef);
    
    if (!onlineSnap.exists()) {
      throw new Error("Perfil online não encontrado");
    }

    const onlineData = onlineSnap.data() as Profile;

    // Mescla os dados - prioriza dados do perfil online, mas mantém histórico do offline
    const mergedProfile: Partial<Profile> = {
      // Mantém dados do perfil offline que são relevantes
      classes: [...new Set([...(offlineData.classes || []), ...(onlineData.classes || [])])],
      paymentStatus: offlineData.paymentStatus || onlineData.paymentStatus,
      enrollmentStatus: offlineData.enrollmentStatus || onlineData.enrollmentStatus,
      notes: offlineData.notes ? `[Histórico offline] ${offlineData.notes}` : onlineData.notes,
      // Marca como convertido
      isOffline: false,
      convertedFromOfflineId: offlineId,
      convertedAt: Date.now(),
    };

    // Atualiza o perfil online com dados mesclados
    await updateDoc(onlineRef, mergedProfile);

    // Atualiza faturas do aluno offline para o novo UID
    const invoicesRef = collection(db, "invoices");
    const invoicesQuery = query(invoicesRef, where("studentId", "==", offlineId));
    const invoicesSnap = await getDocs(invoicesQuery);
    
    for (const invoiceDoc of invoicesSnap.docs) {
      await updateDoc(doc(db, "invoices", invoiceDoc.id), {
        studentId: onlineUid,
        studentName: onlineData.name,
        studentEmail: onlineData.email,
        migratedFromOffline: true,
      });
    }

    // Atualiza turmas - substitui o ID offline pelo online
    if (offlineData.classes && offlineData.classes.length > 0) {
      for (const classId of offlineData.classes) {
        try {
          const classRef = doc(db, "classes", classId);
          const classSnap = await getDoc(classRef);
          
          if (classSnap.exists()) {
            const classData = classSnap.data();
            const studentIds = classData.studentIds || [];
            
            // Remove o ID offline e adiciona o online
            const newStudentIds = studentIds
              .filter((id: string) => id !== offlineId)
              .concat(onlineUid);
            
            await updateDoc(classRef, { studentIds: [...new Set(newStudentIds)] });
          }
        } catch (e) {
          console.error(`Erro ao atualizar turma ${classId}:`, e);
        }
      }
    }

    // Deleta o perfil offline
    await deleteDoc(offlineRef);
  }

  // Mescla perfil offline com perfil online existente
  async function mergeOfflineWithOnline(offlineId: string, onlineProfile: Profile): Promise<void> {
    await convertOfflineToOnline(offlineId, onlineProfile.uid);
  }

  // Buscar todos os alunos
  async function fetchStudents(): Promise<Profile[]> {
    try {
      const profilesRef = collection(db, "profiles");
      const q = query(
        profilesRef,
        where("role", "==", "student")
      );
      const snap = await getDocs(q);
      const students = snap.docs.map(doc => doc.data() as Profile);
      // Ordena no cliente para evitar necessidade de índice composto
      return students.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch (e) {
      console.error("Erro ao buscar alunos:", e);
      return [];
    }
  }

  // Buscar todos os professores
  async function fetchTeachers(): Promise<Profile[]> {
    try {
      const profilesRef = collection(db, "profiles");
      const q = query(
        profilesRef,
        where("role", "==", "teacher")
      );
      const snap = await getDocs(q);
      const teachers = snap.docs.map(doc => doc.data() as Profile);
      // Ordena no cliente para evitar necessidade de índice composto
      return teachers.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch (e) {
      console.error("Erro ao buscar professores:", e);
      return [];
    }
  }

  // Ativar/desativar professor
  async function toggleTeacherActive(uid: string, active: boolean): Promise<void> {
    if (profileRef.current?.role !== "master") {
      throw new Error("Apenas o administrador master pode alterar status de professores");
    }

    const ref = doc(db, "profiles", uid);
    await updateDoc(ref, { active });

    // Se estiver desativando, remove o professor de todas as turmas
    if (!active) {
      await removeTeacherFromAllClasses(uid);
    }
  }

  // Remover professor de todas as turmas
  async function removeTeacherFromAllClasses(teacherId: string): Promise<void> {
    const q = query(collection(db, "classes"), where("teacherId", "==", teacherId));
    const snap = await getDocs(q);
    
    const batch: Promise<void>[] = [];
    snap.docs.forEach((docSnap) => {
      // Marca a turma como sem professor ou inativa
      batch.push(updateDoc(doc(db, "classes", docSnap.id), { 
        teacherId: "",
        teacherName: "Sem professor",
      }));
    });
    
    await Promise.all(batch);
  }

  // Remover professor de uma turma específica
  async function removeTeacherFromClass(classId: string): Promise<void> {
    const ref = doc(db, "classes", classId);
    await updateDoc(ref, { 
      teacherId: "",
      teacherName: "Sem professor",
    });
  }

  // Obter turmas de um professor
  async function getTeacherClasses(teacherId: string): Promise<Class[]> {
    const q = query(collection(db, "classes"), where("teacherId", "==", teacherId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Class));
  }

  // Atribuir professor a uma turma
  async function assignTeacherToClass(classId: string, teacherId: string, teacherName: string): Promise<void> {
    const ref = doc(db, "classes", classId);
    await updateDoc(ref, { 
      teacherId,
      teacherName,
    });
  }

  // Obter turmas sem professor
  async function getClassesWithoutTeacher(): Promise<Class[]> {
    const q = query(collection(db, "classes"), where("teacherId", "==", ""));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Class));
  }

  // Atualizar perfil
  async function updateProfile(uid: string, data: Partial<Profile>): Promise<void> {
    const ref = doc(db, "profiles", uid);
    await updateDoc(ref, data);
  }

  // ========== FUNÇÕES DE TURMAS ==========

  // Criar nova turma
  async function createClass(data: Omit<Class, "id" | "createdAt">): Promise<string> {
    if (profileRef.current?.role !== "master" && profileRef.current?.role !== "teacher") {
      throw new Error("Sem permissão para criar turmas");
    }

    const classId = `CLASS${Date.now()}`;
    const newClass: Class = {
      ...data,
      teacherId: data.teacherId || "",
      teacherName: data.teacherName || "Sem professor",
      id: classId,
      createdAt: Date.now(),
    };

    await setDoc(doc(db, "classes", classId), newClass);
    return classId;
  }

  // Buscar todas as turmas
  // Nota: Firestore requer que queries de coleção incluam filtros compatíveis com as regras de segurança
  // Para não-masters, filtramos por active == true (compatível com a regra que permite leitura de turmas ativas)
  async function fetchClasses(): Promise<Class[]> {
    try {
      const classesRef = collection(db, "classes");
      
      // Master pode ver todas as turmas (incluindo inativas)
      // Outros usuários só podem ver turmas ativas (conforme regra do Firestore)
      let snap;
      if (profileRef.current?.role === "master") {
        snap = await getDocs(classesRef);
      } else if (profileRef.current?.role === "student" && profileRef.current?.uid) {
        // Alunos: só veem turmas em que estão matriculados (satisfaz regras do Firestore)
        const studentClassesQuery = query(
          classesRef,
          where("active", "==", true),
          where("studentIds", "array-contains", profileRef.current.uid)
        );
        snap = await getDocs(studentClassesQuery);
      } else {
        // Professores e outros: todas as turmas ativas
        const activeClassesQuery = query(classesRef, where("active", "==", true));
        snap = await getDocs(activeClassesQuery);
      }
      
      const classes = snap.docs.map(doc => doc.data() as Class);
      return classes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch {
      // Silently return empty array if user doesn't have permission yet
      return [];
    }
  }

  // Atualizar turma
  async function updateClass(id: string, data: Partial<Class>): Promise<void> {
    const ref = doc(db, "classes", id);
    await updateDoc(ref, data);
  }

  // Excluir turma
  async function deleteClass(id: string): Promise<void> {
    const ref = doc(db, "classes", id);
    await deleteDoc(ref);
  }

  // Adicionar aluno à turma
  async function addStudentToClass(classId: string, studentId: string): Promise<void> {
    const classRef = doc(db, "classes", classId);
    const classSnap = await getDoc(classRef);
    
    if (!classSnap.exists()) throw new Error("Turma não encontrada");
    
    const classData = classSnap.data() as Class;
    const wasAlreadyInClass = classData.studentIds.includes(studentId);
    
    if (!wasAlreadyInClass) {
      await updateDoc(classRef, {
        studentIds: [...classData.studentIds, studentId],
      });
    }

    // Atualiza o perfil do aluno com a turma
    const studentRef = doc(db, "profiles", studentId);
    const studentSnap = await getDoc(studentRef);
    if (studentSnap.exists()) {
      const studentData = studentSnap.data() as Profile;
      const currentClasses = studentData.classes || [];
      const wasAlreadyInProfile = currentClasses.includes(classId);
      
      if (!wasAlreadyInProfile) {
        await updateDoc(studentRef, {
          classes: [...currentClasses, classId],
        });
        
        // Envia notificação apenas se o aluno não estava na turma antes
        if (!wasAlreadyInClass && !studentData.isOffline) {
          const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const notification: PaymentNotification = {
            id: notificationId,
            type: "class_added",
            title: "🎉 Nova Turma Matriculada",
            message: `Você foi matriculado(a) na turma "${classData.name}". Confira os horários e informações na aba de turmas.`,
            classId,
            className: classData.name,
            createdAt: Date.now(),
            createdBy: profileRef.current?.uid || "system",
            read: false,
          };
          
          const existingNotifications = studentData.pendingNotifications || [];
          await updateDoc(studentRef, {
            pendingNotifications: arrayUnion(notification),
          });
        }
      }
    }
  }

  // Remover aluno da turma
  async function removeStudentFromClass(classId: string, studentId: string): Promise<void> {
    const classRef = doc(db, "classes", classId);
    const classSnap = await getDoc(classRef);
    
    if (!classSnap.exists()) throw new Error("Turma não encontrada");
    
    const classData = classSnap.data() as Class;
    const wasInClass = classData.studentIds.includes(studentId);
    
    await updateDoc(classRef, {
      studentIds: classData.studentIds.filter(id => id !== studentId),
    });

    // Remove a turma do perfil do aluno
    const studentRef = doc(db, "profiles", studentId);
    const studentSnap = await getDoc(studentRef);
    if (studentSnap.exists()) {
      const studentData = studentSnap.data() as Profile;
      const currentClasses = studentData.classes || [];
      await updateDoc(studentRef, {
        classes: currentClasses.filter(id => id !== classId),
      });
      
      // Envia notificação apenas se o aluno estava na turma e não é offline
      if (wasInClass && !studentData.isOffline) {
        const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const notification: PaymentNotification = {
          id: notificationId,
          type: "class_removed",
          title: "📋 Removido(a) de Turma",
          message: `Você foi removido(a) da turma "${classData.name}". Entre em contato com a administração para mais informações.`,
          classId,
          className: classData.name,
          createdAt: Date.now(),
          createdBy: profileRef.current?.uid || "system",
          read: false,
        };

        const existingNotifications = studentData.pendingNotifications || [];
        await updateDoc(studentRef, {
          pendingNotifications: arrayUnion(notification),
        });
      }
    }
  }

  // ========== FUNÇÕES DE PRESENÇA ==========

  // Registrar presença
  async function recordAttendance(
    classId: string,
    date: string,
    presentIds: string[],
    absentIds: string[]
  ): Promise<void> {
    const attendanceId = `${classId}_${date}`;
    const record: AttendanceRecord = {
      id: attendanceId,
      classId,
      date,
      presentStudentIds: presentIds,
      absentStudentIds: absentIds,
      createdBy: profileRef.current?.uid || "",
      createdAt: Date.now(),
    };

    await setDoc(doc(db, "attendance", attendanceId), record);
  }

  // Buscar registros de presença
  async function fetchAttendance(classId: string, date?: string): Promise<AttendanceRecord[]> {
    try {
      const attendanceRef = collection(db, "attendance");
      let q;
      
      if (date) {
        q = query(attendanceRef, where("classId", "==", classId), where("date", "==", date));
      } else {
        q = query(attendanceRef, where("classId", "==", classId));
      }
      
      const snap = await getDocs(q);
      return snap.docs.map(doc => doc.data() as AttendanceRecord);
    } catch (e) {
      console.error("Erro ao buscar presença:", e);
      return [];
    }
  }

  // ========== FUNÇÕES DE EVENTOS ==========

  // Gera ID único para eventos
  function generateEventId(): string {
    return `EVT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async function createEvent(data: Omit<Event, "id" | "createdAt" | "createdBy" | "confirmedStudentIds" | "waitlistStudentIds">): Promise<string> {
    if (!profileRef.current || profileRef.current.role !== "master") {
      throw new Error("Apenas o administrador pode criar eventos");
    }

    // Remove campos undefined (Firebase não aceita undefined)
    const cleanData: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleanData[key] = value;
      }
    }

    const id = generateEventId();
    const event: Event = {
      ...cleanData,
      id,
      confirmedStudentIds: [],
      waitlistStudentIds: [],
      createdAt: Date.now(),
      createdBy: profileRef.current?.uid || "",
      active: cleanData.active !== false,
    };

    await setDoc(doc(db, "events", id), event);
    return id;
  }

  async function fetchEvents(filters?: { type?: EventType; active?: boolean }): Promise<Event[]> {
    try {
      const eventsRef = collection(db, "events");
      let constraints: any[] = [];
      
      // IMPORTANTE: Para não-masters, SEMPRE filtrar por active == true
      // Isso é necessário para satisfazer as regras de segurança do Firestore
      if (profileRef.current?.role !== "master") {
        // Não-masters só podem ver eventos ativos
        constraints.push(where("active", "==", true));
      } else if (filters?.active !== undefined) {
        // Master pode filtrar por active se quiser
        constraints.push(where("active", "==", filters.active));
      }
      
      if (filters?.type) {
        constraints.push(where("type", "==", filters.type));
      }

      const q = constraints.length > 0 
        ? query(eventsRef, ...constraints)
        : query(eventsRef);

      const snap = await getDocs(q);
      const events = snap.docs.map(d => ({ id: d.id, ...d.data() } as Event));
      
      // Ordena por data (mais próximos primeiro)
      return events.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateA - dateB;
      });
    } catch (e) {
      console.error("Erro ao buscar eventos:", e);
      return [];
    }
  }

  async function updateEvent(id: string, data: Partial<Event>): Promise<void> {
    if (!profileRef.current || profileRef.current.role !== "master") {
      throw new Error("Apenas o administrador pode atualizar eventos");
    }

    // Remove campos undefined (Firebase não aceita undefined)
    const cleanData: any = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleanData[key] = value;
      }
    }

    const ref = doc(db, "events", id);
    await updateDoc(ref, cleanData);
  }

  async function deleteEvent(id: string): Promise<void> {
    if (!profileRef.current || profileRef.current.role !== "master") {
      throw new Error("Apenas o administrador pode deletar eventos");
    }

    await deleteDoc(doc(db, "events", id));
  }

  // Função auxiliar para gerar código de voucher
  function generateVoucherCode(): string {
    return Math.random().toString(36).substr(2, 8).toUpperCase();
  }

  // Função auxiliar para gerar IDs únicos (similar ao PaymentContext)
  function generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Função auxiliar para criar voucher diretamente do evento (pode ter invoice ou não)
  async function createEventVoucher(
    eventId: string,
    eventName: string,
    eventDate: string,
    studentId: string,
    studentName: string,
    studentEmail: string,
    invoiceId?: string
  ): Promise<BaileVoucher> {
    const voucherId = generateId("VCH");
    const voucherCode = generateVoucherCode();
    
    const voucher: BaileVoucher & { eventId?: string } = {
      id: voucherId,
      invoiceId: invoiceId || "", // Vincula ao invoice se fornecido
      studentId,
      studentName,
      studentEmail,
      eventName: eventName || "Evento CDMF",
      eventDate,
      voucherCode,
      status: "valid",
      createdAt: Date.now(),
      eventId: eventId, // Adiciona eventId para facilitar busca
    };

    await setDoc(doc(db, "vouchers", voucherId), voucher);
    return voucher as BaileVoucher;
  }

  // Função auxiliar para buscar vouchers por evento e aluno (apenas válidos)
  async function findEventVouchers(eventId: string, studentId: string, eventName: string): Promise<(BaileVoucher & { eventId?: string })[]> {
    const vouchersRef = collection(db, "vouchers");
    
    // Primeiro tenta buscar por eventId se o campo existir (apenas válidos)
    try {
      const qWithEventId = query(
        vouchersRef,
        where("studentId", "==", studentId),
        where("eventId", "==", eventId),
        where("status", "==", "valid")
      );
      const snapWithEventId = await getDocs(qWithEventId);
      if (!snapWithEventId.empty) {
        return snapWithEventId.docs.map(d => d.data() as BaileVoucher & { eventId?: string });
      }
    } catch (e) {
      // Se o campo eventId não existir em alguns vouchers antigos ou a query falhar, continua
      console.debug("[AuthContext] Erro ao buscar vouchers por eventId:", e);
    }
    
    // Fallback: busca por eventName (apenas válidos)
    try {
      const q = query(
        vouchersRef,
        where("studentId", "==", studentId),
        where("eventName", "==", eventName),
        where("status", "==", "valid")
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data() as BaileVoucher & { eventId?: string });
    } catch (e) {
      console.debug("[AuthContext] Erro ao buscar vouchers por eventName:", e);
      return [];
    }
  }

  async function confirmStudentToEvent(eventId: string, studentId: string): Promise<void> {
    if (!profileRef.current || profileRef.current.role !== "master") {
      throw new Error("Apenas o administrador pode confirmar alunos em eventos");
    }

    const eventRef = doc(db, "events", eventId);
    const eventSnap = await getDoc(eventRef);
    
    if (!eventSnap.exists()) {
      throw new Error("Evento não encontrado");
    }

    const eventData = eventSnap.data() as Event;
    
    // Busca dados do aluno
    const studentRef = doc(db, "profiles", studentId);
    const studentSnap = await getDoc(studentRef);
    const studentData = studentSnap.exists() ? studentSnap.data() as Profile : null;
    const studentName = studentData?.name || "Aluno";
    const studentEmail = studentData?.email || "";
    
    // Remove da lista de espera se estiver lá
    const newWaitlist = eventData.waitlistStudentIds.filter(id => id !== studentId);
    
    // Adiciona à lista de confirmados se não estiver
    const newConfirmed = eventData.confirmedStudentIds.includes(studentId)
      ? eventData.confirmedStudentIds
      : [...eventData.confirmedStudentIds, studentId];

    await updateDoc(eventRef, {
      confirmedStudentIds: newConfirmed,
      waitlistStudentIds: newWaitlist,
      updatedAt: Date.now(),
    });

    // Quando um aluno é adicionado manualmente pelo administrador através do modal "Participantes",
    // cria automaticamente uma fatura/ingresso (se o evento requer pagamento) e gera o voucher diretamente (sem necessidade de pagamento)
    
    // Verifica se já existe voucher válido para este evento e aluno
    const existingVouchers = await findEventVouchers(eventId, studentId, eventData.name);
    
    console.log(`[confirmStudentToEvent] Vouchers existentes para evento ${eventId} e aluno ${studentId}:`, existingVouchers.length);
    
    if (existingVouchers.length === 0) {
      try {
        let invoiceId: string | undefined;
        
        // Cria fatura apenas se o evento requer pagamento ou tiver preço definido
        if (eventData.requiresPayment || eventData.price) {
          // Verifica se já existe uma fatura de ingresso para este evento e aluno
          const invoicesRef = collection(db, "invoices");
          const invoiceQuery = query(
            invoicesRef,
            where("studentId", "==", studentId),
            where("description", "==", `Ingresso: ${eventData.name}${eventData.time ? ` - ${eventData.time}` : ""}${eventData.location ? ` - ${eventData.location}` : ""}`)
          );
          const invoiceSnap = await getDocs(invoiceQuery);
          const existingInvoice = invoiceSnap.empty ? null : invoiceSnap.docs[0].data() as Invoice;
          
          // Se não existe fatura, cria uma nova fatura de ingresso
          if (!existingInvoice) {
            const invoiceIdNew = generateId("INV");
            const invoiceAmount = eventData.price || 0; // Usa o preço do evento, ou 0 se não tiver
            
            const invoice: Invoice = {
              id: invoiceIdNew,
              studentId,
              studentName,
              studentEmail,
              amount: invoiceAmount,
              originalAmount: invoiceAmount,
              discountAmount: 0,
              description: `Ingresso: ${eventData.name}${eventData.time ? ` - ${eventData.time}` : ""}${eventData.location ? ` - ${eventData.location}` : ""}`,
              dueDate: eventData.date,
              lateDueDate: eventData.date,
              status: "paid" as PaymentStatus, // Marca como pago automaticamente (voucher direto, sem pagamento)
              referenceMonth: eventData.date.substring(0, 7),
              classIds: [],
              classCount: 0,
              type: (eventData.type === "baile" ? "baile" : eventData.type === "workshop" ? "workshop" : "outro") as InvoiceType,
              createdAt: Date.now(),
              createdBy: profileRef.current?.uid || "",
              paidAt: Date.now(),
              paidMethod: "cash" as PaymentMethod, // Método "cash" indica adição manual/voucher direto
              updatedAt: Date.now(),
            };

            await setDoc(doc(db, "invoices", invoiceIdNew), invoice);
            invoiceId = invoiceIdNew;
            
            console.log(`[confirmStudentToEvent] Fatura de ingresso criada:`, invoiceIdNew);
          } else {
            invoiceId = existingInvoice.id;
            // Se a fatura existe mas não está paga, marca como paga
            if (existingInvoice.status !== "paid") {
              await updateDoc(doc(db, "invoices", invoiceId), {
                status: "paid" as PaymentStatus,
                paidAt: Date.now(),
                paidMethod: "cash" as PaymentMethod,
                updatedAt: Date.now(),
              });
              console.log(`[confirmStudentToEvent] Fatura existente marcada como paga:`, invoiceId);
            }
          }
        }

        // Cria o voucher e vincula à fatura (se existir)
        console.log(`[confirmStudentToEvent] Criando voucher para evento ${eventId} e aluno ${studentId}`);
        const voucher = await createEventVoucher(
          eventId,
          eventData.name,
          eventData.date,
          studentId,
          studentName,
          studentEmail,
          invoiceId
        );
        
        // Atualiza a fatura com o voucherId (se existir)
        if (invoiceId) {
          await updateDoc(doc(db, "invoices", invoiceId), {
            voucherId: voucher.id,
            updatedAt: Date.now(),
          });
        }
        
        console.log(`[confirmStudentToEvent] Voucher criado com sucesso:`, voucher.id, voucher.voucherCode);

        // Envia notificação para o aluno sobre o voucher (sem abrir modal de convite)
        if (studentSnap.exists() && studentData && !studentData.isOffline) {
          const existingNotifications = studentData.pendingNotifications || [];
          
          // Remove notificações de convite para este evento (evita abrir modal)
          const filteredNotifications = existingNotifications.filter(
            n => !(
              (n.type === "event_invitation" || n.type === "reminder") && 
              (n.eventId === eventId || n.voucherId === eventId)
            )
          );
          
          // Notificação informativa (não dispara modal de convite)
          const voucherNotification: PaymentNotification = {
            id: generateId("NOTIF"),
            type: "voucher", // Tipo "voucher" não dispara modal de convite
            title: "🎉 Ingresso Gerado - Acesso Confirmado!",
            message: `Você foi adicionado ao evento "${eventData.name}"! Seu voucher: ${voucher.voucherCode}. Apresente este código na entrada.`,
            eventId: eventId,
            voucherId: voucher.id,
            voucherCode: voucher.voucherCode,
            invoiceId: invoiceId,
            createdAt: Date.now(),
            createdBy: profileRef.current?.uid || "",
          };

          await updateDoc(studentRef, {
            pendingNotifications: [...filteredNotifications, voucherNotification],
          });
        }
      } catch (voucherError) {
        console.error("Erro ao criar fatura/voucher para evento:", voucherError);
        // Não falha a operação se houver erro no voucher, mas loga o erro
      }
    } else {
      // Se já existe voucher, apenas remove notificações de convite
      if (studentSnap.exists() && studentData && !studentData.isOffline) {
        try {
          const existingNotifications = studentData.pendingNotifications || [];
          const filteredNotifications = existingNotifications.filter(
            n => !(
              (n.type === "event_invitation" || n.type === "reminder") && 
              (n.eventId === eventId || n.voucherId === eventId)
            )
          );
          
          // Notificação informativa (não dispara modal)
          const confirmationNotification: PaymentNotification = {
            id: generateId("NOTIF"),
            type: "payment_confirmed", // Tipo que não dispara modal de convite
            title: "✅ Presença Confirmada no Evento",
            message: `Sua presença foi confirmada no evento "${eventData.name}"! Te esperamos lá!`,
            eventId: eventId,
            createdAt: Date.now(),
            createdBy: profileRef.current?.uid || "",
          };

          await updateDoc(studentRef, {
            pendingNotifications: [...filteredNotifications, confirmationNotification],
          });
        } catch (notifError) {
          console.warn("Erro ao notificar aluno sobre confirmação:", notifError);
        }
      }
    }

    // Cria atividade para o administrador sobre confirmação de presença
    try {
      const activityId = `ACT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await setDoc(doc(db, "activities", activityId), {
        id: activityId,
        type: "event_updated",
        title: "🎉 Presença Confirmada no Evento",
        description: `${studentName} foi adicionado manualmente ao evento "${eventData.name}"`,
        timestamp: Date.now(),
        metadata: {
          studentId: studentId,
          studentName: studentName,
        },
        read: false,
        createdBy: profileRef.current?.uid || "",
      });
    } catch (activityError) {
      console.warn("Erro ao criar atividade de confirmação de presença:", activityError);
    }
  }

  async function cancelStudentFromEvent(eventId: string, studentId: string): Promise<void> {
    if (!profileRef.current || profileRef.current.role !== "master") {
      throw new Error("Apenas o administrador pode cancelar confirmações");
    }

    const eventRef = doc(db, "events", eventId);
    const eventSnap = await getDoc(eventRef);
    
    if (!eventSnap.exists()) {
      throw new Error("Evento não encontrado");
    }

    const eventData = eventSnap.data() as Event;
    
    // Busca dados do aluno para notificar
    const studentRef = doc(db, "profiles", studentId);
    const studentSnap = await getDoc(studentRef);
    const studentData = studentSnap.exists() ? studentSnap.data() as Profile : null;
    const studentName = studentData?.name || "Aluno";
    
    // Remove das listas
    const newConfirmed = eventData.confirmedStudentIds.filter(id => id !== studentId);
    const newWaitlist = eventData.waitlistStudentIds.filter(id => id !== studentId);

    await updateDoc(eventRef, {
      confirmedStudentIds: newConfirmed,
      waitlistStudentIds: newWaitlist,
      updatedAt: Date.now(),
    });

    // Remove vouchers relacionados ao evento (sem invoice, adicionados manualmente)
    try {
      const vouchers = await findEventVouchers(eventId, studentId, eventData.name);
      for (const voucher of vouchers) {
        // Só remove vouchers sem invoice (adicionados manualmente) ou que não foram usados
        if (!voucher.invoiceId && voucher.status === "valid") {
          await deleteDoc(doc(db, "vouchers", voucher.id));
        } else if (voucher.status === "valid") {
          // Se tem invoice mas não foi usado, cancela em vez de deletar
          await updateDoc(doc(db, "vouchers", voucher.id), {
            status: "cancelled",
          });
        }
      }
    } catch (voucherError) {
      console.warn("Erro ao remover vouchers do evento:", voucherError);
    }

    // Remove invoices pendentes relacionadas ao evento (mas mantém transações/receitas se já foram pagas)
    try {
      const invoicesRef = collection(db, "invoices");
      const invoicesQuery = query(
        invoicesRef,
        where("studentId", "==", studentId),
        where("status", "in", ["pending", "overdue"])
      );
      const invoicesSnap = await getDocs(invoicesQuery);
      
      for (const invoiceDoc of invoicesSnap.docs) {
        const invoice = invoiceDoc.data();
        // Verifica se a invoice está relacionada a este evento
        if (invoice.description?.includes(`Ingresso: ${eventData.name}`) || 
            invoice.description?.includes(eventData.name) ||
            invoice.type === "baile" || invoice.type === "workshop" || invoice.type === "outro") {
          // Só remove se estiver pendente (não remove se já foi paga, para manter receitas)
          if (invoice.status === "pending" || invoice.status === "overdue") {
            await deleteDoc(doc(db, "invoices", invoice.id));
          }
        }
      }
    } catch (invoiceError) {
      console.warn("Erro ao remover invoices do evento:", invoiceError);
    }
    
    // Remove notificações relacionadas ao evento do perfil do aluno
    if (studentSnap.exists() && studentData && !studentData.isOffline) {
      try {
        const existingNotifications = studentData.pendingNotifications || [];
        const filteredNotifications = existingNotifications.filter(
          n => !(
            (n.type === "event_invitation" || n.type === "voucher" || n.type === "reminder") &&
            (n.eventId === eventId || n.voucherId === eventId)
          )
        );

        // Adiciona notificação de remoção (não dispara modal de convite)
        const removalNotification: PaymentNotification = {
          id: `NOTIF_${Date.now()}`,
          type: "payment_confirmed", // Tipo que não dispara modal de convite
          title: "ℹ️ Removido do Evento",
          message: `Você foi removido do evento "${eventData.name}". Se tiver dúvidas, entre em contato com a administração.`,
          eventId: eventId,
          createdAt: Date.now(),
          createdBy: profileRef.current?.uid || "",
        };

        await updateDoc(studentRef, {
          pendingNotifications: [...filteredNotifications, removalNotification],
        });
      } catch (notifError) {
        console.warn("Erro ao notificar aluno sobre remoção do evento:", notifError);
      }
    }
    
    // Cria atividade para o administrador sobre remoção de aluno
    try {
      const activityId = `ACT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await setDoc(doc(db, "activities", activityId), {
        id: activityId,
        type: "event_updated",
        title: "👤 Aluno Removido do Evento",
        description: `${studentName} foi removido do evento "${eventData.name}"`,
        timestamp: Date.now(),
        metadata: {
          studentId: studentId,
          studentName: studentName,
        },
        read: false,
        createdBy: profileRef.current?.uid || "",
      });
    } catch (activityError) {
      console.warn("Erro ao criar atividade de remoção de aluno:", activityError);
    }
  }

  async function sendEventNotification(eventId: string, notificationType: "reminder" | "confirmation" | "cancellation"): Promise<void> {
    if (!profileRef.current || profileRef.current.role !== "master") {
      throw new Error("Apenas o administrador pode enviar notificações");
    }

    const eventRef = doc(db, "events", eventId);
    const eventSnap = await getDoc(eventRef);
    
    if (!eventSnap.exists()) {
      throw new Error("Evento não encontrado");
    }

    const eventData = eventSnap.data() as Event;
    const studentsRef = collection(db, "profiles");
    
    // Busca dados dos alunos confirmados
    const studentIds = eventData.confirmedStudentIds;
    if (studentIds.length === 0) {
      return;
    }

    const students: Profile[] = [];
    for (const studentId of studentIds) {
      try {
        const studentDoc = await getDoc(doc(studentsRef, studentId));
        if (studentDoc.exists()) {
          const studentData = studentDoc.data() as Profile;
          if (!studentData.isOffline) {
            students.push(studentData);
          }
        }
      } catch (e) {
        console.warn(`Erro ao buscar aluno ${studentId}:`, e);
      }
    }

    // Envia notificação para cada aluno
    const now = Date.now();
    for (const student of students) {
      try {
        const notifications: PaymentNotification[] = student.pendingNotifications || [];
        
        let title = "";
        let message = "";
        
        switch (notificationType) {
          case "reminder":
            title = `Lembrete: ${eventData.name}`;
            const reminderDate = new Date(eventData.date + (eventData.time ? `T${eventData.time}` : "T12:00")).toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric"
            });
            message = `Não esqueça! O evento "${eventData.name}" acontece em ${reminderDate}${eventData.time ? ` às ${eventData.time}` : ""}.`;
            break;
          case "confirmation":
            title = `Confirmação: ${eventData.name}`;
            message = `Sua participação no evento "${eventData.name}" foi confirmada!`;
            break;
          case "cancellation":
            title = `Cancelamento: ${eventData.name}`;
            message = `Sua participação no evento "${eventData.name}" foi cancelada.`;
            break;
        }

        const notification: PaymentNotification = {
          id: `NOTIF_${now}_${Math.random().toString(36).substr(2, 9)}`,
          type: notificationType === "reminder" ? "reminder" : "voucher", // Usa tipo reminder para lembretes
          title,
          message,
          createdAt: now,
          createdBy: profileRef.current?.uid || "",
          voucherId: eventId, // ID do evento para identificação
          eventId: eventId, // ID do evento
        };

        await updateDoc(doc(studentsRef, student.uid), {
          pendingNotifications: [...notifications, notification],
        });
      } catch (e) {
        console.warn(`Erro ao enviar notificação para ${student.name}:`, e);
      }
    }
  }

  // Função auxiliar para formatar data para exibição
  function formatDateDisplay(dateStr: string): string {
    try {
      const [year, month, day] = dateStr.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch (e) {
      return dateStr;
    }
  }

  // Envia convites de evento para alunos (com filtros opcionais)
  async function sendEventInvitations(eventId: string, filters?: { studentIds?: string[]; gender?: "masculino" | "feminino"; classIds?: string[] }): Promise<number> {
    // Busca o profile atual do usuário logado
    const currentUser = auth.currentUser;
    console.log("[sendEventInvitations] CurrentUser:", currentUser ? currentUser.uid : "null");
    console.log("[sendEventInvitations] Profile from context:", profileRef.current ? `${profileRef.current.name} (${profileRef.current.role})` : "null");

    if (!currentUser) {
      console.error("[sendEventInvitations] Nenhum usuário logado");
      throw new Error("Você precisa estar logado para enviar convites");
    }

    // Busca o profile atualizado do Firestore
    const profileDoc = await getDoc(doc(db, "profiles", currentUser.uid));
    if (!profileDoc.exists()) {
      console.error("[sendEventInvitations] Profile não encontrado no Firestore");
      throw new Error("Perfil não encontrado");
    }

    const currentProfile = profileDoc.data() as Profile;
    console.log("[sendEventInvitations] Profile do Firestore:", currentProfile.name, currentProfile.role);

    if (currentProfile.role !== "master") {
      console.error("[sendEventInvitations] Permissão negada. Role:", currentProfile.role);
      throw new Error("Apenas o administrador pode enviar convites de eventos");
    }

    const eventRef = doc(db, "events", eventId);
    const eventSnap = await getDoc(eventRef);
    
    if (!eventSnap.exists()) {
      throw new Error("Evento não encontrado");
    }

    const eventData = eventSnap.data() as Event;
    const studentsRef = collection(db, "profiles");
    
    let students: Profile[] = [];
    
    // Se foram fornecidos IDs específicos, busca apenas esses alunos
    if (filters?.studentIds && filters.studentIds.length > 0) {
      for (const studentId of filters.studentIds) {
        try {
          const studentDoc = await getDoc(doc(studentsRef, studentId));
          if (studentDoc.exists()) {
            const studentData = studentDoc.data() as Profile;
            if (studentData.role === "student" && studentData.active !== false && !studentData.isOffline && studentData.enrollmentStatus !== "inativo") {
              students.push(studentData);
            }
          }
        } catch (e) {
          console.warn(`Erro ao buscar aluno ${studentId}:`, e);
        }
      }
    } else {
      // Busca todos os alunos (role === "student")
      // Filtra no cliente porque alunos podem não ter campo "active" definido
      const q = query(
        studentsRef,
        where("role", "==", "student")
      );
      const studentsSnap = await getDocs(q);
      
      console.log(`[EventInvitations] Total de alunos encontrados na query: ${studentsSnap.docs.length}`);
      
      students = studentsSnap.docs
        .map(d => d.data() as Profile)
        .filter(s => {
          // Aluno ativo: active !== false (aceita undefined ou true)
          // Não é offline
          // Status de matrícula não é "inativo"
          const isActive = s.active !== false;
          const isNotOffline = !s.isOffline;
          const isEnrolled = s.enrollmentStatus !== "inativo";
          
          const isValid = isActive && isNotOffline && isEnrolled;
          if (!isValid) {
            console.log(`[EventInvitations] Aluno ${s.name} filtrado: active=${s.active}, isOffline=${s.isOffline}, enrollmentStatus=${s.enrollmentStatus}`);
          }
          return isValid;
        });
      
      console.log(`[EventInvitations] Alunos válidos após filtros: ${students.length}`);
    }
    
    // Aplica filtros adicionais
    if (filters?.gender) {
      students = students.filter(s => s.gender === filters.gender);
    }
    
    if (filters?.classIds && filters.classIds.length > 0) {
      students = students.filter(s => {
        if (!s.classes || s.classes.length === 0) return false;
        return filters.classIds!.some(classId => s.classes?.includes(classId));
      });
    }

    if (students.length === 0) {
      return 0;
    }

    const now = Date.now();
    let invitationsSent = 0;

    for (const student of students) {
      try {
        const notifications: PaymentNotification[] = student.pendingNotifications || [];
        
        // Remove convite antigo se existir (para permitir reenvio)
        const filteredNotifications = notifications.filter(
          n => !(n.type === "event_invitation" && n.voucherId === eventId)
        );

        const notification: PaymentNotification = {
          id: `NOTIF_${now}_${Math.random().toString(36).substr(2, 9)}`,
          type: "event_invitation",
          title: `Convite: ${eventData.name}`,
          message: `Você foi convidado para o evento "${eventData.name}"${eventData.date ? ` em ${formatDateDisplay(eventData.date)}` : ""}${eventData.time ? ` às ${eventData.time}` : ""}.`,
          createdAt: now,
          createdBy: currentProfile.uid,
          read: false,
          voucherId: eventId, // Usa voucherId para armazenar eventId
          voucherCode: eventData.name, // Usa voucherCode para nome do evento
        };

        // Adiciona o novo convite (reenviado ou novo) - sempre como não lido
        const updatedNotifications = [...filteredNotifications, notification];

        await updateDoc(doc(studentsRef, student.uid), {
          pendingNotifications: updatedNotifications,
        });

        console.log(`[EventInvitations] Convite enviado para ${student.name} (${student.uid}):`, notification.title);
        invitationsSent++;
      } catch (e) {
        console.warn(`Erro ao enviar convite para ${student.name}:`, e);
      }
    }

    return invitationsSent;
  }

  // Aluno confirma presença no evento
  async function confirmEventAttendance(eventId: string): Promise<void> {
    // Busca o usuário atual do Firebase Auth
    const currentUser = auth.currentUser;
    console.log("[confirmEventAttendance] CurrentUser:", currentUser ? currentUser.uid : "null");

    if (!currentUser) {
      throw new Error("Você precisa estar logado para confirmar presença");
    }

    // Busca o profile atualizado do Firestore
    const profileDoc = await getDoc(doc(db, "profiles", currentUser.uid));
    if (!profileDoc.exists()) {
      throw new Error("Perfil não encontrado");
    }

    const currentProfile = profileDoc.data() as Profile;
    console.log("[confirmEventAttendance] Profile:", currentProfile.name, currentProfile.role);

    if (currentProfile.role !== "student") {
      throw new Error("Apenas alunos podem confirmar presença em eventos");
    }

    const eventRef = doc(db, "events", eventId);
    const eventSnap = await getDoc(eventRef);

    if (!eventSnap.exists()) {
      throw new Error("Evento não encontrado");
    }

    const eventData = eventSnap.data() as Event;

    // Verifica se já está confirmado
    if (eventData.confirmedStudentIds.includes(currentProfile.uid)) {
      throw new Error("Você já está confirmado neste evento");
    }

    // Verifica se há vagas disponíveis
    if (eventData.maxParticipants && eventData.confirmedStudentIds.length >= eventData.maxParticipants) {
      // Adiciona à lista de espera
      const newWaitlist = eventData.waitlistStudentIds.includes(currentProfile.uid)
        ? eventData.waitlistStudentIds
        : [...eventData.waitlistStudentIds, currentProfile.uid];

      await updateDoc(eventRef, {
        waitlistStudentIds: newWaitlist,
        updatedAt: Date.now(),
      });

      throw new Error("Evento lotado. Você foi adicionado à lista de espera.");
    }

    // Adiciona à lista de confirmados
    const newConfirmed = [...eventData.confirmedStudentIds, currentProfile.uid];
    const newWaitlist = eventData.waitlistStudentIds.filter(id => id !== currentProfile.uid);

    await updateDoc(eventRef, {
      confirmedStudentIds: newConfirmed,
      waitlistStudentIds: newWaitlist,
      updatedAt: Date.now(),
    });

    // Remove a notificação de convite do perfil do aluno (não cria nova notificação para evitar modal)
    // Quando o aluno participa ativamente do evento, não deve aparecer o modal de convite
    const studentRef = doc(db, "profiles", currentProfile.uid);
    // Remove apenas as notificações de convite para este evento específico
    const filteredNotifications = (currentProfile.pendingNotifications || []).filter(
      n => !(n.type === "event_invitation" && (n.voucherId === eventId || n.eventId === eventId))
    );

    // Não cria nova notificação de confirmação para evitar que o modal de convite apareça
    // O status do evento na tela principal já será atualizado automaticamente
    await updateDoc(studentRef, {
      pendingNotifications: filteredNotifications,
    });

    // Cria atividade para o administrador sobre confirmação de presença
    try {
      const activityId = `ACT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await setDoc(doc(db, "activities", activityId), {
        id: activityId,
        type: "event_updated",
        title: "🎉 Presença Confirmada no Evento",
        description: `${currentProfile.name} confirmou presença no evento "${eventData.name}"`,
        timestamp: Date.now(),
        metadata: {
          studentId: currentProfile.uid,
          studentName: currentProfile.name,
        },
        read: false,
        createdBy: "system",
      });
    } catch (activityError) {
      console.warn("Erro ao criar atividade de confirmação de presença:", activityError);
    }
  }

  async function rejectEventAttendance(eventId: string): Promise<void> {
    // Busca o usuário atual do Firebase Auth
    const currentUser = auth.currentUser;
    console.log("[rejectEventAttendance] CurrentUser:", currentUser ? currentUser.uid : "null");

    if (!currentUser) {
      throw new Error("Você precisa estar logado para recusar presença");
    }

    // Busca o profile atualizado do Firestore
    const profileDoc = await getDoc(doc(db, "profiles", currentUser.uid));
    if (!profileDoc.exists()) {
      throw new Error("Perfil não encontrado");
    }

    const currentProfile = profileDoc.data() as Profile;
    console.log("[rejectEventAttendance] Profile:", currentProfile.name, currentProfile.role);

    if (currentProfile.role !== "student") {
      throw new Error("Apenas alunos podem recusar presença em eventos");
    }

    const eventRef = doc(db, "events", eventId);
    const eventSnap = await getDoc(eventRef);

    if (!eventSnap.exists()) {
      throw new Error("Evento não encontrado");
    }

    const eventData = eventSnap.data() as Event;

    // Remove da lista de confirmados se estiver lá
    const newConfirmed = eventData.confirmedStudentIds.filter(id => id !== currentProfile.uid);
    const newWaitlist = eventData.waitlistStudentIds.filter(id => id !== currentProfile.uid);

    await updateDoc(eventRef, {
      confirmedStudentIds: newConfirmed,
      waitlistStudentIds: newWaitlist,
      updatedAt: Date.now(),
    });

    // Remove todas as notificações relacionadas ao evento (convites, lembretes, confirmações, cancelamentos)
    const studentRef = doc(db, "profiles", currentProfile.uid);
    const filteredNotifications = (currentProfile.pendingNotifications || []).filter(
      n => {
        // Remove convites de evento
        if (n.type === "event_invitation" && (n.voucherId === eventId || n.eventId === eventId)) return false;
        // Remove lembretes relacionados ao evento
        if (n.type === "reminder" && (n.voucherId === eventId || n.eventId === eventId)) return false;
        // Remove outras notificações de evento (voucher, etc) relacionadas
        if (n.type === "voucher" && (n.voucherId === eventId || n.eventId === eventId)) return false;
        return true;
      }
    );
    await updateDoc(studentRef, {
      pendingNotifications: filteredNotifications,
    });

    // Remove qualquer cobrança relacionada ao evento se existir
    try {
      const invoicesRef = collection(db, "invoices");
      const invoicesQuery = query(
        invoicesRef,
        where("studentId", "==", currentProfile.uid),
        where("type", "in", ["baile", "outro"])
      );
      const invoicesSnap = await getDocs(invoicesQuery);

      for (const invoiceDoc of invoicesSnap.docs) {
        const invoiceData = invoiceDoc.data();
        // Verifica se a descrição contém o nome do evento ou se a data corresponde
        if (
          (invoiceData.description && invoiceData.description.includes(eventData.name)) ||
          (invoiceData.dueDate && invoiceData.dueDate === eventData.date)
        ) {
          // Se a fatura ainda está pendente, pode ser deletada
          if (invoiceData.status === "pending" || invoiceData.status === "overdue") {
            await deleteDoc(doc(db, "invoices", invoiceDoc.id));
          }
        }
      }
    } catch (invoiceError) {
      console.warn("Erro ao remover cobranças relacionadas:", invoiceError);
      // Não falha se não conseguir remover a cobrança
    }
  }

  // Confirma presença no evento após pagamento ser confirmado
  async function confirmEventAttendanceAfterPayment(invoiceId: string, studentId: string, eventName: string): Promise<void> {
    try {
      // Extrai o nome do evento da descrição (formato: "Ingresso: Nome do Evento - ...")
      let extractedEventName = eventName;
      if (eventName.startsWith("Ingresso: ")) {
        extractedEventName = eventName.substring(11).split(" - ")[0].trim();
      }

      // Busca o evento pelo nome
      const eventsRef = collection(db, "events");
      const eventsQuery = query(eventsRef, where("name", "==", extractedEventName));
      const eventsSnap = await getDocs(eventsQuery);

      if (eventsSnap.empty) {
        console.warn(`[confirmEventAttendanceAfterPayment] Evento "${extractedEventName}" não encontrado`);
        return;
      }

      const eventDoc = eventsSnap.docs[0];
      const eventData = eventDoc.data() as Event;
      const eventId = eventDoc.id;

      // Verifica se o aluno já está confirmado
      if (eventData.confirmedStudentIds.includes(studentId)) {
        console.log(`[confirmEventAttendanceAfterPayment] Aluno ${studentId} já está confirmado no evento ${eventId}`);
        return;
      }

      // Busca dados do aluno
      const studentRef = doc(db, "profiles", studentId);
      const studentSnap = await getDoc(studentRef);
      if (!studentSnap.exists()) {
        console.warn(`[confirmEventAttendanceAfterPayment] Aluno ${studentId} não encontrado`);
        return;
      }
      const studentData = studentSnap.data() as Profile;

      // Verifica se há vagas disponíveis
      if (eventData.maxParticipants && eventData.confirmedStudentIds.length >= eventData.maxParticipants) {
        // Adiciona à lista de espera
        const newWaitlist = eventData.waitlistStudentIds.includes(studentId)
          ? eventData.waitlistStudentIds
          : [...eventData.waitlistStudentIds, studentId];

        await updateDoc(doc(db, "events", eventId), {
          waitlistStudentIds: newWaitlist,
          updatedAt: Date.now(),
        });

        console.log(`[confirmEventAttendanceAfterPayment] Evento lotado, aluno ${studentId} adicionado à lista de espera`);
        return;
      }

      // Adiciona à lista de confirmados
      const newConfirmed = [...eventData.confirmedStudentIds, studentId];
      const newWaitlist = eventData.waitlistStudentIds.filter(id => id !== studentId);

      await updateDoc(doc(db, "events", eventId), {
        confirmedStudentIds: newConfirmed,
        waitlistStudentIds: newWaitlist,
        updatedAt: Date.now(),
      });

      // Remove notificações de convite do perfil do aluno
      const filteredNotifications = (studentData.pendingNotifications || []).filter(
        n => !(n.type === "event_invitation" && (n.voucherId === eventId || n.eventId === eventId))
      );

      await updateDoc(studentRef, {
        pendingNotifications: filteredNotifications,
      });

      // Cria atividade para o administrador sobre confirmação de presença após pagamento
      try {
        const activityId = `ACT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        await setDoc(doc(db, "activities", activityId), {
          id: activityId,
          type: "event_updated",
          title: "🎉 Presença Confirmada no Evento (Pagamento)",
          description: `${studentData.name || "Aluno"} confirmou presença no evento "${eventData.name}" após efetuar o pagamento do ingresso.`,
          timestamp: Date.now(),
          metadata: {
            eventId: eventId,
            eventName: eventData.name,
            studentId: studentId,
            studentName: studentData.name || "Aluno",
            invoiceId: invoiceId,
          },
          read: false,
          createdBy: "system",
        });
      } catch (activityError) {
        console.warn("Erro ao criar atividade de confirmação de presença após pagamento:", activityError);
      }

      console.log(`[confirmEventAttendanceAfterPayment] Presença confirmada: aluno ${studentId} no evento ${eventId}`);
    } catch (error) {
      console.error("[confirmEventAttendanceAfterPayment] Erro ao confirmar presença após pagamento:", error);
      // Não lança erro para não interromper o fluxo de pagamento
    }
  }

  async function logout() {
    // Reseta estados antes de deslogar
    setProfileDeleted(false);
    setProfile(null);
    profileExistedRef.current = false;
    currentUserUidRef.current = null;
    isCreatingProfileRef.current = false;
    await auth.signOut();
  }

  // Computed values - memoized to prevent unnecessary recalculations
  const role = profile?.role;
  const isMaster = useMemo(() => role === "master", [role]);
  const isTeacher = useMemo(() => role === "teacher", [role]);
  const isStudent = useMemo(() => role === "student", [role]);

  // Memoize auth state separately from actions
  const authState = useMemo(
    () => ({
      user,
      profile,
      loading,
      profileDeleted,
      isMaster,
      isTeacher,
      isStudent,
    }),
    [user, profile, loading, profileDeleted, isMaster, isTeacher, isStudent]
  );

  // All actions are stable references (defined once per mount)
  // They use closures that reference the latest state via refs or direct state
  const authActions = useMemo(
    () => ({
      teacherSignIn,
      logout,
      signOut: logout,
      createTeacher,
      deleteTeacher,
      createOfflineStudent,
      updateOfflineStudent,
      deleteOfflineStudent,
      deleteStudent,
      convertOfflineToOnline,
      findPossibleOfflineMatches,
      mergeOfflineWithOnline,
      fetchStudents,
      fetchTeachers,
      toggleTeacherActive,
      updateProfile,
      refreshProfile,
      // Turmas
      createClass,
      fetchClasses,
      updateClass,
      deleteClass,
      addStudentToClass,
      removeStudentFromClass,
      removeTeacherFromClass,
      removeTeacherFromAllClasses,
      getTeacherClasses,
      assignTeacherToClass,
      getClassesWithoutTeacher,
      // Presença
      recordAttendance,
      fetchAttendance,
      // Eventos
      createEvent,
      fetchEvents,
      updateEvent,
      deleteEvent,
      confirmStudentToEvent,
      cancelStudentFromEvent,
      sendEventNotification,
      sendEventInvitations,
      confirmEventAttendance,
      rejectEventAttendance,
      confirmEventAttendanceAfterPayment,
    }),
    [refreshProfile]
  );

  const value = useMemo(
    () => ({
      ...authState,
      ...authActions,
    }),
    [authState, authActions]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
