import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { Badge, Chip, ChipRow, EmptyState, ErrorText, Input, Loading, StageBadge } from "@/components/ui";
import { ApiError, listLeads, type Lead } from "@/lib/api";
import { formatRupees, openDialer } from "@/lib/format";
import { colors, radius, space } from "@/theme";

type Filter = "all" | "mine" | "hot";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mine", label: "My leads" },
  { key: "hot", label: "Hot" },
];

export default function LeadsScreen() {
  const [filter, setFilter] = useState<Filter>("mine");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Search on the server, but only once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    try {
      setLeads(
        await listLeads({
          owner: filter === "mine" ? "me" : undefined,
          hot: filter === "hot",
          q: query || undefined,
        }),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load leads");
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
          contentContainerStyle={{ padding: space.lg, paddingBottom: 96, gap: space.sm }}
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
                    : "No leads match."
              }
            />
          }
          renderItem={({ item }) => <LeadCard lead={item} />}
        />
      )}
      <Pressable
        accessibilityLabel="Add lead"
        onPress={() => router.push("/lead/edit")}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>
    </View>
  );
}

function LeadCard({ lead }: { lead: Lead }) {
  const subtitle = [lead.company !== lead.name ? lead.company : null, lead.address].filter(Boolean).join(" · ");
  return (
    <Pressable
      onPress={() => router.push(`/lead/${lead.id}`)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.initial}>
        <Text style={styles.initialText}>{lead.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.name} numberOfLines={1}>
          {lead.name}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap", alignItems: "center" }}>
          <StageBadge status={lead.status} />
          {lead.isHot && <Badge label="Hot" fg={colors.danger} bg={colors.dangerSoft} />}
          {lead.valuePaise ? <Text style={styles.value}>{formatRupees(lead.valuePaise)}</Text> : null}
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
    padding: space.lg,
    paddingBottom: space.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
  },
  initial: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  initialText: { fontSize: 18, fontWeight: "700", color: colors.brand },
  name: { fontSize: 16, fontWeight: "700", color: colors.ink },
  subtitle: { fontSize: 13, color: colors.muted },
  value: { fontSize: 13, fontWeight: "600", color: colors.text, marginLeft: space.xs },
  callButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
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
  },
});
