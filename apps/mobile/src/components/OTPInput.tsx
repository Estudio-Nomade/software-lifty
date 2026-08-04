import type React from 'react';
import { useRef } from 'react';
import { TextInput as RNTextInput, StyleSheet, View } from 'react-native';
import { theme } from '../theme';

interface OTPInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
}

export const OTPInput: React.FC<OTPInputProps> = ({ length = 4, value, onChange }) => {
  const refs = useRef<RNTextInput[]>([]);

  const handleChange = (text: string, index: number) => {
    const char = text.slice(-1);
    const newValue = value.split('');
    newValue[index] = char;
    const joined = newValue.join('').slice(0, length);
    onChange(joined);

    if (char && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !value[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  return (
    <View style={styles.container}>
      {Array.from({ length }).map((_, index) => (
        <View key={index} style={[styles.box, value[index] ? styles.boxFilled : null]}>
          <RNTextInput
            ref={(ref) => {
              if (ref) refs.current[index] = ref;
            }}
            style={styles.input}
            value={value[index] || ''}
            onChangeText={(text) => handleChange(text, index)}
            onKeyPress={(e) => handleKeyPress(e, index)}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={1}
            blurOnSubmit={false}
            selectTextOnFocus
            autoComplete="off"
            importantForAutofill="no"
          />
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'center',
  },
  box: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.white,
  },
  boxFilled: {
    borderColor: theme.colors.turquoise,
  },
  input: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    padding: 0,
    width: '100%',
  },
});
