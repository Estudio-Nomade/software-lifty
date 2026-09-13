import { apiFetch } from '@/lib/api';
import type { PendingDriver } from '@/lib/types';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const { data } = useQuery({
    queryKey: ['admin', 'pending'],
    queryFn: () => apiFetch<PendingDriver[]>('/admin/drivers/pending'),
    refetchInterval: 30_000,
  });

  return (
    <div className="flex h-full min-h-dvh w-full bg-background">
      <Sidebar pendingCount={data?.length ?? 0} />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
