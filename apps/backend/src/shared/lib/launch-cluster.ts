import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { districts } from '../db/schema';
import { logger } from './logger';

export const LAUNCH_CLUSTER_DISTRICT_NAMES = [
  'Villa Dolores',
  'San Pedro',
  'Villa Sarmiento',
] as const;

export const LAUNCH_CLUSTER_TRANSIT_HOME_NAME = 'Villa Dolores';

export type LaunchClusterDistrictIds = {
  homeId: string;
  clusterIds: string[];
};

let cached: LaunchClusterDistrictIds | null = null;
let cachePromise: Promise<LaunchClusterDistrictIds> | null = null;

/** Resolve launch-cluster UUIDs from DB by name (Córdoba, active). No hardcoded IDs. */
export async function getLaunchClusterDistrictIds(): Promise<LaunchClusterDistrictIds> {
  if (cached) return cached;
  if (cachePromise) return cachePromise;

  cachePromise = (async () => {
    const rows = await db
      .select({ id: districts.id, name: districts.name })
      .from(districts)
      .where(
        and(
          eq(districts.province, 'Córdoba'),
          eq(districts.status, 'active'),
          inArray(districts.name, [...LAUNCH_CLUSTER_DISTRICT_NAMES]),
        ),
      );

    const byName = new Map(rows.map((r) => [r.name, r.id]));
    const missing = LAUNCH_CLUSTER_DISTRICT_NAMES.filter((n) => !byName.has(n));
    if (missing.length > 0) {
      logger.error('[LAUNCH_CLUSTER] missing active Córdoba districts (PR-1 not applied?)', {
        missing,
      });
      throw new Error(
        `Launch cluster districts missing: ${missing.join(', ')}. Apply PR-1 districts migration/seed.`,
      );
    }

    const homeId = byName.get(LAUNCH_CLUSTER_TRANSIT_HOME_NAME)!;
    const clusterIds = LAUNCH_CLUSTER_DISTRICT_NAMES.map((n) => byName.get(n)!);
    cached = { homeId, clusterIds };
    return cached;
  })();

  try {
    return await cachePromise;
  } finally {
    cachePromise = null;
  }
}

/** Test helper: drop memo so ensureDistrict fixtures re-resolve. */
export function resetLaunchClusterCache(): void {
  cached = null;
  cachePromise = null;
}
