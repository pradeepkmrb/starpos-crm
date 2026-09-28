import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { Text } from "@/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { LeadThumb } from "@/components/Photo";
import { Chip, ChipRow, EmptyState, ErrorText, Input, Loading } from "@/components/ui";
import { LEAD_STATUS_LABELS, formatDistance } from "@starpos-crm/shared";
import { ApiError, listLeads, listNearbyLeads, type Lead } from "@/lib/api";
import { currentFix, LocationError } from "@/lib/location";
import { formatRupees, openDialer } from "@/lib/format";
import { colors, radius, shadow, space, STAGE_COLORS } from "@/theme";

type Filter = "all" | "mine" | "hot" | "nearby";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mine", label: "My leads" },
  { key: "hot", label: "Hot" },
  { key: "nearby", label: "Nearby" },
];

export default function LeadsScreen() {
  const [filter, setFilter] = useState<Filter>("mine");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [leads, setLeads] = useState<(Lead & { distanceMeters?: number })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Search on the server, but only once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    try {
      if (filter === "nearby") {
        const here = await currentFix();
        const rows = await listNearbyLeads({ latitude: here.latitude, longitude: here.longitude, radiusKm: 10 });
        const q = query.toLowerCase();
        setLeads(q ? rows.filter((l) => [l.name, l.company, l.phone].some((v) => v?.toLowerCase().includes(q))) : rows);
        setError(null);
        return;
      }
      setLeads(
        await listLeads({
          owner: filter === "mine" ? "me" : undefined,
          hot: filter === "hot",
          q: query || undefined,
        }),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof LocationError ? err.message : "Could not load leads");
    }
  }, [filter, query]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.toolbar}>
        <Input value={search} onChangeText={setSearch} placeholder="Search name, company or number" />
        <View style={{ marginTop: space.sm }}>
          <ChipRow>
            {FILTERS.map((f) => (
              <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />
            ))}
          </ChipRow>
        </View>
      </View>
      <ErrorText text={error} />
      {!leads ? (
        <Loading />
      ) : (
        <FlatList
          data={leads}
          keyExtractor={(lead) => lead.id}
          contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2, gap: space.md }}
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
          ListEmptyComponent={
            <EmptyState
              text={
                filter === "mine"
                  ? "No leads assigned to you yet. Tap + to add one."
                  : filter === "hot"
                    ? "No hot leads."
                    : filter === "nearby"
                      ? "No leads with a pinned location within 10 km. Leads get pinned when you add them with your location or check in there."
                      : "No leads match."
              }
            />
          }
          renderItem={({ item }) => <LeadCard lead={item} />}
        />
      )}
    </View>
  );
}

function LeadCard({ lead }: { lead: Lead & { distanceMeters?: number } }) {
  // Business first, like the web board; the area or contact underneath.
  const title = lead.company || lead.name;
  const subtitle = lead.address || (lead.company ? lead.name : null);
  const stage = STAGE_COLORS[lead.status];
  return (
    <Pressable
      onPress={() => router.push(`/lead/${lead.id}`)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <LeadThumb url={lead.imageUrl} size={64} radius={14} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.name} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          <View style={[styles.stagePill, { backgroundColor: stage.bg }]}>
            <Text style={[styles.stageText, { color: stage.fg }]}>{LEAD_STATUS_LABELS[lead.status]}</Text>
          </View>
          {lead.isHot && (
            <View style={[styles.stagePill, { backgroundColor: colors.dangerSoft }]}>
              <Text style={[styles.stageText, { color: colors.danger }]}>● Hot</Text>
            </View>
          )}
          {lead.distanceMeters !== undefined ? (
            <Text style={styles.meta}>
              <Ionicons name="location-outline" size={12} color={colors.muted} /> {formatDistance(lead.distanceMeters)}
            </Text>
          ) : lead.valuePaise ? (
            <Text style={styles.meta}>{formatRupees(lead.valuePaise)}</Text>
          ) : null}
        </View>
      </View>
      {lead.phone ? (
        <Pressable
          accessibilityLabel={`Call ${lead.name}`}
          hitSlop={8}
          onPress={() => void openDialer(lead.phone!)}
          style={styles.callButton}
        >
          <Ionicons name="call" size={18} color={colors.brand} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    paddingHorizontal: space.lg,
    paddingTop: space.xs,
    paddingBottom: space.sm,
    backgroundColor: colors.background,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    ...shadow,
  },
  name: { fontSize: 16, fontWeight: "700", color: colors.ink },
  subtitle: { fontSize: 13, color: colors.muted },
  metaRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 2 },
  stagePill: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  stageText: { fontSize: 11, fontWeight: "600" },
  meta: { fontSize: 12, fontWeight: "500", color: colors.muted },
  callButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
});
