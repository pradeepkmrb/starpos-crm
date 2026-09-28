import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/AppText";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Button, ErrorText, Field, Input } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors, radius, space } from "@/theme";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <LinearGradient colors={["#1A63B5", "#034694", "#041A35"]} locations={[0, 0.55, 1]} style={{ flex: 1 }}>
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.logo}>
              <Image source={require("../assets/starpos-logo.webp")} style={styles.logoImage} resizeMode="contain" />
            </View>
            <Text style={styles.brand}>
              StarPOS <Text style={{ color: colors.accent }}>CRM</Text>
            </Text>
            <Text style={styles.tagline}>More leads. More sales. A stronger tomorrow.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Sign in</Text>
            <Text style={styles.subtitle}>Use the same email and password as the StarPOS CRM dashboard.</Text>
            <Field label="Email">
              <Input
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="Email"
              />
            </Field>
            <Field label="Password">
              <Input
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
                placeholder="Password"
                onSubmitEditing={onSubmit}
              />
            </Field>
            <ErrorText text={error} />
            <Button title="Sign in" onPress={onSubmit} loading={busy} disabled={!email.trim() || !password} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: space.xl },
  hero: { alignItems: "center", marginBottom: space.xl },
  logo: {
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  logoImage: { width: 180, height: 60 },
  brand: { color: "#fff", fontSize: 32, fontWeight: "800", marginTop: space.md },
  tagline: { color: "#D8E7F7", fontSize: 15, marginTop: space.xs, textAlign: "center" },
  card: { backgroundColor: "#fff", borderRadius: radius.xl, padding: space.xl },
  title: { fontSize: 24, fontWeight: "800", color: colors.ink },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: space.xs, marginBottom: space.lg },
});
