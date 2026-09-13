import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const LABELS: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  review: 'En review',
};

const STYLES: Record<string, string> = {
  pending: 'border-sky-300 bg-sky-50 text-sky-900',
  approved: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  rejected: 'border-red-300 bg-red-50 text-red-900',
  review: 'border-violet-300 bg-violet-50 text-violet-900',
};

export function ReviewBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn(STYLES[status] ?? STYLES.pending, className)}>
      {LABELS[status] ?? status}
    </Badge>
  );
}
