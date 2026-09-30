import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, Tabs } from "expo-router";
import { Platform, Pressable, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brandShadow, colors } from "@/theme";
import { INTER } from "@/components/AppText";
import { useAccess } from "@/lib/access";

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
  const insets = useSafeAreaInsets();
  const access = useAccess();
  // Tabs the role doesn't include are hidden (href: null) rather than removed, so routes stay valid.
  const showLeads = access.canView("leads");
  const showFollowUps = access.canView("follow_ups");
  const canAdd = access.canEditAny(["leads", "follow_ups", "visits", "quotations", "payments"]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabelStyle: { fontSize: 11, fontFamily: INTER.semibold },
        tabBarStyle: {
          // Keep the tab actions above Android's gesture/navigation area.
          height: 58 + Math.max(insets.bottom, 10),
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 10),
          borderTopWidth: 0,
          backgroundColor: colors.surface,
          shadowColor: "#0F172A",
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -2 },
          elevation: 12,
        },
        tabBarHideOnKeyboard: false,
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: INTER.bold, fontSize: 20, color: colors.ink },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", headerShown: false, tabBarIcon: tabIcon("home-outline", "home") }} />
      <Tabs.Screen
        name="leads"
        options={{
          title: "Leads",
          href: showLeads ? undefined : null,
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
      <Tabs.Screen
        name="new"
        options={canAdd ? { title: "", tabBarButton: () => <QuickAddButton /> } : { title: "", href: null }}
      />
      <Tabs.Screen
        name="follow-ups"
        options={{
          title: "Follow-ups",
          href: showFollowUps ? undefined : null,
          tabBarIcon: tabIcon("calendar-outline", "calendar"),
        }}
      />
      <Tabs.Screen name="more" options={{ title: "Profile", tabBarIcon: tabIcon("person-circle-outline", "person-circle") }} />
    </Tabs>
  );
}
