import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
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
import { useAppNavigation } from '../src/hooks/useAppNavigation';
import { queryClient } from '../src/lib/queryClient';
import { isTabBarRoute } from '../src/lib/tabBarRoutes';
import { theme } from '../src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function TabBarShell() {
  const { activeTab, setActiveTab } = useTabBar();
  const navigation = useAppNavigation();
  const pathname = usePathname();

  const handleTabPress = (tab: TabKey) => {
    setActiveTab(tab);
    if (tab === 'home') navigation.navigate('Active');
    if (tab === 'earnings') navigation.navigate('Earnings');
    if (tab === 'trips') navigation.navigate('TripHistory');
    if (tab === 'profile') navigation.navigate('Profile');
  };

  if (!isTabBarRoute(pathname)) return null;

  return <TabBar activeTab={activeTab} onTabPress={handleTabPress} />;
}

function RouteSync() {
  const pathname = usePathname();
  const { setActiveTab } = useTabBar();

  useEffect(() => {
    if (pathname === '/' || pathname === '/online' || pathname === '/active') {
      setActiveTab('home');
    } else if (pathname === '/earnings') {
      setActiveTab('earnings');
    } else if (pathname === '/trip-history') {
      setActiveTab('trips');
    } else if (pathname === '/profile' || pathname === '/cancellation-policy') {
      setActiveTab('profile');
    }
  }, [pathname, setActiveTab]);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return <BrandSplash />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <AuthProvider>
          <TabBarProvider>
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
