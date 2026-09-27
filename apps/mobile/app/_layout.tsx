import { useEffect } from "react";
import { router, Stack } from "expo-router";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/inter";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Loading } from "@/components/ui";
import { AuthProvider, useAuth } from "@/lib/auth";
import { routeFromNotification } from "@/lib/push";
import { INTER } from "@/components/AppText";
import { colors } from "@/theme";

// Keep the splash up until the fonts and the saved session are ready, so the
// first screen never flashes in the system font or the login form.
void SplashScreen.preventAutoHideAsync();

function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const { loading, me } = useAuth();
  const ready = fontsReady && !loading;
  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  // A tapped notification opens its lead — including the one that launched the app.
  const lastResponse = Notifications.useLastNotificationResponse();
  const signedIn = !!me;
  useEffect(() => {
    const route = routeFromNotification(lastResponse);
    if (!ready || !signedIn || !route) return;
    router.push(route as never);
    void Notifications.clearLastNotificationResponseAsync();
  }, [ready, signedIn, lastResponse]);
  if (!ready) {
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
        headerTitleStyle: { fontFamily: INTER.bold },
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
  // A font that fails to load falls back to the system font rather than blocking the app.
  const [loaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator fontsReady={loaded || !!fontError} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
