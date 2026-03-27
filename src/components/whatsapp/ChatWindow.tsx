/**
 * ChatWindow - Interface de chat estilo WhatsApp
 */

import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, KeyboardAvoidingView } from "react-native";
import { Ionicons } from "@/shims/icons";
import { colors } from "../../theme/colors";
import { Conversation, Message, WhatsAppService } from "../../services/WhatsAppService";
import { showConfirm } from "../../utils/alert";

interface ChatWindowProps {
    conversation: Conversation | null;
    messages: Message[];
    loading: boolean;
    onSendMessage: (message: string) => Promise<void>;
    onMarkResolved: () => void;
    onDeleteConversation?: (conversationId: string) => void;
    onDisableBot?: () => void;
}

export default function ChatWindow({
    conversation,
    messages,
    loading,
    onSendMessage,
    onMarkResolved,
    onDeleteConversation,
    onDisableBot,
}: ChatWindowProps) {
    const [inputText, setInputText] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const scrollRef = useRef<ScrollView>(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        setTimeout(() => {
            scrollRef.current?.scrollToEnd({ animated: true });
        }, 100);
    }, [messages]);

    const handleSend = async () => {
        if (!inputText.trim() || sending) return;

        const text = inputText.trim();
        setInputText("");
        setSending(true);
        setError(null);

        try {
            await onSendMessage(text);
        } catch (err: any) {
            console.error("Error sending message:", err);
            setInputText(text); // Restore on error

            // Parse error message for user-friendly display
            const errorMsg = err?.message || "";
            if (errorMsg.includes("not connected") || errorMsg.includes("close")) {
                setError("WhatsApp desconectado. Reconecte nas Configurações.");
            } else if (errorMsg.includes("rate limit") || errorMsg.includes("too many")) {
                setError("Limite de mensagens atingido. Aguarde alguns minutos.");
            } else if (errorMsg.includes("not found") || errorMsg.includes("invalid")) {
                setError("Número inválido ou conversa não encontrada.");
            } else {
                setError("Erro ao enviar mensagem. Tente novamente.");
            }

            // Auto-clear error after 8 seconds
            setTimeout(() => setError(null), 8000);
        } finally {
            setSending(false);
        }
    };

    // Format time
    const formatTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    // Format date header
    const formatDateHeader = (timestamp: number) => {
        const date = new Date(timestamp);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) return "Hoje";
        if (date.toDateString() === yesterday.toDateString()) return "Ontem";
        return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    };

    // Get status icon
    const getStatusIcon = (status: string) => {
        switch (status) {
            case "sent":
                return <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.6)" />;
            case "delivered":
                return <Ionicons name="checkmark-done" size={14} color="rgba(255,255,255,0.6)" />;
            case "read":
                return <Ionicons name="checkmark-done" size={14} color="#4ADE80" />;
            case "failed":
                return <Ionicons name="alert-circle" size={14} color="#EF4444" />;
            default:
                return null;
        }
    };

    // Group messages by date
    const groupedMessages: { date: string; messages: Message[] }[] = [];
    let currentDate = "";

    messages.forEach((msg) => {
        const msgDate = new Date(msg.timestamp).toDateString();
        if (msgDate !== currentDate) {
            currentDate = msgDate;
            groupedMessages.push({ date: formatDateHeader(msg.timestamp), messages: [msg] });
        } else {
            groupedMessages[groupedMessages.length - 1].messages.push(msg);
        }
    });

    if (!conversation) {
        return (
            <View style={styles.emptyContainer}>
                <View style={styles.emptyContent}>
                    <Ionicons name="chatbubbles-outline" size={80} color="#E2E8F0" />
                    <Text style={styles.emptyTitle}>Selecione uma conversa</Text>
                    <Text style={styles.emptySubtitle}>Escolha uma conversa ao lado para ver as mensagens</Text>
                </View>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={undefined}
        >
            {/* Header */}
            <View style={styles.header}>
                {/* Linha 1: Identidade + lixeira */}
                <View style={styles.headerRow}>
                    <View style={styles.headerInfo}>
                        <View style={styles.headerAvatar}>
                            <Text style={styles.headerAvatarText}>{conversation.studentName.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={styles.headerTextWrap}>
                            <Text style={styles.headerName} numberOfLines={1}>{conversation.studentName}</Text>
                            <Text style={styles.headerPhone} numberOfLines={1}>{formatPhoneNumber(conversation.studentPhone)}</Text>
                        </View>
                    </View>
                    {onDeleteConversation && (
                        <Pressable
                            style={styles.deleteBtn}
                            onPress={() => showConfirm(
                                "Apagar conversa",
                                "Deseja apagar esta conversa? Esta ação não pode ser desfeita.",
                                () => onDeleteConversation(conversation.id)
                            )}
                        >
                            <Ionicons name="trash-outline" size={18} color="#EF4444" />
                        </Pressable>
                    )}
                </View>

                {/* Linha 2: Ações do atendimento */}
                <View style={styles.headerActions}>
                    {conversation.botPhase === "active" && (
                        <View style={styles.botActiveBadge}>
                            <Text style={styles.botBadgeText}>🤖 Bot ativo</Text>
                        </View>
                    )}
                    {conversation.botPhase === "disabled" && (
                        <View style={styles.botDisabledBadge}>
                            <Text style={styles.botDisabledText}>🤖 Bot pausado</Text>
                        </View>
                    )}
                    {conversation.botPhase === "active" && onDisableBot && (
                        <Pressable
                            style={styles.takeOverBtn}
                            onPress={() => showConfirm(
                                "Assumir atendimento",
                                "O bot será pausado e você poderá responder manualmente. O bot voltará a funcionar após a conversa ser resolvida.",
                                () => onDisableBot()
                            )}
                        >
                            <Ionicons name="person-outline" size={14} color="#7C3AED" />
                            <Text style={styles.takeOverBtnText}>Assumir</Text>
                        </Pressable>
                    )}
                    {conversation.status === "open" && (
                        <Pressable style={styles.resolveBtn} onPress={onMarkResolved}>
                            <Ionicons name="checkmark-circle-outline" size={16} color={colors.green} />
                            <Text style={styles.resolveBtnText}>Resolver</Text>
                        </Pressable>
                    )}
                    {conversation.status === "resolved" && (
                        <View style={styles.resolvedBadge}>
                            <Ionicons name="checkmark-circle" size={13} color="#10B981" />
                            <Text style={styles.resolvedText}>Resolvido</Text>
                        </View>
                    )}
                </View>
            </View>

            {/* Messages */}
            <ScrollView
                ref={scrollRef}
                style={styles.messagesContainer}
                contentContainerStyle={styles.messagesContent}
                showsVerticalScrollIndicator={false}
            >
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={colors.purple} />
                    </View>
                ) : groupedMessages.length === 0 ? (
                    <View style={styles.noMessages}>
                        <Ionicons name="chatbubble-ellipses-outline" size={48} color="#CBD5E1" />
                        <Text style={styles.noMessagesText}>Nenhuma mensagem ainda</Text>
                    </View>
                ) : (
                    groupedMessages.map((group, groupIndex) => (
                        <View key={groupIndex}>
                            {/* Date Header */}
                            <View style={styles.dateHeader}>
                                <Text style={styles.dateHeaderText}>{group.date}</Text>
                            </View>

                            {/* Messages */}
                            {group.messages.map((msg) => (
                                <View
                                    key={msg.id}
                                    style={[
                                        styles.messageBubble,
                                        msg.from === "business" ? styles.messageSent : styles.messageReceived,
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.messageText,
                                            msg.from === "business" ? styles.messageTextSent : styles.messageTextReceived,
                                        ]}
                                    >
                                        {msg.content}
                                    </Text>
                                    <View style={styles.messageFooter}>
                                        <Text
                                            style={[
                                                styles.messageTime,
                                                msg.from === "business" ? styles.messageTimeSent : styles.messageTimeReceived,
                                            ]}
                                        >
                                            {formatTime(msg.timestamp)}
                                        </Text>
                                        {msg.from === "business" && getStatusIcon(msg.status)}
                                    </View>
                                </View>
                            ))}
                        </View>
                    ))
                )}
            </ScrollView>

            {/* Error Banner */}
            {error && (
                <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle" size={18} color="#DC2626" />
                    <Text style={styles.errorText}>{error}</Text>
                    <Pressable onPress={() => setError(null)} style={styles.errorClose}>
                        <Ionicons name="close" size={18} color="#DC2626" />
                    </Pressable>
                </View>
            )}

            {/* Input */}
            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.textInput}
                    placeholder="Digite sua mensagem..."
                    placeholderTextColor="#94A3B8"
                    value={inputText}
                    onChangeText={setInputText}
                    multiline
                    maxLength={4096}
                    onSubmitEditing={handleSend}
                />
                <Pressable
                    style={[styles.sendBtn, (!inputText.trim() || sending) && styles.sendBtnDisabled]}
                    onPress={handleSend}
                    disabled={!inputText.trim() || sending}
                >
                    {sending ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                        <Ionicons name="send" size={20} color="#FFFFFF" />
                    )}
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
}

