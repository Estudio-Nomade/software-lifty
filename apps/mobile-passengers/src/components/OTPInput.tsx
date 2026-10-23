import { type ComponentRef, useRef } from 'react';
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';
import { theme } from '../theme';

type TextInputRef = ComponentRef<typeof TextInput>;

interface OTPInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}

export function OTPInput({ length = 6, value, onChange, autoFocus }: OTPInputProps) {
  const refs = useRef<Array<TextInputRef | null>>([]);
  const slots: string[] = Array.from({ length }, (_, i) => value[i] ?? '');

  const setDigit = (index: number, digit: string) => {
    const cleaned = digit.slice(-1);
    const next = value.slice(0, index) + cleaned + value.slice(index + 1);
    onChange(next.slice(0, length));
    if (cleaned) {
      refs.current[Math.min(index + 1, length - 1)]?.focus();
    }
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !slots[index] && index > 0) {
      refs.current[index - 1]?.focus();
      const next = value.slice(0, index - 1) + value.slice(index);
      onChange(next.slice(0, length));
    }
  };

  const onKeyPressAt =
    (index: number): NonNullable<TextInputProps['onKeyPress']> =>
    (e) => {
      handleKeyPress(index, e.nativeEvent.key);
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
            onKeyPress={onKeyPressAt(i)}
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
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  box: {
    width: 44,
    height: 52,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'transparent',
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxFilled: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  cell: {
    width: '100%',
    height: '100%',
    textAlign: 'center',
    fontSize: theme.fontSize.xl,
    color: theme.colors.deepBlue,
    padding: 0,
  },
});
