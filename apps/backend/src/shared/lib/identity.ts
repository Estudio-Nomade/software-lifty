import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';

/**
 * users.kyc_status is the single source of truth for identity verification
 * (one person = one users row, shared by driver and passenger profiles).
 * drivers.kyc_status is only a mirror used by driver onboarding gates.
 */
export async function getUserKycStatus(userId: string): Promise<string> {
  const [row] = await db
    .select({ kyc_status: users.kyc_status })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.kyc_status ?? 'pending';
}

/**
 * Updates users.full_name unless the person already has a KYC-verified identity
 * (kyc approved + verified_name). Returns true when the name was written.
 */
export async function setUserFullName(userId: string, fullName: string): Promise<boolean> {
  const [row] = await db
    .select({ kyc_status: users.kyc_status, verified_name: users.verified_name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (row?.kyc_status === 'approved' && row.verified_name) return false;

  await db
    .update(users)
    .set({ full_name: fullName, updated_at: new Date() })
    .where(eq(users.id, userId));
  return true;
}
