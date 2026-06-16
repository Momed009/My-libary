import { usePreferences } from '@/context/PreferencesContext';

export function useTheme() {
  const { colors } = usePreferences();
  return colors;
}

