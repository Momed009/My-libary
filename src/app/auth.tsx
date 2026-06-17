import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  useWindowDimensions,
  Dimensions,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';



type AuthMode = 'login' | 'register';

export default function AuthScreen({ onSkip }: { onSkip: () => void }) {
  const { signInWithEmail, signUpWithEmail } = useAuth();
  const { t, colors, colorScheme } = usePreferences();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const formSlide = useRef(new Animated.Value(50)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(150, [
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(formSlide, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    return () => {
      fadeAnim.stopAnimation();
      slideAnim.stopAnimation();
      logoScale.stopAnimation();
      formSlide.stopAnimation();
      cardOpacity.stopAnimation();
    };
  }, []);

  // Animate mode switch
  const switchMode = (newMode: AuthMode) => {
    Animated.timing(formSlide, {
      toValue: 20,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setMode(newMode);
      setPassword('');
      setConfirmPassword('');
      Animated.timing(formSlide, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    });
  };

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleAuth = async () => {
    if (!email.trim()) {
      Alert.alert(t('warning'), 'E-posta adresi gerekli.');
      return;
    }
    if (!validateEmail(email)) {
      Alert.alert(t('warning'), 'Geçerli bir e-posta adresi girin.');
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert(t('warning'), 'Şifre en az 6 karakter olmalı.');
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      Alert.alert(t('warning'), 'Şifreler uyuşmuyor.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await signInWithEmail(email, password);
        if (error) {
          if (error.includes('Invalid login credentials')) {
            Alert.alert(t('error'), 'E-posta veya şifre hatalı.');
          } else {
            Alert.alert(t('error'), error);
          }
        }
      } else {
        const { error } = await signUpWithEmail(email, password);
        if (error) {
          if (error.includes('already registered')) {
            Alert.alert(t('error'), 'Bu e-posta adresi zaten kayıtlı.');
          } else {
            Alert.alert(t('error'), error);
          }
        } else {
          Alert.alert(
            'Kayıt Başarılı! 🎉',
            'Hesabınız oluşturuldu. Şimdi giriş yapabilirsiniz.',
            [{ text: t('ok'), onPress: () => switchMode('login') }]
          );
        }
      }
    } catch (error) {
      Alert.alert(t('error'), 'Bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const isDark = colorScheme === 'dark';

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000000' : '#F2F4F7' }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Background Gradient */}
      <View style={styles.gradientBackground}>
        <View style={[styles.gradientCircle1, { backgroundColor: isDark ? 'rgba(10,132,255,0.15)' : 'rgba(10,132,255,0.08)' }]} />
        <View style={[styles.gradientCircle2, { backgroundColor: isDark ? 'rgba(94,92,230,0.12)' : 'rgba(94,92,230,0.06)' }]} />
        <View style={[styles.gradientCircle3, { backgroundColor: isDark ? 'rgba(48,209,88,0.10)' : 'rgba(48,209,88,0.05)' }]} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo and Title */}
          <Animated.View style={[styles.headerSection, { opacity: fadeAnim, transform: [{ scale: logoScale }] }]}>
            <View style={[styles.logoContainer, { backgroundColor: isDark ? 'rgba(10,132,255,0.15)' : 'rgba(10,132,255,0.1)' }]}>
              <Ionicons name="library" size={48} color="#0A84FF" />
            </View>
            <Text style={[styles.appName, { color: colors.text }]}>Kütüphanem</Text>
            <Text style={[styles.appTagline, { color: colors.textSecondary }]}>
              Kitaplarını her yerde yanında taşı
            </Text>
          </Animated.View>

          {/* Auth Card */}
          <Animated.View style={[
            styles.authCard,
            {
              backgroundColor: isDark ? 'rgba(30,30,32,0.85)' : 'rgba(255,255,255,0.9)',
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              opacity: cardOpacity,
              transform: [{ translateY: slideAnim }],
            }
          ]}>
            {/* Mode Tabs */}
            <View style={[styles.modeTabs, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
              <TouchableOpacity
                style={[
                  styles.modeTab,
                  mode === 'login' && [styles.modeTabActive, { backgroundColor: isDark ? '#0A84FF' : '#0A84FF' }]
                ]}
                onPress={() => switchMode('login')}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.modeTabText,
                  { color: mode === 'login' ? '#FFFFFF' : colors.textSecondary }
                ]}>Giriş Yap</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modeTab,
                  mode === 'register' && [styles.modeTabActive, { backgroundColor: '#0A84FF' }]
                ]}
                onPress={() => switchMode('register')}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.modeTabText,
                  { color: mode === 'register' ? '#FFFFFF' : colors.textSecondary }
                ]}>Kayıt Ol</Text>
              </TouchableOpacity>
            </View>

            {/* Form */}
            <Animated.View style={{ transform: [{ translateY: formSlide }] }}>
              {/* Email */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>E-posta</Text>
                <View style={[
                  styles.inputContainer,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                  }
                ]}>
                  <Ionicons name="mail-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="ornek@email.com"
                    placeholderTextColor={isDark ? '#555' : '#AAA'}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>
              </View>

              {/* Password */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Şifre</Text>
                <View style={[
                  styles.inputContainer,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                  }
                ]}>
                  <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="••••••"
                    placeholderTextColor={isDark ? '#555' : '#AAA'}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    value={password}
                    onChangeText={setPassword}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm Password (Register only) */}
              {mode === 'register' && (
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Şifre Tekrar</Text>
                  <View style={[
                    styles.inputContainer,
                    {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
                      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                    }
                  ]}>
                    <Ionicons name="shield-checkmark-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      placeholder="••••••"
                      placeholderTextColor={isDark ? '#555' : '#AAA'}
                      secureTextEntry={!showConfirmPassword}
                      autoCapitalize="none"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                    />
                    <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeButton}>
                      <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                onPress={handleAuth}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {mode === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
                  </Text>
                )}
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>

          {/* Skip button */}
          <Animated.View style={{ opacity: fadeAnim }}>
            <TouchableOpacity style={styles.skipButton} onPress={onSkip} activeOpacity={0.7}>
              <Text style={[styles.skipButtonText, { color: colors.textSecondary }]}>
                Giriş yapmadan devam et
              </Text>
              <Ionicons name="arrow-forward" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </Animated.View>

          {/* Footer info */}
          <Animated.View style={[styles.footerInfo, { opacity: fadeAnim }]}>
            <Ionicons name="cloud-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.footerInfoText, { color: colors.textSecondary }]}>
              Giriş yaparak kitaplarını cihazlar arası senkronize edebilirsin
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const { width: _SW, height: _SH } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradientBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  gradientCircle1: {
    position: 'absolute',
    width: _SW * 1.2,
    height: _SW * 1.2,
    borderRadius: _SW * 0.6,
    top: -_SW * 0.4,
    right: -_SW * 0.3,
  },
  gradientCircle2: {
    position: 'absolute',
    width: _SW * 0.8,
    height: _SW * 0.8,
    borderRadius: _SW * 0.4,
    bottom: _SH * 0.15,
    left: -_SW * 0.3,
  },
  gradientCircle3: {
    position: 'absolute',
    width: _SW * 0.5,
    height: _SW * 0.5,
    borderRadius: _SW * 0.25,
    bottom: -_SW * 0.1,
    right: -_SW * 0.1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  appName: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  appTagline: {
    fontSize: 15,
    marginTop: 6,
    letterSpacing: 0.2,
  },
  authCard: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    marginBottom: 20,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  modeTabs: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    marginBottom: 24,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 11,
    alignItems: 'center',
  },
  modeTabActive: {
    shadowColor: '#0A84FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  modeTabText: {
    fontSize: 15,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  eyeButton: {
    padding: 8,
    marginLeft: 4,
  },
  submitButton: {
    backgroundColor: '#0A84FF',
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#0A84FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  skipButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  skipButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
  footerInfo: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 20,
  },
  footerInfoText: {
    fontSize: 12,
    textAlign: 'center',
  },
});
