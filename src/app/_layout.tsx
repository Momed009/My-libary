import React, { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { ActivityIndicator, View, Platform } from 'react-native';
import { initDatabase } from '@/services/db';
import { initFileSystem } from '@/services/fs';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { PreferencesProvider, usePreferences } from '@/context/PreferencesContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Setup background notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  } as any),
});

function TabLayoutContent() {
  const { colors, colorScheme, t, isReady: preferencesReady } = usePreferences();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function setup() {
      try {
        await initDatabase();
        await initFileSystem();
        
        // Request notifications permissions on boot
        await Notifications.requestPermissionsAsync();

        // Setup Android high priority channel
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
          });
        }
      } catch (error) {
        console.error('Error initializing app:', error);
      } finally {
        setIsReady(true);
      }
    }
    setup();
  }, []);

  if (!isReady || !preferencesReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors?.background || '#ffffff' }}>
        <ActivityIndicator size="large" color="#0A84FF" />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#0A84FF',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopWidth: 0,
          borderTopColor: 'transparent',
          height: 58,
          paddingBottom: 10,
          paddingTop: 0,
          elevation: 0,
          shadowColor: 'transparent',
          shadowOpacity: 0,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          marginTop: 2,
        },
        headerStyle: {
          backgroundColor: colors.background,
          borderBottomWidth: 1,
          borderBottomColor: colorScheme === 'dark' ? '#38383A' : '#E5E5EA',
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tab_library'),
          headerTitle: t('tab_library'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="categories"
        options={{
          title: t('tab_categories'),
          headerTitle: t('tab_categories'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="lending"
        options={{
          title: t('tab_lending'),
          headerTitle: t('lending_title'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          href: null,
          title: t('nav_add_book'),
          headerTitle: t('nav_add_book'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tab_settings'),
          headerTitle: t('settings_title'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PreferencesProvider>
          <TabLayoutContent />
        </PreferencesProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

