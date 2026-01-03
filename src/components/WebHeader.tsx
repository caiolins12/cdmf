import React from "react";
import { View, Text, StyleSheet, Pressable, StatusBar, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { colors } from "../theme/colors";

type Props = {
  title?: string;
  subtitle?: string;
  showBackButton?: boolean;
  onBackPress?: () => void;
  rightText?: string;
  onRightPress?: () => void;
  rightIcon?: keyof typeof Ionicons.glyphMap;
};

export default function WebHeader({ 
  title, 
  subtitle,
  showBackButton = false,
  onBackPress,
  rightText, 
  onRightPress,
  rightIcon,
}: Props) {
  const navigation = useNavigation();

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
    } else if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={colors.black} />

      <View style={styles.container}>
        <View style={styles.row}>
          {/* Botão Voltar */}
          {showBackButton ? (
            <Pressable 
              onPress={handleBack} 
              style={styles.backBtn}
              accessibilityLabel="Voltar"
              accessibilityRole="button"
            >
              <Ionicons name="arrow-back" size={24} color="white" />
              {Platform.OS === "web" && (
                <Text style={styles.backText}>Voltar</Text>
              )}
            </Pressable>
          ) : (
            <View style={{ width: 48 }} />
          )}

          {/* Título Central */}
          <View style={styles.titleContainer}>
            <Text style={styles.title} numberOfLines={1}>{title ?? ""}</Text>
            {subtitle && (
              <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
            )}
          </View>

          {/* Botão Direito */}
          {(rightText || rightIcon) && onRightPress ? (
            <Pressable 
              onPress={onRightPress} 
              style={styles.rightBtn}
              accessibilityRole="button"
            >
              {rightIcon && <Ionicons name={rightIcon} size={22} color="white" />}
              {rightText && <Text style={styles.rightText}>{rightText}</Text>}
            </Pressable>
          ) : (
            <View style={{ width: 48 }} />
          )}
        </View>
      </View>

      <View style={styles.line} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.black,
  },
  container: {
    backgroundColor: colors.black,
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 40,
  },
  backBtn: { 
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8, 
    paddingVertical: 6,
    gap: 4,
    minWidth: 48,
  },
  backText: {
    color: "white",
    fontWeight: "600",
    fontSize: 14,
  },
  titleContainer: {
    flex: 1,
    alignItems: "center",
  },
  title: {
    color: "white",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  rightBtn: { 
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8, 
    paddingVertical: 6,
    gap: 4,
    minWidth: 48,
    justifyContent: "flex-end",
  },
  rightText: { 
    color: "white", 
    fontWeight: "700",
    fontSize: 14,
  },
  line: { 
    height: 4, 
    backgroundColor: colors.purpleLine,
  },
});

