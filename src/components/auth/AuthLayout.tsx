import React, { memo, useMemo } from "react";
import { SafeAreaView, ScrollView, View, Image, StyleSheet, ImageStyle, ViewStyle, KeyboardAvoidingView, Platform } from "react-native";
import { ui } from "../../theme/ui";

const isWeb = Platform.OS === "web";

type Props = {
  children: React.ReactNode;
  /** When true the layout will not use a ScrollView and will place content starting from the top */
  noScroll?: boolean;
  /** Optional style override for the logo image */
  logoStyle?: ImageStyle;
  /** Optional custom container style for the logo block */
  logoContainerStyle?: ViewStyle;
  /** Extra spacing below the logo (helps control logo→buttons distance consistently) */
  logoGap?: number;
  /** Moves the whole logo block up/down. Positive pushes it down, negative pulls it up. */
  logoOffsetY?: number;
  /** Optional custom container style for the content block */
  contentStyle?: ViewStyle;
};

// Logo image source memoizado para evitar re-require
const logoSource = require("../../../assets/cdmf-logo.png");

function AuthLayout({
  children,
  noScroll = false,
  logoStyle,
  logoContainerStyle,
  logoGap = ui.auth.logoGap,
  logoOffsetY = ui.auth.logoOffsetY,
  contentStyle,
}: Props) {
  // Memoiza estilos computados
  const mergedLogo = useMemo(() => [styles.logo, logoStyle], [logoStyle]);
  const logoBlockStyle = useMemo(
    () => [styles.logoBlock, logoContainerStyle, { transform: [{ translateY: logoOffsetY }] }],
    [logoContainerStyle, logoOffsetY]
  );
  const contentMergedStyle = useMemo(() => [styles.content, contentStyle], [contentStyle]);
  const containerStyle = useMemo(
    () => (noScroll ? styles.noScrollContainer : styles.scrollContainer),
    [noScroll]
  );

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView 
        style={styles.keyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={containerStyle}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEnabled={!noScroll}
          bounces={!noScroll && !isWeb}
          alwaysBounceVertical={false}
          overScrollMode="never"
          // Otimizações de performance
          removeClippedSubviews={!isWeb}
          scrollEventThrottle={16}
          // Previne scroll indesejado no iOS Safari
          {...(isWeb && {
            style: { overflow: noScroll ? 'hidden' : 'auto' } as any,
          })}
        >
          {/* Logo Block */}
          <View style={logoBlockStyle}>
            <Image 
              source={logoSource} 
              style={mergedLogo} 
              resizeMode="contain"
              // Otimização de carregamento de imagem
              fadeDuration={0}
            />
            {logoGap > 0 && <View style={{ height: logoGap }} />}
          </View>

          {/* Content */}
          <View style={contentMergedStyle}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default memo(AuthLayout);

const styles = StyleSheet.create({
  safe: { 
    flex: 1, 
    backgroundColor: "white",
    // Previne overflow no Safari
    ...(isWeb && {
      overflow: 'hidden' as any,
    }),
  },
  keyboardAvoid: { 
    flex: 1,
    ...(isWeb && {
      overflow: 'hidden' as any,
    }),
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: ui.spacing.xl,
    paddingBottom: ui.spacing.xl,
  },
  noScrollContainer: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: ui.spacing.xl,
    paddingBottom: ui.auth.bottomPadding,
    // No noScroll, não precisa de scroll
    ...(isWeb && {
      overflow: 'hidden' as any,
      minHeight: '100%' as any,
    }),
  },
  logoBlock: {
    alignItems: "center",
    marginTop: ui.spacing.sm,
  },
  logo: {
    width: ui.auth.logo.width,
    height: ui.auth.logo.height,
  },
  content: {
    width: "100%",
    alignItems: "center",
    flex: 1,
  },
});
