import { useRef } from "react";
import { Animated, Platform } from "react-native";

export const usePressAnimation = () => {
  const pressAnim = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(pressAnim, {
      toValue: 0.95,
      useNativeDriver: Platform.OS !== "web",
      speed: 20,
      bounciness: 10,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(pressAnim, {
      toValue: 1,
      useNativeDriver: Platform.OS !== "web",
      speed: 20,
      bounciness: 10,
    }).start();
  };

  return {
    pressAnim,
    onPressIn,
    onPressOut,
  };
};
