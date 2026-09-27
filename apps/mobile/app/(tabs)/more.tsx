import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/AppText";
import { Avatar } from "@/components/Photo";
import { Card, ErrorText } from "@/components/ui";
import { API_URL, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { choosePhoto, PhotoError } from "@/lib/photos";
import { colors, radius, shadow, space } from "@/theme";

const WEB_DASHBOARD = "https://digitel.touch4bill.com/dashboard";

/** Profile & settings (mockup screen 16). */
export default function MoreScreen() {
  const { me, signOut, saveProfile } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;
  const name = me.user.name ?? me.user.email;

  async function changePhoto() {
    setError(null);
    try {
      const picked = await choosePhoto({
        aspect: [1, 1],
        canRemove: !!me?.user.avatarUrl,
        title: "Profile photo",
        onUploadStart: () => setUploading(true),
      });
      if (picked === undefined) return;
      setUploading(true);
      await saveProfile({ avatarUrl: picked });
    } catch (err) {
      const message = err instanceof PhotoError || err instanceof ApiError ? err.message : "Couldn't update your photo";
      if (Platform.OS === "web") setError(message);
      else Alert.alert("Photo not saved", message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
      <Card style={{ alignItems: "center", paddingVertical: space.xl }}>
        <Pressable onPress={() => void changePhoto()} accessibilityLabel="Change profile photo" disabled={uploading}>
          <View style={styles.avatarRing}>
            <Avatar name={name} url={me.user.avatarUrl} size={96} />
            {uploading && (
              <View style={styles.avatarBusy}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
          </View>
          <View style={styles.cameraBadge}>
            <Ionicons name="camera" size={16} color="#fff" />
          </View>
        </Pressable>
        <Text style={styles.name}>{name}</Text>
        <Text style={[styles.muted, { textTransform: "capitalize" }]}>
          {me.role} · {me.tenant.name}
        </Text>
        <Text style={[styles.muted, { marginTop: 2 }]}>{me.user.email}</Text>
      </Card>
      <ErrorText text={error} />

      <Card style={{ paddingVertical: 0 }}>
        <Row icon="camera-outline" label={me.user.avatarUrl ? "Change profile photo" : "Add profile photo"} onPress={() => void changePhoto()} />
        <Row icon="desktop-outline" label="Open web dashboard" onPress={() => void Linking.openURL(WEB_DASHBOARD)} />
        <Row icon="log-out-outline" label="Log out" danger last onPress={() => void signOut()} />
      </Card>

      <Text style={[styles.muted, { textAlign: "center" }]}>
        Digitell {Constants.expoConfig?.version ?? ""} · {API_URL.replace(/^https?:\/\//, "")}
      </Text>
    </ScrollView>
  );
}

function Row({
  icon,
  label,
  onPress,
  danger,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && { opacity: 0.7 }]}>
      <View style={[styles.rowIcon, danger && { backgroundColor: colors.dangerSoft }]}>
        <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.brandDark} />
      </View>
      <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
      {!danger && <Ionicons name="chevron-forward" size={18} color={colors.faint} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatarRing: { padding: 4, borderRadius: radius.pill, backgroundColor: colors.surface, ...shadow },
  avatarBusy: {
    position: "absolute",
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderRadius: radius.pill,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraBadge: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brand,
    borderWidth: 3,
    borderColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 20, fontWeight: "700", color: colors.ink, marginTop: space.md },
  muted: { fontSize: 13, color: colors.muted },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 14 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: "500", color: colors.ink },
});
