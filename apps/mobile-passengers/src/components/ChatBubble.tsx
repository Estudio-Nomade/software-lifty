import type React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

interface ChatBubbleProps {
  message: string;
  isMine: boolean;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message, isMine }) => {
  return (
    <View style={[styles.bubble, isMine ? styles.mineBubble : styles.theirsBubble]}>
      <Text style={[styles.text, isMine ? styles.mineText : styles.theirsText]}>{message}</Text>
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
  mineBubble: {
    backgroundColor: theme.colors.primary,
    alignSelf: 'flex-end',
  },
  theirsBubble: {
    backgroundColor: theme.colors.lightGray,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
  },
  mineText: {
    color: theme.colors.white,
  },
  theirsText: {
    color: theme.colors.deepBlue,
  },
});
