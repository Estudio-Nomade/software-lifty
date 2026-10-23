import { and, count, desc, eq, sql } from 'drizzle-orm';
import { db, getDb } from '../../shared/db/client';
import { driverCommissionReceipts, drivers, users } from '../../shared/db/schema';
import { getConfig, getDebtCapArs, setConfig } from '../../shared/lib/commission';
import { AppError, NotFoundError } from '../../shared/lib/errors';
import { logger } from '../../shared/lib/logger';
import { sendPushToUser } from '../../shared/lib/push';
import { extractStoragePath, getSignedUrl } from '../../shared/lib/storage';
import type { AuthUser } from '../../shared/middleware/auth';

const PAYOUT_KEYS = {
  alias: 'platform.lifty_payout_alias',
  cvu: 'platform.lifty_payout_cvu',
  holder: 'platform.lifty_payout_holder',
  bank: 'platform.lifty_payout_bank',
} as const;

const RECEIPT_STATUSES = new Set(['pending_review', 'approved', 'rejected_fraud']);

function nullIfEmpty(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapReceiptRow(row: {
  id: string;
  driver_id: string;
  amount_ars: number;
  debt_before_ars: number;
  status: string;
  file_url: string;
  created_at: Date | string;
  reviewed_at: Date | string | null;
  reviewed_by: string | null;
  note: string | null;
  driver_name?: string | null;
  driver_email?: string | null;
  driver_phone?: string | null;
}) {
  return {
    id: row.id,
    driver_id: row.driver_id,
    driver_name: row.driver_name ?? null,
    driver_email: row.driver_email ?? null,
    driver_phone: row.driver_phone ?? null,
    amount_ars: Math.round(Number(row.amount_ars ?? 0)),
    debt_before_ars: Math.round(Number(row.debt_before_ars ?? 0)),
    status: row.status,
    file_url: row.file_url,
    created_at:
      row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at ?? null),
    reviewed_at:
      row.reviewed_at instanceof Date ? row.reviewed_at.toISOString() : (row.reviewed_at ?? null),
    reviewed_by: row.reviewed_by ?? null,
    note: row.note ?? null,
  };
}

async function resolveFileUrl(
  fileUrl: string,
): Promise<{ file_url: string; signed_url: string | null }> {
  const path = extractStoragePath(fileUrl);
  if (!path) {
    return { file_url: fileUrl, signed_url: null };
  }
  try {
    const signed = await getSignedUrl(path);
    return { file_url: fileUrl, signed_url: signed };
  } catch (err) {
    logger.warn('[admin] commission receipt signed url failed', {
      path,
      error: (err as Error).message,
    });
    return { file_url: fileUrl, signed_url: null };
  }
}

