import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '../../shared/db/client';
import { serviceMarketAliases, serviceMarkets } from '../../shared/db/schema';
import { AppError, NotFoundError } from '../../shared/lib/errors';
import { logger } from '../../shared/lib/logger';
import { type ServiceMarketGeo, setActiveServiceMarkets } from '../../shared/lib/service-area';

export type MarketStatus = 'draft' | 'active' | 'paused';

export type CreateServiceMarketInput = {
  slug: string;
  name: string;
  province: string;
  hub_lat: number;
  hub_lng: number;
  pickup_radius_km?: number;
  dropoff_radius_km?: number;
  match_radius_km?: number;
  geo_bias_radius_km?: number;
  default_district_id?: string | null;
  timezone?: string;
  status?: MarketStatus;
  aliases?: string[];
};

export type PatchServiceMarketInput = {
  name?: string;
  province?: string;
  hub_lat?: number;
  hub_lng?: number;
  pickup_radius_km?: number;
  dropoff_radius_km?: number;
  match_radius_km?: number;
  geo_bias_radius_km?: number;
  default_district_id?: string | null;
  timezone?: string;
  status?: MarketStatus;
  aliases?: string[];
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeAlias(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function assertValidCoords(lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new AppError('Coordenadas de hub inválidas', 400, 'INVALID_HUB_COORDS');
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new AppError('Coordenadas de hub fuera de rango', 400, 'INVALID_HUB_COORDS');
  }
}

function assertPositiveRadius(value: number | undefined, field: string) {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value <= 0 || value > 500) {
    throw new AppError(`Radio inválido: ${field}`, 400, 'INVALID_RADIUS');
  }
}

function toGeo(row: {
  id: string;
  slug: string;
  name: string;
  province: string;
  status: string;
  hub_lat: number;
  hub_lng: number;
  pickup_radius_km: number;
  dropoff_radius_km: number;
  match_radius_km: number;
  geo_bias_radius_km: number;
}): ServiceMarketGeo {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    province: row.province,
    status: row.status,
    hub_lat: row.hub_lat,
    hub_lng: row.hub_lng,
    pickup_radius_km: row.pickup_radius_km,
    dropoff_radius_km: row.dropoff_radius_km,
    match_radius_km: row.match_radius_km,
    geo_bias_radius_km: row.geo_bias_radius_km,
  };
}

async function replaceAliases(marketId: string, aliases: string[]) {
  await db.delete(serviceMarketAliases).where(eq(serviceMarketAliases.market_id, marketId));
  const seen = new Set<string>();
  const rows: { market_id: string; alias: string; alias_normalized: string }[] = [];
  for (const raw of aliases) {
    const alias = raw.trim();
    if (!alias) continue;
    const alias_normalized = normalizeAlias(alias);
    if (!alias_normalized || seen.has(alias_normalized)) continue;
    seen.add(alias_normalized);
    rows.push({ market_id: marketId, alias, alias_normalized });
  }
  if (rows.length > 0) {
    await db.insert(serviceMarketAliases).values(rows);
  }
}

async function loadAliases(marketIds: string[]) {
  if (marketIds.length === 0) return new Map<string, string[]>();
  const rows = await db
    .select({
      market_id: serviceMarketAliases.market_id,
      alias: serviceMarketAliases.alias,
    })
    .from(serviceMarketAliases)
    .where(inArray(serviceMarketAliases.market_id, marketIds))
    .orderBy(asc(serviceMarketAliases.alias));

  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.market_id) ?? [];
    list.push(r.alias);
    map.set(r.market_id, list);
  }
  return map;
}

export async function reloadServiceMarketsCache(): Promise<number> {
  try {
    const rows = await db
      .select({
        id: serviceMarkets.id,
        slug: serviceMarkets.slug,
        name: serviceMarkets.name,
        province: serviceMarkets.province,
        status: serviceMarkets.status,
        hub_lat: serviceMarkets.hub_lat,
        hub_lng: serviceMarkets.hub_lng,
        pickup_radius_km: serviceMarkets.pickup_radius_km,
        dropoff_radius_km: serviceMarkets.dropoff_radius_km,
        match_radius_km: serviceMarkets.match_radius_km,
        geo_bias_radius_km: serviceMarkets.geo_bias_radius_km,
      })
      .from(serviceMarkets)
      .where(eq(serviceMarkets.status, 'active'));

    setActiveServiceMarkets(rows.map(toGeo));
    logger.info('[service-markets] cache reloaded', { active: rows.length });
    return rows.length;
  } catch (err) {
    logger.warn('[service-markets] cache reload failed; keeping previous/legacy', {
      message: err instanceof Error ? err.message : String(err),
    });
    return -1;
  }
}

