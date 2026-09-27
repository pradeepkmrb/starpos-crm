import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Text } from "@/components/AppText";
import { mediaUrl } from "@/lib/api";
import { colors } from "@/theme";

/** A round profile photo, or the person's initial on the brand gradient. */
export function Avatar({ name, url, size = 48 }: { name: string; url?: string | null; size?: number }) {
  const uri = mediaUrl(url);
  const shape = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={[shape, { backgroundColor: colors.border }]} />;
  return (
    <LinearGradient colors={["#34D399", "#047857"]} style={[shape, styles.center]}>
      <Text style={{ fontSize: size * 0.42, fontWeight: "800", color: "#fff" }}>{(name.trim().charAt(0) || "?").toUpperCase()}</Text>
    </LinearGradient>
  );
}

/** A lead's storefront photo as a rounded thumbnail, or a shop icon when there isn't one. */
export function LeadThumb({
  url,
  size = 56,
  radius = 14,
  style,
}: {
  url?: string | null;
  size?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const uri = mediaUrl(url);
  const shape = { width: size, height: size, borderRadius: radius };
  if (uri) return <Image source={{ uri }} style={[shape, { backgroundColor: colors.border }, style as object]} />;
  return (
    <View style={[shape, styles.center, { backgroundColor: colors.brandSoft }, style]}>
      <Ionicons name="storefront-outline" size={size * 0.44} color={colors.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
});
