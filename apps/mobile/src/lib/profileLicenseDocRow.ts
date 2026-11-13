import type { DriverDocument } from '../api/types';

export type ProfessionalLicensePhase =
  | 'not_started'
  | 'grace'
  | 'overdue'
  | 'satisfied'
  | 'not_applicable'
  | string
  | null
  | undefined;

export type LicenseDocRowIcon = 'add' | 'close' | 'check' | 'time' | 'alert';

export type LicenseDocRowPresentation = {
  label: string;
  status: string;
  statusTone: 'default' | 'danger' | 'amber';
  cta: 'Subir' | 'Volver a subir';
  icon: LicenseDocRowIcon;
};

function docsStatusLabel(docs: DriverDocument[]): string {
  if (docs.length === 0) return 'No cargado';
  if (docs.some((d) => d.status === 'rejected')) return 'Rechazado';
  if (docs.some((d) => d.status === 'pending_review')) return 'Pendiente de revision';
  if (docs.every((d) => d.status === 'approved' || !!d.verified_at)) return 'Verificado';
  return 'Pendiente';
}

function docsStatusIcon(docs: DriverDocument[]): LicenseDocRowIcon {
  if (docs.length === 0) return 'add';
  if (docs.some((d) => d.status === 'rejected')) return 'close';
  if (docs.every((d) => d.status === 'approved' || !!d.verified_at)) return 'check';
  if (docs.some((d) => d.status === 'pending_review')) return 'time';
  return 'time';
}

/**
 * Single Perfil Documentos row for licencia (includes professional grace copy).
 * Product lock: never a separate "Carnet profesional" title row.
 */
export function licenseDocRowPresentation(opts: {
  docsFor: DriverDocument[];
  professionalCopy: string | null;
  professionalPhase?: ProfessionalLicensePhase;
}): LicenseDocRowPresentation {
  const { docsFor, professionalCopy, professionalPhase } = opts;
  const cta = docsFor.length > 0 ? 'Volver a subir' : 'Subir';

  if (professionalCopy) {
    if (professionalPhase === 'overdue') {
      return {
        label: 'Licencia de conducir',
        status: professionalCopy,
        statusTone: 'danger',
        cta,
        icon: 'alert',
      };
    }
    return {
      label: 'Licencia de conducir',
      status: professionalCopy,
      statusTone: 'amber',
      cta,
      icon: 'time',
    };
  }

  const icon = docsStatusIcon(docsFor);
  return {
    label: 'Licencia de conducir',
    status: docsStatusLabel(docsFor),
    statusTone: icon === 'close' ? 'danger' : 'default',
    cta,
    icon,
  };
}
