import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { doc, getDoc, setDoc, collection, query, where, getDocs, updateDoc, deleteDoc, onSnapshot, arrayUnion } from "firebase/firestore";
import { auth, db, UnifiedUser } from "../services/firebase";

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
  type: "reminder" | "overdue" | "billing" | "payment_confirmed" | "class_added" | "class_removed" | "enrollment_inactive" | "pending_invoice"; // tipos de notificação
  title: string;
  message: string;
  invoiceId?: string;
  amount?: number;
  dueDate?: string;
  classId?: string; // ID da turma (para notificações de turma)
  className?: string; // Nome da turma (para notificações de turma)
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

// Credenciais do Mestre (em produção, use variáveis de ambiente)
const MASTER_CODE = "MASTER2025";
const MASTER_PASSWORD = "cdmf@admin123";

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
  
  // Rastreia se o perfil já existiu alguma vez nesta sessão
  const profileExistedRef = useRef(false);

  async function loadProfile(uid: string) {
    const ref = doc(db, "profiles", uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      setProfile(snap.data() as Profile);
      setProfileDeleted(false);
      profileExistedRef.current = true; // Marca que o perfil existiu
    } else {
      setProfile(null);
      // Só marca como deletado se o perfil JÁ EXISTIU antes
      // Usuários novos não têm perfil ainda, não é "deletado"
      if (profileExistedRef.current) {
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
    if (!user) return;

    const profileRef = doc(db, "profiles", user.uid);
    const unsubProfile = onSnapshot(profileRef, (snap) => {
      if (snap.exists()) {
        setProfile(snap.data() as Profile);
        setProfileDeleted(false);
        profileExistedRef.current = true; // Marca que o perfil existiu
      } else {
        setProfile(null);
        // Só marca como deletado se o perfil JÁ EXISTIU antes nesta sessão
        // Isso evita marcar usuários novos como "deletados"
        if (profileExistedRef.current) {
          setProfileDeleted(true);
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
        setUser(u);
        if (u) {
          // Garante que o perfil existe antes de carregar
          try {
            await ensureProfileForUser(u);
          } catch (profileError) {
            console.log("Erro ao criar perfil:", profileError);
            // Continua mesmo se falhar ao criar perfil
          }
          await loadProfile(u.uid);
        } else {
          setProfile(null);
          setProfileDeleted(false);
        }
      } catch (error) {
        console.log("Erro no auth state change:", error);
        setProfile(null);
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
      await checkAndMigrateProfile(u, existingProfile);
      return;
    }

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
    // Verifica se é o login mestre
    if (code.toUpperCase() === MASTER_CODE && password === MASTER_PASSWORD) {
      // Login mestre - cria ou usa conta especial
      const masterEmail = "master@cdmf.app";
      try {
        // Tenta fazer login com email do master
        await auth.signInWithEmailAndPassword(masterEmail, MASTER_PASSWORD);
        return { success: true };
      } catch (e: any) {
        console.log("Erro no login mestre:", e.code, e.message);
        
        // Se não existe, cria a conta
        if (e.code === "auth/user-not-found" || e.code === "auth/invalid-credential") {
          try {
            const cred = await auth.createUserWithEmailAndPassword(masterEmail, MASTER_PASSWORD);
            const masterProfile: Profile = {
              uid: cred.user.uid,
              role: "master",
              name: "Administrador",
              email: masterEmail,
              createdAt: Date.now(),
              active: true,
            };
            await setDoc(doc(db, "profiles", cred.user.uid), masterProfile);
            return { success: true };
          } catch (createError: any) {
            console.log("Erro ao criar conta master:", createError.code, createError.message);
            if (createError.code === "auth/email-already-in-use") {
              return { success: false, error: "Conta master existe mas a senha está incorreta. Contate o suporte." };
            }
            return { success: false, error: `Erro ao criar conta master: ${createError.message}` };
          }
        }
        
        if (e.code === "auth/wrong-password") {
          return { success: false, error: "Senha incorreta" };
        }
        return { success: false, error: `Erro: ${e.message}` };
      }
    }

    // Login de professor normal - busca pelo código
    try {
      const teachersRef = collection(db, "profiles");
      const q = query(
        teachersRef, 
        where("teacherCode", "==", code.toUpperCase()),
        where("role", "==", "teacher"),
        where("active", "==", true)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        return { success: false, error: "Código de professor não encontrado ou inativo" };
      }

      const teacherProfile = snap.docs[0].data() as Profile;
      
      // Faz login com o email do professor
      await auth.signInWithEmailAndPassword(teacherProfile.email, password);
      return { success: true };
    } catch (e: any) {
      if (e.code === "auth/wrong-password" || e.code === "auth/invalid-credential") {
        return { success: false, error: "Senha incorreta" };
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
    if (profile?.role !== "master") {
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
        createdBy: profile.uid,
        active: true,
        ...(phone ? { phone } : {}), // Só inclui se phone tiver valor
      };

      await setDoc(doc(db, "profiles", cred.user.uid), teacherProfile);

      // Reloga o master silenciosamente
      await auth.signInWithEmailAndPassword("master@cdmf.app", MASTER_PASSWORD);
      
      // Restaura o perfil e usuário do master
      setUser(auth.currentUser);
      await loadProfile(auth.currentUser!.uid);

      return { code: teacherCode, password: tempPassword };
    } catch (e: any) {
      // Se der erro, tenta relogar o master
      try {
        await auth.signInWithEmailAndPassword("master@cdmf.app", MASTER_PASSWORD);
        setUser(auth.currentUser);
        await loadProfile(auth.currentUser!.uid);
      } catch {}
      throw e;
    } finally {
      // Desativa flag
      isCreatingTeacher.current = false;
    }
  }

  // Deletar professor (apenas master pode fazer isso)
  async function deleteTeacher(teacherId: string): Promise<void> {
    if (profile?.role !== "master") {
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
    if (profile?.role !== "master" && profile?.role !== "teacher") {
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
      createdBy: profile.uid,
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
    if (profile?.role !== "master" && profile?.role !== "teacher") {
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
    if (profile?.role !== "master") {
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
    if (profile?.role !== "master") {
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
    if (profile?.role !== "master") {
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
    if (profile?.role !== "master") {
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
    if (profile?.role !== "master" && profile?.role !== "teacher") {
      throw new Error("Sem permissão para criar turmas");
    }

    const classId = `CLASS${Date.now()}`;
    const newClass: Class = {
      ...data,
      id: classId,
      createdAt: Date.now(),
    };

    await setDoc(doc(db, "classes", classId), newClass);
    return classId;
  }

  // Buscar todas as turmas
  async function fetchClasses(): Promise<Class[]> {
    try {
      const classesRef = collection(db, "classes");
      const snap = await getDocs(classesRef);
      const classes = snap.docs.map(doc => doc.data() as Class);
      return classes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch (e) {
      console.error("Erro ao buscar turmas:", e);
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
            createdBy: profile?.uid || "system",
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
          createdBy: profile?.uid || "system",
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
      createdBy: profile?.uid || "",
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

  async function logout() {
    // Reseta estados antes de deslogar
    setProfileDeleted(false);
    setProfile(null);
    profileExistedRef.current = false;
    await auth.signOut();
  }

  // Computed values
  const isMaster = profile?.role === "master";
  const isTeacher = profile?.role === "teacher";
  const isStudent = profile?.role === "student";

  const value = useMemo(
    () => ({ 
      user, 
      profile, 
      loading, 
      profileDeleted,
      isMaster,
      isTeacher,
      isStudent,
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
    }),
    [user, profile, loading, profileDeleted, isMaster, isTeacher, isStudent, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
