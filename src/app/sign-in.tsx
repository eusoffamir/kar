import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { KarMark } from '@/components/logo';
import { Button, ErrorText, Ionicons, Screen, Txt } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { api, useAction } from '@/lib/api';

// Passwordless email code sign-in (free on Supabase; SMS OTP costs money per message).
// Own back arrow instead of the header's: it also works when the page was opened directly (goes to Explore).
const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);

  const send = useAction(async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error('Enter a valid email');
    const { needsCode } = await api.signInWithEmail(email.trim().toLowerCase());
    if (needsCode) setSent(true);
    else leave();
  });
  const google = useAction(async () => {
    if (await api.signInWithGoogle()) leave();
  });
  const verify = useAction(async () => {
    await api.verifyEmailCode(email.trim().toLowerCase(), code.trim());
    leave();
  });

  return (
    <Screen edges={['top', 'bottom']}>
      <Pressable onPress={leave} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
        <Ionicons name="arrow-back" size={22} color={C.ink} />
      </Pressable>
      {/* One narrow column, centred on the screen on any size. */}
      <View style={styles.wrap}>
        <View style={{ alignItems: 'center', gap: S.sm, marginBottom: S.lg }}>
          <View style={{ marginBottom: S.md }}>
            <KarMark size={48} />
          </View>
          <Txt v="h1" style={{ textAlign: 'center' }}>{sent ? 'Check your email' : 'Welcome to Kar'}</Txt>
          <Txt v="small" style={{ textAlign: 'center' }}>
            {sent ? `We sent a 6-digit code to ${email}.` : 'Log in with Google or your email.'}
          </Txt>
        </View>
        {!sent ? (
          <>
            <Button title="Continue with Google" icon="logo-google" variant="outline" onPress={() => google.mutate(undefined)} loading={google.isPending} />
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
            <Button title="Continue with email" onPress={() => send.mutate(undefined)} loading={send.isPending} />
            <ErrorText error={send.error} />
            <Txt v="tiny" style={{ textAlign: 'center', marginTop: S.lg }}>
              By continuing you agree to Kar&apos;s{' '}
              <Link href="/legal/terms"><Txt v="tiny" color={C.ink} underline>Terms of Service</Txt></Link> and{' '}
              <Link href="/legal/privacy"><Txt v="tiny" color={C.ink} underline>Privacy Policy</Txt></Link>.
            </Txt>
          </>
        ) : (
          <>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor={C.muted}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              maxLength={6}
              style={[styles.input, { letterSpacing: 8, textAlign: 'center', fontSize: 20 }]}
            />
            <Button title="Verify" onPress={() => verify.mutate(undefined)} loading={verify.isPending} disabled={code.length < 6} />
            <ErrorText error={verify.error} />
            <Button title="Use a different email" variant="ghost" onPress={() => setSent(false)} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', padding: S.xs, marginLeft: -S.xs },
  wrap: { flexGrow: 1, justifyContent: 'center', width: '100%', maxWidth: 290, alignSelf: 'center', gap: S.md },
  or: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  orLine: { flex: 1, height: 1, backgroundColor: C.line },
  // 16px text: iOS Safari zooms into inputs with smaller text. Same height as the buttons.
  input: { minHeight: 44, borderWidth: 1, borderColor: C.lineStrong, borderRadius: R.sm, paddingHorizontal: S.md, fontSize: 16, color: C.ink, backgroundColor: C.bg },
});
