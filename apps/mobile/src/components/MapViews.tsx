import { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import MapView, { Circle, Marker } from "react-native-maps";
import { VISIT_CHECK_IN_RADIUS_METERS, type LatLng } from "@digitel/shared";
import { colors } from "@/theme";

// Native maps. MapViews.web.tsx stands in for these in the browser preview,
// where react-native-maps doesn't run.

function regionAround(points: LatLng[]) {
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.005, (maxLat - minLat) * 1.6),
    longitudeDelta: Math.max(0.005, (maxLng - minLng) * 1.6),
  };
}

/** The rep, the lead's pin and the check-in radius around it. */
export function CheckInMap({ lead, here }: { lead: LatLng | null; here: LatLng | null }) {
  const points = [lead, here].filter((p): p is LatLng => p !== null);
  if (points.length === 0) return null;
  return (
    <MapView style={styles.checkIn} region={regionAround(points)} showsUserLocation>
      {lead && (
        <>
          <Marker coordinate={lead} pinColor={colors.danger} title="Lead" />
          <Circle
            center={lead}
            radius={VISIT_CHECK_IN_RADIUS_METERS}
            strokeColor={colors.brand}
            fillColor="rgba(18,140,126,0.12)"
          />
        </>
      )}
    </MapView>
  );
}

export interface MapLead {
  id: string;
  title: string;
  hot: boolean;
  latitude: number;
  longitude: number;
}

/** Leads around the rep; tapping a pin selects it. */
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
  const ref = useRef<MapView>(null);
  const selected = leads.find((l) => l.id === selectedId);

  useEffect(() => {
    if (selected) ref.current?.animateToRegion({ ...selected, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 300);
  }, [selected]);

  return (
    <MapView ref={ref} style={StyleSheet.absoluteFill} initialRegion={regionAround([here, ...leads.slice(0, 20)])} showsUserLocation>
      {leads.map((lead) => (
        <Marker
          key={lead.id}
          coordinate={lead}
          title={lead.title}
          pinColor={lead.id === selectedId ? colors.brand : lead.hot ? colors.danger : colors.info}
          onPress={() => onSelect(lead.id)}
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  checkIn: { height: 220, borderRadius: 12 },
});
