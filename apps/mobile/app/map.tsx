import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, Stack } from "expo-router";
import { formatDistance } from "@digitel/shared";
import { NearbyMap } from "@/components/MapViews";
import { Badge, Button, Chip, ChipRow, ErrorText, Loading, StageBadge } from "@/components/ui";
import { ApiError, listNearbyLeads, type NearbyLead } from "@/lib/api";
import { openDialer, openMaps } from "@/lib/format";
import { currentFix, LocationError, type Fix } from "@/lib/location";
import { colors, radius, space } from "@/theme";

type Filter = "all" | "hot";

/** Nearby leads on a map (mockup screen 6), within 5 km of the rep. */
export default function MapScreen() {
  const [fix, setFix] = useState<Fix | null>(null);
  const [leads, setLeads] = useState<NearbyLead[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const here = await currentFix();
      setFix(here);
      const rows = await listNearbyLeads({ latitude: here.latitude, longitude: here.longitude, radiusKm: 5 });
      setLeads(rows);
      setSelectedId(rows[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof LocationError || err instanceof ApiError ? err.message : "Could not load nearby leads");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => (leads ?? []).filter((l) => filter === "all" || l.isHot),
    [leads, filter],
  );
  const selected = visible.find((l) => l.id === selectedId) ?? null;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "Nearby leads" }} />
      <View style={styles.filters}>
        <ChipRow>
          <Chip label="All" active={filter === "all"} onPress={() => setFilter("all")} />
          <Chip label="Hot" active={filter === "hot"} onPress={() => setFilter("hot")} />
        </ChipRow>
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
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          {visible.length === 0 && (
            <View style={styles.sheet}>
              <Text style={styles.muted}>No leads with a pinned location within 5 km.</Text>
            </View>
          )}
          {selected && (
            <View style={styles.sheet}>
              <Text style={styles.name}>{selected.company || selected.name}</Text>
              <View style={{ flexDirection: "row", gap: space.xs, alignItems: "center", marginTop: 4 }}>
                <Text style={styles.muted}>{formatDistance(selected.distanceMeters)}</Text>
                <StageBadge status={selected.status} />
                {selected.isHot && <Badge label="Hot" fg={colors.danger} bg={colors.dangerSoft} />}
              </View>
              <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md }}>
                <Button
                  title="Call"
                  variant="secondary"
                  disabled={!selected.phone}
                  onPress={() => void openDialer(selected.phone!)}
                  style={{ flex: 1 }}
                />
                <Button title="Directions" variant="secondary" onPress={() => void openMaps(selected)} style={{ flex: 1 }} />
                <Button title="View" onPress={() => router.push(`/lead/${selected.id}`)} style={{ flex: 1 }} />
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: {
    padding: space.md,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheet: {
    position: "absolute",
    left: space.md,
    right: space.md,
    bottom: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 4,
  },
  name: { fontSize: 17, fontWeight: "700", color: colors.ink },
  muted: { fontSize: 13, color: colors.muted },
});
