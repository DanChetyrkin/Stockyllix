export type ThemePreference = 'auto' | 'light' | 'dark';
export type ThemeMode = 'light' | 'dark';

export const lightPalette = {
  background: '#F6F8F5',
  paper: '#FFFFFF',
  ink: '#172A21',
  muted: '#586C60',
  line: '#E1E8E1',
  green: '#236344',
  mint: '#E5F1E8',
  dark: '#172F24',
  amber: '#845A1A',
  amberBg: '#FFF3DC',
  red: '#A33A36',
  redBg: '#FCEDEA',
  primary: '#236344',
  onPrimary: '#FFFFFF',
  danger: '#A33A36',
  onDanger: '#FFFFFF',
  soft: '#EDF3ED',
  placeholder: '#586C60',
  inputBorder: '#CBD7CE',
  onDark: '#F0F6F1',
  mutedOnDark: '#B9D3C7',
  positiveOnDark: '#97E8AC',
  negativeOnDark: '#FFB4AA',
  tableHead: '#FAFBF8',
  tableLine: '#EDF0EB',
  errorBorder: '#ECCAC7',
  warningBorder: '#EEDCB9',
};

export type ThemePalette = { [Key in keyof typeof lightPalette]: string };

export const darkPalette: ThemePalette = {
  background: '#0D1714',
  paper: '#15241E',
  ink: '#EAF1EC',
  muted: '#A8BAB0',
  line: '#345044',
  green: '#8ED9AD',
  mint: '#203F30',
  dark: '#0B2B20',
  amber: '#F4D28C',
  amberBg: '#3C2F17',
  red: '#FFB4AA',
  redBg: '#412421',
  primary: '#2F7451',
  onPrimary: '#FFFFFF',
  danger: '#B7433A',
  onDanger: '#FFFFFF',
  soft: '#1C3026',
  placeholder: '#92A89B',
  inputBorder: '#527261',
  onDark: '#F0F6F1',
  mutedOnDark: '#AAC6B6',
  positiveOnDark: '#97E8AC',
  negativeOnDark: '#FFB4AA',
  tableHead: '#1A2C23',
  tableLine: '#2B4236',
  errorBorder: '#78443E',
  warningBorder: '#786339',
};

const israelHour = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jerusalem',
  hour: '2-digit',
  hourCycle: 'h23',
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
