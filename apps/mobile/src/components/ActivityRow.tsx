import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ACTIVITY_TYPE_LABELS, outcomeLabel, type ActivityType } from "@digitel/shared";
import type { Activity } from "@/lib/api";
import { formatWhen, isOverdue } from "@/lib/format";
import { colors, radius, space } from "@/theme";
import { Badge } from "./ui";

const ICONS: Record<ActivityType, keyof typeof Ionicons.glyphMap> = {
  call: "call-outline",
  visit: "location-outline",
  demo: "easel-outline",
  follow_up: "repeat-outline",
  note: "document-text-outline",
};

/**
 * One to-do or timeline entry. `showLead` names the lead (home and follow-up
 * lists); on a lead's own timeline it would be redundant.
 */
export function ActivityRow({
  activity,
  showLead = true,
  onPress,
}: {
  activity: Activity;
  showLead?: boolean;
  onPress?: () => void;
}) {
  const when = activity.status === "completed" ? (activity.completedAt ?? activity.createdAt) : activity.scheduledAt;
  const overdue = isOverdue(activity);
  // Reps know a place by its business name more than by the contact's.
  const title = showLead
    ? `${ACTIVITY_TYPE_LABELS[activity.type]} · ${activity.lead.company || activity.lead.name}`
    : ACTIVITY_TYPE_LABELS[activity.type];

  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
      <View style={[styles.icon, { backgroundColor: overdue ? colors.dangerSoft : colors.brandSoft }]}>
        <Ionicons name={ICONS[activity.type]} size={18} color={overdue ? colors.danger : colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {activity.outcome || activity.notes ? (
          <Text style={styles.notes} numberOfLines={2}>
            {activity.outcome ? `${outcomeLabel(activity.outcome)}${activity.notes ? " — " : ""}` : ""}
            {activity.notes ?? ""}
          </Text>
        ) : null}
        <Text style={[styles.when, overdue && { color: colors.danger }]}>{formatWhen(when)}</Text>
      </View>
      {activity.status === "completed" ? (
        <Badge label="Done" fg={colors.success} bg={colors.successSoft} />
      ) : activity.status === "cancelled" ? (
        <Badge label="Cancelled" fg={colors.muted} bg={colors.background} />
      ) : overdue ? (
        <Badge label="Overdue" fg={colors.danger} bg={colors.dangerSoft} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  icon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15, fontWeight: "600", color: colors.ink },
  notes: { fontSize: 13, color: colors.text, marginTop: 2 },
  when: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
