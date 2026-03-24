import React, { createContext, useContext, useMemo, useState, useEffect } from "react";
import { Platform } from "react-native";

interface DesktopContextType {
  isDesktopMode: boolean;
  isDesktopWeb: boolean;
  isMobileWeb: boolean;
  isNative: boolean;
  width: number;
  height: number;
}

const isWeb = Platform.OS === "web";
const DESKTOP_BREAKPOINT = 1024;

// Obter dimensões iniciais de forma segura para web
const getInitialDimensions = () => {
  if (isWeb && typeof window !== "undefined") {
    return { 
      width: window.innerWidth || 1024, 
      height: window.innerHeight || 768 
    };
  }
  return { width: 375, height: 812 }; // Default mobile para native
};

const initialDimensions = getInitialDimensions();

const DesktopContext = createContext<DesktopContextType>({
  isDesktopMode: isWeb && initialDimensions.width >= DESKTOP_BREAKPOINT,
  isDesktopWeb: isWeb && initialDimensions.width >= DESKTOP_BREAKPOINT,
  isMobileWeb: isWeb && initialDimensions.width < DESKTOP_BREAKPOINT,
  isNative: !isWeb,
  width: initialDimensions.width,
  height: initialDimensions.height,
});

export function useDesktop(): DesktopContextType {
  return useContext(DesktopContext);
}

export function DesktopProvider({ children }: { children: React.ReactNode }) {
  const [dimensions, setDimensions] = useState(getInitialDimensions);

  useEffect(() => {
    if (!isWeb || typeof window === "undefined") return;

    // Atualizar dimensões imediatamente
    setDimensions({
      width: window.innerWidth,
      height: window.innerHeight,
    });

    // Listener para resize
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", handleResize);
    
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const value = useMemo(() => {
    const isDesktop = dimensions.width >= DESKTOP_BREAKPOINT;
    
    return {
      isDesktopMode: isWeb && isDesktop,
      isDesktopWeb: isWeb && isDesktop,
      isMobileWeb: isWeb && !isDesktop,
      isNative: !isWeb,
      width: dimensions.width,
      height: dimensions.height,
    };
  }, [dimensions.width, dimensions.height]);

  return (
    <DesktopContext.Provider value={value}>
      {children}
    </DesktopContext.Provider>
  );
}
