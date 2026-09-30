import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/AppText";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { ActivityRow } from "@/components/ActivityRow";
import { Avatar } from "@/components/Photo";
import { Card, EmptyState, ErrorText, GradientCard, IconChip, Loading, SectionTitle } from "@/components/ui";
import { ApiError, getFieldSummary, type FieldSummary } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAccess } from "@/lib/access";
import { ClockCard } from "@/components/ClockCard";
import { formatRupees, greeting, localWindow } from "@/lib/format";
import { colors, radius, shadow, space } from "@/theme";

type IconName = keyof typeof Ionicons.glyphMap;

export default function HomeScreen() {
  const { me } = useAuth();
  const access = useAccess();
  // The day's sales summary needs one of these menus; other roles get a simpler home.
  const salesAccess = access.canViewAny(["leads", "follow_ups", "visits", "targets"]);
  const [summary, setSummary] = useState<FieldSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!salesAccess) return;
    try {
      setSummary(await getFieldSummary(localWindow()));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load your day");
    }
  }, [salesAccess]);

  // Refetch whenever the tab comes back into view, e.g. after logging a call.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const firstName = me?.user.name?.split(" ")[0] ?? me?.user.email ?? "";
  const today = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  const won = summary?.month.wonValuePaise ?? 0;
  const open = summary?.openPipeline.valuePaise ?? 0;
  const share = won + open > 0 ? won / (won + open) : 0;
  const target = summary?.targetPaise ?? null;
  const targetShare = target ? won / target : 0;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }}
        refreshControl={
          <RefreshControl
            tintColor={colors.brand}
            colors={[colors.brand]}
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
          <Pressable accessibilityLabel="Profile" onPress={() => router.push("/more")}>
            <Avatar name={firstName} url={me?.user.avatarUrl} size={48} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text style={styles.name}>{firstName}</Text>
          </View>
          <Pressable
            accessibilityLabel="Follow-ups"
            onPress={() => router.push("/follow-ups")}
            style={styles.bell}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.ink} />
            {summary && summary.overdueCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{summary.overdueCount > 9 ? "9+" : summary.overdueCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
        <Text style={styles.date}>{today}</Text>

        <ErrorText text={error} />
        {!salesAccess ? (
          <View style={{ gap: space.md }}>
            <ClockCard />
            <EmptyState text="Your role doesn't include the sales screens. Ask your admin if you need them." />
          </View>
        ) : !summary ? (
          <Loading />
        ) : (
          <>
            {summary.activeVisit && (
              <Pressable onPress={() => router.push(`/visit/${summary.activeVisit!.id}`)} style={styles.visit}>
                <View style={styles.liveDot} />
                <Text style={styles.visitText} numberOfLines={1}>
                  On a visit · {summary.activeVisit.lead.company || summary.activeVisit.lead.name}
                </Text>
                <Text style={styles.visitAction}>Open</Text>
              </Pressable>
            )}

            <GradientCard>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="trophy-outline" size={14} color="#D8E7F7" />
                <Text style={styles.heroLabel}>Won this month</Text>
              </View>
              <Text style={styles.heroValue}>{formatRupees(won)}</Text>
              <Text style={styles.heroSub}>
                {summary.month.closings} {summary.month.closings === 1 ? "deal" : "deals"} closed
              </Text>
              {target ? (
                <>
                  <View style={styles.targetRow}>
                    <Text style={styles.heroFoot}>Target {formatRupees(target)}</Text>
                    <Text style={[styles.heroFoot, { fontWeight: "800", color: "#fff" }]}>{Math.round(targetShare * 100)}%</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(3, targetShare * 100))}%` }]} />
                  </View>
                  <Text style={styles.heroFoot}>
                    {won >= target ? (
                      <Text style={{ fontWeight: "800", color: "#fff" }}>Target hit — well done</Text>
                    ) : (
                      <>
                        <Text style={{ fontWeight: "800", color: "#fff" }}>{formatRupees(target - won)}</Text> to go
                      </>
                    )}
                    {" · "}
                    {formatRupees(summary.month.collectedPaise)} collected
                  </Text>
                </>
              ) : (
                <>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.max(3, share * 100)}%` }]} />
                  </View>
                  <Text style={styles.heroFoot}>
                    <Text style={{ fontWeight: "800", color: "#fff" }}>{formatRupees(open)}</Text> still open across{" "}
                    {summary.openPipeline.count} {summary.openPipeline.count === 1 ? "lead" : "leads"}
                  </Text>
                </>
              )}
            </GradientCard>

            <View style={styles.tiles}>
              <Tile icon="call" label="Calls" value={summary.month.calls} fg={colors.danger} bg={colors.dangerSoft} />
              <Tile icon="location" label="Visits" value={summary.month.visits} fg={colors.warning} bg={colors.warningSoft} />
              <Tile icon="easel" label="Demos" value={summary.month.demos} fg={colors.info} bg={colors.infoSoft} />
              <Tile icon="trophy" label="Closings" value={summary.month.closings} fg={colors.brand} bg={colors.brandSoft} />
            </View>

            {summary.overdueCount > 0 && (
              <Pressable onPress={() => router.push("/follow-ups?tab=overdue")} style={styles.overdue}>
                <IconChip name="alert-circle" fg={colors.danger} bg="#FEE2E2" size={36} />
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
            <Card style={{ paddingVertical: space.xs }}>
              {summary.today.length === 0 ? (
                <EmptyState text="Nothing scheduled for today. Tap + to plan a visit." />
              ) : (
                summary.today.map((activity, i) => (
                  <ActivityRow
                    key={activity.id}
                    activity={activity}
                    last={i === summary.today.length - 1}
                    onPress={() => router.push(`/lead/${activity.lead.id}`)}
                  />
                ))
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Tile({
  icon,
  label,
  value,
  fg,
  bg,
}: {
  icon: IconName;
  label: string;
  value: number;
  fg: string;
  bg: string;
}) {
  return (
    <View style={styles.tile}>
      <IconChip name={icon} fg={fg} bg={bg} size={38} />
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: space.md },
  greeting: { fontSize: 13, color: colors.muted },
  name: { fontSize: 22, fontWeight: "800", color: colors.ink },
  date: { fontSize: 13, color: colors.muted, marginTop: space.sm, marginBottom: space.lg },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadow,
  },
  bellBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },
  bellBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  visit: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
  },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brandLight },
  visitText: { flex: 1, color: "#fff", fontWeight: "700" },
  visitAction: { color: colors.brandLight, fontWeight: "800" },
  heroLabel: { color: "#D8E7F7", fontSize: 13, fontWeight: "600" },
  heroValue: { color: "#fff", fontSize: 34, fontWeight: "800", marginTop: 6, letterSpacing: -0.5 },
  heroSub: { color: "#D8E7F7", fontSize: 13 },
  targetRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, marginBottom: -8 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.25)", marginTop: space.lg },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: "#fff" },
  heroFoot: { color: "#D8E7F7", fontSize: 13, marginTop: space.sm },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: space.md, marginTop: space.lg },
  tile: {
    flexGrow: 1,
    flexBasis: "45%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    ...shadow,
  },
  tileValue: { fontSize: 26, fontWeight: "800", color: colors.ink, marginTop: space.md },
  tileLabel: { fontSize: 13, color: colors.muted, fontWeight: "600" },
  overdue: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.lg,
    padding: space.md,
    marginTop: space.lg,
  },
  overdueText: { flex: 1, color: colors.danger, fontWeight: "700" },
  link: { color: colors.brand, fontWeight: "700" },
});
