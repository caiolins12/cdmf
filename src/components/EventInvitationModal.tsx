import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Modal, Pressable, ActivityIndicator, Animated, Platform } from "react-native";
import { showAlert } from "../utils/alert";
import { Ionicons } from "@/shims/icons";
import { colors } from "../theme/colors";
import { useAuth, PaymentNotification, Event } from "../contexts/AuthContext";
import { usePayment, formatCurrency } from "../contexts/PaymentContext";
import { useActivity } from "../contexts/ActivityContext";

interface EventInvitationModalProps {
  visible: boolean;
  invitation: PaymentNotification | null;
  onClose: () => void;
  onConfirm: () => void;
  onDecline?: () => void;
  onMaybe?: () => void;
}

// Personalização completa por tipo de evento
interface EventTypeConfig {
  color: string;
  icon: string;
  emoji: string;
  title: string;
  subtitle: string;
  confirmText: string;
  declineText: string;
  priceLabel: string;
}

const EVENT_TYPE_CONFIG: Record<string, EventTypeConfig> = {
  baile: {
    color: "#7C3AED",
    icon: "musical-notes",
    emoji: "💃",
    title: "Convite para o Baile!",
    subtitle: "Uma noite especial de dança te espera",
    confirmText: "Vou dançar!",
    declineText: "Não vou",
    priceLabel: "🎫 Valor do Ingresso",
  },
  workshop: {
    color: "#0891B2",
    icon: "school",
    emoji: "📝",
    title: "Convite para Workshop!",
    subtitle: "Uma oportunidade única de aprendizado",
    confirmText: "Quero aprender!",
    declineText: "Não vou",
    priceLabel: "📱 Valor da Inscrição",
  },
  aula_especial: {
    color: "#F59E0B",
    icon: "star",
    emoji: "⭐",
    title: "Aula Especial!",
    subtitle: "Uma aula diferenciada preparada para você",
    confirmText: "Quero participar!",
    declineText: "Não vou",
    priceLabel: "👤 Valor da Aula",
  },
  evento_social: {
    color: "#10B981",
    icon: "people",
    emoji: "🎊",
    title: "Evento Social!",
    subtitle: "Venha se divertir com a gente",
    confirmText: "Estarei lá!",
    declineText: "Não vou",
    priceLabel: "🎫 Valor do Evento",
  },
  outro: {
    color: "#64748B",
    icon: "calendar",
    emoji: "📅",
    title: "Você foi convidado!",
    subtitle: "Não perca este evento especial",
    confirmText: "Vou participar!",
    declineText: "Não vou",
    priceLabel: "👤 Valor",
  },
};

// Função para obter configuração do tipo de evento
const getEventConfig = (type: string): EventTypeConfig => {
  return EVENT_TYPE_CONFIG[type] || EVENT_TYPE_CONFIG.outro;
};

