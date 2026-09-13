import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { LogOut } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from './nav-items';

type SidebarProps = {
  pendingCount?: number;
};

export function Sidebar({ pendingCount }: SidebarProps) {
  const { signOut, user } = useAuth();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 border-b border-sidebar-border px-4 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          L
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight">Lifty Admin</p>
          <p className="text-xs text-sidebar-foreground/70">Ops plataforma</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                  item.disabled && 'pointer-events-none opacity-40',
                )
              }
            >
              <Icon className="size-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.to === '/' && pendingCount != null && pendingCount > 0 ? (
                <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                  {pendingCount}
                </span>
              ) : null}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <p className="mb-2 truncate px-1 text-xs text-sidebar-foreground/60">
          {user?.email ?? 'Admin'}
        </p>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => void signOut()}
        >
          <LogOut className="size-4" />
          Cerrar sesión
        </Button>
      </div>
    </aside>
  );
}
