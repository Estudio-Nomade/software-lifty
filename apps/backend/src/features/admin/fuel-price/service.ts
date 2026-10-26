import { broadcastPlatformConfigUpdated } from '../../../shared/lib/broadcast';
import {
  getFuelPriceHistory,
  getFuelPriceStatus,
  setFuelPrice,
} from '../../../shared/lib/fuel-pricing';

export const fuelPriceService = {
  async getStatus() {
    return getFuelPriceStatus();
  },

  async getHistory() {
    return getFuelPriceHistory();
  },

  async setPrice(
    data: { price: number; source?: string; notes?: string; force?: boolean },
    updatedBy: string,
  ) {
    const result = await setFuelPrice(data.price, {
      updatedBy,
      source: data.source ?? null,
      notes: data.notes ?? null,
      force: data.force ?? false,
    });
    broadcastPlatformConfigUpdated({ reason: 'fuel_price', price: data.price });
    return result;
  },
};
