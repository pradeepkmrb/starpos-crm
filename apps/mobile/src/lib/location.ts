import * as Location from "expo-location";
import { Platform } from "react-native";

export interface Fix {
  latitude: number;
  longitude: number;
  /** Metres; null when the platform doesn't say. */
  accuracy: number | null;
}

export class LocationError extends Error {}

/**
 * One fresh GPS fix, asking for permission first. High accuracy because a
 * check-in is judged against a 200 m radius; a coarse fix could put the rep
 * on the wrong side of it.
 */
export async function currentFix(): Promise<Fix> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new LocationError("Location permission is off. Turn it on for Digitell in your phone's settings.");
  }
  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy ?? null,
    };
  } catch {
    throw new LocationError("Couldn't get your location. Check that location services are on and try again.");
  }
}

/** A readable address for a point, or null where the platform can't geocode (e.g. the web preview). */
export async function addressFor(fix: Fix): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude: fix.latitude, longitude: fix.longitude });
    if (!place) return null;
    const parts = [place.name, place.street, place.district, place.city, place.postalCode];
    return [...new Set(parts.filter((p): p is string => !!p && p.trim() !== ""))].join(", ") || null;
  } catch {
    return null;
  }
}
