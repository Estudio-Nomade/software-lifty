import { usePathname } from 'expo-router';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

interface TabBarVisibilityContextValue {
  visible: boolean;
  setVisible: (visible: boolean) => void;
  resetVisible: () => void;
}

const TabBarVisibilityContext = createContext<TabBarVisibilityContextValue>({
  visible: true,
  setVisible: () => {},
  resetVisible: () => {},
});

export const useTabBarVisibility = () => useContext(TabBarVisibilityContext);

export function TabBarVisibilityProvider({ children }: { children: ReactNode }) {
  const [visible, setVisibleState] = useState(true);
  const pathname = usePathname();

  const setVisible = useCallback((next: boolean) => {
    setVisibleState((prev) => (prev === next ? prev : next));
  }, []);

  const resetVisible = useCallback(() => {
    setVisibleState(true);
  }, []);

  // New route → bar visible again (no sticky hide across tabs).
  useEffect(() => {
    setVisibleState(true);
  }, [pathname]);

  const value = useMemo(
    () => ({ visible, setVisible, resetVisible }),
    [visible, setVisible, resetVisible],
  );

  return (
    <TabBarVisibilityContext.Provider value={value}>{children}</TabBarVisibilityContext.Provider>
  );
}
