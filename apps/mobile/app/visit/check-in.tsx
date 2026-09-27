import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { VISIT_CHECK_IN_RADIUS_METERS, VISIT_PURPOSES, distanceMeters, formatDistance } from "@digitel/shared";
import { CheckInMap } from "@/components/MapViews";
import { LeadThumb } from "@/components/Photo";
import { Button, Card, Chip, ChipRow, ErrorText, Field, Loading } from "@/components/ui";
import { ApiError, checkIn, getLead, type Lead } from "@/lib/api";
import { currentFix, LocationError, type Fix } from "@/lib/location";
import { success, warn } from "@/lib/haptics";
import { colors, radius, shadow, space } from "@/theme";

/**
 * Check-in (mockup screen 9). The distance shown here is a preview — the
 * server makes the real decision from the same coordinates.
 */
export default function CheckInScreen() {
  const { leadId, activityId } = useLocalSearchParams<{ leadId: string; activityId?: string }>();
  const [lead, setLead] = useState<Lead | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(true);
  const [purpose, setPurpose] = useState<string>(VISIT_PURPOSES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openVisitId, setOpenVisitId] = useState<string | null>(null);

  const locate = useCallback(async () => {
    setLocating(true);
    setError(null);
    try {
      setFix(await currentFix());
    } catch (err) {
      setError(err instanceof LocationError ? err.message : "Couldn't get your location");
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    getLead(leadId)
      .then(setLead)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this lead"));
    void locate();
  }, [leadId, locate]);

  const leadPoint =
    lead && lead.latitude !== null && lead.longitude !== null
      ? { latitude: lead.latitude, longitude: lead.longitude }
      : null;
  const distance = leadPoint && fix ? Math.round(distanceMeters(leadPoint, fix)) : null;
  const withinRadius = distance === null || distance <= VISIT_CHECK_IN_RADIUS_METERS;

  // One banner state, so "no fix yet" can never read as "close enough".
  const banner: { tone: keyof typeof BANNER_TONES; icon: keyof typeof Ionicons.glyphMap; text: string } = locating
    ? { tone: "neutral", icon: "locate", text: "Finding your location…" }
    : !fix
      ? { tone: "bad", icon: "alert-circle", text: "Location not available" }
      : distance === null
        ? { tone: "info", icon: "pin", text: "First visit — checking in will pin this lead's location here" }
        : withinRadius
          ? { tone: "good", icon: "shield-checkmark", text: `You are within ${formatDistance(distance)}` }
          : {
              tone: "bad",
              icon: "alert-circle",
              text: `You are ${formatDistance(distance)} away. Get within ${VISIT_CHECK_IN_RADIUS_METERS} m to check in.`,
            };
  const tone = BANNER_TONES[banner.tone];

  async function onCheckIn() {
    if (!fix) return;
    setBusy(true);
    setError(null);
    try {
      const visit = await checkIn({
        leadId,
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracyMeters: fix.accuracy !== null ? Math.round(fix.accuracy) : undefined,
        activityId: activityId || undefined,
        title: purpose,
      });
      success();
      router.replace(`/visit/${visit.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && typeof err.details.activeVisitId === "string") {
        setOpenVisitId(err.details.activeVisitId);
      }
      warn();
      setError(err instanceof ApiError ? err.message : "Could not check in");
    } finally {
      setBusy(false);
    }
  }

  if (!lead) return error ? <ErrorText text={error} /> : <Loading />;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
      <Stack.Screen options={{ title: "Check in" }} />

      <View>
        <CheckInMap lead={leadPoint} here={fix} style={styles.map} />
        <View style={[styles.banner, { backgroundColor: tone.bg }]}>
          <Ionicons name={banner.icon} size={18} color={tone.fg} />
          <Text style={[styles.bannerText, { color: tone.fg }]}>{banner.text}</Text>
        </View>
        <Pressable
          accessibilityLabel="Refresh location"
          onPress={() => void locate()}
          disabled={locating}
          style={styles.recenter}
        >
          <Ionicons name="locate" size={20} color={colors.ink} />
        </Pressable>
      </View>

      <View style={{ padding: space.lg, gap: space.md }}>
        {fix?.accuracy ? <Text style={styles.muted}>GPS accuracy ±{Math.round(fix.accuracy)} m</Text> : null}

        <Card style={styles.leadCard}>
          <LeadThumb url={lead.imageUrl} size={56} radius={12} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {lead.company || lead.name}
            </Text>
            {lead.address ? (
              <Text style={styles.muted} numberOfLines={2}>
                {lead.address}
              </Text>
            ) : null}
          </View>
        </Card>

        <Field label="Purpose">
          <ChipRow>
            {VISIT_PURPOSES.map((p) => (
              <Chip key={p} label={p} active={purpose === p} onPress={() => setPurpose(p)} />
            ))}
          </ChipRow>
        </Field>

        <ErrorText text={error} />
        {openVisitId ? (
          <Button title="Go to my open visit" variant="secondary" onPress={() => router.replace(`/visit/${openVisitId}`)} />
        ) : null}
        <Button
          title="Check In"
          onPress={() => void onCheckIn()}
          loading={busy}
          disabled={!fix || locating || !withinRadius}
        />
      </View>
    </ScrollView>
  );
}

const BANNER_TONES = {
  neutral: { fg: colors.muted, bg: colors.background },
  info: { fg: colors.brandDark, bg: colors.brandSoft },
  good: { fg: colors.success, bg: colors.successSoft },
  bad: { fg: colors.danger, bg: colors.dangerSoft },
};

const styles = StyleSheet.create({
  map: { height: 300, borderRadius: 0 },
  banner: {
    position: "absolute",
    top: space.md,
    left: space.lg,
    right: space.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: 10,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    ...shadow,
  },
  bannerText: { flex: 1, fontWeight: "600", fontSize: 13 },
  recenter: {
    position: "absolute",
    right: space.lg,
    bottom: space.md,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadow,
  },
  leadCard: { flexDirection: "row", alignItems: "center", gap: space.md },
  name: { fontSize: 18, fontWeight: "700", color: colors.ink },
  muted: { fontSize: 13, color: colors.muted, marginTop: 2 },
});
