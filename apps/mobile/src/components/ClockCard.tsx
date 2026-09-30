import { useCallback, useEffect, useState } from "react";
import { Alert, ActivityIndicator, Platform, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Text } from "@/components/AppText";
import { Card, ErrorText } from "@/components/ui";
import { ApiError, clockIn, clockOut, getAttendanceToday, type AttendanceToday } from "@/lib/api";
import { currentFix } from "@/lib/location";
import { colors, radius, space } from "@/theme";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** 5025 → "01:23:45" */
function stopwatch(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** 5025 → "1h 23m" */
function duration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function longDate(iso: string | Date) {
  return new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/** Location is a nice-to-have on attendance: never let a slow or denied GPS block clocking. */
async function locationIfQuick() {
  try {
    const fix = await Promise.race([currentFix(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("slow")), 6000))]);
    return { latitude: fix.latitude, longitude: fix.longitude };
  } catch {
    return undefined;
  }
}

/**
 * Clock in for the day from the Profile screen: shows the date, the clock-in
 * time and a running timer while clocked in, and today's total once out.
 */
export function ClockCard() {
  const [today, setToday] = useState<AttendanceToday | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setToday(await getAttendanceToday());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load your attendance");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const open = today?.open ?? null;
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);

  async function run(action: "in" | "out") {
    setBusy(true);
    setError(null);
    try {
      const coords = await locationIfQuick();
      setToday(action === "in" ? await clockIn(coords) : await clockOut(coords));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save — check your connection");
    } finally {
      setBusy(false);
    }
  }

  function confirmOut() {
    if (Platform.OS === "web") {
      void run("out");
      return;
    }
    Alert.alert("Clock out?", "This ends your working time for now.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clock out", style: "destructive", onPress: () => void run("out") },
    ]);
  }

  // Seconds worked today, with the open session counted up to this second.
  const closedSeconds = (today?.sessions ?? []).filter((s) => s.clockOutAt).reduce((sum, s) => sum + s.workedSeconds, 0);
  const runningSeconds = open ? (now - new Date(open.clockInAt).getTime()) / 1000 : 0;
  const lastOut = [...(today?.sessions ?? [])].reverse().find((s) => s.clockOutAt)?.clockOutAt ?? null;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.icon, open ? styles.iconOn : null]}>
          <Ionicons name="time" size={20} color={open ? "#fff" : colors.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{open ? "Clocked in" : "Attendance"}</Text>
          <Text style={styles.muted}>{longDate(open ? open.clockInAt : new Date())}</Text>
        </View>
        {open && <View style={styles.liveDot} />}
      </View>

      {!today ? (
        <ActivityIndicator color={colors.brand} style={{ marginVertical: space.lg }} />
      ) : open ? (
        <>
          <Text style={styles.timer}>{stopwatch(runningSeconds)}</Text>
          <Text style={[styles.muted, styles.center]}>
            Since {clockTime(open.clockInAt)}
            {closedSeconds > 0 ? ` · ${duration(closedSeconds + runningSeconds)} today` : ""}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={confirmOut}
            disabled={busy}
            style={({ pressed }) => [styles.button, styles.outButton, (pressed || busy) && { opacity: 0.7 }]}
          >
            {busy ? <ActivityIndicator color={colors.danger} /> : <Ionicons name="log-out-outline" size={20} color={colors.danger} />}
            <Text style={[styles.buttonText, { color: colors.danger }]}>Clock out</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={[styles.muted, styles.center, { marginVertical: space.md }]}>
            {today.workedSeconds > 0
              ? `Worked ${duration(today.workedSeconds)} today${lastOut ? ` · clocked out at ${clockTime(lastOut)}` : ""}`
              : "You haven't clocked in today."}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void run("in")}
            disabled={busy}
            style={({ pressed }) => [styles.button, styles.inButton, (pressed || busy) && { opacity: 0.8 }]}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="log-in-outline" size={20} color="#fff" />}
            <Text style={[styles.buttonText, { color: "#fff" }]}>{today.workedSeconds > 0 ? "Clock in again" : "Clock in"}</Text>
          </Pressable>
        </>
      )}
      <ErrorText text={error} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  header: { flexDirection: "row", alignItems: "center", gap: space.md },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  iconOn: { backgroundColor: colors.green },
  title: { fontSize: 16, fontWeight: "700", color: colors.ink },
  muted: { fontSize: 13, color: colors.muted },
  center: { textAlign: "center" },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.green },
  timer: {
    fontSize: 40,
    fontWeight: "800",
    color: colors.ink,
    textAlign: "center",
    marginTop: space.md,
    fontVariant: ["tabular-nums"],
    letterSpacing: 1,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    borderRadius: radius.md,
    paddingVertical: 14,
    marginTop: space.md,
  },
  inButton: { backgroundColor: colors.green },
  outButton: { backgroundColor: colors.dangerSoft },
  buttonText: { fontSize: 16, fontWeight: "700" },
});
