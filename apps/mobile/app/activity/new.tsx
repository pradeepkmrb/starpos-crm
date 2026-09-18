import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Switch, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS, CALL_OUTCOMES, type ActivityType } from "@digitel/shared";
import { DateTimeField } from "@/components/DateTimeField";
import { Button, Chip, ChipRow, ErrorText, Field, Input } from "@/components/ui";
import { ApiError, createActivity, updateActivity } from "@/lib/api";
import { colors, space } from "@/theme";

function isActivityType(value: unknown): value is ActivityType {
  return typeof value === "string" && (ACTIVITY_TYPES as readonly string[]).includes(value);
}

/**
 * Log something that just happened, or schedule it for later. Opened with
 * `completes=<id>` it records the outcome of an already-scheduled activity
 * instead of creating a new one.
 */
export default function NewActivityScreen() {
  const params = useLocalSearchParams<{ leadId: string; type?: string; mode?: string; completes?: string }>();
  const completing = params.completes ?? null;
  const [type, setType] = useState<ActivityType>(isActivityType(params.type) ? params.type : "call");
  const [schedule, setSchedule] = useState(!completing && params.mode === "schedule");
  const [when, setWhen] = useState<Date | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState(false);
  const [followUpAt, setFollowUpAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isNote = type === "note";
  const scheduling = schedule && !isNote;

  async function save() {
    if (scheduling && !when) {
      setError("Pick when it's scheduled for.");
      return;
    }
    if (!scheduling && followUp && !followUpAt) {
      setError("Pick a time for the next follow-up, or switch it off.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (completing) {
        await updateActivity(completing, { status: "completed", outcome, notes: notes.trim() || null });
      } else {
        await createActivity({
          leadId: params.leadId,
          type,
          status: scheduling ? "scheduled" : "completed",
          scheduledAt: scheduling ? when!.toISOString() : null,
          outcome: scheduling ? null : outcome,
          notes: notes.trim() || null,
        });
      }
      if (!scheduling && followUp && followUpAt) {
        await createActivity({
          leadId: params.leadId,
          type: "follow_up",
          status: "scheduled",
          scheduledAt: followUpAt.toISOString(),
        });
      }
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const title = completing ? `${ACTIVITY_TYPE_LABELS[type]} outcome` : scheduling ? "Schedule" : "Log activity";

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
        {!completing && (
          <Field label="What">
            <ChipRow>
              {ACTIVITY_TYPES.map((t) => (
                <Chip key={t} label={ACTIVITY_TYPE_LABELS[t]} active={type === t} onPress={() => setType(t)} />
              ))}
            </ChipRow>
          </Field>
        )}

        {!completing && !isNote && (
          <Field label="When">
            <ChipRow>
              <Chip label="Done just now" active={!schedule} onPress={() => setSchedule(false)} />
              <Chip label="Schedule for later" active={schedule} onPress={() => setSchedule(true)} />
            </ChipRow>
            {schedule && (
              <View style={{ marginTop: space.sm }}>
                <DateTimeField value={when} onChange={setWhen} />
              </View>
            )}
          </Field>
        )}

        {!scheduling && type === "call" && (
          <Field label="Call result">
            <ChipRow>
              {Object.entries(CALL_OUTCOMES).map(([key, label]) => (
                <Chip key={key} label={label} active={outcome === key} onPress={() => setOutcome(outcome === key ? null : key)} />
              ))}
            </ChipRow>
          </Field>
        )}

        <Field label={scheduling ? "What's it for?" : "Notes"}>
          <Input
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder={scheduling ? "Optional" : "What was discussed?"}
          />
        </Field>

        {!scheduling && !isNote && (
          <Field label="Next follow-up">
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.text, fontSize: 15 }}>Schedule a follow-up</Text>
              <Switch
                value={followUp}
                onValueChange={setFollowUp}
                trackColor={{ true: colors.brand, false: colors.border }}
              />
            </View>
            {followUp && (
              <View style={{ marginTop: space.sm }}>
                <DateTimeField value={followUpAt} onChange={setFollowUpAt} />
              </View>
            )}
          </Field>
        )}

        <ErrorText text={error} />
        <Button title={scheduling ? "Schedule" : "Save"} onPress={() => void save()} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
