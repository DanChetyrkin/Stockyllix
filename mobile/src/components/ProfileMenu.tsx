import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { updateProfile, type User } from 'firebase/auth';
import { api, errorMessage } from '@/api/client';
import { auth } from '@/config/firebase';
import { useAuth } from '@/context/AuthContext';
import { useGame } from '@/context/GameContext';
import { useTheme } from '@/context/ThemeContext';
import type { ThemePalette } from '@/config/theme';
import { Button, Copy, Dialog, Field, Notice } from '@/components/ui/kit';

interface Profile {
  displayName: string;
  photoDataUrl: string | null;
}

function Avatar({ name, photo, large = false }: { name: string; photo: string | null; large?: boolean }) {
  const { palette } = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const size = large ? 80 : 40;
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(word => word[0])
      .join('')
      .toUpperCase() || 'S';
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {photo && photo !== failedPhoto ? (
        <Image
          accessibilityLabel="Profile photo"
          source={{ uri: photo }}
          contentFit="cover"
          onError={() => setFailedPhoto(photo)}
          style={{ width: size, height: size }}
        />
      ) : (
        <Text style={[styles.initials, large && { fontSize: 26 }]}>{initials}</Text>
      )}
    </View>
  );
}

export function ProfileMenu({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  return user ? <ProfileControls key={user.uid} user={user} compact={compact} /> : null;
}

function ProfileControls({ user, compact }: { user: User; compact: boolean }) {
  const { palette } = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { signOut } = useAuth();
  const { refreshWorld } = useGame();
  const [saved, setSaved] = useState<{ uid: string; profile: Profile } | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<'error' | 'success' | 'warning'>('error');
  const [reload, setReload] = useState(0);
  const mounted = useRef(false);
  const fallback = user.displayName || user.email?.split('@')[0] || 'Investor';
  const profile = saved && saved.uid === user.uid ? saved.profile : null;
  const displayName = profile?.displayName || fallback;
  const busy = saving || choosing;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const uid = user.uid;
    const controller = new AbortController();
    void api<{ profile: Profile }>('/me/profile', { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted || auth?.currentUser?.uid !== uid) return;
        setSaved({ uid, profile: result.profile });
        setName(
          result.profile.displayName ||
            auth?.currentUser?.displayName ||
            auth?.currentUser?.email?.split('@')[0] ||
            'Investor',
        );
        setPhoto(result.profile.photoDataUrl);
      })
      .catch(cause => {
        if (!controller.signal.aborted && auth?.currentUser?.uid === uid) setLoadError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted && auth?.currentUser?.uid === uid) setLoading(false);
      });
    return () => controller.abort();
  }, [user.uid, reload]);

  const stillCurrent = (uid: string) => mounted.current && auth?.currentUser?.uid === uid;

  function showProfile() {
    setName(displayName);
    setPhoto(profile?.photoDataUrl ?? null);
    setMessage(null);
    setOpen(true);
  }

  async function choosePhoto() {
    if (busy) return;
    const uid = user.uid;
    setChoosing(true);
    setMessage(null);
    try {
      // the system picker shares only the image chosen by the player.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (result.canceled || !stillCurrent(uid)) return;
      const asset = result.assets[0];
      if (!asset || !asset.width || !asset.height)
        throw new Error('This image could not be opened. Please choose another photo.');
      const side = Math.min(asset.width, asset.height);
      const context = ImageManipulator.manipulate(asset.uri);
      try {
        context.crop({
          originX: Math.floor((asset.width - side) / 2),
          originY: Math.floor((asset.height - side) / 2),
          width: side,
          height: side,
        });
        context.resize({ width: 128, height: 128 });
        const image = await context.renderAsync();
        try {
          const resized = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.65, base64: true });
          if (!resized.base64) throw new Error('The photo could not be resized. Please choose another photo.');
          const bytes =
            (resized.base64.length * 3) / 4 -
            (resized.base64.endsWith('==') ? 2 : resized.base64.endsWith('=') ? 1 : 0);
          if (bytes > 32 * 1024)
            throw new Error('The resized photo is still too large. Please choose a simpler photo.');
          if (stillCurrent(uid)) setPhoto(`data:image/jpeg;base64,${resized.base64}`);
        } finally {
          image.release();
        }
      } finally {
        context.release();
      }
    } catch (cause) {
      if (stillCurrent(uid)) {
        setNoticeTone('error');
        setMessage(errorMessage(cause));
      }
    } finally {
      if (stillCurrent(uid)) setChoosing(false);
    }
  }

  async function saveProfile() {
    if (busy || loading || !profile) return;
    const uid = user.uid;
    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 40) {
      setNoticeTone('error');
      setMessage('Your display name must contain 2 to 40 characters.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const result = await api<{ profile: Profile }>('/me/profile', {
        method: 'POST',
        body: { displayName: trimmedName, photoDataUrl: photo },
      });
      if (!stillCurrent(uid)) return;
      setSaved({ uid, profile: result.profile });
      setName(result.profile.displayName);
      setNoticeTone('success');
      setMessage('Your profile was saved.');
      try {
        // keep the account name ready for a newly reset game world.
        await updateProfile(auth!.currentUser!, { displayName: result.profile.displayName });
      } catch {
        if (stillCurrent(uid)) {
          setNoticeTone('warning');
          setMessage('Your game profile was saved, but the account name did not sync. Save again to retry.');
        }
      }
      if (stillCurrent(uid)) await refreshWorld();
    } catch (cause) {
      if (stillCurrent(uid)) {
        setNoticeTone('error');
        setMessage(errorMessage(cause));
      }
    } finally {
      if (stillCurrent(uid)) setSaving(false);
    }
  }

  async function leave() {
    setSaving(true);
    setMessage(null);
    try {
      await signOut();
    } catch (cause) {
      setNoticeTone('error');
      setMessage(errorMessage(cause));
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open profile"
        accessibilityState={{ expanded: open, busy: loading, disabled: loading }}
        disabled={loading}
        onPress={showProfile}
        style={({ pressed }) => [styles.trigger, pressed && { opacity: 0.8 }]}
      >
        {!compact && (
          <View style={styles.nameColumn}>
            <Text numberOfLines={1} style={styles.triggerName}>
              {displayName}
            </Text>
            <Text style={styles.triggerHint}>My profile</Text>
          </View>
        )}
        <Avatar name={displayName} photo={profile?.photoDataUrl ?? null} />
      </Pressable>
      <Dialog
        visible={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
      >
        <View accessibilityViewIsModal style={styles.panel}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.heading}>
              <View>
                <Text accessibilityRole="header" style={styles.title}>
                  Your profile
                </Text>
                <Copy muted>A name and photo for your account.</Copy>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close profile"
                disabled={busy}
                onPress={() => setOpen(false)}
                style={styles.close}
              >
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>
            <View style={styles.photoRow}>
              <Avatar name={name || displayName} photo={photo} large />
              <View style={styles.photoActions}>
                <Button
                  compact
                  variant="secondary"
                  disabled={loading || busy || !profile}
                  loading={choosing}
                  onPress={() => {
                    void choosePhoto();
                  }}
                >
                  Choose photo
                </Button>
                {photo && (
                  <Button compact variant="quiet" disabled={busy} onPress={() => setPhoto(null)}>
                    Remove photo
                  </Button>
                )}
              </View>
            </View>
            <Copy muted style={{ fontSize: 12 }}>
              Photos are resized to 128 × 128 and stored privately. They are not included in the league table.
            </Copy>
            {loading && (
              <View style={styles.loading}>
                <ActivityIndicator color={palette.green} />
                <Copy muted>Loading your profile…</Copy>
              </View>
            )}
            {loadError && (
              <Notice
                tone="error"
                action={
                  <Button
                    compact
                    variant="secondary"
                    onPress={() => {
                      setLoading(true);
                      setLoadError(null);
                      setReload(value => value + 1);
                    }}
                  >
                    Retry
                  </Button>
                }
              >
                {loadError}
              </Notice>
            )}
            <Field
              label="Display name"
              value={name}
              onChangeText={setName}
              maxLength={40}
              autoCapitalize="words"
              autoComplete="name"
              editable={!loading && !busy && Boolean(profile)}
              hint="2–40 characters. This is a display name, not your sign-in email."
            />
            <View style={styles.email}>
              <Text style={styles.emailLabel}>Sign-in email</Text>
              <Copy>{user.email || 'Not available'}</Copy>
            </View>
            {message && <Notice tone={noticeTone}>{message}</Notice>}
            <View style={styles.buttons}>
              <Button variant="secondary" disabled={busy} onPress={() => setOpen(false)}>
                Close
              </Button>
              <Button
                disabled={loading || choosing || !profile}
                loading={saving}
                onPress={() => {
                  void saveProfile();
                }}
              >
                Save profile
              </Button>
            </View>
            <View style={styles.footer}>
              <Button
                compact
                variant="quiet"
                disabled={busy}
                onPress={() => {
                  void leave();
                }}
              >
                Sign out
              </Button>
            </View>
          </ScrollView>
        </View>
      </Dialog>
    </>
  );
}

