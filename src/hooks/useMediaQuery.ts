import { useState, useEffect } from "react";
import { Platform, Dimensions } from "react-native";

type Breakpoint = "mobile" | "tablet" | "desktop" | "wide";

interface MediaQueryResult {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isWide: boolean;
  width: number;
  height: number;
  breakpoint: Breakpoint;
}

const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
  wide: 1440,
};

const isWeb = Platform.OS === "web";

// Obter dimensões de forma segura
const getInitialDimensions = () => {
  try {
    const { width, height } = Dimensions.get("window");
    return { width: width || 1024, height: height || 768 };
  } catch {
    return { width: 1024, height: 768 };
  }
};

export function useMediaQuery(): MediaQueryResult {
  const [dimensions, setDimensions] = useState(getInitialDimensions);

  useEffect(() => {
    if (!isWeb) return;

    // Atualizar após montagem
    const current = Dimensions.get("window");
    if (current.width && current.height) {
      setDimensions({ width: current.width, height: current.height });
    }

    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      if (window.width && window.height) {
        setDimensions({ width: window.width, height: window.height });
      }
    });

    return () => subscription?.remove();
  }, []);

  const { width, height } = dimensions;

  const getBreakpoint = (): Breakpoint => {
    if (width >= BREAKPOINTS.wide) return "wide";
    if (width >= BREAKPOINTS.desktop) return "desktop";
    if (width >= BREAKPOINTS.tablet) return "tablet";
    return "mobile";
  };

  const breakpoint = getBreakpoint();

  return {
    isMobile: breakpoint === "mobile",
    isTablet: breakpoint === "tablet",
    isDesktop: breakpoint === "desktop" || breakpoint === "wide",
    isWide: breakpoint === "wide",
    width,
    height,
    breakpoint,
  };
}

export function useIsDesktop(): boolean {
  const { isDesktop } = useMediaQuery();
  return isWeb && isDesktop;
}

