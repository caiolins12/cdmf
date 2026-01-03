import React, { useEffect } from "react";
import { View, Image, StyleSheet, Animated, Easing, Dimensions, Text } from "react-native";
import { colors } from "../theme/colors";
import { LinearGradient } from "expo-linear-gradient";

const { width, height } = Dimensions.get("window");

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreenComponent({ onFinish }: SplashScreenProps) {
  const logoOpacity = React.useRef(new Animated.Value(1)).current;
  const logoScale = React.useRef(new Animated.Value(1)).current;
  const textOpacity = React.useRef(new Animated.Value(0)).current;
  const textTranslateY = React.useRef(new Animated.Value(20)).current;
  const fadeOut = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Texto aparece com slide up após um delay
    const textTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(textTranslateY, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    }, 500);

    // Fade out e finalizar
    const timer = setTimeout(() => {
      Animated.timing(fadeOut, {
        toValue: 0,
        duration: 500,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        onFinish();
      });
    }, 2800);

    return () => {
      clearTimeout(textTimer);
      clearTimeout(timer);
    };
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}>
      <LinearGradient
        colors={["#1a1a2e", "#16213e", "#0f0f23"]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {/* Círculos decorativos de fundo */}
        <View style={[styles.circle, styles.circle1]} />
        <View style={[styles.circle, styles.circle2]} />
        
        {/* Logo */}
        <Animated.View
          style={[
            styles.logoContainer,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Image
            source={require("../../assets/icon.png")}
            style={styles.logo}
            resizeMode="cover"
            onError={(e) => console.log("Erro ao carregar imagem:", e.nativeEvent.error)}
            onLoad={() => console.log("Imagem carregada com sucesso")}
          />
        </Animated.View>

        {/* Texto */}
        <Animated.View
          style={[
            styles.textContainer,
            {
              opacity: textOpacity,
              transform: [{ translateY: textTranslateY }],
            },
          ]}
        >
          <Text style={styles.title}>Centro de Danças</Text>
          <Text style={styles.subtitle}>Marcelo Ferreira</Text>
        </Animated.View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  circle: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.08,
  },
  circle1: {
    width: width * 1.2,
    height: width * 1.2,
    backgroundColor: "#7B1FA2",
    top: -width * 0.3,
    right: -width * 0.3,
  },
  circle2: {
    width: width * 0.8,
    height: width * 0.8,
    backgroundColor: "#FFB300",
    bottom: -width * 0.2,
    left: -width * 0.2,
  },
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  logo: {
    width: 200,
    height: 200,
    borderRadius: 40,
  },
  textContainer: {
    alignItems: "center",
    marginTop: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "400",
    color: "rgba(255, 255, 255, 0.7)",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  subtitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#FFB300",
    marginTop: 4,
    letterSpacing: 1,
  },
});
