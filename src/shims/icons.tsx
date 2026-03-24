import React from "react";
import * as FaIcons from "react-icons/fa";
import * as IoIcons from "react-icons/io5";
import * as MdIcons from "react-icons/md";
import type { IconType } from "react-icons";

type IconSet = Record<string, IconType>;

type ExpoIconProps = {
  name: string;
  size?: number;
  color?: string;
  style?: React.CSSProperties | React.CSSProperties[] | undefined;
};

type ExpoIconComponent = React.FC<ExpoIconProps> & {
  glyphMap: Record<string, string>;
  font: Record<string, never>;
};

function toPascalCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function flattenStyle(
  style: ExpoIconProps["style"]
): React.CSSProperties | undefined {
  if (!style) {
    return undefined;
  }

  if (Array.isArray(style)) {
    return style.reduce<React.CSSProperties>((acc, current) => {
      if (!current) {
        return acc;
      }
      return { ...acc, ...current };
    }, {});
  }

  return style;
}

function resolveIcon(set: IconSet, name: string, prefixes: string[]): IconType | null {
  const pascal = toPascalCase(name);

  for (const prefix of prefixes) {
    const directKey = `${prefix}${pascal}`;
    if (set[directKey]) {
      return set[directKey];
    }

    const directKeyAlt = `${prefix}${pascal.replace(/\d+/g, "")}`;
    if (set[directKeyAlt]) {
      return set[directKeyAlt];
    }
  }

  const compact = name.replace(/[-_\s]/g, "").toLowerCase();

  for (const [iconKey, iconComponent] of Object.entries(set)) {
    if (iconKey.toLowerCase() === compact) {
      return iconComponent;
    }

    if (iconKey.toLowerCase().endsWith(compact)) {
      return iconComponent;
    }
  }

  return null;
}

function createIconComponent(
  set: IconSet,
  prefixes: string[],
  fallback: IconType
): ExpoIconComponent {
  const IconComponent: React.FC<ExpoIconProps> = ({
    name,
    size = 24,
    color = "currentColor",
    style,
  }) => {
    const ResolvedIcon = resolveIcon(set, name, prefixes) || fallback;
    return <ResolvedIcon size={size} color={color} style={flattenStyle(style)} />;
  };

  const TypedIcon = IconComponent as ExpoIconComponent;
  TypedIcon.glyphMap = {};
  TypedIcon.font = {};
  return TypedIcon;
}

export const Ionicons = createIconComponent(
  IoIcons as IconSet,
  ["Io"],
  IoIcons.IoHelpCircleOutline
);

export const FontAwesome5 = createIconComponent(
  FaIcons as IconSet,
  ["Fa"],
  FaIcons.FaQuestionCircle
);

export const FontAwesome = createIconComponent(
  FaIcons as IconSet,
  ["Fa"],
  FaIcons.FaQuestionCircle
);

export const MaterialIcons = createIconComponent(
  MdIcons as IconSet,
  ["Md"],
  MdIcons.MdHelpOutline
);

export const MaterialCommunityIcons = createIconComponent(
  MdIcons as IconSet,
  ["Md"],
  MdIcons.MdHelpOutline
);
