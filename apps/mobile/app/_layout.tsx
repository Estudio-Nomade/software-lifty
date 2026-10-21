import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppInitializer } from '../src/components/AppInitializer';
import { BrandSplash } from '../src/components/BrandSplash';
import { LocationSync } from '../src/components/LocationSync';
import { TabBar, type TabKey } from '../src/components/TabBar';
import { ConnectivityBanner } from '../src/components/feedback/ConnectivityBanner';
import { ErrorBoundary } from '../src/components/feedback/ErrorBoundary';
import { AuthProvider } from '../src/context/AuthContext';
import { TabBarProvider, useTabBar } from '../src/context/TabBarContext';
import { TabBarVisibilityProvider } from '../src/context/TabBarVisibilityContext';
import { useAppNavigation } from '../src/hooks/useAppNavigation';
import { queryClient } from '../src/lib/queryClient';
import {
  isSameTabRoute,
  isTabBarRoute,
  screenForTab,
  tabKeyFromPathname,
} from '../src/lib/tabBarRoutes';
import { theme } from '../src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function TabBarShell() {
  const { activeTab, setActiveTab } = useTabBar();
  const navigation = useAppNavigation();
  const pathname = usePathname();

  const handleTabPress = (tab: TabKey) => {
    setActiveTab(tab);
    // Tabs must replace, not push — otherwise stack grows and screens remount (loop).
    if (isSameTabRoute(pathname, tab)) return;
    navigation.replace(screenForTab(tab));
  };

  if (!isTabBarRoute(pathname)) return null;

  return <TabBar activeTab={activeTab} onTabPress={handleTabPress} />;
}

function RouteSync() {
  const pathname = usePathname();
  const { setActiveTab } = useTabBar();

  useEffect(() => {
    const tab = tabKeyFromPathname(pathname);
    if (tab) setActiveTab(tab);
  }, [pathname, setActiveTab]);

  return null;
}

const FONT_BOOT_TIMEOUT_MS = 2_500;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  // Android Expo Go can leave useFonts pending forever (asset race). Without a
  // timeout the whole tree never mounts → native/Brand splash stuck. iOS usually
  // resolves quickly; timeout only fires if fonts still pending.
  const [fontsTimedOut, setFontsTimedOut] = useState(false);

  useEffect(() => {
    if (fontsLoaded || fontError) return;
    const id = setTimeout(() => {
      console.log('[RootLayout] font boot timeout — mounting app without waiting');
      setFontsTimedOut(true);
    }, FONT_BOOT_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [fontsLoaded, fontError]);

  const fontsReady = fontsLoaded || !!fontError || fontsTimedOut;

  useEffect(() => {
    if (!fontsReady) return;
    console.log('[RootLayout] fontsReady', { fontsLoaded, fontError: !!fontError, fontsTimedOut });
    // Android Expo Go sometimes needs a second hide after first paint.
    SplashScreen.hideAsync().catch(() => {});
    const t = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [fontsReady, fontsLoaded, fontError, fontsTimedOut]);

  // While fonts load, keep brand stack (matches native splash-brand.png).
  if (!fontsReady) {
    return <BrandSplash />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <AuthProvider>
          <TabBarProvider>
            <TabBarVisibilityProvider>
              <SafeAreaView style={styles.root} edges={['left', 'right']}>
                <StatusBar style="auto" />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    animation: 'slide_from_right',
                    contentStyle: { backgroundColor: theme.colors.background },
                  }}
                />
                <TabBarShell />
                <RouteSync />
                <AppInitializer />
                <LocationSync />
                <ConnectivityBanner />
              </SafeAreaView>
            </TabBarVisibilityProvider>
          </TabBarProvider>
        </AuthProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
