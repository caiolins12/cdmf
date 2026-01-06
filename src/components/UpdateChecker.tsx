/**
 * UpdateChecker - Detecta e aplica atualizações (estilo WhatsApp Web)
 * 
 * COMO FUNCIONA:
 * 1. Busca metadata.json do servidor (sem cache)
 * 2. Compara com a versão armazenada no localStorage
 * 3. Se há nova versão: mostra banner (NÃO atualiza localStorage ainda)
 * 4. Ao clicar "Atualizar": limpa caches e recarrega
 * 5. Após reload bem-sucedido: atualiza localStorage
 * 6. Se dispensar: lembra por 30 minutos, depois mostra novamente
 */

import React, { useEffect, useState, useRef, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Versão atual das chaves (incrementar quando mudar a lógica)
const STORAGE_VERSION = "v4";

// Chaves do localStorage
const KNOWN_BUILD_KEY = `@cdmf_build_${STORAGE_VERSION}`;
const DISMISSED_KEY = `@cdmf_dismissed_${STORAGE_VERSION}`;

// Chaves antigas para limpar automaticamente
const OLD_KEYS_TO_CLEAN = [
  "@cdmf_known_build",
  "@cdmf_known_build_v2",
  "@cdmf_build_v3",
  "@cdmf_dismissed_v3",
  "@cdmf_reload_attempt",
  "@cdmf_dismissed_build",
];

// Intervalo de verificação: 1 minuto
const CHECK_INTERVAL = 60 * 1000;

// Delay inicial: 2 segundos
const INITIAL_DELAY = 2000;

// Tempo que o banner fica dispensado: 30 minutos
const DISMISS_DURATION = 30 * 60 * 1000;

// Limpa chaves antigas do localStorage
function cleanupOldKeys(): void {
  if (typeof window === "undefined") return;
  
  try {
    OLD_KEYS_TO_CLEAN.forEach((key) => {
      localStorage.removeItem(key);
    });
  } catch (e) {
    // Ignora erros
  }
}

export default function UpdateChecker() {
  const [showBanner, setShowBanner] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [serverBuild, setServerBuild] = useState<number>(0);
  const slideAnim = useRef(new Animated.Value(-80)).current;

  // Aplica a atualização
  const handleUpdate = useCallback(async () => {
    if (isUpdating) return;
    setIsUpdating(true);

    try {
      // Marca que estamos atualizando para esta versão
      if (serverBuild > 0) {
        localStorage.setItem(KNOWN_BUILD_KEY, String(serverBuild));
        localStorage.removeItem(DISMISSED_KEY);
      }

      // 1. Limpa Cache API
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      }

      // 2. Desregistra Service Workers
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }

      // 3. Força reload
      window.location.reload();
    } catch (e) {
      console.error("[Update] Erro:", e);
      window.location.reload();
    }
  }, [isUpdating, serverBuild]);

  // Dispensa o banner por 30 minutos
  const handleDismiss = useCallback(() => {
    if (serverBuild > 0) {
      const dismissedData = {
        build: serverBuild,
        until: Date.now() + DISMISS_DURATION,
      };
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissedData));
    }
    setShowBanner(false);
  }, [serverBuild]);

  // Verifica se foi dispensado recentemente
  const isDismissed = useCallback((build: number): boolean => {
    try {
      const stored = localStorage.getItem(DISMISSED_KEY);
      if (!stored) return false;
      
      const data = JSON.parse(stored);
      if (data.build === build && data.until > Date.now()) {
        return true;
      }
      
      // Expirou, remove
      localStorage.removeItem(DISMISSED_KEY);
      return false;
    } catch {
      return false;
    }
  }, []);

  // Verifica atualizações
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    // Limpa chaves antigas do localStorage na inicialização
    cleanupOldKeys();

    const checkForUpdates = async () => {
      try {
        // Busca metadata.json sem cache
        const res = await fetch(`/metadata.json?t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
        });
        
        if (!res.ok) {
          console.warn("[Update] ❌ Falha ao buscar metadata.json - status:", res.status);
          return;
        }
        
        const data = await res.json();
        const newServerBuild = data.buildTime;
        
        if (!newServerBuild) {
          console.warn("[Update] ❌ metadata.json sem buildTime:", data);
          return;
        }

        // Obtém versão conhecida do localStorage
        const stored = localStorage.getItem(KNOWN_BUILD_KEY);
        const knownBuild = stored ? parseInt(stored, 10) : 0;

        // Log detalhado sempre visível
        const serverDate = new Date(newServerBuild).toLocaleString("pt-BR");
        const localDate = knownBuild ? new Date(knownBuild).toLocaleString("pt-BR") : "N/A";
        console.log(`[Update] 📊 Servidor: ${newServerBuild} (${serverDate})`);
        console.log(`[Update] 📊 Local: ${knownBuild} (${localDate})`);

        // Primeira visita - armazena e não mostra nada
        if (!stored) {
          localStorage.setItem(KNOWN_BUILD_KEY, String(newServerBuild));
          console.log("[Update] ✅ Primeira visita - versão armazenada. Próximo deploy mostrará o banner.");
          return;
        }

        // Se o servidor tem versão IGUAL ou MENOR, não faz nada
        if (newServerBuild <= knownBuild) {
          console.log("[Update] ✅ Você está na versão mais recente!");
          setShowBanner(false);
          return;
        }

        // Nova versão disponível!
        setServerBuild(newServerBuild);

        // Verifica se foi dispensado recentemente
        if (isDismissed(newServerBuild)) {
          console.log("[Update] ⏸️ Nova versão disponível mas foi dispensada recentemente");
          return;
        }

        // Mostra o banner
        console.log("[Update] 🎉 NOVA VERSÃO DETECTADA! Mostrando banner de atualização");
        setShowBanner(true);
        
      } catch (e) {
        console.warn("[Update] ❌ Erro ao verificar:", e);
      }
    };

    // Verificação inicial
    const timer = setTimeout(checkForUpdates, INITIAL_DELAY);
    
    // Verificações periódicas
    const interval = setInterval(checkForUpdates, CHECK_INTERVAL);

    // Verifica quando volta ao foco
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        setTimeout(checkForUpdates, 500);
      }
    };
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [isDismissed]);

  // Animação
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: showBanner ? 0 : -80,
      friction: 10,
      tension: 50,
      useNativeDriver: true,
    }).start();
  }, [showBanner, slideAnim]);

  if (Platform.OS !== "web" || !showBanner) {
    return null;
  }

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY: slideAnim }] }]}
    >
      <View style={styles.content}>
        <Ionicons name="sparkles" size={18} color="#fff" />
        <Text style={styles.text}>Nova versão disponível</Text>
      </View>

      <View style={styles.actions}>
        {!isUpdating && (
          <Pressable onPress={handleDismiss} style={styles.dismissBtn}>
            <Text style={styles.dismissText}>Depois</Text>
          </Pressable>
        )}

        <Pressable
          onPress={handleUpdate}
          style={[styles.updateBtn, isUpdating && styles.disabled]}
          disabled={isUpdating}
        >
          {isUpdating ? (
            <Text style={styles.updateText}>Atualizando...</Text>
          ) : (
            <>
              <Ionicons name="refresh" size={14} color="#7C3AED" />
              <Text style={styles.updateText}>Atualizar</Text>
            </>
          )}
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#7C3AED",
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 99999,
    ...(Platform.OS === "web" && {
      position: "fixed" as any,
    }),
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  text: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dismissBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  dismissText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
  },
  updateBtn: {
    backgroundColor: "#fff",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  disabled: {
    opacity: 0.7,
  },
  updateText: {
    color: "#7C3AED",
    fontSize: 13,
    fontWeight: "700",
  },
});
