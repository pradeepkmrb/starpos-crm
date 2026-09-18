import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.brandDark }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.logo}>
              <Ionicons name="paper-plane" size={30} color={colors.brand} />
            </View>
            <Text style={styles.brand}>Digitel</Text>
            <Text style={styles.tagline}>More leads. More sales.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Sign in</Text>
            <Text style={styles.subtitle}>Use the same email and password as the Digitel dashboard.</Text>
            <Field label="Email">
              <Input
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@company.com"
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
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: space.xl },
  hero: { alignItems: "center", marginBottom: space.xl },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { color: "#fff", fontSize: 32, fontWeight: "800", marginTop: space.md },
  tagline: { color: "#CDEDE8", fontSize: 16, marginTop: space.xs },
  card: { backgroundColor: "#fff", borderRadius: radius.lg, padding: space.xl },
  title: { fontSize: 22, fontWeight: "700", color: colors.ink },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: space.xs, marginBottom: space.lg },
});
