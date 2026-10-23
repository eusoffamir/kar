import { Link, router } from 'expo-router';
import { useState } from 'react';
import { TextInput } from 'react-native';

import { KarMark } from '@/components/logo';
import { Button, ErrorText, Screen, Txt } from '@/components/ui';
import { C, R, S } from '@/constants/theme';
import { api, useAction } from '@/lib/api';

// Passwordless email code sign-in (free on Supabase; SMS OTP costs money per message).
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);

  const send = useAction(async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error('Enter a valid email');
    const { needsCode } = await api.signInWithEmail(email.trim().toLowerCase());
    if (needsCode) setSent(true);
    else router.back();
  });
  const google = useAction(async () => {
    if (await api.signInWithGoogle()) router.back();
  });
  const verify = useAction(async () => {
    await api.verifyEmailCode(email.trim().toLowerCase(), code.trim());
    router.back();
  });

  return (
    <Screen edges={['bottom']}>
      <KarMark size={56} />
      <Txt v="h1">{sent ? 'Check your email' : 'Welcome to Kar'}</Txt>
      <Txt>
        {sent
          ? `We sent a 6-digit code to ${email}.`
          : 'Log in with Google, or with your email and a 6-digit code. No password needed.'}
      </Txt>
      {!sent ? (
        <>
          <Button title="Continue with Google" icon="logo-google" variant="outline" onPress={() => google.mutate(undefined)} loading={google.isPending} />
          <ErrorText error={google.error} />
          <Txt v="small" style={{ textAlign: 'center' }}>or use your email</Txt>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@email.com"
            placeholderTextColor={C.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            style={input}
          />
          <Button title="Continue" onPress={() => send.mutate(undefined)} loading={send.isPending} />
          <ErrorText error={send.error} />
          <Txt v="small">
            By continuing you agree to Kar&apos;s{' '}
            <Link href="/legal/terms"><Txt v="small" color={C.ink} underline>Terms of Service</Txt></Link> and{' '}
            <Link href="/legal/privacy"><Txt v="small" color={C.ink} underline>Privacy Policy</Txt></Link>.
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
            style={[input, { letterSpacing: 8, textAlign: 'center', fontSize: 22 }]}
          />
          <Button title="Verify" onPress={() => verify.mutate(undefined)} loading={verify.isPending} disabled={code.length < 6} />
          <ErrorText error={verify.error} />
          <Button title="Use a different email" variant="ghost" onPress={() => setSent(false)} />
        </>
      )}
    </Screen>
  );
}

const input = {
  borderWidth: 1,
  borderColor: C.line,
  borderRadius: R.md,
  padding: S.md,
  fontSize: 16,
  color: C.ink,
  backgroundColor: C.card,
};
