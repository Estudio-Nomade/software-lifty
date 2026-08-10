import { StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';
import { theme } from '../theme';

interface InputProps {
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  icon?: string;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  secureTextEntry?: boolean;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  style?: ViewStyle;
}

export function Input({
  placeholder,
  value,
  onChangeText,
  icon,
  keyboardType = 'default',
  secureTextEntry,
  error,
  disabled,
  autoFocus,
  style,
}: InputProps) {
  return (
    <View style={styles.container}>
      <View style={[styles.inputWrapper, error && styles.inputError, style]}>
        {icon ? <Text style={styles.icon}>{icon}</Text> : null}
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.mediumGray}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          editable={!disabled}
          autoFocus={autoFocus}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    height: theme.dimensions.inputHeight,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  inputError: {
    borderColor: theme.colors.dangerRed,
  },
  input: {
    flex: 1,
    fontFamily: theme.fontFamily.regular,
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
    padding: 0,
  },
  icon: {
    fontSize: 18,
    color: theme.colors.mediumGray,
  },
  errorText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: theme.fontSize.xs,
    color: theme.colors.dangerRed,
    marginTop: 4,
  },
});
