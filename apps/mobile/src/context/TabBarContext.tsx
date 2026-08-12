import { type ReactNode, createContext, useContext, useState } from 'react';
import type { TabKey } from '../components/TabBar';

interface TabBarContextValue {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
}

const TabBarContext = createContext<TabBarContextValue>({
  activeTab: 'home',
  setActiveTab: () => {},
});

export const useTabBar = () => useContext(TabBarContext);

export const TabBarProvider = ({ children }: { children: ReactNode }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('home');

  return (
    <TabBarContext.Provider value={{ activeTab, setActiveTab }}>{children}</TabBarContext.Provider>
  );
};
