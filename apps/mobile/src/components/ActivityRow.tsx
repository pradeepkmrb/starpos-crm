import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/AppText";
import { ACTIVITY_TYPE_LABELS, outcomeLabel, type ActivityType } from "@digitel/shared";
import type { Activity } from "@/lib/api";
import { formatWhen, isOverdue } from "@/lib/format";
import { colors, space } from "@/theme";
import { Badge, IconChip } from "./ui";

/** Same icon and colour per type as the web dashboard's ActivityIcon. */
export const ACTIVITY_LOOK: Record<ActivityType, { icon: keyof typeof Ionicons.glyphMap; fg: string; bg: string }> = {
  call: { icon: "call", fg: colors.danger, bg: colors.dangerSoft },
  visit: { icon: "location", fg: colors.warning, bg: colors.warningSoft },
  demo: { icon: "easel", fg: colors.info, bg: colors.infoSoft },
  follow_up: { icon: "calendar", fg: colors.violet, bg: colors.violetSoft },
  note: { icon: "document-text", fg: colors.muted, bg: "#F1F5F9" },
};

/**
 * One to-do or timeline entry. `showLead` names the lead (home and follow-up
 * lists); on a lead's own timeline it would be redundant.
 */
export function ActivityRow({
  activity,
  showLead = true,
  last = false,
  onPress,
}: {
  activity: Activity;
  showLead?: boolean;
  /** Drops the divider under the final row of a card. */
  last?: boolean;
  onPress?: () => void;
}) {
  const when =
    activity.status === "completed"
      ? (activity.completedAt ?? activity.createdAt)
      : activity.status === "in_progress"
        ? activity.startedAt
        : activity.scheduledAt;
  const overdue = isOverdue(activity);
  const look = ACTIVITY_LOOK[activity.type];
  // Reps know a place by its business name more than by the contact's.
  const title = showLead
    ? `${ACTIVITY_TYPE_LABELS[activity.type]} · ${activity.lead.company || activity.lead.name}`
    : ACTIVITY_TYPE_LABELS[activity.type];

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && { opacity: 0.7 }]}
    >
      <IconChip name={look.icon} fg={overdue ? colors.danger : look.fg} bg={overdue ? colors.dangerSoft : look.bg} size={40} />
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
        <Text style={[styles.when, overdue && { color: colors.danger, fontWeight: "600" }]}>{formatWhen(when)}</Text>
      </View>
      {activity.status === "in_progress" ? (
        <Badge label="On site" fg={colors.warning} bg={colors.warningSoft} />
      ) : activity.status === "completed" ? (
        <Badge label="Done" fg={colors.brandDark} bg={colors.brandSoft} />
      ) : activity.status === "cancelled" ? (
        <Badge label="Cancelled" fg={colors.muted} bg={colors.background} />
      ) : overdue ? (
        <Badge label="Overdue" fg={colors.danger} bg={colors.dangerSoft} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { fontSize: 15, fontWeight: "700", color: colors.ink },
  notes: { fontSize: 13, color: colors.text, marginTop: 2 },
  when: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
