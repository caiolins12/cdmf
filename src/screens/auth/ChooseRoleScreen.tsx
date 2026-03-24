import React from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import AuthLayout from "../../components/auth/AuthLayout";
import { PrimaryButton, OutlineButton } from "../../components/auth/AuthButtons";
import { ui } from "../../theme/ui";

export default function ChooseRoleScreen() {
  const navigation = useNavigation<any>();

  return (
    <AuthLayout
      noScroll
      logoContainerStyle={{ width: "82%", maxWidth: ui.layout.contentMaxWidth, alignItems: "center" }}
      logoStyle={{ width: 360, height: 220 }}
      logoOffsetY={80}
      logoGap={-8}
    >
      <View style={styles.bodyAligned}>
        <PrimaryButton title="SOU ALUNO" onPress={() => navigation.navigate("StudentEntry")} />
        <OutlineButton title="SOU PROFESSOR" onPress={() => navigation.navigate("TeacherLogin")} />
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  bodyAligned: { width: "100%", alignItems: "center", flex: 1, justifyContent: "flex-start", marginTop: 90, paddingBottom: 24 },
});
