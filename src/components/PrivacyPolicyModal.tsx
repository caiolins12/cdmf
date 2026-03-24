import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Linking,
  LayoutChangeEvent,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@/shims/icons";

import LegalDocumentContent from "./legal/LegalDocumentContent";
import { useTheme } from "../contexts/ThemeContext";
import {
  LEGAL_DOCUMENT_KEYS,
  getLegalDocument,
  getLegalDocumentUrl,
  type LegalDocumentKey,
} from "../legal/legalDocuments";

interface PrivacyPolicyModalProps {
  visible: boolean;
  onAccept: () => void;
  onClose?: () => void;
  requireScroll?: boolean;
  showCloseButton?: boolean;
  alreadyAccepted?: boolean;
  viewOnly?: boolean;
  /** When provided, shows a single document instead of the tab view */
  documentKey?: LegalDocumentKey;
}

type AcceptanceState = Record<LegalDocumentKey, boolean>;

function createDocumentState(value: boolean): AcceptanceState {
  return {
    privacyPolicy: value,
    termsOfService: value,
  };
}

function openLegalUrl(documentKey: LegalDocumentKey) {
  const url = getLegalDocumentUrl(documentKey);

  if (!url) {
    return;
  }

  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  void Linking.openURL(url);
}

// ─────────────────────────────────────────────
// Single‑document consent modal (used by TermsConsentChecker)
// ─────────────────────────────────────────────

