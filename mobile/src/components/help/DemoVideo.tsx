import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { demoPosterUrl, demoVideoUrl } from './demo-video';

// phones play the same file in a one-tag web page, so no extra video library is needed.
const page = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#000"><video src="${demoVideoUrl}" poster="${demoPosterUrl}" controls playsinline preload="none" style="width:100%;height:100vh;object-fit:contain"></video></body>`;

export function DemoVideo() {
  return (
    <View style={{ width: '100%', maxWidth: 360, aspectRatio: 720 / 1560, borderRadius: 12, overflow: 'hidden' }}>
      <WebView
        source={{ html: page, baseUrl: 'https://stockyllix.web.app' }}
        allowsInlineMediaPlayback
        allowsFullscreenVideo
      />
    </View>
  );
}
