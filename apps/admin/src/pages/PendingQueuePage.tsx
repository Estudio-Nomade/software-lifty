import { IdentificationBadge } from '@/components/IdentificationBadge';
import { ReviewBadge } from '@/components/ReviewBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiFetch } from '@/lib/api';
import type { PendingDriver } from '@/lib/types';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function PendingQueuePage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'pending'],
    queryFn: () => apiFetch<PendingDriver[]>('/admin/drivers/pending'),
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy">Cola de revisión</h1>
          <p className="text-sm text-muted-foreground">
            Conductores con documentos en review de plataforma (eje A).
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pendientes</CardTitle>
          <CardDescription>
            {isLoading
              ? 'Cargando…'
              : `${data?.length ?? 0} conductor${(data?.length ?? 0) === 1 ? '' : 'es'} en cola`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : isError ? (
            <div className="rounded-lg border border-destructive/30 bg-red-50 p-6 text-center">
              <p className="text-sm text-destructive">
                {(error as Error)?.message ?? 'No se pudo cargar la cola'}
              </p>
              <Button className="mt-3" variant="outline" onClick={() => void refetch()}>
                Reintentar
              </Button>
            </div>
          ) : !data?.length ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/40 px-6 py-16 text-center">
              <p className="text-base font-medium text-navy">No hay conductores en review</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Cuando suban docs y queden en cola, aparecen acá.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Docs</TableHead>
                    <TableHead>KYC</TableHead>
                    <TableHead>Review</TableHead>
                    <TableHead>Identificación</TableHead>
                    <TableHead>Ingreso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row) => (
                    <TableRow key={row.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <Link
                          to={`/drivers/${row.id}`}
                          className="font-medium text-navy underline-offset-4 hover:underline"
                        >
                          {row.full_name || 'Sin nombre'}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div>{row.email || '—'}</div>
                        <div>{row.phone || '—'}</div>
                      </TableCell>
                      <TableCell>{row.documents_submitted}</TableCell>
                      <TableCell className="capitalize">{row.kyc_status ?? '—'}</TableCell>
                      <TableCell>
                        <ReviewBadge status={row.admin_review_status || row.status} />
                      </TableCell>
                      <TableCell>
                        <IdentificationBadge status={row.identification_status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(row.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
