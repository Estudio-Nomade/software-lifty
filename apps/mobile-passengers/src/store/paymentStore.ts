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

export const usePaymentStore = create<PaymentStore>()(
  persist(
    (set, get) => ({
      methods: [CASH_METHOD],
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
        set({ methods: [...get().methods, transfer] });
      },
      removeTransfer: (id) => {
        set({ methods: get().methods.filter((m) => m.type === 'cash' || m.id !== id) });
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
        const methods = p?.methods?.length ? p.methods : current.methods;
        if (!methods.some((m) => m.type === 'cash')) {
          methods.unshift(CASH_METHOD);
        }
        return { ...current, ...p, methods };
      },
    },
  ),
);
