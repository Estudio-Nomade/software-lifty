import { Badge } from '@/components/ui/badge';
import type { IdentificationStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const LABELS: Record<IdentificationStatus, string> = {
  pending_pickup: 'Pendiente retiro en tránsito',
  issued: 'Emitida',
  revoked: 'Revocada',
};

const STYLES: Record<IdentificationStatus, string> = {
  pending_pickup: 'border-amber-300 bg-amber-50 text-amber-900',
  issued: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  revoked: 'border-red-300 bg-red-50 text-red-900',
};

export function IdentificationBadge({
  status,
  className,
}: {
  status?: IdentificationStatus | null;
  className?: string;
}) {
  const value = status ?? 'pending_pickup';
  return (
    <Badge variant="outline" className={cn(STYLES[value], className)}>
      {LABELS[value]}
    </Badge>
  );
}
