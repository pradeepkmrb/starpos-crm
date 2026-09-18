import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@digitel/shared";
import { colors, radius, space, STAGE_COLORS } from "@/theme";

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && { backgroundColor: colors.brand },
        variant === "secondary" && { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
        variant === "danger" && { backgroundColor: colors.danger },
        (pressed || inactive) && { opacity: 0.7 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "secondary" ? colors.brand : "#fff"} />
      ) : (
        <Text style={[styles.buttonText, variant === "secondary" && { color: colors.ink }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Badge({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function StageBadge({ status }: { status: LeadStatus }) {
  const c = STAGE_COLORS[status];
  return <Badge label={LEAD_STATUS_LABELS[status]} fg={c.fg} bg={c.bg} />;
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && { backgroundColor: colors.brand, borderColor: colors.brand }]}
    >
      <Text style={[styles.chipText, active && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

export function Field({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  hint?: string | null;
}) {
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
      </Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.faint} {...props} style={[styles.input, props.multiline && { minHeight: 80, textAlignVertical: "top" }, props.style]} />;
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionTitleText}>{title}</Text>
      {action}
    </View>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

export function ErrorText({ text }: { text: string | null }) {
  return text ? <Text style={styles.error}>{text}</Text> : null;
}

export function Loading() {
  return (
    <View style={{ padding: space.xl, alignItems: "center" }}>
      <ActivityIndicator color={colors.brand} />
    </View>
  );
}

export const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" },
  badgeText: { fontSize: 12, fontWeight: "600" },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: { color: colors.text, fontSize: 14, fontWeight: "500" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  label: { color: colors.text, fontSize: 14, fontWeight: "600", marginBottom: 6 },
  hint: { color: colors.muted, fontSize: 12, marginTop: 4 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  sectionTitle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  sectionTitleText: { fontSize: 17, fontWeight: "700", color: colors.ink },
  empty: { color: colors.muted, fontSize: 14, paddingVertical: space.md },
  error: { color: colors.danger, fontSize: 14, marginVertical: space.sm },
});
