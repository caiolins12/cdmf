import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

const CRITICAL_ASSET_URLS = [
  new URL("../../assets/cdmf-logo.png", import.meta.url).href,
  new URL("../../assets/google.png", import.meta.url).href,
];

function normalizeAssetUrl(uri: string): string {
  if (uri.startsWith("http")) {
    return uri;
  }

  if (uri.startsWith("/")) {
    return uri;
  }

  return `/${uri}`;
}

function getResolvedWebAssetUrls(assetUrls: string[]): string[] {
  return Array.from(new Set(assetUrls.map((url) => normalizeAssetUrl(url))));
}

function preloadImageLikeResource(url: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }

    const image = new window.Image();
    let settled = false;

    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    const timeout = window.setTimeout(finish, 6000);

    image.onload = () => {
      window.clearTimeout(timeout);
      finish();
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      finish();
    };
    image.src = url;

    if (image.complete) {
      window.clearTimeout(timeout);
      finish();
    }
  });
}

async function preloadWebAssets(
  onProgress: (value: number, status: string) => void
): Promise<void> {
  const assetUrls = getResolvedWebAssetUrls(CRITICAL_ASSET_URLS);
  if (assetUrls.length === 0) {
    onProgress(0.92, "Finalizando...");
    return;
  }

  let loaded = 0;
  onProgress(0.12, "Carregando recursos essenciais...");

  const batchSize = 3;
  for (let index = 0; index < assetUrls.length; index += batchSize) {
    const batch = assetUrls.slice(index, index + batchSize);
    await Promise.all(
      batch.map(async (url) => {
        await preloadImageLikeResource(url);
        loaded += 1;
        const progress = 0.12 + (loaded / assetUrls.length) * 0.78;
        onProgress(
          Math.min(progress, 0.92),
          "Carregando recursos essenciais..."
        );
      })
    );
  }

  onProgress(0.94, "Finalizando...");
}

interface PreloaderProps {
  onFinish: () => void;
}

export default function Preloader({ onFinish }: PreloaderProps) {
  const [progress, setProgress] = useState(0.02);
  const [statusText, setStatusText] = useState("Preparando o app...");
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0.96)).current;
  const progressAnim = useRef(new Animated.Value(0.02)).current;
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 280,
        useNativeDriver: false,
      }),
      Animated.spring(cardAnim, {
        toValue: 1,
        friction: 8,
        tension: 54,
        useNativeDriver: false,
      }),
    ]).start();

    const preloadAssets = async () => {
      try {
        await preloadWebAssets((value, status) => {
          setProgress(value);
          setStatusText(status);
        });

        await new Promise((resolve) => setTimeout(resolve, 180));
        setProgress(1);
        setStatusText("Tudo pronto");
        setIsReady(true);
      } catch (error) {
        console.error("[Preloader] Falha no carregamento inicial:", error);
        setProgress(1);
        setStatusText("Tudo pronto");
        setIsReady(true);
      }
    };

    void preloadAssets();
  }, [cardAnim, fadeAnim, onFinish, progressAnim]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 240,
        useNativeDriver: false,
      }).start(() => {
        onFinish();
      });
    }, 120);

    return () => clearTimeout(timer);
  }, [fadeAnim, isReady, onFinish]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <Animated.View
        style={[
          styles.card,
          {
            transform: [{ scale: cardAnim }],
          },
        ]}
      >
        <View style={styles.badge}>
          <Text style={styles.badgeText}>CDMF</Text>
        </View>

        <Text style={styles.title}>{"Preparando sua experi\u00eancia"}</Text>
        <Text style={styles.subtitle}>{statusText}</Text>

        <View style={styles.progressTrack}>
          <Animated.View
            style={[styles.progressBar, { width: progressWidth as any }]}
          />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" && {
      position: "fixed" as any,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: "100vw",
      height: "100vh",
      zIndex: 999999,
      overflow: "hidden",
    }),
  },
  glowTop: {
    position: "absolute",
    top: -120,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(124, 58, 237, 0.10)",
  },
  glowBottom: {
    position: "absolute",
    bottom: -140,
    left: -100,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(14, 165, 233, 0.08)",
  },
  card: {
    width: 220,
    paddingHorizontal: 22,
    paddingVertical: 24,
    borderRadius: 24,
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.18)",
    ...Platform.select({
      web: {
        boxShadow: "0 18px 48px rgba(15, 23, 42, 0.08)",
        backdropFilter: "blur(18px)",
      },
      default: {
        elevation: 3,
      },
    }),
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(124, 58, 237, 0.10)",
    marginBottom: 14,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#6D28D9",
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 16,
    minHeight: 18,
  },
  progressTrack: {
    width: "100%",
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(148, 163, 184, 0.18)",
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#7C3AED",
  },
});
