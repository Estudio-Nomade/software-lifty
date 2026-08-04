import { createHmac, timingSafeEqual } from 'node:crypto';

export interface PaymentInfo {
  id: string;
  amount: number;
  status: string; // 'approved', 'pending', 'rejected', 'refunded'
  payer_email?: string;
}

export interface WithdrawalInfo {
  id: string;
  amount: number;
  status: string; // 'pending', 'processed', 'rejected'
}

export interface MockOverrides {
  getPayment?: (paymentId: string) => PaymentInfo | Promise<PaymentInfo>;
  createWithdrawal?: (
    amount: number,
    cvu: string,
    description?: string,
    idempotencyKey?: string,
  ) => WithdrawalInfo | Promise<WithdrawalInfo>;
}

const mockOverrides: MockOverrides = {};

export function getMockOverrides(): Readonly<MockOverrides> {
  return mockOverrides;
}

export function setMockOverrides(overrides: MockOverrides | null): void {
  if (overrides === null) {
    mockOverrides.getPayment = undefined;
    mockOverrides.createWithdrawal = undefined;
  } else {
    if (overrides.getPayment !== undefined) mockOverrides.getPayment = overrides.getPayment;
    if (overrides.createWithdrawal !== undefined)
      mockOverrides.createWithdrawal = overrides.createWithdrawal;
  }
}

export function resetMockOverrides(): void {
  mockOverrides.getPayment = undefined;
  mockOverrides.createWithdrawal = undefined;
}

function isMockMode(): boolean {
  return process.env.NODE_ENV !== 'production' || !process.env.MERCADOPAGO_ACCESS_TOKEN;
}

export async function getPayment(paymentId: string): Promise<PaymentInfo> {
  if (isMockMode()) {
    if (mockOverrides.getPayment) {
      return mockOverrides.getPayment(paymentId);
    }
    return { id: paymentId, amount: 1500, status: 'approved', payer_email: 'test@test.com' };
  }
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN!;
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`MercadoPago getPayment failed: ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  return {
    id: data.id as string,
    amount: data.transaction_amount as number,
    status: data.status as string,
    payer_email: (data.payer as Record<string, unknown> | undefined)?.email as string | undefined,
  };
}

export async function createWithdrawal(
  amount: number,
  cvu: string,
  description?: string,
  idempotencyKey?: string,
): Promise<WithdrawalInfo> {
  if (isMockMode()) {
    if (mockOverrides.createWithdrawal) {
      return mockOverrides.createWithdrawal(amount, cvu, description, idempotencyKey);
    }
    return { id: crypto.randomUUID(), amount, status: 'processed' };
  }
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN!;
  const response = await fetch('https://api.mercadopago.com/v1/payouts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount,
      description: description ?? 'Lifty withdrawal',
      payment_method_id: cvu,
      external_reference: idempotencyKey ?? undefined,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `MercadoPago createWithdrawal failed: ${response.status} ${await response.text()}`,
    );
  }
  const data = (await response.json()) as Record<string, unknown>;
  return {
    id: data.id as string,
    amount: data.amount as number,
    status: data.status as string,
  };
}

export function verifyWebhookSignature(payload: string, signature: string): boolean {
  if (process.env.NODE_ENV === 'test') return !signature.includes('invalid');
  const secret = isMockMode()
    ? 'mock-mp-webhook-secret-dev-only'
    : process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) throw new Error('MERCADOPAGO_WEBHOOK_SECRET is required in production');
  const computed = createHmac('sha256', secret).update(payload).digest();
  const provided = Buffer.from(signature, 'hex');
  try {
    return timingSafeEqual(computed, provided);
  } catch {
    return false;
  }
}
