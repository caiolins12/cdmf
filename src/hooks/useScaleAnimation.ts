import { useRef, useEffect } from "react";
import { Animated } from "react-native";

export const useScaleAnimation = () => {
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  return scaleAnim;
};
