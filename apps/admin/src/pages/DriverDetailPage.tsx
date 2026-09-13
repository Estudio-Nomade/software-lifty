import { IdentificationBadge } from '@/components/IdentificationBadge';
import { ReviewBadge } from '@/components/ReviewBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, apiFetch } from '@/lib/api';
import type { DriverDetail, ReviewResult } from '@/lib/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, FileText } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

const DOC_LABELS: Record<string, string> = {
  license_front: 'Licencia (frente)',
  license_back: 'Licencia (dorso)',
  dni_front: 'DNI (frente)',
  dni_back: 'DNI (dorso)',
  vehicle_registration: 'Cédula verde',
  insurance: 'Seguro',
  criminal_record: 'Antecedentes',
  selfie: 'Selfie',
  vtv: 'VTV',
  profile_photo: 'Foto de perfil',
};

function isImageUrl(url: string) {
  return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) || url.includes('image');
}

function formatDate(value: string | null) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function DriverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [confirmAction, setConfirmAction] = useState<'approve' | 'reject' | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'driver', id],
    enabled: !!id,
    queryFn: () => apiFetch<DriverDetail>(`/admin/drivers/${id}`),
  });

  const reviewMutation = useMutation({
    mutationFn: (action: 'approve' | 'reject') =>
      apiFetch<ReviewResult>(`/admin/drivers/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ action, notes: notes.trim() || undefined }),
      }),
    onSuccess: (result) => {
      toast.success(
        result.action === 'approve'
          ? 'Conductor aprobado. Debe retirar stickers en tránsito.'
          : 'Conductor rechazado.',
      );
      void queryClient.invalidateQueries({ queryKey: ['admin', 'pending'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'driver', id] });
      setConfirmAction(null);
      if (result.action === 'approve' || result.action === 'reject') {
        navigate('/');
      }
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'No se pudo completar la acción';
      toast.error(msg);
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto w-full max-w-lg rounded-lg border border-destructive/30 bg-red-50 p-8 text-center">
        <p className="text-sm text-destructive">
          {(error as Error)?.message ?? 'No se encontró el conductor'}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/">Volver</Link>
          </Button>
          <Button onClick={() => void refetch()}>Reintentar</Button>
        </div>
      </div>
    );
  }

  const canReview = data.admin_review_status === 'pending';
  const activeDocs = data.documents.filter((d) => d.status !== 'superseded');

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" className="gap-1 px-0 text-muted-foreground" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" />
              Volver a pendientes
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight text-navy">
            {data.full_name || 'Sin nombre'}
          </h1>
          <div className="flex flex-wrap gap-2">
            <ReviewBadge status={data.admin_review_status} />
            <IdentificationBadge status={data.identification_status} />
          </div>
        </div>
        {canReview ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              onClick={() => setConfirmAction('reject')}
              disabled={reviewMutation.isPending}
            >
              Rechazar
            </Button>
            <Button onClick={() => setConfirmAction('approve')} disabled={reviewMutation.isPending}>
              Aprobar
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contacto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Email" value={data.email} />
            <Row label="Teléfono" value={data.phone} />
            <Row label="Alta" value={formatDate(data.created_at)} />
            <Row label="Distrito" value={data.district_id ? data.district_id.slice(0, 8) : '—'} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identidad / KYC</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="KYC" value={data.kyc_status} />
            <Row label="Nombre verificado" value={data.verified_name} />
            <Row
              label="DNI last4"
              value={data.document_number_last4 ? `••••${data.document_number_last4}` : null}
            />
            <Row label="Review notes" value={data.admin_review_notes} />
            <Row label="Identificación emitida" value={formatDate(data.identification_issued_at)} />
            <Row label="Ref. tránsito" value={data.identification_external_ref} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vehículos</CardTitle>
          <CardDescription>{data.vehicles.length} registrado(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {!data.vehicles.length ? (
            <p className="text-sm text-muted-foreground">Sin vehículo</p>
          ) : (
            <ul className="space-y-2">
              {data.vehicles.map((v) => (
                <li
                  key={v.id}
                  className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-navy"
                >
                  {[v.brand, v.model, v.year].filter(Boolean).join(' ') || 'Vehículo'}
                  {v.color ? ` · ${v.color}` : ''}
                  {v.plate ? ` · ${v.plate}` : ''}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documentos</CardTitle>
          <CardDescription>{activeDocs.length} activo(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm"
              >
                <div className="flex aspect-video items-center justify-center bg-muted">
                  {isImageUrl(doc.file_url) ? (
                    <img
                      src={doc.file_url}
                      alt={doc.doc_type}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <FileText className="size-10 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-navy">
                      {DOC_LABELS[doc.doc_type] ?? doc.doc_type}
                    </p>
                    <ReviewBadge
                      status={doc.status === 'pending_review' ? 'pending' : doc.status}
                    />
                  </div>
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Abrir <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {canReview ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notas de revisión</CardTitle>
            <CardDescription>Opcional en approve; recomendadas al rechazar.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones para el conductor u ops…"
              rows={4}
              maxLength={500}
            />
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={confirmAction != null} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction === 'approve' ? '¿Aprobar conductor?' : '¿Rechazar conductor?'}
            </DialogTitle>
            <DialogDescription>
              {confirmAction === 'approve'
                ? 'Se aprueba la review de plataforma. El conductor queda pending_pickup de stickers y NO podrá conectarse hasta que tránsito confirme la entrega.'
                : 'Se rechazan los documentos pendientes. El conductor deberá volver a subir papeles.'}
            </DialogDescription>
          </DialogHeader>
          <Separator />
          {notes.trim() ? (
            <p className="text-sm text-muted-foreground">
              Notas: <span className="text-foreground">{notes.trim()}</span>
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              Cancelar
            </Button>
            <Button
              variant={confirmAction === 'reject' ? 'destructive' : 'default'}
              disabled={reviewMutation.isPending}
              onClick={() => {
                if (confirmAction) reviewMutation.mutate(confirmAction);
              }}
            >
              {reviewMutation.isPending
                ? 'Guardando…'
                : confirmAction === 'approve'
                  ? 'Confirmar aprobación'
                  : 'Confirmar rechazo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[60%] text-right font-medium text-navy">{value || '—'}</span>
    </div>
  );
}
