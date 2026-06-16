import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  Modal,
  FlatList,
  Image
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { createAndShareBackup, restoreBackup } from '@/services/fs';
import { 
  initDatabase, 
  closeDbConnection, 
  getLibraryStats, 
  LibraryStats,
  getFilteredBooks,
  getActiveLendings,
  Book,
  Lending,
  getSetting,
  setSetting
} from '@/services/db';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { usePreferences } from '@/context/PreferencesContext';
import { useAuth } from '@/context/AuthContext';
import { performFullSync } from '@/services/sync';
import Constants from 'expo-constants';

// Only load expo-notifications outside of Expo Go
let Notifications: typeof import('expo-notifications') | null = null;
const isExpoGo = Constants.appOwnership === 'expo';
if (!isExpoGo) {
  try {
    Notifications = require('expo-notifications');
  } catch (e) {
    console.warn('expo-notifications not available:', e);
  }
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function SettingsScreen() {
  const { theme, setTheme, language, setLanguage, colors, colorScheme, t } = usePreferences();
  const { user, signOut, setAuthSkipped } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [stats, setStats] = useState<LibraryStats | null>(null);

  // Goal & Notification states
  const [yearlyGoal, setYearlyGoal] = useState<number>(12);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(false);
  const [notificationHour, setNotificationHour] = useState<number>(21);
  const [notificationMinute, setNotificationMinute] = useState<number>(30);

  const [showTimePickerModal, setShowTimePickerModal] = useState<boolean>(false);

  // Modal states for stats details list
  const [statsModalVisible, setStatsModalVisible] = useState(false);
  const [statsModalType, setStatsModalType] = useState<'lent' | 'favorites' | 'reading_status'>('favorites');
  const [statsBooks, setStatsBooks] = useState<Book[]>([]);
  const [statsLendings, setStatsLendings] = useState<Lending[]>([]);
  const [statsModalLoading, setStatsModalLoading] = useState(false);
  const [readingStatusTab, setReadingStatusTab] = useState<'reading' | 'read'>('reading');

  const loadStatsListData = async (type: 'lent' | 'favorites' | 'reading_status', currentTab?: 'reading' | 'read') => {
    setStatsModalLoading(true);
    try {
      if (type === 'favorites') {
        const data = await getFilteredBooks({ favorite: true });
        setStatsBooks(data);
      } else if (type === 'lent') {
        const data = await getActiveLendings();
        setStatsLendings(data);
      } else if (type === 'reading_status') {
        const statusToFetch = currentTab || readingStatusTab;
        const data = await getFilteredBooks({ status: statusToFetch });
        setStatsBooks(data);
      }
    } catch (error) {
      console.error('Error loading stats list:', error);
    } finally {
      setStatsModalLoading(false);
    }
  };

  const openStatsModal = (type: 'lent' | 'favorites' | 'reading_status') => {
    setStatsModalType(type);
    setStatsModalVisible(true);
    if (type === 'reading_status') {
      setReadingStatusTab('reading');
      loadStatsListData(type, 'reading');
    } else {
      loadStatsListData(type);
    }
  };

  const handleReadingStatusTabChange = (tab: 'reading' | 'read') => {
    setReadingStatusTab(tab);
    loadStatsListData('reading_status', tab);
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      return date.toLocaleDateString(language === 'tr' ? 'tr-TR' : 'en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  // Load library statistics
  const loadStats = async () => {
    try {
      const data = await getLibraryStats();
      setStats(data);
    } catch (error) {
      console.error('İstatistikler yüklenirken hata:', error);
    }
  };

  const loadGoalAndNotificationSettings = async () => {
    try {
      const goalVal = await getSetting('yearly_goal_2026', '12');
      setYearlyGoal(parseInt(goalVal, 10) || 12);

      const notifEnabledVal = await getSetting('notifications_enabled', 'false');
      setNotificationsEnabled(notifEnabledVal === 'true');

      const notifHourVal = await getSetting('notification_hour', '21');
      setNotificationHour(parseInt(notifHourVal, 10) || 21);

      const notifMinuteVal = await getSetting('notification_minute', '30');
      setNotificationMinute(parseInt(notifMinuteVal, 10) || 30);


    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const handleSaveGoal = async (newGoal: number) => {
    if (newGoal < 1) return;
    setYearlyGoal(newGoal);
    await setSetting('yearly_goal_2026', String(newGoal));
  };

  const handleToggleNotifications = async (value: boolean) => {
    setNotificationsEnabled(value);
    await setSetting('notifications_enabled', String(value));
    await setupNotifications(value, notificationHour, notificationMinute);
  };

  const handleSaveTime = async (hour: number, minute: number) => {
    setNotificationHour(hour);
    setNotificationMinute(minute);
    await setSetting('notification_hour', String(hour));
    await setSetting('notification_minute', String(minute));
    await setupNotifications(notificationsEnabled, hour, minute);
    setShowTimePickerModal(false);
  };

  const setupNotifications = async (enabled: boolean, hour: number, minute: number) => {
    if (!Notifications) {
      console.warn('Notifications not available in Expo Go');
      return;
    }
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      if (enabled) {
        // Check permissions
        const permissionSettings = await Notifications.getPermissionsAsync();
        let granted = permissionSettings.granted || permissionSettings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
        if (!granted) {
          const request = await Notifications.requestPermissionsAsync();
          granted = request.granted;
        }
        
        if (granted) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: t('reminders_notif_title'),
              body: t('reminders_notif_body_generic'),
              sound: true,
              priority: Notifications.AndroidNotificationPriority.MAX,
            },
            trigger: {
              channelId: 'default',
              type: Notifications.SchedulableTriggerInputTypes.DAILY,
              hour: hour,
              minute: minute,
            } as any,
          });
        } else {
          setNotificationsEnabled(false);
          await setSetting('notifications_enabled', 'false');
          Alert.alert(t('error'), 'Bildirim izni verilmediği için hatırlatıcılar kurulamadı.');
        }
      }
    } catch (error) {
      console.error('Error setting up notifications:', error);
    }
  };

  // Reload stats whenever screen is focused
  useFocusEffect(
    useCallback(() => {
      loadStats();
      loadGoalAndNotificationSettings();
    }, [])
  );

  // Handle backup creation
  const handleBackup = async () => {
    setLoadingText(t('settings_backup_loading'));
    setLoading(true);
    try {
      const success = await createAndShareBackup();
      if (success) {
        // Shared successfully
      }
    } catch (error: any) {
      Alert.alert(t('error'), error.message || t('settings_backup_error'));
    } finally {
      setLoading(false);
    }
  };

  // Handle backup restoration
  const handleRestore = async () => {
    Alert.alert(
      t('settings_restore_confirm_title'),
      t('settings_restore_confirm_msg'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('yes'),
          style: 'destructive',
          onPress: async () => {
            setLoadingText(t('settings_restore_loading'));
            setLoading(true);
            try {
              const restored = await restoreBackup();
              if (restored) {
                Alert.alert(
                  t('success'),
                  t('settings_restore_success'),
                  [{ text: t('ok') }]
                );
                loadStats(); // reload stats
              }
            } catch (error: any) {
              Alert.alert(t('error'), error.message || t('settings_restore_error'));
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  // Handle wiping the library (Delete all books)
  const handleWipeLibrary = async () => {
    Alert.alert(
      t('settings_reset_confirm_title'),
      t('settings_reset_confirm_msg'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('yes'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('settings_reset_final_title'),
              t('settings_reset_final_msg'),
              [
                { text: t('cancel'), style: 'cancel' },
                {
                  text: t('settings_reset_btn'),
                  style: 'destructive',
                  onPress: async () => {
                    setLoadingText(t('settings_reset_loading'));
                    setLoading(true);
                    try {
                      await closeDbConnection();
                      
                      // 1. Delete SQLite database file
                      const dbPath = `${FileSystem.documentDirectory}SQLite/kutuphane.db`;
                      const dbInfo = await FileSystem.getInfoAsync(dbPath);
                      if (dbInfo.exists) {
                        await FileSystem.deleteAsync(dbPath, { idempotent: true });
                      }

                      // 2. Delete covers directory
                      const coversDir = `${FileSystem.documentDirectory}book_covers/`;
                      const coversDirInfo = await FileSystem.getInfoAsync(coversDir);
                      if (coversDirInfo.exists) {
                        await FileSystem.deleteAsync(coversDir, { idempotent: true });
                      }

                      // 3. Reinitialize database and filesystem
                      await initDatabase();
                      const persistentCoversDir = `${FileSystem.documentDirectory}book_covers/`;
                      await FileSystem.makeDirectoryAsync(persistentCoversDir, { intermediates: true });

                      Alert.alert(t('success'), t('settings_reset_success'));
                      loadStats(); // reload empty stats
                    } catch (error) {
                      console.error('Reset error:', error);
                      Alert.alert(t('error'), t('settings_reset_error'));
                      try { await initDatabase(); } catch {}
                    } finally {
                      setLoading(false);
                    }
                  }
                }
              ]
            );
          }
        }
      ]
    );
  };

  const handleCloudSync = async () => {
    if (!user) {
      Alert.alert(t('error') || 'Hata', 'Lütfen önce giriş yapın.');
      return;
    }

    setLoading(true);
    setLoadingText(language === 'tr' ? 'Veriler bulutla senkronize ediliyor...' : 'Syncing data with cloud...');
    try {
      const result = await performFullSync(user.id);
      Alert.alert(
        language === 'tr' ? 'Senkronizasyon Başarılı' : 'Sync Successful',
        language === 'tr' 
          ? `Verileriniz bulutla başarıyla eşitlendi.\nGönderilen: ${result.pushed} kayıt\nAlınan: ${result.pulled} kayıt`
          : `Your data was synced successfully.\nPushed: ${result.pushed} records\nPulled: ${result.pulled} records`
      );
      // Refresh stats in case new books were pulled
      await loadStats();
    } catch (error: any) {
      console.error('Sync error:', error);
      Alert.alert(
        language === 'tr' ? 'Senkronizasyon Hatası' : 'Sync Error',
        language === 'tr'
          ? `Eşitleme sırasında bir hata oluştu. Lütfen internet bağlantınızı ve veritabanı ayarlarınızı kontrol edin.\n\nHata: ${error.message || error}`
          : `An error occurred during sync. Please check your connection and database setup.\n\nError: ${error.message || error}`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      language === 'tr' ? 'Çıkış Yap' : 'Log Out',
      language === 'tr' ? 'Hesabınızdan çıkış yapmak istediğinize emin misiniz?' : 'Are you sure you want to log out of your account?',
      [
        { text: language === 'tr' ? 'Vazgeç' : 'Cancel', style: 'cancel' },
        { 
          text: language === 'tr' ? 'Çıkış Yap' : 'Log Out', 
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            setLoadingText(language === 'tr' ? 'Çıkış yapılıyor...' : 'Logging out...');
            try {
              await signOut();
            } catch (error) {
              console.error('Logout error:', error);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleLoginRedirect = async () => {
    await setAuthSkipped(false);
  };

  // Calculate read ratio
  const getReadRatio = () => {
    if (!stats || stats.totalBooks === 0) return 0;
    return Math.round((stats.readCount / stats.totalBooks) * 100);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      
      {/* Loading Overlay */}
      {loading ? (
        <View style={[styles.loadingContainer, { backgroundColor: colorScheme === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)' }]}>
          <ActivityIndicator size="large" color="#0A84FF" />
          <Text style={[styles.loadingText, { color: colors.text }]}>{loadingText}</Text>
        </View>
      ) : null}

      {/* Analytics Dashboard Panel */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('settings_stats_title')}</Text>
      
      <View style={styles.statsGrid}>
        {/* Total Books */}
        <View style={[styles.statsCard, { backgroundColor: colors.backgroundElement }]}>
          <Ionicons name="book-outline" size={22} color="#0A84FF" />
          <Text style={[styles.statsValue, { color: colors.text }]}>{stats?.totalBooks || 0}</Text>
          <Text style={[styles.statsLabel, { color: colors.textSecondary }]}>{t('settings_total_books')}</Text>
        </View>

        {/* Read Ratio */}
        <View style={[styles.statsCard, { backgroundColor: colors.backgroundElement }]}>
          <Ionicons name="ribbon-outline" size={22} color="#34C759" />
          <Text style={[styles.statsValue, { color: colors.text }]}>%{getReadRatio()}</Text>
          <Text style={[styles.statsLabel, { color: colors.textSecondary }]}>{t('settings_read_ratio')}</Text>
        </View>

        {/* Total Pages */}
        <View style={[styles.statsCard, { backgroundColor: colors.backgroundElement }]}>
          <Ionicons name="document-text-outline" size={22} color="#FF9500" />
          <Text style={[styles.statsValue, { color: colors.text }]}>
            {stats?.totalPages ? stats.totalPages.toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US') : 0}
          </Text>
          <Text style={[styles.statsLabel, { color: colors.textSecondary }]}>{t('settings_total_pages')}</Text>
        </View>

        {/* Active Lendings */}
        <TouchableOpacity 
          style={[
            styles.statsCard, 
            styles.interactiveCard, 
            { 
              backgroundColor: colors.backgroundElement, 
              borderColor: colorScheme === 'dark' ? 'rgba(175, 82, 222, 0.35)' : 'rgba(175, 82, 222, 0.2)' 
            }
          ]}
          activeOpacity={0.7}
          onPress={() => openStatsModal('lent')}
        >
          <View style={styles.cardHeaderRow}>
            <Ionicons name="people-outline" size={22} color="#AF52DE" />
            <Ionicons name="chevron-forward" size={14} color="#8E8E93" />
          </View>
          <Text style={[styles.statsValue, { color: colors.text }]}>{stats?.lentCount || 0}</Text>
          <Text style={[styles.statsLabel, { color: colors.textSecondary }]}>{t('settings_lent_books')}</Text>
        </TouchableOpacity>

        {/* Favorite Books */}
        <TouchableOpacity 
          style={[
            styles.statsCard, 
            styles.interactiveCard, 
            { 
              backgroundColor: colors.backgroundElement, 
              borderColor: colorScheme === 'dark' ? 'rgba(255, 214, 10, 0.45)' : 'rgba(255, 214, 10, 0.25)' 
            }
          ]}
          activeOpacity={0.7}
          onPress={() => openStatsModal('favorites')}
        >
          <View style={styles.cardHeaderRow}>
            <Ionicons name="star-outline" size={22} color="#FFD60A" />
            <Ionicons name="chevron-forward" size={14} color="#8E8E93" />
          </View>
          <Text style={[styles.statsValue, { color: colors.text }]}>{stats?.favoriteCount || 0}</Text>
          <Text style={[styles.statsLabel, { color: colors.textSecondary }]}>{t('settings_fav_books')}</Text>
        </TouchableOpacity>

        {/* Reading List Summary */}
        <TouchableOpacity 
          style={[
            styles.statsCard, 
            styles.interactiveCard, 
            { 
              backgroundColor: colors.backgroundElement, 
              borderColor: colorScheme === 'dark' ? 'rgba(88, 86, 214, 0.35)' : 'rgba(88, 86, 214, 0.2)' 
            }
          ]}
          activeOpacity={0.7}
          onPress={() => openStatsModal('reading_status')}
        >
          <View style={styles.cardHeaderRow}>
            <Ionicons name="time-outline" size={22} color="#5856D6" />
            <Ionicons name="chevron-forward" size={14} color="#8E8E93" />
          </View>
          <Text style={[styles.statsValue, { color: colors.text }]}>{stats?.readingCount || 0}</Text>
          <Text style={[styles.statsLabel, { color: colors.textSecondary }]}>{t('settings_reading_books')}</Text>
        </TouchableOpacity>
      </View>

      {/* Preferences Section */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 16 }]}>{t('settings_preferences_title')}</Text>
      
      <View style={[styles.optionsGroup, { backgroundColor: colors.backgroundElement }]}>
        {/* Language Selection */}
        <View style={styles.settingItem}>
          <View style={styles.settingLabelRow}>
            <View style={[styles.optionIconContainer, { backgroundColor: '#AF52DE' }]}>
              <Ionicons name="language" size={20} color="#FFF" />
            </View>
            <Text style={[styles.optionTitle, { color: colors.text, flex: 1 }]}>{t('settings_lang_label')}</Text>
          </View>
          <View style={styles.segmentContainer}>
            <TouchableOpacity 
              style={[styles.segmentBtn, language === 'tr' && styles.segmentBtnActive]} 
              onPress={() => setLanguage('tr')}
            >
              <Text 
                allowFontScaling={false}
                style={[styles.segmentText, language === 'tr' && styles.segmentTextActive]}
              >
                TR
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.segmentBtn, language === 'en' && styles.segmentBtnActive]} 
              onPress={() => setLanguage('en')}
            >
              <Text 
                allowFontScaling={false}
                style={[styles.segmentText, language === 'en' && styles.segmentTextActive]}
              >
                EN
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.separator, { backgroundColor: colorScheme === 'dark' ? '#38383A' : '#E5E5EA' }]} />

        {/* Theme Selection */}
        <View style={styles.settingItem}>
          <View style={styles.settingLabelRow}>
            <View style={[styles.optionIconContainer, { backgroundColor: '#FF9500' }]}>
              <Ionicons name="color-palette" size={20} color="#FFF" />
            </View>
            <Text style={[styles.optionTitle, { color: colors.text, flex: 1 }]}>{t('settings_theme_label')}</Text>
          </View>
          <View style={styles.segmentContainer3}>
            <TouchableOpacity 
              style={[styles.segmentBtn3, theme === 'light' && styles.segmentBtnActive]} 
              onPress={() => setTheme('light')}
            >
              <Text 
                allowFontScaling={false}
                numberOfLines={1} 
                adjustsFontSizeToFit 
                minimumFontScale={0.8}
                style={[styles.segmentText, theme === 'light' && styles.segmentTextActive]}
              >
                {t('settings_theme_light')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.segmentBtn3, theme === 'dark' && styles.segmentBtnActive]} 
              onPress={() => setTheme('dark')}
            >
              <Text 
                allowFontScaling={false}
                numberOfLines={1} 
                adjustsFontSizeToFit 
                minimumFontScale={0.8}
                style={[styles.segmentText, theme === 'dark' && styles.segmentTextActive]}
              >
                {t('settings_theme_dark')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.segmentBtn3, theme === 'system' && styles.segmentBtnActive]} 
              onPress={() => setTheme('system')}
            >
              <Text 
                allowFontScaling={false}
                numberOfLines={1} 
                adjustsFontSizeToFit 
                minimumFontScale={0.8}
                style={[styles.segmentText, theme === 'system' && styles.segmentTextActive]}
              >
                {t('settings_theme_system')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Reading Goals & Reminders Section */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 24 }]}>
        {language === 'tr' ? 'OKUMA HEDEFLERİ & BİLDİRİMLER' : 'READING GOALS & REMINDERS'}
      </Text>
      
      <View style={[styles.optionsGroup, { backgroundColor: colors.backgroundElement }]}>
        {/* Yearly Goal Selector */}
        <View style={styles.settingItem}>
          <View style={styles.settingLabelRow}>
            <View style={[styles.optionIconContainer, { backgroundColor: '#FFD60A' }]}>
              <Ionicons name="trophy" size={20} color="#FFF" />
            </View>
            <Text style={[styles.optionTitle, { color: colors.text, flex: 1 }]}>{t('yearly_goal_title')}</Text>
          </View>
          
          <View style={styles.goalSelectorContainer}>
            <TouchableOpacity 
              style={[styles.goalCounterBtn, { backgroundColor: colorScheme === 'dark' ? '#2C2C2E' : '#E5E5EA' }]}
              onPress={() => handleSaveGoal(yearlyGoal - 1)}
            >
              <Ionicons name="remove" size={16} color={colors.text} />
            </TouchableOpacity>
            
            <Text style={[styles.goalValueText, { color: colors.text }]}>{yearlyGoal}</Text>
            
            <TouchableOpacity 
              style={[styles.goalCounterBtn, { backgroundColor: colorScheme === 'dark' ? '#2C2C2E' : '#E5E5EA' }]}
              onPress={() => handleSaveGoal(yearlyGoal + 1)}
            >
              <Ionicons name="add" size={16} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.separator, { backgroundColor: colorScheme === 'dark' ? '#38383A' : '#E5E5EA' }]} />

        {/* Daily Notification Reminder Switch */}
        <View style={styles.settingItem}>
          <View style={styles.settingLabelRow}>
            <View style={[styles.optionIconContainer, { backgroundColor: '#34C759' }]}>
              <Ionicons name="notifications" size={20} color="#FFF" />
            </View>
            <Text style={[styles.optionTitle, { color: colors.text, flex: 1 }]}>{t('reminders_title')}</Text>
          </View>
          
          <TouchableOpacity 
            style={[
              styles.customSwitchOuter, 
              { backgroundColor: notificationsEnabled ? '#30D158' : (colorScheme === 'dark' ? '#38383A' : '#E5E5EA') }
            ]}
            onPress={() => handleToggleNotifications(!notificationsEnabled)}
            activeOpacity={0.8}
          >
            <View 
              style={[
                styles.customSwitchInner, 
                { 
                  transform: [{ translateX: notificationsEnabled ? 20 : 2 }],
                  backgroundColor: '#FFF'
                }
              ]} 
            />
          </TouchableOpacity>
        </View>

        {notificationsEnabled && (
          <>
            <View style={[styles.separator, { backgroundColor: colorScheme === 'dark' ? '#38383A' : '#E5E5EA' }]} />
            
            {/* Reminder Time Selector Trigger */}
            <View style={styles.settingItem}>
              <View style={styles.settingLabelRow}>
                <View style={[styles.optionIconContainer, { backgroundColor: '#0A84FF' }]}>
                  <Ionicons name="time" size={20} color="#FFF" />
                </View>
                <Text style={[styles.optionTitle, { color: colors.text, flex: 1 }]}>{t('reminders_time_label')}</Text>
              </View>
              
              <TouchableOpacity 
                style={[styles.timePickerTrigger, { backgroundColor: colorScheme === 'dark' ? '#2C2C2E' : '#E5E5EA' }]}
                onPress={() => setShowTimePickerModal(true)}
              >
                <Text style={[styles.timePickerTriggerText, { color: colors.text }]}>
                  {String(notificationHour).padStart(2, '0')}:{String(notificationMinute).padStart(2, '0')}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Cloud Sync & Account Section */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 24 }]}>
        {language === 'tr' ? 'BULUT SENKRONİZASYONU & HESAP' : 'CLOUD SYNC & ACCOUNT'}
      </Text>
      
      <View style={[styles.optionsGroup, { backgroundColor: colors.backgroundElement }]}>
        {user ? (
          <>
            {/* Account Info */}
            <View style={styles.settingItem}>
              <View style={styles.settingLabelRow}>
                <View style={[styles.optionIconContainer, { backgroundColor: '#5856D6' }]}>
                  <Ionicons name="person" size={20} color="#FFF" />
                </View>
                <View style={styles.optionTextContainer}>
                  <Text style={[styles.optionTitle, { color: colors.text }]}>
                    {language === 'tr' ? 'Oturum Açık' : 'Logged In'}
                  </Text>
                  <Text style={styles.optionDescription}>{user.email}</Text>
                </View>
              </View>
            </View>

            <View style={[styles.separator, { backgroundColor: colorScheme === 'dark' ? '#38383A' : '#E5E5EA' }]} />

            {/* Sync Now */}
            <TouchableOpacity style={styles.optionItem} onPress={handleCloudSync} activeOpacity={0.7}>
              <View style={styles.optionLabelRow}>
                <View style={[styles.optionIconContainer, { backgroundColor: '#0A84FF' }]}>
                  <Ionicons name="sync" size={20} color="#FFF" />
                </View>
                <View style={styles.optionTextContainer}>
                  <Text style={[styles.optionTitle, { color: colors.text }]}>
                    {language === 'tr' ? 'Şimdi Bulutla Eşitle' : 'Sync with Cloud Now'}
                  </Text>
                  <Text style={styles.optionDescription}>
                    {language === 'tr' 
                      ? 'Kitaplarınızı ve okuma durumlarınızı tüm cihazlarınızla eşitleyin.' 
                      : 'Sync your library books and lending statuses across all devices.'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
            </TouchableOpacity>

            <View style={[styles.separator, { backgroundColor: colorScheme === 'dark' ? '#38383A' : '#E5E5EA' }]} />

            {/* Logout */}
            <TouchableOpacity style={styles.optionItem} onPress={handleLogout} activeOpacity={0.7}>
              <View style={styles.optionLabelRow}>
                <View style={[styles.optionIconContainer, { backgroundColor: '#FF453A' }]}>
                  <Ionicons name="log-out" size={20} color="#FFF" />
                </View>
                <View style={styles.optionTextContainer}>
                  <Text style={[styles.optionTitle, { color: '#FF453A' }]}>
                    {language === 'tr' ? 'Hesaptan Çıkış Yap' : 'Log Out of Account'}
                  </Text>
                  <Text style={styles.optionDescription}>
                    {language === 'tr' 
                      ? 'Bu cihazdaki oturumunuzu kapatın.' 
                      : 'Sign out of your account on this device.'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Logged Out / Skip State */}
            <View style={styles.settingItem}>
              <View style={styles.settingLabelRow}>
                <View style={[styles.optionIconContainer, { backgroundColor: '#8E8E93' }]}>
                  <Ionicons name="cloud-offline" size={20} color="#FFF" />
                </View>
                <View style={styles.optionTextContainer}>
                  <Text style={[styles.optionTitle, { color: colors.text }]}>
                    {language === 'tr' ? 'Bulut Eşitleme Kapalı' : 'Cloud Sync Disabled'}
                  </Text>
                  <Text style={styles.optionDescription}>
                    {language === 'tr' 
                      ? 'Kitaplarınızı bulutta saklamak ve diğer cihazlarınızla eşitlemek için oturum açın.' 
                      : 'Log in to store your books in the cloud and sync with other devices.'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={[styles.separator, { backgroundColor: colorScheme === 'dark' ? '#38383A' : '#E5E5EA' }]} />

            {/* Login / Register Button */}
            <TouchableOpacity style={styles.optionItem} onPress={handleLoginRedirect} activeOpacity={0.7}>
              <View style={styles.optionLabelRow}>
                <View style={[styles.optionIconContainer, { backgroundColor: '#34C759' }]}>
                  <Ionicons name="log-in" size={20} color="#FFF" />
                </View>
                <View style={styles.optionTextContainer}>
                  <Text style={[styles.optionTitle, { color: colors.text }]}>
                    {language === 'tr' ? 'Giriş Yap / Hesap Oluştur' : 'Log In / Create Account'}
                  </Text>
                  <Text style={styles.optionDescription}>
                    {language === 'tr' 
                      ? 'Kitaplığınızı bulut hesabınızla eşitlemek için oturum açın.' 
                      : 'Sign in to sync your library with your cloud account.'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Backup and Restore Options */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 24 }]}>{t('settings_backup_title')}</Text>
      
      <View style={[styles.optionsGroup, { backgroundColor: colors.backgroundElement }]}>
        {/* Backup Button */}
        <TouchableOpacity style={styles.optionItem} onPress={handleBackup} activeOpacity={0.7}>
          <View style={styles.optionLabelRow}>
            <View style={[styles.optionIconContainer, { backgroundColor: '#34C759' }]}>
              <Ionicons name="cloud-upload" size={20} color="#FFF" />
            </View>
            <View style={styles.optionTextContainer}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>{t('settings_backup_btn')}</Text>
              <Text style={styles.optionDescription}>{t('settings_backup_desc')}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
        </TouchableOpacity>

        <View style={[styles.separator, { backgroundColor: colorScheme === 'dark' ? '#38383A' : '#E5E5EA' }]} />

        {/* Restore Button */}
        <TouchableOpacity style={styles.optionItem} onPress={handleRestore} activeOpacity={0.7}>
          <View style={styles.optionLabelRow}>
            <View style={[styles.optionIconContainer, { backgroundColor: '#0A84FF' }]}>
              <Ionicons name="cloud-download" size={20} color="#FFF" />
            </View>
            <View style={styles.optionTextContainer}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>{t('settings_restore_btn')}</Text>
              <Text style={styles.optionDescription}>{t('settings_restore_desc')}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
        </TouchableOpacity>
      </View>

      {/* Dangerous Options */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 24 }]}>{t('settings_danger_title')}</Text>
      
      <View style={[styles.optionsGroup, { backgroundColor: colors.backgroundElement }]}>
        {/* Reset App */}
        <TouchableOpacity style={styles.optionItem} onPress={handleWipeLibrary} activeOpacity={0.7}>
          <View style={styles.optionLabelRow}>
            <View style={[styles.optionIconContainer, { backgroundColor: '#FF453A' }]}>
              <Ionicons name="trash" size={20} color="#FFF" />
            </View>
            <View style={styles.optionTextContainer}>
              <Text style={[styles.optionTitle, { color: '#FF453A' }]}>{t('settings_reset_btn')}</Text>
              <Text style={styles.optionDescription}>{t('settings_reset_desc')}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
        </TouchableOpacity>
      </View>

      {/* Info Card */}
      <View style={styles.infoCard}>
        <Ionicons name="information-circle-outline" size={20} color="#8E8E93" style={styles.infoIcon} />
        <Text style={styles.infoCardText}>{t('settings_info_text')}</Text>
      </View>

      {/* Stats List Modal */}
      <Modal
        visible={statsModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setStatsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleContainer}>
                <Ionicons 
                  name={
                    statsModalType === 'favorites' ? 'star' :
                    statsModalType === 'lent' ? 'people' : 'book'
                  } 
                  size={22} 
                  color={
                    statsModalType === 'favorites' ? '#FFD60A' :
                    statsModalType === 'lent' ? '#AF52DE' : '#5856D6'
                  } 
                  style={{ marginRight: 8 }}
                />
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {statsModalType === 'favorites' ? t('settings_fav_books') :
                   statsModalType === 'lent' ? t('lending_title') : 
                   t('settings_reading_books')}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setStatsModalVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Sub-tabs for Reading/Read Status */}
            {statsModalType === 'reading_status' && (
              <View style={[styles.modalTabContainer, { backgroundColor: colorScheme === 'dark' ? '#1C1C1E' : '#E5E5EA' }]}>
                <TouchableOpacity
                  style={[
                    styles.modalTabBtn,
                    readingStatusTab === 'reading' && styles.modalTabBtnActive,
                    readingStatusTab === 'reading' && { backgroundColor: colors.backgroundElement }
                  ]}
                  onPress={() => handleReadingStatusTabChange('reading')}
                >
                  <Text style={[
                    styles.modalTabText,
                    { color: colors.textSecondary },
                    readingStatusTab === 'reading' && styles.modalTabTextActive,
                    readingStatusTab === 'reading' && { color: colors.text }
                  ]}>
                    {t('filter_reading')} ({stats?.readingCount || 0})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalTabBtn,
                    readingStatusTab === 'read' && styles.modalTabBtnActive,
                    readingStatusTab === 'read' && { backgroundColor: colors.backgroundElement }
                  ]}
                  onPress={() => handleReadingStatusTabChange('read')}
                >
                  <Text style={[
                    styles.modalTabText,
                    { color: colors.textSecondary },
                    readingStatusTab === 'read' && styles.modalTabTextActive,
                    readingStatusTab === 'read' && { color: colors.text }
                  ]}>
                    {t('filter_read')} ({stats?.readCount || 0})
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Loader / Content */}
            {statsModalLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color="#0A84FF" />
              </View>
            ) : (
              <FlatList
                data={statsModalType === 'lent' ? statsLendings : statsBooks}
                keyExtractor={(item, index) => item.id.toString() + '_' + index}
                contentContainerStyle={styles.modalListContent}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.modalEmptyContainer}>
                    <Ionicons 
                      name="folder-open-outline" 
                      size={48} 
                      color="#8E8E93" 
                      style={{ marginBottom: 12 }}
                    />
                    <Text style={[styles.modalEmptyText, { color: colors.textSecondary }]}>
                      {language === 'tr' ? 'Gösterilecek kitap bulunamadı.' : 'No books found to display.'}
                    </Text>
                  </View>
                }
                renderItem={({ item }) => {
                  if (statsModalType === 'lent') {
                    const lendingItem = item as Lending;
                    return (
                      <View style={[styles.modalItemCard, { backgroundColor: colors.backgroundElement }]}>
                        {lendingItem.photo_path ? (
                          <Image source={{ uri: lendingItem.photo_path }} style={styles.modalItemCover} />
                        ) : (
                          <View style={[styles.modalItemCoverPlaceholder, { backgroundColor: colorScheme === 'dark' ? '#2C2C2E' : '#F2F2F7' }]}>
                            <Ionicons name="book-outline" size={20} color="#8E8E93" />
                          </View>
                        )}
                        <View style={styles.modalItemDetails}>
                          <Text style={[styles.modalItemTitle, { color: colors.text }]} numberOfLines={1}>
                            {lendingItem.book_title}
                          </Text>
                          <View style={styles.modalItemRow}>
                            <Ionicons name="person-outline" size={14} color="#AF52DE" style={{ marginRight: 4 }} />
                            <Text style={[styles.modalItemSubtext, { color: colors.textSecondary }]} numberOfLines={1}>
                              {lendingItem.borrower_name}
                            </Text>
                          </View>
                          <View style={styles.modalItemRow}>
                            <Ionicons name="calendar-outline" size={14} color="#8E8E93" style={{ marginRight: 4 }} />
                            <Text style={[styles.modalItemSubtext, { color: colors.textSecondary }]}>
                              {t('lending_return_date')}: {formatDate(lendingItem.return_date)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  } else {
                    const bookItem = item as Book;
                    return (
                      <View style={[styles.modalItemCard, { backgroundColor: colors.backgroundElement }]}>
                        {bookItem.photo_path ? (
                          <Image source={{ uri: bookItem.photo_path }} style={styles.modalItemCover} />
                        ) : (
                          <View style={[styles.modalItemCoverPlaceholder, { backgroundColor: colorScheme === 'dark' ? '#2C2C2E' : '#F2F2F7' }]}>
                            <Ionicons name="book-outline" size={20} color="#8E8E93" />
                          </View>
                        )}
                        <View style={styles.modalItemDetails}>
                          <View style={styles.modalItemTitleRow}>
                            <Text style={[styles.modalItemTitle, { color: colors.text }]} numberOfLines={1}>
                              {bookItem.title}
                            </Text>
                            {bookItem.favorite === 1 && (
                              <Ionicons name="star" size={14} color="#FFD60A" style={{ marginLeft: 6 }} />
                            )}
                          </View>
                          <Text style={[styles.modalItemSubtext, { color: colors.textSecondary }]} numberOfLines={1}>
                            {bookItem.author || t('unknown_author')}
                          </Text>
                          <View style={styles.modalItemBadgeRow}>
                            {bookItem.category_name ? (
                              <View style={[styles.modalItemBadge, { backgroundColor: colorScheme === 'dark' ? '#2C2C2E' : '#E5E5EA' }]}>
                                <Text style={[styles.modalItemBadgeText, { color: colors.text }]}>{bookItem.category_name}</Text>
                              </View>
                            ) : null}
                            <View style={[
                              styles.modalItemBadge, 
                              { 
                                backgroundColor: 
                                  bookItem.status === 'read' ? 'rgba(52, 199, 89, 0.15)' :
                                  bookItem.status === 'reading' ? 'rgba(10, 132, 255, 0.15)' :
                                  'rgba(142, 142, 147, 0.15)'
                              }
                            ]}>
                              <Text style={[
                                styles.modalItemBadgeText, 
                                { 
                                  color: 
                                    bookItem.status === 'read' ? '#34C759' :
                                    bookItem.status === 'reading' ? '#0A84FF' :
                                    '#8E8E93'
                                }
                              ]}>
                                {bookItem.status === 'read' ? t('filter_read') :
                                 bookItem.status === 'reading' ? t('filter_reading') :
                                 t('filter_unread')}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  }
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Custom Time Picker Modal */}
      <Modal
        visible={showTimePickerModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowTimePickerModal(false)}
      >
        <View style={styles.timePickerOverlay}>
          <View style={[styles.timePickerContainer, { backgroundColor: colors.background }]}>
            <Text style={[styles.timePickerTitle, { color: colors.text }]}>{t('reminders_time_label')}</Text>
            
            <View style={styles.timePickerListsRow}>
              {/* Hours Column */}
              <View style={styles.timeColumnContainer}>
                <Text style={[styles.timeColumnLabel, { color: colors.textSecondary }]}>
                  {language === 'tr' ? 'Saat' : 'Hour'}
                </Text>
                <ScrollView 
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.timeScrollContent}
                >
                  {Array.from({ length: 24 }).map((_, i) => {
                    const isSelected = notificationHour === i;
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[
                          styles.timeOption,
                          isSelected && { backgroundColor: '#0A84FF' }
                        ]}
                        onPress={() => setNotificationHour(i)}
                      >
                        <Text style={[styles.timeOptionText, { color: isSelected ? '#FFF' : colors.text }]}>
                          {String(i).padStart(2, '0')}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
              
              {/* Minutes Column */}
              <View style={styles.timeColumnContainer}>
                <Text style={[styles.timeColumnLabel, { color: colors.textSecondary }]}>
                  {language === 'tr' ? 'Dakika' : 'Minute'}
                </Text>
                <ScrollView 
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.timeScrollContent}
                >
                  {Array.from({ length: 60 }).map((_, i) => {
                    const isSelected = notificationMinute === i;
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[
                          styles.timeOption,
                          isSelected && { backgroundColor: '#0A84FF' }
                        ]}
                        onPress={() => setNotificationMinute(i)}
                      >
                        <Text style={[styles.timeOptionText, { color: isSelected ? '#FFF' : colors.text }]}>
                          {String(i).padStart(2, '0')}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
            
            <View style={styles.timePickerActionRow}>
              <TouchableOpacity
                style={[styles.timePickerBtn, styles.timePickerCancelBtn, { borderColor: colorScheme === 'dark' ? '#38383A' : '#E5E5EA' }]}
                onPress={() => setShowTimePickerModal(false)}
              >
                <Text style={[styles.timePickerBtnText, { color: colors.textSecondary }]}>
                  {t('cancel')}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.timePickerBtn, styles.timePickerConfirmBtn]}
                onPress={() => handleSaveTime(notificationHour, notificationMinute)}
              >
                <Text style={styles.timePickerBtnTextConfirm}>
                  {t('reminders_set_btn')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 4,
  },
  // Statistics Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  statsCard: {
    width: (SCREEN_WIDTH - 52) / 2, // 2 columns with paddings
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  statsValue: {
    fontSize: 20,
    fontWeight: 'bold',
    marginVertical: 6,
  },
  statsLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  optionsGroup: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  settingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    flexShrink: 1,
    marginRight: 8,
  },
  optionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
  },
  optionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  optionDescription: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
    lineHeight: 16,
  },
  separator: {
    height: 1,
    marginLeft: 64,
  },
  infoCard: {
    flexDirection: 'row',
    marginTop: 24,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(142, 142, 147, 0.1)',
  },
  infoIcon: {
    marginRight: 8,
  },
  infoCardText: {
    flex: 1,
    fontSize: 12,
    color: '#8E8E93',
    lineHeight: 18,
  },
  loadingContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },
  // Segmented selectors styling
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(142, 142, 147, 0.15)',
    borderRadius: 8,
    padding: 2,
    width: 80,
  },
  segmentContainer3: {
    flexDirection: 'row',
    backgroundColor: 'rgba(142, 142, 147, 0.15)',
    borderRadius: 8,
    padding: 2,
    width: 180,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 5,
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentBtn3: {
    flex: 1,
    paddingVertical: 5,
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentBtnActive: {
    backgroundColor: '#0A84FF',
  },
  segmentText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8E8E93',
    textAlign: 'center',
  },
  segmentTextActive: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    width: '100%',
    height: '80%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(142, 142, 147, 0.15)',
  },
  modalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 4,
  },
  modalTabContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginVertical: 12,
    padding: 3,
    borderRadius: 8,
  },
  modalTabBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
  },
  modalTabBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 1.5,
    elevation: 2,
  },
  modalTabText: {
    fontSize: 12,
    fontWeight: '500',
  },
  modalTabTextActive: {
    fontWeight: 'bold',
  },
  modalLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalListContent: {
    padding: 20,
    paddingTop: 8,
  },
  modalEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  modalEmptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  modalItemCard: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  modalItemCover: {
    width: 45,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  modalItemCoverPlaceholder: {
    width: 45,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalItemDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  modalItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalItemTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    flexShrink: 1,
  },
  modalItemSubtext: {
    fontSize: 12,
    marginTop: 2,
  },
  modalItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  modalItemBadgeRow: {
    flexDirection: 'row',
    marginTop: 6,
    gap: 6,
  },
  modalItemBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  modalItemBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  // Style extension for interactive stats cards
  interactiveCard: {
    borderWidth: 1.5,
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  
  // Goal Selector Styles
  goalSelectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  goalCounterBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  goalValueText: {
    fontSize: 16,
    fontWeight: 'bold',
    minWidth: 24,
    textAlign: 'center',
  },
  
  // Custom Switch Styles
  customSwitchOuter: {
    width: 46,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
  },
  customSwitchInner: {
    width: 22,
    height: 22,
    borderRadius: 11,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  
  // Time Picker Trigger Styles
  timePickerTrigger: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  timePickerTriggerText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  
  // Time Picker Modal Styles
  timePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timePickerContainer: {
    width: '80%',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  timePickerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  timePickerListsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    height: 200,
    marginBottom: 20,
  },
  timeColumnContainer: {
    flex: 1,
    alignItems: 'center',
  },
  timeColumnLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  timeScrollContent: {
    paddingBottom: 20,
  },
  timeOption: {
    width: 60,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
  },
  timeOptionText: {
    fontSize: 15,
    fontWeight: '500',
  },
  timePickerActionRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  timePickerBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timePickerCancelBtn: {
    borderWidth: 1,
  },
  timePickerConfirmBtn: {
    backgroundColor: '#0A84FF',
  },
  timePickerBtnTextConfirm: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
