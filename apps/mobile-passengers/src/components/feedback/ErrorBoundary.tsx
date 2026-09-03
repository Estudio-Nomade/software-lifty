import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';
import { Button } from '../Button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Surface the real cause to the browser console (and Metro terminal in dev).
    console.error(
      '[ErrorBoundary] caught error:',
      error?.message,
      error?.stack,
      info?.componentStack,
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Algo salió mal</Text>
          <Text style={styles.message}>Ocurrió un error inesperado. Reintentá.</Text>
          {__DEV__ && this.state.error ? (
            <ScrollView style={styles.debugBox} contentContainerStyle={styles.debugContent}>
              <Text style={styles.debugText}>{this.state.error.message}</Text>
              <Text style={styles.debugStack}>{this.state.error.stack}</Text>
            </ScrollView>
          ) : null}
          <Button variant="primary" onPress={this.handleRetry}>
            Reintentar
          </Button>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.white,
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
  },
  message: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
    fontFamily: theme.fontFamily.regular,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  debugBox: {
    width: '100%',
    maxHeight: 200,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.lg,
  },
  debugContent: {
    padding: theme.spacing.md,
  },
  debugText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    fontFamily: theme.fontFamily.semibold,
    marginBottom: theme.spacing.sm,
  },
  debugStack: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.mediumGray,
    fontFamily: theme.fontFamily.regular,
  },
});
