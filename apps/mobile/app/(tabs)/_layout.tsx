import { Ionicons } from "@expo/vector-icons";
import { router, Tabs } from "expo-router";
import { Pressable } from "react-native";
import type { ColorValue } from "react-native";
import { colors } from "@/theme";

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} size={size} color={color} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.faint,
        headerTitleStyle: { fontWeight: "700", color: colors.ink },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", headerShown: false, tabBarIcon: tabIcon("home-outline") }} />
      <Tabs.Screen
        name="leads"
        options={{
          title: "Leads",
          tabBarIcon: tabIcon("people-outline"),
          headerRight: () => (
            <Pressable accessibilityLabel="Map of nearby leads" onPress={() => router.push("/map")} hitSlop={10} style={{ marginRight: 16 }}>
              <Ionicons name="map-outline" size={22} color={colors.brand} />
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen name="follow-ups" options={{ title: "Follow-ups", tabBarIcon: tabIcon("calendar-outline") }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: tabIcon("menu-outline") }} />
    </Tabs>
  );
}
