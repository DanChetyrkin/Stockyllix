import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { darkPalette, isThemePreference, lightPalette, resolveTheme, type ThemePalette, type ThemePreference, type ThemeMode } from '@/config/theme';

interface ThemeContextValue {
  preference: ThemePreference;
  mode: ThemeMode;
  isDark: boolean;
  palette: ThemePalette;
  setPreference(preference: ThemePreference): void;
  error: string | null;
}

const storageKey = 'stockyllix.theme-preference';
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<ThemePreference>('auto');
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const changed = useRef(false);
  const saveQueue = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(storageKey).then(saved => {
      if (active && !changed.current && isThemePreference(saved)) setPreferenceState(saved);
    }).catch(() => {
      if (active) setError('Your saved appearance could not be loaded.');
    });
    const timer = setInterval(() => setNow(new Date()), 60_000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') setNow(new Date());
    });
    return () => { active = false; clearInterval(timer); subscription.remove(); };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    changed.current = true;
    setPreferenceState(next);
    setNow(new Date());
    setError(null);
    // save choices in order when buttons are pressed quickly.
    saveQueue.current = saveQueue.current.then(() => AsyncStorage.setItem(storageKey, next)).catch(() => {
      setError('Appearance changed, but it could not be saved on this device.');
    });
  }, []);

  const mode = resolveTheme(preference, now);
  const value = useMemo(() => ({ preference, mode, isDark: mode === 'dark', palette: mode === 'dark' ? darkPalette : lightPalette, setPreference, error }), [preference, mode, setPreference, error]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('ThemeProvider is required.');
  return value;
}
