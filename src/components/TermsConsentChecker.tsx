import React, { useEffect, useRef, useState } from "react";

import { useAuth } from "../contexts/AuthContext";
import {
  getLegacyAcceptedTimestamp,
  hasAcceptedAllLegalDocuments,
  needsLegacyLegalMigration,
  LEGAL_DOCUMENT_KEYS,
  type LegalDocumentKey,
} from "../legal/legalDocuments";
import PrivacyPolicyModal from "./PrivacyPolicyModal";

const MODAL_DELAY_MS = 1200;

/**
 * Checks which individual legal documents still need acceptance.
 */
function getDocumentsNeedingAcceptance(profile: any): LegalDocumentKey[] {
  return LEGAL_DOCUMENT_KEYS.filter((key) => {
    if (key === "privacyPolicy") return !profile?.privacyPolicyAccepted;
    if (key === "termsOfService") return !profile?.termsOfServiceAccepted;
    return true;
  });
}

export default function TermsConsentChecker() {
  const { profile, user, updateProfile, refreshProfile } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [currentDocKey, setCurrentDocKey] = useState<LegalDocumentKey | null>(null);
  const isMigratingLegacyRef = useRef(false);
  const isStudentConsentFlow = profile?.role === "student";

  // Only eligible after phone is verified via WhatsApp OTP — prevents overlapping with OnboardingSurveyModal
  const isEligibleForConsent = Boolean(
    user && profile && !profile.isOffline && isStudentConsentFlow &&
    profile.phoneVerified && profile.phoneVerificationMethod === "whatsapp"
  );
  const needsAcceptance = isEligibleForConsent && !hasAcceptedAllLegalDocuments(profile);

  // Legacy migration
  useEffect(() => {
    if (!profile?.uid || !needsLegacyLegalMigration(profile) || isMigratingLegacyRef.current) {
      return;
    }

    isMigratingLegacyRef.current = true;

    const syncLegacyAcceptance = async () => {
      try {
        const acceptedAt = getLegacyAcceptedTimestamp(profile);

        await updateProfile(profile.uid, {
          privacyPolicyAccepted: true,
          privacyPolicyAcceptedAt: acceptedAt,
          termsOfServiceAccepted: true,
          termsOfServiceAcceptedAt: acceptedAt,
        });

        await refreshProfile?.();
      } catch (error) {
        console.error("Erro ao migrar aceite legado dos documentos legais:", error);
      } finally {
        isMigratingLegacyRef.current = false;
      }
    };

    void syncLegacyAcceptance();
  }, [
    profile?.uid,
    profile?.termsAccepted,
    profile?.termsAcceptedAt,
    profile?.privacyPolicyAccepted,
    profile?.termsOfServiceAccepted,
    refreshProfile,
    updateProfile,
  ]);

  // Determine which document to show
  useEffect(() => {
    if (!isEligibleForConsent || isMigratingLegacyRef.current) {
      setShowModal(false);
      setCurrentDocKey(null);
      return;
    }

    if (!needsAcceptance) {
      setShowModal(false);
      setCurrentDocKey(null);
      return;
    }

    const pending = getDocumentsNeedingAcceptance(profile);
    if (pending.length === 0) {
      setShowModal(false);
      setCurrentDocKey(null);
      return;
    }

    setCurrentDocKey(pending[0]);

    const timeoutId = setTimeout(() => {
      setShowModal(true);
    }, MODAL_DELAY_MS);

    return () => clearTimeout(timeoutId);
  }, [isEligibleForConsent, needsAcceptance, profile?.uid, profile?.privacyPolicyAccepted, profile?.termsOfServiceAccepted]);

  const handleAcceptDocument = async () => {
    if (!profile?.uid || !user || !currentDocKey) return;

    try {
      const acceptedAt = Date.now();
      const updates: Record<string, any> = {
        termsAccepted: true,
        termsAcceptedAt: acceptedAt,
      };

      if (currentDocKey === "privacyPolicy") {
        updates.privacyPolicyAccepted = true;
        updates.privacyPolicyAcceptedAt = acceptedAt;
      } else if (currentDocKey === "termsOfService") {
        updates.termsOfServiceAccepted = true;
        updates.termsOfServiceAcceptedAt = acceptedAt;
      }

      await updateProfile(profile.uid, updates);
      await refreshProfile?.();

      // Check if there are more documents to accept
      const remaining = getDocumentsNeedingAcceptance({
        ...profile,
        ...updates,
      });

      if (remaining.length > 0) {
        // Show the next document
        setCurrentDocKey(remaining[0]);
      } else {
        // All documents accepted
        setShowModal(false);
        setCurrentDocKey(null);
      }
    } catch (error) {
      console.error("Erro ao salvar aceite do documento legal:", error);
    }
  };

  if (!isStudentConsentFlow || !currentDocKey || (!needsAcceptance && !showModal)) {
    return null;
  }

  return (
    <PrivacyPolicyModal
      visible={showModal}
      documentKey={currentDocKey}
      onAccept={handleAcceptDocument}
      requireScroll
      showCloseButton={false}
    />
  );
}
