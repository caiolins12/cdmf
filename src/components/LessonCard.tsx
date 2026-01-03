import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Image, Modal, Alert, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { useDesktop } from "../contexts/DesktopContext";

// Mapeamento de estilos de dança para ícones
// dance_ico1 = Forró
// dance_ico2 = Dança de Salão / Bolero
// dance_ico3 = Samba de Gafieira / Samba
// dance_ico4 = Zouk / Kizomba / Bachata

const DANCE_ICONS: Record<string, any> = {
  // Forró e variações
  "forró": require("../../assets/dance_ico1.png"),
  "forro": require("../../assets/dance_ico1.png"),
  "forró universitário": require("../../assets/dance_ico1.png"),
  "forró pé de serra": require("../../assets/dance_ico1.png"),
  "xote": require("../../assets/dance_ico1.png"),
  "baião": require("../../assets/dance_ico1.png"),
  
  // Dança de Salão e variações
  "dança de salão": require("../../assets/dance_ico2.png"),
  "danca de salao": require("../../assets/dance_ico2.png"),
  "bolero": require("../../assets/dance_ico2.png"),
  "valsa": require("../../assets/dance_ico2.png"),
  "tango": require("../../assets/dance_ico2.png"),
  "foxtrote": require("../../assets/dance_ico2.png"),
  "quickstep": require("../../assets/dance_ico2.png"),
  
  // Samba e variações
  "samba de gafieira": require("../../assets/dance_ico3.png"),
  "samba": require("../../assets/dance_ico3.png"),
  "gafieira": require("../../assets/dance_ico3.png"),
  "pagode": require("../../assets/dance_ico3.png"),
  "samba rock": require("../../assets/dance_ico3.png"),
  "samba no pé": require("../../assets/dance_ico3.png"),
  
  // Zouk, Kizomba e variações
  "zouk": require("../../assets/dance_ico4.png"),
  "zouk brasileiro": require("../../assets/dance_ico4.png"),
  "kizomba": require("../../assets/dance_ico4.png"),
  "bachata": require("../../assets/dance_ico4.png"),
  "lambada": require("../../assets/dance_ico4.png"),
  "lambazouk": require("../../assets/dance_ico4.png"),
  "salsa": require("../../assets/dance_ico4.png"),
  "merengue": require("../../assets/dance_ico4.png"),
  
  // Ícone padrão
  "default": require("../../assets/dance_ico1.png"),
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

type Props = {
  teacher: string;
  lesson: string;
  date: string;
  time: string;
  dayLabel?: string;
  onPress?: () => void;
  showContactOptions?: boolean;
};

export default function LessonCard({ teacher, lesson, date, time, dayLabel, onPress, showContactOptions = true }: Props) {
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const { isDesktopMode } = useDesktop();
  
  const isToday = dayLabel === "HOJE";
  const isTomorrow = dayLabel === "AMANHÃ";
  const danceIcon = getDanceIcon(lesson);

  // Funções de contato (preparadas para WhatsApp)
  const handleCantAttend = () => {
    setShowOptionsModal(false);
    // TODO: Redirecionar para WhatsApp com mensagem pronta
    // Linking.openURL(`whatsapp://send?phone=5511999999999&text=Olá, não vou poder comparecer à aula de ${lesson} no dia ${date} às ${time}h.`);
    Alert.alert(
      "Função em desenvolvimento",
      `Esta opção irá enviar uma mensagem via WhatsApp informando que você não poderá comparecer à aula de ${lesson}.`
    );
  };

  const handleTalkToTeacher = () => {
    setShowOptionsModal(false);
    // TODO: Redirecionar para WhatsApp com mensagem pronta
    // Linking.openURL(`whatsapp://send?phone=5511999999999&text=Olá Professor ${teacher}, gostaria de falar sobre a aula de ${lesson}.`);
    Alert.alert(
      "Função em desenvolvimento",
      `Esta opção irá abrir uma conversa no WhatsApp com o Professor ${teacher}.`
    );
  };

  const handleRequestLeave = () => {
    setShowOptionsModal(false);
    // TODO: Redirecionar para WhatsApp com mensagem pronta
    // Linking.openURL(`whatsapp://send?phone=5511999999999&text=Olá, gostaria de solicitar minha saída da turma de ${lesson}.`);
    Alert.alert(
      "Função em desenvolvimento",
      `Esta opção irá enviar uma solicitação de saída da turma de ${lesson} via WhatsApp.`
    );
  };

  const handleCardPress = () => {
    if (onPress) {
      onPress();
    } else if (showContactOptions) {
      setShowOptionsModal(true);
    }
  };
  
  return (
    <>
      <Pressable onPress={handleCardPress} style={[styles.card, isDesktopMode && styles.cardDesktop]}>
        {/* Ícone da dança */}
        <View style={[
          styles.iconContainer,
          isToday && styles.iconContainerToday,
          isTomorrow && styles.iconContainerTomorrow,
        ]}>
          <Image 
            source={danceIcon} 
            style={styles.danceIcon}
            resizeMode="cover"
          />
        </View>

        <View style={styles.infoContainer}>
          <Text style={styles.lessonName}>{lesson}</Text>
          <Text style={styles.teacherName}>Prof. {teacher}</Text>
          
          <View style={styles.scheduleRow}>
            <View style={[
              styles.dayBadge,
              isToday && styles.dayBadgeToday,
              isTomorrow && styles.dayBadgeTomorrow,
            ]}>
              <Text style={styles.dayBadgeText}>
                {dayLabel || "Próxima"}
              </Text>
            </View>
            <Text style={styles.timeText}>{time}h</Text>
            <Text style={styles.dateText}>• {date}</Text>
          </View>
        </View>

        {/* Indicador de que pode clicar */}
        {showContactOptions && (
          <Ionicons name="chevron-forward" size={20} color="rgba(0,0,0,0.3)" />
        )}
      </Pressable>

      {/* Modal de opções de contato */}
      <Modal visible={showOptionsModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowOptionsModal(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{lesson}</Text>
              <Text style={styles.modalSubtitle}>Prof. {teacher} • {dayLabel} às {time}h</Text>
            </View>

            <Pressable style={styles.optionButton} onPress={handleCantAttend}>
              <View style={[styles.optionIcon, { backgroundColor: "#FFA000" }]}>
                <Ionicons name="close-circle" size={22} color="#fff" />
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionTitle}>Não vou poder comparecer</Text>
                <Text style={styles.optionDescription}>Avisar sobre ausência na aula</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </Pressable>

            <Pressable style={styles.optionButton} onPress={handleTalkToTeacher}>
              <View style={[styles.optionIcon, { backgroundColor: colors.purple }]}>
                <Ionicons name="chatbubble" size={20} color="#fff" />
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionTitle}>Falar com professor</Text>
                <Text style={styles.optionDescription}>Abrir conversa no WhatsApp</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </Pressable>

            <Pressable style={styles.optionButton} onPress={handleRequestLeave}>
              <View style={[styles.optionIcon, { backgroundColor: "#C62828" }]}>
                <Ionicons name="exit" size={20} color="#fff" />
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionTitle}>Solicitar saída da turma</Text>
                <Text style={styles.optionDescription}>Enviar solicitação de desligamento</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </Pressable>

            <Pressable style={styles.closeButton} onPress={() => setShowOptionsModal(false)}>
              <Text style={styles.closeButtonText}>Fechar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: "#FFC107",
    borderRadius: 14,
    padding: 12,
    gap: 12,
    alignItems: "center",
  },
  cardDesktop: {
    maxWidth: 420,
    minWidth: 320,
  },
  iconContainer: {
    width: 70,
    height: 70,
    borderRadius: 14,
    backgroundColor: "#3B2E6E",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  iconContainerToday: {
    backgroundColor: "#2E7D32",
  },
  iconContainerTomorrow: {
    backgroundColor: "#1565C0",
  },
  danceIcon: {
    width: "100%",
    height: "100%",
  },
  infoContainer: {
    flex: 1,
  },
  lessonName: {
    fontSize: 17,
    fontWeight: "900",
    color: colors.text,
    marginBottom: 2,
  },
  teacherName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    opacity: 0.75,
    marginBottom: 8,
  },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dayBadge: {
    backgroundColor: "#3B2E6E",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dayBadgeToday: {
    backgroundColor: "#2E7D32",
  },
  dayBadgeTomorrow: {
    backgroundColor: "#1565C0",
  },
  dayBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  timeText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  dateText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    opacity: 0.7,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
  },
  modalHeader: {
    alignItems: "center",
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.text,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: "600",
  },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 14,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: 13,
    color: colors.muted,
  },
  closeButton: {
    marginTop: 16,
    paddingVertical: 14,
    backgroundColor: "#E0E0E0",
    borderRadius: 12,
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#555",
  },
});
