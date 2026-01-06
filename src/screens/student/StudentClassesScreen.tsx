import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, ScrollView, Text, Pressable, ActivityIndicator, RefreshControl, Modal, Alert, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Linking } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import CdmfHeader from "../../components/CdmfHeader";
import SectionHeader from "../../components/SectionHeader";
import StudentHeader from "../../components/StudentHeader";
import LessonCard from "../../components/LessonCard";
import { colors } from "../../theme/colors";
import { useAuth, Class } from "../../contexts/AuthContext";
import { useDesktop } from "../../contexts/DesktopContext";
import { useTheme } from "../../contexts/ThemeContext";

const DAYS_OF_WEEK = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DAYS_OF_WEEK_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

// Número de WhatsApp (trocar pelo real)
const WHATSAPP_NUMBER = "5500000000000";

// Mapeamento de estilos de dança para ícones (mesmo do LessonCard)
const DANCE_ICONS: Record<string, any> = {
  // Forró e variações
  "forró": require("../../../assets/dance_ico1.png"),
  "forro": require("../../../assets/dance_ico1.png"),
  "forró universitário": require("../../../assets/dance_ico1.png"),
  "forró pé de serra": require("../../../assets/dance_ico1.png"),
  "xote": require("../../../assets/dance_ico1.png"),
  "baião": require("../../../assets/dance_ico1.png"),
  
  // Dança de Salão e variações
  "dança de salão": require("../../../assets/dance_ico2.png"),
  "danca de salao": require("../../../assets/dance_ico2.png"),
  "bolero": require("../../../assets/dance_ico2.png"),
  "valsa": require("../../../assets/dance_ico2.png"),
  "tango": require("../../../assets/dance_ico2.png"),
  "foxtrote": require("../../../assets/dance_ico2.png"),
  "quickstep": require("../../../assets/dance_ico2.png"),
  
  // Samba e variações
  "samba de gafieira": require("../../../assets/dance_ico3.png"),
  "samba": require("../../../assets/dance_ico3.png"),
  "gafieira": require("../../../assets/dance_ico3.png"),
  "pagode": require("../../../assets/dance_ico3.png"),
  "samba rock": require("../../../assets/dance_ico3.png"),
  "samba no pé": require("../../../assets/dance_ico3.png"),
  
  // Zouk, Kizomba e variações
  "zouk": require("../../../assets/dance_ico4.png"),
  "zouk brasileiro": require("../../../assets/dance_ico4.png"),
  "kizomba": require("../../../assets/dance_ico4.png"),
  "bachata": require("../../../assets/dance_ico4.png"),
  "lambada": require("../../../assets/dance_ico4.png"),
  "lambazouk": require("../../../assets/dance_ico4.png"),
  "salsa": require("../../../assets/dance_ico4.png"),
  "merengue": require("../../../assets/dance_ico4.png"),
  
  // Ícone padrão
  "default": require("../../../assets/dance_ico1.png"),
};

// Função para obter o ícone baseado no nome da aula
const getDanceIcon = (lessonName: string) => {
  const normalizedName = lessonName.toLowerCase().trim();
  
  // Procura correspondência exata primeiro
  if (DANCE_ICONS[normalizedName]) {
    return DANCE_ICONS[normalizedName];
  }
  
  // Procura correspondência parcial
  for (const key of Object.keys(DANCE_ICONS)) {
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return DANCE_ICONS[key];
    }
  }
  
  // Retorna ícone padrão
  return DANCE_ICONS["default"];
};

