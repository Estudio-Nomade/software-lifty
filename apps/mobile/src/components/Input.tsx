import type React from 'react';
import {
  type StyleProp,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { theme } from '../theme';
import { Text } from './ui/Text';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  containerStyle,
  leftElement,
  rightElement,
  style,
  multiline,
  ...textInputProps
}) => {
  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.container,
          multiline ? styles.containerMultiline : undefined,
          error ? styles.errorBorder : undefined,
        ]}
      >
        {leftElement}
        <TextInput
          style={[styles.input, multiline ? styles.inputMultiline : undefined, style]}
          placeholderTextColor={theme.colors.mediumGray}
          multiline={multiline}
          {...textInputProps}
        />
        {rightElement}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: theme.dimensions.inputHeight,
    borderRadius: theme.radius.inputRadius,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  containerMultiline: {
    height: undefined,
    minHeight: theme.dimensions.inputHeight,
    alignItems: 'flex-start',
    paddingVertical: theme.spacing.sm,
  },
  input: {
    // minWidth:0 lets long text scroll/edit inside flex row (else clips to the end).
    flex: 1,
    minWidth: 0,
    width: '100%',
    fontSize: theme.fontSize.md,
    color: theme.colors.deepBlue,
    fontFamily: theme.fontFamily.regular,
    padding: 0,
  },
  inputMultiline: {
    minHeight: 44,
    textAlignVertical: 'top',
  },
  label: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.deepBlue,
    marginBottom: theme.spacing.sm,
  },
  errorBorder: {
    borderColor: theme.colors.dangerRed,
    backgroundColor: theme.colors.surface,
  },
  errorText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.dangerRed,
    marginTop: theme.spacing.xs,
  },
});
