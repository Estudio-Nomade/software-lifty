import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { userBlocks } from '../../shared/db/schema';

export async function hasActiveBlock(
  subjectType: 'passenger' | 'driver',
  subjectId: string,
  kind: string,
  now = new Date(),
): Promise<boolean> {
  const rows = await db
    .select({ id: userBlocks.id })
    .from(userBlocks)
    .where(
      and(
        eq(userBlocks.subject_type, subjectType),
        eq(userBlocks.subject_id, subjectId),
        eq(userBlocks.kind, kind),
        or(isNull(userBlocks.ends_at), gt(userBlocks.ends_at, now)),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function insertBlock(data: {
  subjectType: 'passenger' | 'driver';
  subjectId: string;
  kind: string;
  startsAt: Date;
  endsAt: Date | null;
}) {
  const [row] = await db
    .insert(userBlocks)
    .values({
      subject_type: data.subjectType,
      subject_id: data.subjectId,
      kind: data.kind,
      starts_at: data.startsAt,
      ends_at: data.endsAt,
    })
    .returning();
  return row;
}

export async function clearBlock(blockId: string) {
  const [row] = await db
    .update(userBlocks)
    .set({ ends_at: new Date() })
    .where(eq(userBlocks.id, blockId))
    .returning();
  return row;
}

export async function listBlockedDriverIds(now = new Date()): Promise<string[]> {
  const rows = await db
    .select({ subject_id: userBlocks.subject_id })
    .from(userBlocks)
    .where(
      and(
        eq(userBlocks.subject_type, 'driver'),
        eq(userBlocks.kind, 'tvf_review'),
        or(isNull(userBlocks.ends_at), gt(userBlocks.ends_at, now)),
      ),
    );
  return rows.map((r) => r.subject_id);
}
