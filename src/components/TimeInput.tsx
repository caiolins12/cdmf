import React, { useState, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"));

const ITEM_HEIGHT = 50;

export default function TimeInput({ label, value, onChange }: Props) {
  const [showPicker, setShowPicker] = useState(false);
  
  const [hour, minute] = value.split(":");
  const [tempHour, setTempHour] = useState(hour || "08");
  const [tempMinute, setTempMinute] = useState(minute || "00");
  
  const hourScrollRef = useRef<ScrollView>(null);
  const minuteScrollRef = useRef<ScrollView>(null);

  const handleOpen = () => {
    const parts = value.split(":");
    setTempHour(parts[0] || "08");
    setTempMinute(parts[1] || "00");
    setShowPicker(true);
    
    // Scroll para a posição correta depois de abrir
    setTimeout(() => {
      const hourIndex = HOURS.indexOf(parts[0] || "08");
      const minuteIndex = MINUTES.indexOf(parts[1] || "00");
      
      if (hourScrollRef.current && hourIndex >= 0) {
        hourScrollRef.current.scrollTo({ y: hourIndex * ITEM_HEIGHT, animated: false });
      }
      if (minuteScrollRef.current && minuteIndex >= 0) {
        minuteScrollRef.current.scrollTo({ y: minuteIndex * ITEM_HEIGHT, animated: false });
      }
    }, 100);
  };

  const handleConfirm = () => {
    onChange(`${tempHour}:${tempMinute}`);
    setShowPicker(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.inputBtn} onPress={handleOpen}>
        <Ionicons name="time-outline" size={18} color={colors.purple} />
        <Text style={styles.inputText}>{value || "00:00"}</Text>
      </Pressable>

      <Modal visible={showPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>Selecionar Horário</Text>

            <View style={styles.pickerContainer}>
              {/* Seletor de Hora */}
              <View style={styles.pickerColumn}>
                <Text style={styles.columnLabel}>Hora</Text>
                <View style={styles.scrollContainer}>
                  <ScrollView
                    ref={hourScrollRef}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    contentContainerStyle={styles.scrollContent}
                  >
                    {HOURS.map((h) => (
                      <Pressable
                        key={h}
                        style={[
                          styles.pickerItem,
                          tempHour === h && styles.pickerItemSelected,
                        ]}
                        onPress={() => setTempHour(h)}
                      >
                        <Text
                          style={[
                            styles.pickerItemText,
                            tempHour === h && styles.pickerItemTextSelected,
                          ]}
                        >
                          {h}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <Text style={styles.separator}>:</Text>

              {/* Seletor de Minuto */}
              <View style={styles.pickerColumn}>
                <Text style={styles.columnLabel}>Min</Text>
                <View style={styles.scrollContainer}>
                  <ScrollView
                    ref={minuteScrollRef}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="fast"
                    contentContainerStyle={styles.scrollContent}
                  >
                    {MINUTES.map((m) => (
                      <Pressable
                        key={m}
                        style={[
                          styles.pickerItem,
                          tempMinute === m && styles.pickerItemSelected,
                        ]}
                        onPress={() => setTempMinute(m)}
                      >
                        <Text
                          style={[
                            styles.pickerItemText,
                            tempMinute === m && styles.pickerItemTextSelected,
                          ]}
                        >
                          {m}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>
            </View>

            <View style={styles.previewContainer}>
              <Text style={styles.previewTime}>{tempHour}:{tempMinute}</Text>
            </View>

            <View style={styles.actions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowPicker(false)}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.confirmBtn} onPress={handleConfirm}>
                <Text style={styles.confirmBtnText}>Confirmar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    color: colors.muted,
    marginBottom: 6,
    fontWeight: "600",
  },
  inputBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.grayBorder,
    gap: 8,
  },
  inputText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  pickerModal: {
    backgroundColor: colors.bg,
    borderRadius: 20,
    padding: 24,
    width: "85%",
    maxWidth: 300,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
    marginBottom: 20,
  },
  pickerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  pickerColumn: {
    alignItems: "center",
    width: 80,
  },
  columnLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 8,
  },
  scrollContainer: {
    height: ITEM_HEIGHT * 3,
    overflow: "hidden",
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
  },
  scrollContent: {
    paddingVertical: ITEM_HEIGHT,
  },
  pickerItem: {
    height: ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  pickerItemSelected: {
    backgroundColor: colors.purple,
    borderRadius: 10,
    marginHorizontal: 4,
  },
  pickerItemText: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  pickerItemTextSelected: {
    color: "#fff",
  },
  separator: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
    marginHorizontal: 8,
    marginTop: 20,
  },
  previewContainer: {
    alignItems: "center",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  previewTime: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.purple,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.muted,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.purple,
    alignItems: "center",
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});
