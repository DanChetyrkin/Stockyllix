import { useMemo, useRef, useState } from 'react';
import { Redirect } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { BrandLogo } from '@/components/BrandLogo';
import { errorMessage } from '@/api/client';
import {
  confirmationError,
  firstValidationError,
  passwordHint,
  registrationErrors,
  signInErrors,
  type AuthField,
  type AuthFieldErrors,
} from '@/auth/validation';
import { Badge, Button, Card, Copy, Eyebrow, Field, Notice, ThemePicker } from '@/components/ui/kit';
import { useTheme } from '@/context/ThemeContext';
import { type ThemePalette } from '@/config/theme';

export default function AuthScreen() {
  const { palette } = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const auth = useAuth();
  const [register, setRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const wide = useWindowDimensions().width >= 860;

  function clearError(field: AuthField) {
    setFieldErrors(current => ({ ...current, [field]: undefined }));
    setError(null);
  }

  async function submit() {
    if (submitting.current) return;
    setError(null);
    const validation = register
      ? { ...registrationErrors(name, email, password), confirmation: confirmationError(password, confirmation) }
      : signInErrors(email, password);
    setFieldErrors(validation);
    if (firstValidationError(validation)) {
      setError('Please check the highlighted fields.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      if (register) await auth.register(name, email, password);
      else await auth.signIn(email, password);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (auth.loading)
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={palette.green} />
      </View>
    );
  if (auth.user) return <Redirect href="/" />;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
          <View style={[styles.frame, wide && { flexDirection: 'row' }]}>
            <View style={[styles.hero, wide && { width: '48%', padding: 66 }]}>
              <View style={{ alignSelf: 'flex-start' }}>
                <BrandLogo width={wide ? 270 : 230} framed />
              </View>
              <View style={styles.heroContent}>
                <Text style={styles.overline}>THE PORTFOLIO LEAGUE</Text>
                <Text accessibilityRole="header" style={[styles.headline, !wide && { fontSize: 42 }]}>
                  A little practice.{'\n'}A world of{'\n'}confidence.
                </Text>
                <Text style={styles.heroCopy}>
                  Explore the markets, build your portfolio and learn what makes a thoughtful investor.
                </Text>
                <View style={styles.abstractChart} accessibilityLabel="Decorative investment illustration">
                  <View style={styles.chartGrid} />
                  {[24, 39, 30, 49, 43, 61, 55, 78, 70, 92, 84, 110].map((height, index) => (
                    <View
                      key={index}
                      style={[styles.chartBar, { height, backgroundColor: index > 8 ? '#C9F0C2' : '#528269' }]}
                    />
                  ))}
                  <Text style={styles.chartNote}>YOUR NEXT CHAPTER STARTS HERE ↗</Text>
                </View>
                <View style={styles.heroFacts}>
                  <View>
                    <Text style={styles.factValue}>₪1,000,000</Text>
                    <Text style={styles.factLabel}>virtual starting capital</Text>
                  </View>
                  <View style={styles.factDivider} />
                  <View>
                    <Text style={styles.factValue}>20 assets</Text>
                    <Text style={styles.factLabel}>two markets to explore</Text>
                  </View>
                </View>
              </View>
              <Text style={styles.heroFooter}>HOUSE OF FINANCE · LEARN BY DOING</Text>
            </View>
            <View style={[styles.formSide, wide && { padding: 60 }]}>
              <View style={{ width: '100%', maxWidth: 410, gap: 24 }}>
                <View style={{ alignSelf: 'flex-end' }}>
                  <ThemePicker />
                </View>
                <Badge tone="positive">Virtual money. Real learning.</Badge>
                <View style={{ gap: 10 }}>
                  <Eyebrow>Welcome to the league</Eyebrow>
                  <Text accessibilityRole="header" style={styles.formTitle}>
                    {register ? 'Your journey begins.' : 'Good to see you.'}
                  </Text>
                  <Copy muted>
                    {register
                      ? 'Create your account and start building your first virtual portfolio.'
                      : 'Sign in to see how your portfolio is doing.'}
                  </Copy>
                </View>
                {!auth.configured && (
                  <Notice tone="warning">
                    {auth.configurationError} Authentication and trading stay disabled until setup is complete.
                  </Notice>
                )}
                {error && <Notice tone="error">{error}</Notice>}
                <View style={{ gap: 18 }}>
                  {register && (
                    <View style={{ gap: 6 }}>
                      <Field
                        label="Display name"
                        value={name}
                        onChangeText={value => {
                          setName(value);
                          clearError('name');
                        }}
                        autoComplete="name"
                        maxLength={40}
                        placeholder="How should the league know you?"
                        editable={!busy}
                        style={fieldErrors.name && styles.invalidInput}
                      />
                      <FieldError message={fieldErrors.name} />
                    </View>
                  )}
                  <View style={{ gap: 6 }}>
                    <Field
                      label="Email address"
                      value={email}
                      onChangeText={value => {
                        setEmail(value);
                        clearError('email');
                      }}
                      autoComplete="email"
                      textContentType="emailAddress"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="you@example.com"
                      editable={!busy}
                      style={fieldErrors.email && styles.invalidInput}
                    />
                    <FieldError message={fieldErrors.email} />
                  </View>
                  <View style={{ gap: 6 }}>
                    <Field
                      label="Password"
                      value={password}
                      onChangeText={value => {
                        setPassword(value);
                        clearError('password');
                        clearError('confirmation');
                      }}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete={register ? 'new-password' : 'current-password'}
                      textContentType={register ? 'newPassword' : 'password'}
                      placeholder={register ? 'At least 8 characters' : 'Your password'}
                      editable={!busy}
                      style={fieldErrors.password && styles.invalidInput}
                      trailing={
                        <PasswordVisibility
                          label="password"
                          visible={showPassword}
                          disabled={busy}
                          onPress={() => setShowPassword(value => !value)}
                        />
                      }
                      hint={register && !fieldErrors.password ? passwordHint : undefined}
                      onSubmitEditing={() => {
                        if (!register) void submit();
                      }}
                    />
                    <FieldError message={fieldErrors.password} />
                  </View>
                  {register && (
                    <View style={{ gap: 6 }}>
                      <Field
                        label="Confirm password"
                        value={confirmation}
                        onChangeText={value => {
                          setConfirmation(value);
                          clearError('confirmation');
                        }}
                        secureTextEntry={!showConfirmation}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="new-password"
                        textContentType="newPassword"
                        placeholder="Enter your password again"
                        editable={!busy}
                        style={fieldErrors.confirmation && styles.invalidInput}
                        trailing={
                          <PasswordVisibility
                            label="password confirmation"
                            visible={showConfirmation}
                            disabled={busy}
                            onPress={() => setShowConfirmation(value => !value)}
                          />
                        }
                        onSubmitEditing={() => void submit()}
                      />
                      <FieldError message={fieldErrors.confirmation} />
                    </View>
                  )}
                  <Button loading={busy} disabled={!auth.configured} onPress={() => void submit()}>
                    {register ? 'Create your portfolio  →' : 'Sign in  →'}
                  </Button>
                </View>
                <View
                  style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}
                >
                  <Copy muted>{register ? 'Already in the league?' : 'New to Stockyllix?'}</Copy>
                  <Button
                    compact
                    variant="quiet"
                    disabled={busy}
                    onPress={() => {
                      setRegister(!register);
                      setError(null);
                      setFieldErrors({});
                      setPassword('');
                      setConfirmation('');
                      setShowPassword(false);
                      setShowConfirmation(false);
                    }}
                  >
                    {register ? 'Sign in' : 'Create an account'}
                  </Button>
                </View>
                <Card style={{ backgroundColor: palette.soft, borderWidth: 0, padding: 18, gap: 7 }}>
                  <Text style={{ color: palette.ink, fontSize: 12, fontWeight: '700' }}>A smarter way to practice</Text>
                  <Copy muted style={{ fontSize: 12, lineHeight: 19 }}>
                    No real money, no leverage and no pressure. Your weekly score rewards both returns and stability.
                  </Copy>
                </Card>
                <Copy muted style={{ fontSize: 10, textAlign: 'center' }}>
                  An educational home assignment. This is not investment advice.
                </Copy>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FieldError({ message }: { message?: string }) {
  const { palette } = useTheme();
  return message ? (
    <Text accessibilityRole="alert" style={{ color: palette.red, fontSize: 12, lineHeight: 18 }}>
      {message}
    </Text>
  ) : null;
}

function PasswordVisibility({
  label,
  visible,
  disabled,
  onPress,
}: {
  label: string;
  visible: boolean;
  disabled: boolean;
  onPress(): void;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${visible ? 'Hide' : 'Show'} ${label}`}
      accessibilityState={{ selected: visible, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 7,
        opacity: disabled ? 0.45 : pressed ? 0.65 : 1,
      })}
    >
      <View
        pointerEvents="none"
        accessible={false}
        style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}
      >
        <View
          style={{
            width: 22,
            height: 14,
            borderRadius: 12,
            borderWidth: 1.6,
            borderColor: palette.green,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.green }} />
        </View>
        {visible && (
          <View
            style={{
              position: 'absolute',
              width: 27,
              height: 1.8,
              backgroundColor: palette.green,
              transform: [{ rotate: '-45deg' }],
            }}
          />
        )}
      </View>
    </Pressable>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: palette.background },
    loading: { flex: 1, backgroundColor: palette.background, alignItems: 'center', justifyContent: 'center' },
    frame: { flex: 1, minHeight: '100%' },
    hero: { backgroundColor: palette.dark, padding: 30, minHeight: 450, justifyContent: 'space-between' },
    heroContent: { gap: 22, marginVertical: 45, maxWidth: 490 },
    overline: { fontSize: 10, color: '#A8D3B7', fontWeight: '700', letterSpacing: 2.5 },
    headline: { fontSize: 54, lineHeight: 60, color: '#F5F5E8', letterSpacing: -2.4, fontWeight: '600' },
    heroCopy: { color: '#B2CCBB', fontSize: 15, lineHeight: 25, maxWidth: 355 },
    heroFacts: { flexDirection: 'row', gap: 25, alignItems: 'center' },
    factValue: { color: '#EDF4E8', fontSize: 20, fontWeight: '600', letterSpacing: -0.5 },
    factLabel: { color: '#92B49E', fontSize: 10, marginTop: 7 },
    factDivider: { width: 1, height: 40, backgroundColor: '#38634C' },
    abstractChart: {
      height: 160,
      alignItems: 'flex-end',
      flexDirection: 'row',
      gap: 7,
      marginVertical: 10,
      paddingBottom: 29,
    },
    chartBar: { flex: 1, borderTopLeftRadius: 4, borderTopRightRadius: 4, maxWidth: 25 },
    chartGrid: { position: 'absolute', bottom: 29, height: 1, left: 0, right: 0, backgroundColor: '#41604D' },
    chartNote: { position: 'absolute', bottom: 0, left: 0, fontSize: 8, color: '#8AAC95', letterSpacing: 1.7 },
    heroFooter: { color: '#809F8B', fontSize: 9, fontWeight: '600', letterSpacing: 1.5 },
    formSide: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, paddingVertical: 48 },
    formTitle: { fontSize: 32, color: palette.ink, fontWeight: '700', letterSpacing: -1 },
    invalidInput: { borderColor: palette.red },
  });
}
