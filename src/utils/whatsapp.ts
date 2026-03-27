/**
 * WhatsApp Utility
 * Builds wa.me URLs using the number connected in Evolution API when available.
 * Falls back to the business phone configured in Firestore or the master profile phone.
 */

import { useState, useEffect } from "react";
import { apiPost } from "../services/apiClient";

// Cached phone number (module-level to avoid re-fetching on every render)
let cachedPhone: string | null = null;
let fetchPromise: Promise<string | null> | null = null;

/**
 * Fetches the business WhatsApp phone number.
 * Priority:
 * 1. Number currently connected in Evolution API
 * 2. `settings/whatsapp` { businessPhone: "5511999998888" }
 * 3. Master profile phone
 */
async function fetchBusinessPhone(): Promise<string | null> {
  if (cachedPhone !== null) return cachedPhone;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      // 1. Try the number connected in Evolution API
      try {
        const result = await apiPost<{ phone?: string | null }>("/api/rpc/getWhatsAppContact", {});
        if (result?.phone && typeof result.phone === "string") {
          cachedPhone = normalizePhone(result.phone);
          return cachedPhone;
        }
      } catch (e) {
        console.warn("[WhatsApp] Erro ao buscar numero da Evolution API:", e);
      }

      const { doc, getDoc } = await import("../services/postgresFirestoreCompat");
      const { db } = await import("../services/firebase");

      // 2. Try settings/whatsapp
      const settingsSnap = await getDoc(doc(db, "settings", "whatsapp"));
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        if (data?.businessPhone && typeof data.businessPhone === "string") {
          cachedPhone = normalizePhone(data.businessPhone);
          return cachedPhone;
        }
      }

      // 3. Fallback: master profile phone
      const profilesSnap = await import("../services/postgresFirestoreCompat").then(({ collection, query, where, limit, getDocs }) =>
        getDocs(query(collection(db, "profiles"), where("role", "==", "master"), limit(1)))
      );
      if (!profilesSnap.empty) {
        const masterProfile = profilesSnap.docs[0].data();
        if (masterProfile?.phone && typeof masterProfile.phone === "string") {
          cachedPhone = normalizePhone(masterProfile.phone);
          return cachedPhone;
        }
      }

      cachedPhone = null;
      return null;
    } catch (e) {
      console.warn("[WhatsApp] Erro ao buscar número:", e);
      cachedPhone = null;
      return null;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

/**
 * Normalizes a phone number to international format (remove non-digits, ensure prefix 55).
 */
export function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.length <= 11 && !cleaned.startsWith("55")) {
    cleaned = `55${cleaned}`;
  }
  return cleaned;
}

/**
 * Builds a wa.me URL for the business number with an optional pre-filled message.
 * @param phone - The business phone number (optional, uses cached value if not provided)
 * @param message - Optional pre-filled message text
 */
export function buildWhatsAppUrl(phone: string | null | undefined, message?: string): string {
  if (!phone) {
    // Fallback: open wa.me without a number (lets user choose)
    if (message) {
      return `https://wa.me/?text=${encodeURIComponent(message)}`;
    }
    return "https://wa.me/";
  }
  const normalized = normalizePhone(phone);
  const base = `https://wa.me/${normalized}`;
  if (message) {
    return `${base}?text=${encodeURIComponent(message)}`;
  }
  return base;
}

/**
 * Hook that returns the business WhatsApp phone number (or null while loading).
 * The number is fetched once and cached for the session.
 */
export function useWhatsAppContact(): {
  phone: string | null;
  loading: boolean;
  buildUrl: (message?: string) => string;
} {
  const [phone, setPhone] = useState<string | null>(cachedPhone);
  const [loading, setLoading] = useState(!cachedPhone);

  useEffect(() => {
    if (cachedPhone !== null) {
      setPhone(cachedPhone);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchBusinessPhone().then((p) => {
      if (!cancelled) {
        setPhone(p);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    phone,
    loading,
    buildUrl: (message?: string) => buildWhatsAppUrl(phone, message),
  };
}

/**
 * Invalidates all caches (useful after updating settings).
 */
export function invalidateWhatsAppCache(): void {
  cachedPhone = null;
  fetchPromise = null;
}
