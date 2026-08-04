import { create } from 'zustand';

type IconType = 'car' | 'moto' | 'camioneta' | 'person' | null;

function toIconType(vehicleType: string | null | undefined): IconType {
  if (!vehicleType) return null;
  switch (vehicleType) {
    case 'Auto':
    case 'car':
      return 'car';
    case 'Moto':
    case 'motorcycle':
    case 'moto':
      return 'moto';
    case 'Camioneta':
      return 'camioneta';
    default:
      return 'car';
  }
}

interface VehicleState {
  vehicleType: string | null;
  iconType: IconType;
  setVehicleType: (vehicleType: string | null) => void;
}

export const useVehicleStore = create<VehicleState>()((set) => ({
  vehicleType: null,
  iconType: null,
  setVehicleType: (vehicleType) => set({ vehicleType, iconType: toIconType(vehicleType) }),
}));
