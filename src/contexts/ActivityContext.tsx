import React, { createContext, useContext, useCallback, useState, useEffect, useMemo } from "react";
import { doc, setDoc, collection, query, where, getDocs, orderBy, limit, onSnapshot, Timestamp, deleteDoc } from "firebase/firestore";
import { db } from "../services/firebase";
import { useAuth } from "./AuthContext";

// ==================== TIPOS ====================

export type ActivityType =
  | "payment"
  | "payment_generated"
  | "student_registered"
  | "student_enrolled"
  | "student_added_to_class"
  | "student_removed_from_class"
  | "student_profile_updated"
  | "class_created"
  | "class_attendance"
  | "invoice_generated"
  | "invoice_overdue"
  | "invoice_deleted"
  | "notification_sent"
  | "event_created"
  | "event_updated"
  | "system";

export type Activity = {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: number;
  metadata?: {
    studentId?: string;
    studentName?: string;
    teacherId?: string;
    teacherName?: string;
    classId?: string;
    className?: string;
    invoiceId?: string;
    amount?: number;
    presentCount?: number;
  };
  read?: boolean;
  createdBy?: string;
};

// Configuração de cores e ícones por tipo
export const ACTIVITY_CONFIG: Record<ActivityType, {
  icon: string;
  color: string;
  bgColor: string;
  label: string;
}> = {
  payment: { icon: "card", color: "#16A34A", bgColor: "#DCFCE7", label: "Pagamento" },
  payment_generated: { icon: "ticket", color: "#7C3AED", bgColor: "#EDE9FE", label: "Ingresso Gerado" },
  student_registered: { icon: "person-add", color: "#7C3AED", bgColor: "#EDE9FE", label: "Novo Aluno" },
  student_enrolled: { icon: "school", color: "#0891B2", bgColor: "#CFFAFE", label: "Matrícula" },
  student_added_to_class: { icon: "add-circle", color: "#059669", bgColor: "#D1FAE5", label: "Adicionado à Turma" },
  student_removed_from_class: { icon: "remove-circle", color: "#DC2626", bgColor: "#FEE2E2", label: "Removido da Turma" },
  student_profile_updated: { icon: "create", color: "#2563EB", bgColor: "#DBEAFE", label: "Perfil Atualizado" },
  class_created: { icon: "people", color: "#EA580C", bgColor: "#FED7AA", label: "Turma Criada" },
  class_attendance: { icon: "checkmark-done", color: "#0891B2", bgColor: "#CFFAFE", label: "Chamada" },
  invoice_generated: { icon: "receipt", color: "#7C3AED", bgColor: "#EDE9FE", label: "Cobrança" },
  invoice_overdue: { icon: "warning", color: "#DC2626", bgColor: "#FEE2E2", label: "Atraso" },
  invoice_deleted: { icon: "trash", color: "#DC2626", bgColor: "#FEE2E2", label: "Cobrança Removida" },
  notification_sent: { icon: "notifications", color: "#F59E0B", bgColor: "#FEF3C7", label: "Notificação" },
  event_created: { icon: "calendar", color: "#7C3AED", bgColor: "#EDE9FE", label: "Evento Criado" },
  event_updated: { icon: "create", color: "#2563EB", bgColor: "#DBEAFE", label: "Evento Atualizado" },
  system: { icon: "information-circle", color: "#64748B", bgColor: "#F1F5F9", label: "Sistema" },
};

// ==================== CONTEXTO ====================

type ActivityContextType = {
  activities: Activity[];
  unreadCount: number;
  loading: boolean;
  logActivity: (data: Omit<Activity, "id" | "timestamp" | "createdBy">) => Promise<void>;
  fetchActivities: (limitCount?: number) => Promise<Activity[]>;
  markAsRead: (activityId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearOldActivities: (daysOld?: number) => Promise<number>;
  clearAllActivities: () => Promise<number>;
  subscribeToActivities: (callback: (activities: Activity[]) => void, limitCount?: number) => () => void;
};

const ActivityContext = createContext<ActivityContextType>({} as ActivityContextType);

// ==================== FUNÇÕES AUXILIARES ====================

export function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (minutes < 1) return "Agora";
  if (minutes < 60) return `Há ${minutes} min`;
  if (hours < 24) return `Há ${hours}h`;
  if (days === 1) return "Ontem";
  if (days < 7) return `Há ${days} dias`;
  
  return new Date(timestamp).toLocaleDateString("pt-BR", { 
    day: "2-digit", 
    month: "short" 
  });
}

