import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Choice } from '@/components/car-form';
import { Button, Row, Screen, Txt } from '@/components/ui';
import { S } from '@/constants/theme';

/** Step 0 of "Register your car": who is registering. Both go on to the same car steps. */
export default function Register() {
  const [as, setAs] = useState<'student' | 'operator' | null>(null);
  return (
    <Screen
      edges={['bottom']}
      footer={<Button title="Next" variant="dark" disabled={!as} onPress={() => router.replace({ pathname: '/host/new-car', params: { as: as! } })} />}>
      <View style={{ gap: S.xs }}>
        <Txt v="h1">Who are you?</Txt>
        <Txt v="small">Rental businesses also send their SSM, permit and insurance at the end.</Txt>
      </View>
      <Row>
        <Choice icon="school-outline" label="Student" selected={as === 'student'} onPress={() => setAs('student')} />
        <Choice icon="business-outline" label="Rental operator" selected={as === 'operator'} onPress={() => setAs('operator')} />
      </Row>
    </Screen>
  );
}
