import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type PaymentMethodType = 'cash' | 'transfer';

export interface PaymentMethod {
  id: string;
  type: PaymentMethodType;
  label: string;
  alias?: string;
  cbu?: string;
  titular?: string;
  isDefault: boolean;
}

interface PaymentStore {
  methods: PaymentMethod[];
  addTransfer: (input: { alias: string; cbu: string; titular?: string }) => void;
  removeTransfer: (id: string) => void;
  setDefault: (id: string) => void;
}

const CASH_METHOD: PaymentMethod = {
  id: 'cash',
  type: 'cash',
  label: 'Efectivo',
  isDefault: true,
};

/** Always available — no CBU required to choose transfer at ride time. */
const TRANSFER_METHOD: PaymentMethod = {
  id: 'transfer',
  type: 'transfer',
  label: 'Transferencia',
  isDefault: false,
};

function ensureBaseMethods(methods: PaymentMethod[]): PaymentMethod[] {
  const next = [...methods];
  if (!next.some((m) => m.id === 'cash' || m.type === 'cash')) {
    next.unshift({ ...CASH_METHOD, isDefault: !next.some((m) => m.isDefault) });
  }
  if (!next.some((m) => m.id === 'transfer')) {
    // Keep user-added transfers; inject base transfer option if missing.
    const cashIdx = next.findIndex((m) => m.type === 'cash');
    next.splice(cashIdx + 1, 0, { ...TRANSFER_METHOD });
  }
  if (!next.some((m) => m.isDefault)) {
    next[0] = { ...next[0], isDefault: true };
  }
  return next;
}

export const usePaymentStore = create<PaymentStore>()(
  persist(
    (set, get) => ({
      methods: [CASH_METHOD, TRANSFER_METHOD],
      addTransfer: (input) => {
        const id = `transfer-${Date.now()}`;
        const transfer: PaymentMethod = {
          id,
          type: 'transfer',
          label: input.alias.trim(),
          alias: input.alias.trim(),
          cbu: input.cbu.replace(/\D/g, ''),
          titular: input.titular?.trim() || undefined,
          isDefault: false,
        };
        set({ methods: ensureBaseMethods([...get().methods, transfer]) });
      },
      removeTransfer: (id) => {
        // Never remove built-in cash / transfer options.
        if (id === 'cash' || id === 'transfer') return;
        set({
          methods: ensureBaseMethods(get().methods.filter((m) => m.id !== id)),
        });
      },
      setDefault: (id) => {
        set({
          methods: get().methods.map((m) => ({ ...m, isDefault: m.id === id })),
        });
      },
    }),
    {
      name: 'lifty-passenger-payment-methods',
      storage: createJSONStorage(() => AsyncStorage),
      merge: (persisted: unknown, current: PaymentStore) => {
        const p = persisted as Partial<PaymentStore>;
        const methods = ensureBaseMethods(p?.methods?.length ? p.methods : current.methods);
        return { ...current, ...p, methods };
      },
    },
  ),
);
