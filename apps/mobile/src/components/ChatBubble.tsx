import type React from 'react';
import { StyleSheet, View } from 'react-native';
import { theme } from '../theme';
import { Text } from './ui/Text';

interface ChatBubbleProps {
  message: string;
  isDriver: boolean;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message, isDriver }) => {
  return (
    <View style={[styles.bubble, isDriver ? styles.driverBubble : styles.passengerBubble]}>
      <Text style={[styles.text, isDriver ? styles.driverText : styles.passengerText]}>
        {message}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '75%',
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: theme.spacing.sm,
  },
  driverBubble: {
    backgroundColor: theme.colors.deepBlue,
    alignSelf: 'flex-end',
  },
  passengerBubble: {
    backgroundColor: theme.colors.lightGray,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: theme.fontSize.sm,
  },
  driverText: {
    color: theme.colors.white,
  },
  passengerText: {
    color: theme.colors.deepBlue,
  },
});
