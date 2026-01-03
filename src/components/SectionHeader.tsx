import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";

type Props = { title: string };

export default function SectionHeader({ title }: Props) {
  return (
    <View style={styles.bar}>
      <Text style={styles.text}>{title.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: "#E6E6E6",
    paddingVertical: 10,
    marginBottom: 0,
    alignItems: "center",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D0D0D0",
  },
  text: { fontWeight: "900", color: colors.text },
});
