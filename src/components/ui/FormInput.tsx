import React from "react";
import { View, Text, TextInput, StyleSheet, TextInputProps, Pressable } from "react-native";
import { Ionicons } from "@/shims/icons";
import { colors } from "../../theme/colors";

interface FormInputProps extends TextInputProps {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
}

export default function FormInput({
  label,
  required,
  error,
  hint,
  leftIcon,
  rightIcon,
  onRightIconPress,
  style,
  ...props
}: FormInputProps) {
  return (
    <View style={styles.container}>
      {label && (
        <Text style={styles.label}>
          {label}
          {required && <Text style={styles.required}> *</Text>}
        </Text>
      )}
      <View style={[styles.inputContainer, error && styles.inputError]}>
        {leftIcon && (
          <Ionicons name={leftIcon} size={18} color="#94A3B8" style={styles.leftIcon} />
        )}
        <TextInput
          style={[styles.input, leftIcon && styles.inputWithLeftIcon, style]}
          placeholderTextColor="#94A3B8"
          {...props}
        />
        {rightIcon && (
          <Pressable onPress={onRightIconPress} disabled={!onRightIconPress}>
            <Ionicons name={rightIcon} size={18} color="#94A3B8" style={styles.rightIcon} />
          </Pressable>
        )}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
      {hint && !error && <Text style={styles.hintText}>{hint}</Text>}
    </View>
  );
}

interface FormSelectProps {
  label?: string;
  required?: boolean;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
}

export function FormSelect({
  label,
  required,
  value,
  options,
  onChange,
  placeholder = "Selecione...",
  error,
}: FormSelectProps) {
  return (
    <View style={styles.container}>
      {label && (
        <Text style={styles.label}>
          {label}
          {required && <Text style={styles.required}> *</Text>}
        </Text>
      )}
      <View style={[styles.selectContainer, error && styles.inputError]}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            style={[styles.selectOption, value === option.value && styles.selectOptionActive]}
            onPress={() => onChange(option.value)}
          >
            <Text
              style={[
                styles.selectOptionText,
                value === option.value && styles.selectOptionTextActive,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

interface FormCheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function FormCheckbox({ label, checked, onChange, disabled }: FormCheckboxProps) {
  return (
    <Pressable
      style={[styles.checkboxContainer, disabled && styles.checkboxDisabled]}
      onPress={() => !disabled && onChange(!checked)}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

interface FormChipSelectProps {
  label?: string;
  options: { value: string; label: string; icon?: string; color?: string }[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
}

export function FormChipSelect({
  label,
  options,
  value,
  onChange,
  multiple = false,
}: FormChipSelectProps) {
  const selectedValues = Array.isArray(value) ? value : [value];

  const handlePress = (optionValue: string) => {
    if (multiple) {
      const isSelected = selectedValues.includes(optionValue);
      if (isSelected) {
        onChange(selectedValues.filter((v) => v !== optionValue));
      } else {
        onChange([...selectedValues, optionValue]);
      }
    } else {
      onChange(optionValue);
    }
  };

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.chipContainer}>
        {options.map((option) => {
          const isSelected = selectedValues.includes(option.value);
          return (
            <Pressable
              key={option.value}
              style={[
                styles.chip,
                isSelected && styles.chipSelected,
                option.color && isSelected && { backgroundColor: option.color + "20", borderColor: option.color },
              ]}
              onPress={() => handlePress(option.value)}
            >
              {option.icon && (
                <Ionicons
                  name={option.icon as any}
                  size={14}
                  color={isSelected ? option.color || colors.purple : "#64748B"}
                />
              )}
              <Text
                style={[
                  styles.chipText,
                  isSelected && styles.chipTextSelected,
                  option.color && isSelected && { color: option.color },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 6,
  },
  required: {
    color: colors.danger,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  inputError: {
    borderColor: colors.danger,
  },
  leftIcon: {
    paddingLeft: 14,
  },
  rightIcon: {
    paddingRight: 14,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1E293B",
  },
  inputWithLeftIcon: {
    paddingLeft: 8,
  },
  errorText: {
    fontSize: 12,
    color: colors.danger,
    marginTop: 4,
  },
  hintText: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 4,
  },
  selectContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  selectOption: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  selectOptionActive: {
    backgroundColor: colors.purple + "15",
    borderColor: colors.purple,
  },
  selectOptionText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#64748B",
  },
  selectOptionTextActive: {
    color: colors.purple,
    fontWeight: "600",
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  checkboxDisabled: {
    opacity: 0.5,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },
  checkboxLabel: {
    fontSize: 14,
    color: "#1E293B",
    fontWeight: "500",
  },
  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipSelected: {
    backgroundColor: colors.purple + "15",
    borderColor: colors.purple,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#64748B",
  },
  chipTextSelected: {
    color: colors.purple,
    fontWeight: "600",
  },
});


