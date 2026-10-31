import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { getDriverId } from '../../shared/db/queries';
import { payoutMethods } from '../../shared/db/schema';
import { AppError, NotFoundError } from '../../shared/lib/errors';
import { logger } from '../../shared/lib/logger';
import type { AuthUser } from '../../shared/middleware/auth';

function maskAccount(num: string): string {
  if (num.length <= 4) return '****';
  return `****${num.slice(-4)}`;
}

const payLog = logger.scoped({ domain: 'payment' });

export type DriverTransferDetails = {
  alias: string | null;
  cbu_cvu: string | null;
  holder: string | null;
  bank: string | null;
};

type PrimaryPayoutMethod = {
  id: string;
  method_type: string;
  account_number: string;
  titular_name: string | null;
  wallet: string | null;
};

/** Full (unmasked) primary payout method for a driver. Passenger-trip scoped use only. */
export async function getPrimaryMethodForDriver(
  driverId: string,
): Promise<PrimaryPayoutMethod | null> {
  const [method] = await db
    .select({
      id: payoutMethods.id,
      method_type: payoutMethods.method_type,
      account_number: payoutMethods.account_number,
      titular_name: payoutMethods.titular_name,
      wallet: payoutMethods.wallet,
    })
    .from(payoutMethods)
    .where(eq(payoutMethods.driver_id, driverId))
    .orderBy(desc(payoutMethods.created_at))
    .limit(1);

  return method ?? null;
}

export function toDriverTransferDetails(
  method: PrimaryPayoutMethod | null,
): DriverTransferDetails | null {
  if (!method) return null;

  const isAliasOnly = method.method_type === 'alias';
  return {
    alias: isAliasOnly ? method.account_number : (method.titular_name ?? null),
    cbu_cvu: isAliasOnly ? null : method.account_number,
    holder: method.titular_name ?? null,
    bank: method.wallet ?? null,
  };
}

export const paymentMethodsService = {
  async addMethod(
    user: AuthUser,
    methodType: string,
    accountNumber: string,
    titularName?: string,
    wallet?: string,
  ) {
    const driverId = await getDriverId(user);

    const [method] = await db
      .insert(payoutMethods)
      .values({
        driver_id: driverId,
        method_type: methodType,
        account_number: accountNumber,
        titular_name: titularName ?? null,
        wallet: wallet ?? null,
      })
      .returning({
        id: payoutMethods.id,
        method_type: payoutMethods.method_type,
        account_number: payoutMethods.account_number,
      });

    if (!method) throw new AppError('Failed to create payment method', 400, 'BAD_REQUEST');

    try {
      payLog.info('[PAY] payout_method.add', {
        event: 'payout_method.add',
        driver_id: driverId,
        method_id: method.id,
        method_type: methodType,
        account_masked: maskAccount(accountNumber),
      });
    } catch {
      // logging must never fail a committed payout method write
    }

    return { ...method, message: 'Payment method added' };
  },

  async getMethods(user: AuthUser) {
    const driverId = await getDriverId(user);

    const methods = await db
      .select({
        id: payoutMethods.id,
        method_type: payoutMethods.method_type,
        account_number: payoutMethods.account_number,
        titular_name: payoutMethods.titular_name,
        wallet: payoutMethods.wallet,
        created_at: payoutMethods.created_at,
      })
      .from(payoutMethods)
      .where(eq(payoutMethods.driver_id, driverId));

    return methods.map((m) => ({
      ...m,
      account_number: maskAccount(m.account_number),
      created_at: m.created_at?.toISOString() ?? null,
    }));
  },

  async deleteMethod(user: AuthUser, methodId: string) {
    const driverId = await getDriverId(user);

    const [method] = await db
      .select({ id: payoutMethods.id })
      .from(payoutMethods)
      .where(and(eq(payoutMethods.id, methodId), eq(payoutMethods.driver_id, driverId)))
      .limit(1);

    if (!method) throw new NotFoundError('Payment method not found');

    await db.delete(payoutMethods).where(eq(payoutMethods.id, methodId));

    try {
      payLog.info('[PAY] payout_method.delete', {
        event: 'payout_method.delete',
        driver_id: driverId,
        method_id: methodId,
      });
    } catch {
      // logging must never fail a committed payout method write
    }

    return { message: 'Payment method removed' };
  },
};
