import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/AppText";
import { distanceMeters, formatDistance, type LatLng } from "@starpos-crm/shared";
import { colors, radius, space } from "@/theme";
import type { MapLead } from "./MapViews";

// Browser-preview stand-ins: react-native-maps has no web build, so these
// show the same information as text. Phones use MapViews.tsx.

export function CheckInMap({ lead, here, style }: { lead: LatLng | null; here: LatLng | null; style?: object }) {
  return (
    <View style={[styles.box, style]}>
      <Text style={styles.text}>
        {here ? `You: ${here.latitude.toFixed(5)}, ${here.longitude.toFixed(5)}` : "Your location: not available yet"}
      </Text>
      <Text style={styles.text}>
        {lead ? `Lead: ${lead.latitude.toFixed(5)}, ${lead.longitude.toFixed(5)}` : "Lead has no location yet"}
      </Text>
      <Text style={styles.muted}>The map shows on the phone app.</Text>
    </View>
  );
}

export function NearbyMap({
  here,
  leads,
  selectedId,
  onSelect,
}: {
  here: LatLng;
  leads: MapLead[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.sm }}>
      <Text style={styles.muted}>The map shows on the phone app; here are the same pins as a list.</Text>
      {leads.map((lead) => (
        <Pressable
          key={lead.id}
          onPress={() => onSelect(lead.id)}
          style={[styles.box, lead.id === selectedId && { borderColor: colors.brand }]}
        >
          <Text style={styles.text}>
            {lead.title} · {formatDistance(distanceMeters(here, lead))}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space.md,
    backgroundColor: colors.surface,
    gap: 4,
  },
  text: { color: colors.ink, fontSize: 14 },
  muted: { color: colors.muted, fontSize: 12 },
});
