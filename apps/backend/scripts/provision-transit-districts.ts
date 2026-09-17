/**
 * Provision Auth + public.users transit staff per active district.
 *
 * Env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   DATABASE_URL
 *   TRANSIT_PASSWORD_FILE (optional) — path to write passwords (mode 600). Default:
 *     ~/Documentos/LIfty/.ops-local/transit-municipio-passwords.txt
 *
 * Does NOT print passwords to stdout. Safe for local ops; do not run in CI with secrets logged.
 */
import { createClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { mkdirSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { db } from '../src/shared/db/client';
import { districts, drivers, passengerProfiles, users } from '../src/shared/db/schema';

const SLUG: Record<string, string> = {
  'Villa Dolores': 'villadolores',
  'Villa de las Rosas': 'villadelasrosas',
  'Villa Sarmiento': 'villasarmiento',
  'Mina Clavero': 'minaclavero',
  'San Javier': 'sanjavier',
  Nono: 'nono',
  'Las Calles': 'lascalles',
};

function slugify(name: string): string {
  if (SLUG[name]) return SLUG[name];
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function initialPassword(name: string): string {
  const compact = name.replace(/\s+/g, '');
  return `${compact}transito`;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const active = await db
    .select({ id: districts.id, name: districts.name })
    .from(districts)
    .where(eq(districts.status, 'active'));

  const outPath =
    process.env.TRANSIT_PASSWORD_FILE ??
    join(homedir(), 'Documentos', 'LIfty', '.ops-local', 'transit-municipio-passwords.txt');

  const lines: string[] = [
    `# Transit municipio passwords — ${new Date().toISOString()}`,
    `# chmod 600 this file. NEVER commit.`,
    '',
  ];

  for (const d of active) {
    const slug = slugify(d.name);
    const email = `${slug}@liftyviajes.com`;
    const password = initialPassword(d.name);

    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: 'transit' },
      user_metadata: { full_name: `Tránsito ${d.name}` },
    });

    let uid = created?.user?.id;
    if (error) {
      // already exists — list by email
      const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = listed.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (!found) {
        console.error(`FAIL ${email}: ${error.message}`);
        continue;
      }
      uid = found.id;
      await admin.auth.admin.updateUserById(uid, {
        password,
        app_metadata: { role: 'transit' },
      });
      console.log(`updated existing ${email}`);
    } else {
      console.log(`created ${email}`);
    }

    if (!uid) {
      console.error(`no uid for ${email}`);
      continue;
    }

    await db
      .insert(users)
      .values({
        id: uid,
        email,
        role: 'transit',
        full_name: `Tránsito ${d.name}`,
        transit_district_id: d.id,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email,
          role: 'transit',
          full_name: `Tránsito ${d.name}`,
          transit_district_id: d.id,
          updated_at: new Date(),
        },
      });

    await db.delete(drivers).where(eq(drivers.user_id, uid));
    await db.delete(passengerProfiles).where(eq(passengerProfiles.user_id, uid));

    lines.push(`${d.name}\t${email}\t${password}\t${d.id}\t${uid}`);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${lines.join('\n')}\n`, { mode: 0o600 });
  try {
    chmodSync(outPath, 0o600);
  } catch {
    /* ignore */
  }
  console.log(`passwords written to ${outPath} (not printed)`);
  if (!existsSync(outPath)) {
    console.error('failed to write password file');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
