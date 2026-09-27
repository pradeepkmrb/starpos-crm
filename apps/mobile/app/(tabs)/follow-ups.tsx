import { useCallback, useEffect, useState } from "react";
import { Alert, Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/AppText";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ActivityRow } from "@/components/ActivityRow";
import { Button, Card, Chip, ChipRow, EmptyState, ErrorText, Loading } from "@/components/ui";
import { ApiError, listActivities, updateActivity, type Activity } from "@/lib/api";
import { addDays, startOfDay } from "@/lib/format";
import { success } from "@/lib/haptics";
import { colors, space } from "@/theme";

type Tab = "today" | "upcoming" | "overdue";
const TABS: { key: Tab; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "overdue", label: "Overdue" },
];

function windowFor(tab: Tab): { from?: string; to?: string } {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  if (tab === "today") return { from: today.toISOString(), to: tomorrow.toISOString() };
  if (tab === "upcoming") return { from: tomorrow.toISOString() };
  return { to: today.toISOString() };
}

/** The rep's own open to-dos, as the web Follow-ups page shows them. */
export default function FollowUpsScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>("today");
  const [lists, setLists] = useState<Record<Tab, Activity[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // The home screen's overdue banner links straight to that tab.
  useEffect(() => {
    if (params.tab === "overdue" || params.tab === "upcoming" || params.tab === "today") setTab(params.tab);
  }, [params.tab]);

  const load = useCallback(async () => {
    try {
      const [today, upcoming, overdue] = await Promise.all(
        TABS.map(({ key }) => listActivities({ status: "scheduled", owner: "me", ...windowFor(key) })),
      );
      setLists({ today, upcoming, overdue });
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load follow-ups");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function markDone(activity: Activity) {
    setBusyId(activity.id);
    try {
      await updateActivity(activity.id, { status: "completed" });
      success();
      await load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not update";
      if (Platform.OS === "web") setError(message);
      else Alert.alert("Couldn't mark done", message);
    } finally {
      setBusyId(null);
    }
  }

  const rows = lists?.[tab] ?? [];

  return (
    <ScrollView
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl }}
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
      <ChipRow>
        {TABS.map(({ key, label }) => (
          <Chip
            key={key}
            label={lists ? `${label} (${lists[key].length})` : label}
            active={tab === key}
            onPress={() => setTab(key)}
          />
        ))}
      </ChipRow>
      <ErrorText text={error} />
      {!lists ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState
          text={tab === "overdue" ? "Nothing overdue. Nice." : tab === "today" ? "Nothing scheduled for today." : "Nothing coming up."}
        />
      ) : (
        <View style={{ gap: space.sm, marginTop: space.md }}>
          {rows.map((activity) => (
            <Card key={activity.id} style={{ paddingVertical: 0 }}>
              <ActivityRow activity={activity} onPress={() => router.push(`/lead/${activity.lead.id}`)} />
              {activity.lead.phone || activity.lead.address ? (
                <Text style={styles.meta} numberOfLines={1}>
                  {[activity.lead.phone, activity.lead.address].filter(Boolean).join(" · ")}
                </Text>
              ) : null}
              <View style={styles.actions}>
                <Button
                  title="Mark done"
                  onPress={() => void markDone(activity)}
                  loading={busyId === activity.id}
                  style={{ flex: 1, minHeight: 40 }}
                />
                <Button
                  title={activity.type === "visit" ? "Check in" : "Log outcome"}
                  variant="secondary"
                  onPress={() =>
                    router.push(
                      activity.type === "visit"
                        ? `/visit/check-in?leadId=${activity.lead.id}&activityId=${activity.id}`
                        : `/activity/new?leadId=${activity.lead.id}&type=${activity.type}&completes=${activity.id}`,
                    )
                  }
                  style={{ flex: 1, minHeight: 40 }}
                />
              </View>
            </Card>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  meta: { color: colors.muted, fontSize: 12, marginTop: space.sm },
  actions: { flexDirection: "row", gap: space.sm, paddingVertical: space.md },
});
