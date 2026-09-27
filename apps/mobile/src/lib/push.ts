import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { registerPushDevice, unregisterPushDevice } from "./api";

// Show alerts even while the app is open — a reminder is useless if it's silent
// because the rep happens to be looking at the app.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let registeredToken: string | null = null;

/**
 * Asks for permission (once) and registers this phone for the signed-in user's
 * notifications. Quietly does nothing on simulators, in the browser preview,
 * or if the user says no — push is a nice-to-have, never a blocker.
 */
export async function registerForPush(): Promise<void> {
  if (Platform.OS === "web" || !Device.isDevice) return;

  if (Platform.OS === "android") {
    // Must exist before the permission prompt on Android 13+; the API sends to "default".
    await Notifications.setNotificationChannelAsync("default", {
      name: "Reminders and assignments",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#0170F0",
    });
  }

  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  await registerPushDevice({ token, platform: Platform.OS === "ios" ? "ios" : "android" });
  registeredToken = token;
}

/** On sign-out, so the next person on this phone doesn't get these alerts. */
export async function unregisterForPush(): Promise<void> {
  if (!registeredToken) return;
  const token = registeredToken;
  registeredToken = null;
  await unregisterPushDevice(token).catch(() => undefined);
}

/** The in-app route a tapped notification should open, if it carries one. */
export function routeFromNotification(response: Notifications.NotificationResponse | null | undefined): string | null {
  const url = response?.notification.request.content.data?.url;
  return typeof url === "string" && url.startsWith("/") ? url : null;
}
