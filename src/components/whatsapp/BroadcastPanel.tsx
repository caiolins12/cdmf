/**
 * BroadcastPanel - Painel de disparos em massa redesenhado
 * Layout responsivo com upload de imagem, galeria persistente, audiência avançada
 */

import React, { useState, useEffect, useRef } from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    ScrollView,
    TextInput,
    ActivityIndicator,
    Modal,
    useWindowDimensions,
    Image,
    FlatList,
} from "react-native";
import { Ionicons } from "@/shims/icons";
import { colors } from "../../theme/colors";
import { WhatsAppService, MessageTemplate, WhatsAppAudience, BroadcastImage, BroadcastWarning } from "../../services/WhatsAppService";
import { useAuth, Profile } from "../../contexts/AuthContext";
import { usePayment, Invoice } from "../../contexts/PaymentContext";

interface BroadcastPanelProps {
    visible: boolean;
    onClose: () => void;
}

type BroadcastStep = "compose" | "audience" | "preview";
type AudienceType = "all_students" | "class" | "event" | "pending_bills" | "birthdays";


const SMART_INSERTS = [
    { label: "Nome", icon: "person", tag: "{{name}}" },
    { label: "Data", icon: "calendar", tag: "{{date}}" },
];

export default function BroadcastPanel({ visible, onClose }: BroadcastPanelProps) {
    const { width } = useWindowDimensions();
    const isDesktop = width >= 1024;
    const isMobile = width < 768;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const msgInputRef = useRef<any>(null);
    const editorInputRef = useRef<any>(null);
    const [msgSelection, setMsgSelection] = useState({ start: 0, end: 0 });
    const [editorSelection, setEditorSelection] = useState({ start: 0, end: 0 });

    const { fetchClasses, fetchEvents, fetchStudents } = useAuth();
    const { fetchInvoices } = usePayment();

    // Templates
    const [templates, setTemplates] = useState<MessageTemplate[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);

    // Compose
    const [step, setStep] = useState<BroadcastStep>("compose");
    const [messageText, setMessageText] = useState("");
    const [imageUrl, setImageUrl] = useState("");

    // Image gallery
    const [galleryImages, setGalleryImages] = useState<BroadcastImage[]>([]);
    const [showGallery, setShowGallery] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);

    // Audience
    const [audienceType, setAudienceType] = useState<AudienceType>("all_students");
    const [selectedTargetId, setSelectedTargetId] = useState("");
    const [selectedTargetName, setSelectedTargetName] = useState("");
    const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
    const [events, setEvents] = useState<Array<{ id: string; title: string }>>([]);

    // Students data for audience modals
    const [allStudents, setAllStudents] = useState<Profile[]>([]);
    const [pendingStudents, setPendingStudents] = useState<Profile[]>([]);
    const [birthdayStudents, setBirthdayStudents] = useState<Profile[]>([]);
    const [excludedStudentIds, setExcludedStudentIds] = useState<Set<string>>(new Set());
    const [showAudienceModal, setShowAudienceModal] = useState(false);
    const [audienceSearch, setAudienceSearch] = useState("");

    // State
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<{ success: boolean; count: number; failed?: number; errors?: string[] } | null>(null);

    // Template editor
    const [showEditor, setShowEditor] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
    const [editorTitle, setEditorTitle] = useState("");
    const [editorContent, setEditorContent] = useState("");
    const [editorCategory, setEditorCategory] = useState<"marketing" | "utility" | "auth" | "service">("marketing");
    const [editorImageUrl, setEditorImageUrl] = useState("");
    const [saving, setSaving] = useState(false);

    // Confirm modal & risk warnings
    const [showConfirm, setShowConfirm] = useState(false);
    const [broadcastWarnings, setBroadcastWarnings] = useState<BroadcastWarning[]>([]);
    const [loadingRisk, setLoadingRisk] = useState(false);

    useEffect(() => {
        if (visible) loadData();
    }, [visible]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [templatesData, classesData, eventsData, studentsData] = await Promise.all([
                WhatsAppService.getTemplates(),
                fetchClasses(),
                fetchEvents(),
                fetchStudents(),
            ]);
            setTemplates(templatesData);
            setClasses(classesData.map((c: any) => ({ id: c.id, name: c.name })));
            setEvents(eventsData.map((e: any) => ({ id: e.id, title: e.name || e.title || "Evento sem nome" })));

            const active = studentsData.filter((s: Profile) => s.enrollmentStatus === "ativo" && s.phone);
            setAllStudents(active);

            // Pending bills students
            try {
                const invoices = await fetchInvoices({ status: "pending" });
                const overdueInvoices = await fetchInvoices({ status: "overdue" as any });
                const allPending = [...invoices, ...overdueInvoices];
                const pendingIds = new Set(allPending.map((inv: any) => inv.studentId));
                setPendingStudents(active.filter((s: Profile) => pendingIds.has(s.uid)));
            } catch { setPendingStudents([]); }

            // Birthday students (today)
            const today = new Date();
            const todayDay = String(today.getDate()).padStart(2, "0");
            const todayMonth = String(today.getMonth() + 1).padStart(2, "0");
            setBirthdayStudents(active.filter((s: Profile) => {
                if (!s.birthDate) return false;
                const parts = s.birthDate.split("/");
                return parts.length >= 2 && parts[0] === todayDay && parts[1] === todayMonth;
            }));

            // Load gallery images
            try {
                const imgs = await WhatsAppService.getBroadcastImages();
                setGalleryImages(imgs);
            } catch { setGalleryImages([]); }
        } catch (error) {
            console.error("Error loading data:", error);
        } finally {
            setLoading(false);
        }
    };

    // Template selection toggle
    const handleSelectTemplate = (template: MessageTemplate) => {
        if (selectedTemplate?.id === template.id) {
            setSelectedTemplate(null);
            setMessageText("");
            setImageUrl("");
        } else {
            setSelectedTemplate(template);
            setMessageText(template.content);
            setImageUrl(template.imageUrl || "");
        }
    };

    // Image upload from device
    const handleImageUpload = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileSelected = async (e: any) => {
        const file = e.target?.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) return;
        if (file.size > 5 * 1024 * 1024) {
            alert("A imagem deve ter no máximo 5MB.");
            return;
        }

        setUploadingImage(true);
        try {
            const reader = new FileReader();
            reader.onload = async () => {
                const base64 = reader.result as string;
                const img = await WhatsAppService.uploadBroadcastImage(file.name, base64);
                setGalleryImages((prev) => [img, ...prev]);
                setImageUrl(base64);
                setShowGallery(false);
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error("Error uploading image:", error);
        } finally {
            setUploadingImage(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleDeleteGalleryImage = async (imgId: string) => {
        try {
            await WhatsAppService.deleteBroadcastImage(imgId);
            setGalleryImages((prev) => prev.filter((i) => i.id !== imgId));
            // Clear selected if it was this image
            const deleted = galleryImages.find((i) => i.id === imgId);
            if (deleted && imageUrl === deleted.url) setImageUrl("");
        } catch (error) {
            console.error("Error deleting image:", error);
        }
    };

    const handlePreSend = async () => {
        if (!selectedTemplate) return;
        setLoadingRisk(true);
        try {
            const stats = await WhatsAppService.getBroadcastStats();
            const effectiveCount = getEffectiveStudents().length;
            const content = messageText || selectedTemplate.content || "";
            const category = selectedTemplate.category || "marketing";
            const warnings = WhatsAppService.assessBroadcastRisk(stats, effectiveCount, content, category);
            setBroadcastWarnings(warnings);
        } catch {
            setBroadcastWarnings([]);
        } finally {
            setLoadingRisk(false);
            setShowConfirm(true);
        }
    };

    const handleSend = async () => {
        if (!selectedTemplate) return;
        setShowConfirm(false);
        setSending(true);
        setResult(null);
        try {
            const audience: WhatsAppAudience = {
                type: audienceType === "pending_bills" || audienceType === "birthdays" ? "specific_students" : audienceType,
                targetId: selectedTargetId || undefined,
                targetName: selectedTargetName || undefined,
            };

            // For specific audience types, pass excluded IDs
            const effectiveStudents = getEffectiveStudents();
            if (audienceType === "pending_bills" || audienceType === "birthdays" || audienceType === "all_students") {
                (audience as any).studentIds = effectiveStudents.map((s) => s.uid);
                audience.type = "specific_students";
                audience.count = effectiveStudents.length;
            }

            const res = await WhatsAppService.sendBroadcast(
                selectedTemplate.id,
                audience,
                undefined,
                imageUrl || undefined
            );
            setResult({ success: true, count: res.count, failed: res.failed, errors: res.errors });
            setStep("compose");
        } catch (error: any) {
            setResult({ success: false, count: 0, errors: [error.message || "Erro desconhecido"] });
        } finally {
            setSending(false);
        }
    };

    const handleSaveTemplate = async () => {
        if (!editorTitle.trim() || !editorContent.trim()) return;
        setSaving(true);
        try {
            const templatePayload: any = {
                title: editorTitle,
                content: editorContent,
                category: editorCategory,
                imageUrl: editorImageUrl || undefined,
            };
            if (editingTemplate) {
                await WhatsAppService.updateTemplate(editingTemplate.id, templatePayload);
            } else {
                await WhatsAppService.saveTemplate(templatePayload);
            }
            await loadData();
            setShowEditor(false);
            resetEditor();
        } catch (error) {
            console.error("Error saving template:", error);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteTemplate = async (id: string) => {
        try {
            await WhatsAppService.deleteTemplate(id);
            await loadData();
            if (selectedTemplate?.id === id) {
                setSelectedTemplate(null);
                setMessageText("");
                setImageUrl("");
            }
        } catch (error) {
            console.error("Error deleting template:", error);
        }
    };

    const resetEditor = () => {
        setEditingTemplate(null);
        setEditorTitle("");
        setEditorContent("");
        setEditorCategory("marketing");
        setEditorImageUrl("");
    };

    const openEditor = (template?: MessageTemplate) => {
        if (template) {
            setEditingTemplate(template);
            setEditorTitle(template.title);
            setEditorContent(template.content);
            setEditorCategory(template.category || "marketing");
            setEditorImageUrl(template.imageUrl || "");
        } else {
            resetEditor();
        }
        setShowEditor(true);
    };

    const insertSmartTag = (tag: string) => {
        setMessageText((prev) => prev + tag);
    };

    // Apply WhatsApp formatting markers around selection or at cursor
    const applyFormat = (
        marker: string,
        text: string,
        selection: { start: number; end: number },
        setter: (v: string) => void
    ) => {
        const { start, end } = selection;
        if (start !== end) {
            const wrapped = text.slice(0, start) + marker + text.slice(start, end) + marker + text.slice(end);
            setter(wrapped);
        } else {
            const inserted = text.slice(0, start) + marker + marker + text.slice(start);
            setter(inserted);
        }
    };

    const FORMAT_BUTTONS = [
        { label: "B", marker: "*", title: "Negrito", style: { fontWeight: "800" as const } },
        { label: "I", marker: "_", title: "Itálico", style: { fontStyle: "italic" as const } },
        { label: "S", marker: "~", title: "Tachado", style: { textDecorationLine: "line-through" as const } },
        { label: "M", marker: "```", title: "Monoespaço", style: { fontFamily: "monospace" } },
    ];

    const getCategoryLabel = (cat: string) => {
        switch (cat) {
            case "marketing": return "Marketing";
            case "utility": return "Utilidade";
            case "auth": return "Autenticação";
            case "service": return "Serviço";
            default: return cat;
        }
    };

    const getCategoryColor = (cat: string) => {
        switch (cat) {
            case "marketing": return "#8B5CF6";
            case "utility": return "#10B981";
            case "auth": return "#F59E0B";
            case "service": return "#3B82F6";
            default: return "#64748B";
        }
    };

    const getAudienceStudents = (): Profile[] => {
        switch (audienceType) {
            case "all_students": return allStudents;
            case "pending_bills": return pendingStudents;
            case "birthdays": return birthdayStudents;
            default: return allStudents;
        }
    };

    const getEffectiveStudents = (): Profile[] => {
        return getAudienceStudents().filter((s) => !excludedStudentIds.has(s.uid));
    };

    const getAudienceLabel = (): string => {
        const effective = getEffectiveStudents();
        switch (audienceType) {
            case "all_students": return `Todos os Alunos (${effective.length})`;
            case "class": return selectedTargetName ? `Turma: ${selectedTargetName}` : "Selecione uma turma";
            case "event": return selectedTargetName ? `Evento: ${selectedTargetName}` : "Selecione um evento";
            case "pending_bills": return `Contas Pendentes (${effective.length})`;
            case "birthdays": return `Aniversariantes (${effective.length})`;
            default: return "Selecione";
        }
    };

    const canProceedToPreview = (): boolean => {
        if (audienceType === "class" || audienceType === "event") return !!selectedTargetId;
        if (audienceType === "pending_bills") return pendingStudents.length > 0;
        if (audienceType === "birthdays") return birthdayStudents.length > 0;
        return true;
    };

    const handleAudienceCardPress = (type: AudienceType) => {
        setAudienceType(type);
        setSelectedTargetId("");
        setSelectedTargetName("");
        setExcludedStudentIds(new Set());

        // Open modal for types that show student lists
        if (type === "all_students" || type === "pending_bills" || type === "birthdays") {
            setShowAudienceModal(true);
        }
    };

    if (!visible) return null;

    // Hidden file input for image upload
    const fileInput = (
        <input
            ref={fileInputRef as any}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileSelected}
        />
    );

    // ========================
    // Step bar
    // ========================
    const renderStepIndicator = () => (
        <View style={st.stepBar}>
            {(["compose", "audience", "preview"] as BroadcastStep[]).map((s, idx) => {
                const isActive = step === s;
                const isPast = ["compose", "audience", "preview"].indexOf(step) > idx;
                const labels = ["Mensagem", "Audiência", "Enviar"];
                const icons: Array<"create-outline" | "people-outline" | "paper-plane-outline"> = ["create-outline", "people-outline", "paper-plane-outline"];
                return (
                    <Pressable key={s} style={[st.stepItem, isActive && st.stepItemActive]}
                        onPress={() => { if (isPast || isActive) setStep(s); }}>
                        <View style={[st.stepCircle, (isActive || isPast) && st.stepCircleActive]}>
                            {isPast ? <Ionicons name="checkmark" size={14} color="#FFF" />
                                : <Ionicons name={icons[idx]} size={14} color={(isActive || isPast) ? "#FFF" : "#94A3B8"} />}
                        </View>
                        {!isMobile && <Text style={[st.stepLabel, (isActive || isPast) && st.stepLabelActive]}>{labels[idx]}</Text>}
                    </Pressable>
                );
            })}
        </View>
    );

    // ========================
    // Step 1: Compose
    // ========================
    const renderComposeStep = () => (
        <View style={st.stepContent}>
            {/* Templates */}
            <View style={st.card}>
                <View style={st.cardHeader}>
                    <View style={st.cardTitleRow}>
                        <Ionicons name="document-text" size={20} color={colors.purple} />
                        <Text style={st.cardTitle}>Templates</Text>
                    </View>
                    <Pressable style={st.addBtn} onPress={() => openEditor()}>
                        <Ionicons name="add" size={16} color="#FFF" />
                        <Text style={st.addBtnText}>Novo</Text>
                    </Pressable>
                </View>

                {templates.length === 0 ? (
                    <View style={st.emptyBlock}>
                        <Ionicons name="document-text-outline" size={36} color="#CBD5E1" />
                        <Text style={st.emptyText}>Nenhum template criado</Text>
                    </View>
                ) : (
                    <ScrollView horizontal={!isMobile} showsHorizontalScrollIndicator={false}
                        contentContainerStyle={isMobile ? { gap: 8 } : { gap: 8, paddingHorizontal: 4 }}>
                        {templates.map((t) => {
                            const isSelected = selectedTemplate?.id === t.id;
                            const tplImage = t.imageUrl;
                            return (
                                <Pressable key={t.id}
                                    style={[st.templateChip, isSelected && st.templateChipActive, isMobile && st.templateChipMobile]}
                                    onPress={() => handleSelectTemplate(t)}>
                                    {tplImage ? (
                                        <Image source={{ uri: tplImage }} style={st.templateChipImage} resizeMode="cover" />
                                    ) : null}
                                    <View style={st.templateChipHeader}>
                                        <Text style={[st.templateChipTitle, isSelected && st.templateChipTitleActive]} numberOfLines={1}>{t.title}</Text>
                                        <View style={st.templateChipActions}>
                                            <Pressable onPress={() => openEditor(t)} hitSlop={8}>
                                                <Ionicons name="pencil" size={14} color="#94A3B8" />
                                            </Pressable>
                                            <Pressable onPress={() => handleDeleteTemplate(t.id)} hitSlop={8}>
                                                <Ionicons name="trash-outline" size={14} color="#EF4444" />
                                            </Pressable>
                                        </View>
                                    </View>
                                    <Text style={st.templateChipContent} numberOfLines={2}>{t.content}</Text>
                                    <View style={[st.catBadge, { backgroundColor: getCategoryColor(t.category) + "18" }]}>
                                        <Text style={[st.catBadgeText, { color: getCategoryColor(t.category) }]}>{getCategoryLabel(t.category)}</Text>
                                    </View>
                                    {isSelected && (
                                        <View style={st.selectedBadge}>
                                            <Ionicons name="checkmark-circle" size={14} color={colors.purple} />
                                            <Text style={st.selectedBadgeText}>Selecionado</Text>
                                        </View>
                                    )}
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                )}
            </View>

            {/* Message composer */}
            <View style={st.card}>
                <View style={st.cardTitleRow}>
                    <Ionicons name="chatbubble-ellipses" size={20} color={colors.purple} />
                    <Text style={st.cardTitle}>Mensagem</Text>
                </View>

                {/* Formatting toolbar */}
                <View style={st.formatBar}>
                    {FORMAT_BUTTONS.map((fb) => (
                        <Pressable
                            key={fb.marker}
                            style={st.formatBtn}
                            onPress={() => applyFormat(fb.marker, messageText, msgSelection, (v) => {
                                setMessageText(v);
                                if (selectedTemplate) setSelectedTemplate({ ...selectedTemplate, content: v });
                            })}
                        >
                            <Text style={[st.formatBtnText, fb.style]}>{fb.label}</Text>
                        </Pressable>
                    ))}
                </View>

                <TextInput
                    ref={msgInputRef}
                    style={st.messageInput}
                    value={messageText}
                    onChangeText={(text: string) => {
                        setMessageText(text);
                        if (selectedTemplate) setSelectedTemplate({ ...selectedTemplate, content: text });
                    }}
                    onSelectionChange={(e: any) => setMsgSelection(e.nativeEvent.selection)}
                    placeholder="Selecione um template ou escreva sua mensagem..."
                    placeholderTextColor="#94A3B8"
                    multiline textAlignVertical="top"
                />

                {/* Smart inserts */}
                <View style={st.smartBar}>
                    <Text style={st.smartBarLabel}>Inserir:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                        {SMART_INSERTS.map((si) => (
                            <Pressable key={si.tag} style={st.smartBtn} onPress={() => insertSmartTag(si.tag)}>
                                <Ionicons name={si.icon as any} size={14} color={colors.purple} />
                                <Text style={st.smartBtnText}>{si.label}</Text>
                            </Pressable>
                        ))}
                    </ScrollView>
                </View>

                {/* Image section */}
                <View style={st.imageSectionHeader}>
                    <Pressable style={[st.attachBtn, showGallery && st.attachBtnActive]}
                        onPress={() => setShowGallery(!showGallery)}>
                        <Ionicons name="images-outline" size={18} color={showGallery ? colors.purple : "#64748B"} />
                        <Text style={[st.attachBtnText, showGallery && { color: colors.purple }]}>
                            {imageUrl ? "Imagem anexada" : "Anexar Imagem"}
                        </Text>
                        {imageUrl ? <Ionicons name="checkmark-circle" size={16} color="#10B981" /> : null}
                    </Pressable>
                    {imageUrl ? (
                        <Pressable style={st.clearImageBtn} onPress={() => setImageUrl("")}>
                            <Ionicons name="close-circle" size={18} color="#EF4444" />
                            <Text style={st.clearImageText}>Remover</Text>
                        </Pressable>
                    ) : null}
                </View>

                {showGallery && (
                    <View style={st.galleryArea}>
                        {/* Upload button */}
                        <Pressable style={st.uploadCard} onPress={handleImageUpload} disabled={uploadingImage}>
                            {uploadingImage ? (
                                <ActivityIndicator size="small" color={colors.purple} />
                            ) : (
                                <>
                                    <Ionicons name="cloud-upload-outline" size={28} color={colors.purple} />
                                    <Text style={st.uploadText}>Enviar do dispositivo</Text>
                                    <Text style={st.uploadHint}>Máx. 5MB</Text>
                                </>
                            )}
                        </Pressable>

                        {/* Gallery grid */}
                        {galleryImages.length > 0 && (
                            <View style={st.galleryGrid}>
                                {galleryImages.map((img) => (
                                    <View key={img.id} style={[st.galleryItem, imageUrl === img.url && st.galleryItemActive]}>
                                        <Pressable onPress={() => setImageUrl(img.url)} style={{ flex: 1 }}>
                                            <Image source={{ uri: img.url }} style={st.galleryItemImg} resizeMode="cover" />
                                        </Pressable>
                                        <View style={st.galleryItemFooter}>
                                            <Text style={st.galleryItemName} numberOfLines={1}>{img.name}</Text>
                                            <Pressable onPress={() => handleDeleteGalleryImage(img.id)} hitSlop={6}>
                                                <Ionicons name="trash-outline" size={14} color="#EF4444" />
                                            </Pressable>
                                        </View>
                                        {imageUrl === img.url && (
                                            <View style={st.galleryItemCheck}>
                                                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                                            </View>
                                        )}
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* URL input fallback */}
                        <View style={st.urlInputRow}>
                            <TextInput
                                style={st.urlInput}
                                value={imageUrl?.startsWith("data:") ? "" : imageUrl}
                                onChangeText={setImageUrl}
                                placeholder="Ou cole uma URL de imagem..."
                                placeholderTextColor="#94A3B8"
                                autoCapitalize="none"
                            />
                        </View>

                        {imageUrl ? (
                            <View style={st.selectedImagePreview}>
                                <Image source={{ uri: imageUrl }} style={st.selectedImageImg} resizeMode="cover" />
                            </View>
                        ) : null}
                    </View>
                )}
            </View>

            {/* Next */}
            <Pressable
                style={[st.nextBtn, !messageText.trim() && !selectedTemplate && st.nextBtnDisabled]}
                onPress={() => setStep("audience")}
                disabled={!messageText.trim() && !selectedTemplate}>
                <Text style={st.nextBtnText}>Próximo: Selecionar Audiência</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFF" />
            </Pressable>
        </View>
    );

    // ========================
    // Step 2: Audience
    // ========================
    const renderAudienceStep = () => {
        const audienceOptions: { type: AudienceType; icon: string; title: string; desc: string; count?: number }[] = [
            { type: "all_students", icon: "people", title: "Todos os Alunos", desc: `${allStudents.length} alunos ativos`, count: allStudents.length },
            { type: "class", icon: "book", title: "Por Turma", desc: `${classes.length} turmas` },
            { type: "event", icon: "calendar", title: "Por Evento", desc: `${events.length} eventos` },
            { type: "pending_bills", icon: "alert-circle", title: "Contas Pendentes", desc: `${pendingStudents.length} alunos com pendências`, count: pendingStudents.length },
            { type: "birthdays", icon: "gift", title: "Aniversariantes do Dia", desc: `${birthdayStudents.length} aniversariantes hoje`, count: birthdayStudents.length },
        ];

        return (
            <View style={st.stepContent}>
                <View style={st.card}>
                    <View style={st.cardTitleRow}>
                        <Ionicons name="people" size={20} color={colors.purple} />
                        <Text style={st.cardTitle}>Selecionar Audiência</Text>
                    </View>

                    <View style={st.audienceGrid}>
                        {audienceOptions.map((opt) => {
                            const isActive = audienceType === opt.type;
                            return (
                                <Pressable key={opt.type}
                                    style={[st.audienceCard, isActive && st.audienceCardActive]}
                                    onPress={() => handleAudienceCardPress(opt.type)}>
                                    <View style={[st.audienceCardIcon, isActive && st.audienceCardIconActive]}>
                                        <Ionicons name={opt.icon as any} size={20} color={isActive ? "#FFF" : "#64748B"} />
                                    </View>
                                    <View style={st.audienceCardInfo}>
                                        <Text style={[st.audienceCardTitle, isActive && st.audienceCardTitleActive]}>{opt.title}</Text>
                                        <Text style={st.audienceCardDesc}>{opt.desc}</Text>
                                    </View>
                                    {isActive && (
                                        <Pressable style={st.audienceViewBtn}
                                            onPress={() => {
                                                if (opt.type !== "class" && opt.type !== "event") setShowAudienceModal(true);
                                            }}>
                                            {opt.type !== "class" && opt.type !== "event" ? (
                                                <Ionicons name="eye-outline" size={18} color={colors.purple} />
                                            ) : (
                                                <Ionicons name="checkmark-circle" size={20} color={colors.purple} />
                                            )}
                                        </Pressable>
                                    )}
                                </Pressable>
                            );
                        })}
                    </View>

                    {/* Class/Event selector */}
                    {audienceType === "class" && (
                        <View style={st.selectorArea}>
                            <Text style={st.selectorLabel}>Selecione a turma:</Text>
                            <View style={st.selectorGrid}>
                                {classes.map((cls) => (
                                    <Pressable key={cls.id}
                                        style={[st.selectorItem, selectedTargetId === cls.id && st.selectorItemActive]}
                                        onPress={() => { setSelectedTargetId(cls.id); setSelectedTargetName(cls.name); }}>
                                        <Ionicons name={selectedTargetId === cls.id ? "radio-button-on" : "radio-button-off"}
                                            size={18} color={selectedTargetId === cls.id ? colors.purple : "#94A3B8"} />
                                        <Text style={[st.selectorText, selectedTargetId === cls.id && st.selectorTextActive]}>{cls.name}</Text>
                                    </Pressable>
                                ))}
                                {classes.length === 0 && <Text style={st.emptySmall}>Nenhuma turma encontrada</Text>}
                            </View>
                        </View>
                    )}

                    {audienceType === "event" && (
                        <View style={st.selectorArea}>
                            <Text style={st.selectorLabel}>Selecione o evento:</Text>
                            <View style={st.selectorGrid}>
                                {events.map((evt) => (
                                    <Pressable key={evt.id}
                                        style={[st.selectorItem, selectedTargetId === evt.id && st.selectorItemActive]}
                                        onPress={() => { setSelectedTargetId(evt.id); setSelectedTargetName(evt.title); }}>
                                        <Ionicons name={selectedTargetId === evt.id ? "radio-button-on" : "radio-button-off"}
                                            size={18} color={selectedTargetId === evt.id ? colors.purple : "#94A3B8"} />
                                        <Text style={[st.selectorText, selectedTargetId === evt.id && st.selectorTextActive]}>{evt.title}</Text>
                                    </Pressable>
                                ))}
                                {events.length === 0 && <Text style={st.emptySmall}>Nenhum evento encontrado</Text>}
                            </View>
                        </View>
                    )}

                    {/* Excluded count */}
                    {(audienceType === "all_students" || audienceType === "pending_bills" || audienceType === "birthdays") && excludedStudentIds.size > 0 && (
                        <View style={st.excludedBanner}>
                            <Ionicons name="remove-circle-outline" size={16} color="#F59E0B" />
                            <Text style={st.excludedText}>
                                {excludedStudentIds.size} aluno(s) desmarcado(s)
                            </Text>
                            <Pressable onPress={() => setExcludedStudentIds(new Set())}>
                                <Text style={st.excludedClear}>Limpar</Text>
                            </Pressable>
                        </View>
                    )}
                </View>

                {/* Navigation */}
                <View style={st.navRow}>
                    <Pressable style={st.backStepBtn} onPress={() => setStep("compose")}>
                        <Ionicons name="arrow-back" size={18} color={colors.purple} />
                        <Text style={st.backStepText}>Voltar</Text>
                    </Pressable>
                    <Pressable
                        style={[st.nextBtn, st.nextBtnFlex, !canProceedToPreview() && st.nextBtnDisabled]}
                        onPress={() => setStep("preview")}
                        disabled={!canProceedToPreview()}>
                        <Text style={st.nextBtnText}>Revisar e Enviar</Text>
                        <Ionicons name="arrow-forward" size={18} color="#FFF" />
                    </Pressable>
                </View>
            </View>
        );
    };

    // ========================
    // Step 3: Preview
    // ========================
    const renderPreviewStep = () => (
        <View style={st.stepContent}>
            <View style={st.card}>
                <View style={st.cardTitleRow}>
                    <Ionicons name="eye" size={20} color={colors.purple} />
                    <Text style={st.cardTitle}>Resumo do Envio</Text>
                </View>
                <View style={st.summaryGrid}>
                    <View style={st.summaryItem}>
                        <Ionicons name="document-text" size={18} color="#64748B" />
                        <View><Text style={st.summaryLabel}>Template</Text><Text style={st.summaryValue}>{selectedTemplate?.title || "Personalizado"}</Text></View>
                    </View>
                    <View style={st.summaryItem}>
                        <Ionicons name="people" size={18} color="#64748B" />
                        <View><Text style={st.summaryLabel}>Audiência</Text><Text style={st.summaryValue}>{getAudienceLabel()}</Text></View>
                    </View>
                    {imageUrl ? <View style={st.summaryItem}><Ionicons name="image" size={18} color="#64748B" /><View><Text style={st.summaryLabel}>Imagem</Text><Text style={st.summaryValue}>Anexada</Text></View></View> : null}
                </View>
            </View>

            <View style={st.card}>
                <Text style={st.previewLabel}>Preview</Text>
                <View style={st.previewPhone}>
                    <View style={st.previewPhoneHeader}>
                        <View style={st.previewAvatar}><Ionicons name="person" size={16} color="#FFF" /></View>
                        <Text style={st.previewName}>{"{{name}}"}</Text>
                    </View>
                    <View style={st.previewBubble}>
                        {imageUrl ? (
                            <View style={st.previewImageContainer}>
                                <Image source={{ uri: imageUrl }} style={st.previewImage} resizeMode="cover" />
                            </View>
                        ) : null}
                        {(messageText || selectedTemplate?.content) ? (
                            <Text style={[st.previewText, imageUrl && st.previewCaption]}>{messageText || selectedTemplate?.content || ""}</Text>
                        ) : null}
                        <Text style={st.previewTime}>{new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</Text>
                    </View>
                </View>
            </View>

            {result && (
                <View style={[st.resultCard, result.success ? st.resultSuccess : st.resultError]}>
                    <Ionicons name={result.success ? "checkmark-circle" : "close-circle"} size={28} color={result.success ? "#10B981" : "#EF4444"} />
                    <View style={{ flex: 1 }}>
                        <Text style={st.resultTitle}>{result.success ? "Envio Concluído!" : "Erro no Envio"}</Text>
                        <Text style={st.resultText}>{result.success ? `${result.count} enviadas${result.failed ? `, ${result.failed} falharam` : ""}` : result.errors?.[0] || "Erro"}</Text>
                    </View>
                </View>
            )}

            <View style={st.warningBox}>
                <Ionicons name="warning" size={18} color="#F59E0B" />
                <Text style={st.warningText}>Disparos em massa devem ser feitos com cautela para evitar bloqueios.</Text>
            </View>

            <View style={st.navRow}>
                <Pressable style={st.backStepBtn} onPress={() => setStep("audience")}>
                    <Ionicons name="arrow-back" size={18} color={colors.purple} /><Text style={st.backStepText}>Voltar</Text>
                </Pressable>
                <Pressable style={[st.sendFinalBtn, (!selectedTemplate || sending || loadingRisk) && st.sendFinalBtnDisabled]}
                    onPress={handlePreSend} disabled={!selectedTemplate || sending || loadingRisk}>
                    {sending || loadingRisk ? <><ActivityIndicator size="small" color="#FFF" /><Text style={st.sendFinalBtnText}>{loadingRisk ? "Verificando..." : "Enviando..."}</Text></>
                        : <><Ionicons name="paper-plane" size={18} color="#FFF" /><Text style={st.sendFinalBtnText}>Enviar Mensagens</Text></>}
                </Pressable>
            </View>
        </View>
    );

    // ========================
    // Audience selection modal
    // ========================
    const renderAudienceModal = () => {
        const studentsForModal = getAudienceStudents();
        const filtered = audienceSearch
            ? studentsForModal.filter((s) => s.name?.toLowerCase().includes(audienceSearch.toLowerCase()) || s.phone?.includes(audienceSearch))
            : studentsForModal;
        const selectedCount = filtered.filter((s) => !excludedStudentIds.has(s.uid)).length;

        const toggleAll = () => {
            if (selectedCount === filtered.length) {
                // Deselect all visible
                setExcludedStudentIds((prev) => {
                    const next = new Set(prev);
                    filtered.forEach((s) => next.add(s.uid));
                    return next;
                });
            } else {
                // Select all visible
                setExcludedStudentIds((prev) => {
                    const next = new Set(prev);
                    filtered.forEach((s) => next.delete(s.uid));
                    return next;
                });
            }
        };

        const toggleStudent = (uid: string) => {
            setExcludedStudentIds((prev) => {
                const next = new Set(prev);
                if (next.has(uid)) next.delete(uid);
                else next.add(uid);
                return next;
            });
        };

        const audienceTitle = audienceType === "pending_bills" ? "Alunos com Contas Pendentes"
            : audienceType === "birthdays" ? "Aniversariantes do Dia"
            : "Todos os Alunos";

        return (
            <Modal visible={showAudienceModal} transparent animationType="fade">
                <View style={st.modalOverlay}>
                    <View style={[st.audienceModal, isDesktop && st.audienceModalDesktop]}>
                        <View style={st.audienceModalHeader}>
                            <Text style={st.audienceModalTitle}>{audienceTitle}</Text>
                            <Pressable onPress={() => setShowAudienceModal(false)}>
                                <Ionicons name="close" size={24} color="#64748B" />
                            </Pressable>
                        </View>

                        {/* Search */}
                        <View style={st.audienceSearchRow}>
                            <Ionicons name="search" size={18} color="#94A3B8" />
                            <TextInput
                                style={st.audienceSearchInput}
                                value={audienceSearch}
                                onChangeText={setAudienceSearch}
                                placeholder="Buscar aluno..."
                                placeholderTextColor="#94A3B8"
                            />
                        </View>

                        {/* Select all */}
                        <Pressable style={st.selectAllRow} onPress={toggleAll}>
                            <Ionicons
                                name={selectedCount === filtered.length ? "checkbox" : selectedCount > 0 ? "remove-outline" : "square-outline"}
                                size={22} color={colors.purple} />
                            <Text style={st.selectAllText}>
                                {selectedCount === filtered.length ? "Desmarcar todos" : "Selecionar todos"}
                            </Text>
                            <Text style={st.selectAllCount}>{selectedCount}/{filtered.length}</Text>
                        </Pressable>

                        {/* Student list */}
                        <ScrollView style={st.audienceList} showsVerticalScrollIndicator={false}>
                            {filtered.map((student) => {
                                const isChecked = !excludedStudentIds.has(student.uid);
                                return (
                                    <Pressable key={student.uid} style={st.audienceStudentRow} onPress={() => toggleStudent(student.uid)}>
                                        <Ionicons name={isChecked ? "checkbox" : "square-outline"} size={22} color={isChecked ? colors.purple : "#CBD5E1"} />
                                        <View style={st.audienceStudentInfo}>
                                            <Text style={st.audienceStudentName}>{student.name}</Text>
                                            <Text style={st.audienceStudentPhone}>{student.phone || "Sem telefone"}</Text>
                                        </View>
                                        {audienceType === "birthdays" && student.birthDate && (
                                            <View style={st.birthdayTag}><Ionicons name="gift" size={14} color="#F59E0B" /></View>
                                        )}
                                    </Pressable>
                                );
                            })}
                            {filtered.length === 0 && (
                                <View style={st.emptyBlock}><Text style={st.emptyText}>Nenhum aluno encontrado</Text></View>
                            )}
                        </ScrollView>

                        <Pressable style={st.audienceModalDone} onPress={() => setShowAudienceModal(false)}>
                            <Text style={st.audienceModalDoneText}>Confirmar ({selectedCount} selecionados)</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>
        );
    };

    return (
        <View style={st.container}>
            {fileInput}
            {loading ? (
                <View style={st.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.purple} />
                    <Text style={st.loadingText}>Carregando dados...</Text>
                </View>
            ) : (
                <>
                    {renderStepIndicator()}
                    <ScrollView style={st.scrollArea} contentContainerStyle={[st.scrollContent, isDesktop && st.scrollContentDesktop]} showsVerticalScrollIndicator={false}>
                        {step === "compose" && renderComposeStep()}
                        {step === "audience" && renderAudienceStep()}
                        {step === "preview" && renderPreviewStep()}
                    </ScrollView>
                </>
            )}

            {/* Template Editor Modal */}
            <Modal visible={showEditor} transparent animationType="fade">
                <View style={st.modalOverlay}>
                    <View style={[st.editorModal, isDesktop && st.editorModalDesktop]}>
                        <View style={st.editorHeader}>
                            <Text style={st.editorTitle}>{editingTemplate ? "Editar Template" : "Novo Template"}</Text>
                            <Pressable onPress={() => setShowEditor(false)}><Ionicons name="close" size={24} color="#64748B" /></Pressable>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={st.inputLabel}>Título</Text>
                            <TextInput style={st.input} value={editorTitle} onChangeText={setEditorTitle} placeholder="Ex: Boas-vindas" placeholderTextColor="#94A3B8" />

                            <Text style={st.inputLabel}>Categoria</Text>
                            <View style={st.categoryPicker}>
                                {(["marketing", "utility", "service"] as const).map((cat) => (
                                    <Pressable key={cat} style={[st.categoryOption, editorCategory === cat && { borderColor: getCategoryColor(cat), backgroundColor: getCategoryColor(cat) + "10" }]}
                                        onPress={() => setEditorCategory(cat)}>
                                        <Text style={[st.categoryOptionText, editorCategory === cat && { color: getCategoryColor(cat) }]}>{getCategoryLabel(cat)}</Text>
                                    </Pressable>
                                ))}
                            </View>

                            <Text style={st.inputLabel}>Conteúdo da Mensagem</Text>
                            <View style={st.formatBar}>
                                {FORMAT_BUTTONS.map((fb) => (
                                    <Pressable
                                        key={fb.marker}
                                        style={st.formatBtn}
                                        onPress={() => applyFormat(fb.marker, editorContent, editorSelection, setEditorContent)}
                                    >
                                        <Text style={[st.formatBtnText, fb.style]}>{fb.label}</Text>
                                    </Pressable>
                                ))}
                            </View>
                            <TextInput
                                ref={editorInputRef}
                                style={[st.input, st.textArea]}
                                value={editorContent}
                                onChangeText={setEditorContent}
                                onSelectionChange={(e: any) => setEditorSelection(e.nativeEvent.selection)}
                                placeholder="Digite a mensagem... Use {{name}} para o nome do aluno"
                                placeholderTextColor="#94A3B8"
                                multiline
                                textAlignVertical="top"
                            />

                            <Text style={st.inputLabel}>Imagem do Template (opcional)</Text>
                            <View style={st.editorImageSection}>
                                <Pressable style={st.editorImageBtn} onPress={() => {
                                    // Reuse file input for template image
                                    const tempHandler = handleFileSelected;
                                    const origHandler = handleFileSelected;
                                    // Override temporarily
                                    if (fileInputRef.current) {
                                        const listener = async (ev: any) => {
                                            const file = ev.target?.files?.[0];
                                            if (!file || !file.type.startsWith("image/")) return;
                                            const reader = new FileReader();
                                            reader.onload = async () => {
                                                const base64 = reader.result as string;
                                                setEditorImageUrl(base64);
                                                try {
                                                    const img = await WhatsAppService.uploadBroadcastImage(file.name, base64);
                                                    setGalleryImages((prev) => [img, ...prev]);
                                                } catch {}
                                            };
                                            reader.readAsDataURL(file);
                                            fileInputRef.current?.removeEventListener("change", listener);
                                        };
                                        fileInputRef.current.addEventListener("change", listener, { once: true });
                                        fileInputRef.current.click();
                                    }
                                }}>
                                    <Ionicons name="image-outline" size={18} color={colors.purple} />
                                    <Text style={st.editorImageBtnText}>Selecionar Imagem</Text>
                                </Pressable>

                                {/* Show gallery picker */}
                                {galleryImages.length > 0 && (
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                                        {galleryImages.map((img) => (
                                            <Pressable key={img.id} onPress={() => setEditorImageUrl(img.url)}
                                                style={[st.editorGalleryThumb, editorImageUrl === img.url && st.editorGalleryThumbActive]}>
                                                <Image source={{ uri: img.url }} style={st.editorGalleryThumbImg} resizeMode="cover" />
                                            </Pressable>
                                        ))}
                                    </ScrollView>
                                )}

                                {editorImageUrl ? (
                                    <View style={st.editorImagePreview}>
                                        <Image source={{ uri: editorImageUrl }} style={st.editorImagePreviewImg} resizeMode="cover" />
                                        <Pressable style={st.editorImageRemoveBtn} onPress={() => setEditorImageUrl("")}>
                                            <Ionicons name="close-circle" size={22} color="#EF4444" />
                                        </Pressable>
                                    </View>
                                ) : null}
                            </View>

                            <View style={st.variablesInfo}>
                                <Ionicons name="information-circle" size={16} color="#64748B" />
                                <Text style={st.variablesText}>Use {"{{name}}"} para o nome do aluno, {"{{date}}"} para a data atual.</Text>
                            </View>
                        </ScrollView>
                        <View style={st.editorActions}>
                            <Pressable style={st.cancelBtn} onPress={() => setShowEditor(false)}><Text style={st.cancelBtnText}>Cancelar</Text></Pressable>
                            <Pressable style={[st.saveBtn, saving && st.saveBtnDisabled]} onPress={handleSaveTemplate} disabled={saving}>
                                {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={st.saveBtnText}>Salvar</Text>}
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Confirm modal with risk warnings */}
            <Modal visible={showConfirm} transparent animationType="fade">
                <View style={st.modalOverlay}>
                    <View style={[st.confirmModal, broadcastWarnings.length > 0 && st.confirmModalWide]}>
                        {broadcastWarnings.length > 0 ? (
                            <>
                                <View style={st.confirmIcon}>
                                    <Ionicons
                                        name={broadcastWarnings.some((w) => w.severity === "critical") ? "shield" : "shield-checkmark"}
                                        size={28}
                                        color={broadcastWarnings.some((w) => w.severity === "critical") ? "#EF4444" : "#F59E0B"}
                                    />
                                </View>
                                <Text style={st.confirmTitle}>
                                    {broadcastWarnings.some((w) => w.severity === "critical") ? "Atenção — Risco Alto" : "Avisos de Disparo"}
                                </Text>
                                <Text style={st.confirmText}>
                                    Enviar <Text style={st.confirmBold}>{selectedTemplate?.title || "mensagem"}</Text> para <Text style={st.confirmBold}>{getAudienceLabel()}</Text>{imageUrl ? " com imagem" : ""}
                                </Text>
                                <ScrollView style={st.riskList} showsVerticalScrollIndicator={false}>
                                    {broadcastWarnings.map((w, i) => (
                                        <View key={i} style={[st.riskItem, w.severity === "critical" ? st.riskCritical : w.severity === "warning" ? st.riskWarning : st.riskInfo]}>
                                            <View style={st.riskItemHeader}>
                                                <Ionicons
                                                    name={w.icon as any}
                                                    size={18}
                                                    color={w.severity === "critical" ? "#EF4444" : w.severity === "warning" ? "#F59E0B" : "#3B82F6"}
                                                />
                                                <Text style={[st.riskItemTitle, w.severity === "critical" && st.riskTitleCritical]}>{w.title}</Text>
                                            </View>
                                            <Text style={st.riskItemMessage}>{w.message}</Text>
                                        </View>
                                    ))}
                                </ScrollView>
                                {broadcastWarnings.some((w) => w.severity === "critical") && (
                                    <View style={st.riskCriticalBanner}>
                                        <Ionicons name="warning" size={16} color="#991B1B" />
                                        <Text style={st.riskCriticalText}>Prosseguir pode resultar em bloqueio temporário ou permanente da sua conta WhatsApp.</Text>
                                    </View>
                                )}
                                <View style={st.confirmActions}>
                                    <Pressable style={st.confirmCancelBtn} onPress={() => setShowConfirm(false)}><Text style={st.confirmCancelText}>Cancelar</Text></Pressable>
                                    <Pressable
                                        style={[st.confirmSendBtn, broadcastWarnings.some((w) => w.severity === "critical") && st.confirmSendBtnDanger]}
                                        onPress={handleSend}
                                    >
                                        <Ionicons name="send" size={16} color="#FFF" />
                                        <Text style={st.confirmSendText}>Enviar Mesmo Assim</Text>
                                    </Pressable>
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={st.confirmIcon}><Ionicons name="shield-checkmark" size={28} color="#10B981" /></View>
                                <Text style={st.confirmTitle}>Tudo Certo!</Text>
                                <Text style={st.confirmText}>
                                    Enviar <Text style={st.confirmBold}>{selectedTemplate?.title || "mensagem"}</Text> para <Text style={st.confirmBold}>{getAudienceLabel()}</Text>{imageUrl ? " com imagem" : ""}?
                                </Text>
                                <View style={st.riskSafeBanner}>
                                    <Ionicons name="checkmark-circle" size={16} color="#065F46" />
                                    <Text style={st.riskSafeText}>Nenhum risco detectado. Envio dentro dos limites recomendados.</Text>
                                </View>
                                <View style={st.confirmActions}>
                                    <Pressable style={st.confirmCancelBtn} onPress={() => setShowConfirm(false)}><Text style={st.confirmCancelText}>Cancelar</Text></Pressable>
                                    <Pressable style={st.confirmSendBtn} onPress={handleSend}><Ionicons name="send" size={16} color="#FFF" /><Text style={st.confirmSendText}>Enviar</Text></Pressable>
                                </View>
                            </>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Audience selection modal */}
            {renderAudienceModal()}
        </View>
    );
}

const st = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#F8FAFC" },
    loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
    loadingText: { fontSize: 14, color: "#64748B" },

    stepBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: "#FFF", paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
    stepItem: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    stepItemActive: { backgroundColor: colors.purple + "10" },
    stepCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#E2E8F0", alignItems: "center", justifyContent: "center" },
    stepCircleActive: { backgroundColor: colors.purple },
    stepLabel: { fontSize: 13, fontWeight: "600", color: "#94A3B8" },
    stepLabelActive: { color: colors.purple },

    scrollArea: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 40 },
    scrollContentDesktop: { maxWidth: 900, alignSelf: "center", width: "100%", padding: 24 },
    stepContent: { gap: 16 },

    card: { backgroundColor: "#FFF", borderRadius: 14, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
    cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
    cardTitle: { fontSize: 16, fontWeight: "700", color: "#1E293B" },

    templateChip: { backgroundColor: "#F8FAFC", borderRadius: 10, padding: 12, borderWidth: 2, borderColor: "transparent", minWidth: 200, maxWidth: 260 },
    templateChipMobile: { minWidth: undefined, maxWidth: undefined, width: "100%" },
    templateChipActive: { borderColor: colors.purple, backgroundColor: colors.purple + "06" },
    templateChipImage: { width: "100%", height: 80, borderRadius: 8, marginBottom: 8 },
    templateChipHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
    templateChipTitle: { fontSize: 14, fontWeight: "600", color: "#1E293B", flex: 1 },
    templateChipTitleActive: { color: colors.purple },
    templateChipActions: { flexDirection: "row", gap: 10, marginLeft: 8 },
    templateChipContent: { fontSize: 13, color: "#64748B", lineHeight: 18, marginBottom: 8 },
    catBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    catBadgeText: { fontSize: 11, fontWeight: "600" },
    selectedBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.purple + "20" },
    selectedBadgeText: { fontSize: 12, fontWeight: "600", color: colors.purple },

    addBtn: { flexDirection: "row", alignItems: "center", backgroundColor: colors.purple, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 18, gap: 4 },
    addBtnText: { color: "#FFF", fontSize: 13, fontWeight: "600" },

    emptyBlock: { alignItems: "center", paddingVertical: 24 },
    emptyText: { fontSize: 14, color: "#94A3B8", marginTop: 8 },
    emptySmall: { fontSize: 13, color: "#94A3B8", fontStyle: "italic", textAlign: "center", paddingVertical: 12 },

    messageInput: { backgroundColor: "#F8FAFC", borderRadius: 10, padding: 14, fontSize: 15, color: "#1E293B", minHeight: 100, textAlignVertical: "top", borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 10 },
    smartBar: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
    smartBarLabel: { fontSize: 12, fontWeight: "600", color: "#94A3B8" },
    smartBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: colors.purple + "10", borderWidth: 1, borderColor: colors.purple + "25" },
    smartBtnText: { fontSize: 12, fontWeight: "600", color: colors.purple },

    // Image section
    imageSectionHeader: { flexDirection: "row", gap: 10, alignItems: "center" },
    attachBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: "#F1F5F9", borderWidth: 1, borderColor: "#E2E8F0" },
    attachBtnActive: { backgroundColor: colors.purple + "08", borderColor: colors.purple + "30" },
    attachBtnText: { fontSize: 13, fontWeight: "500", color: "#64748B" },
    clearImageBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
    clearImageText: { fontSize: 12, color: "#EF4444", fontWeight: "500" },

    galleryArea: { marginTop: 12, gap: 10 },
    uploadCard: { alignItems: "center", justifyContent: "center", paddingVertical: 20, borderRadius: 12, borderWidth: 2, borderStyle: "dashed", borderColor: colors.purple + "40", backgroundColor: colors.purple + "04" },
    uploadText: { fontSize: 14, fontWeight: "600", color: colors.purple, marginTop: 6 },
    uploadHint: { fontSize: 11, color: "#94A3B8", marginTop: 2 },

    galleryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    galleryItem: { width: 100, borderRadius: 10, overflow: "hidden", backgroundColor: "#F1F5F9", borderWidth: 2, borderColor: "transparent" },
    galleryItemActive: { borderColor: colors.purple },
    galleryItemImg: { width: "100%", height: 70, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
    galleryItemFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 4, paddingHorizontal: 6 },
    galleryItemName: { fontSize: 10, color: "#64748B", flex: 1 },
    galleryItemCheck: { position: "absolute", top: 4, right: 4 },

    urlInputRow: {},
    urlInput: { backgroundColor: "#F8FAFC", borderRadius: 8, padding: 10, fontSize: 13, color: "#1E293B", borderWidth: 1, borderColor: "#E2E8F0" },
    selectedImagePreview: { borderRadius: 10, overflow: "hidden" },
    selectedImageImg: { width: "100%", height: 140, borderRadius: 10 },

    // Audience
    audienceGrid: { gap: 8 },
    audienceCard: { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: "#F8FAFC", borderRadius: 12, borderWidth: 2, borderColor: "transparent", gap: 12 },
    audienceCardActive: { borderColor: colors.purple, backgroundColor: colors.purple + "06" },
    audienceCardIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#E2E8F0", alignItems: "center", justifyContent: "center" },
    audienceCardIconActive: { backgroundColor: colors.purple },
    audienceCardInfo: { flex: 1 },
    audienceCardTitle: { fontSize: 15, fontWeight: "600", color: "#1E293B" },
    audienceCardTitleActive: { color: colors.purple },
    audienceCardDesc: { fontSize: 12, color: "#94A3B8", marginTop: 2 },
    audienceViewBtn: { padding: 6 },

    selectorArea: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#E2E8F0" },
    selectorLabel: { fontSize: 14, fontWeight: "600", color: "#64748B", marginBottom: 10 },
    selectorGrid: { gap: 6 },
    selectorItem: { flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: "#F8FAFC", borderRadius: 8, gap: 10 },
    selectorItemActive: { backgroundColor: colors.purple + "12" },
    selectorText: { fontSize: 14, color: "#64748B" },
    selectorTextActive: { color: colors.purple, fontWeight: "600" },

    excludedBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEF3C7", padding: 10, borderRadius: 8, marginTop: 12 },
    excludedText: { flex: 1, fontSize: 13, color: "#92400E" },
    excludedClear: { fontSize: 13, fontWeight: "600", color: colors.purple },

    // Navigation
    nextBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: colors.purple, padding: 14, borderRadius: 12, gap: 8 },
    nextBtnFlex: { flex: 1 },
    nextBtnDisabled: { backgroundColor: "#CBD5E1" },
    nextBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
    navRow: { flexDirection: "row", gap: 12, alignItems: "center" },
    backStepBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.purple + "30", backgroundColor: colors.purple + "06" },
    backStepText: { fontSize: 14, fontWeight: "600", color: colors.purple },

    // Formatting toolbar
    formatBar: { flexDirection: "row", gap: 6, marginBottom: 8, paddingHorizontal: 2 },
    formatBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#E2E8F0" },
    formatBtnText: { fontSize: 14, color: "#374151" },

    // Preview
    previewLabel: { fontSize: 14, fontWeight: "600", color: "#64748B", marginBottom: 12 },
    previewPhone: { backgroundColor: "#E5DDD5", borderRadius: 12, padding: 14 },
    previewPhoneHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
    previewAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.purple, alignItems: "center", justifyContent: "center" },
    previewName: { fontSize: 14, fontWeight: "600", color: "#1E293B" },
    previewBubble: { backgroundColor: "#FFF", borderRadius: 12, borderTopLeftRadius: 4, overflow: "hidden", marginLeft: 40, maxWidth: "80%", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
    previewImageContainer: { width: "100%", aspectRatio: 4 / 3, overflow: "hidden" },
    previewImage: { width: "100%", height: "100%" },
    previewText: { fontSize: 14, color: "#1E293B", lineHeight: 20, padding: 10, paddingBottom: 4 },
    previewCaption: { paddingTop: 6 },
    previewTime: { fontSize: 11, color: "#8696A0", textAlign: "right", paddingHorizontal: 10, paddingBottom: 6 },

    summaryGrid: { gap: 12 },
    summaryItem: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
    summaryLabel: { fontSize: 12, color: "#94A3B8", fontWeight: "500" },
    summaryValue: { fontSize: 14, color: "#1E293B", fontWeight: "600", marginTop: 2 },

    resultCard: { flexDirection: "row", alignItems: "flex-start", padding: 14, borderRadius: 12, gap: 12 },
    resultSuccess: { backgroundColor: "#D1FAE5" },
    resultError: { backgroundColor: "#FEE2E2" },
    resultTitle: { fontSize: 15, fontWeight: "700", color: "#1E293B", marginBottom: 2 },
    resultText: { fontSize: 13, color: "#64748B" },

    warningBox: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FEF3C7", padding: 12, borderRadius: 10 },
    warningText: { flex: 1, fontSize: 13, color: "#92400E", lineHeight: 18 },

    sendFinalBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#10B981", padding: 14, borderRadius: 12, gap: 8 },
    sendFinalBtnDisabled: { backgroundColor: "#CBD5E1" },
    sendFinalBtnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },

    // Modals
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 20 },

    editorModal: { backgroundColor: "#FFF", borderRadius: 16, padding: 20, width: "100%", maxWidth: 480, maxHeight: "85%" },
    editorModalDesktop: { maxWidth: 560 },
    editorHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
    editorTitle: { fontSize: 18, fontWeight: "700", color: "#1E293B" },
    inputLabel: { fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 6 },
    input: { backgroundColor: "#F8FAFC", borderRadius: 8, padding: 12, fontSize: 15, color: "#1E293B", marginBottom: 14, borderWidth: 1, borderColor: "#E2E8F0" },
    textArea: { minHeight: 110, textAlignVertical: "top" },
    categoryPicker: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
    categoryOption: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, borderWidth: 2, borderColor: "#E2E8F0", backgroundColor: "#F8FAFC" },
    categoryOptionText: { fontSize: 13, fontWeight: "600", color: "#64748B" },
    variablesInfo: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F1F5F9", padding: 10, borderRadius: 8, marginBottom: 12 },
    variablesText: { flex: 1, fontSize: 12, color: "#64748B" },
    editorActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#E2E8F0" },
    cancelBtn: { paddingHorizontal: 18, paddingVertical: 10 },
    cancelBtnText: { fontSize: 14, color: "#64748B", fontWeight: "600" },
    saveBtn: { backgroundColor: colors.purple, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 8 },
    saveBtnDisabled: { backgroundColor: "#CBD5E1" },
    saveBtnText: { color: "#FFF", fontSize: 14, fontWeight: "600" },

    // Editor image
    editorImageSection: { marginBottom: 14 },
    editorImageBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.purple + "08", borderWidth: 1, borderColor: colors.purple + "25", alignSelf: "flex-start" },
    editorImageBtnText: { fontSize: 13, fontWeight: "600", color: colors.purple },
    editorGalleryThumb: { width: 60, height: 60, borderRadius: 8, overflow: "hidden", marginRight: 6, borderWidth: 2, borderColor: "transparent" },
    editorGalleryThumbActive: { borderColor: colors.purple },
    editorGalleryThumbImg: { width: "100%", height: "100%" },
    editorImagePreview: { position: "relative", marginTop: 8, borderRadius: 10, overflow: "hidden" },
    editorImagePreviewImg: { width: "100%", height: 120, borderRadius: 10 },
    editorImageRemoveBtn: { position: "absolute", top: 6, right: 6, backgroundColor: "#FFF", borderRadius: 12 },

    // Confirm
    confirmModal: { backgroundColor: "#FFF", borderRadius: 16, padding: 24, width: "100%", maxWidth: 380, alignItems: "stretch" },
    confirmIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.purple + "12", alignItems: "center", justifyContent: "center", marginBottom: 14, alignSelf: "center" },
    confirmTitle: { fontSize: 18, fontWeight: "700", color: "#1E293B", marginBottom: 10, textAlign: "center" },
    confirmText: { fontSize: 14, color: "#64748B", textAlign: "center", lineHeight: 22, marginBottom: 14 },
    confirmBold: { fontWeight: "700", color: "#1E293B" },
    confirmWarning: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEF3C7", padding: 10, borderRadius: 8, marginBottom: 18, width: "100%" },
    confirmWarningText: { fontSize: 12, color: "#92400E" },
    confirmActions: { flexDirection: "row", gap: 10, marginTop: 8 },
    confirmCancelBtn: { flex: 1, paddingVertical: 13, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: "#E2E8F0", alignItems: "center", justifyContent: "center" },
    confirmCancelText: { fontSize: 14, fontWeight: "600", color: "#64748B" },
    confirmSendBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#10B981", paddingVertical: 13, paddingHorizontal: 16, borderRadius: 10 },
    confirmSendBtnDanger: { backgroundColor: "#EF4444" },
    confirmSendText: { fontSize: 14, fontWeight: "600", color: "#FFF" },
    confirmModalWide: { maxWidth: 460 },

    // Risk warnings
    riskList: { maxHeight: 240, marginBottom: 12 },
    riskItem: { padding: 12, borderRadius: 10, marginBottom: 8, borderWidth: 1 },
    riskCritical: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
    riskWarning: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" },
    riskInfo: { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" },
    riskItemHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
    riskItemTitle: { fontSize: 13, fontWeight: "700", color: "#1E293B" },
    riskTitleCritical: { color: "#DC2626" },
    riskItemMessage: { fontSize: 12, color: "#64748B", lineHeight: 18, paddingLeft: 26 },
    riskCriticalBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEE2E2", padding: 10, borderRadius: 8, marginBottom: 14, borderWidth: 1, borderColor: "#FECACA" },
    riskCriticalText: { fontSize: 12, color: "#991B1B", flex: 1, fontWeight: "500" },
    riskSafeBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#ECFDF5", padding: 10, borderRadius: 8, marginBottom: 14, borderWidth: 1, borderColor: "#A7F3D0" },
    riskSafeText: { fontSize: 12, color: "#065F46", flex: 1 },

    // Audience modal
    audienceModal: { backgroundColor: "#FFF", borderRadius: 16, padding: 20, width: "100%", maxWidth: 480, maxHeight: "80%" },
    audienceModalDesktop: { maxWidth: 560 },
    audienceModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
    audienceModalTitle: { fontSize: 18, fontWeight: "700", color: "#1E293B" },
    audienceSearchRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#F1F5F9", borderRadius: 8, paddingHorizontal: 12, marginBottom: 10 },
    audienceSearchInput: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, fontSize: 14, color: "#1E293B" },
    selectAllRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
    selectAllText: { flex: 1, fontSize: 14, fontWeight: "600", color: "#1E293B" },
    selectAllCount: { fontSize: 13, color: "#94A3B8", fontWeight: "500" },
    audienceList: { flex: 1, maxHeight: 360 },
    audienceStudentRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F8FAFC" },
    audienceStudentInfo: { flex: 1 },
    audienceStudentName: { fontSize: 14, fontWeight: "500", color: "#1E293B" },
    audienceStudentPhone: { fontSize: 12, color: "#94A3B8", marginTop: 1 },
    birthdayTag: { padding: 4, backgroundColor: "#FEF3C7", borderRadius: 6 },
    audienceModalDone: { backgroundColor: colors.purple, paddingVertical: 12, borderRadius: 10, alignItems: "center", marginTop: 12 },
    audienceModalDoneText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
});
