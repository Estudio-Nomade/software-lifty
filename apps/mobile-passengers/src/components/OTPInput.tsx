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
        <TextInput
          key={i}
          ref={(ref) => {
            refs.current[i] = ref;
          }}
          style={[styles.cell, slot.length > 0 && styles.cellFilled]}
          value={slot}
          onChangeText={(d) => setDigit(i, d)}
          onKeyPress={(e) => handleKeyPress(i, e)}
          keyboardType="number-pad"
          maxLength={1}
          autoFocus={autoFocus && i === 0}
          selectTextOnFocus
        />
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
  cell: {
    flex: 1,
    maxWidth: 48,
    height: 56,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.white,
    borderWidth: 1.5,
    borderColor: theme.colors.mediumGray,
    fontFamily: theme.fontFamily.bold,
    fontSize: 24,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    padding: 0,
  },
  cellFilled: {
    borderColor: theme.colors.primary,
  },
});
