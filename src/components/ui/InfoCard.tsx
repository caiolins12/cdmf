import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@/shims/icons";
import { colors } from "../../theme/colors";

interface InfoRowProps {
  label: string;
  value: string | React.ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  copyable?: boolean;
}

export function InfoRow({ label, value, icon, onPress, copyable }: InfoRowProps) {
  const content = (
    <View style={styles.infoRow}>
      <View style={styles.infoLabelContainer}>
        {icon && <Ionicons name={icon} size={16} color="#94A3B8" style={styles.infoIcon} />}
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <View style={styles.infoValueContainer}>
        {typeof value === "string" ? (
          <Text style={styles.infoValue} numberOfLines={2}>
            {value}
          </Text>
        ) : (
          value
        )}
        {(onPress || copyable) && (
          <Ionicons
            name={copyable ? "copy-outline" : "chevron-forward"}
            size={16}
            color="#94A3B8"
          />
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={styles.infoRowPressable}>
        {content}
      </Pressable>
    );
  }

  return content;
}

interface InfoSectionProps {
  title?: string;
  children: React.ReactNode;
  action?: {
    label: string;
    onPress: () => void;
  };
}

export function InfoSection({ title, children, action }: InfoSectionProps) {
  return (
    <View style={styles.section}>
      {(title || action) && (
        <View style={styles.sectionHeader}>
          {title && <Text style={styles.sectionTitle}>{title}</Text>}
          {action && (
            <Pressable style={styles.sectionAction} onPress={action.onPress}>
              <Text style={styles.sectionActionText}>{action.label}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.purple} />
            </Pressable>
          )}
        </View>
      )}
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

interface StatusBadgeProps {
  label: string;
  color: string;
  icon?: keyof typeof Ionicons.glyphMap;
  size?: "small" | "medium";
}

export function StatusBadge({ label, color, icon, size = "medium" }: StatusBadgeProps) {
  const isSmall = size === "small";
  return (
    <View style={[styles.badge, { backgroundColor: color + "20" }, isSmall && styles.badgeSmall]}>
      {icon && <Ionicons name={icon} size={isSmall ? 12 : 14} color={color} />}
      <Text style={[styles.badgeText, { color }, isSmall && styles.badgeTextSmall]}>{label}</Text>
    </View>
  );
}

interface ChipListProps {
  items: string[];
  maxDisplay?: number;
  onPress?: () => void;
}

export function ChipList({ items, maxDisplay = 3, onPress }: ChipListProps) {
  const displayItems = items.slice(0, maxDisplay);
  const remaining = items.length - maxDisplay;

  return (
    <Pressable style={styles.chipList} onPress={onPress} disabled={!onPress}>
      {displayItems.map((item, index) => (
        <View key={index} style={styles.chip}>
          <Text style={styles.chipText}>{item}</Text>
        </View>
      ))}
      {remaining > 0 && <Text style={styles.chipMore}>+{remaining} mais</Text>}
    </Pressable>
  );
}

interface AvatarProps {
  name: string;
  size?: number;
  color?: string;
  inactive?: boolean;
}

export function Avatar({ name, size = 48, color = colors.purple, inactive }: AvatarProps) {
  const initial = name.charAt(0).toUpperCase();
  const bgColor = inactive ? "#FFCDD2" : color + "20";
  const textColor = inactive ? colors.danger : color;

  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.4, color: textColor }]}>{initial}</Text>
    </View>
  );
}

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
}

export function EmptyState({ icon = "folder-open-outline", title, description, action }: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon} size={48} color="#CBD5E1" />
      <Text style={styles.emptyTitle}>{title}</Text>
      {description && <Text style={styles.emptyDescription}>{description}</Text>}
      {action && (
        <Pressable style={styles.emptyAction} onPress={action.onPress}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.emptyActionText}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Info Row
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  infoRowPressable: {
    marginHorizontal: -4,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  infoLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  infoIcon: {
    marginRight: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: "#64748B",
  },
  infoValueContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    justifyContent: "flex-end",
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
    textAlign: "right",
  },

  // Section
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
  },
  sectionAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  sectionActionText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.purple,
  },
  sectionContent: {},

  // Badge
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  badgeTextSmall: {
    fontSize: 11,
  },

  // Chip List
  chipList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.purple,
  },
  chipMore: {
    fontSize: 12,
    color: "#64748B",
    alignSelf: "center",
  },

  // Avatar
  avatar: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontWeight: "800",
  },

  // Empty State
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
    marginTop: 16,
    textAlign: "center",
  },
  emptyDescription: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
    textAlign: "center",
  },
  emptyAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.purple,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 16,
  },
  emptyActionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
});


