import { useRef, useEffect } from "react";
import { Animated, Platform } from "react-native";

export const useScaleAnimation = () => {
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [scaleAnim]);

  return scaleAnim;
};
