import React from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import LegalDocumentContent from "./LegalDocumentContent";
import {
  LEGAL_DOCUMENT_KEYS,
  getLegalDocument,
  getLegalDocumentUrl,
  type LegalDocumentKey,
} from "../../legal/legalDocuments";

interface LegalDocumentPageProps {
  documentKey: LegalDocumentKey;
}

function openPath(path: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.location.assign(path);
    return;
  }

  void Linking.openURL(path);
}

export default function LegalDocumentPage({
  documentKey,
}: LegalDocumentPageProps) {
  const document = getLegalDocument(documentKey);
  const alternateKey = LEGAL_DOCUMENT_KEYS.find((key) => key !== documentKey) ?? "termsOfService";
  const alternateDocument = getLegalDocument(alternateKey);
  const currentUrl = getLegalDocumentUrl(documentKey);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Documentos legais do CDMF</Text>
        <Text style={styles.heroTitle}>{document.title}</Text>
        <Text style={styles.heroDescription}>{document.description}</Text>

        <View style={styles.heroActions}>
          <Pressable style={styles.primaryButton} onPress={() => openPath("/")}>
            <Text style={styles.primaryButtonText}>Voltar ao aplicativo</Text>
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={() => openPath(alternateDocument.path)}
          >
            <Text style={styles.secondaryButtonText}>
              Abrir {alternateDocument.shortTitle.toLowerCase()}
            </Text>
          </Pressable>
        </View>

        <View style={styles.urlCard}>
          <Text style={styles.urlLabel}>URL pública</Text>
          <Text selectable style={styles.urlValue}>
            {currentUrl}
          </Text>
        </View>
      </View>

      <View style={styles.documentCard}>
        <LegalDocumentContent
          documentKey={documentKey}
          titleColor="#14213D"
          textColor="#334155"
          mutedColor="#64748B"
          accentColor="#0F766E"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 96,
    alignItems: "center",
  },
  hero: {
    width: "100%",
    maxWidth: 960,
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 28,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...Platform.select({
      web: {
        boxShadow: "0 18px 45px rgba(15, 23, 42, 0.08)",
      },
      default: {
        elevation: 4,
      },
    }),
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0F766E",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 10,
  },
  heroDescription: {
    fontSize: 15,
    lineHeight: 24,
    color: "#475569",
  },
  heroActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 20,
  },
  primaryButton: {
    backgroundColor: "#0F766E",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  secondaryButtonText: {
    color: "#1E293B",
    fontSize: 14,
    fontWeight: "700",
  },
  urlCard: {
    marginTop: 20,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 18,
    padding: 16,
  },
  urlLabel: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#64748B",
    marginBottom: 6,
  },
  urlValue: {
    fontSize: 14,
    lineHeight: 22,
    color: "#0F172A",
  },
  documentCard: {
    width: "100%",
    maxWidth: 960,
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 28,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...Platform.select({
      web: {
        boxShadow: "0 18px 45px rgba(15, 23, 42, 0.08)",
      },
      default: {
        elevation: 4,
      },
    }),
  },
});
