import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { LEAD_STATUS_LABELS, formatDistance } from "@starpos-crm/shared";
import { Text } from "@/components/AppText";
import { NearbyMap } from "@/components/MapViews";
import { LeadThumb } from "@/components/Photo";
import { Button, ErrorText, Loading } from "@/components/ui";
import { ApiError, listActivities, listNearbyLeads, type NearbyLead } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { openDialer, openMaps } from "@/lib/format";
import { currentFix, LocationError, type Fix } from "@/lib/location";
import { colors, radius, shadow, space, STAGE_COLORS } from "@/theme";

type Filter = "all" | "mine" | "hot" | "toVisit";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mine", label: "My Leads" },
  { key: "hot", label: "Hot" },
  { key: "toVisit", label: "To Visit" },
];

/** Nearby leads on a map (mockup screen 6), within 5 km of the rep. */
export default function MapScreen() {
  const { me } = useAuth();
  const [fix, setFix] = useState<Fix | null>(null);
  const [leads, setLeads] = useState<NearbyLead[] | null>(null);
  /** Leads with a visit scheduled for this rep — the "To Visit" filter. */
  const [toVisit, setToVisit] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const here = await currentFix();
      setFix(here);
      const [rows, visits] = await Promise.all([
        listNearbyLeads({ latitude: here.latitude, longitude: here.longitude, radiusKm: 5 }),
        listActivities({ owner: "me", status: "scheduled", type: "visit" }).catch(() => []),
      ]);
      setLeads(rows);
      setToVisit(new Set(visits.map((v) => v.leadId)));
      setSelectedId(rows[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof LocationError || err instanceof ApiError ? err.message : "Could not load nearby leads");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      (leads ?? []).filter((l) =>
        filter === "all"
          ? true
          : filter === "mine"
            ? l.ownerUserId === me?.user.id
            : filter === "hot"
              ? l.isHot
              : toVisit.has(l.id),
      ),
    [leads, filter, me, toVisit],
  );
  const selected = visible.find((l) => l.id === selectedId) ?? visible[0] ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: "Nearby Leads" }} />
      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.pill, filter === f.key && styles.pillActive]}
              accessibilityState={{ selected: filter === f.key }}
            >
              <Text style={[styles.pillText, filter === f.key && { color: "#fff" }]}>{f.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <ErrorText text={error} />
      {!fix || !leads ? (
        error ? (
          <View style={{ padding: space.lg }}>
            <Button title="Try again" variant="secondary" onPress={() => void load()} />
          </View>
        ) : (
          <Loading />
        )
      ) : (
        <View style={{ flex: 1 }}>
          <NearbyMap
            here={fix}
            leads={visible.map((l) => ({
              id: l.id,
              title: l.company || l.name,
              hot: l.isHot,
              latitude: l.latitude!,
              longitude: l.longitude!,
            }))}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
          />

          <View style={styles.sheet}>
            {selected ? (
              <>
                <Pressable onPress={() => router.push(`/lead/${selected.id}`)} style={styles.leadRow}>
                  <LeadThumb url={selected.imageUrl} size={52} radius={12} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {selected.company || selected.name}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {formatDistance(selected.distanceMeters)} ·{" "}
                      <Text style={{ color: STAGE_COLORS[selected.status].fg, fontWeight: "600" }}>
                        {LEAD_STATUS_LABELS[selected.status]}
                      </Text>
                      {selected.isHot ? <Text style={{ color: colors.danger, fontWeight: "600" }}> · Hot</Text> : null}
                    </Text>
                  </View>
                </Pressable>
                <View style={styles.actions}>
                  <RoundAction
                    icon="call"
                    label="Call"
                    color={colors.brand}
                    disabled={!selected.phone}
                    onPress={() => void openDialer(selected.phone!)}
                  />
                  <RoundAction icon="navigate" label="Directions" color={colors.info} onPress={() => void openMaps(selected)} />
                  <RoundAction icon="eye" label="View" color={colors.violet} onPress={() => router.push(`/lead/${selected.id}`)} />
                </View>
              </>
            ) : (
              <Text style={styles.meta}>
                {filter === "toVisit"
                  ? "No scheduled visits nearby."
                  : "No leads with a pinned location within 5 km."}
              </Text>
            )}
            <Button title="View List" onPress={() => router.push("/leads")} style={{ marginTop: space.md }} />
          </View>
        </View>
      )}
    </View>
  );
}

function RoundAction({
  icon,
  label,
  color,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [{ alignItems: "center", flex: 1 }, (pressed || disabled) && { opacity: disabled ? 0.35 : 0.7 }]}
    >
      <View style={[styles.actionIcon, { backgroundColor: `${color}1A` }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filters: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    backgroundColor: colors.background,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { fontSize: 13, fontWeight: "600", color: colors.text },
  sheet: {
    position: "absolute",
    left: space.md,
    right: space.md,
    bottom: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    ...shadow,
    elevation: 6,
  },
  leadRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  name: { fontSize: 17, fontWeight: "700", color: colors.ink },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  actions: { flexDirection: "row", marginTop: space.lg },
  actionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 12, fontWeight: "500", color: colors.text, marginTop: 4 },
});
