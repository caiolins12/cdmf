import React from "react";
import { Pressable, Text, View, StyleSheet, Animated } from "react-native";
import { colors } from "../theme/colors";
import { usePressAnimation } from "../hooks/usePressAnimation";

type Props = {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
};

export default function TileButton({ label, icon, onPress }: Props) {
  const { pressAnim, onPressIn, onPressOut } = usePressAnimation();

  return (
    <Animated.View
      style={{
        flex: 1,
        transform: [{ scale: pressAnim }],
      }}
    >
      <Pressable
        style={styles.box}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        <View style={styles.icon}>{icon}</View>
        <Text style={styles.label}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.grayCard,
    borderRadius: 22,
    paddingVertical: 20,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    height: 120,
  },
  icon: { opacity: 0.9, marginBottom: 8 },
  label: { 
    fontWeight: "900", 
    color: colors.text, 
    textAlign: "center", 
    fontSize: 13,
    minHeight: 32,
  },
});