export default function EventInvitationModal({
  visible,
  invitation,
  onClose,
  onConfirm,
  onDecline,
  onMaybe,
}: EventInvitationModalProps) {
  const { profile, confirmEventAttendance, rejectEventAttendance, fetchEvents } = useAuth();
  const { createInvoice, fetchInvoices } = usePayment();
  const { logActivity } = useActivity();
  const [loading, setLoading] = useState(false);
  const [event, setEvent] = useState<Event | null>(null);
  const [scaleAnim] = useState(new Animated.Value(0));
  const [declineButtonScale] = useState(new Animated.Value(1));
  const [maybeButtonScale] = useState(new Animated.Value(1));
  const [confirmButtonScale] = useState(new Animated.Value(1));

  // Animação de feedback para botões
  const animateButton = (buttonAnim: Animated.Value) => {
    Animated.sequence([
      Animated.timing(buttonAnim, {
        toValue: 0.92,
        duration: 100,
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(buttonAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start();
  };

  useEffect(() => {
    // Usa voucherId ou eventId para buscar o evento
    const eventId = invitation?.voucherId || invitation?.eventId;
    if (eventId) {
      loadEvent(eventId);
    }
  }, [invitation]);

  useEffect(() => {
    if (visible) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: Platform.OS !== "web",
      }).start();
    } else {
      // Animação suave de fechamento
      Animated.timing(scaleAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: Platform.OS !== "web",
      }).start();
      // Reseta o loading quando o modal fecha para garantir estado limpo na próxima abertura
      setLoading(false);
    }
  }, [visible]);

  const loadEvent = async (eventId: string) => {
    try {
      const events = await fetchEvents();
      const foundEvent = events.find(e => e.id === eventId);
      setEvent(foundEvent || null);
    } catch (e) {
      console.error("Erro ao carregar evento:", e);
    }
  };

  const handleConfirm = async () => {
    // Animação de feedback
    animateButton(confirmButtonScale);

    // Usa voucherId ou eventId para identificar o evento
    const eventId = invitation?.voucherId || invitation?.eventId;
    if (!eventId || !event || !profile) {
      console.error("[EventInvitationModal] Dados insuficientes:", { eventId, event, profile });
      return;
    }

    setLoading(true);
    try {
      // Se o evento requer pagamento, confirma presença E gera ingresso
      if (event.requiresPayment && event.price) {
        try {
          console.log("Confirmando presença e gerando ingresso para evento (convite):", {
            eventId: event.id,
            eventName: event.name,
            studentId: profile.uid,
            studentName: profile.name,
            studentEmail: profile.email,
            price: event.price,
            date: event.date
          });

          // Verifica se já existe invoice para este evento
          const existingInvoices = await fetchInvoices({ studentId: profile.uid });
          const existingInvoice = existingInvoices.find(inv =>
            inv.description?.includes(`Ingresso: ${event.name}`) &&
            inv.studentId === profile.uid
          );

          if (existingInvoice) {
            console.log("Já existe invoice para este evento:", existingInvoice.id);
            showAlert(
              "Ingresso Já Existe",
              `Você já possui um ingresso para este evento. Realize o pagamento na aba "Pagamentos" para confirmar sua presença.`,
              [{ text: "OK" }]
            );
            onConfirm();
            return;
          }

          // Gera ingresso (presença será confirmada após pagamento)
          const invoiceData = {
            studentId: profile.uid,
            studentName: profile.name,
            studentEmail: profile.email || "",
            amount: event.price,
            originalAmount: event.price,
            discountAmount: 0,
            description: `Ingresso: ${event.name}${event.time ? ` - ${event.time}` : ""}${event.location ? ` - ${event.location}` : ""}`,
            dueDate: event.date,
            lateDueDate: event.date,
            status: "pending" as const,
            referenceMonth: event.date.substring(0, 7),
            classIds: [],
            classCount: 0,
            type: (event.type === "baile" ? "baile" : "outro") as "baile" | "outro",
          };

          console.log("Dados do ingresso (convite):", invoiceData);
          await createInvoice(invoiceData);

          // Cria notificação de atividade para o aluno
          try {
            await logActivity({
              type: "payment_generated",
              title: "🎫 Ingresso de Evento Gerado",
              description: `Seu ingresso para o evento "${event.name}" foi gerado. Sua presença será confirmada APENAS após o pagamento de ${formatCurrency(event.price)}.`,
              metadata: {
                eventId: event.id,
                eventName: event.name,
                amount: event.price,
              },
            });
          } catch (activityError) {
            console.warn("Erro ao criar atividade de geração de ingresso:", activityError);
          }

          // Mostra mensagem de sucesso
          showAlert(
            "Ingresso Gerado! 🎉",
            `Um ingresso no valor de ${formatCurrency(event.price)} foi gerado.\n\n⚠️ Sua presença será confirmada APENAS após o pagamento.\n\nAcesse a aba "Pagamentos" para pagar e confirmar sua participação.`,
            [{ text: "OK" }]
          );
        } catch (invoiceError: any) {
          console.error("Erro ao criar ingresso:", invoiceError);
          const errorMessage = invoiceError?.message || "Houve um problema ao gerar o ingresso.";
          showAlert("Erro", errorMessage);
          setLoading(false);
          return; // Não continua se falhar a criação do ingresso
        }
      } else {
        // Evento gratuito - confirma presença imediatamente
        await confirmEventAttendance(eventId);
        showAlert("Presença Confirmada! 🎉", "Você está confirmado no evento! Te esperamos lá!");
      }

      // Fecha o modal (o loading será resetado automaticamente pelo useEffect quando visible = false)
      onConfirm();
    } catch (e: any) {
      // Em caso de erro, desativa loading e fecha o modal
      setLoading(false);
      showAlert("Erro", e.message || "Não foi possível confirmar sua presença");
      // Fecha mesmo com erro
      onConfirm();
    }
  };

  const handleDecline = async () => {
    // Animação de feedback
    animateButton(declineButtonScale);

    // Usa voucherId ou eventId para identificar o evento
    const eventId = invitation?.voucherId || invitation?.eventId;
    if (!eventId || !event || !profile) {
      if (onDecline) {
        onDecline();
      } else {
        onClose();
      }
      return;
    }

    // NÃO seta loading = true aqui, pois isso causa mudança de layout no botão "Vou participar!"
    // que mostra ActivityIndicator quando loading está true
    try {
      // Registra que o aluno recusou participar (remove a notificação do Firestore)
      await rejectEventAttendance(eventId);

      // Fecha o modal imediatamente
      if (onDecline) {
        onDecline();
      } else {
        onClose();
      }
    } catch (e: any) {
      // Em caso de erro, apenas mostra alert e fecha
      showAlert("Erro", e.message || "Não foi possível registrar sua resposta");
      // Fecha mesmo com erro
      if (onDecline) {
        onDecline();
      } else {
        onClose();
      }
    }
  };

  const handleMaybe = () => {
    // Animação de feedback
    animateButton(maybeButtonScale);

    if (onMaybe) {
      onMaybe();
    } else {
      onClose();
    }
  };

  if (!invitation || !event) return null;

  // Obtém configuração personalizada baseada no tipo de evento
  const config = getEventConfig(event.type);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <Animated.View style={[styles.modalContainer, { transform: [{ scale: scaleAnim }] }]}>
            <View style={[styles.modal, { borderTopColor: config.color }]}>
            {/* Header personalizado por tipo de evento */}
            <View style={[styles.header, { backgroundColor: config.color + "15" }]}>
              <View style={[styles.iconContainer, { backgroundColor: config.color }]}>
                <Ionicons name={config.icon as any} size={40} color="#fff" />
              </View>
              <Text style={styles.title}>{config.emoji} {config.title}</Text>
              <Text style={styles.subtitle}>{config.subtitle}</Text>
            </View>

            <View style={styles.content}>
              <Text style={[styles.eventName, { color: config.color }]}>{event.name}</Text>
              
              <View style={styles.details}>
                {event.date && (
                  <View style={styles.detailRow}>
                    <View style={[styles.detailIcon, { backgroundColor: config.color + "20" }]}>
                      <Ionicons name="calendar" size={16} color={config.color} />
                    </View>
                    <Text style={styles.detailText}>
                      {new Date(event.date).toLocaleDateString("pt-BR", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </Text>
                  </View>
                )}
                
                {event.time && (
                  <View style={styles.detailRow}>
                    <View style={[styles.detailIcon, { backgroundColor: config.color + "20" }]}>
                      <Ionicons name="time" size={16} color={config.color} />
                    </View>
                    <Text style={styles.detailText}>{event.time}</Text>
                  </View>
                )}
                
                {event.location && (
                  <View style={styles.detailRow}>
                    <View style={[styles.detailIcon, { backgroundColor: config.color + "20" }]}>
                      <Ionicons name="location" size={16} color={config.color} />
                    </View>
                    <Text style={styles.detailText}>{event.location}</Text>
                  </View>
                )}
              </View>

              {event.description && (
                <View style={styles.descriptionBox}>
                  <Text style={styles.description}>{event.description}</Text>
                </View>
              )}

              {event.requiresPayment && event.price && (
                <View style={[styles.priceBox, { backgroundColor: config.color + "15", borderColor: config.color + "40" }]}>
                  <Text style={styles.priceLabel}>{config.priceLabel}</Text>
                  <Text style={[styles.priceValue, { color: config.color }]}>
                    R$ {(event.price / 100).toFixed(2).replace(".", ",")}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.actions}>
              <Animated.View style={{ flex: 1, transform: [{ scale: declineButtonScale }] }}>
                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    styles.declineButton,
                    pressed && { opacity: 0.8 }
                  ]}
                  onPress={handleDecline}
                  disabled={loading}
                >
                  <Ionicons name="close-circle" size={20} color={colors.danger} />
                  <Text style={styles.declineButtonText}>Não vou</Text>
                </Pressable>
              </Animated.View>
              <View style={styles.buttonDivider} />
              <Animated.View style={{ flex: 1, transform: [{ scale: maybeButtonScale }] }}>
                <Pressable
                  style={[styles.button, styles.maybeButton]}
                  onPress={handleMaybe}
                  disabled={loading}
                >
                  <Ionicons name="time" size={20} color="#F59E0B" />
                  <Text style={styles.maybeButtonText}>Pensar</Text>
                </Pressable>
              </Animated.View>
              <View style={styles.buttonDivider} />
              <Animated.View style={{ flex: 1, transform: [{ scale: confirmButtonScale }] }}>
                <Pressable
                  style={[styles.button, styles.confirmButton]}
                  onPress={handleConfirm}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color="#fff" />
                      <Text style={styles.confirmButtonText}>{config.confirmText}</Text>
                    </>
                  )}
                </Pressable>
              </Animated.View>
            </View>
          </View>
        </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContainer: {
    width: "100%",
    maxWidth: 420,
  },
  modal: {
    backgroundColor: "#fff",
    borderRadius: 24,
    overflow: "hidden",
    borderTopWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    alignItems: "center",
    padding: 28,
    paddingBottom: 20,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 6,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: "600",
  },
  content: {
    padding: 24,
  },
  eventName: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 20,
    textAlign: "center",
  },
  details: {
    gap: 12,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  detailIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  detailText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: "600",
    flex: 1,
  },
  descriptionBox: {
    backgroundColor: "#F8F9FA",
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  description: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  priceBox: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    alignItems: "center",
    borderWidth: 2,
  },
  priceLabel: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 6,
    fontWeight: "600",
  },
  priceValue: {
    fontSize: 24,
    fontWeight: "800",
  },
  actions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#E8E8E8",
    alignItems: "stretch",
    backgroundColor: "#FAFAFA",
    overflow: "hidden",
  },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    paddingHorizontal: 12,
    gap: 8,
    minHeight: 64,
    position: "relative",
  },
  buttonDivider: {
    width: 1,
    backgroundColor: "#E2E8F0",
    alignSelf: "stretch",
  },
  declineButton: {
    backgroundColor: "#FFF5F5",
    borderWidth: 0,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderColor: "transparent",
    outlineWidth: 0,
    ...(Platform.OS === "web" && {
      outline: "none",
      borderStyle: "none",
      boxShadow: "none",
      WebkitTapHighlightColor: "transparent",
    }),
  },
  declineButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.danger,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  maybeButton: {
    backgroundColor: "#FFFBEB",
    borderRightWidth: 0,
    borderLeftWidth: 0,
    borderWidth: 0,
  },
  maybeButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#F59E0B",
    textAlign: "center",
    letterSpacing: 0.3,
  },
  confirmButton: {
    backgroundColor: "#10B981",
    borderLeftWidth: 0,
    borderWidth: 0,
  },
  confirmButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    letterSpacing: 0.3,
  },
});


