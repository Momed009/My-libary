import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { Colors } from '@/constants/theme';
import { getSetting, setSetting } from '@/services/db';
import { translations } from '@/constants/translations';

export type ThemeType = 'light' | 'dark' | 'system';
export type LanguageType = 'tr' | 'en';

interface PreferencesContextType {
  theme: ThemeType;
  language: LanguageType;
  colors: typeof Colors.light;
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
        const savedTheme = await getSetting('theme', 'system') as ThemeType;
        const savedLang = await getSetting('language', 'tr') as LanguageType;
        setThemeState(savedTheme);
        setLanguageState(savedLang);
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

  const colors = Colors[activeColorScheme];

  // Translation helper with optional replacement tokens e.g. {count}
  const t = (key: string, replacements?: Record<string, string | number>) => {
    const langDict = translations[language] || translations['tr'];
    let text = langDict[key] || key;
    
    if (replacements) {
      Object.keys(replacements).forEach((token) => {
        text = text.replace(`{${token}}`, String(replacements[token]));
      });
    }
    return text;
  };

  return (
    <PreferencesContext.Provider value={{
      theme,
      language,
      colors,
      colorScheme: activeColorScheme,
      setTheme,
      setLanguage,
      t,
      isReady
    }}>
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
