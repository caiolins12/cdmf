import React, { createContext, useContext, useState, useMemo } from "react";

// Contexto para navegação no desktop do estudante
export type StudentDesktopTab = "inicio" | "aulas" | "pagamentos" | "conta";

interface StudentDesktopNavContextType {
  activeTab: StudentDesktopTab;
  setActiveTab: (tab: StudentDesktopTab) => void;
}

const StudentDesktopNavContext = createContext<StudentDesktopNavContextType | null>(null);

export function useStudentDesktopNav() {
  const context = useContext(StudentDesktopNavContext);
  // Retorna null se não estiver dentro do provider
  // Quem usa deve verificar se é null antes de usar
  return context;
}

export function StudentDesktopNavigationProvider({ 
  children,
  initialTab = "inicio"
}: { 
  children: React.ReactNode;
  initialTab?: StudentDesktopTab;
}) {
  const [activeTab, setActiveTab] = useState<StudentDesktopTab>(initialTab);

  // Usa useMemo com dependências explícitas para evitar problemas de inicialização
  // setActiveTab é estável e não precisa estar nas dependências
  const value = useMemo<StudentDesktopNavContextType>(() => ({
    activeTab,
    setActiveTab,
  }), [activeTab]);

  return (
    <StudentDesktopNavContext.Provider value={value}>
      {children}
    </StudentDesktopNavContext.Provider>
  );
}

