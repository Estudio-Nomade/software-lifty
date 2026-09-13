import { ClipboardList, type LucideIcon } from 'lucide-react';

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
};

export const NAV_ITEMS: NavItem[] = [{ to: '/', label: 'Pendientes', icon: ClipboardList }];
