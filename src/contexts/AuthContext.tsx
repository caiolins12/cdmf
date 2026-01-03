import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { doc, getDoc, setDoc, collection, query, where, getDocs, updateDoc, deleteDoc } from "firebase/firestore";
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
  paymentStatus?: "em_dia" | "pendente" | "atrasado";
  enrollmentStatus?: "ativo" | "inativo"; // Status de matrícula
  classes?: string[]; // IDs das turmas
  // Dados pessoais (onboarding)
  birthDate?: string; // DD/MM/AAAA
  age?: number;
  gender?: string; // masculino, feminino, outro, prefiro_nao_informar
  dancePreference?: string; // condutor, conduzido, ambos
  onboardingCompleted?: boolean;
  phoneVerified?: boolean;
};

// Credenciais do Mestre (em produção, use variáveis de ambiente)
const MASTER_CODE = "MASTER2025";
const MASTER_PASSWORD = "cdmf@admin123";

type AuthContextType = {
  user: UnifiedUser | null;
  profile: Profile | null;
  loading: boolean;
  isMaster: boolean;
  isTeacher: boolean;
  isStudent: boolean;
  teacherSignIn: (code: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  signOut: () => Promise<void>;
  // Funções do Master
  createTeacher: (name: string, phone?: string) => Promise<{ code: string; password: string }>;
  deleteTeacher: (teacherId: string) => Promise<void>;
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

  async function loadProfile(uid: string) {
    const ref = doc(db, "profiles", uid);
    const snap = await getDoc(ref);
    if (snap.exists()) setProfile(snap.data() as Profile);
    else setProfile(null);
  }

  const refreshProfile = useCallback(async () => {
    if (user) {
      await loadProfile(user.uid);
    }
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
    
    // Monta o perfil base sem campos undefined
    const newProfile: Record<string, any> = {
      uid: u.uid,
      role: role,
      name: defaults?.name ?? u.displayName ?? "",
      email: defaults?.email ?? u.email ?? "",
      createdAt: Date.now(),
      active: true,
    };

    // Adiciona campos opcionais apenas se tiverem valor
    const phone = defaults?.phone ?? u.phoneNumber;
    if (phone) newProfile.phone = phone;

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
    }

    await setDoc(ref, newProfile as Profile);
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
    if (!classData.studentIds.includes(studentId)) {
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
      if (!currentClasses.includes(classId)) {
        await updateDoc(studentRef, {
          classes: [...currentClasses, classId],
        });
      }
    }
  }

  // Remover aluno da turma
  async function removeStudentFromClass(classId: string, studentId: string): Promise<void> {
    const classRef = doc(db, "classes", classId);
    const classSnap = await getDoc(classRef);
    
    if (!classSnap.exists()) throw new Error("Turma não encontrada");
    
    const classData = classSnap.data() as Class;
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
      isMaster,
      isTeacher,
      isStudent,
      teacherSignIn,
      logout, 
      signOut: logout,
      createTeacher,
      deleteTeacher,
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
    [user, profile, loading, isMaster, isTeacher, isStudent, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
