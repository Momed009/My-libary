import React, { useEffect, useState, useCallback } from 'react';
import { Tabs } from 'expo-router';
import { ActivityIndicator, View, Platform, AppState, Text, TouchableOpacity } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { initDatabase, getSetting } from '@/services/db';
import { initFileSystem } from '@/services/fs';
import { Ionicons } from '@expo/vector-icons';
import { PreferencesProvider, usePreferences } from '@/context/PreferencesContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';

import AuthScreen from './auth';

// Only load expo-notifications outside of Expo Go
let Notifications: typeof import('expo-notifications') | null = null;
const isExpoGo = Constants.appOwnership === 'expo';
if (!isExpoGo) {
  try {
    Notifications = require('expo-notifications');
    Notifications?.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      } as any),
    });
  } catch (e) {
    console.warn('expo-notifications not available:', e);
  }
}



function AppContent() {
  const { colors, colorScheme, t, language, isReady: preferencesReady } = usePreferences();
  const { user, isLoading: authLoading, authSkipped, setAuthSkipped } = useAuth();
  const insets = useSafeAreaInsets();
  const [isReady, setIsReady] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const handleUnlock = useCallback(async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('biometric_auth_prompt'),
        fallbackLabel: t('cancel'),
        disableDeviceFallback: false,
      });
      if (result.success) {
        setIsLocked(false);
      }
    } catch (error) {
      console.error('Unlock error:', error);
    }
  }, [t]);

  useEffect(() => {
    if (isLocked) {
      handleUnlock();
    }
  }, [isLocked, handleUnlock]);

  useEffect(() => {
    async function setup() {
      try {
        await initDatabase();
        await initFileSystem();

        // Check if biometric lock is enabled
        const bioLock = await getSetting('biometric_lock', 'false');
        if (bioLock === 'true') {
          setIsLocked(true);
        }
        
        // Setup notifications only if the module loaded successfully
        if (Notifications) {
          try {
            await Notifications.requestPermissionsAsync();

            if (Platform.OS === 'android') {
              await Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#FF231F7C',
              });
            }
          } catch (notifError) {
            console.warn('Notifications setup failed:', notifError);
          }
        }
      } catch (error) {
        console.error('Error initializing app:', error);
      } finally {
        setIsReady(true);
      }
    }
    setup();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active') {
        const bioLock = await getSetting('biometric_lock', 'false');
        if (bioLock === 'true') {
          setIsLocked(true);
        }
      }
    });
    return () => subscription.remove();
  }, []);

  const handleSkipAuth = async () => {
    try {
      await setAuthSkipped(true);
    } catch (error) {
      console.error('Error skipping auth:', error);
    }
  };

  if (!isReady || !preferencesReady || authLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors?.background || '#ffffff' }}>
        <ActivityIndicator size="large" color="#0A84FF" />
      </View>
    );
  }

  if (isLocked) {
    return (
      <View style={{
        flex: 1,
        backgroundColor: colors?.background || '#ffffff',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
      }}>
        <Ionicons name="lock-closed" size={80} color="#0A84FF" style={{ marginBottom: 24 }} />
        <Text style={{
          fontSize: 22,
          fontWeight: 'bold',
          color: colors?.text || '#000000',
          marginBottom: 8,
          textAlign: 'center'
        }}>
          {t('biometric_auth_prompt')}
        </Text>
        <Text style={{
          fontSize: 14,
          color: colors?.textSecondary || '#8E8E93',
          marginBottom: 40,
          textAlign: 'center'
        }}>
          {language === 'tr' ? 'Güvenliğiniz için lütfen doğrulama yapın.' : language === 'ar' ? 'يرجى المصادقة من أجل سلامتك.' : 'Please authenticate for your security.'}
        </Text>
        
        <TouchableOpacity 
          style={{
            backgroundColor: '#0A84FF',
            paddingVertical: 14,
            paddingHorizontal: 28,
            borderRadius: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
          onPress={handleUnlock}
        >
          <Ionicons name="finger-print" size={20} color="#FFF" />
          <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 16 }}>
            {language === 'tr' ? 'Doğrula' : language === 'ar' ? 'تحقق' : 'Authenticate'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Show auth screen if user is not logged in AND hasn't skipped
  if (!user && !authSkipped) {
    return <AuthScreen onSkip={handleSkipAuth} />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#0A84FF',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: {
          backgroundColor: colors?.background || '#ffffff',
          borderTopWidth: 0,
          borderTopColor: 'transparent',
          height: 58 + insets.bottom,
          paddingBottom: 10 + insets.bottom,
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
          backgroundColor: colors?.background || '#ffffff',
          borderBottomWidth: 1,
          borderBottomColor: colorScheme === 'dark' ? '#38383A' : '#E5E5EA',
        },
        headerTintColor: colors?.text || '#000000',
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
      <Tabs.Screen
        name="auth"
        options={{
          href: null,
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
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </PreferencesProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
