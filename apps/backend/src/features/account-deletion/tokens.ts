import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function generateVerifyToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function hashEmail(emailNormalized: string): string {
  const pepper = process.env.ACCOUNT_DELETION_EMAIL_PEPPER || 'lifty-account-deletion';
  return createHash('sha256').update(`${pepper}:${emailNormalized}`, 'utf8').digest('hex');
}

export function tokensEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) {
    const dummy = Buffer.alloc(ba.length);
    timingSafeEqual(ba, dummy);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

export function tokenTtlMinutes(): number {
  const n = Number(process.env.ACCOUNT_DELETION_TOKEN_TTL_MIN);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

export function webBaseUrl(): string {
  return (
    process.env.ACCOUNT_DELETION_WEB_BASE_URL?.replace(/\/$/, '') || 'https://web.liftyviajes.com'
  );
}

export function buildVerifyLink(token: string): string {
  return `${webBaseUrl()}/eliminar-cuenta?token=${encodeURIComponent(token)}`;
}
