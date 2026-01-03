import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

interface CurtainTransitionProps {
  isActive: boolean;
  onComplete?: () => void;
  color?: string;
}

export default function CurtainTransition({
  isActive,
  onComplete,
  color = "#000000",
}: CurtainTransitionProps) {
  const heightAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isActive) {
      heightAnim.setValue(0);
      Animated.timing(heightAnim, {
        toValue: 1,
        duration: 0,
        useNativeDriver: false,
      }).start();

      const timer = setTimeout(() => {
        Animated.timing(heightAnim, {
          toValue: 0,
          duration: 800,
          useNativeDriver: false,
        }).start(() => {
          onComplete?.();
        });
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [isActive, heightAnim, onComplete]);

  const height = heightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["100%", "0%"],
  });

  if (!isActive) return null;

  return (
    <Animated.View
      style={[
        styles.curtain,
        {
          height,
          backgroundColor: color,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  curtain: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
  },
});