function SingleDocumentModal({
  visible,
  documentKey,
  onAccept,
  onClose,
  requireScroll,
  showCloseButton,
  alreadyAccepted,
}: {
  visible: boolean;
  documentKey: LegalDocumentKey;
  onAccept: () => void;
  onClose?: () => void;
  requireScroll: boolean;
  showCloseButton: boolean;
  alreadyAccepted: boolean;
}) {
  const { colors: themeColors } = useTheme();
  const { width, height } = useWindowDimensions();
  const scrollViewRef = useRef<ScrollView | null>(null);

  const [hasRead, setHasRead] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [layoutHeight, setLayoutHeight] = useState(0);

  const document = getLegalDocument(documentKey);
  const canClose = showCloseButton || alreadyAccepted;
  const isMobile = width < 600;

  // Reset state when modal opens or document changes
  useEffect(() => {
    if (!visible) return;
    const markRead = alreadyAccepted || !requireScroll;
    setHasRead(markRead);
    setAccepted(alreadyAccepted);
    setContentHeight(0);
    setLayoutHeight(0);
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, [visible, documentKey, alreadyAccepted, requireScroll]);

  // Auto-mark as read when content fits without scrolling
  useEffect(() => {
    if (!requireScroll || alreadyAccepted || hasRead) return;
    if (contentHeight > 0 && layoutHeight > 0 && contentHeight <= layoutHeight + 48) {
      setHasRead(true);
    }
  }, [contentHeight, layoutHeight, requireScroll, alreadyAccepted, hasRead]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!requireScroll || alreadyAccepted || hasRead) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 60) {
      setHasRead(true);
    }
  };

  const canAccept = hasRead && accepted && !alreadyAccepted;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={canClose && onClose ? onClose : undefined}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.modal,
            {
              backgroundColor: themeColors.bgCard,
              width: Math.min(width - 24, 680),
              maxHeight: Math.max(480, height - 40),
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
            <View style={styles.headerContent}>
              <View
                style={[
                  styles.headerIcon,
                  { backgroundColor: themeColors.purpleLight },
                ]}
              >
                <Ionicons
                  name="shield-checkmark"
                  size={20}
                  color={themeColors.purple}
                />
              </View>
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: themeColors.text }, isMobile && { fontSize: 17 }]}>
                  {document.title}
                </Text>
                <Text style={[styles.subtitle, { color: themeColors.textMuted }]}>
                  Atualizado em {document.lastUpdated}
                </Text>
              </View>
            </View>

            {canClose && onClose && (
              <Pressable onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={24} color={themeColors.textMuted} />
              </Pressable>
            )}
          </View>

          {/* Document scroll area */}
          <View style={styles.singleScrollContainer}>
            <ScrollView
              ref={scrollViewRef}
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator
              onContentSizeChange={(_w, h) => setContentHeight(h)}
              onLayout={(e: LayoutChangeEvent) =>
                setLayoutHeight(e.nativeEvent.layout.height)
              }
            >
              <LegalDocumentContent
                documentKey={documentKey}
                titleColor={themeColors.text}
                textColor={themeColors.textSecondary}
                mutedColor={themeColors.textMuted}
                accentColor={themeColors.purple}
              />
            </ScrollView>
          </View>

          {/* Scroll indicator */}
          {requireScroll && !hasRead && !alreadyAccepted && (
            <View
              style={[
                styles.scrollIndicator,
                {
                  backgroundColor: themeColors.bgSecondary,
                  borderTopColor: themeColors.border,
                },
              ]}
            >
              <Ionicons name="arrow-down" size={14} color={themeColors.textMuted} />
              <Text style={[styles.scrollIndicatorText, { color: themeColors.textMuted }]}>
                Role até o final para liberar o aceite
              </Text>
            </View>
          )}

          {/* Acceptance + button */}
          {!alreadyAccepted && (
            <View style={[styles.singleFooter, { borderTopColor: themeColors.border }]}>
              <Pressable
                style={styles.singleCheckRow}
                onPress={() => hasRead && setAccepted((v) => !v)}
                disabled={!hasRead}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: accepted ? themeColors.purple : themeColors.border,
                      backgroundColor: accepted
                        ? themeColors.purpleLight
                        : themeColors.bgCard,
                      opacity: hasRead ? 1 : 0.5,
                    },
                  ]}
                >
                  <Ionicons
                    name={accepted ? "checkmark" : "add"}
                    size={18}
                    color={
                      accepted
                        ? themeColors.purple
                        : hasRead
                        ? themeColors.textSecondary
                        : themeColors.textMuted
                    }
                  />
                </View>
                <Text
                  style={[
                    styles.singleCheckLabel,
                    {
                      color: hasRead ? themeColors.text : themeColors.textMuted,
                    },
                  ]}
                >
                  Li e aceito {document.shortTitle.toLowerCase() === "privacidade"
                    ? "a Política de Privacidade"
                    : "os Termos de Serviço"}
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.primaryAction,
                  {
                    backgroundColor: canAccept
                      ? themeColors.purple
                      : themeColors.bgSecondary,
                    flex: 0,
                    width: "100%",
                  },
                  !canAccept && styles.disabledButton,
                ]}
                onPress={() => canAccept && onAccept()}
                disabled={!canAccept}
              >
                <Text
                  style={[
                    styles.primaryActionText,
                    { color: canAccept ? "#FFFFFF" : themeColors.textMuted },
                  ]}
                >
                  Aceitar e continuar
                </Text>
              </Pressable>
            </View>
          )}

          {alreadyAccepted && (
            <View style={[styles.singleFooter, { borderTopColor: themeColors.border }]}>
              <View style={[styles.acceptedIndicator, { backgroundColor: themeColors.bgSecondary, flex: 1 }]}>
                <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                <Text style={[styles.acceptedText, { color: themeColors.textMuted }]}>
                  Este documento já foi aceito.
                </Text>
              </View>
              {onClose && (
                <Pressable
                  style={[styles.primaryAction, { backgroundColor: themeColors.purple, flex: 0, width: "100%" }]}
                  onPress={onClose}
                >
                  <Text style={styles.primaryActionText}>Fechar</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// Multi‑document view (used by StudentAccountScreen)
// ─────────────────────────────────────────────

function MultiDocumentModal({
  visible,
  onAccept,
  onClose,
  requireScroll,
  showCloseButton,
  alreadyAccepted,
  viewOnly,
}: Omit<PrivacyPolicyModalProps, "documentKey">) {
  const { colors: themeColors } = useTheme();
  const { width, height } = useWindowDimensions();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const [activeDocument, setActiveDocument] =
    useState<LegalDocumentKey>("privacyPolicy");
  const [documentsRead, setDocumentsRead] = useState<AcceptanceState>(
    createDocumentState(false)
  );
  const [acceptedDocuments, setAcceptedDocuments] = useState<AcceptanceState>(
    createDocumentState(false)
  );
  const [contentHeight, setContentHeight] = useState(0);
  const [layoutHeight, setLayoutHeight] = useState(0);

  const isViewerMode = viewOnly || (showCloseButton && !requireScroll && !alreadyAccepted);
  const canClose = isViewerMode || showCloseButton || alreadyAccepted;
  const isCompactLayout = width < 980 || height < 860;
  const isStackedActions = width < 720;

  useEffect(() => {
    if (!visible) return;
    const markAsRead = isViewerMode || alreadyAccepted || !requireScroll;
    setActiveDocument("privacyPolicy");
    setDocumentsRead(createDocumentState(markAsRead));
    setAcceptedDocuments(createDocumentState(alreadyAccepted || false));
    setContentHeight(0);
    setLayoutHeight(0);
  }, [visible, alreadyAccepted, isViewerMode, requireScroll]);

  useEffect(() => {
    if (!visible) return;
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    setContentHeight(0);
    setLayoutHeight(0);
  }, [activeDocument, visible]);

  // Auto-mark as read when content fits without scrolling
  useEffect(() => {
    if (!requireScroll || isViewerMode || alreadyAccepted) return;
    if (documentsRead[activeDocument]) return;
    if (contentHeight > 0 && layoutHeight > 0 && contentHeight <= layoutHeight + 48) {
      setDocumentsRead((prev) => ({ ...prev, [activeDocument]: true }));
    }
  }, [contentHeight, layoutHeight, activeDocument, requireScroll, isViewerMode, alreadyAccepted, documentsRead]);

  const canAccept = useMemo(() => {
    if (isViewerMode || alreadyAccepted) return false;
    return LEGAL_DOCUMENT_KEYS.every((key) => {
      const read = !requireScroll || documentsRead[key];
      return read && acceptedDocuments[key];
    });
  }, [acceptedDocuments, alreadyAccepted, documentsRead, isViewerMode, requireScroll]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!requireScroll || isViewerMode || alreadyAccepted) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 60) {
      setDocumentsRead((prev) => {
        if (prev[activeDocument]) return prev;
        return { ...prev, [activeDocument]: true };
      });
    }
  };

  const toggleAcceptance = (key: LegalDocumentKey) => {
    if (isViewerMode || alreadyAccepted) return;
    if (requireScroll && !documentsRead[key]) return;
    setAcceptedDocuments((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const activeDocumentDefinition = getLegalDocument(activeDocument);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={canClose && onClose ? onClose : undefined}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.modal,
            isCompactLayout && styles.modalCompact,
            {
              backgroundColor: themeColors.bgCard,
              width: Math.min(width - 24, 1080),
              maxHeight: Math.max(480, height - 24),
            },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
            <View style={styles.headerContent}>
              <View
                style={[styles.headerIcon, { backgroundColor: themeColors.purpleLight }]}
              >
                <Ionicons name="shield-checkmark" size={20} color={themeColors.purple} />
              </View>
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: themeColors.text }]}>
                  Política de Privacidade e Termos de Serviço
                </Text>
                <Text style={[styles.subtitle, { color: themeColors.textMuted }]}>
                  Os dois documentos ficam disponíveis por URL pública e precisam ser
                  aceitos para continuar.
                </Text>
              </View>
            </View>

            {canClose && onClose && (
              <Pressable onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={24} color={themeColors.textMuted} />
              </Pressable>
            )}
          </View>

          <View style={[styles.tabsRow, { borderBottomColor: themeColors.border }]}>
            {LEGAL_DOCUMENT_KEYS.map((documentKey) => {
              const doc = getLegalDocument(documentKey);
              const isActive = activeDocument === documentKey;
              const wasRead = documentsRead[documentKey];
              const wasAccepted = acceptedDocuments[documentKey] || alreadyAccepted;

              return (
                <Pressable
                  key={doc.key}
                  style={[
                    styles.tabButton,
                    {
                      backgroundColor: isActive
                        ? themeColors.purpleLight
                        : themeColors.bgSecondary,
                      borderColor: isActive ? themeColors.purple : themeColors.border,
                    },
                  ]}
                  onPress={() => setActiveDocument(documentKey)}
                >
                  <Text
                    style={[
                      styles.tabTitle,
                      {
                        color: isActive
                          ? themeColors.purple
                          : themeColors.textSecondary,
                      },
                    ]}
                  >
                    {doc.shortTitle}
                  </Text>
                  <Text
                    style={[
                      styles.tabStatus,
                      {
                        color: wasAccepted
                          ? "#16A34A"
                          : wasRead
                          ? "#CA8A04"
                          : themeColors.textMuted,
                      },
                    ]}
                  >
                    {wasAccepted ? "Aceito" : wasRead ? "Lido" : "Pendente"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.body, isCompactLayout && styles.bodyCompact]}>
            <View
              style={[
                styles.scrollContainer,
                isCompactLayout && styles.scrollContainerCompact,
              ]}
            >
              <ScrollView
                ref={scrollViewRef}
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator
                onContentSizeChange={(_w, h) => setContentHeight(h)}
                onLayout={(e: LayoutChangeEvent) =>
                  setLayoutHeight(e.nativeEvent.layout.height)
                }
              >
                <LegalDocumentContent
                  documentKey={activeDocument}
                  titleColor={themeColors.text}
                  textColor={themeColors.textSecondary}
                  mutedColor={themeColors.textMuted}
                  accentColor={themeColors.purple}
                />
              </ScrollView>
            </View>

            <ScrollView
              style={[
                styles.sidePanel,
                isCompactLayout && styles.sidePanelCompact,
                {
                  backgroundColor: themeColors.bgSecondary,
                  borderColor: themeColors.border,
                },
              ]}
              contentContainerStyle={styles.sidePanelContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.sidePanelTitle, { color: themeColors.text }]}>
                Confirmação de leitura e aceite
              </Text>
              <Text
                style={[
                  styles.sidePanelDescription,
                  { color: themeColors.textMuted },
                ]}
              >
                Leia cada documento, marque o aceite correspondente e finalize no
                botão abaixo.
              </Text>

              {LEGAL_DOCUMENT_KEYS.map((documentKey) => {
                const doc = getLegalDocument(documentKey);
                const isDisabled =
                  !isViewerMode &&
                  !alreadyAccepted &&
                  requireScroll &&
                  !documentsRead[documentKey];
                const checked = acceptedDocuments[documentKey] || alreadyAccepted;

                return (
                  <View
                    key={`acceptance-${doc.key}`}
                    style={[
                      styles.acceptanceCard,
                      {
                        backgroundColor: themeColors.bgCard,
                        borderColor: themeColors.border,
                      },
                    ]}
                  >
                    <View style={styles.acceptanceHeader}>
                      <View style={styles.acceptanceLabelBox}>
                        <Text
                          style={[styles.acceptanceTitle, { color: themeColors.text }]}
                        >
                          {doc.title}
                        </Text>
                        <Text
                          style={[
                            styles.acceptanceStatus,
                            {
                              color: checked
                                ? "#16A34A"
                                : documentsRead[documentKey]
                                ? "#CA8A04"
                                : themeColors.textMuted,
                            },
                          ]}
                        >
                          {checked
                            ? "Aceito"
                            : documentsRead[documentKey]
                            ? "Leitura concluída"
                            : "Leitura pendente"}
                        </Text>
                      </View>

                      <Pressable
                        style={[
                          styles.checkbox,
                          {
                            borderColor: checked
                              ? themeColors.purple
                              : themeColors.border,
                            backgroundColor: checked
                              ? themeColors.purpleLight
                              : themeColors.bgCard,
                            opacity: isDisabled ? 0.55 : 1,
                          },
                        ]}
                        onPress={() => toggleAcceptance(documentKey)}
                        disabled={isDisabled}
                      >
                        <Ionicons
                          name={checked ? "checkmark" : "add"}
                          size={18}
                          color={
                            checked
                              ? themeColors.purple
                              : isDisabled
                              ? themeColors.textMuted
                              : themeColors.textSecondary
                          }
                        />
                      </Pressable>
                    </View>

                    <Text
                      style={[styles.acceptanceHint, { color: themeColors.textMuted }]}
                    >
                      {requireScroll && !documentsRead[documentKey]
                        ? "Role o documento até o final para liberar o aceite."
                        : "Marque esta opção para registrar o aceite deste documento."}
                    </Text>

                    {Platform.OS === "web" && (
                      <Pressable
                        style={styles.urlButton}
                        onPress={() => openLegalUrl(documentKey)}
                      >
                        <Ionicons
                          name="open-outline"
                          size={14}
                          color={themeColors.purple}
                        />
                        <Text
                          style={[styles.urlButtonText, { color: themeColors.purple }]}
                        >
                          Abrir URL pública
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}

              <View
                style={[
                  styles.inlineUrlCard,
                  {
                    backgroundColor: themeColors.bgCard,
                    borderColor: themeColors.border,
                  },
                ]}
              >
                <Text
                  style={[styles.inlineUrlLabel, { color: themeColors.textMuted }]}
                >
                  URL da aba atual
                </Text>
                <Text
                  selectable
                  style={[styles.inlineUrlValue, { color: themeColors.text }]}
                >
                  {getLegalDocumentUrl(activeDocument)}
                </Text>
                <Text
                  style={[
                    styles.inlineUrlDescription,
                    { color: themeColors.textMuted },
                  ]}
                >
                  Documento atual: {activeDocumentDefinition.title}
                </Text>
              </View>
            </ScrollView>
          </View>

          {!alreadyAccepted &&
            requireScroll &&
            !documentsRead[activeDocument] &&
            !isViewerMode && (
              <View
                style={[
                  styles.scrollIndicator,
                  {
                    backgroundColor: themeColors.bgSecondary,
                    borderTopColor: themeColors.border,
                  },
                ]}
              >
                <Ionicons name="arrow-down" size={14} color={themeColors.textMuted} />
                <Text
                  style={[
                    styles.scrollIndicatorText,
                    { color: themeColors.textMuted },
                  ]}
                >
                  Role até o final de{" "}
                  {activeDocumentDefinition.shortTitle.toLowerCase()} para liberar o
                  aceite.
                </Text>
              </View>
            )}

          <View
            style={[
              styles.buttons,
              isStackedActions && styles.buttonsStacked,
              { borderTopColor: themeColors.border },
            ]}
          >
            {alreadyAccepted ? (
              <>
                <View
                  style={[
                    styles.acceptedIndicator,
                    isStackedActions && styles.acceptedIndicatorStacked,
                    { backgroundColor: themeColors.bgSecondary },
                  ]}
                >
                  <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
                  <Text
                    style={[styles.acceptedText, { color: themeColors.textMuted }]}
                  >
                    Estes documentos já estão aceitos para este usuário.
                  </Text>
                </View>

                {onClose && (
                  <Pressable
                    style={[
                      styles.primaryAction,
                      { backgroundColor: themeColors.purple },
                    ]}
                    onPress={onClose}
                  >
                    <Text style={styles.primaryActionText}>Fechar</Text>
                  </Pressable>
                )}
              </>
            ) : isViewerMode ? (
              <Pressable
                style={[
                  styles.primaryAction,
                  { backgroundColor: themeColors.purple },
                ]}
                onPress={onClose}
              >
                <Text style={styles.primaryActionText}>Fechar</Text>
              </Pressable>
            ) : (
              <>
                {canClose && onClose && (
                  <Pressable
                    style={[
                      styles.secondaryAction,
                      isStackedActions && styles.actionButtonStacked,
                      { backgroundColor: themeColors.bgSecondary },
                    ]}
                    onPress={onClose}
                  >
                    <Text
                      style={[
                        styles.secondaryActionText,
                        { color: themeColors.textSecondary },
                      ]}
                    >
                      Fechar
                    </Text>
                  </Pressable>
                )}

                <Pressable
                  style={[
                    styles.primaryAction,
                    isStackedActions && styles.actionButtonStacked,
                    {
                      backgroundColor: canAccept
                        ? themeColors.purple
                        : themeColors.bgSecondary,
                    },
                    !canAccept && styles.disabledButton,
                  ]}
                  onPress={() => canAccept && onAccept()}
                  disabled={!canAccept}
                >
                  <Text
                    style={[
                      styles.primaryActionText,
                      { color: canAccept ? "#FFFFFF" : themeColors.textMuted },
                    ]}
                  >
                    Aceitar política e termos
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// Public component – delegates to the right mode
// ─────────────────────────────────────────────

export default function PrivacyPolicyModal(props: PrivacyPolicyModalProps) {
  if (props.documentKey) {
    return (
      <SingleDocumentModal
        visible={props.visible}
        documentKey={props.documentKey}
        onAccept={props.onAccept}
        onClose={props.onClose}
        requireScroll={props.requireScroll ?? true}
        showCloseButton={props.showCloseButton ?? false}
        alreadyAccepted={props.alreadyAccepted ?? false}
      />
    );
  }

  return <MultiDocumentModal {...props} />;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.56)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modal: {
    maxWidth: 1080,
    borderRadius: 24,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 24px 60px rgba(15, 23, 42, 0.24)",
      },
      default: {
        elevation: 10,
      },
    }),
  },
  modalCompact: {
    borderRadius: 22,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 20,
  },
  // ─── Tabs (multi‑doc) ───
  tabsRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  tabButton: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tabTitle: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 2,
  },
  tabStatus: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  // ─── Body (multi‑doc) ───
  body: {
    flexDirection: "row",
    gap: 18,
    padding: 24,
    flex: 1,
    minHeight: 0,
  },
  bodyCompact: {
    flexDirection: "column",
  },
  scrollContainer: {
    flex: 1.45,
    minHeight: 0,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  scrollContainerCompact: {
    minHeight: 280,
    maxHeight: 340,
    flex: 0,
  },
  // ─── Single‑doc scroll ───
  singleScrollContainer: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#FFFFFF",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  // ─── Side panel (multi‑doc) ───
  sidePanel: {
    flex: 0.9,
    borderWidth: 1,
    borderRadius: 20,
    minWidth: 280,
    minHeight: 0,
  },
  sidePanelCompact: {
    minWidth: 0,
    maxHeight: 320,
  },
  sidePanelContent: {
    padding: 18,
  },
  sidePanelTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 6,
  },
  sidePanelDescription: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 16,
  },
  acceptanceCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  acceptanceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  acceptanceLabelBox: {
    flex: 1,
  },
  acceptanceTitle: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 4,
  },
  acceptanceStatus: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  checkbox: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptanceHint: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
    marginBottom: 10,
  },
  urlButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
  },
  urlButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  inlineUrlCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginTop: 4,
  },
  inlineUrlLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  inlineUrlValue: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 6,
  },
  inlineUrlDescription: {
    fontSize: 12,
    lineHeight: 18,
  },
  scrollIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  scrollIndicatorText: {
    fontSize: 12,
    fontWeight: "700",
  },
  // ─── Buttons (multi‑doc) ───
  buttons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    alignItems: "center",
  },
  buttonsStacked: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  acceptedIndicator: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  acceptedIndicatorStacked: {
    width: "100%",
  },
  acceptedText: {
    fontSize: 13,
    fontWeight: "700",
  },
  secondaryAction: {
    minWidth: 120,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: "700",
  },
  primaryAction: {
    flex: 1,
    minWidth: 160,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  actionButtonStacked: {
    width: "100%",
    minWidth: 0,
  },
  disabledButton: {
    opacity: 0.65,
  },
  // ─── Single‑doc footer ───
  singleFooter: {
    borderTopWidth: 1,
    padding: 20,
    gap: 14,
  },
  singleCheckRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  singleCheckLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
});
