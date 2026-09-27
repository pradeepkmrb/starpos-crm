import { forwardRef } from "react";
import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from "react-native";

/**
 * Inter, the typeface of the design mockups. React Native has no app-wide
 * default font, so every screen imports Text/TextInput from here instead of
 * react-native. Custom fonts ship one file per weight, so the requested
 * fontWeight picks the file and the weight itself is reset — otherwise
 * Android would fake-bold an already-bold file.
 */
export const INTER = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  extrabold: "Inter_800ExtraBold",
} as const;

const BY_WEIGHT: Record<string, string> = {
  normal: INTER.regular,
  "100": INTER.regular,
  "200": INTER.regular,
  "300": INTER.regular,
  "400": INTER.regular,
  "500": INTER.medium,
  "600": INTER.semibold,
  bold: INTER.bold,
  "700": INTER.bold,
  "800": INTER.extrabold,
  "900": INTER.extrabold,
};

export function fontFor(weight: TextStyle["fontWeight"] | undefined): string {
  return BY_WEIGHT[String(weight ?? "400")] ?? INTER.regular;
}

function withInter(style: TextProps["style"]) {
  const flat = StyleSheet.flatten(style) ?? {};
  if (flat.fontFamily) return style;
  return [style, { fontFamily: fontFor(flat.fontWeight), fontWeight: "normal" as const }];
}

export const Text = forwardRef<RNText, TextProps>(function Text({ style, ...props }, ref) {
  return <RNText ref={ref} {...props} style={withInter(style)} />;
});

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput({ style, ...props }, ref) {
  return <RNTextInput ref={ref} {...props} style={withInter(style)} />;
});
