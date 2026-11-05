import { Link, usePathname, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

export function MarketModes() {
  const path = usePathname();
  const { palette } = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {(
        [
          { href: '/current-market', label: 'Current market' },
          { href: '/market', label: 'Demo trading' },
        ] as const
      ).map(item => (
        <Link key={item.href} href={item.href as Href} asChild>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: path === item.href }}
            style={{
              minHeight: 42,
              justifyContent: 'center',
              paddingHorizontal: 18,
              borderRadius: 9,
              borderWidth: 1,
              borderColor: palette.line,
              backgroundColor: path === item.href ? palette.primary : palette.paper,
            }}
          >
            <Text
              style={{ color: path === item.href ? palette.onPrimary : palette.ink, fontWeight: '600', fontSize: 13 }}
            >
              {item.label}
            </Text>
          </Pressable>
        </Link>
      ))}
    </View>
  );
}
