import React from "react";
import { Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import {
  LEGAL_DOCUMENT_KEYS,
  getLegalDocument,
  getLegalDocumentKeyFromPath,
} from "../../legal/legalDocuments";

export default function LegalFooter() {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return null;
  }

  const { width } = useWindowDimensions();
  const activeDocumentKey = getLegalDocumentKeyFromPath(window.location.pathname);
  const bottomOffset = width < 900 ? 76 : 10;

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { bottom: bottomOffset }]}>
      {/* Nome do app visível para rastreadores do Google OAuth */}
      <Text style={styles.appName}>CDMF</Text>

      <View style={styles.linksRow}>
        {LEGAL_DOCUMENT_KEYS.map((documentKey, index) => {
          const doc = getLegalDocument(documentKey);
          const isActive = activeDocumentKey === documentKey;

          return (
            <React.Fragment key={doc.key}>
              {index > 0 && <Text style={styles.separator}>|</Text>}
              {/* <a> real para que Google OAuth reconheça o link de privacidade */}
              <a
                href={doc.path}
                style={{
                  fontSize: 11,
                  color: isActive ? "#0F766E" : "rgba(51, 65, 85, 0.86)",
                  fontWeight: "600" as any,
                  textDecoration: isActive ? "underline" : "none",
                  paddingLeft: 2,
                  paddingRight: 2,
                }}
              >
                {doc.title}
              </a>
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 12,
    zIndex: 999,
    ...Platform.select({
      web: { position: "fixed" as any },
    }),
  },
  appName: {
    fontSize: 10,
    color: "rgba(100, 116, 139, 0.5)",
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: 2,
  },
  linksRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    columnGap: 8,
    rowGap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  separator: {
    fontSize: 10,
    color: "rgba(100, 116, 139, 0.7)",
  },
});
