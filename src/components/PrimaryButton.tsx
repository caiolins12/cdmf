import React from "react";
import { Pressable, Text, Animated } from "react-native";
import { colors } from "../theme/colors";
import { usePressAnimation } from "../hooks/usePressAnimation";

type Props = {
  title: string;
  onPress: () => void;
};

export default function PrimaryButton({ title, onPress }: Props) {
  const { pressAnim, onPressIn, onPressOut } = usePressAnimation();

  return (
    <Animated.View
      style={{
        width: "100%",
        alignItems: "center",
        transform: [{ scale: pressAnim }],
      }}
    >
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={{
          backgroundColor: colors.purple,
          paddingVertical: 14,
          borderRadius: 999,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>
          {title}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
