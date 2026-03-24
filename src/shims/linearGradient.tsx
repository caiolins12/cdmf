import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

type Point = {
  x: number;
  y: number;
};

type LinearGradientProps = {
  colors: string[];
  start?: Point;
  end?: Point;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

function getAngle(start?: Point, end?: Point): number {
  if (!start || !end) {
    return 135;
  }

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const radians = Math.atan2(dy, dx);
  return (radians * 180) / Math.PI + 90;
}

export function LinearGradient({
  colors,
  start,
  end,
  style,
  children,
}: LinearGradientProps) {
  const angle = getAngle(start, end);
  const gradientStyle: ViewStyle = {
    backgroundColor: colors[0] || "transparent",
    ...(Array.isArray(colors) && colors.length > 1
      ? {
          backgroundImage: `linear-gradient(${angle}deg, ${colors.join(", ")})`,
        }
      : {}),
  } as ViewStyle;

  return <View style={[style, gradientStyle]}>{children}</View>;
}

export default LinearGradient;

