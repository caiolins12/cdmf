import React, { useEffect, useState, useRef, useCallback, useMemo, memo } from "react";
import { View, StyleSheet, ScrollView, Text, Dimensions, FlatList, Pressable, Platform, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import CdmfHeader from "../../components/CdmfHeader";
import SectionHeader from "../../components/SectionHeader";
import LessonCard from "../../components/LessonCard";
import OnboardingSurveyModal from "../../components/OnboardingSurveyModal";
import { colors } from "../../theme/colors";
import { useAuth, Class } from "../../contexts/AuthContext";
import { useDesktop } from "../../contexts/DesktopContext";
import { useTheme } from "../../contexts/ThemeContext";
import { showMessage } from "../../utils/alert";
import { useStudentDesktopNav } from "../../components/desktop/StudentDesktopLayout";
import { Linking } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_MARGIN = 24;
const AUTO_SCROLL_INTERVAL = 8000; // 8 segundos
const isWeb = Platform.OS === "web";

// Avisos do carrossel (constante fora do componente)
const ANNOUNCEMENTS = [
  {
    id: "1",
    title: "Bem-vindo ao CDMF!",
    message: "Confira sua agenda de aulas e não perca nenhuma.",
    icon: "megaphone",
    bgColor: "#5C2D91",
  },
  {
    id: "2",
    title: "Recesso de Final de Ano",
    message: "Não haverá aulas entre 23/12 e 02/01. Boas festas!",
    icon: "calendar",
    bgColor: "#2E7D32",
  },
  {
    id: "3",
    title: "Novos Horários em 2026",
    message: "Novos horários disponíveis a partir de janeiro.",
    icon: "time",
    bgColor: "#1565C0",
  },
  {
    id: "4",
    title: "Evento Especial",
    message: "Baile de Forró dia 15/01. Inscrições abertas!",
    icon: "musical-notes",
    bgColor: "#C62828",
  },
] as const;

const DAYS_OF_WEEK = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;
const DAYS_OF_WEEK_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

// Componente de aviso memoizado
const AnnouncementCard = memo(function AnnouncementCard({ 
  item 
}: { 
  item: typeof ANNOUNCEMENTS[number] 
}) {
  return (
    <View style={styles.announcementCardWrapper}>
      <View style={[styles.announcementCard, { backgroundColor: item.bgColor }]}>
        <View style={styles.announcementIcon}>
          <Ionicons name={item.icon as any} size={32} color="#fff" />
        </View>
        <View style={styles.announcementTextContainer}>
          <Text style={styles.announcementTitle}>{item.title}</Text>
          <Text style={styles.announcementMessage}>{item.message}</Text>
        </View>
      </View>
    </View>
  );
});

// Componente de aula memoizado
const ClassCard = memo(function ClassCard({ 
  classItem, 
  getNextClassInfo 
}: { 
  classItem: Class;
  getNextClassInfo: (c: Class) => { day: string; dayShort: string; date: string; time: string; daysUntil: number } | null;
}) {
  const nextClass = getNextClassInfo(classItem);
  return (
    <View style={styles.classCardWrapper}>
      <LessonCard
        teacher={classItem.teacherName || "Sem professor"}
        lesson={classItem.name}
        date={nextClass?.date || ""}
        time={nextClass?.time || ""}
        dayLabel={nextClass?.daysUntil === 0 ? "HOJE" : nextClass?.daysUntil === 1 ? "AMANHÃ" : nextClass?.day}
      />
    </View>
  );
});

// Dot indicator memoizado
const DotIndicator = memo(function DotIndicator({ 
  index, 
  isActive, 
  onPress 
}: { 
  index: number; 
  isActive: boolean; 
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
    >
      <View style={[styles.dot, isActive && styles.dotActive]} />
    </Pressable>
  );
});

function StudentHomeScreen() {
  const { profile, user, fetchClasses, updateProfile, refreshProfile } = useAuth();
  const { isDesktopMode } = useDesktop();
  const { colors: themeColors, isDark } = useTheme();
  const desktopNav = useStudentDesktopNav();
  const [myClasses, setMyClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);

  // Link do WhatsApp (trocar pelo real)
  const whatsappLink = "https://wa.me/5500000000000";
  
  // Carrossel state
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Pega o primeiro nome do usuário logado - memoizado
  const studentName = useMemo(() => {
    if (profile?.name) {
      return profile.name.split(" ")[0];
    }
    if (user?.displayName) {
      return user.displayName.split(" ")[0];
    }
    return "Aluno";
  }, [profile?.name, user?.displayName]);

  // Verifica se precisa de onboarding
  const needsOnboarding = useCallback(() => {
    if (!profile) return false;
    if (profile.role !== "student") return false;
    if (!profile.phone || !profile.phoneVerified) {
      return true;
    }
    return false;
  }, [profile]);

  // Verifica imediatamente quando o perfil carrega
  useEffect(() => {
    if (profile && needsOnboarding()) {
      setShowOnboarding(true);
    }
  }, [profile, needsOnboarding]);

  // Verifica sempre que a tela ganha foco
  useFocusEffect(
    useCallback(() => {
      refreshProfile?.();
      if (needsOnboarding()) {
        setShowOnboarding(true);
      }
    }, [needsOnboarding, refreshProfile])
  );

  // Handler para completar onboarding
  const handleOnboardingComplete = useCallback(async (data: {
    phone: string;
    phoneVerified: boolean;
    birthDate?: string;
    age?: number;
    gender?: string;
    dancePreference?: string;
  }) => {
    if (!profile?.uid) return;

    try {
      await updateProfile(profile.uid, {
        ...data,
        onboardingCompleted: true,
      });
      
      await refreshProfile?.();
      setShowOnboarding(false);
      showMessage("Tudo pronto! 🎉", "Seus dados foram salvos. Aproveite suas aulas!");
    } catch (error) {
      throw error;
    }
  }, [profile?.uid, updateProfile, refreshProfile]);

  // Carrega as turmas do aluno
  const loadClasses = useCallback(async () => {
    if (!profile?.uid) {
      setLoading(false);
      return;
    }
    
    try {
      const allClasses = await fetchClasses();
      const enrolledClasses = allClasses.filter(c => 
        c.active && c.studentIds?.includes(profile.uid)
      );
      setMyClasses(enrolledClasses);
    } catch (e) {
      console.error("Erro ao carregar turmas:", e);
    } finally {
      setLoading(false);
    }
  }, [profile?.uid, fetchClasses]);

  useFocusEffect(
    useCallback(() => {
      loadClasses();
    }, [loadClasses])
  );

  // Função para iniciar o timer de auto-scroll
  const startAutoScroll = useCallback(() => {
    if (autoScrollTimer.current) {
      clearInterval(autoScrollTimer.current);
    }
    
    autoScrollTimer.current = setInterval(() => {
      setCurrentIndex((prev) => {
        const nextIndex = (prev + 1) % ANNOUNCEMENTS.length;
        flatListRef.current?.scrollToIndex({
          index: nextIndex,
          animated: true,
        });
        return nextIndex;
      });
    }, AUTO_SCROLL_INTERVAL);
  }, []);

  // Auto scroll do carrossel
  useEffect(() => {
    startAutoScroll();
    return () => {
      if (autoScrollTimer.current) {
        clearInterval(autoScrollTimer.current);
      }
    };
  }, [startAutoScroll]);

  // Quando o usuário interage manualmente, reinicia o timer
  const handleScrollEnd = useCallback((event: any) => {
    const contentOffset = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffset / SCREEN_WIDTH);
    if (index >= 0 && index < ANNOUNCEMENTS.length) {
      setCurrentIndex(index);
      startAutoScroll();
    }
  }, [startAutoScroll]);

  // Navegar para um aviso específico ao clicar no dot
  const goToSlide = useCallback((index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
    setCurrentIndex(index);
    startAutoScroll();
  }, [startAutoScroll]);

  // Renderiza cada aviso - memoizado
  const renderAnnouncement = useCallback(({ item }: { item: typeof ANNOUNCEMENTS[number] }) => (
    <AnnouncementCard item={item} />
  ), []);

  // Key extractor memoizado
  const keyExtractor = useCallback((item: typeof ANNOUNCEMENTS[number]) => item.id, []);

  // Get item layout para performance do FlatList
  const getItemLayout = useCallback((_: any, index: number) => ({
    length: SCREEN_WIDTH,
    offset: SCREEN_WIDTH * index,
    index,
  }), []);

  // Formata a próxima aula - memoizado
  const getNextClassInfo = useCallback((classItem: Class) => {
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
    
    if (!nextSchedule) return null;
    
    const nextDate = new Date(now);
    nextDate.setDate(now.getDate() + daysUntilClass);
    
    return {
      day: DAYS_OF_WEEK[nextSchedule.dayOfWeek],
      dayShort: DAYS_OF_WEEK_SHORT[nextSchedule.dayOfWeek],
      date: nextDate.toLocaleDateString("pt-BR"),
      time: nextSchedule.startTime,
      daysUntil: daysUntilClass,
    };
  }, []);

  // Onboarding initial data memoizado
  const onboardingInitialData = useMemo(() => ({
    phone: profile?.phone,
    birthDate: profile?.birthDate,
    gender: profile?.gender,
    dancePreference: profile?.dancePreference,
    phoneVerified: profile?.phoneVerified,
  }), [profile?.phone, profile?.birthDate, profile?.gender, profile?.dancePreference, profile?.phoneVerified]);

  return (
    <View style={[styles.screen, isDesktopMode && desktopStyles.screen, isDesktopMode && { backgroundColor: themeColors.bg }]}>
      {!isDesktopMode && <CdmfHeader title={`Olá, ${studentName}`} />}

      {/* Modal de Onboarding - Obrigatório */}
      <OnboardingSurveyModal
        visible={showOnboarding}
        onComplete={handleOnboardingComplete}
        initialData={onboardingInitialData}
      />

      <ScrollView 
        contentContainerStyle={[styles.content, isDesktopMode && desktopStyles.content]} 
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={!isWeb}
        scrollEventThrottle={16}
        bounces={!isWeb}
        overScrollMode="never"
      >
        {/* Carrossel de Avisos */}
        {!isDesktopMode && <SectionHeader title="Avisos" />}
        
        {/* Carrossel - Mobile */}
        {!isDesktopMode && (
          <View style={styles.carouselContainer}>
            <FlatList
              ref={flatListRef}
              data={ANNOUNCEMENTS}
              renderItem={renderAnnouncement}
              keyExtractor={keyExtractor}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handleScrollEnd}
              decelerationRate="fast"
              snapToInterval={SCREEN_WIDTH}
              snapToAlignment="start"
              getItemLayout={getItemLayout}
              removeClippedSubviews={!isWeb}
              maxToRenderPerBatch={2}
              windowSize={3}
              initialNumToRender={2}
              updateCellsBatchingPeriod={50}
            />
            
            <View style={styles.dotsContainer}>
              {ANNOUNCEMENTS.map((_, index) => (
                <DotIndicator 
                  key={index}
                  index={index}
                  isActive={index === currentIndex}
                  onPress={() => goToSlide(index)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Desktop Dashboard Layout */}
        {isDesktopMode && (
          <View style={[desktopStyles.dashboardContainer, { backgroundColor: themeColors.bg }]}>
            {/* Welcome Banner */}
            <View style={[desktopStyles.welcomeBanner, isDark && { backgroundColor: '#581C87' }]}>
              <View style={desktopStyles.welcomeContent}>
                <Text style={desktopStyles.welcomeGreeting}>
                  👋 Olá, {studentName}!
                </Text>
                <Text style={desktopStyles.welcomeMessage}>
                  Bem-vindo ao seu painel. Confira suas aulas e avisos importantes.
                </Text>
              </View>
              <View style={desktopStyles.welcomeDecoration}>
                <Ionicons name="sparkles" size={48} color="rgba(255,255,255,0.3)" />
              </View>
            </View>

            {/* Main Grid: Aulas + Avisos lado a lado */}
            <View style={desktopStyles.mainGrid}>
              {/* Coluna Esquerda: Próximas Aulas */}
              <View style={[desktopStyles.classesColumn, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
                <View style={desktopStyles.sectionHeaderRow}>
                  <View style={[desktopStyles.sectionIconBox, { backgroundColor: themeColors.purpleLight }]}>
                    <Ionicons name="calendar" size={18} color={themeColors.purple} />
                  </View>
                  <Text style={[desktopStyles.sectionTitle, { color: themeColors.text }]}>Próximas Aulas</Text>
                  <Text style={[desktopStyles.sectionBadge, { backgroundColor: themeColors.purpleLight, color: themeColors.purple }]}>{myClasses.length}</Text>
                </View>

                <View style={desktopStyles.classesContainer}>
                  {loading ? (
                    <View style={[desktopStyles.loadingBox, { backgroundColor: themeColors.bgSecondary }]}>
                      <ActivityIndicator size="small" color={themeColors.purple} />
                      <Text style={[desktopStyles.loadingText, { color: themeColors.textMuted }]}>Carregando...</Text>
                    </View>
                  ) : myClasses.length === 0 ? (
                    <View style={desktopStyles.emptyClassesBox}>
                      <Ionicons name="school-outline" size={40} color={themeColors.textMuted} />
                      <Text style={[desktopStyles.emptyTitle, { color: themeColors.text }]}>Nenhuma turma</Text>
                      <Text style={[desktopStyles.emptySubtitle, { color: themeColors.textMuted }]}>
                        Entre em contato para se matricular
                      </Text>
                    </View>
                  ) : (
                    myClasses.map((classItem, index) => {
                      const nextClass = getNextClassInfo(classItem);
                      const isToday = nextClass?.daysUntil === 0;
                      const isTomorrow = nextClass?.daysUntil === 1;
                      return (
                        <View 
                          key={classItem.id} 
                          style={[
                            desktopStyles.classCard,
                            { 
                              backgroundColor: themeColors.bgSecondary, 
                              borderWidth: 1,
                              borderColor: themeColors.border,
                            },
                            isToday && [desktopStyles.classCardToday, isDark && { backgroundColor: '#14532D', borderColor: '#22C55E' }],
                            isTomorrow && [desktopStyles.classDayBadgeTomorrow, isDark && { backgroundColor: '#1E3A5F', borderColor: '#3B82F6' }]
                          ]}
                        >
                          <View style={[
                            desktopStyles.classIndicator,
                            { backgroundColor: isDark ? '#64748B' : '#CBD5E1' },
                            isToday && desktopStyles.classIndicatorToday,
                            isTomorrow && desktopStyles.classIndicatorTomorrow
                          ]} />
                          <View style={desktopStyles.classInfo}>
                            <Text style={[desktopStyles.className, { color: themeColors.text }]}>{classItem.name}</Text>
                            <Text style={[desktopStyles.classTeacher, { color: themeColors.textMuted }]}>
                              Prof. {classItem.teacherName || "A definir"}
                            </Text>
                          </View>
                          <View style={desktopStyles.classSchedule}>
                            <View style={[
                              desktopStyles.classDayBadge,
                              { backgroundColor: themeColors.bgSecondary },
                              isToday && desktopStyles.classDayBadgeToday,
                              isTomorrow && desktopStyles.classDayBadgeTomorrow
                            ]}>
                              <Text style={[
                                desktopStyles.classDayText,
                                { color: themeColors.textSecondary },
                                (isToday || isTomorrow) && desktopStyles.classDayTextHighlight
                              ]}>
                                {isToday ? "HOJE" : isTomorrow ? "AMANHÃ" : nextClass?.dayShort}
                              </Text>
                            </View>
                            <Text style={[desktopStyles.classTime, { color: themeColors.textSecondary }]}>{nextClass?.time}h</Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              </View>

              {/* Coluna Direita: Avisos */}
              <View style={[desktopStyles.announcementsColumn, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}>
                <View style={desktopStyles.sectionHeaderRow}>
                  <View style={[desktopStyles.sectionIconBox, { backgroundColor: isDark ? "#713F12" : "#FEF3C7" }]}>
                    <Ionicons name="megaphone" size={18} color="#D97706" />
                  </View>
                  <Text style={[desktopStyles.sectionTitle, { color: themeColors.text }]}>Avisos</Text>
                  <Text style={[desktopStyles.sectionBadge, { backgroundColor: isDark ? "#713F12" : "#FEF3C7", color: "#D97706" }]}>
                    {ANNOUNCEMENTS.length}
                  </Text>
                </View>

                <View style={desktopStyles.announcementsList}>
                  {ANNOUNCEMENTS.map((item, index) => (
                    <View 
                      key={item.id} 
                      style={[
                        desktopStyles.announcementCard,
                        { 
                          backgroundColor: themeColors.bgSecondary, 
                          borderWidth: 1,
                          borderColor: themeColors.border,
                        }
                      ]}
                    >
                      <View style={[desktopStyles.announcementIconBox, { backgroundColor: item.bgColor }]}>
                        <Ionicons name={item.icon as any} size={18} color="#fff" />
                      </View>
                      <View style={desktopStyles.announcementContent}>
                        <Text style={[desktopStyles.announcementTitle, { color: themeColors.text }]}>{item.title}</Text>
                        <Text style={[desktopStyles.announcementMessage, { color: themeColors.textMuted }]} numberOfLines={2}>
                          {item.message}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {/* Quick Actions */}
            <View style={desktopStyles.quickActionsSection}>
              <Text style={[desktopStyles.quickActionsTitle, { color: themeColors.text }]}>Ações Rápidas</Text>
              <View style={desktopStyles.quickActionsGrid}>
                <Pressable 
                  style={[desktopStyles.quickActionCard, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}
                  onPress={() => Linking.openURL(whatsappLink)}
                >
                  <View style={[desktopStyles.quickActionIcon, { backgroundColor: isDark ? "#14532D" : "#DCFCE7" }]}>
                    <Ionicons name="logo-whatsapp" size={22} color="#16A34A" />
                  </View>
                  <Text style={[desktopStyles.quickActionLabel, { color: themeColors.text }]}>Falar com a Escola</Text>
                </Pressable>
                <Pressable 
                  style={[desktopStyles.quickActionCard, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}
                  onPress={() => desktopNav?.setActiveTab("pagamentos")}
                >
                  <View style={[desktopStyles.quickActionIcon, { backgroundColor: isDark ? "#7F1D1D" : "#FEE2E2" }]}>
                    <Ionicons name="card-outline" size={22} color="#DC2626" />
                  </View>
                  <Text style={[desktopStyles.quickActionLabel, { color: themeColors.text }]}>Ver Pagamentos</Text>
                </Pressable>
                <Pressable 
                  style={[desktopStyles.quickActionCard, { backgroundColor: themeColors.bgCard, borderColor: themeColors.border }]}
                  onPress={() => desktopNav?.setActiveTab("conta")}
                >
                  <View style={[desktopStyles.quickActionIcon, { backgroundColor: isDark ? "#1E3A5F" : "#E0E7FF" }]}>
                    <Ionicons name="person-outline" size={22} color="#4F46E5" />
                  </View>
                  <Text style={[desktopStyles.quickActionLabel, { color: themeColors.text }]}>Meus Dados</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Mobile Layout - Suas Aulas */}
        {!isDesktopMode && <SectionHeader title="Suas Aulas" />}

        {!isDesktopMode && (
          <View style={styles.block}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Carregando aulas...</Text>
              </View>
            ) : myClasses.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="calendar-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>Você não está matriculado em nenhuma turma</Text>
                <Text style={styles.emptySubtext}>
                  Entre em contato com a administração para se matricular
                </Text>
              </View>
            ) : (
              myClasses.map((classItem) => (
                <ClassCard 
                  key={classItem.id} 
                  classItem={classItem} 
                  getNextClassInfo={getNextClassInfo}
                />
              ))
            )}
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

export default memo(StudentHomeScreen);

const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: colors.bg,
    ...(isWeb && {
      overflow: 'hidden' as any,
    }),
  },
  content: { 
    paddingBottom: 18,
  },
  block: { padding: 12, paddingTop: 14 },
  
  // Carrossel
  carouselContainer: {
    marginTop: 8,
  },
  announcementCardWrapper: {
    width: SCREEN_WIDTH,
    paddingHorizontal: CARD_MARGIN,
  },
  announcementCard: {
    width: "100%",
    borderRadius: 16,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  announcementIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  announcementTextContainer: {
    flex: 1,
  },
  announcementTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 4,
  },
  announcementMessage: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
    lineHeight: 20,
  },
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 14,
    marginBottom: 8,
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#D0D0D0",
  },
  dotActive: {
    backgroundColor: colors.purple,
    transform: [{ scale: 1.2 }],
  },
  
  // Class card
  classCardWrapper: {
    marginBottom: 10,
  },
  
  // Loading e Empty
  loadingContainer: {
    padding: 40,
    alignItems: "center",
  },
  loadingText: {
    color: colors.muted,
    fontWeight: "600",
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    marginTop: 16,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    marginTop: 8,
  },
  bottomSpacer: {
    height: 14,
  },
});

// Desktop styles
const desktopStyles = StyleSheet.create({
  screen: {
    backgroundColor: "#F8FAFC",
  },
  content: {
    padding: 32,
    paddingTop: 24,
  },

  // Dashboard Container
  dashboardContainer: {
    maxWidth: 1100,
  },

  // Welcome Banner
  welcomeBanner: {
    backgroundColor: "#7C3AED",
    borderRadius: 16,
    padding: 24,
    marginBottom: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    overflow: "hidden",
  },
  welcomeContent: {
    flex: 1,
  },
  welcomeGreeting: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 6,
  },
  welcomeMessage: {
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    lineHeight: 20,
  },
  welcomeDecoration: {
    marginLeft: 20,
  },

  // Main Grid
  mainGrid: {
    flexDirection: "row",
    gap: 24,
    marginBottom: 28,
  },

  // Classes Column
  classesColumn: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    minWidth: 320,
    maxWidth: 480,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 10,
  },
  sectionIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
    flex: 1,
  },
  sectionBadge: {
    backgroundColor: "#F3E8FF",
    color: "#7C3AED",
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  classesContainer: {
    gap: 10,
  },
  classCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    gap: 12,
  },
  classCardFirst: {
    backgroundColor: "#FEF9C3",
    borderWidth: 1,
    borderColor: "#FDE047",
  },
  classCardToday: {
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#86EFAC",
  },
  classIndicator: {
    width: 4,
    height: 40,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
  },
  classIndicatorToday: {
    backgroundColor: "#22C55E",
  },
  classIndicatorTomorrow: {
    backgroundColor: "#3B82F6",
  },
  classInfo: {
    flex: 1,
  },
  className: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 2,
  },
  classTeacher: {
    fontSize: 13,
    color: "#64748B",
  },
  classSchedule: {
    alignItems: "flex-end",
    gap: 4,
  },
  classDayBadge: {
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  classDayBadgeToday: {
    backgroundColor: "#22C55E",
  },
  classDayBadgeTomorrow: {
    backgroundColor: "#3B82F6",
  },
  classDayText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
  },
  classDayTextHighlight: {
    color: "#fff",
  },
  classTime: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
  },
  loadingBox: {
    padding: 32,
    alignItems: "center",
  },
  loadingText: {
    fontSize: 14,
    color: "#94A3B8",
  },
  emptyClassesBox: {
    padding: 32,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#64748B",
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
  },

  // Announcements Column
  announcementsColumn: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    minWidth: 320,
    maxWidth: 480,
  },
  announcementsList: {
    gap: 10,
  },
  announcementCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    gap: 12,
  },
  announcementCardFirst: {
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  announcementIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  announcementContent: {
    flex: 1,
  },
  announcementTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 2,
  },
  announcementMessage: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 16,
  },

  // Quick Actions
  quickActionsSection: {
    marginBottom: 20,
  },
  quickActionsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 14,
  },
  quickActionsGrid: {
    flexDirection: "row",
    gap: 14,
  },
  quickActionCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 10,
    width: 130,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
    textAlign: "center",
  },
});
