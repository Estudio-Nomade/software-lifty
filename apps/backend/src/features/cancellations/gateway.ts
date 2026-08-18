export interface PaymentGateway {
  chargeFee(userId: string, amountArs: number, tripId: string): Promise<boolean>;
}

export const NoopGateway: PaymentGateway = {
  async chargeFee() {
    return false;
  },
};

let gateway: PaymentGateway = NoopGateway;

export function getPaymentGateway(): PaymentGateway {
  return gateway;
}

export function setPaymentGateway(next: PaymentGateway) {
  gateway = next;
}
