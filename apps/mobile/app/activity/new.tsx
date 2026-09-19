import { useEffect, useRef, useState } from "react";
import { AppState, KeyboardAvoidingView, Platform, ScrollView, Switch, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  CALL_OUTCOMES,
  DEMO_MODES,
  VISIT_PURPOSES,
  type ActivityType,
} from "@digitel/shared";
import { DateTimeField } from "@/components/DateTimeField";
import { Button, Chip, ChipRow, ErrorText, Field, Input } from "@/components/ui";
import { ApiError, createActivity, updateActivity } from "@/lib/api";
import { success } from "@/lib/haptics";
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
  const params = useLocalSearchParams<{
    leadId: string;
    type?: string;
    mode?: string;
    completes?: string;
    /** Set when opened by the Call button: when the dialer was launched (ms). */
    callStartedAt?: string;
  }>();
  const completing = params.completes ?? null;
  const [type, setType] = useState<ActivityType>(isActivityType(params.type) ? params.type : "call");
  const [schedule, setSchedule] = useState(!completing && params.mode === "schedule");
  const [when, setWhen] = useState<Date | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState(false);
  const [followUpAt, setFollowUpAt] = useState<Date | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [callSeconds, setCallSeconds] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The app can't see the call itself, so its length is estimated as the time
  // between opening the dialer and coming back to the app.
  const leftForCall = useRef(false);
  useEffect(() => {
    const startedAt = Number(params.callStartedAt);
    if (!Number.isFinite(startedAt) || startedAt <= 0) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") leftForCall.current = true;
      if (state === "active" && leftForCall.current) {
        leftForCall.current = false;
        setCallSeconds(Math.max(0, Math.round((Date.now() - startedAt) / 1000)));
      }
    });
    return () => sub.remove();
  }, [params.callStartedAt]);

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
          title: kind,
          durationSeconds: type === "call" && !scheduling ? callSeconds : null,
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
      success();
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
                <Chip
                  key={t}
                  label={ACTIVITY_TYPE_LABELS[t]}
                  active={type === t}
                  onPress={() => {
                    setType(t);
                    setKind(null);
                  }}
                />
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

        {(type === "demo" || type === "visit") && !completing && (
          <Field label={type === "demo" ? "Demo type" : "Visit type"}>
            <ChipRow>
              {(type === "demo" ? DEMO_MODES : VISIT_PURPOSES).map((k) => (
                <Chip key={k} label={k} active={kind === k} onPress={() => setKind(kind === k ? null : k)} />
              ))}
            </ChipRow>
          </Field>
        )}

        {type === "call" && callSeconds !== null && !scheduling && (
          <Text style={{ color: colors.muted, marginBottom: space.md }}>
            Call length (estimated): {Math.floor(callSeconds / 60)} min {callSeconds % 60} s
          </Text>
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
