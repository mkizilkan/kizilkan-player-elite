import React from "react";
import { Pressable, View } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme/ThemeContext";
import { useTv } from "@/src/store/TvContext";
import { useTVFocus } from "@/src/hooks/useTVFocus";

/**
 * TV'de odaklanabilir sekme düğmesi (v7.4.0)
 * Varsayılan sekme düğmesi Android TV'de odak alamıyordu; bu yüzden
 * kumandayla alt menüye hiç geçilemiyordu.
 */
function TabFocusButton({ isTv, accent, children, onPress, ...rest }: any) {
  const { isFocused, onFocus, onBlur } = useTVFocus();
  return (
    <Pressable
      {...rest}
      onPress={onPress}
      focusable
      onFocus={onFocus}
      onBlur={onBlur}
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
    >
      <View
        style={[
          { flex: 1, alignItems: "center", justifyContent: "center", width: "100%", borderRadius: 10 },
          isTv && isFocused && {
            backgroundColor: accent + "33",
            borderWidth: 3,
            borderColor: accent,
            transform: [{ scale: 1.06 }],
          },
        ]}
      >
        {children}
      </View>
    </Pressable>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isTv } = useTv();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        /**
         * TV SEKME ÇUBUĞU (v7.4.0)
         * SORUN: Kumandayla alt sekmelere (Canlı TV / Arama / Favoriler /
         * Ayarlar) HİÇ geçilemiyordu. Sekme düğmeleri odak alamıyordu.
         * ÇÖZÜM: TV'de sekmeler odaklanabilir yapıldı ve çubuk yükseltildi
         * (kumandayla hedeflemesi kolay olsun, overscan'da kesilmesin).
         */
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          borderTopWidth: isTv ? 2 : 1,
          /**
           * v8.9.2: TV'de 76 -> 58 dp.
           * Gerçek ölçüm: 1080p TV React Native'de 540 dp yükseklik.
           * Sekme çubuğu 76 dp yiyordu; kanal listesine yer kalmıyordu.
           * 58 dp kumandayla hedeflemek için hâlâ fazlasıyla yeterli.
           */
          height: (isTv ? 58 : 60) + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: isTv ? 4 : 6,
        },
        tabBarButton: (props: any) => (
          <TabFocusButton {...props} isTv={isTv} accent={colors.brandPrimary} />
        ),
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.onSurfaceSecondary,
        tabBarLabelStyle: { fontSize: isTv ? 14 : 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Canlı TV",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "tv" : "tv-outline"} size={22} color={color} />
          ),
          tabBarButtonTestID: "tab-live-tv",
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Arama",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "search" : "search-outline"} size={22} color={color} />
          ),
          tabBarButtonTestID: "tab-search",
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: "Favoriler",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "heart" : "heart-outline"} size={22} color={color} />
          ),
          tabBarButtonTestID: "tab-favorites",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Ayarlar",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "settings" : "settings-outline"} size={22} color={color} />
          ),
          tabBarButtonTestID: "tab-settings",
        }}
      />
    </Tabs>
  );
}
