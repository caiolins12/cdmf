import React, { useRef } from "react";
import { Pressable, Text, StyleSheet, Animated, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = { onPress: () => void };

export default function GoogleButton({ onPress }: Props) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ scale: scaleAnim }] },
      ]}
    >
      <Pressable
        style={({ pressed }) => [
          styles.btn,
          pressed && styles.btnPressed,
        ]}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        {/* Google Icon Container */}
        <View style={styles.iconContainer}>
          <Ionicons name="logo-google" size={22} color="#EA4335" />
        </View>
        
        {/* Divider */}
        <View style={styles.divider} />
        
        {/* Text */}
        <Text style={styles.text}>Continuar com Google</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "82%",
    maxWidth: 320,
    marginTop: 16,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    paddingVertical: 14,
    paddingHorizontal: 16,
    // Sombra sutil
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  btnPressed: {
    backgroundColor: "#F8F8F8",
    borderColor: "#BDBDBD",
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#F5F5F5",
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: "#E8E8E8",
    marginHorizontal: 14,
  },
  text: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#333333",
    letterSpacing: 0.2,
  },
});
