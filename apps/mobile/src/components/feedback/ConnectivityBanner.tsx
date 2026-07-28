import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../theme';
import { Text } from '../ui/Text';

export const ConnectivityBanner: React.FC = () => {
  const [isOffline, setIsOffline] = useState(false);
  const [animatedOut, setAnimatedOut] = useState(true);
  const translateY = useRef(new Animated.Value(-100)).current;
  const insets = useSafeAreaInsets();
  const offlineRef = useRef(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = state.isConnected === true;
      const disconnected = state.isConnected === false;
      if (disconnected && !offlineRef.current) {
        offlineRef.current = true;
        setIsOffline(true);
        setAnimatedOut(false);
      } else if (connected && offlineRef.current) {
        offlineRef.current = false;
        Animated.timing(translateY, {
          toValue: -100,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          setIsOffline(false);
          setAnimatedOut(true);
        });
      }
    });

    return () => unsubscribe();
  }, [translateY]);

  useEffect(() => {
    if (isOffline) {
      translateY.setValue(-100);
      Animated.timing(translateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isOffline, translateY]);

  if (animatedOut) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { paddingTop: insets.top + theme.spacing.sm, transform: [{ translateY }] },
      ]}
    >
      <Text style={styles.text}>Sin conexion. Los viajes activos se guardan.</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: 'rgba(255, 176, 32, 0.15)',
  },
  text: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    textAlign: 'center',
    fontWeight: theme.fontWeight.medium,
  },
});
