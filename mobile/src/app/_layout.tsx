import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/context/AuthContext';
import { GameProvider } from '@/context/GameContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import '../global.css';

export default function RootLayout() {
  return <SafeAreaProvider><ThemeProvider><AuthProvider><GameProvider><ThemedNavigation /></GameProvider></AuthProvider></ThemeProvider></SafeAreaProvider>;
}

function ThemedNavigation() {
  const { isDark, palette } = useTheme();
  return <><StatusBar style={isDark ? 'light' : 'dark'} /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.background }, animation: 'none' }} /></>;
}
