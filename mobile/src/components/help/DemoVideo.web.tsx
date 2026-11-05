import { demoPosterUrl, demoVideoUrl } from './demo-video';

// the video loads only when someone presses play, to save hosting transfer.
export function DemoVideo() {
  return (
    <video
      src={demoVideoUrl}
      poster={demoPosterUrl}
      controls
      playsInline
      preload="none"
      style={{ width: '100%', maxWidth: 360, aspectRatio: '720 / 1560', borderRadius: 12, background: '#000' }}
    />
  );
}
