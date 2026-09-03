import { logger } from '../../shared/lib/logger';
import { sendPushToUser } from '../../shared/lib/push';

export const CANCEL_COPY = {
  free: 'Cancelación sin costo. ¿Confirmas?',
  fee_phase1: 'Cancelación con multa de $600. Se agregarán $600 a tu próximo viaje. ¿Confirmas?',
  fee_phase2: 'Cancelación con multa de $600. Se cobrarán $600 automáticamente. ¿Confirmas?',
} as const;

export function notifyFeeApplied(passengerId: string, tripId: string) {
  sendPushToUser(passengerId, {
    title: 'Viaje cancelado',
    body: 'Tu viaje fue cancelado. Se aplicó un cargo de $600 por cancelación tardía.',
    data: { trip_id: tripId, type: 'trip:cancelled' },
  });
}

export function notifyArrived(passengerId: string, tripId: string) {
  sendPushToUser(passengerId, {
    title: 'Tu conductor llegó',
    body: 'Tu conductor ha llegado al punto de encuentro. Tienes 5 minutos para subir.',
    data: { trip_id: tripId, type: 'trip:arrived' },
  });
}

export function notifyNoShow(passengerId: string, tripId: string) {
  sendPushToUser(passengerId, {
    title: 'Viaje cancelado',
    body: 'El conductor canceló el viaje por no-show. Se te cobrarán $600.',
    data: { trip_id: tripId, type: 'trip:cancelled' },
  });
}

export function notifyDebt(passengerId: string, amountArs: number, blocked: boolean) {
  sendPushToUser(passengerId, {
    title: blocked ? 'Cuenta bloqueada' : 'Aviso de deuda',
    body: blocked
      ? `Tienes $${amountArs} en deuda. No puedes solicitar viajes hasta regularizar tu saldo.`
      : `Has acumulado $${amountArs} en deuda por cancelaciones. Si llegas a $3000 no podrás solicitar viajes.`,
    data: { type: 'debt:warning', amount_ars: String(amountArs) },
  });
}

export function notifyCancelRateWarning(passengerId: string) {
  sendPushToUser(passengerId, {
    title: 'Advertencia de cancelaciones',
    body: 'Has cancelado más del 30% de tus viajes en los últimos 30 días. Si continúas, podrías ser suspendido.',
    data: { type: 'cancel_rate:warning' },
  });
}

export function notifyTvfWarning(driverUserId: string) {
  sendPushToUser(driverUserId, {
    title: 'Tasa de cancelación alta',
    body: 'Tu tasa de cancelación superó el 70%. Si llega al 95% o más, dejás de recibir ofertas hasta revisión de soporte.',
    data: { type: 'tvf:warning' },
  });
}

export function notifyPassengerCancelled(
  driverUserId: string,
  tripId: string,
  log?: {
    reason?: string | null;
    actor?: string | null;
    counts_for_tvf?: boolean | null;
    credit_driver?: boolean | null;
    fee_applied?: number | null;
  },
) {
  sendPushToUser(driverUserId, {
    title: 'Viaje cancelado',
    body: 'El pasajero ha cancelado el viaje.',
    data: {
      trip_id: tripId,
      type: 'trip:cancelled',
      ...(log
        ? {
            cancel_reason: String(log.reason ?? ''),
            cancel_actor: String(log.actor ?? ''),
            counts_for_tvf: String(log.counts_for_tvf ?? false),
            credit_driver: String(log.credit_driver ?? false),
            fee_applied: String(log.fee_applied ?? 0),
          }
        : {}),
    },
  });
}

export function notifyDriverCancelled(passengerId: string, tripId: string) {
  sendPushToUser(passengerId, {
    title: 'Viaje cancelado',
    body: 'El conductor canceló el viaje.',
    data: { trip_id: tripId, type: 'trip:cancelled' },
  });
}

export function broadcastToPassengerChannel(passengerId: string, trip: unknown) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return;
  fetch(`${url}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      messages: [{ topic: `passenger:${passengerId}`, event: 'trip:status', payload: trip }],
    }),
  }).catch((err) => logger.error('[BROADCAST] passenger status:', (err as Error).message));
}

export function broadcastDriverCancelled(driverId: string, trip: unknown) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return;
  fetch(`${url}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      messages: [{ topic: `driver:${driverId}`, event: 'trip:cancelled', payload: trip }],
    }),
  }).catch((err) => logger.error('[BROADCAST] cancel error:', (err as Error).message));
}
