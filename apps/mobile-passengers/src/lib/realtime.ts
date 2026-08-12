import { supabase } from './supabase';

export function subscribeToPassengerChannel(
  passengerId: string,
  onTripStatus: (trip: any) => void,
): () => void {
  const channel = supabase.channel(`passenger:${passengerId}`);

  channel.on('broadcast', { event: 'trip:status' }, ({ payload }) => {
    onTripStatus(payload);
  });

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      // connected
    }
  });

  return () => {
    supabase.removeChannel(channel);
  };
}
