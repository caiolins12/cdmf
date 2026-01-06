import React, { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, Animated, Platform, Image } from "react-native";
import { Asset } from "expo-asset";
import * as Font from "expo-font";
import { Ionicons, MaterialIcons, FontAwesome } from "@expo/vector-icons";

// Imagens para pré-carregar (mobile)
const imagesToPreload = [
  require("../../assets/cdmf-logo.png"),
  require("../../assets/dance_ico1.png"),
  require("../../assets/dance_ico2.png"),
  require("../../assets/dance_ico3.png"),
  require("../../assets/dance_ico4.png"),
  require("../../assets/google.png"),
];

// Nomes das imagens para buscar no manifest ou por padrão
const imageNames = [
  "cdmf-logo",
  "dance_ico1",
  "dance_ico2",
  "dance_ico3",
  "dance_ico4",
  "google",
];

// Função para descobrir caminhos de imagens na web
async function discoverImagePaths(): Promise<string[]> {
  const paths: string[] = [];
  
  // 1. Tenta carregar do manifest gerado no build
  try {
    const response = await fetch(`/image-manifest.json?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (response.ok) {
      const manifest = await response.json();
      const manifestPaths = Object.values(manifest) as string[];
      if (manifestPaths.length > 0) {
        console.log("[Preloader] Manifest encontrado com", manifestPaths.length, "imagens");
        return manifestPaths;
      }
    }
  } catch (e) {
    console.debug("[Preloader] Manifest não encontrado");
  }
  
  // 2. Tenta resolver via Image.resolveAssetSource do Expo (mais confiável)
  for (const img of imagesToPreload) {
    try {
      const source = Image.resolveAssetSource(img);
      if (source?.uri) {
        // Na web, a URI pode ser relativa ou absoluta
        const uri = source.uri.startsWith("http") 
          ? source.uri 
          : source.uri.startsWith("/") 
            ? source.uri 
            : `/${source.uri}`;
        paths.push(uri);
      }
    } catch (e) {
      // Ignora
    }
  }
  
  if (paths.length > 0) {
    console.log("[Preloader] Resolvidas", paths.length, "imagens via Expo Asset");
    return paths;
  }
  
  // 3. Tenta descobrir via busca nos scripts carregados
  try {
    const scripts = document.querySelectorAll("script[src]");
    for (const script of scripts) {
      const src = (script as HTMLScriptElement).src;
      if (src.includes("index-") && src.endsWith(".js")) {
        // Busca o JS principal para encontrar referências de imagens
        const jsResponse = await fetch(src);
        const jsContent = await jsResponse.text();
        
        for (const name of imageNames) {
          const regex = new RegExp(`/assets/assets/${name}\\.[a-f0-9]+\\.png`, "g");
          const matches = jsContent.match(regex);
          if (matches && matches.length > 0 && !paths.includes(matches[0])) {
            paths.push(matches[0]);
          }
        }
      }
    }
    
    if (paths.length > 0) {
      console.log("[Preloader] Descobertas", paths.length, "imagens via JS bundle");
      return paths;
    }
  } catch (e) {
    console.debug("[Preloader] Erro ao descobrir imagens via JS:", e);
  }
  
  // 4. Último fallback: tenta caminhos conhecidos (menos confiável)
  console.log("[Preloader] Usando fallback - verificando existência de imagens");
  for (const name of imageNames) {
    // Tenta encontrar a imagem verificando se existe
    try {
      const testResponse = await fetch(`/assets/assets/${name}.png`, { method: "HEAD" });
      if (testResponse.ok) {
        paths.push(`/assets/assets/${name}.png`);
      }
    } catch (e) {
      // Ignora
    }
  }
  
  return paths;
}

// Pré-carrega uma imagem na web
function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new (window as any).Image();
    const done = () => resolve();
    
    img.onload = done;
    img.onerror = done;
    
    // Timeout de segurança
    const timeout = setTimeout(done, 8000);
    img.onload = () => {
      clearTimeout(timeout);
      done();
    };
    
    img.src = src;
  });
}

// Pré-carrega fontes de ícones via CDN (web)
async function preloadIconFonts(): Promise<void> {
  if (Platform.OS !== "web") return;
  
  // URLs das fontes de ícones
  const fontUrls = [
    "https://fonts.googleapis.com/icon?family=Material+Icons",
    "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css",
  ];
  
  // Carrega CSS das fontes
  const promises = fontUrls.map((url) => {
    return new Promise<void>((resolve) => {
      // Verifica se já existe
      const existing = document.querySelector(`link[href="${url}"]`);
      if (existing) {
        resolve();
        return;
      }
      
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      link.onload = () => resolve();
      link.onerror = () => resolve();
      
      // Timeout de segurança
      setTimeout(() => resolve(), 5000);
      
      document.head.appendChild(link);
    });
  });
  
  await Promise.all(promises);
  
  // Aguarda fontes serem aplicadas
  if ("fonts" in document) {
    try {
      await (document as any).fonts.ready;
    } catch (e) {
      // Ignora erro
    }
  }
}

// Função principal para pré-carregar recursos na web
async function preloadWebAssets(
  onProgress: (loaded: number, total: number, status: string) => void
): Promise<void> {
  if (Platform.OS !== "web") return;
  
  try {
    // Etapa 1: Pré-carregar fontes de ícones (20%)
    onProgress(0, 100, "Carregando ícones...");
    await preloadIconFonts();
    onProgress(20, 100, "Ícones carregados");
    
    // Etapa 2: Descobrir e pré-carregar imagens (20% a 90%)
    onProgress(20, 100, "Descobrindo imagens...");
    const imagePaths = await discoverImagePaths();
    
    if (imagePaths.length === 0) {
      console.log("[Preloader] Nenhuma imagem para pré-carregar");
      onProgress(90, 100, "Finalizando...");
      return;
    }
    
    const total = imagePaths.length;
    let loaded = 0;
    
    // Carrega imagens em paralelo (máximo 3 por vez)
    const batchSize = 3;
    for (let i = 0; i < imagePaths.length; i += batchSize) {
      const batch = imagePaths.slice(i, i + batchSize);
      await Promise.all(batch.map(async (path) => {
        await preloadImage(path);
        loaded++;
        const progress = 20 + Math.round((loaded / total) * 70);
        onProgress(progress, 100, `Carregando imagens... (${loaded}/${total})`);
      }));
    }
    
    onProgress(90, 100, "Imagens carregadas");
  } catch (error) {
    console.debug("[Preloader] Erro no preload web:", error);
  }
}

interface PreloaderProps {
  onFinish: () => void;
}

export default function Preloader({ onFinish }: PreloaderProps) {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Iniciando...");
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [isReady, setIsReady] = useState(false);

  // Anima a barra de progresso suavemente
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  useEffect(() => {
    // Animação de entrada
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start();

    // Função para pré-carregar recursos
    const preloadAssets = async () => {
      try {
        if (Platform.OS === "web") {
          // Na web, usa função otimizada
          await preloadWebAssets((loaded, total, status) => {
            setProgress(loaded / 100);
            setStatusText(status);
          });
        } else {
          // No mobile, usa APIs nativas do Expo
          
          // 1. Pré-carregar fontes de ícones
          setStatusText("Carregando ícones...");
          setProgress(0.1);
          
          try {
            await Font.loadAsync({
              ...Ionicons.font,
              ...MaterialIcons.font,
              ...FontAwesome.font,
            });
          } catch (e) {
            console.debug("[Preloader] Fontes já carregadas ou erro:", e);
          }
          
          setProgress(0.2);

          // 2. Pré-carregar imagens
          setStatusText("Carregando imagens...");
          const total = imagesToPreload.length;
          
          for (let i = 0; i < total; i++) {
            try {
              await Asset.loadAsync(imagesToPreload[i]);
            } catch (e) {
              console.debug("[Preloader] Erro ao carregar imagem:", e);
            }
            setProgress(0.2 + ((i + 1) / total * 0.7));
            setStatusText(`Carregando imagens... (${i + 1}/${total})`);
          }
        }

        // 3. Finalização
        setStatusText("Quase pronto...");
        setProgress(0.95);
        
        // Pequena pausa para garantir que tudo foi renderizado
        await new Promise(resolve => setTimeout(resolve, 200));
        
        setProgress(1);
        setStatusText("Pronto!");
        setIsReady(true);
      } catch (error) {
        console.debug("[Preloader] Erro no preload:", error);
        // Em caso de erro, continua mesmo assim
        setProgress(1);
        setIsReady(true);
      }
    };

    preloadAssets();
  }, []);

  // Quando estiver pronto, faz fade out e chama onFinish
  useEffect(() => {
    if (isReady) {
      const timer = setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: Platform.OS !== "web",
        }).start(() => {
          onFinish();
        });
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isReady, onFinish]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Animated.View style={[styles.content, { transform: [{ scale: scaleAnim }] }]}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>CDMF</Text>
          </View>
        </View>

        {/* Título */}
        <Text style={styles.title}>Centro de Danças</Text>
        <Text style={styles.subtitle}>Marcelo Ferreira</Text>

        {/* Barra de progresso */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBg}>
            <Animated.View style={[styles.progressBar, { width: progressWidth as any }]} />
          </View>
          <Text style={styles.progressPercent}>{Math.round(progress * 100)}%</Text>
        </View>

        <Text style={styles.loadingText}>{statusText}</Text>
      </Animated.View>

      {/* Ondas decorativas */}
      <View style={styles.waveContainer}>
        <View style={[styles.wave, styles.wave1]} />
        <View style={[styles.wave, styles.wave2]} />
        <View style={[styles.wave, styles.wave3]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#7C3AED",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" && {
      position: "fixed" as any,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 99999,
    }),
  },
  content: {
    alignItems: "center",
    zIndex: 10,
  },
  logoContainer: {
    marginBottom: 24,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.4)",
  },
  logoText: {
    fontSize: 28,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 2,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "500",
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    marginBottom: 40,
  },
  progressContainer: {
    width: 200,
    alignItems: "center",
    marginBottom: 16,
  },
  progressBg: {
    width: "100%",
    height: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 3,
  },
  progressPercent: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "600",
    marginTop: 8,
  },
  loadingText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    fontWeight: "500",
  },
  waveContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    overflow: "hidden",
  },
  wave: {
    position: "absolute",
    left: "-50%",
    right: "-50%",
    borderRadius: 1000,
  },
  wave1: {
    bottom: -180,
    height: 200,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  wave2: {
    bottom: -160,
    height: 180,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  wave3: {
    bottom: -140,
    height: 160,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
});
