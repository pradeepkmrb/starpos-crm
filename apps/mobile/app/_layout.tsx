import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Loading } from "@/components/ui";
import { AuthProvider, useAuth } from "@/lib/auth";
import { colors } from "@/theme";

function RootNavigator() {
  const { loading, me } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}>
        <Loading />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.ink,
        headerTitleStyle: { fontWeight: "800" },
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {/* Signed-in screens; signing out drops back to login automatically. */}
      <Stack.Protected guard={!!me}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="lead/[id]" options={{ title: "Lead" }} />
        <Stack.Screen name="lead/edit" options={{ title: "Lead", presentation: "modal" }} />
        <Stack.Screen name="activity/new" options={{ title: "Log activity", presentation: "modal" }} />
        <Stack.Screen name="visit/check-in" options={{ title: "Check in" }} />
        <Stack.Screen name="visit/[id]" options={{ title: "Visit in progress" }} />
        <Stack.Screen name="map" options={{ title: "Nearby leads" }} />
        <Stack.Screen name="quotation/new" options={{ title: "New quotation", presentation: "modal" }} />
        <Stack.Screen name="quotation/[id]" options={{ title: "Quotation" }} />
        <Stack.Screen name="payment/new" options={{ title: "Record payment", presentation: "modal" }} />
        <Stack.Screen
          name="quick-add"
          options={{ presentation: "transparentModal", animation: "fade", headerShown: false }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!me}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
