/**
 * MasterCommunicationsScreen - Central de Comunicações WhatsApp via Evolution API
 * Layout responsivo estilo WhatsApp Web com conversas, chat, disparos e configurações
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    useWindowDimensions,
    ActivityIndicator,
    ScrollView,
    Image,
    Platform,
} from "react-native";
import { Ionicons } from "@/shims/icons";
import { showConfirm } from "../../utils/alert";
import { colors } from "../../theme/colors";
import { WhatsAppService, Conversation, Message, InstanceStatus } from "../../services/WhatsAppService";
import ConversationList from "../../components/whatsapp/ConversationList";
import ChatWindow from "../../components/whatsapp/ChatWindow";
import BroadcastPanel from "../../components/whatsapp/BroadcastPanel";
import MasterHeader from "../../components/MasterHeader";

type ActiveTab = "inbox" | "broadcast" | "settings";

export default function MasterCommunicationsScreen() {
    const { width } = useWindowDimensions();
    const isDesktop = width >= 1024;
    const isMobile = width < 768;

    // State
    const [activeTab, setActiveTab] = useState<ActiveTab>("inbox");
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loadingConversations, setLoadingConversations] = useState(true);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [filter, setFilter] = useState<"all" | "unread" | "open">("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [error, setError] = useState<string | null>(null);

    // Evolution API state
    const [instanceStatus, setInstanceStatus] = useState<InstanceStatus>({
        connected: false,
        state: "checking",
        instanceName: "",
    });
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [qrLoading, setQrLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Check instance status periodically
    useEffect(() => {
        const checkStatus = async () => {
            try {
                const status = await WhatsAppService.getInstanceStatus();
                setInstanceStatus(status);
                if (status.connected) {
                    setQrCode(null); // Clear QR when connected
                }
            } catch {
                setInstanceStatus({ connected: false, state: "error", instanceName: "" });
            }
        };

        checkStatus();
        statusPollRef.current = setInterval(checkStatus, 10000);

        return () => {
            if (statusPollRef.current) clearInterval(statusPollRef.current);
        };
    }, []);

    // Load conversations
    useEffect(() => {
        if (!instanceStatus.connected) {
            setLoadingConversations(false);
            return;
        }

        setLoadingConversations(true);
        setError(null);

        let timeoutId: ReturnType<typeof setTimeout>;

        timeoutId = setTimeout(() => {
            if (loadingConversations) {
                setError("Tempo limite excedido ao carregar conversas.");
                setLoadingConversations(false);
            }
        }, 15000);

        const unsubscribe = WhatsAppService.subscribeToConversations(
            (convs) => {
                clearTimeout(timeoutId);
                setConversations(convs);
                setLoadingConversations(false);
                setError(null);
            },
            (err) => {
                clearTimeout(timeoutId);
                console.error("Erro ao carregar conversas:", err);
                setError("Erro ao carregar conversas. Tente novamente.");
                setLoadingConversations(false);
            }
        );

        return () => {
            clearTimeout(timeoutId);
            unsubscribe();
        };
    }, [instanceStatus.connected]);

    // Load messages when conversation is selected
    useEffect(() => {
        if (!selectedConversation) {
            setMessages([]);
            return;
        }

        setLoadingMessages(true);

        const unsubscribe = WhatsAppService.subscribeToMessages(
            selectedConversation.id,
            (msgs) => {
                // Merge: keep any optimistic (temp-*) messages not yet replaced by real ones
                setMessages((prev) => {
                    const realIds = new Set(msgs.map((m) => m.id));
                    const realSignatures = new Set(
                        msgs
                            .filter((m) => m.from === "business")
                            .map((m) => `${m.content}|${m.from}`)
                    );
                    const pendingOptimistic = prev.filter(
                        (m) =>
                            m.id.startsWith("temp-") &&
                            !realIds.has(m.id) &&
                            !realSignatures.has(`${m.content}|${m.from}`)
                    );
                    return [...msgs, ...pendingOptimistic];
                });
                setLoadingMessages(false);
            },
            (err) => {
                console.error("Erro ao carregar mensagens:", err);
                setLoadingMessages(false);
            }
        );

        return () => unsubscribe();
    }, [selectedConversation?.id]);

    // Handlers
    const handleSelectConversation = useCallback((conversation: Conversation) => {
        setSelectedConversation(conversation);
    }, []);

    const handleSendMessage = useCallback(
        async (message: string) => {
            if (!selectedConversation) return;

            // Optimistic update: show message immediately
            const tempId = `temp-${Date.now()}`;
            setMessages((prev) => [
                ...prev,
                {
                    id: tempId,
                    conversationId: selectedConversation.id,
                    from: "business",
                    type: "text",
                    content: message,
                    status: "sent",
                    timestamp: Date.now(),
                } as any,
            ]);

            try {
                await WhatsAppService.sendReply(selectedConversation.id, message);
                // SSE will push the real message; remove the temp one when it arrives
                // by filtering on next messages_new event (real id replaces temp)
            } catch (err) {
                // Remove optimistic message on failure
                setMessages((prev) => prev.filter((m) => m.id !== tempId));
                throw err;
            }
        },
        [selectedConversation]
    );

    const handleMarkResolved = useCallback(async () => {
        if (!selectedConversation) return;
        await WhatsAppService.markAsResolved(selectedConversation.id);
        setSelectedConversation((prev) => (prev ? { ...prev, status: "resolved" } : null));
    }, [selectedConversation]);

    const handleClearAllConversations = useCallback(async () => {
        try {
            await WhatsAppService.clearConversations();
            setConversations([]);
            setSelectedConversation(null);
            setMessages([]);
        } catch (err: any) {
            setError(err.message || "Erro ao apagar conversas");
        }
    }, []);

    const handleDeleteConversation = useCallback(async (conversationId: string) => {
        try {
            await WhatsAppService.deleteConversation(conversationId);
            setConversations((prev) => prev.filter((c) => c.id !== conversationId));
            if (selectedConversation?.id === conversationId) {
                setSelectedConversation(null);
                setMessages([]);
            }
        } catch (err: any) {
            setError(err.message || "Erro ao apagar conversa");
        }
    }, [selectedConversation?.id]);

    const handleRetry = useCallback(() => {
        setLoadingConversations(true);
        setError(null);

        const unsubscribe = WhatsAppService.subscribeToConversations(
            (convs) => {
                setConversations(convs);
                setLoadingConversations(false);
                setError(null);
            },
            (err) => {
                console.error("Erro ao carregar conversas:", err);
                setError("Erro ao carregar conversas. Tente novamente.");
                setLoadingConversations(false);
            }
        );

        return unsubscribe;
    }, []);

    // Evolution API handlers
    const handleConnectQr = useCallback(async () => {
        setQrLoading(true);
        setError(null);
        try {
            const result = await WhatsAppService.getQrCode();
            console.log("[QR] getQrCode result:", JSON.stringify({ state: result.state, hasBase64: !!result.base64, hasQrcode: !!result.qrcode }));
            if (result.state === "open") {
                setInstanceStatus((prev) => ({ ...prev, connected: true, state: "open" }));
                setQrCode(null);
            } else if (result.base64) {
                setQrCode(result.base64);
            } else if (result.qrcode) {
                setQrCode(result.qrcode);
            } else {
                setError("Nenhum QR Code retornado. Tente novamente em alguns segundos.");
            }
        } catch (err: any) {
            console.error("[QR] Error:", err);
            setError(err.message || "Erro ao gerar QR Code");
        } finally {
            setQrLoading(false);
        }
    }, []);

    const handleLogout = useCallback(async () => {
        setActionLoading(true);
        try {
            await WhatsAppService.logout();
            // Clear conversations from DB so they don't persist to the next account
            await WhatsAppService.clearConversations().catch(() => {});
            setInstanceStatus({ connected: false, state: "close", instanceName: instanceStatus.instanceName });
            setConversations([]);
            setSelectedConversation(null);
            setMessages([]);
        } catch (err: any) {
            setError(err.message || "Erro ao desconectar");
        } finally {
            setActionLoading(false);
        }
    }, [instanceStatus.instanceName]);

    const handleRestart = useCallback(async () => {
        setActionLoading(true);
        try {
            await WhatsAppService.restart();
            setInstanceStatus((prev) => ({ ...prev, state: "connecting" }));
        } catch (err: any) {
            setError(err.message || "Erro ao reconectar");
        } finally {
            setActionLoading(false);
        }
    }, []);

    // Calculate unread count
    const unreadCount = conversations.filter((c) => c.unreadCount > 0).length;

    // Settings cards collapse state — all collapsed by default
    const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>({
        conexao: true,
        info: true,
        stats: true,
        dados: true,
    });
    const toggleCard = (id: string) =>
        setCollapsedCards((prev) => ({ ...prev, [id]: !prev[id] }));

    // Connection status
    const getStatusColor = () => {
        if (instanceStatus.connected) return "#10B981";
        if (instanceStatus.state === "connecting" || instanceStatus.state === "checking") return "#F59E0B";
        return "#EF4444";
    };

    const getStatusText = () => {
        if (instanceStatus.connected) return "Conectado";
        if (instanceStatus.state === "connecting") return "Conectando...";
        if (instanceStatus.state === "checking") return "Verificando...";
        return "Desconectado";
    };

    // ========================
    // Settings panel with QR Code
    // ========================
    const renderSettingsContent = () => (
        <ScrollView style={styles.settingsContainer} showsVerticalScrollIndicator={false}>
            {/* Error Banner */}
            {error && (
                <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle" size={20} color="#EF4444" />
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            )}

            {/* Connection Card */}
            <View style={styles.settingsCard}>
                <Pressable style={styles.settingsCardHeader} onPress={() => toggleCard("conexao")}>
                    <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
                    <Text style={[styles.settingsCardTitle, { flex: 1 }]}>Conexão WhatsApp</Text>
                    <View style={[styles.statusDotLarge, { backgroundColor: getStatusColor(), marginRight: 8 }]} />
                    <Ionicons name={collapsedCards.conexao ? "chevron-down" : "chevron-up"} size={20} color="#94A3B8" />
                </Pressable>
                {!collapsedCards.conexao && (<View style={styles.settingsCardBody}>

                {/* Status */}
                <View style={styles.settingsItem}>
                    <Text style={styles.settingsLabel}>Status</Text>
                    <View style={styles.settingsValue}>
                        <View style={[styles.statusDotLarge, { backgroundColor: getStatusColor() }]} />
                        <Text style={[styles.settingsValueText, { color: getStatusColor() }]}>
                            {getStatusText()}
                        </Text>
                    </View>
                </View>

                {instanceStatus.instanceName ? (
                    <View style={styles.settingsItem}>
                        <Text style={styles.settingsLabel}>Instância</Text>
                        <Text style={styles.settingsValueText}>{instanceStatus.instanceName}</Text>
                    </View>
                ) : null}

                {/* QR Code Section */}
                {!instanceStatus.connected && (
                    <View style={styles.qrSection}>
                        <Text style={styles.qrTitle}>Conectar WhatsApp</Text>
                        <Text style={styles.qrSubtitle}>
                            Escaneie o QR Code abaixo com seu WhatsApp para conectar
                        </Text>

                        {qrCode ? (
                            <View style={styles.qrContainer}>
                                {qrCode.startsWith("data:") ? (
                                    <Image
                                        source={{ uri: qrCode }}
                                        style={styles.qrImage}
                                        resizeMode="contain"
                                    />
                                ) : (
                                    <View style={styles.qrTextContainer}>
                                        <Text style={styles.qrText} selectable>
                                            {qrCode}
                                        </Text>
                                    </View>
                                )}
                                <Pressable
                                    style={styles.refreshQrBtn}
                                    onPress={handleConnectQr}
                                    disabled={qrLoading}
                                >
                                    {qrLoading ? (
                                        <ActivityIndicator size="small" color={colors.purple} />
                                    ) : (
                                        <>
                                            <Ionicons name="refresh" size={16} color={colors.purple} />
                                            <Text style={styles.refreshQrText}>Atualizar QR Code</Text>
                                        </>
                                    )}
                                </Pressable>
                            </View>
                        ) : (
                            <Pressable
                                style={[styles.connectBtn, qrLoading && styles.connectBtnDisabled]}
                                onPress={handleConnectQr}
                                disabled={qrLoading}
                            >
                                {qrLoading ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <>
                                        <Ionicons name="qr-code-outline" size={20} color="#fff" />
                                        <Text style={styles.connectBtnText}>Gerar QR Code</Text>
                                    </>
                                )}
                            </Pressable>
                        )}

                        <View style={styles.instructionsBox}>
                            <Ionicons name="information-circle" size={18} color="#7C3AED" />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.instructionsTitle}>Como conectar:</Text>
                                <Text style={styles.instructionsText}>
                                    1. Abra o WhatsApp no seu celular{"\n"}
                                    2. Toque em Configurações {">"} Aparelhos conectados{"\n"}
                                    3. Toque em "Conectar um aparelho"{"\n"}
                                    4. Escaneie o QR Code acima
                                </Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* Connected Actions */}
                {instanceStatus.connected && (
                    <View style={styles.connectedActions}>
                        <View style={[styles.connectedBanner]}>
                            <Ionicons name="checkmark-circle" size={24} color="#059669" />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.connectedTitle}>WhatsApp conectado</Text>
                                <Text style={styles.connectedSubtitle}>
                                    Pronto para enviar e receber mensagens
                                </Text>
                            </View>
                        </View>

                        <View style={styles.actionButtons}>
                            <Pressable
                                style={[styles.actionBtn, styles.actionBtnWarning]}
                                onPress={handleRestart}
                                disabled={actionLoading}
                            >
                                {actionLoading ? (
                                    <ActivityIndicator size="small" color="#F59E0B" />
                                ) : (
                                    <>
                                        <Ionicons name="refresh" size={18} color="#F59E0B" />
                                        <Text style={[styles.actionBtnText, { color: "#F59E0B" }]}>
                                            Reconectar
                                        </Text>
                                    </>
                                )}
                            </Pressable>

                            <Pressable
                                style={[styles.actionBtn, styles.actionBtnDanger]}
                                onPress={handleLogout}
                                disabled={actionLoading}
                            >
                                {actionLoading ? (
                                    <ActivityIndicator size="small" color="#EF4444" />
                                ) : (
                                    <>
                                        <Ionicons name="log-out-outline" size={18} color="#EF4444" />
                                        <Text style={[styles.actionBtnText, { color: "#EF4444" }]}>
                                            Desconectar
                                        </Text>
                                    </>
                                )}
                            </Pressable>
                        </View>
                    </View>
                )}
                </View>)}
            </View>

            {/* Info Card */}
            <View style={styles.settingsCard}>
                <Pressable style={styles.settingsCardHeader} onPress={() => toggleCard("info")}>
                    <Ionicons name="information-circle" size={24} color={colors.purple} />
                    <Text style={[styles.settingsCardTitle, { flex: 1 }]}>Sobre a Integração</Text>
                    <Ionicons name={collapsedCards.info ? "chevron-down" : "chevron-up"} size={20} color="#94A3B8" />
                </Pressable>
                {!collapsedCards.info && (<View style={styles.settingsCardBody}>

                <Text style={styles.infoText}>
                    A integração utiliza a Evolution API para conectar seu WhatsApp pessoal ou Business
                    diretamente ao sistema, sem necessidade de conta oficial Meta Business.
                </Text>

                <View style={styles.featureList}>
                    <View style={styles.featureItem}>
                        <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                        <Text style={styles.featureText}>Envio e recebimento de mensagens em tempo real</Text>
                    </View>
                    <View style={styles.featureItem}>
                        <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                        <Text style={styles.featureText}>Disparo em massa para turmas e eventos</Text>
                    </View>
                    <View style={styles.featureItem}>
                        <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                        <Text style={styles.featureText}>Templates de mensagens personalizáveis</Text>
                    </View>
                    <View style={styles.featureItem}>
                        <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                        <Text style={styles.featureText}>Monitoramento de conversas com alunos</Text>
                    </View>
                    <View style={styles.featureItem}>
                        <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                        <Text style={styles.featureText}>Sem necessidade de aprovação Meta Business</Text>
                    </View>
                </View>

                <View style={styles.infoBox}>
                    <Ionicons name="warning" size={20} color="#F59E0B" />
                    <Text style={styles.infoBoxText}>
                        Mantenha o celular conectado à internet para que as mensagens sejam entregues.
                        Disparos em massa devem ser feitos com cautela para evitar bloqueios.
                    </Text>
                </View>
                </View>)}
            </View>

            {/* Stats Card */}
            <View style={styles.settingsCard}>
                <Pressable style={styles.settingsCardHeader} onPress={() => toggleCard("stats")}>
                    <Ionicons name="analytics" size={24} color={colors.purple} />
                    <Text style={[styles.settingsCardTitle, { flex: 1 }]}>Estatísticas</Text>
                    <Ionicons name={collapsedCards.stats ? "chevron-down" : "chevron-up"} size={20} color="#94A3B8" />
                </Pressable>
                {!collapsedCards.stats && (<View style={styles.settingsCardBody}>
                <View style={styles.statsGrid}>
                    <View style={styles.statItem}>
                        <Text style={styles.statNumber}>{conversations.length}</Text>
                        <Text style={styles.statLabel}>Conversas</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={styles.statNumber}>{unreadCount}</Text>
                        <Text style={styles.statLabel}>Não Lidas</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={styles.statNumber}>
                            {conversations.filter((c) => c.status === "open").length}
                        </Text>
                        <Text style={styles.statLabel}>Abertas</Text>
                    </View>
                </View>
                </View>)}
            </View>

            {/* Data Management Card */}
            <View style={styles.settingsCard}>
                <Pressable style={styles.settingsCardHeader} onPress={() => toggleCard("dados")}>
                    <Ionicons name="server-outline" size={24} color={colors.purple} />
                    <Text style={[styles.settingsCardTitle, { flex: 1 }]}>Gerenciar Dados</Text>
                    <Ionicons name={collapsedCards.dados ? "chevron-down" : "chevron-up"} size={20} color="#94A3B8" />
                </Pressable>
                {!collapsedCards.dados && (<View style={styles.settingsCardBody}>

                <Text style={styles.infoText}>
                    Gerencie as conversas salvas no sistema. Esta ação não afeta as mensagens no WhatsApp.
                </Text>

                <Pressable
                    style={[styles.actionBtn, styles.actionBtnDanger]}
                    onPress={() => {
                        showConfirm(
                            "Apagar Conversas",
                            `Deseja apagar todas as ${conversations.length} conversas salvas? Esta ação não pode ser desfeita.`,
                            handleClearAllConversations
                        );
                    }}
                    disabled={actionLoading || conversations.length === 0}
                >
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    <Text style={[styles.actionBtnText, { color: "#EF4444" }]}>
                        Apagar Todas as Conversas ({conversations.length})
                    </Text>
                </Pressable>
                </View>)}
            </View>
        </ScrollView>
    );

    // ========================
    // Not connected banner for inbox/broadcast
    // ========================
    const renderNotConnectedBanner = () => {
        if (instanceStatus.connected || instanceStatus.state === "checking") return null;
        return (
            <Pressable
                style={styles.notConnectedBanner}
                onPress={() => setActiveTab("settings")}
            >
                <Ionicons name="warning" size={20} color="#F59E0B" />
                <Text style={styles.notConnectedText}>
                    WhatsApp não conectado. Vá em Configurações para escanear o QR Code.
                </Text>
                <Ionicons name="chevron-forward" size={18} color="#F59E0B" />
            </Pressable>
        );
    };

    return (
        <View style={styles.container}>
            {!isDesktop && <MasterHeader />}

            {/* Tab Navigation */}
            <View style={[styles.tabBar, isMobile && styles.tabBarMobile]}>
                <View style={[styles.tabs, isMobile && styles.tabsMobile]}>
                    <Pressable
                        style={[styles.tab, activeTab === "inbox" && styles.tabActive, isMobile && styles.tabMobile]}
                        onPress={() => setActiveTab("inbox")}
                    >
                        <Ionicons
                            name={activeTab === "inbox" ? "chatbubbles" : "chatbubbles-outline"}
                            size={isMobile ? 22 : 20}
                            color={activeTab === "inbox" ? colors.purple : "#64748B"}
                        />
                        {!isMobile && (
                            <Text style={[styles.tabText, activeTab === "inbox" && styles.tabTextActive]}>
                                Atendimento
                            </Text>
                        )}
                        {unreadCount > 0 && (
                            <View style={styles.tabBadge}>
                                <Text style={styles.tabBadgeText}>{unreadCount}</Text>
                            </View>
                        )}
                    </Pressable>

                    <Pressable
                        style={[
                            styles.tab,
                            activeTab === "broadcast" && styles.tabActive,
                            isMobile && styles.tabMobile,
                        ]}
                        onPress={() => setActiveTab("broadcast")}
                    >
                        <Ionicons
                            name={activeTab === "broadcast" ? "megaphone" : "megaphone-outline"}
                            size={isMobile ? 22 : 20}
                            color={activeTab === "broadcast" ? colors.purple : "#64748B"}
                        />
                        {!isMobile && (
                            <Text style={[styles.tabText, activeTab === "broadcast" && styles.tabTextActive]}>
                                Disparos
                            </Text>
                        )}
                    </Pressable>

                    <Pressable
                        style={[
                            styles.tab,
                            activeTab === "settings" && styles.tabActive,
                            isMobile && styles.tabMobile,
                        ]}
                        onPress={() => setActiveTab("settings")}
                    >
                        <Ionicons
                            name={activeTab === "settings" ? "settings" : "settings-outline"}
                            size={isMobile ? 22 : 20}
                            color={activeTab === "settings" ? colors.purple : "#64748B"}
                        />
                        {!isMobile && (
                            <Text style={[styles.tabText, activeTab === "settings" && styles.tabTextActive]}>
                                Configurações
                            </Text>
                        )}
                    </Pressable>
                </View>

                {/* Connection Status */}
                <Pressable
                    style={styles.statusIndicator}
                    onPress={() => !instanceStatus.connected && setActiveTab("settings")}
                >
                    <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
                    {!isMobile && (
                        <Text style={[styles.statusText, { color: getStatusColor() }]}>{getStatusText()}</Text>
                    )}
                </Pressable>
            </View>

            {/* Content */}
            {activeTab === "inbox" ? (
                <View style={{ flex: 1 }}>
                    {renderNotConnectedBanner()}

                    <View style={styles.inboxContainer}>
                        {/* Error State */}
                        {error && (
                            <View style={styles.errorBanner}>
                                <Ionicons name="alert-circle" size={20} color="#EF4444" />
                                <Text style={styles.errorText}>{error}</Text>
                                <Pressable style={styles.retryButton} onPress={handleRetry}>
                                    <Text style={styles.retryButtonText}>Tentar novamente</Text>
                                </Pressable>
                            </View>
                        )}

                        {/* Conversations Sidebar */}
                        <View
                            style={[
                                styles.sidebar,
                                !isDesktop && !isMobile && styles.sidebarTablet,
                                isMobile && styles.sidebarMobile,
                                isMobile && selectedConversation && styles.sidebarHidden,
                            ]}
                        >
                            {loadingConversations ? (
                                <View style={styles.loadingContainer}>
                                    <ActivityIndicator size="large" color={colors.purple} />
                                    <Text style={styles.loadingText}>Carregando conversas...</Text>
                                </View>
                            ) : (
                                <ConversationList
                                    conversations={conversations}
                                    selectedId={selectedConversation?.id}
                                    onSelect={handleSelectConversation}
                                    filter={filter}
                                    onFilterChange={setFilter}
                                    searchQuery={searchQuery}
                                    onSearchChange={setSearchQuery}
                                />
                            )}
                        </View>

                        {/* Chat Area */}
                        <View
                            style={[
                                styles.chatArea,
                                isMobile && !selectedConversation && styles.chatAreaHidden,
                            ]}
                        >
                            {isMobile && selectedConversation && (
                                <Pressable style={styles.backBtn} onPress={() => setSelectedConversation(null)}>
                                    <Ionicons name="arrow-back" size={24} color={colors.purple} />
                                    <Text style={styles.backBtnText}>Voltar</Text>
                                </Pressable>
                            )}

                            <ChatWindow
                                conversation={selectedConversation}
                                messages={messages}
                                loading={loadingMessages}
                                onSendMessage={handleSendMessage}
                                onMarkResolved={handleMarkResolved}
                                onDeleteConversation={handleDeleteConversation}
                            />
                        </View>
                    </View>
                </View>
            ) : activeTab === "broadcast" ? (
                <View style={{ flex: 1 }}>
                    {renderNotConnectedBanner()}
                    <BroadcastPanel visible={activeTab === "broadcast"} onClose={() => setActiveTab("inbox")} />
                </View>
            ) : (
                renderSettingsContent()
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F8FAFC",
    },
    tabBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#FFFFFF",
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#E2E8F0",
    },
    tabBarMobile: {
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    tabs: {
        flexDirection: "row",
        gap: 8,
    },
    tabsMobile: {
        gap: 6,
        flex: 1,
        justifyContent: "space-around",
    },
    tab: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        gap: 8,
        backgroundColor: "#F8FAFC",
    },
    tabMobile: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        minWidth: 50,
        flex: 0,
        justifyContent: "center",
    },
    tabActive: {
        backgroundColor: colors.purple + "15",
    },
    tabText: {
        fontSize: 14,
        fontWeight: "600",
        color: "#64748B",
    },
    tabTextActive: {
        color: colors.purple,
    },
    tabBadge: {
        backgroundColor: colors.green,
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 6,
    },
    tabBadgeText: {
        color: "#FFFFFF",
        fontSize: 11,
        fontWeight: "700",
    },
    statusIndicator: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    statusDotLarge: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    statusText: {
        fontSize: 12,
        fontWeight: "500",
    },
    notConnectedBanner: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FEF3C7",
        paddingVertical: 10,
        paddingHorizontal: 16,
        gap: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#FDE68A",
    },
    notConnectedText: {
        flex: 1,
        fontSize: 13,
        color: "#92400E",
        fontWeight: "500",
    },
    inboxContainer: {
        flex: 1,
        flexDirection: "row",
    },
    sidebar: {
        width: 360,
        backgroundColor: "#FFFFFF",
        borderRightWidth: 1,
        borderRightColor: "#E2E8F0",
    },
    sidebarTablet: {
        width: 300,
    },
    sidebarMobile: {
        width: "100%",
        borderRightWidth: 0,
    },
    sidebarHidden: {
        display: "none",
    },
    chatArea: {
        flex: 1,
    },
    chatAreaHidden: {
        display: "none",
    },
    loadingContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
    },
    loadingText: {
        fontSize: 14,
        color: "#64748B",
    },
    backBtn: {
        flexDirection: "row",
        alignItems: "center",
        padding: 12,
        backgroundColor: "#FFFFFF",
        borderBottomWidth: 1,
        borderBottomColor: "#E2E8F0",
        gap: 8,
    },
    backBtnText: {
        fontSize: 15,
        fontWeight: "600",
        color: colors.purple,
    },
    errorBanner: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FEE2E2",
        padding: 12,
        gap: 8,
    },
    errorText: {
        flex: 1,
        fontSize: 13,
        color: "#DC2626",
    },
    retryButton: {
        backgroundColor: "#FFFFFF",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: "#EF4444",
    },
    retryButtonText: {
        fontSize: 12,
        fontWeight: "600",
        color: "#EF4444",
    },

    // Settings
    settingsContainer: {
        flex: 1,
        padding: 20,
    },
    settingsCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    settingsCardHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    settingsCardBody: {
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: "#F1F5F9",
        marginTop: 12,
    },
    settingsCardTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: "#1E293B",
    },
    settingsItem: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#F1F5F9",
    },
    settingsLabel: {
        fontSize: 14,
        color: "#64748B",
    },
    settingsValue: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    settingsValueText: {
        fontSize: 14,
        fontWeight: "600",
        color: "#1E293B",
    },

    // QR Code
    qrSection: {
        alignItems: "center",
        paddingTop: 16,
    },
    qrTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: "#1E293B",
        marginBottom: 8,
    },
    qrSubtitle: {
        fontSize: 14,
        color: "#64748B",
        textAlign: "center",
        marginBottom: 20,
        lineHeight: 20,
    },
    qrContainer: {
        alignItems: "center",
        marginBottom: 20,
    },
    qrImage: {
        width: 280,
        height: 280,
        borderRadius: 12,
        backgroundColor: "#FFFFFF",
        borderWidth: 2,
        borderColor: "#E2E8F0",
    },
    qrTextContainer: {
        backgroundColor: "#F1F5F9",
        padding: 16,
        borderRadius: 12,
        maxWidth: 320,
    },
    qrText: {
        fontSize: 11,
        fontFamily: Platform.OS === "web" ? "monospace" : undefined,
        color: "#475569",
        textAlign: "center",
    },
    refreshQrBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 16,
        marginTop: 12,
    },
    refreshQrText: {
        fontSize: 14,
        color: colors.purple,
        fontWeight: "600",
    },
    connectBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        backgroundColor: "#25D366",
        paddingVertical: 14,
        paddingHorizontal: 28,
        borderRadius: 14,
        marginBottom: 20,
    },
    connectBtnDisabled: {
        opacity: 0.7,
    },
    connectBtnText: {
        color: "#FFFFFF",
        fontSize: 16,
        fontWeight: "700",
    },
    instructionsBox: {
        flexDirection: "row",
        backgroundColor: "#F5F3FF",
        padding: 16,
        borderRadius: 12,
        gap: 12,
        width: "100%",
        maxWidth: 400,
    },
    instructionsTitle: {
        fontSize: 14,
        fontWeight: "700",
        color: "#5B21B6",
        marginBottom: 6,
    },
    instructionsText: {
        fontSize: 13,
        color: "#6D28D9",
        lineHeight: 20,
    },

    // Connected
    connectedActions: {
        paddingTop: 16,
    },
    connectedBanner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: "#D1FAE5",
        padding: 16,
        borderRadius: 12,
        marginBottom: 16,
    },
    connectedTitle: {
        fontSize: 16,
        fontWeight: "700",
        color: "#065F46",
    },
    connectedSubtitle: {
        fontSize: 13,
        color: "#059669",
        marginTop: 2,
    },
    actionButtons: {
        flexDirection: "row",
        gap: 12,
    },
    actionBtn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
    },
    actionBtnWarning: {
        borderColor: "#FDE68A",
        backgroundColor: "#FFFBEB",
    },
    actionBtnDanger: {
        borderColor: "#FECACA",
        backgroundColor: "#FEF2F2",
    },
    actionBtnText: {
        fontSize: 14,
        fontWeight: "600",
    },

    // Info
    infoText: {
        fontSize: 14,
        color: "#64748B",
        lineHeight: 20,
        marginBottom: 16,
    },
    infoBox: {
        flexDirection: "row",
        alignItems: "flex-start",
        backgroundColor: "#FEF3C7",
        padding: 12,
        borderRadius: 8,
        gap: 10,
        marginTop: 8,
    },
    infoBoxText: {
        flex: 1,
        fontSize: 13,
        color: "#92400E",
        lineHeight: 18,
    },
    featureList: {
        gap: 10,
        marginBottom: 16,
    },
    featureItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    featureText: {
        fontSize: 14,
        color: "#1E293B",
        flex: 1,
    },

    // Stats
    statsGrid: {
        flexDirection: "row",
        justifyContent: "space-around",
        paddingTop: 8,
    },
    statItem: {
        alignItems: "center",
    },
    statNumber: {
        fontSize: 28,
        fontWeight: "700",
        color: colors.purple,
    },
    statLabel: {
        fontSize: 12,
        color: "#64748B",
        marginTop: 4,
    },
});