// Format phone number
function formatPhoneNumber(phone: string): string {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 13) {
        return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
    }
    return phone;
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F8FAFC",
    },
    emptyContainer: {
        flex: 1,
        backgroundColor: "#F8FAFC",
        alignItems: "center",
        justifyContent: "center",
    },
    emptyContent: {
        alignItems: "center",
        padding: 40,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: "600",
        color: "#64748B",
        marginTop: 20,
    },
    emptySubtitle: {
        fontSize: 14,
        color: "#94A3B8",
        textAlign: "center",
        marginTop: 8,
    },
    header: {
        flexDirection: "column",
        paddingHorizontal: 14,
        paddingTop: 12,
        paddingBottom: 8,
        backgroundColor: "#FFFFFF",
        borderBottomWidth: 1,
        borderBottomColor: "#E2E8F0",
        gap: 8,
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    headerInfo: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
        minWidth: 0,
    },
    headerTextWrap: {
        flex: 1,
        minWidth: 0,
    },
    headerAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.purple,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 10,
        flexShrink: 0,
    },
    headerAvatarText: {
        color: "#FFFFFF",
        fontSize: 17,
        fontWeight: "700",
    },
    headerName: {
        fontSize: 15,
        fontWeight: "600",
        color: "#1E293B",
    },
    headerPhone: {
        fontSize: 12,
        color: "#64748B",
    },
    headerActions: {
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 6,
    },
    resolveBtn: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 14,
        backgroundColor: colors.green + "15",
        gap: 4,
    },
    resolveBtnText: {
        fontSize: 12,
        fontWeight: "600",
        color: colors.green,
    },
    resolvedBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor: "#D1FAE5",
        borderRadius: 12,
    },
    resolvedText: {
        fontSize: 12,
        color: "#10B981",
        fontWeight: "500",
    },
    deleteBtn: {
        padding: 7,
        borderRadius: 8,
        backgroundColor: "#FEF2F2",
        flexShrink: 0,
    },
    botActiveBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        backgroundColor: "#EDE9FE",
    },
    botBadgeText: {
        fontSize: 11,
        color: "#7C3AED",
        fontWeight: "600",
    },
    botDisabledBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        backgroundColor: "#F1F5F9",
    },
    botDisabledText: {
        fontSize: 11,
        color: "#64748B",
        fontWeight: "600",
    },
    takeOverBtn: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 14,
        backgroundColor: "#EDE9FE",
        gap: 4,
    },
    takeOverBtnText: {
        fontSize: 12,
        fontWeight: "600",
        color: "#7C3AED",
    },
    messagesContainer: {
        flex: 1,
        backgroundColor: "#F1F5F9",
    },
    messagesContent: {
        padding: 16,
        paddingBottom: 24,
    },
    loadingContainer: {
        padding: 40,
        alignItems: "center",
    },
    noMessages: {
        alignItems: "center",
        paddingVertical: 60,
    },
    noMessagesText: {
        fontSize: 14,
        color: "#94A3B8",
        marginTop: 12,
    },
    dateHeader: {
        alignItems: "center",
        marginVertical: 16,
    },
    dateHeaderText: {
        fontSize: 12,
        color: "#64748B",
        backgroundColor: "rgba(255,255,255,0.9)",
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
    },
    messageBubble: {
        maxWidth: "75%",
        padding: 12,
        borderRadius: 16,
        marginBottom: 8,
    },
    messageSent: {
        backgroundColor: colors.purple,
        alignSelf: "flex-end",
        borderBottomRightRadius: 4,
    },
    messageReceived: {
        backgroundColor: "#FFFFFF",
        alignSelf: "flex-start",
        borderBottomLeftRadius: 4,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    messageText: {
        fontSize: 15,
        lineHeight: 20,
    },
    messageTextSent: {
        color: "#FFFFFF",
    },
    messageTextReceived: {
        color: "#1E293B",
    },
    messageFooter: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-end",
        marginTop: 4,
        gap: 4,
    },
    messageTime: {
        fontSize: 11,
    },
    messageTimeSent: {
        color: "rgba(255,255,255,0.7)",
    },
    messageTimeReceived: {
        color: "#94A3B8",
    },
    inputContainer: {
        flexDirection: "row",
        alignItems: "flex-end",
        padding: 12,
        backgroundColor: "#FFFFFF",
        borderTopWidth: 1,
        borderTopColor: "#E2E8F0",
        gap: 8,
    },
    textInput: {
        flex: 1,
        backgroundColor: "#F1F5F9",
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: 15,
        maxHeight: 100,
        color: "#1E293B",
    },
    sendBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.purple,
        alignItems: "center",
        justifyContent: "center",
    },
    sendBtnDisabled: {
        backgroundColor: "#CBD5E1",
    },
    errorBanner: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FEE2E2",
        paddingVertical: 10,
        paddingHorizontal: 12,
        gap: 8,
        borderTopWidth: 1,
        borderTopColor: "#FECACA",
    },
    errorText: {
        flex: 1,
        fontSize: 13,
        color: "#DC2626",
        lineHeight: 18,
    },
    errorClose: {
        padding: 4,
    },
});


