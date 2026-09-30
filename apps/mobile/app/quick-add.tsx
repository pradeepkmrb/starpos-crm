import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/AppText";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconChip } from "@/components/ui";
import { colors, radius, space } from "@/theme";
import { useAccess } from "@/lib/access";
import type { AccessModule } from "@starpos-crm/shared";

type Href = "/lead/edit" | "/map" | "/follow-ups" | "/leads";

const ACTIONS: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  fg: string;
  bg: string;
  href: Href;
  /** Shown only to roles with Edit on this menu. */
  needs: AccessModule;
}[] = [
  { title: "Add a lead", subtitle: "Capture a new enquiry", icon: "person-add", fg: colors.brand, bg: colors.brandSoft, href: "/lead/edit", needs: "leads" },
  { title: "Check in nearby", subtitle: "Start a visit at a lead near you", icon: "location", fg: colors.warning, bg: colors.warningSoft, href: "/map", needs: "visits" },
  { title: "Log a call or note", subtitle: "Pick a lead, then log it", icon: "call", fg: colors.danger, bg: colors.dangerSoft, href: "/leads", needs: "follow_ups" },
  { title: "Send a quotation", subtitle: "Pick a lead, then open Deals", icon: "receipt", fg: colors.info, bg: colors.infoSoft, href: "/leads", needs: "quotations" },
  { title: "Today's follow-ups", subtitle: "What's due and overdue", icon: "calendar", fg: colors.violet, bg: colors.violetSoft, href: "/follow-ups", needs: "follow_ups" },
];

/** The sheet behind the tab bar's centre "+" button. */
export default function QuickAddSheet() {
  const access = useAccess();
  const actions = ACTIONS.filter((a) => access.canEdit(a.needs));
  return (
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => router.back()} accessibilityLabel="Close" />
      <SafeAreaView edges={["bottom"]} style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Quick add</Text>
        {actions.map((action) => (
          <Pressable
            key={action.title}
            onPress={() => {
              router.back();
              router.push(action.href);
            }}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.background }]}
          >
            <IconChip name={action.icon} fg={action.fg} bg={action.bg} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{action.title}</Text>
              <Text style={styles.rowSubtitle}>{action.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Pressable>
        ))}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
  },
  handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginVertical: space.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink, marginBottom: space.sm, paddingHorizontal: space.xs },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.md },
  rowTitle: { fontSize: 16, fontWeight: "700", color: colors.ink },
  rowSubtitle: { fontSize: 13, color: colors.muted, marginTop: 1 },
});