// ==================== PROVIDER ====================

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  // Calcula não lidas - memoized para evitar recálculo desnecessário
  const unreadCount = useMemo(
    () => activities.filter(a => !a.read).length,
    [activities]
  );

  // Registra nova atividade
  const logActivity = useCallback(async (
    data: Omit<Activity, "id" | "timestamp" | "createdBy">
  ): Promise<void> => {
    if (!profile) return;

    const activityRef = doc(collection(db, "activities"));
    const activity: Activity = {
      ...data,
      id: activityRef.id,
      timestamp: Date.now(),
      createdBy: profile.uid,
      read: false,
    };

    await setDoc(activityRef, activity);
  }, [profile]);

  // Busca atividades
  const fetchActivities = useCallback(async (limitCount: number = 50): Promise<Activity[]> => {
    if (!profile) return [];

    const activitiesRef = collection(db, "activities");
    let q;

    if (profile.role === "student") {
      // Aluno vê apenas atividades criadas por ele
      q = query(
        activitiesRef,
        where("createdBy", "==", profile.uid),
        orderBy("timestamp", "desc"),
        limit(limitCount)
      );
    } else if (profile.role === "teacher") {
      // Professor vê atividades criadas por ele
      q = query(
        activitiesRef,
        where("createdBy", "==", profile.uid),
        orderBy("timestamp", "desc"),
        limit(limitCount)
      );
    } else {
      // Master: busca todas as atividades recentes
      q = query(
        activitiesRef,
        orderBy("timestamp", "desc"),
        limit(limitCount * 2) // Buscamos mais para compensar filtro
      );
    }

    const snapshot = await getDocs(q);
    let activities = snapshot.docs.map(doc => doc.data() as Activity);

    // Filtra atividades pessoais de alunos para o master
    if (profile.role === "master") {
      // Remove atividades que são claramente pessoais de alunos
      // Identificamos como pessoais: atividades criadas por alunos com tipos específicos
      const personalActivityTypes: ActivityType[] = [
        "event_updated",      // "Seu voucher foi gerado", "Presença confirmada"
        "payment_generated",  // "Ingresso gerado" (pessoal do aluno)
      ];

      activities = activities.filter(activity => {
        // Mantém atividades que NÃO são pessoais
        // Ou seja, remove se for tipo pessoal E o título contém pronomes de primeira pessoa
        const isPersonalType = personalActivityTypes.includes(activity.type);
        const hasPersonalLanguage =
          activity.title.toLowerCase().includes("seu ") ||
          activity.title.toLowerCase().includes("sua ") ||
          activity.description?.toLowerCase().includes("seu ") ||
          activity.description?.toLowerCase().includes("sua ");

        // Remove apenas se for tipo pessoal E tiver linguagem pessoal
        return !(isPersonalType && hasPersonalLanguage);
      }).slice(0, limitCount); // Limita ao número solicitado após filtro
    }

    return activities;
  }, [profile]);

  // Listener em tempo real
  const subscribeToActivities = useCallback((
    callback: (activities: Activity[]) => void,
    limitCount: number = 50
  ): () => void => {
    if (!profile) {
      callback([]);
      return () => {};
    }

    const activitiesRef = collection(db, "activities");
    let q;

    if (profile.role === "student") {
      // Aluno vê apenas atividades criadas por ele
      q = query(
        activitiesRef,
        where("createdBy", "==", profile.uid),
        orderBy("timestamp", "desc"),
        limit(limitCount)
      );
    } else if (profile.role === "teacher") {
      // Professor vê atividades criadas por ele
      q = query(
        activitiesRef,
        where("createdBy", "==", profile.uid),
        orderBy("timestamp", "desc"),
        limit(limitCount)
      );
    } else {
      // Master: busca todas as atividades recentes
      q = query(
        activitiesRef,
        orderBy("timestamp", "desc"),
        limit(limitCount * 2) // Buscamos mais para compensar filtro
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let activityList = snapshot.docs.map(doc => doc.data() as Activity);

      // Filtra atividades pessoais de alunos para o master
      if (profile.role === "master") {
        const personalActivityTypes: ActivityType[] = [
          "event_updated",      // "Seu voucher foi gerado", "Presença confirmada"
          "payment_generated",  // "Ingresso gerado" (pessoal do aluno)
        ];

        activityList = activityList.filter(activity => {
          // Mantém atividades que NÃO são pessoais
          const isPersonalType = personalActivityTypes.includes(activity.type);
          const hasPersonalLanguage =
            activity.title.toLowerCase().includes("seu ") ||
            activity.title.toLowerCase().includes("sua ") ||
            activity.description?.toLowerCase().includes("seu ") ||
            activity.description?.toLowerCase().includes("sua ");

          // Remove apenas se for tipo pessoal E tiver linguagem pessoal
          return !(isPersonalType && hasPersonalLanguage);
        }).slice(0, limitCount); // Limita ao número solicitado após filtro
      }

      callback(activityList);
    }, (error) => {
      console.error("Erro no listener de atividades:", error);
    });

    return unsubscribe;
  }, [profile]);

  // Marca como lida
  const markAsRead = useCallback(async (activityId: string): Promise<void> => {
    const activityRef = doc(db, "activities", activityId);
    await setDoc(activityRef, { read: true }, { merge: true });
  }, []);

  // Marca todas como lidas
  const markAllAsRead = useCallback(async (): Promise<void> => {
    const unreadActivities = activities.filter(a => !a.read);
    await Promise.all(
      unreadActivities.map(a => markAsRead(a.id))
    );
  }, [activities, markAsRead]);

  // Remove atividades antigas
  const clearOldActivities = useCallback(async (daysOld: number = 30): Promise<number> => {
    const cutoffDate = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    const activitiesRef = collection(db, "activities");
    const q = query(
      activitiesRef,
      where("timestamp", "<", cutoffDate)
    );

    const snapshot = await getDocs(q);
    let deleted = 0;

    for (const docSnapshot of snapshot.docs) {
      await deleteDoc(doc(db, "activities", docSnapshot.id));
      deleted++;
    }

    return deleted;
  }, []);

  // Remove todas as atividades
  const clearAllActivities = useCallback(async (): Promise<number> => {
    const activitiesRef = collection(db, "activities");
    const snapshot = await getDocs(activitiesRef);
    let deleted = 0;

    for (const docSnapshot of snapshot.docs) {
      await deleteDoc(doc(db, "activities", docSnapshot.id));
      deleted++;
    }

    return deleted;
  }, []);

  // Use primitive values for dependencies to avoid unnecessary re-subscriptions
  const profileUid = profile?.uid;
  const profileRole = profile?.role;

  // Carrega atividades iniciais
  useEffect(() => {
    if (!profileUid || profileRole === "student") {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeToActivities((activityList) => {
      setActivities(activityList);
      setLoading(false);
    }, 100);

    return () => unsubscribe();
  }, [profileUid, profileRole, subscribeToActivities]);

  const value = React.useMemo(
    () => ({
      activities,
      unreadCount,
      loading,
      logActivity,
      fetchActivities,
      markAsRead,
      markAllAsRead,
      clearOldActivities,
      clearAllActivities,
      subscribeToActivities,
    }),
    [
      activities,
      unreadCount,
      loading,
      logActivity,
      fetchActivities,
      markAsRead,
      markAllAsRead,
      clearOldActivities,
      clearAllActivities,
      subscribeToActivities,
    ]
  );

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}

export function useActivity() {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error("useActivity must be used within <ActivityProvider>");
  return ctx;
}