export default function StudentClassesScreen() {
  const { profile, fetchClasses } = useAuth();
  const { isDesktopMode } = useDesktop();
  const { colors: themeColors, isDark } = useTheme();
  const [myClasses, setMyClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Modal de opções da aula (desktop)
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [showOptionsModal, setShowOptionsModal] = useState(false);

  // Funções do menu contextual
  const handleCantAttend = (classItem: Class) => {
    const message = `Olá, não vou poder comparecer à aula de ${classItem.name}. Por favor, registre minha falta.`;
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    Linking.openURL(url);
    setShowOptionsModal(false);
  };

  const handleTalkToTeacher = (classItem: Class) => {
    const message = `Olá Professor ${classItem.teacherName || ""}, gostaria de falar sobre a aula de ${classItem.name}.`;
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    Linking.openURL(url);
    setShowOptionsModal(false);
  };

  const handleRequestLeave = (classItem: Class) => {
    const message = `Olá, gostaria de solicitar minha saída da turma de ${classItem.name}. Podemos conversar sobre isso?`;
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    Linking.openURL(url);
    setShowOptionsModal(false);
  };

  const openClassOptions = (classItem: Class) => {
    setSelectedClass(classItem);
    setShowOptionsModal(true);
  };

  const loadClasses = useCallback(async () => {
    if (!profile) {
      setLoading(false);
      return;
    }
    
    try {
      const allClasses = await fetchClasses();
      // Filtra apenas as turmas em que o aluno está matriculado
      const studentClasses = allClasses.filter(c => 
        c.studentIds && c.studentIds.includes(profile.uid)
      );
      setMyClasses(studentClasses);
    } catch (e) {
      console.error("Erro ao carregar turmas:", e);
      setMyClasses([]);
    } finally {
      setLoading(false);
    }
  }, [profile, fetchClasses]);

  // Recarrega dados quando a tela ganha foco
  useFocusEffect(
    useCallback(() => {
      loadClasses();
    }, [loadClasses])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadClasses();
    setRefreshing(false);
  };

  // Calcula informações da próxima aula
  const getNextClassInfo = (classItem: Class) => {
    if (!classItem.schedule || classItem.schedule.length === 0) {
      return { dayLabel: "A definir", date: "", time: "--:--", daysUntil: 999 };
    }

    const now = new Date();
    const todayDayOfWeek = now.getDay();
    
    let nextSchedule = null;
    let daysUntilClass = 7;
    
    for (const schedule of classItem.schedule) {
      let daysUntil = schedule.dayOfWeek - todayDayOfWeek;
      if (daysUntil < 0) daysUntil += 7;
      if (daysUntil === 0) {
        const [hours, minutes] = schedule.startTime.split(":").map(Number);
        const classTime = new Date(now);
        classTime.setHours(hours, minutes, 0, 0);
        if (classTime < now) {
          daysUntil = 7;
        }
      }
      
      if (daysUntil < daysUntilClass) {
        daysUntilClass = daysUntil;
        nextSchedule = schedule;
      }
    }
    
    if (!nextSchedule) {
      nextSchedule = classItem.schedule[0];
      daysUntilClass = 7;
    }
    
    const nextDate = new Date(now);
    nextDate.setDate(now.getDate() + daysUntilClass);

    let dayLabel = DAYS_OF_WEEK_SHORT[nextSchedule.dayOfWeek];
    if (daysUntilClass === 0) dayLabel = "HOJE";
    else if (daysUntilClass === 1) dayLabel = "AMANHÃ";
    
    return {
      dayLabel,
      date: nextDate.toLocaleDateString("pt-BR"),
      time: nextSchedule.startTime,
      daysUntil: daysUntilClass,
    };
  };

  // Formata os dados da turma para o LessonCard
  const formatLessonData = (classItem: Class) => {
    const nextClass = getNextClassInfo(classItem);
    
    return {
      teacher: classItem.teacherName || "Sem professor",
      lesson: classItem.name,
      date: nextClass.date,
      time: nextClass.time,
      dayLabel: nextClass.dayLabel,
    };
  };

  // Depois você troca pelo número/links reais do CDMF
  const whatsappLink = "https://wa.me/5500000000000";
  const instagramLink = "https://instagram.com";

  // Desktop Layout
  if (isDesktopMode) {
    return (
      <View style={[desktopStyles.screen, { backgroundColor: themeColors.bg }]}>
        {/* Modal de Opções da Aula */}
        <Modal visible={showOptionsModal} transparent animationType="fade">
          <Pressable style={desktopStyles.modalOverlay} onPress={() => setShowOptionsModal(false)}>
            <View style={[desktopStyles.modalContent, { backgroundColor: themeColors.bgCard }]}>
              {selectedClass && (
                <>
                  <View style={[desktopStyles.modalHeader, { borderBottomColor: themeColors.border }]}>
                    <Text style={[desktopStyles.modalTitle, { color: themeColors.text }]}>{selectedClass.name}</Text>
                    <Text style={[desktopStyles.modalSubtitle, { color: themeColors.textMuted }]}>
                      Prof. {selectedClass.teacherName || "A definir"}
                    </Text>
                  </View>

                  <Pressable 
                    style={[desktopStyles.modalOption, { borderBottomColor: themeColors.border }]} 
                    onPress={() => handleCantAttend(selectedClass)}
                  >
                    <View style={[desktopStyles.modalOptionIcon, { backgroundColor: isDark ? "#713F12" : "#FEF3C7" }]}>
                      <Ionicons name="close-circle" size={22} color="#D97706" />
                    </View>
                    <View style={desktopStyles.modalOptionContent}>
                      <Text style={[desktopStyles.modalOptionTitle, { color: themeColors.text }]}>Não vou poder comparecer</Text>
                      <Text style={[desktopStyles.modalOptionDescription, { color: themeColors.textMuted }]}>Avisar sobre ausência na aula</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={themeColors.textMuted} />
                  </Pressable>

                  <Pressable 
                    style={[desktopStyles.modalOption, { borderBottomColor: themeColors.border }]} 
                    onPress={() => handleTalkToTeacher(selectedClass)}
                  >
                    <View style={[desktopStyles.modalOptionIcon, { backgroundColor: isDark ? "#2E1065" : "#F3E8FF" }]}>
                      <Ionicons name="chatbubble" size={20} color={themeColors.purple} />
                    </View>
                    <View style={desktopStyles.modalOptionContent}>
                      <Text style={[desktopStyles.modalOptionTitle, { color: themeColors.text }]}>Falar com professor</Text>
                      <Text style={[desktopStyles.modalOptionDescription, { color: themeColors.textMuted }]}>Abrir conversa no WhatsApp</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={themeColors.textMuted} />
                  </Pressable>

                  <Pressable 
                    style={[desktopStyles.modalOption, { borderBottomColor: themeColors.border }]} 
                    onPress={() => handleRequestLeave(selectedClass)}
                  >
                    <View style={[desktopStyles.modalOptionIcon, { backgroundColor: isDark ? "#7F1D1D" : "#FEE2E2" }]}>
                      <Ionicons name="exit" size={20} color="#DC2626" />
                    </View>
                    <View style={desktopStyles.modalOptionContent}>
                      <Text style={[desktopStyles.modalOptionTitle, { color: themeColors.text }]}>Solicitar saída da turma</Text>
                      <Text style={[desktopStyles.modalOptionDescription, { color: themeColors.textMuted }]}>Enviar solicitação de desligamento</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={themeColors.textMuted} />
                  </Pressable>

                  <Pressable 
                    style={[desktopStyles.modalCloseButton, { backgroundColor: themeColors.bgSecondary }]} 
                    onPress={() => setShowOptionsModal(false)}
                  >
                    <Text style={[desktopStyles.modalCloseText, { color: themeColors.textSecondary }]}>Fechar</Text>
                  </Pressable>
                </>
              )}
            </View>
          </Pressable>
        </Modal>

        <ScrollView 
          contentContainerStyle={desktopStyles.content} 
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.purple]} />
          }
        >
          {/* Dashboard Container */}
          <View style={[desktopStyles.dashboardContainer, { backgroundColor: themeColors.bg }]}>
            {/* Header Banner */}
            <View style={[desktopStyles.headerBanner, isDark && { backgroundColor: '#1E3A5F' }]}>
              <View style={[desktopStyles.headerIcon, { backgroundColor: isDark ? themeColors.purpleLight : '#F3E8FF' }]}>
                <Ionicons name="calendar" size={24} color={themeColors.purple} />
              </View>
              <View style={desktopStyles.headerContent}>
                <Text style={[desktopStyles.headerTitle, isDark && { color: themeColors.text }]}>Minhas Aulas</Text>
                <Text style={[desktopStyles.headerSubtitle, isDark && { color: themeColors.textSecondary }]}>
                  Gerencie suas turmas e horários
                </Text>
              </View>
              <View style={[desktopStyles.headerBadge, isDark && { backgroundColor: themeColors.bgCard }]}>
                <Text style={[desktopStyles.headerBadgeText, isDark && { color: themeColors.text }]}>{myClasses.length} turma{myClasses.length !== 1 ? 's' : ''}</Text>
              </View>
            </View>

            {/* Main Content Grid */}
            <View style={desktopStyles.mainGrid}>
              {/* Classes Section */}
              <View style={[desktopStyles.classesSection, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border, borderWidth: 1 }]}>
                <View style={desktopStyles.sectionHeader}>
                  <Text style={[desktopStyles.sectionTitle, { color: themeColors.textMuted }]}>Suas Turmas Matriculadas</Text>
                </View>

                {loading ? (
                  <View style={[desktopStyles.loadingBox, { backgroundColor: themeColors.bgSecondary }]}>
                    <ActivityIndicator size="large" color={themeColors.purple} />
                    <Text style={[desktopStyles.loadingText, { color: themeColors.textMuted }]}>Carregando turmas...</Text>
                  </View>
                ) : myClasses.length === 0 ? (
                  <View style={desktopStyles.emptyBox}>
                    <Ionicons name="school-outline" size={48} color={themeColors.textMuted} />
                    <Text style={[desktopStyles.emptyTitle, { color: themeColors.text }]}>Nenhuma turma encontrada</Text>
                    <Text style={[desktopStyles.emptySubtitle, { color: themeColors.textMuted }]}>
                      Você ainda não está matriculado em nenhuma turma
                    </Text>
                  </View>
                ) : (
                  <View style={desktopStyles.classesGrid}>
                    {myClasses.map((classItem) => {
                      const nextClass = getNextClassInfo(classItem);
                      const isToday = nextClass.daysUntil === 0;
                      const isTomorrow = nextClass.daysUntil === 1;
                      const danceIcon = getDanceIcon(classItem.name);
                      
                      return (
                        <Pressable 
                          key={classItem.id} 
                          style={[
                            desktopStyles.classCard,
                            { backgroundColor: "#FFC107", borderColor: themeColors.border },
                            isToday && [desktopStyles.classCardHighlight, isDark && { backgroundColor: '#14532D', borderColor: '#22C55E' }],
                            isTomorrow && isDark && { backgroundColor: '#1E3A5F', borderColor: '#3B82F6' }
                          ]}
                          onPress={() => openClassOptions(classItem)}
                        >
                          {/* Ícone da dança */}
                          <View style={[
                            desktopStyles.classCardIconContainer,
                            { backgroundColor: "#3B2E6E" },
                            isToday && desktopStyles.classCardIconContainerToday,
                            isTomorrow && desktopStyles.classCardIconContainerTomorrow
                          ]}>
                            <Image 
                              source={danceIcon} 
                              style={desktopStyles.classCardDanceIcon}
                              resizeMode="cover"
                            />
                          </View>
                          
                          <View style={desktopStyles.classCardContent}>
                            <Text style={[desktopStyles.className, { color: colors.text }]}>{classItem.name}</Text>
                            <Text style={[desktopStyles.classTeacher, { color: colors.text, opacity: 0.75 }]}>
                              Prof. {classItem.teacherName || "A definir"}
                            </Text>
                            
                            <View style={desktopStyles.classScheduleRow}>
                              <View style={[
                                desktopStyles.classDayBadge,
                                { backgroundColor: "#3B2E6E" },
                                isToday && desktopStyles.classDayBadgeToday,
                                isTomorrow && desktopStyles.classDayBadgeTomorrow
                              ]}>
                                <Text style={[
                                  desktopStyles.classDayText,
                                  { color: "#fff" }
                                ]}>
                                  {nextClass.dayLabel}
                                </Text>
                              </View>
                              <Text style={[desktopStyles.classTime, { color: colors.text }]}>{nextClass.time}h</Text>
                              <Text style={[desktopStyles.classDate, { color: colors.text, opacity: 0.7 }]}>• {nextClass.date}</Text>
                            </View>
                          </View>
                          
                          <View style={desktopStyles.classCardAction}>
                            <Ionicons name="chevron-forward" size={20} color="rgba(0,0,0,0.3)" />
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Sidebar: Actions */}
              <View style={desktopStyles.sidebarSection}>
                {/* Nova Inscrição */}
                <View style={[desktopStyles.actionCard, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
                  <View style={[desktopStyles.actionIconBox, { backgroundColor: isDark ? "#14532D" : "#DCFCE7" }]}>
                    <Ionicons name="add-circle" size={24} color="#16A34A" />
                  </View>
                  <Text style={[desktopStyles.actionTitle, { color: themeColors.text }]}>Nova Inscrição</Text>
                  <Text style={[desktopStyles.actionDescription, { color: themeColors.textMuted }]}>
                    Quer se matricular em mais turmas? Entre em contato!
                  </Text>
                  <Pressable 
                    style={desktopStyles.actionButton}
                    onPress={() => Linking.openURL(whatsappLink)}
                  >
                    <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                    <Text style={desktopStyles.actionButtonText}>Falar no WhatsApp</Text>
                  </Pressable>
                </View>

                {/* Eventos */}
                <View style={[desktopStyles.actionCard, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
                  <View style={[desktopStyles.actionIconBox, { backgroundColor: isDark ? "#831843" : "#FCE7F3" }]}>
                    <Ionicons name="musical-notes" size={24} color="#DB2777" />
                  </View>
                  <Text style={[desktopStyles.actionTitle, { color: themeColors.text }]}>Bailes e Eventos</Text>
                  <Text style={[desktopStyles.actionDescription, { color: themeColors.textMuted }]}>
                    Acompanhe nossos eventos e bailes especiais!
                  </Text>
                  <Pressable 
                    style={[desktopStyles.actionButton, { backgroundColor: "#E1306C" }]}
                    onPress={() => Linking.openURL(instagramLink)}
                  >
                    <Ionicons name="logo-instagram" size={18} color="#fff" />
                    <Text style={desktopStyles.actionButtonText}>Ver no Instagram</Text>
                  </Pressable>
                </View>

                {/* Dúvidas */}
                <View style={[desktopStyles.helpCard, { backgroundColor: themeColors.bgSecondary, borderColor: themeColors.border }]}>
                  <Ionicons name="help-circle-outline" size={20} color={themeColors.textMuted} />
                  <Text style={[desktopStyles.helpText, { color: themeColors.textMuted }]}>
                    Dúvidas sobre horários ou faltas? Entre em contato com a secretaria.
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // Mobile Layout
  return (
    <View style={styles.screen}>
      <StudentHeader />

      <ScrollView 
        contentContainerStyle={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.purple]} />
        }
      >
        <SectionHeader title="Suas Aulas" />

        <View style={styles.block}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.purple} />
              <Text style={styles.loadingText}>Carregando suas turmas...</Text>
            </View>
          ) : myClasses.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="school-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>Você ainda não está matriculado em nenhuma turma</Text>
              <Text style={styles.emptySubtext}>Entre em contato para se inscrever!</Text>
            </View>
          ) : (
            myClasses.map((classItem) => (
              <View key={classItem.id} style={{ marginBottom: 10 }}>
                <LessonCard {...formatLessonData(classItem)} />
              </View>
            ))
          )}
        </View>

        <SectionHeader title="Inscrever-se em novas turmas" />

        <View style={styles.centerBlock}>
          <Text style={styles.centerText}>Entre em contato para novas inscrições:</Text>
          <Pressable onPress={() => Linking.openURL(whatsappLink)} style={styles.socialBtn}>
            <Ionicons name="logo-whatsapp" size={46} color="#1FAF38" />
          </Pressable>
        </View>

        <SectionHeader title="Participe dos nossos bailes" />

        <View style={styles.centerBlock}>
          <Text style={styles.centerText}>Acompanhe os nossos eventos:</Text>
          <Pressable onPress={() => Linking.openURL(instagramLink)} style={styles.socialBtn}>
            <Ionicons name="logo-instagram" size={46} color="#E1306C" />
          </Pressable>
        </View>

        <View style={{ height: 18 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 16 },

  block: { padding: 12, paddingTop: 14 },

  loadingContainer: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: "600",
  },

  emptyContainer: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    marginTop: 6,
  },

  centerBlock: {
    padding: 18,
    alignItems: "center",
    gap: 10,
  },
  centerText: {
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
  },
  socialBtn: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    elevation: 2, // Android sombra leve
  },
});

