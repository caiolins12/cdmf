import React from "react";
import { Pressable, PressableProps, Animated } from "react-native";
import { usePressAnimation } from "../hooks/usePressAnimation";

interface PressableWithAnimationProps extends Omit<PressableProps, "children"> {
  children: React.ReactNode;
}

export default function PressableWithAnimation({
  children,
  onPress,
  ...props
}: PressableWithAnimationProps) {
  const { pressAnim, onPressIn, onPressOut } = usePressAnimation();

  return (
    <Animated.View
      style={{
        transform: [{ scale: pressAnim }],
      }}
    >
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        {...props}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
