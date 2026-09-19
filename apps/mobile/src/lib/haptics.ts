import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

// Small physical confirmations on the actions a rep does many times a day.
// No-ops in the browser preview, which has no vibration motor to drive.

export function tap() {
  if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function success() {
  if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function warn() {
  if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}
