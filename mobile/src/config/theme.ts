export type ThemePreference = 'auto' | 'light' | 'dark';
export type ThemeMode = 'light' | 'dark';

export const lightPalette = {
  background: '#F5F5EF', paper: '#FFFFFF', ink: '#153C32', muted: '#5F7368',
  line: '#DFE6DF', green: '#146B4B', mint: '#E7F3E9', dark: '#11392E',
  amber: '#845A1A', amberBg: '#FFF3DC', red: '#A33A36', redBg: '#FCEDEA',
  primary: '#146B4B', onPrimary: '#FFFFFF', danger: '#A33A36', onDanger: '#FFFFFF',
  soft: '#EDF2EB', placeholder: '#5F7368', inputBorder: '#CBD7CE',
  onDark: '#F0F6F1', mutedOnDark: '#B9D3C7', positiveOnDark: '#97E8AC', negativeOnDark: '#FFB4AA',
  tableHead: '#FAFBF8', tableLine: '#EDF0EB', errorBorder: '#ECCAC7', warningBorder: '#EEDCB9',
};

export type ThemePalette = { [Key in keyof typeof lightPalette]: string };

export const darkPalette: ThemePalette = {
  background: '#0D1714', paper: '#15241E', ink: '#EAF1EC', muted: '#A8BAB0',
  line: '#345044', green: '#8ED9AD', mint: '#203F30', dark: '#0B2B20',
  amber: '#F4D28C', amberBg: '#3C2F17', red: '#FFB4AA', redBg: '#412421',
  primary: '#A0E4BB', onPrimary: '#092419', danger: '#B7433A', onDanger: '#FFFFFF',
  soft: '#1C3026', placeholder: '#92A89B', inputBorder: '#527261',
  onDark: '#F0F6F1', mutedOnDark: '#AAC6B6', positiveOnDark: '#97E8AC', negativeOnDark: '#FFB4AA',
  tableHead: '#1A2C23', tableLine: '#2B4236', errorBorder: '#78443E', warningBorder: '#786339',
};

const israelHour = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jerusalem', hour: '2-digit', hourCycle: 'h23',
});

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'auto' || value === 'light' || value === 'dark';
}

export function resolveTheme(preference: ThemePreference, now: Date = new Date()): ThemeMode {
  if (preference !== 'auto') return preference;
  // automatic mode follows real israel time, never the game clock.
  const hour = Number(israelHour.format(now));
  return hour >= 20 || hour < 7 ? 'dark' : 'light';
}
