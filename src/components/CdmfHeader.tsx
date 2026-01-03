import React from "react";
import { StatusBar, Platform, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

type Props = {
  title?: string;
  rightText?: string;
  onRightPress?: () => void;
};

export default function CdmfHeader({ title, rightText, onRightPress }: Props) {
  const insets = useSafeAreaInsets();
  
  // Na web, não precisa de StatusBar
  if (Platform.OS === "web") {
    return null;
  }
  
  // No mobile, apenas configura a StatusBar com padding seguro
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
  },
});
