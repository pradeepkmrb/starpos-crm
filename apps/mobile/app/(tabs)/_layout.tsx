import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, Tabs } from "expo-router";
import { Platform, Pressable, View, type ColorValue } from "react-native";
import { brandShadow, colors } from "@/theme";

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(name: IconName, activeName: IconName) {
  return ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons name={focused ? activeName : name} size={size} color={color} />
  );
}

/** The raised centre button: opens the quick-add sheet instead of a tab. */
function QuickAddButton() {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Quick add"
        onPress={() => {
          if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push("/quick-add");
        }}
        style={({ pressed }) => [
          {
            top: -18,
            width: 58,
            height: 58,
            borderRadius: 29,
            backgroundColor: colors.brand,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 4,
            borderColor: colors.surface,
          },
          brandShadow,
          pressed && { transform: [{ scale: 0.95 }] },
        ]}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarStyle: {
          height: 68,
          paddingTop: 6,
          paddingBottom: 10,
          borderTopWidth: 0,
          backgroundColor: colors.surface,
          shadowColor: "#0F172A",
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -2 },
          elevation: 12,
        },
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: "800", fontSize: 20, color: colors.ink },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", headerShown: false, tabBarIcon: tabIcon("home-outline", "home") }} />
      <Tabs.Screen
        name="leads"
        options={{
          title: "Leads",
          tabBarIcon: tabIcon("people-outline", "people"),
          headerRight: () => (
            <Pressable
              accessibilityLabel="Map of nearby leads"
              onPress={() => router.push("/map")}
              hitSlop={10}
              style={{ marginRight: 16, padding: 8, borderRadius: 12, backgroundColor: colors.brandSoft }}
            >
              <Ionicons name="map" size={20} color={colors.brand} />
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen name="new" options={{ title: "", tabBarButton: () => <QuickAddButton /> }} />
      <Tabs.Screen name="follow-ups" options={{ title: "Follow-ups", tabBarIcon: tabIcon("calendar-outline", "calendar") }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: tabIcon("grid-outline", "grid") }} />
    </Tabs>
  );
}
