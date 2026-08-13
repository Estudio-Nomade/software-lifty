import { and, eq, ne } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { driverDocuments, drivers, users, vehicles } from '../../shared/db/schema';
import { sendEmail } from '../../shared/lib/email';
import { logger } from '../../shared/lib/logger';

function sanitize(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function adminEmailsFromEnv(): string[] {
  const extra = process.env.ADMIN_EMAIL;
  if (!extra) return [];
  return extra
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
}

export async function notifyAdminsNewDocuments(
  driverName: string,
  driverId: string,
): Promise<void> {
  try {
    const adminRows = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.role, 'admin'));

    const recipients = new Set([
      ...adminRows.map((r) => r.email).filter((e): e is string => !!e),
      ...adminEmailsFromEnv(),
    ]);

    if (recipients.size === 0) {
      logger.info('[ADMIN-NOTIFY] No admin recipients configured');
      return;
    }

    const subject = 'Nuevo conductor para revisar';
    const html = `
      <p>El conductor <strong>${driverName}</strong> ha subido sus documentos y esta pendiente de revision.</p>
      <p>ID del conductor: ${driverId}</p>
    `;

    for (const email of recipients) {
      await sendEmail(email, subject, html);
    }
  } catch (err) {
    logger.error('[ADMIN-NOTIFY] Failed to send notifications', (err as Error).message);
  }
}

export async function notifyDriverApproved(driverEmail: string, driverName: string): Promise<void> {
  try {
    const subject = 'Tus documentos fueron aprobados';
    const html = `
      <p>Hola <strong>${driverName}</strong>,</p>
      <p>Tus documentos fueron <strong>aprobados</strong>. Ya podes empezar a conducir con Lifty.</p>
    `;
    await sendEmail(driverEmail, subject, html);
  } catch (err) {
    logger.error('[DRIVER-NOTIFY] Failed to send approved email', (err as Error).message);
  }
}

export async function notifyDriverRejected(
  driverEmail: string,
  driverName: string,
  reason?: string | null,
): Promise<void> {
  try {
    const subject = 'Tus documentos fueron rechazados';
    const html = `
      <p>Hola <strong>${driverName}</strong>,</p>
      <p>Tus documentos fueron <strong>rechazados</strong>.</p>
      ${reason ? `<p><strong>Motivo:</strong> ${reason}</p>` : ''}
      <p>Por favor volve a subir tus documentos en la app de Lifty.</p>
    `;
    await sendEmail(driverEmail, subject, html);
  } catch (err) {
    logger.error('[DRIVER-NOTIFY] Failed to send rejected email', (err as Error).message);
  }
}

function generateApprovalToken(): string {
  return crypto.randomUUID();
}

async function gatherDriverData(driverId: string): Promise<{
  fullName: string;
  phone: string;
  email: string | null;
  kycStatus: string;
  verifiedName: string | null;
  vehicle: {
    type: string;
    plate: string;
    brand: string;
    model: string;
    year: number;
    color: string;
  } | null;
  documents: Array<{ type: string; front: string | null; back: string | null }>;
} | null> {
  const [d] = await db
    .select({
      fullName: users.full_name,
      phone: users.phone,
      email: users.email,
      kycStatus: users.kyc_status,
      verifiedName: users.verified_name,
      vehicleType: vehicles.vehicle_type,
      vehiclePlate: vehicles.plate,
      vehicleBrand: vehicles.brand,
      vehicleModel: vehicles.model,
      vehicleYear: vehicles.year,
      vehicleColor: vehicles.color,
    })
    .from(drivers)
    .innerJoin(users, eq(users.id, drivers.user_id))
    .leftJoin(vehicles, eq(vehicles.driver_id, drivers.id))
    .where(eq(drivers.id, driverId))
    .limit(1);

  if (!d) return null;

  const rawDocs = await db
    .select({ doc_type: driverDocuments.doc_type, file_url: driverDocuments.file_url })
    .from(driverDocuments)
    .where(
      and(
        eq(driverDocuments.driver_id, driverId),
        ne(driverDocuments.status, 'superseded'),
        ne(driverDocuments.status, 'rejected'),
      ),
    );

  const docMap: Record<string, { front: string | null; back: string | null }> = {};
  for (const doc of rawDocs) {
    const isBack = doc.doc_type.endsWith('_back');
    const isFront = doc.doc_type.endsWith('_front');
    if (!isBack && !isFront) continue;
    const base = doc.doc_type.replace(/_(front|back)$/, '');
    if (!docMap[base]) docMap[base] = { front: null, back: null };
    if (isFront) docMap[base].front = doc.file_url;
    else docMap[base].back = doc.file_url;
  }

  const documentLabelMap: Record<string, string> = {
    license: 'Licencia de conducir',
    registration: 'Cedula del vehiculo',
    insurance: 'Seguro del vehiculo',
    background_check: 'Certificado de antecedentes',
    rndg: 'Registro Nacional de Datos Geneticos (RNDG)',
  };

  return {
    fullName: d.fullName ?? 'Sin nombre',
    phone: d.phone ?? 'Sin telefono',
    email: d.email,
    kycStatus: d.kycStatus,
    verifiedName: d.verifiedName,
    vehicle: d.vehicleType
      ? {
          type: d.vehicleType,
          plate: d.vehiclePlate ?? '',
          brand: d.vehicleBrand ?? '',
          model: d.vehicleModel ?? '',
          year: d.vehicleYear ?? 0,
          color: d.vehicleColor ?? '',
        }
      : null,
    documents: Object.entries(docMap).map(([type, urls]) => ({
      type: documentLabelMap[type] ?? type,
      front: urls.front,
      back: urls.back,
    })),
  };
}

