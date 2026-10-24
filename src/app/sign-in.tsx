import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { KarMark } from '@/components/logo';
import { Button, ErrorText, Ionicons, Screen, Txt } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { api, useAction } from '@/lib/api';

// Passwordless email code sign-in (free on Supabase; SMS OTP costs money per message).
// Own back arrow instead of the header's: it also works when the page was opened directly (goes to Explore).
const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
// Supabase lets one email ask for a new code only once every 60 seconds (Auth > Rate Limits).
const RESEND_WAIT = 60;

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [resendAt, setResendAt] = useState(0); // time (ms) when a new code may be asked for
  const [now, setNow] = useState(0);
  const insets = useSafeAreaInsets();
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));

  // Ticks once a second only while the countdown runs.
  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [resendAt]);

  const startWait = (seconds: number) => {
    setNow(Date.now());
    setResendAt(Date.now() + seconds * 1000);
  };

  const verify = useAction(async (c: string) => {
    await api.verifyEmailCode(email.trim().toLowerCase(), c.trim());
    leave();
  });
  const send = useAction(async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error('Enter a valid email');
    try {
      const { needsCode } = await api.signInWithEmail(email.trim().toLowerCase());
      if (!needsCode) return leave();
      startWait(RESEND_WAIT);
    } catch (e) {
      // "...only request this after 19 seconds": a code was already sent moments ago, so go to the
      // code screen with the countdown instead of showing a red error.
      const left = /after (\d+) seconds?/i.exec(e instanceof Error ? e.message : '');
      if (!left) throw e;
      startWait(Number(left[1]));
    }
    setCode('');
    verify.reset();
    setSent(true);
  });
  const google = useAction(async () => {
    if (await api.signInWithGoogle()) leave();
  });
  // Checks the code by itself once all 6 digits are in (typed, pasted or autofilled), no need to press Verify.
  const onCode = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && !verify.isPending) verify.mutate(digits);
  };

  // Full-screen modal on iPhone: SafeAreaView can measure 0 there and put the back arrow under the clock,
  // so pad by the phone's own notch / home-bar gaps instead.
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: C.bg,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}>
      <Screen edges={[]}>
        <Pressable onPress={leave} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={C.ink} />
        </Pressable>
        {/* One column, centred on the screen: fills a phone (32px from each edge), stays narrow on a laptop. */}
        <View style={styles.wrap}>
          <View style={{ alignItems: 'center', gap: S.sm, marginBottom: S.xl }}>
            <View style={{ marginBottom: S.lg }}>
              <KarMark size={56} />
            </View>
            <Txt v="h1" style={{ textAlign: 'center' }}>
              {sent ? 'Check your email' : 'Welcome to Kar'}
            </Txt>
            <Txt v="small" style={{ textAlign: 'center', fontSize: 14, lineHeight: 20 }}>
              {sent ? `We sent a 6-digit code to ${email}.` : 'Log in with Google or your email.'}
            </Txt>
          </View>
          {!sent ? (
            <>
              <GoogleButton onPress={() => google.mutate(undefined)} loading={google.isPending} />
              <ErrorText error={google.error} />
              <View style={styles.or}>
                <View style={styles.orLine} />
                <Txt v="small">or</Txt>
                <View style={styles.orLine} />
              </View>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@email.com"
                placeholderTextColor={C.muted}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                style={styles.input}
              />
              <Button title="Continue with email" onPress={() => send.mutate(undefined)} loading={send.isPending} style={styles.tall} />
              <ErrorText error={send.error} />
              <Txt v="tiny" style={{ textAlign: 'center', lineHeight: 17, marginTop: S.xl }}>
                By continuing you agree to Kar&apos;s{' '}
                <Link href="/legal/terms">
                  <Txt v="tiny" color={C.ink} underline>
                    Terms of Service
                  </Txt>
                </Link>{' '}
                and{' '}
                <Link href="/legal/privacy">
                  <Txt v="tiny" color={C.ink} underline>
                    Privacy Policy
                  </Txt>
                </Link>
                .
              </Txt>
            </>
          ) : (
            <>
              <TextInput
                value={code}
                onChangeText={onCode}
                placeholder="123456"
                placeholderTextColor={C.muted}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                maxLength={6}
                style={[styles.input, { letterSpacing: 8, textAlign: 'center', fontSize: 20 }]}
              />
              <Button
                title="Verify"
                onPress={() => verify.mutate(code)}
                loading={verify.isPending}
                disabled={code.length < 6}
                style={styles.tall}
              />
              <ErrorText error={verify.error} />
              {wait > 0 ? (
                <Txt v="small" style={{ textAlign: 'center', marginTop: S.md }}>
                  Resend code in {wait}s
                </Txt>
              ) : (
                <Button title="Resend code" variant="ghost" onPress={() => send.mutate(undefined)} loading={send.isPending} />
              )}
              <ErrorText error={send.error} />
              <Button title="Use a different email" variant="ghost" onPress={() => setSent(false)} />
            </>
          )}
        </View>
      </Screen>
    </View>
  );
}

// Google's sign-in branding rules: the full-colour "G" (never one colour), white fill,
// #747775 border, #1F1F1F text. https://developers.google.com/identity/branding-guidelines
function GoogleButton({ onPress, loading }: { onPress: () => void; loading: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={loading ? undefined : onPress}
      style={({ pressed }) => [
        styles.google,
        {
          opacity: loading ? 0.4 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}>
      {loading ? (
        <ActivityIndicator color="#1F1F1F" />
      ) : (
        <>
          <Svg width={18} height={18} viewBox="0 0 48 48">
            <Path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <Path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <Path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            />
            <Path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
          </Svg>
          <Text style={styles.googleText}>Continue with Google</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', padding: S.xs, marginLeft: -S.xs },
  wrap: {
    flexGrow: 1,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    paddingHorizontal: S.md,
    paddingBottom: S.xxl,
    gap: S.lg,
  },
  or: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
    marginVertical: S.xs,
  },
  orLine: { flex: 1, height: 1, backgroundColor: C.line },
  // Bigger tap targets on this page; 16px text: iOS Safari zooms into inputs with smaller text. Same height as the buttons.
  tall: { minHeight: 50 },
  google: {
    minHeight: 50,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: '#747775',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: S.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleText: { fontSize: 15, fontWeight: '600', color: '#1F1F1F' },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: C.lineStrong,
    borderRadius: R.sm,
    paddingHorizontal: S.md,
    fontSize: 16,
    color: C.ink,
    backgroundColor: C.bg,
  },
});
