import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { districts, drivers, users, vehicles } from '../../shared/db/schema';
import { NotFoundError } from '../../shared/lib/errors';
import { evaluateIdentificationDeadline } from '../../shared/lib/identification-deadline';
import { logger } from '../../shared/lib/logger';
import type { AuthUser } from '../../shared/middleware/auth';
import { transitBridgeService } from '../transit-bridge/service';
import type { TransitIssueBody } from './schema';

function escapeIlike(raw: string): string {
  return raw.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function mapLiftyStatus(input: {
  status: string;
  admin_review_status: string;
  identification_phase: string;
}): 'approved' | 'suspended' | 'rejected' | 'pending_review' {
  if (input.admin_review_status === 'rejected' || input.status === 'rejected') {
    return 'rejected';
  }
  if (input.status === 'review' || input.admin_review_status === 'pending') {
    return 'pending_review';
  }
  if (input.identification_phase === 'paused' || input.identification_phase === 'revoked') {
    return 'suspended';
  }
  if (input.status === 'approved' && input.admin_review_status === 'approved') {
    return 'approved';
  }
  return 'pending_review';
}

function mapRow(row: {
  id: string;
  full_name: string | null;
  phone: string | null;
  document_number: string | null;
  document_number_last4: string | null;
  status: string;
  admin_review_status: string;
  identification_status: string;
  identification_issued_at: Date | null;
  identification_external_ref: string | null;
  approved_at: Date | null;
  admin_reviewed_at: Date | null;
  created_at: Date;
  district_id: string | null;
  district_name: string | null;
  plate: string | null;
  vehicle_type: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
}) {
  const identification = evaluateIdentificationDeadline({
    identification_status: row.identification_status,
    approved_at: row.approved_at,
    admin_reviewed_at: row.admin_reviewed_at,
    created_at: row.created_at,
  });
  const lifty_status = mapLiftyStatus({
    status: row.status,
    admin_review_status: row.admin_review_status,
    identification_phase: identification.phase,
  });

  return {
    id: row.id,
    full_name: row.full_name,
    phone: row.phone,
    document_number_last4:
      row.document_number_last4 ??
      (row.document_number ? row.document_number.replace(/\D/g, '').slice(-4) : null),
    status: row.status,
    admin_review_status: row.admin_review_status,
    identification_status: row.identification_status,
    identification_issued_at: row.identification_issued_at?.toISOString() ?? null,
    identification_external_ref: row.identification_external_ref,
    identification_phase: identification.phase,
    identification_blocks_online: identification.blocks_online,
    lifty_status,
    district_id: row.district_id,
    district_name: row.district_name,
    plate: row.plate,
    vehicle_type: row.vehicle_type,
    vehicle_brand: row.brand,
    vehicle_model: row.model,
    vehicle_color: row.color,
    vehicle: row.plate
      ? {
          type: row.vehicle_type === 'moto' ? 'moto' : 'car',
          plate: row.plate,
          brand: row.brand,
          model: row.model,
          color: row.color,
        }
      : null,
    history: [] as Array<Record<string, unknown>>,
  };
}

const selectFields = {
  id: drivers.id,
  full_name: users.full_name,
  phone: users.phone,
  document_number: users.document_number,
  document_number_last4: users.document_number_last4,
  status: drivers.status,
  admin_review_status: drivers.admin_review_status,
  identification_status: drivers.identification_status,
  identification_issued_at: drivers.identification_issued_at,
  identification_external_ref: drivers.identification_external_ref,
  approved_at: drivers.approved_at,
  admin_reviewed_at: drivers.admin_reviewed_at,
  created_at: drivers.created_at,
  district_id: drivers.district_id,
  district_name: districts.name,
  plate: sql<string | null>`(
    SELECT ${vehicles.plate} FROM ${vehicles}
    WHERE ${vehicles.driver_id} = ${drivers.id}
    ORDER BY ${vehicles.created_at} DESC
    LIMIT 1
  )`,
  vehicle_type: sql<string | null>`(
    SELECT ${vehicles.vehicle_type} FROM ${vehicles}
    WHERE ${vehicles.driver_id} = ${drivers.id}
    ORDER BY ${vehicles.created_at} DESC
    LIMIT 1
  )`,
  brand: sql<string | null>`(
    SELECT ${vehicles.brand} FROM ${vehicles}
    WHERE ${vehicles.driver_id} = ${drivers.id}
    ORDER BY ${vehicles.created_at} DESC
    LIMIT 1
  )`,
  model: sql<string | null>`(
    SELECT ${vehicles.model} FROM ${vehicles}
    WHERE ${vehicles.driver_id} = ${drivers.id}
    ORDER BY ${vehicles.created_at} DESC
    LIMIT 1
  )`,
  color: sql<string | null>`(
    SELECT ${vehicles.color} FROM ${vehicles}
    WHERE ${vehicles.driver_id} = ${drivers.id}
    ORDER BY ${vehicles.created_at} DESC
    LIMIT 1
  )`,
};

export const transitService = {
  async getStats() {
    const [totals] = await db
      .select({
        total_drivers: sql<number>`count(*)::int`,
        pending_pickup: sql<number>`count(*) filter (where ${drivers.identification_status} = 'pending_pickup')::int`,
        issued_this_month: sql<number>`count(*) filter (
          where ${drivers.identification_status} = 'issued'
          and ${drivers.identification_issued_at} is not null
          and date_trunc('month', ${drivers.identification_issued_at}) = date_trunc('month', now())
        )::int`,
      })
      .from(drivers)
      .where(and(eq(drivers.status, 'approved'), eq(drivers.admin_review_status, 'approved')));

    // suspended = platform-approved + pending_pickup past 30d pause window
    const approvedPending = await db
      .select({
        identification_status: drivers.identification_status,
        approved_at: drivers.approved_at,
        admin_reviewed_at: drivers.admin_reviewed_at,
        created_at: drivers.created_at,
      })
      .from(drivers)
      .where(
        and(
          eq(drivers.status, 'approved'),
          eq(drivers.admin_review_status, 'approved'),
          eq(drivers.identification_status, 'pending_pickup'),
        ),
      );

    let suspended = 0;
    for (const row of approvedPending) {
      const snap = evaluateIdentificationDeadline(row);
      if (snap.phase === 'paused' || snap.blocks_online) suspended += 1;
    }

    return {
      total_drivers: totals?.total_drivers ?? 0,
      pending_pickup: totals?.pending_pickup ?? 0,
      issued_this_month: totals?.issued_this_month ?? 0,
      suspended,
    };
  },

  async listDrivers(opts?: {
    q?: string;
    identification_status?: string;
    page?: number;
    page_size?: number;
    limit?: number;
    offset?: number;
  }) {
    const pageSize = Math.min(Math.max(opts?.page_size ?? opts?.limit ?? 50, 1), 200);
    const page = Math.max(opts?.page ?? 1, 1);
    const offset = opts?.offset !== undefined ? Math.max(opts.offset, 0) : (page - 1) * pageSize;
    const q = opts?.q?.trim();

    const filters = [eq(drivers.status, 'approved'), eq(drivers.admin_review_status, 'approved')];
    if (opts?.identification_status) {
      filters.push(eq(drivers.identification_status, opts.identification_status));
    }
    if (q) {
      const pattern = `%${escapeIlike(q)}%`;
      filters.push(
        or(
          ilike(users.full_name, pattern),
          ilike(users.phone, pattern),
          ilike(users.document_number, pattern),
          sql`cast(${drivers.id} as text) ilike ${pattern}`,
          sql`exists (
            select 1 from ${vehicles}
            where ${vehicles.driver_id} = ${drivers.id}
            and ${vehicles.plate} ilike ${pattern}
          )`,
        )!,
      );
    }

    const whereClause = and(...filters);

    const rows = await db
      .select(selectFields)
      .from(drivers)
      .innerJoin(users, eq(drivers.user_id, users.id))
      .leftJoin(districts, eq(drivers.district_id, districts.id))
      .where(whereClause)
      .orderBy(desc(drivers.created_at))
      .limit(pageSize)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(drivers)
      .innerJoin(users, eq(drivers.user_id, users.id))
      .leftJoin(districts, eq(drivers.district_id, districts.id))
      .where(whereClause);

    return {
      items: rows.map(mapRow),
      total: count,
      page: Math.floor(offset / pageSize) + 1,
      page_size: pageSize,
      limit: pageSize,
      offset,
    };
  },

  async getDriver(driverId: string) {
    const [row] = await db
      .select(selectFields)
      .from(drivers)
      .innerJoin(users, eq(drivers.user_id, users.id))
      .leftJoin(districts, eq(drivers.district_id, districts.id))
      .where(eq(drivers.id, driverId))
      .limit(1);

    if (!row) throw new NotFoundError('Driver not found');
    return mapRow(row);
  },

  async issueIdentification(actor: AuthUser, driverId: string, body: TransitIssueBody) {
    const external_ref = body.external_ref ?? body.batch;
    const result = await transitBridgeService.issueIdentification({
      driver_id: driverId,
      issued_at: body.issued_at,
      external_ref,
      district_id: body.district_id,
    });

    logger.info('[TRANSIT] identification issued via JWT', {
      driverId: driverId.split('-')[0],
      actorId: actor.id.split('-')[0],
      actorRole: actor.role,
      notes: body.notes ? String(body.notes).slice(0, 80) : undefined,
      idempotent: result.idempotent,
    });

    return result;
  },
};
