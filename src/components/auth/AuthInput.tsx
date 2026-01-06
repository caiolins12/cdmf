import React, { useState, forwardRef } from "react";
import { View, Text, TextInput, StyleSheet, TextInputProps, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { ui } from "../../theme/ui";

type Props = TextInputProps & {
  label: string;
};

const AuthInput = forwardRef<TextInput, Props>(({ label, secureTextEntry, ...props }, ref) => {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const isPasswordField = secureTextEntry !== undefined;

  // Gera um ID único baseado no label
  const inputId = React.useMemo(() => {
    const baseId = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    return `auth-input-${baseId}`;
  }, [label]);

  const togglePasswordVisibility = () => {
    setIsPasswordVisible(!isPasswordVisible);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputContainer}>
        <TextInput
          ref={ref}
          {...props}
          id={inputId}
          name={inputId}
          secureTextEntry={isPasswordField ? !isPasswordVisible : false}
          style={[styles.input, isPasswordField && styles.inputWithIcon, props.style]}
          placeholderTextColor={colors.grayLabel}
          importantForAutofill="yes"
        />
        {isPasswordField && (
          <Pressable 
            onPress={togglePasswordVisibility} 
            style={styles.eyeButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons 
              name={isPasswordVisible ? "eye-off" : "eye"} 
              size={22} 
              color={colors.grayLabel} 
            />
          </Pressable>
        )}
      </View>
    </View>
  );
});

export default AuthInput;

const styles = StyleSheet.create({
  wrap: {
    width: "82%",
    maxWidth: ui.layout.contentMaxWidth,
    marginTop: ui.spacing.md,
  },
  label: {
    color: colors.grayLabel,
    fontSize: 14,
    marginBottom: 6,
    fontWeight: "600",
  },
  inputContainer: {
    position: "relative",
    justifyContent: "center",
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: colors.grayBorder,
    borderRadius: 10,
    paddingHorizontal: ui.spacing.md,
    fontSize: 16,
    color: "#111111",
    backgroundColor: "#FFFFFF",
  },
  inputWithIcon: {
    paddingRight: 50,
  },
  eyeButton: {
    position: "absolute",
    right: 14,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
});