const createStyles = (palette: ThemePalette) =>
  StyleSheet.create({
    trigger: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 44, maxWidth: 220 },
    nameColumn: { flexShrink: 1, gap: 3, alignItems: 'flex-end' },
    triggerName: { color: palette.ink, fontSize: 13, fontWeight: '700', maxWidth: 150 },
    triggerHint: { color: palette.muted, fontSize: 11 },
    avatar: {
      backgroundColor: palette.mint,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: palette.line,
    },
    initials: { color: palette.green, fontSize: 14, fontWeight: '700' },
    panel: { width: '100%', maxWidth: 480, maxHeight: '95%', backgroundColor: palette.paper, borderRadius: 18 },
    content: { padding: 24, gap: 20 },
    heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
    title: { color: palette.ink, fontSize: 23, fontWeight: '700', marginBottom: 4 },
    close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    closeText: { fontSize: 28, color: palette.muted, lineHeight: 32 },
    photoRow: { flexDirection: 'row', gap: 20, alignItems: 'center' },
    photoActions: { gap: 6, alignItems: 'flex-start' },
    email: { gap: 5, paddingTop: 2 },
    emailLabel: { fontSize: 12, color: palette.muted, fontWeight: '600' },
    loading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    buttons: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 10 },
    footer: { borderTopWidth: 1, borderColor: palette.line, paddingTop: 12, alignItems: 'flex-start' },
  });
