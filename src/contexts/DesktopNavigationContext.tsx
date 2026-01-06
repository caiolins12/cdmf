import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

export type DesktopTab = "inicio" | "alunos" | "professores" | "turmas" | "financeiro";

interface DesktopNavigationContextType {
  navigate: (routeName: string) => void;
  activeTab: DesktopTab;
  setActiveTab: (tab: DesktopTab) => void;
}

const DesktopNavigationContext = createContext<DesktopNavigationContextType | null>(null);

// Mapeamento de nomes de rota para tabs
const ROUTE_TO_TAB: Record<string, DesktopTab> = {
  "Inicio": "inicio",
  "Alunos": "alunos",
  "Professores": "professores",
  "Turmas": "turmas",
  "Financeiro": "financeiro",
};

export function useDesktopNavigation() {
  const context = useContext(DesktopNavigationContext);
  if (!context) {
    // Retorna um contexto padrão se não estiver dentro do provider
    return {
      navigate: () => {},
      activeTab: "inicio" as DesktopTab,
      setActiveTab: () => {},
    };
  }
  return context;
}

export function DesktopNavigationProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<DesktopTab>("inicio");

  const navigate = useCallback((routeName: string) => {
    const tab = ROUTE_TO_TAB[routeName];
    if (tab) {
      setActiveTab(tab);
    }
  }, []);

  // Usa useMemo com dependências explícitas para evitar problemas de inicialização
  // setActiveTab é estável e não precisa estar nas dependências
  const value = useMemo<DesktopNavigationContextType>(() => ({
    navigate,
    activeTab,
    setActiveTab,
  }), [navigate, activeTab]);

  return (
    <DesktopNavigationContext.Provider value={value}>
      {children}
    </DesktopNavigationContext.Provider>
  );
}

