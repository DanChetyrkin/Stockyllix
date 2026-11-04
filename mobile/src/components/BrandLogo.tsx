import { Image } from 'expo-image';
import { View } from 'react-native';

export function BrandLogo({ width = 230, framed = false }: { width?: number; framed?: boolean }) {
  return <View style={framed ? { backgroundColor: '#F5F5EF', borderRadius: 12, paddingHorizontal: 14 } : undefined}>
    <Image source={require('../../assets/branding/stockyllix-wordmark.png')} style={{ width, height: width / 3 }} contentFit="contain" accessibilityLabel="Stockyllix" />
  </View>;
}