// Desktop styles
const desktopStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  content: {
    padding: 32,
    paddingTop: 24,
  },
  dashboardContainer: {
    maxWidth: 1100,
  },

  // Header Banner
  headerBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 16,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1E293B",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 2,
  },
  headerBadge: {
    backgroundColor: "#F3E8FF",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  headerBadgeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#7C3AED",
  },

  // Main Grid
  mainGrid: {
    flexDirection: "row",
    gap: 24,
  },

  // Classes Section
  classesSection: {
    flex: 1,
    minWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
  },
  classesGrid: {
    gap: 12,
  },
  classCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFC107",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 12,
  },
  classCardHighlight: {
    backgroundColor: "#F0FDF4",
    borderColor: "#86EFAC",
  },
  classCardIconContainer: {
    width: 70,
    height: 70,
    borderRadius: 14,
    backgroundColor: "#3B2E6E",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  classCardIconContainerToday: {
    backgroundColor: "#2E7D32",
  },
  classCardIconContainerTomorrow: {
    backgroundColor: "#1565C0",
  },
  classCardDanceIcon: {
    width: "100%",
    height: "100%",
  },
  classCardContent: {
    flex: 1,
  },
  className: {
    fontSize: 17,
    fontWeight: "900",
    color: "#1E293B",
    marginBottom: 2,
  },
  classTeacher: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 8,
  },
  classScheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  classDayBadge: {
    backgroundColor: "#3B2E6E",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  classDayBadgeToday: {
    backgroundColor: "#2E7D32",
  },
  classDayBadgeTomorrow: {
    backgroundColor: "#1565C0",
  },
  classDayText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
  },
  classDayTextLight: {
    color: "#fff",
  },
  classTime: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1E293B",
  },
  classDate: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E293B",
  },
  classCardAction: {
    padding: 8,
  },
  loadingBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 40,
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  loadingText: {
    fontSize: 14,
    color: "#94A3B8",
  },
  emptyBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 40,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
  },

  // Sidebar
  sidebarSection: {
    width: 300,
    gap: 16,
  },
  actionCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 12,
  },
  actionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1E293B",
  },
  actionDescription: {
    fontSize: 13,
    color: "#64748B",
    lineHeight: 18,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#25D366",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 4,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  helpCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  helpText: {
    flex: 1,
    fontSize: 12,
    color: "#64748B",
    lineHeight: 17,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  modalHeader: {
    alignItems: "center",
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#64748B",
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 14,
  },
  modalOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOptionContent: {
    flex: 1,
  },
  modalOptionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 2,
  },
  modalOptionDescription: {
    fontSize: 13,
    color: "#64748B",
  },
  modalCloseButton: {
    marginTop: 16,
    paddingVertical: 14,
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    alignItems: "center",
  },
  modalCloseText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#64748B",
  },
});
