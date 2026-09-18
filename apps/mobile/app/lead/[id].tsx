import { useCallback, useState } from "react";
import { Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from "@digitel/shared";
import { ActivityRow } from "@/components/ActivityRow";
import { Badge, Button, Card, Chip, ChipRow, EmptyState, ErrorText, Loading, StageBadge } from "@/components/ui";
import {
  ApiError,
  getLead,
  listActivities,
  listLeadFields,
  updateLead,
  type Activity,
  type CustomFieldDefinition,
  type Lead,
} from "@/lib/api";
import { formatDate, formatRupees, openDialer, openMaps, openWhatsApp } from "@/lib/format";
import { colors, radius, space } from "@/theme";

type Tab = "info" | "activity";

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [tab, setTab] = useState<Tab>("info");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [savingStage, setSavingStage] = useState(false);

  const load = useCallback(async () => {
    try {
      const [leadRes, activityRes, fieldRes] = await Promise.all([
        getLead(id),
        listActivities({ leadId: id }),
        listLeadFields().catch(() => [] as CustomFieldDefinition[]),
      ]);
      setLead(leadRes);
      setActivities(activityRes);
      setFields(fieldRes);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this lead");
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function changeStage(status: LeadStatus) {
    if (!lead || status === lead.status) return;
    setSavingStage(true);
    try {
      setLead(await updateLead(lead.id, { status }));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not change the stage";
      if (Platform.OS === "web") setError(message);
      else Alert.alert("Couldn't update", message);
    } finally {
      setSavingStage(false);
    }
  }

  /** Opens the dialer and queues up the call log for when the rep comes back. */
  function callLead() {
    if (!lead?.phone) return;
    void openDialer(lead.phone);
    router.push(`/activity/new?leadId=${lead.id}&type=call`);
  }

  if (!lead) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: "Lead" }} />
        <ErrorText text={error} />
        {!error && <Loading />}
      </View>
    );
  }

  const answers = Object.entries(lead.customFieldsJson ?? {}).filter(([, v]) => v !== "" && v !== null);
  const labelFor = (key: string) => fields.find((f) => f.key === key)?.label ?? key;

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
      <Stack.Screen
        options={{
          title: lead.name,
          headerRight: () => (
            <Pressable onPress={() => router.push(`/lead/edit?id=${lead.id}`)} hitSlop={10}>
              <Text style={{ color: colors.brand, fontWeight: "600", fontSize: 16 }}>Edit</Text>
            </Pressable>
          ),
        }}
      />

      <Card>
        <Text style={styles.name}>{lead.name}</Text>
        {lead.company && lead.company !== lead.name ? <Text style={styles.muted}>{lead.company}</Text> : null}
        <View style={{ flexDirection: "row", gap: space.xs, marginTop: space.sm, flexWrap: "wrap" }}>
          <StageBadge status={lead.status} />
          {lead.isHot && <Badge label="Hot lead" fg={colors.danger} bg={colors.dangerSoft} />}
        </View>
        <View style={styles.actions}>
          <Action icon="call" label="Call" disabled={!lead.phone} onPress={callLead} />
          <Action icon="logo-whatsapp" label="WhatsApp" disabled={!lead.phone} onPress={() => void openWhatsApp(lead.phone!)} />
          <Action
            icon="navigate"
            label="Directions"
            disabled={!lead.address && lead.latitude === null}
            onPress={() => void openMaps(lead)}
          />
          <Action
            icon="add-circle"
            label="Log"
            onPress={() => router.push(`/activity/new?leadId=${lead.id}`)}
          />
        </View>
      </Card>

      <View style={{ marginTop: space.lg }}>
        <ChipRow>
          <Chip label="Info" active={tab === "info"} onPress={() => setTab("info")} />
          <Chip label={`Activity (${activities.length})`} active={tab === "activity"} onPress={() => setTab("activity")} />
        </ChipRow>
      </View>
      <ErrorText text={error} />

      {tab === "info" ? (
        <>
          <Card style={{ marginTop: space.md }}>
            <Text style={styles.sectionLabel}>Stage</Text>
            <ChipRow>
              {LEAD_STATUSES.map((status) => (
                <Chip
                  key={status}
                  label={LEAD_STATUS_LABELS[status]}
                  active={lead.status === status}
                  onPress={() => (savingStage ? undefined : void changeStage(status))}
                />
              ))}
            </ChipRow>
          </Card>

          <Card style={{ marginTop: space.md, gap: space.md }}>
            <InfoRow icon="call-outline" label="Mobile" value={lead.phone} />
            <InfoRow icon="mail-outline" label="Email" value={lead.email} />
            <InfoRow icon="location-outline" label="Address" value={lead.address} />
            <InfoRow icon="cash-outline" label="Expected value" value={lead.valuePaise ? formatRupees(lead.valuePaise) : null} />
            <InfoRow icon="calendar-outline" label="Expected close" value={lead.expectedCloseAt ? formatDate(lead.expectedCloseAt) : null} />
            <InfoRow icon="megaphone-outline" label="Lead source" value={lead.source === "meta_ads" ? "Meta ad" : lead.source} />
            <InfoRow icon="person-outline" label="Owner" value={lead.owner ? (lead.owner.name ?? lead.owner.email) : "Unassigned"} />
            {answers.map(([key, value]) => (
              <InfoRow
                key={key}
                icon="list-outline"
                label={labelFor(key)}
                value={typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
              />
            ))}
            {lead.notes ? <InfoRow icon="document-text-outline" label="Notes" value={lead.notes} /> : null}
          </Card>
        </>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md }}>
            <Button
              title="Log activity"
              onPress={() => router.push(`/activity/new?leadId=${lead.id}`)}
              style={{ flex: 1 }}
            />
            <Button
              title="Schedule"
              variant="secondary"
              onPress={() => router.push(`/activity/new?leadId=${lead.id}&type=follow_up&mode=schedule`)}
              style={{ flex: 1 }}
            />
          </View>
          <Card style={{ marginTop: space.md, paddingVertical: 0 }}>
            {activities.length === 0 ? (
              <EmptyState text="Nothing logged yet." />
            ) : (
              activities.map((activity) => (
                <ActivityRow
                  key={activity.id}
                  activity={activity}
                  showLead={false}
                  onPress={
                    activity.status === "scheduled"
                      ? () => router.push(`/activity/new?leadId=${lead.id}&type=${activity.type}&completes=${activity.id}`)
                      : undefined
                  }
                />
              ))
            )}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

function Action({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.action, (pressed || disabled) && { opacity: disabled ? 0.35 : 0.7 }]}
    >
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={20} color={colors.brand} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function InfoRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string | null }) {
  return (
    <View style={{ flexDirection: "row", gap: space.md }}>
      <Ionicons name={icon} size={18} color={colors.muted} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value || "—"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 22, fontWeight: "800", color: colors.ink },
  muted: { fontSize: 14, color: colors.muted, marginTop: 2 },
  actions: { flexDirection: "row", justifyContent: "space-between", marginTop: space.lg },
  action: { alignItems: "center", flex: 1 },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { fontSize: 12, color: colors.text, marginTop: 4 },
  sectionLabel: { fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: space.sm },
  infoLabel: { fontSize: 12, color: colors.muted },
  infoValue: { fontSize: 15, color: colors.ink, marginTop: 1 },
});
