/**
 * UpdateChecker - Detecta novo deploy e exibe modal pedindo confirmação do usuário
 *
 * COMO FUNCIONA:
 * 1. Busca metadata.json do servidor (sem cache) a cada 30 segundos e ao voltar ao app
 * 2. Compara com a versão armazenada no localStorage
 * 3. Se há nova versão: exibe modal centralizado sobre toda a tela
 * 4. Usuário aperta "Atualizar" → limpa caches e recarrega
 * 5. "Agora não" → dispensado por 30 minutos, depois exibe novamente
 */

import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  Modal,
} from "react-native";
import { Ionicons } from "@/shims/icons";

const STORAGE_VERSION = "v5";
const KNOWN_BUILD_KEY = `@cdmf_build_${STORAGE_VERSION}`;
const DISMISSED_KEY   = `@cdmf_dismissed_${STORAGE_VERSION}`;

const OLD_KEYS_TO_CLEAN = [
  "@cdmf_known_build",
  "@cdmf_known_build_v2",
  "@cdmf_build_v3",
  "@cdmf_dismissed_v3",
  "@cdmf_build_v4",
  "@cdmf_dismissed_v4",
  "@cdmf_reload_attempt",
  "@cdmf_dismissed_build",
];

const CHECK_INTERVAL    = 30 * 1000;      // 30 segundos
const INITIAL_DELAY     = 2 * 1000;       // 2s após abrir
const DISMISS_DURATION  = 30 * 60 * 1000; // 30 minutos

function cleanupOldKeys(): void {
  if (typeof window === "undefined") return;
  try {
    OLD_KEYS_TO_CLEAN.forEach((key) => localStorage.removeItem(key));
  } catch {}
}

export default function UpdateChecker() {
  const [showModal, setShowModal]   = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [serverBuild, setServerBuild] = useState<number>(0);

  // Executa o reload com limpeza completa de cache e dados antigos
  const handleUpdate = useCallback(async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      // 1. Limpa todo o localStorage (dados antigos do app, perfis em cache, etc.)
      //    e redefine apenas o build atual para não disparar o aviso novamente
      try {
        const newBuild = serverBuild > 0 ? String(serverBuild) : null;
        localStorage.clear();
        if (newBuild) {
          localStorage.setItem(KNOWN_BUILD_KEY, newBuild);
        }
      } catch {}

      // 2. Limpa sessionStorage
      try {
        sessionStorage.clear();
      } catch {}

      // 3. Limpa todos os caches do Cache API (assets Vite, respostas de API)
      if ("caches" in window) {
        try {
          const names = await caches.keys();
          await Promise.all(names.map((n) => caches.delete(n)));
        } catch {}
      }

      // 4. Desregistra service workers
      if ("serviceWorker" in navigator) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        } catch {}
      }

      // 5. Limpa bancos IndexedDB (se existirem)
      if ("indexedDB" in window && typeof indexedDB.databases === "function") {
        try {
          const dbs = await indexedDB.databases();
          await Promise.all(
            dbs.map((db) => db.name ? indexedDB.deleteDatabase(db.name) : Promise.resolve())
          );
        } catch {}
      }

      // 6. Recarrega com URL que bypassa cache do browser
      const url = new URL(window.location.href);
      url.searchParams.set("_reload", String(Date.now()));
      window.location.href = url.toString();
    } catch {
      window.location.href = `${window.location.pathname}?_reload=${Date.now()}`;
    }
  }, [isUpdating, serverBuild]);

  // Dispensa por 30 minutos
  const handleDismiss = useCallback(() => {
    if (serverBuild > 0) {
      localStorage.setItem(
        DISMISSED_KEY,
        JSON.stringify({ build: serverBuild, until: Date.now() + DISMISS_DURATION })
      );
    }
    setShowModal(false);
  }, [serverBuild]);

  const isDismissed = useCallback((build: number): boolean => {
    try {
      const stored = localStorage.getItem(DISMISSED_KEY);
      if (!stored) return false;
      const data = JSON.parse(stored);
      if (data.build === build && data.until > Date.now()) return true;
      localStorage.removeItem(DISMISSED_KEY);
      return false;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    cleanupOldKeys();

    const checkForUpdates = async () => {
      try {
        if (document.visibilityState === "hidden") return;
        if (typeof navigator !== "undefined" && navigator.onLine === false) return;

        const timestamp = Date.now();
        const random    = Math.random().toString(36).substring(7);
        const controller = new AbortController();
        const timeoutId  = window.setTimeout(() => controller.abort(), 5000);

        const res = await fetch(`/metadata.json?t=${timestamp}&r=${random}`, {
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
            Pragma: "no-cache",
            Expires: "0",
            "If-Modified-Since": "0",
          },
        });
        window.clearTimeout(timeoutId);

        if (!res.ok) return;

        const data          = await res.json();
        const newServerBuild = data.buildTime;
        if (!newServerBuild) return;

        const stored     = localStorage.getItem(KNOWN_BUILD_KEY);
        const knownBuild = stored ? parseInt(stored, 10) : 0;

        // Primeira visita: apenas armazena
        if (!stored) {
          localStorage.setItem(KNOWN_BUILD_KEY, String(newServerBuild));
          return;
        }

        // Sem novidade
        if (newServerBuild <= knownBuild) {
          setShowModal(false);
          return;
        }

        // Nova versão — dispara modal se não foi dispensado
        setServerBuild(newServerBuild);
        if (!isDismissed(newServerBuild)) {
          setShowModal(true);
        }
      } catch {}
    };

    const timer    = setTimeout(checkForUpdates, INITIAL_DELAY);
    const interval = setInterval(checkForUpdates, CHECK_INTERVAL);

    let focusTimeout: ReturnType<typeof setTimeout> | null = null;
    const debouncedCheck = () => {
      if (focusTimeout) clearTimeout(focusTimeout);
      focusTimeout = setTimeout(checkForUpdates, 300);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") debouncedCheck();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      if (focusTimeout) clearTimeout(focusTimeout);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isDismissed]);

  if (Platform.OS !== "web") return null;

  return (
    <Modal
      visible={showModal}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Ícone */}
          <View style={styles.iconWrapper}>
            <Ionicons name="rocket-outline" size={36} color="#7C3AED" />
          </View>

          <Text style={styles.title}>Nova versão disponível</Text>
          <Text style={styles.subtitle}>
            Uma atualização foi publicada. Atualize agora para continuar usando o app normalmente.
          </Text>

          {/* Botão principal */}
          <Pressable
            style={[styles.updateBtn, isUpdating && styles.updateBtnDisabled]}
            onPress={handleUpdate}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.updateBtnText}>Atualizando...</Text>
              </>
            ) : (
              <>
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={styles.updateBtnText}>Atualizar agora</Text>
              </>
            )}
          </Pressable>

          {/* Dispensar */}
          {!isUpdating && (
            <Pressable onPress={handleDismiss} style={styles.dismissBtn}>
              <Text style={styles.dismissText}>Agora não</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 28,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
  },
  iconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1E293B",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  updateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#7C3AED",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: "100%",
    marginBottom: 12,
  },
  updateBtnDisabled: {
    opacity: 0.75,
  },
  updateBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  dismissBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  dismissText: {
    fontSize: 13,
    color: "#94A3B8",
    fontWeight: "600",
  },
});
