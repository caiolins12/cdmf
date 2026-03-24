/**
 * ConversationList - Lista de conversas do WhatsApp
 */

import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput } from "react-native";
import { Ionicons } from "@/shims/icons";
import { colors } from "../../theme/colors";
import { Conversation } from "../../services/WhatsAppService";

interface ConversationListProps {
    conversations: Conversation[];
    selectedId?: string;
    onSelect: (conversation: Conversation) => void;
    filter: "all" | "unread" | "open";
    onFilterChange: (filter: "all" | "unread" | "open") => void;
    searchQuery: string;
    onSearchChange: (query: string) => void;
}

export default function ConversationList({
    conversations,
    selectedId,
    onSelect,
    filter,
    onFilterChange,
    searchQuery,
    onSearchChange,
}: ConversationListProps) {
    // Filter conversations
    const filteredConversations = conversations.filter((conv) => {
        // Filter by search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            if (!conv.studentName.toLowerCase().includes(query) && !conv.studentPhone.includes(query)) {
                return false;
            }
        }

        // Filter by status
        if (filter === "unread" && conv.unreadCount === 0) return false;
        if (filter === "open" && conv.status !== "open") return false;

        return true;
    });

    // Format time
    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();

        if (diff < 60000) return "agora";
        if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
        if (diff < 86400000) return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        if (diff < 172800000) return "ontem";
        return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    };

    return (
        <View style={styles.container}>
            {/* Search */}
            <View style={styles.searchContainer}>
                <Ionicons name="search" size={18} color="#94A3B8" style={styles.searchIcon} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Buscar conversa..."
                    placeholderTextColor="#94A3B8"
                    value={searchQuery}
                    onChangeText={onSearchChange}
                />
            </View>

            {/* Filters */}
            <View style={styles.filters}>
                {(["all", "unread", "open"] as const).map((f) => (
                    <Pressable
                        key={f}
                        style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
                        onPress={() => onFilterChange(f)}
                    >
                        <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                            {f === "all" ? "Todas" : f === "unread" ? "Não lidas" : "Abertas"}
                        </Text>
                    </Pressable>
                ))}
            </View>

            {/* Conversations */}
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                {filteredConversations.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="chatbubbles-outline" size={48} color="#CBD5E1" />
                        <Text style={styles.emptyText}>Nenhuma conversa</Text>
                    </View>
                ) : (
                    filteredConversations.map((conv) => (
                        <Pressable
                            key={conv.id}
                            style={[styles.conversationItem, selectedId === conv.id && styles.conversationItemActive]}
                            onPress={() => onSelect(conv)}
                        >
                            {/* Avatar */}
                            <View style={[styles.avatar, conv.status === "resolved" && styles.avatarResolved]}>
                                <Text style={styles.avatarText}>{conv.studentName.charAt(0).toUpperCase()}</Text>
                            </View>

                            {/* Content */}
                            <View style={styles.conversationContent}>
                                <View style={styles.conversationHeader}>
                                    <Text style={styles.conversationName} numberOfLines={1}>
                                        {conv.studentName}
                                    </Text>
                                    <Text style={styles.conversationTime}>{formatTime(conv.lastMessageAt)}</Text>
                                </View>

                                <View style={styles.conversationFooter}>
                                    <View style={styles.messagePreview}>
                                        {conv.lastMessageFrom === "business" && (
                                            <Ionicons name="checkmark-done" size={14} color="#94A3B8" style={{ marginRight: 4 }} />
                                        )}
                                        <Text style={styles.previewText} numberOfLines={1}>
                                            {conv.lastMessage}
                                        </Text>
                                    </View>

                                    {conv.unreadCount > 0 && (
                                        <View style={styles.unreadBadge}>
                                            <Text style={styles.unreadText}>{conv.unreadCount > 99 ? "99+" : conv.unreadCount}</Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        </Pressable>
                    ))
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#FFFFFF",
    },
    searchContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#F1F5F9",
        borderRadius: 8,
        margin: 12,
        paddingHorizontal: 12,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        paddingVertical: 10,
        fontSize: 14,
        color: "#1E293B",
    },
    filters: {
        flexDirection: "row",
        paddingHorizontal: 12,
        gap: 8,
        marginBottom: 8,
    },
    filterBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: "#F1F5F9",
    },
    filterBtnActive: {
        backgroundColor: colors.purple + "15",
    },
    filterText: {
        fontSize: 12,
        fontWeight: "500",
        color: "#64748B",
    },
    filterTextActive: {
        color: colors.purple,
        fontWeight: "600",
    },
    list: {
        flex: 1,
    },
    emptyState: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 14,
        color: "#94A3B8",
        marginTop: 12,
    },
    conversationItem: {
        flexDirection: "row",
        alignItems: "center",
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#F1F5F9",
    },
    conversationItemActive: {
        backgroundColor: colors.purple + "10",
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.purple,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 12,
    },
    avatarResolved: {
        backgroundColor: "#94A3B8",
    },
    avatarText: {
        color: "#FFFFFF",
        fontSize: 18,
        fontWeight: "700",
    },
    conversationContent: {
        flex: 1,
    },
    conversationHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 4,
    },
    conversationName: {
        fontSize: 15,
        fontWeight: "600",
        color: "#1E293B",
        flex: 1,
        marginRight: 8,
    },
    conversationTime: {
        fontSize: 12,
        color: "#94A3B8",
    },
    conversationFooter: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    messagePreview: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
    },
    previewText: {
        fontSize: 13,
        color: "#64748B",
        flex: 1,
    },
    unreadBadge: {
        backgroundColor: colors.green,
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 6,
        marginLeft: 8,
    },
    unreadText: {
        color: "#FFFFFF",
        fontSize: 11,
        fontWeight: "700",
    },
});


