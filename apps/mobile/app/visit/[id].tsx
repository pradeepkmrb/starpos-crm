import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { VISIT_OUTCOMES } from "@digitel/shared";
import { DateTimeField } from "@/components/DateTimeField";
import { Button, Card, Chip, ChipRow, ErrorText, Field, GradientCard, Input, Loading } from "@/components/ui";
import { success } from "@/lib/haptics";
import { ApiError, checkOut, createActivity, listActivities, type Activity } from "@/lib/api";
import { currentFix } from "@/lib/location";
import { colors, radius, space } from "@/theme";

function elapsed(fromIso: string, now: number): string {
  const total = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** A visit in progress (mockup screen 10): the timer, the result, and End visit. */
export default function ActiveVisitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [visit, setVisit] = useState<Activity | null>(null);
  const [missing, setMissing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [outcome, setOutcome] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState(false);
  const [followUpAt, setFollowUpAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listActivities({ status: "in_progress", owner: "me" })
      .then((open) => {
        const found = open.find((a) => a.id === id) ?? null;
        setVisit(found);
        setMissing(!found);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this visit"));
  }, [id]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function endVisit() {
    if (!visit) return;
    if (followUp && !followUpAt) {
      setError("Pick a time for the next follow-up, or switch it off.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Where the rep left from is nice to have, not worth blocking on.
      const fix = await currentFix().catch(() => null);
      await checkOut(visit.id, {
        outcome,
        notes: notes.trim() || null,
        ...(fix ? { latitude: fix.latitude, longitude: fix.longitude } : {}),
      });
      if (followUp && followUpAt) {
        await createActivity({
          leadId: visit.lead.id,
          type: "follow_up",
          status: "scheduled",
          scheduledAt: followUpAt.toISOString(),
        });
      }
      success();
      router.replace(`/lead/${visit.lead.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not end the visit");
    } finally {
      setBusy(false);
    }
  }

  if (missing) {
    return (
      <View style={{ padding: space.lg, gap: space.md }}>
        <Stack.Screen options={{ title: "Visit" }} />
        <Text style={styles.muted}>This visit has already ended.</Text>
        <Button title="Back to home" variant="secondary" onPress={() => router.replace("/")} />
      </View>
    );
  }
  if (!visit) return error ? <ErrorText text={error} /> : <Loading />;

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
      <Stack.Screen options={{ title: "Visit in progress" }} />

      <GradientCard style={{ alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <View style={styles.liveDot} />
          <Text style={styles.timer}>{visit.startedAt ? elapsed(visit.startedAt, now) : "--:--:--"}</Text>
        </View>
        <Text style={styles.timerLabel}>Visit in progress{visit.title ? ` · ${visit.title}` : ""}</Text>
      </GradientCard>

      <Card style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
        <View style={styles.icon}>
          <Ionicons name="storefront-outline" size={22} color={colors.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{visit.lead.company || visit.lead.name}</Text>
          {visit.lead.address ? <Text style={styles.muted}>{visit.lead.address}</Text> : null}
        </View>
      </Card>

      <Field label="Visit result">
        <ChipRow>
          {Object.entries(VISIT_OUTCOMES).map(([key, label]) => (
            <Chip key={key} label={label} active={outcome === key} onPress={() => setOutcome(outcome === key ? null : key)} />
          ))}
        </ChipRow>
      </Field>

      <Field label="Notes">
        <Input value={notes} onChangeText={setNotes} multiline placeholder="Enter your discussion notes…" />
      </Field>

      <Field label="Next follow-up">
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: colors.text, fontSize: 15 }}>Schedule a follow-up</Text>
          <Switch value={followUp} onValueChange={setFollowUp} trackColor={{ true: colors.brand, false: colors.border }} />
        </View>
        {followUp && (
          <View style={{ marginTop: space.sm }}>
            <DateTimeField value={followUpAt} onChange={setFollowUpAt} />
          </View>
        )}
      </Field>

      <ErrorText text={error} />
      <Button title="End visit" variant="danger" onPress={() => void endVisit()} loading={busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  timer: { fontSize: 40, fontWeight: "800", color: "#fff", fontVariant: ["tabular-nums"] },
  timerLabel: { color: "#D1FAE5", marginTop: space.xs, fontWeight: "600" },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 17, fontWeight: "700", color: colors.ink },
  muted: { fontSize: 13, color: colors.muted, marginTop: 2 },
});
