import { useRef } from 'react';
import {
  type NativeSyntheticEvent,
  StyleSheet,
  TextInput,
  type TextInputKeyPressEventData,
  View,
} from 'react-native';
import { theme } from '../theme';

interface OTPInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}

export function OTPInput({ length = 6, value, onChange, autoFocus }: OTPInputProps) {
  const refs = useRef<Array<TextInput | null>>([]);
  const slots: string[] = Array.from({ length }, (_, i) => value[i] ?? '');

  const setDigit = (index: number, digit: string) => {
    const cleaned = digit.slice(-1);
    const next = value.slice(0, index) + cleaned + value.slice(index + 1);
    onChange(next.slice(0, length));
    if (cleaned) {
      refs.current[Math.min(index + 1, length - 1)]?.focus();
    }
  };

  const handleKeyPress = (index: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (e.nativeEvent.key === 'Backspace' && !slots[index] && index > 0) {
      refs.current[index - 1]?.focus();
      const next = value.slice(0, index - 1) + value.slice(index);
      onChange(next.slice(0, length));
    }
  };

  return (
    <View style={styles.container}>
      {slots.map((slot, i) => (
        <View key={i} style={[styles.box, slot.length > 0 && styles.boxFilled]}>
          <TextInput
            ref={(ref) => {
              refs.current[i] = ref;
            }}
            style={styles.cell}
            value={slot}
            onChangeText={(d) => setDigit(i, d)}
            onKeyPress={(e) => handleKeyPress(i, e)}
            keyboardType="number-pad"
            maxLength={1}
            autoFocus={autoFocus && i === 0}
            selectTextOnFocus
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'center',
    width: '100%',
  },
  box: {
    flex: 1,
    maxWidth: 52,
    height: 56,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxFilled: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  cell: {
    width: '100%',
    fontFamily: theme.fontFamily.bold,
    fontSize: theme.fontSize.xl,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    padding: 0,
  },
});
