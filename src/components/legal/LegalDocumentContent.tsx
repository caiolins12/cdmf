import React from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  getLegalDocument,
  type LegalDocumentKey,
} from "../../legal/legalDocuments";

interface LegalDocumentContentProps {
  documentKey: LegalDocumentKey;
  titleColor: string;
  textColor: string;
  mutedColor: string;
  accentColor: string;
  showHeader?: boolean;
}

export default function LegalDocumentContent({
  documentKey,
  titleColor,
  textColor,
  mutedColor,
  accentColor,
  showHeader = true,
}: LegalDocumentContentProps) {
  const document = getLegalDocument(documentKey);

  return (
    <View>
      {showHeader && (
        <View style={styles.header}>
          <Text style={[styles.title, { color: titleColor }]}>{document.title}</Text>
          <Text style={[styles.description, { color: mutedColor }]}>
            {document.description}
          </Text>
          <Text style={[styles.updatedAt, { color: accentColor }]}>
            Última atualização: {document.lastUpdated}
          </Text>
        </View>
      )}

      {document.intro.map((paragraph) => (
        <Text key={paragraph} style={[styles.paragraph, { color: textColor }]}>
          {paragraph}
        </Text>
      ))}

      {document.sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: titleColor }]}>
            {section.title}
          </Text>

          {section.paragraphs?.map((paragraph) => (
            <Text
              key={`${section.title}-${paragraph}`}
              style={[styles.paragraph, { color: textColor }]}
            >
              {paragraph}
            </Text>
          ))}

          {section.bullets?.map((bullet) => (
            <View key={`${section.title}-${bullet}`} style={styles.bulletRow}>
              <View style={[styles.bulletDot, { backgroundColor: accentColor }]} />
              <Text style={[styles.bulletText, { color: textColor }]}>{bullet}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 10,
  },
  updatedAt: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  section: {
    marginTop: 18,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 10,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 24,
    marginBottom: 12,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  bulletDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginTop: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 24,
  },
});
