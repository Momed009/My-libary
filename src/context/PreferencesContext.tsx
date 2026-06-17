import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import { Colors } from '@/constants/theme';
import { getSetting, setSetting } from '@/services/db';
import { translations } from '@/constants/translations';

export type ThemeType = 'light' | 'dark' | 'system';
export type LanguageType = 'tr' | 'en' | 'ar';

const VALID_THEMES: ThemeType[] = ['light', 'dark', 'system'];
const VALID_LANGUAGES: LanguageType[] = ['tr', 'en', 'ar'];

interface PreferencesContextType {
  theme: ThemeType;
  language: LanguageType;
  colors: (typeof Colors)[keyof typeof Colors];
  colorScheme: 'light' | 'dark';
  setTheme: (theme: ThemeType) => Promise<void>;
  setLanguage: (lang: LanguageType) => Promise<void>;
  t: (key: string, replacements?: Record<string, string | number>) => string;
  isReady: boolean;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeType>('system');
  const [language, setLanguageState] = useState<LanguageType>('tr');
  const [isReady, setIsReady] = useState(false);
  const systemColorScheme = useColorScheme();

  // Load saved preferences once on mount
  useEffect(() => {
    async function loadPreferences() {
      try {
        const savedTheme = await getSetting('theme', 'system');
        const savedLang = await getSetting('language', 'tr');

        // Validate theme value - if invalid, use default
        const validatedTheme: ThemeType = VALID_THEMES.includes(savedTheme as ThemeType)
          ? (savedTheme as ThemeType)
          : 'system';

        // Validate language value - if invalid, use default
        const validatedLang: LanguageType = VALID_LANGUAGES.includes(savedLang as LanguageType)
          ? (savedLang as LanguageType)
          : 'tr';

        setThemeState(validatedTheme);
        setLanguageState(validatedLang);
      } catch (error) {
        console.error('Error loading preferences:', error);
      } finally {
        setIsReady(true);
      }
    }
    loadPreferences();
  }, []);

  const setTheme = async (newTheme: ThemeType) => {
    setThemeState(newTheme);
    await setSetting('theme', newTheme);
  };

  const setLanguage = async (newLang: LanguageType) => {
    setLanguageState(newLang);
    await setSetting('language', newLang);
  };

  // Resolve active color scheme (if theme is system, use system scheme, default light)
  const activeColorScheme = theme === 'system'
    ? (systemColorScheme === 'dark' ? 'dark' : 'light')
    : theme;

  // Wrap colors computation in useMemo
  const colors = useMemo(() => Colors[activeColorScheme], [activeColorScheme]);

  // Translation helper with optional replacement tokens e.g. {count}
  // Use replaceAll (or regex with 'g' flag) so ALL occurrences of a token are replaced
  const t = useCallback((key: string, replacements?: Record<string, string | number>) => {
    const langDict = translations[language] || translations['tr'];
    let text = langDict[key] || key;
    
    if (replacements) {
      Object.keys(replacements).forEach((token) => {
        text = text.replaceAll(`{${token}}`, String(replacements[token]));
      });
    }
    return text;
  }, [language]);

  // Wrap the context value in useMemo
  const contextValue = useMemo(() => ({
    theme,
    language,
    colors,
    colorScheme: activeColorScheme,
    setTheme,
    setLanguage,
    t,
    isReady
  }), [theme, language, colors, activeColorScheme, setTheme, setLanguage, t, isReady]);

  return (
    <PreferencesContext.Provider value={contextValue}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
}
