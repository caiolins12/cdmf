import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

type ThemeMode = "light" | "dark";

interface ThemeColors {
  // Backgrounds
  bg: string;
  bgSecondary: string;
  bgCard: string;
  bgSidebar: string;
  bgHeader: string;
  bgInput: string;
  bgHover: string;
  
  // Text
  text: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  
  // Borders
  border: string;
  borderLight: string;
  
  // Brand
  purple: string;
  purpleLight: string;
  purpleDark: string;
  
  // Status
  success: string;
  successLight: string;
  warning: string;
  warningLight: string;
  danger: string;
  dangerLight: string;
  info: string;
  infoLight: string;
}

const lightTheme: ThemeColors = {
  bg: "#F8FAFC",
  bgSecondary: "#F1F5F9",
  bgCard: "#FFFFFF",
  bgSidebar: "#FFFFFF",
  bgHeader: "#FFFFFF",
  bgInput: "#F9FAFB",
  bgHover: "#F1F5F9",
  
  text: "#1E293B",
  textSecondary: "#475569",
  textMuted: "#94A3B8",
  textInverse: "#FFFFFF",
  
  border: "#E2E8F0",
  borderLight: "#F1F5F9",
  
  purple: "#7C3AED",
  purpleLight: "#F3E8FF",
  purpleDark: "#6D28D9",
  
  success: "#22C55E",
  successLight: "#DCFCE7",
  warning: "#F59E0B",
  warningLight: "#FEF3C7",
  danger: "#DC2626",
  dangerLight: "#FEE2E2",
  info: "#3B82F6",
  infoLight: "#DBEAFE",
};

const darkTheme: ThemeColors = {
  bg: "#0F172A",
  bgSecondary: "#1E293B",
  bgCard: "#1E293B",
  bgSidebar: "#1E293B",
  bgHeader: "#1E293B",
  bgInput: "#334155",
  bgHover: "#334155",
  
  text: "#F8FAFC",
  textSecondary: "#CBD5E1",
  textMuted: "#64748B",
  textInverse: "#0F172A",
  
  border: "#334155",
  borderLight: "#475569",
  
  purple: "#A78BFA",
  purpleLight: "#2E1065",
  purpleDark: "#8B5CF6",
  
  success: "#4ADE80",
  successLight: "#14532D",
  warning: "#FBBF24",
  warningLight: "#713F12",
  danger: "#F87171",
  dangerLight: "#7F1D1D",
  info: "#60A5FA",
  infoLight: "#1E3A5F",
};

interface ThemeContextType {
  theme: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  colors: lightTheme,
  isDark: false,
  toggleTheme: () => {},
  setTheme: () => {},
});

const THEME_STORAGE_KEY = "@cdmf_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("light");
  const [isLoaded, setIsLoaded] = useState(false);

  // Carregar tema salvo
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme === "dark" || savedTheme === "light") {
          setThemeState(savedTheme);
        }
      } catch (e) {
        console.log("Erro ao carregar tema:", e);
      } finally {
        setIsLoaded(true);
      }
    };
    loadTheme();
  }, []);

  // Salvar tema
  const setTheme = async (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch (e) {
      console.log("Erro ao salvar tema:", e);
    }
  };

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  const value = useMemo(() => ({
    theme,
    colors: theme === "dark" ? darkTheme : lightTheme,
    isDark: theme === "dark",
    toggleTheme,
    setTheme,
  }), [theme]);

  // Aplicar estilos globais na web
  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.body.style.backgroundColor = value.colors.bg;
      document.body.style.colorScheme = theme;
    }
  }, [theme, value.colors.bg]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}

export { lightTheme, darkTheme };
export type { ThemeColors, ThemeMode };

