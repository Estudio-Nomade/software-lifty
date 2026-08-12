import { useFonts } from '@expo-google-fonts/nunito';
import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_500Medium } from '@expo-google-fonts/nunito/500Medium';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppInitializer } from '../src/components/AppInitializer';
import { TabBar, type TabKey } from '../src/components/TabBar';
import { ConnectivityBanner } from '../src/components/feedback/ConnectivityBanner';
import { ErrorBoundary } from '../src/components/feedback/ErrorBoundary';
import { AuthProvider } from '../src/context/AuthContext';
import { TabBarProvider, useTabBar } from '../src/context/TabBarContext';
import { useAppNavigation } from '../src/hooks/useAppNavigation';
import { queryClient } from '../src/lib/queryClient';
import { useOnlineStore } from '../src/store/onlineStore';
import { theme } from '../src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function TabBarShell() {
  const { activeTab, setActiveTab } = useTabBar();
  const navigation = useAppNavigation();
  const isOnline = useOnlineStore((s) => s.isOnline);

  const handleTabPress = (tab: TabKey) => {
    setActiveTab(tab);
    if (tab === 'home') navigation.navigate(isOnline ? 'Active' : 'Online');
    if (tab === 'earnings') navigation.navigate('Earnings');
    if (tab === 'trips') navigation.navigate('TripHistory');
    if (tab === 'profile') navigation.navigate('Profile');
  };

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
    } else if (pathname === '/profile') {
      setActiveTab('profile');
    }
  }, [pathname, setActiveTab]);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
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
                  contentStyle: { backgroundColor: theme.colors.white },
                }}
              />
              <TabBarShell />
              <RouteSync />
              <AppInitializer />
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
    backgroundColor: theme.colors.white,
  },
});
