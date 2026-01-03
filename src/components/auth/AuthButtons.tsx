import React from "react";
import { Pressable, Text, StyleSheet, ViewStyle, Animated } from "react-native";
import { colors } from "../../theme/colors";
import { usePressAnimation } from "../../hooks/usePressAnimation";
import { ui } from "../../theme/ui";

type BtnProps = {
  title: string;
  onPress: () => void;
  style?: ViewStyle;
  disabled?: boolean;
};

export function PrimaryButton({ title, onPress, style, disabled }: BtnProps) {
  const { pressAnim, onPressIn, onPressOut } = usePressAnimation();

  return (
    <Animated.View
      style={{
        width: "82%",
        maxWidth: 360,
        alignItems: "center",
        transform: [{ scale: pressAnim }],
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Pressable
        style={[styles.primary, style]}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
      >
        <Text style={styles.primaryText}>{title}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function OutlineButton({ title, onPress, style, disabled }: BtnProps) {
  const { pressAnim, onPressIn, onPressOut } = usePressAnimation();

  return (
    <Animated.View
      style={{
        width: "82%",
        maxWidth: 360,
        alignItems: "center",
        transform: [{ scale: pressAnim }],
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Pressable
        style={[styles.outline, style]}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
      >
        <Text style={styles.outlineText}>{title}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  primary: {
    width: "82%",
    maxWidth: ui.layout.contentMaxWidth,
    height: 56,
    borderRadius: 999,
    backgroundColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
    marginTop: ui.auth.buttonTopMargin,
  },
  primaryText: { color: "white", fontWeight: "900", fontSize: 18, letterSpacing: 0.5 },

  outline: {
    width: "82%",
    maxWidth: ui.layout.contentMaxWidth,
    height: 56,
    borderRadius: 999,
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: colors.purple,
    alignItems: "center",
    justifyContent: "center",
    marginTop: ui.auth.buttonTopMargin,
  },
  outlineText: { color: colors.purple, fontWeight: "900", fontSize: 18, letterSpacing: 0.5 },
});