export async function notifyAdminNewDriver(driverId: string): Promise<void> {
  try {
    const data = await gatherDriverData(driverId);
    if (!data) return;

    const token = generateApprovalToken();
    await db.update(drivers).set({ approval_token: token }).where(eq(drivers.id, driverId));

    const adminRows = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.role, 'admin'));

    const recipients = new Set([
      ...adminRows.map((r) => r.email).filter((e): e is string => !!e),
      ...adminEmailsFromEnv(),
    ]);

    if (recipients.size === 0) {
      logger.info('[ADMIN-NOTIFY] No admin recipients configured');
      return;
    }

    const apiUrl = process.env.API_URL ?? 'http://localhost:3000/api';
    const approveUrl = `${apiUrl}/admin/approve?token=${token}`;

    const vehicleHtml = data.vehicle
      ? `<tr><td><strong>Vehiculo</strong></td><td>${sanitize(data.vehicle.brand)} ${sanitize(data.vehicle.model)} (${data.vehicle.year}) — ${sanitize(data.vehicle.color)} — Patente: ${sanitize(data.vehicle.plate)} — Tipo: ${sanitize(data.vehicle.type)}</td></tr>`
      : '';

    const docsHtml = data.documents
      .map(
        (d) =>
          `<tr><td><strong>${sanitize(d.type)}</strong></td><td>${d.front ? `<a href="${d.front}">Frente</a>` : '—'} ${d.back ? `| <a href="${d.back}">Dorso</a>` : ''}</td></tr>`,
      )
      .join('');

    const subject = `Nuevo conductor: ${data.fullName}`;
    const html = `<h2>Nuevo conductor registrado</h2>
<table style="border-collapse:collapse;width:100%;max-width:600px">
<tr><td style="padding:8px;border:1px solid #ddd"><strong>Nombre</strong></td><td style="padding:8px;border:1px solid #ddd">${sanitize(data.fullName)}</td></tr>
<tr><td style="padding:8px;border:1px solid #ddd"><strong>Telefono</strong></td><td style="padding:8px;border:1px solid #ddd">${sanitize(data.phone)}</td></tr>
<tr><td style="padding:8px;border:1px solid #ddd"><strong>Email</strong></td><td style="padding:8px;border:1px solid #ddd">${data.email ? sanitize(data.email) : '—'}</td></tr>
<tr><td style="padding:8px;border:1px solid #ddd"><strong>Verificado (DIDIT)</strong></td><td style="padding:8px;border:1px solid #ddd">${data.verifiedName ? sanitize(data.verifiedName) : '—'}</td></tr>
<tr><td style="padding:8px;border:1px solid #ddd"><strong>Estado KYC</strong></td><td style="padding:8px;border:1px solid #ddd">${sanitize(data.kycStatus)}</td></tr>
${vehicleHtml}
${docsHtml}
</table>
<br/>
<a href="${approveUrl}" style="display:inline-block;padding:12px 24px;background:#00C2B3;color:white;text-decoration:none;border-radius:6px;font-weight:bold">Aceptar conductor</a>
<br/><br/>
<p style="color:#888;font-size:12px">ID: ${driverId}</p>`;

    for (const email of recipients) {
      await sendEmail(email, subject, html);
    }
  } catch (err) {
    logger.error('[ADMIN-NOTIFY] Failed to send', (err as Error).message);
  }
}
