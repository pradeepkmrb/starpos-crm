import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/ui";
import { API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors, radius, space } from "@/theme";

const WEB_DASHBOARD = "https://digitel.touch4bill.com/dashboard";

export default function MoreScreen() {
  const { me, signOut } = useAuth();
  if (!me) return null;
  const name = me.user.name ?? me.user.email;

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
      <Card style={{ alignItems: "center" }}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.muted}>{me.user.email}</Text>
        <Text style={[styles.muted, { marginTop: space.xs, textTransform: "capitalize" }]}>
          {me.role} · {me.tenant.name}
        </Text>
      </Card>

      <Card style={{ paddingVertical: 0 }}>
        <Row icon="desktop-outline" label="Open web dashboard" onPress={() => void Linking.openURL(WEB_DASHBOARD)} />
        <Row icon="log-out-outline" label="Sign out" danger onPress={() => void signOut()} />
      </Card>

      <Text style={[styles.muted, { textAlign: "center" }]}>
        Digitel {Constants.expoConfig?.version ?? ""} · {API_URL.replace(/^https?:\/\//, "")}
      </Text>
    </ScrollView>
  );
}

function Row({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.text} />
      <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.sm,
  },
  avatarText: { fontSize: 26, fontWeight: "700", color: colors.brand },
  name: { fontSize: 18, fontWeight: "700", color: colors.ink },
  muted: { fontSize: 13, color: colors.muted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { flex: 1, fontSize: 16, color: colors.ink },
});