export const serviceMarketsService = {
  reloadCache: reloadServiceMarketsCache,

  async listActivePublic() {
    const rows = await db
      .select({
        id: serviceMarkets.id,
        slug: serviceMarkets.slug,
        name: serviceMarkets.name,
        province: serviceMarkets.province,
        hub_lat: serviceMarkets.hub_lat,
        hub_lng: serviceMarkets.hub_lng,
        pickup_radius_km: serviceMarkets.pickup_radius_km,
        dropoff_radius_km: serviceMarkets.dropoff_radius_km,
        match_radius_km: serviceMarkets.match_radius_km,
        geo_bias_radius_km: serviceMarkets.geo_bias_radius_km,
      })
      .from(serviceMarkets)
      .where(eq(serviceMarkets.status, 'active'))
      .orderBy(asc(serviceMarkets.name));

    return { items: rows };
  },

  async listAdmin() {
    const rows = await db.select().from(serviceMarkets).orderBy(asc(serviceMarkets.name));
    const aliases = await loadAliases(rows.map((r) => r.id));
    return {
      items: rows.map((r) => ({
        ...r,
        aliases: aliases.get(r.id) ?? [],
      })),
    };
  },

  async getById(id: string) {
    const rows = await db.select().from(serviceMarkets).where(eq(serviceMarkets.id, id)).limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundError('Service market not found');
    const aliases = await loadAliases([id]);
    return { ...row, aliases: aliases.get(id) ?? [] };
  },

  async create(input: CreateServiceMarketInput) {
    const slug = input.slug.trim().toLowerCase();
    if (!SLUG_RE.test(slug)) {
      throw new AppError(
        'slug inválido (usar kebab-case: tandil, villa-dolores)',
        400,
        'INVALID_SLUG',
      );
    }
    assertValidCoords(input.hub_lat, input.hub_lng);
    assertPositiveRadius(input.pickup_radius_km, 'pickup_radius_km');
    assertPositiveRadius(input.dropoff_radius_km, 'dropoff_radius_km');
    assertPositiveRadius(input.match_radius_km, 'match_radius_km');
    assertPositiveRadius(input.geo_bias_radius_km, 'geo_bias_radius_km');

    const status: MarketStatus = input.status ?? 'draft';
    if (!['draft', 'active', 'paused'].includes(status)) {
      throw new AppError('status inválido', 400, 'INVALID_STATUS');
    }

    try {
      const [row] = await db
        .insert(serviceMarkets)
        .values({
          slug,
          name: input.name.trim(),
          province: input.province.trim(),
          status,
          hub_lat: input.hub_lat,
          hub_lng: input.hub_lng,
          pickup_radius_km: input.pickup_radius_km ?? 8,
          dropoff_radius_km: input.dropoff_radius_km ?? 50,
          match_radius_km: input.match_radius_km ?? 8,
          geo_bias_radius_km: input.geo_bias_radius_km ?? 20,
          default_district_id: input.default_district_id ?? null,
          timezone: input.timezone ?? 'America/Argentina/Cordoba',
        })
        .returning();

      const aliases = input.aliases?.length ? input.aliases : [input.name];
      await replaceAliases(row.id, aliases);
      await reloadServiceMarketsCache();
      return this.getById(row.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('service_markets_slug') ||
        msg.includes('unique') ||
        msg.includes('duplicate')
      ) {
        throw new AppError('Ya existe un market con ese slug', 409, 'SLUG_TAKEN');
      }
      throw err;
    }
  },

  async patch(id: string, input: PatchServiceMarketInput) {
    const existing = await this.getById(id);
    if (input.hub_lat !== undefined || input.hub_lng !== undefined) {
      assertValidCoords(input.hub_lat ?? existing.hub_lat, input.hub_lng ?? existing.hub_lng);
    }
    assertPositiveRadius(input.pickup_radius_km, 'pickup_radius_km');
    assertPositiveRadius(input.dropoff_radius_km, 'dropoff_radius_km');
    assertPositiveRadius(input.match_radius_km, 'match_radius_km');
    assertPositiveRadius(input.geo_bias_radius_km, 'geo_bias_radius_km');
    if (input.status && !['draft', 'active', 'paused'].includes(input.status)) {
      throw new AppError('status inválido', 400, 'INVALID_STATUS');
    }

    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.province !== undefined) patch.province = input.province.trim();
    if (input.hub_lat !== undefined) patch.hub_lat = input.hub_lat;
    if (input.hub_lng !== undefined) patch.hub_lng = input.hub_lng;
    if (input.pickup_radius_km !== undefined) patch.pickup_radius_km = input.pickup_radius_km;
    if (input.dropoff_radius_km !== undefined) patch.dropoff_radius_km = input.dropoff_radius_km;
    if (input.match_radius_km !== undefined) patch.match_radius_km = input.match_radius_km;
    if (input.geo_bias_radius_km !== undefined) patch.geo_bias_radius_km = input.geo_bias_radius_km;
    if (input.default_district_id !== undefined) {
      patch.default_district_id = input.default_district_id;
    }
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if (input.status !== undefined) patch.status = input.status;

    await db.update(serviceMarkets).set(patch).where(eq(serviceMarkets.id, id));
    if (input.aliases) {
      await replaceAliases(id, input.aliases);
    }
    await reloadServiceMarketsCache();
    return this.getById(id);
  },

  async setStatus(id: string, status: MarketStatus) {
    return this.patch(id, { status });
  },
};