export const adminCommissionDebtService = {
  async getPayoutAccount() {
    const database = getDb();
    const [alias, cvu, holder, bank, debtCap] = await Promise.all([
      getConfig(database, PAYOUT_KEYS.alias),
      getConfig(database, PAYOUT_KEYS.cvu),
      getConfig(database, PAYOUT_KEYS.holder),
      getConfig(database, PAYOUT_KEYS.bank),
      getDebtCapArs(database),
    ]);

    return {
      alias: nullIfEmpty(alias),
      cvu: nullIfEmpty(cvu),
      holder: nullIfEmpty(holder),
      bank: nullIfEmpty(bank),
      debt_cap_ars: debtCap,
    };
  },

  async updatePayoutAccount(body: {
    alias?: string;
    cvu?: string;
    holder?: string;
    bank?: string;
  }) {
    const database = getDb();
    const updates: Array<[string, string]> = [];

    if (body.alias !== undefined) updates.push([PAYOUT_KEYS.alias, body.alias.trim()]);
    if (body.cvu !== undefined) updates.push([PAYOUT_KEYS.cvu, body.cvu.trim()]);
    if (body.holder !== undefined) updates.push([PAYOUT_KEYS.holder, body.holder.trim()]);
    if (body.bank !== undefined) updates.push([PAYOUT_KEYS.bank, body.bank.trim()]);

    if (updates.length === 0) {
      throw new AppError('No fields to update', 400, 'BAD_REQUEST');
    }

    for (const [key, value] of updates) {
      await setConfig(database, key, value);
    }

    return this.getPayoutAccount();
  },

  async listReceipts(opts: {
    status?: string;
    driver_id?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    // Default pending_review; status=all → no filter.
    const rawStatus = opts.status?.trim() || 'pending_review';
    const statusFilter =
      rawStatus === 'all' ? null : RECEIPT_STATUSES.has(rawStatus) ? rawStatus : 'pending_review';

    const conditions = [];
    if (statusFilter) {
      conditions.push(eq(driverCommissionReceipts.status, statusFilter));
    }
    if (opts.driver_id) {
      conditions.push(eq(driverCommissionReceipts.driver_id, opts.driver_id));
    }
    const where =
      conditions.length === 0
        ? undefined
        : conditions.length === 1
          ? conditions[0]
          : and(...conditions);

    try {
      const baseQuery = db
        .select({
          id: driverCommissionReceipts.id,
          driver_id: driverCommissionReceipts.driver_id,
          amount_ars: driverCommissionReceipts.amount_ars,
          debt_before_ars: driverCommissionReceipts.debt_before_ars,
          status: driverCommissionReceipts.status,
          file_url: driverCommissionReceipts.file_url,
          created_at: driverCommissionReceipts.created_at,
          reviewed_at: driverCommissionReceipts.reviewed_at,
          reviewed_by: driverCommissionReceipts.reviewed_by,
          note: driverCommissionReceipts.note,
          driver_name: users.full_name,
          driver_email: users.email,
          driver_phone: users.phone,
        })
        .from(driverCommissionReceipts)
        .innerJoin(drivers, eq(driverCommissionReceipts.driver_id, drivers.id))
        .innerJoin(users, eq(drivers.user_id, users.id));

      const itemsQuery = where
        ? baseQuery
            .where(where)
            .orderBy(desc(driverCommissionReceipts.created_at))
            .limit(limit)
            .offset(offset)
        : baseQuery.orderBy(desc(driverCommissionReceipts.created_at)).limit(limit).offset(offset);

      const countBase = db
        .select({ total: count() })
        .from(driverCommissionReceipts)
        .innerJoin(drivers, eq(driverCommissionReceipts.driver_id, drivers.id))
        .innerJoin(users, eq(drivers.user_id, users.id));

      const countQuery = where ? countBase.where(where) : countBase;

      const [rows, totalRows] = await Promise.all([itemsQuery, countQuery]);
      const total = Number(totalRows[0]?.total ?? 0);

      return {
        items: rows.map(mapReceiptRow),
        total,
        limit,
        offset,
      };
    } catch (err) {
      const msg = String((err as Error)?.message ?? err ?? '');
      if (
        /driver_commission_receipts/i.test(msg) ||
        /does not exist/i.test(msg) ||
        /42703/.test(msg)
      ) {
        logger.warn('[admin] listReceipts schema drift — empty list until migration 0048', {
          message: (err as Error).message,
        });
        return { items: [], total: 0, limit, offset };
      }
      throw err;
    }
  },

  async getReceipt(id: string) {
    const [row] = await db
      .select({
        id: driverCommissionReceipts.id,
        driver_id: driverCommissionReceipts.driver_id,
        amount_ars: driverCommissionReceipts.amount_ars,
        debt_before_ars: driverCommissionReceipts.debt_before_ars,
        status: driverCommissionReceipts.status,
        file_url: driverCommissionReceipts.file_url,
        created_at: driverCommissionReceipts.created_at,
        reviewed_at: driverCommissionReceipts.reviewed_at,
        reviewed_by: driverCommissionReceipts.reviewed_by,
        note: driverCommissionReceipts.note,
        driver_name: users.full_name,
        driver_email: users.email,
        driver_phone: users.phone,
      })
      .from(driverCommissionReceipts)
      .innerJoin(drivers, eq(driverCommissionReceipts.driver_id, drivers.id))
      .innerJoin(users, eq(drivers.user_id, users.id))
      .where(eq(driverCommissionReceipts.id, id))
      .limit(1);

    if (!row) throw new NotFoundError('Commission receipt not found');

    const mapped = mapReceiptRow(row);
    const urls = await resolveFileUrl(row.file_url);
    return { ...mapped, ...urls };
  },

  async approveReceipt(adminUser: AuthUser, id: string) {
    const [existing] = await db
      .select()
      .from(driverCommissionReceipts)
      .where(eq(driverCommissionReceipts.id, id))
      .limit(1);

    if (!existing) throw new NotFoundError('Commission receipt not found');

    // Already approved: pure no-op — do not touch fraud_block (a later receipt may have
    // re-blocked the driver; re-approve must not clear that).
    if (existing.status === 'approved') {
      return mapReceiptRow(existing);
    }

    if (existing.status !== 'pending_review') {
      throw new AppError(
        `Receipt is ${existing.status}; only pending_review can be approved`,
        409,
        'RECEIPT_NOT_PENDING',
      );
    }

    const now = new Date();
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(driverCommissionReceipts)
        .set({
          status: 'approved',
          reviewed_at: now,
          reviewed_by: adminUser.id,
        })
        .where(
          and(
            eq(driverCommissionReceipts.id, id),
            eq(driverCommissionReceipts.status, 'pending_review'),
          ),
        )
        .returning();

      if (!row) {
        const [again] = await tx
          .select()
          .from(driverCommissionReceipts)
          .where(eq(driverCommissionReceipts.id, id))
          .limit(1);
        if (again?.status === 'approved') {
          return again;
        }
        throw new AppError('Receipt could not be approved', 409, 'RECEIPT_NOT_PENDING');
      }

      // Only clear fraud on first transition pending → approved.
      await tx
        .update(drivers)
        .set({
          commission_fraud_block: false,
          updated_at: now,
        })
        .where(eq(drivers.id, existing.driver_id));

      return row;
    });

    return mapReceiptRow(updated);
  },

  async rejectFraud(adminUser: AuthUser, id: string, note?: string) {
    const [existing] = await db
      .select()
      .from(driverCommissionReceipts)
      .where(eq(driverCommissionReceipts.id, id))
      .limit(1);

    if (!existing) throw new NotFoundError('Commission receipt not found');

    if (existing.status === 'rejected_fraud') {
      return mapReceiptRow(existing);
    }

    if (existing.status !== 'pending_review') {
      throw new AppError(
        `Receipt is ${existing.status}; only pending_review can be marked fraud`,
        409,
        'RECEIPT_NOT_PENDING',
      );
    }

    const debtBefore = Math.round(Number(existing.debt_before_ars ?? 0));
    const now = new Date();
    const trimmedNote = note?.trim() || null;

    const result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(driverCommissionReceipts)
        .set({
          status: 'rejected_fraud',
          reviewed_at: now,
          reviewed_by: adminUser.id,
          note: trimmedNote,
        })
        .where(
          and(
            eq(driverCommissionReceipts.id, id),
            eq(driverCommissionReceipts.status, 'pending_review'),
          ),
        )
        .returning();

      if (!updated) {
        throw new AppError('Receipt could not be rejected', 409, 'RECEIPT_NOT_PENDING');
      }

      // Lock driver so concurrent collect/upload cannot race the debt restore.
      const locked = await tx.execute<{
        id: string;
        user_id: string;
        is_online: boolean;
        platform_debt: number | string;
      }>(
        sql`SELECT id, user_id, is_online, platform_debt FROM drivers WHERE id = ${existing.driver_id} FOR UPDATE`,
      );
      const lockedRows =
        (
          locked as {
            rows?: Array<{
              id: string;
              user_id: string;
              is_online: boolean;
              platform_debt: number | string;
            }>;
          }
        ).rows ??
        (Array.isArray(locked)
          ? (locked as Array<{
              id: string;
              user_id: string;
              is_online: boolean;
              platform_debt: number | string;
            }>)
          : []);
      const driver = lockedRows[0];
      if (!driver) throw new NotFoundError('Driver not found');

      // Upload cleared debt_before; new trips may have accrued since. Add snapshot back
      // instead of overwriting current balance.
      const currentDebt = Math.round(Number(driver.platform_debt ?? 0));
      const restoredDebt = currentDebt + debtBefore;

      await tx
        .update(drivers)
        .set({
          commission_fraud_block: true,
          platform_debt: restoredDebt,
          is_online: false,
          last_heartbeat: null,
          updated_at: now,
        })
        .where(eq(drivers.id, driver.id));

      return {
        receipt: updated,
        userId: driver.user_id,
        restoredDebt,
      };
    });

    void sendPushToUser(result.userId, {
      title: 'Comprobante de comisión rechazado',
      body: 'Detectamos un problema con tu comprobante. La deuda se restableció y no podés conectarte hasta resolverlo con soporte Lifty.',
      data: {
        type: 'driver:commission_fraud_block',
        reason: 'rejected_fraud',
        receipt_id: id,
        platform_debt: String(result.restoredDebt),
      },
      channelId: 'account',
    }).catch((err) => {
      logger.error('[admin] commission fraud push failed', {
        error: (err as Error).message,
      });
    });

    return mapReceiptRow(result.receipt);
  },

  async clearCommissionFraud(driverId: string) {
    const [driver] = await db
      .select({
        id: drivers.id,
        commission_fraud_block: drivers.commission_fraud_block,
        platform_debt: drivers.platform_debt,
      })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);

    if (!driver) throw new NotFoundError('Driver not found');

    await db
      .update(drivers)
      .set({
        commission_fraud_block: false,
        updated_at: new Date(),
      })
      .where(eq(drivers.id, driverId));

    return {
      driver_id: driverId,
      commission_fraud_block: false,
      platform_debt: Math.round(Number(driver.platform_debt ?? 0)),
    };
  },
};
