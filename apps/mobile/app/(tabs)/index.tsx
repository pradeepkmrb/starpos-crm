import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { ActivityRow } from "@/components/ActivityRow";
import { Card, EmptyState, ErrorText, Loading, SectionTitle } from "@/components/ui";
import { ApiError, getFieldSummary, type FieldSummary } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatRupees, greeting, localWindow } from "@/lib/format";
import { colors, radius, space } from "@/theme";

type IconName = keyof typeof Ionicons.glyphMap;

export default function HomeScreen() {
  const { me } = useAuth();
  const [summary, setSummary] = useState<FieldSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setSummary(await getFieldSummary(localWindow()));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your day");
    }
  }, []);

  // Refetch whenever the tab comes back into view, e.g. after logging a call.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const firstName = me?.user.name?.split(" ")[0] ?? me?.user.email ?? "";
  const today = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: 96 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{firstName.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greeting()},</Text>
            <Text style={styles.name}>{firstName}</Text>
            <Text style={styles.date}>{today}</Text>
          </View>
        </View>

        <ErrorText text={error} />
        {!summary ? (
          <Loading />
        ) : (
          <>
            {summary.activeVisit && (
              <Pressable onPress={() => router.push(`/visit/${summary.activeVisit!.id}`)} style={styles.visit}>
                <Ionicons name="radio-button-on" size={18} color={colors.accent} />
                <Text style={styles.visitText} numberOfLines={1}>
                  On a visit · {summary.activeVisit.lead.company || summary.activeVisit.lead.name}
                </Text>
                <Text style={styles.visitAction}>Open</Text>
              </Pressable>
            )}

            <View style={styles.hero}>
              <Text style={styles.heroLabel}>Won this month</Text>
              <Text style={styles.heroValue}>{formatRupees(summary.month.wonValuePaise)}</Text>
              <View style={styles.heroDivider} />
              <Text style={styles.heroLabel}>Open pipeline</Text>
              <Text style={styles.heroSub}>
                {formatRupees(summary.openPipeline.valuePaise)} across {summary.openPipeline.count}{" "}
                {summary.openPipeline.count === 1 ? "lead" : "leads"}
              </Text>
            </View>

            <View style={styles.tiles}>
              <Tile icon="call-outline" label="Calls" value={summary.month.calls} tint={colors.danger} />
              <Tile icon="location-outline" label="Visits" value={summary.month.visits} tint={colors.warning} />
              <Tile icon="easel-outline" label="Demos" value={summary.month.demos} tint={colors.info} />
              <Tile icon="trophy-outline" label="Closings" value={summary.month.closings} tint={colors.success} />
            </View>

            {summary.overdueCount > 0 && (
              <Pressable onPress={() => router.push("/follow-ups?tab=overdue")} style={styles.overdue}>
                <Ionicons name="alert-circle" size={20} color={colors.danger} />
                <Text style={styles.overdueText}>
                  {summary.overdueCount} overdue {summary.overdueCount === 1 ? "follow-up" : "follow-ups"}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.danger} />
              </Pressable>
            )}

            <SectionTitle
              title={`Today's activities (${summary.today.length})`}
              action={
                <Pressable onPress={() => router.push("/follow-ups")}>
                  <Text style={styles.link}>See all</Text>
                </Pressable>
              }
            />
            <Card style={{ paddingVertical: 0 }}>
              {summary.today.length === 0 ? (
                <EmptyState text="Nothing scheduled for today." />
              ) : (
                summary.today.map((activity) => (
                  <ActivityRow
                    key={activity.id}
                    activity={activity}
                    onPress={() => router.push(`/lead/${activity.lead.id}`)}
                  />
                ))
              )}
            </Card>
          </>
        )}
      </ScrollView>

      <Pressable
        accessibilityLabel="Add lead"
        onPress={() => router.push("/lead/edit")}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>
    </SafeAreaView>
  );
}

function Tile({ icon, label, value, tint }: { icon: IconName; label: string; value: number; tint: string }) {
  return (
    <View style={styles.tile}>
      <Ionicons name={icon} size={20} color={tint} />
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: space.md, marginBottom: space.lg },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 20, fontWeight: "700", color: colors.brand },
  greeting: { fontSize: 13, color: colors.muted },
  name: { fontSize: 20, fontWeight: "700", color: colors.ink },
  date: { fontSize: 12, color: colors.muted },
  hero: { backgroundColor: colors.brand, borderRadius: radius.lg, padding: space.lg },
  visit: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
  },
  visitText: { flex: 1, color: "#fff", fontWeight: "600" },
  visitAction: { color: colors.accent, fontWeight: "700" },
  heroLabel: { color: "#CDEDE8", fontSize: 13 },
  heroValue: { color: "#fff", fontSize: 30, fontWeight: "800", marginTop: 2 },
  heroDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.25)", marginVertical: space.md },
  heroSub: { color: "#fff", fontSize: 16, fontWeight: "600", marginTop: 2 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  tile: {
    flexGrow: 1,
    flexBasis: "45%",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
  },
  tileValue: { fontSize: 22, fontWeight: "800", color: colors.ink, marginTop: space.xs },
  tileLabel: { fontSize: 13, color: colors.muted },
  overdue: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.md,
  },
  overdueText: { flex: 1, color: colors.danger, fontWeight: "600" },
  link: { color: colors.brand, fontWeight: "600" },
  fab: {
    position: "absolute",
    right: space.xl,
    bottom: space.xl,
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
});
